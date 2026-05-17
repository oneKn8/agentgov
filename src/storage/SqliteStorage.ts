import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ReleaseDecision, StoredDecision, TrustVerdict } from "../schema/types.js";
import type { Storage } from "./Storage.js";

export class SqliteStorage implements Storage {
  private db?: DatabaseSync;

  constructor(private readonly path = process.env.AGENTGOV_DB ?? "outputs/agentgov.db") {}

  async init(): Promise<void> {
    mkdirSync(dirname(this.path), { recursive: true });
    this.db = new DatabaseSync(this.path);
    this.db.exec(`
      create table if not exists decisions (
        decision_id text primary key,
        kind text not null,
        subject_id text not null,
        verdict text not null,
        payload_json text not null,
        signature text,
        idempotency_key text not null unique,
        revoked_at text,
        revoked_by text,
        revoke_reason text,
        created_at text not null
      );
      create index if not exists idx_decisions_subject_kind on decisions(subject_id, kind, created_at desc);
    `);
  }

  async saveTrustVerdict(verdict: TrustVerdict, idempotencyKey: string): Promise<StoredDecision> {
    return this.save({
      decision_id: verdict.decision_id,
      kind: "trust",
      subject_id: verdict.agent_name,
      verdict: verdict.verdict,
      payload_json: JSON.stringify(verdict),
      signature: verdict.signature,
      idempotency_key: idempotencyKey,
      created_at: verdict.created_at
    });
  }

  async saveReleaseDecision(decision: ReleaseDecision, idempotencyKey: string): Promise<StoredDecision> {
    return this.save({
      decision_id: decision.release_id,
      kind: "release",
      subject_id: decision.agent_id,
      verdict: decision.verdict,
      payload_json: JSON.stringify(decision),
      signature: decision.signature,
      idempotency_key: idempotencyKey,
      created_at: decision.created_at
    });
  }

  async getDecision(decisionId: string): Promise<StoredDecision | undefined> {
    const row = this.database()
      .prepare("select * from decisions where decision_id = ?")
      .get(decisionId) as StoredDecision | undefined;
    return row;
  }

  async getRecentReleaseDecisions(agentId: string, limit: number): Promise<ReleaseDecision[]> {
    const rows = this.database()
      .prepare("select payload_json from decisions where kind = 'release' and subject_id = ? order by created_at desc limit ?")
      .all(agentId, limit) as Array<{ payload_json: string }>;
    return rows.map((row) => JSON.parse(row.payload_json) as ReleaseDecision);
  }

  async revokeDecision(decisionId: string, reason: string, actor: string): Promise<StoredDecision> {
    const now = new Date().toISOString();
    const db = this.database();
    db.prepare("update decisions set revoked_at = ?, revoked_by = ?, revoke_reason = ? where decision_id = ?").run(
      now,
      actor,
      reason,
      decisionId
    );
    const record = await this.getDecision(decisionId);
    if (!record) throw new Error(`Decision not found: ${decisionId}`);
    return record;
  }

  private save(input: Omit<StoredDecision, "revoked_at" | "revoked_by" | "revoke_reason">): StoredDecision {
    const db = this.database();
    const existing = db
      .prepare("select * from decisions where idempotency_key = ?")
      .get(input.idempotency_key) as StoredDecision | undefined;
    if (existing) return existing;

    db.prepare(
      `insert into decisions
       (decision_id, kind, subject_id, verdict, payload_json, signature, idempotency_key, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.decision_id,
      input.kind,
      input.subject_id,
      input.verdict,
      input.payload_json,
      input.signature ?? null,
      input.idempotency_key,
      input.created_at
    );
    return input;
  }

  private database(): DatabaseSync {
    if (!this.db) throw new Error("Storage not initialized");
    return this.db;
  }
}
