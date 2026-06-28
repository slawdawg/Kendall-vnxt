import { readFileSync } from "node:fs";
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
const inventoryPanel = readWorkspaceFile("apps/dashboard/src/components/legacy-planning-artifact-inventory-report-panel.tsx");
const reportShortcuts = readWorkspaceFile("apps/dashboard/src/lib/report-shortcuts.ts");
const supervisorTests = readWorkspaceFile("services/supervisor/tests/integration/test_routing_preview.py");

const failures = [];

assertCondition(
  packageJson.scripts?.["check:legacy-planning-inventory"] === "node ./scripts/check-legacy-planning-inventory.mjs",
  "package.json must define check:legacy-planning-inventory",
  failures,
);
assertCondition(
  packageJson.scripts?.["check:static"]?.includes("pnpm run check:legacy-planning-inventory"),
  "pnpm run check:static must include pnpm run check:legacy-planning-inventory",
  failures,
);
assertCondition(
  packageJson.scripts?.check?.includes("pnpm run check:legacy-planning-inventory"),
  "pnpm run check must include pnpm run check:legacy-planning-inventory",
  failures,
);

for (const typeName of ["LegacyPlanningArtifactCandidateView", "LegacyPlanningArtifactInventoryReportView"]) {
  assertCondition(contractSource.includes(typeName), `Shared contracts must include ${typeName}`, failures);
  assertCondition(schemaSource.includes(`class ${typeName}`), `Supervisor schemas must include ${typeName}`, failures);
}

assertCondition(
  apiSource.includes('"/supervisor/legacy-planning-artifact-inventory"'),
  "FastAPI routes must expose /supervisor/legacy-planning-artifact-inventory",
  failures,
);
assertCondition(
  serviceSource.includes('reportId="legacy-planning-artifact-inventory-report-v1"'),
  "Supervisor service must build the legacy planning artifact inventory report",
  failures,
);
assertCondition(
  serviceSource.includes('reportId="legacy-planning-artifact-inventory-report-v1"') &&
    serviceSource.includes('endpoint="GET /supervisor/legacy-planning-artifact-inventory"'),
  "Supervisor report catalog must include the legacy planning artifact inventory report",
  failures,
);
assertCondition(
  dashboardClient.includes("getLegacyPlanningArtifactInventoryReport"),
  "Dashboard API client must fetch the legacy planning artifact inventory report",
  failures,
);
assertCondition(
  controlsPage.includes("getLegacyPlanningArtifactInventoryReport") &&
    controlsPage.includes("<LegacyPlanningArtifactInventoryReportPanel report={legacyPlanningArtifactInventoryReport} />"),
  "Controls page must fetch and render the legacy planning artifact inventory report",
  failures,
);
assertCondition(
  !inventoryPanel.includes(".slice(0, 12)") && inventoryPanel.includes("report.candidates.map"),
  "Legacy planning inventory panel must render the full candidate list without silently truncating candidates",
  failures,
);
for (const panelText of [
  "LegacyPlanningArtifactInventoryReportView",
  "Metadata-only candidates",
  "Discovered candidates",
  "sourceAccessState",
  "evidenceBoundary",
  "artifactBodyRetained",
]) {
  assertCondition(inventoryPanel.includes(panelText), `Legacy planning inventory panel must render ${panelText}`, failures);
}
assertCondition(
  reportShortcuts.includes('"GET /supervisor/legacy-planning-artifact-inventory": "#legacy-planning-artifact-inventory"'),
  "Report shortcuts must link the legacy planning artifact inventory endpoint to its controls anchor",
  failures,
);

for (const requiredText of [
  "metadata_only_no_raw_content_retained",
  "SUPERVISOR_LEGACY_PLANNING_ROOT",
  "_discover_legacy_planning_artifacts",
  "_legacy_planning_artifact_type",
  "local_source_root_not_present",
  "local_metadata_available",
  "source_owned_metadata_available",
  "artifactBodyRetained=False",
  'commandId="check-legacy-planning-inventory"',
  "_bmad-output/planning-artifacts",
  "_bmad-output/implementation-artifacts",
  "_bmad-output/brainstorming",
  "_bmad-output/research",
  "_bmad-output/handoffs",
  "_bmad-output/approval-packets",
  "_bmad-output/reviews",
  "docs/workflows",
  "docs/architecture",
  "brainstorming_session",
  "research_packet",
  "handoff",
  "approval_packet",
  "decision_record",
]) {
  assertCondition(serviceSource.includes(requiredText), `Inventory service must include ${requiredText}`, failures);
}

const inventoryMethod = serviceSource.split("def get_legacy_planning_artifact_inventory_report")[1]?.split("def get_verification_readiness_report")[0] ?? "";
for (const forbiddenText of ["read_text(", ".read_text", "open(", "rawPayload=", "artifactBodyRetained=True"]) {
  assertCondition(!inventoryMethod.includes(forbiddenText), `Inventory service must not retain raw artifact content via ${forbiddenText}`, failures);
}

assertCondition(
  supervisorTests.includes("test_legacy_planning_artifact_inventory_report_discovers_metadata_only_candidates_without_mutation"),
  "Supervisor integration tests must cover metadata-only legacy planning artifact inventory",
  failures,
);

if (failures.length > 0) {
  console.error("Legacy planning artifact inventory drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: legacy planning artifact inventory drift checks passed.");
