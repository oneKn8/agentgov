import type { ReleaseDecision } from "../../schema/types.js";
import type { Storage } from "../../storage/Storage.js";

export async function persistDecision(storage: Storage, decision: ReleaseDecision): Promise<void> {
  await storage.init();
  await storage.saveReleaseDecision(decision, decision.release_id);
}
