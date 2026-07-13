import { notFound } from "next/navigation";
import { Shell } from "../../../../components/shell";
import { PacketDetailPage } from "../../../../components/pipeline/packet-detail-page";
import { loadPipelineCockpitPacket } from "../../../../lib/pipeline-packet-loader";

export const dynamic = "force-dynamic";

export default async function PipelinePacketPage({
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
  const { fixtureMode, packet } = await loadPipelineCockpitPacket(decodedPacketId);

  if (!packet) {
    notFound();
  }

  return (
    <Shell compactHeader realtimeRefresh={false} wide>
      <PacketDetailPage packet={packet} sourceState={fixtureMode} />
    </Shell>
  );
}
