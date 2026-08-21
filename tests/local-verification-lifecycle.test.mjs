import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createLocalVerificationPlan } from "../scripts/lib/local-verification/plan-adapter.mjs";
import { createSourceIdentity } from "../scripts/lib/local-verification/source-identity.mjs";
import { cancelOwnedRun, initialNodeStates, projectRun, reconcileOwnedRun, runOwnedPlan } from "../scripts/lib/local-verification/lifecycle.mjs";
import { estimateEta } from "../scripts/lib/local-verification/timing.mjs";
import { createShadowComparison, promotionStatus } from "../scripts/lib/local-verification/shadow.mjs";
import { createRunId, localVerificationState, readRun } from "../scripts/lib/local-verification/state-store.mjs";

function fixture() {
  const sourceIdentity = createSourceIdentity({ commit: "a".repeat(40), worktree: {}, planner: {}, environment: {} });
  return { sourceIdentity, plan: createLocalVerificationPlan({ changedFiles: ["docs/example.md"], sourceIdentity }) };
}

function closingSpawn(code) {
  return () => {
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("close", code, null));
    return child;
  };
}

test("owned runner executes approved nodes serially and records passed receipts", async () => {
  const { sourceIdentity, plan } = fixture();
  const state = localVerificationState({ stateRoot: mkdtempSync(join(tmpdir(), "local-verification-run-")) }, { repoRoot: process.cwd() });
  const startedAt = "2026-08-21T00:00:00.000Z";
  const result = await runOwnedPlan({ state, sourceIdentity, plan, runId: createRunId(plan.planId, startedAt), startedAt, clock: () => Date.parse("2026-08-21T00:00:01.000Z"), spawn: closingSpawn(0), resolveCommand: (command, args) => ({ command, args }) });
  assert.equal(result.status, "passed");
  assert.ok(result.nodeStates.every((node) => node.status === "passed"));
});

test("owned runner preserves independent work but blocks checks that depend on a failed fast gate", async () => {
  const { sourceIdentity, plan } = fixture();
  const state = localVerificationState({ stateRoot: mkdtempSync(join(tmpdir(), "local-verification-run-")) }, { repoRoot: process.cwd() });
  const startedAt = "2026-08-21T00:00:00.000Z";
  const runId = createRunId(plan.planId, startedAt);
  let count = 0;
  const result = await runOwnedPlan({ state, sourceIdentity, plan, runId, startedAt, clock: () => Date.parse("2026-08-21T00:00:01.000Z"), spawn: () => closingSpawn(count++ === 0 ? 1 : 0)(), resolveCommand: (command, args) => ({ command, args }) });
  assert.equal(result.status, "failed");
  assert.equal(result.nodeStates[0].status, "failed");
  assert.ok(result.nodeStates.slice(1, 3).every((node) => node.status === "passed"));
  assert.equal(result.nodeStates.at(-1).status, "blocked");
  assert.equal(readRun({ state, runId, sourceIdentity, plan }).status, "failed");
});

test("status projection stays read-only and reports elapsed work", () => {
  const nodes = initialNodeStates({ nodes: [{ nodeId: "node_a" }, { nodeId: "node_b" }] }, ["node_a"]);
  const projection = projectRun({ run_id: "run_a", plan_id: "plan_a", status: "running", started_at: "2026-08-21T00:00:00.000Z", nodes, first_failure: null }, { now: () => Date.parse("2026-08-21T00:00:03.000Z") });
  assert.equal(projection.elapsedMs, 3_000);
  assert.equal(projection.nodes[0].status, "reused");
  assert.equal(projection.nextAction, "poll-status");
  assert.equal(projection.etaMs, null);
  assert.equal(projection.reason, "insufficient-comparable-history");
});

test("ETA requires comparable bounded history and exposes its confidence", () => {
  assert.deepEqual(estimateEta({ pendingNodeIds: ["node_a"], samplesByNodeId: { node_a: [10, 20] } }), { etaMs: null, etaRangeMs: null, confidence: "insufficient", reason: "insufficient-comparable-history" });
  assert.deepEqual(estimateEta({ pendingNodeIds: ["node_a"], samplesByNodeId: { node_a: [10, 20, 30, 40] } }), { etaMs: 30, etaRangeMs: [0, 30], confidence: "low", reason: "bounded-median-history" });
});

test("reconciliation marks an unowned-dead running node unknown rather than passed", () => {
  const reconciled = reconcileOwnedRun({ status: "running", pid: 999, nodes: [{ node_id: "node_a", status: "running" }, { node_id: "node_b", status: "pending" }], first_failure: null }, { isProcessAlive: () => false });
  assert.equal(reconciled.status, "unknown");
  assert.deepEqual(reconciled.nodeStates.map((node) => node.status), ["unknown", "pending"]);
});

test("cancellation targets only a proven owned process group and preserves uncertainty", () => {
  const run = { status: "running", pid: 321, process_identity: "321:44", nodes: [{ node_id: "node_a", status: "running" }, { node_id: "node_b", status: "pending" }], first_failure: null };
  let target;
  const cancelled = cancelOwnedRun(run, { platform: "linux", processIdentity: () => "321:44", kill: (pid, signal) => { target = { pid, signal }; } });
  assert.deepEqual(target, { pid: -321, signal: "SIGTERM" });
  assert.equal(cancelled.status, "cancelling");
  assert.ok(cancelled.nodeStates.every((node) => node.status !== "cancelled"));
  const confirmed = reconcileOwnedRun({ ...run, status: "cancelling" }, { processIdentity: () => null, isProcessAlive: () => false });
  assert.equal(confirmed.status, "cancelled");
  assert.ok(confirmed.nodeStates.every((node) => node.status === "cancelled"));
  const uncertain = cancelOwnedRun(run, { platform: "linux", processIdentity: () => "321:44", kill: () => { const error = new Error("gone"); error.code = "ESRCH"; throw error; } });
  assert.equal(uncertain.status, "unknown");
  assert.equal(uncertain.nodeStates[0].status, "unknown");
  assert.equal(cancelOwnedRun(run, { platform: "linux", processIdentity: () => "321:45", kill: () => { throw new Error("must not signal"); } }).status, "unknown");
});

test("Shadow comparisons remain non-authoritative until configured exact evidence passes review", () => {
  const { sourceIdentity, plan } = fixture();
  const match = createShadowComparison({ sourceIdentity, plan, acceleratedStatus: "passed", governedStatus: "passed", governedDurationMs: 50, now: "2026-08-21T00:00:00.000Z" });
  assert.equal(match.outcome, "matched");
  assert.deepEqual(promotionStatus({ comparisons: [match] }), { status: "unavailable", reason: "promotion-policy-not-configured", fallback: "pnpm run check" });
  const mismatch = createShadowComparison({ sourceIdentity, plan, acceleratedStatus: "failed", governedStatus: "passed", governedDurationMs: 50, now: "2026-08-21T00:00:01.000Z" });
  assert.equal(mismatch.outcome, "mismatch");
  assert.equal(promotionStatus({ comparisons: [match, mismatch], policy: { approved: true, minimumMatches: 1 } }).reason, "shadow-mismatch");
});
