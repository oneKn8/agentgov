#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Command } from "commander";
import { verifySignature } from "./gate/signing.js";
import { composeReleasePacket } from "./gate/packetGenerator.js";
import { loadPolicy } from "./gate/ruleEngine.js";
import { loadAgentProfile } from "./lib/loaders.js";
import { SqliteStorage } from "./storage/SqliteStorage.js";
import { inspectAgentCard } from "./tools/trust/inspectAgentCard.js";
import { issueTrustVerdict } from "./tools/trust/issueTrustVerdict.js";
import { loadTrustRegistry } from "./tools/trust/checkTrustRegistry.js";
import { ingestEvalResults } from "./tools/release/ingestEvalResults.js";
import { classifyReleaseRisk } from "./tools/release/classifyReleaseRisk.js";
import { generateReleaseTests, releaseTestsToCsv } from "./tools/release/generateReleaseTests.js";
import { revokeRelease } from "./tools/release/revokeRelease.js";

const program = new Command();
program.name("agentgov").description("Trust and release governance for Copilot Studio multi-agent systems").version("0.1.0");

const trust = program.command("trust").description("Trust Gate commands");

trust
  .command("check")
  .argument("<source>", "Agent Card URL or local JSON file")
  .option("--offline", "Read source as local JSON file", false)
  .option("--registry <path>", "Trust registry path", "trust-registry.json")
  .action(async (source: string, options: { offline: boolean; registry: string }) => {
    const card = await inspectAgentCard(source, options.offline);
    const registry = loadTrustRegistry(options.registry);
    const verdict = issueTrustVerdict(card, registry);
    const storage = new SqliteStorage();
    await storage.init();
    await storage.saveTrustVerdict(verdict, verdict.decision_id);
    printJson(verdict);
  });

const release = program.command("release").description("Release Gate commands");

release
  .command("check")
  .argument("<profile>", "Target agent profile YAML")
  .requiredOption("--eval <path>", "Evaluation result JSON")
  .option("--packet <path>", "Write release packet markdown", "outputs/release-packet.md")
  .action(async (profilePath: string, options: { eval: string; packet: string }) => {
    const profile = loadAgentProfile(profilePath);
    const evalResult = ingestEvalResults(options.eval);
    const storage = new SqliteStorage();
    await storage.init();
    const decision = await classifyReleaseRisk(profile, evalResult, { profilePath, storage });
    await storage.saveReleaseDecision(decision, decision.release_id);
    const packet = composeReleasePacket(decision);
    mkdirSync(dirname(options.packet), { recursive: true });
    writeFileSync(options.packet, packet.markdown);
    printJson({ decision, packet_path: options.packet });
  });

release
  .command("revoke")
  .argument("<release_id>", "Release decision id")
  .requiredOption("--reason <reason>", "Revocation reason")
  .option("--actor <actor>", "Actor revoking the decision", "local-user")
  .action(async (releaseId: string, options: { reason: string; actor: string }) => {
    const storage = new SqliteStorage();
    const record = await revokeRelease(storage, releaseId, options.reason, options.actor);
    printJson(record);
  });

const policy = program.command("policy").description("Policy-as-code commands");

policy
  .command("validate")
  .argument("<policy>", "Policy YAML")
  .action((policyPath: string) => {
    const policy = loadPolicy(policyPath);
    printJson({ ok: true, name: policy.name, version: policy.version, rules: policy.rules.length });
  });

policy
  .command("testset")
  .argument("<profile>", "Target agent profile YAML")
  .option("--csv <path>", "Write generated test set CSV")
  .action((profilePath: string, options: { csv?: string }) => {
    const tests = generateReleaseTests(loadAgentProfile(profilePath));
    if (options.csv) {
      mkdirSync(dirname(options.csv), { recursive: true });
      writeFileSync(options.csv, releaseTestsToCsv(tests));
    }
    printJson({ count: tests.length, tests, csv_path: options.csv });
  });

const signature = program.command("signature").description("Decision signature commands");

signature
  .command("verify")
  .argument("<decision>", "TrustVerdict or ReleaseDecision JSON")
  .action((decisionPath: string) => {
    const payload = JSON.parse(readFileSync(decisionPath, "utf8")) as Record<string, unknown>;
    printJson({ ok: verifySignature(payload), decision_id: payload.decision_id ?? payload.release_id });
  });

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}
