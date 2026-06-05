import Link from "next/link";

import { AttentionBadge } from "../../components/attention-badge";
import { PageIntro } from "../../components/page-intro";
import { Shell } from "../../components/shell";
import { buildNavStats } from "../../lib/nav-stats";
import { formatLane, formatWorkflowState } from "../../lib/workflow-display";
import { getWorkItems } from "../../lib/supervisor";

export default async function AttentionPage() {
  const items = await getWorkItems();
  const attentionItems = items.filter((item) => item.needsAttention);
  const navStats = buildNavStats(items);

  return (
    <Shell navStats={navStats}>
      <PageIntro
        eyebrow="Attention"
        title="Needs-attention queue"
        description="Review blocked, stale, unowned, or explicitly escalated work before it slips into invisible drift."
        metrics={[
          { label: "Attention items", value: String(attentionItems.length) },
          { label: "Escalated", value: String(attentionItems.filter((item) => item.escalatedAt).length) },
          { label: "Blocked", value: String(attentionItems.filter((item) => item.state === "blocked").length) },
          { label: "Awaiting audit", value: String(attentionItems.filter((item) => item.state === "awaiting_audit").length) },
        ]}
      />

      <section className="rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Priority review</p>
            <h2 className="mt-2 text-2xl font-semibold">Items needing operator attention</h2>
          </div>
          <span className="rounded-full bg-[var(--panel-strong)] px-3 py-1 font-mono text-xs">{attentionItems.length}</span>
        </div>
        <div className="mt-6 space-y-4">
          {attentionItems.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Nothing currently needs attention. Very civilized.</p>
          ) : (
            attentionItems.map((item) => (
              <article key={item.id} className="rounded-[1.25rem] border bg-[var(--surface)] p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <AttentionBadge reason={item.attentionReason} />
                      <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--accent)]">
                        {formatWorkflowState(item.state)}
                      </span>
                    </div>
                    <h3 className="mt-3 text-xl font-semibold">
                      <Link href={`/work-items/${item.id}`} className="transition hover:text-[var(--accent)]">
                        {item.title}
                      </Link>
                    </h3>
                    <p className="mt-2 text-sm text-[var(--muted)]">{item.statusSummary}</p>
                    <p className="mt-3 text-sm text-[var(--warn)]">{item.attentionReason}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[22rem]">
                    <div className="rounded-[1rem] border bg-[var(--panel)] p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Owner</p>
                      <p className="mt-2 text-sm font-medium">{item.assigneeLabel ?? item.assigneeId ?? "Unassigned"}</p>
                    </div>
                    <div className="rounded-[1rem] border bg-[var(--panel)] p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Workflow group</p>
                      <p className="mt-2 text-sm font-medium">{formatLane(item.lane)}</p>
                    </div>
                    <div className="rounded-[1rem] border bg-[var(--panel)] p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Age</p>
                      <p className="mt-2 text-sm font-medium">{item.ageMinutes} min</p>
                    </div>
                    <div className="rounded-[1rem] border bg-[var(--panel)] p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Next action</p>
                      <p className="mt-2 text-sm font-medium">{item.nextStep ?? "None"}</p>
                    </div>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </Shell>
  );
}
