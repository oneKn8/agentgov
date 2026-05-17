import type { AgentProfile, EvalCaseResult } from "../../schema/types.js";

const CATEGORIES = [
  "core_happy_path",
  "missing_evidence",
  "policy_threshold",
  "tool_call_expected",
  "escalation_refusal",
  "multi_turn_context"
];

export function generateReleaseTests(profile: AgentProfile): EvalCaseResult[] {
  return CATEGORIES.flatMap((category, categoryIndex) =>
    Array.from({ length: categoryIndex < 4 ? 3 : 2 }, (_, index) => ({
      id: `${profile.agent_id}-${category}-${index + 1}`,
      category,
      passed: true,
      severity: category.includes("policy") || category.includes("tool") ? "high" : "medium",
      expected_tool_calls: category === "tool_call_expected" ? profile.tools.slice(0, 1) : undefined,
      actual_tool_calls: []
    }))
  );
}

export function releaseTestsToCsv(tests: EvalCaseResult[]): string {
  const header = ["id", "category", "severity", "expected_tool_calls"].join(",");
  const rows = tests.map((test) =>
    [
      test.id,
      test.category,
      test.severity ?? "medium",
      (test.expected_tool_calls ?? []).join("|")
    ]
      .map((value) => `"${String(value).replaceAll('"', '""')}"`)
      .join(",")
  );
  return [header, ...rows].join("\n");
}
