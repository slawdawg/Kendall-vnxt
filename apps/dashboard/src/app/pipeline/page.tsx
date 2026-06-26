import { Shell } from "../../components/shell";
import { PipelineCockpit } from "../../components/pipeline/pipeline-cockpit";
import {
  pipelineFixtureMode,
  pipelineCockpitPackets,
  selectedPipelinePacket,
} from "../../lib/pipeline-fixtures";

export default function PipelinePage() {
  return (
    <Shell compactHeader realtimeRefresh={false} wide>
      <PipelineCockpit
        fixtureMode={pipelineFixtureMode}
        packets={pipelineCockpitPackets}
        selectedPacket={selectedPipelinePacket}
      />
    </Shell>
  );
}
