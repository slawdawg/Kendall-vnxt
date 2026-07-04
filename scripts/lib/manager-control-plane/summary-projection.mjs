export const DEFAULT_SUMMARY_STALE_AFTER_MS = 300_000;
export const SIMULATED_WARNING = "backend_proof_simulated_no_live_worker_execution";

const WORK_STATUSES = [
  "eligible",
  "queued",
  "leased",
  "running",
  "refilling",
  "completed",
  "failed",
  "expired",
  "quarantined",
  "blocked",
  "closed"
];

export function buildManagerExecutionLaneSummary({
  runId,
  clock,
  workItems = [],
  leases = [],
  attempts = [],
  events = [],
  refillJobs = [],
  blockedCandidates = [],
  duplicateCandidates = [],
  summaryEvent,
  stateSource = "fixture",
  proofMode = "backend_proof",
  staleAfterMs = DEFAULT_SUMMARY_STALE_AFTER_MS,
  fallbackEvidenceRefs = ["evidence-summary"]
}) {
  const lastMeaningfulProgress = [...events].reverse().find((event) => !event.eventName.startsWith("dispatcher.summary."));
  const nowEpochMs = clock.nowEpochMs();
  const progressEpochMs = lastMeaningfulProgress ? Date.parse(lastMeaningfulProgress.occurredAt) : null;
  const timestampInvalid = progressEpochMs !== null && (!Number.isFinite(progressEpochMs) || progressEpochMs > nowEpochMs);
  const ageMs = progressEpochMs === null || timestampInvalid ? null : Math.max(0, nowEpochMs - progressEpochMs);
  const freshness = !lastMeaningfulProgress || timestampInvalid ? "unknown" : ageMs > staleAfterMs ? "stale" : "fresh";
  const stateCounts = countStates({ workItems, leases, attempts, blockedCandidates, duplicateCandidates });
  const currentPhase = derivePhase({ workItems, blockedCandidates, refillJobs });
  const blockedAuthorityClasses = unique(blockedCandidates.map((candidate) => candidate.authorityClass).filter(Boolean));
  const authorityBlockedReason = blockedAuthorityClasses[0] ?? null;
  const unsafeStateReasons = unsafeReasons({ stateCounts, leases, attempts, blockedCandidates });
  const authorityStopReason = blockedCandidates.length > 0 ? authorityBlockedReason ?? "blocked" : null;
  const phaseBlocker = ["failed", "expired", "blocked"].includes(currentPhase) ? `dispatcher_phase_${currentPhase}` : null;
  const staleBlocker = freshness === "stale" ? "dispatcher_summary_stale" : null;
  const unknownBlocker = timestampInvalid ? "dispatcher_progress_timestamp_invalid" : null;
  const blockers = unique([phaseBlocker, staleBlocker, unknownBlocker, ...unsafeStateReasons].filter(Boolean));
  const warnings = [
    proofMode === "backend_proof" ? SIMULATED_WARNING : null,
    duplicateCandidates.length > 0 ? "duplicate_candidates_ignored" : null,
    blockedCandidates.length > 0 ? "authority_blocked_candidates_recorded" : null
  ].filter(Boolean);
  const operatorAttentionRequired = blockers.length > 0 || currentPhase === "blocked";
  const attentionReason = operatorAttentionRequired ? blockers[0] ?? "authority_blocked_candidates_recorded" : null;
  const evidenceRefs = unique([
    ...fallbackEvidenceRefs,
    ...workItems.flatMap((item) => item.evidenceRefs ?? []),
    ...leases.flatMap((lease) => lease.evidenceRefs ?? []),
    ...attempts.flatMap((attempt) => attempt.evidenceRefs ?? []),
    ...events.flatMap((event) => event.evidenceRefs ?? []),
    ...refillJobs.flatMap((job) => job.evidenceRefs ?? []),
    ...blockedCandidates.flatMap((candidate) => candidate.evidenceRefs ?? []),
    ...duplicateCandidates.flatMap((candidate) => candidate.evidenceRefs ?? [])
  ]);
  const recoveryEvents = events.filter((event) => event.eventName === "dispatcher.recovery.attempted");
  const recoveryRequired = stateCounts.failed > 0 || stateCounts.expired > 0 || attempts.some((attempt) => attempt.state === "failed" || attempt.state === "expired");
  const eventWatermark = summaryEvent?.eventId ?? events.at(-1)?.eventId ?? "event-000";
  const evidenceLinks = buildEvidenceLinks({
    evidenceRefs,
    workItems,
    leases,
    attempts,
    events,
    refillJobs,
    eventWatermark,
    currentPhase
  });

  return {
    runId,
    proofMode,
    stateSource,
    lastObservedAt: clock.nowIso(),
    lastMeaningfulProgressAt: lastMeaningfulProgress?.occurredAt ?? null,
    freshness,
    unknownReason: timestampInvalid ? "invalid_or_future_dispatcher_progress_timestamp" : freshness === "unknown" ? "no_dispatcher_progress_observed" : null,
    authorityBlockedReason,
    authorityStopReason,
    currentPhase,
    nextAction: nextActionForPhase(currentPhase, freshness),
    operatorAttentionRequired,
    attentionReason,
    recoveryStatus: recoveryRequired ? recoveryStatusForPhase("failed", recoveryEvents.length) : recoveryStatusForPhase(currentPhase, recoveryEvents.length),
    recoveryAttemptCount: recoveryEvents.length,
    lastRecoveryAt: recoveryEvents.at(-1)?.occurredAt ?? null,
    safeWorkAvailableCount: stateCounts.queued,
    unsafeOrGatedWorkCount: stateCounts.failed + stateCounts.expired + stateCounts.blocked + stateCounts.quarantined + stateCounts.blockedCandidates,
    evidenceFreshness: freshness === "stale" ? "stale" : evidenceRefs.length > 0 ? "fresh" : "missing",
    eventWatermark,
    sourceCursor: String(events.length),
    authorityStage: "backend_proof",
    authorityClass: blockedCandidates.length > 0 ? "block_and_record" : "allowed_unattended",
    queuedWorkItemIds: workItems.filter((item) => item.status === "queued").map((item) => item.workItemId),
    activeWorkItemIds: workItems.filter((item) => item.status === "leased" || item.status === "running").map((item) => item.workItemId),
    evidenceRefs,
    evidenceLinks,
    stateCounts,
    rawStateLabels: rawStateLabels({ workItems, leases, attempts, blockedCandidates, duplicateCandidates, freshness, currentPhase }),
    blockers,
    warnings,
    feedbackRoutes: [],
    affectedDeliveryGates: [],
    feedbackRecordPolicy: "metadata_only_feedback_record",
    feedbackUnrelatedLanePolicy: "continue_unrelated_safe_lanes",
    feedbackRetention: "metadata_only",
    feedbackRawPayloadRetained: false
  };
}

function countStates({ workItems, leases, attempts, blockedCandidates, duplicateCandidates }) {
  const counts = Object.fromEntries(WORK_STATUSES.map((status) => [status, 0]));
  for (const item of workItems) {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
  }
  return {
    totalWorkItems: workItems.length,
    totalLeases: leases.length,
    totalAttempts: attempts.length,
    ...counts,
    blockedCandidates: blockedCandidates.length,
    duplicateCandidates: duplicateCandidates.length,
    noSafeWork: workItems.length === 0 && blockedCandidates.length === 0 ? 1 : 0
  };
}

function derivePhase({ workItems, blockedCandidates, refillJobs }) {
  if (workItems.some((item) => item.status === "running")) return "running";
  if (workItems.some((item) => item.status === "leased")) return "leased";
  if (workItems.some((item) => item.status === "queued")) return "queued";
  if (workItems.some((item) => item.status === "refilling") || refillJobs.some((job) => job.state === "running")) return "refilling";
  if (workItems.some((item) => item.status === "failed")) return "failed";
  if (workItems.some((item) => item.status === "expired")) return "expired";
  if (workItems.some((item) => item.status === "blocked" || item.status === "quarantined") || blockedCandidates.length > 0) return "blocked";
  if (workItems.length > 0 && workItems.every((item) => item.status === "completed" || item.status === "closed")) return "completed";
  return "no_safe_work";
}

function nextActionForPhase(phase, freshness) {
  if (freshness === "stale") return "inspect_stale_summary";
  if (phase === "completed") return "continue_to_summary_projection_story";
  if (phase === "no_safe_work") return "await_safe_backlog";
  if (phase === "blocked") return "resolve_authority_or_source_blocker";
  if (phase === "failed" || phase === "expired") return "run_recovery";
  return "continue_monitoring";
}

function recoveryStatusForPhase(phase, recoveryAttemptCount) {
  if (phase === "failed" || phase === "expired") return recoveryAttemptCount > 0 ? "in_progress" : "needed";
  if (recoveryAttemptCount > 0) return "complete";
  return "not_needed";
}

function unsafeReasons({ stateCounts, leases, attempts, blockedCandidates }) {
  return [
    stateCounts.failed > 0 ? "dispatcher_has_failed_work" : null,
    stateCounts.expired > 0 ? "dispatcher_has_expired_work" : null,
    stateCounts.blocked + stateCounts.quarantined > 0 ? "dispatcher_has_blocked_work" : null,
    blockedCandidates.length > 0 ? "dispatcher_has_blocked_candidates" : null,
    leases.some((lease) => lease.state === "expired") ? "dispatcher_has_expired_lease" : null,
    attempts.some((attempt) => attempt.state === "failed") ? "dispatcher_has_failed_attempt" : null,
    attempts.some((attempt) => attempt.state === "expired") ? "dispatcher_has_expired_attempt" : null
  ].filter(Boolean);
}

function buildEvidenceLinks({ evidenceRefs, workItems, leases, attempts, events, refillJobs, eventWatermark, currentPhase }) {
  return evidenceRefs.map((evidenceRefId) => {
    const workItem = workItems.find((item) => (item.evidenceRefs ?? []).includes(evidenceRefId));
    const lease = leases.find((entry) => (entry.evidenceRefs ?? []).includes(evidenceRefId));
    const attempt = attempts.find((entry) => (entry.evidenceRefs ?? []).includes(evidenceRefId));
    const event = events.find((entry) => (entry.evidenceRefs ?? []).includes(evidenceRefId));
    const refillJob = refillJobs.find((entry) => (entry.evidenceRefs ?? []).includes(evidenceRefId));
    const relatedWorkItem = workItem ?? workItems.find((item) => item.workItemId === lease?.workItemId || item.workItemId === attempt?.workItemId);
    const relatedAttempt = attempt ?? attempts.find((entry) => entry.attemptId === lease?.attemptId);
    const verificationCommandId = relatedWorkItem?.verificationTargets?.[0]?.commandId ?? null;
    return {
      evidenceRefId,
      sourceRequirementIds: unique((relatedWorkItem?.sourceRefs ?? []).map((source) => source.sourceRefId)),
      workItemId: relatedWorkItem?.workItemId ?? null,
      leaseId: lease?.leaseId ?? relatedAttempt?.leaseId ?? null,
      attemptId: relatedAttempt?.attemptId ?? null,
      eventWatermark,
      verificationCommandId,
      proofHarnessId: "backend-proof-harness",
      result: event?.eventName ?? refillJob?.result ?? relatedAttempt?.state ?? relatedWorkItem?.status ?? currentPhase,
      retentionClass: "metadata_only",
      rawPayloadRetained: false
    };
  });
}

function rawStateLabels({ workItems, leases, attempts, blockedCandidates, duplicateCandidates, freshness, currentPhase }) {
  return unique([
    ...workItems.map((item) => `work:${item.status}`),
    ...leases.map((lease) => `lease:${lease.state}`),
    ...attempts.map((attempt) => `attempt:${attempt.state}`),
    blockedCandidates.length > 0 ? "candidate:blocked" : null,
    duplicateCandidates.length > 0 ? "candidate:duplicate" : null,
    currentPhase === "no_safe_work" ? "supply:no_safe_work" : null,
    `freshness:${freshness}`
  ].filter(Boolean));
}

function unique(values) {
  return [...new Set(values)];
}
