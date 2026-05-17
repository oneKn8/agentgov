# Contributing to AgentGov

Thanks for the interest. AgentGov is built to be a real OSS project — contributions of every size are welcome.

## Quick start

```bash
git clone https://github.com/oneKn8/agentgov.git
cd agentgov
npm install
npm run build
npm test
npm run test:smoke
```

You should see all unit tests + smoke tests pass before opening a PR.

## How to contribute

### Bug reports

1. Check existing issues for duplicates
2. If new, open an issue using the `bug_report` template
3. Include: AgentGov version (commit SHA), Node version, OS, exact reproduction steps, expected vs actual behavior, CLI output if relevant
4. **Do not report security vulnerabilities as public issues.** See [`SECURITY.md`](SECURITY.md).

### Feature requests

1. Open an issue using the `feature_request` template
2. Describe the use case, not just the feature — judges of the same release decision should agree on whether the proposed feature helps
3. Reference any related upstream specs (A2A, MCP, OpenTelemetry GenAI semconv) if applicable

### Pull requests

1. Fork the repo or create a feature branch
2. Make atomic commits with clear messages (see commit message style below)
3. Add or update tests for any behavior change
4. Run `npm test && npm run test:smoke` and confirm green
5. Update relevant docs (`README.md`, `docs/**`) if you change observable behavior
6. Open a PR against `main` using the PR template
7. CI must pass before review

## Commit message style

```
type(scope): brief imperative summary

Optional longer explanation if the why is non-obvious.
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `ci`, `chore`, `security`.

Examples:
- `feat(trust): add JWKS endpoint fetcher for signature verification`
- `fix(release): correct regression detector when previousRuns is empty`
- `docs(prior-art): add comparison row for Aporia Guardrails`

## Code style

- TypeScript strict mode
- ESLint + Prettier configured at repo root
- No console.log in committed code (use the OTel span logger or structured logger)
- Schemas live in `src/schema/types.ts` — extend rather than fork
- One tool per file under `src/tools/{trust,release}/`

## Architectural rules

These are load-bearing — do not regress without explicit discussion in an issue first:

1. **Deterministic core path.** No paid LLM calls in the trust or release decision flow. LLM-assisted features must be behind an explicit opt-in flag.
2. **Signed decisions.** Every `TrustVerdict` and `ReleaseDecision` carries an HMAC signature over its JCS canonicalization.
3. **Local-first storage.** SQLite is the default. Dataverse and SharePoint are adapters, not replacements.
4. **Idempotency.** Re-submitting the same `release_id` / `decision_id` returns the same record without rewriting.
5. **Data minimization.** No raw sensitive payloads in audit logs. Reference evidence by ID. Apply redaction at the persistence boundary.
6. **Policy as code.** Rules live in YAML with unit tests, not hard-coded in TypeScript.
7. **MCP + CLI parity.** Every capability is exposed via both the MCP server and the local CLI. Neither becomes the only path.

## Code of Conduct

By participating in this project you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).

## Licensing

By submitting a contribution you agree that it will be licensed under the same [MIT License](LICENSE) as the rest of the project.
