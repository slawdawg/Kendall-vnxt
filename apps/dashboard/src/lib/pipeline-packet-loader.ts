import type { PipelineDashboardProjectionV0 } from "@kendall/contracts";

import { getPipelineDashboardProjection, getWorkPacket, getWorkPackets } from "./pipeline-supervisor-runtime";
import {
  projectSupervisorWorkPacketsToCockpitPackets,
  type PipelineRuntimePacket,
} from "./pipeline-supervisor-projector";
export type PipelineCockpitPacketLoad = {
  fixtureMode: PipelineRuntimeSourceState;
  packets: PipelineRuntimePacket[];
  projection: PipelineDashboardProjectionV0 | null;
  projectionError: string | null;
};

export type PipelineCockpitPacketDetailLoad = {
  fixtureMode: PipelineRuntimeSourceState;
  packet: PipelineRuntimePacket | null;
  workGraph: PipelineDashboardProjectionV0["selectedPacketDetails"][number]["workGraph"] | null;
};

export type PipelineRuntimeSourceState = {
  kind: "runtime" | "stale" | "empty" | "unavailable" | "invalid" | "demo";
  label: string;
  summary: string;
  matrixRows: number;
  fixtureCatalogEntries: number;
  canSatisfyLiveProof: boolean;
};

async function readWorkPackets() {
  return getWorkPackets();
}

async function readWorkPacket(packetId: CanonicalRuntimePacketId) {
  return getWorkPacket(packetId);
}

async function readPipelineDashboardProjection() {
  return getPipelineDashboardProjection();
}

export async function loadPipelineCockpitPackets(): Promise<PipelineCockpitPacketLoad> {
  const projectionResult = await loadPipelineDashboardProjection();
  if (projectionResult.error) {
    return {
      fixtureMode: projectionReadErrorSourceState(projectionResult.error),
      packets: [],
      projection: null,
      projectionError: projectionResult.error,
    };
  }
  const projectionRuntimeError = runtimeProjectionError(projectionResult.projection, "list");
  if (projectionRuntimeError) {
    return {
      fixtureMode: runtimeSourceState(
        projectionRuntimeError.kind,
        projectionRuntimeError.kind === "invalid" ? "Supervisor invalid" : "Supervisor unavailable",
        projectionRuntimeError.summary,
      ),
      packets: [],
      projection: null,
      projectionError: projectionRuntimeError.summary,
    };
  }
  const verifiedProjection = projectionResult.projection;
  if (!verifiedProjection) {
    return {
      fixtureMode: runtimeSourceState("invalid", "Supervisor invalid", "Supervisor projection is missing after runtime validation; no runtime or demo packets are shown."),
      packets: [],
      projection: null,
      projectionError: "Supervisor projection is missing after runtime validation.",
    };
  }
  try {
    const projection = projectSupervisorWorkPacketsToCockpitPackets(await readWorkPackets());
    if (projection.kind === "empty") {
      const emptyContradiction = emptyRuntimeContradiction(projectionResult.projection);
      if (emptyContradiction) {
        return {
          fixtureMode: runtimeSourceState("invalid", "Supervisor invalid", `${emptyContradiction} No runtime or demo packets are shown.`),
          packets: [],
          projection: null,
          projectionError: emptyContradiction,
        };
      }
      return {
        fixtureMode: runtimeSourceState("empty", "Supervisor empty", emptyRuntimeSummary(projectionResult.projection)),
        packets: [],
        projection: projectionResult.projection,
        projectionError: projectionResult.error,
      };
    }
    if (projection.kind === "invalid") {
      return {
        fixtureMode: runtimeSourceState("invalid", "Supervisor invalid", projection.error + " No runtime or demo packets are shown."),
        packets: [],
        projection: null,
        projectionError: projection.error,
      };
    }
    const packetIds = projection.packets.map((packet) => packet.packetId);
    const packetContradiction = canonicalStaleProjectionTruth(verifiedProjection)
      ? staleRuntimeContradiction(verifiedProjection) ?? packetIdentityContradiction(verifiedProjection, packetIds)
      : populatedRuntimeContradiction(verifiedProjection, packetIds);
    if (packetContradiction) {
      return {
        fixtureMode: runtimeSourceState("invalid", "Supervisor invalid", `${packetContradiction} No runtime or demo packets are shown.`),
        packets: [],
        projection: null,
        projectionError: packetContradiction,
      };
    }
    return {
      fixtureMode: runtimeSourceState(
        canonicalStaleProjectionTruth(verifiedProjection) ? "stale" : "runtime",
        canonicalStaleProjectionTruth(verifiedProjection) ? "Supervisor stale read-only" : "Supervisor runtime",
        canonicalStaleProjectionTruth(verifiedProjection)
          ? "Persisted supervisor WorkPacketV0 rows are stale and read-only; no provider, worker, GitHub, or Obsidian calls are made by this route."
          : "Persisted supervisor WorkPacketV0 rows only. No provider, worker, GitHub, or Obsidian calls are made by this route.",
      ),
      packets: projection.packets,
      projection: projectionResult.projection,
      projectionError: projectionResult.error,
    };
  } catch (error) {
    const workPacketError = error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "Supervisor WorkPacketV0 state could not be read.";
    return {
      fixtureMode: runtimeSourceState("unavailable", "Supervisor unavailable", "Supervisor WorkPacketV0 state could not be read; no demo packets are substituted."),
      packets: [],
      projection: null,
      projectionError: workPacketError,
    };
  }
}

export async function loadPipelineCockpitPacket(packetId: unknown): Promise<PipelineCockpitPacketDetailLoad> {
  const canonicalPacketId = toCanonicalRuntimePacketId(packetId);
  if (!canonicalPacketId) {
    return {
      fixtureMode: runtimeSourceState("invalid", "Supervisor packet invalid", "Malformed runtime packet identity; no supervisor lookup or demo packet substitution was attempted."),
      packet: null,
      workGraph: null,
    };
  }
  const projectionResult = await loadPipelineDashboardProjection();
  if (projectionResult.error) {
    return { fixtureMode: projectionReadErrorSourceState(projectionResult.error), packet: null, workGraph: null };
  }
  const projectionRuntimeError = runtimeProjectionError(projectionResult.projection, "detail");
  if (projectionRuntimeError) {
    return {
      fixtureMode: runtimeSourceState(
        projectionRuntimeError.kind,
        projectionRuntimeError.kind === "invalid" ? "Supervisor packet invalid" : "Supervisor unavailable",
        `${projectionRuntimeError.summary} No demo packet was substituted.`,
      ),
      packet: null,
      workGraph: null,
    };
  }
  try {
    const projection = projectSupervisorWorkPacketsToCockpitPackets([await readWorkPacket(canonicalPacketId)]);
    if (projection.kind === "invalid") {
      return { fixtureMode: runtimeSourceState("invalid", "Supervisor packet invalid", projection.error + " No demo packet was substituted."), packet: null, workGraph: null };
    }
    const [supervisorPacket] = projection.kind === "runtime" ? projection.packets : [];
    if (!supervisorPacket || supervisorPacket.packetId !== canonicalPacketId) {
      return { fixtureMode: runtimeSourceState("invalid", "Supervisor packet invalid", "Supervisor returned a packet that did not match the requested runtime identity; no demo packet was substituted."), packet: null, workGraph: null };
    }
    const detailProjectionContradictionMessage = detailProjectionContradiction(projectionResult.projection, canonicalPacketId, supervisorPacket);
    if (detailProjectionContradictionMessage) {
      return { fixtureMode: runtimeSourceState("invalid", "Supervisor packet invalid", `${detailProjectionContradictionMessage} No demo packet was substituted.`), packet: null, workGraph: null };
    }
    return {
      fixtureMode: runtimeSourceState(
        projectionResult.projection && canonicalStaleProjectionTruth(projectionResult.projection) ? "stale" : "runtime",
        projectionResult.projection && canonicalStaleProjectionTruth(projectionResult.projection) ? "Supervisor stale read-only" : "Supervisor runtime",
        projectionResult.projection && canonicalStaleProjectionTruth(projectionResult.projection)
          ? "This detail is a stale, read-only supervisor WorkPacketV0 projection resolved by packet identity."
          : "This detail is a read-only supervisor WorkPacketV0 projection resolved by packet identity.",
      ),
      packet: supervisorPacket,
      workGraph: projectionResult.projection?.selectedPacketDetails.find((detail) => detail.packetId === canonicalPacketId)?.workGraph ?? null,
    };
  } catch (error) {
    const errorMessage = error && typeof error === "object" && "message" in error
      ? String(error.message)
      : String(error);
    const missing = /\(404\)/.test(errorMessage);
    return {
      fixtureMode: runtimeSourceState(missing ? "invalid" : "unavailable", missing ? "Supervisor packet missing" : "Supervisor unavailable", missing
        ? "Supervisor has no WorkPacketV0 detail for this packet identity; no demo packet was substituted."
        : "Supervisor WorkPacketV0 detail could not be read; no demo packet was substituted."),
      packet: null,
      workGraph: null,
    };
  }
}

function runtimeSourceState(kind: PipelineRuntimeSourceState["kind"], label: string, summary: string): PipelineRuntimeSourceState {
  return { kind, label, summary, matrixRows: 0, fixtureCatalogEntries: 0, canSatisfyLiveProof: false };
}

function projectionReadErrorSourceState(error: string): PipelineRuntimeSourceState {
  const invalid = /invalid|malformed/i.test(error);
  return runtimeSourceState(
    invalid ? "invalid" : "unavailable",
    invalid ? "Supervisor invalid" : "Supervisor unavailable",
    `Supervisor projection could not be read; ${invalid ? "the returned state was invalid" : "the supervisor may be unavailable"}. No runtime or demo packets are shown.`,
  );
}

type CanonicalRuntimePacketId = string & { readonly __canonicalRuntimePacketId: unique symbol };

function toCanonicalRuntimePacketId(packetId: unknown): CanonicalRuntimePacketId | null {
  if (typeof packetId !== "string") {
    return null;
  }
  const normalizedPacketId = packetId.trim().toLowerCase();
  if (normalizedPacketId.startsWith("fixture:") || normalizedPacketId.startsWith("demo:")) {
    return null;
  }
  return packetId.trim() === packetId &&
    packetId.length > 0 &&
    packetId.length <= 200 &&
    !/[\s/\\\0]/.test(packetId)
    ? packetId as CanonicalRuntimePacketId
    : null;
}

function runtimeProjectionError(projection: PipelineDashboardProjectionV0 | null, mode: "list" | "detail"): { kind: "invalid" | "unavailable"; summary: string } | null {
  if (!hasProjectionProofShape(projection)) {
    return { kind: "invalid", summary: "Supervisor projection is missing or malformed; no runtime or demo packets are shown." };
  }
  const freshness = projectionFreshnessState(projection);
  if (freshness?.kind === "invalid") {
    return { kind: "invalid", summary: freshness.summary };
  }
  if (freshness?.kind === "stale" && !canonicalStaleProjectionTruth(projection)) {
    return { kind: "invalid", summary: freshness.summary };
  }
  if (canonicalStaleProjectionTruth(projection) && freshness?.kind !== "stale") {
    return { kind: "invalid", summary: "Supervisor projection stale flags contradict fresh timestamps; no packets are shown." };
  }
  if (projection.fixtureMode?.enabled === true || projection.truthSummary?.fixtureBacked === true || projection.sourceLabel === "fixture") {
    return { kind: "invalid", summary: "Supervisor projection is fixture-backed; normal runtime mode refuses fixture truth." };
  }
  if (projection.backendReachability?.state === "unavailable" || projection.truthSummary?.backendUnavailable === true) {
    return { kind: "unavailable", summary: "Supervisor projection reports unavailable runtime state; no packets are shown." };
  }
  if (projection.backendReachability?.state !== "reachable") {
    return { kind: "unavailable", summary: "Supervisor projection reachability is not proven reachable; no packets are shown." };
  }
  if (mode === "detail" && projection.truthSummary?.backendEmpty === true) {
    return { kind: "invalid", summary: "Supervisor detail projection claims the backend is empty; no detail packet is trusted." };
  }
  if (mode === "detail" && !canonicalLiveProjectionTruth(projection) && !canonicalStaleProjectionTruth(projection)) {
    return { kind: "invalid", summary: "Supervisor detail requires canonical live or stale projection truth and proven reachability." };
  }
  return null;
}

function staleRuntimeContradiction(projection: PipelineDashboardProjectionV0): string | null {
  if (!canonicalStaleProjectionTruth(projection)) {
    return "Supervisor projection stale state is contradictory.";
  }
  if (projection.fixtureMode?.enabled === true || projection.truthSummary?.fixtureBacked === true || projection.sourceLabel === "fixture") {
    return "Supervisor projection is both stale and fixture-backed; no packets are shown.";
  }
  if (projection.backendReachability?.state !== "reachable" || projection.truthSummary?.backendUnavailable === true) {
    return "Supervisor stale projection does not prove backend reachability; no packets are shown.";
  }
  return null;
}

function projectionFreshnessState(projection: PipelineDashboardProjectionV0): { kind: "invalid" | "stale"; summary: string } | null {
  const generatedAt = Date.parse(projection.generatedAt);
  const sourceUpdatedAt = Date.parse(projection.sourceUpdatedAt);
  if (!Number.isFinite(generatedAt) || !Number.isFinite(sourceUpdatedAt) || !Number.isFinite(projection.staleAfterSeconds) || projection.staleAfterSeconds <= 0) {
    return { kind: "invalid", summary: "Supervisor projection freshness timestamps are malformed; normal runtime mode refuses stale packet truth." };
  }
  if (projection.staleAfterSeconds > Number.MAX_SAFE_INTEGER / 1000) {
    return { kind: "invalid", summary: "Supervisor projection freshness window is overflowed; normal runtime mode refuses stale packet truth." };
  }
  const now = Date.now();
  if (generatedAt - now > 1000 || sourceUpdatedAt - now > 1000) {
    return { kind: "invalid", summary: "Supervisor projection freshness timestamps are future-dated; normal runtime mode refuses contradictory packet truth." };
  }
  if (sourceUpdatedAt - generatedAt > 1000) {
    return { kind: "invalid", summary: "Supervisor projection source timestamp is newer than the projection timestamp; normal runtime mode refuses contradictory packet truth." };
  }
  if (now - sourceUpdatedAt > projection.staleAfterSeconds * 1000) {
    return { kind: "stale", summary: "Supervisor projection timestamps are stale; normal runtime mode refuses stale packet truth unless canonical stale flags agree." };
  }
  return null;
}

function canonicalStaleProjectionTruth(projection: PipelineDashboardProjectionV0): boolean {
  return projection.sourceLabel === "stale" &&
    projection.freshnessState === "stale" &&
    projection.truthSummary.label === "stale" &&
    projection.truthSummary.stale === true &&
    projection.truthSummary.backendEmpty === false &&
    projection.truthSummary.fixtureBacked === false &&
    projection.truthSummary.backendUnavailable === false &&
    projection.backendReachability.state === "reachable" &&
    projection.fixtureMode.enabled === false &&
    projection.fixtureMode.canSatisfyLiveProof === false;
}

function canonicalLiveProjectionTruth(projection: PipelineDashboardProjectionV0): boolean {
  return projection.sourceLabel === "live" &&
    projection.freshnessState === "live" &&
    projection.truthSummary.label === "live" &&
    projection.truthSummary.fixtureBacked === false &&
    projection.truthSummary.stale === false &&
    projection.truthSummary.backendUnavailable === false &&
    projection.backendReachability.state === "reachable" &&
    projection.fixtureMode.enabled === false &&
    projection.fixtureMode.canSatisfyLiveProof === false;
}

function emptyRuntimeContradiction(projection: PipelineDashboardProjectionV0 | null): string | null {
  if (!projection) {
    return "Supervisor WorkPacket list returned zero rows without a canonical live projection.";
  }
  if (!canonicalEmptyProjectionTruth(projection)) {
    return "Supervisor WorkPacket list returned zero rows without canonical live empty-runtime truth and proven reachability.";
  }
  const emptyReasonContradiction = emptyRuntimeReasonContradiction(projection);
  if (emptyReasonContradiction) {
    return emptyReasonContradiction;
  }
  if (projection.workPackets.length > 0 || projection.selectedPacketDetails.length > 0) {
    return "Supervisor WorkPacket list returned zero rows while projection still contains packet identities.";
  }
  const stagePacketCount = projection.stageSummaries.reduce((sum, summary) => sum + summary.packetCount, 0);
  if (stagePacketCount > 0) {
    return "Supervisor WorkPacket list returned zero rows while projection stage summaries still count runtime packets.";
  }
  const queuePacketCount = projectionQueuePacketCount(projection);
  if (queuePacketCount > 0) {
    return "Supervisor WorkPacket list returned zero rows while queue summary still counts runtime packets.";
  }
  if (projection.truthSummary.backendUnavailable === true || projection.backendReachability.state !== "reachable") {
    return "Supervisor WorkPacket list returned zero rows but projection reachability is unavailable.";
  }
  if (projection.truthSummary.backendEmpty !== true) {
    return "Supervisor WorkPacket list returned zero rows but projection did not prove an empty runtime.";
  }
  return null;
}

function emptyRuntimeSummary(projection: PipelineDashboardProjectionV0 | null): string {
  if (!projection) {
    return "Supervisor returned zero persisted WorkPacketV0 rows; no demo packets are substituted.";
  }
  const reason = canonicalEmptyReason(projection.truthSummary.emptyReason ?? projection.queueSummary.emptyReason);
  if (reason === "healthy_empty") {
    return projection.truthSummary.summary || projection.queueSummary.summary || "Supervisor returned zero persisted WorkPacketV0 rows; no demo packets are substituted.";
  }
  return "Supervisor returned zero persisted WorkPacketV0 rows; no demo packets are substituted.";
}

function emptyRuntimeReasonContradiction(projection: PipelineDashboardProjectionV0): string | null {
  const truthReason = canonicalEmptyReason(projection.truthSummary.emptyReason);
  const queueReason = canonicalEmptyReason(projection.queueSummary.emptyReason);
  const effectiveReason = truthReason ?? queueReason;
  if (effectiveReason !== "healthy_empty") {
    return `Supervisor WorkPacket list returned zero rows but projection empty reason was ${effectiveReason ?? "missing"} instead of healthy_empty.`;
  }
  if (truthReason && queueReason && truthReason !== queueReason) {
    return `Supervisor WorkPacket list returned zero rows but projection empty reasons disagreed (${truthReason} vs ${queueReason}).`;
  }
  return null;
}

function canonicalEmptyReason(value: PipelineDashboardProjectionV0["truthSummary"]["emptyReason"]): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function canonicalEmptyProjectionTruth(projection: PipelineDashboardProjectionV0): boolean {
  return projection.sourceLabel === "live" &&
    projection.freshnessState === "live" &&
    projection.truthSummary.label === "live" &&
    projection.truthSummary.backendEmpty === true &&
    projection.truthSummary.fixtureBacked === false &&
    projection.truthSummary.stale === false &&
    projection.truthSummary.backendUnavailable === false &&
    projection.backendReachability.state === "reachable" &&
    projection.fixtureMode.enabled === false &&
    projection.fixtureMode.canSatisfyLiveProof === false;
}

function populatedRuntimeContradiction(projection: PipelineDashboardProjectionV0 | null, packetIds: readonly string[]): string | null {
  if (!projection) {
    return "Supervisor returned packets without a canonical live projection.";
  }
  if (!canonicalLiveProjectionTruth(projection)) {
    return "Supervisor returned packets without canonical live projection truth and proven reachability.";
  }
  if (projection.truthSummary.backendEmpty === true) {
    return "Supervisor returned packets while projection claims the backend is empty.";
  }
  return packetIdentityContradiction(projection, packetIds);
}

function packetIdentityContradiction(projection: PipelineDashboardProjectionV0, packetIds: readonly string[]): string | null {
  const invalidPacketId = packetIds.find((packetId) => !toCanonicalRuntimePacketId(packetId));
  if (invalidPacketId) {
    return `Supervisor returned malformed runtime packet identity ${invalidPacketId}.`;
  }
  const duplicatePacketId = firstDuplicate(packetIds);
  if (duplicatePacketId) {
    return `Supervisor returned duplicate runtime packet identity ${duplicatePacketId}.`;
  }
  const rawProjectionPacketIds = projection.workPackets.map((packet) => packet.packetId);
  const invalidProjectionPacketId = rawProjectionPacketIds.find((packetId) => !toCanonicalRuntimePacketId(packetId));
  if (invalidProjectionPacketId) {
    return `Supervisor projection contains malformed runtime packet identity ${invalidProjectionPacketId}.`;
  }
  const duplicateProjectionPacketId = firstDuplicate(rawProjectionPacketIds);
  if (duplicateProjectionPacketId) {
    return `Supervisor projection contains duplicate runtime packet identity ${duplicateProjectionPacketId}.`;
  }
  const duplicateProjectionDetailId = firstDuplicate(projection.selectedPacketDetails.map((detail) => detail.packetId));
  if (duplicateProjectionDetailId) {
    return `Supervisor projection contains duplicate detail identity ${duplicateProjectionDetailId}.`;
  }
  const projectionPacketIds = new Set(rawProjectionPacketIds);
  const packetIdSet = new Set(packetIds);
  const missingPacketId = packetIds.find((packetId) => !projectionPacketIds.has(packetId));
  if (missingPacketId) {
    return `Supervisor projection omitted runtime packet identity ${missingPacketId}.`;
  }
  const extraProjectionPacketId = rawProjectionPacketIds.find((packetId) => !packetIdSet.has(packetId));
  if (extraProjectionPacketId) {
    return `Supervisor projection included runtime packet identity ${extraProjectionPacketId} that was absent from the WorkPacket list.`;
  }
  const extraProjectionDetailId = projection.selectedPacketDetails.find((detail) => !packetIdSet.has(detail.packetId))?.packetId;
  if (extraProjectionDetailId) {
    return `Supervisor projection included detail identity ${extraProjectionDetailId} that was absent from the WorkPacket list.`;
  }
  return null;
}

function hasProjectionProofShape(projection: unknown): projection is PipelineDashboardProjectionV0 {
  try {
    if (!projection || typeof projection !== "object") return false;
    const candidate = projection as Partial<PipelineDashboardProjectionV0>;
    if (!candidate.truthSummary || typeof candidate.truthSummary !== "object") return false;
    if (!candidate.backendReachability || typeof candidate.backendReachability !== "object") return false;
    if (!candidate.fixtureMode || typeof candidate.fixtureMode !== "object") return false;
    if (!candidate.queueSummary || typeof candidate.queueSummary !== "object") return false;
    return Array.isArray(candidate.workPackets)
      && Array.isArray(candidate.selectedPacketDetails)
      && Array.isArray(candidate.stageSummaries);
  } catch {
    return false;
  }
}

function projectionQueuePacketCount(projection: PipelineDashboardProjectionV0): number {
  const queueCounts = [
    projection.queueSummary.activeCount,
    projection.queueSummary.dispatchableCount,
    projection.queueSummary.blockedCount,
    projection.queueSummary.gatedCount,
    projection.queueSummary.closedCount,
    projection.queueSummary.staleCount,
    projection.queueSummary.refillingCount,
    projection.queueSummary.unknownCount,
  ];
  return queueCounts.reduce<number>((sum, count) => sum + (typeof count === "number" && count > 0 ? count : 0), 0);
}

function firstDuplicate(values: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      return value;
    }
    seen.add(value);
  }
  return null;
}

function detailProjectionContradiction(
  projection: PipelineDashboardProjectionV0 | null,
  packetId: CanonicalRuntimePacketId,
  supervisorPacket: PipelineRuntimePacket,
): string | null {
  if (!projection) {
    return "Supervisor detail projection is missing.";
  }
  const projectionPackets = projection.workPackets.filter((packet) => packet.packetId === packetId);
  if (projectionPackets.length !== 1) {
    return "Supervisor projection did not contain exactly one matching runtime packet identity.";
  }
  const projectionPacket = projectionPackets[0];
  if (projectionPacket.currentStage !== supervisorPacket.currentStage || projectionPacket.status !== supervisorPacket.status) {
    return "Supervisor detail disagrees with the verified projection stage or status for the requested runtime identity.";
  }
  const details = projection.selectedPacketDetails.filter((detail) => detail.packetId === packetId);
  if (details.length > 1) {
    return "Supervisor projection contained duplicate selected detail identities.";
  }
  const [detail] = details;
  if (!detail) {
    return null;
  }
  if (detail.currentStage !== projectionPacket.currentStage || detail.status !== projectionPacket.status || detail.truthLabel !== projectionPacket.truthLabel) {
    return "Supervisor selected detail disagrees with the verified projection packet for the requested runtime identity.";
  }
  if (detail.parentPacketId && detail.parentPacketId !== packetId) {
    return "Supervisor selected detail references a different parent packet identity.";
  }
  if (!Array.isArray(detail.sourceRefs) || !Array.isArray(detail.evidenceRefs)) {
    return "Supervisor selected detail is incomplete.";
  }
  return null;
}

async function loadPipelineDashboardProjection(): Promise<{ projection: PipelineDashboardProjectionV0 | null; error: string | null }> {
  try {
    const projection = await readPipelineDashboardProjection();
    if (!projection) {
      return {
        projection: null,
        error: "Invalid projection payload",
      };
    }
    return {
      projection,
      error: null,
    };
  } catch (error) {
    return {
      projection: null,
      error: error instanceof Error ? error.message : "Projection fetch failed.",
    };
  }
}
