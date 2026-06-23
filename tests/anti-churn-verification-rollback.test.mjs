import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { prepareAndPersistHookTransaction } from "../scripts/lib/anti-churn-hook-transaction-store.mjs";
import { applyPreparedHookTransaction } from "../scripts/lib/anti-churn-source-apply.mjs";
import { finalizeHookTransactionVerification } from "../scripts/lib/anti-churn-verification-rollback.mjs";

test("finalizeHookTransactionVerification keeps a patch and marks transaction verified when verification passes", () => {
  const fixture = createFixture();
  try {
    const prepared = prepareAppliedTransaction(fixture);

    const result = finalizeHookTransactionVerification({
      transaction: prepared.transaction,
      transactionPath: prepared.transactionPath,
      verificationResult: {
        status: "passed",
        command: "pnpm run check:token-economy",
        summary: "focused check passed",
      },
    }, {
      cwd: fixture.worktree,
      now: "2026-06-22T12:02:00Z",
    });

    assert.equal(result.status, "success");
    assert.equal(result.exitCode, 0);
    assert.deepEqual(result.filesChanged, [targetFile()]);
    assert.equal(result.applied[0].status, "verified");
    assert.equal(readTarget(fixture.worktree), "- request outside-sandbox approval\n");
    assert.equal(readStored(prepared.transactionPath).status, "verified");
  } finally {
    fixture.cleanup();
  }
});

test("finalizeHookTransactionVerification rolls back hook-caused verification failures and emits proposal evidence", () => {
  const fixture = createFixture();
  try {
    const prepared = prepareAppliedTransaction(fixture);

    const result = finalizeHookTransactionVerification({
      transaction: prepared.transaction,
      transactionPath: prepared.transactionPath,
      verificationResult: {
        status: "failed",
        classification: "hook-patch",
        command: "pnpm run check:token-economy",
        exitCode: 1,
        summary: "new guidance broke the token economy check",
      },
    }, {
      cwd: fixture.worktree,
      now: "2026-06-22T12:03:00Z",
    });

    assert.equal(result.status, "verification-failed");
    assert.equal(result.exitCode, 2);
    assert.deepEqual(result.filesChanged, []);
    assert.equal(readTarget(fixture.worktree), "- retry inside sandbox\n");
    assert.equal(readStored(prepared.transactionPath).status, "rolled-back");
    assert.equal(result.proposals[0].targetFile, targetFile());
    assert.equal(result.proposals[0].verification.command, "pnpm run check:token-economy");
    assert.match(result.proposals[0].summary, /new guidance broke/);
  } finally {
    fixture.cleanup();
  }
});

test("finalizeHookTransactionVerification refuses rollback when current hunk was modified after apply", () => {
  const fixture = createFixture();
  try {
    const prepared = prepareAppliedTransaction(fixture);
    writeTarget(fixture.worktree, "- user changed the hook hunk\n");

    const result = finalizeHookTransactionVerification({
      transaction: prepared.transaction,
      transactionPath: prepared.transactionPath,
      verificationResult: {
        status: "failed",
        classification: "hook-patch",
        command: "pnpm run check:token-economy",
        summary: "verification failed",
      },
    }, {
      cwd: fixture.worktree,
      now: "2026-06-22T12:04:00Z",
    });

    assert.equal(result.status, "requires-higher-authority");
    assert.equal(result.exitCode, 3);
    assert.deepEqual(result.filesChanged, []);
    assert.equal(readTarget(fixture.worktree), "- user changed the hook hunk\n");
    assert.equal(readStored(prepared.transactionPath).status, "manual-inspection-required");
    assert.match(result.warnings.join(";"), /rollback-blocked:PREIMAGE_NOT_FOUND/);
  } finally {
    fixture.cleanup();
  }
});

test("finalizeHookTransactionVerification treats an already-restored preimage as completed rollback", () => {
  const fixture = createFixture();
  try {
    const prepared = prepareAppliedTransaction(fixture);
    writeTarget(fixture.worktree, "- retry inside sandbox\n");

    const result = finalizeHookTransactionVerification({
      transaction: prepared.transaction,
      transactionPath: prepared.transactionPath,
      verificationResult: {
        status: "failed",
        classification: "hook-patch",
        command: "pnpm run check:token-economy",
        summary: "verification failed after an interrupted rollback",
      },
    }, {
      cwd: fixture.worktree,
      now: "2026-06-22T12:04:30Z",
    });

    assert.equal(result.status, "verification-failed");
    assert.equal(result.exitCode, 2);
    assert.equal(readTarget(fixture.worktree), "- retry inside sandbox\n");
    assert.equal(readStored(prepared.transactionPath).status, "rolled-back");
  } finally {
    fixture.cleanup();
  }
});

test("finalizeHookTransactionVerification fails closed when transaction status cannot be updated", () => {
  const fixture = createFixture();
  try {
    const prepared = prepareAppliedTransaction(fixture);

    const result = finalizeHookTransactionVerification({
      transaction: prepared.transaction,
      transactionPath: fixture.worktree,
      verificationResult: {
        status: "passed",
        command: "pnpm run check:token-economy",
        summary: "target-bound check passed",
      },
    }, {
      cwd: fixture.worktree,
      now: "2026-06-22T12:04:45Z",
    });

    assert.equal(result.status, "requires-higher-authority");
    assert.equal(result.exitCode, 3);
    assert.match(result.warnings.join(";"), /TRANSACTION_STATUS_UPDATE_FAILED/);
    assert.equal(Object.hasOwn(result, "cause"), false);
  } finally {
    fixture.cleanup();
  }
});

test("finalizeHookTransactionVerification rolls back approval-required verification without narrower proof", () => {
  const fixture = createFixture();
  try {
    const prepared = prepareAppliedTransaction(fixture);

    const result = finalizeHookTransactionVerification({
      transaction: prepared.transaction,
      transactionPath: prepared.transactionPath,
      verificationResult: {
        status: "approval-required",
        command: "pnpm run check:static",
        summary: ".git/worktrees read-only sandbox boundary",
      },
    }, {
      cwd: fixture.worktree,
      now: "2026-06-22T12:05:00Z",
    });

    assert.equal(result.status, "verification-pending-approval");
    assert.equal(result.exitCode, 4);
    assert.deepEqual(result.filesChanged, []);
    assert.equal(result.verification[0].command, "pnpm run check:static");
    assert.equal(readTarget(fixture.worktree), "- retry inside sandbox\n");
    assert.equal(readStored(prepared.transactionPath).status, "verification-pending-approval");
  } finally {
    fixture.cleanup();
  }
});

test("finalizeHookTransactionVerification handles unrelated environment churn conservatively unless narrower check passed", () => {
  const fixture = createFixture();
  try {
    const prepared = prepareAppliedTransaction(fixture);

    const result = finalizeHookTransactionVerification({
      transaction: prepared.transaction,
      transactionPath: prepared.transactionPath,
      verificationResult: {
        status: "failed",
        classification: "environment-churn",
        command: "pnpm run check:static",
        summary: ".git/worktrees read-only sandbox boundary",
      },
    }, {
      cwd: fixture.worktree,
      now: "2026-06-22T12:06:00Z",
    });

    assert.equal(result.status, "verification-failed");
    assert.equal(result.exitCode, 2);
    assert.equal(readTarget(fixture.worktree), "- retry inside sandbox\n");
    assert.match(result.warnings.join(";"), /environment-churn-record-required/);

    const second = prepareAppliedTransaction(fixture, {
      lane: "lane-456",
      now: "2026-06-22T12:07:00Z",
    });
    const kept = finalizeHookTransactionVerification({
      transaction: second.transaction,
      transactionPath: second.transactionPath,
      verificationResult: {
        status: "failed",
        classification: "environment-churn",
        command: "pnpm run check:static",
        summary: ".git/worktrees read-only sandbox boundary",
      },
      narrowerVerificationResult: {
        status: "passed",
        command: "pnpm run check:token-economy",
        summary: "target-bound check passed",
      },
    }, {
      cwd: fixture.worktree,
      now: "2026-06-22T12:08:00Z",
    });

    assert.equal(kept.status, "success");
    assert.equal(readTarget(fixture.worktree), "- request outside-sandbox approval\n");
    assert.equal(readStored(second.transactionPath).status, "verified");
    assert.match(kept.warnings.join(";"), /environment-churn-record-required/);
  } finally {
    fixture.cleanup();
  }
});

function prepareAppliedTransaction(fixture, overrides = {}) {
  writeTarget(fixture.worktree, "- retry inside sandbox\n");
  const prepared = prepareAndPersistHookTransaction({
    lane: overrides.lane || "lane-123",
    candidate: candidate(),
    targetContent: readTarget(fixture.worktree),
    preimageHunk: "- retry inside sandbox",
    plannedPostimageHunk: "- request outside-sandbox approval",
    now: overrides.now || "2026-06-22T12:00:00Z",
  }, {
    stateRoot: fixture.stateRoot,
  });
  const applied = applyPreparedHookTransaction({
    transaction: prepared.transaction,
    transactionPath: prepared.transactionPath,
    candidateId: "candidate-rollback",
  }, {
    cwd: fixture.worktree,
    now: "2026-06-22T12:01:00Z",
  });
  assert.equal(applied.status, "applied");
  return prepared;
}

function candidate() {
  return {
    candidateId: "candidate-rollback",
    sourceEventId: "churn-rollback",
    lane: "lane-123",
    durableTarget: targetFile(),
    verificationPlan: {
      status: "mapped",
      target: targetFile(),
      command: "pnpm run check:token-economy",
      expectedEvidence: "token-economy drift check passes",
    },
    autonomyTier: "tier-1-safe-automatic",
  };
}

function targetFile() {
  return "docs/workflows/tool-churn-rca-examples.md";
}

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "anti-churn-rollback-"));
  return {
    stateRoot: join(root, "state"),
    worktree: join(root, "worktree"),
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function writeTarget(root, content) {
  const path = join(root, targetFile());
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function readTarget(root) {
  return readFileSync(join(root, targetFile()), "utf8");
}

function readStored(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
