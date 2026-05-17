import { readFileSync } from "node:fs";
import YAML from "yaml";
import type { AgentProfile } from "../schema/types.js";

export function loadAgentProfile(path: string): AgentProfile {
  const profile = YAML.parse(readFileSync(path, "utf8")) as AgentProfile;
  if (!profile.agent_id || !profile.name || !profile.owner || !Array.isArray(profile.tools)) {
    throw new Error(`Invalid agent profile: ${path}`);
  }
  return profile;
}
