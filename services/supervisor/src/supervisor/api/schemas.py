import re
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, PositiveInt, field_validator, model_serializer, model_validator

from supervisor.domain.types import (
    AuditMode,
    BmadLane,
    CandidateWorkArtifactType,
    CandidateWorkPriority,
    CandidateWorkSource,
    CandidateWorkStatus,
    ExecutionAttemptStatus,
    ErrorCategory,
    RiskLevel,
    RunMode,
    WorkItemFilterScope,
    WorkflowAction,
    WorkflowState,
)

UNSAFE_PIPELINE_EVIDENCE_REF_RE = re.compile(
    r"\b(raw[\s_-]*(prompts?|completions?|transcripts?)|reasoning[\s_-]*traces?|provider[\s_-]*payloads?|secrets?([\s_-]*(key|token|value|id))?|credentials?([\s_-]*(key|token|value|id))?|(terminal|tmux|pane)[\s_-]*(scrollbacks?|texts?|outputs?|stdouts?|stderrs?))\b",
    re.IGNORECASE,
)
UNSAFE_AUTHORITATIVE_METADATA_TEXT_RE = re.compile(
    r"(?:\b(?:raw[\s_-]*(?:prompts?|completions?|transcripts?)|reasoning[\s_-]*traces?|secrets?|credentials?|passwords?)\b|raw[\s_-]*provider[\s_-]*payloads?|provider\s*[:=]|(?:api|access|refresh)[\s_-]*tokens?|api[\s_-]*keys?|authorization\s*:\s*bearer|(?:request|response)[\s_-]*ids?)",
    re.IGNORECASE,
)
UNSAFE_METADATA_KEY_RE = re.compile(r"(secret|credential|password|token|raw.?payload|provider.?payload|prompt|completion|reasoning)", re.IGNORECASE)
TOKEN_LIKE_METADATA_VALUE_RE = re.compile(
    r"(?<![A-Za-z0-9])(?:sk-(?:proj-)?[A-Za-z0-9][A-Za-z0-9_-]{7,}|gh[pousr]_[A-Za-z0-9]{12,}|github_pat_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{8,}|AIza[A-Za-z0-9_-]{8,}|AKIA[A-Z0-9]{8,}|ASIA[A-Z0-9]{8,}|glpat-[A-Za-z0-9_-]{8,}|npm_[A-Za-z0-9]{8,}|Bearer\s+[A-Za-z0-9._~+/=-]{20,}|eyJ[A-Za-z0-9_-]{20,})(?![A-Za-z0-9_-])"
    r"|(?<![A-Za-z0-9])[A-Za-z]{2,12}[-_](?=(?:[A-Za-z0-9]*\d){2})[A-Za-z0-9]{20,}(?![A-Za-z0-9])"
    r"|^(?=[A-Za-z0-9+/]{48,}={0,2}$)(?=.*[0-9+/=])[A-Za-z0-9+/]+={0,2}$|^(?=[a-f0-9]{40,}$)(?=.*[0-9])[a-f0-9]+$",
    re.IGNORECASE,
)
MAX_METADATA_DEPTH = 64
MAX_METADATA_NODES = 1000
MAX_METADATA_AGGREGATE_BYTES = 64 * 1024
EXECUTABLE_PIPELINE_CONTROL_TEXT_RE = re.compile(
    r"\b(tmux\s+(kill|send|capture|new|attach)|git(hub)?\s+(push|merge|checkout|reset|clean|branch|pr)|gh\s+(pr|repo|api)|curl\s+|bash\s+|sh\s+|python\s+|node\s+|pnpm\s+|uv\s+run|provider\s+(call|request|payload))\b",
    re.IGNORECASE,
)


def _is_safe_pipeline_evidence_ref(value: str) -> bool:
    ref = value.strip()
    return bool(ref) and len(ref) <= 255 and not UNSAFE_PIPELINE_EVIDENCE_REF_RE.search(ref)


def _is_safe_pipeline_control_text(value: str) -> bool:
    text = value.strip()
    return (
        bool(text)
        and len(text) <= 500
        and not UNSAFE_PIPELINE_EVIDENCE_REF_RE.search(text)
        and not EXECUTABLE_PIPELINE_CONTROL_TEXT_RE.search(text)
    )


def _is_safe_local_proof_text(value: str) -> bool:
    text = value.strip()
    return (
        bool(text)
        and len(text) <= 160
        and not UNSAFE_PIPELINE_EVIDENCE_REF_RE.search(text)
        and not TOKEN_LIKE_METADATA_VALUE_RE.search(text)
    )


def _validate_authoritative_metadata_text(value: str, *, path: str) -> str:
    text = value.strip()
    if not text:
        raise ValueError(f"{path} must not be blank")
    if (
        UNSAFE_AUTHORITATIVE_METADATA_TEXT_RE.search(text)
        or TOKEN_LIKE_METADATA_VALUE_RE.search(text)
    ):
        raise ValueError(f"{path} contains secret, credential, raw-provider, or token-like content.")
    return text


def _validate_work_item_scalar_text(value: str) -> str:
    text = value.strip()
    if (
        len(text) > 1000
        or UNSAFE_PIPELINE_EVIDENCE_REF_RE.search(text)
        or TOKEN_LIKE_METADATA_VALUE_RE.search(text)
        or re.search(r"(?:provider\s*[:=]|(?:request|response)[\s_-]*ids?\s*[:=])", text, re.IGNORECASE)
    ):
        raise ValueError("WorkItem scalar contains secret, credential, raw-provider, or token-like content.")
    return text


def _validate_metadata_tree(
    value: Any,
    *,
    path: str = "metadata",
    _depth: int = 0,
    _state: dict[str, int] | None = None,
) -> Any:
    state = {"nodes": 0, "bytes": 0} if _state is None else _state
    if _depth > MAX_METADATA_DEPTH:
        raise ValueError(f"{path} exceeds the metadata nesting limit of {MAX_METADATA_DEPTH}.")
    state["nodes"] += 1
    if state["nodes"] > MAX_METADATA_NODES:
        raise ValueError(f"{path} exceeds the metadata node limit of {MAX_METADATA_NODES}.")

    def add_size(size: int) -> None:
        state["bytes"] += size
        if state["bytes"] > MAX_METADATA_AGGREGATE_BYTES:
            raise ValueError(f"{path} exceeds the metadata aggregate size limit of {MAX_METADATA_AGGREGATE_BYTES} bytes.")

    if isinstance(value, dict):
        safe: dict[str, Any] = {}
        for key, child in value.items():
            if not isinstance(key, str) or not key.strip():
                raise ValueError(f"{path} keys must be non-empty strings.")
            key = key.strip()
            add_size(len(key.encode("utf-8")))
            if UNSAFE_METADATA_KEY_RE.search(key):
                raise ValueError(f"{path}.{key} is not permitted in metadata-only state.")
            safe[key] = _validate_metadata_tree(child, path=f"{path}.{key}", _depth=_depth + 1, _state=state)
        return safe
    if isinstance(value, list):
        return [
            _validate_metadata_tree(child, path=f"{path}[]", _depth=_depth + 1, _state=state)
            for child in value
        ]
    if isinstance(value, str):
        text = value.strip()
        add_size(len(text.encode("utf-8")))
        digest_value = path.endswith(".sourceContentSha256") and bool(re.fullmatch(r"[0-9a-fA-F]{64}", text))
        if (
            len(text) > 1000
            or UNSAFE_PIPELINE_EVIDENCE_REF_RE.search(text)
            or UNSAFE_AUTHORITATIVE_METADATA_TEXT_RE.search(text)
            or (TOKEN_LIKE_METADATA_VALUE_RE.search(text) and not digest_value)
        ):
            raise ValueError(f"{path} contains secret, credential, raw-provider, or token-like content.")
        return text
    if value is None or isinstance(value, (bool, int, float)):
        add_size(len(str(value).encode("utf-8")))
        return value
    raise ValueError(f"{path} contains an unsupported metadata value.")


class WorkItemCreate(BaseModel):
    title: str
    requestedOutcome: str
    source: str
    details: str | None = None
    riskLevel: RiskLevel = RiskLevel.LOW
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("title", "requestedOutcome", "source", "details")
    @classmethod
    def _copied_scalar_fields_must_be_safe_metadata(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _validate_work_item_scalar_text(value)

    @field_validator("metadata")
    @classmethod
    def _metadata_must_be_safe_and_non_authoritative(cls, value: dict[str, Any]) -> dict[str, Any]:
        reserved = {"authoritativepacketid", "localproofauthority"}
        if any(str(key).lower() in reserved for key in value):
            raise ValueError("Generic WorkItem creation cannot provide canonical packet linkage metadata.")
        return _validate_metadata_tree(value)


class CandidateWorkCreate(BaseModel):
    title: str
    requestedOutcome: str
    source: CandidateWorkSource
    sourceArtifactPath: str
    sourceArtifactType: CandidateWorkArtifactType
    riskLevel: RiskLevel = RiskLevel.LOW
    priority: CandidateWorkPriority = CandidateWorkPriority.NORMAL
    sortOrder: int = 0
    importMetadata: dict[str, Any] = Field(default_factory=dict)


class CandidateWorkUpdate(BaseModel):
    status: CandidateWorkStatus | None = None
    priority: CandidateWorkPriority | None = None
    riskLevel: RiskLevel | None = None
    sortOrder: int | None = None


class CandidateWorkSourceSummaryView(BaseModel):
    label: str
    summary: str
    sourceType: CandidateWorkSource
    sourceRef: str
    sourceArtifactPath: str
    freshness: Literal["fresh", "stale", "unknown", "not_applicable"]
    accessState: Literal["allowed", "excluded", "missing", "blocked"]
    retentionPolicy: str
    boundarySummary: str
    evidenceRefs: list[str]
    approvalStatus: str
    approvedBy: str
    approvedAt: str


class CandidateWorkView(BaseModel):
    id: str
    title: str
    requestedOutcome: str
    source: CandidateWorkSource
    sourceArtifactPath: str
    sourceArtifactType: CandidateWorkArtifactType
    riskLevel: RiskLevel
    priority: CandidateWorkPriority
    sortOrder: int
    status: CandidateWorkStatus
    createdAt: datetime
    updatedAt: datetime
    approvedAt: datetime | None = None
    promotedWorkItemId: str | None = None
    sourceSummary: CandidateWorkSourceSummaryView | None = None
    importMetadata: dict[str, Any] = Field(default_factory=dict)


class BmadImportPackageView(BaseModel):
    title: str
    requestedOutcome: str
    sourceArtifactPath: str
    sourceArtifactType: CandidateWorkArtifactType
    artifactTitle: str
    storyId: str | None = None
    epicId: str | None = None
    acceptanceCriteria: str
    riskLevel: RiskLevel
    recommendedPriority: CandidateWorkPriority
    verificationSummary: str
    allowedScope: str | None = None
    notes: list[str] = Field(default_factory=list)


class CandidateWorkBmadImportRequest(BaseModel):
    artifactPath: str
    sortOrder: int = 0


class CandidateWorkObsidianMetadataImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    requestedOutcome: str
    sourceArtifactPath: str
    sourceRef: str
    evidenceRefs: list[str]
    approvalStatus: str
    approvedBy: str | None = None
    approvedAt: datetime | None = None
    freshness: Literal["fresh", "stale", "unknown", "not_applicable"] = "fresh"
    riskLevel: RiskLevel = RiskLevel.LOW
    priority: CandidateWorkPriority = CandidateWorkPriority.NORMAL
    sortOrder: int = 0


class WorkPacketLearnFollowUpCandidateWorkRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    triggerKind: Literal["completed_packet", "failed_attempt", "rejected_approval", "quality_failure", "operator_feedback"]
    title: str = Field(min_length=1, max_length=200)
    requestedOutcome: str = Field(min_length=1, max_length=1000)
    evidenceRefs: list[str] = Field(min_length=1, max_length=20)
    operatorFeedback: str | None = Field(default=None, max_length=2000)
    priority: CandidateWorkPriority = CandidateWorkPriority.NORMAL
    riskLevel: RiskLevel = RiskLevel.LOW
    sortOrder: int = 0

    @field_validator("title", "requestedOutcome", "operatorFeedback", mode="before")
    @classmethod
    def strip_optional_text(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("evidenceRefs", mode="before")
    @classmethod
    def normalize_evidence_refs(cls, value: object) -> object:
        if not isinstance(value, list):
            return value
        normalized: list[str] = []
        for ref in value:
            if isinstance(ref, str):
                trimmed = ref.strip()
                if trimmed and trimmed not in normalized:
                    normalized.append(trimmed[:256])
        return normalized


class WorkItemActionRequest(BaseModel):
    action: WorkflowAction
    note: str | None = None
    actorId: str | None = None
    actorLabel: str | None = None


class WorkItemManagedActionRequest(BaseModel):
    expectedActionId: str | None = None
    note: str | None = None
    actorId: str | None = None
    actorLabel: str | None = None


class WorkItemDeliveryReadinessRequest(BaseModel):
    pullRequestStatus: str | None = None
    pullRequestUrl: str | None = None
    ciStatus: str | None = None
    mergeStatus: str | None = None
    deliveryWaived: bool = False
    deliveryWaiverReason: str | None = None
    note: str | None = None
    actorId: str | None = None
    actorLabel: str | None = None


class WorkItemBranchPreparationRequest(BaseModel):
    note: str | None = None
    actorId: str | None = None
    actorLabel: str | None = None


class WorkItemDeliveryReadinessView(BaseModel):
    pullRequestStatus: str
    pullRequestUrl: str | None = None
    ciStatus: str
    mergeStatus: str
    deliveryWaived: bool = False
    deliveryWaiverReason: str | None = None
    remoteOperationsPerformed: bool = False
    remoteOperationsPolicy: str
    readyForApproval: bool = False


class WorkItemPolicyGateView(BaseModel):
    id: str
    label: str
    requiredBefore: str
    summary: str
    evidence: list[str]


class WorkItemRemoteAutomationPolicyView(BaseModel):
    status: str
    summary: str
    allowedOperations: list[str]
    blockedOperations: list[str]
    approvalRequirements: list[str]


class WorkItemRecipeGateAuditEntryView(BaseModel):
    gateId: str
    label: str
    requiredBefore: str
    status: str
    summary: str
    evidence: list[str]
    latestEventType: str | None = None
    latestEventAt: datetime | None = None
    reason: str | None = None


class WorkItemManagedActionRecoveryView(BaseModel):
    mode: str
    label: str
    detail: str


class WorkItemManagedActionView(BaseModel):
    actionId: str
    label: str
    status: str
    reason: str
    requiredGate: str | None = None
    operatorCheckpoint: str | None = None
    allowedActor: str
    remoteOperation: bool = False
    recovery: WorkItemManagedActionRecoveryView | None = None


class WorkItemRecipeGateAuditView(BaseModel):
    recipeId: str
    status: str
    passedCount: int
    blockedCount: int
    pendingCount: int
    gates: list[WorkItemRecipeGateAuditEntryView]
    nextManagedAction: WorkItemManagedActionView


class WorkItemRoutingPreviewRequest(BaseModel):
    stepId: str | None = None
    taskKind: str | None = None
    recordEvent: bool = False


class WorkItemSubscriptionHandoffRequest(BaseModel):
    stepId: str | None = None
    taskKind: str | None = None
    recordEvent: bool = False


class WorkItemPremiumApprovalRequest(BaseModel):
    stepId: str | None = None
    taskKind: str | None = None
    approvalReason: str | None = None
    recordEvent: bool = False


class WorkItemSubscriptionAgentLaunchStubRequest(BaseModel):
    stepId: str | None = None
    taskKind: str | None = None
    requestedAgent: str | None = None
    recordEvent: bool = False


class WorkItemSubscriptionAgentLaunchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    stepId: str | None = None
    taskKind: str | None = None
    requestedAgent: str | None = None
    recordEvent: bool = False
    workItemId: str | None = None
    attemptId: str | None = None
    executionAttemptId: str | None = None
    routeDecisionId: str | None = None
    workerId: str | None = None
    lane: str | None = None
    authorityMode: str | None = None
    workspacePlanId: str | None = None
    launchPolicyId: str | None = None
    targetId: str | None = None
    commandTemplateId: str | None = None
    commandTemplateExecutionStatus: str | None = None
    approvalActor: str | None = None
    approvalTimestamp: datetime | None = None
    approvalExpiry: datetime | None = None
    permissionEnvelope: str | None = None
    environmentAllowlist: list[str] = Field(default_factory=list)
    blockedCredentialSessionPaths: list[str] = Field(default_factory=list)
    artifactLimits: dict[str, Any] = Field(default_factory=dict)
    redactionPolicy: str | None = None
    truncationPolicy: str | None = None
    outputPolicy: str | None = None
    startupTimeoutSeconds: PositiveInt | None = None
    runTimeoutSeconds: PositiveInt | None = None
    cancellationTimeoutSeconds: PositiveInt | None = None
    startupTimeoutPolicy: str | None = None
    runTimeoutPolicy: str | None = None
    cancellationTimeoutPolicy: str | None = None
    heartbeatPolicy: str | None = None
    childProcessTreeTrackingPolicy: str | None = None
    orphanDetectionPolicy: str | None = None
    terminalStateReconciliationPolicy: str | None = None
    idempotentCleanupPolicy: str | None = None
    dashboardControls: str | None = None
    rollbackPolicy: str | None = None
    verificationCommand: str | None = None
    allowedOutputMode: str | None = None
    approvalId: str | None = None
    authorityFamily: str | None = None
    operation: str | None = None
    commandArgv: list[str] = Field(default_factory=list)
    cwd: str | None = None
    retainedEvidence: list[str] = Field(default_factory=list)
    stopLines: list[str] = Field(default_factory=list)


class LocalProviderApprovalInstance(BaseModel):
    approvalId: str | None = None
    status: str | None = None
    authorityFamily: str | None = None
    operation: str | None = None
    endpointUrl: str | None = None
    modelId: str | None = None
    promptSourceId: str | None = None
    promptTemplateId: str | None = None
    redactionPolicy: str | None = None
    timeoutCancellationPolicy: str | None = None
    retainedEvidencePolicy: str | None = None
    retainedEvidence: list[str] = Field(default_factory=list)
    approvedBy: str | None = None
    approvedAt: datetime | None = None
    expiresAt: datetime | None = None
    reviewPoint: str | None = None
    rollbackPath: list[str] = Field(default_factory=list)
    stopLines: list[str] = Field(default_factory=list)


class WorkItemLocalEvidenceExplanationRequest(BaseModel):
    stepId: str | None = None
    taskKind: str | None = None
    recordEvent: bool = False
    localProviderApproval: LocalProviderApprovalInstance | None = None


class WorkItemRoutingOverrideRequest(BaseModel):
    proposedLane: str
    reason: str
    note: str | None = None
    actorId: str | None = None
    actorLabel: str | None = None


class WorkItemExecutionAttemptCreateRequest(BaseModel):
    stepId: str | None = None
    taskKind: str | None = None
    routeDecisionId: str | None = None
    actorId: str | None = None
    actorLabel: str | None = None


class WorkItemLocalProofRequest(BaseModel):
    proofMode: Literal["integrated_local"]
    idempotencyKey: str = Field(min_length=1, max_length=160)
    correlationId: str = Field(min_length=1, max_length=80)
    scenario: Literal["happy", "worker_failure", "verification_failure", "completion_fencing_failure"] = "happy"
    actorId: str = "local-proof"
    actorLabel: str = "Integrated local proof"

    @field_validator("idempotencyKey", "correlationId", "actorId", "actorLabel")
    @classmethod
    def _local_proof_text_must_be_metadata_only(cls, value: str) -> str:
        value = value.strip()
        if not _is_safe_local_proof_text(value):
            raise ValueError("Local-proof identifiers and actor metadata must be safe metadata-only text.")
        return value


class WorkItemLocalProofLeaseRequest(BaseModel):
    proofMode: Literal["integrated_local"]
    idempotencyKey: str = Field(min_length=1, max_length=160)
    correlationId: str = Field(min_length=1, max_length=120)
    operation: Literal["claim", "heartbeat", "stale_heartbeat", "expire"]
    fencingToken: int | None = None
    actorId: str = "local-proof"
    actorLabel: str = "Integrated local proof"

    @field_validator("idempotencyKey", "correlationId", "actorId", "actorLabel")
    @classmethod
    def _local_proof_lease_text_must_be_metadata_only(cls, value: str) -> str:
        value = value.strip()
        if not _is_safe_local_proof_text(value):
            raise ValueError("Local-proof lease identifiers and actor metadata must be safe metadata-only text.")
        return value


class WorkItemExecutionAttemptTransitionRequest(BaseModel):
    status: ExecutionAttemptStatus
    reason: str | None = None
    workItemId: str | None = None
    attemptId: str | None = None
    routeDecisionId: str | None = None
    workerId: str | None = None
    lane: str | None = None
    authorityMode: str | None = None
    workspacePlanId: str | None = None
    launchPolicyId: str | None = None
    targetId: str | None = None
    commandTemplateId: str | None = None
    approvalTimestamp: datetime | None = None
    expiresAt: datetime | None = None
    actorId: str | None = None
    actorLabel: str | None = None


class WorkItemSupervisedCodexLaunchRequest(BaseModel):
    taskId: str
    dryRun: bool = True
    allowedPaths: list[str]
    blockedPaths: list[str]
    verificationCommand: str
    outputSummary: str
    touchedFiles: list[str] = Field(default_factory=list)
    routeDecisionId: str | None = None
    workerId: str | None = None
    lane: str | None = None
    authorityMode: str | None = None
    approvalTimestamp: datetime | None = None
    expiresAt: datetime | None = None
    actorId: str | None = None
    actorLabel: str | None = None


class WorkItemVerificationEvidenceRequest(BaseModel):
    commandId: str
    label: str
    commandShape: str
    status: str
    exitCode: int | None = None
    durationMs: int | None = None
    summary: str
    artifactRef: str | None = None
    recoveryAction: str
    rollbackStatus: str | None = None
    rollbackReason: str | None = None
    nextSafeAction: str | None = None


class WorkspaceIsolationPlanView(BaseModel):
    planId: str
    sourceSnapshotStrategy: str
    branchStrategy: str
    readRoots: list[str]
    writeRoots: list[str]
    artifactRoot: str
    forbiddenPaths: list[str]
    cleanupRule: str
    rollbackRule: str
    diffCaptureRule: str
    writesAllowed: bool = False
    sourceMutationAllowed: bool = False
    commandsAllowed: bool = False
    networkAllowed: bool = False
    credentialAccessAllowed: bool = False
    redactionBoundary: list[str] = Field(default_factory=list)
    allowedCommandClasses: list[str] = Field(default_factory=list)
    blockedCommandClasses: list[str] = Field(default_factory=list)
    providerEndpointPolicy: str = "provider_endpoints_denied"
    promptConstructionPolicy: str = "approved_evidence_only"
    boundaryRejectionReason: str = "worker_execution_safety_boundary_not_satisfied"
    materializationMode: str = "metadata_only"
    environmentPolicy: str = "deny_inheritance_allowlist_only"
    environmentAllowlist: list[str] = Field(default_factory=list)
    sessionBoundary: str = "credentials_sessions_and_shell_profiles_forbidden"
    outputPolicy: str = "summary_only_no_raw_output"


class ExecutionAttemptView(BaseModel):
    attemptId: str
    workItemId: str
    leaseId: str | None = None
    fencingToken: int | None = None
    routeDecisionId: str
    workerId: str
    lane: str
    authorityMode: str
    status: ExecutionAttemptStatus
    requestedById: str | None = None
    requestedByLabel: str | None = None
    createdAt: datetime
    updatedAt: datetime
    startedAt: datetime | None = None
    completedAt: datetime | None = None
    heartbeatAt: datetime | None = None
    timeoutAt: datetime | None = None
    cancelRequestedAt: datetime | None = None
    cancelReason: str | None = None
    rejectionReason: str | None = None
    failureReason: str | None = None
    workspaceIsolationPlan: WorkspaceIsolationPlanView
    artifactRefs: list[dict[str, Any]] = Field(default_factory=list)
    eventRefs: list[dict[str, Any]] = Field(default_factory=list)


class ExecutableWorkItemActionView(BaseModel):
    actionId: str
    label: str
    method: Literal["POST"]
    endpoint: str
    payload: WorkItemExecutionAttemptCreateRequest
    status: Literal["available", "blocked"]
    reason: str


class ExecutableWorkItemShapeView(BaseModel):
    workItemId: str
    routeDecisionId: str
    workerId: str
    lane: str
    authorityMode: str
    taskKind: str
    workspaceIsolationPlan: WorkspaceIsolationPlanView
    createAttemptAction: ExecutableWorkItemActionView
    executionAllowed: bool = False
    processLaunchAllowed: bool = False
    providerCallsAllowed: bool = False
    commandExecutionAllowed: bool = False
    sourceMutationAllowed: bool = False
    credentialAccessAllowed: bool = False
    requiredEvidence: list[str] = Field(default_factory=list)
    stopLines: list[str] = Field(default_factory=list)
    recoveryPath: str


class RoutingProfileView(BaseModel):
    workItemId: str
    stepId: str
    taskKind: str
    phase: str | None = None
    riskLevel: str
    privacyLevel: str
    writeScope: str
    allowedPaths: list[str]
    contextNeed: str
    reasoningNeed: str
    determinismNeed: str
    validationExpectations: list[str]
    preferredLanes: list[str]
    forbiddenLanes: list[str]
    escalationTriggers: list[str]


class RejectedRoutingLaneView(BaseModel):
    lane: str
    rejectionCodes: list[str]
    explanation: str


class RoutingDecisionView(BaseModel):
    decisionId: str
    workItemId: str
    stepId: str
    createdAt: datetime
    profileSnapshot: RoutingProfileView
    selectedLane: str
    selectedWorkerId: str | None = None
    authorityMode: str
    confidenceScore: float
    confidenceBand: str
    reasonCodes: list[str]
    rejectedLanes: list[RejectedRoutingLaneView]
    rejectedWorkers: list[str]
    permissionSummary: str
    escalationPath: list[str]
    humanExplanation: str


class RoutingPreviewView(BaseModel):
    profile: RoutingProfileView
    decision: RoutingDecisionView


class TaskPacketV0View(BaseModel):
    workItemId: str
    title: str
    requestedOutcome: str
    source: str
    sourceArtifactPath: str
    taskKind: str
    riskLevel: str
    priority: str
    approvalMode: str
    verificationSummary: str


class TaskPacketPreviewView(BaseModel):
    packet: TaskPacketV0View
    route: RoutingDecisionView
    executableWorkItem: ExecutableWorkItemShapeView
    whyThisPath: str
    previewOnly: bool = True
    executionAttemptCreated: bool = False
    providerCallsAllowed: bool = False
    commandExecutionAllowed: bool = False


class SourceRefV0View(BaseModel):
    refId: str
    sourceType: Literal["candidate_work", "work_item", "bmad_artifact", "obsidian", "llm_wiki", "github", "research", "manual"]
    label: str
    pathOrUrl: str | None = None
    freshness: Literal["fresh", "stale", "unknown", "not_applicable"] = "unknown"
    accessState: Literal["allowed", "excluded", "missing", "blocked"] = "allowed"
    canonical: bool = True
    summaryOnly: bool = True
    blockedReason: str | None = None


class EvidenceRefV0View(BaseModel):
    refId: str
    evidenceType: Literal["route", "event", "attempt", "local_model", "review", "gate", "memory", "fixture"]
    label: str
    artifactPath: str | None = None
    retentionClass: Literal["metadata_only", "summary", "fixture"] = "metadata_only"
    rawPayloadRetained: Literal[False] = False


class ArtifactRefV0View(BaseModel):
    refId: str
    artifactType: Literal["plan", "progress", "report", "pull_request", "check", "memory_proposal", "fixture"]
    label: str
    pathOrUrl: str | None = None
    status: Literal["available", "missing", "blocked", "deferred"] = "available"


class HumanGateActionV0View(BaseModel):
    actionId: str
    actionType: Literal["approve", "reject", "revise", "reroute", "retry_smaller", "mark_blocked", "send_back"]
    label: str
    availability: Literal["available", "blocked", "stale", "complete"]
    summary: str
    requiredEvidenceRefs: list[str] = Field(default_factory=list)
    resultingStage: Literal[
        "capture",
        "classify",
        "route",
        "shape",
        "human_gate",
        "execute",
        "review",
        "promote",
        "deliver",
        "learn",
    ] | None = None
    resultingOwner: Literal[
        "kendall",
        "operator",
        "local_model",
        "hermes_worker_mock",
        "codex_worker",
        "claude_reviewer",
        "github",
        "memory_review",
        "blocked",
    ] | None = None


class HumanGateActionRequestV0View(BaseModel):
    requestId: str
    packetId: str
    actionId: str
    decisionId: str
    requestedActionType: Literal[
        "approve_route",
        "approve_execution",
        "approve_provider_exception",
        "approve_memory_proposal",
        "approve_delivery",
        "reject_packet",
        "edit_packet",
        "request_clarification",
        "downgrade_to_reference",
        "send_back_to_shape",
        "send_back_to_research",
        "cancel_worker",
        "discard_result",
        "rerun_smaller",
        "reroute",
    ]
    requestDisplayLabel: str
    requestedByLabel: str
    requestedAt: str
    status: Literal["recorded", "rejected", "blocked", "stale"]
    auditEventType: str
    evidenceRefs: list[str] = Field(default_factory=list)
    retentionClass: Literal["metadata_only"] = "metadata_only"
    rawPayloadRetained: Literal[False] = False
    executionStarted: Literal[False] = False
    resultingStateApplied: Literal[False] = False
    stopLines: list[str] = Field(default_factory=list)
    rollbackPath: str
    rejectionReason: str | None = None


class WorkPacketLaneCardV0View(BaseModel):
    laneId: str
    laneType: Literal[
        "local_model",
        "hermes_worker_mock",
        "codex_worker",
        "claude_reviewer",
        "github",
        "memory_review",
        "utility",
        "local_readonly",
        "local_patch_draft",
        "local_sandbox_execute",
        "subscription_handoff",
        "subscription_agent",
        "premium_approval",
        "codex_cli_worker",
        "unknown",
    ]
    label: str
    status: Literal["idle", "available", "pending", "running", "blocked", "complete", "skipped"]
    summary: str
    currentOwner: Literal[
        "kendall",
        "operator",
        "local_model",
        "hermes_worker_mock",
        "codex_worker",
        "claude_reviewer",
        "github",
        "memory_review",
        "blocked",
    ] | None = None
    routeConfidence: float | None = None
    reasonCodes: list[str] = Field(default_factory=list)
    evidenceRefs: list[str] = Field(default_factory=list)
    artifactRefs: list[str] = Field(default_factory=list)


MemoryProposalStatusV0 = Literal[
    "not_applicable",
    "proposed",
    "pending_human_approval",
    "approved",
    "rejected",
    "deferred",
    "edit_needed",
    "blocked",
    "stale",
    "contradictory",
]
MemoryProposalTypeV0 = Literal[
    "new_note",
    "append_note",
    "link_notes",
    "tag_update",
    "decision_record",
    "error_book_entry",
    "user_facing_documentation",
]
MemoryProposalSensitivityV0 = Literal["low", "medium", "high"]
MemoryProposalFreshnessV0 = Literal["fresh", "stale", "conflicting", "unknown"]
LlmWikiRebuildBasisV0 = Literal["approved-memory-proposals", "source-evidence-crosswalk"]
MemoryProposalContradictionStatusV0 = Literal["none", "possible", "confirmed"]
MemoryProposalConfidenceV0 = Literal["low", "medium", "high"]
MemoryProposalOperatorActionV0 = Literal["approve", "edit", "reject", "defer", "blocked"]
MemoryProposalWriteBackStatusV0 = Literal["not_started", "blocked", "review_gated", "approved_for_future", "deferred"]


class MemoryProposalCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    proposalId: str
    label: str
    status: MemoryProposalStatusV0 = "pending_human_approval"
    summary: str
    sourceRefs: list[str] = Field(min_length=1)
    evidenceRefs: list[str] = Field(min_length=1)
    targetRef: SourceRefV0View | None = None
    targetVaultPath: str | None = None
    targetVaultFolder: str
    proposalType: MemoryProposalTypeV0
    suggestedContentSummary: str
    patchSummary: str | None = None
    sensitivity: MemoryProposalSensitivityV0
    freshness: MemoryProposalFreshnessV0
    contradictionStatus: MemoryProposalContradictionStatusV0
    confidence: MemoryProposalConfidenceV0
    operatorAction: MemoryProposalOperatorActionV0
    actorId: str | None = None
    actorLabel: str | None = None
    decisionNeededContext: str | None = None
    backupRecoveryPath: str
    writeBackStatus: MemoryProposalWriteBackStatusV0
    writeBackAllowed: Literal[False] = False


class MemoryProposalUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: MemoryProposalStatusV0 | None = None
    operatorAction: MemoryProposalOperatorActionV0 | None = None
    actorId: str | None = None
    actorLabel: str | None = None
    decisionNeededContext: str | None = None
    writeBackStatus: MemoryProposalWriteBackStatusV0 | None = None
    patchSummary: str | None = None
    writeBackAllowed: Literal[False] = False


class MemoryProposalAiDraftWriteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    actorId: str | None = None
    actorLabel: str | None = None


class LlmWikiDisposableRebuildWriteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    approvalRef: str
    actorId: str | None = None
    actorLabel: str | None = None


class LlmWikiArtifactSearchResultView(BaseModel):
    targetVaultPath: str
    query: str
    matched: bool
    excerpts: list[str] = Field(default_factory=list)
    metadata: dict[str, str] = Field(default_factory=dict)
    retentionClass: Literal["metadata_only"] = "metadata_only"
    rawPayloadRetained: Literal[False] = False
    sourceContentCopied: Literal[False] = False
    canonicalMutationAllowed: Literal[False] = False
    sourceMutationAllowed: Literal[False] = False


class MemoryProposalV0View(BaseModel):
    proposalId: str
    packetId: str
    label: str
    status: MemoryProposalStatusV0
    summary: str
    targetRef: SourceRefV0View | None = None
    sourceRefs: list[str] = Field(min_length=1)
    evidenceRefs: list[str] = Field(min_length=1)
    targetVaultPath: str | None = None
    targetVaultFolder: str
    proposalType: MemoryProposalTypeV0
    suggestedContentSummary: str
    patchSummary: str | None = None
    sensitivity: MemoryProposalSensitivityV0
    freshness: MemoryProposalFreshnessV0
    contradictionStatus: MemoryProposalContradictionStatusV0
    confidence: MemoryProposalConfidenceV0
    operatorAction: MemoryProposalOperatorActionV0
    decisionNeededContext: str | None = None
    backupRecoveryPath: str
    writeBackStatus: MemoryProposalWriteBackStatusV0
    writeBackAllowed: Literal[False] = False


class WorkPacketLearnDecisionRecordV0View(BaseModel):
    decisionId: str
    proposalId: str
    proposalType: MemoryProposalTypeV0
    actor: str
    result: MemoryProposalStatusV0
    operatorAction: MemoryProposalOperatorActionV0
    evidenceRefs: list[str] = Field(default_factory=list)
    recoveryPath: str
    writeBackStatus: MemoryProposalWriteBackStatusV0
    canonicalMutationAllowed: Literal[False] = False
    durableWriteAllowed: Literal[False] = False


class WorkPacketLearnOutcomeV0View(BaseModel):
    outcomeId: str
    status: Literal["not_applicable", "pending", "accepted", "rejected", "deferred", "blocked"]
    retentionClass: Literal["metadata_only"] = "metadata_only"
    learningProposalCount: int
    documentationProposalStatus: MemoryProposalStatusV0 | Literal["not_present"] = "not_present"
    automationAuthorityChangeStatus: Literal["not_requested", "blocked", "deauthorized", "review_gated", "accepted"] = "not_requested"
    blockedWriteBackState: MemoryProposalWriteBackStatusV0 | Literal["not_applicable"] = "not_applicable"
    nextSafeAction: str
    decisionRecords: list[WorkPacketLearnDecisionRecordV0View] = Field(default_factory=list)
    evidenceRefs: list[str] = Field(default_factory=list)
    sourceRefs: list[str] = Field(default_factory=list)
    canonicalMutationAllowed: Literal[False] = False
    sourceMutationAllowed: Literal[False] = False
    providerCallsAllowed: Literal[False] = False
    durableWriteAllowed: Literal[False] = False


class WorkPacketLearnFollowUpCandidateV0View(BaseModel):
    followUpId: str
    candidateWorkId: str
    label: str
    sourcePacketId: str
    reason: str
    status: CandidateWorkStatus | Literal["not_created"]
    origin: Literal["failure", "approval", "rejection", "quality", "operator_feedback"]
    reentryPath: Literal["reenter_capture", "human_gate", "learn_review", "none"]
    evidenceRefs: list[str] = Field(default_factory=list)
    metadataOnly: Literal[True] = True
    rawPayloadRetained: Literal[False] = False


class WorkPacketOperatorOwnedExitV0View(BaseModel):
    exitId: str
    sourcePacketId: str
    state: Literal["operator_owned"] = "operator_owned"
    reason: str
    stopStateKind: Literal[
        "limit_window",
        "operator_approval",
        "review_thread",
        "failed_check",
        "tool_churn",
        "unsafe_cleanup",
        "scope_boundary",
        "owner_conflict",
        "operator_owned_exit",
    ]
    reentryPath: Literal["reenter_capture"] = "reenter_capture"
    evidenceRefs: list[str] = Field(default_factory=list)
    metadataOnly: Literal[True] = True
    rawPayloadRetained: Literal[False] = False


class WorkPacketRefillSourceStateV0View(BaseModel):
    state: Literal["healthy", "source_exhausted", "blocked", "refilling", "unknown"]
    operationalLabel: str
    explanation: str
    sourceRefs: list[str] = Field(default_factory=list)
    evidenceRefs: list[str] = Field(default_factory=list)
    metadataOnly: Literal[True] = True


class WorkPacketReadyToTestV0View(BaseModel):
    readyId: str
    userFacingSummary: str
    testableSurface: str
    verificationRefs: list[str] = Field(default_factory=list)
    evidenceRefs: list[str] = Field(default_factory=list)
    metadataOnly: Literal[True] = True
    rawPayloadRetained: Literal[False] = False


class WorkPacketLearnRefillHousekeepingV0View(BaseModel):
    status: Literal["not_applicable", "complete", "blocked", "running", "unknown"]
    summary: str
    evidenceRefs: list[str] = Field(default_factory=list)
    metadataOnly: Literal[True] = True


class WorkPacketLearnRefillSourceExhaustionV0View(BaseModel):
    exhausted: bool
    summary: str
    sourceRefs: list[str] = Field(default_factory=list)
    evidenceRefs: list[str] = Field(default_factory=list)
    metadataOnly: Literal[True] = True


class WorkPacketLearnRefillProjectionV0View(BaseModel):
    projectionId: str
    retentionClass: Literal["metadata_only"] = "metadata_only"
    followUpCandidates: list[WorkPacketLearnFollowUpCandidateV0View] = Field(default_factory=list)
    operatorOwnedExits: list[WorkPacketOperatorOwnedExitV0View] = Field(default_factory=list)
    refillSourceState: WorkPacketRefillSourceStateV0View
    housekeeping: WorkPacketLearnRefillHousekeepingV0View
    sourceExhaustion: WorkPacketLearnRefillSourceExhaustionV0View
    readyToTest: WorkPacketReadyToTestV0View | None = None
    nextSafeAction: str
    rawPayloadRetained: Literal[False] = False
    sourceMutationAllowed: Literal[False] = False
    providerCallsAllowed: Literal[False] = False
    workerLaunchAllowed: Literal[False] = False
    githubMutationAllowed: Literal[False] = False


class LlmWikiRebuildPreviewV0View(BaseModel):
    previewId: str
    operationMode: Literal["read_only"] = "read_only"
    inputRefs: list[str] = Field(default_factory=list)
    memoryProposalRefs: list[str] = Field(default_factory=list)
    plannedOutputScope: str
    derivedTargetFolder: str
    freshness: MemoryProposalFreshnessV0
    rebuildBasis: list[LlmWikiRebuildBasisV0] = Field(min_length=2)
    retentionClass: Literal["metadata_only"] = "metadata_only"
    stopLine: str
    auditEventSummary: str
    canonicalMutationAllowed: Literal[False] = False
    sourceMutationAllowed: Literal[False] = False
    providerCallsAllowed: Literal[False] = False
    workerLaunchAllowed: Literal[False] = False
    githubCallsAllowed: Literal[False] = False
    networkEgressAllowed: Literal[False] = False
    durableWriteAllowed: Literal[False] = False


class LlmWikiRebuildDryRunPlanV0View(BaseModel):
    planId: str
    operationMode: Literal["dry_run"] = "dry_run"
    inputRefs: list[str] = Field(default_factory=list)
    memoryProposalRefs: list[str] = Field(default_factory=list)
    plannedDerivedSections: list[str] = Field(default_factory=list)
    disposableTargetNamespace: str
    derivedTargetFolder: str
    freshness: MemoryProposalFreshnessV0
    rebuildBasis: list[LlmWikiRebuildBasisV0] = Field(min_length=2)
    retentionClass: Literal["metadata_only"] = "metadata_only"
    stopLines: list[str] = Field(default_factory=list)
    discardRecoveryPath: str
    auditEventSummary: str
    canonicalMutationAllowed: Literal[False] = False
    sourceMutationAllowed: Literal[False] = False
    providerCallsAllowed: Literal[False] = False
    workerLaunchAllowed: Literal[False] = False
    githubCallsAllowed: Literal[False] = False
    networkEgressAllowed: Literal[False] = False
    durableWriteAllowed: Literal[False] = False
    writePerformed: Literal[False] = False
    backupCreated: Literal[False] = False


class LlmWikiDerivedIndexReadinessV0View(BaseModel):
    statusId: str
    operationMode: Literal["read_only"] = "read_only"
    decisionState: Literal["ready", "blocked", "not_configured"]
    canonicality: Literal["derived_disposable_rebuildable"] = "derived_disposable_rebuildable"
    retentionClass: Literal["metadata_only"] = "metadata_only"
    sourceRefs: list[str] = Field(default_factory=list)
    evidenceRefs: list[str] = Field(default_factory=list)
    memoryProposalRefs: list[str] = Field(default_factory=list)
    allowedInputs: list[str] = Field(default_factory=list)
    blockedReasons: list[str] = Field(default_factory=list)
    nextActions: list[str] = Field(default_factory=list)
    boundarySummary: str
    rebuildPreview: LlmWikiRebuildPreviewV0View | None = None
    rebuildDryRunPlan: LlmWikiRebuildDryRunPlanV0View | None = None
    canonicalMutationAllowed: Literal[False] = False
    sourceMutationAllowed: Literal[False] = False
    providerCallsAllowed: Literal[False] = False
    durableWriteAllowed: Literal[False] = False


class AlphaMemorySourceStatusV0View(BaseModel):
    statusId: str
    authorityFamily: Literal["memory-writeback-and-source-mutation"] = "memory-writeback-and-source-mutation"
    operationMode: Literal["dry_run", "read_only", "draft_preview"] = "dry_run"
    decisionState: Literal["ready", "blocked", "not_configured"] = "not_configured"
    retentionClass: Literal["metadata_only"] = "metadata_only"
    sourceRefs: list[str] = Field(default_factory=list)
    targetMetadata: dict[str, object] = Field(default_factory=dict)
    backupPath: str
    rollbackPath: str
    auditEventSummary: str
    blockedReasons: list[str] = Field(default_factory=list)
    recoveryOptions: list[str] = Field(default_factory=list)
    evidenceRefs: list[str] = Field(default_factory=list)
    llmWikiReadiness: LlmWikiDerivedIndexReadinessV0View | None = None
    canonicalMutationAllowed: Literal[False] = False
    sourceMutationAllowed: Literal[False] = False
    providerCallsAllowed: Literal[False] = False
    workerLaunchAllowed: Literal[False] = False
    githubCallsAllowed: Literal[False] = False
    networkEgressAllowed: Literal[False] = False


class RecoveryActionV0View(BaseModel):
    actionId: str
    actionType: Literal[
        "retry_smaller",
        "reroute",
        "cancel_worker",
        "discard_result",
        "preserve_evidence",
        "reopen_human_gate",
        "mark_blocked",
        "reenter_capture",
        "send_back_to_shape",
        "send_back_to_research",
    ]
    label: str
    availability: Literal["available", "blocked", "stale", "complete"]
    consequence: str
    resultingStage: Literal[
        "capture",
        "classify",
        "route",
        "shape",
        "human_gate",
        "execute",
        "review",
        "promote",
        "deliver",
        "learn",
    ]
    resultingOwner: Literal[
        "kendall",
        "operator",
        "local_model",
        "hermes_worker_mock",
        "codex_worker",
        "claude_reviewer",
        "github",
        "memory_review",
        "blocked",
    ]
    evidenceRefs: list[str] = Field(default_factory=list)


class GateReplayRefStateV0View(BaseModel):
    refId: str
    refType: Literal["source", "evidence", "event"]
    state: Literal["allowed", "blocked", "missing", "excluded", "redacted", "unsupported", "metadata_only"]
    label: str
    blockingReason: str | None = None


class WorkPacketGateStateValidationV0View(BaseModel):
    status: Literal["matched", "blocked", "preview_only"]
    storedStage: str
    derivedStage: str | None = None
    storedOwner: str
    derivedOwner: str | None = None
    storedStatus: str
    derivedStatus: str | None = None
    eventCount: int
    latestEventType: str | None = None
    replayedEventTypes: list[str] = Field(default_factory=list)
    mismatchReasons: list[str] = Field(default_factory=list)
    blockedReasons: list[str] = Field(default_factory=list)
    refStates: list[GateReplayRefStateV0View] = Field(default_factory=list)
    readOnly: Literal[True] = True
    sourceMutationAllowed: Literal[False] = False
    providerCallsAllowed: Literal[False] = False
    workerLaunchAllowed: Literal[False] = False


AuthoritativePacketStage = Literal[
    "capture",
    "classify",
    "route",
    "shape",
    "needs_approval",
    "execute",
    "review",
    "promote",
    "deliver",
    "learn",
]


AuthoritativePacketStatus = Literal["active", "waiting", "blocked", "failed", "complete", "deferred"]
AuthoritativePacketTruthLabel = Literal["source_owned", "derived_projection", "operator_asserted"]


class AuthoritativePacketActorView(BaseModel):
    actorType: Literal["system", "operator", "manager", "worker"] = "system"
    actorId: str | None = Field(default=None, max_length=100)
    actorLabel: str | None = Field(default=None, max_length=120)

    @field_validator("actorId", "actorLabel")
    @classmethod
    def _actor_metadata_must_be_safe(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value or not _is_safe_local_proof_text(value):
            raise ValueError("Actor identifiers and labels must be safe metadata-only text.")
        return value


class AuthoritativePacketSourceRefView(BaseModel):
    refId: str = Field(min_length=1, max_length=255)
    sourceType: Literal["prd", "bmad_story", "operator_input", "workflow", "repo_doc"]
    pathOrUrl: str | None = Field(default=None, max_length=500)
    title: str | None = Field(default=None, max_length=255)
    contentSha256: str | None = Field(default=None, min_length=64, max_length=64, pattern=r"^[0-9a-fA-F]{64}$")

    @field_validator("refId")
    @classmethod
    def _source_ref_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("source ref id must not be blank")
        return value

    @field_validator("contentSha256")
    @classmethod
    def _normalize_content_digest(cls, value: str | None) -> str | None:
        return value.lower() if value is not None else None

    @field_validator("title")
    @classmethod
    def _source_title_must_be_safe_metadata(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("source ref title must not be blank")
        return _validate_authoritative_metadata_text(value, path="sourceRef.title")

    @model_serializer(mode="wrap")
    def _omit_unset_content_digest(self, handler):
        serialized = handler(self)
        if self.contentSha256 is None:
            serialized.pop("contentSha256", None)
        return serialized


class AuthoritativeWorkPacketCreateRequest(BaseModel):
    packetId: str | None = Field(default=None, max_length=80)
    title: str = Field(min_length=1, max_length=255)
    initialStage: AuthoritativePacketStage = "capture"
    status: AuthoritativePacketStatus = "waiting"
    truthLabel: AuthoritativePacketTruthLabel = "source_owned"
    sourceRef: AuthoritativePacketSourceRefView
    actor: AuthoritativePacketActorView = Field(default_factory=AuthoritativePacketActorView)
    idempotencyKey: str | None = Field(default=None, max_length=120)
    correlationId: str | None = Field(default=None, max_length=80)
    causationId: str | None = Field(default=None, max_length=80)
    parentPacketId: str | None = Field(default=None, max_length=80)
    lineageKind: Literal["root", "split", "rework", "remediation", "recombination", "delivery_failure"] = "root"
    readyToTest: "OperationalReadyToTestRequest | None" = None
    payloadSummary: str = Field(default="Metadata-only lifecycle creation.", min_length=1, max_length=500)
    evidenceRefs: list[str] = Field(default_factory=list, max_length=25)

    @field_validator("packetId", "title", "idempotencyKey", "correlationId", "causationId", "payloadSummary")
    @classmethod
    def _optional_text_must_not_be_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("value must not be blank")
        return stripped

    @field_validator("title")
    @classmethod
    def _packet_title_must_be_safe_metadata(cls, value: str) -> str:
        return _validate_authoritative_metadata_text(value, path="title")


class AuthoritativeWorkPacketTransitionRequest(BaseModel):
    targetStage: AuthoritativePacketStage
    expectedCurrentEventId: str = Field(min_length=1, max_length=80)
    status: AuthoritativePacketStatus = "active"
    truthLabel: AuthoritativePacketTruthLabel = "source_owned"
    actor: AuthoritativePacketActorView = Field(default_factory=AuthoritativePacketActorView)
    idempotencyKey: str | None = Field(default=None, max_length=120)
    correlationId: str | None = Field(default=None, max_length=80)
    causationId: str | None = Field(default=None, max_length=80)
    readyToTest: "OperationalReadyToTestRequest | None" = None
    payloadSummary: str = Field(default="Metadata-only lifecycle transition.", min_length=1, max_length=500)
    evidenceRefs: list[str] = Field(default_factory=list, max_length=25)

    @field_validator("expectedCurrentEventId", "idempotencyKey", "correlationId", "causationId", "payloadSummary")
    @classmethod
    def _optional_text_must_not_be_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("value must not be blank")
        return stripped


class AuthoritativeWorkPacketLifecycleEventView(BaseModel):
    eventId: str
    packetId: str
    schemaVersion: Literal[1] = 1
    eventType: Literal["packet.created", "packet.stage_transitioned", "packet.operational_action_applied"]
    previousStage: AuthoritativePacketStage | None = None
    targetStage: AuthoritativePacketStage
    status: AuthoritativePacketStatus
    truthLabel: AuthoritativePacketTruthLabel
    sourceRef: AuthoritativePacketSourceRefView
    actor: AuthoritativePacketActorView
    occurredAt: datetime
    correlationId: str | None = None
    causationId: str | None = None
    idempotencyKey: str | None = None
    payloadSummary: str
    evidenceRefs: list[str] = Field(default_factory=list)
    metadataOnly: Literal[True] = True


class AuthoritativeWorkPacketLifecycleView(BaseModel):
    packetId: str
    title: str
    currentStage: AuthoritativePacketStage
    status: AuthoritativePacketStatus
    truthLabel: AuthoritativePacketTruthLabel
    sourceRef: AuthoritativePacketSourceRefView
    createdAt: datetime
    updatedAt: datetime
    currentEventId: str
    parentPacketId: str | None = None
    lineageKind: str = "root"
    readyToTest: WorkPacketReadyToTestV0View | None = None
    operatorTestState: Literal["not_ready", "ready", "passed", "failed", "rework"] = "not_ready"
    operatorTestNote: str | None = None
    history: list[AuthoritativeWorkPacketLifecycleEventView] = Field(default_factory=list)
    metadataOnly: Literal[True] = True


OperationalActionId = Literal[
    "inspect",
    "refresh_projection",
    "mark_tested",
    "request_rework",
    "retry_verification",
    "requeue",
    "pause",
    "drain",
    "reassign",
    "reject",
]
OperationalGatedActionId = Literal["mark_tested", "request_rework", "requeue", "reject"]
OperationalActionTargetType = Literal["work_packet", "projection", "runtime", "worker", "manager_run"]
OperationalActionRiskTier = Literal["low", "medium", "high", "extreme"]
OperationalActionCapabilityState = Literal["available", "unavailable", "gated", "simulated"]
OperationalActionAuthorityState = Literal[
    "not_required",
    "allowed",
    "needs_product_approval",
    "needs_authority_approval",
    "needs_resource_approval",
    "needs_destination_approval",
    "needs_safety_approval",
    "blocked",
]
OperationalActionOutcome = Literal["succeeded", "rejected", "blocked", "failed", "simulated"]
OperationalActionTypedReason = Literal[
    "no_eligible_work",
    "blocked_by_policy",
    "blocked_by_approval",
    "blocked_by_resources",
    "runtime_unavailable",
    "worker_failed",
    "verification_failed",
    "delivery_blocked",
    "evidence_invalid",
    "projection_stale",
    "invalid_transition",
    "test_not_ready",
    "authenticated_session_required",
    "unsupported_action",
    "unknown",
]


class OperationalReadyToTestRequest(BaseModel):
    readyId: str = Field(min_length=1, max_length=160)
    userFacingSummary: str = Field(min_length=1, max_length=500)
    testableSurface: str = Field(min_length=1, max_length=500)
    verificationRefs: list[str] = Field(default_factory=list, max_length=24)
    evidenceRefs: list[str] = Field(min_length=1, max_length=24)

    @field_validator("readyId", "userFacingSummary", "testableSurface")
    @classmethod
    def safe_text(cls, value: str) -> str:
        value = value.strip()
        if not value or not _is_safe_pipeline_control_text(value):
            raise ValueError("Ready-to-test metadata must be safe, bounded text.")
        return value

    @field_validator("verificationRefs", "evidenceRefs")
    @classmethod
    def safe_refs(cls, refs: list[str]) -> list[str]:
        normalized = []
        for ref in refs:
            if not isinstance(ref, str) or not _is_safe_pipeline_evidence_ref(ref):
                raise ValueError("Operational evidence refs must be safe metadata refs.")
            if ref not in normalized:
                normalized.append(ref)
        return normalized


class OperationalActionRequest(BaseModel):
    schemaVersion: Literal["pipeline-operational-action/v0"] = "pipeline-operational-action/v0"
    actionId: OperationalActionId
    targetType: OperationalActionTargetType = "work_packet"
    targetId: str = Field(min_length=1, max_length=120)
    idempotencyKey: str = Field(min_length=1, max_length=160)
    correlationId: str = Field(min_length=1, max_length=120)
    requestedBy: AuthoritativePacketActorView
    requestedAuthorityState: OperationalActionAuthorityState
    requestedRiskTier: OperationalActionRiskTier
    approvalId: str | None = Field(default=None, max_length=120)
    expectedCurrentEventId: str | None = Field(default=None, max_length=80)
    operatorIntentSummary: str | None = Field(default=None, max_length=500)
    evidenceRefs: list[str] = Field(min_length=1, max_length=24)
    testResult: Literal["pass", "fail", "notes"] | None = None
    testNotes: str | None = Field(default=None, max_length=1000)
    metadataOnly: Literal[True] = True
    rawPayloadRetained: Literal[False] = False

    @field_validator("targetId", "idempotencyKey", "correlationId", "approvalId", "expectedCurrentEventId", "operatorIntentSummary", "testNotes")
    @classmethod
    def bounded_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Operational action metadata must not be blank.")
        if not _is_safe_pipeline_control_text(value):
            raise ValueError("Operational action metadata must be safe metadata text.")
        return value

    @field_validator("evidenceRefs")
    @classmethod
    def action_refs_are_safe(cls, refs: list[str]) -> list[str]:
        normalized = []
        for ref in refs:
            if not isinstance(ref, str) or not _is_safe_pipeline_evidence_ref(ref):
                raise ValueError("Operational action evidence refs must be safe metadata refs.")
            if ref not in normalized:
                normalized.append(ref)
        return normalized


class OperationalActionApprovalRequest(BaseModel):
    actionId: OperationalGatedActionId
    targetType: Literal["work_packet"] = "work_packet"
    targetId: str = Field(min_length=1, max_length=120)
    requestedBy: AuthoritativePacketActorView
    requestedAuthorityState: Literal["needs_product_approval", "needs_authority_approval"]
    requestedRiskTier: Literal["medium"]
    metadataOnly: Literal[True] = True
    rawPayloadRetained: Literal[False] = False

    @field_validator("targetId")
    @classmethod
    def approval_target_must_be_bounded(cls, value: str) -> str:
        value = value.strip()
        if not value or not _is_safe_pipeline_control_text(value):
            raise ValueError("Operational approval target must be safe metadata text.")
        return value


class OperationalActionApprovalView(BaseModel):
    approvalId: str
    actionId: OperationalGatedActionId
    targetType: Literal["work_packet"]
    targetId: str
    requestedBy: AuthoritativePacketActorView
    requestedAuthorityState: Literal["needs_product_approval", "needs_authority_approval"]
    requestedRiskTier: Literal["medium"]
    expectedCurrentEventId: str
    issuedAt: datetime
    expiresAt: datetime
    consumed: bool = False
    consumedAt: datetime | None = None
    consumedActionIdempotencyKey: str | None = None
    consumedActionRecordId: str | None = None
    metadataOnly: Literal[True] = True
    rawPayloadRetained: Literal[False] = False


class OperationalActionCapabilityView(BaseModel):
    actionId: OperationalActionId
    targetType: OperationalActionTargetType
    targetId: str | None = None
    capabilityState: OperationalActionCapabilityState
    authorityState: OperationalActionAuthorityState
    riskTier: OperationalActionRiskTier
    typedReason: OperationalActionTypedReason | None = None
    expectedResultSummary: str
    correlationRequired: Literal[True] = True
    idempotencyRequired: Literal[True] = True
    evidenceRefs: list[str] = Field(default_factory=list)
    metadataOnly: Literal[True] = True
    rawPayloadRetained: Literal[False] = False


class OperationalActionResultView(BaseModel):
    schemaVersion: Literal["pipeline-operational-action/v0"] = "pipeline-operational-action/v0"
    actionId: OperationalActionId
    targetType: OperationalActionTargetType
    targetId: str
    outcome: OperationalActionOutcome
    resultingStage: AuthoritativePacketStage | Literal["terminal", "deferred", "unknown"]
    resultingStatus: AuthoritativePacketStatus | Literal["unknown"]
    capabilityState: OperationalActionCapabilityState
    authorityState: OperationalActionAuthorityState
    riskTier: OperationalActionRiskTier
    typedReason: OperationalActionTypedReason | None = None
    evidenceRefs: list[str] = Field(default_factory=list)
    correlationId: str
    idempotencyKey: str
    actionRecordId: str
    approvalId: str | None = None
    childPacketId: str | None = None
    metadataOnly: Literal[True] = True
    rawPayloadRetained: Literal[False] = False


class PipelineRuntimeReadinessV0View(BaseModel):
    schemaVersion: Literal["pipeline-operational-runtime-readiness/v0"] = "pipeline-operational-runtime-readiness/v0"
    actionSchemaVersion: Literal["pipeline-operational-action/v0"] = "pipeline-operational-action/v0"
    readinessState: Literal["ready", "degraded", "blocked", "unavailable", "unknown"]
    operationalMode: Literal["disabled", "local_proof", "read_only", "bounded_write", "unavailable", "unknown"]
    freshnessState: Literal["live", "stale", "unavailable", "unknown"]
    capabilityState: OperationalActionCapabilityState
    typedReason: OperationalActionTypedReason | None = None
    checkedAt: datetime
    expiresAt: datetime
    summary: str
    actionCapabilities: list[OperationalActionCapabilityView] = Field(default_factory=list)
    evidenceRefs: list[str] = Field(default_factory=list)
    metadataOnly: Literal[True] = True
    rawPayloadRetained: Literal[False] = False


AuthoritativeWorkPacketCreateRequest.model_rebuild()
AuthoritativeWorkPacketTransitionRequest.model_rebuild()


PipelineProjectionSourceLabelV0 = Literal["live", "stale", "fixture", "simulated", "dry_run", "unavailable", "unknown"]
PipelineProjectionFreshnessStateV0 = Literal["live", "stale", "unavailable", "unknown"]
PipelinePacketUnblockerV0 = Literal["operator", "manager", "worker", "source", "system", "unknown"]
PipelineProjectionEmptyReasonV0 = Literal[
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
]


class PipelineBackendReachabilityV0View(BaseModel):
    state: Literal["reachable", "unavailable", "unknown"]
    checkedAt: datetime
    reason: PipelineProjectionEmptyReasonV0 | None = None
    summary: str


class PipelineFixtureModeV0View(BaseModel):
    enabled: bool
    reason: str | None = None
    allowedForEnvironment: bool
    visibleLabelRequired: Literal[True] = True
    canSatisfyLiveProof: Literal[False] = False


class PipelineTruthSummaryV0View(BaseModel):
    label: PipelineProjectionSourceLabelV0
    emptyReason: PipelineProjectionEmptyReasonV0 | None = None
    backendEmpty: bool
    backendUnavailable: bool
    fixtureBacked: bool
    stale: bool
    summary: str


class PipelineStageSummaryV0View(BaseModel):
    stage: AuthoritativePacketStage
    label: str
    packetCount: int
    sourceLabel: PipelineProjectionSourceLabelV0
    freshnessState: PipelineProjectionFreshnessStateV0
    emptyReason: PipelineProjectionEmptyReasonV0 | None = None


PipelineSourceStateValueV0 = Literal["healthy", "exhausted", "blocked", "gated", "stale", "unavailable", "refilling", "unknown"]
PipelineSourceKindV0 = Literal[
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
]


class PipelineSourceStateV0View(BaseModel):
    sourceId: str
    sourceRef: str
    sourceKind: PipelineSourceKindV0
    state: PipelineSourceStateValueV0
    summary: str
    evidenceRefs: list[str] = Field(default_factory=list)
    updatedAt: datetime
    metadataOnly: Literal[True] = True


class PipelineQueueLeaseV0View(BaseModel):
    leaseId: str
    workItemId: str
    attemptCount: int
    heartbeatAt: datetime
    leaseExpiresAt: datetime
    fencingToken: int
    active: bool
    state: Literal["active", "expired", "inactive"]
    metadataOnly: Literal[True] = True


class PipelineExecutionAttemptLineageV0View(BaseModel):
    attemptId: str
    workItemId: str
    leaseId: str | None = None
    fencingToken: int | None = None
    routeDecisionId: str
    workerId: str
    lane: str
    status: str
    eventRefs: list[str] = Field(default_factory=list)
    evidenceRefs: list[str] = Field(default_factory=list)
    metadataOnly: Literal[True] = True


class PipelineDashboardWorkPacketV0View(BaseModel):
    packetId: str
    title: str
    currentStage: AuthoritativePacketStage
    status: AuthoritativePacketStatus
    truthLabel: PipelineProjectionSourceLabelV0
    sourceRef: AuthoritativePacketSourceRefView | None = None
    blocker: str | None = None
    nextAction: str | None = None
    unblocker: PipelinePacketUnblockerV0 = "unknown"
    readyToTest: WorkPacketReadyToTestV0View | None = None
    evidenceRefs: list[str] = Field(default_factory=list)
    workItemId: str | None = None
    queueLease: PipelineQueueLeaseV0View | None = None
    executionAttempts: list[PipelineExecutionAttemptLineageV0View] = Field(default_factory=list)
    correlationIds: list[str] = Field(default_factory=list)
    updatedAt: datetime
    metadataOnly: Literal[True] = True

    @model_serializer(mode="wrap")
    def _omit_unset_legacy_lineage(self, handler):
        serialized = handler(self)
        if self.workItemId is None:
            for field_name in ("workItemId", "queueLease", "executionAttempts", "correlationIds"):
                serialized.pop(field_name, None)
        return serialized


class PipelineSelectedPacketDetailV0View(BaseModel):
    packetId: str
    sourceRefs: list[AuthoritativePacketSourceRefView] = Field(default_factory=list)
    evidenceRefs: list[str] = Field(default_factory=list)
    currentStage: AuthoritativePacketStage
    status: AuthoritativePacketStatus
    truthLabel: PipelineProjectionSourceLabelV0
    blocker: str | None = None
    nextAction: str | None = None
    unblocker: PipelinePacketUnblockerV0 = "unknown"
    readyToTest: WorkPacketReadyToTestV0View | None = None
    latestTransitionEventRef: str | None = None
    recentTransitionEventRefs: list[str] = Field(default_factory=list)
    latestMovementSummary: str | None = None
    canSatisfyLiveMovementProof: bool = False
    parentPacketId: str | None = None
    lineageKind: str = "root"
    operatorTestState: Literal["not_ready", "ready", "passed", "failed", "rework"] = "not_ready"
    operatorTestNote: str | None = None
    actionCapabilities: list[OperationalActionCapabilityView] = Field(default_factory=list)
    actionResults: list[OperationalActionResultView] = Field(default_factory=list)
    workItemId: str | None = None
    queueLease: PipelineQueueLeaseV0View | None = None
    executionAttempts: list[PipelineExecutionAttemptLineageV0View] = Field(default_factory=list)
    correlationIds: list[str] = Field(default_factory=list)
    metadataOnly: Literal[True] = True

    @model_serializer(mode="wrap")
    def _omit_unset_legacy_lineage(self, handler):
        serialized = handler(self)
        if self.workItemId is None:
            for field_name in ("workItemId", "queueLease", "executionAttempts", "correlationIds"):
                serialized.pop(field_name, None)
        return serialized


class PipelineManagerSummaryV0View(BaseModel):
    stateSource: Literal["supervisor_projection", "manager_summary", "unavailable", "unknown"]
    reliabilityState: Literal[
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
    ] = "unknown"
    freshnessState: PipelineProjectionFreshnessStateV0
    activeLeaseCount: int | None = None
    activeWorkerCount: int | None = None
    warmWorkerCount: int | None = None
    blockedQueueCount: int | None = None
    dispatchableQueueCount: int | None = None
    closedQueueCount: int | None = None
    healthySourceCount: int | None = None
    exhaustedSourceCount: int | None = None
    blockedSourceCount: int | None = None
    gatedSourceCount: int | None = None
    staleSourceCount: int | None = None
    unavailableSourceCount: int | None = None
    refillingSourceCount: int | None = None
    unknownSourceCount: int | None = None
    sourceExhausted: bool
    inactivityReason: PipelineProjectionEmptyReasonV0 | None = None
    evidenceRefs: list[str] = Field(default_factory=list)
    summary: str
    metadataOnly: Literal[True] = True


class PipelineQueueSummaryV0View(BaseModel):
    activeCount: int | None = None
    dispatchableCount: int | None = None
    blockedCount: int | None = None
    gatedCount: int | None = None
    closedCount: int | None = None
    staleCount: int | None = None
    refillingCount: int | None = None
    unknownCount: int | None = None
    emptyReason: PipelineProjectionEmptyReasonV0 | None = None
    sourceExhausted: bool
    summary: str


class PipelineWorkerSummaryV0View(BaseModel):
    stateSource: Literal["supervisor_projection", "manager_summary", "unavailable", "unknown"]
    freshnessState: PipelineProjectionFreshnessStateV0
    warmCount: int | None = None
    activeCount: int | None = None
    waitingCount: int | None = None
    stalledCount: int | None = None
    failedCount: int | None = None
    drainingCount: int | None = None
    killedCount: int | None = None
    completeCount: int | None = None
    unavailableCount: int | None = None
    unknownCount: int | None = None
    workerRefs: list[str] = Field(default_factory=list)
    evidenceRefs: list[str] = Field(default_factory=list)
    summary: str
    metadataOnly: Literal[True] = True


class PipelineReliabilityProblemV0View(BaseModel):
    problemId: str
    kind: Literal[
        "idle_with_ready_work",
        "stalled_worker",
        "stale_projection",
        "backend_unavailable",
        "source_blocked",
        "approval_required",
        "usage_limited",
        "resource_limited",
        "unknown",
    ]
    severity: Literal["info", "attention", "blocked"]
    likelyIssue: Literal["manager", "worker", "source", "approval", "usage", "resource", "unknown"]
    summary: str
    evidenceRefs: list[str] = Field(default_factory=list)
    metadataOnly: Literal[True] = True

    @field_validator("evidenceRefs")
    @classmethod
    def evidence_refs_are_safe(cls, refs: list[str]) -> list[str]:
        if not all(_is_safe_pipeline_evidence_ref(ref) for ref in refs):
            raise ValueError("Reliability problem evidence refs must be safe metadata refs.")
        return refs


class PipelineGatedControlV0View(BaseModel):
    controlId: str
    operation: Literal[
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
    ]
    status: Literal["gated", "action_needed", "blocked"]
    authorityFamily: str
    stopLine: str
    nextAction: str
    packetId: str | None = None
    workerRefs: list[str] = Field(default_factory=list)
    evidenceRefs: list[str] = Field(default_factory=list)
    metadataOnly: Literal[True] = True

    @field_validator("controlId")
    @classmethod
    def control_id_is_safe(cls, value: str) -> str:
        if not _is_safe_pipeline_evidence_ref(value):
            raise ValueError("Gated control id must be a safe metadata ref.")
        return value

    @field_validator("packetId")
    @classmethod
    def packet_id_is_safe(cls, value: str | None) -> str | None:
        if value is not None and not _is_safe_pipeline_evidence_ref(value):
            raise ValueError("Gated control packet id must be a safe metadata ref.")
        return value

    @field_validator("authorityFamily", "stopLine", "nextAction")
    @classmethod
    def text_is_safe(cls, value: str) -> str:
        if not _is_safe_pipeline_control_text(value):
            raise ValueError("Gated control text must be safe metadata text.")
        return value

    @field_validator("workerRefs")
    @classmethod
    def worker_refs_are_safe(cls, refs: list[str]) -> list[str]:
        if not all(ref.startswith("worker:") and _is_safe_pipeline_evidence_ref(ref) for ref in refs):
            raise ValueError("Gated control worker refs must be safe worker metadata refs.")
        return refs

    @field_validator("evidenceRefs")
    @classmethod
    def gated_control_evidence_refs_are_safe(cls, refs: list[str]) -> list[str]:
        if not all(_is_safe_pipeline_evidence_ref(ref) for ref in refs):
            raise ValueError("Gated control evidence refs must be safe metadata refs.")
        return refs


class PipelineDashboardProjectionV0View(BaseModel):
    schemaVersion: Literal["pipeline-dashboard-projection/v0"] = "pipeline-dashboard-projection/v0"
    projectionId: str
    generatedAt: datetime
    sourceUpdatedAt: datetime
    sourceLabel: PipelineProjectionSourceLabelV0
    freshnessState: PipelineProjectionFreshnessStateV0
    staleAfterSeconds: int
    backendReachability: PipelineBackendReachabilityV0View
    fixtureMode: PipelineFixtureModeV0View
    truthSummary: PipelineTruthSummaryV0View
    stageSummaries: list[PipelineStageSummaryV0View] = Field(default_factory=list)
    sourceStates: list[PipelineSourceStateV0View] = Field(default_factory=list)
    workPackets: list[PipelineDashboardWorkPacketV0View] = Field(default_factory=list)
    selectedPacketDetails: list[PipelineSelectedPacketDetailV0View] = Field(default_factory=list)
    managerSummary: PipelineManagerSummaryV0View
    workerSummary: PipelineWorkerSummaryV0View
    reliabilityProblems: list[PipelineReliabilityProblemV0View] = Field(default_factory=list)
    gatedControls: list[PipelineGatedControlV0View] = Field(default_factory=list)
    runtimeReadiness: PipelineRuntimeReadinessV0View
    actionCapabilities: list[OperationalActionCapabilityView] = Field(default_factory=list)
    queueSummary: PipelineQueueSummaryV0View
    evidenceRefs: list[str] = Field(default_factory=list)


class WorkPacketRouteSummaryV0View(BaseModel):
    recommendation: str
    confidenceScore: float | None = None
    confidenceBand: str | None = None
    reasonCodes: list[str] = Field(default_factory=list)


class WorkPacketReviewSummaryV0View(BaseModel):
    reviewer: Literal[
        "kendall",
        "operator",
        "local_model",
        "hermes_worker_mock",
        "codex_worker",
        "claude_reviewer",
        "github",
        "memory_review",
        "blocked",
    ]
    status: Literal["not_applicable", "pending", "blocked", "complete", "skipped"]
    summary: str
    evidenceRefs: list[str] = Field(default_factory=list)
    artifactRefs: list[str] = Field(default_factory=list)


class WorkPacketDeliveryEvidenceV0View(BaseModel):
    evidenceId: str
    mode: Literal["metadata_only"] = "metadata_only"
    actionId: Literal["pr", "merge", "cleanup"] | None = None
    status: str
    targetBranch: str | None = None
    baseBranch: str | None = None
    pullRequestUrl: str | None = None
    expectedHeadRevision: str | None = None
    pullRequestHeadRevision: str | None = None
    ciStatus: str | None = None
    reviewState: str | None = None
    mergeStatus: str | None = None
    mergeResult: str | None = None
    cleanupDryRunStatus: str | None = None
    cleanupTarget: str | None = None
    mergeGate: "WorkPacketDeliveryMergeGateV0View | None" = None
    cleanupDryRunGate: "WorkPacketCleanupDryRunGateV0View | None" = None
    readyForApproval: bool = False
    hasDeliveryExecutionEvidence: bool = False
    evidenceRefs: list[str] = Field(default_factory=list)
    artifactRefs: list[str] = Field(default_factory=list)
    retainedEvidence: list[str] = Field(default_factory=list)
    blockedReasons: list[str] = Field(default_factory=list)
    recoveryPath: str
    deliveryRailsGrantAuthority: Literal[False] = False
    rawPayloadRetained: Literal[False] = False
    remoteMutationApproved: Literal[False] = False
    mergeApproved: Literal[False] = False
    cleanupApproved: Literal[False] = False


class WorkPacketDeliveryGateCriterionV0View(BaseModel):
    criterionId: str
    label: str
    status: Literal["passed", "blocked"]
    evidence: list[str] = Field(default_factory=list)
    blockedReason: str | None = None


class WorkPacketDeliveryMergeGateV0View(BaseModel):
    status: Literal["passed", "blocked"]
    lowRiskReady: bool
    criteria: list[WorkPacketDeliveryGateCriterionV0View] = Field(default_factory=list)
    blockedReasons: list[str] = Field(default_factory=list)
    recoveryPath: str
    metadataOnly: Literal[True] = True
    mergeApproved: Literal[False] = False


class WorkPacketCleanupDryRunGateV0View(BaseModel):
    status: Literal["passed", "blocked"]
    dryRunMatchesPolicy: bool
    expectedPr: str | None = None
    expectedOwner: str | None = None
    expectedWorktree: str | None = None
    expectedLocalBranch: str | None = None
    expectedRemoteBranch: str | None = None
    expectedHeadRevision: str | None = None
    blockedReasons: list[str] = Field(default_factory=list)
    recoveryPath: str
    metadataOnly: Literal[True] = True
    cleanupApproved: Literal[False] = False


class WorkPacketExecutionAttemptSummaryV0View(BaseModel):
    attemptId: str
    workItemId: str
    leaseId: str | None = None
    fencingToken: int | None = None
    routeDecisionId: str
    workerId: str
    lane: str
    authorityMode: str
    status: ExecutionAttemptStatus
    requestedById: str | None = None
    requestedByLabel: str | None = None
    createdAt: datetime
    updatedAt: datetime
    startedAt: datetime | None = None
    completedAt: datetime | None = None
    heartbeatAt: datetime | None = None
    timeoutAt: datetime | None = None
    cancelRequestedAt: datetime | None = None
    cancelReason: str | None = None
    rejectionReason: str | None = None
    failureReason: str | None = None
    evidenceRefs: list[str] = Field(default_factory=list)
    artifactRefs: list[str] = Field(default_factory=list)

class WorkPacketStageTransitionEventV0View(BaseModel):
    eventId: str
    eventType: str
    summary: str
    createdAt: datetime
    sourceStage: Literal["capture", "classify", "route", "shape", "human_gate", "execute", "review", "promote", "deliver", "learn"] | None = None
    targetStage: Literal["capture", "classify", "route", "shape", "human_gate", "execute", "review", "promote", "deliver", "learn"]
    sourceOwner: Literal[
        "kendall",
        "operator",
        "local_model",
        "hermes_worker_mock",
        "codex_worker",
        "claude_reviewer",
        "github",
        "memory_review",
        "blocked",
    ] | None = None
    targetOwner: Literal[
        "kendall",
        "operator",
        "local_model",
        "hermes_worker_mock",
        "codex_worker",
        "claude_reviewer",
        "github",
        "memory_review",
        "blocked",
    ]
    sourceStatus: Literal["active", "waiting", "blocked", "failed", "complete", "deferred"] | None = None
    targetStatus: Literal["active", "waiting", "blocked", "failed", "complete", "deferred"]
    reasonCodes: list[str] = Field(default_factory=list)
    evidenceRefs: list[str] = Field(default_factory=list)
    durable: bool
    sourceEventId: str | None = None
    actorLabel: str | None = None


class WorkPacketLifecycleStateV0View(BaseModel):
    source: Literal[
        "candidate_work",
        "work_item",
        "execution_attempt",
        "workflow_event",
        "memory_proposal",
        "delivery_evidence",
        "source_missing",
    ]
    stage: Literal["capture", "classify", "route", "shape", "human_gate", "execute", "review", "promote", "deliver", "learn"]
    owner: Literal[
        "kendall",
        "operator",
        "local_model",
        "hermes_worker_mock",
        "codex_worker",
        "claude_reviewer",
        "github",
        "memory_review",
        "blocked",
    ]
    status: Literal["active", "waiting", "blocked", "failed", "complete", "deferred"]
    reasonCodes: list[str] = Field(default_factory=list)
    authoritativeRef: str
    derivedFromRefs: list[str] = Field(default_factory=list)
    transitionEventRefs: list[str] = Field(default_factory=list)
    latestTransitionEventRef: str | None = None
    attemptRef: str | None = None
    metadataOnly: Literal[True] = True
    sourceMutationAllowed: Literal[False] = False
    providerCallsAllowed: Literal[False] = False
    workerLaunchAllowed: Literal[False] = False
    githubMutationAllowed: Literal[False] = False
    cleanupAllowed: Literal[False] = False


class WorkPacketLoopStopStateV0View(BaseModel):
    stopStateId: str
    kind: Literal[
        "limit_window",
        "operator_approval",
        "review_thread",
        "failed_check",
        "setup_churn",
        "token_window",
        "resource_pressure",
        "tool_churn",
        "unsafe_cleanup",
        "scope_boundary",
        "owner_conflict",
        "operator_owned",
    ]
    label: str
    phase: str
    severity: Literal["info", "warning", "blocking"]
    summary: str
    stopLine: str
    nextSafeAction: str
    evidenceRefs: list[str] = Field(default_factory=list)
    metadataOnly: Literal[True] = True
    sourceMutationAllowed: Literal[False] = False
    providerCallsAllowed: Literal[False] = False
    workerLaunchAllowed: Literal[False] = False
    githubMutationAllowed: Literal[False] = False
    cleanupAllowed: Literal[False] = False


class WorkPacketV0View(BaseModel):
    packetId: str
    title: str
    requestedOutcome: str
    currentStage: Literal["capture", "classify", "route", "shape", "human_gate", "execute", "review", "promote", "deliver", "learn"]
    currentOwner: Literal[
        "kendall",
        "operator",
        "local_model",
        "hermes_worker_mock",
        "codex_worker",
        "claude_reviewer",
        "github",
        "memory_review",
        "blocked",
    ]
    status: Literal["active", "waiting", "blocked", "failed", "complete", "deferred"]
    lifecycleState: WorkPacketLifecycleStateV0View
    riskLevel: RiskLevel
    priority: CandidateWorkPriority
    candidateWork: CandidateWorkView | None = None
    workItem: "WorkItemView | None" = None
    taskPacket: TaskPacketV0View | None = None
    routingPreview: RoutingPreviewView | None = None
    routeSummary: WorkPacketRouteSummaryV0View | None = None
    executionAttempts: list[WorkPacketExecutionAttemptSummaryV0View] = Field(default_factory=list)
    transitionEvents: list[WorkPacketStageTransitionEventV0View] = Field(default_factory=list)
    sourceRefs: list[SourceRefV0View] = Field(default_factory=list)
    evidenceRefs: list[EvidenceRefV0View] = Field(default_factory=list)
    artifactRefs: list[ArtifactRefV0View] = Field(default_factory=list)
    humanGateActions: list[HumanGateActionV0View] = Field(default_factory=list)
    humanGateActionRequests: list[HumanGateActionRequestV0View] = Field(default_factory=list)
    laneCards: list[WorkPacketLaneCardV0View] = Field(default_factory=list)
    memoryProposals: list[MemoryProposalV0View] = Field(default_factory=list)
    deliveryEvidence: WorkPacketDeliveryEvidenceV0View | None = None
    learnOutcome: WorkPacketLearnOutcomeV0View | None = None
    learnRefill: WorkPacketLearnRefillProjectionV0View | None = None
    alphaMemorySourceStatus: AlphaMemorySourceStatusV0View | None = None
    gateStateValidation: WorkPacketGateStateValidationV0View | None = None
    loopStopStates: list[WorkPacketLoopStopStateV0View] = Field(default_factory=list)
    reviewSummaries: list[WorkPacketReviewSummaryV0View] = Field(default_factory=list)
    recoveryActions: list[RecoveryActionV0View] = Field(default_factory=list)


class SubscriptionHandoffEvidenceView(BaseModel):
    eventType: str
    summary: str
    createdAt: datetime


class SubscriptionHandoffPackageView(BaseModel):
    packageId: str
    workItemId: str
    title: str
    requestedOutcome: str
    taskKind: str
    stepId: str
    createdAt: datetime
    route: RoutingDecisionView
    summary: str
    context: list[str]
    constraints: list[str]
    allowedPaths: list[str]
    validationCommands: list[str]
    recentEvidence: list[SubscriptionHandoffEvidenceView]
    operatorInstructions: list[str]
    launchAllowed: bool = False


class PremiumApprovalEvidenceView(BaseModel):
    eventType: str
    summary: str
    createdAt: datetime


class PremiumApprovalRequestView(BaseModel):
    approvalRequestId: str
    workItemId: str
    title: str
    requestedOutcome: str
    taskKind: str
    stepId: str
    createdAt: datetime
    requestedLane: str
    route: RoutingDecisionView
    justification: list[str]
    requiredEvidence: list[str]
    approvalChecklist: list[str]
    riskControls: list[str]
    recentEvidence: list[PremiumApprovalEvidenceView]
    approvalReason: str | None = None
    executionAllowed: bool = False


class SubscriptionAgentLaunchStubView(BaseModel):
    launchStubId: str
    workItemId: str
    title: str
    requestedOutcome: str
    taskKind: str
    stepId: str
    createdAt: datetime
    workerId: str
    requestedAgent: str
    route: RoutingDecisionView
    estimate: dict[str, str]
    launchInstructions: list[str]
    requiredApprovals: list[str]
    disabledReason: str
    targetRegistry: list[dict[str, Any]] = Field(default_factory=list)
    approvalBinding: dict[str, Any] = Field(default_factory=dict)
    workspaceContract: dict[str, Any] = Field(default_factory=dict)
    outputContract: dict[str, Any] = Field(default_factory=dict)
    lifecycleEvidence: dict[str, Any] = Field(default_factory=dict)
    readinessEvidence: dict[str, Any] = Field(default_factory=dict)
    processLaunchAllowed: bool = False
    executionAllowed: bool = False


class SubscriptionAgentLaunchRequestView(BaseModel):
    launchRequestId: str
    workItemId: str
    status: str
    readinessStatus: str
    approvalAccepted: bool = False
    processLaunchAllowed: bool = False
    executionAllowed: bool = False
    commandExecutionAllowed: bool = False
    sourceMutationAllowed: bool = False
    providerCallsAllowed: bool = False
    networkAllowed: bool = False
    credentialAccessAllowed: bool = False
    processLaunchAttempted: bool = False
    shellExecutionAttempted: bool = False
    credentialAccessAttempted: bool = False
    externalSendAttempted: bool = False
    missingEnvelopeFields: list[str] = Field(default_factory=list)
    rejectedEnvelopeFields: dict[str, Any] = Field(default_factory=dict)
    staleEnvelopeFields: list[str] = Field(default_factory=list)
    blockedReasonIds: list[str] = Field(default_factory=list)
    nextSafeAction: str
    approvalBinding: dict[str, Any] = Field(default_factory=dict)
    workspaceContract: dict[str, Any] = Field(default_factory=dict)
    outputArtifactSummary: dict[str, Any] = Field(default_factory=dict)
    lifecycleEvidence: dict[str, Any] = Field(default_factory=dict)
    safetyFlags: dict[str, bool] = Field(default_factory=dict)
    mutationContract: dict[str, Any] = Field(default_factory=dict)
    runtimeEvidence: dict[str, Any] = Field(default_factory=dict)


class LocalEvidencePacketItemView(BaseModel):
    eventType: str
    summary: str
    createdAt: datetime


class LocalEvidencePacketView(BaseModel):
    packetId: str
    workItemId: str
    title: str
    requestedOutcome: str
    taskKind: str
    stepId: str
    createdAt: datetime
    route: RoutingDecisionView
    summary: str
    evidence: list[LocalEvidencePacketItemView]
    boundaries: list[str]
    allowedPaths: list[str]
    validationCommands: list[str]
    redactionNotes: list[str]
    writesAllowed: bool = False
    commandsAllowed: bool = False


class LocalReadonlyWorkerPreviewView(BaseModel):
    workerId: str
    runId: str
    packetId: str
    workItemId: str
    status: str
    summary: str
    recommendations: list[str]
    packet: LocalEvidencePacketView
    writesAllowed: bool = False
    commandsAllowed: bool = False

class LocalEvidenceItemView(BaseModel):
    eventType: str
    summary: str
    createdAt: datetime


class LocalProviderAttemptMetadataView(BaseModel):
    status: str
    modelId: str
    endpointFamily: str
    approvalId: str | None = None
    approvalStatus: str | None = None
    rejectionReason: str | None = None
    rejectionReasons: list[str] = Field(default_factory=list)
    finishReason: str | None = None
    promptSummary: str
    responseSummary: str
    responseCharacterCount: int
    reasoningCharacterCount: int = 0
    promptCharacterCount: int
    completionTokens: int | None = None
    promptTokens: int | None = None
    totalTokens: int | None = None
    redactionApplied: bool = True
    rawPayloadRetained: bool = False
    timeoutState: str
    cancellationState: str


class LocalEvidenceExplanationView(BaseModel):
    explanationId: str
    workItemId: str
    title: str
    requestedOutcome: str
    taskKind: str
    stepId: str
    createdAt: datetime
    route: RoutingDecisionView
    summary: str
    evidence: list[LocalEvidenceItemView]
    boundaries: list[str]
    nextStepSuggestions: list[str]
    providerAttempt: LocalProviderAttemptMetadataView | None = None
    writesAllowed: bool = False
    commandsAllowed: bool = False


class RoutingLaneEvidenceProfileView(BaseModel):
    lane: str
    decisionCount: int
    previewCount: int
    guardedExecutionCount: int
    handoffPackageCount: int
    premiumApprovalRequestCount: int
    localExplanationCount: int
    outcomeCount: int
    recentReasonCodes: list[str]
    latestEventAt: datetime | None = None



class WorkerRegistryEntryView(BaseModel):
    workerId: str
    displayName: str
    lane: str
    adapterType: str
    capabilities: list[str]
    permissions: list[str]
    health: str
    queueDepth: int
    maxParallelJobs: int
    disabledReason: str | None = None


class ExecutionConfigurationCheckView(BaseModel):
    checkId: str
    label: str
    status: str
    enabled: bool
    disabledReason: str | None = None
    affectedWorkers: list[str] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)
    launchTargets: list[dict[str, Any]] = Field(default_factory=list)
    processLaunchAllowed: bool = False
    providerCallsAllowed: bool = False
    modelCallsAllowed: bool = False
    premiumExecutionAllowed: bool = False
    commandExecutionAllowed: bool = False
    sourceMutationAllowed: bool = False
    networkAllowed: bool = False
    credentialAccessAllowed: bool = False


class ExecutionConfigurationChecksView(BaseModel):
    summary: str
    allDisabled: bool
    generatedAt: datetime
    checks: list[ExecutionConfigurationCheckView]


class ProviderEnablementPolicyStepView(BaseModel):
    stepId: str
    label: str
    status: str
    summary: str
    requiredEvidence: list[str] = Field(default_factory=list)


class ExecutionReadinessAttemptSummaryView(BaseModel):
    attemptId: str
    workItemId: str
    status: str
    workerId: str
    lane: str
    authorityMode: str
    disabledReason: str | None = None
    latestEventType: str | None = None
    latestEventAt: datetime | None = None
    nextSafeAction: str


class ExecutionReadinessOutcomeEvidenceView(BaseModel):
    eventId: str
    workItemId: str
    createdAt: datetime
    selectedLane: str | None = None
    workerId: str | None = None
    taskKind: str | None = None
    attemptStatus: str | None = None
    validationStatus: str | None = None
    failureClass: str | None = None
    escalationReason: str | None = None
    operatorOverrideReason: str | None = None
    reportingOnly: bool = True


class DisabledProviderProofView(BaseModel):
    workerId: str
    providerLabel: str
    disabledReason: str
    registryState: str = "disabled"
    broadGateEnabled: bool = False
    providerSpecificGateEnabled: bool = False
    modelIdConfigured: bool = False
    adapterReady: bool = False
    endpointFamily: str
    endpointPolicy: str
    httpCallsAttempted: bool = False
    modelCallsAttempted: bool = False
    networkAccessAttempted: bool = False
    credentialAccessAttempted: bool = False
    redactionChecks: list[str] = Field(default_factory=list)
    promptConstructionSources: list[str] = Field(default_factory=list)
    rejectedPromptSources: list[str] = Field(default_factory=list)
    retainedEvidenceClasses: list[str] = Field(default_factory=list)
    rawPromptRetentionAllowed: bool = False
    rawCompletionRetentionAllowed: bool = False
    connectTimeoutSeconds: int | None = None
    totalTimeoutSeconds: int | None = None
    attemptStateMapping: list[str] = Field(default_factory=list)
    retryPolicy: str = ""
    timeoutPolicy: str
    cancellationPolicy: str
    retentionPolicy: str


class ExecutionStateBoundaryView(BaseModel):
    boundaryId: str
    generatedAt: datetime
    summary: str
    queueLeaseRole: list[str]
    executionAttemptRole: list[str]
    forbiddenQueueLeaseFields: list[str]
    futureProcessLifecycleAttachments: list[str]
    queueLeaseGrantsExecutionAuthority: bool = False
    executionAttemptLaunchesWorkers: bool = False


class ExecutionReadinessReportView(BaseModel):
    reportId: str
    generatedAt: datetime
    summary: str
    providerEnablementPolicy: list[ProviderEnablementPolicyStepView]
    disabledAuthorityChecks: list[ExecutionConfigurationCheckView]
    disabledProviderProofs: list[DisabledProviderProofView]
    currentAttempts: list[ExecutionReadinessAttemptSummaryView]
    latestOutcomes: list[ExecutionReadinessOutcomeEvidenceView]
    nextSafeActions: list[str]
    executionAllowed: bool = False
    providerCallsAllowed: bool = False
    commandExecutionAllowed: bool = False
    sourceMutationAllowed: bool = False


class DocumentationAuthorityDocumentView(BaseModel):
    path: str
    label: str
    status: str
    evidence: list[str] = Field(default_factory=list)


class DocumentationAuthorityBlockedStoryView(BaseModel):
    storyId: str
    path: str
    authorityFamily: str
    status: str


class DocumentationAuthorityLegacyArtifactDispositionView(BaseModel):
    artifactId: str
    label: str
    currentLocation: str
    recommendedDisposition: str
    retentionPolicy: str
    sourceOwnedReplacements: list[str] = Field(default_factory=list)
    operatorActions: list[str] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)
    sourceMutationAllowed: bool = False
    rawPayloadRetained: bool = False


class DocumentationAuthorityReportView(BaseModel):
    reportId: str
    generatedAt: datetime
    summary: str
    indexes: list[DocumentationAuthorityDocumentView]
    approvalCheckpoint: DocumentationAuthorityDocumentView
    blockedStories: list[DocumentationAuthorityBlockedStoryView]
    legacyArtifactDispositions: list[DocumentationAuthorityLegacyArtifactDispositionView] = Field(default_factory=list)
    driftChecks: list[ProviderEnablementPolicyStepView]
    nextSafeActions: list[str]
    executionAuthorityApproved: bool = False


class LegacyPlanningArtifactCandidateView(BaseModel):
    candidateId: str
    path: str
    artifactType: str
    freshness: str
    summaryLabel: str
    sourceAccessState: str
    evidenceBoundary: str
    localPlanningState: bool = True


class LegacyPlanningArtifactInventoryReportView(BaseModel):
    reportId: str
    generatedAt: datetime
    summary: str
    candidates: list[LegacyPlanningArtifactCandidateView]
    artifactTypes: list[str] = Field(default_factory=list)
    sourceAccessStates: list[str] = Field(default_factory=list)
    relatedReports: list[str] = Field(default_factory=list)
    relatedDocs: list[str] = Field(default_factory=list)
    stopLines: list[str] = Field(default_factory=list)
    nextSafeActions: list[str] = Field(default_factory=list)
    readOnly: bool = True
    executionAuthorityApproved: bool = False
    artifactBodyRetained: Literal[False] = False


class VerificationCommandView(BaseModel):
    commandId: str
    label: str
    command: str
    status: str
    requiredFor: list[str] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)


class VerificationCommandGroupView(BaseModel):
    groupId: str
    label: str
    status: str
    summary: str
    commandIds: list[str] = Field(default_factory=list)
    requiredBefore: str
    nextAction: str


class VerificationHandoffCheckpointView(BaseModel):
    checkpointId: str
    label: str
    status: str
    summary: str
    requiredCommandIds: list[str] = Field(default_factory=list)
    relatedRunbooks: list[str] = Field(default_factory=list)
    nextAction: str


class VerificationSurfaceCoverageView(BaseModel):
    surfaceId: str
    label: str
    status: str
    summary: str
    requiredCommandIds: list[str] = Field(default_factory=list)
    relatedReports: list[str] = Field(default_factory=list)
    dashboardAnchors: list[str] = Field(default_factory=list)
    stopLines: list[str] = Field(default_factory=list)
    nextAction: str


class VerificationReadinessReportView(BaseModel):
    reportId: str
    generatedAt: datetime
    summary: str
    requiredCommands: list[VerificationCommandView]
    optionalCommands: list[VerificationCommandView]
    commandGroups: list[VerificationCommandGroupView]
    handoffCheckpoints: list[VerificationHandoffCheckpointView]
    surfaceCoverage: list[VerificationSurfaceCoverageView] = Field(default_factory=list)
    stopLines: list[str]
    nextSafeActions: list[str]
    readyForAuthorityEnablement: bool = False
    executionAuthorityApproved: bool = False


class AuthorityReadinessFamilyView(BaseModel):
    familyId: str
    label: str
    status: str
    summary: str
    blockedStories: list[str] = Field(default_factory=list)
    requiredApprovals: list[str] = Field(default_factory=list)
    requiredEvidence: list[str] = Field(default_factory=list)
    relatedReports: list[str] = Field(default_factory=list)
    relatedDocs: list[str] = Field(default_factory=list)
    dashboardAnchors: list[str] = Field(default_factory=list)
    stopLines: list[str] = Field(default_factory=list)
    rollbackPath: str = Field(min_length=1)
    nextAction: str

    @field_validator("rollbackPath")
    @classmethod
    def rollback_path_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("rollbackPath must not be blank")
        return value


class CurrentStateReconciliationFindingView(BaseModel):
    findingId: str
    label: str
    status: str
    summary: str
    evidence: list[str] = Field(default_factory=list)
    relatedDocs: list[str] = Field(default_factory=list)
    nextAction: str


class NextLaneDecisionPacketView(BaseModel):
    packetId: str
    status: str
    recommendation: str
    packetPath: str
    approvalRequired: bool = True
    noAuthorityGranted: bool = True
    requiredFreshnessCheck: str
    relatedDocs: list[str] = Field(default_factory=list)
    stopLines: list[str] = Field(default_factory=list)
    nextAction: str

    @model_validator(mode="after")
    def require_blocked_authority_when_approval_is_required(self) -> "NextLaneDecisionPacketView":
        if self.approvalRequired and not self.noAuthorityGranted:
            raise ValueError("approval-required next-lane packets cannot grant execution authority")
        return self


class AuthorityReadinessMatrixReportView(BaseModel):
    reportId: str
    generatedAt: datetime
    summary: str
    currentStateFindings: list[CurrentStateReconciliationFindingView]
    nextLaneDecisionPacket: NextLaneDecisionPacketView
    families: list[AuthorityReadinessFamilyView]
    readinessLadder: list[ProviderEnablementPolicyStepView]
    stopLines: list[str]
    nextSafeActions: list[str]
    readOnly: bool = True
    executionAuthorityApproved: bool = False


class DashboardE2ERunnerView(BaseModel):
    runnerId: str
    label: str
    command: str
    target: str
    status: str
    evidence: list[str] = Field(default_factory=list)
    ownsServerLifecycle: bool = True
    usesRepoLocalCaches: bool = True


class DashboardE2EReportView(BaseModel):
    reportId: str
    generatedAt: datetime
    summary: str
    runners: list[DashboardE2ERunnerView]
    setupCommands: list[VerificationCommandView]
    stopLines: list[str]
    nextSafeActions: list[str]
    readOnly: bool = True
    executionAuthorityApproved: bool = False


class SupervisorReportCatalogEntryView(BaseModel):
    reportId: str
    label: str
    endpoint: str
    status: str
    summary: str
    evidenceScope: list[str] = Field(default_factory=list)
    relatedDocs: list[str] = Field(default_factory=list)
    readOnly: bool = True
    executionAuthorityApproved: bool = False


class SupervisorReportCatalogView(BaseModel):
    catalogId: str
    generatedAt: datetime
    summary: str
    reports: list[SupervisorReportCatalogEntryView]
    stopLines: list[str]
    nextSafeActions: list[str]
    readOnly: bool = True
    executionAuthorityApproved: bool = False


class MaintenanceReadinessTrackView(BaseModel):
    trackId: str
    label: str
    status: str
    summary: str
    evidence: list[str] = Field(default_factory=list)
    relatedReports: list[str] = Field(default_factory=list)
    relatedDocs: list[str] = Field(default_factory=list)
    dashboardAnchors: list[str] = Field(default_factory=list)
    nextAction: str


class MaintenanceReadinessReportView(BaseModel):
    reportId: str
    generatedAt: datetime
    summary: str
    tracks: list[MaintenanceReadinessTrackView]
    stopLines: list[str]
    nextSafeActions: list[str]
    readOnly: bool = True
    executionAuthorityApproved: bool = False


class NextLaneRecommendationView(BaseModel):
    laneTitle: str
    laneSlug: str
    branchName: str
    startCommand: str
    scope: list[str] = Field(default_factory=list)
    verificationCommands: list[str] = Field(default_factory=list)
    stopLines: list[str] = Field(default_factory=list)


class SafeDevelopmentBacklogItemView(BaseModel):
    itemId: str
    label: str
    priority: str
    status: str
    summary: str
    recommendedSliceSize: str
    evidence: list[str] = Field(default_factory=list)
    sourceEvidenceLabels: list[str] = Field(default_factory=list)
    relatedReports: list[str] = Field(default_factory=list)
    relatedDocs: list[str] = Field(default_factory=list)
    dashboardAnchors: list[str] = Field(default_factory=list)
    blockedBy: list[str] = Field(default_factory=list)
    nextLane: NextLaneRecommendationView | None = None
    nextAction: str


class SafeDevelopmentBacklogReportView(BaseModel):
    reportId: str
    generatedAt: datetime
    summary: str
    items: list[SafeDevelopmentBacklogItemView]
    stopLines: list[str]
    nextSafeActions: list[str]
    readOnly: bool = True
    executionAuthorityApproved: bool = False


class RunnerAssignmentWarningView(BaseModel):
    code: str
    severity: str
    message: str


class RunnerAssignmentDegradedInputView(BaseModel):
    inputKind: str
    path: str | None = None
    severity: str
    reason: str
    skippedCount: int | None = None


class RunnerAssignmentStatusSummaryView(BaseModel):
    active: int = 0
    stale: int = 0
    blocked: int = 0
    ambiguous: int = 0
    assignable: int = 0
    closed: int = 0
    degraded: int = 0
    missing: int = 0


class RunnerSourceCompletionRollupView(BaseModel):
    total: int = 0
    assignment: int = 0
    workspace: int = 0
    sourceBacklogItemIds: list[str] = Field(default_factory=list)


class RunnerDispatcherQueueProofRowView(BaseModel):
    backlogItemId: str
    classification: str
    reasonCode: str
    branch: str | None = None
    nextSafeAction: str


class RunnerDispatcherContinuitySnapshotView(BaseModel):
    snapshotId: str
    selectedBacklogItemId: str | None = None
    selectedBranch: str | None = None
    dryRunCommand: str
    summaryDryRunCommand: str
    assignableCount: int
    activeCount: int
    blockedCount: int
    ambiguousCount: int
    closedCount: int
    blockerCodes: list[str] = Field(default_factory=list)
    queueProofRows: list[RunnerDispatcherQueueProofRowView] = Field(default_factory=list)
    nextAction: str


class RunnerDispatchDecisionExplanationView(BaseModel):
    decisionId: str
    decisionKind: Literal["dispatch", "hold", "pause", "throttle", "reroute", "backpressure", "inactivity"]
    decisionState: str
    packetRef: str
    workItemRef: str | None = None
    oneSentenceReason: str
    policyInputs: dict[str, str] = Field(default_factory=dict)
    queryableBy: list[str] = Field(default_factory=list)
    lineageSummary: str = "not_applicable"
    remediationRoute: str = "not_applicable"
    failureBudgetState: str = "not_applicable"
    nextAction: str


class RunnerHandoffAuditEntryView(BaseModel):
    sequence: int
    lane: str | None = None
    branch: str | None = None
    taskId: str | None = None
    workspaceAction: str | None = None
    nextCommand: str | None = None
    generatedAt: str | None = None
    readinessStatus: str | None = None
    readinessCommand: str | None = None
    readinessSummary: str | None = None
    queueCounts: dict[str, int] = Field(default_factory=dict)
    queueCountsStatus: Literal["available", "empty", "invalid", "missing", "not-applicable"] = "missing"
    stopLines: list[str] = Field(default_factory=list)
    lifecycleState: Literal["prepared", "claimed", "delivered", "cleaned", "missing", "not-applicable"] = "not-applicable"
    recoveryAction: Literal[
        "resume-prepared-handoff",
        "wait-for-owner",
        "request-takeover-approval",
        "request-explicit-approval",
        "inspect-handoff-evidence",
        "resume-cleanup",
        "no-action",
    ] = "no-action"
    recoverySummary: str = "No handoff recovery action required."
    retentionPolicy: Literal["metadata-only", "capped-metadata-only"] = "metadata-only"
    payloadRetention: Literal["not-retained", "redacted", "omitted"] = "not-retained"
    retentionSummary: str = "metadata-only audit entry; raw payloads not retained."
    evidenceStatus: Literal["complete", "partial", "invalid"] = "partial"
    evidenceSummary: str


class RunnerSourceCompletionEvidenceView(BaseModel):
    evidenceKind: Literal["assignment", "workspace"]
    recordId: str
    sourceBacklogItemId: str
    branch: str | None = None
    taskId: str | None = None
    sourceAssignmentId: str | None = None
    evidencePath: str | None = None
    evidenceSummary: str


class RunnerAssignmentStatusRowView(BaseModel):
    id: str
    title: str
    classification: str
    degraded: bool = False
    reasonCode: str
    reason: str
    warnings: list[RunnerAssignmentWarningView] = Field(default_factory=list)
    nextSafeAction: str
    owner: str | None = None
    branch: str | None = None
    taskId: str | None = None
    assignmentId: str | None = None
    backlogItemId: str | None = None
    phase: str | None = None
    runnerKind: str = "unknown"
    heartbeatAt: datetime | None = None
    heartbeatSource: str = "missing"
    heartbeatAgeSeconds: int | None = None
    heartbeatMissing: bool = True
    staleAfterSeconds: int
    currentCommand: str | None = None
    lastResult: str | None = None
    worktreePath: str | None = None
    worktreeState: str = "not-applicable"
    handoffStatus: str = "not-applicable"
    handoffNextCommand: str | None = None
    handoffReadinessStatus: str | None = None
    handoffReadinessCommand: str | None = None
    handoffGeneratedAt: str | None = None
    handoffSummary: str | None = None
    handoffTakeoverStopLines: list[str] = Field(default_factory=list)
    handoffCandidateStateCounts: dict[str, int] = Field(default_factory=dict)
    handoffCandidateStateCountsStatus: str = "not-applicable"
    handoffLifecycleState: Literal["prepared", "claimed", "delivered", "cleaned", "missing", "not-applicable"] = "not-applicable"
    handoffRecoveryAction: Literal[
        "resume-prepared-handoff",
        "wait-for-owner",
        "request-takeover-approval",
        "request-explicit-approval",
        "inspect-handoff-evidence",
        "resume-cleanup",
        "no-action",
    ] = "no-action"
    handoffRecoverySummary: str = "No handoff recovery action required."
    handoffAuditTrail: list[RunnerHandoffAuditEntryView] = Field(default_factory=list)
    deliveryState: str = "unknown"
    localEvidenceStatus: str = "available"
    evidencePath: str | None = None
    sourceCompletionEvidence: RunnerSourceCompletionEvidenceView | None = None


RunnerWorkspaceAssignmentView = RunnerAssignmentStatusRowView
RunnerLaneAssignmentView = RunnerAssignmentStatusRowView
RunnerBacklogCandidateView = RunnerAssignmentStatusRowView


class RunnerAssignmentStatusReportView(BaseModel):
    reportStatus: str
    errorMessage: str | None = None
    generatedAt: datetime
    stateRoot: str | None = None
    stateRootStatus: str
    partial: bool
    currentOwner: str | None = None
    staleAfterSeconds: int
    summary: RunnerAssignmentStatusSummaryView
    sourceCompletionRollup: RunnerSourceCompletionRollupView = Field(default_factory=RunnerSourceCompletionRollupView)
    dispatcherContinuity: RunnerDispatcherContinuitySnapshotView
    dispatchDecisionExplanations: list[RunnerDispatchDecisionExplanationView] = Field(default_factory=list)
    workspaceAssignments: list[RunnerWorkspaceAssignmentView] = Field(default_factory=list)
    laneAssignments: list[RunnerLaneAssignmentView] = Field(default_factory=list)
    backlogCandidates: list[RunnerBacklogCandidateView] = Field(default_factory=list)
    degradedInputs: list[RunnerAssignmentDegradedInputView] = Field(default_factory=list)


class MaintenanceActionPlanStepView(BaseModel):
    stepId: str
    label: str
    priority: str
    status: str
    summary: str
    evidence: list[str] = Field(default_factory=list)
    verificationCommands: list[str] = Field(default_factory=list)
    relatedReports: list[str] = Field(default_factory=list)
    relatedDocs: list[str] = Field(default_factory=list)
    dashboardAnchors: list[str] = Field(default_factory=list)
    nextAction: str


class MaintenanceActionPlanReportView(BaseModel):
    reportId: str
    generatedAt: datetime
    summary: str
    steps: list[MaintenanceActionPlanStepView]
    verificationChain: list[str]
    stopLines: list[str]
    nextSafeActions: list[str]
    readOnly: bool = True
    executionAuthorityApproved: bool = False


class DevelopmentRunwayReadinessCheckView(BaseModel):
    checkId: str
    label: str
    status: str
    summary: str
    evidence: list[str] = Field(default_factory=list)
    requiredCommandIds: list[str] = Field(default_factory=list)
    relatedReports: list[str] = Field(default_factory=list)
    relatedDocs: list[str] = Field(default_factory=list)
    dashboardAnchors: list[str] = Field(default_factory=list)
    nextAction: str


class DevelopmentRunwaySliceView(BaseModel):
    sliceId: str
    label: str
    status: str
    recommendedPrScope: str
    summary: str
    includedBacklogItems: list[str] = Field(default_factory=list)
    includedActionSteps: list[str] = Field(default_factory=list)
    requiredVerification: list[str] = Field(default_factory=list)
    relatedReports: list[str] = Field(default_factory=list)
    relatedDocs: list[str] = Field(default_factory=list)
    dashboardAnchors: list[str] = Field(default_factory=list)
    readinessChecks: list[DevelopmentRunwayReadinessCheckView] = Field(default_factory=list)
    blockedBy: list[str] = Field(default_factory=list)
    nextLane: NextLaneRecommendationView | None = None
    nextAction: str


class DevelopmentRunwayReportView(BaseModel):
    reportId: str
    generatedAt: datetime
    summary: str
    planningRule: str
    minimumPrScope: str
    batchingPolicy: list[str] = Field(default_factory=list)
    prBatchingChecklist: list[str] = Field(default_factory=list)
    slices: list[DevelopmentRunwaySliceView]
    verificationChain: list[str]
    stopLines: list[str]
    nextSafeActions: list[str]
    readOnly: bool = True
    executionAuthorityApproved: bool = False
    remoteAutomationApproved: bool = False


class RuntimeEvidenceCrossCheckView(BaseModel):
    label: str
    report: str
    dashboardAnchor: str
    relatedDoc: str
    reason: str


class RuntimeEvidenceReviewWorkItemView(BaseModel):
    workItemId: str
    title: str
    state: str
    riskLevel: str
    needsAttention: bool
    attemptCount: int
    eventCount: int
    relatedReportCount: int
    relatedReports: list[str] = Field(default_factory=list)
    relatedDocs: list[str] = Field(default_factory=list)
    dashboardAnchors: list[str] = Field(default_factory=list)
    latestEventAt: datetime | None = None
    runtimeExportHref: str
    reviewPriority: str
    reviewReason: str
    recommendedAction: str


class RuntimeEvidenceReviewReportView(BaseModel):
    reportId: str
    generatedAt: datetime
    summary: str
    workItems: list[RuntimeEvidenceReviewWorkItemView]
    reviewQueue: list[RuntimeEvidenceReviewWorkItemView]
    crossChecks: list[RuntimeEvidenceCrossCheckView] = Field(default_factory=list)
    relatedReports: list[str]
    relatedDocs: list[str]
    dashboardAnchors: list[str]
    stopLines: list[str]
    nextSafeActions: list[str]
    readOnly: bool = True
    executionAuthorityApproved: bool = False


class ThreatBoundaryRuleView(BaseModel):
    ruleId: str
    label: str
    status: str
    summary: str
    blockedReason: str
    evidence: list[str] = Field(default_factory=list)


class ThreatBoundaryView(BaseModel):
    boundaryId: str
    status: str
    generatedAt: datetime
    summary: str
    redactionBoundary: list[str]
    promptConstructionSources: list[str]
    allowedCommandClasses: list[str]
    blockedCommandClasses: list[str]
    providerEndpointPolicy: str
    credentialPolicy: str
    artifactPolicy: str
    rules: list[ThreatBoundaryRuleView]
    processLaunchAllowed: bool = False
    providerCallsAllowed: bool = False
    modelCallsAllowed: bool = False
    premiumExecutionAllowed: bool = False
    commandExecutionAllowed: bool = False
    sourceMutationAllowed: bool = False
    networkAllowed: bool = False
    credentialAccessAllowed: bool = False


class RoutingOverrideView(BaseModel):
    overrideId: str
    workItemId: str
    createdAt: datetime
    currentRoute: RoutingDecisionView
    proposedLane: str
    reason: str
    note: str | None = None
    actorId: str | None = None
    actorLabel: str | None = None
    executionAffected: bool = False


class WorkItemExecutionRecipeView(BaseModel):
    id: str
    label: str
    summary: str
    branchPrefix: str
    allowedPaths: list[str]
    implementationCommands: list[str]
    verificationCommands: list[str]
    policyGates: list[WorkItemPolicyGateView]
    operatorCheckpoints: list[str]
    autonomyNotes: list[str]
    remoteAutomationPolicy: WorkItemRemoteAutomationPolicyView


class ManagedRecipePolicyReportView(BaseModel):
    reportId: str
    generatedAt: datetime
    summary: str
    recipes: list[WorkItemExecutionRecipeView]
    stopLines: list[str]
    nextSafeActions: list[str]
    readOnly: bool = True
    executionAuthorityApproved: bool = False
    remoteAutomationApproved: bool = False


class GitHubWorkflowPolicyItemView(BaseModel):
    itemId: str
    label: str
    status: str
    summary: str
    evidence: list[str]


class GitHubWorkflowPolicyReportView(BaseModel):
    reportId: str
    generatedAt: datetime
    summary: str
    authModel: list[GitHubWorkflowPolicyItemView]
    requiredChecks: list[GitHubWorkflowPolicyItemView]
    stopLines: list[str]
    nextSafeActions: list[str]
    readOnly: bool = True
    executionAuthorityApproved: bool = False
    plaintextTokenStorageApproved: bool = False
    remoteAutomationApproved: bool = False


class GitHygieneSignalView(BaseModel):
    signalId: str
    label: str
    status: str
    summary: str
    evidence: list[str]


class GitHygieneWorktreeView(BaseModel):
    path: str
    branch: str | None = None
    head: str | None = None
    detached: bool = False
    locked: bool = False
    prunable: bool = False


class GitHygieneReportView(BaseModel):
    reportId: str
    generatedAt: datetime
    summary: str
    repoRoot: str
    currentBranch: str
    headRevision: str
    upstreamBranch: str | None = None
    workingTreeStatus: str
    statusCounts: dict[str, int]
    worktrees: list[GitHygieneWorktreeView]
    localSignals: list[GitHygieneSignalView]
    remoteSignals: list[GitHygieneSignalView]
    stopLines: list[str]
    nextSafeActions: list[str]
    readOnly: bool = True
    remoteMutationApproved: bool = False
    cleanupApproved: bool = False


class LocalWorktreePlanView(BaseModel):
    planId: str
    workItemId: str
    title: str
    executionBranch: str
    baseBranch: str
    baseRevision: str
    worktreePath: str
    status: str
    createCommand: list[str]
    cleanupCommand: list[str]
    safetyChecks: list[str]
    blockedBy: list[str]
    evidence: list[str]
    createAllowed: bool = False
    cleanupAllowed: bool = False
    remoteOperationsAllowed: bool = False


class CodexReadinessCheckView(BaseModel):
    checkId: str
    label: str
    status: str
    summary: str
    evidence: list[str]


class CodexReadinessReportView(BaseModel):
    reportId: str
    generatedAt: datetime
    summary: str
    cliPath: str | None = None
    checks: list[CodexReadinessCheckView]
    stopLines: list[str]
    nextSafeActions: list[str]
    readOnly: bool = True
    processLaunchApproved: bool = False
    workerTaskExecutionApproved: bool = False
    sourceMutationApproved: bool = False


class CodexImplementationApprovalRequirementView(BaseModel):
    requirementId: str
    label: str
    status: str
    summary: str
    evidence: list[str]


class CodexLaunchApprovalBindingView(BaseModel):
    workItemId: str
    routeDecisionId: str
    attemptId: str
    workerId: str
    lane: str
    authorityMode: str
    workspacePlanId: str
    policyId: str
    approvedScope: list[str]
    expiresAt: datetime


class CodexLaunchPermissionEnvelopeView(BaseModel):
    allowedPaths: list[str]
    blockedPaths: list[str]
    allowedCommandShape: list[str]
    verificationCommand: str
    timeoutSeconds: int
    budget: str
    evidenceOutputs: list[str]
    stopConditions: list[str]


class CodexLaunchContractEvaluationView(BaseModel):
    status: str
    launchApproved: bool
    processLaunchAttempted: bool
    blockedReason: str | None = None
    unsafeField: str | None = None
    summary: str


class CodexLaunchContractView(BaseModel):
    contractId: str
    targetWorkItem: str
    routeDecision: str
    attemptId: str
    workerId: str
    lane: str
    authorityMode: str
    workspacePlan: str
    approvalBinding: CodexLaunchApprovalBindingView
    permissionEnvelope: CodexLaunchPermissionEnvelopeView
    evidenceToRetain: list[str]
    evaluation: CodexLaunchContractEvaluationView


class CodexLaunchContractFixtureView(BaseModel):
    fixtureId: str
    label: str
    mutatedField: str
    evaluation: CodexLaunchContractEvaluationView


class CodexBlockedAuthorityView(BaseModel):
    authorityId: str
    label: str
    status: str
    summary: str


class CodexImplementationApprovalReportView(BaseModel):
    reportId: str
    generatedAt: datetime
    summary: str
    approvalPrompt: str
    authorityFamily: str
    operation: str
    targetScope: list[str]
    allowedPaths: list[str]
    blockedPaths: list[str]
    expectedCommandShape: list[str]
    requiredEvidence: list[str]
    rollbackPlan: list[str]
    stopConditions: list[str]
    requirements: list[CodexImplementationApprovalRequirementView]
    launchContract: CodexLaunchContractView
    launchContractFixtures: list[CodexLaunchContractFixtureView]
    blockedAuthorities: list[CodexBlockedAuthorityView]
    nextSafeActions: list[str]
    readOnly: bool = True
    processLaunchApproved: bool = False
    workerTaskExecutionApproved: bool = False
    sourceMutationApproved: bool = False
    approvalBindingImplemented: bool = False


class ClaudeReadinessCheckView(BaseModel):
    checkId: str
    label: str
    status: str
    summary: str
    evidence: list[str]


class ClaudeReviewReadinessReportView(BaseModel):
    reportId: str
    generatedAt: datetime
    summary: str
    cliPath: str | None = None
    reviewPolicy: list[ClaudeReadinessCheckView]
    scarcityPolicy: list[ClaudeReadinessCheckView]
    stopLines: list[str]
    nextSafeActions: list[str]
    readOnly: bool = True
    processLaunchApproved: bool = False
    reviewTaskExecutionApproved: bool = False
    sourceMutationApproved: bool = False
    scarceUseApproved: bool = False


class ClaudeReviewApprovalRequirementView(BaseModel):
    requirementId: str
    label: str
    status: str
    summary: str
    evidence: list[str]


class ClaudeReviewApprovalReportView(BaseModel):
    reportId: str
    generatedAt: datetime
    summary: str
    approvalPrompt: str
    authorityFamily: str
    operation: str
    triggerPolicy: list[ClaudeReviewApprovalRequirementView]
    contextScope: list[str]
    blockedInputs: list[str]
    expectedCommandShape: list[str]
    outputContract: list[str]
    requiredEvidence: list[str]
    scarcityControls: list[str]
    stopConditions: list[str]
    nextSafeActions: list[str]
    readOnly: bool = True
    processLaunchApproved: bool = False
    reviewTaskExecutionApproved: bool = False
    sourceMutationApproved: bool = False
    scarceUseApproved: bool = False
    approvalBindingImplemented: bool = False


class ReviewResourcePolicyTriggerView(BaseModel):
    triggerId: str
    label: str
    status: str
    summary: str
    evidenceSignals: list[str]
    recommendedRoutes: list[str]


class ReviewResourcePolicyRouteView(BaseModel):
    routeId: str
    label: str
    authorityFamily: str
    status: str
    summary: str
    allowedWhen: list[str]
    commandPolicy: list[str]
    retainedEvidence: list[str]
    blockedCapabilities: list[str]
    budgetCap: str | None = None


class ReviewResourcePolicyScenarioView(BaseModel):
    scenarioId: str
    label: str
    triggerIds: list[str]
    selectedRoutes: list[str]
    policyBasis: str
    retentionSummary: str
    nextSafeAction: str


class ReviewResourcePolicyPacketEvaluationView(BaseModel):
    packetId: str
    packetKind: str
    triggerIds: list[str]
    selectedRoutes: list[str]
    decisionBasis: str
    retainedEvidence: list[str]
    stopLines: list[str]
    readOnly: bool = True
    processLaunchApproved: bool = False
    sourceMutationApproved: bool = False
    githubMutationApproved: bool = False
    rawProviderPayloadsRetained: bool = False
    rawReasoningRetained: bool = False


class ReviewResourcePolicyReportView(BaseModel):
    reportId: str
    generatedAt: datetime
    summary: str
    triggers: list[ReviewResourcePolicyTriggerView]
    routes: list[ReviewResourcePolicyRouteView]
    scenarios: list[ReviewResourcePolicyScenarioView]
    packetEvaluations: list[ReviewResourcePolicyPacketEvaluationView]
    claudeReadOnlyCommand: list[str]
    retentionPolicy: str
    stopLines: list[str]
    nextSafeActions: list[str]
    readOnly: bool = True
    processLaunchApproved: bool = False
    sourceMutationApproved: bool = False
    githubMutationApproved: bool = False
    rawProviderPayloadsRetained: bool = False
    rawReasoningRetained: bool = False


class GitHubDeliveryAuthorityStepView(BaseModel):
    stepId: str
    label: str
    status: str
    summary: str
    requiredApproval: str
    evidence: list[str]


class GitHubDeliveryEligibilityStageView(BaseModel):
    stageId: str
    label: str
    status: str
    summary: str
    eligibleWhen: list[str]
    hardStops: list[str]
    allowedOperations: list[str]
    blockedOperations: list[str]


class GitHubDeliveryAuthorityReportView(BaseModel):
    reportId: str
    generatedAt: datetime
    summary: str
    authorityFamily: str
    approvalPrompt: str
    ladder: list[GitHubDeliveryAuthorityStepView]
    trustedDeliveryPolicy: list[str]
    eligibilityStages: list[GitHubDeliveryEligibilityStageView]
    requiredEvidence: list[str]
    rollbackPlan: list[str]
    stopConditions: list[str]
    nextSafeActions: list[str]
    readOnly: bool = True
    pushApproved: bool = False
    pullRequestApproved: bool = False
    ciWaitApproved: bool = False
    reviewResolutionApproved: bool = False
    mergeApproved: bool = False
    remoteCleanupApproved: bool = False
    automaticDeliveryApproved: bool = False


class TrustedDeliveryEligibilityCheckView(BaseModel):
    checkId: str
    label: str
    gateFamily: str
    status: str
    summary: str
    evidence: list[str] = Field(default_factory=list)
    blockedReason: str | None = None


class TrustedDeliveryEligibilityStageEvaluationView(BaseModel):
    stageId: str
    label: str
    status: str
    eligible: bool
    checks: list[TrustedDeliveryEligibilityCheckView]
    allowedOperations: list[str] = Field(default_factory=list)
    blockedOperations: list[str] = Field(default_factory=list)
    nextAction: str


class TrustedDeliveryDiffGuardFileView(BaseModel):
    path: str
    changeType: str
    classification: str
    reason: str


class TrustedDeliveryDiffGuardView(BaseModel):
    approvedFiles: list[str]
    allowedGlobs: list[str]
    forbiddenPaths: list[str]
    generatedFileRules: list[str]
    userOwnedDirtyFileRules: list[str]
    status: str
    blockedReason: str | None = None
    changedFiles: list[TrustedDeliveryDiffGuardFileView]
    blockedPaths: list[str]
    recommendation: str


class TrustedDeliveryDiffGuardFixtureView(BaseModel):
    fixtureId: str
    label: str
    guard: TrustedDeliveryDiffGuardView


class TrustedDeliveryVerificationEvidenceView(BaseModel):
    commandId: str
    label: str
    commandShape: str
    status: str
    exitCode: int | None = None
    durationMs: int | None = None
    summary: str
    artifactRef: str | None = None
    recoveryAction: str
    rawOutputRetained: bool = False


class TrustedDeliveryVerificationEvidenceFixtureView(BaseModel):
    fixtureId: str
    label: str
    evidence: TrustedDeliveryVerificationEvidenceView
    greenGateContribution: str
    blockedReason: str | None = None


class TrustedDeliveryActionEligibilityView(BaseModel):
    actionId: str
    label: str
    status: str
    evidence: list[str]
    blockedReasons: list[str]
    nextAction: str
    executionApproved: bool = False


class TrustedDeliveryActionEligibilityFixtureView(BaseModel):
    fixtureId: str
    label: str
    actions: list[TrustedDeliveryActionEligibilityView]


class TrustedDeliveryEligibilityReportView(BaseModel):
    reportId: str
    generatedAt: datetime
    summary: str
    currentBranch: str
    baseBranch: str
    headRevision: str
    workingTreeStatus: str
    commitsAhead: int
    diffStat: str
    diffGuard: TrustedDeliveryDiffGuardView
    diffGuardFixtures: list[TrustedDeliveryDiffGuardFixtureView]
    verificationEvidenceFixtures: list[TrustedDeliveryVerificationEvidenceFixtureView]
    actionEligibility: list[TrustedDeliveryActionEligibilityView]
    actionEligibilityFixtures: list[TrustedDeliveryActionEligibilityFixtureView]
    unrelatedAuthoritiesBlocked: list[str]
    stages: list[TrustedDeliveryEligibilityStageEvaluationView]
    hardStops: list[str]
    nextSafeActions: list[str]
    readOnly: bool = True
    automaticDeliveryApproved: bool = False
    pushPrAutoEligible: bool = False
    mergeAutoEligible: bool = False
    cleanupAutoEligible: bool = False


class LowRiskDeliveryPlanActionView(BaseModel):
    actionId: str
    label: str
    status: str
    eligible: bool
    dryRunEffects: list[str] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)
    blockedReasons: list[str] = Field(default_factory=list)
    nextSafeAction: str
    requiredApproval: str
    requiredPolicy: str
    allowedOperations: list[str] = Field(default_factory=list)
    blockedOperations: list[str] = Field(default_factory=list)
    readOnly: bool = True


class DeliveryGateCriterionView(BaseModel):
    criterionId: str
    label: str
    status: str
    evidence: list[str] = Field(default_factory=list)
    blockedReason: str | None = None


class DeliveryMergeGateEvidenceView(BaseModel):
    status: str
    lowRiskReady: bool
    criteria: list[DeliveryGateCriterionView] = Field(default_factory=list)
    blockedReasons: list[str] = Field(default_factory=list)
    recoveryPath: str
    metadataOnly: bool = True
    mergeApproved: bool = False


class CleanupDryRunGateEvidenceView(BaseModel):
    status: str
    dryRunMatchesPolicy: bool
    expectedPr: str | None = None
    expectedOwner: str | None = None
    expectedWorktree: str | None = None
    expectedLocalBranch: str | None = None
    expectedRemoteBranch: str | None = None
    expectedHeadRevision: str | None = None
    blockedReasons: list[str] = Field(default_factory=list)
    recoveryPath: str
    metadataOnly: bool = True
    cleanupApproved: bool = False


class LowRiskDeliveryPlanReportView(BaseModel):
    reportId: str
    generatedAt: datetime
    summary: str
    workItemId: str | None = None
    currentBranch: str
    baseBranch: str
    headRevision: str
    workingTreeStatus: str
    prRef: str | None = None
    actions: list[LowRiskDeliveryPlanActionView]
    mergeGate: DeliveryMergeGateEvidenceView
    cleanupDryRunGate: CleanupDryRunGateEvidenceView
    hardStops: list[str]
    nextSafeActions: list[str]
    readOnly: bool = True
    remoteMutationApproved: bool = False
    cleanupApproved: bool = False
    automaticDeliveryApproved: bool = False


class DeliveryExecutionEvidencePayload(BaseModel):
    actionId: Literal["pr", "merge"]
    recordEvent: bool = False
    approvalId: str | None = None
    policyId: str | None = None
    actorId: str | None = None
    actorLabel: str | None = None
    expectedBranch: str | None = None
    expectedHeadRevision: str | None = None
    pullRequestUrl: str | None = None
    pullRequestHeadRevision: str | None = None
    baseBranch: str | None = None
    ciStatus: str | None = None
    reviewState: str | None = None
    mergeStatus: str | None = None
    mergeResult: str | None = None
    commandShape: str | None = None
    terminalStatus: str | None = None
    exitCode: int | None = None
    summary: str | None = None
    artifactRefs: list[str] = Field(default_factory=list)
    recoveryPath: str | None = None


class DeliveryApprovalLedgerEntryView(BaseModel):
    approvalId: str
    authorityFamily: str
    policyId: str
    actionId: Literal["pr", "merge"]
    workItemId: str
    targetBranch: str
    baseBranch: str
    headRevision: str
    pullRequestUrl: str
    pullRequestHeadRevision: str
    ciStatus: str
    reviewState: str
    mergeStatus: str | None = None
    retainedEvidence: list[str] = Field(default_factory=list)
    approvedBy: str
    approvedAt: str | None = None
    expiresAt: str | None = None
    reviewPoint: str | None = None
    rollbackPlan: list[str] = Field(default_factory=list)
    stopLines: list[str] = Field(default_factory=list)


class DeliveryExecutionEvidenceView(BaseModel):
    evidenceId: str
    mode: str
    actionId: str
    status: str
    eventRecorded: bool
    blockedReasons: list[str] = Field(default_factory=list)
    commandShape: str | None = None
    targetBranch: str | None = None
    pullRequestUrl: str | None = None
    expectedHeadRevision: str | None = None
    pullRequestHeadRevision: str | None = None
    baseBranch: str | None = None
    ciStatus: str | None = None
    reviewState: str | None = None
    mergeStatus: str | None = None
    mergeResult: str | None = None
    terminalStatus: str | None = None
    exitCode: int | None = None
    summary: str
    artifactRefs: list[str] = Field(default_factory=list)
    approvalReference: str | None = None
    recoveryPath: str
    rawOutputRetained: bool = False
    cleanupAllowed: bool = False
    externalMutationRecorded: bool = False
    remoteMutationPerformed: bool = False


class CleanupPlanResidueView(BaseModel):
    kind: str
    path: str
    insideApprovedTarget: bool
    safeToRemoveAfterApproval: bool


class CleanupPlanView(BaseModel):
    planId: str
    generatedAt: datetime
    workItemId: str
    status: str
    branchTarget: str
    cleanupTargetPath: str | None = None
    gitWorktreeState: str
    filesystemState: str
    sourceFileState: str
    sourceFiles: list[str] = Field(default_factory=list)
    retainedEvidence: list[str] = Field(default_factory=list)
    residue: list[CleanupPlanResidueView] = Field(default_factory=list)
    blockedPaths: list[str] = Field(default_factory=list)
    dryRunEffects: list[str] = Field(default_factory=list)
    blockedReasons: list[str] = Field(default_factory=list)
    requiredApproval: str
    requiredPolicy: str
    recoveryPath: str
    nextSafeActions: list[str] = Field(default_factory=list)
    readOnly: bool = True
    cleanupAllowed: bool = False
    branchDeletionApproved: bool = False
    worktreeRemovalApproved: bool = False
    evidenceDeletionApproved: bool = False
    remoteMutationApproved: bool = False


class LocalCleanupPolicyItemView(BaseModel):
    itemId: str
    label: str
    status: str
    summary: str
    evidence: list[str]


class LocalCleanupReadinessReportView(BaseModel):
    reportId: str
    generatedAt: datetime
    summary: str
    cleanupPolicy: list[LocalCleanupPolicyItemView]
    requiredEvidence: list[str]
    blockedTargets: list[str]
    stopConditions: list[str]
    nextSafeActions: list[str]
    readOnly: bool = True
    automaticCleanupApproved: bool = False
    worktreeRemovalApproved: bool = False
    branchDeletionApproved: bool = False
    evidenceDeletionApproved: bool = False


class RemoteCleanupSyncPolicyItemView(BaseModel):
    itemId: str
    label: str
    status: str
    summary: str
    evidence: list[str]


class RemoteCleanupSyncReadinessReportView(BaseModel):
    reportId: str
    generatedAt: datetime
    summary: str
    syncPolicy: list[RemoteCleanupSyncPolicyItemView]
    requiredEvidence: list[str]
    blockedOperations: list[str]
    stopConditions: list[str]
    nextSafeActions: list[str]
    readOnly: bool = True
    remoteBranchDeletionApproved: bool = False
    issueSyncApproved: bool = False
    storyStatusSyncApproved: bool = False
    remoteMutationApproved: bool = False


class TrustedAutonomyReadinessGateView(BaseModel):
    gateId: str
    label: str
    status: str
    summary: str
    evidence: list[str]


class TrustedAutonomyDeauthorizationTriggerView(BaseModel):
    triggerId: str
    label: str
    status: str
    summary: str
    deauthorizedOperations: list[str]
    recoveryEvidence: list[str]


class TrustedAutonomyReadinessReportView(BaseModel):
    reportId: str
    generatedAt: datetime
    summary: str
    autonomyGates: list[TrustedAutonomyReadinessGateView]
    deauthorizationTriggers: list[TrustedAutonomyDeauthorizationTriggerView]
    eligibleWork: list[str]
    blockedWork: list[str]
    requiredEvidence: list[str]
    stopConditions: list[str]
    nextSafeActions: list[str]
    readOnly: bool = True
    lowRiskAutonomyApproved: bool = False
    autonomousProviderUseApproved: bool = False
    autonomousGitHubDeliveryApproved: bool = False
    autonomousCleanupApproved: bool = False


class EpicCompletionAuditItemView(BaseModel):
    itemId: str
    label: str
    status: str
    summary: str
    evidence: list[str]


class EpicCompletionAuditReportView(BaseModel):
    reportId: str
    generatedAt: datetime
    summary: str
    epicId: str
    overallStatus: str
    completedItems: list[EpicCompletionAuditItemView]
    remainingItems: list[EpicCompletionAuditItemView]
    blockedOperations: list[str]
    recommendedApproval: str
    requiredEvidence: list[str]
    stopConditions: list[str]
    nextSafeActions: list[str]
    readOnly: bool = True
    epicComplete: bool = False
    remoteDeliveryApproved: bool = False
    providerExecutionApproved: bool = False
    cleanupApproved: bool = False


class MvpProofTrialStepView(BaseModel):
    stepId: str
    label: str
    status: str
    summary: str
    requiredApproval: str
    evidence: list[str]


class MvpProofTrialReportView(BaseModel):
    reportId: str
    generatedAt: datetime
    summary: str
    selectedStory: str
    trialStatus: str
    steps: list[MvpProofTrialStepView]
    approvalPackets: list[str]
    blockedOperations: list[str]
    stopConditions: list[str]
    nextSafeActions: list[str]
    readOnly: bool = True
    codexLaunchApproved: bool = False
    claudeLaunchApproved: bool = False
    providerExpansionApproved: bool = False
    autonomousDeliveryApproved: bool = False


class DeliveryReadinessPolicyItemView(BaseModel):
    itemId: str
    label: str
    status: str
    summary: str
    evidence: list[str]


class DeliveryReadinessPolicyReportView(BaseModel):
    reportId: str
    generatedAt: datetime
    summary: str
    statusPolicy: list[DeliveryReadinessPolicyItemView]
    waiverPolicy: list[DeliveryReadinessPolicyItemView]
    promoteReadinessPolicy: list[DeliveryReadinessPolicyItemView] = Field(default_factory=list)
    deliverReadinessPolicy: list[DeliveryReadinessPolicyItemView] = Field(default_factory=list)
    blockerRoutingPolicy: list[DeliveryReadinessPolicyItemView] = Field(default_factory=list)
    stopLines: list[str]
    nextSafeActions: list[str]
    readOnly: bool = True
    executionAuthorityApproved: bool = False
    remoteAutomationApproved: bool = False


class WorkItemView(BaseModel):
    id: str
    title: str
    requestedOutcome: str
    source: str
    origin: str
    details: str | None
    riskLevel: RiskLevel
    metadata: dict[str, Any]
    state: WorkflowState
    lane: BmadLane | None
    assigneeId: str | None = None
    assigneeLabel: str | None = None
    ageMinutes: int
    needsAttention: bool
    attentionReason: str | None = None
    escalatedAt: datetime | None = None
    escalationReason: str | None = None
    escalatedByLabel: str | None = None
    statusSummary: str
    blockedReason: str | None
    nextStep: str | None
    selfDetectedIssue: bool = False
    selfDetectedIssueCategory: str | None = None
    executionRecipe: WorkItemExecutionRecipeView | None = None
    deliveryReadiness: WorkItemDeliveryReadinessView | None = None
    createdAt: datetime
    updatedAt: datetime
    lastEventAt: datetime
    requiresAudit: bool
    auditMode: AuditMode


class RunStatusView(BaseModel):
    mode: RunMode
    pollIntervalSeconds: int
    queueCount: int
    activeCount: int
    blockedCount: int
    doneCount: int
    summary: str


class ApiErrorShape(BaseModel):
    code: str
    message: str
    category: ErrorCategory
    retryable: bool
    correlationId: str
    details: dict[str, Any] | None = None


class ApiEnvelope(BaseModel):
    data: Any
    meta: dict[str, Any] | None = None


class ApiErrorEnvelope(BaseModel):
    error: ApiErrorShape


class AuditEventView(BaseModel):
    id: str
    workItemId: str
    reason: str
    mode: AuditMode
    outcome: str
    createdAt: datetime


class WorkflowEventView(BaseModel):
    id: str
    workItemId: str
    eventType: str
    actorType: str
    actorId: str | None
    actorLabel: str | None = None
    correlationId: str
    summary: str
    payload: dict[str, Any]
    createdAt: datetime


class RuntimeEvidenceExportBoundaryView(BaseModel):
    localRuntimeState: list[str]
    gitBackedEvidence: list[str]
    relatedSupervisorReports: list[str] = Field(default_factory=list)
    excludedState: list[str]


class RuntimeEvidenceExportSafetyView(BaseModel):
    exportOnly: bool = True
    processLaunchAllowed: bool = False
    providerCallsAllowed: bool = False
    modelCallsAllowed: bool = False
    premiumExecutionAllowed: bool = False
    commandExecutionAllowed: bool = False
    sourceMutationAllowed: bool = False
    networkAllowed: bool = False
    credentialAccessAllowed: bool = False


class RuntimeEvidenceReviewManifestView(BaseModel):
    manifestId: str
    summary: str
    evidenceCounts: dict[str, int]
    reviewChecklist: list[str]
    retentionNotes: list[str]
    stopLines: list[str]
    readOnly: bool = True
    executionAuthorityApproved: bool = False


class RuntimeEvidenceReviewNavigatorItemView(BaseModel):
    itemId: str
    label: str
    priority: str
    target: str
    summary: str
    evidence: list[str] = Field(default_factory=list)
    relatedReports: list[str] = Field(default_factory=list)
    relatedDocs: list[str] = Field(default_factory=list)
    dashboardAnchors: list[str] = Field(default_factory=list)
    stopLines: list[str] = Field(default_factory=list)
    crossChecks: list[RuntimeEvidenceCrossCheckView] = Field(default_factory=list)


class RuntimeEvidenceSubscriptionLaunchView(BaseModel):
    status: str = "not_recorded"
    readinessStatus: str = "missing_evidence"
    latestEventType: str | None = None
    latestEventAt: datetime | None = None
    approvalBinding: dict[str, Any] = Field(default_factory=dict)
    lifecycleSummary: dict[str, Any] = Field(default_factory=dict)
    workspaceSummary: dict[str, Any] = Field(default_factory=dict)
    outputArtifactReferences: list[dict[str, Any]] = Field(default_factory=list)
    verificationEvidence: dict[str, Any] = Field(default_factory=dict)
    safetyFlags: dict[str, bool] = Field(default_factory=dict)
    cancellationTimeoutRollbackEvidence: dict[str, Any] = Field(default_factory=dict)
    relatedReports: list[str] = Field(default_factory=list)
    rawOutputStored: bool = False


class RuntimeEvidenceExportView(BaseModel):
    exportId: str
    format: str
    version: str
    generatedAt: datetime
    workItem: WorkItemView
    executionAttempts: list[ExecutionAttemptView]
    workflowEvents: list[WorkflowEventView]
    boundary: RuntimeEvidenceExportBoundaryView
    safety: RuntimeEvidenceExportSafetyView
    reviewManifest: RuntimeEvidenceReviewManifestView
    reviewNavigator: list[RuntimeEvidenceReviewNavigatorItemView] = Field(default_factory=list)
    subscriptionLaunch: RuntimeEvidenceSubscriptionLaunchView = Field(default_factory=RuntimeEvidenceSubscriptionLaunchView)


class WorkItemAssignmentRequest(BaseModel):
    assigneeId: str | None = None
    assigneeLabel: str | None = None
    actorId: str | None = None
    actorLabel: str | None = None


class WorkItemEscalationRequest(BaseModel):
    reason: str | None = None
    clear: bool = False
    actorId: str | None = None
    actorLabel: str | None = None


class WorkItemFilterView(BaseModel):
    query: str = ""
    risk: str = "all"
    audit: str = "all"
    source: str = "all"
    origin: str = "all"
    issues: str = "all"


class OperatorViewCreate(BaseModel):
    name: str
    scope: WorkItemFilterScope
    filters: WorkItemFilterView


class OperatorViewDefaultRequest(BaseModel):
    isDefault: bool


class OperatorViewResponse(BaseModel):
    id: str
    name: str
    scope: WorkItemFilterScope
    filters: WorkItemFilterView
    isDefault: bool
    createdAt: datetime
    updatedAt: datetime


class ManagerAuthoritativeBacklogReconciliationCounts(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    totalItems: int = Field(ge=0)
    reconciledItems: int = Field(ge=0)
    eligible: int = Field(ge=0)
    queued: int = Field(ge=0)
    leased: int = Field(ge=0)
    running: int = Field(ge=0)
    reviewFix: int = Field(ge=0)
    requiredRetrospective: int = Field(ge=0)
    otherwiseRequired: int = Field(ge=0)
    completed: int = Field(ge=0)
    closed: int = Field(ge=0)
    approvalGated: int = Field(ge=0)


class ManagerUnresolvedApprovalGatedWork(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    workId: str = Field(max_length=140)
    title: str = Field(max_length=180)
    reason: str = Field(max_length=240)
    sourceRefs: list[str] = Field(min_length=1, max_length=8)
    evidenceRefs: list[str] = Field(min_length=1, max_length=8)

    @field_validator("workId", "title", "reason")
    @classmethod
    def _scalar_metadata_must_be_safe(cls, value: str, info) -> str:
        return _validate_authoritative_metadata_text(value, path=info.field_name)

    @field_validator("sourceRefs", "evidenceRefs")
    @classmethod
    def _refs_must_be_safe(cls, values: list[str], info) -> list[str]:
        safe = [
            _validate_authoritative_metadata_text(value, path=f"{info.field_name}[]")
            for value in values
        ]
        if any(not _is_safe_pipeline_evidence_ref(value) for value in safe):
            raise ValueError(f"{info.field_name} contains an unsafe metadata reference.")
        if len(set(safe)) != len(safe):
            raise ValueError(f"{info.field_name} must not contain duplicate references.")
        return safe


class ManagerTerminalEventRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    eventId: str = Field(max_length=120)
    eventType: Literal["authoritative_backlog_exhausted"]
    runId: str = Field(max_length=120)
    sourceIdentity: str = Field(max_length=240)
    sourceRevision: str = Field(max_length=160)
    reconciliationCounts: ManagerAuthoritativeBacklogReconciliationCounts
    unresolvedApprovalGatedWork: list[ManagerUnresolvedApprovalGatedWork] = Field(max_length=24)
    evidenceRefs: list[str] = Field(min_length=1, max_length=12)
    resumeRequirement: str = Field(max_length=360)
    nextManagerAction: str = Field(max_length=360)
    idempotencyKey: str = Field(max_length=180)
    metadataOnly: Literal[True]
    rawPayloadRetained: Literal[False]

    @field_validator("eventId", "runId", "sourceIdentity", "sourceRevision", "idempotencyKey")
    @classmethod
    def _identity_metadata_must_be_safe(cls, value: str, info) -> str:
        return _validate_authoritative_metadata_text(value, path=info.field_name)

    @field_validator("resumeRequirement", "nextManagerAction")
    @classmethod
    def _control_text_must_be_safe(cls, value: str, info) -> str:
        text = _validate_authoritative_metadata_text(value, path=info.field_name)
        shell_prefix = re.search(r"\b(?:curl|bash|sh|python|node|pnpm)\s+|\buv\s+run\b", text, re.IGNORECASE)
        if not _is_safe_pipeline_control_text(text) or shell_prefix:
            raise ValueError(f"{info.field_name} contains unsafe or executable control text.")
        return text

    @field_validator("evidenceRefs")
    @classmethod
    def _evidence_refs_must_be_safe(cls, values: list[str]) -> list[str]:
        safe = [
            _validate_authoritative_metadata_text(value, path="evidenceRefs[]")
            for value in values
        ]
        if any(not _is_safe_pipeline_evidence_ref(value) for value in safe):
            raise ValueError("evidenceRefs contains an unsafe metadata reference.")
        if len(set(safe)) != len(safe):
            raise ValueError("evidenceRefs must not contain duplicate references.")
        return safe

    @model_validator(mode="after")
    def _must_describe_exact_exhaustion(self) -> "ManagerTerminalEventRequest":
        counts = self.reconciliationCounts
        status_total = sum(
            getattr(counts, field)
            for field in (
                "eligible",
                "queued",
                "leased",
                "running",
                "reviewFix",
                "requiredRetrospective",
                "otherwiseRequired",
                "completed",
                "closed",
                "approvalGated",
            )
        )
        if counts.totalItems != counts.reconciledItems or counts.totalItems != status_total:
            raise ValueError("Reconciliation totals must equal reconciledItems and the exact status-count sum.")
        if any(
            getattr(counts, field) != 0
            for field in (
                "eligible",
                "queued",
                "leased",
                "running",
                "reviewFix",
                "requiredRetrospective",
                "otherwiseRequired",
            )
        ):
            raise ValueError("authoritative_backlog_exhausted cannot retain required executable work.")
        if counts.approvalGated != len(self.unresolvedApprovalGatedWork):
            raise ValueError("approvalGated must equal the unresolvedApprovalGatedWork count.")
        work_ids = [item.workId for item in self.unresolvedApprovalGatedWork]
        if len(set(work_ids)) != len(work_ids):
            raise ValueError("unresolvedApprovalGatedWork must not contain duplicate workId values.")
        return self


class ManagerTerminalEventView(ManagerTerminalEventRequest):
    createdAt: datetime
