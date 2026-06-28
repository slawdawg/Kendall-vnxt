import type {
  AlphaMemorySourceStatusV0,
  HumanGateActionV0,
  MemoryProposalV0,
  PipelineStage,
  RecoveryActionV0,
  RecoveryActionTypeV0,
  SourceRefV0,
  WorkPacketOwner,
  WorkPacketV0View,
} from "@kendall/contracts";
import {
  PIPELINE_STATE_EVIDENCE_MATRIX_V0,
  PIPELINE_STATE_FIXTURE_CATALOG_V0,
} from "@kendall/workflow-core";

type PipelineMatrixRow = (typeof PIPELINE_STATE_EVIDENCE_MATRIX_V0)[number];

export type PipelineFixtureKind =
  | "fixture-only"
  | "mocked"
  | "synthetic"
  | "local-readiness"
  | "future-real-source";

export type PipelineFixturePacket = WorkPacketV0View & {
  fixtureId: string;
  fixtureKind: PipelineFixtureKind;
  fixtureLabel: string;
  summary: string;
  nextAction: string;
  confidenceLabel: string;
  freshnessLabel: string;
  sourceTrustState: PipelineSourceTrustState;
  sourceTrustStates: PipelineSourceTrustState[];
  sourceTrustSummary: string;
  routeFork: PipelineRouteForkFixture;
  lastEvent: string;
  riskFlags: string[];
  matrixRowIds: string[];
  humanGateFixtureEvents: HumanGateFixtureEvent[];
  recoveryFixtureEvents: RecoveryFixtureEvent[];
  actionGuardFixtures: ActionGuardFixture[];
  localModelHealth: LocalModelHealthV0 | null;
  hermesJob: HermesJobPacketV0 | null;
  codexWorker: CodexWorkerPacketV0 | null;
  claudeReview: ClaudeReviewPacketV0 | null;
};

type WorkPacketExecutionAttemptSummary = WorkPacketV0View["executionAttempts"][number];

type GovernedWorkerAttemptFixtureInput = {
  worker: "claude" | "hermes";
  status: "planned" | "running" | "rejected" | "failed" | "completed";
  evidenceRef: string;
  eventRef: string;
  packetId: string;
  authorityMode?: "non_executing_dry_run" | "version_probe" | "smoke_execution" | "copied_worktree_worker_execution";
  lane?: "claude_execution_dry_run" | "hermes_execution_dry_run" | "claude_governed_execution" | "hermes_governed_execution";
  label?: string;
  failureReason?: string;
  rejectionReason?: string;
};

type GovernedWorkerAttemptFixtureOptions = Omit<GovernedWorkerAttemptFixtureInput, "packetId" | "evidenceRef" | "eventRef"> & {
  sourceEvidenceRef?: string;
  sourceEventRef?: string;
};

export type GovernedCopiedWorktreeExecutionEvidenceV0 = {
  source_id: string;
  worker: "claude" | "hermes";
  mode: "copied_worktree_execution";
  authority_level: "copied_worktree_worker_execution";
  execution_state:
    | "missing"
    | "unsupported"
    | "copy_failed"
    | "execution_observed"
    | "failed"
    | "timed_out"
    | "invalid_output";
  evidence_ref: string;
  status_event_ref?: string | null;
  observed_at: string;
  expected_response: "KENDALL_COPY_EXECUTION_OK" | "KENDALL_PATCH_PROPOSAL_OK";
  observed_response: "KENDALL_COPY_EXECUTION_OK" | "KENDALL_PATCH_PROPOSAL_OK" | null;
  output_contract_diagnostic?:
    | "not_applicable"
    | "empty_output"
    | "stderr_raw_marker"
    | "stdout_not_json"
    | "stdout_json_not_object"
    | "stdout_raw_marker"
    | "missing_result"
    | "unexpected_result"
    | "missing_proposal"
    | "unexpected_proposal"
    | "structured_match";
  task_id?: "copy_execution_sentinel" | "starter_patch_proposal";
  proposal_target_file?: "README.md" | null;
  proposal_change_kind?: "append_line" | null;
  proposal_summary?: "Add a harmless Kendall starter note" | null;
  exit_code: number | null;
  timed_out: boolean;
  command_path: string | null;
  copied_tracked_files: number;
  copy_bytes: number;
  copy_retained: false;
  network_allowed: boolean;
  session_inheritance_allowed: boolean;
  source_mutation_allowed: false;
  tools_allowed: false;
  raw_output_retained: false;
  affects_trust: false;
  affects_routing: false;
};

export type GovernedCopiedWorktreeExecutionEvidenceSnapshotV0 = {
  schema_version: "governed_worker_copied_worktree_evidence_snapshot.v0";
  generated_at: string;
  metadata_only: true;
  raw_payload_retained: false;
  dashboard_consumption: "no_live_calls";
  attempts: GovernedCopiedWorktreeExecutionEvidenceV0[];
  errors: unknown[];
};

const GOVERNED_COPIED_WORKTREE_SNAPSHOT_FIELDS = new Set([
  "schema_version",
  "generated_at",
  "metadata_only",
  "raw_payload_retained",
  "dashboard_consumption",
  "attempts",
  "errors",
]);

const GOVERNED_COPIED_WORKTREE_EVIDENCE_FIELDS = new Set([
  "source_id",
  "worker",
  "mode",
  "authority_level",
  "execution_state",
  "command_path",
  "expected_response",
  "observed_response",
  "output_contract_diagnostic",
  "task_id",
  "proposal_target_file",
  "proposal_change_kind",
  "proposal_summary",
  "exit_code",
  "timed_out",
  "observed_at",
  "evidence_ref",
  "status_event_ref",
  "copied_tracked_files",
  "copy_bytes",
  "copy_retained",
  "network_allowed",
  "session_inheritance_allowed",
  "source_mutation_allowed",
  "tools_allowed",
  "raw_output_retained",
  "affects_trust",
  "affects_routing",
]);

export type LocalModelHealthV0 = {
  provider: "ollama";
  endpointUrl: string | null;
  approvedEndpointUrl: string;
  endpointApproved: boolean;
  modelId: string | null;
  approvedModelId: string;
  modelApproved: boolean;
  reachable: boolean | null;
  busyState: "idle" | "busy" | "unknown";
  allowedCaller: string;
  lastLatencyMs?: number | null;
  lastFailure?: string | null;
  callAuthorityState: "disabled" | "approval_required" | "approved" | "blocked";
  retentionPolicy: "metadata_only";
  statusLabel: "healthy" | "unavailable" | "busy" | "model_mismatch" | "endpoint_mismatch" | "approval_required";
  dataSource: "fixture_or_wrapper_state_only";
  evidenceRef: string;
  fallbackPath: string;
  authoritySummary: string;
  noProbeBoundary: "Dashboard does not probe the Windows Ollama endpoint";
};

export type HermesJobPacketV0 = {
  jobId: string;
  packetId: string;
  workerProfile: string;
  inputRefs: string[];
  allowedMounts: string[];
  writableOutputDir: string;
  networkPolicy: "none" | "kendall_gateway_only";
  credentialPolicy: "none";
  sourceMutationPolicy: "forbidden";
  timeoutSeconds: number;
  expectedOutputSchema: string;
  cleanupPolicy: string;
  killSwitch: string;
  executionMode: "mocked";
  statusLabel: "mocked_ready" | "mocked_timeout" | "blocked_containment";
  evidenceRef: string;
  containmentSummary: string;
  boundarySummary: string;
};

export type CodexWorkerPacketV0 = {
  workerId: string;
  packetId: string;
  role: "implementation_worker";
  readiness: "ready" | "active" | "blocked";
  attemptRefs: string[];
  currentState: "readiness_only" | "active_attempt" | "blocked_unavailable";
  blockedState: string;
  retentionPolicy: "metadata_only";
  evidenceRef: string;
  boundarySummary: string;
};

export type ClaudeReviewPacketV0 = {
  reviewId: string;
  packetId: string;
  purpose: "independent_review" | "security_review" | "edge_case_review" | "architecture_review";
  allowedContextRefs: string[];
  excludedContextRefs: string[];
  retentionPolicy: "metadata_only";
  expectedFindingsSchema: string;
  independenceMarker: "clean_context" | "codex_output_review" | "operator_selected";
  costScarcity: "scarce";
  approvalRequirement: "required" | "policy_triggered";
  executionMode: "readiness_or_packet_only";
  statusLabel: "pending" | "skipped" | "blocked";
  evidenceRef: string;
  boundarySummary: string;
};

export type HumanGateFixtureEvent = {
  eventId: string;
  actionId: string;
  eventType: string;
  summary: string;
  fromStage: PipelineStage;
  fromOwner: WorkPacketOwner;
  toStage: PipelineStage;
  toOwner: WorkPacketOwner;
  evidenceRefs: string[];
  auditEventType: string;
};

export type RecoveryFixtureEvent = {
  eventId: string;
  actionId: string;
  eventType: string;
  summary: string;
  fromStage: PipelineStage;
  fromOwner: WorkPacketOwner;
  toStage: PipelineStage;
  toOwner: WorkPacketOwner;
  evidenceRefs: string[];
  auditEventType: string;
  requiresHumanGate: boolean;
  humanGateActionId: string | null;
};

export type ActionGuardFixture = {
  guardId: string;
  actionId: string;
  actionSurface: "human_gate" | "recovery";
  actionType: string;
  classification:
    | "stale_packet_state"
    | "stale_action_id"
    | "missing_evidence"
    | "unknown_action"
    | "unsafe_authority_class"
    | "blocked_source_boundary";
  unsafeClass: "real_hermes_launch" | "obsidian_mutation" | "model_gateway_replacement" | "expanded_claude_automation" | "evidence_retention_bypass" | "none";
  expectedPacketId: string;
  actualPacketId: string;
  expectedActionId: string;
  actualActionId: string;
  expectedState: string;
  actualState: string;
  disabledReason: string;
  stopLine: string;
  safeNextOption: string;
  resultingStage: PipelineStage;
  resultingOwner: WorkPacketOwner;
  evidenceRefs: string[];
  fixtureEventId: string | null;
  primaryRisk: "false_authority" | "unsafe_mutation" | "missing_evidence" | "unknown_action" | "blocked_boundary";
};

export type FixtureActionDecision = {
  submitCapable: boolean;
  guard: ActionGuardFixture | null;
  disabledReason: string;
  primaryRisk: ActionGuardFixture["primaryRisk"] | "none";
};

export type PipelineRouteForkFixture = {
  selectedRoute: string;
  rejectedRoutes: string[];
  tags: string[];
  sourceContext: string;
  lowConfidenceActions: string[];
};

export type PipelineSourceTrustState =
  | "included"
  | "excluded"
  | "stale"
  | "contradictory"
  | "unavailable"
  | "derived-only";

export type PipelineSourceRailItem = {
  id: string;
  label: string;
  state: PipelineSourceTrustState;
  summary: string;
  packetRefs: string[];
  evidenceNote: string;
  canonicalRole: string;
};

export type SourceBoundaryDeclarationV0 = {
  boundaryId: "work_packet_v0" | "obsidian" | "llm_wiki" | "hermes" | "ollama" | "codex" | "claude";
  label: string;
  canonicality: string;
  allowedReads: string[];
  allowedWrites: string[];
  retentionClass: "metadata_only" | "summary_only" | "derived_rebuildable" | "human_owned" | "fixture_only";
  blockedOperations: string[];
  boundarySummary: string;
};

export type PipelineFixtureScenario = {
  scenarioId: string;
  label: string;
  selectedPacketId: string | null;
  currentOwner: WorkPacketOwner | "none";
  fixtureLabel: string;
  blockedReason: string;
  nextOperatorOption: string;
  evidenceRefs: string[];
  stopLine: string;
  rollbackPath: string;
};

export type PipelineGoldenPathSnapshot = {
  snapshotId: string;
  label: string;
  packetId: string;
  currentStage: PipelineStage;
  currentOwner: WorkPacketOwner;
  evidenceRef: string;
  nextAction: string;
  decisionConsequence: string;
  whatPacketIs: string;
  whyHere: string;
  whatNeedsOperator: string;
  whatHappensNext: string;
};

export const pipelineStages: PipelineStage[] = [
  "capture",
  "classify",
  "route",
  "shape",
  "human_gate",
  "execute",
  "review",
  "promote",
  "deliver",
  "learn",
];

export const pipelineSourceRail: PipelineSourceRailItem[] = [
  {
    id: "candidate-work",
    label: "Candidate Work",
    state: "included",
    summary: "Included local work intake.",
    packetRefs: ["fixture:happy-path", "fixture:classify-intake", "fixture:shape-plan", "fixture:failed-stage", "fixture:review-complete", "fixture:review-rejected", "fixture:promote-candidate", "fixture:deliver-evidence"],
    evidenceNote: "Metadata-only candidate context.",
    canonicalRole: "local intake",
  },
  {
    id: "obsidian-inbox",
    label: "Obsidian inbox",
    state: "excluded",
    summary: "Human-owned canonical memory is visible but not copied or mutated.",
    packetRefs: ["fixture:stale-source", "fixture:learn-memory"],
    evidenceNote: "Write-back blocked in fixture mode.",
    canonicalRole: "canonical, human-owned",
  },
  {
    id: "bmad-artifacts",
    label: "BMAD artifacts",
    state: "included",
    summary: "Story and matrix artifacts are fixture inputs.",
    packetRefs: ["fixture:happy-path", "fixture:human-gate-blocked", "fixture:classify-intake", "fixture:shape-plan", "fixture:failed-stage", "fixture:review-complete", "fixture:review-rejected", "fixture:promote-candidate", "fixture:deliver-evidence"],
    evidenceNote: "Artifact refs only.",
    canonicalRole: "planning artifact",
  },
  {
    id: "research-video",
    label: "research/video",
    state: "stale",
    summary: "Research refs are summarized, not copied.",
    packetRefs: ["fixture:stale-source", "fixture:learn-memory"],
    evidenceNote: "Summary-only stale ref.",
    canonicalRole: "supporting context",
  },
  {
    id: "github",
    label: "GitHub",
    state: "unavailable",
    summary: "No live GitHub call in fixture mode.",
    packetRefs: ["fixture:deliver-evidence"],
    evidenceNote: "Adapter unavailable.",
    canonicalRole: "future delivery source",
  },
  {
    id: "manual-capture",
    label: "manual capture",
    state: "contradictory",
    summary: "Manual notes conflict with stale research and require operator review.",
    packetRefs: ["fixture:stale-source", "fixture:learn-memory"],
    evidenceNote: "Contradiction is named, not resolved automatically.",
    canonicalRole: "operator supplied",
  },
  {
    id: "llm-wiki",
    label: "LLM-Wiki digest",
    state: "derived-only",
    summary: "Derived and rebuildable; never the source of truth.",
    packetRefs: ["fixture:stale-source", "fixture:learn-memory"],
    evidenceNote: "Derived metadata only.",
    canonicalRole: "derived, non-canonical",
  },
];

export const pipelineSourceBoundaryChecklist: SourceBoundaryDeclarationV0[] = [
  {
    boundaryId: "work_packet_v0",
    label: "WorkPacketV0",
    canonicality: "operational view contract",
    allowedReads: ["metadata refs", "summary fields", "fixture evidence"],
    allowedWrites: ["none from dashboard fixture mode"],
    retentionClass: "metadata_only",
    blockedOperations: ["raw payload retention", "inventing authority", "source mutation"],
    boundarySummary: "WorkPacketV0 is the cockpit view contract and does not own canonical source data.",
  },
  {
    boundaryId: "obsidian",
    label: "Obsidian",
    canonicality: "canonical, human-owned",
    allowedReads: ["summary-only source refs", "operator-approved future review workflow"],
    allowedWrites: ["none in fixture mode", "future human-approved durable write-back only"],
    retentionClass: "human_owned",
    blockedOperations: ["direct write-back", "canonical mutation", "note overwrite", "agent-owned memory promotion"],
    boundarySummary: "Obsidian is canonical and human-owned; Obsidian wins by default when derived memory conflicts.",
  },
  {
    boundaryId: "llm_wiki",
    label: "LLM-Wiki",
    canonicality: "derived, disposable, rebuildable",
    allowedReads: ["derived summary refs", "rebuildable index metadata"],
    allowedWrites: ["rebuild derived index only"],
    retentionClass: "derived_rebuildable",
    blockedOperations: ["promote derived wiki to source of truth", "override Obsidian", "durable vault write-back"],
    boundarySummary: "LLM-Wiki is derived, disposable, and rebuildable; it never overrules Obsidian.",
  },
  {
    boundaryId: "hermes",
    label: "Hermes",
    canonicality: "mocked worker lane only",
    allowedReads: ["packet-local fixture refs"],
    allowedWrites: ["mocked output metadata only"],
    retentionClass: "fixture_only",
    blockedOperations: ["real worker launch", "Docker execution", "source mutation", "network egress"],
    boundarySummary: "Hermes remains mocked until containment authority exists.",
  },
  {
    boundaryId: "ollama",
    label: "Ollama / Local GPU",
    canonicality: "local provider readiness state",
    allowedReads: ["fixture or wrapper health metadata"],
    allowedWrites: ["none from dashboard"],
    retentionClass: "metadata_only",
    blockedOperations: ["provider execution from dashboard", "endpoint discovery", "model gateway replacement"],
    boundarySummary: "Ollama is visible as approved local readiness metadata, not direct dashboard execution.",
  },
  {
    boundaryId: "codex",
    label: "Codex",
    canonicality: "implementation-worker metadata",
    allowedReads: ["attempt refs", "packet-local evidence refs"],
    allowedWrites: ["implementation artifacts only through separate authorized workflow"],
    retentionClass: "metadata_only",
    blockedOperations: ["self-review authority", "dashboard process launch", "source mutation from fixture mode"],
    boundarySummary: "Codex is implementation-worker state, not an independent reviewer or cockpit source of truth.",
  },
  {
    boundaryId: "claude",
    label: "Claude",
    canonicality: "scarce independent review metadata",
    allowedReads: ["approved review packet refs"],
    allowedWrites: ["review findings metadata only"],
    retentionClass: "metadata_only",
    blockedOperations: ["implementation-lane use", "routine automation", "provider call from dashboard"],
    boundarySummary: "Claude is review-only and cannot become an implementation lane in v0.",
  },
];

const catalogById = new Map(PIPELINE_STATE_FIXTURE_CATALOG_V0.map((entry) => [entry.id, entry]));
const rowById = new Map(PIPELINE_STATE_EVIDENCE_MATRIX_V0.map((entry) => [entry.id, entry]));
const recoveryActionTypes: RecoveryActionTypeV0[] = [
  "retry_smaller",
  "reroute",
  "cancel_worker",
  "discard_result",
  "preserve_evidence",
  "reopen_human_gate",
  "mark_blocked",
  "send_back_to_shape",
  "send_back_to_research",
];

export const pipelineFixtureMode = {
  label: "Fixture mode",
  summary: "Static WorkPacketV0 fixtures only. No provider, worker, GitHub, or Obsidian calls are made by this route.",
  matrixRows: PIPELINE_STATE_EVIDENCE_MATRIX_V0.length,
  fixtureCatalogEntries: PIPELINE_STATE_FIXTURE_CATALOG_V0.length,
};

export const pipelineLocalModelHealthFixtures: LocalModelHealthV0[] = [
  localModelHealthFixture("healthy", "fixture:local-model-healthy"),
  localModelHealthFixture("unavailable", "fixture:local-model-unavailable"),
  localModelHealthFixture("busy", "fixture:local-model-busy"),
  localModelHealthFixture("model_mismatch", "fixture:local-model-model-mismatch"),
  localModelHealthFixture("endpoint_mismatch", "fixture:local-model-endpoint-mismatch"),
  localModelHealthFixture("approval_required", "fixture:local-model-approval-required"),
];

export const pipelineHermesJobFixtures: HermesJobPacketV0[] = [
  hermesJobFixture("mocked_ready", "fixture:mocked-worker-ready"),
  hermesJobFixture("mocked_timeout", "fixture:mocked-worker"),
  hermesJobFixture("blocked_containment", "fixture:mocked-worker-blocked-containment"),
];

export const pipelineCodexWorkerFixtures: CodexWorkerPacketV0[] = [
  codexWorkerFixture("ready", "fixture:codex-ready"),
  codexWorkerFixture("active", "fixture:codex-active"),
  codexWorkerFixture("blocked", "fixture:codex-blocked"),
];

export const pipelineClaudeReviewFixtures: ClaudeReviewPacketV0[] = [
  claudeReviewFixture("pending", "fixture:claude-pending"),
  claudeReviewFixture("skipped", "fixture:claude-skipped"),
  claudeReviewFixture("blocked", "fixture:review-rejected"),
];

const memoryProposalStates: MemoryProposalV0["status"][] = [
  "not_applicable",
  "proposed",
  "pending_human_approval",
  "approved",
  "rejected",
  "deferred",
  "edit_needed",
  "stale",
  "contradictory",
  "blocked",
];

export const pipelineFixturePackets: PipelineFixturePacket[] = [
  packetFixture({
    packetId: "fixture:happy-path",
    title: "Shape cockpit route from Work Packet matrix",
    requestedOutcome: "Open the pipeline cockpit with a usable fixture-backed operating surface.",
    currentStage: "route",
    currentOwner: "kendall",
    status: "active",
    riskLevel: "medium",
    priority: "high",
    fixtureId: "happy_path_work_packet",
    matrixRowIds: ["routing.preview_present", "contract.route_summary"],
    fixtureKind: "fixture-only",
    summary: "Happy path packet has route evidence and enough context to show the first cockpit frame.",
    nextAction: "Review route",
    confidenceLabel: "High confidence",
    freshnessLabel: "fresh",
    sourceTrustState: "included",
    sourceTrustStates: ["included"],
  }),
  packetFixture({
    packetId: "fixture:human-gate-blocked",
    title: "Approve bounded cockpit fixture plan",
    requestedOutcome: "Show operator decision pressure without enabling live execution.",
    currentStage: "human_gate",
    currentOwner: "operator",
    status: "waiting",
    riskLevel: "high",
    priority: "urgent",
    fixtureId: "blocked_human_gate",
    matrixRowIds: ["work_item.ready"],
    fixtureKind: "synthetic",
    summary: "Human Gate fixture names the blocked action, evidence requirement, stop line, and recovery option.",
    nextAction: "Human Gate",
    confidenceLabel: "Approval required",
    freshnessLabel: "fresh",
    sourceTrustState: "included",
    sourceTrustStates: ["included"],
    codexWorkerState: "ready",
  }),
  packetFixture({
    packetId: "fixture:stale-source",
    title: "Resolve stale research source before routing",
    requestedOutcome: "Keep stale and derived sources visible instead of treating them as trusted memory.",
    currentStage: "capture",
    currentOwner: "kendall",
    status: "waiting",
    riskLevel: "medium",
    priority: "normal",
    fixtureId: "corrupted_incomplete_aggregate",
    matrixRowIds: ["source.restricted_refs"],
    fixtureKind: "synthetic",
    summary: "Stale source fixture shows excluded, missing, blocked, and derived-only context in the rail and drawer.",
    nextAction: "Clarify source",
    confidenceLabel: "Low confidence",
    freshnessLabel: "stale",
    sourceTrustState: "stale",
    sourceTrustStates: ["excluded", "stale", "contradictory", "derived-only"],
    sourceTrustSummary: "Research is stale, manual capture is contradictory, Obsidian is excluded, and LLM-Wiki is derived-only.",
    routeFork: {
      selectedRoute: "capture",
      rejectedRoutes: ["route", "shape"],
      tags: ["low-confidence", "source-boundary", "memory-review"],
      sourceContext: "Research is stale, manual capture conflicts, and Obsidian remains excluded from automatic write-back.",
      lowConfidenceActions: ["Clarify", "Downgrade to reference", "Send back to Research"],
    },
    lastEvent: "Restricted source refs were detected in the fixture matrix.",
    riskFlags: ["stale source", "contradictory manual capture", "derived-only LLM-Wiki"],
  }),
  packetFixture({
    packetId: "fixture:classify-intake",
    title: "Classify BMAD planning intake",
    requestedOutcome: "Show classification before route evidence is ready.",
    currentStage: "classify",
    currentOwner: "kendall",
    status: "active",
    riskLevel: "medium",
    priority: "normal",
    fixtureId: "happy_path_work_packet",
    matrixRowIds: ["work_item.triaged", "contract.source_refs"],
    fixtureKind: "fixture-only",
    summary: "Classification fixture keeps owner, source, and evidence visible before route selection.",
    nextAction: "Classify route",
    confidenceLabel: "Medium confidence",
    freshnessLabel: "fresh",
    sourceTrustState: "included",
    sourceTrustStates: ["included"],
    localModelHealthStatus: "healthy",
  }),
  packetFixture({
    packetId: "fixture:shape-plan",
    title: "Shape execution recipe preview",
    requestedOutcome: "Show shaping state before any execution approval exists.",
    currentStage: "shape",
    currentOwner: "kendall",
    status: "active",
    riskLevel: "medium",
    priority: "high",
    fixtureId: "stale_gate_action",
    matrixRowIds: ["execution.recipe_unapproved", "contract.human_gate_actions"],
    fixtureKind: "synthetic",
    summary: "Shape fixture names recipe evidence without enabling execution.",
    nextAction: "Shape packet",
    confidenceLabel: "Medium confidence",
    freshnessLabel: "fresh",
    sourceTrustState: "included",
    sourceTrustStates: ["included"],
    localModelHealthStatus: "approval_required",
  }),
  packetFixture({
    packetId: "fixture:local-model-unavailable",
    title: "Local model unavailable for route explanation",
    requestedOutcome: "Show unavailable Ollama health without falling back to another provider.",
    currentStage: "execute",
    currentOwner: "local_model",
    status: "blocked",
    riskLevel: "medium",
    priority: "high",
    fixtureId: "mocked_hermes_unavailable",
    matrixRowIds: ["readiness.local_provider_disabled"],
    fixtureKind: "local-readiness",
    summary: "Local GPU/Ollama health is unavailable from fixture state and does not trigger provider fallback.",
    nextAction: "Refresh local health evidence",
    confidenceLabel: "Model unavailable",
    freshnessLabel: "fixture-only",
    sourceTrustState: "included",
    sourceTrustStates: ["included"],
    localModelHealthStatus: "unavailable",
  }),
  packetFixture({
    packetId: "fixture:local-model-busy",
    title: "Local GPU busy for evidence explanation",
    requestedOutcome: "Show busy RTX/Ollama capacity before any model use.",
    currentStage: "execute",
    currentOwner: "local_model",
    status: "blocked",
    riskLevel: "medium",
    priority: "normal",
    fixtureId: "mocked_hermes_unavailable",
    matrixRowIds: ["readiness.local_provider_disabled"],
    fixtureKind: "local-readiness",
    summary: "Local GPU health is busy in fixture mode and the packet remains waiting.",
    nextAction: "Wait or reroute through Human Gate",
    confidenceLabel: "Local GPU busy",
    freshnessLabel: "fixture-only",
    sourceTrustState: "included",
    sourceTrustStates: ["included"],
    localModelHealthStatus: "busy",
  }),
  packetFixture({
    packetId: "fixture:local-model-model-mismatch",
    title: "Configured Ollama model differs from approved model",
    requestedOutcome: "Show model mismatch before any local provider call.",
    currentStage: "shape",
    currentOwner: "kendall",
    status: "active",
    riskLevel: "high",
    priority: "high",
    fixtureId: "stale_gate_action",
    matrixRowIds: ["execution.recipe_unapproved"],
    fixtureKind: "local-readiness",
    summary: "Model id does not match the approved qwen3:14b fixture policy.",
    nextAction: "Request provider approval",
    confidenceLabel: "Model mismatch",
    freshnessLabel: "fixture-only",
    sourceTrustState: "included",
    sourceTrustStates: ["included"],
    localModelHealthStatus: "model_mismatch",
  }),
  packetFixture({
    packetId: "fixture:local-model-endpoint-mismatch",
    title: "Configured Ollama endpoint differs from approved endpoint",
    requestedOutcome: "Show endpoint mismatch and provider approval requirement.",
    currentStage: "human_gate",
    currentOwner: "operator",
    status: "waiting",
    riskLevel: "high",
    priority: "urgent",
    fixtureId: "stale_gate_action",
    matrixRowIds: ["work_item.ready", "contract.human_gate_actions"],
    fixtureKind: "local-readiness",
    summary: "Endpoint mismatch is visible and requires a provider exception gate.",
    nextAction: "Review provider endpoint",
    confidenceLabel: "Endpoint mismatch",
    freshnessLabel: "fixture-only",
    sourceTrustState: "included",
    sourceTrustStates: ["included"],
    localModelHealthStatus: "endpoint_mismatch",
  }),
  packetFixture({
    packetId: "fixture:mocked-worker-ready",
    title: "Mock Hermes containment ready",
    requestedOutcome: "Show bounded Hermes metadata before any real worker exists.",
    currentStage: "execute",
    currentOwner: "hermes_worker_mock",
    status: "blocked",
    riskLevel: "medium",
    priority: "normal",
    fixtureId: "mocked_hermes_unavailable",
    matrixRowIds: ["mock.hermes_unavailable"],
    fixtureKind: "mocked",
    summary: "Mocked Hermes containment is visible as metadata only.",
    nextAction: "Inspect containment",
    confidenceLabel: "Mocked containment",
    freshnessLabel: "fixture-only",
    sourceTrustState: "included",
    sourceTrustStates: ["included"],
    hermesJobState: "mocked_ready",
  }),
  packetFixture({
    packetId: "fixture:mocked-worker",
    title: "Mock Hermes lane unavailable",
    requestedOutcome: "Show worker-lane containment and fallback without launching Hermes.",
    currentStage: "execute",
    currentOwner: "hermes_worker_mock",
    status: "blocked",
    riskLevel: "high",
    priority: "high",
    fixtureId: "mocked_hermes_unavailable",
    matrixRowIds: ["mock.hermes_unavailable"],
    fixtureKind: "mocked",
    summary: "Mocked lane is visibly not live and offers retry smaller or reroute as fixture-only recovery.",
    nextAction: "Reroute",
    confidenceLabel: "Model unavailable",
    freshnessLabel: "fixture-only",
    sourceTrustState: "included",
    sourceTrustStates: ["included"],
    hermesJobState: "mocked_timeout",
  }),
  packetFixture({
    packetId: "fixture:mocked-worker-blocked-containment",
    title: "Mock Hermes containment blocked",
    requestedOutcome: "Show blocked mounts and network policy before any worker launch.",
    currentStage: "execute",
    currentOwner: "hermes_worker_mock",
    status: "blocked",
    riskLevel: "high",
    priority: "high",
    fixtureId: "mocked_hermes_unavailable",
    matrixRowIds: ["mock.hermes_unavailable"],
    fixtureKind: "mocked",
    summary: "Hermes containment remains blocked because runtime boundaries are not approved.",
    nextAction: "Open Recovery",
    confidenceLabel: "Containment blocked",
    freshnessLabel: "fixture-only",
    sourceTrustState: "included",
    sourceTrustStates: ["included"],
    hermesJobState: "blocked_containment",
  }),
  packetFixture({
    packetId: "fixture:failed-stage",
    title: "Recover failed worker stage",
    requestedOutcome: "Show failed execution recovery actions only when the matrix permits them.",
    currentStage: "execute",
    currentOwner: "blocked",
    status: "failed",
    riskLevel: "high",
    priority: "high",
    fixtureId: "failed_stage_recovery",
    matrixRowIds: ["execution_attempt.failed"],
    fixtureKind: "fixture-only",
    summary: "Failed execution fixture exposes matrix-backed retry, reroute, cancel, discard, preserve, and shape recovery previews.",
    nextAction: "Recovery",
    confidenceLabel: "Recovery required",
    freshnessLabel: "fresh",
    sourceTrustState: "included",
    sourceTrustStates: ["included"],
    codexWorkerState: "blocked",
  }),
  packetFixture({
    packetId: "fixture:codex-active",
    title: "Codex implementation lane active",
    requestedOutcome: "Show Codex as an implementation worker lane without making it a self-reviewer.",
    currentStage: "execute",
    currentOwner: "codex_worker",
    status: "active",
    riskLevel: "medium",
    priority: "high",
    fixtureId: "codex_active_claude_pending",
    matrixRowIds: ["execution_attempt.running", "mock.codex_active"],
    fixtureKind: "mocked",
    summary: "Codex worker state is visible as metadata-only implementation progress.",
    nextAction: "Inspect Codex attempt",
    confidenceLabel: "Worker active",
    freshnessLabel: "fresh",
    sourceTrustState: "included",
    sourceTrustStates: ["included"],
    codexWorkerState: "active",
  }),
  packetFixture({
    packetId: "fixture:governed-hermes-dry-run-active",
    title: "Governed Hermes dry-run attempt active",
    requestedOutcome: "Show Hermes execution-attempt state without launching Hermes, Docker, network, sessions, or source mutation.",
    currentStage: "execute",
    currentOwner: "hermes_worker_mock",
    status: "active",
    riskLevel: "high",
    priority: "high",
    fixtureId: "mocked_hermes_unavailable",
    matrixRowIds: ["governed_worker.hermes_dry_run_running"],
    fixtureKind: "mocked",
    summary: "Hermes is visible as a governed non-executing dry-run attempt with all live execution authorities blocked.",
    nextAction: "Inspect Hermes dry-run attempt",
    confidenceLabel: "Worker dry-run active",
    freshnessLabel: "fresh",
    sourceTrustState: "included",
    sourceTrustStates: ["included"],
    hermesJobState: "mocked_ready",
    governedWorkerAttempt: { worker: "hermes", status: "running" },
  }),
  packetFixture({
    packetId: "fixture:governed-claude-dry-run-active",
    title: "Governed Claude dry-run attempt active",
    requestedOutcome: "Show Claude execution-attempt state without calling Anthropic, inheriting sessions, using network, or mutating source.",
    currentStage: "execute",
    currentOwner: "claude_reviewer",
    status: "active",
    riskLevel: "high",
    priority: "high",
    fixtureId: "codex_active_claude_pending",
    matrixRowIds: ["governed_worker.claude_dry_run_running"],
    fixtureKind: "mocked",
    summary: "Claude is visible as a governed non-executing dry-run attempt while provider and session authority remain blocked.",
    nextAction: "Inspect Claude dry-run attempt",
    confidenceLabel: "Worker dry-run active",
    freshnessLabel: "fresh",
    sourceTrustState: "included",
    sourceTrustStates: ["included"],
    claudeReviewState: "pending",
    governedWorkerAttempt: { worker: "claude", status: "running" },
  }),
  packetFixture({
    packetId: "fixture:governed-claude-real-execution-active",
    title: "Governed Claude copied-worktree execution running",
    requestedOutcome: "Show real Claude execution state in the cockpit while preserving copied-worktree isolation and metadata-only evidence.",
    currentStage: "execute",
    currentOwner: "claude_reviewer",
    status: "active",
    riskLevel: "high",
    priority: "urgent",
    fixtureId: "governed_claude_real_execution_active",
    matrixRowIds: ["governed_worker.claude_real_execution_running"],
    fixtureKind: "future-real-source",
    summary: "Claude real execution is visible as a governed copied-worktree attempt: safe mode, no built-in tools, no source mutation, no delivery authority, and no raw output retention.",
    nextAction: "Inspect governed Claude execution",
    confidenceLabel: "Real worker execution visible",
    freshnessLabel: "fresh",
    sourceTrustState: "included",
    sourceTrustStates: ["included"],
    claudeReviewState: "pending",
    lastEvent: "Claude copied-worktree execution evidence was observed with KENDALL_COPY_EXECUTION_OK and retained as metadata only.",
    riskFlags: ["worker network/session allowed", "source mutation forbidden", "raw output not retained", "delivery blocked"],
    governedWorkerAttempt: {
      worker: "claude",
      status: "running",
      authorityMode: "copied_worktree_worker_execution",
      lane: "claude_governed_execution",
      label: "real copied-worktree execution",
    },
  }),
  packetFixture({
    packetId: "fixture:governed-hermes-real-execution-unavailable",
    title: "Governed Hermes real execution unavailable",
    requestedOutcome: "Show Hermes in the cockpit as explicitly unavailable until the binary and containment authority are proven.",
    currentStage: "execute",
    currentOwner: "hermes_worker_mock",
    status: "blocked",
    riskLevel: "high",
    priority: "high",
    fixtureId: "governed_hermes_real_execution_unavailable",
    matrixRowIds: ["governed_worker.hermes_real_execution_unavailable"],
    fixtureKind: "future-real-source",
    summary: "Hermes real execution is visible as blocked because the governed proof has not found a runnable Hermes command or approved containment boundary.",
    nextAction: "Prove Hermes binary and containment",
    confidenceLabel: "Real worker blocked",
    freshnessLabel: "fresh",
    sourceTrustState: "included",
    sourceTrustStates: ["included"],
    hermesJobState: "blocked_containment",
    lastEvent: "Hermes real execution remains unavailable; do not infer a hidden worker is running.",
    riskFlags: ["Hermes missing", "containment unproven", "real launch blocked"],
    governedWorkerAttempt: {
      worker: "hermes",
      status: "rejected",
      authorityMode: "copied_worktree_worker_execution",
      lane: "hermes_governed_execution",
      label: "real execution unavailable",
      rejectionReason: "hermes_binary_or_containment_not_proven",
    },
  }),
  packetFixture({
    packetId: "fixture:claude-pending",
    title: "Claude review pending under scarce review policy",
    requestedOutcome: "Show Claude as an independent reviewer lane without starting provider automation.",
    currentStage: "review",
    currentOwner: "claude_reviewer",
    status: "waiting",
    riskLevel: "medium",
    priority: "normal",
    fixtureId: "codex_active_claude_pending",
    matrixRowIds: ["mock.claude_pending_skipped"],
    fixtureKind: "mocked",
    summary: "Claude review readiness is visible as scarce metadata-only reviewer state.",
    nextAction: "Request bounded Claude review",
    confidenceLabel: "Review pending",
    freshnessLabel: "fresh",
    sourceTrustState: "included",
    sourceTrustStates: ["included"],
    claudeReviewState: "pending",
  }),
  packetFixture({
    packetId: "fixture:review-complete",
    title: "Review completed worker evidence",
    requestedOutcome: "Show review stage after a completed attempt with metadata-only evidence.",
    currentStage: "review",
    currentOwner: "kendall",
    status: "complete",
    riskLevel: "low",
    priority: "normal",
    fixtureId: "codex_active_claude_pending",
    matrixRowIds: ["execution_attempt.completed"],
    fixtureKind: "mocked",
    summary: "Review fixture keeps Claude readiness as metadata-only scarce review context.",
    nextAction: "Review evidence",
    confidenceLabel: "Review pending",
    freshnessLabel: "fresh",
    sourceTrustState: "included",
    sourceTrustStates: ["included"],
    claudeReviewState: "skipped",
  }),
  packetFixture({
    packetId: "fixture:review-rejected",
    title: "Recover rejected review finding",
    requestedOutcome: "Show review rejection recovery without treating completed review as failed.",
    currentStage: "review",
    currentOwner: "blocked",
    status: "blocked",
    riskLevel: "high",
    priority: "high",
    fixtureId: "codex_active_claude_pending",
    matrixRowIds: ["execution_attempt.review_rejected"],
    fixtureKind: "mocked",
    summary: "Rejected-review fixture keeps finding rationale evidence and requires authority before discard or rework.",
    nextAction: "Recover review",
    confidenceLabel: "Review rejected",
    freshnessLabel: "fresh",
    sourceTrustState: "included",
    sourceTrustStates: ["included"],
    claudeReviewState: "blocked",
  }),
  packetFixture({
    packetId: "fixture:promote-candidate",
    title: "Promote approved candidate work",
    requestedOutcome: "Show promotion state before work becomes delivery evidence.",
    currentStage: "promote",
    currentOwner: "operator",
    status: "waiting",
    riskLevel: "medium",
    priority: "normal",
    fixtureId: "happy_path_work_packet",
    matrixRowIds: ["candidate_work.approved_unpromoted", "contract.artifact_refs"],
    fixtureKind: "fixture-only",
    summary: "Promote fixture keeps the operator decision visible without mutating source state.",
    nextAction: "Promote work",
    confidenceLabel: "Approval ready",
    freshnessLabel: "fresh",
    sourceTrustState: "included",
    sourceTrustStates: ["included"],
  }),
  packetFixture({
    packetId: "fixture:deliver-evidence",
    title: "Deliver metadata-only evidence package",
    requestedOutcome: "Show delivery evidence without live GitHub automation.",
    currentStage: "deliver",
    currentOwner: "github",
    status: "complete",
    riskLevel: "low",
    priority: "normal",
    fixtureId: "happy_path_work_packet",
    matrixRowIds: ["delivery.evidence_present"],
    fixtureKind: "future-real-source",
    summary: "Delivery fixture references future GitHub delivery state without making a live call.",
    nextAction: "Inspect delivery",
    confidenceLabel: "Evidence present",
    freshnessLabel: "fresh",
    sourceTrustState: "included",
    sourceTrustStates: ["included"],
  }),
  packetFixture({
    packetId: "fixture:learn-memory",
    title: "Review Obsidian memory proposal",
    requestedOutcome: "Show Learn state while Obsidian remains human-owned.",
    currentStage: "learn",
    currentOwner: "memory_review",
    status: "waiting",
    riskLevel: "high",
    priority: "high",
    fixtureId: "obsidian_proposal_pending_approval",
    matrixRowIds: ["memory.pending_human_approval", "memory.obsidian_proposal_pending_human_approval"],
    fixtureKind: "synthetic",
    summary: "Learn fixture makes memory proposal review visible without write-back.",
    nextAction: "Review memory",
    confidenceLabel: "Human review",
    freshnessLabel: "fresh",
    sourceTrustState: "excluded",
    sourceTrustStates: ["excluded", "derived-only"],
    sourceTrustSummary: "Obsidian is excluded from automatic writes and LLM-Wiki remains derived-only.",
  }),
  packetFixture({
    packetId: "fixture:llm-wiki-rebuild-preview",
    title: "Preview LLM-Wiki rebuild",
    requestedOutcome: "Show the metadata-only rebuild preview from approved Obsidian memory.",
    currentStage: "learn",
    currentOwner: "memory_review",
    status: "waiting",
    riskLevel: "medium",
    priority: "high",
    fixtureId: "happy_path_work_packet",
    matrixRowIds: ["memory.pending_human_approval", "memory.obsidian_proposal_pending_human_approval"],
    fixtureKind: "synthetic",
    summary: "Learn fixture shows a ready metadata-only LLM-Wiki rebuild preview without execution.",
    nextAction: "Preview rebuild metadata",
    confidenceLabel: "Human review",
    freshnessLabel: "fresh",
    sourceTrustState: "included",
    sourceTrustStates: ["included"],
    sourceTrustSummary: "Approved Obsidian metadata can feed a derived LLM-Wiki preview; no durable write is authorized.",
  }),
];

export const pipelineDensityFixturePackets: PipelineFixturePacket[] = Array.from({ length: 15 }, (_, index) =>
  cloneDensityPacket(pipelineFixturePackets[index % pipelineFixturePackets.length], index + 1)
);

export const pipelineCockpitPackets: PipelineFixturePacket[] = [
  ...pipelineFixturePackets,
  ...pipelineDensityFixturePackets,
];

export const selectedPipelinePacket = requireSelectedPipelinePacket(pipelineCockpitPackets);

export function projectSupervisorWorkPacketsToCockpitPackets(
  packets: readonly WorkPacketV0View[]
): PipelineFixturePacket[] {
  return packets.flatMap((packet) => {
    const projectedPacket = safeProjectSupervisorWorkPacketToCockpitPacket(packet);
    return projectedPacket ? [projectedPacket] : [];
  });
}

export function projectGovernedCopiedWorktreeExecutionEvidence(
  evidence: readonly GovernedCopiedWorktreeExecutionEvidenceV0[]
): PipelineFixturePacket[] {
  return evidence.flatMap((entry) => {
    if (!isSafeGovernedCopiedWorktreeEvidence(entry)) {
      return [];
    }
    if (entry.worker === "claude" && entry.execution_state === "execution_observed") {
      return [projectClaudeCopiedWorktreeSuccess(entry)];
    }
    if (entry.worker === "claude") {
      return [projectClaudeCopiedWorktreeFailure(entry)];
    }
    return [projectHermesCopiedWorktreeUnavailable(entry)];
  });
}

export function projectGovernedCopiedWorktreeExecutionEvidenceSnapshot(
  snapshot: GovernedCopiedWorktreeExecutionEvidenceSnapshotV0
): PipelineFixturePacket[] {
  if (!isSafeGovernedCopiedWorktreeEvidenceSnapshot(snapshot)) {
    return [];
  }
  return projectGovernedCopiedWorktreeExecutionEvidence(snapshot.attempts);
}

function safeProjectSupervisorWorkPacketToCockpitPacket(packet: WorkPacketV0View): PipelineFixturePacket | null {
  try {
    return projectSupervisorWorkPacketToCockpitPacket(packet);
  } catch {
    return null;
  }
}

function projectSupervisorWorkPacketToCockpitPacket(packet: WorkPacketV0View): PipelineFixturePacket {
  const sourceTrustStates = sourceTrustStatesFor(packet);
  const freshnessLabel = freshnessLabelFor(packet);
  const confidenceScore = packet.routeSummary?.confidenceScore ?? 0.5;
  const reasonCodes = supervisorReasonCodes(packet);
  return {
    ...packet,
    fixtureId: `supervisor:${packet.packetId}`,
    fixtureKind: "future-real-source",
    fixtureLabel: "supervisor WorkPacketV0 projection",
    summary: packet.routeSummary?.recommendation
      ? `Supervisor route recommendation: ${packet.routeSummary.recommendation}.`
      : packet.requestedOutcome,
    nextAction: supervisorNextAction(packet),
    confidenceLabel: packet.routeSummary?.confidenceBand ?? confidenceLabelFor(confidenceScore),
    freshnessLabel,
    sourceTrustState: sourceTrustStates[0] ?? "included",
    sourceTrustStates,
    sourceTrustSummary: sourceTrustSummaryFor(packet),
    routeFork: {
      selectedRoute: packet.routeSummary?.recommendation ?? packet.currentStage,
      rejectedRoutes: rejectedRoutesFor(packet.currentStage),
      tags: ["supervisor", packet.currentStage, packet.currentOwner, packet.status],
      sourceContext: sourceTrustSummaryFor(packet),
      lowConfidenceActions: confidenceScore < 0.5 ? ["Clarify", "Downgrade to reference", "Send back to Research"] : [],
    },
    lastEvent: `Supervisor Work Packet projection rendered from ${reasonCodes[0]}.`,
    riskFlags: riskFlagsFor({
      riskLevel: packet.riskLevel,
      freshnessLabel,
      fixtureKind: "future-real-source",
    }),
    matrixRowIds: reasonCodes,
    humanGateFixtureEvents: [],
    recoveryFixtureEvents: [],
    actionGuardFixtures: [],
    localModelHealth: null,
    hermesJob: null,
    codexWorker: null,
    claudeReview: null,
  };
}

function supervisorReasonCodes(packet: WorkPacketV0View): string[] {
  const reasonCodes = packet.routeSummary?.reasonCodes
    ?.filter((code): code is string => typeof code === "string" && code.trim().length > 0)
    .map((code) => code.trim());
  return reasonCodes?.length ? reasonCodes : [`supervisor.${packet.currentStage}`];
}

export function evaluateFixtureActionDecision(
  packet: PipelineFixturePacket,
  actionId: string,
  actionSurface: ActionGuardFixture["actionSurface"]
): FixtureActionDecision {
  const actionGuard = findBlockingActionGuard(packet, actionId);
  if (actionGuard) {
    return {
      submitCapable: false,
      guard: actionGuard,
      disabledReason: actionGuard.disabledReason,
      primaryRisk: actionGuard.primaryRisk,
    };
  }

  const knownAction = actionSurface === "human_gate"
    ? packet.humanGateActions.find((action) => action.actionId === actionId)
    : packet.recoveryActions.find((action) => action.actionId === actionId);
  if (!knownAction) {
    const unknownGuard = packet.actionGuardFixtures.find((guard) => guard.classification === "unknown_action") ?? null;
    return {
      submitCapable: false,
      guard: unknownGuard,
      disabledReason: unknownGuard?.disabledReason ?? "disabled reason: unknown actions are rejected deterministically.",
      primaryRisk: "false_authority",
    };
  }

  if (actionSurface === "human_gate") {
    const action = knownAction as PipelineFixturePacket["humanGateActions"][number];
    const fixtureEvent = packet.humanGateFixtureEvents.find((event) => event.actionId === action.actionId);
    const submitCapable =
      action.status === "available" &&
      action.requiredEvidenceRefs.length > 0 &&
      action.payload.packetId === packet.packetId &&
      action.payload.actionId === action.actionId &&
      missingHumanGateEvidenceRefIds(packet, action.requiredEvidenceRefs).length === 0 &&
      fixtureEvent !== undefined &&
      fixtureEvent.toStage === action.resultingStage &&
      fixtureEvent.toOwner === action.resultingOwner &&
      fixtureEvent.evidenceRefs.length > 0 &&
      fixtureEvent.evidenceRefs.every((ref) => packet.evidenceRefs.some((evidenceRef) => evidenceRef.refId === ref));
    return {
      submitCapable,
      guard: null,
      disabledReason: submitCapable ? "none" : action.disabledReason ?? "disabled reason: Human Gate action is not submit-capable.",
      primaryRisk: submitCapable ? "none" : "false_authority",
    };
  }

  const action = knownAction as PipelineFixturePacket["recoveryActions"][number];
  const fixtureEvent = packet.recoveryFixtureEvents.find((event) => event.actionId === action.actionId);
  const submitCapable =
    action.availability === "available" &&
    missingEvidenceRefIds(packet, action.evidenceRefs).length === 0 &&
    fixtureEvent !== undefined &&
    !fixtureEvent.requiresHumanGate &&
    fixtureEvent.toStage === action.resultingStage &&
    fixtureEvent.toOwner === action.resultingOwner &&
    fixtureEvent.evidenceRefs.length > 0 &&
    fixtureEvent.evidenceRefs.every((ref) => packet.evidenceRefs.some((evidenceRef) => evidenceRef.refId === ref));
  return {
    submitCapable,
    guard: null,
    disabledReason: submitCapable ? "none" : "disabled reason: recovery action is not submit-capable.",
    primaryRisk: submitCapable ? "none" : "false_authority",
  };
}

function findBlockingActionGuard(packet: PipelineFixturePacket, actionId: string) {
  return packet.actionGuardFixtures.find((guard) => guard.actionId === actionId || guard.expectedActionId === actionId || guard.actualActionId === actionId) ?? null;
}

function missingEvidenceRefIds(packet: PipelineFixturePacket, evidenceRefs: string[]) {
  const packetEvidenceRefs = new Set(packet.evidenceRefs.map((ref) => ref.refId));
  return evidenceRefs.filter((ref) => !packetEvidenceRefs.has(ref));
}

function missingHumanGateEvidenceRefIds(
  packet: PipelineFixturePacket,
  requiredEvidenceRefs: string[]
) {
  return missingEvidenceRefIds(packet, requiredEvidenceRefs);
}

export const pipelineFixtureScenarios: PipelineFixtureScenario[] = [
  scenario("happy-path", "happy path", "fixture:happy-path", "kendall", "fixture-only", "not blocked", "Review route", "Do not treat fixture route as live execution.", "Return to Route with fixture evidence preserved."),
  scenario("model-unavailable", "model unavailable", "fixture:mocked-worker", "hermes_worker_mock", "mocked bounded lane", "Hermes worker mock is unavailable.", "Reroute or retry smaller", "Do not launch Hermes or call a model.", "Return to Shape with evidence preserved."),
  scenario("local-gpu-busy", "local GPU busy", "fixture:mocked-worker", "local_model", "local-readiness prototype", "Local RTX/Ollama capacity is busy in fixture mode.", "Wait, reroute, or request provider approval", "Do not probe the local model endpoint from the dashboard.", "Keep packet in Execute until health evidence is refreshed."),
  scenario("low-confidence-route", "low-confidence route", "fixture:stale-source", "kendall", "synthetic", "Route confidence is low because source refs are stale or contradictory.", "Clarify, downgrade to reference, or send back to Research", "Do not auto-promote low-confidence source context.", "Return to Capture with source refs preserved."),
  scenario("source-excluded", "source excluded", "fixture:stale-source", "kendall", "synthetic", "Obsidian source is excluded from automatic copying.", "Clarify source boundary", "Do not copy excluded source content.", "Keep summary-only source refs."),
  scenario("stale-memory", "stale memory", "fixture:learn-memory", "memory_review", "synthetic", "Memory proposal needs human review before use.", "Review memory proposal", "Do not treat stale memory as canonical.", "Leave Obsidian unchanged."),
  scenario("contradiction-detected", "contradiction detected", "fixture:stale-source", "kendall", "synthetic", "Manual capture conflicts with stale research.", "Ask operator to resolve contradiction", "Do not resolve contradictory sources automatically.", "Keep packet in Capture with both refs visible."),
  scenario("hermes-timeout", "Hermes timeout", "fixture:mocked-worker", "hermes_worker_mock", "mocked bounded lane", "Mocked Hermes lane timed out or is unavailable.", "Cancel, rerun smaller, or reroute", "Do not launch a real worker.", "Return to Shape with timeout evidence preserved."),
  scenario("claude-skipped", "Claude skipped", "fixture:review-complete", "claude_reviewer", "mocked scarce review", "Claude review is skipped by scarce review policy.", "Continue Kendall review or request bounded Claude review", "Do not start Claude without explicit approval.", "Keep review evidence metadata-only."),
  scenario("rejected-claude-finding", "rejected Claude finding", "fixture:review-rejected", "blocked", "mocked scarce review", "A review finding is rejected in fixture mode with rationale preserved.", "Discard, send back to Shape, or mark blocked", "Do not discard rejected findings without a recorded rationale.", "Keep packet in Review with finding refs."),
  scenario("blocked-obsidian-write-back", "blocked Obsidian write-back", "fixture:learn-memory", "memory_review", "synthetic", "Obsidian write-back is blocked until human approval.", "Approve, edit, reject, or defer memory proposal", "Do not mutate canonical Obsidian notes.", "Leave vault unchanged and preserve proposal evidence."),
  scenario("provider-approval-required", "provider approval required", "fixture:shape-plan", "operator", "synthetic", "Provider exception requires explicit operator approval.", "Review provider approval requirement", "Do not call provider/model from fixture mode.", "Return to Shape with plan evidence preserved."),
  scenario("recovery-action-available", "recovery action available", "fixture:mocked-worker", "blocked", "mocked bounded lane", "Blocked packet has reroute recovery available.", "Reroute with evidence preserved", "Do not execute recovery automatically.", "Send back to Shape."),
  scenario("no-packets", "no-packets", null, "none", "fixture-only", "No packet is selected in this static scenario.", "Capture or import a fixture packet", "Do not infer live backlog state from empty fixture mode.", "Remain in fixture selector context."),
];

export const pipelineGoldenPathSnapshots: PipelineGoldenPathSnapshot[] = [
  goldenSnapshot("capture", "Capture", "fixture:stale-source", "capture", "kendall", "Clarify source", "Source refs are preserved while stale/derived context is resolved.", "A captured source-boundary packet.", "It starts in Capture because source trust is not settled.", "Resolve stale or contradictory source context.", "Clarified context can move toward classification."),
  goldenSnapshot("classify", "Classify", "fixture:classify-intake", "classify", "kendall", "Classify route", "BMAD planning intake is classified before route selection.", "A planning-intake packet.", "It is being classified before route evidence is chosen.", "Review whether the classification fits the work.", "Classification can feed a route recommendation."),
  goldenSnapshot("route", "Route", "fixture:happy-path", "route", "kendall", "Review route", "Route reason codes become visible without starting execution.", "A route-ready cockpit packet.", "Route evidence is present and can be inspected.", "Review route confidence and reason codes.", "A shaped execution preview can be prepared."),
  goldenSnapshot("shape", "Shape", "fixture:shape-plan", "shape", "kendall", "Shape packet", "Execution recipe remains unapproved until a gate is reached.", "A shaped execution preview.", "It has plan evidence but no execution approval.", "Inspect the plan and required evidence.", "The packet can move to Human Gate."),
  goldenSnapshot("human-gate", "Human Gate", "fixture:human-gate-blocked", "human_gate", "operator", "Human Gate", "Operator decision is required before any fixture execution path.", "A bounded approval packet.", "It is waiting for a typed operator decision.", "Choose whether to approve, reject, or revise.", "Approved fixture preview would point to Execute."),
  goldenSnapshot("execute", "Execute", "fixture:mocked-worker", "execute", "hermes_worker_mock", "Reroute", "Mocked worker failure is recoverable without launching Hermes.", "A mocked worker-lane packet.", "It demonstrates contained execution failure.", "Choose reroute or retry-smaller recovery.", "Recovery sends it back to Shape with evidence preserved."),
  goldenSnapshot("review", "Review", "fixture:review-complete", "review", "kendall", "Review evidence", "Completed attempt evidence is reviewed as metadata-only context.", "A review-stage evidence packet.", "Execution evidence is complete enough to inspect.", "Review findings and scarce reviewer context.", "Reviewed evidence can be promoted or delivered."),
  goldenSnapshot("deliver", "Deliver", "fixture:deliver-evidence", "deliver", "github", "Inspect delivery", "Delivery evidence is visible without live GitHub automation.", "A delivery-evidence packet.", "It has delivery metadata ready for inspection.", "Inspect delivery evidence.", "Delivery refs can be used in final evidence."),
  goldenSnapshot("learn", "Learn", "fixture:learn-memory", "learn", "memory_review", "Review memory", "Memory proposal remains review-gated and Obsidian stays human-owned.", "A memory proposal packet.", "It is ready for memory review, not write-back.", "Approve, edit, reject, or defer the proposal.", "Approved memory remains a future review-gated action."),
];

function scenario(
  scenarioId: string,
  label: string,
  selectedPacketId: string | null,
  currentOwner: PipelineFixtureScenario["currentOwner"],
  fixtureLabel: string,
  blockedReason: string,
  nextOperatorOption: string,
  stopLine: string,
  rollbackPath: string
): PipelineFixtureScenario {
  return {
    scenarioId,
    label,
    selectedPacketId,
    currentOwner,
    fixtureLabel,
    blockedReason,
    nextOperatorOption,
    evidenceRefs: selectedPacketId ? [`${selectedPacketId}:evidence:fixture`] : [],
    stopLine,
    rollbackPath,
  };
}

function goldenSnapshot(
  snapshotId: string,
  label: string,
  packetId: string,
  currentStage: PipelineStage,
  currentOwner: WorkPacketOwner,
  nextAction: string,
  decisionConsequence: string,
  whatPacketIs: string,
  whyHere: string,
  whatNeedsOperator: string,
  whatHappensNext: string
): PipelineGoldenPathSnapshot {
  return {
    snapshotId,
    label,
    packetId,
    currentStage,
    currentOwner,
    evidenceRef: `${packetId}:evidence:fixture`,
    nextAction,
    decisionConsequence,
    whatPacketIs,
    whyHere,
    whatNeedsOperator,
    whatHappensNext,
  };
}

function isSafeGovernedCopiedWorktreeEvidence(entry: GovernedCopiedWorktreeExecutionEvidenceV0): boolean {
  const allowedExecutionStates = new Set([
    "missing",
    "unsupported",
    "copy_failed",
    "execution_observed",
    "failed",
    "timed_out",
    "invalid_output",
  ]);
  const expectedEvidenceRef = entry && (entry.worker === "claude" || entry.worker === "hermes")
    ? `metadata:worker-copied-worktree-execution/${entry.worker}`
    : null;
  return Boolean(
    entry
      && typeof entry.source_id === "string"
      && entry.source_id.trim().length > 0
      && !hasUnsafeCopiedWorktreeMarker(entry.source_id)
      && entry.mode === "copied_worktree_execution"
      && entry.authority_level === "copied_worktree_worker_execution"
      && (entry.worker === "claude" || entry.worker === "hermes")
      && allowedExecutionStates.has(entry.execution_state)
      && Number.isFinite(Date.parse(entry.observed_at))
      && typeof entry.evidence_ref === "string"
      && entry.evidence_ref === expectedEvidenceRef
      && !hasUnsafeCopiedWorktreeMarker(entry.evidence_ref)
      && (entry.status_event_ref === undefined || entry.status_event_ref === null || (typeof entry.status_event_ref === "string" && entry.status_event_ref === `${expectedEvidenceRef}:status-event` && !hasUnsafeCopiedWorktreeMarker(entry.status_event_ref)))
      && (entry.expected_response === "KENDALL_COPY_EXECUTION_OK" || entry.expected_response === "KENDALL_PATCH_PROPOSAL_OK")
      && (entry.observed_response === entry.expected_response || entry.observed_response === null)
      && (
        entry.output_contract_diagnostic === undefined
        || [
          "not_applicable",
          "empty_output",
          "stderr_raw_marker",
          "stdout_not_json",
          "stdout_json_not_object",
          "stdout_raw_marker",
          "missing_result",
          "unexpected_result",
          "missing_proposal",
          "unexpected_proposal",
          "structured_match",
        ].includes(entry.output_contract_diagnostic)
      )
      && (entry.task_id === undefined || entry.task_id === "copy_execution_sentinel" || entry.task_id === "starter_patch_proposal")
      && (entry.proposal_target_file === undefined || entry.proposal_target_file === null || entry.proposal_target_file === "README.md")
      && (entry.proposal_change_kind === undefined || entry.proposal_change_kind === null || entry.proposal_change_kind === "append_line")
      && (entry.proposal_summary === undefined || entry.proposal_summary === null || entry.proposal_summary === "Add a harmless Kendall starter note")
      && (entry.exit_code === null || Number.isInteger(entry.exit_code))
      && typeof entry.timed_out === "boolean"
      && (entry.command_path === null || (typeof entry.command_path === "string" && entry.command_path.startsWith("/") && entry.command_path.split("/").at(-1) === entry.worker))
      && Number.isInteger(entry.copied_tracked_files)
      && entry.copied_tracked_files >= 0
      && Number.isInteger(entry.copy_bytes)
      && entry.copy_bytes >= 0
      && entry.copy_retained === false
      && typeof entry.network_allowed === "boolean"
      && typeof entry.session_inheritance_allowed === "boolean"
      && entry.source_mutation_allowed === false
      && entry.tools_allowed === false
      && entry.raw_output_retained === false
      && entry.affects_trust === false
      && entry.affects_routing === false
      && copiedWorktreeStateShapeIsSafe(entry)
  );
}

function isSafeGovernedCopiedWorktreeEvidenceSnapshot(snapshot: GovernedCopiedWorktreeExecutionEvidenceSnapshotV0): boolean {
  return Boolean(
    snapshot
      && typeof snapshot === "object"
      && !Array.isArray(snapshot)
      && snapshot.schema_version === "governed_worker_copied_worktree_evidence_snapshot.v0"
      && Number.isFinite(Date.parse(snapshot.generated_at))
      && snapshot.metadata_only === true
      && snapshot.raw_payload_retained === false
      && snapshot.dashboard_consumption === "no_live_calls"
      && Object.keys(snapshot).every((key) => GOVERNED_COPIED_WORKTREE_SNAPSHOT_FIELDS.has(key))
      && !Object.hasOwn(snapshot, "source_worktree")
      && !hasForbiddenCopiedWorktreeEvidenceField(snapshot)
      && Array.isArray(snapshot.attempts)
      && snapshot.attempts.every((entry) => Object.keys(entry).every((key) => GOVERNED_COPIED_WORKTREE_EVIDENCE_FIELDS.has(key)))
      && Array.isArray(snapshot.errors)
      && !hasUnsafeCopiedWorktreeMarkerInValue(snapshot)
  );
}

function hasForbiddenCopiedWorktreeEvidenceField(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => hasForbiddenCopiedWorktreeEvidenceField(entry));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).some(([key, entry]) => {
      if (["source_worktree", "execution_cwd", "command_args", "shell_used"].includes(key)) {
        return true;
      }
      return hasForbiddenCopiedWorktreeEvidenceField(entry);
    });
  }
  return false;
}

function hasUnsafeCopiedWorktreeMarkerInValue(value: unknown): boolean {
  if (typeof value === "string") {
    return hasUnsafeCopiedWorktreeMarker(value);
  }
  if (Array.isArray(value)) {
    return value.some((entry) => hasUnsafeCopiedWorktreeMarkerInValue(entry));
  }
  if (value && typeof value === "object") {
    return Object.values(value).some((entry) => hasUnsafeCopiedWorktreeMarkerInValue(entry));
  }
  return false;
}

function copiedWorktreeStateShapeIsSafe(entry: GovernedCopiedWorktreeExecutionEvidenceV0): boolean {
  if (entry.execution_state === "execution_observed") {
    return entry.worker === "claude"
      && entry.observed_response === entry.expected_response
      && entry.exit_code === 0
      && entry.timed_out === false
      && entry.command_path !== null
      && entry.copied_tracked_files >= 1
      && (
        entry.task_id !== "starter_patch_proposal"
        || (
          entry.expected_response === "KENDALL_PATCH_PROPOSAL_OK"
          && entry.output_contract_diagnostic === "structured_match"
          && entry.proposal_target_file === "README.md"
          && entry.proposal_change_kind === "append_line"
          && entry.proposal_summary === "Add a harmless Kendall starter note"
        )
      );
  }
  if (["missing", "unsupported"].includes(entry.execution_state)) {
    return entry.observed_response === null
      && entry.exit_code === null
      && entry.timed_out === false
      && entry.command_path === null;
  }
  if (entry.execution_state === "copy_failed") {
    return entry.observed_response === null && entry.exit_code === null && entry.timed_out === false;
  }
  if (entry.execution_state === "failed") {
    return entry.command_path !== null
      && Number.isInteger(entry.exit_code)
      && entry.exit_code !== 0
      && entry.timed_out === false
      && entry.observed_response === null;
  }
  if (entry.execution_state === "timed_out") {
    return entry.command_path !== null && entry.timed_out === true && entry.observed_response === null;
  }
  if (entry.execution_state === "invalid_output") {
    return entry.command_path !== null
      && entry.exit_code === 0
      && entry.timed_out === false
      && entry.observed_response === null;
  }
  return false;
}

function hasUnsafeCopiedWorktreeMarker(value: string): boolean {
  return /raw_prompt|provider_payload|authorization|bearer|token|secret|password|credential|sk-[a-z0-9_-]+/i.test(value);
}

function projectClaudeCopiedWorktreeSuccess(entry: GovernedCopiedWorktreeExecutionEvidenceV0): PipelineFixturePacket {
  return packetFixture({
    packetId: `evidence:governed-claude-copied-worktree:${safeEvidencePacketSuffix(entry.source_id)}`,
    title: "Governed Claude copied-worktree execution completed",
    requestedOutcome: "Render retained Claude copied-worktree execution metadata as completed review evidence without treating it as process liveness.",
    currentStage: "review",
    currentOwner: "kendall",
    status: "complete",
    riskLevel: "high",
    priority: "high",
    fixtureId: "codex_active_claude_pending",
    matrixRowIds: ["execution_attempt.completed"],
    fixtureKind: "future-real-source",
    summary: `Claude copied-worktree execution returned ${entry.expected_response}; retained evidence is metadata only with ${entry.copied_tracked_files} tracked files copied and no retained source copy.`,
    nextAction: "Review governed Claude execution metadata",
    confidenceLabel: "Real worker evidence retained",
    freshnessLabel: "fresh",
    sourceTrustState: "included",
    sourceTrustStates: ["included"],
    claudeReviewState: "pending",
    lastEvent: "Retained copied-worktree execution evidence completed; this is not live process liveness.",
    riskFlags: ["worker network/session allowed", "source mutation forbidden", "raw output not retained", "delivery blocked"],
    governedWorkerAttempt: governedCopiedWorktreeAttempt(entry, "completed", "real copied-worktree execution"),
  });
}

function projectClaudeCopiedWorktreeFailure(entry: GovernedCopiedWorktreeExecutionEvidenceV0): PipelineFixturePacket {
  return packetFixture({
    packetId: `evidence:governed-claude-copied-worktree:${safeEvidencePacketSuffix(entry.source_id)}`,
    title: "Governed Claude copied-worktree execution failed",
    requestedOutcome: "Render failed Claude copied-worktree execution metadata without raw output retention or retry authority.",
    currentStage: "execute",
    currentOwner: "blocked",
    status: "failed",
    riskLevel: "high",
    priority: "high",
    fixtureId: "partial_worker_evidence",
    matrixRowIds: ["execution_attempt.failed"],
    fixtureKind: "future-real-source",
    summary: `Claude copied-worktree execution ended as ${entry.execution_state}; raw output is not retained and retry requires normal recovery review.`,
    nextAction: "Review failure metadata",
    confidenceLabel: "Real worker failure retained",
    freshnessLabel: "fresh",
    sourceTrustState: "included",
    sourceTrustStates: ["included"],
    lastEvent: "Retained copied-worktree failure metadata is visible; no raw worker output is retained.",
    riskFlags: ["worker execution failed", "raw output not retained", "retry not automatic"],
    governedWorkerAttempt: governedCopiedWorktreeAttempt(entry, "failed", "real copied-worktree failure", entry.execution_state),
  });
}

function projectHermesCopiedWorktreeUnavailable(entry: GovernedCopiedWorktreeExecutionEvidenceV0): PipelineFixturePacket {
  return packetFixture({
    packetId: `evidence:governed-hermes-copied-worktree:${safeEvidencePacketSuffix(entry.source_id)}`,
    title: "Governed Hermes real execution unavailable",
    requestedOutcome: "Render Hermes as unavailable until a runnable command and containment boundary are proven.",
    currentStage: "execute",
    currentOwner: "hermes_worker_mock",
    status: "blocked",
    riskLevel: "high",
    priority: "high",
    fixtureId: "governed_hermes_real_execution_unavailable",
    matrixRowIds: ["governed_worker.hermes_real_execution_unavailable"],
    fixtureKind: "future-real-source",
    summary: `Hermes copied-worktree execution is ${entry.execution_state}; dashboard visibility must show blocked metadata, not hidden liveness.`,
    nextAction: "Prove Hermes binary and containment",
    confidenceLabel: "Real worker blocked",
    freshnessLabel: "fresh",
    sourceTrustState: "included",
    sourceTrustStates: ["included"],
    hermesJobState: "blocked_containment",
    lastEvent: "Hermes copied-worktree evidence remains unavailable; do not infer a hidden worker is running.",
    riskFlags: ["Hermes missing", "containment unproven", "real launch blocked"],
    governedWorkerAttempt: governedCopiedWorktreeAttempt(entry, "rejected", "real execution unavailable", undefined, "hermes_binary_or_containment_not_proven"),
  });
}

function governedCopiedWorktreeAttempt(
  entry: GovernedCopiedWorktreeExecutionEvidenceV0,
  status: GovernedWorkerAttemptFixtureInput["status"],
  label: string,
  failureReason?: string,
  rejectionReason?: string
): GovernedWorkerAttemptFixtureOptions {
  return {
    worker: entry.worker,
    status,
    authorityMode: "copied_worktree_worker_execution",
    lane: entry.worker === "claude" ? "claude_governed_execution" : "hermes_governed_execution",
    label,
    failureReason,
    rejectionReason,
    sourceEvidenceRef: entry.evidence_ref,
    sourceEventRef: entry.status_event_ref ?? `${entry.evidence_ref}:status-event`,
  };
}

function safeEvidencePacketSuffix(value: string): string {
  const suffix = value.toLowerCase().replace(/[^a-z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "");
  return suffix.length > 0 ? suffix.slice(0, 80) : "unknown";
}

function sourceTrustStatesFor(packet: WorkPacketV0View): PipelineSourceTrustState[] {
  const states = packet.sourceRefs.map((ref): PipelineSourceTrustState => {
    if (ref.accessState === "missing" || ref.accessState === "blocked") {
      return "unavailable";
    }
    if (ref.accessState === "excluded") {
      return "excluded";
    }
    if (ref.freshness === "stale") {
      return "stale";
    }
    if (ref.sourceType === "llm_wiki") {
      return "derived-only";
    }
    return "included";
  });
  return Array.from(new Set(states.length > 0 ? states : ["included"]));
}

function sourceTrustSummaryFor(packet: WorkPacketV0View): string {
  const sourceCount = packet.sourceRefs.length;
  const restrictedCount = packet.sourceRefs.filter((ref) => ref.accessState !== "allowed").length;
  if (sourceCount === 0) {
    return "Supervisor packet has no source refs attached yet.";
  }
  if (restrictedCount > 0) {
    return `${restrictedCount} of ${sourceCount} supervisor source refs are restricted or unavailable.`;
  }
  return `${sourceCount} supervisor source refs are available as summary-only metadata.`;
}

function freshnessLabelFor(packet: WorkPacketV0View): string {
  if (packet.sourceRefs.some((ref) => ref.freshness === "stale")) {
    return "stale";
  }
  if (packet.sourceRefs.some((ref) => ref.freshness === "unknown")) {
    return "unknown";
  }
  return "fresh";
}

function confidenceLabelFor(confidenceScore: number): string {
  if (confidenceScore >= 0.75) {
    return "High confidence";
  }
  if (confidenceScore < 0.5) {
    return "Low confidence";
  }
  return "Medium confidence";
}

function supervisorNextAction(packet: WorkPacketV0View): string {
  const availableHumanGateAction = packet.humanGateActions.find((action) => action.status === "available");
  if (availableHumanGateAction) {
    return availableHumanGateAction.label;
  }
  const recoveryAction = packet.recoveryActions.find((action) => action.availability === "available");
  if (recoveryAction) {
    return recoveryAction.label;
  }
  return packet.routeSummary?.recommendation ?? plainStageLabel(packet.currentStage);
}

function plainStageLabel(stage: PipelineStage): string {
  return stage
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function packetFixture(input: {
  packetId: string;
  title: string;
  requestedOutcome: string;
  currentStage: PipelineStage;
  currentOwner: WorkPacketOwner;
  status: WorkPacketV0View["status"];
  riskLevel: WorkPacketV0View["riskLevel"];
  priority: WorkPacketV0View["priority"];
  fixtureId: string;
  matrixRowIds: string[];
  fixtureKind: PipelineFixtureKind;
  summary: string;
  nextAction: string;
    confidenceLabel: string;
    freshnessLabel: string;
  sourceTrustState?: PipelineSourceTrustState;
  sourceTrustStates?: PipelineSourceTrustState[];
  sourceTrustSummary?: string;
  routeFork?: PipelineRouteForkFixture;
  lastEvent?: string;
  riskFlags?: string[];
  localModelHealthStatus?: LocalModelHealthV0["statusLabel"];
  hermesJobState?: HermesJobPacketV0["statusLabel"];
  codexWorkerState?: CodexWorkerPacketV0["readiness"];
  claudeReviewState?: ClaudeReviewPacketV0["statusLabel"];
  governedWorkerAttempt?: GovernedWorkerAttemptFixtureOptions;
  }): PipelineFixturePacket {
  const fixture = requireCatalogEntry(input.fixtureId);
  const rows = requireMatrixRows(input.matrixRowIds);
  validatePacketMatrixRows(input, rows);
  const sourceRefs: SourceRefV0[] = [
    {
      refId: `${input.packetId}:source:matrix`,
      sourceType: "bmad_artifact",
      label: `Matrix rows: ${input.matrixRowIds.join(", ")}`,
      pathOrUrl: "_bmad-output/implementation-artifacts/1-5-define-pipeline-state-evidence-and-fixture-matrix.md",
      freshness: input.freshnessLabel === "stale" ? "stale" : "fresh",
      accessState: "allowed",
      summaryOnly: true,
    },
  ];

  if (input.freshnessLabel === "stale") {
    sourceRefs.push({
      refId: `${input.packetId}:source:stale-research`,
      sourceType: "research",
      label: "Stale research summary",
      freshness: "stale",
      accessState: "blocked",
      summaryOnly: true,
    });
  }
  if (input.fixtureId === "obsidian_proposal_pending_approval" || input.fixtureId === "corrupted_incomplete_aggregate") {
    sourceRefs.push(
      {
        refId: `${input.packetId}:source:obsidian-human-owned`,
        sourceType: "obsidian",
        label: "Obsidian human-owned memory",
        freshness: "fresh",
        accessState: "excluded",
        summaryOnly: true,
      },
      {
        refId: `${input.packetId}:source:llm-wiki-derived-only`,
        sourceType: "llm_wiki",
        label: "LLM-Wiki derived-only digest",
        freshness: "fresh",
        accessState: "blocked",
        summaryOnly: true,
      }
    );
  }
  if (input.packetId === "fixture:llm-wiki-rebuild-preview") {
    sourceRefs.push({
      refId: `${input.packetId}:source:obsidian-approved`,
      sourceType: "obsidian",
      label: "Approved Obsidian memory metadata",
      freshness: "fresh",
      accessState: "allowed",
      summaryOnly: true,
    });
  }
  const evidenceRefs: WorkPacketV0View["evidenceRefs"] = [
    {
      refId: `${input.packetId}:evidence:fixture`,
      evidenceType: "fixture",
      label: `${fixture?.label ?? input.fixtureId} fixture evidence`,
      retentionClass: "fixture",
      rawPayloadRetained: false,
    },
  ];
  const localModelHealth = input.localModelHealthStatus ? localModelHealthFixture(input.localModelHealthStatus, input.packetId) : null;
  const hermesJob = input.hermesJobState ? hermesJobFixture(input.hermesJobState, input.packetId) : null;
  const codexWorker = input.codexWorkerState ? codexWorkerFixture(input.codexWorkerState, input.packetId) : null;
  const claudeReview = input.claudeReviewState ? claudeReviewFixture(input.claudeReviewState, input.packetId) : null;
  const governedAttemptEvidenceRef = input.governedWorkerAttempt
    ? input.governedWorkerAttempt.sourceEvidenceRef ?? `${input.packetId}:evidence:governed-${input.governedWorkerAttempt.worker}-attempt`
    : null;
  const governedAttemptEventRef = input.governedWorkerAttempt
    ? input.governedWorkerAttempt.sourceEventRef ?? `${input.packetId}:evidence:governed-${input.governedWorkerAttempt.worker}-status-event`
    : null;
  const governedWorkerAttempt = input.governedWorkerAttempt && governedAttemptEvidenceRef && governedAttemptEventRef
    ? governedWorkerAttemptFixture({
        ...input.governedWorkerAttempt,
        packetId: input.packetId,
        evidenceRef: governedAttemptEvidenceRef,
        eventRef: governedAttemptEventRef,
      })
    : null;
  if (localModelHealth) {
    evidenceRefs.push({
      refId: localModelHealth.evidenceRef,
      evidenceType: "local_model",
      label: `Local model health: ${localModelHealth.statusLabel}`,
      retentionClass: "metadata_only",
      rawPayloadRetained: false,
    });
  }
  if (hermesJob) {
    evidenceRefs.push({
      refId: hermesJob.evidenceRef,
      evidenceType: "fixture",
      label: `Hermes mocked containment: ${hermesJob.statusLabel}`,
      retentionClass: "metadata_only",
      rawPayloadRetained: false,
    });
  }
  if (codexWorker) {
    evidenceRefs.push({
      refId: codexWorker.evidenceRef,
      evidenceType: "attempt",
      label: `Codex worker state: ${codexWorker.readiness}`,
      retentionClass: "metadata_only",
      rawPayloadRetained: false,
    });
  }
  if (claudeReview) {
    evidenceRefs.push({
      refId: claudeReview.evidenceRef,
      evidenceType: "review",
      label: `Claude reviewer state: ${claudeReview.statusLabel}`,
      retentionClass: "metadata_only",
      rawPayloadRetained: false,
    });
  }
  if (governedWorkerAttempt) {
    evidenceRefs.push(
      {
        refId: governedWorkerAttempt.evidenceRefs[0],
        evidenceType: "attempt",
        label: `Governed ${input.governedWorkerAttempt?.worker} ${input.governedWorkerAttempt?.label ?? "dry-run attempt"}: ${governedWorkerAttempt.status}`,
        retentionClass: "metadata_only",
        rawPayloadRetained: false,
      },
      {
        refId: governedWorkerAttempt.evidenceRefs[1],
        evidenceType: "event",
        label: `Governed ${input.governedWorkerAttempt?.worker} ${input.governedWorkerAttempt?.label ?? "dry-run"} status event`,
        retentionClass: "metadata_only",
        rawPayloadRetained: false,
      }
    );
  }
  const artifactRefs: WorkPacketV0View["artifactRefs"] = [
    {
      refId: `${input.packetId}:artifact:fixture`,
      artifactType: "fixture",
      label: `${input.fixtureId} fixture catalog entry`,
      pathOrUrl: "packages/workflow-core/src/pipeline-state-fixture-matrix.ts",
      status: "available",
    },
  ];
  const humanGateActions = buildHumanGateActions(input);
  const humanGateFixtureEvents = buildHumanGateFixtureEvents(input, humanGateActions);
  const recoveryActions = buildRecoveryActions(input, rows, fixture);
  const recoveryFixtureEvents = buildRecoveryFixtureEvents(input, recoveryActions, humanGateActions);
  const actionGuardFixtures = buildActionGuardFixtures(input, humanGateActions, humanGateFixtureEvents, recoveryActions, recoveryFixtureEvents);
  const memoryProposals = input.fixtureId === "obsidian_proposal_pending_approval"
    ? buildMemoryProposalFixtures(input.packetId, sourceRefs.map((ref) => ref.refId), `${input.packetId}:evidence:fixture`)
    : input.packetId === "fixture:llm-wiki-rebuild-preview"
      ? [llmWikiRebuildReadyMemoryProposal(input.packetId, sourceRefs.map((ref) => ref.refId), `${input.packetId}:evidence:fixture`)]
      : input.fixtureId === "corrupted_incomplete_aggregate"
        ? [memoryProposalFixture("blocked", input.packetId, sourceRefs.map((ref) => ref.refId), `${input.packetId}:evidence:fixture`)]
        : [];
  const alphaMemorySourceStatus = buildAlphaMemorySourceStatus(input.packetId, sourceRefs, evidenceRefs, memoryProposals);

  return {
    packetId: input.packetId,
    fixtureId: input.fixtureId,
    title: input.title,
    requestedOutcome: input.requestedOutcome,
    currentStage: input.currentStage,
    currentOwner: input.currentOwner,
    status: input.status,
    riskLevel: input.riskLevel,
    priority: input.priority,
    candidateWork: null,
    workItem: null,
    taskPacket: null,
    routingPreview: null,
    routeSummary: {
      recommendation: rows[0]?.stage ?? input.currentStage,
      confidenceScore: input.confidenceLabel === "Low confidence" ? 0.36 : 0.82,
      confidenceBand: input.confidenceLabel,
      reasonCodes: input.matrixRowIds,
    },
    executionAttempts: governedWorkerAttempt ? [governedWorkerAttempt] : [],
    sourceRefs,
    evidenceRefs,
    artifactRefs,
    humanGateActions,
    humanGateFixtureEvents,
    actionGuardFixtures,
    laneCards: [
      {
        laneId: `${input.packetId}:lane:${input.currentOwner}`,
        laneType: primaryLaneType(input.currentOwner),
        label: primaryLaneLabel(input.currentOwner),
        status: primaryLaneStatus(input.status, codexWorker, claudeReview),
        summary: `${input.fixtureKind} lane; ${input.summary}`,
        currentOwner: input.currentOwner,
        routeConfidence: input.confidenceLabel === "Low confidence" ? 0.36 : 0.82,
        reasonCodes: input.matrixRowIds,
        evidenceRefs: [
          `${input.packetId}:evidence:fixture`,
          ...(hermesJob ? [hermesJob.evidenceRef] : []),
          ...(codexWorker && input.currentOwner === "codex_worker" ? [codexWorker.evidenceRef] : []),
          ...(claudeReview && input.currentOwner === "claude_reviewer" ? [claudeReview.evidenceRef] : []),
        ],
        artifactRefs: [`${input.packetId}:artifact:fixture`],
      },
      ...(localModelHealth ? [
        {
          laneId: `${input.packetId}:lane:local-model`,
          laneType: "local_model" as const,
          label: "Local GPU Card",
          status: localModelLaneStatus(localModelHealth),
          summary: `${localModelHealth.statusLabel}; ${localModelHealth.authoritySummary}; ${localModelHealth.fallbackPath}`,
          currentOwner: "local_model" as const,
          routeConfidence: input.confidenceLabel === "Low confidence" ? 0.36 : 0.82,
          reasonCodes: [localModelHealth.statusLabel, localModelHealth.callAuthorityState],
          evidenceRefs: [localModelHealth.evidenceRef],
          artifactRefs: [`${input.packetId}:artifact:fixture`],
        },
      ] : []),
      ...(codexWorker && input.currentOwner !== "codex_worker" ? [
        {
          laneId: `${input.packetId}:lane:codex-worker`,
          laneType: "codex_worker" as const,
          label: "Codex Worker Card",
          status: codexWorker.readiness === "active" ? "running" as const : codexWorker.readiness === "blocked" ? "blocked" as const : "available" as const,
          summary: `${codexWorker.role}; ${codexWorker.currentState}; ${codexWorker.boundarySummary}`,
          currentOwner: "codex_worker" as const,
          routeConfidence: input.confidenceLabel === "Low confidence" ? 0.36 : 0.82,
          reasonCodes: [codexWorker.readiness, codexWorker.currentState],
          evidenceRefs: [codexWorker.evidenceRef],
          artifactRefs: [`${input.packetId}:artifact:fixture`],
        },
      ] : []),
      ...(claudeReview && input.currentOwner !== "claude_reviewer" ? [
        {
          laneId: `${input.packetId}:lane:claude-reviewer`,
          laneType: "claude_reviewer" as const,
          label: "Claude Reviewer Card",
          status: claudeReview.statusLabel === "skipped" ? "skipped" as const : claudeReview.statusLabel === "blocked" ? "blocked" as const : "pending" as const,
          summary: `${claudeReview.purpose}; ${claudeReview.costScarcity}; ${claudeReview.boundarySummary}`,
          currentOwner: "claude_reviewer" as const,
          routeConfidence: input.confidenceLabel === "Low confidence" ? 0.36 : 0.82,
          reasonCodes: [claudeReview.statusLabel, claudeReview.independenceMarker, claudeReview.approvalRequirement],
          evidenceRefs: [claudeReview.evidenceRef],
          artifactRefs: [`${input.packetId}:artifact:fixture`],
        },
      ] : []),
    ],
    memoryProposals,
    alphaMemorySourceStatus,
    reviewSummaries: claudeReview ? [
      {
        reviewer: "claude_reviewer",
        status: claudeReview.statusLabel,
        summary: `${claudeReview.purpose}; ${claudeReview.boundarySummary}`,
        evidenceRefs: [claudeReview.evidenceRef],
        artifactRefs: [`${input.packetId}:artifact:fixture`],
      },
    ] : input.currentOwner === "codex_worker" ? [] : [
      {
        reviewer: input.currentOwner,
        status: input.status === "blocked" ? "blocked" : "pending",
        summary: `${input.fixtureKind} review context is metadata-only.`,
        evidenceRefs: [`${input.packetId}:evidence:fixture`],
        artifactRefs: [`${input.packetId}:artifact:fixture`],
      },
    ],
    recoveryActions,
    recoveryFixtureEvents,
    localModelHealth,
    hermesJob,
    codexWorker,
    claudeReview,
    fixtureKind: input.fixtureKind,
    fixtureLabel: `${input.fixtureKind}: ${fixture?.label ?? input.fixtureId}`,
    summary: input.summary,
    nextAction: input.nextAction,
    confidenceLabel: input.confidenceLabel,
    freshnessLabel: input.freshnessLabel,
    sourceTrustState: input.sourceTrustState ?? (input.freshnessLabel === "stale" ? "stale" : "included"),
    sourceTrustStates: input.sourceTrustStates ?? [input.sourceTrustState ?? (input.freshnessLabel === "stale" ? "stale" : "included")],
    sourceTrustSummary: input.sourceTrustSummary ?? "Included fixture metadata only.",
    routeFork: input.routeFork ?? {
      selectedRoute: rows[0]?.stage ?? input.currentStage,
      rejectedRoutes: rejectedRoutesFor(input.currentStage),
      tags: [input.fixtureKind, input.currentStage, input.currentOwner],
      sourceContext: input.sourceTrustSummary ?? "Fixture source refs are metadata-only and summary-only.",
      lowConfidenceActions: input.confidenceLabel === "Low confidence" ? ["Clarify", "Downgrade to reference", "Send back to Research"] : [],
    },
    lastEvent: input.lastEvent ?? `${input.fixtureKind} fixture rendered from ${input.matrixRowIds[0] ?? input.fixtureId}.`,
    riskFlags: input.riskFlags ?? riskFlagsFor(input),
    matrixRowIds: input.matrixRowIds,
  };
}

function buildAlphaMemorySourceStatus(
  packetId: string,
  sourceRefs: SourceRefV0[],
  evidenceRefs: WorkPacketV0View["evidenceRefs"],
  memoryProposals: MemoryProposalV0[]
): AlphaMemorySourceStatusV0 | null {
  const alphaSourceRefs = sourceRefs.filter((ref) => ref.sourceType !== "candidate_work" && ref.sourceType !== "work_item");
  if (alphaSourceRefs.length === 0) {
    return null;
  }
  const sourceBlockedReasons = alphaSourceRefs.flatMap((ref) => [
    ...(ref.accessState !== "allowed" ? [`source_ref.invalid_or_blocked.${ref.refId}`] : []),
    ...(ref.freshness === "stale" ? [`source_ref.stale.${ref.refId}`] : []),
    ...(ref.freshness !== "fresh" && ref.freshness !== "stale" ? [`source_ref.unsafe_freshness.${ref.refId}`] : []),
    ...(ref.sourceType === "llm_wiki" ? [`source_ref.derived_non_canonical.${ref.refId}`] : []),
  ]);
  const alphaBlockedReasons = ["approval_metadata.missing", ...sourceBlockedReasons];
  const sourceRefById = new Map(alphaSourceRefs.map((ref) => [ref.refId, ref]));
  const unsafeProposalReasons = memoryProposals.flatMap((proposal) => [
    ...(proposal.status !== "approved" || proposal.operatorAction !== "approve" ? [`memory_proposal.not_approved.${proposal.proposalId}`] : []),
    ...(proposal.writeBackStatus !== "approved_for_future" ? [`memory_proposal.unsafe_writeback_status.${proposal.proposalId}`] : []),
    ...(proposal.writeBackAllowed !== false ? [`memory_proposal.writeback_allowed.${proposal.proposalId}`] : []),
    ...(proposal.sourceRefs.length === 0 ? [`memory_proposal.missing_source_refs.${proposal.proposalId}`] : []),
    ...(proposal.evidenceRefs.length === 0 ? [`memory_proposal.missing_evidence_refs.${proposal.proposalId}`] : []),
    ...proposal.sourceRefs.flatMap((sourceRefId) => {
      const sourceRef = sourceRefById.get(sourceRefId);
      return sourceRef && (sourceRef.sourceType === "llm_wiki" || sourceRef.accessState !== "allowed" || sourceRef.freshness !== "fresh")
        ? [`memory_proposal.unsafe_source_ref.${proposal.proposalId}.${sourceRefId}`]
        : [];
    }),
    ...(proposal.freshness !== "fresh" ? [`memory_proposal.unsafe_freshness.${proposal.proposalId}`] : []),
    ...(proposal.contradictionStatus !== "none" ? [`memory_proposal.unsafe_contradiction.${proposal.proposalId}`] : []),
  ]);
  const readyProposals = memoryProposals.filter(
    (proposal) => proposal.status === "approved" && proposal.operatorAction === "approve" && proposal.writeBackStatus === "approved_for_future" && proposal.freshness === "fresh" && proposal.contradictionStatus === "none" && proposal.writeBackAllowed === false
  );
  const uniqueBlockedReasons = Array.from(new Set([...sourceBlockedReasons, ...unsafeProposalReasons]));
  const llmWikiDecisionState = memoryProposals.length === 0 && uniqueBlockedReasons.length === 0
    ? "not_configured"
    : readyProposals.length > 0 && uniqueBlockedReasons.length === 0
      ? "ready"
      : "blocked";
  const allowedInputs = readyProposals.map((proposal) => `memory_proposal:${proposal.proposalId}`);
  const rebuildPreview = llmWikiDecisionState === "ready"
    ? {
        previewId: `llm-wiki-rebuild-preview:${packetId}`,
        operationMode: "read_only" as const,
        inputRefs: Array.from(new Set([
          ...readyProposals.flatMap((proposal) => proposal.sourceRefs),
          ...readyProposals.flatMap((proposal) => proposal.evidenceRefs),
          ...allowedInputs,
        ])),
        memoryProposalRefs: readyProposals.map((proposal) => proposal.proposalId),
        plannedOutputScope: "Derived LLM-Wiki index preview from approved memory proposal metadata; no durable index path is allocated.",
        retentionClass: "metadata_only" as const,
        stopLine: "Preview only; do not write LLM-Wiki index, mutate Obsidian, call providers, launch workers, call GitHub, use network egress, or retain source content.",
        auditEventSummary: "LLM-Wiki rebuild preview is fixture-backed metadata only; no file, source, provider, worker, GitHub, or network operation is authorized.",
        canonicalMutationAllowed: false as const,
        sourceMutationAllowed: false as const,
        providerCallsAllowed: false as const,
        workerLaunchAllowed: false as const,
        githubCallsAllowed: false as const,
        networkEgressAllowed: false as const,
        durableWriteAllowed: false as const,
      }
    : null;
  const rebuildDryRunPlan = rebuildPreview
    ? {
        planId: `llm-wiki-rebuild-dry-run-plan:${packetId}`,
        operationMode: "dry_run" as const,
        inputRefs: rebuildPreview.inputRefs,
        memoryProposalRefs: rebuildPreview.memoryProposalRefs,
        plannedDerivedSections: ["approved-memory-proposals", "source-evidence-crosswalk", "operator-review-index"],
        disposableTargetNamespace: `derived://llm-wiki/dry-run/${packetId}`,
        retentionClass: "metadata_only" as const,
        stopLines: [
          "Dry-run only; do not write LLM-Wiki index files.",
          "Do not mutate Obsidian, source refs, or canonical memory.",
          "Do not call providers, launch workers, call GitHub, use network egress, or retain source content.",
        ],
        discardRecoveryPath: "Discard this metadata-only plan and regenerate it from approved Obsidian memory proposal refs.",
        auditEventSummary: "LLM-Wiki rebuild dry-run plan is fixture-backed metadata only; no file, source, provider, worker, GitHub, network, backup, or durable write operation is authorized.",
        canonicalMutationAllowed: false as const,
        sourceMutationAllowed: false as const,
        providerCallsAllowed: false as const,
        workerLaunchAllowed: false as const,
        githubCallsAllowed: false as const,
        networkEgressAllowed: false as const,
        durableWriteAllowed: false as const,
        writePerformed: false as const,
        backupCreated: false as const,
      }
    : null;
  return {
    statusId: `alpha-memory-source:${packetId}`,
    authorityFamily: "memory-writeback-and-source-mutation",
    operationMode: "dry_run",
    decisionState: alphaBlockedReasons.length > 0 ? "blocked" : "ready",
    retentionClass: "metadata_only",
    sourceRefs: alphaSourceRefs.map((ref) => ref.refId),
    targetMetadata: {
      targetKind: "draft_or_quarantine_preview",
      canonicalMutationAllowed: false,
      sourceMutationAllowed: false,
    },
    backupPath: "not_authorized_for_alpha_status",
    rollbackPath: "no_mutation_performed",
    auditEventSummary:
      "Alpha memory/source dry-run status is fixture-backed metadata. No canonical memory, source, provider, worker, GitHub, or network mutation is authorized.",
    blockedReasons: Array.from(new Set(alphaBlockedReasons)),
    recoveryOptions: alphaBlockedReasons.length > 0
      ? ["Review blocked source refs", "Provide explicit approval metadata", "Refresh source refs or send back to Research", "Keep Obsidian canonical; do not promote LLM-Wiki"]
      : ["Run dry-run preview with explicit approval metadata"],
    evidenceRefs: evidenceRefs.map((ref) => ref.refId),
    llmWikiReadiness: {
      statusId: `llm-wiki-readiness:${packetId}`,
      operationMode: "read_only",
      decisionState: llmWikiDecisionState,
      canonicality: "derived_disposable_rebuildable",
      retentionClass: "metadata_only",
      sourceRefs: alphaSourceRefs.filter((ref) => ref.sourceType !== "llm_wiki").map((ref) => ref.refId),
      evidenceRefs: evidenceRefs.map((ref) => ref.refId),
      memoryProposalRefs: readyProposals.map((proposal) => proposal.proposalId),
      allowedInputs,
      blockedReasons: memoryProposals.length === 0 ? Array.from(new Set([...uniqueBlockedReasons, "llm_wiki.no_memory_proposal_metadata"])) : uniqueBlockedReasons,
      nextActions: llmWikiDecisionState === "ready"
        ? ["Preview derived LLM-Wiki rebuild from approved metadata only; no durable write is authorized."]
        : ["Approve a fresh non-contradictory Obsidian memory proposal before derived LLM-Wiki rebuild readiness."],
      boundarySummary: "LLM-Wiki is derived, disposable, and rebuildable; it never overrides Obsidian.",
      rebuildPreview,
      rebuildDryRunPlan,
      canonicalMutationAllowed: false,
      sourceMutationAllowed: false,
      providerCallsAllowed: false,
      durableWriteAllowed: false,
    },
    canonicalMutationAllowed: false,
    sourceMutationAllowed: false,
    providerCallsAllowed: false,
    workerLaunchAllowed: false,
    githubCallsAllowed: false,
    networkEgressAllowed: false,
  };
}

function hermesJobFixture(statusLabel: HermesJobPacketV0["statusLabel"], packetId: string): HermesJobPacketV0 {
  const base = {
    jobId: `${packetId}:hermes:job`,
    packetId,
    workerProfile: "hermes-mock-bounded-subagent",
    inputRefs: [`${packetId}:source:matrix`, `${packetId}:evidence:fixture`],
    allowedMounts: ["read-only fixture refs only"],
    writableOutputDir: hermesOutputDir(packetId),
    credentialPolicy: "none" as const,
    sourceMutationPolicy: "forbidden" as const,
    timeoutSeconds: 900,
    expectedOutputSchema: "HermesMockResultV0 metadata-only fixture schema",
    cleanupPolicy: "preview cleanup policy only; no filesystem cleanup runs",
    killSwitch: "visible policy stop line only; not runnable from dashboard",
    executionMode: "mocked" as const,
    evidenceRef: `${packetId}:evidence:hermes-job`,
    boundarySummary: "Dashboard renders mocked Hermes containment metadata only; no Docker worker is launched.",
  };

  switch (statusLabel) {
    case "mocked_ready":
      return {
        ...base,
        networkPolicy: "none",
        statusLabel,
        containmentSummary: "Mocked Hermes containment is ready for inspection without runtime authority.",
      };
    case "mocked_timeout":
      return {
        ...base,
        networkPolicy: "none",
        statusLabel,
        containmentSummary: "Mocked Hermes timeout is visible and recoverable through the Recovery Drawer.",
      };
    case "blocked_containment":
      return {
        ...base,
        allowedMounts: ["no mounts approved"],
        writableOutputDir: "not allocated in fixture mode",
        networkPolicy: "none",
        timeoutSeconds: 0,
        statusLabel,
        containmentSummary: "Hermes containment is blocked until worker boundaries are approved.",
      };
  }
}

function hermesOutputDir(packetId: string) {
  return `_bmad-output/hermes-mock/${packetId.replaceAll(":", "-")}/fixture-only`;
}

function codexWorkerFixture(readiness: CodexWorkerPacketV0["readiness"], packetId: string): CodexWorkerPacketV0 {
  return {
    workerId: `${packetId}:codex:worker`,
    packetId,
    role: "implementation_worker",
    readiness,
    attemptRefs: [`${packetId}:attempt:codex`, `${packetId}:artifact:progress`],
    currentState: readiness === "active" ? "active_attempt" : readiness === "blocked" ? "blocked_unavailable" : "readiness_only",
    blockedState: readiness === "blocked" ? "blocked; no execution authority from dashboard fixture mode" : "none",
    retentionPolicy: "metadata_only",
    evidenceRef: `${packetId}:evidence:codex-worker`,
    boundarySummary: "Codex is rendered as implementation-worker state, not as an independent reviewer of its own output.",
  };
}

function claudeReviewFixture(statusLabel: ClaudeReviewPacketV0["statusLabel"], packetId: string): ClaudeReviewPacketV0 {
  return {
    reviewId: `${packetId}:claude:review`,
    packetId,
    purpose: "independent_review",
    allowedContextRefs: [`${packetId}:evidence:fixture`, `${packetId}:artifact:fixture`],
    excludedContextRefs: [`${packetId}:source:raw-prompt`, `${packetId}:source:provider-payload`],
    retentionPolicy: "metadata_only",
    expectedFindingsSchema: "ClaudeReviewFindingV0 metadata-only findings list",
    independenceMarker: statusLabel === "blocked" ? "codex_output_review" : "clean_context",
    costScarcity: "scarce",
    approvalRequirement: statusLabel === "skipped" ? "policy_triggered" : "required",
    executionMode: "readiness_or_packet_only",
    statusLabel,
    evidenceRef: `${packetId}:evidence:claude-review`,
    boundarySummary: "Claude is a reviewer / second opinion and not an implementation lane in v0.",
  };
}

function governedWorkerAttemptFixture(input: GovernedWorkerAttemptFixtureInput): WorkPacketExecutionAttemptSummary {
  const timestamp = "2026-06-27T00:00:00.000Z";
  const isActive = input.status === "running";
  const workerId = input.authorityMode === "copied_worktree_worker_execution"
    ? `${input.worker}.governed.copied_worktree_worker_execution`
    : input.authorityMode
      ? `${input.worker}.governed.${input.authorityMode}`
      : `${input.worker}.governed.dry_run`;
  return {
    attemptId: `${input.packetId}:attempt:governed-${input.worker}`,
    workItemId: `${input.packetId}:work-item`,
    routeDecisionId: `${input.packetId}:route:governed-${input.worker}`,
    workerId,
    lane: input.lane ?? `${input.worker}_execution_dry_run`,
    authorityMode: input.authorityMode ?? "non_executing_dry_run",
    status: input.status,
    requestedById: "operator.fixture",
    requestedByLabel: "Pipeline fixture operator",
    createdAt: timestamp,
    updatedAt: timestamp,
    startedAt: isActive ? timestamp : null,
    completedAt: ["completed", "failed", "rejected"].includes(input.status) ? timestamp : null,
    heartbeatAt: isActive ? timestamp : null,
    timeoutAt: null,
    cancelRequestedAt: null,
    cancelReason: null,
    rejectionReason: input.rejectionReason ?? (input.status === "rejected" ? "governed_worker_authority_blocked" : null),
    failureReason: input.failureReason ?? null,
    evidenceRefs: [input.evidenceRef, input.eventRef],
    artifactRefs: [`${input.packetId}:artifact:fixture`],
  };
}

function buildMemoryProposalFixtures(packetId: string, sourceRefs: string[], evidenceRef: string): MemoryProposalV0[] {
  return memoryProposalStates.map((status) => memoryProposalFixture(status, packetId, sourceRefs, evidenceRef));
}

function llmWikiRebuildReadyMemoryProposal(packetId: string, sourceRefs: string[], evidenceRef: string): MemoryProposalV0 {
  const approvedSourceRef = sourceRefs.find((ref) => ref.endsWith(":source:obsidian-approved")) ?? sourceRefs[0] ?? `${packetId}:source:obsidian-approved`;
  return {
    proposalId: `${packetId}:memory:proposal:llm-wiki-ready`,
    packetId,
    label: "LLM-Wiki rebuild preview approved memory",
    status: "approved",
    summary: "Approved metadata-only memory proposal for derived LLM-Wiki rebuild preview.",
    sourceRefs: [approvedSourceRef],
    evidenceRefs: [evidenceRef],
    targetRef: null,
    targetVaultPath: null,
    targetVaultFolder: "01 Dashboard Queue/AI Drafts",
    proposalType: "new_note",
    suggestedContentSummary: "Use approved Obsidian memory metadata as rebuild-preview input refs only.",
    patchSummary: "Metadata-only rebuild preview; no LLM-Wiki index or Obsidian note is written.",
    sensitivity: "low",
    freshness: "fresh",
    contradictionStatus: "none",
    confidence: "high",
    operatorAction: "approve",
    decisionNeededContext: null,
    backupRecoveryPath: "No mutation performed; discard preview metadata if rejected.",
    writeBackStatus: "approved_for_future",
    writeBackAllowed: false,
  };
}
function memoryProposalFixture(
  status: MemoryProposalV0["status"],
  packetId: string,
  sourceRefs: string[],
  evidenceRef: string
): MemoryProposalV0 {
  const proposalSourceRefs = memoryProposalSourceRefs(packetId, sourceRefs);
  const sequence = memoryProposalStates.indexOf(status) + 1;
  const operatorActionByStatus: Record<MemoryProposalV0["status"], MemoryProposalV0["operatorAction"]> = {
    not_applicable: "blocked",
    proposed: "approve",
    pending_human_approval: "approve",
    approved: "approve",
    rejected: "reject",
    deferred: "defer",
    edit_needed: "edit",
    stale: "defer",
    contradictory: "blocked",
    blocked: "blocked",
  };
  const writeBackStatusByStatus: Record<MemoryProposalV0["status"], MemoryProposalV0["writeBackStatus"]> = {
    not_applicable: "blocked",
    proposed: "review_gated",
    pending_human_approval: "review_gated",
    approved: "review_gated",
    rejected: "blocked",
    deferred: "deferred",
    edit_needed: "review_gated",
    stale: "review_gated",
    contradictory: "review_gated",
    blocked: "blocked",
  };
  const freshnessByStatus: Record<MemoryProposalV0["status"], MemoryProposalV0["freshness"]> = {
    not_applicable: "unknown",
    proposed: "fresh",
    pending_human_approval: "fresh",
    approved: "fresh",
    rejected: "fresh",
    deferred: "unknown",
    edit_needed: "fresh",
    stale: "stale",
    contradictory: "conflicting",
    blocked: "unknown",
  };
  const contradictionByStatus: Record<MemoryProposalV0["status"], MemoryProposalV0["contradictionStatus"]> = {
    not_applicable: "none",
    proposed: "possible",
    pending_human_approval: "possible",
    approved: "none",
    rejected: "none",
    deferred: "possible",
    edit_needed: "possible",
    stale: "possible",
    contradictory: "confirmed",
    blocked: "possible",
  };
  const confidenceByStatus: Record<MemoryProposalV0["status"], MemoryProposalV0["confidence"]> = {
    not_applicable: "low",
    proposed: "medium",
    pending_human_approval: "medium",
    approved: "high",
    rejected: "medium",
    deferred: "medium",
    edit_needed: "medium",
    stale: "low",
    contradictory: "low",
    blocked: "low",
  };
  const decisionNeededByStatus: Partial<Record<MemoryProposalV0["status"], string>> = {
    deferred: "Operator deferred durable memory review; keep proposal evidence only.",
    edit_needed: "Operator must edit the summary before any future durable memory workflow.",
    stale: "Source freshness is stale; confirm against canonical Obsidian before future write-back.",
    contradictory: "Manual capture and LLM-Wiki digest disagree; Obsidian remains the default authority.",
    blocked: "Fixture mode blocks direct canonical memory mutation.",
  };
  const labelByStatus: Record<MemoryProposalV0["status"], string> = {
    not_applicable: "Memory proposal not applicable",
    proposed: "Memory proposal proposed",
    pending_human_approval: "Memory proposal pending review",
    approved: "Memory proposal approved for future workflow",
    rejected: "Memory proposal rejected",
    deferred: "Memory proposal deferred",
    edit_needed: "Memory proposal edit needed",
    stale: "Stale memory proposal",
    contradictory: "Contradictory memory proposal",
    blocked: "Memory proposal blocked",
  };

  return {
    proposalId: `${packetId}:memory:proposal:${status}`,
    packetId,
    label: labelByStatus[status],
    status,
    summary: `${labelByStatus[status]}; Obsidian remains human-owned and LLM-Wiki remains derived-only.`,
    sourceRefs: proposalSourceRefs,
    evidenceRefs: [evidenceRef],
    targetRef: null,
    targetVaultPath: `Obsidian/Kendall_Nxt/Inbox/${packetId.replaceAll(":", "-")}.md`,
    targetVaultFolder: "Obsidian/Kendall_Nxt/Inbox",
    proposalType: sequence % 4 === 0 ? "decision_record" : sequence % 3 === 0 ? "error_book_entry" : sequence % 2 === 0 ? "append_note" : "new_note",
    suggestedContentSummary: "Summarize approved learning as metadata-only memory proposal text for operator review.",
    patchSummary: "Patch summary only; no Obsidian note content is copied or mutated in fixture mode.",
    sensitivity: status === "approved" ? "low" : status === "contradictory" || status === "blocked" ? "high" : "medium",
    freshness: freshnessByStatus[status],
    contradictionStatus: contradictionByStatus[status],
    confidence: confidenceByStatus[status],
    operatorAction: operatorActionByStatus[status],
    decisionNeededContext: decisionNeededByStatus[status] ?? null,
    backupRecoveryPath: "Preserve proposal evidence, leave Obsidian unchanged, and rerun review from packet metadata.",
    writeBackStatus: writeBackStatusByStatus[status],
    writeBackAllowed: false,
  };
}

function memoryProposalSourceRefs(packetId: string, sourceRefs: string[]): MemoryProposalV0["sourceRefs"] {
  const firstSourceRef = sourceRefs[0] ?? `${packetId}:source:matrix`;
  return [
    firstSourceRef,
    ...sourceRefs.slice(1),
    `${packetId}:source:obsidian-human-owned`,
    `${packetId}:source:llm-wiki-derived-only`,
  ];
}

function primaryLaneType(owner: WorkPacketOwner) {
  if (owner === "hermes_worker_mock" || owner === "codex_worker" || owner === "claude_reviewer" || owner === "local_model" || owner === "github" || owner === "memory_review") {
    return owner;
  }
  return "utility";
}

function primaryLaneLabel(owner: WorkPacketOwner) {
  switch (owner) {
    case "hermes_worker_mock":
      return "Hermes Worker Mock";
    case "codex_worker":
      return "Codex Worker Card";
    case "claude_reviewer":
      return "Claude Reviewer Card";
    case "local_model":
      return "Local GPU Card";
    case "memory_review":
      return "Memory Review";
    case "github":
      return "GitHub";
    default:
      return "Kendall fixture lane";
  }
}

function primaryLaneStatus(
  status: WorkPacketV0View["status"],
  codexWorker: CodexWorkerPacketV0 | null,
  claudeReview: ClaudeReviewPacketV0 | null
) {
  if (codexWorker) {
    if (codexWorker.readiness === "active") {
      return "running";
    }
    if (codexWorker.readiness === "blocked") {
      return "blocked";
    }
    return "available";
  }
  if (claudeReview) {
    return claudeReview.statusLabel === "blocked" ? "blocked" : claudeReview.statusLabel;
  }
  return status === "blocked" ? "blocked" : "available";
}

function localModelHealthFixture(statusLabel: LocalModelHealthV0["statusLabel"], packetId: string): LocalModelHealthV0 {
  const approvedEndpointUrl = "approved VM-to-host Ollama endpoint (redacted)";
  const approvedModelId = "qwen3:14b";
  const base = {
    provider: "ollama" as const,
    approvedEndpointUrl,
    approvedModelId,
    allowedCaller: "Kendall approved wrapper or fixture health state",
    retentionPolicy: "metadata_only" as const,
    dataSource: "fixture_or_wrapper_state_only" as const,
    evidenceRef: `${packetId}:evidence:local-model-health`,
    noProbeBoundary: "Dashboard does not probe the Windows Ollama endpoint" as const,
  };

  switch (statusLabel) {
    case "healthy":
      return {
        ...base,
        endpointUrl: approvedEndpointUrl,
        endpointApproved: true,
        modelId: approvedModelId,
        modelApproved: true,
        reachable: true,
        busyState: "idle",
        lastLatencyMs: 82,
        lastFailure: null,
        callAuthorityState: "approved",
        statusLabel,
        fallbackPath: "Use approved local wrapper path only; no fallback routing is performed.",
        authoritySummary: "Approved endpoint and model match fixture policy.",
      };
    case "unavailable":
      return {
        ...base,
        endpointUrl: approvedEndpointUrl,
        endpointApproved: true,
        modelId: approvedModelId,
        modelApproved: true,
        reachable: false,
        busyState: "unknown",
        lastLatencyMs: null,
        lastFailure: "Local Ollama wrapper health unavailable from fixture state.",
        callAuthorityState: "blocked",
        statusLabel,
        fallbackPath: "Keep packet in Kendall/operator review; no fallback routing is performed.",
        authoritySummary: "Blocked until approved wrapper health is reachable.",
      };
    case "busy":
      return {
        ...base,
        endpointUrl: approvedEndpointUrl,
        endpointApproved: true,
        modelId: approvedModelId,
        modelApproved: true,
        reachable: true,
        busyState: "busy",
        lastLatencyMs: 940,
        lastFailure: "Local GPU busy; capacity is not available for this packet.",
        callAuthorityState: "approved",
        statusLabel,
        fallbackPath: "Wait, refresh health evidence, or use a typed Human Gate reroute.",
        authoritySummary: "Approved path exists, but local GPU capacity is busy.",
      };
    case "model_mismatch":
      return {
        ...base,
        endpointUrl: approvedEndpointUrl,
        endpointApproved: true,
        modelId: "llama3.1:8b",
        modelApproved: false,
        reachable: null,
        busyState: "unknown",
        lastLatencyMs: null,
        lastFailure: "Configured model does not match approved qwen3:14b.",
        callAuthorityState: "approval_required",
        statusLabel,
        fallbackPath: "Request provider approval or change back to approved model before model use.",
        authoritySummary: "Model mismatch requires explicit provider exception authority.",
      };
    case "endpoint_mismatch":
      return {
        ...base,
        endpointUrl: "unapproved local Ollama endpoint (redacted)",
        endpointApproved: false,
        modelId: approvedModelId,
        modelApproved: true,
        reachable: null,
        busyState: "unknown",
        lastLatencyMs: null,
        lastFailure: "Configured endpoint does not match the approved VM-to-host endpoint.",
        callAuthorityState: "approval_required",
        statusLabel,
        fallbackPath: "Open provider approval gate or send back to Shape; do not probe endpoint.",
        authoritySummary: "Endpoint mismatch requires explicit provider exception authority.",
      };
    case "approval_required":
      return {
        ...base,
        endpointUrl: approvedEndpointUrl,
        endpointApproved: true,
        modelId: approvedModelId,
        modelApproved: true,
        reachable: null,
        busyState: "unknown",
        lastLatencyMs: null,
        lastFailure: "Provider call authority has not been granted for this packet.",
        callAuthorityState: "approval_required",
        statusLabel,
        fallbackPath: "Use approve_provider_exception Human Gate action or keep packet in Shape.",
        authoritySummary: "Approved endpoint/model are configured, but packet-level call authority is required.",
      };
  }
}

function localModelLaneStatus(health: LocalModelHealthV0) {
  if (health.statusLabel === "healthy") {
    return "available" as const;
  }
  if (health.statusLabel === "busy") {
    return "pending" as const;
  }
  return "blocked" as const;
}

function buildHumanGateActions(input: {
  packetId: string;
  currentStage: PipelineStage;
  currentOwner: WorkPacketOwner;
  status: WorkPacketV0View["status"];
  fixtureId: string;
  nextAction: string;
}): HumanGateActionV0[] {
  const evidenceRef = `${input.packetId}:evidence:fixture`;
  const common = {
    packetId: input.packetId,
    evidenceRef,
  };

  if (input.currentStage === "human_gate") {
    return [
      humanGateAction({
        ...common,
        type: "approve_execution",
        family: "Approve",
        label: "Approve execution",
        uiCopy: "Approve execution: mocked Hermes or Codex lane.",
        status: "available",
        authorityFamily: "operator.execution.fixture",
        stopLines: ["Do not launch a real worker from fixture mode.", "Do not call provider/model endpoints."],
        rollbackPath: "Return to Shape with fixture evidence preserved.",
        resultingStage: "execute",
        resultingOwner: "codex_worker",
        auditEventType: "human_gate.approve_execution.fixture"
      }),
      humanGateAction({
        ...common,
        type: "approve_provider_exception",
        family: "Escalate",
        label: "Approve provider exception",
        uiCopy: "Escalate to provider exception review.",
        status: "disabled",
        authorityFamily: "operator.provider.exception",
        stopLines: ["Provider calls remain disabled in fixture mode."],
        rollbackPath: "Keep packet at Human Gate until provider evidence exists.",
        resultingStage: "human_gate",
        resultingOwner: "operator",
        auditEventType: "human_gate.approve_provider_exception.blocked",
        disabledReason: "disabled reason: provider evidence is not present in fixture mode."
      }),
      humanGateAction({
        ...common,
        type: "request_clarification",
        family: "Pause",
        label: "Pause for clarification",
        uiCopy: "Pause this packet until the operator adds clarification.",
        status: "disabled",
        authorityFamily: "operator.clarification.fixture",
        stopLines: ["Do not advance execution while clarification is missing."],
        rollbackPath: "Keep packet at Human Gate with fixture evidence preserved.",
        resultingStage: "human_gate",
        resultingOwner: "operator",
        auditEventType: "human_gate.request_clarification.disabled",
        disabledReason: "disabled reason: clarification capture is preview-only."
      }),
      humanGateAction({
        ...common,
        type: "reject_packet",
        family: "Reject",
        label: "Reject packet",
        uiCopy: "Reject this packet and preserve fixture evidence.",
        status: "blocked",
        authorityFamily: "operator.packet.reject",
        stopLines: ["Do not discard evidence automatically."],
        rollbackPath: "Keep packet at Human Gate with rejection rationale required.",
        resultingStage: "human_gate",
        resultingOwner: "operator",
        auditEventType: "human_gate.reject_packet.blocked",
        disabledReason: "disabled reason: rejection rationale fixture is missing."
      })
    ];
  }

  if (input.currentStage === "deliver") {
    return [
      humanGateAction({
        ...common,
        type: "approve_delivery",
        family: "Mark Resolved",
        label: "Mark delivery resolved",
        uiCopy: "Mark delivery evidence resolved as a fixture-only preview.",
        status: "blocked",
        authorityFamily: "operator.delivery.fixture",
        stopLines: ["Do not merge, push, or update GitHub from fixture mode."],
        rollbackPath: "Keep delivery evidence unchanged and return to Review if needed.",
        resultingStage: "learn",
        resultingOwner: "kendall",
        auditEventType: "human_gate.approve_delivery.blocked",
        disabledReason: "disabled reason: delivery handling is preview-only."
      })
    ];
  }

  if (input.fixtureId === "stale_gate_action") {
    return [
      humanGateAction({
        ...common,
        type: "approve_execution",
        family: "Approve",
        label: "Approve stale execution",
        uiCopy: "Blocked because the approval was created for an older packet state.",
        status: "stale",
        authorityFamily: "operator.execution.fixture",
        stopLines: ["Do not apply stale approval to a changed packet state.", "Do not launch Hermes, Codex, or provider execution from stale fixture authority."],
        rollbackPath: "Refresh context or reopen Human Gate with current packet evidence.",
        resultingStage: "shape",
        resultingOwner: "kendall",
        auditEventType: "human_gate.approve_execution.stale",
        disabledReason: "disabled reason: stale packet state changed from human_gate/operator/waiting to shape/kendall/active."
      }),
      humanGateAction({
        ...common,
        type: "approve_provider_exception",
        family: "Escalate",
        label: "Replace model gateway",
        uiCopy: "Blocked because provider/model gateway replacement is outside fixture authority.",
        status: "blocked",
        authorityFamily: "operator.provider.exception",
        stopLines: ["Do not replace the model gateway from fixture mode.", "Do not call provider/model endpoints."],
        rollbackPath: "Keep packet in Shape and request a bounded provider approval packet.",
        resultingStage: "shape",
        resultingOwner: "kendall",
        auditEventType: "human_gate.approve_provider_exception.blocked",
        disabledReason: "disabled reason: unsafe authority class model gateway replacement."
      }),
      humanGateAction({
        ...common,
        type: "send_back_to_shape",
        family: "Request Changes",
        label: "Refresh context",
        uiCopy: "Refresh context and keep the packet in Shape.",
        status: "disabled",
        authorityFamily: "operator.context.refresh",
        stopLines: ["Do not submit stale action ids."],
        rollbackPath: "Keep packet in Shape with stale evidence preserved.",
        resultingStage: "shape",
        resultingOwner: "kendall",
        auditEventType: "human_gate.refresh_context.disabled",
        disabledReason: "disabled reason: refresh is a safe next option preview only."
      })
    ];
  }

  if (input.fixtureId === "obsidian_proposal_pending_approval") {
    return [
      humanGateAction({
        ...common,
        type: "approve_memory_proposal",
        family: "Approve",
        label: "Approve memory proposal",
        uiCopy: "Approve memory proposal as review metadata only.",
        status: "available",
        authorityFamily: "operator.memory.proposal",
        stopLines: ["Do not mutate the Obsidian vault from fixture mode."],
        rollbackPath: "Leave Obsidian unchanged and return to Learn review.",
        resultingStage: "learn",
        resultingOwner: "memory_review",
        auditEventType: "human_gate.approve_memory_proposal.fixture"
      }),
      humanGateAction({
        ...common,
        type: "edit_packet",
        family: "Request Changes",
        label: "Edit memory proposal",
        uiCopy: "Request changes before any memory proposal is accepted.",
        status: "disabled",
        authorityFamily: "operator.memory.proposal",
        stopLines: ["Do not write back automatically."],
        rollbackPath: "Keep packet in Learn with proposal evidence preserved.",
        resultingStage: "learn",
        resultingOwner: "memory_review",
        auditEventType: "human_gate.edit_packet.disabled",
        disabledReason: "disabled reason: edit flow is preview-only."
      }),
      humanGateAction({
        ...common,
        type: "send_back_to_research",
        family: "Request Changes",
        label: "Send back to Research",
        uiCopy: "Return memory proposal context to Research before retrying.",
        status: "disabled",
        authorityFamily: "operator.memory.research",
        stopLines: ["Do not copy or mutate Obsidian content automatically."],
        rollbackPath: "Keep packet in Learn with proposal evidence preserved.",
        resultingStage: "capture",
        resultingOwner: "kendall",
        auditEventType: "human_gate.send_back_to_research.disabled",
        disabledReason: "disabled reason: research return is preview-only."
      })
    ];
  }

  if (input.status === "blocked" || input.status === "failed") {
    return [
      humanGateAction({
        ...common,
        type: "rerun_smaller",
        family: "Retry",
        label: "Rerun smaller",
        uiCopy: "Retry with a smaller bounded fixture lane.",
        status: "disabled",
        authorityFamily: "operator.recovery.fixture",
        stopLines: ["Do not launch a worker automatically."],
        rollbackPath: "Return to Shape with failed evidence preserved.",
        resultingStage: "shape",
        resultingOwner: "kendall",
        auditEventType: "human_gate.rerun_smaller.disabled",
        disabledReason: "disabled reason: recovery action remains fixture-only."
      }),
      humanGateAction({
        ...common,
        type: "reroute",
        family: "Request Changes",
        label: "Reroute",
        uiCopy: "Reroute the packet with evidence preserved.",
        status: "disabled",
        authorityFamily: "operator.route.fixture",
        stopLines: ["Do not mutate routing source state."],
        rollbackPath: "Return to Route or Shape with fixture evidence preserved.",
        resultingStage: "shape",
        resultingOwner: "kendall",
        auditEventType: "human_gate.reroute.disabled",
        disabledReason: "disabled reason: reroute command handling is not enabled."
      }),
      humanGateAction({
        ...common,
        type: "cancel_worker",
        family: "Pause",
        label: "Cancel worker",
        uiCopy: "Cancel the bounded worker lane while preserving evidence.",
        status: "disabled",
        authorityFamily: "operator.worker.cancel",
        stopLines: ["Do not stop or launch a real worker from fixture mode."],
        rollbackPath: "Keep failed worker evidence attached to the packet.",
        resultingStage: "execute",
        resultingOwner: "blocked",
        auditEventType: "human_gate.cancel_worker.disabled",
        disabledReason: "disabled reason: worker cancellation is preview-only."
      }),
      humanGateAction({
        ...common,
        type: "discard_result",
        family: "Reject",
        label: "Discard result",
        uiCopy: "Discard worker or review result only after explicit operator authority.",
        status: "disabled",
        authorityFamily: "operator.result.discard",
        stopLines: ["Do not discard evidence automatically."],
        rollbackPath: "Keep packet blocked with evidence preserved.",
        resultingStage: "review",
        resultingOwner: "operator",
        auditEventType: "human_gate.discard_result.disabled",
        disabledReason: "disabled reason: discard requires recorded rationale."
      }),
      humanGateAction({
        ...common,
        type: "send_back_to_shape",
        family: "Request Changes",
        label: "Send back to Shape",
        uiCopy: "Return failed or rejected packet to Shape after operator review.",
        status: "disabled",
        authorityFamily: "operator.shape.return",
        stopLines: ["Do not mutate routing or execution source state."],
        rollbackPath: "Keep current failed evidence available in Review.",
        resultingStage: "shape",
        resultingOwner: "kendall",
        auditEventType: "human_gate.send_back_to_shape.disabled",
        disabledReason: "disabled reason: shape return is preview-only."
      })
    ];
  }

  return [
    humanGateAction({
      ...common,
      type: input.currentStage === "route" ? "approve_route" : "send_back_to_shape",
      family: input.currentStage === "route" ? "Approve" : "Request Changes",
      label: input.nextAction,
      uiCopy: input.currentStage === "route" ? "Approve route preview as fixture metadata." : "Send packet back to Shape as a fixture-only preview.",
      status: "blocked",
      authorityFamily: "operator.fixture.preview",
      stopLines: ["No command is available outside Human Gate in this story."],
      rollbackPath: "Keep current fixture packet state unchanged.",
      resultingStage: input.currentStage === "route" ? "shape" : "shape",
      resultingOwner: "kendall",
      auditEventType: input.currentStage === "route" ? "human_gate.approve_route.blocked" : "human_gate.send_back_to_shape.blocked",
      disabledReason: "disabled reason: active Human Gate authority is unavailable for this stage."
    })
  ];
}

function humanGateAction(input: Omit<HumanGateActionV0, "actionId" | "payload" | "requiredEvidenceRefs"> & {
  packetId: string;
  evidenceRef: string;
}): HumanGateActionV0 {
  const actionId = `${input.packetId}:action:${input.type}`;
  return {
    actionId,
    type: input.type,
    family: input.family,
    label: input.label,
    uiCopy: input.uiCopy,
    status: input.status,
    authorityFamily: input.authorityFamily,
    payload: {
      packetId: input.packetId,
      actionId,
      decisionId: `${input.packetId}:decision:current`
    },
    requiredEvidenceRefs: [input.evidenceRef],
    stopLines: input.stopLines,
    rollbackPath: input.rollbackPath,
    resultingStage: input.resultingStage,
    resultingOwner: input.resultingOwner,
    auditEventType: input.auditEventType,
    ...(input.disabledReason ? { disabledReason: input.disabledReason } : {})
  };
}

function buildHumanGateFixtureEvents(
  input: {
    currentStage: PipelineStage;
    currentOwner: WorkPacketOwner;
  },
  actions: HumanGateActionV0[]
): HumanGateFixtureEvent[] {
  return actions.map((action) => ({
    eventId: `${action.actionId}:event`,
    actionId: action.actionId,
    eventType: "human_gate.fixture_action_preview",
    summary: `${action.family} ${action.type} previews ${input.currentStage}/${input.currentOwner} -> ${action.resultingStage}/${action.resultingOwner}.`,
    fromStage: input.currentStage,
    fromOwner: input.currentOwner,
    toStage: action.resultingStage,
    toOwner: action.resultingOwner,
    evidenceRefs: action.requiredEvidenceRefs,
    auditEventType: action.auditEventType,
  }));
}

function buildRecoveryActions(input: {
  packetId: string;
  currentStage: PipelineStage;
  currentOwner: WorkPacketOwner;
  status: WorkPacketV0View["status"];
  fixtureId: string;
}, rows: PipelineMatrixRow[], fixture: { recoveryActions: RecoveryActionTypeV0[] }): RecoveryActionV0[] {
  const evidenceRef = `${input.packetId}:evidence:fixture`;
  const matrixRecoveryActions = new Set(rows.flatMap((row) => row.recoveryActions));
  const catalogRecoveryActions = new Set(fixture.recoveryActions);
  return recoveryActionTypes
    .filter((actionType) => matrixRecoveryActions.has(actionType) && catalogRecoveryActions.has(actionType))
    .map((actionType) => {
      const metadata = recoveryActionFixtureMetadata(actionType, input);
      return recoveryAction({
        packetId: input.packetId,
        actionType,
        label: metadata.label,
        availability: metadata.availability,
        consequence: metadata.consequence,
        resultingStage: metadata.resultingStage,
        resultingOwner: metadata.resultingOwner,
        evidenceRefs: [evidenceRef],
      });
    });
}

function recoveryAction(input: Omit<RecoveryActionV0, "actionId"> & { packetId: string }): RecoveryActionV0 {
  return {
    actionId: `${input.packetId}:recovery:${input.actionType}`,
    actionType: input.actionType,
    label: input.label,
    availability: input.availability,
    consequence: input.consequence,
    resultingStage: input.resultingStage,
    resultingOwner: input.resultingOwner,
    evidenceRefs: input.evidenceRefs,
  };
}

function recoveryActionFixtureMetadata(
  actionType: RecoveryActionTypeV0,
  input: {
    currentStage: PipelineStage;
    currentOwner: WorkPacketOwner;
    fixtureId: string;
  }
): Omit<RecoveryActionV0, "actionId" | "actionType" | "evidenceRefs"> & {
  requiresHumanGate: boolean;
  humanGateActionType: HumanGateActionV0["type"] | null;
} {
  switch (actionType) {
    case "retry_smaller":
      return {
        label: "Retry smaller",
        availability: "available",
        consequence: "Reference the Human Gate retry action before any rerun preview.",
        resultingStage: "shape",
        resultingOwner: "kendall",
        requiresHumanGate: true,
        humanGateActionType: "rerun_smaller",
      };
    case "reroute":
      return {
        label: "Reroute",
        availability: "available",
        consequence: "Reference the Human Gate reroute action before route state changes.",
        resultingStage: "shape",
        resultingOwner: "kendall",
        requiresHumanGate: true,
        humanGateActionType: "reroute",
      };
    case "cancel_worker":
      return {
        label: "Cancel worker",
        availability: "available",
        consequence: "Reference the Human Gate cancel action before stopping a worker lane.",
        resultingStage: "execute",
        resultingOwner: "blocked",
        requiresHumanGate: true,
        humanGateActionType: "cancel_worker",
      };
    case "discard_result":
      return {
        label: "Discard result",
        availability: "available",
        consequence: "Reference the Human Gate discard action before discarding worker or review evidence.",
        resultingStage: input.currentStage === "review" ? "shape" : "review",
        resultingOwner: "operator",
        requiresHumanGate: true,
        humanGateActionType: "discard_result",
      };
    case "preserve_evidence":
      return {
        label: "Preserve evidence",
        availability: "available",
        consequence: "Keep failed or blocked evidence attached without changing external state.",
        resultingStage: input.currentStage,
        resultingOwner: input.currentOwner,
        requiresHumanGate: false,
        humanGateActionType: null,
      };
    case "reopen_human_gate":
      return {
        label: "Reopen Human Gate",
        availability: "available",
        consequence: "Reference the existing Human Gate action list before any proposal or execution decision.",
        resultingStage: "human_gate",
        resultingOwner: "operator",
        requiresHumanGate: true,
        humanGateActionType: input.fixtureId === "obsidian_proposal_pending_approval" ? "approve_memory_proposal" : "approve_execution",
      };
    case "mark_blocked":
      return {
        label: "Mark blocked",
        availability: "available",
        consequence: "Keep the packet blocked with evidence and rationale preserved.",
        resultingStage: input.currentStage,
        resultingOwner: "blocked",
        requiresHumanGate: false,
        humanGateActionType: null,
      };
    case "send_back_to_shape":
      return {
        label: "Send back to Shape",
        availability: "available",
        consequence: "Reference the Human Gate shape-return action before sending work back to Shape.",
        resultingStage: "shape",
        resultingOwner: "kendall",
        requiresHumanGate: true,
        humanGateActionType: "send_back_to_shape",
      };
    case "send_back_to_research":
      return {
        label: "Send back to Research",
        availability: "available",
        consequence: "Reference the Human Gate research-return action before retrying source work.",
        resultingStage: "capture",
        resultingOwner: "kendall",
        requiresHumanGate: true,
        humanGateActionType: "send_back_to_research",
      };
  }
}

function buildRecoveryFixtureEvents(
  input: {
    currentStage: PipelineStage;
    currentOwner: WorkPacketOwner;
    fixtureId: string;
  },
  actions: RecoveryActionV0[],
  humanGateActions: HumanGateActionV0[]
): RecoveryFixtureEvent[] {
  return actions.map((action) => {
    const metadata = recoveryActionFixtureMetadata(action.actionType, input);
    const humanGateAction = humanGateActions.find((gateAction) => gateAction.type === metadata.humanGateActionType) ?? null;
    return {
      eventId: `${action.actionId}:event`,
      actionId: action.actionId,
      eventType: "work_packet.recovery_selected.fixture_preview",
      summary: `${action.label} previews ${input.currentStage}/${input.currentOwner} -> ${action.resultingStage}/${action.resultingOwner}.`,
      fromStage: input.currentStage,
      fromOwner: input.currentOwner,
      toStage: action.resultingStage,
      toOwner: action.resultingOwner,
      evidenceRefs: action.evidenceRefs,
      auditEventType: `work_packet.recovery_selected.${action.actionType}.fixture`,
      requiresHumanGate: metadata.requiresHumanGate,
      humanGateActionId: humanGateAction?.actionId ?? null,
    };
  });
}

function buildActionGuardFixtures(
  input: {
    packetId: string;
    currentStage: PipelineStage;
    currentOwner: WorkPacketOwner;
    status: WorkPacketV0View["status"];
    fixtureId: string;
  },
  humanGateActions: HumanGateActionV0[],
  humanGateFixtureEvents: HumanGateFixtureEvent[],
  recoveryActions: RecoveryActionV0[],
  recoveryFixtureEvents: RecoveryFixtureEvent[]
): ActionGuardFixture[] {
  const actualState = `${input.currentStage}/${input.currentOwner}/${input.status}`;
  const guards: ActionGuardFixture[] = [];

  for (const action of humanGateActions) {
    const fixtureEvent = humanGateFixtureEvents.find((event) => event.actionId === action.actionId);
    if (action.status !== "available") {
      guards.push(actionGuardFixture({
        packetId: input.packetId,
        actionId: action.actionId,
        actionSurface: "human_gate",
        actionType: action.type,
        classification: guardClassificationForHumanGateAction(action, input),
        unsafeClass: unsafeClassForHumanGateAction(action),
        expectedState: expectedStateForHumanGateAction(action, input),
        actualState,
        disabledReason: action.disabledReason ?? "disabled reason: action is not available for the current packet state.",
        stopLine: action.stopLines[0] ?? "Do not submit unavailable action authority.",
        safeNextOption: safeNextOptionForHumanGateAction(action),
        resultingStage: action.resultingStage,
        resultingOwner: action.resultingOwner,
        evidenceRefs: action.requiredEvidenceRefs,
        fixtureEventId: fixtureEvent?.eventId ?? null,
        primaryRisk: "false_authority",
      }));
    }
  }

  for (const action of recoveryActions) {
    const fixtureEvent = recoveryFixtureEvents.find((event) => event.actionId === action.actionId);
    if (action.availability !== "available" || fixtureEvent?.requiresHumanGate) {
      guards.push(actionGuardFixture({
        packetId: input.packetId,
        actionId: action.actionId,
        actionSurface: "recovery",
        actionType: action.actionType,
        classification: fixtureEvent?.requiresHumanGate ? "unsafe_authority_class" : "missing_evidence",
        unsafeClass: unsafeClassForRecoveryAction(action),
        expectedState: actualState,
        actualState,
        disabledReason: fixtureEvent?.requiresHumanGate
          ? "disabled reason: recovery requires Human Gate authority before execution."
          : "disabled reason: recovery is unavailable for this packet evidence.",
        stopLine: stopLineForRecoveryAction(action),
        safeNextOption: fixtureEvent?.humanGateActionId ? `Open Human Gate reference ${fixtureEvent.humanGateActionId}` : "Preserve evidence or send back to Shape.",
        resultingStage: action.resultingStage,
        resultingOwner: action.resultingOwner,
        evidenceRefs: action.evidenceRefs,
        fixtureEventId: fixtureEvent?.eventId ?? null,
        primaryRisk: "false_authority",
      }));
    }
  }

  if (input.fixtureId === "corrupted_incomplete_aggregate") {
    guards.push(actionGuardFixture({
      packetId: input.packetId,
      actionId: `${input.packetId}:action:blocked_source_boundary`,
      actionSurface: "human_gate",
      actionType: "blocked_source_boundary",
      classification: "blocked_source_boundary",
      unsafeClass: "evidence_retention_bypass",
      expectedState: "capture/kendall/waiting with allowed source refs",
      actualState,
      disabledReason: "disabled reason: blocked source boundary prevents authority escalation.",
      stopLine: "Do not bypass evidence retention or copy restricted source content.",
      safeNextOption: "Refresh context, downgrade to reference, or send back to Research.",
      resultingStage: "capture",
      resultingOwner: "kendall",
      evidenceRefs: [`${input.packetId}:evidence:fixture`],
      fixtureEventId: null,
      primaryRisk: "false_authority",
    }));
  }

  if (input.fixtureId === "stale_gate_action") {
    guards.push(actionGuardFixture({
      packetId: input.packetId,
      actionId: `${input.packetId}:action:missing_evidence`,
      actionSurface: "human_gate",
      actionType: "missing_evidence",
      classification: "missing_evidence",
      unsafeClass: "none",
      expectedState: "shape/kendall/active with current gate evidence",
      actualState,
      disabledReason: "disabled reason: missing evidence prevents action activation.",
      stopLine: "Do not submit actions with missing required evidence.",
      safeNextOption: "Refresh context or reopen Human Gate with current evidence.",
      resultingStage: "shape",
      resultingOwner: "kendall",
      evidenceRefs: [`${input.packetId}:evidence:fixture`],
      fixtureEventId: null,
      primaryRisk: "false_authority",
    }));
    const staleAction = humanGateActions.find((action) => action.status === "stale") ?? null;
    if (staleAction) {
      guards.push(actionGuardFixture({
        packetId: input.packetId,
        expectedPacketId: `${input.packetId}:previous`,
        actualPacketId: input.packetId,
        expectedActionId: `${staleAction.actionId}:previous`,
        actualActionId: staleAction.actionId,
        actionId: staleAction.actionId,
        actionSurface: "human_gate",
        actionType: staleAction.type,
        classification: "stale_action_id",
        unsafeClass: "real_hermes_launch",
        expectedState: "human_gate/operator/waiting with previous decision id",
        actualState,
        disabledReason: "disabled reason: stale packet id and stale action id no longer match current packet state.",
        stopLine: "Do not submit stale packet or action ids.",
        safeNextOption: "Refresh context or reopen Human Gate with current packet evidence.",
        resultingStage: "shape",
        resultingOwner: "kendall",
        evidenceRefs: staleAction.requiredEvidenceRefs,
        fixtureEventId: humanGateFixtureEvents.find((event) => event.actionId === staleAction.actionId)?.eventId ?? null,
        primaryRisk: "false_authority",
      }));
    }
    const refreshAction = humanGateActions.find((action) => action.type === "send_back_to_shape") ?? null;
    if (refreshAction) {
      guards.push(actionGuardFixture({
        packetId: input.packetId,
        actionId: refreshAction.actionId,
        actionSurface: "human_gate",
        actionType: refreshAction.type,
        classification: "stale_action_id",
        unsafeClass: "none",
        expectedState: actualState,
        actualState,
        disabledReason: "disabled reason: refresh context is the non-authorizing safe next option for stale authority.",
        stopLine: "Do not treat refresh context as execution approval.",
        safeNextOption: "Refresh context locally and keep packet in Shape.",
        resultingStage: refreshAction.resultingStage,
        resultingOwner: refreshAction.resultingOwner,
        evidenceRefs: refreshAction.requiredEvidenceRefs,
        fixtureEventId: humanGateFixtureEvents.find((event) => event.actionId === refreshAction.actionId)?.eventId ?? null,
        primaryRisk: "false_authority",
      }));
    }
  }

  if (input.fixtureId === "obsidian_proposal_pending_approval") {
    guards.push(actionGuardFixture({
      packetId: input.packetId,
      actionId: `${input.packetId}:action:obsidian_mutation`,
      actionSurface: "human_gate",
      actionType: "obsidian_mutation",
      classification: "unsafe_authority_class",
      unsafeClass: "obsidian_mutation",
      expectedState: "learn/memory_review/waiting with human-owned vault",
      actualState,
      disabledReason: "disabled reason: direct Obsidian mutation is blocked; fixture mode may only preview proposal metadata.",
      stopLine: "Do not mutate canonical Obsidian notes from fixture mode.",
      safeNextOption: "Approve, edit, reject, or defer the memory proposal through Human Gate metadata.",
      resultingStage: "learn",
      resultingOwner: "memory_review",
      evidenceRefs: [`${input.packetId}:evidence:fixture`],
      fixtureEventId: null,
      primaryRisk: "false_authority",
    }));
  }

  if (input.fixtureId === "codex_active_claude_pending") {
    guards.push(actionGuardFixture({
      packetId: input.packetId,
      actionId: `${input.packetId}:action:expanded_claude_automation`,
      actionSurface: "human_gate",
      actionType: "expanded_claude_automation",
      classification: "unsafe_authority_class",
      unsafeClass: "expanded_claude_automation",
      expectedState: "review/kendall/complete with scarce review approval",
      actualState,
      disabledReason: "disabled reason: expanded Claude automation requires separate provider and spending authority.",
      stopLine: "Do not start Claude or expand scarce review automation from fixture mode.",
      safeNextOption: "Keep Kendall review or request bounded Claude review approval.",
      resultingStage: "review",
      resultingOwner: "kendall",
      evidenceRefs: [`${input.packetId}:evidence:fixture`],
      fixtureEventId: null,
      primaryRisk: "false_authority",
    }));
  }

  guards.push(actionGuardFixture({
    packetId: input.packetId,
    actionId: `${input.packetId}:action:unknown_action`,
    actionSurface: "human_gate",
    actionType: "unknown_action",
    classification: "unknown_action",
    unsafeClass: "none",
    expectedState: actualState,
    actualState,
    disabledReason: "disabled reason: unknown actions are rejected deterministically.",
    stopLine: "Do not infer authority for unknown action types.",
    safeNextOption: "Refresh context or reopen Human Gate with a typed action.",
    resultingStage: input.currentStage,
    resultingOwner: input.currentOwner,
    evidenceRefs: [`${input.packetId}:evidence:fixture`],
    fixtureEventId: null,
    primaryRisk: "false_authority",
  }));

  return guards;
}

function actionGuardFixture(input: Omit<ActionGuardFixture, "guardId" | "actualPacketId" | "expectedPacketId" | "actualActionId" | "expectedActionId"> & {
  packetId: string;
  expectedPacketId?: string;
  actualPacketId?: string;
  expectedActionId?: string;
  actualActionId?: string;
}): ActionGuardFixture {
  return {
    guardId: `${input.actionId}:guard:${input.classification}`,
    actionId: input.actionId,
    actionSurface: input.actionSurface,
    actionType: input.actionType,
    classification: input.classification,
    unsafeClass: input.unsafeClass,
    expectedPacketId: input.expectedPacketId ?? input.packetId,
    actualPacketId: input.actualPacketId ?? input.packetId,
    expectedActionId: input.expectedActionId ?? input.actionId,
    actualActionId: input.actualActionId ?? input.actionId,
    expectedState: input.expectedState,
    actualState: input.actualState,
    disabledReason: input.disabledReason,
    stopLine: input.stopLine,
    safeNextOption: input.safeNextOption,
    resultingStage: input.resultingStage,
    resultingOwner: input.resultingOwner,
    evidenceRefs: input.evidenceRefs,
    fixtureEventId: input.fixtureEventId,
    primaryRisk: input.primaryRisk,
  };
}

function guardClassificationForHumanGateAction(
  action: HumanGateActionV0,
  input: { fixtureId: string }
): ActionGuardFixture["classification"] {
  if (action.status === "stale" || action.disabledReason?.includes("stale packet state")) {
    return "stale_packet_state";
  }
  if (action.type === "approve_provider_exception") {
    return "unsafe_authority_class";
  }
  if (action.requiredEvidenceRefs.length === 0) {
    return "missing_evidence";
  }
  if (input.fixtureId === "corrupted_incomplete_aggregate") {
    return "blocked_source_boundary";
  }
  return "stale_action_id";
}

function unsafeClassForHumanGateAction(action: HumanGateActionV0): ActionGuardFixture["unsafeClass"] {
  if (action.type === "approve_execution") {
    return "real_hermes_launch";
  }
  if (action.type === "approve_provider_exception") {
    return "model_gateway_replacement";
  }
  if (action.type === "approve_memory_proposal") {
    return "obsidian_mutation";
  }
  return "none";
}

function unsafeClassForRecoveryAction(action: RecoveryActionV0): ActionGuardFixture["unsafeClass"] {
  if (action.actionType === "retry_smaller" || action.actionType === "cancel_worker") {
    return "real_hermes_launch";
  }
  if (action.actionType === "discard_result") {
    return "evidence_retention_bypass";
  }
  return "none";
}

function expectedStateForHumanGateAction(
  action: HumanGateActionV0,
  input: {
    currentStage: PipelineStage;
    currentOwner: WorkPacketOwner;
    status: WorkPacketV0View["status"];
    fixtureId: string;
  }
) {
  if (action.status === "stale" || input.fixtureId === "stale_gate_action") {
    return "human_gate/operator/waiting";
  }
  return `${input.currentStage}/${input.currentOwner}/${input.status}`;
}

function safeNextOptionForHumanGateAction(action: HumanGateActionV0) {
  if (action.status === "stale") {
    return "Refresh context or reopen Human Gate.";
  }
  if (action.type === "approve_provider_exception") {
    return "Request bounded provider approval or send back to Shape.";
  }
  if (action.type === "approve_execution") {
    return "Reopen Human Gate before execution approval.";
  }
  return action.type === "send_back_to_shape" ? "Send back to Shape." : "Preserve evidence and refresh context.";
}

function stopLineForRecoveryAction(action: RecoveryActionV0) {
  if (action.actionType === "retry_smaller" || action.actionType === "cancel_worker") {
    return "Do not launch or cancel a real worker from fixture mode.";
  }
  if (action.actionType === "discard_result") {
    return "Do not discard evidence without explicit Human Gate authority.";
  }
  return "Do not execute recovery without packet-backed evidence and authority.";
}

function cloneDensityPacket(packet: PipelineFixturePacket, ordinal: number): PipelineFixturePacket {
  const packetId = `fixture:density-${String(ordinal).padStart(2, "0")}-${packet.packetId.replace("fixture:", "")}`;
  const remapId = (value: string) => value.replaceAll(packet.packetId, packetId);

  return {
    ...packet,
    packetId,
    title: `Density ${ordinal}: ${packet.title}`,
    requestedOutcome: `Density ${ordinal}: ${packet.requestedOutcome}`,
    summary: `Density ${ordinal}: ${packet.summary}`,
    fixtureLabel: `${packet.fixtureLabel}; density fixture`,
    sourceRefs: packet.sourceRefs.map((ref) => ({
      ...ref,
      refId: remapId(ref.refId),
      label: `Density ${ordinal}: ${ref.label}`,
    })),
    evidenceRefs: packet.evidenceRefs.map((ref) => ({
      ...ref,
      refId: remapId(ref.refId),
      label: `Density ${ordinal}: ${ref.label}`,
    })),
    artifactRefs: packet.artifactRefs.map((ref) => ({
      ...ref,
      refId: remapId(ref.refId),
      label: `Density ${ordinal}: ${ref.label}`,
    })),
    humanGateActions: packet.humanGateActions.map((action) => ({
      ...action,
      actionId: remapId(action.actionId),
      payload: {
        ...action.payload,
        packetId,
        actionId: remapId(action.payload.actionId),
        decisionId: remapId(action.payload.decisionId),
      },
      requiredEvidenceRefs: action.requiredEvidenceRefs.map(remapId),
    })),
    humanGateFixtureEvents: packet.humanGateFixtureEvents.map((event) => ({
      ...event,
      eventId: remapId(event.eventId),
      actionId: remapId(event.actionId),
      evidenceRefs: event.evidenceRefs.map(remapId),
    })),
    actionGuardFixtures: packet.actionGuardFixtures.map((guard) => ({
      ...guard,
      guardId: remapId(guard.guardId),
      actionId: remapId(guard.actionId),
      expectedPacketId: remapId(guard.expectedPacketId),
      actualPacketId: remapId(guard.actualPacketId),
      expectedActionId: remapId(guard.expectedActionId),
      actualActionId: remapId(guard.actualActionId),
      expectedState: remapId(guard.expectedState),
      actualState: remapId(guard.actualState),
      disabledReason: remapId(guard.disabledReason),
      stopLine: remapId(guard.stopLine),
      safeNextOption: remapId(guard.safeNextOption),
      evidenceRefs: guard.evidenceRefs.map(remapId),
      fixtureEventId: guard.fixtureEventId ? remapId(guard.fixtureEventId) : null,
    })),
    laneCards: packet.laneCards.map((lane) => ({
      ...lane,
      laneId: remapId(lane.laneId),
      label: `Density ${ordinal}: ${lane.label}`,
      summary: `Density ${ordinal}: ${lane.summary}`,
      reasonCodes: [...lane.reasonCodes],
      evidenceRefs: lane.evidenceRefs.map(remapId),
      artifactRefs: lane.artifactRefs.map(remapId),
    })),
    memoryProposals: packet.memoryProposals.map((proposal) => {
      const sourceRefs = proposal.sourceRefs.map(remapId) as MemoryProposalV0["sourceRefs"];
      const evidenceRefs = proposal.evidenceRefs.map(remapId) as MemoryProposalV0["evidenceRefs"];
      return {
        ...proposal,
        proposalId: remapId(proposal.proposalId),
        packetId,
        label: `Density ${ordinal}: ${proposal.label}`,
        sourceRefs,
        evidenceRefs,
        targetVaultPath: proposal.targetVaultPath ? proposal.targetVaultPath.replace(packet.packetId.replaceAll(":", "-"), packetId.replaceAll(":", "-")) : proposal.targetVaultPath,
      };
    }),
    reviewSummaries: packet.reviewSummaries.map((review) => ({
      ...review,
      evidenceRefs: review.evidenceRefs.map(remapId),
      artifactRefs: review.artifactRefs.map(remapId),
    })),
    recoveryActions: packet.recoveryActions.map((action) => ({
      ...action,
      actionId: remapId(action.actionId),
      evidenceRefs: action.evidenceRefs.map(remapId),
    })),
    recoveryFixtureEvents: packet.recoveryFixtureEvents.map((event) => ({
      ...event,
      eventId: remapId(event.eventId),
      actionId: remapId(event.actionId),
      evidenceRefs: event.evidenceRefs.map(remapId),
      humanGateActionId: event.humanGateActionId ? remapId(event.humanGateActionId) : null,
    })),
    localModelHealth: packet.localModelHealth ? {
      ...packet.localModelHealth,
      evidenceRef: remapId(packet.localModelHealth.evidenceRef),
    } : null,
    hermesJob: packet.hermesJob ? {
      ...packet.hermesJob,
      jobId: remapId(packet.hermesJob.jobId),
      packetId: remapId(packet.hermesJob.packetId),
      inputRefs: packet.hermesJob.inputRefs.map(remapId),
      writableOutputDir: packet.hermesJob.writableOutputDir === "not allocated in fixture mode"
        ? packet.hermesJob.writableOutputDir
        : hermesOutputDir(packetId),
      evidenceRef: remapId(packet.hermesJob.evidenceRef),
    } : null,
    codexWorker: packet.codexWorker ? {
      ...packet.codexWorker,
      workerId: remapId(packet.codexWorker.workerId),
      packetId: remapId(packet.codexWorker.packetId),
      attemptRefs: packet.codexWorker.attemptRefs.map(remapId),
      evidenceRef: remapId(packet.codexWorker.evidenceRef),
    } : null,
    claudeReview: packet.claudeReview ? {
      ...packet.claudeReview,
      reviewId: remapId(packet.claudeReview.reviewId),
      packetId: remapId(packet.claudeReview.packetId),
      allowedContextRefs: packet.claudeReview.allowedContextRefs.map(remapId),
      excludedContextRefs: packet.claudeReview.excludedContextRefs.map(remapId),
      evidenceRef: remapId(packet.claudeReview.evidenceRef),
    } : null,
    routeSummary: packet.routeSummary ? {
      ...packet.routeSummary,
      reasonCodes: [...packet.routeSummary.reasonCodes],
    } : null,
    sourceTrustStates: [...packet.sourceTrustStates],
    routeFork: {
      ...packet.routeFork,
      rejectedRoutes: [...packet.routeFork.rejectedRoutes],
      tags: [...packet.routeFork.tags, "density"],
      lowConfidenceActions: [...packet.routeFork.lowConfidenceActions],
    },
    riskFlags: [...packet.riskFlags, "density fixture"],
    matrixRowIds: [...packet.matrixRowIds],
  };
}

function rejectedRoutesFor(stage: PipelineStage) {
  return pipelineStages.filter((candidate) => candidate !== stage).slice(0, 3);
}

function riskFlagsFor(input: { riskLevel: WorkPacketV0View["riskLevel"]; freshnessLabel: string; fixtureKind: PipelineFixtureKind }) {
  const flags = [`${input.riskLevel} risk`];
  if (input.freshnessLabel !== "fresh") {
    flags.push(input.freshnessLabel);
  }
  if (input.fixtureKind !== "fixture-only") {
    flags.push(input.fixtureKind);
  }
  return flags;
}

function requireSelectedPipelinePacket(packets: PipelineFixturePacket[]) {
  const selectedPacket = packets[0];
  if (!selectedPacket) {
    throw new Error("Pipeline fixture cockpit requires at least one packet.");
  }
  return selectedPacket;
}

function requireCatalogEntry(id: string) {
  const fixture = catalogById.get(id);
  if (!fixture) {
    throw new Error(`Pipeline fixture references unknown catalog id: ${id}`);
  }
  return fixture;
}

function requireMatrixRows(ids: string[]) {
  return ids.map((id) => {
    const row = rowById.get(id);
    if (!row) {
      throw new Error(`Pipeline fixture references unknown matrix row id: ${id}`);
    }
    return row;
  });
}

function validatePacketMatrixRows(
  input: {
    packetId: string;
    currentStage: PipelineStage;
    currentOwner: WorkPacketOwner;
    status: WorkPacketV0View["status"];
  },
  rows: PipelineMatrixRow[]
) {
  for (const row of rows) {
    if (row.id.startsWith("contract.")) {
      continue;
    }
    if (row.stage !== input.currentStage || row.owner !== input.currentOwner || row.status !== input.status) {
      throw new Error(
        `Pipeline fixture ${input.packetId} matrix row ${row.id} does not match packet stage/owner/status.`
      );
    }
  }
}
