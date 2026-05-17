import type { ReleaseFailure, Severity } from "../../schema/types.js";

export interface ToolCallAssertion {
  id: string;
  expected: string[];
  actual: string[];
  severity?: Severity;
}

export function assertToolCalls(assertions: ToolCallAssertion[]): ReleaseFailure[] {
  return assertions.flatMap((assertion) => {
    const missing = assertion.expected.filter((tool) => !assertion.actual.includes(tool));
    if (missing.length === 0) return [];
    return [
      {
        id: assertion.id,
        category: "tool_call" as const,
        severity: assertion.severity ?? "critical",
        message: `Missing required tool calls: ${missing.join(", ")}`,
        remediation: `Require tool calls before recommendation: ${missing.join(", ")}.`
      }
    ];
  });
}

export function assertionsFromEvalCases(cases: Array<{ id: string; expected_tool_calls?: string[]; actual_tool_calls?: string[]; severity?: Severity }>): ToolCallAssertion[] {
  return cases
    .filter((test) => (test.expected_tool_calls ?? []).length > 0)
    .map((test) => ({
      id: `tool-assertion-${test.id}`,
      expected: test.expected_tool_calls ?? [],
      actual: test.actual_tool_calls ?? [],
      severity: test.severity
    }));
}
