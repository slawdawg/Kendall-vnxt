import { ServerShell as Shell } from "../../components/server-shell";
import { PipelineCockpit } from "../../components/pipeline/pipeline-cockpit";
import { LanPipelinePage } from "../../components/pipeline/lan-pipeline-page";
import { loadPipelineCockpitPackets } from "../../lib/pipeline-packet-loader";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  if (process.env.KENDALL_LAN_AUTH_ENABLED === "true") {
    return <LanPipelinePage lanAuthEnabled />;
  }
  const { fixtureMode, canonicalPackets, operationalTruth, operationalProjection, projectionError } = await loadPipelineCockpitPackets();
  return (
    <Shell compactHeader realtimeRefresh={false} wide>
      <PipelineCockpit
        fixtureMode={fixtureMode}
        canonicalPackets={canonicalPackets}
        operationalTruth={operationalTruth}
        operationalProjection={operationalProjection}
        projectionError={projectionError}
      />
    </Shell>
  );
}
