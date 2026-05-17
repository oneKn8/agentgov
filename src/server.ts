import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { handleRevoke, writeJson } from "./api/revoke.js";
import { healthPayload, readinessPayload } from "./api/health.js";
import { registerAgentGovTools } from "./mcp/registerTools.js";

const port = Number(process.env.PORT ?? 3000);

const server = createServer(async (req, res) => {
  try {
    applyCors(res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (url.pathname === "/healthz") {
      writeJson(res, 200, healthPayload());
      return;
    }
    if (url.pathname === "/readyz") {
      writeJson(res, 200, readinessPayload());
      return;
    }
    if (url.pathname === "/mcp") {
      if (req.method !== "POST") {
        writeJson(res, 405, {
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Method not allowed."
          },
          id: null
        });
        return;
      }
      await handleMcpRequest(req, res);
      return;
    }
    const revokeMatch = url.pathname.match(/^\/releases\/([^/]+)\/revoke$/);
    if (req.method === "POST" && revokeMatch) {
      await handleRevoke(req, res, decodeURIComponent(revokeMatch[1]));
      return;
    }

    writeJson(res, 404, {
      ok: false,
      error: "not_found",
      routes: ["/healthz", "/readyz", "/mcp", "POST /releases/{release_id}/revoke"]
    });
  } catch (error) {
    writeJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

server.listen(port, () => {
  console.log(`AgentGov MCP server listening on http://localhost:${port}`);
  console.log(`MCP endpoint: http://localhost:${port}/mcp`);
});

function applyCors(res: ServerResponse): void {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type, mcp-session-id");
}

process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());

async function handleMcpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const mcp = new McpServer({
    name: "agentgov",
    version: "0.1.0"
  });
  registerAgentGovTools(mcp);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  });

  await mcp.connect(transport);
  res.on("close", () => {
    void transport.close();
    void mcp.close();
  });
  await transport.handleRequest(req, res, await readJsonBody(req));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw.length > 0 ? JSON.parse(raw) : undefined;
}

function shutdown(): void {
  server.close(() => {
    process.exit(0);
  });
}
