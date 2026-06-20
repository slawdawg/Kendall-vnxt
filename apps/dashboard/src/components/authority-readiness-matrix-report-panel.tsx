import type {
  AuthorityReadinessFamilyView,
  AuthorityReadinessMatrixReportView,
  NextLaneDecisionPacketView,
} from "@kendall/contracts";
import Link from "next/link";

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

function AuthorityListSection({ title, items, scope }: { title: string; items: string[]; scope: string }) {
  return (
    <div className="rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">{title}</p>
      <div className="mt-2 space-y-1">
        {items.length > 0 ? (
          items.map((item, index) => (
            <p key={`${scope}:${title}:${item}:${index}`} className="break-all text-xs leading-5 text-[var(--muted)]">
              {item}
            </p>
          ))
        ) : (
          <p className="text-xs leading-5 text-[var(--warn)]">Missing required {title.toLowerCase()}.</p>
        )}
      </div>
    </div>
  );
}

const FALLBACK_NEXT_LANE_DECISION_PACKET: NextLaneDecisionPacketView = {
  packetId: "unavailable",
  status: "approval_required_payload_unavailable",
  recommendation: "Next-lane authority packet data is unavailable from the supervisor payload.",
  packetPath: "unavailable",
  approvalRequired: true,
  noAuthorityGranted: true,
  requiredFreshnessCheck: "Refresh the supervisor report before selecting or approving any lane.",
  relatedDocs: [],
  stopLines: ["Do not treat missing packet data as approval."],
  nextAction: "Refresh the report and re-check current authority state.",
};

function AuthorityFamilyCard({ family }: { family: AuthorityReadinessFamilyView }) {
  const isApprovalRequired = family.status.includes("blocked") || family.status.includes("approval_required");
  const statusKind = isApprovalRequired ? "blocked" : "review";

  return (
    <article
      data-family-id={family.familyId}
      data-status-kind={statusKind}
      className={`rounded-[1rem] border bg-[var(--panel)] p-3 ${isApprovalRequired ? "border-[var(--warn)]/40" : "border-[var(--accent)]/40"}`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{family.familyId}</p>
          <h5 className="mt-1 text-sm font-semibold">{family.label}</h5>
        </div>
        <span className={`w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-[11px] ${isApprovalRequired ? "text-[var(--warn)]" : "text-[var(--accent)]"}`}>
          {family.status}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{family.summary}</p>

      <div className="mt-3">
        <AuthorityListSection title="Required approvals" items={family.requiredApprovals} scope={family.familyId} />
      </div>

      <div className="mt-3">
        <AuthorityListSection title="Required evidence" items={family.requiredEvidence} scope={family.familyId} />
      </div>

      {family.blockedStories.length > 0 ? (
        <div className="mt-3 rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Blocked stories</p>
          <div className="mt-2 space-y-1">
            {family.blockedStories.map((story, index) => (
              <p key={`${family.familyId}:blocked-story:${story}:${index}`} className="break-all font-mono text-[11px] text-[var(--muted)]">
                {story}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <AuthorityListSection title="Related reports" items={family.relatedReports} scope={family.familyId} />
        <AuthorityListSection title="Related docs" items={family.relatedDocs} scope={family.familyId} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {family.dashboardAnchors.map((anchor) => (
          <Link key={`${family.familyId}:anchor:${anchor}`} href={anchor} className="rounded-full border bg-[var(--surface)] px-2 py-1 text-[11px] text-[var(--accent)]">
            {anchor}
          </Link>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        {family.stopLines.map((stopLine, index) => (
          <p key={`${family.familyId}:stop-line:${stopLine}:${index}`} className="rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs leading-5 text-[var(--warn)]">
            {stopLine}
          </p>
        ))}
      </div>

      <p className="mt-3 rounded-[0.75rem] border bg-[var(--surface)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
        <span className="font-semibold text-[var(--foreground)]">Rollback path:</span> {family.rollbackPath}
      </p>
      <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{family.nextAction}</p>
    </article>
  );
}

export function AuthorityReadinessMatrixReportPanel({ report }: { report: AuthorityReadinessMatrixReportView }) {
  const blockedFamilies = report.families.filter((family) => family.status.includes("blocked")).length;
  const blockedStories = report.families.reduce((count, family) => count + family.blockedStories.length, 0);
  const currentStateFindings = report.currentStateFindings ?? [];
  const nextLaneDecisionPacket = report.nextLaneDecisionPacket ?? FALLBACK_NEXT_LANE_DECISION_PACKET;
  const executionBlocked = nextLaneDecisionPacket.approvalRequired || nextLaneDecisionPacket.noAuthorityGranted;

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

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="rounded-[1.25rem] border bg-[var(--surface)] p-4">
          <h4 className="text-base font-semibold">Current-state reconciliation</h4>
          <div className="mt-3 grid gap-3">
            {currentStateFindings.map((finding) => (
              <article key={finding.findingId} className="rounded-[1rem] border bg-[var(--panel)] p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{finding.status}</p>
                    <h5 className="mt-1 text-sm font-semibold">{finding.label}</h5>
                  </div>
                  <span className="w-fit rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-[11px] text-[var(--muted)]">
                    {finding.findingId}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{finding.summary}</p>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <AuthorityListSection title="Evidence" items={finding.evidence} scope={finding.findingId} />
                  <AuthorityListSection title="Related docs" items={finding.relatedDocs} scope={finding.findingId} />
                </div>
                <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{finding.nextAction}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="rounded-[1.25rem] border border-[var(--warn)]/40 bg-[var(--surface)] p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--warn)]">
            {nextLaneDecisionPacket.status}
          </p>
          <h4 className="mt-1 text-base font-semibold">Next-lane authority packet</h4>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{nextLaneDecisionPacket.recommendation}</p>
          <p className="mt-3 break-all rounded-[0.75rem] border bg-[var(--panel)] px-3 py-2 font-mono text-xs text-[var(--muted)]">
            {nextLaneDecisionPacket.packetPath}
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <div className="rounded-[0.75rem] border bg-[var(--panel)] px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Approval required</p>
              <p className="mt-2 font-mono text-xs text-[var(--warn)]">{String(nextLaneDecisionPacket.approvalRequired)}</p>
            </div>
            <div className="rounded-[0.75rem] border bg-[var(--panel)] px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Execution blocked</p>
              <p className="mt-2 font-mono text-xs text-[var(--warn)]">{String(executionBlocked)}</p>
            </div>
          </div>
          <p className="mt-3 rounded-[0.75rem] border bg-[var(--panel)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
            <span className="font-semibold text-[var(--foreground)]">Freshness:</span> {nextLaneDecisionPacket.requiredFreshnessCheck}
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <AuthorityListSection title="Related docs" items={nextLaneDecisionPacket.relatedDocs} scope={nextLaneDecisionPacket.packetId} />
            <AuthorityListSection title="Stop lines" items={nextLaneDecisionPacket.stopLines} scope={nextLaneDecisionPacket.packetId} />
          </div>
          <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{nextLaneDecisionPacket.nextAction}</p>
        </div>
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
