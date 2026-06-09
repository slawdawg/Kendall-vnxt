import type { SupervisorReportCatalogView } from "@kendall/contracts";

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

export function SupervisorReportCatalogPanel({ catalog }: { catalog: SupervisorReportCatalogView }) {
  return (
    <section className="rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Report catalog</p>
          <h3 className="mt-2 text-xl font-semibold">Supervisor evidence map</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{catalog.summary}</p>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
          {formatTimestamp(catalog.generatedAt)}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {[
          ["Reports", String(catalog.reports.length)],
          ["Mode", catalog.readOnly ? "read only" : "review"],
          ["Authority", catalog.executionAuthorityApproved ? "approved" : "not approved"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
            <p className="mt-2 text-sm font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
          <h4 className="text-base font-semibold">Report endpoints</h4>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {catalog.reports.map((report) => (
              <article key={report.reportId} className="rounded-[1rem] border bg-[var(--panel)] p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{report.status}</p>
                    <h5 className="mt-1 text-sm font-semibold">{report.label}</h5>
                  </div>
                  <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-[11px] text-[var(--muted)]">
                    {report.readOnly ? "Read only" : "Review"}
                  </span>
                </div>
                <p className="mt-3 break-all rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 font-mono text-xs text-[var(--muted)]">
                  {report.endpoint}
                </p>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{report.summary}</p>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{report.evidenceScope.join(" | ")}</p>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{report.relatedDocs.join(" | ")}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <h4 className="text-base font-semibold">Catalog stop lines</h4>
            <div className="mt-3 space-y-2">
              {catalog.stopLines.map((stopLine) => (
                <p key={stopLine} className="rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2 text-xs leading-5 text-[var(--warn)]">
                  {stopLine}
                </p>
              ))}
            </div>
          </div>

          <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <h4 className="text-base font-semibold">Next safe actions</h4>
            <div className="mt-3 space-y-2">
              {catalog.nextSafeActions.map((action) => (
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
