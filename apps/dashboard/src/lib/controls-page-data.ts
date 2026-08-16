import {
  getAuthorityReadinessMatrixReport, getClaudeReviewApprovalReport, getClaudeReviewReadinessReport,
  getCodexImplementationApprovalReport, getCodexReadinessReport, getDashboardE2EReport,
  getDeliveryReadinessPolicyReport, getDevelopmentRunwayReport, getDocumentationAuthorityReport,
  getExecutionReadinessReport, getExecutionRecipes,
  getGitHubDeliveryAuthorityReport, getGitHubWorkflowPolicyReport, getGitHygieneReport,
  getLegacyPlanningArtifactInventoryReport, getLocalCleanupReadinessReport, getMaintenanceActionPlanReport,
  getMaintenanceReadinessReport, getMvpProofTrialReport, getManagedRecipePolicyReport,
  getRoutingLaneProfiles, getRunStatus, getRuntimeEvidenceReviewReport, getReviewResourcePolicyReport,
  getRunnerAssignmentStatusReport, getRemoteCleanupSyncReadinessReport, getSafeDevelopmentBacklogReport,
  getSupervisorReportCatalog, getTrustedDeliveryEligibilityReport, getTrustedAutonomyReadinessReport,
  getVerificationReadinessReport, getWorkerRegistry, getWorkItems,
} from "./supervisor";
import { runBoundedControlsReads } from "./controls-read-scheduler.mjs";

/** The complete, finite Controls read contract. Keep this in lockstep with the LAN proxy manifest. */
export const CONTROLS_PAGE_READ_TIMEOUT_MS = 15_000;
// Five bounded batches fit within the page budget while preserving time for
// scheduling and rendering the full-data-or-unavailable result.
const CONTROLS_REQUEST_TIMEOUT_MS = 2_500;

export async function loadControlsPageData(signal?: AbortSignal) {
  const read = <T>(load: (options: { signal?: AbortSignal; timeoutMs?: number }) => Promise<T>) => ({ signal: requestSignal }: { signal?: AbortSignal }) => load({ signal: requestSignal, timeoutMs: CONTROLS_REQUEST_TIMEOUT_MS });
  const [status, items, workers, laneProfiles, readinessReport, documentationAuthorityReport, legacyPlanningArtifactInventoryReport, verificationReadinessReport, authorityReadinessMatrixReport, dashboardE2EReport, reportCatalog, maintenanceReadinessReport, maintenanceActionPlanReport, developmentRunwayReport, runtimeEvidenceReviewReport, safeDevelopmentBacklog, runnerAssignmentStatusReport, managedRecipePolicyReport, githubWorkflowPolicyReport, githubDeliveryAuthorityReport, gitHygieneReport, localCleanupReadinessReport, remoteCleanupSyncReadinessReport, trustedDeliveryEligibilityReport, trustedAutonomyReadinessReport, mvpProofTrialReport, codexReadinessReport, codexImplementationApprovalReport, claudeReviewReadinessReport, claudeReviewApprovalReport, reviewResourcePolicyReport, deliveryReadinessPolicyReport, executionRecipes] = await runBoundedControlsReads([
    { alias: "Supervisor status", read: read(getRunStatus) },
    { alias: "Work items", read: read(getWorkItems) },
    { alias: "Worker registry", read: read(getWorkerRegistry) },
    { alias: "Lane profiles", read: read(getRoutingLaneProfiles) },
    { alias: "Execution readiness", read: read(getExecutionReadinessReport) },
    { alias: "Documentation authority", read: read(getDocumentationAuthorityReport) },
    { alias: "Legacy planning inventory", read: read(getLegacyPlanningArtifactInventoryReport) },
    { alias: "Verification readiness", read: read(getVerificationReadinessReport) },
    { alias: "Authority readiness", read: read(getAuthorityReadinessMatrixReport) },
    { alias: "Dashboard E2E", read: read(getDashboardE2EReport) },
    { alias: "Report catalog", read: read(getSupervisorReportCatalog) },
    { alias: "Maintenance readiness", read: read(getMaintenanceReadinessReport) },
    { alias: "Maintenance action plan", read: read(getMaintenanceActionPlanReport) },
    { alias: "Development runway", read: read(getDevelopmentRunwayReport) },
    { alias: "Runtime evidence", read: read(getRuntimeEvidenceReviewReport) },
    { alias: "Safe development backlog", read: read(getSafeDevelopmentBacklogReport) },
    { alias: "Runner assignment status", read: read(getRunnerAssignmentStatusReport) },
    { alias: "Managed recipe policy", read: read(getManagedRecipePolicyReport) },
    { alias: "GitHub workflow policy", read: read(getGitHubWorkflowPolicyReport) },
    { alias: "GitHub delivery authority", read: read(getGitHubDeliveryAuthorityReport) },
    { alias: "Git hygiene", read: read(getGitHygieneReport) },
    { alias: "Local cleanup readiness", read: read(getLocalCleanupReadinessReport) },
    { alias: "Remote cleanup readiness", read: read(getRemoteCleanupSyncReadinessReport) },
    { alias: "Trusted delivery eligibility", read: read(getTrustedDeliveryEligibilityReport) },
    { alias: "Trusted autonomy readiness", read: read(getTrustedAutonomyReadinessReport) },
    { alias: "Epic 6 MVP proof trial", read: read(getMvpProofTrialReport) },
    { alias: "Codex readiness", read: read(getCodexReadinessReport) },
    { alias: "Codex implementation approval", read: read(getCodexImplementationApprovalReport) },
    { alias: "Claude review readiness", read: read(getClaudeReviewReadinessReport) },
    { alias: "Claude review approval", read: read(getClaudeReviewApprovalReport) },
    { alias: "Review resource policy", read: read(getReviewResourcePolicyReport) },
    { alias: "Delivery readiness policy", read: read(getDeliveryReadinessPolicyReport) },
    { alias: "Execution recipes", read: read(getExecutionRecipes) },
  ] as const, { signal });
  return { status, items, workers, laneProfiles, readinessReport, documentationAuthorityReport, legacyPlanningArtifactInventoryReport, verificationReadinessReport, authorityReadinessMatrixReport, dashboardE2EReport, reportCatalog, maintenanceReadinessReport, maintenanceActionPlanReport, developmentRunwayReport, runtimeEvidenceReviewReport, safeDevelopmentBacklog, runnerAssignmentStatusReport, managedRecipePolicyReport, githubWorkflowPolicyReport, githubDeliveryAuthorityReport, gitHygieneReport, localCleanupReadinessReport, remoteCleanupSyncReadinessReport, trustedDeliveryEligibilityReport, trustedAutonomyReadinessReport, mvpProofTrialReport, codexReadinessReport, codexImplementationApprovalReport, claudeReviewReadinessReport, claudeReviewApprovalReport, reviewResourcePolicyReport, deliveryReadinessPolicyReport, executionRecipes };
}

export type ControlsPageData = Awaited<ReturnType<typeof loadControlsPageData>>;
