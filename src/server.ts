import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { applyCors, HttpError, readJsonBody, writeError, writeJson } from "./api/http.js";
import { handleRevoke } from "./api/revoke.js";
import { healthPayload, readinessPayload } from "./api/health.js";
import { registerAgentGovTools } from "./mcp/registerTools.js";

const port = Number(process.env.PORT ?? 3000);

export function createAgentGovServer() {
  return createServer(async (req, res) => {
    try {
      const corsAllowed = applyCors(req, res);
      if (req.method === "OPTIONS") {
        res.writeHead(corsAllowed ? 204 : 403);
        res.end();
        return;
      }
      if (!corsAllowed) {
        throw new HttpError(403, "cors_origin_denied", "Origin is not allowed");
      }

      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      if (url.pathname === "/healthz") {
        writeJson(res, 200, healthPayload());
        return;
      }
      if (url.pathname === "/readyz") {
        writeJson(res, 200, await readinessPayload());
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
        authorizeMcp(req);
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
      writeError(res, error);
    }
  });
}

export function startAgentGovServer(listenPort = port) {
  const server = createAgentGovServer();
  server.listen(listenPort, () => {
    console.log(`AgentGov MCP server listening on http://localhost:${listenPort}`);
    console.log(`MCP endpoint: http://localhost:${listenPort}/mcp`);
  });
  process.on("SIGINT", () => shutdown(server));
  process.on("SIGTERM", () => shutdown(server));
  return server;
}

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
  let closed = false;
  const closeOnce = async () => {
    if (closed) return;
    closed = true;
    await transport.close();
    await mcp.close();
  };
  res.on("close", () => {
    void closeOnce();
  });
  try {
    await transport.handleRequest(req, res, await readJsonBody(req));
  } catch (error) {
    await closeOnce();
    throw error;
  }
}

function authorizeMcp(req: IncomingMessage): void {
  const expected = process.env.AGENTGOV_MCP_TOKEN;
  if (expected) {
    const provided = req.headers["x-agentgov-mcp-token"];
    if (tokenMatches(provided, expected)) return;
    throw new HttpError(401, "unauthorized", "Missing or invalid MCP token");
  }
  if (process.env.AGENTGOV_ALLOW_ANY_ORIGIN === "true") {
    throw new HttpError(401, "unauthorized", "Set AGENTGOV_MCP_TOKEN before enabling AGENTGOV_ALLOW_ANY_ORIGIN");
  }
}

function tokenMatches(provided: string | string[] | undefined, expected: string): boolean {
  if (typeof provided !== "string") return false;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

function shutdown(server: ReturnType<typeof createAgentGovServer>): void {
  server.close(() => {
    process.exit(0);
  });
}

function isMainModule(): boolean {
  return process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
}

if (isMainModule()) {
  startAgentGovServer();
}
