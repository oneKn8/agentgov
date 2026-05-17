import type { AgentCard } from "../../schema/types.js";

export function sanitizeAgentCard(card: AgentCard): Pick<AgentCard, "name" | "description" | "url" | "provider" | "skills"> {
  return {
    name: sanitizeText(card.name).slice(0, 120),
    description: card.description ? sanitizeText(card.description).slice(0, 240) : undefined,
    url: card.url,
    provider: card.provider,
    skills: (card.skills ?? []).map((skill) => ({
      id: skill.id,
      name: sanitizeText(skill.name).slice(0, 120),
      description: skill.description ? sanitizeText(skill.description).slice(0, 240) : undefined
    }))
  };
}

function sanitizeText(text: string): string {
  return text
    .replace(/ignore (all )?(previous|prior|system) instructions/gi, "[removed instruction override]")
    .replace(/send .* (data|records|secrets|tokens?) to [^\s.]+/gi, "[removed exfiltration instruction]")
    .replace(/reveal .* (secret|token|prompt|system)/gi, "[removed secret request]")
    .replace(/bypass .* (approval|policy|guardrail)/gi, "[removed bypass instruction]")
    .trim();
}
