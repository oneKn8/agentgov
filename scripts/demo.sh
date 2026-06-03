#!/usr/bin/env bash
# AgentGov demo runner — records cleanly as a screen capture for the
# submission video. Walks trust → release → revoke → viewer export in
# sequence with paced banners between sections.
#
# Usage:
#   bash scripts/demo.sh              # default pacing (3s between sections)
#   DEMO_PACE=1 bash scripts/demo.sh  # fast (for rehearsals)
#   DEMO_PACE=5 bash scripts/demo.sh  # slow (for live narration)
#   DEMO_FRESH=1 bash scripts/demo.sh # delete outputs/ first (clean run)
#
# Assumes the repo has been built once (`npm run build`). If `dist/cli.js`
# is missing, the script will build first.

set -euo pipefail

PACE="${DEMO_PACE:-3}"
FRESH="${DEMO_FRESH:-0}"
CAPTIONS="${DEMO_CAPTIONS:-0}"

# Node 22 still ships node:sqlite as experimental, so every CLI invocation
# that touches SqliteStorage prints "(node:NNN) ExperimentalWarning: ..."
# to stderr. That noise lands in the screen capture. Disable warnings for
# the duration of the demo run only — callers' shells are unaffected.
export NODE_OPTIONS="${NODE_OPTIONS:-} --no-warnings"

# ANSI styling — visible enough for OBS capture without being noisy.
BOLD=$(printf '\033[1m')
DIM=$(printf '\033[2m')
RESET=$(printf '\033[0m')
CYAN=$(printf '\033[36m')
GREEN=$(printf '\033[32m')
RED=$(printf '\033[31m')
YELLOW=$(printf '\033[33m')

cd "$(dirname "$0")/.."

banner() {
  local title="$1"
  printf '\n%s%s%s\n' "$CYAN" "═══════════════════════════════════════════════════════════════" "$RESET"
  printf '%s  %s%s\n' "$CYAN$BOLD" "$title" "$RESET"
  printf '%s%s%s\n\n' "$CYAN" "═══════════════════════════════════════════════════════════════" "$RESET"
}

step() {
  printf '%s» %s%s\n' "$YELLOW$BOLD" "$1" "$RESET"
}

cmd() {
  printf '%s$ %s%s\n\n' "$DIM" "$1" "$RESET"
}

pause() {
  sleep "$PACE"
}

# Caption bar for the captions-only (no-voiceover) cut. Renders the narration
# as a high-contrast reverse-video subtitle, word-wrapped, then holds long
# enough to read. Enabled with DEMO_CAPTIONS=1; a no-op in voiceover mode so
# the same script still works for a live narrated recording.
REV=$(printf '\033[7m')
caption() {
  [ "$CAPTIONS" = "1" ] || return 0
  printf '\n'
  printf '%s\n' "$1" | fold -s -w 66 | while IFS= read -r line; do
    printf '%s%s  %-66s  %s\n' "$BOLD" "$REV" "$line" "$RESET"
  done
  printf '\n'
  sleep "${CAPTION_HOLD:-5}"
}

# Ensure dist/ exists. Build silently if not.
if [ ! -f "dist/cli.js" ]; then
  printf '%sBuilding (dist/cli.js missing)…%s\n' "$DIM" "$RESET"
  npm run build > /dev/null
fi

# Optional: reset outputs/ for a deterministic capture.
if [ "$FRESH" = "1" ]; then
  printf '%sCleaning outputs/ for a fresh demo run…%s\n' "$DIM" "$RESET"
  rm -rf outputs/
  mkdir -p outputs
fi

CLI="node dist/cli.js"

caption "Two questions every Copilot Studio maker faces: can I trust an external agent, and is my own agent ready to ship?"

# ─────────────────────────────────────────────────────────────────────
banner "ACT 1 — Trust Gate blocks a poisoned external Agent Card"
# ─────────────────────────────────────────────────────────────────────

caption "Untrusted agent card: signature fails, injection strings found. Verdict: BLOCK, risk score 100."

step "External A2A agent advertises itself via /.well-known/agent-card.json"
step "AgentGov fetches it, fails signature verification, scans every field, decides"
echo
cmd "agentgov trust check fixtures/agent-cards/poisoned-injection.json --offline"
$CLI trust check fixtures/agent-cards/poisoned-injection.json --offline
pause

banner "ACT 1b — Same product, signed and registered: ALLOW with provenance"

caption "Signed and registered card: ALLOW, with an HMAC-signed verdict."

cmd "agentgov trust check fixtures/agent-cards/trusted-signed.json --offline"
$CLI trust check fixtures/agent-cards/trusted-signed.json --offline
pause

# ─────────────────────────────────────────────────────────────────────
banner "ACT 2 — Release Gate blocks an unready Copilot Studio agent"
# ─────────────────────────────────────────────────────────────────────

caption "Agent approved a \$50K exception with no policy check. 62% pass, 7 critical failures: BLOCK."

step "Vendor Exception Agent — approved a \$50K exception without policy lookup"
step "Eval results + policy YAML → AgentGov classifies, signs, persists"
echo
cmd "agentgov release check target-agents/vendor-exception.yaml --eval fixtures/eval-results/block.json"
$CLI release check target-agents/vendor-exception.yaml --eval fixtures/eval-results/block.json
pause

step "The human-readable release packet — signed Markdown ready for the owner"
echo
cmd "head -40 outputs/release-packet.md"
if [ -f outputs/release-packet.md ]; then
  head -40 outputs/release-packet.md
else
  printf '%s(release-packet.md not generated — release check must have failed)%s\n' "$RED" "$RESET"
fi
pause

# ─────────────────────────────────────────────────────────────────────
banner "ACT 2b — Release Gate passes the remediated agent"
# ─────────────────────────────────────────────────────────────────────

caption "Same agent after fixes: evidence attached, policy lookup recorded, 96% pass. Verdict: PASS, signed and clear to ship."

step "Remediated Vendor Exception Agent — required evidence present, policy clean"
echo
cmd "agentgov release check target-agents/vendor-exception.yaml --eval fixtures/eval-results/pass.json"
$CLI release check target-agents/vendor-exception.yaml --eval fixtures/eval-results/pass.json
pause

# ─────────────────────────────────────────────────────────────────────
banner "ACT 3 — Revoke a release post-deployment (verdict intact, revoke metadata recorded)"
# ─────────────────────────────────────────────────────────────────────

caption "Post-release regression: one call records the revoke. Original verdict and signature untouched."

# Pull the most-recent release_id from SQLite so this works on any run.
RELEASE_ID=$(node -e '
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(process.env.AGENTGOV_DB || "outputs/agentgov.db");
  const row = db.prepare("select decision_id from decisions where kind = ? order by created_at desc limit 1").get("release");
  if (!row) { process.exit(1); }
  process.stdout.write(row.decision_id);
' 2>/dev/null || true)

if [ -n "$RELEASE_ID" ]; then
  step "Latest release_id from SQLite: ${BOLD}${RELEASE_ID}${RESET}"
  echo
  cmd "agentgov release revoke $RELEASE_ID --reason \"post-release regression\""
  # Strip payload_json from the dumped audit row so the video frame stays
  # readable. The full payload is still in SQLite — what matters on screen
  # is that revoke fields populated and the signature stayed intact.
  $CLI release revoke "$RELEASE_ID" --reason "post-release regression" --actor demo@agentgov.local 2>/dev/null \
    | node -e '
      const chunks = [];
      process.stdin.on("data", (c) => chunks.push(c));
      process.stdin.on("end", () => {
        try {
          const row = JSON.parse(Buffer.concat(chunks).toString());
          const { payload_json, ...display } = row;
          process.stdout.write(JSON.stringify(display, null, 2) + "\n");
        } catch (e) {
          process.stdout.write(Buffer.concat(chunks).toString());
        }
      });
    '
else
  printf '%s(no release decisions in outputs/agentgov.db — skipping revoke step)%s\n' "$YELLOW" "$RESET"
fi
pause

# ─────────────────────────────────────────────────────────────────────
banner "ACT 4 — Verdict Inspector reads the signed audit trail"
# ─────────────────────────────────────────────────────────────────────

caption "Not a replacement for Agent 365, the signed evidence feed it consumes. Trust in, release out."

step "Export every decision + OTel span into the static viewer's JSON"
echo
cmd "node scripts/export-verdicts.mjs"
node scripts/export-verdicts.mjs 2>&1 | grep -v "ExperimentalWarning\|--trace-warnings"
pause

step "Now open the viewer in a browser to capture the UI:"
echo
cmd "python3 -m http.server --directory docs/viewer 8765"
printf '  %sthen open http://localhost:8765 in OBS browser source or a real browser%s\n' "$DIM" "$RESET"
echo

# ─────────────────────────────────────────────────────────────────────
banner "Demo complete — captured artifacts under outputs/"
# ─────────────────────────────────────────────────────────────────────

step "Audit trail"
printf '  • %soutputs/agentgov.db%s — SQLite decision table (every verdict signed and idempotent; revoke writes only the revoked_at / revoked_by / revoke_reason columns, payload_json + signature stay intact)\n' "$BOLD" "$RESET"
printf '  • %soutputs/otel-spans.jsonl%s — OpenTelemetry GenAI spans (Trust + Release)\n' "$BOLD" "$RESET"
printf '  • %soutputs/release-packet.md%s — signed Markdown packet for the agent owner\n' "$BOLD" "$RESET"
printf '  • %sdocs/viewer/verdicts.json%s — viewer data file (regenerated above)\n' "$BOLD" "$RESET"
echo
caption "Microsoft Agent Academy, Special Ops track. MIT open source: CLI + MCP server, 14 tools. github.com/oneKn8/agentgov"

printf '%sgithub.com/oneKn8/agentgov%s\n' "$GREEN$BOLD" "$RESET"

# Hold the final CTA frame so it lingers in a captions-only recording.
if [ "$CAPTIONS" = "1" ]; then sleep 4; fi
echo
