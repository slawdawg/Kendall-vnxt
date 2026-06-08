import { ControlPanel } from "../../components/control-panel";
import { OperatorProfilePanel } from "../../components/operator-profile-panel";
import { PageIntro } from "../../components/page-intro";
import { RoutingFleetPanel } from "../../components/routing-fleet-panel";
import { Shell } from "../../components/shell";
import { buildNavStats } from "../../lib/nav-stats";
import { getRoutingLaneProfiles, getRunStatus, getWorkerRegistry, getWorkItems } from "../../lib/supervisor";

export default async function ControlsPage() {
  const [status, items, workers, laneProfiles] = await Promise.all([
    getRunStatus(),
    getWorkItems(),
    getWorkerRegistry(),
    getRoutingLaneProfiles(),
  ]);
  const navStats = buildNavStats(items);

  return (
    <Shell navStats={navStats}>
      <PageIntro
        eyebrow="Controls"
        title="Supervisor run controls"
        description={status.summary}
        metrics={[
          { label: "Mode", value: status.mode },
          { label: "Poll interval", value: `${status.pollIntervalSeconds}s` },
          { label: "Queued", value: String(status.queueCount) },
          { label: "Active", value: String(status.activeCount) },
        ]}
      />
      <OperatorProfilePanel />
      <ControlPanel />
      <RoutingFleetPanel workers={workers} laneProfiles={laneProfiles} />
    </Shell>
  );
}
