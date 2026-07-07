import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const STATIC_BUNDLES = Object.freeze({
  core: [
    "check:fast",
    "test:check-plan",
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
  ],
  manager: [
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

function runPnpmScript(scriptName) {
  const startedAt = Date.now();
  console.log(`\n[static-bundle] pnpm run ${scriptName}`);
  const result = spawnSync("pnpm", ["run", scriptName], {
    stdio: "inherit",
  });
  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  if (result.status !== 0) {
    console.error(`[static-bundle] failed after ${elapsedSeconds}s: pnpm run ${scriptName}`);
    process.exit(result.status ?? 1);
  }

  console.log(`[static-bundle] passed in ${elapsedSeconds}s: pnpm run ${scriptName}`);
}

export function runStaticBundle(name) {
  const commands = commandsForBundle(name);
  console.log(`[static-bundle] ${name}: ${commands.length} commands`);

  for (const command of commands) {
    runPnpmScript(command);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bundleName = process.argv[2];

  if (!bundleName) {
    console.error(`Usage: node ./scripts/run-static-bundle.mjs <${staticBundleNames().join("|")}|all>`);
    process.exit(2);
  }

  try {
    runStaticBundle(bundleName);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }
}
