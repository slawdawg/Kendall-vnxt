#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  classifyManagerWorkerLifecycle,
  managerRunPaths,
  MANAGER_WORKER_LIFECYCLE_STATES,
  parseCommonArgs,
  printPacket,
} from "./lib/manager-control-plane/core.mjs";

export const THROUGHPUT_LIFECYCLE_STATES = MANAGER_WORKER_LIFECYCLE_STATES;

export const THROUGHPUT_STOP_LINES = Object.freeze([
  "fake adapters only",
  "no live tmux inspection",
  "no worker launch or kill",
  "no provider usage",
  "no GitHub mutation",
  "no delivery or cleanup mutation",
  "no live workspace mutation",
  "metadata-only evidence",
]);

const DEFAULT_WORKERS = 6;
const DEFAULT_CYCLES = 10;
const DEFAULT_LOW_WATERMARK = 2;
const DEFAULT_HIGH_WATERMARK = 6;
const DEFAULT_MAX_PROGRESS_SIGNALS = 1;
const DEFAULT_MAX_POINTER_SUBMITS = 1;
const MAX_ITERATION_MULTIPLIER = 8;

function usage() {
  return [
    "Usage: node ./scripts/manager-throughput-harness.mjs [--workers <count>] [--cycles <count>] [--summary-json]",
    "",
    "Options:",
    "  --workers <count>       Fake worker count, 1-12 (default 6).",
    "  --cycles <count>        Required clean cycles per worker, 1-50 (default 10).",
    "  --write-proof           Persist compact throughput proof under manager run state.",
    "  --summary-json          Emit compact JSON.",
    "  --help                  Show this help.",
  ].join("\n");
}

export function parseHarnessArgs(argv = []) {
  const commonArgs = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") continue;
    if (arg === "--workers" || arg === "--cycles") {
      index += 1;
      continue;
    }
    if (arg.startsWith("--workers=") || arg.startsWith("--cycles=")) continue;
    if (arg === "--write-proof") continue;
    commonArgs.push(arg);
  }

  const common = parseCommonArgs(commonArgs);
  const options = {
    ...common,
    workers: DEFAULT_WORKERS,
    cycles: DEFAULT_CYCLES,
    writeProof: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--workers") {
      options.workers = parseBoundedInt(argv[++index], "--workers", 1, 12);
    } else if (arg.startsWith("--workers=")) {
      options.workers = parseBoundedInt(arg.slice("--workers=".length), "--workers", 1, 12);
    } else if (arg === "--cycles") {
      options.cycles = parseBoundedInt(argv[++index], "--cycles", 1, 50);
    } else if (arg.startsWith("--cycles=")) {
      options.cycles = parseBoundedInt(arg.slice("--cycles=".length), "--cycles", 1, 50);
    } else if (arg === "--write-proof") {
      options.writeProof = true;
    }
  }

  return options;
}

function parseBoundedInt(value, label, min, max) {
  const text = String(value || "");
  if (!/^[0-9]+$/.test(text)) {
    throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  }
  const parsed = Number(text);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  }
  return parsed;
}

function workerId(index) {
  return `codex-${index + 1}`;
}

function workItemId(sequence) {
  return `safe-work-${String(sequence).padStart(4, "0")}`;
}

function makeWorkers(count) {
  return Array.from({ length: count }, (_, index) => ({
    workerId: workerId(index),
    state: "waiting_for_dispatcher",
    currentWorkItem: "",
    cleanCycles: 0,
    completedWorkItems: [],
    pointerSubmitAttempts: 0,
    progressSignalAttempts: 0,
    retryCount: 0,
    promptIdle: false,
    retired: false,
    lifecycleEvidence: [],
  }));
}

function makeQueue(count, start = 1) {
  return Array.from({ length: count }, (_, index) => workItemId(start + index));
}

export function createFakeDispatcher(options = {}) {
  const highWatermark = boundedNumber(options.highWatermark, DEFAULT_HIGH_WATERMARK);
  const initialQueueDepth = boundedNumber(options.initialQueueDepth, Math.max(1, Math.min(DEFAULT_LOW_WATERMARK, highWatermark)));
  return {
    queue: makeQueue(initialQueueDepth),
    activeLeases: new Map(),
    completedItems: new Set(),
    lowWatermark: boundedNumber(options.lowWatermark, DEFAULT_LOW_WATERMARK),
    highWatermark,
    sourceRemaining: boundedNumber(options.sourceRemaining, 10_000),
    nextSequence: initialQueueDepth + 1,
    refillJob: null,
    refillJobs: [],
    leaseHistory: [],
    duplicateLeaseCount: 0,
    refillingResponses: 0,
    emptyResponses: 0,
    pausedResponses: 0,
    blockedResponses: 0,
  };
}

function boundedNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function startRefill(dispatcher, reason = "low_watermark") {
  if (dispatcher.refillJob?.state === "active") return dispatcher.refillJob;
  const refillJob = {
    refillJobId: `refill-${dispatcher.refillJobs.length + 1}`,
    state: "active",
    reason,
    lock: "dispatcher-refill-lock",
    requestedToHighWatermark: dispatcher.highWatermark,
    cyclesRemaining: 1,
    createdItems: [],
  };
  dispatcher.refillJob = refillJob;
  dispatcher.refillJobs.push(refillJob);
  return refillJob;
}

function completeRefill(dispatcher) {
  const job = dispatcher.refillJob;
  if (!job || job.state !== "active") return;
  job.cyclesRemaining -= 1;
  if (job.cyclesRemaining > 0) return;
  const desired = Math.max(0, dispatcher.highWatermark - dispatcher.queue.length);
  const createCount = Math.min(desired, dispatcher.sourceRemaining);
  for (let index = 0; index < createCount; index += 1) {
    const item = workItemId(dispatcher.nextSequence++);
    dispatcher.queue.push(item);
    job.createdItems.push(item);
  }
  dispatcher.sourceRemaining -= createCount;
  job.state = createCount > 0 ? "completed" : "source_exhausted";
  dispatcher.refillJob = null;
}

function claimNextWork(dispatcher, worker, gates) {
  if (gates.dispatchBlocked) {
    dispatcher.blockedResponses += 1;
    return { state: "blocked", reason: "source boundary blocks safe work generation", stopLine: "do not fabricate unsafe work" };
  }
  if (gates.usagePaused) {
    dispatcher.pausedResponses += 1;
    return { state: "paused", reason: "usage window is manager-only", stopLine: "new dispatch paused by usage governor" };
  }
  if (gates.resourcePaused) {
    dispatcher.pausedResponses += 1;
    return { state: "paused", reason: "host resources are pressured", stopLine: "new dispatch paused by resource governor" };
  }
  if (dispatcher.activeLeases.has(worker.workerId)) {
    return { state: "leased", workItemId: dispatcher.activeLeases.get(worker.workerId), duplicate: false };
  }
  if (dispatcher.queue.length === 0) {
    if (dispatcher.refillJob?.state === "active") {
      dispatcher.refillingResponses += 1;
      return { state: "refilling", refillJobId: dispatcher.refillJob.refillJobId };
    }
    if (dispatcher.sourceRemaining > 0) {
      const job = startRefill(dispatcher, "empty_queue");
      dispatcher.refillingResponses += 1;
      return { state: "refilling", refillJobId: job.refillJobId };
    }
    dispatcher.emptyResponses += 1;
    return { state: "empty", reason: "source-owned safe work exhausted" };
  }

  if (dispatcher.queue.length <= dispatcher.lowWatermark && dispatcher.sourceRemaining > 0) {
    startRefill(dispatcher, "low_watermark");
  }
  const workItem = dispatcher.queue.shift();
  const duplicate = [...dispatcher.activeLeases.values()].includes(workItem) || dispatcher.completedItems.has(workItem);
  if (duplicate) dispatcher.duplicateLeaseCount += 1;
  dispatcher.activeLeases.set(worker.workerId, workItem);
  dispatcher.leaseHistory.push({ workerId: worker.workerId, workItemId: workItem, duplicate });
  return { state: "leased", workItemId: workItem, duplicate };
}

function releaseLease(dispatcher, worker) {
  const workItem = dispatcher.activeLeases.get(worker.workerId);
  if (!workItem) return "";
  dispatcher.activeLeases.delete(worker.workerId);
  dispatcher.completedItems.add(workItem);
  return workItem;
}

export function classifyThroughputWorker(worker, context = {}) {
  return {
    ...classifyManagerWorkerLifecycle(worker, context),
    evidenceSource: "deterministic-throughput-harness",
  };
}

function appendLifecycle(worker, row) {
  worker.state = row.state;
  worker.lifecycleEvidence.push(row);
}

export function runThroughputHarness(options = {}) {
  const requiredWorkers = parseBoundedForRuntime(options.workers, DEFAULT_WORKERS, 1, 12);
  const requiredCycles = parseBoundedForRuntime(options.cycles, DEFAULT_CYCLES, 1, 50);
  const maxProgressSignals = parseBoundedForRuntime(options.maxProgressSignals, DEFAULT_MAX_PROGRESS_SIGNALS, 0, 5);
  const maxPointerSubmits = parseBoundedForRuntime(options.maxPointerSubmits, DEFAULT_MAX_POINTER_SUBMITS, 0, 5);
  const workers = makeWorkers(requiredWorkers);
  validateHarnessOptions(options, workers);
  const dispatcher = createFakeDispatcher({
    initialQueueDepth: options.initialQueueDepth,
    lowWatermark: options.lowWatermark,
    highWatermark: options.highWatermark,
    sourceRemaining: options.sourceRemaining ?? requiredWorkers * requiredCycles * 2,
  });
  if (options.injectDuplicateLeaseEvidence) {
    dispatcher.duplicateLeaseCount = 1;
  }
  const promptIdleWorkers = new Set(options.promptIdleWorkers || []);
  const staleNoopActions = [];
  const sideEffects = [];
  const lifecycleRows = [];
  const gate = {
    usagePaused: options.usageState === "manager_only" || options.usageState === "paused",
    resourcePaused: options.resourceState === "pressured" || options.resourceState === "critical",
    dispatchBlocked: options.dispatcherState === "blocked",
  };

  if (options.injectStaleNoop !== false) {
    const beforeQueueDepth = dispatcher.queue.length;
    const job = startRefill(dispatcher, "stale_apply_gap");
    completeRefill(dispatcher);
    staleNoopActions.push({
      action: "dispatcher_refill_apply",
      result: "stale_noop",
      reason: "refill gap disappeared between dry-run and apply",
      beforeQueueDepth,
      afterQueueDepth: dispatcher.queue.length,
      refillJobId: job.refillJobId,
      nextAction: "continue_loop",
    });
  }

  for (const worker of workers) {
    if (promptIdleWorkers.has(worker.workerId)) worker.promptIdle = true;
    if (options.preloadActiveWork) {
      const item = `${worker.workerId}-preloaded-work`;
      worker.currentWorkItem = item;
      dispatcher.activeLeases.set(worker.workerId, item);
    }
  }

  const maxIterations = Math.max(requiredCycles * MAX_ITERATION_MULTIPLIER, requiredWorkers * requiredCycles * 2);
  for (let cycle = 1; cycle <= maxIterations; cycle += 1) {
    for (const worker of workers) {
      if (worker.retired || worker.recoveryRequired || worker.cleanCycles >= requiredCycles) {
        const row = classifyThroughputWorker(worker, { cycle, requiredCycles, maxPointerSubmits, maxProgressSignals, gate });
        appendLifecycle(worker, row);
        lifecycleRows.push({ workerId: worker.workerId, ...row });
        continue;
      }

      if (worker.promptIdle) {
        const row = classifyThroughputWorker(worker, { cycle, requiredCycles, maxPointerSubmits, maxProgressSignals, gate });
        if (row.nextAllowedAction === "submit_visible_pointer_text") {
          worker.pointerSubmitAttempts += 1;
          worker.retryCount += 1;
        } else if (row.nextAllowedAction === "send_compact_progress_request") {
          worker.progressSignalAttempts += 1;
          worker.retryCount += 1;
        } else if (row.state === "recovery_required") {
          worker.recoveryRequired = true;
        }
        appendLifecycle(worker, row);
        lifecycleRows.push({ workerId: worker.workerId, ...row });
        continue;
      }

      if (worker.currentWorkItem && !gate.usagePaused && !gate.resourcePaused) {
        const completed = worker.currentWorkItem.endsWith("-preloaded-work") ? worker.currentWorkItem : releaseLease(dispatcher, worker);
        worker.completedWorkItems.push(completed);
        worker.cleanCycles += 1;
        worker.currentWorkItem = "";
      }

      if (worker.currentWorkItem && (gate.usagePaused || gate.resourcePaused)) {
        const row = classifyThroughputWorker(worker, { cycle, requiredCycles, maxPointerSubmits, maxProgressSignals, gate });
        appendLifecycle(worker, row);
        lifecycleRows.push({ workerId: worker.workerId, ...row });
        continue;
      }

      if (worker.cleanCycles >= requiredCycles) {
        const row = classifyThroughputWorker(worker, { cycle, requiredCycles, maxPointerSubmits, maxProgressSignals, gate });
        appendLifecycle(worker, row);
        lifecycleRows.push({ workerId: worker.workerId, ...row });
        continue;
      }

      const claim = claimNextWork(dispatcher, worker, gate);
      if (claim.state === "leased") {
        worker.currentWorkItem = claim.workItemId;
      }
      const row = classifyThroughputWorker(worker, {
        cycle,
        requiredCycles,
        maxPointerSubmits,
        maxProgressSignals,
        gate,
        dispatcherState: claim.state,
        dispatcherReason: claim.reason,
      });
      appendLifecycle(worker, row);
      lifecycleRows.push({ workerId: worker.workerId, ...row, dispatcherState: claim.state });
    }

    completeRefill(dispatcher);
    if (workers.every((worker) => worker.cleanCycles >= requiredCycles || worker.recoveryRequired || worker.retired)) break;
  }

  const workerSummaries = workers.map((worker) => ({
    workerId: worker.workerId,
    lifecycleState: worker.state,
    cleanCycles: worker.cleanCycles,
    requiredCycles,
    currentWorkItem: worker.currentWorkItem || null,
    completedWorkItemCount: worker.completedWorkItems.length,
    pointerSubmitAttempts: worker.pointerSubmitAttempts,
    progressSignalAttempts: worker.progressSignalAttempts,
    retryCount: worker.retryCount,
    nextAllowedAction: worker.lifecycleEvidence.at(-1)?.nextAllowedAction || "none",
    stopLine: worker.lifecycleEvidence.at(-1)?.stopLine || "",
    evidenceSource: "deterministic-throughput-harness",
  }));
  const stableWorkerCount = workerSummaries.filter((worker) => worker.cleanCycles >= requiredCycles && worker.lifecycleState === "valid_idle_completed").length;
  const recoveryWorkerCount = workerSummaries.filter((worker) => worker.lifecycleState === "recovery_required").length;
  const pausedWorkerCount = workerSummaries.filter((worker) => worker.lifecycleState === "paused_usage" || worker.lifecycleState === "paused_resources").length;
  const blockedWorkerCount = workerSummaries.filter((worker) => worker.lifecycleState === "blocked_gated").length;
  const duplicateLeaseDetected = dispatcher.duplicateLeaseCount > 0;
  const missingRefillProof = stableWorkerCount === requiredWorkers && options.requireRefillProof !== false && dispatcher.refillJobs.length === 0;
  const status = duplicateLeaseDetected || missingRefillProof
    ? "blocked"
    : stableWorkerCount === requiredWorkers
      ? "stable"
      : recoveryWorkerCount > 0
        ? "attention"
        : pausedWorkerCount > 0
          ? "paused"
          : "blocked";

  const blockers = [];
  if (duplicateLeaseDetected) {
    blockers.push({ code: "duplicate-dispatcher-lease", message: "Dispatcher issued duplicate work item leases.", nextAction: "fix atomic lease handling" });
  }
  if (missingRefillProof) {
    blockers.push({ code: "missing-refill-proof", message: "Stable throughput requires at least one dispatcher refill proof.", nextAction: "exercise low-watermark refill before accepting throughput" });
  }
  for (const worker of workerSummaries.filter((row) => row.lifecycleState === "recovery_required")) {
    blockers.push({ code: "worker-recovery-required", message: `${worker.workerId} reached bounded prompt-idle recovery.`, nextAction: "inspect_or_retire_worker" });
  }
  if (status === "blocked" && blockers.length === 0) {
    blockers.push({ code: "throughput-target-not-met", message: "Not all workers reached the required clean cycles.", nextAction: "inspect lifecycle evidence" });
  }

  return {
    ok: status === "stable",
    status,
    summary: {
      harness: "manager-throughput",
      authorityStage: "backend_proof",
      workerCount: requiredWorkers,
      requiredCycles,
      stableWorkerCount,
      recoveryWorkerCount,
      pausedWorkerCount,
      blockedWorkerCount,
      allWorkersReachedTarget: stableWorkerCount === requiredWorkers,
      workerLifecycleStates: THROUGHPUT_LIFECYCLE_STATES,
      workers: workerSummaries,
      dispatcher: {
        lowWatermark: dispatcher.lowWatermark,
        highWatermark: dispatcher.highWatermark,
        queueDepth: dispatcher.queue.length,
        activeLeaseCount: dispatcher.activeLeases.size,
        leaseCount: dispatcher.leaseHistory.length,
        duplicateLeaseCount: dispatcher.duplicateLeaseCount,
        refillJobCount: dispatcher.refillJobs.length,
        refillingResponses: dispatcher.refillingResponses,
        emptyResponses: dispatcher.emptyResponses,
        pausedResponses: dispatcher.pausedResponses,
        blockedResponses: dispatcher.blockedResponses,
        leaseHistory: dispatcher.leaseHistory,
        refillJobs: dispatcher.refillJobs.map((job) => ({
          refillJobId: job.refillJobId,
          state: job.state,
          reason: job.reason,
          createdItemCount: job.createdItems.length,
          lock: job.lock,
        })),
      },
      staleNoopActions,
      sideEffects,
      stopLines: THROUGHPUT_STOP_LINES,
      rawPayloadRetained: false,
      lifecycleEvidence: lifecycleRows.slice(-Math.max(requiredWorkers * 4, 24)),
    },
    blockers,
    warnings: status === "paused" ? [{ code: "dispatch-paused", message: "Usage or resources paused new dispatch while preserving worker truth." }] : [],
    nextActions: status === "stable"
      ? [{ code: "live-dogfood-gate-ready", summary: "Deterministic throughput gate passed.", nextAction: "resume bounded live dogfood only after operator-approved live gate" }]
      : [{ code: "inspect-throughput-evidence", summary: "Throughput gate did not reach stable.", nextAction: "inspect worker lifecycle evidence and patch the classifier or dispatcher model" }],
  };
}

function parseBoundedForRuntime(value, fallback, min, max) {
  const number = Number(value ?? fallback);
  if (!Number.isInteger(number) || number < min || number > max) return fallback;
  return number;
}

function validateHarnessOptions(options, workers) {
  const allowedUsageStates = new Set(["", "normal", "manager_only", "paused"]);
  const allowedResourceStates = new Set(["", "normal", "pressured", "critical"]);
  const allowedDispatcherStates = new Set(["", "normal", "blocked"]);
  const usageState = String(options.usageState || "");
  const resourceState = String(options.resourceState || "");
  const dispatcherState = String(options.dispatcherState || "");
  if (!allowedUsageStates.has(usageState)) throw new Error(`unknown usageState: ${usageState}`);
  if (!allowedResourceStates.has(resourceState)) throw new Error(`unknown resourceState: ${resourceState}`);
  if (!allowedDispatcherStates.has(dispatcherState)) throw new Error(`unknown dispatcherState: ${dispatcherState}`);
  const workerIds = new Set(workers.map((worker) => worker.workerId));
  for (const id of options.promptIdleWorkers || []) {
    if (!workerIds.has(id)) throw new Error(`unknown prompt-idle worker: ${id}`);
  }
}

export function runManagerThroughputHarness(argv = process.argv.slice(2), context = {}) {
  const options = parseHarnessArgs(argv);
  if (options.help) return { options, result: { ok: true, status: "help", summary: { usage: usage() }, blockers: [], warnings: [], nextActions: [] } };
  const result = runThroughputHarness({ ...context, ...options });
  if (options.writeProof) {
    const proof = writeThroughputProof(result, options, context);
    result.summary.proof = {
      written: true,
      path: proof.path,
      status: proof.proof.status,
      runId: proof.proof.runId,
    };
  }
  return { options, result };
}

export function writeThroughputProof(result, options = {}, context = {}) {
  const paths = managerRunPaths(options.runId || context.runId, options, context);
  mkdirSync(paths.root, { recursive: true });
  const proof = buildThroughputProof(result, {
    runId: paths.runId,
    sourceCommand: throughputSourceCommand(options),
    createdAt: context.now || new Date().toISOString(),
  });
  writeFileSync(paths.throughputProof, `${JSON.stringify(proof, null, 2)}\n`);
  return { path: paths.throughputProof, proof };
}

export function buildThroughputProof(result, metadata = {}) {
  const summary = result.summary || {};
  const dispatcher = summary.dispatcher || {};
  const workerCount = Number(summary.workerCount) || 0;
  const requiredCycles = Number(summary.requiredCycles) || 0;
  const passed = result.ok === true &&
    result.status === "stable" &&
    workerCount >= 6 &&
    requiredCycles >= 10 &&
    summary.allWorkersReachedTarget === true &&
    Number(dispatcher.duplicateLeaseCount || 0) === 0 &&
    Number(dispatcher.refillJobCount || 0) > 0 &&
    summary.rawPayloadRetained === false &&
    Array.isArray(summary.sideEffects) &&
    summary.sideEffects.length === 0;
  const proofStatus = passed ? "passed" : "failed";
  return {
    kind: "manager-throughput-proof",
    version: 1,
    runId: metadata.runId || "",
    createdAt: metadata.createdAt || new Date().toISOString(),
    status: proofStatus,
    authorityStage: "backend_proof",
    harness: summary.harness || "manager-throughput",
    sourceCommand: metadata.sourceCommand || throughputSourceCommand({ workers: workerCount, cycles: requiredCycles, writeProof: true, summaryJson: true }),
    twoWorkerProof: {
      status: proofStatus,
      workerCount: passed ? 2 : Math.min(workerCount, 2),
      cleanCyclesPerWorker: passed ? requiredCycles : 0,
      source: passed ? "six-worker-throughput-superset" : "manager-throughput-harness",
    },
    sixWorkerProof: {
      status: proofStatus,
      workerCount,
      cleanCyclesPerWorker: requiredCycles,
      stableWorkerCount: Number(summary.stableWorkerCount) || 0,
      source: "manager-throughput-harness",
    },
    dispatcher: {
      lowWatermark: Number(dispatcher.lowWatermark) || 0,
      highWatermark: Number(dispatcher.highWatermark) || 0,
      leaseCount: Number(dispatcher.leaseCount) || 0,
      duplicateLeaseCount: Number(dispatcher.duplicateLeaseCount) || 0,
      refillJobCount: Number(dispatcher.refillJobCount) || 0,
      refillingResponses: Number(dispatcher.refillingResponses) || 0,
      emptyResponses: Number(dispatcher.emptyResponses) || 0,
      pausedResponses: Number(dispatcher.pausedResponses) || 0,
      blockedResponses: Number(dispatcher.blockedResponses) || 0,
    },
    stopLines: Array.isArray(summary.stopLines) ? summary.stopLines : THROUGHPUT_STOP_LINES,
    sideEffects: Array.isArray(summary.sideEffects) ? summary.sideEffects : [],
    rawPayloadRetained: summary.rawPayloadRetained === false ? false : true,
  };
}

function throughputSourceCommand(options = {}) {
  const workers = Number(options.workers) || DEFAULT_WORKERS;
  const cycles = Number(options.cycles) || DEFAULT_CYCLES;
  return `node ./scripts/manager-throughput-harness.mjs --workers ${workers} --cycles ${cycles} --write-proof --summary-json`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { options, result } = runManagerThroughputHarness();
    printPacket(result, options);
    if (!result.ok && result.status !== "help") process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
