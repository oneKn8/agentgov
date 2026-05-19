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
  pass_rate?: number;
  critical_failures?: number;
  tool_call_failures?: number;
  policy_failures?: number;
  regression_pass_rate_delta_pp?: number;
  regression_new_failure_categories?: string[];
  trace_id?: string;
}

export function emitGateSpan(span: GateSpan, file = process.env.AGENTGOV_OTEL_FILE ?? "outputs/otel-spans.jsonl"): void {
  const trace_id = span.trace_id ?? cryptoRandomId();
  const attributes: Record<string, string | number | string[]> = {
    "gen_ai.system": "agentgov",
    "gen_ai.operation.name": span.name,
    "agentgov.tenant_id": span.tenant_id ?? "local",
    "agentgov.agent_id": span.agent_id ?? "unknown",
    "agentgov.verdict": span.verdict,
    "agentgov.latency_ms": span.latency_ms,
    "agentgov.failure_categories": span.failure_categories ?? [],
    "agentgov.policy_version": span.policy_version ?? "unknown"
  };
  addOptionalAttribute(attributes, "agentgov.pass_rate", span.pass_rate);
  addOptionalAttribute(attributes, "agentgov.critical_failures", span.critical_failures);
  addOptionalAttribute(attributes, "agentgov.tool_call_failures", span.tool_call_failures);
  addOptionalAttribute(attributes, "agentgov.policy_failures", span.policy_failures);
  addOptionalAttribute(attributes, "agentgov.regression.pass_rate_delta_pp", span.regression_pass_rate_delta_pp);
  addOptionalAttribute(attributes, "agentgov.regression.new_failure_categories", span.regression_new_failure_categories);

  const event = {
    trace_id,
    name: span.name,
    timestamp: new Date().toISOString(),
    attributes
  };
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(event)}\n`);
}

function addOptionalAttribute(
  attributes: Record<string, string | number | string[]>,
  key: string,
  value: number | string[] | undefined
): void {
  if (value !== undefined) {
    attributes[key] = value;
  }
}

function cryptoRandomId(): string {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}
