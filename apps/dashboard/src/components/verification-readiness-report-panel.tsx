import type { VerificationCommandView, VerificationReadinessReportView } from "@kendall/contracts";

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

function CommandCard({ command }: { command: VerificationCommandView }) {
  return (
    <article className="rounded-[1rem] border bg-[var(--panel)] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{command.status}</p>
          <h5 className="mt-1 text-sm font-semibold">{command.label}</h5>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-[11px] text-[var(--muted)]">
          {command.commandId}
        </span>
      </div>
      <p className="mt-3 break-all rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 font-mono text-xs text-[var(--muted)]">
        {command.command}
      </p>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{command.requiredFor.join(" | ")}</p>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{command.evidence.join(" ")}</p>
    </article>
  );
}

export function VerificationReadinessReportPanel({ report }: { report: VerificationReadinessReportView }) {
  const commandLabelById = new Map(
    [...report.requiredCommands, ...report.optionalCommands].map((command) => [command.commandId, command.label]),
  );

  return (
    <section className="rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Verification readiness</p>
          <h3 className="mt-2 text-xl font-semibold">Checks and stop lines</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{report.summary}</p>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
          {formatTimestamp(report.generatedAt)}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {[
          ["Required checks", String(report.requiredCommands.length)],
          ["Optional checks", String(report.optionalCommands.length)],
          ["Authority", report.executionAuthorityApproved ? "approved" : "not approved"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
            <p className="mt-2 text-sm font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-[1.25rem] border bg-[var(--surface)] p-4">
        <h4 className="text-base font-semibold">Execution plan</h4>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {report.commandGroups.map((group) => (
            <article key={group.groupId} className="rounded-[1rem] border bg-[var(--panel)] p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{group.status}</p>
                  <h5 className="mt-1 text-sm font-semibold">{group.label}</h5>
                </div>
                <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-[11px] text-[var(--muted)]">
                  {group.groupId}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{group.summary}</p>
              <p className="mt-3 rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
                {group.requiredBefore}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {group.commandIds.map((commandId) => (
                  <span key={commandId} className="rounded-full border bg-[var(--surface)] px-2 py-1 font-mono text-[11px] text-[var(--muted)]">
                    {commandLabelById.get(commandId) ?? commandId}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{group.nextAction}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
          <h4 className="text-base font-semibold">Required commands</h4>
          <div className="mt-3 space-y-3">
            {report.requiredCommands.map((command) => (
              <CommandCard key={command.commandId} command={command} />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <h4 className="text-base font-semibold">Optional commands</h4>
            <div className="mt-3 space-y-3">
              {report.optionalCommands.map((command) => (
                <CommandCard key={command.commandId} command={command} />
              ))}
            </div>
          </div>

          <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <h4 className="text-base font-semibold">Authority stop lines</h4>
            <div className="mt-3 space-y-2">
              {report.stopLines.map((stopLine) => (
                <p key={stopLine} className="rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2 text-xs leading-5 text-[var(--warn)]">
                  {stopLine}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
