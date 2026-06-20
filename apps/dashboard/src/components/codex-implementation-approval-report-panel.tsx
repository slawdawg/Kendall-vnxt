import type {
  CodexImplementationApprovalReportView,
  CodexImplementationApprovalRequirementView,
} from "@kendall/contracts";

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

function statusClass(status: string): string {
  if (status === "required") {
    return "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--accent)]";
  }
  if (status === "metadata_only") {
    return "bg-[color-mix(in_srgb,var(--accent-2)_16%,transparent)] text-[var(--accent-2)]";
  }
  return "bg-[color-mix(in_srgb,var(--warn)_16%,transparent)] text-[var(--warn)]";
}

function RequirementCard({ requirement }: { requirement: CodexImplementationApprovalRequirementView }) {
  return (
    <article className="rounded-[1rem] border bg-[var(--panel)] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{requirement.requirementId}</p>
          <h5 className="mt-1 text-sm font-semibold">{requirement.label}</h5>
        </div>
        <span className={`w-fit rounded-full px-3 py-1 font-mono text-[11px] ${statusClass(requirement.status)}`}>
          {requirement.status}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{requirement.summary}</p>
      <div className="mt-3 space-y-2">
        {requirement.evidence.map((evidence, evidenceIndex) => (
          <p
            key={`${requirement.requirementId}:evidence:${evidence}:${evidenceIndex}`}
            className="rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 font-mono text-xs text-[var(--muted)]"
          >
            {evidence}
          </p>
        ))}
      </div>
    </article>
  );
}

function ListPanel({ title, items, tone = "muted" }: { title: string; items: string[]; tone?: "muted" | "warn" }) {
  return (
    <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
      <h4 className="text-base font-semibold">{title}</h4>
      <div className="mt-3 space-y-2">
        {items.map((item, index) => (
          <p
            key={`${title}:${item}:${index}`}
            className={`rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2 text-xs leading-5 ${
              tone === "warn" ? "text-[var(--warn)]" : "text-[var(--muted)]"
            }`}
          >
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}

export function CodexImplementationApprovalReportPanel({ report }: { report: CodexImplementationApprovalReportView }) {
  return (
    <section className="rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Codex implementation</p>
          <h3 className="mt-2 text-xl font-semibold">Approval packet</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{report.summary}</p>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
          {formatTimestamp(report.generatedAt)}
        </span>
      </div>

      <div className="mt-5 rounded-[1.25rem] border bg-[var(--surface)] p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Approval text</p>
        <p className="mt-2 text-sm leading-6">{report.approvalPrompt}</p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Launch", report.processLaunchApproved ? "approved" : "blocked"],
          ["Task", report.workerTaskExecutionApproved ? "approved" : "blocked"],
          ["Source changes", report.sourceMutationApproved ? "approved" : "blocked"],
          ["Binding", report.approvalBindingImplemented ? "implemented" : "not implemented"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
            <p className="mt-2 break-words text-sm font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ListPanel title="Target scope" items={report.targetScope} />
        <ListPanel title="Expected command shape" items={report.expectedCommandShape} />
        <ListPanel title="Allowed paths" items={report.allowedPaths} />
        <ListPanel title="Blocked paths" items={report.blockedPaths} tone="warn" />
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2 xl:grid-cols-5">
        {report.requirements.map((requirement) => (
          <RequirementCard key={requirement.requirementId} requirement={requirement} />
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <ListPanel title="Required evidence" items={report.requiredEvidence} />
        <ListPanel title="Rollback plan" items={report.rollbackPlan} />
        <ListPanel title="Stop conditions" items={report.stopConditions} tone="warn" />
      </div>

      <div className="mt-5">
        <ListPanel title="Next safe actions" items={report.nextSafeActions} />
      </div>
    </section>
  );
}
