import assert from "node:assert/strict";

export async function assertDispatcherPortConformance(createAdapter, { candidate }) {
  const adapter = createAdapter();

  const refill = await adapter.refill({
    candidates: [candidate],
    evidenceRefs: ["evidence-refill"],
    policyReason: "fixture-backed safe source"
  });
  assert.equal(refill.ok, true);
  assert.equal(refill.value.queuedWorkItems.length, 1);
  assert.equal(refill.value.duplicateCandidates.length, 0);
  assert.equal(refill.value.events.at(-1).eventName, "dispatcher.refill.completed");

  const duplicateRefill = await adapter.refill({
    candidates: [candidate],
    evidenceRefs: ["evidence-refill-duplicate"],
    policyReason: "fixture-backed safe source duplicate"
  });
  assert.equal(duplicateRefill.ok, true);
  assert.equal(duplicateRefill.value.queuedWorkItems.length, 0);
  assert.equal(duplicateRefill.value.duplicateCandidates.length, 1);

  const claim = await adapter.claim({
    workerId: "worker-1",
    evidenceRefs: ["evidence-claim"]
  });
  assert.equal(claim.ok, true);
  assert.equal(claim.value.workItem.status, "leased");
  assert.equal(claim.value.lease.workerId, "worker-1");
  assert.equal(claim.value.executionAttempt.state, "running");

  const repeatedClaim = await adapter.claim({
    workerId: "worker-2",
    evidenceRefs: ["evidence-repeat-claim"]
  });
  assert.equal(repeatedClaim.ok, false);
  assert.equal(repeatedClaim.code, "no_work");

  const heartbeat = await adapter.heartbeat({
    leaseId: claim.value.lease.leaseId,
    workerId: "worker-1",
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-heartbeat"],
    ttlMs: 300_000
  });
  assert.equal(heartbeat.ok, true);
  assert.equal(heartbeat.value.lease.state, "running");
  assert.equal(heartbeat.value.workItem.status, "running");

  const staleHeartbeat = await adapter.heartbeat({
    leaseId: claim.value.lease.leaseId,
    workerId: "worker-2",
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-stale-heartbeat"],
    ttlMs: 300_000
  });
  assert.equal(staleHeartbeat.ok, false);
  assert.equal(staleHeartbeat.code, "stale_lease");

  const invalidTtl = await adapter.heartbeat({
    leaseId: claim.value.lease.leaseId,
    workerId: "worker-1",
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-invalid-ttl"],
    ttlMs: -1
  });
  assert.equal(invalidTtl.ok, false);
  assert.equal(invalidTtl.code, "invalid_input");

  const complete = await adapter.complete({
    leaseId: claim.value.lease.leaseId,
    workerId: "worker-1",
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-complete"],
    resultSummary: "fake worker completed proof lease"
  });
  assert.equal(complete.ok, true);
  assert.equal(complete.value.workItem.status, "completed");
  assert.equal(complete.value.lease.state, "completed");
  assert.equal(complete.value.executionAttempt.state, "completed");
  assert.equal(complete.value.events.at(-1).eventName, "dispatcher.attempt.completed");

  const repeatedComplete = await adapter.complete({
    leaseId: claim.value.lease.leaseId,
    workerId: "worker-1",
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-repeat-complete"],
    resultSummary: "repeat completion should not duplicate terminal work"
  });
  assert.equal(repeatedComplete.ok, false);
  assert.equal(repeatedComplete.code, "terminal_state");

  const terminalHeartbeat = await adapter.heartbeat({
    leaseId: claim.value.lease.leaseId,
    workerId: "worker-1",
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-terminal-heartbeat"],
    ttlMs: 300_000
  });
  assert.equal(terminalHeartbeat.ok, false);
  assert.equal(terminalHeartbeat.code, "terminal_state");

  const summary = await adapter.summarize();
  assert.equal(summary.currentPhase, "completed");
  assert.equal(summary.stateSource, "fixture");
  assert.equal(summary.safeWorkAvailableCount, 0);
  assert.deepEqual(summary.activeWorkItemIds, []);
  assert.equal(summary.warnings.includes("backend_proof_simulated_no_live_worker_execution"), true);
}
