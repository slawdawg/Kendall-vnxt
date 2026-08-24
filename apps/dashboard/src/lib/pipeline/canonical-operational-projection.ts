/**
 * Dashboard-owned operational truth boundary. This deliberately starts with
 * the small, behavior-critical projection surface shared by cockpit action
 * gating. Broader board/detail state is added here before each V0 consumer is
 * migrated; normal callers must not introduce a new V0 alias.
 */
export type DashboardCanonicalOperationalSourceLabelV1 =
  | "live"
  | "stale"
  | "fixture"
  | "simulated"
  | "dry_run"
  | "unavailable"
  | "unknown";

export type DashboardCanonicalOperationalFreshnessV1 = "live" | "stale" | "unavailable" | "unknown";

import type {
  AuthoritativePacketSourceRef,
  AuthoritativePacketStage,
  AuthoritativePacketStatus,
  PipelineCoordinationHealthV0,
  PipelineExecuteAdmissionV0,
  PipelineFixtureModeV0,
  PipelineGatedControlV0,
  PipelineManagerSummaryV0,
  PipelineOperationalActionCapabilityV0,
  PipelineOperationalActionCapabilityV1,
  PipelineOperationalActionResultV0,
  PipelineOperationalRuntimeReadinessV0,
  PipelineProjectionEmptyReasonV0,
  PipelineQueueSummaryV0,
  PipelineReliabilityProblemV0,
  PipelineReviewRouteEvidenceV0,
  PipelineSourceStateV0,
  PipelineStageSummaryV0,
  PipelineTruthSummaryV0,
  PipelineWorkerSummaryV0,
} from "@kendall/contracts";

export type DashboardCanonicalOperationalProjectionTruthV1 = {
  schemaVersion: "dashboard-canonical-operational-projection/v1";
  sourceUpdatedAt: string;
  staleAfterSeconds: number;
  sourceLabel: DashboardCanonicalOperationalSourceLabelV1;
  freshnessState: DashboardCanonicalOperationalFreshnessV1;
  truthSummary: {
    label: DashboardCanonicalOperationalSourceLabelV1;
    backendEmpty: boolean;
    backendUnavailable: boolean;
    fixtureBacked: boolean;
    stale: boolean;
  };
  backendReachability: {
    state: "reachable" | "unavailable" | "unknown";
  };
  fixtureMode: {
    enabled: boolean;
    canSatisfyLiveProof: false;
  };
  workPackets: readonly { packetId: string }[];
};

/** Structural input accepted while the server-side V0 read adapter is retired. */
export type DashboardCanonicalOperationalProjectionTruthInputV1 = Omit<
  DashboardCanonicalOperationalProjectionTruthV1,
  "schemaVersion"
>;

/**
 * Client-safe read model for the normal/LAN active board.  Unlike the first
 * operational-projection endpoint contract, this is not a V0-shaped board
 * alias: every field below is deliberately owned by the dashboard and is
 * reconstructed at the loader boundary.
 *
 * Direct-detail evidence continues to use the separately named operational
 * projection hold until its own migration slice.  Do not add that evidence to
 * this board DTO merely for convenience.
 */
export type DashboardCanonicalActiveBoardProjectionV1 = {
  schemaVersion: "dashboard-canonical-active-board/v1";
  projectionId: string;
  generatedAt: string;
  sourceUpdatedAt: string;
  sourceLabel: DashboardCanonicalOperationalSourceLabelV1;
  freshnessState: DashboardCanonicalOperationalFreshnessV1;
  staleAfterSeconds: number;
  backendReachability: {
    state: "reachable" | "unavailable" | "unknown";
    checkedAt: string;
    reason: DashboardCanonicalProjectionEmptyReasonV1 | null;
    summary: string;
  };
  fixtureMode: {
    enabled: boolean;
    reason: string | null;
    allowedForEnvironment: boolean;
    visibleLabelRequired: true;
    canSatisfyLiveProof: false;
  };
  truthSummary: {
    label: DashboardCanonicalOperationalSourceLabelV1;
    emptyReason: DashboardCanonicalProjectionEmptyReasonV1 | null;
    backendEmpty: boolean;
    backendUnavailable: boolean;
    fixtureBacked: boolean;
    stale: boolean;
    summary: string;
  };
  stageSummaries: DashboardCanonicalActiveBoardStageSummaryV1[];
  sourceStates: DashboardCanonicalActiveBoardSourceStateV1[];
  workPackets: DashboardCanonicalActiveBoardWorkPacketV1[];
  selectedPacketDetails: DashboardCanonicalActiveBoardPacketDetailV1[];
  managerSummary: DashboardCanonicalActiveBoardManagerSummaryV1;
  /** Strict compact dashboard-owned manager posture, safe for cockpit rendering. */
  activeManagerLaneClarity: DashboardCanonicalManagerLaneClarityV1 | null;
  coordinationHealth: DashboardCanonicalCoordinationHealthV1 | null;
  workerSummary: DashboardCanonicalActiveBoardWorkerSummaryV1;
  reliabilityProblems: DashboardCanonicalActiveBoardReliabilityProblemV1[];
  gatedControls: DashboardCanonicalActiveBoardGatedControlV1[];
  runtimeReadiness: DashboardCanonicalActiveBoardRuntimeReadinessV1 | null;
  actionCapabilities: DashboardCanonicalActiveBoardLegacyActionCapabilityV1[];
  executeAdmission: DashboardCanonicalActiveBoardExecuteAdmissionV1;
  queueSummary: DashboardCanonicalActiveBoardQueueSummaryV1;
  evidenceRefs: string[];
  metadataOnly: true;
  rawPayloadRetained: false;
};

export type DashboardCanonicalProjectionEmptyReasonV1 =
  | "healthy_empty"
  | "source_exhausted"
  | "blocked"
  | "refilling"
  | "usage_limited"
  | "resource_limited"
  | "cleanup_gated"
  | "approval_required"
  | "failure_budget_hit"
  | "backend_unavailable"
  | "projection_stale"
  | "unknown";

export type DashboardCanonicalActiveBoardStageSummaryV1 = {
  stage: AuthoritativePacketStage;
  label: string;
  packetCount: number;
  sourceLabel: DashboardCanonicalOperationalSourceLabelV1;
  freshnessState: DashboardCanonicalOperationalFreshnessV1;
  emptyReason: DashboardCanonicalProjectionEmptyReasonV1 | null;
};

export type DashboardCanonicalActiveBoardSourceStateV1 = {
  sourceId: string;
  sourceRef: string;
  sourceKind: string;
  state: "healthy" | "exhausted" | "blocked" | "gated" | "stale" | "unavailable" | "refilling" | "unknown";
  summary: string;
  evidenceRefs: string[];
  updatedAt: string;
  metadataOnly: true;
};

export type DashboardCanonicalActiveBoardReadyToTestV1 = DashboardCanonicalReadyToTestV1;

export type DashboardCanonicalActiveBoardWorkPacketV1 = {
  packetId: string;
  title: string;
  currentStage: AuthoritativePacketStage;
  status: AuthoritativePacketStatus;
  truthLabel: DashboardCanonicalOperationalSourceLabelV1;
  sourceRef: AuthoritativePacketSourceRef | null;
  canonicalContract: null;
  productModeMapping: null;
  blocker: string | null;
  nextAction: string | null;
  unblocker: "operator" | "manager" | "worker" | "source" | "system" | "unknown";
  readyToTest: DashboardCanonicalActiveBoardReadyToTestV1 | null;
  evidenceRefs: string[];
  updatedAt: string;
  metadataOnly: true;
};

export type DashboardCanonicalActiveBoardPacketDetailV1 = {
  packetId: string;
  sourceRefs: AuthoritativePacketSourceRef[];
  canonicalContract: null;
  productModeMapping: null;
  evidenceRefs: string[];
  currentStage: AuthoritativePacketStage;
  status: AuthoritativePacketStatus;
  truthLabel: DashboardCanonicalOperationalSourceLabelV1;
  blocker: string | null;
  nextAction: string | null;
  unblocker: "operator" | "manager" | "worker" | "source" | "system" | "unknown";
  readyToTest: DashboardCanonicalActiveBoardReadyToTestV1 | null;
  recentTransitionEventRefs: string[];
  latestTransitionEventRef: string | null;
  latestMovementSummary: string | null;
  canSatisfyLiveMovementProof: boolean;
  actionCapabilitiesV1: PipelineOperationalActionCapabilityV1[];
  actionCapabilities: DashboardCanonicalActiveBoardLegacyActionCapabilityV1[];
  reviewRoute: DashboardCanonicalActiveBoardReviewRouteV1;
  metadataOnly: true;
};

export type DashboardCanonicalActiveBoardLegacyActionCapabilityV1 = {
  actionId: string;
  targetType: string;
  targetId: string | null;
  capabilityState: string;
  authorityState: string;
  riskTier: string;
  typedReason: string | null;
  expectedResultSummary: string;
  correlationRequired: true;
  idempotencyRequired: true;
  evidenceRefs: string[];
  metadataOnly: true;
  rawPayloadRetained: false;
};

export type DashboardCanonicalActiveBoardReviewRouteV1 = {
  schemaVersion: "pipeline-review-route-evidence/v0";
  availability: "available" | "stale" | "unavailable";
  packetId: string;
  routeState: "report_only" | "simulated" | "blocked" | "unavailable";
  reasonCode:
    | "report_only"
    | "simulated_completed"
    | "immutable_identity_stale"
    | "policy_vetoed"
    | "review_blocked"
    | "issuance_expired"
    | "issuance_revoked"
    | "issuance_cancelled"
    | "review_evidence_unavailable";
  reason: string;
  safeFallback: string;
  exactIdentity: "current" | "changed" | "unavailable";
  issuanceState: "active" | "expired" | "revoked" | "cancelled" | "unavailable";
  findingSummary: { count: number; highestSeverity: "info" | "low" | "medium" | "high" | null; evidenceRefs: string[] };
  dataClass: "metadata_only";
  execution: "none";
  deliveryEvidenceEligible: false;
  metadataOnly: true;
  rawPayloadRetained: false;
  retention: "metadata_only_evidence_references";
};

/** Dashboard-owned review-route DTO for the normal operational-detail path. */
export type DashboardCanonicalOperationalReviewRouteV1 = {
  schemaVersion: "dashboard-canonical-operational-review-route/v1";
  sourceSchemaVersion: "pipeline-review-route-evidence/v0";
  availability: "available" | "stale" | "unavailable";
  packetId: string;
  routeState: "report_only" | "simulated" | "blocked" | "unavailable";
  reasonCode:
    | "report_only"
    | "simulated_completed"
    | "immutable_identity_stale"
    | "policy_vetoed"
    | "review_blocked"
    | "issuance_expired"
    | "issuance_revoked"
    | "issuance_cancelled"
    | "review_evidence_unavailable";
  reason: string;
  safeFallback: string;
  exactIdentity: "current" | "changed" | "unavailable";
  issuanceState: "active" | "expired" | "revoked" | "cancelled" | "unavailable";
  findingSummary: { count: number; highestSeverity: "info" | "low" | "medium" | "high" | null; evidenceRefs: string[] };
  dataClass: "metadata_only";
  execution: "none";
  deliveryEvidenceEligible: false;
  metadataOnly: true;
  rawPayloadRetained: false;
  retention: "metadata_only_evidence_references";
};

export type DashboardCanonicalActiveBoardManagerSummaryV1 = {
  stateSource: "supervisor_projection" | "manager_summary" | "unavailable" | "unknown";
  reliabilityState: "ready" | "running" | "healthy_idle" | "source_exhausted" | "waiting_for_approval" | "blocked" | "refilling" | "degraded" | "unavailable" | "unknown";
  freshnessState: DashboardCanonicalOperationalFreshnessV1;
  activeLeaseCount: number | null;
  activeWorkerCount: number | null;
  dispatchableQueueCount: number | null;
  exhaustedSourceCount: number | null;
  sourceExhausted: boolean;
  inactivityReason: DashboardCanonicalProjectionEmptyReasonV1 | null;
  summary: string;
  metadataOnly: true;
};

export type DashboardCanonicalActiveBoardWorkerSummaryV1 = {
  freshnessState: DashboardCanonicalOperationalFreshnessV1;
  activeCount: number | null;
  stalledCount: number | null;
  failedCount: number | null;
  unavailableCount: number | null;
  summary: string;
  metadataOnly: true;
};

export type DashboardCanonicalActiveBoardReliabilityProblemV1 = {
  problemId: string;
  kind: "idle_with_ready_work" | "stalled_worker" | "stale_projection" | "backend_unavailable" | "source_blocked" | "approval_required" | "usage_limited" | "resource_limited" | "unknown";
  severity: "info" | "attention" | "blocked";
  likelyIssue: "manager" | "worker" | "source" | "approval" | "usage" | "resource" | "unknown";
  summary: string;
  evidenceRefs: string[];
  metadataOnly: true;
};

export type DashboardCanonicalActiveBoardGatedControlV1 = {
  controlId: string;
  operation: string;
  status: "gated" | "action_needed" | "blocked";
  authorityFamily: string;
  stopLine: string;
  nextAction: string;
  packetId: string | null;
  evidenceRefs: string[];
  metadataOnly: true;
};

export type DashboardCanonicalActiveBoardRuntimeReadinessV1 = {
  schemaVersion: "dashboard-canonical-runtime-readiness/v1";
  readinessState: "ready" | "degraded" | "blocked" | "unavailable" | "unknown";
  operationalMode: "disabled" | "local_proof" | "read_only" | "bounded_write" | "unavailable" | "unknown";
  freshnessState: DashboardCanonicalOperationalFreshnessV1;
  capabilityState: string;
  typedReason: string | null;
  checkedAt: string;
  expiresAt: string;
  summary: string;
  actionCapabilitiesV1: PipelineOperationalActionCapabilityV1[];
  evidenceRefs: string[];
  metadataOnly: true;
  rawPayloadRetained: false;
};

export type DashboardCanonicalActiveBoardExecuteAdmissionV1 = {
  schemaVersion: "dashboard-canonical-execute-admission/v1";
  policyVersion: "supervisor-wip/v0";
  state: "ready" | "blocked" | "unavailable";
  capacityAvailable: boolean;
  typedReason: "capacity_available" | "review_wip_limit_reached" | "deliver_wip_limit_reached" | "verification_wip_limit_reached" | "operator_testing_wip_limit_reached" | "runtime_unavailable";
  limits: { review: number; deliver: number; verification: number; operatorTesting: number } | null;
  observed: { review: number; deliver: number; verification: number; operatorTesting: number } | null;
  blockingDimensions: Array<"review" | "deliver" | "verification" | "operatorTesting">;
  nextSafeAction: string;
  evidenceRefs: string[];
  metadataOnly: true;
  rawPayloadRetained: false;
};

export type DashboardCanonicalActiveBoardQueueSummaryV1 = {
  activeCount: number | null;
  blockedCount: number | null;
  dispatchableCount: number | null;
  gatedCount: number | null;
  staleCount: number | null;
  emptyReason: DashboardCanonicalProjectionEmptyReasonV1 | null;
  sourceExhausted: boolean;
  summary: string;
};

/**
 * Canonical dashboard board-read model. It is intentionally dashboard-owned
 * and versioned: normal cockpit consumers must not accept the supervisor's
 * `pipeline-dashboard-projection/v0` envelope directly.
 *
 * The nested V0-labelled values below are named compatibility holds for the
 * active-board rendering surface. They are assembled by an explicit allowlist
 * in the server loader, never forwarded as the upstream envelope, and will be
 * replaced one surface at a time before the V0 contract is retired.
 */
export type DashboardCanonicalOperationalProjectionV1 = {
  schemaVersion: "dashboard-canonical-operational-projection/v1";
  projectionId: string;
  generatedAt: string;
  sourceUpdatedAt: string;
  sourceLabel: DashboardCanonicalOperationalSourceLabelV1;
  freshnessState: DashboardCanonicalOperationalFreshnessV1;
  staleAfterSeconds: number;
  backendReachability: {
    state: "reachable" | "unavailable" | "unknown";
    checkedAt: string;
    reason?: PipelineProjectionEmptyReasonV0 | null;
    summary: string;
  };
  fixtureMode: PipelineFixtureModeV0;
  truthSummary: PipelineTruthSummaryV0;
  stageSummaries: PipelineStageSummaryV0[];
  sourceStates: PipelineSourceStateV0[];
  workPackets: DashboardCanonicalOperationalWorkPacketV1[];
  selectedPacketDetails: DashboardCanonicalOperationalSelectedPacketDetailV1[];
  managerSummary: PipelineManagerSummaryV0;
  activeManagerLaneClarity?: DashboardCanonicalManagerLaneClarityV1 | null;
  /** Source input; client props use the compact active-board form below. */
  coordinationHealth?: PipelineCoordinationHealthV0 | DashboardCanonicalCoordinationHealthV1 | null;
  workerSummary: PipelineWorkerSummaryV0;
  reliabilityProblems: PipelineReliabilityProblemV0[];
  gatedControls: PipelineGatedControlV0[];
  runtimeReadiness?: PipelineOperationalRuntimeReadinessV0;
  /** Named legacy-action compatibility hold; canonical V1 actions are preferred. */
  actionCapabilities?: PipelineOperationalActionCapabilityV0[];
  actionCapabilitiesV1?: PipelineOperationalActionCapabilityV1[];
  executeAdmission: PipelineExecuteAdmissionV0;
  queueSummary: PipelineQueueSummaryV0;
  evidenceRefs: string[];
};

export type DashboardCanonicalManagerLaneClarityV1 = {
  goal: { summary: string; sourceRef: string };
  posture: {
    state: "on_scope" | "pivot_required" | "not_assessed";
    reason: string;
    nextSafeAction: string;
    decisionRef?: string | null;
    qualification?: string | null;
  };
  canonicalState: { phase: string; freshness: string; evidenceFreshness: string };
  nextGate: { summary: string; nextSafeAction: string };
  criteria: ReadonlyArray<{
    criterionId: string;
    summary: string;
    disposition: string;
    evidenceRefs: readonly string[];
  }>;
};

export type DashboardCanonicalCoordinationHealthV1 = {
  observedAt: string;
  source: "manager_workspace_inventory";
  freshness: "fresh" | "unavailable";
  availability: "available" | "incomplete" | "unavailable";
  activeWorkCount: number;
  staleOwnerTargetCount: number;
  staleOwnerProjectedCount: number;
  dirtyPreserveCount: number;
  missingWorktreeJournalHold: boolean;
  nextSafeAction: string;
  metadataOnly: true;
};

export type DashboardCanonicalOperationalWorkPacketV1 = {
  packetId: string;
  title: string;
  currentStage: AuthoritativePacketStage;
  status: AuthoritativePacketStatus;
  truthLabel: DashboardCanonicalOperationalSourceLabelV1;
  sourceRef: AuthoritativePacketSourceRef | null;
  /** This board read deliberately omits raw canonical extensions. */
  canonicalContract: null;
  productModeMapping: null;
  blocker: string | null;
  nextAction: string | null;
  unblocker: "operator" | "manager" | "worker" | "source" | "system" | "unknown";
  readyToTest?: DashboardCanonicalReadyToTestV1 | null;
  evidenceRefs: string[];
  workItemId?: string | null;
  queueLease?: DashboardCanonicalQueueLeaseV1 | null;
  executionAttempts?: DashboardCanonicalExecutionAttemptV1[];
  correlationIds?: string[];
  updatedAt: string;
  metadataOnly: true;
};

export type DashboardCanonicalOperationalSelectedPacketDetailV1 = {
  packetId: string;
  sourceRefs: AuthoritativePacketSourceRef[];
  /** This board read deliberately omits raw canonical extensions. */
  canonicalContract: null;
  productModeMapping: null;
  evidenceRefs: string[];
  currentStage: AuthoritativePacketStage;
  status: AuthoritativePacketStatus;
  truthLabel: DashboardCanonicalOperationalSourceLabelV1;
  blocker: string | null;
  nextAction: string | null;
  unblocker: "operator" | "manager" | "worker" | "source" | "system" | "unknown";
  readyToTest?: DashboardCanonicalReadyToTestV1 | null;
  latestTransitionEventRef?: string | null;
  recentTransitionEventRefs?: string[];
  latestMovementSummary?: string | null;
  canSatisfyLiveMovementProof?: boolean;
  parentPacketId?: string | null;
  lineageKind?: string;
  operatorTestState?: "not_ready" | "ready" | "passed" | "failed" | "rework";
  operatorTestNote?: string | null;
  /** Named legacy-action compatibility hold; canonical V1 actions are preferred. */
  actionCapabilities?: PipelineOperationalActionCapabilityV0[];
  actionCapabilitiesV1?: PipelineOperationalActionCapabilityV1[];
  actionResults?: PipelineOperationalActionResultV0[];
  reviewRoute: DashboardCanonicalOperationalReviewRouteV1;
  workGraph: DashboardCanonicalWorkGraphEvidenceV1;
  workItemId?: string | null;
  queueLease?: DashboardCanonicalQueueLeaseV1 | null;
  executionAttempts?: DashboardCanonicalExecutionAttemptV1[];
  correlationIds?: string[];
  metadataOnly: true;
};

/**
 * Dashboard-owned work-graph presentation. This is deliberately not an alias
 * of `PipelineWorkGraphEvidenceV0`: normal packet-detail rendering receives
 * only this explicit, metadata-only V1 shape.
 */
export type DashboardCanonicalWorkGraphEvidenceV1 = {
  schemaVersion: "dashboard-canonical-work-graph/v1";
  sourceSchemaVersion: "parallel-execution-graph-reservation/v1";
  availability: "available" | "stale" | "unavailable";
  packetId: string;
  executionJobId: string | null;
  reportIdentity: string | null;
  generatedAt: string | null;
  freshnessState: "live" | "stale" | "unavailable";
  waveMembership: "selected" | "deferred" | "blocked" | "unavailable";
  dependencyState: "clear" | "declared" | "blocked" | "unavailable";
  reservation: {
    status: "advisory_reserved" | "deferred" | "blocked" | "not_recommended" | "unavailable";
    owner: string | null;
    reasonCode: string;
  };
  capacity: {
    posture: "normal" | "degraded" | "blocked" | "unavailable";
    reasonCode: string;
  };
  reason: string;
  nextSafeAction: string;
  evidenceRefs: string[];
  metadataOnly: true;
  rawPayloadRetained: false;
  retention: "metadata_only_evidence_references";
};

export type DashboardCanonicalReadyToTestV1 = {
  readyId: string;
  userFacingSummary: string;
  testableSurface: string;
  verificationRefs: string[];
  evidenceRefs: string[];
  metadataOnly: true;
  rawPayloadRetained: false;
};

export type DashboardCanonicalQueueLeaseV1 = {
  leaseId: string;
  workItemId: string;
  attemptCount: number;
  heartbeatAt: string;
  leaseExpiresAt: string;
  fencingToken: number;
  active: boolean;
  state: "active" | "expired" | "inactive";
  metadataOnly: true;
};

export type DashboardCanonicalExecutionAttemptV1 = {
  attemptId: string;
  workItemId: string;
  leaseId?: string | null;
  fencingToken?: number | null;
  routeDecisionId: string;
  workerId: string;
  lane: string;
  status: string;
  eventRefs: string[];
  evidenceRefs: string[];
  metadataOnly: true;
};
