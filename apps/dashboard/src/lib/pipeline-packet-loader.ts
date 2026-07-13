import type {
  PipelineDashboardProjectionV0,
  PipelineOperationalActionRequestV0,
  PipelineOperationalActionApprovalRequestV0,
  PipelineOperationalActionApprovalV0,
  PipelineOperationalActionResultV0,
} from "@kendall/contracts";

import { getPipelineDashboardProjection, getWorkPacket, getWorkPackets } from "./supervisor";
import {
  projectSupervisorWorkPacketsToCockpitPackets,
  type PipelineRuntimePacket,
} from "./pipeline-supervisor-projector";
import {
  applyPipelineOperationalAction as applySupervisorPipelineOperationalAction,
  issuePipelineOperationalApproval as issueSupervisorPipelineOperationalApproval,
} from "./supervisor";

export async function requestPipelineOperationalApproval(
  payload: PipelineOperationalActionApprovalRequestV0,
): Promise<PipelineOperationalActionApprovalV0> {
  return issueSupervisorPipelineOperationalApproval(payload);
}

export async function applyPipelineOperationalAction(
  payload: PipelineOperationalActionRequestV0,
): Promise<PipelineOperationalActionResultV0> {
  return applySupervisorPipelineOperationalAction(payload);
}

export type PipelineCockpitPacketLoad = {
  fixtureMode: PipelineRuntimeSourceState;
  packets: PipelineRuntimePacket[];
  projection: PipelineDashboardProjectionV0 | null;
  projectionError: string | null;
};

export type PipelineCockpitPacketDetailLoad = {
  fixtureMode: PipelineRuntimeSourceState;
  packet: PipelineRuntimePacket | null;
};

export type PipelineRuntimeSourceState = {
  kind: "runtime" | "empty" | "unavailable" | "invalid" | "demo";
  label: string;
  summary: string;
  matrixRows: number;
  fixtureCatalogEntries: number;
  canSatisfyLiveProof: boolean;
};

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
  try {
    const projection = projectSupervisorWorkPacketsToCockpitPackets(await getWorkPackets());
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
        fixtureMode: runtimeSourceState("empty", "Supervisor empty", "Supervisor returned zero persisted WorkPacketV0 rows; no demo packets are substituted."),
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
    const packetContradiction = populatedRuntimeContradiction(projectionResult.projection, projection.packets.map((packet) => packet.packetId));
    if (packetContradiction) {
      return {
        fixtureMode: runtimeSourceState("invalid", "Supervisor invalid", `${packetContradiction} No runtime or demo packets are shown.`),
        packets: [],
        projection: null,
        projectionError: packetContradiction,
      };
    }
    return {
      fixtureMode: runtimeSourceState("runtime", "Supervisor runtime", "Persisted supervisor WorkPacketV0 rows only. No provider, worker, GitHub, or Obsidian calls are made by this route."),
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
    };
  }
  const projectionResult = await loadPipelineDashboardProjection();
  if (projectionResult.error) {
    return { fixtureMode: projectionReadErrorSourceState(projectionResult.error), packet: null };
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
    };
  }
  try {
    const projection = projectSupervisorWorkPacketsToCockpitPackets([await getWorkPacket(canonicalPacketId)]);
    if (projection.kind === "invalid") {
      return { fixtureMode: runtimeSourceState("invalid", "Supervisor packet invalid", projection.error + " No demo packet was substituted."), packet: null };
    }
    const [supervisorPacket] = projection.kind === "runtime" ? projection.packets : [];
    if (!supervisorPacket || supervisorPacket.packetId !== canonicalPacketId) {
      return { fixtureMode: runtimeSourceState("invalid", "Supervisor packet invalid", "Supervisor returned a packet that did not match the requested runtime identity; no demo packet was substituted."), packet: null };
    }
    if (!projectionContainsPacketIdentity(projectionResult.projection, canonicalPacketId)) {
      return { fixtureMode: runtimeSourceState("invalid", "Supervisor packet invalid", "Supervisor projection did not contain the requested runtime identity; no demo packet was substituted."), packet: null };
    }
    return {
      fixtureMode: runtimeSourceState("runtime", "Supervisor runtime", "This detail is a read-only supervisor WorkPacketV0 projection resolved by packet identity."),
      packet: supervisorPacket,
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
  if (packetId.startsWith("fixture:")) {
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
  if (!projection) {
    return { kind: "invalid", summary: "Supervisor projection is missing or malformed; no runtime or demo packets are shown." };
  }
  const freshnessError = projectionFreshnessError(projection);
  if (freshnessError) {
    return { kind: "invalid", summary: freshnessError };
  }
  if (projection.fixtureMode?.enabled === true || projection.truthSummary?.fixtureBacked === true || projection.sourceLabel === "fixture") {
    return { kind: "invalid", summary: "Supervisor projection is fixture-backed; normal runtime mode refuses fixture truth." };
  }
  if (projection.truthSummary?.stale === true || projection.freshnessState === "stale" || projection.sourceLabel === "stale") {
    return { kind: "invalid", summary: "Supervisor projection is stale; normal runtime mode refuses stale packet truth." };
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
  if (mode === "detail" && !canonicalLiveProjectionTruth(projection)) {
    return { kind: "invalid", summary: "Supervisor detail requires canonical live projection truth and proven reachability." };
  }
  return null;
}

function projectionFreshnessError(projection: PipelineDashboardProjectionV0): string | null {
  const generatedAt = Date.parse(projection.generatedAt);
  const sourceUpdatedAt = Date.parse(projection.sourceUpdatedAt);
  if (!Number.isFinite(generatedAt) || !Number.isFinite(sourceUpdatedAt) || !Number.isFinite(projection.staleAfterSeconds) || projection.staleAfterSeconds <= 0) {
    return "Supervisor projection freshness timestamps are malformed; normal runtime mode refuses stale packet truth.";
  }
  if (projection.staleAfterSeconds > Number.MAX_SAFE_INTEGER / 1000) {
    return "Supervisor projection freshness window is overflowed; normal runtime mode refuses stale packet truth.";
  }
  const now = Date.now();
  if (generatedAt - now > 1000 || sourceUpdatedAt - now > 1000) {
    return "Supervisor projection freshness timestamps are future-dated; normal runtime mode refuses contradictory packet truth.";
  }
  if (sourceUpdatedAt - generatedAt > 1000) {
    return "Supervisor projection source timestamp is newer than the projection timestamp; normal runtime mode refuses contradictory packet truth.";
  }
  if (now - sourceUpdatedAt > projection.staleAfterSeconds * 1000) {
    return "Supervisor projection timestamps are stale; normal runtime mode refuses stale packet truth even when flags claim live.";
  }
  return null;
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
  if (projection.workPackets.length > 0 || projection.selectedPacketDetails.length > 0) {
    return "Supervisor WorkPacket list returned zero rows while projection still contains packet identities.";
  }
  if (projection.truthSummary.backendUnavailable === true || projection.backendReachability.state !== "reachable") {
    return "Supervisor WorkPacket list returned zero rows but projection reachability is unavailable.";
  }
  if (projection.truthSummary.backendEmpty !== true) {
    return "Supervisor WorkPacket list returned zero rows but projection did not prove an empty runtime.";
  }
  return null;
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
  const invalidPacketId = packetIds.find((packetId) => !toCanonicalRuntimePacketId(packetId));
  if (invalidPacketId) {
    return `Supervisor returned malformed runtime packet identity ${invalidPacketId}.`;
  }
  const duplicatePacketId = firstDuplicate(packetIds);
  if (duplicatePacketId) {
    return `Supervisor returned duplicate runtime packet identity ${duplicatePacketId}.`;
  }
  const projectionPacketIds = new Set(projection.workPackets.map((packet) => packet.packetId).filter((value): value is string => typeof value === "string"));
  const missingPacketId = packetIds.find((packetId) => !projectionPacketIds.has(packetId));
  if (missingPacketId) {
    return `Supervisor projection omitted runtime packet identity ${missingPacketId}.`;
  }
  return null;
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

function projectionContainsPacketIdentity(projection: PipelineDashboardProjectionV0 | null, packetId: CanonicalRuntimePacketId): boolean {
  return Boolean(projection && (
    projection.workPackets.some((packet) => packet.packetId === packetId) ||
    projection.selectedPacketDetails.some((detail) => detail.packetId === packetId)
  ));
}

async function loadPipelineDashboardProjection(): Promise<{ projection: PipelineDashboardProjectionV0 | null; error: string | null }> {
  try {
    const projection = await getPipelineDashboardProjection();
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
