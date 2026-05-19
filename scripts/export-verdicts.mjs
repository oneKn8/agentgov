#!/usr/bin/env node
// Dumps the AgentGov SQLite store + OTel span JSONL into a single static-viewer JSON.
// Reads:   outputs/agentgov.db, outputs/otel-spans.jsonl
// Writes:  docs/viewer/verdicts.json
//
// Uses Node 22's built-in node:sqlite — no extra deps.

import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const dbPath = process.env.AGENTGOV_DB ?? resolve(repoRoot, "outputs/agentgov.db");
const spansPath = process.env.AGENTGOV_OTEL_FILE ?? resolve(repoRoot, "outputs/otel-spans.jsonl");
const outPath = resolve(repoRoot, "docs/viewer/verdicts.json");

// Convert a resolved path to a repo-relative form for the committable export.
// Never emit absolute paths — they leak workstation/user identifiers when this
// file is committed or shared as a demo artifact (caught in PR #10 review).
function repoRel(p) {
  const rel = relative(repoRoot, p);
  return rel.startsWith("..") ? p : rel;
}

if (!existsSync(dbPath)) {
  console.error(`error: SQLite store not found at ${dbPath}`);
  console.error("Run a few CLI gates first (e.g. agentgov trust check fixtures/agent-cards/poisoned-injection.json --offline)");
  process.exit(1);
}

const db = new DatabaseSync(dbPath);
const rows = db.prepare("select * from decisions order by created_at desc").all();

// Index spans by agent_id so we can join lightly. Multiple spans per agent are kept;
// the viewer picks the closest by timestamp on click.
const spans = [];
if (existsSync(spansPath)) {
  const raw = readFileSync(spansPath, "utf8");
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      spans.push(JSON.parse(line));
    } catch {
      // Skip malformed lines silently — JSONL is append-only and may have a partial tail.
    }
  }
}

const decisions = rows.map((row) => {
  let payload;
  try {
    payload = JSON.parse(row.payload_json);
  } catch {
    payload = { _parse_error: true, raw: row.payload_json };
  }

  // Find the OTel span whose agent matches and whose timestamp is closest to created_at.
  const subjectMatches = spans.filter(
    (s) => s?.attributes?.["agentgov.agent_id"] === row.subject_id
  );
  let span = null;
  if (subjectMatches.length > 0) {
    const createdMs = Date.parse(row.created_at);
    span = subjectMatches.reduce((best, candidate) => {
      const candMs = Date.parse(candidate.timestamp);
      const bestMs = best ? Date.parse(best.timestamp) : Infinity;
      return Math.abs(candMs - createdMs) < Math.abs(bestMs - createdMs) ? candidate : best;
    }, null);
  }

  return {
    decision_id: row.decision_id,
    kind: row.kind,
    subject_id: row.subject_id,
    verdict: row.verdict,
    signature: row.signature,
    idempotency_key: row.idempotency_key,
    revoked_at: row.revoked_at,
    revoked_by: row.revoked_by,
    revoke_reason: row.revoke_reason,
    created_at: row.created_at,
    payload,
    span
  };
});

const summary = {
  generated_at: new Date().toISOString(),
  source_db: repoRel(dbPath),
  source_spans: existsSync(spansPath) ? repoRel(spansPath) : null,
  db_size_bytes: statSync(dbPath).size,
  total_decisions: decisions.length,
  by_kind: countBy(decisions, (d) => d.kind),
  by_verdict: countBy(decisions, (d) => d.verdict),
  revoked: decisions.filter((d) => d.revoked_at).length,
  decisions
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(summary, null, 2));

const rel = outPath.replace(`${repoRoot}/`, "");
console.log(`wrote ${decisions.length} decisions to ${rel} (${formatBytes(summary.db_size_bytes)} source db)`);

function countBy(list, key) {
  const out = {};
  for (const item of list) {
    const k = key(item) ?? "(null)";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function formatBytes(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}
