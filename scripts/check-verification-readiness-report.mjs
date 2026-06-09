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
const verificationPanel = readWorkspaceFile("apps/dashboard/src/components/verification-readiness-report-panel.tsx");
const controlsSpec = readWorkspaceFile("tests/e2e/dashboard.spec.ts");
const supervisorTests = readWorkspaceFile("services/supervisor/tests/integration/test_routing_preview.py");
const storyIndex = readWorkspaceFile("docs/stories/index.md");
const reconciliation = readWorkspaceFile("docs/architecture/kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md");

const failures = [];

assertCondition(
  packageJson.scripts?.["check:verification-readiness"] === "node ./scripts/check-verification-readiness-report.mjs",
  "package.json must define check:verification-readiness as node ./scripts/check-verification-readiness-report.mjs",
  failures,
);
assertCondition(
  packageJson.scripts?.check?.includes("pnpm run check:verification-readiness"),
  "pnpm run check must include pnpm run check:verification-readiness",
  failures,
);

for (const typeName of ["VerificationCommandView", "VerificationReadinessReportView"]) {
  assertCondition(contractSource.includes(typeName), `Shared contracts must include ${typeName}`, failures);
  assertCondition(schemaSource.includes(`class ${typeName}`), `Supervisor schemas must include ${typeName}`, failures);
}

assertCondition(
  apiSource.includes('"/supervisor/verification-readiness-report"'),
  "FastAPI routes must expose /supervisor/verification-readiness-report",
  failures,
);

for (const commandText of [
  "check-documentation-authority",
  "check-verification-readiness",
  "check-e2e-report",
  "check-reports",
  "check-execution-boundary",
  "check-execution-evidence",
  "check-provider-fixtures",
  "check-process-lifecycle",
  "check-runbooks",
  "check-runtime-export",
  "check-safe-backlog",
  "check-managed-recipes",
  "check-maintenance-action-plan",
  "check-delivery-readiness",
  "check-maintenance-readiness",
  "full-check",
]) {
  assertCondition(serviceSource.includes(commandText), `Verification readiness service must include ${commandText}`, failures);
  assertCondition(supervisorTests.includes(`"${commandText}"`), `Supervisor tests must assert ${commandText}`, failures);
}

for (const serviceText of [
  "get_verification_readiness_report",
  "verification-readiness-report-v1",
  "executionAuthorityApproved=False",
  "docs/stories/3-47-core-readiness-drift-checks.md",
]) {
  assertCondition(serviceSource.includes(serviceText), `Verification readiness service must include ${serviceText}`, failures);
}

assertCondition(
  supervisorTests.includes('report["readyForAuthorityEnablement"] is False'),
  "Supervisor tests must assert verification readiness is not ready for authority enablement",
  failures,
);

assertCondition(dashboardClient.includes("getVerificationReadinessReport"), "Dashboard API client must fetch verification readiness report", failures);
assertCondition(
  controlsPage.includes("<VerificationReadinessReportPanel report={verificationReadinessReport} />"),
  "Controls page must render VerificationReadinessReportPanel",
  failures,
);

for (const panelText of ["VerificationReadinessReportView", "Required commands", "Optional commands", "Authority stop lines"]) {
  assertCondition(verificationPanel.includes(panelText), `Verification readiness panel must render ${panelText}`, failures);
}

for (const browserText of [
  "Verification readiness",
  "Checks and stop lines",
  "pnpm run check:documentation-authority",
  "pnpm run check:verification-readiness",
  "pnpm run check:execution-boundary",
  "pnpm run check:execution-evidence",
  "pnpm run check:provider-fixtures",
  "pnpm run check:process-lifecycle",
  "pnpm run check:maintenance-action-plan",
]) {
  assertCondition(controlsSpec.includes(browserText), `Controls e2e must assert ${browserText}`, failures);
}

const storyPath = "docs/stories/3-47-core-readiness-drift-checks.md";
assertCondition(existsSync(join(rootDir, storyPath)), `Missing core readiness drift story ${storyPath}`, failures);
assertCondition(
  storyIndex.includes("3-47-core-readiness-drift-checks.md"),
  "Story index must reference Story 3.47 core readiness drift checks",
  failures,
);
assertCondition(
  reconciliation.includes("Verification readiness drift check"),
  "Implementation reconciliation must track the verification readiness drift check",
  failures,
);

if (failures.length > 0) {
  console.error("Verification readiness report drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: verification readiness report drift checks passed.");
