"use client";

import Link from "next/link";
import type { SavedWorkItemView, WorkItemView } from "@kendall/contracts";

import { AttentionBadge } from "./attention-badge";
import { UrlSyncedWorkItemFilters } from "./url-synced-work-item-browser";
import { formatLane, formatWorkflowState } from "../lib/workflow-display";

export function AttentionBrowser({ items, savedViews }: { items: WorkItemView[]; savedViews: SavedWorkItemView[] }) {
  const browser = UrlSyncedWorkItemFilters({
    items,
    label: "Filter the needs-attention queue",
    scope: "attention",
    initialSavedViews: savedViews,
  });

  return (
    <>
      {browser.controls}
      <section className="rounded-[0.5rem] border bg-[var(--panel)] p-4 shadow-sm">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Priority review</p>
            <h2 className="mt-2 text-2xl font-semibold">Items needing operator attention</h2>
          </div>
          <span className="rounded-full bg-[var(--panel-strong)] px-3 py-1 font-mono text-xs">{browser.filtered.length}</span>
        </div>
        <div className="mt-6 space-y-4">
          {browser.filtered.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No attention items match the current filters.</p>
          ) : (
            browser.filtered.map((item) => (
              <article key={item.id} className="rounded-[0.5rem] border bg-[var(--surface)] p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <AttentionBadge reason={item.attentionReason} />
                      <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--accent)]">
                        {formatWorkflowState(item.state)}
                      </span>
                      <span className="rounded-full bg-[var(--panel)] px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
                        {item.origin}
                      </span>
                      {item.selfDetectedIssue ? (
                        <span className="rounded-full border border-[var(--warn)]/40 bg-[var(--warn)]/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-[var(--warn)]">
                          Self-detected
                        </span>
                      ) : null}
                    </div>
                    <h3 className="mt-3 text-xl font-semibold">
                      <Link href={`/work-items/${item.id}`} className="transition hover:text-[var(--accent)]">
                        {item.title}
                      </Link>
                    </h3>
                    <p className="mt-2 text-sm text-[var(--muted)]">{item.statusSummary}</p>
                    <p className="mt-3 text-sm text-[var(--warn)]">{item.attentionReason}</p>
                    {item.selfDetectedIssueCategory ? (
                      <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                        Issue category: {item.selfDetectedIssueCategory}
                      </p>
                    ) : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[22rem]">
                    <div className="rounded-[0.5rem] border bg-[var(--panel)] p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Owner</p>
                      <p className="mt-2 text-sm font-medium">{item.assigneeLabel ?? item.assigneeId ?? "Unassigned"}</p>
                    </div>
                    <div className="rounded-[0.5rem] border bg-[var(--panel)] p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Workflow group</p>
                      <p className="mt-2 text-sm font-medium">{formatLane(item.lane)}</p>
                    </div>
                    <div className="rounded-[0.5rem] border bg-[var(--panel)] p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Age</p>
                      <p className="mt-2 text-sm font-medium">{item.ageMinutes} min</p>
                    </div>
                    <div className="rounded-[0.5rem] border bg-[var(--panel)] p-3">
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
    </>
  );
}
