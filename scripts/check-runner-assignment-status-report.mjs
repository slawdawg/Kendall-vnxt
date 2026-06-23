import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
function readWorkspaceFile(path) {
  return readFileSync(join(rootDir, path), "utf8");
}
function assertCondition(condition, message, failures) {
  if (!condition) failures.push(message);
}

const packageJson = JSON.parse(readWorkspaceFile("package.json"));
const contractSource = readWorkspaceFile("packages/contracts/src/api.ts");
const schemaSource = readWorkspaceFile("services/supervisor/src/supervisor/api/schemas.py");
const serviceSource = readWorkspaceFile("services/supervisor/src/supervisor/application/service.py");
const apiSource = readWorkspaceFile("services/supervisor/src/supervisor/api/main.py");
const dashboardClient = readWorkspaceFile("apps/dashboard/src/lib/supervisor.ts");
const controlsPage = readWorkspaceFile("apps/dashboard/src/app/controls/page.tsx");
const panelSource = readWorkspaceFile("apps/dashboard/src/components/runner-assignment-status-report-panel.tsx");
const reportShortcuts = readWorkspaceFile("apps/dashboard/src/lib/report-shortcuts.ts");
const currentRunbook = readWorkspaceFile("docs/workflows/current-session-runbook.md");

const failures = [];

assertCondition(packageJson.scripts?.["check:runner-assignment-status"] === "node ./scripts/check-runner-assignment-status-report.mjs", "package.json must define check:runner-assignment-status", failures);
assertCondition(packageJson.scripts?.["check:static"]?.includes("pnpm run check:runner-assignment-status"), "check:static must include check:runner-assignment-status", failures);
assertCondition(packageJson.scripts?.check?.includes("pnpm run check:runner-assignment-status"), "check must include check:runner-assignment-status", failures);

for (const typeName of ["RunnerAssignmentStatusReportView", "RunnerAssignmentStatusRowView", "RunnerAssignmentStatusSummaryView", "RunnerAssignmentWarningView"]) {
  assertCondition(contractSource.includes(typeName), `Shared contracts must include ${typeName}`, failures);
  assertCondition(schemaSource.includes(`class ${typeName}`), `Supervisor schemas must include ${typeName}`, failures);
}

for (const text of [
  '"/supervisor/runner-assignment-status-report"',
  "get_runner_assignment_status_report",
  "RunnerAssignmentStatusReportView",
]) {
  assertCondition(apiSource.includes(text) || serviceSource.includes(text) || schemaSource.includes(text), `Runner assignment backend must include ${text}`, failures);
}

for (const serviceText of [
  "CODEX_WORKSPACE_STATE_ROOT",
  "CODEX_WORKSPACE_ROOT",
  "get_safe_development_backlog_report",
  "GIT_OPTIONAL_LOCKS",
  "dispatch_handoffs",
  "handoffNextCommand",
  "handoffReadinessStatus",
  "handoffTakeoverStopLines",
  "stop_lines",
  "worktree-outside-managed-root",
  "runner-assignment-status-report-v1",
  "No assignment action",
]) {
  assertCondition(serviceSource.includes(serviceText), `Runner assignment service must include ${serviceText}`, failures);
}

assertCondition(dashboardClient.includes("getRunnerAssignmentStatusReport"), "Dashboard client must fetch runner assignment status", failures);
assertCondition(controlsPage.includes("<RunnerAssignmentStatusReportPanel report={runnerAssignmentStatusReport} />"), "Controls page must render RunnerAssignmentStatusReportPanel", failures);
assertCondition(reportShortcuts.includes('"GET /supervisor/runner-assignment-status-report": "#runner-assignment-status"'), "Report shortcuts must map runner assignment endpoint", failures);
assertCondition(
  currentRunbook.includes("Prepared lane handoffs must surface a resume packet with owner, branch") &&
    currentRunbook.includes("readiness status, next command, and takeover stop lines"),
  "Current session runbook must describe prepared lane handoff evidence",
  failures,
);

for (const panelText of [
  "Runner Assignment Status",
  "Which lane needs attention now?",
  "No active runner assignments.",
  "Degraded evidence",
  "No assignment action",
  "handoff: {row.handoffStatus}",
  "Handoff next:",
  "Handoff generated:",
  "Handoff readiness:",
  "Handoff stop:",
  "Resume packet",
  "Owner:",
  "Branch:",
  "Worktree state:",
  "Next command:",
  "Generated:",
  "Readiness:",
  "Summary:",
  "Stop:",
  "report.summary",
  "row.reasonCode",
  "row.warnings",
]) {
  assertCondition(panelSource.includes(panelText), `Runner assignment panel must render ${panelText}`, failures);
}

for (const contractText of [
  "handoffStatus",
  "handoffNextCommand",
  "handoffReadinessStatus",
  "handoffReadinessCommand",
  "handoffGeneratedAt",
  "handoffSummary",
  "handoffTakeoverStopLines",
]) {
  assertCondition(contractSource.includes(contractText), `Shared contracts must include ${contractText}`, failures);
  assertCondition(schemaSource.includes(contractText), `Supervisor schemas must include ${contractText}`, failures);
}

if (failures.length > 0) {
  console.error("Runner assignment status report drift check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Runner assignment status report drift check passed.");
