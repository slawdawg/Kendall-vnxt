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
      fixtureMode: runtimeSourceState("unavailable", "Supervisor unavailable", "Supervisor projection could not be read; no runtime or demo packets are shown."),
      packets: [],
      projection: null,
      projectionError: projectionResult.error,
    };
  }
  const projectionRuntimeError = runtimeProjectionError(projectionResult.projection);
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
      return {
        fixtureMode: runtimeSourceState("empty", "Supervisor empty", "Supervisor is reachable but has no persisted WorkPacketV0 rows; no demo packets are substituted."),
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
    return {
      fixtureMode: runtimeSourceState("runtime", "Supervisor runtime", "Persisted supervisor WorkPacketV0 rows only. No provider, worker, GitHub, or Obsidian calls are made by this route."),
      packets: projection.packets,
      projection: projectionResult.projection,
      projectionError: projectionResult.error,
    };
  } catch {
    return {
      fixtureMode: runtimeSourceState("unavailable", "Supervisor unavailable", "Supervisor WorkPacketV0 state could not be read; no demo packets are substituted."),
      packets: [],
      projection: projectionResult.projection,
      projectionError: projectionResult.error,
    };
  }
}

export async function loadPipelineCockpitPacket(packetId: string): Promise<PipelineCockpitPacketDetailLoad> {
  try {
    const projection = projectSupervisorWorkPacketsToCockpitPackets([await getWorkPacket(packetId)]);
    if (projection.kind === "invalid") {
      return { fixtureMode: runtimeSourceState("invalid", "Supervisor packet invalid", projection.error + " No demo packet was substituted."), packet: null };
    }
    const [supervisorPacket] = projection.kind === "runtime" ? projection.packets : [];
    if (!supervisorPacket || supervisorPacket.packetId !== packetId) {
      return { fixtureMode: runtimeSourceState("invalid", "Supervisor packet invalid", "Supervisor returned a packet that did not match the requested runtime identity; no demo packet was substituted."), packet: null };
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

function runtimeProjectionError(projection: PipelineDashboardProjectionV0 | null): { kind: "invalid" | "unavailable"; summary: string } | null {
  if (!projection) {
    return null;
  }
  if (projection.fixtureMode?.enabled === true || projection.truthSummary?.fixtureBacked === true || projection.sourceLabel === "fixture") {
    return { kind: "invalid", summary: "Supervisor projection is fixture-backed; normal runtime mode refuses fixture truth." };
  }
  if (projection.backendReachability?.state === "unavailable" || projection.truthSummary?.backendUnavailable === true) {
    return { kind: "unavailable", summary: "Supervisor projection reports unavailable runtime state; no packets are shown." };
  }
  return null;
}

async function loadPipelineDashboardProjection(): Promise<{ projection: PipelineDashboardProjectionV0 | null; error: string | null }> {
  try {
    return {
      projection: await getPipelineDashboardProjection(),
      error: null,
    };
  } catch (error) {
    return {
      projection: null,
      error: error instanceof Error ? error.message : "Projection fetch failed.",
    };
  }
}
