import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runAntiChurnGuidanceHookCli } from "../scripts/anti-churn-guidance-hook.mjs";
import { recordChurnEvent } from "../scripts/lib/anti-churn-event-writer.mjs";
import {
  HookTransactionStoreError,
  inspectPendingHookTransactions,
  prepareHookTransaction,
  prepareAndPersistHookTransaction,
  readPendingHookTransactions,
} from "../scripts/lib/anti-churn-hook-transaction-store.mjs";

test("prepareHookTransaction records exact hunk hashes and required transaction fields", () => {
  const transaction = prepareHookTransaction({
    lane: "lane-123",
    candidate: candidate(),
    targetContent: "- keep\n- retry inside sandbox\n- keep\n",
    preimageHunk: "- retry inside sandbox",
    plannedPostimageHunk: "- request outside-sandbox approval",
    now: "2026-06-22T12:00:00Z",
  });

  assert.match(transaction.transactionId, /^hooktxn-20260622T120000Z-[a-f0-9]{12}$/);
  assert.equal(transaction.schemaVersion, 1);
  assert.equal(transaction.lane, "lane-123");
  assert.equal(transaction.targetFile, "docs/workflows/tool-churn-rca-examples.md");
  assert.equal(transaction.preimageHunk, "- retry inside sandbox");
  assert.match(transaction.preimageHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(transaction.plannedPostimageHunk, "- request outside-sandbox approval");
  assert.match(transaction.plannedPostimageHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(transaction.verificationCommand, "pnpm run check:token-economy");
  assert.equal(transaction.authorityDecision.autonomyTier, "tier-1-safe-automatic");
  assert.equal(transaction.status, "prepared");
});

test("prepareHookTransaction refuses missing, duplicated, and broad markdown preimages", () => {
  assert.throws(
    () => prepareHookTransaction({
      lane: "lane-123",
      candidate: candidate(),
      targetContent: "- keep\n",
      preimageHunk: "- missing",
      plannedPostimageHunk: "- update",
    }),
    /PREIMAGE_NOT_FOUND/,
  );
  assert.throws(
    () => prepareHookTransaction({
      lane: "lane-123",
      candidate: candidate(),
      targetContent: "- duplicate\n- duplicate\n",
      preimageHunk: "- duplicate",
      plannedPostimageHunk: "- update",
    }),
    /PREIMAGE_NOT_UNIQUE/,
  );
  assert.throws(
    () => prepareHookTransaction({
      lane: "lane-123",
      candidate: candidate(),
      targetContent: "First paragraph.\n\nSecond paragraph.\n",
      preimageHunk: "First paragraph.\n\nSecond paragraph.",
      plannedPostimageHunk: "Replacement.",
    }),
    /BROAD_MARKDOWN_REWRITE/,
  );
  assert.throws(
    () => prepareHookTransaction({
      lane: "lane-123",
      candidate: candidate(),
      targetContent: "A paragraph with retry inside sandbox embedded in the sentence.\n",
      preimageHunk: "retry inside sandbox",
      plannedPostimageHunk: "request outside-sandbox approval",
    }),
    /PREIMAGE_NOT_FOUND/,
  );
});

test("prepareAndPersistHookTransaction writes under ignored workspace state and rejects unsafe paths", () => {
  const fixture = createFixture();
  try {
    const prepared = prepareAndPersistHookTransaction({
      lane: "lane-123",
      candidate: candidate(),
      targetContent: "- retry inside sandbox\n",
      preimageHunk: "- retry inside sandbox",
      plannedPostimageHunk: "- request outside-sandbox approval",
      now: "2026-06-22T12:00:00Z",
    }, {
      stateRoot: fixture.stateRoot,
    });

    assert.equal(prepared.status, "prepared");
    assert.equal(existsSync(prepared.transactionPath), true);
    const stored = JSON.parse(readFileSync(prepared.transactionPath, "utf8"));
    assert.equal(stored.transactionId, prepared.transaction.transactionId);

    assert.throws(
      () => prepareAndPersistHookTransaction({
        lane: "lane-123",
        candidate: candidate(),
        targetContent: "- retry inside sandbox\n",
        preimageHunk: "- retry inside sandbox",
        plannedPostimageHunk: "- request outside-sandbox approval",
      }, {
        stateRoot: join(process.cwd(), "anti-churn-unsafe-transactions"),
      }),
      HookTransactionStoreError,
    );
  } finally {
    fixture.cleanup();
  }
});

test("pending transactions are detected and inspected without mutation", () => {
  const fixture = createFixture();
  try {
    const prepared = prepareAndPersistHookTransaction({
      lane: "lane-123",
      candidate: candidate(),
      targetContent: "- retry inside sandbox\n",
      preimageHunk: "- retry inside sandbox",
      plannedPostimageHunk: "- request outside-sandbox approval",
      now: "2026-06-22T12:00:00Z",
    }, {
      stateRoot: fixture.stateRoot,
    });

    const pending = readPendingHookTransactions({ lane: "lane-123" }, { stateRoot: fixture.stateRoot });
    assert.equal(pending.transactions.length, 1);
    assert.equal(pending.transactions[0].transactionId, prepared.transaction.transactionId);

    const inspected = inspectPendingHookTransactions({ lane: "lane-123" }, {
      stateRoot: fixture.stateRoot,
      sourceSnapshots: {
        "docs/workflows/tool-churn-rca-examples.md": "- user changed this hunk\n",
      },
    });
    assert.equal(inspected.status, "manual-inspection-required");
    assert.equal(inspected.transactions[0].inspection, "manual-inspection-required");
  } finally {
    fixture.cleanup();
  }
});

test("apply-safe blocks source application when the target file cannot be read", () => {
  const fixture = createFixture();
  try {
    recordChurnEvent(event(), {
      stateRoot: fixture.stateRoot,
    });

    const result = runAntiChurnGuidanceHookCli(
      ["evaluate", "--lane", "lane-123", "--apply-safe", "--format", "json"],
      {
        env: {
          ...process.env,
          CODEX_WORKSPACE_ROOT: fixture.stateRoot,
        },
        sourceSnapshots: {
          ...emptySnapshots(),
          "docs/workflows/tool-churn-rca-examples.md": "- retry inside sandbox\n",
        },
        laneManifest: manifest(),
        now: "2026-06-22T12:00:00Z",
        plannedSourceUpdates: [
          {
            candidateId: "candidate-transaction",
            targetFile: "docs/workflows/tool-churn-rca-examples.md",
            preimageHunk: "- retry inside sandbox",
            plannedPostimageHunk: "- request outside-sandbox approval",
          },
        ],
      },
    );

    assert.equal(result.status, "requires-higher-authority");
    assert.match(result.transactionId, /^hooktxn-/);
    assert.match(result.warnings.join(";"), /PREIMAGE_NOT_FOUND/);
    assert.deepEqual(result.filesChanged, []);
    assert.deepEqual(result.applied, []);
  } finally {
    fixture.cleanup();
  }
});

test("apply-safe blocks source application when transaction storage is unsafe", () => {
  const fixture = createFixture();
  try {
    recordChurnEvent(event(), {
      stateRoot: fixture.stateRoot,
    });

    const result = runAntiChurnGuidanceHookCli(
      ["evaluate", "--lane", "lane-123", "--apply-safe", "--format", "json"],
      {
        env: {
          ...process.env,
          CODEX_WORKSPACE_ROOT: fixture.stateRoot,
        },
        sourceSnapshots: {
          ...emptySnapshots(),
          "docs/workflows/tool-churn-rca-examples.md": "- retry inside sandbox\n",
        },
        laneManifest: manifest(),
        now: "2026-06-22T12:00:00Z",
        transactionStateRoot: join(process.cwd(), "anti-churn-unsafe-transactions"),
        plannedSourceUpdates: [
          {
            candidateId: "candidate-transaction",
            targetFile: "docs/workflows/tool-churn-rca-examples.md",
            preimageHunk: "- retry inside sandbox",
            plannedPostimageHunk: "- request outside-sandbox approval",
          },
        ],
      },
    );

    assert.equal(result.status, "requires-higher-authority");
    assert.equal(result.exitCode, 3);
    assert.equal(result.transactionId, null);
    assert.match(result.warnings.join(";"), /UNSAFE_TRANSACTION_STORAGE/);
    assert.deepEqual(result.filesChanged, []);
    assert.deepEqual(result.applied, []);
  } finally {
    fixture.cleanup();
  }
});

test("apply-safe reports pending transaction manual inspection before preparing another", () => {
  const fixture = createFixture();
  try {
    recordChurnEvent(event(), {
      stateRoot: fixture.stateRoot,
    });
    prepareAndPersistHookTransaction({
      lane: "lane-123",
      candidate: candidate(),
      targetContent: "- retry inside sandbox\n",
      preimageHunk: "- retry inside sandbox",
      plannedPostimageHunk: "- request outside-sandbox approval",
      now: "2026-06-22T12:00:00Z",
    }, {
      stateRoot: fixture.stateRoot,
    });

    const result = runAntiChurnGuidanceHookCli(
      ["evaluate", "--lane", "lane-123", "--apply-safe", "--format", "json"],
      {
        env: {
          ...process.env,
          CODEX_WORKSPACE_ROOT: fixture.stateRoot,
        },
        sourceSnapshots: {
          ...emptySnapshots(),
          "docs/workflows/tool-churn-rca-examples.md": "- user changed this hunk\n",
        },
        laneManifest: manifest(),
        now: "2026-06-22T12:00:00Z",
        plannedSourceUpdates: [
          {
            candidateId: "candidate-transaction",
            targetFile: "docs/workflows/tool-churn-rca-examples.md",
            preimageHunk: "- retry inside sandbox",
            plannedPostimageHunk: "- request outside-sandbox approval",
          },
        ],
      },
    );

    assert.equal(result.status, "requires-higher-authority");
    assert.equal(result.exitCode, 3);
    assert.equal(result.transactionId, null);
    assert.match(result.warnings.join(";"), /manual-inspection-required/);
    assert.deepEqual(result.filesChanged, []);
    assert.deepEqual(result.applied, []);
  } finally {
    fixture.cleanup();
  }
});

function candidate(overrides = {}) {
  return {
    candidateId: "candidate-transaction",
    sourceEventId: "churn-transaction",
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
    eventId: "churn-transaction",
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

function emptySnapshots() {
  return {
    "docs/workflows/tool-churn-rca-examples.md": "",
    "docs/workflows/tool-churn-rca.md": "",
    AGENTS: "",
    "docs/workflows/end-to-end-lane-runner.md": "",
    "scripts/check-token-economy.mjs": "",
  };
}

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "anti-churn-hook-transaction-"));
  return {
    stateRoot: join(root, "state"),
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
