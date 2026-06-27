import { Shell } from "../../components/shell";
import { PipelineCockpit } from "../../components/pipeline/pipeline-cockpit";
import {
  pipelineFixtureMode,
  selectedPipelinePacket,
} from "../../lib/pipeline-fixtures";
import { pipelinePacketsWithPersistedGovernedWorkerEvidence } from "../../lib/pipeline-evidence-source";

export const dynamic = "force-dynamic";

export default function PipelinePage() {
  const packets = pipelinePacketsWithPersistedGovernedWorkerEvidence();
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
