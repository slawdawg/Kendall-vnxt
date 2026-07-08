import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  parseLiveWorkerProofArgs,
  runLiveWorkerProof,
} from "../scripts/manager-live-worker-proof.mjs";
import {
  buildThroughputProof,
  parseHarnessArgs,
  runManagerThroughputHarness,
  runThroughputHarness,
} from "../scripts/manager-throughput-harness.mjs";
import {
  buildLiveWorkerProofReadiness,
  managerRunPaths,
} from "../scripts/lib/manager-control-plane/core.mjs";

function tempStateRoot(prefix = "manager-live-worker-proof-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

function readyWorkerRecords(runId, state = "warm", overrides = {}) {
  return Array.from({ length: 6 }, (_, index) => {
    const workerId = `codex-${index + 1}`;
    return {
      workerId,
      owner: `${runId}/${workerId}`,
      runId,
      sessionName: workerId,
      state,
      lastHeartbeatAt: "2026-07-01T00:00:00.000Z",
      lastPreflight: { status: "passed", source: "manager-worker-preflight" },
      ...overrides,
    };
  });
}

const readyContext = {
  now: "2026-07-01T00:05:00.000Z",
  assignmentSummary: { summary: { backlogStatusCounts: { assignable: 6 }, laneAssignmentStatusCounts: { active: 0 } } },
  dispatchPreview: { summary: { counts: { dispatchable: 6, active: 0 }, candidateStateCounts: { assignable: 6, active: 0 } } },
  refillPlan: { summary: { safeWorkSupply: 6, candidateLanes: [{ candidateId: "slice-1" }], sourceWorkEligibility: { eligibleCount: 6, blockedCount: 0 } } },
  usageContext: { status: "normal", summary: { state: "normal" } },
  resourceContext: { status: "normal", summary: { state: "normal" } },
  tmuxSummary: { unmanagedPanes: 0, takeoverRequiredPanes: 0, managerOwnedPanes: 6 },
};

test("throughput harness writes compact live-readiness proof under manager run state", () => {
  const stateRoot = tempStateRoot();
  try {
    const { result } = runManagerThroughputHarness([
      "--workers",
      "6",
      "--cycles",
      "10",
      "--run-id",
      "manager-live-proof",
      "--state-root",
      stateRoot,
      "--write-proof",
      "--summary-json",
    ]);
    const paths = managerRunPaths("manager-live-proof", { stateRoot });
    assert.equal(result.ok, true);
    assert.equal(result.summary.proof?.written, true);
    assert.equal(result.summary.proof?.path, paths.throughputProof);
    assert.equal(existsSync(paths.throughputProof), true);

    const proof = JSON.parse(readFileSync(paths.throughputProof, "utf8"));
    assert.equal(proof.kind, "manager-throughput-proof");
    assert.equal(proof.runId, "manager-live-proof");
    assert.equal(proof.rawPayloadRetained, false);
    assert.equal(proof.sideEffects.length, 0);
    assert.equal(proof.twoWorkerProof.status, "passed");
    assert.equal(proof.twoWorkerProof.source, "six-worker-throughput-superset");
    assert.equal(proof.sixWorkerProof.status, "passed");
    assert.equal(proof.sixWorkerProof.workerCount, 6);
    assert.equal(proof.sixWorkerProof.cleanCyclesPerWorker, 10);
    assert.equal(proof.dispatcher.duplicateLeaseCount, 0);
    assert(proof.dispatcher.refillJobCount > 0);
    assert.deepEqual(proof.sourceCommand, "node ./scripts/manager-throughput-harness.mjs --workers 6 --cycles 10 --write-proof --summary-json");
    assert.equal(proof.lifecycleEvidence, undefined);
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("throughput proof write targets the latest active manager run when run id is omitted", () => {
  const stateRoot = tempStateRoot();
  try {
    const activeRunId = "manager-live-proof-active";
    const activePaths = managerRunPaths(activeRunId, { stateRoot });
    mkdirSync(activePaths.root, { recursive: true });
    writeFileSync(activePaths.mission, `${JSON.stringify({ runId: activeRunId, status: "active" })}\n`);

    const { result } = runManagerThroughputHarness([
      "--workers",
      "6",
      "--cycles",
      "10",
      "--state-root",
      stateRoot,
      "--write-proof",
      "--summary-json",
    ]);

    assert.equal(result.ok, true);
    assert.equal(result.summary.proof?.runId, activeRunId);
    assert.equal(result.summary.proof?.path, activePaths.throughputProof);
    assert.equal(existsSync(activePaths.throughputProof), true);
    const proof = JSON.parse(readFileSync(activePaths.throughputProof, "utf8"));
    assert.equal(proof.runId, activeRunId);
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("throughput proof write blocks unsafe workspace state roots before creating files", () => {
  const unsafeStateRoot = join(process.cwd(), "manager-throughput-proof-unsafe-state");
  try {
    const { result } = runManagerThroughputHarness([
      "--workers",
      "6",
      "--cycles",
      "10",
      "--state-root",
      unsafeStateRoot,
      "--write-proof",
      "--summary-json",
    ]);

    assert.equal(result.status, "blocked");
    assert.equal(result.summary.proof?.written, false);
    assert.ok(result.blockers.some((blocker) => blocker.code === "workspace-state-unsafe"));
    assert.equal(existsSync(unsafeStateRoot), false);
  } finally {
    rmSync(unsafeStateRoot, { recursive: true, force: true });
  }
});

test("throughput proof requires explicit raw-payload retention evidence", () => {
  const proof = buildThroughputProof({
    ok: true,
    status: "stable",
    summary: {
      harness: "manager-throughput",
      workerCount: 6,
      requiredCycles: 10,
      stableWorkerCount: 6,
      allWorkersReachedTarget: true,
      dispatcher: { duplicateLeaseCount: 0, refillJobCount: 1, leaseCount: 60 },
      sideEffects: [],
    },
  }, { runId: "manager-live-proof", createdAt: "2026-07-01T00:00:00.000Z" });

  assert.equal(proof.status, "failed");
  assert.equal(proof.rawPayloadRetained, true);
});

test("live worker proof readiness is ready when proof, workers, posture, and receipt safeguards pass", () => {
  const stateRoot = tempStateRoot();
  const runId = "manager-live-proof";
  try {
    runManagerThroughputHarness(["--run-id", runId, "--state-root", stateRoot, "--write-proof", "--summary-json"], readyContext);

    const packet = buildLiveWorkerProofReadiness(
      { runId, stateRoot, desiredWorkers: 6 },
      { ...readyContext, workerRecords: readyWorkerRecords(runId) },
    );

    assert.equal(packet.ok, true);
    assert.equal(packet.status, "ready");
    assert.equal(packet.summary.mutation, "none");
    assert.equal(packet.summary.authorityStage, "live_worker_readiness");
    assert.equal(packet.summary.throughputProof.status, "passed");
    assert.equal(packet.summary.throughputProof.authorityStage, "backend_proof");
    for (const requiredStopLine of ["fake adapters only", "no live tmux inspection", "no provider usage", "metadata-only evidence"]) {
      assert(packet.summary.throughputProof.stopLines.includes(requiredStopLine));
    }
    assert.equal(packet.summary.workerReadiness.readyWorkerCount, 6);
    assert.equal(packet.summary.nextWorkPolicy.primary, "dispatcher_lease_pull");
    assert.equal(packet.summary.handoffTransport.literalSafe, true);
    assert.equal(packet.summary.receiptVerification.required, true);
    assert.equal(packet.summary.rawPayloadRetained, false);
    assert(packet.nextActions.some((action) => action.code === "start-live-worker-proof"));
    assert.match(packet.summary.nextLiveDogfoodCommand, /manager-run-loop/);
    assert.match(packet.summary.nextLiveDogfoodCommand, /--max-iterations 10/);
    assert.match(packet.summary.nextStabilityObserverCommand, /manager-worker-clean-cycle-observer/);
    assert.match(packet.summary.nextStabilityObserverCommand, /--required-cycles 10/);
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("live worker proof blocks missing, malformed, failed, and insufficient proof", () => {
  const stateRoot = tempStateRoot();
  const runId = "manager-live-proof";
  try {
    const missing = buildLiveWorkerProofReadiness(
      { runId, stateRoot },
      { ...readyContext, workerRecords: readyWorkerRecords(runId) },
    );
    assert.equal(missing.ok, false);
    assert.equal(missing.status, "blocked");
    assert(missing.blockers.some((blocker) => blocker.code === "throughput-proof-missing"));

    const paths = managerRunPaths(runId, { stateRoot });
    mkdirSync(paths.root, { recursive: true });
    writeFileSync(paths.throughputProof, "{not json");
    const malformed = buildLiveWorkerProofReadiness(
      { runId, stateRoot },
      { ...readyContext, workerRecords: readyWorkerRecords(runId) },
    );
    assert(malformed.blockers.some((blocker) => blocker.code === "throughput-proof-malformed"));

    writeFileSync(paths.throughputProof, `${JSON.stringify({ kind: "manager-throughput-proof", status: "failed" })}\n`);
    const failed = buildLiveWorkerProofReadiness(
      { runId, stateRoot },
      { ...readyContext, workerRecords: readyWorkerRecords(runId) },
    );
    assert(failed.blockers.some((blocker) => blocker.code === "throughput-proof-failed"));

    writeFileSync(
      paths.throughputProof,
      `${JSON.stringify({
        kind: "manager-throughput-proof",
        runId,
        createdAt: "2026-07-01T00:00:00.000Z",
        authorityStage: "backend_proof",
        sourceCommand: "node ./scripts/manager-throughput-harness.mjs --workers 6 --cycles 10 --write-proof --summary-json",
        status: "passed",
        twoWorkerProof: { status: "passed", workerCount: 2, cleanCyclesPerWorker: 10 },
        sixWorkerProof: { status: "passed", workerCount: 5, cleanCyclesPerWorker: 10 },
        rawPayloadRetained: false,
        sideEffects: [],
        stopLines: ["fake adapters only", "no live tmux inspection", "no provider usage", "metadata-only evidence"],
        dispatcher: { duplicateLeaseCount: 0, refillJobCount: 1, leaseCount: 60 },
      })}\n`,
    );
    const insufficient = buildLiveWorkerProofReadiness(
      { runId, stateRoot },
      { ...readyContext, workerRecords: readyWorkerRecords(runId) },
    );
    assert(insufficient.blockers.some((blocker) => blocker.code === "throughput-proof-insufficient"));

    writeFileSync(
      paths.throughputProof,
      `${JSON.stringify({
        kind: "manager-throughput-proof",
        runId: "other-run",
        createdAt: "2000-01-01T00:00:00.000Z",
        authorityStage: "backend_proof",
        sourceCommand: "node ./scripts/manager-throughput-harness.mjs --workers 6 --cycles 10 --write-proof --summary-json",
        status: "passed",
        twoWorkerProof: { status: "passed", workerCount: 2, cleanCyclesPerWorker: 10 },
        sixWorkerProof: { status: "passed", workerCount: 6, cleanCyclesPerWorker: 10 },
        rawPayloadRetained: false,
        sideEffects: [],
        stopLines: ["fake adapters only", "no live tmux inspection", "no provider usage", "metadata-only evidence"],
        dispatcher: { duplicateLeaseCount: 0, refillJobCount: 1, leaseCount: 60 },
      })}\n`,
    );
    const stale = buildLiveWorkerProofReadiness(
      { runId, stateRoot },
      { ...readyContext, workerRecords: readyWorkerRecords(runId), now: "2026-07-01T00:00:00.000Z" },
    );
    assert(stale.blockers.some((blocker) => blocker.code === "throughput-proof-stale"));
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("live worker proof requires throughput source, stop-line, and lease-count evidence", () => {
  const stateRoot = tempStateRoot();
  const runId = "manager-live-proof";
  try {
    const paths = managerRunPaths(runId, { stateRoot });
    mkdirSync(paths.root, { recursive: true });
    writeFileSync(
      paths.throughputProof,
      `${JSON.stringify({
        kind: "manager-throughput-proof",
        runId,
        createdAt: "2026-07-01T00:00:00.000Z",
        authorityStage: "backend_proof",
        sourceCommand: "",
        status: "passed",
        twoWorkerProof: { status: "passed", workerCount: 2, cleanCyclesPerWorker: 10 },
        sixWorkerProof: { status: "passed", workerCount: 6, cleanCyclesPerWorker: 10 },
        rawPayloadRetained: false,
        sideEffects: [],
        stopLines: ["fake adapters only", "no live tmux inspection", "no provider usage"],
        dispatcher: { duplicateLeaseCount: 0, refillJobCount: 1, leaseCount: 59 },
      })}\n`,
    );

    const packet = buildLiveWorkerProofReadiness(
      { runId, stateRoot },
      { ...readyContext, workerRecords: readyWorkerRecords(runId) },
    );

    assert(packet.blockers.some((blocker) => blocker.code === "throughput-proof-insufficient"));
    assert.match(packet.summary.throughputProof.sourceCommand, /^$/);
    assert.equal(packet.summary.throughputProof.dispatcher.leaseCount, 59);
    assert.deepEqual(packet.summary.throughputProof.stopLines, ["fake adapters only", "no live tmux inspection", "no provider usage"]);
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("live worker proof pauses or blocks unsafe usage, resources, tmux, ownership, and next-work policy", () => {
  const stateRoot = tempStateRoot();
  const runId = "manager-live-proof";
  try {
    runManagerThroughputHarness(["--run-id", runId, "--state-root", stateRoot, "--write-proof", "--summary-json"], readyContext);

    const usagePaused = buildLiveWorkerProofReadiness(
      { runId, stateRoot },
      { ...readyContext, usageContext: { status: "manager_only" }, workerRecords: readyWorkerRecords(runId) },
    );
    assert.equal(usagePaused.status, "paused");
    assert(usagePaused.blockers.some((blocker) => blocker.code === "usage-not-normal"));

    const resourceBlocked = buildLiveWorkerProofReadiness(
      { runId, stateRoot },
      { ...readyContext, resourceContext: { status: "critical" }, workerRecords: readyWorkerRecords(runId) },
    );
    assert.equal(resourceBlocked.status, "blocked");
    assert(resourceBlocked.blockers.some((blocker) => blocker.code === "resource-not-normal"));

    const tmuxBlocked = buildLiveWorkerProofReadiness(
      { runId, stateRoot },
      {
        ...readyContext,
        tmuxSummary: { unmanagedPanes: 1, takeoverRequiredPanes: 0 },
        workerRecords: readyWorkerRecords(runId),
      },
    );
    assert(tmuxBlocked.blockers.some((blocker) => blocker.code === "tmux-orientation-blocked"));

    const ownershipBlocked = buildLiveWorkerProofReadiness(
      { runId, stateRoot },
      { ...readyContext, workerRecords: readyWorkerRecords("other-run") },
    );
    assert(ownershipBlocked.blockers.some((blocker) => blocker.code === "manager-owned-workers-not-ready"));

    const activeBusyBlocked = buildLiveWorkerProofReadiness(
      { runId, stateRoot },
      { ...readyContext, workerRecords: readyWorkerRecords(runId, "active") },
    );
    assert(activeBusyBlocked.blockers.some((blocker) => blocker.code === "manager-owned-workers-not-ready"));

    const staleHeartbeatBlocked = buildLiveWorkerProofReadiness(
      { runId, stateRoot },
      { ...readyContext, workerRecords: readyWorkerRecords(runId, "warm", { lastHeartbeatAt: "2026-07-01T00:00:00.000Z" }), now: "2026-07-01T00:30:00.000Z" },
    );
    assert(staleHeartbeatBlocked.blockers.some((blocker) => blocker.code === "manager-owned-workers-not-ready"));

    const missingPreflightBlocked = buildLiveWorkerProofReadiness(
      { runId, stateRoot },
      { ...readyContext, workerRecords: readyWorkerRecords(runId, "warm", { lastPreflight: { status: "unknown" } }) },
    );
    assert(missingPreflightBlocked.blockers.some((blocker) => blocker.code === "manager-owned-workers-not-ready"));

    const policyBlocked = buildLiveWorkerProofReadiness(
      { runId, stateRoot, nextWorkPolicyOverride: { primary: "manager_pushed_handoff", fallback: "durable_handoff_pointer" } },
      { ...readyContext, workerRecords: readyWorkerRecords(runId) },
    );
    assert(policyBlocked.blockers.some((blocker) => blocker.code === "next-work-policy-not-dispatcher-pull"));
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("live worker proof CLI args are strict and summary-json compatible", () => {
  assert.equal(parseLiveWorkerProofArgs(["--run-id", "manager-live-proof", "--desired-workers", "6"]).desiredWorkers, 6);
  assert.throws(() => parseLiveWorkerProofArgs(["--desired-workers=6x"]), /--desired-workers must be an integer/);
  assert.equal(parseHarnessArgs(["--write-proof"]).writeProof, true);

  const stable = runThroughputHarness({ workers: 6, cycles: 10 });
  assert.equal(stable.ok, true);

  const packet = runLiveWorkerProof(["--run-id", "missing-proof", "--state-root", tempStateRoot(), "--summary-json"]).result;
  assert.equal(packet.ok, false);
  assert.equal(packet.status, "blocked");

  const zeroDesired = buildLiveWorkerProofReadiness(
    { runId: "zero-workers", stateRoot: tempStateRoot(), desiredWorkers: 0 },
    readyContext,
  );
  assert(zeroDesired.blockers.some((blocker) => blocker.code === "desired-workers-invalid"));
});
