import type { IncomingMessage, ServerResponse } from "node:http";
import { SqliteStorage } from "../storage/SqliteStorage.js";
import { revokeRelease } from "../tools/release/revokeRelease.js";

export async function handleRevoke(req: IncomingMessage, res: ServerResponse, releaseId: string): Promise<void> {
  const body = await readJsonBody(req);
  const reason = typeof body.reason === "string" ? body.reason : "revoked through AgentGov API";
  const actor = typeof body.actor === "string" ? body.actor : "api-user";
  const record = await revokeRelease(new SqliteStorage(), releaseId, reason, actor);
  writeJson(res, 200, record);
}

export async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

export function writeJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload, null, 2));
}
