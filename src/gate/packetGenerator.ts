import type { ReleaseDecision } from "../schema/types.js";

export interface ReleasePacket {
  markdown: string;
  html: string;
}

export function composeReleasePacket(decision: ReleaseDecision): ReleasePacket {
  const title = `# AgentGov Release Packet: ${decision.agent_name}`;
  const failures = decision.failures
    .map((failure) => `- **${failure.severity.toUpperCase()} ${failure.category}**: ${failure.message}${failure.remediation ? `\n  - Fix: ${failure.remediation}` : ""}`)
    .join("\n");
  const fixes = decision.recommended_fixes.map((fix) => `- ${fix}`).join("\n") || "- No remediation required.";
  const markdown = `${title}

**Verdict:** ${decision.verdict}
**Pass rate:** ${decision.pass_rate}%
**Owner:** ${decision.owner}
**Approval deadline:** ${decision.approval_deadline}
**Evidence:** ${decision.evidence_ref}
**Signature:** ${decision.signature ?? "unsigned"}

## Root Causes
${decision.root_causes.map((cause) => `- ${cause}`).join("\n") || "- None"}

## Findings
${failures || "- None"}

## Required Fixes
${fixes}
`;
  const html = markdown
    .replace(/^# (.*)$/m, "<h1>$1</h1>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br />\n");
  return { markdown, html };
}
