# Security Policy

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues, discussions, or pull requests.**

Instead, email **shifat.santo@example.com** (replace with your real address before publishing) with subject line `[agentgov-security]`. Include:

- A description of the vulnerability
- Steps to reproduce
- Affected version / commit SHA
- Potential impact
- Suggested mitigation (if any)

We aim to acknowledge reports within 72 hours and provide an initial assessment within 7 days.

## Scope

In scope:
- The AgentGov MCP server (`src/server.ts`) and tool implementations (`src/tools/**`)
- The CLI (`src/cli.ts`)
- The HMAC signing path (`src/gate/signing.ts`)
- The JCS canonicalization helper (`src/lib/jcs.ts`)
- The policy evaluation engine (`src/gate/ruleEngine.ts`)
- Storage adapters (`src/storage/**`)
- The redaction/data-minimization helpers (`src/lib/redact.ts`)
- Reference Bicep IaC in `infra/**`

Out of scope:
- Microsoft Copilot Studio internals
- The upstream A2A protocol implementation
- Azure tenant identity / Entra ID flows
- Third-party storage backends (Dataverse, SharePoint) under their own vendor responsibility models
- Anthropic / OpenAI / Google LLM provider security

## Threat model

See [`docs/threat-model.md`](docs/threat-model.md) for the full STRIDE analysis. The high-priority threats AgentGov defends against:

- **Poisoned A2A Agent Cards** — instruction-overriding text in `description`, `skills`, or `examples` fields
- **Unsigned / unverified external agents** — pinned trust registry with signature verification
- **Tampered audit records** — HMAC signatures over RFC 8785 canonicalized payloads
- **Policy downgrade attacks** — version + hash pinning in every decision record
- **Replay attacks** — idempotent persistence keyed on decision_id / release_id
- **Approver impersonation** — Entra-authenticated identity recorded, not card payload claims
- **PII / sensitive data leak in audit logs** — redaction hooks before persistence

## Disclosure policy

We follow coordinated disclosure:
1. Report received → acknowledged within 72 hours
2. Assessment + reproduction → within 7 days
3. Fix developed + tested → target 30 days for critical, 90 days for medium/low
4. Coordinated public disclosure with credit to the reporter (unless they request anonymity)

## Cryptographic dependencies

- HMAC-SHA-256 for decision signing (Node.js `node:crypto`)
- RFC 8785 JSON Canonicalization Scheme (in-tree implementation, `src/lib/jcs.ts`)
- JWS verification for A2A Agent Card signatures (in-tree, `src/lib/jws.ts`)

We do not currently bundle external cryptography libraries beyond the Node.js standard library.

## Acknowledgements

Reporters who follow this policy will be acknowledged in release notes unless they request anonymity.
