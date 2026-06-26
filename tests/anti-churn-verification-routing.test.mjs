import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runAntiChurnGuidanceHookCli } from "../scripts/anti-churn-guidance-hook.mjs";
import { recordChurnEvent } from "../scripts/lib/anti-churn-event-writer.mjs";
import {
  classifyGuidanceCandidates,
  dedupeGuidanceCandidates,
  resolveGuidanceVerificationRoute,
} from "../scripts/lib/anti-churn-guidance-candidate-classifier.mjs";

test("static verification routing maps RCA docs to token economy verification", () => {
  for (const durableTarget of [
    "docs/workflows/tool-churn-rca.md",
    "docs/workflows/tool-churn-rca-examples.md",
  ]) {
    const route = resolveGuidanceVerificationRoute({ durableTarget });

    assert.equal(route.status, "mapped");
    assert.equal(route.target, durableTarget);
    assert.equal(route.command, "pnpm run check:token-economy");
    assert.match(route.expectedEvidence, /token-economy/);
  }
});

test("static verification routing maps lane guidance and existing drift checks", () => {
  const lane = resolveGuidanceVerificationRoute({
    durableTarget: "docs/workflows/end-to-end-lane-runner.md",
  });
  const drift = resolveGuidanceVerificationRoute({
    durableTarget: "scripts/check-token-economy.mjs",
  });

  assert.equal(lane.status, "mapped");
  assert.equal(lane.command, "pnpm run check:token-economy");
  assert.match(lane.expectedEvidence, /lane-runner/);
  assert.equal(drift.status, "mapped");
  assert.equal(drift.command, "node ./scripts/check-token-economy.mjs");
});

test("generic equivalent and module-resolution churn route to Tool Churn RCA guidance", () => {
  for (const signature of [
    "module resolution failure",
    "equivalent repeated failure: same unresolved condition",
  ]) {
    const result = classifyGuidanceCandidates({
      status: "success",
      lane: "lane-123",
      events: [
        event({
          eventId: `churn-${signature.replaceAll(/\W+/g, "-")}`,
          lane: "lane-123",
          signature,
          failureClass: "dependency",
          durableUpdate: null,
        }),
      ],
    });

    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].targetGuidance, "tool-churn-rca");
    assert.equal(result.candidates[0].durableTarget, "docs/workflows/tool-churn-rca.md");
    assert.equal(result.candidates[0].verificationPlan.command, "pnpm run check:token-economy");
  }
});

test("unmapped targets downgrade to proposal-only unsupported verification route", () => {
  const result = dedupeGuidanceCandidates([
    candidate({ durableTarget: "docs/workflows/unmapped-guidance.md" }),
  ], {
    sourceSnapshots: emptySnapshots(),
  });

  assert.equal(result.candidates.length, 0);
  assert.equal(result.proposals.length, 1);
  assert.equal(result.proposals[0].noOpReason, "unsupported-verification-route");
  assert.equal(result.proposals[0].verificationPlan.status, "unsupported-verification-route");
  assert.equal(result.proposals[0].verificationPlan.command, null);
});

test("higher-authority surfaces do not remain tier-1 eligible", () => {
  for (const durableTarget of [
    "AGENTS.md",
    "scripts/new-preflight.mjs",
    "github:branch-protection",
    "provider:openai",
    "package.json",
  ]) {
    const route = resolveGuidanceVerificationRoute({ durableTarget });

    assert.equal(route.status, "requires-higher-authority");
    assert.equal(route.autonomyTier, "tier-3-block-and-ask");
    assert.equal(route.command, null);
  }
});

test("evaluation output surfaces higher-authority routes as rich proposals without mutation", () => {
  const fixture = createFixture();
  try {
    recordChurnEvent(event({ eventId: "churn-agents-route", durableUpdate: "AGENTS.md" }), {
      stateRoot: fixture.stateRoot,
    });

    const result = runAntiChurnGuidanceHookCli(
      ["evaluate", "--lane", "lane-123", "--format", "json"],
      {
        env: {
          ...process.env,
          CODEX_WORKSPACE_ROOT: fixture.stateRoot,
        },
        sourceSnapshots: emptySnapshots(),
      },
    );

    assert.equal(result.status, "success");
    assert.equal(result.lessonsEvaluated, 1);
    assert.equal(result.proposals.length, 1);
    assert.equal(result.proposals[0].noOpReason, "requires-higher-authority");
    assert.equal(result.proposals[0].verificationPlan.status, "requires-higher-authority");
    assert.equal(result.proposals[0].dedupeKey, "sandbox|git-worktrees-read-only-filesystem-boundary|request-approval-to-rerun-exact-same-read-only-verification-command-outside-sandbox");
    assert.equal(result.proposals[0].proposedTarget, "AGENTS.md");
    assert.match(result.proposals[0].verificationIdea, /operator-visible approval/i);
    assert.match(result.proposals[0].residualRisk, /explicit operator-visible approval/i);
    assert.equal(
      result.requiresAuthority.some((entry) => entry.reason === "requires-higher-authority"),
      true,
    );
    assert.deepEqual(result.filesChanged, []);
    assert.deepEqual(result.applied, []);
  } finally {
    fixture.cleanup();
  }
});

test("apply-safe keeps higher-authority proposals local without transaction or source mutation", () => {
  const fixture = createFixture();
  try {
    recordChurnEvent(event({ eventId: "churn-provider-route", durableUpdate: "provider:openai" }), {
      stateRoot: fixture.stateRoot,
    });

    const result = runAntiChurnGuidanceHookCli(
      ["evaluate", "--lane", "lane-123", "--apply-safe", "--format", "json"],
      {
        env: {
          ...process.env,
          CODEX_WORKSPACE_ROOT: fixture.stateRoot,
        },
        laneManifest: {
          taskId: "lane-123",
          branch: "codex/lane-123",
          worktreePath: "/tmp/lane-123",
          baseBranch: "main",
          pr: { merged: false },
          cleanup: { status: "not-started" },
          dirtyWorktree: {
            checkedAt: "2026-06-22T12:00:00Z",
            paths: [],
          },
        },
        sourceSnapshots: emptySnapshots(),
      },
    );

    assert.equal(result.status, "success");
    assert.equal(result.proposals.length, 1);
    assert.equal(result.proposals[0].proposedTarget, "provider:openai");
    assert.match(result.proposals[0].residualRisk, /provider/i);
    assert.deepEqual(result.filesChanged, []);
    assert.deepEqual(result.applied, []);
    assert.equal(result.transactionId, null);
  } finally {
    fixture.cleanup();
  }
});

test("external mature-tool lessons remain prepare-only with deferral language", () => {
  const result = dedupeGuidanceCandidates([
    candidate({
      durableTarget: "github:actions",
      signature: "reviewdog actionlint GitHub Actions adoption would reduce churn",
      nextSafeAction: "Prepare a mature-tool decision record before changing CI.",
      targetGuidance: "mature-tool-proposal",
      verificationPlan: {
        status: "requires-higher-authority",
        target: "github:actions",
        command: null,
        expectedEvidence: null,
        noOpReason: "requires-higher-authority",
        autonomyTier: "tier-3-block-and-ask",
        warnings: [],
        requiresAuthority: ["github-actions", "dependency-adoption"],
      },
      requiresAuthority: ["github-actions", "dependency-adoption"],
      autonomyTier: "tier-3-block-and-ask",
    }),
  ], {
    sourceSnapshots: emptySnapshots(),
  });

  assert.equal(result.proposals.length, 1);
  assert.equal(result.proposals[0].proposedTarget, "github:actions");
  assert.match(result.proposals[0].matureToolDecision, /defer/i);
  assert.match(result.proposals[0].residualRisk, /dependencies or project configuration/i);
});

function candidate(overrides = {}) {
  return {
    candidateId: "candidate-route",
    sourceEventId: "churn-route",
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
  const root = mkdtempSync(join(tmpdir(), "anti-churn-verification-routing-"));
  return {
    stateRoot: join(root, "state"),
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
