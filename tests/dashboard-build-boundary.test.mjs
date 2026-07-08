import assert from "node:assert/strict";
import test from "node:test";

import { dashboardBuildBoundary, dashboardBuildCommand } from "../scripts/dashboard-build-boundary.mjs";

test("dashboard build boundary skips Turbopack build inside Codex sandbox", () => {
  const boundary = dashboardBuildBoundary({}, { processProbe: { errorCode: "EPERM" } });

  assert.equal(boundary.action, "skip");
  assert.equal(boundary.reason, "turbopack-process-port-sandbox-boundary");
  assert.match(boundary.message, /SKIP: dashboard build requires Next\/Turbopack/);
  assert.match(boundary.nextAction, /outside the sandbox/);
});

test("dashboard build boundary keeps real build command outside sandbox", () => {
  const boundary = dashboardBuildBoundary({ CODEX_SANDBOX_NETWORK_DISABLED: "1" }, { processProbe: { status: 0, errorCode: null } });

  assert.equal(boundary.action, "run");
  assert.equal(boundary.reason, "non-sandbox-build");
  assert.deepEqual(boundary.command, ["pnpm", "--filter", "@kendall/dashboard", "build"]);
  assert.deepEqual(dashboardBuildCommand(), boundary.command);
});

test("dashboard build boundary can be forced for explicit sandbox verification", () => {
  const boundary = dashboardBuildBoundary({
    KENDALL_FORCE_DASHBOARD_BUILD_IN_SANDBOX: "1",
  }, {
    processProbe: { errorCode: "EPERM" },
  });

  assert.equal(boundary.action, "run");
  assert.equal(boundary.reason, "forced-sandbox-build");
  assert.deepEqual(boundary.command, ["pnpm", "--filter", "@kendall/dashboard", "build"]);
});
