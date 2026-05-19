import type { ReleaseDecision } from "../schema/types.js";

export interface ReleasePacket {
  markdown: string;
  html: string;
}

export function composeReleasePacket(decision: ReleaseDecision): ReleasePacket {
  const markdown = renderReleasePacketMarkdown(decision);
  const html = renderReleasePacketHtml(decision);
  return { markdown, html };
}

function renderReleasePacketMarkdown(decision: ReleaseDecision): string {
  const failures = decision.failures.length
    ? decision.failures
        .map(
          (failure) =>
            `- **${escapeMarkdownInline(failure.severity.toUpperCase())} ${escapeMarkdownInline(failure.category)}**: ` +
            `${escapeMarkdownInline(failure.message)}${renderOptionalMarkdownFix(failure.remediation)}`
        )
        .join("\n")
    : "- None";
  const fixes = renderMarkdownList(decision.recommended_fixes, "No remediation required.");

  return `# AgentGov Release Packet: ${escapeMarkdownInline(decision.agent_name)}

**Verdict:** ${escapeMarkdownInline(decision.verdict)}
**Pass rate:** ${escapeMarkdownInline(String(decision.pass_rate))}%
**Owner:** ${escapeMarkdownInline(decision.owner)}
**Approval deadline:** ${escapeMarkdownInline(decision.approval_deadline)}
**Evidence:** ${escapeMarkdownInline(decision.evidence_ref)}
**Signature:** ${escapeMarkdownInline(decision.signature ?? "unsigned")}

## Root Causes
${renderMarkdownList(decision.root_causes, "None")}

## Findings
${failures}

## Required Fixes
${fixes}
`;
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

function renderMarkdownList(items: string[], emptyText: string): string {
  return items.length
    ? items.map((item) => `- ${escapeMarkdownInline(item)}`).join("\n")
    : `- ${escapeMarkdownInline(emptyText)}`;
}

function renderOptionalMarkdownFix(remediation?: string): string {
  return remediation ? `\n  - Fix: ${escapeMarkdownInline(remediation)}` : "";
}

function escapeMarkdownInline(value: string): string {
  // Newlines are stripped before Markdown escaping, so line-start-only syntax
  // like headings, blockquotes, and list markers cannot escape the field.
  return escapeHtml(value)
    .replace(/\r?\n|\r/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/([`*_[\]()!|])/g, "\\$1");
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
