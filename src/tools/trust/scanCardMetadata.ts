import type { AgentCard, TrustFinding } from "../../schema/types.js";

const INJECTION_PATTERNS = [
  /ignore (all )?(previous|prior|system) instructions/i,
  /send .* (data|records|secrets|tokens?) to/i,
  /exfil/i,
  /reveal .* (secret|token|prompt|system)/i,
  /bypass .* (approval|policy|guardrail)/i
];

const URL_PATTERN = /https?:\/\/[^\s"')]+/gi;

export function scanCardMetadata(card: AgentCard): TrustFinding[] {
  const fields: Array<[string, string]> = [];
  if (card.description) fields.push(["description", card.description]);
  for (const [idx, skill] of (card.skills ?? []).entries()) {
    if (skill.description) fields.push([`skills.${idx}.description`, skill.description]);
    for (const [exampleIdx, example] of (skill.examples ?? []).entries()) {
      fields.push([`skills.${idx}.examples.${exampleIdx}`, example]);
    }
  }

  const findings: TrustFinding[] = [];
  for (const [field, text] of fields) {
    for (const pattern of INJECTION_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        findings.push({
          id: `metadata-injection-${findings.length + 1}`,
          severity: "critical",
          field,
          message: "Instruction-like prompt-injection text found in Agent Card metadata",
          evidence: match[0]
        });
      }
    }
    const urls = text.match(URL_PATTERN) ?? [];
    for (const url of urls) {
      findings.push({
        id: `metadata-url-${findings.length + 1}`,
        severity: "medium",
        field,
        message: "External URL present in orchestration metadata",
        evidence: url
      });
    }
  }
  return findings;
}
