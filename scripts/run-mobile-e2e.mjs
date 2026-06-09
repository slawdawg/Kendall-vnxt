import { runFocusedDashboardE2E } from "./dashboard-e2e-runner.mjs";

const code = await runFocusedDashboardE2E({
  databaseName: "e2e-supervisor-mobile",
  testFile: "dashboard-mobile.spec.ts",
  grep: "restores a saved intake draft after refresh",
});

process.exit(code);
