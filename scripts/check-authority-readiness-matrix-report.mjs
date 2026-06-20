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
const matrixPanel = readWorkspaceFile("apps/dashboard/src/components/authority-readiness-matrix-report-panel.tsx");
const reportShortcuts = readWorkspaceFile("apps/dashboard/src/lib/report-shortcuts.ts");
const controlsSpec = readWorkspaceFile("tests/e2e/dashboard.spec.ts");
const supervisorTests = readWorkspaceFile("services/supervisor/tests/integration/test_routing_preview.py");
const runtimeExportCheck = readWorkspaceFile("scripts/check-runtime-evidence-export.mjs");
const reportCatalogCheck = readWorkspaceFile("scripts/check-supervisor-report-catalog.mjs");
const verificationCheck = readWorkspaceFile("scripts/check-verification-readiness-report.mjs");
const storyIndex = readWorkspaceFile("docs/workflows/implementation-evidence-boundary.md");
const reconciliation = readWorkspaceFile("docs/architecture/kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md");

const failures = [];

assertCondition(
  packageJson.scripts?.["check:authority-readiness"] === "node ./scripts/check-authority-readiness-matrix-report.mjs",
  "package.json must define check:authority-readiness as node ./scripts/check-authority-readiness-matrix-report.mjs",
  failures,
);
assertCondition(
  packageJson.scripts?.check?.includes("pnpm run check:authority-readiness"),
  "pnpm run check must include pnpm run check:authority-readiness",
  failures,
);

for (const typeName of ["AuthorityReadinessFamilyView", "AuthorityReadinessMatrixReportView"]) {
  assertCondition(contractSource.includes(typeName), `Shared contracts must include ${typeName}`, failures);
  assertCondition(schemaSource.includes(`class ${typeName}`), `Supervisor schemas must include ${typeName}`, failures);
}

for (const typeName of ["CurrentStateReconciliationFindingView", "NextLaneDecisionPacketView"]) {
  assertCondition(contractSource.includes(typeName), `Shared contracts must include ${typeName}`, failures);
  assertCondition(schemaSource.includes(`class ${typeName}`), `Supervisor schemas must include ${typeName}`, failures);
}

assertCondition(
  apiSource.includes('"/supervisor/authority-readiness-matrix-report"'),
  "FastAPI routes must expose /supervisor/authority-readiness-matrix-report",
  failures,
);

for (const serviceText of [
  "get_authority_readiness_matrix_report",
  "authority-readiness-matrix-report-v1",
  "currentStateFindings",
  "nextLaneDecisionPacket",
  "planning-reconciliation-current",
  "pr-103-review-gated",
  "ci_green_external_review_blocked",
  "Local story completion is recorded",
  "not directly into main",
  "Merged-to-main state remains false",
  "decision_only_no_authority_granted",
  "epic-11-next-lane-authority-decision-contract",
  "docs/workflows/execution-authority-boundary.md#next-lane-authority-decision-contract",
  "current-state reconciliation",
  "next-lane decision packet",
  "local-provider-execution",
  "subscription-agent-launch",
  "premium-execution",
  "adaptive-scoring",
  "worker-command-source-network-credentials",
  "remote-delivery-automation",
  "github-delivery",
  "cleanup-automation",
  "evidence_ready_approval_required",
  "rollbackPath",
  "PR #103",
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
  "Authority readiness matrix entries are not execution-authority approvals.",
  "docs/workflows/implementation-evidence-boundary.md",
]) {
  assertCondition(serviceSource.includes(serviceText), `Authority readiness matrix service must include ${serviceText}`, failures);
}

assertCondition(
  dashboardClient.includes("getAuthorityReadinessMatrixReport"),
  "Dashboard API client must fetch the authority readiness matrix report",
  failures,
);
assertCondition(
  controlsPage.includes("<AuthorityReadinessMatrixReportPanel report={authorityReadinessMatrixReport} />"),
  "Controls page must render AuthorityReadinessMatrixReportPanel",
  failures,
);
assertCondition(
  reportShortcuts.includes('"GET /supervisor/authority-readiness-matrix-report": "#authority-readiness-matrix-report"'),
  "Report shortcut helper must map authority readiness matrix endpoint to #authority-readiness-matrix-report",
  failures,
);

for (const panelText of [
  "AuthorityListSection",
  "AuthorityReadinessMatrixReportView",
  "Current-state reconciliation",
  "Next-lane authority packet",
  "report.currentStateFindings",
  "report.nextLaneDecisionPacket",
  "FALLBACK_NEXT_LANE_DECISION_PACKET",
  "Execution blocked",
  "Authority families",
  "Readiness ladder",
  "isApprovalRequired",
  "data-status-kind",
  "family.requiredApprovals",
  "family.requiredEvidence",
  "family.blockedStories",
  "family.relatedReports",
  "family.relatedDocs",
  "family.dashboardAnchors",
  "family.rollbackPath",
  "Rollback path:",
  "Missing required",
  "stopLines",
  "nextSafeActions",
]) {
  assertCondition(matrixPanel.includes(panelText), `Authority readiness matrix panel must render ${panelText}`, failures);
}

for (const browserText of [
  "Authority readiness",
  "Execution authority matrix",
  "Current-state reconciliation",
  "Next-lane authority packet",
  "decision_only_no_authority_granted",
  "ci_green_external_review_blocked",
  "Local story completion is recorded",
  "not directly into main",
  "Merged-to-main state remains false",
  "Execution blocked",
  "docs/workflows/execution-authority-boundary.md#next-lane-authority-decision-contract",
  "local-provider-execution",
  "subscription-agent-launch",
  "adaptive-scoring",
  "worker-command-source-network-credentials",
  "remote-delivery-automation",
  "github-delivery",
  "cleanup-automation",
  "data-status-kind",
  "evidence_ready_approval_required",
  "Rollback path:",
  "Authority readiness matrix entries are not execution-authority approvals.",
]) {
  assertCondition(controlsSpec.includes(browserText), `Controls e2e must assert ${browserText}`, failures);
}

for (const testText of [
  '"authority-readiness-matrix-report-v1"',
  '"/supervisor/authority-readiness-matrix-report"',
  '"currentStateFindings"',
  '"nextLaneDecisionPacket"',
  '"planning-reconciliation-current"',
  '"pr-103-review-gated"',
  '"decision_only_no_authority_granted"',
  '"Local story completion is recorded"',
  '"Merged-to-main state remains false"',
  '"local-provider-execution"',
  '"subscription-agent-launch"',
  '"adaptive-scoring"',
  '"remote-delivery-automation"',
  '"github-delivery"',
  '"cleanup-automation"',
  '"rollbackPath"',
  '["rollbackPath"].strip()',
  '["requiredEvidence"]',
  '"evidence_ready_approval_required"',
  "docs/workflows/implementation-evidence-boundary.md",
]) {
  assertCondition(supervisorTests.includes(testText), `Supervisor tests must assert ${testText}`, failures);
}

for (const schemaText of ["field_validator", "Field(min_length=1)", "rollback_path_must_not_be_blank"]) {
  assertCondition(schemaSource.includes(schemaText), `Supervisor schema must validate rollbackPath with ${schemaText}`, failures);
}

assertCondition(
  reportCatalogCheck.includes("authority-readiness-matrix-report-v1"),
  "Supervisor report catalog drift check must require authority readiness matrix report",
  failures,
);
assertCondition(
  runtimeExportCheck.includes("docs/workflows/implementation-evidence-boundary.md"),
  "Runtime evidence export drift check must require Story 3.53 git-backed evidence",
  failures,
);
assertCondition(
  verificationCheck.includes("check-authority-readiness"),
  "Verification readiness drift check must require check-authority-readiness",
  failures,
);
assertCondition(
  serviceSource.includes("GET /supervisor/authority-readiness-matrix-report"),
  "Runtime evidence export service must reference the authority readiness matrix report",
  failures,
);

const storyPath = "docs/workflows/implementation-evidence-boundary.md";
assertCondition(existsSync(join(rootDir, storyPath)), `Missing authority readiness matrix story ${storyPath}`, failures);
const refreshedStoryPath = "docs/workflows/implementation-evidence-boundary.md";
assertCondition(existsSync(join(rootDir, refreshedStoryPath)), `Missing refreshed authority readiness story ${refreshedStoryPath}`, failures);
assertCondition(
  storyIndex.includes("3-53-authority-readiness-matrix-report.md"),
  "Story index must reference Story 3.53 authority readiness matrix report",
  failures,
);
assertCondition(
  storyIndex.includes("11-2-refresh-authority-readiness-matrix-from-current-evidence.md"),
  "Story index must reference Story 11.2 refreshed authority readiness matrix",
  failures,
);
assertCondition(
  reconciliation.includes("GitHub delivery") && reconciliation.includes("cleanup"),
  "Implementation reconciliation must mention current delivery and cleanup evidence for authority readiness context",
  failures,
);
assertCondition(
  reconciliation.includes("Authority readiness matrix report"),
  "Implementation reconciliation must track the authority readiness matrix report",
  failures,
);

if (failures.length > 0) {
  console.error("Authority readiness matrix report drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: authority readiness matrix report drift checks passed.");
