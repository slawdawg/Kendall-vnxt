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
const documentationPanel = readWorkspaceFile("apps/dashboard/src/components/documentation-authority-report-panel.tsx");
const controlsSpec = readWorkspaceFile("tests/e2e/dashboard.spec.ts");
const supervisorTests = readWorkspaceFile("services/supervisor/tests/integration/test_routing_preview.py");
const storyIndex = readWorkspaceFile("docs/workflows/implementation-evidence-boundary.md");
const reconciliation = readWorkspaceFile("docs/architecture/kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md");

const failures = [];

assertCondition(
  packageJson.scripts?.["check:documentation-authority"] === "node ./scripts/check-documentation-authority-report.mjs",
  "package.json must define check:documentation-authority as node ./scripts/check-documentation-authority-report.mjs",
  failures,
);
assertCondition(
  packageJson.scripts?.check?.includes("pnpm run check:documentation-authority"),
  "pnpm run check must include pnpm run check:documentation-authority",
  failures,
);

for (const typeName of [
  "DocumentationAuthorityDocumentView",
  "DocumentationAuthorityBlockedStoryView",
  "DocumentationAuthorityReportView",
]) {
  assertCondition(contractSource.includes(typeName), `Shared contracts must include ${typeName}`, failures);
  assertCondition(schemaSource.includes(`class ${typeName}`), `Supervisor schemas must include ${typeName}`, failures);
}

assertCondition(
  apiSource.includes('"/supervisor/documentation-authority-report"'),
  "FastAPI routes must expose /supervisor/documentation-authority-report",
  failures,
);

for (const serviceText of [
  "get_documentation_authority_report",
  "documentation-authority-report-v1",
  "docs/architecture/index.md",
  "docs/workflows/product-requirements-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
  "blocked_pending_explicit_approval",
  "docs/workflows/implementation-evidence-boundary.md",
]) {
  assertCondition(serviceSource.includes(serviceText), `Documentation authority service must include ${serviceText}`, failures);
}

assertCondition(dashboardClient.includes("getDocumentationAuthorityReport"), "Dashboard API client must fetch documentation authority report", failures);
assertCondition(
  controlsPage.includes("<DocumentationAuthorityReportPanel report={documentationAuthorityReport} />"),
  "Controls page must render DocumentationAuthorityReportPanel",
  failures,
);

for (const panelText of ["DocumentationAuthorityReportView", "Current indexes", "Blocked authority stories", "Drift checks"]) {
  assertCondition(documentationPanel.includes(panelText), `Documentation authority panel must render ${panelText}`, failures);
}

for (const browserText of [
  "Documentation authority",
  "Indexes and approval stop lines",
  "Blocked authority stories",
  "Documentation drift command",
  "pnpm run check:documentation-authority",
]) {
  assertCondition(controlsSpec.includes(browserText), `Controls e2e must assert ${browserText}`, failures);
}

for (const testText of [
  '"documentation-authority-report-v1"',
  '"/supervisor/documentation-authority-report"',
  '"docs/architecture/index.md"',
  '"docs/workflows/product-requirements-boundary.md"',
  '"docs/workflows/implementation-evidence-boundary.md"',
  "docs/workflows/implementation-evidence-boundary.md",
]) {
  assertCondition(supervisorTests.includes(testText), `Supervisor tests must assert ${testText}`, failures);
}

const storyPath = "docs/workflows/implementation-evidence-boundary.md";
assertCondition(existsSync(join(rootDir, storyPath)), `Missing core readiness drift story ${storyPath}`, failures);
assertCondition(
  storyIndex.includes("3-47-core-readiness-drift-checks.md"),
  "Story index must reference Story 3.47 core readiness drift checks",
  failures,
);
for (const label of [
  "4-4-ollama-limited-provider-adapter-behind-disabled-defaults.md",
  "5-5-subscription-launch-supervised-process-behind-approval.md",
  "6-1-orchestrator-spike-backlog-and-acceptance-scenarios.md",
]) {
  assertCondition(
    storyIndex.includes(label),
    `Implementation evidence boundary must preserve blocked evidence label ${label}`,
    failures,
  );
}
assertCondition(
  reconciliation.includes("Documentation authority drift check"),
  "Implementation reconciliation must track the documentation authority drift check",
  failures,
);
assertCondition(
  serviceSource.includes("pnpm run check:documentation-authority"),
  "Verification readiness report must surface pnpm run check:documentation-authority",
  failures,
);

if (failures.length > 0) {
  console.error("Documentation authority report drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: documentation authority report drift checks passed.");
