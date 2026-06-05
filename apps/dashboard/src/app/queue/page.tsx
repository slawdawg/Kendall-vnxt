import { PageIntro } from "../../components/page-intro";
import { Shell } from "../../components/shell";
import { QueueBrowser } from "../../components/queue-browser";
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
      <QueueBrowser items={items} savedViews={savedViews} />
    </Shell>
  );
}
