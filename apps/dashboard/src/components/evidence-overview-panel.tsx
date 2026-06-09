import type {
  ExecutionAttemptView,
  RoutingPreviewView,
  RuntimeEvidenceExportView,
  RuntimeEvidenceReviewWorkItemView,
  WorkflowEventView,
} from "@kendall/contracts";
import { reportShortcutHref } from "../lib/report-shortcuts";

function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replaceAll(".", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function EvidenceOverviewPanel({
  routingPreview,
  attempts,
  runtimeEvidenceExport,
  runtimeEvidenceReviewItem,
  events,
}: {
  routingPreview: RoutingPreviewView;
  attempts: ExecutionAttemptView[];
  runtimeEvidenceExport: RuntimeEvidenceExportView;
  runtimeEvidenceReviewItem: RuntimeEvidenceReviewWorkItemView | null;
  events: WorkflowEventView[];
}) {
  const latestAttempt = attempts[0] ?? null;
  const disabledSafetyCount = [
    runtimeEvidenceExport.safety.processLaunchAllowed,
    runtimeEvidenceExport.safety.providerCallsAllowed,
    runtimeEvidenceExport.safety.modelCallsAllowed,
    runtimeEvidenceExport.safety.premiumExecutionAllowed,
    runtimeEvidenceExport.safety.commandExecutionAllowed,
    runtimeEvidenceExport.safety.sourceMutationAllowed,
    runtimeEvidenceExport.safety.networkAllowed,
    runtimeEvidenceExport.safety.credentialAccessAllowed,
  ].filter((allowed) => !allowed).length;

  const cards = [
    {
      href: "#routing-decision",
      label: "Routing",
      value: titleCase(routingPreview.decision.selectedLane),
      detail: routingPreview.decision.selectedWorkerId ?? "No worker selected",
    },
    {
      href: "#execution-attempts",
      label: "Attempts",
      value: `${attempts.length} recorded`,
      detail: latestAttempt ? titleCase(latestAttempt.status) : "No attempts yet",
    },
    {
      href: "#runtime-evidence-export",
      label: "Runtime export",
      value: `${runtimeEvidenceExport.workflowEvents.length} events`,
      detail: `${disabledSafetyCount} authority flags disabled`,
    },
    {
      href: runtimeEvidenceReviewItem?.runtimeExportHref ?? "/controls#runtime-evidence-review-report",
      label: "Review queue",
      value: runtimeEvidenceReviewItem ? titleCase(runtimeEvidenceReviewItem.reviewPriority) : "Not indexed",
      detail: runtimeEvidenceReviewItem?.reviewReason ?? "No runtime review queue entry",
    },
    {
      href: "#workflow-history",
      label: "History",
      value: `${events.length} events`,
      detail: runtimeEvidenceExport.boundary.relatedSupervisorReports.length
        ? `${runtimeEvidenceExport.boundary.relatedSupervisorReports.length} related reports`
        : "No related reports",
    },
  ];
  const reviewShortcuts = runtimeEvidenceExport.reviewNavigator;
  const reportShortcuts = runtimeEvidenceExport.boundary.relatedSupervisorReports.slice(0, 4);

  return (
    <section className="rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Evidence overview</p>
          <h3 className="mt-2 text-xl font-semibold">Review map</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Read-only shortcuts into the recorded routing, attempt, export, and workflow evidence for this work item.
          </p>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
          No execution controls
        </span>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <a
            key={card.href}
            href={card.href}
            className="rounded-[1.25rem] border bg-[var(--surface)] p-4 transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{card.label}</p>
            <p className="mt-2 text-base font-semibold">{card.value}</p>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{card.detail}</p>
          </a>
        ))}
      </div>
      <div className="mt-5 rounded-[1.25rem] border bg-[var(--surface)] p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h4 className="text-base font-semibold">Review queue position</h4>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
              Current item context from the runtime evidence review queue.
            </p>
          </div>
          <a
            href="/controls#runtime-evidence-review-report"
            className="w-fit rounded-full border bg-[var(--panel)] px-3 py-1 font-mono text-xs text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            Open review index
          </a>
        </div>
        {runtimeEvidenceReviewItem ? (
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="rounded-[0.85rem] border bg-[var(--panel)] p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Priority</p>
              <p className="mt-2 text-base font-semibold">{titleCase(runtimeEvidenceReviewItem.reviewPriority)}</p>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{runtimeEvidenceReviewItem.reviewReason}</p>
            </div>
            <div className="rounded-[0.85rem] border bg-[var(--panel)] p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Evidence counts</p>
              <p className="mt-2 text-base font-semibold">
                {runtimeEvidenceReviewItem.attemptCount} attempts / {runtimeEvidenceReviewItem.eventCount} events
              </p>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                {runtimeEvidenceReviewItem.relatedReportCount} related reports indexed
              </p>
            </div>
            <a
              href={runtimeEvidenceReviewItem.runtimeExportHref}
              className="rounded-[0.85rem] border bg-[var(--panel)] p-3 transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Recommended action</p>
              <p className="mt-2 text-sm font-semibold">{runtimeEvidenceReviewItem.recommendedAction}</p>
              <p className="mt-2 break-words font-mono text-[11px] text-[var(--muted)]">
                {runtimeEvidenceReviewItem.runtimeExportHref}
              </p>
            </a>
          </div>
        ) : (
          <p className="mt-3 rounded-[0.85rem] border bg-[var(--panel)] p-3 text-sm leading-6 text-[var(--muted)]">
            This work item is not currently present in the runtime evidence review queue.
          </p>
        )}
        <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
          Review queue shortcuts are not execution-authority approvals.
        </p>
      </div>
      <div className="mt-5 rounded-[1.25rem] border bg-[var(--surface)] p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h4 className="text-base font-semibold">Report shortcuts</h4>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
              Related supervisor reports from the runtime export boundary for cross-checking this item.
            </p>
          </div>
          <a
            href="/controls"
            className="w-fit rounded-full border bg-[var(--panel)] px-3 py-1 font-mono text-xs text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            Open catalog
          </a>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {reportShortcuts.map((report) => (
            <a
              key={report}
              href={reportShortcutHref(report)}
              className="break-all rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2 font-mono text-xs text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              {report}
            </a>
          ))}
        </div>
      </div>
      <div className="mt-5 rounded-[1.25rem] border bg-[var(--surface)] p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h4 className="text-base font-semibold">Review shortcuts</h4>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
              Prioritized runtime export navigator items for read-only operator review.
            </p>
          </div>
          <span className="w-fit rounded-full bg-[var(--panel)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
            {reviewShortcuts.length} shortcuts
          </span>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          {reviewShortcuts.map((item) => (
            <a
              key={item.itemId}
              href={item.target.startsWith("#") ? item.target : "#runtime-evidence-export"}
              className="rounded-[1rem] border bg-[var(--panel)] p-3 transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{item.priority}</p>
                  <p className="mt-1 text-sm font-semibold">{item.label}</p>
                </div>
                <span className="shrink-0 rounded-full bg-[var(--surface)] px-2 py-1 font-mono text-[10px] text-[var(--muted)]">
                  {item.itemId}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{item.summary}</p>
              <p className="mt-2 break-words font-mono text-[11px] text-[var(--muted)]">{item.target}</p>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
