import type { ReleaseDecision, StoredDecision, TrustVerdict } from "../schema/types.js";
import type { Storage } from "./Storage.js";

export class DataverseStorage implements Storage {
  async init(): Promise<void> {
    throw new Error("DataverseStorage adapter is documented but not implemented in the local-first MVP");
  }
  async saveTrustVerdict(_verdict: TrustVerdict, _idempotencyKey: string): Promise<StoredDecision> {
    throw new Error("DataverseStorage adapter is documented but not implemented in the local-first MVP");
  }
  async saveReleaseDecision(_decision: ReleaseDecision, _idempotencyKey: string): Promise<StoredDecision> {
    throw new Error("DataverseStorage adapter is documented but not implemented in the local-first MVP");
  }
  async getDecision(_decisionId: string): Promise<StoredDecision | undefined> {
    throw new Error("DataverseStorage adapter is documented but not implemented in the local-first MVP");
  }
  async getRecentReleaseDecisions(_agentId: string, _limit: number): Promise<ReleaseDecision[]> {
    throw new Error("DataverseStorage adapter is documented but not implemented in the local-first MVP");
  }
  async revokeDecision(_decisionId: string, _reason: string, _actor: string): Promise<StoredDecision> {
    throw new Error("DataverseStorage adapter is documented but not implemented in the local-first MVP");
  }
}
