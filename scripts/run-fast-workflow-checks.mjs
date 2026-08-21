#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const suites = {
  ci: [
    "check:github-workflow-policy",
    "check:workspace-coordination",
    "test:ci-promotion-evidence",
    "test:ci-promotion-packet",
    "test:ci-evidence-command",
    "test:ci-promotion-observations",
  ],
  workspace: [
    "test:codex-workspace-state",
    "test:workspace-command-resolution",
    "test:base-checkout-recovery",
    "test:mutation-admission",
    "test:mutation-admission-workspace-handoff",
    "test:mutation-admission-prewrite-guard",
    "test:codex-workspace:delivery",
    "test:workspace-fast-profile",
  ],
  sandbox: [
    "test:sandbox-boundary-classifier",
    "test:anti-churn-signature-classifier",
    "test:anti-churn-verification-routing",
    "test:anti-churn-apply-safe-gate",
  ],
  dashboard: [
    "test:dashboard-build-boundary",
    "check:e2e-report",
    "test:dashboard-e2e-runner",
    "test:gate4-bmad-dashboard-contract",
    "check:dashboard-pipeline-boundary",
    "test:dashboard-auth-runtime",
    "test:dashboard-pipeline-loader",
    "test:dashboard-pipeline-fixtures",
  ],
};

const requested = process.argv[2] || "all";
const commands = requested === "all"
  ? [...suites.ci, ...suites.workspace, ...suites.sandbox, ...suites.dashboard]
  : suites[requested];

if (!commands) {
  console.error(`Unknown fast workflow check suite: ${requested}`);
  console.error(`Expected one of: ${["all", ...Object.keys(suites)].join(", ")}`);
  process.exit(64);
}

for (const command of commands) {
  console.log(`\n> pnpm run ${command}`);
  const result = spawnSync("pnpm", ["run", command], { stdio: "inherit" });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(typeof result.status === "number" ? result.status : 1);
  }
}
