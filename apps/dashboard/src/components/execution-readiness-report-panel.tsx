import type { ExecutionReadinessReportView } from "@kendall/contracts";

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

function formatTimestamp(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : "Not recorded";
}

export function ExecutionReadinessReportPanel({ report }: { report: ExecutionReadinessReportView }) {
  return (
    <section className="rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Execution readiness</p>
          <h3 className="mt-2 text-xl font-semibold">Policy and evidence report</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{report.summary}</p>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
          {formatTimestamp(report.generatedAt)}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["Authority checks", `${report.disabledAuthorityChecks.length} disabled`],
          ["Attempts", `${report.currentAttempts.length} recent`],
          ["Outcomes", `${report.latestOutcomes.length} reported`],
          ["Provider calls", report.providerCallsAllowed ? "Allowed" : "Disabled"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
            <p className="mt-2 text-sm font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
          <h4 className="text-base font-semibold">Provider enablement ladder</h4>
          <div className="mt-3 space-y-3">
            {report.providerEnablementPolicy.map((step) => (
              <article key={step.stepId} className="rounded-[1rem] border bg-[var(--panel)] p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{step.status}</p>
                    <h5 className="mt-1 text-sm font-semibold">{step.label}</h5>
                  </div>
                  <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-[11px] text-[var(--muted)]">
                    {step.stepId}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{step.summary}</p>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{step.requiredEvidence.join(" ")}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <h4 className="text-base font-semibold">Current attempts</h4>
            <div className="mt-3 space-y-3">
              {report.currentAttempts.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">No recent execution attempts are recorded.</p>
              ) : (
                report.currentAttempts.slice(0, 4).map((attempt) => (
                  <article key={attempt.attemptId} className="rounded-[1rem] border bg-[var(--panel)] p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{attempt.workerId}</p>
                        <h5 className="mt-1 text-sm font-semibold">{titleCase(attempt.status)} on {titleCase(attempt.lane)}</h5>
                      </div>
                      <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-[11px] text-[var(--muted)]">
                        {titleCase(attempt.authorityMode)}
                      </span>
                    </div>
                    {attempt.disabledReason ? <p className="mt-2 text-sm text-[var(--warn)]">{attempt.disabledReason}</p> : null}
                    <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{attempt.nextSafeAction}</p>
                  </article>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <h4 className="text-base font-semibold">Outcome evidence</h4>
            <div className="mt-3 space-y-3">
              {report.latestOutcomes.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">No routing outcome evidence is recorded yet.</p>
              ) : (
                report.latestOutcomes.slice(0, 4).map((outcome) => (
                  <article key={outcome.eventId} className="rounded-[1rem] border bg-[var(--panel)] p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">
                          {outcome.selectedLane ? titleCase(outcome.selectedLane) : "Unclassified"}
                        </p>
                        <h5 className="mt-1 text-sm font-semibold">{outcome.workerId ?? "Unknown worker"}</h5>
                      </div>
                      <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-[11px] text-[var(--muted)]">
                        {outcome.reportingOnly ? "Reporting only" : "Review"}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                      {titleCase(outcome.attemptStatus ?? "not recorded")} validation: {titleCase(outcome.validationStatus ?? "not recorded")}
                    </p>
                  </article>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
