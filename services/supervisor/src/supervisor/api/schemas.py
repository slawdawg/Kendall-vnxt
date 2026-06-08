from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from supervisor.domain.types import (
    AuditMode,
    BmadLane,
    ExecutionAttemptStatus,
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


class WorkItemLocalEvidenceExplanationRequest(BaseModel):
    stepId: str | None = None
    taskKind: str | None = None
    recordEvent: bool = False


class WorkItemRoutingOverrideRequest(BaseModel):
    proposedLane: str
    reason: str
    note: str | None = None
    actorId: str | None = None
    actorLabel: str | None = None


class WorkItemExecutionAttemptCreateRequest(BaseModel):
    stepId: str | None = None
    taskKind: str | None = None
    actorId: str | None = None
    actorLabel: str | None = None


class WorkItemExecutionAttemptTransitionRequest(BaseModel):
    status: ExecutionAttemptStatus
    reason: str | None = None
    routeDecisionId: str | None = None
    workerId: str | None = None
    lane: str | None = None
    authorityMode: str | None = None
    actorId: str | None = None
    actorLabel: str | None = None


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


class ExecutionAttemptView(BaseModel):
    attemptId: str
    workItemId: str
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
    processLaunchAllowed: bool = False
    executionAllowed: bool = False


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
