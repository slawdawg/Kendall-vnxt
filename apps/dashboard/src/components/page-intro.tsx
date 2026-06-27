export function PageIntro({
  eyebrow,
  title,
  description,
  metrics,
}: {
  eyebrow: string;
  title: string;
  description: string;
  metrics?: Array<{ label: string; value: string }>;
}) {
  return (
    <section className="rounded-[0.5rem] border bg-[var(--panel)] p-4 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">{eyebrow}</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{description}</p>
        </div>
        {metrics?.length ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <div key={metric.label} className="min-w-32 rounded-[0.5rem] border bg-[var(--surface)] p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{metric.label}</p>
                <p className="mt-1 text-xl font-semibold">{metric.value}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
