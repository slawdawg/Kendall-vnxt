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

export type AuthoritativePacketStatus = "active" | "waiting" | "blocked" | "failed" | "complete" | "deferred";
export type AuthoritativePacketTruthLabel = "source_owned" | "derived_projection" | "operator_asserted";

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

export interface PipelineDashboardWorkPacketV0 {
  packetId: string;
  title: string;
  currentStage: AuthoritativePacketStage;
  status: AuthoritativePacketStatus;
  truthLabel: PipelineProjectionSourceLabelV0;
  sourceRef: AuthoritativePacketSourceRef | null;
  blocker: string | null;
  nextAction: string | null;
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
  metadataOnly: true;
}

export interface PipelineManagerSummaryV0 {
  stateSource: "supervisor_projection" | "manager_summary" | "unavailable" | "unknown";
  freshnessState: PipelineProjectionFreshnessStateV0;
  activeLeaseCount: number | null;
  activeWorkerCount: number | null;
  warmWorkerCount: number | null;
  blockedQueueCount: number | null;
  dispatchableQueueCount: number | null;
  closedQueueCount: number | null;
  sourceExhausted: boolean;
  inactivityReason: PipelineProjectionEmptyReasonV0 | null;
  summary: string;
  metadataOnly: true;
}

export interface PipelineQueueSummaryV0 {
  dispatchableCount: number | null;
  blockedCount: number | null;
  closedCount: number | null;
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
  workPackets: PipelineDashboardWorkPacketV0[];
  selectedPacketDetails: PipelineSelectedPacketDetailV0[];
  managerSummary: PipelineManagerSummaryV0;
  queueSummary: PipelineQueueSummaryV0;
  evidenceRefs: string[];
}
