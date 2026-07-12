import { notFound } from "next/navigation";
import { Shell } from "../../../../components/shell";
import { PacketDetailPage } from "../../../../components/pipeline/packet-detail-page";
import {
  pipelineCockpitPackets,
  pipelineGoldenPathSnapshots,
  pipelineSourceBoundaryChecklist,
} from "../../../../lib/pipeline-fixtures";
import { loadPipelineCockpitPacket } from "../../../../lib/pipeline-packet-loader";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return pipelineCockpitPackets.map((packet) => ({
    packetId: packet.packetId,
  }));
}

export default async function PipelinePacketPage({
  params,
}: {
  params: Promise<{ packetId: string }>;
}) {
  const { packetId } = await params;
  const decodedPacketId = decodeURIComponent(packetId);
  const { packet } = await loadPipelineCockpitPacket(decodedPacketId);

  if (!packet) {
    notFound();
  }

  const snapshot = pipelineGoldenPathSnapshots.find((candidate) => candidate.packetId === packet.packetId) ?? null;

  return (
    <Shell compactHeader realtimeRefresh={false} wide>
      <PacketDetailPage packet={packet} snapshot={snapshot} sourceBoundaries={pipelineSourceBoundaryChecklist} />
    </Shell>
  );
}
