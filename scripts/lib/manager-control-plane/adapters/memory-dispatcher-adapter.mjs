import { buildManagerExecutionLaneSummary, SIMULATED_WARNING } from "../summary-projection.mjs";

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

  const state = {
    candidatesByDedupe: new Map(),
    workItems: new Map(),
    leases: new Map(),
    attempts: new Map(),
    evidenceRecords: new Map(),
    refillJobs: [],
    blockedCandidates: [],
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
      return Promise.resolve(refill(input));
    },
    claim(input) {
      return Promise.resolve(claim(input));
    },
    heartbeat(input) {
      return Promise.resolve(heartbeat(input));
    },
    complete(input) {
      return Promise.resolve(closeout(input, "completed"));
    },
    fail(input) {
      return Promise.resolve(closeout(input, "failed"));
    },
    recoverExpiredLeases(input) {
      return Promise.resolve(recoverExpiredLeases(input));
    },
    summarize() {
      return Promise.resolve(summarize());
    },
    snapshot() {
      return {
        workItems: [...state.workItems.values()],
        leases: [...state.leases.values()],
        attempts: [...state.attempts.values()],
        evidenceRecords: [...state.evidenceRecords.values()],
        events: [...state.events],
        refillJobs: [...state.refillJobs]
      };
    }
  };

  function refill({ candidates, evidenceRefs, policyReason }) {
    if (!hasEvidence(evidenceRefs) || !policyReason?.trim()) {
      return failResult("missing_evidence", "Refill requires policy reason and evidence refs.", evidenceRefs);
    }

    const eventStartIndex = state.events.length;
    const started = appendEvent("dispatcher.refill.started", {
      actorType: "dispatcher",
      actorId: "memory-dispatcher",
      evidenceRefs,
      payloadSummary: `refill started for ${candidates.length} candidates`
    });
    const refillJobId = nextId("refill", "refill");
    const queuedWorkItems = [];
    const duplicateCandidates = [];
    const blockedCandidates = [];

    for (const candidate of candidates) {
      const dedupe = candidateDedupeKey(candidate);
      if (state.candidatesByDedupe.has(dedupe)) {
        duplicateCandidates.push(candidate);
        state.duplicateCandidates.push(candidate);
        continue;
      }
      if (candidate.authorityClass !== "allowed_unattended") {
        blockedCandidates.push(candidate);
        state.blockedCandidates.push(candidate);
        appendEvent("dispatcher.authority.blocked", {
          actorType: "dispatcher",
          actorId: "memory-dispatcher",
          evidenceRefs,
          correlationId: candidate.candidateWorkPacketId,
          causationId: started.eventId,
          payloadSummary: `authority blocked ${candidate.candidateWorkPacketId}: ${candidate.authorityClass}`
        });
        continue;
      }

      const eligible = lifecycle.evaluateCandidateEligibility(candidate, {
        status: "eligible",
        policyReason,
        evidenceRefs,
        clock
      });
      if (!eligible.ok) {
        blockedCandidates.push(candidate);
        state.blockedCandidates.push(candidate);
        continue;
      }

      state.candidatesByDedupe.set(dedupe, eligible.value.candidate.candidateWorkPacketId);
      const workItem = createWorkItem(eligible.value.candidate, evidenceRefs);
      const queued = lifecycle.transitionWorkItem(workItem, {
        toStatus: "queued",
        evidenceRefs,
        clock
      });
      if (!queued.ok) {
        blockedCandidates.push(candidate);
        state.blockedCandidates.push(candidate);
        continue;
      }
      state.workItems.set(queued.value.workItemId, queued.value);
      queuedWorkItems.push(queued.value);
      appendEvent("dispatcher.work.queued", {
        actorType: "dispatcher",
        actorId: "memory-dispatcher",
        evidenceRefs,
        correlationId: queued.value.workItemId,
        causationId: started.eventId,
        payloadSummary: `queued ${queued.value.workItemId}`
      });
    }

    if (queuedWorkItems.length === 0) {
      appendEvent("dispatcher.work_supply.empty", {
        actorType: "dispatcher",
        actorId: "memory-dispatcher",
        evidenceRefs,
        causationId: started.eventId,
        payloadSummary: `refill source produced no queued work; duplicates=${duplicateCandidates.length} blocked=${blockedCandidates.length}`
      });
    }

    const refillJob = {
      refillJobId,
      sourceRefs: unique(candidates.flatMap((candidate) => candidate.sourceRefs.map((source) => source.sourceRefId))),
      triggerReason: "manual_bootstrap",
      lowWatermark: 1,
      highWatermark: Math.max(1, candidates.length),
      lockId: `${refillJobId}-lock`,
      candidateCount: candidates.length,
      queuedCount: queuedWorkItems.length,
      needsReviewCount: 0,
      blockedCount: blockedCandidates.length,
      authorityClass: blockedCandidates.length > 0 && queuedWorkItems.length === 0 ? "block_and_record" : "allowed_unattended",
      state: "completed",
      startedAt: started.occurredAt,
      finishedAt: clock.nowIso(),
      result: queuedWorkItems.length > 0 ? "queued_work" : "no_safe_work",
      evidenceRefs,
      createdAt: started.occurredAt,
      updatedAt: clock.nowIso()
    };
    state.refillJobs.push(refillJob);
    appendEvent("dispatcher.refill.completed", {
      actorType: "dispatcher",
      actorId: "memory-dispatcher",
      evidenceRefs,
      correlationId: refillJobId,
      causationId: started.eventId,
      payloadSummary: `refill completed queued=${queuedWorkItems.length} duplicates=${duplicateCandidates.length}`
    });

    return okResult({ refillJob, queuedWorkItems, duplicateCandidates, blockedCandidates, events: state.events.slice(eventStartIndex) }, evidenceRefs);
  }

  function claim({ workerId, evidenceRefs }) {
    if (!workerId || !hasEvidence(evidenceRefs)) {
      return failResult("missing_evidence", "Claim requires worker id and evidence refs.", evidenceRefs);
    }

    const queued = [...state.workItems.values()].find((item) => item.status === "queued");
    if (!queued) {
      return failResult("no_work", "No queued work is available for lease.", evidenceRefs);
    }

    const leaseId = nextId("lease", "lease");
    const attemptId = nextId("attempt", "attempt");
    const idempotencyKey = `${leaseId}-idempotency`;
    const leased = lifecycle.transitionWorkItem(queued, {
      toStatus: "leased",
      leaseId,
      evidenceRefs,
      clock
    });
    if (!leased.ok) {
      return leased;
    }

    const lease = {
      leaseId,
      workItemId: queued.workItemId,
      workerId,
      attemptId,
      state: "leased",
      claimedAt: clock.nowIso(),
      heartbeatAt: null,
      expiresAt: new Date(clock.nowEpochMs() + leaseTtlMs).toISOString(),
      attempt: leased.value.attemptCount,
      idempotencyKey,
      authorityDecisionId: queued.authorityDecisionId,
      evidenceRefs,
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
      evidenceRefs,
      createdAt: clock.nowIso(),
      updatedAt: clock.nowIso()
    };
    state.workItems.set(leased.value.workItemId, leased.value);
    state.leases.set(lease.leaseId, lease);
    state.attempts.set(executionAttempt.attemptId, executionAttempt);

    const event = appendEvent("dispatcher.lease.claimed", {
      actorType: "worker",
      actorId: workerId,
      evidenceRefs,
      correlationId: lease.leaseId,
      payloadSummary: `lease ${lease.leaseId} claimed for ${queued.workItemId}`
    });
    return okResult({ workItem: leased.value, lease, executionAttempt, events: [event] }, evidenceRefs);
  }

  function heartbeat(input) {
    const lease = state.leases.get(input.leaseId);
    if (!lease) {
      return failResult("stale_lease", "Unknown lease.", input.evidenceRefs);
    }
    const workItem = state.workItems.get(lease.workItemId);
    if (!workItem) {
      return failResult("stale_lease", "Lease does not reference a known work item.", input.evidenceRefs);
    }

    const heartbeatResult = lifecycle.heartbeatLease(lease, { ...input, clock });
    if (!heartbeatResult.ok) {
      return heartbeatResult;
    }
    const running = lifecycle.transitionWorkItem(workItem, {
      toStatus: "running",
      leaseId: input.leaseId,
      evidenceRefs: input.evidenceRefs,
      clock
    });
    if (!running.ok) {
      return running;
    }

    state.leases.set(input.leaseId, heartbeatResult.value);
    state.workItems.set(workItem.workItemId, running.value);
    const event = appendEvent("dispatcher.lease.heartbeat", {
      actorType: "worker",
      actorId: input.workerId,
      evidenceRefs: input.evidenceRefs,
      correlationId: input.leaseId,
      payloadSummary: `lease ${input.leaseId} heartbeat`
    });
    return okResult({ workItem: running.value, lease: heartbeatResult.value, events: [event] }, input.evidenceRefs);
  }

  function closeout(input, outcome) {
    const lease = state.leases.get(input.leaseId);
    if (!lease) {
      return failResult("stale_lease", "Unknown lease.", input.evidenceRefs);
    }
    const workItem = state.workItems.get(lease.workItemId);
    const attempt = state.attempts.get(input.attemptId);
    if (!workItem || !attempt) {
      return failResult("stale_lease", "Lease closeout references missing work or attempt.", input.evidenceRefs);
    }
    if (
      lease.attemptId !== input.attemptId ||
      attempt.leaseId !== lease.leaseId ||
      attempt.workItemId !== lease.workItemId ||
      lease.workerId !== input.workerId ||
      lease.idempotencyKey !== input.idempotencyKey ||
      lease.authorityDecisionId !== input.authorityDecisionId ||
      attempt.authorityDecisionId !== input.authorityDecisionId
    ) {
      return failResult("stale_lease", "Lease closeout does not match the active lease and attempt identity.", input.evidenceRefs);
    }

    const closeoutResult = outcome === "completed"
      ? lifecycle.completeLease(workItem, lease, { ...input, clock })
      : lifecycle.failLease(workItem, lease, { ...input, clock });
    if (!closeoutResult.ok) {
      return closeoutResult;
    }

    const finishedAttempt = {
      ...attempt,
      state: outcome,
      finishedAt: clock.nowIso(),
      resultSummary: outcome === "completed" ? input.resultSummary ?? "completed" : null,
      failureReason: outcome === "failed" ? input.failureReason ?? "failed" : null,
      evidenceRefs: unique([...attempt.evidenceRefs, ...input.evidenceRefs]),
      updatedAt: clock.nowIso()
    };
    const evidenceRecords = input.evidenceRefs.map((evidenceRefId) =>
      ensureEvidenceRecord(evidenceRefId, outcome === "completed" ? "attempt completed" : "attempt failed", "attempt")
    );
    state.workItems.set(workItem.workItemId, closeoutResult.value.workItem);
    state.leases.set(lease.leaseId, closeoutResult.value.lease);
    state.attempts.set(attempt.attemptId, finishedAttempt);
    const event = appendEvent(outcome === "completed" ? "dispatcher.attempt.completed" : "dispatcher.attempt.failed", {
      actorType: "worker",
      actorId: input.workerId,
      evidenceRefs: input.evidenceRefs,
      correlationId: input.attemptId,
      payloadSummary: `${outcome} ${input.attemptId}`
    });
    return okResult(
      {
        workItem: closeoutResult.value.workItem,
        lease: closeoutResult.value.lease,
        executionAttempt: finishedAttempt,
        evidenceRecords,
        events: [event]
      },
      input.evidenceRefs
    );
  }

  function recoverExpiredLeases({ evidenceRefs } = {}) {
    if (!hasEvidence(evidenceRefs)) {
      return failResult("missing_evidence", "Recovery requires evidence refs.", evidenceRefs ?? []);
    }
    const recoveredWorkItems = [];
    const expiredLeases = [];
    const events = [];
    for (const lease of state.leases.values()) {
      const workItem = state.workItems.get(lease.workItemId);
      if (!workItem || lease.state !== "leased" && lease.state !== "running") {
        continue;
      }
      const expiry = lifecycle.expireLeaseIfStale(workItem, lease, {
        evidenceRefs,
        clock
      });
      if (!expiry.ok) {
        continue;
      }
      state.leases.set(lease.leaseId, expiry.value.lease);
      const attempt = state.attempts.get(lease.attemptId);
      if (attempt?.state === "running") {
        state.attempts.set(attempt.attemptId, {
          ...attempt,
          state: "expired",
          finishedAt: clock.nowIso(),
          failureReason: "lease_expired",
          evidenceRefs: unique([...attempt.evidenceRefs, ...evidenceRefs]),
          updatedAt: clock.nowIso()
        });
      }
      expiredLeases.push(expiry.value.lease);
      events.push(
        appendEvent("dispatcher.lease.expired", {
          actorType: "dispatcher",
          actorId: "memory-dispatcher",
          evidenceRefs,
          correlationId: lease.leaseId,
          payloadSummary: `lease ${lease.leaseId} expired`
        })
      );
      const recovery = lifecycle.recoverWorkItem(expiry.value.workItem, {
        maxAttempts,
        evidenceRefs,
        clock
      });
      if (recovery.ok) {
        state.workItems.set(recovery.value.workItem.workItemId, recovery.value.workItem);
        recoveredWorkItems.push(recovery.value.workItem);
        events.push(
          appendEvent("dispatcher.recovery.attempted", {
            actorType: "dispatcher",
            actorId: "memory-dispatcher",
            evidenceRefs,
            correlationId: recovery.value.workItem.workItemId,
            payloadSummary: `recovery decision ${recovery.value.decision}`
          })
        );
      }
    }
    for (const workItem of state.workItems.values()) {
      if (workItem.status !== "failed") {
        continue;
      }
      const recovery = lifecycle.recoverWorkItem(workItem, {
        maxAttempts,
        evidenceRefs,
        clock
      });
      if (!recovery.ok) {
        continue;
      }
      state.workItems.set(recovery.value.workItem.workItemId, recovery.value.workItem);
      recoveredWorkItems.push(recovery.value.workItem);
      events.push(
        appendEvent("dispatcher.recovery.attempted", {
          actorType: "dispatcher",
          actorId: "memory-dispatcher",
          evidenceRefs,
          correlationId: recovery.value.workItem.workItemId,
          payloadSummary: `recovery decision ${recovery.value.decision}`
        })
      );
    }
    return okResult({ recoveredWorkItems, expiredLeases, events }, evidenceRefs);
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
      runId,
      clock,
      workItems,
      leases: [...state.leases.values()],
      attempts: [...state.attempts.values()],
      events: state.events,
      refillJobs: state.refillJobs,
      blockedCandidates: state.blockedCandidates,
      duplicateCandidates: state.duplicateCandidates,
      summaryEvent,
      stateSource: "fixture",
      proofMode: "backend_proof",
      staleAfterMs: summaryStaleAfterMs
    });
    summaryEvent.payloadSummary = `summary phase ${summary.currentPhase}`;
    return summary;
  }

  function createWorkItem(candidate, evidenceRefs) {
    return {
      workItemId: nextId("workItem", "work-item"),
      runId: candidate.runId,
      candidateWorkPacketId: candidate.candidateWorkPacketId,
      sourceRefs: candidate.sourceRefs,
      dedupeKey: candidateDedupeKey(candidate),
      title: candidate.proposedSlice,
      sliceType: candidate.authorityStage,
      status: "eligible",
      priority: "normal",
      authorityClass: candidate.authorityClass,
      authorityDecisionId: `authority-${state.counters.workItem}`,
      verificationTargets: candidate.verificationTargets,
      dependencies: [],
      attemptCount: 0,
      leaseId: null,
      evidenceRefs: unique([...candidate.evidenceRefs, ...evidenceRefs]),
      createdAt: clock.nowIso(),
      updatedAt: clock.nowIso()
    };
  }

  function appendEvent(eventName, { actorType, actorId, evidenceRefs, correlationId = "run-1", causationId = null, payloadSummary }) {
    ensureEvidenceRecords(evidenceRefs, `${eventName} evidence`, "event");
    const event = {
      eventId: nextId("event", "event"),
      schemaVersion: "manager_control_plane_event.v1",
      eventName,
      runId,
      actorType,
      actorId,
      occurredAt: clock.nowIso(),
      correlationId,
      causationId,
      idempotencyKey: `${eventName}-${state.counters.event}`,
      redactionBoundary: "metadata_only",
      projectionBehavior: eventName.includes("summary") ? "updates_summary" : "records_evidence",
      evidenceRefs,
      payloadSummary
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
  const sourceKey = candidate.sourceRefs.map((source) => `${source.sourceRefId}:${source.sourceSpan ?? ""}`).join("|");
  const acceptanceKey = [...candidate.acceptanceCriteria].map((value) => value.trim()).sort().join("|");
  const touchedSurfaceHint = [...candidate.dependencyHints].map((value) => value.trim()).sort().join("|") || candidate.dedupeKey;
  return `${sourceKey}::${acceptanceKey}::${touchedSurfaceHint}`;
}

function hasEvidence(evidenceRefs) {
  return Array.isArray(evidenceRefs) && evidenceRefs.length > 0;
}

function unique(values) {
  return [...new Set(values)];
}

function okResult(value, evidenceRefs) {
  return { ok: true, value, evidenceRefs };
}

function failResult(code, message, evidenceRefs = []) {
  return { ok: false, code, message, evidenceRefs };
}
