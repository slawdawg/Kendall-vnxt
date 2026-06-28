import type { DocumentationAuthorityReportView } from "@kendall/contracts";

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

export function DocumentationAuthorityReportPanel({ report }: { report: DocumentationAuthorityReportView }) {
  const missingCount = [...report.indexes, report.approvalCheckpoint].filter((document) => document.status !== "present").length;

  return (
    <section className="rounded-[0.5rem] border bg-[var(--panel)] p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Documentation authority</p>
          <h3 className="mt-2 text-xl font-semibold">Indexes and approval stop lines</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{report.summary}</p>
        </div>
        <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
          {formatTimestamp(report.generatedAt)}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        {[
          ["Indexes", `${report.indexes.length} tracked`],
          ["Blocked stories", `${report.blockedStories.length} pending approval`],
          ["Missing docs", String(missingCount)],
          ["Legacy dispositions", `${report.legacyArtifactDispositions.length} proposed`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
            <p className="mt-2 text-sm font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
          <h4 className="text-base font-semibold">Current indexes</h4>
          <div className="mt-3 space-y-3">
            {[...report.indexes, report.approvalCheckpoint].map((document, documentIndex) => (
              <article key={`authority-document:${document.path}:${documentIndex}`} className="rounded-[0.5rem] border bg-[var(--panel)] p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{document.status}</p>
                    <h5 className="mt-1 text-sm font-semibold">{document.label}</h5>
                  </div>
                  <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-[11px] text-[var(--muted)]">
                    {document.path}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{document.evidence.join(" ")}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
            <h4 className="text-base font-semibold">Legacy artifact dispositions</h4>
            <div className="mt-3 space-y-3">
              {report.legacyArtifactDispositions.map((disposition) => (
                <article key={disposition.artifactId} className="rounded-[0.5rem] border bg-[var(--panel)] p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">
                        {disposition.recommendedDisposition.replaceAll("_", " ")}
                      </p>
                      <h5 className="mt-1 text-sm font-semibold">{disposition.label}</h5>
                    </div>
                    <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-[11px] text-[var(--muted)]">
                      {disposition.retentionPolicy.replaceAll("_", " ")}
                    </span>
                  </div>
                  <p className="mt-2 break-all text-xs leading-5 text-[var(--muted)]">{disposition.currentLocation}</p>
                  <ul className="mt-3 space-y-2 text-xs leading-5 text-[var(--muted)]">
                    {(
                      disposition.operatorActions.length > 0
                        ? disposition.operatorActions
                        : ["Review this disposition before changing source-owned documentation."]
                    ).map((action) => (
                      <li key={`${disposition.artifactId}:${action}`}>{action}</li>
                    ))}
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-[11px] text-[var(--muted)]">
                      source mutation {disposition.sourceMutationAllowed ? "allowed" : "blocked"}
                    </span>
                    <span className="rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-[11px] text-[var(--muted)]">
                      raw payload {disposition.rawPayloadRetained ? "retained" : "not retained"}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
            <h4 className="text-base font-semibold">Blocked authority stories</h4>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {report.blockedStories.map((story, storyIndex) => (
                <article key={`blocked-story:${story.path}:${storyIndex}`} className="rounded-[0.5rem] border bg-[var(--panel)] p-3">
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">Story {story.storyId}</p>
                  <h5 className="mt-1 text-sm font-semibold">{story.authorityFamily}</h5>
                  <p className="mt-2 break-all text-xs leading-5 text-[var(--muted)]">{story.path}</p>
                  <p className="mt-2 text-xs text-[var(--warn)]">{story.status.replaceAll("_", " ")}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-[0.5rem] border bg-[var(--surface)] p-4">
            <h4 className="text-base font-semibold">Drift checks</h4>
            <div className="mt-3 space-y-3">
              {report.driftChecks.map((check) => (
                <article key={check.stepId} className="rounded-[0.5rem] border bg-[var(--panel)] p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{check.status}</p>
                      <h5 className="mt-1 text-sm font-semibold">{check.label}</h5>
                    </div>
                    <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-[11px] text-[var(--muted)]">
                      {check.stepId}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{check.summary}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
