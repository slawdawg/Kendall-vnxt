import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";

import {
  appendEpicBatchCheckpoint,
  appendEpicBatchSlice,
  buildEpicBatchFinishPlan,
  buildEpicBatchManifest,
  deriveBusinessDaysElapsed,
  evaluateEpicBatchAdmission,
  EPIC_BATCH_DEFAULT_LIMITS,
} from "../scripts/lib/epic-batch-contract.mjs";

test("epic-batch admission records bounded limits and explicit decision", () => {
  const epicBatch = buildEpicBatchManifest({ epicId: "epic-7", decisionRef: "operator:2026-07-21" });
  assert.deepEqual(epicBatch.limits, {
    slice_limit: EPIC_BATCH_DEFAULT_LIMITS.sliceLimit,
    age_business_days: EPIC_BATCH_DEFAULT_LIMITS.ageBusinessDays,
    file_limit: EPIC_BATCH_DEFAULT_LIMITS.fileLimit,
    line_limit: EPIC_BATCH_DEFAULT_LIMITS.lineLimit,
  });
  assert.equal(evaluateEpicBatchAdmission({
    epicBatch,
    expectedSlices: ["slice-a", "slice-b"],
    changedFiles: ["scripts/example.mjs"],
    netLines: 20,
  }).status, "admitted");
});

test("epic-batch admission fails closed on limits and high-risk markers", () => {
  const epicBatch = buildEpicBatchManifest({ epicId: "epic-7", decisionRef: "operator:2026-07-21" });
  const result = evaluateEpicBatchAdmission({
    epicBatch,
    expectedSlices: ["a", "b", "c", "d", "e"],
    changedFiles: ["services/auth/provider.ts"],
    netLines: 1001,
  });
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.blockers, ["slice limit exceeded", "line limit exceeded", "high-risk surface requires standard-delivery"]);
});

test("epic-batch admission blocks security paths", () => {
  const epicBatch = buildEpicBatchManifest({ epicId: "epic-7", decisionRef: "operator:2026-07-21", expectedSlices: ["slice-a"] });
  const result = evaluateEpicBatchAdmission({ epicBatch, changedFiles: ["services/security/policy.mjs"] });
  assert.ok(result.blockers.includes("high-risk surface requires standard-delivery"));
});

test("epic-batch admission blocks live and Epic 25 paths", () => {
  const epicBatch = buildEpicBatchManifest({ epicId: "epic-7", decisionRef: "operator:2026-07-21", expectedSlices: ["slice-a"] });
  const result = evaluateEpicBatchAdmission({ epicBatch, changedFiles: ["scripts/lib/live-memory-source-enforcement.mjs"] });
  assert.ok(result.blockers.includes("high-risk surface requires standard-delivery"));
});

test("epic-batch admission blocks stale age before a new slice is admitted", () => {
  const epicBatch = buildEpicBatchManifest({ epicId: "epic-7", decisionRef: "operator:2026-07-21", expectedSlices: ["slice-a"] });
  const result = evaluateEpicBatchAdmission({ epicBatch, changedFiles: ["scripts/example.mjs"], ageBusinessDays: 6 });
  assert.deepEqual(result.blockers, ["age limit exceeded"]);
});

test("epic-batch admission rejects unsafe allowlist paths", () => {
  const epicBatch = buildEpicBatchManifest({ epicId: "epic-7", decisionRef: "operator:2026-07-21", expectedSlices: ["slice-a"] });
  const result = evaluateEpicBatchAdmission({ epicBatch, changedFiles: ["../outside" ] });
  assert.ok(result.blockers.includes("unsafe allowed path"));
});

test("finish-epic holds an admitted batch after its age ceiling", () => {
  const epicBatch = buildEpicBatchManifest({ epicId: "epic-7", decisionRef: "operator:2026-07-21", expectedSlices: ["slice-a"] });
  const result = buildEpicBatchFinishPlan({ mode: "epic-batch", epic_batch: epicBatch }, { ageBusinessDays: 6 });
  assert.ok(result.blockers.includes("age limit exceeded"));
});

test("checkpoint append preserves prior evidence and finish plan remains non-mutating", () => {
  const base = buildEpicBatchManifest({ epicId: "epic-7", decisionRef: "operator:2026-07-21", expectedSlices: ["slice-a"], allowedPaths: ["scripts/"] });
  const withSlice = appendEpicBatchSlice(base, {
    slice_id: "slice-a",
    objective: "bounded mechanics",
    owner: "operator",
    paths: ["scripts/"],
    commit: "abc1234",
    checks: ["pnpm run test:epic-batch-contract"],
    rollback_ref: "revert:slice-a",
  });
  const withCheckpoint = appendEpicBatchCheckpoint(withSlice, {
    checkpoint_id: "cp-1",
    slices: ["slice-a"],
    base_revision: "abc1234",
    head: "abcdef1",
    checks: ["pnpm run check:fast"],
    review_ref: "review:cp-1",
    result: "passed",
  });
  assert.equal(withCheckpoint.checkpoints.length, 1);
  const blocked = buildEpicBatchFinishPlan({ mode: "epic-batch", epic_batch: withCheckpoint });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.mutation, "none; planning-only");
  const ready = buildEpicBatchFinishPlan({
    mode: "epic-batch",
    epic_batch: { ...withCheckpoint, final_verification_ref: "verify:1", final_review_ref: "review:1", final_head: "abcdef1234567", checkpoints: [{ ...withCheckpoint.checkpoints[0], head: "abcdef1234567" }] },
    branch: "codex/epic-batch-task",
  }, {
    liveState: { dirty: false, branch: "codex/epic-batch-task", head: "abcdef1234567" },
    now: new Date(withCheckpoint.opened_at),
  });
  assert.equal(ready.status, "ready-for-operator-delivery-decision");
});

test("workspace start records epic-batch mode without writing during dry-run", () => {
  const stateRoot = mkdtempSync(join(tmpdir(), "epic-batch-state-"));
  const output = execFileSync("node", [
    "./scripts/codex-workspace.mjs", "start", "bounded epic batch", "--mode", "epic-batch",
    "--epic-id", "epic-7", "--decision-ref", "operator:2026-07-21", "--expected-slices", "slice-a,slice-b",
    "--allowed-paths", "scripts/example.mjs", "--dry-run", "--summary-json",
    "--state-root", stateRoot, "--no-fetch", "--base", "HEAD",
  ], { encoding: "utf8" });
  const packet = JSON.parse(output);
  assert.equal(packet.mode, "epic-batch");
  assert.equal(packet.epicBatch.epic_id, "epic-7");
  assert.equal(packet.mutation, "none; dry-run summary only");
  assert.equal(existsSync(join(stateRoot, "tasks")), false);
});

test("finish evidence requires complete slice and checkpoint fields and admitted paths", () => {
  const epicBatch = buildEpicBatchManifest({ epicId: "epic-7", decisionRef: "operator:2026-07-21", expectedSlices: ["slice-a"], allowedPaths: ["scripts/"] });
  const result = buildEpicBatchFinishPlan({ mode: "epic-batch", branch: "codex/epic-7", epic_batch: {
    ...epicBatch,
    slices: [{ slice_id: "slice-a", objective: "x", owner: "operator", commit: "abcdef1", rollback_ref: "revert:x", paths: ["services/security/policy.mjs"], checks: ["check"] }],
    checkpoints: [{ checkpoint_id: "cp-1", result: "passed", base_revision: "abcdef1", head: "abcdef2", review_ref: "review:cp", checks: ["check"] }],
    final_head: "abcdef2",
    final_verification_ref: "verify:1",
    final_review_ref: "review:1",
  } }, { liveState: { dirty: false, branch: "codex/epic-7", head: "abcdef2" }, now: new Date(epicBatch.opened_at) });
  assert.ok(result.blockers.includes("slice paths exceed admitted allowlist"));
});

test("finish rejects unexpected slices and unrecorded final evidence", () => {
  const epicBatch = buildEpicBatchManifest({ epicId: "epic-7", decisionRef: "operator:2026-07-21", expectedSlices: ["slice-a"], allowedPaths: ["scripts/"] });
  const result = buildEpicBatchFinishPlan({ mode: "epic-batch", branch: "codex/epic-7", epic_batch: {
    ...epicBatch,
    slices: [{ slice_id: "slice-a", objective: "x", owner: "operator", commit: "abcdef1", rollback_ref: "revert:x", paths: ["scripts/x.mjs"], checks: ["check"] }, { slice_id: "unplanned", objective: "x", owner: "operator", commit: "abcdef1", rollback_ref: "revert:x", paths: ["scripts/y.mjs"], checks: ["check"] }],
    checkpoints: [{ checkpoint_id: "cp-1", result: "passed", base_revision: "abcdef1", head: "abcdef2", review_ref: "review:cp", checks: ["check"] }],
    final_head: "abcdef2",
  } }, { liveState: { dirty: false, branch: "codex/epic-7", head: "abcdef2" }, now: new Date(epicBatch.opened_at) });
  assert.ok(result.blockers.includes("unexpected slices are recorded"));
  assert.ok(result.blockers.includes("final verification evidence is missing or invalid"));
});

test("finish derives current UTC business-day age when omitted", () => {
  assert.equal(deriveBusinessDaysElapsed("2026-07-10T00:00:00Z", new Date("2026-07-20T00:00:00Z")), 6);
  const epicBatch = buildEpicBatchManifest({ epicId: "epic-7", decisionRef: "operator:2026-07-21", expectedSlices: ["slice-a"], allowedPaths: ["scripts/"] });
  epicBatch.opened_at = "2026-07-10T00:00:00Z";
  const result = buildEpicBatchFinishPlan({ mode: "epic-batch", branch: "codex/epic-7", epic_batch: {
    ...epicBatch,
    slices: [{ slice_id: "slice-a", objective: "x", owner: "operator", commit: "abcdef1", rollback_ref: "revert:x", paths: ["scripts/x.mjs"], checks: ["check"] }],
    checkpoints: [{ checkpoint_id: "cp-1", result: "passed", base_revision: "abcdef1", head: "abcdef2", review_ref: "review:cp", checks: ["check"] }],
    final_head: "abcdef2",
    final_verification_ref: "verify:1",
    final_review_ref: "review:1",
  } }, { liveState: { dirty: false, branch: "codex/epic-7", head: "abcdef2" }, now: new Date("2026-07-20T00:00:00Z") });
  assert.ok(result.blockers.includes("age limit exceeded"));
});

test("integrated cleanup excludes active epic-batch manifests", () => {
  const stateRoot = mkdtempSync(join(tmpdir(), "epic-batch-cleanup-state-"));
  const tasksDir = join(stateRoot, "tasks");
  mkdirSync(tasksDir, { recursive: true });
  writeFileSync(join(tasksDir, "epic-batch-cleanup.json"), `${JSON.stringify({
    schema_version: 1,
    task_id: "epic-batch-cleanup",
    title: "Epic batch cleanup guard",
    description: "Epic batch cleanup guard",
    base_branch: "dev",
    branch: "codex/epic-batch-cleanup",
    worktree_path: stateRoot,
    status: "active",
    owner: null,
    mode: "epic-batch",
    epic_batch: buildEpicBatchManifest({ epicId: "epic-7", decisionRef: "operator:2026-07-21", expectedSlices: ["slice-a"], allowedPaths: ["scripts/"] }),
    events: [],
  }, null, 2)}\n`);
  const output = execFileSync("node", ["./scripts/codex-workspace.mjs", "cleanup-integrated", "epic-batch-cleanup", "--summary-json", "--state-root", stateRoot, "--base", "HEAD"], { encoding: "utf8" });
  const packet = JSON.parse(output);
  assert.equal(packet.results[0].status, "skipped");
  assert.match(packet.results[0].reason, /finish-epic closeout/);
});

test("finish-epic summary is planning-only and leaves the manifest unchanged", () => {
  const stateRoot = mkdtempSync(join(tmpdir(), "epic-batch-finish-state-"));
  const tasksDir = join(stateRoot, "tasks");
  mkdirSync(tasksDir, { recursive: true });
  const path = join(tasksDir, "epic-batch-task.json");
  const manifest = {
    schema_version: 1,
    task_id: "epic-batch-task",
    title: "Epic batch task",
    description: "Epic batch task",
    base_branch: "dev",
    branch: "codex/epic-batch-task",
    worktree_path: stateRoot,
    status: "active",
    owner: null,
    mode: "epic-batch",
    epic_batch: {
      ...buildEpicBatchManifest({ epicId: "epic-7", decisionRef: "operator:2026-07-21", expectedSlices: ["slice-a"] }),
      slices: [{ slice_id: "slice-a" }],
      checkpoints: [{ checkpoint_id: "cp-1", result: "passed" }],
      final_head: "abc1234",
      final_verification_ref: null,
      final_review_ref: null,
    },
  };
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  const before = readFileSync(path, "utf8");
  const output = execFileSync("node", ["./scripts/codex-workspace.mjs", "finish-epic", "epic-batch-task", "--summary-json", "--state-root", stateRoot], { encoding: "utf8" });
  const packet = JSON.parse(output);
  assert.equal(packet.status, "blocked");
  assert.equal(packet.mutation, "none; planning-only");
  assert.equal(readFileSync(path, "utf8"), before);
});
