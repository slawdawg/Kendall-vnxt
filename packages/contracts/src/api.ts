import type {
  AuditFilterMode,
  BmadLane,
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
export interface LocalEvidenceItemView {
  eventType: string;
  summary: string;
  createdAt: string;
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
