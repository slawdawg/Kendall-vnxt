import type { WorkItemExecutionRecipeView } from "@kendall/contracts";

export function ExecutionRecipePanel({ recipe }: { recipe: WorkItemExecutionRecipeView }) {
  return (
    <section className="rounded-[0.5rem] border bg-[var(--panel)] p-4 shadow-sm">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Execution recipe</p>
        <h3 className="text-xl font-semibold">{recipe.label}</h3>
        <p className="text-sm text-[var(--muted)]">{recipe.summary}</p>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Branch prefix</p>
          <p className="mt-2 text-base font-semibold">{recipe.branchPrefix}</p>
        </div>
        <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Verification</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {recipe.verificationCommands.map((command) => (
              <span key={command} className="rounded-full bg-[var(--panel)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
                {command}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4 md:col-span-2">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Implementation automation</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {recipe.implementationCommands.map((command) => (
              <span key={command} className="rounded-full bg-[var(--panel)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
                {command}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Allowed paths</p>
          <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
            {recipe.allowedPaths.map((path) => (
              <li key={path} className="font-mono">{path}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Autonomy guardrails</p>
          <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
            {recipe.autonomyNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Policy gates</p>
          <div className="mt-3 space-y-3">
            {recipe.policyGates.map((gate) => (
              <div key={gate.id} className="border-l-2 border-[var(--accent)] pl-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{gate.label}</p>
                  <span className="rounded-full bg-[var(--panel)] px-2 py-1 text-xs text-[var(--muted)]">Before {gate.requiredBefore}</span>
                </div>
                <p className="mt-1 text-sm text-[var(--muted)]">{gate.summary}</p>
                <p className="mt-2 font-mono text-xs text-[var(--muted)]">{gate.evidence.join(" + ")}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Operator checkpoints</p>
          <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
            {recipe.operatorCheckpoints.map((checkpoint) => (
              <li key={checkpoint}>{checkpoint}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-5 rounded-[0.5rem] border bg-[var(--surface)] p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Remote automation policy</p>
            <p className="mt-2 text-sm text-[var(--muted)]">{recipe.remoteAutomationPolicy.summary}</p>
          </div>
          <span className="w-fit rounded-full bg-[var(--panel)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            {recipe.remoteAutomationPolicy.status}
          </span>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Allowed now</p>
            <ul className="mt-2 space-y-1 text-sm text-[var(--muted)]">
              {recipe.remoteAutomationPolicy.allowedOperations.map((operation) => (
                <li key={operation}>{operation}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Blocked</p>
            <ul className="mt-2 space-y-1 text-sm text-[var(--muted)]">
              {recipe.remoteAutomationPolicy.blockedOperations.map((operation) => (
                <li key={operation}>{operation}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Approval requirements</p>
            <ul className="mt-2 space-y-1 text-sm text-[var(--muted)]">
              {recipe.remoteAutomationPolicy.approvalRequirements.map((requirement) => (
                <li key={requirement}>{requirement}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
