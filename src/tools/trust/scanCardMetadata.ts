import type { AgentCard, TrustFinding } from "../../schema/types.js";

const INJECTION_PATTERNS = [
  /ignore (all )?(previous|prior|system) instructions/i,
  /disregard (all |the )?(previous|prior|earlier|above) (instructions|directives)/i,
  /forget (all |everything )?(previous|prior|earlier|you were told)/i,
  /send .* (data|records|secrets|tokens?) to/i,
  /forward .* (records?|data|secrets?|tokens?) to/i,
  /exfil/i,
  /reveal .* (secret|token|prompt|system)/i,
  /bypass .* (approval|policy|guardrail)/i
];

const URL_PATTERN = /https?:\/\/[^\s"')]+/gi;

// Fold homoglyphs / fullwidth characters to their canonical form and collapse
// exotic whitespace so injection text cannot hide behind Unicode tricks.
function normalize(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, " ");
}

export function scanCardMetadata(card: AgentCard): TrustFinding[] {
  const skills = Array.isArray(card.skills) ? card.skills : [];

  // Injection patterns run on every text-bearing field an attacker controls,
  // including the ones an orchestrator surfaces but the original scanner ignored
  // (name, provider.organization, skill name/id).
  const injectionFields: Array<[string, string]> = [];
  // URL detection only runs on free-text content fields to avoid flagging the
  // structural url/provider fields that are *expected* to contain URLs.
  const urlFields: Array<[string, string]> = [];

  const add = (lists: Array<Array<[string, string]>>, field: string, value: unknown): void => {
    if (typeof value === "string" && value.length > 0) {
      for (const list of lists) list.push([field, value]);
    }
  };

  add([injectionFields], "name", card.name);
  add([injectionFields, urlFields], "description", card.description);
  if (card.provider && typeof card.provider === "object") {
    add([injectionFields], "provider.organization", (card.provider as Record<string, unknown>).organization);
  }
  for (const [idx, skill] of skills.entries()) {
    if (!skill || typeof skill !== "object") continue;
    const s = skill as unknown as Record<string, unknown>;
    add([injectionFields], `skills.${idx}.id`, s.id);
    add([injectionFields], `skills.${idx}.name`, s.name);
    add([injectionFields, urlFields], `skills.${idx}.description`, s.description);
    const examples = Array.isArray(s.examples) ? s.examples : [];
    for (const [exampleIdx, example] of examples.entries()) {
      add([injectionFields, urlFields], `skills.${idx}.examples.${exampleIdx}`, example);
    }
  }

  const findings: TrustFinding[] = [];
  for (const [field, text] of injectionFields) {
    const normalized = normalize(text);
    for (const pattern of INJECTION_PATTERNS) {
      const match = normalized.match(pattern);
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
  }
  for (const [field, text] of urlFields) {
    const urls = normalize(text).match(URL_PATTERN) ?? [];
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
