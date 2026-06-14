import { ActiveWorkBrowser } from "../../components/active-work-browser";
import { PageIntro } from "../../components/page-intro";
import { RouteBrief } from "../../components/route-brief";
import { Shell } from "../../components/shell";
import { buildNavStats } from "../../lib/nav-stats";
import { getSavedOperatorViews, getWorkItems } from "../../lib/supervisor";

export default async function ActiveWorkPage() {
  const [allItems, savedViews] = await Promise.all([getWorkItems(), getSavedOperatorViews("active-work")]);
  const items = allItems.filter((item) =>
    ["implementing", "validating", "reviewing", "awaiting_audit"].includes(item.state),
  );
  const navStats = buildNavStats(allItems);

  return (
    <Shell navStats={navStats}>
      <PageIntro
        eyebrow="Active work"
        title="In-flight implementation and review"
        description="Track what is actively moving, which items are approaching decision points, and where audit load is accumulating."
        metrics={[
          { label: "Active items", value: String(items.length) },
          { label: "Validating", value: String(items.filter((item) => item.state === "validating").length) },
          { label: "Reviewing", value: String(items.filter((item) => item.state === "reviewing").length) },
          { label: "Awaiting audit", value: String(items.filter((item) => item.state === "awaiting_audit").length) },
        ]}
      />
      <RouteBrief eyebrow="Watch order" title="Follow validating and review pressure first" action={{ href: "/attention", label: "Open attention" }}>
        Watch active items by decision pressure: validating, reviewing, and awaiting audit should be inspected before starting more queued work.
      </RouteBrief>
      <ActiveWorkBrowser items={items} savedViews={savedViews} />
    </Shell>
  );
}

