import type { WorkflowEventView } from "@kendall/contracts";
import { formatLane, formatWorkflowState } from "../lib/workflow-display";

function formatEventType(eventType: string): string {
  return eventType.replaceAll(".", " ");
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

function payloadString(payload: WorkflowEventView["payload"], key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value ? value : null;
}

function payloadStringList(payload: WorkflowEventView["payload"], key: string): string[] {
  const value = payload[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function DeliveryPackageEvidence({ event }: { event: WorkflowEventView }) {
  if (event.eventType !== "recipe.delivery_gate_recorded") {
    return null;
  }

  const changedPaths = payloadStringList(event.payload, "changedPaths");
  const outOfScopePaths = payloadStringList(event.payload, "outOfScopePaths");
  const diffStat = payloadString(event.payload, "diffStat");
  const remotePolicy = payloadString(event.payload, "remoteOperationsPolicy");
  const localStatus = payloadString(event.payload, "localDeliveryPackageStatus") ?? "not recorded";
  const packageKind = payloadString(event.payload, "localDeliveryPackageKind") ?? "local evidence";

  return (
    <div className="mt-4 rounded-[0.5rem] border border-[var(--accent)]/30 bg-[var(--panel)] p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">Delivery package</p>
          <p className="mt-1 text-sm font-semibold">{packageKind}</p>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 text-xs text-[var(--muted)]">{localStatus}</span>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">Changed paths</p>
          <ul className="mt-2 space-y-1 font-mono text-xs text-[var(--muted)]">
            {changedPaths.length > 0 ? changedPaths.map((path) => <li key={path}>{path}</li>) : <li>None recorded</li>}
          </ul>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">Out of scope</p>
          <ul className="mt-2 space-y-1 font-mono text-xs text-[var(--muted)]">
            {outOfScopePaths.length > 0 ? outOfScopePaths.map((path) => <li key={path}>{path}</li>) : <li>None</li>}
          </ul>
        </div>
      </div>
      {diffStat ? (
        <pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap rounded-[0.5rem] bg-[var(--surface)] p-3 font-mono text-xs text-[var(--muted)]">
          {diffStat}
        </pre>
      ) : null}
      {remotePolicy ? <p className="mt-3 text-xs text-[var(--muted)]">{remotePolicy}</p> : null}
    </div>
  );
}

export function WorkItemHistory({ events }: { events: WorkflowEventView[] }) {
  return (
    <section className="rounded-[0.5rem] border bg-[var(--panel)] p-4 shadow-sm">
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
            <article key={event.id} className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">
                    {formatEventType(event.eventType)}
                  </p>
                  <p className="mt-2 text-sm font-medium">{event.summary}</p>
                  {payloadString(event.payload, "note") ? (
                    <p className="mt-2 text-sm text-[var(--muted)]">{payloadString(event.payload, "note")}</p>
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
                {payloadString(event.payload, "state") ? (
                  <span className="rounded-full bg-[var(--panel)] px-3 py-1">
                    Step: {formatWorkflowState(String(event.payload.state))}
                  </span>
                ) : null}
                {payloadString(event.payload, "lane") ? (
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
              <DeliveryPackageEvidence event={event} />
            </article>
          ))
        )}
      </div>
    </section>
  );
}
