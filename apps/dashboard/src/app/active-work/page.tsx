import { Shell } from "../../components/shell";
import { getWorkItems } from "../../lib/supervisor";

export default async function ActiveWorkPage() {
  const items = (await getWorkItems()).filter((item) =>
    ["implementing", "validating", "reviewing"].includes(item.state),
  );

  return (
    <Shell>
      <section className="rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
        <h2 className="text-2xl font-semibold">Active work</h2>
        <div className="mt-6 space-y-4">
          {items.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No work is currently active.</p>
          ) : (
            items.map((item) => (
              <article key={item.id} className="rounded-[1.25rem] border bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--accent)]">{item.state}</p>
                    <h3 className="mt-2 text-xl font-semibold">{item.title}</h3>
                    <p className="mt-2 text-sm text-[var(--muted)]">{item.statusSummary}</p>
                  </div>
                  <div className="rounded-full bg-[var(--panel-strong)] px-3 py-1 text-xs uppercase tracking-[0.18em]">
                    {item.nextStep ?? "Pending"}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </Shell>
  );
}
