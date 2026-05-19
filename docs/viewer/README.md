# AgentGov Verdict Inspector

A zero-dependency static viewer for AgentGov Trust Gate and Release Gate decisions. Reads the local SQLite audit store and OTel span JSONL, joins them, and renders a single-page audit UI.

## Why this exists

The CLI prints verdicts to stdout. The MCP server returns them over JSON-RPC. Neither is readable as a judge or auditor reviewing a week of governance activity. This viewer reads `outputs/agentgov.db` directly and gives a UI on top of it — no separate service, no build step, no JavaScript bundle to fetch.

## Use

```bash
# 1. Generate some decisions
agentgov trust check fixtures/agent-cards/poisoned-injection.json --offline
agentgov trust check fixtures/agent-cards/trusted-signed.json --offline
agentgov release check target-agents/vendor-exception.yaml --eval fixtures/eval-results/block.json

# 2. Export decisions + spans into the viewer's data file
node scripts/export-verdicts.mjs

# 3. Open in a browser. Two options:
#    a) Any static-file server (verdicts.json must be served on the same origin)
python3 -m http.server --directory docs/viewer 8765
#    -> open http://localhost:8765
#
#    b) Or open docs/viewer/index.html directly via file://, but some browsers
#       (including recent Chrome) block fetch() from file:// origins. Use the
#       local server in (a) if the page shows "could not load verdicts.json".
```

## What it renders

- Six-up stats row: total decisions, trust count, release count, allow/pass count, block count, revoked count
- Filterable list: by kind, by verdict, by free-text search across subject / decision_id / verdict
- Detail panel for the selected decision, showing:
  - core fields (decision_id, kind, subject, verdict, created_at, idempotency_key, policy_version, HMAC signature)
  - kind-specific metrics — trust: risk_score, registry_match, signature_valid, source — release: pass_rate, risk_score, critical_failures, tool_call_failures, policy_failures
  - revocation banner when `revoked_at` is set
  - reasons / root causes list
  - recommended fixes list
  - findings (trust) and failures (release) with severity-coded left border
  - linked OTel span if found in `outputs/otel-spans.jsonl` (matched by `agent_id`, nearest timestamp)
  - raw JSON payload, collapsed by default

## Data contract

`docs/viewer/verdicts.json` (committed-out — regenerate locally) is produced by `scripts/export-verdicts.mjs` and has this shape:

```jsonc
{
  "generated_at": "<ISO timestamp>",
  "source_db": "<absolute path>",
  "source_spans": "<absolute path or null>",
  "db_size_bytes": 45056,
  "total_decisions": 13,
  "by_kind":    { "trust": 12, "release": 1 },
  "by_verdict": { "ALLOW": 6, "BLOCK": 6, "REVIEW": 1 },
  "revoked": 1,
  "decisions": [
    {
      "decision_id": "trust-...",
      "kind": "trust" | "release",
      "subject_id": "...",
      "verdict": "ALLOW" | "ALLOW_SANITIZED" | "REVIEW" | "BLOCK" | "PASS" | "WARN",
      "signature": "<base64url hmac>",
      "idempotency_key": "...",
      "revoked_at": "...",
      "revoked_by": "...",
      "revoke_reason": "...",
      "created_at": "...",
      "payload": { /* full structured verdict from src/schema/types.ts */ },
      "span":    { /* nearest matching OTel span, or null */ }
    }
  ]
}
```

The export script uses Node 22's built-in `node:sqlite` — no `better-sqlite3` install needed.

## What this is not

- Not a production dashboard. For shared/multi-tenant deployments, ship spans to Azure Monitor / Honeycomb / Tempo over OTLP (see `docs/observability.md` roadmap).
- Not a remote audit tool. The viewer reads a JSON dump on the same origin; it does not query the SQLite store live.
- Not a write surface. Revocation must still go through the API at `POST /releases/{release_id}/revoke` or the CLI `agentgov release revoke`.
