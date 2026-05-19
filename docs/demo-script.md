# AgentGov 90-Second Demo Script

**Target length:** 1:25–1:30. Record at 1:35 raw, trim to 1:30 in post.
**Format:** Screen capture (full-screen terminal) + voiceover. Webcam PIP only at hook + CTA.
**Companion script:** `scripts/demo.sh` runs trust → release → revoke → export in sequence with paced banners. Set `DEMO_PACE=5` for live narration timing; `DEMO_PACE=1` for rehearsal. Set `DEMO_FRESH=1` to wipe `outputs/` before recording so the run is deterministic.

The 5-minute long-form script (with architecture deep-dive, prior-art callouts, and Adaptive Card scene) lives in [git history](https://github.com/oneKn8/agentgov/commits/main/docs/demo-script.md) — checkout an earlier commit if a long-form submission video is needed.

## Pre-record checklist

- [ ] `npm run build && npm run test:smoke` passes on latest `main`
- [ ] `DEMO_FRESH=1 bash scripts/demo.sh` runs cleanly end-to-end at PACE=1
- [ ] OBS scene: full-screen terminal, font ≥18pt, dark theme; webcam PIP bottom-right enabled only for the hook and outro
- [ ] Browser tab open to `http://localhost:8765` with `python3 -m http.server --directory docs/viewer 8765` already running (ACT 4 cuts to this)
- [ ] Mic check ≤ −20dB peak; closet / blanket-fort recording space
- [ ] All commands in the script are pre-typed in a notes file for paste, not typed live

## Scenes

### 0:00–0:08 — HOOK (webcam PIP on)

**On-screen:** Quick cut from Copilot Studio agent dashboard → terminal cursor.
**Lower-third:** "Two questions. One product. Signed decisions."

> "Microsoft Agent 365 shipped on May 1. Copilot Studio makers still get no answer to two governance questions: can my agent trust this external agent, and is my own agent ready to ship?"

### 0:08–0:23 — ACT 1: Trust Gate BLOCKs a poisoned card

**On-screen:** Terminal. Run via `bash scripts/demo.sh` — let the banner appear, then the trust output.

```bash
agentgov trust check fixtures/agent-cards/poisoned-injection.json --offline
```

**Cursor-highlight in order:** `"verdict": "BLOCK"` → `"risk_score": 100` → the `reasons` list.

> "External agent advertises itself with a card. AgentGov fails signature verification, fails trust-registry lookup, scans the metadata, and finds three prompt-injection strings trying to hijack the orchestrator. Verdict: BLOCK. Risk score 100."

### 0:23–0:33 — ACT 1b: Trust Gate ALLOWs a signed card

**On-screen:** Same terminal, next banner.

```bash
agentgov trust check fixtures/agent-cards/trusted-signed.json --offline
```

**Highlight:** `"verdict": "ALLOW"` and the HMAC `signature`.

> "Same product, signed and registered: ALLOW, with a verifiable HMAC signature on the decision itself."

### 0:33–0:53 — ACT 2: Release Gate BLOCKs an unready agent

**On-screen:** Terminal.

```bash
agentgov release check target-agents/vendor-exception.yaml \
  --eval fixtures/eval-results/block.json
```

**Highlight in order:** `"verdict": "BLOCK"` → `"pass_rate": 62` → `critical_failures: 7` → the first three `recommended_fixes`. Then the script shows `head -40 outputs/release-packet.md` — the signed Markdown packet.

> "Different question, same product. Vendor Exception Agent — approved a fifty-thousand-dollar exception without policy lookup or finance approval. Sixty-two percent pass rate, seven critical failures. Verdict: BLOCK. The release packet is signed Markdown, ready for the owner."

### 0:53–1:08 — ACT 3: Revoke + Audit (cut to viewer)

**On-screen split:** Terminal shows the revoke command. **Cut to browser** at `http://localhost:8765` — the Verdict Inspector showing two decisions with verdicts, signatures, and the revoked release with its red banner.

```bash
agentgov release revoke <release_id> --reason "post-release regression"
```

> "Post-release regression detected. One CLI call records the revoke — the original verdict and its signature aren't touched. Every decision is browsable in the local viewer: signed, verifiable, exportable as JSON."

### 1:08–1:20 — ACT 4: How it fits the Microsoft stack

**On-screen:** Cut to a clean four-row table card (pre-rendered SVG; the table is in `README.md`).

> "AgentGov is not a replacement. Agent 365 is the enterprise control plane — AgentGov produces the evidence it consumes. EvalGateADO gates PR merges — AgentGov gates human release readiness. Sigstore-a2a signs cards — AgentGov enforces tenant policy. Purview audits the runtime — AgentGov governs the lifecycle."

### 1:20–1:30 — CTA (webcam PIP returns)

**On-screen:** GitHub URL title card with QR. Hold for the full final 4 seconds — judges open the repo while scoring.

> "Built for the Microsoft Agent Academy Special Ops track. Open-source under MIT. CLI, MCP server, threat model, cost model, prior-art comparison — all in the repo. github dot com slash one-K-N-8 slash agentgov."

## Cut list (if running over 1:30)

In priority order, cut from the bottom:

1. The signed-Markdown-packet preview in ACT 2 (saves 4s — replace with one-sentence callout)
2. The Trust ALLOW scene in ACT 1b (saves 10s — go straight from BLOCK to release)
3. The Microsoft-stack table in ACT 4 (saves 12s — replace with one sentence "Agent 365's evidence feed, not a replacement")

**Hard floor:** Hook → one Trust BLOCK → one Release BLOCK → Revoke → GitHub URL CTA. Anything else is optional polish.

## Recording flow

```bash
# Terminal 1: serve the viewer
python3 -m http.server --directory docs/viewer 8765

# Terminal 2: run the demo with narration pacing
DEMO_FRESH=1 DEMO_PACE=5 bash scripts/demo.sh

# Browser: http://localhost:8765 (cut to this during ACT 3)
```

The script's banners between acts give the narrator natural pause points. `DEMO_PACE=5` leaves 5 seconds between sections — enough for one breath and a sip of water.

## Fallback if the live MCP / Copilot Studio path is needed

This is the CLI-only version. If the submission requires the MCP transport story:

1. Add an opening ACT 0 (10s): start the MCP server with `npm run mcp:start`, show `curl /healthz` → `{ ok: true }`.
2. Replace ACT 1's CLI command with a `tools/list` MCP call showing all 14 tools.
3. Tighten the rest to fit the same 90-second budget by dropping the Trust ALLOW scene.

The CLI version is the cheaper-to-record baseline. Both paths produce the same signed decision records, so the audit-trail evidence is identical.
