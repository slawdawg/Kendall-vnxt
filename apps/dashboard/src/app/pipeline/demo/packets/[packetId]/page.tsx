import { notFound } from "next/navigation";
import { ServerShell as Shell } from "../../../../../components/server-shell";
import { PacketDetailFixturePage } from "../../../../../components/pipeline/packet-detail-fixture-page";
import {
  pipelineCockpitPackets,
  pipelineGoldenPathSnapshots,
  pipelineSourceBoundaryChecklist,
} from "../../../../../lib/pipeline-fixtures";
import { dashboardDemoRoutesEnabled } from "../../../../../lib/dashboard-demo-routes";
import type { PipelineFixturePacketV1 } from "../../../../../lib/pipeline/pipeline-fixture-contract";

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
  if (!dashboardDemoRoutesEnabled()) notFound();
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
  const packet: PipelineFixturePacketV1 = fixturePacket;
  const snapshot = pipelineGoldenPathSnapshots.find((candidate) => candidate.packetId === packet.packetId) ?? null;

  return (
    <Shell compactHeader realtimeRefresh={false} wide>
      <PacketDetailFixturePage
        packet={packet}
        snapshot={snapshot}
        sourceBoundaries={pipelineSourceBoundaryChecklist}
        sourceState={demoSourceState}
      />
    </Shell>
  );
}
