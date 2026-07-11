import type {
  PipelineDashboardProjectionV0,
  PipelineOperationalActionRequestV0,
  PipelineOperationalActionApprovalRequestV0,
  PipelineOperationalActionApprovalV0,
  PipelineOperationalActionResultV0,
} from "@kendall/contracts";

import {
  pipelineCockpitPackets,
  pipelineFixtureMode,
  projectSupervisorWorkPacketsToCockpitPackets,
  type PipelineFixturePacket,
} from "./pipeline-fixtures";
import { getPipelineDashboardProjection, getWorkPackets } from "./supervisor";
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
  fixtureMode: typeof pipelineFixtureMode;
  packets: PipelineFixturePacket[];
  projection: PipelineDashboardProjectionV0 | null;
  projectionError: string | null;
};

export async function loadPipelineCockpitPackets(): Promise<PipelineCockpitPacketLoad> {
  const fallbackPackets = pipelineCockpitPackets;
  const projectionResult = await loadPipelineDashboardProjection();
  try {
    const supervisorPackets = projectSupervisorWorkPacketsToCockpitPackets(await getWorkPackets());
    if (supervisorPackets.length === 0) {
      return {
        fixtureMode: {
          ...pipelineFixtureMode,
          label: "Supervisor empty",
          summary: "Supervisor returned no WorkPacketV0 rows; showing static fixture fallback without provider, worker, GitHub, or Obsidian calls.",
        },
        packets: fallbackPackets,
        projection: projectionResult.projection,
        projectionError: projectionResult.error,
      };
    }
    return {
      fixtureMode: {
        ...pipelineFixtureMode,
        label: "Supervisor packets",
        summary: "Read-only supervisor WorkPacketV0 projections are shown before the static fixture fallback. No provider, worker, GitHub, or Obsidian calls are made by this route.",
      },
      packets: mergePipelinePackets(supervisorPackets, fallbackPackets),
      projection: projectionResult.projection,
      projectionError: projectionResult.error,
    };
  } catch {
    return {
      fixtureMode: {
        ...pipelineFixtureMode,
        label: "Supervisor unavailable",
        summary: "Supervisor WorkPacketV0 read failed; showing static fixture fallback without provider, worker, GitHub, or Obsidian calls.",
      },
      packets: fallbackPackets,
      projection: projectionResult.projection,
      projectionError: projectionResult.error,
    };
  }
}

function mergePipelinePackets(
  primaryPackets: readonly PipelineFixturePacket[],
  fallbackPackets: readonly PipelineFixturePacket[]
): PipelineFixturePacket[] {
  const packetById = new Map<string, PipelineFixturePacket>();
  for (const packet of [...primaryPackets, ...fallbackPackets]) {
    if (!packetById.has(packet.packetId)) {
      packetById.set(packet.packetId, packet);
    }
  }
  return Array.from(packetById.values());
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
