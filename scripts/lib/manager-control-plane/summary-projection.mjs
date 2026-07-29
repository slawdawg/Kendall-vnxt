import {
  isValidSupervisorTerminalEventMetadata,
  MANAGER_TERMINAL_EVENT_TYPE,
  SUPERVISOR_TERMINAL_INTEGRATION_MISSING,
  SUPERVISOR_TERMINAL_INTEGRATION_PERSISTED,
} from "./terminal-event-contract.mjs";
import { isSafeMetadataOnlyText } from "./forbidden-boundary.mjs";

export const DEFAULT_SUMMARY_STALE_AFTER_MS = 300_000;
export const SIMULATED_WARNING = "backend_proof_simulated_no_live_worker_execution";
const MAX_LANE_CLARITY_TEXT_LENGTH = 240;
const MAX_LANE_CLARITY_REF_LENGTH = 255;
const MAX_LANE_CLARITY_CRITERIA = 24;
const MAX_LANE_CLARITY_REFS = 20;

export const WORK_STATUSES = [
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
Object.freeze(WORK_STATUSES);

export function buildManagerExecutionLaneSummary({
  runId,
  clock,
  workItems = [],
  leases = [],
  attempts = [],
  events = [],
  refillJobs = [],
  blockedCandidates = [],
  needsReviewCandidates = [],
  duplicateCandidates = [],
  summaryEvent,
  stateSource = "fixture",
  proofMode = "backend_proof",
  staleAfterMs = DEFAULT_SUMMARY_STALE_AFTER_MS,
  fallbackEvidenceRefs = ["evidence-summary"],
  laneClarity = null
}) {
  const lastMeaningfulProgress = [...events].reverse().find((event) => !event.eventName.startsWith("dispatcher.summary."));
  const nowEpochMs = clock.nowEpochMs();
  const progressEpochMs = lastMeaningfulProgress ? Date.parse(lastMeaningfulProgress.occurredAt) : null;
  const timestampInvalid = progressEpochMs !== null && (!Number.isFinite(progressEpochMs) || progressEpochMs > nowEpochMs);
  const ageMs = progressEpochMs === null || timestampInvalid ? null : Math.max(0, nowEpochMs - progressEpochMs);
  const freshness = !lastMeaningfulProgress || timestampInvalid ? "unknown" : ageMs > staleAfterMs ? "stale" : "fresh";
  const stateCounts = countStates({ workItems, leases, attempts, blockedCandidates, needsReviewCandidates, duplicateCandidates, refillJobs });
  const latestRefillJob = refillJobs.at(-1);
  const terminalSelection = selectTerminalRefillJob(refillJobs, runId);
  const currentPhase = derivePhase({ workItems, blockedCandidates, needsReviewCandidates, refillJobs, stateCounts, terminalJob: terminalSelection.job, terminalHistoryConflict: terminalSelection.contradiction });
  const terminalDisposition = terminalSelection.job?.terminalDisposition ?? null;
  const supervisorIntegrationMissing = terminalDisposition?.canonicalEventIntegration === SUPERVISOR_TERMINAL_INTEGRATION_MISSING || refillJobs.some((job) => job?.terminalDisposition?.canonicalEventIntegration === SUPERVISOR_TERMINAL_INTEGRATION_MISSING);
  const actualAuthorityBlockedCandidates = blockedCandidates.filter((candidate) => candidate.authorityClass && candidate.authorityClass !== "allowed_unattended");
  const blockedAuthorityClasses = unique(actualAuthorityBlockedCandidates.map((candidate) => candidate.authorityClass).filter(Boolean));
  const authorityBlockedReason = blockedAuthorityClasses[0] ?? null;
  const hasNeedsReview = stateCounts.needsReviewCandidates > 0 || needsReviewCandidates.length > 0;
  const activeRecoveryAttempts = recoveryAttemptsRequiringAttention(attempts, workItems);
  const unsafeStateReasons = unsafeReasons({ stateCounts, leases, attempts: activeRecoveryAttempts, blockedCandidates, needsReviewCandidates });
  const authorityStopReason = actualAuthorityBlockedCandidates.length > 0 ? authorityBlockedReason ?? "blocked" : hasNeedsReview ? "needs_review" : null;
  const phaseBlocker = ["failed", "expired", "blocked", "needs_review"].includes(currentPhase) ? `dispatcher_phase_${currentPhase}` : null;
  const staleBlocker = freshness === "stale" ? "dispatcher_summary_stale" : null;
  const unknownBlocker = timestampInvalid ? "dispatcher_progress_timestamp_invalid" : null;
  const blockers = unique([
    phaseBlocker,
    staleBlocker,
    unknownBlocker,
    ...unsafeStateReasons,
    terminalSelection.contradiction ? "terminal_refill_history_conflict" : null,
    supervisorIntegrationMissing ? SUPERVISOR_TERMINAL_INTEGRATION_MISSING : null,
  ].filter(Boolean));
  const warnings = [
    proofMode === "backend_proof" ? SIMULATED_WARNING : null,
    duplicateCandidates.length > 0 ? "duplicate_candidates_ignored" : null,
    actualAuthorityBlockedCandidates.length > 0 ? "authority_blocked_candidates_recorded" : null,
    hasNeedsReview ? "needs_review_candidates_recorded" : null,
    terminalDisposition?.unresolvedApprovalGatedWork?.length > 0 ? "approval_gated_work_remains_visible" : null,
    terminalSelection.contradiction ? "terminal_refill_history_conflict" : null
  ].filter(Boolean);
  const operatorAttentionRequired = blockers.length > 0 || currentPhase === "blocked" || currentPhase === "needs_review" || Boolean(terminalDisposition?.unresolvedApprovalGatedWork?.length);
  const attentionReason = operatorAttentionRequired
    ? (terminalDisposition?.unresolvedApprovalGatedWork?.length ? "approval_gated_work_remains_visible" : null) ?? blockers[0] ?? "authority_blocked_candidates_recorded"
    : null;
  const evidenceRefs = unique([
    ...fallbackEvidenceRefs,
    ...workItems.flatMap((item) => item.evidenceRefs ?? []),
    ...leases.flatMap((lease) => lease.evidenceRefs ?? []),
    ...attempts.flatMap((attempt) => attempt.evidenceRefs ?? []),
    ...events.flatMap((event) => event.evidenceRefs ?? []),
    ...refillJobs.flatMap((job) => job.evidenceRefs ?? []),
    ...blockedCandidates.flatMap((candidate) => candidate.evidenceRefs ?? []),
    ...needsReviewCandidates.flatMap((candidate) => candidate.evidenceRefs ?? []),
    ...duplicateCandidates.flatMap((candidate) => candidate.evidenceRefs ?? [])
  ]);
  const recoveryEvents = events.filter((event) => event.eventName === "dispatcher.recovery.attempted");
  const recoveryRequired = stateCounts.failed > 0 || stateCounts.expired > 0 || activeRecoveryAttempts.length > 0;
  const eventWatermark = summaryEvent?.eventId ?? events.at(-1)?.eventId ?? "event-000";
  const evidenceLinks = buildEvidenceLinks({
    evidenceRefs,
    workItems,
    leases,
    attempts,
    events,
    refillJobs,
    blockedCandidates,
    needsReviewCandidates,
    duplicateCandidates,
    eventWatermark,
    currentPhase
  });
  const unsafeOrGatedWorkCount = unsafeOrGatedCount({ stateCounts, blockedCandidates, needsReviewCandidates });
  const projectedLaneClarity = projectLaneClarity({
    candidate: laneClarity,
    runId,
    eventWatermark,
    sourceCursor: String(events.length),
    currentPhase,
    freshness,
    evidenceFreshness: freshness === "stale" ? "stale" : evidenceRefs.length > 0 ? "fresh" : "missing",
    evidenceRefs,
    events,
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
    nextAction: nextActionForSummary({ phase: currentPhase, freshness, blockers, stateCounts }),
    operatorAttentionRequired,
    attentionReason,
    recoveryStatus: recoveryRequired ? recoveryStatusForPhase("failed", recoveryEvents.length) : recoveryStatusForPhase(currentPhase, recoveryEvents.length),
    recoveryAttemptCount: recoveryEvents.length,
    lastRecoveryAt: recoveryEvents.at(-1)?.occurredAt ?? null,
    safeWorkAvailableCount: stateCounts.queued,
    metadataOnlyQueuedCount: stateCounts.metadataOnlyQueuedCandidates,
    unsafeOrGatedWorkCount,
    evidenceFreshness: freshness === "stale" ? "stale" : evidenceRefs.length > 0 ? "fresh" : "missing",
    eventWatermark,
    sourceCursor: String(events.length),
    authorityStage: "backend_proof",
    authorityClass: authorityClassForSummary({ stateCounts, hasNeedsReview, latestRefillJob }),
    terminalDisposition,
    queuedWorkItemIds: workItems.filter((item) => item.status === "queued").map((item) => item.workItemId),
    activeWorkItemIds: workItems.filter((item) => item.status === "leased" || item.status === "running").map((item) => item.workItemId),
    evidenceRefs,
    evidenceLinks,
    stateCounts,
    rawStateLabels: rawStateLabels({ workItems, leases, attempts, blockedCandidates, needsReviewCandidates, duplicateCandidates, stateCounts, freshness, currentPhase, terminalDisposition, blockers }),
    blockers,
    warnings,
    feedbackRoutes: [],
    affectedDeliveryGates: [],
    feedbackRecordPolicy: "metadata_only_feedback_record",
    feedbackUnrelatedLanePolicy: "continue_unrelated_safe_lanes",
    feedbackRetention: "metadata_only",
    feedbackRawPayloadRetained: false,
    laneClarity: projectedLaneClarity
  };
}

function projectLaneClarity({ candidate, runId, eventWatermark, sourceCursor, currentPhase, freshness, evidenceFreshness, evidenceRefs, events }) {
  const unavailable = (reason, nextSafeAction = "Record coherent manager lane source and criterion evidence before relying on lane clarity.") => ({
    schemaVersion: "manager-lane-clarity/v0",
    runId,
    eventWatermark,
    sourceCursor,
    goal: { summary: "Lane clarity source metadata is unavailable.", sourceRef: "source:unavailable" },
    criteria: [],
    canonicalState: { phase: currentPhase, freshness, evidenceFreshness },
    nextGate: { summary: "Recover lane clarity evidence", nextSafeAction },
    posture: { state: "not_assessed", reason, nextSafeAction, decisionRef: null, qualification: null },
    metadataOnly: true,
    rawPayloadRetained: false,
  });
  if (!candidate || typeof candidate !== "object") {
    return unavailable("lane_clarity_missing");
  }
  const goal = candidate.goal;
  const criteria = Array.isArray(candidate.criteria) ? candidate.criteria : null;
  const nextGate = candidate.nextGate;
  const coherent = candidate.runId === runId &&
    candidate.eventWatermark === eventWatermark &&
    candidate.sourceCursor === sourceCursor &&
    isLaneClarityText(goal?.summary) &&
    isLaneClarityRef(goal?.sourceRef) &&
    Array.isArray(criteria) && criteria.length > 0 && criteria.length <= MAX_LANE_CLARITY_CRITERIA &&
    criteria.every(isValidLaneClarityCriterion) &&
    criteria.every((criterion) => criterion.evidenceRefs.every((ref) => evidenceRefs.includes(ref))) &&
    isLaneClarityText(nextGate?.summary) && isLaneClarityText(nextGate?.nextSafeAction) &&
    candidate.metadataOnly === true && candidate.rawPayloadRetained === false;
  if (!coherent || freshness !== "fresh" || evidenceFreshness !== "fresh") {
    return unavailable("lane_clarity_incoherent_or_stale");
  }
  const pivotEvent = [...events].reverse().find((event) =>
    event?.eventName === "scope_pivot_required" && event.runId === runId && event.scopePivotDecision?.eventWatermark === eventWatermark
  );
  if (pivotEvent) {
    const decision = pivotEvent.scopePivotDecision;
    if (!decision || !["operator_drift_concern", "second_qualified_recovery_detour"].includes(decision.qualification) ||
      decision.eventWatermark !== eventWatermark || !isLaneClarityRef(decision.decisionRef) || !isLaneClarityText(decision.reason) ||
      !hasSafeLaneClarityRefs(decision.sourceRefs) || !hasSafeLaneClarityRefs(pivotEvent.evidenceRefs) ||
      !pivotEvent.evidenceRefs.every((ref) => evidenceRefs.includes(ref)) ||
      !isLaneClarityText(decision.nextSafeAction) || decision.rawPayloadRetained !== false) {
      return unavailable("scope_pivot_decision_malformed");
    }
    return {
      schemaVersion: "manager-lane-clarity/v0",
      runId,
      eventWatermark,
      sourceCursor,
      goal: projectGoal(goal),
      criteria: criteria.map(projectCriterion),
      canonicalState: { phase: currentPhase, freshness, evidenceFreshness },
      nextGate: projectNextGate(nextGate),
      posture: { state: "pivot_required", reason: decision.reason, nextSafeAction: decision.nextSafeAction, decisionRef: decision.decisionRef, qualification: decision.qualification },
      metadataOnly: true,
      rawPayloadRetained: false,
    };
  }
  return {
    schemaVersion: "manager-lane-clarity/v0",
    runId,
    eventWatermark,
    sourceCursor,
    goal: projectGoal(goal),
    criteria: criteria.map(projectCriterion),
    canonicalState: { phase: currentPhase, freshness, evidenceFreshness },
    nextGate: projectNextGate(nextGate),
    posture: { state: "on_scope", reason: "coherent_current_manager_lane_evidence", nextSafeAction: nextGate.nextSafeAction, decisionRef: null, qualification: null },
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function isValidLaneClarityCriterion(criterion) {
  return isLaneClarityRef(criterion?.criterionId) &&
    isLaneClarityText(criterion?.summary) &&
    ["met", "in_progress", "blocked", "not_assessed"].includes(criterion?.disposition) &&
    hasSafeLaneClarityRefs(criterion?.evidenceRefs);
}

function hasSafeLaneClarityRefs(refs) {
  return Array.isArray(refs) && refs.length > 0 && refs.length <= MAX_LANE_CLARITY_REFS && refs.every(isLaneClarityRef);
}

function projectGoal(goal) { return { summary: goal.summary, sourceRef: goal.sourceRef }; }
function projectCriterion(criterion) { return { criterionId: criterion.criterionId, summary: criterion.summary, disposition: criterion.disposition, evidenceRefs: [...criterion.evidenceRefs] }; }
function projectNextGate(nextGate) { return { summary: nextGate.summary, nextSafeAction: nextGate.nextSafeAction }; }

function isLaneClarityRef(value) {
  return isSafeMetadataOnlyText(value, { maxLength: MAX_LANE_CLARITY_REF_LENGTH, token: true });
}

function isLaneClarityText(value) {
  return isSafeMetadataOnlyText(value, { maxLength: MAX_LANE_CLARITY_TEXT_LENGTH });
}

function countStates({ workItems, leases, attempts, blockedCandidates, needsReviewCandidates, duplicateCandidates, refillJobs }) {
  const counts = Object.fromEntries(WORK_STATUSES.map((status) => [status, 0]));
  for (const item of workItems) {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
  }
  const latestRefillJob = refillJobs.at(-1);
  const queuedCount = counts.queued ?? 0;
  const retainedLatestRefillWorkItemCount = countRetainedWorkItemsForRefill(workItems, latestRefillJob);
  const latestRefillQueuedCount = Math.max(0, (Number(latestRefillJob?.queuedCount ?? 0) || 0) - retainedLatestRefillWorkItemCount);
  const latestRefillNeedsReviewCount = Number(latestRefillJob?.needsReviewCount ?? 0) || 0;
  const latestRefillBlockedCount = Number(latestRefillJob?.blockedCount ?? 0) || 0;
  const blockedCandidateCount = unique(blockedCandidates.map(candidateIdentityKey)).length;
  const needsReviewCount = Math.max(
    unique(needsReviewCandidates.map(candidateIdentityKey)).length,
    latestRefillNeedsReviewCount
  );
  return {
    totalWorkItems: workItems.length,
    totalLeases: leases.length,
    totalAttempts: attempts.length,
    ...counts,
    queued: queuedCount,
    metadataOnlyQueuedCandidates: latestRefillQueuedCount,
    blockedCandidates: Math.max(blockedCandidateCount, latestRefillBlockedCount),
    needsReviewCandidates: needsReviewCount,
    duplicateCandidates: duplicateCandidates.length,
    noSafeWork: queuedCount === 0 && latestRefillQueuedCount === 0 && workItems.length === 0 && Math.max(blockedCandidateCount, latestRefillBlockedCount) === 0 && needsReviewCount === 0 ? 1 : 0
  };
}

function countRetainedWorkItemsForRefill(workItems, refillJob) {
  if (!refillJob) {
    return 0;
  }
  const refillEvidenceRefs = new Set(Array.isArray(refillJob.evidenceRefs) ? refillJob.evidenceRefs : []);
  const startMs = parseSummaryTimestamp(refillJob.startedAt ?? refillJob.createdAt);
  const endMs = parseSummaryTimestamp(refillJob.finishedAt ?? refillJob.updatedAt ?? refillJob.createdAt ?? refillJob.startedAt);
  const hasRefillWindow = Number.isFinite(startMs) && Number.isFinite(endMs);
  const lowerBound = Math.min(startMs, endMs);
  const upperBound = Math.max(startMs, endMs);
  const retainedWorkItemIds = new Set();
  for (const item of workItems) {
    const itemCreatedMs = parseSummaryTimestamp(item.createdAt);
    if (hasRefillWindow && (!Number.isFinite(itemCreatedMs) || itemCreatedMs < lowerBound || itemCreatedMs > upperBound)) {
      continue;
    }
    if (!hasRefillWindow && (!isRefillFallbackState(item.status) || refillEvidenceRefs.size === 0)) {
      continue;
    }
    const evidenceMatches = refillEvidenceRefs.size === 0 ||
      (Array.isArray(item.evidenceRefs) ? item.evidenceRefs : []).some((evidenceRef) => refillEvidenceRefs.has(evidenceRef));
    if (evidenceMatches && item.workItemId) {
      retainedWorkItemIds.add(item.workItemId);
    }
  }
  return retainedWorkItemIds.size;
}

function selectTerminalRefillJob(refillJobs = [], runId = "") {
  const terminalIndexes = refillJobs
    .map((job, index) => (job?.result === MANAGER_TERMINAL_EVENT_TYPE || job?.terminalDisposition?.disposition === MANAGER_TERMINAL_EVENT_TYPE ? index : -1))
    .filter((index) => index >= 0);
  if (terminalIndexes.length === 0) return { job: null, contradiction: false };
  const latestTerminalIndex = terminalIndexes.at(-1);
  const candidate = refillJobs[latestTerminalIndex];
  const laterHistory = refillJobs.slice(latestTerminalIndex + 1);
  const validCandidate = isValidatedTerminalRefillJob(candidate, runId);
  const allTerminalEntriesValid = terminalIndexes.every((index) => isValidatedTerminalRefillJob(refillJobs[index], runId));
  const laterNonterminal = laterHistory.some((job) => job?.result !== MANAGER_TERMINAL_EVENT_TYPE && job?.terminalDisposition?.disposition !== MANAGER_TERMINAL_EVENT_TYPE);
  const terminalKeys = terminalIndexes.map((index) => {
    const job = refillJobs[index];
    return `${job?.refillJobId || ""}:${terminalDispositionFingerprint(job?.terminalDisposition)}`;
  });
  const distinctTerminalKeys = new Set(terminalKeys);
  return {
    job: validCandidate && allTerminalEntriesValid && !laterNonterminal && distinctTerminalKeys.size === 1 ? candidate : null,
    contradiction: !validCandidate || !allTerminalEntriesValid || laterNonterminal || distinctTerminalKeys.size > 1,
  };
}

function isValidatedTerminalRefillJob(job, runId) {
  if (!job || job.result !== MANAGER_TERMINAL_EVENT_TYPE || job.state !== "completed" || !isValidatedTerminalDisposition(job.terminalDisposition)) return false;
  const disposition = job.terminalDisposition;
  const sourceRefs = Array.isArray(job.sourceRefs) ? job.sourceRefs.map((ref) => String(ref)) : [];
  return disposition.runId === String(runId) &&
    job.sourceIdentity === disposition.sourceIdentity &&
    job.sourceRevision === disposition.sourceRevision &&
    sourceRefs.includes(disposition.sourceIdentity);
}

function derivePhase({ workItems, blockedCandidates, needsReviewCandidates, refillJobs, stateCounts, terminalJob = null, terminalHistoryConflict = false }) {
  if (workItems.some((item) => item.status === "running")) return "running";
  if (workItems.some((item) => item.status === "leased")) return "leased";
  if (workItems.some((item) => item.status === "refilling") || refillJobs.some((job) => job.state === "running")) return "refilling";
  if (workItems.some((item) => item.status === "queued") || (stateCounts?.queued ?? 0) > 0) return "queued";
  if (workItems.some((item) => item.status === "failed")) return "failed";
  if (workItems.some((item) => item.status === "expired")) return "expired";
  if (terminalHistoryConflict) return "blocked";
  if (terminalJob) return MANAGER_TERMINAL_EVENT_TYPE;
  if (
    workItems.some((item) => item.status === "blocked" || item.status === "quarantined") ||
    blockedCandidates.length > 0 ||
    (stateCounts?.blockedCandidates ?? 0) > 0 ||
    refillJobs.some((job) => Number(job.blockedCount ?? 0) > 0 || job.result === "blocked")
  ) return "blocked";
  if (needsReviewCandidates.length > 0 || refillJobs.some((job) => Number(job.needsReviewCount ?? 0) > 0 || job.result === "needs_review")) return "needs_review";
  if ((stateCounts?.metadataOnlyQueuedCandidates ?? 0) > 0) return "queued";
  if (workItems.length > 0 && workItems.every((item) => item.status === "completed" || item.status === "closed")) return "completed";
  return "no_safe_work";
}

function isRefillFallbackState(status) {
  return ["queued", "leased", "running", "refilling", "failed", "expired", "quarantined", "blocked"].includes(status);
}

function recoveryAttemptsRequiringAttention(attempts, workItems) {
  const workItemsById = new Map(workItems.map((item) => [item.workItemId, item]));
  return attempts.filter((attempt) => {
    if (attempt.state !== "failed" && attempt.state !== "expired") {
      return false;
    }
    const relatedWorkItem = workItemsById.get(attempt.workItemId);
    return !relatedWorkItem || relatedWorkItem.status === "failed" || relatedWorkItem.status === "expired";
  });
}

function parseSummaryTimestamp(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return Number.NaN;
  }
  return Date.parse(value);
}

function nextActionForSummary({ phase, freshness, blockers, stateCounts }) {
  if (freshness === "stale") return "inspect_stale_summary";
  if (phase === MANAGER_TERMINAL_EVENT_TYPE) return "await_new_source_bound_manager_run";
  if (phase === "failed" || phase === "expired" || (stateCounts?.failed ?? 0) > 0 || (stateCounts?.expired ?? 0) > 0) return "run_recovery";
  if ((blockers ?? []).includes("dispatcher_has_blocked_candidates") || (stateCounts?.blockedCandidates ?? 0) > 0) return "resolve_authority_or_source_blocker";
  if ((blockers ?? []).includes("dispatcher_has_needs_review_candidates") || (stateCounts?.needsReviewCandidates ?? 0) > 0) return "review_refill_candidates";
  if (phase === "completed") return "continue_to_summary_projection_story";
  if (phase === "no_safe_work") return "await_safe_backlog";
  if (phase === "needs_review") return "review_refill_candidates";
  if (phase === "blocked") return "resolve_authority_or_source_blocker";
  return "continue_monitoring";
}

function authorityClassForSummary({ stateCounts, hasNeedsReview, latestRefillJob }) {
  if ((stateCounts.blockedCandidates ?? 0) > 0 || latestRefillJob?.result === "queued_with_gated_candidates") {
    return "block_and_record";
  }
  if (hasNeedsReview) {
    return "requires_preauthorization";
  }
  return "allowed_unattended";
}

function recoveryStatusForPhase(phase, recoveryAttemptCount) {
  if (phase === "failed" || phase === "expired") return recoveryAttemptCount > 0 ? "in_progress" : "needed";
  if (recoveryAttemptCount > 0) return "complete";
  return "not_needed";
}

function unsafeReasons({ stateCounts, leases, attempts, blockedCandidates, needsReviewCandidates }) {
  return [
    stateCounts.failed > 0 ? "dispatcher_has_failed_work" : null,
    stateCounts.expired > 0 ? "dispatcher_has_expired_work" : null,
    stateCounts.blocked + stateCounts.quarantined > 0 ? "dispatcher_has_blocked_work" : null,
    stateCounts.blockedCandidates > 0 || blockedCandidates.length > 0 ? "dispatcher_has_blocked_candidates" : null,
    needsReviewCandidates.length > 0 || stateCounts.needsReviewCandidates > 0 ? "dispatcher_has_needs_review_candidates" : null,
    leases.some((lease) => lease.state === "expired") ? "dispatcher_has_expired_lease" : null,
    attempts.some((attempt) => attempt.state === "failed") ? "dispatcher_has_failed_attempt" : null,
    attempts.some((attempt) => attempt.state === "expired") ? "dispatcher_has_expired_attempt" : null
  ].filter(Boolean);
}

function buildEvidenceLinks({ evidenceRefs, workItems, leases, attempts, events, refillJobs, blockedCandidates, needsReviewCandidates, duplicateCandidates, eventWatermark, currentPhase }) {
  const candidates = [...needsReviewCandidates, ...blockedCandidates, ...duplicateCandidates];
  return evidenceRefs.map((evidenceRefId) => {
    const workItem = workItems.find((item) => (item.evidenceRefs ?? []).includes(evidenceRefId));
    const lease = leases.find((entry) => (entry.evidenceRefs ?? []).includes(evidenceRefId));
    const attempt = attempts.find((entry) => (entry.evidenceRefs ?? []).includes(evidenceRefId));
    const event = events.find((entry) => (entry.evidenceRefs ?? []).includes(evidenceRefId));
    const refillJob = refillJobs.find((entry) => (entry.evidenceRefs ?? []).includes(evidenceRefId));
    const candidate = candidates.find((entry) => (entry.evidenceRefs ?? []).includes(evidenceRefId));
    const relatedWorkItem = workItem ?? workItems.find((item) => item.workItemId === lease?.workItemId || item.workItemId === attempt?.workItemId);
    const relatedAttempt = attempt ?? attempts.find((entry) => entry.attemptId === lease?.attemptId);
    const verificationCommandId = relatedWorkItem?.verificationTargets?.[0]?.commandId ?? candidate?.verificationTargets?.[0]?.commandId ?? null;
    return {
      evidenceRefId,
      sourceRequirementIds: unique(asArray(relatedWorkItem?.sourceRefs ?? candidate?.sourceRefs).map((source) => source.sourceRefId).filter((sourceRefId) => typeof sourceRefId === "string")),
      workItemId: relatedWorkItem?.workItemId ?? null,
      leaseId: lease?.leaseId ?? relatedAttempt?.leaseId ?? null,
      attemptId: relatedAttempt?.attemptId ?? null,
      eventWatermark,
      verificationCommandId,
      proofHarnessId: "backend-proof-harness",
      result: event?.eventName ?? refillJob?.result ?? relatedAttempt?.state ?? relatedWorkItem?.status ?? (candidate ? `candidate:${candidate.status}` : currentPhase),
      retentionClass: "metadata_only",
      rawPayloadRetained: false
    };
  });
}

function unsafeOrGatedCount({ stateCounts, blockedCandidates, needsReviewCandidates }) {
  const statusCount = stateCounts.failed + stateCounts.expired + stateCounts.blocked + stateCounts.quarantined;
  const candidateKeys = new Set([
    ...blockedCandidates.map(candidateIdentityKey),
    ...needsReviewCandidates.map(candidateIdentityKey)
  ]);
  const overlapKeys = new Set(blockedCandidates.map(candidateIdentityKey));
  const retainedOverlapCount = unique(needsReviewCandidates.map(candidateIdentityKey)).filter((key) => overlapKeys.has(key)).length;
  const aggregateCandidateCount = Math.max(0, stateCounts.blockedCandidates + stateCounts.needsReviewCandidates - retainedOverlapCount);
  const candidateCount = Math.max(candidateKeys.size, aggregateCandidateCount);
  return statusCount + candidateCount;
}

function candidateIdentityKey(candidate) {
  if (!candidate) return "";
  const sourceKey = (Array.isArray(candidate.sourceRefs) ? candidate.sourceRefs : [])
    .filter((source) => source && typeof source === "object")
    .map((source) => `${safeIdentityString(source.sourceRefId)}:${safeIdentityString(source.sourceSpan)}`)
    .join("|");
  const acceptanceKey = (Array.isArray(candidate.acceptanceCriteria) ? candidate.acceptanceCriteria : [])
    .map(safeIdentityString)
    .filter(Boolean)
    .sort()
    .join("|");
  const dependencyKey = [...new Set((Array.isArray(candidate.dependencyHints) ? candidate.dependencyHints : [])
    .map(safeIdentityString)
    .filter(Boolean))]
    .sort()
    .join("|") || safeIdentityString(candidate.dedupeKey);
  const canonicalKey = `${sourceKey}::${acceptanceKey}::${dependencyKey}`;
  return canonicalKey === "::::" ? safeIdentityString(candidate.dedupeKey) || safeIdentityString(candidate.candidateWorkPacketId) || JSON.stringify(candidate.sourceRefs ?? []) : canonicalKey;
}

function safeIdentityString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function rawStateLabels({ workItems, leases, attempts, blockedCandidates, needsReviewCandidates, duplicateCandidates, stateCounts, freshness, currentPhase, terminalDisposition, blockers = [] }) {
  return unique([
    ...workItems.map((item) => `work:${item.status}`),
    stateCounts.queued > 0 ? "work:queued" : null,
    stateCounts.metadataOnlyQueuedCandidates > 0 ? "refill:queued_metadata" : null,
    ...leases.map((lease) => `lease:${lease.state}`),
    ...attempts.map((attempt) => `attempt:${attempt.state}`),
    blockedCandidates.length > 0 || stateCounts.blockedCandidates > 0 ? "candidate:blocked" : null,
    needsReviewCandidates.length > 0 || stateCounts.needsReviewCandidates > 0 || currentPhase === "needs_review" ? "candidate:needs_review" : null,
    duplicateCandidates.length > 0 ? "candidate:duplicate" : null,
    currentPhase === "no_safe_work" ? "supply:no_safe_work" : null,
    terminalDisposition?.disposition === MANAGER_TERMINAL_EVENT_TYPE ? `terminal:${MANAGER_TERMINAL_EVENT_TYPE}` : null,
    terminalDisposition?.canonicalEventIntegration === SUPERVISOR_TERMINAL_INTEGRATION_MISSING ? `terminal:${SUPERVISOR_TERMINAL_INTEGRATION_MISSING}` : null,
    terminalDisposition?.canonicalEventIntegration === SUPERVISOR_TERMINAL_INTEGRATION_PERSISTED ? `terminal:${SUPERVISOR_TERMINAL_INTEGRATION_PERSISTED}` : null,
    blockers.includes("terminal_refill_history_conflict") ? "terminal:history_conflict" : null,
    `freshness:${freshness}`
  ].filter(Boolean));
}

function isValidatedTerminalDisposition(disposition) {
  if (!disposition || disposition.disposition !== MANAGER_TERMINAL_EVENT_TYPE || ![SUPERVISOR_TERMINAL_INTEGRATION_MISSING, SUPERVISOR_TERMINAL_INTEGRATION_PERSISTED].includes(disposition.canonicalEventIntegration) || disposition.rawPayloadRetained !== false) return false;
  if (!String(disposition.runId || "").trim() || !String(disposition.sourceIdentity || "").trim() || !String(disposition.sourceRevision || "").trim() || !String(disposition.idempotencyKey || "").trim() || !String(disposition.resumeRequirement || "").trim() || !String(disposition.nextManagerAction || "").trim()) return false;
  if (!Array.isArray(disposition.evidenceRefs) || disposition.evidenceRefs.length === 0 || !Array.isArray(disposition.unresolvedApprovalGatedWork)) return false;
  if (!disposition.unresolvedApprovalGatedWork.every(isValidUnresolvedApprovalGatedWorkRecord)) return false;
  const counts = disposition.reconciliationCounts;
  if (!counts || typeof counts !== "object") return false;
  const keys = ["eligible", "queued", "leased", "running", "reviewFix", "requiredRetrospective", "otherwiseRequired", "completed", "closed", "approvalGated"];
  if (["totalItems", "reconciledItems", ...keys].some((key) => !Number.isInteger(counts[key]) || counts[key] < 0)) return false;
  if (counts.totalItems !== counts.reconciledItems || counts.totalItems !== keys.reduce((total, key) => total + counts[key], 0)) return false;
  if (["eligible", "queued", "leased", "running", "reviewFix", "requiredRetrospective", "otherwiseRequired"].some((key) => counts[key] !== 0)) return false;
  if (counts.approvalGated !== disposition.unresolvedApprovalGatedWork.length) return false;
  return disposition.canonicalEventIntegration !== SUPERVISOR_TERMINAL_INTEGRATION_PERSISTED || isValidSupervisorTerminalEventMetadata(disposition.supervisorEvent);
}

function isValidUnresolvedApprovalGatedWorkRecord(record) {
  return Boolean(record && typeof record === "object" &&
    typeof record.workId === "string" && record.workId.trim() &&
    typeof record.title === "string" && record.title.trim() &&
    typeof record.reason === "string" && record.reason.trim() &&
    Array.isArray(record.sourceRefs) && record.sourceRefs.length > 0 && record.sourceRefs.every((ref) => typeof ref === "string" && ref.trim()) &&
    Array.isArray(record.evidenceRefs) && record.evidenceRefs.length > 0 && record.evidenceRefs.every((ref) => typeof ref === "string" && ref.trim()));
}

function terminalDispositionFingerprint(disposition) {
  if (!disposition || typeof disposition !== "object") return "";
  const counts = disposition.reconciliationCounts || {};
  const canonicalCounts = Object.fromEntries([
    "totalItems", "reconciledItems", "eligible", "queued", "leased", "running", "reviewFix", "requiredRetrospective", "otherwiseRequired", "completed", "closed", "approvalGated",
  ].map((key) => [key, counts[key]]));
  const canonicalWork = (Array.isArray(disposition.unresolvedApprovalGatedWork) ? disposition.unresolvedApprovalGatedWork : [])
    .map((record) => ({
      workId: record?.workId,
      title: record?.title,
      reason: record?.reason,
      sourceRefs: [...(Array.isArray(record?.sourceRefs) ? record.sourceRefs : [])].sort(),
      evidenceRefs: [...(Array.isArray(record?.evidenceRefs) ? record.evidenceRefs : [])].sort(),
    }))
    .sort((left, right) => String(left.workId || "").localeCompare(String(right.workId || "")));
  return JSON.stringify({
    disposition: disposition.disposition,
    runId: disposition.runId,
    sourceIdentity: disposition.sourceIdentity,
    sourceRevision: disposition.sourceRevision,
    reconciliationCounts: canonicalCounts,
    unresolvedApprovalGatedWork: canonicalWork,
    evidenceRefs: [...(Array.isArray(disposition.evidenceRefs) ? disposition.evidenceRefs : [])].sort(),
    resumeRequirement: disposition.resumeRequirement,
    nextManagerAction: disposition.nextManagerAction,
    canonicalEventIntegration: disposition.canonicalEventIntegration,
    supervisorEvent: disposition.supervisorEvent ?? null,
    rawPayloadRetained: disposition.rawPayloadRetained,
    idempotencyKey: disposition.idempotencyKey,
  });
}

function unique(values) {
  return [...new Set(values)];
}
