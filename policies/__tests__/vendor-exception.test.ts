import { describe, expect, it } from "vitest";
import { evaluatePolicy, loadPolicy } from "../../src/gate/ruleEngine.js";

describe("vendor exception policy", () => {
  const policy = loadPolicy("policies/vendor-exception.yaml");

  it("blocks a high-risk vendor exception without policy lookup or approval", () => {
    const failures = evaluatePolicy(policy, {
      amount_usd: 50000,
      vendor_tier: "non_preferred",
      approval_chain: "auto_approved",
      vendor_selection: "sole_source",
      evidence_doc_ref: "",
      fraud_signal: true,
      escalated_to: "none",
      tool_calls: {
        policy_lookup_called: false
      }
    });
    expect(failures.map((failure) => failure.id)).toEqual(
      expect.arrayContaining([
        "VEP-001-tool-call-required",
        "VEP-003-threshold-50k-manager",
        "VEP-005-sole-source-review",
        "VEP-006-evidence-required",
        "VEP-007-escalation-fraud-signal"
      ])
    );
  });

  it("does not flag a preferred under-10k request with evidence and policy lookup", () => {
    const failures = evaluatePolicy(policy, {
      amount_usd: 7500,
      vendor_tier: "preferred",
      approval_chain: "",
      vendor_selection: "competitive",
      evidence_doc_ref: "sharepoint://evidence/vendor-exception-123",
      fraud_signal: false,
      escalated_to: "",
      tool_calls: {
        policy_lookup_called: true
      }
    });
    expect(failures).toHaveLength(0);
  });
});
