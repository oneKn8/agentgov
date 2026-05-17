import { readFileSync } from "node:fs";
import YAML from "yaml";
import type { ReleaseFailure, Severity } from "../schema/types.js";
import { resolveWorkspaceFile } from "../lib/paths.js";

export type RuleOp = "equals" | "not_equals" | "gt" | "gte" | "lt" | "lte" | "includes" | "missing";

export interface PolicyCondition {
  path: string;
  op: RuleOp;
  value?: unknown;
}

export interface PolicyRule {
  id: string;
  description: string;
  severity: Severity;
  category: ReleaseFailure["category"];
  when: PolicyCondition[];
  remediation: string;
}

export interface PolicyDocument {
  version: string;
  name: string;
  rules: PolicyRule[];
}

export function loadPolicy(path: string): PolicyDocument {
  const parsed = YAML.parse(readFileSync(resolveWorkspaceFile(path), "utf8")) as PolicyDocument;
  validatePolicy(parsed);
  return parsed;
}

export function validatePolicy(policy: PolicyDocument): void {
  if (!policy.name || !policy.version || !Array.isArray(policy.rules)) {
    throw new Error("Policy must include name, version, and rules[]");
  }
  for (const rule of policy.rules) {
    if (!rule.id || !rule.description || !rule.severity || !rule.category || !Array.isArray(rule.when)) {
      throw new Error(`Invalid policy rule: ${rule.id ?? "(missing id)"}`);
    }
  }
}

export function evaluatePolicy(policy: PolicyDocument, context: Record<string, unknown>): ReleaseFailure[] {
  return policy.rules
    .filter((rule) => rule.when.every((condition) => evaluateCondition(context, condition)))
    .map((rule) => ({
      id: rule.id,
      category: rule.category,
      severity: rule.severity,
      message: rule.description,
      remediation: rule.remediation
    }));
}

export function evaluateCondition(context: Record<string, unknown>, condition: PolicyCondition): boolean {
  const actual = getPath(context, condition.path);
  switch (condition.op) {
    case "equals":
      return actual === condition.value;
    case "not_equals":
      return actual !== condition.value;
    case "gt":
      return Number(actual) > Number(condition.value);
    case "gte":
      return Number(actual) >= Number(condition.value);
    case "lt":
      return Number(actual) < Number(condition.value);
    case "lte":
      return Number(actual) <= Number(condition.value);
    case "includes":
      return Array.isArray(actual) ? actual.includes(condition.value) : String(actual ?? "").includes(String(condition.value));
    case "missing":
      return actual === undefined || actual === null || actual === "";
  }
}

export function getPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((cursor, part) => {
    if (cursor && typeof cursor === "object" && part in cursor) {
      return (cursor as Record<string, unknown>)[part];
    }
    return undefined;
  }, source);
}
