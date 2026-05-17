# AgentGov Parallel Build Contract

## Final Scope

AgentGov for Copilot Studio is one product with two governance gates:

- **Trust Gate:** verify external A2A agents before delegation.
- **Release Gate:** verify our own Copilot Studio agents before production release.

The product ships as a TypeScript MCP server plus a local CLI. The CLI must work even if Copilot Studio wiring is unavailable during recording.

## Branches

- `main`: stable integration branch.
- `codex/core-engine`: Codex-owned engine, CLI, MCP, schemas, storage, tests.
- `claude/docs-wiring`: Claude-owned docs, diagrams, IaC, Copilot Studio wiring, demo/submission assets.

Merge by PR when possible. If using direct pushes, pull/rebase before each work block.

## Ownership

Codex owns:

- `src/**`
- `schemas/**`
- `fixtures/**`
- `policies/**/*.test.ts`
- `package.json`, `package-lock.json`, `tsconfig.json`
- `.gitignore`

Claude owns:

- `README.md`
- `LICENSE`
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `docs/**`
- `infra/**`
- `azure.yaml`
- `.github/**`
- `policies/vendor-exception.yaml`
- `target-agents/vendor-exception.yaml`
- Adaptive Card and submission artifacts

Shared files require a note in the next sync message before editing.

## P0 Ship Criteria

- `agentgov trust check <card> --offline` emits signed trust verdict.
- `agentgov release check <profile> --eval <file>` emits signed release decision and packet.
- MCP server exposes Trust Gate and Release Gate tools.
- YAML policy engine evaluates Vendor Exception rules.
- SQLite persistence stores idempotent decisions.
- HMAC signature verification works.
- Smoke tests pass.
- README, threat model, prior-art matrix, cost model, and demo script exist.

## Framing

Do not pitch this as an eval runner or a generic security scanner.

Pitch:

> Verify external agents before delegation. Verify your own agents before release.

