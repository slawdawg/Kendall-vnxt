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
const controlsSpec = readWorkspaceFile("tests/e2e/dashboard.spec.ts");

const failures = [];

assertCondition(packageJson.scripts?.["check:runner-assignment-status"] === "node ./scripts/check-runner-assignment-status-report.mjs", "package.json must define check:runner-assignment-status", failures);
assertCondition(packageJson.scripts?.["check:static"]?.includes("pnpm run check:runner-assignment-status"), "check:static must include check:runner-assignment-status", failures);
assertCondition(packageJson.scripts?.check?.includes("pnpm run check:runner-assignment-status"), "check must include check:runner-assignment-status", failures);

for (const typeName of [
  "RunnerAssignmentStatusReportView",
  "RunnerAssignmentStatusRowView",
  "RunnerAssignmentStatusSummaryView",
  "RunnerDispatcherContinuitySnapshotView",
  "RunnerDispatcherQueueProofRowView",
  "RunnerHandoffAuditEntryView",
  "RunnerAssignmentWarningView",
]) {
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
  "handoffCandidateStateCounts",
  "handoffCandidateStateCountsStatus",
  "handoffLifecycleState",
  "handoffRecoveryAction",
  "handoffRecoverySummary",
  "handoffAuditTrail",
  "RunnerHandoffAuditEntryView",
  "_runner_handoff_audit_trail",
  "evidenceStatus",
  "queueCountsStatus",
  "retentionPolicy",
  "payloadRetention",
  "retentionSummary",
  "_runner_handoff_retention_summary",
  "_runner_handoff_audit_retained_text",
  "_runner_handoff_candidate_state_counts",
  "_runner_handoff_candidate_state_counts_status",
  "_runner_handoff_lifecycle_state",
  "_runner_handoff_recovery",
  "request-takeover-approval",
  "resume-cleanup",
  "inspect-handoff-evidence",
  "candidate_state_counts",
  "dispatcherContinuity",
  "dispatcher-continuity-snapshot-v1",
  "dispatch-next --dry-run --owner <owner>",
  "queueProofRows",
  "dispatcher-queue-state-fixtures-refresh",
  "dispatcher-queue-handoff-badges-refresh",
  "dispatcher-queue-handoff-status-refresh",
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
  "handoffCountEntries",
  "handoffCandidateStateCounts",
  "handoffCandidateStateCountsStatus",
  "handoffLifecycleState",
  "handoffRecoveryAction",
  "handoffRecoverySummary",
  "handoffAuditTrail",
  "auditEntrySearchText",
  "auditQuery",
  "auditEvidenceFilter",
  "auditPayloadFilter",
  "AUDIT_JSON_SCHEMA_ID",
  "AUDIT_JSON_SCHEMA_VERSION",
  "AUDIT_JSON_REQUIRED_TOP_LEVEL_FIELDS",
  "AUDIT_JSON_RETAINED_ENTRY_FIELDS",
  "isRecord",
  "missingObjectFields",
  "auditExportText",
  "auditExportFilename",
  "auditExportJson",
  "auditJsonValidationMessages",
  "auditJsonFilename",
  "filteredAuditExportText",
  "filteredAuditExportFilename",
  "filteredAuditJsonExport",
  "filteredAuditJsonFilename",
  "filteredAuditJsonValidationMessages",
  "filteredAuditJsonValidationSummary",
  "copyAuditExportSummary",
  "downloadAuditExportSummary",
  "downloadAuditJsonExport",
  "Handoff audit trail",
  "Audit query:",
  "Filtered audit export",
  "Copy summary",
  "Download .txt",
  "Download .json",
  "Download prepared for",
  "JSON download prepared for",
  "filename:",
  "json filename:",
  "Filtered audit JSON export",
  "kendall.runner-handoff-audit.filtered-export.v1",
  "generated-worker-handoff-audit-metadata-only",
  "requiredTopLevelFields",
  "retainedEntryFields",
  "JSON validation:",
  "JSON validation failed:",
  "missing top-level fields:",
  "unexpected top-level fields:",
  "has unexpected fields:",
  "schema.requiredTopLevelFields must match exactly",
  "schema.retainedEntryFields must match exactly",
  "entries.total must be a number",
  "filters.evidence is invalid",
  "retentionPolicy is invalid",
  "payloadRetention is invalid",
  "auditTrail[",
  "No filtered audit entries to export.",
  "No audit entries match the current query.",
  "Readiness evidence:",
  "Readiness summary:",
  "Queue evidence:",
  "Audit stop:",
  "evidenceSummary",
  "Owner:",
  "Branch:",
  "Worktree state:",
  "Next command:",
  "Generated:",
  "Readiness:",
  "Summary:",
  "Lifecycle:",
  "Recovery action:",
  "Recovery:",
  "Queue counts:",
  "Retention:",
  "Retention summary:",
  "Stop:",
  "report.summary",
  "row.reasonCode",
  "row.warnings",
  "Dispatcher continuity snapshot",
  "report.dispatcherContinuity.snapshotId",
  "Candidate:",
  "Dry run:",
  "Blockers:",
  "Queue proof",
  "report.dispatcherContinuity.queueProofRows.map",
]) {
  assertCondition(panelSource.includes(panelText), `Runner assignment panel must render ${panelText}`, failures);
}

for (const contractText of [
  "RunnerDispatcherContinuitySnapshotView",
  "RunnerDispatcherQueueProofRowView",
  "dispatcherContinuity",
  "selectedBacklogItemId",
  "selectedBranch",
  "dryRunCommand",
  "blockerCodes",
  "queueProofRows",
  "backlogItemId",
  "handoffStatus",
  "handoffNextCommand",
  "handoffReadinessStatus",
  "handoffReadinessCommand",
  "handoffGeneratedAt",
  "handoffSummary",
  "handoffTakeoverStopLines",
  "handoffCandidateStateCounts",
  "handoffCandidateStateCountsStatus",
  "handoffLifecycleState",
  "handoffRecoveryAction",
  "handoffRecoverySummary",
  "RunnerHandoffAuditEntryView",
  "handoffAuditTrail",
  "workspaceAction",
  "nextCommand",
  "readinessSummary",
  "queueCounts",
  "queueCountsStatus",
  "stopLines",
  "lifecycleState",
  "recoveryAction",
  "recoverySummary",
  "evidenceStatus",
  "evidenceSummary",
  "retentionPolicy",
  "payloadRetention",
  "retentionSummary",
]) {
  assertCondition(contractSource.includes(contractText), `Shared contracts must include ${contractText}`, failures);
  assertCondition(schemaSource.includes(contractText), `Supervisor schemas must include ${contractText}`, failures);
}

for (const browserText of [
  "seedRunnerAssignmentHandoffState",
  "active: 1",
  "blocked authority: 1",
  "blocked owned active: 1",
  "closed: 9",
  "Lifecycle: prepared",
  "Recovery action: inspect-handoff-evidence",
  "Queue counts: available",
  "Handoff audit trail",
  "Audit query:",
  "Filtered audit export",
  "Copy summary",
  "Download .txt",
  "Download .json",
  "Audit #1: complete",
  "No audit entries match the current query.",
  "Readiness evidence: passed",
  "Queue evidence: available",
  "Retention: metadata-only",
  "entries: 1/1",
  "payload=not-retained",
  "handoff-audit-",
  ".txt",
  ".json",
  "Filtered audit JSON export",
  "JSON download prepared for",
  "exportKind",
  "filtered-handoff-audit",
  "schemaId",
  "schemaVersion",
  "requiredTopLevelFields",
  "retainedEntryFields",
  "JSON validation: schema v1 metadata-only",
  "generated-worker-handoff-audit-metadata-only",
  "auditTrail",
  "No filtered audit entries to export.",
  "payload not-retained",
  "Retention summary:",
  "Audit stop: no automatic takeover",
  "complete handoff packet; readiness passed; queue counts available",
]) {
  assertCondition(controlsSpec.includes(browserText), `Controls e2e must assert runner assignment handoff badge text: ${browserText}`, failures);
}

if (failures.length > 0) {
  console.error("Runner assignment status report drift check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Runner assignment status report drift check passed.");
