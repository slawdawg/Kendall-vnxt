import { PageIntro } from "../../components/page-intro";
import { Shell } from "../../components/shell";
import { QueueBrowser } from "../../components/queue-browser";
import { RouteBrief } from "../../components/route-brief";
import { buildNavStats } from "../../lib/nav-stats";
import { getSavedOperatorViews, getWorkItems } from "../../lib/supervisor";

export default async function QueuePage() {
  const [items, savedViews] = await Promise.all([getWorkItems(), getSavedOperatorViews("queue")]);
  const navStats = buildNavStats(items);
  return (
    <Shell navStats={navStats}>
      <PageIntro
        eyebrow="Queue"
        title="Queue and lane backlog"
        description="Watch intake pressure, skim current step distribution, and take quick operator actions without leaving the board."
        metrics={[
          { label: "Total items", value: String(items.length) },
          { label: "Ready to start", value: String(items.filter((item) => item.state === "ready").length) },
          { label: "Blocked / Rework", value: String(items.filter((item) => ["blocked", "needs_rework"].includes(item.state)).length) },
          { label: "Done", value: String(items.filter((item) => item.state === "done").length) },
        ]}
      />
      <RouteBrief eyebrow="Triage order" title="Balance ready work against blocked load" action={{ href: "/active-work", label: "Open active work" }}>
        Use the queue to compare ready work, blocked/rework load, and active capacity before moving into deliberate controls.
      </RouteBrief>
      <QueueBrowser items={items} savedViews={savedViews} />
    </Shell>
  );
}

