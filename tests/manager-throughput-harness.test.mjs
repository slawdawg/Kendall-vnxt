import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyThroughputWorker,
  parseHarnessArgs,
  runThroughputHarness,
  THROUGHPUT_LIFECYCLE_STATES,
  THROUGHPUT_STOP_LINES,
} from "../scripts/manager-throughput-harness.mjs";
import {
  classifyManagerWorkerLifecycle,
  MANAGER_WORKER_LIFECYCLE_STATES,
} from "../scripts/lib/manager-control-plane/core.mjs";

test("six fake workers reach ten clean cycles through dispatcher pull and refill", () => {
  const packet = runThroughputHarness({ workers: 6, cycles: 10 });

  assert.equal(packet.ok, true);
  assert.equal(packet.status, "stable");
  assert.equal(packet.summary.workerCount, 6);
  assert.equal(packet.summary.stableWorkerCount, 6);
  assert.equal(packet.summary.allWorkersReachedTarget, true);
  assert.equal(packet.summary.dispatcher.duplicateLeaseCount, 0);
  assert(packet.summary.dispatcher.refillJobCount > 0);
  const leasedWorkItems = packet.summary.dispatcher.leaseHistory.map((lease) => lease.workItemId);
  assert.equal(new Set(leasedWorkItems).size, leasedWorkItems.length);
  assert.deepEqual(packet.summary.stopLines, THROUGHPUT_STOP_LINES);
  assert.equal(packet.summary.rawPayloadRetained, false);
  assert.deepEqual(packet.summary.sideEffects, []);
  assert(packet.summary.workers.every((worker) => worker.cleanCycles === 10));
  assert(packet.summary.workers.every((worker) => worker.lifecycleState === "valid_idle_completed"));
});

test("dispatcher refill lock prevents duplicate refill jobs and duplicate leases", () => {
  const packet = runThroughputHarness({
    workers: 6,
    cycles: 3,
    initialQueueDepth: 0,
    lowWatermark: 2,
    highWatermark: 6,
    injectStaleNoop: false,
  });

  assert.equal(packet.status, "stable");
  assert.equal(packet.summary.dispatcher.duplicateLeaseCount, 0);
  assert(packet.summary.dispatcher.refillJobs.length >= 1);
  assert(packet.summary.dispatcher.refillJobs.every((job) => job.lock === "dispatcher-refill-lock"));
  assert(packet.summary.dispatcher.refillingResponses >= 1);
});

test("repeated empty polling starts one active refill and reports waiting workers", () => {
  const packet = runThroughputHarness({
    workers: 6,
    cycles: 3,
    initialQueueDepth: 0,
    lowWatermark: 2,
    highWatermark: 6,
    injectStaleNoop: false,
  });

  assert.equal(packet.status, "stable");
  assert.equal(packet.summary.dispatcher.refillingResponses, 6);
  assert.equal(packet.summary.dispatcher.refillJobs[0].reason, "empty_queue");
  assert.equal(packet.summary.dispatcher.refillJobs[0].lock, "dispatcher-refill-lock");
  assert.equal(packet.summary.dispatcher.duplicateLeaseCount, 0);
});

test("duplicate lease evidence fails closed even when cycle counts reach target", () => {
  const packet = runThroughputHarness({
    workers: 2,
    cycles: 1,
    injectDuplicateLeaseEvidence: true,
  });

  assert.equal(packet.ok, false);
  assert.equal(packet.status, "blocked");
  assert.equal(packet.summary.dispatcher.duplicateLeaseCount, 1);
  assert(packet.blockers.some((blocker) => blocker.code === "duplicate-dispatcher-lease"));
});

test("prompt-idle workers terminate in recovery after bounded pointer and progress attempts", () => {
  const packet = runThroughputHarness({
    workers: 2,
    cycles: 2,
    promptIdleWorkers: ["codex-1"],
  });

  const stalled = packet.summary.workers.find((worker) => worker.workerId === "codex-1");
  assert.equal(packet.ok, false);
  assert.equal(packet.status, "attention");
  assert.equal(stalled.lifecycleState, "recovery_required");
  assert.equal(stalled.pointerSubmitAttempts, 1);
  assert.equal(stalled.progressSignalAttempts, 1);
  assert(packet.blockers.some((blocker) => blocker.code === "worker-recovery-required"));
});

test("unknown prompt-idle workers and unknown gate states fail before a false stable run", () => {
  assert.throws(() => runThroughputHarness({ workers: 2, promptIdleWorkers: ["codex-9"] }), /unknown prompt-idle worker/);
  assert.throws(() => runThroughputHarness({ usageState: "maybe-paused" }), /unknown usageState/);
  assert.throws(() => runThroughputHarness({ resourceState: "hot" }), /unknown resourceState/);
  assert.throws(() => runThroughputHarness({ dispatcherState: "mystery" }), /unknown dispatcherState/);
});

test("usage pause preserves worker truth and blocks new dispatch without deleting evidence", () => {
  const packet = runThroughputHarness({
    workers: 2,
    cycles: 2,
    usageState: "manager_only",
    preloadActiveWork: true,
  });

  assert.equal(packet.ok, false);
  assert.equal(packet.status, "paused");
  assert.equal(packet.summary.pausedWorkerCount, 2);
  assert.equal(packet.summary.dispatcher.pausedResponses, 0);
  assert(packet.summary.workers.every((worker) => worker.lifecycleState === "paused_usage"));
  assert(packet.summary.workers.every((worker) => worker.currentWorkItem));
  assert(packet.warnings.some((warning) => warning.code === "dispatch-paused"));
});

test("usage and resource pauses stop new dispatcher leases without erasing evidence", () => {
  const usagePacket = runThroughputHarness({
    workers: 2,
    cycles: 2,
    usageState: "manager_only",
  });
  assert.equal(usagePacket.status, "paused");
  assert.equal(usagePacket.summary.dispatcher.leaseCount, 0);
  assert(usagePacket.summary.dispatcher.pausedResponses > 0);
  assert(usagePacket.summary.workers.every((worker) => worker.lifecycleState === "paused_usage"));
  assert.deepEqual(usagePacket.summary.sideEffects, []);

  const resourcePacket = runThroughputHarness({
    workers: 2,
    cycles: 2,
    resourceState: "pressured",
  });
  assert.equal(resourcePacket.status, "paused");
  assert.equal(resourcePacket.summary.dispatcher.leaseCount, 0);
  assert(resourcePacket.summary.dispatcher.pausedResponses > 0);
  assert(resourcePacket.summary.workers.every((worker) => worker.lifecycleState === "paused_resources"));
  assert.deepEqual(resourcePacket.summary.sideEffects, []);
});

test("blocked and empty dispatcher states surface blocked lifecycle evidence", () => {
  const blockedPacket = runThroughputHarness({
    workers: 2,
    cycles: 2,
    dispatcherState: "blocked",
  });
  assert.equal(blockedPacket.status, "blocked");
  assert(blockedPacket.summary.dispatcher.blockedResponses > 0);
  assert.equal(blockedPacket.summary.dispatcher.leaseCount, 0);
  assert(blockedPacket.summary.workers.every((worker) => worker.lifecycleState === "blocked_gated"));

  const emptyPacket = runThroughputHarness({
    workers: 2,
    cycles: 2,
    initialQueueDepth: 0,
    sourceRemaining: 0,
    injectStaleNoop: false,
  });
  assert.equal(emptyPacket.status, "blocked");
  assert(emptyPacket.summary.dispatcher.emptyResponses > 0);
  assert(emptyPacket.summary.workers.every((worker) => worker.lifecycleState === "blocked_gated"));
});

test("stale selected actions are recorded as no-op evidence while the loop continues", () => {
  const packet = runThroughputHarness({ workers: 3, cycles: 2, injectStaleNoop: true });

  assert.equal(packet.status, "stable");
  assert.equal(packet.summary.staleNoopActions.length, 1);
  assert.equal(packet.summary.staleNoopActions[0].result, "stale_noop");
  assert(packet.summary.staleNoopActions[0].afterQueueDepth > packet.summary.staleNoopActions[0].beforeQueueDepth);
  assert.equal(packet.summary.dispatcher.refillJobs[0].reason, "stale_apply_gap");
  assert.equal(packet.summary.staleNoopActions[0].nextAction, "continue_loop");
});

test("classifier exposes the shared lifecycle vocabulary and bounded metadata", () => {
  const row = classifyThroughputWorker(
    {
      workerId: "codex-1",
      currentWorkItem: "safe-work-1",
      cleanCycles: 0,
      pointerSubmitAttempts: 0,
      progressSignalAttempts: 0,
      retryCount: 0,
    },
    { cycle: 3, requiredCycles: 10 },
  );

  assert(THROUGHPUT_LIFECYCLE_STATES.includes(row.state));
  assert.deepEqual(THROUGHPUT_LIFECYCLE_STATES, MANAGER_WORKER_LIFECYCLE_STATES);
  assert.equal(row.state, "busy");
  assert.equal(row.evidenceSource, "deterministic-throughput-harness");
  assert.equal(row.nextAllowedAction, "continue_worker_cycle");
  assert.equal(row.retryCount, 0);
  assert.match(row.stopLine, /manager-pushed handoff/);

  const shared = classifyManagerWorkerLifecycle(
    {
      workerId: "codex-1",
      currentWorkItem: "safe-work-1",
      cleanCycles: 0,
      pointerSubmitAttempts: 0,
      progressSignalAttempts: 0,
      retryCount: 0,
    },
    { cycle: 3, requiredCycles: 10 },
  );
  assert.equal(row.state, shared.state);
  assert.equal(row.nextAllowedAction, shared.nextAllowedAction);
});

test("CLI options require strict integer values", () => {
  assert.throws(() => parseHarnessArgs(["--workers=6x"]), /--workers must be an integer/);
  assert.throws(() => parseHarnessArgs(["--cycles=10foo"]), /--cycles must be an integer/);
  assert.equal(parseHarnessArgs(["--workers=6", "--cycles=10"]).workers, 6);
});
