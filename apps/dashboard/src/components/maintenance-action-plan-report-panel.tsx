import type { MaintenanceActionPlanReportView, MaintenanceActionPlanStepView } from "@kendall/contracts";
import Link from "next/link";

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

function StepCard({ step }: { step: MaintenanceActionPlanStepView }) {
  return (
    <article className="rounded-[1rem] border bg-[var(--panel)] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{step.priority}</p>
          <h5 className="mt-1 text-sm font-semibold">{step.label}</h5>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-[11px] text-[var(--muted)]">
          {step.stepId}
        </span>
      </div>
      <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">{step.status}</p>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{step.summary}</p>

      <div className="mt-3 grid gap-2">
        {step.evidence.map((item) => (
          <p key={item} className="rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
            {item}
          </p>
        ))}
      </div>

      <div className="mt-3 rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Verification</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {step.verificationCommands.map((command) => (
            <span key={command} className="rounded-full border bg-[var(--panel)] px-2 py-1 font-mono text-[11px] text-[var(--muted)]">
              {command}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {step.dashboardAnchors.map((anchor) => (
          <Link key={anchor} href={anchor} className="rounded-full border bg-[var(--surface)] px-2 py-1 text-[11px] text-[var(--accent)]">
            {anchor}
          </Link>
        ))}
      </div>

      <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{step.nextAction}</p>
    </article>
  );
}

export function MaintenanceActionPlanReportPanel({ report }: { report: MaintenanceActionPlanReportView }) {
  const blockedSteps = report.steps.filter((step) => step.status.includes("blocked")).length;

  return (
    <section className="rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Maintenance action plan</p>
          <h3 className="mt-2 text-xl font-semibold">Next safe work plan</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{report.summary}</p>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
          {formatTimestamp(report.generatedAt)}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {[
          ["Steps", String(report.steps.length)],
          ["Blocked", String(blockedSteps)],
          ["Authority", report.executionAuthorityApproved ? "approved" : "not approved"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
            <p className="mt-2 text-sm font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
          <h4 className="text-base font-semibold">Plan steps</h4>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {report.steps.map((step) => (
              <StepCard key={step.stepId} step={step} />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <h4 className="text-base font-semibold">Verification chain</h4>
            <div className="mt-3 flex flex-wrap gap-2">
              {report.verificationChain.map((command) => (
                <span key={command} className="rounded-full border bg-[var(--panel)] px-2 py-1 font-mono text-[11px] text-[var(--muted)]">
                  {command}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <h4 className="text-base font-semibold">Stop lines</h4>
            <div className="mt-3 space-y-2">
              {report.stopLines.map((stopLine) => (
                <p key={stopLine} className="rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2 text-xs leading-5 text-[var(--warn)]">
                  {stopLine}
                </p>
              ))}
            </div>
          </div>

          <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
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
