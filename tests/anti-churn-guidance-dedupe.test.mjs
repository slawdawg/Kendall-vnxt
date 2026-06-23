import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  classifyGuidanceCandidates,
  dedupeGuidanceCandidates,
} from "../scripts/lib/anti-churn-guidance-candidate-classifier.mjs";
import { runAntiChurnGuidanceHookCli } from "../scripts/anti-churn-guidance-hook.mjs";
import { recordChurnEvent } from "../scripts/lib/anti-churn-event-writer.mjs";

test("dedupe computes normalized keys from failure class, signature, and next safe action", () => {
  const result = dedupeGuidanceCandidates([
    candidate({
      failureClass: " Sandbox ",
      signature: ".GIT/WORKTREES Read-Only Filesystem Boundary",
      nextSafeAction: "Request approval to rerun exact command outside sandbox.",
    }),
  ], {
    sourceSnapshots: emptySnapshots(),
  });

  assert.equal(result.candidates.length, 1);
  assert.equal(
    result.candidates[0].dedupeKey,
    "sandbox|git-worktrees-read-only-filesystem-boundary|request-approval-to-rerun-exact-command-outside-sandbox",
  );
});

test("specific existing guidance returns already-covered with no proposal", () => {
  const result = dedupeGuidanceCandidates([
    candidate({
      candidateId: "candidate-covered",
      signature: ".git/worktrees read-only filesystem boundary",
      nextSafeAction: "Request approval to rerun the exact same read-only verification command outside the sandbox.",
    }),
  ], {
    sourceSnapshots: {
      "docs/workflows/tool-churn-rca-examples.md": [
        "Failure class: sandbox",
        "Evidence: .git/worktrees read-only filesystem boundary",
        "Retry stop line: Do not retry the same workspace test inside the sandbox.",
        "One next safe action: Request approval to rerun the exact same read-only verification command outside the sandbox.",
      ].join("\n"),
    },
  });

  assert.equal(result.candidates.length, 0);
  assert.equal(result.proposals.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].candidateId, "candidate-covered");
  assert.equal(result.skipped[0].noOpReason, "already-covered");
  assert.equal(result.skipped[0].coverage.status, "already-covered");
  assert.deepEqual(result.skipped[0].coverage.matchedSources, ["docs/workflows/tool-churn-rca-examples.md"]);
});

test("vague matching guidance becomes proposal-only would-add-noise", () => {
  const result = dedupeGuidanceCandidates([
    candidate({
      candidateId: "candidate-vague",
      signature: "sandbox runner timeout before output",
      nextSafeAction: "Confirm with pwd, then retry once with a simpler direct command shape.",
    }),
  ], {
    sourceSnapshots: {
      "docs/workflows/tool-churn-rca.md": "For sandbox problems, stop retrying and use a simpler command.",
    },
  });

  assert.equal(result.candidates.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].noOpReason, "would-add-noise");
  assert.equal(result.skipped[0].decision, "proposal");
  assert.match(result.skipped[0].coverage.reason, /broad append-only guidance/i);
});

test("conflicting source-owned guidance is proposal-only or higher authority", () => {
  const result = dedupeGuidanceCandidates([
    candidate({
      candidateId: "candidate-conflict",
      signature: ".git/worktrees read-only filesystem boundary",
      nextSafeAction: "Request approval to rerun the exact same read-only verification command outside the sandbox.",
    }),
  ], {
    sourceSnapshots: {
      AGENTS: [
        ".git/worktrees read-only filesystem boundary",
        "One next safe action: skip the Git-worktree test and change the test scope.",
      ].join("\n"),
    },
  });

  assert.equal(result.candidates.length, 0);
  assert.equal(result.proposals.length, 1);
  assert.equal(result.proposals[0].candidateId, "candidate-conflict");
  assert.equal(result.proposals[0].noOpReason, "requires-higher-authority");
  assert.equal(result.proposals[0].coverage.status, "conflicting-guidance");
});

test("dedupe preserves explicit authority families on prepare-only proposals", () => {
  const result = dedupeGuidanceCandidates([
    candidate({
      candidateId: "candidate-authority",
      durableTarget: "higher-authority:proposal",
      verification: null,
      verificationPlan: {
        status: "requires-higher-authority",
        target: "higher-authority:proposal",
        command: null,
        expectedEvidence: null,
        noOpReason: "requires-higher-authority",
        autonomyTier: "tier-3-block-and-ask",
        warnings: ["higher-authority-surface:higher-authority:proposal"],
        requiresAuthority: ["branch-deletion", "remote-mutation"],
      },
      requiresAuthority: ["branch-deletion", "remote-mutation"],
      autonomyTier: "tier-3-block-and-ask",
      decision: "proposal",
      noOpReason: "requires-higher-authority",
    }),
  ], {
    sourceSnapshots: emptySnapshots(),
  });

  assert.equal(result.proposals.length, 1);
  assert.deepEqual(result.proposals[0].requiredAuthority, ["branch-deletion", "remote-mutation"]);
  assert.match(result.proposals[0].residualRisk, /branch-deletion, remote-mutation/);
});

test("same command with different root-cause evidence is not collapsed", () => {
  const first = candidate({
    candidateId: "candidate-worktrees",
    sourceEventId: "churn-worktrees",
    signature: ".git/worktrees read-only filesystem boundary",
    nextSafeAction: "Request approval to rerun exact command outside sandbox.",
  });
  const second = candidate({
    candidateId: "candidate-uv-cache",
    sourceEventId: "churn-uv",
    signature: "$HOME/.cache/uv read-only filesystem boundary",
    nextSafeAction: "Request approval to rerun exact command outside sandbox.",
  });

  const result = dedupeGuidanceCandidates([first, second], {
    sourceSnapshots: emptySnapshots(),
  });

  assert.equal(result.candidates.length, 2);
  assert.notEqual(result.candidates[0].dedupeKey, result.candidates[1].dedupeKey);
});

test("matching candidates collapse by normalized failure, signature, and next action", () => {
  const result = dedupeGuidanceCandidates([
    candidate({
      candidateId: "candidate-a",
      sourceEventId: "churn-a",
      signature: ".git/worktrees read-only filesystem boundary",
      nextSafeAction: "Request approval to rerun exact command outside sandbox.",
    }),
    candidate({
      candidateId: "candidate-b",
      sourceEventId: "churn-b",
      signature: " .git/worktrees READ ONLY filesystem boundary ",
      nextSafeAction: "Request approval to rerun exact command outside sandbox!",
    }),
  ], {
    sourceSnapshots: emptySnapshots(),
  });

  assert.equal(result.candidates.length, 1);
  assert.deepEqual(result.candidates[0].collapsedSourceEventIds, ["churn-a", "churn-b"]);
  assert.deepEqual(result.candidates[0].collapsedCandidateIds, ["candidate-a", "candidate-b"]);
});

test("dedupe does not mutate input candidate objects", () => {
  const input = [candidate({ candidateId: "candidate-immutable" })];
  const before = structuredClone(input);

  dedupeGuidanceCandidates(input, {
    sourceSnapshots: emptySnapshots(),
  });

  assert.deepEqual(input, before);
});

test("evaluate CLI includes deduped candidates and skipped coverage", () => {
  const fixture = createFixture();
  try {
    recordChurnEvent(event({ laneId: "lane-123" }), {
      stateRoot: fixture.stateRoot,
    });

    const result = runAntiChurnGuidanceHookCli(
      ["evaluate", "--lane", "lane-123", "--dry-run", "--format", "json"],
      {
        env: {
          ...process.env,
          CODEX_WORKSPACE_ROOT: fixture.stateRoot,
        },
        sourceSnapshots: {
          "docs/workflows/tool-churn-rca-examples.md": [
            ".git/worktrees read-only filesystem boundary",
            "Request approval to rerun the exact same read-only verification command outside the sandbox.",
          ].join("\n"),
        },
      },
    );

    assert.equal(result.status, "success");
    assert.equal(result.lessonsEvaluated, 1);
    assert.equal(result.proposals.length, 0);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.skipped[0].noOpReason, "already-covered");
    assert.deepEqual(result.filesChanged, []);
    assert.deepEqual(result.applied, []);
  } finally {
    fixture.cleanup();
  }
});

function candidate(overrides = {}) {
  return {
    candidateId: "candidate-base",
    sourceEventId: "churn-base",
    lane: "lane-123",
    failureClass: "sandbox",
    signature: ".git/worktrees read-only filesystem boundary",
    wrongRetryPattern: "retrying inside sandbox",
    nextSafeAction: "Request approval to rerun exact command outside sandbox.",
    targetGuidance: "tool-churn-rca-examples",
    durableTarget: "docs/workflows/tool-churn-rca-examples.md",
    verification: "pnpm run check:token-economy",
    autonomyTier: "tier-1-safe-automatic",
    decision: "candidate",
    noOpReason: null,
    requiresAuthority: [],
    warnings: [],
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
  const root = mkdtempSync(join(tmpdir(), "anti-churn-guidance-dedupe-"));
  return {
    stateRoot: join(root, "state"),
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
