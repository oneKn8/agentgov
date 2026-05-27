# AgentGov Adaptive Card templates

Adaptive Cards 1.5 templates for routing AgentGov verdicts to Microsoft Teams via Power Automate.

| File | Bind to | Trigger | Use |
|---|---|---|---|
| [`adaptive-card-trust-verdict.json`](adaptive-card-trust-verdict.json) | `TrustVerdict` JSON (`schemas/trust-verdict.schema.json`) | Trust Gate returns `REVIEW` | Human approver decides whether the Copilot Studio agent may delegate to this external A2A agent |
| [`adaptive-card-release-decision.json`](adaptive-card-release-decision.json) | `ReleaseDecision` JSON (`schemas/release-decision.schema.json`) | Release Gate returns `BLOCK` or `WARN` | Owner reviews failures + recommended fixes; approves release or requests changes |

## How to wire in Power Automate

1. **Trigger:** "When an HTTP request is received" → AgentGov posts the verdict JSON as the body
2. **Action:** "Post adaptive card and wait for a response" (Teams connector)
   - Recipient: `${owner}` (from the verdict payload) or a fixed channel
   - Message: paste the template contents
   - The Teams connector auto-binds `${variable}` placeholders to the body JSON
3. **Branch on response:** `Submit.data.action` is one of `approve` / `request_changes` / `allow` / `block`
4. **Persist back:** POST to `https://your-agentgov-host/releases/{release_id}/revoke` (Release path) or call `agentgov trust check` audit endpoint (Trust path)

## Template syntax notes

- Uses [Adaptive Cards Templating](https://learn.microsoft.com/en-us/adaptive-cards/templating/) (`${...}`, `$data`, `$when`)
- Verdict colors map to Container `style`:
  - Trust: `BLOCK` → `attention` (red), `REVIEW` → `warning` (amber), `ALLOW`/`ALLOW_SANITIZED` → `good` (green)
  - Release: `BLOCK` → `attention`, `WARN` → `warning`, `PASS` → `good`
- `$when` clauses hide empty sections so cards look right when `findings` / `recommended_fixes` are empty
- Iteration over `findings[]` and `failures[]` uses `$data` binding
- Optional `viewer_url` field (added to the payload by your flow) links the card back to the Verdict Inspector for that decision

## Render preview

Paste either JSON into <https://adaptivecards.io/designer/> with a sample TrustVerdict / ReleaseDecision (use the smoke-test outputs in `outputs/`) as the data context. The cards validate clean against Adaptive Cards v1.5 schema.
