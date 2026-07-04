export const AUTHORITATIVE_PACKET_STAGES = [
  "capture",
  "classify",
  "route",
  "shape",
  "needs_approval",
  "execute",
  "review",
  "promote",
  "deliver",
  "learn",
] as const;

export type AuthoritativePacketStage = (typeof AUTHORITATIVE_PACKET_STAGES)[number];

export const AUTHORITATIVE_PACKET_STAGE_LABELS: Record<AuthoritativePacketStage, string> = {
  capture: "Capture",
  classify: "Classify",
  route: "Route",
  shape: "Shape",
  needs_approval: "Needs Approval",
  execute: "Execute",
  review: "Review",
  promote: "Promote",
  deliver: "Deliver",
  learn: "Learn",
};

export const AUTHORITATIVE_PACKET_STATUSES = ["active", "waiting", "blocked", "failed", "complete", "deferred"] as const;

export type AuthoritativePacketStatus = (typeof AUTHORITATIVE_PACKET_STATUSES)[number];
export type AuthoritativePacketTruthLabel = "source_owned" | "derived_projection" | "operator_asserted";

export type PipelineLifecycleStageSemanticV0 =
  | "intake"
  | "route"
  | "shape"
  | "approval"
  | "execute"
  | "review"
  | "promote"
  | "deliver"
  | "learn"
  | "terminal"
  | "deferred"
  | "unknown";

export type PipelineLifecycleStageResolutionV0 = AuthoritativePacketStage | "terminal" | "deferred" | "unknown";

export const PIPELINE_LIFECYCLE_STAGE_TO_AUTHORITATIVE: Record<
  PipelineLifecycleStageSemanticV0,
  PipelineLifecycleStageResolutionV0
> = {
  intake: "capture",
  route: "route",
  shape: "shape",
  approval: "needs_approval",
  execute: "execute",
  review: "review",
  promote: "promote",
  deliver: "deliver",
  learn: "learn",
  terminal: "terminal",
  deferred: "deferred",
  unknown: "unknown",
};

export const AUTHORITATIVE_PACKET_STAGE_PRD_SEMANTICS: Record<
  AuthoritativePacketStage,
  Exclude<PipelineLifecycleStageSemanticV0, "terminal" | "deferred" | "unknown">
> = {
  capture: "intake",
  classify: "intake",
  route: "route",
  shape: "shape",
  needs_approval: "approval",
  execute: "execute",
  review: "review",
  promote: "promote",
  deliver: "deliver",
  learn: "learn",
};

export const AUTHORITATIVE_PACKET_DISPATCHABLE_STATUSES = ["waiting"] as const;
export const AUTHORITATIVE_PACKET_LIVE_PROGRESS_STATUSES = ["active"] as const;
export const AUTHORITATIVE_PACKET_CLOSED_STATUSES = ["failed", "complete", "deferred"] as const;
export const AUTHORITATIVE_PACKET_DISPATCHABLE_STAGES = [
  "capture",
  "classify",
  "route",
  "shape",
  "execute",
  "review",
  "promote",
  "deliver",
] as const satisfies readonly AuthoritativePacketStage[];
export const AUTHORITATIVE_PACKET_LIVE_PROGRESS_STAGES = [
  "capture",
  "classify",
  "route",
  "shape",
  "execute",
  "review",
  "promote",
  "deliver",
] as const satisfies readonly AuthoritativePacketStage[];

export interface AuthoritativePacketStateLike {
  currentStage?: unknown;
  targetStage?: unknown;
  stage?: unknown;
  status?: unknown;
}

export function isKnownAuthoritativePacketStage(value: unknown): value is AuthoritativePacketStage {
  return typeof value === "string" && (AUTHORITATIVE_PACKET_STAGES as readonly string[]).includes(value);
}

export function isKnownAuthoritativePacketStatus(value: unknown): value is AuthoritativePacketStatus {
  return typeof value === "string" && (AUTHORITATIVE_PACKET_STATUSES as readonly string[]).includes(value);
}

export function isClosedAuthoritativePacketStatus(value: unknown): value is (typeof AUTHORITATIVE_PACKET_CLOSED_STATUSES)[number] {
  return typeof value === "string" && (AUTHORITATIVE_PACKET_CLOSED_STATUSES as readonly string[]).includes(value);
}

export function isDispatchableAuthoritativePacketState(state: AuthoritativePacketStateLike | null | undefined): boolean {
  const stage = getAuthoritativePacketStateStage(state);
  return (
    isKnownAuthoritativePacketStage(stage) &&
    (AUTHORITATIVE_PACKET_DISPATCHABLE_STAGES as readonly string[]).includes(stage) &&
    state?.status === "waiting"
  );
}

export function isLiveProgressAuthoritativePacketState(state: AuthoritativePacketStateLike | null | undefined): boolean {
  const stage = getAuthoritativePacketStateStage(state);
  return (
    isKnownAuthoritativePacketStage(stage) &&
    (AUTHORITATIVE_PACKET_LIVE_PROGRESS_STAGES as readonly string[]).includes(stage) &&
    state?.status === "active"
  );
}

function getAuthoritativePacketStateStage(state: AuthoritativePacketStateLike | null | undefined): unknown {
  if (!state) {
    return undefined;
  }
  const stageValues = [state.currentStage, state.stage].filter((value) => value !== undefined && value !== null);
  if (stageValues.length === 0) {
    return undefined;
  }
  const [firstStage] = stageValues;
  if (!stageValues.every((value) => value === firstStage)) {
    return undefined;
  }
  return state.targetStage === undefined || state.targetStage === null || state.targetStage === firstStage ? firstStage : undefined;
}

export interface AuthoritativePacketActor {
  actorId?: string | null;
  actorLabel?: string | null;
  actorType: "system" | "operator" | "manager" | "worker";
}

export interface AuthoritativePacketSourceRef {
  refId: string;
  sourceType: "prd" | "bmad_story" | "operator_input" | "workflow" | "repo_doc";
  pathOrUrl?: string | null;
  title?: string | null;
}

export interface AuthoritativePacketLifecycleEvent {
  eventId: string;
  packetId: string;
  schemaVersion: 1;
  eventType: "packet.created" | "packet.stage_transitioned";
  previousStage?: AuthoritativePacketStage | null;
  targetStage: AuthoritativePacketStage;
  status: AuthoritativePacketStatus;
  truthLabel: AuthoritativePacketTruthLabel;
  sourceRef: AuthoritativePacketSourceRef;
  actor: AuthoritativePacketActor;
  occurredAt: string;
  correlationId?: string | null;
  causationId?: string | null;
  idempotencyKey?: string | null;
  payloadSummary: string;
  evidenceRefs: string[];
  metadataOnly: true;
}

export interface AuthoritativeWorkPacketLifecycleView {
  packetId: string;
  title: string;
  currentStage: AuthoritativePacketStage;
  status: AuthoritativePacketStatus;
  truthLabel: AuthoritativePacketTruthLabel;
  sourceRef: AuthoritativePacketSourceRef;
  createdAt: string;
  updatedAt: string;
  currentEventId: string;
  history: AuthoritativePacketLifecycleEvent[];
  metadataOnly: true;
}

export interface CreateAuthoritativeWorkPacketRequest {
  packetId?: string;
  title: string;
  initialStage?: AuthoritativePacketStage;
  status?: AuthoritativePacketStatus;
  truthLabel?: AuthoritativePacketTruthLabel;
  sourceRef: AuthoritativePacketSourceRef;
  actor: AuthoritativePacketActor;
  idempotencyKey?: string | null;
  payloadSummary?: string;
  evidenceRefs?: string[];
}

export interface TransitionAuthoritativeWorkPacketRequest {
  targetStage: AuthoritativePacketStage;
  expectedCurrentEventId: string;
  status?: AuthoritativePacketStatus;
  truthLabel?: AuthoritativePacketTruthLabel;
  actor: AuthoritativePacketActor;
  idempotencyKey?: string | null;
  payloadSummary?: string;
  evidenceRefs?: string[];
}

export type PipelineProjectionSourceLabelV0 = "live" | "stale" | "fixture" | "simulated" | "dry_run" | "unavailable" | "unknown";
export type PipelineProjectionFreshnessStateV0 = "live" | "stale" | "unavailable" | "unknown";
export type PipelineProjectionEmptyReasonV0 =
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

export interface PipelineBackendReachabilityV0 {
  state: "reachable" | "unavailable" | "unknown";
  checkedAt: string;
  reason?: PipelineProjectionEmptyReasonV0 | null;
  summary: string;
}

export interface PipelineFixtureModeV0 {
  enabled: boolean;
  reason: string | null;
  allowedForEnvironment: boolean;
  visibleLabelRequired: true;
  canSatisfyLiveProof: false;
}

export interface PipelineTruthSummaryV0 {
  label: PipelineProjectionSourceLabelV0;
  emptyReason: PipelineProjectionEmptyReasonV0 | null;
  backendEmpty: boolean;
  backendUnavailable: boolean;
  fixtureBacked: boolean;
  stale: boolean;
  summary: string;
}

export interface PipelineStageSummaryV0 {
  stage: AuthoritativePacketStage;
  label: string;
  packetCount: number;
  sourceLabel: PipelineProjectionSourceLabelV0;
  freshnessState: PipelineProjectionFreshnessStateV0;
  emptyReason: PipelineProjectionEmptyReasonV0 | null;
}

export type PipelineSourceStateValueV0 =
  | "healthy"
  | "exhausted"
  | "blocked"
  | "gated"
  | "stale"
  | "unavailable"
  | "refilling"
  | "unknown";

export type PipelineSourceKindV0 =
  | AuthoritativePacketSourceRef["sourceType"]
  | "candidate_work"
  | "work_item"
  | "bmad_artifact"
  | "obsidian"
  | "llm_wiki"
  | "github"
  | "research"
  | "manual"
  | "unknown";

export interface PipelineSourceStateV0 {
  sourceId: string;
  sourceRef: string;
  sourceKind: PipelineSourceKindV0;
  state: PipelineSourceStateValueV0;
  summary: string;
  evidenceRefs: string[];
  updatedAt: string;
  metadataOnly: true;
}

export interface PipelineReadyToTestV0 {
  readyId: string;
  userFacingSummary: string;
  testableSurface: string;
  verificationRefs: string[];
  evidenceRefs: string[];
  metadataOnly: true;
  rawPayloadRetained: false;
}

export interface PipelineDashboardWorkPacketV0 {
  packetId: string;
  title: string;
  currentStage: AuthoritativePacketStage;
  status: AuthoritativePacketStatus;
  truthLabel: PipelineProjectionSourceLabelV0;
  sourceRef: AuthoritativePacketSourceRef | null;
  blocker: string | null;
  nextAction: string | null;
  readyToTest?: PipelineReadyToTestV0 | null;
  evidenceRefs: string[];
  updatedAt: string;
  metadataOnly: true;
}

export interface PipelineSelectedPacketDetailV0 {
  packetId: string;
  sourceRefs: AuthoritativePacketSourceRef[];
  evidenceRefs: string[];
  currentStage: AuthoritativePacketStage;
  status: AuthoritativePacketStatus;
  truthLabel: PipelineProjectionSourceLabelV0;
  blocker: string | null;
  nextAction: string | null;
  readyToTest?: PipelineReadyToTestV0 | null;
  latestTransitionEventRef?: string | null;
  recentTransitionEventRefs?: string[];
  latestMovementSummary?: string | null;
  canSatisfyLiveMovementProof?: boolean;
  metadataOnly: true;
}

export interface PipelineManagerSummaryV0 {
  stateSource: "supervisor_projection" | "manager_summary" | "unavailable" | "unknown";
  reliabilityState:
    | "ready"
    | "running"
    | "healthy_idle"
    | "source_exhausted"
    | "waiting_for_approval"
    | "blocked"
    | "refilling"
    | "degraded"
    | "unavailable"
    | "unknown";
  freshnessState: PipelineProjectionFreshnessStateV0;
  activeLeaseCount: number | null;
  activeWorkerCount: number | null;
  warmWorkerCount: number | null;
  blockedQueueCount: number | null;
  dispatchableQueueCount: number | null;
  closedQueueCount: number | null;
  healthySourceCount: number | null;
  exhaustedSourceCount: number | null;
  blockedSourceCount: number | null;
  gatedSourceCount: number | null;
  staleSourceCount: number | null;
  unavailableSourceCount: number | null;
  refillingSourceCount: number | null;
  unknownSourceCount: number | null;
  sourceExhausted: boolean;
  inactivityReason: PipelineProjectionEmptyReasonV0 | null;
  evidenceRefs: string[];
  summary: string;
  metadataOnly: true;
}

export interface PipelineWorkerSummaryV0 {
  stateSource: "supervisor_projection" | "manager_summary" | "unavailable" | "unknown";
  freshnessState: PipelineProjectionFreshnessStateV0;
  warmCount: number | null;
  activeCount: number | null;
  waitingCount: number | null;
  stalledCount: number | null;
  failedCount: number | null;
  drainingCount: number | null;
  killedCount: number | null;
  completeCount: number | null;
  unavailableCount: number | null;
  unknownCount: number | null;
  workerRefs: string[];
  evidenceRefs: string[];
  summary: string;
  metadataOnly: true;
}

export interface PipelineReliabilityProblemV0 {
  problemId: string;
  kind:
    | "idle_with_ready_work"
    | "stalled_worker"
    | "stale_projection"
    | "backend_unavailable"
    | "source_blocked"
    | "approval_required"
    | "usage_limited"
    | "resource_limited"
    | "unknown";
  severity: "info" | "attention" | "blocked";
  likelyIssue: "manager" | "worker" | "source" | "approval" | "usage" | "resource" | "unknown";
  summary: string;
  evidenceRefs: string[];
  metadataOnly: true;
}

export interface PipelineGatedControlV0 {
  controlId: string;
  operation:
    | "kill_worker"
    | "drain_worker"
    | "cleanup_workspace"
    | "takeover_workspace"
    | "provider_call"
    | "github_mutation"
    | "worker_launch"
    | "lease_mutation"
    | "source_mutation"
    | "terminal_access"
    | "raw_payload_retention"
    | "unknown";
  status: "gated" | "action_needed" | "blocked";
  authorityFamily: string;
  stopLine: string;
  nextAction: string;
  packetId: string | null;
  workerRefs: string[];
  evidenceRefs: string[];
  metadataOnly: true;
}

export interface PipelineQueueSummaryV0 {
  activeCount: number | null;
  dispatchableCount: number | null;
  blockedCount: number | null;
  gatedCount: number | null;
  closedCount: number | null;
  staleCount: number | null;
  refillingCount: number | null;
  unknownCount: number | null;
  emptyReason: PipelineProjectionEmptyReasonV0 | null;
  sourceExhausted: boolean;
  summary: string;
}

export interface PipelineDashboardProjectionV0 {
  schemaVersion: "pipeline-dashboard-projection/v0";
  projectionId: string;
  generatedAt: string;
  sourceUpdatedAt: string;
  sourceLabel: PipelineProjectionSourceLabelV0;
  freshnessState: PipelineProjectionFreshnessStateV0;
  staleAfterSeconds: number;
  backendReachability: PipelineBackendReachabilityV0;
  fixtureMode: PipelineFixtureModeV0;
  truthSummary: PipelineTruthSummaryV0;
  stageSummaries: PipelineStageSummaryV0[];
  sourceStates: PipelineSourceStateV0[];
  workPackets: PipelineDashboardWorkPacketV0[];
  selectedPacketDetails: PipelineSelectedPacketDetailV0[];
  managerSummary: PipelineManagerSummaryV0;
  workerSummary: PipelineWorkerSummaryV0;
  reliabilityProblems: PipelineReliabilityProblemV0[];
  gatedControls: PipelineGatedControlV0[];
  queueSummary: PipelineQueueSummaryV0;
  evidenceRefs: string[];
}
