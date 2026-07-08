#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

import { workspaceState } from "./lib/codex-workspace-state.mjs";
import { buildWorkerStatus, parseCommonArgs, printPacket } from "./lib/manager-control-plane/core.mjs";

const DEFAULT_REQUIRED_CYCLES = 10;
const MAX_TEXT = 180;

export const WORKER_CLEAN_CYCLE_STOP_LINES = Object.freeze([
  "no worker mutation",
  "no dispatch apply",
  "no delivery mutation",
  "no cleanup mutation",
  "no provider usage",
  "no tmux scrollback or raw provider payload retention",
]);

function usage() {
  return [
    "Usage: node ./scripts/manager-worker-clean-cycle-observer.mjs [--run-id <id>] [--since <iso>] [--summary-json]",
    "",
    "Options:",
    "  --run-id <id>              Manager run id. Defaults to latest local manager run.",
    "  --since <iso>              Count only evidence at or after this ISO timestamp.",
    "  --required-cycles <count>  Per-worker clean checkpoint cycles required (default 10).",
    "  --summary-json             Emit a compact JSON packet.",
    "  --help                     Show this help.",
  ].join("\n");
}

function parseArgs(argv = []) {
  const commonArgs = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      continue;
    }
    if (arg === "--since" || arg === "--required-cycles") {
      index += 1;
      continue;
    }
    if (arg.startsWith("--since=") || arg.startsWith("--required-cycles=")) {
      continue;
    }
    commonArgs.push(arg);
  }
  const common = parseCommonArgs(commonArgs);
  const options = {
    ...common,
    since: "",
    requiredCycles: DEFAULT_REQUIRED_CYCLES,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--since") {
      options.since = argv[++index] || "";
    } else if (arg.startsWith("--since=")) {
      options.since = arg.slice("--since=".length);
    } else if (arg === "--required-cycles") {
      options.requiredCycles = parseRequiredCycles(argv[++index]);
    } else if (arg.startsWith("--required-cycles=")) {
      options.requiredCycles = parseRequiredCycles(arg.slice("--required-cycles=".length));
    }
  }

  return options;
}

function parseRequiredCycles(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error("--required-cycles must be an integer from 1 to 100.");
  }
  return parsed;
}

function sanitize(value, fallback = "") {
  const text = value == null ? fallback : String(value);
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
}

function timeMs(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function readJson(path, fallback) {
  if (!path || !existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

function readNdjson(path) {
  if (!path || !existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function readLoopFailures(logsDir, sinceMs) {
  if (!logsDir || !existsSync(logsDir)) return [];
  return readdirSync(logsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^continuous-loop.*\.jsonl$/.test(entry.name))
    .flatMap((entry) =>
      readNdjson(join(logsDir, entry.name)).map((line) => ({
        file: entry.name,
        packet: line,
      })),
    )
    .filter(({ packet }) => {
      const packetMs = timeMs(packet.summary?.timestamp || packet.timestamp);
      if (sinceMs === 0) return true;
      if (packetMs === 0) return false;
      return packetMs >= sinceMs;
    })
    .filter(({ packet }) => packet.ok === false || packet.status === "blocked" || (packet.blockers || []).length > 0)
    .slice(-10)
    .map(({ file, packet }) => ({
      file,
      iteration: packet.summary?.iteration || null,
      status: sanitize(packet.status || "blocked"),
      blockerCount: Array.isArray(packet.blockers) ? packet.blockers.length : 0,
    }));
}

function refs(record) {
  return Array.isArray(record?.sourceRefs) ? record.sourceRefs.map(String) : [];
}

function assignmentIdFromRefs(record) {
  const ref = refs(record).find((item) => item.startsWith("assignment:"));
  return ref ? ref.slice("assignment:".length) : "";
}

function workerIdFromRefs(record) {
  const ref = refs(record).find((item) => item.startsWith("worker:"));
  return ref ? ref.slice("worker:".length) : "";
}

function questionIdFromRefs(record) {
  const ref = refs(record).find((item) => item.startsWith("question:"));
  return ref ? ref.slice("question:".length) : "";
}

function checkpointBlockers(checkpoint = {}) {
  const text = String(checkpoint.summary || "").toLowerCase();
  const blockers = [];
  if (/\b(blocked|blocking|cannot proceed|can't proceed|failed|failure|error|needs operator|waiting on|missing story|missing source|missing context|blocked_missing_story_context)\b/.test(text)) {
    blockers.push("latest checkpoint reports blocked or missing context");
  }
  return blockers;
}

function latestManagerRunId(stateRoot) {
  const runsDir = join(stateRoot, "manager-runs");
  if (!existsSync(runsDir)) return "";
  const entries = readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name.startsWith("manager-"))
    .sort();
  return entries.at(-1) || "";
}

function activeWorkerRows(workerStatusPacket, workers, runId) {
  const statusWorkers = workerStatusPacket?.summary?.workers;
  const source = Array.isArray(statusWorkers) && statusWorkers.length > 0 ? statusWorkers : workers;
  return source
    .filter((worker) => worker && worker.state === "active")
    .filter((worker) => String(worker.runId || runId) === runId)
    .filter((worker) => String(worker.workerId || "").startsWith("codex-"))
    .map((worker) => ({
      workerId: sanitize(worker.workerId),
      sessionName: sanitize(worker.sessionName || worker.workerId),
      assignmentId: sanitize(worker.assignmentId),
      taskId: sanitize(worker.taskId),
      state: sanitize(worker.state),
      recoveryState: sanitize(worker.recoveryState),
      missingLiveSession: Boolean(worker.missingLiveSession),
      failureCount: Number.isFinite(Number(worker.failureCount)) ? Number(worker.failureCount) : 0,
    }))
    .sort((left, right) => left.workerId.localeCompare(right.workerId, undefined, { numeric: true }));
}

function answeredQuestionIds(events) {
  return new Set(
    events
      .filter((event) => event?.eventType === "worker_question_answer_apply")
      .map(questionIdFromRefs)
      .filter(Boolean),
  );
}

function checkpointBelongsToWorker(checkpoint, worker, records = {}) {
  const assignmentId = assignmentIdFromRefs(checkpoint);
  if (!assignmentId) return false;
  const mappedWorker = records.assignmentWorkerMap?.get(assignmentId) || "";
  if (mappedWorker) return mappedWorker === worker.workerId;
  return assignmentId === worker.assignmentId;
}

function eventBelongsToWorker(event, worker) {
  return workerIdFromRefs(event) === worker.workerId || assignmentIdFromRefs(event) === worker.assignmentId;
}

function buildWorkerSummary(worker, records, options) {
  const sinceMs = options.sinceMs || 0;
  const relevantCheckpoints = records.checkpoints
    .filter((checkpoint) => timeMs(checkpoint.timestamp) >= sinceMs)
    .filter((checkpoint) => checkpointBelongsToWorker(checkpoint, worker, records))
    .sort((left, right) => timeMs(left.timestamp) - timeMs(right.timestamp));
  const relevantEvents = records.events
    .filter((event) => timeMs(event.timestamp) >= sinceMs)
    .filter((event) => eventBelongsToWorker(event, worker));
  const answers = answeredQuestionIds(records.events);
  const openQuestions = records.questions
    .filter((question) => timeMs(question.timestamp) >= sinceMs)
    .filter((question) => assignmentIdFromRefs(question) === worker.assignmentId || question.actor === worker.workerId)
    .filter((question) => !answers.has(question.questionId));
  const resetEvents = relevantEvents.filter((event) =>
    ["worker_retire_apply", "worker_restart_apply", "worker_kill_apply"].includes(String(event.eventType || "")),
  );
  const latestResetMs = Math.max(sinceMs, ...resetEvents.map((event) => timeMs(event.timestamp)));
  const postResetCheckpoints = relevantCheckpoints.filter((checkpoint) => timeMs(checkpoint.timestamp) >= latestResetMs);
  const blockedCheckpoints = postResetCheckpoints.filter((checkpoint) => checkpointBlockers(checkpoint).length > 0);
  const cleanCheckpoints = postResetCheckpoints.filter((checkpoint) => checkpointBlockers(checkpoint).length === 0);
  const blockers = [];

  if (worker.missingLiveSession) blockers.push("missing live manager-owned session");
  if (worker.state !== "active") blockers.push(`worker state is ${worker.state || "unknown"}`);
  if (worker.recoveryState === "retired_after_recovery_submit_unanswered") blockers.push("worker retired after unanswered recovery submit");
  if (openQuestions.length > 0) blockers.push(`${openQuestions.length} unanswered compact worker question(s)`);
  if (resetEvents.length > 0) blockers.push(`${resetEvents.length} reset/retire event(s) after observation start`);
  if (blockedCheckpoints.length > 0) blockers.push(`${blockedCheckpoints.length} blocked checkpoint(s) after observation start`);

  const cleanCycleCount = blockers.length > 0 ? 0 : cleanCheckpoints.length;
  return {
    workerId: worker.workerId,
    sessionName: worker.sessionName,
    assignmentId: worker.assignmentId,
    taskId: worker.taskId,
    state: worker.state,
    recoveryState: worker.recoveryState,
    cleanCycleCount,
    requiredCycles: options.requiredCycles,
    remainingCycles: Math.max(0, options.requiredCycles - cleanCycleCount),
    latestCheckpointAt: sanitize(cleanCheckpoints.at(-1)?.timestamp),
    latestCheckpointSummary: sanitize(cleanCheckpoints.at(-1)?.summary),
    checkpointCountSinceStart: relevantCheckpoints.length,
    blockedCheckpointCount: blockedCheckpoints.length,
    managerEventCountSinceStart: relevantEvents.length,
    openQuestionCount: openQuestions.length,
    resetEventCount: resetEvents.length,
    status: blockers.length > 0 ? "attention" : cleanCycleCount >= options.requiredCycles ? "stable" : "observing",
    blockers,
  };
}

function buildStabilityProof({ status, workerCycles, loopFailures, requiredCycles, since }) {
  const stableWorkers = workerCycles.filter((worker) => worker.status === "stable");
  const observingWorkers = workerCycles.filter((worker) => worker.status === "observing");
  const attentionWorkers = workerCycles.filter((worker) => worker.status === "attention");
  const cleanCounts = workerCycles.map((worker) => worker.cleanCycleCount);
  const minCleanCycles = cleanCounts.length > 0 ? Math.min(...cleanCounts) : 0;
  const maxCleanCycles = cleanCounts.length > 0 ? Math.max(...cleanCounts) : 0;
  const remainingCycles = workerCycles.reduce((total, worker) => total + worker.remainingCycles, 0);
  const latestCheckpointAt = workerCycles
    .map((worker) => worker.latestCheckpointAt)
    .filter(Boolean)
    .sort((left, right) => timeMs(left) - timeMs(right))
    .at(-1) || "";
  const blockers = [
    ...(workerCycles.length === 0 ? ["no_active_manager_owned_codex_workers"] : []),
    ...(attentionWorkers.length > 0 ? ["attention_worker_present"] : []),
    ...(loopFailures.length > 0 ? ["continuous_loop_failure_present"] : []),
    ...(observingWorkers.length > 0 ? ["clean_cycle_target_incomplete"] : []),
  ];
  const proven = status === "stable" && blockers.length === 0 && workerCycles.length > 0;

  return {
    schemaVersion: "manager-worker-clean-cycle-stability-proof/v1",
    proofStatus: proven ? "proven" : status === "attention" ? "attention" : "observing",
    proven,
    target: {
      requiredCleanCyclesPerWorker: requiredCycles,
      scope: "active manager-owned codex workers in this manager run",
    },
    observationWindow: {
      since: sanitize(since),
      latestCheckpointAt: sanitize(latestCheckpointAt),
    },
    workerCounts: {
      active: workerCycles.length,
      stable: stableWorkers.length,
      observing: observingWorkers.length,
      attention: attentionWorkers.length,
    },
    cleanCycleRange: {
      min: minCleanCycles,
      max: maxCleanCycles,
      remainingTotal: remainingCycles,
    },
    stableWorkerIds: stableWorkers.map((worker) => worker.workerId),
    attentionWorkerIds: attentionWorkers.map((worker) => worker.workerId),
    loopFailureCount: loopFailures.length,
    blockers,
    evidenceRefs: [
      "manager-run:workers.json",
      "manager-run:checkpoints.json",
      "manager-run:questions.ndjson",
      "manager-run:events.ndjson",
      "manager-run:logs/continuous-loop*.jsonl",
    ],
    rawPayloadRetained: false,
    mutation: "none",
  };
}

export function buildWorkerCleanCycleObserver(input = {}, options = {}) {
  const requiredCycles = options.requiredCycles || DEFAULT_REQUIRED_CYCLES;
  const sinceMs = timeMs(options.since);
  const runId = sanitize(input.runId || options.runId);
  const workers = Array.isArray(input.workers) ? input.workers : [];
  const workerRows = activeWorkerRows(input.workerStatusPacket, workers, runId);
  const records = {
    checkpoints: Array.isArray(input.checkpoints) ? input.checkpoints : [],
    events: Array.isArray(input.events) ? input.events : [],
    questions: Array.isArray(input.questions) ? input.questions : [],
  };
  records.assignmentWorkerMap = assignmentWorkerMap(records.events, workerRows);
  const workerCycles = workerRows.map((worker) => buildWorkerSummary(worker, records, { requiredCycles, sinceMs }));
  const loopFailures = Array.isArray(input.loopFailures) ? input.loopFailures : [];
  const attentionWorkers = workerCycles.filter((worker) => worker.status === "attention");
  const stableWorkers = workerCycles.filter((worker) => worker.status === "stable");
  const observingWorkers = workerCycles.filter((worker) => worker.status === "observing");
  const blockers = [
    ...(workerRows.length === 0 ? ["no active manager-owned codex workers observed"] : []),
    ...attentionWorkers.flatMap((worker) => worker.blockers.map((blocker) => `${worker.workerId}: ${blocker}`)),
    ...loopFailures.map((failure) => `continuous loop ${failure.file}${failure.iteration ? ` iteration ${failure.iteration}` : ""} reported ${failure.status}`),
  ];
  const status = blockers.length > 0 ? "attention" : stableWorkers.length === workerCycles.length && workerCycles.length > 0 ? "stable" : "observing";
  const stabilityProof = buildStabilityProof({ status, workerCycles, loopFailures, requiredCycles, since: options.since });

  return {
    ok: status !== "attention",
    observer: "manager-worker-clean-cycle-observer",
    schemaVersion: 1,
    status,
    mutation: "none; metadata-only observation",
    retention: "metadata-only worker cycle summary; raw payloads and tmux scrollback omitted",
    runId,
    since: sanitize(options.since),
    requiredCycles,
    activeWorkerCount: workerCycles.length,
    stableWorkerCount: stableWorkers.length,
    observingWorkerCount: observingWorkers.length,
    attentionWorkerCount: attentionWorkers.length,
    stabilityProof,
    stopLines: WORKER_CLEAN_CYCLE_STOP_LINES,
    nextManagerAction:
      status === "stable"
        ? "record worker-cycle stability evidence and keep continuous mode running"
        : status === "attention"
          ? "fix the manager path that created attention before restarting the clean-cycle streak"
          : "continue observing active workers until every codex session reaches the required clean-cycle streak",
    workerCycles,
    blockers,
    warnings: loopFailures.length > 0 ? ["continuous loop failure evidence is global, not attributed to a single worker"] : [],
  };
}

function assignmentWorkerMap(events = [], workerRows = []) {
  const map = new Map();
  for (const worker of workerRows) {
    if (worker.assignmentId && worker.workerId) map.set(worker.assignmentId, worker.workerId);
  }
  for (const event of events) {
    const assignmentId = assignmentIdFromRefs(event);
    const workerId = workerIdFromRefs(event);
    if (assignmentId && workerId) map.set(assignmentId, workerId);
  }
  return map;
}

function loadLiveInput(options) {
  const state = workspaceState(options);
  const runId = options.runId || latestManagerRunId(state.root);
  if (!runId) throw new Error("No manager run id found. Pass --run-id.");
  const runRoot = join(state.root, "manager-runs", runId);
  const workerStatusPacket = buildWorkerStatus({ ...options, runId });
  return {
    runId,
    workers: readJson(join(runRoot, "workers.json"), []),
    checkpoints: readJson(join(runRoot, "checkpoints.json"), []),
    events: readNdjson(join(runRoot, "events.ndjson")),
    questions: readNdjson(join(runRoot, "questions.ndjson")),
    loopFailures: readLoopFailures(join(runRoot, "logs"), timeMs(options.since)),
    workerStatusPacket,
  };
}

function printHuman(packet) {
  console.log("Manager worker clean-cycle observer");
  console.log(`- run ${packet.runId || "unknown"}`);
  console.log(`- since ${packet.since || "beginning"}`);
  console.log(`- status ${packet.status}`);
  console.log(`- workers ${packet.stableWorkerCount} stable / ${packet.observingWorkerCount} observing / ${packet.attentionWorkerCount} attention`);
  for (const worker of packet.workerCycles) {
    console.log(`- ${worker.workerId} ${worker.cleanCycleCount}/${worker.requiredCycles} ${worker.status} ${worker.assignmentId}`);
  }
  if (packet.blockers.length > 0) {
    console.log("- blockers");
    for (const blocker of packet.blockers) console.log(`  - ${blocker}`);
  }
  console.log(`- next ${packet.nextManagerAction}`);
}

export function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }
  const input = loadLiveInput(options);
  const packet = buildWorkerCleanCycleObserver(input, { ...options, runId: input.runId });
  if (options.summaryJson) {
    printPacket(packet, options);
  } else {
    printHuman(packet);
  }
  return packet.status === "attention" ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = runCli();
  } catch (error) {
    console.error(`${basename(process.argv[1])}: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
