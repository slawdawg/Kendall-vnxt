import type { CodexReadinessCheckView, CodexReadinessReportView } from "@kendall/contracts";

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

function statusClass(status: string): string {
  if (status === "available") {
    return "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--accent)]";
  }
  if (status === "not_checked") {
    return "bg-[color-mix(in_srgb,var(--accent-2)_16%,transparent)] text-[var(--accent-2)]";
  }
  return "bg-[color-mix(in_srgb,var(--warn)_16%,transparent)] text-[var(--warn)]";
}

function CheckCard({ check }: { check: CodexReadinessCheckView }) {
  return (
    <article className="rounded-[0.5rem] border bg-[var(--panel)] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{check.checkId}</p>
          <h5 className="mt-1 text-sm font-semibold">{check.label}</h5>
        </div>
        <span className={`w-fit rounded-full px-3 py-1 font-mono text-[11px] ${statusClass(check.status)}`}>{check.status}</span>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{check.summary}</p>
      <div className="mt-3 space-y-2">
        {check.evidence.map((evidence, evidenceIndex) => (
          <p
            key={`${check.checkId}:evidence:${evidence}:${evidenceIndex}`}
            className="rounded-[0.5rem] border bg-[var(--surface)] px-3 py-2 font-mono text-xs text-[var(--muted)]"
          >
            {evidence}
          </p>
        ))}
      </div>
    </article>
  );
}

export function CodexReadinessReportPanel({ report }: { report: CodexReadinessReportView }) {
  return (
    <section className="rounded-[0.5rem] border bg-[var(--panel)] p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Codex readiness</p>
          <h3 className="mt-2 text-xl font-semibold">No-launch readiness</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{report.summary}</p>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
          {formatTimestamp(report.generatedAt)}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["CLI", report.cliPath ? "found" : "not found"],
          ["Launch", report.processLaunchApproved ? "approved" : "blocked"],
          ["Tasks", report.workerTaskExecutionApproved ? "approved" : "blocked"],
          ["Source changes", report.sourceMutationApproved ? "approved" : "blocked"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
            <p className="mt-2 break-words text-sm font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
          <h4 className="text-base font-semibold">Readiness checks</h4>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {report.checks.map((check) => (
              <CheckCard key={check.checkId} check={check} />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
            <h4 className="text-base font-semibold">Stop lines</h4>
            <div className="mt-3 space-y-2">
              {report.stopLines.map((stopLine) => (
                <p key={stopLine} className="rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2 text-xs leading-5 text-[var(--warn)]">
                  {stopLine}
                </p>
              ))}
            </div>
          </div>
          <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
            <h4 className="text-base font-semibold">Next safe actions</h4>
            <div className="mt-3 space-y-2">
              {report.nextSafeActions.map((action) => (
                <p key={action} className="rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
                  {action}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
