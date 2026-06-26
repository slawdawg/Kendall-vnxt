import type { LocalWorktreePlanView } from "@kendall/contracts";

function commandText(parts: string[]): string {
  return parts.join(" ");
}

function BoundaryBadge({ label, allowed }: { label: string; allowed: boolean }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        allowed
          ? "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--accent)]"
          : "bg-[color-mix(in_srgb,var(--warn)_16%,transparent)] text-[var(--warn)]"
      }`}
    >
      {label} {allowed ? "on" : "off"}
    </span>
  );
}

export function LocalWorktreePlanPanel({ plan }: { plan: LocalWorktreePlanView }) {
  return (
    <section className="rounded-[0.5rem] border bg-[var(--panel)] p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Worktree plan</p>
          <h3 className="mt-2 text-xl font-semibold">Isolated workspace plan</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            Shows where this managed work would run in an isolated local worktree. This panel does not create, delete, push, merge, or clean up anything.
          </p>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--muted)]">{plan.status}</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <BoundaryBadge label="Create" allowed={plan.createAllowed} />
        <BoundaryBadge label="Cleanup" allowed={plan.cleanupAllowed} />
        <BoundaryBadge label="Remote" allowed={plan.remoteOperationsAllowed} />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Execution branch</p>
          <p className="mt-2 break-words font-mono text-sm">{plan.executionBranch}</p>
        </div>
        <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Base</p>
          <p className="mt-2 break-words font-mono text-sm">{plan.baseBranch}</p>
        </div>
        <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4 md:col-span-2">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Planned folder</p>
          <p className="mt-2 break-all font-mono text-sm">{plan.worktreePath}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
          <h4 className="text-base font-semibold">Planned commands</h4>
          <div className="mt-3 space-y-2">
            <p className="rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2 font-mono text-xs text-[var(--muted)]">
              {commandText(plan.createCommand)}
            </p>
            <p className="rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2 font-mono text-xs text-[var(--muted)]">
              {commandText(plan.cleanupCommand)}
            </p>
          </div>
        </div>

        <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
          <h4 className="text-base font-semibold">Blocked by</h4>
          <div className="mt-3 flex flex-wrap gap-2">
            {plan.blockedBy.map((reason) => (
              <span key={reason} className="rounded-full border bg-[var(--panel)] px-3 py-1 text-xs text-[var(--warn)]">
                {reason}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
          <h4 className="text-base font-semibold">Safety checks</h4>
          <div className="mt-3 space-y-2">
            {plan.safetyChecks.map((check) => (
              <p key={check} className="rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
                {check}
              </p>
            ))}
          </div>
        </div>

        <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
          <h4 className="text-base font-semibold">Evidence</h4>
          <div className="mt-3 space-y-2">
            {plan.evidence.map((item) => (
              <p key={item} className="rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
                {item}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
