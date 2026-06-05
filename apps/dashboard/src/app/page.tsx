import { Shell } from "../components/shell";
import { ControlPanel } from "../components/control-panel";
import { CreateWorkItemForm } from "../components/create-work-item-form";
import { LiveFeed } from "../components/live-feed";
import { PageIntro } from "../components/page-intro";
import { WorkGrid } from "../components/work-grid";
import { buildNavStats } from "../lib/nav-stats";
import { getRunStatus, getWorkItems } from "../lib/supervisor";

export default async function Home() {
  const [status, items] = await Promise.all([getRunStatus(), getWorkItems()]);
  const navStats = buildNavStats(items);

  return (
    <Shell navStats={navStats}>
      <PageIntro
        eyebrow="Overview"
        title="Workflow command surface"
        description="Monitor queue pressure, watch operator traffic, and decide when work should move, pause, or branch into audit."
        metrics={[
          ["Mode", status.mode],
          ["Queued", String(status.queueCount)],
          ["Active", String(status.activeCount)],
          ["Blocked", String(status.blockedCount)],
        ].map(([label, value]) => ({ label, value }))}
      />
      <CreateWorkItemForm />
      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Mode snapshot</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              ["Done", String(status.doneCount)],
              ["Poll interval", `${status.pollIntervalSeconds}s`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
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
