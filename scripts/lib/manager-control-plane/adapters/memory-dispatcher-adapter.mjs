import { buildManagerExecutionLaneSummary, SIMULATED_WARNING, WORK_STATUSES } from "../summary-projection.mjs";

const CANDIDATE_STATUSES = new Set(["eligible", "needs_review", "blocked"]);
const MANAGER_RISK_CLASSES = new Set(["low", "medium", "high", "extreme"]);
const MANAGER_SOURCE_TYPES = new Set(["prd", "bmad_artifact", "research", "repo_source", "runtime_state", "manual"]);
const MANAGER_AUTHORITY_CLASSES = new Set(["allowed_unattended", "requires_preauthorization", "block_and_record", "forbidden"]);
const MANAGER_AUTHORITY_STAGES = new Set([
  "backend_proof",
  "bootstrap_refill",
  "governor_recovery",
  "live_worker",
  "delivery",
  "pipeline_adapter"
]);
// DispatcherPort accepts a closed, source-owned candidate shape. Unknown top-level
// keys are rejected so safe-looking extension metadata cannot become retained raw payload.
const CANDIDATE_INPUT_KEYS = new Set([
  "candidateWorkPacketId",
  "runId",
  "sourceRefs",
  "proposedSlice",
  "acceptanceCriteria",
  "verificationTargets",
  "riskClass",
  "dependencyHints",
  "dedupeKey",
  "authorityClass",
  "authorityStage",
  "status",
  "policyId",
  "evidenceRefs",
  "createdAt",
  "updatedAt"
]);
const MAX_EVENT_PAYLOAD_SUMMARY_LENGTH = 240;
const MAX_CLOSEOUT_METADATA_LENGTH = 240;
const MAX_RETAINED_METADATA_LENGTH = 1_000;
const RAW_METADATA_PATTERN = /\b(rawProviderPayload|providerPayload|providerMetadata|providerResponse|provider_response|rawPayload|raw_payload|provider_payload|provider_metadata|retainedPayload|retained_payload|raw payload|provider payload|provider response|secret|token|credential|scrollback|api_key|api-key|apikey|client_secret|clientSecret|private_key|privateKey|sshPrivateKey|access_key|accessKey|secret_key|secretKey|secretAccessKey|awsSecretAccessKey|password)\b|\b[A-Z0-9_]*(?:API_KEY|ACCESS_TOKEN|REFRESH_TOKEN|ID_TOKEN|TOKEN|SECRET)\b\s*=?|\bprovider\s*[:=]|\bresponse_id\s*[:=]|"provider"\s*:|"response_id"\s*:|\bauthorization\s*:\s*bearer\b|\bbearer\s+[A-Za-z0-9._~+/-]+=*\b|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b|\bsk-[A-Za-z0-9_-]{8,}|\b(?:git(?:hub)_pat|gh[opusr])_[A-Za-z0-9_]{8,}|\bAKIA[0-9A-Z]{12,}\b|-----BEGIN [A-Z ]*PRIVATE KEY-----/i;

export function createMemoryDispatcherAdapter({
  lifecycle,
  clock,
  runId = "run-1",
  leaseTtlMs = 300_000,
  maxAttempts = 3,
  summaryStaleAfterMs = 300_000
}) {
  if (!lifecycle) {
    throw new Error("memory dispatcher adapter requires injected lifecycle helpers");
  }
  if (!clock) {
    throw new Error("memory dispatcher adapter requires injected clock");
  }
  if (!Number.isFinite(leaseTtlMs) || leaseTtlMs <= 0) {
    throw new Error("memory dispatcher adapter requires positive leaseTtlMs");
  }
  if (!Number.isFinite(summaryStaleAfterMs) || summaryStaleAfterMs < 0) {
    throw new Error("memory dispatcher adapter requires non-negative summaryStaleAfterMs");
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error("memory dispatcher adapter requires positive integer maxAttempts");
  }
  if (!hasMetadataSafeString(runId, MAX_RETAINED_METADATA_LENGTH)) {
    throw new Error("memory dispatcher adapter requires metadata-safe runId");
  }
  const dispatcherRunId = normalizeMetadataString(runId);

  const state = {
    candidatesByDedupe: new Map(),
    workItems: new Map(),
    leases: new Map(),
    attempts: new Map(),
    evidenceRecords: new Map(),
    refillJobs: [],
    blockedCandidates: [],
    needsReviewCandidates: [],
    duplicateCandidates: [],
    events: [],
    counters: {
      refill: 0,
      workItem: 0,
      lease: 0,
      attempt: 0,
      evidence: 0,
      event: 0
    }
  };

  return {
    mode: "backend_proof",
    clock,
    refill(input) {
      return Promise.resolve(toPublicResult(refill(input)));
    },
    claim(input) {
      return Promise.resolve(toPublicResult(claim(input)));
    },
    heartbeat(input) {
      return Promise.resolve(toPublicResult(heartbeat(input)));
    },
    complete(input) {
      return Promise.resolve(toPublicResult(closeout(input, "completed")));
    },
    fail(input) {
      return Promise.resolve(toPublicResult(closeout(input, "failed")));
    },
    recoverExpiredLeases(input) {
      return Promise.resolve(toPublicResult(recoverExpiredLeases(input)));
    },
    summarize() {
      return Promise.resolve(clonePublicValue(summarize()));
    },
    snapshot() {
      return clonePublicValue({
        workItems: [...state.workItems.values()],
        leases: [...state.leases.values()],
        attempts: [...state.attempts.values()],
        evidenceRecords: [...state.evidenceRecords.values()],
        events: [...state.events],
        refillJobs: [...state.refillJobs],
        blockedCandidates: [...state.blockedCandidates],
        needsReviewCandidates: [...state.needsReviewCandidates],
        duplicateCandidates: [...state.duplicateCandidates]
      });
    }
  };

  function refill(input) {
    if (!isRecord(input)) {
      return failResult("invalid_input", "Refill requires an input object.");
    }
    const { candidates, evidenceRefs, policyReason } = input;
    if (!hasEvidence(evidenceRefs)) {
      return failResult("missing_evidence", "Refill requires evidence refs.", evidenceRefs);
    }
    if (!hasMetadataSafeString(policyReason, MAX_RETAINED_METADATA_LENGTH)) {
      return failResult("invalid_input", "Refill requires policy reason.", evidenceRefs);
    }
    if (!Array.isArray(candidates)) {
      return failResult("invalid_input", "Refill requires candidate array.", evidenceRefs);
    }
    if (!candidates.every(isValidCandidateInput)) {
      return failResult("invalid_input", "Refill candidate is malformed.", evidenceRefs);
    }
    const normalizedEvidenceRefs = normalizeEvidenceRefs(evidenceRefs);
    const normalizedPolicyReason = normalizeMetadataString(policyReason);
    const normalizedCandidates = candidates.map(normalizeCandidateInput);

    const eventStartIndex = state.events.length;
    const started = appendEvent("dispatcher.refill.started", {
      actorType: "dispatcher",
      actorId: "memory-dispatcher",
      evidenceRefs: normalizedEvidenceRefs,
      payloadSummary: `refill started for ${candidates.length} candidates`
    });
    const refillJobId = nextId("refill", "refill");
    const queuedWorkItems = [];
    const duplicateCandidates = [];
    const blockedCandidates = [];
    const needsReviewCandidates = [];

    for (const candidate of normalizedCandidates) {
      if (candidate.status === "needs_review" && state.candidatesByDedupe.has(candidateDedupeKey(candidate))) {
        addUniqueCandidate(duplicateCandidates, candidate);
        upsertCandidate(state.duplicateCandidates, candidate);
        addUniqueCandidate(needsReviewCandidates, candidate);
        upsertCandidate(state.needsReviewCandidates, candidate);
        appendEvent("dispatcher.progress.observed", {
          actorType: "dispatcher",
          actorId: "memory-dispatcher",
          evidenceRefs: normalizedEvidenceRefs,
          correlationId: candidate.candidateWorkPacketId,
          causationId: started.eventId,
          payloadSummary: `duplicate needs-review candidate observed: ${candidate.candidateWorkPacketId}`
        });
        appendEvent("dispatcher.review.required", {
          actorType: "dispatcher",
          actorId: "memory-dispatcher",
          evidenceRefs: normalizedEvidenceRefs,
          correlationId: candidate.candidateWorkPacketId,
          causationId: started.eventId,
          payloadSummary: `candidate needs review: ${candidate.candidateWorkPacketId}`
        });
        if (isBlockedAuthorityClass(candidate.authorityClass)) {
          addUniqueCandidate(blockedCandidates, candidate);
          upsertCandidate(state.blockedCandidates, candidate);
          appendEvent("dispatcher.authority.blocked", {
            actorType: "dispatcher",
            actorId: "memory-dispatcher",
            evidenceRefs: normalizedEvidenceRefs,
            correlationId: candidate.candidateWorkPacketId,
            causationId: started.eventId,
            payloadSummary: `authority blocked ${candidate.candidateWorkPacketId}: ${candidate.authorityClass}`
          });
        }
        continue;
      }
      if (candidate.status === "needs_review") {
        addUniqueCandidate(needsReviewCandidates, candidate);
        upsertCandidate(state.needsReviewCandidates, candidate);
        appendEvent("dispatcher.review.required", {
          actorType: "dispatcher",
          actorId: "memory-dispatcher",
          evidenceRefs: normalizedEvidenceRefs,
          correlationId: candidate.candidateWorkPacketId,
          causationId: started.eventId,
          payloadSummary: `candidate needs review: ${candidate.candidateWorkPacketId}`
        });
        if (isBlockedAuthorityClass(candidate.authorityClass)) {
          addUniqueCandidate(blockedCandidates, candidate);
          upsertCandidate(state.blockedCandidates, candidate);
          appendEvent("dispatcher.authority.blocked", {
            actorType: "dispatcher",
            actorId: "memory-dispatcher",
            evidenceRefs: normalizedEvidenceRefs,
            correlationId: candidate.candidateWorkPacketId,
            causationId: started.eventId,
            payloadSummary: `authority blocked ${candidate.candidateWorkPacketId}: ${candidate.authorityClass}`
          });
        }
        continue;
      }
      if (candidate.authorityClass === "requires_preauthorization") {
        addUniqueCandidate(needsReviewCandidates, candidate);
        upsertCandidate(state.needsReviewCandidates, candidate);
        appendEvent("dispatcher.review.required", {
          actorType: "dispatcher",
          actorId: "memory-dispatcher",
          evidenceRefs: normalizedEvidenceRefs,
          correlationId: candidate.candidateWorkPacketId,
          causationId: started.eventId,
          payloadSummary: `candidate needs review: ${candidate.candidateWorkPacketId}`
        });
        continue;
      }
      if (isBlockedAuthorityClass(candidate.authorityClass)) {
        addUniqueCandidate(blockedCandidates, candidate);
        upsertCandidate(state.blockedCandidates, candidate);
        appendEvent("dispatcher.authority.blocked", {
          actorType: "dispatcher",
          actorId: "memory-dispatcher",
          evidenceRefs: normalizedEvidenceRefs,
          correlationId: candidate.candidateWorkPacketId,
          causationId: started.eventId,
          payloadSummary: `authority blocked ${candidate.candidateWorkPacketId}: ${candidate.authorityClass}`
        });
        continue;
      }
      if (candidate.status !== "eligible") {
        addUniqueCandidate(blockedCandidates, candidate);
        upsertCandidate(state.blockedCandidates, candidate);
        appendEvent("dispatcher.candidate.blocked", {
          actorType: "dispatcher",
          actorId: "memory-dispatcher",
          evidenceRefs: normalizedEvidenceRefs,
          correlationId: candidate.candidateWorkPacketId,
          causationId: started.eventId,
          payloadSummary: `candidate blocked: ${candidate.candidateWorkPacketId} status=${candidate.status}`
        });
        continue;
      }

      const eligible = lifecycle.evaluateCandidateEligibility(candidate, {
        status: "eligible",
        policyReason: normalizedPolicyReason,
        evidenceRefs: normalizedEvidenceRefs,
        clock
      });
      if (!eligible.ok) {
        addUniqueCandidate(blockedCandidates, candidate);
        upsertCandidate(state.blockedCandidates, candidate);
        appendEvent("dispatcher.candidate.blocked", {
          actorType: "dispatcher",
          actorId: "memory-dispatcher",
          evidenceRefs: normalizedEvidenceRefs,
          correlationId: candidate.candidateWorkPacketId,
          causationId: started.eventId,
          payloadSummary: `candidate blocked by lifecycle: ${candidate.candidateWorkPacketId}`
        });
        continue;
      }

      if (!isValidCandidateInput(eligible.value.candidate)) {
        addUniqueCandidate(blockedCandidates, candidate);
        upsertCandidate(state.blockedCandidates, candidate);
        appendEvent("dispatcher.candidate.blocked", {
          actorType: "dispatcher",
          actorId: "memory-dispatcher",
          evidenceRefs: normalizedEvidenceRefs,
          correlationId: candidate.candidateWorkPacketId,
          causationId: started.eventId,
          payloadSummary: `candidate blocked after lifecycle normalization: ${candidate.candidateWorkPacketId}`
        });
        continue;
      }

      const queuedCandidate = normalizeCandidateInput(eligible.value.candidate);
      const queuedDedupe = candidateDedupeKey(queuedCandidate);
      if (state.candidatesByDedupe.has(queuedDedupe)) {
        addUniqueCandidate(duplicateCandidates, queuedCandidate);
        upsertCandidate(state.duplicateCandidates, queuedCandidate);
        appendEvent("dispatcher.progress.observed", {
          actorType: "dispatcher",
          actorId: "memory-dispatcher",
          evidenceRefs: normalizedEvidenceRefs,
          correlationId: queuedCandidate.candidateWorkPacketId,
          causationId: started.eventId,
          payloadSummary: `duplicate candidate suppressed: ${queuedCandidate.candidateWorkPacketId}`
        });
        continue;
      }

      const workItem = createWorkItem(queuedCandidate, normalizedEvidenceRefs);
      const queued = lifecycle.transitionWorkItem(workItem, {
        toStatus: "queued",
        evidenceRefs: normalizedEvidenceRefs,
        clock
      });
      if (!queued.ok) {
        addUniqueCandidate(blockedCandidates, candidate);
        upsertCandidate(state.blockedCandidates, candidate);
        continue;
      }
      if (!isValidWorkItem(queued.value) || queued.value.status !== "queued") {
        addUniqueCandidate(blockedCandidates, candidate);
        upsertCandidate(state.blockedCandidates, candidate);
        appendEvent("dispatcher.candidate.blocked", {
          actorType: "dispatcher",
          actorId: "memory-dispatcher",
          evidenceRefs: normalizedEvidenceRefs,
          correlationId: queuedCandidate.candidateWorkPacketId,
          causationId: started.eventId,
          payloadSummary: `candidate blocked after lifecycle queue transition: ${queuedCandidate.candidateWorkPacketId}`
        });
        continue;
      }
      const queuedWorkItem = sanitizeWorkItem(queued.value);
      state.workItems.set(queuedWorkItem.workItemId, queuedWorkItem);
      state.candidatesByDedupe.set(queuedDedupe, queuedCandidate.candidateWorkPacketId);
      removeCandidateByRetentionKey(blockedCandidates, queuedCandidate);
      removeCandidateByRetentionKey(needsReviewCandidates, queuedCandidate);
      removeCandidateByRetentionKey(state.blockedCandidates, queuedCandidate);
      removeCandidateByRetentionKey(state.needsReviewCandidates, queuedCandidate);
      queuedWorkItems.push(queuedWorkItem);
      appendEvent("dispatcher.work.queued", {
        actorType: "dispatcher",
        actorId: "memory-dispatcher",
        evidenceRefs: normalizedEvidenceRefs,
        correlationId: queued.value.workItemId,
        causationId: started.eventId,
        payloadSummary: `queued ${queued.value.workItemId}`
      });
    }

    if (queuedWorkItems.length === 0) {
      appendEvent("dispatcher.work_supply.empty", {
        actorType: "dispatcher",
        actorId: "memory-dispatcher",
        evidenceRefs: normalizedEvidenceRefs,
        causationId: started.eventId,
        payloadSummary: `refill source produced no queued work; duplicates=${duplicateCandidates.length} blocked=${blockedCandidates.length} needsReview=${needsReviewCandidates.length}`
      });
    }
    const hasGatedCandidates = blockedCandidates.length > 0 || needsReviewCandidates.length > 0;
    const refillResult = queuedWorkItems.length > 0
      ? hasGatedCandidates
        ? "queued_with_gated_candidates"
        : "queued_work"
      : blockedCandidates.length > 0
        ? "blocked"
        : needsReviewCandidates.length > 0
          ? "needs_review"
          : "no_safe_work";

    const refillJob = {
      refillJobId,
      sourceRefs: unique(normalizedCandidates.flatMap((candidate) => candidate.sourceRefs.map((source) => source.sourceRefId))),
      triggerReason: "manual_bootstrap",
      lowWatermark: 1,
      highWatermark: Math.max(1, candidates.length),
      lockId: `${refillJobId}-lock`,
      candidateCount: candidates.length,
      queuedCount: queuedWorkItems.length,
      needsReviewCount: needsReviewCandidates.length,
      blockedCount: blockedCandidates.length,
      authorityClass: refillAuthorityClass({ queuedWorkItems, blockedCandidates, needsReviewCandidates }),
      state: "completed",
      startedAt: started.occurredAt,
      finishedAt: clock.nowIso(),
      result: refillResult,
      evidenceRefs: normalizeEvidenceRefs(normalizedEvidenceRefs),
      createdAt: started.occurredAt,
      updatedAt: clock.nowIso()
    };
    state.refillJobs.push(refillJob);
    appendEvent("dispatcher.refill.completed", {
      actorType: "dispatcher",
      actorId: "memory-dispatcher",
      evidenceRefs: normalizedEvidenceRefs,
      correlationId: refillJobId,
      causationId: started.eventId,
      payloadSummary: `refill completed queued=${queuedWorkItems.length} duplicates=${duplicateCandidates.length} needsReview=${needsReviewCandidates.length}`
    });

    return okResult({ refillJob, queuedWorkItems, duplicateCandidates, blockedCandidates, needsReviewCandidates, events: state.events.slice(eventStartIndex) }, normalizedEvidenceRefs);
  }

  function claim(input) {
    if (!isRecord(input)) {
      return failResult("invalid_input", "Claim requires an input object.");
    }
    const { evidenceRefs } = input;
    const workerId = isRecord(input) && typeof input.workerId === "string" ? normalizeMetadataString(input.workerId) : input?.workerId;
    if (!hasEvidence(evidenceRefs)) {
      return failResult("missing_evidence", "Claim requires evidence refs.", evidenceRefs);
    }
    if (!hasMetadataSafeString(workerId, MAX_RETAINED_METADATA_LENGTH)) {
      return failResult("invalid_input", "Claim requires worker id.", evidenceRefs);
    }
    const normalizedEvidenceRefs = normalizeEvidenceRefs(evidenceRefs);

    const queued = [...state.workItems.values()].find((item) => item.status === "queued");
    if (!queued) {
      return failResult("no_work", "No queued work is available for lease.", normalizedEvidenceRefs);
    }

    const leaseId = nextId("lease", "lease");
    const attemptId = nextId("attempt", "attempt");
    const idempotencyKey = `${leaseId}-idempotency`;
    const leased = lifecycle.transitionWorkItem(queued, {
      toStatus: "leased",
      leaseId,
      evidenceRefs: normalizedEvidenceRefs,
      clock
    });
    if (!leased.ok) {
      return leased;
    }
    if (!isValidWorkItem(leased.value) || leased.value.status !== "leased") {
      return failResult("invalid_lifecycle_result", "Claim lifecycle returned unsafe work item metadata.", normalizedEvidenceRefs);
    }
    if (!sameWorkItemIdentity(leased.value, queued) || leased.value.leaseId !== leaseId) {
      return failResult("invalid_lifecycle_result", "Claim lifecycle changed work item identity.", normalizedEvidenceRefs);
    }
    const leasedWorkItem = sanitizeWorkItem(leased.value);

    const lease = {
      leaseId,
      workItemId: queued.workItemId,
      workerId,
      attemptId,
      state: "leased",
      claimedAt: clock.nowIso(),
      heartbeatAt: null,
      expiresAt: new Date(clock.nowEpochMs() + leaseTtlMs).toISOString(),
      attempt: leasedWorkItem.attemptCount,
      idempotencyKey,
      authorityDecisionId: queued.authorityDecisionId,
      evidenceRefs: normalizeEvidenceRefs(normalizedEvidenceRefs),
      createdAt: clock.nowIso(),
      updatedAt: clock.nowIso()
    };
    const executionAttempt = {
      attemptId,
      leaseId,
      workItemId: queued.workItemId,
      workerId,
      state: "running",
      startedAt: clock.nowIso(),
      finishedAt: null,
      resultSummary: null,
      failureReason: null,
      authorityDecisionId: queued.authorityDecisionId,
      evidenceRefs: normalizeEvidenceRefs(normalizedEvidenceRefs),
      createdAt: clock.nowIso(),
      updatedAt: clock.nowIso()
    };
    state.workItems.set(leasedWorkItem.workItemId, leasedWorkItem);
    state.leases.set(lease.leaseId, lease);
    state.attempts.set(executionAttempt.attemptId, executionAttempt);

    const event = appendEvent("dispatcher.lease.claimed", {
      actorType: "worker",
      actorId: workerId,
      evidenceRefs: normalizedEvidenceRefs,
      correlationId: lease.leaseId,
      payloadSummary: `lease ${lease.leaseId} claimed for ${queued.workItemId}`
    });
    return okResult({ workItem: leasedWorkItem, lease, executionAttempt, events: [event] }, normalizedEvidenceRefs);
  }

  function heartbeat(input) {
    if (!isRecord(input)) {
      return failResult("invalid_input", "Lease heartbeat requires an input object.");
    }
    if (!hasEvidence(input.evidenceRefs)) {
      return failResult("missing_evidence", "Lease heartbeat requires evidence refs.", input.evidenceRefs ?? []);
    }
    if (!hasMetadataSafeString(input.workerId, MAX_RETAINED_METADATA_LENGTH)) {
      return failResult("invalid_input", "Lease heartbeat requires worker id.", input.evidenceRefs);
    }
    const workerId = normalizeMetadataString(input.workerId);
    const fenceValidation = validateLeaseFenceInput(input);
    if (!fenceValidation.ok) {
      return fenceValidation;
    }
    const normalizedEvidenceRefs = normalizeEvidenceRefs(input.evidenceRefs);
    const lease = state.leases.get(input.leaseId);
    if (!lease) {
      return failResult("stale_lease", "Unknown lease.", normalizedEvidenceRefs);
    }
    const workItem = state.workItems.get(lease.workItemId);
    if (!workItem) {
      return failResult("stale_lease", "Lease does not reference a known work item.", normalizedEvidenceRefs);
    }
    const attempt = state.attempts.get(input.attemptId);
    if (!attempt) {
      return failResult("stale_lease", "Lease heartbeat references missing attempt.", normalizedEvidenceRefs);
    }
    if (
      lease.attemptId !== input.attemptId ||
      attempt.leaseId !== lease.leaseId ||
      attempt.workItemId !== lease.workItemId ||
      attempt.workerId !== workerId ||
      lease.workerId !== workerId ||
      lease.idempotencyKey !== input.idempotencyKey ||
      lease.authorityDecisionId !== input.authorityDecisionId ||
      attempt.authorityDecisionId !== input.authorityDecisionId
    ) {
      return failResult("stale_lease", "Lease heartbeat does not match the active lease and attempt identity.", normalizedEvidenceRefs);
    }

    const heartbeatResult = lifecycle.heartbeatLease(lease, { ...input, workerId, evidenceRefs: normalizedEvidenceRefs, clock });
    if (!heartbeatResult.ok) {
      return heartbeatResult;
    }
    const running = lifecycle.transitionWorkItem(workItem, {
      toStatus: "running",
      leaseId: input.leaseId,
      evidenceRefs: normalizedEvidenceRefs,
      clock
    });
    if (!running.ok) {
      return running;
    }
    if (!isValidWorkItem(running.value) || running.value.status !== "running") {
      return failResult("invalid_lifecycle_result", "Heartbeat lifecycle returned unsafe work item metadata.", normalizedEvidenceRefs);
    }
    if (!sameWorkItemIdentity(running.value, workItem) || running.value.leaseId !== input.leaseId) {
      return failResult("invalid_lifecycle_result", "Heartbeat lifecycle changed work item identity.", normalizedEvidenceRefs);
    }
    const runningWorkItem = sanitizeWorkItem(running.value);
    if (!isValidLease(heartbeatResult.value) || heartbeatResult.value.state !== "running") {
      return failResult("invalid_lifecycle_result", "Heartbeat lifecycle returned unsafe lease metadata.", normalizedEvidenceRefs);
    }
    if (!sameLeaseIdentity(heartbeatResult.value, lease)) {
      return failResult("invalid_lifecycle_result", "Heartbeat lifecycle changed lease identity.", normalizedEvidenceRefs);
    }
    const runningLease = sanitizeLease(heartbeatResult.value);

    state.leases.set(input.leaseId, runningLease);
    state.workItems.set(runningWorkItem.workItemId, runningWorkItem);
    const event = appendEvent("dispatcher.lease.heartbeat", {
      actorType: "worker",
      actorId: workerId,
      evidenceRefs: normalizedEvidenceRefs,
      correlationId: input.leaseId,
      payloadSummary: `lease ${input.leaseId} heartbeat`
    });
    return okResult({ workItem: runningWorkItem, lease: runningLease, events: [event] }, normalizedEvidenceRefs);
  }

  function closeout(input, outcome) {
    if (!isRecord(input)) {
      return failResult("invalid_input", "Lease closeout requires an input object.");
    }
    if (!hasEvidence(input.evidenceRefs)) {
      return failResult("missing_evidence", "Lease closeout requires evidence refs.", input.evidenceRefs ?? []);
    }
    if (!hasMetadataSafeString(input.workerId, MAX_RETAINED_METADATA_LENGTH)) {
      return failResult("invalid_input", "Lease closeout requires worker id.", input.evidenceRefs);
    }
    const workerId = normalizeMetadataString(input.workerId);
    if (input.resultSummary !== undefined && input.resultSummary !== null && !isMetadataSafeString(input.resultSummary, MAX_CLOSEOUT_METADATA_LENGTH)) {
      return failResult("invalid_input", "Lease completion requires a metadata-safe result summary.", input.evidenceRefs);
    }
    if (input.failureReason !== undefined && input.failureReason !== null && !isMetadataSafeString(input.failureReason, MAX_CLOSEOUT_METADATA_LENGTH)) {
      return failResult("invalid_input", "Lease failure requires a metadata-safe failure reason.", input.evidenceRefs);
    }
    const fenceValidation = validateLeaseFenceInput(input);
    if (!fenceValidation.ok) {
      return fenceValidation;
    }
    const normalizedEvidenceRefs = normalizeEvidenceRefs(input.evidenceRefs);
    const lease = state.leases.get(input.leaseId);
    if (!lease) {
      return failResult("stale_lease", "Unknown lease.", normalizedEvidenceRefs);
    }
    const workItem = state.workItems.get(lease.workItemId);
    const attempt = state.attempts.get(input.attemptId);
    if (!workItem || !attempt) {
      return failResult("stale_lease", "Lease closeout references missing work or attempt.", normalizedEvidenceRefs);
    }
    if (
      lease.attemptId !== input.attemptId ||
      attempt.leaseId !== lease.leaseId ||
      attempt.workItemId !== lease.workItemId ||
      attempt.workerId !== workerId ||
      lease.workerId !== workerId ||
      lease.idempotencyKey !== input.idempotencyKey ||
      lease.authorityDecisionId !== input.authorityDecisionId ||
      attempt.authorityDecisionId !== input.authorityDecisionId
    ) {
      return failResult("stale_lease", "Lease closeout does not match the active lease and attempt identity.", normalizedEvidenceRefs);
    }

    const resultSummary = outcome === "completed" ? normalizeCloseoutMetadata(input.resultSummary ?? "completed") : null;
    const failureReason = outcome === "failed" ? normalizeCloseoutMetadata(input.failureReason ?? "failed") : null;
    const closeoutInput = {
      ...input,
      workerId,
      evidenceRefs: normalizedEvidenceRefs,
      ...(resultSummary === null ? {} : { resultSummary }),
      ...(failureReason === null ? {} : { failureReason }),
      clock
    };
    const closeoutResult = outcome === "completed"
      ? lifecycle.completeLease(workItem, lease, closeoutInput)
      : lifecycle.failLease(workItem, lease, closeoutInput);
    if (!closeoutResult.ok) {
      return closeoutResult;
    }
    if (!isValidWorkItem(closeoutResult.value.workItem) || closeoutResult.value.workItem.status !== outcome) {
      return failResult("invalid_lifecycle_result", "Lease closeout lifecycle returned unsafe work item metadata.", normalizedEvidenceRefs);
    }
    if (!sameWorkItemIdentity(closeoutResult.value.workItem, workItem) || closeoutResult.value.workItem.leaseId !== lease.leaseId) {
      return failResult("invalid_lifecycle_result", "Lease closeout lifecycle changed work item identity.", normalizedEvidenceRefs);
    }
    const closedWorkItem = sanitizeWorkItem(closeoutResult.value.workItem);
    if (!isValidLease(closeoutResult.value.lease) || closeoutResult.value.lease.state !== outcome) {
      return failResult("invalid_lifecycle_result", "Lease closeout lifecycle returned unsafe lease metadata.", normalizedEvidenceRefs);
    }
    if (!sameLeaseIdentity(closeoutResult.value.lease, lease)) {
      return failResult("invalid_lifecycle_result", "Lease closeout lifecycle changed lease identity.", normalizedEvidenceRefs);
    }
    const closedLease = sanitizeLease(closeoutResult.value.lease);

    const finishedAttempt = {
      ...attempt,
      state: outcome,
      finishedAt: clock.nowIso(),
      resultSummary,
      failureReason,
      evidenceRefs: unique([...attempt.evidenceRefs, ...normalizedEvidenceRefs]),
      updatedAt: clock.nowIso()
    };
    const evidenceRecords = normalizedEvidenceRefs.map((evidenceRefId) =>
      ensureEvidenceRecord(evidenceRefId, outcome === "completed" ? "attempt completed" : "attempt failed", "attempt")
    );
    state.workItems.set(closedWorkItem.workItemId, closedWorkItem);
    state.leases.set(closedLease.leaseId, closedLease);
    state.attempts.set(attempt.attemptId, finishedAttempt);
    const event = appendEvent(outcome === "completed" ? "dispatcher.attempt.completed" : "dispatcher.attempt.failed", {
      actorType: "worker",
      actorId: workerId,
      evidenceRefs: normalizedEvidenceRefs,
      correlationId: input.attemptId,
      payloadSummary: `${outcome} ${input.attemptId}`
    });
    return okResult(
      {
        workItem: closedWorkItem,
        lease: closedLease,
        executionAttempt: finishedAttempt,
        evidenceRecords,
        events: [event]
      },
      normalizedEvidenceRefs
    );
  }

  function recoverExpiredLeases(input) {
    if (!isRecord(input)) {
      return failResult("invalid_input", "Recovery requires an input object.");
    }
    const { evidenceRefs } = input;
    if (!hasEvidence(evidenceRefs)) {
      return failResult("missing_evidence", "Recovery requires evidence refs.", evidenceRefs ?? []);
    }
    const normalizedEvidenceRefs = normalizeEvidenceRefs(evidenceRefs);
    const recoveredWorkItems = [];
    const expiredLeases = [];
    const events = [];
    for (const lease of state.leases.values()) {
      const workItem = state.workItems.get(lease.workItemId);
      if (!workItem || lease.state !== "leased" && lease.state !== "running") {
        continue;
      }
      const expiry = lifecycle.expireLeaseIfStale(workItem, lease, {
        evidenceRefs: normalizedEvidenceRefs,
        clock
      });
      if (!expiry.ok) {
        continue;
      }
      if (!isValidWorkItem(expiry.value.workItem) || expiry.value.workItem.status !== "expired" || !sameWorkItemIdentity(expiry.value.workItem, workItem) || expiry.value.workItem.leaseId !== lease.leaseId) {
        continue;
      }
      const expiredWorkItem = sanitizeWorkItem(expiry.value.workItem);
      if (!isValidLease(expiry.value.lease) || expiry.value.lease.state !== "expired" || !sameLeaseIdentity(expiry.value.lease, lease)) {
        continue;
      }
      const expiredLease = sanitizeLease(expiry.value.lease);
      const recovery = lifecycle.recoverWorkItem(expiredWorkItem, {
        maxAttempts,
        evidenceRefs: normalizedEvidenceRefs,
        clock
      });
      if (!recovery.ok) {
        continue;
      }
      if (!isValidWorkItem(recovery.value.workItem) || !["queued", "quarantined", "blocked"].includes(recovery.value.workItem.status)) {
        continue;
      }
      if (!sameWorkItemIdentity(recovery.value.workItem, expiredWorkItem)) {
        continue;
      }
      const recoveredWorkItem = sanitizeWorkItem(recovery.value.workItem);
      state.workItems.set(expiredWorkItem.workItemId, expiredWorkItem);
      state.leases.set(expiredLease.leaseId, expiredLease);
      const attempt = state.attempts.get(lease.attemptId);
      if (attempt?.state === "running") {
        state.attempts.set(attempt.attemptId, {
          ...attempt,
          state: "expired",
          finishedAt: clock.nowIso(),
          failureReason: "lease_expired",
          evidenceRefs: unique([...attempt.evidenceRefs, ...normalizedEvidenceRefs]),
          updatedAt: clock.nowIso()
        });
      }
      expiredLeases.push(expiredLease);
      events.push(
        appendEvent("dispatcher.lease.expired", {
          actorType: "dispatcher",
          actorId: "memory-dispatcher",
          evidenceRefs: normalizedEvidenceRefs,
          correlationId: lease.leaseId,
          payloadSummary: `lease ${lease.leaseId} expired`
        })
      );
      state.workItems.set(recoveredWorkItem.workItemId, recoveredWorkItem);
      recoveredWorkItems.push(recoveredWorkItem);
      events.push(
        appendEvent("dispatcher.recovery.attempted", {
          actorType: "dispatcher",
          actorId: "memory-dispatcher",
          evidenceRefs: normalizedEvidenceRefs,
          correlationId: recoveredWorkItem.workItemId,
          payloadSummary: `recovery decision ${recovery.value.decision}`
        })
      );
    }
    for (const workItem of state.workItems.values()) {
      if (workItem.status !== "failed") {
        continue;
      }
      const recovery = lifecycle.recoverWorkItem(workItem, {
        maxAttempts,
        evidenceRefs: normalizedEvidenceRefs,
        clock
      });
      if (!recovery.ok) {
        continue;
      }
      if (!isValidWorkItem(recovery.value.workItem) || !["queued", "quarantined", "blocked"].includes(recovery.value.workItem.status)) {
        continue;
      }
      if (!sameWorkItemIdentity(recovery.value.workItem, workItem)) {
        continue;
      }
      const recoveredWorkItem = sanitizeWorkItem(recovery.value.workItem);
      state.workItems.set(recoveredWorkItem.workItemId, recoveredWorkItem);
      recoveredWorkItems.push(recoveredWorkItem);
      events.push(
        appendEvent("dispatcher.recovery.attempted", {
          actorType: "dispatcher",
          actorId: "memory-dispatcher",
          evidenceRefs: normalizedEvidenceRefs,
          correlationId: recoveredWorkItem.workItemId,
          payloadSummary: `recovery decision ${recovery.value.decision}`
        })
      );
    }
    return okResult({ recoveredWorkItems, expiredLeases, events }, normalizedEvidenceRefs);
  }

  function summarize() {
    const workItems = [...state.workItems.values()];
    const summaryEvent = appendEvent("dispatcher.summary.updated", {
      actorType: "dispatcher",
      actorId: "memory-dispatcher",
      evidenceRefs: ["evidence-summary"],
      payloadSummary: "summary updated"
    });
    const summary = buildManagerExecutionLaneSummary({
      runId: dispatcherRunId,
      clock,
      workItems,
      leases: [...state.leases.values()],
      attempts: [...state.attempts.values()],
      events: state.events,
      refillJobs: state.refillJobs,
      blockedCandidates: state.blockedCandidates,
      needsReviewCandidates: state.needsReviewCandidates,
      duplicateCandidates: state.duplicateCandidates,
      summaryEvent,
      stateSource: "fixture",
      proofMode: "backend_proof",
      staleAfterMs: summaryStaleAfterMs
    });
    summaryEvent.payloadSummary = normalizeEventPayloadSummary(`summary phase ${summary.currentPhase}`);
    return summary;
  }

  function createWorkItem(candidate, evidenceRefs) {
    return {
      workItemId: nextId("workItem", "work-item"),
      runId: candidate.runId,
      candidateWorkPacketId: candidate.candidateWorkPacketId,
      sourceRefs: normalizeSourceRefs(candidate.sourceRefs),
      dedupeKey: candidateDedupeKey(candidate),
      title: candidate.proposedSlice,
      sliceType: candidate.authorityStage,
      status: "eligible",
      priority: "normal",
      authorityClass: candidate.authorityClass,
      authorityDecisionId: `authority-${state.counters.workItem}`,
      verificationTargets: normalizeVerificationTargets(candidate.verificationTargets),
      dependencies: normalizeDependencyHints(candidate.dependencyHints),
      attemptCount: 0,
      leaseId: null,
      evidenceRefs: unique([...normalizeEvidenceRefs(candidate.evidenceRefs), ...normalizeEvidenceRefs(evidenceRefs)]),
      createdAt: clock.nowIso(),
      updatedAt: clock.nowIso()
    };
  }

  function appendEvent(eventName, { actorType, actorId, evidenceRefs, correlationId = "run-1", causationId = null, payloadSummary }) {
    const normalizedEvidenceRefs = normalizeEvidenceRefs(evidenceRefs);
    ensureEvidenceRecords(normalizedEvidenceRefs, `${eventName} evidence`, "event");
    const normalizedActorId = normalizeEventScalar(actorId);
    const normalizedCorrelationId = normalizeEventScalar(correlationId);
    const normalizedCausationId = causationId === null ? null : normalizeEventScalar(causationId);
    const event = {
      eventId: nextId("event", "event"),
      schemaVersion: "manager_control_plane_event.v1",
      eventName,
      runId: dispatcherRunId,
      actorType,
      actorId: normalizedActorId,
      occurredAt: clock.nowIso(),
      correlationId: normalizedCorrelationId,
      causationId: normalizedCausationId,
      idempotencyKey: `${eventName}-${state.counters.event}`,
      redactionBoundary: "metadata_only",
      projectionBehavior: eventName.includes("summary") ? "updates_summary" : "records_evidence",
      evidenceRefs: normalizedEvidenceRefs,
      payloadSummary: normalizeEventPayloadSummary(payloadSummary)
    };
    state.events.push(event);
    return event;
  }

  function ensureEvidenceRecord(evidenceRefId, label, evidenceType) {
    if (!state.evidenceRecords.has(evidenceRefId)) {
      state.evidenceRecords.set(evidenceRefId, {
        evidenceRefId,
        evidenceType,
        label,
        artifactPath: null,
        retentionClass: "fixture",
        rawPayloadRetained: false,
        createdAt: clock.nowIso()
      });
    }
    return state.evidenceRecords.get(evidenceRefId);
  }

  function ensureEvidenceRecords(evidenceRefs, label, evidenceType) {
    for (const evidenceRefId of evidenceRefs ?? []) {
      ensureEvidenceRecord(evidenceRefId, label, evidenceType);
    }
  }

  function nextId(counterName, prefix) {
    state.counters[counterName] += 1;
    return `${prefix}-${String(state.counters[counterName]).padStart(3, "0")}`;
  }
}

function candidateDedupeKey(candidate) {
  const sourceKey = (Array.isArray(candidate.sourceRefs) ? candidate.sourceRefs : [])
    .filter((source) => isRecord(source))
    .map((source) => `${safeDedupeString(source.sourceRefId)}:${safeDedupeString(source.sourceSpan)}`)
    .join("|");
  const acceptanceKey = (Array.isArray(candidate.acceptanceCriteria) ? candidate.acceptanceCriteria : [])
    .map(safeDedupeString)
    .filter(Boolean)
    .sort()
    .join("|");
  const dependencyHints = Array.isArray(candidate.dependencyHints) ? candidate.dependencyHints : [];
  const touchedSurfaceHint = normalizeDependencyHints(dependencyHints).sort().join("|") || safeDedupeString(candidate.dedupeKey);
  return `${sourceKey}::${acceptanceKey}::${touchedSurfaceHint}`;
}

function safeDedupeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function refillAuthorityClass({ queuedWorkItems, blockedCandidates, needsReviewCandidates }) {
  if (blockedCandidates.length > 0 || (queuedWorkItems.length > 0 && needsReviewCandidates.length > 0)) {
    return "block_and_record";
  }
  if (needsReviewCandidates.length > 0) {
    return "requires_preauthorization";
  }
  return "allowed_unattended";
}

function isBlockedAuthorityClass(authorityClass) {
  return authorityClass === "block_and_record" || authorityClass === "forbidden";
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidCandidateInput(candidate) {
  if (!isRecord(candidate)) {
    return false;
  }
  if (!Object.keys(candidate).every((key) => CANDIDATE_INPUT_KEYS.has(key))) {
    return false;
  }
  const verificationTargetsValid = candidate.status === "needs_review"
    ? (candidate.verificationTargets === undefined || Array.isArray(candidate.verificationTargets) && candidate.verificationTargets.every(isValidVerificationTarget))
    : Array.isArray(candidate.verificationTargets) && candidate.verificationTargets.length > 0 && candidate.verificationTargets.every(isValidVerificationTarget);
  return hasMetadataSafeString(candidate.candidateWorkPacketId, MAX_RETAINED_METADATA_LENGTH) &&
    hasMetadataSafeString(candidate.runId, MAX_RETAINED_METADATA_LENGTH) &&
    hasMetadataSafeString(candidate.proposedSlice, MAX_RETAINED_METADATA_LENGTH) &&
    hasMetadataSafeString(candidate.dedupeKey, MAX_RETAINED_METADATA_LENGTH) &&
    MANAGER_RISK_CLASSES.has(candidate.riskClass) &&
    MANAGER_AUTHORITY_CLASSES.has(candidate.authorityClass) &&
    MANAGER_AUTHORITY_STAGES.has(candidate.authorityStage) &&
    CANDIDATE_STATUSES.has(candidate.status) &&
    hasMetadataSafeString(candidate.policyId, MAX_RETAINED_METADATA_LENGTH) &&
    hasMetadataSafeString(candidate.createdAt, MAX_RETAINED_METADATA_LENGTH) &&
    hasMetadataSafeString(candidate.updatedAt, MAX_RETAINED_METADATA_LENGTH) &&
    Array.isArray(candidate.sourceRefs) &&
    candidate.sourceRefs.length > 0 &&
    candidate.sourceRefs.every(isValidSourceRef) &&
    Array.isArray(candidate.acceptanceCriteria) &&
    candidate.acceptanceCriteria.length > 0 &&
    candidate.acceptanceCriteria.every((criterion) => hasMetadataSafeString(criterion, MAX_RETAINED_METADATA_LENGTH)) &&
    Array.isArray(candidate.dependencyHints) &&
    candidate.dependencyHints.every((hint) => typeof hint === "string" && (hint.trim().length === 0 || hasMetadataSafeString(hint, MAX_RETAINED_METADATA_LENGTH))) &&
    verificationTargetsValid &&
    hasEvidence(candidate.evidenceRefs);
}

function isValidSourceRef(source) {
  return isRecord(source) &&
    Object.keys(source).every((key) => ["sourceRefId", "sourceType", "label", "pathOrUrl", "sourceSpan", "summaryOnly"].includes(key)) &&
    hasMetadataSafeString(source.sourceRefId, MAX_RETAINED_METADATA_LENGTH) &&
    MANAGER_SOURCE_TYPES.has(source.sourceType) &&
    hasMetadataSafeString(source.label, MAX_RETAINED_METADATA_LENGTH) &&
    isOptionalMetadataSafeString(source.pathOrUrl, MAX_RETAINED_METADATA_LENGTH) &&
    isOptionalMetadataSafeString(source.sourceSpan, MAX_RETAINED_METADATA_LENGTH) &&
    typeof source.summaryOnly === "boolean";
}

function isValidVerificationTarget(target) {
  return isRecord(target) &&
    Object.keys(target).every((key) => ["verificationTargetId", "commandId", "command", "expectedResult"].includes(key)) &&
    hasMetadataSafeString(target.verificationTargetId, MAX_RETAINED_METADATA_LENGTH) &&
    hasMetadataSafeString(target.commandId, MAX_RETAINED_METADATA_LENGTH) &&
    hasMetadataSafeString(target.command, MAX_RETAINED_METADATA_LENGTH) &&
    hasMetadataSafeString(target.expectedResult, MAX_RETAINED_METADATA_LENGTH);
}

function isValidWorkItem(workItem) {
  return isRecord(workItem) &&
    Object.keys(workItem).every((key) => [
      "workItemId",
      "runId",
      "candidateWorkPacketId",
      "sourceRefs",
      "dedupeKey",
      "title",
      "sliceType",
      "status",
      "priority",
      "authorityClass",
      "authorityDecisionId",
      "verificationTargets",
      "dependencies",
      "attemptCount",
      "leaseId",
      "evidenceRefs",
      "createdAt",
      "updatedAt"
    ].includes(key)) &&
    hasMetadataSafeString(workItem.workItemId, MAX_RETAINED_METADATA_LENGTH) &&
    hasMetadataSafeString(workItem.runId, MAX_RETAINED_METADATA_LENGTH) &&
    hasMetadataSafeString(workItem.candidateWorkPacketId, MAX_RETAINED_METADATA_LENGTH) &&
    Array.isArray(workItem.sourceRefs) &&
    workItem.sourceRefs.length > 0 &&
    workItem.sourceRefs.every(isValidSourceRef) &&
    hasMetadataSafeString(workItem.dedupeKey, MAX_RETAINED_METADATA_LENGTH) &&
    hasMetadataSafeString(workItem.title, MAX_RETAINED_METADATA_LENGTH) &&
    MANAGER_AUTHORITY_STAGES.has(workItem.sliceType) &&
    WORK_STATUSES.includes(workItem.status) &&
    hasMetadataSafeString(workItem.priority, MAX_RETAINED_METADATA_LENGTH) &&
    MANAGER_AUTHORITY_CLASSES.has(workItem.authorityClass) &&
    hasMetadataSafeString(workItem.authorityDecisionId, MAX_RETAINED_METADATA_LENGTH) &&
    Array.isArray(workItem.verificationTargets) &&
    workItem.verificationTargets.length > 0 &&
    workItem.verificationTargets.every(isValidVerificationTarget) &&
    Array.isArray(workItem.dependencies) &&
    workItem.dependencies.every((dependency) => hasMetadataSafeString(dependency, MAX_RETAINED_METADATA_LENGTH)) &&
    Number.isInteger(workItem.attemptCount) &&
    workItem.attemptCount >= 0 &&
    (workItem.leaseId === null || hasMetadataSafeString(workItem.leaseId, MAX_RETAINED_METADATA_LENGTH)) &&
    hasEvidence(workItem.evidenceRefs) &&
    hasMetadataSafeString(workItem.createdAt, MAX_RETAINED_METADATA_LENGTH) &&
    hasMetadataSafeString(workItem.updatedAt, MAX_RETAINED_METADATA_LENGTH);
}

function isValidLease(lease) {
  return isRecord(lease) &&
    Object.keys(lease).every((key) => [
      "leaseId",
      "workItemId",
      "workerId",
      "attemptId",
      "state",
      "claimedAt",
      "heartbeatAt",
      "expiresAt",
      "attempt",
      "idempotencyKey",
      "authorityDecisionId",
      "evidenceRefs",
      "createdAt",
      "updatedAt"
    ].includes(key)) &&
    hasMetadataSafeString(lease.leaseId, MAX_RETAINED_METADATA_LENGTH) &&
    hasMetadataSafeString(lease.workItemId, MAX_RETAINED_METADATA_LENGTH) &&
    hasMetadataSafeString(lease.workerId, MAX_RETAINED_METADATA_LENGTH) &&
    hasMetadataSafeString(lease.attemptId, MAX_RETAINED_METADATA_LENGTH) &&
    ["leased", "running", "completed", "failed", "expired"].includes(lease.state) &&
    hasMetadataSafeString(lease.claimedAt, MAX_RETAINED_METADATA_LENGTH) &&
    isOptionalMetadataSafeString(lease.heartbeatAt, MAX_RETAINED_METADATA_LENGTH) &&
    hasMetadataSafeString(lease.expiresAt, MAX_RETAINED_METADATA_LENGTH) &&
    Number.isInteger(lease.attempt) &&
    lease.attempt >= 1 &&
    hasMetadataSafeString(lease.idempotencyKey, MAX_RETAINED_METADATA_LENGTH) &&
    hasMetadataSafeString(lease.authorityDecisionId, MAX_RETAINED_METADATA_LENGTH) &&
    hasEvidence(lease.evidenceRefs) &&
    hasMetadataSafeString(lease.createdAt, MAX_RETAINED_METADATA_LENGTH) &&
    hasMetadataSafeString(lease.updatedAt, MAX_RETAINED_METADATA_LENGTH);
}

function sameWorkItemIdentity(actual, expected) {
  return actual.workItemId === expected.workItemId &&
    actual.runId === expected.runId &&
    actual.candidateWorkPacketId === expected.candidateWorkPacketId &&
    actual.authorityDecisionId === expected.authorityDecisionId;
}

function sameLeaseIdentity(actual, expected) {
  return actual.leaseId === expected.leaseId &&
    actual.workItemId === expected.workItemId &&
    actual.workerId === expected.workerId &&
    actual.attemptId === expected.attemptId &&
    actual.idempotencyKey === expected.idempotencyKey &&
    actual.authorityDecisionId === expected.authorityDecisionId;
}

function normalizeCandidateInput(candidate) {
  return {
    candidateWorkPacketId: normalizeMetadataString(candidate.candidateWorkPacketId),
    runId: normalizeMetadataString(candidate.runId),
    sourceRefs: normalizeSourceRefs(candidate.sourceRefs),
    proposedSlice: normalizeMetadataString(candidate.proposedSlice),
    acceptanceCriteria: candidate.acceptanceCriteria.map(normalizeMetadataString),
    verificationTargets: normalizeVerificationTargets(Array.isArray(candidate.verificationTargets) ? candidate.verificationTargets : []),
    riskClass: candidate.riskClass,
    dependencyHints: normalizeDependencyHints(candidate.dependencyHints),
    dedupeKey: normalizeMetadataString(candidate.dedupeKey),
    authorityClass: candidate.authorityClass,
    authorityStage: candidate.authorityStage,
    status: candidate.status,
    policyId: normalizeMetadataString(candidate.policyId),
    evidenceRefs: normalizeEvidenceRefs(candidate.evidenceRefs),
    createdAt: normalizeMetadataString(candidate.createdAt),
    updatedAt: normalizeMetadataString(candidate.updatedAt)
  };
}

function normalizeSourceRefs(sourceRefs) {
  return sourceRefs.map((source) => ({
    sourceRefId: normalizeMetadataString(source.sourceRefId),
    sourceType: source.sourceType,
    label: normalizeMetadataString(source.label),
    ...(source.pathOrUrl === undefined || source.pathOrUrl === null ? {} : { pathOrUrl: normalizeOptionalMetadataString(source.pathOrUrl) }),
    ...(source.sourceSpan === undefined || source.sourceSpan === null ? {} : { sourceSpan: normalizeOptionalMetadataString(source.sourceSpan) }),
    summaryOnly: source.summaryOnly
  }));
}

function normalizeVerificationTargets(targets) {
  return targets.map((target) => ({
    verificationTargetId: normalizeMetadataString(target.verificationTargetId),
    commandId: normalizeMetadataString(target.commandId),
    command: normalizeMetadataString(target.command),
    expectedResult: normalizeMetadataString(target.expectedResult)
  }));
}

function normalizeDependencyHints(hints) {
  return unique(hints.map(normalizeMetadataString).filter((hint) => hint.length > 0));
}

function validateLeaseFenceInput(input) {
  for (const field of ["leaseId", "attemptId", "idempotencyKey", "authorityDecisionId"]) {
    if (!hasMetadataSafeString(input[field], MAX_RETAINED_METADATA_LENGTH)) {
      return failResult("invalid_input", `Lease input requires ${field}.`, input.evidenceRefs);
    }
  }
  return okResult(true, input.evidenceRefs);
}

function hasEvidence(evidenceRefs) {
  return Array.isArray(evidenceRefs) && evidenceRefs.length > 0 && evidenceRefs.every((ref) => hasMetadataSafeString(ref, MAX_RETAINED_METADATA_LENGTH));
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function unique(values) {
  return [...new Set(values)];
}

function okResult(value, evidenceRefs) {
  return { ok: true, value, evidenceRefs: normalizeEvidenceRefs(evidenceRefs) };
}

function failResult(code, message, evidenceRefs = []) {
  return { ok: false, code, message, evidenceRefs: normalizeEvidenceRefs(evidenceRefs) };
}

function normalizeEvidenceRefs(evidenceRefs) {
  return hasEvidence(evidenceRefs) ? unique(evidenceRefs.map((ref) => ref.trim())) : [];
}

function isMetadataSafeString(value, maxLength) {
  return hasMetadataSafeString(value, maxLength);
}

function normalizeCloseoutMetadata(value) {
  return value.trim();
}

function hasMetadataSafeString(value, maxLength) {
  return hasText(value) && value.trim().length <= maxLength && !/[\u0000-\u001F\u007F]/.test(value) && !RAW_METADATA_PATTERN.test(value);
}

function isOptionalMetadataSafeString(value, maxLength) {
  return value === undefined || value === null || hasMetadataSafeString(value, maxLength);
}

function normalizeMetadataString(value) {
  return value.trim();
}

function normalizeOptionalMetadataString(value) {
  return value === null ? null : normalizeMetadataString(value);
}

function normalizeEventScalar(value) {
  return normalizeMetadataString(value);
}

function toPublicResult(result) {
  return clonePublicValue(result);
}

function clonePublicValue(value) {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(clonePublicValue);
  }
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, clonePublicValue(nested)]));
}

function normalizeEventPayloadSummary(value) {
  const text = hasText(value) ? value.trim() : "metadata event";
  if (RAW_METADATA_PATTERN.test(text)) {
    return "metadata summary redacted";
  }
  if (text.length <= MAX_EVENT_PAYLOAD_SUMMARY_LENGTH) {
    return text;
  }
  const suffix = "...<truncated>";
  return `${text.slice(0, MAX_EVENT_PAYLOAD_SUMMARY_LENGTH - suffix.length)}${suffix}`;
}

function sanitizeWorkItem(workItem) {
  return {
    workItemId: normalizeMetadataString(workItem.workItemId),
    runId: normalizeMetadataString(workItem.runId),
    candidateWorkPacketId: normalizeMetadataString(workItem.candidateWorkPacketId),
    sourceRefs: normalizeSourceRefs(workItem.sourceRefs),
    dedupeKey: normalizeMetadataString(workItem.dedupeKey),
    title: normalizeMetadataString(workItem.title),
    sliceType: normalizeMetadataString(workItem.sliceType),
    status: workItem.status,
    priority: normalizeMetadataString(workItem.priority),
    authorityClass: workItem.authorityClass,
    authorityDecisionId: normalizeMetadataString(workItem.authorityDecisionId),
    verificationTargets: normalizeVerificationTargets(workItem.verificationTargets),
    dependencies: Array.isArray(workItem.dependencies) ? workItem.dependencies.map(normalizeMetadataString) : [],
    attemptCount: workItem.attemptCount,
    leaseId: workItem.leaseId,
    evidenceRefs: normalizeEvidenceRefs(workItem.evidenceRefs),
    createdAt: normalizeMetadataString(workItem.createdAt),
    updatedAt: normalizeMetadataString(workItem.updatedAt)
  };
}

function sanitizeLease(lease) {
  return {
    leaseId: normalizeMetadataString(lease.leaseId),
    workItemId: normalizeMetadataString(lease.workItemId),
    workerId: normalizeMetadataString(lease.workerId),
    attemptId: normalizeMetadataString(lease.attemptId),
    state: lease.state,
    claimedAt: normalizeMetadataString(lease.claimedAt),
    heartbeatAt: lease.heartbeatAt === undefined || lease.heartbeatAt === null ? null : normalizeMetadataString(lease.heartbeatAt),
    expiresAt: normalizeMetadataString(lease.expiresAt),
    attempt: lease.attempt,
    idempotencyKey: normalizeMetadataString(lease.idempotencyKey),
    authorityDecisionId: normalizeMetadataString(lease.authorityDecisionId),
    evidenceRefs: normalizeEvidenceRefs(lease.evidenceRefs),
    createdAt: normalizeMetadataString(lease.createdAt),
    updatedAt: normalizeMetadataString(lease.updatedAt)
  };
}

function candidateRetentionKey(candidate) {
  return candidateDedupeKey(candidate) || candidate.dedupeKey || candidate.candidateWorkPacketId;
}

function addUniqueCandidate(candidates, candidate) {
  if (!candidates.some((entry) => candidateRetentionKey(entry) === candidateRetentionKey(candidate))) {
    candidates.push(candidate);
  }
}

function upsertCandidate(candidates, candidate) {
  const key = candidateRetentionKey(candidate);
  const index = candidates.findIndex((entry) => candidateRetentionKey(entry) === key);
  if (index === -1) {
    candidates.push(candidate);
  } else {
    candidates[index] = candidate;
  }
}

function removeCandidateByRetentionKey(candidates, candidate) {
  const key = candidateRetentionKey(candidate);
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    if (candidateRetentionKey(candidates[index]) === key) {
      candidates.splice(index, 1);
    }
  }
}
