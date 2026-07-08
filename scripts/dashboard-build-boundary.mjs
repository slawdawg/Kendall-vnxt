#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function dashboardBuildCommand() {
  return ["pnpm", "--filter", "@kendall/dashboard", "build"];
}

export function dashboardBuildBoundary(env = process.env, options = {}) {
  const probe = options.processProbe || probeNestedProcess();
  const sandboxed = probe.errorCode === "EPERM";
  const forced = env.KENDALL_FORCE_DASHBOARD_BUILD_IN_SANDBOX === "1";
  if (sandboxed && !forced) {
    return {
      action: "skip",
      reason: "turbopack-process-port-sandbox-boundary",
      message: "SKIP: dashboard build requires Next/Turbopack process and internal port behavior that is unavailable in the Codex sandbox.",
      nextAction: "Run pnpm run build:dashboard outside the sandbox for full dashboard build coverage.",
    };
  }
  return {
    action: "run",
    reason: forced ? "forced-sandbox-build" : "non-sandbox-build",
    command: dashboardBuildCommand(),
  };
}

export function probeNestedProcess() {
  const result = spawnSync(process.execPath, ["-e", ""], {
    encoding: "utf8",
    stdio: "pipe",
  });
  return {
    status: typeof result.status === "number" ? result.status : null,
    errorCode: result.error?.code || null,
  };
}

export function runDashboardBuild({ env = process.env, stdio = "inherit" } = {}) {
  const boundary = dashboardBuildBoundary(env);
  if (boundary.action === "skip") {
    console.log(boundary.message);
    console.log(`OK: ${boundary.nextAction}`);
    return 0;
  }

  const [command, ...args] = boundary.command;
  const result = spawnSync(command, args, {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env,
    stdio,
  });
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  return typeof result.status === "number" ? result.status : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(runDashboardBuild());
}
