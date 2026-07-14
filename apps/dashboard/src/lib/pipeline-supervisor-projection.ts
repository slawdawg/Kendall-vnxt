import {
  AUTHORITATIVE_PACKET_STAGES,
  isPipelineCanonicalContractV1,
  isPipelineProductModeMappingV0,
} from "@kendall/contracts";
import type { PipelineDashboardProjectionV0 } from "@kendall/contracts";

export function normalizePipelineDashboardProjection(projection: Partial<PipelineDashboardProjectionV0>): Partial<PipelineDashboardProjectionV0> {
  if (!projection || typeof projection !== "object") {
    return projection;
  }
  const sourceStatesCurrent = "sourceStates" in projection;
  const queueSummaryCurrent = !projection.queueSummary || (
    "activeCount" in projection.queueSummary &&
    "gatedCount" in projection.queueSummary &&
    "staleCount" in projection.queueSummary &&
    "refillingCount" in projection.queueSummary &&
    "unknownCount" in projection.queueSummary
  );
  const managerSummaryCurrent = !projection.managerSummary || (
    "reliabilityState" in projection.managerSummary &&
    "evidenceRefs" in projection.managerSummary &&
    "healthySourceCount" in projection.managerSummary &&
    "unknownSourceCount" in projection.managerSummary
  );
  const requiredWorkerSummaryFields = [
    "stateSource",
    "freshnessState",
    "warmCount",
    "activeCount",
    "waitingCount",
    "stalledCount",
    "failedCount",
    "drainingCount",
    "killedCount",
    "completeCount",
    "unavailableCount",
    "unknownCount",
    "workerRefs",
    "evidenceRefs",
    "summary",
    "metadataOnly",
  ];
  const workerSummaryCurrent = Boolean(
    projection.workerSummary &&
    requiredWorkerSummaryFields.every((field) => field in projection.workerSummary!),
  );
  const reliabilityProblemsCurrent = "reliabilityProblems" in projection;
  const gatedControlsCurrent = "gatedControls" in projection;
  if (
    sourceStatesCurrent &&
    queueSummaryCurrent &&
    managerSummaryCurrent &&
    workerSummaryCurrent &&
    reliabilityProblemsCurrent &&
    gatedControlsCurrent
  ) {
    return projection;
  }
  const queueSummary = projection.queueSummary && !queueSummaryCurrent
    ? {
        ...projection.queueSummary,
        activeCount: projection.queueSummary.activeCount ?? null,
        gatedCount: projection.queueSummary.gatedCount ?? null,
        staleCount: projection.queueSummary.staleCount ?? null,
        refillingCount: projection.queueSummary.refillingCount ?? null,
        unknownCount: projection.queueSummary.unknownCount ?? null,
      }
    : projection.queueSummary;
  const managerSummary = projection.managerSummary && !managerSummaryCurrent
    ? {
        ...projection.managerSummary,
        reliabilityState: managerReliabilityStates.has(projection.managerSummary.reliabilityState as string)
          ? projection.managerSummary.reliabilityState
          : projection.managerSummary.inactivityReason === "source_exhausted" || projection.managerSummary.sourceExhausted
            ? "source_exhausted"
            : projection.managerSummary.inactivityReason === "backend_unavailable"
              ? "unavailable"
              : "unknown",
        healthySourceCount: projection.managerSummary.healthySourceCount ?? null,
        exhaustedSourceCount: projection.managerSummary.exhaustedSourceCount ?? null,
        blockedSourceCount: projection.managerSummary.blockedSourceCount ?? null,
        gatedSourceCount: projection.managerSummary.gatedSourceCount ?? null,
        staleSourceCount: projection.managerSummary.staleSourceCount ?? null,
        unavailableSourceCount: projection.managerSummary.unavailableSourceCount ?? null,
        refillingSourceCount: projection.managerSummary.refillingSourceCount ?? null,
        unknownSourceCount: projection.managerSummary.unknownSourceCount ?? null,
        evidenceRefs: Array.isArray(projection.managerSummary.evidenceRefs) ? projection.managerSummary.evidenceRefs : [],
      }
    : projection.managerSummary;
  const workerSummary = projection.workerSummary && !workerSummaryCurrent
    ? {
        ...projection.workerSummary,
        stateSource: projection.workerSummary.stateSource ?? "unknown",
        freshnessState: projection.workerSummary.freshnessState ?? "unknown",
        warmCount: projection.workerSummary.warmCount ?? null,
        activeCount: projection.workerSummary.activeCount ?? null,
        waitingCount: projection.workerSummary.waitingCount ?? null,
        stalledCount: projection.workerSummary.stalledCount ?? null,
        failedCount: projection.workerSummary.failedCount ?? null,
        drainingCount: projection.workerSummary.drainingCount ?? null,
        killedCount: projection.workerSummary.killedCount ?? null,
        completeCount: projection.workerSummary.completeCount ?? null,
        unavailableCount: projection.workerSummary.unavailableCount ?? null,
        unknownCount: projection.workerSummary.unknownCount ?? null,
        workerRefs: Array.isArray(projection.workerSummary.workerRefs) ? projection.workerSummary.workerRefs : [],
        evidenceRefs: Array.isArray(projection.workerSummary.evidenceRefs) ? projection.workerSummary.evidenceRefs : [],
        summary: typeof projection.workerSummary.summary === "string"
          ? projection.workerSummary.summary
          : "Worker runtime state is not connected to the supervisor projection.",
        metadataOnly: projection.workerSummary.metadataOnly === undefined ? true : projection.workerSummary.metadataOnly,
      }
    : projection.workerSummary ?? {
        stateSource: projection.backendReachability?.state === "unavailable" ? "unavailable" : "unknown",
        freshnessState: projection.backendReachability?.state === "unavailable" ? "unavailable" : "unknown",
        warmCount: null,
        activeCount: null,
        waitingCount: null,
        stalledCount: null,
        failedCount: null,
        drainingCount: null,
        killedCount: null,
        completeCount: null,
        unavailableCount: null,
        unknownCount: null,
        workerRefs: [],
        evidenceRefs: [],
        summary: projection.backendReachability?.state === "unavailable"
          ? "Worker runtime state is unavailable because backend projection failed."
          : "Worker runtime state is not connected to the supervisor projection.",
        metadataOnly: true,
      };
  return {
    ...projection,
    managerSummary,
    workerSummary,
    queueSummary,
    sourceStates: sourceStatesCurrent ? projection.sourceStates : [],
    reliabilityProblems: reliabilityProblemsCurrent ? projection.reliabilityProblems : [],
    gatedControls: gatedControlsCurrent ? projection.gatedControls : [],
  };
}

export function isPipelineDashboardProjection(value: unknown): value is PipelineDashboardProjectionV0 {
  if (!value || typeof value !== "object") {
    return false;
  }
  const projection = value as Partial<PipelineDashboardProjectionV0>;
  return (
    projection.schemaVersion === "pipeline-dashboard-projection/v0" &&
    typeof projection.projectionId === "string" &&
    isTimestampString(projection.generatedAt) &&
    typeof projection.sourceLabel === "string" &&
    typeof projection.freshnessState === "string" &&
    isTimestampString(projection.sourceUpdatedAt) &&
    typeof projection.staleAfterSeconds === "number" &&
    Number.isFinite(projection.staleAfterSeconds) &&
    projection.staleAfterSeconds > 0 &&
    isProjectionSourceLabel(projection.sourceLabel) &&
    isProjectionFreshnessState(projection.freshnessState) &&
    isBackendReachability(projection.backendReachability) &&
    isFixtureMode(projection.fixtureMode) &&
    isTruthSummary(projection.truthSummary) &&
    isManagerSummary(projection.managerSummary) &&
    isWorkerSummary(projection.workerSummary) &&
    Array.isArray(projection.reliabilityProblems) &&
    projection.reliabilityProblems.every(isReliabilityProblem) &&
    Array.isArray(projection.gatedControls) &&
    projection.gatedControls.every(isGatedControl) &&
    isExecuteAdmission(projection.executeAdmission) &&
    isQueueSummary(projection.queueSummary) &&
    isProjectionFreshnessConsistent(projection) &&
    isProjectionFixtureTruthConsistent(projection) &&
    isProjectionSourceExhaustionConsistent(projection) &&
    isProjectionBackendReachabilityConsistent(projection) &&
    isProjectionManagerReliabilityConsistent(projection) &&
    isProjectionReliabilityProblemsConsistent(projection) &&
    isEmptyProjectionSummaryConsistent(projection) &&
    (projection.sourceLabel !== "live" || isLiveProjectionRenderable(projection)) &&
    Array.isArray(projection.sourceStates) &&
    projection.sourceStates.every(isProjectionSourceState) &&
    Array.isArray(projection.workPackets) &&
    projection.workPackets.every(isProjectionWorkPacket) &&
    Array.isArray(projection.stageSummaries) &&
    projection.stageSummaries.every(isProjectionStageSummary) &&
    hasExactlyOneStageSummaryPerStage(projection.stageSummaries) &&
    Array.isArray(projection.selectedPacketDetails) &&
    projection.selectedPacketDetails.every(isProjectionSelectedPacketDetail) &&
    selectedPacketDetailsMatchWorkPackets(projection.workPackets, projection.selectedPacketDetails) &&
    Array.isArray(projection.evidenceRefs) &&
    projection.evidenceRefs.every(isSafeEvidenceRef)
  );
}

const projectionSourceLabels = new Set(["live", "stale", "fixture", "simulated", "dry_run", "unavailable", "unknown"]);
const projectionFreshnessStates = new Set(["live", "stale", "unavailable", "unknown"]);
const backendReachabilityStates = new Set(["reachable", "unavailable", "unknown"]);
const managerStateSources = new Set(["supervisor_projection", "manager_summary", "unavailable", "unknown"]);
const projectionStatuses = new Set(["active", "waiting", "blocked", "failed", "complete", "deferred"]);
const projectionStages = new Set<string>(AUTHORITATIVE_PACKET_STAGES);
const projectionSourceTypes = new Set(["prd", "bmad_story", "operator_input", "workflow", "repo_doc"]);
const managerReliabilityStates = new Set([
  "ready",
  "running",
  "healthy_idle",
  "source_exhausted",
  "waiting_for_approval",
  "blocked",
  "refilling",
  "degraded",
  "unavailable",
  "unknown",
]);
const projectionSourceKinds = new Set([
  "prd",
  "bmad_story",
  "operator_input",
  "workflow",
  "repo_doc",
  "candidate_work",
  "work_item",
  "bmad_artifact",
  "obsidian",
  "llm_wiki",
  "github",
  "research",
  "manual",
  "unknown",
]);
const projectionSourceStates = new Set(["healthy", "exhausted", "blocked", "gated", "stale", "unavailable", "refilling", "unknown"]);
const reliabilityProblemKinds = new Set([
  "idle_with_ready_work",
  "stalled_worker",
  "stale_projection",
  "backend_unavailable",
  "source_blocked",
  "approval_required",
  "usage_limited",
  "resource_limited",
  "unknown",
]);
const reliabilityProblemSeverities = new Set(["info", "attention", "blocked"]);
const reliabilityProblemLikelyIssues = new Set(["manager", "worker", "source", "approval", "usage", "resource", "unknown"]);
const gatedControlOperations = new Set([
  "kill_worker",
  "drain_worker",
  "cleanup_workspace",
  "takeover_workspace",
  "provider_call",
  "github_mutation",
  "worker_launch",
  "lease_mutation",
  "source_mutation",
  "terminal_access",
  "raw_payload_retention",
  "unknown",
]);
const gatedControlStatuses = new Set(["gated", "action_needed", "blocked"]);
const unsafeEvidenceRefPattern =
  /\b(raw[\s_-]*(prompts?|completions?|transcripts?)|reasoning[\s_-]*traces?|provider[\s_-]*payloads?|secrets?([\s_-]*(key|token|value|id))?|credentials?([\s_-]*(key|token|value|id))?|(terminal|tmux|pane)[\s_-]*(scrollbacks?|texts?|outputs?|stdouts?|stderrs?))\b/i;
const executableControlTextPattern =
  /\b(tmux\s+(kill|send|capture|new|attach)|git(hub)?\s+(push|merge|checkout|reset|clean|branch|pr)|gh\s+(pr|repo|api)|curl\s+|bash\s+|sh\s+|python\s+|node\s+|pnpm\s+|uv\s+run|provider\s+(call|request|payload))\b/i;
const gatedControlAllowedKeys = new Set([
  "controlId",
  "operation",
  "status",
  "authorityFamily",
  "stopLine",
  "nextAction",
  "packetId",
  "workerRefs",
  "evidenceRefs",
  "metadataOnly",
]);
const projectionEmptyReasons = new Set([
  "healthy_empty",
  "source_exhausted",
  "blocked",
  "refilling",
  "usage_limited",
  "resource_limited",
  "cleanup_gated",
  "approval_required",
  "failure_budget_hit",
  "backend_unavailable",
  "projection_stale",
  "unknown",
]);

function isProjectionSourceLabel(value: unknown) {
  return typeof value === "string" && projectionSourceLabels.has(value);
}

function isProjectionFreshnessState(value: unknown) {
  return typeof value === "string" && projectionFreshnessStates.has(value);
}

function isBackendReachabilityState(value: unknown) {
  return typeof value === "string" && backendReachabilityStates.has(value);
}

function isManagerStateSource(value: unknown) {
  return typeof value === "string" && managerStateSources.has(value);
}

function isProjectionStatus(value: unknown) {
  return typeof value === "string" && projectionStatuses.has(value);
}

function isProjectionStage(value: unknown) {
  return typeof value === "string" && projectionStages.has(value);
}

function isNullableCount(value: unknown) {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function isSafeEvidenceRef(value: unknown) {
  return (
    isSafeReferenceString(value) &&
    value.length <= 255 &&
    !unsafeEvidenceRefPattern.test(value)
  );
}

function isSafeReferenceString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && !isSyntheticRuntimeIdentity(value);
}

function isSyntheticRuntimeIdentity(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith("fixture:") || normalized.startsWith("demo:");
}

function isSafeWorkerRef(value: unknown) {
  return typeof value === "string" && isSafeEvidenceRef(value) && value.startsWith("worker:");
}

function isSafeProjectionText(value: unknown) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 500 &&
    !unsafeEvidenceRefPattern.test(value) &&
    !executableControlTextPattern.test(value)
  );
}

function isProjectionReadyToTest(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const ready = value as NonNullable<PipelineDashboardProjectionV0["workPackets"][number]["readyToTest"]>;
  return (
    typeof ready.readyId === "string" &&
    typeof ready.userFacingSummary === "string" &&
    typeof ready.testableSurface === "string" &&
    Array.isArray(ready.verificationRefs) &&
    ready.verificationRefs.every(isSafeEvidenceRef) &&
    Array.isArray(ready.evidenceRefs) &&
    ready.evidenceRefs.every(isSafeEvidenceRef) &&
    ready.metadataOnly === true &&
    ready.rawPayloadRetained === false
  );
}

function isTimestampString(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isProjectionFreshnessConsistent(projection: Partial<PipelineDashboardProjectionV0>) {
  const generatedAt = projection.generatedAt;
  const sourceUpdatedAt = projection.sourceUpdatedAt;
  const staleAfterSeconds = projection.staleAfterSeconds;
  if (
    !isTimestampString(generatedAt) ||
    !isTimestampString(sourceUpdatedAt) ||
    typeof staleAfterSeconds !== "number" ||
    !Number.isFinite(staleAfterSeconds)
  ) {
    return false;
  }
  const ageMs = Date.parse(generatedAt) - Date.parse(sourceUpdatedAt);
  return projection.freshnessState !== "live" || (ageMs >= 0 && (ageMs <= staleAfterSeconds * 1000 || projectionHasOpenPacket(projection)));
}

function isLiveProjectionRenderable(projection: Partial<PipelineDashboardProjectionV0>) {
  if (!Array.isArray(projection.workPackets)) {
    return false;
  }
  return projectionHasOpenPacket(projection) || (
    projection.workPackets.length === 0 &&
    projection.truthSummary?.backendEmpty === true &&
    ["healthy_empty", "blocked", "refilling", "approval_required"].includes(projection.truthSummary.emptyReason || "") &&
    (!["blocked", "refilling", "approval_required"].includes(projection.truthSummary.emptyReason || "") || projection.queueSummary?.emptyReason === projection.truthSummary.emptyReason)
  ) || (
    projection.workPackets.length === 0 &&
    projection.truthSummary?.backendEmpty === true &&
    projection.truthSummary.emptyReason === "source_exhausted" &&
    projection.queueSummary?.sourceExhausted === true &&
    projection.queueSummary.emptyReason === "source_exhausted"
  ) || (
    projection.workPackets.length > 0 &&
    projection.queueSummary?.sourceExhausted === true &&
    projection.queueSummary.emptyReason === "source_exhausted"
  );
}

function isEmptyProjectionSummaryConsistent(projection: Partial<PipelineDashboardProjectionV0>) {
  if (!Array.isArray(projection.workPackets) || !projection.truthSummary) {
    return false;
  }
  const packetCount = projection.workPackets.length;
  if (projection.truthSummary.backendEmpty === true && packetCount > 0) {
    return false;
  }
  if (
    packetCount === 0 &&
    projection.truthSummary.backendEmpty === false &&
    projection.sourceLabel === "live" &&
    projection.backendReachability?.state === "reachable"
  ) {
    return false;
  }
  if (!Array.isArray(projection.stageSummaries)) {
    return false;
  }
  const packetCountsByStage = new Map<string, number>();
  for (const packet of projection.workPackets) {
    if (!packet || typeof packet !== "object" || typeof packet.currentStage !== "string") {
      return false;
    }
    packetCountsByStage.set(packet.currentStage, (packetCountsByStage.get(packet.currentStage) ?? 0) + 1);
  }
  const stagePacketCount = projection.stageSummaries.reduce((sum, summary) => sum + summary.packetCount, 0);
  if (
    stagePacketCount !== packetCount ||
    projection.stageSummaries.some((summary) => summary.packetCount !== (packetCountsByStage.get(summary.stage) ?? 0))
  ) {
    return false;
  }
  if (Array.isArray(projection.selectedPacketDetails) && projection.selectedPacketDetails.length !== packetCount) {
    return false;
  }

  const manager = projection.managerSummary;
  const worker = projection.workerSummary;
  const queue = projection.queueSummary;
  if (!manager || !worker || !queue) {
    return false;
  }

  const queueCounts = [
    queue.activeCount,
    queue.dispatchableCount,
    queue.blockedCount,
    queue.gatedCount,
    queue.closedCount,
    queue.staleCount,
    queue.refillingCount,
    queue.unknownCount,
  ];
  if (queueCounts.every(isKnownCount) && queueCounts.reduce((sum, count) => sum + count, 0) < packetCount) {
    return false;
  }

  const queueManagerCounts: Array<[unknown, unknown]> = [
    [queue.blockedCount, manager.blockedQueueCount],
    [queue.dispatchableCount, manager.dispatchableQueueCount],
    [queue.closedCount, manager.closedQueueCount],
  ];
  if (queueManagerCounts.some(([queueCount, managerCount]) => !countsMatch(queueCount, managerCount))) {
    return false;
  }

  const managerWorkerCounts: Array<[unknown, unknown]> = [
    [manager.warmWorkerCount, worker.warmCount],
    [manager.activeWorkerCount, worker.activeCount],
  ];
  if (managerWorkerCounts.some(([managerCount, workerCount]) => !countsMatch(managerCount, workerCount))) {
    return false;
  }

  if (Array.isArray(projection.sourceStates)) {
    const sourceStateCounts = new Map<string, number>();
    for (const sourceState of projection.sourceStates) {
      if (!sourceState || typeof sourceState !== "object" || typeof sourceState.state !== "string") {
        return false;
      }
      sourceStateCounts.set(sourceState.state, (sourceStateCounts.get(sourceState.state) ?? 0) + 1);
    }
    const managerSourceCounts: Array<[unknown, string]> = [
      [manager.healthySourceCount, "healthy"],
      [manager.exhaustedSourceCount, "exhausted"],
      [manager.blockedSourceCount, "blocked"],
      [manager.gatedSourceCount, "gated"],
      [manager.staleSourceCount, "stale"],
      [manager.unavailableSourceCount, "unavailable"],
      [manager.refillingSourceCount, "refilling"],
      [manager.unknownSourceCount, "unknown"],
    ];
    if (managerSourceCounts.some(([managerCount, state]) => isKnownCount(managerCount) && managerCount !== (sourceStateCounts.get(state) ?? 0))) {
      return false;
    }
  }

  const emptyReason = projection.truthSummary.emptyReason;
  const emptyQueueCountNames = ["blockedCount", "gatedCount", "refillingCount", "staleCount", "unknownCount"];
  const emptyReasonPriority = {
    blocked: 0,
    approval_required: 1,
    refilling: 2,
    unknown: 3,
  }[emptyReason as "blocked" | "approval_required" | "refilling" | "unknown"];
  const allowedEmptyQueueCounts = new Set(
    typeof emptyReasonPriority === "number"
      ? emptyQueueCountNames.slice(emptyReasonPriority)
      : emptyReason === "projection_stale"
        ? ["staleCount"]
        : [],
  );
  if (packetCount === 0 && projection.truthSummary.backendEmpty === true) {
    const namedQueueCounts: Array<[string, unknown]> = [
      ["activeCount", queue.activeCount],
      ["dispatchableCount", queue.dispatchableCount],
      ["blockedCount", queue.blockedCount],
      ["gatedCount", queue.gatedCount],
      ["closedCount", queue.closedCount],
      ["staleCount", queue.staleCount],
      ["refillingCount", queue.refillingCount],
      ["unknownCount", queue.unknownCount],
    ];
    if (namedQueueCounts.some(([name, count]) => isKnownCount(count) && count > 0 && !allowedEmptyQueueCounts.has(name))) {
      return false;
    }
  }

  if (packetCount === 0 && projection.truthSummary.backendEmpty === true) {
    return [
      manager.activeLeaseCount,
      manager.activeWorkerCount,
      manager.warmWorkerCount,
      worker.warmCount,
      worker.activeCount,
      worker.waitingCount,
      worker.stalledCount,
      worker.failedCount,
      worker.drainingCount,
      worker.killedCount,
      worker.completeCount,
      worker.unavailableCount,
      worker.unknownCount,
    ].every((count) => !isKnownCount(count) || count === 0);
  }

  return true;
}

function isKnownCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function countsMatch(left: unknown, right: unknown): boolean {
  return !isKnownCount(left) || !isKnownCount(right) || left === right;
}

function projectionHasOpenPacket(projection: Partial<PipelineDashboardProjectionV0>) {
  return Array.isArray(projection.workPackets) && projection.workPackets.some((candidate) => (
    candidate &&
    typeof candidate === "object" &&
    ["active", "waiting", "blocked", "failed"].includes((candidate as { status?: string }).status || "")
  ));
}

function isProjectionFixtureTruthConsistent(projection: Partial<PipelineDashboardProjectionV0>) {
  if (!projection.fixtureMode?.enabled) {
    return true;
  }
  return (
    projection.sourceLabel !== "live" &&
    projection.truthSummary?.label !== "live" &&
    projection.truthSummary?.fixtureBacked === true &&
    projection.fixtureMode.canSatisfyLiveProof === false
  );
}

function isProjectionSourceExhaustionConsistent(projection: Partial<PipelineDashboardProjectionV0>) {
  const sourceExhaustedClaimed = [
    projection.truthSummary?.emptyReason,
    projection.queueSummary?.emptyReason,
    projection.managerSummary?.inactivityReason,
    projection.managerSummary?.reliabilityState,
    projection.queueSummary?.sourceExhausted === true ? "source_exhausted" : null,
    projection.managerSummary?.sourceExhausted === true ? "source_exhausted" : null,
  ].includes("source_exhausted");
  if (sourceExhaustedClaimed && projectionHasOpenPacket(projection)) {
    return false;
  }
  const hasExhaustedSourceWithEvidence = Array.isArray(projection.sourceStates) && projection.sourceStates.some((sourceState) => (
    sourceState &&
    typeof sourceState === "object" &&
    (sourceState as { state?: string }).state === "exhausted" &&
    Array.isArray((sourceState as { evidenceRefs?: unknown }).evidenceRefs) &&
      (sourceState as { evidenceRefs: unknown[] }).evidenceRefs.some(isSafeEvidenceRef)
  ));
  return (
    !sourceExhaustedClaimed ||
    hasExhaustedSourceWithEvidence
  );
}

function isProjectionBackendReachabilityConsistent(projection: Partial<PipelineDashboardProjectionV0>) {
  if (projection.backendReachability?.state !== "unavailable") {
    return true;
  }
  return (
    projection.sourceLabel === "unavailable" &&
    projection.freshnessState === "unavailable" &&
    projection.truthSummary?.label === "unavailable" &&
    projection.truthSummary?.backendUnavailable === true &&
    projection.managerSummary?.stateSource === "unavailable" &&
    projection.managerSummary?.reliabilityState === "unavailable" &&
    projection.managerSummary?.freshnessState === "unavailable" &&
    projection.workerSummary?.stateSource === "unavailable" &&
    projection.workerSummary?.freshnessState === "unavailable" &&
    projection.queueSummary?.emptyReason === "backend_unavailable"
  );
}

function isProjectionManagerReliabilityConsistent(projection: Partial<PipelineDashboardProjectionV0>) {
  const manager = projection.managerSummary;
  const queue = projection.queueSummary;
  if (!manager || !queue) {
    return false;
  }
  if (projection.backendReachability?.state === "unavailable") {
    return manager.reliabilityState === "unavailable";
  }
  if (queue.activeCount !== null && queue.activeCount !== undefined && queue.activeCount > 0) {
    return manager.reliabilityState === "running";
  }
  if (queue.dispatchableCount !== null && queue.dispatchableCount !== undefined && queue.dispatchableCount > 0) {
    return manager.reliabilityState === "ready";
  }
  if (queue.blockedCount !== null && queue.blockedCount !== undefined && queue.blockedCount > 0) {
    return manager.reliabilityState === "blocked";
  }
  if (queue.gatedCount !== null && queue.gatedCount !== undefined && queue.gatedCount > 0) {
    return manager.reliabilityState === "waiting_for_approval";
  }
  if (queue.refillingCount !== null && queue.refillingCount !== undefined && queue.refillingCount > 0) {
    return manager.reliabilityState === "refilling";
  }
  if (queue.staleCount !== null && queue.staleCount !== undefined && queue.staleCount > 0) {
    return ["degraded", "unknown"].includes(manager.reliabilityState);
  }
  if (queue.unknownCount !== null && queue.unknownCount !== undefined && queue.unknownCount > 0) {
    return manager.reliabilityState === "unknown";
  }
  if (manager.inactivityReason === "source_exhausted" || manager.sourceExhausted) {
    return manager.reliabilityState === "source_exhausted";
  }
  if (manager.inactivityReason === "healthy_empty") {
    return manager.reliabilityState === "healthy_idle";
  }
  return true;
}

function isProjectionReliabilityProblemsConsistent(projection: Partial<PipelineDashboardProjectionV0>) {
  if (!Array.isArray(projection.reliabilityProblems)) {
    return false;
  }
  return projection.reliabilityProblems.every((problem) => {
    if (problem.kind !== "idle_with_ready_work") {
      return true;
    }
    return isIdleWithReadyWorkProblemConsistent(projection);
  });
}

function isIdleWithReadyWorkProblemConsistent(projection: Partial<PipelineDashboardProjectionV0>) {
  const queue = projection.queueSummary;
  const manager = projection.managerSummary;
  const worker = projection.workerSummary;
  if (!queue || !manager || !worker) {
    return false;
  }
  if (
    projection.sourceLabel !== "live" ||
    projection.freshnessState !== "live" ||
    projection.backendReachability?.state !== "reachable" ||
    projection.fixtureMode?.enabled === true
  ) {
    return false;
  }
  if ((queue.dispatchableCount ?? 0) <= 0) {
    return false;
  }
  if (
    queue.sourceExhausted ||
    ["source_exhausted", "healthy_empty", "approval_required", "backend_unavailable", "projection_stale"].includes(queue.emptyReason ?? "") ||
    ["source_exhausted", "healthy_empty", "approval_required", "backend_unavailable", "projection_stale"].includes(manager.inactivityReason ?? "")
  ) {
    return false;
  }
  if ((queue.activeCount ?? 0) > 0 || (manager.activeLeaseCount ?? 0) > 0 || (manager.activeWorkerCount ?? 0) > 0) {
    return false;
  }
  if (worker.freshnessState === "live" && ((worker.activeCount ?? 0) > 0 || (worker.drainingCount ?? 0) > 0)) {
    return false;
  }
  return true;
}

function hasExactlyOneStageSummaryPerStage(stageSummaries: PipelineDashboardProjectionV0["stageSummaries"]) {
  if (stageSummaries.length !== AUTHORITATIVE_PACKET_STAGES.length) {
    return false;
  }
  const stages = new Set(stageSummaries.map((summary) => summary.stage));
  return AUTHORITATIVE_PACKET_STAGES.every((stage) => stages.has(stage));
}

function selectedPacketDetailsMatchWorkPackets(
  workPackets: PipelineDashboardProjectionV0["workPackets"],
  selectedPacketDetails: PipelineDashboardProjectionV0["selectedPacketDetails"]
) {
  if (workPackets.length !== selectedPacketDetails.length) {
    return false;
  }
  const packetsById = new Map(workPackets.map((packet) => [packet.packetId, packet]));
  const detailIds = new Set<string>();
  for (const detail of selectedPacketDetails) {
    if (detailIds.has(detail.packetId)) {
      return false;
    }
    detailIds.add(detail.packetId);
    const packet = packetsById.get(detail.packetId);
    if (!packet) {
      return false;
    }
    if (
      detail.currentStage !== packet.currentStage ||
      detail.status !== packet.status ||
      detail.truthLabel !== packet.truthLabel ||
      JSON.stringify(detail.canonicalContract) !== JSON.stringify(packet.canonicalContract) ||
      JSON.stringify(detail.productModeMapping) !== JSON.stringify(packet.productModeMapping) ||
      detail.blocker !== packet.blocker ||
      detail.nextAction !== packet.nextAction ||
      JSON.stringify(detail.readyToTest ?? null) !== JSON.stringify(packet.readyToTest ?? null)
    ) {
      return false;
    }
    const detailEvidence = new Set(detail.evidenceRefs);
    if (
      packet.evidenceRefs.length !== detail.evidenceRefs.length ||
      packet.evidenceRefs.some((ref) => !detailEvidence.has(ref))
    ) {
      return false;
    }
  }
  return detailIds.size === packetsById.size;
}

function isEmptyReason(value: unknown) {
  return value === null || (typeof value === "string" && projectionEmptyReasons.has(value));
}

function isBackendReachability(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const reachability = value as PipelineDashboardProjectionV0["backendReachability"];
  return (
    isBackendReachabilityState(reachability.state) &&
    isTimestampString(reachability.checkedAt) &&
    isEmptyReason(reachability.reason ?? null) &&
    typeof reachability.summary === "string"
  );
}

function isFixtureMode(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const fixtureMode = value as PipelineDashboardProjectionV0["fixtureMode"];
  return (
    typeof fixtureMode.enabled === "boolean" &&
    (fixtureMode.reason === null || typeof fixtureMode.reason === "string") &&
    typeof fixtureMode.allowedForEnvironment === "boolean" &&
    fixtureMode.visibleLabelRequired === true &&
    fixtureMode.canSatisfyLiveProof === false
  );
}

function isTruthSummary(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const truthSummary = value as PipelineDashboardProjectionV0["truthSummary"];
  return (
    isProjectionSourceLabel(truthSummary.label) &&
    isEmptyReason(truthSummary.emptyReason) &&
    typeof truthSummary.backendEmpty === "boolean" &&
    typeof truthSummary.backendUnavailable === "boolean" &&
    typeof truthSummary.fixtureBacked === "boolean" &&
    typeof truthSummary.stale === "boolean" &&
    typeof truthSummary.summary === "string"
  );
}

function isManagerSummary(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const managerSummary = value as PipelineDashboardProjectionV0["managerSummary"];
  return (
    isManagerStateSource(managerSummary.stateSource) &&
    managerReliabilityStates.has(managerSummary.reliabilityState) &&
    isProjectionFreshnessState(managerSummary.freshnessState) &&
    isNullableCount(managerSummary.activeLeaseCount) &&
    isNullableCount(managerSummary.activeWorkerCount) &&
    isNullableCount(managerSummary.warmWorkerCount) &&
    isNullableCount(managerSummary.blockedQueueCount) &&
    isNullableCount(managerSummary.dispatchableQueueCount) &&
    isNullableCount(managerSummary.closedQueueCount) &&
    isNullableCount(managerSummary.healthySourceCount) &&
    isNullableCount(managerSummary.exhaustedSourceCount) &&
    isNullableCount(managerSummary.blockedSourceCount) &&
    isNullableCount(managerSummary.gatedSourceCount) &&
    isNullableCount(managerSummary.staleSourceCount) &&
    isNullableCount(managerSummary.unavailableSourceCount) &&
    isNullableCount(managerSummary.refillingSourceCount) &&
    isNullableCount(managerSummary.unknownSourceCount) &&
    typeof managerSummary.sourceExhausted === "boolean" &&
    isEmptyReason(managerSummary.inactivityReason) &&
    Array.isArray(managerSummary.evidenceRefs) &&
    managerSummary.evidenceRefs.every(isSafeEvidenceRef) &&
    typeof managerSummary.summary === "string" &&
    managerSummary.metadataOnly === true
  );
}

function isWorkerSummary(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const workerSummary = value as PipelineDashboardProjectionV0["workerSummary"];
  return (
    isManagerStateSource(workerSummary.stateSource) &&
    isProjectionFreshnessState(workerSummary.freshnessState) &&
    isNullableCount(workerSummary.warmCount) &&
    isNullableCount(workerSummary.activeCount) &&
    isNullableCount(workerSummary.waitingCount) &&
    isNullableCount(workerSummary.stalledCount) &&
    isNullableCount(workerSummary.failedCount) &&
    isNullableCount(workerSummary.drainingCount) &&
    isNullableCount(workerSummary.killedCount) &&
    isNullableCount(workerSummary.completeCount) &&
    isNullableCount(workerSummary.unavailableCount) &&
    isNullableCount(workerSummary.unknownCount) &&
    Array.isArray(workerSummary.workerRefs) &&
    workerSummary.workerRefs.every(isSafeWorkerRef) &&
    Array.isArray(workerSummary.evidenceRefs) &&
    workerSummary.evidenceRefs.every(isSafeEvidenceRef) &&
    typeof workerSummary.summary === "string" &&
    workerSummary.metadataOnly === true
  );
}

function isReliabilityProblem(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const problem = value as PipelineDashboardProjectionV0["reliabilityProblems"][number];
  return (
    typeof problem.problemId === "string" &&
    reliabilityProblemKinds.has(problem.kind) &&
    reliabilityProblemSeverities.has(problem.severity) &&
    reliabilityProblemLikelyIssues.has(problem.likelyIssue) &&
    typeof problem.summary === "string" &&
    Array.isArray(problem.evidenceRefs) &&
    problem.evidenceRefs.every(isSafeEvidenceRef) &&
    problem.metadataOnly === true
  );
}

function isGatedControl(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const control = value as PipelineDashboardProjectionV0["gatedControls"][number] & { command?: unknown };
  return (
    Object.keys(control).every((key) => gatedControlAllowedKeys.has(key)) &&
    typeof control.controlId === "string" &&
    isSafeEvidenceRef(control.controlId) &&
    gatedControlOperations.has(control.operation) &&
    gatedControlStatuses.has(control.status) &&
    isSafeProjectionText(control.authorityFamily) &&
    isSafeProjectionText(control.stopLine) &&
    isSafeProjectionText(control.nextAction) &&
    (control.packetId === null || isSafeEvidenceRef(control.packetId)) &&
    Array.isArray(control.workerRefs) &&
    control.workerRefs.every(isSafeWorkerRef) &&
    Array.isArray(control.evidenceRefs) &&
    control.evidenceRefs.every(isSafeEvidenceRef) &&
    control.metadataOnly === true
  );
}

function isQueueSummary(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const queueSummary = value as PipelineDashboardProjectionV0["queueSummary"];
  return (
    isNullableCount(queueSummary.activeCount) &&
    isNullableCount(queueSummary.dispatchableCount) &&
    isNullableCount(queueSummary.blockedCount) &&
    isNullableCount(queueSummary.gatedCount) &&
    isNullableCount(queueSummary.closedCount) &&
    isNullableCount(queueSummary.staleCount) &&
    isNullableCount(queueSummary.refillingCount) &&
    isNullableCount(queueSummary.unknownCount) &&
    isEmptyReason(queueSummary.emptyReason) &&
    typeof queueSummary.sourceExhausted === "boolean" &&
    typeof queueSummary.summary === "string"
  );
}

function isExecuteAdmission(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const admission = value as PipelineDashboardProjectionV0["executeAdmission"];
  const validDimensions = new Set(["review", "deliver", "verification", "operatorTesting"]);
  const validCounts = (counts: typeof admission.limits) => counts === null || (
    typeof counts === "object" &&
    counts !== null &&
    [counts.review, counts.deliver, counts.verification, counts.operatorTesting]
      .every((count) => Number.isInteger(count) && count >= 0)
  );
  return (
    admission.schemaVersion === "pipeline-execute-admission/v0" &&
    admission.policyVersion === "supervisor-wip/v0" &&
    ["ready", "blocked", "unavailable"].includes(admission.state) &&
    typeof admission.capacityAvailable === "boolean" &&
    typeof admission.typedReason === "string" &&
    ["supervisor_settings", "unavailable"].includes(admission.source) &&
    validCounts(admission.limits) &&
    validCounts(admission.observed) &&
    Array.isArray(admission.blockingDimensions) &&
    admission.blockingDimensions.every((dimension) => validDimensions.has(dimension)) &&
    typeof admission.nextSafeAction === "string" &&
    Array.isArray(admission.evidenceRefs) &&
    admission.evidenceRefs.every(isSafeEvidenceRef) &&
    admission.metadataOnly === true &&
    admission.rawPayloadRetained === false &&
    (admission.state === "ready") === admission.capacityAvailable &&
    (admission.state === "unavailable" || (admission.limits !== null && admission.observed !== null))
  );
}

function isProjectionSourceRef(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const sourceRef = value as NonNullable<PipelineDashboardProjectionV0["workPackets"][number]["sourceRef"]>;
  return (
    isSafeReferenceString(sourceRef.refId) &&
    projectionSourceTypes.has(sourceRef.sourceType) &&
    (sourceRef.pathOrUrl === null || sourceRef.pathOrUrl === undefined || isSafeReferenceString(sourceRef.pathOrUrl)) &&
    (sourceRef.title === null || sourceRef.title === undefined || typeof sourceRef.title === "string") &&
    (sourceRef.contentSha256 === null || sourceRef.contentSha256 === undefined || (typeof sourceRef.contentSha256 === "string" && /^[0-9a-f]{64}$/i.test(sourceRef.contentSha256)))
  );
}

function isProjectionWorkPacket(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const packet = value as PipelineDashboardProjectionV0["workPackets"][number];
  return (
    typeof packet.packetId === "string" &&
    typeof packet.title === "string" &&
    isProjectionStage(packet.currentStage) &&
    isProjectionStatus(packet.status) &&
    isProjectionSourceLabel(packet.truthLabel) &&
    (packet.sourceRef === null || isProjectionSourceRef(packet.sourceRef)) &&
    (packet.canonicalContract === null || isPipelineCanonicalContractV1(packet.canonicalContract)) &&
    (packet.productModeMapping === null || isPipelineProductModeMappingV0(packet.productModeMapping)) &&
    (packet.blocker === null || typeof packet.blocker === "string") &&
    (packet.nextAction === null || typeof packet.nextAction === "string") &&
    (packet.readyToTest === undefined || packet.readyToTest === null || isProjectionReadyToTest(packet.readyToTest)) &&
    Array.isArray(packet.evidenceRefs) &&
    packet.evidenceRefs.every(isSafeEvidenceRef) &&
    isTimestampString(packet.updatedAt) &&
    packet.metadataOnly === true
  );
}

function isProjectionStageSummary(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const stage = value as PipelineDashboardProjectionV0["stageSummaries"][number];
  return (
    isProjectionStage(stage.stage) &&
    typeof stage.label === "string" &&
    typeof stage.packetCount === "number" &&
    Number.isFinite(stage.packetCount) &&
    stage.packetCount >= 0 &&
    isProjectionSourceLabel(stage.sourceLabel) &&
    isProjectionFreshnessState(stage.freshnessState) &&
    isEmptyReason(stage.emptyReason)
  );
}

function isProjectionSourceState(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const sourceState = value as PipelineDashboardProjectionV0["sourceStates"][number];
  return (
    isSafeReferenceString(sourceState.sourceId) &&
    isSafeReferenceString(sourceState.sourceRef) &&
    projectionSourceKinds.has(sourceState.sourceKind) &&
    projectionSourceStates.has(sourceState.state) &&
    typeof sourceState.summary === "string" &&
    Array.isArray(sourceState.evidenceRefs) &&
    sourceState.evidenceRefs.every(isSafeEvidenceRef) &&
    isTimestampString(sourceState.updatedAt) &&
    sourceState.metadataOnly === true
  );
}

function isProjectionSelectedPacketDetail(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const detail = value as PipelineDashboardProjectionV0["selectedPacketDetails"][number];
  const hasValidLatestTransitionEventRef =
    detail.latestTransitionEventRef === undefined ||
    detail.latestTransitionEventRef === null ||
    isSafeReferenceString(detail.latestTransitionEventRef);
  const hasValidRecentTransitionEventRefs =
    detail.recentTransitionEventRefs === undefined ||
    (Array.isArray(detail.recentTransitionEventRefs) &&
      detail.recentTransitionEventRefs.every(isSafeReferenceString));
  const hasValidLatestMovementSummary =
    detail.latestMovementSummary === undefined ||
    detail.latestMovementSummary === null ||
    typeof detail.latestMovementSummary === "string";
  const hasValidLiveMovementProof =
    detail.canSatisfyLiveMovementProof === undefined ||
    typeof detail.canSatisfyLiveMovementProof === "boolean";
  const movementProofIsConsistent =
    detail.canSatisfyLiveMovementProof !== true ||
    (detail.truthLabel === "live" &&
      (detail.status === "active" || detail.status === "waiting" || detail.status === "blocked") &&
      detail.currentStage !== "learn" &&
      typeof detail.latestTransitionEventRef === "string" &&
      detail.latestTransitionEventRef.startsWith("event:") &&
      Array.isArray(detail.recentTransitionEventRefs) &&
      detail.recentTransitionEventRefs.includes(detail.latestTransitionEventRef) &&
      typeof detail.latestMovementSummary === "string" &&
      detail.latestMovementSummary.trim().length > 0);
  return (
    typeof detail.packetId === "string" &&
    Array.isArray(detail.sourceRefs) &&
    detail.sourceRefs.every(isProjectionSourceRef) &&
    (detail.canonicalContract === null || isPipelineCanonicalContractV1(detail.canonicalContract)) &&
    (detail.productModeMapping === null || isPipelineProductModeMappingV0(detail.productModeMapping)) &&
    Array.isArray(detail.evidenceRefs) &&
    detail.evidenceRefs.every(isSafeEvidenceRef) &&
    isProjectionStage(detail.currentStage) &&
    isProjectionStatus(detail.status) &&
    isProjectionSourceLabel(detail.truthLabel) &&
    (detail.blocker === null || typeof detail.blocker === "string") &&
    (detail.nextAction === null || typeof detail.nextAction === "string") &&
    (detail.readyToTest === undefined || detail.readyToTest === null || isProjectionReadyToTest(detail.readyToTest)) &&
    hasValidLatestTransitionEventRef &&
    hasValidRecentTransitionEventRefs &&
    hasValidLatestMovementSummary &&
    hasValidLiveMovementProof &&
    movementProofIsConsistent &&
    detail.metadataOnly === true
  );
}
