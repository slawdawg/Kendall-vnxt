import type {
  AuditFilterMode,
  BmadLane,
  CandidateWorkArtifactType,
  CandidateWorkPriority,
  CandidateWorkSource,
  CandidateWorkStatus,
  RiskLevel,
  RunMode,
  WorkItemFilterScope,
  WorkflowAction,
  WorkflowState,
} from "./workflow";

export interface WorkItemPayload {
  title: string;
  requestedOutcome: string;
  source: string;
  details?: string | null;
  riskLevel?: RiskLevel;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface CandidateWorkCreatePayload {
  title: string;
  requestedOutcome: string;
  source: CandidateWorkSource;
  sourceArtifactPath: string;
  sourceArtifactType: CandidateWorkArtifactType;
  riskLevel?: RiskLevel;
  priority?: CandidateWorkPriority;
  sortOrder?: number;
  importMetadata?: Record<string, unknown>;
}

export interface CandidateWorkUpdatePayload {
  status?: CandidateWorkStatus | null;
  priority?: CandidateWorkPriority | null;
  riskLevel?: RiskLevel | null;
  sortOrder?: number | null;
}

export interface CandidateWorkBmadImportPayload {
  artifactPath: string;
  sortOrder?: number;
}

export interface CandidateWorkObsidianMetadataImportPayload {
  title: string;
  requestedOutcome: string;
  sourceArtifactPath: string;
  sourceRef: string;
  evidenceRefs: string[];
  approvalStatus: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  freshness?: "fresh" | "stale" | "unknown" | "not_applicable";
  riskLevel?: RiskLevel;
  priority?: CandidateWorkPriority;
  sortOrder?: number;
}

export interface CandidateWorkSourceSummaryView {
  label: string;
  summary: string;
  sourceType: CandidateWorkSource;
  sourceRef: string;
  sourceArtifactPath: string;
  freshness: "fresh" | "stale" | "unknown" | "not_applicable";
  accessState: "allowed" | "excluded" | "missing" | "blocked";
  retentionPolicy: string;
  boundarySummary: string;
  evidenceRefs: string[];
  approvalStatus: string;
  approvedBy: string;
  approvedAt: string;
}

export interface CandidateWorkView {
  id: string;
  title: string;
  requestedOutcome: string;
  source: CandidateWorkSource;
  sourceArtifactPath: string;
  sourceArtifactType: CandidateWorkArtifactType;
  riskLevel: RiskLevel;
  priority: CandidateWorkPriority;
  sortOrder: number;
  status: CandidateWorkStatus;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string | null;
  promotedWorkItemId?: string | null;
  sourceSummary?: CandidateWorkSourceSummaryView | null;
  importMetadata: Record<string, unknown>;
}

export interface CandidateWorkPromotionView {
  candidateWork: CandidateWorkView;
  workItem: WorkItemView;
}

export interface BmadImportPackageView {
  title: string;
  requestedOutcome: string;
  sourceArtifactPath: string;
  sourceArtifactType: CandidateWorkArtifactType;
  artifactTitle: string;
  storyId?: string | null;
  epicId?: string | null;
  acceptanceCriteria: string;
  riskLevel: RiskLevel;
  recommendedPriority: CandidateWorkPriority;
  verificationSummary: string;
  allowedScope?: string | null;
  notes: string[];
}

export interface TaskPacketV0View {
  workItemId: string;
  title: string;
  requestedOutcome: string;
  source: string;
  sourceArtifactPath: string;
  taskKind: string;
  riskLevel: string;
  priority: string;
  approvalMode: string;
  verificationSummary: string;
}

export interface TaskPacketPreviewView {
  packet: TaskPacketV0View;
  route: RoutingDecisionView;
  whyThisPath: string;
  previewOnly: boolean;
  executionAttemptCreated: boolean;
  providerCallsAllowed: boolean;
  commandExecutionAllowed: boolean;
}

export interface WorkItemPolicyGateView {
  id: string;
  label: string;
  requiredBefore: string;
  summary: string;
  evidence: string[];
}

export interface WorkItemRemoteAutomationPolicyView {
  status: string;
  summary: string;
  allowedOperations: string[];
  blockedOperations: string[];
  approvalRequirements: string[];
}

export interface WorkItemExecutionRecipeView {
  id: string;
  label: string;
  summary: string;
  branchPrefix: string;
  allowedPaths: string[];
  implementationCommands: string[];
  verificationCommands: string[];
  policyGates: WorkItemPolicyGateView[];
  operatorCheckpoints: string[];
  autonomyNotes: string[];
  remoteAutomationPolicy: WorkItemRemoteAutomationPolicyView;
}

export interface WorkItemDeliveryReadinessView {
  pullRequestStatus: string;
  pullRequestUrl?: string | null;
  ciStatus: string;
  mergeStatus: string;
  deliveryWaived: boolean;
  deliveryWaiverReason?: string | null;
  remoteOperationsPerformed: boolean;
  remoteOperationsPolicy: string;
  readyForApproval: boolean;
}

export interface WorkItemRecipeGateAuditEntryView {
  gateId: string;
  label: string;
  requiredBefore: string;
  status: "pending" | "passed" | "blocked";
  summary: string;
  evidence: string[];
  latestEventType?: string | null;
  latestEventAt?: string | null;
  reason?: string | null;
}

export interface WorkItemManagedActionRecoveryView {
  mode: "retryable" | "operator-checkpoint" | "human-only";
  label: string;
  detail: string;
}

export interface WorkItemManagedActionView {
  actionId: string;
  label: string;
  status: "available" | "blocked" | "waiting" | "complete";
  reason: string;
  requiredGate?: string | null;
  operatorCheckpoint?: string | null;
  allowedActor: "supervisor" | "operator";
  remoteOperation: boolean;
  recovery?: WorkItemManagedActionRecoveryView | null;
}

export interface WorkItemRecipeGateAuditView {
  recipeId: string;
  status: "pending" | "passed" | "blocked";
  passedCount: number;
  blockedCount: number;
  pendingCount: number;
  gates: WorkItemRecipeGateAuditEntryView[];
  nextManagedAction: WorkItemManagedActionView;
}

export type ExecutionAttemptStatus =
  | "planned"
  | "approved"
  | "starting"
  | "running"
  | "cancel_requested"
  | "cancelled"
  | "timed_out"
  | "failed"
  | "completed"
  | "rejected";

export interface ExecutionAttemptCreateRequest {
  stepId?: string | null;
  taskKind?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
}

export interface ExecutionAttemptTransitionRequest {
  status: ExecutionAttemptStatus;
  reason?: string | null;
  routeDecisionId?: string | null;
  workerId?: string | null;
  lane?: string | null;
  authorityMode?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
}

export interface SupervisedCodexLaunchRequest {
  taskId: string;
  dryRun: boolean;
  allowedPaths: string[];
  blockedPaths: string[];
  verificationCommand: string;
  outputSummary: string;
  touchedFiles: string[];
  routeDecisionId?: string | null;
  workerId?: string | null;
  lane?: string | null;
  authorityMode?: string | null;
  approvalTimestamp?: string | null;
  expiresAt?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
}

export interface VerificationEvidenceRecordRequest {
  commandId: string;
  label: string;
  commandShape: string;
  status: string;
  exitCode?: number | null;
  durationMs?: number | null;
  summary: string;
  artifactRef?: string | null;
  recoveryAction: string;
  rollbackStatus?: string | null;
  rollbackReason?: string | null;
  nextSafeAction?: string | null;
}

export interface WorkspaceIsolationPlanView {
  planId: string;
  sourceSnapshotStrategy: string;
  branchStrategy: string;
  readRoots: string[];
  writeRoots: string[];
  artifactRoot: string;
  forbiddenPaths: string[];
  cleanupRule: string;
  rollbackRule: string;
  diffCaptureRule: string;
  writesAllowed: boolean;
  sourceMutationAllowed: boolean;
  commandsAllowed: boolean;
  networkAllowed: boolean;
  credentialAccessAllowed: boolean;
  redactionBoundary: string[];
  allowedCommandClasses: string[];
  blockedCommandClasses: string[];
  providerEndpointPolicy: string;
  promptConstructionPolicy: string;
  boundaryRejectionReason: string;
  materializationMode: string;
  environmentPolicy: string;
  environmentAllowlist: string[];
  sessionBoundary: string;
  outputPolicy: string;
}

export interface ExecutionAttemptView {
  attemptId: string;
  workItemId: string;
  routeDecisionId: string;
  workerId: string;
  lane: string;
  authorityMode: string;
  status: ExecutionAttemptStatus;
  requestedById?: string | null;
  requestedByLabel?: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  heartbeatAt?: string | null;
  timeoutAt?: string | null;
  cancelRequestedAt?: string | null;
  cancelReason?: string | null;
  rejectionReason?: string | null;
  failureReason?: string | null;
  workspaceIsolationPlan: WorkspaceIsolationPlanView;
  artifactRefs: Record<string, unknown>[];
  eventRefs: Record<string, unknown>[];
}

export interface RoutingProfileView {
  workItemId: string;
  stepId: string;
  taskKind: string;
  phase?: string | null;
  riskLevel: string;
  privacyLevel: string;
  writeScope: string;
  allowedPaths: string[];
  contextNeed: string;
  reasoningNeed: string;
  determinismNeed: string;
  validationExpectations: string[];
  preferredLanes: string[];
  forbiddenLanes: string[];
  escalationTriggers: string[];
}

export interface RejectedRoutingLaneView {
  lane: string;
  rejectionCodes: string[];
  explanation: string;
}

export interface RoutingDecisionView {
  decisionId: string;
  workItemId: string;
  stepId: string;
  createdAt: string;
  profileSnapshot: RoutingProfileView;
  selectedLane: string;
  selectedWorkerId?: string | null;
  authorityMode: string;
  confidenceScore: number;
  confidenceBand: string;
  reasonCodes: string[];
  rejectedLanes: RejectedRoutingLaneView[];
  rejectedWorkers: string[];
  permissionSummary: string;
  escalationPath: string[];
  humanExplanation: string;
}

export interface RoutingPreviewView {
  profile: RoutingProfileView;
  decision: RoutingDecisionView;
}

export interface SubscriptionHandoffEvidenceView {
  eventType: string;
  summary: string;
  createdAt: string;
}

export interface SubscriptionHandoffPackageView {
  packageId: string;
  workItemId: string;
  title: string;
  requestedOutcome: string;
  taskKind: string;
  stepId: string;
  createdAt: string;
  route: RoutingDecisionView;
  summary: string;
  context: string[];
  constraints: string[];
  allowedPaths: string[];
  validationCommands: string[];
  recentEvidence: SubscriptionHandoffEvidenceView[];
  operatorInstructions: string[];
  launchAllowed: boolean;
}

export interface PremiumApprovalEvidenceView {
  eventType: string;
  summary: string;
  createdAt: string;
}

export interface PremiumApprovalRequestView {
  approvalRequestId: string;
  workItemId: string;
  title: string;
  requestedOutcome: string;
  taskKind: string;
  stepId: string;
  createdAt: string;
  requestedLane: string;
  route: RoutingDecisionView;
  justification: string[];
  requiredEvidence: string[];
  approvalChecklist: string[];
  riskControls: string[];
  recentEvidence: PremiumApprovalEvidenceView[];
  approvalReason?: string | null;
  executionAllowed: boolean;
}

export interface SubscriptionAgentLaunchStubView {
  launchStubId: string;
  workItemId: string;
  title: string;
  requestedOutcome: string;
  taskKind: string;
  stepId: string;
  createdAt: string;
  workerId: string;
  requestedAgent: string;
  route: RoutingDecisionView;
  estimate: Record<string, string>;
  launchInstructions: string[];
  requiredApprovals: string[];
  disabledReason: string;
  targetRegistry: Record<string, unknown>[];
  approvalBinding: Record<string, unknown>;
  workspaceContract: Record<string, unknown>;
  outputContract: Record<string, unknown>;
  lifecycleEvidence: Record<string, unknown>;
  readinessEvidence?: Record<string, unknown>;
  processLaunchAllowed: boolean;
  executionAllowed: boolean;
}

export interface WorkItemSubscriptionAgentLaunchPayload {
  stepId?: string | null;
  taskKind?: string | null;
  requestedAgent?: string | null;
  recordEvent?: boolean;
  workItemId?: string | null;
  attemptId?: string | null;
  executionAttemptId?: string | null;
  routeDecisionId?: string | null;
  workerId?: string | null;
  lane?: string | null;
  authorityMode?: string | null;
  workspacePlanId?: string | null;
  launchPolicyId?: string | null;
  targetId?: string | null;
  commandTemplateId?: string | null;
  commandTemplateExecutionStatus?: string | null;
  approvalActor?: string | null;
  approvalTimestamp?: string | null;
  approvalExpiry?: string | null;
  permissionEnvelope?: string | null;
  environmentAllowlist?: string[];
  blockedCredentialSessionPaths?: string[];
  artifactLimits?: Record<string, unknown>;
  redactionPolicy?: string | null;
  truncationPolicy?: string | null;
  outputPolicy?: string | null;
  startupTimeoutSeconds?: number | null;
  runTimeoutSeconds?: number | null;
  cancellationTimeoutSeconds?: number | null;
  startupTimeoutPolicy?: string | null;
  runTimeoutPolicy?: string | null;
  cancellationTimeoutPolicy?: string | null;
  heartbeatPolicy?: string | null;
  childProcessTreeTrackingPolicy?: string | null;
  orphanDetectionPolicy?: string | null;
  terminalStateReconciliationPolicy?: string | null;
  idempotentCleanupPolicy?: string | null;
  dashboardControls?: string | null;
  rollbackPolicy?: string | null;
  verificationCommand?: string | null;
  allowedOutputMode?: string | null;
  approvalId?: string | null;
  authorityFamily?: string | null;
  operation?: string | null;
  commandArgv?: string[];
  cwd?: string | null;
  retainedEvidence?: string[];
  stopLines?: string[];
}

export interface SubscriptionAgentLaunchRequestView {
  launchRequestId: string;
  workItemId: string;
  status: string;
  readinessStatus: string;
  approvalAccepted: boolean;
  processLaunchAllowed: boolean;
  executionAllowed: boolean;
  commandExecutionAllowed: boolean;
  sourceMutationAllowed: boolean;
  providerCallsAllowed: boolean;
  networkAllowed: boolean;
  credentialAccessAllowed: boolean;
  processLaunchAttempted: boolean;
  shellExecutionAttempted: boolean;
  credentialAccessAttempted: boolean;
  externalSendAttempted: boolean;
  missingEnvelopeFields: string[];
  rejectedEnvelopeFields: Record<string, unknown>;
  staleEnvelopeFields: string[];
  blockedReasonIds: string[];
  nextSafeAction: string;
  approvalBinding: Record<string, unknown>;
  workspaceContract: Record<string, unknown>;
  outputArtifactSummary: Record<string, unknown>;
  lifecycleEvidence: Record<string, unknown>;
  safetyFlags: Record<string, boolean>;
  mutationContract: Record<string, unknown>;
  runtimeEvidence: Record<string, unknown>;
}

export interface LocalEvidencePacketItemView {
  eventType: string;
  summary: string;
  createdAt: string;
}

export interface LocalEvidencePacketView {
  packetId: string;
  workItemId: string;
  title: string;
  requestedOutcome: string;
  taskKind: string;
  stepId: string;
  createdAt: string;
  route: RoutingDecisionView;
  summary: string;
  evidence: LocalEvidencePacketItemView[];
  boundaries: string[];
  allowedPaths: string[];
  validationCommands: string[];
  redactionNotes: string[];
  writesAllowed: boolean;
  commandsAllowed: boolean;
}

export interface LocalReadonlyWorkerPreviewView {
  workerId: string;
  runId: string;
  packetId: string;
  workItemId: string;
  status: string;
  summary: string;
  recommendations: string[];
  packet: LocalEvidencePacketView;
  writesAllowed: boolean;
  commandsAllowed: boolean;
}

export interface LocalProviderApprovalInstance {
  approvalId?: string | null;
  status?: string | null;
  authorityFamily?: string | null;
  operation?: string | null;
  endpointUrl?: string | null;
  modelId?: string | null;
  promptSourceId?: string | null;
  promptTemplateId?: string | null;
  redactionPolicy?: string | null;
  timeoutCancellationPolicy?: string | null;
  retainedEvidencePolicy?: string | null;
  retainedEvidence?: string[];
  approvedBy?: string | null;
  approvedAt?: string | null;
  expiresAt?: string | null;
  reviewPoint?: string | null;
  rollbackPath?: string[];
  stopLines?: string[];
}

export interface LocalEvidenceExplanationPayload {
  stepId?: string | null;
  taskKind?: string | null;
  recordEvent?: boolean;
  localProviderApproval?: LocalProviderApprovalInstance | null;
}

export interface LocalEvidenceItemView {
  eventType: string;
  summary: string;
  createdAt: string;
}

export interface LocalProviderAttemptMetadataView {
  status: string;
  modelId: string;
  endpointFamily: string;
  approvalId?: string | null;
  approvalStatus?: string | null;
  rejectionReason?: string | null;
  rejectionReasons: string[];
  finishReason?: string | null;
  promptSummary: string;
  responseSummary: string;
  responseCharacterCount: number;
  reasoningCharacterCount: number;
  promptCharacterCount: number;
  completionTokens?: number | null;
  promptTokens?: number | null;
  totalTokens?: number | null;
  redactionApplied: boolean;
  rawPayloadRetained: boolean;
  timeoutState: string;
  cancellationState: string;
}

export interface LocalEvidenceExplanationView {
  explanationId: string;
  workItemId: string;
  title: string;
  requestedOutcome: string;
  taskKind: string;
  stepId: string;
  createdAt: string;
  route: RoutingDecisionView;
  summary: string;
  evidence: LocalEvidenceItemView[];
  boundaries: string[];
  nextStepSuggestions: string[];
  providerAttempt?: LocalProviderAttemptMetadataView | null;
  writesAllowed: boolean;
  commandsAllowed: boolean;
}

export interface RoutingLaneEvidenceProfileView {
  lane: string;
  decisionCount: number;
  previewCount: number;
  guardedExecutionCount: number;
  handoffPackageCount: number;
  premiumApprovalRequestCount: number;
  localExplanationCount: number;
  outcomeCount: number;
  recentReasonCodes: string[];
  latestEventAt?: string | null;
}


export interface WorkerRegistryEntryView {
  workerId: string;
  displayName: string;
  lane: string;
  adapterType: string;
  capabilities: string[];
  permissions: string[];
  health: string;
  queueDepth: number;
  maxParallelJobs: number;
  disabledReason?: string | null;
}

export interface ExecutionConfigurationCheckView {
  checkId: string;
  label: string;
  status: string;
  enabled: boolean;
  disabledReason?: string | null;
  affectedWorkers: string[];
  evidence: string[];
  launchTargets: Record<string, unknown>[];
  processLaunchAllowed: boolean;
  providerCallsAllowed: boolean;
  modelCallsAllowed: boolean;
  premiumExecutionAllowed: boolean;
  commandExecutionAllowed: boolean;
  sourceMutationAllowed: boolean;
  networkAllowed: boolean;
  credentialAccessAllowed: boolean;
}

export interface ExecutionConfigurationChecksView {
  summary: string;
  allDisabled: boolean;
  generatedAt: string;
  checks: ExecutionConfigurationCheckView[];
}

export interface ProviderEnablementPolicyStepView {
  stepId: string;
  label: string;
  status: string;
  summary: string;
  requiredEvidence: string[];
}

export interface ExecutionReadinessAttemptSummaryView {
  attemptId: string;
  workItemId: string;
  status: string;
  workerId: string;
  lane: string;
  authorityMode: string;
  disabledReason?: string | null;
  latestEventType?: string | null;
  latestEventAt?: string | null;
  nextSafeAction: string;
}

export interface ExecutionReadinessOutcomeEvidenceView {
  eventId: string;
  workItemId: string;
  createdAt: string;
  selectedLane?: string | null;
  workerId?: string | null;
  taskKind?: string | null;
  attemptStatus?: string | null;
  validationStatus?: string | null;
  failureClass?: string | null;
  escalationReason?: string | null;
  operatorOverrideReason?: string | null;
  reportingOnly: boolean;
}

export interface DisabledProviderProofView {
  workerId: string;
  providerLabel: string;
  disabledReason: string;
  registryState: string;
  broadGateEnabled: boolean;
  providerSpecificGateEnabled: boolean;
  modelIdConfigured: boolean;
  adapterReady: boolean;
  endpointFamily: string;
  endpointPolicy: string;
  httpCallsAttempted: boolean;
  modelCallsAttempted: boolean;
  networkAccessAttempted: boolean;
  credentialAccessAttempted: boolean;
  redactionChecks: string[];
  promptConstructionSources: string[];
  rejectedPromptSources: string[];
  retainedEvidenceClasses: string[];
  rawPromptRetentionAllowed: boolean;
  rawCompletionRetentionAllowed: boolean;
  connectTimeoutSeconds?: number | null;
  totalTimeoutSeconds?: number | null;
  attemptStateMapping: string[];
  retryPolicy: string;
  timeoutPolicy: string;
  cancellationPolicy: string;
  retentionPolicy: string;
}

export interface ExecutionStateBoundaryView {
  boundaryId: string;
  generatedAt: string;
  summary: string;
  queueLeaseRole: string[];
  executionAttemptRole: string[];
  forbiddenQueueLeaseFields: string[];
  futureProcessLifecycleAttachments: string[];
  queueLeaseGrantsExecutionAuthority: boolean;
  executionAttemptLaunchesWorkers: boolean;
}

export interface ExecutionReadinessReportView {
  reportId: string;
  generatedAt: string;
  summary: string;
  providerEnablementPolicy: ProviderEnablementPolicyStepView[];
  disabledAuthorityChecks: ExecutionConfigurationCheckView[];
  disabledProviderProofs: DisabledProviderProofView[];
  currentAttempts: ExecutionReadinessAttemptSummaryView[];
  latestOutcomes: ExecutionReadinessOutcomeEvidenceView[];
  nextSafeActions: string[];
  executionAllowed: boolean;
  providerCallsAllowed: boolean;
  commandExecutionAllowed: boolean;
  sourceMutationAllowed: boolean;
}

export interface DocumentationAuthorityDocumentView {
  path: string;
  label: string;
  status: string;
  evidence: string[];
}

export interface DocumentationAuthorityBlockedStoryView {
  storyId: string;
  path: string;
  authorityFamily: string;
  status: string;
}

export interface DocumentationAuthorityLegacyArtifactDispositionView {
  artifactId: string;
  label: string;
  currentLocation: string;
  recommendedDisposition: string;
  retentionPolicy: string;
  sourceOwnedReplacements: string[];
  operatorActions: string[];
  evidence: string[];
  sourceMutationAllowed: boolean;
  rawPayloadRetained: boolean;
}

export interface DocumentationAuthorityReportView {
  reportId: string;
  generatedAt: string;
  summary: string;
  indexes: DocumentationAuthorityDocumentView[];
  approvalCheckpoint: DocumentationAuthorityDocumentView;
  blockedStories: DocumentationAuthorityBlockedStoryView[];
  legacyArtifactDispositions: DocumentationAuthorityLegacyArtifactDispositionView[];
  driftChecks: ProviderEnablementPolicyStepView[];
  nextSafeActions: string[];
  executionAuthorityApproved: boolean;
}

export interface LegacyPlanningArtifactCandidateView {
  candidateId: string;
  path: string;
  artifactType: string;
  freshness: string;
  summaryLabel: string;
  sourceAccessState: string;
  evidenceBoundary: string;
  localPlanningState: boolean;
}

export interface LegacyPlanningArtifactInventoryReportView {
  reportId: string;
  generatedAt: string;
  summary: string;
  candidates: LegacyPlanningArtifactCandidateView[];
  artifactTypes: string[];
  sourceAccessStates: string[];
  relatedReports: string[];
  relatedDocs: string[];
  stopLines: string[];
  nextSafeActions: string[];
  readOnly: boolean;
  executionAuthorityApproved: boolean;
  rawContentRetained: boolean;
}

export interface VerificationCommandView {
  commandId: string;
  label: string;
  command: string;
  status: string;
  requiredFor: string[];
  evidence: string[];
}

export interface VerificationCommandGroupView {
  groupId: string;
  label: string;
  status: string;
  summary: string;
  commandIds: string[];
  requiredBefore: string;
  nextAction: string;
}

export interface VerificationHandoffCheckpointView {
  checkpointId: string;
  label: string;
  status: string;
  summary: string;
  requiredCommandIds: string[];
  relatedRunbooks: string[];
  nextAction: string;
}

export interface VerificationReadinessReportView {
  reportId: string;
  generatedAt: string;
  summary: string;
  requiredCommands: VerificationCommandView[];
  optionalCommands: VerificationCommandView[];
  commandGroups: VerificationCommandGroupView[];
  handoffCheckpoints: VerificationHandoffCheckpointView[];
  stopLines: string[];
  nextSafeActions: string[];
  readyForAuthorityEnablement: boolean;
  executionAuthorityApproved: boolean;
}

export interface AuthorityReadinessFamilyView {
  familyId: string;
  label: string;
  status: string;
  summary: string;
  blockedStories: string[];
  requiredApprovals: string[];
  requiredEvidence: string[];
  relatedReports: string[];
  relatedDocs: string[];
  dashboardAnchors: string[];
  stopLines: string[];
  rollbackPath: string;
  nextAction: string;
}

export interface CurrentStateReconciliationFindingView {
  findingId: string;
  label: string;
  status: string;
  summary: string;
  evidence: string[];
  relatedDocs: string[];
  nextAction: string;
}

export interface NextLaneDecisionPacketView {
  packetId: string;
  status: string;
  recommendation: string;
  packetPath: string;
  approvalRequired: boolean;
  noAuthorityGranted: boolean;
  requiredFreshnessCheck: string;
  relatedDocs: string[];
  stopLines: string[];
  nextAction: string;
}

export interface AuthorityReadinessMatrixReportView {
  reportId: string;
  generatedAt: string;
  summary: string;
  currentStateFindings: CurrentStateReconciliationFindingView[];
  nextLaneDecisionPacket: NextLaneDecisionPacketView;
  families: AuthorityReadinessFamilyView[];
  readinessLadder: ProviderEnablementPolicyStepView[];
  stopLines: string[];
  nextSafeActions: string[];
  readOnly: boolean;
  executionAuthorityApproved: boolean;
}

export interface DashboardE2ERunnerView {
  runnerId: string;
  label: string;
  command: string;
  target: string;
  status: string;
  evidence: string[];
  ownsServerLifecycle: boolean;
  usesRepoLocalCaches: boolean;
}

export interface DashboardE2EReportView {
  reportId: string;
  generatedAt: string;
  summary: string;
  runners: DashboardE2ERunnerView[];
  setupCommands: VerificationCommandView[];
  stopLines: string[];
  nextSafeActions: string[];
  readOnly: boolean;
  executionAuthorityApproved: boolean;
}

export interface SupervisorReportCatalogEntryView {
  reportId: string;
  label: string;
  endpoint: string;
  status: string;
  summary: string;
  evidenceScope: string[];
  relatedDocs: string[];
  readOnly: boolean;
  executionAuthorityApproved: boolean;
}

export interface SupervisorReportCatalogView {
  catalogId: string;
  generatedAt: string;
  summary: string;
  reports: SupervisorReportCatalogEntryView[];
  stopLines: string[];
  nextSafeActions: string[];
  readOnly: boolean;
  executionAuthorityApproved: boolean;
}

export interface MaintenanceReadinessTrackView {
  trackId: string;
  label: string;
  status: string;
  summary: string;
  evidence: string[];
  relatedReports: string[];
  relatedDocs: string[];
  dashboardAnchors: string[];
  nextAction: string;
}

export interface MaintenanceReadinessReportView {
  reportId: string;
  generatedAt: string;
  summary: string;
  tracks: MaintenanceReadinessTrackView[];
  stopLines: string[];
  nextSafeActions: string[];
  readOnly: boolean;
  executionAuthorityApproved: boolean;
}

export interface SafeDevelopmentBacklogItemView {
  itemId: string;
  label: string;
  priority: string;
  status: string;
  summary: string;
  recommendedSliceSize: string;
  evidence: string[];
  sourceEvidenceLabels?: string[];
  relatedReports: string[];
  relatedDocs: string[];
  dashboardAnchors: string[];
  blockedBy: string[];
  nextLane?: NextLaneRecommendationView | null;
  nextAction: string;
}

export interface NextLaneRecommendationView {
  laneTitle: string;
  laneSlug: string;
  branchName: string;
  startCommand: string;
  scope: string[];
  verificationCommands: string[];
  stopLines: string[];
}

export interface SafeDevelopmentBacklogReportView {
  reportId: string;
  generatedAt: string;
  summary: string;
  items: SafeDevelopmentBacklogItemView[];
  stopLines: string[];
  nextSafeActions: string[];
  readOnly: boolean;
  executionAuthorityApproved: boolean;
}

export interface MaintenanceActionPlanStepView {
  stepId: string;
  label: string;
  priority: string;
  status: string;
  summary: string;
  evidence: string[];
  verificationCommands: string[];
  relatedReports: string[];
  relatedDocs: string[];
  dashboardAnchors: string[];
  nextAction: string;
}

export interface MaintenanceActionPlanReportView {
  reportId: string;
  generatedAt: string;
  summary: string;
  steps: MaintenanceActionPlanStepView[];
  verificationChain: string[];
  stopLines: string[];
  nextSafeActions: string[];
  readOnly: boolean;
  executionAuthorityApproved: boolean;
}

export interface DevelopmentRunwayReadinessCheckView {
  checkId: string;
  label: string;
  status: string;
  summary: string;
  evidence: string[];
  requiredCommandIds: string[];
  relatedReports: string[];
  relatedDocs: string[];
  dashboardAnchors: string[];
  nextAction: string;
}

export interface DevelopmentRunwaySliceView {
  sliceId: string;
  label: string;
  status: string;
  recommendedPrScope: string;
  summary: string;
  includedBacklogItems: string[];
  includedActionSteps: string[];
  requiredVerification: string[];
  relatedReports: string[];
  relatedDocs: string[];
  dashboardAnchors: string[];
  readinessChecks: DevelopmentRunwayReadinessCheckView[];
  blockedBy: string[];
  nextLane?: NextLaneRecommendationView | null;
  nextAction: string;
}

export interface DevelopmentRunwayReportView {
  reportId: string;
  generatedAt: string;
  summary: string;
  planningRule: string;
  minimumPrScope: string;
  batchingPolicy: string[];
  prBatchingChecklist: string[];
  slices: DevelopmentRunwaySliceView[];
  verificationChain: string[];
  stopLines: string[];
  nextSafeActions: string[];
  readOnly: boolean;
  executionAuthorityApproved: boolean;
  remoteAutomationApproved: boolean;
}

export interface RuntimeEvidenceReviewWorkItemView {
  workItemId: string;
  title: string;
  state: string;
  riskLevel: string;
  needsAttention: boolean;
  attemptCount: number;
  eventCount: number;
  relatedReportCount: number;
  relatedReports: string[];
  relatedDocs: string[];
  dashboardAnchors: string[];
  latestEventAt: string | null;
  runtimeExportHref: string;
  reviewPriority: string;
  reviewReason: string;
  recommendedAction: string;
}

export interface RuntimeEvidenceReviewReportView {
  reportId: string;
  generatedAt: string;
  summary: string;
  workItems: RuntimeEvidenceReviewWorkItemView[];
  reviewQueue: RuntimeEvidenceReviewWorkItemView[];
  crossChecks: RuntimeEvidenceCrossCheckView[];
  relatedReports: string[];
  relatedDocs: string[];
  dashboardAnchors: string[];
  stopLines: string[];
  nextSafeActions: string[];
  readOnly: boolean;
  executionAuthorityApproved: boolean;
}

export interface ManagedRecipePolicyReportView {
  reportId: string;
  generatedAt: string;
  summary: string;
  recipes: WorkItemExecutionRecipeView[];
  stopLines: string[];
  nextSafeActions: string[];
  readOnly: boolean;
  executionAuthorityApproved: boolean;
  remoteAutomationApproved: boolean;
}

export interface GitHubWorkflowPolicyItemView {
  itemId: string;
  label: string;
  status: string;
  summary: string;
  evidence: string[];
}

export interface GitHubWorkflowPolicyReportView {
  reportId: string;
  generatedAt: string;
  summary: string;
  authModel: GitHubWorkflowPolicyItemView[];
  requiredChecks: GitHubWorkflowPolicyItemView[];
  stopLines: string[];
  nextSafeActions: string[];
  readOnly: boolean;
  executionAuthorityApproved: boolean;
  plaintextTokenStorageApproved: boolean;
  remoteAutomationApproved: boolean;
}

export interface GitHygieneSignalView {
  signalId: string;
  label: string;
  status: string;
  summary: string;
  evidence: string[];
}

export interface GitHygieneWorktreeView {
  path: string;
  branch?: string | null;
  head?: string | null;
  detached: boolean;
  locked: boolean;
  prunable: boolean;
}

export interface GitHygieneReportView {
  reportId: string;
  generatedAt: string;
  summary: string;
  repoRoot: string;
  currentBranch: string;
  headRevision: string;
  upstreamBranch?: string | null;
  workingTreeStatus: string;
  statusCounts: Record<string, number>;
  worktrees: GitHygieneWorktreeView[];
  localSignals: GitHygieneSignalView[];
  remoteSignals: GitHygieneSignalView[];
  stopLines: string[];
  nextSafeActions: string[];
  readOnly: boolean;
  remoteMutationApproved: boolean;
  cleanupApproved: boolean;
}

export interface LocalWorktreePlanView {
  planId: string;
  workItemId: string;
  title: string;
  executionBranch: string;
  baseBranch: string;
  baseRevision: string;
  worktreePath: string;
  status: string;
  createCommand: string[];
  cleanupCommand: string[];
  safetyChecks: string[];
  blockedBy: string[];
  evidence: string[];
  createAllowed: boolean;
  cleanupAllowed: boolean;
  remoteOperationsAllowed: boolean;
}

export interface CodexReadinessCheckView {
  checkId: string;
  label: string;
  status: string;
  summary: string;
  evidence: string[];
}

export interface CodexReadinessReportView {
  reportId: string;
  generatedAt: string;
  summary: string;
  cliPath?: string | null;
  checks: CodexReadinessCheckView[];
  stopLines: string[];
  nextSafeActions: string[];
  readOnly: boolean;
  processLaunchApproved: boolean;
  workerTaskExecutionApproved: boolean;
  sourceMutationApproved: boolean;
}

export interface CodexImplementationApprovalRequirementView {
  requirementId: string;
  label: string;
  status: string;
  summary: string;
  evidence: string[];
}

export interface CodexLaunchApprovalBindingView {
  workItemId: string;
  routeDecisionId: string;
  attemptId: string;
  workerId: string;
  lane: string;
  authorityMode: string;
  workspacePlanId: string;
  policyId: string;
  approvedScope: string[];
  expiresAt: string;
}

export interface CodexLaunchPermissionEnvelopeView {
  allowedPaths: string[];
  blockedPaths: string[];
  allowedCommandShape: string[];
  verificationCommand: string;
  timeoutSeconds: number;
  budget: string;
  evidenceOutputs: string[];
  stopConditions: string[];
}

export interface CodexLaunchContractEvaluationView {
  status: string;
  launchApproved: boolean;
  processLaunchAttempted: boolean;
  blockedReason?: string | null;
  unsafeField?: string | null;
  summary: string;
}

export interface CodexLaunchContractView {
  contractId: string;
  targetWorkItem: string;
  routeDecision: string;
  attemptId: string;
  workerId: string;
  lane: string;
  authorityMode: string;
  workspacePlan: string;
  approvalBinding: CodexLaunchApprovalBindingView;
  permissionEnvelope: CodexLaunchPermissionEnvelopeView;
  evidenceToRetain: string[];
  evaluation: CodexLaunchContractEvaluationView;
}

export interface CodexLaunchContractFixtureView {
  fixtureId: string;
  label: string;
  mutatedField: string;
  evaluation: CodexLaunchContractEvaluationView;
}

export interface CodexBlockedAuthorityView {
  authorityId: string;
  label: string;
  status: string;
  summary: string;
}

export interface CodexImplementationApprovalReportView {
  reportId: string;
  generatedAt: string;
  summary: string;
  approvalPrompt: string;
  authorityFamily: string;
  operation: string;
  targetScope: string[];
  allowedPaths: string[];
  blockedPaths: string[];
  expectedCommandShape: string[];
  requiredEvidence: string[];
  rollbackPlan: string[];
  stopConditions: string[];
  requirements: CodexImplementationApprovalRequirementView[];
  launchContract: CodexLaunchContractView;
  launchContractFixtures: CodexLaunchContractFixtureView[];
  blockedAuthorities: CodexBlockedAuthorityView[];
  nextSafeActions: string[];
  readOnly: boolean;
  processLaunchApproved: boolean;
  workerTaskExecutionApproved: boolean;
  sourceMutationApproved: boolean;
  approvalBindingImplemented: boolean;
}

export interface ClaudeReadinessCheckView {
  checkId: string;
  label: string;
  status: string;
  summary: string;
  evidence: string[];
}

export interface ClaudeReviewReadinessReportView {
  reportId: string;
  generatedAt: string;
  summary: string;
  cliPath?: string | null;
  reviewPolicy: ClaudeReadinessCheckView[];
  scarcityPolicy: ClaudeReadinessCheckView[];
  stopLines: string[];
  nextSafeActions: string[];
  readOnly: boolean;
  processLaunchApproved: boolean;
  reviewTaskExecutionApproved: boolean;
  sourceMutationApproved: boolean;
  scarceUseApproved: boolean;
}

export interface ClaudeReviewApprovalRequirementView {
  requirementId: string;
  label: string;
  status: string;
  summary: string;
  evidence: string[];
}

export interface ClaudeReviewApprovalReportView {
  reportId: string;
  generatedAt: string;
  summary: string;
  approvalPrompt: string;
  authorityFamily: string;
  operation: string;
  triggerPolicy: ClaudeReviewApprovalRequirementView[];
  contextScope: string[];
  blockedInputs: string[];
  expectedCommandShape: string[];
  outputContract: string[];
  requiredEvidence: string[];
  scarcityControls: string[];
  stopConditions: string[];
  nextSafeActions: string[];
  readOnly: boolean;
  processLaunchApproved: boolean;
  reviewTaskExecutionApproved: boolean;
  sourceMutationApproved: boolean;
  scarceUseApproved: boolean;
  approvalBindingImplemented: boolean;
}

export interface GitHubDeliveryAuthorityStepView {
  stepId: string;
  label: string;
  status: string;
  summary: string;
  requiredApproval: string;
  evidence: string[];
}

export interface GitHubDeliveryEligibilityStageView {
  stageId: string;
  label: string;
  status: string;
  summary: string;
  eligibleWhen: string[];
  hardStops: string[];
  allowedOperations: string[];
  blockedOperations: string[];
}

export interface GitHubDeliveryAuthorityReportView {
  reportId: string;
  generatedAt: string;
  summary: string;
  authorityFamily: string;
  approvalPrompt: string;
  ladder: GitHubDeliveryAuthorityStepView[];
  trustedDeliveryPolicy: string[];
  eligibilityStages: GitHubDeliveryEligibilityStageView[];
  requiredEvidence: string[];
  rollbackPlan: string[];
  stopConditions: string[];
  nextSafeActions: string[];
  readOnly: boolean;
  pushApproved: boolean;
  pullRequestApproved: boolean;
  ciWaitApproved: boolean;
  reviewResolutionApproved: boolean;
  mergeApproved: boolean;
  remoteCleanupApproved: boolean;
  automaticDeliveryApproved: boolean;
}

export interface TrustedDeliveryEligibilityCheckView {
  checkId: string;
  label: string;
  gateFamily: string;
  status: string;
  summary: string;
  evidence: string[];
  blockedReason?: string | null;
}

export interface TrustedDeliveryEligibilityStageEvaluationView {
  stageId: string;
  label: string;
  status: string;
  eligible: boolean;
  checks: TrustedDeliveryEligibilityCheckView[];
  allowedOperations: string[];
  blockedOperations: string[];
  nextAction: string;
}

export interface TrustedDeliveryDiffGuardFileView {
  path: string;
  changeType: string;
  classification: string;
  reason: string;
}

export interface TrustedDeliveryDiffGuardView {
  approvedFiles: string[];
  allowedGlobs: string[];
  forbiddenPaths: string[];
  generatedFileRules: string[];
  userOwnedDirtyFileRules: string[];
  status: string;
  blockedReason?: string | null;
  changedFiles: TrustedDeliveryDiffGuardFileView[];
  blockedPaths: string[];
  recommendation: string;
}

export interface TrustedDeliveryDiffGuardFixtureView {
  fixtureId: string;
  label: string;
  guard: TrustedDeliveryDiffGuardView;
}

export interface TrustedDeliveryVerificationEvidenceView {
  commandId: string;
  label: string;
  commandShape: string;
  status: string;
  exitCode?: number | null;
  durationMs?: number | null;
  summary: string;
  artifactRef?: string | null;
  recoveryAction: string;
  rawOutputRetained: boolean;
}

export interface TrustedDeliveryVerificationEvidenceFixtureView {
  fixtureId: string;
  label: string;
  evidence: TrustedDeliveryVerificationEvidenceView;
  greenGateContribution: string;
  blockedReason?: string | null;
}

export interface TrustedDeliveryActionEligibilityView {
  actionId: string;
  label: string;
  status: string;
  evidence: string[];
  blockedReasons: string[];
  nextAction: string;
  executionApproved: boolean;
}

export interface TrustedDeliveryActionEligibilityFixtureView {
  fixtureId: string;
  label: string;
  actions: TrustedDeliveryActionEligibilityView[];
}

export interface TrustedDeliveryEligibilityReportView {
  reportId: string;
  generatedAt: string;
  summary: string;
  currentBranch: string;
  baseBranch: string;
  headRevision: string;
  workingTreeStatus: string;
  commitsAhead: number;
  diffStat: string;
  diffGuard: TrustedDeliveryDiffGuardView;
  diffGuardFixtures: TrustedDeliveryDiffGuardFixtureView[];
  verificationEvidenceFixtures: TrustedDeliveryVerificationEvidenceFixtureView[];
  actionEligibility: TrustedDeliveryActionEligibilityView[];
  actionEligibilityFixtures: TrustedDeliveryActionEligibilityFixtureView[];
  unrelatedAuthoritiesBlocked: string[];
  stages: TrustedDeliveryEligibilityStageEvaluationView[];
  hardStops: string[];
  nextSafeActions: string[];
  readOnly: boolean;
  automaticDeliveryApproved: boolean;
  pushPrAutoEligible: boolean;
  mergeAutoEligible: boolean;
  cleanupAutoEligible: boolean;
}

export interface LowRiskDeliveryPlanActionView {
  actionId: string;
  label: string;
  status: string;
  eligible: boolean;
  dryRunEffects: string[];
  evidence: string[];
  blockedReasons: string[];
  nextSafeAction: string;
  requiredApproval: string;
  requiredPolicy: string;
  allowedOperations: string[];
  blockedOperations: string[];
  readOnly: boolean;
}

export interface LowRiskDeliveryPlanReportView {
  reportId: string;
  generatedAt: string;
  summary: string;
  workItemId?: string | null;
  currentBranch: string;
  baseBranch: string;
  headRevision: string;
  workingTreeStatus: string;
  prRef?: string | null;
  actions: LowRiskDeliveryPlanActionView[];
  hardStops: string[];
  nextSafeActions: string[];
  readOnly: boolean;
  remoteMutationApproved: boolean;
  cleanupApproved: boolean;
  automaticDeliveryApproved: boolean;
}

export interface DeliveryExecutionEvidencePayload {
  actionId: "pr" | "merge";
  recordEvent?: boolean;
  approvalId?: string | null;
  policyId?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
  expectedBranch?: string | null;
  expectedHeadRevision?: string | null;
  pullRequestUrl?: string | null;
  pullRequestHeadRevision?: string | null;
  baseBranch?: string | null;
  ciStatus?: string | null;
  reviewState?: string | null;
  mergeStatus?: string | null;
  mergeResult?: string | null;
  commandShape?: string | null;
  terminalStatus?: string | null;
  exitCode?: number | null;
  summary?: string | null;
  artifactRefs?: string[];
  recoveryPath?: string | null;
}

export interface DeliveryApprovalLedgerEntryView {
  approvalId: string;
  authorityFamily: string;
  policyId: string;
  actionId: "pr" | "merge";
  workItemId: string;
  targetBranch: string;
  baseBranch: string;
  headRevision: string;
  pullRequestUrl: string;
  pullRequestHeadRevision: string;
  ciStatus: string;
  reviewState: string;
  mergeStatus?: string | null;
  retainedEvidence: string[];
  approvedBy: string;
  approvedAt?: string | null;
  expiresAt?: string | null;
  reviewPoint?: string | null;
  rollbackPlan: string[];
  stopLines: string[];
}

export interface DeliveryExecutionEvidenceView {
  evidenceId: string;
  mode: string;
  actionId: string;
  status: string;
  eventRecorded: boolean;
  blockedReasons: string[];
  commandShape?: string | null;
  targetBranch?: string | null;
  pullRequestUrl?: string | null;
  expectedHeadRevision?: string | null;
  pullRequestHeadRevision?: string | null;
  baseBranch?: string | null;
  ciStatus?: string | null;
  reviewState?: string | null;
  mergeStatus?: string | null;
  mergeResult?: string | null;
  terminalStatus?: string | null;
  exitCode?: number | null;
  summary: string;
  artifactRefs: string[];
  approvalReference?: string | null;
  recoveryPath: string;
  rawOutputRetained: boolean;
  cleanupAllowed: boolean;
  externalMutationRecorded: boolean;
  remoteMutationPerformed: boolean;
}

export interface CleanupPlanResidueView {
  kind: string;
  path: string;
  insideApprovedTarget: boolean;
  safeToRemoveAfterApproval: boolean;
}

export interface CleanupPlanView {
  planId: string;
  generatedAt: string;
  workItemId: string;
  status: string;
  branchTarget: string;
  cleanupTargetPath?: string | null;
  gitWorktreeState: string;
  filesystemState: string;
  sourceFileState: string;
  sourceFiles: string[];
  retainedEvidence: string[];
  residue: CleanupPlanResidueView[];
  blockedPaths: string[];
  dryRunEffects: string[];
  blockedReasons: string[];
  requiredApproval: string;
  requiredPolicy: string;
  recoveryPath: string;
  nextSafeActions: string[];
  readOnly: boolean;
  cleanupAllowed: boolean;
  branchDeletionApproved: boolean;
  worktreeRemovalApproved: boolean;
  evidenceDeletionApproved: boolean;
  remoteMutationApproved: boolean;
}

export interface LocalCleanupPolicyItemView {
  itemId: string;
  label: string;
  status: string;
  summary: string;
  evidence: string[];
}

export interface LocalCleanupReadinessReportView {
  reportId: string;
  generatedAt: string;
  summary: string;
  cleanupPolicy: LocalCleanupPolicyItemView[];
  requiredEvidence: string[];
  blockedTargets: string[];
  stopConditions: string[];
  nextSafeActions: string[];
  readOnly: boolean;
  automaticCleanupApproved: boolean;
  worktreeRemovalApproved: boolean;
  branchDeletionApproved: boolean;
  evidenceDeletionApproved: boolean;
}

export interface RemoteCleanupSyncPolicyItemView {
  itemId: string;
  label: string;
  status: string;
  summary: string;
  evidence: string[];
}

export interface RemoteCleanupSyncReadinessReportView {
  reportId: string;
  generatedAt: string;
  summary: string;
  syncPolicy: RemoteCleanupSyncPolicyItemView[];
  requiredEvidence: string[];
  blockedOperations: string[];
  stopConditions: string[];
  nextSafeActions: string[];
  readOnly: boolean;
  remoteBranchDeletionApproved: boolean;
  issueSyncApproved: boolean;
  storyStatusSyncApproved: boolean;
  remoteMutationApproved: boolean;
}

export interface TrustedAutonomyReadinessGateView {
  gateId: string;
  label: string;
  status: string;
  summary: string;
  evidence: string[];
}

export interface TrustedAutonomyReadinessReportView {
  reportId: string;
  generatedAt: string;
  summary: string;
  autonomyGates: TrustedAutonomyReadinessGateView[];
  eligibleWork: string[];
  blockedWork: string[];
  requiredEvidence: string[];
  stopConditions: string[];
  nextSafeActions: string[];
  readOnly: boolean;
  lowRiskAutonomyApproved: boolean;
  autonomousProviderUseApproved: boolean;
  autonomousGitHubDeliveryApproved: boolean;
  autonomousCleanupApproved: boolean;
}

export interface EpicCompletionAuditItemView {
  itemId: string;
  label: string;
  status: string;
  summary: string;
  evidence: string[];
}

export interface EpicCompletionAuditReportView {
  reportId: string;
  generatedAt: string;
  summary: string;
  epicId: string;
  overallStatus: string;
  completedItems: EpicCompletionAuditItemView[];
  remainingItems: EpicCompletionAuditItemView[];
  blockedOperations: string[];
  recommendedApproval: string;
  requiredEvidence: string[];
  stopConditions: string[];
  nextSafeActions: string[];
  readOnly: boolean;
  epicComplete: boolean;
  remoteDeliveryApproved: boolean;
  providerExecutionApproved: boolean;
  cleanupApproved: boolean;
}

export interface MvpProofTrialStepView {
  stepId: string;
  label: string;
  status: string;
  summary: string;
  requiredApproval: string;
  evidence: string[];
}

export interface MvpProofTrialReportView {
  reportId: string;
  generatedAt: string;
  summary: string;
  selectedStory: string;
  trialStatus: string;
  steps: MvpProofTrialStepView[];
  approvalPackets: string[];
  blockedOperations: string[];
  stopConditions: string[];
  nextSafeActions: string[];
  readOnly: boolean;
  codexLaunchApproved: boolean;
  claudeLaunchApproved: boolean;
  providerExpansionApproved: boolean;
  autonomousDeliveryApproved: boolean;
}

export interface DeliveryReadinessPolicyItemView {
  itemId: string;
  label: string;
  status: string;
  summary: string;
  evidence: string[];
}

export interface DeliveryReadinessPolicyReportView {
  reportId: string;
  generatedAt: string;
  summary: string;
  statusPolicy: DeliveryReadinessPolicyItemView[];
  waiverPolicy: DeliveryReadinessPolicyItemView[];
  stopLines: string[];
  nextSafeActions: string[];
  readOnly: boolean;
  executionAuthorityApproved: boolean;
  remoteAutomationApproved: boolean;
}

export interface ThreatBoundaryRuleView {
  ruleId: string;
  label: string;
  status: string;
  summary: string;
  blockedReason: string;
  evidence: string[];
}

export interface ThreatBoundaryView {
  boundaryId: string;
  status: string;
  generatedAt: string;
  summary: string;
  redactionBoundary: string[];
  promptConstructionSources: string[];
  allowedCommandClasses: string[];
  blockedCommandClasses: string[];
  providerEndpointPolicy: string;
  credentialPolicy: string;
  artifactPolicy: string;
  rules: ThreatBoundaryRuleView[];
  processLaunchAllowed: boolean;
  providerCallsAllowed: boolean;
  modelCallsAllowed: boolean;
  premiumExecutionAllowed: boolean;
  commandExecutionAllowed: boolean;
  sourceMutationAllowed: boolean;
  networkAllowed: boolean;
  credentialAccessAllowed: boolean;
}
export interface RoutingOverrideView {
  overrideId: string;
  workItemId: string;
  createdAt: string;
  currentRoute: RoutingDecisionView;
  proposedLane: string;
  reason: string;
  note?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
  executionAffected: boolean;
}

export interface WorkItemView extends WorkItemPayload {
  id: string;
  origin: "operator" | "supervisor";
  state: WorkflowState;
  lane: BmadLane | null;
  assigneeId?: string | null;
  assigneeLabel?: string | null;
  ageMinutes: number;
  needsAttention: boolean;
  attentionReason?: string | null;
  escalatedAt?: string | null;
  escalationReason?: string | null;
  escalatedByLabel?: string | null;
  statusSummary: string;
  blockedReason: string | null;
  nextStep: string | null;
  selfDetectedIssue: boolean;
  selfDetectedIssueCategory?: string | null;
  executionRecipe?: WorkItemExecutionRecipeView | null;
  deliveryReadiness?: WorkItemDeliveryReadinessView | null;
  createdAt: string;
  updatedAt: string;
  lastEventAt: string;
  requiresAudit: boolean;
  auditMode: "none" | "advisory" | "required";
}

export interface RunStatusView {
  mode: RunMode;
  pollIntervalSeconds: number;
  queueCount: number;
  activeCount: number;
  blockedCount: number;
  doneCount: number;
  summary: string;
}

export interface ApiEnvelope<T> {
  data: T;
  meta?: Record<string, string | number | boolean | null>;
}

export interface WorkItemActionPayload {
  action: WorkflowAction;
  note?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
}

export interface WorkflowEventView {
  id: string;
  workItemId: string;
  eventType: string;
  actorType: string;
  actorId?: string | null;
  actorLabel?: string | null;
  correlationId: string;
  summary: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface RuntimeEvidenceExportBoundaryView {
  localRuntimeState: string[];
  gitBackedEvidence: string[];
  relatedSupervisorReports: string[];
  excludedState: string[];
}

export interface RuntimeEvidenceExportSafetyView {
  exportOnly: boolean;
  processLaunchAllowed: boolean;
  providerCallsAllowed: boolean;
  modelCallsAllowed: boolean;
  premiumExecutionAllowed: boolean;
  commandExecutionAllowed: boolean;
  sourceMutationAllowed: boolean;
  networkAllowed: boolean;
  credentialAccessAllowed: boolean;
}

export interface RuntimeEvidenceReviewManifestView {
  manifestId: string;
  summary: string;
  evidenceCounts: Record<string, number>;
  reviewChecklist: string[];
  retentionNotes: string[];
  stopLines: string[];
  readOnly: boolean;
  executionAuthorityApproved: boolean;
}

export interface RuntimeEvidenceCrossCheckView {
  label: string;
  report: string;
  dashboardAnchor: string;
  relatedDoc: string;
  reason: string;
}

export interface RuntimeEvidenceReviewNavigatorItemView {
  itemId: string;
  label: string;
  priority: string;
  target: string;
  summary: string;
  evidence: string[];
  relatedReports: string[];
  relatedDocs: string[];
  dashboardAnchors: string[];
  stopLines: string[];
  crossChecks: RuntimeEvidenceCrossCheckView[];
}

export interface RuntimeEvidenceSubscriptionLaunchView {
  status: string;
  readinessStatus: string;
  latestEventType?: string | null;
  latestEventAt?: string | null;
  approvalBinding: Record<string, unknown>;
  lifecycleSummary: Record<string, unknown>;
  workspaceSummary: Record<string, unknown>;
  outputArtifactReferences: Record<string, unknown>[];
  verificationEvidence: Record<string, unknown>;
  safetyFlags: Record<string, boolean>;
  cancellationTimeoutRollbackEvidence: Record<string, unknown>;
  relatedReports: string[];
  rawOutputStored: boolean;
}

export interface RuntimeEvidenceExportView {
  exportId: string;
  format: "application/json";
  version: string;
  generatedAt: string;
  workItem: WorkItemView;
  executionAttempts: ExecutionAttemptView[];
  workflowEvents: WorkflowEventView[];
  boundary: RuntimeEvidenceExportBoundaryView;
  safety: RuntimeEvidenceExportSafetyView;
  reviewManifest: RuntimeEvidenceReviewManifestView;
  reviewNavigator: RuntimeEvidenceReviewNavigatorItemView[];
  subscriptionLaunch: RuntimeEvidenceSubscriptionLaunchView;
}

export interface OperatorProfile {
  actorId: string;
  actorLabel: string;
}

export interface WorkItemAssignmentPayload {
  assigneeId?: string | null;
  assigneeLabel?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
}

export interface WorkItemEscalationPayload {
  reason?: string | null;
  clear?: boolean;
  actorId?: string | null;
  actorLabel?: string | null;
}

export interface WorkItemDeliveryReadinessPayload {
  pullRequestStatus?: string | null;
  pullRequestUrl?: string | null;
  ciStatus?: string | null;
  mergeStatus?: string | null;
  deliveryWaived?: boolean;
  deliveryWaiverReason?: string | null;
  note?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
}

export interface WorkItemManagedActionPayload {
  expectedActionId?: string | null;
  note?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
}

export interface WorkItemBranchPreparationPayload {
  note?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
}

export interface WorkItemFilterView {
  query: string;
  risk: "all" | RiskLevel;
  audit: AuditFilterMode;
  source: string;
  origin: "all" | "operator" | "supervisor";
  issues: "all" | "self-detected";
}

export interface SavedWorkItemView {
  id: string;
  name: string;
  scope: WorkItemFilterScope;
  filters: WorkItemFilterView;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SavedWorkItemViewPayload {
  name: string;
  scope: WorkItemFilterScope;
  filters: WorkItemFilterView;
}

export type RunnerAssignmentReportStatus = "ok" | "partial" | "error";
export type RunnerAssignmentStateRootStatus = "available" | "missing" | "unreadable" | "partial";
export type RunnerAssignmentClassification =
  | "active"
  | "claimed"
  | "assignable"
  | "ambiguous"
  | "unknown"
  | "blocked_authority"
  | "blocked_stale_owner_needs_takeover"
  | "blocked_missing_metadata"
  | "blocked_duplicate_active_owner"
  | "blocked_unreadable_state"
  | "blocked_malformed_state"
  | "blocked_missing_worktree"
  | "closed";
export type RunnerAssignmentWarningSeverity = "info" | "warning" | "blocking";
export type RunnerAssignmentInputKind =
  | "state-root"
  | "tasks-dir"
  | "assignments-dir"
  | "task-manifest"
  | "assignment-record"
  | "worktree"
  | "safe-backlog"
  | "unknown";

export interface RunnerAssignmentWarningView {
  code: string;
  severity: RunnerAssignmentWarningSeverity;
  message: string;
}

export interface RunnerAssignmentDegradedInputView {
  inputKind: RunnerAssignmentInputKind;
  path?: string | null;
  severity: RunnerAssignmentWarningSeverity;
  reason: string;
  skippedCount?: number | null;
}

export interface RunnerAssignmentStatusSummaryView {
  active: number;
  stale: number;
  blocked: number;
  ambiguous: number;
  assignable: number;
  closed: number;
  degraded: number;
  missing: number;
}

export interface RunnerSourceCompletionRollupView {
  total: number;
  assignment: number;
  workspace: number;
  sourceBacklogItemIds: string[];
}

export interface RunnerDispatcherQueueProofRowView {
  backlogItemId: string;
  classification: RunnerAssignmentClassification;
  reasonCode: string;
  branch?: string | null;
  nextSafeAction: string;
}

export interface RunnerDispatcherContinuitySnapshotView {
  snapshotId: string;
  selectedBacklogItemId?: string | null;
  selectedBranch?: string | null;
  dryRunCommand: string;
  summaryDryRunCommand: string;
  assignableCount: number;
  activeCount: number;
  blockedCount: number;
  ambiguousCount: number;
  closedCount: number;
  blockerCodes: string[];
  queueProofRows: RunnerDispatcherQueueProofRowView[];
  nextAction: string;
}

export interface RunnerHandoffAuditEntryView {
  sequence: number;
  lane?: string | null;
  branch?: string | null;
  taskId?: string | null;
  workspaceAction?: string | null;
  nextCommand?: string | null;
  generatedAt?: string | null;
  readinessStatus?: string | null;
  readinessCommand?: string | null;
  readinessSummary?: string | null;
  queueCounts: Record<string, number>;
  queueCountsStatus: "available" | "empty" | "invalid" | "missing" | "not-applicable";
  stopLines: string[];
  lifecycleState: "prepared" | "claimed" | "delivered" | "cleaned" | "missing" | "not-applicable";
  recoveryAction:
    | "resume-prepared-handoff"
    | "wait-for-owner"
    | "request-takeover-approval"
    | "request-explicit-approval"
    | "inspect-handoff-evidence"
    | "resume-cleanup"
    | "no-action";
  recoverySummary: string;
  retentionPolicy: "metadata-only" | "capped-metadata-only";
  payloadRetention: "not-retained" | "redacted" | "omitted";
  retentionSummary: string;
  evidenceStatus: "complete" | "partial" | "invalid";
  evidenceSummary: string;
}

export interface RunnerSourceCompletionEvidenceView {
  evidenceKind: "assignment" | "workspace";
  recordId: string;
  sourceBacklogItemId: string;
  branch?: string | null;
  taskId?: string | null;
  sourceAssignmentId?: string | null;
  evidencePath?: string | null;
  evidenceSummary: string;
}

export interface RunnerAssignmentStatusRowView {
  id: string;
  title: string;
  classification: RunnerAssignmentClassification;
  degraded: boolean;
  reasonCode: string;
  reason: string;
  warnings: RunnerAssignmentWarningView[];
  nextSafeAction: string;
  owner?: string | null;
  branch?: string | null;
  taskId?: string | null;
  assignmentId?: string | null;
  backlogItemId?: string | null;
  phase?: string | null;
  runnerKind: "codex" | "local" | "unknown";
  heartbeatAt?: string | null;
  heartbeatSource: "last_heartbeat_at" | "owner_updated_at" | "updated_at" | "assigned_at" | "created_at" | "missing" | "invalid" | "future";
  heartbeatAgeSeconds?: number | null;
  heartbeatMissing: boolean;
  staleAfterSeconds: number;
  currentCommand?: string | null;
  lastResult?: string | null;
  worktreePath?: string | null;
  worktreeState: "clean" | "dirty" | "missing" | "unreadable" | "not-applicable";
  handoffStatus: "available" | "missing" | "not-applicable";
  handoffNextCommand?: string | null;
  handoffReadinessStatus?: string | null;
  handoffReadinessCommand?: string | null;
  handoffGeneratedAt?: string | null;
  handoffSummary?: string | null;
  handoffTakeoverStopLines: string[];
  handoffCandidateStateCounts: Record<string, number>;
  handoffCandidateStateCountsStatus: "available" | "empty" | "invalid" | "missing" | "not-applicable";
  handoffLifecycleState: "prepared" | "claimed" | "delivered" | "cleaned" | "missing" | "not-applicable";
  handoffRecoveryAction:
    | "resume-prepared-handoff"
    | "wait-for-owner"
    | "request-takeover-approval"
    | "request-explicit-approval"
    | "inspect-handoff-evidence"
    | "resume-cleanup"
    | "no-action";
  handoffRecoverySummary: string;
  handoffAuditTrail: RunnerHandoffAuditEntryView[];
  deliveryState: "no-pr" | "draft-pr" | "pr-open" | "pr-closed-unmerged" | "merged" | "cleanup-ready" | "cleanup-partial" | "closed" | "unknown-pr-state" | "unknown";
  localEvidenceStatus: "available" | "missing" | "unreadable" | "malformed" | "skipped";
  evidencePath?: string | null;
  sourceCompletionEvidence?: RunnerSourceCompletionEvidenceView | null;
}

export type RunnerWorkspaceAssignmentView = RunnerAssignmentStatusRowView;
export type RunnerLaneAssignmentView = RunnerAssignmentStatusRowView;
export type RunnerBacklogCandidateView = RunnerAssignmentStatusRowView;

export interface RunnerAssignmentStatusReportView {
  reportStatus: RunnerAssignmentReportStatus;
  errorMessage?: string | null;
  generatedAt: string;
  stateRoot?: string | null;
  stateRootStatus: RunnerAssignmentStateRootStatus;
  partial: boolean;
  currentOwner?: string | null;
  staleAfterSeconds: number;
  summary: RunnerAssignmentStatusSummaryView;
  sourceCompletionRollup: RunnerSourceCompletionRollupView;
  dispatcherContinuity: RunnerDispatcherContinuitySnapshotView;
  workspaceAssignments: RunnerWorkspaceAssignmentView[];
  laneAssignments: RunnerLaneAssignmentView[];
  backlogCandidates: RunnerBacklogCandidateView[];
  degradedInputs: RunnerAssignmentDegradedInputView[];
}
