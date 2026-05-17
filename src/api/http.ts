import type { IncomingMessage, ServerResponse } from "node:http";

const maxJsonBytes = 1024 * 1024;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export function applyCors(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers.origin;
  res.setHeader("vary", "origin");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type, mcp-session-id, x-agentgov-revoke-token");
  if (typeof origin !== "string") return true;
  if (!isAllowedOrigin(origin)) return false;
  res.setHeader("access-control-allow-origin", origin);
  return true;
}

export async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const contentType = req.headers["content-type"] ?? "";
  if (!String(contentType).toLowerCase().includes("application/json")) {
    throw new HttpError(415, "unsupported_media_type", "Expected content-type application/json");
  }

  const contentLength = Number(req.headers["content-length"] ?? 0);
  if (contentLength > maxJsonBytes) {
    throw new HttpError(413, "payload_too_large", "JSON body exceeds 1 MiB");
  }

  let total = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > maxJsonBytes) {
      throw new HttpError(413, "payload_too_large", "JSON body exceeds 1 MiB");
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON");
  }
}

export function writeJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload, null, 2));
}

export function writeError(res: ServerResponse, error: unknown): void {
  if (res.headersSent) {
    res.destroy(error instanceof Error ? error : undefined);
    return;
  }
  if (error instanceof HttpError) {
    writeJson(res, error.status, {
      ok: false,
      error: error.code,
      message: error.message
    });
    return;
  }
  writeJson(res, 500, {
    ok: false,
    error: "internal_error",
    message: "Internal server error"
  });
  console.error(error);
}

function isAllowedOrigin(origin: string): boolean {
  if (process.env.AGENTGOV_ALLOW_ANY_ORIGIN === "true") return true;
  const configured = (process.env.AGENTGOV_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured.includes(origin)) return true;

  try {
    const url = new URL(origin);
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}
