import { readFileSync } from "node:fs";
import type { AgentCard } from "../../schema/types.js";

export async function inspectAgentCard(source: string, offline = false): Promise<AgentCard & { source: string }> {
  if (offline || source.endsWith(".json")) {
    const card = JSON.parse(readFileSync(source, "utf8")) as AgentCard;
    return { ...card, source };
  }

  const normalized = source.replace(/\/$/, "");
  const candidates = [`${normalized}/.well-known/agent-card.json`, `${normalized}/.well-known/agent.json`];
  let lastError: unknown;
  for (const url of candidates) {
    try {
      const response = await fetch(url, { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const card = (await response.json()) as AgentCard;
      return { ...card, source: url };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Could not fetch agent card from ${source}: ${String(lastError)}`);
}
