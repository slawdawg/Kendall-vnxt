import type { LocalCleanupPolicyItemView, LocalCleanupReadinessReportView } from "@kendall/contracts";

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

function PolicyCard({ item }: { item: LocalCleanupPolicyItemView }) {
  const warn = item.status !== "required";
  return (
    <article className="rounded-[0.5rem] border bg-[var(--panel)] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{item.itemId}</p>
          <h5 className="mt-1 text-sm font-semibold">{item.label}</h5>
        </div>
        <span className={`w-fit rounded-full px-3 py-1 font-mono text-[11px] ${warn ? "bg-[color-mix(in_srgb,var(--warn)_16%,transparent)] text-[var(--warn)]" : "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--accent)]"}`}>
          {item.status}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{item.summary}</p>
      <div className="mt-3 space-y-2">
        {item.evidence.map((evidence, evidenceIndex) => (
          <p
            key={`${item.itemId}:evidence:${evidence}:${evidenceIndex}`}
            className="rounded-[0.5rem] border bg-[var(--surface)] px-3 py-2 font-mono text-xs text-[var(--muted)]"
          >
            {evidence}
          </p>
        ))}
      </div>
    </article>
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

export function LocalCleanupReadinessReportPanel({ report }: { report: LocalCleanupReadinessReportView }) {
  return (
    <section className="rounded-[0.5rem] border bg-[var(--panel)] p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Local cleanup</p>
          <h3 className="mt-2 text-xl font-semibold">Cleanup readiness</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{report.summary}</p>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
          {formatTimestamp(report.generatedAt)}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Automatic", report.automaticCleanupApproved ? "approved" : "blocked"],
          ["Worktrees", report.worktreeRemovalApproved ? "approved" : "blocked"],
          ["Branches", report.branchDeletionApproved ? "approved" : "blocked"],
          ["Evidence", report.evidenceDeletionApproved ? "approved" : "blocked"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
            <p className="mt-2 break-words text-sm font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        {report.cleanupPolicy.map((item) => (
          <PolicyCard key={item.itemId} item={item} />
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <ListPanel title="Required evidence" items={report.requiredEvidence} />
        <ListPanel title="Blocked targets" items={report.blockedTargets} warn />
        <ListPanel title="Stop conditions" items={report.stopConditions} warn />
        <ListPanel title="Next safe actions" items={report.nextSafeActions} />
      </div>
    </section>
  );
}
