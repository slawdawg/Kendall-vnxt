import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runAntiChurnGuidanceHookCli } from "../scripts/anti-churn-guidance-hook.mjs";
import { recordChurnEvent } from "../scripts/lib/anti-churn-event-writer.mjs";
import { evaluateApplySafeGate } from "../scripts/lib/anti-churn-apply-safe-gate.mjs";

test("missing required manifest fields downgrade apply-safe to proposal-only", () => {
  const result = evaluateApplySafeGate({
    manifest: { taskId: "lane-123", branch: "codex/lane-123" },
    candidates: [candidate()],
  });

  assert.equal(result.status, "proposal-only");
  assert.equal(result.noOpReason, "missing-lane-manifest-field");
  assert.deepEqual(result.missingFields, ["worktreePath", "baseBranch"]);
  assert.deepEqual(result.filesChanged, []);
  assert.deepEqual(result.applied, []);
});

test("merged PR and cleanup-started lanes downgrade to proposal-only", () => {
  const merged = evaluateApplySafeGate({
    manifest: manifest({ pr: { merged: true } }),
    candidates: [candidate()],
  });
  const cleanup = evaluateApplySafeGate({
    manifest: manifest({ cleanup: { status: "started" } }),
    candidates: [candidate()],
  });

  assert.equal(merged.status, "proposal-only");
  assert.equal(merged.noOpReason, "merged-pr");
  assert.equal(cleanup.status, "proposal-only");
  assert.equal(cleanup.noOpReason, "cleanup-started");
});

test("dirty evidence is required and overlapping dirty targets require higher authority", () => {
  const missingDirty = evaluateApplySafeGate({
    manifest: {
      ...manifest(),
      dirtyWorktree: null,
    },
    candidates: [candidate()],
  });
  const overlap = evaluateApplySafeGate({
    manifest: manifest({
      dirtyWorktree: {
        checkedAt: "2026-06-22T12:00:00Z",
        paths: ["docs/workflows/tool-churn-rca-examples.md"],
      },
    }),
    candidates: [candidate()],
  });
  const nonOverlap = evaluateApplySafeGate({
    manifest: manifest({
      dirtyWorktree: {
        checkedAt: "2026-06-22T12:00:00Z",
        paths: ["docs/workflows/other.md"],
      },
    }),
    candidates: [candidate()],
    now: "2026-06-22T12:00:00Z",
  });

  assert.equal(missingDirty.status, "proposal-only");
  assert.equal(missingDirty.noOpReason, "missing-dirty-worktree-evidence");
  assert.equal(overlap.status, "requires-higher-authority");
  assert.equal(overlap.noOpReason, "dirty-target-overlap");
  assert.deepEqual(overlap.dirtyTargets, ["docs/workflows/tool-churn-rca-examples.md"]);
  assert.equal(nonOverlap.status, "passed");
});

test("dirty overlap checks durable target, target file, and verification target", () => {
  const result = evaluateApplySafeGate({
    manifest: manifest({
      dirtyWorktree: {
        checkedAt: "2026-06-22T12:00:00Z",
        paths: [
          "docs/workflows/tool-churn-rca.md",
          "scripts/check-token-economy.mjs",
        ],
      },
    }),
    candidates: [
      candidate({
        durableTarget: "docs/workflows/tool-churn-rca-examples.md",
        targetFile: "docs/workflows/tool-churn-rca.md",
        verificationPlan: {
          ...candidate().verificationPlan,
          target: "scripts/check-token-economy.mjs",
        },
      }),
    ],
    now: "2026-06-22T12:00:00Z",
  });

  assert.equal(result.status, "requires-higher-authority");
  assert.deepEqual(result.dirtyTargets, [
    "docs/workflows/tool-churn-rca.md",
    "scripts/check-token-economy.mjs",
  ]);
});

test("stale dirty-worktree evidence blocks source application", () => {
  const result = evaluateApplySafeGate({
    manifest: manifest({
      dirtyWorktree: {
        checkedAt: "2026-06-20T12:00:00Z",
        paths: [],
      },
    }),
    candidates: [candidate()],
    now: "2026-06-22T12:00:00Z",
  });

  assert.equal(result.status, "proposal-only");
  assert.equal(result.noOpReason, "stale-dirty-worktree-evidence");
  assert.match(result.warnings[0], /stale-dirty-worktree-evidence/);
});

test("unavailable PR state downgrades PR-dependent candidates while local-only gates pass", () => {
  const prDependent = evaluateApplySafeGate({
    manifest: manifest({ pr: null }),
    candidates: [candidate({ requiresPrState: true })],
  });
  const localOnly = evaluateApplySafeGate({
    manifest: manifest({ pr: null }),
    candidates: [candidate()],
  });

  assert.equal(prDependent.status, "proposal-only");
  assert.equal(prDependent.noOpReason, "pr-state-unavailable");
  assert.equal(localOnly.status, "passed");
});

test("apply-safe evaluation uses gate-aware non-mutating JSON output", () => {
  const fixture = createFixture();
  try {
    recordChurnEvent(event({ eventId: "churn-apply-safe-gate" }), {
      stateRoot: fixture.stateRoot,
    });

    const result = runAntiChurnGuidanceHookCli(
      ["evaluate", "--lane", "lane-123", "--apply-safe", "--format", "json"],
      {
        env: {
          ...process.env,
          CODEX_WORKSPACE_ROOT: fixture.stateRoot,
        },
        sourceSnapshots: emptySnapshots(),
        now: "2026-06-22T12:00:00Z",
        laneManifest: manifest({
          dirtyWorktree: {
            checkedAt: "2026-06-22T12:00:00Z",
            paths: ["docs/workflows/tool-churn-rca-examples.md"],
          },
        }),
      },
    );

    assert.equal(result.status, "requires-higher-authority");
    assert.equal(result.exitCode, 3);
    assert.equal(result.requiresAuthority.some((entry) => entry.reason === "dirty-target-overlap"), true);
    assert.deepEqual(result.filesChanged, []);
    assert.deepEqual(result.applied, []);
    assert.equal(result.transactionId, null);
  } finally {
    fixture.cleanup();
  }
});

function manifest(overrides = {}) {
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
    ...overrides,
  };
}

function candidate(overrides = {}) {
  return {
    candidateId: "candidate-gate",
    sourceEventId: "churn-gate",
    lane: "lane-123",
    durableTarget: "docs/workflows/tool-churn-rca-examples.md",
    verificationPlan: {
      status: "mapped",
      target: "docs/workflows/tool-churn-rca-examples.md",
      command: "pnpm run check:token-economy",
      expectedEvidence: "token-economy drift check passes",
    },
    ...overrides,
  };
}

function event(overrides = {}) {
  return {
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
  const root = mkdtempSync(join(tmpdir(), "anti-churn-apply-safe-gate-"));
  return {
    stateRoot: join(root, "state"),
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
