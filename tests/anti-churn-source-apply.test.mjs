import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { runAntiChurnGuidanceHookCli } from "../scripts/anti-churn-guidance-hook.mjs";
import { recordChurnEvent } from "../scripts/lib/anti-churn-event-writer.mjs";
import { prepareAndPersistHookTransaction } from "../scripts/lib/anti-churn-hook-transaction-store.mjs";
import {
  applyPreparedHookTransaction,
} from "../scripts/lib/anti-churn-source-apply.mjs";

test("applyPreparedHookTransaction edits only managed marker content", () => {
  const fixture = createFixture();
  try {
    const targetFile = "docs/workflows/tool-churn-rca-examples.md";
    writeTarget(fixture.worktree, targetFile, [
      "before",
      "<!-- anti-churn-guidance:start -->",
      "- retry inside sandbox",
      "<!-- anti-churn-guidance:end -->",
      "after",
      "",
    ].join("\n"));
    const prepared = prepareAndPersistHookTransaction({
      lane: "lane-123",
      candidate: candidate({ durableTarget: targetFile }),
      targetContent: readTarget(fixture.worktree, targetFile),
      preimageHunk: "- retry inside sandbox",
      plannedPostimageHunk: "- request outside-sandbox approval",
      now: "2026-06-22T12:00:00Z",
    }, {
      stateRoot: fixture.stateRoot,
    });

    const result = applyPreparedHookTransaction({
      transaction: prepared.transaction,
      transactionPath: prepared.transactionPath,
      candidateId: "candidate-source-apply",
    }, {
      cwd: fixture.worktree,
      now: "2026-06-22T12:01:00Z",
    });

    assert.equal(result.status, "applied");
    assert.deepEqual(result.filesChanged, [targetFile]);
    assert.match(readTarget(fixture.worktree, targetFile), /^before\n<!-- anti-churn-guidance:start -->\n- request outside-sandbox approval\n<!-- anti-churn-guidance:end -->\nafter\n$/);
    const stored = JSON.parse(readFileSync(prepared.transactionPath, "utf8"));
    assert.equal(stored.status, "verification-pending");
  } finally {
    fixture.cleanup();
  }
});

test("applyPreparedHookTransaction edits only exact unmarked paragraph preimages", () => {
  const fixture = createFixture();
  try {
    const targetFile = "docs/workflows/tool-churn-rca.md";
    writeTarget(fixture.worktree, targetFile, "Alpha.\n\nRetry inside sandbox.\n\nOmega.\n");
    const prepared = prepareAndPersistHookTransaction({
      lane: "lane-123",
      candidate: candidate({ durableTarget: targetFile }),
      targetContent: readTarget(fixture.worktree, targetFile),
      preimageHunk: "Retry inside sandbox.",
      plannedPostimageHunk: "Request outside-sandbox approval.",
      now: "2026-06-22T12:00:00Z",
    }, {
      stateRoot: fixture.stateRoot,
    });

    const result = applyPreparedHookTransaction({
      transaction: prepared.transaction,
      transactionPath: prepared.transactionPath,
      candidateId: "candidate-source-apply",
    }, {
      cwd: fixture.worktree,
      now: "2026-06-22T12:01:00Z",
    });

    assert.equal(result.status, "applied");
    assert.equal(readTarget(fixture.worktree, targetFile), "Alpha.\n\nRequest outside-sandbox approval.\n\nOmega.\n");
  } finally {
    fixture.cleanup();
  }
});

test("applyPreparedHookTransaction refuses disallowed targets and embedded substrings without writing", () => {
  const fixture = createFixture();
  try {
    const disallowed = prepareAndPersistHookTransaction({
      lane: "lane-123",
      candidate: candidate({ durableTarget: "AGENTS.md" }),
      targetContent: "- retry inside sandbox\n",
      preimageHunk: "- retry inside sandbox",
      plannedPostimageHunk: "- request outside-sandbox approval",
      now: "2026-06-22T12:00:00Z",
    }, {
      stateRoot: fixture.stateRoot,
    });
    writeTarget(fixture.worktree, "AGENTS.md", "- retry inside sandbox\n");
    const disallowedResult = applyPreparedHookTransaction({
      transaction: disallowed.transaction,
      transactionPath: disallowed.transactionPath,
    }, {
      cwd: fixture.worktree,
    });
    assert.equal(disallowedResult.status, "requires-higher-authority");
    assert.equal(readTarget(fixture.worktree, "AGENTS.md"), "- retry inside sandbox\n");

    const targetFile = "docs/workflows/tool-churn-rca.md";
    writeTarget(fixture.worktree, targetFile, "A sentence with retry inside sandbox embedded.\n");
    const embedded = {
      ...disallowed.transaction,
      targetFile,
      preimageHunk: "retry inside sandbox",
      preimageHash: sha256("retry inside sandbox"),
      plannedPostimageHunk: "request outside-sandbox approval",
      plannedPostimageHash: sha256("request outside-sandbox approval"),
    };
    const embeddedResult = applyPreparedHookTransaction({
      transaction: embedded,
    }, {
      cwd: fixture.worktree,
    });
    assert.equal(embeddedResult.status, "requires-higher-authority");
    assert.equal(readTarget(fixture.worktree, targetFile), "A sentence with retry inside sandbox embedded.\n");

    const missingTarget = {
      ...embedded,
      targetFile: "docs/workflows/end-to-end-lane-runner.md",
    };
    const missingResult = applyPreparedHookTransaction({
      transaction: missingTarget,
    }, {
      cwd: fixture.worktree,
    });
    assert.equal(missingResult.status, "requires-higher-authority");
    assert.match(missingResult.warnings.join(";"), /TARGET_READ_FAILED/);
  } finally {
    fixture.cleanup();
  }
});

test("apply-safe writes allowlisted source change and returns changed-file evidence", () => {
  const fixture = createFixture();
  try {
    const targetFile = "docs/workflows/tool-churn-rca-examples.md";
    writeTarget(fixture.worktree, targetFile, "- retry inside sandbox\n");
    recordChurnEvent(event(), {
      stateRoot: fixture.stateRoot,
    });

    const result = runAntiChurnGuidanceHookCli(
      ["evaluate", "--lane", "lane-123", "--apply-safe", "--format", "json"],
      {
        cwd: fixture.worktree,
        env: {
          ...process.env,
          CODEX_WORKSPACE_ROOT: fixture.stateRoot,
        },
        laneManifest: manifest(),
        now: "2026-06-22T12:00:00Z",
        verificationResult: {
          status: "passed",
          command: "pnpm run check:token-economy",
          summary: "target-bound check passed",
        },
        plannedSourceUpdates: [
          {
            candidateId: "candidate-source-apply",
            targetFile,
            preimageHunk: "- retry inside sandbox",
            plannedPostimageHunk: "- request outside-sandbox approval",
          },
        ],
      },
    );

    assert.equal(result.status, "success");
    assert.match(result.transactionId, /^hooktxn-/);
    assert.deepEqual(result.filesChanged, [targetFile]);
    assert.match(result.applied[0].candidateId, /^candidate-/);
    assert.equal(result.applied[0].status, "verified");
    assert.equal(result.verification[0].command, "pnpm run check:token-economy");
    assert.equal(readTarget(fixture.worktree, targetFile), "- request outside-sandbox approval\n");
  } finally {
    fixture.cleanup();
  }
});

test("apply-safe rolls back source change when verification needs unavailable approval", () => {
  const fixture = createFixture();
  try {
    const targetFile = "docs/workflows/tool-churn-rca-examples.md";
    writeTarget(fixture.worktree, targetFile, "- retry inside sandbox\n");
    recordChurnEvent(event({ eventId: "churn-source-apply-approval" }), {
      stateRoot: fixture.stateRoot,
    });

    const result = runAntiChurnGuidanceHookCli(
      ["evaluate", "--lane", "lane-123", "--apply-safe", "--format", "json"],
      {
        cwd: fixture.worktree,
        env: {
          ...process.env,
          CODEX_WORKSPACE_ROOT: fixture.stateRoot,
        },
        laneManifest: manifest(),
        now: "2026-06-22T12:00:00Z",
        plannedSourceUpdates: [
          {
            candidateId: "candidate-source-apply",
            targetFile,
            preimageHunk: "- retry inside sandbox",
            plannedPostimageHunk: "- request outside-sandbox approval",
          },
        ],
      },
    );

    assert.equal(result.status, "verification-pending-approval");
    assert.equal(result.exitCode, 4);
    assert.deepEqual(result.filesChanged, []);
    assert.equal(result.verification[0].command, "pnpm run check:token-economy");
    assert.equal(readTarget(fixture.worktree, targetFile), "- retry inside sandbox\n");
  } finally {
    fixture.cleanup();
  }
});

function candidate(overrides = {}) {
  return {
    candidateId: "candidate-source-apply",
    sourceEventId: "churn-source-apply",
    lane: "lane-123",
    durableTarget: "docs/workflows/tool-churn-rca-examples.md",
    verificationPlan: {
      status: "mapped",
      target: "docs/workflows/tool-churn-rca-examples.md",
      command: "pnpm run check:token-economy",
      expectedEvidence: "token-economy drift check passes",
    },
    autonomyTier: "tier-1-safe-automatic",
    ...overrides,
  };
}

function event(overrides = {}) {
  return {
    eventId: "churn-source-apply",
    laneId: "lane-123",
    phase: "verification",
    failureClass: "sandbox",
    signature: ".git/worktrees read-only filesystem boundary",
    attemptedCommand: "pnpm run check:static",
    evidenceSummary: "Workspace verification hit a .git/worktrees read-only filesystem boundary.",
    wrongRetryPattern: "retrying inside sandbox",
    nextSafeAction: "Request approval to rerun the exact same read-only verification command outside the sandbox.",
    createdAt: "2026-06-22T12:00:00Z",
    metadata: {
      wrongRetryPrevented: true,
    },
    ...overrides,
  };
}

function manifest() {
  return {
    taskId: "lane-123",
    branch: "codex/lane-123",
    worktreePath: "/tmp/lane-123",
    baseBranch: "main",
    pr: {
      merged: false,
    },
    cleanup: {
      status: "not-started",
    },
    dirtyWorktree: {
      checkedAt: "2026-06-22T12:00:00Z",
      paths: [],
    },
  };
}

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "anti-churn-source-apply-"));
  return {
    stateRoot: join(root, "state"),
    worktree: join(root, "worktree"),
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function writeTarget(root, file, content) {
  const path = join(root, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function readTarget(root, file) {
  return readFileSync(join(root, file), "utf8");
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
