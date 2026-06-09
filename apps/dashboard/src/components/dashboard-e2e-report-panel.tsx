import type { DashboardE2EReportView, DashboardE2ERunnerView, VerificationCommandView } from "@kendall/contracts";

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

function RunnerCard({ runner }: { runner: DashboardE2ERunnerView }) {
  return (
    <article className="rounded-[1rem] border bg-[var(--panel)] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{runner.status}</p>
          <h5 className="mt-1 text-sm font-semibold">{runner.label}</h5>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-[11px] text-[var(--muted)]">
          {runner.runnerId}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{runner.target}</p>
      <p className="mt-3 break-all rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 font-mono text-xs text-[var(--muted)]">
        {runner.command}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs text-[var(--muted)]">
          lifecycle {runner.ownsServerLifecycle ? "owned" : "config managed"}
        </span>
        <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs text-[var(--muted)]">
          caches {runner.usesRepoLocalCaches ? "repo-local" : "external"}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {runner.evidence.map((item) => (
          <p key={item} className="rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
            {item}
          </p>
        ))}
      </div>
    </article>
  );
}

function SetupCommand({ command }: { command: VerificationCommandView }) {
  return (
    <div className="rounded-[0.9rem] border bg-[var(--panel)] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-sm font-semibold">{command.label}</p>
        <span className="w-fit font-mono text-[11px] uppercase text-[var(--accent)]">{command.status}</span>
      </div>
      <p className="mt-2 break-all font-mono text-xs text-[var(--muted)]">{command.command}</p>
    </div>
  );
}

export function DashboardE2EReportPanel({ report }: { report: DashboardE2EReportView }) {
  const ownedLifecycleCount = report.runners.filter((runner) => runner.ownsServerLifecycle).length;

  return (
    <section className="rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Dashboard e2e</p>
          <h3 className="mt-2 text-xl font-semibold">Browser verification map</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{report.summary}</p>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
          {formatTimestamp(report.generatedAt)}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {[
          ["Runners", String(report.runners.length)],
          ["Owned lifecycle", String(ownedLifecycleCount)],
          ["Authority", report.executionAuthorityApproved ? "approved" : "not approved"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
            <p className="mt-2 text-sm font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
        <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
          <h4 className="text-base font-semibold">Runner catalog</h4>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            {report.runners.map((runner) => (
              <RunnerCard key={runner.runnerId} runner={runner} />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <h4 className="text-base font-semibold">Setup commands</h4>
            <div className="mt-3 space-y-3">
              {report.setupCommands.map((command) => (
                <SetupCommand key={command.commandId} command={command} />
              ))}
            </div>
          </div>

          <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <h4 className="text-base font-semibold">Browser stop lines</h4>
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
