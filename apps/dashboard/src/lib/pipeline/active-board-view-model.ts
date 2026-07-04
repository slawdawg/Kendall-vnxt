import type {
  AuthoritativePacketStage,
  PipelineDashboardProjectionV0,
  PipelineDashboardWorkPacketV0,
  PipelineManagerSummaryV0,
  PipelineProjectionSourceLabelV0,
  PipelineQueueSummaryV0,
} from "@kendall/contracts";

export type PipelinePacketBoardPlacement = "active_board" | "attention" | "stale_history" | "diagnostics" | "hidden";
export type PipelinePacketActionability =
  | "actionable"
  | "operator_attention"
  | "ready_to_test"
  | "history"
  | "diagnostics_only"
  | "closed";

export type PipelineActiveBoardSummary = {
  projectionTruth: PipelineProjectionSourceLabelV0;
  executionLoopHealth: PipelineExecutionLoopHealthSummary;
  activePacketCount: number;
  attentionCount: number;
  readyToTestCount: number;
  staleHistoryCount: number;
  actionablePacketCount: number;
  historicalPacketCount: number;
  dispatchAffectingManagerState: PipelineDispatchAffectingManagerState | null;
};

export type PipelineExecutionLoopHealthSummary = {
  state:
    | "moving"
    | "action_needed"
    | "blocked"
    | "ready_to_test"
    | "empty"
    | "exhausted"
    | "stale"
    | "unavailable"
    | "unhealthy"
    | "unknown";
  label: string;
  counts: {
    moving: number;
    blocked: number;
    actionNeeded: number;
    readyToTest: number;
    empty: number;
    exhausted: number;
    stale: number;
    unavailable: number;
    unhealthy: number;
    total: number;
  };
  truthLabel: PipelineProjectionSourceLabelV0;
  metadataOnly: true;
};

export type PipelineActiveStageLane = {
  stage: AuthoritativePacketStage;
  label: string;
  packetCards: PipelineCompactPacketCard[];
  activePacketCount: number;
  emptyReason: PipelineDashboardProjectionV0["stageSummaries"][number]["emptyReason"] | null;
};

export type PipelineCompactPacketCard = {
  packetId: string;
  title: string;
  stage: AuthoritativePacketStage;
  statusLabel: string;
  truthLabel: PipelineProjectionSourceLabelV0 | null;
  attention: boolean;
  attentionKind: PipelineAttentionKind | null;
  attentionReasonLabel: string | null;
  readyToTest: boolean;
  nextActionLabel: string | null;
  nextOperatorActionLabel: string | null;
};

export type PipelineAttentionKind =
  | "approval_required"
  | "blocked"
  | "failed"
  | "stalled"
  | "gated"
  | "recovery_needed"
  | "operator_decision"
  | "missing_evidence"
  | "unknown";

export type PipelineStaleHistoryItem = {
  packetId: string;
  title: string;
  stage: AuthoritativePacketStage;
  lastKnownState: string;
  staleReason: string;
  ageLabel: string | null;
  inspectLabel: string;
};

export type PipelineDiagnosticsItem = {
  label: string;
  value: string;
  source: string;
  copyable: boolean;
  retentionClass: "metadata_only";
};

export type PipelineDispatchAffectingManagerState = {
  visible: true;
  reason:
    | "dispatch_paused"
    | "usage_limited"
    | "resource_limited"
    | "idle_with_ready_work"
    | "worker_failure"
    | "emergency_stop"
    | "drain"
    | "kill"
    | "backend_unavailable"
    | "source_exhausted";
  summary: string;
};

export type PipelineActiveBoardViewModel = {
  summary: PipelineActiveBoardSummary;
  activeBoard: {
    stageLanes: PipelineActiveStageLane[];
  };
  staleHistory: {
    count: number;
    summary: string;
    items: PipelineStaleHistoryItem[];
  };
  attentionItems: PipelineCompactPacketCard[];
  readyToTestItems: PipelineCompactPacketCard[];
  diagnostics: {
    enabled: false;
    items: PipelineDiagnosticsItem[];
  };
};

const stageLabels: Record<AuthoritativePacketStage, string> = {
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

const closedStatuses = new Set<PipelineDashboardWorkPacketV0["status"]>(["complete", "deferred"]);
const visibleActiveStatuses = new Set<PipelineDashboardWorkPacketV0["status"]>(["active", "waiting", "blocked", "failed"]);
const dispatchAffectingEmptyReasons = new Set([
  "usage_limited",
  "resource_limited",
  "backend_unavailable",
  "failure_budget_hit",
  "cleanup_gated",
]);

export function buildPipelineActiveBoardViewModel(projection: PipelineDashboardProjectionV0): PipelineActiveBoardViewModel {
  const dispatchState = isDispatchAffectingManagerState(projection.managerSummary, projection.queueSummary, projection);
  const cardsByStage = new Map<AuthoritativePacketStage, PipelineCompactPacketCard[]>();
  const staleHistoryItems: PipelineStaleHistoryItem[] = [];
  const attentionItems: PipelineCompactPacketCard[] = [];
  const readyToTestItems: PipelineCompactPacketCard[] = [];
  const diagnosticsItems: PipelineDiagnosticsItem[] = [];

  for (const packet of projection.workPackets) {
    const placement = derivePacketPlacement(packet, projection);
    const actionability = derivePacketActionability(packet, projection);
    const card = buildCompactPacketCard(packet, projection);

    diagnosticsItems.push(...buildPacketDiagnosticsItems(packet, placement, actionability));

    if (placement === "stale_history") {
      staleHistoryItems.push(buildStaleHistoryItem(packet, projection));
      continue;
    }
    if (placement === "diagnostics") {
      continue;
    }
    if (placement === "attention") {
      attentionItems.push(card);
      addStageCard(cardsByStage, card);
      continue;
    }
    if (placement === "active_board") {
      addStageCard(cardsByStage, card);
      if (actionability === "ready_to_test") {
        readyToTestItems.push(card);
      }
    }
  }

  if (dispatchState.visible) {
    diagnosticsItems.push({
      label: "Dispatch-affecting manager state",
      value: `${dispatchState.reason}: ${dispatchState.summary}`,
      source: "managerSummary",
      copyable: false,
      retentionClass: "metadata_only",
    });
  }

  const stageLanes = projection.stageSummaries.map((stageSummary) => {
    const packetCards = cardsByStage.get(stageSummary.stage) ?? [];
    return {
      stage: stageSummary.stage,
      label: stageSummary.label || stageLabels[stageSummary.stage],
      packetCards,
      activePacketCount: packetCards.length,
      emptyReason: stageSummary.emptyReason ?? null,
    };
  });

  const activePacketCount = stageLanes.reduce((sum, lane) => sum + lane.packetCards.length, 0);
  const attentionCount = attentionItems.length + (dispatchState.visible ? 1 : 0);
  const readyToTestCount = readyToTestItems.length;
  const executionLoopHealth = buildExecutionLoopHealthSummary(
    projection,
    activePacketCount,
    attentionCount,
    readyToTestCount,
    staleHistoryItems.length
  );
  return {
    summary: {
      projectionTruth: projection.sourceLabel,
      executionLoopHealth,
      activePacketCount,
      staleHistoryCount: staleHistoryItems.length,
      attentionCount,
      actionablePacketCount: activePacketCount,
      historicalPacketCount: staleHistoryItems.length,
      readyToTestCount,
      dispatchAffectingManagerState: dispatchState.visible ? dispatchState : null,
    },
    activeBoard: { stageLanes },
    staleHistory: {
      count: staleHistoryItems.length,
      summary: staleHistoryItems.length === 0
        ? "No stale history."
        : `${staleHistoryItems.length} stale packet${staleHistoryItems.length === 1 ? "" : "s"} in history.`,
      items: staleHistoryItems,
    },
    attentionItems,
    readyToTestItems,
    diagnostics: {
      enabled: false,
      items: diagnosticsItems,
    },
  };
}

function buildExecutionLoopHealthSummary(
  projection: PipelineDashboardProjectionV0,
  movingCount: number,
  visibleAttentionCount: number,
  readyToTestCount: number,
  staleHistoryCount: number
): PipelineExecutionLoopHealthSummary {
  const gatedControlCount = projection.gatedControls.length;
  const reliabilityProblemCount = projection.reliabilityProblems.length;
  const actionNeededCount = visibleAttentionCount + gatedControlCount + reliabilityProblemCount;
  const sourceStateCounts = countSourceStates(projection);
  const packetBlockedCount = projection.workPackets.filter((packet) => packet.status === "blocked" || packet.status === "failed").length;
  const queueBlockedCount = projection.queueSummary.blockedCount ?? 0;
  const queueGatedCount = projection.queueSummary.gatedCount ?? 0;
  const blockedCount = Math.max(queueBlockedCount, packetBlockedCount) + queueGatedCount;
  const backendMovingCount = Math.max(
    movingCount,
    projection.queueSummary.activeCount ?? 0,
    projection.workerSummary.activeCount ?? 0
  );
  const unavailableCount =
    (projection.backendReachability.state === "unavailable" || projection.truthSummary.backendUnavailable ? 1 : 0)
    + sourceStateCounts.unavailable
    + (projection.workerSummary.unavailableCount ?? 0);
  const staleCount =
    staleHistoryCount
    + (projection.freshnessState === "stale" || projection.truthSummary.stale ? 1 : 0)
    + sourceStateCounts.stale
    + (projection.queueSummary.staleCount ?? 0);
  const exhaustionProven =
    projection.queueSummary.sourceExhausted
    || projection.managerSummary.sourceExhausted
    || projection.truthSummary.emptyReason === "source_exhausted";
  const exhaustedCount =
    (exhaustionProven ? 1 : 0)
    + sourceStateCounts.exhausted
    + (projection.managerSummary.exhaustedSourceCount ?? 0);
  const emptyCount = projection.truthSummary.backendEmpty || projection.queueSummary.emptyReason === "healthy_empty" ? 1 : 0;
  const unhealthyCount =
    (projection.workerSummary.failedCount ?? 0)
    + (projection.workerSummary.stalledCount ?? 0)
    + (managerSummaryIsUnhealthy(projection.managerSummary) ? 1 : 0);
  const counts = {
    moving: backendMovingCount,
    blocked: blockedCount,
    actionNeeded: actionNeededCount,
    readyToTest: readyToTestCount,
    empty: emptyCount,
    exhausted: exhaustedCount,
    stale: staleCount,
    unavailable: unavailableCount,
    unhealthy: unhealthyCount,
    total: projection.workPackets.length,
  };
  if (unavailableCount > 0 || projection.backendReachability.state === "unavailable" || projection.truthSummary.backendUnavailable) {
    return compactHealth("unavailable", "Backend unavailable", counts, projection.sourceLabel);
  }
  if (projection.freshnessState === "stale" || projection.truthSummary.stale) {
    return compactHealth("stale", "Projection stale", counts, projection.sourceLabel);
  }
  if (projection.backendReachability.state !== "reachable" || projection.freshnessState !== "live") {
    return compactHealth("unknown", "Backend state unknown", counts, projection.sourceLabel);
  }
  if (projection.sourceLabel !== "live" || projection.fixtureMode.enabled || projection.truthSummary.fixtureBacked || projection.truthSummary.label !== "live") {
    return compactHealth("unknown", "Projection not live", counts, projection.sourceLabel);
  }
  if (exhaustionProven) {
    return compactHealth("exhausted", "Source exhausted", counts, projection.sourceLabel);
  }
  if (unhealthyCount > 0) {
    return compactHealth("unhealthy", "Execution loop unhealthy", counts, projection.sourceLabel);
  }
  if (actionNeededCount > 0) {
    return compactHealth("action_needed", "Action needed", counts, projection.sourceLabel);
  }
  if (blockedCount > 0) {
    return compactHealth("blocked", "Work blocked", counts, projection.sourceLabel);
  }
  if (readyToTestCount > 0) {
    return compactHealth("ready_to_test", "Ready to test", counts, projection.sourceLabel);
  }
  if (backendMovingCount > 0) {
    return compactHealth("moving", "Work moving", counts, projection.sourceLabel);
  }
  if (staleHistoryCount > 0 || sourceStateCounts.stale > 0 || (projection.queueSummary.staleCount ?? 0) > 0) {
    return compactHealth("stale", "Stale history", counts, projection.sourceLabel);
  }
  if (projection.truthSummary.backendEmpty || projection.queueSummary.emptyReason === "healthy_empty") {
    return compactHealth("empty", "No active work", counts, projection.sourceLabel);
  }
  return compactHealth("unknown", "Execution-loop state unknown", counts, projection.sourceLabel);
}

function countSourceStates(projection: PipelineDashboardProjectionV0) {
  return (projection.sourceStates ?? []).reduce((counts, sourceState) => {
    counts[sourceState.state] += 1;
    return counts;
  }, {
    healthy: 0,
    exhausted: 0,
    blocked: 0,
    gated: 0,
    stale: 0,
    unavailable: 0,
    refilling: 0,
    unknown: 0,
  });
}

function managerSummaryIsUnhealthy(managerSummary: PipelineManagerSummaryV0) {
  return managerSummary.reliabilityState === "degraded"
    || managerSummary.reliabilityState === "blocked"
    || managerSummary.inactivityReason === "failure_budget_hit";
}

function compactHealth(
  state: PipelineExecutionLoopHealthSummary["state"],
  label: string,
  counts: PipelineExecutionLoopHealthSummary["counts"],
  truthLabel: PipelineProjectionSourceLabelV0
): PipelineExecutionLoopHealthSummary {
  return {
    state,
    label,
    counts,
    truthLabel,
    metadataOnly: true,
  };
}

export function derivePacketPlacement(
  packet: PipelineDashboardWorkPacketV0,
  projection: PipelineDashboardProjectionV0
): PipelinePacketBoardPlacement {
  if (!projectionCanShowLiveActiveWork(projection)) {
    return projectionShouldBeTreatedAsStale(projection) || packet.truthLabel === "stale" ? "stale_history" : "diagnostics";
  }
  if (packet.truthLabel === "fixture" || packet.truthLabel === "simulated" || packet.truthLabel === "dry_run" || packet.truthLabel === "unknown" || packet.truthLabel === "unavailable") {
    return "diagnostics";
  }
  if (packet.truthLabel === "stale") {
    return "stale_history";
  }

  const actionability = derivePacketActionability(packet, projection);
  if (actionability === "operator_attention") {
    return "attention";
  }
  if (actionability === "ready_to_test" || actionability === "actionable") {
    return "active_board";
  }
  if (actionability === "diagnostics_only") {
    return "diagnostics";
  }
  return "hidden";
}

export function derivePacketActionability(
  packet: PipelineDashboardWorkPacketV0,
  projection: PipelineDashboardProjectionV0
): PipelinePacketActionability {
  if (!projectionCanShowLiveActiveWork(projection)) {
    return projectionShouldBeTreatedAsStale(projection) || packet.truthLabel === "stale" ? "history" : "diagnostics_only";
  }
  if (packet.truthLabel === "fixture" || packet.truthLabel === "simulated" || packet.truthLabel === "dry_run" || packet.truthLabel === "unknown" || packet.truthLabel === "unavailable") {
    return "diagnostics_only";
  }
  if (packet.truthLabel === "stale") {
    return "history";
  }
  if (projection.gatedControls.some((control) => control.packetId === packet.packetId)) {
    return "operator_attention";
  }
  if (packet.currentStage === "needs_approval") {
    return "operator_attention";
  }
  if (packet.status === "failed" && !hasQueuedRemediation(packet)) {
    return "operator_attention";
  }
  if (packet.status === "blocked") {
    return "operator_attention";
  }
  if (mentionsStalled(packet)) {
    return "operator_attention";
  }
  if (hasDeliveryOrLearnHandoff(packet)) {
    return "actionable";
  }
  if (operatorCanAct(packet)) {
    return "operator_attention";
  }
  if (isReadyToTestPacket(packet, projection)) {
    return "ready_to_test";
  }
  if (hasReadyToTestClaim(packet, projection)) {
    return "operator_attention";
  }
  if (closedStatuses.has(packet.status)) {
    return "closed";
  }
  if (visibleActiveStatuses.has(packet.status)) {
    return "actionable";
  }
  return "diagnostics_only";
}

export function buildCompactPacketCard(
  packet: PipelineDashboardWorkPacketV0,
  projection: PipelineDashboardProjectionV0
): PipelineCompactPacketCard {
  const actionability = derivePacketActionability(packet, projection);
  const truthLabel = packet.truthLabel === "live" ? null : packet.truthLabel;
  const attentionMetadata = actionability === "operator_attention"
    ? buildActionNeededMetadata(packet, projection)
    : { attentionKind: null, attentionReasonLabel: null, nextOperatorActionLabel: null };
  return {
    packetId: packet.packetId,
    title: packet.title,
    stage: packet.currentStage,
    statusLabel: statusLabel(packet, actionability),
    truthLabel,
    attention: actionability === "operator_attention",
    ...attentionMetadata,
    readyToTest: actionability === "ready_to_test",
    nextActionLabel: actionability === "operator_attention"
      ? attentionMetadata.nextOperatorActionLabel
      : actionability === "ready_to_test"
        ? "Ready to test"
      : safeCompactActionLabel(packet.nextAction),
    nextOperatorActionLabel: attentionMetadata.nextOperatorActionLabel,
  };
}

function buildActionNeededMetadata(
  packet: PipelineDashboardWorkPacketV0,
  projection: PipelineDashboardProjectionV0
): Pick<PipelineCompactPacketCard, "attentionKind" | "attentionReasonLabel" | "nextOperatorActionLabel"> {
  const gatedControl = projection.gatedControls.find((control) => control.packetId === packet.packetId);
  if (gatedControl) {
    return {
      attentionKind: "gated",
      attentionReasonLabel: "Gated operation",
      nextOperatorActionLabel: "Request explicit approval.",
    };
  }
  if (hasReadyToTestClaim(packet, projection) && !isReadyToTestPacket(packet, projection)) {
    return {
      attentionKind: "missing_evidence",
      attentionReasonLabel: "Evidence needed",
      nextOperatorActionLabel: "Ready-to-test claim needs live evidence.",
    };
  }
  if (packet.currentStage === "needs_approval") {
    return {
      attentionKind: "approval_required",
      attentionReasonLabel: "Approval required",
      nextOperatorActionLabel: safeOperatorActionLabel(packet) ?? "Approve or reject the packet.",
    };
  }
  if (packet.status === "failed") {
    return {
      attentionKind: "recovery_needed",
      attentionReasonLabel: "Recovery needed",
      nextOperatorActionLabel: safeOperatorActionLabel(packet) ?? "Inspect recovery details.",
    };
  }
  if (packet.status === "blocked") {
    return {
      attentionKind: "blocked",
      attentionReasonLabel: "Blocked",
      nextOperatorActionLabel: safeOperatorActionLabel(packet) ?? "Clear the named blocker.",
    };
  }
  if (mentionsStalled(packet)) {
    return {
      attentionKind: "stalled",
      attentionReasonLabel: "Stalled",
      nextOperatorActionLabel: safeOperatorActionLabel(packet) ?? "Inspect stalled work.",
    };
  }
  if (operatorCanAct(packet)) {
    return {
      attentionKind: "operator_decision",
      attentionReasonLabel: "Operator decision",
      nextOperatorActionLabel: safeOperatorActionLabel(packet) ?? "Decide the next move.",
    };
  }
  return {
    attentionKind: "unknown",
    attentionReasonLabel: "Attention needed",
    nextOperatorActionLabel: safeOperatorActionLabel(packet) ?? "Inspect packet detail.",
  };
}

function safeOperatorActionLabel(packet: PipelineDashboardWorkPacketV0) {
  const rawDisplayAction = packet.nextAction?.trim() || packet.blocker?.trim() || "";
  const rawSafetyText = [packet.nextAction, packet.blocker].filter(Boolean).join(" ");
  if (!rawDisplayAction) {
    return null;
  }
  if (containsStopLineOrRawControlText(rawSafetyText)) {
    return "Request explicit approval.";
  }
  if (containsDenseReliabilityText(rawSafetyText)) {
    return "Inspect packet detail.";
  }
  return shortActionLabel(rawDisplayAction);
}

function safeCompactActionLabel(nextAction: string | null) {
  if (!nextAction) {
    return null;
  }
  if (containsStopLineOrRawControlText(nextAction)) {
    return "Request explicit approval.";
  }
  if (containsDenseReliabilityText(nextAction)) {
    return "Inspect packet detail.";
  }
  return shortActionLabel(nextAction);
}

function containsStopLineOrRawControlText(value: string) {
  const text = normalizeDenseText(value);
  return text.includes("do not ")
    || text.includes("stop line")
    || text.includes("control:")
    || text.includes("worker:")
    || text.includes("kill worker")
    || text.includes("github mutation");
}

function containsDenseReliabilityText(value: string) {
  const text = normalizeDenseText(value);
  const collapsed = text.replace(/[^a-z0-9]+/g, "");
  return text.includes("five whys")
    || text.includes("5 whys")
    || text.includes("evidence ref")
    || text.includes("source ref")
    || text.includes("transition event ref")
    || text.includes("lifecycle")
    || text.includes("manager run")
    || text.includes("manager internals")
    || text.includes("worker codex")
    || text.includes("worker internals")
    || text.includes("rawpayload")
    || text.includes("unsafe payload")
    || text.includes("reasoning trace")
    || text.includes("terminal scrollback")
    || collapsed.includes("fivewhys")
    || collapsed.includes("evidenceref")
    || collapsed.includes("sourceref")
    || collapsed.includes("latesttransitioneventref")
    || collapsed.includes("recenttransitioneventref")
    || collapsed.includes("executionattempt")
    || collapsed.includes("managerrun")
    || collapsed.includes("workercodex")
    || collapsed.includes("rawpayload")
    || collapsed.includes("rawprompt")
    || collapsed.includes("rawcompletion")
    || collapsed.includes("rawtranscript")
    || collapsed.includes("unsafepayload")
    || collapsed.includes("reasoningtrace")
    || collapsed.includes("terminalscrollback");
}

function normalizeDenseText(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase();
}

function mentionsStalled(packet: PipelineDashboardWorkPacketV0) {
  const text = `${packet.blocker ?? ""} ${packet.nextAction ?? ""}`.toLowerCase();
  return text.includes("stalled") || text.includes("stale worker") || text.includes("not progressing");
}

export function buildStaleHistoryItem(
  packet: PipelineDashboardWorkPacketV0,
  projection: PipelineDashboardProjectionV0
): PipelineStaleHistoryItem {
  return {
    packetId: packet.packetId,
    title: packet.title,
    stage: packet.currentStage,
    lastKnownState: `${stageLabels[packet.currentStage]} / ${packet.status}`,
    staleReason: staleReason(packet, projection),
    ageLabel: ageLabel(packet.updatedAt, projection.generatedAt),
    inspectLabel: `Inspect ${packet.title}`,
  };
}

export function isDispatchAffectingManagerState(
  managerSummary: PipelineManagerSummaryV0,
  queueSummary: PipelineQueueSummaryV0,
  projection?: PipelineDashboardProjectionV0
): PipelineDispatchAffectingManagerState | { visible: false } {
  const summaryText = managerSummary.summary.toLowerCase();
  if (projection?.backendReachability.state === "unavailable" || managerSummary.inactivityReason === "backend_unavailable") {
    return { visible: true, reason: "backend_unavailable", summary: "Backend unavailable." };
  }
  if (summaryText.includes("emergency stop") || summaryText.includes("stop line") || summaryText.includes("stop-line")) {
    return { visible: true, reason: "emergency_stop", summary: "Emergency stop is active." };
  }
  if (summaryText.includes("kill state") || summaryText.includes("kill switch") || summaryText.includes("kill worker")) {
    return { visible: true, reason: "kill", summary: "Worker kill state affects dispatch." };
  }
  if (managerSummary.inactivityReason === "usage_limited") {
    return { visible: true, reason: "usage_limited", summary: "Dispatch paused because usage is limited." };
  }
  if (managerSummary.inactivityReason === "resource_limited") {
    return { visible: true, reason: "resource_limited", summary: "Dispatch paused because host resources are limited." };
  }
  if (managerSummary.inactivityReason === "failure_budget_hit") {
    return { visible: true, reason: "worker_failure", summary: "Worker failure budget reached." };
  }
  if (managerSummary.inactivityReason === "cleanup_gated") {
    return { visible: true, reason: "drain", summary: "Dispatch is gated by cleanup or drain state." };
  }
  if (managerSummary.inactivityReason && dispatchAffectingEmptyReasons.has(managerSummary.inactivityReason)) {
    return { visible: true, reason: "dispatch_paused", summary: "Dispatch paused." };
  }
  if (
    projection &&
    (
      projection.backendReachability.state !== "reachable" ||
      projection.fixtureMode.enabled ||
      projection.truthSummary.fixtureBacked ||
      projection.truthSummary.stale ||
      projection.truthSummary.backendUnavailable ||
      projection.sourceLabel !== "live" ||
      projection.freshnessState !== "live" ||
      projection.truthSummary.label !== "live"
    )
  ) {
    return { visible: false };
  }
  if (managerSummary.sourceExhausted || queueSummary.sourceExhausted || managerSummary.inactivityReason === "source_exhausted") {
    return { visible: true, reason: "source_exhausted", summary: "Source work exhausted." };
  }
  const readyWork = (managerSummary.dispatchableQueueCount ?? 0) > 0 || (queueSummary.dispatchableCount ?? 0) > 0;
  const activeWorkers = managerSummary.activeWorkerCount ?? managerSummary.activeLeaseCount;
  if (
    readyWork
    && activeWorkers === 0
    && managerSummary.freshnessState === "live"
    && managerSummary.stateSource !== "unknown"
    && managerSummary.stateSource !== "unavailable"
  ) {
    return { visible: true, reason: "idle_with_ready_work", summary: "Ready work exists but workers are idle." };
  }
  return { visible: false };
}

function addStageCard(cardsByStage: Map<AuthoritativePacketStage, PipelineCompactPacketCard[]>, card: PipelineCompactPacketCard) {
  const cards = cardsByStage.get(card.stage) ?? [];
  cards.push(card);
  cardsByStage.set(card.stage, cards);
}

function projectionCanShowLiveActiveWork(projection: PipelineDashboardProjectionV0) {
  return projection.backendReachability.state === "reachable"
    && projection.sourceLabel === "live"
    && projection.freshnessState === "live"
    && projection.truthSummary.label === "live"
    && projection.truthSummary.fixtureBacked === false
    && projection.truthSummary.stale === false
    && projection.truthSummary.backendUnavailable === false
    && projection.fixtureMode.enabled === false
    && !projectionAgeExceedsStaleAfter(projection);
}

function projectionShouldBeTreatedAsStale(projection: PipelineDashboardProjectionV0) {
  return projection.freshnessState === "stale" || projectionAgeExceedsStaleAfter(projection);
}

function projectionAgeExceedsStaleAfter(projection: PipelineDashboardProjectionV0) {
  const generatedTime = Date.parse(projection.generatedAt);
  const sourceTime = Date.parse(projection.sourceUpdatedAt);
  if (!Number.isFinite(generatedTime) || !Number.isFinite(sourceTime) || !Number.isFinite(projection.staleAfterSeconds)) {
    return true;
  }
  return generatedTime - sourceTime > projection.staleAfterSeconds * 1000;
}

function projectionHasOpenLivePacket(projection: PipelineDashboardProjectionV0) {
  return projection.workPackets.some((packet) => {
    return packet.truthLabel === "live" && visibleActiveStatuses.has(packet.status);
  });
}

function operatorCanAct(packet: PipelineDashboardWorkPacketV0) {
  if (packet.currentStage === "needs_approval") {
    return true;
  }
  if (hasQueuedRemediation(packet)) {
    return false;
  }
  const text = `${packet.blocker ?? ""} ${packet.nextAction ?? ""}`.toLowerCase();
  if (!text.trim()) {
    return false;
  }
  return text.includes("operator")
    || text.includes("approval")
    || text.includes("approve")
    || text.includes("reject")
    || text.includes("decision")
    || text.includes("needs user")
    || text.includes("user action")
    || text.includes("manual recovery")
    || text.includes("user can")
    || text.includes("you can");
}

function isReadyToTestPacket(packet: PipelineDashboardWorkPacketV0, projection: PipelineDashboardProjectionV0) {
  if (!projectionCanShowLiveActiveWork(projection) || packet.truthLabel !== "live") {
    return false;
  }
  if (packet.status !== "complete") {
    return false;
  }
  const detail = projection.selectedPacketDetails.find((item) => item.packetId === packet.packetId);
  if (detail && detail.truthLabel !== "live") {
    return false;
  }
  const readyToTest = detail?.readyToTest ?? packet.readyToTest;
  if (readyToTest) {
    return readyToTest.evidenceRefs.length > 0;
  }
  const evidenceRefs = detail ? detail.evidenceRefs : packet.evidenceRefs;
  return hasReadyToTestLanguage(packet, projection) && evidenceRefs.length > 0;
}

function hasReadyToTestLanguage(packet: PipelineDashboardWorkPacketV0, projection: PipelineDashboardProjectionV0) {
  if (!projectionCanShowLiveActiveWork(projection) || packet.truthLabel !== "live") {
    return false;
  }
  const detail = projection.selectedPacketDetails.find((item) => item.packetId === packet.packetId);
  if (detail && detail.truthLabel !== "live") {
    return false;
  }
  const text = (detail ? detail.nextAction ?? "" : packet.nextAction ?? "").toLowerCase();
  return textHasReadyToTestClaim(text);
}

function hasReadyToTestClaim(packet: PipelineDashboardWorkPacketV0, projection: PipelineDashboardProjectionV0) {
  const detail = projection.selectedPacketDetails.find((item) => item.packetId === packet.packetId);
  if (detail?.readyToTest ?? packet.readyToTest) {
    return true;
  }
  const text = `${packet.nextAction ?? ""} ${detail?.nextAction ?? ""}`.toLowerCase();
  return textHasReadyToTestClaim(text);
}

function textHasReadyToTestClaim(text: string) {
  return text.includes("ready to test")
    || text.includes("test in ")
    || text.includes("operator can test")
    || text.includes("operator should test")
    || text.includes("validate in ")
    || text.includes("ready for testing")
    || text.includes("ready for qa")
    || text.includes("acceptance check");
}

function hasDeliveryOrLearnHandoff(packet: PipelineDashboardWorkPacketV0) {
  if (!closedStatuses.has(packet.status)) {
    return false;
  }
  if (packet.currentStage !== "deliver" && packet.currentStage !== "learn") {
    return false;
  }
  const text = `${packet.blocker ?? ""} ${packet.nextAction ?? ""}`.toLowerCase();
  return text.includes("handoff")
    || text.includes("waiting for the operator")
    || text.includes("operator review")
    || text.includes("operator can")
    || text.includes("needs operator")
    || text.includes("ready for operator");
}

function requiresCleanupOrReconciliation(packet: PipelineDashboardWorkPacketV0) {
  const text = `${packet.blocker ?? ""} ${packet.nextAction ?? ""}`.toLowerCase();
  return text.includes("cleanup") || text.includes("reconciliation") || text.includes("reconcile");
}

function hasQueuedRemediation(packet: PipelineDashboardWorkPacketV0) {
  const text = `${packet.blocker ?? ""} ${packet.nextAction ?? ""}`.toLowerCase();
  return text.includes("remediation queued")
    || text.includes("repair queued")
    || text.includes("auto-repair queued")
    || text.includes("worker remediation queued");
}

function statusLabel(packet: PipelineDashboardWorkPacketV0, actionability: PipelinePacketActionability) {
  if (actionability === "ready_to_test") {
    return "Ready to test";
  }
  if (actionability === "operator_attention") {
    return "Needs attention";
  }
  if (actionability === "history") {
    return "Stale history";
  }
  return packet.status.replace(/_/g, " ");
}

function shortActionLabel(nextAction: string | null) {
  if (!nextAction) {
    return null;
  }
  const normalized = nextAction.replace(/\s+/g, " ").trim();
  if (normalized.length <= 96) {
    return normalized;
  }
  return `${normalized.slice(0, 93).trimEnd()}...`;
}

function staleReason(packet: PipelineDashboardWorkPacketV0, projection: PipelineDashboardProjectionV0) {
  if (packet.truthLabel === "stale") {
    return safeCompactActionLabel(packet.blocker) || "Packet projection is stale.";
  }
  if (projection.freshnessState === "stale") {
    return safeCompactActionLabel(projection.truthSummary.summary) || "Projection is stale.";
  }
  return "Historical packet.";
}

function ageLabel(updatedAt: string, generatedAt: string) {
  const updatedTime = Date.parse(updatedAt);
  const generatedTime = Date.parse(generatedAt);
  if (!Number.isFinite(updatedTime) || !Number.isFinite(generatedTime) || generatedTime < updatedTime) {
    return null;
  }
  const seconds = Math.round((generatedTime - updatedTime) / 1000);
  if (seconds < 60) {
    return `${seconds}s old`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m old`;
  }
  return `${Math.round(minutes / 60)}h old`;
}

function buildPacketDiagnosticsItems(
  packet: PipelineDashboardWorkPacketV0,
  placement: PipelinePacketBoardPlacement,
  actionability: PipelinePacketActionability
): PipelineDiagnosticsItem[] {
  return [
    {
      label: "Packet placement",
      value: `${packet.packetId}: ${placement}/${actionability}`,
      source: "active-board-view-model",
      copyable: true,
      retentionClass: "metadata_only",
    },
    {
      label: "Packet metadata",
      value: `${packet.packetId}: metadataOnly=${String(packet.metadataOnly)} evidenceRefs=${packet.evidenceRefs.length > 0 ? packet.evidenceRefs.join(", ") : "none"}`,
      source: "PipelineDashboardProjectionV0.workPackets",
      copyable: true,
      retentionClass: "metadata_only",
    },
  ];
}
