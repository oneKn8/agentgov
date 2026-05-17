import { readFileSync } from "node:fs";
import type { AgentCard } from "../../schema/types.js";
import { resolveWorkspaceFile } from "../../lib/paths.js";

export async function inspectAgentCard(source: string, offline = false): Promise<AgentCard & { source: string }> {
  if (offline || !isHttpUrl(source)) {
    const card = JSON.parse(readFileSync(resolveWorkspaceFile(source), "utf8")) as AgentCard;
    return { ...card, source };
  }

  const candidates = source.endsWith(".json")
    ? [source]
    : [`${source.replace(/\/$/, "")}/.well-known/agent-card.json`, `${source.replace(/\/$/, "")}/.well-known/agent.json`];
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

function isHttpUrl(source: string): boolean {
  try {
    const url = new URL(source);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
