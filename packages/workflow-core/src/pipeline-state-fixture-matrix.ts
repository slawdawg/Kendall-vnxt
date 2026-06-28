import type {
  ArtifactRefV0,
  EvidenceRefV0,
  HumanGateActionStatusV0,
  HumanGateActionTypeV0,
  HumanGateActionV0,
  PipelineStage,
  RecoveryActionTypeV0,
  SourceRefV0,
  WorkPacketOwner,
  WorkPacketStatus
} from "@kendall/contracts";

import type { WorkPacketStageMappingInputV0 } from "./work-packet-stage-map";

export type PipelineMatrixStoryTypeV0 =
  | "contract"
  | "fixture_ui"
  | "projection_adapter"
  | "mock_status"
  | "typed_action"
  | "readiness_evidence";

export type PipelineFixtureProvenanceV0 =
  | "fixture-only"
  | "mocked"
  | "synthetic"
  | "local-readiness"
  | "future-real-source";

export type PipelineReadinessFailureCategoryV0 = "state" | "evidence" | "fixture" | "boundary";

export interface PipelineDisallowedActionV0 {
  type: HumanGateActionTypeV0 | "unknown_action";
  status: Exclude<HumanGateActionStatusV0, "available" | "complete">;
  reason: string;
}

export interface PipelineStateEvidenceMatrixRowV0 {
  id: string;
  sourceEntityState: string;
  stage: PipelineStage;
  owner: WorkPacketOwner;
  status: WorkPacketStatus;
  mappingInput: WorkPacketStageMappingInputV0;
  workPacketFields: string[];
  freshnessRule: SourceRefV0["freshness"] | "mixed";
  allowedActions: HumanGateActionTypeV0[];
  disallowedOrStaleActions: PipelineDisallowedActionV0[];
  recoveryActions: RecoveryActionTypeV0[];
  requiredEvidence: Array<EvidenceRefV0["evidenceType"] | ArtifactRefV0["artifactType"] | RecoveryActionTypeV0 | "source_ref">;
  fixtureIds: string[];
  futureRealSourceCoverage: string;
  storyType: PipelineMatrixStoryTypeV0[];
}

export interface PipelineFixtureCatalogEntryV0 {
  id: string;
  label: string;
  provenance: PipelineFixtureProvenanceV0;
  matrixRowIds: string[];
  expectedSurfaces: string[];
  sourceStates: SourceRefV0["accessState"][];
  evidenceTypes: EvidenceRefV0["evidenceType"][];
  artifactTypes: ArtifactRefV0["artifactType"][];
  recoveryActions: RecoveryActionTypeV0[];
  memoryWriteBackAllowed: false;
  futureCoverageStates: string[];
}

export interface PipelineMatrixValidationFailureV0 {
  category: PipelineReadinessFailureCategoryV0;
  id: string;
  message: string;
}

export interface PipelineMatrixValidationResultV0 {
  ok: boolean;
  failures: PipelineMatrixValidationFailureV0[];
}

export interface PipelineMatrixValidationInputV0 {
  matrixRows?: PipelineStateEvidenceMatrixRowV0[];
  fixtureCatalog?: PipelineFixtureCatalogEntryV0[];
}

export interface HumanGateActionValidationInputV0 {
  actionId?: unknown;
  type?: unknown;
  family?: unknown;
  label?: unknown;
  uiCopy?: unknown;
  status?: unknown;
  authorityFamily?: unknown;
  payload?: Partial<HumanGateActionV0["payload"]> | unknown;
  requiredEvidenceRefs?: unknown;
  stopLines?: unknown;
  rollbackPath?: unknown;
  resultingStage?: unknown;
  resultingOwner?: unknown;
  auditEventType?: unknown;
  reasonCodes?: unknown;
  disabledReason?: unknown;
}

const REQUIRED_STORY_TYPES: PipelineMatrixStoryTypeV0[] = [
  "contract",
  "fixture_ui",
  "projection_adapter",
  "mock_status",
  "typed_action",
  "readiness_evidence"
];

const REQUIRED_MATRIX_ROW_COVERAGE: Array<{ id: string; category: PipelineReadinessFailureCategoryV0 }> = [
  { id: "contract.work_packet_identity", category: "evidence" },
  { id: "contract.source_refs", category: "evidence" },
  { id: "contract.evidence_refs", category: "evidence" },
  { id: "contract.artifact_refs", category: "evidence" },
  { id: "contract.route_summary", category: "evidence" },
  { id: "contract.execution_attempts", category: "evidence" },
  { id: "contract.lane_cards", category: "evidence" },
  { id: "contract.human_gate_actions", category: "evidence" },
  { id: "contract.memory_proposals", category: "evidence" },
  { id: "contract.review_summaries", category: "evidence" },
  { id: "contract.recovery_actions", category: "evidence" },
  { id: "candidate_work.proposed", category: "state" },
  { id: "candidate_work.approved_unpromoted", category: "state" },
  { id: "candidate_work.deferred", category: "state" },
  { id: "candidate_work.rejected", category: "state" },
  { id: "candidate_work.promoted_missing_work_item", category: "state" },
  { id: "work_item.queued", category: "state" },
  { id: "work_item.triaged", category: "state" },
  { id: "routing.preview_present", category: "state" },
  { id: "execution.recipe_unapproved", category: "state" },
  { id: "work_item.ready", category: "state" },
  { id: "work_item.blocked", category: "state" },
  { id: "work_item.done", category: "state" },
  { id: "execution_attempt.planned", category: "state" },
  { id: "execution_attempt.approved", category: "state" },
  { id: "execution_attempt.running", category: "state" },
  { id: "governed_worker.claude_real_execution_running", category: "state" },
  { id: "governed_worker.hermes_real_execution_unavailable", category: "state" },
  { id: "execution_attempt.failed", category: "state" },
  { id: "execution_attempt.completed", category: "state" },
  { id: "execution_attempt.review_rejected", category: "state" },
  { id: "delivery.evidence_present", category: "state" },
  { id: "memory.pending_human_approval", category: "state" },
  { id: "source.restricted_refs", category: "boundary" },
  { id: "source.missing", category: "boundary" },
  { id: "execution_lane.unsupported", category: "boundary" },
  { id: "execution_lane.missing", category: "boundary" },
  { id: "mock.hermes_unavailable", category: "state" },
  { id: "mock.codex_active", category: "state" },
  { id: "mock.claude_pending_skipped", category: "state" },
  { id: "readiness.local_provider_disabled", category: "boundary" },
  { id: "memory.obsidian_proposal_pending_human_approval", category: "state" },
  { id: "aggregate.no_packets", category: "boundary" },
  { id: "aggregate.corrupted_incomplete", category: "boundary" },
  { id: "boundary.raw_retention_rejected", category: "boundary" }
];

const REQUIRED_FIXTURE_IDS = [
  "happy_path_work_packet",
  "blocked_human_gate",
  "stale_gate_action",
  "failed_stage_recovery",
  "partial_worker_evidence",
  "mocked_hermes_unavailable",
  "codex_active_claude_pending",
  "obsidian_proposal_pending_approval",
  "no_packets",
  "corrupted_incomplete_aggregate"
] as const;

const REQUIRED_FIXTURE_SURFACES = ["sourceRefs", "evidenceRefs", "artifactRefs"] as const;

const HUMAN_GATE_ACTION_TYPES: HumanGateActionTypeV0[] = [
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
];

const HUMAN_GATE_ACTION_FAMILIES = ["Approve", "Reject", "Request Changes", "Retry", "Pause", "Escalate", "Mark Resolved"];
const HUMAN_GATE_ACTION_STATUSES = ["available", "disabled", "blocked", "stale", "complete"];
const PIPELINE_STAGES: PipelineStage[] = ["capture", "classify", "route", "shape", "human_gate", "execute", "review", "promote", "deliver", "learn"];
const WORK_PACKET_OWNERS: WorkPacketOwner[] = [
  "kendall",
  "operator",
  "local_model",
  "hermes_worker_mock",
  "codex_worker",
  "claude_reviewer",
  "github",
  "memory_review",
  "blocked"
];
const DEFAULT_DISALLOWED_ACTION_REASON = "Action is not allowed for this packet state.";

export const PIPELINE_STATE_EVIDENCE_MATRIX_V0: PipelineStateEvidenceMatrixRowV0[] = [
  contractRow("contract.work_packet_identity", ["packetId", "title", "requestedOutcome", "riskLevel", "priority"]),
  contractRow("contract.source_refs", ["sourceRefs"], ["source_ref"]),
  contractRow("contract.evidence_refs", ["evidenceRefs"], ["fixture"]),
  contractRow("contract.artifact_refs", ["artifactRefs"], ["fixture"]),
  contractRow("contract.route_summary", ["routeSummary"], ["route"]),
  contractRow("contract.execution_attempts", ["executionAttempts"], ["attempt"]),
  contractRow("contract.lane_cards", ["laneCards"], ["attempt"]),
  contractRow("contract.human_gate_actions", ["humanGateActions", "humanGateActionRequests"], ["gate"], ["approve_route", "approve_execution", "reject_packet", "edit_packet", "request_clarification", "reroute"]),
  contractRow("contract.memory_proposals", ["memoryProposals"], ["memory"]),
  contractRow("contract.review_summaries", ["reviewSummaries"], ["review"]),
  contractRow("contract.recovery_actions", ["recoveryActions"], ["fixture"], ["rerun_smaller", "reroute", "send_back_to_shape"]),
  row({
    id: "candidate_work.proposed",
    sourceEntityState: "Candidate Work proposed",
    stage: "capture",
    owner: "kendall",
    status: "waiting",
    mappingInput: { candidateWorkStatus: "proposed" },
    fixtureIds: ["happy_path_work_packet"],
    storyType: ["projection_adapter"]
  }),
  row({
    id: "candidate_work.approved_unpromoted",
    sourceEntityState: "Candidate Work approved and not promoted",
    stage: "promote",
    owner: "operator",
    status: "waiting",
    mappingInput: { candidateWorkStatus: "approved", candidateWorkPromoted: false },
    allowedActions: ["approve_route", "send_back_to_shape"],
    disallowedOrStaleActions: [blockedAction("rerun_smaller", "No active Work Item exists yet.")],
    fixtureIds: ["happy_path_work_packet"],
    storyType: ["projection_adapter", "typed_action"]
  }),
  row({
    id: "candidate_work.deferred",
    sourceEntityState: "Candidate Work deferred",
    stage: "capture",
    owner: "operator",
    status: "deferred",
    mappingInput: { candidateWorkStatus: "deferred" },
    fixtureIds: ["no_packets"],
    storyType: ["projection_adapter"]
  }),
  row({
    id: "candidate_work.rejected",
    sourceEntityState: "Candidate Work rejected",
    stage: "capture",
    owner: "operator",
    status: "deferred",
    mappingInput: { candidateWorkStatus: "rejected" },
    fixtureIds: ["no_packets"],
    storyType: ["projection_adapter"]
  }),
  row({
    id: "candidate_work.promoted_missing_work_item",
    sourceEntityState: "Candidate Work approved with missing promoted Work Item",
    stage: "capture",
    owner: "kendall",
    status: "waiting",
    mappingInput: { candidateWorkStatus: "approved", candidateWorkPromoted: true },
    fixtureIds: ["corrupted_incomplete_aggregate"],
    storyType: ["projection_adapter", "readiness_evidence"]
  }),
  row({
    id: "work_item.queued",
    sourceEntityState: "Work Item queued",
    stage: "capture",
    owner: "kendall",
    status: "active",
    mappingInput: { workItemState: "queued" },
    fixtureIds: ["happy_path_work_packet"],
    storyType: ["projection_adapter"]
  }),
  row({
    id: "work_item.triaged",
    sourceEntityState: "Work Item triaged without routing preview",
    stage: "classify",
    owner: "kendall",
    status: "active",
    mappingInput: { workItemState: "triaged" },
    fixtureIds: ["happy_path_work_packet"],
    storyType: ["projection_adapter"]
  }),
  row({
    id: "routing.preview_present",
    sourceEntityState: "Routing preview present",
    stage: "route",
    owner: "kendall",
    status: "active",
    mappingInput: { workItemState: "triaged", hasRoutingPreview: true },
    requiredEvidence: ["route", "source_ref"],
    fixtureIds: ["happy_path_work_packet", "partial_worker_evidence"],
    futureRealSourceCoverage: "Real route preview/event evidence can replace fixture route refs.",
    storyType: ["projection_adapter", "readiness_evidence"]
  }),
  row({
    id: "execution.recipe_unapproved",
    sourceEntityState: "Execution recipe present without approval",
    stage: "shape",
    owner: "kendall",
    status: "active",
    mappingInput: { workItemState: "triaged", hasExecutionRecipe: true, executionApproved: false },
    allowedActions: ["approve_execution", "approve_provider_exception", "request_clarification", "reroute"],
    disallowedOrStaleActions: [staleAction("approve_execution", "Approval must reference the current recipe id.")],
    requiredEvidence: ["route", "plan"],
    fixtureIds: ["happy_path_work_packet", "stale_gate_action"],
    futureRealSourceCoverage: "Real recipe evidence can bind typed approval ids later.",
    storyType: ["projection_adapter", "typed_action", "readiness_evidence"]
  }),
  row({
    id: "work_item.ready",
    sourceEntityState: "Work Item ready",
    stage: "human_gate",
    owner: "operator",
    status: "waiting",
    mappingInput: { workItemState: "ready" },
    allowedActions: ["approve_execution", "approve_provider_exception", "reject_packet", "edit_packet", "request_clarification", "reroute"],
    disallowedOrStaleActions: [
      staleAction("approve_execution", "Approval is stale when packet id or decision id changed."),
      blockedAction("unknown_action", "Unknown or unsupported Human Gate action types are rejected.")
    ],
    requiredEvidence: ["gate", "route"],
    fixtureIds: ["blocked_human_gate", "stale_gate_action"],
    futureRealSourceCoverage: "Supervisor validation will own typed action allowance.",
    storyType: ["projection_adapter", "typed_action"]
  }),
  row({
    id: "work_item.blocked",
    sourceEntityState: "Work Item blocked",
    stage: "human_gate",
    owner: "blocked",
    status: "blocked",
    mappingInput: { workItemState: "blocked" },
    allowedActions: ["rerun_smaller", "send_back_to_shape", "request_clarification"],
    recoveryActions: ["retry_smaller", "reopen_human_gate", "send_back_to_shape", "mark_blocked"],
    requiredEvidence: ["gate", "fixture"],
    fixtureIds: ["blocked_human_gate", "failed_stage_recovery"],
    storyType: ["projection_adapter", "typed_action", "readiness_evidence"]
  }),
  row({
    id: "work_item.done",
    sourceEntityState: "Work Item done without delivery or memory evidence",
    stage: "deliver",
    owner: "kendall",
    status: "complete",
    mappingInput: { workItemState: "done" },
    requiredEvidence: ["fixture", "check"],
    fixtureIds: ["happy_path_work_packet"],
    futureRealSourceCoverage: "Real completion checks may attach delivery or memory evidence in later stories.",
    storyType: ["projection_adapter", "readiness_evidence"]
  }),
  row({
    id: "execution_attempt.planned",
    sourceEntityState: "Execution attempt planned",
    stage: "shape",
    owner: "kendall",
    status: "waiting",
    mappingInput: { executionAttemptStatus: "planned" },
    requiredEvidence: ["attempt", "plan"],
    fixtureIds: ["partial_worker_evidence"],
    storyType: ["projection_adapter", "readiness_evidence"]
  }),
  row({
    id: "execution_attempt.approved",
    sourceEntityState: "Execution attempt approved",
    stage: "human_gate",
    owner: "operator",
    status: "waiting",
    mappingInput: { executionAttemptStatus: "approved" },
    allowedActions: ["approve_execution", "reject_packet"],
    requiredEvidence: ["attempt", "gate"],
    fixtureIds: ["stale_gate_action"],
    storyType: ["projection_adapter", "typed_action"]
  }),
  row({
    id: "execution_attempt.running",
    sourceEntityState: "Execution attempt running",
    stage: "execute",
    owner: "codex_worker",
    status: "active",
    mappingInput: { executionAttemptStatus: "running", executionAttemptLane: "codex_worker" },
    disallowedOrStaleActions: [blockedAction("approve_execution", "Running workers cannot be approved twice.")],
    requiredEvidence: ["attempt", "progress"],
    fixtureIds: ["partial_worker_evidence", "codex_active_claude_pending"],
    futureRealSourceCoverage: "Real worker evidence may populate progress refs without raw output.",
    storyType: ["projection_adapter", "mock_status", "readiness_evidence"]
  }),
  row({
    id: "governed_worker.hermes_dry_run_running",
    sourceEntityState: "Governed Hermes dry-run attempt running",
    stage: "execute",
    owner: "hermes_worker_mock",
    status: "active",
    mappingInput: { executionAttemptStatus: "running", executionAttemptLane: "hermes_execution_dry_run" },
    disallowedOrStaleActions: [blockedAction("approve_execution", "Governed dry-run status is not live execution approval.")],
    requiredEvidence: ["attempt", "event"],
    fixtureIds: ["mocked_hermes_unavailable"],
    futureRealSourceCoverage: "Future Hermes dry-run status may populate execution-attempt refs without process launch, network, sessions, source mutation, or raw output.",
    storyType: ["projection_adapter", "mock_status", "readiness_evidence"]
  }),
  row({
    id: "governed_worker.claude_dry_run_running",
    sourceEntityState: "Governed Claude dry-run attempt running",
    stage: "execute",
    owner: "claude_reviewer",
    status: "active",
    mappingInput: { executionAttemptStatus: "running", executionAttemptLane: "claude_execution_dry_run" },
    disallowedOrStaleActions: [blockedAction("approve_execution", "Governed dry-run status is not live execution approval.")],
    requiredEvidence: ["attempt", "review"],
    fixtureIds: ["governed_claude_real_execution_active"],
    futureRealSourceCoverage: "Future Claude dry-run status may populate execution-attempt refs without provider calls, network, sessions, source mutation, or raw output.",
    storyType: ["projection_adapter", "mock_status", "readiness_evidence"]
  }),
  row({
    id: "governed_worker.claude_real_execution_running",
    sourceEntityState: "Governed Claude copied-worktree execution running",
    stage: "execute",
    owner: "claude_reviewer",
    status: "active",
    mappingInput: { executionAttemptStatus: "running", executionAttemptLane: "claude_governed_execution" },
    disallowedOrStaleActions: [blockedAction("approve_execution", "Observed governed Claude execution metadata is not broader live-worker approval.")],
    requiredEvidence: ["attempt", "event", "review"],
    fixtureIds: ["codex_active_claude_pending"],
    futureRealSourceCoverage: "Real governed Claude execution status may populate copied-worktree/smoke/version refs while omitting raw output and preserving no-source-mutation, no-tools, no-delivery, and metadata-only boundaries.",
    storyType: ["projection_adapter", "mock_status", "readiness_evidence"]
  }),
  row({
    id: "governed_worker.hermes_real_execution_unavailable",
    sourceEntityState: "Governed Hermes real execution unavailable",
    stage: "execute",
    owner: "hermes_worker_mock",
    status: "blocked",
    mappingInput: { executionAttemptStatus: "rejected", executionAttemptLane: "hermes_governed_execution" },
    allowedActions: ["rerun_smaller", "reroute", "send_back_to_shape", "request_clarification"],
    recoveryActions: ["retry_smaller", "reroute", "send_back_to_shape"],
    requiredEvidence: ["attempt", "event"],
    fixtureIds: ["governed_hermes_real_execution_unavailable"],
    futureRealSourceCoverage: "Real Hermes execution remains unavailable until a Hermes binary and containment authority are proven; dashboard visibility must show the blocked state instead of hiding the lane.",
    storyType: ["projection_adapter", "mock_status", "readiness_evidence"]
  }),
  row({
    id: "execution_attempt.failed",
    sourceEntityState: "Execution attempt failed",
    stage: "execute",
    owner: "blocked",
    status: "failed",
    mappingInput: { executionAttemptStatus: "failed", executionAttemptLane: "utility" },
    allowedActions: ["rerun_smaller", "reroute", "send_back_to_shape", "cancel_worker", "discard_result"],
    recoveryActions: ["retry_smaller", "reroute", "cancel_worker", "discard_result", "preserve_evidence", "send_back_to_shape"],
    requiredEvidence: ["attempt", "fixture"],
    fixtureIds: ["failed_stage_recovery", "partial_worker_evidence"],
    storyType: ["projection_adapter", "typed_action", "readiness_evidence"]
  }),
  row({
    id: "execution_attempt.completed",
    sourceEntityState: "Execution attempt completed",
    stage: "review",
    owner: "kendall",
    status: "complete",
    mappingInput: { executionAttemptStatus: "completed", executionAttemptLane: "utility" },
    requiredEvidence: ["attempt", "review"],
    fixtureIds: ["codex_active_claude_pending"],
    storyType: ["projection_adapter", "mock_status"]
  }),
  row({
    id: "execution_attempt.review_rejected",
    sourceEntityState: "Execution attempt review rejected",
    stage: "review",
    owner: "blocked",
    status: "blocked",
    mappingInput: { executionAttemptStatus: "rejected", executionAttemptLane: "claude_reviewer" },
    allowedActions: ["discard_result", "send_back_to_shape", "request_clarification"],
    recoveryActions: ["discard_result", "send_back_to_shape", "mark_blocked"],
    requiredEvidence: ["review", "report", "fixture"],
    fixtureIds: ["codex_active_claude_pending"],
    futureRealSourceCoverage: "Real review rejection evidence may attach report metadata while preserving rejected-finding rationale.",
    storyType: ["projection_adapter", "typed_action", "readiness_evidence"]
  }),
  row({
    id: "delivery.evidence_present",
    sourceEntityState: "Work Item done with delivery evidence",
    stage: "deliver",
    owner: "github",
    status: "complete",
    mappingInput: { workItemState: "done", hasDeliveryEvidence: true, deliveryOwner: "github" },
    allowedActions: ["approve_delivery"],
    requiredEvidence: ["gate", "pull_request"],
    fixtureIds: ["happy_path_work_packet"],
    futureRealSourceCoverage: "GitHub delivery refs may become real when authority permits connector-backed delivery.",
    storyType: ["projection_adapter", "readiness_evidence"]
  }),
  row({
    id: "memory.pending_human_approval",
    sourceEntityState: "Memory proposal pending human approval",
    stage: "learn",
    owner: "memory_review",
    status: "waiting",
    mappingInput: { workItemState: "done", memoryProposalStatus: "pending_human_approval" },
    allowedActions: ["approve_memory_proposal", "reject_packet", "edit_packet"],
    disallowedOrStaleActions: [blockedAction("send_back_to_shape", "Obsidian write-back is not allowed from fixtures.")],
    recoveryActions: ["preserve_evidence", "reopen_human_gate", "mark_blocked", "send_back_to_research"],
    requiredEvidence: ["memory", "memory_proposal"],
    fixtureIds: ["obsidian_proposal_pending_approval"],
    futureRealSourceCoverage: "Obsidian remains human-owned; future real-source coverage is proposal-only.",
    storyType: ["projection_adapter", "typed_action", "readiness_evidence"]
  }),
  row({
    id: "memory.obsidian_proposal_pending_human_approval",
    sourceEntityState: "Obsidian memory proposal pending human approval",
    stage: "learn",
    owner: "memory_review",
    status: "waiting",
    mappingInput: { workItemState: "done", hasMemoryProposal: true, memoryProposalStatus: "pending_human_approval" },
    allowedActions: ["approve_memory_proposal", "reject_packet", "edit_packet"],
    disallowedOrStaleActions: [blockedAction("send_back_to_shape", "Obsidian remains human-owned; fixtures can only propose, reject, or edit memory.")],
    recoveryActions: ["preserve_evidence", "reopen_human_gate", "mark_blocked", "send_back_to_research"],
    requiredEvidence: ["memory", "memory_proposal"],
    fixtureIds: ["obsidian_proposal_pending_approval"],
    futureRealSourceCoverage: "Real Obsidian integration remains proposal-only until a human explicitly approves write-back.",
    storyType: ["mock_status", "typed_action", "readiness_evidence"]
  }),
  row({
    id: "source.restricted_refs",
    sourceEntityState: "Restricted source refs: stale, missing, excluded, blocked",
    stage: "capture",
    owner: "kendall",
    status: "waiting",
    mappingInput: {},
    freshnessRule: "mixed",
    allowedActions: ["request_clarification", "downgrade_to_reference", "send_back_to_research"],
    recoveryActions: ["send_back_to_research", "mark_blocked"],
    requiredEvidence: ["source_ref"],
    fixtureIds: ["corrupted_incomplete_aggregate"],
    futureRealSourceCoverage: "Real source adapters must preserve restricted metadata and omit raw source copies.",
    storyType: ["projection_adapter", "typed_action", "readiness_evidence"]
  }),
  row({
    id: "source.missing",
    sourceEntityState: "No source entity present",
    stage: "capture",
    owner: "kendall",
    status: "waiting",
    mappingInput: {},
    freshnessRule: "unknown",
    requiredEvidence: ["source_ref"],
    fixtureIds: ["no_packets"],
    storyType: ["readiness_evidence"]
  }),
  row({
    id: "execution_lane.unsupported",
    sourceEntityState: "Execution lane unsupported",
    stage: "execute",
    owner: "kendall",
    status: "active",
    mappingInput: { executionAttemptStatus: "running", executionAttemptLane: "external_agent" },
    requiredEvidence: ["attempt"],
    fixtureIds: ["corrupted_incomplete_aggregate"],
    storyType: ["readiness_evidence"]
  }),
  row({
    id: "execution_lane.missing",
    sourceEntityState: "Execution attempt missing lane metadata",
    stage: "execute",
    owner: "blocked",
    status: "blocked",
    mappingInput: { executionAttemptStatus: "running", executionAttemptLane: null },
    allowedActions: ["reroute", "send_back_to_shape", "request_clarification"],
    recoveryActions: ["reroute", "send_back_to_shape", "mark_blocked"],
    requiredEvidence: ["attempt", "source_ref"],
    fixtureIds: ["corrupted_incomplete_aggregate"],
    futureRealSourceCoverage: "Real worker adapters must emit lane metadata before execution can proceed.",
    storyType: ["projection_adapter", "readiness_evidence"]
  }),
  row({
    id: "mock.hermes_unavailable",
    sourceEntityState: "Hermes worker mock unavailable",
    stage: "execute",
    owner: "hermes_worker_mock",
    status: "blocked",
    mappingInput: { executionAttemptStatus: "running", executionAttemptLane: "hermes_worker_mock" },
    allowedActions: ["rerun_smaller", "reroute", "send_back_to_shape"],
    recoveryActions: ["retry_smaller", "reroute", "send_back_to_shape"],
    requiredEvidence: ["attempt", "event"],
    fixtureIds: ["mocked_hermes_unavailable"],
    futureRealSourceCoverage: "Future Hermes adapter readiness may replace this mocked unavailable state with metadata-only worker health.",
    storyType: ["mock_status", "readiness_evidence"]
  }),
  row({
    id: "mock.codex_active",
    sourceEntityState: "Codex worker active",
    stage: "execute",
    owner: "codex_worker",
    status: "active",
    mappingInput: { executionAttemptStatus: "running", executionAttemptLane: "codex_worker" },
    requiredEvidence: ["attempt", "progress"],
    fixtureIds: ["codex_active_claude_pending"],
    futureRealSourceCoverage: "Future Codex worker events may attach progress refs while omitting raw prompts, stdout, and completions.",
    storyType: ["mock_status", "readiness_evidence"]
  }),
  row({
    id: "mock.claude_pending_skipped",
    sourceEntityState: "Claude review pending or skipped",
    stage: "review",
    owner: "claude_reviewer",
    status: "waiting",
    mappingInput: { workItemState: "reviewing", hasClaudeReviewReadiness: true },
    allowedActions: ["approve_route", "reject_packet", "edit_packet"],
    requiredEvidence: ["review", "report"],
    fixtureIds: ["codex_active_claude_pending"],
    futureRealSourceCoverage: "Claude review remains a metadata-only scarce-review lane until explicit provider approval exists.",
    storyType: ["mock_status", "typed_action", "readiness_evidence"]
  }),
  row({
    id: "readiness.local_provider_disabled",
    sourceEntityState: "Local provider disabled or unavailable",
    stage: "execute",
    owner: "local_model",
    status: "blocked",
    mappingInput: { executionAttemptStatus: "running", executionAttemptLane: "local_model" },
    allowedActions: ["approve_provider_exception", "rerun_smaller", "reroute", "send_back_to_shape"],
    recoveryActions: ["retry_smaller", "reroute", "send_back_to_shape"],
    requiredEvidence: ["local_model", "event"],
    fixtureIds: ["mocked_hermes_unavailable"],
    futureRealSourceCoverage: "Local GPU/Ollama/Hermes readiness may replace this fixture with metadata-only health evidence.",
    storyType: ["mock_status", "readiness_evidence"]
  }),
  row({
    id: "aggregate.no_packets",
    sourceEntityState: "No Work Packets",
    stage: "capture",
    owner: "kendall",
    status: "waiting",
    mappingInput: {},
    fixtureIds: ["no_packets"],
    storyType: ["fixture_ui", "readiness_evidence"]
  }),
  row({
    id: "aggregate.corrupted_incomplete",
    sourceEntityState: "Corrupted or incomplete aggregate input",
    stage: "capture",
    owner: "kendall",
    status: "blocked",
    mappingInput: {},
    allowedActions: ["send_back_to_shape", "request_clarification"],
    requiredEvidence: ["fixture", "source_ref"],
    fixtureIds: ["corrupted_incomplete_aggregate"],
    storyType: ["fixture_ui", "readiness_evidence"]
  }),
  row({
    id: "boundary.raw_retention_rejected",
    sourceEntityState: "Forbidden raw retained content",
    stage: "review",
    owner: "blocked",
    status: "blocked",
    mappingInput: {},
    allowedActions: ["send_back_to_shape", "request_clarification"],
    requiredEvidence: ["fixture"],
    fixtureIds: ["corrupted_incomplete_aggregate"],
    futureRealSourceCoverage: "Provider, worker, model, and memory adapters must keep metadata-only evidence boundaries.",
    storyType: ["readiness_evidence"]
  })
];

export const PIPELINE_STATE_FIXTURE_CATALOG_V0: PipelineFixtureCatalogEntryV0[] = [
  fixture({
    id: "happy_path_work_packet",
    label: "Canonical happy-path WorkPacketV0",
    provenance: "fixture-only",
    matrixRowIds: [
      "candidate_work.proposed",
      "candidate_work.approved_unpromoted",
      "work_item.queued",
      "work_item.triaged",
      "routing.preview_present",
      "delivery.evidence_present"
    ],
    futureCoverageStates: ["low-confidence route", "provider approval required"]
  }),
  fixture({
    id: "blocked_human_gate",
    label: "Blocked Human Gate",
    provenance: "synthetic",
    matrixRowIds: ["work_item.ready", "work_item.blocked"],
    recoveryActions: ["retry_smaller", "send_back_to_shape"],
    futureCoverageStates: ["blocked source", "recovery action available"]
  }),
  fixture({
    id: "stale_gate_action",
    label: "Stale gate action",
    provenance: "synthetic",
    matrixRowIds: ["execution.recipe_unapproved", "work_item.ready", "execution_attempt.approved"],
    futureCoverageStates: ["stale action", "contradiction detected"]
  }),
  fixture({
    id: "failed_stage_recovery",
    label: "Failed stage with recovery options",
    provenance: "fixture-only",
    matrixRowIds: ["work_item.blocked", "execution_attempt.failed"],
    recoveryActions: ["retry_smaller", "reroute", "cancel_worker", "discard_result", "preserve_evidence", "reopen_human_gate", "mark_blocked", "send_back_to_shape"],
    futureCoverageStates: ["recovery action available"]
  }),
  fixture({
    id: "partial_worker_evidence",
    label: "Partial worker evidence",
    provenance: "future-real-source",
    matrixRowIds: ["routing.preview_present", "execution_attempt.planned", "execution_attempt.running", "execution_attempt.failed"],
    evidenceTypes: ["route", "attempt", "event"],
    artifactTypes: ["progress", "fixture"],
    futureCoverageStates: ["partial worker evidence", "raw output omitted"]
  }),
  fixture({
    id: "mocked_hermes_unavailable",
    label: "Mocked Hermes unavailable",
    provenance: "mocked",
    matrixRowIds: ["execution_attempt.running", "governed_worker.hermes_dry_run_running", "mock.hermes_unavailable", "readiness.local_provider_disabled"],
    recoveryActions: ["retry_smaller", "reroute", "send_back_to_shape"],
    futureCoverageStates: ["model unavailable", "Hermes timeout"]
  }),
  fixture({
    id: "codex_active_claude_pending",
    label: "Codex active / Claude pending",
    provenance: "mocked",
    matrixRowIds: ["execution_attempt.running", "governed_worker.claude_dry_run_running", "execution_attempt.completed", "execution_attempt.review_rejected", "mock.codex_active", "mock.claude_pending_skipped"],
    recoveryActions: ["discard_result", "send_back_to_shape", "mark_blocked"],
    evidenceTypes: ["attempt", "review"],
    artifactTypes: ["progress", "report"],
    futureCoverageStates: ["Codex active", "Claude skipped due to scarce review policy", "rejected Claude finding"]
  }),
  fixture({
    id: "governed_claude_real_execution_active",
    label: "Governed Claude real execution active",
    provenance: "future-real-source",
    matrixRowIds: ["governed_worker.claude_real_execution_running"],
    evidenceTypes: ["attempt", "event", "review"],
    artifactTypes: ["progress", "fixture"],
    futureCoverageStates: ["Claude copied-worktree execution visible", "raw output omitted"]
  }),
  fixture({
    id: "governed_hermes_real_execution_unavailable",
    label: "Governed Hermes real execution unavailable",
    provenance: "future-real-source",
    matrixRowIds: ["governed_worker.hermes_real_execution_unavailable"],
    recoveryActions: ["retry_smaller", "reroute", "send_back_to_shape"],
    evidenceTypes: ["attempt", "event"],
    artifactTypes: ["fixture"],
    futureCoverageStates: ["Hermes binary missing", "containment unproven", "real launch blocked"]
  }),
  fixture({
    id: "obsidian_proposal_pending_approval",
    label: "Obsidian proposal pending human approval",
    provenance: "local-readiness",
    matrixRowIds: ["memory.pending_human_approval", "memory.obsidian_proposal_pending_human_approval"],
    recoveryActions: ["preserve_evidence", "reopen_human_gate", "mark_blocked", "send_back_to_research"],
    sourceStates: ["allowed", "blocked"],
    evidenceTypes: ["memory"],
    artifactTypes: ["memory_proposal"],
    futureCoverageStates: ["stale memory", "blocked Obsidian write-back"]
  }),
  fixture({
    id: "no_packets",
    label: "No packets",
    provenance: "fixture-only",
    matrixRowIds: ["candidate_work.deferred", "candidate_work.rejected", "source.missing", "aggregate.no_packets"],
    sourceStates: ["missing"],
    futureCoverageStates: ["empty cockpit"]
  }),
  fixture({
    id: "corrupted_incomplete_aggregate",
    label: "Corrupted or incomplete aggregate input",
    provenance: "synthetic",
    matrixRowIds: [
      "candidate_work.promoted_missing_work_item",
      "source.restricted_refs",
      "execution_lane.unsupported",
      "execution_lane.missing",
      "aggregate.corrupted_incomplete",
      "boundary.raw_retention_rejected"
    ],
    sourceStates: ["allowed", "missing", "excluded", "blocked"],
    artifactTypes: ["fixture"],
    futureCoverageStates: ["source excluded", "local GPU busy", "corrupted aggregate input"]
  })
];

export function validatePipelineStateFixtureMatrix(
  input: PipelineMatrixValidationInputV0 = {}
): PipelineMatrixValidationResultV0 {
  const matrixRows = input.matrixRows ?? PIPELINE_STATE_EVIDENCE_MATRIX_V0;
  const fixtureCatalog = input.fixtureCatalog ?? PIPELINE_STATE_FIXTURE_CATALOG_V0;
  const rowIds = new Set(matrixRows.map((row) => row.id));
  const fixtureIds = new Set(fixtureCatalog.map((fixtureEntry) => fixtureEntry.id));
  const failures: PipelineMatrixValidationFailureV0[] = [];

  for (const required of REQUIRED_MATRIX_ROW_COVERAGE) {
    if (!rowIds.has(required.id)) {
      failures.push({
        category: required.category,
        id: required.id,
        message: `Missing required ${required.category} matrix row ${required.id}.`
      });
    }
  }

  for (const requiredType of REQUIRED_STORY_TYPES) {
    if (!matrixRows.some((rowEntry) => rowEntry.storyType.includes(requiredType))) {
      failures.push({
        category: "evidence",
        id: `story_type.${requiredType}`,
        message: `Missing matrix coverage for story type ${requiredType}.`
      });
    }
  }

  for (const requiredFixtureId of REQUIRED_FIXTURE_IDS) {
    if (!fixtureIds.has(requiredFixtureId)) {
      failures.push({
        category: "fixture",
        id: requiredFixtureId,
        message: `Missing required fixture ${requiredFixtureId}.`
      });
    }
  }

    for (const rowEntry of matrixRows) {
    if (!rowEntry.workPacketFields.length) {
      failures.push({ category: "evidence", id: `${rowEntry.id}.workPacketFields`, message: "Matrix row has no WorkPacketV0 fields." });
    }
    if (!rowEntry.requiredEvidence.length) {
      failures.push({ category: "evidence", id: `${rowEntry.id}.requiredEvidence`, message: "Matrix row has no required evidence." });
    }
    if (!rowEntry.fixtureIds.length) {
      failures.push({ category: "fixture", id: `${rowEntry.id}.fixtureIds`, message: "Matrix row has no fixture coverage." });
    }
    for (const fixtureId of rowEntry.fixtureIds) {
      if (!fixtureIds.has(fixtureId)) {
        failures.push({ category: "fixture", id: `${rowEntry.id}.fixtureIds.${fixtureId}`, message: `Matrix row references missing fixture ${fixtureId}.` });
      }
    }
    const allowed = new Set<string>();
    for (const actionType of rowEntry.allowedActions) {
      if (!HUMAN_GATE_ACTION_TYPES.includes(actionType)) {
        failures.push({ category: "boundary", id: `${rowEntry.id}.allowedActions.${String(actionType)}`, message: `Matrix row allows unsupported action ${String(actionType)}.` });
      }
      if (allowed.has(actionType)) {
        failures.push({ category: "boundary", id: `${rowEntry.id}.allowedActions.${String(actionType)}.duplicate`, message: `Matrix row duplicates allowed action ${String(actionType)}.` });
      }
      allowed.add(actionType);
    }
    const disallowed = new Set<string>();
    for (const action of rowEntry.disallowedOrStaleActions) {
      if (action.type !== "unknown_action" && !HUMAN_GATE_ACTION_TYPES.includes(action.type)) {
        failures.push({ category: "boundary", id: `${rowEntry.id}.disallowedOrStaleActions.${String(action.type)}`, message: `Matrix row rejects unsupported action ${String(action.type)}.` });
      }
      if (!["disabled", "blocked", "stale"].includes(action.status)) {
        failures.push({ category: "boundary", id: `${rowEntry.id}.disallowedOrStaleActions.${String(action.type)}.status`, message: `Matrix row uses invalid disallowed status ${String(action.status)}.` });
      }
      const disallowedKey = `${action.type}:${action.status}:${action.reason}`;
      if (disallowed.has(disallowedKey)) {
        failures.push({ category: "boundary", id: `${rowEntry.id}.disallowedOrStaleActions.${String(action.type)}.duplicate`, message: `Matrix row duplicates disallowed action ${String(action.type)}.` });
      }
      disallowed.add(disallowedKey);
      if (action.status !== "stale" && allowed.has(action.type)) {
        failures.push({ category: "boundary", id: `${rowEntry.id}.actions.${String(action.type)}.conflict`, message: `Matrix row cannot both allow and block/disable ${String(action.type)}.` });
      }
    }
    const recoveryActionTypes = new Set<RecoveryActionTypeV0>();
    for (const actionType of rowEntry.recoveryActions) {
      if (recoveryActionTypes.has(actionType)) {
        failures.push({ category: "boundary", id: `${rowEntry.id}.recoveryActions.${String(actionType)}.duplicate`, message: `Matrix row duplicates recovery action ${String(actionType)}.` });
      }
      recoveryActionTypes.add(actionType);
    }
  }

  for (const fixtureEntry of fixtureCatalog) {
    if (!isFixtureProvenance(fixtureEntry.provenance)) {
      failures.push({
        category: "fixture",
        id: `${fixtureEntry.id}.provenance`,
        message: "Fixture provenance is missing or invalid."
      });
    }
    if (!Array.isArray(fixtureEntry.matrixRowIds) || fixtureEntry.matrixRowIds.length === 0) {
      failures.push({ category: "fixture", id: `${fixtureEntry.id}.matrixRowIds`, message: "Fixture does not link to matrix rows." });
    }
    for (const rowId of fixtureEntry.matrixRowIds ?? []) {
      if (!rowIds.has(rowId)) {
        failures.push({
          category: "fixture",
          id: `${fixtureEntry.id}.matrixRowIds.${rowId}`,
          message: `Fixture references missing matrix row ${rowId}.`
        });
      }
    }
    const catalogRecoveryActionTypes = new Set<RecoveryActionTypeV0>();
    for (const actionType of fixtureEntry.recoveryActions ?? []) {
      if (catalogRecoveryActionTypes.has(actionType)) {
        failures.push({ category: "boundary", id: `${fixtureEntry.id}.recoveryActions.${String(actionType)}.duplicate`, message: `Fixture duplicates recovery action ${String(actionType)}.` });
      }
      catalogRecoveryActionTypes.add(actionType);
    }
    for (const surface of REQUIRED_FIXTURE_SURFACES) {
      if (!fixtureEntry.expectedSurfaces?.includes(surface)) {
        failures.push({ category: "fixture", id: `${fixtureEntry.id}.expectedSurfaces.${surface}`, message: `Fixture is missing expected surface ${surface}.` });
      }
    }
    failures.push(...validateBoundaryObject(fixtureEntry, fixtureEntry.id));
  }

  return { ok: failures.length === 0, failures };
}

export function validateHumanGateActionModel(input: HumanGateActionValidationInputV0): PipelineMatrixValidationResultV0 {
  const failures: PipelineMatrixValidationFailureV0[] = [];
  const payload = isRecord(input.payload) ? input.payload : null;

  if (!isNonEmptyString(input.actionId)) {
    failures.push({ category: "boundary", id: "actionId", message: "Human Gate action requires an action id." });
  }
  if (!HUMAN_GATE_ACTION_TYPES.includes(input.type as HumanGateActionTypeV0)) {
    failures.push({ category: "boundary", id: "type", message: `Unsupported Human Gate action type ${String(input.type)}.` });
  }
  if (!HUMAN_GATE_ACTION_FAMILIES.includes(String(input.family))) {
    failures.push({ category: "boundary", id: "family", message: `Unsupported Human Gate action family ${String(input.family)}.` });
  }
  for (const field of ["label", "uiCopy", "authorityFamily", "rollbackPath", "auditEventType"] as const) {
    if (!isNonEmptyString(input[field])) {
      failures.push({ category: "boundary", id: field, message: `Human Gate action requires ${field}.` });
    }
  }
  if (!HUMAN_GATE_ACTION_STATUSES.includes(String(input.status))) {
    failures.push({ category: "boundary", id: "status", message: `Unsupported Human Gate action status ${String(input.status)}.` });
  }
  if (input.status !== "available" && !isNonEmptyString(input.disabledReason)) {
    failures.push({ category: "boundary", id: "disabledReason", message: "Unavailable Human Gate actions require a disabled reason." });
  }
  if (!isNonEmptyStringArray(input.reasonCodes)) {
    failures.push({ category: "boundary", id: "reasonCodes", message: "Human Gate action requires reason codes." });
  } else {
    const seenReasonCodes = new Set<string>();
    for (const reasonCode of input.reasonCodes) {
      if (!/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/.test(reasonCode)) {
        failures.push({ category: "boundary", id: "reasonCodes.format", message: `Human Gate action reason code ${reasonCode} is not machine-readable.` });
      }
      if (seenReasonCodes.has(reasonCode)) {
        failures.push({ category: "boundary", id: "reasonCodes.duplicate", message: `Human Gate action duplicates reason code ${reasonCode}.` });
      }
      seenReasonCodes.add(reasonCode);
    }
  }
  if (!payload || !isNonEmptyString(payload.packetId)) {
    failures.push({ category: "boundary", id: "payload.packetId", message: "Human Gate action payload must bind to a packet id." });
  }
  if (!payload || !isNonEmptyString(payload.decisionId)) {
    failures.push({ category: "boundary", id: "payload.decisionId", message: "Human Gate action payload must bind to the current decision id." });
  }
  if (!payload || !isNonEmptyString(payload.actionId) || payload.actionId !== input.actionId) {
    failures.push({ category: "boundary", id: "payload.actionId", message: "Human Gate action payload must bind to the current action id." });
  }
  if (payload && isNonEmptyString(payload.packetId) && isNonEmptyString(input.actionId) && !input.actionId.startsWith(`${payload.packetId}:`)) {
    failures.push({ category: "boundary", id: "payload.packetId", message: "Human Gate action id must bind to the payload packet id." });
  }
  if (payload && isNonEmptyString(payload.packetId) && isNonEmptyString(payload.decisionId) && !payload.decisionId.startsWith(`${payload.packetId}:`)) {
    failures.push({ category: "boundary", id: "payload.decisionId", message: "Human Gate decision id must bind to the payload packet id." });
  }
  if (!isNonEmptyStringArray(input.requiredEvidenceRefs)) {
    failures.push({ category: "evidence", id: "requiredEvidenceRefs", message: "Human Gate action requires evidence refs." });
  }
  if (!isNonEmptyStringArray(input.stopLines)) {
    failures.push({ category: "boundary", id: "stopLines", message: "Human Gate action requires stop lines." });
  }
  if (!PIPELINE_STAGES.includes(input.resultingStage as PipelineStage)) {
    failures.push({ category: "state", id: "resultingStage", message: "Human Gate action requires a valid resulting stage." });
  }
  if (!WORK_PACKET_OWNERS.includes(input.resultingOwner as WorkPacketOwner)) {
    failures.push({ category: "state", id: "resultingOwner", message: "Human Gate action requires a valid resulting owner." });
  }

  return { ok: failures.length === 0, failures };
}

export function getMissingHumanGateActionFixtureCoverage(
  matrixRows: PipelineStateEvidenceMatrixRowV0[] = PIPELINE_STATE_EVIDENCE_MATRIX_V0
): HumanGateActionTypeV0[] {
  const covered = new Set<HumanGateActionTypeV0>();
  for (const rowEntry of matrixRows) {
    for (const actionType of rowEntry.allowedActions) {
      covered.add(actionType);
    }
    for (const action of rowEntry.disallowedOrStaleActions) {
      if (action.type !== "unknown_action" && action.reason !== DEFAULT_DISALLOWED_ACTION_REASON) {
        covered.add(action.type);
      }
    }
  }
  return HUMAN_GATE_ACTION_TYPES.filter((actionType) => !covered.has(actionType));
}

function contractRow(
  id: string,
  workPacketFields: string[],
  requiredEvidence: PipelineStateEvidenceMatrixRowV0["requiredEvidence"] = ["fixture"],
  allowedActions: HumanGateActionTypeV0[] = []
): PipelineStateEvidenceMatrixRowV0 {
  return row({
    id,
    sourceEntityState: id.replace(/^contract\./, "Work Packet contract "),
    stage: "capture",
    owner: "kendall",
    status: "active",
    mappingInput: {},
    workPacketFields,
    allowedActions,
    requiredEvidence,
    fixtureIds: ["happy_path_work_packet"],
    futureRealSourceCoverage: "Contract field must remain stable as future real sources are attached.",
    storyType: ["contract"]
  });
}

function row(input: Partial<PipelineStateEvidenceMatrixRowV0> & {
  id: string;
  sourceEntityState: string;
  stage: PipelineStage;
  owner: WorkPacketOwner;
  status: WorkPacketStatus;
  mappingInput: WorkPacketStageMappingInputV0;
  fixtureIds: string[];
  storyType: PipelineMatrixStoryTypeV0[];
}): PipelineStateEvidenceMatrixRowV0 {
  const entry: PipelineStateEvidenceMatrixRowV0 = {
    workPacketFields: ["packetId", "currentStage", "currentOwner", "status", "sourceRefs", "evidenceRefs", "artifactRefs"],
    freshnessRule: "fresh",
    allowedActions: [],
    disallowedOrStaleActions: [],
    recoveryActions: [],
    requiredEvidence: ["source_ref", "fixture"],
    futureRealSourceCoverage: "Future real-source coverage is metadata-only and must preserve the same row semantics.",
    ...input
  };
  return {
    ...entry,
    disallowedOrStaleActions: completeDisallowedActions(entry.allowedActions, entry.disallowedOrStaleActions)
  };
}

function completeDisallowedActions(
  allowedActions: HumanGateActionTypeV0[],
  explicitActions: PipelineDisallowedActionV0[]
): PipelineDisallowedActionV0[] {
  const allowed = new Set(allowedActions);
  const explicit = new Set(explicitActions.map((action) => action.type));
  return explicitActions.concat(
    HUMAN_GATE_ACTION_TYPES
      .filter((actionType) => !allowed.has(actionType) && !explicit.has(actionType))
      .map((actionType) => blockedAction(actionType, DEFAULT_DISALLOWED_ACTION_REASON))
  );
}

function fixture(input: Partial<PipelineFixtureCatalogEntryV0> & {
  id: string;
  label: string;
  provenance: PipelineFixtureProvenanceV0;
  matrixRowIds: string[];
}): PipelineFixtureCatalogEntryV0 {
  return {
    expectedSurfaces: ["sourceRefs", "evidenceRefs", "artifactRefs"],
    sourceStates: ["allowed"],
    evidenceTypes: ["fixture"],
    artifactTypes: ["fixture"],
    recoveryActions: [],
    memoryWriteBackAllowed: false,
    futureCoverageStates: [],
    ...input
  };
}

function blockedAction(type: HumanGateActionTypeV0 | "unknown_action", reason: string): PipelineDisallowedActionV0 {
  return { type, status: "blocked", reason };
}

function staleAction(type: HumanGateActionTypeV0, reason: string): PipelineDisallowedActionV0 {
  return { type, status: "stale", reason };
}

function isFixtureProvenance(value: unknown): value is PipelineFixtureProvenanceV0 {
  return typeof value === "string" && ["fixture-only", "mocked", "synthetic", "local-readiness", "future-real-source"].includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

function validateBoundaryObject(value: unknown, path: string): PipelineMatrixValidationFailureV0[] {
  const failures: PipelineMatrixValidationFailureV0[] = [];
  if (Array.isArray(value)) {
    value.forEach((entry, index) => failures.push(...validateBoundaryObject(entry, `${path}[${index}]`)));
    return failures;
  }
  if (!value || typeof value !== "object") {
    return failures;
  }
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (isForbiddenRawRetentionKey(key)) {
      failures.push({
        category: "boundary",
        id: childPath,
        message: `${childPath} violates metadata-only evidence boundary.`
      });
    }
    if (key === "rawPayloadRetained" && child !== false) {
      failures.push({
        category: "boundary",
        id: childPath,
        message: `${childPath} must be false.`
      });
    }
    if (key === "writeBackAllowed" && child !== false) {
      failures.push({
        category: "boundary",
        id: childPath,
        message: `${childPath} must be false.`
      });
    }
    failures.push(...validateBoundaryObject(child, childPath));
  }
  return failures;
}

function isForbiddenRawRetentionKey(key: string): boolean {
  if (key === "rawPayloadRetained") {
    return false;
  }
  return /^(raw.*(prompt|completion|output|stdout|stderr|payload|response)|.*(secret|credential).*)$/i.test(key) ||
    /^(provider|model|worker).*(payload|response)$/i.test(key) ||
    /^(stdout|stderr|reasoningTrace)$/i.test(key);
}
