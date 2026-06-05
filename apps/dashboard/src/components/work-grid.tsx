import type { WorkItemView, WorkflowState } from "@kendall/contracts";
import Link from "next/link";

const columns: Array<{ title: string; states: WorkflowState[] }> = [
  { title: "Queued", states: ["queued", "triaged", "ready"] },
  { title: "Active", states: ["implementing", "validating", "reviewing"] },
  { title: "Blocked / Rework", states: ["blocked", "needs_rework"] },
  { title: "Done", states: ["done"] },
];

export function WorkGrid({ items }: { items: WorkItemView[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-4">
      {columns.map((column) => {
        const matches = items.filter((item) => column.states.includes(item.state));
        return (
          <section key={column.title} className="rounded-[1.75rem] border bg-[var(--panel)] p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{column.title}</h2>
              <span className="rounded-full bg-[var(--panel-strong)] px-3 py-1 font-mono text-xs">
                {matches.length}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {matches.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">No items in this lane.</p>
              ) : (
                matches.map((item) => (
                  <Link
                    key={item.id}
                    href={`/work-items/${item.id}`}
                    className="block rounded-[1.25rem] border bg-white p-4 transition hover:border-[var(--accent)]"
                  >
                    <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--accent)]">
                      {item.state}
                    </p>
                    <h3 className="mt-2 text-base font-semibold">{item.title}</h3>
                    <p className="mt-2 text-sm text-[var(--muted)]">{item.statusSummary}</p>
                    {item.blockedReason ? (
                      <p className="mt-3 text-sm font-medium text-[var(--warn)]">{item.blockedReason}</p>
                    ) : null}
                    {item.nextStep ? (
                      <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                        Next: {item.nextStep}
                      </p>
                    ) : null}
                  </Link>
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
