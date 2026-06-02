import type { AgentCard } from "../../schema/types.js";

export function sanitizeAgentCard(card: AgentCard): Pick<AgentCard, "name" | "description" | "url" | "provider" | "skills"> {
  const skills = Array.isArray(card.skills) ? card.skills : [];
  return {
    name: sanitizeText(card.name).slice(0, 120),
    description: card.description ? sanitizeText(card.description).slice(0, 240) : undefined,
    url: card.url,
    provider: card.provider,
    skills: skills.map((skill) => ({
      id: skill?.id,
      name: sanitizeText(skill?.name).slice(0, 120),
      description: skill?.description ? sanitizeText(skill.description).slice(0, 240) : undefined
    }))
  };
}

function sanitizeText(text: unknown): string {
  if (typeof text !== "string") return "";
  return text
    .replace(/ignore (all )?(previous|prior|system) instructions/gi, "[removed instruction override]")
    .replace(/send .* (data|records|secrets|tokens?) to [^\s.]+/gi, "[removed exfiltration instruction]")
    .replace(/reveal .* (secret|token|prompt|system)/gi, "[removed secret request]")
    .replace(/bypass .* (approval|policy|guardrail)/gi, "[removed bypass instruction]")
    .trim();
}
