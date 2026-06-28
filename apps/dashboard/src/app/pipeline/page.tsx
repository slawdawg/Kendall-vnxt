import { Shell } from "../../components/shell";
import { PipelineCockpit } from "../../components/pipeline/pipeline-cockpit";
import {
  pipelineCockpitPackets,
  pipelineFixtureMode,
  selectedPipelinePacket,
} from "../../lib/pipeline-fixtures";

export const dynamic = "force-dynamic";

export default function PipelinePage() {
  const packets = pipelineCockpitPackets;
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
