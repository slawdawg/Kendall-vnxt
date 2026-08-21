import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { createLocalVerificationPlan } from "../scripts/lib/local-verification/plan-adapter.mjs";
import { sha256 } from "../scripts/lib/local-verification/contracts.mjs";
import { createSourceIdentity } from "../scripts/lib/local-verification/source-identity.mjs";
import { createShadowComparison } from "../scripts/lib/local-verification/shadow.mjs";
import { LocalVerificationStateError, activeRuns, createRunId, localVerificationState, persistPlan, persistReceipt, persistRun, persistShadowComparison, readPlan, readReceipt, readRun, reusableReceipts, runsForPlan, supersedePriorPlans, timingSamplesForPlan, withStartClaim } from "../scripts/lib/local-verification/state-store.mjs";

function fixture(root) {
  const sourceIdentity = createSourceIdentity({ commit: "a".repeat(40), worktree: {}, planner: {}, environment: {} });
  const plan = createLocalVerificationPlan({ changedFiles: ["docs/example.md"], sourceIdentity });
  return { root, sourceIdentity, plan };
}

test("persists bounded source-bound plans and immutable receipts outside source", () => {
  const root = mkdtempSync(join(tmpdir(), "local-verification-state-"));
  const { sourceIdentity, plan } = fixture(root);
  const state = localVerificationState({ stateRoot: root }, { repoRoot: process.cwd() });
  const saved = persistPlan({ state, sourceIdentity, plan });
  assert.equal(saved.planId, plan.planId);
  assert.deepEqual(readPlan({ state, planId: plan.planId, sourceIdentity }).source_identity, sourceIdentity);
  assert.throws(() => readPlan({ state, planId: plan.planId, sourceIdentity: { ...sourceIdentity, commit: "b".repeat(40) } }), (error) => error instanceof LocalVerificationStateError && error.code === "SOURCE_IDENTITY_MISMATCH");
  persistReceipt({ state, sourceIdentity, plan, node: plan.nodes[0], status: "passed", durationMs: 5 });
  assert.equal(readReceipt({ state, receiptId: `${plan.planId}-${plan.nodes[0].nodeId}`, sourceIdentity, plan }).status, "passed");
  assert.throws(() => readReceipt({ state, receiptId: `${plan.planId}-${plan.nodes[0].nodeId}`, sourceIdentity: { ...sourceIdentity, commit: "b".repeat(40) }, plan }), (error) => error instanceof LocalVerificationStateError && error.code === "INVALID_PLAN");
  assert.throws(() => persistReceipt({ state, sourceIdentity, plan, node: plan.nodes[0], status: "passed", durationMs: 5 }), (error) => error instanceof LocalVerificationStateError && error.code === "RECEIPT_EXISTS");
});

test("rejects unsafe roots and malformed or symlinked records without repair", () => {
  const root = mkdtempSync(join(tmpdir(), "local-verification-state-"));
  assert.throws(() => localVerificationState({ stateRoot: process.cwd() }, { repoRoot: process.cwd() }), (error) => error instanceof LocalVerificationStateError && error.code === "UNSAFE_STATE_ROOT");
  const { sourceIdentity, plan } = fixture(root);
  const state = localVerificationState({ stateRoot: root }, { repoRoot: process.cwd() });
  persistPlan({ state, sourceIdentity, plan });
  const planPath = join(state.plansDir, `${plan.planId}.json`);
  writeFileSync(planPath, "{}\n");
  assert.throws(() => readPlan({ state, planId: plan.planId, sourceIdentity }), (error) => error instanceof LocalVerificationStateError && error.code === "INVALID_RECORD");
  assert.ok(existsSync(planPath));
  assert.ok(lstatSync(planPath).isFile());
  writeFileSync(planPath, "x".repeat(16_385));
  assert.throws(() => readPlan({ state, planId: plan.planId, sourceIdentity }), (error) => error instanceof LocalVerificationStateError && error.code === "INVALID_RECORD");
  symlinkSync("/dev/null", join(state.plansDir, "plan_bad.json"));
  assert.throws(() => readPlan({ state, planId: "plan_bad", sourceIdentity }), (error) => error instanceof LocalVerificationStateError);
});

test("refuses a symlinked state ancestor before it creates a plan record", () => {
  const root = mkdtempSync(join(tmpdir(), "local-verification-state-"));
  const outside = mkdtempSync(join(tmpdir(), "local-verification-outside-"));
  const { sourceIdentity, plan } = fixture(root);
  const state = localVerificationState({ stateRoot: root }, { repoRoot: process.cwd() });
  symlinkSync(outside, state.root);
  assert.throws(() => persistPlan({ state, sourceIdentity, plan }), (error) => error instanceof LocalVerificationStateError && error.code === "UNSAFE_STATE_PATH");
  assert.equal(existsSync(join(outside, "plans", `${plan.planId}.json`)), false);
});

test("enforces bounded receipt retention before publishing another receipt", () => {
  const root = mkdtempSync(join(tmpdir(), "local-verification-state-"));
  const { sourceIdentity, plan } = fixture(root);
  const state = localVerificationState({ stateRoot: root, maxReceipts: 1 }, { repoRoot: process.cwd() });
  persistReceipt({ state, sourceIdentity, plan, node: plan.nodes[0], status: "passed", durationMs: 1 });
  assert.throws(() => persistReceipt({ state, sourceIdentity, plan, node: plan.nodes[1], status: "passed", durationMs: 1 }), (error) => error instanceof LocalVerificationStateError && error.code === "RETENTION_LIMIT");
});

test("reuses only the exact passed receipt bound to the canonical plan and source", () => {
  const root = mkdtempSync(join(tmpdir(), "local-verification-state-"));
  const { sourceIdentity, plan } = fixture(root);
  const state = localVerificationState({ stateRoot: root }, { repoRoot: process.cwd() });
  persistPlan({ state, sourceIdentity, plan });
  persistReceipt({ state, sourceIdentity, plan, node: plan.nodes[0], status: "passed", durationMs: 1 });
  assert.deepEqual(reusableReceipts({ state, sourceIdentity, plan }).map((receipt) => receipt.node_id), [plan.nodes[0].nodeId]);
  const changedIdentity = { ...sourceIdentity, environmentDigest: `sha256:${"b".repeat(64)}` };
  const changedPlan = createLocalVerificationPlan({ changedFiles: ["docs/example.md"], sourceIdentity: changedIdentity });
  assert.deepEqual(reusableReceipts({ state, sourceIdentity: changedIdentity, plan: changedPlan }), []);
});

test("reuses an unchanged focused surface across a small edit, but never the edited surface", () => {
  const root = mkdtempSync(join(tmpdir(), "local-verification-state-"));
  const state = localVerificationState({ stateRoot: root }, { repoRoot: process.cwd() });
  const base = { commit: "a".repeat(40), planner: { selected: ["docs", "manager"] }, environment: { node: "22" } };
  const beforeIdentity = createSourceIdentity({ ...base, worktree: { revision: 1 }, surfaceFingerprints: { docs: `sha256:${"1".repeat(64)}`, manager: `sha256:${"2".repeat(64)}` } });
  const afterIdentity = createSourceIdentity({ ...base, worktree: { revision: 2 }, surfaceFingerprints: { docs: `sha256:${"3".repeat(64)}`, manager: `sha256:${"2".repeat(64)}` } });
  const changedFiles = ["docs/example.md", "scripts/manager-control-plane.mjs"];
  const before = createLocalVerificationPlan({ changedFiles, sourceIdentity: beforeIdentity });
  const after = createLocalVerificationPlan({ changedFiles, sourceIdentity: afterIdentity });
  persistPlan({ state, sourceIdentity: beforeIdentity, plan: before });
  const manager = before.nodes.find((node) => node.commandText === "pnpm run check:manager-control-plane");
  const docs = before.nodes.find((node) => node.commandText === "pnpm run check:docs");
  persistReceipt({ state, sourceIdentity: beforeIdentity, plan: before, node: manager, status: "passed", durationMs: 1 });
  persistReceipt({ state, sourceIdentity: beforeIdentity, plan: before, node: docs, status: "passed", durationMs: 1 });
  const reused = reusableReceipts({ state, sourceIdentity: afterIdentity, plan: after }).map((receipt) => receipt.node_id);
  assert.deepEqual(reused, [after.nodes.find((node) => node.commandText === "pnpm run check:manager-control-plane").nodeId]);
});

test("supersedes prior source plans so their terminal state cannot support a new plan", () => {
  const root = mkdtempSync(join(tmpdir(), "local-verification-state-"));
  const { sourceIdentity, plan } = fixture(root);
  const state = localVerificationState({ stateRoot: root }, { repoRoot: process.cwd() });
  persistPlan({ state, sourceIdentity, plan, status: "passed" });
  const newerIdentity = { ...sourceIdentity, worktreeFingerprint: `sha256:${"c".repeat(64)}` };
  const newerPlan = createLocalVerificationPlan({ changedFiles: ["docs/example.md"], sourceIdentity: newerIdentity });
  assert.deepEqual(supersedePriorPlans({ state, sourceIdentity: newerIdentity, plan: newerPlan }), [plan.planId]);
  assert.equal(readPlan({ state, planId: plan.planId, sourceIdentity }).status, "superseded");
});

test("rejects forged identities, nodes, and oversized evidence before publication", () => {
  const root = mkdtempSync(join(tmpdir(), "local-verification-state-"));
  const { sourceIdentity, plan } = fixture(root);
  const state = localVerificationState({ stateRoot: root }, { repoRoot: process.cwd() });
  assert.throws(() => persistPlan({ state, sourceIdentity: { ...sourceIdentity, schemaVersion: "forged/v1" }, plan }), (error) => error instanceof LocalVerificationStateError && error.code === "INVALID_PLAN");
  assert.throws(() => persistReceipt({ state, sourceIdentity, plan, node: { ...plan.nodes[0], command: ["pnpm", "run", "forged"] }, status: "passed", durationMs: 1 }), (error) => error instanceof LocalVerificationStateError && error.code === "INVALID_RECEIPT");
  const oversized = { ...plan, surfaces: ["x".repeat(20_000)] };
  const { planId: _priorPlanId, ...oversizedContents } = oversized;
  oversized.planId = `plan_${sha256({ sourceIdentity, ...oversizedContents })}`;
  assert.throws(() => persistPlan({ state, sourceIdentity, plan: oversized }), (error) => error instanceof LocalVerificationStateError && error.code === "RECORD_TOO_LARGE");
});

test("persists and revalidates a bounded source-bound lifecycle run", () => {
  const root = mkdtempSync(join(tmpdir(), "local-verification-state-"));
  const { sourceIdentity, plan } = fixture(root);
  const state = localVerificationState({ stateRoot: root }, { repoRoot: process.cwd() });
  const startedAt = "2026-08-21T00:00:00.000Z";
  const runId = createRunId(plan.planId, startedAt);
  persistRun({ state, sourceIdentity, plan, runId, status: "running", nodeStates: plan.nodes.map((node) => ({ node_id: node.nodeId, status: "pending" })), pid: 123, startedAt });
  assert.equal(readRun({ state, runId, sourceIdentity, plan }).pid, 123);
  assert.deepEqual(activeRuns({ state, sourceIdentity, plan }).map((run) => run.run_id), [runId]);
  persistRun({ state, sourceIdentity, plan, runId, status: "passed", nodeStates: plan.nodes.map((node) => ({ node_id: node.nodeId, status: "passed" })), pid: 123, startedAt });
  assert.deepEqual(activeRuns({ state, sourceIdentity, plan }), []);
  assert.equal(runsForPlan({ state, sourceIdentity, plan }).at(-1).status, "passed");
  assert.throws(() => readRun({ state, runId, sourceIdentity: { ...sourceIdentity, worktreeFingerprint: `sha256:${"d".repeat(64)}` }, plan }), (error) => error instanceof LocalVerificationStateError);
});

test("persists immutable bounded same-head Shadow evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "local-verification-shadow-"));
  const { sourceIdentity, plan } = fixture(root);
  const state = localVerificationState({ stateRoot: root }, { repoRoot: process.cwd() });
  const comparison = createShadowComparison({ sourceIdentity, plan, acceleratedStatus: "passed", governedStatus: "passed", governedDurationMs: 1, now: "2026-08-21T00:00:00.000Z" });
  assert.deepEqual(persistShadowComparison({ state, comparison }), { comparisonId: comparison.comparisonId, outcome: "matched" });
  assert.throws(() => persistShadowComparison({ state, comparison }), (error) => error instanceof LocalVerificationStateError && error.code === "RECEIPT_EXISTS");
});

test("start claim is exclusive and is released after the launch transaction", () => {
  const root = mkdtempSync(join(tmpdir(), "local-verification-claim-"));
  const state = localVerificationState({ stateRoot: root }, { repoRoot: process.cwd() });
  const planId = `plan_${"a".repeat(64)}`;
  assert.throws(() => withStartClaim({ state, planId, action: () => withStartClaim({ state, planId, action: () => {} }) }), (error) => error instanceof LocalVerificationStateError && error.code === "START_IN_PROGRESS");
  assert.equal(withStartClaim({ state, planId, action: () => "claimed" }), "claimed");
});

test("timing history is advisory and contains only bounded passed receipt durations", () => {
  const root = mkdtempSync(join(tmpdir(), "local-verification-timing-"));
  const { sourceIdentity, plan } = fixture(root);
  const state = localVerificationState({ stateRoot: root }, { repoRoot: process.cwd() });
  persistReceipt({ state, sourceIdentity, plan, node: plan.nodes[0], status: "passed", durationMs: 17 });
  assert.deepEqual(timingSamplesForPlan({ state, plan })[plan.nodes[0].nodeId], [17]);
});
