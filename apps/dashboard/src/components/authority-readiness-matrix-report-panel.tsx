import type { AuthorityReadinessFamilyView, AuthorityReadinessMatrixReportView } from "@kendall/contracts";
import Link from "next/link";

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

function AuthorityFamilyCard({ family }: { family: AuthorityReadinessFamilyView }) {
  return (
    <article className="rounded-[1rem] border bg-[var(--panel)] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{family.familyId}</p>
          <h5 className="mt-1 text-sm font-semibold">{family.label}</h5>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-[11px] text-[var(--muted)]">
          {family.status}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{family.summary}</p>

      <div className="mt-3 grid gap-2">
        {family.requiredApprovals.map((approval) => (
          <p key={approval} className="rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs leading-5 text-[var(--warn)]">
            {approval}
          </p>
        ))}
      </div>

      {family.blockedStories.length > 0 ? (
        <div className="mt-3 rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Blocked stories</p>
          <div className="mt-2 space-y-1">
            {family.blockedStories.map((story) => (
              <p key={story} className="break-all font-mono text-[11px] text-[var(--muted)]">
                {story}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {family.dashboardAnchors.map((anchor) => (
          <Link key={anchor} href={anchor} className="rounded-full border bg-[var(--surface)] px-2 py-1 text-[11px] text-[var(--accent)]">
            {anchor}
          </Link>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        {family.stopLines.map((stopLine) => (
          <p key={stopLine} className="rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs leading-5 text-[var(--warn)]">
            {stopLine}
          </p>
        ))}
      </div>

      <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{family.nextAction}</p>
    </article>
  );
}

export function AuthorityReadinessMatrixReportPanel({ report }: { report: AuthorityReadinessMatrixReportView }) {
  const blockedFamilies = report.families.filter((family) => family.status.includes("blocked")).length;
  const blockedStories = report.families.reduce((count, family) => count + family.blockedStories.length, 0);

  return (
    <section className="rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Authority readiness</p>
          <h3 className="mt-2 text-xl font-semibold">Execution authority matrix</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{report.summary}</p>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
          {formatTimestamp(report.generatedAt)}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {[
          ["Families", String(report.families.length)],
          ["Blocked", String(blockedFamilies)],
          ["Stories", String(blockedStories)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
            <p className="mt-2 text-sm font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
          <h4 className="text-base font-semibold">Authority families</h4>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {report.families.map((family) => (
              <AuthorityFamilyCard key={family.familyId} family={family} />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <h4 className="text-base font-semibold">Readiness ladder</h4>
            <div className="mt-3 space-y-3">
              {report.readinessLadder.map((step) => (
                <article key={step.stepId} className="rounded-[1rem] border bg-[var(--panel)] p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{step.status}</p>
                      <h5 className="mt-1 text-sm font-semibold">{step.label}</h5>
                    </div>
                    <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-[11px] text-[var(--muted)]">
                      {step.stepId}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{step.summary}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <h4 className="text-base font-semibold">Stop lines</h4>
            <div className="mt-3 space-y-2">
              {report.stopLines.map((stopLine) => (
                <p key={stopLine} className="rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2 text-xs leading-5 text-[var(--warn)]">
                  {stopLine}
                </p>
              ))}
            </div>
          </div>

          <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
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
