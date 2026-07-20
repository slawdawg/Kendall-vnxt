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
const workItemPage = readWorkspaceFile("apps/dashboard/src/app/work-items/[work-item-id]/page.tsx");
const controlsPage = readWorkspaceFile("apps/dashboard/src/app/controls/page.tsx");
const reportShortcuts = readWorkspaceFile("apps/dashboard/src/lib/report-shortcuts.ts");
const policyPanel = readWorkspaceFile("apps/dashboard/src/components/delivery-readiness-policy-report-panel.tsx");
const deliveryCleanupPlanPanel = readWorkspaceFile("apps/dashboard/src/components/delivery-cleanup-plan-panel.tsx");
const controlsSpec = readWorkspaceFile("tests/e2e/dashboard.spec.ts");
const supervisorTests = readWorkspaceFile("services/supervisor/tests/integration/test_routing_preview.py");
const storyIndex = readWorkspaceFile("docs/workflows/implementation-evidence-boundary.md");
const reconciliation = readWorkspaceFile("docs/architecture/kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md");
const deliveryReportStart = schemaSource.indexOf("class DeliveryReadinessPolicyReportView");
const deliveryReportEnd = schemaSource.indexOf("\n\nclass DeliveryReadinessPolicyReportApiEnvelope", deliveryReportStart);
const deliveryReportSchema = deliveryReportStart >= 0 && deliveryReportEnd > deliveryReportStart
  ? schemaSource.slice(deliveryReportStart, deliveryReportEnd)
  : "";
const deliveryEnvelopeStart = schemaSource.indexOf("class DeliveryReadinessPolicyReportApiEnvelope");
const deliveryEnvelopeEnd = schemaSource.indexOf("\n\nclass WorkItemView", deliveryEnvelopeStart);
const deliveryEnvelopeSchema = deliveryEnvelopeStart >= 0 && deliveryEnvelopeEnd > deliveryEnvelopeStart
  ? schemaSource.slice(deliveryEnvelopeStart, deliveryEnvelopeEnd)
  : "";
const deliveryContractStart = contractSource.indexOf("export interface DeliveryReadinessPolicyReportView");
const deliveryContractEnd = contractSource.indexOf("\nexport interface DeliveryReadinessPolicyReportApiEnvelope", deliveryContractStart);
const deliveryContract = deliveryContractStart >= 0 && deliveryContractEnd > deliveryContractStart
  ? contractSource.slice(deliveryContractStart, deliveryContractEnd)
  : "";
const deliveryRouteStart = apiSource.indexOf(
  '@app.get("/supervisor/delivery-readiness-policy-report", response_model=DeliveryReadinessPolicyReportApiEnvelope)',
);
const deliveryRouteEnd = apiSource.indexOf("\n\n@app.", deliveryRouteStart);
const deliveryRoute = deliveryRouteStart >= 0 && deliveryRouteEnd > deliveryRouteStart
  ? apiSource.slice(deliveryRouteStart, deliveryRouteEnd)
  : "";
const deliveryReportFields = [
  "reportId: str",
  "generatedAt: datetime",
  "summary: str",
  "statusPolicy: list[DeliveryReadinessPolicyItemView]",
  "waiverPolicy: list[DeliveryReadinessPolicyItemView]",
  "promoteReadinessPolicy: list[DeliveryReadinessPolicyItemView]",
  "deliverReadinessPolicy: list[DeliveryReadinessPolicyItemView]",
  "blockerRoutingPolicy: list[DeliveryReadinessPolicyItemView]",
  "stopLines: list[str]",
  "nextSafeActions: list[str]",
];
const deliveryContractFields = [
  "reportId: string;",
  "generatedAt: string;",
  "summary: string;",
  "statusPolicy: DeliveryReadinessPolicyItemView[];",
  "waiverPolicy: DeliveryReadinessPolicyItemView[];",
  "promoteReadinessPolicy: DeliveryReadinessPolicyItemView[];",
  "deliverReadinessPolicy: DeliveryReadinessPolicyItemView[];",
  "blockerRoutingPolicy: DeliveryReadinessPolicyItemView[];",
  "stopLines: string[];",
  "nextSafeActions: string[];",
];

const failures = [];

assertCondition(
  packageJson.scripts?.["check:delivery-readiness"] === "node ./scripts/check-delivery-readiness-policy-report.mjs",
  "package.json must define check:delivery-readiness as node ./scripts/check-delivery-readiness-policy-report.mjs",
  failures,
);
for (const field of deliveryReportFields) {
  assertCondition(deliveryReportSchema.includes(`    ${field}`), `Delivery report must include ${field}`, failures);
}
for (const field of deliveryContractFields) {
  assertCondition(deliveryContract.includes(`  ${field}`), `Delivery contract must include ${field}`, failures);
}
assertCondition(
  packageJson.scripts?.check?.includes("pnpm run check:delivery-readiness"),
  "pnpm run check must include pnpm run check:delivery-readiness",
  failures,
);
assertCondition(
  schemaSource.match(/class DeliveryReadinessPolicyReportView\b/g)?.length === 1 &&
    schemaSource.match(/class DeliveryReadinessPolicyReportApiEnvelope\b/g)?.length === 1 &&
    contractSource.match(/export interface DeliveryReadinessPolicyReportView\b/g)?.length === 1 &&
    contractSource.match(/export interface DeliveryReadinessPolicyReportApiEnvelope\b/g)?.length === 1 &&
    apiSource.match(/@app\.get\("\/supervisor\/delivery-readiness-policy-report"/g)?.length === 1,
  "Delivery readiness policy declarations must be unique",
  failures,
);

for (const typeName of [
  "DeliveryReadinessPolicyItemView",
  "DeliveryReadinessPolicyReportView",
  "LowRiskDeliveryPlanActionView",
  "LowRiskDeliveryPlanReportView",
  "DeliveryApprovalLedgerEntryView",
  "DeliveryExecutionEvidencePayload",
  "DeliveryExecutionEvidenceView",
  "CleanupPlanResidueView",
  "CleanupPlanView",
]) {
  assertCondition(contractSource.includes(typeName), `Shared contracts must include ${typeName}`, failures);
  assertCondition(schemaSource.includes(`class ${typeName}`), `Supervisor schemas must include ${typeName}`, failures);
}
assertCondition(
  deliveryEnvelopeSchema.includes("class DeliveryReadinessPolicyReportApiEnvelope") &&
    deliveryEnvelopeSchema.includes('model_config = ConfigDict(extra="forbid", strict=True)') &&
    deliveryEnvelopeSchema.includes("data: DeliveryReadinessPolicyReportView") &&
    deliveryEnvelopeSchema.includes("meta: dict[str, str | int | float | bool | None] | None = None"),
  "Delivery readiness policy envelope must be strict and typed",
  failures,
);
for (const safetyLiteral of [
  "readOnly: Literal[True]",
  "executionAuthorityApproved: Literal[False]",
  "remoteAutomationApproved: Literal[False]",
]) {
  assertCondition(deliveryReportSchema.includes(safetyLiteral), `Delivery report must include ${safetyLiteral}`, failures);
}
for (const safetyLiteral of [
  "readOnly: true;",
  "executionAuthorityApproved: false;",
  "remoteAutomationApproved: false;",
]) {
  assertCondition(deliveryContract.includes(safetyLiteral), `Delivery contract must include ${safetyLiteral}`, failures);
}
assertCondition(
  deliveryRoute.includes(
    '@app.get("/supervisor/delivery-readiness-policy-report", response_model=DeliveryReadinessPolicyReportApiEnvelope)',
  ) && deliveryRoute.includes(
    "return DeliveryReadinessPolicyReportApiEnvelope(data=service.get_delivery_readiness_policy_report())",
  ),
  "Delivery readiness route must return the typed envelope",
  failures,
);

assertCondition(
  apiSource.includes('"/supervisor/delivery-readiness-policy-report"'),
  "FastAPI routes must expose /supervisor/delivery-readiness-policy-report",
  failures,
);
assertCondition(
  apiSource.includes('"/supervisor/low-risk-delivery-plan"') && apiSource.includes('"/work-items/{work_item_id}/low-risk-delivery-plan"'),
  "FastAPI routes must expose supervisor and work-item low-risk delivery plan reports",
  failures,
);
assertCondition(
  apiSource.includes('"/work-items/{work_item_id}/delivery-execution-evidence"'),
  "FastAPI routes must expose work-item delivery execution evidence recording",
  failures,
);
assertCondition(
  apiSource.includes('"/work-items/{work_item_id}/cleanup-plan"'),
  "FastAPI routes must expose work-item cleanup plan reports",
  failures,
);

for (const serviceText of [
  "get_delivery_readiness_policy_report",
  "delivery-readiness-policy-report-v1",
  "remoteAutomationApproved=False",
  "Record delivery readiness only through the work-item delivery readiness checkpoint form.",
  "local-only waiver",
  "GET /supervisor/delivery-readiness-policy-report",
  "docs/workflows/implementation-evidence-boundary.md",
]) {
  assertCondition(serviceSource.includes(serviceText), `Delivery readiness policy service must include ${serviceText}`, failures);
}
for (const planText of [
  "get_low_risk_delivery_plan_report",
  "low-risk-delivery-plan-report-v1",
  "LowRiskDeliveryPlanReportView",
  "remoteMutationApproved=False",
  "cleanupApproved=False",
  "automaticDeliveryApproved=False",
  "policy-missing",
  "low-risk-delivery-policy-v1",
  "stale-pr-head",
  "delivery-target-mismatch",
  "cleanup-target-ambiguous",
  "allowedOperations=[]",
  "record_delivery_execution_evidence",
  "_validate_delivery_execution_approval",
  "deliveryApprovalLedger",
  "approval-ledger-missing",
  "approval-id-unknown",
  "approval-id-ambiguous",
  "approval-expired",
  "approval-retained-evidence-mismatch",
  "approval-operator-missing",
  "approval-operator-mismatch",
  "approval-approved-at-missing",
  "approval-approved-at-invalid",
  "approval-approved-at-future",
  "approval-approved-after-expiry",
  "approval-expiry-or-review-point-missing",
  "approval-stop-lines-missing",
  "approval-pr-url-mismatch",
  "approvalReference",
  "delivery_execution.rejected",
  "delivery_execution.recorded",
  "delivery_execution.failed",
  "report_only_readiness",
  "approved_merge_action_recorded",
  "delivery_action_failed",
  'payload.policyId == "low-risk-delivery-policy-v1"',
  "commandShape-missing",
  "expectedHeadRevision-missing",
  "pull-request-url-missing",
  "pr-head-evidence-missing",
  "retention-boundary",
  "remoteMutationPerformed=False",
  "rawOutputRetained=False",
  "get_cleanup_plan",
  "low-risk-cleanup-policy-v1",
  "cleanup-target-outside-approved-root",
  "retained-evidence-missing",
  "delivery-evidence-failed",
  "delivery-evidence-not-merged",
  "sourceFileState",
  "sourceFiles",
  "externalMutationRecorded",
  "exit-code-nonzero",
  "gitWorktreeState",
  "filesystemState",
  "nextSafeAction",
  "merge-not-recorded",
]) {
  assertCondition(serviceSource.includes(planText), `Low-risk delivery plan service must include ${planText}`, failures);
}

assertCondition(
  dashboardClient.includes("getDeliveryReadinessPolicyReport"),
  "Dashboard API client must fetch the delivery readiness policy report",
  failures,
);
assertCondition(
  dashboardClient.includes("getWorkItemLowRiskDeliveryPlan") && dashboardClient.includes("getWorkItemCleanupPlan"),
  "Dashboard API client must fetch work-item low-risk delivery and cleanup plans",
  failures,
);
assertCondition(
  workItemPage.includes("<DeliveryCleanupPlanPanel deliveryPlan={lowRiskDeliveryPlan} cleanupPlan={cleanupPlan} />") &&
    workItemPage.includes("Delivery plans"),
  "Work-item detail page must render delivery and cleanup plans with a navigation anchor",
  failures,
);
assertCondition(
  controlsPage.includes("<DeliveryReadinessPolicyReportPanel report={deliveryReadinessPolicyReport} />"),
  "Controls page must render DeliveryReadinessPolicyReportPanel",
  failures,
);
assertCondition(
  reportShortcuts.includes('"GET /supervisor/delivery-readiness-policy-report": "#delivery-readiness-policy-report"'),
  "Report shortcut helper must map delivery readiness report endpoint to the controls anchor",
  failures,
);

for (const panelText of [
  "DeliveryReadinessPolicyReportView",
  "Review gate policy",
  "statusPolicy",
  "waiverPolicy",
  "remoteAutomationApproved",
  "stopLines",
  "nextSafeActions",
]) {
  assertCondition(policyPanel.includes(panelText), `Delivery readiness policy panel must render ${panelText}`, failures);
}

for (const planPanelText of [
  "LowRiskDeliveryPlanReportView",
  "LowRiskDeliveryPlanActionView",
  "CleanupPlanView",
  "CleanupPlanResidueView",
  "nextSafeAction",
  "PR readiness",
  "Merge readiness",
  "Cleanup readiness",
  "Blocked reasons",
  "Retained evidence",
  "Dry-run effects",
  "Cleanup target",
  "Git worktree state",
  "Filesystem state",
  "Residue",
  "requires exact approval",
  "plan-action-missing",
  "Read-only",
  "yes",
  "does not push, merge",
  "delete worktrees",
  "delete branches",
  "sync issues",
  "call providers",
  "bypass failed checks",
]) {
  assertCondition(deliveryCleanupPlanPanel.includes(planPanelText), `Delivery cleanup plan panel must render ${planPanelText}`, failures);
}

for (const browserText of [
  "GET /supervisor/delivery-readiness-policy-report",
  "Review gate policy",
  "Pull request evidence",
  "Local-only delivery waiver",
  "Record delivery readiness only through the work-item delivery readiness checkpoint form.",
  "Delivery plans",
  "PR, merge, and cleanup dry-run plan",
  "PR readiness",
  "Merge readiness",
  "Cleanup readiness",
  "Blocked reasons",
  "Retained evidence",
  "Dry-run effects",
  "Cleanup target",
  "Filesystem state",
  "does not push, merge, delete worktrees, delete branches, sync issues, call providers, or bypass failed checks",
  "pnpm run check:delivery-readiness",
]) {
  assertCondition(controlsSpec.includes(browserText), `Controls e2e must assert ${browserText}`, failures);
}

for (const testText of [
  '"delivery-readiness-policy-report-v1"',
  '"/supervisor/delivery-readiness-policy-report"',
  '"low-risk-delivery-plan-report-v1"',
  '"/supervisor/low-risk-delivery-plan"',
  '"/work-items/{work_item_id}/low-risk-delivery-plan"',
  '"/work-items/{work_item_id}/delivery-execution-evidence"',
  '"/work-items/{work_item_id}/cleanup-plan"',
  '"pull-request-status"',
  '"local-only-waiver"',
  "remoteAutomationApproved",
  "remoteMutationApproved",
  "cleanupApproved",
  "policy-missing",
  "stale-pr-head",
  "delivery_execution.rejected",
  "delivery_execution.recorded",
  "delivery_execution.failed",
  "report_only_readiness",
  "approved_merge_action_recorded",
  "delivery_action_failed",
  "low-risk-delivery-policy-v1",
  "commandShape-missing",
  "expectedHeadRevision-missing",
  "pull-request-url-missing",
  "pr-head-evidence-missing",
  "summary-retention-boundary",
  "test_cleanup_plan_classifies_filesystem_residue_without_mutation",
  "cleanup-target-outside-approved-root",
  "retained-evidence-missing",
  "delivery-evidence-failed",
  "delivery-evidence-not-merged",
  "sourceFileState",
  "externalMutationRecorded",
  "exit-code-nonzero",
  "merge-not-recorded",
  "test_cleanup_plan_reports_source_files_and_ambiguous_target_action",
  "test_delivery_execution_evidence_exact_policy_without_approval_is_report_only",
  "test_delivery_execution_evidence_rejects_unknown_approval_id_without_approved_metadata",
  "test_delivery_execution_evidence_rejects_expired_approval_ledger_entry",
  "test_delivery_execution_evidence_rejects_ambiguous_approval_ledger_id",
  "test_delivery_execution_evidence_rejects_retained_evidence_mismatch",
  "test_delivery_execution_evidence_rejects_operator_mismatch",
  "test_delivery_execution_evidence_rejects_trusted_current_pr_state_mismatch",
  '"allowedOperations"] == []',
  "docs/workflows/implementation-evidence-boundary.md",
]) {
  assertCondition(supervisorTests.includes(testText), `Supervisor tests must assert ${testText}`, failures);
}

const storyPath = "docs/workflows/implementation-evidence-boundary.md";
assertCondition(existsSync(join(rootDir, storyPath)), `Missing delivery readiness policy drift story ${storyPath}`, failures);
assertCondition(
  storyIndex.includes("3-45-delivery-readiness-policy-drift-check.md"),
  "Story index must reference Story 3.45 delivery readiness policy drift check",
  failures,
);
assertCondition(
  storyIndex.includes("10-1-define-low-risk-delivery-policy-and-dry-run-plan-contract.md"),
  "Story index must reference Story 10.1 low-risk delivery plan contract",
  failures,
);
assertCondition(
  storyIndex.includes("10-2-record-delivery-execution-evidence-for-approved-pr-and-merge-actions.md"),
  "Story index must reference Story 10.2 delivery execution evidence",
  failures,
);
assertCondition(
  storyIndex.includes("10-3-plan-safe-cleanup-with-evidence-preservation-and-worktree-residue-classification.md"),
  "Story index must reference Story 10.3 cleanup plan",
  failures,
);
assertCondition(
  storyIndex.includes("10-4-show-delivery-and-cleanup-plans-in-dev-console.md"),
  "Story index must reference Story 10.4 delivery and cleanup plans in Dev Console",
  failures,
);
assertCondition(
  storyIndex.includes("10-5-bind-delivery-execution-approval-to-trusted-authority-ledger.md"),
  "Story index must reference Story 10.5 delivery approval ledger hardening",
  failures,
);
assertCondition(
  reconciliation.includes("Delivery readiness policy drift check"),
  "Implementation reconciliation must track the delivery readiness policy drift check",
  failures,
);
assertCondition(
  serviceSource.includes("pnpm run check:delivery-readiness"),
  "Verification readiness report must surface pnpm run check:delivery-readiness",
  failures,
);

if (failures.length > 0) {
  console.error("Delivery readiness policy report drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: delivery readiness policy report drift checks passed.");
