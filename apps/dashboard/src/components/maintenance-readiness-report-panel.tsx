import type { MaintenanceReadinessReportView, MaintenanceReadinessTrackView } from "@kendall/contracts";
import Link from "next/link";
import { reportShortcutHref } from "../lib/report-shortcuts";

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

function TrackCard({ track }: { track: MaintenanceReadinessTrackView }) {
  return (
    <article className="rounded-[0.5rem] border bg-[var(--panel)] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{track.status}</p>
          <h5 className="mt-1 text-sm font-semibold">{track.label}</h5>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-[11px] text-[var(--muted)]">
          {track.trackId}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{track.summary}</p>
      <div className="mt-3 space-y-2">
        {track.evidence.map((item, itemIndex) => (
          <p key={`${track.trackId}:evidence:${item}:${itemIndex}`} className="rounded-[0.5rem] border bg-[var(--surface)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
            {item}
          </p>
        ))}
      </div>
      <div className="mt-3 rounded-[0.5rem] border bg-[var(--surface)] px-3 py-2">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Related reports</p>
        <div className="mt-2 grid gap-2">
          {track.relatedReports.map((report) => (
            <Link
              key={report}
              href={reportShortcutHref(report)}
              className="break-all rounded-[0.5rem] border bg-[var(--panel)] px-3 py-2 font-mono text-[11px] text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              {report}
            </Link>
          ))}
        </div>
      </div>
      <div className="mt-3 rounded-[0.5rem] border bg-[var(--surface)] px-3 py-2">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Related docs</p>
        <div className="mt-2 grid gap-2">
          {track.relatedDocs.map((doc, docIndex) => (
            <span
              key={`${track.trackId}:doc:${doc}:${docIndex}`}
              className="break-all rounded-[0.5rem] border bg-[var(--panel)] px-3 py-2 font-mono text-[11px] text-[var(--muted)]"
            >
              {doc}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {track.dashboardAnchors.map((anchor) => (
          <Link key={anchor} href={anchor} className="rounded-full border bg-[var(--surface)] px-2 py-1 text-[11px] text-[var(--accent)]">
            {anchor}
          </Link>
        ))}
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{track.nextAction}</p>
    </article>
  );
}

export function MaintenanceReadinessReportPanel({ report }: { report: MaintenanceReadinessReportView }) {
  const blockedTracks = report.tracks.filter((track) => track.status.includes("blocked")).length;

  return (
    <section className="rounded-[0.5rem] border bg-[var(--panel)] p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Maintenance readiness</p>
          <h3 className="mt-2 text-xl font-semibold">Safe work map</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{report.summary}</p>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
          {formatTimestamp(report.generatedAt)}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {[
          ["Tracks", String(report.tracks.length)],
          ["Blocked", String(blockedTracks)],
          ["Authority", report.executionAuthorityApproved ? "approved" : "not approved"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
            <p className="mt-2 text-sm font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
          <h4 className="text-base font-semibold">Maintenance tracks</h4>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {report.tracks.map((track) => (
              <TrackCard key={track.trackId} track={track} />
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
