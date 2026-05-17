import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { verifyCardSignature } from "../tools/trust/verifyCardSignature.js";
import { checkTrustRegistry, loadTrustRegistry, secretsByKid } from "../tools/trust/checkTrustRegistry.js";
import { inspectAgentCard } from "../tools/trust/inspectAgentCard.js";
import { scanCardMetadata } from "../tools/trust/scanCardMetadata.js";
import { sanitizeAgentCard } from "../tools/trust/sanitizeAgentCard.js";
import { issueTrustVerdict } from "../tools/trust/issueTrustVerdict.js";
import { loadAgentProfile } from "../lib/loaders.js";
import { generateReleaseTests } from "../tools/release/generateReleaseTests.js";
import { ingestEvalResults } from "../tools/release/ingestEvalResults.js";
import { assertToolCalls, assertionsFromEvalCases } from "../tools/release/assertToolCalls.js";
import { classifyReleaseRisk } from "../tools/release/classifyReleaseRisk.js";
import { recommendRemediation } from "../tools/release/recommendRemediation.js";
import { composeReleasePacket } from "../tools/release/composeReleasePacket.js";
import { persistDecision } from "../tools/release/persistDecision.js";
import { revokeRelease } from "../tools/release/revokeRelease.js";
import { SqliteStorage } from "../storage/SqliteStorage.js";

const cardSourceSchema = {
  source: z.string().describe("Agent Card URL or local JSON fixture path"),
  offline: z.boolean().optional().default(false).describe("Read source from local disk instead of HTTP"),
  registry: z.string().optional().default("trust-registry.json").describe("Trust registry JSON path")
};

const releaseSchema = {
  profile_path: z.string().describe("Target agent profile YAML path"),
  eval_path: z.string().describe("Evaluation result JSON path")
};

export function registerAgentGovTools(server: McpServer): void {
  server.registerTool(
    "inspect_agent_card",
    {
      title: "Inspect A2A Agent Card",
      description: "Fetch or load an A2A Agent Card and normalize the payload.",
      inputSchema: cardSourceSchema
    },
    async ({ source, offline }) => jsonResult(await inspectAgentCard(source, offline))
  );

  server.registerTool(
    "verify_card_signature",
    {
      title: "Verify Agent Card Signature",
      description: "Verify the first Agent Card signature against pinned trust-registry keys.",
      inputSchema: cardSourceSchema
    },
    async ({ source, offline, registry }) => {
      const card = await inspectAgentCard(source, offline);
      const trustRegistry = loadTrustRegistry(registry);
      return jsonResult(verifyCardSignature(card, secretsByKid(trustRegistry)));
    }
  );

  server.registerTool(
    "check_trust_registry",
    {
      title: "Check Trust Registry",
      description: "Check provider/domain/skill membership against the tenant trust registry.",
      inputSchema: cardSourceSchema
    },
    async ({ source, offline, registry }) => {
      const card = await inspectAgentCard(source, offline);
      return jsonResult(checkTrustRegistry(card, loadTrustRegistry(registry)));
    }
  );

  server.registerTool(
    "scan_card_metadata",
    {
      title: "Scan Agent Card Metadata",
      description: "Detect prompt-injection, exfiltration, and unsafe instruction text in Agent Card metadata.",
      inputSchema: cardSourceSchema
    },
    async ({ source, offline }) => jsonResult(scanCardMetadata(await inspectAgentCard(source, offline)))
  );

  server.registerTool(
    "sanitize_agent_card",
    {
      title: "Sanitize Agent Card",
      description: "Return a safe orchestration summary for an Agent Card.",
      inputSchema: cardSourceSchema
    },
    async ({ source, offline }) => jsonResult(sanitizeAgentCard(await inspectAgentCard(source, offline)))
  );

  server.registerTool(
    "issue_trust_verdict",
    {
      title: "Issue Trust Verdict",
      description: "Issue a signed ALLOW / ALLOW_SANITIZED / REVIEW / BLOCK trust verdict.",
      inputSchema: cardSourceSchema
    },
    async ({ source, offline, registry }) => {
      const card = await inspectAgentCard(source, offline);
      const verdict = issueTrustVerdict(card, loadTrustRegistry(registry));
      await withStorage((storage) => storage.saveTrustVerdict(verdict, verdict.decision_id));
      return jsonResult(verdict);
    }
  );

  server.registerTool(
    "generate_release_tests",
    {
      title: "Generate Release Tests",
      description: "Generate a structured release test set from a target agent profile.",
      inputSchema: { profile_path: z.string() }
    },
    async ({ profile_path }) => jsonResult(generateReleaseTests(loadAgentProfile(profile_path)))
  );

  server.registerTool(
    "ingest_eval_results",
    {
      title: "Ingest Eval Results",
      description: "Validate and normalize Copilot Studio Evaluation API shaped JSON or local fixture output.",
      inputSchema: { eval_path: z.string() }
    },
    async ({ eval_path }) => jsonResult(ingestEvalResults(eval_path))
  );

  server.registerTool(
    "assert_tool_calls",
    {
      title: "Assert Tool Calls",
      description: "Compare expected tool calls with actual tool calls from eval cases.",
      inputSchema: { eval_path: z.string() }
    },
    async ({ eval_path }) => jsonResult(assertToolCalls(assertionsFromEvalCases(ingestEvalResults(eval_path).cases)))
  );

  server.registerTool(
    "classify_release_risk",
    {
      title: "Classify Release Risk",
      description: "Issue a signed PASS / WARN / BLOCK release decision from profile, policy, and eval evidence.",
      inputSchema: releaseSchema
    },
    async ({ profile_path, eval_path }) => {
      const decision = await classifyReleaseRisk(loadAgentProfile(profile_path), ingestEvalResults(eval_path), {
        profilePath: profile_path,
        storage: await initializedStorage()
      });
      return jsonResult(decision);
    }
  );

  server.registerTool(
    "recommend_remediation",
    {
      title: "Recommend Remediation",
      description: "Return a de-duplicated remediation checklist for a release decision.",
      inputSchema: releaseSchema
    },
    async ({ profile_path, eval_path }) => {
      const decision = await classifyReleaseRisk(loadAgentProfile(profile_path), ingestEvalResults(eval_path), {
        profilePath: profile_path,
        storage: await initializedStorage()
      });
      return jsonResult(recommendRemediation(decision.failures));
    }
  );

  server.registerTool(
    "compose_release_packet",
    {
      title: "Compose Release Packet",
      description: "Generate Markdown and HTML release packet for human reviewer signoff.",
      inputSchema: releaseSchema
    },
    async ({ profile_path, eval_path }) => {
      const decision = await classifyReleaseRisk(loadAgentProfile(profile_path), ingestEvalResults(eval_path), {
        profilePath: profile_path,
        storage: await initializedStorage()
      });
      return jsonResult(composeReleasePacket(decision));
    }
  );

  server.registerTool(
    "persist_decision",
    {
      title: "Persist Release Decision",
      description: "Persist an idempotent signed release decision to local-first storage.",
      inputSchema: releaseSchema
    },
    async ({ profile_path, eval_path }) => {
      const storage = await initializedStorage();
      const decision = await classifyReleaseRisk(loadAgentProfile(profile_path), ingestEvalResults(eval_path), {
        profilePath: profile_path,
        storage
      });
      await persistDecision(storage, decision);
      return jsonResult(decision);
    }
  );

  server.registerTool(
    "revoke_release",
    {
      title: "Revoke Release",
      description: "Revoke a release decision and append revocation metadata to the audit record.",
      inputSchema: {
        release_id: z.string(),
        reason: z.string(),
        actor: z.string().optional().default("mcp-user")
      }
    },
    async ({ release_id, reason, actor }) => jsonResult(await revokeRelease(await initializedStorage(), release_id, reason, actor))
  );
}

async function initializedStorage(): Promise<SqliteStorage> {
  const storage = new SqliteStorage();
  await storage.init();
  return storage;
}

async function withStorage<T>(fn: (storage: SqliteStorage) => Promise<T>): Promise<T> {
  return fn(await initializedStorage());
}

function jsonResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}
