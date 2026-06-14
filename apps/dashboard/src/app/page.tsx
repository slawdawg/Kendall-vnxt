import { Shell } from "../components/shell";
import { LiveFeed } from "../components/live-feed";
import { MonitoringHome } from "../components/monitoring-home";
import { PageIntro } from "../components/page-intro";
import { buildNavStats } from "../lib/nav-stats";
import { getRunStatus, getWorkItems } from "../lib/supervisor";

export default async function Home() {
  const [status, items] = await Promise.all([getRunStatus(), getWorkItems()]);
  const navStats = buildNavStats(items);

  return (
    <Shell navStats={navStats}>
      <PageIntro
        eyebrow="Mission Control"
        title="Monitoring"
        description="Watch active work, attention needs, failed or stale states, and recent evidence before opening any control surface."
        metrics={[
          ["Mode", status.mode],
          ["Queued", String(status.queueCount)],
          ["Active", String(status.activeCount)],
          ["Blocked", String(status.blockedCount)],
        ].map(([label, value]) => ({ label, value }))}
      />
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <MonitoringHome status={status} items={items} />
        <LiveFeed />
      </section>
    </Shell>
  );
}
