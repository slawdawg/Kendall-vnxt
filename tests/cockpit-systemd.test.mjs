import assert from "node:assert/strict";
import { test } from "node:test";
import { renderCockpitUnits } from "../scripts/cockpit-systemd.mjs";

test("renders user systemd units for cockpit supervisor and dashboard", () => {
  const units = renderCockpitUnits({
    repoRoot: "/home/kendall/Kendall_Nxt",
    pnpmPath: "/usr/bin/pnpm",
    uvPath: "/usr/bin/uv",
    dashboardPort: "3100",
    supervisorPort: "8100",
  });

  assert.match(units["kendall-cockpit.target"], /WantedBy=default\.target/);
  assert.match(units["kendall-cockpit.target"], /Wants=kendall-cockpit-supervisor\.service kendall-cockpit-dashboard\.service/);

  assert.match(units["kendall-cockpit-supervisor.service"], /WorkingDirectory=\/home\/kendall\/Kendall_Nxt/);
  assert.match(units["kendall-cockpit-supervisor.service"], /ExecStart=\/usr\/bin\/uv run --directory services\/supervisor uvicorn supervisor\.api\.main:app --host 0\.0\.0\.0 --port 8100/);
  assert.match(units["kendall-cockpit-supervisor.service"], /Restart=always/);

  assert.match(units["kendall-cockpit-dashboard.service"], /Environment=NEXT_PUBLIC_SUPERVISOR_URL=http:\/\/127\.0\.0\.1:8100/);
  assert.match(units["kendall-cockpit-dashboard.service"], /ExecStart=\/usr\/bin\/pnpm --filter @kendall\/dashboard exec next dev --hostname 0\.0\.0\.0 --port 3100/);
  assert.match(units["kendall-cockpit-dashboard.service"], /Restart=always/);
});
