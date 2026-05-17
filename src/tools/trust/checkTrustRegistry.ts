import { readFileSync } from "node:fs";
import type { AgentCard } from "../../schema/types.js";
import { resolveWorkspaceFile } from "../../lib/paths.js";

export interface TrustedProvider {
  domain: string;
  kid?: string;
  secret?: string;
  allowedSkills?: string[];
  maxRisk?: number;
}

export interface TrustRegistry {
  version: string;
  trustedProviders: TrustedProvider[];
}

export function loadTrustRegistry(path = "trust-registry.json"): TrustRegistry {
  return JSON.parse(readFileSync(resolveWorkspaceFile(path), "utf8")) as TrustRegistry;
}

export function secretsByKid(registry: TrustRegistry): Record<string, string> {
  return Object.fromEntries(registry.trustedProviders.filter((p) => p.kid && p.secret).map((p) => [p.kid as string, p.secret as string]));
}

export function checkTrustRegistry(card: AgentCard, registry: TrustRegistry): { match: boolean; provider?: TrustedProvider; reason: string } {
  const cardUrl = typeof card.url === "string" ? card.url : "";
  const providerUrl = typeof card.provider?.url === "string" ? card.provider.url : "";
  const source = `${cardUrl} ${providerUrl}`;
  const provider = registry.trustedProviders.find((candidate) => source.includes(candidate.domain));
  if (!provider) return { match: false, reason: "No provider/domain match in tenant trust registry" };

  const cardSkillIds = new Set((card.skills ?? []).map((skill) => skill.id ?? skill.name));
  const disallowed = [...cardSkillIds].filter((skill) => provider.allowedSkills?.length && !provider.allowedSkills.includes(skill));
  if (disallowed.length > 0) {
    return { match: false, provider, reason: `Provider matched but skills are not allowed: ${disallowed.join(", ")}` };
  }
  return { match: true, provider, reason: "Provider and skills match tenant trust registry" };
}
