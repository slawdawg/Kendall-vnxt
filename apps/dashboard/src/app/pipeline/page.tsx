import { Shell } from "../../components/shell";
import { PipelineCockpit } from "../../components/pipeline/pipeline-cockpit";
import {
  pipelineFixtureMode,
  pipelineCockpitPackets,
  pipelineFixtureScenarios,
  pipelineGoldenPathSnapshots,
  pipelineSourceBoundaryChecklist,
  pipelineSourceRail,
  selectedPipelinePacket,
} from "../../lib/pipeline-fixtures";

export default function PipelinePage() {
  return (
    <Shell realtimeRefresh={false} wide>
      <PipelineCockpit
        fixtureMode={pipelineFixtureMode}
        goldenPathSnapshots={pipelineGoldenPathSnapshots}
        packets={pipelineCockpitPackets}
        scenarios={pipelineFixtureScenarios}
        selectedPacket={selectedPipelinePacket}
        sourceBoundaries={pipelineSourceBoundaryChecklist}
        sources={pipelineSourceRail}
      />
    </Shell>
  );
}
