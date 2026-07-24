import { ServerShell as Shell } from "../../../components/server-shell";
import { PipelineCockpit } from "../../../components/pipeline/pipeline-cockpit";
import { selectedManagerExecutionLaneSummary } from "../../../lib/pipeline/manager-execution-lane-summary";
import { pipelineCockpitPackets } from "../../../lib/pipeline-fixtures";

export const dynamic = "force-dynamic";

const demoSourceState = {
  kind: "demo" as const,
  label: "Demo fixtures",
  summary: "Explicit demo mode. Static fixture packets are isolated from supervisor runtime data and cannot satisfy live proof or invoke live authority.",
  matrixRows: 0,
  fixtureCatalogEntries: pipelineCockpitPackets.length,
  canSatisfyLiveProof: false,
};

export default function PipelineDemoPage() {
  const packets = pipelineCockpitPackets.map((packet) => ({
    ...packet,
    sourceKind: "demo-fixture" as const,
    sourceId: packet.fixtureId,
  }));
  return (
    <Shell compactHeader realtimeRefresh={false} wide>
      <PipelineCockpit
        fixtureMode={demoSourceState}
        managerExecutionLane={selectedManagerExecutionLaneSummary}
        packets={packets}
        projection={null}
        projectionError={null}
        selectedPacket={packets[0] ?? null}
      />
    </Shell>
  );
}
