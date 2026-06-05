import { Shell } from "../components/shell";
import { ControlPanel } from "../components/control-panel";
import { LiveFeed } from "../components/live-feed";
import { WorkGrid } from "../components/work-grid";
import { getRunStatus, getWorkItems } from "../lib/supervisor";

export default async function Home() {
  const [status, items] = await Promise.all([getRunStatus(), getWorkItems()]);

  return (
    <Shell>
      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Mode snapshot</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Mode", status.mode],
              ["Queued", String(status.queueCount)],
              ["Active", String(status.activeCount)],
              ["Blocked", String(status.blockedCount)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[1.25rem] border bg-white p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
                <p className="mt-2 text-2xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 max-w-3xl text-sm text-[var(--muted)]">{status.summary}</p>
        </div>
        <LiveFeed />
      </section>
      <ControlPanel />
      <WorkGrid items={items} />
    </Shell>
  );
}
