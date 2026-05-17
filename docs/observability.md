# AgentGov Observability

AgentGov emits structured telemetry for every gate decision so that Centers of Excellence can monitor governance activity in real time and build dashboards from the data.

## Telemetry model

Every Trust Gate or Release Gate decision emits **one OpenTelemetry span** following the [GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) where applicable, plus AgentGov-specific attributes.

### Span shape

```jsonc
{
  "name": "agentgov.trust.decision" | "agentgov.release.decision",
  "trace_id": "<32-hex>",
  "span_id": "<16-hex>",
  "parent_span_id": "<16-hex>",
  "start_time_unix_nano": 1747531200000000000,
  "end_time_unix_nano": 1747531200340000000,
  "kind": "INTERNAL",
  "status": { "code": "OK" | "ERROR" },
  "attributes": {
    "agentgov.kind": "trust" | "release",
    "agentgov.decision_id": "trust-a073ec66c6d7b1c3" | "release-...",
    "agentgov.verdict": "ALLOW" | "ALLOW_SANITIZED" | "REVIEW" | "BLOCK" | "PASS" | "WARN",
    "agentgov.agent_id": "vendor-exception-agent-v1",
    "agentgov.agent_name": "Vendor Exception Agent",
    "agentgov.tenant_id": "<tenant>",
    "agentgov.policy_version": "2026-05-17",
    "agentgov.risk_score": 87,
    "agentgov.pass_rate": 62,
    "agentgov.critical_failures": 3,
    "agentgov.tool_call_failures": 1,
    "agentgov.policy_failures": 4,
    "agentgov.failure_categories": ["policy", "tool_call", "safety"],
    "agentgov.regression.pass_rate_delta_pp": -8,
    "agentgov.regression.new_failure_categories": ["safety"],
    "agentgov.latency_ms": 340,
    "agentgov.signature_valid": true,
    "agentgov.registry_match": true,
    "gen_ai.system": "agentgov",
    "gen_ai.operation.name": "governance.decision"
  },
  "events": [
    { "name": "policy.evaluated", "timestamp_unix_nano": "...", "attributes": { "rules_fired": 3 } },
    { "name": "decision.signed", "timestamp_unix_nano": "...", "attributes": { "alg": "HMAC-SHA-256" } },
    { "name": "decision.persisted", "timestamp_unix_nano": "...", "attributes": { "storage": "sqlite" } }
  ]
}
```

## Default sink

In local CLI mode, spans are written to JSONL at `outputs/spans.jsonl` (one span per line). This is the lowest-friction sink and works without any external infrastructure.

```bash
agentgov release check target-agents/vendor-exception.yaml --eval fixtures/eval-results/block.json
# After completion:
tail -n 1 outputs/spans.jsonl | jq
```

## OTLP export (production)

Set `OTEL_EXPORTER_OTLP_ENDPOINT` to ship spans over OTLP to your trace backend:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=https://your-collector.example.com:4318
export OTEL_EXPORTER_OTLP_HEADERS="api-key=<your-key>"
agentgov release check ...
```

Verified compatible with:
- Azure Monitor (Application Insights) via OTLP
- Grafana Tempo
- Honeycomb
- New Relic
- Datadog APM

## Recommended dashboards

For a Center of Excellence team running AgentGov in production, three dashboards cover 95% of operational visibility:

### 1. Governance volume

- Total decisions per hour, faceted by `agentgov.kind`
- Verdict mix: stacked bar of ALLOW / ALLOW_SANITIZED / REVIEW / BLOCK / PASS / WARN
- p50 / p95 / p99 `agentgov.latency_ms`

### 2. Risk surface

- Top 10 agents by BLOCK count this week
- Top 10 external agent sources triggering Trust Gate BLOCKs
- Failure-category distribution: `agentgov.failure_categories` counted
- New failure categories appearing in the last 24h (regression signal)

### 3. Policy hygiene

- Decisions per policy version (helps detect when a stale policy version is in active use)
- BLOCK-to-PASS ratio change across policy version transitions
- Pass-rate delta histogram (`agentgov.regression.pass_rate_delta_pp`) — should center near zero; rightward drift means agents are improving, leftward means regressions

## Sample alerts

| Alert | Condition | Severity |
|---|---|---|
| Trust BLOCK spike | Trust BLOCKs > 3× rolling 7-day baseline in any 1-hour window | Page |
| New failure category | An agent emits a `failure_categories[]` value not seen for that agent in the prior 14 days | Notify |
| Regression detected | `agentgov.regression.pass_rate_delta_pp` < -5 on a release decision | Page on critical-tier agents, notify otherwise |
| Stale policy version | A decision is made against a `policy_version` older than 90 days | Notify |
| Signature verification failure | `agentgov.signature_valid` == false | Page |
| Revocation activity | Any `revoked_at` recorded | Notify (low priority, high signal) |

## Correlation with Microsoft Purview

When deployed in a Microsoft 365 tenant, AgentGov decision spans can be correlated with Microsoft Purview AI Hub events using the `agentgov.agent_id` attribute. Purview emits its own activity records keyed on the Copilot Studio agent identifier; joining the two streams in your trace backend gives a complete view of "governance decision → runtime execution → audit event."

## Decision-record signature in spans

The `decision.signed` event includes the signing algorithm but **does not** include the signature value in the span. The signature is in the persisted record only — keeping it out of telemetry avoids accidental disclosure in observability backends that may have less strict access control than the audit store.

## Privacy of telemetry

Telemetry is subject to the same data-minimization rules as audit storage. See [`data-minimization.md`](data-minimization.md). Notably, `failures[].message` and `findings[].evidence` are NOT surfaced into span attributes — only structured categories and counts are. Free-text fields stay in the persisted record where access control is tighter than typical observability stacks.
