import type { LegacyPlanningArtifactInventoryReportView } from "@kendall/contracts";

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

export function LegacyPlanningArtifactInventoryReportPanel({ report }: { report: LegacyPlanningArtifactInventoryReportView }) {
  const localCount = report.candidates.filter((candidate) => candidate.localPlanningState).length;

  return (
    <section className="rounded-[0.5rem] border bg-[var(--panel)] p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Legacy planning inventory</p>
          <h3 className="mt-2 text-xl font-semibold">Metadata-only candidates</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{report.summary}</p>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
          {formatTimestamp(report.generatedAt)}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        {[
          ["Candidates", String(report.candidates.length)],
          ["Local state", String(localCount)],
          ["Artifact types", String(report.artifactTypes.length)],
          ["Raw retained", report.rawContentRetained ? "yes" : "no"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
            <p className="mt-2 text-sm font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
        <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
          <h4 className="text-base font-semibold">Discovered candidates</h4>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {report.candidates.slice(0, 12).map((candidate) => (
              <article key={candidate.candidateId} className="rounded-[0.5rem] border bg-[var(--panel)] p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{candidate.artifactType}</p>
                    <h5 className="mt-1 text-sm font-semibold">{candidate.summaryLabel}</h5>
                  </div>
                  <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-[11px] text-[var(--muted)]">
                    {candidate.sourceAccessState}
                  </span>
                </div>
                <p className="mt-2 break-all font-mono text-xs leading-5 text-[var(--muted)]">{candidate.path}</p>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{candidate.evidenceBoundary}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
            <h4 className="text-base font-semibold">Stop lines</h4>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--muted)]">
              {report.stopLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
            <h4 className="text-base font-semibold">Next safe actions</h4>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--muted)]">
              {report.nextSafeActions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
