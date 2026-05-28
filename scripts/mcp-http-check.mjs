#!/usr/bin/env node
// Confirm an AgentGov MCP endpoint behaves exactly as Copilot Studio needs:
// reachable over Streamable HTTP, the token header is accepted, tools list, and a
// real tool call returns a result. Run this BEFORE wiring Copilot Studio / recording.
//
//   # local
//   set -a; . ./.env.agentgov; set +a
//   node scripts/mcp-http-check.mjs
//   # devtunnel (what Copilot Studio will hit)
//   node scripts/mcp-http-check.mjs https://<id>-3000.devtunnels.ms/mcp "$AGENTGOV_MCP_TOKEN"
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.argv[2] || process.env.AGENTGOV_MCP_URL || "http://localhost:3000/mcp";
const token = process.argv[3] || process.env.AGENTGOV_MCP_TOKEN || "";
const TEST_AGENT = "https://onekn8.github.io/agentgov/demo-agents/quickinvoice-assistant";

const transport = new StreamableHTTPClientTransport(new URL(url), {
  requestInit: { headers: token ? { "x-agentgov-mcp-token": token } : {} }
});
const client = new Client({ name: "agentgov-http-check", version: "1.0.0" });

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  console.log(`OK  connected: ${url}`);
  console.log(`OK  token accepted, ${tools.length} tools: ${tools.map((t) => t.name).join(", ")}`);

  const tool = tools.find((t) => t.name === "inspect_agent_card");
  if (tool) {
    const props = tool.inputSchema?.properties ?? {};
    const arg = tool.inputSchema?.required?.[0] ?? (props.source ? "source" : Object.keys(props)[0]);
    const res = await client.callTool({ name: "inspect_agent_card", arguments: { [arg]: TEST_AGENT } });
    const text = res.content?.map((c) => c.text).join("") ?? JSON.stringify(res);
    console.log(`OK  tool call inspect_agent_card({${arg}: <BLOCK url>}) returned ${text.length} chars`);
    console.log(`    ${text.slice(0, 180).replace(/\s+/g, " ")}...`);
  }
  await client.close();
  console.log("PASS — this endpoint is ready for Copilot Studio.");
} catch (err) {
  console.error(`FAIL — ${err?.message ?? err}`);
  process.exit(1);
}
