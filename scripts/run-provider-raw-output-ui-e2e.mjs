import { runFocusedDashboardE2E } from "./dashboard-e2e-runner.mjs";

const code = await runFocusedDashboardE2E({
  databaseName: "e2e-provider-raw-output-ui",
  grep: "hides synthetic provider raw output while showing bounded metadata",
});

process.exit(code);
