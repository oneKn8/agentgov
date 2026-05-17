import { mkdirSync, writeFileSync } from "node:fs";

const schemas = {
  "trust-verdict.schema.json": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "AgentGov TrustVerdict",
    type: "object",
    required: ["decision_id", "agent_name", "source", "verdict", "risk_score", "reasons", "findings", "created_at"],
    properties: {
      decision_id: { type: "string" },
      agent_name: { type: "string" },
      source: { type: "string" },
      verdict: { enum: ["ALLOW", "ALLOW_SANITIZED", "REVIEW", "BLOCK"] },
      risk_score: { type: "number", minimum: 0, maximum: 100 },
      reasons: { type: "array", items: { type: "string" } },
      findings: { type: "array", items: { type: "object" } },
      sanitized_card: { type: "object" },
      registry_match: { type: "boolean" },
      signature_valid: { type: "boolean" },
      policy_version: { type: "string" },
      created_at: { type: "string", format: "date-time" },
      signature: { type: "string" }
    }
  },
  "release-decision.schema.json": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "AgentGov ReleaseDecision",
    type: "object",
    required: [
      "release_id",
      "agent_id",
      "agent_name",
      "verdict",
      "pass_rate",
      "critical_failures",
      "tool_call_failures",
      "policy_failures",
      "root_causes",
      "recommended_fixes",
      "owner",
      "approval_deadline",
      "created_at",
      "evidence_ref",
      "failures"
    ],
    properties: {
      release_id: { type: "string" },
      agent_id: { type: "string" },
      agent_name: { type: "string" },
      verdict: { enum: ["PASS", "WARN", "BLOCK"] },
      pass_rate: { type: "number", minimum: 0, maximum: 100 },
      critical_failures: { type: "number" },
      tool_call_failures: { type: "number" },
      policy_failures: { type: "number" },
      root_causes: { type: "array", items: { type: "string" } },
      recommended_fixes: { type: "array", items: { type: "string" } },
      owner: { type: "string" },
      approval_deadline: { type: "string", format: "date-time" },
      created_at: { type: "string", format: "date-time" },
      evidence_ref: { type: "string" },
      failures: { type: "array", items: { type: "object" } },
      signature: { type: "string" }
    }
  }
};

mkdirSync("schemas", { recursive: true });
for (const [name, schema] of Object.entries(schemas)) {
  writeFileSync(`schemas/${name}`, `${JSON.stringify(schema, null, 2)}\n`);
}
