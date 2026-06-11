import type { GitHygieneReportView, GitHygieneSignalView } from "@kendall/contracts";

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

function statusClass(status: string): string {
  if (["clean", "configured", "detected"].includes(status)) {
    return "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--accent)]";
  }
  if (["not_queried", "not_configured"].includes(status)) {
    return "bg-[color-mix(in_srgb,var(--accent-2)_16%,transparent)] text-[var(--accent-2)]";
  }
  return "bg-[color-mix(in_srgb,var(--warn)_16%,transparent)] text-[var(--warn)]";
}

function SignalCard({ signal }: { signal: GitHygieneSignalView }) {
  return (
    <article className="rounded-[1rem] border bg-[var(--panel)] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{signal.signalId}</p>
          <h5 className="mt-1 text-sm font-semibold">{signal.label}</h5>
        </div>
        <span className={`w-fit rounded-full px-3 py-1 font-mono text-[11px] ${statusClass(signal.status)}`}>{signal.status}</span>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{signal.summary}</p>
      <div className="mt-3 space-y-2">
        {signal.evidence.map((evidence) => (
          <p key={evidence} className="rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 font-mono text-xs text-[var(--muted)]">
            {evidence}
          </p>
        ))}
      </div>
    </article>
  );
}

export function GitHygieneReportPanel({ report }: { report: GitHygieneReportView }) {
  const changedCount = Object.values(report.statusCounts).reduce((total, value) => total + value, 0);

  return (
    <section className="rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Git hygiene</p>
          <h3 className="mt-2 text-xl font-semibold">Repository readiness</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{report.summary}</p>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
          {formatTimestamp(report.generatedAt)}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Branch", report.currentBranch],
          ["Changed files", String(changedCount)],
          ["Worktrees", String(report.worktrees.length)],
          ["Remote checks", "not queried"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
            <p className="mt-2 break-words text-sm font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="space-y-4">
          <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <h4 className="text-base font-semibold">Local snapshot</h4>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {report.localSignals.map((signal) => (
                <SignalCard key={signal.signalId} signal={signal} />
              ))}
            </div>
          </div>

          <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <h4 className="text-base font-semibold">Worktrees</h4>
              <span className="w-fit rounded-full bg-[var(--panel)] px-3 py-1 text-xs text-[var(--muted)]">read-only inventory</span>
            </div>
            <div className="mt-3 grid gap-3">
              {report.worktrees.slice(0, 6).map((worktree) => (
                <article key={worktree.path} className="rounded-[1rem] border bg-[var(--panel)] p-3">
                  <p className="break-words text-sm font-semibold">{worktree.branch ?? "Detached worktree"}</p>
                  <p className="mt-1 break-all font-mono text-xs text-[var(--muted)]">{worktree.path}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                    <span className="rounded-full bg-[var(--surface)] px-3 py-1">head {worktree.head ?? "unknown"}</span>
                    <span className="rounded-full bg-[var(--surface)] px-3 py-1">locked {worktree.locked ? "yes" : "no"}</span>
                    <span className="rounded-full bg-[var(--surface)] px-3 py-1">cleanup {worktree.prunable ? "review" : "blocked"}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <h4 className="text-base font-semibold">PR and CI</h4>
            <div className="mt-3 grid gap-3">
              {report.remoteSignals.map((signal) => (
                <SignalCard key={signal.signalId} signal={signal} />
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
