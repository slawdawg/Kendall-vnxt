import type { WorkItemView, WorkflowState } from "@kendall/contracts";
import Link from "next/link";
import { AssignmentPanel } from "./assignment-panel";
import { AttentionBadge } from "./attention-badge";
import { WorkItemActions } from "./work-item-actions";
import { formatLane, formatWorkflowState } from "../lib/workflow-display";

const columns: Array<{ title: string; states: WorkflowState[] }> = [
  { title: "Queued", states: ["queued", "triaged", "ready"] },
  { title: "Active", states: ["implementing", "validating", "reviewing", "awaiting_audit"] },
  { title: "Blocked / Rework", states: ["blocked", "needs_rework"] },
  { title: "Done", states: ["done"] },
];

const columnDescriptions: Record<string, string> = {
  Queued: "New intake and ready work waiting to begin.",
  Active: "Implementation, validation, review, and audit in flight.",
  "Blocked / Rework": "Items that need intervention or another pass.",
  Done: "Completed work for the current workflow.",
};

export function WorkGrid({ items }: { items: WorkItemView[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-4">
      {columns.map((column) => {
        const matches = items.filter((item) => column.states.includes(item.state));
        return (
          <section key={column.title} className="rounded-[0.5rem] border bg-[var(--panel)] p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{column.title}</h2>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{columnDescriptions[column.title]}</p>
              </div>
              <span className="rounded-full bg-[var(--panel-strong)] px-3 py-1 font-mono text-xs">
                {matches.length}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {matches.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">No items in this lane.</p>
              ) : (
                matches.map((item) => (
                  <article key={item.id} className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/work-items/${item.id}`} className="block min-w-0 flex-1 transition hover:text-[var(--accent)]">
                        <div className="flex flex-wrap items-center gap-2">
                          {item.needsAttention ? <AttentionBadge reason={item.attentionReason} /> : null}
                          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--accent)]">
                            {formatWorkflowState(item.state)}
                          </p>
                        </div>
                        <h3 className="mt-2 text-base font-semibold">{item.title}</h3>
                      </Link>
                      {item.nextStep ? (
                        <span className="shrink-0 rounded-full bg-[var(--panel-strong)] px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
                          {item.nextStep}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-[var(--muted)]">{item.statusSummary}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                      Workflow group: {formatLane(item.lane)}
                    </p>
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                      Owner: {item.assigneeLabel ?? item.assigneeId ?? "Unassigned"}
                    </p>
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                      Age: {item.ageMinutes} min
                    </p>
                    {item.attentionReason ? (
                      <p className="mt-2 text-sm text-[var(--warn)]">{item.attentionReason}</p>
                    ) : null}
                    {item.blockedReason ? (
                      <p className="mt-3 text-sm font-medium text-[var(--warn)]">{item.blockedReason}</p>
                    ) : null}
                    <div className="mt-4">
                      <AssignmentPanel
                        workItemId={item.id}
                        assigneeId={item.assigneeId}
                        assigneeLabel={item.assigneeLabel}
                        compact
                      />
                    </div>
                    <div className="mt-4">
                      <WorkItemActions workItemId={item.id} state={item.state} requiresAudit={item.requiresAudit} compact />
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
