import { Shell } from "../../components/shell";
import { getAuditEvents } from "../../lib/supervisor";

export default async function AuditPage() {
  const audits = await getAuditEvents();
  return (
    <Shell>
      <section className="rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
        <h2 className="text-2xl font-semibold">Audit history</h2>
        <div className="mt-6 space-y-4">
          {audits.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No audit events have been recorded yet.</p>
          ) : (
            audits.map((audit) => (
              <article key={audit.id} className="rounded-[1.25rem] border bg-white p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--accent)]">{audit.mode}</p>
                    <h3 className="mt-2 text-lg font-semibold">{audit.reason}</h3>
                    <p className="mt-2 text-sm text-[var(--muted)]">{audit.outcome}</p>
                  </div>
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{new Date(audit.createdAt).toLocaleString()}</div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </Shell>
  );
}
