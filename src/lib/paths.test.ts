import { describe, expect, it } from "vitest";
import { resolveWorkspaceFile } from "./paths.js";

describe("workspace path guard", () => {
  it("allows files inside the AgentGov workspace", () => {
    expect(resolveWorkspaceFile("trust-registry.json")).toMatch(/trust-registry\.json$/);
  });

  it("rejects files outside the AgentGov workspace", () => {
    expect(() => resolveWorkspaceFile("/etc/passwd")).toThrow(/outside AgentGov workspace/);
  });
});
