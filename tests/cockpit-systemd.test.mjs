import assert from "node:assert/strict";
import { test } from "node:test";
import { renderCockpitUnits } from "../scripts/cockpit-systemd.mjs";

test("renders user systemd units for cockpit supervisor and dashboard", () => {
  const units = renderCockpitUnits({
    repoRoot: "/home/kendall/Kendall_Nxt",
    pnpmPath: "/usr/bin/pnpm",
    uvPath: "/usr/bin/uv",
    dashboardPort: "3000",
    supervisorPort: "8100",
  });

  assert.match(units["kendall-cockpit.target"], /WantedBy=default\.target/);
  assert.match(units["kendall-cockpit.target"], /Wants=kendall-cockpit-supervisor\.service kendall-cockpit-dashboard\.service/);

  assert.match(units["kendall-cockpit-supervisor.service"], /WorkingDirectory=\/home\/kendall\/Kendall_Nxt/);
  assert.match(units["kendall-cockpit-supervisor.service"], /Environment=SUPERVISOR_PORT=8100/);
  assert.match(units["kendall-cockpit-supervisor.service"], /ExecStart=\/usr\/bin\/uv run --directory services\/supervisor supervisor/);
  assert.match(units["kendall-cockpit-supervisor.service"], /Restart=always/);

  assert.match(units["kendall-cockpit-dashboard.service"], /Environment=NEXT_PUBLIC_SUPERVISOR_URL=http:\/\/127\.0\.0\.1:8100/);
  assert.match(units["kendall-cockpit-dashboard.service"], /Environment=KENDALL_PIPELINE_WORKER_EVIDENCE_DIR=\/home\/kendall\/Kendall_Nxt\/.kendall-local\/governed-worker-evidence/);
  assert.match(units["kendall-cockpit-dashboard.service"], /Environment=KENDALL_DASHBOARD_PORT=3000/);
  assert.match(units["kendall-cockpit-dashboard.service"], /ExecStart=\/usr\/bin\/pnpm --filter @kendall\/dashboard dev/);
  assert.match(units["kendall-cockpit-dashboard.service"], /Restart=always/);
});
