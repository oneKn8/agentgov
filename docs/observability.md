# AgentGov Observability

AgentGov is designed to emit structured telemetry for every gate decision so that Centers of Excellence can monitor governance activity, build dashboards, and correlate decisions with downstream runtime audit events. **Today the Trust Gate emits; Release Gate emission is on the [roadmap](#roadmap).** The emission-scope table below is authoritative.

This document is split into **what ships today** (verified against the engine at `src/gate/otel.ts`) and **what's on the roadmap** (planned, not wired). Anything not labelled "planned" is exercised by the smoke tests and the JSONL fixture at `outputs/otel-spans.jsonl`.

## What ships today

### Emission scope

| Gate | Emits spans? | Source |
|---|---|---|
| Trust Gate (`issue_trust_verdict`) | Yes | `src/tools/trust/issueTrustVerdict.ts` calls `emitGateSpan` after the verdict is signed |
| Release Gate | **Not yet** | Planned — see [Roadmap](#roadmap) |

### Span shape (actual)

`emitGateSpan` writes one JSON-line per Trust verdict. The exact shape, copied from a live run:

```json
{
  "trace_id": "ba53b32e772f219e37d4d596",
  "name": "agentgov.trust.verdict",
  "timestamp": "2026-05-17T21:25:55.734Z",
  "attributes": {
    "gen_ai.system": "agentgov",
    "gen_ai.operation.name": "agentgov.trust.verdict",
    "agentgov.tenant_id": "local",
    "agentgov.agent_id": "Invoice Helper",
    "agentgov.verdict": "BLOCK",
    "agentgov.latency_ms": 2,
    "agentgov.failure_categories": [
      "metadata-injection-1",
      "metadata-injection-2",
      "metadata-injection-3"
    ],
    "agentgov.policy_version": "2026-05-17"
  }
}
```

Implemented attributes:

- `gen_ai.system` — always `"agentgov"`
- `gen_ai.operation.name` — same as span name (`agentgov.trust.verdict` today)
- `agentgov.tenant_id` — defaults to `"local"` when unset
- `agentgov.agent_id` — defaults to `"unknown"` when unset
- `agentgov.verdict` — one of `ALLOW`, `ALLOW_SANITIZED`, `REVIEW`, `BLOCK`
- `agentgov.latency_ms` — measured by the tool
- `agentgov.failure_categories` — string array of finding categories
- `agentgov.policy_version` — defaults to `"unknown"` when unset

A `trace_id` is generated locally if the caller does not supply one; it is not yet linked to an inbound OTel context.

### Default sink

In local CLI / MCP mode, spans are appended to JSONL at `outputs/otel-spans.jsonl` (one span per line). The path can be overridden with `AGENTGOV_OTEL_FILE`:

```bash
# Trust Gate emits a span on every verdict.
agentgov trust check fixtures/agent-cards/poisoned-injection.json --offline

tail -n 1 outputs/otel-spans.jsonl | jq
```

No external infrastructure is required — JSONL is the lowest-friction sink and works on an air-gapped laptop.

### Privacy of telemetry

Telemetry follows the same data-minimization rules as audit storage. See [`data-minimization.md`](data-minimization.md). Notably:

- `failures[].message` and `findings[].evidence` are **not** surfaced into span attributes — only structured categories. Free-text fields stay in the persisted record where access control is tighter than typical observability stacks.
- Decision signatures are **not** included in spans. The signing algorithm is recorded in the persisted record only.

## Roadmap

The sections below describe planned observability features. They are written to the same shape AgentGov will adopt, so dashboards and policies built against this contract will be forward-compatible — but the emission code is not in `main` yet.

### Release Gate spans (planned)

Once the release verdict tool calls `emitGateSpan`, Release decisions will emit `agentgov.release.verdict` with the same base attributes plus the fields the engine already computes on `ReleaseDecision` (see `src/schema/types.ts`):

- `agentgov.pass_rate` — percentage from `ingest_eval_results`
- `agentgov.critical_failures`, `agentgov.tool_call_failures`, `agentgov.policy_failures` — counts emitted by `src/gate/classifier.ts`
- `agentgov.regression.pass_rate_delta_pp` — comparison vs prior release on the same agent (already on `ReleaseDecision.regression`)
- `agentgov.regression.new_failure_categories` — string array (same source)

Two attributes named in earlier drafts of this doc — `agentgov.risk_score` for Release and `agentgov.signature_valid` / `agentgov.registry_match` — are intentionally **not** in the list above. The release classifier does not produce a numeric risk score, and signature/registry booleans are Trust-side concepts. If Release Gate later adopts a unified risk score, that is a deliberate engine change, not a derivation from today's `classifier.ts`.

Tracking issue: open one before claiming pillar #8 in the README.

### Span events (planned)

The current implementation emits only top-level attributes. The planned shape adds an `events[]` array per OTel semantics:

```jsonc
"events": [
  { "name": "policy.evaluated",  "attributes": { "rules_fired": 3 } },
  { "name": "decision.signed",   "attributes": { "alg": "HMAC-SHA-256" } },
  { "name": "decision.persisted","attributes": { "storage": "sqlite" } }
]
```

### OTLP export (planned)

Today the only sink is JSONL on local disk. The planned OTLP path will read:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=https://your-collector.example.com:4318
export OTEL_EXPORTER_OTLP_HEADERS="api-key=<your-key>"
```

…and stream spans to a backend that accepts OTLP/HTTP. Once wired, the attribute schema above is intentionally chosen to work without translation on:

- Azure Monitor (Application Insights) via the OTLP route
- Grafana Tempo
- Honeycomb
- New Relic
- Datadog APM

These targets are stated as design goals, not as tested integrations.

### Trace correlation with Microsoft Purview (planned)

When deployed in a Microsoft 365 tenant, AgentGov decision spans are intended to correlate with Microsoft Purview AI Hub events using `agentgov.agent_id`. Purview emits its own activity records keyed on the Copilot Studio agent identifier; joining the two streams gives a full view of governance decision → runtime execution → audit event. Correlation is a deployment-time wiring task on the customer's trace backend; AgentGov does not push to Purview directly.

## Dashboards (when Release spans land)

Three dashboards cover 95% of operational visibility for a Center of Excellence running AgentGov in production. They assume the Roadmap items above are wired.

### 1. Governance volume

- Decisions per hour, faceted by span name (`agentgov.trust.verdict` vs `agentgov.release.verdict`)
- Verdict mix: stacked bar of ALLOW / ALLOW_SANITIZED / REVIEW / BLOCK / PASS / WARN
- p50 / p95 / p99 `agentgov.latency_ms`

### 2. Risk surface

- Top 10 agents by BLOCK count this week
- Top 10 external agent sources triggering Trust Gate BLOCKs
- Failure-category distribution: `agentgov.failure_categories` counted
- New failure categories appearing in the last 24h

### 3. Policy hygiene

- Decisions per policy version (detects stale-policy drift)
- BLOCK-to-PASS ratio across policy version transitions
- Pass-rate delta histogram (`agentgov.regression.pass_rate_delta_pp`)

## Sample alerts (target spec)

| Alert | Condition | Severity | Ships today? |
|---|---|---|---|
| Trust BLOCK spike | Trust BLOCKs > 3× rolling 7-day baseline in any 1-hour window | Page | Computable from today's spans |
| New failure category | An agent emits a `failure_categories[]` value not seen for that agent in the prior 14 days | Notify | Computable from today's spans |
| Regression detected | `agentgov.regression.pass_rate_delta_pp` < -5 on a release decision | Page on critical-tier, notify otherwise | Needs Release spans |
| Stale policy version | A decision is made against a `policy_version` older than 90 days | Notify | Computable from today's spans |
| Signature verification failure | `agentgov.signature_valid` == false | Page | Needs the `signature_valid` attribute |
| Revocation activity | Any `revoked_at` recorded | Notify | Sourced from SQLite, not yet from spans |
