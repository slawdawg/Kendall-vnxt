import type { ManagerControlPlane } from "@kendall/contracts";

export type PipelineManagerLaneRow = {
  id: string;
  label: string;
  rawState: string;
  reason: string;
  authorityClass: ManagerControlPlane.ManagerAuthorityDecisionClass;
  authorityReason: string;
  evidenceRefIds: readonly string[];
  nextAction: string;
};

export type PipelineManagerLanePanel = {
  title: string;
  state: string;
  reason: string;
  authorityClass: ManagerControlPlane.ManagerAuthorityDecisionClass;
  authorityReason: string;
  nextAction: string;
};

export type PipelineManagerAuthorityOperationRow = {
  key: string;
  operation: string;
  family: string;
  authorityClass: ManagerControlPlane.ManagerAuthorityDecisionClass;
  statusText: string;
  reason: string;
  missingContract: string | null;
  rollbackOrRecoveryNote: string;
  runContractStage: ManagerControlPlane.ManagerAuthorityStage;
  available: boolean;
  mutationRisk: string;
  requiredEvidence: readonly string[];
};

export type PipelineManagerDeliveryControlRow = {
  key: string;
  label: string;
  available: boolean;
  authorityClass: ManagerControlPlane.ManagerAuthorityDecisionClass;
  reason: string;
  missingContract: string | null;
  requiredEvidence: readonly string[];
  rollbackOrRecoveryNote: string;
};

export type PipelineManagerFeedbackRouteRow = {
  key: string;
  feedbackId: string;
  classification: ManagerControlPlane.ManagerExecutionLaneFeedbackClassification | "malformed_feedback";
  summary: string;
  targetSurface: string;
  affectedLane: string;
  sourceRefs: readonly string[];
  route: string;
  targetWorkerId: string | null;
  affectedDeliveryGate: ManagerControlPlane.ManagerExecutionLaneFeedbackDeliveryGate | null;
  authorityImpact: string;
  dependencyImpact: string;
  nextAction: string;
  recordPolicy: "metadata_only_feedback_record";
  unrelatedLanePolicy: "continue_unrelated_safe_lanes";
  retention: "metadata_only";
  rawPayloadRetained: false;
};

export type PipelineManagerEvidenceItem = {
  key: string;
  evidenceRefId: string;
  sourceRequirementIds: readonly string[];
  workItemId: string | null;
  leaseId: string | null;
  attemptId: string | null;
  eventWatermark: string;
  verificationCommandId: string | null;
  proofHarnessId: string | null;
  result: string;
  retentionClass: string;
  rawPayloadRetained: false;
};

export type PipelineManagerExecutionLaneState = {
  runId: string;
  phase: ManagerControlPlane.ManagerSummaryPhase;
  stateSource: ManagerControlPlane.ManagerSummaryStateSource;
  proofMode: ManagerControlPlane.ManagerSummaryProofMode;
  authorityStage: ManagerControlPlane.ManagerAuthorityStage;
  authorityClass: ManagerControlPlane.ManagerAuthorityDecisionClass;
  freshness: ManagerControlPlane.ManagerFreshnessState;
  evidenceFreshness: ManagerControlPlane.EvidenceFreshnessState;
  rawStateLabels: readonly string[];
  statusText: string;
  operatorAttentionRequired: boolean;
  attentionReason: string | null;
  unknownReason: string | null;
  authorityBlockedReason: string | null;
  authorityStopReason: string | null;
  recoveryStatus: ManagerControlPlane.ManagerExecutionLaneSummary["recoveryStatus"];
  recoveryAttemptCount: number;
  lastObservedAt: string;
  lastMeaningfulProgressAt: string | null;
  blockers: readonly string[];
  warnings: readonly string[];
  sourceCursor: string;
  eventWatermark: string;
  currentLimitations: readonly string[];
  evidenceRefs: readonly string[];
  evidenceLinks: readonly PipelineManagerEvidenceItem[];
  authorityOperations: readonly PipelineManagerAuthorityOperationRow[];
  deliveryControlRows: readonly PipelineManagerDeliveryControlRow[];
  feedbackRouteRows: readonly PipelineManagerFeedbackRouteRow[];
  affectedDeliveryGates: readonly ManagerControlPlane.ManagerExecutionLaneFeedbackDeliveryGate[];
  feedbackRecordPolicy: "metadata_only_feedback_record";
  feedbackUnrelatedLanePolicy: "continue_unrelated_safe_lanes";
  feedbackRetention: "metadata_only";
  feedbackRawPayloadRetained: false;
  safeWorkAvailableCount: number;
  metadataOnlyQueuedCount: number;
  unsafeOrGatedWorkCount: number;
  stateCounts: ManagerControlPlane.ManagerExecutionLaneStateCounts;
  nextAction: string;
  queueRows: readonly PipelineManagerLaneRow[];
  leaseRows: readonly PipelineManagerLaneRow[];
  refillPanel: PipelineManagerLanePanel;
  workerPanel: PipelineManagerLanePanel;
  resourceUsagePanel: PipelineManagerLanePanel;
  sourceExhausted: boolean;
  fixtureBacked: boolean;
  displayStates: readonly string[];
};
