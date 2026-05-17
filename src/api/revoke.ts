import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { HttpError, readJsonBody, writeJson } from "./http.js";
import { getStorage } from "../storage/sharedStorage.js";
import { revokeRelease } from "../tools/release/revokeRelease.js";

export async function handleRevoke(req: IncomingMessage, res: ServerResponse, releaseId: string): Promise<void> {
  authorizeRevoke(req);
  const body = await readJsonBody(req);
  const reason = requiredString(body.reason, "reason");
  const actor = requiredString(body.actor, "actor");
  const record = await revokeRelease(await getStorage(), releaseId, reason, actor);
  writeJson(res, 200, record);
}

function authorizeRevoke(req: IncomingMessage): void {
  const expected = process.env.AGENTGOV_REVOKE_TOKEN;
  if (expected) {
    const provided = req.headers["x-agentgov-revoke-token"];
    if (tokenMatches(provided, expected)) return;
    throw new HttpError(401, "unauthorized", "Missing or invalid revocation token");
  }

  if (process.env.AGENTGOV_ALLOW_LOOPBACK_REVOKE === "true" && isLoopback(req.socket.remoteAddress)) return;
  throw new HttpError(401, "unauthorized", "Set AGENTGOV_REVOKE_TOKEN before accepting revocation requests");
}

function requiredString(value: unknown, field: string): string {
  if (typeof value === "string" && value.trim().length > 0) return value;
  throw new HttpError(400, "invalid_request", `Field '${field}' is required`);
}

function isLoopback(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function tokenMatches(provided: string | string[] | undefined, expected: string): boolean {
  if (typeof provided !== "string") return false;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}
