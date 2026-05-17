import { createHmac } from "node:crypto";
import type { AgentCard } from "../../schema/types.js";
import { canonicalize } from "../../lib/jcs.js";

export interface SignatureVerification {
  valid: boolean;
  kid?: string;
  reason: string;
}

export function verifyCardSignature(card: AgentCard, secretsByKid: Record<string, string>): SignatureVerification {
  const signature = card.signatures?.[0];
  if (!signature) return { valid: false, reason: "Agent Card is unsigned" };

  const kid = signature.header?.kid;
  if (!kid || !secretsByKid[kid]) return { valid: false, kid, reason: `Unknown signing key: ${kid ?? "(missing kid)"}` };

  const unsigned = { ...card };
  delete unsigned.signatures;
  delete (unsigned as Record<string, unknown>).source;
  const expected = createHmac("sha256", secretsByKid[kid]).update(canonicalize(unsigned)).digest("base64url");
  const valid = expected === signature.signature;
  return { valid, kid, reason: valid ? "Signature verified with pinned trust registry key" : "Signature mismatch" };
}
