import { readFileSync } from "node:fs";
import type { EvalResult } from "../../schema/types.js";

export function ingestEvalResults(pathOrPayload: string | EvalResult): EvalResult {
  const payload = typeof pathOrPayload === "string" ? JSON.parse(readFileSync(pathOrPayload, "utf8")) : pathOrPayload;
  if (!payload.agent_id || !payload.run_id || typeof payload.pass_rate !== "number" || !Array.isArray(payload.cases)) {
    throw new Error("Invalid eval result: expected agent_id, run_id, pass_rate, cases[]");
  }
  return payload as EvalResult;
}
