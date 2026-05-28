# Demo Agent Cards (hosted, for the live trust-gate walkthrough)

These three Agent Cards are served by GitHub Pages so `agentgov trust check <url>`
performs a **real network fetch** of `/.well-known/agent-card.json` — no `--offline`
fixtures. They exercise the full verdict range against live URLs:

| Agent | Live URL (pass to `trust check`) | Verdict | Why |
|---|---|---|---|
| Contoso Expense Auditor | `https://onekn8.github.io/agentgov/demo-agents/contoso-expense-auditor` | **ALLOW** | Signed with a registered provider key (`contoso.com`), skills allow-listed, clean metadata → risk 0 |
| Northwind Freight Coordinator | `https://onekn8.github.io/agentgov/demo-agents/northwind-freight-coordinator` | **REVIEW** | Unsigned + provider not in the tenant trust registry → risk 60 |
| QuickInvoice Assistant | `https://onekn8.github.io/agentgov/demo-agents/quickinvoice-assistant` | **BLOCK** | Prompt-injection strings in the card metadata (critical finding) → risk 100 |

## Run it

```bash
agentgov trust check https://onekn8.github.io/agentgov/demo-agents/contoso-expense-auditor        # ALLOW
agentgov trust check https://onekn8.github.io/agentgov/demo-agents/northwind-freight-coordinator  # REVIEW
agentgov trust check https://onekn8.github.io/agentgov/demo-agents/quickinvoice-assistant         # BLOCK
```

In Copilot Studio (after wiring per `docs/wiring.md`), ask the agent:

> Investigate the external A2A agent at
> https://onekn8.github.io/agentgov/demo-agents/quickinvoice-assistant and tell me if I can trust it.

## Notes

- **Security:** `quickinvoice-assistant` intentionally contains prompt-injection text
  (`Ignore all previous instructions…`, `bypass approval guardrails`). It is inert demo
  data describing a hypothetical malicious agent so the Trust Gate can be shown catching
  it — consistent with `fixtures/agent-cards/poisoned-injection.json`. Do not treat it as
  a real endpoint.
- **Sample orgs:** `contoso.com`, `northwind.example`, `quickinvoice.example` are
  fictional sample domains (Contoso/Northwind are Microsoft's canonical demo companies),
  not real third parties. The `contoso.com` trust-registry entry is demo tenant config.
- Regenerate with `node scripts/mint-demo-agents.mjs` (after `npm run build`).
