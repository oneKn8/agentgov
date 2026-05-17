import { createHash } from "node:crypto";
import type { AgentCard, TrustVerdict } from "../../schema/types.js";
import { attachSignature } from "../../gate/signing.js";
import { emitGateSpan } from "../../gate/otel.js";
import { checkTrustRegistry, secretsByKid, type TrustRegistry } from "./checkTrustRegistry.js";
import { sanitizeAgentCard } from "./sanitizeAgentCard.js";
import { scanCardMetadata } from "./scanCardMetadata.js";
import { verifyCardSignature } from "./verifyCardSignature.js";

export function issueTrustVerdict(card: AgentCard & { source?: string }, registry: TrustRegistry): TrustVerdict {
  const start = Date.now();
  const metadataFindings = scanCardMetadata(card);
  const signature = verifyCardSignature(card, secretsByKid(registry));
  const registryCheck = checkTrustRegistry(card, registry);
  const reasons: string[] = [];
  if (!signature.valid) reasons.push(signature.reason);
  if (!registryCheck.match) reasons.push(registryCheck.reason);
  reasons.push(...metadataFindings.map((finding) => finding.message));

  const riskScore = Math.min(
    100,
    (signature.valid ? 0 : 30) +
      (registryCheck.match ? 0 : 25) +
      metadataFindings.reduce((sum, finding) => sum + (finding.severity === "critical" ? 30 : finding.severity === "high" ? 20 : 10), 0)
  );
  const critical = metadataFindings.some((finding) => finding.severity === "critical");
  const verdict = riskScore >= 70 || critical ? "BLOCK" : riskScore >= 35 ? "REVIEW" : metadataFindings.length ? "ALLOW_SANITIZED" : "ALLOW";
  const decision: TrustVerdict = {
    decision_id: `trust-${createHash("sha256").update(`${card.source ?? card.url ?? card.name}:${Date.now()}`).digest("hex").slice(0, 16)}`,
    agent_name: card.name,
    source: card.source ?? card.url ?? "unknown",
    verdict,
    risk_score: riskScore,
    reasons: reasons.length ? [...new Set(reasons)] : ["Agent Card satisfied tenant trust policy"],
    findings: metadataFindings,
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
    failure_categories: metadataFindings.map((finding) => finding.id),
    policy_version: registry.version
  });
  return signed;
}
