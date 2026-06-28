import { Shell } from "../../components/shell";
import { PipelineCockpit } from "../../components/pipeline/pipeline-cockpit";
import {
  pipelineFixtureMode,
  projectSupervisorWorkPacketsToCockpitPackets,
  selectedPipelinePacket,
  type PipelineFixturePacket,
} from "../../lib/pipeline-fixtures";
import { pipelinePacketsWithPersistedGovernedWorkerEvidence } from "../../lib/pipeline-evidence-source";
import { getWorkPackets } from "../../lib/supervisor";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const { fixtureMode, packets } = await loadPipelineCockpitPackets();
  const selectedPacket = packets[0] ?? selectedPipelinePacket;
  return (
    <Shell compactHeader realtimeRefresh={false} wide>
      <PipelineCockpit
        fixtureMode={pipelineFixtureMode}
        packets={packets}
        selectedPacket={selectedPacket}
      />
    </Shell>
  );
}

type PipelineCockpitPacketLoad = {
  fixtureMode: typeof pipelineFixtureMode;
  packets: PipelineFixturePacket[];
};

async function loadPipelineCockpitPackets(): Promise<PipelineCockpitPacketLoad> {
  const fallbackPackets = pipelinePacketsWithPersistedGovernedWorkerEvidence();
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
