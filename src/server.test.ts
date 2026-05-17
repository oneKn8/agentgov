import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ReleaseDecision, StoredDecision, TrustVerdict } from "./schema/types.js";

const storedDecisions = new Map<string, StoredDecision>();

vi.mock("./storage/SqliteStorage.js", () => ({
  SqliteStorage: class {
    async init() {}

    async saveTrustVerdict(verdict: TrustVerdict, idempotencyKey: string): Promise<StoredDecision> {
      const record = toStoredDecision({
        decision_id: verdict.decision_id,
        kind: "trust",
        subject_id: verdict.agent_name,
        verdict: verdict.verdict,
        payload_json: JSON.stringify(verdict),
        signature: verdict.signature,
        idempotency_key: idempotencyKey,
        created_at: verdict.created_at
      });
      storedDecisions.set(record.decision_id, record);
      return record;
    }

    async saveReleaseDecision(decision: ReleaseDecision, idempotencyKey: string): Promise<StoredDecision> {
      const record = toStoredDecision({
        decision_id: decision.release_id,
        kind: "release",
        subject_id: decision.agent_id,
        verdict: decision.verdict,
        payload_json: JSON.stringify(decision),
        signature: decision.signature,
        idempotency_key: idempotencyKey,
        created_at: decision.created_at
      });
      storedDecisions.set(record.decision_id, record);
      return record;
    }

    async getDecision(decisionId: string): Promise<StoredDecision | undefined> {
      return storedDecisions.get(decisionId);
    }

    async getRecentReleaseDecisions(): Promise<ReleaseDecision[]> {
      return [];
    }

    async revokeDecision(decisionId: string, reason: string, actor: string): Promise<StoredDecision> {
      const existing = storedDecisions.get(decisionId);
      if (!existing) throw new Error(`Decision not found: ${decisionId}`);
      if (existing.revoked_at) return existing;
      const revoked = {
        ...existing,
        revoked_at: new Date().toISOString(),
        revoked_by: actor,
        revoke_reason: reason
      };
      storedDecisions.set(decisionId, revoked);
      return revoked;
    }
  }
}));

const expectedTools = [
  "inspect_agent_card",
  "verify_card_signature",
  "check_trust_registry",
  "scan_card_metadata",
  "sanitize_agent_card",
  "issue_trust_verdict",
  "generate_release_tests",
  "ingest_eval_results",
  "assert_tool_calls",
  "classify_release_risk",
  "recommend_remediation",
  "compose_release_packet",
  "persist_decision",
  "revoke_release"
];

describe("AgentGov HTTP and MCP server", () => {
  let server: Server;
  let baseUrl: string;
  let releaseId: string;

  beforeAll(async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "agentgov-test-"));
    process.env.AGENTGOV_DB = join(tempDir, "agentgov.db");
    process.env.AGENTGOV_REVOKE_TOKEN = "test-token";
    const { createAgentGovServer } = await import("./server.js");
    const { loadAgentProfile } = await import("./lib/loaders.js");
    const { ingestEvalResults } = await import("./tools/release/ingestEvalResults.js");
    const { classifyReleaseRisk } = await import("./tools/release/classifyReleaseRisk.js");
    const { persistDecision } = await import("./tools/release/persistDecision.js");
    const { SqliteStorage } = await import("./storage/SqliteStorage.js");

    server = createAgentGovServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP server address");
    baseUrl = `http://127.0.0.1:${address.port}`;

    const storage = new SqliteStorage(process.env.AGENTGOV_DB);
    await storage.init();
    const profilePath = "target-agents/vendor-exception.yaml";
    const decision = await classifyReleaseRisk(loadAgentProfile(profilePath), ingestEvalResults("fixtures/eval-results/block.json"), {
      profilePath,
      storage
    });
    await persistDecision(storage, decision);
    releaseId = decision.release_id;
  });

  afterAll(async () => {
    delete process.env.AGENTGOV_DB;
    delete process.env.AGENTGOV_REVOKE_TOKEN;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("returns health and readiness payloads", async () => {
    await expectJson("/healthz", { ok: true, service: "agentgov", version: "0.1.0" });
    await expectJson("/readyz", {
      ok: true,
      checks: {
        storage: "ok",
        trust_registry: "ok",
        trust_gate: "registered",
        release_gate: "registered"
      }
    });
  });

  it("lists exactly the 14 AgentGov MCP tools", async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {}
      })
    });
    expect(response.status).toBe(200);
    const payload = parseSseJson(await response.text()) as { result: { tools: Array<{ name: string }> } };
    expect(payload.result.tools.map((tool) => tool.name)).toEqual(expectedTools);
  });

  it("requires an MCP token when wildcard CORS is enabled", async () => {
    process.env.AGENTGOV_ALLOW_ANY_ORIGIN = "true";
    try {
      const rejected = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {}
        })
      });
      expect(rejected.status).toBe(401);

      process.env.AGENTGOV_MCP_TOKEN = "mcp-test-token";
      const accepted = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "x-agentgov-mcp-token": "mcp-test-token"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: {}
        })
      });
      expect(accepted.status).toBe(200);
    } finally {
      delete process.env.AGENTGOV_ALLOW_ANY_ORIGIN;
      delete process.env.AGENTGOV_MCP_TOKEN;
    }
  });

  it("rejects disallowed CORS origins and unsupported MCP methods", async () => {
    const cors = await fetch(`${baseUrl}/healthz`, {
      headers: { origin: "https://attacker.example" }
    });
    expect(cors.status).toBe(403);

    const mcpGet = await fetch(`${baseUrl}/mcp`);
    expect(mcpGet.status).toBe(405);
  });

  it("verifies trusted and untrusted Agent Card signatures over MCP", async () => {
    const trusted = await callTool<{ valid: boolean }>("verify_card_signature", {
      source: "fixtures/agent-cards/trusted-signed.json",
      offline: true
    });
    expect(trusted.valid).toBe(true);

    const poisoned = await callTool<{ valid: boolean; reason: string }>("verify_card_signature", {
      source: "fixtures/agent-cards/poisoned-injection.json",
      offline: true
    });
    expect(poisoned.valid).toBe(false);
  });

  it("revokes a release through the HTTP API idempotently", async () => {
    const first = await revoke({ reason: "server test", actor: "vitest" });
    expect(first.revoked_by).toBe("vitest");
    expect(first.revoke_reason).toBe("server test");
    expect(first.revoked_at).toEqual(expect.any(String));

    const second = await revoke({ reason: "second request", actor: "other" });
    expect(second.revoked_at).toBe(first.revoked_at);
    expect(second.revoked_by).toBe("vitest");
    expect(second.revoke_reason).toBe("server test");
  });

  it("rejects missing auth and malformed request bodies", async () => {
    const unauthorized = await fetch(`${baseUrl}/releases/${releaseId}/revoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "bad", actor: "bad" })
    });
    expect(unauthorized.status).toBe(401);

    const malformed = await fetch(`${baseUrl}/releases/${releaseId}/revoke`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agentgov-revoke-token": "test-token"
      },
      body: "{"
    });
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({ error: "invalid_json" });

    const wrongType = await fetch(`${baseUrl}/releases/${releaseId}/revoke`, {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        "x-agentgov-revoke-token": "test-token"
      },
      body: "not json"
    });
    expect(wrongType.status).toBe(415);

    const tooLarge = await fetch(`${baseUrl}/releases/${releaseId}/revoke`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agentgov-revoke-token": "test-token"
      },
      body: JSON.stringify({ payload: "x".repeat(1024 * 1024) })
    });
    expect(tooLarge.status).toBe(413);
  });

  async function revoke(body: { reason: string; actor: string }) {
    const response = await fetch(`${baseUrl}/releases/${releaseId}/revoke`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agentgov-revoke-token": "test-token"
      },
      body: JSON.stringify(body)
    });
    expect(response.status).toBe(200);
    return response.json() as Promise<{ revoked_at: string; revoked_by: string; revoke_reason: string }>;
  }

  async function expectJson(path: string, expected: Record<string, unknown>): Promise<void> {
    const response = await fetch(`${baseUrl}${path}`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject(expected);
  }

  async function callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: { name, arguments: args }
      })
    });
    expect(response.status).toBe(200);
    const payload = parseSseJson(await response.text()) as { result: { content: Array<{ text: string }> } };
    return JSON.parse(payload.result.content[0].text) as T;
  }
});

function toStoredDecision(input: Omit<StoredDecision, "revoked_at" | "revoked_by" | "revoke_reason">): StoredDecision {
  return input;
}

function parseSseJson(text: string): unknown {
  const dataLine = text.split("\n").find((line) => line.startsWith("data: "));
  if (!dataLine) throw new Error(`No SSE data line found: ${text}`);
  return JSON.parse(dataLine.slice("data: ".length));
}
