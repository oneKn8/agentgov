import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

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

const port = await getAvailablePort();
const tempDir = mkdtempSync(join(tmpdir(), "agentgov-mcp-smoke-"));
const server = spawn(process.execPath, ["dist/server.js"], {
  env: {
    ...process.env,
    PORT: String(port),
    AGENTGOV_DB: join(tempDir, "agentgov.db")
  },
  stdio: ["ignore", "pipe", "pipe"]
});

const logs = { stdout: "", stderr: "" };
server.stdout.setEncoding("utf8");
server.stderr.setEncoding("utf8");
server.stdout.on("data", (chunk) => {
  logs.stdout += chunk;
});
server.stderr.on("data", (chunk) => {
  logs.stderr += chunk;
});

try {
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHealthy(`${baseUrl}/healthz`);

  const health = await getJson(`${baseUrl}/healthz`);
  assert.equal(health.ok, true);
  assert.equal(health.service, "agentgov");

  const ready = await getJson(`${baseUrl}/readyz`);
  assert.equal(ready.ok, true);
  assert.equal(ready.checks.storage, "ok");
  assert.equal(ready.checks.trust_gate, "registered");
  assert.equal(ready.checks.release_gate, "registered");

  const toolsPayload = await mcp(baseUrl, "tools/list", {});
  const toolNames = toolsPayload.result.tools.map((tool) => tool.name);
  assert.deepEqual(toolNames, expectedTools);

  const signaturePayload = await callTool(baseUrl, "verify_card_signature", {
    source: "fixtures/agent-cards/trusted-signed.json",
    offline: true
  });
  assert.equal(signaturePayload.valid, true);

  const trustPayload = await callTool(baseUrl, "issue_trust_verdict", {
    source: "fixtures/agent-cards/poisoned-injection.json",
    offline: true
  });
  assert.equal(trustPayload.verdict, "BLOCK");
  assert.equal(typeof trustPayload.signature, "string");
  assert.ok(trustPayload.signature.length > 32);

  console.log(`mcp smoke ok: ${expectedTools.length} tools, trust verdict ${trustPayload.verdict}`);
} finally {
  await stopServer();
}

async function callTool(baseUrl, name, args) {
  const payload = await mcp(baseUrl, "tools/call", {
    name,
    arguments: args
  });
  return JSON.parse(payload.result.content[0].text);
}

async function mcp(baseUrl, method, params) {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params
    })
  });
  const text = await response.text();
  assert.equal(response.status, 200, text);
  return parseSseJson(text);
}

async function getJson(url) {
  const response = await fetch(url);
  const body = await response.text();
  assert.equal(response.status, 200, body);
  return JSON.parse(body);
}

async function waitForHealthy(url) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`server exited early with ${server.exitCode}\nstdout:\n${logs.stdout}\nstderr:\n${logs.stderr}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await delay(100);
  }
  throw new Error(`timed out waiting for ${url}\nstdout:\n${logs.stdout}\nstderr:\n${logs.stderr}`);
}

function parseSseJson(text) {
  const dataLine = text.split("\n").find((line) => line.startsWith("data: "));
  if (!dataLine) throw new Error(`No SSE data line found: ${text}`);
  return JSON.parse(dataLine.slice("data: ".length));
}

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => {
        if (!address || typeof address === "string") {
          reject(new Error("Expected TCP port from address probe"));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stopServer() {
  return new Promise((resolve) => {
    if (server.exitCode !== null) {
      resolve();
      return;
    }
    const timeout = setTimeout(() => {
      server.kill("SIGKILL");
      resolve();
    }, 2_000);
    server.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    server.kill("SIGTERM");
  });
}
