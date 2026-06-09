import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

function readWorkspaceFile(path) {
  return readFileSync(join(rootDir, path), "utf8");
}

function assertCondition(condition, message, failures) {
  if (!condition) {
    failures.push(message);
  }
}

const packageJson = JSON.parse(readWorkspaceFile("package.json"));
const contractSource = readWorkspaceFile("packages/contracts/src/api.ts");
const schemaSource = readWorkspaceFile("services/supervisor/src/supervisor/api/schemas.py");
const serviceSource = readWorkspaceFile("services/supervisor/src/supervisor/application/service.py");
const apiSource = readWorkspaceFile("services/supervisor/src/supervisor/api/main.py");
const dashboardClient = readWorkspaceFile("apps/dashboard/src/lib/supervisor.ts");
const controlsPage = readWorkspaceFile("apps/dashboard/src/app/controls/page.tsx");
const policyPanel = readWorkspaceFile("apps/dashboard/src/components/managed-recipe-policy-report-panel.tsx");
const controlsSpec = readWorkspaceFile("tests/e2e/dashboard.spec.ts");
const supervisorTests = readWorkspaceFile("services/supervisor/tests/integration/test_routing_preview.py");
const storyIndex = readWorkspaceFile("docs/stories/index.md");
const reconciliation = readWorkspaceFile("docs/architecture/kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md");

const failures = [];

assertCondition(
  packageJson.scripts?.["check:managed-recipes"] === "node ./scripts/check-managed-recipe-policy-report.mjs",
  "package.json must define check:managed-recipes as node ./scripts/check-managed-recipe-policy-report.mjs",
  failures,
);
assertCondition(
  packageJson.scripts?.check?.includes("pnpm run check:managed-recipes"),
  "pnpm run check must include pnpm run check:managed-recipes",
  failures,
);

assertCondition(
  contractSource.includes("ManagedRecipePolicyReportView"),
  "Shared contracts must include ManagedRecipePolicyReportView",
  failures,
);
assertCondition(
  schemaSource.includes("class ManagedRecipePolicyReportView"),
  "Supervisor schemas must include ManagedRecipePolicyReportView",
  failures,
);
assertCondition(
  apiSource.includes('"/supervisor/managed-recipe-policy-report"'),
  "FastAPI routes must expose /supervisor/managed-recipe-policy-report",
  failures,
);

for (const serviceText of [
  "get_managed_recipe_policy_report",
  "managed-recipe-policy-report-v1",
  "remoteAutomationApproved=False",
  "Managed recipe policies are not execution-authority approvals.",
  "GET /supervisor/managed-recipe-policy-report",
  "docs/stories/3-37-managed-recipe-policy-drift-check.md",
]) {
  assertCondition(serviceSource.includes(serviceText), `Managed recipe policy service must include ${serviceText}`, failures);
}

assertCondition(
  dashboardClient.includes("getManagedRecipePolicyReport"),
  "Dashboard API client must fetch the managed recipe policy report",
  failures,
);
assertCondition(
  controlsPage.includes("<ManagedRecipePolicyReportPanel report={managedRecipePolicyReport} />"),
  "Controls page must render ManagedRecipePolicyReportPanel",
  failures,
);

for (const panelText of [
  "ManagedRecipePolicyReportView",
  "Recipe policies",
  "remoteAutomationPolicy",
  "blockedOperations",
  "stopLines",
  "nextSafeActions",
]) {
  assertCondition(policyPanel.includes(panelText), `Managed recipe policy panel must render ${panelText}`, failures);
}

for (const browserText of [
  "GET /supervisor/managed-recipe-policy-report",
  "Policy report",
  "Dashboard test coverage",
  "Dashboard mobile coverage",
  "Managed recipe policies are not execution-authority approvals.",
  "pnpm run check:managed-recipes",
]) {
  assertCondition(controlsSpec.includes(browserText), `Controls e2e must assert ${browserText}`, failures);
}

for (const testText of [
  '"managed-recipe-policy-report-v1"',
  '"/supervisor/managed-recipe-policy-report"',
  '"dashboard-test-coverage"',
  '"dashboard-mobile-coverage"',
  "remoteAutomationApproved",
  "docs/stories/3-37-managed-recipe-policy-drift-check.md",
]) {
  assertCondition(supervisorTests.includes(testText), `Supervisor tests must assert ${testText}`, failures);
}

const storyPath = "docs/stories/3-37-managed-recipe-policy-drift-check.md";
assertCondition(existsSync(join(rootDir, storyPath)), `Missing managed recipe policy drift story ${storyPath}`, failures);
assertCondition(
  storyIndex.includes("3-37-managed-recipe-policy-drift-check.md"),
  "Story index must reference Story 3.37 managed recipe policy drift check",
  failures,
);
assertCondition(
  reconciliation.includes("Managed recipe policy drift check"),
  "Implementation reconciliation must track the managed recipe policy drift check",
  failures,
);

if (failures.length > 0) {
  console.error("Managed recipe policy report drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: managed recipe policy report drift checks passed.");
