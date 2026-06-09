import type { DevelopmentRunwayReportView, DevelopmentRunwaySliceView } from "@kendall/contracts";
import Link from "next/link";
import { reportShortcutHref } from "../lib/report-shortcuts";

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

function SliceCard({ slice }: { slice: DevelopmentRunwaySliceView }) {
  return (
    <article className="rounded-[1rem] border bg-[var(--panel)] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{slice.status}</p>
          <h5 className="mt-1 text-sm font-semibold">{slice.label}</h5>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-[11px] text-[var(--muted)]">
          {slice.sliceId}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{slice.summary}</p>
      <p className="mt-3 rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
        {slice.recommendedPrScope}
      </p>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <div className="rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Backlog</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {slice.includedBacklogItems.map((item) => (
              <span key={item} className="rounded-full border bg-[var(--panel)] px-2 py-1 font-mono text-[11px] text-[var(--muted)]">
                {item}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Action steps</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {slice.includedActionSteps.map((step) => (
              <span key={step} className="rounded-full border bg-[var(--panel)] px-2 py-1 font-mono text-[11px] text-[var(--muted)]">
                {step}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Required verification</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {slice.requiredVerification.map((command) => (
            <span key={command} className="rounded-full border bg-[var(--panel)] px-2 py-1 font-mono text-[11px] text-[var(--muted)]">
              {command}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Readiness checks</p>
        <div className="mt-2 grid gap-2">
          {slice.readinessChecks.map((check) => (
            <div key={check.checkId} className="rounded-[0.75rem] border bg-[var(--panel)] p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{check.status}</p>
                  <p className="mt-1 text-sm font-semibold">{check.label}</p>
                </div>
                <span className="w-fit rounded-full bg-[var(--surface)] px-2 py-1 font-mono text-[11px] text-[var(--muted)]">
                  {check.checkId}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{check.summary}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {check.requiredCommandIds.map((commandId) => (
                  <span key={commandId} className="rounded-full border bg-[var(--surface)] px-2 py-1 font-mono text-[11px] text-[var(--muted)]">
                    {commandId}
                  </span>
                ))}
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <div className="rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Related reports</p>
                  <div className="mt-2 grid gap-2">
                    {check.relatedReports.map((report) => (
                      <Link
                        key={report}
                        href={reportShortcutHref(report)}
                        className="break-all rounded-[0.75rem] border bg-[var(--panel)] px-3 py-2 font-mono text-[11px] text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      >
                        {report}
                      </Link>
                    ))}
                  </div>
                </div>
                <div className="rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Related docs</p>
                  <div className="mt-2 grid gap-2">
                    {check.relatedDocs.map((doc) => (
                      <span key={doc} className="break-all rounded-[0.75rem] border bg-[var(--panel)] px-3 py-2 font-mono text-[11px] text-[var(--muted)]">
                        {doc}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {check.dashboardAnchors.map((anchor) => (
                  <Link key={anchor} href={anchor} className="rounded-full border bg-[var(--surface)] px-2 py-1 text-[11px] text-[var(--accent)]">
                    {anchor}
                  </Link>
                ))}
              </div>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{check.nextAction}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <div className="rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Related reports</p>
          <div className="mt-2 grid gap-2">
            {slice.relatedReports.map((report) => (
              <Link
                key={report}
                href={reportShortcutHref(report)}
                className="break-all rounded-[0.75rem] border bg-[var(--panel)] px-3 py-2 font-mono text-[11px] text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                {report}
              </Link>
            ))}
          </div>
        </div>
        <div className="rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Related docs</p>
          <div className="mt-2 grid gap-2">
            {slice.relatedDocs.map((doc) => (
              <span key={doc} className="break-all rounded-[0.75rem] border bg-[var(--panel)] px-3 py-2 font-mono text-[11px] text-[var(--muted)]">
                {doc}
              </span>
            ))}
          </div>
        </div>
      </div>

      {slice.blockedBy.length > 0 ? (
        <div className="mt-3 space-y-2">
          {slice.blockedBy.map((blocker) => (
            <p key={blocker} className="rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs leading-5 text-[var(--warn)]">
              {blocker}
            </p>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {slice.dashboardAnchors.map((anchor) => (
          <Link key={anchor} href={anchor} className="rounded-full border bg-[var(--surface)] px-2 py-1 text-[11px] text-[var(--accent)]">
            {anchor}
          </Link>
        ))}
      </div>

      <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{slice.nextAction}</p>
    </article>
  );
}

export function DevelopmentRunwayReportPanel({ report }: { report: DevelopmentRunwayReportView }) {
  const readySlices = report.slices.filter((slice) => slice.status === "ready").length;
  const blockedSlices = report.slices.filter((slice) => slice.status.includes("blocked")).length;

  return (
    <section className="rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Development runway</p>
          <h3 className="mt-2 text-xl font-semibold">Larger PR slice planner</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{report.summary}</p>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
          {formatTimestamp(report.generatedAt)}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        {[
          ["Slices", String(report.slices.length)],
          ["Ready", String(readySlices)],
          ["Blocked", String(blockedSlices)],
          ["Authority", report.executionAuthorityApproved ? "approved" : "not approved"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
            <p className="mt-2 text-sm font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
          <h4 className="text-base font-semibold">Runway slices</h4>
          <div className="mt-3 grid gap-3">
            {report.slices.map((slice) => (
              <SliceCard key={slice.sliceId} slice={slice} />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <h4 className="text-base font-semibold">PR scope rule</h4>
            <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{report.planningRule}</p>
            <p className="mt-3 rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
              {report.minimumPrScope}
            </p>
          </div>

          <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <h4 className="text-base font-semibold">Batching policy</h4>
            <div className="mt-3 space-y-2">
              {report.batchingPolicy.map((policy) => (
                <p key={policy} className="rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
                  {policy}
                </p>
              ))}
            </div>
          </div>

          <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <h4 className="text-base font-semibold">PR batching checklist</h4>
            <div className="mt-3 space-y-2">
              {report.prBatchingChecklist.map((item) => (
                <p key={item} className="rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
                  {item}
                </p>
              ))}
            </div>
          </div>

          <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
            <h4 className="text-base font-semibold">Verification chain</h4>
            <div className="mt-3 flex flex-wrap gap-2">
              {report.verificationChain.map((command) => (
                <span key={command} className="rounded-full border bg-[var(--panel)] px-2 py-1 font-mono text-[11px] text-[var(--muted)]">
                  {command}
                </span>
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
