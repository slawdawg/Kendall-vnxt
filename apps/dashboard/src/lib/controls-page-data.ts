import {
  getAuthorityReadinessMatrixReport, getClaudeReviewApprovalReport, getClaudeReviewReadinessReport,
  getCodexImplementationApprovalReport, getCodexReadinessReport, getDashboardE2EReport,
  getDeliveryReadinessPolicyReport, getDevelopmentRunwayReport, getDocumentationAuthorityReport,
  getExecutionReadinessReport, getExecutionRecipes, getEpic6CompletionAuditReport,
  getGitHubDeliveryAuthorityReport, getGitHubWorkflowPolicyReport, getGitHygieneReport,
  getLegacyPlanningArtifactInventoryReport, getLocalCleanupReadinessReport, getMaintenanceActionPlanReport,
  getMaintenanceReadinessReport, getMvpProofTrialReport, getManagedRecipePolicyReport,
  getRoutingLaneProfiles, getRunStatus, getRuntimeEvidenceReviewReport, getReviewResourcePolicyReport,
  getRunnerAssignmentStatusReport, getRemoteCleanupSyncReadinessReport, getSafeDevelopmentBacklogReport,
  getSupervisorReportCatalog, getTrustedDeliveryEligibilityReport, getTrustedAutonomyReadinessReport,
  getVerificationReadinessReport, getWorkerRegistry, getWorkItems,
} from "./supervisor";

/** The complete, finite Controls read contract. Keep this in lockstep with the LAN proxy manifest. */
export async function loadControlsPageData(signal?: AbortSignal) {
  const [status, items, workers, laneProfiles, readinessReport, documentationAuthorityReport, legacyPlanningArtifactInventoryReport, verificationReadinessReport, authorityReadinessMatrixReport, dashboardE2EReport, reportCatalog, maintenanceReadinessReport, maintenanceActionPlanReport, developmentRunwayReport, runtimeEvidenceReviewReport, safeDevelopmentBacklog, runnerAssignmentStatusReport, managedRecipePolicyReport, githubWorkflowPolicyReport, githubDeliveryAuthorityReport, gitHygieneReport, localCleanupReadinessReport, remoteCleanupSyncReadinessReport, trustedDeliveryEligibilityReport, trustedAutonomyReadinessReport, epic6CompletionAuditReport, mvpProofTrialReport, codexReadinessReport, codexImplementationApprovalReport, claudeReviewReadinessReport, claudeReviewApprovalReport, reviewResourcePolicyReport, deliveryReadinessPolicyReport, executionRecipes] = await Promise.all([
    getRunStatus({ signal }), getWorkItems({ signal }), getWorkerRegistry({ signal }), getRoutingLaneProfiles({ signal }), getExecutionReadinessReport({ signal }), getDocumentationAuthorityReport({ signal }), getLegacyPlanningArtifactInventoryReport({ signal }), getVerificationReadinessReport({ signal }), getAuthorityReadinessMatrixReport({ signal }), getDashboardE2EReport({ signal }), getSupervisorReportCatalog({ signal }), getMaintenanceReadinessReport({ signal }), getMaintenanceActionPlanReport({ signal }), getDevelopmentRunwayReport({ signal }), getRuntimeEvidenceReviewReport({ signal }), getSafeDevelopmentBacklogReport({ signal }), getRunnerAssignmentStatusReport({ signal }), getManagedRecipePolicyReport({ signal }), getGitHubWorkflowPolicyReport({ signal }), getGitHubDeliveryAuthorityReport({ signal }), getGitHygieneReport({ signal }), getLocalCleanupReadinessReport({ signal }), getRemoteCleanupSyncReadinessReport({ signal }), getTrustedDeliveryEligibilityReport({ signal }), getTrustedAutonomyReadinessReport({ signal }), getEpic6CompletionAuditReport({ signal }), getMvpProofTrialReport({ signal }), getCodexReadinessReport({ signal }), getCodexImplementationApprovalReport({ signal }), getClaudeReviewReadinessReport({ signal }), getClaudeReviewApprovalReport({ signal }), getReviewResourcePolicyReport({ signal }), getDeliveryReadinessPolicyReport({ signal }), getExecutionRecipes({ signal }),
  ]);
  return { status, items, workers, laneProfiles, readinessReport, documentationAuthorityReport, legacyPlanningArtifactInventoryReport, verificationReadinessReport, authorityReadinessMatrixReport, dashboardE2EReport, reportCatalog, maintenanceReadinessReport, maintenanceActionPlanReport, developmentRunwayReport, runtimeEvidenceReviewReport, safeDevelopmentBacklog, runnerAssignmentStatusReport, managedRecipePolicyReport, githubWorkflowPolicyReport, githubDeliveryAuthorityReport, gitHygieneReport, localCleanupReadinessReport, remoteCleanupSyncReadinessReport, trustedDeliveryEligibilityReport, trustedAutonomyReadinessReport, epic6CompletionAuditReport, mvpProofTrialReport, codexReadinessReport, codexImplementationApprovalReport, claudeReviewReadinessReport, claudeReviewApprovalReport, reviewResourcePolicyReport, deliveryReadinessPolicyReport, executionRecipes };
}

export type ControlsPageData = Awaited<ReturnType<typeof loadControlsPageData>>;
