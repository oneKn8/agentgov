import type { ReleaseDecision, StoredDecision, TrustVerdict } from "../schema/types.js";

export interface Storage {
  init(): Promise<void>;
  saveTrustVerdict(verdict: TrustVerdict, idempotencyKey: string): Promise<StoredDecision>;
  saveReleaseDecision(decision: ReleaseDecision, idempotencyKey: string): Promise<StoredDecision>;
  getDecision(decisionId: string): Promise<StoredDecision | undefined>;
  getRecentReleaseDecisions(agentId: string, limit: number): Promise<ReleaseDecision[]>;
  revokeDecision(decisionId: string, reason: string, actor: string): Promise<StoredDecision>;
}
