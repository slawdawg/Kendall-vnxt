import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const lifecycleRoot = new URL("../packages/workflow-core/src/manager-control-plane/", import.meta.url);
const workflowCoreIndexPath = new URL("../packages/workflow-core/src/index.ts", import.meta.url);
const tscPath = "apps/dashboard/node_modules/.bin/tsc";
const TEST_OPERATIONAL_NOW = "2026-07-05T00:00:00.000Z";

test("manager lifecycle domain is exported from workflow-core", async () => {
  assert.equal(existsSync(new URL("index.ts", lifecycleRoot)), true, "missing manager lifecycle namespace");

  const workflowCoreIndex = await readFile(workflowCoreIndexPath, "utf8");
  assert.match(workflowCoreIndex, /export \* from "\.\/manager-control-plane";/);

  for (const moduleName of [
    "clock.ts",
    "result.ts",
    "candidate-lifecycle.ts",
    "work-item-lifecycle.ts",
    "lease-lifecycle.ts",
    "recovery-policy.ts",
    "operational-action-policy.ts"
  ]) {
    assert.equal(existsSync(new URL(moduleName, lifecycleRoot)), true, `missing ${moduleName}`);
  }
});

test("candidate eligibility transitions require bounded decision evidence", async () => {
  const {
    createManualClock,
    evaluateCandidateEligibility,
    makeCandidateWorkPacketFixture
  } = await loadLifecycleDomain();

  const clock = createManualClock("2026-06-30T00:00:00.000Z");
  const candidate = makeCandidateWorkPacketFixture({ status: "blocked" });
  const eligible = evaluateCandidateEligibility(candidate, {
    status: "eligible",
    policyReason: "source owned backend proof with focused verification",
    evidenceRefs: ["evidence-1"],
    clock
  });

  assert.equal(eligible.ok, true);
  assert.equal(eligible.value.candidate.status, "eligible");
  assert.equal(eligible.value.candidate.updatedAt, "2026-06-30T00:00:00.000Z");
  assert.equal(eligible.value.decisionRecord.policyReason, "source owned backend proof with focused verification");
  assert.equal(eligible.value.decisionRecord.authorityClass, candidate.authorityClass);
  assert.equal(eligible.value.decisionRecord.sourceRefs, candidate.sourceRefs);
  assert.equal(eligible.value.decisionRecord.verificationTargets, candidate.verificationTargets);
  assert.deepEqual(eligible.value.decisionRecord.evidenceRefs, ["evidence-1"]);
  assert.deepEqual(eligible.evidenceRefs, ["evidence-1"]);

  const invalidStatus = evaluateCandidateEligibility(candidate, {
    status: "queued",
    policyReason: "bad status",
    evidenceRefs: ["evidence-1"],
    clock
  });
  assert.equal(invalidStatus.ok, false);
  assert.equal(invalidStatus.code, "invalid_candidate_status");

  const missingEvidence = evaluateCandidateEligibility(candidate, {
    status: "eligible",
    policyReason: "",
    evidenceRefs: [],
    clock
  });
  assert.equal(missingEvidence.ok, false);
  assert.equal(missingEvidence.code, "missing_evidence");
});

test("work item lifecycle accepts only approved transitions and preserves identity", async () => {
  const {
    createManualClock,
    transitionWorkItem,
    makeWorkItemFixture
  } = await loadLifecycleDomain();

  const clock = createManualClock("2026-06-30T00:01:00.000Z");
  const eligible = makeWorkItemFixture({ status: "eligible", attemptCount: 0, leaseId: null });
  const queued = transitionWorkItem(eligible, {
    toStatus: "queued",
    evidenceRefs: ["evidence-queued"],
    clock
  });

  assert.equal(queued.ok, true);
  assert.equal(queued.value.status, "queued");
  assert.equal(queued.value.workItemId, eligible.workItemId);
  assert.equal(queued.value.dedupeKey, eligible.dedupeKey);
  assert.equal(queued.value.updatedAt, "2026-06-30T00:01:00.000Z");

  const leased = transitionWorkItem(queued.value, {
    toStatus: "leased",
    leaseId: "lease-1",
    evidenceRefs: ["evidence-lease"],
    clock
  });
  assert.equal(leased.ok, true);
  assert.equal(leased.value.status, "leased");
  assert.equal(leased.value.leaseId, "lease-1");
  assert.equal(leased.value.attemptCount, 1);

  const running = transitionWorkItem(leased.value, {
    toStatus: "running",
    leaseId: "lease-1",
    evidenceRefs: ["evidence-running"],
    clock
  });
  assert.equal(running.ok, true);
  assert.equal(running.value.status, "running");

  const completed = transitionWorkItem(running.value, {
    toStatus: "completed",
    leaseId: "lease-1",
    evidenceRefs: ["evidence-completed"],
    clock
  });
  assert.equal(completed.ok, true);
  assert.equal(completed.value.status, "completed");

  const reissued = transitionWorkItem(completed.value, {
    toStatus: "leased",
    leaseId: "lease-2",
    evidenceRefs: ["evidence-reissue"],
    clock
  });
  assert.equal(reissued.ok, false);
  assert.equal(reissued.code, "terminal_state");

  const invalid = transitionWorkItem(eligible, {
    toStatus: "running",
    leaseId: "lease-1",
    evidenceRefs: ["evidence-invalid"],
    clock
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, "invalid_transition");

  const duplicateLease = transitionWorkItem(makeWorkItemFixture({ status: "queued", leaseId: "lease-existing" }), {
    toStatus: "leased",
    leaseId: "lease-2",
    evidenceRefs: ["evidence-duplicate"],
    clock
  });
  assert.equal(duplicateLease.ok, false);
  assert.equal(duplicateLease.code, "stale_lease");

  const runningWithoutLease = transitionWorkItem(makeWorkItemFixture({ status: "running", leaseId: "lease-1" }), {
    toStatus: "failed",
    evidenceRefs: ["evidence-missing-lease"],
    clock
  });
  assert.equal(runningWithoutLease.ok, false);
  assert.equal(runningWithoutLease.code, "stale_lease");
});

test("work item lifecycle covers every approved transition edge", async () => {
  const {
    createManualClock,
    transitionWorkItem,
    makeWorkItemFixture
  } = await loadLifecycleDomain();

  const clock = createManualClock("2026-06-30T00:01:00.000Z");
  const cases = [
    { from: "eligible", to: "queued" },
    { from: "queued", to: "leased", leaseId: "lease-1", expectedLeaseId: "lease-1" },
    { from: "leased", to: "running", currentLeaseId: "lease-1", leaseId: "lease-1", expectedLeaseId: "lease-1" },
    { from: "running", to: "completed", currentLeaseId: "lease-1", leaseId: "lease-1", expectedLeaseId: "lease-1" },
    { from: "running", to: "failed", currentLeaseId: "lease-1", leaseId: "lease-1", expectedLeaseId: "lease-1" },
    { from: "running", to: "blocked", currentLeaseId: "lease-1", leaseId: "lease-1", expectedLeaseId: "lease-1" },
    { from: "running", to: "expired", currentLeaseId: "lease-1", leaseId: "lease-1", expectedLeaseId: "lease-1" },
    { from: "failed", to: "queued", currentLeaseId: "lease-1", expectedLeaseId: null },
    { from: "failed", to: "quarantined", currentLeaseId: "lease-1", expectedLeaseId: null },
    { from: "failed", to: "blocked", currentLeaseId: "lease-1", expectedLeaseId: "lease-1" },
    { from: "expired", to: "queued", currentLeaseId: "lease-1", expectedLeaseId: null },
    { from: "expired", to: "quarantined", currentLeaseId: "lease-1", expectedLeaseId: null },
    { from: "blocked", to: "closed", currentLeaseId: "lease-1", expectedLeaseId: null },
    { from: "completed", to: "closed", currentLeaseId: "lease-1", expectedLeaseId: null },
    { from: "quarantined", to: "closed", currentLeaseId: "lease-1", expectedLeaseId: null },
    { from: "refilling", to: "queued", expectedLeaseId: null },
    { from: "refilling", to: "blocked", expectedLeaseId: null }
  ];

  for (const entry of cases) {
    const workItem = makeWorkItemFixture({
      status: entry.from,
      leaseId: entry.currentLeaseId ?? null,
      attemptCount: entry.currentLeaseId ? 1 : 0
    });
    const result = transitionWorkItem(workItem, {
      toStatus: entry.to,
      leaseId: entry.leaseId,
      evidenceRefs: [`evidence-${entry.from}-${entry.to}`],
      clock
    });
    assert.equal(result.ok, true, `${entry.from} -> ${entry.to}`);
    assert.equal(result.value.status, entry.to, `${entry.from} -> ${entry.to}`);
    assert.equal(result.value.leaseId ?? null, entry.expectedLeaseId ?? null, `${entry.from} -> ${entry.to}`);
  }
});

test("lease lifecycle rejects stale closeout and uses fake clock for expiry", async () => {
  const {
    createManualClock,
    completeLease,
    expireLeaseIfStale,
    heartbeatLease,
    makeLeaseFixture,
    makeWorkItemFixture
  } = await loadLifecycleDomain();

  const clock = createManualClock("2026-06-30T00:02:00.000Z");
  const item = makeWorkItemFixture({ status: "running", leaseId: "lease-1", attemptCount: 1 });
  const lease = makeLeaseFixture({
    leaseId: "lease-1",
    workItemId: item.workItemId,
    attemptId: "attempt-1",
    state: "running",
    heartbeatAt: "2026-06-30T00:02:00.000Z",
    expiresAt: "2026-06-30T00:07:00.000Z"
  });

  const staleCompletion = completeLease(item, lease, {
    leaseId: "lease-2",
    workerId: "worker-1",
    attemptId: "attempt-1",
    idempotencyKey: "idempotency-1",
    authorityDecisionId: "authority-1",
    evidenceRefs: ["evidence-stale"],
    clock
  });
  assert.equal(staleCompletion.ok, false);
  assert.equal(staleCompletion.code, "stale_lease");

  clock.advanceMs(60_000);
  const heartbeat = heartbeatLease(lease, {
    leaseId: "lease-1",
    workerId: "worker-1",
    attemptId: "attempt-1",
    idempotencyKey: "idempotency-1",
    authorityDecisionId: "authority-1",
    evidenceRefs: ["evidence-heartbeat"],
    clock,
    ttlMs: 300_000
  });
  assert.equal(heartbeat.ok, true);
  assert.equal(heartbeat.value.heartbeatAt, "2026-06-30T00:03:00.000Z");
  assert.equal(heartbeat.value.expiresAt, "2026-06-30T00:08:00.000Z");

  clock.advanceMs(301_000);
  const expired = expireLeaseIfStale(item, heartbeat.value, {
    evidenceRefs: ["evidence-expired"],
    clock
  });
  assert.equal(expired.ok, true);
  assert.equal(expired.value.lease.state, "expired");
  assert.equal(expired.value.workItem.status, "expired");

  const expiredCompletion = completeLease(item, heartbeat.value, {
    leaseId: "lease-1",
    workerId: "worker-1",
    attemptId: "attempt-1",
    idempotencyKey: "idempotency-1",
    authorityDecisionId: "authority-1",
    evidenceRefs: ["evidence-too-late"],
    clock
  });
  assert.equal(expiredCompletion.ok, false);
  assert.equal(expiredCompletion.code, "lease_expired");
});

test("lease lifecycle rejects terminal heartbeat, bad fencing, invalid ttl, and invalid expiry", async () => {
  const {
    createManualClock,
    heartbeatLease,
    expireLeaseIfStale,
    makeLeaseFixture,
    makeWorkItemFixture
  } = await loadLifecycleDomain();

  const clock = createManualClock("2026-06-30T00:02:00.000Z");
  const runningLease = makeLeaseFixture({
    state: "running",
    heartbeatAt: "2026-06-30T00:02:00.000Z",
    expiresAt: "2026-06-30T00:07:00.000Z"
  });
  const heartbeatInput = {
    leaseId: "lease-1",
    workerId: "worker-1",
    attemptId: "attempt-1",
    idempotencyKey: "idempotency-1",
    authorityDecisionId: "authority-1",
    evidenceRefs: ["evidence-heartbeat"],
    clock,
    ttlMs: 300_000
  };

  const completedHeartbeat = heartbeatLease(makeLeaseFixture({ state: "completed" }), heartbeatInput);
  assert.equal(completedHeartbeat.ok, false);
  assert.equal(completedHeartbeat.code, "terminal_state");

  const staleWorkerHeartbeat = heartbeatLease(runningLease, { ...heartbeatInput, workerId: "worker-2" });
  assert.equal(staleWorkerHeartbeat.ok, false);
  assert.equal(staleWorkerHeartbeat.code, "stale_lease");

  const invalidTtl = heartbeatLease(runningLease, { ...heartbeatInput, ttlMs: -1 });
  assert.equal(invalidTtl.ok, false);
  assert.equal(invalidTtl.code, "invalid_input");

  const invalidExpiryHeartbeat = heartbeatLease(makeLeaseFixture({ state: "running", expiresAt: "not-a-date" }), heartbeatInput);
  assert.equal(invalidExpiryHeartbeat.ok, false);
  assert.equal(invalidExpiryHeartbeat.code, "invalid_input");

  const invalidExpiry = expireLeaseIfStale(
    makeWorkItemFixture({ status: "running", leaseId: "lease-1", attemptCount: 1 }),
    makeLeaseFixture({ state: "running", expiresAt: "not-a-date" }),
    {
      evidenceRefs: ["evidence-expiry"],
      clock
    }
  );
  assert.equal(invalidExpiry.ok, false);
  assert.equal(invalidExpiry.code, "invalid_input");

  const completedExpiry = expireLeaseIfStale(
    makeWorkItemFixture({ status: "completed", leaseId: "lease-1", attemptCount: 1 }),
    makeLeaseFixture({ state: "completed", expiresAt: "2026-06-30T00:01:00.000Z" }),
    {
      evidenceRefs: ["evidence-terminal-expiry"],
      clock
    }
  );
  assert.equal(completedExpiry.ok, false);
  assert.equal(completedExpiry.code, "terminal_state");
});

test("recovery policy makes retry, quarantine, requeue, blocked, and completed decisions explicit", async () => {
  const {
    createManualClock,
    recoverWorkItem,
    makeWorkItemFixture
  } = await loadLifecycleDomain();

  const clock = createManualClock("2026-06-30T00:10:00.000Z");
  const failed = makeWorkItemFixture({ status: "failed", attemptCount: 1, leaseId: "lease-1" });
  const retry = recoverWorkItem(failed, {
    maxAttempts: 3,
    evidenceRefs: ["evidence-retry"],
    clock
  });
  assert.equal(retry.ok, true);
  assert.equal(retry.value.decision, "retry");
  assert.equal(retry.value.workItem.status, "queued");
  assert.equal(retry.value.workItem.leaseId, null);

  const failedTooOften = makeWorkItemFixture({ status: "failed", attemptCount: 3, leaseId: "lease-2" });
  const quarantine = recoverWorkItem(failedTooOften, {
    maxAttempts: 3,
    evidenceRefs: ["evidence-quarantine"],
    clock
  });
  assert.equal(quarantine.ok, true);
  assert.equal(quarantine.value.decision, "quarantine");
  assert.equal(quarantine.value.workItem.status, "quarantined");

  const expired = makeWorkItemFixture({ status: "expired", attemptCount: 1, leaseId: "lease-3" });
  const requeue = recoverWorkItem(expired, {
    maxAttempts: 3,
    evidenceRefs: ["evidence-requeue"],
    clock
  });
  assert.equal(requeue.ok, true);
  assert.equal(requeue.value.decision, "requeue");
  assert.equal(requeue.value.workItem.status, "queued");

  const blocked = makeWorkItemFixture({ status: "blocked", attemptCount: 1, leaseId: "lease-4" });
  const blockedDecision = recoverWorkItem(blocked, {
    maxAttempts: 3,
    evidenceRefs: ["evidence-blocked"],
    clock
  });
  assert.equal(blockedDecision.ok, true);
  assert.equal(blockedDecision.value.decision, "blocked");
  assert.equal(blockedDecision.value.workItem.status, "blocked");

  const completed = makeWorkItemFixture({ status: "completed", attemptCount: 1, leaseId: "lease-5" });
  const completedDecision = recoverWorkItem(completed, {
    maxAttempts: 3,
    evidenceRefs: ["evidence-completed"],
    clock
  });
  assert.equal(completedDecision.ok, false);
  assert.equal(completedDecision.code, "terminal_state");

  const invalidLimit = recoverWorkItem(failed, {
    maxAttempts: Number.NaN,
    evidenceRefs: ["evidence-invalid-limit"],
    clock
  });
  assert.equal(invalidLimit.ok, false);
  assert.equal(invalidLimit.code, "invalid_input");
});

test("operational action policy allows low-risk metadata inspection without stronger authority", async () => {
  const { evaluateOperationalAction, makeWorkItemFixture } = await loadLifecycleDomain();

  const result = evaluateOperationalAction(makeWorkItemFixture({ status: "queued" }), {
    actionType: "inspect_state",
    authorityStage: "pipeline_adapter",
    evidenceRefs: ["action:inspect-1"]
  });

  assert.equal(result.ok, true);
  assert.equal(result.reasonCode, "allowed");
  assert.equal(result.riskClass, "low");
  assert.equal(result.decision, "allowed_unattended");
  assert.deepEqual(result.needsApproval, []);
  assert.equal(result.metadataOnly, true);
  assert.equal(result.rawPayloadRetained, false);

  const malformedAuthority = evaluateOperationalAction(makeWorkItemFixture({ status: "queued" }), {
    actionType: "inspect_state",
    authorityStage: "not_a_real_stage",
    evidenceRefs: ["action:inspect-1"]
  });
  assert.equal(malformedAuthority.ok, false);
  assert.equal(malformedAuthority.reasonCode, "invalid_input");
});

test("operational action policy rejects forbidden lifecycle transitions with typed reasons", async () => {
  const { evaluateOperationalAction, makeWorkItemFixture } = await loadLifecycleDomain();

  const result = evaluateOperationalAction(makeWorkItemFixture({ status: "eligible", leaseId: "lease-1" }), {
    actionType: "start_live_worker",
    targetStatus: "running",
    authorityStage: "live_worker",
    evidenceRefs: ["lease-owner:lease-1"]
  });

  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "invalid_transition");
  assert.equal(result.decision, "block_and_record");
  assert.equal(result.recoveryAction, "inspect");
  assert.deepEqual(result.transition, { fromStatus: "eligible", toStatus: "running", allowed: false });
});

test("operational action policy requires stronger authority for worker mutation and external surfaces", async () => {
  const { evaluateOperationalAction, makeWorkItemFixture } = await loadLifecycleDomain();

  const worker = evaluateOperationalAction(makeWorkItemFixture({ status: "leased", leaseId: "lease-1" }), {
    actionType: "start_live_worker",
    targetStatus: "running",
    authorityStage: "bootstrap_refill",
    evidenceRefs: ["lease-owner:lease-1"]
  });

  assert.equal(worker.ok, false);
  assert.equal(worker.reasonCode, "insufficient_authority");
  assert.equal(worker.decision, "requires_preauthorization");
  assert.deepEqual(worker.needsApproval, ["authority", "safety"]);
  assert.equal(worker.requiredAuthorityStage, "live_worker");

  const dispatchWorkItem = makeWorkItemFixture({ status: "queued" });
  const dispatch = evaluateOperationalAction(dispatchWorkItem, {
    actionType: "dispatch_apply",
    targetStatus: "leased",
    authorityStage: "bootstrap_refill",
    evidenceRefs: [`work-item:${dispatchWorkItem.workItemId}`]
  });
  assert.equal(dispatch.ok, true);
  assert.equal(dispatch.riskClass, "high");
  assert.equal(dispatch.maximumMutationLevel, "workspace_files");
  assert.equal(dispatch.transition.fromStatus, "queued");
  assert.equal(dispatch.transition.toStatus, "leased");

  const dispatchWithoutWorkItemEvidence = evaluateOperationalAction(dispatchWorkItem, {
    actionType: "dispatch_apply",
    targetStatus: "leased",
    authorityStage: "bootstrap_refill",
    evidenceRefs: ["action:dispatch-apply"]
  });
  assert.equal(dispatchWithoutWorkItemEvidence.ok, false);
  assert.equal(dispatchWithoutWorkItemEvidence.reasonCode, "missing_evidence");

  const deliveryWorkItem = makeWorkItemFixture({ status: "completed" });
  const deliveryHeadSha = "0123456789abcdef0123456789abcdef01234567";
  const delivery = evaluateOperationalAction(deliveryWorkItem, {
    actionType: "deliver_pr",
    authorityStage: "live_worker",
    evidenceRefs: ["preauthorization-record:delivery-1", "record:current-pr-snapshot-123"],
    trustedGateRecords: [{
      gateRecordId: "gate-record:delivery-1",
      runId: deliveryWorkItem.runId,
      workItemId: deliveryWorkItem.workItemId,
      actionType: "deliver_pr",
      authoritySource: "manager-review",
      scope: "pr-123",
      prNumber: 123,
      headSha: deliveryHeadSha,
      expectedBaseBranch: "dev",
      draft: false,
      mergeableState: "clean",
      checksHeadSha: deliveryHeadSha,
      checksStatus: "passed",
      reviewState: "approved",
      reviewThreadsResolved: true,
      localVerificationRefs: ["verification:manager-control-plane-pass"],
      currentHeadRefOid: deliveryHeadSha,
      currentBaseBranch: "dev",
      currentDraft: false,
      currentMergeableState: "clean",
      currentChecksHeadSha: deliveryHeadSha,
      currentChecksStatus: "passed",
      currentReviewState: "approved",
      currentReviewThreadsResolved: true,
      currentVerificationFresh: true,
      currentVerificationRefs: ["verification:manager-control-plane-pass"],
      rawPayloadRetained: false
    }]
  });

  assert.equal(delivery.ok, false);
  assert.equal(delivery.reasonCode, "insufficient_authority");
  assert.deepEqual(delivery.needsApproval, ["authority", "destination", "safety"]);
  assert.equal(delivery.requiredAuthorityStage, "delivery");

  const provider = evaluateOperationalAction(makeWorkItemFixture({ status: "queued" }), {
    actionType: "provider_call",
    authorityStage: "delivery",
    evidenceRefs: ["action:provider-1"]
  });

  assert.equal(provider.ok, false);
  assert.equal(provider.reasonCode, "forbidden_action");
  assert.equal(provider.decision, "forbidden");
  assert.deepEqual(provider.needsApproval, ["product", "authority", "resource", "safety"]);
  assert.equal(provider.recoveryAction, "block");
});

test("operational action policy preserves forbidden provider calls before evidence validation", async () => {
  const { evaluateOperationalAction, makeWorkItemFixture } = await loadLifecycleDomain();

  const provider = evaluateOperationalAction(makeWorkItemFixture({ status: "queued" }), {
    actionType: "provider_call",
    authorityStage: "delivery",
    evidenceRefs: []
  });

  assert.equal(provider.ok, false);
  assert.equal(provider.decision, "forbidden");
  assert.equal(provider.reasonCode, "forbidden_action");
  assert.deepEqual(provider.needsApproval, ["product", "authority", "resource", "safety"]);
});

test("operational action policy validates and copies evidence refs", async () => {
  const { evaluateOperationalAction, makeWorkItemFixture } = await loadLifecycleDomain();

  for (const evidenceRefs of [null, undefined, "evidence", [], ["   "]]) {
    const result = evaluateOperationalAction(makeWorkItemFixture({ status: "queued" }), {
      actionType: "inspect_state",
      authorityStage: "backend_proof",
      evidenceRefs
    });
    assert.equal(result.ok, false);
    assert.equal(result.reasonCode, "missing_evidence");
  }

  const evidenceRefs = [" action:evidence-one ", "record:evidence-two"];
  const result = evaluateOperationalAction(makeWorkItemFixture({ status: "queued" }), {
    actionType: "inspect_state",
    authorityStage: "backend_proof",
    evidenceRefs
  });
  evidenceRefs.push("evidence-after-return");

  assert.equal(result.ok, true);
  assert.deepEqual(result.evidenceRefs, ["action:evidence-one", "record:evidence-two"]);
  assert.throws(() => result.evidenceRefs.push("mutation"), /object is not extensible|Cannot add property/);
});

test("operational action policy keeps delivery and cleanup behind explicit gate evidence", async () => {
  const { evaluateOperationalAction, makeWorkItemFixture } = await loadLifecycleDomain();

  const deliveryWithoutGate = evaluateOperationalAction(makeWorkItemFixture({ status: "completed" }), {
    actionType: "deliver_pr",
    authorityStage: "delivery",
    evidenceRefs: ["action:delivery-1"]
  });
  assert.equal(deliveryWithoutGate.ok, false);
  assert.equal(deliveryWithoutGate.decision, "block_and_record");
  assert.equal(deliveryWithoutGate.reasonCode, "missing_evidence");

  const runningDeliveryWorkItem = makeWorkItemFixture({ status: "running" });
  const runningDeliveryHeadSha = "0123456789abcdef0123456789abcdef01234567";
  const deliveryUnfinished = evaluateOperationalAction(runningDeliveryWorkItem, {
    actionType: "deliver_pr",
    authorityStage: "delivery",
    evidenceRefs: ["preauthorization-record:delivery-running"],
    trustedGateRecords: [{
      gateRecordId: "gate-record:delivery-running",
      runId: runningDeliveryWorkItem.runId,
      workItemId: runningDeliveryWorkItem.workItemId,
      actionType: "deliver_pr",
      authoritySource: "manager-review",
      scope: "pr-123",
      prNumber: 123,
      headSha: runningDeliveryHeadSha,
      expectedBaseBranch: "dev",
      draft: false,
      mergeableState: "clean",
      checksHeadSha: runningDeliveryHeadSha,
      checksStatus: "passed",
      reviewState: "approved",
      reviewThreadsResolved: true,
      localVerificationRefs: ["test:manager-control-plane-pass"],
      currentHeadRefOid: runningDeliveryHeadSha,
      currentBaseBranch: "dev",
      currentDraft: false,
      currentMergeableState: "clean",
      currentChecksHeadSha: runningDeliveryHeadSha,
      currentChecksStatus: "passed",
      currentReviewState: "approved",
      currentReviewThreadsResolved: true,
      currentVerificationFresh: true,
      currentVerificationRefs: ["test:manager-control-plane-pass"],
      rawPayloadRetained: false
    }]
  });
  assert.equal(deliveryUnfinished.ok, false);
  assert.equal(deliveryUnfinished.reasonCode, "invalid_transition");

  const deliveryWithGenericGate = evaluateOperationalAction(makeWorkItemFixture({ status: "completed" }), {
    actionType: "deliver_pr",
    authorityStage: "delivery",
    evidenceRefs: ["gate:delivery-approved"]
  });
  assert.equal(deliveryWithGenericGate.ok, false);
  assert.equal(deliveryWithGenericGate.reasonCode, "missing_evidence");

  const deliveryWorkItem = makeWorkItemFixture({ status: "completed" });
  const deliveryHeadSha = "0123456789abcdef0123456789abcdef01234567";
  const deliveryGateRecord = {
    gateRecordId: "gate-record:delivery-1",
    runId: deliveryWorkItem.runId,
    workItemId: deliveryWorkItem.workItemId,
    actionType: "deliver_pr",
    authoritySource: "manager-review",
    scope: "pr-123",
    prNumber: 123,
    headSha: deliveryHeadSha,
    expectedBaseBranch: "dev",
    draft: false,
    mergeableState: "clean",
    checksHeadSha: deliveryHeadSha,
    checksStatus: "passed",
    reviewState: "approved",
    reviewThreadsResolved: true,
    localVerificationRefs: ["verification:manager-control-plane-pass"],
    currentHeadRefOid: deliveryHeadSha,
    currentBaseBranch: "dev",
    currentDraft: false,
    currentMergeableState: "clean",
    currentChecksHeadSha: deliveryHeadSha,
    currentChecksStatus: "passed",
    currentReviewState: "approved",
    currentReviewThreadsResolved: true,
    currentVerificationFresh: true,
    currentSnapshotAt: "2026-07-04T23:58:00.000Z",
    currentVerificationRefs: ["verification:manager-control-plane-pass"],
    rawPayloadRetained: false
  };
  const deliveryWithGate = evaluateOperationalAction(deliveryWorkItem, {
    actionType: "deliver_pr",
    authorityStage: "delivery",
    evidenceRefs: ["preauthorization-record:delivery-1", "record:current-pr-snapshot-123"],
    trustedGateRecords: [deliveryGateRecord],
    now: TEST_OPERATIONAL_NOW
  });
  assert.equal(deliveryWithGate.ok, true);

  const deliveryWithRawPayloadGate = evaluateOperationalAction(deliveryWorkItem, {
    actionType: "deliver_pr",
    authorityStage: "delivery",
    evidenceRefs: ["gate-record:delivery-1", "record:current-pr-snapshot-123"],
    trustedGateRecords: [{
      ...deliveryGateRecord,
      rawPayloadRetained: true
    }],
    now: TEST_OPERATIONAL_NOW
  });
  assert.equal(deliveryWithRawPayloadGate.ok, false);
  assert.equal(deliveryWithRawPayloadGate.reasonCode, "missing_evidence");

  const deliveryWithNonGateId = evaluateOperationalAction(deliveryWorkItem, {
    actionType: "deliver_pr",
    authorityStage: "delivery",
    evidenceRefs: ["record:current-pr-snapshot-123"],
    trustedGateRecords: [{
      ...deliveryGateRecord,
      gateRecordId: "record:current-pr-snapshot-123"
    }],
    now: TEST_OPERATIONAL_NOW
  });
  assert.equal(deliveryWithNonGateId.ok, false);
  assert.equal(deliveryWithNonGateId.reasonCode, "missing_evidence");

  const deliveryWithoutCurrentSnapshot = evaluateOperationalAction(deliveryWorkItem, {
    actionType: "deliver_pr",
    authorityStage: "delivery",
    evidenceRefs: ["gate-record:delivery-1", "record:current-pr-snapshot-123"],
    trustedGateRecords: [{
      ...deliveryGateRecord,
      currentSnapshotAt: null,
      currentPrSnapshotAt: null,
      currentVerifiedAt: "2026-07-04T23:58:00.000Z"
    }],
    now: TEST_OPERATIONAL_NOW
  });
  assert.equal(deliveryWithoutCurrentSnapshot.ok, false);
  assert.equal(deliveryWithoutCurrentSnapshot.reasonCode, "missing_evidence");

  const deliveryStaleHead = evaluateOperationalAction(deliveryWorkItem, {
    actionType: "deliver_pr",
    authorityStage: "delivery",
    evidenceRefs: ["gate-record:delivery-1", "record:current-pr-snapshot-123"],
    now: TEST_OPERATIONAL_NOW,
    trustedGateRecords: [{
      ...deliveryGateRecord,
      currentHeadRefOid: "1111111111111111111111111111111111111111"
    }]
  });
  assert.equal(deliveryStaleHead.ok, false);
  assert.equal(deliveryStaleHead.reasonCode, "missing_evidence");

  const deliveryStaleReview = evaluateOperationalAction(deliveryWorkItem, {
    actionType: "deliver_pr",
    authorityStage: "delivery",
    evidenceRefs: ["gate-record:delivery-1", "record:current-pr-snapshot-123"],
    now: TEST_OPERATIONAL_NOW,
    trustedGateRecords: [{
      ...deliveryGateRecord,
      currentReviewThreadsResolved: false
    }]
  });
  assert.equal(deliveryStaleReview.ok, false);
  assert.equal(deliveryStaleReview.reasonCode, "missing_evidence");

  const deliveryMismatchedRef = evaluateOperationalAction(deliveryWorkItem, {
    actionType: "deliver_pr",
    authorityStage: "delivery",
    evidenceRefs: ["gate-record:other-delivery"],
    trustedGateRecords: [{
      gateRecordId: "gate-record:delivery-1",
      runId: deliveryWorkItem.runId,
      workItemId: deliveryWorkItem.workItemId,
      actionType: "deliver_pr",
      authoritySource: "manager-review",
      scope: "pr-123",
      prNumber: 123,
      headSha: deliveryHeadSha,
      expectedBaseBranch: "dev",
      draft: false,
      mergeableState: "clean",
      checksHeadSha: deliveryHeadSha,
      checksStatus: "passed",
      reviewState: "approved",
      reviewThreadsResolved: true,
      localVerificationRefs: ["test:manager-control-plane-pass"],
      rawPayloadRetained: false
    }]
  });
  assert.equal(deliveryMismatchedRef.ok, false);
  assert.equal(deliveryMismatchedRef.reasonCode, "missing_evidence");

  const deliveryShortSha = evaluateOperationalAction(deliveryWorkItem, {
    actionType: "deliver_pr",
    authorityStage: "delivery",
    evidenceRefs: ["gate-record:delivery-short"],
    trustedGateRecords: [{
      gateRecordId: "gate-record:delivery-short",
      runId: deliveryWorkItem.runId,
      workItemId: deliveryWorkItem.workItemId,
      actionType: "deliver_pr",
      authoritySource: "manager-review",
      scope: "pr-123",
      prNumber: 123,
      headSha: "abc123",
      expectedBaseBranch: "dev",
      draft: false,
      mergeableState: "clean",
      checksHeadSha: "abc123",
      checksStatus: "passed",
      reviewState: "approved",
      reviewThreadsResolved: true,
      localVerificationRefs: ["test:manager-control-plane-pass"],
      rawPayloadRetained: false
    }]
  });
  assert.equal(deliveryShortSha.ok, false);
  assert.equal(deliveryShortSha.reasonCode, "missing_evidence");

  const cleanupUnfinishedWorkItem = makeWorkItemFixture({ status: "completed" });
  const cleanupUnfinishedHeadSha = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";
  const cleanupUnfinished = evaluateOperationalAction(cleanupUnfinishedWorkItem, {
    actionType: "cleanup_workspace",
    authorityStage: "delivery",
    evidenceRefs: ["gate-record:cleanup-unfinished"],
    trustedGateRecords: [{
      gateRecordId: "gate-record:cleanup-unfinished",
      runId: cleanupUnfinishedWorkItem.runId,
      workItemId: cleanupUnfinishedWorkItem.workItemId,
      actionType: "cleanup_workspace",
      authoritySource: "cleanup-dry-run",
      scope: "workspace-local",
      mergedPrHeadSha: cleanupUnfinishedHeadSha,
      expectedOwner: "manager-test/codex-2",
      worktreePath: "/tmp/worktrees/lane",
      localBranch: "codex/lane",
      localBranchSha: cleanupUnfinishedHeadSha,
      remoteBranch: "codex/lane",
      remoteBranchSha: cleanupUnfinishedHeadSha,
      deletionScope: "managed_workspace",
      dryRunId: "dry-run-1",
      rollbackPath: "restore worktree from git refs",
      cleanupDryRunPassed: true,
      rawPayloadRetained: false
    }]
  });
  assert.equal(cleanupUnfinished.ok, false);
  assert.equal(cleanupUnfinished.reasonCode, "invalid_transition");

  const cleanupWorkItem = makeWorkItemFixture({ status: "closed" });
  const cleanupHeadSha = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";
  const cleanupGateRecord = {
    gateRecordId: "gate-record:cleanup-1",
    runId: cleanupWorkItem.runId,
    workItemId: cleanupWorkItem.workItemId,
    actionType: "cleanup_workspace",
    authoritySource: "cleanup-dry-run",
    scope: "workspace-local",
    mergedPrHeadSha: cleanupHeadSha,
    expectedOwner: "manager-test/codex-2",
    worktreePath: "/tmp/worktrees/lane",
    localBranch: "codex/lane",
    localBranchSha: cleanupHeadSha,
    remoteBranch: "codex/lane",
    remoteBranchSha: cleanupHeadSha,
    currentExpectedOwner: "manager-test/codex-2",
    currentWorktreePath: "/tmp/worktrees/lane",
    currentLocalBranch: "codex/lane",
    currentLocalBranchSha: cleanupHeadSha,
    currentRemoteBranch: "codex/lane",
    currentRemoteBranchSha: cleanupHeadSha,
    currentWorktreeState: "clean",
    currentDryRunId: "dry-run-1",
    currentDryRunAt: "2026-07-04T23:58:00.000Z",
    dryRunFresh: true,
    deletionScope: "managed_workspace",
    dryRunId: "dry-run-1",
    rollbackPath: "restore worktree from git refs",
    cleanupDryRunPassed: true,
    rawPayloadRetained: false
  };
  const cleanupWithGate = evaluateOperationalAction(cleanupWorkItem, {
    actionType: "cleanup_workspace",
    authorityStage: "delivery",
    evidenceRefs: ["gate-record:cleanup-1"],
    trustedGateRecords: [cleanupGateRecord],
    now: TEST_OPERATIONAL_NOW
  });
  assert.equal(cleanupWithGate.ok, true);

  for (const staleCleanupRecord of [
    { currentLocalBranchSha: "1111111111111111111111111111111111111111" },
    { currentRemoteBranchSha: "1111111111111111111111111111111111111111" },
    { currentExpectedOwner: "manager-test/codex-3" },
    { currentWorktreePath: "/tmp/worktrees/other-lane" },
    { currentDryRunId: "dry-run-stale" },
    { dryRunFresh: false },
    { currentDryRunAt: null, dryRunAt: "2026-07-04T23:58:00.000Z" },
    { currentDryRunAt: "2026-07-04T23:00:00.000Z" }
  ]) {
    const cleanupStaleCurrentState = evaluateOperationalAction(cleanupWorkItem, {
      actionType: "cleanup_workspace",
      authorityStage: "delivery",
      evidenceRefs: ["gate-record:cleanup-1"],
      now: TEST_OPERATIONAL_NOW,
      trustedGateRecords: [{ ...cleanupGateRecord, ...staleCleanupRecord }]
    });
    assert.equal(cleanupStaleCurrentState.ok, false);
    assert.equal(cleanupStaleCurrentState.reasonCode, "missing_evidence");
  }

  const cleanupWorktreeOnly = evaluateOperationalAction(cleanupWorkItem, {
    actionType: "cleanup_workspace",
    authorityStage: "delivery",
    evidenceRefs: ["preauthorization-record:cleanup-worktree"],
    now: TEST_OPERATIONAL_NOW,
    trustedGateRecords: [{
      gateRecordId: "gate-record:cleanup-worktree",
      runId: cleanupWorkItem.runId,
      workItemId: cleanupWorkItem.workItemId,
      actionType: "cleanup_workspace",
      authoritySource: "cleanup-dry-run",
      scope: "worktree-only",
      mergedPrHeadSha: cleanupHeadSha,
      expectedOwner: "manager-test/codex-2",
      worktreePath: "/tmp/worktrees/lane",
      currentExpectedOwner: "manager-test/codex-2",
      currentWorktreePath: "/tmp/worktrees/lane",
      currentWorktreeState: "clean",
      currentDryRunId: "dry-run-worktree",
      currentDryRunAt: "2026-07-04T23:58:00.000Z",
      dryRunFresh: true,
      deletionScope: "worktree",
      dryRunId: "dry-run-worktree",
      rollbackPath: "restore worktree from git refs",
      cleanupDryRunPassed: true,
      rawPayloadRetained: false
    }]
  });
  assert.equal(cleanupWorktreeOnly.ok, true);

  const cleanupWrongRemote = evaluateOperationalAction(cleanupWorkItem, {
    actionType: "cleanup_workspace",
    authorityStage: "delivery",
    evidenceRefs: ["gate-record:cleanup-wrong-remote"],
    trustedGateRecords: [{
      gateRecordId: "gate-record:cleanup-wrong-remote",
      runId: cleanupWorkItem.runId,
      workItemId: cleanupWorkItem.workItemId,
      actionType: "cleanup_workspace",
      authoritySource: "cleanup-dry-run",
      scope: "workspace-local",
      mergedPrHeadSha: cleanupHeadSha,
      expectedOwner: "manager-test/codex-2",
      worktreePath: "/tmp/worktrees/lane",
      localBranch: "codex/lane",
      localBranchSha: cleanupHeadSha,
      remoteBranch: "codex/lane",
      remoteBranchSha: "0123456789abcdef0123456789abcdef01234567",
      deletionScope: "managed_workspace",
      dryRunId: "dry-run-1",
      rollbackPath: "restore worktree from git refs",
      cleanupDryRunPassed: true,
      rawPayloadRetained: false
    }]
  });
  assert.equal(cleanupWrongRemote.ok, false);
  assert.equal(cleanupWrongRemote.reasonCode, "missing_evidence");
});

test("operational action policy allows only global metadata inspection without a work item", async () => {
  const { evaluateOperationalAction, makeWorkItemFixture } = await loadLifecycleDomain();

  const missingInput = evaluateOperationalAction(makeWorkItemFixture({ status: "queued" }), null);
  assert.equal(missingInput.ok, false);
  assert.equal(missingInput.actionType, "unknown_action");
  assert.equal(missingInput.reasonCode, "unknown_action");
  assert.equal(missingInput.decision, "forbidden");

  const missingWorkItem = evaluateOperationalAction(null, {
    actionType: "inspect_state",
    authorityStage: "backend_proof",
    evidenceRefs: ["action:inspect-1"]
  });
  assert.equal(missingWorkItem.ok, true);
  assert.equal(missingWorkItem.reasonCode, "allowed");

  const scopedMutationWithoutWorkItem = evaluateOperationalAction(null, {
    actionType: "start_live_worker",
    targetStatus: "running",
    authorityStage: "live_worker",
    evidenceRefs: ["lease-owner:manager-test/codex-1"]
  });
  assert.equal(scopedMutationWithoutWorkItem.ok, false);
  assert.equal(scopedMutationWithoutWorkItem.reasonCode, "invalid_input");

  const scopedRefreshWithoutEvidence = evaluateOperationalAction(null, {
    actionType: "refresh_projection",
    authorityStage: "backend_proof",
    evidenceRefs: []
  });
  assert.equal(scopedRefreshWithoutEvidence.ok, false);
  assert.equal(scopedRefreshWithoutEvidence.reasonCode, "invalid_input");
});

test("operational action policy requires lease evidence and target status for lifecycle actions", async () => {
  const { evaluateOperationalAction, makeWorkItemFixture } = await loadLifecycleDomain();

  const claimWorkItem = makeWorkItemFixture({ status: "queued", leaseId: null });
  const claimWithWorkItemAsLeaseOwner = evaluateOperationalAction(claimWorkItem, {
    actionType: "claim_lease",
    targetStatus: "leased",
    authorityStage: "bootstrap_refill",
    evidenceRefs: [`lease-owner:${claimWorkItem.workItemId}`]
  });
  assert.equal(claimWithWorkItemAsLeaseOwner.ok, false);
  assert.equal(claimWithWorkItemAsLeaseOwner.reasonCode, "invalid_input");

  const claimWithMismatchedLeaseOwner = evaluateOperationalAction(claimWorkItem, {
    actionType: "claim_lease",
    targetStatus: "leased",
    leaseId: "lease-claim-1",
    authorityStage: "bootstrap_refill",
    evidenceRefs: [`lease-owner:${claimWorkItem.workItemId}`]
  });
  assert.equal(claimWithMismatchedLeaseOwner.ok, false);
  assert.equal(claimWithMismatchedLeaseOwner.reasonCode, "missing_evidence");

  const claimWithLeaseOwner = evaluateOperationalAction(claimWorkItem, {
    actionType: "claim_lease",
    targetStatus: "leased",
    leaseId: "lease-claim-1",
    authorityStage: "bootstrap_refill",
    evidenceRefs: ["lease-owner:lease-claim-1"]
  });
  assert.equal(claimWithLeaseOwner.ok, true);

  const leasedWithoutLeaseId = evaluateOperationalAction(makeWorkItemFixture({ status: "leased", leaseId: null }), {
    actionType: "start_live_worker",
    targetStatus: "running",
    authorityStage: "live_worker",
    evidenceRefs: ["lease-owner:worker-1"]
  });
  assert.equal(leasedWithoutLeaseId.ok, false);
  assert.equal(leasedWithoutLeaseId.reasonCode, "missing_evidence");
  assert.deepEqual(leasedWithoutLeaseId.needsApproval, ["resource", "safety"]);

  const missingTarget = evaluateOperationalAction(makeWorkItemFixture({ status: "leased", leaseId: "lease-1" }), {
    actionType: "start_live_worker",
    authorityStage: "live_worker",
    evidenceRefs: ["lease-owner:lease-1"]
  });
  assert.equal(missingTarget.ok, false);
  assert.equal(missingTarget.reasonCode, "invalid_input");
  assert.equal(missingTarget.transition, null);
});

test("manual fake clock rejects backwards or non-finite advances", async () => {
  const { createManualClock } = await loadLifecycleDomain();
  const clock = createManualClock("2026-06-30T00:00:00.000Z");

  assert.throws(() => clock.advanceMs(-1), /Invalid clock advance/);
  assert.throws(() => clock.advanceMs(Number.NaN), /Invalid clock advance/);
});

test("lifecycle domain and lifecycle tests do not use direct system clock calls", async () => {
  const sourceFiles = [
    new URL("clock.ts", lifecycleRoot),
    new URL("candidate-lifecycle.ts", lifecycleRoot),
    new URL("work-item-lifecycle.ts", lifecycleRoot),
    new URL("lease-lifecycle.ts", lifecycleRoot),
    new URL("recovery-policy.ts", lifecycleRoot),
    new URL("operational-action-policy.ts", lifecycleRoot),
    new URL("manager-control-plane.lifecycle.test.mjs", new URL("./", import.meta.url))
  ];

  for (const fileUrl of sourceFiles) {
    const source = await readFile(fileUrl, "utf8");
    assert.doesNotMatch(source, /Date\s*\.\s*now\s*\(/, `${fileUrl.pathname} uses a direct system clock`);
  }
});

async function loadLifecycleDomain() {
  const outDir = await mkdtemp(join(tmpdir(), "manager-lifecycle-"));
  await writeFile(join(outDir, "package.json"), '{"type":"module"}\n');

  const result = spawnSync(
    tscPath,
    [
      "--target",
      "ES2022",
      "--module",
      "ESNext",
      "--moduleResolution",
      "Bundler",
      "--strict",
      "--verbatimModuleSyntax",
      "--rootDir",
      ".",
      "--outDir",
      outDir,
      "packages/contracts/src/index.ts",
      "packages/workflow-core/src/manager-control-plane/index.ts"
    ],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  await rewriteCompiledEsmImports(join(outDir, "packages/workflow-core/src/manager-control-plane"), [
    "index.js",
    "candidate-lifecycle.js",
    "work-item-lifecycle.js",
    "lease-lifecycle.js",
    "recovery-policy.js",
    "operational-action-policy.js",
    "run-contract.js"
  ]);

  const contractPackageRoot = join(outDir, "node_modules", "@kendall", "contracts");
  await mkdir(contractPackageRoot, { recursive: true });
  await writeFile(
    join(contractPackageRoot, "package.json"),
    JSON.stringify({
      type: "module",
      exports: {
        ".": "./index.js"
      }
    })
  );
  await writeFile(
    join(contractPackageRoot, "index.js"),
    [
      'import * as lifecycle from "../../../packages/contracts/src/manager-control-plane/lifecycle.js";',
      'import * as authority from "../../../packages/contracts/src/manager-control-plane/authority.js";',
      'import * as actions from "../../../packages/contracts/src/manager-control-plane/operational-action.js";',
      'import * as events from "../../../packages/contracts/src/manager-control-plane/events.js";',
      'export const ManagerControlPlane = { ...lifecycle, ...authority, ...actions, ...events };',
      ""
    ].join("\n")
  );

  return import(pathToFileURL(join(outDir, "packages/workflow-core/src/manager-control-plane/index.js")).href);
}

async function rewriteCompiledEsmImports(root, files) {
  const replacements = new Map([
    ['"./clock"', '"./clock.js"'],
    ['"./result"', '"./result.js"'],
    ['"./candidate-lifecycle"', '"./candidate-lifecycle.js"'],
    ['"./work-item-lifecycle"', '"./work-item-lifecycle.js"'],
    ['"./lease-lifecycle"', '"./lease-lifecycle.js"'],
    ['"./recovery-policy"', '"./recovery-policy.js"'],
    ['"./operational-action-policy"', '"./operational-action-policy.js"'],
    ['"./run-contract"', '"./run-contract.js"']
  ]);

  for (const file of files) {
    const target = join(root, file);
    let source = await readFile(target, "utf8");
    for (const [from, to] of replacements) {
      source = source.replaceAll(from, to);
    }
    await writeFile(target, source);
  }
}
