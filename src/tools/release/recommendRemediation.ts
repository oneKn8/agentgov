import type { ReleaseFailure } from "../../schema/types.js";

export function recommendRemediation(failures: ReleaseFailure[]): string[] {
  return [...new Set(failures.map((failure) => failure.remediation).filter(Boolean) as string[])];
}
