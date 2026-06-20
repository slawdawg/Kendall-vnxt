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
const actionPlanPanel = readWorkspaceFile("apps/dashboard/src/components/maintenance-action-plan-report-panel.tsx");
const reportShortcuts = readWorkspaceFile("apps/dashboard/src/lib/report-shortcuts.ts");
const controlsSpec = readWorkspaceFile("tests/e2e/dashboard.spec.ts");
const supervisorTests = readWorkspaceFile("services/supervisor/tests/integration/test_routing_preview.py");
const runtimeExportCheck = readWorkspaceFile("scripts/check-runtime-evidence-export.mjs");
const reportCatalogCheck = readWorkspaceFile("scripts/check-supervisor-report-catalog.mjs");
const storyIndex = readWorkspaceFile("docs/workflows/implementation-evidence-boundary.md");
const reconciliation = readWorkspaceFile("docs/architecture/kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md");

const failures = [];

assertCondition(
  packageJson.scripts?.["check:maintenance-action-plan"] === "node ./scripts/check-maintenance-action-plan-report.mjs",
  "package.json must define check:maintenance-action-plan as node ./scripts/check-maintenance-action-plan-report.mjs",
  failures,
);
assertCondition(
  packageJson.scripts?.check?.includes("pnpm run check:maintenance-action-plan"),
  "pnpm run check must include pnpm run check:maintenance-action-plan",
  failures,
);

for (const typeName of ["MaintenanceActionPlanStepView", "MaintenanceActionPlanReportView"]) {
  assertCondition(contractSource.includes(typeName), `Shared contracts must include ${typeName}`, failures);
  assertCondition(schemaSource.includes(`class ${typeName}`), `Supervisor schemas must include ${typeName}`, failures);
}

assertCondition(
  apiSource.includes('"/supervisor/maintenance-action-plan-report"'),
  "FastAPI routes must expose /supervisor/maintenance-action-plan-report",
  failures,
);

for (const serviceText of [
  "get_maintenance_action_plan_report",
  "maintenance-action-plan-report-v1",
  "select-large-safe-slice",
  "verify-evidence-surfaces",
  "run-verification-chain",
  "preserve-authority-stop-lines",
  "Maintenance action plans are not execution-authority approvals.",
  "docs/workflows/implementation-evidence-boundary.md",
]) {
  assertCondition(serviceSource.includes(serviceText), `Maintenance action plan service must include ${serviceText}`, failures);
}

assertCondition(
  dashboardClient.includes("getMaintenanceActionPlanReport"),
  "Dashboard API client must fetch the maintenance action plan report",
  failures,
);
assertCondition(
  controlsPage.includes("<MaintenanceActionPlanReportPanel report={maintenanceActionPlanReport} />"),
  "Controls page must render MaintenanceActionPlanReportPanel",
  failures,
);
assertCondition(
  reportShortcuts.includes('"GET /supervisor/maintenance-action-plan-report": "#maintenance-action-plan-report"'),
  "Report shortcut helper must map maintenance action plan endpoint to #maintenance-action-plan-report",
  failures,
);

for (const panelText of [
  "MaintenanceActionPlanReportView",
  "Plan steps",
  "step.verificationCommands",
  "step.dashboardAnchors",
  "step.relatedReports",
  "step.relatedDocs",
  "reportShortcutHref",
  "Related reports",
  "Related docs",
  "verificationChain",
  "stopLines",
  "nextSafeActions",
]) {
  assertCondition(actionPlanPanel.includes(panelText), `Maintenance action plan panel must render ${panelText}`, failures);
}

for (const browserText of [
  "Maintenance action plan",
  "Next safe work plan",
  "select-large-safe-slice",
  "verify-evidence-surfaces",
  "Related reports",
  "GET /supervisor/safe-development-backlog",
  "Related docs",
  "docs/workflows/implementation-evidence-boundary.md",
  "preserve-authority-stop-lines",
  "pnpm run check:process-lifecycle",
  "/controls#safe-development-backlog",
  "Maintenance action plans are not execution-authority approvals.",
]) {
  assertCondition(controlsSpec.includes(browserText), `Controls e2e must assert ${browserText}`, failures);
}

for (const testText of [
  '"maintenance-action-plan-report-v1"',
  '"/supervisor/maintenance-action-plan-report"',
  '"select-large-safe-slice"',
  '"verify-evidence-surfaces"',
  '"relatedReports"',
  '"relatedDocs"',
  '"preserve-authority-stop-lines"',
  "docs/workflows/implementation-evidence-boundary.md",
]) {
  assertCondition(supervisorTests.includes(testText), `Supervisor tests must assert ${testText}`, failures);
}

assertCondition(
  reportCatalogCheck.includes("maintenance-action-plan-report-v1"),
  "Supervisor report catalog drift check must require maintenance action plan report",
  failures,
);
assertCondition(
  runtimeExportCheck.includes("docs/workflows/implementation-evidence-boundary.md"),
  "Runtime evidence export drift check must require Story 3.52 git-backed evidence",
  failures,
);
assertCondition(
  serviceSource.includes("GET /supervisor/maintenance-action-plan-report"),
  "Runtime evidence export service must reference the maintenance action plan report",
  failures,
);

const storyPath = "docs/workflows/implementation-evidence-boundary.md";
assertCondition(existsSync(join(rootDir, storyPath)), `Missing maintenance action plan story ${storyPath}`, failures);
const linksStoryPath = "docs/workflows/implementation-evidence-boundary.md";
assertCondition(existsSync(join(rootDir, linksStoryPath)), `Missing maintenance action evidence links story ${linksStoryPath}`, failures);
assertCondition(
  storyIndex.includes("3-52-maintenance-action-plan-report.md"),
  "Story index must reference Story 3.52 maintenance action plan report",
  failures,
);
assertCondition(
  storyIndex.includes("3-61-maintenance-action-evidence-links.md"),
  "Story index must reference Story 3.61 maintenance action evidence links",
  failures,
);
assertCondition(
  reconciliation.includes("Maintenance action plan report") && reconciliation.includes("Maintenance action evidence links"),
  "Implementation reconciliation must track the maintenance action plan report and evidence links",
  failures,
);

if (failures.length > 0) {
  console.error("Maintenance action plan report drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: maintenance action plan report drift checks passed.");
