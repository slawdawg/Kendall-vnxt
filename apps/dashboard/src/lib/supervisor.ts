import {
  AUTHORITATIVE_PACKET_STAGES,
  isPipelineCanonicalContractV1,
  isPipelineProductModeMappingV0,
} from "@kendall/contracts";
import {
  getPipelineDashboardProjection as getRuntimePipelineDashboardProjection,
} from "./pipeline-supervisor-runtime";
export { getWorkPacket, getWorkPackets } from "./pipeline-supervisor-runtime";
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
  PipelineDashboardProjectionV0,
  PipelineOperationalActionRequestV0,
  PipelineOperationalActionApprovalRequestV0,
  PipelineOperationalActionApprovalV0,
  PipelineOperationalActionResultV0,
  PipelineOperationalActionApprovalRequestV1,
  PipelineOperationalActionApprovalV1,
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
  WorkPacketLearnFollowUpCandidateWorkPayload,
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

  if (window.location.protocol === "https:") {
    return `${window.location.origin}/api/supervisor`;
  }

  if (!configuredPublicBaseUrl) {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }

  return configuredPublicBaseUrl;
}

async function requestJson<T>(path: string): Promise<T> {
  if (typeof window === "undefined" && process.env.KENDALL_LAN_AUTH_ENABLED === "true") {
    throw new Error("LAN-auth supervisor reads require the authenticated UDS boundary.");
  }
  const baseUrl = typeof window === "undefined" ? internalBaseUrl : getSupervisorBaseUrl();
  const response = await fetch(`${baseUrl}${path}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Request failed for ${path} (${response.status})`);
  }
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!payload || !("data" in payload)) {
    throw new Error(`Malformed response for ${path}`);
  }
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

export async function createLearnFollowUpCandidateWork(
  packetId: string,
  payload: WorkPacketLearnFollowUpCandidateWorkPayload,
): Promise<CandidateWorkView> {
  const response = await fetch(`${getSupervisorBaseUrl()}/work-packets/${encodeURIComponent(packetId)}/learn-follow-up-candidate-work`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to create Learn follow-up Candidate Work: ${response.status}`);
  }
  const envelope = (await response.json()) as ApiEnvelope<CandidateWorkView>;
  return envelope.data;
}

export async function getPipelineDashboardProjection(): Promise<PipelineDashboardProjectionV0> {
  const projection = normalizePipelineDashboardProjection(
    await getRuntimePipelineDashboardProjection(),
  );
  if (!isPipelineDashboardProjection(projection)) {
    throw new Error("Invalid projection payload");
  }
  return projection;
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
  const response = await fetch(`${getSupervisorBaseUrl()}/pipeline-control-plane/actions/v1`, {
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
  const response = await fetch(`${getSupervisorBaseUrl()}/pipeline-control-plane/approvals/v1`, {
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

function normalizePipelineDashboardProjection(projection: Partial<PipelineDashboardProjectionV0>): Partial<PipelineDashboardProjectionV0> {
  if (!projection || typeof projection !== "object") {
    return projection;
  }
  const sourceStatesCurrent = "sourceStates" in projection;
  const queueSummaryCurrent = !projection.queueSummary || (
    "activeCount" in projection.queueSummary &&
    "gatedCount" in projection.queueSummary &&
    "staleCount" in projection.queueSummary &&
    "refillingCount" in projection.queueSummary &&
    "unknownCount" in projection.queueSummary
  );
  const managerSummaryCurrent = !projection.managerSummary || (
    "reliabilityState" in projection.managerSummary &&
    "evidenceRefs" in projection.managerSummary &&
    "healthySourceCount" in projection.managerSummary &&
    "unknownSourceCount" in projection.managerSummary
  );
  const requiredWorkerSummaryFields = [
    "stateSource",
    "freshnessState",
    "warmCount",
    "activeCount",
    "waitingCount",
    "stalledCount",
    "failedCount",
    "drainingCount",
    "killedCount",
    "completeCount",
    "unavailableCount",
    "unknownCount",
    "workerRefs",
    "evidenceRefs",
    "summary",
    "metadataOnly",
  ];
  const workerSummaryCurrent = Boolean(
    projection.workerSummary &&
    requiredWorkerSummaryFields.every((field) => field in projection.workerSummary!),
  );
  const reliabilityProblemsCurrent = "reliabilityProblems" in projection;
  const gatedControlsCurrent = "gatedControls" in projection;
  if (
    sourceStatesCurrent &&
    queueSummaryCurrent &&
    managerSummaryCurrent &&
    workerSummaryCurrent &&
    reliabilityProblemsCurrent &&
    gatedControlsCurrent
  ) {
    return projection;
  }
  const queueSummary = projection.queueSummary && !queueSummaryCurrent
    ? {
        ...projection.queueSummary,
        activeCount: projection.queueSummary.activeCount ?? null,
        gatedCount: projection.queueSummary.gatedCount ?? null,
        staleCount: projection.queueSummary.staleCount ?? null,
        refillingCount: projection.queueSummary.refillingCount ?? null,
        unknownCount: projection.queueSummary.unknownCount ?? null,
      }
    : projection.queueSummary;
  const managerSummary = projection.managerSummary && !managerSummaryCurrent
    ? {
        ...projection.managerSummary,
        reliabilityState: managerReliabilityStates.has(projection.managerSummary.reliabilityState as string)
          ? projection.managerSummary.reliabilityState
          : projection.managerSummary.inactivityReason === "source_exhausted" || projection.managerSummary.sourceExhausted
            ? "source_exhausted"
            : projection.managerSummary.inactivityReason === "backend_unavailable"
              ? "unavailable"
              : "unknown",
        healthySourceCount: projection.managerSummary.healthySourceCount ?? null,
        exhaustedSourceCount: projection.managerSummary.exhaustedSourceCount ?? null,
        blockedSourceCount: projection.managerSummary.blockedSourceCount ?? null,
        gatedSourceCount: projection.managerSummary.gatedSourceCount ?? null,
        staleSourceCount: projection.managerSummary.staleSourceCount ?? null,
        unavailableSourceCount: projection.managerSummary.unavailableSourceCount ?? null,
        refillingSourceCount: projection.managerSummary.refillingSourceCount ?? null,
        unknownSourceCount: projection.managerSummary.unknownSourceCount ?? null,
        evidenceRefs: Array.isArray(projection.managerSummary.evidenceRefs) ? projection.managerSummary.evidenceRefs : [],
      }
    : projection.managerSummary;
  const workerSummary = projection.workerSummary && !workerSummaryCurrent
    ? {
        ...projection.workerSummary,
        stateSource: projection.workerSummary.stateSource ?? "unknown",
        freshnessState: projection.workerSummary.freshnessState ?? "unknown",
        warmCount: projection.workerSummary.warmCount ?? null,
        activeCount: projection.workerSummary.activeCount ?? null,
        waitingCount: projection.workerSummary.waitingCount ?? null,
        stalledCount: projection.workerSummary.stalledCount ?? null,
        failedCount: projection.workerSummary.failedCount ?? null,
        drainingCount: projection.workerSummary.drainingCount ?? null,
        killedCount: projection.workerSummary.killedCount ?? null,
        completeCount: projection.workerSummary.completeCount ?? null,
        unavailableCount: projection.workerSummary.unavailableCount ?? null,
        unknownCount: projection.workerSummary.unknownCount ?? null,
        workerRefs: Array.isArray(projection.workerSummary.workerRefs) ? projection.workerSummary.workerRefs : [],
        evidenceRefs: Array.isArray(projection.workerSummary.evidenceRefs) ? projection.workerSummary.evidenceRefs : [],
        summary: typeof projection.workerSummary.summary === "string"
          ? projection.workerSummary.summary
          : "Worker runtime state is not connected to the supervisor projection.",
        metadataOnly: projection.workerSummary.metadataOnly === undefined ? true : projection.workerSummary.metadataOnly,
      }
    : projection.workerSummary ?? {
        stateSource: projection.backendReachability?.state === "unavailable" ? "unavailable" : "unknown",
        freshnessState: projection.backendReachability?.state === "unavailable" ? "unavailable" : "unknown",
        warmCount: null,
        activeCount: null,
        waitingCount: null,
        stalledCount: null,
        failedCount: null,
        drainingCount: null,
        killedCount: null,
        completeCount: null,
        unavailableCount: null,
        unknownCount: null,
        workerRefs: [],
        evidenceRefs: [],
        summary: projection.backendReachability?.state === "unavailable"
          ? "Worker runtime state is unavailable because backend projection failed."
          : "Worker runtime state is not connected to the supervisor projection.",
        metadataOnly: true,
      };
  return {
    ...projection,
    managerSummary,
    workerSummary,
    queueSummary,
    sourceStates: sourceStatesCurrent ? projection.sourceStates : [],
    reliabilityProblems: reliabilityProblemsCurrent ? projection.reliabilityProblems : [],
    gatedControls: gatedControlsCurrent ? projection.gatedControls : [],
  };
}

function isPipelineDashboardProjection(value: unknown): value is PipelineDashboardProjectionV0 {
  if (!value || typeof value !== "object") {
    return false;
  }
  const projection = value as Partial<PipelineDashboardProjectionV0>;
  return (
    projection.schemaVersion === "pipeline-dashboard-projection/v0" &&
    typeof projection.projectionId === "string" &&
    isTimestampString(projection.generatedAt) &&
    typeof projection.sourceLabel === "string" &&
    typeof projection.freshnessState === "string" &&
    isTimestampString(projection.sourceUpdatedAt) &&
    typeof projection.staleAfterSeconds === "number" &&
    Number.isFinite(projection.staleAfterSeconds) &&
    projection.staleAfterSeconds > 0 &&
    isProjectionSourceLabel(projection.sourceLabel) &&
    isProjectionFreshnessState(projection.freshnessState) &&
    isBackendReachability(projection.backendReachability) &&
    isFixtureMode(projection.fixtureMode) &&
    isTruthSummary(projection.truthSummary) &&
    isManagerSummary(projection.managerSummary) &&
    isWorkerSummary(projection.workerSummary) &&
    Array.isArray(projection.reliabilityProblems) &&
    projection.reliabilityProblems.every(isReliabilityProblem) &&
    Array.isArray(projection.gatedControls) &&
    projection.gatedControls.every(isGatedControl) &&
    isExecuteAdmission(projection.executeAdmission) &&
    isQueueSummary(projection.queueSummary) &&
    isProjectionFreshnessConsistent(projection) &&
    isProjectionFixtureTruthConsistent(projection) &&
    isProjectionSourceExhaustionConsistent(projection) &&
    isProjectionBackendReachabilityConsistent(projection) &&
    isProjectionManagerReliabilityConsistent(projection) &&
    isProjectionReliabilityProblemsConsistent(projection) &&
    (projection.sourceLabel !== "live" || isLiveProjectionRenderable(projection)) &&
    Array.isArray(projection.sourceStates) &&
    projection.sourceStates.every(isProjectionSourceState) &&
    Array.isArray(projection.workPackets) &&
    projection.workPackets.every(isProjectionWorkPacket) &&
    Array.isArray(projection.stageSummaries) &&
    projection.stageSummaries.every(isProjectionStageSummary) &&
    hasExactlyOneStageSummaryPerStage(projection.stageSummaries) &&
    Array.isArray(projection.selectedPacketDetails) &&
    projection.selectedPacketDetails.every(isProjectionSelectedPacketDetail) &&
    selectedPacketDetailsMatchWorkPackets(projection.workPackets, projection.selectedPacketDetails) &&
    Array.isArray(projection.evidenceRefs) &&
    projection.evidenceRefs.every(isSafeEvidenceRef)
  );
}

const projectionSourceLabels = new Set(["live", "stale", "fixture", "simulated", "dry_run", "unavailable", "unknown"]);
const projectionFreshnessStates = new Set(["live", "stale", "unavailable", "unknown"]);
const backendReachabilityStates = new Set(["reachable", "unavailable", "unknown"]);
const managerStateSources = new Set(["supervisor_projection", "manager_summary", "unavailable", "unknown"]);
const projectionStatuses = new Set(["active", "waiting", "blocked", "failed", "complete", "deferred"]);
const projectionStages = new Set<string>(AUTHORITATIVE_PACKET_STAGES);
const projectionSourceTypes = new Set(["prd", "bmad_story", "operator_input", "workflow", "repo_doc"]);
const managerReliabilityStates = new Set([
  "ready",
  "running",
  "healthy_idle",
  "source_exhausted",
  "waiting_for_approval",
  "blocked",
  "refilling",
  "degraded",
  "unavailable",
  "unknown",
]);
const projectionSourceKinds = new Set([
  "prd",
  "bmad_story",
  "operator_input",
  "workflow",
  "repo_doc",
  "candidate_work",
  "work_item",
  "bmad_artifact",
  "obsidian",
  "llm_wiki",
  "github",
  "research",
  "manual",
  "unknown",
]);
const projectionSourceStates = new Set(["healthy", "exhausted", "blocked", "gated", "stale", "unavailable", "refilling", "unknown"]);
const reliabilityProblemKinds = new Set([
  "idle_with_ready_work",
  "stalled_worker",
  "stale_projection",
  "backend_unavailable",
  "source_blocked",
  "approval_required",
  "usage_limited",
  "resource_limited",
  "unknown",
]);
const reliabilityProblemSeverities = new Set(["info", "attention", "blocked"]);
const reliabilityProblemLikelyIssues = new Set(["manager", "worker", "source", "approval", "usage", "resource", "unknown"]);
const gatedControlOperations = new Set([
  "kill_worker",
  "drain_worker",
  "cleanup_workspace",
  "takeover_workspace",
  "provider_call",
  "github_mutation",
  "worker_launch",
  "lease_mutation",
  "source_mutation",
  "terminal_access",
  "raw_payload_retention",
  "unknown",
]);
const gatedControlStatuses = new Set(["gated", "action_needed", "blocked"]);
const unsafeEvidenceRefPattern =
  /\b(raw[\s_-]*(prompts?|completions?|transcripts?)|reasoning[\s_-]*traces?|provider[\s_-]*payloads?|secrets?([\s_-]*(key|token|value|id))?|credentials?([\s_-]*(key|token|value|id))?|(terminal|tmux|pane)[\s_-]*(scrollbacks?|texts?|outputs?|stdouts?|stderrs?))\b/i;
const executableControlTextPattern =
  /\b(tmux\s+(kill|send|capture|new|attach)|git(hub)?\s+(push|merge|checkout|reset|clean|branch|pr)|gh\s+(pr|repo|api)|curl\s+|bash\s+|sh\s+|python\s+|node\s+|pnpm\s+|uv\s+run|provider\s+(call|request|payload))\b/i;
const gatedControlAllowedKeys = new Set([
  "controlId",
  "operation",
  "status",
  "authorityFamily",
  "stopLine",
  "nextAction",
  "packetId",
  "workerRefs",
  "evidenceRefs",
  "metadataOnly",
]);
const projectionEmptyReasons = new Set([
  "healthy_empty",
  "source_exhausted",
  "blocked",
  "refilling",
  "usage_limited",
  "resource_limited",
  "cleanup_gated",
  "approval_required",
  "failure_budget_hit",
  "backend_unavailable",
  "projection_stale",
  "unknown",
]);

function isProjectionSourceLabel(value: unknown) {
  return typeof value === "string" && projectionSourceLabels.has(value);
}

function isProjectionFreshnessState(value: unknown) {
  return typeof value === "string" && projectionFreshnessStates.has(value);
}

function isBackendReachabilityState(value: unknown) {
  return typeof value === "string" && backendReachabilityStates.has(value);
}

function isManagerStateSource(value: unknown) {
  return typeof value === "string" && managerStateSources.has(value);
}

function isProjectionStatus(value: unknown) {
  return typeof value === "string" && projectionStatuses.has(value);
}

function isProjectionStage(value: unknown) {
  return typeof value === "string" && projectionStages.has(value);
}

function isNullableCount(value: unknown) {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function isSafeEvidenceRef(value: unknown) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 255 &&
    !unsafeEvidenceRefPattern.test(value)
  );
}

function isSafeWorkerRef(value: unknown) {
  return typeof value === "string" && isSafeEvidenceRef(value) && value.startsWith("worker:");
}

function isSafeProjectionText(value: unknown) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 500 &&
    !unsafeEvidenceRefPattern.test(value) &&
    !executableControlTextPattern.test(value)
  );
}

function isProjectionReadyToTest(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const ready = value as NonNullable<PipelineDashboardProjectionV0["workPackets"][number]["readyToTest"]>;
  return (
    typeof ready.readyId === "string" &&
    typeof ready.userFacingSummary === "string" &&
    typeof ready.testableSurface === "string" &&
    Array.isArray(ready.verificationRefs) &&
    ready.verificationRefs.every(isSafeEvidenceRef) &&
    Array.isArray(ready.evidenceRefs) &&
    ready.evidenceRefs.every(isSafeEvidenceRef) &&
    ready.metadataOnly === true &&
    ready.rawPayloadRetained === false
  );
}

function isTimestampString(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isProjectionFreshnessConsistent(projection: Partial<PipelineDashboardProjectionV0>) {
  const generatedAt = projection.generatedAt;
  const sourceUpdatedAt = projection.sourceUpdatedAt;
  const staleAfterSeconds = projection.staleAfterSeconds;
  if (
    !isTimestampString(generatedAt) ||
    !isTimestampString(sourceUpdatedAt) ||
    typeof staleAfterSeconds !== "number" ||
    !Number.isFinite(staleAfterSeconds)
  ) {
    return false;
  }
  const ageMs = Date.parse(generatedAt) - Date.parse(sourceUpdatedAt);
  return projection.freshnessState !== "live" || (ageMs >= 0 && (ageMs <= staleAfterSeconds * 1000 || projectionHasOpenPacket(projection)));
}

function isLiveProjectionRenderable(projection: Partial<PipelineDashboardProjectionV0>) {
  if (!Array.isArray(projection.workPackets)) {
    return false;
  }
  return projectionHasOpenPacket(projection) || (
    projection.workPackets.length === 0 &&
    projection.truthSummary?.backendEmpty === true &&
    ["healthy_empty", "blocked", "refilling"].includes(projection.truthSummary.emptyReason || "") &&
    (!["blocked", "refilling"].includes(projection.truthSummary.emptyReason || "") || projection.queueSummary?.emptyReason === projection.truthSummary.emptyReason)
  ) || (
    projection.workPackets.length === 0 &&
    projection.truthSummary?.backendEmpty === true &&
    projection.truthSummary.emptyReason === "source_exhausted" &&
    projection.queueSummary?.sourceExhausted === true &&
    projection.queueSummary.emptyReason === "source_exhausted"
  ) || (
    projection.workPackets.length > 0 &&
    projection.queueSummary?.sourceExhausted === true &&
    projection.queueSummary.emptyReason === "source_exhausted"
  );
}

function projectionHasOpenPacket(projection: Partial<PipelineDashboardProjectionV0>) {
  return Array.isArray(projection.workPackets) && projection.workPackets.some((candidate) => (
    candidate &&
    typeof candidate === "object" &&
    ["active", "waiting", "blocked", "failed"].includes((candidate as { status?: string }).status || "")
  ));
}

function isProjectionFixtureTruthConsistent(projection: Partial<PipelineDashboardProjectionV0>) {
  if (!projection.fixtureMode?.enabled) {
    return true;
  }
  return (
    projection.sourceLabel !== "live" &&
    projection.truthSummary?.label !== "live" &&
    projection.truthSummary?.fixtureBacked === true &&
    projection.fixtureMode.canSatisfyLiveProof === false
  );
}

function isProjectionSourceExhaustionConsistent(projection: Partial<PipelineDashboardProjectionV0>) {
  const sourceExhaustedClaimed = [
    projection.truthSummary?.emptyReason,
    projection.queueSummary?.emptyReason,
    projection.managerSummary?.inactivityReason,
    projection.managerSummary?.reliabilityState,
    projection.queueSummary?.sourceExhausted === true ? "source_exhausted" : null,
    projection.managerSummary?.sourceExhausted === true ? "source_exhausted" : null,
  ].includes("source_exhausted");
  if (sourceExhaustedClaimed && projectionHasOpenPacket(projection)) {
    return false;
  }
  const hasExhaustedSourceWithEvidence = Array.isArray(projection.sourceStates) && projection.sourceStates.some((sourceState) => (
    sourceState &&
    typeof sourceState === "object" &&
    (sourceState as { state?: string }).state === "exhausted" &&
    Array.isArray((sourceState as { evidenceRefs?: unknown }).evidenceRefs) &&
      (sourceState as { evidenceRefs: unknown[] }).evidenceRefs.some(isSafeEvidenceRef)
  ));
  return (
    !sourceExhaustedClaimed ||
    hasExhaustedSourceWithEvidence
  );
}

function isProjectionBackendReachabilityConsistent(projection: Partial<PipelineDashboardProjectionV0>) {
  if (projection.backendReachability?.state !== "unavailable") {
    return true;
  }
  return (
    projection.sourceLabel === "unavailable" &&
    projection.freshnessState === "unavailable" &&
    projection.truthSummary?.label === "unavailable" &&
    projection.truthSummary?.backendUnavailable === true &&
    projection.managerSummary?.stateSource === "unavailable" &&
    projection.managerSummary?.reliabilityState === "unavailable" &&
    projection.managerSummary?.freshnessState === "unavailable" &&
    projection.workerSummary?.stateSource === "unavailable" &&
    projection.workerSummary?.freshnessState === "unavailable" &&
    projection.queueSummary?.emptyReason === "backend_unavailable"
  );
}

function isProjectionManagerReliabilityConsistent(projection: Partial<PipelineDashboardProjectionV0>) {
  const manager = projection.managerSummary;
  const queue = projection.queueSummary;
  if (!manager || !queue) {
    return false;
  }
  if (projection.backendReachability?.state === "unavailable") {
    return manager.reliabilityState === "unavailable";
  }
  if (queue.activeCount !== null && queue.activeCount !== undefined && queue.activeCount > 0) {
    return manager.reliabilityState === "running";
  }
  if (queue.dispatchableCount !== null && queue.dispatchableCount !== undefined && queue.dispatchableCount > 0) {
    return manager.reliabilityState === "ready";
  }
  if (queue.blockedCount !== null && queue.blockedCount !== undefined && queue.blockedCount > 0) {
    return manager.reliabilityState === "blocked";
  }
  if (queue.gatedCount !== null && queue.gatedCount !== undefined && queue.gatedCount > 0) {
    return manager.reliabilityState === "waiting_for_approval";
  }
  if (queue.refillingCount !== null && queue.refillingCount !== undefined && queue.refillingCount > 0) {
    return manager.reliabilityState === "refilling";
  }
  if (queue.staleCount !== null && queue.staleCount !== undefined && queue.staleCount > 0) {
    return ["degraded", "unknown"].includes(manager.reliabilityState);
  }
  if (queue.unknownCount !== null && queue.unknownCount !== undefined && queue.unknownCount > 0) {
    return manager.reliabilityState === "unknown";
  }
  if (manager.inactivityReason === "source_exhausted" || manager.sourceExhausted) {
    return manager.reliabilityState === "source_exhausted";
  }
  if (manager.inactivityReason === "healthy_empty") {
    return manager.reliabilityState === "healthy_idle";
  }
  return true;
}

function isProjectionReliabilityProblemsConsistent(projection: Partial<PipelineDashboardProjectionV0>) {
  if (!Array.isArray(projection.reliabilityProblems)) {
    return false;
  }
  return projection.reliabilityProblems.every((problem) => {
    if (problem.kind !== "idle_with_ready_work") {
      return true;
    }
    return isIdleWithReadyWorkProblemConsistent(projection);
  });
}

function isIdleWithReadyWorkProblemConsistent(projection: Partial<PipelineDashboardProjectionV0>) {
  const queue = projection.queueSummary;
  const manager = projection.managerSummary;
  const worker = projection.workerSummary;
  if (!queue || !manager || !worker) {
    return false;
  }
  if (
    projection.sourceLabel !== "live" ||
    projection.freshnessState !== "live" ||
    projection.backendReachability?.state !== "reachable" ||
    projection.fixtureMode?.enabled === true
  ) {
    return false;
  }
  if ((queue.dispatchableCount ?? 0) <= 0) {
    return false;
  }
  if (
    queue.sourceExhausted ||
    ["source_exhausted", "healthy_empty", "approval_required", "backend_unavailable", "projection_stale"].includes(queue.emptyReason ?? "") ||
    ["source_exhausted", "healthy_empty", "approval_required", "backend_unavailable", "projection_stale"].includes(manager.inactivityReason ?? "")
  ) {
    return false;
  }
  if ((queue.activeCount ?? 0) > 0 || (manager.activeLeaseCount ?? 0) > 0 || (manager.activeWorkerCount ?? 0) > 0) {
    return false;
  }
  if (worker.freshnessState === "live" && ((worker.activeCount ?? 0) > 0 || (worker.drainingCount ?? 0) > 0)) {
    return false;
  }
  return true;
}

function hasExactlyOneStageSummaryPerStage(stageSummaries: PipelineDashboardProjectionV0["stageSummaries"]) {
  if (stageSummaries.length !== AUTHORITATIVE_PACKET_STAGES.length) {
    return false;
  }
  const stages = new Set(stageSummaries.map((summary) => summary.stage));
  return AUTHORITATIVE_PACKET_STAGES.every((stage) => stages.has(stage));
}

function selectedPacketDetailsMatchWorkPackets(
  workPackets: PipelineDashboardProjectionV0["workPackets"],
  selectedPacketDetails: PipelineDashboardProjectionV0["selectedPacketDetails"]
) {
  if (workPackets.length !== selectedPacketDetails.length) {
    return false;
  }
  const packetsById = new Map(workPackets.map((packet) => [packet.packetId, packet]));
  const detailIds = new Set<string>();
  for (const detail of selectedPacketDetails) {
    if (detailIds.has(detail.packetId)) {
      return false;
    }
    detailIds.add(detail.packetId);
    const packet = packetsById.get(detail.packetId);
    if (!packet) {
      return false;
    }
    if (
      detail.currentStage !== packet.currentStage ||
      detail.status !== packet.status ||
      detail.truthLabel !== packet.truthLabel ||
      JSON.stringify(detail.canonicalContract) !== JSON.stringify(packet.canonicalContract) ||
      JSON.stringify(detail.productModeMapping) !== JSON.stringify(packet.productModeMapping) ||
      detail.blocker !== packet.blocker ||
      detail.nextAction !== packet.nextAction ||
      JSON.stringify(detail.readyToTest ?? null) !== JSON.stringify(packet.readyToTest ?? null)
    ) {
      return false;
    }
    const detailEvidence = new Set(detail.evidenceRefs);
    if (
      packet.evidenceRefs.length !== detail.evidenceRefs.length ||
      packet.evidenceRefs.some((ref) => !detailEvidence.has(ref))
    ) {
      return false;
    }
  }
  return detailIds.size === packetsById.size;
}

function isEmptyReason(value: unknown) {
  return value === null || (typeof value === "string" && projectionEmptyReasons.has(value));
}

function isBackendReachability(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const reachability = value as PipelineDashboardProjectionV0["backendReachability"];
  return (
    isBackendReachabilityState(reachability.state) &&
    isTimestampString(reachability.checkedAt) &&
    isEmptyReason(reachability.reason ?? null) &&
    typeof reachability.summary === "string"
  );
}

function isFixtureMode(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const fixtureMode = value as PipelineDashboardProjectionV0["fixtureMode"];
  return (
    typeof fixtureMode.enabled === "boolean" &&
    (fixtureMode.reason === null || typeof fixtureMode.reason === "string") &&
    typeof fixtureMode.allowedForEnvironment === "boolean" &&
    fixtureMode.visibleLabelRequired === true &&
    fixtureMode.canSatisfyLiveProof === false
  );
}

function isTruthSummary(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const truthSummary = value as PipelineDashboardProjectionV0["truthSummary"];
  return (
    isProjectionSourceLabel(truthSummary.label) &&
    isEmptyReason(truthSummary.emptyReason) &&
    typeof truthSummary.backendEmpty === "boolean" &&
    typeof truthSummary.backendUnavailable === "boolean" &&
    typeof truthSummary.fixtureBacked === "boolean" &&
    typeof truthSummary.stale === "boolean" &&
    typeof truthSummary.summary === "string"
  );
}

function isManagerSummary(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const managerSummary = value as PipelineDashboardProjectionV0["managerSummary"];
  return (
    isManagerStateSource(managerSummary.stateSource) &&
    managerReliabilityStates.has(managerSummary.reliabilityState) &&
    isProjectionFreshnessState(managerSummary.freshnessState) &&
    isNullableCount(managerSummary.activeLeaseCount) &&
    isNullableCount(managerSummary.activeWorkerCount) &&
    isNullableCount(managerSummary.warmWorkerCount) &&
    isNullableCount(managerSummary.blockedQueueCount) &&
    isNullableCount(managerSummary.dispatchableQueueCount) &&
    isNullableCount(managerSummary.closedQueueCount) &&
    isNullableCount(managerSummary.healthySourceCount) &&
    isNullableCount(managerSummary.exhaustedSourceCount) &&
    isNullableCount(managerSummary.blockedSourceCount) &&
    isNullableCount(managerSummary.gatedSourceCount) &&
    isNullableCount(managerSummary.staleSourceCount) &&
    isNullableCount(managerSummary.unavailableSourceCount) &&
    isNullableCount(managerSummary.refillingSourceCount) &&
    isNullableCount(managerSummary.unknownSourceCount) &&
    typeof managerSummary.sourceExhausted === "boolean" &&
    isEmptyReason(managerSummary.inactivityReason) &&
    Array.isArray(managerSummary.evidenceRefs) &&
    managerSummary.evidenceRefs.every(isSafeEvidenceRef) &&
    typeof managerSummary.summary === "string" &&
    managerSummary.metadataOnly === true
  );
}

function isWorkerSummary(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const workerSummary = value as PipelineDashboardProjectionV0["workerSummary"];
  return (
    isManagerStateSource(workerSummary.stateSource) &&
    isProjectionFreshnessState(workerSummary.freshnessState) &&
    isNullableCount(workerSummary.warmCount) &&
    isNullableCount(workerSummary.activeCount) &&
    isNullableCount(workerSummary.waitingCount) &&
    isNullableCount(workerSummary.stalledCount) &&
    isNullableCount(workerSummary.failedCount) &&
    isNullableCount(workerSummary.drainingCount) &&
    isNullableCount(workerSummary.killedCount) &&
    isNullableCount(workerSummary.completeCount) &&
    isNullableCount(workerSummary.unavailableCount) &&
    isNullableCount(workerSummary.unknownCount) &&
    Array.isArray(workerSummary.workerRefs) &&
    workerSummary.workerRefs.every(isSafeWorkerRef) &&
    Array.isArray(workerSummary.evidenceRefs) &&
    workerSummary.evidenceRefs.every(isSafeEvidenceRef) &&
    typeof workerSummary.summary === "string" &&
    workerSummary.metadataOnly === true
  );
}

function isReliabilityProblem(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const problem = value as PipelineDashboardProjectionV0["reliabilityProblems"][number];
  return (
    typeof problem.problemId === "string" &&
    reliabilityProblemKinds.has(problem.kind) &&
    reliabilityProblemSeverities.has(problem.severity) &&
    reliabilityProblemLikelyIssues.has(problem.likelyIssue) &&
    typeof problem.summary === "string" &&
    Array.isArray(problem.evidenceRefs) &&
    problem.evidenceRefs.every(isSafeEvidenceRef) &&
    problem.metadataOnly === true
  );
}

function isGatedControl(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const control = value as PipelineDashboardProjectionV0["gatedControls"][number] & { command?: unknown };
  return (
    Object.keys(control).every((key) => gatedControlAllowedKeys.has(key)) &&
    typeof control.controlId === "string" &&
    isSafeEvidenceRef(control.controlId) &&
    gatedControlOperations.has(control.operation) &&
    gatedControlStatuses.has(control.status) &&
    isSafeProjectionText(control.authorityFamily) &&
    isSafeProjectionText(control.stopLine) &&
    isSafeProjectionText(control.nextAction) &&
    (control.packetId === null || isSafeEvidenceRef(control.packetId)) &&
    Array.isArray(control.workerRefs) &&
    control.workerRefs.every(isSafeWorkerRef) &&
    Array.isArray(control.evidenceRefs) &&
    control.evidenceRefs.every(isSafeEvidenceRef) &&
    control.metadataOnly === true
  );
}

function isQueueSummary(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const queueSummary = value as PipelineDashboardProjectionV0["queueSummary"];
  return (
    isNullableCount(queueSummary.activeCount) &&
    isNullableCount(queueSummary.dispatchableCount) &&
    isNullableCount(queueSummary.blockedCount) &&
    isNullableCount(queueSummary.gatedCount) &&
    isNullableCount(queueSummary.closedCount) &&
    isNullableCount(queueSummary.staleCount) &&
    isNullableCount(queueSummary.refillingCount) &&
    isNullableCount(queueSummary.unknownCount) &&
    isEmptyReason(queueSummary.emptyReason) &&
    typeof queueSummary.sourceExhausted === "boolean" &&
    typeof queueSummary.summary === "string"
  );
}

function isExecuteAdmission(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const admission = value as PipelineDashboardProjectionV0["executeAdmission"];
  const validDimensions = new Set(["review", "deliver", "verification", "operatorTesting"]);
  const validCounts = (counts: typeof admission.limits) => counts === null || (
    typeof counts === "object" &&
    counts !== null &&
    [counts.review, counts.deliver, counts.verification, counts.operatorTesting]
      .every((count) => Number.isInteger(count) && count >= 0)
  );
  return (
    admission.schemaVersion === "pipeline-execute-admission/v0" &&
    admission.policyVersion === "supervisor-wip/v0" &&
    ["ready", "blocked", "unavailable"].includes(admission.state) &&
    typeof admission.capacityAvailable === "boolean" &&
    typeof admission.typedReason === "string" &&
    ["supervisor_settings", "unavailable"].includes(admission.source) &&
    validCounts(admission.limits) &&
    validCounts(admission.observed) &&
    Array.isArray(admission.blockingDimensions) &&
    admission.blockingDimensions.every((dimension) => validDimensions.has(dimension)) &&
    typeof admission.nextSafeAction === "string" &&
    Array.isArray(admission.evidenceRefs) &&
    admission.evidenceRefs.every(isSafeEvidenceRef) &&
    admission.metadataOnly === true &&
    admission.rawPayloadRetained === false &&
    (admission.state === "ready") === admission.capacityAvailable &&
    (admission.state === "unavailable" || (admission.limits !== null && admission.observed !== null))
  );
}

function isProjectionSourceRef(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const sourceRef = value as NonNullable<PipelineDashboardProjectionV0["workPackets"][number]["sourceRef"]>;
  return (
    typeof sourceRef.refId === "string" &&
    projectionSourceTypes.has(sourceRef.sourceType) &&
    (sourceRef.pathOrUrl === null || sourceRef.pathOrUrl === undefined || typeof sourceRef.pathOrUrl === "string") &&
    (sourceRef.title === null || sourceRef.title === undefined || typeof sourceRef.title === "string") &&
    (sourceRef.contentSha256 === null || sourceRef.contentSha256 === undefined || (typeof sourceRef.contentSha256 === "string" && /^[0-9a-f]{64}$/i.test(sourceRef.contentSha256)))
  );
}

function isProjectionWorkPacket(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const packet = value as PipelineDashboardProjectionV0["workPackets"][number];
  return (
    typeof packet.packetId === "string" &&
    typeof packet.title === "string" &&
    isProjectionStage(packet.currentStage) &&
    isProjectionStatus(packet.status) &&
    isProjectionSourceLabel(packet.truthLabel) &&
    (packet.sourceRef === null || isProjectionSourceRef(packet.sourceRef)) &&
    (packet.canonicalContract === null || isPipelineCanonicalContractV1(packet.canonicalContract)) &&
    (packet.productModeMapping === null || isPipelineProductModeMappingV0(packet.productModeMapping)) &&
    (packet.blocker === null || typeof packet.blocker === "string") &&
    (packet.nextAction === null || typeof packet.nextAction === "string") &&
    (packet.readyToTest === undefined || packet.readyToTest === null || isProjectionReadyToTest(packet.readyToTest)) &&
    Array.isArray(packet.evidenceRefs) &&
    packet.evidenceRefs.every(isSafeEvidenceRef) &&
    isTimestampString(packet.updatedAt) &&
    packet.metadataOnly === true
  );
}

function isProjectionStageSummary(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const stage = value as PipelineDashboardProjectionV0["stageSummaries"][number];
  return (
    isProjectionStage(stage.stage) &&
    typeof stage.label === "string" &&
    typeof stage.packetCount === "number" &&
    Number.isFinite(stage.packetCount) &&
    stage.packetCount >= 0 &&
    isProjectionSourceLabel(stage.sourceLabel) &&
    isProjectionFreshnessState(stage.freshnessState) &&
    isEmptyReason(stage.emptyReason)
  );
}

function isProjectionSourceState(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const sourceState = value as PipelineDashboardProjectionV0["sourceStates"][number];
  return (
    typeof sourceState.sourceId === "string" &&
    typeof sourceState.sourceRef === "string" &&
    projectionSourceKinds.has(sourceState.sourceKind) &&
    projectionSourceStates.has(sourceState.state) &&
    typeof sourceState.summary === "string" &&
    Array.isArray(sourceState.evidenceRefs) &&
    sourceState.evidenceRefs.every(isSafeEvidenceRef) &&
    isTimestampString(sourceState.updatedAt) &&
    sourceState.metadataOnly === true
  );
}

function isProjectionSelectedPacketDetail(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const detail = value as PipelineDashboardProjectionV0["selectedPacketDetails"][number];
  const hasValidLatestTransitionEventRef =
    detail.latestTransitionEventRef === undefined ||
    detail.latestTransitionEventRef === null ||
    typeof detail.latestTransitionEventRef === "string";
  const hasValidRecentTransitionEventRefs =
    detail.recentTransitionEventRefs === undefined ||
    (Array.isArray(detail.recentTransitionEventRefs) &&
      detail.recentTransitionEventRefs.every((ref) => typeof ref === "string"));
  const hasValidLatestMovementSummary =
    detail.latestMovementSummary === undefined ||
    detail.latestMovementSummary === null ||
    typeof detail.latestMovementSummary === "string";
  const hasValidLiveMovementProof =
    detail.canSatisfyLiveMovementProof === undefined ||
    typeof detail.canSatisfyLiveMovementProof === "boolean";
  const movementProofIsConsistent =
    detail.canSatisfyLiveMovementProof !== true ||
    (detail.truthLabel === "live" &&
      (detail.status === "active" || detail.status === "waiting" || detail.status === "blocked") &&
      detail.currentStage !== "learn" &&
      typeof detail.latestTransitionEventRef === "string" &&
      detail.latestTransitionEventRef.startsWith("event:") &&
      Array.isArray(detail.recentTransitionEventRefs) &&
      detail.recentTransitionEventRefs.includes(detail.latestTransitionEventRef) &&
      typeof detail.latestMovementSummary === "string" &&
      detail.latestMovementSummary.trim().length > 0);
  return (
    typeof detail.packetId === "string" &&
    Array.isArray(detail.sourceRefs) &&
    detail.sourceRefs.every(isProjectionSourceRef) &&
    (detail.canonicalContract === null || isPipelineCanonicalContractV1(detail.canonicalContract)) &&
    (detail.productModeMapping === null || isPipelineProductModeMappingV0(detail.productModeMapping)) &&
    Array.isArray(detail.evidenceRefs) &&
    detail.evidenceRefs.every(isSafeEvidenceRef) &&
    isProjectionStage(detail.currentStage) &&
    isProjectionStatus(detail.status) &&
    isProjectionSourceLabel(detail.truthLabel) &&
    (detail.blocker === null || typeof detail.blocker === "string") &&
    (detail.nextAction === null || typeof detail.nextAction === "string") &&
    (detail.readyToTest === undefined || detail.readyToTest === null || isProjectionReadyToTest(detail.readyToTest)) &&
    hasValidLatestTransitionEventRef &&
    hasValidRecentTransitionEventRefs &&
    hasValidLatestMovementSummary &&
    hasValidLiveMovementProof &&
    movementProofIsConsistent &&
    detail.metadataOnly === true
  );
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
