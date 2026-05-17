# Microsoft Agent Academy Hackathon — Submission (paste-ready)

Fill the GitHub issue at `https://github.com/microsoft/agent-academy/issues/new?template=hack-submission.yml`.

Auto-applied label: `submission`. Title pattern enforced: `Project: [Track] - [Project Name]`.

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

AgentGov is the open-source maker/CoE guardrail that produces those signed decisions. Trust gate verifies external A2A agent cards before delegation; Release gate verifies your own Copilot Studio agents before production release. Same MCP server. Same signed decision schema. Same Dataverse/SharePoint/SQLite decision table.

Target users: Copilot Studio makers, CoE teams, IT approvers in regulated industries (finance, healthcare, public sector).

## Agent Academy Modules Used

- Special Ops: `mcs-mcp` (Copilot Studio MCP Streamable HTTP integration)
- Special Ops: evaluation patterns and structured outputs
- Operative: agent orchestration, multi-step reasoning, agent flows
- ALM: solutions, environment-aware release, deployment discipline

## Architecture Overview

See architecture diagram: https://github.com/oneKn8/agentgov/blob/main/docs/architecture.png

One TypeScript MCP server exposing 14 tools across two governance gates (6 trust + 8 release), one CLI binary `agentgov`, one signed decision schema, one Dataverse/SharePoint/SQLite decision table.

Trust Gate flow: Copilot Studio agent attempts delegation → AgentGov fetches `/.well-known/agent-card.json` → verifies JWS signature against pinned trust registry → scans metadata for prompt injection → sanitizes if recoverable → returns ALLOW / ALLOW_SANITIZED / REVIEW / BLOCK with HMAC-signed verdict.

Release Gate flow: Copilot Studio maker requests release review → AgentGov ingests evaluation results + agent profile + policy YAML → asserts expected vs actual tool calls → evaluates policy rules with regression-over-time analysis → classifies failures by category and severity → produces PASS / WARN / BLOCK release packet (Markdown + HTML) → routes Adaptive Card to owner via Power Automate → persists signed decision to Dataverse / SharePoint / SQLite.

## Demo Video

https://youtube.com/... (replace before submitting)

5-minute walkthrough: trust gate blocks a poisoned external Agent Card → release gate blocks a Vendor Exception Agent that approved a $50K exception without policy lookup or finance approval → Adaptive Card approval routing → architecture overview → OSS CTA.

## Programming Language

TypeScript

## Key Technologies

- Microsoft Copilot Studio (Special Ops MCP integration)
- Model Context Protocol (Streamable HTTP transport)
- Microsoft Entra ID (OAuth 2.0 for production MCP auth)
- Microsoft Power Automate (Adaptive Card approval flow)
- Microsoft Dataverse / SharePoint (audit-grade decision storage adapters; SQLite default for local)
- Azure Container Apps (hosted MCP deployment)
- Azure Bicep (IaC with `tier: free | paid` parameter)
- OpenTelemetry GenAI semantic conventions (decision span instrumentation)
- RFC 8785 JSON Canonicalization Scheme (signature verification path)
- JWS signature verification for A2A Agent Cards
- HMAC-SHA-256 signed decisions (RFC 8785 canonical payload)

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
npm test
npm run test:smoke

# Trust Gate demo
agentgov trust check fixtures/agent-cards/poisoned-injection.json --offline
agentgov trust check fixtures/agent-cards/trusted-signed.json --offline

# Release Gate demo
agentgov release check target-agents/vendor-exception.yaml --eval fixtures/eval-results/block.json

# MCP server (Copilot Studio integration)
npm run mcp:start
```

Full Copilot Studio + Power Automate + Dataverse wiring instructions in `docs/wiring.md`.

## Technical Highlights

- **14 MCP tools across two governance gates.** 6 trust tools (inspect_agent_card, verify_card_signature, check_trust_registry, scan_card_metadata, sanitize_agent_card, issue_trust_verdict) + 8 release tools (generate_release_tests, ingest_eval_results, assert_tool_calls, classify_release_risk, recommend_remediation, compose_release_packet, persist_decision, revoke_release).
- **YAML policy-as-code engine** with unit tests at `policies/__tests__/`. Auditable, versionable, diff-able. Operators: equals, not_equals, gt, gte, lt, lte, includes, missing.
- **HMAC-signed decisions** over RFC 8785 (JCS) canonicalized payloads. Independently verifiable via `agentgov signature verify`.
- **Regression-over-time detection.** Each release decision compares against the last five releases of the same agent. Pass-rate drops ≥5pp or new failure categories trigger WARN even if absolute thresholds are met.
- **OpenTelemetry instrumentation** using GenAI semantic conventions. Every decision emits a span with tenant_id, agent_id, verdict, latency_ms, failure_categories, policy_version. Default sink: JSONL local file. OTLP export ready.
- **Idempotent persistence + revocation API.** Re-submitting the same `release_id` returns the same record. `agentgov release revoke <id>` appends an audit row without rewriting history.
- **Local-first storage.** SQLite default. Dataverse and SharePoint as adapters behind a clean `Storage` interface.
- **CLI + MCP parity.** Every capability exposed via both surfaces. CLI works without Copilot Studio for evaluation; MCP server wires into Copilot Studio when deployed.
- **$0/month free-tier validated.** Core decision path requires no paid LLM calls. Optional LLM-assisted features behind opt-in flag.
- **Explicit prior-art positioning.** README compares against Agent 365, EvalGateADO, sigstore-a2a, Purview, Guardrails AI/Lakera/Aporia — AgentGov is the missing maker layer, not a replacement for any of them.
- **Threat model + cost model + data-minimization docs.** STRIDE analysis covers poisoned cards, prompt injection, forged release requests, replay, MCP server compromise, approver impersonation, audit tampering, policy downgrade.

## Curriculum Feedback (Positive)

The `mcs-mcp` Special Ops mission was the perfect launchpad — the auto-generated custom connector wrapping `/mcp` is a clean abstraction. The new Agent Evaluation REST API documentation gave a precise contract to build the Release Gate's ingest path against. The Power Apps Developer Plan + Copilot Studio individual trial provided a zero-cost path to a usable tenant for solo builders. The A2A protocol GA in April 2026 created the exact open-protocol surface a maker-side trust guardrail needs.

## Curriculum Feedback (Negative)

Frontier-only features (Copilot Cowork Custom Skills using the Anthropic SKILL.md spec) are inaccessible for solo non-enterprise builders without a paid M365 Copilot license and Frontier admin opt-in. The governance lifecycle layer between EvalGateADO (CI) and Agent 365 (enterprise control plane) is currently undocumented as a maker-facing pattern — most curriculum focuses on building agents, not on the release-readiness or pre-delegation-trust steps. The Eval REST API and Multi-turn test surfaces are powerful but discovery is poor; the route from "I'm a maker" to "I can use the eval API in CI" needs a clearer landing page.

## Challenges & Learnings

- The fused trust + release product was originally split into two separate pitches. Cross-validation between two parallel research passes (one from each direction) converged on the fused product as the actual category enterprises need.
- A2A's optional-signing-but-mandatory-trust-policy split means a guardrail product can't just verify signatures; it has to enforce tenant policy, sanitize metadata, and produce a decision record. This shaped the verdict schema (ALLOW / ALLOW_SANITIZED / REVIEW / BLOCK) — three states would not have been enough.
- Regression-over-time was the hardest design call. A point-in-time threshold ("block if pass_rate < 90") is simple but misses regressions. Comparing against historical runs makes the gate operationally meaningful but adds a query path. The compromise: top-5 recent releases per agent, pass-rate-delta-pp + new-failure-categories signal, never block on regression alone but always WARN.
- Microsoft Agent 365 GA'd two weeks before submission. The positioning had to shift from "we cover what Microsoft doesn't" to "we feed Microsoft's control plane with maker-side evidence." Honest framing wins over claims of unilateral novelty.

## Contact

shifat.santo@example.com (replace with real address before submitting)
