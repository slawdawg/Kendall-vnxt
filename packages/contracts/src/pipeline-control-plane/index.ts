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
  parentPacketId?: string | null;
  lineageKind?: string;
  readyToTest?: PipelineReadyToTestV0 | null;
  operatorTestState?: "not_ready" | "ready" | "passed" | "failed" | "rework";
  operatorTestNote?: string | null;
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
  parentPacketId?: string | null;
  lineageKind?: string;
  readyToTest?: PipelineReadyToTestV0 | null;
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
  readyToTest?: PipelineReadyToTestV0 | null;
  payloadSummary?: string;
  evidenceRefs?: string[];
}

export const PIPELINE_OPERATIONAL_ACTION_SCHEMA_VERSION = "pipeline-operational-action/v0" as const;
export const PIPELINE_OPERATIONAL_RUNTIME_READINESS_SCHEMA_VERSION = "pipeline-operational-runtime-readiness/v0" as const;
export const PIPELINE_OPERATIONAL_READINESS_CONTRACT_SCHEMA_VERSION = "pipeline-operational-readiness-contract/v0" as const;
export const PIPELINE_ONE_WORKER_LIVE_CANARY_SCHEMA_VERSION = "pipeline-one-worker-live-canary/v0" as const;
export const PIPELINE_LIVE_CAPACITY_RAMP_SCHEMA_VERSION = "pipeline-live-capacity-ramp/v0" as const;
export const PIPELINE_RESILIENCE_RECOVERY_SCHEMA_VERSION = "pipeline-resilience-recovery-validation/v0" as const;

export const PIPELINE_OPERATIONAL_ACTION_RISK_TIERS = ["low", "medium", "high", "extreme"] as const;
export type PipelineOperationalActionRiskTierV0 = (typeof PIPELINE_OPERATIONAL_ACTION_RISK_TIERS)[number];

export const PIPELINE_OPERATIONAL_ACTION_CAPABILITY_STATES = ["available", "unavailable", "gated", "simulated"] as const;
export type PipelineOperationalActionCapabilityStateV0 = (typeof PIPELINE_OPERATIONAL_ACTION_CAPABILITY_STATES)[number];

export const PIPELINE_OPERATIONAL_ACTION_AUTHORITY_STATES = [
  "not_required",
  "allowed",
  "needs_product_approval",
  "needs_authority_approval",
  "needs_resource_approval",
  "needs_destination_approval",
  "needs_safety_approval",
  "blocked",
] as const;
export type PipelineOperationalActionAuthorityStateV0 = (typeof PIPELINE_OPERATIONAL_ACTION_AUTHORITY_STATES)[number];
export type PipelineOperationalActionRequestedAuthorityStateV0 = Exclude<PipelineOperationalActionAuthorityStateV0, "allowed">;

export const PIPELINE_OPERATIONAL_ACTION_TYPED_REASONS = [
  "no_eligible_work",
  "blocked_by_policy",
  "blocked_by_approval",
  "blocked_by_resources",
  "runtime_unavailable",
  "worker_failed",
  "verification_failed",
  "delivery_blocked",
  "evidence_invalid",
  "projection_stale",
  "invalid_transition",
  "test_not_ready",
  "unsupported_action",
  "unknown",
] as const;
export type PipelineOperationalActionTypedReasonV0 = (typeof PIPELINE_OPERATIONAL_ACTION_TYPED_REASONS)[number];

export const PIPELINE_OPERATIONAL_ACTION_IDS = [
  "inspect",
  "refresh_projection",
  "dispatch_apply",
  "mark_viewed",
  "retry_verification",
  "requeue",
  "mark_tested",
  "request_rework",
  "pause",
  "drain",
  "reassign",
  "reject",
  "kill_worker",
  "mutate_source",
  "push_branch",
  "open_pr",
  "merge",
  "delete_branch",
  "cleanup",
  "credential_or_provider_change",
] as const;
export type PipelineOperationalActionIdV0 = (typeof PIPELINE_OPERATIONAL_ACTION_IDS)[number];

export const PIPELINE_OPERATIONAL_ACTION_TARGET_TYPES = [
  "work_packet",
  "candidate_work",
  "work_item",
  "execution_attempt",
  "worker",
  "workspace",
  "branch",
  "manager_run",
  "projection",
  "runtime",
  "unknown",
] as const;

export type PipelineOperationalActionTargetTypeV0 =
  (typeof PIPELINE_OPERATIONAL_ACTION_TARGET_TYPES)[number];

export const PIPELINE_OPERATIONAL_ACTION_OUTCOMES = ["succeeded", "rejected", "blocked", "failed", "simulated"] as const;
export type PipelineOperationalActionOutcomeV0 = (typeof PIPELINE_OPERATIONAL_ACTION_OUTCOMES)[number];
export const PIPELINE_OPERATIONAL_RUNTIME_MODES = ["disabled", "local_proof", "read_only", "bounded_write", "unavailable", "unknown"] as const;
export type PipelineOperationalRuntimeModeV0 = (typeof PIPELINE_OPERATIONAL_RUNTIME_MODES)[number];
export const PIPELINE_OPERATIONAL_RUNTIME_READINESS_STATES = ["ready", "degraded", "blocked", "unavailable", "unknown"] as const;
export type PipelineOperationalRuntimeReadinessStateV0 = (typeof PIPELINE_OPERATIONAL_RUNTIME_READINESS_STATES)[number];
export type PipelineOperationalActionEvidenceRefsV0 = [string, ...string[]];

export const PIPELINE_OPERATIONAL_READINESS_GATE_STATES = ["pass", "fail", "blocked", "not_applicable"] as const;
export type PipelineOperationalReadinessGateStateV0 = (typeof PIPELINE_OPERATIONAL_READINESS_GATE_STATES)[number];
export const PIPELINE_OPERATIONAL_READINESS_BACKEND_TRUTHS = ["live", "simulated", "dry_run"] as const;
export type PipelineOperationalReadinessBackendTruthV0 = (typeof PIPELINE_OPERATIONAL_READINESS_BACKEND_TRUTHS)[number];
export const PIPELINE_OPERATIONAL_READINESS_OUTCOMES = ["go", "no_go"] as const;
export type PipelineOperationalReadinessOutcomeV0 = (typeof PIPELINE_OPERATIONAL_READINESS_OUTCOMES)[number];
export const PIPELINE_OPERATIONAL_READINESS_REASONS = [
  "threshold_missing",
  "threshold_malformed",
  "telemetry_missing",
  "telemetry_stale",
  "telemetry_contradictory",
  "alert_coverage_missing",
  "rollback_missing",
  "recovery_missing",
  "ownership_ambiguous",
  "target_not_exact",
  "evidence_missing",
  "evidence_stale",
  "backend_truth_unproven",
  "configuration_invalid",
  "secret_like_metadata",
  "resource_pressure",
  "usage_pressure",
  "preflight_blocked",
  "dispatcher_lease_unproven",
  "receipt_unproven",
  "predecessor_gate_not_passed",
  "safety_violation",
  "authority_violation",
  "canary_authority_missing",
  "lease_missing",
  "checkpoint_missing",
  "latency_threshold_exceeded",
  "error_threshold_exceeded",
  "resource_threshold_exceeded",
  "cost_threshold_exceeded",
  "timeout",
  "recovery_boundary_breached",
  "canary_not_passed",
  "stage_plan_invalid",
  "capacity_missing",
  "stage_threshold_missing",
  "stage_threshold_exceeded",
  "stage_lifecycle_ambiguous",
  "stage_authority_missing",
  "stage_evidence_missing",
  "drill_evidence_missing",
  "recovery_ambiguity",
  "idempotency_unproven",
  "silent_retry",
  "recovery_drill_failed",
  "unknown",
] as const;
export type PipelineOperationalReadinessReasonV0 = (typeof PIPELINE_OPERATIONAL_READINESS_REASONS)[number];

export interface PipelineOperationalReadinessTargetV0 {
  workerId: string;
  assignmentId: string;
  owner: string;
  runId: string;
  sourceRefs: PipelineOperationalActionEvidenceRefsV0;
  evidenceRefs: PipelineOperationalActionEvidenceRefsV0;
}

export interface PipelineOperationalReadinessGateV0 {
  gateId: string;
  state: PipelineOperationalReadinessGateStateV0;
  typedReason: PipelineOperationalReadinessReasonV0 | null;
  nextAction: string;
  evidenceRefs: PipelineOperationalActionEvidenceRefsV0;
}

export interface PipelineOperationalReadinessThresholdV0 {
  name: string;
  operator: "lt" | "lte" | "gt" | "gte" | "eq";
  value: number;
  unit: string;
  explicit: true;
}

export interface PipelineOperationalReadinessSliSloV0 {
  indicator: string;
  target: PipelineOperationalReadinessThresholdV0;
  windowSeconds: number;
  errorBudget: number;
  zeroTolerance?: true;
}

export interface PipelineOperationalReadinessTelemetryV0 {
  source: string;
  coverage: string;
  observationWindowSeconds: number;
  alertThresholdIds: string[];
  alertReady: boolean;
}

export interface PipelineOperationalReadinessConfigurationV0 {
  names: string[];
  validationState: "pass" | "fail" | "unknown";
  noValueRetention: true;
}

export interface PipelineOperationalReadinessRecoveryV0 {
  owner: string;
  rollbackPath: string;
  remediationAction: string;
  recheckAt: string;
  expiryAt: string;
}

export interface PipelineOperationalReadinessContractV0 {
  schemaVersion: typeof PIPELINE_OPERATIONAL_READINESS_CONTRACT_SCHEMA_VERSION;
  target: PipelineOperationalReadinessTargetV0;
  backendTruth: PipelineOperationalReadinessBackendTruthV0;
  authorityState: PipelineOperationalActionAuthorityStateV0;
  riskTier: PipelineOperationalActionRiskTierV0;
  sliSlo: PipelineOperationalReadinessSliSloV0[];
  telemetry: PipelineOperationalReadinessTelemetryV0;
  configuration: PipelineOperationalReadinessConfigurationV0;
  recovery: PipelineOperationalReadinessRecoveryV0;
  gates: PipelineOperationalReadinessGateV0[];
  outcome: PipelineOperationalReadinessOutcomeV0;
  typedBlockers: Array<{ gateId: string; reason: PipelineOperationalReadinessReasonV0; nextAction: string }>;
  checkedAt: string;
  expiresAt: string;
  metadataOnly: true;
  rawPayloadRetained: false;
}

export const PIPELINE_ONE_WORKER_LIVE_CANARY_OUTCOMES = ["pass", "hold", "stop"] as const;
export type PipelineOneWorkerLiveCanaryOutcomeV0 = (typeof PIPELINE_ONE_WORKER_LIVE_CANARY_OUTCOMES)[number];

export interface PipelineOneWorkerLiveCanaryLeaseV0 {
  state: "pass" | "fail" | "blocked";
  proofRef: string;
}

export interface PipelineOneWorkerLiveCanaryCheckpointV0 {
  state: "pass" | "fail" | "blocked";
  proofRef: string;
}

export interface PipelineOneWorkerLiveCanaryTelemetryV0 {
  source: string;
  coverage: string;
  observationWindowSeconds: number | null;
  alertThresholdIds: string[];
  alertReady: boolean;
}

export interface PipelineOneWorkerLiveCanaryMeasurementsV0 {
  observedAt: string;
  latencyMs: number | null;
  errorCount: number | null;
  cpuPercent: number | null;
  memoryPercent: number | null;
  diskPercent: number | null;
  costCents: number | null;
  timedOut: boolean;
}

export interface PipelineOneWorkerLiveCanaryEvidenceV0 {
  schemaVersion: typeof PIPELINE_ONE_WORKER_LIVE_CANARY_SCHEMA_VERSION;
  target: PipelineOperationalReadinessTargetV0;
  workerCount: 1;
  backendTruth: PipelineOperationalReadinessBackendTruthV0;
  truthLabel: PipelineOperationalReadinessBackendTruthV0;
  canaryAuthority: { state: "allowed" | "blocked"; proven: boolean; evidenceRefs: PipelineOperationalActionEvidenceRefsV0 | string[] };
  telemetry: PipelineOneWorkerLiveCanaryTelemetryV0;
  lease: PipelineOneWorkerLiveCanaryLeaseV0;
  checkpoint: PipelineOneWorkerLiveCanaryCheckpointV0;
  measurements: PipelineOneWorkerLiveCanaryMeasurementsV0;
  thresholds: Record<string, PipelineOperationalReadinessThresholdV0 | null>;
  recovery: { owner: string; rollbackPath: string; remediationAction: string; required: boolean };
  gates: PipelineOperationalReadinessGateV0[];
  outcome: PipelineOneWorkerLiveCanaryOutcomeV0;
  rampAllowed: boolean;
  typedBlockers: Array<{ gateId: string; reason: PipelineOperationalReadinessReasonV0; nextAction: string }>;
  sourceRefs: PipelineOperationalActionEvidenceRefsV0 | string[];
  evidenceRefs: PipelineOperationalActionEvidenceRefsV0 | string[];
  checkedAt: string;
  expiresAt: string;
  nextManagerAction: string;
  metadataOnly: true;
  rawPayloadRetained: false;
}

export const PIPELINE_LIVE_CAPACITY_RAMP_OUTCOMES = ["pass", "hold", "stop"] as const;
export type PipelineLiveCapacityRampOutcomeV0 = (typeof PIPELINE_LIVE_CAPACITY_RAMP_OUTCOMES)[number];

export interface PipelineLiveCapacityRampStageV0 {
  stageId: string;
  workerCount: number | null;
  capacityReady: boolean;
  durationSeconds: number | null;
  owner: string;
  budgetCents: number | null;
  rollbackThresholds: Record<string, PipelineOperationalReadinessThresholdV0 | null>;
  authority: { state: "allowed" | "blocked"; proven: boolean; evidenceRefs: string[] };
  observed: {
    queueDepth: number | null;
    leaseHealthy: boolean;
    latencyMs: number | null;
    errorCount: number | null;
    cpuPercent: number | null;
    memoryPercent: number | null;
    diskPercent: number | null;
    processCount: number | null;
    usageState: "normal" | "ready" | "drain" | "manager_only" | "unknown";
    costCents: number | null;
  };
  changed: boolean;
  skipped: boolean;
  rationale: string;
  replacementThresholds: Record<string, PipelineOperationalReadinessThresholdV0 | null>;
  evidenceRefs: string[];
  lifecycleAmbiguous: boolean;
  outcome: PipelineLiveCapacityRampOutcomeV0;
  typedBlockers: Array<{ code: string; message: string }>;
  rampAllowed: boolean;
}

export interface PipelineLiveCapacityRampEvidenceV0 {
  schemaVersion: typeof PIPELINE_LIVE_CAPACITY_RAMP_SCHEMA_VERSION;
  canaryEvidenceRef: string | null;
  canaryOutcome: PipelineOneWorkerLiveCanaryOutcomeV0 | "unknown";
  defaultStageWorkerCounts: [1, 2, 4, 6];
  stageWorkerCounts: number[];
  changedPlan: boolean;
  planRationale: string;
  planAuthority: { state: "allowed" | "blocked"; proven: boolean; evidenceRefs: string[] };
  stages: PipelineLiveCapacityRampStageV0[];
  recovery: { owner: string; rollbackPath: string; remediationAction: string; required: boolean };
  outcome: PipelineLiveCapacityRampOutcomeV0;
  scaleEvidenceReady: boolean;
  rolloutAllowed: false;
  typedBlockers: Array<{ gateId: string; reason: PipelineOperationalReadinessReasonV0; nextAction: string }>;
  sourceRefs: string[];
  evidenceRefs: string[];
  checkedAt: string;
  expiresAt: string;
  nextManagerAction: string;
  stopLines: string[];
  metadataOnly: true;
  rawPayloadRetained: false;
}

export const PIPELINE_RESILIENCE_RECOVERY_OUTCOMES = ["pass", "hold", "stop"] as const;
export type PipelineResilienceRecoveryOutcomeV0 = (typeof PIPELINE_RESILIENCE_RECOVERY_OUTCOMES)[number];

export interface PipelineResilienceRecoveryDrillV0 {
  drillId: string;
  kind: string;
  owner: string;
  authority: { state: "allowed" | "blocked"; proven: boolean; evidenceRefs: string[] };
  expectedRecoveryAction: string;
  observed: {
    stateBefore: string;
    stateAfter: string;
    ownershipBefore: string;
    ownershipAfter: string;
    leaseState: string;
    idempotencyState: "proven" | "preserved" | "unknown" | "ambiguous";
    rollbackState: string;
    evidenceRetained: boolean;
    ambiguous: boolean;
    silentRetry: boolean;
    retryCount: number | null;
  };
  evidenceRefs: string[];
  nextAction: string;
  outcome: PipelineResilienceRecoveryOutcomeV0;
  rampAllowed: false;
  typedBlockers: Array<{ code: string; message: string }>;
}

export interface PipelineResilienceRecoveryEvidenceV0 {
  schemaVersion: typeof PIPELINE_RESILIENCE_RECOVERY_SCHEMA_VERSION;
  predecessorOutcome: PipelineLiveCapacityRampOutcomeV0 | PipelineOneWorkerLiveCanaryOutcomeV0 | "unknown";
  predecessorReady: boolean;
  drillKinds: string[];
  drills: PipelineResilienceRecoveryDrillV0[];
  recovery: { owner: string; rollbackPath: string; remediationAction: string; required: boolean };
  outcome: PipelineResilienceRecoveryOutcomeV0;
  reliabilityEvidenceReady: boolean;
  limitedRolloutBoundaries: string[];
  rolloutAllowed: false;
  typedBlockers: Array<{ drillId: string; reason: PipelineOperationalReadinessReasonV0; nextAction: string }>;
  sourceRefs: string[];
  evidenceRefs: string[];
  checkedAt: string;
  expiresAt: string;
  nextManagerAction: string;
  stopLines: string[];
  metadataOnly: true;
  rawPayloadRetained: false;
}

export interface PipelineOperationalActionValidationIssueV0 {
  field: string;
  code:
    | "unknown_action_id"
    | "blank_identifier"
    | "evidence_required"
    | "request_cannot_self_authorize"
    | "unsafe_metadata_retention"
    | "invalid_actor"
    | "forbidden_field"
    | "stale_or_unparseable_readiness"
    | "bad_schema_version"
    | "bad_retention_flag"
    | "invalid_enum"
    | "policy_violation"
    | "inconsistent_result";
  summary: string;
}

export interface PipelineOperationalActionRequestV0 {
  schemaVersion: typeof PIPELINE_OPERATIONAL_ACTION_SCHEMA_VERSION;
  actionId: PipelineOperationalActionIdV0;
  targetType: PipelineOperationalActionTargetTypeV0;
  targetId: string;
  idempotencyKey: string;
  correlationId: string;
  requestedBy: AuthoritativePacketActor;
  requestedAuthorityState: PipelineOperationalActionRequestedAuthorityStateV0;
  requestedRiskTier: PipelineOperationalActionRiskTierV0;
  operatorIntentSummary?: string | null;
  evidenceRefs: PipelineOperationalActionEvidenceRefsV0;
  expectedCurrentEventId?: string | null;
  testResult?: "pass" | "fail" | "notes" | null;
  testNotes?: string | null;
  metadataOnly: true;
  rawPayloadRetained: false;
}

export interface PipelineOperationalActionResultV0 {
  schemaVersion: typeof PIPELINE_OPERATIONAL_ACTION_SCHEMA_VERSION;
  actionId: PipelineOperationalActionIdV0;
  targetType: PipelineOperationalActionTargetTypeV0;
  targetId: string;
  outcome: PipelineOperationalActionOutcomeV0;
  resultingStage: AuthoritativePacketStage | "terminal" | "deferred" | "unknown";
  resultingStatus: AuthoritativePacketStatus | "unknown";
  capabilityState: PipelineOperationalActionCapabilityStateV0;
  authorityState: PipelineOperationalActionAuthorityStateV0;
  riskTier: PipelineOperationalActionRiskTierV0;
  typedReason: PipelineOperationalActionTypedReasonV0 | null;
  evidenceRefs: PipelineOperationalActionEvidenceRefsV0;
  correlationId: string;
  idempotencyKey: string;
  actionRecordId: string;
  childPacketId?: string | null;
  metadataOnly: true;
  rawPayloadRetained: false;
}

export interface PipelineOperationalActionCapabilityV0 {
  actionId: PipelineOperationalActionIdV0;
  targetType: PipelineOperationalActionTargetTypeV0;
  targetId?: string | null;
  capabilityState: PipelineOperationalActionCapabilityStateV0;
  authorityState: PipelineOperationalActionAuthorityStateV0;
  riskTier: PipelineOperationalActionRiskTierV0;
  typedReason: PipelineOperationalActionTypedReasonV0 | null;
  expectedResultSummary: string;
  correlationRequired: true;
  idempotencyRequired: true;
  evidenceRefs: PipelineOperationalActionEvidenceRefsV0;
  metadataOnly: true;
  rawPayloadRetained: false;
}

export interface PipelineOperationalRuntimeReadinessV0 {
  schemaVersion: typeof PIPELINE_OPERATIONAL_RUNTIME_READINESS_SCHEMA_VERSION;
  actionSchemaVersion: typeof PIPELINE_OPERATIONAL_ACTION_SCHEMA_VERSION;
  readinessState: PipelineOperationalRuntimeReadinessStateV0;
  operationalMode: PipelineOperationalRuntimeModeV0;
  freshnessState: PipelineProjectionFreshnessStateV0;
  capabilityState: PipelineOperationalActionCapabilityStateV0;
  typedReason: PipelineOperationalActionTypedReasonV0 | null;
  checkedAt: string;
  expiresAt: string;
  summary: string;
  actionCapabilities: PipelineOperationalActionCapabilityV0[];
  evidenceRefs: PipelineOperationalActionEvidenceRefsV0;
  metadataOnly: true;
  rawPayloadRetained: false;
}

const FORBIDDEN_OPERATIONAL_ACTION_METADATA =
  /\b(?:raw[\s_-]*(?:prompts?|completions?|transcripts?|logs?|sources?)|reasoning[\s_-]*traces?|provider[\s_-]*payloads?|source[\s_-]*(?:dumps?|copies?|snapshots?)|stack[\s_-]*dumps?|console[\s_-]*logs?|secrets?(?:[\s_-]*(?:key|token|value|id))?|credentials?(?:[\s_-]*(?:key|token|value|id))?|passwords?|api[\s_-]*keys?|access[\s_-]*tokens?|auth[\s_-]*tokens?|private[\s_-]*keys?|passphrases?|(?:terminal|tmux|pane)[\s_-]*(?:scrollbacks?|texts?|outputs?|stdouts?|stderrs?))\b/i;
const FORBIDDEN_OPERATIONAL_ACTION_OBJECT_FIELD =
  /^(?:rawPrompt|rawCompletion|rawTranscript|rawLog|rawLogs|rawSource|sourceDump|sourceCopy|sourceSnapshot|stackDump|consoleLog|consoleLogs|reasoningTrace|providerPayload|secret|credential|password|apiKey|accessToken|authToken|privateKey|passphrase|terminalOutput|terminalStdout|terminalStderr|tmuxScrollback|paneText|stdout|stderr|transcript)$/i;
const OPERATIONAL_ACTION_EVIDENCE_REF =
  /^(?:manager-cycle|preflight|usage|resources|operational-action|verification|evidence|story|assignment|task|source|prd|check|checkpoint|command|test|artifact):[A-Za-z0-9._/@:-]{1,160}$/;
const OPERATIONAL_ACTION_EVIDENCE_REF_PATH_SEGMENT = /(?:^|[:\/\\])\.{1,2}(?:[\/\\]|$)/;
const SECRET_LIKE_OPERATIONAL_ACTION_REF =
  /\b(?:sk-[A-Za-z0-9_-]{8,}|(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|(?:api|secret|token|credential)[_-]?(?:key|token|secret)?[:=])/i;
const OPERATIONAL_ACTION_READINESS_MAX_TTL_MS = 5 * 60 * 1000;
const OPERATIONAL_ACTION_READINESS_ALLOWED_FUTURE_SKEW_MS = 60 * 1000;
const OPERATIONAL_ACTION_MAX_EVIDENCE_REFS = 24;
const OPERATIONAL_ACTION_METADATA_MAX_DEPTH = 48;
const OPERATIONAL_ACTION_METADATA_MAX_NODES = 1200;
const OPERATIONAL_ACTION_IDENTIFIER =
  /^[a-z0-9](?:[a-z0-9._/@:,-]{0,198}[a-z0-9])?$/;
const OPERATIONAL_ACTION_IDENTIFIER_REPEATED_SEPARATOR = /[._/@:,-]{2,}/;
const OPERATIONAL_ACTION_IDENTIFIER_PATH_SEGMENT = /(?:^|[/\\])\.{1,2}(?:[/\\]|$)/;
const OPERATIONAL_ACTION_MERGE_HEAD_SHA_EVIDENCE = /^evidence:merge-head-sha-[a-f0-9]{40}$/;
const OPERATIONAL_ACTION_MERGE_BASE_EVIDENCE = /^evidence:merge-base-[a-z0-9._/@:-]{1,120}$/;
const OPERATIONAL_ACTION_MERGE_PR_EVIDENCE = /^evidence:merge-pr-[0-9]{1,10}$/;
const OPERATIONAL_ACTION_MERGE_CHECKS_SCOPED_EVIDENCE = /^evidence:merge-checks-(?:passed|green)-head-([a-f0-9]{40}):pr-([0-9]{1,10})$/;
const OPERATIONAL_ACTION_MERGE_REVIEW_THREADS_SCOPED_EVIDENCE = /^evidence:merge-review-threads-(?:resolved|none)-head-([a-f0-9]{40}):pr-([0-9]{1,10})$/;
const OPERATIONAL_ACTION_MERGE_MERGEABILITY_EVIDENCE = /^evidence:merge-mergeable$/;
const OPERATIONAL_ACTION_MERGE_NON_DRAFT_EVIDENCE = /^evidence:merge-pr-non-draft$/;
const OPERATIONAL_ACTION_MERGE_REQUESTED_CHANGES_EVIDENCE = /^evidence:merge-requested-changes-cleared$/;
const OPERATIONAL_ACTION_MERGE_EXPECTED_BASE_POLICY_EVIDENCE = /^evidence:merge-expected-base-policy-[a-z0-9._/@:-]{1,80}$/;
const OPERATIONAL_ACTION_MERGE_HIGH_RISK_DIFF_EVIDENCE = /^evidence:merge-high-risk-diff-excluded$/;
const OPERATIONAL_ACTION_MERGE_LOCAL_VERIFICATION_EVIDENCE =
  /^verification:merge-local-head-[a-f0-9]{40}:base-[a-z0-9._/@:-]{1,80}:pr-[0-9]{1,10}$/;
const OPERATIONAL_ACTION_PUSH_BRANCH_REF_EVIDENCE = /^evidence:push-branch-ref-[a-z0-9._/@:-]{1,120}$/;
const OPERATIONAL_ACTION_PUSH_BRANCH_REMOTE_EVIDENCE = /^evidence:push-branch-remote-[a-z0-9._/@:-]{1,80}$/;
const OPERATIONAL_ACTION_PUSH_BRANCH_HEAD_EVIDENCE = /^evidence:push-branch-head-sha-[a-f0-9]{40}$/;
const OPERATIONAL_ACTION_PUSH_BRANCH_RESULT_EVIDENCE = /^evidence:push-branch-result-(?:pushed|up-to-date)$/;
const OPERATIONAL_ACTION_OPEN_PR_BRANCH_EVIDENCE = /^evidence:open-pr-branch-[a-z0-9._/@:-]{1,120}$/;
const OPERATIONAL_ACTION_OPEN_PR_BASE_EVIDENCE = /^evidence:open-pr-base-[a-z0-9._/@:-]{1,120}$/;
const OPERATIONAL_ACTION_OPEN_PR_IDENTITY_EVIDENCE = /^evidence:open-pr-pr-[0-9]{1,10}$/;
const OPERATIONAL_ACTION_OPEN_PR_RESULT_EVIDENCE = /^evidence:open-pr-result-(?:opened|existing)$/;
const OPERATIONAL_ACTION_DELETE_BRANCH_REF_EVIDENCE = /^evidence:delete-branch-ref-[a-z0-9._/@:-]{1,120}$/;
const OPERATIONAL_ACTION_DELETE_BRANCH_HEAD_EVIDENCE = /^evidence:delete-branch-head-sha-[a-f0-9]{40}$/;
const OPERATIONAL_ACTION_DELETE_BRANCH_RESULT_EVIDENCE = /^evidence:delete-branch-result-(?:deleted|absent)$/;
const OPERATIONAL_ACTION_DELETE_BRANCH_MERGED_PR_EVIDENCE = /^evidence:delete-branch-merged-pr-[0-9]{1,10}$/;
const OPERATIONAL_ACTION_DELETE_BRANCH_LANE_OWNER_EVIDENCE = /^evidence:delete-branch-lane-owner-[a-z0-9._/@:-]{1,120}$/;
const OPERATIONAL_ACTION_DELETE_BRANCH_LOCAL_SHA_EVIDENCE = /^evidence:delete-branch-local-sha-[a-f0-9]{40}$/;
const OPERATIONAL_ACTION_DELETE_BRANCH_REMOTE_SHA_EVIDENCE = /^evidence:delete-branch-remote-sha-[a-f0-9]{40}$/;
const OPERATIONAL_ACTION_DELETE_BRANCH_DELIVERY_HEAD_EVIDENCE = /^evidence:delete-branch-delivery-head-match-[a-f0-9]{40}$/;
const OPERATIONAL_ACTION_CLEANUP_WORKSPACE_EVIDENCE = /^evidence:cleanup-workspace-[a-z0-9._/@:-]{1,120}$/;
const OPERATIONAL_ACTION_CLEANUP_PR_EVIDENCE = /^evidence:cleanup-pr-[0-9]{1,10}$/;
const OPERATIONAL_ACTION_CLEANUP_HEAD_EVIDENCE = /^evidence:cleanup-head-sha-[a-f0-9]{40}$/;
const OPERATIONAL_ACTION_CLEANUP_DRY_RUN_EVIDENCE = /^evidence:cleanup-dry-run$/;
const OPERATIONAL_ACTION_CLEANUP_RESULT_EVIDENCE = /^evidence:cleanup-result-(?:removed|already-clean|clean)$/;
const OPERATIONAL_ACTION_CLEANUP_MERGED_PR_EVIDENCE = /^evidence:cleanup-merged-pr-[0-9]{1,10}$/;
const OPERATIONAL_ACTION_CLEANUP_LANE_OWNER_EVIDENCE = /^evidence:cleanup-lane-owner-[a-z0-9._/@:-]{1,120}$/;
const OPERATIONAL_ACTION_CLEANUP_WORKTREE_IDENTITY_EVIDENCE = /^evidence:cleanup-worktree-identity-[a-z0-9._/@:-]{1,120}$/;
const OPERATIONAL_ACTION_CLEANUP_LOCAL_BRANCH_SHA_EVIDENCE = /^evidence:cleanup-local-branch-sha-[a-f0-9]{40}$/;
const OPERATIONAL_ACTION_CLEANUP_REMOTE_BRANCH_SHA_EVIDENCE = /^evidence:cleanup-remote-branch-sha-[a-f0-9]{40}$/;
const OPERATIONAL_ACTION_CLEANUP_DELIVERY_HEAD_EVIDENCE = /^evidence:cleanup-delivery-head-match-[a-f0-9]{40}$/;
const OPERATIONAL_ACTION_DISPATCH_APPLY_LANE_EVIDENCE = /^evidence:dispatch-apply-lane-[a-z0-9._/@:-]{1,120}$/;
const OPERATIONAL_ACTION_DISPATCH_APPLY_WORKSPACE_EVIDENCE = /^evidence:dispatch-apply-workspace-[a-z0-9._/@:-]{1,120}$/;
const OPERATIONAL_ACTION_DISPATCH_APPLY_RESULT_EVIDENCE = /^evidence:dispatch-apply-result-(?:claimed|already-claimed)$/;
const OPERATIONAL_ACTION_KILL_WORKER_TARGET_EVIDENCE = /^evidence:kill-worker-target-[a-z0-9._/@:-]{1,120}$/;
const OPERATIONAL_ACTION_KILL_WORKER_RESULT_EVIDENCE = /^evidence:kill-worker-result-(?:terminated|already-stopped)$/;
const OPERATIONAL_ACTION_MUTATE_SOURCE_REF_EVIDENCE = /^evidence:mutate-source-ref-[a-z0-9._/@:-]{1,120}$/;
const OPERATIONAL_ACTION_MUTATE_SOURCE_RESULT_EVIDENCE = /^evidence:mutate-source-result-(?:updated|already-current)$/;
const OPERATIONAL_ACTION_RETRY_VERIFICATION_REF_EVIDENCE = /^evidence:retry-verification-ref-[a-z0-9._/@:-]{1,120}$/;
const OPERATIONAL_ACTION_RETRY_VERIFICATION_RESULT_EVIDENCE = /^evidence:retry-verification-result-(?:queued|restarted)$/;
const OPERATIONAL_ACTION_REQUEUE_ITEM_EVIDENCE = /^evidence:requeue-item-[a-z0-9._/@:-]{1,120}$/;
const OPERATIONAL_ACTION_REQUEUE_RESULT_EVIDENCE = /^evidence:requeue-result-(?:queued|already-queued)$/;
const OPERATIONAL_ACTION_PROVIDER_CHANGE_TARGET_EVIDENCE = /^evidence:provider-change-target-[a-z0-9._/@:-]{1,120}$/;
const OPERATIONAL_ACTION_PROVIDER_CHANGE_RESULT_EVIDENCE = /^evidence:provider-change-result-(?:updated|unchanged|rotated)$/;

const OPERATIONAL_ACTION_RISK_RANK: Record<PipelineOperationalActionRiskTierV0, number> = {
  low: 0,
  medium: 1,
  high: 2,
  extreme: 3,
};

const PIPELINE_OPERATIONAL_ACTION_POLICY: Record<
  PipelineOperationalActionIdV0,
  {
    targetTypes: readonly PipelineOperationalActionTargetTypeV0[];
    minimumRiskTier: PipelineOperationalActionRiskTierV0;
    allowedAuthorityAllowed: boolean;
    requiredAuthorityStates: readonly PipelineOperationalActionRequestedAuthorityStateV0[];
  }
> = {
  inspect: { targetTypes: ["manager_run", "work_packet", "projection"], minimumRiskTier: "low", allowedAuthorityAllowed: true, requiredAuthorityStates: [] },
  refresh_projection: { targetTypes: ["projection"], minimumRiskTier: "low", allowedAuthorityAllowed: true, requiredAuthorityStates: [] },
  dispatch_apply: { targetTypes: ["work_item", "candidate_work"], minimumRiskTier: "high", allowedAuthorityAllowed: true, requiredAuthorityStates: ["needs_authority_approval"] },
  mark_viewed: { targetTypes: ["work_packet"], minimumRiskTier: "low", allowedAuthorityAllowed: false, requiredAuthorityStates: ["needs_product_approval"] },
  retry_verification: { targetTypes: ["execution_attempt", "work_item"], minimumRiskTier: "medium", allowedAuthorityAllowed: false, requiredAuthorityStates: ["needs_authority_approval"] },
  requeue: { targetTypes: ["work_item"], minimumRiskTier: "medium", allowedAuthorityAllowed: false, requiredAuthorityStates: ["needs_authority_approval"] },
  mark_tested: { targetTypes: ["work_packet"], minimumRiskTier: "medium", allowedAuthorityAllowed: false, requiredAuthorityStates: ["needs_product_approval"] },
  request_rework: { targetTypes: ["work_packet"], minimumRiskTier: "medium", allowedAuthorityAllowed: false, requiredAuthorityStates: ["needs_product_approval"] },
  pause: { targetTypes: ["runtime", "manager_run"], minimumRiskTier: "low", allowedAuthorityAllowed: true, requiredAuthorityStates: [] },
  drain: { targetTypes: ["runtime", "manager_run"], minimumRiskTier: "medium", allowedAuthorityAllowed: false, requiredAuthorityStates: ["needs_authority_approval"] },
  reassign: { targetTypes: ["work_packet"], minimumRiskTier: "medium", allowedAuthorityAllowed: false, requiredAuthorityStates: ["needs_authority_approval"] },
  reject: { targetTypes: ["work_packet"], minimumRiskTier: "medium", allowedAuthorityAllowed: false, requiredAuthorityStates: ["needs_product_approval"] },
  kill_worker: { targetTypes: ["worker"], minimumRiskTier: "high", allowedAuthorityAllowed: false, requiredAuthorityStates: ["needs_authority_approval"] },
  mutate_source: { targetTypes: ["work_packet"], minimumRiskTier: "high", allowedAuthorityAllowed: false, requiredAuthorityStates: ["needs_authority_approval"] },
  push_branch: { targetTypes: ["branch"], minimumRiskTier: "high", allowedAuthorityAllowed: false, requiredAuthorityStates: ["needs_authority_approval"] },
  open_pr: { targetTypes: ["branch"], minimumRiskTier: "high", allowedAuthorityAllowed: false, requiredAuthorityStates: ["needs_authority_approval"] },
  merge: { targetTypes: ["branch"], minimumRiskTier: "extreme", allowedAuthorityAllowed: false, requiredAuthorityStates: ["needs_safety_approval"] },
  delete_branch: { targetTypes: ["branch"], minimumRiskTier: "extreme", allowedAuthorityAllowed: false, requiredAuthorityStates: ["needs_safety_approval"] },
  cleanup: { targetTypes: ["workspace"], minimumRiskTier: "extreme", allowedAuthorityAllowed: false, requiredAuthorityStates: ["needs_safety_approval"] },
  credential_or_provider_change: { targetTypes: ["runtime"], minimumRiskTier: "extreme", allowedAuthorityAllowed: false, requiredAuthorityStates: ["needs_resource_approval"] },
};

export function isPipelineOperationalActionIdV0(value: unknown): value is PipelineOperationalActionIdV0 {
  return typeof value === "string" && (PIPELINE_OPERATIONAL_ACTION_IDS as readonly string[]).includes(value);
}

export function isPipelineOperationalActionEvidenceRefsV0(value: unknown): value is PipelineOperationalActionEvidenceRefsV0 {
  try {
    const refs = safeOperationalUnknownArray(value);
    if (!refs) return false;
    return refs.length > 0 && refs.length <= OPERATIONAL_ACTION_MAX_EVIDENCE_REFS && refs.every((ref) => {
      if (typeof ref !== "string") return false;
      const trimmed = ref.trim();
      return (
        trimmed === ref &&
        trimmed.length <= 180 &&
        OPERATIONAL_ACTION_EVIDENCE_REF.test(trimmed) &&
        !OPERATIONAL_ACTION_EVIDENCE_REF_PATH_SEGMENT.test(trimmed) &&
        !FORBIDDEN_OPERATIONAL_ACTION_METADATA.test(trimmed) &&
        !SECRET_LIKE_OPERATIONAL_ACTION_REF.test(trimmed)
      );
    });
  } catch {
    return false;
  }
}

export function validatePipelineOperationalActionRequestV0(request: unknown): PipelineOperationalActionValidationIssueV0[] {
  const issues: PipelineOperationalActionValidationIssueV0[] = [];
  const record = operationalActionRecord(request, issues);
  pushUnknownFieldIssues(issues, record, OPERATIONAL_ACTION_REQUEST_KEYS);
  validateOperationalSchemaAndRetention(issues, record, PIPELINE_OPERATIONAL_ACTION_SCHEMA_VERSION, true);
  pushOperationalActionCommonIssues(issues, record);
  pushEnumIssue(issues, "requestedAuthorityState", record.requestedAuthorityState, PIPELINE_OPERATIONAL_ACTION_AUTHORITY_STATES);
  pushEnumIssue(issues, "requestedRiskTier", record.requestedRiskTier, PIPELINE_OPERATIONAL_ACTION_RISK_TIERS);
  pushRequestedByIssues(issues, record.requestedBy);
  pushActionPolicyIssues(issues, record, "request");
  if ((record as { authorityState?: unknown }).authorityState === "allowed" || record.requestedAuthorityState === "allowed") {
    issues.push({
      field: "requestedAuthorityState",
      code: "request_cannot_self_authorize",
      summary: "Operational action requests cannot self-assert allowed authority.",
    });
  }
  if (record.operatorIntentSummary !== undefined && record.operatorIntentSummary !== null && typeof record.operatorIntentSummary !== "string") {
    issues.push({
      field: "operatorIntentSummary",
      code: "unsafe_metadata_retention",
      summary: "Operator intent summaries must be strings when present.",
    });
  } else if (typeof record.operatorIntentSummary === "string" && !isSafeOperationalMetadataText(record.operatorIntentSummary)) {
    issues.push({
      field: "operatorIntentSummary",
      code: "unsafe_metadata_retention",
      summary: "Operator intent summaries must not retain raw prompts, provider payloads, secrets, credentials, or terminal scrollback.",
    });
  }
  return issues;
}

export function validatePipelineOperationalActionResultV0(result: unknown): PipelineOperationalActionValidationIssueV0[] {
  const issues: PipelineOperationalActionValidationIssueV0[] = [];
  const record = operationalActionRecord(result, issues);
  pushUnknownFieldIssues(issues, record, OPERATIONAL_ACTION_RESULT_KEYS);
  validateOperationalSchemaAndRetention(issues, record, PIPELINE_OPERATIONAL_ACTION_SCHEMA_VERSION, true);
  pushOperationalActionCommonIssues(issues, record);
  pushEnumIssue(issues, "outcome", record.outcome, PIPELINE_OPERATIONAL_ACTION_OUTCOMES);
  pushEnumIssue(issues, "resultingStage", record.resultingStage, [...AUTHORITATIVE_PACKET_STAGES, "terminal", "deferred", "unknown"]);
  pushEnumIssue(issues, "resultingStatus", record.resultingStatus, [...AUTHORITATIVE_PACKET_STATUSES, "unknown"]);
  pushCapabilityStateIssues(issues, record);
  pushActionPolicyIssues(issues, record, "result");
  if (record.outcome === "succeeded" && (record.authorityState !== "allowed" || record.capabilityState !== "available")) {
    issues.push({
      field: "outcome",
      code: "inconsistent_result",
      summary: "Succeeded operational action results require allowed authority and available capability.",
    });
  }
  if (record.outcome === "succeeded" && record.capabilityState === "available" && record.authorityState === "allowed" && record.typedReason !== null) {
    issues.push({
      field: "typedReason",
      code: "inconsistent_result",
      summary: "Successful available operational action results must not carry failure typed reasons.",
    });
  }
  if (
    record.authorityState === "allowed" &&
    isPipelineOperationalActionIdV0(record.actionId) &&
    !hasRequiredOperationalApprovalEvidence(record.actionId, record.evidenceRefs, record)
  ) {
    issues.push({
      field: "evidenceRefs",
      code: "policy_violation",
      summary: "Successful high-risk operational action results require approval-family evidence.",
    });
  }
  if (
    record.outcome !== "succeeded" &&
    record.authorityState === "allowed" &&
    !isAllowedFailedOperationalResult(record)
  ) {
    issues.push({
      field: "authorityState",
      code: "inconsistent_result",
      summary: "Only approved operational action failures can carry allowed authority; blocked, rejected, or simulated results cannot claim allowed authority.",
    });
  }
  pushOutcomeStateConsistencyIssues(issues, record);
  if (
    record.actionId === "merge" &&
    record.outcome === "succeeded" &&
    record.authorityState === "allowed" &&
    !hasRequiredMergeSuccessEvidence(record.evidenceRefs, record)
  ) {
    issues.push({
      field: "evidenceRefs",
      code: "policy_violation",
      summary: "Successful merge results require exact head, base, PR, checks, review-thread, mergeability, and local verification evidence.",
    });
  }
  if (
    record.outcome === "succeeded" &&
    record.authorityState === "allowed" &&
    isPipelineOperationalActionIdV0(record.actionId) &&
    !hasRequiredActionSuccessEvidence(record.actionId, record.evidenceRefs, record)
  ) {
    issues.push({
      field: "evidenceRefs",
      code: "policy_violation",
      summary: "Successful delivery and cleanup results require action-specific result evidence.",
    });
  }
  if (
    isOneOfString(record.outcome, ["blocked", "failed", "rejected", "simulated"]) &&
    !isKnownOperationalTypedReason(record.typedReason)
  ) {
    issues.push({
      field: "typedReason",
      code: "inconsistent_result",
      summary: "Blocked, failed, rejected, or simulated operational action results require a typed reason.",
    });
  }
  if (isOneOfString(record.capabilityState, ["unavailable", "gated", "simulated"]) && !isKnownOperationalTypedReason(record.typedReason)) {
    issues.push({
      field: "typedReason",
      code: "inconsistent_result",
      summary: "Unavailable, gated, or simulated operational action results require a typed reason.",
    });
  }
  return issues;
}

function isAllowedFailedOperationalResult(record: Record<string, unknown>): boolean {
  return (
    record.outcome === "failed" &&
    record.capabilityState === "available" &&
    isPipelineOperationalActionIdV0(record.actionId) &&
    hasRequiredOperationalApprovalEvidence(record.actionId, record.evidenceRefs, record) &&
    safeOperationalStringArray(record.evidenceRefs)?.includes(operationalActionContextEvidenceRef(record.actionId, record)) === true
  );
}

export function validatePipelineOperationalActionCapabilityV0(capability: unknown): PipelineOperationalActionValidationIssueV0[] {
  const issues: PipelineOperationalActionValidationIssueV0[] = [];
  const record = operationalActionRecord(capability, issues);
  pushUnknownFieldIssues(issues, record, OPERATIONAL_ACTION_CAPABILITY_KEYS);
  validateOperationalSchemaAndRetention(issues, record, null, true);
  if (!isPipelineOperationalActionIdV0(record.actionId)) {
    issues.push({ field: "actionId", code: "unknown_action_id", summary: "Operational action capability uses an unknown built-in action id." });
  }
  if (!isPipelineOperationalActionEvidenceRefsV0(record.evidenceRefs)) {
    issues.push({ field: "evidenceRefs", code: "evidence_required", summary: "Operational action capabilities require safe metadata evidence refs." });
  }
  pushEnumIssue(issues, "targetType", record.targetType, PIPELINE_OPERATIONAL_ACTION_TARGET_TYPES);
  pushCapabilityStateIssues(issues, record);
  pushActionPolicyIssues(issues, record, "capability");
  pushRequiredCapabilityGuardIssues(issues, record);
  if (record.targetId !== undefined && record.targetId !== null && (typeof record.targetId !== "string" || !isSafeOperationalIdentifierText(record.targetId))) {
    issues.push({ field: "targetId", code: "unsafe_metadata_retention", summary: "Operational action capability target ids must be safe metadata text." });
  }
  if (requiresOperationalCapabilityTargetId(record) && (typeof record.targetId !== "string" || !isSafeOperationalIdentifierText(record.targetId))) {
    issues.push({ field: "targetId", code: "blank_identifier", summary: "Available mutating or high-risk operational action capabilities require a safe current target id." });
  }
  if (record.capabilityState === "available" && record.authorityState === "allowed" && record.typedReason !== null) {
    issues.push({
      field: "typedReason",
      code: "inconsistent_result",
      summary: "Available operational action capabilities must not carry failure typed reasons.",
    });
  }
  if (
    record.capabilityState === "available" &&
    record.authorityState === "allowed" &&
    isPipelineOperationalActionIdV0(record.actionId) &&
    !hasRequiredOperationalCapabilityApprovalEvidence(record.actionId, record.evidenceRefs, record)
  ) {
    issues.push({
      field: "evidenceRefs",
      code: "policy_violation",
      summary: "Available high-risk operational action capabilities require capability approval evidence.",
    });
  }
  if (isOneOfString(record.capabilityState, ["unavailable", "gated", "simulated"]) && !isKnownOperationalTypedReason(record.typedReason)) {
    issues.push({
      field: "typedReason",
      code: "inconsistent_result",
      summary: "Unavailable, gated, or simulated operational action capabilities require a typed reason.",
    });
  }
  if (typeof record.expectedResultSummary !== "string" || !isSafeOperationalMetadataText(record.expectedResultSummary)) {
    issues.push({
      field: "expectedResultSummary",
      code: "unsafe_metadata_retention",
      summary: "Expected result summaries must be non-empty metadata and cannot retain raw payloads.",
    });
  }
  return issues;
}

export function validatePipelineOperationalRuntimeReadinessV0(readiness: unknown): PipelineOperationalActionValidationIssueV0[] {
  const issues: PipelineOperationalActionValidationIssueV0[] = [];
  const record = operationalActionRecord(readiness, issues);
  pushUnknownFieldIssues(issues, record, OPERATIONAL_RUNTIME_READINESS_KEYS);
  validateOperationalSchemaAndRetention(issues, record, PIPELINE_OPERATIONAL_RUNTIME_READINESS_SCHEMA_VERSION, true);
  if (record.actionSchemaVersion !== PIPELINE_OPERATIONAL_ACTION_SCHEMA_VERSION) {
    issues.push({ field: "actionSchemaVersion", code: "bad_schema_version", summary: "Operational runtime readiness requires the current action schema version." });
  }
  if (!isPipelineOperationalActionEvidenceRefsV0(record.evidenceRefs)) {
    issues.push({ field: "evidenceRefs", code: "evidence_required", summary: "Operational runtime readiness requires safe metadata evidence refs." });
  }
  pushEnumIssue(issues, "readinessState", record.readinessState, PIPELINE_OPERATIONAL_RUNTIME_READINESS_STATES);
  pushEnumIssue(issues, "operationalMode", record.operationalMode, PIPELINE_OPERATIONAL_RUNTIME_MODES);
  pushEnumIssue(issues, "freshnessState", record.freshnessState, ["live", "stale", "unavailable", "unknown"]);
  pushEnumIssue(issues, "capabilityState", record.capabilityState, PIPELINE_OPERATIONAL_ACTION_CAPABILITY_STATES);
  pushTypedReasonIssue(issues, "typedReason", record.typedReason);
  if (typeof record.summary !== "string" || !isSafeOperationalMetadataText(record.summary)) {
    issues.push({
      field: "summary",
      code: "unsafe_metadata_retention",
      summary: "Operational runtime readiness summaries must be non-empty safe metadata text.",
    });
  }
  const checkedAtMs = typeof record.checkedAt === "string" ? Date.parse(record.checkedAt) : NaN;
  const expiresAtMs = typeof record.expiresAt === "string" ? Date.parse(record.expiresAt) : NaN;
  const nowMs = Date.now();
  const freshnessState = typeof record.freshnessState === "string" ? record.freshnessState : "";
  if (
    !Number.isFinite(checkedAtMs) ||
    !Number.isFinite(expiresAtMs) ||
    checkedAtMs > expiresAtMs ||
    checkedAtMs > nowMs + OPERATIONAL_ACTION_READINESS_ALLOWED_FUTURE_SKEW_MS ||
    expiresAtMs - checkedAtMs > OPERATIONAL_ACTION_READINESS_MAX_TTL_MS ||
    expiresAtMs <= nowMs ||
    (record.readinessState === "ready" && freshnessState !== "live")
  ) {
    issues.push({
      field: "checkedAt",
      code: "stale_or_unparseable_readiness",
      summary: "Operational runtime readiness requires parseable fresh checkedAt/expiresAt evidence.",
    });
  }
  if (record.readinessState === "ready" && record.capabilityState === "available" && record.typedReason !== null) {
    issues.push({
      field: "typedReason",
      code: "inconsistent_result",
      summary: "Ready operational runtime readiness must not carry failure typed reasons.",
    });
  }
  if (record.readinessState === "ready" && record.capabilityState !== "available") {
    issues.push({
      field: "capabilityState",
      code: "inconsistent_result",
      summary: "Ready operational runtime readiness requires available capability.",
    });
  }
  if (record.capabilityState === "available" && (record.readinessState !== "ready" || freshnessState !== "live")) {
    issues.push({
      field: "capabilityState",
      code: "inconsistent_result",
      summary: "Available aggregate operational capability requires ready runtime readiness and live freshness.",
    });
  }
  if (record.readinessState === "ready" && isOneOfString(record.operationalMode, ["disabled", "unavailable"])) {
    issues.push({
      field: "operationalMode",
      code: "inconsistent_result",
      summary: "Ready operational runtime readiness cannot use disabled or unavailable operational mode.",
    });
  }
  if (
    (isOneOfString(record.readinessState, ["degraded", "blocked", "unavailable"]) ||
      isOneOfString(record.operationalMode, ["disabled", "unavailable"]) ||
      ["stale", "unavailable"].includes(freshnessState) ||
      record.readinessState === "unknown" ||
      record.operationalMode === "unknown" ||
      freshnessState === "unknown" ||
      isOneOfString(record.capabilityState, ["gated", "unavailable", "simulated"])) &&
    !isKnownOperationalTypedReason(record.typedReason)
  ) {
    issues.push({
      field: "typedReason",
      code: "inconsistent_result",
      summary: "Degraded, blocked, unavailable, gated, or simulated operational runtime readiness requires a typed reason.",
    });
  }
  const actionCapabilities = safeOperationalArrayValues(issues, record.actionCapabilities, "actionCapabilities");
  if (!actionCapabilities) {
    issues.push({
      field: "actionCapabilities",
      code: "invalid_enum",
      summary: "Operational runtime readiness requires an actionCapabilities array.",
    });
  } else {
    for (const [index, capability] of actionCapabilities.entries()) {
      for (const issue of validatePipelineOperationalActionCapabilityV0(capability)) {
        issues.push({ ...issue, field: `actionCapabilities.${index}.${issue.field}` });
      }
    }
    pushReadinessCapabilityCoverageIssues(issues, actionCapabilities);
    pushReadinessAvailableCapabilityIssues(issues, record, actionCapabilities);
    pushReadinessOperationalModeCapabilityIssues(issues, record, actionCapabilities);
  }
  return issues;
}

export function validatePipelineOperationalReadinessContractV0(contract: unknown): PipelineOperationalActionValidationIssueV0[] {
  const issues: PipelineOperationalActionValidationIssueV0[] = [];
  const record = operationalActionRecord(contract, issues);
  const allowed = new Set([
    "schemaVersion", "target", "backendTruth", "authorityState", "riskTier", "sliSlo", "telemetry",
    "configuration", "recovery", "gates", "outcome", "typedBlockers", "checkedAt", "expiresAt",
    "metadataOnly", "rawPayloadRetained",
  ]);
  pushUnknownFieldIssues(issues, record, allowed);
  if (record.schemaVersion !== PIPELINE_OPERATIONAL_READINESS_CONTRACT_SCHEMA_VERSION) {
    issues.push({ field: "schemaVersion", code: "bad_schema_version", summary: "Readiness contract uses an unsupported schema version." });
  }
  if (record.metadataOnly !== true || record.rawPayloadRetained !== false) {
    issues.push({ field: "metadataOnly", code: "bad_retention_flag", summary: "Readiness contract must be metadata-only and retain no raw payloads." });
  }
  pushEnumIssue(issues, "backendTruth", record.backendTruth, PIPELINE_OPERATIONAL_READINESS_BACKEND_TRUTHS);
  pushEnumIssue(issues, "authorityState", record.authorityState, PIPELINE_OPERATIONAL_ACTION_AUTHORITY_STATES);
  pushEnumIssue(issues, "riskTier", record.riskTier, PIPELINE_OPERATIONAL_ACTION_RISK_TIERS);
  pushEnumIssue(issues, "outcome", record.outcome, PIPELINE_OPERATIONAL_READINESS_OUTCOMES);
  const target = operationalActionRecord(record.target, issues, "target");
  for (const field of ["workerId", "assignmentId", "owner", "runId"] as const) {
    if (typeof target[field] !== "string" || !isSafeOperationalIdentifierText(target[field])) {
      issues.push({ field: `target.${field}`, code: "blank_identifier", summary: "Readiness target identity must be exact safe metadata." });
    }
  }
  for (const field of ["sourceRefs", "evidenceRefs"] as const) {
    if (!isPipelineOperationalActionEvidenceRefsV0(target[field])) {
      issues.push({ field: `target.${field}`, code: "evidence_required", summary: "Readiness target requires safe source/evidence refs." });
    }
  }
  const gates = safeOperationalArrayValues(issues, record.gates, "gates");
  if (!gates) {
    issues.push({ field: "gates", code: "invalid_enum", summary: "Readiness contract requires a gate array." });
  } else {
    const seen = new Set<string>();
    for (const [index, gateValue] of gates.entries()) {
      const gate = operationalActionRecord(gateValue, issues, `gates.${index}`);
      if (typeof gate.gateId !== "string" || !isSafeOperationalIdentifierText(gate.gateId) || seen.has(gate.gateId)) {
        issues.push({ field: `gates.${index}.gateId`, code: "invalid_enum", summary: "Readiness gates require unique safe ids." });
      }
      if (typeof gate.gateId === "string") seen.add(gate.gateId);
      pushEnumIssue(issues, `gates.${index}.state`, gate.state, PIPELINE_OPERATIONAL_READINESS_GATE_STATES);
      if (gate.typedReason !== null && !isOneOfString(gate.typedReason, PIPELINE_OPERATIONAL_READINESS_REASONS)) {
        issues.push({ field: `gates.${index}.typedReason`, code: "invalid_enum", summary: "Readiness gate reason is not recognized." });
      }
      if (typeof gate.nextAction !== "string" || !isSafeOperationalMetadataText(gate.nextAction)) {
        issues.push({ field: `gates.${index}.nextAction`, code: "unsafe_metadata_retention", summary: "Readiness gate next action must be safe metadata." });
      }
      if (!isPipelineOperationalActionEvidenceRefsV0(gate.evidenceRefs)) {
        issues.push({ field: `gates.${index}.evidenceRefs`, code: "evidence_required", summary: "Readiness gate requires safe evidence refs." });
      }
    }
  }
  const checkedAtMs = typeof record.checkedAt === "string" ? Date.parse(record.checkedAt) : NaN;
  const expiresAtMs = typeof record.expiresAt === "string" ? Date.parse(record.expiresAt) : NaN;
  if (!Number.isFinite(checkedAtMs) || !Number.isFinite(expiresAtMs) || expiresAtMs <= checkedAtMs || expiresAtMs - checkedAtMs > OPERATIONAL_ACTION_READINESS_MAX_TTL_MS || checkedAtMs > Date.now() + OPERATIONAL_ACTION_READINESS_ALLOWED_FUTURE_SKEW_MS) {
    issues.push({ field: "checkedAt", code: "stale_or_unparseable_readiness", summary: "Readiness contract timestamps must be fresh and within the five-minute TTL." });
  }
  if (!Array.isArray(record.sliSlo) || record.sliSlo.length === 0) {
    issues.push({ field: "sliSlo", code: "evidence_required", summary: "Readiness contract requires explicit SLI/SLO thresholds." });
  }
  const telemetry = operationalActionRecord(record.telemetry, issues, "telemetry");
  if (typeof telemetry.source !== "string" || !isSafeOperationalIdentifierText(telemetry.source) || telemetry.alertReady !== true) {
    issues.push({ field: "telemetry", code: "inconsistent_result", summary: "Readiness telemetry and alert coverage must be explicit and ready." });
  }
  const configuration = operationalActionRecord(record.configuration, issues, "configuration");
  if (configuration.noValueRetention !== true || !Array.isArray(configuration.names) || configuration.validationState !== "pass") {
    issues.push({ field: "configuration", code: "policy_violation", summary: "Configuration readiness must pass with allowlisted names and no value retention." });
  }
  const recovery = operationalActionRecord(record.recovery, issues, "recovery");
  for (const field of ["owner", "rollbackPath", "remediationAction", "recheckAt", "expiryAt"] as const) {
    if (typeof recovery[field] !== "string" || !isSafeOperationalMetadataText(recovery[field])) {
      issues.push({ field: `recovery.${field}`, code: "policy_violation", summary: "Recovery and rollback metadata is required." });
    }
  }
  const blockers = Array.isArray(record.typedBlockers) ? record.typedBlockers : [];
  if (record.outcome === "go" && blockers.length > 0) {
    issues.push({ field: "typedBlockers", code: "inconsistent_result", summary: "A go readiness outcome cannot contain blockers." });
  }
  if (record.outcome === "go" && record.backendTruth !== "live") {
    issues.push({ field: "backendTruth", code: "inconsistent_result", summary: "Go requires proven live backend truth." });
  }
  return issues;
}

export function validatePipelineOneWorkerLiveCanaryEvidenceV0(evidence: unknown): PipelineOperationalActionValidationIssueV0[] {
  const issues: PipelineOperationalActionValidationIssueV0[] = [];
  const record = operationalActionRecord(evidence, issues);
  if (record.schemaVersion !== PIPELINE_ONE_WORKER_LIVE_CANARY_SCHEMA_VERSION) {
    issues.push({ field: "schemaVersion", code: "bad_schema_version", summary: "One-worker canary evidence uses an unsupported schema version." });
  }
  if (record.metadataOnly !== true || record.rawPayloadRetained !== false) {
    issues.push({ field: "metadataOnly", code: "bad_retention_flag", summary: "One-worker canary evidence must be metadata-only and retain no raw payloads." });
  }
  pushEnumIssue(issues, "backendTruth", record.backendTruth, PIPELINE_OPERATIONAL_READINESS_BACKEND_TRUTHS);
  pushEnumIssue(issues, "outcome", record.outcome, PIPELINE_ONE_WORKER_LIVE_CANARY_OUTCOMES);
  if (record.workerCount !== 1) issues.push({ field: "workerCount", code: "invalid_enum", summary: "Canary evidence must cover exactly one worker." });
  const target = operationalActionRecord(record.target, issues, "target");
  for (const field of ["workerId", "assignmentId", "owner", "runId"] as const) {
    if (typeof target[field] !== "string" || !isSafeOperationalIdentifierText(target[field])) {
      issues.push({ field: `target.${field}`, code: "blank_identifier", summary: "Canary target identity must be exact safe metadata." });
    }
  }
  for (const field of ["sourceRefs", "evidenceRefs"] as const) {
    if (!isPipelineOperationalActionEvidenceRefsV0(target[field])) {
      issues.push({ field: `target.${field}`, code: "evidence_required", summary: "Canary target requires safe source/evidence refs." });
    }
  }
  const measurements = operationalActionRecord(record.measurements, issues, "measurements");
  for (const field of ["latencyMs", "errorCount", "cpuPercent", "memoryPercent", "diskPercent", "costCents"] as const) {
    if (measurements[field] !== null && (typeof measurements[field] !== "number" || measurements[field] < 0)) {
      issues.push({ field: `measurements.${field}`, code: "invalid_enum", summary: "Canary measurements must be non-negative numeric metadata." });
    }
  }
  const gates = safeOperationalArrayValues(issues, record.gates, "gates");
  if (!gates || gates.length < 10) issues.push({ field: "gates", code: "evidence_required", summary: "Canary evidence requires its bounded gate set." });
  const checkedAtMs = typeof record.checkedAt === "string" ? Date.parse(record.checkedAt) : NaN;
  const expiresAtMs = typeof record.expiresAt === "string" ? Date.parse(record.expiresAt) : NaN;
  if (!Number.isFinite(checkedAtMs) || !Number.isFinite(expiresAtMs) || expiresAtMs <= checkedAtMs || expiresAtMs - checkedAtMs > OPERATIONAL_ACTION_READINESS_MAX_TTL_MS) {
    issues.push({ field: "checkedAt", code: "stale_or_unparseable_readiness", summary: "Canary evidence timestamps must be fresh and bounded." });
  }
  if (record.outcome === "pass" && (record.backendTruth !== "live" || record.rampAllowed !== true || !Array.isArray(record.typedBlockers) || record.typedBlockers.length > 0)) {
    issues.push({ field: "outcome", code: "inconsistent_result", summary: "A passing canary requires live truth, ramp permission, and no blockers." });
  }
  const recovery = record.recovery as Record<string, unknown> | undefined;
  if (record.outcome === "stop" && recovery?.required !== true) {
    issues.push({ field: "recovery", code: "policy_violation", summary: "A stopped canary requires rollback metadata." });
  }
  return issues;
}

export function validatePipelineLiveCapacityRampEvidenceV0(evidence: unknown): PipelineOperationalActionValidationIssueV0[] {
  const issues: PipelineOperationalActionValidationIssueV0[] = [];
  const record = operationalActionRecord(evidence, issues);
  if (record.schemaVersion !== PIPELINE_LIVE_CAPACITY_RAMP_SCHEMA_VERSION) {
    issues.push({ field: "schemaVersion", code: "bad_schema_version", summary: "Live capacity ramp evidence uses an unsupported schema version." });
  }
  if (record.metadataOnly !== true || record.rawPayloadRetained !== false || record.rolloutAllowed !== false) {
    issues.push({ field: "metadataOnly", code: "bad_retention_flag", summary: "Ramp evidence must remain metadata-only with rollout disabled." });
  }
  pushEnumIssue(issues, "outcome", record.outcome, PIPELINE_LIVE_CAPACITY_RAMP_OUTCOMES);
  const stages = safeOperationalArrayValues(issues, record.stages, "stages");
  if (!stages || stages.length === 0) issues.push({ field: "stages", code: "evidence_required", summary: "Ramp evidence requires ordered stage records." });
  for (const [index, stageValue] of (stages || []).entries()) {
    const stage = operationalActionRecord(stageValue, issues, `stages.${index}`);
    if (typeof stage.stageId !== "string" || !isSafeOperationalIdentifierText(stage.stageId)) issues.push({ field: `stages.${index}.stageId`, code: "blank_identifier", summary: "Ramp stage ids must be safe metadata." });
    if (typeof stage.owner !== "string" || !isSafeOperationalIdentifierText(stage.owner)) issues.push({ field: `stages.${index}.owner`, code: "blank_identifier", summary: "Ramp stages require an owner." });
    if (!Array.isArray(stage.evidenceRefs) || !isPipelineOperationalActionEvidenceRefsV0(stage.evidenceRefs)) issues.push({ field: `stages.${index}.evidenceRefs`, code: "evidence_required", summary: "Ramp stages require safe evidence refs." });
  }
  for (const field of ["sourceRefs", "evidenceRefs"] as const) {
    if (!Array.isArray(record[field]) || record[field].length === 0 || !isPipelineOperationalActionEvidenceRefsV0(record[field])) issues.push({ field, code: "evidence_required", summary: "Ramp evidence requires safe source/evidence refs." });
  }
  if (typeof record.nextManagerAction !== "string" || !isSafeOperationalMetadataText(record.nextManagerAction)) issues.push({ field: "nextManagerAction", code: "unsafe_metadata_retention", summary: "Ramp evidence requires a safe next manager action." });
  const checkedAtMs = typeof record.checkedAt === "string" ? Date.parse(record.checkedAt) : NaN;
  const expiresAtMs = typeof record.expiresAt === "string" ? Date.parse(record.expiresAt) : NaN;
  if (!Number.isFinite(checkedAtMs) || !Number.isFinite(expiresAtMs) || expiresAtMs <= checkedAtMs || expiresAtMs - checkedAtMs > OPERATIONAL_ACTION_READINESS_MAX_TTL_MS) issues.push({ field: "checkedAt", code: "stale_or_unparseable_readiness", summary: "Ramp evidence timestamps must be fresh and bounded." });
  if (record.outcome === "pass" && (record.canaryOutcome !== "pass" || record.scaleEvidenceReady !== true || record.rolloutAllowed !== false || !Array.isArray(record.typedBlockers) || record.typedBlockers.length > 0)) issues.push({ field: "outcome", code: "inconsistent_result", summary: "A passing ramp requires a passing canary, complete stage evidence, no blockers, and rollout disabled." });
  const recovery = record.recovery as Record<string, unknown> | undefined;
  if (record.outcome === "stop" && recovery?.required !== true) issues.push({ field: "recovery", code: "policy_violation", summary: "A stopped ramp requires rollback metadata." });
  return issues;
}

export function validatePipelineResilienceRecoveryEvidenceV0(evidence: unknown): PipelineOperationalActionValidationIssueV0[] {
  const issues: PipelineOperationalActionValidationIssueV0[] = [];
  const record = operationalActionRecord(evidence, issues);
  if (record.schemaVersion !== PIPELINE_RESILIENCE_RECOVERY_SCHEMA_VERSION) issues.push({ field: "schemaVersion", code: "bad_schema_version", summary: "Resilience/recovery evidence uses an unsupported schema version." });
  if (record.metadataOnly !== true || record.rawPayloadRetained !== false || record.rolloutAllowed !== false) issues.push({ field: "metadataOnly", code: "bad_retention_flag", summary: "Recovery evidence must remain metadata-only with rollout disabled." });
  pushEnumIssue(issues, "outcome", record.outcome, PIPELINE_RESILIENCE_RECOVERY_OUTCOMES);
  const drills = safeOperationalArrayValues(issues, record.drills, "drills");
  if (!drills || drills.length === 0) issues.push({ field: "drills", code: "evidence_required", summary: "Recovery evidence requires drill records." });
  for (const [index, drillValue] of (drills || []).entries()) {
    const drill = operationalActionRecord(drillValue, issues, `drills.${index}`);
    if (typeof drill.drillId !== "string" || !isSafeOperationalIdentifierText(drill.drillId)) issues.push({ field: `drills.${index}.drillId`, code: "blank_identifier", summary: "Recovery drill ids must be safe metadata." });
    if (typeof drill.owner !== "string" || !isSafeOperationalIdentifierText(drill.owner)) issues.push({ field: `drills.${index}.owner`, code: "blank_identifier", summary: "Recovery drills require an owner." });
    if (!Array.isArray(drill.evidenceRefs) || !isPipelineOperationalActionEvidenceRefsV0(drill.evidenceRefs)) issues.push({ field: `drills.${index}.evidenceRefs`, code: "evidence_required", summary: "Recovery drills require safe evidence refs." });
  }
  for (const field of ["sourceRefs", "evidenceRefs"] as const) {
    if (!Array.isArray(record[field]) || record[field].length === 0 || !isPipelineOperationalActionEvidenceRefsV0(record[field])) issues.push({ field, code: "evidence_required", summary: "Recovery evidence requires safe source/evidence refs." });
  }
  if (typeof record.nextManagerAction !== "string" || !isSafeOperationalMetadataText(record.nextManagerAction)) issues.push({ field: "nextManagerAction", code: "unsafe_metadata_retention", summary: "Recovery evidence requires a safe next manager action." });
  const checkedAtMs = typeof record.checkedAt === "string" ? Date.parse(record.checkedAt) : NaN;
  const expiresAtMs = typeof record.expiresAt === "string" ? Date.parse(record.expiresAt) : NaN;
  if (!Number.isFinite(checkedAtMs) || !Number.isFinite(expiresAtMs) || expiresAtMs <= checkedAtMs || expiresAtMs - checkedAtMs > OPERATIONAL_ACTION_READINESS_MAX_TTL_MS) issues.push({ field: "checkedAt", code: "stale_or_unparseable_readiness", summary: "Recovery evidence timestamps must be fresh and bounded." });
  if (record.outcome === "pass" && (record.reliabilityEvidenceReady !== true || record.rolloutAllowed !== false || !Array.isArray(record.typedBlockers) || record.typedBlockers.length > 0)) issues.push({ field: "outcome", code: "inconsistent_result", summary: "Passing recovery evidence requires complete drills, no blockers, and rollout disabled." });
  const recovery = record.recovery as Record<string, unknown> | undefined;
  if (record.outcome === "stop" && recovery?.required !== true) issues.push({ field: "recovery", code: "policy_violation", summary: "A stopped recovery validation requires rollback metadata." });
  return issues;
}

function pushOperationalActionCommonIssues(
  issues: PipelineOperationalActionValidationIssueV0[],
  action: Record<string, unknown>,
): void {
  if (!isPipelineOperationalActionIdV0(action.actionId)) {
    issues.push({ field: "actionId", code: "unknown_action_id", summary: "Operational action uses an unknown built-in action id." });
  }
  pushEnumIssue(issues, "targetType", action.targetType, PIPELINE_OPERATIONAL_ACTION_TARGET_TYPES);
  for (const field of ["targetId", "correlationId", "idempotencyKey"] as const) {
    if (typeof action[field] !== "string" || !action[field].trim()) {
      issues.push({ field, code: "blank_identifier", summary: `Operational action ${field} must not be blank.` });
    } else if (!isSafeOperationalIdentifierText(action[field])) {
      issues.push({ field, code: "unsafe_metadata_retention", summary: `Operational action ${field} must be safe metadata text.` });
    }
  }
  if (!isPipelineOperationalActionEvidenceRefsV0(action.evidenceRefs)) {
    issues.push({ field: "evidenceRefs", code: "evidence_required", summary: "Operational action requires safe metadata evidence refs." });
  }
}

function validateOperationalSchemaAndRetention(
  issues: PipelineOperationalActionValidationIssueV0[],
  record: Record<string, unknown>,
  schemaVersion: string | null,
  requireRawPayloadFlag: boolean,
): void {
  if (schemaVersion !== null && record.schemaVersion !== schemaVersion) {
    issues.push({ field: "schemaVersion", code: "bad_schema_version", summary: "Operational action object uses an unsupported schema version." });
  }
  if (record.metadataOnly !== true) {
    issues.push({ field: "metadataOnly", code: "bad_retention_flag", summary: "Operational action object must be metadataOnly." });
  }
  if (requireRawPayloadFlag && record.rawPayloadRetained !== false) {
    issues.push({ field: "rawPayloadRetained", code: "bad_retention_flag", summary: "Operational action object must not retain raw payloads." });
  }
  pushForbiddenObjectFieldIssues(issues, record);
}

function pushCapabilityStateIssues(issues: PipelineOperationalActionValidationIssueV0[], record: Record<string, unknown>): void {
  pushEnumIssue(issues, "capabilityState", record.capabilityState, PIPELINE_OPERATIONAL_ACTION_CAPABILITY_STATES);
  pushEnumIssue(issues, "authorityState", record.authorityState, PIPELINE_OPERATIONAL_ACTION_AUTHORITY_STATES);
  pushEnumIssue(issues, "riskTier", record.riskTier, PIPELINE_OPERATIONAL_ACTION_RISK_TIERS);
  pushTypedReasonIssue(issues, "typedReason", record.typedReason);
  if (record.capabilityState === "available" && record.authorityState !== "allowed" && !isKnownOperationalTypedReason(record.typedReason)) {
    issues.push({
      field: "typedReason",
      code: "inconsistent_result",
      summary: "Available operational action capability with non-allowed authority requires a typed reason.",
    });
  }
}

function pushActionPolicyIssues(
  issues: PipelineOperationalActionValidationIssueV0[],
  record: Record<string, unknown>,
  surface: "request" | "capability" | "result",
): void {
  if (!isPipelineOperationalActionIdV0(record.actionId)) return;
  const policy = PIPELINE_OPERATIONAL_ACTION_POLICY[record.actionId];
  if (!policy.targetTypes.includes(record.targetType as PipelineOperationalActionTargetTypeV0)) {
    issues.push({ field: "targetType", code: "policy_violation", summary: "Operational action target type does not match its policy." });
  }
  const riskField = surface === "request" ? "requestedRiskTier" : "riskTier";
  const riskTier = record[riskField];
  if (!isKnownOperationalRiskTier(riskTier) || OPERATIONAL_ACTION_RISK_RANK[riskTier] < OPERATIONAL_ACTION_RISK_RANK[policy.minimumRiskTier]) {
    issues.push({ field: riskField, code: "policy_violation", summary: "Operational action risk tier is below its policy minimum." });
  }
  if (surface === "capability" && !policy.allowedAuthorityAllowed && record.authorityState === "allowed") {
    issues.push({ field: "authorityState", code: "policy_violation", summary: "This operational action cannot be marked allowed by capability policy." });
  }
  const authorityField = surface === "request" ? "requestedAuthorityState" : "authorityState";
  const authorityState = record[authorityField];
  if (surface === "request" && policy.requiredAuthorityStates.length > 0 && !policy.requiredAuthorityStates.includes(authorityState as PipelineOperationalActionRequestedAuthorityStateV0)) {
    issues.push({ field: authorityField, code: "policy_violation", summary: "Operational action authority state does not match its required approval family." });
  }
  if (policy.requiredAuthorityStates.length === 0 && isApprovalAuthorityState(authorityState)) {
    issues.push({ field: authorityField, code: "policy_violation", summary: "Read-only operational actions must not claim unrelated approval gates." });
  }
  if (surface === "request" && policy.requiredAuthorityStates.length === 0 && authorityState !== "not_required" && authorityState !== "blocked") {
    issues.push({ field: authorityField, code: "policy_violation", summary: "Read-only operational action requests must use neutral no-approval authority or an explicit blocked state." });
  }
  if (
    surface === "capability" &&
    policy.requiredAuthorityStates.length > 0 &&
    authorityState !== "blocked" &&
    authorityState !== "allowed" &&
    !policy.requiredAuthorityStates.includes(authorityState as PipelineOperationalActionRequestedAuthorityStateV0)
  ) {
    issues.push({ field: authorityField, code: "policy_violation", summary: "Operational action capability authority state does not match its required approval family." });
  }
  if (
    surface === "result" &&
    policy.requiredAuthorityStates.length > 0 &&
    authorityState !== "blocked" &&
    authorityState !== "allowed" &&
    !policy.requiredAuthorityStates.includes(authorityState as PipelineOperationalActionRequestedAuthorityStateV0)
  ) {
    issues.push({ field: authorityField, code: "policy_violation", summary: "Operational action result authority state does not match its required approval family." });
  }
}

function isApprovalAuthorityState(value: unknown): boolean {
  return isOneOfString(value, [
    "needs_product_approval",
    "needs_authority_approval",
    "needs_resource_approval",
    "needs_destination_approval",
    "needs_safety_approval",
  ]);
}

function hasRequiredOperationalApprovalEvidence(actionId: PipelineOperationalActionIdV0, evidenceRefs: unknown, record: Record<string, unknown>): boolean {
  const policy = PIPELINE_OPERATIONAL_ACTION_POLICY[actionId];
  if (policy.requiredAuthorityStates.length === 0) return true;
  const refs = safeOperationalStringArray(evidenceRefs);
  if (!refs) return false;
  return refs.some((ref) => policy.requiredAuthorityStates.some((authorityState) => ref === approvalEvidenceRef(authorityState, actionId, record)));
}

function hasRequiredOperationalCapabilityApprovalEvidence(actionId: PipelineOperationalActionIdV0, evidenceRefs: unknown, record: Record<string, unknown>): boolean {
  const policy = PIPELINE_OPERATIONAL_ACTION_POLICY[actionId];
  if (policy.requiredAuthorityStates.length === 0) return true;
  const refs = safeOperationalStringArray(evidenceRefs);
  if (!refs) return false;
  return refs.some((ref) => policy.requiredAuthorityStates.some((authorityState) => ref === capabilityApprovalEvidenceRef(authorityState, actionId, record)));
}

function capabilityApprovalEvidenceRef(
  authorityState: PipelineOperationalActionRequestedAuthorityStateV0,
  actionId: PipelineOperationalActionIdV0,
  record: Record<string, unknown>,
): string {
  return `evidence:capability-approval-${authorityState}:${actionId}:${operationalContextEvidenceToken(record, "targetId")}`;
}

function approvalEvidenceRef(
  authorityState: PipelineOperationalActionRequestedAuthorityStateV0,
  actionId: PipelineOperationalActionIdV0,
  record: Record<string, unknown>,
): string {
  return `evidence:approval-${authorityState}:${actionId}:${operationalContextEvidenceToken(record, "targetId")}:${operationalContextEvidenceToken(record, "correlationId")}:${operationalContextEvidenceToken(record, "idempotencyKey")}`;
}

function operationalActionContextEvidenceRef(actionId: PipelineOperationalActionIdV0, record: Record<string, unknown>): string {
  return `evidence:${actionId}-context:${operationalContextEvidenceToken(record, "targetId")}:${operationalContextEvidenceToken(record, "correlationId")}:${operationalContextEvidenceToken(record, "idempotencyKey")}`;
}

function operationalContextEvidenceToken(record: Record<string, unknown>, field: "targetId" | "correlationId" | "idempotencyKey"): string {
  const value = record[field];
  if (typeof value !== "string" || !isSafeOperationalIdentifierText(value)) return "unknown-0";
  return boundedOperationalEvidenceToken(value);
}

function boundedOperationalEvidenceToken(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  const normalized = value
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "id";
  return `${normalized}-${(hash >>> 0).toString(36).padStart(7, "0").slice(0, 7)}`;
}

function hasRequiredMergeSuccessEvidence(evidenceRefs: unknown, record: Record<string, unknown>): boolean {
  const refs = safeOperationalStringArray(evidenceRefs);
  if (!refs) return false;
  const headSha = firstRegexGroup(refs, OPERATIONAL_ACTION_MERGE_HEAD_SHA_EVIDENCE, /^evidence:merge-head-sha-([a-f0-9]{40})$/);
  const base = firstRegexGroup(refs, OPERATIONAL_ACTION_MERGE_BASE_EVIDENCE, /^evidence:merge-base-([a-z0-9._/@:-]{1,120})$/);
  const pr = firstRegexGroup(refs, OPERATIONAL_ACTION_MERGE_PR_EVIDENCE, /^evidence:merge-pr-([0-9]{1,10})$/);
  const local = firstMergeLocalVerification(refs);
  return (
    refs.includes(operationalActionContextEvidenceRef("merge", record)) &&
    Boolean(headSha) &&
    Boolean(base) &&
    Boolean(pr) &&
    Boolean(local) &&
    local?.headSha === headSha &&
    local?.base === base &&
    local?.pr === pr &&
    refs.some((ref) => mergeScopedEvidenceMatches(ref, OPERATIONAL_ACTION_MERGE_CHECKS_SCOPED_EVIDENCE, headSha, pr)) &&
    refs.some((ref) => mergeScopedEvidenceMatches(ref, OPERATIONAL_ACTION_MERGE_REVIEW_THREADS_SCOPED_EVIDENCE, headSha, pr)) &&
    refs.some((ref) => OPERATIONAL_ACTION_MERGE_MERGEABILITY_EVIDENCE.test(ref)) &&
    refs.some((ref) => OPERATIONAL_ACTION_MERGE_NON_DRAFT_EVIDENCE.test(ref)) &&
    refs.some((ref) => OPERATIONAL_ACTION_MERGE_REQUESTED_CHANGES_EVIDENCE.test(ref)) &&
    refs.some((ref) => OPERATIONAL_ACTION_MERGE_EXPECTED_BASE_POLICY_EVIDENCE.test(ref)) &&
    refs.some((ref) => OPERATIONAL_ACTION_MERGE_HIGH_RISK_DIFF_EVIDENCE.test(ref))
  );
}

function mergeScopedEvidenceMatches(ref: string, capture: RegExp, expectedHeadSha: string | null, expectedPr: string | null): boolean {
  if (!expectedHeadSha || !expectedPr) return false;
  const match = capture.exec(ref);
  return Boolean(match?.[1] === expectedHeadSha && match[2] === expectedPr);
}

function firstRegexGroup(refs: string[], predicate: RegExp, capture: RegExp): string | null {
  for (const ref of refs) {
    if (!predicate.test(ref)) continue;
    const match = capture.exec(ref);
    if (match?.[1]) return match[1];
  }
  return null;
}

function firstMergeLocalVerification(refs: string[]): { headSha: string; base: string; pr: string } | null {
  for (const ref of refs) {
    if (!OPERATIONAL_ACTION_MERGE_LOCAL_VERIFICATION_EVIDENCE.test(ref)) continue;
    const match = /^verification:merge-local-head-([a-f0-9]{40}):base-([a-z0-9._/@:-]{1,80}):pr-([0-9]{1,10})$/.exec(ref);
    if (match?.[1] && match[2] && match[3]) {
      return { headSha: match[1], base: match[2], pr: match[3] };
    }
  }
  return null;
}

function hasRequiredActionSuccessEvidence(actionId: PipelineOperationalActionIdV0, evidenceRefs: unknown, record: Record<string, unknown>): boolean {
  const refs = safeOperationalStringArray(evidenceRefs);
  if (!refs) return false;
  const hasContext = refs.includes(operationalActionContextEvidenceRef(actionId, record));
  const targetId = operationalContextEvidenceToken(record, "targetId");
  switch (actionId) {
    case "dispatch_apply":
      return (
        hasContext &&
        refs.includes(`evidence:dispatch-apply-lane-${targetId}`) &&
        refs.some((ref) => OPERATIONAL_ACTION_DISPATCH_APPLY_WORKSPACE_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_DISPATCH_APPLY_RESULT_EVIDENCE.test(ref))
      );
    case "retry_verification":
      return (
        hasContext &&
        refs.includes(`evidence:retry-verification-ref-${targetId}`) &&
        refs.some((ref) => OPERATIONAL_ACTION_RETRY_VERIFICATION_RESULT_EVIDENCE.test(ref))
      );
    case "requeue":
      return (
        hasContext &&
        refs.includes(`evidence:requeue-item-${targetId}`) &&
        refs.some((ref) => OPERATIONAL_ACTION_REQUEUE_RESULT_EVIDENCE.test(ref))
      );
    case "kill_worker":
      return (
        hasContext &&
        refs.includes(`evidence:kill-worker-target-${targetId}`) &&
        refs.some((ref) => OPERATIONAL_ACTION_KILL_WORKER_RESULT_EVIDENCE.test(ref))
      );
    case "mutate_source":
      return (
        hasContext &&
        refs.includes(`evidence:mutate-source-ref-${targetId}`) &&
        refs.some((ref) => OPERATIONAL_ACTION_MUTATE_SOURCE_RESULT_EVIDENCE.test(ref))
      );
    case "push_branch":
      return (
        hasContext &&
        refs.includes(`evidence:push-branch-ref-${targetId}`) &&
        refs.some((ref) => OPERATIONAL_ACTION_PUSH_BRANCH_REMOTE_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_PUSH_BRANCH_HEAD_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_PUSH_BRANCH_RESULT_EVIDENCE.test(ref))
      );
    case "open_pr":
      return (
        hasContext &&
        refs.includes(`evidence:open-pr-branch-${targetId}`) &&
        refs.some((ref) => OPERATIONAL_ACTION_OPEN_PR_BASE_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_OPEN_PR_IDENTITY_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_OPEN_PR_RESULT_EVIDENCE.test(ref))
      );
    case "delete_branch":
      return (
        hasContext &&
        refs.includes(`evidence:delete-branch-ref-${targetId}`) &&
        refs.some((ref) => OPERATIONAL_ACTION_DELETE_BRANCH_HEAD_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_DELETE_BRANCH_RESULT_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_DELETE_BRANCH_MERGED_PR_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_DELETE_BRANCH_LANE_OWNER_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_DELETE_BRANCH_LOCAL_SHA_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_DELETE_BRANCH_REMOTE_SHA_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_DELETE_BRANCH_DELIVERY_HEAD_EVIDENCE.test(ref))
      );
    case "cleanup":
      return (
        hasContext &&
        refs.includes(`evidence:cleanup-workspace-${targetId}`) &&
        refs.some((ref) => OPERATIONAL_ACTION_CLEANUP_PR_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_CLEANUP_HEAD_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_CLEANUP_DRY_RUN_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_CLEANUP_RESULT_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_CLEANUP_MERGED_PR_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_CLEANUP_LANE_OWNER_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_CLEANUP_WORKTREE_IDENTITY_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_CLEANUP_LOCAL_BRANCH_SHA_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_CLEANUP_REMOTE_BRANCH_SHA_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_CLEANUP_DELIVERY_HEAD_EVIDENCE.test(ref))
      );
    case "credential_or_provider_change":
      return (
        hasContext &&
        refs.includes(`evidence:provider-change-target-${targetId}`) &&
        refs.some((ref) => OPERATIONAL_ACTION_PROVIDER_CHANGE_TARGET_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_PROVIDER_CHANGE_RESULT_EVIDENCE.test(ref))
      );
    default:
      return true;
  }
}

function pushEnumIssue(issues: PipelineOperationalActionValidationIssueV0[], field: string, value: unknown, allowed: readonly string[]): void {
  if (typeof value !== "string" || !allowed.includes(value)) {
    issues.push({ field, code: "invalid_enum", summary: `Operational action ${field} is not a supported value.` });
  }
}

function pushTypedReasonIssue(issues: PipelineOperationalActionValidationIssueV0[], field: string, value: unknown): void {
  if (value !== null && value !== undefined && !isKnownOperationalTypedReason(value)) {
    issues.push({ field, code: "invalid_enum", summary: "Operational action typed reason is not supported." });
  }
}

function pushOutcomeStateConsistencyIssues(issues: PipelineOperationalActionValidationIssueV0[], record: Record<string, unknown>): void {
  if (record.outcome === "succeeded" && ["blocked", "failed", "unknown"].includes(typeof record.resultingStatus === "string" ? record.resultingStatus : "")) {
    issues.push({ field: "resultingStatus", code: "inconsistent_result", summary: "Successful operational action results cannot report blocked, failed, or unknown resulting status." });
  }
  if (record.outcome === "succeeded" && ["unknown", "deferred"].includes(typeof record.resultingStage === "string" ? record.resultingStage : "")) {
    issues.push({ field: "resultingStage", code: "inconsistent_result", summary: "Successful operational action results cannot report unknown or deferred resulting stage." });
  }
  if (record.outcome === "blocked" && record.resultingStatus !== "blocked") {
    issues.push({ field: "resultingStatus", code: "inconsistent_result", summary: "Blocked operational action results must report blocked resulting status." });
  }
  if (record.outcome === "failed" && record.resultingStatus !== "failed") {
    issues.push({ field: "resultingStatus", code: "inconsistent_result", summary: "Failed operational action results must report failed resulting status." });
  }
  if (record.outcome === "rejected" && record.resultingStatus !== "blocked") {
    issues.push({ field: "resultingStatus", code: "inconsistent_result", summary: "Rejected operational action results must report blocked resulting status." });
  }
  if (record.outcome === "simulated" && record.resultingStatus !== "unknown") {
    issues.push({ field: "resultingStatus", code: "inconsistent_result", summary: "Simulated operational action results must report unknown resulting status." });
  }
}

function isKnownOperationalTypedReason(value: unknown): value is PipelineOperationalActionTypedReasonV0 {
  return typeof value === "string" && (PIPELINE_OPERATIONAL_ACTION_TYPED_REASONS as readonly string[]).includes(value);
}

function isKnownOperationalRiskTier(value: unknown): value is PipelineOperationalActionRiskTierV0 {
  return typeof value === "string" && (PIPELINE_OPERATIONAL_ACTION_RISK_TIERS as readonly string[]).includes(value);
}

function requiresOperationalCapabilityTargetId(record: Record<string, unknown>): boolean {
  if (record.capabilityState !== "available" || record.authorityState !== "allowed") return false;
  const actionId = record.actionId;
  const mutatingAction = typeof actionId === "string" && !["inspect", "refresh_projection"].includes(actionId);
  const elevatedRisk = isKnownOperationalRiskTier(record.riskTier) && OPERATIONAL_ACTION_RISK_RANK[record.riskTier] >= OPERATIONAL_ACTION_RISK_RANK.high;
  return mutatingAction || elevatedRisk;
}

function readinessCapabilityRequiresBoundedWrite(record: Record<string, unknown>): boolean {
  if (record.capabilityState !== "available" || record.authorityState !== "allowed") return false;
  const actionId = record.actionId;
  const mutatingAction = typeof actionId === "string" && !["inspect", "refresh_projection"].includes(actionId);
  const elevatedRisk = isKnownOperationalRiskTier(record.riskTier) && OPERATIONAL_ACTION_RISK_RANK[record.riskTier] >= OPERATIONAL_ACTION_RISK_RANK.high;
  return mutatingAction || elevatedRisk;
}

function isSafeOperationalMetadataText(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed === value &&
    trimmed.length > 0 &&
    trimmed.length <= 500 &&
    !/[\u0000-\u001F\u007F]/.test(trimmed) &&
    !FORBIDDEN_OPERATIONAL_ACTION_METADATA.test(trimmed) &&
    !SECRET_LIKE_OPERATIONAL_ACTION_REF.test(trimmed)
  );
}

function isSafeOperationalIdentifierText(value: string): boolean {
  return (
    isSafeOperationalMetadataText(value) &&
    value === value.toLowerCase() &&
    !/\s/.test(value) &&
    OPERATIONAL_ACTION_IDENTIFIER.test(value) &&
    !OPERATIONAL_ACTION_IDENTIFIER_REPEATED_SEPARATOR.test(value) &&
    !OPERATIONAL_ACTION_IDENTIFIER_PATH_SEGMENT.test(value)
  );
}

function pushRequestedByIssues(issues: PipelineOperationalActionValidationIssueV0[], value: unknown): void {
  const actor = operationalActionRecord(value, issues, "requestedBy");
  pushUnknownFieldIssues(issues, actor, OPERATIONAL_ACTION_ACTOR_KEYS);
  const actorType = safeOperationalField(issues, actor, "requestedBy.actorType");
  const rawActorId = safeOperationalField(issues, actor, "requestedBy.actorId");
  const rawActorLabel = safeOperationalField(issues, actor, "requestedBy.actorLabel");
  if (!isOneOfString(actorType, ["system", "operator", "manager", "worker"])) {
    issues.push({ field: "requestedBy.actorType", code: "invalid_actor", summary: "Operational action requests require a known accountable actor type." });
  }
  const actorId = typeof rawActorId === "string" ? rawActorId.trim() : "";
  const actorLabel = typeof rawActorLabel === "string" ? rawActorLabel.trim() : "";
  if (!actorId && !actorLabel) {
    issues.push({ field: "requestedBy", code: "invalid_actor", summary: "Operational action requests require an accountable actor id or label." });
  }
  if (actorId && (typeof rawActorId !== "string" || !isSafeOperationalIdentifierText(rawActorId))) {
    issues.push({ field: "requestedBy.actorId", code: "unsafe_metadata_retention", summary: "Operational action actor ids must be safe metadata text." });
  }
  if (actorLabel && (typeof rawActorLabel !== "string" || !isSafeOperationalMetadataText(rawActorLabel))) {
    issues.push({ field: "requestedBy.actorLabel", code: "unsafe_metadata_retention", summary: "Operational action actor labels must be safe metadata text." });
  }
}

function isOneOfString(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === "string" && allowed.includes(value);
}

function safeOperationalField(
  issues: PipelineOperationalActionValidationIssueV0[],
  record: Record<string, unknown>,
  field: string,
): unknown {
  try {
    const key = field.includes(".") ? field.slice(field.lastIndexOf(".") + 1) : field;
    return record[key];
  } catch {
    issues.push({
      field,
      code: "forbidden_field",
      summary: "Operational action metadata could not be safely inspected.",
    });
    return undefined;
  }
}

const OPERATIONAL_ACTION_ACTOR_KEYS = new Set(["actorId", "actorLabel", "actorType"]);

function pushRequiredCapabilityGuardIssues(issues: PipelineOperationalActionValidationIssueV0[], record: Record<string, unknown>): void {
  if (record.correlationRequired !== true) {
    issues.push({ field: "correlationRequired", code: "policy_violation", summary: "Operational action capabilities must require correlation ids." });
  }
  if (record.idempotencyRequired !== true) {
    issues.push({ field: "idempotencyRequired", code: "policy_violation", summary: "Operational action capabilities must require idempotency keys." });
  }
}

function pushReadinessAvailableCapabilityIssues(
  issues: PipelineOperationalActionValidationIssueV0[],
  record: Record<string, unknown>,
  actionCapabilities: unknown[],
): void {
  if (record.readinessState !== "ready" || record.capabilityState !== "available") return;
  const capabilities = new Map<string, Record<string, unknown>>();
  for (const capability of actionCapabilities) {
    if (!capability || typeof capability !== "object") continue;
    const capabilityRecord = capability as Record<string, unknown>;
    if (typeof capabilityRecord.actionId === "string") {
      capabilities.set(capabilityRecord.actionId, capabilityRecord);
    }
  }
  for (const actionId of ["inspect", "refresh_projection"]) {
    const capability = capabilities.get(actionId);
    if (
      !capability ||
      capability.capabilityState !== "available" ||
      capability.authorityState !== "allowed" ||
      capability.typedReason !== null
    ) {
      issues.push({
        field: "actionCapabilities",
        code: "inconsistent_result",
        summary: "Ready aggregate operational readiness requires available inspect and refresh_projection capabilities.",
      });
      return;
    }
  }
}

function pushReadinessOperationalModeCapabilityIssues(
  issues: PipelineOperationalActionValidationIssueV0[],
  record: Record<string, unknown>,
  actionCapabilities: unknown[],
): void {
  for (const capability of actionCapabilities) {
    if (!capability || typeof capability !== "object") continue;
    const capabilityRecord = capability as Record<string, unknown>;
    if (readinessCapabilityRequiresBoundedWrite(capabilityRecord) && record.operationalMode !== "bounded_write") {
      issues.push({
        field: "operationalMode",
        code: "inconsistent_result",
        summary: "Available mutating or elevated-risk runtime capabilities require bounded_write readiness.",
      });
      return;
    }
  }
}

const OPERATIONAL_ACTION_REQUEST_KEYS = new Set([
  "schemaVersion",
  "actionId",
  "targetType",
  "targetId",
  "idempotencyKey",
  "correlationId",
  "requestedBy",
  "requestedAuthorityState",
  "requestedRiskTier",
  "operatorIntentSummary",
  "expectedCurrentEventId",
  "testResult",
  "testNotes",
  "evidenceRefs",
  "metadataOnly",
  "rawPayloadRetained",
]);

const OPERATIONAL_ACTION_RESULT_KEYS = new Set([
  "schemaVersion",
  "actionId",
  "targetType",
  "targetId",
  "outcome",
  "resultingStage",
  "resultingStatus",
  "capabilityState",
  "authorityState",
  "riskTier",
  "typedReason",
  "evidenceRefs",
  "correlationId",
  "idempotencyKey",
  "actionRecordId",
  "childPacketId",
  "metadataOnly",
  "rawPayloadRetained",
]);

const OPERATIONAL_ACTION_CAPABILITY_KEYS = new Set([
  "actionId",
  "targetType",
  "targetId",
  "capabilityState",
  "authorityState",
  "riskTier",
  "typedReason",
  "expectedResultSummary",
  "correlationRequired",
  "idempotencyRequired",
  "evidenceRefs",
  "metadataOnly",
  "rawPayloadRetained",
]);

const OPERATIONAL_RUNTIME_READINESS_KEYS = new Set([
  "schemaVersion",
  "actionSchemaVersion",
  "readinessState",
  "operationalMode",
  "freshnessState",
  "capabilityState",
  "typedReason",
  "checkedAt",
  "expiresAt",
  "summary",
  "actionCapabilities",
  "evidenceRefs",
  "metadataOnly",
  "rawPayloadRetained",
]);

function pushUnknownFieldIssues(
  issues: PipelineOperationalActionValidationIssueV0[],
  record: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
): void {
  const entries = safeOperationalObjectEntries(issues, record, "");
  if (!entries) return;
  for (const [field] of entries) {
    if (!allowedKeys.has(field)) {
      issues.push({
        field,
        code: "forbidden_field",
        summary: "Operational action objects must not include uncontracted fields.",
      });
    }
  }
}

function pushForbiddenObjectFieldIssues(issues: PipelineOperationalActionValidationIssueV0[], record: Record<string, unknown>): void {
  pushForbiddenValueIssues(issues, record, "", new WeakSet<object>(), 0, { count: 0, stopped: false });
}

function pushForbiddenValueIssues(
  issues: PipelineOperationalActionValidationIssueV0[],
  value: unknown,
  path: string,
  seen: WeakSet<object>,
  depth: number,
  budget: { count: number; stopped: boolean },
): void {
  if (budget.stopped) return;
  budget.count += 1;
  if (depth > OPERATIONAL_ACTION_METADATA_MAX_DEPTH || budget.count > OPERATIONAL_ACTION_METADATA_MAX_NODES) {
    if (!budget.stopped) {
      issues.push({
        field: path || "value",
        code: "forbidden_field",
        summary: "Operational action metadata exceeds bounded validation depth.",
      });
    }
    budget.stopped = true;
    return;
  }
  if (safeOperationalIsArray(value)) {
    const arrayValue = value as object;
    if (seen.has(arrayValue)) {
      issues.push({
        field: path || "value",
        code: "forbidden_field",
        summary: "Operational action metadata must not contain cyclic object references.",
      });
      return;
    }
    seen.add(arrayValue);
    const values = safeOperationalArrayValues(issues, value, path || "value");
    if (!values) {
      seen.delete(arrayValue);
      return;
    }
    for (const [index, item] of values.entries()) {
      pushForbiddenValueIssues(issues, item, `${path}.${index}`, seen, depth + 1, budget);
    }
    seen.delete(arrayValue);
    return;
  }
  if (!value || typeof value !== "object") {
    if (
      typeof value === "string" &&
      (FORBIDDEN_OPERATIONAL_ACTION_METADATA.test(value) || SECRET_LIKE_OPERATIONAL_ACTION_REF.test(value))
    ) {
      issues.push({
        field: path || "value",
        code: "unsafe_metadata_retention",
        summary: "Operational action objects must not retain raw payload, provider, terminal, or secret-like metadata text.",
      });
    }
    return;
  }
  if (seen.has(value)) {
    issues.push({
      field: path || "value",
      code: "forbidden_field",
      summary: "Operational action metadata must not contain cyclic object references.",
    });
    return;
  }
  seen.add(value);
  const entries = safeOperationalObjectEntries(issues, value as Record<string, unknown>, path || "value");
  if (!entries) {
    seen.delete(value);
    return;
  }
  for (const [field, nested] of entries) {
    const nestedPath = path ? `${path}.${field}` : field;
    if (FORBIDDEN_OPERATIONAL_ACTION_OBJECT_FIELD.test(field) || FORBIDDEN_OPERATIONAL_ACTION_METADATA.test(field)) {
      issues.push({
        field: nestedPath,
        code: "forbidden_field",
        summary: "Operational action objects must not retain raw prompts, provider payloads, secrets, credentials, or terminal output fields.",
      });
    }
    pushForbiddenValueIssues(issues, nested, nestedPath, seen, depth + 1, budget);
  }
  seen.delete(value);
}

function safeOperationalObjectEntries(
  issues: PipelineOperationalActionValidationIssueV0[],
  value: Record<string, unknown>,
  path: string,
): [string, unknown][] | null {
  try {
    return Object.entries(value);
  } catch {
    issues.push({
      field: path || "value",
      code: "forbidden_field",
      summary: "Operational action metadata could not be safely inspected.",
    });
    return null;
  }
}

function safeOperationalArrayValues(
  issues: PipelineOperationalActionValidationIssueV0[],
  value: unknown,
  path: string,
): unknown[] | null {
  const values = safeOperationalUnknownArray(value);
  if (values) return values;
  try {
    if (!Array.isArray(value)) return null;
    const length = typeof value.length === "number" ? value.length : 0;
    if (length > OPERATIONAL_ACTION_METADATA_MAX_NODES) {
      issues.push({
        field: path,
        code: "forbidden_field",
        summary: "Operational action metadata array exceeds bounded validation size.",
      });
    }
  } catch {
    issues.push({
      field: path,
      code: "forbidden_field",
      summary: "Operational action metadata could not be safely inspected.",
    });
  }
  return null;
}

function safeOperationalUnknownArray(value: unknown): unknown[] | null {
  try {
    if (!Array.isArray(value)) return null;
    if (value.length > OPERATIONAL_ACTION_METADATA_MAX_NODES) return null;
    return Array.from(value);
  } catch {
    return null;
  }
}

function safeOperationalStringArray(value: unknown): string[] | null {
  try {
    const values = safeOperationalUnknownArray(value);
    if (!values) return null;
    return values.filter((ref): ref is string => typeof ref === "string");
  } catch {
    return null;
  }
}

function safeOperationalIsArray(value: unknown): boolean {
  try {
    return Array.isArray(value);
  } catch {
    return false;
  }
}

function pushReadinessCapabilityCoverageIssues(
  issues: PipelineOperationalActionValidationIssueV0[],
  capabilities: unknown[],
): void {
  const counts = new Map<string, number>();
  for (const capability of capabilities) {
    const actionId = operationalActionRecord(capability, issues, "actionCapabilities").actionId;
    if (typeof actionId === "string") {
      counts.set(actionId, (counts.get(actionId) || 0) + 1);
    }
  }
  for (const actionId of PIPELINE_OPERATIONAL_ACTION_IDS) {
    if (counts.get(actionId) !== 1) {
      issues.push({
        field: "actionCapabilities",
        code: "inconsistent_result",
        summary: "Operational runtime readiness requires every built-in action capability exactly once.",
      });
      return;
    }
  }
  for (const [actionId, count] of counts.entries()) {
    if (!isPipelineOperationalActionIdV0(actionId) || count !== 1) {
      issues.push({
        field: "actionCapabilities",
        code: "inconsistent_result",
        summary: "Operational runtime readiness requires every built-in action capability exactly once.",
      });
      return;
    }
  }
}

function operationalActionRecord(
  value: unknown,
  issues?: PipelineOperationalActionValidationIssueV0[],
  path = "value",
): Record<string, unknown> {
  if (!value || typeof value !== "object" || safeOperationalIsArray(value)) return {};
  if (!issues) return {};
  const entries = safeOperationalObjectEntries(issues, value as Record<string, unknown>, path);
  if (!entries) return {};
  const record: Record<string, unknown> = {};
  for (const [field, fieldValue] of entries) {
    record[field] = fieldValue;
  }
  return record;
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
  parentPacketId?: string | null;
  lineageKind?: string;
  operatorTestState?: "not_ready" | "ready" | "passed" | "failed" | "rework";
  operatorTestNote?: string | null;
  actionCapabilities?: PipelineOperationalActionCapabilityV0[];
  actionResults?: PipelineOperationalActionResultV0[];
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
  runtimeReadiness?: PipelineOperationalRuntimeReadinessV0;
  actionCapabilities?: PipelineOperationalActionCapabilityV0[];
  queueSummary: PipelineQueueSummaryV0;
  evidenceRefs: string[];
}
