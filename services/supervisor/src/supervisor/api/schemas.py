import hashlib
import json
import re
import types
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Annotated, Any, Literal, Union, get_args, get_origin

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


def _strict_contract_payload(value: Any, model: type[BaseModel], *, path: str) -> None:
    """Reject unknown keys and primitive coercions at a response boundary."""

    if isinstance(value, BaseModel):
        value = value.model_dump()
    if not isinstance(value, dict):
        return
    fields = model.model_fields
    unknown = set(value) - set(fields)
    if unknown:
        raise ValueError(f"{path} contains unknown fields: {sorted(unknown)}")
    primitive_types = (str, int, float, bool)
    for name, field in fields.items():
        if name not in value or value[name] is None:
            continue
        annotation = field.annotation
        origin = get_origin(annotation)
        candidates = get_args(annotation)
        if annotation in primitive_types:
            scalar_types = (annotation,)
        elif origin in (Union, types.UnionType) and all(item in primitive_types or item is type(None) for item in candidates):
            scalar_types = tuple(item for item in candidates if item in primitive_types)
        else:
            scalar_types = ()
        if scalar_types and type(value[name]) not in scalar_types:
            raise ValueError(f"{path}.{name} must use a strict scalar value")
        nested_model = (
            annotation
            if isinstance(annotation, type) and issubclass(annotation, BaseModel)
            else next((item for item in candidates if isinstance(item, type) and issubclass(item, BaseModel)), None)
        )
        if nested_model is not None:
            if origin in (list, tuple, set):
                for index, item in enumerate(value[name]):
                    _strict_contract_payload(item, nested_model, path=f"{path}.{name}[{index}]")
            else:
                _strict_contract_payload(value[name], nested_model, path=f"{path}.{name}")
        elif origin in (list, tuple, set) and candidates and candidates[0] in primitive_types:
            element_type = candidates[0]
            for index, item in enumerate(value[name]):
                if type(item) is not element_type:
                    raise ValueError(f"{path}.{name}[{index}] must use a strict scalar value")

UNSAFE_PIPELINE_EVIDENCE_REF_RE = re.compile(
    r"\b(raw[\s_-]*(prompts?|completions?|transcripts?)|reasoning[\s_-]*traces?|provider[\s_-]*payloads?|secrets?([\s_-]*(key|token|value|id))?|credentials?([\s_-]*(key|token|value|id))?|(terminal|tmux|pane)[\s_-]*(scrollbacks?|texts?|outputs?|stdouts?|stderrs?))\b",
    re.IGNORECASE,
)
UNSAFE_AUTHORITATIVE_METADATA_TEXT_RE = re.compile(
    r"(?:\b(?:raw[\s_-]*(?:prompts?|completions?|transcripts?)|reasoning[\s_-]*traces?|secrets?|credentials?|passwords?)\b|raw[\s_-]*provider[\s_-]*payloads?|provider\s*[:=]|(?:api|access|refresh)[\s_-]*tokens?|api[\s_-]*keys?|authorization\s*:\s*bearer|(?:request|response)[\s_-]*ids?)",
    re.IGNORECASE,
)
REVIEW_ROUTE_EVIDENCE_REF_RE = re.compile(r"^review-evidence:sha256:[a-f0-9]{64}$")
REVIEW_ROUTE_PACKET_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$")
MANAGER_SOURCE_PACKET_ID_RE = re.compile(r"^manager-source-[a-f0-9]{40}$")
UNAVAILABLE_PIPELINE_PROJECTION_PACKET_ID_RE = re.compile(r"^unavailable:packet:[a-f0-9]{64}$")
REVIEW_ROUTE_TEXT_BY_REASON_CODE = {
    "report_only": (
        "A bounded report-only review is available.",
        "Re-evaluate bounded review evidence before any later promotion.",
    ),
    "simulated_completed": (
        "Simulation preparation is recorded without an execution action.",
        "Re-evaluate bounded review evidence before any later promotion.",
    ),
    "immutable_identity_stale": (
        "The reviewed exact identity no longer matches the current packet.",
        "Re-evaluate and reissue bounded review evidence for the current exact identity.",
    ),
    "policy_vetoed": (
        "A policy decision blocks this review preparation.",
        "Resolve the policy decision and re-evaluate bounded review evidence.",
    ),
    "review_blocked": (
        "A bounded review preparation is blocked.",
        "Resolve the recorded block and re-evaluate bounded review evidence.",
    ),
    "issuance_expired": (
        "Review evidence issuance has expired.",
        "Reissue bounded review evidence before relying on it.",
    ),
    "issuance_revoked": (
        "Review evidence issuance has been revoked.",
        "Resolve the policy block and re-evaluate bounded review evidence.",
    ),
    "issuance_cancelled": (
        "Review evidence issuance was cancelled.",
        "Re-evaluate before issuing new bounded review evidence.",
    ),
    "review_evidence_unavailable": (
        "Review evidence unavailable.",
        "Re-evaluate and reissue bounded review evidence before relying on it.",
    ),
}
REVIEW_ROUTE_COMPATIBILITY_BY_REASON_CODE = {
    "report_only": ("available", frozenset({"report_only"}), "current", "active"),
    "simulated_completed": ("available", frozenset({"simulated"}), "current", "active"),
    "immutable_identity_stale": ("stale", frozenset({"report_only", "simulated", "blocked"}), "changed", "active"),
    "policy_vetoed": ("unavailable", frozenset({"blocked"}), "current", "active"),
    "review_blocked": ("unavailable", frozenset({"blocked"}), "current", "active"),
    "issuance_expired": ("unavailable", frozenset({"blocked"}), "current", "expired"),
    "issuance_revoked": ("unavailable", frozenset({"blocked"}), "current", "revoked"),
    "issuance_cancelled": ("unavailable", frozenset({"blocked"}), "current", "cancelled"),
    "review_evidence_unavailable": ("unavailable", frozenset({"unavailable"}), "unavailable", "unavailable"),
}
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
EPIC_25_EXECUTABLE_POLICY_TEXT_RE = re.compile(
    r"(?<![A-Za-z0-9_])(?:tmux\s+(?:kill|send|capture|new|attach)\b|git(?:hub)?(?:\s+\S+){0,4}\s+(?:add|branch|checkout|cherry-pick|clean|commit|merge|pr|push|rebase|reset|restore|revert|switch|tag)\b|gh\s+(?:pr|repo|api)\b|curl(?:\s|$)|bash(?:\s|$)|sh(?:\s|$)|python(?:3(?:\.\d+)?)?(?:\s|$)|node(?:\s|$)|npm\s+run(?:\s|$)|pnpm(?:\s|$)|uv\s+run(?:\s|$)|provider\s+(?:call|request|payload)\b)",
    re.IGNORECASE,
)
PIPELINE_METADATA_CONTROL_CHARACTER_RE = re.compile(r"[\x00-\x1f\x7f]")
EPIC_25_EVIDENCE_REF_RE = re.compile(
    r"^(?:manager-cycle|preflight|usage|resources|operational-action|verification|evidence|story|assignment|task|source|prd|check|checkpoint|command|test|artifact):[A-Za-z0-9._/@:-]{1,160}$"
)
PEM_OR_HIGH_ENTROPY_SECRET_RE = re.compile(
    r"-----BEGIN [A-Z0-9 ]+PRIVATE KEY-----|(?<![A-Za-z0-9])[A-Za-z0-9+/]{48,}={0,2}(?![A-Za-z0-9])",
    re.IGNORECASE,
)
LANE_CLARITY_UNSAFE_TEXT_RE = re.compile(
    r"\b(?:raw[_-]?payload|provider[_-]?payload|secret|token|credential|password|api[_-]?key|private[_-]?key)\b|\bbearer\s+|\bsk-[A-Za-z0-9_-]{8,}|-----BEGIN [A-Z ]*PRIVATE KEY-----",
    re.IGNORECASE,
)


def _is_safe_pipeline_evidence_ref(value: str) -> bool:
    ref = value.strip()
    manager_source_id = bool(MANAGER_SOURCE_PACKET_ID_RE.fullmatch(ref))
    return (
        bool(ref)
        and ref == value
        and len(ref) <= 255
        and not UNSAFE_PIPELINE_EVIDENCE_REF_RE.search(ref)
        and (manager_source_id or not TOKEN_LIKE_METADATA_VALUE_RE.search(ref))
    )


def _is_safe_review_route_evidence_ref(value: str) -> bool:
    """Allow only opaque, non-provider review evidence references in this projection."""
    return bool(REVIEW_ROUTE_EVIDENCE_REF_RE.fullmatch(value))


def _is_safe_review_route_packet_id(value: str) -> bool:
    """Require a compact opaque packet identity before it enters review evidence."""
    ref = value.strip()
    manager_source_id = bool(MANAGER_SOURCE_PACKET_ID_RE.fullmatch(ref))
    return (
        ref == value
        and bool(REVIEW_ROUTE_PACKET_ID_RE.fullmatch(ref))
        and not ref.lower().startswith("unavailable:packet:")
        and not UNAVAILABLE_PIPELINE_PROJECTION_PACKET_ID_RE.fullmatch(ref)
        and not UNSAFE_PIPELINE_EVIDENCE_REF_RE.search(ref)
        # The generic token heuristic sees ``source-<hex>`` as token-like.
        # The private manager-source intake verifies actor and packet binding
        # before it persists review evidence. Projection fallbacks retain this
        # exact opaque identity without adding route or execution authority.
        and (manager_source_id or not TOKEN_LIKE_METADATA_VALUE_RE.search(ref))
        and not PEM_OR_HIGH_ENTROPY_SECRET_RE.search(ref)
        and not re.search(r"(?:prompt|completion|transcript|reasoning|provider|secret|credential|token)", ref, re.IGNORECASE)
    )


def _is_safe_pipeline_projection_packet_id(value: str) -> bool:
    """Allow the output-only unavailable identity in otherwise strict detail views."""
    return bool(UNAVAILABLE_PIPELINE_PROJECTION_PACKET_ID_RE.fullmatch(value)) or _is_safe_review_route_packet_id(value)


def _is_safe_pipeline_control_text(value: str) -> bool:
    text = value.strip()
    return (
        text == value
        and bool(text)
        and len(text) <= 500
        and not PIPELINE_METADATA_CONTROL_CHARACTER_RE.search(text)
        and not UNSAFE_PIPELINE_EVIDENCE_REF_RE.search(text)
    )


def _is_safe_lane_clarity_text(value: str) -> bool:
    return (
        _is_safe_pipeline_control_text(value)
        and not LANE_CLARITY_UNSAFE_TEXT_RE.search(value)
        and not TOKEN_LIKE_METADATA_VALUE_RE.search(value)
        and not PEM_OR_HIGH_ENTROPY_SECRET_RE.search(value)
    )


def _is_safe_epic_25_evidence_ref(value: str) -> bool:
    ref = value.strip()
    return (
        ref == value
        and bool(EPIC_25_EVIDENCE_REF_RE.fullmatch(ref))
        and not TOKEN_LIKE_METADATA_VALUE_RE.search(ref)
        and not PEM_OR_HIGH_ENTROPY_SECRET_RE.search(ref)
        and _is_safe_pipeline_evidence_ref(ref)
        and _is_safe_pipeline_control_text(ref)
    )


def _is_safe_epic_25_policy_text(value: str) -> bool:
    return (
        _is_safe_pipeline_control_text(value)
        and not EPIC_25_EXECUTABLE_POLICY_TEXT_RE.search(value)
        and not TOKEN_LIKE_METADATA_VALUE_RE.search(value)
        and not PEM_OR_HIGH_ENTROPY_SECRET_RE.search(value)
    )


def _canonical_utc(value: datetime, *, label: str) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{label} must include an RFC3339 timezone.")
    return value.astimezone(timezone.utc)


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
    model_config = ConfigDict(extra="forbid")

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
    model_config = ConfigDict(extra="forbid")

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

    @model_validator(mode="before")
    @classmethod
    def _candidate_work_result_must_be_strict(cls, value):
        _strict_contract_payload(value, cls, path="candidateWork")
        return value


class CandidateWorkListApiEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    data: list[CandidateWorkView]
    meta: dict[str, Any] | None = None


class CandidateWorkApiEnvelope(BaseModel):
    """Typed response boundary for supervisor-owned candidate-work creation."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: CandidateWorkView
    meta: dict[str, Any] | None = None


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
    model_config = ConfigDict(extra="forbid")

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
    model_config = ConfigDict(extra="forbid")

    id: str
    label: str
    requiredBefore: str
    summary: str
    evidence: list[str]


class WorkItemRemoteAutomationPolicyView(BaseModel):
    model_config = ConfigDict(extra="forbid")

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


class WorkItemRecipeGateAuditApiEnvelope(BaseModel):
    """Typed response boundary for supervisor-owned recipe gate audits."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: WorkItemRecipeGateAuditView
    meta: dict[str, Any] | None = None


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
    sourceVm: str | None = None
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
    expectedAttemptId: str | None = None
    expectedAttemptStatus: ExecutionAttemptStatus | None = None
    expectedAttemptRevision: int | None = Field(default=None, ge=1)
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
    expectedStatus: ExecutionAttemptStatus | None = None
    expectedRevision: int | None = Field(default=None, ge=1)
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
    revision: int
    launchFenceState: Literal["not_applicable", "reserved", "claimed"]
    launchClaimedAt: datetime | None = None
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


class ExecutionAttemptApiEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    data: list[ExecutionAttemptView]
    meta: dict[str, Any] | None = None


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


class RoutingPreviewApiEnvelope(BaseModel):
    """Typed response boundary for supervisor-owned routing previews."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: RoutingPreviewView
    meta: dict[str, Any] | None = None


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


class TaskPacketPreviewApiEnvelope(BaseModel):
    """Typed response boundary for supervisor-owned task packet previews."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: TaskPacketPreviewView
    meta: dict[str, Any] | None = None


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


class MemoryInboxShellStatusV1(BaseModel):
    """Content-free shell status; lifecycle projection is introduced later."""

    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["kendall-memory-inbox-shell/v1"]
    state: Literal["unavailable"]
    freshness: Literal["current", "stale", "unavailable"]
    nextSafeAction: Literal["refresh_memory_inbox"]


class MemoryInboxShellApiEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    data: MemoryInboxShellStatusV1
    meta: dict[str, Any] | None = None


class MemoryInboxLifecycleCommandRequest(BaseModel):
    """A narrow, content-free mutation capability; identity comes from session."""

    model_config = ConfigDict(extra="forbid", strict=True)

    expectedRevision: PositiveInt
    idempotencyKey: Annotated[str, Field(pattern=r"^[A-Za-z0-9:_-]{1,160}$")]
    targetState: Literal[
        "Quarantined", "Unprocessed", "Draft", "AwaitingAuthorization", "Processing", "Review",
        "Returned", "DeniedRetained", "DeletePending", "Deleted", "RejectedUnsafe",
    ]


class MemoryInboxLifecycleCommandResultV1(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["kendall-memory-inbox-lifecycle/v1"] = "kendall-memory-inbox-lifecycle/v1"
    sourceId: str
    expectedRevision: PositiveInt
    resultingRevision: PositiveInt
    outcome: Literal["accepted", "replayed", "conflict", "rejected"]
    reasonCode: str
    lifecycleState: str | None = None


class MemoryInboxLifecycleCommandApiEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    data: MemoryInboxLifecycleCommandResultV1


class MemoryInboxProjectionRowV1(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    sourceId: str
    lifecycleState: str
    revision: PositiveInt
    retentionDeadlineAt: datetime
    deletionState: Literal["None", "Pending", "Proven", "RetryNeeded"]
    nextSafeAction: str
    proposalId: str | None = None
    proposalRevision: PositiveInt | None = None


class MemoryInboxProjectionV1(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["kendall-memory-inbox-projection/v1"] = "kendall-memory-inbox-projection/v1"
    truth: Literal["supervisor_owned"] = "supervisor_owned"
    freshness: Literal["current"] = "current"
    rows: list[MemoryInboxProjectionRowV1]
    reviewReadyCount: int
    nextSafeAction: str


class MemoryInboxProjectionApiEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    data: MemoryInboxProjectionV1


class MemoryInboxProposalReaderV1(BaseModel):
    """Content-bearing shape permitted only on the named authenticated reader route."""

    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["kendall-memory-inbox-proposal-reader/v1"] = "kendall-memory-inbox-proposal-reader/v1"
    proposalId: str
    revision: PositiveInt
    body: str


class MemoryInboxProposalReaderApiEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    data: MemoryInboxProposalReaderV1


class MemoryInboxReviewDecisionRequest(BaseModel):
    """The optional return context is transient and intentionally not persisted."""

    model_config = ConfigDict(extra="forbid", strict=True)

    expectedRevision: PositiveInt
    idempotencyKey: Annotated[str, Field(min_length=16, max_length=160, pattern=r"^[A-Za-z0-9:_-]+$")]
    returnContext: Annotated[str, Field(min_length=1, max_length=2_000)] | None = None


class MemoryInboxReviewDecisionResultV1(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["kendall-memory-inbox-review-decision/v1"] = "kendall-memory-inbox-review-decision/v1"
    proposalId: str
    proposalRevision: PositiveInt
    sourceId: str
    sourceRevision: PositiveInt
    lifecycleState: Literal["Returned", "Denied"]
    replayed: bool
    nextSafeAction: Literal["create_draft", "review_retention"]


class MemoryInboxReviewDecisionApiEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    data: MemoryInboxReviewDecisionResultV1


class MemoryInboxApprovalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    expectedRevision: PositiveInt
    idempotencyKey: Annotated[str, Field(min_length=16, max_length=160, pattern=r"^[A-Za-z0-9:_-]+$")]


class MemoryInboxApprovalResultV1(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["kendall-memory-inbox-approval/v1"] = "kendall-memory-inbox-approval/v1"
    proposalId: str
    proposalRevision: PositiveInt
    sourceId: str
    sourceRevision: PositiveInt
    deletionOperations: int
    replayed: bool
    lifecycleState: Literal["Approved"] = "Approved"
    deletionState: Literal["Pending"] = "Pending"
    nextSafeAction: Literal["await_deletion_proof"] = "await_deletion_proof"


class MemoryInboxApprovalApiEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    data: MemoryInboxApprovalResultV1


class MemoryInboxSourceDeletionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    expectedRevision: PositiveInt
    idempotencyKey: Annotated[str, Field(min_length=16, max_length=160, pattern=r"^[A-Za-z0-9:_-]+$")]


class MemoryInboxSourceDeletionResultV1(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["kendall-memory-inbox-source-deletion/v1"] = "kendall-memory-inbox-source-deletion/v1"
    sourceId: str
    sourceRevision: PositiveInt
    deletionOperations: int
    initiator: Literal["operator", "retention_expiry", "retry"]
    replayed: bool
    lifecycleState: Literal["DeletePending"] = "DeletePending"
    deletionState: Literal["Pending", "RetryNeeded"]
    nextSafeAction: Literal["await_deletion_proof", "retry_deletion"]


class MemoryInboxSourceDeletionApiEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    data: MemoryInboxSourceDeletionResultV1


class MemoryInboxRetentionExtensionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    expectedRevision: PositiveInt
    extensionHours: int = Field(ge=1, le=8760)
    idempotencyKey: Annotated[str, Field(min_length=16, max_length=160, pattern=r"^[A-Za-z0-9:_-]+$")]


class MemoryInboxRetentionExtensionResultV1(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["kendall-memory-inbox-retention-extension/v1"] = "kendall-memory-inbox-retention-extension/v1"
    sourceId: str
    sourceRevision: PositiveInt
    retentionDeadlineAt: datetime
    replayed: bool
    nextSafeAction: Literal["refresh_memory_inbox"] = "refresh_memory_inbox"


class MemoryInboxRetentionExtensionApiEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    data: MemoryInboxRetentionExtensionResultV1


class MemoryInboxDeletionReceiptV1(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["kendall-memory-inbox-deletion-receipt/v1"] = "kendall-memory-inbox-deletion-receipt/v1"
    sourceId: str
    outcome: Literal["deletion_pending", "deletion_retry_needed", "deleted_after_approval", "deleted_by_operator", "deleted_on_retention_expiry"]
    proofCount: int = Field(ge=0)
    summary: Literal["Kendall copy deletion is pending proof.", "Kendall copy deletion needs a recorded proof.", "Kendall copies deleted"]
    nextSafeAction: Literal["await_deletion_proof", "retry_deletion", "none"]


class MemoryInboxDeletionReceiptApiEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    data: MemoryInboxDeletionReceiptV1


class MemoryInboxTextCaptureRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    text: Annotated[str, Field(min_length=1, max_length=32_000)]
    acknowledgedNonSensitive: Literal[True]
    idempotencyKey: Annotated[str, Field(min_length=16, max_length=160, pattern=r"^[A-Za-z0-9:_-]+$")]


class MemoryInboxTextCaptureResultV1(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["kendall-memory-inbox-capture/v1"] = "kendall-memory-inbox-capture/v1"
    sourceId: str
    lifecycleState: Literal["Unprocessed"] = "Unprocessed"
    nextSafeAction: Literal["create_draft"] = "create_draft"


class MemoryInboxTextCaptureApiEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    data: MemoryInboxTextCaptureResultV1


class MemoryInboxCostPolicyUpdateRequest(BaseModel):
    """A content-free, explicitly acknowledged Inbox-only policy change."""

    model_config = ConfigDict(extra="forbid", strict=True)

    finiteLimit: Decimal | None
    unlimitedAcknowledged: bool = False
    idempotencyKey: Annotated[str, Field(min_length=16, max_length=160, pattern=r"^[A-Za-z0-9:_-]+$")]


class MemoryInboxProcessingDisclosureRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    expectedRevision: PositiveInt
    idempotencyKey: Annotated[str, Field(min_length=16, max_length=160, pattern=r"^[A-Za-z0-9:_-]+$")]


class MemoryInboxProcessingDisclosureV1(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["kendall-memory-inbox-disclosure/v1"]
    disclosureId: str
    receiptRef: str
    sourceRevision: PositiveInt
    policyRevision: PositiveInt
    providerOrder: list[Literal["local", "openai", "anthropic"]]
    retentionDeadlineAt: datetime
    noWriteGuarantee: Literal[True]
    providerActivation: Literal["disabled_by_default"]
    lifecycleState: Literal["Presented", "Accepted", "Invalidated"]
    replayed: bool
    nextSafeAction: Literal["dispatch_unavailable"]


class MemoryInboxProcessingDisclosureApiEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    data: MemoryInboxProcessingDisclosureV1


class MemoryInboxDispatchClaimV1(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["kendall-memory-inbox-dispatch-claim/v1"]
    attemptId: str
    lifecycleState: Literal["Planned", "Claimed", "Dispatched", "CompletionUnknown", "Reconciled", "Cancelled", "Closed"]
    replayed: bool
    nextSafeAction: Literal["reserve_cost", "resolve_completion_unknown", "review", "refresh_memory_inbox"]


class MemoryInboxDispatchClaimApiEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    data: MemoryInboxDispatchClaimV1


class MemoryInboxCompletionUnknownResolutionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    resolution: Literal["reconciled", "released"]


class MemoryInboxCompletionUnknownResolutionV1(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["kendall-memory-inbox-completion-resolution/v1"]
    attemptId: str
    lifecycleState: Literal["Reconciled", "Cancelled"]
    nextSafeAction: Literal["refresh_memory_inbox"]


class MemoryInboxCompletionUnknownResolutionApiEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    data: MemoryInboxCompletionUnknownResolutionV1


class MemoryInboxCostPolicyProviderV1(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    provider: Literal["local", "openai", "anthropic"]
    availability: Literal["disabled"]


class MemoryInboxCostPolicyV1(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["kendall-memory-inbox-provider-policy/v1"]
    policyRevision: PositiveInt
    currency: Literal["USD"]
    measuredSpend: str
    reservedSpend: str
    finiteLimit: str | None
    remaining: str | None
    resetTimezone: str
    mode: Literal["finite", "unlimited"]
    providerOrder: list[MemoryInboxCostPolicyProviderV1]
    updatedAt: datetime
    actorRef: str
    providerActivation: Literal["disabled_by_default"]


class MemoryInboxCostPolicyApiEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    data: MemoryInboxCostPolicyV1


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

    expectedRevision: PositiveInt
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

    expectedRevision: PositiveInt
    actorId: str | None = None
    actorLabel: str | None = None


class LlmWikiDisposableRebuildWriteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expectedRevision: PositiveInt
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


class LlmWikiArtifactApiEnvelope(BaseModel):
    """Typed response boundary for supervisor-owned LLM wiki artifact reads."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: LlmWikiArtifactSearchResultView
    meta: dict[str, str | int | float | bool | None] | None = None


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


# This is intentionally work-item scoped rather than a projection of the
# retired WorkPacketV0 aggregate.  The dashboard memory-review UI needs only
# persisted proposal metadata and its derived, no-write LLM-Wiki readiness.
class WorkItemMemoryReviewProposalV1View(BaseModel):
    # `proposalRouteId` is the persisted opaque row identifier. It is the
    # only proposal value that the dashboard puts in a path segment, so legacy
    # proposal labels/IDs cannot alter route parsing.
    proposalRouteId: str
    proposalId: str
    revision: PositiveInt
    label: str
    status: MemoryProposalStatusV0
    summary: str
    # Persisted rows predate the write-time reference requirement. The
    # read-only review surfaces them as blocked instead of losing the entire
    # WorkItem response; write schemas continue to require references.
    sourceRefs: list[str] = Field(default_factory=list)
    evidenceRefs: list[str] = Field(default_factory=list)
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
    aiDraftEligible: bool = False


class WorkItemMemoryReviewLlmWikiPreviewV1View(BaseModel):
    previewId: str
    inputRefs: list[str] = Field(default_factory=list)
    memoryProposalRefs: list[str] = Field(default_factory=list)
    plannedOutputScope: str
    retentionClass: Literal["metadata_only"] = "metadata_only"
    stopLine: str


class WorkItemMemoryReviewLlmWikiDryRunV1View(BaseModel):
    planId: str
    inputRefs: list[str] = Field(default_factory=list)
    plannedDerivedSections: list[str] = Field(default_factory=list)
    disposableTargetNamespace: str
    retentionClass: Literal["metadata_only"] = "metadata_only"
    stopLines: list[str] = Field(default_factory=list)
    discardRecoveryPath: str
    writePerformed: Literal[False] = False


class WorkItemMemoryReviewLlmWikiReadinessV1View(BaseModel):
    decisionState: Literal["ready", "blocked", "not_configured"]
    canonicality: Literal["derived_disposable_rebuildable"] = "derived_disposable_rebuildable"
    allowedInputs: list[str] = Field(default_factory=list)
    blockedReasons: list[str] = Field(default_factory=list)
    nextActions: list[str] = Field(default_factory=list)
    boundarySummary: str
    rebuildPreview: WorkItemMemoryReviewLlmWikiPreviewV1View | None = None
    rebuildDryRunPlan: WorkItemMemoryReviewLlmWikiDryRunV1View | None = None
    durableWriteAllowed: Literal[False] = False


class WorkItemMemoryReviewV1View(BaseModel):
    schemaVersion: Literal["work-item-memory-review/v1"] = "work-item-memory-review/v1"
    workItemId: str
    authoritativePacketId: str | None = None
    proposals: list[WorkItemMemoryReviewProposalV1View] = Field(default_factory=list)
    llmWikiReadiness: WorkItemMemoryReviewLlmWikiReadinessV1View | None = None
    metadataOnly: Literal[True] = True
    rawPayloadRetained: Literal[False] = False
    canonicalMutationAllowed: Literal[False] = False
    sourceMutationAllowed: Literal[False] = False


class WorkItemMemoryReviewApiEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    data: WorkItemMemoryReviewV1View
    meta: dict[str, Any] | None = None


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


class PipelineAuthorityProhibitionsV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sourceMutationAllowed: Literal[False] = False
    providerCallsAllowed: Literal[False] = False
    workerLaunchAllowed: Literal[False] = False
    githubMutationAllowed: Literal[False] = False
    rawPayloadRetentionAllowed: Literal[False] = False


class PipelineCanonicalSourceProvenanceV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sourceRef: "AuthoritativePacketSourceRefView"
    observedAt: datetime
    evidenceRefs: list[str] = Field(default_factory=list, max_length=25)

    @field_validator("evidenceRefs")
    @classmethod
    def _evidence_refs_must_be_metadata_only(cls, value: list[str]) -> list[str]:
        if not all(_is_safe_pipeline_evidence_ref(ref) for ref in value):
            raise ValueError("Canonical provenance evidence refs must be safe metadata-only references.")
        return list(dict.fromkeys(ref.strip() for ref in value))


class PipelineCanonicalSourceV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sourceId: str = Field(min_length=1, max_length=240)
    role: Literal["canonical", "supporting", "derived"]
    trust: Literal["authoritative", "attested", "derived", "untrusted"]
    provenance: PipelineCanonicalSourceProvenanceV0View
    authority: PipelineAuthorityProhibitionsV0View = Field(default_factory=PipelineAuthorityProhibitionsV0View)
    metadataOnly: Literal[True] = True
    rawPayloadRetained: Literal[False] = False

    @model_validator(mode="after")
    def _role_and_trust_must_agree(self):
        if self.role == "canonical" and self.trust not in {"authoritative", "attested"}:
            raise ValueError("Canonical sources must be authoritative or attested.")
        if self.role == "derived" and self.trust != "derived":
            raise ValueError("Derived sources must remain typed as derived trust.")
        return self


class PipelineEvidenceRetentionV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    evidenceId: str = Field(min_length=1, max_length=240)
    disposition: Literal["metadata_only", "summary_only", "fixture_only"]
    evidenceRefs: list[str] = Field(default_factory=list, max_length=25)
    metadataOnly: Literal[True] = True
    rawPayloadRetained: Literal[False] = False

    @field_validator("evidenceRefs")
    @classmethod
    def _evidence_refs_must_be_metadata_only(cls, value: list[str]) -> list[str]:
        if not all(_is_safe_pipeline_evidence_ref(ref) for ref in value):
            raise ValueError("Retention evidence refs must be safe metadata-only references.")
        return list(dict.fromkeys(ref.strip() for ref in value))


class PipelineQualityGateV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["gate"]
    gateId: str = Field(min_length=1, max_length=240)
    requirement: Literal["required", "not_applicable"]
    state: Literal["pass", "fail", "blocked", "not_applicable"]
    notApplicableReason: str | None = Field(default=None, min_length=1, max_length=240)
    evidenceRefs: list[str] = Field(default_factory=list, max_length=25)

    @model_validator(mode="after")
    def _gate_semantics_must_agree(self):
        if self.requirement == "required" and self.state == "not_applicable":
            raise ValueError("Required quality gates cannot be skipped.")
        if self.requirement == "not_applicable" and (
            self.state != "not_applicable" or not self.notApplicableReason
        ):
            raise ValueError("Not-applicable quality gates require a reason.")
        if self.requirement == "required" and self.notApplicableReason is not None:
            raise ValueError("Required quality gates cannot carry a skip reason.")
        return self

    @field_validator("evidenceRefs")
    @classmethod
    def _evidence_refs_must_be_metadata_only(cls, value: list[str]) -> list[str]:
        if not all(_is_safe_pipeline_evidence_ref(ref) for ref in value):
            raise ValueError("Quality gate evidence refs must be safe metadata-only references.")
        return list(dict.fromkeys(ref.strip() for ref in value))

    @model_serializer(mode="wrap")
    def _omit_unset_not_applicable_reason(self, handler):
        serialized = handler(self)
        if self.notApplicableReason is None:
            serialized.pop("notApplicableReason", None)
        return serialized


class PipelineQualityGateGroupV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["all_of", "any_of"]
    gateId: str = Field(min_length=1, max_length=240)
    children: list["PipelineQualityGateNodeV0View"] = Field(min_length=1, max_length=32)


PipelineQualityGateNodeV0View = PipelineQualityGateV0View | PipelineQualityGateGroupV0View
PIPELINE_QUALITY_GATE_MAX_DEPTH = 8


def _validate_pipeline_quality_gate_depth(node: PipelineQualityGateNodeV0View, depth: int = 0) -> None:
    if depth > PIPELINE_QUALITY_GATE_MAX_DEPTH:
        raise ValueError("Composable quality gates may not exceed eight nested groups.")
    if isinstance(node, PipelineQualityGateGroupV0View):
        for child in node.children:
            _validate_pipeline_quality_gate_depth(child, depth + 1)


class PipelineReadinessComponentV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    componentId: Literal[
        "source_provenance",
        "trust_boundary",
        "authority_boundary",
        "evidence_retention",
        "quality_gates",
        "delivery_evidence",
    ]
    requirement: Literal["required", "not_applicable"]
    state: Literal["pass", "fail", "blocked", "not_applicable"]
    notApplicableReason: str | None = Field(default=None, min_length=1, max_length=240)
    evidenceRefs: list[str] = Field(default_factory=list, max_length=25)

    @model_validator(mode="after")
    def _readiness_semantics_must_agree(self):
        if self.requirement == "required" and self.state == "not_applicable":
            raise ValueError("Required readiness components cannot be skipped.")
        if self.requirement == "not_applicable" and (
            self.state != "not_applicable" or not self.notApplicableReason
        ):
            raise ValueError("Not-applicable readiness components require a reason.")
        if self.requirement == "required" and self.notApplicableReason is not None:
            raise ValueError("Required readiness components cannot carry a skip reason.")
        return self

    @field_validator("evidenceRefs")
    @classmethod
    def _evidence_refs_must_be_metadata_only(cls, value: list[str]) -> list[str]:
        if not all(_is_safe_pipeline_evidence_ref(ref) for ref in value):
            raise ValueError("Readiness evidence refs must be safe metadata-only references.")
        return list(dict.fromkeys(ref.strip() for ref in value))

    @model_serializer(mode="wrap")
    def _omit_unset_not_applicable_reason(self, handler):
        serialized = handler(self)
        if self.notApplicableReason is None:
            serialized.pop("notApplicableReason", None)
        return serialized


class PipelineReadinessComponentsV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_provenance: PipelineReadinessComponentV0View
    trust_boundary: PipelineReadinessComponentV0View
    authority_boundary: PipelineReadinessComponentV0View
    evidence_retention: PipelineReadinessComponentV0View
    quality_gates: PipelineReadinessComponentV0View
    delivery_evidence: PipelineReadinessComponentV0View

    @model_validator(mode="after")
    def _component_ids_must_match_slots(self):
        for component_id in type(self).model_fields:
            if getattr(self, component_id).componentId != component_id:
                raise ValueError(f"Readiness component {component_id} must match its canonical slot.")
        return self


class PipelineNormalizedDeliveryTargetV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    repository: str = Field(min_length=1, max_length=240)
    baseBranch: str | None = Field(default=None, max_length=240)
    headRevision: str | None = Field(default=None, max_length=240)
    pullRequestUrl: str | None = Field(default=None, max_length=500)

    @field_validator("repository", "baseBranch", "headRevision", "pullRequestUrl")
    @classmethod
    def _target_strings_must_be_safe_metadata(cls, value: str | None, info) -> str | None:
        if value is None:
            return None
        return _validate_authoritative_metadata_text(value, path=f"deliveryEvidence.target.{info.field_name}")

    @model_serializer(mode="wrap")
    def _omit_unset_delivery_target_fields(self, handler):
        serialized = handler(self)
        for field_name in ("baseBranch", "headRevision", "pullRequestUrl"):
            if getattr(self, field_name) is None:
                serialized.pop(field_name, None)
        return serialized


class PipelineNormalizedDeliveryEvidenceV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    deliveryId: str = Field(min_length=1, max_length=240)
    action: Literal["branch_push", "pull_request", "merge", "cleanup"]
    status: Literal["recorded", "blocked", "not_applicable"]
    target: PipelineNormalizedDeliveryTargetV0View
    evidence: PipelineEvidenceRetentionV0View
    authority: PipelineAuthorityProhibitionsV0View = Field(default_factory=PipelineAuthorityProhibitionsV0View)
    deliveryAuthorityGranted: Literal[False] = False
    metadataOnly: Literal[True] = True
    rawPayloadRetained: Literal[False] = False


class PipelineCanonicalContractV1View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schemaVersion: Literal["pipeline-canonical-contract/v1"]
    productMode: Literal["contract_only", "operator_review", "local_proof", "read_only", "bounded_write"]
    canonicalSource: PipelineCanonicalSourceV0View
    qualityGates: PipelineQualityGateNodeV0View
    readinessComponents: PipelineReadinessComponentsV0View
    deliveryEvidence: list[PipelineNormalizedDeliveryEvidenceV0View] = Field(default_factory=list, max_length=25)
    authority: PipelineAuthorityProhibitionsV0View = Field(default_factory=PipelineAuthorityProhibitionsV0View)
    metadataOnly: Literal[True] = True
    rawPayloadRetained: Literal[False] = False

    @model_validator(mode="after")
    def _canonical_slot_must_be_canonical_and_bounded(self):
        if self.canonicalSource.role != "canonical":
            raise ValueError("canonicalSource must use the canonical role.")
        _validate_pipeline_quality_gate_depth(self.qualityGates)
        return self


class LocalDogfoodAttestationReceiptRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    receipt: dict[str, str]
    signatureB64: str = Field(min_length=1, max_length=200)


class LocalDogfoodAttestationReadbackView(BaseModel):
    """Metadata-only readback for a local dogfood authorization."""

    model_config = ConfigDict(extra="forbid", strict=True)

    authorizationId: str | None = None
    issuerId: str | None = None
    keyId: str | None = None
    receiptId: str | None = None
    receiptState: Literal["accepted", "rejected", "pending", "unavailable"]
    rejectionReason: str | None = None
    expiresAt: str | None = None
    replayState: Literal["replayed", "not_replayed", "unknown"]
    evidenceClass: Literal["integrated_local"]
    liveEvidenceAccepted: Literal[False] = False


class LocalDogfoodAttestationReadbackApiEnvelope(BaseModel):
    """Typed response boundary for local dogfood attestation readbacks."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: LocalDogfoodAttestationReadbackView
    meta: dict[str, str | int | float | bool | None] | None = None


class LocalDogfoodAttestationReceiptBindingsView(BaseModel):
    """Supervisor-minted metadata bindings for one local-only authorization."""

    model_config = ConfigDict(extra="forbid", strict=True)

    issuerId: str
    keyId: str
    environment: Literal["local_dogfood"]
    packetSchema: str
    targetRef: str
    sourceRevision: str
    sourceRefs: str
    evidenceDigest: str
    evidenceRefs: str
    runId: str
    attemptId: str
    policyVersion: str
    retentionPolicy: Literal["metadata_only"]
    observerId: str


class LocalDogfoodAuthorizationView(BaseModel):
    """Bounded authorization write result; it grants no live evidence authority."""

    model_config = ConfigDict(extra="forbid", strict=True)

    authorizationId: str
    runId: str
    attemptId: str
    expiresAt: str
    evidenceClass: Literal["integrated_local"]
    receiptBindings: LocalDogfoodAttestationReceiptBindingsView
    metadataOnly: Literal[True] = True
    rawPayloadRetained: Literal[False] = False


class LocalDogfoodAttestationDecisionView(BaseModel):
    """Receipt verification result; accepted receipts remain integrated-local only."""

    model_config = ConfigDict(extra="forbid", strict=True)

    evidenceClass: Literal["integrated_local"]
    accepted: bool
    rejectionReason: str | None = None
    issuerId: str | None = None
    keyId: str | None = None
    receiptId: str | None = None
    liveEvidenceAccepted: Literal[False] = False
    metadataOnly: Literal[True] = True
    rawPayloadRetained: Literal[False] = False

    @model_validator(mode="after")
    def _acceptance_reason_consistent(self) -> "LocalDogfoodAttestationDecisionView":
        if self.accepted != (self.rejectionReason is None):
            raise ValueError("accepted must be true exactly when rejectionReason is absent")
        return self


class LocalDogfoodAttestationRevocationView(BaseModel):
    """Revocation acknowledgement; it is metadata-only and never executes work."""

    model_config = ConfigDict(extra="forbid", strict=True)

    authorizationId: str
    revoked: Literal[True]
    evidenceClass: Literal["integrated_local"]
    metadataOnly: Literal[True] = True
    rawPayloadRetained: Literal[False] = False


class LocalDogfoodAuthorizationApiEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    data: LocalDogfoodAuthorizationView
    meta: dict[str, str | int | float | bool | None] | None = None


class LocalDogfoodAttestationDecisionApiEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    data: LocalDogfoodAttestationDecisionView
    meta: dict[str, str | int | float | bool | None] | None = None


class LocalDogfoodAttestationRevocationApiEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    data: LocalDogfoodAttestationRevocationView
    meta: dict[str, str | int | float | bool | None] | None = None


PipelineOperationalEvidenceClass = Literal["fixture", "integrated_local", "live_observed"]
PipelineEpic25EvidenceSlot = Literal["readiness", "canary", "ramp", "recovery", "hardening", "decision"]
PipelineEpic25PacketSchemaVersion = Literal[
    "pipeline-operational-readiness-contract/v0",
    "pipeline-one-worker-live-canary/v0",
    "pipeline-live-capacity-ramp/v0",
    "pipeline-resilience-recovery-validation/v0",
    "pipeline-operational-hardening-runbooks/v0",
    "pipeline-production-readiness-decision/v0",
]


class PipelineObservedEvidenceObserverV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    observerType: Literal["independent_runtime"]
    observerId: str = Field(min_length=1, max_length=200)

    @field_validator("observerId")
    @classmethod
    def _observer_id_must_be_safe(cls, value: str) -> str:
        if not _is_safe_local_proof_text(value):
            raise ValueError("Observation observerId must be safe metadata.")
        return value


class PipelineObservedEvidenceSubjectV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    packetSchemaVersion: PipelineEpic25PacketSchemaVersion
    targetRef: str = Field(min_length=1, max_length=200)

    @field_validator("targetRef")
    @classmethod
    def _target_ref_must_be_safe(cls, value: str) -> str:
        if not _is_safe_local_proof_text(value):
            raise ValueError("Observation targetRef must be safe metadata.")
        return value


class PipelineObservedEvidenceReceiptV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    receiptId: str = Field(min_length=1, max_length=200)
    observedAt: datetime
    issuedAt: datetime
    expiresAt: datetime
    evidenceDigestSha256: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    sourceRefs: list[str] = Field(min_length=1, max_length=24)
    evidenceRefs: list[str] = Field(min_length=1, max_length=24)

    @field_validator("observedAt", "issuedAt", "expiresAt")
    @classmethod
    def _receipt_timestamps_must_include_timezone(cls, value: datetime) -> datetime:
        return _canonical_utc(value, label="Observation receipt timestamp")

    @field_validator("receiptId")
    @classmethod
    def _receipt_id_must_be_safe(cls, value: str) -> str:
        if not _is_safe_local_proof_text(value):
            raise ValueError("Observation receiptId must be safe metadata.")
        return value

    @field_validator("sourceRefs", "evidenceRefs")
    @classmethod
    def _receipt_refs_must_be_safe(cls, refs: list[str]) -> list[str]:
        if len(set(refs)) != len(refs) or not all(_is_safe_epic_25_evidence_ref(ref) for ref in refs):
            raise ValueError("Observation receipt refs must be unique safe metadata refs.")
        return sorted(refs)

    @model_validator(mode="after")
    def _receipt_window_must_be_ordered(self):
        if self.observedAt > self.issuedAt or self.issuedAt > self.expiresAt:
            raise ValueError("Observation receipt timestamps must be ordered.")
        if (self.expiresAt - self.issuedAt).total_seconds() > 300:
            raise ValueError("Observation receipt lifetime must not exceed five minutes.")
        return self


class PipelineObservedEvidenceAttestationV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schemaVersion: Literal["pipeline-observed-evidence-attestation/v0"]
    attestationId: str = Field(min_length=1, max_length=200)
    evidenceClass: Literal["live_observed"]
    observer: PipelineObservedEvidenceObserverV0View
    subject: PipelineObservedEvidenceSubjectV0View
    receipt: PipelineObservedEvidenceReceiptV0View
    metadataOnly: Literal[True]
    rawPayloadRetained: Literal[False]

    @field_validator("attestationId")
    @classmethod
    def _attestation_id_must_be_safe(cls, value: str) -> str:
        if not _is_safe_local_proof_text(value):
            raise ValueError("Observation attestationId must be safe metadata.")
        return value


class PipelineEpic25ReadinessDetailsV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["readiness"]
    backendTruth: Literal["live", "simulated", "dry_run"]
    authorityState: Literal["allowed", "blocked", "unknown"]
    gateCount: PositiveInt
    thresholdsComplete: bool
    telemetryReady: bool
    rollbackReady: bool
    recoveryReady: bool
    configurationValid: bool


class PipelineEpic25CanaryDetailsV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["canary"]
    workerCount: Literal[1]
    backendTruth: Literal["live", "simulated", "dry_run"]
    leaseState: Literal["pass", "fail", "blocked"]
    checkpointState: Literal["pass", "fail", "blocked"]
    measurementsComplete: bool
    canaryAuthorityProven: bool
    rampAllowed: bool


class PipelineEpic25RampDetailsV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["ramp"]
    canaryPacketId: str = Field(min_length=1, max_length=200)
    canaryOutcome: Literal["pass", "hold", "stop"]
    stageWorkerCounts: tuple[Literal[1], Literal[2], Literal[4], Literal[6]]
    stageOutcomes: tuple[
        Literal["pass", "hold", "stop"],
        Literal["pass", "hold", "stop"],
        Literal["pass", "hold", "stop"],
        Literal["pass", "hold", "stop"],
    ]
    scaleEvidenceReady: bool


class PipelineEpic25RecoveryDetailsV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["recovery"]
    rampPacketId: str = Field(min_length=1, max_length=200)
    predecessorOutcome: Literal["pass", "hold", "stop"]
    drillCount: PositiveInt
    allDrillsPassed: bool
    idempotencyProven: bool
    silentRetryObserved: Literal[False]
    reliabilityEvidenceReady: bool


class PipelineEpic25HardeningDetailsV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["hardening"]
    recoveryPacketId: str = Field(min_length=1, max_length=200)
    predecessorOutcome: Literal["pass", "hold", "stop"]
    domainCount: PositiveInt
    unresolvedHighRiskGap: bool
    readinessHandoffReady: bool


class PipelineEpic25DecisionDetailsV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["decision"]
    predecessorPacketIds: dict[Literal["canary", "ramp", "recovery", "hardening"], str]
    predecessorOutcomes: dict[Literal["canary", "ramp", "recovery", "hardening"], Literal["pass", "hold", "stop"]]
    authorityReady: bool
    simulatedEvidence: bool
    staleEvidence: bool
    fixtureEvidence: bool

    @model_validator(mode="after")
    def _decision_predecessor_sets_must_be_complete(self):
        expected = {"canary", "ramp", "recovery", "hardening"}
        if set(self.predecessorPacketIds) != expected or set(self.predecessorOutcomes) != expected:
            raise ValueError("Decision details require all four exact predecessor identities and outcomes.")
        return self


PipelineEpic25EvidenceDetailsV0View = (
    PipelineEpic25ReadinessDetailsV0View
    | PipelineEpic25CanaryDetailsV0View
    | PipelineEpic25RampDetailsV0View
    | PipelineEpic25RecoveryDetailsV0View
    | PipelineEpic25HardeningDetailsV0View
    | PipelineEpic25DecisionDetailsV0View
)


PipelineEpic25QualityGateFamily = Literal["security", "retention", "rollback", "runbook", "telemetry", "recovery"]
EPIC_25_OPERATIONAL_READINESS_REASONS = {
    "threshold_missing", "threshold_malformed", "telemetry_missing", "telemetry_stale", "telemetry_contradictory",
    "alert_coverage_missing", "rollback_missing", "recovery_missing", "ownership_ambiguous", "target_not_exact",
    "evidence_missing", "evidence_stale", "backend_truth_unproven", "configuration_invalid", "secret_like_metadata",
    "resource_pressure", "usage_pressure", "preflight_blocked", "dispatcher_lease_unproven", "receipt_unproven",
    "fixture_evidence", "evidence_provenance_missing", "evidence_attestation_invalid", "evidence_receipt_stale",
    "predecessor_gate_not_passed", "safety_violation", "authority_violation", "canary_authority_missing",
    "lease_missing", "checkpoint_missing", "latency_threshold_exceeded", "error_threshold_exceeded",
    "resource_threshold_exceeded", "cost_threshold_exceeded", "timeout", "recovery_boundary_breached",
    "canary_not_passed", "stage_plan_invalid", "capacity_missing", "stage_threshold_missing",
    "stage_threshold_exceeded", "stage_lifecycle_ambiguous", "stage_authority_missing", "stage_evidence_missing",
    "drill_evidence_missing", "recovery_ambiguity", "idempotency_unproven", "silent_retry", "recovery_drill_failed",
    "runbook_gap", "high_risk_gap", "runbook_owner_missing", "runbook_trigger_missing", "runbook_gate_missing",
    "runbook_recovery_missing", "unknown",
}


class PipelineEpic25QualityGateV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    family: PipelineEpic25QualityGateFamily
    requirement: Literal["required", "not_applicable"]
    state: Literal["pass", "fail", "blocked", "not_applicable"]
    typedReason: str | None = Field(default=None, max_length=80)
    nextSafeAction: str = Field(min_length=1, max_length=500)
    notApplicableReason: str | None = Field(default=None, max_length=500)
    targetRevision: str = Field(pattern=r"^[a-f0-9]{40}$")
    checkedAt: datetime
    expiresAt: datetime
    evidenceRefs: list[str] = Field(min_length=1, max_length=24)

    @field_validator("checkedAt", "expiresAt")
    @classmethod
    def _gate_timestamps_must_include_timezone(cls, value: datetime) -> datetime:
        return _canonical_utc(value, label="Epic 25 quality-gate timestamp")

    @field_validator("evidenceRefs")
    @classmethod
    def _gate_refs_must_be_safe(cls, refs: list[str]) -> list[str]:
        if len(set(refs)) != len(refs) or not all(_is_safe_epic_25_evidence_ref(ref) for ref in refs):
            raise ValueError("Epic 25 quality-gate refs must be unique safe metadata refs.")
        return sorted(refs)

    @field_validator("nextSafeAction", "notApplicableReason")
    @classmethod
    def _gate_policy_text_must_be_safe(cls, value: str | None) -> str | None:
        if value is not None and not _is_safe_epic_25_policy_text(value):
            raise ValueError("Epic 25 gate reasons and next actions must be safe metadata-only text.")
        return value

    @model_validator(mode="after")
    def _gate_freshness_and_semantics_must_hold(self):
        if self.expiresAt <= self.checkedAt or (self.expiresAt - self.checkedAt).total_seconds() > 300:
            raise ValueError("Epic 25 quality-gate freshness must be ordered and bounded to five minutes.")
        if self.family != "runbook" and self.requirement != "required":
            raise ValueError(f"Epic 25 {self.family} is a server-required gate family.")
        if self.requirement == "required" and (self.state == "not_applicable" or self.notApplicableReason is not None):
            raise ValueError("Required Epic 25 gates cannot be not_applicable or carry a not-applicable reason.")
        if self.requirement == "not_applicable" and (
            self.family != "runbook" or self.state != "not_applicable" or self.notApplicableReason is None
        ):
            raise ValueError("Only the runbook gate may be not_applicable and it requires a reason.")
        if self.state in {"fail", "blocked"} and self.typedReason not in EPIC_25_OPERATIONAL_READINESS_REASONS:
            raise ValueError("Failed or blocked Epic 25 gates require a typed readiness reason.")
        if self.state in {"pass", "not_applicable"} and self.typedReason is not None:
            raise ValueError("Passing or not-applicable Epic 25 gates cannot carry a typed failure reason.")
        return self


class PipelineEpic25RetentionPolicyV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sourceOwner: str = Field(min_length=1, max_length=200)
    toolOwner: str = Field(min_length=1, max_length=200)
    disposition: Literal["metadata_only"]
    redactionState: Literal["verified_redacted", "not_applicable"]
    expiresAt: datetime
    retentionPeriodDays: int = Field(strict=True, ge=1, le=3650)
    disposalAction: Literal["delete_metadata", "revalidate_before_expiry"]
    verificationStatus: Literal["verified", "pending", "failed"]
    policyReason: str = Field(min_length=1, max_length=500)
    evidenceRefs: list[str] = Field(min_length=1, max_length=24)
    metadataOnly: Literal[True]
    rawPayloadRetained: Literal[False]

    @field_validator("expiresAt")
    @classmethod
    def _retention_expiry_must_include_timezone(cls, value: datetime) -> datetime:
        return _canonical_utc(value, label="Epic 25 retention expiry")

    @field_validator("sourceOwner", "toolOwner")
    @classmethod
    def _retention_owners_must_be_safe(cls, value: str) -> str:
        if (
            not _is_safe_local_proof_text(value)
            or value != value.lower()
            or re.fullmatch(r"[a-z0-9](?:[a-z0-9._/@:,-]{0,198}[a-z0-9])?", value) is None
            or re.search(r"[._/@:,-]{2,}", value)
            or re.search(r"(?:^|[/\\])\.{1,2}(?:[/\\]|$)", value)
        ):
            raise ValueError("Epic 25 retention owners must be safe metadata-only identifiers.")
        return value

    @field_validator("policyReason")
    @classmethod
    def _retention_reason_must_be_safe(cls, value: str) -> str:
        if not _is_safe_epic_25_policy_text(value):
            raise ValueError("Epic 25 retention policy reasons must be safe metadata-only text.")
        return value

    @field_validator("evidenceRefs")
    @classmethod
    def _retention_refs_must_be_safe(cls, refs: list[str]) -> list[str]:
        if len(set(refs)) != len(refs) or not all(_is_safe_epic_25_evidence_ref(ref) for ref in refs):
            raise ValueError("Epic 25 retention refs must be unique safe metadata refs.")
        return sorted(refs)


class PipelineEpic25PolicyProfileV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schemaVersion: Literal["pipeline-epic-25-policy-profile/v0"]
    targetRevision: str = Field(pattern=r"^[a-f0-9]{40}$")
    checkedAt: datetime
    expiresAt: datetime
    qualityGates: list[PipelineEpic25QualityGateV0View] = Field(min_length=6, max_length=6)
    retentionPolicy: PipelineEpic25RetentionPolicyV0View
    executionAllowed: Literal[False]
    providerCallsAllowed: Literal[False]
    mutationAllowed: Literal[False]
    metadataOnly: Literal[True]
    rawPayloadRetained: Literal[False]

    @field_validator("checkedAt", "expiresAt")
    @classmethod
    def _profile_timestamps_must_include_timezone(cls, value: datetime) -> datetime:
        return _canonical_utc(value, label="Epic 25 policy-profile timestamp")

    @model_validator(mode="after")
    def _profile_must_be_complete_exact_and_bounded(self):
        if self.expiresAt <= self.checkedAt or (self.expiresAt - self.checkedAt).total_seconds() > 300:
            raise ValueError("Epic 25 policy-profile freshness must be ordered and bounded to five minutes.")
        expected_families = {"security", "retention", "rollback", "runbook", "telemetry", "recovery"}
        if {gate.family for gate in self.qualityGates} != expected_families:
            raise ValueError("Epic 25 policy profiles require every named quality-gate family exactly once.")
        for gate in self.qualityGates:
            if gate.targetRevision != self.targetRevision:
                raise ValueError("Every Epic 25 quality gate must target the profile's exact Git revision.")
            if gate.checkedAt > self.checkedAt or gate.expiresAt < self.checkedAt or gate.expiresAt > self.expiresAt:
                raise ValueError("Every Epic 25 quality gate must be fresh within the policy-profile window.")
        expected_retention_expiry = self.checkedAt + timedelta(days=self.retentionPolicy.retentionPeriodDays)
        if self.retentionPolicy.expiresAt != expected_retention_expiry:
            raise ValueError("Epic 25 retention expiry must exactly match its period from profile checkedAt.")
        return self


class PipelineEpic25EvidenceChainPacketV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slot: PipelineEpic25EvidenceSlot
    packetId: str = Field(min_length=1, max_length=200)
    packetSchemaVersion: PipelineEpic25PacketSchemaVersion
    predecessorPacketId: str | None = Field(default=None, max_length=200)
    evidenceClass: PipelineOperationalEvidenceClass
    outcome: Literal["go", "no_go", "pass", "hold", "stop", "limited_rollout"]
    sourceRefs: list[str] = Field(min_length=1, max_length=24)
    evidenceRefs: list[str] = Field(min_length=1, max_length=24)
    checkedAt: datetime
    expiresAt: datetime
    observedEvidenceAttestation: PipelineObservedEvidenceAttestationV0View | None
    details: PipelineEpic25EvidenceDetailsV0View = Field(discriminator="kind")
    metadataOnly: Literal[True]
    rawPayloadRetained: Literal[False]

    @field_validator("checkedAt", "expiresAt")
    @classmethod
    def _packet_timestamps_must_include_timezone(cls, value: datetime) -> datetime:
        return _canonical_utc(value, label="Evidence-chain packet timestamp")

    @field_validator("packetId", "predecessorPacketId")
    @classmethod
    def _packet_ids_must_be_safe(cls, value: str | None) -> str | None:
        if value is not None and not _is_safe_local_proof_text(value):
            raise ValueError("Evidence-chain packet ids must be safe metadata.")
        return value

    @field_validator("sourceRefs", "evidenceRefs")
    @classmethod
    def _packet_refs_must_be_safe(cls, refs: list[str]) -> list[str]:
        if len(set(refs)) != len(refs) or not all(_is_safe_epic_25_evidence_ref(ref) for ref in refs):
            raise ValueError("Evidence-chain packet refs must be unique safe metadata refs.")
        return sorted(refs)

    @model_validator(mode="after")
    def _packet_provenance_must_match(self):
        if self.expiresAt <= self.checkedAt or (self.expiresAt - self.checkedAt).total_seconds() > 300:
            raise ValueError("Evidence-chain packet timestamps must be ordered and bounded to five minutes.")
        attestation = self.observedEvidenceAttestation
        if self.evidenceClass == "live_observed":
            if attestation is None:
                raise ValueError("Live-observed evidence requires an independent observation attestation.")
            if attestation.subject.packetSchemaVersion != self.packetSchemaVersion or attestation.subject.targetRef != self.packetId:
                raise ValueError("Observation attestation must target the exact packet id and schema.")
            if attestation.receipt.expiresAt < self.checkedAt or attestation.receipt.issuedAt > self.checkedAt:
                raise ValueError("Observation receipt must be fresh at the packet check time.")
            if self.checkedAt - attestation.receipt.observedAt > timedelta(minutes=5) or attestation.receipt.observedAt > self.checkedAt + timedelta(minutes=1):
                raise ValueError("Observation receipt observedAt must be fresh and not future-dated relative to checkedAt.")
            if set(attestation.receipt.sourceRefs) != set(self.sourceRefs) or set(attestation.receipt.evidenceRefs) != set(self.evidenceRefs):
                raise ValueError("Observation receipt must exactly bind the packet source and evidence ref sets.")
        elif attestation is not None:
            raise ValueError("Fixture and integrated-local packets cannot carry live observation attestations.")
        return self


class PipelineEpic25EvidenceChainPacketsV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    readiness: PipelineEpic25EvidenceChainPacketV0View
    canary: PipelineEpic25EvidenceChainPacketV0View
    ramp: PipelineEpic25EvidenceChainPacketV0View
    recovery: PipelineEpic25EvidenceChainPacketV0View
    hardening: PipelineEpic25EvidenceChainPacketV0View
    decision: PipelineEpic25EvidenceChainPacketV0View


class PipelineEpic25EvidenceChainBaseView(BaseModel):
    model_config = ConfigDict(extra="forbid")

    authoritativePacketId: str = Field(min_length=1, max_length=80)
    evidenceClass: PipelineOperationalEvidenceClass
    packets: PipelineEpic25EvidenceChainPacketsV0View
    checkedAt: datetime
    expiresAt: datetime
    executionAllowed: Literal[False]
    providerCallsAllowed: Literal[False]
    mutationAllowed: Literal[False]
    metadataOnly: Literal[True]
    rawPayloadRetained: Literal[False]

    @field_validator("checkedAt", "expiresAt")
    @classmethod
    def _chain_timestamps_must_include_timezone(cls, value: datetime) -> datetime:
        return _canonical_utc(value, label="Evidence-chain timestamp")

    @field_validator("authoritativePacketId")
    @classmethod
    def _authoritative_packet_id_must_be_safe(cls, value: str) -> str:
        if not _is_safe_local_proof_text(value):
            raise ValueError("Evidence chain requires a safe authoritative packet id.")
        return value

    @model_validator(mode="after")
    def _chain_must_be_complete_and_fail_closed(self):
        if self.expiresAt <= self.checkedAt or (self.expiresAt - self.checkedAt).total_seconds() > 300:
            raise ValueError("Evidence-chain timestamps must be ordered and bounded to five minutes.")
        expected_schemas = {
            "readiness": "pipeline-operational-readiness-contract/v0",
            "canary": "pipeline-one-worker-live-canary/v0",
            "ramp": "pipeline-live-capacity-ramp/v0",
            "recovery": "pipeline-resilience-recovery-validation/v0",
            "hardening": "pipeline-operational-hardening-runbooks/v0",
            "decision": "pipeline-production-readiness-decision/v0",
        }
        previous_packet_id = None
        ordered = [self.packets.readiness, self.packets.canary, self.packets.ramp, self.packets.recovery, self.packets.hardening, self.packets.decision]
        packet_ids = [packet.packetId for packet in ordered]
        if len(set(packet_ids)) != len(packet_ids):
            raise ValueError("Evidence-chain packetIds must be unique across all six slots.")
        attestations = [packet.observedEvidenceAttestation for packet in ordered if packet.observedEvidenceAttestation is not None]
        if len({attestation.attestationId for attestation in attestations}) != len(attestations):
            raise ValueError("Live observation attestationIds must be unique across the chain.")
        if len({attestation.receipt.receiptId for attestation in attestations}) != len(attestations):
            raise ValueError("Live observation receiptIds must be unique across the chain.")
        for slot, packet in zip(expected_schemas, ordered, strict=True):
            if packet.slot != slot or packet.packetSchemaVersion != expected_schemas[slot]:
                raise ValueError(f"Evidence-chain {slot} slot uses a mismatched packet schema.")
            if packet.predecessorPacketId != previous_packet_id:
                raise ValueError(f"Evidence-chain {slot} slot must identify its exact predecessor packet.")
            if packet.evidenceClass != self.evidenceClass:
                raise ValueError("Every evidence-chain packet must use the chain evidenceClass.")
            if packet.checkedAt > self.checkedAt or packet.expiresAt < self.checkedAt:
                raise ValueError(f"Evidence-chain {slot} packet is stale or newer than the chain check.")
            previous_packet_id = packet.packetId
            if packet.details.kind != slot:
                raise ValueError(f"Evidence-chain {slot} packet must use its slot-specific detail contract.")
        if self.packets.readiness.outcome not in {"go", "no_go"}:
            raise ValueError("Readiness packet outcome must be go or no_go.")
        for packet in ordered[1:5]:
            if packet.outcome not in {"pass", "hold", "stop"}:
                raise ValueError(f"{packet.slot} packet outcome must be pass, hold, or stop.")
        if self.packets.decision.outcome not in {"go", "hold", "limited_rollout"}:
            raise ValueError("Final decision must be go, hold, or limited_rollout.")
        live_predecessors = (
            self.evidenceClass == "live_observed"
            and self.packets.readiness.outcome == "go"
            and all(packet.outcome == "pass" for packet in ordered[1:5])
        )
        if not live_predecessors and self.packets.decision.outcome != "hold":
            raise ValueError("Final decision must hold whenever complete passing live predecessors are absent.")
        if self.packets.ramp.details.canaryPacketId != self.packets.canary.packetId or self.packets.ramp.details.canaryOutcome != self.packets.canary.outcome:
            raise ValueError("Ramp details must bind the exact canary packet and outcome.")
        if self.packets.recovery.details.rampPacketId != self.packets.ramp.packetId or self.packets.recovery.details.predecessorOutcome != self.packets.ramp.outcome:
            raise ValueError("Recovery details must bind the exact ramp packet and outcome.")
        if self.packets.hardening.details.recoveryPacketId != self.packets.recovery.packetId or self.packets.hardening.details.predecessorOutcome != self.packets.recovery.outcome:
            raise ValueError("Hardening details must bind the exact recovery packet and outcome.")
        decision_ids = self.packets.decision.details.predecessorPacketIds
        decision_outcomes = self.packets.decision.details.predecessorOutcomes
        for slot in ("canary", "ramp", "recovery", "hardening"):
            predecessor = getattr(self.packets, slot)
            if decision_ids[slot] != predecessor.packetId or decision_outcomes[slot] != predecessor.outcome:
                raise ValueError("Decision details must bind every exact predecessor identity and outcome.")
        return self


class PipelineEpic25EvidenceChainV0View(PipelineEpic25EvidenceChainBaseView):
    schemaVersion: Literal["pipeline-epic-25-evidence-chain/v0"]


class PipelineEpic25EvidenceChainV1View(PipelineEpic25EvidenceChainBaseView):
    schemaVersion: Literal["pipeline-epic-25-evidence-chain/v1"]
    policyProfile: PipelineEpic25PolicyProfileV0View

    @model_validator(mode="after")
    def _policy_profile_must_cover_chain_check(self):
        if self.policyProfile.checkedAt > self.checkedAt or self.policyProfile.expiresAt < self.checkedAt:
            raise ValueError("The Epic 25 policy profile must be fresh at the exact evidence-chain check time.")
        return self


class PipelineEpic25ServerOwnedActorV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    actorType: Literal["operator"]
    actorId: Literal["pipeline-operator"]
    actorLabel: Literal["Pipeline operator"]


class PipelineEpic25EvidenceChainIngestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requestedBy: PipelineEpic25ServerOwnedActorV0View
    expectedCurrentDigestSha256: str | None = Field(default=None, pattern=r"^sha256:[0-9a-f]{64}$")
    evidenceChain: PipelineEpic25EvidenceChainV0View | PipelineEpic25EvidenceChainV1View


class PipelineEpic25EvidenceChainReadV0View(PipelineEpic25EvidenceChainV0View):
    chainDigestSha256: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    freshnessState: Literal["fresh", "stale"]
    effectiveDecision: Literal["go", "hold", "limited_rollout"]
    typedBlockers: list[
        Literal[
            "evidence_chain_stale",
            "live_evidence_unavailable",
            "policy_profile_upgrade_required",
            "legacy_upgrade_unavailable",
        ]
    ] = Field(default_factory=list)


class PipelineEpic25EvidenceChainReadV1View(PipelineEpic25EvidenceChainV1View):
    chainDigestSha256: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    freshnessState: Literal["fresh", "stale"]
    effectiveDecision: Literal["go", "hold", "limited_rollout"]
    typedBlockers: list[
        Literal[
            "evidence_chain_stale",
            "live_evidence_unavailable",
            "policy_profile_stale",
            "source_revision_attestation_required",
            "retention_policy_expired",
            "retention_policy_unverified",
            "quality_gate_not_passed",
        ]
    ] = Field(default_factory=list)


class PipelineProductModeMappingV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requestedProductMode: Literal["contract_only", "operator_review", "local_proof", "read_only", "bounded_write"]
    effectiveProductMode: Literal["contract_only", "operator_review", "local_proof", "read_only", "bounded_write", "blocked"]
    operationalMode: Literal["disabled", "local_proof", "read_only", "bounded_write", "unavailable", "unknown"]
    readinessState: Literal["ready", "degraded", "blocked", "unavailable", "unknown"]
    freshnessState: Literal["live", "stale", "unavailable", "unknown"]
    capabilityState: Literal["available", "gated", "unavailable", "simulated", "unknown"]
    checkedAt: datetime
    expiresAt: datetime
    ready: bool
    blockedReasons: list[str] = Field(default_factory=list)
    metadataOnly: Literal[True] = True
    rawPayloadRetained: Literal[False] = False
    sourceMutationAllowed: Literal[False] = False
    providerCallsAllowed: Literal[False] = False
    workerLaunchAllowed: Literal[False] = False
    githubMutationAllowed: Literal[False] = False


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
    environment: Literal["local_dogfood"] | None = None
    sourceRevision: str | None = Field(default=None, min_length=40, max_length=40, pattern=r"^[0-9a-f]{40}$")
    sourceRefs: list[str] | None = Field(default=None, min_length=1, max_length=24)
    evidenceRefs: list[str] | None = Field(default=None, min_length=1, max_length=24)

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

    @field_validator("sourceRefs", "evidenceRefs")
    @classmethod
    def _attestation_refs_must_be_safe(cls, values: list[str] | None) -> list[str] | None:
        if values is None:
            return None
        normalized = [value.strip() for value in values]
        if any(not value or len(value) > 200 or not value.isascii() or not value.isprintable() for value in normalized):
            raise ValueError("attestation references must be printable ASCII metadata")
        if len(set(normalized)) != len(normalized):
            raise ValueError("attestation references must not contain duplicates")
        return normalized

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
        for field in ("contentSha256", "environment", "sourceRevision", "sourceRefs", "evidenceRefs"):
            if getattr(self, field) is None:
                serialized.pop(field, None)
        return serialized


class AuthoritativeWorkPacketCreateRequest(BaseModel):
    packetId: str | None = Field(default=None, max_length=80)
    title: str = Field(min_length=1, max_length=255)
    initialStage: AuthoritativePacketStage = "capture"
    status: AuthoritativePacketStatus = "waiting"
    truthLabel: AuthoritativePacketTruthLabel = "source_owned"
    sourceRef: AuthoritativePacketSourceRefView
    canonicalContract: PipelineCanonicalContractV1View | None = None
    actor: AuthoritativePacketActorView = Field(default_factory=AuthoritativePacketActorView)
    idempotencyKey: str | None = Field(default=None, max_length=120)
    correlationId: str | None = Field(default=None, max_length=80)
    causationId: str | None = Field(default=None, max_length=80)
    parentPacketId: str | None = Field(default=None, max_length=80)
    lineageKind: Literal["root", "split", "rework", "remediation", "recombination", "delivery_failure"] = "root"
    readyToTest: "OperationalReadyToTestRequest | None" = None
    parallelWorkGraphEvidence: dict[str, Any] | None = None
    reviewRouteEvidence: dict[str, Any] | None = None
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

    @field_validator("packetId")
    @classmethod
    def _packet_id_must_not_use_projection_unavailable_identity(cls, value: str | None) -> str | None:
        if value is not None and UNAVAILABLE_PIPELINE_PROJECTION_PACKET_ID_RE.fullmatch(value):
            raise ValueError("Authoritative packetId cannot use the reserved unavailable projection identity.")
        return value

    @field_validator("title")
    @classmethod
    def _packet_title_must_be_safe_metadata(cls, value: str) -> str:
        return _validate_authoritative_metadata_text(value, path="title")

    @model_validator(mode="after")
    def _canonical_source_must_match_packet_source(self):
        if self.canonicalContract and self.canonicalContract.canonicalSource.provenance.sourceRef != self.sourceRef:
            raise ValueError("Canonical source provenance must match the authoritative packet sourceRef.")
        if self.parallelWorkGraphEvidence and self.packetId and self.parallelWorkGraphEvidence.get("packetId") != self.packetId:
            raise ValueError("Parallel work graph evidence must bind to the authoritative packetId.")
        if self.reviewRouteEvidence and self.packetId and self.reviewRouteEvidence.get("packetId") != self.packetId:
            raise ValueError("Review-route evidence must bind to the authoritative packetId.")
        return self


class AuthoritativeWorkPacketTransitionRequest(BaseModel):
    targetStage: AuthoritativePacketStage
    expectedCurrentEventId: str = Field(min_length=1, max_length=80)
    expectedAttemptId: str | None = Field(default=None, max_length=36)
    expectedAttemptStatus: ExecutionAttemptStatus | None = None
    expectedAttemptRevision: int | None = Field(default=None, ge=1)
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
    eventType: Literal["packet.created", "packet.stage_transitioned", "packet.operational_action_applied", "packet.parallel_work_graph_refreshed"]
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
    canonicalContract: PipelineCanonicalContractV1View | None = None
    evidenceChain: PipelineEpic25EvidenceChainReadV0View | PipelineEpic25EvidenceChainReadV1View | None = None
    productModeMapping: PipelineProductModeMappingV0View | None = None
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


class AuthoritativeWorkPacketListApiEnvelope(BaseModel):
    """Typed response boundary for supervisor-owned authoritative packets."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: list[AuthoritativeWorkPacketLifecycleView]
    meta: dict[str, Any] | None = None


class AuthoritativeWorkPacketApiEnvelope(BaseModel):
    """Typed response boundary for supervisor-owned authoritative packet detail."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: AuthoritativeWorkPacketLifecycleView
    meta: dict[str, Any] | None = None


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


# Additive v1 contract. The service keeps the v0 forms unavailable while each
# action uses the exact server-bound v1 authority and persistence path.
OperationalActionIdV1 = Literal["retry_verification", "pause", "drain", "resume", "reassign"]
OperationalActionTargetTypeV1 = Literal["execution_attempt", "runtime", "work_packet"]
OperationalActionRuntimeModeV1 = Literal["running", "paused", "draining", "disabled"]

OPERATIONAL_ACTION_V1_SCHEMA_VERSION = "pipeline-operational-action/v1"
OPERATIONAL_ACTION_V1_RUNTIME_TARGET_ID = "supervisor-runtime"
OPERATIONAL_ACTION_V1_POLICY: dict[str, dict[str, str]] = {
    "retry_verification": {"targetType": "execution_attempt", "authorityState": "needs_authority_approval", "riskTier": "medium"},
    "pause": {"targetType": "runtime", "authorityState": "needs_authority_approval", "riskTier": "low"},
    "drain": {"targetType": "runtime", "authorityState": "needs_authority_approval", "riskTier": "medium"},
    "resume": {"targetType": "runtime", "authorityState": "needs_authority_approval", "riskTier": "low"},
    "reassign": {"targetType": "work_packet", "authorityState": "needs_authority_approval", "riskTier": "medium"},
}
OPERATIONAL_ACTION_V1_CONTEXT_FIELDS: dict[str, tuple[str, ...]] = {
    "retry_verification": (
        "kind", "executionAttemptId", "linkedWorkItemId", "linkedPacketId", "expectedWorkItemState",
        "expectedWorkItemUpdatedAt", "expectedAttemptStatus", "expectedAttemptUpdatedAt",
        "expectedPacketCurrentEventId", "expectedLeaseId", "expectedLeaseFencingToken", "expectedLeaseActive",
    ),
    "pause": ("kind", "expectedRuntimeMode", "expectedRuntimeRevision"),
    "drain": (
        "kind", "expectedRuntimeMode", "expectedRuntimeRevision", "expectedActiveWorkCount",
        "expectedActiveLeaseCount", "expectedRunningAttemptCount",
    ),
    "resume": ("kind", "expectedRuntimeMode", "expectedRuntimeRevision"),
    "reassign": (
        "kind", "linkedWorkItemId", "expectedPacketCurrentEventId", "expectedCurrentOwnerId", "newOwnerId",
        "expectedWorkItemState", "expectedWorkItemUpdatedAt", "expectedActiveLeaseId", "expectedRunningAttemptId",
    ),
}
OPERATIONAL_ACTION_V1_IDENTIFIER_RE = re.compile(r"^[a-z0-9](?:[a-z0-9._/@:,-]{0,198}[a-z0-9])?$")
OPERATIONAL_ACTION_V1_IDENTIFIER_REPEATED_SEPARATOR_RE = re.compile(r"[._/@:,-]{2,}")
OPERATIONAL_ACTION_V1_IDENTIFIER_PATH_SEGMENT_RE = re.compile(r"(?:^|[/\\])\.{1,2}(?:[/\\]|$)")
OPERATIONAL_ACTION_V1_EVIDENCE_REF_MAX_LENGTH = 180
OPERATIONAL_ACTION_V1_EVIDENCE_REF_RE = re.compile(
    r"^(?:manager-cycle|preflight|usage|resources|operational-action|verification|evidence|story|assignment|task|source|prd|check|checkpoint|command|test|artifact):[A-Za-z0-9._/@:-]{1,160}$"
)
OPERATIONAL_ACTION_V1_EVIDENCE_REF_PATH_SEGMENT_RE = re.compile(r"(?:^|[:/\\])\.{1,2}(?:[/\\]|$)")
OPERATIONAL_ACTION_V1_FORBIDDEN_METADATA_RE = re.compile(
    r"\b(?:raw[\s_-]*(?:prompts?|completions?|transcripts?|logs?|sources?)|reasoning[\s_-]*traces?|provider[\s_-]*payloads?|source[\s_-]*(?:dumps?|copies?|snapshots?)|stack[\s_-]*dumps?|console[\s_-]*logs?|secrets?(?:[\s_-]*(?:key|token|value|id))?|credentials?(?:[\s_-]*(?:key|token|value|id))?|passwords?|api[\s_-]*keys?|access[\s_-]*tokens?|auth[\s_-]*tokens?|private[\s_-]*keys?|passphrases?|(?:terminal|tmux|pane)[\s_-]*(?:scrollbacks?|texts?|outputs?|stdouts?|stderrs?))\b",
    re.IGNORECASE,
)
OPERATIONAL_ACTION_V1_SECRET_LIKE_REF_RE = re.compile(
    r"\b(?:sk-[A-Za-z0-9_-]{8,}|(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|(?:api|secret|token|credential)[_-]?(?:key|token|secret)?[:=])",
    re.IGNORECASE,
)
OPERATIONAL_ACTION_V1_RFC3339_TIMESTAMP_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$"
)

OPERATIONAL_ACTION_V1_ID_LENGTHS = {
    "execution_attempt": 36,
    "retry_intent": 80,
    "work_item": 36,
    "queue_lease": 36,
    "work_packet": 80,
    "packet_event": 80,
    "owner": 100,
    "approval": 120,
    "action_record": 80,
    "correlation": 36,
    "idempotency": 160,
}


def _validate_operational_action_v1_identifier(value: str, *, label: str, max_length: int) -> str:
    if (
        len(value) > max_length
        or value != value.lower()
        or not OPERATIONAL_ACTION_V1_IDENTIFIER_RE.fullmatch(value)
        or OPERATIONAL_ACTION_V1_IDENTIFIER_REPEATED_SEPARATOR_RE.search(value)
        or OPERATIONAL_ACTION_V1_IDENTIFIER_PATH_SEGMENT_RE.search(value)
        or OPERATIONAL_ACTION_V1_FORBIDDEN_METADATA_RE.search(value)
        or OPERATIONAL_ACTION_V1_SECRET_LIKE_REF_RE.search(value)
    ):
        raise ValueError(f"{label} must be an exact safe identifier.")
    return value


def _is_safe_operational_action_v1_evidence_ref(value: str) -> bool:
    return bool(
        len(value) <= OPERATIONAL_ACTION_V1_EVIDENCE_REF_MAX_LENGTH
        and OPERATIONAL_ACTION_V1_EVIDENCE_REF_RE.fullmatch(value)
        and not OPERATIONAL_ACTION_V1_EVIDENCE_REF_PATH_SEGMENT_RE.search(value)
        and not OPERATIONAL_ACTION_V1_FORBIDDEN_METADATA_RE.search(value)
        and not OPERATIONAL_ACTION_V1_SECRET_LIKE_REF_RE.search(value)
    )


def _validate_operational_action_v1_timestamp(value: str, *, label: str) -> str:
    if not OPERATIONAL_ACTION_V1_RFC3339_TIMESTAMP_RE.fullmatch(value) or value.startswith("0000-"):
        raise ValueError(f"{label} must be a canonical RFC3339 timestamp.")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"{label} must be a canonical RFC3339 timestamp.") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError(f"{label} must be a canonical RFC3339 timestamp.")
    return value


class RetryVerificationActionContextV1(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["retry_verification"]
    executionAttemptId: str
    linkedWorkItemId: str
    linkedPacketId: str
    expectedWorkItemState: WorkflowState
    expectedWorkItemUpdatedAt: str
    expectedAttemptStatus: Literal["failed", "timed_out", "rejected"]
    expectedAttemptUpdatedAt: str
    expectedPacketCurrentEventId: str
    expectedLeaseId: str | None
    expectedLeaseFencingToken: PositiveInt | None
    expectedLeaseActive: Literal[False]

    @field_validator("executionAttemptId")
    @classmethod
    def exact_attempt_id(cls, value: str) -> str:
        return _validate_operational_action_v1_identifier(
            value, label="executionAttemptId", max_length=OPERATIONAL_ACTION_V1_ID_LENGTHS["execution_attempt"]
        )

    @field_validator("linkedWorkItemId")
    @classmethod
    def exact_work_item_id(cls, value: str) -> str:
        return _validate_operational_action_v1_identifier(
            value, label="linkedWorkItemId", max_length=OPERATIONAL_ACTION_V1_ID_LENGTHS["work_item"]
        )

    @field_validator("linkedPacketId")
    @classmethod
    def exact_packet_id(cls, value: str) -> str:
        return _validate_operational_action_v1_identifier(
            value, label="linkedPacketId", max_length=OPERATIONAL_ACTION_V1_ID_LENGTHS["work_packet"]
        )

    @field_validator("expectedPacketCurrentEventId")
    @classmethod
    def exact_packet_event_id(cls, value: str) -> str:
        return _validate_operational_action_v1_identifier(
            value, label="expectedPacketCurrentEventId", max_length=OPERATIONAL_ACTION_V1_ID_LENGTHS["packet_event"]
        )

    @field_validator("expectedWorkItemUpdatedAt", "expectedAttemptUpdatedAt")
    @classmethod
    def exact_revision(cls, value: str, info) -> str:
        return _validate_operational_action_v1_timestamp(value, label=info.field_name)

    @model_validator(mode="after")
    def lease_fence_is_exact(self) -> "RetryVerificationActionContextV1":
        if (self.expectedLeaseId is None) != (self.expectedLeaseFencingToken is None):
            raise ValueError("Retry lease id and fencing token must both be null or both be present.")
        if self.expectedLeaseId is not None:
            _validate_operational_action_v1_identifier(
                self.expectedLeaseId,
                label="expectedLeaseId",
                max_length=OPERATIONAL_ACTION_V1_ID_LENGTHS["queue_lease"],
            )
        return self


class PauseActionContextV1(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["pause"]
    expectedRuntimeMode: OperationalActionRuntimeModeV1
    expectedRuntimeRevision: PositiveInt


class DrainActionContextV1(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["drain"]
    expectedRuntimeMode: OperationalActionRuntimeModeV1
    expectedRuntimeRevision: PositiveInt
    expectedActiveWorkCount: int = Field(ge=0)
    expectedActiveLeaseCount: int = Field(ge=0)
    expectedRunningAttemptCount: int = Field(ge=0)


class ResumeActionContextV1(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["resume"]
    expectedRuntimeMode: Literal["paused", "draining"]
    expectedRuntimeRevision: PositiveInt


class ResumeSuccessEvidenceV1(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["resume"]
    resultingRuntimeMode: Literal["running"]
    resultingRuntimeRevision: PositiveInt
    activeWorkCount: int = Field(ge=0)
    activeLeaseCount: int = Field(ge=0)
    runningAttemptCount: int = Field(ge=0)
    intakeResumed: Literal[True]
    activeWorkPreserved: Literal[True]


class ReassignActionContextV1(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["reassign"]
    linkedWorkItemId: str
    expectedPacketCurrentEventId: str
    expectedCurrentOwnerId: str | None
    newOwnerId: str
    expectedWorkItemState: WorkflowState
    expectedWorkItemUpdatedAt: str
    expectedActiveLeaseId: None
    expectedRunningAttemptId: None

    @field_validator("linkedWorkItemId")
    @classmethod
    def exact_work_item_id(cls, value: str) -> str:
        return _validate_operational_action_v1_identifier(
            value, label="linkedWorkItemId", max_length=OPERATIONAL_ACTION_V1_ID_LENGTHS["work_item"]
        )

    @field_validator("expectedPacketCurrentEventId")
    @classmethod
    def exact_packet_event_id(cls, value: str) -> str:
        return _validate_operational_action_v1_identifier(
            value, label="expectedPacketCurrentEventId", max_length=OPERATIONAL_ACTION_V1_ID_LENGTHS["packet_event"]
        )

    @field_validator("newOwnerId")
    @classmethod
    def exact_new_owner_id(cls, value: str) -> str:
        return _validate_operational_action_v1_identifier(
            value, label="newOwnerId", max_length=OPERATIONAL_ACTION_V1_ID_LENGTHS["owner"]
        )

    @field_validator("expectedCurrentOwnerId")
    @classmethod
    def exact_optional_owner(cls, value: str | None) -> str | None:
        return None if value is None else _validate_operational_action_v1_identifier(
            value, label="expectedCurrentOwnerId", max_length=OPERATIONAL_ACTION_V1_ID_LENGTHS["owner"]
        )

    @field_validator("expectedWorkItemUpdatedAt")
    @classmethod
    def exact_work_item_revision(cls, value: str) -> str:
        return _validate_operational_action_v1_timestamp(value, label="expectedWorkItemUpdatedAt")

    @model_validator(mode="after")
    def owner_must_change(self) -> "ReassignActionContextV1":
        if self.expectedCurrentOwnerId == self.newOwnerId:
            raise ValueError("Reassign new owner must differ from the exact current owner.")
        return self


OperationalActionContextV1 = Annotated[
    RetryVerificationActionContextV1 | PauseActionContextV1 | DrainActionContextV1 | ResumeActionContextV1 | ReassignActionContextV1,
    Field(discriminator="kind"),
]


def operational_action_context_digest_payload_v1(
    action_id: str,
    target_type: str,
    target_id: str,
    action_context: OperationalActionContextV1,
) -> str:
    values = action_context.model_dump(mode="json")
    ordered_context = {field: values[field] for field in OPERATIONAL_ACTION_V1_CONTEXT_FIELDS[action_id]}
    return json.dumps(
        {
            "schemaVersion": OPERATIONAL_ACTION_V1_SCHEMA_VERSION,
            "actionId": action_id,
            "targetType": target_type,
            "targetId": target_id,
            "actionContext": ordered_context,
        },
        separators=(",", ":"),
        ensure_ascii=False,
    )


def operational_action_context_digest_sha256_v1(
    action_id: str,
    target_type: str,
    target_id: str,
    action_context: OperationalActionContextV1,
) -> str:
    payload = operational_action_context_digest_payload_v1(action_id, target_type, target_id, action_context)
    return f"sha256:{hashlib.sha256(payload.encode('utf-8')).hexdigest()}"


class OperationalActionBindingV1(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schemaVersion: Literal["pipeline-operational-action/v1"] = "pipeline-operational-action/v1"
    actionId: OperationalActionIdV1
    targetType: OperationalActionTargetTypeV1
    targetId: str
    actionContext: OperationalActionContextV1
    actionContextDigestSha256: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    serverBound: Literal[True]
    metadataOnly: Literal[True] = True
    rawPayloadRetained: Literal[False] = False

    @field_validator("targetId")
    @classmethod
    def exact_target_id(cls, value: str) -> str:
        return _validate_operational_action_v1_identifier(
            value,
            label="targetId",
            max_length=max(
                OPERATIONAL_ACTION_V1_ID_LENGTHS["execution_attempt"],
                OPERATIONAL_ACTION_V1_ID_LENGTHS["work_packet"],
            ),
        )

    @model_validator(mode="after")
    def exact_action_binding(self) -> "OperationalActionBindingV1":
        policy = OPERATIONAL_ACTION_V1_POLICY[self.actionId]
        if self.targetType != policy["targetType"] or self.actionContext.kind != self.actionId:
            raise ValueError("V1 action target/context does not match policy.")
        target_limit = {
            "execution_attempt": OPERATIONAL_ACTION_V1_ID_LENGTHS["execution_attempt"],
            "runtime": len(OPERATIONAL_ACTION_V1_RUNTIME_TARGET_ID),
            "work_packet": OPERATIONAL_ACTION_V1_ID_LENGTHS["work_packet"],
        }[self.targetType]
        _validate_operational_action_v1_identifier(self.targetId, label="targetId", max_length=target_limit)
        if self.actionId == "retry_verification" and self.actionContext.executionAttemptId != self.targetId:
            raise ValueError("Retry context must bind the exact target execution attempt.")
        if self.actionId in {"pause", "drain", "resume"} and self.targetId != OPERATIONAL_ACTION_V1_RUNTIME_TARGET_ID:
            raise ValueError("Runtime V1 actions must target the singleton supervisor runtime.")
        expected_digest = operational_action_context_digest_sha256_v1(
            self.actionId,
            self.targetType,
            self.targetId,
            self.actionContext,
        )
        if self.actionContextDigestSha256 != expected_digest:
            raise ValueError("V1 action context digest does not match the canonical target-and-context SHA-256 digest.")
        return self


class OperationalActionApprovalRequestV1(OperationalActionBindingV1):
    requestedBy: AuthoritativePacketActorView
    requestedAuthorityState: Literal["needs_authority_approval"]
    requestedRiskTier: Literal["low", "medium"]

    @model_validator(mode="after")
    def exact_request_policy(self) -> "OperationalActionApprovalRequestV1":
        policy = OPERATIONAL_ACTION_V1_POLICY[self.actionId]
        if self.requestedAuthorityState != policy["authorityState"] or self.requestedRiskTier != policy["riskTier"]:
            raise ValueError("V1 authority family or risk tier does not match policy.")
        return self


class OperationalActionRequestV1(OperationalActionApprovalRequestV1):
    idempotencyKey: str
    correlationId: str
    approvalId: str
    evidenceRefs: list[str] = Field(min_length=1, max_length=24)

    @field_validator("idempotencyKey")
    @classmethod
    def exact_idempotency_key(cls, value: str) -> str:
        return _validate_operational_action_v1_identifier(
            value, label="idempotencyKey", max_length=OPERATIONAL_ACTION_V1_ID_LENGTHS["idempotency"]
        )

    @field_validator("correlationId")
    @classmethod
    def exact_correlation_id(cls, value: str) -> str:
        return _validate_operational_action_v1_identifier(
            value, label="correlationId", max_length=OPERATIONAL_ACTION_V1_ID_LENGTHS["correlation"]
        )

    @field_validator("approvalId")
    @classmethod
    def exact_approval_id(cls, value: str) -> str:
        return _validate_operational_action_v1_identifier(
            value, label="approvalId", max_length=OPERATIONAL_ACTION_V1_ID_LENGTHS["approval"]
        )

    @field_validator("evidenceRefs")
    @classmethod
    def exact_evidence_refs(cls, refs: list[str]) -> list[str]:
        if len(set(refs)) != len(refs) or any(not _is_safe_operational_action_v1_evidence_ref(ref) for ref in refs):
            raise ValueError("V1 evidence refs must be unique safe metadata refs.")
        return refs


class OperationalActionApprovalV1(OperationalActionApprovalRequestV1):
    approvalId: str
    issuedBy: Literal["supervisor_server"]
    issuedAt: datetime
    expiresAt: datetime
    consumed: bool
    consumedAt: datetime | None
    consumedActionIdempotencyKey: str | None
    consumedActionRecordId: str | None

    @field_validator("approvalId")
    @classmethod
    def exact_approval_id(cls, value: str) -> str:
        return _validate_operational_action_v1_identifier(
            value, label="approvalId", max_length=OPERATIONAL_ACTION_V1_ID_LENGTHS["approval"]
        )

    @field_validator("issuedAt", "expiresAt", "consumedAt", mode="before")
    @classmethod
    def exact_timestamp_lexemes(cls, value: object, info) -> object:
        if value is None or isinstance(value, datetime):
            return value
        if not isinstance(value, str):
            raise ValueError("V1 approval timestamps must be canonical RFC3339 strings.")
        return _validate_operational_action_v1_timestamp(value, label=info.field_name)

    @field_validator("issuedAt", "expiresAt", "consumedAt")
    @classmethod
    def canonical_timestamps(cls, value: datetime | None) -> datetime | None:
        return None if value is None else _canonical_utc(value, label="V1 approval timestamp")

    @field_validator("consumedActionIdempotencyKey")
    @classmethod
    def exact_consumed_idempotency_key(cls, value: str | None) -> str | None:
        return None if value is None else _validate_operational_action_v1_identifier(
            value,
            label="consumedActionIdempotencyKey",
            max_length=OPERATIONAL_ACTION_V1_ID_LENGTHS["idempotency"],
        )

    @field_validator("consumedActionRecordId")
    @classmethod
    def exact_consumed_action_record_id(cls, value: str | None) -> str | None:
        return None if value is None else _validate_operational_action_v1_identifier(
            value,
            label="consumedActionRecordId",
            max_length=OPERATIONAL_ACTION_V1_ID_LENGTHS["action_record"],
        )

    @model_validator(mode="after")
    def exact_approval_lifecycle(self) -> "OperationalActionApprovalV1":
        if self.expiresAt <= self.issuedAt:
            raise ValueError("V1 approval expiry must follow issuance.")
        consumption = (self.consumedAt, self.consumedActionIdempotencyKey, self.consumedActionRecordId)
        if self.consumed and any(value is None for value in consumption):
            raise ValueError("Consumed V1 approvals require complete consumption metadata.")
        if not self.consumed and any(value is not None for value in consumption):
            raise ValueError("Unconsumed V1 approvals cannot carry consumption metadata.")
        return self


class OperationalActionCapabilityV1(OperationalActionBindingV1):
    sourceMode: Literal["supervisor_runtime", "packet"]
    capabilityState: OperationalActionCapabilityState
    authorityState: Literal["needs_authority_approval", "allowed", "blocked"]
    riskTier: Literal["low", "medium"]
    typedReason: OperationalActionTypedReason | None
    expectedResultSummary: str = Field(min_length=1, max_length=500)
    correlationRequired: Literal[True] = True
    idempotencyRequired: Literal[True] = True
    evidenceRefs: list[str] = Field(min_length=1, max_length=24)

    @field_validator("expectedResultSummary")
    @classmethod
    def safe_expected_result(cls, value: str) -> str:
        if not _is_safe_pipeline_control_text(value):
            raise ValueError("V1 expected result summary must be safe metadata-only text.")
        return value

    @field_validator("evidenceRefs")
    @classmethod
    def safe_capability_evidence(cls, refs: list[str]) -> list[str]:
        if len(set(refs)) != len(refs) or any(not _is_safe_operational_action_v1_evidence_ref(ref) for ref in refs):
            raise ValueError("V1 capability evidence refs must be unique safe metadata refs.")
        return refs

    @model_validator(mode="after")
    def exact_capability_policy(self) -> "OperationalActionCapabilityV1":
        if self.riskTier != OPERATIONAL_ACTION_V1_POLICY[self.actionId]["riskTier"]:
            raise ValueError("V1 capability risk tier does not match policy.")
        if self.capabilityState != "available" and self.typedReason is None:
            raise ValueError("Unavailable, gated, or simulated V1 capabilities require a typed reason.")
        return self


class RetryVerificationSuccessEvidenceV1(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["retry_verification"]
    originalAttemptId: str
    retryIntentId: str
    linkedWorkItemId: str
    linkedPacketId: str
    resultingPacketCurrentEventId: str
    originalAttemptPreserved: Literal[True]
    providerOrWorkerLaunched: Literal[False]

    @field_validator("originalAttemptId")
    @classmethod
    def exact_original_attempt_id(cls, value: str) -> str:
        return _validate_operational_action_v1_identifier(
            value,
            label="originalAttemptId",
            max_length=OPERATIONAL_ACTION_V1_ID_LENGTHS["execution_attempt"],
        )

    @field_validator("retryIntentId")
    @classmethod
    def exact_retry_intent_id(cls, value: str) -> str:
        value = _validate_operational_action_v1_identifier(
            value,
            label="retryIntentId",
            max_length=OPERATIONAL_ACTION_V1_ID_LENGTHS["retry_intent"],
        )
        if not value.startswith("verification-retry-"):
            raise ValueError("retryIntentId must identify a verification retry intent.")
        return value

    @field_validator("linkedWorkItemId")
    @classmethod
    def exact_linked_work_item_id(cls, value: str) -> str:
        return _validate_operational_action_v1_identifier(
            value,
            label="linkedWorkItemId",
            max_length=OPERATIONAL_ACTION_V1_ID_LENGTHS["work_item"],
        )

    @field_validator("linkedPacketId", "resultingPacketCurrentEventId")
    @classmethod
    def exact_packet_identifier(cls, value: str, info) -> str:
        return _validate_operational_action_v1_identifier(
            value,
            label=info.field_name,
            max_length=OPERATIONAL_ACTION_V1_ID_LENGTHS["work_packet" if info.field_name == "linkedPacketId" else "packet_event"],
        )


class PauseSuccessEvidenceV1(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["pause"]
    resultingRuntimeMode: Literal["paused"]
    resultingRuntimeRevision: PositiveInt
    activeWorkCount: int = Field(ge=0)
    activeLeaseCount: int = Field(ge=0)
    runningAttemptCount: int = Field(ge=0)
    intakeStopped: Literal[True]
    activeWorkPreserved: Literal[True]


class DrainSuccessEvidenceV1(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["drain"]
    resultingRuntimeMode: Literal["draining"]
    resultingRuntimeRevision: PositiveInt
    activeWorkCount: int = Field(ge=0)
    activeLeaseCount: int = Field(ge=0)
    runningAttemptCount: int = Field(ge=0)
    intakeStopped: Literal[True]
    activeWorkAllowedToConverge: Literal[True]
    workersKilled: Literal[False]


class ReassignSuccessEvidenceV1(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["reassign"]
    packetId: str
    linkedWorkItemId: str
    previousOwnerId: str | None
    newOwnerId: str
    resultingPacketCurrentEventId: str
    activeLeaseTransferred: Literal[False]
    workerLaunched: Literal[False]

    @field_validator("packetId")
    @classmethod
    def exact_packet_id(cls, value: str) -> str:
        return _validate_operational_action_v1_identifier(
            value, label="packetId", max_length=OPERATIONAL_ACTION_V1_ID_LENGTHS["work_packet"]
        )

    @field_validator("linkedWorkItemId")
    @classmethod
    def exact_linked_work_item_id(cls, value: str) -> str:
        return _validate_operational_action_v1_identifier(
            value, label="linkedWorkItemId", max_length=OPERATIONAL_ACTION_V1_ID_LENGTHS["work_item"]
        )

    @field_validator("previousOwnerId", "newOwnerId")
    @classmethod
    def exact_owner_id(cls, value: str | None, info) -> str | None:
        return None if value is None else _validate_operational_action_v1_identifier(
            value, label=info.field_name, max_length=OPERATIONAL_ACTION_V1_ID_LENGTHS["owner"]
        )

    @field_validator("resultingPacketCurrentEventId")
    @classmethod
    def exact_resulting_event_id(cls, value: str) -> str:
        return _validate_operational_action_v1_identifier(
            value, label="resultingPacketCurrentEventId", max_length=OPERATIONAL_ACTION_V1_ID_LENGTHS["packet_event"]
        )


OperationalActionSuccessEvidenceV1 = Annotated[
    RetryVerificationSuccessEvidenceV1 | PauseSuccessEvidenceV1 | DrainSuccessEvidenceV1 | ResumeSuccessEvidenceV1 | ReassignSuccessEvidenceV1,
    Field(discriminator="kind"),
]


class OperationalActionResultV1(OperationalActionBindingV1):
    outcome: OperationalActionOutcome
    capabilityState: OperationalActionCapabilityState
    authorityState: Literal["needs_authority_approval", "allowed", "blocked"]
    riskTier: Literal["low", "medium"]
    typedReason: OperationalActionTypedReason | None
    successEvidence: OperationalActionSuccessEvidenceV1 | None
    evidenceRefs: list[str] = Field(min_length=1, max_length=24)
    correlationId: str
    idempotencyKey: str
    actionRecordId: str
    approvalId: str
    replayed: bool

    @field_validator("correlationId")
    @classmethod
    def exact_result_correlation_id(cls, value: str) -> str:
        return _validate_operational_action_v1_identifier(
            value, label="correlationId", max_length=OPERATIONAL_ACTION_V1_ID_LENGTHS["correlation"]
        )

    @field_validator("idempotencyKey")
    @classmethod
    def exact_result_idempotency_key(cls, value: str) -> str:
        return _validate_operational_action_v1_identifier(
            value, label="idempotencyKey", max_length=OPERATIONAL_ACTION_V1_ID_LENGTHS["idempotency"]
        )

    @field_validator("actionRecordId")
    @classmethod
    def exact_action_record_id(cls, value: str) -> str:
        return _validate_operational_action_v1_identifier(
            value, label="actionRecordId", max_length=OPERATIONAL_ACTION_V1_ID_LENGTHS["action_record"]
        )

    @field_validator("approvalId")
    @classmethod
    def exact_result_approval_id(cls, value: str) -> str:
        return _validate_operational_action_v1_identifier(
            value, label="approvalId", max_length=OPERATIONAL_ACTION_V1_ID_LENGTHS["approval"]
        )

    @field_validator("evidenceRefs")
    @classmethod
    def safe_result_evidence(cls, refs: list[str]) -> list[str]:
        if len(set(refs)) != len(refs) or any(not _is_safe_operational_action_v1_evidence_ref(ref) for ref in refs):
            raise ValueError("V1 result evidence refs must be unique safe metadata refs.")
        return refs

    @model_validator(mode="after")
    def exact_result_policy(self) -> "OperationalActionResultV1":
        if self.riskTier != OPERATIONAL_ACTION_V1_POLICY[self.actionId]["riskTier"]:
            raise ValueError("V1 result risk tier does not match policy.")
        if self.outcome == "succeeded":
            if self.authorityState != "allowed" or self.capabilityState != "available" or self.typedReason is not None:
                raise ValueError("Successful V1 results require allowed authority and available capability.")
            if self.successEvidence is None or self.successEvidence.kind != self.actionId:
                raise ValueError("Successful V1 result evidence must match the action discriminator.")
            context = self.actionContext
            evidence = self.successEvidence
            if self.actionId == "retry_verification":
                if (
                    evidence.originalAttemptId != self.targetId
                    or evidence.retryIntentId == evidence.originalAttemptId
                    or evidence.linkedWorkItemId != context.linkedWorkItemId
                    or evidence.linkedPacketId != context.linkedPacketId
                    or evidence.resultingPacketCurrentEventId == context.expectedPacketCurrentEventId
                ):
                    raise ValueError("Retry success evidence does not bind the exact attempt/work-item/packet context.")
            elif self.actionId == "pause":
                if evidence.resultingRuntimeRevision <= context.expectedRuntimeRevision:
                    raise ValueError("Pause success must advance the monotonic runtime revision.")
            elif self.actionId == "drain":
                if evidence.resultingRuntimeRevision <= context.expectedRuntimeRevision:
                    raise ValueError("Drain success must advance the monotonic runtime revision.")
            elif self.actionId == "resume":
                if evidence.resultingRuntimeRevision <= context.expectedRuntimeRevision:
                    raise ValueError("Resume success must advance the monotonic runtime revision.")
            elif (
                evidence.packetId != self.targetId
                or evidence.linkedWorkItemId != context.linkedWorkItemId
                or evidence.previousOwnerId != context.expectedCurrentOwnerId
                or evidence.newOwnerId != context.newOwnerId
                or evidence.resultingPacketCurrentEventId == context.expectedPacketCurrentEventId
            ):
                raise ValueError("Reassign success evidence does not bind the exact packet/owner/event context.")
        elif self.successEvidence is not None or self.typedReason is None:
            raise ValueError("Non-success V1 results require a reason and cannot claim success evidence.")
        return self


class OperationalActionAuthorizationEnvelopeV1(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request: OperationalActionRequestV1
    approval: OperationalActionApprovalV1
    evaluatedAt: datetime

    @field_validator("evaluatedAt")
    @classmethod
    def canonical_evaluation_time(cls, value: datetime) -> datetime:
        return _canonical_utc(value, label="evaluatedAt")

    @model_validator(mode="after")
    def approval_binds_exact_request(self) -> "OperationalActionAuthorizationEnvelopeV1":
        request = self.request
        approval = self.approval
        for field in ("approvalId", "actionId", "targetType", "targetId", "requestedAuthorityState", "requestedRiskTier"):
            if getattr(request, field) != getattr(approval, field):
                raise ValueError(f"V1 approval {field} no longer matches the apply request.")
        if request.actionContextDigestSha256 != approval.actionContextDigestSha256:
            raise ValueError("V1 action context digest mismatch.")
        if request.actionContext.model_dump(mode="json") != approval.actionContext.model_dump(mode="json"):
            raise ValueError("V1 action context is stale or changed after approval issuance.")
        if request.requestedBy.model_dump(mode="json") != approval.requestedBy.model_dump(mode="json"):
            raise ValueError("V1 approval requester does not match the apply actor.")
        if self.evaluatedAt < approval.issuedAt or self.evaluatedAt >= approval.expiresAt:
            raise ValueError("V1 approval is expired or not yet valid.")
        if approval.consumed:
            if approval.consumedActionIdempotencyKey != request.idempotencyKey:
                raise ValueError("V1 approval replay conflicts with a different idempotency key.")
            raise ValueError("V1 approval is already consumed; persisted readback is required.")
        return self


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
    actionCapabilitiesV1: list[OperationalActionCapabilityV1] = Field(default_factory=list)
    evidenceRefs: list[str] = Field(default_factory=list)
    metadataOnly: Literal[True] = True
    rawPayloadRetained: Literal[False] = False


PipelineQualityGateGroupV0View.model_rebuild()
PipelineCanonicalContractV1View.model_rebuild()
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
    canonicalContract: PipelineCanonicalContractV1View | None = None
    productModeMapping: PipelineProductModeMappingV0View | None = None
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


class PipelineWorkGraphReservationV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["advisory_reserved", "deferred", "blocked", "not_recommended", "unavailable"]
    owner: str | None = None
    reasonCode: str

    @field_validator("owner")
    @classmethod
    def owner_is_safe(cls, value: str | None) -> str | None:
        if value is not None and not _is_safe_pipeline_control_text(value):
            raise ValueError("Work graph reservation owner must be safe metadata text.")
        return value

    @field_validator("reasonCode")
    @classmethod
    def reason_code_is_safe(cls, value: str) -> str:
        if not re.fullmatch(r"[a-z][a-z0-9_:-]{1,120}", value):
            raise ValueError("Work graph reservation reason code must be bounded metadata.")
        return value


class PipelineWorkGraphCapacityV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")
    posture: Literal["normal", "degraded", "blocked", "unavailable"]
    reasonCode: str

    @field_validator("reasonCode")
    @classmethod
    def reason_code_is_safe(cls, value: str) -> str:
        if not re.fullmatch(r"[a-z][a-z0-9_:-]{1,120}", value):
            raise ValueError("Work graph capacity reason code must be bounded metadata.")
        return value


class PipelineWorkGraphEvidenceV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schemaVersion: Literal["parallel-work-graph-evidence/v0"] = "parallel-work-graph-evidence/v0"
    sourceSchemaVersion: Literal["parallel-execution-graph-reservation/v1"] = "parallel-execution-graph-reservation/v1"
    availability: Literal["available", "stale", "unavailable"]
    packetId: str
    executionJobId: str | None = None
    reportIdentity: str | None = None
    generatedAt: datetime | None = None
    freshnessState: Literal["live", "stale", "unavailable"]
    waveMembership: Literal["selected", "deferred", "blocked", "unavailable"]
    dependencyState: Literal["clear", "declared", "blocked", "unavailable"]
    reservation: PipelineWorkGraphReservationV0View
    capacity: PipelineWorkGraphCapacityV0View
    reason: str
    nextSafeAction: str
    evidenceRefs: list[str] = Field(default_factory=list)
    metadataOnly: Literal[True] = True
    rawPayloadRetained: Literal[False] = False
    retention: Literal["metadata_only_evidence_references"] = "metadata_only_evidence_references"

    @field_validator("packetId", "executionJobId")
    @classmethod
    def ids_are_safe(cls, value: str | None) -> str | None:
        if value is not None and (not _is_safe_pipeline_evidence_ref(value) or "/" in value):
            raise ValueError("Work graph identity must be a safe metadata reference.")
        return value

    @field_validator("generatedAt")
    @classmethod
    def generated_at_is_utc(cls, value: datetime | None) -> datetime | None:
        return _canonical_utc(value, label="Work graph generatedAt") if value is not None else None

    @field_validator("reason", "nextSafeAction")
    @classmethod
    def text_is_safe(cls, value: str) -> str:
        if (
            not _is_safe_pipeline_control_text(value)
            or EPIC_25_EXECUTABLE_POLICY_TEXT_RE.search(value)
            or re.search(r"(?:^|[\\s\"'])/(?:home|tmp|var|etc)/", value, re.IGNORECASE)
        ):
            raise ValueError("Work graph text must be redacted metadata-only text.")
        return value

    @field_validator("evidenceRefs")
    @classmethod
    def evidence_refs_are_safe(cls, refs: list[str]) -> list[str]:
        if len(refs) > 20 or not all(_is_safe_pipeline_evidence_ref(ref) for ref in refs):
            raise ValueError("Work graph evidence refs must be bounded safe metadata refs.")
        return refs


class PipelineReviewRouteFindingSummaryV0View(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    count: int = Field(ge=0, le=32)
    highestSeverity: Literal["info", "low", "medium", "high"] | None = None
    evidenceRefs: list[str] = Field(default_factory=list)

    @field_validator("evidenceRefs")
    @classmethod
    def evidence_refs_are_safe(cls, refs: list[str]) -> list[str]:
        if len(refs) > 20 or not all(_is_safe_review_route_evidence_ref(ref) for ref in refs):
            raise ValueError("Review-route evidence refs must use the opaque allowlisted metadata reference grammar.")
        return refs


class PipelineReviewRouteEvidenceV0View(BaseModel):
    """Strict, detail-only view of report-only/simulated review preparation."""

    model_config = ConfigDict(extra="forbid")
    schemaVersion: Literal["pipeline-review-route-evidence/v0"] = "pipeline-review-route-evidence/v0"
    availability: Literal["available", "stale", "unavailable"]
    packetId: str
    routeState: Literal["report_only", "simulated", "blocked", "unavailable"]
    reasonCode: str
    reason: str
    safeFallback: str
    exactIdentity: Literal["current", "changed", "unavailable"]
    issuanceState: Literal["active", "expired", "revoked", "cancelled", "unavailable"]
    findingSummary: PipelineReviewRouteFindingSummaryV0View
    dataClass: Literal["metadata_only"] = "metadata_only"
    execution: Literal["none"] = "none"
    deliveryEvidenceEligible: Literal[False] = False
    metadataOnly: Literal[True] = True
    rawPayloadRetained: Literal[False] = False
    retention: Literal["metadata_only_evidence_references"] = "metadata_only_evidence_references"

    @field_validator("packetId")
    @classmethod
    def packet_id_is_safe(cls, value: str) -> str:
        if not _is_safe_pipeline_projection_packet_id(value):
            raise ValueError("Review-route packet identity must use the opaque safe identifier grammar.")
        return value

    @field_validator("reasonCode")
    @classmethod
    def reason_code_is_safe(cls, value: str) -> str:
        if value not in REVIEW_ROUTE_TEXT_BY_REASON_CODE:
            raise ValueError("Review-route reason code must use the bounded allowlist.")
        return value

    @field_validator("reason", "safeFallback")
    @classmethod
    def text_is_safe(cls, value: str) -> str:
        if (
            not _is_safe_pipeline_control_text(value)
            or UNSAFE_AUTHORITATIVE_METADATA_TEXT_RE.search(value)
            or re.search(r"\b(?:source|diff|prompt|completion|reasoning|secret|credential|token|payload|transcript)\b", value, re.IGNORECASE)
            or EPIC_25_EXECUTABLE_POLICY_TEXT_RE.search(value)
            or re.search(r"(?:^|[\\s\"'])/(?:home|tmp|var|etc)/", value, re.IGNORECASE)
        ):
            raise ValueError("Review-route text must be redacted metadata-only text.")
        return value

    @model_validator(mode="after")
    def state_is_honest(self):
        expected_text = REVIEW_ROUTE_TEXT_BY_REASON_CODE.get(self.reasonCode)
        if expected_text is None or (self.reason, self.safeFallback) != expected_text:
            raise ValueError("Review-route text must use the fixed generic template for its reason code.")
        expected = REVIEW_ROUTE_COMPATIBILITY_BY_REASON_CODE.get(self.reasonCode)
        if expected is None:
            raise ValueError("Review-route reason code must use the bounded compatibility matrix.")
        availability, route_states, exact_identity, issuance_state = expected
        if (
            self.availability != availability
            or self.routeState not in route_states
            or self.exactIdentity != exact_identity
            or self.issuanceState != issuance_state
        ):
            raise ValueError("Review-route state must match the reason-code compatibility matrix.")
        if self.reasonCode == "review_evidence_unavailable" and (
            self.findingSummary.count != 0
            or self.findingSummary.highestSeverity is not None
            or self.findingSummary.evidenceRefs
        ):
            raise ValueError("Unavailable review evidence must not carry route conclusions.")
        if self.findingSummary.count == 0 and self.findingSummary.highestSeverity is not None:
            raise ValueError("An empty finding summary cannot name a severity.")
        if self.findingSummary.count > 0 and self.findingSummary.highestSeverity is None:
            raise ValueError("A non-empty finding summary must name its highest severity.")
        return self


class PipelineSelectedPacketDetailV0View(BaseModel):
    packetId: str
    sourceRefs: list[AuthoritativePacketSourceRefView] = Field(default_factory=list)
    canonicalContract: PipelineCanonicalContractV1View | None = None
    productModeMapping: PipelineProductModeMappingV0View | None = None
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
    actionCapabilitiesV1: list[OperationalActionCapabilityV1] = Field(default_factory=list)
    actionResults: list[OperationalActionResultView] = Field(default_factory=list)
    actionResultsV1: list[OperationalActionResultV1] = Field(default_factory=list)
    workItemId: str | None = None
    queueLease: PipelineQueueLeaseV0View | None = None
    executionAttempts: list[PipelineExecutionAttemptLineageV0View] = Field(default_factory=list)
    correlationIds: list[str] = Field(default_factory=list)
    reviewRoute: PipelineReviewRouteEvidenceV0View
    workGraph: PipelineWorkGraphEvidenceV0View
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


class PipelineActiveManagerLaneClarityGoalV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str
    sourceRef: str

    @field_validator("summary")
    @classmethod
    def summary_is_safe(cls, value: str) -> str:
        if not _is_safe_lane_clarity_text(value):
            raise ValueError("Lane clarity goal summary must be safe metadata text.")
        return value

    @field_validator("sourceRef")
    @classmethod
    def source_ref_is_safe(cls, value: str) -> str:
        if not _is_safe_pipeline_evidence_ref(value):
            raise ValueError("Lane clarity source ref must be a safe metadata ref.")
        return value


class PipelineActiveManagerLaneClarityCriterionV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    criterionId: str
    summary: str
    disposition: Literal["met", "in_progress", "blocked", "not_assessed"]
    evidenceRefs: list[str] = Field(default_factory=list)

    @field_validator("criterionId")
    @classmethod
    def criterion_id_is_safe(cls, value: str) -> str:
        if not _is_safe_pipeline_evidence_ref(value):
            raise ValueError("Lane clarity criterion id must be a safe metadata ref.")
        return value

    @field_validator("summary")
    @classmethod
    def criterion_summary_is_safe(cls, value: str) -> str:
        if not _is_safe_lane_clarity_text(value):
            raise ValueError("Lane clarity criterion summary must be safe metadata text.")
        return value

    @field_validator("evidenceRefs")
    @classmethod
    def criterion_evidence_refs_are_safe(cls, refs: list[str]) -> list[str]:
        if not refs or len(refs) > 20 or not all(_is_safe_pipeline_evidence_ref(ref) for ref in refs):
            raise ValueError("Lane clarity criterion evidence refs must be safe metadata refs.")
        return refs


class PipelineActiveManagerLaneClarityCanonicalStateV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    phase: Literal[
        "queued", "leased", "running", "refilling", "completed", "failed",
        "expired", "blocked", "needs_review", "closed", "manager_only",
        "unknown", "no_safe_work", "authoritative_backlog_exhausted",
        "unverified", "simulated",
    ]
    freshness: Literal["fresh", "stale", "unknown"]
    evidenceFreshness: Literal["fresh", "stale", "missing", "unknown"]


class PipelineActiveManagerLaneClarityNextGateV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str
    nextSafeAction: str

    @field_validator("summary", "nextSafeAction")
    @classmethod
    def text_is_safe(cls, value: str) -> str:
        if not _is_safe_lane_clarity_text(value):
            raise ValueError("Lane clarity next-gate text must be safe metadata text.")
        return value


class PipelineActiveManagerLaneClarityPostureV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    state: Literal["on_scope", "pivot_required", "not_assessed"]
    reason: str
    nextSafeAction: str
    decisionRef: str | None = None
    qualification: Literal["operator_drift_concern", "second_qualified_recovery_detour"] | None = None

    @field_validator("reason", "nextSafeAction")
    @classmethod
    def text_is_safe(cls, value: str) -> str:
        if not _is_safe_lane_clarity_text(value):
            raise ValueError("Lane clarity posture text must be safe metadata text.")
        return value

    @field_validator("decisionRef")
    @classmethod
    def decision_ref_is_safe(cls, value: str | None) -> str | None:
        if value is not None and not _is_safe_pipeline_evidence_ref(value):
            raise ValueError("Lane clarity decision ref must be a safe metadata ref.")
        return value


class PipelineActiveManagerLaneClarityV0View(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schemaVersion: Literal["manager-lane-clarity/v0"] = "manager-lane-clarity/v0"
    runId: str
    eventWatermark: str
    sourceCursor: str
    goal: PipelineActiveManagerLaneClarityGoalV0View
    criteria: list[PipelineActiveManagerLaneClarityCriterionV0View] = Field(default_factory=list)
    canonicalState: PipelineActiveManagerLaneClarityCanonicalStateV0View
    nextGate: PipelineActiveManagerLaneClarityNextGateV0View
    posture: PipelineActiveManagerLaneClarityPostureV0View
    metadataOnly: Literal[True] = True
    rawPayloadRetained: Literal[False] = False

    @field_validator("runId", "eventWatermark", "sourceCursor")
    @classmethod
    def identity_is_safe(cls, value: str) -> str:
        if not _is_safe_pipeline_evidence_ref(value):
            raise ValueError("Lane clarity identity must be a safe metadata ref.")
        return value

    @field_validator("criteria")
    @classmethod
    def criteria_are_bounded(cls, criteria: list[PipelineActiveManagerLaneClarityCriterionV0View]) -> list[PipelineActiveManagerLaneClarityCriterionV0View]:
        if len(criteria) > 24:
            raise ValueError("Lane clarity criteria must be bounded.")
        return criteria

    @model_validator(mode="after")
    def assessed_postures_require_criterion_evidence(self) -> "PipelineActiveManagerLaneClarityV0View":
        if self.posture.state in {"on_scope", "pivot_required"} and not self.criteria:
            raise ValueError("Assessed lane clarity postures require criterion evidence.")
        if self.posture.state in {"on_scope", "pivot_required"} and (
            self.canonicalState.freshness != "fresh"
            or self.canonicalState.evidenceFreshness != "fresh"
        ):
            raise ValueError("Assessed lane clarity postures require fresh canonical evidence.")
        if self.posture.state == "pivot_required" and (
            self.posture.decisionRef is None or self.posture.qualification is None
        ):
            raise ValueError("Pivot-required lane clarity must retain bounded decision provenance.")
        if self.posture.state != "pivot_required" and (
            self.posture.decisionRef is not None or self.posture.qualification is not None
        ):
            raise ValueError("Only pivot-required lane clarity may retain decision provenance.")
        return self


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


class PipelineExecuteAdmissionCountsV0View(BaseModel):
    review: int = Field(ge=0)
    deliver: int = Field(ge=0)
    verification: int = Field(ge=0)
    operatorTesting: int = Field(ge=0)


class PipelineExecuteAdmissionV0View(BaseModel):
    schemaVersion: Literal["pipeline-execute-admission/v0"] = "pipeline-execute-admission/v0"
    policyVersion: Literal["supervisor-wip/v0"] = "supervisor-wip/v0"
    state: Literal["ready", "blocked", "unavailable"]
    capacityAvailable: bool
    typedReason: Literal[
        "capacity_available",
        "review_wip_limit_reached",
        "deliver_wip_limit_reached",
        "verification_wip_limit_reached",
        "operator_testing_wip_limit_reached",
        "runtime_unavailable",
    ]
    source: Literal["supervisor_settings", "unavailable"]
    limits: PipelineExecuteAdmissionCountsV0View | None = None
    observed: PipelineExecuteAdmissionCountsV0View | None = None
    blockingDimensions: list[Literal["review", "deliver", "verification", "operatorTesting"]] = Field(default_factory=list)
    nextSafeAction: str
    evidenceRefs: list[str] = Field(default_factory=list)
    metadataOnly: Literal[True] = True
    rawPayloadRetained: Literal[False] = False

    @field_validator("evidenceRefs")
    @classmethod
    def evidence_refs_are_safe(cls, refs: list[str]) -> list[str]:
        if not all(_is_safe_pipeline_evidence_ref(ref) for ref in refs):
            raise ValueError("Execute admission evidence refs must be safe metadata refs.")
        return refs


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
    activeManagerLaneClarity: PipelineActiveManagerLaneClarityV0View | None = None
    coordinationHealth: "PipelineCoordinationHealthV0View | None" = None
    workerSummary: PipelineWorkerSummaryV0View
    reliabilityProblems: list[PipelineReliabilityProblemV0View] = Field(default_factory=list)
    gatedControls: list[PipelineGatedControlV0View] = Field(default_factory=list)
    runtimeReadiness: PipelineRuntimeReadinessV0View
    actionCapabilities: list[OperationalActionCapabilityView] = Field(default_factory=list)
    actionCapabilitiesV1: list[OperationalActionCapabilityV1] = Field(default_factory=list)
    executeAdmission: PipelineExecuteAdmissionV0View
    queueSummary: PipelineQueueSummaryV0View
    evidenceRefs: list[str] = Field(default_factory=list)


class PipelineDashboardProjectionApiEnvelope(BaseModel):
    """Typed response boundary for supervisor-owned pipeline projections."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: PipelineDashboardProjectionV0View
    meta: dict[str, Any] | None = None


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


class WorkPacketApiEnvelope(BaseModel):
    """Typed response boundary for a supervisor-owned WorkPacketV0 detail."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: WorkPacketV0View
    meta: dict[str, Any] | None = None


class WorkPacketListApiEnvelope(BaseModel):
    """Typed response boundary for supervisor-owned cockpit WorkPacketV0 rows."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: list[WorkPacketV0View]
    meta: dict[str, Any] | None = None


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


class LocalEvidencePacketApiEnvelope(BaseModel):
    """Typed response boundary for supervisor-owned local evidence packets."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: LocalEvidencePacketView
    meta: dict[str, Any] | None = None


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


class RoutingLaneProfileListApiEnvelope(BaseModel):
    """Typed response boundary for the supervisor-owned routing lane catalog."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: list[RoutingLaneEvidenceProfileView]
    meta: dict[str, Any] | None = None



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


class WorkerRegistryListApiEnvelope(BaseModel):
    """Typed response boundary for the supervisor-owned worker registry."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: list[WorkerRegistryEntryView]
    meta: dict[str, Any] | None = None


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


class ExecutionConfigurationChecksApiEnvelope(BaseModel):
    """Typed response boundary for supervisor-owned execution configuration checks."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: ExecutionConfigurationChecksView
    meta: dict[str, str | int | float | bool | None] | None = None


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
    model_config = ConfigDict(extra="forbid", strict=True)

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


class DisabledProviderProofListApiEnvelope(BaseModel):
    """Typed response boundary for disabled-provider proof reads."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: list[DisabledProviderProofView]
    meta: dict[str, str | int | float | bool | None] | None = None


class ExecutionStateBoundaryView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    boundaryId: str
    generatedAt: datetime
    summary: str
    queueLeaseRole: list[str]
    executionAttemptRole: list[str]
    forbiddenQueueLeaseFields: list[str]
    futureProcessLifecycleAttachments: list[str]
    queueLeaseGrantsExecutionAuthority: Literal[False] = False
    executionAttemptLaunchesWorkers: Literal[False] = False


class ExecutionStateBoundaryApiEnvelope(BaseModel):
    """Typed response boundary for the supervisor-owned execution-state boundary."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: ExecutionStateBoundaryView
    meta: dict[str, str | int | float | bool | None] | None = None


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


class ExecutionReadinessReportApiEnvelope(BaseModel):
    """Typed response boundary for supervisor-owned execution readiness reports."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: ExecutionReadinessReportView
    meta: dict[str, str | int | float | bool | None] | None = None


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


class DocumentationAuthorityReportApiEnvelope(BaseModel):
    """Typed response boundary for supervisor-owned documentation authority reports."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: DocumentationAuthorityReportView
    meta: dict[str, str | int | float | bool | None] | None = None


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


class LegacyPlanningArtifactInventoryApiEnvelope(BaseModel):
    """Typed response boundary for supervisor-owned legacy planning inventory."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: LegacyPlanningArtifactInventoryReportView
    meta: dict[str, str | int | float | bool | None] | None = None


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


class VerificationReadinessReportApiEnvelope(BaseModel):
    """Typed response boundary for supervisor-owned verification readiness reports."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: VerificationReadinessReportView
    meta: dict[str, str | int | float | bool | None] | None = None


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


class AuthorityReadinessMatrixReportApiEnvelope(BaseModel):
    """Typed response boundary for supervisor-owned authority readiness matrices."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: AuthorityReadinessMatrixReportView
    meta: dict[str, str | int | float | bool | None] | None = None


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


class DashboardE2EReportApiEnvelope(BaseModel):
    """Typed response boundary for the supervisor-owned dashboard E2E report."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: DashboardE2EReportView
    meta: dict[str, str | int | float | bool | None] | None = None


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


class SupervisorReportCatalogApiEnvelope(BaseModel):
    """Typed response boundary for the supervisor-owned report catalog."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: SupervisorReportCatalogView
    meta: dict[str, str | int | float | bool | None] | None = None


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


class MaintenanceReadinessReportApiEnvelope(BaseModel):
    """Typed response boundary for the supervisor-owned maintenance readiness report."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: MaintenanceReadinessReportView
    meta: dict[str, str | int | float | bool | None] | None = None


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


class SafeDevelopmentBacklogReportApiEnvelope(BaseModel):
    """Typed response boundary for the supervisor-owned safe development backlog."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: SafeDevelopmentBacklogReportView
    meta: dict[str, str | int | float | bool | None] | None = None


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


class RunnerClosedHistoryProjectionView(BaseModel):
    """Aggregate-only evidence for closed workspace and lane records omitted from the live projection."""

    workspaceRows: int = 0
    laneRows: int = 0
    totalRows: int = 0
    omittedRows: int = 0
    degradedRows: int = 0
    warningCounts: dict[str, int] = Field(default_factory=dict)
    unlistedWarningCount: int = 0
    retention: Literal["aggregate-only"] = "aggregate-only"


class RunnerSourceCompletionRollupView(BaseModel):
    total: int = 0
    assignment: int = 0
    workspace: int = 0
    sourceBacklogItemIds: list[str] = Field(default_factory=list)
    sourceBacklogItemIdsTotal: int = 0
    sourceBacklogItemIdsRetained: int = 0
    sourceBacklogItemIdsOmitted: int = 0
    sourceBacklogItemIdsStatus: Literal["complete", "truncated"] = "complete"


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
    closedHistory: RunnerClosedHistoryProjectionView = Field(default_factory=RunnerClosedHistoryProjectionView)
    sourceCompletionRollup: RunnerSourceCompletionRollupView = Field(default_factory=RunnerSourceCompletionRollupView)
    dispatcherContinuity: RunnerDispatcherContinuitySnapshotView
    dispatchDecisionExplanations: list[RunnerDispatchDecisionExplanationView] = Field(default_factory=list)
    workspaceAssignments: list[RunnerWorkspaceAssignmentView] = Field(default_factory=list)
    laneAssignments: list[RunnerLaneAssignmentView] = Field(default_factory=list)
    backlogCandidates: list[RunnerBacklogCandidateView] = Field(default_factory=list)
    degradedInputs: list[RunnerAssignmentDegradedInputView] = Field(default_factory=list)


class RunnerAssignmentStatusReportApiEnvelope(BaseModel):
    """Typed response boundary for the supervisor-owned runner assignment status."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: RunnerAssignmentStatusReportView
    meta: dict[str, str | int | float | bool | None] | None = None


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


class MaintenanceActionPlanReportApiEnvelope(BaseModel):
    """Typed response boundary for the supervisor-owned maintenance action plan."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: MaintenanceActionPlanReportView
    meta: dict[str, str | int | float | bool | None] | None = None


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


class DevelopmentRunwayReportApiEnvelope(BaseModel):
    """Typed response boundary for the supervisor-owned development runway."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: DevelopmentRunwayReportView
    meta: dict[str, str | int | float | bool | None] | None = None


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


class RuntimeEvidenceReviewReportApiEnvelope(BaseModel):
    """Typed response boundary for the supervisor-owned runtime evidence review."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: RuntimeEvidenceReviewReportView
    meta: dict[str, str | int | float | bool | None] | None = None


class ThreatBoundaryRuleView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    ruleId: str
    label: str
    status: str
    summary: str
    blockedReason: str
    evidence: list[str] = Field(default_factory=list)


class ThreatBoundaryView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

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
    processLaunchAllowed: Literal[False] = False
    providerCallsAllowed: Literal[False] = False
    modelCallsAllowed: Literal[False] = False
    premiumExecutionAllowed: Literal[False] = False
    commandExecutionAllowed: Literal[False] = False
    sourceMutationAllowed: Literal[False] = False
    networkAllowed: Literal[False] = False
    credentialAccessAllowed: Literal[False] = False


class ThreatBoundaryApiEnvelope(BaseModel):
    """Typed response boundary for the supervisor threat boundary report."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: ThreatBoundaryView
    meta: dict[str, str | int | float | bool | None] | None = None


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
    model_config = ConfigDict(extra="forbid")

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


class ExecutionRecipeListApiEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    data: list[WorkItemExecutionRecipeView]
    meta: dict[str, Any] | None = None


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


class ManagedRecipePolicyReportApiEnvelope(BaseModel):
    """Typed response boundary for the supervisor-owned managed recipe policy."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: ManagedRecipePolicyReportView
    meta: dict[str, str | int | float | bool | None] | None = None


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


class GitHubWorkflowPolicyReportApiEnvelope(BaseModel):
    """Typed response boundary for the supervisor-owned GitHub workflow policy."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: GitHubWorkflowPolicyReportView
    meta: dict[str, str | int | float | bool | None] | None = None


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


class GitHygieneReportApiEnvelope(BaseModel):
    """Typed response boundary for the supervisor-owned Git hygiene report."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: GitHygieneReportView
    meta: dict[str, str | int | float | bool | None] | None = None


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


class LocalWorktreePlanApiEnvelope(BaseModel):
    """Typed response boundary for supervisor-owned local worktree plans."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: LocalWorktreePlanView
    meta: dict[str, str | int | float | bool | None] | None = None


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


class CodexReadinessReportApiEnvelope(BaseModel):
    """Typed response boundary for the supervisor-owned Codex readiness report."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: CodexReadinessReportView
    meta: dict[str, str | int | float | bool | None] | None = None


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


class CodexImplementationApprovalReportApiEnvelope(BaseModel):
    """Typed response boundary for the supervisor-owned Codex approval report."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: CodexImplementationApprovalReportView
    meta: dict[str, str | int | float | bool | None] | None = None


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


class ClaudeReviewReadinessReportApiEnvelope(BaseModel):
    """Typed response boundary for the supervisor-owned Claude readiness report."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: ClaudeReviewReadinessReportView
    meta: dict[str, str | int | float | bool | None] | None = None


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


class ClaudeReviewApprovalReportApiEnvelope(BaseModel):
    """Typed response boundary for the supervisor-owned Claude approval report."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: ClaudeReviewApprovalReportView
    meta: dict[str, str | int | float | bool | None] | None = None


class ReviewResourcePolicyTriggerView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    triggerId: str
    label: str
    status: str
    summary: str
    evidenceSignals: list[str]
    recommendedRoutes: list[str]


class ReviewResourcePolicyRouteView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

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
    model_config = ConfigDict(extra="forbid", strict=True)

    scenarioId: str
    label: str
    triggerIds: list[str]
    selectedRoutes: list[str]
    policyBasis: str
    retentionSummary: str
    nextSafeAction: str


class ReviewResourcePolicyPacketEvaluationView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    packetId: str
    packetKind: str
    triggerIds: list[str]
    selectedRoutes: list[str]
    decisionBasis: str
    retainedEvidence: list[str]
    stopLines: list[str]
    readOnly: Literal[True]
    processLaunchApproved: Literal[False]
    sourceMutationApproved: Literal[False]
    githubMutationApproved: Literal[False]
    rawProviderPayloadsRetained: Literal[False]
    rawReasoningRetained: Literal[False]


class ReviewResourcePolicyReportView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

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
    readOnly: Literal[True]
    processLaunchApproved: Literal[False]
    sourceMutationApproved: Literal[False]
    githubMutationApproved: Literal[False]
    rawProviderPayloadsRetained: Literal[False]
    rawReasoningRetained: Literal[False]


class ReviewResourcePolicyReportApiEnvelope(BaseModel):
    """Typed response boundary for the supervisor-owned review resource policy."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: ReviewResourcePolicyReportView
    meta: dict[str, str | int | float | bool | None] | None = None


class GitHubDeliveryAuthorityStepView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    stepId: str
    label: str
    status: str
    summary: str
    requiredApproval: str
    evidence: list[str]


class GitHubDeliveryEligibilityStageView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    stageId: str
    label: str
    status: str
    summary: str
    eligibleWhen: list[str]
    hardStops: list[str]
    allowedOperations: list[str]
    blockedOperations: list[str]


class GitHubDeliveryAuthorityReportView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

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
    readOnly: Literal[True]
    pushApproved: Literal[False]
    pullRequestApproved: Literal[False]
    ciWaitApproved: Literal[False]
    reviewResolutionApproved: Literal[False]
    mergeApproved: Literal[False]
    remoteCleanupApproved: Literal[False]
    automaticDeliveryApproved: Literal[False]

    @field_validator(
        "readOnly",
        "pushApproved",
        "pullRequestApproved",
        "ciWaitApproved",
        "reviewResolutionApproved",
        "mergeApproved",
        "remoteCleanupApproved",
        "automaticDeliveryApproved",
        mode="before",
    )
    @classmethod
    def _require_exact_boolean_safety_flags(cls, value: object) -> object:
        if type(value) is not bool:
            raise ValueError("GitHub delivery authority safety flags must be exact JSON booleans")
        return value


class GitHubDeliveryAuthorityReportApiEnvelope(BaseModel):
    """Typed response boundary for the supervisor-owned GitHub authority report."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: GitHubDeliveryAuthorityReportView
    meta: dict[str, str | int | float | bool | None] | None = None


class TrustedDeliveryEligibilityCheckView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    checkId: str
    label: str
    gateFamily: str
    status: str
    summary: str
    evidence: list[str] = Field(default_factory=list)
    blockedReason: str | None = None


class TrustedDeliveryEligibilityStageEvaluationView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    stageId: str
    label: str
    status: str
    eligible: bool
    checks: list[TrustedDeliveryEligibilityCheckView]
    allowedOperations: list[str] = Field(default_factory=list)
    blockedOperations: list[str] = Field(default_factory=list)
    nextAction: str


class TrustedDeliveryDiffGuardFileView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    path: str
    changeType: str
    classification: str
    reason: str


class TrustedDeliveryDiffGuardView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

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
    model_config = ConfigDict(extra="forbid", strict=True)

    fixtureId: str
    label: str
    guard: TrustedDeliveryDiffGuardView


class TrustedDeliveryVerificationEvidenceView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

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
    model_config = ConfigDict(extra="forbid", strict=True)

    fixtureId: str
    label: str
    evidence: TrustedDeliveryVerificationEvidenceView
    greenGateContribution: str
    blockedReason: str | None = None


class TrustedDeliveryActionEligibilityView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    actionId: str
    label: str
    status: str
    evidence: list[str]
    blockedReasons: list[str]
    nextAction: str
    executionApproved: Literal[False] = False


class TrustedDeliveryActionEligibilityFixtureView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    fixtureId: str
    label: str
    actions: list[TrustedDeliveryActionEligibilityView]


class TrustedDeliveryEligibilityReportView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

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
    readOnly: Literal[True]
    automaticDeliveryApproved: Literal[False]
    pushPrAutoEligible: bool
    mergeAutoEligible: bool
    cleanupAutoEligible: bool

    @field_validator(
        "readOnly",
        "automaticDeliveryApproved",
        mode="before",
    )
    @classmethod
    def _require_exact_boolean_safety_flags(cls, value: object) -> object:
        if type(value) is not bool:
            raise ValueError("Trusted delivery safety flags must be exact booleans.")
        return value


class TrustedDeliveryEligibilityReportApiEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    data: TrustedDeliveryEligibilityReportView
    meta: dict[str, str | int | float | bool | None] | None = None


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
    readOnly: Literal[True] = True


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
    metadataOnly: Literal[True] = True
    mergeApproved: Literal[False] = False


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
    metadataOnly: Literal[True] = True
    cleanupApproved: Literal[False] = False


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
    readOnly: Literal[True] = True
    remoteMutationApproved: Literal[False] = False
    cleanupApproved: Literal[False] = False
    automaticDeliveryApproved: Literal[False] = False


class LowRiskDeliveryPlanReportApiEnvelope(BaseModel):
    """Typed read-only response boundary for low-risk delivery planning."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: LowRiskDeliveryPlanReportView
    meta: dict[str, str | int | float | bool | None] | None = None


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
    model_config = ConfigDict(extra="forbid", strict=True)

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


class DeliveryExecutionEvidenceApiEnvelope(BaseModel):
    """Typed metadata-only response boundary for delivery execution evidence."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: DeliveryExecutionEvidenceView
    meta: dict[str, str | int | float | bool | None] | None = None


class CleanupPlanResidueView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    kind: str
    path: str
    insideApprovedTarget: bool
    safeToRemoveAfterApproval: bool


class CleanupPlanView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

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
    readOnly: Literal[True] = True
    cleanupAllowed: Literal[False] = False
    branchDeletionApproved: Literal[False] = False
    worktreeRemovalApproved: Literal[False] = False
    evidenceDeletionApproved: Literal[False] = False
    remoteMutationApproved: Literal[False] = False


class CleanupPlanApiEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    data: CleanupPlanView
    meta: dict[str, str | int | float | bool | None] | None = None


class LocalCleanupPolicyItemView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    itemId: str
    label: str
    status: str
    summary: str
    evidence: list[str]


class LocalCleanupReadinessReportView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    reportId: str
    generatedAt: datetime
    summary: str
    cleanupPolicy: list[LocalCleanupPolicyItemView]
    requiredEvidence: list[str]
    blockedTargets: list[str]
    stopConditions: list[str]
    nextSafeActions: list[str]
    readOnly: Literal[True] = True
    automaticCleanupApproved: Literal[False] = False
    worktreeRemovalApproved: Literal[False] = False
    branchDeletionApproved: Literal[False] = False
    evidenceDeletionApproved: Literal[False] = False


class LocalCleanupReadinessReportApiEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    data: LocalCleanupReadinessReportView
    meta: dict[str, str | int | float | bool | None] | None = None


class RemoteCleanupSyncPolicyItemView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    itemId: str
    label: str
    status: str
    summary: str
    evidence: list[str]


class RemoteCleanupSyncReadinessReportView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    reportId: str
    generatedAt: datetime
    summary: str
    syncPolicy: list[RemoteCleanupSyncPolicyItemView]
    requiredEvidence: list[str]
    blockedOperations: list[str]
    stopConditions: list[str]
    nextSafeActions: list[str]
    readOnly: Literal[True] = True
    remoteBranchDeletionApproved: Literal[False] = False
    issueSyncApproved: Literal[False] = False
    storyStatusSyncApproved: Literal[False] = False
    remoteMutationApproved: Literal[False] = False


class RemoteCleanupSyncReadinessReportApiEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    data: RemoteCleanupSyncReadinessReportView
    meta: dict[str, str | int | float | bool | None] | None = None


class TrustedAutonomyReadinessGateView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    gateId: str
    label: str
    status: str
    summary: str
    evidence: list[str]


class TrustedAutonomyDeauthorizationTriggerView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    triggerId: str
    label: str
    status: str
    summary: str
    deauthorizedOperations: list[str]
    recoveryEvidence: list[str]


class TrustedAutonomyReadinessReportView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

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
    readOnly: Literal[True] = True
    lowRiskAutonomyApproved: Literal[False] = False
    autonomousProviderUseApproved: Literal[False] = False
    autonomousGitHubDeliveryApproved: Literal[False] = False
    autonomousCleanupApproved: Literal[False] = False


class TrustedAutonomyReadinessReportApiEnvelope(BaseModel):
    """Typed response boundary for the read-only autonomy readiness report."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: TrustedAutonomyReadinessReportView
    meta: dict[str, str | int | float | bool | None] | None = None


class MvpProofTrialStepView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    stepId: str
    label: str
    status: str
    summary: str
    requiredApproval: str
    evidence: list[str]


class MvpProofTrialReportView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

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
    readOnly: Literal[True] = True
    codexLaunchApproved: Literal[True] = True
    claudeLaunchApproved: Literal[False] = False
    providerExpansionApproved: Literal[False] = False
    autonomousDeliveryApproved: Literal[False] = False


class MvpProofTrialReportApiEnvelope(BaseModel):
    """Typed response boundary for the read-only Epic 6 proof-trial report."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: MvpProofTrialReportView
    meta: dict[str, str | int | float | bool | None] | None = None


class DeliveryReadinessPolicyItemView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    itemId: str
    label: str
    status: str
    summary: str
    evidence: list[str]


class DeliveryReadinessPolicyReportView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    reportId: str
    generatedAt: datetime
    summary: str
    statusPolicy: list[DeliveryReadinessPolicyItemView]
    waiverPolicy: list[DeliveryReadinessPolicyItemView]
    promoteReadinessPolicy: list[DeliveryReadinessPolicyItemView]
    deliverReadinessPolicy: list[DeliveryReadinessPolicyItemView]
    blockerRoutingPolicy: list[DeliveryReadinessPolicyItemView]
    stopLines: list[str]
    nextSafeActions: list[str]
    readOnly: Literal[True]
    executionAuthorityApproved: Literal[False]
    remoteAutomationApproved: Literal[False]

    @field_validator("readOnly", "executionAuthorityApproved", "remoteAutomationApproved", mode="before")
    @classmethod
    def _require_exact_boolean_safety_flags(cls, value: object) -> object:
        if type(value) is not bool:
            raise ValueError("delivery readiness safety flags must be exact JSON booleans")
        return value


class DeliveryReadinessPolicyReportApiEnvelope(BaseModel):
    """Typed response boundary for the supervisor-owned delivery readiness policy."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: DeliveryReadinessPolicyReportView
    meta: dict[str, str | int | float | bool | None] | None = None


class WorkItemView(BaseModel):
    model_config = ConfigDict(extra="forbid")

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

    @model_validator(mode="before")
    @classmethod
    def _work_item_view_must_be_strict(cls, value):
        _strict_contract_payload(value, cls, path="workItem")
        return value


class WorkItemApiEnvelope(BaseModel):
    """Typed response boundary for a supervisor-owned WorkItem detail."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: WorkItemView
    meta: dict[str, str | int | float | bool | None] | None = None

    @model_validator(mode="before")
    @classmethod
    def _work_item_result_must_be_strict(cls, value):
        if isinstance(value, dict) and "data" in value:
            _strict_contract_payload(value["data"], WorkItemView, path="data")
        return value


class CandidateWorkPromotionView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    candidateWork: CandidateWorkView
    workItem: WorkItemView

    @model_validator(mode="before")
    @classmethod
    def _promotion_children_must_reject_unknown_fields(cls, value):
        if not isinstance(value, dict):
            return value
        _strict_contract_payload(value.get("candidateWork"), CandidateWorkView, path="candidateWork")
        _strict_contract_payload(value.get("workItem"), WorkItemView, path="workItem")
        return value


class CandidateWorkPromotionApiEnvelope(BaseModel):
    """Typed response boundary for supervisor-owned candidate promotion."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: CandidateWorkPromotionView
    meta: dict[str, str | int | float | bool | None] | None = None


class WorkItemListApiEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    data: list[WorkItemView]
    meta: dict[str, Any] | None = None


class RunStatusView(BaseModel):
    mode: RunMode
    revision: PositiveInt
    pollIntervalSeconds: int
    queueCount: int
    activeCount: int
    activeWorkCount: int
    activeLeaseCount: int
    runningAttemptCount: int
    drainConverged: bool
    blockedCount: int
    doneCount: int
    summary: str


class RunStatusApiEnvelope(BaseModel):
    """Typed response boundary for the supervisor-owned runtime status."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: RunStatusView
    meta: dict[str, str | int | float | bool | None] | None = None


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


class AuditEventApiEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    data: list[AuditEventView]
    meta: dict[str, Any] | None = None


class WorkflowEventApiEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    data: list[WorkflowEventView]
    meta: dict[str, Any] | None = None


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


class RuntimeEvidenceExportApiEnvelope(BaseModel):
    """Typed response boundary for a supervisor-owned runtime evidence export."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: RuntimeEvidenceExportView
    meta: dict[str, Any] | None = None


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


class OperatorViewListApiEnvelope(BaseModel):
    """Typed response boundary for supervisor-owned saved operator views."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: list[OperatorViewResponse]
    meta: dict[str, Any] | None = None


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
        if value != value.strip() or any(ord(character) < 32 or ord(character) == 127 for character in value):
            raise ValueError(f"{info.field_name} must use canonical metadata without padding or control characters.")
        return _validate_authoritative_metadata_text(value, path=info.field_name)

    @field_validator("sourceRefs", "evidenceRefs")
    @classmethod
    def _refs_must_be_safe(cls, values: list[str], info) -> list[str]:
        if any(value != value.strip() or any(ord(character) < 32 or ord(character) == 127 for character in value) for value in values):
            raise ValueError(f"{info.field_name} must use canonical metadata without padding or control characters.")
        safe = [
            _validate_authoritative_metadata_text(value, path=f"{info.field_name}[]")
            for value in values
        ]
        if any(not _is_safe_pipeline_evidence_ref(value) for value in safe):
            raise ValueError(f"{info.field_name} contains an unsafe metadata reference.")
        if len(set(safe)) != len(safe):
            raise ValueError(f"{info.field_name} must not contain duplicate references.")
        return safe


MANAGER_TERMINAL_EVENT_REQUEST_FIELDS = (
    "eventId",
    "eventType",
    "runId",
    "sourceIdentity",
    "sourceRevision",
    "reconciliationCounts",
    "unresolvedApprovalGatedWork",
    "evidenceRefs",
    "resumeRequirement",
    "nextManagerAction",
    "idempotencyKey",
    "metadataOnly",
    "rawPayloadRetained",
)
MANAGER_TERMINAL_EVENT_VIEW_FIELDS = (
    "eventId",
    "eventType",
    "runId",
    "sourceIdentity",
    "sourceRevision",
    "reconciliationCounts",
    "unresolvedApprovalGatedWork",
    "evidenceRefs",
    "resumeRequirement",
    "nextManagerAction",
    "idempotencyKey",
    "metadataOnly",
    "rawPayloadRetained",
    "owner",
    "createdAt",
)
MANAGER_TERMINAL_EVENT_API_ENVELOPE_FIELDS = (
    "data",
    "meta",
)
SUPERVISOR_TERMINAL_EVENT_PROJECTION_FIELDS = (
    "projectionId",
    "generatedAt",
    "status",
    "event",
    "owner",
    "metadataOnly",
    "rawPayloadRetained",
)
SUPERVISOR_TERMINAL_EVENT_PROJECTION_API_ENVELOPE_FIELDS = (
    "data",
    "meta",
)
SUPERVISOR_TERMINAL_EVENT_PROJECTION_REQUIRED_FIELDS = (
    "projectionId",
    "generatedAt",
    "status",
    "event",
    "owner",
    "metadataOnly",
    "rawPayloadRetained",
)
SUPERVISOR_TERMINAL_EVENT_PROJECTION_API_ENVELOPE_REQUIRED_FIELDS = (
    "data",
)
MANAGER_TERMINAL_EVENT_API_ENVELOPE_REQUIRED_FIELDS = (
    "data",
)
MANAGER_TERMINAL_EVENT_TYPE = "authoritative_backlog_exhausted"


class ManagerTerminalEventRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    eventId: str = Field(max_length=120)
    eventType: Literal[MANAGER_TERMINAL_EVENT_TYPE]
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
        if value != value.strip():
            raise ValueError(f"{info.field_name} must not contain leading or trailing whitespace.")
        safe = _validate_authoritative_metadata_text(value, path=info.field_name)
        if info.field_name == "eventId" and not re.fullmatch(
            r"manager-terminal-event:[0-9a-f]{40}", safe
        ):
            raise ValueError(
                "eventId must be manager-terminal-event:<40 lowercase hex>."
            )
        return safe

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
        if any(value != value.strip() for value in values):
            raise ValueError("evidenceRefs must not contain leading or trailing whitespace.")
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
            raise ValueError(f"{MANAGER_TERMINAL_EVENT_TYPE} cannot retain required executable work.")
        if counts.approvalGated != len(self.unresolvedApprovalGatedWork):
            raise ValueError("approvalGated must equal the unresolvedApprovalGatedWork count.")
        work_ids = [item.workId for item in self.unresolvedApprovalGatedWork]
        if len(set(work_ids)) != len(work_ids):
            raise ValueError("unresolvedApprovalGatedWork must not contain duplicate workId values.")
        return self


class ManagerTerminalEventView(ManagerTerminalEventRequest):
    """Supervisor-owned canonical terminal-event read model."""

    owner: Literal["supervisor"]
    createdAt: str = Field(
        max_length=64,
        pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$",
    )


class ManagerTerminalEventApiEnvelope(BaseModel):
    """Typed supervisor-owned response boundary for canonical terminal events."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: ManagerTerminalEventView
    meta: dict[str, str | int | float | bool | None] | None = None


class ManagerLaneClarityHandoffRequest(BaseModel):
    """Metadata-only manager snapshot accepted only through the local transport."""

    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["manager-lane-clarity-handoff/v0"]
    handoffId: str = Field(max_length=120, pattern=r"^manager-lane-clarity-handoff:[0-9a-f]{40}$")
    selectedLaneId: str = Field(max_length=160)
    runId: str = Field(max_length=120)
    eventWatermark: str = Field(max_length=160)
    sourceCursor: str = Field(max_length=160)
    sourceSequence: PositiveInt
    observedAt: datetime
    laneClarity: PipelineActiveManagerLaneClarityV0View
    idempotencyKey: str = Field(max_length=180)
    metadataOnly: Literal[True]
    rawPayloadRetained: Literal[False]

    @field_validator("selectedLaneId", "runId", "eventWatermark", "sourceCursor", "idempotencyKey")
    @classmethod
    def _handoff_identity_is_safe(cls, value: str, info) -> str:
        if value != value.strip():
            raise ValueError(f"{info.field_name} must not contain leading or trailing whitespace.")
        return _validate_authoritative_metadata_text(value, path=info.field_name)

    @field_validator("observedAt", mode="before")
    @classmethod
    def _parse_rfc3339_observed_at(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("Lane clarity handoff observedAt must be an RFC 3339 timestamp.") from exc

    @model_validator(mode="after")
    def _handoff_matches_nested_clarity(self) -> "ManagerLaneClarityHandoffRequest":
        clarity = self.laneClarity
        if (
            clarity.runId != self.runId
            or clarity.eventWatermark != self.eventWatermark
            or clarity.sourceCursor != self.sourceCursor
        ):
            raise ValueError("Lane clarity handoff identity must exactly match the nested clarity snapshot.")
        if self.observedAt.tzinfo is None:
            raise ValueError("Lane clarity handoff observedAt must be timezone-aware.")
        return self


class ManagerLaneClarityHandoffView(ManagerLaneClarityHandoffRequest):
    owner: Literal["supervisor"]
    createdAt: datetime


class ManagerLaneClarityHandoffApiEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    data: ManagerLaneClarityHandoffView
    meta: dict[str, str | int | float | bool | None] | None = None


class PipelineCoordinationHealthV0View(BaseModel):
    """Manager-owned, metadata-only coordination snapshot for the pipeline."""

    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["manager-coordination-health/v0"]
    runId: str = Field(max_length=120)
    observedAt: datetime
    source: Literal["manager_workspace_inventory"]
    freshness: Literal["fresh", "unavailable"]
    availability: Literal["available", "incomplete", "unavailable"]
    activeWorkCount: int = Field(ge=0)
    staleOwnerTargetCount: int = Field(ge=0)
    staleOwnerProjectedCount: int = Field(ge=0)
    dirtyPreserveCount: int = Field(ge=0)
    missingWorktreeJournalHold: bool
    nextSafeAction: str = Field(max_length=260)
    evidenceRefs: list[str] = Field(default_factory=list, max_length=8)
    metadataOnly: Literal[True]
    rawPayloadRetained: Literal[False]

    @field_validator("runId", "nextSafeAction")
    @classmethod
    def _coordination_metadata_is_safe(cls, value: str, info) -> str:
        if value != value.strip():
            raise ValueError(f"{info.field_name} must not contain leading or trailing whitespace.")
        return _validate_authoritative_metadata_text(value, path=info.field_name)

    @field_validator("evidenceRefs")
    @classmethod
    def _coordination_evidence_refs_are_safe(cls, refs: list[str]) -> list[str]:
        if not all(_is_safe_pipeline_evidence_ref(ref) for ref in refs):
            raise ValueError("Coordination health evidenceRefs must be safe metadata references.")
        return refs

    @field_validator("observedAt", mode="before")
    @classmethod
    def _parse_rfc3339_observed_at(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("Coordination health observedAt must be an RFC 3339 timestamp.") from exc

    @model_validator(mode="after")
    def _bounded_projection_is_honest(self) -> "PipelineCoordinationHealthV0View":
        if self.staleOwnerProjectedCount > self.staleOwnerTargetCount:
            raise ValueError("Projected stale-owner count cannot exceed canonical target count.")
        if self.staleOwnerProjectedCount < self.staleOwnerTargetCount and self.availability != "incomplete":
            raise ValueError("A bounded stale-owner projection must be marked incomplete.")
        if (self.freshness == "unavailable") != (self.availability == "unavailable"):
            raise ValueError("Unavailable coordination freshness and availability must agree.")
        if self.observedAt.tzinfo is None:
            raise ValueError("Coordination health observedAt must be timezone-aware.")
        return self


class ManagerCoordinationHealthHandoffRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["manager-coordination-health-handoff/v0"]
    handoffId: str = Field(max_length=128, pattern=r"^manager-coordination-health-handoff:[0-9a-f]{40}$")
    sourceSequence: PositiveInt
    coordinationHealth: PipelineCoordinationHealthV0View
    idempotencyKey: str = Field(max_length=180)
    metadataOnly: Literal[True]
    rawPayloadRetained: Literal[False]

    @field_validator("idempotencyKey")
    @classmethod
    def _handoff_identity_is_safe(cls, value: str, info) -> str:
        if value != value.strip():
            raise ValueError(f"{info.field_name} must not contain leading or trailing whitespace.")
        return _validate_authoritative_metadata_text(value, path=info.field_name)


class ManagerCoordinationHealthHandoffView(ManagerCoordinationHealthHandoffRequest):
    owner: Literal["supervisor"]
    createdAt: datetime


class ManagerCoordinationHealthHandoffApiEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    data: ManagerCoordinationHealthHandoffView
    meta: dict[str, str | int | float | bool | None] | None = None


class SupervisorTerminalEventProjection(BaseModel):
    """Read-only latest canonical terminal-event projection owned by supervisor."""

    model_config = ConfigDict(extra="forbid", strict=True)

    projectionId: str = Field(max_length=160)
    generatedAt: str = Field(
        max_length=64,
        pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$",
    )
    status: Literal["available", "empty", "unavailable"]
    event: ManagerTerminalEventView | None
    owner: Literal["supervisor"]
    metadataOnly: Literal[True]
    rawPayloadRetained: Literal[False]

    @model_validator(mode="after")
    def _status_matches_event(self) -> "SupervisorTerminalEventProjection":
        if self.status == "empty" and self.event is not None:
            raise ValueError("Empty terminal-event projections must not include an event.")
        if self.status == "available" and self.event is None:
            raise ValueError("Available terminal-event projections must include an event.")
        if self.status == "unavailable" and self.event is not None:
            raise ValueError("Unavailable terminal-event projections must not include an event.")
        return self


class SupervisorTerminalEventProjectionApiEnvelope(BaseModel):
    """Typed supervisor-owned response boundary for latest terminal-event projection."""

    model_config = ConfigDict(extra="forbid", strict=True)

    data: SupervisorTerminalEventProjection
    meta: dict[str, str | int | float | bool | None] | None = None
