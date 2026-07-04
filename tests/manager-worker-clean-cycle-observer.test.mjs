import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildWorkerCleanCycleObserver,
  readLoopFailures,
  WORKER_CLEAN_CYCLE_STOP_LINES,
} from "../scripts/manager-worker-clean-cycle-observer.mjs";

const since = "2026-06-29T16:52:00.000Z";

function worker(workerId, assignmentId, overrides = {}) {
  return {
    workerId,
    sessionName: workerId,
    runId: "manager-test",
    state: "active",
    assignmentId,
    taskId: `task-${assignmentId}`,
    recoveryState: "handoff_sent",
    ...overrides,
  };
}

function checkpoints(assignmentId, count) {
  const startMs = Date.parse("2026-06-29T16:53:00.000Z");
  return Array.from({ length: count }, (_, index) => ({
    checkpointId: `checkpoint-${assignmentId}-${index + 1}`,
    timestamp: new Date(startMs + index * 60_000).toISOString(),
    summary: `compact checkpoint ${index + 1}`,
    sourceRefs: [`assignment:${assignmentId}`, `task:task-${assignmentId}`],
  }));
}

function baseInput(overrides = {}) {
  const workers = [worker("codex-2", "lane-a"), worker("codex-3", "lane-b")];
  return {
    runId: "manager-test",
    workers,
    workerStatusPacket: {
      summary: {
        workers,
      },
    },
    checkpoints: [...checkpoints("lane-a", 10), ...checkpoints("lane-b", 10)],
    events: [],
    questions: [],
    loopFailures: [],
    ...overrides,
  };
}

test("reports stable only when every active worker reaches required clean cycles", () => {
  const packet = buildWorkerCleanCycleObserver(baseInput(), { runId: "manager-test", since, requiredCycles: 10 });

  assert.equal(packet.status, "stable");
  assert.equal(packet.ok, true);
  assert.equal(packet.activeWorkerCount, 2);
  assert.equal(packet.stableWorkerCount, 2);
  assert.equal(packet.observingWorkerCount, 0);
  assert.deepEqual(packet.stopLines, WORKER_CLEAN_CYCLE_STOP_LINES);
  assert.match(packet.retention, /raw payloads and tmux scrollback omitted/);
  assert(packet.workerCycles.every((row) => row.cleanCycleCount === 10));
});

test("continues observing when workers have fewer than the required clean cycles", () => {
  const packet = buildWorkerCleanCycleObserver(
    baseInput({ checkpoints: [...checkpoints("lane-a", 3), ...checkpoints("lane-b", 7)] }),
    { runId: "manager-test", since, requiredCycles: 10 },
  );

  assert.equal(packet.status, "observing");
  assert.equal(packet.ok, true);
  assert.equal(packet.stableWorkerCount, 0);
  assert.equal(packet.observingWorkerCount, 2);
  assert.equal(packet.workerCycles.find((row) => row.workerId === "codex-2").remainingCycles, 7);
  assert.equal(packet.workerCycles.find((row) => row.workerId === "codex-3").remainingCycles, 3);
});

test("surfaces unresolved worker questions as attention", () => {
  const packet = buildWorkerCleanCycleObserver(
    baseInput({
      questions: [
        {
          questionId: "question-1",
          timestamp: "2026-06-29T16:58:00.000Z",
          actor: "codex-2",
          sourceRefs: ["assignment:lane-a"],
        },
      ],
    }),
    { runId: "manager-test", since, requiredCycles: 10 },
  );

  assert.equal(packet.status, "attention");
  assert.equal(packet.ok, false);
  assert.equal(packet.attentionWorkerCount, 1);
  assert(packet.blockers.includes("codex-2: 1 unanswered compact worker question(s)"));
});

test("does not block on worker questions already answered by the manager", () => {
  const packet = buildWorkerCleanCycleObserver(
    baseInput({
      questions: [
        {
          questionId: "question-1",
          timestamp: "2026-06-29T16:58:00.000Z",
          actor: "codex-2",
          sourceRefs: ["assignment:lane-a"],
        },
      ],
      events: [
        {
          eventId: "event-1",
          timestamp: "2026-06-29T16:59:00.000Z",
          eventType: "worker_question_answer_apply",
          sourceRefs: ["question:question-1", "assignment:lane-a"],
        },
      ],
    }),
    { runId: "manager-test", since, requiredCycles: 10 },
  );

  assert.equal(packet.status, "stable");
  assert.equal(packet.ok, true);
  assert.equal(packet.blockers.length, 0);
});

test("resets a worker streak on retire or restart evidence", () => {
  const packet = buildWorkerCleanCycleObserver(
    baseInput({
      events: [
        {
          eventId: "event-1",
          timestamp: "2026-06-29T16:57:00.000Z",
          eventType: "worker_retire_apply",
          sourceRefs: ["worker:codex-2", "assignment:lane-a"],
        },
      ],
    }),
    { runId: "manager-test", since, requiredCycles: 10 },
  );

  assert.equal(packet.status, "attention");
  assert.equal(packet.workerCycles.find((row) => row.workerId === "codex-2").cleanCycleCount, 0);
  assert(packet.blockers.includes("codex-2: 1 reset/retire event(s) after observation start"));
});

test("surfaces missing live manager-owned sessions", () => {
  const workers = [worker("codex-2", "lane-a", { missingLiveSession: true }), worker("codex-3", "lane-b")];
  const packet = buildWorkerCleanCycleObserver(
    baseInput({
      workers,
      workerStatusPacket: { summary: { workers } },
    }),
    { runId: "manager-test", since, requiredCycles: 10 },
  );

  assert.equal(packet.status, "attention");
  assert(packet.blockers.includes("codex-2: missing live manager-owned session"));
});

test("does not count blocked checkpoints as clean worker cycles", () => {
  const packet = buildWorkerCleanCycleObserver(
    baseInput({
      checkpoints: [
        ...checkpoints("lane-b", 10),
        {
          checkpointId: "blocked-checkpoint",
          timestamp: "2026-06-29T16:54:00.000Z",
          summary: "blocked_missing_story_context: cannot proceed because source story context is missing.",
          sourceRefs: ["assignment:lane-a"],
        },
      ],
    }),
    { runId: "manager-test", since, requiredCycles: 10 },
  );

  const row = packet.workerCycles.find((workerRow) => workerRow.workerId === "codex-2");
  assert.equal(packet.status, "attention");
  assert.equal(row.cleanCycleCount, 0);
  assert.equal(row.blockedCheckpointCount, 1);
  assert(packet.blockers.includes("codex-2: 1 blocked checkpoint(s) after observation start"));
});

test("counts clean cycles per worker across assignment changes", () => {
  const workers = [worker("codex-2", "lane-current"), worker("codex-3", "lane-b")];
  const packet = buildWorkerCleanCycleObserver(
    baseInput({
      workers,
      workerStatusPacket: { summary: { workers } },
      checkpoints: [
        ...checkpoints("lane-old", 4),
        ...checkpoints("lane-current", 6),
        ...checkpoints("lane-b", 10),
      ],
      events: [
        {
          eventId: "event-old-assignment",
          timestamp: "2026-06-29T16:53:00.000Z",
          eventType: "worker_progress_signal_apply",
          sourceRefs: ["assignment:lane-old", "worker:codex-2"],
        },
      ],
    }),
    { runId: "manager-test", since, requiredCycles: 10 },
  );

  const row = packet.workerCycles.find((workerRow) => workerRow.workerId === "codex-2");
  assert.equal(packet.status, "stable");
  assert.equal(row.cleanCycleCount, 10);
  assert.equal(row.remainingCycles, 0);
});

test("loop failure reader ignores legacy timestamp-less failures after a since baseline", () => {
  const logsDir = mkdtempSync(join(tmpdir(), "manager-clean-cycle-logs-"));
  try {
    writeFileSync(join(logsDir, "continuous-loop-test.jsonl"), [
      JSON.stringify({ ok: false, status: "blocked", summary: { iteration: 1 } }),
      JSON.stringify({ ok: false, status: "blocked", timestamp: "2026-06-29T16:51:00.000Z", summary: { iteration: 2 } }),
      JSON.stringify({ ok: false, status: "blocked", timestamp: "2026-06-29T16:53:00.000Z", summary: { iteration: 3 } }),
      "",
    ].join("\n"));

    const failures = readLoopFailures(logsDir, Date.parse(since));
    assert.equal(failures.length, 1);
    assert.equal(failures[0].iteration, 3);
  } finally {
    rmSync(logsDir, { recursive: true, force: true });
  }
});
