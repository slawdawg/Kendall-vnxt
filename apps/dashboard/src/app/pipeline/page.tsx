import { Shell } from "../../components/shell";
import { PipelineCockpit } from "../../components/pipeline/pipeline-cockpit";
import {
  selectedPipelinePacket,
} from "../../lib/pipeline-fixtures";
import { loadPipelineCockpitPackets } from "../../lib/pipeline-packet-loader";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const { fixtureMode, packets } = await loadPipelineCockpitPackets();
  const selectedPacket = packets[0] ?? selectedPipelinePacket;
  return (
    <Shell compactHeader realtimeRefresh={false} wide>
      <PipelineCockpit
        fixtureMode={fixtureMode}
        packets={packets}
        selectedPacket={selectedPacket}
      />
    </Shell>
  );
}
