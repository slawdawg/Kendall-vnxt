import { ServerShell as Shell } from "../../../components/server-shell";
import { PipelineCockpit } from "../../../components/pipeline/pipeline-cockpit";
import { selectedManagerExecutionLaneSummary } from "../../../lib/pipeline/manager-execution-lane-summary";
import { pipelineCockpitPackets } from "../../../lib/pipeline-fixtures";
import { dashboardDemoRoutesEnabled } from "../../../lib/dashboard-demo-routes";
import type { PipelineFixturePacketV1 } from "../../../lib/pipeline/pipeline-fixture-contract";
import { notFound } from "next/navigation";

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
  if (!dashboardDemoRoutesEnabled()) notFound();
  const packets: PipelineFixturePacketV1[] = pipelineCockpitPackets;
  return (
    <Shell compactHeader realtimeRefresh={false} wide>
      <PipelineCockpit
        fixtureMode={demoSourceState}
        managerExecutionLane={selectedManagerExecutionLaneSummary}
        packets={packets}
        operationalProjection={null}
        projectionError={null}
        selectedPacket={packets[0] ?? null}
      />
    </Shell>
  );
}
