# Live Walkthrough Runbook — real Copilot Studio + real data

Goal: record a < 3-minute screen walkthrough of a **real** Copilot Studio agent invoking
AgentGov's governance tools over MCP, on **real** (non-fixture) data. Condensed from
`docs/wiring.md`; every command below was verified on 2026-05-28.

## Pre-verified (already done — no setup needed)
- MCP server runs authenticated; `/readyz` green, `/mcp` rejects without token, MCP
  `initialize` handshake succeeds with the token. Launch with **`bash scripts/serve-for-copilot.sh`**.
- Three **live** demo agent cards are hosted on GitHub Pages and return the full verdict range
  on real fetches (see `docs/demo-agents/`):

  | URL to give the agent | Verdict |
  |---|---|
  | `https://onekn8.github.io/agentgov/demo-agents/contoso-expense-auditor` | ALLOW (risk 0, signed + registered) |
  | `https://onekn8.github.io/agentgov/demo-agents/northwind-freight-coordinator` | REVIEW (risk 60, unsigned + unregistered) |
  | `https://onekn8.github.io/agentgov/demo-agents/quickinvoice-assistant` | BLOCK (risk 100, prompt-injection) |

## Step 0 — Provisioning (do first; propagation can take 15-60 min)
- Power Apps Developer Plan (free, **UTD .edu** — Gmail/Outlook rejected): https://www.microsoft.com/power-platform/products/power-apps/free
- Copilot Studio individual trial: https://learn.microsoft.com/microsoft-copilot-studio/sign-up-individual

## Step 1 — Expose AgentGov (your machine)
```bash
# Terminal A — start the authenticated server (prints the connector token)
bash scripts/serve-for-copilot.sh

# Terminal B — install devtunnel once, log in (your MS account), then host
curl -sL https://aka.ms/DevTunnelCliInstall | bash
devtunnel user login
devtunnel host -p 3000 --allow-anonymous     # copy the https://<id>-3000.devtunnels.ms URL
```

**Before wiring, confirm the endpoint is ready** (token + a real tool call — exactly what Copilot Studio does):
```bash
node scripts/mcp-http-check.mjs <devtunnel-url>/mcp "$AGENTGOV_MCP_TOKEN"   # expect: PASS — ready for Copilot Studio
```

## Step 2 — Wire Copilot Studio (your tenant)
`copilotstudio.microsoft.com` → new agent →
1. Settings → Generative AI → Orchestration → **Generative**.
2. Tools → Add a tool → New tool → **Model Context Protocol**.
3. Server name `AgentGov`; Server URL `<devtunnel-url>/mcp`; Auth = **No authentication** +
   advanced → Custom header `x-agentgov-mcp-token` = the token from Terminal A.
4. Create → Create a connection → Add to agent. Confirm the 14 tools appear.
5. Paste the system prompt from `docs/wiring.md` Step 4.

## Step 3 — Test before recording (real data)
In the Copilot Studio test pane:
```
Investigate the external A2A agent at this URL and tell me if I can trust it:
https://onekn8.github.io/agentgov/demo-agents/quickinvoice-assistant
```
Expect the orchestrator to call `inspect_agent_card` → trust chain → `issue_trust_verdict`
returning **BLOCK** with the injection findings and a signed `decision_id`. Repeat with the
`northwind-...` (REVIEW) and `contoso-...` (ALLOW) URLs for the full range.

Release gate:
```
Run the release gate on the Vendor Exception Agent: profile target-agents/vendor-exception.yaml,
eval results fixtures/eval-results/block.json. Give me the packet.
```
> **Real-data note for the release gate:** the vendor-exception scenario is realistic but
> scenario-authored. To make it fully real, eval your *own* agent (any real eval harness that
> emits pass/fail per test) and feed that JSON instead — the schema is `schemas/release-decision.schema.json`.
> The trust gate above is already 100% real (live fetches).

## Step 4 — Record
- OBS, full-screen browser on Copilot Studio, font ≥ 16pt, dark theme.
- Arc: hook (the two governance questions) → paste the BLOCK URL, watch tools fire live →
  show the signed verdict → ALLOW contrast → release-gate packet → revoke + open the Verdict
  Inspector (`https://onekn8.github.io/agentgov/viewer/`). Keep < 3 min.

## Gotchas (full table in `docs/wiring.md` Step 9)
- Generative orchestration toggle missing → tenant generative AI not enabled (admin center).
- "Cannot reach server" → devtunnel expired or server stopped.
- 401 on `/mcp` → connector header value doesn't match the token exactly.

## Backup
If anything blocks tonight, `videos/agentgov-demo-captioned.mp4` (captions-only, ~56s) is a
complete, submittable demo. Regenerate with `scripts/render-demo-video.sh`.
