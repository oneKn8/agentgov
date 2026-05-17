export type Verdict = "ALLOW" | "ALLOW_SANITIZED" | "REVIEW" | "BLOCK";
export type ReleaseVerdict = "PASS" | "WARN" | "BLOCK";
export type Severity = "low" | "medium" | "high" | "critical";

export interface AgentSkill {
  id?: string;
  name: string;
  description?: string;
  examples?: string[];
}

export interface AgentCard {
  name: string;
  description?: string;
  url?: string;
  provider?: {
    organization?: string;
    url?: string;
  };
  skills?: AgentSkill[];
  signatures?: Array<{
    protected?: string;
    signature: string;
    header?: {
      alg?: string;
      kid?: string;
    };
  }>;
  [key: string]: unknown;
}

export interface TrustFinding {
  id: string;
  severity: Severity;
  field: string;
  message: string;
  evidence?: string;
}

export interface TrustVerdict {
  decision_id: string;
  agent_name: string;
  source: string;
  verdict: Verdict;
  risk_score: number;
  reasons: string[];
  findings: TrustFinding[];
  sanitized_card?: Pick<AgentCard, "name" | "description" | "url" | "provider" | "skills">;
  registry_match?: boolean;
  signature_valid?: boolean;
  policy_version?: string;
  created_at: string;
  signature?: string;
}

export interface EvalCaseResult {
  id: string;
  category: string;
  passed: boolean;
  severity?: Severity;
  expected_tool_calls?: string[];
  actual_tool_calls?: string[];
  message?: string;
}

export interface EvalResult {
  agent_id: string;
  run_id: string;
  pass_rate: number;
  cases: EvalCaseResult[];
  created_at?: string;
}

export interface AgentProfile {
  agent_id: string;
  name: string;
  owner: string;
  purpose: string;
  audience: string;
  risk_tier: "low" | "medium" | "high";
  tools: string[];
  required_evidence?: string[];
  policy_refs?: string[];
}

export interface ReleaseFailure {
  id: string;
  category: "policy" | "tool_call" | "safety" | "regression" | "evidence" | "quality";
  severity: Severity;
  message: string;
  remediation?: string;
}

export interface ReleaseDecision {
  release_id: string;
  agent_id: string;
  agent_name: string;
  verdict: ReleaseVerdict;
  pass_rate: number;
  critical_failures: number;
  tool_call_failures: number;
  policy_failures: number;
  root_causes: string[];
  recommended_fixes: string[];
  owner: string;
  approval_deadline: string;
  created_at: string;
  evidence_ref: string;
  policy_version?: string;
  regression?: {
    compared_runs: number;
    pass_rate_delta_pp: number;
    new_failure_categories: string[];
  };
  failures: ReleaseFailure[];
  signature?: string;
}

export interface StoredDecision {
  decision_id: string;
  kind: "trust" | "release";
  subject_id: string;
  verdict: string;
  payload_json: string;
  signature?: string;
  idempotency_key: string;
  revoked_at?: string;
  revoked_by?: string;
  revoke_reason?: string;
  created_at: string;
}
