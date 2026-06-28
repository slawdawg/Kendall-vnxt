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
const serviceSource = readWorkspaceFile("services/supervisor/src/supervisor/application/service.py");
const apiSource = readWorkspaceFile("services/supervisor/src/supervisor/api/main.py");
const dashboardClient = readWorkspaceFile("apps/dashboard/src/lib/supervisor.ts");
const controlsPage = readWorkspaceFile("apps/dashboard/src/app/controls/page.tsx");
const overviewPanel = readWorkspaceFile("apps/dashboard/src/components/evidence-overview-panel.tsx");
const exportPanel = readWorkspaceFile("apps/dashboard/src/components/runtime-evidence-export-panel.tsx");
const reportShortcuts = readWorkspaceFile("apps/dashboard/src/lib/report-shortcuts.ts");
const dashboardSpec = readWorkspaceFile("tests/e2e/dashboard.spec.ts");
const routingPreviewTests = readWorkspaceFile("services/supervisor/tests/integration/test_routing_preview.py");
const storyIndex = readWorkspaceFile("docs/workflows/implementation-evidence-boundary.md");

const reports = [
  {
    reportId: "execution-configuration-checks",
    endpoint: "GET /supervisor/execution-configuration-checks",
    apiPath: "/supervisor/execution-configuration-checks",
    story: "docs/workflows/implementation-evidence-boundary.md",
  },
  {
    reportId: "execution-readiness-report-v1",
    endpoint: "GET /supervisor/execution-readiness-report",
    apiPath: "/supervisor/execution-readiness-report",
    story: "docs/workflows/implementation-evidence-boundary.md",
    dashboardFetch: "getExecutionReadinessReport",
  },
  {
    reportId: "documentation-authority-report-v1",
    endpoint: "GET /supervisor/documentation-authority-report",
    apiPath: "/supervisor/documentation-authority-report",
    story: "docs/workflows/implementation-evidence-boundary.md",
    dashboardFetch: "getDocumentationAuthorityReport",
  },
  {
    reportId: "legacy-planning-artifact-inventory-report-v1",
    endpoint: "GET /supervisor/legacy-planning-artifact-inventory",
    apiPath: "/supervisor/legacy-planning-artifact-inventory",
    story: "docs/workflows/implementation-evidence-boundary.md",
    dashboardFetch: "getLegacyPlanningArtifactInventoryReport",
  },
  {
    reportId: "verification-readiness-report-v1",
    endpoint: "GET /supervisor/verification-readiness-report",
    apiPath: "/supervisor/verification-readiness-report",
    story: "docs/workflows/implementation-evidence-boundary.md",
    dashboardFetch: "getVerificationReadinessReport",
  },
  {
    reportId: "authority-readiness-matrix-report-v1",
    endpoint: "GET /supervisor/authority-readiness-matrix-report",
    apiPath: "/supervisor/authority-readiness-matrix-report",
    story: "docs/workflows/implementation-evidence-boundary.md",
    dashboardFetch: "getAuthorityReadinessMatrixReport",
  },
  {
    reportId: "dashboard-e2e-report-v1",
    endpoint: "GET /supervisor/dashboard-e2e-report",
    apiPath: "/supervisor/dashboard-e2e-report",
    story: "docs/workflows/implementation-evidence-boundary.md",
    dashboardFetch: "getDashboardE2EReport",
  },
  {
    reportId: "maintenance-readiness-report-v1",
    endpoint: "GET /supervisor/maintenance-readiness-report",
    apiPath: "/supervisor/maintenance-readiness-report",
    story: "docs/workflows/implementation-evidence-boundary.md",
    dashboardFetch: "getMaintenanceReadinessReport",
  },
  {
    reportId: "maintenance-action-plan-report-v1",
    endpoint: "GET /supervisor/maintenance-action-plan-report",
    apiPath: "/supervisor/maintenance-action-plan-report",
    story: "docs/workflows/implementation-evidence-boundary.md",
    dashboardFetch: "getMaintenanceActionPlanReport",
  },
  {
    reportId: "safe-development-backlog-report-v1",
    endpoint: "GET /supervisor/safe-development-backlog",
    apiPath: "/supervisor/safe-development-backlog",
    story: "docs/workflows/implementation-evidence-boundary.md",
    dashboardFetch: "getSafeDevelopmentBacklogReport",
  },
  {
    reportId: "development-runway-report-v1",
    endpoint: "GET /supervisor/development-runway-report",
    apiPath: "/supervisor/development-runway-report",
    story: "docs/workflows/implementation-evidence-boundary.md",
    dashboardFetch: "getDevelopmentRunwayReport",
  },
  {
    reportId: "runtime-evidence-review-report-v1",
    endpoint: "GET /supervisor/runtime-evidence-review-report",
    apiPath: "/supervisor/runtime-evidence-review-report",
    story: "docs/workflows/implementation-evidence-boundary.md",
    dashboardFetch: "getRuntimeEvidenceReviewReport",
  },
  {
    reportId: "managed-recipe-policy-report-v1",
    endpoint: "GET /supervisor/managed-recipe-policy-report",
    apiPath: "/supervisor/managed-recipe-policy-report",
    story: "docs/workflows/implementation-evidence-boundary.md",
    dashboardFetch: "getManagedRecipePolicyReport",
  },
  {
    reportId: "github-workflow-policy-report-v1",
    endpoint: "GET /supervisor/github-workflow-policy-report",
    apiPath: "/supervisor/github-workflow-policy-report",
    story: "docs/workflows/implementation-evidence-boundary.md",
    dashboardFetch: "getGitHubWorkflowPolicyReport",
  },
  {
    reportId: "github-delivery-authority-report-v1",
    endpoint: "GET /supervisor/github-delivery-authority-report",
    apiPath: "/supervisor/github-delivery-authority-report",
    story: "docs/workflows/implementation-evidence-boundary.md",
    dashboardFetch: "getGitHubDeliveryAuthorityReport",
  },
  {
    reportId: "trusted-delivery-eligibility-report-v1",
    endpoint: "GET /supervisor/trusted-delivery-eligibility-report",
    apiPath: "/supervisor/trusted-delivery-eligibility-report",
    story: "docs/workflows/implementation-evidence-boundary.md",
    dashboardFetch: "getTrustedDeliveryEligibilityReport",
  },
  {
    reportId: "git-hygiene-report-v1",
    endpoint: "GET /supervisor/git-hygiene-report",
    apiPath: "/supervisor/git-hygiene-report",
    story: "docs/workflows/implementation-evidence-boundary.md",
    dashboardFetch: "getGitHygieneReport",
  },
  {
    reportId: "local-cleanup-readiness-report-v1",
    endpoint: "GET /supervisor/local-cleanup-readiness-report",
    apiPath: "/supervisor/local-cleanup-readiness-report",
    story: "docs/workflows/implementation-evidence-boundary.md",
    dashboardFetch: "getLocalCleanupReadinessReport",
  },
  {
    reportId: "remote-cleanup-sync-readiness-report-v1",
    endpoint: "GET /supervisor/remote-cleanup-sync-readiness-report",
    apiPath: "/supervisor/remote-cleanup-sync-readiness-report",
    story: "docs/workflows/implementation-evidence-boundary.md",
    dashboardFetch: "getRemoteCleanupSyncReadinessReport",
  },
  {
    reportId: "trusted-autonomy-readiness-report-v1",
    endpoint: "GET /supervisor/trusted-autonomy-readiness-report",
    apiPath: "/supervisor/trusted-autonomy-readiness-report",
    story: "docs/workflows/implementation-evidence-boundary.md",
    dashboardFetch: "getTrustedAutonomyReadinessReport",
  },
  {
    reportId: "epic-6-mvp-proof-trial-report-v1",
    endpoint: "GET /supervisor/epic-6-mvp-proof-trial-report",
    apiPath: "/supervisor/epic-6-mvp-proof-trial-report",
    story: "docs/workflows/implementation-evidence-boundary.md",
    dashboardFetch: "getMvpProofTrialReport",
  },
  {
    reportId: "codex-readiness-report-v1",
    endpoint: "GET /supervisor/codex-readiness-report",
    apiPath: "/supervisor/codex-readiness-report",
    story: "docs/workflows/implementation-evidence-boundary.md",
    dashboardFetch: "getCodexReadinessReport",
  },
  {
    reportId: "codex-implementation-approval-report-v1",
    endpoint: "GET /supervisor/codex-implementation-approval-report",
    apiPath: "/supervisor/codex-implementation-approval-report",
    story: "docs/workflows/implementation-evidence-boundary.md",
    dashboardFetch: "getCodexImplementationApprovalReport",
  },
  {
    reportId: "claude-review-readiness-report-v1",
    endpoint: "GET /supervisor/claude-review-readiness-report",
    apiPath: "/supervisor/claude-review-readiness-report",
    story: "docs/workflows/implementation-evidence-boundary.md",
    dashboardFetch: "getClaudeReviewReadinessReport",
  },
  {
    reportId: "claude-review-approval-report-v1",
    endpoint: "GET /supervisor/claude-review-approval-report",
    apiPath: "/supervisor/claude-review-approval-report",
    story: "docs/workflows/implementation-evidence-boundary.md",
    dashboardFetch: "getClaudeReviewApprovalReport",
  },
  {
    reportId: "delivery-readiness-policy-report-v1",
    endpoint: "GET /supervisor/delivery-readiness-policy-report",
    apiPath: "/supervisor/delivery-readiness-policy-report",
    story: "docs/workflows/implementation-evidence-boundary.md",
    dashboardFetch: "getDeliveryReadinessPolicyReport",
  },
  {
    reportId: "disabled-provider-proofs",
    endpoint: "GET /supervisor/disabled-provider-proofs",
    apiPath: "/supervisor/disabled-provider-proofs",
    story: "docs/workflows/implementation-evidence-boundary.md",
  },
  {
    reportId: "queue-lease-execution-attempt-boundary-v1",
    endpoint: "GET /supervisor/execution-state-boundary",
    apiPath: "/supervisor/execution-state-boundary",
    story: "docs/workflows/implementation-evidence-boundary.md",
  },
  {
    reportId: "supervisor-worker-threat-boundary-v1",
    endpoint: "GET /supervisor/threat-boundary",
    apiPath: "/supervisor/threat-boundary",
    story: "docs/workflows/implementation-evidence-boundary.md",
  },
];

const failures = [];

assertCondition(
  packageJson.scripts?.["check:reports"] === "node ./scripts/check-supervisor-report-catalog.mjs",
  "package.json must define check:reports as node ./scripts/check-supervisor-report-catalog.mjs",
  failures,
);
assertCondition(
  packageJson.scripts?.check?.includes("pnpm run check:reports"),
  "pnpm run check must include pnpm run check:reports",
  failures,
);

for (const report of reports) {
  assertCondition(
    serviceSource.includes(`reportId="${report.reportId}"`),
    `Supervisor report catalog must include report id ${report.reportId}`,
    failures,
  );
  assertCondition(
    serviceSource.includes(`endpoint="${report.endpoint}"`),
    `Supervisor report catalog must include endpoint ${report.endpoint}`,
    failures,
  );
  assertCondition(apiSource.includes(`"${report.apiPath}"`), `FastAPI routes must expose ${report.apiPath}`, failures);
  assertCondition(
    serviceSource.includes(`"${report.endpoint}"`),
    `Runtime evidence or report references must include ${report.endpoint}`,
    failures,
  );
  assertCondition(
    routingPreviewTests.includes(`"${report.endpoint}"`),
    `Supervisor integration tests must assert ${report.endpoint}`,
    failures,
  );
  assertCondition(existsSync(join(rootDir, report.story)), `Missing story evidence file ${report.story}`, failures);
  if (report.dashboardFetch) {
    assertCondition(
      dashboardClient.includes(report.dashboardFetch),
      `Dashboard supervisor client must define ${report.dashboardFetch}`,
      failures,
    );
    assertCondition(
      controlsPage.includes(report.dashboardFetch),
      `Controls page must fetch ${report.dashboardFetch}`,
      failures,
    );
  }
}

for (const visibleEndpoint of [
  "GET /supervisor/execution-readiness-report",
  "GET /supervisor/legacy-planning-artifact-inventory",
  "GET /supervisor/verification-readiness-report",
  "GET /supervisor/authority-readiness-matrix-report",
  "GET /supervisor/dashboard-e2e-report",
  "GET /supervisor/maintenance-action-plan-report",
  "GET /supervisor/development-runway-report",
  "GET /supervisor/runtime-evidence-review-report",
  "GET /supervisor/safe-development-backlog",
  "GET /supervisor/managed-recipe-policy-report",
  "GET /supervisor/github-workflow-policy-report",
  "GET /supervisor/github-delivery-authority-report",
  "GET /supervisor/trusted-delivery-eligibility-report",
  "GET /supervisor/git-hygiene-report",
  "GET /supervisor/local-cleanup-readiness-report",
  "GET /supervisor/remote-cleanup-sync-readiness-report",
  "GET /supervisor/trusted-autonomy-readiness-report",
  "GET /supervisor/epic-6-mvp-proof-trial-report",
  "GET /supervisor/codex-readiness-report",
  "GET /supervisor/codex-implementation-approval-report",
  "GET /supervisor/claude-review-readiness-report",
  "GET /supervisor/claude-review-approval-report",
  "GET /supervisor/delivery-readiness-policy-report",
]) {
  assertCondition(
    dashboardSpec.includes(visibleEndpoint),
    `Dashboard browser coverage must assert visible report endpoint ${visibleEndpoint}`,
    failures,
  );
}

for (const overviewText of [
  "Report shortcuts",
  "runtimeEvidenceExport.boundary.relatedSupervisorReports",
  "Open catalog",
  "reportShortcutHref(report)",
]) {
  assertCondition(
    overviewPanel.includes(overviewText),
    `Evidence overview must surface report catalog shortcut evidence: ${overviewText}`,
    failures,
  );
}

for (const shortcutText of [
  "reportAnchorByEndpoint",
  "reportShortcutHref",
  "`/controls${reportAnchorByEndpoint[endpoint]",
  "#execution-readiness-report",
  "#authority-readiness-matrix-report",
  "#maintenance-action-plan-report",
  "#development-runway-report",
  "#runtime-evidence-review-report",
  "#supervisor-report-catalog",
]) {
  assertCondition(
    reportShortcuts.includes(shortcutText),
    `Report shortcut helper must include ${shortcutText}`,
    failures,
  );
}

assertCondition(
  exportPanel.includes("reportShortcutHref(report)"),
  "Runtime evidence export panel must link related reports through reportShortcutHref",
  failures,
);

for (const visibleOverviewText of ["Report shortcuts", "Open catalog", "/controls#execution-readiness-report"]) {
  assertCondition(
    dashboardSpec.includes(visibleOverviewText),
    `Dashboard detail browser coverage must assert overview report shortcut ${visibleOverviewText}`,
    failures,
  );
}

for (const controlsAnchor of [
  'id="execution-readiness-report"',
  'id="legacy-planning-artifact-inventory"',
  'id="verification-readiness-report"',
  'id="authority-readiness-matrix-report"',
  'id="supervisor-report-catalog"',
  'id="maintenance-action-plan-report"',
  'id="development-runway-report"',
  'id="runtime-evidence-review-report"',
  'id="managed-recipe-policy-report"',
  'id="github-workflow-policy-report"',
  'id="github-delivery-authority-report"',
  'id="trusted-delivery-eligibility-report"',
  'id="git-hygiene-report"',
  'id="local-cleanup-readiness-report"',
  'id="remote-cleanup-sync-readiness-report"',
  'id="trusted-autonomy-readiness-report"',
  'id="epic-6-mvp-proof-trial-report"',
  'id="codex-readiness-report"',
  'id="codex-implementation-approval-report"',
  'id="claude-review-readiness-report"',
  'id="claude-review-approval-report"',
  'id="delivery-readiness-policy-report"',
]) {
  assertCondition(
    controlsPage.includes(controlsAnchor),
    `Controls page must expose stable report anchor ${controlsAnchor}`,
    failures,
  );
}

assertCondition(
  serviceSource.includes("pnpm run check:reports"),
  "Verification readiness report must surface pnpm run check:reports",
  failures,
);
assertCondition(
  dashboardSpec.includes("pnpm run check:reports"),
  "Dashboard browser coverage must assert pnpm run check:reports",
  failures,
);
assertCondition(
  storyIndex.includes("3-28-supervisor-report-catalog-drift-check.md"),
  "Story index must reference Story 3.28 supervisor report catalog drift check",
  failures,
);
assertCondition(
  storyIndex.includes("3-34-report-shortcuts-in-evidence-overview.md"),
  "Story index must reference Story 3.34 report shortcuts in evidence overview",
  failures,
);
assertCondition(
  storyIndex.includes("3-39-report-shortcut-anchor-polish.md"),
  "Story index must reference Story 3.39 report shortcut anchor polish",
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
  storyIndex.includes("6-14-git-hygiene-read-only.md"),
  "Story index must reference Story 6.14 Git hygiene read-only",
  failures,
);
assertCondition(
  storyIndex.includes("6-16-codex-readiness-no-launch.md"),
  "Story index must reference Story 6.16 Codex readiness no-launch",
  failures,
);
assertCondition(
  storyIndex.includes("6-17-codex-implementation-approval-packet.md"),
  "Story index must reference Story 6.17 Codex implementation approval packet",
  failures,
);
assertCondition(
  storyIndex.includes("6-18-claude-readiness-no-launch.md"),
  "Story index must reference Story 6.18 Claude readiness no-launch",
  failures,
);
assertCondition(
  storyIndex.includes("6-19-claude-review-approval-packet.md"),
  "Story index must reference Story 6.19 Claude review approval packet",
  failures,
);
assertCondition(
  storyIndex.includes("6-20-github-delivery-authority-ladder.md"),
  "Story index must reference Story 6.20 GitHub delivery authority ladder",
  failures,
);
assertCondition(
  storyIndex.includes("6-26-trusted-delivery-eligibility-evaluator.md"),
  "Story index must reference Story 6.26 trusted delivery eligibility evaluator",
  failures,
);
assertCondition(
  storyIndex.includes("6-27-epic-6-mvp-proof-trial-packet.md"),
  "Story index must reference Story 6.27 Epic 6 MVP proof trial packet",
  failures,
);
assertCondition(
  storyIndex.includes("6-21-local-cleanup-readiness.md"),
  "Story index must reference Story 6.21 local cleanup readiness",
  failures,
);
assertCondition(
  storyIndex.includes("6-22-remote-cleanup-sync-readiness.md"),
  "Story index must reference Story 6.22 remote cleanup sync readiness",
  failures,
);
assertCondition(
  storyIndex.includes("6-23-trusted-autonomy-readiness.md"),
  "Story index must reference Story 6.23 trusted autonomy readiness",
  failures,
);
assertCondition(
  storyIndex.includes("3-44-delivery-readiness-policy-report.md"),
  "Story index must reference Story 3.44 delivery readiness policy report",
  failures,
);
assertCondition(
  storyIndex.includes("3-52-maintenance-action-plan-report.md"),
  "Story index must reference Story 3.52 maintenance action plan report",
  failures,
);
assertCondition(
  storyIndex.includes("3-53-authority-readiness-matrix-report.md"),
  "Story index must reference Story 3.53 authority readiness matrix report",
  failures,
);
assertCondition(
  storyIndex.includes("3-54-development-runway-safe-slices.md"),
  "Story index must reference Story 3.54 development runway safe slices",
  failures,
);
assertCondition(
  storyIndex.includes("3-55-runtime-evidence-review-index.md"),
  "Story index must reference Story 3.55 runtime evidence review index",
  failures,
);

if (failures.length > 0) {
  console.error("Supervisor report catalog drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: supervisor report catalog drift checks passed.");
