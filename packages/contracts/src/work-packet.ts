import type {
  CandidateWorkView,
  ExecutionAttemptStatus,
  RoutingPreviewView,
  TaskPacketV0View,
  WorkItemView
} from "./api";
import type { CandidateWorkPriority, RiskLevel } from "./workflow";

export type PipelineStage =
  | "capture"
  | "classify"
  | "route"
  | "shape"
  | "human_gate"
  | "execute"
  | "review"
  | "promote"
  | "deliver"
  | "learn";

export type WorkPacketOwner =
  | "kendall"
  | "operator"
  | "local_model"
  | "hermes_worker_mock"
  | "codex_worker"
  | "claude_reviewer"
  | "github"
  | "memory_review"
  | "blocked";

export type WorkPacketStatus =
  | "active"
  | "waiting"
  | "blocked"
  | "failed"
  | "complete"
  | "deferred";

export type SourceRefTypeV0 =
  | "candidate_work"
  | "work_item"
  | "bmad_artifact"
  | "obsidian"
  | "llm_wiki"
  | "github"
  | "research"
  | "manual";

export type WorkPacketFreshnessV0 = "fresh" | "stale" | "unknown" | "not_applicable";

export type SourceAccessStateV0 = "allowed" | "excluded" | "missing" | "blocked";

export interface AllowedSourceRefV0 {
  refId: string;
  sourceType: SourceRefTypeV0;
  label: string;
  pathOrUrl?: string | null;
  freshness: WorkPacketFreshnessV0;
  accessState: "allowed";
  canonical: boolean;
  summaryOnly: boolean;
  blockedReason?: string | null;
}

export interface RestrictedSourceRefV0 {
  refId: string;
  sourceType: SourceRefTypeV0;
  label: string;
  pathOrUrl?: null;
  freshness: WorkPacketFreshnessV0;
  accessState: "excluded" | "missing" | "blocked";
  canonical: boolean;
  summaryOnly: true;
  blockedReason: string;
}

export type SourceRefV0 = AllowedSourceRefV0 | RestrictedSourceRefV0;

export type EvidenceRefTypeV0 =
  | "route"
  | "event"
  | "attempt"
  | "local_model"
  | "review"
  | "gate"
  | "memory"
  | "fixture";

export type EvidenceRetentionClassV0 = "metadata_only" | "summary" | "fixture";

export interface EvidenceRefV0 {
  refId: string;
  evidenceType: EvidenceRefTypeV0;
  label: string;
  artifactPath?: string | null;
  retentionClass: EvidenceRetentionClassV0;
  rawPayloadRetained: false;
}

export type WorkPacketRefIdV0 = string;
export type WorkPacketNonEmptyRefIdsV0 = [WorkPacketRefIdV0, ...WorkPacketRefIdV0[]];

export const MODEL_ROLES_V0 = [
  "classifier",
  "summarizer",
  "route_explainer",
  "memory_digest",
  "evidence_explainer"
] as const;

export type ModelRoleV0 = (typeof MODEL_ROLES_V0)[number];

export type ModelPolicyBackendV0 = "ollama_adapter_first";

export type ModelAllowedInputRefKindV0 =
  | "source_ref"
  | "evidence_ref"
  | "artifact_ref"
  | "packet_summary"
  | "route_summary"
  | "memory_proposal";

export interface ModelInputRefV0 {
  refId: WorkPacketRefIdV0;
  inputKind: ModelAllowedInputRefKindV0;
}

export interface ModelPolicyReadinessGateV0 {
  followUpStory: "5-3-prepare-implementation-readiness-evidence";
  authorityFamily: "local-provider-execution";
  verificationEvidenceRefs: WorkPacketRefIdV0[];
  operatorApprovalPath: string;
  enforcementState: "blocked_until_readiness";
  stopLines: readonly string[];
}

export interface ModelMetadataSummaryV0 {
  summaryId: string;
  label: string;
  reasonCodes: string[];
  sourceEvidenceRefs: WorkPacketRefIdV0[];
  evidenceCount: number;
  artifactCount: number;
  redactionState: "metadata_only";
  maxLabelChars: number;
}

export interface ModelRolePolicyV0<R extends ModelRoleV0 = ModelRoleV0> {
  role: R;
  backend: ModelPolicyBackendV0;
  allowedInputRefKinds: readonly ModelAllowedInputRefKindV0[];
  timeoutMs: number;
  fallbackPath: string;
  retentionPolicy: "metadata_only";
  operatorVisibleFailureState: string;
  enforcementState: "contract_only";
  readinessFollowUp: "story_5_3_required";
  readinessGate: ModelPolicyReadinessGateV0;
  stopLines: readonly string[];
}

export const MODEL_ROLE_POLICIES_BY_ROLE_V0 = {
  classifier: {
    role: "classifier",
    backend: "ollama_adapter_first",
    allowedInputRefKinds: ["source_ref", "evidence_ref", "packet_summary"],
    timeoutMs: 30000,
    fallbackPath: "Keep the packet in Kendall review; no automatic fallback routing is performed.",
    retentionPolicy: "metadata_only",
    operatorVisibleFailureState: "classification_blocked",
    enforcementState: "contract_only",
    readinessFollowUp: "story_5_3_required",
    readinessGate: {
      followUpStory: "5-3-prepare-implementation-readiness-evidence",
      authorityFamily: "local-provider-execution",
      verificationEvidenceRefs: [],
      operatorApprovalPath: "Story 5.3 must name the local-provider approval path before execution.",
      enforcementState: "blocked_until_readiness",
      stopLines: ["No model call is approved by this request wrapper.", "Do not route to another backend."]
    },
    stopLines: ["No model call is approved by this request wrapper.", "Do not route to another backend."]
  },
  summarizer: {
    role: "summarizer",
    backend: "ollama_adapter_first",
    allowedInputRefKinds: ["source_ref", "evidence_ref", "artifact_ref", "packet_summary"],
    timeoutMs: 45000,
    fallbackPath: "Show existing evidence summaries for operator review; no automatic fallback routing is performed.",
    retentionPolicy: "metadata_only",
    operatorVisibleFailureState: "summary_blocked",
    enforcementState: "contract_only",
    readinessFollowUp: "story_5_3_required",
    readinessGate: {
      followUpStory: "5-3-prepare-implementation-readiness-evidence",
      authorityFamily: "local-provider-execution",
      verificationEvidenceRefs: [],
      operatorApprovalPath: "Story 5.3 must name the local-provider approval path before execution.",
      enforcementState: "blocked_until_readiness",
      stopLines: ["No model call is approved by this request wrapper.", "Do not retain model text content."]
    },
    stopLines: ["No model call is approved by this request wrapper.", "Do not retain model text content."]
  },
  route_explainer: {
    role: "route_explainer",
    backend: "ollama_adapter_first",
    allowedInputRefKinds: ["route_summary", "evidence_ref", "packet_summary"],
    timeoutMs: 30000,
    fallbackPath: "Use deterministic route reason codes for operator review; no automatic fallback routing is performed.",
    retentionPolicy: "metadata_only",
    operatorVisibleFailureState: "route_explanation_blocked",
    enforcementState: "contract_only",
    readinessFollowUp: "story_5_3_required",
    readinessGate: {
      followUpStory: "5-3-prepare-implementation-readiness-evidence",
      authorityFamily: "local-provider-execution",
      verificationEvidenceRefs: [],
      operatorApprovalPath: "Story 5.3 must name the local-provider approval path before execution.",
      enforcementState: "blocked_until_readiness",
      stopLines: ["No model call is approved by this request wrapper.", "Do not bypass Human Gate authority."]
    },
    stopLines: ["No model call is approved by this request wrapper.", "Do not bypass Human Gate authority."]
  },
  memory_digest: {
    role: "memory_digest",
    backend: "ollama_adapter_first",
    allowedInputRefKinds: ["source_ref", "evidence_ref", "memory_proposal", "packet_summary"],
    timeoutMs: 60000,
    fallbackPath: "Keep memory proposal review manual; no automatic fallback routing is performed.",
    retentionPolicy: "metadata_only",
    operatorVisibleFailureState: "memory_digest_blocked",
    enforcementState: "contract_only",
    readinessFollowUp: "story_5_3_required",
    readinessGate: {
      followUpStory: "5-3-prepare-implementation-readiness-evidence",
      authorityFamily: "local-provider-execution",
      verificationEvidenceRefs: [],
      operatorApprovalPath: "Story 5.3 must name the local-provider approval path before execution.",
      enforcementState: "blocked_until_readiness",
      stopLines: ["No model call is approved by this request wrapper.", "Do not mutate canonical memory."]
    },
    stopLines: ["No model call is approved by this request wrapper.", "Do not mutate canonical memory."]
  },
  evidence_explainer: {
    role: "evidence_explainer",
    backend: "ollama_adapter_first",
    allowedInputRefKinds: ["evidence_ref", "artifact_ref", "packet_summary"],
    timeoutMs: 45000,
    fallbackPath: "Show bounded evidence metadata for operator review; no automatic fallback routing is performed.",
    retentionPolicy: "metadata_only",
    operatorVisibleFailureState: "evidence_explanation_blocked",
    enforcementState: "contract_only",
    readinessFollowUp: "story_5_3_required",
    readinessGate: {
      followUpStory: "5-3-prepare-implementation-readiness-evidence",
      authorityFamily: "local-provider-execution",
      verificationEvidenceRefs: [],
      operatorApprovalPath: "Story 5.3 must name the local-provider approval path before execution.",
      enforcementState: "blocked_until_readiness",
      stopLines: ["No model call is approved by this request wrapper.", "Do not expose retained model text content."]
    },
    stopLines: ["No model call is approved by this request wrapper.", "Do not expose retained model text content."]
  }
} as const satisfies { readonly [R in ModelRoleV0]: ModelRolePolicyV0<R> };

export const MODEL_ROLE_POLICIES_V0 = MODEL_ROLES_V0.map((role) => MODEL_ROLE_POLICIES_BY_ROLE_V0[role]);

export interface ModelRequestPacketForRoleV0<R extends ModelRoleV0> {
  requestId: string;
  packetId: string;
  workItemId?: string | null;
  role: R;
  backend: ModelPolicyBackendV0;
  allowedInputs: ModelInputRefV0[];
  rolePolicy: ModelRolePolicyV0<R>;
  timeoutMs: number;
  fallbackPath: string;
  authorityState: "contract_only" | "blocked_until_readiness" | "approval_required";
  retentionPolicy: "metadata_only";
  readinessGate: ModelPolicyReadinessGateV0;
  stopLines: readonly string[];
}

export type ModelRequestPacketV0 = {
  [R in ModelRoleV0]: ModelRequestPacketForRoleV0<R>;
}[ModelRoleV0];

export type ModelResultPacketStatusV0 =
  | "not_run"
  | "blocked"
  | "failed_metadata_only";

export interface ModelResultPacketBaseV0<R extends ModelRoleV0> {
  resultId: string;
  requestId: string;
  packetId: string;
  role: R;
  backend: ModelPolicyBackendV0;
  metadataSummary: ModelMetadataSummaryV0;
  operatorVisibleFailureState: string;
  fallbackPath: string;
  retentionPolicy: "metadata_only";
  readinessGate: ModelPolicyReadinessGateV0;
  evidenceRefs: EvidenceRefV0[];
  artifactRefs: ArtifactRefV0[];
}

export type ModelResultPacketV0 = {
  [R in ModelRoleV0]:
    | (ModelResultPacketBaseV0<R> & {
        status: "not_run" | "blocked";
        latencyMs?: null;
      })
    | (ModelResultPacketBaseV0<R> & {
        status: "failed_metadata_only";
        latencyMs?: number | null;
      });
}[ModelRoleV0];

export type ArtifactRefTypeV0 =
  | "plan"
  | "progress"
  | "report"
  | "pull_request"
  | "check"
  | "memory_proposal"
  | "fixture";

export type ArtifactRefStatusV0 = "available" | "missing" | "blocked" | "deferred";

export interface ArtifactRefV0 {
  refId: string;
  artifactType: ArtifactRefTypeV0;
  label: string;
  pathOrUrl?: string | null;
  status: ArtifactRefStatusV0;
}

export const HUMAN_GATE_ACTION_TYPES_V0 = [
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
  "reroute"
] as const;

export type HumanGateActionTypeV0 = (typeof HUMAN_GATE_ACTION_TYPES_V0)[number];

export type HumanGateActionFamilyV0 =
  | "Approve"
  | "Reject"
  | "Request Changes"
  | "Retry"
  | "Pause"
  | "Escalate"
  | "Mark Resolved";

export type HumanGateActionStatusV0 = "available" | "disabled" | "blocked" | "stale" | "complete";

export interface HumanGateActionPayloadBindingV0 {
  packetId: string;
  actionId: string;
  decisionId: string;
}

export type WorkPacketActionAvailabilityV0 = "available" | "blocked" | "stale" | "complete";

export interface HumanGateActionV0 {
  actionId: string;
  type: HumanGateActionTypeV0;
  family: HumanGateActionFamilyV0;
  label: string;
  uiCopy: string;
  status: HumanGateActionStatusV0;
  authorityFamily: string;
  payload: HumanGateActionPayloadBindingV0;
  requiredEvidenceRefs: string[];
  stopLines: string[];
  rollbackPath: string;
  resultingStage: PipelineStage;
  resultingOwner: WorkPacketOwner;
  auditEventType: string;
  reasonCodes: string[];
  disabledReason?: string;
}

export type HumanGateActionRequestStatusV0 = "recorded" | "rejected" | "blocked" | "stale";

export interface HumanGateActionRequestV0 {
  requestId: string;
  packetId: string;
  actionId: string;
  decisionId: string;
  requestedActionType: HumanGateActionTypeV0;
  requestDisplayLabel: string;
  requestedByLabel: string;
  requestedAt: string;
  status: HumanGateActionRequestStatusV0;
  auditEventType: string;
  evidenceRefs: WorkPacketRefIdV0[];
  retentionClass: "metadata_only";
  rawPayloadRetained: false;
  executionStarted: false;
  resultingStateApplied: false;
  stopLines: string[];
  rollbackPath: string;
  rejectionReason?: string;
}

export type WorkPacketLaneTypeV0 =
  | "local_model"
  | "hermes_worker_mock"
  | "codex_worker"
  | "claude_reviewer"
  | "github"
  | "memory_review"
  | "utility"
  | "local_readonly"
  | "local_patch_draft"
  | "local_sandbox_execute"
  | "subscription_handoff"
  | "subscription_agent"
  | "premium_approval"
  | "codex_cli_worker"
  | "claude_execution_dry_run"
  | "hermes_execution_dry_run"
  | "claude_governed_execution"
  | "hermes_governed_execution"
  | "unknown";

export type WorkPacketLaneStatusV0 =
  | "idle"
  | "available"
  | "pending"
  | "running"
  | "blocked"
  | "complete"
  | "skipped";

export interface WorkPacketLaneCardV0 {
  laneId: string;
  laneType: WorkPacketLaneTypeV0;
  label: string;
  status: WorkPacketLaneStatusV0;
  summary: string;
  currentOwner?: WorkPacketOwner | null;
  routeConfidence?: number | null;
  reasonCodes: string[];
  evidenceRefs: WorkPacketRefIdV0[];
  artifactRefs: WorkPacketRefIdV0[];
}

export type MemoryProposalStatusV0 =
  | "not_applicable"
  | "proposed"
  | "pending_human_approval"
  | "approved"
  | "rejected"
  | "deferred"
  | "edit_needed"
  | "blocked"
  | "stale"
  | "contradictory";

export type MemoryProposalTypeV0 =
  | "new_note"
  | "append_note"
  | "link_notes"
  | "tag_update"
  | "decision_record"
  | "error_book_entry";

export type MemoryProposalSensitivityV0 = "low" | "medium" | "high";
export type MemoryProposalFreshnessV0 = "fresh" | "stale" | "conflicting" | "unknown";
export type MemoryProposalContradictionStatusV0 = "none" | "possible" | "confirmed";
export type MemoryProposalConfidenceV0 = "low" | "medium" | "high";
export type MemoryProposalOperatorActionV0 = "approve" | "edit" | "reject" | "defer" | "blocked";
export type MemoryProposalWriteBackStatusV0 = "not_started" | "blocked" | "review_gated" | "approved_for_future" | "deferred";

export interface MemoryProposalV0 {
  proposalId: string;
  packetId: string;
  label: string;
  status: MemoryProposalStatusV0;
  summary: string;
  sourceRefs: WorkPacketNonEmptyRefIdsV0;
  evidenceRefs: WorkPacketNonEmptyRefIdsV0;
  targetRef?: SourceRefV0 | null;
  targetVaultPath?: string | null;
  targetVaultFolder: string;
  proposalType: MemoryProposalTypeV0;
  suggestedContentSummary: string;
  patchSummary?: string | null;
  sensitivity: MemoryProposalSensitivityV0;
  freshness: MemoryProposalFreshnessV0;
  contradictionStatus: MemoryProposalContradictionStatusV0;
  confidence: MemoryProposalConfidenceV0;
  operatorAction: MemoryProposalOperatorActionV0;
  decisionNeededContext?: string | null;
  backupRecoveryPath: string;
  writeBackStatus: MemoryProposalWriteBackStatusV0;
  writeBackAllowed: false;
}

export interface AlphaMemorySourceStatusV0 {
  statusId: string;
  authorityFamily: "memory-writeback-and-source-mutation";
  operationMode: "dry_run" | "read_only" | "draft_preview";
  decisionState: "ready" | "blocked" | "not_configured";
  retentionClass: "metadata_only";
  sourceRefs: WorkPacketRefIdV0[];
  targetMetadata: Record<string, unknown>;
  backupPath: string;
  rollbackPath: string;
  auditEventSummary: string;
  blockedReasons: string[];
  recoveryOptions: string[];
  evidenceRefs: WorkPacketRefIdV0[];
  llmWikiReadiness?: LlmWikiDerivedIndexReadinessV0 | null;
  canonicalMutationAllowed: false;
  sourceMutationAllowed: false;
  providerCallsAllowed: false;
  workerLaunchAllowed: false;
  githubCallsAllowed: false;
  networkEgressAllowed: false;
}

export interface LlmWikiRebuildPreviewV0 {
  previewId: string;
  operationMode: "read_only";
  inputRefs: WorkPacketRefIdV0[];
  memoryProposalRefs: WorkPacketRefIdV0[];
  plannedOutputScope: string;
  retentionClass: "metadata_only";
  stopLine: string;
  auditEventSummary: string;
  canonicalMutationAllowed: false;
  sourceMutationAllowed: false;
  providerCallsAllowed: false;
  workerLaunchAllowed: false;
  githubCallsAllowed: false;
  networkEgressAllowed: false;
  durableWriteAllowed: false;
}

export interface LlmWikiRebuildDryRunPlanV0 {
  planId: string;
  operationMode: "dry_run";
  inputRefs: WorkPacketRefIdV0[];
  memoryProposalRefs: WorkPacketRefIdV0[];
  plannedDerivedSections: string[];
  disposableTargetNamespace: string;
  retentionClass: "metadata_only";
  stopLines: string[];
  discardRecoveryPath: string;
  auditEventSummary: string;
  canonicalMutationAllowed: false;
  sourceMutationAllowed: false;
  providerCallsAllowed: false;
  workerLaunchAllowed: false;
  githubCallsAllowed: false;
  networkEgressAllowed: false;
  durableWriteAllowed: false;
  writePerformed: false;
  backupCreated: false;
}

export interface LlmWikiDerivedIndexReadinessV0 {
  statusId: string;
  operationMode: "read_only";
  decisionState: "ready" | "blocked" | "not_configured";
  canonicality: "derived_disposable_rebuildable";
  retentionClass: "metadata_only";
  sourceRefs: WorkPacketRefIdV0[];
  evidenceRefs: WorkPacketRefIdV0[];
  memoryProposalRefs: WorkPacketRefIdV0[];
  allowedInputs: string[];
  blockedReasons: string[];
  nextActions: string[];
  boundarySummary: string;
  rebuildPreview?: LlmWikiRebuildPreviewV0 | null;
  rebuildDryRunPlan?: LlmWikiRebuildDryRunPlanV0 | null;
  canonicalMutationAllowed: false;
  sourceMutationAllowed: false;
  providerCallsAllowed: false;
  durableWriteAllowed: false;
}

export type RecoveryActionTypeV0 =
  | "retry_smaller"
  | "reroute"
  | "cancel_worker"
  | "discard_result"
  | "preserve_evidence"
  | "reopen_human_gate"
  | "mark_blocked"
  | "send_back_to_shape"
  | "send_back_to_research";

export interface RecoveryActionV0 {
  actionId: string;
  actionType: RecoveryActionTypeV0;
  label: string;
  availability: WorkPacketActionAvailabilityV0;
  consequence: string;
  resultingStage: PipelineStage;
  resultingOwner: WorkPacketOwner;
  evidenceRefs: WorkPacketRefIdV0[];
}

export interface WorkPacketRouteSummaryV0 {
  recommendation: string;
  confidenceScore?: number | null;
  confidenceBand?: string | null;
  reasonCodes: string[];
}

export interface WorkPacketReviewSummaryV0 {
  reviewer: WorkPacketOwner;
  status: "not_applicable" | "pending" | "blocked" | "complete" | "skipped";
  summary: string;
  evidenceRefs: WorkPacketRefIdV0[];
  artifactRefs: WorkPacketRefIdV0[];
}

export interface WorkPacketDeliveryEvidenceV0 {
  evidenceId: string;
  mode: "metadata_only";
  actionId?: "pr" | "merge" | "cleanup" | null;
  status: string;
  targetBranch?: string | null;
  baseBranch?: string | null;
  pullRequestUrl?: string | null;
  expectedHeadRevision?: string | null;
  pullRequestHeadRevision?: string | null;
  ciStatus?: string | null;
  reviewState?: string | null;
  mergeStatus?: string | null;
  mergeResult?: string | null;
  cleanupDryRunStatus?: string | null;
  cleanupTarget?: string | null;
  readyForApproval: boolean;
  hasDeliveryExecutionEvidence: boolean;
  evidenceRefs: WorkPacketRefIdV0[];
  artifactRefs: WorkPacketRefIdV0[];
  retainedEvidence: WorkPacketRefIdV0[];
  blockedReasons: string[];
  recoveryPath: string;
  deliveryRailsGrantAuthority: false;
  rawPayloadRetained: false;
  remoteMutationApproved: false;
  mergeApproved: false;
  cleanupApproved: false;
}

export interface WorkPacketExecutionAttemptSummaryV0 {
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
  evidenceRefs: WorkPacketRefIdV0[];
  artifactRefs: WorkPacketRefIdV0[];
}

export interface WorkPacketStageTransitionEventV0 {
  eventId: string;
  eventType: string;
  summary: string;
  createdAt: string;
  sourceStage?: PipelineStage | null;
  targetStage: PipelineStage;
  sourceOwner?: WorkPacketOwner | null;
  targetOwner: WorkPacketOwner;
  sourceStatus?: WorkPacketStatus | null;
  targetStatus: WorkPacketStatus;
  reasonCodes: string[];
  evidenceRefs: WorkPacketRefIdV0[];
  durable: boolean;
  sourceEventId?: string | null;
  actorLabel?: string | null;
}

export type GateReplayRefStateV0 =
  | "allowed"
  | "blocked"
  | "missing"
  | "excluded"
  | "redacted"
  | "unsupported"
  | "metadata_only";

export interface GateReplayRefStateV0View {
  refId: string;
  refType: "source" | "evidence" | "event";
  state: GateReplayRefStateV0;
  label: string;
  blockingReason?: string | null;
}

export interface WorkPacketGateStateValidationV0 {
  status: "matched" | "blocked" | "preview_only";
  storedStage: PipelineStage;
  derivedStage?: PipelineStage | null;
  storedOwner: WorkPacketOwner;
  derivedOwner?: WorkPacketOwner | null;
  storedStatus: WorkPacketStatus;
  derivedStatus?: WorkPacketStatus | null;
  eventCount: number;
  latestEventType?: string | null;
  replayedEventTypes: string[];
  mismatchReasons: string[];
  blockedReasons: string[];
  refStates: GateReplayRefStateV0View[];
  readOnly: true;
  sourceMutationAllowed: false;
  providerCallsAllowed: false;
  workerLaunchAllowed: false;
}

export type WorkPacketLoopStopStateKindV0 =
  | "limit_window"
  | "operator_approval"
  | "review_thread"
  | "failed_check"
  | "tool_churn"
  | "unsafe_cleanup"
  | "scope_boundary"
  | "owner_conflict";

export interface WorkPacketLoopStopStateV0 {
  stopStateId: string;
  kind: WorkPacketLoopStopStateKindV0;
  label: string;
  phase: string;
  severity: "info" | "warning" | "blocking";
  summary: string;
  stopLine: string;
  nextSafeAction: string;
  evidenceRefs: WorkPacketRefIdV0[];
  metadataOnly: true;
  sourceMutationAllowed: false;
  providerCallsAllowed: false;
  workerLaunchAllowed: false;
  githubMutationAllowed: false;
  cleanupAllowed: false;
}

export interface WorkPacketV0View {
  packetId: string;
  title: string;
  requestedOutcome: string;
  currentStage: PipelineStage;
  currentOwner: WorkPacketOwner;
  status: WorkPacketStatus;
  riskLevel: RiskLevel;
  priority: CandidateWorkPriority;
  candidateWork?: CandidateWorkView | null;
  workItem?: WorkItemView | null;
  taskPacket?: TaskPacketV0View | null;
  routingPreview?: RoutingPreviewView | null;
  routeSummary?: WorkPacketRouteSummaryV0 | null;
  executionAttempts: WorkPacketExecutionAttemptSummaryV0[];
  transitionEvents: WorkPacketStageTransitionEventV0[];
  sourceRefs: SourceRefV0[];
  evidenceRefs: EvidenceRefV0[];
  artifactRefs: ArtifactRefV0[];
  humanGateActions: HumanGateActionV0[];
  humanGateActionRequests: HumanGateActionRequestV0[];
  laneCards: WorkPacketLaneCardV0[];
  memoryProposals: MemoryProposalV0[];
  deliveryEvidence?: WorkPacketDeliveryEvidenceV0 | null;
  alphaMemorySourceStatus?: AlphaMemorySourceStatusV0 | null;
  gateStateValidation?: WorkPacketGateStateValidationV0 | null;
  loopStopStates: WorkPacketLoopStopStateV0[];
  reviewSummaries: WorkPacketReviewSummaryV0[];
  recoveryActions: RecoveryActionV0[];
}
