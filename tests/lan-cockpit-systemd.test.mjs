import assert from "node:assert/strict";
import { test } from "node:test";
import { renderLanCockpitUnits } from "../scripts/lan-cockpit-systemd.mjs";
import { waitForPrivateSupervisorStartupGate } from "../scripts/lan-cockpit-runtime.mjs";

test("renders private-UDS authenticated Tailnet cockpit units", () => {
  const units = renderLanCockpitUnits({ repoRoot: "/home/kendall/Kendall_Nxt", nodePath: "/usr/bin/node", pnpmPath: "/usr/bin/pnpm" });
  assert.match(units["kendall-lan-cockpit.target"], /WantedBy=default\.target/);
  assert.match(units["kendall-lan-cockpit.target"], /Conflicts=kendall-cockpit\.target kendall-lan-auth\.target/);
  assert.match(units["kendall-lan-supervisor.service"], /KENDALL_LAN_AUTH_DIR=%h\/kendall-lan-auth/);
  assert.match(units["kendall-lan-supervisor.service"], /lan-cockpit-runtime\.mjs supervisor/);
  assert.doesNotMatch(units["kendall-lan-supervisor.service"], /SUPERVISOR_PORT|0\.0\.0\.0/);
  assert.match(units["kendall-lan-dashboard.service"], /lan-cockpit-runtime\.mjs dashboard/);
  assert.match(units["kendall-lan-dashboard.service"], /After=kendall-lan-supervisor\.service/);
  assert.match(units["kendall-lan-dashboard.service"], /Requires=kendall-lan-supervisor\.service/);
  assert.match(units["kendall-lan-dashboard.service"], /BindsTo=kendall-lan-supervisor\.service/);
  assert.doesNotMatch(units["kendall-lan-dashboard.service"], /NEXT_PUBLIC_SUPERVISOR_URL|SUPERVISOR_INTERNAL_URL/);
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
