import { describe, expect, it } from "vitest";
import type { AgentProfile, EvalResult, ReleaseDecision } from "../schema/types.js";
import { classifyReleaseRisk } from "./classifier.js";

function profile(over: Partial<AgentProfile> = {}): AgentProfile {
  return { agent_id: "a1", name: "Agent One", owner: "owner@example.com", required_evidence: [], policy_refs: [], ...over } as AgentProfile;
}

function evalResult(pass_rate: number): EvalResult {
  return { agent_id: "a1", run_id: `r-${pass_rate}`, pass_rate, context: {}, cases: [] } as EvalResult;
}

function prior(pass_rate: number): ReleaseDecision {
  return { pass_rate, failures: [] } as unknown as ReleaseDecision;
}

describe("classifyReleaseRisk regression handling", () => {
  it("PASSes a clean high-scoring run with no history", () => {
    const decision = classifyReleaseRisk({ profile: profile(), evalResult: evalResult(98), previousRuns: [] });
    expect(decision.verdict).toBe("PASS");
  });

  // R1 — a single prior run is not a baseline; one good run must not flip the next to BLOCK
  it("does not BLOCK on regression when there are fewer than 3 prior runs", () => {
    const decision = classifyReleaseRisk({ profile: profile(), evalResult: evalResult(82), previousRuns: [prior(98)] });
    expect(decision.verdict).toBe("WARN");
    expect(decision.failures.some((f) => f.category === "regression")).toBe(false);
  });

  // R1 — when regression does fire (>=3 priors), it is a WARN-grade signal, never a standalone BLOCK
  it("treats a detected regression as a WARN, not a BLOCK", () => {
    const decision = classifyReleaseRisk({
      profile: profile(),
      evalResult: evalResult(92),
      previousRuns: [prior(99), prior(99), prior(99)]
    });
    expect(decision.verdict).toBe("WARN");
    const regression = decision.failures.find((f) => f.category === "regression");
    expect(regression?.severity).toBe("medium");
  });
});

describe("classifyReleaseRisk evidence handling", () => {
  // R3 — evidence may be declared explicitly, not only inferred from case id substrings
  it("accepts required evidence declared via the eval evidence[] field", () => {
    const decision = classifyReleaseRisk({
      profile: profile({ required_evidence: ["audit_trail"] }),
      evalResult: {
        agent_id: "a1",
        run_id: "r-evidence",
        pass_rate: 98,
        context: {},
        evidence: ["audit_trail"],
        cases: [{ id: "unrelated-case", category: "core_happy_path", passed: true, severity: "low" }]
      } as unknown as EvalResult,
      previousRuns: []
    });
    expect(decision.failures.some((f) => f.category === "evidence")).toBe(false);
    expect(decision.verdict).toBe("PASS");
  });

  it("flags missing evidence when it is neither declared nor matched by a case id", () => {
    const decision = classifyReleaseRisk({
      profile: profile({ required_evidence: ["audit_trail"] }),
      evalResult: evalResult(98),
      previousRuns: []
    });
    expect(decision.failures.some((f) => f.category === "evidence")).toBe(true);
  });
});
