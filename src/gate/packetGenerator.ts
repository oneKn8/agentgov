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
  const html = renderReleasePacketHtml(decision);
  return { markdown, html };
}

function renderReleasePacketHtml(decision: ReleaseDecision): string {
  const findings = decision.failures.length
    ? `<ul>${decision.failures
        .map(
          (failure) =>
            `<li><strong>${escapeHtml(failure.severity.toUpperCase())} ${escapeHtml(failure.category)}</strong>: ${escapeHtml(failure.message)}${renderOptionalFix(failure.remediation)}</li>`
        )
        .join("")}</ul>`
    : "<p>None</p>";

  return `<h1>AgentGov Release Packet: ${escapeHtml(decision.agent_name)}</h1>
<dl>
<dt>Verdict</dt><dd>${escapeHtml(decision.verdict)}</dd>
<dt>Pass rate</dt><dd>${escapeHtml(String(decision.pass_rate))}%</dd>
<dt>Owner</dt><dd>${escapeHtml(decision.owner)}</dd>
<dt>Approval deadline</dt><dd>${escapeHtml(decision.approval_deadline)}</dd>
<dt>Evidence</dt><dd>${escapeHtml(decision.evidence_ref)}</dd>
<dt>Signature</dt><dd>${escapeHtml(decision.signature ?? "unsigned")}</dd>
</dl>
<h2>Root Causes</h2>
${renderList(decision.root_causes, "None")}
<h2>Findings</h2>
${findings}
<h2>Required Fixes</h2>
${renderList(decision.recommended_fixes, "No remediation required.")}`;
}

function renderList(items: string[], emptyText: string): string {
  return items.length
    ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : `<p>${escapeHtml(emptyText)}</p>`;
}

function renderOptionalFix(remediation?: string): string {
  return remediation ? `<br /><span>Fix: ${escapeHtml(remediation)}</span>` : "";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}
