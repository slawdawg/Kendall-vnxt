import type { PipelineStage, WorkPacketLifecycleSourceV0, WorkPacketV0View } from "@kendall/contracts";

export type PipelineSourceTrustState =
  | "included"
  | "excluded"
  | "stale"
  | "contradictory"
  | "unavailable"
  | "derived-only";

type PipelineRouteFork = {
  selectedRoute: string;
  rejectedRoutes: string[];
  tags: string[];
  sourceContext: string;
  lowConfidenceActions: string[];
};

type PipelineActionGuard = {
  actionSurface: "human_gate" | "recovery";
  actionId: string;
  expectedActionId: string;
  actualActionId: string;
  expectedPacketId: string;
  actualPacketId: string;
  expectedState: string;
  actualState: string;
  classification: string;
  primaryRisk: string;
  stopLine: string;
  safeNextOption: string;
};

type PipelineRecoveryFixtureEvent = {
  eventId: string;
  actionId: string;
};

export type PipelineDashboardPacket = WorkPacketV0View & {
  fixtureId?: string;
  fixtureKind?: string;
  sourceKind?: "supervisor-runtime" | "demo-fixture" | "projection";
  sourceId?: string;
  fixtureLabel: string;
  summary: string;
  nextAction: string;
  confidenceLabel: string;
  freshnessLabel: string;
  sourceTrustState: PipelineSourceTrustState;
  sourceTrustStates: PipelineSourceTrustState[];
  sourceTrustSummary: string;
  routeFork: PipelineRouteFork;
  lastEvent: string;
  riskFlags: string[];
  matrixRowIds: string[];
  humanGateFixtureEvents: unknown[];
  recoveryFixtureEvents: PipelineRecoveryFixtureEvent[];
  actionGuardFixtures: PipelineActionGuard[];
  localModelHealth: { statusLabel: string; authoritySummary: string } | null;
  hermesJob: { statusLabel: string; boundarySummary: string } | null;
  codexWorker: { readiness: string; boundarySummary: string } | null;
  claudeReview: { statusLabel: string; boundarySummary: string } | null;
};

export type PipelineRuntimePacket = Omit<PipelineDashboardPacket, "fixtureId" | "fixtureKind"> & {
  sourceKind: "supervisor-runtime";
  sourceId: string;
};

export type PipelineSupervisorProjectionResult =
  | { kind: "runtime"; packets: PipelineRuntimePacket[] }
  | { kind: "empty"; packets: [] }
  | { kind: "invalid"; packets: []; error: string };

const pipelineStages = new Set(["capture", "classify", "route", "shape", "human_gate", "execute", "review", "promote", "deliver", "learn"]);
const workPacketOwners = new Set(["kendall", "operator", "local_model", "hermes_worker_mock", "codex_worker", "claude_reviewer", "github", "memory_review", "blocked"]);
const workPacketStatuses = new Set(["active", "waiting", "blocked", "failed", "complete", "deferred"]);
const riskLevels = new Set(["low", "medium", "high"]);
const priorities = new Set(["low", "normal", "high", "urgent"]);
const candidateWorkSources = new Set(["bmad", "chief_of_staff", "obsidian", "operator", "supervisor"]);
const candidateWorkArtifactTypes = new Set([
  "bmad_story", "bmad_research", "bmad_workflow_output", "chief_of_staff_request", "manual_note", "obsidian_metadata",
]);
const candidateWorkStatuses = new Set(["proposed", "approved", "rejected", "deferred"]);
const workflowStates = new Set([
  "queued", "triaged", "ready", "implementing", "validating", "reviewing", "awaiting_audit", "needs_rework",
  "operator_owned", "blocked", "done",
]);
const bmadLanes = new Set(["intake", "implementation", "validation", "review", "corrective_loop"]);
const workItemOrigins = new Set(["operator", "supervisor"]);
const auditModes = new Set(["none", "advisory", "required"]);
const sourceRefTypes = new Set(["candidate_work", "work_item", "bmad_artifact", "obsidian", "llm_wiki", "github", "research", "manual"]);
const sourceFreshnessValues = new Set(["fresh", "stale", "unknown", "not_applicable"]);
const sourceAccessStates = new Set(["allowed", "excluded", "missing", "blocked"]);
const evidenceRefTypes = new Set(["route", "event", "attempt", "local_model", "review", "gate", "memory", "fixture"]);
const evidenceRetentionClasses = new Set(["metadata_only", "summary", "fixture"]);
const artifactRefTypes = new Set(["plan", "progress", "report", "pull_request", "check", "memory_proposal", "fixture"]);
const artifactRefStatuses = new Set(["available", "missing", "blocked", "deferred"]);
const humanGateActionTypes = new Set([
  "approve_route", "approve_execution", "approve_provider_exception", "approve_memory_proposal", "approve_delivery",
  "reject_packet", "edit_packet", "request_clarification", "downgrade_to_reference", "send_back_to_shape",
  "send_back_to_research", "cancel_worker", "discard_result", "rerun_smaller", "reroute",
]);
const humanGateActionFamilies = new Set(["Approve", "Reject", "Request Changes", "Retry", "Pause", "Escalate", "Mark Resolved"]);
const humanGateActionStatuses = new Set(["available", "disabled", "blocked", "stale", "complete"]);
const humanGateActionRequestStatuses = new Set(["recorded", "rejected", "blocked", "stale"]);
const laneTypes = new Set([
  "local_model", "hermes_worker_mock", "codex_worker", "claude_reviewer", "github", "memory_review", "utility",
  "local_readonly", "local_patch_draft", "local_sandbox_execute", "subscription_handoff", "subscription_agent",
  "premium_approval", "codex_cli_worker", "claude_execution_dry_run", "hermes_execution_dry_run",
  "claude_governed_execution", "hermes_governed_execution", "unknown",
]);
const laneStatuses = new Set(["idle", "available", "pending", "running", "blocked", "complete", "skipped"]);
const memoryProposalStatuses = new Set([
  "not_applicable", "proposed", "pending_human_approval", "approved", "rejected", "deferred", "edit_needed",
  "blocked", "stale", "contradictory",
]);
const memoryProposalTypes = new Set(["new_note", "append_note", "link_notes", "tag_update", "decision_record", "error_book_entry", "user_facing_documentation"]);
const memoryProposalSensitivities = new Set(["low", "medium", "high"]);
const memoryProposalFreshnessValues = new Set(["fresh", "stale", "conflicting", "unknown"]);
const llmWikiRebuildBasisValues = new Set(["approved-memory-proposals", "source-evidence-crosswalk"]);
const memoryProposalContradictionStatuses = new Set(["none", "possible", "confirmed"]);
const memoryProposalConfidenceValues = new Set(["low", "medium", "high"]);
const memoryProposalOperatorActions = new Set(["approve", "edit", "reject", "defer", "blocked"]);
const memoryProposalWriteBackStatuses = new Set(["not_started", "blocked", "review_gated", "approved_for_future", "deferred"]);
const recoveryActionTypes = new Set([
  "retry_smaller", "reroute", "cancel_worker", "discard_result", "preserve_evidence", "reopen_human_gate",
  "mark_blocked", "reenter_capture", "send_back_to_shape", "send_back_to_research",
]);
const actionAvailabilityValues = new Set(["available", "blocked", "stale", "complete"]);
const reviewStatuses = new Set(["not_applicable", "pending", "blocked", "complete", "skipped"]);
const executionAttemptStatuses = new Set(["planned", "approved", "starting", "running", "cancel_requested", "cancelled", "timed_out", "failed", "completed", "rejected"]);
const loopStopKinds = new Set([
  "limit_window", "operator_approval", "review_thread", "failed_check", "setup_churn", "token_window",
  "resource_pressure", "tool_churn", "unsafe_cleanup", "scope_boundary", "owner_conflict", "operator_owned",
]);
const loopStopSeverities = new Set(["info", "warning", "blocking"]);
const gateValidationStatuses = new Set(["matched", "blocked", "preview_only"]);
const gateRefTypes = new Set(["source", "evidence", "event"]);
const gateRefStates = new Set(["allowed", "blocked", "missing", "excluded", "redacted", "unsupported", "metadata_only"]);
const learnOutcomeStatuses = new Set(["not_applicable", "pending", "accepted", "rejected", "deferred", "blocked"]);
const automationAuthorityChangeStatuses = new Set(["not_requested", "blocked", "deauthorized", "review_gated", "accepted"]);
const learnFollowUpStatuses = new Set(["proposed", "approved", "rejected", "deferred", "not_created"]);
const learnFollowUpOrigins = new Set(["failure", "approval", "rejection", "quality", "operator_feedback"]);
const learnReentryPaths = new Set(["reenter_capture", "human_gate", "learn_review", "none"]);
const refillSourceStates = new Set(["healthy", "source_exhausted", "blocked", "refilling", "unknown"]);
const housekeepingStatuses = new Set(["not_applicable", "complete", "blocked", "running", "unknown"]);
const lifecycleSources = new Set<WorkPacketLifecycleSourceV0>([
  "candidate_work",
  "work_item",
  "execution_attempt",
  "workflow_event",
  "memory_proposal",
  "delivery_evidence",
  "source_missing",
]);
const referenceBearingFieldNames = new Set([
  "allowedinputs",
  "basebranch",
  "branch",
  "branchprefix",
  "branchname",
  "cleanuptarget",
  "evidence",
  "expectedheadrevision",
  "expectedlocalbranch",
  "expectedowner",
  "expectedpr",
  "expectedremotebranch",
  "expectedworktree",
  "headrevision",
  "localbranch",
  "owner",
  "pullrequestheadrevision",
  "pullrequesturl",
  "remotebranch",
  "revision",
  "source",
  "derivedtargetfolder",
  "targetbranch",
  "targetvaultfolder",
  "worktree",
]);

export function projectSupervisorWorkPacketsToCockpitPackets(
  packets: readonly WorkPacketV0View[] | unknown,
): PipelineSupervisorProjectionResult {
  if (!Array.isArray(packets)) {
    return { kind: "invalid", packets: [], error: "Supervisor returned a malformed WorkPacketV0 collection." };
  }
  if (packets.length === 0) {
    return { kind: "empty", packets: [] };
  }
  const fixtureShapedIndex = packets.findIndex((packet) => hasFixtureOnlyRuntimeShape(packet));
  if (fixtureShapedIndex >= 0) {
    return {
      kind: "invalid",
      packets: [],
      error: "Supervisor returned fixture-shaped WorkPacketV0 row at index " + fixtureShapedIndex + ".",
    };
  }
  const invalidIndex = packets.findIndex((packet) => !isWorkPacketV0View(packet));
  if (invalidIndex >= 0) {
    return {
      kind: "invalid",
      packets: [],
      error: "Supervisor returned malformed WorkPacketV0 row at index " + invalidIndex + ".",
    };
  }
  const duplicatePacketId = firstDuplicatePacketId(packets);
  if (duplicatePacketId) {
    return {
      kind: "invalid",
      packets: [],
      error: "Supervisor returned duplicate WorkPacketV0 identity " + duplicatePacketId + ".",
    };
  }
  try {
    return {
      kind: "runtime",
      packets: packets.map((packet) => projectSupervisorWorkPacketToCockpitPacket(packet as WorkPacketV0View)),
    };
  } catch {
    return { kind: "invalid", packets: [], error: "Supervisor WorkPacketV0 projection failed validation." };
  }
}
export function isWorkPacketV0View(value: unknown): value is WorkPacketV0View {
  if (!value || typeof value !== "object") {
    return false;
  }
  const packet = value as Partial<WorkPacketV0View>;
  const lifecycleState = packet.lifecycleState;
  return isNonEmptyString(packet.packetId) &&
    isNonEmptyString(packet.title) &&
    isNonEmptyString(packet.requestedOutcome) &&
    isEnumValue(packet.currentStage, pipelineStages) &&
    isEnumValue(packet.currentOwner, workPacketOwners) &&
    isEnumValue(packet.status, workPacketStatuses) &&
    isEnumValue(packet.riskLevel, riskLevels) &&
    isEnumValue(packet.priority, priorities) &&
    Array.isArray(packet.sourceRefs) &&
    packet.sourceRefs.every(isSourceRefV0) &&
    Array.isArray(packet.evidenceRefs) &&
    packet.evidenceRefs.every(isEvidenceRefV0) &&
    Array.isArray(packet.artifactRefs) &&
    packet.artifactRefs.every(isArtifactRefV0) &&
    Array.isArray(packet.humanGateActions) &&
    packet.humanGateActions.every((action) => isHumanGateActionV0(action, packet.packetId as string)) &&
    Array.isArray(packet.humanGateActionRequests) &&
    packet.humanGateActionRequests.every((request) => isHumanGateActionRequestV0(request, packet.packetId as string)) &&
    Array.isArray(packet.laneCards) &&
    packet.laneCards.every(isWorkPacketLaneCardV0) &&
    Array.isArray(packet.memoryProposals) &&
    packet.memoryProposals.every((proposal) => isMemoryProposalV0(proposal, packet.packetId as string)) &&
    Array.isArray(packet.reviewSummaries) &&
    packet.reviewSummaries.every(isWorkPacketReviewSummaryV0) &&
    Array.isArray(packet.recoveryActions) &&
    packet.recoveryActions.every(isRecoveryActionV0) &&
    Array.isArray(packet.executionAttempts) &&
    packet.executionAttempts.every(isWorkPacketExecutionAttemptSummaryV0) &&
    Array.isArray(packet.transitionEvents) &&
    packet.transitionEvents.every(isWorkPacketStageTransitionEventV0) &&
    Array.isArray(packet.loopStopStates) &&
    packet.loopStopStates.every(isWorkPacketLoopStopStateV0) &&
    isAbsentOr(packet.candidateWork, isCandidateWorkView) &&
    isAbsentOr(packet.workItem, isWorkItemView) &&
    isAbsentOr(packet.taskPacket, isTaskPacketV0View) &&
    isAbsentOr(packet.routingPreview, isRoutingPreviewView) &&
    isAbsentOr(packet.routeSummary, isWorkPacketRouteSummaryV0) &&
    isAbsentOr(packet.deliveryEvidence, isWorkPacketDeliveryEvidenceV0) &&
    isAbsentOr(packet.learnOutcome, isWorkPacketLearnOutcomeV0) &&
    isAbsentOr(packet.learnRefill, (refill) => isWorkPacketLearnRefillProjectionV0(refill, packet.packetId as string)) &&
    isAbsentOr(packet.alphaMemorySourceStatus, isAlphaMemorySourceStatusV0) &&
    isAbsentOr(packet.gateStateValidation, isWorkPacketGateStateValidationV0) &&
    isWorkPacketLifecycleStateV0(lifecycleState) &&
    reachableNestedWorkPacketFieldsAreSafe(packet);
}

function hasFixtureOnlyRuntimeShape(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const packet = value as Record<string, unknown>;
  if (
    isSyntheticRuntimeIdentity(packet.packetId) ||
    "fixtureId" in packet ||
    "fixtureKind" in packet ||
    "fixtureLabel" in packet ||
    packet.sourceKind === "demo-fixture"
  ) {
    return true;
  }
  return hasFixtureOnlyRefs(packet.sourceRefs) ||
    hasFixtureOnlyRefs(packet.evidenceRefs) ||
    hasFixtureOnlyRefs(packet.artifactRefs) ||
    hasFixtureMarkersInReachableNestedFields(packet);
}

function hasFixtureOnlyRefs(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.some((ref) => {
    if (!ref || typeof ref !== "object") {
      return false;
    }
    const typedRef = ref as Record<string, unknown>;
    return isSyntheticRuntimeIdentity(typedRef.refId) ||
      isSyntheticRuntimeIdentity(typedRef.sourceRef) ||
      isSyntheticRuntimeIdentity(typedRef.pathOrUrl) ||
      isSyntheticRuntimeIdentity(typedRef.artifactPath) ||
      typedRef.evidenceType === "fixture" ||
      typedRef.retentionClass === "fixture" ||
      typedRef.artifactType === "fixture";
  });
}

function isSyntheticRuntimeIdentity(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith("fixture:") || normalized.startsWith("demo:");
}

function isSafeReferenceString(value: unknown): value is string {
  return isNonEmptyString(value) && !isSyntheticRuntimeIdentity(value);
}

function isNullableSafeReferenceString(value: unknown): boolean {
  return value === null || typeof value === "undefined" || isSafeReferenceString(value);
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === "string" || typeof value === "undefined";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function isSafeReferenceArray(value: unknown): value is string[] {
  return isStringArray(value) && value.every(isSafeReferenceString);
}

function isNonEmptyStringArray(value: unknown): value is [string, ...string[]] {
  return isStringArray(value) && value.length > 0;
}

function isOptionalNullableNumber(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "number" && Number.isFinite(value));
}

function isOptionalNullableEnum(value: unknown, allowedValues: ReadonlySet<string>): boolean {
  return value === undefined || value === null || isEnumValue(value, allowedValues);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isRequiredNullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function isOptionalEnum(value: unknown, allowedValues: ReadonlySet<string>): boolean {
  return value === undefined || isEnumValue(value, allowedValues);
}

function isRequiredNullableEnum(value: unknown, allowedValues: ReadonlySet<string>): boolean {
  return value === null || isEnumValue(value, allowedValues);
}

function isAbsentOr(value: unknown, predicate: (candidate: unknown) => boolean): boolean {
  return value === undefined || value === null || predicate(value);
}

function hasExactBooleanFields(record: Record<string, unknown>, fields: readonly string[], expected: boolean): boolean {
  return fields.every((field) => record[field] === expected);
}

function isWorkPacketLifecycleStateV0(value: unknown): boolean {
  return isRecord(value) &&
    isEnumValue(value.source, lifecycleSources) &&
    isEnumValue(value.stage, pipelineStages) &&
    isEnumValue(value.owner, workPacketOwners) &&
    isEnumValue(value.status, workPacketStatuses) &&
    isStringArray(value.reasonCodes) &&
    isNonEmptyString(value.authoritativeRef) &&
    isStringArray(value.derivedFromRefs) &&
    isStringArray(value.transitionEventRefs) &&
    isNullableSafeReferenceString(value.latestTransitionEventRef) &&
    isNullableSafeReferenceString(value.attemptRef) &&
    value.metadataOnly === true &&
    hasExactBooleanFields(
      value,
      ["sourceMutationAllowed", "providerCallsAllowed", "workerLaunchAllowed", "githubMutationAllowed", "cleanupAllowed"],
      false,
    );
}

function isCandidateWorkView(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return ["id", "title", "requestedOutcome", "sourceArtifactPath", "createdAt", "updatedAt"]
    .every((field) => isNonEmptyString(value[field])) &&
    isEnumValue(value.source, candidateWorkSources) &&
    isEnumValue(value.sourceArtifactType, candidateWorkArtifactTypes) &&
    isEnumValue(value.riskLevel, riskLevels) &&
    isEnumValue(value.priority, priorities) &&
    typeof value.sortOrder === "number" &&
    Number.isFinite(value.sortOrder) &&
    isEnumValue(value.status, candidateWorkStatuses) &&
    isNullableString(value.approvedAt) &&
    isNullableSafeReferenceString(value.promotedWorkItemId) &&
    isAbsentOr(value.sourceSummary, isCandidateWorkSourceSummaryView) &&
    isRecord(value.importMetadata);
}

function isCandidateWorkSourceSummaryView(value: unknown): boolean {
  return isRecord(value) &&
    [
      "label", "summary", "sourceRef", "sourceArtifactPath", "retentionPolicy", "boundarySummary", "approvalStatus",
      "approvedBy", "approvedAt",
    ].every((field) => isNonEmptyString(value[field])) &&
    isEnumValue(value.sourceType, candidateWorkSources) &&
    isEnumValue(value.freshness, sourceFreshnessValues) &&
    isEnumValue(value.accessState, sourceAccessStates) &&
    isStringArray(value.evidenceRefs);
}

function isWorkItemView(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return ["id", "title", "requestedOutcome", "source", "statusSummary", "createdAt", "updatedAt", "lastEventAt"]
    .every((field) => isNonEmptyString(value[field])) &&
    isEnumValue(value.origin, workItemOrigins) &&
    isNullableString(value.details) &&
    isOptionalEnum(value.riskLevel, riskLevels) &&
    (value.metadata === undefined || isWorkItemMetadata(value.metadata)) &&
    isEnumValue(value.state, workflowStates) &&
    isRequiredNullableEnum(value.lane, bmadLanes) &&
    ["assigneeId", "assigneeLabel", "attentionReason", "escalatedAt", "escalationReason", "escalatedByLabel", "selfDetectedIssueCategory"]
      .every((field) => isNullableString(value[field])) &&
    typeof value.ageMinutes === "number" &&
    Number.isFinite(value.ageMinutes) &&
    typeof value.needsAttention === "boolean" &&
    isRequiredNullableString(value.blockedReason) &&
    isRequiredNullableString(value.nextStep) &&
    typeof value.selfDetectedIssue === "boolean" &&
    isAbsentOr(value.executionRecipe, isWorkItemExecutionRecipeView) &&
    isAbsentOr(value.deliveryReadiness, isWorkItemDeliveryReadinessView) &&
    typeof value.requiresAudit === "boolean" &&
    isEnumValue(value.auditMode, auditModes);
}

function isWorkItemMetadata(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every((entry) =>
    entry === null || typeof entry === "string" || typeof entry === "boolean" ||
      (typeof entry === "number" && Number.isFinite(entry))
  );
}

function isWorkItemExecutionRecipeView(value: unknown): boolean {
  return isRecord(value) &&
    ["id", "label", "summary", "branchPrefix"].every((field) => isNonEmptyString(value[field])) &&
    ["allowedPaths", "implementationCommands", "verificationCommands", "operatorCheckpoints", "autonomyNotes"]
      .every((field) => isStringArray(value[field])) &&
    Array.isArray(value.policyGates) &&
    value.policyGates.every(isWorkItemPolicyGateView) &&
    isWorkItemRemoteAutomationPolicyView(value.remoteAutomationPolicy);
}

function isWorkItemPolicyGateView(value: unknown): boolean {
  return isRecord(value) &&
    ["id", "label", "requiredBefore", "summary"].every((field) => isNonEmptyString(value[field])) &&
    isStringArray(value.evidence);
}

function isWorkItemRemoteAutomationPolicyView(value: unknown): boolean {
  return isRecord(value) &&
    isNonEmptyString(value.status) &&
    isNonEmptyString(value.summary) &&
    ["allowedOperations", "blockedOperations", "approvalRequirements"].every((field) => isStringArray(value[field]));
}

function isWorkItemDeliveryReadinessView(value: unknown): boolean {
  return isRecord(value) &&
    ["pullRequestStatus", "ciStatus", "mergeStatus", "remoteOperationsPolicy"].every((field) => isNonEmptyString(value[field])) &&
    isNullableSafeReferenceString(value.pullRequestUrl) &&
    typeof value.deliveryWaived === "boolean" &&
    isNullableString(value.deliveryWaiverReason) &&
    typeof value.remoteOperationsPerformed === "boolean" &&
    typeof value.readyForApproval === "boolean";
}

function isTaskPacketV0View(value: unknown): boolean {
  return isRecord(value) &&
    [
      "workItemId", "title", "requestedOutcome", "source", "sourceArtifactPath", "taskKind", "riskLevel", "priority",
      "approvalMode", "verificationSummary",
    ].every((field) => isNonEmptyString(value[field]));
}

function isRoutingPreviewView(value: unknown): boolean {
  return isRecord(value) && isRoutingProfileView(value.profile) && isRoutingDecisionView(value.decision);
}

function isRoutingProfileView(value: unknown): boolean {
  return isRecord(value) &&
    ["workItemId", "stepId", "taskKind", "riskLevel", "privacyLevel", "writeScope", "contextNeed", "reasoningNeed", "determinismNeed"]
      .every((field) => isNonEmptyString(value[field])) &&
    isNullableString(value.phase) &&
    ["allowedPaths", "validationExpectations", "preferredLanes", "forbiddenLanes", "escalationTriggers"]
      .every((field) => isStringArray(value[field]));
}

function isRoutingDecisionView(value: unknown): boolean {
  return isRecord(value) &&
    [
      "decisionId", "workItemId", "stepId", "createdAt", "selectedLane", "authorityMode", "confidenceBand",
      "permissionSummary", "humanExplanation",
    ].every((field) => isNonEmptyString(value[field])) &&
    isRoutingProfileView(value.profileSnapshot) &&
    isNullableString(value.selectedWorkerId) &&
    typeof value.confidenceScore === "number" &&
    Number.isFinite(value.confidenceScore) &&
    isStringArray(value.reasonCodes) &&
    Array.isArray(value.rejectedLanes) &&
    value.rejectedLanes.every(isRejectedRoutingLaneView) &&
    isStringArray(value.rejectedWorkers) &&
    isStringArray(value.escalationPath);
}

function isRejectedRoutingLaneView(value: unknown): boolean {
  return isRecord(value) &&
    isNonEmptyString(value.lane) &&
    isStringArray(value.rejectionCodes) &&
    isNonEmptyString(value.explanation);
}

function isWorkPacketRouteSummaryV0(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return isNonEmptyString(value.recommendation) &&
    isOptionalNullableNumber(value.confidenceScore) &&
    isNullableString(value.confidenceBand) &&
    isStringArray(value.reasonCodes);
}

function isHumanGateActionV0(value: unknown, packetId: string): boolean {
  if (!isRecord(value) || !isRecord(value.payload)) {
    return false;
  }
  const payload = value.payload;
  return isNonEmptyString(value.actionId) &&
    isEnumValue(value.type, humanGateActionTypes) &&
    isEnumValue(value.family, humanGateActionFamilies) &&
    isNonEmptyString(value.label) &&
    isNonEmptyString(value.uiCopy) &&
    isEnumValue(value.status, humanGateActionStatuses) &&
    isNonEmptyString(value.authorityFamily) &&
    isNonEmptyString(payload.packetId) &&
    payload.packetId === packetId &&
    payload.actionId === value.actionId &&
    isNonEmptyString(payload.decisionId) &&
    isStringArray(value.requiredEvidenceRefs) &&
    isStringArray(value.stopLines) &&
    isNonEmptyString(value.rollbackPath) &&
    isEnumValue(value.resultingStage, pipelineStages) &&
    isEnumValue(value.resultingOwner, workPacketOwners) &&
    isNonEmptyString(value.auditEventType) &&
    isStringArray(value.reasonCodes) &&
    isOptionalString(value.disabledReason);
}

function isHumanGateActionRequestV0(value: unknown, packetId: string): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return isNonEmptyString(value.requestId) &&
    value.packetId === packetId &&
    isNonEmptyString(value.actionId) &&
    isNonEmptyString(value.decisionId) &&
    isEnumValue(value.requestedActionType, humanGateActionTypes) &&
    isNonEmptyString(value.requestDisplayLabel) &&
    isNonEmptyString(value.requestedByLabel) &&
    isNonEmptyString(value.requestedAt) &&
    isEnumValue(value.status, humanGateActionRequestStatuses) &&
    isNonEmptyString(value.auditEventType) &&
    isStringArray(value.evidenceRefs) &&
    value.retentionClass === "metadata_only" &&
    hasExactBooleanFields(value, ["rawPayloadRetained", "executionStarted", "resultingStateApplied"], false) &&
    isStringArray(value.stopLines) &&
    isNonEmptyString(value.rollbackPath) &&
    isOptionalString(value.rejectionReason);
}

function isWorkPacketLaneCardV0(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const routeConfidenceValid = isOptionalNullableNumber(value.routeConfidence) &&
    (typeof value.routeConfidence !== "number" || (value.routeConfidence >= 0 && value.routeConfidence <= 1));
  return isNonEmptyString(value.laneId) &&
    isEnumValue(value.laneType, laneTypes) &&
    isNonEmptyString(value.label) &&
    isEnumValue(value.status, laneStatuses) &&
    isNonEmptyString(value.summary) &&
    isOptionalNullableEnum(value.currentOwner, workPacketOwners) &&
    routeConfidenceValid &&
    isStringArray(value.reasonCodes) &&
    isStringArray(value.evidenceRefs) &&
    isStringArray(value.artifactRefs);
}

function isMemoryProposalV0(value: unknown, packetId: string): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return isNonEmptyString(value.proposalId) &&
    value.packetId === packetId &&
    isNonEmptyString(value.label) &&
    isEnumValue(value.status, memoryProposalStatuses) &&
    isNonEmptyString(value.summary) &&
    isNonEmptyStringArray(value.sourceRefs) &&
    isNonEmptyStringArray(value.evidenceRefs) &&
    isAbsentOr(value.targetRef, isSourceRefV0) &&
    isNullableSafeReferenceString(value.targetVaultPath) &&
    isNonEmptyString(value.targetVaultFolder) &&
    isEnumValue(value.proposalType, memoryProposalTypes) &&
    isNonEmptyString(value.suggestedContentSummary) &&
    isNullableString(value.patchSummary) &&
    isEnumValue(value.sensitivity, memoryProposalSensitivities) &&
    isEnumValue(value.freshness, memoryProposalFreshnessValues) &&
    isEnumValue(value.contradictionStatus, memoryProposalContradictionStatuses) &&
    isEnumValue(value.confidence, memoryProposalConfidenceValues) &&
    isEnumValue(value.operatorAction, memoryProposalOperatorActions) &&
    isNullableString(value.decisionNeededContext) &&
    isNonEmptyString(value.backupRecoveryPath) &&
    isEnumValue(value.writeBackStatus, memoryProposalWriteBackStatuses) &&
    value.writeBackAllowed === false;
}

function isWorkPacketReviewSummaryV0(value: unknown): boolean {
  return isRecord(value) &&
    isEnumValue(value.reviewer, workPacketOwners) &&
    isEnumValue(value.status, reviewStatuses) &&
    isNonEmptyString(value.summary) &&
    isStringArray(value.evidenceRefs) &&
    isStringArray(value.artifactRefs);
}

function isRecoveryActionV0(value: unknown): boolean {
  return isRecord(value) &&
    isNonEmptyString(value.actionId) &&
    isEnumValue(value.actionType, recoveryActionTypes) &&
    isNonEmptyString(value.label) &&
    isEnumValue(value.availability, actionAvailabilityValues) &&
    isNonEmptyString(value.consequence) &&
    isEnumValue(value.resultingStage, pipelineStages) &&
    isEnumValue(value.resultingOwner, workPacketOwners) &&
    isStringArray(value.evidenceRefs);
}

function isWorkPacketExecutionAttemptSummaryV0(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return ["attemptId", "workItemId", "routeDecisionId", "workerId", "lane", "authorityMode", "createdAt", "updatedAt"]
    .every((field) => isNonEmptyString(value[field])) &&
    isNullableSafeReferenceString(value.leaseId) &&
    (value.fencingToken === undefined || value.fencingToken === null || (Number.isInteger(value.fencingToken) && (value.fencingToken as number) >= 0)) &&
    isEnumValue(value.status, executionAttemptStatuses) &&
    ["requestedById", "requestedByLabel", "startedAt", "completedAt", "heartbeatAt", "timeoutAt", "cancelRequestedAt", "cancelReason", "rejectionReason", "failureReason"]
      .every((field) => isNullableString(value[field])) &&
    isStringArray(value.evidenceRefs) &&
    isStringArray(value.artifactRefs);
}

function isWorkPacketStageTransitionEventV0(value: unknown): boolean {
  return isRecord(value) &&
    ["eventId", "eventType", "summary", "createdAt"].every((field) => isNonEmptyString(value[field])) &&
    isOptionalNullableEnum(value.sourceStage, pipelineStages) &&
    isEnumValue(value.targetStage, pipelineStages) &&
    isOptionalNullableEnum(value.sourceOwner, workPacketOwners) &&
    isEnumValue(value.targetOwner, workPacketOwners) &&
    isOptionalNullableEnum(value.sourceStatus, workPacketStatuses) &&
    isEnumValue(value.targetStatus, workPacketStatuses) &&
    isStringArray(value.reasonCodes) &&
    isStringArray(value.evidenceRefs) &&
    typeof value.durable === "boolean" &&
    isNullableSafeReferenceString(value.sourceEventId) &&
    isNullableString(value.actorLabel);
}

function isWorkPacketLoopStopStateV0(value: unknown): boolean {
  return isRecord(value) &&
    ["stopStateId", "label", "phase", "summary", "stopLine", "nextSafeAction"].every((field) => isNonEmptyString(value[field])) &&
    isEnumValue(value.kind, loopStopKinds) &&
    isEnumValue(value.severity, loopStopSeverities) &&
    isStringArray(value.evidenceRefs) &&
    value.metadataOnly === true &&
    hasExactBooleanFields(value, ["sourceMutationAllowed", "providerCallsAllowed", "workerLaunchAllowed", "githubMutationAllowed", "cleanupAllowed"], false);
}

function isWorkPacketDeliveryEvidenceV0(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const optionalStringFields = [
    "targetBranch", "baseBranch", "pullRequestUrl", "expectedHeadRevision", "pullRequestHeadRevision", "ciStatus",
    "reviewState", "mergeStatus", "mergeResult", "cleanupDryRunStatus", "cleanupTarget",
  ];
  return isNonEmptyString(value.evidenceId) &&
    value.mode === "metadata_only" &&
    (value.actionId === undefined || value.actionId === null || value.actionId === "pr" || value.actionId === "merge" || value.actionId === "cleanup") &&
    isNonEmptyString(value.status) &&
    optionalStringFields.every((field) => [
      "targetBranch", "baseBranch", "pullRequestUrl", "expectedHeadRevision", "pullRequestHeadRevision", "cleanupTarget",
    ].includes(field)
      ? isNullableSafeReferenceString(value[field])
      : isNullableString(value[field])) &&
    typeof value.readyForApproval === "boolean" &&
    typeof value.hasDeliveryExecutionEvidence === "boolean" &&
    isStringArray(value.evidenceRefs) &&
    isStringArray(value.artifactRefs) &&
    isStringArray(value.retainedEvidence) &&
    isStringArray(value.blockedReasons) &&
    isNonEmptyString(value.recoveryPath) &&
    hasExactBooleanFields(value, ["deliveryRailsGrantAuthority", "rawPayloadRetained", "remoteMutationApproved", "mergeApproved", "cleanupApproved"], false) &&
    isAbsentOr(value.mergeGate, isWorkPacketDeliveryMergeGateV0) &&
    isAbsentOr(value.cleanupDryRunGate, isWorkPacketCleanupDryRunGateV0);
}

function isWorkPacketDeliveryMergeGateV0(value: unknown): boolean {
  return isRecord(value) &&
    (value.status === "passed" || value.status === "blocked") &&
    typeof value.lowRiskReady === "boolean" &&
    Array.isArray(value.criteria) &&
    value.criteria.every(isWorkPacketDeliveryGateCriterionV0) &&
    isStringArray(value.blockedReasons) &&
    isNonEmptyString(value.recoveryPath) &&
    value.metadataOnly === true &&
    value.mergeApproved === false;
}

function isWorkPacketDeliveryGateCriterionV0(value: unknown): boolean {
  return isRecord(value) &&
    isNonEmptyString(value.criterionId) &&
    isNonEmptyString(value.label) &&
    (value.status === "passed" || value.status === "blocked") &&
    isStringArray(value.evidence) &&
    isNullableString(value.blockedReason);
}

function isWorkPacketCleanupDryRunGateV0(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return (value.status === "passed" || value.status === "blocked") &&
    typeof value.dryRunMatchesPolicy === "boolean" &&
    ["expectedPr", "expectedOwner", "expectedWorktree", "expectedLocalBranch", "expectedRemoteBranch", "expectedHeadRevision"]
      .every((field) => isNullableSafeReferenceString(value[field])) &&
    isStringArray(value.blockedReasons) &&
    isNonEmptyString(value.recoveryPath) &&
    value.metadataOnly === true &&
    value.cleanupApproved === false;
}

function isWorkPacketLearnOutcomeV0(value: unknown): boolean {
  return isRecord(value) &&
    isNonEmptyString(value.outcomeId) &&
    isEnumValue(value.status, learnOutcomeStatuses) &&
    value.retentionClass === "metadata_only" &&
    Number.isInteger(value.learningProposalCount) &&
    (value.learningProposalCount as number) >= 0 &&
    (value.documentationProposalStatus === "not_present" || isEnumValue(value.documentationProposalStatus, memoryProposalStatuses)) &&
    isEnumValue(value.automationAuthorityChangeStatus, automationAuthorityChangeStatuses) &&
    (value.blockedWriteBackState === "not_applicable" || isEnumValue(value.blockedWriteBackState, memoryProposalWriteBackStatuses)) &&
    isNonEmptyString(value.nextSafeAction) &&
    Array.isArray(value.decisionRecords) &&
    value.decisionRecords.every(isWorkPacketLearnDecisionRecordV0) &&
    isStringArray(value.evidenceRefs) &&
    isStringArray(value.sourceRefs) &&
    hasExactBooleanFields(value, ["canonicalMutationAllowed", "sourceMutationAllowed", "providerCallsAllowed", "durableWriteAllowed"], false);
}

function isWorkPacketLearnDecisionRecordV0(value: unknown): boolean {
  return isRecord(value) &&
    ["decisionId", "proposalId", "actor", "recoveryPath"].every((field) => isNonEmptyString(value[field])) &&
    isEnumValue(value.proposalType, memoryProposalTypes) &&
    isEnumValue(value.result, memoryProposalStatuses) &&
    isEnumValue(value.operatorAction, memoryProposalOperatorActions) &&
    isStringArray(value.evidenceRefs) &&
    isEnumValue(value.writeBackStatus, memoryProposalWriteBackStatuses) &&
    hasExactBooleanFields(value, ["canonicalMutationAllowed", "durableWriteAllowed"], false);
}

function isWorkPacketLearnRefillProjectionV0(value: unknown, packetId: string): boolean {
  return isRecord(value) &&
    isNonEmptyString(value.projectionId) &&
    value.retentionClass === "metadata_only" &&
    Array.isArray(value.followUpCandidates) &&
    value.followUpCandidates.every((candidate) => isWorkPacketLearnFollowUpCandidateV0(candidate, packetId)) &&
    Array.isArray(value.operatorOwnedExits) &&
    value.operatorOwnedExits.every((exit) => isWorkPacketOperatorOwnedExitV0(exit, packetId)) &&
    isWorkPacketRefillSourceStateV0(value.refillSourceState) &&
    isWorkPacketHousekeepingV0(value.housekeeping) &&
    isWorkPacketSourceExhaustionV0(value.sourceExhaustion) &&
    isAbsentOr(value.readyToTest, isWorkPacketReadyToTestV0) &&
    isNonEmptyString(value.nextSafeAction) &&
    value.rawPayloadRetained === false &&
    hasExactBooleanFields(value, ["sourceMutationAllowed", "providerCallsAllowed", "workerLaunchAllowed", "githubMutationAllowed"], false);
}

function isWorkPacketLearnFollowUpCandidateV0(value: unknown, packetId: string): boolean {
  return isRecord(value) &&
    ["followUpId", "candidateWorkId", "label", "reason"].every((field) => isNonEmptyString(value[field])) &&
    value.sourcePacketId === packetId &&
    isEnumValue(value.status, learnFollowUpStatuses) &&
    isEnumValue(value.origin, learnFollowUpOrigins) &&
    isEnumValue(value.reentryPath, learnReentryPaths) &&
    isStringArray(value.evidenceRefs) &&
    value.metadataOnly === true &&
    value.rawPayloadRetained === false;
}

function isWorkPacketOperatorOwnedExitV0(value: unknown, packetId: string): boolean {
  return isRecord(value) &&
    isNonEmptyString(value.exitId) &&
    value.sourcePacketId === packetId &&
    value.state === "operator_owned" &&
    isNonEmptyString(value.reason) &&
    (value.stopStateKind === "operator_owned_exit" || isEnumValue(value.stopStateKind, loopStopKinds)) &&
    value.reentryPath === "reenter_capture" &&
    isStringArray(value.evidenceRefs) &&
    value.metadataOnly === true &&
    value.rawPayloadRetained === false;
}

function isWorkPacketRefillSourceStateV0(value: unknown): boolean {
  return isRecord(value) &&
    isEnumValue(value.state, refillSourceStates) &&
    isNonEmptyString(value.operationalLabel) &&
    isNonEmptyString(value.explanation) &&
    isStringArray(value.sourceRefs) &&
    isStringArray(value.evidenceRefs) &&
    value.metadataOnly === true;
}

function isWorkPacketHousekeepingV0(value: unknown): boolean {
  return isRecord(value) &&
    isEnumValue(value.status, housekeepingStatuses) &&
    isNonEmptyString(value.summary) &&
    isStringArray(value.evidenceRefs) &&
    value.metadataOnly === true;
}

function isWorkPacketSourceExhaustionV0(value: unknown): boolean {
  return isRecord(value) &&
    typeof value.exhausted === "boolean" &&
    isNonEmptyString(value.summary) &&
    isStringArray(value.sourceRefs) &&
    isStringArray(value.evidenceRefs) &&
    value.metadataOnly === true;
}

function isWorkPacketReadyToTestV0(value: unknown): boolean {
  return isRecord(value) &&
    ["readyId", "userFacingSummary", "testableSurface"].every((field) => isNonEmptyString(value[field])) &&
    isStringArray(value.verificationRefs) &&
    isStringArray(value.evidenceRefs) &&
    value.metadataOnly === true &&
    value.rawPayloadRetained === false;
}

function isAlphaMemorySourceStatusV0(value: unknown): boolean {
  return isRecord(value) &&
    isNonEmptyString(value.statusId) &&
    value.authorityFamily === "memory-writeback-and-source-mutation" &&
    (value.operationMode === "dry_run" || value.operationMode === "read_only" || value.operationMode === "draft_preview") &&
    (value.decisionState === "ready" || value.decisionState === "blocked" || value.decisionState === "not_configured") &&
    value.retentionClass === "metadata_only" &&
    isStringArray(value.sourceRefs) &&
    isRecord(value.targetMetadata) &&
    isNonEmptyString(value.backupPath) &&
    isNonEmptyString(value.rollbackPath) &&
    isNonEmptyString(value.auditEventSummary) &&
    isStringArray(value.blockedReasons) &&
    isStringArray(value.recoveryOptions) &&
    isStringArray(value.evidenceRefs) &&
    hasExactBooleanFields(value, ["canonicalMutationAllowed", "sourceMutationAllowed", "providerCallsAllowed", "workerLaunchAllowed", "githubCallsAllowed", "networkEgressAllowed"], false) &&
    isAbsentOr(value.llmWikiReadiness, isLlmWikiDerivedIndexReadinessV0);
}

function isLlmWikiDerivedIndexReadinessV0(value: unknown): boolean {
  return isRecord(value) &&
    isNonEmptyString(value.statusId) &&
    value.operationMode === "read_only" &&
    (value.decisionState === "ready" || value.decisionState === "blocked" || value.decisionState === "not_configured") &&
    value.canonicality === "derived_disposable_rebuildable" &&
    value.retentionClass === "metadata_only" &&
    ["sourceRefs", "evidenceRefs", "memoryProposalRefs", "allowedInputs", "blockedReasons", "nextActions"].every((field) => isStringArray(value[field])) &&
    isNonEmptyString(value.boundarySummary) &&
    hasExactBooleanFields(value, ["canonicalMutationAllowed", "sourceMutationAllowed", "providerCallsAllowed", "durableWriteAllowed"], false) &&
    isAbsentOr(value.rebuildPreview, isRecord) &&
    isAbsentOr(value.rebuildDryRunPlan, isLlmWikiRebuildDryRunPlanV0);
}

function isLlmWikiRebuildDryRunPlanV0(value: unknown): boolean {
  return isRecord(value) &&
    isNonEmptyString(value.planId) &&
    value.operationMode === "dry_run" &&
    isSafeReferenceArray(value.inputRefs) &&
    isSafeReferenceArray(value.memoryProposalRefs) &&
    isStringArray(value.plannedDerivedSections) &&
    isSafeReferenceString(value.disposableTargetNamespace) &&
    isSafeReferenceString(value.derivedTargetFolder) &&
    isEnumValue(value.freshness, memoryProposalFreshnessValues) &&
    isStringArray(value.rebuildBasis) &&
    value.rebuildBasis.every((basis) => isEnumValue(basis, llmWikiRebuildBasisValues)) &&
    value.retentionClass === "metadata_only" &&
    isStringArray(value.stopLines) &&
    isNonEmptyString(value.discardRecoveryPath) &&
    isNonEmptyString(value.auditEventSummary) &&
    hasExactBooleanFields(
      value,
      [
        "canonicalMutationAllowed",
        "sourceMutationAllowed",
        "providerCallsAllowed",
        "workerLaunchAllowed",
        "githubCallsAllowed",
        "networkEgressAllowed",
        "durableWriteAllowed",
        "writePerformed",
        "backupCreated",
      ],
      false,
    );
}

function isWorkPacketGateStateValidationV0(value: unknown): boolean {
  return isRecord(value) &&
    isEnumValue(value.status, gateValidationStatuses) &&
    isEnumValue(value.storedStage, pipelineStages) &&
    isOptionalNullableEnum(value.derivedStage, pipelineStages) &&
    isEnumValue(value.storedOwner, workPacketOwners) &&
    isOptionalNullableEnum(value.derivedOwner, workPacketOwners) &&
    isEnumValue(value.storedStatus, workPacketStatuses) &&
    isOptionalNullableEnum(value.derivedStatus, workPacketStatuses) &&
    Number.isInteger(value.eventCount) &&
    (value.eventCount as number) >= 0 &&
    isNullableString(value.latestEventType) &&
    isStringArray(value.replayedEventTypes) &&
    isStringArray(value.mismatchReasons) &&
    isStringArray(value.blockedReasons) &&
    Array.isArray(value.refStates) &&
    value.refStates.every(isGateReplayRefStateV0View) &&
    value.readOnly === true &&
    hasExactBooleanFields(value, ["sourceMutationAllowed", "providerCallsAllowed", "workerLaunchAllowed"], false);
}

function isGateReplayRefStateV0View(value: unknown): boolean {
  return isRecord(value) &&
    isNonEmptyString(value.refId) &&
    isEnumValue(value.refType, gateRefTypes) &&
    isEnumValue(value.state, gateRefStates) &&
    isNonEmptyString(value.label) &&
    isNullableString(value.blockingReason);
}

function isSourceRefV0(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const ref = value as Record<string, unknown>;
  if (
    !isSafeReferenceString(ref.refId) ||
    !isEnumValue(ref.sourceType, sourceRefTypes) ||
    typeof ref.label !== "string" ||
    !isEnumValue(ref.freshness, sourceFreshnessValues) ||
    !isEnumValue(ref.accessState, sourceAccessStates) ||
    typeof ref.canonical !== "boolean" ||
    typeof ref.summaryOnly !== "boolean" ||
    !isNullableSafeReferenceString(ref.pathOrUrl) ||
    !isNullableString(ref.blockedReason)
  ) {
    return false;
  }
  if (isSyntheticRuntimeIdentity(ref.refId) || isSyntheticRuntimeIdentity(ref.pathOrUrl)) {
    return false;
  }
  if (ref.accessState === "allowed") {
    return ref.blockedReason === null || typeof ref.blockedReason === "undefined";
  }
  return ref.summaryOnly === true &&
    (ref.pathOrUrl === null || typeof ref.pathOrUrl === "undefined") &&
    typeof ref.blockedReason === "string" &&
    ref.blockedReason.trim().length > 0;
}

function isEvidenceRefV0(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const ref = value as Record<string, unknown>;
  return isSafeReferenceString(ref.refId) &&
    isEnumValue(ref.evidenceType, evidenceRefTypes) &&
    typeof ref.label === "string" &&
    isNullableSafeReferenceString(ref.artifactPath) &&
    isEnumValue(ref.retentionClass, evidenceRetentionClasses) &&
    ref.rawPayloadRetained === false;
}

function isArtifactRefV0(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const ref = value as Record<string, unknown>;
  return isSafeReferenceString(ref.refId) &&
    isEnumValue(ref.artifactType, artifactRefTypes) &&
    typeof ref.label === "string" &&
    isNullableSafeReferenceString(ref.pathOrUrl) &&
    isEnumValue(ref.status, artifactRefStatuses);
}

function reachableNestedWorkPacketFieldsAreSafe(packet: Partial<WorkPacketV0View>): boolean {
  const lifecycleState = packet.lifecycleState;
  if (!lifecycleState) {
    return false;
  }
  if (
    lifecycleState.stage !== packet.currentStage ||
    lifecycleState.owner !== packet.currentOwner ||
    lifecycleState.status !== packet.status ||
    lifecycleState.metadataOnly !== true ||
    lifecycleState.sourceMutationAllowed !== false ||
    lifecycleState.providerCallsAllowed !== false ||
    lifecycleState.workerLaunchAllowed !== false ||
    lifecycleState.githubMutationAllowed !== false ||
    lifecycleState.cleanupAllowed !== false
  ) {
    return false;
  }
  return !hasFixtureMarkersInReachableNestedFields(packet);
}

function hasFixtureMarkersInReachableNestedFields(packet: Partial<WorkPacketV0View> | Record<string, unknown>): boolean {
  const ancestors = new Set<object>();

  function visit(value: unknown, fieldName?: string): boolean {
    if (typeof value === "string") {
      return fieldName !== undefined && isReferenceBearingField(fieldName) && isSyntheticRuntimeIdentity(value);
    }
    if (!value || typeof value !== "object") {
      return false;
    }
    if (ancestors.has(value)) {
      return false;
    }
    ancestors.add(value);
    const hasFixtureMarker = Array.isArray(value)
      ? value.some((item) => visit(item, fieldName))
      : Object.entries(value as Record<string, unknown>).some(([key, nestedValue]) =>
          isFixtureDiscriminator(key, nestedValue) || visit(nestedValue, key)
        );
    ancestors.delete(value);
    return hasFixtureMarker;
  }

  return visit(packet);
}

function isFixtureDiscriminator(fieldName: string, value: unknown): boolean {
  const normalizedFieldName = fieldName.toLowerCase();
  const normalizedValue = typeof value === "string" ? value.trim().toLowerCase() : value;
  return normalizedFieldName === "fixtureid" ||
    normalizedFieldName === "fixturekind" ||
    normalizedFieldName === "fixturelabel" ||
    (normalizedFieldName === "sourcekind" && normalizedValue === "demo-fixture") ||
    (normalizedFieldName === "evidencetype" && normalizedValue === "fixture") ||
    (normalizedFieldName === "retentionclass" && normalizedValue === "fixture") ||
    (normalizedFieldName === "artifacttype" && normalizedValue === "fixture");
}

function isReferenceBearingField(fieldName: string): boolean {
  const normalizedFieldName = fieldName.toLowerCase();
  return referenceBearingFieldNames.has(normalizedFieldName) ||
    normalizedFieldName === "retainedevidence" ||
    /(?:paths?|urls?|uris?|hrefs?|refs?|ids?|namespaces?)$/.test(normalizedFieldName);
}

function isEnumValue(value: unknown, allowedValues: ReadonlySet<string>): value is string {
  return typeof value === "string" && allowedValues.has(value);
}

function firstDuplicatePacketId(packets: readonly WorkPacketV0View[]): string | null {
  const seen = new Set<string>();
  for (const packet of packets) {
    if (seen.has(packet.packetId)) {
      return packet.packetId;
    }
    seen.add(packet.packetId);
  }
  return null;
}

function projectSupervisorWorkPacketToCockpitPacket(packet: WorkPacketV0View): PipelineRuntimePacket {
  if (!isWorkPacketV0View(packet)) {
    throw new TypeError("Malformed supervisor WorkPacketV0 row.");
  }
  const sourceTrustStates = sourceTrustStatesFor(packet);
  const freshnessLabel = freshnessLabelFor(packet);
  const confidenceScore = packet.routeSummary?.confidenceScore ?? 0.5;
  const reasonCodes = supervisorReasonCodes(packet);
  return {
    ...packet,
    sourceKind: "supervisor-runtime",
    sourceId: packet.packetId,
    fixtureLabel: "Supervisor runtime",
    summary: packet.routeSummary?.recommendation
      ? `Supervisor route recommendation: ${packet.routeSummary.recommendation}.`
      : packet.requestedOutcome,
    nextAction: supervisorNextAction(packet),
    confidenceLabel: packet.routeSummary?.confidenceBand ?? confidenceLabelFor(confidenceScore),
    freshnessLabel,
    sourceTrustState: sourceTrustStates[0] ?? "included",
    sourceTrustStates,
    sourceTrustSummary: sourceTrustSummaryFor(packet),
    routeFork: {
      selectedRoute: packet.routeSummary?.recommendation ?? packet.currentStage,
      rejectedRoutes: rejectedRoutesFor(packet.currentStage),
      tags: ["supervisor runtime", packet.currentStage, packet.currentOwner, packet.status],
      sourceContext: sourceTrustSummaryFor(packet),
      lowConfidenceActions: confidenceScore < 0.5 ? ["Clarify", "Downgrade to reference", "Send back to Research"] : [],
    },
    lastEvent: `Supervisor WorkPacket projection rendered from ${reasonCodes[0]}.`,
    riskFlags: riskFlagsFor(packet.riskLevel, freshnessLabel),
    matrixRowIds: reasonCodes,
    humanGateFixtureEvents: [],
    recoveryFixtureEvents: [],
    actionGuardFixtures: [],
    localModelHealth: null,
    hermesJob: null,
    codexWorker: null,
    claudeReview: null,
    loopStopStates: packet.loopStopStates ?? [],
  };
}

function supervisorReasonCodes(packet: WorkPacketV0View): string[] {
  const reasonCodes = packet.routeSummary?.reasonCodes
    ?.filter((code): code is string => typeof code === "string" && code.trim().length > 0)
    .map((code) => code.trim());
  return reasonCodes?.length ? reasonCodes : [`supervisor.${packet.currentStage}`];
}

function sourceTrustStatesFor(packet: WorkPacketV0View): PipelineSourceTrustState[] {
  const states = packet.sourceRefs.map((ref): PipelineSourceTrustState => {
    if (ref.accessState === "missing" || ref.accessState === "blocked") {
      return "unavailable";
    }
    if (ref.accessState === "excluded") {
      return "excluded";
    }
    if (ref.freshness === "stale") {
      return "stale";
    }
    if (ref.sourceType === "llm_wiki") {
      return "derived-only";
    }
    return "included";
  });
  return Array.from(new Set(states.length > 0 ? states : ["included"]));
}

function sourceTrustSummaryFor(packet: WorkPacketV0View): string {
  const sourceCount = packet.sourceRefs.length;
  const restrictedCount = packet.sourceRefs.filter((ref) => ref.accessState !== "allowed").length;
  if (sourceCount === 0) {
    return "Supervisor packet has no source refs attached yet.";
  }
  if (restrictedCount > 0) {
    return `${restrictedCount} of ${sourceCount} supervisor source refs are restricted or unavailable.`;
  }
  return `${sourceCount} supervisor source refs are available as summary-only metadata.`;
}

function freshnessLabelFor(packet: WorkPacketV0View): string {
  if (packet.sourceRefs.some((ref) => ref.freshness === "stale")) {
    return "stale";
  }
  if (packet.sourceRefs.some((ref) => ref.freshness === "unknown")) {
    return "unknown";
  }
  return "fresh";
}

function confidenceLabelFor(confidenceScore: number): string {
  if (confidenceScore >= 0.75) {
    return "High confidence";
  }
  if (confidenceScore < 0.5) {
    return "Low confidence";
  }
  return "Medium confidence";
}

function supervisorNextAction(packet: WorkPacketV0View): string {
  const availableHumanGateAction = packet.humanGateActions.find((action) => action.status === "available");
  if (availableHumanGateAction) {
    return availableHumanGateAction.label;
  }
  const recoveryAction = packet.recoveryActions.find((action) => action.availability === "available");
  if (recoveryAction) {
    return recoveryAction.label;
  }
  return packet.routeSummary?.recommendation ?? plainStageLabel(packet.currentStage);
}

function plainStageLabel(stage: PipelineStage): string {
  return stage
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function rejectedRoutesFor(stage: PipelineStage) {
  const pipelineStages: PipelineStage[] = ["capture", "classify", "route", "shape", "human_gate", "execute", "review", "promote", "deliver", "learn"];
  return pipelineStages.filter((candidate) => candidate !== stage).slice(0, 3);
}

function riskFlagsFor(riskLevel: WorkPacketV0View["riskLevel"], freshnessLabel: string) {
  const flags = [`${riskLevel} risk`];
  if (freshnessLabel !== "fresh") {
    flags.push(freshnessLabel);
  }
  return flags;
}
