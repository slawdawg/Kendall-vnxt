import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLaneAdvancementPlan,
  buildWorkerProgressStatus,
} from "../scripts/lib/manager-control-plane/core.mjs";

function workerStatus() {
  return {
    summary: {
      workers: [
        {
          workerId: "codex-1",
          owner: "manager-test/codex-1",
          runId: "manager-test",
          sessionName: "codex-1",
          state: "active",
          assignmentId: "lane-1",
          taskId: "task-1",
          recoveryState: "handoff_sent",
          lastHeartbeatAt: "2026-06-29T00:00:00.000Z",
        },
      ],
    },
  };
}

function assignmentSummary() {
  return {
    summary: {
      laneAssignments: [
        {
          assignmentId: "lane-1",
          taskId: "task-1",
          owner: "manager-runner",
          branch: "codex/lane-1",
          phase: "in_progress",
          heartbeat: "2026-06-29T00:00:00.000Z",
        },
      ],
    },
  };
}

function finalCheckpoint(overrides = {}, checkpointOverrides = {}) {
  return {
    checkpointId: "final-lane-1",
    actor: "codex-1",
    timestamp: "2026-06-29T00:05:00.000Z",
    kind: "worker_final_checkpoint",
    summary: "Implemented and verified. Ready for manager review.",
    sourceRefs: ["assignment:lane-1"],
    ...checkpointOverrides,
    finalCheckpoint: {
      workerId: "codex-1",
      assignmentId: "lane-1",
      taskId: "task-1",
      branch: "codex/lane-1",
      diffSummary: "manager worker final checkpoint contract",
      deliveryState: "delivered",
      prState: "merged",
      prUrl: "https://github.com/slawdawg/Kendall-vnxt/pull/385",
      mergeState: "merged",
      cleanupState: "complete",
      verificationSummary: "focused manager tests passed",
      reviewSummary: "no unresolved review threads",
      openQuestions: 0,
      unresolvedReviewThreads: 0,
      dirtyWorktree: false,
      nextAssignmentReserved: false,
      requestedFinalState: "retired_clean_requested",
      recoveryPath: "resume from assignment lane-1 if needed",
      openBlockers: [],
      ...overrides,
    },
  };
}

function progressFor(checkpoints) {
  return buildWorkerProgressStatus(
    { runId: "manager-test", progressStaleMinutes: 10 },
    {
      now: "2026-06-29T00:06:00.000Z",
      workerStatus: workerStatus(),
      assignmentSummary: assignmentSummary(),
      checkpoints,
      questions: [],
      events: [],
    },
  );
}

test("worker progress accepts complete final checkpoint contract", () => {
  const progress = progressFor([finalCheckpoint()]);
  const row = progress.summary.workerProgress[0];

  assert.equal(progress.status, "ready");
  assert.equal(row.progressState, "final_checkpoint_ready");
  assert.equal(row.finalCheckpoint.status, "ready");
  assert.equal(row.finalCheckpoint.requestedFinalState, "retired_clean_requested");
  assert.equal(row.finalCheckpoint.handoffQuality, "complete");
  assert.deepEqual(row.finalCheckpoint.blockers, []);
  assert.equal(progress.summary.finalCheckpointCounts.ready, 1);
  assert.equal(progress.summary.finalCheckpointCounts.total, 1);
  assert.doesNotMatch(JSON.stringify(progress), /raw prompt|provider payload|reasoning trace|capture-pane/i);
});

test("worker progress reports missing PR state in final checkpoint", () => {
  const checkpoint = finalCheckpoint({ prState: "" });
  const progress = progressFor([checkpoint]);
  const row = progress.summary.workerProgress[0];

  assert.equal(progress.status, "attention");
  assert.equal(row.progressState, "final_checkpoint_blocked");
  assert.equal(row.finalCheckpoint.status, "incomplete");
  assert.ok(row.finalCheckpoint.missingFields.includes("prState"));
  assert.equal(row.finalCheckpoint.blockers[0].code, "no_final_checkpoint");
  assert.equal(progress.summary.finalCheckpointCounts.incomplete, 1);
});

test("worker progress reports missing cleanup state in final checkpoint", () => {
  const checkpoint = finalCheckpoint({ cleanupState: "" });
  const progress = progressFor([checkpoint]);
  const row = progress.summary.workerProgress[0];

  assert.equal(progress.status, "attention");
  assert.equal(row.progressState, "final_checkpoint_blocked");
  assert.equal(row.finalCheckpoint.status, "incomplete");
  assert.ok(row.finalCheckpoint.missingFields.includes("cleanupState"));
  assert.equal(progress.summary.finalCheckpointCounts.incomplete, 1);
});

test("worker progress reports blocked final checkpoint evidence", () => {
  const checkpoint = finalCheckpoint({
    requestedFinalState: "warm_available",
    openQuestions: 1,
    unresolvedReviewThreads: 2,
    dirtyWorktree: true,
  });
  const progress = progressFor([checkpoint]);
  const row = progress.summary.workerProgress[0];
  const blockerCodes = row.finalCheckpoint.blockers.map((blocker) => blocker.code);

  assert.equal(progress.status, "attention");
  assert.equal(row.progressState, "final_checkpoint_blocked");
  assert.equal(row.finalCheckpoint.status, "blocked");
  assert.ok(blockerCodes.includes("material_question_open"));
  assert.ok(blockerCodes.includes("review_threads_unresolved"));
  assert.ok(blockerCodes.includes("dirty_worktree"));
  assert.ok(blockerCodes.includes("blocked_state_mismatch"));
  assert.equal(progress.summary.finalCheckpointCounts.blocked, 1);
  assert.equal(progress.nextActions[0].code, "worker-progress-final_checkpoint_blocked");
});

test("worker progress blocks mismatched final checkpoint identity", () => {
  const progress = progressFor([finalCheckpoint({ workerId: "codex-other", assignmentId: "lane-other", taskId: "task-other" })]);
  const row = progress.summary.workerProgress[0];
  const blockerCodes = row.finalCheckpoint.blockers.map((blocker) => blocker.code);

  assert.equal(progress.status, "attention");
  assert.equal(row.progressState, "final_checkpoint_blocked");
  assert.equal(row.finalCheckpoint.status, "blocked");
  assert.ok(blockerCodes.includes("identity_ambiguous"));
});

test("worker progress blocks malformed open blocker evidence", () => {
  const progress = progressFor([finalCheckpoint({ openBlockers: null })]);
  const row = progress.summary.workerProgress[0];

  assert.equal(progress.status, "attention");
  assert.equal(row.progressState, "final_checkpoint_blocked");
  assert.equal(row.finalCheckpoint.status, "incomplete");
  assert.ok(row.finalCheckpoint.missingFields.includes("openBlockers"));
});

test("worker progress blocks non-final delivery state", () => {
  const progress = progressFor([finalCheckpoint({ prState: "open", mergeState: "not_merged" })]);
  const row = progress.summary.workerProgress[0];
  const blockerCodes = row.finalCheckpoint.blockers.map((blocker) => blocker.code);

  assert.equal(progress.status, "attention");
  assert.equal(row.progressState, "final_checkpoint_blocked");
  assert.equal(row.finalCheckpoint.status, "blocked");
  assert.ok(blockerCodes.includes("pr_checks_pending"));
});

test("worker progress uses latest final checkpoint by timestamp", () => {
  const progress = progressFor([
    finalCheckpoint({ prState: "open" }, { timestamp: "2026-06-29T00:04:00.000Z" }),
    finalCheckpoint({ prState: "merged" }, { timestamp: "2026-06-29T00:05:00.000Z" }),
  ]);
  const row = progress.summary.workerProgress[0];

  assert.equal(progress.status, "ready");
  assert.equal(row.progressState, "final_checkpoint_ready");
  assert.equal(row.finalCheckpoint.status, "ready");
  assert.equal(row.finalCheckpoint.checkpoint.prState, "merged");
});

test("worker progress keeps live blockers ahead of ready final checkpoint", () => {
  const progress = buildWorkerProgressStatus(
    { runId: "manager-test", progressStaleMinutes: 10 },
    {
      now: "2026-06-29T00:06:00.000Z",
      workerStatus: workerStatus(),
      assignmentSummary: assignmentSummary(),
      checkpoints: [finalCheckpoint()],
      questions: [
        { questionId: "q-lane-1", actor: "codex-1", summary: "question for lane-1", sourceRefs: ["assignment:lane-1"] },
      ],
      events: [],
    },
  );

  assert.equal(progress.status, "attention");
  assert.equal(progress.summary.workerProgress[0].progressState, "blocked_question");
  assert.equal(progress.summary.workerProgress[0].finalCheckpoint.status, "ready");
});

test("lane advancement requires ready final checkpoint state", () => {
  const blocked = buildLaneAdvancementPlan(
    { runId: "manager-test" },
    {
      workerStatus: workerStatus(),
      assignmentSummary: assignmentSummary(),
      checkpoints: [finalCheckpoint({ prState: "open" })],
    },
  );

  assert.equal(blocked.status, "ready");
  assert.equal(blocked.summary.readyLaneCount, 0);
});

test("lane advancement surfaces ready final checkpoint state", () => {
  const plan = buildLaneAdvancementPlan(
    { runId: "manager-test" },
    {
      workerStatus: workerStatus(),
      assignmentSummary: assignmentSummary(),
      checkpoints: [finalCheckpoint()],
    },
  );

  assert.equal(plan.status, "attention");
  assert.equal(plan.summary.readyLaneCount, 1);
  assert.equal(plan.summary.readyLanes[0].finalCheckpoint.status, "ready");
  assert.equal(plan.summary.readyLanes[0].finalCheckpoint.requestedFinalState, "retired_clean_requested");
  assert.equal(plan.summary.readyLanes[0].finalCheckpoint.mutation, "none");
});
