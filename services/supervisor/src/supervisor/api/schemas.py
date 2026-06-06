from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from supervisor.domain.types import (
    AuditMode,
    BmadLane,
    ErrorCategory,
    RiskLevel,
    RunMode,
    WorkItemFilterScope,
    WorkflowAction,
    WorkflowState,
)


class WorkItemCreate(BaseModel):
    title: str
    requestedOutcome: str
    source: str
    details: str | None = None
    riskLevel: RiskLevel = RiskLevel.LOW
    metadata: dict[str, Any] = Field(default_factory=dict)


class WorkItemActionRequest(BaseModel):
    action: WorkflowAction
    note: str | None = None
    actorId: str | None = None
    actorLabel: str | None = None


class WorkItemExecutionRecipeView(BaseModel):
    id: str
    label: str
    summary: str
    branchPrefix: str
    allowedPaths: list[str]
    verificationCommands: list[str]
    autonomyNotes: list[str]


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
