import { Shell } from "../../components/shell";
import { PipelineCockpit } from "../../components/pipeline/pipeline-cockpit";
import { selectedManagerExecutionLaneSummary } from "../../lib/pipeline/manager-execution-lane-summary";
import { loadPipelineCockpitPackets } from "../../lib/pipeline-packet-loader";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const { fixtureMode, packets, projection, projectionError } = await loadPipelineCockpitPackets();
  const selectedPacket = packets[0] ?? null;
  return (
    <Shell compactHeader realtimeRefresh={false} wide>
      <PipelineCockpit
        fixtureMode={fixtureMode}
        managerExecutionLane={selectedManagerExecutionLaneSummary}
        packets={packets}
        projection={projection}
        projectionError={projectionError}
        selectedPacket={selectedPacket}
      />
    </Shell>
  );
}
