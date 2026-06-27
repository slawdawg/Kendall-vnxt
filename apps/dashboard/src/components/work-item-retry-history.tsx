import type { WorkflowEventView } from "@kendall/contracts";

import { formatLane } from "../lib/workflow-display";

type RetryAttempt = {
  number: number;
  startedAt: string;
  lane: string | null;
  triggerSummary: string | null;
  triggerNote: string | null;
};

const retryTriggerEventTypes = new Set([
  "work_item.retry_requested",
  "workflow.needs_rework",
  "repo.blocked",
]);

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

function buildRetryAttempts(events: WorkflowEventView[]): RetryAttempt[] {
  const chronological = [...events].reverse();
  const attempts: RetryAttempt[] = [];
  let pendingTrigger: WorkflowEventView | null = null;

  for (const event of chronological) {
    if (retryTriggerEventTypes.has(event.eventType)) {
      pendingTrigger = event;
      continue;
    }

    if (event.eventType !== "work_item.implementing") {
      continue;
    }

    attempts.push({
      number: attempts.length + 1,
      startedAt: event.createdAt,
      lane: typeof event.payload.lane === "string" ? event.payload.lane : null,
      triggerSummary: attempts.length === 0 ? null : pendingTrigger?.summary ?? null,
      triggerNote:
        attempts.length === 0
          ? null
          : typeof pendingTrigger?.payload.note === "string"
            ? pendingTrigger.payload.note
            : null,
    });
    pendingTrigger = null;
  }

  return attempts.reverse();
}

export function WorkItemRetryHistory({ events }: { events: WorkflowEventView[] }) {
  const attempts = buildRetryAttempts(events);
  const retryCount = Math.max(0, attempts.length - 1);

  return (
    <section id="retry-history" className="scroll-mt-28 rounded-[0.5rem] border bg-[var(--panel)] p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Retry history</p>
          <h3 className="text-xl font-semibold">Implementation attempts</h3>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
          {retryCount} retries
        </span>
      </div>
      <div className="mt-5 space-y-3">
        {attempts.length <= 1 ? (
          <p className="text-sm text-[var(--muted)]">No retries recorded yet. This work item is still on its first implementation attempt.</p>
        ) : (
          attempts.map((attempt) => (
            <article key={`${attempt.number}-${attempt.startedAt}`} className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">Attempt {attempt.number}</p>
                    {attempt.number === 1 ? (
                      <span className="rounded-full bg-[var(--panel)] px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
                        Initial
                      </span>
                    ) : (
                      <span className="rounded-full border border-[var(--warn)]/40 bg-[var(--warn)]/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-[var(--warn)]">
                        Retry
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Started {formatTimestamp(attempt.startedAt)}
                    {attempt.lane ? ` in ${formatLane(attempt.lane)}.` : "."}
                  </p>
                  {attempt.triggerSummary ? (
                    <p className="mt-3 text-sm font-medium">{attempt.triggerSummary}</p>
                  ) : null}
                  {attempt.triggerNote ? (
                    <p className="mt-2 text-sm text-[var(--muted)]">{attempt.triggerNote}</p>
                  ) : null}
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
