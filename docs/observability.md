# AgentGov Observability

AgentGov emits structured OpenTelemetry-shaped JSONL telemetry for every Trust Gate and Release Gate decision so that Centers of Excellence can monitor governance activity, build dashboards, and correlate decisions with downstream runtime audit events. Both gates emit today; the emission-scope table below is authoritative.

This document is split into **what ships today** (verified against the engine at `src/gate/otel.ts` and the two call sites in `src/tools/trust/issueTrustVerdict.ts` + `src/tools/release/classifyReleaseRisk.ts`) and **what's on the roadmap** (planned, not wired). Anything not labelled "planned" is exercised by the smoke tests and the JSONL fixture at `outputs/otel-spans.jsonl`.

## What ships today

### Emission scope

| Gate | Emits spans? | Source |
|---|---|---|
| Trust Gate (`issue_trust_verdict`) | Yes — `agentgov.trust.verdict` | `src/tools/trust/issueTrustVerdict.ts` calls `emitGateSpan` after the verdict is signed |
| Release Gate (`classify_release_risk`) | Yes — `agentgov.release.verdict` | `src/tools/release/classifyReleaseRisk.ts` calls `emitGateSpan` after the classifier returns |

### Trust span shape (actual)

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

### Release span shape (actual)

Release verdicts emit the same base attributes plus the metrics the classifier already computes on `ReleaseDecision`:

```json
{
  "trace_id": "4f1a82d5c9e3b18e37d5f3a1",
  "name": "agentgov.release.verdict",
  "timestamp": "2026-05-19T02:11:34.512Z",
  "attributes": {
    "gen_ai.system": "agentgov",
    "gen_ai.operation.name": "agentgov.release.verdict",
    "agentgov.tenant_id": "local",
    "agentgov.agent_id": "vendor-exception-agent-v1",
    "agentgov.verdict": "BLOCK",
    "agentgov.latency_ms": 7,
    "agentgov.failure_categories": ["policy", "tool_call", "quality", "evidence", "safety"],
    "agentgov.policy_version": "policies/vendor-exception.yaml",
    "agentgov.pass_rate": 62,
    "agentgov.critical_failures": 7,
    "agentgov.tool_call_failures": 3,
    "agentgov.policy_failures": 3,
    "agentgov.regression.pass_rate_delta_pp": 0,
    "agentgov.regression.new_failure_categories": []
  }
}
```

### Attributes

Shared by both gates:

- `gen_ai.system` — always `"agentgov"`
- `gen_ai.operation.name` — same as the span name
- `agentgov.tenant_id` — defaults to `"local"` when unset
- `agentgov.agent_id` — see [the agent_id caveat](#caveat-agent_id-means-different-things-per-gate) below
- `agentgov.verdict` — Trust: `ALLOW` | `ALLOW_SANITIZED` | `REVIEW` | `BLOCK`; Release: `PASS` | `WARN` | `BLOCK`
- `agentgov.latency_ms` — measured by the tool from input to verdict
- `agentgov.failure_categories` — string array
- `agentgov.policy_version` — defaults to `"unknown"` when unset

Release-only (written via `addOptionalAttribute`, omitted from Trust spans so dashboards don't see misleading zeroes):

- `agentgov.pass_rate` — percentage from `ingest_eval_results`
- `agentgov.critical_failures`, `agentgov.tool_call_failures`, `agentgov.policy_failures` — counts emitted by `src/gate/classifier.ts`
- `agentgov.regression.pass_rate_delta_pp` — comparison vs prior release on the same agent (from `ReleaseDecision.regression`)
- `agentgov.regression.new_failure_categories` — string array (same source)

A `trace_id` is generated locally if the caller does not supply one; it is not yet linked to an inbound OTel context.

Two attributes named in earlier drafts of this doc — `agentgov.risk_score` for Release and `agentgov.signature_valid` / `agentgov.registry_match` — are intentionally **not** in the list above. The release classifier does not produce a numeric risk score, and signature/registry booleans are Trust-side concepts that today live only on the persisted `TrustVerdict`, not on the span. If Release Gate later adopts a unified risk score, that is a deliberate engine change, not a derivation from today's `classifier.ts`.

### Caveat: `agent_id` means different things per gate

The span attribute `agentgov.agent_id` carries:

- **Trust spans:** the agent **name** (e.g. `"Trusted Invoice Helper"`) because `SqliteStorage.saveTrustVerdict` keys the audit row on `verdict.agent_name`. `TrustVerdict` has no stable `agent_id` field on it today.
- **Release spans:** the stable agent **id** (e.g. `"vendor-exception-agent-v1"`) because `SqliteStorage.saveReleaseDecision` keys on `decision.agent_id`.

This is engine-consistent with the storage layer's keying (the viewer's join logic at `scripts/export-verdicts.mjs` depends on it) but a dashboard query like `GROUP BY agentgov.agent_id` will mix human display names from Trust with stable IDs from Release. If you build cross-gate aggregations, partition by `name` (`agentgov.trust.verdict` vs `agentgov.release.verdict`) first, then group within each. A future engine change adding a stable `agent_id` to `TrustVerdict` would let this unify; until then, partition.

### Default sink

In local CLI / MCP mode, spans are appended to JSONL at `outputs/otel-spans.jsonl` (one span per line). The path can be overridden with `AGENTGOV_OTEL_FILE`:

```bash
# Both gates emit on every verdict.
agentgov trust check fixtures/agent-cards/poisoned-injection.json --offline
agentgov release check target-agents/vendor-exception.yaml --eval fixtures/eval-results/block.json

tail -n 2 outputs/otel-spans.jsonl | jq
```

No external infrastructure is required — JSONL is the lowest-friction sink and works on an air-gapped laptop. The MCP smoke test (`scripts/mcp-smoke.mjs`) isolates telemetry into a temp file so test runs don't pollute the committed fixture.

### Privacy of telemetry

Telemetry follows the same data-minimization rules as audit storage. See [`data-minimization.md`](data-minimization.md). Notably:

- `failures[].message`, `findings[].evidence`, and `recommended_fixes[]` are **not** surfaced into span attributes — only structured categories and counts. Free-text fields stay in the persisted record where access control is tighter than typical observability stacks.
- Decision signatures are **not** included in spans. The signing algorithm is recorded in the persisted record only.

## Roadmap

The sections below describe planned observability features. The attribute schema above is intentionally chosen to be forward-compatible — dashboards and policies built against today's contract will survive these upgrades.

### Span events

The current implementation emits only top-level attributes. The planned shape adds an `events[]` array per OTel semantics:

```jsonc
"events": [
  { "name": "policy.evaluated",  "attributes": { "rules_fired": 3 } },
  { "name": "decision.signed",   "attributes": { "alg": "HMAC-SHA-256" } },
  { "name": "decision.persisted","attributes": { "storage": "sqlite" } }
]
```

### OTLP export

Today the only sink is JSONL on local disk. The planned OTLP path will read:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=https://your-collector.example.com:4318
export OTEL_EXPORTER_OTLP_HEADERS="api-key=<your-key>"
```

…and stream spans to a backend that accepts OTLP/HTTP. The attribute schema above is chosen to work without translation on:

- Azure Monitor (Application Insights) via the OTLP route
- Grafana Tempo
- Honeycomb
- New Relic
- Datadog APM

These targets are stated as design goals, not as tested integrations.

### Trace correlation with Microsoft Purview

When deployed in a Microsoft 365 tenant, AgentGov decision spans are intended to correlate with Microsoft Purview AI Hub events using `agentgov.agent_id`. Purview emits its own activity records keyed on the Copilot Studio agent identifier; joining the two streams gives a full view of governance decision → runtime execution → audit event. Correlation is a deployment-time wiring task on the customer's trace backend; AgentGov does not push to Purview directly. (This benefits from the unified `agent_id` change discussed in the [caveat above](#caveat-agent_id-means-different-things-per-gate).)

## Dashboards

Three dashboards cover 95% of operational visibility for a Center of Excellence running AgentGov in production. All three are computable from today's spans.

### 1. Governance volume

- Decisions per hour, faceted by span name (`agentgov.trust.verdict` vs `agentgov.release.verdict`)
- Verdict mix: stacked bar of ALLOW / ALLOW_SANITIZED / REVIEW / BLOCK / PASS / WARN
- p50 / p95 / p99 `agentgov.latency_ms`

### 2. Risk surface

- Top 10 agents by BLOCK count this week (partition by gate first — see the `agent_id` caveat)
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
| Trust BLOCK spike | Trust BLOCKs > 3× rolling 7-day baseline in any 1-hour window | Page | Yes |
| New failure category | An agent emits a `failure_categories[]` value not seen for that agent in the prior 14 days | Notify | Yes |
| Regression detected | `agentgov.regression.pass_rate_delta_pp` < -5 on a release decision | Page on critical-tier, notify otherwise | Yes |
| Stale policy version | A decision is made against a `policy_version` older than 90 days | Notify | Yes |
| Signature verification failure | `agentgov.signature_valid` == false | Page | Needs the `signature_valid` attribute (Trust-side roadmap) |
| Revocation activity | Any `revoked_at` recorded | Notify | Sourced from SQLite, not yet from spans |
