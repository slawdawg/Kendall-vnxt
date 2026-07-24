import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderLanCockpitUnits } from "../scripts/lan-cockpit-systemd.mjs";
import { assertTailnetOriginState, tailnetOriginStatePath, waitForPrivateSupervisorStartupGate, writeTailnetOriginState } from "../scripts/lan-cockpit-runtime.mjs";

test("renders private-UDS authenticated Tailnet cockpit units", () => {
  const units = renderLanCockpitUnits({ repoRoot: "/home/kendall/Kendall_Nxt", nodePath: "/usr/bin/node", pnpmPath: "/usr/bin/pnpm", uvPath: "/home/kendall/.local/bin/uv" });
  assert.match(units["kendall-lan-cockpit.target"], /WantedBy=default\.target/);
  assert.match(units["kendall-lan-cockpit.target"], /Conflicts=kendall-cockpit\.target kendall-cockpit-supervisor\.service kendall-cockpit-dashboard\.service kendall-lan-auth\.target kendall-lan-auth-supervisor\.service kendall-lan-auth-dashboard\.service/);
  assert.match(units["kendall-lan-cockpit.target"], /Before=kendall-cockpit\.target kendall-cockpit-supervisor\.service kendall-cockpit-dashboard\.service kendall-lan-auth\.target kendall-lan-auth-supervisor\.service kendall-lan-auth-dashboard\.service/);
  assert.match(units["kendall-lan-supervisor.service"], /KENDALL_LAN_AUTH_DIR=%h\/kendall-lan-auth/);
  assert.match(units["kendall-lan-supervisor.service"], /KENDALL_UV_PATH=\/home\/kendall\/\.local\/bin\/uv/);
  assert.match(units["kendall-lan-supervisor.service"], /PartOf=kendall-lan-cockpit\.target/);
  assert.match(units["kendall-lan-supervisor.service"], /lan-cockpit-runtime\.mjs supervisor/);
  assert.doesNotMatch(units["kendall-lan-supervisor.service"], /SUPERVISOR_PORT|0\.0\.0\.0/);
  assert.match(units["kendall-lan-dashboard.service"], /lan-cockpit-runtime\.mjs dashboard/);
  assert.match(units["kendall-lan-dashboard.service"], /After=kendall-lan-supervisor\.service/);
  assert.match(units["kendall-lan-dashboard.service"], /PartOf=kendall-lan-cockpit\.target/);
  assert.match(units["kendall-lan-dashboard.service"], /Requires=kendall-lan-supervisor\.service/);
  assert.match(units["kendall-lan-dashboard.service"], /BindsTo=kendall-lan-supervisor\.service/);
  assert.doesNotMatch(units["kendall-lan-dashboard.service"], /NEXT_PUBLIC_SUPERVISOR_URL|SUPERVISOR_INTERNAL_URL/);
});

test("Tailnet installer fences legacy port-3000 cockpit services and starts the supervisor through resolved uv", () => {
  const installerSource = readFileSync(new URL("../scripts/lan-cockpit-systemd.mjs", import.meta.url), "utf8");
  const runtimeSource = readFileSync(new URL("../scripts/lan-cockpit-runtime.mjs", import.meta.url), "utf8");
  for (const legacyUnit of [
    "kendall-cockpit-supervisor.service",
    "kendall-cockpit-dashboard.service",
    "kendall-lan-auth-supervisor.service",
    "kendall-lan-auth-dashboard.service",
  ]) {
    assert.match(installerSource, new RegExp(`"${legacyUnit}"`));
  }
  assert.match(installerSource, /stopLegacyCockpitUnits\(\);/);
  assert.match(installerSource, /if \(unitIsActive\(unit\)\) run\(\["stop", unit\]\);/);
  assert.match(runtimeSource, /KENDALL_UV_PATH is required for the supervisor/);
  assert.match(runtimeSource, /\["run", "--directory", "services\/supervisor", "supervisor"\]/);
});

test("waits for the private supervisor startup gate before launching the dashboard", async () => {
  let checks = 0;
  let delays = 0;
  await waitForPrivateSupervisorStartupGate("/private/supervisor.sock", {
    check: async (socketPath) => {
      assert.equal(socketPath, "/private/supervisor.sock");
      checks += 1;
      return checks === 3;
    },
    delay: async () => { delays += 1; },
    attempts: 3,
  });
  assert.equal(checks, 3);
  assert.equal(delays, 2);
});

test("rejects a dashboard origin that does not match the freshly started supervisor", () => {
  const authDir = "/private/kendall-lan-auth";
  assert.equal(tailnetOriginStatePath(authDir), "/private/kendall-lan-auth/tailnet-origin.json");
  assert.doesNotThrow(() => assertTailnetOriginState(authDir, "https://100.86.154.99:3000", () => JSON.stringify({ origin: "https://100.86.154.99:3000" })));
  assert.throws(() => assertTailnetOriginState(authDir, "https://100.86.154.99:3000", () => JSON.stringify({ origin: "https://100.86.154.98:3000" })), /does not match/);
});

test("records only the paired Tailnet origin with private file permissions", () => {
  const authDir = mkdtempSync(join(tmpdir(), "kendall-tailnet-origin-"));
  const origin = "https://100.86.154.99:3000";
  writeTailnetOriginState(authDir, origin);
  const statePath = tailnetOriginStatePath(authDir);
  assert.deepEqual(JSON.parse(readFileSync(statePath, "utf8")), { origin });
  assert.equal(statSync(statePath).mode & 0o777, 0o600);
});
