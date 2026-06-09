import type { ExecutionAttemptStatus, ExecutionAttemptView, WorkspaceIsolationPlanView } from "@kendall/contracts";

function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replaceAll(".", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function statusClass(status: ExecutionAttemptStatus): string {
  if (status === "planned" || status === "approved") {
    return "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--accent)]";
  }
  if (status === "running" || status === "starting" || status === "cancel_requested") {
    return "bg-[color-mix(in_srgb,var(--accent-2)_16%,transparent)] text-[var(--accent-2)]";
  }
  if (status === "rejected" || status === "failed" || status === "timed_out") {
    return "bg-[color-mix(in_srgb,var(--warn)_14%,transparent)] text-[var(--warn)]";
  }
  return "bg-[var(--surface)] text-[var(--muted)]";
}

function formatTimestamp(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : "Not recorded";
}

function pathList(paths: string[]): string {
  if (paths.length === 0) {
    return "None";
  }
  return paths.slice(0, 4).join(", ");
}

function DisabledEvidence({ plan }: { plan: WorkspaceIsolationPlanView }) {
  const disabled: Array<[string, boolean]> = [
    ["Writes", plan.writesAllowed],
    ["Source mutation", plan.sourceMutationAllowed],
    ["Commands", plan.commandsAllowed],
    ["Network", plan.networkAllowed],
    ["Credentials", plan.credentialAccessAllowed],
  ];

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {disabled.map(([label, allowed]) => (
        <span
          key={label}
          className={`rounded-full border px-3 py-1 text-xs ${
            allowed ? "border-[var(--warn)]/40 text-[var(--warn)]" : "bg-[var(--panel)] text-[var(--muted)]"
          }`}
        >
          {label}: {allowed ? "allowed" : "disabled"}
        </span>
      ))}
    </div>
  );
}

function AttemptCard({ attempt }: { attempt: ExecutionAttemptView }) {
  const plan = attempt.workspaceIsolationPlan;

  return (
    <article className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{attempt.workerId}</p>
          <h4 className="mt-2 text-base font-semibold">{titleCase(attempt.lane)} attempt</h4>
          <p className="mt-2 break-all font-mono text-xs text-[var(--muted)]">{attempt.routeDecisionId}</p>
        </div>
        <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${statusClass(attempt.status)}`}>
          {titleCase(attempt.status)}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Authority", titleCase(attempt.authorityMode)],
          ["Created", formatTimestamp(attempt.createdAt)],
          ["Updated", formatTimestamp(attempt.updatedAt)],
          ["Completed", formatTimestamp(attempt.completedAt)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[1rem] border bg-[var(--panel)] p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
            <p className="mt-2 text-sm font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {attempt.cancelReason || attempt.rejectionReason || attempt.failureReason ? (
        <div className="mt-4 rounded-[1rem] border border-[color-mix(in_srgb,var(--warn)_28%,transparent)] bg-[color-mix(in_srgb,var(--warn)_8%,transparent)] p-3">
          <p className="text-sm font-semibold text-[var(--warn)]">{attempt.cancelReason ?? attempt.rejectionReason ?? attempt.failureReason}</p>
        </div>
      ) : null}

      <div className="mt-4 rounded-[1rem] border bg-[var(--panel)] p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Workspace isolation</p>
            <p className="mt-2 text-sm font-semibold">{plan.branchStrategy}</p>
          </div>
          <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--muted)]">{plan.planId}</span>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">Read roots</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{pathList(plan.readRoots)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">Write roots</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{pathList(plan.writeRoots)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">Artifact root</p>
            <p className="mt-1 break-all font-mono text-xs text-[var(--muted)]">{plan.artifactRoot}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">Forbidden paths</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{pathList(plan.forbiddenPaths)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">Materialization</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{titleCase(plan.materializationMode)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">Environment</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{titleCase(plan.environmentPolicy)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">Session boundary</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{titleCase(plan.sessionBoundary)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">Output policy</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{titleCase(plan.outputPolicy)}</p>
          </div>
        </div>
        <DisabledEvidence plan={plan} />
        <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{plan.rollbackRule}</p>
      </div>
    </article>
  );
}

export function ExecutionAttemptEvidencePanel({ attempts }: { attempts: ExecutionAttemptView[] }) {
  const latest = attempts[0] ?? null;

  return (
    <section id="execution-attempts" className="scroll-mt-28 rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Execution attempts</p>
          <h3 className="mt-2 text-xl font-semibold">Attempt evidence</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Attempts remain control-plane evidence only; worker launch, provider calls, commands, and source mutation stay disabled here.
          </p>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
          {attempts.length} recorded
        </span>
      </div>

      {latest ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Latest status", titleCase(latest.status)],
            ["Worker", latest.workerId],
            ["Lane", titleCase(latest.lane)],
            ["Mutation", latest.workspaceIsolationPlan.sourceMutationAllowed ? "Allowed" : "Disabled"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
              <p className="mt-2 text-sm font-semibold">{value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {attempts.length === 0 ? (
          <p className="rounded-[1.25rem] border bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
            No execution attempts have been recorded for this work item.
          </p>
        ) : (
          attempts.map((attempt) => <AttemptCard key={attempt.attemptId} attempt={attempt} />)
        )}
      </div>
    </section>
  );
}
