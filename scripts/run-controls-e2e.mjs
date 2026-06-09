import { runFocusedDashboardE2E } from "./dashboard-e2e-runner.mjs";

const code = await runFocusedDashboardE2E({
  databaseName: "e2e-supervisor-controls",
  grep: "shows compact routing fleet data on controls",
});

process.exit(code);
