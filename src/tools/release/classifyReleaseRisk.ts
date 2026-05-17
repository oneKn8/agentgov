import { dirname, resolve } from "node:path";
import type { AgentProfile, EvalResult, ReleaseDecision } from "../../schema/types.js";
import { classifyReleaseRisk as classify } from "../../gate/classifier.js";
import { evaluatePolicy, loadPolicy } from "../../gate/ruleEngine.js";
import type { Storage } from "../../storage/Storage.js";
import { assertToolCalls, assertionsFromEvalCases } from "./assertToolCalls.js";

export async function classifyReleaseRisk(profile: AgentProfile, evalResult: EvalResult, options: { profilePath?: string; storage?: Storage } = {}): Promise<ReleaseDecision> {
  const context = evalResult.context ?? {};
  const profileDir = options.profilePath ? dirname(resolve(options.profilePath)) : process.cwd();
  const policyFailures = (profile.policy_refs ?? []).flatMap((policyRef) => {
    const policyPath = resolve(profileDir, "..", policyRef);
    const policy = loadPolicy(policyPath);
    return evaluatePolicy(policy, context);
  });
  const toolFailures = assertToolCalls(assertionsFromEvalCases(evalResult.cases));
  const previousRuns = options.storage ? await options.storage.getRecentReleaseDecisions(profile.agent_id, 5) : [];
  return classify({
    profile,
    evalResult,
    policyFailures,
    toolFailures,
    previousRuns,
    evidenceRef: evalResult.run_id
  });
}
