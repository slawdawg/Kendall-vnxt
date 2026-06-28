import type {
  ApiEnvelope,
  AuthorityReadinessMatrixReportView,
  CandidateWorkBmadImportPayload,
  CandidateWorkObsidianMetadataImportPayload,
  CandidateWorkPromotionView,
  CandidateWorkUpdatePayload,
  CandidateWorkView,
  ClaudeReviewApprovalReportView,
  ClaudeReviewReadinessReportView,
  CodexImplementationApprovalReportView,
  CodexReadinessReportView,
  DashboardE2EReportView,
  DeliveryReadinessPolicyReportView,
  DevelopmentRunwayReportView,
  DocumentationAuthorityReportView,
  EpicCompletionAuditReportView,
  ExecutionAttemptView,
  ExecutionReadinessReportView,
  GitHubDeliveryAuthorityReportView,
  GitHubWorkflowPolicyReportView,
  GitHygieneReportView,
  CleanupPlanView,
  LegacyPlanningArtifactInventoryReportView,
  LocalCleanupReadinessReportView,
  LocalEvidenceExplanationPayload,
  LocalEvidenceExplanationView,
  LocalWorktreePlanView,
  LowRiskDeliveryPlanReportView,
  ManagedRecipePolicyReportView,
  MaintenanceActionPlanReportView,
  MaintenanceReadinessReportView,
  MvpProofTrialReportView,
  RuntimeEvidenceReviewReportView,
  ReviewResourcePolicyReportView,
  RunnerAssignmentStatusReportView,
  RuntimeEvidenceExportView,
  RemoteCleanupSyncReadinessReportView,
  RoutingLaneEvidenceProfileView,
  RoutingPreviewView,
  RunStatusView,
  SafeDevelopmentBacklogReportView,
  SavedWorkItemView,
  SavedWorkItemViewPayload,
  SupervisorReportCatalogView,
  TrustedDeliveryEligibilityReportView,
  TrustedAutonomyReadinessReportView,
  WorkItemBranchPreparationPayload,
  WorkItemAssignmentPayload,
  WorkItemFilterScope,
  WorkItemExecutionRecipeView,
  WorkItemManagedActionPayload,
  WorkItemRecipeGateAuditView,
  WorkPacketV0View,
  VerificationReadinessReportView,
  WorkflowEventView,
  WorkItemView,
  WorkerRegistryEntryView,
} from "@kendall/contracts";

const configuredPublicBaseUrl = process.env.NEXT_PUBLIC_SUPERVISOR_URL;
const publicBaseUrl = configuredPublicBaseUrl ?? "http://localhost:8000";
const internalBaseUrl = process.env.SUPERVISOR_INTERNAL_URL ?? publicBaseUrl;

export function getSupervisorBaseUrl(): string {
  if (typeof window === "undefined") {
    return publicBaseUrl;
  }

  if (!configuredPublicBaseUrl) {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }

  return configuredPublicBaseUrl;
}

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(`${internalBaseUrl}${path}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Request failed for ${path}`);
  }
  const payload = (await response.json()) as ApiEnvelope<T>;
  return payload.data;
}

export async function getRunStatus(): Promise<RunStatusView> {
  return requestJson<RunStatusView>("/supervisor/status");
}

export async function getWorkItems(): Promise<WorkItemView[]> {
  return requestJson<WorkItemView[]>("/work-items");
}

export async function getCandidateWork(): Promise<CandidateWorkView[]> {
  return requestJson<CandidateWorkView[]>("/candidate-work");
}

export async function importBmadCandidateWork(payload: CandidateWorkBmadImportPayload): Promise<CandidateWorkView> {
  const response = await fetch(`${getSupervisorBaseUrl()}/candidate-work/import-bmad`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as
      | { detail?: { error?: { message?: string } } }
      | null;
    throw new Error(errorPayload?.detail?.error?.message ?? "Unable to import BMAD work.");
  }
  const envelope = (await response.json()) as ApiEnvelope<CandidateWorkView>;
  return envelope.data;
}

export async function importObsidianMetadataCandidateWork(payload: CandidateWorkObsidianMetadataImportPayload): Promise<CandidateWorkView> {
  const response = await fetch(`${getSupervisorBaseUrl()}/candidate-work/import-obsidian-metadata`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to import Obsidian metadata: ${response.status}`);
  }
  const envelope = (await response.json()) as ApiEnvelope<CandidateWorkView>;
  return envelope.data;
}

export async function updateCandidateWork(candidateWorkId: string, payload: CandidateWorkUpdatePayload): Promise<CandidateWorkView> {
  const response = await fetch(`${getSupervisorBaseUrl()}/candidate-work/${candidateWorkId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error("Unable to update proposed work.");
  }
  const envelope = (await response.json()) as ApiEnvelope<CandidateWorkView>;
  return envelope.data;
}

export async function promoteCandidateWork(candidateWorkId: string): Promise<CandidateWorkPromotionView> {
  const response = await fetch(`${getSupervisorBaseUrl()}/candidate-work/${candidateWorkId}/promote`, {
    method: "POST",
  });
  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as
      | { detail?: { error?: { message?: string } } }
      | null;
    throw new Error(errorPayload?.detail?.error?.message ?? "Unable to move proposed work into active work.");
  }
  const envelope = (await response.json()) as ApiEnvelope<CandidateWorkPromotionView>;
  return envelope.data;
}

export async function getWorkItem(id: string): Promise<WorkItemView> {
  return requestJson<WorkItemView>(`/work-items/${id}`);
}

export async function getWorkItemEvents(id: string): Promise<WorkflowEventView[]> {
  return requestJson<WorkflowEventView[]>(`/work-items/${id}/events`);
}

export async function getWorkPacket(packetId: string): Promise<WorkPacketV0View> {
  return requestJson<WorkPacketV0View>(`/work-packets/${encodeURIComponent(packetId)}`);
}

export async function getWorkPackets(): Promise<WorkPacketV0View[]> {
  return requestJson<WorkPacketV0View[]>("/work-packets");
}

export async function getExecutionAttempts(workItemId: string): Promise<ExecutionAttemptView[]> {
  return requestJson<ExecutionAttemptView[]>(`/work-items/${workItemId}/execution-attempts`);
}

export async function getRuntimeEvidenceExport(workItemId: string): Promise<RuntimeEvidenceExportView> {
  return requestJson<RuntimeEvidenceExportView>(`/work-items/${workItemId}/runtime-evidence-export`);
}

export async function getLocalWorktreePlan(workItemId: string): Promise<LocalWorktreePlanView> {
  return requestJson<LocalWorktreePlanView>(`/work-items/${workItemId}/local-worktree-plan`);
}

export async function getWorkItemLowRiskDeliveryPlan(workItemId: string): Promise<LowRiskDeliveryPlanReportView> {
  return requestJson<LowRiskDeliveryPlanReportView>(`/work-items/${workItemId}/low-risk-delivery-plan`);
}

export async function getWorkItemCleanupPlan(workItemId: string): Promise<CleanupPlanView> {
  return requestJson<CleanupPlanView>(`/work-items/${workItemId}/cleanup-plan`);
}

export async function getExecutionRecipes(): Promise<WorkItemExecutionRecipeView[]> {
  return requestJson<WorkItemExecutionRecipeView[]>("/execution-recipes");
}

export async function getRecipeGateAudit(workItemId: string): Promise<WorkItemRecipeGateAuditView> {
  return requestJson<WorkItemRecipeGateAuditView>(`/work-items/${workItemId}/recipe-gate-audit`);
}

export async function getRoutingPreview(workItemId: string): Promise<RoutingPreviewView> {
  return requestJson<RoutingPreviewView>(`/work-items/${workItemId}/routing-preview`);
}

export async function getRoutingLaneProfiles(): Promise<RoutingLaneEvidenceProfileView[]> {
  return requestJson<RoutingLaneEvidenceProfileView[]>("/routing/lane-profiles");
}

export async function createLocalEvidenceExplanation(
  workItemId: string,
  payload: LocalEvidenceExplanationPayload,
): Promise<LocalEvidenceExplanationView> {
  const response = await fetch(`${getSupervisorBaseUrl()}/work-items/${workItemId}/local-evidence-explanation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as
      | { detail?: { error?: { message?: string } } }
      | null;
    throw new Error(errorPayload?.detail?.error?.message ?? "Unable to run the local check.");
  }
  const envelope = (await response.json()) as ApiEnvelope<LocalEvidenceExplanationView>;
  return envelope.data;
}

export async function getExecutionReadinessReport(): Promise<ExecutionReadinessReportView> {
  return requestJson<ExecutionReadinessReportView>("/supervisor/execution-readiness-report");
}

export async function getDocumentationAuthorityReport(): Promise<DocumentationAuthorityReportView> {
  return requestJson<DocumentationAuthorityReportView>("/supervisor/documentation-authority-report");
}

export async function getLegacyPlanningArtifactInventoryReport(): Promise<LegacyPlanningArtifactInventoryReportView> {
  return requestJson<LegacyPlanningArtifactInventoryReportView>("/supervisor/legacy-planning-artifact-inventory");
}

export async function getVerificationReadinessReport(): Promise<VerificationReadinessReportView> {
  return requestJson<VerificationReadinessReportView>("/supervisor/verification-readiness-report");
}

export async function getAuthorityReadinessMatrixReport(): Promise<AuthorityReadinessMatrixReportView> {
  return requestJson<AuthorityReadinessMatrixReportView>("/supervisor/authority-readiness-matrix-report");
}

export async function getDashboardE2EReport(): Promise<DashboardE2EReportView> {
  return requestJson<DashboardE2EReportView>("/supervisor/dashboard-e2e-report");
}

export async function getSupervisorReportCatalog(): Promise<SupervisorReportCatalogView> {
  return requestJson<SupervisorReportCatalogView>("/supervisor/report-catalog");
}

export async function getMaintenanceReadinessReport(): Promise<MaintenanceReadinessReportView> {
  return requestJson<MaintenanceReadinessReportView>("/supervisor/maintenance-readiness-report");
}

export async function getMaintenanceActionPlanReport(): Promise<MaintenanceActionPlanReportView> {
  return requestJson<MaintenanceActionPlanReportView>("/supervisor/maintenance-action-plan-report");
}

export async function getSafeDevelopmentBacklogReport(): Promise<SafeDevelopmentBacklogReportView> {
  return requestJson<SafeDevelopmentBacklogReportView>("/supervisor/safe-development-backlog");
}

export async function getRunnerAssignmentStatusReport(): Promise<RunnerAssignmentStatusReportView> {
  return requestJson<RunnerAssignmentStatusReportView>("/supervisor/runner-assignment-status-report");
}

export async function getDevelopmentRunwayReport(): Promise<DevelopmentRunwayReportView> {
  return requestJson<DevelopmentRunwayReportView>("/supervisor/development-runway-report");
}

export async function getRuntimeEvidenceReviewReport(): Promise<RuntimeEvidenceReviewReportView> {
  return requestJson<RuntimeEvidenceReviewReportView>("/supervisor/runtime-evidence-review-report");
}

export async function getManagedRecipePolicyReport(): Promise<ManagedRecipePolicyReportView> {
  return requestJson<ManagedRecipePolicyReportView>("/supervisor/managed-recipe-policy-report");
}

export async function getGitHubWorkflowPolicyReport(): Promise<GitHubWorkflowPolicyReportView> {
  return requestJson<GitHubWorkflowPolicyReportView>("/supervisor/github-workflow-policy-report");
}

export async function getGitHubDeliveryAuthorityReport(): Promise<GitHubDeliveryAuthorityReportView> {
  return requestJson<GitHubDeliveryAuthorityReportView>("/supervisor/github-delivery-authority-report");
}

export async function getTrustedDeliveryEligibilityReport(): Promise<TrustedDeliveryEligibilityReportView> {
  return requestJson<TrustedDeliveryEligibilityReportView>("/supervisor/trusted-delivery-eligibility-report");
}

export async function getWorkItemTrustedDeliveryEligibilityReport(workItemId: string): Promise<TrustedDeliveryEligibilityReportView> {
  return requestJson<TrustedDeliveryEligibilityReportView>(`/work-items/${workItemId}/trusted-delivery-eligibility-report`);
}

export async function getGitHygieneReport(): Promise<GitHygieneReportView> {
  return requestJson<GitHygieneReportView>("/supervisor/git-hygiene-report");
}

export async function getLocalCleanupReadinessReport(): Promise<LocalCleanupReadinessReportView> {
  return requestJson<LocalCleanupReadinessReportView>("/supervisor/local-cleanup-readiness-report");
}

export async function getRemoteCleanupSyncReadinessReport(): Promise<RemoteCleanupSyncReadinessReportView> {
  return requestJson<RemoteCleanupSyncReadinessReportView>("/supervisor/remote-cleanup-sync-readiness-report");
}

export async function getTrustedAutonomyReadinessReport(): Promise<TrustedAutonomyReadinessReportView> {
  return requestJson<TrustedAutonomyReadinessReportView>("/supervisor/trusted-autonomy-readiness-report");
}

export async function getEpic6CompletionAuditReport(): Promise<EpicCompletionAuditReportView> {
  return requestJson<EpicCompletionAuditReportView>("/supervisor/epic-6-completion-audit-report");
}

export async function getMvpProofTrialReport(): Promise<MvpProofTrialReportView> {
  return requestJson<MvpProofTrialReportView>("/supervisor/epic-6-mvp-proof-trial-report");
}

export async function getCodexReadinessReport(): Promise<CodexReadinessReportView> {
  return requestJson<CodexReadinessReportView>("/supervisor/codex-readiness-report");
}

export async function getCodexImplementationApprovalReport(): Promise<CodexImplementationApprovalReportView> {
  return requestJson<CodexImplementationApprovalReportView>("/supervisor/codex-implementation-approval-report");
}

export async function getClaudeReviewReadinessReport(): Promise<ClaudeReviewReadinessReportView> {
  return requestJson<ClaudeReviewReadinessReportView>("/supervisor/claude-review-readiness-report");
}

export async function getClaudeReviewApprovalReport(): Promise<ClaudeReviewApprovalReportView> {
  return requestJson<ClaudeReviewApprovalReportView>("/supervisor/claude-review-approval-report");
}

export async function getReviewResourcePolicyReport(): Promise<ReviewResourcePolicyReportView> {
  return requestJson<ReviewResourcePolicyReportView>("/supervisor/review-resource-policy-report");
}

export async function getDeliveryReadinessPolicyReport(): Promise<DeliveryReadinessPolicyReportView> {
  return requestJson<DeliveryReadinessPolicyReportView>("/supervisor/delivery-readiness-policy-report");
}

export async function getWorkerRegistry(): Promise<WorkerRegistryEntryView[]> {
  return requestJson<WorkerRegistryEntryView[]>("/routing/worker-registry");
}

export async function getAuditEvents(): Promise<
  Array<{
    id: string;
    workItemId: string;
    reason: string;
    mode: string;
    outcome: string;
    createdAt: string;
  }>
> {
  return requestJson("/audit-events");
}

export async function getSavedOperatorViews(scope?: WorkItemFilterScope): Promise<SavedWorkItemView[]> {
  const query = scope ? `?scope=${encodeURIComponent(scope)}` : "";
  return requestJson<SavedWorkItemView[]>(`/operator-views${query}`);
}

export async function saveOperatorView(payload: SavedWorkItemViewPayload): Promise<SavedWorkItemView> {
  const response = await fetch(`${getSupervisorBaseUrl()}/operator-views`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error("Unable to save operator view.");
  }
  const envelope = (await response.json()) as ApiEnvelope<SavedWorkItemView>;
  return envelope.data;
}

export async function setOperatorViewDefault(viewId: string, isDefault: boolean): Promise<SavedWorkItemView> {
  const response = await fetch(`${getSupervisorBaseUrl()}/operator-views/${viewId}/default`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isDefault }),
  });
  if (!response.ok) {
    throw new Error("Unable to update the default operator view.");
  }
  const envelope = (await response.json()) as ApiEnvelope<SavedWorkItemView>;
  return envelope.data;
}

export async function deleteOperatorView(viewId: string): Promise<void> {
  const response = await fetch(`${getSupervisorBaseUrl()}/operator-views/${viewId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("Unable to delete the operator view.");
  }
}

export async function assignWorkItem(workItemId: string, payload: WorkItemAssignmentPayload): Promise<WorkItemView> {
  const response = await fetch(`${getSupervisorBaseUrl()}/work-items/${workItemId}/assignment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error("Unable to update assignment.");
  }
  const envelope = (await response.json()) as ApiEnvelope<WorkItemView>;
  return envelope.data;
}

export async function prepareRecipeBranch(workItemId: string, payload: WorkItemBranchPreparationPayload): Promise<WorkItemView> {
  const response = await fetch(`${getSupervisorBaseUrl()}/work-items/${workItemId}/prepare-branch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error("Unable to prepare recipe branch.");
  }
  const envelope = (await response.json()) as ApiEnvelope<WorkItemView>;
  return envelope.data;
}

export async function executeManagedNextAction(workItemId: string, payload: WorkItemManagedActionPayload): Promise<WorkItemView> {
  const response = await fetch(`${getSupervisorBaseUrl()}/work-items/${workItemId}/managed-next-action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as
      | { detail?: { error?: { message?: string } } }
      | null;
    throw new Error(errorPayload?.detail?.error?.message ?? "Unable to execute the managed next action.");
  }
  const envelope = (await response.json()) as ApiEnvelope<WorkItemView>;
  return envelope.data;
}
