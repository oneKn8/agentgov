# AgentGov Threat Model

This document analyzes the adversarial surface of AgentGov and the controls in the current implementation. It uses STRIDE (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege) as the structuring lens.

**Scope.** AgentGov's CLI + MCP server, the YAML policy engine, signed decision records, and the storage adapters (SQLite default; Dataverse / SharePoint optional). Not in scope: Microsoft Copilot Studio internals, the underlying A2A protocol implementation, Azure tenant identity.

**Assumptions.**

- The HMAC signing secret is provisioned via secret manager (Azure Key Vault, env var sourced from KMS, etc.) and is not in source control.
- The trust registry (`trust-registry.json`) is curated by the deploying organization.
- The Copilot Studio tenant administrator controls who can register MCP tools.

---

## Asset inventory

| Asset | Sensitivity | Storage |
|---|---|---|
| HMAC signing secret | Critical | Secret manager / Key Vault |
| Trust registry pinned keys/domains | High (integrity) | `trust-registry.json` in repo, signed at deploy |
| Policy YAML (`policies/*.yaml`) | High (integrity) | Repo; hash-pinned in decision records |
| TrustVerdict records | High (audit evidence) | SQLite / Dataverse / SharePoint, signed |
| ReleaseDecision records | High (audit evidence) | SQLite / Dataverse / SharePoint, signed |
| Stored agent profiles | Medium | Repo or tenant data store |
| External Agent Cards (fetched) | Low-Medium (may carry attacker-controlled content) | In-memory, ephemeral |
| Eval results (ingested) | Medium (may carry sensitive prompts) | Pass-through, redacted at persistence boundary |

---

## STRIDE analysis

### S — Spoofing

| Threat | Vector | Control |
|---|---|---|
| Attacker hosts a malicious A2A endpoint impersonating a trusted vendor | Look-alike domain in Agent Card `url` / `provider.url` | `check_trust_registry` matches `provider.organization`, `provider.url`, and signature `kid` against pinned registry; mismatch produces `BLOCK` or `REVIEW` |
| Forged release submission by an actor who is not the agent owner | Posting `compose_release_packet` requests with arbitrary `owner` | `ReleaseDecision.owner` is validated against `AgentProfile.owner` loaded from the repo-side profile YAML; mismatch rejected |
| Approver impersonation in Adaptive Card flow | Replaying or forging the Adaptive Card response | Adaptive Card approval routes through Power Automate with Entra-authenticated user identity; AgentGov records `approver_upn` from the verified claim, not the card payload |
| MCP client impersonating a Copilot Studio agent | Direct curl to MCP `/mcp` endpoint | Production MCP deployment requires OAuth 2.0 with Entra (Manual flow, scope `api://<id>/access_as_user`); offline CLI mode requires local file access |

### T — Tampering

| Threat | Vector | Control |
|---|---|---|
| Attacker modifies a poisoned Agent Card payload in flight | MITM during card fetch | HTTPS-only fetch; `verify_card_signature` re-validates against pinned keys after fetch (RFC 8785 canonicalization) |
| Attacker rewrites a stored decision record to flip BLOCK → PASS | DB access or storage adapter compromise | Every record is HMAC-signed over its JCS-canonicalized payload (excluding `signature`); `agentgov signature verify` detects tampering |
| Attacker swaps policy file mid-flight | File system access | `ReleaseDecision.policy_version` records the policy version + hash at decision time; subsequent policy changes do not retroactively validate prior decisions |
| Policy downgrade attack (substitute a permissive older version) | Repo manipulation, tag rewrite | Policy `version` field is monotonic; `agentgov policy validate` flags non-monotonic version downgrades. Decisions store the policy hash, not just version string |

### R — Repudiation

| Threat | Vector | Control |
|---|---|---|
| Approver claims they did not sign off on a release | After-the-fact audit dispute | Decision record stores `approver_upn` from verified Entra claim, `approval_timestamp`, and a copy of the Adaptive Card body hash. Power Automate run history is independently auditable |
| Maker claims a release was never blocked | Audit dispute | All decisions are persisted **before** the maker is shown the verdict; revocation does not delete the original record, it appends a `revoked_at`/`revoked_by`/`revoke_reason` row |
| Org claims the signed audit log was lost | Storage disaster | Storage adapters write append-only; SQLite uses WAL mode; production Dataverse adapter writes to an audit-protected table |

### I — Information Disclosure

| Threat | Vector | Control |
|---|---|---|
| Sensitive prompts in eval results persisted to audit log | `ingest_eval_results` carries raw `EvalCaseResult.message` content | Redaction hook (`src/lib/redact.ts`) runs before persistence; PII patterns (email, phone, SSN, credit-card) are masked; full text never written to SQLite by default. See [`data-minimization.md`](data-minimization.md) |
| Attacker-controlled Agent Card description leaks into orchestrator prompt | LLM treats malicious description text as instructions | `scan_card_metadata` detects instruction-overriding patterns; `sanitize_agent_card` strips them; `issue_trust_verdict` returns `BLOCK` or `ALLOW_SANITIZED` |
| Decision records reveal more than necessary to downstream consumers | Over-broad evidence fields | Decision payload references evidence by `evidence_ref` (opaque ID), not full content; downstream consumers fetch evidence with their own authorization |
| Trust registry secrets leak via error messages | Stack traces in production | Errors are wrapped through a structured logger; signing-secret references are never serialized into errors |

### D — Denial of Service

| Threat | Vector | Control |
|---|---|---|
| Adversary submits Agent Card with 10MB malicious payload | Memory exhaustion in `inspect_agent_card` | Card fetch has a 256KB size cap; fields longer than 16KB are truncated with a `findings` note |
| Adversary submits eval results with 10M cases | Memory exhaustion in `ingest_eval_results` | Hard cap of 10,000 cases per release; excess rejected with structured error |
| MCP server flooded with concurrent requests | Resource exhaustion | Production deployment is fronted by Azure Container Apps with built-in autoscale + request throttling; CLI mode is single-process by design |
| Storage adapter slow → MCP timeouts cascade | Slow Dataverse / SharePoint backend | Decision persistence is asynchronous via a write-behind queue; verdict returns from in-memory + SQLite immediately, durable adapter writes happen in background |

### E — Elevation of Privilege

| Threat | Vector | Control |
|---|---|---|
| Low-privilege maker bypasses release gate by directly registering an MCP that approves itself | Tenant tools registry abuse | Copilot Studio MCP tool registration requires Power Platform admin role; AgentGov's `persist_decision` validates `agent_id` matches the registered profile owner |
| Attacker registers a malicious "trust registry" file as authoritative | Repo write access | Trust registry is loaded from a pinned path; production deployment fingerprints the file and refuses on mismatch |
| Revocation API used by anyone to nullify any release | Open `POST /releases/{id}/revoke` | Revocation requires the `x-agentgov-revoke-token` header (`AGENTGOV_REVOKE_TOKEN`) — a static bearer token compared in constant time via `timingSafeEqual` (`src/api/revoke.ts:19`). Optional loopback fallback when `AGENTGOV_ALLOW_LOOPBACK_REVOKE=true` restricts callers to `127.0.0.1` / `::1`. The body's required `actor` field is persisted in the audit row. Entra OAuth can be layered on top via the Copilot Studio connector (see `docs/wiring.md` Step 6) for production tenant identity. |

---

## Out of scope (acknowledged)

- **Side-channel attacks on the HMAC signing secret** — mitigated by storing in Key Vault and rotating per policy.
- **Compromised host operating system** — AgentGov assumes the host is trustworthy; container-level isolation is the responsibility of the deploying org.
- **Attacks on Copilot Studio itself** — Microsoft's responsibility under their shared-responsibility model.
- **Attacks on the underlying A2A protocol** — Tracked in `a2aproject/A2A` upstream; AgentGov inherits any improvements to the protocol's identity-verification mechanisms.

## Reporting vulnerabilities

See [`SECURITY.md`](../SECURITY.md). Do not file public GitHub issues for security reports.
