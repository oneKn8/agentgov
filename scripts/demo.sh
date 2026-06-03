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
  local text="$1"
  printf '\n'
  printf '%s\n' "$text" | fold -s -w 76 | while IFS= read -r line; do
    printf '%s%s  %-76s  %s\n' "$BOLD" "$REV" "$line" "$RESET"
  done
  printf '\n'
  # Hold scales with reading length (~0.42s/word) so longer explanations stay
  # on screen long enough to read. CAPTION_HOLD is the floor.
  local words hold
  words=$(printf '%s' "$text" | wc -w)
  hold=$(awk -v w="$words" -v base="${CAPTION_HOLD:-5}" 'BEGIN{h=w*0.36; if(h<base)h=base; printf "%.1f", h}')
  sleep "$hold"
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

caption "Copilot Studio agents now delegate to external A2A agents and ship to real users. Two governance questions have no built-in answer: can I trust an agent before delegating to it, and is my own agent safe to release?"

# ─────────────────────────────────────────────────────────────────────
banner "ACT 1 — Trust Gate blocks a poisoned external Agent Card"
# ─────────────────────────────────────────────────────────────────────

caption "An external A2A agent advertises itself with an Agent Card. AgentGov inspects it before your agent ever delegates. This one is unsigned, from an unknown vendor, and its description hides prompt-injection instructions. Risk score 100. Verdict: BLOCK."

step "External A2A agent advertises itself via /.well-known/agent-card.json"
step "AgentGov fetches it, fails signature verification, scans every field, decides"
echo
cmd "agentgov trust check fixtures/agent-cards/poisoned-injection.json --offline"
$CLI trust check fixtures/agent-cards/poisoned-injection.json --offline
pause

banner "ACT 1b — Same product, signed and registered: ALLOW with provenance"

caption "The same kind of agent, but signed with a key pinned in your trust registry and carrying clean metadata. Verdict: ALLOW, and AgentGov returns an HMAC-signed decision you can audit later."

cmd "agentgov trust check fixtures/agent-cards/trusted-signed.json --offline"
$CLI trust check fixtures/agent-cards/trusted-signed.json --offline
pause

# ─────────────────────────────────────────────────────────────────────
banner "ACT 2 — Release Gate blocks an unready Copilot Studio agent"
# ─────────────────────────────────────────────────────────────────────

caption "Now the second question. This Vendor Exception agent approved a 50,000 dollar exception with no policy lookup. Its eval run scores 62 percent with 7 critical failures. Verdict: BLOCK, not cleared for release."

step "Vendor Exception Agent — approved a \$50K exception without policy lookup"
step "Eval results + policy YAML → AgentGov classifies, signs, persists"
echo
cmd "agentgov release check target-agents/vendor-exception.yaml --eval fixtures/eval-results/block.json"
$CLI release check target-agents/vendor-exception.yaml --eval fixtures/eval-results/block.json
pause

caption "Every blocked release produces a signed Markdown packet: the failures, the root causes, and the exact fixes the owner must make before resubmitting."
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

caption "After remediation: the required evidence is attached, the policy lookup is recorded, and the eval run passes at 96 percent. Verdict: PASS, signed and cleared to ship."

step "Remediated Vendor Exception Agent — required evidence present, policy clean"
echo
cmd "agentgov release check target-agents/vendor-exception.yaml --eval fixtures/eval-results/pass.json"
$CLI release check target-agents/vendor-exception.yaml --eval fixtures/eval-results/pass.json
pause

# ─────────────────────────────────────────────────────────────────────
banner "ACT 3 — Revoke a release post-deployment (verdict intact, revoke metadata recorded)"
# ─────────────────────────────────────────────────────────────────────

caption "Governance does not end at release. A regression surfaces in production after the agent shipped. One command revokes the decision, and the revocation itself is signed, so the audit trail stays tamper-evident."

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

caption "Every trust and release decision is signed, persisted, and exportable. AgentGov does not replace Microsoft Agent 365. It produces the verified evidence that control plane consumes. Trust in, release out."

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
caption "AgentGov. Open source: one MCP server, fourteen tools, a CLI, and a signed audit trail. Microsoft Agent Academy, Special Ops. github.com/oneKn8/agentgov"

printf '%sgithub.com/oneKn8/agentgov%s\n' "$GREEN$BOLD" "$RESET"

# Hold the final CTA frame so it lingers in a captions-only recording.
if [ "$CAPTIONS" = "1" ]; then sleep 4; fi
echo
