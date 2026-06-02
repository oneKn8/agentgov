import { describe, expect, it } from "vitest";
import { attachSignature } from "../../gate/signing.js";
import type { ReleaseDecision } from "../../schema/types.js";
import type { Storage } from "../../storage/Storage.js";
import { persistDecision } from "./persistDecision.js";

function fakeStorage(): Storage & { saved: ReleaseDecision[] } {
  const saved: ReleaseDecision[] = [];
  return {
    saved,
    async init() {},
    async saveReleaseDecision(decision: ReleaseDecision) {
      saved.push(decision);
      return {} as never;
    }
  } as unknown as Storage & { saved: ReleaseDecision[] };
}

function signedDecision(): ReleaseDecision {
  return attachSignature({ release_id: "r1", agent_id: "a1", verdict: "PASS", pass_rate: 95 }) as unknown as ReleaseDecision;
}

describe("persistDecision", () => {
  it("persists a properly signed release decision", async () => {
    const storage = fakeStorage();
    await persistDecision(storage, signedDecision());
    expect(storage.saved).toHaveLength(1);
  });

  it("refuses to persist a decision whose signature does not verify (forged audit record)", async () => {
    const storage = fakeStorage();
    const forged = { release_id: "r1", agent_id: "a1", verdict: "PASS", pass_rate: 95, signature: "tampered" } as unknown as ReleaseDecision;
    await expect(persistDecision(storage, forged)).rejects.toThrow();
    expect(storage.saved).toHaveLength(0);
  });

  it("refuses to persist an unsigned decision", async () => {
    const storage = fakeStorage();
    const unsigned = { release_id: "r1", agent_id: "a1", verdict: "PASS", pass_rate: 95 } as unknown as ReleaseDecision;
    await expect(persistDecision(storage, unsigned)).rejects.toThrow();
    expect(storage.saved).toHaveLength(0);
  });
});
