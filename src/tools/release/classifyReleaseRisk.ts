import { dirname, resolve } from "node:path";
import type { AgentProfile, EvalResult, ReleaseDecision } from "../../schema/types.js";
import { classifyReleaseRisk as classify } from "../../gate/classifier.js";
import { emitGateSpan } from "../../gate/otel.js";
import { evaluatePolicy, loadPolicy } from "../../gate/ruleEngine.js";
import type { Storage } from "../../storage/Storage.js";
import { assertToolCalls, assertionsFromEvalCases } from "./assertToolCalls.js";

export async function classifyReleaseRisk(profile: AgentProfile, evalResult: EvalResult, options: { profilePath?: string; storage?: Storage } = {}): Promise<ReleaseDecision> {
  const start = Date.now();
  const context = evalResult.context ?? {};
  const profileDir = options.profilePath ? dirname(resolve(options.profilePath)) : process.cwd();
  const policyFailures = (profile.policy_refs ?? []).flatMap((policyRef) => {
    const policyPath = resolve(profileDir, "..", policyRef);
    const policy = loadPolicy(policyPath);
    return evaluatePolicy(policy, context);
  });
  const toolFailures = assertToolCalls(assertionsFromEvalCases(evalResult.cases));
  const previousRuns = options.storage ? await options.storage.getRecentReleaseDecisions(profile.agent_id, 5) : [];
  const decision = classify({
    profile,
    evalResult,
    policyFailures,
    toolFailures,
    previousRuns,
    evidenceRef: evalResult.run_id
  });
  emitGateSpan({
    name: "agentgov.release.verdict",
    agent_id: decision.agent_id,
    verdict: decision.verdict,
    latency_ms: Date.now() - start,
    failure_categories: [...new Set(decision.failures.map((failure) => failure.category))],
    policy_version: decision.policy_version,
    pass_rate: decision.pass_rate,
    critical_failures: decision.critical_failures,
    tool_call_failures: decision.tool_call_failures,
    policy_failures: decision.policy_failures,
    regression_pass_rate_delta_pp: decision.regression?.pass_rate_delta_pp,
    regression_new_failure_categories: decision.regression?.new_failure_categories
  });
  return decision;
}
