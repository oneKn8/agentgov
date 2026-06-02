# Microsoft Agent Academy Hackathon — Submission (paste-ready)

Fill the GitHub issue at `https://github.com/microsoft/agent-academy/issues/new?template=hack-submission.yml`.

Auto-applied label: `submission`. Title pattern enforced: `Project: [Track] - [Project Name]`.

> **Pre-submit checklist.** Replace the demo video URL in §Demo Video, confirm the contact email in §Contact, and run `npm run test:smoke` once more on a clean checkout. Everything else below is copy-paste ready.

---

## Title

```
Project: Special Ops - AgentGov for Copilot Studio
```

## Contact consent

Yes (allow Microsoft to contact about this submission).

## Participation Track

Special Ops

## Project Name

AgentGov for Copilot Studio

## GitHub Username

oneKn8

## Repository URL

https://github.com/oneKn8/agentgov

## Problem Statement

Microsoft Copilot Studio shipped multi-agent A2A in April 2026 and Agent 365 on May 1, 2026. Two governance questions remain open for makers and Center of Excellence teams:

1. **Inbound trust:** Can my agent safely delegate to this external A2A agent?
2. **Outbound release:** Is my own agent trustworthy enough to ship to users?

Microsoft's tooling does not answer either for the maker. EvalGateADO gates PR merges; Agent 365 is the enterprise control plane; sigstore-a2a provides upstream signing; Purview audits the runtime. None produce the signed maker-side decision record that says "this agent is approved to ship" or "this external agent is approved to delegate to."

AgentGov is the open-source maker/CoE guardrail that produces those signed decisions. Trust Gate verifies external A2A agent cards before delegation; Release Gate verifies your own Copilot Studio agents before production release. Same MCP server, same signed decision schema, same local-first audit table (with Dataverse and SharePoint adapter interfaces ready for tenant deployment).

Target users: Copilot Studio makers, CoE teams, IT approvers in regulated industries (finance, healthcare, public sector).

## Agent Academy Modules Used

- Special Ops: `mcs-mcp` (Copilot Studio MCP Streamable HTTP integration)
- Special Ops: evaluation patterns and structured outputs
- Operative: agent orchestration, multi-step reasoning, agent flows
- ALM: solutions, environment-aware release, deployment discipline

## Architecture Overview

See architecture diagram: https://github.com/oneKn8/agentgov/blob/main/docs/architecture.svg (trust lifecycle: `docs/architecture-trust.svg`, release lifecycle: `docs/architecture-release.svg`).

One TypeScript MCP server exposing 14 tools across two governance gates (6 trust + 8 release), one CLI binary `agentgov`, one signed decision schema, one audit table (SQLite default; Dataverse and SharePoint adapter interfaces ship behind the `Storage` interface, planned for tenant deployment).

**Trust Gate flow:** Copilot Studio agent attempts delegation → AgentGov fetches `/.well-known/agent-card.json` → verifies the card signature (HMAC-SHA256 / JWS HS256 over RFC 8785 canonicalization, against a per-provider key pinned in the trust registry) → validates structural shape and fails closed on malformed cards → scans every attacker-controlled field (name, provider, skill name/id, description) for prompt injection with Unicode normalization → enforces the provider skill allowlist → sanitizes if recoverable → returns ALLOW / ALLOW_SANITIZED / REVIEW / BLOCK with an HMAC-signed verdict and an OpenTelemetry GenAI span.

**Release Gate flow:** Copilot Studio maker requests release review → AgentGov ingests evaluation results + agent profile + policy YAML → asserts expected vs actual tool calls → evaluates policy rules with regression-over-time analysis (last 5 release decisions for the same agent) → classifies failures by category and severity → produces a PASS / WARN / BLOCK release packet (HTML-escaped Markdown ready for Teams or Adaptive Card routing) → persists signed decision to the audit table.

**Audit trail:** every decision is browsable in a zero-dependency local viewer at `docs/viewer/` that reads the SQLite store + OTel JSONL and renders verdicts, signatures, findings, and linked spans. Regenerate with `node scripts/export-verdicts.mjs`; serve with `python3 -m http.server --directory docs/viewer 8765`.

## Demo Video

https://youtube.com/... (replace before submitting)

90-second walkthrough using `scripts/demo.sh`: Trust Gate blocks a poisoned external Agent Card → Trust Gate allows a signed registered card → Release Gate blocks a Vendor Exception Agent that approved a $50K exception without policy lookup or finance approval → revoke a release post-deployment → audit trail in the Verdict Inspector. Full narration in `docs/demo-script.md`.

## Programming Language

TypeScript

## Key Technologies

- Microsoft Copilot Studio (Special Ops MCP integration)
- Model Context Protocol (Streamable HTTP transport)
- Microsoft Entra ID (OAuth 2.0 for production MCP auth)
- Microsoft Power Automate + Adaptive Cards (approval flow target; lights up once Dataverse storage is wired)
- Microsoft Dataverse / SharePoint (adapter interfaces ship in `src/storage/`; SQLite is the default and wired today)
- Azure Container Apps (hosted MCP deployment via `azure.yaml` + Bicep at `infra/main.bicep` + `infra/workload.bicep`)
- Docker (multi-stage `Dockerfile` at the repo root, non-root runtime, named-volume SQLite persistence)
- Azure Bicep IaC with `tier: free | paid` parameter
- OpenTelemetry GenAI semantic conventions (Trust and Release verdicts both emit spans today; OTLP export on the roadmap, JSONL sink default)
- RFC 8785 JSON Canonicalization Scheme for HMAC-SHA-256 signature payload
- HMAC-SHA256 (JWS HS256) signature verification for A2A Agent Cards against per-provider keys pinned in the trust registry

## Submission Type

Individual

## Country / Region

United States

## Setup Summary

```bash
git clone https://github.com/oneKn8/agentgov.git
cd agentgov
npm install
npm run build
npm test && npm run test:smoke

# 90-second demo path (trust → release → revoke → viewer export)
bash scripts/demo.sh

# Or hand-run each gate
agentgov trust check fixtures/agent-cards/poisoned-injection.json --offline
agentgov trust check fixtures/agent-cards/trusted-signed.json --offline
agentgov release check target-agents/vendor-exception.yaml --eval fixtures/eval-results/block.json

# MCP server (Copilot Studio integration)
npm run mcp:start                  # http://localhost:3000/mcp

# Or via Docker (persistent SQLite, secrets via gitignored env-file)
docker build -t agentgov:local .
docker volume create agentgov-data
docker run --rm -p 3000:3000 -v agentgov-data:/data --env-file .env.agentgov agentgov:local

# Browse the audit trail
node scripts/export-verdicts.mjs
python3 -m http.server --directory docs/viewer 8765   # http://localhost:8765
```

Full Copilot Studio + Power Automate + Dataverse + Entra OAuth wiring in `docs/wiring.md`. Container Apps deploy via `azd up` documented in the same file.

## Technical Highlights

- **14 MCP tools across two governance gates.** 6 trust tools (`inspect_agent_card`, `verify_card_signature`, `check_trust_registry`, `scan_card_metadata`, `sanitize_agent_card`, `issue_trust_verdict`) + 8 release tools (`generate_release_tests`, `ingest_eval_results`, `assert_tool_calls`, `classify_release_risk`, `recommend_remediation`, `compose_release_packet`, `persist_decision`, `revoke_release`). End-to-end coverage verified by `scripts/mcp-smoke.mjs` against the real Streamable HTTP transport.
- **YAML policy-as-code engine** with unit tests in `policies/__tests__/`. Auditable, versionable, diff-able. Operators: equals, not_equals, gt, gte, lt, lte, includes, missing.
- **HMAC-signed decisions** over RFC 8785 (JCS) canonicalized payloads. Independently verifiable via `agentgov signature verify`. The HMAC secret is treated as a database encryption key — `docs/wiring.md` documents the persistence and rotation rules.
- **Regression-over-time detection.** Each release decision compares against the last 5 releases for the same agent. Pass-rate drops ≥5pp or new failure categories appearing trigger WARN even if absolute thresholds are met.
- **OpenTelemetry instrumentation.** Both Trust and Release verdicts emit spans (`agentgov.trust.verdict`, `agentgov.release.verdict`) using GenAI semantic conventions. 8 shared attributes + 6 release-only attributes including `pass_rate`, failure counts, and `regression.pass_rate_delta_pp`. JSONL sink default at `outputs/otel-spans.jsonl`; OTLP export is on the roadmap. Full attribute schema in `docs/observability.md`.
- **Local-first storage with Storage interface.** SQLite default at `outputs/agentgov.db`. `DataverseStorage` and `SharePointStorage` adapters exist as interface-conformant stubs in `src/storage/`; wiring those into `getStorage()` is documented as planned work in `docs/wiring.md`.
- **Idempotent persistence + revocation API.** Re-submitting the same `release_id` returns the existing record. `agentgov release revoke <id>` records revoke metadata (`revoked_at`, `revoked_by`, `revoke_reason`) in three separate columns on the existing row via a targeted `UPDATE` — `payload_json` and the HMAC `signature` are never touched, so the original verdict stays independently verifiable. The revoke columns themselves are not covered by the original signature (they didn't exist when it was computed); a separate `revoke_signature` is on the roadmap for tamper-evidence on the revoke metadata itself.
- **CLI + MCP parity.** Every capability exposed via both surfaces. CLI works without Copilot Studio for evaluation; MCP server wires into Copilot Studio when deployed.
- **Verdict Inspector.** Zero-dependency single-file static viewer at `docs/viewer/index.html`. Reads the local SQLite store + OTel JSONL via `scripts/export-verdicts.mjs`. Renders verdicts, signatures, findings, linked spans, and revocation banners. Built for judges who want to see the audit trail without running CLI commands.
- **Docker + Azure Container Apps deployment.** Multi-stage `Dockerfile` (Node 22 bookworm-slim, non-root `agentgov` user, named-volume `/data` for SQLite, `HEALTHCHECK` against `/healthz`). `azure.yaml` + Bicep template provision a Container App at `tier: free | paid` — free is scale-to-zero with no observability resources; paid adds Log Analytics + App Insights. Container ports aligned at 3000 across Docker, Container Apps, and the Node local path.
- **Free-tier cost path documented.** Core decision path requires no paid LLM calls; cost model and break-even analysis in `docs/cost-model.md`.
- **Explicit prior-art positioning.** README compares against Agent 365, EvalGateADO, sigstore-a2a, Purview, and runtime guardrails (Guardrails AI / Lakera / Aporia). AgentGov is the missing maker-side governance-lifecycle layer, not a replacement for any of them.
- **Threat model + cost model + data-minimization docs.** STRIDE coverage in `docs/threat-model.md` — poisoned cards, prompt injection, forged release requests, replay, MCP server compromise, approver impersonation, audit tampering, policy downgrade. Privacy-of-telemetry rules in `docs/data-minimization.md`.

## Curriculum Feedback (Positive)

The `mcs-mcp` Special Ops mission was the perfect launchpad — the auto-generated custom connector wrapping `/mcp` is a clean abstraction. The new Agent Evaluation REST API documentation gave a precise contract to build the Release Gate's ingest path against. The Power Apps Developer Plan + Copilot Studio individual trial provided a zero-cost path to a usable tenant for solo builders. The A2A protocol GA in April 2026 created the exact open-protocol surface a maker-side trust guardrail needs.

## Curriculum Feedback (Negative)

Frontier-only features (Copilot Cowork Custom Skills using the Anthropic SKILL.md spec) are inaccessible for solo non-enterprise builders without a paid M365 Copilot license and Frontier admin opt-in. The governance lifecycle layer between EvalGateADO (CI) and Agent 365 (enterprise control plane) is currently undocumented as a maker-facing pattern — most curriculum focuses on building agents, not on the release-readiness or pre-delegation-trust steps. The Eval REST API and multi-turn test surfaces are powerful but discovery is poor; the route from "I'm a maker" to "I can use the eval API in CI" needs a clearer landing page.

## Challenges & Learnings

- The fused trust + release product was originally split into two separate pitches. Cross-validation between two parallel research passes (one from each direction) converged on the fused product as the actual category enterprises need.
- A2A's optional-signing-but-mandatory-trust-policy split means a guardrail product can't just verify signatures; it has to enforce tenant policy, sanitize metadata, and produce a decision record. This shaped the verdict schema (ALLOW / ALLOW_SANITIZED / REVIEW / BLOCK) — three states would not have been enough.
- Regression-over-time was the hardest design call. A point-in-time threshold ("block if `pass_rate < 90`") is simple but misses regressions. Comparing against historical runs makes the gate operationally meaningful but adds a query path. The compromise: top-5 recent releases per agent, `pass_rate_delta_pp` + `new_failure_categories` signal, never block on regression alone but always WARN.
- Microsoft Agent 365 GA'd two weeks before submission. The positioning had to shift from "we cover what Microsoft doesn't" to "we feed Microsoft's control plane with maker-side evidence." Honest framing wins over claims of unilateral novelty.
- HMAC secret rotation is a footgun. With a persistent volume, regenerating `AGENTGOV_HMAC_SECRET` between runs silently invalidates every previously-signed decision — `agentgov signature verify` returns false on rows written under the old secret. The Docker/Node quickstarts now use a generated-once `.env.agentgov` file with rotation-rule callouts in three places.
- Doc honesty under cross-review pressure. A two-agent loop (Codex on the engine, Claude on docs, both reviewing each other) caught multiple drift points where docs claimed features the engine didn't ship: a Release Gate `risk_score` field that doesn't exist, an OTLP exporter that hasn't been written, a hello-world Bicep default that would have silently deployed the wrong container. Each got pulled back to engine reality before merge.

## Contact

shifatislamsanto764@gmail.com
