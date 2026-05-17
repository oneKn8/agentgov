# AgentGov Cost Model

AgentGov is built to run at **$0/month** on free tiers for development, hackathon submissions, and individual makers. This document breaks down every cost component, the free-tier path, and the paid-tier upgrade paths for tenant deployments.

## Headline

**Local CLI + MCP server, SQLite storage, no paid LLM calls in the core decision path. Free path validated for up to ~500 decisions/day.**

The two governance gates make **deterministic** decisions:

- Trust Gate verdicts come from signature verification, registry matching, and rule-based metadata scanning. No LLM call required.
- Release Gate verdicts come from YAML policy evaluation, tool-call assertion, and statistical regression analysis. No LLM call required.

Optional LLM-assisted features (failure summarization, remediation paraphrasing, test-set creativity) are gated behind explicit flags and use a Bring-Your-Own-Key model.

---

## Per-decision cost breakdown

### Trust Gate verdict (one call to `issue_trust_verdict`)

| Component | Free tier | Paid tier |
|---|---|---|
| HTTP fetch of `/.well-known/agent-card.json` | $0 — egress on free hosting | $0 — egress within Azure Container Apps free 180,000 vCPU-seconds/month |
| JCS canonicalization + JWS signature verify | $0 — local CPU | $0 — local CPU |
| Trust registry match | $0 — local JSON read | $0 |
| Metadata scan (prompt-injection patterns) | $0 — regex + rule list | $0 |
| Sign verdict (HMAC) | $0 | $0 |
| Persist (SQLite) | $0 — local disk | Dataverse: ~$0.0001 / row at standard tier OR SharePoint: $0 within standard subscription |
| **Total per decision** | **$0** | **~$0.0001** |

### Release Gate verdict (one call to `compose_release_packet`)

| Component | Free tier | Paid tier |
|---|---|---|
| Load policy YAML + validate | $0 | $0 |
| Evaluate rules against context | $0 | $0 |
| Ingest eval results (Copilot Studio Eval API or local JSON) | Eval API free quota on Power Platform Developer Plan | Eval API: included in Copilot Studio license |
| Regression-over-time analysis (compare last N runs) | $0 — local SQLite query | $0 |
| Compose Markdown + HTML packet | $0 | $0 |
| Sign decision (HMAC) | $0 | $0 |
| Persist | $0 (SQLite) | ~$0.0001 (Dataverse) or $0 (SharePoint) |
| Optional: Adaptive Card via Power Automate | $0 within Power Automate free tier (90 day) | $15/user/month for premium connectors if needed |
| **Total per decision** | **$0** | **~$0.0001 + optional Power Automate seat** |

---

## Free-tier path (validated)

1. **Compute:** Local CLI binary OR Azure Container Apps free tier (180,000 vCPU-seconds + 360,000 GiB-seconds/month, ~enough for a single 0.25 vCPU / 0.5 GB instance running 24/7).
2. **Storage:** SQLite local file. No Cosmos DB, no Dataverse, no SharePoint required for MVP.
3. **Identity:** Power Apps Developer Plan (free) provides an Entra tenant for Copilot Studio integration.
4. **Eval:** Copilot Studio Evaluation API access via the Developer Plan.
5. **Approval flow:** Power Automate free tier (90 days), then SharePoint List + Outlook for $0 path.
6. **LLM calls:** None required. Optional Gemini 2.5 Flash for paraphrased remediation suggestions (free tier).

**Total monthly cost for a maker running AgentGov for one Copilot Studio agent: $0.**

---

## Paid-tier upgrades (tenant deployment)

| Capability | Why upgrade | Cost |
|---|---|---|
| Dataverse storage adapter | Tenant-wide governance dashboards, immutable audit table | $0 within Power Apps per-app plan; ~$10/user/month for tenant-wide |
| SharePoint Lists adapter | Reuse existing M365 license; no extra cost | $0 within standard M365 subscription |
| Azure Cosmos DB | Higher throughput than SQLite for >10k decisions/day | Free tier: 1000 RU/s + 25 GB. Beyond: ~$24/month per additional 100 RU/s |
| Premium Power Automate connectors | If Adaptive Card flow uses premium connectors | $15/user/month |
| Azure Key Vault for HMAC secret | Production secret rotation | $0.03 per 10,000 operations |
| OpenTelemetry backend (Azure Monitor, Grafana Cloud, Honeycomb) | Decision span trace visualization | Free tiers available; paid tiers start ~$0.50/GB ingested |
| Sigstore-keyless signing (post-MVP) | Move from HMAC to keyless cryptographic non-repudiation | $0 — GitHub OIDC + Sigstore public-good infrastructure |

---

## Cost ceiling at scale

A tenant running AgentGov for **1,000 Copilot Studio agents** with **10 release decisions per agent per month** + **100 trust-gate calls per agent per month**:

- Decisions: 1,000 × (10 + 100) = 110,000 decisions/month
- At ~$0.0001 / decision in Dataverse: ~$11/month
- Azure Container Apps: still within free tier
- Total: **~$11/month + existing M365 + Copilot Studio licensing**

The cost-per-decision economics are designed so that AgentGov never becomes the bottleneck for adoption.

---

## Why no paid LLM calls in the core path

LLM-based moderation services (Lakera, Guardrails AI, Aporia) charge per-token or per-request. At enterprise scale this is meaningful — a 1,000-agent tenant running 110,000 decisions/month at $0.001 per LLM moderation call would pay $110/month.

AgentGov keeps the core decision path **deterministic** because:

1. Cost should not scale with token usage when the underlying logic is rule-based.
2. Deterministic decisions are auditable in ways LLM judgments are not.
3. Latency is bounded — every decision returns in <500ms on commodity hardware.
4. Air-gapped deployments are possible (regulated industries, sovereign tenants).

LLM-assisted features (remediation suggestion paraphrasing, failure-category clustering for the dashboard, natural-language explanation of the verdict) remain available as optional layers with Bring-Your-Own-Key.

---

## Configuration

In `infra/main.parameters.json`:

```json
{
  "tier": { "value": "free" },
  "storage": { "value": "sqlite" },
  "llmAssistEnabled": { "value": false }
}
```

Set `tier: "paid"` to provision Cosmos DB + Key Vault + Log Analytics. Set `storage: "dataverse"` or `storage: "sharepoint"` to switch adapters. Set `llmAssistEnabled: true` to enable optional remediation paraphrasing (requires `GEMINI_API_KEY` env var).
