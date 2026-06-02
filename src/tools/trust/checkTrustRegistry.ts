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

function hostOf(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

// Exact host or a true subdomain of the trusted domain — never a substring or a
// look-alike suffix. `trusted.example.attacker.com` and `nottrusted.example` must
// NOT match `trusted.example`.
function hostMatchesDomain(host: string, domain: string): boolean {
  const d = domain.toLowerCase();
  return host === d || host.endsWith(`.${d}`);
}

export function checkTrustRegistry(card: AgentCard, registry: TrustRegistry): { match: boolean; provider?: TrustedProvider; reason: string } {
  const hosts = [hostOf(card.url), hostOf(card.provider?.url)].filter((host): host is string => host !== null);
  const provider = registry.trustedProviders.find((candidate) => hosts.some((host) => hostMatchesDomain(host, candidate.domain)));
  if (!provider) return { match: false, reason: "No provider/domain match in tenant trust registry" };

  const cardSkillIds = new Set((card.skills ?? []).map((skill) => skill.id ?? skill.name));
  const disallowed = [...cardSkillIds].filter((skill) => provider.allowedSkills?.length && !provider.allowedSkills.includes(skill));
  if (disallowed.length > 0) {
    return { match: false, provider, reason: `Provider matched but skills are not allowed: ${disallowed.join(", ")}` };
  }
  return { match: true, provider, reason: "Provider and skills match tenant trust registry" };
}
