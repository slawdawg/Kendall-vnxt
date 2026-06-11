import type { TrustedDeliveryEligibilityReportView } from "@kendall/contracts";

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

function StatusChip({ value }: { value: string }) {
  const blocked = value !== "eligible" && value !== "passed" && value !== "clean";
  return (
    <span
      className={`w-fit rounded-full px-3 py-1 font-mono text-[11px] ${
        blocked
          ? "bg-[color-mix(in_srgb,var(--warn)_16%,transparent)] text-[var(--warn)]"
          : "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--accent)]"
      }`}
    >
      {value}
    </span>
  );
}

function ListBlock({ title, items, warn = false }: { title: string; items: string[]; warn?: boolean }) {
  return (
    <div>
      <h5 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{title}</h5>
      <div className="mt-2 space-y-1">
        {items.map((item) => (
          <p key={item} className={`text-xs leading-5 ${warn ? "text-[var(--warn)]" : "text-[var(--muted)]"}`}>
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}

export function TrustedDeliveryEligibilityReportPanel({ report }: { report: TrustedDeliveryEligibilityReportView }) {
  return (
    <section className="rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Trusted delivery</p>
          <h3 className="mt-2 text-xl font-semibold">Eligibility evaluator</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{report.summary}</p>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
          {formatTimestamp(report.generatedAt)}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ["Branch", report.currentBranch],
          ["Base", report.baseBranch],
          ["HEAD", report.headRevision],
          ["Tree", report.workingTreeStatus],
          ["Ahead", String(report.commitsAhead)],
          ["Auto", report.automaticDeliveryApproved ? "approved" : "blocked"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
            <p className="mt-2 break-words text-sm font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-[1.25rem] border bg-[var(--surface)] p-4">
        <h4 className="text-base font-semibold">Committed diff</h4>
        <pre className="mt-3 overflow-auto whitespace-pre-wrap rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2 font-mono text-xs leading-5 text-[var(--muted)]">
          {report.diffStat}
        </pre>
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-2">
        {report.stages.map((stage) => (
          <article key={stage.stageId} className="rounded-[1rem] border bg-[var(--surface)] p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{stage.stageId}</p>
                <h4 className="mt-1 text-sm font-semibold">{stage.label}</h4>
              </div>
              <StatusChip value={stage.status} />
            </div>
            <div className="mt-3 grid gap-2">
              {stage.checks.map((check) => (
                <div key={check.checkId} className="border-t border-[var(--border)] pt-2 first:border-t-0 first:pt-0">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold">{check.label}</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{check.summary}</p>
                    </div>
                    <StatusChip value={check.status} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <ListBlock title="Allowed" items={stage.allowedOperations.length ? stage.allowedOperations : ["No automatic operation allowed."]} />
              <ListBlock title="Blocked" items={stage.blockedOperations} warn />
            </div>
          </article>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
          <ListBlock title="Hard stops" items={report.hardStops} warn />
        </div>
        <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
          <ListBlock title="Next safe actions" items={report.nextSafeActions} />
        </div>
      </div>
    </section>
  );
}
