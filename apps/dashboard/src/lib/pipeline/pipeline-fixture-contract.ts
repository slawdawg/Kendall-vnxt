import type {
  AlphaMemorySourceStatusV0,
  ArtifactRefV0,
  CandidateWorkView,
  EvidenceRefV0,
  HumanGateActionRequestV0,
  HumanGateActionV0,
  MemoryProposalV0,
  PipelineStage,
  RecoveryActionV0,
  RoutingPreviewView,
  SourceRefV0,
  TaskPacketV0View,
  WorkItemView,
  WorkPacketDeliveryEvidenceV0,
  WorkPacketExecutionAttemptSummaryV0,
  WorkPacketGateStateValidationV0,
  WorkPacketLaneCardV0,
  WorkPacketLearnOutcomeV0,
  WorkPacketLearnRefillProjectionV0,
  WorkPacketLoopStopStateV0,
  WorkPacketOwner,
  WorkPacketReviewSummaryV0,
  WorkPacketStageTransitionEventV0,
  WorkPacketStatus,
} from "@kendall/contracts";

/** Static dashboard demo packets have their own versioned DTO and never reuse the supervisor envelope. */
export const PIPELINE_FIXTURE_SCHEMA_VERSION = "dashboard-pipeline-fixture/v1" as const;

export type PipelineFixtureKind =
  | "fixture-only"
  | "mocked"
  | "synthetic"
  | "local-readiness"
  | "future-real-source";

export type PipelineSourceTrustState =
  | "included"
  | "excluded"
  | "stale"
  | "contradictory"
  | "unavailable"
  | "derived-only";

export type PipelineRouteForkFixture = {
  selectedRoute: string;
  rejectedRoutes: string[];
  tags: string[];
  sourceContext: string;
  lowConfidenceActions: string[];
};

export type PipelineSourceRailItem = {
  id: string;
  label: string;
  state: PipelineSourceTrustState;
  summary: string;
  packetRefs: string[];
  evidenceNote: string;
  canonicalRole: string;
};

export type SourceBoundaryDeclarationV0 = {
  boundaryId: "work_packet_v0" | "obsidian" | "llm_wiki" | "hermes" | "ollama" | "codex" | "claude";
  label: string;
  canonicality: string;
  allowedReads: string[];
  allowedWrites: string[];
  retentionClass: "metadata_only" | "summary_only" | "derived_rebuildable" | "human_owned" | "fixture_only";
  blockedOperations: string[];
  boundarySummary: string;
};

export type LocalModelHealthV0 = {
  provider: "ollama";
  endpointUrl: string | null;
  approvedEndpointUrl: string;
  endpointApproved: boolean;
  modelId: string | null;
  approvedModelId: string;
  modelApproved: boolean;
  reachable: boolean | null;
  busyState: "idle" | "busy" | "unknown";
  allowedCaller: string;
  lastLatencyMs?: number | null;
  lastFailure?: string | null;
  callAuthorityState: "disabled" | "approval_required" | "approved" | "blocked";
  retentionPolicy: "metadata_only";
  statusLabel: "healthy" | "unavailable" | "busy" | "model_mismatch" | "endpoint_mismatch" | "approval_required";
  dataSource: "fixture_or_wrapper_state_only";
  evidenceRef: string;
  fallbackPath: string;
  authoritySummary: string;
  noProbeBoundary: "Dashboard does not probe the Windows Ollama endpoint";
};

export type HermesJobPacketV0 = {
  jobId: string;
  packetId: string;
  workerProfile: string;
  inputRefs: string[];
  allowedMounts: string[];
  writableOutputDir: string;
  networkPolicy: "none" | "kendall_gateway_only";
  credentialPolicy: "none";
  sourceMutationPolicy: "forbidden";
  timeoutSeconds: number;
  expectedOutputSchema: string;
  cleanupPolicy: string;
  killSwitch: string;
  executionMode: "mocked";
  statusLabel: "mocked_ready" | "mocked_timeout" | "blocked_containment";
  evidenceRef: string;
  containmentSummary: string;
  boundarySummary: string;
};

export type CodexWorkerPacketV0 = {
  workerId: string;
  packetId: string;
  role: "implementation_worker";
  readiness: "ready" | "active" | "blocked";
  attemptRefs: string[];
  currentState: "readiness_only" | "active_attempt" | "blocked_unavailable";
  blockedState: string;
  retentionPolicy: "metadata_only";
  evidenceRef: string;
  boundarySummary: string;
};

export type ClaudeReviewPacketV0 = {
  reviewId: string;
  packetId: string;
  purpose: "independent_review" | "security_review" | "edge_case_review" | "architecture_review";
  allowedContextRefs: string[];
  excludedContextRefs: string[];
  retentionPolicy: "metadata_only";
  expectedFindingsSchema: string;
  independenceMarker: "clean_context" | "codex_output_review" | "operator_selected";
  costScarcity: "scarce";
  approvalRequirement: "required" | "policy_triggered";
  executionMode: "readiness_or_packet_only";
  statusLabel: "pending" | "skipped" | "blocked";
  evidenceRef: string;
  boundarySummary: string;
};

export type HumanGateFixtureEvent = {
  eventId: string;
  actionId: string;
  eventType: string;
  summary: string;
  fromStage: PipelineStage;
  fromOwner: WorkPacketOwner;
  toStage: PipelineStage;
  toOwner: WorkPacketOwner;
  evidenceRefs: string[];
  auditEventType: string;
};

export type RecoveryFixtureEvent = HumanGateFixtureEvent & {
  requiresHumanGate: boolean;
  humanGateActionId: string | null;
};

export type ActionGuardFixture = {
  guardId: string;
  actionId: string;
  actionSurface: "human_gate" | "recovery";
  actionType: string;
  classification:
    | "stale_packet_state"
    | "stale_action_id"
    | "missing_evidence"
    | "unknown_action"
    | "unsafe_authority_class"
    | "blocked_source_boundary";
  unsafeClass: "real_hermes_launch" | "obsidian_mutation" | "model_gateway_replacement" | "expanded_claude_automation" | "evidence_retention_bypass" | "none";
  expectedPacketId: string;
  actualPacketId: string;
  expectedActionId: string;
  actualActionId: string;
  expectedState: string;
  actualState: string;
  disabledReason: string;
  stopLine: string;
  safeNextOption: string;
  resultingStage: PipelineStage;
  resultingOwner: WorkPacketOwner;
  evidenceRefs: string[];
  fixtureEventId: string | null;
  primaryRisk: "false_authority" | "unsafe_mutation" | "missing_evidence" | "unknown_action" | "blocked_boundary";
};

export type FixtureActionDecision = {
  submitCapable: boolean;
  guard: ActionGuardFixture | null;
  disabledReason: string;
  primaryRisk: ActionGuardFixture["primaryRisk"] | "none";
};

export type PipelineFixtureScenario = {
  scenarioId: string;
  label: string;
  selectedPacketId: string | null;
  currentOwner: WorkPacketOwner | "none";
  fixtureLabel: string;
  blockedReason: string;
  nextOperatorOption: string;
  evidenceRefs: string[];
  stopLine: string;
  rollbackPath: string;
};

export type PipelineGoldenPathSnapshot = {
  snapshotId: string;
  label: string;
  packetId: string;
  currentStage: PipelineStage;
  currentOwner: WorkPacketOwner;
  evidenceRef: string;
  nextAction: string;
  decisionConsequence: string;
  whatPacketIs: string;
  whyHere: string;
  whatNeedsOperator: string;
  whatHappensNext: string;
};

type PipelineFixtureLifecycleV1 = {
  source: "candidate_work" | "work_item" | "execution_attempt" | "workflow_event" | "memory_proposal" | "delivery_evidence" | "source_missing";
  stage: PipelineStage;
  owner: WorkPacketOwner;
  status: WorkPacketStatus;
  reasonCodes: string[];
  authoritativeRef: string;
  derivedFromRefs: string[];
  transitionEventRefs: string[];
  latestTransitionEventRef: string | null;
  attemptRef: string | null;
  metadataOnly: true;
  sourceMutationAllowed: false;
  providerCallsAllowed: false;
  workerLaunchAllowed: false;
  githubMutationAllowed: false;
  cleanupAllowed: false;
};

/**
 * Rich fixture-only data is an explicit extension of the dashboard DTO. It is
 * never used as the supervisor response or as a normal /pipeline fallback.
 */
export type PipelineFixtureDetailExtensionV1 = {
  fixtureId: string;
  fixtureKind: PipelineFixtureKind;
  fixtureLabel: string;
  sourceKind: "demo-fixture";
  sourceId: string;
  summary: string;
  nextAction: string;
  confidenceLabel: string;
  freshnessLabel: string;
  sourceTrustState: PipelineSourceTrustState;
  sourceTrustStates: PipelineSourceTrustState[];
  sourceTrustSummary: string;
  routeFork: PipelineRouteForkFixture;
  lastEvent: string;
  riskFlags: string[];
  matrixRowIds: string[];
  humanGateFixtureEvents: HumanGateFixtureEvent[];
  recoveryFixtureEvents: RecoveryFixtureEvent[];
  actionGuardFixtures: ActionGuardFixture[];
  localModelHealth: LocalModelHealthV0 | null;
  hermesJob: HermesJobPacketV0 | null;
  codexWorker: CodexWorkerPacketV0 | null;
  claudeReview: ClaudeReviewPacketV0 | null;
};

/**
 * Dashboard-owned V1 fixture packet. The nested V0 types are retained only as
 * named detail/schema holds; the packet itself no longer extends a V0 view.
 */
export type PipelineFixturePacketV1 = PipelineFixtureDetailExtensionV1 & {
  schemaVersion: typeof PIPELINE_FIXTURE_SCHEMA_VERSION;
  packetId: string;
  title: string;
  requestedOutcome: string;
  currentStage: PipelineStage;
  currentOwner: WorkPacketOwner;
  status: WorkPacketStatus;
  lifecycleState: PipelineFixtureLifecycleV1;
  riskLevel: "low" | "medium" | "high";
  priority: "low" | "normal" | "high" | "urgent";
  candidateWork: CandidateWorkView | null;
  workItem: WorkItemView | null;
  taskPacket: TaskPacketV0View | null;
  routingPreview: RoutingPreviewView | null;
  routeSummary: { recommendation: string; confidenceScore?: number | null; confidenceBand?: string | null; reasonCodes: string[] } | null;
  executionAttempts: WorkPacketExecutionAttemptSummaryV0[];
  transitionEvents: WorkPacketStageTransitionEventV0[];
  sourceRefs: SourceRefV0[];
  evidenceRefs: EvidenceRefV0[];
  artifactRefs: ArtifactRefV0[];
  humanGateActions: HumanGateActionV0[];
  humanGateActionRequests: HumanGateActionRequestV0[];
  laneCards: WorkPacketLaneCardV0[];
  memoryProposals: MemoryProposalV0[];
  deliveryEvidence: WorkPacketDeliveryEvidenceV0 | null;
  learnOutcome: WorkPacketLearnOutcomeV0 | null;
  learnRefill: WorkPacketLearnRefillProjectionV0 | null;
  alphaMemorySourceStatus: AlphaMemorySourceStatusV0 | null;
  gateStateValidation: WorkPacketGateStateValidationV0 | null;
  loopStopStates: WorkPacketLoopStopStateV0[];
  reviewSummaries: WorkPacketReviewSummaryV0[];
  recoveryActions: RecoveryActionV0[];
};

const fixtureStages = new Set<PipelineStage>(["capture", "classify", "route", "shape", "human_gate", "execute", "review", "promote", "deliver", "learn"]);
const fixtureOwners = new Set<WorkPacketOwner>(["kendall", "operator", "local_model", "hermes_worker_mock", "codex_worker", "claude_reviewer", "github", "memory_review", "blocked"]);
const fixtureStatuses = new Set<WorkPacketStatus>(["active", "waiting", "blocked", "failed", "complete", "deferred"]);
const fixtureKinds = new Set<PipelineFixtureKind>(["fixture-only", "mocked", "synthetic", "local-readiness", "future-real-source"]);
const fixtureTrustStates = new Set<PipelineSourceTrustState>(["included", "excluded", "stale", "contradictory", "unavailable", "derived-only"]);
const approvedFixtureCatalogIds = new Set([
  "happy_path_work_packet", "blocked_human_gate", "stale_gate_action", "failed_stage_recovery", "partial_worker_evidence",
  "mocked_hermes_unavailable", "codex_active_claude_pending", "governed_claude_real_execution_active",
  "governed_hermes_real_execution_unavailable", "obsidian_proposal_pending_approval", "documentation_proposal_pending_approval",
  "corrupted_incomplete_aggregate",
]);
const fixtureKeys = new Set([
  "schemaVersion", "packetId", "title", "requestedOutcome", "currentStage", "currentOwner", "status", "lifecycleState", "riskLevel", "priority",
  "candidateWork", "workItem", "taskPacket", "routingPreview", "routeSummary", "executionAttempts", "transitionEvents", "sourceRefs", "evidenceRefs",
  "artifactRefs", "humanGateActions", "humanGateActionRequests", "laneCards", "memoryProposals", "deliveryEvidence", "learnOutcome", "learnRefill",
  "alphaMemorySourceStatus", "gateStateValidation", "loopStopStates", "reviewSummaries", "recoveryActions", "fixtureId", "fixtureKind", "fixtureLabel",
  "sourceKind", "sourceId", "summary", "nextAction", "confidenceLabel", "freshnessLabel", "sourceTrustState", "sourceTrustStates", "sourceTrustSummary",
  "routeFork", "lastEvent", "riskFlags", "matrixRowIds", "humanGateFixtureEvents", "recoveryFixtureEvents", "actionGuardFixtures", "localModelHealth",
  "hermesJob", "codexWorker", "claudeReview",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isPacketBoundIdentity(value: unknown, packetId: string): boolean {
  if (!isNonEmptyString(value)) return false;
  const start = value.indexOf(packetId);
  if (start < 0) return false;
  const end = start + packetId.length;
  return (start === 0 || value[start - 1] === ":") && (end === value.length || value[end] === ":");
}

function isPacketBoundText(value: unknown, packetId: string): boolean {
  return isNonEmptyString(value) && (value.includes(packetId) || value.includes(packetId.replaceAll(":", "-")));
}

function isSafeImportMetadata(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return Object.values(value).every((entry) => {
    if (entry === null || typeof entry === "string" || typeof entry === "boolean") return true;
    if (typeof entry === "number") return Number.isFinite(entry);
    return Array.isArray(entry) && entry.every((item) => item === null || typeof item === "string" || typeof item === "boolean" || (typeof item === "number" && Number.isFinite(item)));
  });
}

function isScalarRecord(value: unknown): boolean {
  return isRecord(value)
    && Object.values(value).every((entry) => entry === null || typeof entry === "string" || typeof entry === "boolean" || (typeof entry === "number" && Number.isFinite(entry)));
}

function isApprovedFixtureIdentity(value: Record<string, unknown>): boolean {
  if (value.fixtureId === value.packetId && value.sourceId === value.packetId) return true;
  return typeof value.packetId === "string"
    && value.packetId.includes(":")
    && typeof value.fixtureId === "string"
    && approvedFixtureCatalogIds.has(value.fixtureId)
    && value.sourceId === value.fixtureId;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isExactRecord(value: unknown, keys: readonly string[], required: readonly string[] = []): value is Record<string, unknown> {
  return isRecord(value)
    && hasOnlyKeys(value, keys)
    && required.every((key) => Object.hasOwn(value, key));
}

function isStringRecordArray(value: unknown, keys: readonly string[], required: readonly string[] = []): boolean {
  return Array.isArray(value) && value.every((item) => isExactRecord(item, keys, required));
}

const sourceRefKeys = ["refId", "sourceType", "label", "pathOrUrl", "freshness", "accessState", "canonical", "summaryOnly", "blockedReason"] as const;
const evidenceRefKeys = ["refId", "evidenceType", "label", "artifactPath", "retentionClass", "rawPayloadRetained"] as const;
const artifactRefKeys = ["refId", "artifactType", "label", "pathOrUrl", "status"] as const;
const executionAttemptKeys = [
  "attemptId", "workItemId", "leaseId", "fencingToken", "routeDecisionId", "workerId", "lane", "authorityMode", "status",
  "requestedById", "requestedByLabel", "createdAt", "updatedAt", "startedAt", "completedAt", "heartbeatAt", "timeoutAt",
  "cancelRequestedAt", "cancelReason", "rejectionReason", "failureReason", "evidenceRefs", "artifactRefs",
] as const;
const transitionEventKeys = [
  "eventId", "eventType", "summary", "createdAt", "sourceStage", "targetStage", "sourceOwner", "targetOwner", "sourceStatus",
  "targetStatus", "reasonCodes", "evidenceRefs", "durable", "sourceEventId", "actorLabel",
] as const;
const loopStopKeys = [
  "stopStateId", "kind", "label", "phase", "severity", "summary", "stopLine", "nextSafeAction", "evidenceRefs", "metadataOnly",
  "sourceMutationAllowed", "providerCallsAllowed", "workerLaunchAllowed", "githubMutationAllowed", "cleanupAllowed",
] as const;
const recoveryActionKeys = ["actionId", "actionType", "label", "availability", "consequence", "resultingStage", "resultingOwner", "evidenceRefs"] as const;
const reviewSummaryKeys = ["reviewer", "status", "summary", "evidenceRefs", "artifactRefs"] as const;
const laneCardKeys = ["laneId", "laneType", "label", "status", "summary", "currentOwner", "routeConfidence", "reasonCodes", "evidenceRefs", "artifactRefs"] as const;
const humanGateActionKeys = [
  "actionId", "type", "family", "label", "uiCopy", "status", "authorityFamily", "payload", "requiredEvidenceRefs", "stopLines",
  "rollbackPath", "resultingStage", "resultingOwner", "auditEventType", "reasonCodes", "disabledReason",
] as const;
const humanGateActionRequestKeys = [
  "requestId", "packetId", "actionId", "decisionId", "requestedActionType", "requestDisplayLabel", "requestedByLabel", "requestedAt",
  "status", "auditEventType", "evidenceRefs", "retentionClass", "rawPayloadRetained", "executionStarted", "resultingStateApplied",
  "stopLines", "rollbackPath", "rejectionReason",
] as const;
const deliveryEvidenceKeys = [
  "evidenceId", "mode", "actionId", "status", "targetBranch", "baseBranch", "pullRequestUrl", "expectedHeadRevision",
  "pullRequestHeadRevision", "ciStatus", "reviewState", "mergeStatus", "mergeResult", "cleanupDryRunStatus", "cleanupTarget",
  "mergeGate", "cleanupDryRunGate", "readyForApproval", "hasDeliveryExecutionEvidence", "evidenceRefs", "artifactRefs", "retainedEvidence",
  "blockedReasons", "recoveryPath", "deliveryRailsGrantAuthority", "rawPayloadRetained", "remoteMutationApproved", "mergeApproved", "cleanupApproved",
] as const;
const learnOutcomeKeys = [
  "outcomeId", "status", "retentionClass", "learningProposalCount", "documentationProposalStatus", "automationAuthorityChangeStatus",
  "blockedWriteBackState", "nextSafeAction", "decisionRecords", "evidenceRefs", "sourceRefs", "canonicalMutationAllowed", "sourceMutationAllowed",
  "providerCallsAllowed", "durableWriteAllowed",
] as const;
const gateStateValidationKeys = [
  "status", "storedStage", "derivedStage", "storedOwner", "derivedOwner", "storedStatus", "derivedStatus", "eventCount", "latestEventType",
  "replayedEventTypes", "mismatchReasons", "blockedReasons", "refStates", "readOnly", "sourceMutationAllowed", "providerCallsAllowed", "workerLaunchAllowed",
] as const;
const gateReplayRefStateKeys = ["refId", "refType", "state", "label", "blockingReason"] as const;
const hermesJobKeys = ["jobId", "packetId", "workerProfile", "inputRefs", "allowedMounts", "writableOutputDir", "networkPolicy", "credentialPolicy", "sourceMutationPolicy", "timeoutSeconds", "expectedOutputSchema", "cleanupPolicy", "killSwitch", "executionMode", "statusLabel", "evidenceRef", "containmentSummary", "boundarySummary"] as const;
const codexWorkerKeys = ["workerId", "packetId", "role", "readiness", "attemptRefs", "currentState", "blockedState", "retentionPolicy", "evidenceRef", "boundarySummary"] as const;
const claudeReviewKeys = ["reviewId", "packetId", "purpose", "allowedContextRefs", "excludedContextRefs", "retentionPolicy", "expectedFindingsSchema", "independenceMarker", "costScarcity", "approvalRequirement", "executionMode", "statusLabel", "evidenceRef", "boundarySummary"] as const;

function isSourceRef(value: unknown): boolean {
  return isExactRecord(value, sourceRefKeys, ["refId", "sourceType", "label", "freshness", "accessState", "canonical", "summaryOnly"])
    && isNonEmptyString(value.refId)
    && isNonEmptyString(value.label)
    && ["candidate_work", "work_item", "bmad_artifact", "obsidian", "llm_wiki", "github", "research", "manual"].includes(String(value.sourceType))
    && ["fresh", "stale", "unknown", "not_applicable"].includes(String(value.freshness))
    && ["allowed", "excluded", "missing", "blocked"].includes(String(value.accessState))
    && typeof value.canonical === "boolean"
    && typeof value.summaryOnly === "boolean"
    && (value.accessState === "allowed"
      ? (value.pathOrUrl === undefined || value.pathOrUrl === null || typeof value.pathOrUrl === "string")
      : (value.pathOrUrl === undefined || value.pathOrUrl === null))
    && (value.blockedReason === undefined || value.blockedReason === null || typeof value.blockedReason === "string")
    && (value.accessState === "allowed" ? value.blockedReason === undefined || value.blockedReason === null : isNonEmptyString(value.blockedReason))
    && (value.accessState === "allowed" || value.summaryOnly === true);
}

function isEvidenceRef(value: unknown): boolean {
  return isExactRecord(value, evidenceRefKeys, ["refId", "evidenceType", "label", "retentionClass", "rawPayloadRetained"])
    && isNonEmptyString(value.refId)
    && isNonEmptyString(value.label)
    && ["route", "event", "attempt", "local_model", "review", "gate", "memory", "fixture"].includes(String(value.evidenceType))
    && ["metadata_only", "summary", "fixture"].includes(String(value.retentionClass))
    && (value.artifactPath === undefined || value.artifactPath === null || typeof value.artifactPath === "string")
    && value.rawPayloadRetained === false;
}

function isArtifactRef(value: unknown): boolean {
  return isExactRecord(value, artifactRefKeys, ["refId", "artifactType", "label", "status"])
    && isNonEmptyString(value.refId)
    && isNonEmptyString(value.label)
    && ["plan", "progress", "report", "pull_request", "check", "memory_proposal", "fixture"].includes(String(value.artifactType))
    && ["available", "missing", "blocked", "deferred"].includes(String(value.status))
    && (value.pathOrUrl === undefined || value.pathOrUrl === null || typeof value.pathOrUrl === "string");
}

function isExecutionAttempt(value: unknown): boolean {
  return isExactRecord(value, executionAttemptKeys, ["attemptId", "workItemId", "routeDecisionId", "workerId", "lane", "authorityMode", "status", "createdAt", "updatedAt", "evidenceRefs", "artifactRefs"])
    && isNonEmptyString(value.attemptId)
    && isNonEmptyString(value.workItemId)
    && isNonEmptyString(value.routeDecisionId)
    && isNonEmptyString(value.workerId)
    && isNonEmptyString(value.lane)
    && isNonEmptyString(value.authorityMode)
    && isNonEmptyString(value.status)
    && isNonEmptyString(value.createdAt)
    && isNonEmptyString(value.updatedAt)
    && isStringArray(value.evidenceRefs)
    && isStringArray(value.artifactRefs);
}

function isTransitionEvent(value: unknown): boolean {
  return isExactRecord(value, transitionEventKeys, ["eventId", "eventType", "summary", "createdAt", "targetStage", "targetOwner", "targetStatus", "reasonCodes", "evidenceRefs", "durable"])
    && isNonEmptyString(value.eventId)
    && isNonEmptyString(value.eventType)
    && isNonEmptyString(value.summary)
    && isNonEmptyString(value.createdAt)
    && fixtureStages.has(value.targetStage as PipelineStage)
    && fixtureOwners.has(value.targetOwner as WorkPacketOwner)
    && fixtureStatuses.has(value.targetStatus as WorkPacketStatus)
    && isStringArray(value.reasonCodes)
    && isStringArray(value.evidenceRefs)
    && typeof value.durable === "boolean";
}

function isLoopStopState(value: unknown): boolean {
  return isExactRecord(value, loopStopKeys, ["stopStateId", "kind", "label", "phase", "severity", "summary", "stopLine", "nextSafeAction", "evidenceRefs", "metadataOnly", "sourceMutationAllowed", "providerCallsAllowed", "workerLaunchAllowed", "githubMutationAllowed", "cleanupAllowed"])
    && isNonEmptyString(value.stopStateId)
    && ["limit_window", "operator_approval", "review_thread", "failed_check", "setup_churn", "token_window", "resource_pressure", "tool_churn", "unsafe_cleanup", "scope_boundary", "owner_conflict", "operator_owned"].includes(String(value.kind))
    && isNonEmptyString(value.label)
    && isNonEmptyString(value.phase)
    && ["info", "warning", "blocking"].includes(String(value.severity))
    && isNonEmptyString(value.summary)
    && isNonEmptyString(value.stopLine)
    && isNonEmptyString(value.nextSafeAction)
    && isStringArray(value.evidenceRefs)
    && value.metadataOnly === true
    && value.sourceMutationAllowed === false
    && value.providerCallsAllowed === false
    && value.workerLaunchAllowed === false
    && value.githubMutationAllowed === false
    && value.cleanupAllowed === false;
}

function isRecoveryAction(value: unknown): boolean {
  return isExactRecord(value, recoveryActionKeys, ["actionId", "actionType", "label", "availability", "consequence", "resultingStage", "resultingOwner", "evidenceRefs"])
    && isNonEmptyString(value.actionId)
    && isNonEmptyString(value.actionType)
    && isNonEmptyString(value.label)
    && isNonEmptyString(value.consequence)
    && fixtureStages.has(value.resultingStage as PipelineStage)
    && fixtureOwners.has(value.resultingOwner as WorkPacketOwner)
    && isStringArray(value.evidenceRefs);
}

function isReviewSummary(value: unknown): boolean {
  return isExactRecord(value, reviewSummaryKeys, ["reviewer", "status", "summary", "evidenceRefs", "artifactRefs"])
    && fixtureOwners.has(value.reviewer as WorkPacketOwner)
    && isNonEmptyString(value.summary)
    && isStringArray(value.evidenceRefs)
    && isStringArray(value.artifactRefs);
}

function isLaneCard(value: unknown): boolean {
  return isExactRecord(value, laneCardKeys, ["laneId", "laneType", "label", "status", "summary", "reasonCodes", "evidenceRefs", "artifactRefs"])
    && isNonEmptyString(value.laneId)
    && isNonEmptyString(value.label)
    && isNonEmptyString(value.status)
    && isNonEmptyString(value.summary)
    && isStringArray(value.reasonCodes)
    && isStringArray(value.evidenceRefs)
    && isStringArray(value.artifactRefs);
}

function isHumanGateAction(value: unknown): boolean {
  return isExactRecord(value, humanGateActionKeys, ["actionId", "type", "family", "label", "uiCopy", "status", "authorityFamily", "payload", "requiredEvidenceRefs", "stopLines", "rollbackPath", "resultingStage", "resultingOwner", "auditEventType", "reasonCodes"])
    && isNonEmptyString(value.actionId)
    && isNonEmptyString(value.type)
    && isNonEmptyString(value.family)
    && isNonEmptyString(value.label)
    && isNonEmptyString(value.uiCopy)
    && isNonEmptyString(value.status)
    && isNonEmptyString(value.authorityFamily)
    && isExactRecord(value.payload, ["packetId", "actionId", "decisionId"], ["packetId", "actionId", "decisionId"])
    && isNonEmptyString(value.payload.packetId)
    && isNonEmptyString(value.payload.actionId)
    && isNonEmptyString(value.payload.decisionId)
    && isStringArray(value.requiredEvidenceRefs)
    && isStringArray(value.stopLines)
    && isNonEmptyString(value.rollbackPath)
    && fixtureStages.has(value.resultingStage as PipelineStage)
    && fixtureOwners.has(value.resultingOwner as WorkPacketOwner)
    && isNonEmptyString(value.auditEventType)
    && isStringArray(value.reasonCodes)
    && ["approve_route", "approve_execution", "approve_provider_exception", "approve_memory_proposal", "approve_delivery", "reject_packet", "edit_packet", "request_clarification", "downgrade_to_reference", "send_back_to_shape", "send_back_to_research", "cancel_worker", "discard_result", "rerun_smaller", "reroute"].includes(String(value.type))
    && ["Approve", "Reject", "Request Changes", "Retry", "Pause", "Escalate", "Mark Resolved"].includes(String(value.family))
    && ["available", "disabled", "blocked", "stale", "complete"].includes(String(value.status));
}

function isHumanGateActionRequest(value: unknown): boolean {
  return isExactRecord(value, humanGateActionRequestKeys, ["requestId", "packetId", "actionId", "decisionId", "requestedActionType", "requestDisplayLabel", "requestedByLabel", "requestedAt", "status", "auditEventType", "evidenceRefs", "retentionClass", "rawPayloadRetained", "executionStarted", "resultingStateApplied", "stopLines", "rollbackPath"])
    && isNonEmptyString(value.requestId)
    && isNonEmptyString(value.packetId)
    && isNonEmptyString(value.actionId)
    && isNonEmptyString(value.decisionId)
    && isNonEmptyString(value.requestedActionType)
    && isNonEmptyString(value.requestDisplayLabel)
    && isNonEmptyString(value.requestedByLabel)
    && isNonEmptyString(value.requestedAt)
    && isNonEmptyString(value.status)
    && isStringArray(value.evidenceRefs)
    && value.retentionClass === "metadata_only"
    && value.rawPayloadRetained === false
    && value.executionStarted === false
    && value.resultingStateApplied === false
    && isStringArray(value.stopLines)
    && isNonEmptyString(value.rollbackPath)
    && ["recorded", "rejected", "blocked", "stale"].includes(String(value.status));
}

function isDeliveryEvidence(value: unknown): boolean {
  return isExactRecord(value, deliveryEvidenceKeys, ["evidenceId", "mode", "status", "readyForApproval", "hasDeliveryExecutionEvidence", "evidenceRefs", "artifactRefs", "retainedEvidence", "blockedReasons", "recoveryPath", "deliveryRailsGrantAuthority", "rawPayloadRetained", "remoteMutationApproved", "mergeApproved", "cleanupApproved"])
    && isNonEmptyString(value.evidenceId)
    && value.mode === "metadata_only"
    && isNonEmptyString(value.status)
    && typeof value.readyForApproval === "boolean"
    && typeof value.hasDeliveryExecutionEvidence === "boolean"
    && isStringArray(value.evidenceRefs)
    && isStringArray(value.artifactRefs)
    && isStringArray(value.retainedEvidence)
    && isStringArray(value.blockedReasons)
    && isNonEmptyString(value.recoveryPath)
    && (value.actionId === undefined || value.actionId === null || ["pr", "merge", "cleanup"].includes(String(value.actionId)))
    && value.deliveryRailsGrantAuthority === false
    && value.rawPayloadRetained === false
    && value.remoteMutationApproved === false
    && value.mergeApproved === false
    && value.cleanupApproved === false
    && (value.mergeGate === undefined || value.mergeGate === null || isDeliveryMergeGate(value.mergeGate))
    && (value.cleanupDryRunGate === undefined || value.cleanupDryRunGate === null || isCleanupDryRunGate(value.cleanupDryRunGate));
}

function isDeliveryMergeGate(value: unknown): boolean {
  return isExactRecord(value, ["status", "lowRiskReady", "criteria", "blockedReasons", "recoveryPath", "metadataOnly", "mergeApproved"], ["status", "lowRiskReady", "criteria", "blockedReasons", "recoveryPath", "metadataOnly", "mergeApproved"])
    && ["passed", "blocked"].includes(String(value.status))
    && typeof value.lowRiskReady === "boolean"
    && Array.isArray(value.criteria)
    && value.criteria.every((criterion) => isExactRecord(criterion, ["criterionId", "label", "status", "evidence", "blockedReason"], ["criterionId", "label", "status", "evidence"])
      && isNonEmptyString(criterion.criterionId)
      && isNonEmptyString(criterion.label)
      && ["passed", "blocked"].includes(String(criterion.status))
      && isStringArray(criterion.evidence)
      && (criterion.blockedReason === undefined || criterion.blockedReason === null || isNonEmptyString(criterion.blockedReason)))
    && isStringArray(value.blockedReasons)
    && isNonEmptyString(value.recoveryPath)
    && value.metadataOnly === true
    && value.mergeApproved === false;
}

function isCleanupDryRunGate(value: unknown): boolean {
  return isExactRecord(value, ["status", "dryRunMatchesPolicy", "expectedPr", "expectedOwner", "expectedWorktree", "expectedLocalBranch", "expectedRemoteBranch", "expectedHeadRevision", "blockedReasons", "recoveryPath", "metadataOnly", "cleanupApproved"], ["status", "dryRunMatchesPolicy", "blockedReasons", "recoveryPath", "metadataOnly", "cleanupApproved"])
    && ["passed", "blocked"].includes(String(value.status))
    && typeof value.dryRunMatchesPolicy === "boolean"
    && ["expectedPr", "expectedOwner", "expectedWorktree", "expectedLocalBranch", "expectedRemoteBranch", "expectedHeadRevision"].every((key) => value[key] === undefined || value[key] === null || typeof value[key] === "string")
    && isStringArray(value.blockedReasons)
    && isNonEmptyString(value.recoveryPath)
    && value.metadataOnly === true
    && value.cleanupApproved === false;
}

function isMemoryProposal(value: unknown): boolean {
  return isExactRecord(value, ["proposalId", "packetId", "label", "status", "summary", "sourceRefs", "evidenceRefs", "targetRef", "targetVaultPath", "targetVaultFolder", "proposalType", "suggestedContentSummary", "patchSummary", "sensitivity", "freshness", "contradictionStatus", "confidence", "operatorAction", "decisionNeededContext", "backupRecoveryPath", "writeBackStatus", "writeBackAllowed"], ["proposalId", "packetId", "label", "status", "summary", "sourceRefs", "evidenceRefs", "targetVaultFolder", "proposalType", "suggestedContentSummary", "sensitivity", "freshness", "contradictionStatus", "confidence", "operatorAction", "backupRecoveryPath", "writeBackStatus", "writeBackAllowed"])
    && isNonEmptyString(value.proposalId)
    && isNonEmptyString(value.packetId)
    && isNonEmptyString(value.label)
    && isNonEmptyString(value.summary)
    && Array.isArray(value.sourceRefs) && value.sourceRefs.length > 0 && value.sourceRefs.every((ref) => typeof ref === "string")
    && Array.isArray(value.evidenceRefs) && value.evidenceRefs.length > 0 && value.evidenceRefs.every((ref) => typeof ref === "string")
    && isNonEmptyString(value.targetVaultFolder)
    && isNonEmptyString(value.suggestedContentSummary)
    && isNonEmptyString(value.backupRecoveryPath)
    && value.writeBackAllowed === false
    && (value.targetRef === undefined || value.targetRef === null || isSourceRef(value.targetRef));
}

function isAlphaMemorySourceStatus(value: unknown): boolean {
  return isExactRecord(value, ["statusId", "authorityFamily", "operationMode", "decisionState", "retentionClass", "sourceRefs", "targetMetadata", "backupPath", "rollbackPath", "auditEventSummary", "blockedReasons", "recoveryOptions", "evidenceRefs", "llmWikiReadiness", "canonicalMutationAllowed", "sourceMutationAllowed", "providerCallsAllowed", "workerLaunchAllowed", "githubCallsAllowed", "networkEgressAllowed"], ["statusId", "authorityFamily", "operationMode", "decisionState", "retentionClass", "sourceRefs", "targetMetadata", "backupPath", "rollbackPath", "auditEventSummary", "blockedReasons", "recoveryOptions", "evidenceRefs", "canonicalMutationAllowed", "sourceMutationAllowed", "providerCallsAllowed", "workerLaunchAllowed", "githubCallsAllowed", "networkEgressAllowed"])
    && isNonEmptyString(value.statusId)
    && value.authorityFamily === "memory-writeback-and-source-mutation"
    && value.retentionClass === "metadata_only"
    && isStringArray(value.sourceRefs)
    && isSafeImportMetadata(value.targetMetadata)
    && isNonEmptyString(value.backupPath)
    && isNonEmptyString(value.rollbackPath)
    && isNonEmptyString(value.auditEventSummary)
    && isStringArray(value.blockedReasons)
    && isStringArray(value.recoveryOptions)
    && isStringArray(value.evidenceRefs)
    && value.canonicalMutationAllowed === false
    && value.sourceMutationAllowed === false
    && value.providerCallsAllowed === false
    && value.workerLaunchAllowed === false
    && value.githubCallsAllowed === false
    && value.networkEgressAllowed === false
    && (value.llmWikiReadiness === undefined || value.llmWikiReadiness === null || isLlmWikiReadiness(value.llmWikiReadiness));
}

function isLlmWikiReadiness(value: unknown): boolean {
  return isExactRecord(value, ["statusId", "operationMode", "decisionState", "canonicality", "retentionClass", "sourceRefs", "evidenceRefs", "memoryProposalRefs", "allowedInputs", "blockedReasons", "nextActions", "boundarySummary", "rebuildPreview", "rebuildDryRunPlan", "canonicalMutationAllowed", "sourceMutationAllowed", "providerCallsAllowed", "durableWriteAllowed"], ["statusId", "operationMode", "decisionState", "canonicality", "retentionClass", "sourceRefs", "evidenceRefs", "memoryProposalRefs", "allowedInputs", "blockedReasons", "nextActions", "boundarySummary", "canonicalMutationAllowed", "sourceMutationAllowed", "providerCallsAllowed", "durableWriteAllowed"])
    && isNonEmptyString(value.statusId)
    && value.operationMode === "read_only"
    && ["ready", "blocked", "not_configured"].includes(String(value.decisionState))
    && value.canonicality === "derived_disposable_rebuildable"
    && value.retentionClass === "metadata_only"
    && isStringArray(value.sourceRefs)
    && isStringArray(value.evidenceRefs)
    && isStringArray(value.memoryProposalRefs)
    && isStringArray(value.allowedInputs)
    && value.allowedInputs.every((ref) => isPacketBoundIdentity(ref, String(value.statusId).replace(/^llm-wiki-readiness:/, "")))
    && isStringArray(value.blockedReasons)
    && isStringArray(value.nextActions)
    && isNonEmptyString(value.boundarySummary)
    && (value.rebuildPreview === undefined || value.rebuildPreview === null || isLlmWikiRebuildPreview(value.rebuildPreview))
    && (value.rebuildDryRunPlan === undefined || value.rebuildDryRunPlan === null || isLlmWikiRebuildDryRunPlan(value.rebuildDryRunPlan))
    && value.canonicalMutationAllowed === false
    && value.sourceMutationAllowed === false
    && value.providerCallsAllowed === false
    && value.durableWriteAllowed === false;
}

function isLlmWikiRebuildPreview(value: unknown): boolean {
  return isExactRecord(value, ["previewId", "operationMode", "inputRefs", "memoryProposalRefs", "plannedOutputScope", "derivedTargetFolder", "freshness", "rebuildBasis", "retentionClass", "stopLine", "auditEventSummary", "canonicalMutationAllowed", "sourceMutationAllowed", "providerCallsAllowed", "workerLaunchAllowed", "githubCallsAllowed", "networkEgressAllowed", "durableWriteAllowed"], ["previewId", "operationMode", "inputRefs", "memoryProposalRefs", "plannedOutputScope", "derivedTargetFolder", "freshness", "rebuildBasis", "retentionClass", "stopLine", "auditEventSummary", "canonicalMutationAllowed", "sourceMutationAllowed", "providerCallsAllowed", "workerLaunchAllowed", "githubCallsAllowed", "networkEgressAllowed"])
    && isNonEmptyString(value.previewId)
    && value.operationMode === "read_only"
    && isStringArray(value.inputRefs)
    && isStringArray(value.memoryProposalRefs)
    && isNonEmptyString(value.plannedOutputScope)
    && isNonEmptyString(value.derivedTargetFolder)
    && ["fresh", "stale", "conflicting", "unknown"].includes(String(value.freshness))
    && Array.isArray(value.rebuildBasis)
    && value.rebuildBasis.every((basis) => ["approved-memory-proposals", "source-evidence-crosswalk"].includes(String(basis)))
    && value.retentionClass === "metadata_only"
    && isNonEmptyString(value.stopLine)
    && isNonEmptyString(value.auditEventSummary)
    && value.canonicalMutationAllowed === false
    && value.sourceMutationAllowed === false
    && value.providerCallsAllowed === false
    && value.workerLaunchAllowed === false
    && value.githubCallsAllowed === false
    && value.networkEgressAllowed === false
    && (value.durableWriteAllowed === undefined || value.durableWriteAllowed === false);
}

function isLlmWikiRebuildDryRunPlan(value: unknown): boolean {
  return isExactRecord(value, ["planId", "operationMode", "inputRefs", "memoryProposalRefs", "plannedDerivedSections", "disposableTargetNamespace", "derivedTargetFolder", "freshness", "rebuildBasis", "retentionClass", "stopLines", "discardRecoveryPath", "auditEventSummary", "canonicalMutationAllowed", "sourceMutationAllowed", "providerCallsAllowed", "workerLaunchAllowed", "githubCallsAllowed", "networkEgressAllowed", "durableWriteAllowed", "writePerformed", "backupCreated"], ["planId", "operationMode", "inputRefs", "memoryProposalRefs", "plannedDerivedSections", "disposableTargetNamespace", "derivedTargetFolder", "freshness", "rebuildBasis", "retentionClass", "stopLines", "discardRecoveryPath", "auditEventSummary", "canonicalMutationAllowed", "sourceMutationAllowed", "providerCallsAllowed", "workerLaunchAllowed", "githubCallsAllowed", "networkEgressAllowed", "durableWriteAllowed", "writePerformed", "backupCreated"])
    && isNonEmptyString(value.planId)
    && value.operationMode === "dry_run"
    && isStringArray(value.inputRefs)
    && isStringArray(value.memoryProposalRefs)
    && isStringArray(value.plannedDerivedSections)
    && isNonEmptyString(value.disposableTargetNamespace)
    && isNonEmptyString(value.derivedTargetFolder)
    && ["fresh", "stale", "conflicting", "unknown"].includes(String(value.freshness))
    && Array.isArray(value.rebuildBasis)
    && value.rebuildBasis.every((basis) => ["approved-memory-proposals", "source-evidence-crosswalk"].includes(String(basis)))
    && value.retentionClass === "metadata_only"
    && isStringArray(value.stopLines)
    && isNonEmptyString(value.discardRecoveryPath)
    && isNonEmptyString(value.auditEventSummary)
    && value.canonicalMutationAllowed === false
    && value.sourceMutationAllowed === false
    && value.providerCallsAllowed === false
    && value.workerLaunchAllowed === false
    && value.githubCallsAllowed === false
    && value.networkEgressAllowed === false
    && value.durableWriteAllowed === false
    && value.writePerformed === false
    && value.backupCreated === false;
}

function isLearnRefill(value: unknown): boolean {
  return isExactRecord(value, ["projectionId", "retentionClass", "followUpCandidates", "operatorOwnedExits", "refillSourceState", "housekeeping", "sourceExhaustion", "readyToTest", "nextSafeAction", "rawPayloadRetained", "sourceMutationAllowed", "providerCallsAllowed", "workerLaunchAllowed", "githubMutationAllowed"], ["projectionId", "retentionClass", "followUpCandidates", "operatorOwnedExits", "refillSourceState", "housekeeping", "sourceExhaustion", "readyToTest", "nextSafeAction", "rawPayloadRetained", "sourceMutationAllowed", "providerCallsAllowed", "workerLaunchAllowed", "githubMutationAllowed"])
    && isNonEmptyString(value.projectionId)
    && value.retentionClass === "metadata_only"
    && Array.isArray(value.followUpCandidates) && value.followUpCandidates.every((item) => isExactRecord(item, ["followUpId", "candidateWorkId", "label", "sourcePacketId", "reason", "status", "origin", "reentryPath", "evidenceRefs", "metadataOnly", "rawPayloadRetained"], ["followUpId", "candidateWorkId", "label", "sourcePacketId", "reason", "status", "origin", "reentryPath", "evidenceRefs", "metadataOnly", "rawPayloadRetained"]) && isStringArray(item.evidenceRefs) && item.metadataOnly === true && item.rawPayloadRetained === false)
    && Array.isArray(value.operatorOwnedExits) && value.operatorOwnedExits.every((item) => isExactRecord(item, ["exitId", "sourcePacketId", "state", "reason", "stopStateKind", "reentryPath", "evidenceRefs", "metadataOnly", "rawPayloadRetained"], ["exitId", "sourcePacketId", "state", "reason", "stopStateKind", "reentryPath", "evidenceRefs", "metadataOnly", "rawPayloadRetained"]) && isStringArray(item.evidenceRefs) && item.metadataOnly === true && item.rawPayloadRetained === false)
    && isExactRecord(value.refillSourceState, ["state", "operationalLabel", "explanation", "sourceRefs", "evidenceRefs", "metadataOnly"], ["state", "operationalLabel", "explanation", "sourceRefs", "evidenceRefs", "metadataOnly"]) && isStringArray(value.refillSourceState.sourceRefs) && isStringArray(value.refillSourceState.evidenceRefs) && value.refillSourceState.metadataOnly === true
    && isExactRecord(value.housekeeping, ["status", "summary", "evidenceRefs", "metadataOnly"], ["status", "summary", "evidenceRefs", "metadataOnly"]) && isStringArray(value.housekeeping.evidenceRefs) && value.housekeeping.metadataOnly === true
    && isExactRecord(value.sourceExhaustion, ["exhausted", "summary", "sourceRefs", "evidenceRefs", "metadataOnly"], ["exhausted", "summary", "sourceRefs", "evidenceRefs", "metadataOnly"]) && typeof value.sourceExhaustion.exhausted === "boolean" && isStringArray(value.sourceExhaustion.sourceRefs) && isStringArray(value.sourceExhaustion.evidenceRefs) && value.sourceExhaustion.metadataOnly === true
    && (value.readyToTest === null || (isExactRecord(value.readyToTest, ["readyId", "userFacingSummary", "testableSurface", "verificationRefs", "evidenceRefs", "metadataOnly", "rawPayloadRetained"], ["readyId", "userFacingSummary", "testableSurface", "verificationRefs", "evidenceRefs", "metadataOnly", "rawPayloadRetained"]) && isStringArray(value.readyToTest.verificationRefs) && isStringArray(value.readyToTest.evidenceRefs) && value.readyToTest.metadataOnly === true && value.readyToTest.rawPayloadRetained === false))
    && isNonEmptyString(value.nextSafeAction)
    && value.rawPayloadRetained === false
    && value.sourceMutationAllowed === false
    && value.providerCallsAllowed === false
    && value.workerLaunchAllowed === false
    && value.githubMutationAllowed === false;
}

function isLearnOutcome(value: unknown): boolean {
  return isExactRecord(value, learnOutcomeKeys, ["outcomeId", "status", "retentionClass", "learningProposalCount", "documentationProposalStatus", "automationAuthorityChangeStatus", "blockedWriteBackState", "nextSafeAction", "decisionRecords", "evidenceRefs", "sourceRefs", "canonicalMutationAllowed", "sourceMutationAllowed", "providerCallsAllowed", "durableWriteAllowed"])
    && isNonEmptyString(value.outcomeId)
    && value.retentionClass === "metadata_only"
    && typeof value.learningProposalCount === "number"
    && isNonEmptyString(value.nextSafeAction)
    && Array.isArray(value.decisionRecords)
    && value.decisionRecords.every((record) => isExactRecord(record, ["decisionId", "proposalId", "proposalType", "actor", "result", "operatorAction", "evidenceRefs", "recoveryPath", "writeBackStatus", "canonicalMutationAllowed", "durableWriteAllowed"], ["decisionId", "proposalId", "proposalType", "actor", "result", "operatorAction", "evidenceRefs", "recoveryPath", "writeBackStatus", "canonicalMutationAllowed", "durableWriteAllowed"]) && isStringArray(record.evidenceRefs) && record.canonicalMutationAllowed === false && record.durableWriteAllowed === false)
    && isStringArray(value.evidenceRefs)
    && isStringArray(value.sourceRefs)
    && value.canonicalMutationAllowed === false
    && value.sourceMutationAllowed === false
    && value.providerCallsAllowed === false
    && value.durableWriteAllowed === false;
}

function isGateStateValidation(value: unknown): boolean {
  return isExactRecord(value, gateStateValidationKeys, ["status", "storedStage", "storedOwner", "storedStatus", "eventCount", "replayedEventTypes", "mismatchReasons", "blockedReasons", "refStates", "readOnly", "sourceMutationAllowed", "providerCallsAllowed", "workerLaunchAllowed"])
    && ["matched", "blocked", "preview_only"].includes(String(value.status))
    && fixtureStages.has(value.storedStage as PipelineStage)
    && fixtureOwners.has(value.storedOwner as WorkPacketOwner)
    && fixtureStatuses.has(value.storedStatus as WorkPacketStatus)
    && (value.derivedStage === undefined || value.derivedStage === null || fixtureStages.has(value.derivedStage as PipelineStage))
    && (value.derivedOwner === undefined || value.derivedOwner === null || fixtureOwners.has(value.derivedOwner as WorkPacketOwner))
    && (value.derivedStatus === undefined || value.derivedStatus === null || fixtureStatuses.has(value.derivedStatus as WorkPacketStatus))
    && typeof value.eventCount === "number" && Number.isInteger(value.eventCount) && value.eventCount >= 0
    && (value.latestEventType === undefined || value.latestEventType === null || isNonEmptyString(value.latestEventType))
    && isStringArray(value.replayedEventTypes)
    && isStringArray(value.mismatchReasons)
    && isStringArray(value.blockedReasons)
    && isStringRecordArray(value.refStates, gateReplayRefStateKeys, ["refId", "refType", "state", "label"])
    && Array.isArray(value.refStates)
    && value.refStates.every((refState: unknown) => isRecord(refState) && ["source", "evidence", "event"].includes(String(refState.refType)) && ["allowed", "blocked", "missing", "excluded", "redacted", "unsupported", "metadata_only"].includes(String(refState.state)) && (refState.blockingReason === undefined || refState.blockingReason === null || isNonEmptyString(refState.blockingReason)))
    && value.readOnly === true
    && value.sourceMutationAllowed === false
    && value.providerCallsAllowed === false
    && value.workerLaunchAllowed === false;
}

function isCandidateWork(value: unknown): boolean {
  return isExactRecord(value, ["id", "title", "requestedOutcome", "source", "sourceArtifactPath", "sourceArtifactType", "riskLevel", "priority", "sortOrder", "status", "createdAt", "updatedAt", "approvedAt", "promotedWorkItemId", "sourceSummary", "importMetadata"], ["id", "title", "requestedOutcome", "source", "sourceArtifactPath", "sourceArtifactType", "riskLevel", "priority", "sortOrder", "status", "createdAt", "updatedAt", "importMetadata"])
    && isNonEmptyString(value.id)
    && isNonEmptyString(value.title)
    && isNonEmptyString(value.requestedOutcome)
    && isNonEmptyString(value.sourceArtifactPath)
    && isNonEmptyString(value.sourceArtifactType)
    && typeof value.sortOrder === "number"
    && isNonEmptyString(value.status)
    && isNonEmptyString(value.createdAt)
    && isNonEmptyString(value.updatedAt)
    && isSafeImportMetadata(value.importMetadata)
    && (value.sourceSummary === undefined || value.sourceSummary === null || isCandidateSourceSummary(value.sourceSummary));
}

function isCandidateSourceSummary(value: unknown): boolean {
  return isExactRecord(value, ["label", "summary", "sourceType", "sourceRef", "sourceArtifactPath", "freshness", "accessState", "retentionPolicy", "boundarySummary", "evidenceRefs", "approvalStatus", "approvedBy", "approvedAt"], ["label", "summary", "sourceType", "sourceRef", "sourceArtifactPath", "freshness", "accessState", "retentionPolicy", "boundarySummary", "evidenceRefs", "approvalStatus", "approvedBy", "approvedAt"])
    && isNonEmptyString(value.label)
    && isNonEmptyString(value.summary)
    && ["candidate_work", "work_item", "bmad_artifact", "obsidian", "llm_wiki", "github", "research", "manual"].includes(String(value.sourceType))
    && isNonEmptyString(value.sourceRef)
    && isNonEmptyString(value.sourceArtifactPath)
    && ["fresh", "stale", "unknown", "not_applicable"].includes(String(value.freshness))
    && ["allowed", "excluded", "missing", "blocked"].includes(String(value.accessState))
    && isNonEmptyString(value.retentionPolicy)
    && isNonEmptyString(value.boundarySummary)
    && isStringArray(value.evidenceRefs)
    && isNonEmptyString(value.approvalStatus)
    && isNonEmptyString(value.approvedBy)
    && isNonEmptyString(value.approvedAt);
}

function isWorkItem(value: unknown): boolean {
  return isExactRecord(value, ["title", "requestedOutcome", "source", "details", "riskLevel", "metadata", "id", "origin", "state", "lane", "assigneeId", "assigneeLabel", "ageMinutes", "needsAttention", "attentionReason", "escalatedAt", "escalationReason", "escalatedByLabel", "statusSummary", "blockedReason", "nextStep", "selfDetectedIssue", "selfDetectedIssueCategory", "executionRecipe", "deliveryReadiness", "createdAt", "updatedAt", "lastEventAt", "requiresAudit", "auditMode"], ["title", "requestedOutcome", "source", "id", "origin", "state", "lane", "ageMinutes", "needsAttention", "statusSummary", "blockedReason", "nextStep", "selfDetectedIssue", "createdAt", "updatedAt", "lastEventAt", "requiresAudit", "auditMode"])
    && isNonEmptyString(value.title)
    && isNonEmptyString(value.requestedOutcome)
    && isNonEmptyString(value.source)
    && (value.details === undefined || value.details === null || typeof value.details === "string")
    && (value.metadata === undefined || value.metadata === null || isScalarRecord(value.metadata))
    && isNonEmptyString(value.id)
    && ["operator", "supervisor"].includes(String(value.origin))
    && ["queued", "triaged", "ready", "implementing", "validating", "reviewing", "awaiting_audit", "needs_rework", "operator_owned", "blocked", "done"].includes(String(value.state))
    && (value.lane === null || ["intake", "implementation", "validation", "review", "corrective_loop"].includes(String(value.lane)))
    && (value.riskLevel === undefined || ["low", "medium", "high"].includes(String(value.riskLevel)))
    && typeof value.ageMinutes === "number" && Number.isFinite(value.ageMinutes) && value.ageMinutes >= 0
    && typeof value.needsAttention === "boolean"
    && (value.assigneeId === undefined || value.assigneeId === null || isNonEmptyString(value.assigneeId))
    && (value.assigneeLabel === undefined || value.assigneeLabel === null || isNonEmptyString(value.assigneeLabel))
    && (value.attentionReason === undefined || value.attentionReason === null || isNonEmptyString(value.attentionReason))
    && (value.escalatedAt === undefined || value.escalatedAt === null || isNonEmptyString(value.escalatedAt))
    && (value.escalationReason === undefined || value.escalationReason === null || isNonEmptyString(value.escalationReason))
    && (value.escalatedByLabel === undefined || value.escalatedByLabel === null || isNonEmptyString(value.escalatedByLabel))
    && isNonEmptyString(value.statusSummary)
    && (value.blockedReason === null || typeof value.blockedReason === "string")
    && (value.nextStep === null || typeof value.nextStep === "string")
    && typeof value.selfDetectedIssue === "boolean"
    && (value.selfDetectedIssueCategory === undefined || value.selfDetectedIssueCategory === null || isNonEmptyString(value.selfDetectedIssueCategory))
    && isNonEmptyString(value.createdAt)
    && isNonEmptyString(value.updatedAt)
    && isNonEmptyString(value.lastEventAt)
    && typeof value.requiresAudit === "boolean"
    && ["none", "advisory", "required"].includes(String(value.auditMode))
    && (value.executionRecipe === undefined || value.executionRecipe === null || isExecutionRecipe(value.executionRecipe))
    && (value.deliveryReadiness === undefined || value.deliveryReadiness === null || isDeliveryReadiness(value.deliveryReadiness));
}

function isExecutionRecipe(value: unknown): boolean {
  return isExactRecord(value, ["id", "label", "summary", "branchPrefix", "allowedPaths", "implementationCommands", "verificationCommands", "policyGates", "operatorCheckpoints", "autonomyNotes", "remoteAutomationPolicy"], ["id", "label", "summary", "branchPrefix", "allowedPaths", "implementationCommands", "verificationCommands", "policyGates", "operatorCheckpoints", "autonomyNotes", "remoteAutomationPolicy"])
    && ["id", "label", "summary", "branchPrefix"].every((key) => isNonEmptyString(value[key]))
    && isStringArray(value.allowedPaths)
    && isStringArray(value.implementationCommands)
    && isStringArray(value.verificationCommands)
    && Array.isArray(value.policyGates)
    && value.policyGates.every((gate) => isExactRecord(gate, ["id", "label", "requiredBefore", "summary", "evidence"], ["id", "label", "requiredBefore", "summary", "evidence"])
      && ["id", "label", "requiredBefore", "summary"].every((key) => isNonEmptyString(gate[key]))
      && isStringArray(gate.evidence))
    && isStringArray(value.operatorCheckpoints)
    && isStringArray(value.autonomyNotes)
    && isExactRecord(value.remoteAutomationPolicy, ["status", "summary", "allowedOperations", "blockedOperations", "approvalRequirements"], ["status", "summary", "allowedOperations", "blockedOperations", "approvalRequirements"])
    && isNonEmptyString(value.remoteAutomationPolicy.status)
    && isNonEmptyString(value.remoteAutomationPolicy.summary)
    && isStringArray(value.remoteAutomationPolicy.allowedOperations)
    && isStringArray(value.remoteAutomationPolicy.blockedOperations)
    && isStringArray(value.remoteAutomationPolicy.approvalRequirements);
}

function isDeliveryReadiness(value: unknown): boolean {
  return isExactRecord(value, ["pullRequestStatus", "pullRequestUrl", "ciStatus", "mergeStatus", "deliveryWaived", "deliveryWaiverReason", "remoteOperationsPerformed", "remoteOperationsPolicy", "readyForApproval"], ["pullRequestStatus", "ciStatus", "mergeStatus", "deliveryWaived", "remoteOperationsPerformed", "remoteOperationsPolicy", "readyForApproval"])
    && ["pullRequestStatus", "ciStatus", "mergeStatus", "remoteOperationsPolicy"].every((key) => isNonEmptyString(value[key]))
    && (value.pullRequestUrl === undefined || value.pullRequestUrl === null || isNonEmptyString(value.pullRequestUrl))
    && typeof value.deliveryWaived === "boolean"
    && (value.deliveryWaiverReason === undefined || value.deliveryWaiverReason === null || isNonEmptyString(value.deliveryWaiverReason))
    && typeof value.remoteOperationsPerformed === "boolean"
    && typeof value.readyForApproval === "boolean";
}

function isTaskPacket(value: unknown): boolean {
  return isExactRecord(value, ["workItemId", "title", "requestedOutcome", "source", "sourceArtifactPath", "taskKind", "riskLevel", "priority", "approvalMode", "verificationSummary"], ["workItemId", "title", "requestedOutcome", "source", "sourceArtifactPath", "taskKind", "riskLevel", "priority", "approvalMode", "verificationSummary"])
    && isNonEmptyString(value.workItemId)
    && isNonEmptyString(value.title)
    && isNonEmptyString(value.requestedOutcome)
    && isNonEmptyString(value.source)
    && isNonEmptyString(value.sourceArtifactPath)
    && isNonEmptyString(value.taskKind)
    && isNonEmptyString(value.riskLevel)
    && isNonEmptyString(value.priority)
    && isNonEmptyString(value.approvalMode)
    && isNonEmptyString(value.verificationSummary);
}

function isRoutingPreview(value: unknown): boolean {
  return isExactRecord(value, ["profile", "decision"], ["profile", "decision"])
    && isRoutingProfile(value.profile)
    && isRoutingDecision(value.decision);
}

function isRoutingProfile(value: unknown): boolean {
  return isExactRecord(value, ["workItemId", "stepId", "taskKind", "phase", "riskLevel", "privacyLevel", "writeScope", "allowedPaths", "contextNeed", "reasoningNeed", "determinismNeed", "validationExpectations", "preferredLanes", "forbiddenLanes", "escalationTriggers"], ["workItemId", "stepId", "taskKind", "riskLevel", "privacyLevel", "writeScope", "allowedPaths", "contextNeed", "reasoningNeed", "determinismNeed", "validationExpectations", "preferredLanes", "forbiddenLanes", "escalationTriggers"])
    && isNonEmptyString(value.workItemId)
    && isNonEmptyString(value.stepId)
    && isNonEmptyString(value.taskKind)
    && (value.phase === undefined || value.phase === null || isNonEmptyString(value.phase))
    && isNonEmptyString(value.riskLevel)
    && isNonEmptyString(value.privacyLevel)
    && isNonEmptyString(value.writeScope)
    && isStringArray(value.allowedPaths)
    && isNonEmptyString(value.contextNeed)
    && isNonEmptyString(value.reasoningNeed)
    && isNonEmptyString(value.determinismNeed)
    && isStringArray(value.validationExpectations)
    && isStringArray(value.preferredLanes)
    && isStringArray(value.forbiddenLanes)
    && isStringArray(value.escalationTriggers);
}

function isRoutingDecision(value: unknown): boolean {
  return isExactRecord(value, ["decisionId", "workItemId", "stepId", "createdAt", "profileSnapshot", "selectedLane", "selectedWorkerId", "authorityMode", "confidenceScore", "confidenceBand", "reasonCodes", "rejectedLanes", "rejectedWorkers", "permissionSummary", "escalationPath", "humanExplanation"], ["decisionId", "workItemId", "stepId", "createdAt", "profileSnapshot", "selectedLane", "authorityMode", "confidenceScore", "confidenceBand", "reasonCodes", "rejectedLanes", "rejectedWorkers", "permissionSummary", "escalationPath", "humanExplanation"])
    && isNonEmptyString(value.decisionId)
    && isNonEmptyString(value.workItemId)
    && isNonEmptyString(value.stepId)
    && isNonEmptyString(value.createdAt)
    && isRoutingProfile(value.profileSnapshot)
    && isNonEmptyString(value.selectedLane)
    && (value.selectedWorkerId === undefined || value.selectedWorkerId === null || isNonEmptyString(value.selectedWorkerId))
    && isNonEmptyString(value.authorityMode)
    && typeof value.confidenceScore === "number" && Number.isFinite(value.confidenceScore)
    && isNonEmptyString(value.confidenceBand)
    && isStringArray(value.reasonCodes)
    && Array.isArray(value.rejectedLanes)
    && value.rejectedLanes.every((lane) => isExactRecord(lane, ["lane", "rejectionCodes", "explanation"], ["lane", "rejectionCodes", "explanation"]) && isNonEmptyString(lane.lane) && isStringArray(lane.rejectionCodes) && isNonEmptyString(lane.explanation))
    && isStringArray(value.rejectedWorkers)
    && isNonEmptyString(value.permissionSummary)
    && isStringArray(value.escalationPath)
    && isNonEmptyString(value.humanExplanation);
}

function isFixtureEvent(value: unknown): boolean {
  return isExactRecord(value, ["eventId", "actionId", "eventType", "summary", "fromStage", "fromOwner", "toStage", "toOwner", "evidenceRefs", "auditEventType", "requiresHumanGate", "humanGateActionId"], ["eventId", "actionId", "eventType", "summary", "fromStage", "fromOwner", "toStage", "toOwner", "evidenceRefs", "auditEventType"])
    && isNonEmptyString(value.eventId)
    && isNonEmptyString(value.actionId)
    && isNonEmptyString(value.eventType)
    && isNonEmptyString(value.summary)
    && fixtureStages.has(value.fromStage as PipelineStage)
    && fixtureOwners.has(value.fromOwner as WorkPacketOwner)
    && fixtureStages.has(value.toStage as PipelineStage)
    && fixtureOwners.has(value.toOwner as WorkPacketOwner)
    && isStringArray(value.evidenceRefs)
    && isNonEmptyString(value.auditEventType)
    && (value.requiresHumanGate === undefined || typeof value.requiresHumanGate === "boolean")
    && (value.humanGateActionId === undefined || value.humanGateActionId === null || isNonEmptyString(value.humanGateActionId));
}

function isActionGuardFixture(value: unknown): boolean {
  return isExactRecord(value, ["guardId", "actionId", "actionSurface", "actionType", "classification", "unsafeClass", "expectedPacketId", "actualPacketId", "expectedActionId", "actualActionId", "expectedState", "actualState", "disabledReason", "stopLine", "safeNextOption", "resultingStage", "resultingOwner", "evidenceRefs", "fixtureEventId", "primaryRisk"], ["guardId", "actionId", "actionSurface", "actionType", "classification", "unsafeClass", "expectedPacketId", "actualPacketId", "expectedActionId", "actualActionId", "expectedState", "actualState", "disabledReason", "stopLine", "safeNextOption", "resultingStage", "resultingOwner", "evidenceRefs", "fixtureEventId", "primaryRisk"])
    && isNonEmptyString(value.guardId)
    && isNonEmptyString(value.actionId)
    && isNonEmptyString(value.actionType)
    && isNonEmptyString(value.classification)
    && isNonEmptyString(value.unsafeClass)
    && isNonEmptyString(value.expectedPacketId)
    && isNonEmptyString(value.actualPacketId)
    && isNonEmptyString(value.expectedActionId)
    && isNonEmptyString(value.actualActionId)
    && isNonEmptyString(value.expectedState)
    && isNonEmptyString(value.actualState)
    && isNonEmptyString(value.disabledReason)
    && isNonEmptyString(value.stopLine)
    && isNonEmptyString(value.safeNextOption)
    && fixtureStages.has(value.resultingStage as PipelineStage)
    && fixtureOwners.has(value.resultingOwner as WorkPacketOwner)
    && isStringArray(value.evidenceRefs)
    && (value.fixtureEventId === null || isNonEmptyString(value.fixtureEventId));
}

function isLocalModelHealth(value: unknown): boolean {
  return isExactRecord(value, ["provider", "endpointUrl", "approvedEndpointUrl", "endpointApproved", "modelId", "approvedModelId", "modelApproved", "reachable", "busyState", "allowedCaller", "lastLatencyMs", "lastFailure", "callAuthorityState", "retentionPolicy", "statusLabel", "dataSource", "evidenceRef", "fallbackPath", "authoritySummary", "noProbeBoundary"], ["provider", "endpointUrl", "approvedEndpointUrl", "endpointApproved", "modelId", "approvedModelId", "modelApproved", "reachable", "busyState", "allowedCaller", "callAuthorityState", "retentionPolicy", "statusLabel", "dataSource", "evidenceRef", "fallbackPath", "authoritySummary", "noProbeBoundary"])
    && value.provider === "ollama"
    && typeof value.endpointApproved === "boolean"
    && typeof value.modelApproved === "boolean"
    && (value.endpointUrl === null || typeof value.endpointUrl === "string")
    && (value.modelId === null || typeof value.modelId === "string")
    && isNonEmptyString(value.evidenceRef)
    && isNonEmptyString(value.fallbackPath)
    && isNonEmptyString(value.authoritySummary);
}

function isWorkerOrReviewFixture(value: unknown, keys: readonly string[], required: readonly string[]): boolean {
  return isExactRecord(value, keys, required)
    && required.every((key) => Array.isArray(value[key]) ? isStringArray(value[key]) : typeof value[key] === "number" ? Number.isFinite(value[key]) : isNonEmptyString(value[key]));
}

function packetBoundNestedIdentitiesAreCoherent(value: Record<string, unknown>, packetId: string): boolean {
  const actions = Array.isArray(value.humanGateActions) ? value.humanGateActions : [];
  const requests = Array.isArray(value.humanGateActionRequests) ? value.humanGateActionRequests : [];
  const attempts = Array.isArray(value.executionAttempts) ? value.executionAttempts : [];
  const lanes = Array.isArray(value.laneCards) ? value.laneCards : [];
  const proposals = Array.isArray(value.memoryProposals) ? value.memoryProposals : [];
  const guards = Array.isArray(value.actionGuardFixtures) ? value.actionGuardFixtures : [];
  const loopStops = Array.isArray(value.loopStopStates) ? value.loopStopStates : [];
  const transitions = Array.isArray(value.transitionEvents) ? value.transitionEvents : [];
  const fixtureEvents = [...(Array.isArray(value.humanGateFixtureEvents) ? value.humanGateFixtureEvents : []), ...(Array.isArray(value.recoveryFixtureEvents) ? value.recoveryFixtureEvents : [])];
  const reviews = Array.isArray(value.reviewSummaries) ? value.reviewSummaries : [];
  const recoveries = Array.isArray(value.recoveryActions) ? value.recoveryActions : [];
  const workerPacketIds = [value.hermesJob, value.codexWorker, value.claudeReview].filter(isRecord).map((item) => item.packetId);
  const packetRefs = (candidate: unknown): boolean => isStringArray(candidate) && candidate.every((ref) => isPacketBoundIdentity(ref, packetId));
  const validActions = actions.every((action) => isRecord(action) && isPacketBoundIdentity(action.actionId, packetId) && isRecord(action.payload) && action.payload.packetId === packetId && action.payload.actionId === action.actionId && isPacketBoundIdentity(action.payload.decisionId, packetId) && packetRefs(action.requiredEvidenceRefs));
  const validRequests = requests.every((request) => isRecord(request) && request.packetId === packetId && isPacketBoundIdentity(request.requestId, packetId) && isPacketBoundIdentity(request.actionId, packetId) && isPacketBoundIdentity(request.decisionId, packetId) && packetRefs(request.evidenceRefs));
  const validAttempts = attempts.every((attempt) => isRecord(attempt) && isPacketBoundIdentity(attempt.attemptId, packetId) && isPacketBoundIdentity(attempt.workItemId, packetId) && isPacketBoundIdentity(attempt.routeDecisionId, packetId) && isNonEmptyString(attempt.workerId) && packetRefs(attempt.evidenceRefs) && packetRefs(attempt.artifactRefs));
  const validLanes = lanes.every((lane) => isRecord(lane) && isPacketBoundIdentity(lane.laneId, packetId) && packetRefs(lane.evidenceRefs) && packetRefs(lane.artifactRefs));
  const validProposals = proposals.every((proposal) => isRecord(proposal) && isPacketBoundIdentity(proposal.packetId, packetId) && isPacketBoundIdentity(proposal.proposalId, packetId) && packetRefs(proposal.sourceRefs) && packetRefs(proposal.evidenceRefs));
  const validGuards = guards.every((guard) => isRecord(guard) && isPacketBoundIdentity(guard.guardId, packetId) && isPacketBoundIdentity(guard.actionId, packetId) && guard.actualPacketId === packetId && isPacketBoundIdentity(guard.expectedPacketId, packetId) && isPacketBoundIdentity(guard.expectedActionId, packetId) && isPacketBoundIdentity(guard.actualActionId, packetId) && packetRefs(guard.evidenceRefs));
  const validCandidate = value.candidateWork === null || (isRecord(value.candidateWork)
    && isPacketBoundIdentity(value.candidateWork.id, packetId)
    && (value.candidateWork.promotedWorkItemId === undefined || value.candidateWork.promotedWorkItemId === null || isPacketBoundIdentity(value.candidateWork.promotedWorkItemId, packetId))
    && (value.candidateWork.sourceSummary === undefined || value.candidateWork.sourceSummary === null || (isRecord(value.candidateWork.sourceSummary) && isPacketBoundIdentity(value.candidateWork.sourceSummary.sourceRef, packetId) && packetRefs(value.candidateWork.sourceSummary.evidenceRefs))));
  const validWorkItem = value.workItem === null || (isRecord(value.workItem) && isPacketBoundIdentity(value.workItem.id, packetId));
  const validTaskPacket = value.taskPacket === null || (isRecord(value.taskPacket) && isPacketBoundIdentity(value.taskPacket.workItemId, packetId));
  const validRouting = value.routingPreview === null || (isRecord(value.routingPreview) && isRecord(value.routingPreview.profile) && isRecord(value.routingPreview.decision)
    && isPacketBoundIdentity(value.routingPreview.profile.workItemId, packetId)
    && isPacketBoundIdentity(value.routingPreview.decision.decisionId, packetId)
    && isPacketBoundIdentity(value.routingPreview.decision.workItemId, packetId)
    && isRecord(value.routingPreview.decision.profileSnapshot)
    && isRoutingProfile(value.routingPreview.decision.profileSnapshot)
    && isPacketBoundIdentity(value.routingPreview.decision.profileSnapshot.workItemId, packetId));
  const validDelivery = value.deliveryEvidence === null || (isRecord(value.deliveryEvidence)
    && isPacketBoundIdentity(value.deliveryEvidence.evidenceId, packetId)
    && packetRefs(value.deliveryEvidence.evidenceRefs)
    && packetRefs(value.deliveryEvidence.artifactRefs)
    && packetRefs(value.deliveryEvidence.retainedEvidence));
  const validLearn = value.learnOutcome === null || (isRecord(value.learnOutcome)
    && isPacketBoundIdentity(value.learnOutcome.outcomeId, packetId)
    && packetRefs(value.learnOutcome.evidenceRefs)
    && packetRefs(value.learnOutcome.sourceRefs)
    && Array.isArray(value.learnOutcome.decisionRecords)
    && value.learnOutcome.decisionRecords.every((record) => isRecord(record) && isPacketBoundIdentity(record.decisionId, packetId) && isPacketBoundIdentity(record.proposalId, packetId) && packetRefs(record.evidenceRefs)));
  const validLearnRefill = value.learnRefill === null || (isRecord(value.learnRefill)
    && isPacketBoundIdentity(value.learnRefill.projectionId, packetId)
    && Array.isArray(value.learnRefill.followUpCandidates)
    && value.learnRefill.followUpCandidates.every((item) => isRecord(item)
      && isPacketBoundIdentity(item.followUpId, packetId)
      && isPacketBoundIdentity(item.candidateWorkId, packetId)
      && isPacketBoundIdentity(item.sourcePacketId, packetId)
      && packetRefs(item.evidenceRefs))
    && Array.isArray(value.learnRefill.operatorOwnedExits)
    && value.learnRefill.operatorOwnedExits.every((item) => isRecord(item)
      && isPacketBoundIdentity(item.exitId, packetId)
      && isPacketBoundIdentity(item.sourcePacketId, packetId)
      && packetRefs(item.evidenceRefs))
    && isRecord(value.learnRefill.refillSourceState)
    && packetRefs(value.learnRefill.refillSourceState.sourceRefs)
    && packetRefs(value.learnRefill.refillSourceState.evidenceRefs)
    && isRecord(value.learnRefill.housekeeping)
    && packetRefs(value.learnRefill.housekeeping.evidenceRefs)
    && isRecord(value.learnRefill.sourceExhaustion)
    && packetRefs(value.learnRefill.sourceExhaustion.sourceRefs)
    && packetRefs(value.learnRefill.sourceExhaustion.evidenceRefs)
    && (value.learnRefill.readyToTest === null || (isRecord(value.learnRefill.readyToTest)
      && isPacketBoundIdentity(value.learnRefill.readyToTest.readyId, packetId)
      && packetRefs(value.learnRefill.readyToTest.verificationRefs)
      && packetRefs(value.learnRefill.readyToTest.evidenceRefs))));
  const validAlpha = value.alphaMemorySourceStatus === null || (isRecord(value.alphaMemorySourceStatus)
    && isPacketBoundIdentity(value.alphaMemorySourceStatus.statusId, packetId)
    && packetRefs(value.alphaMemorySourceStatus.sourceRefs)
    && packetRefs(value.alphaMemorySourceStatus.evidenceRefs)
    && (value.alphaMemorySourceStatus.llmWikiReadiness === undefined || value.alphaMemorySourceStatus.llmWikiReadiness === null || (isRecord(value.alphaMemorySourceStatus.llmWikiReadiness)
      && isPacketBoundIdentity(value.alphaMemorySourceStatus.llmWikiReadiness.statusId, packetId)
      && packetRefs(value.alphaMemorySourceStatus.llmWikiReadiness.sourceRefs)
      && packetRefs(value.alphaMemorySourceStatus.llmWikiReadiness.evidenceRefs)
      && packetRefs(value.alphaMemorySourceStatus.llmWikiReadiness.memoryProposalRefs)
      && packetRefs(value.alphaMemorySourceStatus.llmWikiReadiness.allowedInputs)
      && (value.alphaMemorySourceStatus.llmWikiReadiness.rebuildPreview === undefined || value.alphaMemorySourceStatus.llmWikiReadiness.rebuildPreview === null || (isRecord(value.alphaMemorySourceStatus.llmWikiReadiness.rebuildPreview)
        && isPacketBoundIdentity(value.alphaMemorySourceStatus.llmWikiReadiness.rebuildPreview.previewId, packetId)
        && packetRefs(value.alphaMemorySourceStatus.llmWikiReadiness.rebuildPreview.inputRefs)
        && packetRefs(value.alphaMemorySourceStatus.llmWikiReadiness.rebuildPreview.memoryProposalRefs)))
      && (value.alphaMemorySourceStatus.llmWikiReadiness.rebuildDryRunPlan === undefined || value.alphaMemorySourceStatus.llmWikiReadiness.rebuildDryRunPlan === null || (isRecord(value.alphaMemorySourceStatus.llmWikiReadiness.rebuildDryRunPlan)
        && isPacketBoundIdentity(value.alphaMemorySourceStatus.llmWikiReadiness.rebuildDryRunPlan.planId, packetId)
        && packetRefs(value.alphaMemorySourceStatus.llmWikiReadiness.rebuildDryRunPlan.inputRefs)
        && packetRefs(value.alphaMemorySourceStatus.llmWikiReadiness.rebuildDryRunPlan.memoryProposalRefs))))));
  const validGate = value.gateStateValidation === null || (isRecord(value.gateStateValidation)
    && value.gateStateValidation.storedStage === value.currentStage
    && value.gateStateValidation.storedOwner === value.currentOwner
    && value.gateStateValidation.storedStatus === value.status
    && Array.isArray(value.gateStateValidation.refStates)
    && value.gateStateValidation.refStates.every((refState) => isRecord(refState) && isPacketBoundIdentity(refState.refId, packetId)));
  const validHermes = value.hermesJob === null || (isRecord(value.hermesJob)
    && value.hermesJob.packetId === packetId
    && isPacketBoundIdentity(value.hermesJob.jobId, packetId)
    && packetRefs(value.hermesJob.inputRefs)
    && (value.hermesJob.writableOutputDir === "not allocated in fixture mode" || isPacketBoundText(value.hermesJob.writableOutputDir, packetId))
    && isPacketBoundIdentity(value.hermesJob.evidenceRef, packetId));
  const validCodex = value.codexWorker === null || (isRecord(value.codexWorker)
    && value.codexWorker.packetId === packetId
    && isPacketBoundIdentity(value.codexWorker.workerId, packetId)
    && packetRefs(value.codexWorker.attemptRefs)
    && isPacketBoundIdentity(value.codexWorker.evidenceRef, packetId));
  const validClaude = value.claudeReview === null || (isRecord(value.claudeReview)
    && value.claudeReview.packetId === packetId
    && isPacketBoundIdentity(value.claudeReview.reviewId, packetId)
    && packetRefs(value.claudeReview.allowedContextRefs)
    && packetRefs(value.claudeReview.excludedContextRefs)
    && isPacketBoundIdentity(value.claudeReview.evidenceRef, packetId));
  const validLifecycle = isRecord(value.lifecycleState)
    && isPacketBoundIdentity(value.lifecycleState.authoritativeRef, packetId)
    && packetRefs(value.lifecycleState.derivedFromRefs)
    && packetRefs(value.lifecycleState.transitionEventRefs)
    && (value.lifecycleState.latestTransitionEventRef === null || isPacketBoundIdentity(value.lifecycleState.latestTransitionEventRef, packetId))
    && (value.lifecycleState.attemptRef === null || isPacketBoundIdentity(value.lifecycleState.attemptRef, packetId));
  const validLoopStops = loopStops.every((stopState) => isRecord(stopState)
    && isPacketBoundIdentity(stopState.stopStateId, packetId)
    && packetRefs(stopState.evidenceRefs));
  const validTransitions = transitions.every((event) => isRecord(event)
    && isPacketBoundIdentity(event.eventId, packetId)
    && packetRefs(event.evidenceRefs)
    && (event.sourceEventId === undefined || event.sourceEventId === null || isPacketBoundIdentity(event.sourceEventId, packetId)));
  const validFixtureEvents = fixtureEvents.every((event) => isRecord(event)
    && isPacketBoundIdentity(event.eventId, packetId)
    && isPacketBoundIdentity(event.actionId, packetId)
    && packetRefs(event.evidenceRefs)
    && (event.humanGateActionId === undefined || event.humanGateActionId === null || isPacketBoundIdentity(event.humanGateActionId, packetId)));
  const validReviews = reviews.every((review) => isRecord(review) && packetRefs(review.evidenceRefs) && packetRefs(review.artifactRefs));
  const validRecoveries = recoveries.every((action) => isRecord(action) && isPacketBoundIdentity(action.actionId, packetId) && packetRefs(action.evidenceRefs));
  return validActions && validRequests && validAttempts && validLanes && validProposals && validGuards
    && workerPacketIds.every((workerPacketId) => workerPacketId === packetId)
    && validCandidate && validWorkItem && validTaskPacket && validRouting && validDelivery && validLearn && validLearnRefill && validAlpha && validGate
    && validLifecycle && validLoopStops && validTransitions && validFixtureEvents && validReviews && validRecoveries
    && validHermes && validCodex && validClaude;
}

function isLifecycle(value: unknown): value is PipelineFixtureLifecycleV1 {
  return isRecord(value)
    && hasOnlyKeys(value, [
      "source", "stage", "owner", "status", "reasonCodes", "authoritativeRef", "derivedFromRefs",
      "transitionEventRefs", "latestTransitionEventRef", "attemptRef", "metadataOnly", "sourceMutationAllowed",
      "providerCallsAllowed", "workerLaunchAllowed", "githubMutationAllowed", "cleanupAllowed",
    ])
    && ["candidate_work", "work_item", "execution_attempt", "workflow_event", "memory_proposal", "delivery_evidence", "source_missing"].includes(String(value.source))
    && fixtureStages.has(value.stage as PipelineStage)
    && fixtureOwners.has(value.owner as WorkPacketOwner)
    && fixtureStatuses.has(value.status as WorkPacketStatus)
    && isStringArray(value.reasonCodes)
    && isNonEmptyString(value.authoritativeRef)
    && isStringArray(value.derivedFromRefs)
    && isStringArray(value.transitionEventRefs)
    && (value.latestTransitionEventRef === null || isNonEmptyString(value.latestTransitionEventRef))
    && (value.attemptRef === null || isNonEmptyString(value.attemptRef))
    && value.metadataOnly === true
    && value.sourceMutationAllowed === false
    && value.providerCallsAllowed === false
    && value.workerLaunchAllowed === false
    && value.githubMutationAllowed === false
    && value.cleanupAllowed === false;
}

/** Strict root/schema/authority validation for demo packets. */
export function isPipelineFixturePacketV1(value: unknown): value is PipelineFixturePacketV1 {
  if (!isRecord(value) || Object.keys(value).some((key) => !fixtureKeys.has(key))) return false;
  return value.schemaVersion === PIPELINE_FIXTURE_SCHEMA_VERSION
    && isNonEmptyString(value.packetId)
    && isNonEmptyString(value.title)
    && isNonEmptyString(value.requestedOutcome)
    && fixtureStages.has(value.currentStage as PipelineStage)
    && fixtureOwners.has(value.currentOwner as WorkPacketOwner)
    && fixtureStatuses.has(value.status as WorkPacketStatus)
    && isLifecycle(value.lifecycleState)
    && value.lifecycleState.stage === value.currentStage
    && value.lifecycleState.owner === value.currentOwner
    && value.lifecycleState.status === value.status
    && ["low", "medium", "high"].includes(String(value.riskLevel))
    && ["low", "normal", "high", "urgent"].includes(String(value.priority))
    && value.sourceKind === "demo-fixture"
    && isNonEmptyString(value.fixtureId)
    && fixtureKinds.has(value.fixtureKind as PipelineFixtureKind)
    && isNonEmptyString(value.fixtureLabel)
    && isNonEmptyString(value.sourceId)
    && isApprovedFixtureIdentity(value)
    && isNonEmptyString(value.summary)
    && isNonEmptyString(value.nextAction)
    && isNonEmptyString(value.confidenceLabel)
    && isNonEmptyString(value.freshnessLabel)
    && fixtureTrustStates.has(value.sourceTrustState as PipelineSourceTrustState)
    && isStringArray(value.sourceTrustStates)
    && value.sourceTrustStates.every((state) => fixtureTrustStates.has(state as PipelineSourceTrustState))
    && value.sourceTrustStates.includes(value.sourceTrustState as PipelineSourceTrustState)
    && isNonEmptyString(value.sourceTrustSummary)
    && isRecord(value.routeFork)
    && hasOnlyKeys(value.routeFork, ["selectedRoute", "rejectedRoutes", "tags", "sourceContext", "lowConfidenceActions"])
    && isNonEmptyString(value.routeFork.selectedRoute)
    && isStringArray(value.routeFork.rejectedRoutes)
    && isStringArray(value.routeFork.tags)
    && isNonEmptyString(value.routeFork.sourceContext)
    && isStringArray(value.routeFork.lowConfidenceActions)
    && isNonEmptyString(value.lastEvent)
    && isStringArray(value.riskFlags)
    && isStringArray(value.matrixRowIds)
    && Array.isArray(value.sourceRefs) && value.sourceRefs.every((ref) => isSourceRef(ref) && isPacketBoundIdentity(ref.refId, String(value.packetId)))
    && Array.isArray(value.evidenceRefs) && value.evidenceRefs.every((ref) => isEvidenceRef(ref) && isPacketBoundIdentity(ref.refId, String(value.packetId)))
    && Array.isArray(value.artifactRefs) && value.artifactRefs.every((ref) => isArtifactRef(ref) && isPacketBoundIdentity(ref.refId, String(value.packetId)))
    && Array.isArray(value.executionAttempts) && value.executionAttempts.every(isExecutionAttempt)
    && Array.isArray(value.transitionEvents) && value.transitionEvents.every(isTransitionEvent)
    && Array.isArray(value.humanGateActions) && value.humanGateActions.every(isHumanGateAction)
    && Array.isArray(value.humanGateActionRequests) && value.humanGateActionRequests.every(isHumanGateActionRequest)
    && Array.isArray(value.laneCards) && value.laneCards.every(isLaneCard)
    && Array.isArray(value.memoryProposals) && value.memoryProposals.every(isMemoryProposal)
    && Array.isArray(value.loopStopStates) && value.loopStopStates.every(isLoopStopState)
    && Array.isArray(value.reviewSummaries) && value.reviewSummaries.every(isReviewSummary)
    && Array.isArray(value.recoveryActions) && value.recoveryActions.every(isRecoveryAction)
    && Array.isArray(value.humanGateFixtureEvents) && value.humanGateFixtureEvents.every(isFixtureEvent)
    && Array.isArray(value.recoveryFixtureEvents) && value.recoveryFixtureEvents.every(isFixtureEvent)
    && Array.isArray(value.actionGuardFixtures) && value.actionGuardFixtures.every(isActionGuardFixture)
    && (value.candidateWork === null || isCandidateWork(value.candidateWork))
    && (value.workItem === null || isWorkItem(value.workItem))
    && (value.taskPacket === null || isTaskPacket(value.taskPacket))
    && (value.routingPreview === null || isRoutingPreview(value.routingPreview))
    && (value.routeSummary === null || (isExactRecord(value.routeSummary, ["recommendation", "confidenceScore", "confidenceBand", "reasonCodes"], ["recommendation", "reasonCodes"])
      && isNonEmptyString(value.routeSummary.recommendation)
      && (value.routeSummary.confidenceScore === undefined || value.routeSummary.confidenceScore === null || (typeof value.routeSummary.confidenceScore === "number" && Number.isFinite(value.routeSummary.confidenceScore)))
      && (value.routeSummary.confidenceBand === undefined || value.routeSummary.confidenceBand === null || isNonEmptyString(value.routeSummary.confidenceBand))
      && isStringArray(value.routeSummary.reasonCodes)))
    && (value.deliveryEvidence === null || isDeliveryEvidence(value.deliveryEvidence))
    && (value.learnOutcome === null || isLearnOutcome(value.learnOutcome))
    && (value.learnRefill === null || isLearnRefill(value.learnRefill))
    && (value.alphaMemorySourceStatus === null || isAlphaMemorySourceStatus(value.alphaMemorySourceStatus))
    && (value.gateStateValidation === null || isGateStateValidation(value.gateStateValidation))
    && (value.localModelHealth === null || isLocalModelHealth(value.localModelHealth))
    && (value.hermesJob === null || (isRecord(value.hermesJob) && isWorkerOrReviewFixture(value.hermesJob, hermesJobKeys, ["jobId", "packetId", "workerProfile", "inputRefs", "allowedMounts", "writableOutputDir", "networkPolicy", "credentialPolicy", "sourceMutationPolicy", "timeoutSeconds", "expectedOutputSchema", "cleanupPolicy", "killSwitch", "executionMode", "statusLabel", "evidenceRef", "containmentSummary", "boundarySummary"])
      && value.hermesJob.networkPolicy === "none" && value.hermesJob.credentialPolicy === "none" && value.hermesJob.sourceMutationPolicy === "forbidden" && value.hermesJob.executionMode === "mocked"))
    && (value.codexWorker === null || (isRecord(value.codexWorker) && isWorkerOrReviewFixture(value.codexWorker, codexWorkerKeys, ["workerId", "packetId", "role", "readiness", "attemptRefs", "currentState", "blockedState", "retentionPolicy", "evidenceRef", "boundarySummary"])
      && value.codexWorker.role === "implementation_worker" && value.codexWorker.retentionPolicy === "metadata_only"))
    && (value.claudeReview === null || (isRecord(value.claudeReview) && isWorkerOrReviewFixture(value.claudeReview, claudeReviewKeys, ["reviewId", "packetId", "purpose", "allowedContextRefs", "excludedContextRefs", "retentionPolicy", "expectedFindingsSchema", "independenceMarker", "costScarcity", "approvalRequirement", "executionMode", "statusLabel", "evidenceRef", "boundarySummary"])
      && value.claudeReview.retentionPolicy === "metadata_only" && value.claudeReview.costScarcity === "scarce" && value.claudeReview.executionMode === "readiness_or_packet_only"))
    && packetBoundNestedIdentitiesAreCoherent(value, value.packetId);
}
