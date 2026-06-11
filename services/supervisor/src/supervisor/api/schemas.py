from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

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


class WorkItemCreate(BaseModel):
    title: str
    requestedOutcome: str
    source: str
    details: str | None = None
    riskLevel: RiskLevel = RiskLevel.LOW
    metadata: dict[str, Any] = Field(default_factory=dict)


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
    whyThisPath: str
    previewOnly: bool = True
    executionAttemptCreated: bool = False
    providerCallsAllowed: bool = False
    commandExecutionAllowed: bool = False


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


class LocalProviderAttemptMetadataView(BaseModel):
    status: str
    modelId: str
    endpointFamily: str
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


class DocumentationAuthorityReportView(BaseModel):
    reportId: str
    generatedAt: datetime
    summary: str
    indexes: list[DocumentationAuthorityDocumentView]
    approvalCheckpoint: DocumentationAuthorityDocumentView
    blockedStories: list[DocumentationAuthorityBlockedStoryView]
    driftChecks: list[ProviderEnablementPolicyStepView]
    nextSafeActions: list[str]
    executionAuthorityApproved: bool = False


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


class VerificationReadinessReportView(BaseModel):
    reportId: str
    generatedAt: datetime
    summary: str
    requiredCommands: list[VerificationCommandView]
    optionalCommands: list[VerificationCommandView]
    commandGroups: list[VerificationCommandGroupView]
    handoffCheckpoints: list[VerificationHandoffCheckpointView]
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
    nextAction: str


class AuthorityReadinessMatrixReportView(BaseModel):
    reportId: str
    generatedAt: datetime
    summary: str
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


class SafeDevelopmentBacklogItemView(BaseModel):
    itemId: str
    label: str
    priority: str
    status: str
    summary: str
    recommendedSliceSize: str
    evidence: list[str] = Field(default_factory=list)
    relatedReports: list[str] = Field(default_factory=list)
    relatedDocs: list[str] = Field(default_factory=list)
    dashboardAnchors: list[str] = Field(default_factory=list)
    blockedBy: list[str] = Field(default_factory=list)
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
    status: str
    summary: str
    evidence: list[str] = Field(default_factory=list)


class TrustedDeliveryEligibilityStageEvaluationView(BaseModel):
    stageId: str
    label: str
    status: str
    eligible: bool
    checks: list[TrustedDeliveryEligibilityCheckView]
    allowedOperations: list[str] = Field(default_factory=list)
    blockedOperations: list[str] = Field(default_factory=list)
    nextAction: str


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
    stages: list[TrustedDeliveryEligibilityStageEvaluationView]
    hardStops: list[str]
    nextSafeActions: list[str]
    readOnly: bool = True
    automaticDeliveryApproved: bool = False
    pushPrAutoEligible: bool = False
    mergeAutoEligible: bool = False
    cleanupAutoEligible: bool = False


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


class TrustedAutonomyReadinessReportView(BaseModel):
    reportId: str
    generatedAt: datetime
    summary: str
    autonomyGates: list[TrustedAutonomyReadinessGateView]
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
