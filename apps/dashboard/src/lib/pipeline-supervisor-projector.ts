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
const lifecycleSources = new Set(["candidate_work", "work_item", "execution_attempt", "workflow_event", "memory_proposal", "delivery_evidence", "source_missing"]);
const workPacketOwners = new Set(["kendall", "operator", "local_model", "hermes_worker_mock", "codex_worker", "claude_reviewer", "github", "memory_review", "blocked"]);
const workPacketStatuses = new Set(["active", "waiting", "blocked", "failed", "complete", "deferred"]);
const riskLevels = new Set(["low", "medium", "high"]);
const priorities = new Set(["low", "normal", "high", "urgent"]);
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
const workPacketReferenceProvenances = new Set(["candidate_work", "work_item"]);
const refillSourceStates = new Set(["healthy", "source_exhausted", "blocked", "refilling", "unknown"]);
const housekeepingStatuses = new Set(["not_applicable", "complete", "blocked", "running", "unknown"]);
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
function isWorkPacketV0View(value: unknown): value is WorkPacketV0View {
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
    isAbsentOr(packet.routeSummary, isWorkPacketRouteSummaryV0) &&
    isAbsentOr(packet.deliveryEvidence, isWorkPacketDeliveryEvidenceV0) &&
    isAbsentOr(packet.learnOutcome, isWorkPacketLearnOutcomeV0) &&
    isAbsentOr(packet.learnRefill, isWorkPacketLearnRefillProjectionV0) &&
    isAbsentOr(packet.alphaMemorySourceStatus, isAlphaMemorySourceStatusV0) &&
    isAbsentOr(packet.gateStateValidation, isWorkPacketGateStateValidationV0) &&
    lifecycleState !== null &&
    typeof lifecycleState === "object" &&
    isEnumValue(lifecycleState.source, lifecycleSources) &&
    isEnumValue(lifecycleState.stage, pipelineStages) &&
    isEnumValue(lifecycleState.owner, workPacketOwners) &&
    isEnumValue(lifecycleState.status, workPacketStatuses) &&
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
  return hasFixtureOnlyRefs(packet) ||
    hasFixtureMarkersInReachableNestedFields(packet);
}

function hasFixtureOnlyRefs(value: unknown, visited = new Set<object>()): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => hasFixtureOnlyRefs(item, visited));
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  if (visited.has(value)) {
    return false;
  }
  visited.add(value);
  const record = value as Record<string, unknown>;
  if (isSyntheticRuntimeIdentity(record.refId) ||
    isSyntheticRuntimeIdentity(record.sourceRef) ||
    isSyntheticRuntimeIdentity(record.pathOrUrl) ||
    isSyntheticRuntimeIdentity(record.artifactPath) ||
    record.evidenceType === "fixture" ||
    record.retentionClass === "fixture" ||
    record.artifactType === "fixture") {
    return true;
  }
  return Object.values(record).some((child) => hasFixtureOnlyRefs(child, visited));
}

function isSyntheticRuntimeIdentity(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith("fixture:") || normalized.startsWith("demo:");
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

function isAbsentOr(value: unknown, predicate: (candidate: unknown) => boolean): boolean {
  return value === undefined || value === null || predicate(value);
}

function hasExactBooleanFields(record: Record<string, unknown>, fields: readonly string[], expected: boolean): boolean {
  return fields.every((field) => record[field] === expected);
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
    isNullableString(value.targetVaultPath) &&
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
    isNullableString(value.leaseId) &&
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
    isNullableString(value.sourceEventId) &&
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
    optionalStringFields.every((field) => isNullableString(value[field])) &&
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
      .every((field) => isNullableString(value[field])) &&
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

function isWorkPacketLearnRefillProjectionV0(value: unknown): boolean {
  return isRecord(value) &&
    isNonEmptyString(value.projectionId) &&
    value.retentionClass === "metadata_only" &&
    Array.isArray(value.followUpCandidates) &&
    value.followUpCandidates.every(isWorkPacketLearnFollowUpCandidateV0) &&
    Array.isArray(value.operatorOwnedExits) &&
    value.operatorOwnedExits.every(isWorkPacketOperatorOwnedExitV0) &&
    isWorkPacketRefillSourceStateV0(value.refillSourceState) &&
    isWorkPacketHousekeepingV0(value.housekeeping) &&
    isWorkPacketSourceExhaustionV0(value.sourceExhaustion) &&
    isAbsentOr(value.readyToTest, isWorkPacketReadyToTestV0) &&
    isNonEmptyString(value.nextSafeAction) &&
    value.rawPayloadRetained === false &&
    hasExactBooleanFields(value, ["sourceMutationAllowed", "providerCallsAllowed", "workerLaunchAllowed", "githubMutationAllowed"], false);
}

function isWorkPacketReferenceV0(value: unknown): boolean {
  if (!isNonEmptyString(value) || value !== value.trim() || value.length > 200 || /[\s/\\\0]/.test(value) || isSyntheticRuntimeIdentity(value)) {
    return false;
  }
  const separatorIndex = value.indexOf(":");
  return separatorIndex > 0 &&
    workPacketReferenceProvenances.has(value.slice(0, separatorIndex)) &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value.slice(separatorIndex + 1));
}

function isWorkPacketLearnFollowUpCandidateV0(value: unknown): boolean {
  return isRecord(value) &&
    ["followUpId", "candidateWorkId", "label", "reason"].every((field) => isNonEmptyString(value[field])) &&
    isWorkPacketReferenceV0(value.sourcePacketId) &&
    isEnumValue(value.status, learnFollowUpStatuses) &&
    isEnumValue(value.origin, learnFollowUpOrigins) &&
    isEnumValue(value.reentryPath, learnReentryPaths) &&
    isStringArray(value.evidenceRefs) &&
    value.metadataOnly === true &&
    value.rawPayloadRetained === false;
}

function isWorkPacketOperatorOwnedExitV0(value: unknown): boolean {
  return isRecord(value) &&
    isNonEmptyString(value.exitId) &&
    isWorkPacketReferenceV0(value.sourcePacketId) &&
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
    isAbsentOr(value.rebuildDryRunPlan, isRecord);
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
    typeof ref.refId !== "string" ||
    !isEnumValue(ref.sourceType, sourceRefTypes) ||
    typeof ref.label !== "string" ||
    !isEnumValue(ref.freshness, sourceFreshnessValues) ||
    !isEnumValue(ref.accessState, sourceAccessStates) ||
    typeof ref.canonical !== "boolean" ||
    typeof ref.summaryOnly !== "boolean" ||
    !isNullableString(ref.pathOrUrl) ||
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
  return typeof ref.refId === "string" &&
    !isSyntheticRuntimeIdentity(ref.refId) &&
    !isSyntheticRuntimeIdentity(ref.artifactPath) &&
    isEnumValue(ref.evidenceType, evidenceRefTypes) &&
    typeof ref.label === "string" &&
    isNullableString(ref.artifactPath) &&
    isEnumValue(ref.retentionClass, evidenceRetentionClasses) &&
    ref.rawPayloadRetained === false;
}

function isArtifactRefV0(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const ref = value as Record<string, unknown>;
  return typeof ref.refId === "string" &&
    !isSyntheticRuntimeIdentity(ref.refId) &&
    !isSyntheticRuntimeIdentity(ref.pathOrUrl) &&
    isEnumValue(ref.artifactType, artifactRefTypes) &&
    typeof ref.label === "string" &&
    isNullableString(ref.pathOrUrl) &&
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
  return fieldName === "fixtureId" ||
    fieldName === "fixtureKind" ||
    fieldName === "fixtureLabel" ||
    (fieldName === "sourceKind" && value === "demo-fixture") ||
    (fieldName === "evidenceType" && value === "fixture") ||
    (fieldName === "retentionClass" && value === "fixture") ||
    (fieldName === "artifactType" && value === "fixture");
}

function isReferenceBearingField(fieldName: string): boolean {
  return fieldName !== "fixtureId" && (
    fieldName === "pathOrUrl" ||
    fieldName === "artifactPath" ||
    fieldName === "targetVaultPath" ||
    fieldName === "retainedEvidence" ||
    fieldName.endsWith("Ref") ||
    fieldName.endsWith("Refs") ||
    fieldName.endsWith("Id") ||
    fieldName.endsWith("Ids")
  );
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
