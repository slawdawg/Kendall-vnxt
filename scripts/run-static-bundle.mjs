import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

export const STATIC_BUNDLES = Object.freeze({
  core: [
    "test:check-plan",
    "test:supervisor-runner",
    "check:docs",
    "check:github-workflow-policy",
    "check:workspace-coordination",
    "check:mise-workflow",
    "check:linux-install-lane",
    "check:bmad-work-products",
    "check:knx-obsidian-memory",
    "test:clean-install-boundary",
    "test:knx-obsidian-memory",
    "test:static-bundles",
    "test:static-bundle-summary",
  ],
  manager: [
    "check:manager-lifecycle-status-parity",
    "test:manager-quality-gate",
    "test:runner-handoff-audit-json-validation",
    "test:tmux-orientation-report",
    "check:tmux-orientation-report",
    "test:manager-control-plane",
    "test:manager-control-plane-contract",
    "test:manager-control-plane-dispatcher-port",
    "test:manager-control-plane-forbidden-boundary",
    "test:manager-control-plane-run-contract",
    "test:manager-worker-clean-cycle-observer",
    "check:manager-control-plane",
  ],
  workspace: [
    "check:clean-install-boundary",
    "test:codex-workspace",
    "test:codex-workspace-state",
    "test:workspace-command-resolution",
  ],
  policy: [
    "test:review-gated-low-risk-automation",
    "test:review-gated-low-risk-fake-adapter",
    "test:review-gated-low-risk-dry-run-adapter",
    "test:review-gated-low-risk-read-only-review",
    "test:review-gated-low-risk-bounded-write",
    "test:review-gated-low-risk-pilot-admission",
    "test:review-gated-low-risk-policy-eligibility",
    "test:review-gated-low-risk-route-policy",
    "check:governed-worker-execution-dry-run",
    "check:documentation-authority",
    "check:legacy-planning-inventory",
    "check:review-resource-policy",
    "check:verification-readiness",
    "test:live-memory-source-enforcement",
    "test:bounded-live-memory-source",
    "check:authority-readiness",
    "check:branch-protection-readiness",
    "check:adaptive-scoring",
    "check:premium-execution",
    "check:worker-launch",
    "check:reports",
    "check:execution-boundary",
    "check:execution-evidence",
    "check:provider-fixtures",
    "check:process-lifecycle",
    "check:runbooks",
    "check:runtime-export",
    "check:runtime-review",
    "check:safe-backlog",
    "check:managed-recipes",
    "check:maintenance-action-plan",
    "check:development-runway",
    "check:runner-assignment-status",
    "check:delivery-readiness",
    "check:cleanup-automation",
    "check:maintenance-readiness",
    "check:token-economy",
  ],
  "pipeline-dashboard": [
    "check:pipeline-implementation-readiness",
    "check:dashboard-pipeline-boundary",
    "test:pipeline-implementation-readiness",
    "check:e2e-report",
    "test:work-packet-contracts",
    "test:work-packet-stage-map",
    "test:work-packet-fixtures",
    "test:pipeline-state-matrix",
    "test:dashboard-pipeline-fixtures",
    "test:dashboard-memory-proposals",
    "test:dashboard-e2e-runner",
  ],
  "anti-churn": [
    "test:sandbox-boundary-classifier",
    "test:anti-churn-event-writer",
    "test:anti-churn-signature-classifier",
    "test:anti-churn-event-reader",
    "test:anti-churn-guidance-candidate-classifier",
    "test:anti-churn-guidance-dedupe",
    "test:anti-churn-guidance-output",
    "test:anti-churn-verification-routing",
    "test:anti-churn-apply-safe-gate",
    "test:anti-churn-hook-transaction-store",
    "test:anti-churn-source-apply",
    "test:anti-churn-verification-rollback",
  ],
});

export function staticBundleNames() {
  return Object.keys(STATIC_BUNDLES);
}

export function commandsForBundle(name) {
  if (name === "all") {
    return staticBundleNames().flatMap((bundleName) => STATIC_BUNDLES[bundleName]);
  }

  const commands = STATIC_BUNDLES[name];
  if (!commands) {
    throw new Error(`Unknown static bundle "${name}". Expected one of: ${staticBundleNames().join(", ")}, all`);
  }

  return commands;
}

function statusFromResult(result) {
  return result.status === 0 ? "passed" : "failed";
}

export function buildStaticBundleReport({
  bundleName,
  commands,
  commandResults,
  startedAtMs,
  completedAtMs,
  startedAt = null,
  completedAt = null,
  headSha = null,
  baseSha = null,
}) {
  const failedCommand = commandResults.find((command) => command.status !== "passed") ?? null;
  return {
    schemaVersion: 1,
    bundle: bundleName,
    headSha,
    baseSha,
    status: failedCommand ? "failed" : "passed",
    commandCount: commands.length,
    completedCommandCount: commandResults.length,
    startedAt,
    completedAt,
    durationMs: Math.max(0, completedAtMs - startedAtMs),
    failedCommand: failedCommand?.command ?? null,
    commands: commandResults,
  };
}

function writeReport(reportPath, report) {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

function runPnpmScript(scriptName) {
  const startedAt = Date.now();
  console.log(`\n[static-bundle] pnpm run ${scriptName}`);
  const result = spawnSync("pnpm", ["run", scriptName], {
    stdio: "inherit",
  });
  const completedAt = Date.now();
  const elapsedMs = completedAt - startedAt;
  const elapsedSeconds = (elapsedMs / 1000).toFixed(1);
  const commandResult = {
    command: scriptName,
    status: statusFromResult(result),
    exitCode: result.status,
    signal: result.signal,
    durationMs: elapsedMs,
  };

  if (result.status !== 0) {
    console.error(`[static-bundle] failed after ${elapsedSeconds}s: pnpm run ${scriptName}`);
    return commandResult;
  }

  console.log(`[static-bundle] passed in ${elapsedSeconds}s: pnpm run ${scriptName}`);
  return commandResult;
}

export function parseStaticBundleArgs(argv) {
  const [bundleName, ...rest] = argv;
  let reportPath = null;
  let headSha = null;
  let baseSha = null;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--report") {
      reportPath = rest[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg.startsWith("--report=")) {
      reportPath = arg.slice("--report=".length);
      continue;
    }
    if (arg === "--head-sha") {
      headSha = rest[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg.startsWith("--head-sha=")) {
      headSha = arg.slice("--head-sha=".length);
      continue;
    }
    if (arg === "--base-sha") {
      baseSha = rest[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg.startsWith("--base-sha=")) {
      baseSha = arg.slice("--base-sha=".length);
      continue;
    }
    throw new Error(`Unknown option "${arg}". Expected --report <path>, --head-sha <sha>, or --base-sha <sha>`);
  }

  if (reportPath === "") {
    reportPath = null;
  }
  if (headSha === "") {
    headSha = null;
  }
  if (baseSha === "") {
    baseSha = null;
  }

  return { bundleName, reportPath, headSha, baseSha };
}

export function runStaticBundle(name, { reportPath = null, headSha = null, baseSha = null } = {}) {
  const commands = commandsForBundle(name);
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const commandResults = [];
  console.log(`[static-bundle] ${name}: ${commands.length} commands`);

  for (const command of commands) {
    const commandResult = runPnpmScript(command);
    commandResults.push(commandResult);
    if (commandResult.status !== "passed") {
      break;
    }
  }

  const report = buildStaticBundleReport({
    bundleName: name,
    commands,
    commandResults,
    startedAtMs,
    completedAtMs: Date.now(),
    startedAt,
    completedAt: new Date().toISOString(),
    headSha,
    baseSha,
  });

  if (reportPath) {
    writeReport(reportPath, report);
  }

  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let parsedArgs;

  try {
    parsedArgs = parseStaticBundleArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error(`Usage: node ./scripts/run-static-bundle.mjs <${staticBundleNames().join("|")}|all> [--report <path>] [--head-sha <sha>] [--base-sha <sha>]`);
    process.exit(2);
  }

  if (!parsedArgs.bundleName) {
    console.error(`Usage: node ./scripts/run-static-bundle.mjs <${staticBundleNames().join("|")}|all>`);
    process.exit(2);
  }

  try {
    const report = runStaticBundle(parsedArgs.bundleName, {
      reportPath: parsedArgs.reportPath,
      headSha: parsedArgs.headSha,
      baseSha: parsedArgs.baseSha,
    });
    if (report.status !== "passed") {
      process.exit(1);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }
}
