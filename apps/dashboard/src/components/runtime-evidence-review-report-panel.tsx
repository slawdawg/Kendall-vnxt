import type { RuntimeEvidenceReviewReportView, RuntimeEvidenceReviewWorkItemView } from "@kendall/contracts";
import Link from "next/link";
import { reportShortcutHref } from "../lib/report-shortcuts";

function formatTimestamp(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "No events";
}

function WorkItemReviewCard({ item }: { item: RuntimeEvidenceReviewWorkItemView }) {
  return (
    <article className="rounded-[0.5rem] border bg-[var(--panel)] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{item.reviewPriority}</p>
          <h5 className="mt-1 text-sm font-semibold">{item.title}</h5>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-[11px] text-[var(--muted)]">
          {item.state}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{item.reviewReason}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {[
          ["Attempts", String(item.attemptCount)],
          ["Events", String(item.eventCount)],
          ["Reports", String(item.relatedReportCount)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[0.5rem] border bg-[var(--surface)] px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
            <p className="mt-1 text-sm font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 font-mono text-[11px] text-[var(--muted)]">{formatTimestamp(item.latestEventAt)}</p>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{item.recommendedAction}</p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <div className="rounded-[0.5rem] border bg-[var(--surface)] px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Related reports</p>
          <div className="mt-2 grid gap-2">
            {item.relatedReports.map((report, reportIndex) => (
              <Link
                key={`${item.workItemId}:report:${report}:${reportIndex}`}
                href={reportShortcutHref(report)}
                className="break-all rounded-[0.5rem] border bg-[var(--panel)] px-3 py-2 font-mono text-[11px] text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                {report}
              </Link>
            ))}
          </div>
        </div>
        <div className="rounded-[0.5rem] border bg-[var(--surface)] px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Related docs</p>
          <div className="mt-2 grid gap-2">
            {item.relatedDocs.map((doc, docIndex) => (
              <span
                key={`${item.workItemId}:doc:${doc}:${docIndex}`}
                className="break-all rounded-[0.5rem] border bg-[var(--panel)] px-3 py-2 font-mono text-[11px] text-[var(--muted)]"
              >
                {doc}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {item.dashboardAnchors.map((anchor, anchorIndex) => (
          <Link key={`${item.workItemId}:anchor:${anchor}:${anchorIndex}`} href={anchor} className="rounded-full border bg-[var(--surface)] px-2 py-1 text-[11px] text-[var(--accent)]">
            {anchor}
          </Link>
        ))}
      </div>
      <Link
        href={item.runtimeExportHref}
        className="mt-3 inline-flex w-fit rounded-full border bg-[var(--surface)] px-3 py-1 font-mono text-[11px] text-[var(--accent)]"
      >
        Open runtime export
      </Link>
    </article>
  );
}

export function RuntimeEvidenceReviewReportPanel({ report }: { report: RuntimeEvidenceReviewReportView }) {
  const attentionCount = report.workItems.filter((item) => item.needsAttention).length;
  const attemptCount = report.workItems.reduce((total, item) => total + item.attemptCount, 0);
  const eventCount = report.workItems.reduce((total, item) => total + item.eventCount, 0);

  return (
    <section className="rounded-[0.5rem] border bg-[var(--panel)] p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Runtime evidence review</p>
          <h3 className="mt-2 text-xl font-semibold">Work-item evidence queue</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{report.summary}</p>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
          {new Date(report.generatedAt).toLocaleString()}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        {[
          ["Items", String(report.workItems.length)],
          ["Attention", String(attentionCount)],
          ["Attempts", String(attemptCount)],
          ["Events", String(eventCount)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
            <p className="mt-2 text-sm font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
          <h4 className="text-base font-semibold">Review queue</h4>
          <div className="mt-3 grid gap-3">
            {report.reviewQueue.map((item) => (
              <WorkItemReviewCard key={item.workItemId} item={item} />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
            <h4 className="text-base font-semibold">Cross-check path</h4>
            <div className="mt-3 space-y-2">
              {report.crossChecks.map((crossCheck) => (
                <Link
                  key={`${crossCheck.label}:${crossCheck.report}`}
                  href={reportShortcutHref(crossCheck.report)}
                  className="block rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2 transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  <span className="text-xs font-semibold">{crossCheck.label}</span>
                  <span className="mt-1 block break-all font-mono text-[11px] text-[var(--muted)]">
                    {crossCheck.dashboardAnchor}
                  </span>
                  <span className="mt-1 block break-all font-mono text-[11px] text-[var(--muted)]">
                    {crossCheck.relatedDoc}
                  </span>
                  <span className="mt-2 block text-xs leading-5 text-[var(--muted)]">{crossCheck.reason}</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
            <h4 className="text-base font-semibold">Related reports</h4>
            <div className="mt-3 space-y-2">
              {report.relatedReports.map((reportEndpoint) => (
                <Link
                  key={reportEndpoint}
                  href={reportShortcutHref(reportEndpoint)}
                  className="block break-all rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2 font-mono text-xs text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  {reportEndpoint}
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
            <h4 className="text-base font-semibold">Related docs</h4>
            <div className="mt-3 space-y-2">
              {report.relatedDocs.map((doc, docIndex) => (
                <p
                  key={`${report.reportId}:doc:${doc}:${docIndex}`}
                  className="break-all rounded-[0.85rem] border bg-[var(--panel)] px-3 py-2 font-mono text-xs text-[var(--muted)]"
                >
                  {doc}
                </p>
              ))}
            </div>
          </div>

          <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
            <h4 className="text-base font-semibold">Dashboard anchors</h4>
            <div className="mt-3 flex flex-wrap gap-2">
              {report.dashboardAnchors.map((anchor, anchorIndex) => (
                <Link key={`${report.reportId}:anchor:${anchor}:${anchorIndex}`} href={anchor} className="rounded-full border bg-[var(--panel)] px-2 py-1 text-[11px] text-[var(--accent)]">
                  {anchor}
                </Link>
              ))}
            </div>
          </div>

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
