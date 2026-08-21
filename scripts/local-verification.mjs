#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawn as defaultSpawn, spawnSync as defaultSpawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { buildCheckPlan, collectChangedFiles } from "./check-plan.mjs";
import {
  LocalVerificationError,
  assertPlanResponse,
  createErrorResponse,
  createPlanResponse,
} from "./lib/local-verification/contracts.mjs";
import { createLocalVerificationPlan } from "./lib/local-verification/plan-adapter.mjs";
import { createCurrentSourceIdentity } from "./lib/local-verification/source-identity.mjs";
import { resolveWorkspaceCommand } from "./lib/workspace-command-resolution.mjs";
import { cancelOwnedRun, initialNodeStates, ownedProcessIdentity, projectRun, reconcileOwnedRun, runOwnedPlan } from "./lib/local-verification/lifecycle.mjs";
import { activeRuns, createRunId, localVerificationState, persistPlan, persistRun, persistShadowComparison, readPlan, reusableReceipts, runsForPlan, shadowComparisons, supersedePriorPlans, supersedePriorRuns, timingSamplesForPlan, withStartClaim } from "./lib/local-verification/state-store.mjs";
import { createShadowComparison, promotionStatus } from "./lib/local-verification/shadow.mjs";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

export function parseLocalVerificationArgs(argv = process.argv.slice(2)) {
  const options = { command: "", json: false, files: [], base: "origin/dev", head: "HEAD", persist: false, stateRoot: undefined, planId: undefined, runId: undefined, ownerToken: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (!options.command && !arg.startsWith("-")) {
      options.command = arg;
      continue;
    }
    if (arg === "--json") options.json = true;
    else if (arg === "--persist") options.persist = true;
    else if (arg === "--files") {
      const rawFiles = argv[++index];
      if (!rawFiles || rawFiles.startsWith("--")) {
        throw new LocalVerificationError("invalid-argument", "--files requires a comma-delimited value.", "Provide --files path1,path2 or omit it to use Git discovery.");
      }
      options.files = rawFiles.split(",").map((file) => file.trim()).filter(Boolean);
    } else if (arg === "--base" || arg === "--head" || arg === "--state-root" || arg === "--plan-id" || arg === "--run-id" || arg === "--owner-token") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) {
        throw new LocalVerificationError("invalid-argument", `${arg} requires a value.`, `Provide a value for ${arg} or omit it to use the default.`);
      }
      options[arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
    }
    else throw new LocalVerificationError("invalid-argument", `Unknown option: ${arg}`, "Run local-verification plan --json [--files path1,path2] [--persist].");
  }
  if (!["plan", "start", "status", "resume", "cancel", "shadow", "promotion-status", "internal-worker"].includes(options.command)) {
    throw new LocalVerificationError("unsupported-command", `Unsupported local verification command: ${options.command || "(none)"}`, "Use plan, start, status, resume, cancel, shadow, or promotion-status.");
  }
  if (!options.json) {
    throw new LocalVerificationError("json-required", "Local verification v1 requires --json.", "Run local-verification <command> --json.");
  }
  return options;
}

function packageEnvironment({ env = process.env, processExecPath = process.execPath } = {}) {
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const pnpmProbe = resolveWorkspaceCommand("pnpm", ["--version"], { env, processExecPath });
  return {
    node: process.versions.node,
    declaredPnpm: packageJson.engines?.pnpm || "unknown",
    pnpmProbe: { command: pnpmProbe.command, args: pnpmProbe.args },
    npmExecPath: env.npm_execpath || null,
    path: env.PATH || null,
  };
}

function sourceUnavailable(error) {
  if (error instanceof LocalVerificationError) throw error;
  throw new LocalVerificationError("source-unavailable", "Could not collect the local source state.", "Ensure the selected Git base and head refs are available, then retry.");
}

export function createPlan({
  files,
  base,
  head,
  cwd = rootDir,
  collectChanges = collectChangedFiles,
  createIdentity = createCurrentSourceIdentity,
  environment = packageEnvironment(),
  buildPlan = buildCheckPlan,
} = {}) {
  let discoveredChangedFiles;
  try {
    // Validate refs even for an explicit affected-file request and include every
    // dirty input in the identity that a later receipt may reuse.
    discoveredChangedFiles = collectChanges({ base, head });
  } catch (error) {
    sourceUnavailable(error);
  }
  const changedFiles = [...new Set([...(files || []), ...discoveredChangedFiles])].sort();
  let checkPlan;
  try {
    checkPlan = buildPlan(changedFiles, { base, head });
  } catch {
    // The adapter turns unavailable planner output into the fixed governed
    // control; it never returns a partial focused selection.
    checkPlan = undefined;
  }
  const sourceIdentity = createIdentity({
    cwd,
    planner: checkPlan || { status: "planner-unavailable" },
    environment,
    changedFiles,
  });
  const plan = createLocalVerificationPlan({
    changedFiles,
    sourceIdentity,
    buildPlan: () => checkPlan,
    canonicalPlan: buildCheckPlan(changedFiles, { base, head }),
  });
  return assertPlanResponse(createPlanResponse({ sourceIdentity, plan }));
}

function commandFromArgv(argv) {
  return argv.find((arg) => !arg.startsWith("-")) || "plan";
}

function lifecycleResponse(command, response, result) {
  return { schemaVersion: response.schemaVersion, command, ok: true, status: result.status, sourceIdentity: response.sourceIdentity, result };
}

function stateFor(options, stateFactory) {
  return stateFactory({ stateRoot: options.stateRoot }, { repoRoot: rootDir, cwd: rootDir });
}

function currentPlan(options, planFactory) {
  return planFactory(options);
}

function startRun({ command = "start", options, response, state, planWriter, receiptSelector, superseder, runSuperseder = supersedePriorRuns, runWriter, activeRunReader, spawn = defaultSpawn, processIdentity = ownedProcessIdentity, now = Date.now }) {
  const plan = response.result;
  const active = activeRunReader({ state, sourceIdentity: response.sourceIdentity, plan });
  if (active.length > 0) return lifecycleResponse(command, response, { ...projectRun(active[0], { now, plan }), duplicate: true });
  const reusedNodeIds = receiptSelector({ state, sourceIdentity: response.sourceIdentity, plan }).map((receipt) => receipt.node_id).sort();
  const supersededPlanIds = superseder({ state, sourceIdentity: response.sourceIdentity, plan });
  const supersededRunIds = runSuperseder({ state, sourceIdentity: response.sourceIdentity, plan });
  planWriter({ state, sourceIdentity: response.sourceIdentity, plan, reusedNodeIds });
  const startedAt = new Date(now()).toISOString();
  const runId = createRunId(plan.planId, startedAt);
  const ownerToken = randomUUID();
  const nodes = initialNodeStates(plan, reusedNodeIds);
  runWriter({ state, sourceIdentity: response.sourceIdentity, plan, runId, status: "planned", nodeStates: nodes, ownerToken, startedAt });
  const workerArgs = [fileURLToPath(import.meta.url), "internal-worker", "--json", "--plan-id", plan.planId, "--run-id", runId, "--owner-token", ownerToken];
  if (options.files.length > 0) workerArgs.push("--files", options.files.join(","));
  if (options.base !== "origin/dev") workerArgs.push("--base", options.base);
  if (options.head !== "HEAD") workerArgs.push("--head", options.head);
  if (options.stateRoot) workerArgs.push("--state-root", options.stateRoot);
  const child = spawn(process.execPath, workerArgs, { cwd: rootDir, detached: process.platform !== "win32", stdio: "ignore", shell: false });
  if (!Number.isInteger(child.pid) || child.pid < 1) {
    runWriter({ state, sourceIdentity: response.sourceIdentity, plan, runId, status: "unknown", nodeStates: nodes, startedAt });
    throw new LocalVerificationError("worker-launch-failed", "Could not launch the owned verification worker.", "Retry start after checking local process capacity.");
  }
  child.unref?.();
  const workerIdentity = processIdentity(child.pid);
  if (!workerIdentity) {
    runWriter({ state, sourceIdentity: response.sourceIdentity, plan, runId, status: "unknown", nodeStates: nodes, pid: child.pid, ownerToken, startedAt });
    throw new LocalVerificationError("worker-identity-unavailable", "Could not prove ownership of the verification worker.", "Retry start on a platform with process identity support.");
  }
  runWriter({ state, sourceIdentity: response.sourceIdentity, plan, runId, status: "running", nodeStates: nodes, pid: child.pid, processIdentity: workerIdentity, ownerToken, startedAt });
  return lifecycleResponse(command, response, { runId, planId: plan.planId, status: "running", duplicate: false, reusedNodeIds, supersededPlanIds, supersededRunIds, nextAction: "poll-status" });
}

function sameIdentity(left, right) {
  return ["schemaVersion", "commit", "worktreeFingerprint", "plannerDigest", "commandDigest", "environmentDigest"].every((field) => left?.[field] === right?.[field]);
}

function recordShadow({ options, response, state, planFactory, runReader, shadowWriter, shadowReader, controlRunner = defaultSpawnSync, now = Date.now }) {
  const run = runReader({ state, sourceIdentity: response.sourceIdentity, plan: response.result }).at(-1);
  if (!run || !["passed", "failed", "cancelled", "unknown", "superseded"].includes(run.status)) throw new LocalVerificationError("shadow-run-unavailable", "Shadow comparison requires a terminal local verification run.", "Start and wait for local verification before running shadow.");
  const startedAt = now();
  const resolved = resolveWorkspaceCommand("pnpm", ["run", "check"]);
  const outcome = controlRunner(resolved.command, resolved.args, { cwd: rootDir, env: resolved.env ?? process.env, shell: false, stdio: "ignore" });
  const after = currentPlan(options, planFactory);
  if (!sameIdentity(after.sourceIdentity, response.sourceIdentity)) throw new LocalVerificationError("shadow-source-changed", "Source changed while the governed control was running.", "Run a new local verification plan before recording Shadow evidence.");
  const comparison = createShadowComparison({ sourceIdentity: response.sourceIdentity, plan: response.result, acceleratedStatus: run.status, governedStatus: outcome.status === 0 ? "passed" : "failed", governedDurationMs: Math.max(0, now() - startedAt), now: new Date(now()).toISOString() });
  const saved = shadowWriter({ state, comparison });
  return lifecycleResponse("shadow", response, { ...saved, outcome: comparison.outcome, promotion: promotionStatus({ comparisons: shadowReader({ state, sourceIdentity: response.sourceIdentity }) }) });
}

async function runWorker(options, { planFactory, stateFactory, runReader, runner }) {
  if (!options.planId || !options.runId || !options.ownerToken) throw new LocalVerificationError("invalid-argument", "internal worker requires its owned plan and run identity.", "Start verification through the public start command.");
  const response = currentPlan(options, planFactory);
  if (response.result.planId !== options.planId) throw new LocalVerificationError("superseded", "The worker source no longer matches its planned verification.", "Run start again for the current source.");
  const state = stateFor(options, stateFactory);
  const record = readPlan({ state, planId: options.planId, sourceIdentity: response.sourceIdentity });
  const runs = runReader({ state, sourceIdentity: response.sourceIdentity, plan: record.plan });
  const run = runs.find((candidate) => candidate.run_id === options.runId);
  if (!run || run.status !== "running" || run.owner_token !== options.ownerToken || run.pid !== process.pid || run.process_identity !== ownedProcessIdentity(process.pid)) throw new LocalVerificationError("run-unavailable", "The owned verification run is no longer active.", "Run start again for the current source.");
  return runner({ state, sourceIdentity: response.sourceIdentity, plan: record.plan, runId: run.run_id, reusedNodeIds: record.reused_node_ids, startedAt: run.started_at, cwd: rootDir });
}

export function main(
  argv = process.argv.slice(2),
  { stdout = process.stdout, stderr = process.stderr } = {},
  { planFactory = createPlan, stateFactory = localVerificationState, planWriter = persistPlan, receiptSelector = reusableReceipts, superseder = supersedePriorPlans, runSuperseder = supersedePriorRuns, runWriter = persistRun, activeRunReader = activeRuns, runReader = runsForPlan, timingReader = timingSamplesForPlan, shadowWriter = persistShadowComparison, shadowReader = shadowComparisons, controlRunner = defaultSpawnSync, startClaim = withStartClaim, spawn = defaultSpawn, processIdentity = ownedProcessIdentity, now = Date.now, runner = runOwnedPlan, reconciler = reconcileOwnedRun, canceler = cancelOwnedRun } = {},
) {
  let options;
  try {
    options = parseLocalVerificationArgs(argv);
    if (options.command === "internal-worker") {
      return runWorker(options, { planFactory, stateFactory, runReader: runsForPlan, runner }).then(() => 0).catch((error) => {
        const response = createErrorResponse({ command: options.command, error });
        stderr.write(`${response.error.code}: ${response.error.message}\n`);
        return 1;
      });
    }
    const response = currentPlan(options, planFactory);
    if (options.command === "promotion-status") {
      const state = stateFor(options, stateFactory);
      stdout.write(`${JSON.stringify(lifecycleResponse("promotion-status", response, promotionStatus({ comparisons: shadowReader({ state, sourceIdentity: response.sourceIdentity }) })))}\n`);
      return 0;
    }
    if (options.command === "shadow") {
      const state = stateFor(options, stateFactory);
      const result = recordShadow({ options, response, state, planFactory, runReader, shadowWriter, shadowReader, controlRunner, now });
      stdout.write(`${JSON.stringify(result)}\n`);
      return 0;
    }
    if (options.command === "start") {
      const state = stateFor(options, stateFactory);
      const result = startClaim({ state, planId: response.result.planId, action: () => startRun({ options, response, state, planWriter, receiptSelector, superseder, runSuperseder, runWriter, activeRunReader, spawn, processIdentity, now }) });
      stdout.write(`${JSON.stringify(result)}\n`);
      return 0;
    }
    if (options.command === "status" || options.command === "resume" || options.command === "cancel") {
      const state = stateFor(options, stateFactory);
      const runs = runReader({ state, sourceIdentity: response.sourceIdentity, plan: response.result });
      let record = runs.at(-1);
      if ((options.command === "resume" || options.command === "status") && record) {
        const reconciled = reconciler(record);
        if (reconciled.status !== record.status) {
          runWriter({ state, sourceIdentity: response.sourceIdentity, plan: response.result, runId: record.run_id, status: reconciled.status, nodeStates: reconciled.nodeStates, pid: record.pid, processIdentity: record.process_identity, ownerToken: record.owner_token, startedAt: record.started_at, updatedAt: new Date(now()).toISOString(), firstFailure: reconciled.firstFailure });
          record = { ...record, status: reconciled.status, nodes: reconciled.nodeStates, first_failure: reconciled.firstFailure };
        }
        // A recoverable run never holds the start claim open.  Relaunch it as
        // a new owned worker; completed nodes are selected from immutable
        // receipts, while incomplete nodes receive fresh execution evidence.
        if (options.command === "resume" && ["unknown", "failed", "cancelled", "superseded"].includes(record.status)) {
          const result = startClaim({ state, planId: response.result.planId, action: () => startRun({ command: "resume", options, response, state, planWriter, receiptSelector, superseder, runSuperseder, runWriter, activeRunReader, spawn, processIdentity, now }) });
          stdout.write(`${JSON.stringify(result)}\n`);
          return 0;
        }
      }
      if (options.command === "resume" && !record) {
        const result = startClaim({ state, planId: response.result.planId, action: () => startRun({ command: "resume", options, response, state, planWriter, receiptSelector, superseder, runSuperseder, runWriter, activeRunReader, spawn, processIdentity, now }) });
        stdout.write(`${JSON.stringify(result)}\n`);
        return 0;
      }
      if (options.command === "cancel" && record) {
        const cancelled = canceler(record);
        runWriter({ state, sourceIdentity: response.sourceIdentity, plan: response.result, runId: record.run_id, status: cancelled.status, nodeStates: cancelled.nodeStates, pid: record.pid, processIdentity: record.process_identity, ownerToken: record.owner_token, startedAt: record.started_at, updatedAt: new Date(now()).toISOString(), firstFailure: cancelled.firstFailure });
        record = { ...record, status: cancelled.status, nodes: cancelled.nodeStates, first_failure: cancelled.firstFailure };
      }
      const result = record ? projectRun(record, { now, plan: response.result, samplesByNodeId: timingReader({ state, plan: response.result }) }) : { planId: response.result.planId, status: "idle", elapsedMs: 0, nodes: response.result.nodes.map((node) => ({ nodeId: node.nodeId, status: "pending", commandText: node.commandText, rationale: node.rationale })), nextAction: "start", firstActionableFailure: null, pendingNodes: response.result.nodes.length, etaMs: null, etaRangeMs: null, confidence: "insufficient", reason: "insufficient-comparable-history" };
      stdout.write(`${JSON.stringify(lifecycleResponse(options.command, response, result))}\n`);
      return 0;
    }
    if (options.persist) {
      const state = stateFor(options, stateFactory);
      const reusedReceipts = receiptSelector({ state, sourceIdentity: response.sourceIdentity, plan: response.result });
      const reusedNodeIds = reusedReceipts.map((receipt) => receipt.node_id).sort();
      const supersededPlanIds = superseder({ state, sourceIdentity: response.sourceIdentity, plan: response.result });
      const saved = planWriter({ state, sourceIdentity: response.sourceIdentity, plan: response.result, reusedNodeIds });
      response.state = { ...saved, reusedNodeIds, supersededPlanIds };
    }
    stdout.write(`${JSON.stringify(response)}\n`);
    return 0;
  } catch (error) {
    const response = createErrorResponse({ command: options?.command || commandFromArgv(argv), error });
    stdout.write(`${JSON.stringify(response)}\n`);
    stderr.write(`${response.error.code}: ${response.error.message}\n`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = main();
  if (result && typeof result.then === "function") result.then((code) => { process.exitCode = code; });
  else process.exitCode = result;
}
