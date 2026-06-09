import { runFocusedDashboardE2E } from "./dashboard-e2e-runner.mjs";

const code = await runFocusedDashboardE2E({
  databaseName: "e2e-supervisor-managed-recipe",
  testFile: "supervisor-managed-recipe.spec.ts",
  grep: "keeps dashboard coverage intake available",
});

process.exit(code);
