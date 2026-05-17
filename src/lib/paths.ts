import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

export function resolveWorkspaceFile(inputPath: string): string {
  const root = realpathSync(resolve(process.cwd(), process.env.AGENTGOV_WORKSPACE_ROOT ?? "."));
  const resolved = realpathSync(isAbsolute(inputPath) ? inputPath : resolve(root, inputPath));
  const fromRoot = relative(root, resolved);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    throw new Error(`Path is outside AgentGov workspace: ${inputPath}`);
  }
  return resolved;
}
