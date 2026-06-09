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
const reviewPanel = readWorkspaceFile("apps/dashboard/src/components/runtime-evidence-review-report-panel.tsx");
const reportShortcuts = readWorkspaceFile("apps/dashboard/src/lib/report-shortcuts.ts");
const controlsSpec = readWorkspaceFile("tests/e2e/dashboard.spec.ts");
const supervisorTests = readWorkspaceFile("services/supervisor/tests/integration/test_routing_preview.py");
const runtimeExportCheck = readWorkspaceFile("scripts/check-runtime-evidence-export.mjs");
const reportCatalogCheck = readWorkspaceFile("scripts/check-supervisor-report-catalog.mjs");
const runbookCheck = readWorkspaceFile("scripts/check-runbook-verification.mjs");
const docsCheck = readWorkspaceFile("scripts/check-doc-indexes.mjs");
const storyIndex = readWorkspaceFile("docs/stories/index.md");
const currentGap = readWorkspaceFile("docs/architecture/kendall-vnxt-current-gap-review-2026-06-08.md");
const reconciliation = readWorkspaceFile("docs/architecture/kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md");

const failures = [];

assertCondition(
  packageJson.scripts?.["check:runtime-review"] === "node ./scripts/check-runtime-evidence-review-report.mjs",
  "package.json must define check:runtime-review as node ./scripts/check-runtime-evidence-review-report.mjs",
  failures,
);
assertCondition(
  packageJson.scripts?.check?.includes("pnpm run check:runtime-review"),
  "pnpm run check must include pnpm run check:runtime-review",
  failures,
);

for (const typeName of ["RuntimeEvidenceReviewWorkItemView", "RuntimeEvidenceReviewReportView"]) {
  assertCondition(contractSource.includes(typeName), `Shared contracts must include ${typeName}`, failures);
  assertCondition(schemaSource.includes(`class ${typeName}`), `Supervisor schemas must include ${typeName}`, failures);
}

assertCondition(
  apiSource.includes('"/supervisor/runtime-evidence-review-report"'),
  "FastAPI routes must expose /supervisor/runtime-evidence-review-report",
  failures,
);

for (const serviceText of [
  "get_runtime_evidence_review_report",
  "runtime-evidence-review-report-v1",
  "RuntimeEvidenceReviewWorkItemView",
  "reviewQueue",
  "runtimeExportHref",
  "Runtime evidence review is not execution-authority approval.",
  "GET /supervisor/runtime-evidence-review-report",
  "docs/stories/3-55-runtime-evidence-review-index.md",
]) {
  assertCondition(serviceSource.includes(serviceText), `Runtime evidence review service must include ${serviceText}`, failures);
}

assertCondition(
  dashboardClient.includes("getRuntimeEvidenceReviewReport"),
  "Dashboard API client must fetch the runtime evidence review report",
  failures,
);
assertCondition(
  controlsPage.includes("<RuntimeEvidenceReviewReportPanel report={runtimeEvidenceReviewReport} />"),
  "Controls page must render RuntimeEvidenceReviewReportPanel",
  failures,
);
assertCondition(
  reportShortcuts.includes('"GET /supervisor/runtime-evidence-review-report": "#runtime-evidence-review-report"'),
  "Report shortcut helper must map runtime evidence review endpoint to #runtime-evidence-review-report",
  failures,
);

for (const panelText of [
  "RuntimeEvidenceReviewReportView",
  "Work-item evidence queue",
  "Review queue",
  "item.runtimeExportHref",
  "report.relatedReports",
  "report.dashboardAnchors",
  "report.stopLines",
]) {
  assertCondition(reviewPanel.includes(panelText), `Runtime evidence review panel must render ${panelText}`, failures);
}

for (const browserText of [
  "Runtime evidence review",
  "Work-item evidence queue",
  "GET /supervisor/runtime-evidence-review-report",
  "pnpm run check:runtime-review",
  "/controls#runtime-evidence-review-report",
  "Runtime evidence review is not execution-authority approval.",
]) {
  assertCondition(controlsSpec.includes(browserText), `Controls e2e must assert ${browserText}`, failures);
}

for (const testText of [
  '"runtime-evidence-review-report-v1"',
  '"/supervisor/runtime-evidence-review-report"',
  '"reviewQueue"',
  '"runtimeExportHref"',
  "docs/stories/3-55-runtime-evidence-review-index.md",
]) {
  assertCondition(supervisorTests.includes(testText), `Supervisor tests must assert ${testText}`, failures);
}

assertCondition(
  reportCatalogCheck.includes("runtime-evidence-review-report-v1"),
  "Supervisor report catalog drift check must require runtime evidence review report",
  failures,
);
assertCondition(
  runtimeExportCheck.includes("docs/stories/3-55-runtime-evidence-review-index.md"),
  "Runtime evidence export drift check must require Story 3.55 git-backed evidence",
  failures,
);
assertCondition(
  runbookCheck.includes("pnpm run check:runtime-review"),
  "Runbook drift check must require check:runtime-review in operator runbooks",
  failures,
);
assertCondition(
  docsCheck.includes("Runtime evidence review report") && docsCheck.includes("Runtime evidence review drift check"),
  "Documentation index drift check must require current gap review runtime evidence review evidence",
  failures,
);

const storyPath = "docs/stories/3-55-runtime-evidence-review-index.md";
assertCondition(existsSync(join(rootDir, storyPath)), `Missing runtime evidence review story ${storyPath}`, failures);
assertCondition(
  storyIndex.includes("3-55-runtime-evidence-review-index.md"),
  "Story index must reference Story 3.55 runtime evidence review index",
  failures,
);
assertCondition(
  currentGap.includes("Runtime evidence review report") && currentGap.includes("work-item runtime evidence review queue"),
  "Current gap review must track the runtime evidence review report and work-item runtime evidence review queue",
  failures,
);
assertCondition(
  reconciliation.includes("Runtime evidence review report") && reconciliation.includes("work-item runtime evidence review queue"),
  "Implementation reconciliation must track the runtime evidence review report and work-item runtime evidence review queue",
  failures,
);

if (failures.length > 0) {
  console.error("Runtime evidence review report drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: runtime evidence review report drift checks passed.");
