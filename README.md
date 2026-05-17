# AgentGov for Copilot Studio

> **Verify external agents before delegation. Verify your own agents before release.**

AgentGov is an open-source governance layer for Microsoft Copilot Studio multi-agent systems. It ships as a single TypeScript MCP server with two governance gates and a local-first CLI.

- **Trust Gate** — Before your Copilot Studio agent delegates work to an external A2A agent, AgentGov fetches the external agent's [`/.well-known/agent-card.json`](https://github.com/a2aproject/A2A/blob/main/docs/specification.md), verifies its signature against a pinned trust registry, scans metadata for prompt injection, sanitizes if recoverable, and returns one of `ALLOW`, `ALLOW_SANITIZED`, `REVIEW`, or `BLOCK`.
- **Release Gate** — Before your own Copilot Studio agent ships to users, AgentGov generates a structured test set from the agent profile and policy YAML, ingests evaluation results from the [Copilot Studio Evaluation API](https://learn.microsoft.com/en-us/microsoft-copilot-studio/analytics-agent-evaluation-rest-api), asserts expected vs. actual tool calls, classifies failures with regression-over-time detection, and emits a `PASS` / `WARN` / `BLOCK` release packet with an HMAC-signed decision record and a human approval routed via Adaptive Card.

Every decision (trust or release) is signed, idempotent, instrumented with OpenTelemetry GenAI semantic conventions, and persisted to local SQLite by default — with Dataverse and SharePoint adapters available for tenant integration.

---

## Why now

Microsoft Copilot Studio shipped multi-agent A2A in April 2026 and [Agent 365](https://www.microsoft.com/en-us/security/blog/2026/05/01/microsoft-agent-365-now-generally-available-expands-capabilities-and-integrations/) on May 1, 2026. Two governance questions remain open for makers and Center of Excellence teams:

1. **Inbound trust:** Can my agent safely delegate to this external A2A agent?
2. **Outbound release:** Is my own agent trustworthy enough to ship to users?

Microsoft's existing tooling answers neither for the maker. AgentGov fills that maker/CoE layer.

---

## How AgentGov fits the existing stack

| Existing tool | What it does | Where AgentGov sits |
|---|---|---|
| **Microsoft Agent 365** | Enterprise control plane: agent inventory, permissions, behavior, audit | AgentGov **produces** the signed trust/release evidence Agent 365 governance programs consume |
| **EvalGateADO** ([sample](https://microsoft.github.io/CopilotStudioSamples/testing/evaluation/EvalGateADO/)) | Azure DevOps PR gate using Copilot Studio Evaluation API | EvalGateADO gates merges; AgentGov governs human release readiness with an approval packet and durable decision record |
| **sigstore-a2a** | Keyless A2A Agent Card signing (Sigstore/SLSA) | AgentGov consumes signed cards, applies tenant trust policy, sanitizes metadata, issues pre-delegation verdicts |
| **Microsoft Purview / Azure AI Content Safety** | Runtime input/output filtering | Adjacent. AgentGov sits in the governance lifecycle (pre-delegation + pre-release), not in the runtime data path |
| **Guardrails AI / Lakera / Aporia** | Runtime LLM moderation | Adjacent. AgentGov is governance-lifecycle, not runtime |

Full comparison: [`docs/prior-art.md`](docs/prior-art.md).

---

## Quickstart

```bash
git clone https://github.com/oneKn8/agentgov.git
cd agentgov
npm install
npm run build
```

### Trust Gate — verify an external A2A agent

```bash
# Poisoned card (prompt injection in description) → BLOCK
agentgov trust check fixtures/agent-cards/poisoned-injection.json --offline

# Trusted, signed card → ALLOW
agentgov trust check fixtures/agent-cards/trusted-signed.json --offline

# Live URL (production)
agentgov trust check https://agent.example.com
```

### Release Gate — verify your own Copilot Studio agent

```bash
# Block: $50K vendor exception approved without policy-lookup tool call + missing finance approval
agentgov release check target-agents/vendor-exception.yaml \
  --eval fixtures/eval-results/block.json

# Pass: same agent after remediation
agentgov release check target-agents/vendor-exception.yaml \
  --eval fixtures/eval-results/pass.json

# Revoke a release post-deployment (audit-logged)
agentgov release revoke <release_id> --reason "post-release regression"
```

### Policy as code

```bash
# Validate the policy YAML
agentgov policy validate policies/vendor-exception.yaml

# Run the policy unit tests
npm test
```

---

## MCP server (Copilot Studio integration)

```bash
npm run mcp:start
# AgentGov MCP listening at http://localhost:3000/mcp (Streamable HTTP)
```

In Copilot Studio:

1. Open your agent → **Settings → Generative AI** → set **Orchestration: Generative** (required for MCP).
2. **Tools** tab → **Add a tool** → **New tool** → **Model Context Protocol**.
3. Server URL: `https://<your-devtunnel>.devtunnels.ms/mcp`
4. Authentication: **None** (development) or **OAuth 2.0 Manual** with Entra (production).
5. Add the tools you need:
   - Trust Gate: `inspect_agent_card`, `verify_card_signature`, `check_trust_registry`, `scan_card_metadata`, `sanitize_agent_card`, `issue_trust_verdict`
   - Release Gate: `generate_release_tests`, `ingest_eval_results`, `assert_tool_calls`, `classify_release_risk`, `recommend_remediation`, `compose_release_packet`, `persist_decision`, `revoke_release`

Full Copilot Studio + Power Automate + Dataverse wiring: [`docs/wiring.md`](docs/wiring.md).

---

## Architecture

![AgentGov architecture](docs/architecture.png)

One MCP server, two tool families, one signed decision schema, one Dataverse / SharePoint / SQLite decision table.

- **Trust lifecycle:** [`docs/architecture-trust.png`](docs/architecture-trust.png)
- **Release lifecycle:** [`docs/architecture-release.png`](docs/architecture-release.png)

---

## What makes this production-grade

- **Policy as code.** Rules live in YAML with unit tests in [`policies/__tests__/`](policies/__tests__/). Auditable, versionable, diff-able.
- **Signed decisions.** Every `TrustVerdict` and `ReleaseDecision` carries an HMAC signature over the RFC 8785 (JCS) canonicalization of its payload. Verifiable independently via `agentgov signature verify`.
- **Threat model.** [`docs/threat-model.md`](docs/threat-model.md) covers poisoned cards, prompt injection, forged release requests, replay, MCP-server compromise, approver impersonation, audit tampering, and policy downgrade.
- **Cost model.** [`docs/cost-model.md`](docs/cost-model.md) documents the $0/month free-tier path. Core checks require no paid LLM calls.
- **Observability.** Every decision emits an OpenTelemetry span using [GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/). See [`docs/observability.md`](docs/observability.md).
- **Data minimization.** No raw sensitive payloads stored. Decisions reference evidence by ID; redaction hooks run before persistence. See [`docs/data-minimization.md`](docs/data-minimization.md).
- **Regression-over-time.** Release Gate compares current run against the last N releases of the same agent. A 5pp pass-rate drop or new failure category triggers a `WARN` even if absolute thresholds are met.
- **Idempotent decisions + revocation API.** `POST /releases/{id}/revoke` appends an audit entry without rewriting history.
- **Local-first.** SQLite is the default storage. Dataverse and SharePoint are adapters behind a `Storage` interface.

---

## Demo

5-minute demo walkthrough: [`docs/demo-script.md`](docs/demo-script.md).

```text
0:00 — Hook: two governance questions Copilot Studio doesn't answer for makers
0:25 — Act 1: Trust Gate blocks a poisoned external A2A agent
2:00 — Act 2: Release Gate blocks an unready Vendor Exception Agent
3:30 — Adaptive Card approval flow + Dataverse decision record
4:00 — Architecture: one MCP, two tool families, signed decisions
4:30 — OSS CTA
```

---

## Roadmap

- Sigstore-keyless decision signing via GitHub OIDC
- SLSA Level 3 provenance for the MCP server itself
- Cross-tenant trust registry (federated agent directory)
- Native Agent 365 webhook integration
- Bring-Your-Own-LLM mode for tenants prohibiting external LLM calls
- Community policy marketplace
- Regression-detector trained ML model

---

## License

MIT — see [`LICENSE`](LICENSE).

## Security

Found a vulnerability? See [`SECURITY.md`](SECURITY.md). Do not file public issues for security reports.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

---

## Built for

[Microsoft Agent Academy Hackathon 2026](https://microsoft.github.io/agent-academy/events/hackathon/) — Special Ops track.
