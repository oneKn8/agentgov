import type { ReleaseDecision } from "../../schema/types.js";
import type { Storage } from "../../storage/Storage.js";
import { verifySignature } from "../../gate/signing.js";

export async function persistDecision(storage: Storage, decision: ReleaseDecision): Promise<void> {
  // The audit store only holds decisions AgentGov itself signed. Refuse to write
  // a decision whose signature is missing or does not verify so a client cannot
  // inject a forged PASS into the tamper-evident trail.
  if (!verifySignature(decision as unknown as Record<string, unknown>)) {
    throw new Error("Refusing to persist release decision: signature is missing or does not verify");
  }
  await storage.init();
  await storage.saveReleaseDecision(decision, decision.release_id);
}
