import { createHmac, timingSafeEqual } from "node:crypto";
import { canonicalize, withoutSignature } from "../lib/jcs.js";

const DEFAULT_SECRET = "agentgov-dev-secret-change-me";

export function signPayload(payload: Record<string, unknown>, secret = process.env.AGENTGOV_HMAC_SECRET ?? DEFAULT_SECRET): string {
  const canonical = canonicalize(withoutSignature(payload));
  return createHmac("sha256", secret).update(canonical).digest("base64url");
}

export function attachSignature<T extends Record<string, unknown>>(payload: T, secret?: string): T & { signature: string } {
  return {
    ...payload,
    signature: signPayload(payload, secret)
  };
}

export function verifySignature(payload: Record<string, unknown>, signature = String(payload.signature ?? ""), secret?: string): boolean {
  if (!signature) return false;
  const expected = signPayload(payload, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
