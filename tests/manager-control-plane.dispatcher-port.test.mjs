import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createMemoryDispatcherAdapter } from "../scripts/lib/manager-control-plane/adapters/memory-dispatcher-adapter.mjs";
import { runBackendProofHarness } from "../scripts/lib/manager-control-plane/backend-proof-harness.mjs";
import { buildManagerExecutionLaneSummary } from "../scripts/lib/manager-control-plane/summary-projection.mjs";
import { toManagerSummaryJson } from "../scripts/lib/manager-control-plane/summary-json.mjs";
import { loadManagerFixture } from "./helpers/manager-control-plane/fixture-loader.mjs";
import { assertDispatcherPortConformance } from "./helpers/manager-control-plane/dispatcher-port-conformance.mjs";
import { loadWorkflowCoreManagerControlPlane } from "./helpers/manager-control-plane/workflow-core-loader.mjs";

const portPath = new URL("../packages/workflow-core/src/ports/dispatcher-port.ts", import.meta.url);
const portsIndexPath = new URL("../packages/workflow-core/src/ports/index.ts", import.meta.url);
const adapterPath = new URL("../scripts/lib/manager-control-plane/adapters/memory-dispatcher-adapter.mjs", import.meta.url);
const harnessPath = new URL("../scripts/lib/manager-control-plane/backend-proof-harness.mjs", import.meta.url);
const summaryJsonPath = new URL("../scripts/lib/manager-control-plane/summary-json.mjs", import.meta.url);

test("dispatcher port source boundary exists and is exported from workflow-core", async () => {
  assert.equal(existsSync(portPath), true, "missing lowercase dispatcher-port.ts");
  assert.equal(existsSync(portsIndexPath), true, "missing ports index");

  const workflowIndex = await readFile(new URL("../packages/workflow-core/src/index.ts", import.meta.url), "utf8");
  assert.match(workflowIndex, /export \* from "\.\/ports";/);

  const portSource = await readFile(portPath, "utf8");
  assert.match(portSource, /interface DispatcherPort/);
  for (const forbidden of ["BullMQ", "Redis", "Hatchet", "SQLite", "tmux", "GitHub", "provider", "child_process"]) {
    assert.doesNotMatch(portSource, new RegExp(forbidden, "i"), `dispatcher port leaks ${forbidden}`);
  }
});

test("memory dispatcher adapter passes refill, lease, heartbeat, complete, and summary conformance", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");

  await assertDispatcherPortConformance(
    () =>
      createMemoryDispatcherAdapter({
        lifecycle,
        clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
        runId: "run-1"
      }),
    { candidate: fixture.candidate }
  );
});

test("backend proof harness runs one honest simulated loop with bounded summary JSON", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");
  const result = await runBackendProofHarness({
    lifecycle,
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    candidates: [fixture.candidate],
    workerId: "worker-1"
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "completed");
  assert.equal(result.summary.currentPhase, "completed");
  assert.equal(result.summary.stateSource, "fixture");
  assert.equal(result.summary.proofMode, "backend_proof");
  assert.equal(result.summary.stateCounts.completed, 1);
  assert.equal(result.summary.stateCounts.totalWorkItems, 1);
  assert.equal(result.summary.stateCounts.totalAttempts, 1);
  assert.equal(result.summary.stateCounts.totalLeases, 1);
  assert.equal(result.summary.rawStateLabels.includes("work:completed"), true);
  assert.equal(result.summary.rawStateLabels.includes("lease:completed"), true);
  assert.equal(result.summary.rawStateLabels.includes("attempt:completed"), true);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.warnings.includes("backend_proof_simulated_no_live_worker_execution"), true);
  assert.equal(result.next_actions.includes("continue_to_summary_projection_story"), true);
  assert.equal(result.proof.mode, "backend_proof");
  assert.equal(result.proof.state_source, "fixture");
  assert.equal(result.proof.evidence_links.length > 0, true);
  assert.equal(result.proof.evidence_links.some((link) => link.workItemId === "work-item-001"), true);
  assert.equal(result.proof.evidence_links.every((link) => link.rawPayloadRetained === false), true);
  assert.equal(result.proof.metadata_only, true);
  assert.equal(result.proof.raw_payload_retained, false);
  assert.equal(result.proof.boundary.authority_stage, "backend_proof");
  assert.equal(result.proof.boundary.result, "completed");
  assert.equal(result.proof.boundary.real.includes("contract_objects"), true);
  assert.equal(result.proof.boundary.fake.includes("simulated_worker_execution"), true);
  assert.equal(result.proof.boundary.forbidden.includes("live_tmux_mutation"), true);
  assert.equal(result.proof.boundary.metadata_only, true);
  assert.equal(result.proof.boundary.raw_payload_retained, false);
});

test("memory dispatcher adapter handles empty refill and missing evidence deterministically", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const emptyFixture = await loadManagerFixture("refill-empty.json");
  const missingEvidenceFixture = await loadManagerFixture("missing-evidence.json");
  const adapter = createMemoryDispatcherAdapter({
    lifecycle,
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    runId: "run-1"
  });

  const emptyRefill = await adapter.refill({
    candidates: emptyFixture.candidates,
    evidenceRefs: ["evidence-empty-refill"],
    policyReason: "fixture source exhausted"
  });
  assert.equal(emptyRefill.ok, true);
  assert.equal(emptyRefill.value.refillJob.result, "no_safe_work");
  assert.equal(emptyRefill.value.events.some((event) => event.eventName === "dispatcher.work_supply.empty"), true);

  const missingEvidence = await adapter.refill({
    candidates: [missingEvidenceFixture.candidate],
    evidenceRefs: [],
    policyReason: "missing evidence should fail"
  });
  assert.equal(missingEvidence.ok, false);
  assert.equal(missingEvidence.code, "missing_evidence");
});

test("memory dispatcher adapter expires stale leases and requeues retryable work once", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("expired-lease.json");
  const clock = lifecycle.createManualClock("2026-06-30T00:00:00.000Z");
  const adapter = createMemoryDispatcherAdapter({
    lifecycle,
    clock,
    runId: "run-1",
    leaseTtlMs: 60_000
  });

  const refill = await adapter.refill({
    candidates: [fixture.candidate],
    evidenceRefs: ["evidence-refill"],
    policyReason: "fixture-backed safe source"
  });
  assert.equal(refill.ok, true);
  const claim = await adapter.claim({ workerId: "worker-1", evidenceRefs: ["evidence-claim"] });
  assert.equal(claim.ok, true);

  clock.advanceMs(60_001);
  const recovery = await adapter.recoverExpiredLeases({ evidenceRefs: ["evidence-recovery"] });
  assert.equal(recovery.ok, true);
  assert.equal(recovery.value.expiredLeases.length, 1);
  assert.equal(recovery.value.expiredLeases[0].state, "expired");
  assert.equal(recovery.value.recoveredWorkItems.length, 1);
  assert.equal(recovery.value.recoveredWorkItems[0].status, "queued");
  assert.equal(recovery.value.events.some((event) => event.eventName === "dispatcher.lease.expired"), true);
  assert.equal(recovery.value.events.some((event) => event.eventName === "dispatcher.recovery.attempted"), true);

  const snapshot = adapter.snapshot();
  assert.equal(snapshot.attempts[0].state, "expired");

  const secondRecovery = await adapter.recoverExpiredLeases({ evidenceRefs: ["evidence-recovery"] });
  assert.equal(secondRecovery.ok, true);
  assert.equal(secondRecovery.value.expiredLeases.length, 0);
});

test("memory dispatcher adapter blocks gated authority candidates and proves duplicate fixture basis", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const duplicateFixture = await loadManagerFixture("duplicate-pull.json");
  const adapter = createMemoryDispatcherAdapter({
    lifecycle,
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    runId: "run-1"
  });

  const duplicateRefill = await adapter.refill({
    candidates: duplicateFixture.candidates,
    evidenceRefs: ["evidence-duplicate"],
    policyReason: "fixture-backed duplicate source"
  });
  assert.equal(duplicateRefill.ok, true);
  assert.equal(duplicateRefill.value.queuedWorkItems.length, 1);
  assert.equal(duplicateRefill.value.duplicateCandidates.length, 1);

  const gated = await adapter.refill({
    candidates: [{
      ...duplicateFixture.candidates[0],
      candidateWorkPacketId: "candidate-gated",
      authorityClass: "requires_preauthorization",
      dependencyHints: ["packages/workflow-core/src/ports/gated-authority.ts"],
      dedupeKey: "gated"
    }],
    evidenceRefs: ["evidence-gated"],
    policyReason: "gated authority candidate should not queue"
  });
  assert.equal(gated.ok, true);
  assert.equal(gated.value.queuedWorkItems.length, 0);
  assert.equal(gated.value.blockedCandidates.length, 1);
  assert.equal(gated.value.events.some((event) => event.eventName === "dispatcher.authority.blocked"), true);

  const summary = await adapter.summarize();
  assert.equal(summary.currentPhase, "queued");
  assert.equal(summary.stateCounts.queued, 1);
  assert.equal(summary.stateCounts.blockedCandidates, 1);
  assert.equal(summary.stateCounts.duplicateCandidates, 1);
  assert.equal(summary.unsafeOrGatedWorkCount, 1);
  assert.equal(summary.authorityBlockedReason, "requires_preauthorization");
  assert.equal(summary.authorityClass, "block_and_record");
  assert.equal(summary.operatorAttentionRequired, true);
  assert.equal(summary.blockers.includes("dispatcher_has_blocked_candidates"), true);
  assert.equal(summary.rawStateLabels.includes("candidate:blocked"), true);
  assert.equal(summary.rawStateLabels.includes("candidate:duplicate"), true);
  assert.equal(summary.warnings.includes("duplicate_candidates_ignored"), true);
  assert.equal(summary.warnings.includes("authority_blocked_candidates_recorded"), true);
});

test("memory dispatcher adapter permits only one same-tick claim and recovers failed work", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");
  const adapter = createMemoryDispatcherAdapter({
    lifecycle,
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    runId: "run-1"
  });

  const refill = await adapter.refill({
    candidates: [fixture.candidate],
    evidenceRefs: ["evidence-refill"],
    policyReason: "fixture-backed safe source"
  });
  assert.equal(refill.ok, true);

  const claims = await Promise.all([
    adapter.claim({ workerId: "worker-1", evidenceRefs: ["evidence-claim-1"] }),
    adapter.claim({ workerId: "worker-2", evidenceRefs: ["evidence-claim-2"] })
  ]);
  assert.equal(claims.filter((claim) => claim.ok).length, 1);
  assert.equal(claims.filter((claim) => !claim.ok && claim.code === "no_work").length, 1);
  const successfulClaim = claims.find((claim) => claim.ok);
  const heartbeat = await adapter.heartbeat({
    leaseId: successfulClaim.value.lease.leaseId,
    workerId: successfulClaim.value.lease.workerId,
    attemptId: successfulClaim.value.lease.attemptId,
    idempotencyKey: successfulClaim.value.lease.idempotencyKey,
    authorityDecisionId: successfulClaim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-heartbeat"],
    ttlMs: 300_000
  });
  assert.equal(heartbeat.ok, true);
  const failed = await adapter.fail({
    leaseId: successfulClaim.value.lease.leaseId,
    workerId: successfulClaim.value.lease.workerId,
    attemptId: successfulClaim.value.lease.attemptId,
    idempotencyKey: successfulClaim.value.lease.idempotencyKey,
    authorityDecisionId: successfulClaim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-fail"],
    failureReason: "fixture failure"
  });
  assert.equal(failed.ok, true);
  const summaryBeforeRecovery = await adapter.summarize();
  assert.equal(summaryBeforeRecovery.currentPhase, "failed");
  assert.equal(summaryBeforeRecovery.operatorAttentionRequired, true);
  assert.equal(summaryBeforeRecovery.attentionReason, "dispatcher_phase_failed");
  assert.equal(summaryBeforeRecovery.recoveryStatus, "needed");
  assert.equal(summaryBeforeRecovery.stateCounts.failed, 1);
  assert.equal(summaryBeforeRecovery.rawStateLabels.includes("work:failed"), true);
  const mismatchedCloseout = await adapter.complete({
    leaseId: successfulClaim.value.lease.leaseId,
    workerId: successfulClaim.value.lease.workerId,
    attemptId: "attempt-999",
    idempotencyKey: successfulClaim.value.lease.idempotencyKey,
    authorityDecisionId: successfulClaim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-mismatch"],
    resultSummary: "should not close"
  });
  assert.equal(mismatchedCloseout.ok, false);
  assert.equal(mismatchedCloseout.code, "stale_lease");
  const recovery = await adapter.recoverExpiredLeases({ evidenceRefs: ["evidence-failed-recovery"] });
  assert.equal(recovery.ok, true);
  assert.equal(recovery.value.recoveredWorkItems.length, 1);
  assert.equal(recovery.value.recoveredWorkItems[0].status, "queued");
});

test("memory dispatcher summary keeps mixed queued and failed work operator-visible", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");
  const adapter = createMemoryDispatcherAdapter({
    lifecycle,
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    runId: "run-1"
  });
  const secondCandidate = {
    ...fixture.candidate,
    candidateWorkPacketId: "candidate-2",
    sourceRefs: [{
      ...fixture.candidate.sourceRefs[0],
      sourceRefId: "source-2",
      sourceSpan: "Story 1.4 mixed queued"
    }],
    proposedSlice: "Second safe slice",
    dedupeKey: "story-1.4:mixed-queued"
  };

  const refill = await adapter.refill({
    candidates: [fixture.candidate, secondCandidate],
    evidenceRefs: ["evidence-refill"],
    policyReason: "fixture-backed mixed state source"
  });
  assert.equal(refill.ok, true);
  assert.equal(refill.value.queuedWorkItems.length, 2);
  const claim = await adapter.claim({ workerId: "worker-1", evidenceRefs: ["evidence-claim"] });
  assert.equal(claim.ok, true);
  const heartbeat = await adapter.heartbeat({
    leaseId: claim.value.lease.leaseId,
    workerId: claim.value.lease.workerId,
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-heartbeat"],
    ttlMs: 300_000
  });
  assert.equal(heartbeat.ok, true);
  const failed = await adapter.fail({
    leaseId: claim.value.lease.leaseId,
    workerId: claim.value.lease.workerId,
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-fail"],
    failureReason: "fixture failure"
  });
  assert.equal(failed.ok, true);

  const summary = await adapter.summarize();
  assert.equal(summary.currentPhase, "queued");
  assert.equal(summary.stateCounts.queued, 1);
  assert.equal(summary.stateCounts.failed, 1);
  assert.equal(summary.operatorAttentionRequired, true);
  assert.equal(summary.blockers.includes("dispatcher_has_failed_work"), true);
  assert.equal(summary.recoveryStatus, "needed");
});

test("memory dispatcher closeout rejects mismatched existing attempt identity", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");
  const adapter = createMemoryDispatcherAdapter({
    lifecycle,
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    runId: "run-1"
  });
  const secondCandidate = {
    ...fixture.candidate,
    candidateWorkPacketId: "candidate-2",
    sourceRefs: [{
      ...fixture.candidate.sourceRefs[0],
      sourceRefId: "source-2",
      sourceSpan: "Story 1.4 second active claim"
    }],
    proposedSlice: "Second active slice",
    dedupeKey: "story-1.4:second-active"
  };
  const refill = await adapter.refill({
    candidates: [fixture.candidate, secondCandidate],
    evidenceRefs: ["evidence-refill"],
    policyReason: "fixture-backed closeout identity source"
  });
  assert.equal(refill.ok, true);
  const firstClaim = await adapter.claim({ workerId: "worker-1", evidenceRefs: ["evidence-claim-1"] });
  const secondClaim = await adapter.claim({ workerId: "worker-2", evidenceRefs: ["evidence-claim-2"] });
  assert.equal(firstClaim.ok, true);
  assert.equal(secondClaim.ok, true);

  const mismatched = await adapter.complete({
    leaseId: firstClaim.value.lease.leaseId,
    workerId: firstClaim.value.lease.workerId,
    attemptId: secondClaim.value.lease.attemptId,
    idempotencyKey: firstClaim.value.lease.idempotencyKey,
    authorityDecisionId: firstClaim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-mismatched-closeout"],
    resultSummary: "should not close"
  });
  assert.equal(mismatched.ok, false);
  assert.equal(mismatched.code, "stale_lease");
});

test("memory dispatcher summary distinguishes empty, authority-blocked, and stale states", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const emptyFixture = await loadManagerFixture("refill-empty.json");
  const duplicateFixture = await loadManagerFixture("duplicate-pull.json");
  const summaryFixture = await loadManagerFixture("summary-states.json");
  assert.deepEqual(
    summaryFixture.states.map((state) => state.state),
    [
      "queued",
      "leased_running",
      "completed",
      "failed",
      "expired_recovered",
      "authority_blocked",
      "duplicate_only",
      "empty_no_safe_work",
      "stale",
      "unknown"
    ]
  );
  for (const state of summaryFixture.states) {
    assert.equal(Array.isArray(state.expectedLabels), true, `${state.state} must define expected labels`);
    assert.equal(Boolean(state.expectedPhase || state.expectedFreshness), true, `${state.state} must define a phase or freshness`);
  }
  const clock = lifecycle.createManualClock("2026-06-30T00:00:00.000Z");
  const adapter = createMemoryDispatcherAdapter({
    lifecycle,
    clock,
    runId: "run-1",
    summaryStaleAfterMs: 60_000
  });

  const emptyRefill = await adapter.refill({
    candidates: emptyFixture.candidates,
    evidenceRefs: ["evidence-empty-refill"],
    policyReason: "fixture source exhausted"
  });
  assert.equal(emptyRefill.ok, true);
  const emptySummary = await adapter.summarize();
  assert.equal(emptySummary.currentPhase, "no_safe_work");
  assert.equal(emptySummary.safeWorkAvailableCount, 0);
  assert.equal(emptySummary.stateCounts.noSafeWork, 1);
  assert.equal(emptySummary.rawStateLabels.includes("supply:no_safe_work"), true);
  assert.equal(emptySummary.operatorAttentionRequired, false);

  const blockedOnly = createMemoryDispatcherAdapter({
    lifecycle,
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    runId: "run-1"
  });
  const blockedRefill = await blockedOnly.refill({
    candidates: [{
      ...duplicateFixture.candidates[0],
      candidateWorkPacketId: "candidate-blocked-only",
      authorityClass: "forbidden",
      dedupeKey: "blocked-only"
    }],
    evidenceRefs: ["evidence-blocked-only"],
    policyReason: "forbidden candidate should not queue"
  });
  assert.equal(blockedRefill.ok, true);
  const blockedSummary = await blockedOnly.summarize();
  assert.equal(blockedSummary.currentPhase, "blocked");
  assert.equal(blockedSummary.authorityClass, "block_and_record");
  assert.equal(blockedSummary.authorityStopReason, "forbidden");
  assert.equal(blockedSummary.operatorAttentionRequired, true);
  assert.equal(blockedSummary.stateCounts.blockedCandidates, 1);
  assert.equal(blockedSummary.rawStateLabels.includes("candidate:blocked"), true);

  clock.advanceMs(60_001);
  const staleSummary = await adapter.summarize();
  assert.equal(staleSummary.freshness, "stale");
  assert.equal(staleSummary.evidenceFreshness, "stale");
  assert.equal(staleSummary.operatorAttentionRequired, true);
  assert.equal(staleSummary.attentionReason, "dispatcher_summary_stale");
  assert.equal(staleSummary.rawStateLabels.includes("freshness:stale"), true);
});

test("summary projection marks corrupt or future progress timestamps unknown", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const clock = lifecycle.createManualClock("2026-06-30T00:00:00.000Z");
  const summary = buildManagerExecutionLaneSummary({
    runId: "run-1",
    clock,
    events: [{
      eventId: "event-bad",
      eventName: "dispatcher.work.queued",
      occurredAt: "not-a-date",
      evidenceRefs: ["evidence-bad"]
    }]
  });

  assert.equal(summary.freshness, "unknown");
  assert.equal(summary.unknownReason, "invalid_or_future_dispatcher_progress_timestamp");
  assert.equal(summary.operatorAttentionRequired, true);
  assert.equal(summary.blockers.includes("dispatcher_progress_timestamp_invalid"), true);
  assert.deepEqual(summary.feedbackRoutes, []);
  assert.deepEqual(summary.affectedDeliveryGates, []);
  assert.equal(summary.feedbackRecordPolicy, "metadata_only_feedback_record");
  assert.equal(summary.feedbackUnrelatedLanePolicy, "continue_unrelated_safe_lanes");
  assert.equal(summary.feedbackRetention, "metadata_only");
  assert.equal(summary.feedbackRawPayloadRetained, false);
});

test("memory dispatcher adapter rejects invalid lease TTLs before claim", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  assert.throws(
    () =>
      createMemoryDispatcherAdapter({
        lifecycle,
        clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
        leaseTtlMs: 0
      }),
    /positive leaseTtlMs/
  );
});

test("bounded summary JSON filters injected raw fields and preserves proof metadata", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");
  const result = await runBackendProofHarness({
    lifecycle,
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    candidates: [fixture.candidate],
    workerId: "worker-1"
  });
  const bounded = toManagerSummaryJson({
    ok: true,
    status: "completed",
    summary: {
      ...result.summary,
      rawWorkerTranscript: "must not leak",
      providerPayload: { secret: "must not leak" }
    },
    blockers: [],
    warnings: result.summary.warnings,
    next_actions: [result.summary.nextAction]
  });

  assert.equal("rawWorkerTranscript" in bounded.summary, false);
  assert.equal("providerPayload" in bounded.summary, false);
  assert.deepEqual(bounded.summary.feedbackRoutes, []);
  assert.deepEqual(bounded.summary.affectedDeliveryGates, []);
  assert.equal(bounded.summary.feedbackRecordPolicy, "metadata_only_feedback_record");
  assert.equal(bounded.summary.feedbackUnrelatedLanePolicy, "continue_unrelated_safe_lanes");
  assert.equal(bounded.summary.feedbackRetention, "metadata_only");
  assert.equal(bounded.summary.feedbackRawPayloadRetained, false);
  assert.equal(bounded.proof.metadata_only, true);
  assert.equal(bounded.proof.raw_payload_retained, false);
  assert.equal(bounded.proof.evidence_links.length > 0, true);
  assert.equal(bounded.proof.evidence_links.some((link) => link.verificationCommandId === "manager-dispatcher-port-test"), true);
});

test("pipeline manager execution lane adapter consumes only projected summaries", async () => {
  const adapterSource = await readFile(
    new URL("../apps/dashboard/src/lib/pipeline/manager-execution-lane-summary.ts", import.meta.url),
    "utf8"
  );

  assert.match(adapterSource, /ManagerExecutionLaneSummary/);
  assert.doesNotMatch(
    adapterSource,
    /scripts\/lib|memory-dispatcher-adapter|workflow-core|tmux\s+send|tmux\s+capture|from\s+["'][^"']*tmux|gh\s+|github\s+api|providerPayload|provider payload|rawPrompt|rawEvidence|rawWorker|transcript/i
  );
  assert.match(adapterSource, /rawStateLabels/);
  assert.match(adapterSource, /operatorAttentionRequired/);
});

test("backend proof rejects false live worker execution claims before execution", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("false-worker-execution-claim.json");
  const result = await runBackendProofHarness({
    lifecycle,
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    candidates: [fixture.candidate],
    workerId: "worker-1",
    claimLiveWorkerExecution: true
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.blockers.includes("backend_proof_forbids_real_codex_worker_launch"), true);
  assert.equal(result.proof.boundary.result, "blocked");
  assert.equal(result.proof.boundary.forbidden.includes("real_codex_worker_launch"), true);
  assert.equal(result.proof.boundary.evidence_refs.includes("backend-proof-live-worker-claim"), true);
});

test("backend proof code does not use live side-effect transports or direct system clock calls", async () => {
  for (const target of [adapterPath, harnessPath, summaryJsonPath]) {
    const source = await readFile(target, "utf8");
    assert.doesNotMatch(source, /Date\s*\.\s*now\s*\(/, `${target.pathname} uses Date.now`);
    assert.doesNotMatch(source, /node:child_process|spawnSync|execSync|tmux|gh\s|GITHUB_|OPENAI_API_KEY|BullMQ|Redis|Hatchet|SQLite|sqlite/i);
  }
});
