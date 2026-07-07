import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCyclePacket,
  buildWorkerStatus,
} from "../scripts/lib/manager-control-plane/core.mjs";

test("worker status emits read-only lifecycle projection counts", () => {
  const status = buildWorkerStatus(
    { runId: "manager-test", desiredWorkers: 1 },
    {
      workerRecords: [
        {
          workerId: "codex-1",
          owner: "manager-test/codex-1",
          runId: "manager-test",
          sessionName: "codex-1",
          state: "active",
          assignmentState: "active",
          assignmentId: "lane-active",
          taskId: "task-active",
          lastHeartbeatAt: "2026-06-29T00:00:00.000Z",
        },
        {
          workerId: "codex-2",
          owner: "manager-test/codex-2",
          runId: "manager-test",
          sessionName: "codex-2",
          state: "warm",
          assignmentState: "warm",
          lastHeartbeatAt: "2026-06-29T00:00:00.000Z",
        },
        {
          workerId: "codex-3",
          owner: "manager-test/codex-3",
          runId: "manager-test",
          sessionName: "codex-3",
          state: "warm",
          assignmentState: "closed",
          assignmentId: "lane-delivered",
          taskId: "task-delivered",
          lastHeartbeatAt: "2026-06-29T00:00:00.000Z",
        },
        {
          workerId: "codex-4",
          owner: "manager-test/codex-4",
          runId: "manager-test",
          sessionName: "codex-4",
          state: "active",
          assignmentState: "blocked",
          assignmentId: "lane-blocked",
          taskId: "task-blocked",
          lastHeartbeatAt: "2026-06-29T00:00:00.000Z",
        },
        {
          workerId: "codex-5",
          owner: "manager-test/codex-5",
          runId: "manager-test",
          sessionName: "codex-5",
          state: "retired_logical",
          lastHeartbeatAt: "2026-06-29T00:00:00.000Z",
        },
        {
          workerId: "codex-6",
          owner: "manager-test/codex-6",
          runId: "manager-test",
          sessionName: "codex-6",
          state: "retired",
        },
        {
          workerId: "codex-7",
          owner: "manager-test/codex-7",
          runId: "manager-test",
          sessionName: "codex-7",
          state: "abandoned",
          recoveryState: "safe_abandonment_no_roots",
        },
      ],
      assignmentSummary: { summary: { backlogStatusCounts: {}, laneAssignmentStatusCounts: {} } },
      usageContext: { status: "normal" },
      resourceContext: { status: "normal" },
      tmuxSummary: {
        available: true,
        paneCount: 4,
        managerOwnedPanes: 4,
        managerOwnedPaneEvidence: [
          { sessionName: "codex-1", classification: "manager-worker-owned" },
          { sessionName: "codex-2", classification: "manager-worker-owned" },
          { sessionName: "codex-3", classification: "manager-worker-owned" },
          { sessionName: "codex-4", classification: "manager-worker-owned" },
        ],
        unmanagedPanes: 0,
        takeoverRequiredPanes: 0,
      },
    },
  );

  assert.equal(status.summary.workerLifecycleProjection.mutation, "none; read-only worker lifecycle projection");
  assert.equal(status.summary.workerLifecycleProjection.rawPayloadRetained, false);
  assert.deepEqual(status.summary.workerLifecycleCounts, {
    active: 1,
    delivered: 1,
    cleanup_complete: 0,
    warm_available: 1,
    retirable: 0,
    retirement_blocked: 1,
    retired_logical: 1,
    retiring_physical: 0,
    retired: 1,
    abandoned: 1,
    total: 7,
  });
  assert.equal(status.summary.workerCounts.delivered, 1);
  assert.equal(status.summary.workerCounts.retirement_blocked, 1);
  assert.equal(status.summary.workerCounts.retired, 1);
  assert.equal(status.summary.workerLifecycleProjection.workers.find((worker) => worker.workerId === "codex-4").state, "retirement_blocked");
});

test("cycle packet carries worker lifecycle projection through workers summary", () => {
  const cycle = buildCyclePacket(
    { runId: "manager-test" },
    {
      workerStatus: {
        status: "ready",
        summary: {
          workerCounts: { active: 1, warm: 0, paused: 0, total: 1, retirable: 1, retirement_blocked: 0, retired: 0 },
          workerLifecycleCounts: {
            active: 0,
            delivered: 0,
            cleanup_complete: 0,
            warm_available: 0,
            retirable: 1,
            retirement_blocked: 0,
            retired_logical: 0,
            retiring_physical: 0,
            retired: 0,
            abandoned: 0,
            total: 1,
          },
          workerLifecycleProjection: {
            states: ["active", "retirable", "retirement_blocked", "retired"],
            counts: {
              active: 0,
              delivered: 0,
              cleanup_complete: 0,
              warm_available: 0,
              retirable: 1,
              retirement_blocked: 0,
              retired_logical: 0,
              retiring_physical: 0,
              retired: 0,
              abandoned: 0,
              total: 1,
            },
            workers: [{ workerId: "codex-1", state: "retirable", mutation: "none", rawPayloadRetained: false }],
            mutation: "none; read-only worker lifecycle projection",
            rawPayloadRetained: false,
          },
          workers: [],
          lifecyclePlan: { startWarmCandidates: [] },
        },
        blockers: [],
        warnings: [],
      },
      usageContext: { status: "normal" },
      resourceContext: { status: "normal" },
      preflightStatus: { status: "ready", summary: {}, blockers: [], warnings: [] },
      dispatchPreview: { status: "blocked", summary: { counts: { dispatchable: 0, active: 0 } }, blockers: [], warnings: [] },
      cleanupPlan: { status: "ready", summary: {}, blockers: [], warnings: [], nextActions: [] },
      resumeState: {
        status: "ready",
        summary: {
          ledger: { status: "ready" },
          schemaGaps: [],
          assignment: {
            blockedLaneAssignments: [],
            blockedWorkspaceAssignments: [],
          },
          takeoverInspection: null,
        },
        blockers: [],
        warnings: [],
      },
      recoveryPlan: { status: "ready", summary: {}, blockers: [], warnings: [] },
      workerProgressStatus: { status: "ready", summary: { workerProgress: [] }, blockers: [], warnings: [], nextActions: [] },
      laneAdvanceStatus: { status: "ready", summary: {}, blockers: [], warnings: [], nextActions: [] },
      deliveryPlan: { status: "ready", summary: {}, blockers: [], warnings: [], nextActions: [] },
    },
  );

  assert.equal(cycle.summary.workers.workerLifecycleCounts.retirable, 1);
  assert.equal(cycle.summary.workers.workerLifecycleProjection.mutation, "none; read-only worker lifecycle projection");
});

test("worker lifecycle projection prefers safety evidence over stale lifecycle hints", () => {
  const status = buildWorkerStatus(
    { runId: "manager-test", desiredWorkers: 1 },
    {
      workerRecords: [
        {
          workerId: "codex-explicit",
          owner: "unknown",
          runId: "manager-test",
          sessionName: "codex-explicit",
          state: "warm",
          lifecycleState: "active",
          lastHeartbeatAt: "2026-06-29T00:00:00.000Z",
        },
        {
          workerId: "codex-lease",
          owner: "manager-test/codex-lease",
          runId: "manager-test",
          sessionName: "codex-lease",
          state: "warm",
          assignmentState: "warm",
          currentLease: { assignmentId: "lane-live", taskId: "task-live", leaseId: "lease-live" },
          lastHeartbeatAt: "2026-06-29T00:00:00.000Z",
        },
        {
          workerId: "codex-dup",
          owner: "manager-test/codex-dup",
          runId: "manager-test",
          sessionName: "codex-dup-stale",
          state: "warm",
        },
        {
          workerId: "codex-dup",
          owner: "manager-test/codex-dup",
          runId: "manager-test",
          sessionName: "codex-dup-live",
          state: "warm",
          assignmentState: "warm",
          lastHeartbeatAt: "2026-06-29T00:00:00.000Z",
        },
        {
          workerId: "codex-not-blocked",
          owner: "manager-test/codex-not-blocked",
          runId: "manager-test",
          sessionName: "codex-not-blocked",
          state: "warm",
          assignmentState: "not_blocked",
          lastHeartbeatAt: "2026-06-29T00:00:00.000Z",
        },
      ],
      assignmentSummary: { summary: { backlogStatusCounts: {}, laneAssignmentStatusCounts: {} } },
      usageContext: { status: "normal" },
      resourceContext: { status: "normal" },
      tmuxSummary: {
        available: true,
        paneCount: 4,
        managerOwnedPanes: 4,
        managerOwnedPaneEvidence: [
          { sessionName: "codex-lease", classification: "manager-worker-owned" },
          { sessionName: "codex-dup-stale", classification: "manager-worker-owned" },
          { sessionName: "codex-dup-live", classification: "manager-worker-owned" },
          { sessionName: "codex-not-blocked", classification: "manager-worker-owned" },
        ],
        unmanagedPanes: 0,
        takeoverRequiredPanes: 0,
      },
    },
  );

  const workersBySession = new Map(
    status.summary.workerLifecycleProjection.workers.map((worker) => [worker.sessionName, worker]),
  );
  assert.equal(workersBySession.get("codex-explicit").state, "retirement_blocked");
  assert.equal(workersBySession.get("codex-explicit").reason, "unknown-owner");
  assert.equal(workersBySession.get("codex-lease").state, "active");
  assert.equal(workersBySession.get("codex-dup-live").state, "warm_available");
  assert.equal(workersBySession.get("codex-dup-stale").state, "retirement_blocked");
  assert.equal(workersBySession.get("codex-not-blocked").state, "warm_available");
});
