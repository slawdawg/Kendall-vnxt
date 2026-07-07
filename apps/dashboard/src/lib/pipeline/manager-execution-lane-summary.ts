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

export function projectManagerExecutionLaneSummary(
  summary: ManagerControlPlane.ManagerExecutionLaneSummary
): PipelineManagerExecutionLaneState {
  const evidenceByWorkItem = new Map<string, string[]>();
  const evidenceByLease = new Map<string, string[]>();
  for (const link of summary.evidenceLinks) {
    if (link.workItemId) {
      evidenceByWorkItem.set(String(link.workItemId), [...(evidenceByWorkItem.get(String(link.workItemId)) ?? []), String(link.evidenceRefId)]);
    }
    if (link.leaseId) {
      evidenceByLease.set(String(link.leaseId), [...(evidenceByLease.get(String(link.leaseId)) ?? []), String(link.evidenceRefId)]);
    }
  }
  const singleActiveLeaseEvidenceRefs = summary.activeWorkItemIds.length === 1
    ? summary.evidenceLinks
      .filter((link) => link.leaseId && !link.workItemId)
      .map((link) => String(link.evidenceRefId))
    : [];
  const displayStates = explicitDisplayStates(summary);
  return {
    runId: summary.runId,
    phase: summary.currentPhase,
    stateSource: summary.stateSource,
    proofMode: summary.proofMode,
    authorityStage: summary.authorityStage,
    authorityClass: summary.authorityClass,
    freshness: summary.freshness,
    evidenceFreshness: summary.evidenceFreshness,
    rawStateLabels: summary.rawStateLabels,
    statusText: laneStatusText(summary),
    operatorAttentionRequired: summary.operatorAttentionRequired,
    attentionReason: summary.attentionReason ?? null,
    unknownReason: summary.unknownReason ?? null,
    authorityBlockedReason: summary.authorityBlockedReason ?? null,
    authorityStopReason: summary.authorityStopReason ?? null,
    recoveryStatus: summary.recoveryStatus,
    recoveryAttemptCount: summary.recoveryAttemptCount,
    lastObservedAt: summary.lastObservedAt,
    lastMeaningfulProgressAt: summary.lastMeaningfulProgressAt ?? null,
    blockers: summary.blockers,
    warnings: summary.warnings,
    evidenceRefs: summary.evidenceRefs,
    sourceCursor: summary.sourceCursor,
    eventWatermark: String(summary.eventWatermark),
    currentLimitations: currentLimitations(summary),
    evidenceLinks: summary.evidenceLinks.map((link, index) => ({
      key: `${String(link.evidenceRefId)}:${String(link.workItemId ?? "no-work")}:${String(link.leaseId ?? "no-lease")}:${String(link.attemptId ?? "no-attempt")}:${index}`,
      evidenceRefId: String(link.evidenceRefId),
      sourceRequirementIds: link.sourceRequirementIds,
      workItemId: link.workItemId ? String(link.workItemId) : null,
      leaseId: link.leaseId ? String(link.leaseId) : null,
      attemptId: link.attemptId ? String(link.attemptId) : null,
      eventWatermark: String(link.eventWatermark),
      verificationCommandId: link.verificationCommandId ?? null,
      proofHarnessId: link.proofHarnessId ?? null,
      result: link.result,
      retentionClass: link.retentionClass,
      rawPayloadRetained: false
    })),
    authorityOperations: buildAuthorityOperationRows(summary),
    deliveryControlRows: buildDeliveryControlRows(summary),
    feedbackRouteRows: buildFeedbackRouteRows(summary),
    affectedDeliveryGates: sanitizeFeedbackDeliveryGates(summary.affectedDeliveryGates),
    feedbackRecordPolicy: "metadata_only_feedback_record",
    feedbackUnrelatedLanePolicy: "continue_unrelated_safe_lanes",
    feedbackRetention: "metadata_only",
    feedbackRawPayloadRetained: false,
    safeWorkAvailableCount: summary.safeWorkAvailableCount,
    metadataOnlyQueuedCount: summary.metadataOnlyQueuedCount ?? 0,
    unsafeOrGatedWorkCount: summary.unsafeOrGatedWorkCount,
    stateCounts: summary.stateCounts,
    nextAction: summary.nextAction,
    queueRows: summary.queuedWorkItemIds.map((workItemId) => ({
      id: String(workItemId),
      label: "WorkItem",
      rawState: "queued",
      reason: summary.safeWorkAvailableCount > 0 ? "Safe work available from backend summary." : "No safe queued work is available.",
      authorityClass: summary.authorityClass,
      authorityReason: authorityReason(summary, "Queue lease issuance follows the active summary authority class."),
      evidenceRefIds: evidenceByWorkItem.get(String(workItemId)) ?? [],
      nextAction: summary.nextAction
    })),
    leaseRows: summary.activeWorkItemIds.map((workItemId) => ({
      id: String(workItemId),
      label: "Active WorkItem",
      rawState: activeRowState(summary),
      reason: summary.operatorAttentionRequired ? summary.attentionReason ?? "Attention required." : "Lease state comes from backend summary.",
      authorityClass: summary.authorityClass,
      authorityReason: authorityReason(summary, "Active lease state is observable only from the backend summary."),
      evidenceRefIds: Array.from(new Set([...(evidenceByWorkItem.get(String(workItemId)) ?? []), ...singleActiveLeaseEvidenceRefs])),
      nextAction: summary.nextAction
    })),
    refillPanel: {
      title: "Refill and bootstrap",
      state: refillPanelState(summary),
      reason: refillPanelReason(summary),
      authorityClass: summary.authorityClass,
      authorityReason: authorityReason(summary, "Refill/bootstrap state is read-only in the dashboard."),
      nextAction: summary.nextAction
    },
    workerPanel: {
      title: "Worker pool",
      state: summary.currentPhase === "manager_only" ? "manager_only" : summary.stateCounts.running > 0 ? "running" : "idle",
      reason: summary.currentPhase === "manager_only"
        ? summary.attentionReason ?? summary.authorityStopReason ?? "Manager-only mode is active."
        : `${summary.stateCounts.running} running / ${summary.stateCounts.leased} leased from summary counts.`,
      authorityClass: liveWorkerAuthorityClass(summary),
      authorityReason: liveWorkerAuthorityReason(summary),
      nextAction: summary.nextAction
    },
    resourceUsagePanel: {
      title: "Resource and usage",
      state: resourceUsageState(summary),
      reason: resourceUsageReason(summary),
      authorityClass: summary.authorityClass,
      authorityReason: authorityReason(summary, "Resource and usage governance is summary-only on this surface."),
      nextAction: summary.nextAction
    },
    sourceExhausted: summary.currentPhase === "closed" || summary.rawStateLabels.includes("source_exhausted"),
    fixtureBacked: summary.stateSource === "fixture",
    displayStates
  };
}

const authorityOperationCatalog = [
  {
    key: "workspace-files",
    operation: "Workspace file mutation",
    family: "workspace_files",
    missingContract: null,
    mutationRisk: "workspace_files",
    requiredEvidence: ["source refs", "verification command", "rollback note"],
    rollbackOrRecoveryNote: "Use the current worktree diff and story evidence to revert or patch the scoped file change."
  },
  {
    key: "runtime-state",
    operation: "Manager runtime state",
    family: "runtime_state",
    missingContract: null,
    mutationRisk: "manager_runtime_state",
    requiredEvidence: ["authority decision", "runtime state path", "event watermark"],
    rollbackOrRecoveryNote: "Replay or repair manager-owned runtime state from bounded ledger evidence."
  },
  {
    key: "live-workers",
    operation: "Live worker execution",
    family: "live_worker_execution",
    missingContract: "live_worker_phase",
    mutationRisk: "sessions/workers",
    requiredEvidence: ["live-worker readiness", "literal-safe handoff proof", "received-command proof"],
    rollbackOrRecoveryNote: "Drain or pause manager-owned workers and preserve lease evidence before retry."
  },
  {
    key: "tmux-session-control",
    operation: "tmux/session control",
    family: "tmux_session_control",
    missingContract: "live_worker_phase",
    mutationRisk: "sessions/workers",
    requiredEvidence: ["live-worker readiness", "session owner proof", "received-command proof"],
    rollbackOrRecoveryNote: "Stop sending commands, inspect owned sessions, and park lanes with evidence."
  },
  {
    key: "pr-creation",
    operation: "PR creation",
    family: "delivery_stewardship",
    missingContract: "delivery_phase",
    mutationRisk: "GitHub/PR delivery",
    requiredEvidence: ["delivery_phase", "branch scope", "local verification"],
    rollbackOrRecoveryNote: "Leave the branch local or close/update the PR only under delivery authority."
  },
  {
    key: "git-mutation",
    operation: "Git branch/commit/push mutation",
    family: "git_mutation",
    missingContract: "delivery_phase",
    mutationRisk: "Git branch/commit/push",
    requiredEvidence: ["delivery_phase", "branch scope", "dirty-worktree evidence", "local verification", "rollback path"],
    rollbackOrRecoveryNote: "Preserve the current branch/head and stop before commit or push when delivery authority is missing."
  },
  {
    key: "pr-update",
    operation: "PR update",
    family: "delivery_stewardship",
    missingContract: "delivery_phase",
    mutationRisk: "GitHub/PR delivery",
    requiredEvidence: ["delivery_phase", "exact head", "local verification"],
    rollbackOrRecoveryNote: "Preserve the reviewed head SHA and stop before push when authority is missing."
  },
  {
    key: "pr-merge",
    operation: "PR merge",
    family: "delivery_stewardship",
    missingContract: "delivery_phase",
    mutationRisk: "GitHub/PR delivery",
    requiredEvidence: ["delivery_phase", "exact head", "green checks", "thread-aware review state", "rollback path"],
    rollbackOrRecoveryNote: "Use the recorded head SHA and branch protection evidence as the rollback anchor."
  },
  {
    key: "cleanup",
    operation: "Cleanup",
    family: "cleanup_stewardship",
    missingContract: "delivery_phase",
    mutationRisk: "cleanup",
    requiredEvidence: ["delivery_phase", "scoped cleanup target", "dry-run evidence", "rollback path"],
    rollbackOrRecoveryNote: "Run scoped cleanup dry-run first and preserve skipped targets."
  },
  {
    key: "provider-access",
    operation: "Provider access",
    family: "provider_access",
    missingContract: "provider_preauthorization",
    mutationRisk: "provider/account/payment",
    requiredEvidence: ["provider approval", "cost boundary", "retention policy"],
    rollbackOrRecoveryNote: "Stop provider calls and preserve only metadata evidence; do not retain payloads."
  },
  {
    key: "supervisor-runtime",
    operation: "Supervisor/runtime integration",
    family: "supervisor_runtime",
    missingContract: "supervisor_integration_phase",
    mutationRisk: "runtime integration",
    requiredEvidence: ["supervisor integration authority", "read-only boundary proof", "rollback path"],
    rollbackOrRecoveryNote: "Keep supervisor state observational and park integration changes until authorized."
  }
] as const;

function buildAuthorityOperationRows(summary: ManagerControlPlane.ManagerExecutionLaneSummary): readonly PipelineManagerAuthorityOperationRow[] {
  return authorityOperationCatalog.map((operation) => {
    const authorityClass = operationAuthorityClass(summary, operation.key, operation.missingContract);
    const available = authorityClass === "allowed_unattended";
    const missingContract = available ? null : operation.missingContract;
    return {
      ...operation,
      authorityClass,
      available,
      missingContract,
      runContractStage: summary.authorityStage,
      statusText: available ? "available from active summary authority" : unavailableStatusText(authorityClass),
      reason: operationAuthorityReason(summary, operation.operation, authorityClass, missingContract),
      requiredEvidence: operation.requiredEvidence
    };
  });
}

function buildDeliveryControlRows(summary: ManagerControlPlane.ManagerExecutionLaneSummary): readonly PipelineManagerDeliveryControlRow[] {
  return buildAuthorityOperationRows(summary)
    .filter((operation) => operation.family === "delivery_stewardship" || operation.family === "cleanup_stewardship")
    .map((operation) => ({
      key: operation.key,
      label: operation.operation,
      available: operation.available,
      authorityClass: operation.authorityClass,
      reason: operation.reason,
      missingContract: operation.missingContract,
      requiredEvidence: operation.requiredEvidence,
      rollbackOrRecoveryNote: operation.rollbackOrRecoveryNote
    }));
}

function buildFeedbackRouteRows(summary: ManagerControlPlane.ManagerExecutionLaneSummary): readonly PipelineManagerFeedbackRouteRow[] {
  const policyMalformed = hasUnsafeFeedbackPolicy(summary);
  return (summary.feedbackRoutes ?? []).map((route, index) => {
    const routeMalformed = policyMalformed || hasUnsafeFeedbackRoute(route) || !isFeedbackClassification(route.classification) || hasUnsafeFeedbackGate(route.affectedDeliveryGate);
    const classification = routeMalformed ? "malformed_feedback" : route.classification;
    const affectedLane = String(route.affectedLane || (classification === "blocking" || classification === "malformed_feedback" ? "all_affected_delivery" : "affected-lane"));
    return {
      key: `${String(route.feedbackId || "feedback")}:${String(route.route || "route")}:${index}`,
      feedbackId: String(route.feedbackId || `feedback-${index + 1}`),
      classification,
      summary: routeMalformed ? "Malformed feedback route held for review" : String(route.summary || `${classification} feedback`),
      targetSurface: String(route.targetSurface || "unspecified-surface"),
      affectedLane,
      sourceRefs: Array.isArray(route.sourceRefs) ? route.sourceRefs.map((ref) => String(ref)) : [],
      route: routeMalformed ? "hold_for_feedback_contract_review" : String(route.route || "record_future_work"),
      targetWorkerId: route.targetWorkerId ? String(route.targetWorkerId) : null,
      affectedDeliveryGate: routeMalformed ? failClosedFeedbackDeliveryGate(route.affectedDeliveryGate, affectedLane) : sanitizeFeedbackDeliveryGate(route.affectedDeliveryGate ?? null),
      authorityImpact: routeMalformed ? "feedback route is malformed; affected delivery is held until the manager summary is repaired" : String(route.authorityImpact || feedbackAuthorityImpact(route)),
      dependencyImpact: routeMalformed ? "pause affected downstream lanes; continue unrelated safe lanes" : String(route.dependencyImpact || feedbackDependencyImpact(route)),
      nextAction: routeMalformed ? "Review feedback contract evidence before delivery or cleanup proceeds." : String(route.nextAction || "Record feedback route from manager summary."),
      recordPolicy: "metadata_only_feedback_record",
      unrelatedLanePolicy: "continue_unrelated_safe_lanes",
      retention: "metadata_only",
      rawPayloadRetained: false
    };
  });
}

function sanitizeFeedbackDeliveryGates(
  gates: readonly ManagerControlPlane.ManagerExecutionLaneFeedbackDeliveryGate[] | undefined
): readonly ManagerControlPlane.ManagerExecutionLaneFeedbackDeliveryGate[] {
  return (gates ?? []).map((gate) => sanitizeFeedbackDeliveryGate(gate)).filter((gate): gate is ManagerControlPlane.ManagerExecutionLaneFeedbackDeliveryGate => Boolean(gate));
}

function sanitizeFeedbackDeliveryGate(
  gate: ManagerControlPlane.ManagerExecutionLaneFeedbackDeliveryGate | null | undefined
): ManagerControlPlane.ManagerExecutionLaneFeedbackDeliveryGate | null {
  if (!gate) return null;
  if (hasUnsafeFeedbackGate(gate)) {
    return failClosedFeedbackDeliveryGate(gate, String(gate.affectedLane || "all_affected_delivery"));
  }
  return {
    action: String(gate.action || "feedback_delivery_gate"),
    affectedLane: String(gate.affectedLane || "all_affected_delivery"),
    scope: gate.scope === "targeted_lane" ? "targeted_lane" : "all_affected_delivery",
    mergePolicy: gate.mergePolicy === "hold_until_correction_resolved" ? "hold_until_correction_resolved" : "prevent_affected_pr_merge",
    downstreamPolicy: String(gate.downstreamPolicy || "pause_downstream_lanes"),
    recoveryPath: String(gate.recoveryPath || "resolve feedback route before delivery resumes")
  };
}

function failClosedFeedbackDeliveryGate(
  gate: ManagerControlPlane.ManagerExecutionLaneFeedbackDeliveryGate | null | undefined,
  affectedLane: string
): ManagerControlPlane.ManagerExecutionLaneFeedbackDeliveryGate {
  return {
    action: "hold_malformed_feedback_for_review",
    affectedLane: String(gate?.affectedLane || affectedLane || "all_affected_delivery"),
    scope: "all_affected_delivery",
    mergePolicy: "prevent_affected_pr_merge",
    downstreamPolicy: "pause_downstream_lanes",
    recoveryPath: "repair feedback route contract before affected delivery resumes"
  };
}

function hasUnsafeFeedbackPolicy(summary: ManagerControlPlane.ManagerExecutionLaneSummary) {
  const rawSummary = summary as unknown as {
    feedbackRecordPolicy?: unknown;
    feedbackUnrelatedLanePolicy?: unknown;
    feedbackRetention?: unknown;
    feedbackRawPayloadRetained?: unknown;
  };
  return rawSummary.feedbackRecordPolicy !== undefined && rawSummary.feedbackRecordPolicy !== "metadata_only_feedback_record"
    || rawSummary.feedbackUnrelatedLanePolicy !== undefined && rawSummary.feedbackUnrelatedLanePolicy !== "continue_unrelated_safe_lanes"
    || rawSummary.feedbackRetention !== undefined && rawSummary.feedbackRetention !== "metadata_only"
    || rawSummary.feedbackRawPayloadRetained === true;
}

function hasUnsafeFeedbackRoute(route: ManagerControlPlane.ManagerExecutionLaneFeedbackRoute) {
  const rawRoute = route as unknown as {
    recordPolicy?: unknown;
    unrelatedLanePolicy?: unknown;
    retention?: unknown;
    rawPayloadRetained?: unknown;
    dependencyImpact?: unknown;
  };
  const dependencyImpact = typeof rawRoute.dependencyImpact === "string" ? rawRoute.dependencyImpact.toLowerCase() : "";
  return rawRoute.recordPolicy !== undefined && rawRoute.recordPolicy !== "metadata_only_feedback_record"
    || rawRoute.unrelatedLanePolicy !== undefined && rawRoute.unrelatedLanePolicy !== "continue_unrelated_safe_lanes"
    || rawRoute.retention !== undefined && rawRoute.retention !== "metadata_only"
    || rawRoute.rawPayloadRetained === true
    || /\b(stop|pause|block|halt)\s+unrelated\b|\bunrelated\s+(?:safe\s+)?(?:lanes?\s+)?(?:stop|pause|block|halt|held|paused|blocked)\b/.test(dependencyImpact);
}

function hasUnsafeFeedbackGate(gate: ManagerControlPlane.ManagerExecutionLaneFeedbackDeliveryGate | null | undefined) {
  if (!gate) return false;
  return !["targeted_lane", "all_affected_delivery"].includes(String(gate.scope || "all_affected_delivery"))
    || !["prevent_affected_pr_merge", "hold_until_correction_resolved"].includes(String(gate.mergePolicy || "prevent_affected_pr_merge"));
}

function isFeedbackClassification(value: unknown): value is ManagerControlPlane.ManagerExecutionLaneFeedbackClassification {
  return value === "blocking" || value === "correction" || value === "polish" || value === "future_work";
}

function safeFeedbackClassification(value: unknown): ManagerControlPlane.ManagerExecutionLaneFeedbackClassification {
  return isFeedbackClassification(value) ? value : "future_work";
}

function feedbackAuthorityImpact(route: ManagerControlPlane.ManagerExecutionLaneFeedbackRoute) {
  if (route.classification === "blocking") return "delivery merge is blocked for affected work until feedback is resolved";
  if (route.classification === "correction") return "affected delivery is held until correction feedback is routed";
  return "no authority expansion; feedback is recorded metadata-only";
}

function feedbackDependencyImpact(route: ManagerControlPlane.ManagerExecutionLaneFeedbackRoute) {
  if (route.classification === "blocking") return "pause affected downstream lanes; continue unrelated safe lanes";
  if (route.classification === "correction") return "route correction while unrelated safe lanes continue";
  return "no dependency stop line for unrelated lanes";
}

function operationAuthorityClass(
  summary: ManagerControlPlane.ManagerExecutionLaneSummary,
  operationKey: string,
  missingContract: string | null
): ManagerControlPlane.ManagerAuthorityDecisionClass {
  if (summary.authorityClass === "forbidden") return "forbidden";
  if (summary.authorityClass === "block_and_record") return "block_and_record";
  if (summary.authorityClass === "requires_preauthorization") return "requires_preauthorization";
  if (operationKey === "runtime-state") {
    return hasRuntimeStateAuthority(summary) ? "allowed_unattended" : "requires_preauthorization";
  }
  if (operationKey === "workspace-files") {
    return summary.authorityStage === "backend_proof" || summary.authorityStage === "bootstrap_refill" || summary.authorityStage === "governor_recovery"
      ? "allowed_unattended"
      : "requires_preauthorization";
  }
  if ((operationKey === "live-workers" || operationKey === "tmux-session-control") && hasLiveWorkerAuthority(summary)) {
    return "allowed_unattended";
  }
  if ((operationKey === "git-mutation" || operationKey === "pr-creation" || operationKey === "pr-update" || operationKey === "pr-merge" || operationKey === "cleanup") && hasDeliveryPhaseAuthority(summary)) {
    return "allowed_unattended";
  }
  if (operationKey === "provider-access" || operationKey === "supervisor-runtime") return "forbidden";
  return missingContract ? "requires_preauthorization" : summary.authorityClass;
}

function hasDeliveryPhaseAuthority(summary: ManagerControlPlane.ManagerExecutionLaneSummary) {
  return summary.authorityStage === "delivery"
    && summary.authorityClass === "allowed_unattended";
}

function hasRuntimeStateAuthority(summary: ManagerControlPlane.ManagerExecutionLaneSummary) {
  return summary.authorityClass === "allowed_unattended"
    && (
      summary.authorityStage === "backend_proof"
      || summary.authorityStage === "bootstrap_refill"
      || summary.authorityStage === "governor_recovery"
    );
}

function hasLiveWorkerAuthority(summary: ManagerControlPlane.ManagerExecutionLaneSummary) {
  return summary.authorityStage === "live_worker"
    && summary.authorityClass === "allowed_unattended";
}

function unavailableStatusText(authorityClass: ManagerControlPlane.ManagerAuthorityDecisionClass) {
  if (authorityClass === "requires_preauthorization") return "unavailable - preauthorization required";
  if (authorityClass === "block_and_record") return "blocked and recorded";
  if (authorityClass === "forbidden") return "forbidden by active authority";
  return "available from active summary authority";
}

function operationAuthorityReason(
  summary: ManagerControlPlane.ManagerExecutionLaneSummary,
  operation: string,
  authorityClass: ManagerControlPlane.ManagerAuthorityDecisionClass,
  missingContract: string | null
) {
  if (authorityClass === "allowed_unattended") {
    return `${operation} is allowed by ${summary.authorityStage} with ${summary.authorityClass}.`;
  }
  const rawReason = summary.authorityBlockedReason ?? summary.authorityStopReason;
  if (rawReason && missingContract) {
    return `${rawReason}; missing contract: ${missingContract}.`;
  }
  if (rawReason) {
    return rawReason;
  }
  if (missingContract) {
    return `${operation} is unavailable because ${missingContract} is not present in the active run contract.`;
  }
  return authorityReason(summary, `${operation} follows the active authority classification.`);
}

function refillPanelReason(summary: ManagerControlPlane.ManagerExecutionLaneSummary): string {
  if (summary.safeWorkAvailableCount > 0) {
    return `${summary.safeWorkAvailableCount} claimable safe item(s) available.`;
  }
  const metadataOnlyQueuedCount = summary.metadataOnlyQueuedCount ?? 0;
  if (metadataOnlyQueuedCount > 0 && summary.unsafeOrGatedWorkCount > 0) {
    return `${metadataOnlyQueuedCount} metadata-only queued candidate(s) reported; ${summary.unsafeOrGatedWorkCount} unsafe or gated item(s) held.`;
  }
  if (metadataOnlyQueuedCount > 0) {
    return `${metadataOnlyQueuedCount} metadata-only queued candidate(s) reported; no claimable WorkItems are retained.`;
  }
  if (summary.unsafeOrGatedWorkCount > 0) {
    return `${summary.unsafeOrGatedWorkCount} unsafe or gated item(s) held.`;
  }
  return "No safe work is available from the summary.";
}

function refillPanelState(summary: ManagerControlPlane.ManagerExecutionLaneSummary): string {
  if (summary.stateCounts.refilling > 0) return "refilling";
  if ((summary.stateCounts.blockedCandidates ?? 0) > 0 || summary.blockers.includes("dispatcher_has_blocked_candidates")) {
    return "blocked";
  }
  if ((summary.stateCounts.needsReviewCandidates ?? 0) > 0 || summary.blockers.includes("dispatcher_has_needs_review_candidates")) {
    return "needs_review";
  }
  if (summary.unsafeOrGatedWorkCount > 0) return "blocked";
  if (summary.currentPhase === "no_safe_work") return "no_safe_work";
  return "idle";
}

function authorityReason(summary: ManagerControlPlane.ManagerExecutionLaneSummary, fallback: string) {
  return summary.authorityBlockedReason ?? summary.authorityStopReason ?? summary.attentionReason ?? fallback;
}

function liveWorkerAuthorityClass(summary: ManagerControlPlane.ManagerExecutionLaneSummary): ManagerControlPlane.ManagerAuthorityDecisionClass {
  if (hasLiveWorkerAuthority(summary)) return "allowed_unattended";
  if (summary.authorityClass === "forbidden" || summary.authorityClass === "block_and_record") return summary.authorityClass;
  return "requires_preauthorization";
}

function liveWorkerAuthorityReason(summary: ManagerControlPlane.ManagerExecutionLaneSummary) {
  if (hasLiveWorkerAuthority(summary)) return "Live-worker authority is present in the active summary.";
  return "Live workers, tmux/session control, and worker launch remain unavailable without live_worker authority.";
}

function laneStatusText(summary: ManagerControlPlane.ManagerExecutionLaneSummary) {
  if (summary.currentPhase === "no_safe_work") return "No safe work";
  if (summary.currentPhase === "manager_only") return "Manager-only";
  if (summary.currentPhase === "unverified") return "Unverified";
  if (summary.operatorAttentionRequired) return summary.attentionReason ?? summary.currentPhase;
  return summary.currentPhase;
}

function activeRowState(summary: ManagerControlPlane.ManagerExecutionLaneSummary) {
  if (summary.stateCounts.running > 0 && summary.stateCounts.leased > 0) return "active_mixed";
  if (summary.stateCounts.running > 0) return "running";
  return "leased";
}

function currentLimitations(summary: ManagerControlPlane.ManagerExecutionLaneSummary) {
  return [
    ...summary.blockers.map((blocker) => `blocker:${blocker}`),
    ...summary.warnings.map((warning) => `warning:${warning}`),
    summary.unknownReason ? `unknown:${summary.unknownReason}` : null,
    summary.authorityStopReason ? `authority_stop:${summary.authorityStopReason}` : null,
    summary.authorityBlockedReason ? `authority_blocked:${summary.authorityBlockedReason}` : null
  ].filter((value): value is string => Boolean(value));
}

function explicitDisplayStates(summary: ManagerControlPlane.ManagerExecutionLaneSummary) {
  const states = new Set<string>(summary.rawStateLabels);
  states.add(summary.currentPhase);
  states.add(summary.freshness);
  states.add(summary.evidenceFreshness);
  states.add(summary.authorityClass);
  if (summary.stateCounts.refilling > 0) states.add("refilling");
  if (summary.stateCounts.blocked > 0 || summary.blockers.length > 0) states.add("blocked");
  if (summary.currentPhase === "manager_only") states.add("manager_only");
  if (summary.currentPhase === "no_safe_work") states.add("empty");
  if (summary.currentPhase === "closed" || summary.rawStateLabels.includes("source_exhausted")) states.add("source_exhausted");
  if (summary.rawStateLabels.includes("resource:critical")) states.add("resource_critical");
  if ((summary.feedbackRoutes ?? []).some((route) => route.classification === "blocking")) states.add("feedback_blocking");
  if ((summary.feedbackRoutes ?? []).some((route) => route.classification === "correction")) states.add("feedback_correction");
  if ((summary.feedbackRoutes ?? []).some((route) => route.classification === "polish")) states.add("feedback_polish");
  if ((summary.feedbackRoutes ?? []).some((route) => route.classification === "future_work")) states.add("feedback_future_work");
  if ((summary.feedbackRoutes ?? []).some((route) => hasUnsafeFeedbackRoute(route) || !isFeedbackClassification(route.classification) || hasUnsafeFeedbackGate(route.affectedDeliveryGate)) || hasUnsafeFeedbackPolicy(summary)) {
    states.add("feedback_malformed");
    states.add("feedback_blocking");
  }
  if (summary.recoveryStatus === "needed" || summary.recoveryStatus === "in_progress" || summary.recoveryStatus === "blocked") states.add("split_brain_recovery");
  if (!hasDeliveryPhaseAuthority(summary)) states.add("delivery_unavailable");
  return Array.from(states);
}

function resourceUsageState(summary: ManagerControlPlane.ManagerExecutionLaneSummary) {
  if (summary.rawStateLabels.includes("resource:critical")) return "resource_critical";
  if (summary.rawStateLabels.includes("usage:manager_only") || summary.currentPhase === "manager_only") return "manager_only";
  if (summary.rawStateLabels.includes("usage:drain")) return "usage_drain";
  if (summary.rawStateLabels.includes("usage:conserve")) return "usage_conserve";
  return "summary_only";
}

function resourceUsageReason(summary: ManagerControlPlane.ManagerExecutionLaneSummary) {
  if (summary.rawStateLabels.includes("resource:critical")) return summary.attentionReason ?? "CPU/RAM pressure is critical.";
  if (summary.currentPhase === "manager_only") return summary.attentionReason ?? "Worker dispatch is paused; manager-only activity may continue.";
  return "Detailed resource and usage values are unavailable in this summary; showing backend state labels only.";
}

const baseCounts: ManagerControlPlane.ManagerExecutionLaneStateCounts = {
  totalWorkItems: 0,
  totalLeases: 0,
  totalAttempts: 0,
  eligible: 0,
  queued: 0,
  leased: 0,
  running: 0,
  refilling: 0,
  completed: 0,
  failed: 0,
  expired: 0,
  quarantined: 0,
  blocked: 0,
  closed: 0,
  metadataOnlyQueuedCandidates: 0,
  blockedCandidates: 0,
  needsReviewCandidates: 0,
  duplicateCandidates: 0,
  noSafeWork: 0
};

type ManagerSummaryFixtureOverrides = Omit<
  Partial<ManagerControlPlane.ManagerExecutionLaneSummary>,
  "activeWorkItemIds" | "evidenceRefs" | "queuedWorkItemIds" | "runId"
> & {
  activeWorkItemIds?: readonly string[];
  evidenceRefs?: readonly string[];
  queuedWorkItemIds?: readonly string[];
  runId?: string;
};

function managerSummaryFixture(
  overrides: ManagerSummaryFixtureOverrides
): ManagerControlPlane.ManagerExecutionLaneSummary {
  return {
    runId: "run-manager-fixture",
    proofMode: "backend_proof",
    stateSource: "fixture",
    lastObservedAt: "2026-06-30T20:00:00.000Z",
    lastMeaningfulProgressAt: "2026-06-30T19:58:00.000Z",
    freshness: "fresh",
    unknownReason: null,
    authorityBlockedReason: null,
    authorityStopReason: null,
    currentPhase: "running",
    nextAction: "continue_monitoring",
    operatorAttentionRequired: false,
    attentionReason: null,
    recoveryStatus: "not_needed",
    recoveryAttemptCount: 0,
    lastRecoveryAt: null,
    safeWorkAvailableCount: 3,
    metadataOnlyQueuedCount: 0,
    unsafeOrGatedWorkCount: 1,
    evidenceFreshness: "fresh",
    eventWatermark: "evt-manager-fixture",
    sourceCursor: "prd-manager-control-plane#fr-6e",
    authorityStage: "pipeline_adapter",
    authorityClass: "allowed_unattended",
    queuedWorkItemIds: ["wi-manager-queue-1", "wi-manager-queue-2"],
    activeWorkItemIds: ["wi-manager-active-1"],
    evidenceRefs: ["evidence:checkpoint:pipeline-ready"],
    evidenceLinks: [
      {
        evidenceRefId: "evidence:checkpoint:pipeline-ready",
        sourceRequirementIds: ["FR-6E", "FR-21", "FR-22"],
        workItemId: "wi-manager-active-1",
        leaseId: "lease-manager-active-1",
        attemptId: "attempt-manager-active-1",
        eventWatermark: "evt-manager-fixture",
        verificationCommandId: "cmd:pnpm run test:manager-control-plane",
        proofHarnessId: "manager-control-plane-fixture",
        result: "passed",
        retentionClass: "metadata_only",
        rawPayloadRetained: false
      }
    ],
    stateCounts: { ...baseCounts, totalWorkItems: 3, totalLeases: 1, totalAttempts: 1, queued: 2, leased: 1, running: 1 },
    rawStateLabels: ["fixture-backed", "usage:normal", "resource:normal"],
    blockers: [],
    warnings: [],
    feedbackRoutes: [],
    affectedDeliveryGates: [],
    feedbackRecordPolicy: "metadata_only_feedback_record",
    feedbackUnrelatedLanePolicy: "continue_unrelated_safe_lanes",
    feedbackRetention: "metadata_only",
    feedbackRawPayloadRetained: false,
    ...overrides
  } as ManagerControlPlane.ManagerExecutionLaneSummary;
}

export const managerExecutionLaneSummaryFixtures = [
  managerSummaryFixture({}),
  managerSummaryFixture({
    runId: "run-manager-empty",
    currentPhase: "no_safe_work",
    nextAction: "await_safe_backlog",
    safeWorkAvailableCount: 0,
    unsafeOrGatedWorkCount: 0,
    queuedWorkItemIds: [],
    activeWorkItemIds: [],
    stateCounts: { ...baseCounts, noSafeWork: 1 },
    rawStateLabels: ["empty", "fixture-backed"]
  }),
  managerSummaryFixture({
    runId: "run-manager-refilling",
    currentPhase: "refilling",
    nextAction: "retry_refill",
    stateCounts: { ...baseCounts, refilling: 1, blockedCandidates: 1 },
    rawStateLabels: ["refilling", "fixture-backed"]
  }),
  managerSummaryFixture({
    runId: "run-manager-only",
    currentPhase: "manager_only",
    nextAction: "wait_for_usage_reset",
    operatorAttentionRequired: true,
    attentionReason: "Usage is at manager-only threshold.",
    activeWorkItemIds: [],
    stateCounts: { ...baseCounts, queued: 2 },
    rawStateLabels: ["usage:manager_only", "paused", "fixture-backed"]
  }),
  managerSummaryFixture({
    runId: "run-manager-blocked",
    currentPhase: "blocked",
    nextAction: "surface_blocker",
    operatorAttentionRequired: true,
    attentionReason: "Authority decision required.",
    authorityClass: "requires_preauthorization",
    authorityBlockedReason: "delivery_phase missing",
    blockers: ["delivery_phase missing"],
    stateCounts: { ...baseCounts, blocked: 1, blockedCandidates: 1 },
    rawStateLabels: ["blocked", "delivery_unavailable", "fixture-backed"]
  }),
  managerSummaryFixture({
    runId: "run-manager-block-and-record",
    currentPhase: "blocked",
    nextAction: "record_blocker_packet",
    operatorAttentionRequired: true,
    attentionReason: "Operation must block and record before continuing.",
    authorityClass: "block_and_record",
    authorityBlockedReason: "cleanup target is outside scoped manager-owned state",
    blockers: ["cleanup target outside scoped manager-owned state"],
    stateCounts: { ...baseCounts, blocked: 1, blockedCandidates: 1 },
    rawStateLabels: ["block_and_record", "cleanup_unavailable", "fixture-backed"]
  }),
  managerSummaryFixture({
    runId: "run-manager-forbidden",
    currentPhase: "blocked",
    nextAction: "surface_blocker",
    operatorAttentionRequired: true,
    attentionReason: "Extreme-risk boundary reached.",
    authorityClass: "forbidden",
    authorityStopReason: "provider/account/payment change is forbidden",
    blockers: ["provider/account/payment change is forbidden"],
    stateCounts: { ...baseCounts, blocked: 1, blockedCandidates: 1 },
    rawStateLabels: ["forbidden", "provider_forbidden", "fixture-backed"]
  }),
  managerSummaryFixture({
    runId: "run-manager-delivery-unavailable",
    currentPhase: "running",
    nextAction: "wait_for_delivery_phase_authority",
    operatorAttentionRequired: true,
    attentionReason: "Delivery phase authority is unavailable.",
    authorityClass: "requires_preauthorization",
    authorityStopReason: "delivery_phase unavailable",
    stateCounts: { ...baseCounts, queued: 1, leased: 1, running: 1 },
    rawStateLabels: ["delivery_unavailable", "fixture-backed"]
  }),
  managerSummaryFixture({
    runId: "run-manager-source-exhausted",
    currentPhase: "closed",
    nextAction: "choose_next_product_decision",
    safeWorkAvailableCount: 0,
    queuedWorkItemIds: [],
    activeWorkItemIds: [],
    stateCounts: { ...baseCounts, completed: 3, closed: 1 },
    rawStateLabels: ["source_exhausted", "housekeeping_complete", "fixture-backed"]
  }),
  managerSummaryFixture({
    runId: "run-manager-resource-critical",
    currentPhase: "running",
    nextAction: "pause_warm_workers",
    operatorAttentionRequired: true,
    attentionReason: "CPU/RAM critical.",
    stateCounts: { ...baseCounts, queued: 1, leased: 1, running: 1 },
    rawStateLabels: ["resource:critical", "usage:normal", "fixture-backed"]
  }),
  managerSummaryFixture({
    runId: "run-manager-feedback-blocking",
    currentPhase: "blocked",
    nextAction: "Pause affected delivery, prevent affected PR merge, and route the issue to the affected lane.",
    operatorAttentionRequired: true,
    attentionReason: "Blocking operator feedback pauses affected delivery.",
    blockers: ["feedback-blocking-delivery"],
    stateCounts: { ...baseCounts, queued: 2, leased: 1, running: 1, blocked: 1 },
    rawStateLabels: ["feedback_blocking", "delivery_blocked", "fixture-backed"],
    feedbackRoutes: [
      {
        feedbackId: "feedback-blocking-pipeline",
        classification: "blocking",
        summary: "blocking feedback for /pipeline",
        targetSurface: "/pipeline",
        affectedLane: "lane-pipeline",
        sourceRefs: ["checkpoint:daily-use"],
        route: "pause_delivery_and_route_to_affected_lane",
        targetWorkerId: null,
        affectedDeliveryGate: {
          action: "pause_affected_delivery_and_prevent_merge",
          affectedLane: "lane-pipeline",
          scope: "targeted_lane",
          mergePolicy: "prevent_affected_pr_merge",
          downstreamPolicy: "pause_downstream_lanes",
          recoveryPath: "route blocking feedback to affected lane before delivery resumes"
        },
        authorityImpact: "delivery merge is blocked for affected work until feedback is resolved",
        dependencyImpact: "pause affected downstream lanes; continue unrelated safe lanes",
        nextAction: "Pause affected delivery, prevent affected PR merge, and route the issue to the affected lane.",
        recordPolicy: "metadata_only_feedback_record",
        unrelatedLanePolicy: "continue_unrelated_safe_lanes",
        retention: "metadata_only",
        rawPayloadRetained: false
      }
    ],
    affectedDeliveryGates: [
      {
        action: "pause_affected_delivery_and_prevent_merge",
        affectedLane: "lane-pipeline",
        scope: "targeted_lane",
        mergePolicy: "prevent_affected_pr_merge",
        downstreamPolicy: "pause_downstream_lanes",
        recoveryPath: "route blocking feedback to affected lane before delivery resumes"
      }
    ]
  }),
  managerSummaryFixture({
    runId: "run-manager-feedback-correction",
    currentPhase: "running",
    nextAction: "Route correction to the active worker while unrelated lanes continue.",
    rawStateLabels: ["feedback_correction", "fixture-backed"],
    feedbackRoutes: [
      {
        feedbackId: "feedback-correction-worker",
        classification: "correction",
        summary: "correction feedback for /pipeline",
        targetSurface: "/pipeline",
        affectedLane: "lane-pipeline",
        sourceRefs: ["checkpoint:daily-use"],
        route: "route_to_active_worker",
        targetWorkerId: "codex-3",
        affectedDeliveryGate: {
          action: "hold_affected_delivery_until_correction_resolved",
          affectedLane: "lane-pipeline",
          scope: "targeted_lane",
          mergePolicy: "hold_until_correction_resolved",
          downstreamPolicy: "continue_unrelated_safe_lanes",
          recoveryPath: "route correction feedback before affected delivery is marked merge-ready"
        },
        authorityImpact: "affected delivery is held until correction feedback is routed",
        dependencyImpact: "route correction while unrelated safe lanes continue",
        nextAction: "Route correction to the active worker while unrelated lanes continue.",
        recordPolicy: "metadata_only_feedback_record",
        unrelatedLanePolicy: "continue_unrelated_safe_lanes",
        retention: "metadata_only",
        rawPayloadRetained: false
      }
    ]
  }),
  managerSummaryFixture({
    runId: "run-manager-feedback-polish",
    currentPhase: "running",
    nextAction: "Batch polish feedback without stopping unrelated safe lanes.",
    rawStateLabels: ["feedback_polish", "fixture-backed"],
    feedbackRoutes: [
      {
        feedbackId: "feedback-polish-copy",
        classification: "polish",
        summary: "polish feedback for /pipeline",
        targetSurface: "/pipeline",
        affectedLane: "affected-lane",
        sourceRefs: ["checkpoint:daily-use"],
        route: "batch_polish_feedback",
        targetWorkerId: null,
        affectedDeliveryGate: null,
        authorityImpact: "no authority expansion; feedback is recorded metadata-only",
        dependencyImpact: "no dependency stop line for unrelated lanes",
        nextAction: "Batch polish feedback without stopping unrelated safe lanes.",
        recordPolicy: "metadata_only_feedback_record",
        unrelatedLanePolicy: "continue_unrelated_safe_lanes",
        retention: "metadata_only",
        rawPayloadRetained: false
      }
    ]
  }),
  managerSummaryFixture({
    runId: "run-manager-feedback-future",
    currentPhase: "running",
    nextAction: "Record future work without stopping the current run.",
    rawStateLabels: ["feedback_future_work", "fixture-backed"],
    feedbackRoutes: [
      {
        feedbackId: "feedback-future-export",
        classification: "future_work",
        summary: "future_work feedback for export",
        targetSurface: "export",
        affectedLane: "affected-lane",
        sourceRefs: [],
        route: "record_future_work",
        targetWorkerId: null,
        affectedDeliveryGate: null,
        authorityImpact: "no authority expansion; feedback is recorded metadata-only",
        dependencyImpact: "no dependency stop line for unrelated lanes",
        nextAction: "Record future work without stopping the current run.",
        recordPolicy: "metadata_only_feedback_record",
        unrelatedLanePolicy: "continue_unrelated_safe_lanes",
        retention: "metadata_only",
        rawPayloadRetained: false
      }
    ]
  }),
  managerSummaryFixture({
    runId: "run-manager-recovery",
    currentPhase: "blocked",
    nextAction: "reconcile_split_brain",
    recoveryStatus: "in_progress",
    recoveryAttemptCount: 2,
    lastRecoveryAt: "2026-06-30T20:01:00.000Z",
    operatorAttentionRequired: true,
    attentionReason: "Split-brain recovery in progress.",
    blockers: ["workspace owner mismatch"],
    stateCounts: { ...baseCounts, blocked: 1 },
    rawStateLabels: ["split_brain_recovery", "fixture-backed"]
  })
] as const;

export const selectedManagerExecutionLaneSummary = projectManagerExecutionLaneSummary(managerExecutionLaneSummaryFixtures[0]);
