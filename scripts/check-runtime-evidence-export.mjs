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
const exportPanel = readWorkspaceFile("apps/dashboard/src/components/runtime-evidence-export-panel.tsx");
const overviewPanel = readWorkspaceFile("apps/dashboard/src/components/evidence-overview-panel.tsx");
const reportShortcuts = readWorkspaceFile("apps/dashboard/src/lib/report-shortcuts.ts");
const detailSpec = readWorkspaceFile("tests/e2e/dashboard.spec.ts");
const supervisorTests = readWorkspaceFile("services/supervisor/tests/integration/test_routing_preview.py");
const storyIndex = readWorkspaceFile("docs/stories/index.md");

const failures = [];

assertCondition(
  packageJson.scripts?.["check:runtime-export"] === "node ./scripts/check-runtime-evidence-export.mjs",
  "package.json must define check:runtime-export as node ./scripts/check-runtime-evidence-export.mjs",
  failures,
);
assertCondition(
  packageJson.scripts?.check?.includes("pnpm run check:runtime-export"),
  "pnpm run check must include pnpm run check:runtime-export",
  failures,
);

for (const typeName of [
  "RuntimeEvidenceExportBoundaryView",
  "RuntimeEvidenceExportSafetyView",
  "RuntimeEvidenceReviewManifestView",
  "RuntimeEvidenceReviewNavigatorItemView",
  "RuntimeEvidenceExportView",
]) {
  assertCondition(contractSource.includes(typeName), `Shared contracts must include ${typeName}`, failures);
  assertCondition(schemaSource.includes(`class ${typeName}`), `Supervisor schemas must include ${typeName}`, failures);
}

assertCondition(
  apiSource.includes('"/work-items/{work_item_id}/runtime-evidence-export"'),
  "FastAPI routes must expose /work-items/{work_item_id}/runtime-evidence-export",
  failures,
);
assertCondition(
  serviceSource.includes("reviewNavigator=["),
  "Runtime evidence export service must build reviewNavigator",
  failures,
);
for (const itemId of ["review-runtime-state", "review-authority-boundary", "review-git-backed-evidence"]) {
  assertCondition(serviceSource.includes(`itemId="${itemId}"`), `Runtime export must include navigator item ${itemId}`, failures);
  assertCondition(supervisorTests.includes(`"${itemId}"`), `Supervisor tests must assert navigator item ${itemId}`, failures);
}

for (const story of [
  "docs/stories/2-7-runtime-evidence-export-strategy.md",
  "docs/stories/3-20-runtime-evidence-review-manifest.md",
  "docs/stories/3-30-runtime-evidence-review-navigator.md",
  "docs/stories/3-31-runtime-evidence-export-drift-check.md",
  "docs/stories/3-48-execution-boundary-report-drift-check.md",
  "docs/stories/3-49-execution-evidence-boundary-drift-check.md",
  "docs/stories/3-50-provider-fixture-policy-drift-check.md",
  "docs/stories/3-51-process-lifecycle-policy-drift-check.md",
]) {
  assertCondition(existsSync(join(rootDir, story)), `Missing runtime export story evidence ${story}`, failures);
}

for (const panelText of ["Review navigator", "exportView.reviewNavigator.map", "item.label", "item.stopLines", "reportShortcutHref(report)"]) {
  assertCondition(exportPanel.includes(panelText), `Runtime evidence export panel must render ${panelText}`, failures);
}

for (const panelText of ["Review shortcuts", "runtimeEvidenceExport.reviewNavigator", "item.target", "item.itemId", "reportShortcutHref(report)"]) {
  assertCondition(overviewPanel.includes(panelText), `Evidence overview panel must render ${panelText}`, failures);
}

for (const shortcutText of [
  "reportAnchorByEndpoint",
  "reportShortcutHref",
  "#execution-readiness-report",
  "#safe-development-backlog",
  "#github-workflow-policy-report",
  "#delivery-readiness-policy-report",
  "#supervisor-report-catalog",
]) {
  assertCondition(reportShortcuts.includes(shortcutText), `Report shortcut helper must include ${shortcutText}`, failures);
}

for (const panelText of ["Review navigator", "Runtime state", "Authority boundary", "Git-backed evidence"]) {
  assertCondition(detailSpec.includes(panelText), `Dashboard detail e2e must assert ${panelText}`, failures);
}

for (const panelText of ["/controls#execution-readiness-report", "/controls#safe-development-backlog"]) {
  assertCondition(detailSpec.includes(panelText), `Dashboard detail e2e must assert related report link ${panelText}`, failures);
}

for (const panelText of ["Review shortcuts", "3 shortcuts"]) {
  assertCondition(detailSpec.includes(panelText), `Dashboard detail e2e must assert overview ${panelText}`, failures);
}

assertCondition(
  serviceSource.includes("docs/stories/3-31-runtime-evidence-export-drift-check.md"),
  "Runtime evidence export git-backed evidence must include Story 3.31",
  failures,
);
assertCondition(
  serviceSource.includes("pnpm run check:runtime-export"),
  "Verification readiness report must surface pnpm run check:runtime-export",
  failures,
);
assertCondition(
  detailSpec.includes("pnpm run check:runtime-export"),
  "Dashboard browser coverage must assert pnpm run check:runtime-export",
  failures,
);
assertCondition(
  storyIndex.includes("3-31-runtime-evidence-export-drift-check.md"),
  "Story index must reference Story 3.31 runtime evidence export drift check",
  failures,
);
assertCondition(
  storyIndex.includes("3-40-runtime-report-anchor-links.md"),
  "Story index must reference Story 3.40 runtime report anchor links",
  failures,
);
assertCondition(
  storyIndex.includes("3-42-github-workflow-policy-report.md"),
  "Story index must reference Story 3.42 GitHub workflow policy report",
  failures,
);
assertCondition(
  storyIndex.includes("3-43-safe-delivery-hygiene.md"),
  "Story index must reference Story 3.43 safe delivery hygiene",
  failures,
);
assertCondition(
  storyIndex.includes("3-44-delivery-readiness-policy-report.md"),
  "Story index must reference Story 3.44 delivery readiness policy report",
  failures,
);
assertCondition(
  storyIndex.includes("3-45-delivery-readiness-policy-drift-check.md"),
  "Story index must reference Story 3.45 delivery readiness policy drift check",
  failures,
);
assertCondition(
  storyIndex.includes("3-46-maintenance-readiness-drift-check.md"),
  "Story index must reference Story 3.46 maintenance readiness drift check",
  failures,
);
assertCondition(
  storyIndex.includes("3-47-core-readiness-drift-checks.md"),
  "Story index must reference Story 3.47 core readiness drift checks",
  failures,
);
assertCondition(
  storyIndex.includes("3-48-execution-boundary-report-drift-check.md"),
  "Story index must reference Story 3.48 execution boundary report drift check",
  failures,
);
assertCondition(
  storyIndex.includes("3-49-execution-evidence-boundary-drift-check.md"),
  "Story index must reference Story 3.49 execution evidence boundary drift check",
  failures,
);
assertCondition(
  storyIndex.includes("3-50-provider-fixture-policy-drift-check.md"),
  "Story index must reference Story 3.50 provider fixture policy drift check",
  failures,
);
assertCondition(
  storyIndex.includes("3-51-process-lifecycle-policy-drift-check.md"),
  "Story index must reference Story 3.51 process lifecycle policy drift check",
  failures,
);

if (failures.length > 0) {
  console.error("Runtime evidence export drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: runtime evidence export drift checks passed.");
