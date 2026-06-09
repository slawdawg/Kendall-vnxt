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
]) {
  assertCondition(existsSync(join(rootDir, story)), `Missing runtime export story evidence ${story}`, failures);
}

for (const panelText of ["Review navigator", "exportView.reviewNavigator.map", "item.label", "item.stopLines"]) {
  assertCondition(exportPanel.includes(panelText), `Runtime evidence export panel must render ${panelText}`, failures);
}

for (const panelText of ["Review navigator", "Runtime state", "Authority boundary", "Git-backed evidence"]) {
  assertCondition(detailSpec.includes(panelText), `Dashboard detail e2e must assert ${panelText}`, failures);
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

if (failures.length > 0) {
  console.error("Runtime evidence export drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: runtime evidence export drift checks passed.");
