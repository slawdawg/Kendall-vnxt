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

const pipelineStages = new Set(["capture", "classify", "route", "shape", "human_gate", "execute", "review", "promote", "deliver", "learn"]);
const lifecycleSources = new Set(["candidate_work", "work_item", "execution_attempt", "workflow_event", "memory_proposal", "delivery_evidence", "source_missing"]);
const workPacketOwners = new Set(["kendall", "operator", "local_model", "hermes_worker_mock", "codex_worker", "claude_reviewer", "github", "memory_review", "blocked"]);
const workPacketStatuses = new Set(["active", "waiting", "blocked", "failed", "complete", "deferred"]);
const riskLevels = new Set(["low", "medium", "high"]);
const priorities = new Set(["low", "normal", "high", "urgent"]);
const sourceRefTypes = new Set(["candidate_work", "work_item", "bmad_artifact", "obsidian", "llm_wiki", "github", "research", "manual"]);
const sourceFreshnessValues = new Set(["fresh", "stale", "unknown", "not_applicable"]);
const sourceAccessStates = new Set(["allowed", "excluded", "missing", "blocked"]);
const evidenceRefTypes = new Set(["route", "event", "attempt", "local_model", "review", "gate", "memory", "fixture"]);
const evidenceRetentionClasses = new Set(["metadata_only", "summary", "fixture"]);
const artifactRefTypes = new Set(["plan", "progress", "report", "pull_request", "check", "memory_proposal", "fixture"]);
const artifactRefStatuses = new Set(["available", "missing", "blocked", "deferred"]);

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
  const duplicatePacketId = firstDuplicatePacketId(packets);
  if (duplicatePacketId) {
    return {
      kind: "invalid",
      packets: [],
      error: "Supervisor returned duplicate WorkPacketV0 identity " + duplicatePacketId + ".",
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
    isEnumValue(packet.currentStage, pipelineStages) &&
    isEnumValue(packet.currentOwner, workPacketOwners) &&
    isEnumValue(packet.status, workPacketStatuses) &&
    isEnumValue(packet.riskLevel, riskLevels) &&
    isEnumValue(packet.priority, priorities) &&
    Array.isArray(packet.sourceRefs) &&
    packet.sourceRefs.every(isSourceRefV0) &&
    Array.isArray(packet.evidenceRefs) &&
    packet.evidenceRefs.every(isEvidenceRefV0) &&
    Array.isArray(packet.artifactRefs) &&
    packet.artifactRefs.every(isArtifactRefV0) &&
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
    typeof packet.lifecycleState === "object" &&
    isEnumValue((packet.lifecycleState as Record<string, unknown>).source, lifecycleSources) &&
    isEnumValue((packet.lifecycleState as Record<string, unknown>).stage, pipelineStages) &&
    isEnumValue((packet.lifecycleState as Record<string, unknown>).owner, workPacketOwners) &&
    isEnumValue((packet.lifecycleState as Record<string, unknown>).status, workPacketStatuses) &&
    reachableNestedWorkPacketFieldsAreSafe(packet);
}

function hasFixtureOnlyRuntimeShape(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const packet = value as Record<string, unknown>;
  if (
    isSyntheticRuntimeIdentity(packet.packetId) ||
    "fixtureId" in packet ||
    "fixtureKind" in packet ||
    "fixtureLabel" in packet ||
    packet.sourceKind === "demo-fixture"
  ) {
    return true;
  }
  return hasFixtureOnlyRefs(packet) ||
    hasFixtureMarkersInReachableNestedFields(packet);
}

function hasFixtureOnlyRefs(value: unknown, visited = new Set<object>()): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => hasFixtureOnlyRefs(item, visited));
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  if (visited.has(value)) {
    return false;
  }
  visited.add(value);
  const record = value as Record<string, unknown>;
  if (isSyntheticRuntimeIdentity(record.refId) ||
    isSyntheticRuntimeIdentity(record.sourceRef) ||
    isSyntheticRuntimeIdentity(record.pathOrUrl) ||
    isSyntheticRuntimeIdentity(record.artifactPath) ||
    record.evidenceType === "fixture" ||
    record.retentionClass === "fixture" ||
    record.artifactType === "fixture") {
    return true;
  }
  return Object.values(record).some((child) => hasFixtureOnlyRefs(child, visited));
}

function isSyntheticRuntimeIdentity(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith("fixture:") || normalized.startsWith("demo:");
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === "string" || typeof value === "undefined";
}

function isSourceRefV0(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const ref = value as Record<string, unknown>;
  if (
    typeof ref.refId !== "string" ||
    !isEnumValue(ref.sourceType, sourceRefTypes) ||
    typeof ref.label !== "string" ||
    !isEnumValue(ref.freshness, sourceFreshnessValues) ||
    !isEnumValue(ref.accessState, sourceAccessStates) ||
    typeof ref.canonical !== "boolean" ||
    typeof ref.summaryOnly !== "boolean" ||
    !isNullableString(ref.pathOrUrl) ||
    !isNullableString(ref.blockedReason)
  ) {
    return false;
  }
  if (isSyntheticRuntimeIdentity(ref.refId) || isSyntheticRuntimeIdentity(ref.pathOrUrl)) {
    return false;
  }
  if (ref.accessState === "allowed") {
    return ref.blockedReason === null || typeof ref.blockedReason === "undefined";
  }
  return ref.summaryOnly === true &&
    ref.canonical === false &&
    (ref.pathOrUrl === null || typeof ref.pathOrUrl === "undefined") &&
    typeof ref.blockedReason === "string" &&
    ref.blockedReason.trim().length > 0;
}

function isEvidenceRefV0(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const ref = value as Record<string, unknown>;
  return typeof ref.refId === "string" &&
    !isSyntheticRuntimeIdentity(ref.refId) &&
    !isSyntheticRuntimeIdentity(ref.artifactPath) &&
    isEnumValue(ref.evidenceType, evidenceRefTypes) &&
    typeof ref.label === "string" &&
    isNullableString(ref.artifactPath) &&
    isEnumValue(ref.retentionClass, evidenceRetentionClasses) &&
    ref.rawPayloadRetained === false;
}

function isArtifactRefV0(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const ref = value as Record<string, unknown>;
  return typeof ref.refId === "string" &&
    !isSyntheticRuntimeIdentity(ref.refId) &&
    !isSyntheticRuntimeIdentity(ref.pathOrUrl) &&
    isEnumValue(ref.artifactType, artifactRefTypes) &&
    typeof ref.label === "string" &&
    isNullableString(ref.pathOrUrl) &&
    isEnumValue(ref.status, artifactRefStatuses);
}

function reachableNestedWorkPacketFieldsAreSafe(packet: Partial<WorkPacketV0View>): boolean {
  const lifecycleState = packet.lifecycleState as Record<string, unknown>;
  if (
    lifecycleState.stage !== packet.currentStage ||
    lifecycleState.owner !== packet.currentOwner ||
    lifecycleState.status !== packet.status ||
    lifecycleState.metadataOnly !== true ||
    lifecycleState.sourceMutationAllowed !== false ||
    lifecycleState.providerCallsAllowed !== false ||
    lifecycleState.workerLaunchAllowed !== false ||
    lifecycleState.githubMutationAllowed !== false ||
    lifecycleState.cleanupAllowed !== false
  ) {
    return false;
  }
  return !hasFixtureMarkersInReachableNestedFields(packet);
}

function hasFixtureMarkersInReachableNestedFields(packet: Partial<WorkPacketV0View> | Record<string, unknown>): boolean {
  const values = [
    ...nestedRefValues(packet.lifecycleState, ["authoritativeRef", "derivedFromRefs", "transitionEventRefs", "latestTransitionEventRef", "attemptRef"]),
    ...nestedRefValues(packet.candidateWork, ["candidateWorkPacketId", "sourceRefs", "acceptanceCriteriaRefs"]),
    ...nestedRefValues(packet.workItem, ["workItemId", "sourceRefs", "evidenceRefs"]),
    ...nestedRefValues(packet.taskPacket, ["packetId", "sourceRefs", "evidenceRefs"]),
    ...nestedRefValues(packet.routingPreview, ["sourceRefs", "evidenceRefs"]),
    ...nestedRefValues(packet.deliveryEvidence, ["evidenceRefs", "artifactRefs", "retainedEvidence"]),
    ...nestedRefValues(packet.learnOutcome, ["evidenceRefs", "sourceRefs"]),
    ...nestedRefValues(packet.learnRefill, ["evidenceRefs", "sourceRefs", "memoryProposalRefs"]),
    ...nestedRefValues(packet.alphaMemorySourceStatus, ["sourceRefs", "evidenceRefs"]),
    ...nestedRefValues(packet.gateStateValidation, ["refId"]),
    ...nestedArrayRefValues(packet.executionAttempts, ["attemptId", "workItemId", "leaseId", "routeDecisionId", "evidenceRefs", "artifactRefs"]),
    ...nestedArrayRefValues(packet.transitionEvents, ["eventId", "evidenceRefs", "sourceEventId"]),
    ...nestedArrayRefValues(packet.humanGateActions, ["actionId", "expectedActionId", "actualActionId", "evidenceRefs"]),
    ...nestedArrayRefValues(packet.humanGateActionRequests, ["requestId", "actionId", "targetId", "evidenceRefs"]),
    ...nestedArrayRefValues(packet.laneCards, ["laneId", "evidenceRefs", "artifactRefs"]),
    ...nestedArrayRefValues(packet.memoryProposals, ["proposalId", "packetId", "sourceRefs", "evidenceRefs", "memoryProposalRefs"]),
    ...nestedArrayRefValues(packet.loopStopStates, ["stopStateId", "evidenceRefs"]),
    ...nestedArrayRefValues(packet.reviewSummaries, ["evidenceRefs", "artifactRefs"]),
    ...nestedArrayRefValues(packet.recoveryActions, ["actionId", "evidenceRefs"]),
  ];
  return values.some(isSyntheticRuntimeIdentity);
}

function nestedArrayRefValues(value: unknown, keys: readonly string[]): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => nestedRefValues(item, keys));
}

function nestedRefValues(value: unknown, keys: readonly string[]): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }
  const record = value as Record<string, unknown>;
  return keys.flatMap((key) => refStrings(record[key]));
}

function refStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(refStrings);
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(refStrings);
  }
  return [];
}

function isEnumValue(value: unknown, allowedValues: ReadonlySet<string>): value is string {
  return typeof value === "string" && allowedValues.has(value);
}

function firstDuplicatePacketId(packets: readonly WorkPacketV0View[]): string | null {
  const seen = new Set<string>();
  for (const packet of packets) {
    if (seen.has(packet.packetId)) {
      return packet.packetId;
    }
    seen.add(packet.packetId);
  }
  return null;
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
