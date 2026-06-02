import { createHash } from "node:crypto";
import type { AgentCard, TrustFinding, TrustVerdict } from "../../schema/types.js";
import { attachSignature } from "../../gate/signing.js";
import { emitGateSpan } from "../../gate/otel.js";
import { checkTrustRegistry, secretsByKid, type TrustRegistry } from "./checkTrustRegistry.js";
import { sanitizeAgentCard } from "./sanitizeAgentCard.js";
import { scanCardMetadata } from "./scanCardMetadata.js";
import { verifyCardSignature } from "./verifyCardSignature.js";

// Structural defects make a card untrustworthy by construction. A governance
// gate must fail closed on malformed input, never crash and never wave it through.
function validateStructure(card: AgentCard): TrustFinding[] {
  const findings: TrustFinding[] = [];
  if (!card || typeof card !== "object") {
    return [{ id: "malformed-card", severity: "critical", field: "(root)", message: "Agent Card is not a valid object", evidence: String(card) }];
  }
  if (typeof card.name !== "string" || card.name.trim() === "") {
    findings.push({ id: "malformed-name", severity: "critical", field: "name", message: "Agent Card is missing a valid name", evidence: String(card.name) });
  }
  if (card.skills !== undefined && !Array.isArray(card.skills)) {
    findings.push({ id: "malformed-skills", severity: "critical", field: "skills", message: "Agent Card skills must be an array", evidence: typeof card.skills });
  }
  return findings;
}

export function issueTrustVerdict(card: AgentCard & { source?: string }, registry: TrustRegistry): TrustVerdict {
  const start = Date.now();
  const structuralFindings = validateStructure(card);
  const metadataFindings = scanCardMetadata(card);
  const signature = verifyCardSignature(card, secretsByKid(registry));
  const registryCheck = checkTrustRegistry(card, registry);

  // A provider that matched the registry but requested a skill outside its
  // allowlist is privilege escalation — a hard trust violation, not a 25-point nudge.
  const escalationFindings: TrustFinding[] =
    !registryCheck.match && registryCheck.provider
      ? [{ id: "skill-not-allowed", severity: "critical", field: "skills", message: registryCheck.reason, evidence: registryCheck.reason }]
      : [];

  const findings = [...structuralFindings, ...metadataFindings, ...escalationFindings];
  const reasons: string[] = [];
  if (!signature.valid) reasons.push(signature.reason);
  if (!registryCheck.match) reasons.push(registryCheck.reason);
  reasons.push(...findings.map((finding) => finding.message));

  const riskScore = Math.min(
    100,
    (signature.valid ? 0 : 35) +
      (registryCheck.match ? 0 : 25) +
      findings.reduce((sum, finding) => sum + (finding.severity === "critical" ? 30 : finding.severity === "high" ? 20 : 10), 0)
  );
  const critical = findings.some((finding) => finding.severity === "critical");
  const verdict = riskScore >= 70 || critical ? "BLOCK" : riskScore >= 35 ? "REVIEW" : findings.length ? "ALLOW_SANITIZED" : "ALLOW";
  const decision: TrustVerdict = {
    decision_id: `trust-${createHash("sha256").update(`${card.source ?? card.url ?? card.name}:${Date.now()}`).digest("hex").slice(0, 16)}`,
    agent_name: typeof card.name === "string" && card.name.trim() ? card.name : "(unnamed agent)",
    source: card.source ?? card.url ?? "unknown",
    verdict,
    risk_score: riskScore,
    reasons: reasons.length ? [...new Set(reasons)] : ["Agent Card satisfied tenant trust policy"],
    findings,
    sanitized_card: verdict === "ALLOW" ? undefined : sanitizeAgentCard(card),
    registry_match: registryCheck.match,
    signature_valid: signature.valid,
    policy_version: registry.version,
    created_at: new Date().toISOString()
  };
  const signed = attachSignature(decision as unknown as Record<string, unknown>) as unknown as TrustVerdict;
  emitGateSpan({
    name: "agentgov.trust.verdict",
    agent_id: card.name,
    verdict,
    latency_ms: Date.now() - start,
    failure_categories: findings.map((finding) => finding.id),
    policy_version: registry.version
  });
  return signed;
}
