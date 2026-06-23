import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runAntiChurnGuidanceHookCli } from "../scripts/anti-churn-guidance-hook.mjs";
import { recordChurnEvent } from "../scripts/lib/anti-churn-event-writer.mjs";
import { classifyGuidanceCandidates } from "../scripts/lib/anti-churn-guidance-candidate-classifier.mjs";

test("complete low-risk churn events become tier-1 guidance candidates", () => {
  const result = classifyGuidanceCandidates(successReadResult({
    events: [
      validEvent({
        eventId: "churn-low-risk-1",
        signature: ".git/worktrees read-only filesystem boundary",
      }),
    ],
  }));

  assert.equal(result.status, "success");
  assert.equal(result.mode, "dry-run");
  assert.equal(result.lane, "lane-123");
  assert.equal(result.candidates.length, 1);
  assert.equal(result.skipped.length, 0);
  assert.deepEqual(result.warnings, []);

  const candidate = result.candidates[0];
  assert.match(candidate.candidateId, /^candidate-/);
  assert.equal(candidate.sourceEventId, "churn-low-risk-1");
  assert.equal(candidate.failureClass, "sandbox");
  assert.equal(candidate.signature, ".git/worktrees read-only filesystem boundary");
  assert.equal(candidate.targetGuidance, "tool-churn-rca-examples");
  assert.equal(candidate.durableTarget, "docs/workflows/tool-churn-rca-examples.md");
  assert.equal(candidate.verification, "pnpm run check:token-economy");
  assert.equal(candidate.autonomyTier, "tier-1-safe-automatic");
  assert.equal(candidate.decision, "candidate");
  assert.equal(candidate.noOpReason, null);
  assert.deepEqual(candidate.requiresAuthority, []);
});

test("candidate ids are stable across fixture replay", () => {
  const event = validEvent({ eventId: "churn-stable-id" });
  const first = classifyGuidanceCandidates(successReadResult({ events: [event] }));
  const second = classifyGuidanceCandidates(successReadResult({ events: [{ ...event }] }));

  assert.equal(first.candidates.length, 1);
  assert.equal(second.candidates.length, 1);
  assert.equal(first.candidates[0].candidateId, second.candidates[0].candidateId);
});

test("classification creates candidate records without mutating input events", () => {
  const event = validEvent({ eventId: "churn-distinct-record" });
  const before = structuredClone(event);
  const result = classifyGuidanceCandidates(successReadResult({ events: [event] }));

  assert.notEqual(result.candidates[0], event);
  assert.deepEqual(event, before);
});

test("missing tier gates downgrade to typed no-op without fabricating fields", () => {
  const event = validEvent({
    eventId: "churn-missing-gate",
    nextSafeAction: "",
  });

  const result = classifyGuidanceCandidates(successReadResult({ events: [event] }));

  assert.equal(result.candidates.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].sourceEventId, "churn-missing-gate");
  assert.equal(result.skipped[0].noOpReason, "insufficient-evidence");
  assert.match(result.skipped[0].warnings[0], /missing-nextSafeAction/);
  assert.equal(Object.hasOwn(result.skipped[0], "nextSafeAction"), false);
});

test("higher-authority churn produces prepare-only candidate with no apply-safe plan", () => {
  const result = classifyGuidanceCandidates(successReadResult({
    events: [
      validEvent({
        eventId: "churn-github-mutation",
        failureClass: "github",
        signature: "branch deletion remote mutation needed",
        evidenceSummary: "Lesson would require deleting a remote branch.",
        wrongRetryPattern: "retrying cleanup without remote deletion authority",
        nextSafeAction: "ask the operator before deleting remote branches",
        metadata: {
          wrongRetryPrevented: true,
          requiresAuthority: ["branch-deletion", "remote-mutation"],
        },
      }),
    ],
  }));

  assert.equal(result.candidates.length, 1);
  assert.equal(result.skipped.length, 0);
  assert.equal(result.candidates[0].noOpReason, "requires-higher-authority");
  assert.equal(result.candidates[0].autonomyTier, "tier-3-block-and-ask");
  assert.equal(result.candidates[0].decision, "proposal");
  assert.equal(result.candidates[0].verificationPlan.status, "requires-higher-authority");
  assert.equal(result.requiresAuthority.length, 1);
  assert.deepEqual(result.requiresAuthority[0].authority, ["branch-deletion", "remote-mutation"]);
});

test("insufficient reader evidence and non-repeatable events become typed no-ops", () => {
  const missing = classifyGuidanceCandidates({
    status: "insufficient-evidence",
    lane: "lane-123",
    events: [],
    warnings: ["missing-event-store"],
    requiresAuthority: [],
  });

  assert.equal(missing.status, "insufficient-evidence");
  assert.equal(missing.candidates.length, 0);
  assert.equal(missing.skipped[0].noOpReason, "insufficient-evidence");
  assert.deepEqual(missing.warnings, ["missing-event-store"]);

  const notRepeatable = classifyGuidanceCandidates(successReadResult({
    events: [
      validEvent({
        eventId: "churn-no-repeatability",
        wrongRetryPrevented: false,
        metadata: {},
      }),
    ],
  }));

  assert.equal(notRepeatable.candidates.length, 0);
  assert.equal(notRepeatable.skipped.length, 1);
  assert.equal(notRepeatable.skipped[0].noOpReason, "not-repeatable");
});

test("reader warnings are preserved and not converted into fabricated candidates", () => {
  const result = classifyGuidanceCandidates(successReadResult({
    events: [
      validEvent({ eventId: "churn-valid-after-malformed" }),
    ],
    warnings: ["malformed-event-line:2", "invalid-event-line:3"],
  }));

  assert.equal(result.candidates.length, 1);
  assert.deepEqual(result.warnings, ["malformed-event-line:2", "invalid-event-line:3"]);
});

test("evaluate CLI performs dry-run classification from local lane events", () => {
  const fixture = createFixture();
  try {
    const written = recordChurnEvent(validEvent({ laneId: "lane-123" }), {
      stateRoot: fixture.stateRoot,
    });

    const result = runAntiChurnGuidanceHookCli(
      ["evaluate", "--lane", "lane-123", "--dry-run", "--format", "json"],
      {
        env: {
          ...process.env,
          CODEX_WORKSPACE_ROOT: fixture.stateRoot,
        },
      },
    );

    assert.equal(result.schemaVersion, 1);
    assert.equal(result.status, "success");
    assert.equal(result.mode, "dry-run");
    assert.equal(result.lane, "lane-123");
    assert.equal(result.eventStore, written.eventStore);
    assert.equal(result.lessonsEvaluated, 1);
    assert.equal(result.proposals.length, 0);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.skipped[0].sourceEventId, written.eventId);
    assert.equal(result.skipped[0].noOpReason, "already-covered");
    assert.equal(result.requiresAuthority.length, 1);
    assert.equal(result.requiresAuthority[0].reason, "pr-state-not-read-in-local-backfill");
    assert.deepEqual(result.filesChanged, []);
    assert.deepEqual(result.applied, []);
  } finally {
    fixture.cleanup();
  }
});

test("standalone evaluate defaults to dry-run mode", () => {
  const fixture = createFixture();
  try {
    recordChurnEvent(validEvent({ laneId: "lane-123" }), {
      stateRoot: fixture.stateRoot,
    });

    const result = runAntiChurnGuidanceHookCli(
      ["evaluate", "--lane", "lane-123", "--format", "json"],
      {
        env: {
          ...process.env,
          CODEX_WORKSPACE_ROOT: fixture.stateRoot,
        },
      },
    );

    assert.equal(result.mode, "dry-run");
    assert.equal(result.lessonsEvaluated, 1);
    assert.equal(result.proposals.length, 0);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.skipped[0].noOpReason, "already-covered");
  } finally {
    fixture.cleanup();
  }
});

test("standalone dry-run command shape works without evaluate verb", () => {
  const fixture = createFixture();
  try {
    recordChurnEvent(validEvent({ laneId: "lane-123" }), {
      stateRoot: fixture.stateRoot,
    });

    const result = runAntiChurnGuidanceHookCli(
      ["--lane", "lane-123", "--dry-run", "--format", "json"],
      {
        env: {
          ...process.env,
          CODEX_WORKSPACE_ROOT: fixture.stateRoot,
        },
      },
    );

    assert.equal(result.mode, "dry-run");
    assert.equal(result.lessonsEvaluated, 1);
    assert.equal(result.proposals.length, 0);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.skipped[0].noOpReason, "already-covered");
  } finally {
    fixture.cleanup();
  }
});

function successReadResult(overrides = {}) {
  return {
    status: "success",
    lane: "lane-123",
    eventStore: "/local/churn-events/lane-123.jsonl",
    events: [],
    warnings: [],
    requiresAuthority: [],
    chatFallbackUsed: false,
    ...overrides,
  };
}

function validEvent(overrides = {}) {
  const metadata = Object.hasOwn(overrides, "metadata")
    ? overrides.metadata
    : { wrongRetryPrevented: true };

  return {
    schemaVersion: 1,
    eventId: "churn-20260622-lane-123",
    lane: overrides.laneId || "lane-123",
    phase: "verification",
    failureClass: "sandbox",
    signature: ".git/worktrees read-only filesystem boundary",
    attemptedCommand: "pnpm run check:static",
    evidenceSummary: "Workspace verification hit a .git/worktrees read-only filesystem boundary.",
    wrongRetryPattern: "retrying the same read-only verification command inside the sandbox after a filesystem boundary",
    wrongRetryPrevented: true,
    nextSafeAction: "request approval to rerun the exact same read-only command outside the sandbox: pnpm run check:static",
    createdAt: "2026-06-22T12:00:00Z",
    metadata,
    ...overrides,
  };
}

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "anti-churn-guidance-candidate-"));
  return {
    stateRoot: join(root, "state"),
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
