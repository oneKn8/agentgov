export function healthPayload() {
  return {
    ok: true,
    service: "agentgov",
    version: "0.1.0",
    time: new Date().toISOString()
  };
}

export function readinessPayload() {
  return {
    ok: true,
    checks: {
      storage: "local-first-sqlite",
      trust_gate: "registered",
      release_gate: "registered"
    },
    time: new Date().toISOString()
  };
}
