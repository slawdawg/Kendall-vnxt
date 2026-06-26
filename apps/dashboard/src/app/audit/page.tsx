import { AuditWorkbench } from "../../components/audit-workbench";
import { PageIntro } from "../../components/page-intro";
import { Shell } from "../../components/shell";
import Link from "next/link";
import { buildNavStats } from "../../lib/nav-stats";
import { getAuditEvents, getSavedOperatorViews, getWorkItems } from "../../lib/supervisor";

export default async function AuditPage() {
  const [audits, items, savedViews] = await Promise.all([
    getAuditEvents(),
    getWorkItems(),
    getSavedOperatorViews("audit"),
  ]);
  const awaitingAudit = items.filter((item) => item.state === "awaiting_audit");
  const completedWithAudit = items.filter((item) => item.state === "done" && item.auditMode !== "none");
  const navStats = buildNavStats(items);

  return (
    <Shell navStats={navStats}>
      <PageIntro
        eyebrow="Audit"
        title="Audit backlog and completion trail"
        description="Handle risk-gated approvals, clear the audit lane, and keep a readable record of why higher-risk work was accepted or rerouted."
        metrics={[
          { label: "Awaiting audit", value: String(awaitingAudit.length) },
          { label: "Required", value: String(awaitingAudit.filter((item) => item.auditMode === "required").length) },
          { label: "Advisory", value: String(awaitingAudit.filter((item) => item.auditMode === "advisory").length) },
          { label: "Audit records", value: String(audits.length) },
        ]}
      />
      <AuditWorkbench
        awaitingAudit={awaitingAudit}
        completedWithAudit={completedWithAudit}
        audits={audits}
        savedViews={savedViews}
      />

      <section className="rounded-[0.5rem] border bg-[var(--panel)] p-4 shadow-sm">
        <h2 className="text-xl font-semibold">Audit history</h2>
        <div className="mt-4 space-y-3">
          {audits.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No audit events have been recorded yet.</p>
          ) : (
            audits.map((audit) => (
              <article key={audit.id} className="rounded-[0.5rem] border bg-[var(--surface)] p-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--accent)]">{audit.mode}</p>
                    <h3 className="mt-2 text-lg font-semibold">
                      <Link href={`/work-items/${audit.workItemId}`} className="transition hover:text-[var(--accent)]">
                        {audit.reason}
                      </Link>
                    </h3>
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
