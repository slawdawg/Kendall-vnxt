import type { ManagedRecipePolicyReportView, WorkItemExecutionRecipeView } from "@kendall/contracts";

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

function RecipeCard({ recipe }: { recipe: WorkItemExecutionRecipeView }) {
  return (
    <article className="rounded-[0.5rem] border bg-[var(--panel)] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{recipe.id}</p>
          <h5 className="mt-1 text-sm font-semibold">{recipe.label}</h5>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-[11px] text-[var(--muted)]">
          {recipe.remoteAutomationPolicy.status}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{recipe.summary}</p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <div className="rounded-[0.5rem] border bg-[var(--surface)] px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Branch prefix</p>
          <p className="mt-1 font-mono text-xs">{recipe.branchPrefix}</p>
        </div>
        <div className="rounded-[0.5rem] border bg-[var(--surface)] px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Policy gates</p>
          <p className="mt-1 text-xs font-semibold">{recipe.policyGates.length}</p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {recipe.verificationCommands.map((command) => (
          <p key={command} className="rounded-[0.5rem] border bg-[var(--surface)] px-3 py-2 font-mono text-xs text-[var(--muted)]">
            {command}
          </p>
        ))}
      </div>
      <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{recipe.remoteAutomationPolicy.summary}</p>
      <p className="mt-2 break-words text-xs leading-5 text-[var(--muted)]">{recipe.remoteAutomationPolicy.blockedOperations.join(" | ")}</p>
    </article>
  );
}

export function ManagedRecipePolicyReportPanel({ report }: { report: ManagedRecipePolicyReportView }) {
  const totalGates = report.recipes.reduce((sum, recipe) => sum + recipe.policyGates.length, 0);

  return (
    <section className="rounded-[0.5rem] border bg-[var(--panel)] p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Managed recipes</p>
          <h3 className="mt-2 text-xl font-semibold">Policy report</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{report.summary}</p>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
          {formatTimestamp(report.generatedAt)}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {[
          ["Recipes", String(report.recipes.length)],
          ["Policy gates", String(totalGates)],
          ["Remote automation", report.remoteAutomationApproved ? "approved" : "blocked"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
            <p className="mt-2 text-sm font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
          <h4 className="text-base font-semibold">Recipe policies</h4>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {report.recipes.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
            <h4 className="text-base font-semibold">Stop lines</h4>
            <div className="mt-3 space-y-2">
              {report.stopLines.map((stopLine) => (
                <p key={stopLine} className="rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2 text-xs leading-5 text-[var(--warn)]">
                  {stopLine}
                </p>
              ))}
            </div>
          </div>

          <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
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
