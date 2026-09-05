#!/usr/bin/env node

import net from "node:net";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const dashboardSocketRuntimeModules = [
  "apps/dashboard/scripts/dashboard-auth-proxy.test.mjs",
  "apps/dashboard/scripts/dashboard-supervisor-proxy.test.mjs",
  "apps/dashboard/scripts/packet-detail-mediator.test.mjs",
  "apps/dashboard/scripts/secure-dashboard-runtime.test.mjs",
];

export const dashboardSocketRuntimeCommand = [process.execPath, "--test", ...dashboardSocketRuntimeModules];

export function probeDashboardSocketListener({
  directory = mkdtempSync(join(tmpdir(), "kendall-dashboard-socket-boundary-")),
  serverFactory = net.createServer,
} = {}) {
  return new Promise((resolve) => {
    const socketPath = join(directory, "listener.sock");
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      try {
        rmSync(directory, { recursive: true, force: true });
        resolve(result);
      } catch (error) {
        resolve({ errorCode: error?.code || "ERR_SOCKET_LISTENER_CLEANUP" });
      }
    };
    try {
      const server = serverFactory();
      server.once("error", (error) => settle({ errorCode: error?.code || "ERR_SOCKET_LISTENER_PROBE" }));
      server.listen(socketPath, () => {
        server.close((error) => settle(error ? { errorCode: error.code || "ERR_SOCKET_LISTENER_CLOSE" } : { errorCode: null }));
      });
    } catch (error) {
      settle({ errorCode: error?.code || "ERR_SOCKET_LISTENER_PROBE" });
    }
  });
}

export async function dashboardSocketRuntimeBoundary({ probe = probeDashboardSocketListener } = {}) {
  const result = await probe();
  if (["EPERM", "EACCES"].includes(result?.errorCode)) {
    return {
      action: "skip",
      reason: "codex-dashboard-socket-listener-boundary",
      errorCode: result.errorCode,
      command: dashboardSocketRuntimeCommand,
    };
  }
  if (result?.errorCode) {
    return {
      action: "fail",
      reason: "dashboard-socket-listener-probe-failed",
      errorCode: result.errorCode,
    };
  }
  return { action: "run", command: dashboardSocketRuntimeCommand };
}

export async function runDashboardSocketRuntimeTests({
  probe,
  runner = (command, args) => spawnSync(command, args, { stdio: "inherit" }),
  log = console.log,
  error = console.error,
} = {}) {
  const boundary = await dashboardSocketRuntimeBoundary({ probe });
  if (boundary.action === "skip") {
    log(JSON.stringify({
      marker: "SANDBOX_DASHBOARD_SOCKET_LISTENER_BLOCKED",
      signature: boundary.reason,
      error_code: boundary.errorCode,
      command: boundary.command.join(" "),
      modules: dashboardSocketRuntimeModules,
      next_action: `Run ${boundary.command.join(" ")} outside the sandbox for complete dashboard socket-runtime coverage.`,
    }));
    return 0;
  }
  if (boundary.action === "fail") {
    error(`FAIL: dashboard socket listener probe failed with ${boundary.errorCode}.`);
    return 1;
  }
  const [command, ...args] = boundary.command;
  const result = runner(command, args);
  if (result?.error) {
    error(result.error.message);
    return 1;
  }
  return typeof result?.status === "number" ? result.status : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await runDashboardSocketRuntimeTests();
}
