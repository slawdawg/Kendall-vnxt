import type { WorkflowEventView } from "@kendall/contracts";
import { formatLane, formatWorkflowState } from "../lib/workflow-display";

function formatEventType(eventType: string): string {
  return eventType.replaceAll(".", " ");
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

export function WorkItemHistory({ events }: { events: WorkflowEventView[] }) {
  return (
    <section className="rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Workflow history</p>
          <h3 className="text-xl font-semibold">Event timeline</h3>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
          {events.length} events
        </span>
      </div>
      <div className="mt-5 space-y-3">
        {events.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No workflow events recorded yet.</p>
        ) : (
          events.map((event) => (
            <article key={event.id} className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">
                    {formatEventType(event.eventType)}
                  </p>
                  <p className="mt-2 text-sm font-medium">{event.summary}</p>
                  {typeof event.payload.note === "string" && event.payload.note ? (
                    <p className="mt-2 text-sm text-[var(--muted)]">{event.payload.note}</p>
                  ) : null}
                </div>
                <p className="shrink-0 rounded-full bg-[var(--panel)] px-3 py-1 text-xs text-[var(--muted)]">
                  {formatTimestamp(event.createdAt)}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                <span className="rounded-full bg-[var(--panel)] px-3 py-1">{event.actorType}</span>
                {event.actorLabel ? (
                  <span className="rounded-full bg-[var(--panel-strong)] px-3 py-1">{event.actorLabel}</span>
                ) : null}
                {event.actorId ? (
                  <span className="rounded-full bg-[var(--panel)] px-3 py-1">{event.actorId}</span>
                ) : null}
                {event.payload.state ? (
                  <span className="rounded-full bg-[var(--panel)] px-3 py-1">
                    Step: {formatWorkflowState(String(event.payload.state))}
                  </span>
                ) : null}
                {event.payload.lane ? (
                  <span className="rounded-full bg-[var(--panel)] px-3 py-1">
                    Group: {formatLane(String(event.payload.lane))}
                  </span>
                ) : null}
                {event.payload.assigneeLabel || event.payload.assigneeId ? (
                  <span className="rounded-full bg-[var(--panel)] px-3 py-1">
                    Owner: {String(event.payload.assigneeLabel ?? event.payload.assigneeId)}
                  </span>
                ) : null}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
