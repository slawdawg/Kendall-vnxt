import { AttentionBrowser } from "../../components/attention-browser";
import { PageIntro } from "../../components/page-intro";
import { RouteBrief } from "../../components/route-brief";
import { Shell } from "../../components/shell";
import { buildNavStats } from "../../lib/nav-stats";
import { getSavedOperatorViews, getWorkItems } from "../../lib/supervisor";

export default async function AttentionPage() {
  const [items, savedViews] = await Promise.all([getWorkItems(), getSavedOperatorViews("attention")]);
  const attentionItems = items.filter((item) => item.needsAttention);
  const navStats = buildNavStats(items);
  const selfDetectedIssues = attentionItems.filter((item) => item.selfDetectedIssue);

  return (
    <Shell navStats={navStats}>
      <PageIntro
        eyebrow="Attention"
        title="Needs-attention queue"
        description="Review blocked, stale, unowned, or explicitly escalated work before it slips into invisible drift."
        metrics={[
          { label: "Attention items", value: String(attentionItems.length) },
          { label: "Self-detected", value: String(selfDetectedIssues.length) },
          { label: "Escalated", value: String(attentionItems.filter((item) => item.escalatedAt).length) },
          { label: "Blocked", value: String(attentionItems.filter((item) => item.state === "blocked").length) },
          { label: "Supervisor-generated", value: String(attentionItems.filter((item) => item.origin === "supervisor").length) },
        ]}
      />
      <RouteBrief eyebrow="Review order" title="Inspect escalation evidence before opening controls" action={{ href: "/audit", label: "Open audit" }}>
        Start with blocked, escalated, or self-detected items. Use work-item detail and audit evidence before any retry, cleanup, or approval path.
      </RouteBrief>
      <AttentionBrowser items={attentionItems} savedViews={savedViews} />
    </Shell>
  );
}

