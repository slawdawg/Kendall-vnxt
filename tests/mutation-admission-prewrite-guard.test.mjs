import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { approveManagedSourceWrite } from "../scripts/lib/mutation-admission-prewrite-guard.mjs";

function trustedLane(baseCheckoutPath, worktreePath) {
  return {
    baseCheckoutPath,
    worktreePath,
    laneEvidence: {
      taskId: "clean-lane",
      branch: "codex/clean-lane",
      baseBranch: "dev",
      baseRef: "origin/dev",
      manifestPath: "/state/tasks/clean-lane.json",
      owner: "codex:worker",
    },
  };
}

test("allows a source-write handoff only from its trusted managed worktree", () => {
  const root = mkdtempSync(join(tmpdir(), "mutation-prewrite-allow-"));
  const base = join(root, "base");
  const worktree = join(root, "worktrees", "clean-lane");
  mkdirSync(base);
  mkdirSync(worktree, { recursive: true });
  try {
    const result = approveManagedSourceWrite({
      operation: "source_write",
      actualCwd: worktree,
      trustedLane: trustedLane(base, worktree),
    });

    assert.equal(result.status, "allowed");
    assert.equal(result.reasonCode, "guard.managed_lane_approved");
    assert.deepEqual(result.laneEvidence, trustedLane(base, worktree).laneEvidence);
    assert.equal(result.projection.column, "Prepare");
    assert.match(result.enforcementLimit, /manual shell|operator's editor/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("denies the Base Checkout and a symlink alias before source-edit handoff", () => {
  const root = mkdtempSync(join(tmpdir(), "mutation-prewrite-base-"));
  const base = join(root, "base");
  const worktree = join(root, "worktrees", "clean-lane");
  const alias = join(root, "base-alias");
  mkdirSync(base);
  mkdirSync(worktree, { recursive: true });
  symlinkSync(base, alias, "dir");
  try {
    for (const actualCwd of [base, alias]) {
      const result = approveManagedSourceWrite({
        operation: "source_write",
        actualCwd,
        trustedLane: trustedLane(base, worktree),
      });
      assert.equal(result.status, "blocked");
      assert.equal(result.reasonCode, "guard.base_checkout_target");
      assert.equal(result.projection.column, "Needs attention");
      assert.match(result.nextSafeAction, /start or resume/i);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("denies an unknown or mismatched CWD and keeps read-only work outside the guard", () => {
  const root = mkdtempSync(join(tmpdir(), "mutation-prewrite-mismatch-"));
  const base = join(root, "base");
  const worktree = join(root, "worktrees", "clean-lane");
  const other = join(root, "other");
  mkdirSync(base);
  mkdirSync(worktree, { recursive: true });
  mkdirSync(other);
  try {
    const mismatch = approveManagedSourceWrite({
      operation: "source_write",
      actualCwd: other,
      trustedLane: trustedLane(base, worktree),
    });
    assert.equal(mismatch.status, "blocked");
    assert.equal(mismatch.reasonCode, "guard.managed_lane_mismatch");

    const unknown = approveManagedSourceWrite({
      operation: "source_write",
      actualCwd: worktree,
      trustedLane: { ...trustedLane(base, worktree), worktreePath: "" },
    });
    assert.equal(unknown.status, "blocked");
    assert.equal(unknown.reasonCode, "guard.trusted_lane_invalid");

    const readOnly = approveManagedSourceWrite({ operation: "read_only", actualCwd: base });
    assert.equal(readOnly.status, "not_applicable");
    assert.equal(readOnly.reasonCode, "guard.read_only_bypass");
    assert.equal(readOnly.projection.column, "Understand");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("denies legacy trusted evidence that omits the admitted base pair", () => {
  const root = mkdtempSync(join(tmpdir(), "mutation-prewrite-legacy-"));
  const base = join(root, "base");
  const worktree = join(root, "worktrees", "clean-lane");
  mkdirSync(base);
  mkdirSync(worktree, { recursive: true });
  try {
    const lane = trustedLane(base, worktree);
    delete lane.laneEvidence.baseRef;
    const result = approveManagedSourceWrite({
      operation: "source_write",
      actualCwd: worktree,
      trustedLane: lane,
    });
    assert.equal(result.status, "blocked");
    assert.equal(result.reasonCode, "guard.trusted_lane_invalid");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
