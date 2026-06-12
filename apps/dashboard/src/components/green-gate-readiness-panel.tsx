import type { ExecutionAttemptView, TrustedDeliveryEligibilityReportView } from "@kendall/contracts";

function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function statusClass(status: string): string {
  if (["passed", "eligible", "completed", "green"].includes(status)) {
    return "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--accent)]";
  }
  if (["running", "starting", "not_recorded", "stale"].includes(status)) {
    return "bg-[var(--surface)] text-[var(--muted)]";
  }
  return "bg-[color-mix(in_srgb,var(--warn)_14%,transparent)] text-[var(--warn)]";
}

function evidenceString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function latestArtifact(attempts: ExecutionAttemptView[], artifactType: string): Record<string, unknown> | null {
  const newestAttempts = [...attempts].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  for (const attempt of newestAttempts) {
    const refs = [...attempt.artifactRefs].reverse();
    const match = refs.find((ref) => ref.artifactType === artifactType);
    if (match) {
      return match;
    }
  }
  return null;
}

function ReadinessRow({
  label,
  status,
  summary,
  nextAction,
}: {
  label: string;
  status: string;
  summary: string;
  nextAction: string;
}) {
  return (
    <div className="grid gap-3 border-t border-[var(--border)] py-3 first:border-t-0 sm:grid-cols-[10rem_minmax(0,1fr)]">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
        <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${statusClass(status)}`}>{titleCase(status)}</span>
      </div>
      <div className="min-w-0">
        <p className="text-sm leading-6">{summary}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{nextAction}</p>
      </div>
    </div>
  );
}

export function GreenGateReadinessPanel({
  report,
  attempts,
}: {
  report: TrustedDeliveryEligibilityReportView;
  attempts: ExecutionAttemptView[];
}) {
  const pushStage = report.stages.find((stage) => stage.stageId === "push-pr-auto-eligible");
  const mergeStage = report.stages.find((stage) => stage.stageId === "merge-auto-eligible");
  const cleanupStage = report.stages.find((stage) => stage.stageId === "cleanup-auto-eligible");
  const diffGuardCheck = pushStage?.checks.find((check) => check.checkId === "diff-guard");
  const verificationEvidence = latestArtifact(attempts, "verification_result");
  const launchEvidence = latestArtifact(attempts, "supervised_codex_launch_evidence");
  const failedAttempt = attempts.find((attempt) => ["failed", "timed_out", "rejected"].includes(attempt.status));
  const runningAttempt = attempts.find((attempt) => ["starting", "running", "cancel_requested"].includes(attempt.status));
  const latestAttempt = attempts[0] ?? null;

  const verificationStatus = evidenceString(verificationEvidence?.status, "not_recorded");
  const verificationSummary = evidenceString(verificationEvidence?.summary, "Verification evidence is missing.");
  const allDeliveryGatesGreen =
    report.pushPrAutoEligible && report.mergeAutoEligible && report.cleanupAutoEligible && report.automaticDeliveryApproved;
  const overallStatus = allDeliveryGatesGreen
    ? "green"
    : runningAttempt
      ? "running"
      : failedAttempt
        ? "failed"
        : "blocked";

  return (
    <section id="green-gate-readiness" className="scroll-mt-28 rounded-[1.75rem] border bg-[var(--panel)] p-6 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">Green gate</p>
          <h3 className="mt-2 text-xl font-semibold">Delivery readiness</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            Readiness comes from supervisor evidence. Missing checks stay missing until evidence is recorded.
          </p>
        </div>
        <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${statusClass(overallStatus)}`}>{titleCase(overallStatus)}</span>
      </div>

      <div className="mt-5 rounded-[1.25rem] border bg-[var(--surface)] px-4">
        <ReadinessRow
          label="Scope"
          status={pushStage?.status ?? "not_recorded"}
          summary={pushStage ? `${pushStage.label} is ${pushStage.status}.` : "Scope evidence is missing."}
          nextAction={pushStage?.nextAction ?? "Record work scope before delivery."}
        />
        <ReadinessRow
          label="Diff guard"
          status={diffGuardCheck?.status ?? report.diffGuard.status}
          summary={diffGuardCheck?.summary ?? report.diffGuard.recommendation}
          nextAction={report.diffGuard.blockedPaths.length ? `Blocked paths: ${report.diffGuard.blockedPaths.join(", ")}` : report.diffGuard.recommendation}
        />
        <ReadinessRow
          label="Verification"
          status={verificationStatus}
          summary={verificationSummary}
          nextAction={evidenceString(verificationEvidence?.recoveryAction, "Run and record the approved verification command.")}
        />
        <ReadinessRow
          label="Worker attempt"
          status={latestAttempt?.status ?? "not_started"}
          summary={
            latestAttempt
              ? `${latestAttempt.workerId} recorded ${latestAttempt.status}.`
              : "No supervised worker attempt evidence has been recorded."
          }
          nextAction={evidenceString(launchEvidence?.recoveryPath, "Create supervised launch evidence before delivery.")}
        />
        <ReadinessRow
          label="CI"
          status={report.stages.find((stage) => stage.stageId === "ci-review-auto-eligible")?.status ?? "not_recorded"}
          summary="CI evidence is read from retained supervisor state; no CI wait is approved here."
          nextAction="Record PR and CI evidence only after delivery authority is approved."
        />
        <ReadinessRow
          label="Merge"
          status={mergeStage?.status ?? "not_recorded"}
          summary={mergeStage ? `${mergeStage.label} is ${mergeStage.status}.` : "Merge evidence is missing."}
          nextAction="Merge still requires separate explicit approval."
        />
        <ReadinessRow
          label="Cleanup"
          status={cleanupStage?.status ?? "not_recorded"}
          summary={cleanupStage ? `${cleanupStage.label} is ${cleanupStage.status}.` : "Cleanup evidence is missing."}
          nextAction="Cleanup still requires exact target evidence and separate approval."
        />
        <ReadinessRow
          label="Authority"
          status={report.automaticDeliveryApproved ? "green" : "blocked"}
          summary={report.automaticDeliveryApproved ? "Automatic delivery is approved." : "Delivery authority is not approved by this panel."}
          nextAction="Use this panel for readiness only; it does not launch workers, create PRs, merge, or clean up."
        />
      </div>
    </section>
  );
}
