import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  dashboardSocketRuntimeCommand,
  dashboardSocketRuntimeModules,
  probeDashboardSocketListener,
  runDashboardSocketRuntimeTests,
} from "../scripts/dashboard-socket-runtime-boundary.mjs";

test("dashboard socket runtime wrapper skips only Codex UDS listener denials before test invocation", async () => {
  for (const errorCode of ["EPERM", "EACCES"]) {
    const logs = [];
    let runnerCalls = 0;
    const status = await runDashboardSocketRuntimeTests({
      probe: async () => ({ errorCode }),
      runner: () => { runnerCalls += 1; return { status: 0 }; },
      log: (message) => logs.push(message),
    });

    assert.equal(status, 0);
    assert.equal(runnerCalls, 0);
    assert.deepEqual(JSON.parse(logs[0]), {
      marker: "SANDBOX_DASHBOARD_SOCKET_LISTENER_BLOCKED",
      signature: "codex-dashboard-socket-listener-boundary",
      error_code: errorCode,
      command: dashboardSocketRuntimeCommand.join(" "),
      modules: dashboardSocketRuntimeModules,
      next_action: `Run ${dashboardSocketRuntimeCommand.join(" ")} outside the sandbox for complete dashboard socket-runtime coverage.`,
    });
  }
});

test("dashboard socket runtime wrapper removes its private UDS path after a successful preflight", async () => {
  const directory = mkdtempSync(join(tmpdir(), "kendall-dashboard-socket-boundary-test-"));
  const result = await probeDashboardSocketListener({ directory });

  assert.deepEqual(result, { errorCode: null });
  assert.equal(existsSync(join(directory, "listener.sock")), false);
  assert.equal(existsSync(directory), false);
});

test("dashboard socket runtime wrapper runs all four modules when listener preflight succeeds", async () => {
  const calls = [];
  const status = await runDashboardSocketRuntimeTests({
    probe: async () => ({ errorCode: null }),
    runner: (command, args) => { calls.push([command, args]); return { status: 0 }; },
  });

  assert.equal(status, 0);
  assert.deepEqual(calls, [[dashboardSocketRuntimeCommand[0], dashboardSocketRuntimeCommand.slice(1)]]);
});

test("dashboard socket runtime wrapper preserves non-boundary probe and test failures", async () => {
  const errors = [];
  const failedProbe = await runDashboardSocketRuntimeTests({
    probe: async () => ({ errorCode: "EADDRNOTAVAIL" }),
    error: (message) => errors.push(message),
  });
  const failedTest = await runDashboardSocketRuntimeTests({
    probe: async () => ({ errorCode: null }),
    runner: () => ({ status: 7 }),
  });

  assert.equal(failedProbe, 1);
  assert.match(errors[0], /EADDRNOTAVAIL/);
  assert.equal(failedTest, 7);
});
