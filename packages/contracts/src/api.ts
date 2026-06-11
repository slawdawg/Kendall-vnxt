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
  processLaunchAllowed: boolean;
  executionAllowed: boolean;
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

export interface LocalEvidenceExplanationPayload {
  stepId?: string | null;
  taskKind?: string | null;
  recordEvent?: boolean;
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

export interface DocumentationAuthorityReportView {
  reportId: string;
  generatedAt: string;
  summary: string;
  indexes: DocumentationAuthorityDocumentView[];
  approvalCheckpoint: DocumentationAuthorityDocumentView;
  blockedStories: DocumentationAuthorityBlockedStoryView[];
  driftChecks: ProviderEnablementPolicyStepView[];
  nextSafeActions: string[];
  executionAuthorityApproved: boolean;
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
  nextAction: string;
}

export interface AuthorityReadinessMatrixReportView {
  reportId: string;
  generatedAt: string;
  summary: string;
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
  relatedReports: string[];
  relatedDocs: string[];
  dashboardAnchors: string[];
  blockedBy: string[];
  nextAction: string;
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
  status: string;
  summary: string;
  evidence: string[];
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
  stages: TrustedDeliveryEligibilityStageEvaluationView[];
  hardStops: string[];
  nextSafeActions: string[];
  readOnly: boolean;
  automaticDeliveryApproved: boolean;
  pushPrAutoEligible: boolean;
  mergeAutoEligible: boolean;
  cleanupAutoEligible: boolean;
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
