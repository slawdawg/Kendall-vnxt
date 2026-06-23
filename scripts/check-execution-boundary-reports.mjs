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
const executionReadinessPanel = readWorkspaceFile("apps/dashboard/src/components/execution-readiness-report-panel.tsx");
const controlsPage = readWorkspaceFile("apps/dashboard/src/app/controls/page.tsx");
const reportShortcuts = readWorkspaceFile("apps/dashboard/src/lib/report-shortcuts.ts");
const controlsSpec = readWorkspaceFile("tests/e2e/dashboard.spec.ts");
const supervisorTests = readWorkspaceFile("services/supervisor/tests/integration/test_routing_preview.py");
const storyIndex = readWorkspaceFile("docs/workflows/implementation-evidence-boundary.md");
const runtimeExportCheck = readWorkspaceFile("scripts/check-runtime-evidence-export.mjs");
const runbookCheck = readWorkspaceFile("scripts/check-runbook-verification.mjs");
const reconciliation = readWorkspaceFile("docs/architecture/kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md");

const failures = [];

assertCondition(
  packageJson.scripts?.["check:execution-boundary"] === "node ./scripts/check-execution-boundary-reports.mjs",
  "package.json must define check:execution-boundary as node ./scripts/check-execution-boundary-reports.mjs",
  failures,
);
assertCondition(
  packageJson.scripts?.check?.includes("pnpm run check:execution-boundary"),
  "pnpm run check must include pnpm run check:execution-boundary",
  failures,
);

for (const typeName of [
  "ExecutionConfigurationCheckView",
  "ExecutionConfigurationChecksView",
  "ProviderEnablementPolicyStepView",
  "DisabledProviderProofView",
  "ExecutionReadinessReportView",
  "ThreatBoundaryRuleView",
  "ThreatBoundaryView",
]) {
  assertCondition(contractSource.includes(typeName), `Shared contracts must include ${typeName}`, failures);
  assertCondition(schemaSource.includes(`class ${typeName}`), `Supervisor schemas must include ${typeName}`, failures);
}

for (const routeText of [
  '"/supervisor/execution-configuration-checks"',
  '"/supervisor/execution-readiness-report"',
  '"/supervisor/threat-boundary"',
]) {
  assertCondition(apiSource.includes(routeText), `FastAPI routes must expose ${routeText}`, failures);
}

for (const serviceText of [
  "get_execution_configuration_checks",
  "get_execution_readiness_report",
  "get_threat_boundary",
  "subscription_agent_process_launch_not_enabled",
  "local_provider_http_calls_not_enabled",
  "premium_execution_not_enabled",
  "arbitrary_shell_execution_not_enabled",
  "worker_source_mutation_not_enabled",
  "worker_network_access_not_enabled",
  "worker_credential_access_not_enabled",
  "execution-readiness-report-v1",
  "supervisor-worker-threat-boundary-v1",
  "threat-boundary-update",
  "deny_all_local_and_remote_provider_endpoints_until_provider_specific_policy_approval",
  "forbid_worker_access_to_credentials",
]) {
  assertCondition(serviceSource.includes(serviceText), `Execution boundary service must include ${serviceText}`, failures);
}

assertCondition(
  controlsPage.includes("<ExecutionReadinessReportPanel report={readinessReport} />"),
  "Controls page must render ExecutionReadinessReportPanel",
  failures,
);
for (const panelText of ["ExecutionReadinessReportView", "Provider enablement ladder", "Provider no-call proofs", "Current attempts"]) {
  assertCondition(executionReadinessPanel.includes(panelText), `Execution readiness panel must render ${panelText}`, failures);
}
for (const shortcutText of [
  '"GET /supervisor/execution-configuration-checks": "#execution-readiness-report"',
  '"GET /supervisor/execution-readiness-report": "#execution-readiness-report"',
  '"GET /supervisor/threat-boundary": "#execution-readiness-report"',
]) {
  assertCondition(reportShortcuts.includes(shortcutText), `Report shortcut helper must map ${shortcutText}`, failures);
}

for (const browserText of [
  "GET /supervisor/execution-configuration-checks",
  "GET /supervisor/execution-readiness-report",
  "GET /supervisor/threat-boundary",
  "Provider enablement ladder",
  "Provider no-call proofs",
  "pnpm run check:execution-boundary",
]) {
  assertCondition(controlsSpec.includes(browserText), `Controls e2e must assert ${browserText}`, failures);
}

for (const testText of [
  "test_execution_configuration_checks_report_disabled_defaults_without_mutation",
  "test_execution_readiness_report_compacts_policy_attempt_and_outcome_evidence_without_mutation",
  "test_threat_boundary_reports_redaction_command_provider_and_secret_denials_without_mutation",
  '"execution-readiness-report-v1"',
  '"supervisor-worker-threat-boundary-v1"',
  '"local-provider-calls"',
  '"subscription-agent-launch"',
  '"premium-execution"',
  '"threat-boundary-update"',
  '"check-execution-boundary"',
]) {
  assertCondition(supervisorTests.includes(testText), `Supervisor tests must assert ${testText}`, failures);
}

for (const story of [
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
]) {
  assertCondition(existsSync(join(rootDir, story)), `Missing execution boundary story evidence ${story}`, failures);
}
assertCondition(
  storyIndex.includes("configuration checks, runtime exports, and threat boundary"),
  "Story index completed foundation summary must reference configuration checks, runtime exports, and threat boundary",
  failures,
);
assertCondition(
  storyIndex.includes("3-7-execution-readiness-and-evidence-report.md"),
  "Story index must reference Story 3.7 execution readiness report",
  failures,
);
assertCondition(
  storyIndex.includes("3-48-execution-boundary-report-drift-check.md"),
  "Story index must reference Story 3.48 execution boundary report drift check",
  failures,
);

assertCondition(
  runtimeExportCheck.includes("docs/workflows/implementation-evidence-boundary.md"),
  "Runtime evidence export drift check must require Story 3.48 git-backed evidence",
  failures,
);
assertCondition(
  serviceSource.includes("docs/workflows/implementation-evidence-boundary.md"),
  "Runtime evidence export service must include Story 3.48 git-backed evidence",
  failures,
);
assertCondition(
  serviceSource.includes("pnpm run check:execution-boundary"),
  "Verification readiness report must surface pnpm run check:execution-boundary",
  failures,
);
assertCondition(
  runbookCheck.includes("activeVerificationCommands") &&
    runbookCheck.includes('extractVerificationCommands(packageJson.scripts?.["check:static"])') &&
    runbookCheck.includes("extractVerificationCommands(packageJson.scripts?.check)") &&
    runbookCheck.includes("(?:check|test|build):") &&
    runbookCheck.includes("extractorProbeCommands") &&
    runbookCheck.includes("pnpm run build:dashboard") &&
    runbookCheck.includes("for (const command of activeVerificationCommands)") &&
    runbookCheck.includes("mentionsCommand(content, command)"),
  "Runbook drift check must derive active check/test/build commands from package.json aggregate scripts",
  failures,
);
assertCondition(
  reconciliation.includes("Execution boundary report drift check"),
  "Implementation reconciliation must track the execution boundary report drift check",
  failures,
);

if (failures.length > 0) {
  console.error("Execution boundary report drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: execution boundary report drift checks passed.");
