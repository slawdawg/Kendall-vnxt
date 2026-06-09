import type { ExecutionAttemptView, RoutingPreviewView, RuntimeEvidenceExportView, WorkflowEventView } from "@kendall/contracts";

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
  events,
}: {
  routingPreview: RoutingPreviewView;
  attempts: ExecutionAttemptView[];
  runtimeEvidenceExport: RuntimeEvidenceExportView;
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
      href: "#workflow-history",
      label: "History",
      value: `${events.length} events`,
      detail: runtimeEvidenceExport.boundary.relatedSupervisorReports.length
        ? `${runtimeEvidenceExport.boundary.relatedSupervisorReports.length} related reports`
        : "No related reports",
    },
  ];

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
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
    </section>
  );
}
