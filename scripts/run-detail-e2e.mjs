import { runFocusedDashboardE2E } from "./dashboard-e2e-runner.mjs";

const code = await runFocusedDashboardE2E({
  databaseName: "e2e-supervisor-detail",
  grep: "shows execution attempt evidence and disabled workspace boundaries",
});

process.exit(code);
