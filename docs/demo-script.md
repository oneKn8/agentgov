# AgentGov 5-Minute Demo Script

**Target length:** 4:45-5:00 (hard cap at 5:00 per Microsoft Agent Academy rules)
**Recording tools:** OBS Studio (screen + webcam), DaVinci Resolve (edit), Descript (audio cleanup + captions)
**Audio:** Voiceover in Shifat's own voice — clean, deliberate, no music under voice; light ambient bed for intro/outro stings only

## Pre-record checklist

- [ ] Codex's engine merged to `main` and `npm run test:smoke` passes
- [ ] Claude's `claude/docs-wiring` merged to `main` (CI workflows + docs live)
- [ ] Adaptive Card flow tested end-to-end (or fallback Markdown packet ready)
- [ ] OBS scene: full-screen terminal + small webcam PIP bottom-right
- [ ] Architecture PNG opens cleanly without artifacts
- [ ] Sample commands typed-out in a notes file for clean copy-paste during recording
- [ ] Microphone test: Fifine K669 USB at ~30dB room noise floor
- [ ] Closet/blanket-fort recording space to kill reflections

## Scenes

### 0:00–0:25 — HOOK

**On-screen:** Webcam PIP. Background: terminal with Copilot Studio agent dashboard visible behind.

**Voiceover:**
> "Microsoft Copilot Studio shipped multi-agent systems in April 2026. Six weeks later, every enterprise asks two governance questions: 'Can my agent safely delegate to this external agent?' and 'Is my own agent trustworthy enough to ship to users?' Microsoft Agent 365 is the enterprise control plane that consumes the answers. AgentGov is the open-source maker layer that produces them."

**Lower-third caption:** "Two questions. One product. Signed decisions."

### 0:25–2:00 — ACT 1: TRUST GATE

**On-screen:** Clean terminal. No webcam PIP during demo.

**Type:**
```bash
agentgov trust check fixtures/agent-cards/poisoned-injection.json --offline
```

**On output, highlight with cursor:**
- `"verdict": "BLOCK"`
- `"risk_score": 100`
- The `reasons[]` list: unsigned, no registry match, prompt-injection text found, external URL in metadata
- Three `findings[]` with evidence snippets

**Voiceover during reveal:**
> "External agent advertises itself with a card. AgentGov fetches it, fails signature verification, fails trust-registry lookup, then scans the metadata. Finds three instances of instruction-overriding text trying to hijack the orchestrator. Verdict: BLOCK. Risk score 100. Every finding citable."

**Then type:**
```bash
agentgov trust check fixtures/agent-cards/trusted-signed.json --offline
```

**On output:**
- `"verdict": "ALLOW"`
- `"registry_match": true`
- `"signature_valid": true`
- HMAC `signature` at the bottom

**Voiceover:**
> "Same product, signed and registered card: ALLOW with full provenance. Both decisions are HMAC-signed and persisted to a tamper-evident audit log."

### 2:00–3:30 — ACT 2: RELEASE GATE

**Type:**
```bash
agentgov release check target-agents/vendor-exception.yaml \
  --eval fixtures/eval-results/block.json
```

**On output, walk through:**
- `"verdict": "BLOCK"`
- `"pass_rate": 62`
- `"critical_failures": 3`, `"tool_call_failures": 1`, `"policy_failures": 4`
- `"root_causes"` summarized
- `"recommended_fixes"` checklist

**Voiceover:**
> "Same Copilot Studio agent owner, different question: is my own Vendor Exception Agent ready to ship? AgentGov ingests evaluation results, evaluates them against a policy YAML, asserts expected tool calls, and detects regression against the last five release decisions. This run blocks: 62% pass rate, three critical failures, missing policy_lookup tool call, missing finance approval on a $50K exception."

**Then open the rendered packet:**
```bash
cat outputs/release-packet.md
```

**On the Markdown output:**
- Title with agent name
- Verdict + pass rate + owner + approval deadline + signature header block
- Root Causes section
- Findings section (severity-tagged)
- Required Fixes checklist

**Voiceover:**
> "The release packet. Human-readable. Signed. Goes to the agent owner for review."

### 3:30–4:00 — APPROVAL + AUDIT

**Switch to Teams window** (or Adaptive Card preview if Power Automate isn't wired live).

**Voiceover:**
> "Routed via Power Automate as an Adaptive Card. The owner sees the verdict, the top three failures, and the remediation checklist. Approve or request changes — either way, the decision is persisted with the approver's verified identity. If a post-release regression appears, the release can be revoked with one CLI call. The audit row is appended; the original record stays immutable."

**Quick CLI flash:**
```bash
agentgov release revoke release-... --reason "post-release regression"
```

### 4:00–4:30 — ARCHITECTURE

**Switch to architecture PNG** (`docs/architecture.png`).

**Voiceover:**
> "One MCP Streamable HTTP server. Two governance gates. Six trust tools, eight release tools. One signed decision schema. Local SQLite by default, with Dataverse and SharePoint adapters for tenant deployment. OpenTelemetry GenAI-spec spans on every decision. Free-tier path validated for under 500 decisions per day."

**Caption the upstream/complementary relationships:**
- "EvalGateADO gates PR merges — AgentGov gates human release readiness"
- "sigstore-a2a signs cards — AgentGov enforces tenant trust policy"
- "Agent 365 is the control plane — AgentGov produces the evidence it consumes"
- "Purview audits runtime — AgentGov governs the lifecycle"

### 4:30–5:00 — CTA + CREDITS

**On-screen:** GitHub URL + QR code on a clean title card. Webcam PIP returns.

**Voiceover:**
> "AgentGov is open source under MIT. The CLI works without Copilot Studio for evaluation today. The MCP server wires into Copilot Studio when you're ready. Threat model, cost model, and prior-art comparison all in the repo. Built for the Microsoft Agent Academy Special Ops track. github.com slash oneKn8 slash agentgov. Thank you."

**Hold the GitHub URL on screen for the full final 4 seconds** so judges can read it during their scoring pass.

## Cut list (if running over 5:00)

In priority order — cut from the bottom:

1. The architecture upstream/complementary caption flash (saves 10s)
2. The CLI flash of `release revoke` (saves 5s)
3. The trusted-card trust check (saves 20s) — but keep at least the BLOCK demonstration
4. The approval card scene (saves 30s) — replace with a single sentence "routed to the owner for approval"

Hard floor: hook + one trust BLOCK + one release BLOCK + GitHub URL CTA. Everything else is optional polish.

## Fallback if Copilot Studio MCP wiring breaks

The CLI demo carries the whole story without Copilot Studio. Replace the Adaptive Card scene with:

> "When deployed as an MCP server, every one of these CLI calls becomes a tool Copilot Studio's orchestrator can invoke. The product behavior is identical; the deployment surface changes."

Then show the architecture diagram with the MCP path highlighted.

## Recording tips

1. **Pre-type all commands** in a notes file. During recording, copy-paste — don't type live. Typos eat seconds and break flow.
2. **Run the demo dry once** at 80% speed. If it's over 4:30 raw, cut before recording, not after.
3. **Use Descript's Studio Sound** to clean up the audio without re-recording.
4. **Captions burned in** at 1.5x viewing speed — judges often mute and skim.
5. **Cursor zoom on click** — Screen Studio for Mac if available; otherwise increase pointer size + slow movements.
6. **One bold lower-third caption per scene.** Reinforces voiceover for muted viewers.
7. **End on the GitHub URL for ≥4 seconds.** Judges open the repo while scoring.
