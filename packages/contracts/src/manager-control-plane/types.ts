import type {
  AuthorityDecisionId,
  CandidateWorkPacketId,
  EvidenceRefId,
  ExecutionAttemptId,
  ImplementationRunContractId,
  LeaseId,
  ManagerCausationId,
  ManagerCorrelationId,
  ManagerEventId,
  ManagerIdempotencyKey,
  ManagerPolicyId,
  ManagerRunId,
  ManagerSourceRefId,
  ManagerWorkerId,
  RefillJobId,
  VerificationTargetId,
  WorkItemId
} from "./ids";
import type { ManagerAuthorityDecisionClass, ManagerAuthorityFamily, ManagerAuthorityStage, ManagerRunPreauthorization } from "./authority";
import type { ManagerActorType, ManagerControlPlaneEventName, ManagerProjectionBehavior, ManagerRedactionBoundary } from "./events";
import type {
  ManagerCandidateWorkPacketStatus,
  ManagerExecutionAttemptStatus,
  ManagerLeaseStatus,
  ManagerWorkItemStatus
} from "./lifecycle";

export type ManagerRiskClass = "low" | "medium" | "high" | "extreme";
export type ManagerRetentionClass = "metadata_only" | "summary" | "fixture";
export type ManagerRunSourceSelection = "explicit" | "inferred_assumption";
export type ManagerRunControlState = "starting" | "active" | "operator_paused" | "drain" | "quiet" | "status_only" | "needs_review" | "blocked";

export interface ManagerSourceRef {
  sourceRefId: ManagerSourceRefId;
  sourceType: "prd" | "bmad_artifact" | "research" | "repo_source" | "runtime_state" | "manual";
  label: string;
  pathOrUrl?: string | null;
  sourceSpan?: string | null;
  summaryOnly: boolean;
}

export interface VerificationTarget {
  verificationTargetId: VerificationTargetId;
  commandId: string;
  command: string;
  expectedResult: string;
}

export interface EvidenceRef {
  evidenceRefId: EvidenceRefId;
  evidenceType: "contract" | "event" | "attempt" | "summary" | "verification" | "fixture";
  label: string;
  artifactPath?: string | null;
  retentionClass: ManagerRetentionClass;
  rawPayloadRetained: false;
  createdAt: string;
}

export interface ManagerRunTargetWorkerPolicy {
  desiredWorkers: number;
  maxWorkers: number;
  activeWorkHandling: string;
  killHealthyWorkersByDefault: false;
}

export interface ManagerRunStartState {
  runId: ManagerRunId;
  sourceRef: ManagerSourceRef;
  sourceSelection: ManagerRunSourceSelection;
  sourceSelectionReason: string;
  targetWorkerPolicy: ManagerRunTargetWorkerPolicy;
  authorityProfile: string;
  authorityStage: ManagerAuthorityStage;
  runtimeStatePath: string;
  controlState: ManagerRunControlState;
  evidenceRefs: readonly EvidenceRefId[];
  createdAt: string;
  updatedAt: string;
}

export interface ManagerRunFutureDispatchState {
  action: string;
  newDispatchAllowed: boolean;
  scope: string;
  targetWorkers?: number | null;
  focusSurface?: string | null;
}

export interface ManagerRunActiveWorkPolicy {
  defaultAction: string;
  activeWorkHandling: string;
  killHealthyWorkersByDefault: false;
}

export interface ManagerRunOperatorReport {
  whatChanged: string;
  whyItMatters: string;
  whatHappensNext: string;
}

export interface ManagerRunControlStateRecord {
  runId: ManagerRunId;
  controlState: ManagerRunControlState;
  requestedAction: string;
  affectedScope: string;
  authorityBasis: string;
  authorityDecisionId?: AuthorityDecisionId | null;
  authorityStage: ManagerAuthorityStage;
  nextAction: string;
  futureDispatch: ManagerRunFutureDispatchState;
  activeWorkPolicy: ManagerRunActiveWorkPolicy;
  operatorReport: ManagerRunOperatorReport;
  blocker?: string | null;
  needsReviewReason?: string | null;
  retentionClass: ManagerRetentionClass;
  evidenceRefs: readonly EvidenceRefId[];
  createdAt: string;
}

export interface ManagerRuntimeLedgerFileSet {
  runId: ManagerRunId;
  root: string;
  missionPath: string;
  eventsPath: string;
  workersPath: string;
  dispatcherSummaryPath: string;
  checkpointsPath: string;
  questionsPath: string;
  resourceSnapshotsPath: string;
  usageSnapshotsPath: string;
}

export interface ManagerRuntimeRecoveryBlocker {
  code: string;
  file?: string | null;
  reason: string;
  safeRepairAction: string;
  evidenceRefs: readonly EvidenceRefId[];
}

export interface ManagerRuntimeLedgerEventRecord {
  eventId: ManagerEventId;
  schemaVersion: string;
  eventName: ManagerControlPlaneEventName;
  runId: ManagerRunId;
  actorType: ManagerActorType;
  actorId: string;
  authorityBasis: string;
  sourceRefs: readonly string[];
  result: "recorded" | "blocked" | "needs_review" | "replayed";
  blocker?: ManagerRuntimeRecoveryBlocker | null;
  recoveryPath?: string | null;
  evidenceRefs: readonly EvidenceRefId[];
  correlationId: ManagerCorrelationId;
  causationId: ManagerCausationId;
  orderingKey: string;
  idempotencyKey: ManagerIdempotencyKey;
  redactionBoundary: ManagerRedactionBoundary;
  projectionBehavior: ManagerProjectionBehavior;
  summary: string;
  rawPayloadRetained: false;
  createdAt: string;
}

export interface ManagerRuntimeLedgerReplaySummary {
  runId: ManagerRunId;
  mission: string;
  authorityStage: ManagerAuthorityStage;
  controlState: ManagerRunControlState;
  eventWatermark: string;
  outstandingBlockers: readonly ManagerRuntimeRecoveryBlocker[];
  openQuestions: readonly string[];
  latestCheckpoints: readonly string[];
  latestResourceState: string;
  latestUsageState: string;
  nextSafeAction: string;
  recoveryBlockers: readonly ManagerRuntimeRecoveryBlocker[];
  rawPayloadRetained: false;
  evidenceRefs: readonly EvidenceRefId[];
}

export type ManagerAllowedExecutionMode =
  | "deterministic_script"
  | "fixture_fake_worker"
  | "local_runtime_state"
  | "live_worker"
  | "delivery_phase"
  | "cleanup_phase";

export interface ImplementationRunTask {
  taskId: string;
  title: string;
  requirementIds: readonly string[];
  authorityClass: ManagerAuthorityDecisionClass;
  allowedExecutionMode: ManagerAllowedExecutionMode;
  verificationCommandId: string;
  evidenceArtifact: string;
  dependencyImpact: string;
  completionCondition: string;
}

export interface ImplementationRunResumeProtocol {
  reconcileDispatcherState: boolean;
  reconcileRuntimeLedger: boolean;
  reconcileWorkerSessions: boolean;
  reconcileWorkspaceAssignments: boolean;
  reconcileGitState: boolean;
  reconcilePrState: boolean;
  nextActionOnMismatch: string;
}

export interface ImplementationRunDeliveryPhase {
  branchScope: string;
  targetBase: string;
  exactHeadProtection: boolean;
  reviewThreadRequirement: string;
  checkRequirement: string;
  localVerificationCommands: readonly string[];
  allowedCleanupTargets: readonly string[];
  rollbackPath: string;
  stopLines: readonly string[];
}

export interface ImplementationRunContract {
  implementationRunContractId: ImplementationRunContractId;
  runId: ManagerRunId;
  scope: string;
  outOfScope: readonly string[];
  sourceRefs: readonly ManagerSourceRef[];
  requiredArtifacts: readonly string[];
  taskGraph: readonly ImplementationRunTask[];
  authorityStage: ManagerAuthorityStage;
  allowedExecutionMode: ManagerAllowedExecutionMode;
  authorityFamilies: readonly ManagerAuthorityFamily[];
  stopLines: readonly string[];
  verificationCommands: readonly VerificationTarget[];
  evidencePaths: readonly string[];
  completionCriteria: readonly string[];
  resumeProtocol: ImplementationRunResumeProtocol;
  deliveryPhase?: ImplementationRunDeliveryPhase | null;
  preauthorizations: readonly ManagerRunPreauthorization[];
  evidenceRefs: readonly EvidenceRefId[];
  createdAt: string;
  updatedAt: string;
}

export interface CandidateWorkPacket {
  candidateWorkPacketId: CandidateWorkPacketId;
  runId: ManagerRunId;
  sourceRefs: readonly ManagerSourceRef[];
  proposedSlice: string;
  acceptanceCriteria: readonly string[];
  verificationTargets: readonly VerificationTarget[];
  riskClass: ManagerRiskClass;
  dependencyHints: readonly string[];
  dedupeKey: string;
  authorityClass: ManagerAuthorityDecisionClass;
  authorityStage: ManagerAuthorityStage;
  status: ManagerCandidateWorkPacketStatus;
  policyId: ManagerPolicyId;
  evidenceRefs: readonly EvidenceRefId[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkItem {
  workItemId: WorkItemId;
  runId: ManagerRunId;
  candidateWorkPacketId: CandidateWorkPacketId;
  sourceRefs: readonly ManagerSourceRef[];
  dedupeKey: string;
  title: string;
  sliceType: ManagerAuthorityStage;
  status: ManagerWorkItemStatus;
  priority: "low" | "normal" | "high";
  authorityClass: ManagerAuthorityDecisionClass;
  authorityDecisionId: AuthorityDecisionId;
  verificationTargets: readonly VerificationTarget[];
  dependencies: readonly WorkItemId[];
  attemptCount: number;
  leaseId?: LeaseId | null;
  evidenceRefs: readonly EvidenceRefId[];
  createdAt: string;
  updatedAt: string;
}

export interface Lease {
  leaseId: LeaseId;
  workItemId: WorkItemId;
  workerId: ManagerWorkerId;
  attemptId: ExecutionAttemptId;
  state: ManagerLeaseStatus;
  claimedAt: string;
  heartbeatAt?: string | null;
  expiresAt: string;
  attempt: number;
  idempotencyKey: ManagerIdempotencyKey;
  authorityDecisionId: AuthorityDecisionId;
  evidenceRefs: readonly EvidenceRefId[];
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionAttempt {
  attemptId: ExecutionAttemptId;
  leaseId: LeaseId;
  workItemId: WorkItemId;
  workerId: ManagerWorkerId;
  state: ManagerExecutionAttemptStatus;
  startedAt: string;
  finishedAt?: string | null;
  resultSummary?: string | null;
  failureReason?: string | null;
  authorityDecisionId: AuthorityDecisionId;
  evidenceRefs: readonly EvidenceRefId[];
  createdAt: string;
  updatedAt: string;
}
