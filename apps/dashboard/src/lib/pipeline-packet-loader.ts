import {
  pipelineCockpitPackets,
  pipelineFixtureMode,
  projectSupervisorWorkPacketsToCockpitPackets,
  type PipelineFixturePacket,
} from "./pipeline-fixtures";
import { getWorkPackets } from "./supervisor";

export type PipelineCockpitPacketLoad = {
  fixtureMode: typeof pipelineFixtureMode;
  packets: PipelineFixturePacket[];
};

export async function loadPipelineCockpitPackets(): Promise<PipelineCockpitPacketLoad> {
  const fallbackPackets = pipelineCockpitPackets;
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
      };
    }
    return {
      fixtureMode: {
        ...pipelineFixtureMode,
        label: "Supervisor packets",
        summary: "Read-only supervisor WorkPacketV0 projections are shown before the static fixture fallback. No provider, worker, GitHub, or Obsidian calls are made by this route.",
      },
      packets: mergePipelinePackets(supervisorPackets, fallbackPackets),
    };
  } catch {
    return {
      fixtureMode: {
        ...pipelineFixtureMode,
        label: "Supervisor unavailable",
        summary: "Supervisor WorkPacketV0 read failed; showing static fixture fallback without provider, worker, GitHub, or Obsidian calls.",
      },
      packets: fallbackPackets,
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
