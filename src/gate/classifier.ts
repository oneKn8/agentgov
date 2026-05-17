import type { AgentProfile, EvalResult, ReleaseDecision, ReleaseFailure } from "../schema/types.js";
import { attachSignature } from "./signing.js";

export interface ReleaseClassificationInput {
  profile: AgentProfile;
  evalResult: EvalResult;
  policyFailures?: ReleaseFailure[];
  toolFailures?: ReleaseFailure[];
  evidenceRef?: string;
  previousRuns?: ReleaseDecision[];
}

export function classifyReleaseRisk(input: ReleaseClassificationInput): ReleaseDecision {
  const failures = [
    ...failEvalCases(input.evalResult),
    ...(input.policyFailures ?? []),
    ...(input.toolFailures ?? [])
  ];
  const regression = detectRegression(input.evalResult, failures, input.previousRuns ?? []);
  if (regression.pass_rate_delta_pp <= -5 || regression.new_failure_categories.length > 0) {
    failures.push({
      id: "regression-detected",
      category: "regression",
      severity: "high",
      message: `Regression detected: pass rate changed ${regression.pass_rate_delta_pp}pp with new categories ${regression.new_failure_categories.join(", ") || "none"}`,
      remediation: "Review recent instruction/tool/policy changes and rerun release gate."
    });
  }

  for (const evidence of input.profile.required_evidence ?? []) {
    if (!input.evalResult.cases.some((test) => test.id.includes(evidence) || test.category.includes(evidence))) {
      failures.push({
        id: `missing-evidence-${evidence}`,
        category: "evidence",
        severity: "high",
        message: `Required evidence is missing: ${evidence}`,
        remediation: `Attach or generate evidence for ${evidence} before release.`
      });
    }
  }

  const critical = failures.filter((failure) => failure.severity === "critical").length;
  const high = failures.filter((failure) => failure.severity === "high").length;
  const verdict = critical > 0 || high > 0 || input.evalResult.pass_rate < 70 ? "BLOCK" : input.evalResult.pass_rate < 90 || failures.length > 0 ? "WARN" : "PASS";
  const created_at = new Date().toISOString();
  const decision: ReleaseDecision = {
    release_id: `${input.profile.agent_id}-${input.evalResult.run_id}`,
    agent_id: input.profile.agent_id,
    agent_name: input.profile.name,
    verdict,
    pass_rate: input.evalResult.pass_rate,
    critical_failures: critical,
    tool_call_failures: failures.filter((failure) => failure.category === "tool_call").length,
    policy_failures: failures.filter((failure) => failure.category === "policy").length,
    root_causes: summarizeRootCauses(failures),
    recommended_fixes: [...new Set(failures.map((failure) => failure.remediation).filter(Boolean) as string[])],
    owner: input.profile.owner,
    approval_deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    created_at,
    evidence_ref: input.evidenceRef ?? input.evalResult.run_id,
    policy_version: input.profile.policy_refs?.join(","),
    regression,
    failures
  };
  return attachSignature(decision as unknown as Record<string, unknown>) as unknown as ReleaseDecision;
}

type RegressionSummary = NonNullable<ReleaseDecision["regression"]>;

export function detectRegression(current: EvalResult, failures: ReleaseFailure[], previousRuns: ReleaseDecision[]): RegressionSummary {
  const baseline = previousRuns.length
    ? previousRuns.reduce((sum, run) => sum + run.pass_rate, 0) / previousRuns.length
    : current.pass_rate;
  const previousCategories = new Set(previousRuns.flatMap((run) => run.failures.map((failure) => failure.category)));
  const currentCategories = new Set(failures.map((failure) => failure.category));
  const newCategories = [...currentCategories].filter((category) => !previousCategories.has(category));
  return {
    compared_runs: previousRuns.length,
    pass_rate_delta_pp: Math.round((current.pass_rate - baseline) * 10) / 10,
    new_failure_categories: previousRuns.length ? newCategories : []
  };
}

function failEvalCases(evalResult: EvalResult): ReleaseFailure[] {
  return evalResult.cases
    .filter((test) => !test.passed)
    .map((test) => ({
      id: test.id,
      category: test.category.includes("tool") ? "tool_call" : test.category.includes("policy") ? "policy" : "quality",
      severity: test.severity ?? "medium",
      message: test.message ?? `Evaluation failed: ${test.id}`,
      remediation: `Fix ${test.category} behavior and rerun test ${test.id}.`
    }));
}

function summarizeRootCauses(failures: ReleaseFailure[]): string[] {
  const byCategory = new Map<string, number>();
  for (const failure of failures) {
    byCategory.set(failure.category, (byCategory.get(failure.category) ?? 0) + 1);
  }
  return [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => `${category}: ${count} finding${count === 1 ? "" : "s"}`);
}
