import { runFocusedDashboardE2E } from "./dashboard-e2e-runner.mjs";

const code = await runFocusedDashboardE2E({
  databaseName: "e2e-supervisor-managed-mobile-recipe",
  testFile: "supervisor-managed-mobile-recipe.spec.ts",
  grep: "keeps mobile coverage intake available",
});

process.exit(code);
