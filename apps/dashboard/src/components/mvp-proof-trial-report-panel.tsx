import type { MvpProofTrialReportView } from "@kendall/contracts";

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

function StatusChip({ value }: { value: string }) {
  const blocked = value.includes("blocked") || value.includes("waiting") || value.includes("operator");
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

function ListPanel({ title, items, warn = false }: { title: string; items: string[]; warn?: boolean }) {
  return (
    <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
      <h4 className="text-base font-semibold">{title}</h4>
      <div className="mt-3 space-y-2">
        {items.map((item, index) => (
          <p key={`${title}:${item}:${index}`} className={`rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2 text-xs leading-5 ${warn ? "text-[var(--warn)]" : "text-[var(--muted)]"}`}>
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}

export function MvpProofTrialReportPanel({ report }: { report: MvpProofTrialReportView }) {
  return (
    <section className="rounded-[0.5rem] border bg-[var(--panel)] p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">MVP proof</p>
          <h3 className="mt-2 text-xl font-semibold">Trial packet</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{report.summary}</p>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
          {formatTimestamp(report.generatedAt)}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Selected story</p>
          <p className="mt-2 text-sm font-semibold leading-6">{report.selectedStory}</p>
        </div>
        <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Trial status</p>
          <div className="mt-2">
            <StatusChip value={report.trialStatus} />
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-2">
        {report.steps.map((step) => (
          <article key={step.stepId} className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{step.stepId}</p>
                <h4 className="mt-1 text-sm font-semibold">{step.label}</h4>
              </div>
              <StatusChip value={step.status} />
            </div>
            <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{step.summary}</p>
            <p className="mt-3 rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
              {step.requiredApproval}
            </p>
            <div className="mt-3 space-y-1">
              {step.evidence.map((item, itemIndex) => (
                <p key={`${step.stepId}:evidence:${item}:${itemIndex}`} className="text-xs leading-5 text-[var(--muted)]">
                  {item}
                </p>
              ))}
            </div>
          </article>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <ListPanel title="Approval packets" items={report.approvalPackets} />
        <ListPanel title="Blocked operations" items={report.blockedOperations} warn />
        <ListPanel title="Stop conditions" items={report.stopConditions} warn />
        <ListPanel title="Next safe actions" items={report.nextSafeActions} />
      </div>
    </section>
  );
}
