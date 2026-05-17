<!-- Keep this PR scoped to one of the COORDINATION.md areas:
     engine / docs / infra / ci / policies / fixtures -->

## Area

- [ ] engine (src/**, schemas/**, fixtures/**, package*.json, tsconfig*.json) — Codex
- [ ] docs / wiring (README, docs/**, LICENSE, hygiene files, Adaptive Cards) — Claude
- [ ] infra (azure.yaml, infra/**) — Claude
- [ ] ci (.github/workflows/**) — Claude
- [ ] policies / target-agents (shared — coordinate before editing)

## Gate touched

- [ ] Trust Gate (`inspect_agent_card`, `verify_card_signature`, `check_trust_registry`, `scan_card_metadata`, `sanitize_agent_card`, `issue_trust_verdict`)
- [ ] Release Gate (`generate_release_tests`, `ingest_eval_results`, `assert_tool_calls`, `classify_release_risk`, `recommend_remediation`, `compose_release_packet`, `persist_decision`, `revoke_release`)
- [ ] Neither (docs / infra / ci only)

## Summary

<!-- 1–3 bullets on what changed and why. Link to spec or coordination note. -->

## Verification

- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] `npm run test:smoke` passes
- [ ] `git diff --exit-code -- schemas/` is clean (schemas regenerated and committed if signatures changed)
- [ ] No files outside the declared Area were touched

## Coordination

<!-- If you crossed a boundary in COORDINATION.md, name the file and why it was unavoidable.
     Otherwise: "No cross-area edits." -->
