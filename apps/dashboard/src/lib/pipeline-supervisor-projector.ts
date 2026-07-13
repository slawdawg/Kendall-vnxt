import type { PipelineStage, WorkPacketV0View } from "@kendall/contracts";

export type PipelineSourceTrustState =
  | "included"
  | "excluded"
  | "stale"
  | "contradictory"
  | "unavailable"
  | "derived-only";

type PipelineRouteFork = {
  selectedRoute: string;
  rejectedRoutes: string[];
  tags: string[];
  sourceContext: string;
  lowConfidenceActions: string[];
};

type PipelineActionGuard = {
  actionSurface: "human_gate" | "recovery";
  actionId: string;
  expectedActionId: string;
  actualActionId: string;
  expectedPacketId: string;
  actualPacketId: string;
  expectedState: string;
  actualState: string;
  classification: string;
  primaryRisk: string;
  stopLine: string;
  safeNextOption: string;
};

type PipelineRecoveryFixtureEvent = {
  eventId: string;
  actionId: string;
};

export type PipelineDashboardPacket = WorkPacketV0View & {
  fixtureId?: string;
  fixtureKind?: string;
  sourceKind?: "supervisor-runtime" | "demo-fixture" | "projection";
  sourceId?: string;
  fixtureLabel: string;
  summary: string;
  nextAction: string;
  confidenceLabel: string;
  freshnessLabel: string;
  sourceTrustState: PipelineSourceTrustState;
  sourceTrustStates: PipelineSourceTrustState[];
  sourceTrustSummary: string;
  routeFork: PipelineRouteFork;
  lastEvent: string;
  riskFlags: string[];
  matrixRowIds: string[];
  humanGateFixtureEvents: unknown[];
  recoveryFixtureEvents: PipelineRecoveryFixtureEvent[];
  actionGuardFixtures: PipelineActionGuard[];
  localModelHealth: { statusLabel: string; authoritySummary: string } | null;
  hermesJob: { statusLabel: string; boundarySummary: string } | null;
  codexWorker: { readiness: string; boundarySummary: string } | null;
  claudeReview: { statusLabel: string; boundarySummary: string } | null;
};

export type PipelineRuntimePacket = Omit<PipelineDashboardPacket, "fixtureId" | "fixtureKind"> & {
  sourceKind: "supervisor-runtime";
  sourceId: string;
};

export type PipelineSupervisorProjectionResult =
  | { kind: "runtime"; packets: PipelineRuntimePacket[] }
  | { kind: "empty"; packets: [] }
  | { kind: "invalid"; packets: []; error: string };

export function projectSupervisorWorkPacketsToCockpitPackets(
  packets: readonly WorkPacketV0View[] | unknown,
): PipelineSupervisorProjectionResult {
  if (!Array.isArray(packets)) {
    return { kind: "invalid", packets: [], error: "Supervisor returned a malformed WorkPacketV0 collection." };
  }
  if (packets.length === 0) {
    return { kind: "empty", packets: [] };
  }
  const invalidIndex = packets.findIndex((packet) => !isWorkPacketV0View(packet));
  if (invalidIndex >= 0) {
    return {
      kind: "invalid",
      packets: [],
      error: "Supervisor returned malformed WorkPacketV0 row at index " + invalidIndex + ".",
    };
  }
  const fixtureShapedIndex = packets.findIndex((packet) => hasFixtureOnlyRuntimeShape(packet));
  if (fixtureShapedIndex >= 0) {
    return {
      kind: "invalid",
      packets: [],
      error: "Supervisor returned fixture-shaped WorkPacketV0 row at index " + fixtureShapedIndex + ".",
    };
  }
  try {
    return {
      kind: "runtime",
      packets: packets.map((packet) => projectSupervisorWorkPacketToCockpitPacket(packet as WorkPacketV0View)),
    };
  } catch {
    return { kind: "invalid", packets: [], error: "Supervisor WorkPacketV0 projection failed validation." };
  }
}
function isWorkPacketV0View(value: unknown): value is WorkPacketV0View {
  if (!value || typeof value !== "object") {
    return false;
  }
  const packet = value as Partial<WorkPacketV0View>;
  return typeof packet.packetId === "string" &&
    packet.packetId.trim().length > 0 &&
    typeof packet.title === "string" &&
    typeof packet.requestedOutcome === "string" &&
    typeof packet.currentStage === "string" &&
    typeof packet.currentOwner === "string" &&
    typeof packet.status === "string" &&
    typeof packet.riskLevel === "string" &&
    typeof packet.priority === "string" &&
    Array.isArray(packet.sourceRefs) &&
    Array.isArray(packet.evidenceRefs) &&
    Array.isArray(packet.artifactRefs) &&
    Array.isArray(packet.humanGateActions) &&
    Array.isArray(packet.humanGateActionRequests) &&
    Array.isArray(packet.laneCards) &&
    Array.isArray(packet.memoryProposals) &&
    Array.isArray(packet.reviewSummaries) &&
    Array.isArray(packet.recoveryActions) &&
    Array.isArray(packet.executionAttempts) &&
    Array.isArray(packet.transitionEvents) &&
    Array.isArray(packet.loopStopStates) &&
    packet.lifecycleState !== null &&
    typeof packet.lifecycleState === "object";
}

function hasFixtureOnlyRuntimeShape(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const packet = value as Record<string, unknown>;
  if (
    "fixtureId" in packet ||
    "fixtureKind" in packet ||
    "fixtureLabel" in packet ||
    packet.sourceKind === "demo-fixture"
  ) {
    return true;
  }
  return hasFixtureOnlyRefs(packet.sourceRefs) ||
    hasFixtureOnlyRefs(packet.evidenceRefs) ||
    hasFixtureOnlyRefs(packet.artifactRefs);
}

function hasFixtureOnlyRefs(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.some((ref) => {
    if (!ref || typeof ref !== "object") {
      return false;
    }
    return Object.values(ref).some((entry) => typeof entry === "string" && /\bfixture:/.test(entry));
  });
}

function projectSupervisorWorkPacketToCockpitPacket(packet: WorkPacketV0View): PipelineRuntimePacket {
  if (!isWorkPacketV0View(packet)) {
    throw new TypeError("Malformed supervisor WorkPacketV0 row.");
  }
  const sourceTrustStates = sourceTrustStatesFor(packet);
  const freshnessLabel = freshnessLabelFor(packet);
  const confidenceScore = packet.routeSummary?.confidenceScore ?? 0.5;
  const reasonCodes = supervisorReasonCodes(packet);
  return {
    ...packet,
    sourceKind: "supervisor-runtime",
    sourceId: packet.packetId,
    fixtureLabel: "Supervisor runtime",
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
      tags: ["supervisor runtime", packet.currentStage, packet.currentOwner, packet.status],
      sourceContext: sourceTrustSummaryFor(packet),
      lowConfidenceActions: confidenceScore < 0.5 ? ["Clarify", "Downgrade to reference", "Send back to Research"] : [],
    },
    lastEvent: `Supervisor WorkPacket projection rendered from ${reasonCodes[0]}.`,
    riskFlags: riskFlagsFor(packet.riskLevel, freshnessLabel),
    matrixRowIds: reasonCodes,
    humanGateFixtureEvents: [],
    recoveryFixtureEvents: [],
    actionGuardFixtures: [],
    localModelHealth: null,
    hermesJob: null,
    codexWorker: null,
    claudeReview: null,
    loopStopStates: packet.loopStopStates ?? [],
  };
}

function supervisorReasonCodes(packet: WorkPacketV0View): string[] {
  const reasonCodes = packet.routeSummary?.reasonCodes
    ?.filter((code): code is string => typeof code === "string" && code.trim().length > 0)
    .map((code) => code.trim());
  return reasonCodes?.length ? reasonCodes : [`supervisor.${packet.currentStage}`];
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

function rejectedRoutesFor(stage: PipelineStage) {
  const pipelineStages: PipelineStage[] = ["capture", "classify", "route", "shape", "human_gate", "execute", "review", "promote", "deliver", "learn"];
  return pipelineStages.filter((candidate) => candidate !== stage).slice(0, 3);
}

function riskFlagsFor(riskLevel: WorkPacketV0View["riskLevel"], freshnessLabel: string) {
  const flags = [`${riskLevel} risk`];
  if (freshnessLabel !== "fresh") {
    flags.push(freshnessLabel);
  }
  return flags;
}
