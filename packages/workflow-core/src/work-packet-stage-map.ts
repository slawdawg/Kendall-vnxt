import type {
  CandidateWorkStatus,
  ExecutionAttemptStatus,
  MemoryProposalStatusV0,
  PipelineStage,
  WorkPacketLaneTypeV0,
  WorkPacketOwner,
  WorkPacketStatus,
  WorkflowState
} from "@kendall/contracts";

export interface WorkPacketStageMappingInputV0 {
  candidateWorkStatus?: CandidateWorkStatus | null;
  candidateWorkPromoted?: boolean | null;
  workItemState?: WorkflowState | null;
  hasRoutingPreview?: boolean;
  hasExecutionRecipe?: boolean;
  executionApproved?: boolean;
  executionAttemptStatus?: ExecutionAttemptStatus | null;
  executionAttemptLane?: WorkPacketLaneTypeV0 | string | null;
  hasDeliveryEvidence?: boolean;
  deliveryOwner?: "github" | "kendall" | null;
  hasMemoryProposal?: boolean;
  memoryProposalStatus?: MemoryProposalStatusV0 | null;
  hasClaudeReviewReadiness?: boolean;
}

export interface WorkPacketStageMappingResultV0 {
  currentStage: PipelineStage;
  currentOwner: WorkPacketOwner;
  status: WorkPacketStatus;
  reasonCodes: string[];
  ambiguityNotes: string[];
}

const CANDIDATE_WORK_STAGE_MAP: Record<CandidateWorkStatus, WorkPacketStageMappingResultV0> = {
  proposed: stageResult("capture", "kendall", "waiting", ["candidate.proposed"]),
  approved: stageResult("promote", "operator", "waiting", ["candidate.approved_unpromoted"]),
  rejected: stageResult("capture", "operator", "deferred", ["candidate.rejected_reference"]),
  deferred: stageResult("capture", "operator", "deferred", ["candidate.deferred_reference"])
};

const WORK_ITEM_STAGE_MAP: Record<WorkflowState, WorkPacketStageMappingResultV0> = {
  queued: stageResult("capture", "kendall", "active", ["work_item.queued"]),
  triaged: stageResult("classify", "kendall", "active", ["work_item.triaged"]),
  ready: stageResult("human_gate", "operator", "waiting", ["work_item.ready"]),
  implementing: stageResult("execute", "codex_worker", "active", ["work_item.implementing"]),
  validating: stageResult("review", "kendall", "active", ["work_item.validating"]),
  reviewing: stageResult("review", "kendall", "active", ["work_item.reviewing"]),
  awaiting_audit: stageResult("review", "operator", "waiting", ["work_item.awaiting_audit"]),
  needs_rework: stageResult("shape", "kendall", "active", ["work_item.needs_rework"]),
  blocked: stageResult("human_gate", "blocked", "blocked", ["work_item.blocked"]),
  done: stageResult("deliver", "kendall", "complete", ["work_item.done"])
};

export function mapWorkPacketStage(input: WorkPacketStageMappingInputV0): WorkPacketStageMappingResultV0 {
  const ambiguityNotes = collectAmbiguityNotes(input);
  const ambiguityReasonCodes = collectAmbiguityReasonCodes(input);
  const memoryProposalStatus = input.memoryProposalStatus ?? (input.hasMemoryProposal ? "proposed" : null);

  if (input.workItemState === "done" && input.hasDeliveryEvidence) {
    return withAmbiguity(
      stageResult("deliver", input.deliveryOwner === "github" ? "github" : "kendall", "complete", [
        "delivery.evidence_present",
        ...ambiguityReasonCodes
      ]),
      ambiguityNotes
    );
  }

  if (input.workItemState === "done" && memoryProposalStatus && memoryProposalStatus !== "not_applicable") {
    return withAmbiguity(
      stageResult("learn", "memory_review", statusForMemoryProposal(memoryProposalStatus), [
        `memory.${memoryProposalStatus}`,
        ...ambiguityReasonCodes
      ]),
      ambiguityNotes
    );
  }

  if (input.executionAttemptStatus) {
    return withAmbiguity(
      resultForExecutionAttempt(input.executionAttemptStatus, input.executionAttemptLane, ambiguityReasonCodes),
      ambiguityNotes
    );
  }

  if (!input.workItemState && input.hasDeliveryEvidence) {
    return withAmbiguity(
      stageResult("deliver", input.deliveryOwner === "github" ? "github" : "kendall", "complete", [
        "delivery.evidence_without_done",
        ...ambiguityReasonCodes
      ]),
      ambiguityNotes
    );
  }

  if (!input.workItemState && memoryProposalStatus && memoryProposalStatus !== "not_applicable") {
    return withAmbiguity(
      stageResult("learn", "memory_review", statusForMemoryProposal(memoryProposalStatus), [
        `memory.${memoryProposalStatus}`,
        "memory.proposal_without_done",
        ...ambiguityReasonCodes
      ]),
      ambiguityNotes
    );
  }

  if (input.hasRoutingPreview && (!input.workItemState || input.workItemState === "triaged")) {
    return withAmbiguity(
      stageResult("route", "kendall", "active", ["routing.preview_present", ...ambiguityReasonCodes]),
      ambiguityNotes
    );
  }

  if (input.hasExecutionRecipe && !input.executionApproved) {
    return withAmbiguity(
      stageResult("shape", "kendall", "active", ["execution.recipe_unapproved", ...ambiguityReasonCodes]),
      ambiguityNotes
    );
  }

  if (input.workItemState) {
    const base = WORK_ITEM_STAGE_MAP[input.workItemState];
    if (input.workItemState === "implementing") {
      const owner = ownerForExecutionLane(input.executionAttemptLane);
      return withAmbiguity(stageResult("execute", owner.owner, "active", base.reasonCodes.concat(owner.reasonCodes, ambiguityReasonCodes)), ambiguityNotes.concat(owner.ambiguityNotes));
    }
    if (input.workItemState === "reviewing" && input.hasClaudeReviewReadiness) {
      return withAmbiguity(
        stageResult("review", "claude_reviewer", "active", ["review.claude_ready", ...ambiguityReasonCodes]),
        ambiguityNotes
      );
    }
    return withAmbiguity(
      stageResult(base.currentStage, base.currentOwner, base.status, base.reasonCodes.concat(ambiguityReasonCodes)),
      ambiguityNotes
    );
  }

  if (input.candidateWorkStatus) {
    if (input.candidateWorkStatus === "approved" && input.candidateWorkPromoted) {
      return withAmbiguity(
        stageResult("capture", "kendall", "waiting", ["candidate.promoted_missing_work_item", ...ambiguityReasonCodes]),
        ambiguityNotes.concat("Candidate Work is promoted, but no Work Item state was provided.")
      );
    }
    const base = CANDIDATE_WORK_STAGE_MAP[input.candidateWorkStatus];
    return withAmbiguity(
      stageResult(base.currentStage, base.currentOwner, base.status, base.reasonCodes.concat(ambiguityReasonCodes)),
      ambiguityNotes
    );
  }

  return stageResult("capture", "kendall", "waiting", ["source.missing"], [
    "No Candidate Work status, Work Item state, routing preview, execution attempt, delivery evidence, or memory proposal was provided."
  ]);
}

function resultForExecutionAttempt(
  status: ExecutionAttemptStatus,
  lane: WorkPacketStageMappingInputV0["executionAttemptLane"],
  reasonCodes: string[]
): WorkPacketStageMappingResultV0 {
  if (status === "rejected" && lane === "hermes_governed_execution") {
    return stageResult("execute", "hermes_worker_mock", "blocked", [
      `execution_attempt.${status}`,
      "execution_lane.hermes_governed_execution",
      ...reasonCodes
    ]);
  }
  switch (status) {
    case "planned":
      return stageResult("shape", "kendall", "waiting", [`execution_attempt.${status}`, ...reasonCodes]);
    case "approved":
      return stageResult("human_gate", "operator", "waiting", [`execution_attempt.${status}`, ...reasonCodes]);
    case "starting":
    case "running": {
      const owner = ownerForExecutionLane(lane);
      return stageResult(
        "execute",
        owner.owner,
        "active",
        [`execution_attempt.${status}`, ...owner.reasonCodes, ...reasonCodes],
        owner.ambiguityNotes
      );
    }
    case "completed":
      return stageResult("review", "kendall", "complete", [`execution_attempt.${status}`, ...reasonCodes]);
    case "cancelled":
      return stageResult("execute", "blocked", "blocked", [`execution_attempt.${status}`, ...reasonCodes]);
    case "cancel_requested":
    case "timed_out":
    case "failed":
    case "rejected":
      return stageResult("execute", "blocked", "failed", [`execution_attempt.${status}`, ...reasonCodes]);
  }
}

function ownerForExecutionLane(lane: WorkPacketStageMappingInputV0["executionAttemptLane"]): {
  owner: WorkPacketOwner;
  reasonCodes: string[];
  ambiguityNotes: string[];
} {
  if (lane === "hermes_worker_mock") {
    return { owner: "hermes_worker_mock", reasonCodes: [], ambiguityNotes: [] };
  }
  if (lane === "hermes_governed_execution" || lane === "hermes_execution_dry_run") {
    return { owner: "hermes_worker_mock", reasonCodes: [`execution_lane.${lane}`], ambiguityNotes: [] };
  }
  if (lane === "claude_governed_execution" || lane === "claude_execution_dry_run") {
    return { owner: "claude_reviewer", reasonCodes: [`execution_lane.${lane}`], ambiguityNotes: [] };
  }
  if (lane === "codex_worker" || lane === "codex_cli_worker" || lane === "local_sandbox_execute") {
    return { owner: "codex_worker", reasonCodes: [], ambiguityNotes: [] };
  }
  if (lane === "local_patch_draft") {
    return {
      owner: "kendall",
      reasonCodes: ["execution_lane.local_patch_draft_kendall_owned"],
      ambiguityNotes: ["Local patch draft lane is represented as Kendall-owned until a worker is selected."]
    };
  }
  if (lane === "local_model" || lane === "local_readonly") {
    return { owner: "local_model", reasonCodes: [], ambiguityNotes: [] };
  }
  if (lane === "github") {
    return { owner: "github", reasonCodes: [], ambiguityNotes: [] };
  }
  if (lane === "memory_review") {
    return { owner: "memory_review", reasonCodes: [], ambiguityNotes: [] };
  }
  if (lane) {
    return {
      owner: "kendall",
      reasonCodes: [`execution_lane.unsupported.${lane}`],
      ambiguityNotes: [`Execution lane '${lane}' is not mapped to a cockpit owner; falling back to Kendall.`]
    };
  }
  return {
    owner: "kendall",
    reasonCodes: ["execution_lane.missing"],
    ambiguityNotes: ["Execution attempt lane is missing; falling back to Kendall."]
  };
}

function collectAmbiguityNotes(input: WorkPacketStageMappingInputV0): string[] {
  const notes: string[] = [];
  if (input.hasDeliveryEvidence && input.hasMemoryProposal && input.workItemState === "done") {
    notes.push("Work Item is done with both delivery evidence and memory proposal; delivery evidence takes Deliver precedence.");
  }
  if (input.hasRoutingPreview && input.workItemState && input.workItemState !== "triaged") {
    notes.push("Routing preview is present outside the expected triaged state.");
  }
  if (input.executionAttemptStatus && !input.workItemState) {
    notes.push("Execution attempt status is present without a Work Item state.");
  }
  if (input.candidateWorkStatus === "approved" && input.candidateWorkPromoted && !input.workItemState) {
    notes.push("Approved Candidate Work is marked promoted without a Work Item state.");
  }
  if (input.hasDeliveryEvidence && input.workItemState && input.workItemState !== "done") {
    notes.push("Delivery evidence is present outside the expected done state.");
  }
  if ((input.hasMemoryProposal || input.memoryProposalStatus) && input.workItemState && input.workItemState !== "done") {
    notes.push("Memory proposal signal is present outside the expected done state.");
  }
  return notes;
}

function collectAmbiguityReasonCodes(input: WorkPacketStageMappingInputV0): string[] {
  const reasonCodes: string[] = [];
  if (input.hasDeliveryEvidence && input.hasMemoryProposal && input.workItemState === "done") {
    reasonCodes.push("precedence.delivery_over_memory");
  }
  if (input.hasRoutingPreview && input.workItemState && input.workItemState !== "triaged") {
    reasonCodes.push("routing.preview_unexpected_state");
  }
  if (input.hasDeliveryEvidence && input.workItemState && input.workItemState !== "done") {
    reasonCodes.push("delivery.evidence_unexpected_state");
  }
  if ((input.hasMemoryProposal || input.memoryProposalStatus) && input.workItemState && input.workItemState !== "done") {
    reasonCodes.push("memory.proposal_unexpected_state");
  }
  return reasonCodes;
}

function statusForMemoryProposal(status: MemoryProposalStatusV0): WorkPacketStatus {
  if (status === "approved") {
    return "complete";
  }
  if (status === "blocked") {
    return "blocked";
  }
  if (status === "rejected") {
    return "deferred";
  }
  return "waiting";
}

function stageResult(
  currentStage: PipelineStage,
  currentOwner: WorkPacketOwner,
  status: WorkPacketStatus,
  reasonCodes: string[],
  ambiguityNotes: string[] = []
): WorkPacketStageMappingResultV0 {
  return {
    currentStage,
    currentOwner,
    status,
    reasonCodes,
    ambiguityNotes
  };
}

function withAmbiguity(
  result: WorkPacketStageMappingResultV0,
  ambiguityNotes: string[]
): WorkPacketStageMappingResultV0 {
  return {
    ...result,
    ambiguityNotes: result.ambiguityNotes.concat(ambiguityNotes)
  };
}
