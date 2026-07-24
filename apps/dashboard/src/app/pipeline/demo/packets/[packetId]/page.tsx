import { notFound } from "next/navigation";
import { ServerShell as Shell } from "../../../../../components/server-shell";
import { PacketDetailPage } from "../../../../../components/pipeline/packet-detail-page";
import {
  pipelineCockpitPackets,
  pipelineGoldenPathSnapshots,
  pipelineSourceBoundaryChecklist,
} from "../../../../../lib/pipeline-fixtures";

export const dynamic = "force-dynamic";

const demoSourceState = {
  kind: "demo" as const,
  label: "Demo fixtures",
  summary: "Explicit demo detail. Static fixture data cannot satisfy live proof or invoke supervisor authority.",
  matrixRows: 0,
  fixtureCatalogEntries: pipelineCockpitPackets.length,
  canSatisfyLiveProof: false,
};

export default async function PipelineDemoPacketPage({
  params,
}: {
  params: Promise<{ packetId: string }>;
}) {
  const { packetId } = await params;
  let decodedPacketId: string;
  try {
    decodedPacketId = decodeURIComponent(packetId);
  } catch {
    notFound();
  }
  const fixturePacket = pipelineCockpitPackets.find((packet) => packet.packetId === decodedPacketId);
  if (!fixturePacket) {
    notFound();
  }
  const packet = {
    ...fixturePacket,
    sourceKind: "demo-fixture" as const,
    sourceId: fixturePacket.fixtureId,
  };
  const snapshot = pipelineGoldenPathSnapshots.find((candidate) => candidate.packetId === packet.packetId) ?? null;

  return (
    <Shell compactHeader realtimeRefresh={false} wide>
      <PacketDetailPage
        packet={packet}
        snapshot={snapshot}
        sourceBoundaries={pipelineSourceBoundaryChecklist}
        sourceState={demoSourceState}
      />
    </Shell>
  );
}
