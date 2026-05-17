import type { Storage } from "../../storage/Storage.js";

export async function revokeRelease(storage: Storage, releaseId: string, reason: string, actor = "local-user") {
  await storage.init();
  return storage.revokeDecision(releaseId, reason, actor);
}
