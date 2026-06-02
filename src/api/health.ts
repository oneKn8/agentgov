import { getStorage } from "../storage/sharedStorage.js";
import { isUsingDefaultSecret } from "../gate/signing.js";
import { loadTrustRegistry } from "../tools/trust/checkTrustRegistry.js";

export function healthPayload() {
  return {
    ok: true,
    service: "agentgov",
    version: "0.1.0",
    time: new Date().toISOString()
  };
}

export async function readinessPayload() {
  const checks = {
    storage: await checkStorage(),
    trust_registry: checkTrustRegistry(),
    trust_gate: "registered",
    release_gate: "registered"
  };
  return {
    ok: Object.values(checks).every((value) => value === "ok" || value === "registered"),
    // Informational: surfaces when decisions are signed with the public demo key
    // so operators know to set AGENTGOV_HMAC_SECRET before trusting signatures.
    signing_key: isUsingDefaultSecret() ? "default-demo-key" : "configured",
    checks,
    time: new Date().toISOString()
  };
}

async function checkStorage(): Promise<"ok" | "error"> {
  try {
    await getStorage();
    return "ok";
  } catch {
    return "error";
  }
}

function checkTrustRegistry(): "ok" | "error" {
  try {
    loadTrustRegistry();
    return "ok";
  } catch {
    return "error";
  }
}
