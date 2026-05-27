# AgentGov + Copilot Studio Wiring Guide

Step-by-step setup for connecting AgentGov to Microsoft Copilot Studio, Power Automate, and Dataverse / SharePoint. The CLI demo works without any of this — wiring is for production-equivalent deployment.

## Prerequisites

- **Power Apps Developer Plan** (free) — provides a Power Platform environment, Dataverse access, and a Microsoft work-style account. Sign up at https://www.microsoft.com/en-us/power-platform/products/power-apps/free. UTD `.edu` accounts work; personal Gmail/Outlook are rejected.
- **Copilot Studio individual trial** — activate at https://learn.microsoft.com/en-us/microsoft-copilot-studio/sign-up-individual after the Developer Plan provisions.
- **Node.js 22+** for running AgentGov locally.
- **A devtunnel** for exposing your local AgentGov MCP server to Copilot Studio (or deploy to Azure Container Apps for production).

## Step 1 — Deploy AgentGov

### Local (Node) — for development

```bash
cd agentgov
npm run build          # tsc + schema export -> dist/

# Generate persistent secrets ONCE. Inline $(openssl rand -hex 32) on
# every invocation rotates the HMAC secret, which silently invalidates
# every TrustVerdict / ReleaseDecision sitting in outputs/agentgov.db.
# .env.agentgov is gitignored via the existing .env.* rule.
if [ ! -f .env.agentgov ]; then
  umask 077
  cat > .env.agentgov <<EOF
AGENTGOV_HMAC_SECRET=$(openssl rand -hex 32)
AGENTGOV_MCP_TOKEN=$(openssl rand -hex 32)
AGENTGOV_REVOKE_TOKEN=$(openssl rand -hex 32)
EOF
fi

# In one terminal: load secrets and start the MCP server
set -a; . ./.env.agentgov; set +a
npm run mcp:start
# Listening at http://localhost:3000

# In another terminal: expose via devtunnel
devtunnel host -p 3000 --allow-anonymous
# Note the public URL: https://abc-3000.devtunnels.ms
```

> **Rotation rule.** Treat `AGENTGOV_HMAC_SECRET` like a database encryption key: once decisions are persisted to SQLite, rotating the secret means existing rows cannot be verified by `agentgov signature verify` anymore. To rotate safely, keep the old secret reachable for retroactive verification, or re-issue every decision under the new secret. The "generate once, source thereafter" pattern above keeps the persisted audit trail verifiable across restarts.

### Local (Docker) — fastest reproducible demo

The repo ships a multi-stage `Dockerfile` at the root: build stage compiles TypeScript, runtime stage is `node:22-bookworm-slim` (small but not distroless — `apt`, shell, and glibc are present, which keeps the `HEALTHCHECK` `node -e fetch(...)` pattern viable). Runs as a non-root `agentgov` user, `/data` writable for SQLite, `HEALTHCHECK` against `/healthz`.

```bash
# Build the image (~1-2 min cold, <10s warm)
docker build -t agentgov:local .

# Generate persistent secrets ONCE (same .env.agentgov as the Node path —
# one file, two consumers). Inline -e VAR="$(openssl rand ...)" on each
# docker run would rotate AGENTGOV_HMAC_SECRET, invalidating every signed
# decision in the persistent /data volume.
if [ ! -f .env.agentgov ]; then
  umask 077
  cat > .env.agentgov <<EOF
AGENTGOV_HMAC_SECRET=$(openssl rand -hex 32)
AGENTGOV_MCP_TOKEN=$(openssl rand -hex 32)
AGENTGOV_REVOKE_TOKEN=$(openssl rand -hex 32)
EOF
fi

# Run with a named volume for persistent SQLite + secrets via env-file
docker volume create agentgov-data
docker run --rm -p 3000:3000 \
  -v agentgov-data:/data \
  --env-file .env.agentgov \
  agentgov:local
# Listening at http://localhost:3000, SQLite at /data/agentgov.db inside the volume

# Expose via devtunnel (in a separate terminal)
devtunnel host -p 3000 --allow-anonymous
```

> **Rotation rule (Docker edition).** Same as the Node path: if you regenerate `.env.agentgov` between `docker run` invocations, the persistent `agentgov-data` volume retains decisions signed under the old `AGENTGOV_HMAC_SECRET` that the new run cannot verify. Either keep the env file stable for the life of the volume, archive each rotation's secret alongside its decision range, or `docker volume rm agentgov-data` before rotating so the audit trail starts clean.

> **Why a named volume, not a bind mount.** The container runs as a non-root `agentgov` user created with `useradd --system`, so the UID is allocated from the system range (typically 100–999 on Debian/`bookworm-slim`) — it is **not** guaranteed to be `1000`. A named Docker volume inherits the container's uid/gid automatically and avoids the host/container UID mismatch entirely. If you must bind-mount a host directory (e.g. for inspecting `agentgov.db` from the host), inspect the uid first with `docker run --rm agentgov:local id agentgov` and `chown` to whatever it prints, or run the container as the host user with `--user "$(id -u):$(id -g)"`.

> **Fixtures baked in.** The image includes `fixtures/`, `policies/`, and `target-agents/` so all CLI/MCP demo paths work out of the box without bind-mounting the repo. This includes `fixtures/agent-cards/poisoned-injection.json`, which is intentional test content but contains prompt-injection strings; treat the image as a demo artifact, not a production base layer to inherit from.

The four HTTP surfaces become:

| Endpoint | Method | Purpose |
|---|---|---|
| `https://abc-3000.devtunnels.ms/mcp` | POST | MCP Streamable HTTP — all 14 tools |
| `https://abc-3000.devtunnels.ms/healthz` | GET | Liveness — `{ ok, service, version, time }` |
| `https://abc-3000.devtunnels.ms/readyz` | GET | Readiness — checks storage + trust registry + tool registration |
| `https://abc-3000.devtunnels.ms/releases/{release_id}/revoke` | POST | Supersede a prior release decision |

See **Step 2 — Authentication** below for the headers Copilot Studio must send on every `/mcp` and `/releases/.../revoke` call.

### Production — Azure Container Apps via `azd`

The repo ships an `azd`-compatible `azure.yaml` plus a Bicep template at `infra/main.bicep` + `infra/workload.bicep`, and a `Dockerfile` at the root. `azd up` is the single command — azd handles build, push, and provision in order:

1. `azd package` (called implicitly by `azd up`) builds the Dockerfile remotely via `docker.remoteBuild: true` in `azure.yaml` and pushes it to an azd-managed Azure Container Registry, then sets `SERVICE_API_IMAGE_NAME` to the resulting tag.
2. `azd provision` runs Bicep with that env var substituted into the `containerImage` param via `infra/main.parameters.json`.
3. `azd deploy` updates the running Container App's image to match.

```bash
azd auth login
azd init                          # accept defaults; name agentgov
azd env set AGENTGOV_TIER paid    # 'free' = scale-to-zero, no observability; 'paid' = min=1 + Log Analytics + App Insights
azd env set AGENTGOV_MCP_TOKEN "$(openssl rand -hex 32)"
azd env set AGENTGOV_REVOKE_TOKEN "$(openssl rand -hex 32)"

azd up                            # pick subscription + region (eastus or westus2)
```

**Skip the azd remote build** (operators with a pre-built image — CI-published GHCR tag, ACR mirror, etc.):

```bash
azd env set SERVICE_API_IMAGE_NAME myacr.azurecr.io/agentgov:0.1.0
azd up                            # azd skips the build, binds the running container to your image
```

The Bicep template enforces `@minLength(1)` on the `containerImage` param with no default. Without azd's auto-injection or an explicit `SERVICE_API_IMAGE_NAME` override, `az deployment` fails fast with a clear Bicep validation error. This intentionally replaces the previous `mcr.microsoft.com/azuredocs/containerapps-helloworld:latest` default, which would have silently provisioned a healthy-looking hello-world container on the production FQDN.

What `azd up` actually provisions (per `infra/workload.bicep`):

- Container Apps Environment (Consumption workload profile)
- Container App on port 3000 — same port the Dockerfile defaults to and the local `npm run mcp:start` listens on, so the image runs identically in every environment — with `/healthz` liveness + `/readyz` readiness probes
- Container Apps secrets carrying `AGENTGOV_MCP_TOKEN` and `AGENTGOV_REVOKE_TOKEN`
- When `tier=paid`: Log Analytics workspace + Application Insights component, with `APPLICATIONINSIGHTS_CONNECTION_STRING` wired into the container

What it does **not** provision (intentional, to keep `tier=free` actually free):

- No standalone Azure Container Registry beyond what `azd` creates for itself — bring your own image if you'd rather, via `azd env set SERVICE_API_IMAGE_NAME <your-image-ref>` before `azd up`.
- No managed database — AgentGov writes decision records to local SQLite at `/data/agentgov.db` (the Dockerfile sets `AGENTGOV_DB=/data/agentgov.db` and `chown`s `/data` to the non-root user). For persistence across revision rollouts, attach a Container Apps storage mount to `/data`. Dataverse / SharePoint adapters are planned (see **Step 7**) but not wired in the current engine.

Output prints `AGENTGOV_FQDN` and `AGENTGOV_URL`; the MCP endpoint is `${AGENTGOV_URL}/mcp`.

## Step 2 — Authentication

AgentGov ships **two independent gates** on the HTTP surface — a token gate and an origin (CORS) gate. They are evaluated separately on every request; setting up one does not configure the other.

- **Token gate**: static bearer tokens checked with `timingSafeEqual` for constant-time comparison (`src/server.ts:121`). This is plain string equality — **not** HMAC. (HMAC is only used to sign the `TrustVerdict` / `ReleaseDecision` payloads via `src/gate/signing.ts`.)
- **Origin gate**: enforced by the CORS check at `src/api/http.ts:14-22`. Applies only when the request carries an `Origin` header (browser-driven requests do; `curl` and most MCP CLIs do not). Requests **without** an `Origin` header are not gated by CORS.

Entra OAuth is optional production hardening layered on top of both gates — see **Step 6**.

### MCP gate (`POST /mcp`)

Token behavior (`src/server.ts:109-119`):

| `AGENTGOV_MCP_TOKEN` set? | `AGENTGOV_ALLOW_ANY_ORIGIN=true`? | Token check result |
|---|---|---|
| ✔ | either | Required: header `x-agentgov-mcp-token` must match. Mismatch → `401 unauthorized — Missing or invalid MCP token`. |
| ✘ | ✔ | Always rejected: `401 unauthorized — Set AGENTGOV_MCP_TOKEN before enabling AGENTGOV_ALLOW_ANY_ORIGIN`. |
| ✘ | ✘ (default) | Skipped. Any caller that satisfies the origin gate gets in. |

Origin behavior (independent of the token gate):

| Request type | Default behavior |
|---|---|
| Browser with `Origin: https://example.com` | Allowed only if origin is `localhost` / `127.0.0.1` / `::1`, listed in `AGENTGOV_ALLOWED_ORIGINS`, or `AGENTGOV_ALLOW_ANY_ORIGIN=true`. |
| `curl`, MCP CLI clients, server-to-server (no `Origin` header) | **Allowed.** The CORS gate only fires when an `Origin` is present. |

Recommended: always set `AGENTGOV_MCP_TOKEN`. Without it, anything that can reach the port over the network (e.g. `curl http://host:3000/mcp`) can call MCP tools. Copilot Studio sends the token via the connector's **Custom header** field — see Step 3.

### Revoke gate (`POST /releases/{id}/revoke`)

Token behavior (`src/api/revoke.ts:16-26`):

| `AGENTGOV_REVOKE_TOKEN` set? | `AGENTGOV_ALLOW_LOOPBACK_REVOKE=true`? | Result |
|---|---|---|
| ✔ | either | Required: header `x-agentgov-revoke-token` must match. |
| ✘ | ✔ | Loopback fallback: only requests from `127.0.0.1` / `::1` allowed. Non-loopback → `401 unauthorized`. |
| ✘ | ✘ (default) | Always rejected. |

Body must be JSON: `{ "reason": "<string>", "actor": "<string>" }`. Both fields are required, validated as non-empty strings, and persisted to the audit row.

## Step 3 — Configure Copilot Studio agent

1. Navigate to https://copilotstudio.microsoft.com and create a new agent (or open an existing one).
2. **Settings → Generative AI → Orchestration** → set to **Generative**. This is required for MCP tools to be invokable by the orchestrator.
3. **Tools** tab → **Add a tool** → **New tool** → **Model Context Protocol**.
4. Fill the wizard:
   - **Server name:** `AgentGov`
   - **Description:** `Trust and release governance for multi-agent Copilot Studio systems. Use trust tools before delegating to external A2A agents. Use release tools before approving a release.`
   - **Server URL:** `https://abc-3000.devtunnels.ms/mcp` (or your `${AGENTGOV_URL}/mcp`)
   - **Authentication:**
     - **Demo / local:** **No authentication** + (in the wizard's advanced section) add a **Custom header** `x-agentgov-mcp-token` with the value from `$AGENTGOV_MCP_TOKEN`. This is the simplest path that still rejects unauthenticated traffic.
     - **Production:** **OAuth 2.0 — Manual** with Entra in front of the connector, plus the `x-agentgov-mcp-token` header for defense-in-depth. See **Step 6**.
5. Click **Create**. Copilot Studio auto-generates a Power Platform custom connector wrapping `/mcp`.
6. Click **Create a new connection** → sign in → **Add to agent**.
7. Verify tools are visible in the agent's Tools tab: `inspect_agent_card`, `verify_card_signature`, `check_trust_registry`, `scan_card_metadata`, `sanitize_agent_card`, `issue_trust_verdict`, `generate_release_tests`, `ingest_eval_results`, `assert_tool_calls`, `classify_release_risk`, `recommend_remediation`, `compose_release_packet`, `persist_decision`, `revoke_release`.

## Step 4 — System prompt

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

## Step 5 — Test the wiring

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

## Step 6 — Entra OAuth (production hardening)

For a production MCP deployment, layer Entra OAuth in front of the connector. **Keep `AGENTGOV_MCP_TOKEN` set in addition** so the engine still rejects any request that bypasses the connector (defense in depth).

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

## Step 7 — Dataverse / SharePoint decision storage (planned, not yet wired)

> **Status:** Not implemented in the current engine. `src/storage/sharedStorage.ts:5` unconditionally returns a `SqliteStorage` instance; `AGENTGOV_STORAGE` is not read anywhere. The `DataverseStorage` and `SharePointStorage` adapters in `src/storage/` exist as interface-conformant stubs whose `init()` throws `"<adapter> is documented but not implemented in the local-first MVP"`. This section documents the **target shape** for when those adapters are wired up.

Today, every decision is persisted to SQLite at the path resolved by `AGENTGOV_DB` (default `outputs/agentgov.db`). For demos and the hackathon submission, SQLite is sufficient and audit-by-default holds: `--offline` and HTTP-mode paths both write through `getStorage()` -> `SqliteStorage`.

When the Dataverse adapter is wired in, the target setup will be:

1. In the Power Platform Admin Center, ensure your environment has a Dataverse database.
2. Create three custom tables in your solution:
   - `ag_release_decisions` with columns matching the `StoredDecision` schema (release_id, agent_id, verdict, payload_json, signature, idempotency_key, created_at, revoked_at, revoked_by, revoke_reason)
   - `ag_trust_verdicts` with the same shape keyed on decision_id
   - `ag_audit_events` for revocation entries
3. Generate a Dataverse Web API service principal connection.
4. AgentGov would gain an `AGENTGOV_STORAGE` switch and Dataverse credentials env vars (precise names are TBD until the adapter is implemented and lands a `getStorage()` factory branch).
5. Restart the MCP server. Decisions then persist to Dataverse instead of SQLite.

Wiring the adapter is a tracked follow-up; implementation lives in `src/storage/DataverseStorage.ts`. SharePoint storage follows the same pattern via `src/storage/SharePointStorage.ts`.

## Step 8 — Power Automate Adaptive Card approval

> **Two delivery paths.** AgentGov ships ready-to-use Adaptive Card 1.5 templates at [`templates/`](../templates/). They render the verdict and emit `Action.Submit` events that Power Automate can branch on. Pick the path that matches your storage layer:
>
> - **HTTP path (works today):** Power Automate "When an HTTP request is received" trigger; AgentGov posts the verdict JSON directly. No Dataverse needed.
> - **Dataverse path (post Step 7):** Power Automate "When a row is added" trigger on the `ag_release_decisions` table. Cleaner audit trail; depends on the Dataverse adapter from Step 7.

### Path A — HTTP webhook trigger (zero-storage path)

1. Power Automate → Create → Automated cloud flow → trigger: **When an HTTP request is received**.
2. Request body JSON schema: paste either schema:
   - Release: `schemas/release-decision.schema.json`
   - Trust: `schemas/trust-verdict.schema.json`
3. Add action: **Post adaptive card and wait for a response** (Teams connector).
   - Recipient: `triggerBody()?['owner']` (Release) or a fixed channel (Trust)
   - Message: paste the JSON from `templates/adaptive-card-release-decision.json` (or `templates/adaptive-card-trust-verdict.json`). Power Automate's Teams connector auto-resolves `${variable}` placeholders against the trigger body.
4. Branch on the submitted action:
   - Release: `outputs('Post_adaptive_card')?['body/data/action']` is `approve` or `request_changes`
   - Trust: `outputs('Post_adaptive_card')?['body/data/action']` is `allow` or `block`
5. Persist the human decision: on `request_changes`/`block` → HTTP POST to `https://your-agentgov/releases/{release_id}/revoke` with `x-agentgov-revoke-token` header.

Tell AgentGov where to post: set `AGENTGOV_WEBHOOK_URL` (or wire the HTTP trigger into your custom integration) and have your client read `decision_record` after a `BLOCK`/`WARN` verdict and forward it to that URL.

### Path B — Dataverse trigger (production path, requires Step 7)

1. Wire the Dataverse adapter from [Step 7](#step-7--dataverse--sharepoint-decision-storage-planned-not-yet-wired).
2. Power Automate → Create → Automated cloud flow → trigger: **When a row is added to a Dataverse table** → table `ag_release_decisions` → filter rows: `verdict eq 'BLOCK' or verdict eq 'WARN'`.
3. Same Steps 3–5 as Path A.

### Card templates

The two cards in `templates/` use Adaptive Cards v1.5 with the official [templating syntax](https://learn.microsoft.com/en-us/adaptive-cards/templating/). They iterate `findings[]` and `failures[]`, color-shift on verdict, and surface signed-decision metadata. Preview them at <https://adaptivecards.io/designer/> with a real verdict payload from `outputs/`.

## Step 9 — Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Copilot Studio "Cannot reach server" | Devtunnel expired or local server stopped | Restart `devtunnel host` and `npm run mcp:start` |
| Tools show up but always return errors | OAuth flow failed | Re-check redirect URI in Entra matches the one Copilot Studio displayed; re-issue client secret if older than 90 days |
| `generative orchestration` toggle missing | Old Copilot Studio license or generative features disabled at tenant level | Confirm Power Platform admin has enabled generative AI features in admin center |
| `trust check` works locally but fails from Copilot Studio | Devtunnel `--allow-anonymous` not set, or `AGENTGOV_MCP_TOKEN` set on the server but the connector's `x-agentgov-mcp-token` header not configured | Add `--allow-anonymous` flag; add the matching custom header to the MCP connector (Step 3.4); or complete Step 6 |
| `401 unauthorized — Missing or invalid MCP token` on `/mcp` | Server has `AGENTGOV_MCP_TOKEN` set but request sent the wrong (or no) `x-agentgov-mcp-token` header | Confirm the connector header value matches the server env var exactly (no leading/trailing whitespace); rotate the token if leaked |
| `401 unauthorized — Set AGENTGOV_MCP_TOKEN before enabling AGENTGOV_ALLOW_ANY_ORIGIN` | Wildcard CORS opened up without a server-side token gate | Either unset `AGENTGOV_ALLOW_ANY_ORIGIN` or set `AGENTGOV_MCP_TOKEN` — never run wildcard-open without a token |
| `401 unauthorized` on `/releases/{id}/revoke` | `AGENTGOV_REVOKE_TOKEN` unset and request is not from loopback | Set `AGENTGOV_REVOKE_TOKEN`, or set `AGENTGOV_ALLOW_LOOPBACK_REVOKE=true` and run revoke from `127.0.0.1` (e.g. via `curl` on the host) |
| `/readyz` returns `ok: false` with `storage: error` | SQLite path not writable or directory missing | Check `AGENTGOV_DB` path; create the parent dir; on Container Apps mount a persistent volume to a writable mount (Dataverse adapter is documented in Step 7 but not yet wired in the engine) |
| Dataverse writes fail | Service principal lacks table permissions | Grant the SP the **Basic User** + table-level Read/Create/Update on the three custom tables |
| Adaptive Card never delivers | Flow trigger filter not matching, or recipient field empty | Check Flow run history; verify `owner` column has a valid UPN |

## Appendix A — Environment variable reference

Every env var the engine reads, with default and whether it is safe to omit.

| Variable | Default | Safe to omit? | Purpose |
|---|---|---|---|
| `PORT` | `3000` | yes | HTTP port for the MCP + health + revoke server. The Dockerfile and Container Apps Bicep both use 3000 — override only when an existing service on the host already binds that port. |
| `AGENTGOV_MCP_TOKEN` | _(none)_ | **no for production** | Bearer token clients must send as `x-agentgov-mcp-token`. Required when `AGENTGOV_ALLOW_ANY_ORIGIN=true`. |
| `AGENTGOV_REVOKE_TOKEN` | _(none)_ | **no for production** | Bearer token clients must send as `x-agentgov-revoke-token` on `POST /releases/{id}/revoke`. |
| `AGENTGOV_ALLOW_ANY_ORIGIN` | `false` | yes | Set to `true` to disable origin pinning. **Only safe when `AGENTGOV_MCP_TOKEN` is also set**; the engine refuses to start otherwise. |
| `AGENTGOV_ALLOWED_ORIGINS` | _(none)_ | yes | CSV of additional allowed origins beyond loopback. Ignored when wildcard origin is enabled. |
| `AGENTGOV_ALLOW_LOOPBACK_REVOKE` | `false` | yes | Set to `true` to allow `POST /releases/{id}/revoke` from `127.0.0.1` / `::1` without a revoke token. Useful for cron-driven revocation on the host. |
| `AGENTGOV_WORKSPACE_ROOT` | `process.cwd()` | yes | Workspace root used by path-resolution guard. Set when AgentGov runs from a different directory than the policy/target-agent files. |
| `AGENTGOV_DB` | `outputs/agentgov.db` | yes | SQLite file path for the decision table. Parent directory must be writable. |
| `AGENTGOV_HMAC_SECRET` | _(insecure default)_ | **no for production** | HMAC signing secret for `TrustVerdict` and `ReleaseDecision`. **Rotating this invalidates every previously-signed decision** — `agentgov signature verify` returns false on rows written under the old secret. Either keep the old secret reachable for retroactive verification or re-issue all decisions under the new one. Never generate inline with `$(openssl rand)` at startup if SQLite is persistent. |
| `AGENTGOV_OTEL_FILE` | `outputs/otel-spans.jsonl` | yes | JSONL file the gates emit spans into. Both Trust Gate (`agentgov.trust.verdict`) and Release Gate (`agentgov.release.verdict`) write here. See `docs/observability.md` for the attribute schema. |

Set them inline (`VAR=value npm run mcp:start`), via a `.env`-style loader of your choice, or via `azd env set VAR value` for Container Apps.
