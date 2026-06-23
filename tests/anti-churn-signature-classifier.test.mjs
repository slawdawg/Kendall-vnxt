import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  classifyChurnFailure,
  recordClassifiedChurnEvent,
} from "../scripts/lib/anti-churn-signature-classifier.mjs";

test("known sandbox and read-only filesystem signatures become churn event inputs", () => {
  const cases = [
    {
      name: "pre-output sandbox timeout",
      observation: baseObservation({
        timedOutBeforeOutput: true,
        output: "",
        error: "",
      }),
      signature: "sandbox runner timeout before output",
      nextSafeAction: /confirm the sandbox runner with a simple serialized no-op/,
      evidenceSummary: /inconclusive/,
    },
    {
      name: ".git/worktrees EROFS",
      observation: baseObservation({
        error: "fatal: could not create leading directories of '.git/worktrees/codex-example': Read-only file system",
        readOnlyVerification: true,
      }),
      signature: ".git/worktrees read-only filesystem boundary",
      nextSafeAction: /rerun the exact same read-only command outside the sandbox/,
      evidenceSummary: /\.git\/worktrees/,
    },
    {
      name: "uv cache EROFS",
      observation: baseObservation({
        command: "uv run --directory services/supervisor python --version",
        error: "$HOME/.cache/uv cannot be written: Read-only file system",
        readOnlyVerification: true,
      }),
      signature: "$HOME/.cache/uv read-only filesystem boundary",
      nextSafeAction: /rerun the exact same read-only command outside the sandbox/,
      evidenceSummary: /\$HOME\/\.cache\/uv/,
    },
    {
      name: "managed pnpm temp EROFS",
      observation: baseObservation({
        command: "pnpm run check:static",
        error: "managed-worktree pnpm temp file failed: Read-only file system",
        readOnlyVerification: true,
      }),
      signature: "managed-worktree pnpm temp read-only filesystem boundary",
      nextSafeAction: /rerun the exact same read-only command outside the sandbox/,
      evidenceSummary: /pnpm temp/,
    },
  ];

  for (const { observation, signature, nextSafeAction, evidenceSummary } of cases) {
    const result = classifyChurnFailure(observation);
    assert.equal(result.status, "record-event");
    assert.equal(result.event.failureClass, "sandbox");
    assert.equal(result.event.signature, signature);
    assert.equal(result.event.attemptedCommand, observation.command);
    assert.match(result.event.nextSafeAction, nextSafeAction);
    assert.match(result.event.evidenceSummary, evidenceSummary);
    assert.equal(result.event.createdAt, "2026-06-22T12:00:00Z");
  }
});

test("repeated retry-loop signatures route to Tool Churn RCA", () => {
  const cases = [
    {
      failureKind: "quoting",
      error: "bash: unexpected EOF while looking for matching `\"'",
      signature: "shell quoting/parser error",
      failureClass: "tool-resolution",
    },
    {
      failureKind: "missing-tool",
      error: "mise: command not found",
      signature: "missing tool or path",
      failureClass: "tool-resolution",
    },
    {
      failureKind: "permission",
      error: "EACCES: permission denied",
      signature: "permission denied",
      failureClass: "permission",
    },
    {
      failureKind: "stale-state",
      error: "stale owner lease blocks mutation",
      signature: "stale state",
      failureClass: "stale-state",
    },
    {
      failureKind: "sandbox",
      error: "sandbox runner failed again after the same command shape",
      signature: "repeated sandbox failure",
      failureClass: "sandbox",
    },
    {
      failureKind: "environment",
      error: "environment setup failure repeated",
      signature: "repeated environment failure",
      failureClass: "environment",
    },
    {
      failureKind: "environment",
      error: "Tool Churn RCA classified environment setup failure",
      signature: "RCA-classified environment failure",
      failureClass: "environment",
      rcaClassified: true,
    },
  ];

  for (const current of cases) {
    const result = classifyChurnFailure(baseObservation({
      attemptCount: 2,
      ...current,
    }));
    assert.equal(result.status, "record-event");
    assert.equal(result.event.failureClass, current.failureClass);
    assert.equal(result.event.signature, current.signature);
    assert.match(result.event.wrongRetryPattern, /retrying/i);
    assert.match(result.event.nextSafeAction, /docs\/workflows\/tool-churn-rca\.md/);
  }
});

test("product assertion failures and one-off failures do not become churn events", () => {
  const productFailure = classifyChurnFailure(baseObservation({
    attemptCount: 4,
    failureKind: "product-assertion",
    error: "AssertionError: expected false to equal true",
  }));
  assert.equal(productFailure.status, "no-event");
  assert.equal(productFailure.reason, "product-assertion-failure");

  const oneOff = classifyChurnFailure(baseObservation({
    attemptCount: 1,
    failureKind: "permission",
    error: "EACCES: permission denied",
  }));
  assert.equal(oneOff.status, "no-event");
  assert.equal(oneOff.reason, "insufficient-repeated-evidence");
});

test("classified churn events can be recorded through the local event writer", () => {
  const fixture = createGitFixture();
  const stateRoot = join(fixture.root, "state");
  try {
    const result = recordClassifiedChurnEvent(
      baseObservation({
        error: "fatal: could not create leading directories of '.git/worktrees/codex-example': Read-only file system",
        readOnlyVerification: true,
      }),
      {
        repoRoot: fixture.repo,
        cwd: fixture.repo,
        stateRoot,
      },
    );

    assert.equal(result.status, "recorded");
    const events = readJsonl(result.eventStore);
    assert.equal(events.length, 1);
    assert.equal(events[0].signature, ".git/worktrees read-only filesystem boundary");
  } finally {
    fixture.cleanup();
  }
});

function baseObservation(overrides = {}) {
  return {
    laneId: "lane-123",
    phase: "verification",
    command: "pnpm run check:static",
    attemptCount: 1,
    output: "",
    error: "",
    readOnlyVerification: false,
    timedOutBeforeOutput: false,
    failureKind: "sandbox",
    rcaClassified: false,
    createdAt: "2026-06-22T12:00:00Z",
    ...overrides,
  };
}

function readJsonl(path) {
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function createGitFixture() {
  const root = mkdtempSync(join(tmpdir(), "anti-churn-signature-classifier-"));
  const repo = join(root, "repo");
  mkdirSync(repo);
  runGit(repo, ["init", "-q"]);
  runGit(repo, ["config", "user.email", "anti-churn-signature-test@example.com"]);
  runGit(repo, ["config", "user.name", "Anti Churn Signature Test"]);
  writeFileSync(join(repo, "README.md"), "fixture\n");
  runGit(repo, ["add", "README.md"]);
  runGit(repo, ["commit", "-q", "-m", "initial"]);

  return {
    root,
    repo,
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function runGit(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}
