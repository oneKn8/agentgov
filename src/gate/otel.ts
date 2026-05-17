import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface GateSpan {
  name: string;
  tenant_id?: string;
  agent_id?: string;
  verdict: string;
  latency_ms: number;
  failure_categories?: string[];
  policy_version?: string;
  trace_id?: string;
}

export function emitGateSpan(span: GateSpan, file = process.env.AGENTGOV_OTEL_FILE ?? "outputs/otel-spans.jsonl"): void {
  const trace_id = span.trace_id ?? cryptoRandomId();
  const event = {
    trace_id,
    name: span.name,
    timestamp: new Date().toISOString(),
    attributes: {
      "gen_ai.system": "agentgov",
      "gen_ai.operation.name": span.name,
      "agentgov.tenant_id": span.tenant_id ?? "local",
      "agentgov.agent_id": span.agent_id ?? "unknown",
      "agentgov.verdict": span.verdict,
      "agentgov.latency_ms": span.latency_ms,
      "agentgov.failure_categories": span.failure_categories ?? [],
      "agentgov.policy_version": span.policy_version ?? "unknown"
    }
  };
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(event)}\n`);
}

function cryptoRandomId(): string {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}
