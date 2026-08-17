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
  PipelineCanonicalContractV1,
  PipelineCoordinationHealthV0,
  PipelineExecuteAdmissionV0,
  PipelineFixtureModeV0,
  PipelineGatedControlV0,
  PipelineManagerSummaryV0,
  PipelineOperationalActionCapabilityV0,
  PipelineOperationalActionCapabilityV1,
  PipelineOperationalActionResultV0,
  PipelineOperationalRuntimeReadinessV0,
  PipelineProductModeMappingV0,
  PipelineProjectionEmptyReasonV0,
  PipelineQueueSummaryV0,
  PipelineReliabilityProblemV0,
  PipelineReviewRouteEvidenceV0,
  PipelineSourceStateV0,
  PipelineStageSummaryV0,
  PipelineTruthSummaryV0,
  PipelineWorkerSummaryV0,
  PipelineWorkGraphEvidenceV0,
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
  coordinationHealth?: PipelineCoordinationHealthV0 | null;
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

export type DashboardCanonicalOperationalWorkPacketV1 = {
  packetId: string;
  title: string;
  currentStage: AuthoritativePacketStage;
  status: AuthoritativePacketStatus;
  truthLabel: DashboardCanonicalOperationalSourceLabelV1;
  sourceRef: AuthoritativePacketSourceRef | null;
  /** Raw canonical extensions never cross the client board boundary. */
  canonicalContract: PipelineCanonicalContractV1 | null;
  productModeMapping: PipelineProductModeMappingV0 | null;
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
  canonicalContract: PipelineCanonicalContractV1 | null;
  productModeMapping: PipelineProductModeMappingV0 | null;
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
  reviewRoute: PipelineReviewRouteEvidenceV0;
  workGraph: PipelineWorkGraphEvidenceV0;
  workItemId?: string | null;
  queueLease?: DashboardCanonicalQueueLeaseV1 | null;
  executionAttempts?: DashboardCanonicalExecutionAttemptV1[];
  correlationIds?: string[];
  metadataOnly: true;
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
