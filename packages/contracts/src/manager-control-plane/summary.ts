import type { ManagerAuthorityDecisionClass, ManagerAuthorityStage } from "./authority";
import type { EvidenceRefId, ExecutionAttemptId, LeaseId, ManagerEventId, ManagerRunId, WorkItemId } from "./ids";
import type { EvidenceFreshnessState, ManagerFreshnessState, ManagerSummaryPhase } from "./lifecycle";
import type { AuthoritativeBacklogExhaustedDisposition } from "./refill";

export type ManagerSummaryStateSource = "dispatcher" | "fixture" | "projection" | "unknown";
export type ManagerSummaryProofMode = "backend_proof" | "read_only_projection" | "unknown";

export interface ManagerExecutionLaneStateCounts {
  totalWorkItems: number;
  totalLeases: number;
  totalAttempts: number;
  eligible: number;
  queued: number;
  leased: number;
  running: number;
  refilling: number;
  completed: number;
  failed: number;
  expired: number;
  quarantined: number;
  blocked: number;
  closed: number;
  metadataOnlyQueuedCandidates: number;
  blockedCandidates: number;
  needsReviewCandidates: number;
  duplicateCandidates: number;
  noSafeWork: number;
}

export interface ManagerExecutionLaneEvidenceLink {
  evidenceRefId: EvidenceRefId;
  sourceRequirementIds: readonly string[];
  workItemId?: WorkItemId | null;
  leaseId?: LeaseId | null;
  attemptId?: ExecutionAttemptId | null;
  eventWatermark: ManagerEventId;
  verificationCommandId?: string | null;
  proofHarnessId?: string | null;
  result: string;
  retentionClass: "metadata_only" | "summary" | "fixture";
  rawPayloadRetained: false;
}

export type ManagerExecutionLaneFeedbackClassification = "blocking" | "correction" | "polish" | "future_work";

export interface ManagerExecutionLaneFeedbackDeliveryGate {
  action: string;
  affectedLane: string;
  scope: "targeted_lane" | "all_affected_delivery" | string;
  mergePolicy: "prevent_affected_pr_merge" | "hold_until_correction_resolved" | string;
  downstreamPolicy: string;
  recoveryPath: string;
}

export interface ManagerExecutionLaneFeedbackRoute {
  feedbackId: string;
  classification: ManagerExecutionLaneFeedbackClassification;
  summary: string;
  targetSurface: string;
  affectedLane: string;
  sourceRefs: readonly string[];
  route: "pause_delivery_and_route_to_affected_lane" | "route_to_active_worker" | "create_correction_lane" | "batch_polish_feedback" | "record_future_work" | string;
  targetWorkerId?: string | null;
  affectedDeliveryGate?: ManagerExecutionLaneFeedbackDeliveryGate | null;
  authorityImpact: string;
  dependencyImpact: string;
  nextAction: string;
  recordPolicy: "metadata_only_feedback_record";
  unrelatedLanePolicy: "continue_unrelated_safe_lanes";
  retention: "metadata_only";
  rawPayloadRetained: false;
}

export interface ManagerExecutionLaneSummary {
  runId: ManagerRunId;
  proofMode: ManagerSummaryProofMode;
  stateSource: ManagerSummaryStateSource;
  lastObservedAt: string;
  lastMeaningfulProgressAt?: string | null;
  freshness: ManagerFreshnessState;
  unknownReason?: string | null;
  authorityBlockedReason?: string | null;
  authorityStopReason?: string | null;
  currentPhase: ManagerSummaryPhase;
  nextAction: string;
  operatorAttentionRequired: boolean;
  attentionReason?: string | null;
  recoveryStatus: "not_needed" | "needed" | "in_progress" | "blocked" | "complete";
  recoveryAttemptCount: number;
  lastRecoveryAt?: string | null;
  safeWorkAvailableCount: number;
  metadataOnlyQueuedCount: number;
  unsafeOrGatedWorkCount: number;
  evidenceFreshness: EvidenceFreshnessState;
  eventWatermark: ManagerEventId;
  sourceCursor: string;
  authorityStage: ManagerAuthorityStage;
  authorityClass: ManagerAuthorityDecisionClass;
  terminalDisposition?: AuthoritativeBacklogExhaustedDisposition | null;
  queuedWorkItemIds: readonly WorkItemId[];
  activeWorkItemIds: readonly WorkItemId[];
  evidenceRefs: readonly EvidenceRefId[];
  evidenceLinks: readonly ManagerExecutionLaneEvidenceLink[];
  stateCounts: ManagerExecutionLaneStateCounts;
  rawStateLabels: readonly string[];
  blockers: readonly string[];
  warnings: readonly string[];
  feedbackRoutes: readonly ManagerExecutionLaneFeedbackRoute[];
  affectedDeliveryGates: readonly ManagerExecutionLaneFeedbackDeliveryGate[];
  feedbackRecordPolicy: "metadata_only_feedback_record";
  feedbackUnrelatedLanePolicy: "continue_unrelated_safe_lanes";
  feedbackRetention: "metadata_only";
  feedbackRawPayloadRetained: false;
}
