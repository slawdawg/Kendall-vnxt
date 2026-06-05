"use client";

import Link from "next/link";
import type { SavedWorkItemView, WorkItemView } from "@kendall/contracts";

import { AttentionBadge } from "./attention-badge";
import { UrlSyncedWorkItemFilters } from "./url-synced-work-item-browser";
import { formatLane, formatWorkflowState } from "../lib/workflow-display";

export function ActiveWorkBrowser({ items, savedViews }: { items: WorkItemView[]; savedViews: SavedWorkItemView[] }) {
  const browser = UrlSyncedWorkItemFilters({
    items,
    label: "Filter live work",
    scope: "active-work",
    initialSavedViews: savedViews,
  });

  return (
    <>
      {browser.controls}
      <section className="rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Execution board</p>
            <h2 className="mt-2 text-2xl font-semibold">Active work</h2>
          </div>
          <span className="rounded-full bg-[var(--panel-strong)] px-3 py-1 font-mono text-xs">
            {browser.filtered.length}
          </span>
        </div>
        <div className="mt-6 space-y-4">
          {browser.filtered.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No work matches the current filter set.</p>
          ) : (
            browser.filtered.map((item) => (
              <article key={item.id} className="rounded-[1.25rem] border bg-[var(--surface)] p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.needsAttention ? <AttentionBadge reason={item.attentionReason} /> : null}
                      <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--accent)]">
                        {formatWorkflowState(item.state)}
                      </p>
                    </div>
                    <h3 className="mt-2 text-xl font-semibold">
                      <Link href={`/work-items/${item.id}`} className="transition hover:text-[var(--accent)]">
                        {item.title}
                      </Link>
                    </h3>
                    <p className="mt-2 text-sm text-[var(--muted)]">{item.statusSummary}</p>
                    <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                      Workflow group: {formatLane(item.lane)}
                    </p>
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                      Owner: {item.assigneeLabel ?? item.assigneeId ?? "Unassigned"}
                    </p>
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                      Age: {item.ageMinutes} min
                    </p>
                    {item.attentionReason ? (
                      <p className="mt-3 text-sm text-[var(--warn)]">{item.attentionReason}</p>
                    ) : null}
                  </div>
                  <div className="rounded-full bg-[var(--panel-strong)] px-3 py-1 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                    {item.nextStep ?? "Pending"}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </>
  );
}
