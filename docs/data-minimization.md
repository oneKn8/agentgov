# AgentGov Data Minimization

AgentGov is designed so that audit records are evidence of governance decisions, **not** copies of the sensitive content being governed. This document specifies what is stored, what is not, what is redacted, and how long it is retained.

## What is stored

| Field | In which record | Why |
|---|---|---|
| `decision_id` / `release_id` | TrustVerdict, ReleaseDecision | Idempotency + audit lookup |
| `agent_id`, `agent_name`, `source` | Both | Subject identification |
| `verdict` (ALLOW/BLOCK/PASS/WARN/etc.) | Both | The decision itself |
| `risk_score` (Trust), `pass_rate` (Release) | Both | Quantitative outcome |
| `reasons` | Both | Human-readable explanation list |
| `findings[]` / `failures[]` | Both | Structured rule-by-rule outcome with rule ID, severity, category, message, remediation |
| `evidence_ref` | ReleaseDecision | Opaque reference to the evaluation run (NOT the eval payload) |
| `policy_version` | Both | Version + hash of the policy file at decision time |
| `regression` summary | ReleaseDecision | Pass-rate delta, new failure categories, compared-runs count |
| `signature` | Both | HMAC over the JCS canonicalization of the rest of the record |
| `created_at` | Both | UTC timestamp |
| `revoked_at`, `revoked_by`, `revoke_reason` | StoredDecision (after revocation) | Revocation audit |
| `sanitized_card` (Trust only) | TrustVerdict | The cleaned-up name/description/skills the orchestrator may safely use |
| `owner`, `approval_deadline` | ReleaseDecision | Approver routing |

## What is NOT stored

- **Raw eval prompts and model outputs.** AgentGov ingests evaluation results as structured `EvalCaseResult` objects but does not persist full transcripts. The `evidence_ref` field is an opaque pointer to the upstream eval run, fetched on demand by an authorized consumer with their own permissions.
- **Raw external Agent Card body.** The TrustVerdict carries a `sanitized_card` (safe subset) but never the original poisoned payload. Findings cite short evidence snippets, not the full malicious text.
- **User prompts that triggered the agent.** If a release-gate decision is triggered from a Copilot Studio analytics export, only the structured eval result is ingested. End-user prompt text is not copied into the decision record.
- **HMAC signing secret.** Never logged, never serialized, never written to any persistence layer. Loaded from environment / Key Vault at process start.
- **Trust registry private key material.** AgentGov verifies signatures against public keys; it does not hold signing keys for external agents.

## Redaction at the boundary

`src/lib/redact.ts` runs immediately before any field is written to the storage adapter. It masks:

- Email addresses → `<email>`
- Phone numbers (E.164 + common North American formats) → `<phone>`
- Credit card numbers (Luhn-validated) → `<cc>`
- US Social Security Numbers → `<ssn>`
- API keys / Bearer tokens (`sk-...`, `Bearer ...`) → `<token>`

Redaction is applied to `findings[].evidence`, `failures[].message`, `failures[].remediation`, and `reasons[]`. The redaction implementation is deterministic and side-effect-free.

If a deploying organization needs stricter redaction (HIPAA-grade, GDPR Article 9 categories), the redaction module is pluggable via the `Storage.beforeWrite` hook.

## Retention

- **SQLite default storage:** records are retained indefinitely. The deploying organization is responsible for a retention policy (e.g., `DELETE FROM decisions WHERE created_at < datetime('now', '-7 years')`).
- **Dataverse adapter:** retention can be enforced via Dataverse data lifecycle rules.
- **SharePoint adapter:** retention via SharePoint retention labels at the list level.

The TrustVerdict and ReleaseDecision schemas include `created_at` to support time-based retention. Records do not embed expiry dates by default — that is a deployment choice.

## Audit completeness vs minimization tradeoffs

The default configuration prioritizes auditability. If the deploying organization needs to demonstrate *what* the agent did, evidence_ref → upstream eval run is the chain. If the organization needs to demonstrate *why a decision was made*, findings + policy_version + signature gives a self-contained record.

If full content reproduction is required (e.g., for regulator-grade forensic analysis), it must be enabled explicitly with `--retain-evidence-payload` and routed to an encrypted-at-rest, access-controlled audit store. **This mode is opt-in and is NOT recommended for production.**

## Data residency

AgentGov processes data on the deploying organization's infrastructure (local CLI or hosted Azure Container Apps). No data leaves the deployment boundary by default. Optional LLM-assisted features (failure-summary paraphrasing) make external API calls — disabled by default and explicitly opt-in via `llmAssistEnabled: true` in `infra/main.parameters.json`.

## EU AI Act Article 50 alignment

For agents that fall under Article 50 transparency obligations (effective 2026-08-02), the ReleaseDecision record provides the structured evidence Article 50 requires: agent identity, policy version, owner, decision verdict, regression history, and immutable signature. Combined with the upstream eval payload (held in the organization's existing audit store via `evidence_ref`), this satisfies the regulator-facing transparency chain without duplicating sensitive content inside AgentGov's audit log.
