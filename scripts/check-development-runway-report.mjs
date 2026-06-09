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
const runwayPanel = readWorkspaceFile("apps/dashboard/src/components/development-runway-report-panel.tsx");
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
const handoff = readWorkspaceFile("docs/handoffs/current.md");

const failures = [];

assertCondition(
  packageJson.scripts?.["check:development-runway"] === "node ./scripts/check-development-runway-report.mjs",
  "package.json must define check:development-runway as node ./scripts/check-development-runway-report.mjs",
  failures,
);
assertCondition(
  packageJson.scripts?.check?.includes("pnpm run check:development-runway"),
  "pnpm run check must include pnpm run check:development-runway",
  failures,
);

for (const typeName of ["DevelopmentRunwayReadinessCheckView", "DevelopmentRunwaySliceView", "DevelopmentRunwayReportView"]) {
  assertCondition(contractSource.includes(typeName), `Shared contracts must include ${typeName}`, failures);
  assertCondition(schemaSource.includes(`class ${typeName}`), `Supervisor schemas must include ${typeName}`, failures);
}

assertCondition(
  apiSource.includes('"/supervisor/development-runway-report"'),
  "FastAPI routes must expose /supervisor/development-runway-report",
  failures,
);

for (const serviceText of [
  "get_development_runway_report",
  "development-runway-report-v1",
  "report-evidence-navigation-slice",
  "verification-runbook-hardening-slice",
  "authority-blocker-maintenance-slice",
  "readinessChecks",
  "batchingPolicy",
  "prBatchingChecklist",
  "relatedDocs",
  "dashboardAnchors",
  "ready-backlog-item",
  "handoff-checkpoint-coverage",
  "authority-families-blocked",
  "Prefer one coherent PR per related API, dashboard, docs, tests, drift-check, and runbook slice",
  "larger reviewable PRs",
  "Do not open separate PRs for isolated report text",
  "PR body names the safe slice",
  "Development runway slices are not execution-authority approvals.",
  "GET /supervisor/development-runway-report",
  "docs/stories/3-54-development-runway-safe-slices.md",
  "docs/stories/3-63-development-runway-pr-batching-policy.md",
  "docs/stories/3-64-development-runway-evidence-links.md",
]) {
  assertCondition(serviceSource.includes(serviceText), `Development runway service must include ${serviceText}`, failures);
}

assertCondition(
  dashboardClient.includes("getDevelopmentRunwayReport"),
  "Dashboard API client must fetch the development runway report",
  failures,
);
assertCondition(
  controlsPage.includes("<DevelopmentRunwayReportPanel report={developmentRunwayReport} />"),
  "Controls page must render DevelopmentRunwayReportPanel",
  failures,
);
assertCondition(
  reportShortcuts.includes('"GET /supervisor/development-runway-report": "#development-runway-report"'),
  "Report shortcut helper must map development runway endpoint to #development-runway-report",
  failures,
);

for (const panelText of [
  "DevelopmentRunwayReportView",
  "Larger PR slice planner",
  "Runway slices",
  "PR scope rule",
  "slice.requiredVerification",
  "slice.relatedReports",
  "slice.relatedDocs",
  "slice.dashboardAnchors",
  "slice.readinessChecks",
  "check.relatedReports",
  "check.relatedDocs",
  "check.dashboardAnchors",
  "reportShortcutHref",
  "Related reports",
  "Related docs",
  "report.verificationChain",
  "report.batchingPolicy",
  "report.prBatchingChecklist",
  "Batching policy",
  "PR batching checklist",
  "report.stopLines",
]) {
  assertCondition(runwayPanel.includes(panelText), `Development runway panel must render ${panelText}`, failures);
}

for (const browserText of [
  "Development runway",
  "Larger PR slice planner",
  "report-evidence-navigation-slice",
  "verification-runbook-hardening-slice",
  "authority-blocker-maintenance-slice",
  "Readiness checks",
  "ready-backlog-item",
  "handoff-checkpoint-coverage",
  "authority-families-blocked",
  "pnpm run check:development-runway",
  "Batching policy",
  "PR batching checklist",
  "larger reviewable PRs",
  "Do not open separate PRs for isolated report text",
  "PR body names the safe slice",
  "Related reports",
  "GET /supervisor/report-catalog",
  "Related docs",
  "docs/stories/3-64-development-runway-evidence-links.md",
  "/controls#supervisor-report-catalog",
  "/controls#development-runway-report",
  "Development runway slices are not execution-authority approvals.",
]) {
  assertCondition(controlsSpec.includes(browserText), `Controls e2e must assert ${browserText}`, failures);
}

for (const testText of [
  '"development-runway-report-v1"',
  '"/supervisor/development-runway-report"',
  '"report-evidence-navigation-slice"',
  '"verification-runbook-hardening-slice"',
  '"authority-blocker-maintenance-slice"',
  '"readinessChecks"',
  '"batchingPolicy"',
  '"prBatchingChecklist"',
  '"relatedDocs"',
  '"dashboardAnchors"',
  '"ready-backlog-item"',
  '"handoff-checkpoint-coverage"',
  '"authority-families-blocked"',
  "docs/stories/3-54-development-runway-safe-slices.md",
  "docs/stories/3-63-development-runway-pr-batching-policy.md",
  "docs/stories/3-64-development-runway-evidence-links.md",
]) {
  assertCondition(supervisorTests.includes(testText), `Supervisor tests must assert ${testText}`, failures);
}

assertCondition(
  reportCatalogCheck.includes("development-runway-report-v1"),
  "Supervisor report catalog drift check must require development runway report",
  failures,
);
assertCondition(
  runtimeExportCheck.includes("docs/stories/3-54-development-runway-safe-slices.md"),
  "Runtime evidence export drift check must require Story 3.54 git-backed evidence",
  failures,
);
assertCondition(
  runbookCheck.includes("pnpm run check:development-runway"),
  "Runbook drift check must require check:development-runway in operator runbooks",
  failures,
);
assertCondition(
  docsCheck.includes("Development runway report") && docsCheck.includes("Development runway drift check"),
  "Documentation index drift check must require current gap review development runway evidence",
  failures,
);

const storyPath = "docs/stories/3-54-development-runway-safe-slices.md";
assertCondition(existsSync(join(rootDir, storyPath)), `Missing development runway story ${storyPath}`, failures);
const readinessStoryPath = "docs/stories/3-59-development-runway-readiness-checks.md";
assertCondition(existsSync(join(rootDir, readinessStoryPath)), `Missing development runway readiness story ${readinessStoryPath}`, failures);
const batchingStoryPath = "docs/stories/3-63-development-runway-pr-batching-policy.md";
assertCondition(existsSync(join(rootDir, batchingStoryPath)), `Missing development runway PR batching story ${batchingStoryPath}`, failures);
const linksStoryPath = "docs/stories/3-64-development-runway-evidence-links.md";
assertCondition(existsSync(join(rootDir, linksStoryPath)), `Missing development runway evidence links story ${linksStoryPath}`, failures);
assertCondition(
  storyIndex.includes("3-54-development-runway-safe-slices.md"),
  "Story index must reference Story 3.54 development runway safe slices",
  failures,
);
assertCondition(
  storyIndex.includes("3-59-development-runway-readiness-checks.md"),
  "Story index must reference Story 3.59 development runway readiness checks",
  failures,
);
assertCondition(
  storyIndex.includes("3-63-development-runway-pr-batching-policy.md"),
  "Story index must reference Story 3.63 development runway PR batching policy",
  failures,
);
assertCondition(
  storyIndex.includes("3-64-development-runway-evidence-links.md"),
  "Story index must reference Story 3.64 development runway evidence links",
  failures,
);
assertCondition(
  currentGap.includes("Development runway report") &&
    currentGap.includes("larger PR-sized safe slices") &&
    currentGap.includes("Development runway readiness checks") &&
    currentGap.includes("Development runway PR batching policy") &&
    currentGap.includes("Development runway evidence links"),
  "Current gap review must track the development runway report, larger PR-sized safe slices, readiness checks, PR batching policy, and evidence links",
  failures,
);
assertCondition(
  reconciliation.includes("Development runway report") &&
    reconciliation.includes("larger PR-sized safe slices") &&
    reconciliation.includes("Development runway readiness checks") &&
    reconciliation.includes("Development runway PR batching policy") &&
    reconciliation.includes("Development runway evidence links"),
  "Implementation reconciliation must track the development runway report, larger PR-sized safe slices, readiness checks, PR batching policy, and evidence links",
  failures,
);
assertCondition(
  handoff.includes("pnpm run check:development-runway"),
  "Current handoff must mention check:development-runway in the active verification chain",
  failures,
);

if (failures.length > 0) {
  console.error("Development runway report drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: development runway report drift checks passed.");
