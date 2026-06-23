import type { RunnerAssignmentStatusReportView, RunnerAssignmentStatusRowView } from "@kendall/contracts";

function formatGenerated(value: string): string {
  return new Date(value).toLocaleString();
}

function labelFor(classification: string): string {
  if (classification === "blocked_stale_owner_needs_takeover") return "Stale";
  if (classification.startsWith("blocked_")) return "Blocked";
  return classification.replaceAll("_", " ");
}

function handoffCountEntries(row: RunnerAssignmentStatusRowView): [string, number][] {
  const preferredOrder = [
    "assignable",
    "active",
    "claimed",
    "ambiguous",
    "blocked_authority",
    "blocked_owned_active",
    "blocked_stale_owner_needs_takeover",
    "closed",
  ];
  const counts = row.handoffCandidateStateCounts ?? {};
  return [
    ...preferredOrder.filter((key) => Object.hasOwn(counts, key)),
    ...Object.keys(counts)
      .filter((key) => !preferredOrder.includes(key))
      .sort(),
  ].map((key) => [key, counts[key]]);
}

function Row({ row }: { row: RunnerAssignmentStatusRowView }) {
  const hasAvailableHandoff = row.handoffStatus === "available";
  const countEntries = handoffCountEntries(row);

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
        <span className="rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)]">handoff: {row.handoffStatus}</span>
        <span className="rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)]">lifecycle: {row.handoffLifecycleState}</span>
      </div>
      <p className="mt-3 rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs leading-5 text-[var(--accent)]">{row.nextSafeAction}</p>
      {row.currentCommand ? <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Current command: {row.currentCommand}</p> : null}
      {row.lastResult ? <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Last result: {row.lastResult}</p> : null}
      {hasAvailableHandoff ? (
        <div className="mt-3 rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
          <p className="font-semibold text-[var(--foreground)]">Resume packet</p>
          <p className="break-all">Owner: {row.owner ?? "none"}</p>
          <p className="break-all">Branch: {row.branch ?? "none"}</p>
          <p>Worktree state: {row.worktreeState}</p>
          {row.handoffNextCommand ? <p className="break-all">Next command: {row.handoffNextCommand}</p> : null}
          {row.handoffGeneratedAt ? <p className="break-all">Generated: {row.handoffGeneratedAt}</p> : null}
          {row.handoffReadinessStatus || row.handoffReadinessCommand ? (
            <p className="break-all">
              Readiness: {row.handoffReadinessStatus ?? "missing"}
              {row.handoffReadinessCommand ? ` via ${row.handoffReadinessCommand}` : ""}
            </p>
          ) : null}
          {row.handoffSummary ? <p className="break-all">Summary: {row.handoffSummary}</p> : null}
          <p>Lifecycle: {row.handoffLifecycleState}</p>
          <p>Queue counts: {row.handoffCandidateStateCountsStatus}</p>
          {countEntries.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {countEntries.map(([state, count]) => (
                <span key={`${row.id}:handoff-count:${state}`} className="rounded-full border bg-[var(--panel)] px-2 py-1 font-mono text-[11px] text-[var(--muted)]">
                  {state.replaceAll("_", " ")}: {count}
                </span>
              ))}
            </div>
          ) : null}
          {row.handoffTakeoverStopLines.length > 0 ? (
            <ul className="mt-1 grid gap-1 text-[var(--warn)]">
              {row.handoffTakeoverStopLines.map((stopLine) => (
                <li key={`${row.id}:resume-stop:${stopLine}`} className="break-all">
                  Stop: {stopLine}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {!hasAvailableHandoff && row.handoffNextCommand ? (
        <p className="mt-1 break-all text-xs leading-5 text-[var(--muted)]">Handoff next: {row.handoffNextCommand}</p>
      ) : null}
      {!hasAvailableHandoff && row.handoffGeneratedAt ? (
        <p className="mt-1 break-all text-xs leading-5 text-[var(--muted)]">Handoff generated: {row.handoffGeneratedAt}</p>
      ) : null}
      {!hasAvailableHandoff && (row.handoffReadinessStatus || row.handoffReadinessCommand) ? (
        <p className="mt-1 break-all text-xs leading-5 text-[var(--muted)]">
          Handoff readiness: {row.handoffReadinessStatus ?? "missing"}
          {row.handoffReadinessCommand ? ` via ${row.handoffReadinessCommand}` : ""}
        </p>
      ) : null}
      {!hasAvailableHandoff && row.handoffSummary ? (
        <p className="mt-1 break-all text-xs leading-5 text-[var(--muted)]">Handoff summary: {row.handoffSummary}</p>
      ) : null}
      {!hasAvailableHandoff && row.handoffTakeoverStopLines.length > 0 ? (
        <ul className="mt-2 grid gap-1 text-xs leading-5 text-[var(--warn)]">
          {row.handoffTakeoverStopLines.map((stopLine) => (
            <li key={`${row.id}:handoff-stop:${stopLine}`} className="break-all">
              Handoff stop: {stopLine}
            </li>
          ))}
        </ul>
      ) : null}
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

      <div className="mt-4 rounded-[0.75rem] border bg-[var(--panel)] px-3 py-2">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Dispatcher continuity snapshot</p>
        <p className="mt-1 text-sm font-semibold">{report.dispatcherContinuity.snapshotId}</p>
        <div className="mt-2 grid gap-1 text-xs leading-5 text-[var(--muted)] sm:grid-cols-2">
          <p className="break-all">Candidate: {report.dispatcherContinuity.selectedBacklogItemId ?? "none"}</p>
          <p className="break-all">Branch: {report.dispatcherContinuity.selectedBranch ?? "none"}</p>
          <p className="break-all">Dry run: {report.dispatcherContinuity.dryRunCommand}</p>
          <p>Assignable: {report.dispatcherContinuity.assignableCount}</p>
          <p>Active: {report.dispatcherContinuity.activeCount}</p>
          <p>Blocked: {report.dispatcherContinuity.blockedCount}</p>
          <p>Ambiguous: {report.dispatcherContinuity.ambiguousCount}</p>
          <p>Closed: {report.dispatcherContinuity.closedCount}</p>
        </div>
        {report.dispatcherContinuity.blockerCodes.length > 0 ? (
          <p className="mt-2 break-all text-xs leading-5 text-[var(--muted)]">Blockers: {report.dispatcherContinuity.blockerCodes.join(", ")}</p>
        ) : null}
        <div className="mt-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Queue proof</p>
          <div className="mt-2 grid gap-1 text-xs leading-5 text-[var(--muted)]">
            {report.dispatcherContinuity.queueProofRows.map((row) => (
              <p key={`${row.backlogItemId}:${row.classification}:${row.reasonCode}`} className="break-all">
                {row.backlogItemId}: {row.classification} ({row.reasonCode}) {row.branch ? `branch ${row.branch}` : "no branch"}
              </p>
            ))}
          </div>
        </div>
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{report.dispatcherContinuity.nextAction}</p>
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
