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
const dashboardSpec = readWorkspaceFile("tests/e2e/dashboard.spec.ts");
const routingPreviewTests = readWorkspaceFile("services/supervisor/tests/integration/test_routing_preview.py");
const storyIndex = readWorkspaceFile("docs/stories/index.md");

const reports = [
  {
    reportId: "execution-configuration-checks",
    endpoint: "GET /supervisor/execution-configuration-checks",
    apiPath: "/supervisor/execution-configuration-checks",
    story: "docs/stories/2-6-disabled-execution-configuration-checks.md",
  },
  {
    reportId: "execution-readiness-report-v1",
    endpoint: "GET /supervisor/execution-readiness-report",
    apiPath: "/supervisor/execution-readiness-report",
    story: "docs/stories/3-7-execution-readiness-and-evidence-report.md",
    dashboardFetch: "getExecutionReadinessReport",
  },
  {
    reportId: "documentation-authority-report-v1",
    endpoint: "GET /supervisor/documentation-authority-report",
    apiPath: "/supervisor/documentation-authority-report",
    story: "docs/stories/3-15-documentation-authority-report.md",
    dashboardFetch: "getDocumentationAuthorityReport",
  },
  {
    reportId: "verification-readiness-report-v1",
    endpoint: "GET /supervisor/verification-readiness-report",
    apiPath: "/supervisor/verification-readiness-report",
    story: "docs/stories/3-16-verification-readiness-report.md",
    dashboardFetch: "getVerificationReadinessReport",
  },
  {
    reportId: "dashboard-e2e-report-v1",
    endpoint: "GET /supervisor/dashboard-e2e-report",
    apiPath: "/supervisor/dashboard-e2e-report",
    story: "docs/stories/3-22-dashboard-e2e-report.md",
    dashboardFetch: "getDashboardE2EReport",
  },
  {
    reportId: "maintenance-readiness-report-v1",
    endpoint: "GET /supervisor/maintenance-readiness-report",
    apiPath: "/supervisor/maintenance-readiness-report",
    story: "docs/stories/3-19-maintenance-readiness-report.md",
    dashboardFetch: "getMaintenanceReadinessReport",
  },
  {
    reportId: "safe-development-backlog-report-v1",
    endpoint: "GET /supervisor/safe-development-backlog",
    apiPath: "/supervisor/safe-development-backlog",
    story: "docs/stories/3-27-safe-development-backlog-report.md",
    dashboardFetch: "getSafeDevelopmentBacklogReport",
  },
  {
    reportId: "disabled-provider-proofs",
    endpoint: "GET /supervisor/disabled-provider-proofs",
    apiPath: "/supervisor/disabled-provider-proofs",
    story: "docs/stories/3-8-queue-attempt-boundary-and-provider-proofs.md",
  },
  {
    reportId: "queue-lease-execution-attempt-boundary-v1",
    endpoint: "GET /supervisor/execution-state-boundary",
    apiPath: "/supervisor/execution-state-boundary",
    story: "docs/stories/3-8-queue-attempt-boundary-and-provider-proofs.md",
  },
  {
    reportId: "supervisor-worker-threat-boundary-v1",
    endpoint: "GET /supervisor/threat-boundary",
    apiPath: "/supervisor/threat-boundary",
    story: "docs/stories/2-8-threat-boundary-for-commands-prompts-providers-and-secrets.md",
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
  "GET /supervisor/verification-readiness-report",
  "GET /supervisor/dashboard-e2e-report",
  "GET /supervisor/safe-development-backlog",
]) {
  assertCondition(
    dashboardSpec.includes(visibleEndpoint),
    `Dashboard browser coverage must assert visible report endpoint ${visibleEndpoint}`,
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

if (failures.length > 0) {
  console.error("Supervisor report catalog drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: supervisor report catalog drift checks passed.");
