#!/usr/bin/env bash
# Bring AgentGov up for a real Copilot Studio walkthrough, and print the exact
# values to paste into the Copilot Studio MCP connector wizard (docs/wiring.md
# Step 3). Loads persistent secrets from .env.agentgov (generated once, never
# rotated — rotating invalidates signed decisions in the SQLite audit trail).
#
# Usage:
#   bash scripts/serve-for-copilot.sh
# Then in a second terminal:
#   devtunnel host -p 3000 --allow-anonymous     # copy the https URL it prints
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck disable=SC1090
source ~/.nvm/nvm.sh >/dev/null 2>&1 && nvm use default >/dev/null 2>&1 || true

[ -f dist/server.js ] || npm run build

if [ ! -f .env.agentgov ]; then
  umask 077
  cat > .env.agentgov <<EOF
AGENTGOV_HMAC_SECRET=$(openssl rand -hex 32)
AGENTGOV_MCP_TOKEN=$(openssl rand -hex 32)
AGENTGOV_REVOKE_TOKEN=$(openssl rand -hex 32)
EOF
  echo "generated .env.agentgov (persistent secrets)"
fi
set -a; . ./.env.agentgov; set +a

cat <<INFO

────────────────────────────────────────────────────────────────────────
 AgentGov MCP — paste these into the Copilot Studio MCP connector wizard
 (copilotstudio.microsoft.com -> Tools -> Add a tool -> Model Context Protocol)
────────────────────────────────────────────────────────────────────────
 Server name  : AgentGov
 Server URL   : <YOUR-DEVTUNNEL-URL>/mcp
                (second terminal: devtunnel host -p 3000 --allow-anonymous)
 Auth         : No authentication  +  Custom header
 Header name  : x-agentgov-mcp-token
 Header value : ${AGENTGOV_MCP_TOKEN}
 System prompt: docs/wiring.md Step 4   |   Test prompts: Step 5
────────────────────────────────────────────────────────────────────────
 Server starting on http://localhost:3000  —  Ctrl-C to stop
 Health: curl -s localhost:3000/readyz
────────────────────────────────────────────────────────────────────────

INFO
exec npm run mcp:start
