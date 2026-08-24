export { getWorkPacket, getWorkPacketForWorkItem, getWorkItemMemoryReview, getWorkPackets } from "./pipeline-supervisor-runtime";
import {
  getSupervisorBaseUrl as canonicalGetSupervisorBaseUrl,
  requestSupervisorMutation,
  requestSupervisorJson,
  type SupervisorReadOptions,
} from "./dashboard-supervisor-transport";
import type {
  ApiEnvelope,
  AuditEventView,
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
  PipelineOperationalActionRequestV0,
  PipelineOperationalActionApprovalRequestV0,
  PipelineOperationalActionApprovalV0,
  PipelineOperationalActionResultV0,
  PipelineOperationalActionApprovalRequestV1,
  PipelineOperationalActionApprovalV1,
  PipelineOperationalActionCapabilityV1,
  PipelineOperationalActionRequestV1,
  PipelineOperationalActionResultV1,
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
  VerificationReadinessReportView,
  WorkflowEventView,
  WorkItemView,
  WorkerRegistryEntryView,
  MemoryInboxShellStatusV1,
  MemoryInboxProjectionV1,
  MemoryInboxProposalReaderV1,
  MemoryInboxTextCaptureResultV1,
} from "@kendall/contracts";
import { isMemoryInboxProjectionV1, isMemoryInboxProposalReaderV1, isMemoryInboxShellStatusV1, isMemoryInboxTextCaptureResultV1 } from "@kendall/contracts";

export function getSupervisorBaseUrl(): string {
  return canonicalGetSupervisorBaseUrl();
}

type RequestOptions = SupervisorReadOptions;

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return requestSupervisorJson<T>(path, {
    ...options,
    // Preserve the pre-consolidation server-side LAN-auth guard for every
    // supervisor reader; pipeline runtime opts into the same policy explicitly.
    rejectServerLanAuth: options.rejectServerLanAuth ?? true,
  });
}

export async function getMemoryInboxShellStatus(options?: RequestOptions): Promise<MemoryInboxShellStatusV1> {
  const status = await requestJson<unknown>("/memory-inbox/shell", options);
  if (!isMemoryInboxShellStatusV1(status)) {
    throw new Error("Invalid Memory Inbox shell status.");
  }
  return status;
}

export async function getMemoryInboxProjection(options?: RequestOptions): Promise<MemoryInboxProjectionV1> {
  const projection = await requestJson<unknown>("/memory-inbox/projection", options);
  if (!isMemoryInboxProjectionV1(projection)) throw new Error("Invalid Memory Inbox projection.");
  return projection;
}

export async function getMemoryInboxProposalReader(proposalId: string, revision: number, options?: RequestOptions): Promise<MemoryInboxProposalReaderV1> {
  const reader = await requestJson<unknown>(`/memory-inbox/proposals/${encodeURIComponent(proposalId)}/revisions/${revision}/reader`, options);
  if (!isMemoryInboxProposalReaderV1(reader)) throw new Error("Authenticated Proposal Reader is unavailable.");
  return reader;
}

export type MemoryInboxReviewDecision = {
  proposalId: string; proposalRevision: number; sourceId: string; sourceRevision: number;
  lifecycleState: "Returned" | "Denied"; replayed: boolean; nextSafeAction: "create_draft" | "review_retention";
};

async function decideMemoryInboxProposal(proposalId: string, action: "return" | "deny", expectedRevision: number, idempotencyKey: string, returnContext?: string): Promise<MemoryInboxReviewDecision> {
  const response = await requestSupervisorMutation(`/memory-inbox/proposals/${encodeURIComponent(proposalId)}/${action}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedRevision, idempotencyKey, ...(returnContext === undefined ? {} : { returnContext }) }),
  });
  if (!response.ok) throw new Error("The Proposal decision was not accepted.");
  const envelope = (await response.json()) as ApiEnvelope<MemoryInboxReviewDecision>;
  if (!envelope?.data || typeof envelope.data.proposalId !== "string") throw new Error("The Proposal decision returned an invalid result.");
  return envelope.data;
}

export function returnMemoryInboxProposal(proposalId: string, expectedRevision: number, idempotencyKey: string, returnContext: string): Promise<MemoryInboxReviewDecision> {
  return decideMemoryInboxProposal(proposalId, "return", expectedRevision, idempotencyKey, returnContext);
}

export function denyMemoryInboxProposal(proposalId: string, expectedRevision: number, idempotencyKey: string): Promise<MemoryInboxReviewDecision> {
  return decideMemoryInboxProposal(proposalId, "deny", expectedRevision, idempotencyKey);
}

export type MemoryInboxApproval = { proposalId: string; proposalRevision: number; sourceId: string; sourceRevision: number; deletionOperations: number; replayed: boolean; lifecycleState: "Approved"; deletionState: "Pending"; nextSafeAction: "await_deletion_proof"; };

export async function approveMemoryInboxProposal(proposalId: string, expectedRevision: number, idempotencyKey: string): Promise<MemoryInboxApproval> {
  const response = await requestSupervisorMutation(`/memory-inbox/proposals/${encodeURIComponent(proposalId)}/approve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision, idempotencyKey }) });
  if (!response.ok) throw new Error("The Proposal approval was not accepted.");
  const envelope = (await response.json()) as ApiEnvelope<MemoryInboxApproval>;
  if (!envelope?.data || envelope.data.lifecycleState !== "Approved" || envelope.data.deletionState !== "Pending") throw new Error("The Proposal approval returned an invalid result.");
  return envelope.data;
}

export type MemoryInboxSourceDeletion = { sourceId: string; sourceRevision: number; deletionOperations: number; initiator: "operator" | "retention_expiry" | "retry"; replayed: boolean; lifecycleState: "DeletePending"; deletionState: "Pending" | "RetryNeeded"; nextSafeAction: "await_deletion_proof" | "retry_deletion"; };

export async function deleteMemoryInboxSource(sourceId: string, expectedRevision: number, idempotencyKey: string): Promise<MemoryInboxSourceDeletion> {
  const response = await requestSupervisorMutation(`/memory-inbox/sources/${encodeURIComponent(sourceId)}/delete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision, idempotencyKey }) });
  if (!response.ok) throw new Error("Memory Inbox source deletion was not accepted.");
  const envelope = (await response.json()) as ApiEnvelope<MemoryInboxSourceDeletion>;
  if (!envelope?.data || envelope.data.lifecycleState !== "DeletePending") throw new Error("Memory Inbox source deletion returned an invalid result.");
  return envelope.data;
}

export async function retryMemoryInboxSourceDeletion(sourceId: string, expectedRevision: number, idempotencyKey: string): Promise<MemoryInboxSourceDeletion> {
  const response = await requestSupervisorMutation(`/memory-inbox/sources/${encodeURIComponent(sourceId)}/retry-deletion`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision, idempotencyKey }) });
  if (!response.ok) throw new Error("Memory Inbox deletion retry was not accepted.");
  const envelope = (await response.json()) as ApiEnvelope<MemoryInboxSourceDeletion>;
  if (!envelope?.data || envelope.data.initiator !== "retry") throw new Error("Memory Inbox deletion retry returned an invalid result.");
  return envelope.data;
}

export type MemoryInboxRetentionExtension = { sourceId: string; sourceRevision: number; retentionDeadlineAt: string; replayed: boolean; nextSafeAction: "refresh_memory_inbox"; };

export async function extendMemoryInboxRetention(sourceId: string, expectedRevision: number, extensionHours: number, idempotencyKey: string): Promise<MemoryInboxRetentionExtension> {
  const response = await requestSupervisorMutation(`/memory-inbox/sources/${encodeURIComponent(sourceId)}/retention-extension`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision, extensionHours, idempotencyKey }) });
  if (!response.ok) throw new Error("Memory Inbox retention extension was not accepted.");
  const envelope = (await response.json()) as ApiEnvelope<MemoryInboxRetentionExtension>;
  if (!envelope?.data || typeof envelope.data.retentionDeadlineAt !== "string") throw new Error("Memory Inbox retention extension returned an invalid result.");
  return envelope.data;
}

export async function captureMemoryInboxText(text: string, acknowledgedNonSensitive: boolean, idempotencyKey: string): Promise<MemoryInboxTextCaptureResultV1> {
  const response = await requestSupervisorMutation("/memory-inbox/text-capture", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, acknowledgedNonSensitive, idempotencyKey }),
  });
  if (!response.ok) throw new Error("Text capture was not accepted. Check the acknowledgement and try again.");
  const envelope = (await response.json()) as ApiEnvelope<unknown>;
  if (!isMemoryInboxTextCaptureResultV1(envelope?.data)) throw new Error("Text capture returned an invalid result.");
  return envelope.data;
}

export async function saveMemoryInboxDraft(sourceId: string, expectedRevision: number, idempotencyKey: string): Promise<void> {
  const response = await requestSupervisorMutation(`/memory-inbox/sources/${encodeURIComponent(sourceId)}/lifecycle`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedRevision, idempotencyKey, targetState: "Draft" }),
  });
  if (!response.ok) throw new Error("This source cannot be saved as a draft in its current state.");
  const envelope = (await response.json()) as ApiEnvelope<unknown>;
  if (!envelope?.data) throw new Error("Draft transition returned an invalid result.");
}

export async function getRunStatus(options?: RequestOptions): Promise<RunStatusView> {
  return requestJson<RunStatusView>("/supervisor/status", options);
}

export async function getWorkItems(options?: RequestOptions): Promise<WorkItemView[]> {
  return requestJson<WorkItemView[]>("/work-items", options);
}

export async function getCandidateWork(options?: RequestOptions): Promise<CandidateWorkView[]> {
  return requestJson<CandidateWorkView[]>("/candidate-work", options);
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
  const response = await requestSupervisorMutation(`/candidate-work/${candidateWorkId}`, {
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
  const response = await requestSupervisorMutation(`/candidate-work/${candidateWorkId}/promote`, {
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

export async function getWorkItem(id: string, options?: RequestOptions): Promise<WorkItemView> {
  return requestJson<WorkItemView>(`/work-items/${id}`, options);
}

export async function getWorkItemEvents(id: string, options?: RequestOptions): Promise<WorkflowEventView[]> {
  return requestJson<WorkflowEventView[]>(`/work-items/${id}/events`, options);
}

export async function applyPipelineOperationalAction(
  payload: PipelineOperationalActionRequestV0,
): Promise<PipelineOperationalActionResultV0> {
  const response = await fetch(`${getSupervisorBaseUrl()}/pipeline-control-plane/actions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const envelope = (await response.json()) as ApiEnvelope<PipelineOperationalActionResultV0>;
  if (!response.ok || !envelope.data) {
    const detail = envelope as ApiEnvelope<unknown> & { detail?: { error?: { message?: string } } };
    throw new Error(detail.detail?.error?.message ?? `Operational action failed: ${response.status}`);
  }
  return envelope.data;
}

export async function issuePipelineOperationalApproval(
  payload: PipelineOperationalActionApprovalRequestV0,
): Promise<PipelineOperationalActionApprovalV0> {
  const response = await fetch(`${getSupervisorBaseUrl()}/pipeline-control-plane/approvals`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const envelope = (await response.json()) as ApiEnvelope<PipelineOperationalActionApprovalV0>;
  if (!response.ok || !envelope.data) {
    const detail = envelope as ApiEnvelope<unknown> & { detail?: { error?: { message?: string } } };
    throw new Error(detail.detail?.error?.message ?? `Operational approval failed: ${response.status}`);
  }
  return envelope.data;
}

export async function applyPipelineOperationalActionV1(
  payload: PipelineOperationalActionRequestV1,
): Promise<PipelineOperationalActionResultV1> {
  const response = await requestSupervisorMutation("/pipeline-control-plane/actions/v1", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const envelope = (await response.json()) as ApiEnvelope<PipelineOperationalActionResultV1>;
  if (!response.ok || !envelope.data) {
    const detail = envelope as ApiEnvelope<unknown> & { detail?: { error?: { message?: string } } };
    throw new Error(detail.detail?.error?.message ?? `Operational v1 action failed: ${response.status}`);
  }
  return envelope.data;
}

export async function issuePipelineOperationalApprovalV1(
  payload: PipelineOperationalActionApprovalRequestV1,
): Promise<PipelineOperationalActionApprovalV1> {
  const response = await requestSupervisorMutation("/pipeline-control-plane/approvals/v1", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const envelope = (await response.json()) as ApiEnvelope<PipelineOperationalActionApprovalV1>;
  if (!response.ok || !envelope.data) {
    const detail = envelope as ApiEnvelope<unknown> & { detail?: { error?: { message?: string } } };
    throw new Error(detail.detail?.error?.message ?? `Operational v1 approval failed: ${response.status}`);
  }
  return envelope.data;
}

export async function requestPipelineOperationalCapabilityV1(
  payload: PipelineOperationalActionApprovalRequestV1,
): Promise<PipelineOperationalActionCapabilityV1> {
  const response = await requestSupervisorMutation("/pipeline-control-plane/actions/v1/capability", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const envelope = (await response.json()) as ApiEnvelope<PipelineOperationalActionCapabilityV1>;
  if (!response.ok || !envelope.data) {
    const detail = envelope as ApiEnvelope<unknown> & { detail?: { error?: { message?: string } } };
    throw new Error(detail.detail?.error?.message ?? `Operational v1 capability failed: ${response.status}`);
  }
  return envelope.data;
}

export async function getExecutionAttempts(workItemId: string, options?: RequestOptions): Promise<ExecutionAttemptView[]> {
  return requestJson<ExecutionAttemptView[]>(`/work-items/${workItemId}/execution-attempts`, options);
}

export async function getRuntimeEvidenceExport(workItemId: string, options?: RequestOptions): Promise<RuntimeEvidenceExportView> {
  return requestJson<RuntimeEvidenceExportView>(`/work-items/${workItemId}/runtime-evidence-export`, options);
}

export async function getLocalWorktreePlan(workItemId: string, options?: RequestOptions): Promise<LocalWorktreePlanView> {
  return requestJson<LocalWorktreePlanView>(`/work-items/${workItemId}/local-worktree-plan`, options);
}

export async function getWorkItemLowRiskDeliveryPlan(workItemId: string, options?: RequestOptions): Promise<LowRiskDeliveryPlanReportView> {
  return requestJson<LowRiskDeliveryPlanReportView>(`/work-items/${workItemId}/low-risk-delivery-plan`, options);
}

export async function getWorkItemCleanupPlan(workItemId: string, options?: RequestOptions): Promise<CleanupPlanView> {
  return requestJson<CleanupPlanView>(`/work-items/${workItemId}/cleanup-plan`, options);
}

export async function getExecutionRecipes(options?: RequestOptions): Promise<WorkItemExecutionRecipeView[]> {
  return requestJson<WorkItemExecutionRecipeView[]>("/execution-recipes", options);
}

export async function getRecipeGateAudit(workItemId: string, options?: RequestOptions): Promise<WorkItemRecipeGateAuditView> {
  return requestJson<WorkItemRecipeGateAuditView>(`/work-items/${workItemId}/recipe-gate-audit`, options);
}

export async function getRoutingPreview(workItemId: string, options?: RequestOptions): Promise<RoutingPreviewView> {
  return requestJson<RoutingPreviewView>(`/work-items/${workItemId}/routing-preview`, options);
}

export async function getRoutingLaneProfiles(options?: RequestOptions): Promise<RoutingLaneEvidenceProfileView[]> {
  return requestJson<RoutingLaneEvidenceProfileView[]>("/routing/lane-profiles", options);
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

export async function getExecutionReadinessReport(options?: RequestOptions): Promise<ExecutionReadinessReportView> {
  return requestJson<ExecutionReadinessReportView>("/supervisor/execution-readiness-report", options);
}

export async function getDocumentationAuthorityReport(options?: RequestOptions): Promise<DocumentationAuthorityReportView> {
  return requestJson<DocumentationAuthorityReportView>("/supervisor/documentation-authority-report", options);
}

export async function getLegacyPlanningArtifactInventoryReport(options?: RequestOptions): Promise<LegacyPlanningArtifactInventoryReportView> {
  return requestJson<LegacyPlanningArtifactInventoryReportView>("/supervisor/legacy-planning-artifact-inventory", options);
}

export async function getVerificationReadinessReport(options?: RequestOptions): Promise<VerificationReadinessReportView> {
  return requestJson<VerificationReadinessReportView>("/supervisor/verification-readiness-report", options);
}

export async function getAuthorityReadinessMatrixReport(options?: RequestOptions): Promise<AuthorityReadinessMatrixReportView> {
  return requestJson<AuthorityReadinessMatrixReportView>("/supervisor/authority-readiness-matrix-report", options);
}

export async function getDashboardE2EReport(options?: RequestOptions): Promise<DashboardE2EReportView> {
  return requestJson<DashboardE2EReportView>("/supervisor/dashboard-e2e-report", options);
}

export async function getSupervisorReportCatalog(options?: RequestOptions): Promise<SupervisorReportCatalogView> {
  return requestJson<SupervisorReportCatalogView>("/supervisor/report-catalog", options);
}

export async function getMaintenanceReadinessReport(options?: RequestOptions): Promise<MaintenanceReadinessReportView> {
  return requestJson<MaintenanceReadinessReportView>("/supervisor/maintenance-readiness-report", options);
}

export async function getMaintenanceActionPlanReport(options?: RequestOptions): Promise<MaintenanceActionPlanReportView> {
  return requestJson<MaintenanceActionPlanReportView>("/supervisor/maintenance-action-plan-report", options);
}

export async function getSafeDevelopmentBacklogReport(options?: RequestOptions): Promise<SafeDevelopmentBacklogReportView> {
  return requestJson<SafeDevelopmentBacklogReportView>("/supervisor/safe-development-backlog", options);
}

export async function getRunnerAssignmentStatusReport(options?: RequestOptions): Promise<RunnerAssignmentStatusReportView> {
  return requestJson<RunnerAssignmentStatusReportView>("/supervisor/runner-assignment-status-report", options);
}

export async function getDevelopmentRunwayReport(options?: RequestOptions): Promise<DevelopmentRunwayReportView> {
  return requestJson<DevelopmentRunwayReportView>("/supervisor/development-runway-report", options);
}

export async function getRuntimeEvidenceReviewReport(options?: RequestOptions): Promise<RuntimeEvidenceReviewReportView> {
  return requestJson<RuntimeEvidenceReviewReportView>("/supervisor/runtime-evidence-review-report", options);
}

export async function getManagedRecipePolicyReport(options?: RequestOptions): Promise<ManagedRecipePolicyReportView> {
  return requestJson<ManagedRecipePolicyReportView>("/supervisor/managed-recipe-policy-report", options);
}

export async function getGitHubWorkflowPolicyReport(options?: RequestOptions): Promise<GitHubWorkflowPolicyReportView> {
  return requestJson<GitHubWorkflowPolicyReportView>("/supervisor/github-workflow-policy-report", options);
}

export async function getGitHubDeliveryAuthorityReport(options?: RequestOptions): Promise<GitHubDeliveryAuthorityReportView> {
  return requestJson<GitHubDeliveryAuthorityReportView>("/supervisor/github-delivery-authority-report", options);
}

export async function getTrustedDeliveryEligibilityReport(options?: RequestOptions): Promise<TrustedDeliveryEligibilityReportView> {
  return requestJson<TrustedDeliveryEligibilityReportView>("/supervisor/trusted-delivery-eligibility-report", options);
}

export async function getWorkItemTrustedDeliveryEligibilityReport(workItemId: string, options?: RequestOptions): Promise<TrustedDeliveryEligibilityReportView> {
  return requestJson<TrustedDeliveryEligibilityReportView>(`/work-items/${workItemId}/trusted-delivery-eligibility-report`, options);
}

export async function getGitHygieneReport(options?: RequestOptions): Promise<GitHygieneReportView> {
  return requestJson<GitHygieneReportView>("/supervisor/git-hygiene-report", options);
}

export async function getLocalCleanupReadinessReport(options?: RequestOptions): Promise<LocalCleanupReadinessReportView> {
  return requestJson<LocalCleanupReadinessReportView>("/supervisor/local-cleanup-readiness-report", options);
}

export async function getRemoteCleanupSyncReadinessReport(options?: RequestOptions): Promise<RemoteCleanupSyncReadinessReportView> {
  return requestJson<RemoteCleanupSyncReadinessReportView>("/supervisor/remote-cleanup-sync-readiness-report", options);
}

export async function getTrustedAutonomyReadinessReport(options?: RequestOptions): Promise<TrustedAutonomyReadinessReportView> {
  return requestJson<TrustedAutonomyReadinessReportView>("/supervisor/trusted-autonomy-readiness-report", options);
}

export async function getMvpProofTrialReport(options?: RequestOptions): Promise<MvpProofTrialReportView> {
  return requestJson<MvpProofTrialReportView>("/supervisor/epic-6-mvp-proof-trial-report", options);
}

export async function getCodexReadinessReport(options?: RequestOptions): Promise<CodexReadinessReportView> {
  return requestJson<CodexReadinessReportView>("/supervisor/codex-readiness-report", options);
}

export async function getCodexImplementationApprovalReport(options?: RequestOptions): Promise<CodexImplementationApprovalReportView> {
  return requestJson<CodexImplementationApprovalReportView>("/supervisor/codex-implementation-approval-report", options);
}

export async function getClaudeReviewReadinessReport(options?: RequestOptions): Promise<ClaudeReviewReadinessReportView> {
  return requestJson<ClaudeReviewReadinessReportView>("/supervisor/claude-review-readiness-report", options);
}

export async function getClaudeReviewApprovalReport(options?: RequestOptions): Promise<ClaudeReviewApprovalReportView> {
  return requestJson<ClaudeReviewApprovalReportView>("/supervisor/claude-review-approval-report", options);
}

export async function getReviewResourcePolicyReport(options?: RequestOptions): Promise<ReviewResourcePolicyReportView> {
  return requestJson<ReviewResourcePolicyReportView>("/supervisor/review-resource-policy-report", options);
}

export async function getDeliveryReadinessPolicyReport(options?: RequestOptions): Promise<DeliveryReadinessPolicyReportView> {
  return requestJson<DeliveryReadinessPolicyReportView>("/supervisor/delivery-readiness-policy-report", options);
}

export async function getWorkerRegistry(options?: RequestOptions): Promise<WorkerRegistryEntryView[]> {
  return requestJson<WorkerRegistryEntryView[]>("/routing/worker-registry", options);
}

export async function getAuditEvents(options?: RequestOptions): Promise<
  AuditEventView[]
> {
  return requestJson<AuditEventView[]>("/audit-events", options);
}

export async function getSavedOperatorViews(scope?: WorkItemFilterScope, options?: RequestOptions): Promise<SavedWorkItemView[]> {
  const query = scope ? `?scope=${encodeURIComponent(scope)}` : "";
  return requestJson<SavedWorkItemView[]>(`/operator-views${query}`, options);
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
