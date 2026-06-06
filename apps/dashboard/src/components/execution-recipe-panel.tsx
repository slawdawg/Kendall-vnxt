import type { WorkItemExecutionRecipeView } from "@kendall/contracts";

export function ExecutionRecipePanel({ recipe }: { recipe: WorkItemExecutionRecipeView }) {
  return (
    <section className="rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Execution recipe</p>
        <h3 className="text-xl font-semibold">{recipe.label}</h3>
        <p className="text-sm text-[var(--muted)]">{recipe.summary}</p>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Branch prefix</p>
          <p className="mt-2 text-base font-semibold">{recipe.branchPrefix}</p>
        </div>
        <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Verification</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {recipe.verificationCommands.map((command) => (
              <span key={command} className="rounded-full bg-[var(--panel)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
                {command}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Allowed paths</p>
          <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
            {recipe.allowedPaths.map((path) => (
              <li key={path} className="font-mono">{path}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Autonomy guardrails</p>
          <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
            {recipe.autonomyNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
