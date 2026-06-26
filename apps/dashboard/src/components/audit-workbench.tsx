"use client";

import Link from "next/link";
import type { SavedWorkItemView, WorkItemView } from "@kendall/contracts";

import { AttentionBadge } from "./attention-badge";
import { WorkItemActions } from "./work-item-actions";
import { sharedFilterPresets } from "../lib/work-item-filtering";
import { UrlSyncedWorkItemFilters } from "./url-synced-work-item-browser";
import { formatLane, formatWorkflowState } from "../lib/workflow-display";

type AuditEventView = {
  id: string;
  workItemId: string;
  reason: string;
  mode: string;
  outcome: string;
  createdAt: string;
};

export function AuditWorkbench({
  awaitingAudit,
  completedWithAudit,
  audits,
  savedViews,
}: {
  awaitingAudit: WorkItemView[];
  completedWithAudit: WorkItemView[];
  audits: AuditEventView[];
  savedViews: SavedWorkItemView[];
}) {
  const browser = UrlSyncedWorkItemFilters({
    items: awaitingAudit,
    label: "Filter audit backlog",
    scope: "audit",
    initialSavedViews: savedViews,
    presets: [
      ...sharedFilterPresets,
      { label: "Required only", filters: { audit: "required" } },
      { label: "Advisory only", filters: { audit: "advisory" } },
    ],
  });

  return (
    <>
      <section className="grid gap-4 lg:grid-cols-4">
        {[
          ["Awaiting audit", String(awaitingAudit.length)],
          ["Required", String(awaitingAudit.filter((item) => item.auditMode === "required").length)],
          ["Advisory", String(awaitingAudit.filter((item) => item.auditMode === "advisory").length)],
          ["Audited done", String(completedWithAudit.length)],
        ].map(([label, value]) => (
          <article key={label} className="rounded-[0.5rem] border bg-[var(--panel)] p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
          </article>
        ))}
      </section>

      {browser.controls}

      <section className="rounded-[0.5rem] border bg-[var(--panel)] p-4 shadow-sm">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Audit lane</p>
          <h2 className="text-2xl font-semibold">Items waiting on audit review</h2>
          <p className="max-w-3xl text-sm text-[var(--muted)]">
            High-risk and medium-risk work pauses here until an operator completes audit review or routes it back into rework.
          </p>
        </div>
        <div className="mt-6 space-y-4">
          {browser.filtered.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No items match the current audit backlog filters.</p>
          ) : (
            browser.filtered.map((item) => {
              const latestAudit = audits.find((audit) => audit.workItemId === item.id);
              return (
                <article key={item.id} className="rounded-[0.5rem] border bg-[var(--surface)] p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="max-w-3xl">
                      <div className="flex flex-wrap items-center gap-2">
                        {item.needsAttention ? <AttentionBadge reason={item.attentionReason} /> : null}
                        <span className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--accent)]">
                          {item.auditMode}
                        </span>
                        <span className="rounded-full bg-[var(--panel-strong)] px-3 py-1 text-xs uppercase tracking-[0.18em]">
                          {formatWorkflowState(item.state)}
                        </span>
                      </div>
                      <h3 className="mt-3 text-xl font-semibold">
                        <Link href={`/work-items/${item.id}`} className="transition hover:text-[var(--accent)]">
                          {item.title}
                        </Link>
                      </h3>
                      <p className="mt-2 text-sm text-[var(--muted)]">{item.requestedOutcome}</p>
                      <p className="mt-3 text-sm">{item.statusSummary}</p>
                      <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                        Owner: {item.assigneeLabel ?? item.assigneeId ?? "Unassigned"}
                      </p>
                      {item.attentionReason ? (
                        <p className="mt-3 text-sm text-[var(--warn)]">{item.attentionReason}</p>
                      ) : null}
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl border bg-[var(--panel)] p-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Next action</p>
                          <p className="mt-2 text-sm font-medium">{item.nextStep ?? "Audit decision"}</p>
                        </div>
                        <div className="rounded-2xl border bg-[var(--panel)] p-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Workflow group</p>
                          <p className="mt-2 text-sm font-medium">{formatLane(item.lane)}</p>
                        </div>
                        <div className="rounded-2xl border bg-[var(--panel)] p-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Age</p>
                          <p className="mt-2 text-sm font-medium">{item.ageMinutes} min</p>
                        </div>
                        <div className="rounded-2xl border bg-[var(--panel)] p-3 md:col-span-2 xl:col-span-1">
                          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Audit request</p>
                          <p className="mt-2 text-sm font-medium">{latestAudit?.outcome ?? "Pending record"}</p>
                        </div>
                      </div>
                    </div>
                    <div className="w-full max-w-xl xl:min-w-[24rem] rounded-[0.5rem] border bg-[var(--panel)] p-4">
                      <WorkItemActions workItemId={item.id} state={item.state} requiresAudit={item.requiresAudit} />
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </>
  );
}
