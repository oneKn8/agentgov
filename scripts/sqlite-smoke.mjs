import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteStorage } from "../dist/storage/SqliteStorage.js";
import { verifySignature } from "../dist/gate/signing.js";

const dbPath = join(mkdtempSync(join(tmpdir(), "agentgov-sqlite-")), "agentgov.db");
const storage = new SqliteStorage(dbPath);
await storage.init();

const release = {
  release_id: "sqlite-smoke-release",
  agent_id: "sqlite-smoke-agent",
  agent_name: "SQLite Smoke Agent",
  verdict: "BLOCK",
  pass_rate: 50,
  critical_failures: 1,
  tool_call_failures: 1,
  policy_failures: 0,
  root_causes: ["tool_call: 1 finding"],
  recommended_fixes: ["Call the required policy tool."],
  owner: "owner@example.com",
  approval_deadline: "2026-05-20T00:00:00.000Z",
  created_at: "2026-05-17T00:00:00.000Z",
  evidence_ref: "sqlite-smoke",
  failures: [
    {
      id: "missing-tool",
      category: "tool_call",
      severity: "critical",
      message: "Missing required tool call.",
      remediation: "Call the required policy tool."
    }
  ],
  signature: "release-signature"
};

const firstSave = await storage.saveReleaseDecision(release, release.release_id);
const secondSave = await storage.saveReleaseDecision({ ...release, signature: "changed" }, release.release_id);
assert.equal(secondSave.signature, firstSave.signature, "release save should be idempotent");

const firstRevoke = await storage.revokeDecision(release.release_id, "first revoke", "tester");
const secondRevoke = await storage.revokeDecision(release.release_id, "second revoke", "other");
assert.equal(secondRevoke.revoked_at, firstRevoke.revoked_at, "revoke timestamp should be idempotent");
assert.equal(secondRevoke.revoked_by, "tester", "revoke actor should not be overwritten");
assert.equal(secondRevoke.revoke_reason, "first revoke", "revoke reason should not be overwritten");

assert.ok(
  typeof firstRevoke.revoke_signature === "string" && firstRevoke.revoke_signature.length > 0,
  "revocation metadata must be signed (tamper-evidence)"
);
const revokeMeta = {
  decision_id: release.release_id,
  revoked_at: firstRevoke.revoked_at,
  revoked_by: firstRevoke.revoked_by,
  revoke_reason: firstRevoke.revoke_reason
};
assert.ok(verifySignature(revokeMeta, firstRevoke.revoke_signature), "revocation signature must verify against its metadata");
assert.ok(
  !verifySignature({ ...revokeMeta, revoked_by: "attacker" }, firstRevoke.revoke_signature),
  "tampered revocation metadata must fail verification"
);

const trustVerdict = {
  decision_id: "sqlite-smoke-trust",
  agent_name: "Trusted Smoke Agent",
  source: "fixture",
  verdict: "ALLOW",
  risk_score: 0,
  reasons: ["ok"],
  findings: [],
  created_at: "2026-05-17T00:00:00.000Z",
  signature: "trust-signature"
};

const firstTrust = await storage.saveTrustVerdict(trustVerdict, trustVerdict.decision_id);
const secondTrust = await storage.saveTrustVerdict({ ...trustVerdict, signature: "changed" }, trustVerdict.decision_id);
assert.equal(secondTrust.signature, firstTrust.signature, "trust verdict save should be idempotent");

console.log("sqlite smoke ok");
