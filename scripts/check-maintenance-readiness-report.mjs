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
const maintenancePanel = readWorkspaceFile("apps/dashboard/src/components/maintenance-readiness-report-panel.tsx");
const controlsSpec = readWorkspaceFile("tests/e2e/dashboard.spec.ts");
const supervisorTests = readWorkspaceFile("services/supervisor/tests/integration/test_routing_preview.py");
const storyIndex = readWorkspaceFile("docs/stories/index.md");
const reconciliation = readWorkspaceFile("docs/architecture/kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md");

const failures = [];

assertCondition(
  packageJson.scripts?.["check:maintenance-readiness"] === "node ./scripts/check-maintenance-readiness-report.mjs",
  "package.json must define check:maintenance-readiness as node ./scripts/check-maintenance-readiness-report.mjs",
  failures,
);
assertCondition(
  packageJson.scripts?.check?.includes("pnpm run check:maintenance-readiness"),
  "pnpm run check must include pnpm run check:maintenance-readiness",
  failures,
);

for (const typeName of ["MaintenanceReadinessTrackView", "MaintenanceReadinessReportView"]) {
  assertCondition(contractSource.includes(typeName), `Shared contracts must include ${typeName}`, failures);
  assertCondition(schemaSource.includes(`class ${typeName}`), `Supervisor schemas must include ${typeName}`, failures);
}

assertCondition(
  apiSource.includes('"/supervisor/maintenance-readiness-report"'),
  "FastAPI routes must expose /supervisor/maintenance-readiness-report",
  failures,
);

for (const serviceText of [
  "get_maintenance_readiness_report",
  "maintenance-readiness-report-v1",
  "documentation-hygiene",
  "verification-hygiene",
  "report-surface-alignment",
  "authority-blocker-watch",
  "Ollama Story 4.4 remains blocked pending explicit approval for real provider calls.",
  "Ollama Stories 4.1-4.3 are non-executing no-call preparation only.",
  "Maintenance work must not approve local provider/model calls.",
  "docs/stories/3-46-maintenance-readiness-drift-check.md",
]) {
  assertCondition(serviceSource.includes(serviceText), `Maintenance readiness service must include ${serviceText}`, failures);
}
assertCondition(
  !serviceSource.includes("4.1-4.4 remain blocked"),
  "Maintenance readiness service must not use stale Ollama 4.1-4.4 blocked wording",
  failures,
);

assertCondition(
  dashboardClient.includes("getMaintenanceReadinessReport"),
  "Dashboard API client must fetch the maintenance readiness report",
  failures,
);
assertCondition(
  controlsPage.includes("<MaintenanceReadinessReportPanel report={maintenanceReadinessReport} />"),
  "Controls page must render MaintenanceReadinessReportPanel",
  failures,
);

for (const panelText of [
  "MaintenanceReadinessReportView",
  "Maintenance tracks",
  "track.relatedReports",
  "track.relatedDocs",
  "track.dashboardAnchors",
  "reportShortcutHref",
  "Related reports",
  "Related docs",
  "stopLines",
  "nextSafeActions",
]) {
  assertCondition(maintenancePanel.includes(panelText), `Maintenance readiness panel must render ${panelText}`, failures);
}

for (const browserText of [
  "Maintenance readiness",
  "Safe work map",
  "documentation-hygiene",
  "Related reports",
  "GET /supervisor/documentation-authority-report",
  "Related docs",
  "docs/stories/index.md",
  "/controls#dashboard-e2e-report",
  "verification-hygiene",
  "authority-blocker-watch",
  "Maintenance work must not approve local provider/model calls.",
  "pnpm run check:maintenance-readiness",
]) {
  assertCondition(controlsSpec.includes(browserText), `Controls e2e must assert ${browserText}`, failures);
}

for (const testText of [
  '"maintenance-readiness-report-v1"',
  '"/supervisor/maintenance-readiness-report"',
  '"documentation-hygiene"',
  '"verification-hygiene"',
  '"dashboardAnchors"',
  '"relatedDocs"',
  '"authority-blocker-watch"',
  "docs/stories/3-46-maintenance-readiness-drift-check.md",
]) {
  assertCondition(supervisorTests.includes(testText), `Supervisor tests must assert ${testText}`, failures);
}

const storyPath = "docs/stories/3-46-maintenance-readiness-drift-check.md";
assertCondition(existsSync(join(rootDir, storyPath)), `Missing maintenance readiness drift story ${storyPath}`, failures);
const linksStoryPath = "docs/stories/3-62-maintenance-readiness-evidence-links.md";
assertCondition(existsSync(join(rootDir, linksStoryPath)), `Missing maintenance readiness evidence links story ${linksStoryPath}`, failures);
assertCondition(
  storyIndex.includes("3-46-maintenance-readiness-drift-check.md"),
  "Story index must reference Story 3.46 maintenance readiness drift check",
  failures,
);
assertCondition(
  storyIndex.includes("3-62-maintenance-readiness-evidence-links.md"),
  "Story index must reference Story 3.62 maintenance readiness evidence links",
  failures,
);
assertCondition(
  reconciliation.includes("Maintenance readiness drift check") && reconciliation.includes("Maintenance readiness evidence links"),
  "Implementation reconciliation must track the maintenance readiness drift check and evidence links",
  failures,
);
assertCondition(
  serviceSource.includes("pnpm run check:maintenance-readiness"),
  "Verification readiness report must surface pnpm run check:maintenance-readiness",
  failures,
);

if (failures.length > 0) {
  console.error("Maintenance readiness report drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: maintenance readiness report drift checks passed.");
