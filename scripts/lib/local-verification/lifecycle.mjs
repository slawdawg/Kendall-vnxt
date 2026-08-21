import { spawn as defaultSpawn } from "node:child_process";
import { readFileSync } from "node:fs";

import { assertPlanResponse, createPlanResponse } from "./contracts.mjs";
import { persistReceipt, persistRun, readRun } from "./state-store.mjs";
import { resolveWorkspaceCommand } from "../workspace-command-resolution.mjs";
import { estimateEta } from "./timing.mjs";

const TERMINAL_NODE_STATES = new Set(["passed", "failed", "reused", "blocked", "cancelled", "unknown", "superseded"]);

// Linux exposes a monotonic process-start tick in /proc. Pairing it with the
// PID prevents a stale durable record from ever signalling a recycled process.
// Platforms without this proof fail closed for cancellation/reconciliation.
export function ownedProcessIdentity(pid, { readFile = readFileSync, platform = process.platform } = {}) {
  if (platform === "win32" || !Number.isInteger(pid) || pid < 1) return null;
  try {
    const stat = readFile(`/proc/${pid}/stat`, "utf8");
    const close = stat.lastIndexOf(")");
    const fields = stat.slice(close + 2).trim().split(/\s+/);
    const startTicks = fields[19];
    return /^\d+$/.test(startTicks || "") ? `${pid}:${startTicks}` : null;
  } catch { return null; }
}

function nowIso(clock) {
  return new Date(clock()).toISOString();
}

export function initialNodeStates(plan, reusedNodeIds = []) {
  const reused = new Set(reusedNodeIds);
  return plan.nodes.map((node) => ({ node_id: node.nodeId, status: reused.has(node.nodeId) ? "reused" : "pending" }));
}

export function projectRun(record, { now = Date.now, samplesByNodeId = {}, plan } = {}) {
  const elapsedMs = Math.max(0, now() - Date.parse(record.started_at));
  const failedNode = plan?.nodes?.find((node) => node.nodeId === record.first_failure?.node_id);
  const firstFailure = record.first_failure ? { nodeId: record.first_failure.node_id, code: record.first_failure.code, commandText: failedNode?.commandText || null, rationale: failedNode?.rationale || [] } : null;
  const pending = record.nodes.filter((node) => !TERMINAL_NODE_STATES.has(node.status)).length;
  return {
    runId: record.run_id,
    planId: record.plan_id,
    status: record.status,
    elapsedMs,
    nodes: record.nodes.map((node) => {
      const definition = plan?.nodes?.find((candidate) => candidate.nodeId === node.node_id);
      return { nodeId: node.node_id, status: node.status, commandText: definition?.commandText || null, rationale: definition?.rationale || [] };
    }),
    nextAction: record.status === "failed" ? "fix-first-actionable-failure" : record.status === "passed" ? "governed-check-remains-required" : ["running", "cancelling"].includes(record.status) ? "poll-status" : "resume-or-start",
    firstActionableFailure: firstFailure,
    pendingNodes: pending,
    ...estimateEta({ pendingNodeIds: record.nodes.filter((node) => !TERMINAL_NODE_STATES.has(node.status)).map((node) => node.node_id), samplesByNodeId }),
  };
}

export function reconcileOwnedRun(record, { isProcessAlive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } }, processIdentity = ownedProcessIdentity } = {}) {
  if (!["running", "cancelling"].includes(record.status) || !Number.isInteger(record.pid) || record.pid < 1) return { status: record.status, nodeStates: record.nodes, firstFailure: record.first_failure };
  if (record.process_identity && record.process_identity === processIdentity(record.pid) && isProcessAlive(record.pid)) return { status: record.status, nodeStates: record.nodes, firstFailure: record.first_failure };
  if (record.status === "cancelling" && record.process_identity && record.process_identity !== processIdentity(record.pid)) {
    return { status: "cancelled", nodeStates: record.nodes.map((node) => ({ ...node, status: ["pending", "running"].includes(node.status) ? "cancelled" : node.status })), firstFailure: record.first_failure };
  }
  const nodeStates = record.nodes.map((node) => ({ ...node, status: node.status === "running" ? "unknown" : node.status }));
  return { status: "unknown", nodeStates, firstFailure: record.first_failure };
}

export function cancelOwnedRun(record, { kill = process.kill, platform = process.platform, processIdentity = ownedProcessIdentity } = {}) {
  if (["passed", "failed", "cancelled", "superseded"].includes(record.status)) return { status: record.status, nodeStates: record.nodes, firstFailure: record.first_failure };
  if (!["planned", "running", "unknown"].includes(record.status) || !Number.isInteger(record.pid) || record.pid < 1 || !record.process_identity || record.process_identity !== processIdentity(record.pid)) return { status: "unknown", nodeStates: record.nodes.map((node) => ({ ...node, status: node.status === "running" ? "unknown" : node.status })), firstFailure: record.first_failure };
  try {
    kill(platform === "win32" ? record.pid : -record.pid, record.status === "cancelling" ? "SIGKILL" : "SIGTERM");
    return { status: "cancelling", nodeStates: record.nodes, firstFailure: record.first_failure };
  } catch (error) {
    if (error?.code === "ESRCH") return { status: "unknown", nodeStates: record.nodes.map((node) => ({ ...node, status: node.status === "running" ? "unknown" : node.status })), firstFailure: record.first_failure };
    throw error;
  }
}

function validatePlan(sourceIdentity, plan) {
  return assertPlanResponse(createPlanResponse({ sourceIdentity, plan })).result;
}

function waitForClose(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code: Number.isInteger(code) ? code : 1, signal: signal || null }));
  });
}

export async function runOwnedPlan({ state, sourceIdentity, plan, runId, reusedNodeIds = [], startedAt, cwd = process.cwd(), clock = Date.now, spawn = defaultSpawn, resolveCommand = resolveWorkspaceCommand, onRecord } = {}) {
  const checked = validatePlan(sourceIdentity, plan);
  const nodeStates = initialNodeStates(checked, reusedNodeIds);
  const save = (status, firstFailure = null) => {
    let existing;
    try {
      existing = readRun({ state, runId, sourceIdentity, plan: checked });
      if (existing.status === "superseded") return false;
    } catch {
      // The initial state write happens before a readable run exists.
    }
    const result = persistRun({ state, sourceIdentity, plan: checked, runId, status, nodeStates, pid: existing?.pid ?? process.pid, processIdentity: existing?.process_identity ?? ownedProcessIdentity(process.pid), ownerToken: existing?.owner_token ?? null, startedAt, updatedAt: nowIso(clock), firstFailure });
    onRecord?.(result);
    return true;
  };
  save("running");
  let firstFailure = null;
  for (let index = 0; index < checked.nodes.length; index += 1) {
    const node = checked.nodes[index];
    if (nodeStates[index].status === "reused") continue;
    if (node.dependsOn.some((nodeId) => nodeStates.some((state) => state.node_id === nodeId && ["failed", "blocked", "cancelled", "unknown", "superseded"].includes(state.status)))) {
      nodeStates[index].status = "blocked";
      if (!save("running", firstFailure)) return { status: "superseded", nodeStates, firstFailure: null };
      continue;
    }
    nodeStates[index].status = "running";
    if (!save("running", firstFailure)) return { status: "superseded", nodeStates, firstFailure: null };
    const resolved = resolveCommand(node.command[0], node.command.slice(1));
    const nodeStartedAt = clock();
    let outcome;
    try {
      // The worker is the one detached owned process group. Node commands stay
      // in that group, so cancellation never leaves a verification descendant.
      const child = spawn(resolved.command, resolved.args, { cwd, env: resolved.env ?? process.env, shell: false, stdio: "ignore", detached: false });
      outcome = await waitForClose(child);
    } catch (error) {
      outcome = { code: 1, signal: null, error };
    }
    if (outcome.code === 0 && !outcome.signal) {
      nodeStates[index].status = "passed";
      persistReceipt({ state, sourceIdentity, plan: checked, node, status: "passed", durationMs: Math.max(0, clock() - nodeStartedAt), now: nowIso(clock) });
      if (!save("running", firstFailure)) return { status: "superseded", nodeStates, firstFailure: null };
      continue;
    }
    nodeStates[index].status = "failed";
    firstFailure = { node_id: node.nodeId, code: outcome.signal ? `signal-${outcome.signal}` : `exit-${outcome.code}` };
    if (!save("running", firstFailure)) return { status: "superseded", nodeStates, firstFailure: null };
  }
  if (firstFailure) {
    if (!save("failed", firstFailure)) return { status: "superseded", nodeStates, firstFailure: null };
    return { status: "failed", nodeStates, firstFailure };
  }
  if (!save("passed")) return { status: "superseded", nodeStates, firstFailure: null };
  return { status: "passed", nodeStates, firstFailure: null };
}
