import { notFound } from "next/navigation";
import { Shell } from "../../../../components/shell";
import { PacketDetailPage } from "../../../../components/pipeline/packet-detail-page";
import { LanPacketDetailPage } from "../../../../components/pipeline/lan-packet-detail-page";
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
  if (process.env.KENDALL_LAN_AUTH_ENABLED === "true") {
    return <LanPacketDetailPage packetId={decodedPacketId} />;
  }
  const { fixtureMode, packet, workGraph } = await loadPipelineCockpitPacket(decodedPacketId);

  if (!packet) {
    notFound();
  }

  return (
    <Shell compactHeader realtimeRefresh={false} wide>
      <PacketDetailPage packet={packet} sourceState={fixtureMode} workGraph={workGraph} />
    </Shell>
  );
}
