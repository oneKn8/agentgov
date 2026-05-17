# AgentGov + Copilot Studio Wiring Guide

Step-by-step setup for connecting AgentGov to Microsoft Copilot Studio, Power Automate, and Dataverse / SharePoint. The CLI demo works without any of this — wiring is for production-equivalent deployment.

## Prerequisites

- **Power Apps Developer Plan** (free) — provides a Power Platform environment, Dataverse access, and a Microsoft work-style account. Sign up at https://www.microsoft.com/en-us/power-platform/products/power-apps/free. UTD `.edu` accounts work; personal Gmail/Outlook are rejected.
- **Copilot Studio individual trial** — activate at https://learn.microsoft.com/en-us/microsoft-copilot-studio/sign-up-individual after the Developer Plan provisions.
- **Node.js 22+** for running AgentGov locally.
- **A devtunnel** for exposing your local AgentGov MCP server to Copilot Studio (or deploy to Azure Container Apps for production).

## Step 1 — Deploy AgentGov

### Local (devtunnel) — fastest for demo

```bash
# In one terminal: start the MCP server
cd agentgov
AGENTGOV_REVOKE_TOKEN=demo-revoke-token npm run mcp:start
# Listening at http://localhost:3000/mcp

# In another terminal: expose via devtunnel
devtunnel host -p 3000 --allow-anonymous
# Note the public URL: https://abc-3000.devtunnels.ms
```

Your MCP endpoint becomes: `https://abc-3000.devtunnels.ms/mcp`.

If you expose the revocation API through the tunnel, send `x-agentgov-revoke-token: demo-revoke-token` on `POST /releases/{release_id}/revoke`. Without `AGENTGOV_REVOKE_TOKEN`, revocation is accepted only from loopback clients.

### Production — Azure Container Apps via `azd`

```bash
azd auth login
azd init    # accept defaults; name agentgov
azd up      # pick subscription + region (eastus or westus2)
```

`azd` provisions Azure Container Registry, Container Apps Environment, the Container App with external ingress on port 3000, and a Cosmos DB account (free tier). Output prints the public URL.

## Step 2 — Configure Copilot Studio agent

1. Navigate to https://copilotstudio.microsoft.com and create a new agent (or open an existing one).
2. **Settings → Generative AI → Orchestration** → set to **Generative**. This is required for MCP tools to be invokable by the orchestrator.
3. **Tools** tab → **Add a tool** → **New tool** → **Model Context Protocol**.
4. Fill the wizard:
   - **Server name:** `AgentGov`
   - **Description:** `Trust and release governance for multi-agent Copilot Studio systems. Use trust tools before delegating to external A2A agents. Use release tools before approving a release.`
   - **Server URL:** `https://abc-3000.devtunnels.ms/mcp` (or your `azd` URL)
   - **Authentication:**
     - For demo: **None**
     - For production: **OAuth 2.0 — Manual** with Entra (see Step 5)
5. Click **Create**. Copilot Studio auto-generates a Power Platform custom connector wrapping `/mcp`.
6. Click **Create a new connection** → sign in → **Add to agent**.
7. Verify tools are visible in the agent's Tools tab: `inspect_agent_card`, `verify_card_signature`, `check_trust_registry`, `scan_card_metadata`, `sanitize_agent_card`, `issue_trust_verdict`, `generate_release_tests`, `ingest_eval_results`, `assert_tool_calls`, `classify_release_risk`, `recommend_remediation`, `compose_release_packet`, `persist_decision`, `revoke_release`.

## Step 3 — System prompt

Paste this into the agent's instructions:

```
You are AgentGov, a governance agent for Copilot Studio multi-agent systems.

You operate two gates:

1. TRUST GATE — When a user asks about delegating to an external A2A agent, OR
   when invoked by another agent attempting delegation, invoke the trust tools
   in order: inspect_agent_card → verify_card_signature → check_trust_registry
   → scan_card_metadata → (optionally sanitize_agent_card) → issue_trust_verdict.
   Obey the verdict. Never bypass BLOCK or REVIEW.

2. RELEASE GATE — When a Copilot Studio maker asks "is my agent ready to
   release?" or provides an agent profile + eval results, invoke the release
   tools in order: generate_release_tests → ingest_eval_results →
   assert_tool_calls → classify_release_risk → recommend_remediation →
   compose_release_packet → persist_decision. Present the verdict and packet
   to the user.

For both gates, always cite the decision_id or release_id and the signature
field so the maker has the audit reference. Be conservative — when in doubt,
route to REVIEW or WARN rather than ALLOW or PASS.
```

## Step 4 — Test the wiring

In Copilot Studio's test pane, try:

```
Investigate the external A2A agent at this URL and tell me if I can trust it:
https://example.com/.well-known/agent-card.json
```

You should see the orchestrator invoke `inspect_agent_card`, then the subsequent trust tools in order, and finally return a verdict.

For the release gate:

```
I have a Vendor Exception Agent ready for release review. Profile is in
target-agents/vendor-exception.yaml and the eval results are at
fixtures/eval-results/block.json. Run the release gate and give me the packet.
```

The orchestrator should produce a BLOCK packet with the policy threshold breach + missing tool call findings.

## Step 5 — Entra OAuth (production only)

For a production MCP deployment, the AgentGov endpoint should require Entra OAuth.

1. **portal.azure.com → Microsoft Entra ID → App registrations → New registration**
2. Name: `agentgov-mcp-api`. Single tenant. Redirect URI: leave blank for now.
3. **Expose an API → Set Application ID URI** → `api://<your-app-id>` → **Add a scope**:
   - Scope name: `access_as_user`
   - Who can consent: **Admins and users**
   - Save.
4. **API permissions** → Add Microsoft Graph delegated permissions: `openid`, `profile`, `offline_access`.
5. **Certificates & secrets → New client secret** → copy the value (it's only shown once).
6. Back in Copilot Studio's MCP wizard, choose **OAuth 2.0 — Manual** and fill:
   - Client ID: the app-id from step 2
   - Client secret: from step 5
   - Authorization URL: `https://login.microsoftonline.com/<tenant-id>/oauth2/v2.0/authorize`
   - Token URL: `https://login.microsoftonline.com/<tenant-id>/oauth2/v2.0/token`
   - Scopes: `api://<app-id>/access_as_user openid profile offline_access`
7. Copy the **Redirect URI** Copilot Studio displays back to the Entra app's **Authentication → Redirect URIs (Web)**.
8. Re-test the connection — sign in with an account in the tenant, grant consent.

## Step 6 — Dataverse decision storage (optional)

By default AgentGov writes decision records to local SQLite. To switch to Dataverse:

1. In the Power Platform Admin Center, ensure your environment has a Dataverse database.
2. Create three custom tables in your solution:
   - `ag_release_decisions` with columns matching the `StoredDecision` schema (release_id, agent_id, verdict, payload_json, signature, idempotency_key, created_at, revoked_at, revoked_by, revoke_reason)
   - `ag_trust_verdicts` with the same shape keyed on decision_id
   - `ag_audit_events` for revocation entries
3. Generate a Dataverse Web API service principal connection.
4. Set environment variables in your AgentGov deployment:
   ```
   AGENTGOV_STORAGE=dataverse
   DATAVERSE_URL=https://<org>.crm.dynamics.com
   DATAVERSE_CLIENT_ID=<sp-id>
   DATAVERSE_CLIENT_SECRET=<sp-secret>
   DATAVERSE_TENANT_ID=<tenant>
   ```
5. Restart the MCP server. Decisions now persist to Dataverse.

## Step 7 — Power Automate Adaptive Card approval

The release packet can be routed to an owner via Power Automate.

1. Power Automate → Create → Automated cloud flow.
2. Trigger: **When a row is added to a Dataverse table** → table `ag_release_decisions` → filter rows: `verdict eq 'BLOCK' or verdict eq 'WARN'`.
3. Add action: **Post adaptive card and wait for a response** → recipient: dynamic field from `owner` column → card template: paste the JSON from `docs/adaptive-cards/release-verdict.json` (Batch 4 deliverable).
4. Add action: **Update a row** → set a `decision_status` column to the approver's response.
5. Save and test by inserting a row manually.

## Step 8 — Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Copilot Studio "Cannot reach server" | Devtunnel expired or local server stopped | Restart `devtunnel host` and `npm run mcp:start` |
| Tools show up but always return errors | OAuth flow failed | Re-check redirect URI in Entra matches the one Copilot Studio displayed; re-issue client secret if older than 90 days |
| `generative orchestration` toggle missing | Old Copilot Studio license or generative features disabled at tenant level | Confirm Power Platform admin has enabled generative AI features in admin center |
| `trust check` works locally but fails from Copilot Studio | Devtunnel `--allow-anonymous` not set, or auth required but no OAuth configured | Add `--allow-anonymous` flag, or complete Step 5 |
| Revocation returns `401` | Missing or incorrect `x-agentgov-revoke-token` header | Set `AGENTGOV_REVOKE_TOKEN` on the server and pass the same value in the request header |
| Dataverse writes fail | Service principal lacks table permissions | Grant the SP the **Basic User** + table-level Read/Create/Update on the three custom tables |
| Adaptive Card never delivers | Flow trigger filter not matching, or recipient field empty | Check Flow run history; verify `owner` column has a valid UPN |
