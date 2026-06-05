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
    <section className="rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">{eyebrow}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{description}</p>
        </div>
        {metrics?.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <div key={metric.label} className="min-w-36 rounded-[1.25rem] border bg-[var(--surface)] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{metric.label}</p>
                <p className="mt-2 text-2xl font-semibold">{metric.value}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
