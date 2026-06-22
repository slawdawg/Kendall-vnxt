import type { RunnerAssignmentStatusReportView, RunnerAssignmentStatusRowView } from "@kendall/contracts";

function formatGenerated(value: string): string {
  return new Date(value).toLocaleString();
}

function labelFor(classification: string): string {
  if (classification === "blocked_stale_owner_needs_takeover") return "Stale";
  if (classification.startsWith("blocked_")) return "Blocked";
  return classification.replaceAll("_", " ");
}

function Row({ row }: { row: RunnerAssignmentStatusRowView }) {
  return (
    <article className="rounded-[0.75rem] border bg-[var(--panel)] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{labelFor(row.classification)}</p>
          <h4 className="mt-1 text-sm font-semibold">{row.title}</h4>
        </div>
        <span className="w-fit rounded-full border bg-[var(--surface)] px-2 py-1 font-mono text-[11px] text-[var(--muted)]">
          {row.reasonCode}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{row.reason}</p>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <span className="break-all rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)]">owner: {row.owner ?? "none"}</span>
        <span className="break-all rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)]">branch: {row.branch ?? "none"}</span>
        <span className="rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)]">phase: {row.phase ?? "none"}</span>
        <span className="rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)]">heartbeat: {row.heartbeatAgeSeconds ?? "missing"}</span>
        <span className="rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)]">worktree: {row.worktreeState}</span>
        <span className="rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)]">delivery: {row.deliveryState}</span>
      </div>
      <p className="mt-3 rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs leading-5 text-[var(--accent)]">{row.nextSafeAction}</p>
      {row.currentCommand ? <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Current command: {row.currentCommand}</p> : null}
      {row.lastResult ? <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Last result: {row.lastResult}</p> : null}
      {row.warnings.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {row.warnings.map((warning) => (
            <span key={`${row.id}:${warning.code}`} className="rounded-full border bg-[var(--surface)] px-2 py-1 text-[11px] text-[var(--warn)]">
              {warning.code}
            </span>
          ))}
        </div>
      ) : null}
      {row.worktreePath ? <p className="mt-2 break-all font-mono text-[11px] text-[var(--muted)]">{row.worktreePath}</p> : null}
    </article>
  );
}

export function RunnerAssignmentStatusReportPanel({ report }: { report: RunnerAssignmentStatusReportView }) {
  const rows = [...report.workspaceAssignments, ...report.laneAssignments, ...report.backlogCandidates];
  const urgentRows = rows.filter((row) => row.classification !== "closed");
  const visibleRows = urgentRows.length > 0 ? urgentRows : rows.slice(0, 3);
  return (
    <section className="rounded-[1rem] border bg-[var(--surface)] p-4 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Runner Assignment Status</p>
          <h2 className="mt-2 text-xl font-semibold">Which lane needs attention now?</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Generated {formatGenerated(report.generatedAt)}. State root {report.stateRootStatus}; stale after {report.staleAfterSeconds}s.
          </p>
        </div>
        <span className="w-fit rounded-full border bg-[var(--panel)] px-3 py-1 font-mono text-[11px] text-[var(--muted)]">
          {report.reportStatus}
        </span>
      </div>

      {report.reportStatus === "error" ? (
        <p className="mt-4 rounded-[0.75rem] border bg-[var(--panel)] px-3 py-2 text-sm text-[var(--warn)]">
          Assignment status could not be inspected. {report.errorMessage ?? "No assignment action."}
        </p>
      ) : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(report.summary).map(([label, value]) => (
          <div key={label} className="rounded-[0.75rem] border bg-[var(--panel)] px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
            <p className="mt-1 text-lg font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {visibleRows.length === 0 ? (
        <p className="mt-4 rounded-[0.75rem] border bg-[var(--panel)] px-3 py-2 text-sm text-[var(--muted)]">
          No active runner assignments. Review the safe backlog and assignment status report before starting work.
        </p>
      ) : (
        <div className="mt-4 grid gap-3">
          {visibleRows.map((row) => (
            <Row key={`${row.id}:${row.classification}:${row.reasonCode}`} row={row} />
          ))}
        </div>
      )}

      {report.degradedInputs.length > 0 ? (
        <details className="mt-4 rounded-[0.75rem] border bg-[var(--panel)] px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold">Degraded evidence</summary>
          <div className="mt-2 grid gap-2">
            {report.degradedInputs.map((input, index) => (
              <p key={`${input.inputKind}:${input.path ?? index}`} className="break-all text-xs leading-5 text-[var(--muted)]">
                {input.severity}: {input.inputKind} {input.path ?? ""} {input.reason}
              </p>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
