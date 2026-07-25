import assert from "node:assert/strict";
import test from "node:test";

import { inspectBaseCheckoutRecovery } from "../scripts/lib/base-checkout-recovery.mjs";
import { evaluateMutationAdmission } from "../scripts/lib/mutation-admission.mjs";
import { handoffAdmittedManagedLane } from "../scripts/lib/mutation-admission-workspace-handoff.mjs";

const PRIMARY = "/repo/primary";

test("a clean trusted primary checkout remains distinct from recovery-needed", () => {
  const calls = [];
  const result = inspectBaseCheckoutRecovery({}, { git: fixtureGit(calls, { status: "" }) });

  assert.equal(result.status, "clear");
  assert.equal(result.outcome, "no_recovery");
  assert.equal(result.reasonCode, "recovery.base_checkout_clean");
  assert.deepEqual(result.checkout, {
    identity: "primary_worktree",
    path: PRIMARY,
    branch: "dev",
    head: "0123456789abcdef0123456789abcdef01234567",
    changedPathCount: 0,
  });
  assert.equal(result.projection, null);
  assert.equal(result.mutation, "none; inspection only");
  assertReadOnlyGitCalls(calls);
});

test("a dirty trusted primary checkout becomes bounded recovery-needed work without exposing paths", () => {
  const calls = [];
  const status = " M scripts/private name\0?? tests/recovery.test.mjs\0R  docs/new-name.md\0docs/old-name.md\0";
  const result = inspectBaseCheckoutRecovery({}, { git: fixtureGit(calls, { status }) });

  assert.equal(result.status, "recovery_required");
  assert.equal(result.outcome, "recovery_required");
  assert.equal(result.reasonCode, "recovery.base_checkout_dirty");
  assert.equal(result.canonicalStage, "human_gate");
  assert.equal(result.canonicalStatus, "blocked");
  assert.equal(result.canonicalOwner, "blocked");
  assert.deepEqual(result.projection, { column: "Needs attention", attentionKind: "recovery_needed", derived: true });
  assert.deepEqual(result.checkout, {
    identity: "primary_worktree",
    path: PRIMARY,
    branch: "dev",
    head: "0123456789abcdef0123456789abcdef01234567",
    changedPathCount: 3,
  });
  assert.match(result.nextSafeAction, /inspect/i);
  assert.match(result.nextSafeAction, /do not mutate/i);
  assert.doesNotMatch(JSON.stringify(result), /private name|recovery\.test|old-name|new-name/);
  assertReadOnlyGitCalls(calls);
});

test("an explicit break-glass edit remains recovery-needed even when the trusted primary checkout is currently clean", () => {
  const calls = [];
  const result = inspectBaseCheckoutRecovery({ explicitBreakGlass: true }, { git: fixtureGit(calls, { status: "" }) });

  assert.equal(result.status, "recovery_required");
  assert.equal(result.outcome, "recovery_required");
  assert.equal(result.reasonCode, "recovery.break_glass_edit");
  assert.equal(result.checkout.changedPathCount, 0);
  assert.deepEqual(result.projection, { column: "Needs attention", attentionKind: "recovery_needed", derived: true });
  assertReadOnlyGitCalls(calls);
});

test("a persisted active break-glass marker keeps a later clean-base inspection and admission in recovery", () => {
  const marker = {
    status: "active",
    reasonCode: "recovery.break_glass_edit",
    recordedAt: "2026-07-25T00:00:00.000Z",
    checkout: { identity: "primary_worktree", path: PRIMARY, branch: "dev", head: "0123456789abcdef0123456789abcdef01234567", changedPathCount: 0 },
  };
  const recovery = inspectBaseCheckoutRecovery({ recoveryMarker: marker }, { git: fixtureGit([], { status: "" }) });

  assert.equal(recovery.status, "recovery_required");
  assert.equal(recovery.reasonCode, "recovery.break_glass_edit");
  assert.equal(recovery.checkout.changedPathCount, 0);
  assert.deepEqual(recovery.recoveryMarker, {
    status: "active",
    recordedAt: "2026-07-25T00:00:00.000Z",
  });

  const admission = evaluateMutationAdmission({
    requestedActivity: "source_change",
    authorizedScope: true,
    baseCheckout: { isBaseCheckout: true, dirty: false, branch: "dev", head: "0123456789abcdef0123456789abcdef01234567", changedPathCount: 0 },
    baseCheckoutRecovery: recovery,
  });
  assert.equal(admission.outcome, "recovery_required");
  assert.equal(admission.reasonCode, "recovery.break_glass_edit");
});

test("an explicitly resolved break-glass marker no longer blocks a clean Base Checkout", () => {
  const result = inspectBaseCheckoutRecovery({
    recoveryMarker: {
      status: "resolved",
      reasonCode: "recovery.break_glass_edit",
      recordedAt: "2026-07-25T00:00:00.000Z",
      resolvedAt: "2026-07-25T00:01:00.000Z",
    },
  }, { git: fixtureGit([], { status: "" }) });

  assert.equal(result.status, "clear");
  assert.equal(result.reasonCode, "recovery.base_checkout_clean");
});

test("admission consumes a bounded recovery packet before it selects a managed lane", () => {
  const recovery = inspectBaseCheckoutRecovery({ explicitBreakGlass: true }, { git: fixtureGit([], { status: "" }) });
  const result = evaluateMutationAdmission({
    requestedActivity: "source_change",
    authorizedScope: true,
    baseCheckout: { isBaseCheckout: true, dirty: false, branch: "dev", head: "0123456789abcdef0123456789abcdef01234567", changedPathCount: 0 },
    baseCheckoutRecovery: recovery,
    createPreview: { taskId: "would-be-lane" },
  });

  assert.equal(result.outcome, "recovery_required");
  assert.equal(result.reasonCode, "recovery.break_glass_edit");
  assert.deepEqual(result.projection, { column: "Needs attention", attentionKind: "recovery_needed", derived: true });
  assert.deepEqual(result.checkoutEvidence, {
    branch: "dev",
    head: "0123456789abcdef0123456789abcdef01234567",
    changedPathCount: 0,
  });
});

test("managed-lane handoff leaves recovery-needed work outside the worker write path", () => {
  const recovery = inspectBaseCheckoutRecovery({}, {
    git: fixtureGit([], { status: " M scripts/unmanaged-source.mjs\0" }),
  });
  let runnerCalled = false;
  const handoff = handoffAdmittedManagedLane(recovery, {
    runner() {
      runnerCalled = true;
      throw new Error("recovery must not invoke codex-workspace");
    },
  });

  assert.equal(handoff.status, "not_applicable");
  assert.equal(handoff.outcome, "recovery_required");
  assert.equal(handoff.projection.column, "Needs attention");
  assert.equal(handoff.mutation, "none; no workspace lifecycle command invoked");
  assert.equal(runnerCalled, false);
});

test("an unavailable primary inspection fails closed without inventing dirty-diff metadata", () => {
  const calls = [];
  const result = inspectBaseCheckoutRecovery({}, {
    git(args) {
      calls.push(args);
      if (args.join(" ") === "worktree list --porcelain") return { code: 1, stderr: "worktree unavailable" };
      throw new Error("unexpected git call");
    },
  });

  assert.equal(result.status, "inspection_unknown");
  assert.equal(result.outcome, "recovery_required");
  assert.equal(result.reasonCode, "recovery.primary_checkout_unknown");
  assert.equal(result.checkout, null);
  assert.deepEqual(result.projection, { column: "Needs attention", attentionKind: "recovery_needed", derived: true });
  assertReadOnlyGitCalls(calls);
});

function fixtureGit(calls, { status }) {
  return (args, options = {}) => {
    calls.push({ args, options });
    const command = args.join(" ");
    if (command === "worktree list --porcelain") {
      return { code: 0, stdout: `worktree ${PRIMARY}\nHEAD 0123456789abcdef0123456789abcdef01234567\nbranch refs/heads/dev\n\nworktree /repo/lane\nHEAD fedcba9876543210fedcba9876543210fedcba98\nbranch refs/heads/codex/lane\n` };
    }
    if (command === "rev-parse --is-inside-work-tree") return { code: 0, stdout: "true" };
    if (command === "symbolic-ref --quiet --short HEAD") return { code: 0, stdout: "dev" };
    if (command === "rev-parse HEAD") return { code: 0, stdout: "0123456789abcdef0123456789abcdef01234567" };
    if (command === "status --porcelain=v1 -z") return { code: 0, stdout: status };
    throw new Error(`unexpected git call: ${command}`);
  };
}

function assertReadOnlyGitCalls(calls) {
  for (const call of calls) {
    const args = Array.isArray(call) ? call : call.args;
    assert.equal(["worktree", "rev-parse", "symbolic-ref", "status"].includes(args[0]), true);
    assert.equal(/\b(add|commit|push|reset|clean|mv|checkout|switch|restore|stash)\b/.test(args.join(" ")), false);
  }
}
