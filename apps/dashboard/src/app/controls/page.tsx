import { ControlPanel } from "../../components/control-panel";
import { OperatorProfilePanel } from "../../components/operator-profile-panel";
import { PageIntro } from "../../components/page-intro";
import { Shell } from "../../components/shell";
import { buildNavStats } from "../../lib/nav-stats";
import { getRunStatus, getWorkItems } from "../../lib/supervisor";

export default async function ControlsPage() {
  const [status, items] = await Promise.all([getRunStatus(), getWorkItems()]);
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
    </Shell>
  );
}
