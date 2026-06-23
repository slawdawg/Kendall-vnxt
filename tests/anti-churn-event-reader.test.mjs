import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { recordChurnEvent } from "../scripts/lib/anti-churn-event-writer.mjs";
import { readLaneChurnEvents } from "../scripts/lib/anti-churn-event-reader.mjs";
import { runAntiChurnGuidanceHookCli } from "../scripts/anti-churn-guidance-hook.mjs";

test("readLaneChurnEvents reads per-lane JSONL as the primary evidence source", () => {
  const fixture = createGitFixture();
  const stateRoot = join(fixture.root, "state");
  try {
    const written = recordChurnEvent(validEvent(), {
      repoRoot: fixture.repo,
      cwd: fixture.repo,
      stateRoot,
    });

    const result = readLaneChurnEvents({ laneId: "lane-123" }, {
      repoRoot: fixture.repo,
      cwd: fixture.repo,
      stateRoot,
    });

    assert.equal(result.status, "success");
    assert.equal(result.lane, "lane-123");
    assert.equal(result.eventStore, written.eventStore);
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].eventId, written.eventId);
    assert.deepEqual(result.warnings, []);
    assert.equal(result.metadata, null);
  } finally {
    fixture.cleanup();
  }
});

test("missing and empty lane event stores return insufficient evidence", () => {
  const fixture = createGitFixture();
  const stateRoot = join(fixture.root, "state");
  try {
    const missing = readLaneChurnEvents({ laneId: "missing-lane" }, {
      repoRoot: fixture.repo,
      cwd: fixture.repo,
      stateRoot,
    });

    assert.equal(missing.status, "insufficient-evidence");
    assert.deepEqual(missing.events, []);
    assert.deepEqual(missing.warnings, ["missing-event-store"]);

    const storeDir = join(resolve(stateRoot), "churn-events");
    mkdirSync(storeDir, { recursive: true });
    writeFileSync(join(storeDir, "empty-lane.jsonl"), "");
    const empty = readLaneChurnEvents({ laneId: "empty-lane" }, {
      repoRoot: fixture.repo,
      cwd: fixture.repo,
      stateRoot,
    });

    assert.equal(empty.status, "insufficient-evidence");
    assert.deepEqual(empty.events, []);
    assert.deepEqual(empty.warnings, ["empty-event-store"]);
  } finally {
    fixture.cleanup();
  }
});

test("malformed JSONL lines are warnings and valid event evidence is preserved", () => {
  const fixture = createGitFixture();
  const stateRoot = join(fixture.root, "state");
  try {
    const written = recordChurnEvent(validEvent(), {
      repoRoot: fixture.repo,
      cwd: fixture.repo,
      stateRoot,
    });
    writeFileSync(written.eventStore, `${JSON.stringify(written.event)}\nnot-json\n{"schemaVersion":1}\n`);

    const result = readLaneChurnEvents({ laneId: "lane-123" }, {
      repoRoot: fixture.repo,
      cwd: fixture.repo,
      stateRoot,
    });

    assert.equal(result.status, "success");
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].eventId, written.eventId);
    assert.deepEqual(result.warnings, ["malformed-event-line:2", "invalid-event-line:3"]);
  } finally {
    fixture.cleanup();
  }
});

test("cleaned-lane metadata is read without mutating local task state", () => {
  const fixture = createGitFixture();
  const stateRoot = join(fixture.root, "state");
  try {
    recordChurnEvent(validEvent(), {
      repoRoot: fixture.repo,
      cwd: fixture.repo,
      stateRoot,
    });
    const taskDir = join(resolve(stateRoot), "tasks");
    mkdirSync(taskDir, { recursive: true });
    const manifestPath = join(taskDir, "lane-123.json");
    writeFileSync(manifestPath, JSON.stringify({
      task_id: "lane-123",
      branch: "codex/lane-123",
      owner: "runner-1",
      worktree: join(fixture.root, "removed-worktree"),
      pr: "https://example.invalid/pr/1",
      cleanup_state: "closed",
    }, null, 2));
    const before = statSync(manifestPath).mtimeMs;

    const result = readLaneChurnEvents({ laneId: "lane-123", includeMetadata: true }, {
      repoRoot: fixture.repo,
      cwd: fixture.repo,
      stateRoot,
    });

    assert.equal(result.status, "success");
    assert.equal(result.metadata.available, true);
    assert.equal(result.metadata.worktreeExists, false);
    assert.equal(result.metadata.branch, "codex/lane-123");
    assert.equal(statSync(manifestPath).mtimeMs, before);
  } finally {
    fixture.cleanup();
  }
});

test("read-events CLI returns stable JSON and never falls back to chat or PR summaries", () => {
  const fixture = createGitFixture();
  const stateRoot = join(fixture.root, "state");
  try {
    const written = recordChurnEvent(validEvent(), {
      repoRoot: fixture.repo,
      cwd: fixture.repo,
      stateRoot,
    });

    const output = runAntiChurnGuidanceHookCli(
      ["read-events", "--lane", "lane-123", "--format", "json", "--include-metadata"],
      {
        env: {
          ...process.env,
          CODEX_WORKSPACE_ROOT: stateRoot,
        },
      },
    );

    assert.equal(output.status, "success");
    assert.equal(output.lane, "lane-123");
    assert.equal(output.eventCount, 1);
    assert.equal(output.eventStore, written.eventStore);
    assert.deepEqual(output.warnings, []);
    assert.equal(output.requiresAuthority.length, 1);
    assert.equal(output.requiresAuthority[0].reason, "pr-state-not-read-in-local-backfill");
    assert.equal(output.chatFallbackUsed, false);
  } finally {
    fixture.cleanup();
  }
});

test("reader rejects unsafe lane ids without creating files", () => {
  const fixture = createGitFixture();
  const stateRoot = join(fixture.root, "state");
  try {
    assert.throws(
      () => readLaneChurnEvents({ laneId: "../bad-lane" }, {
        repoRoot: fixture.repo,
        cwd: fixture.repo,
        stateRoot,
      }),
      /Lane id is not safe/,
    );
    assert.equal(existsSync(stateRoot), false);
  } finally {
    fixture.cleanup();
  }
});

function validEvent(overrides = {}) {
  return {
    laneId: "lane-123",
    phase: "verification",
    failureClass: "sandbox",
    signature: ".git/worktrees read-only filesystem boundary",
    attemptedCommand: "pnpm run check:static",
    evidenceSummary: "Workspace verification hit a .git/worktrees read-only filesystem boundary.",
    wrongRetryPattern: "retrying inside sandbox",
    nextSafeAction: "request outside-sandbox rerun",
    createdAt: "2026-06-22T12:00:00Z",
    ...overrides,
  };
}

function createGitFixture() {
  const root = mkdtempSync(join(tmpdir(), "anti-churn-event-reader-"));
  const repo = join(root, "repo");
  mkdirSync(repo);
  runGit(repo, ["init", "-q"]);
  runGit(repo, ["config", "user.email", "anti-churn-reader-test@example.com"]);
  runGit(repo, ["config", "user.name", "Anti Churn Reader Test"]);
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
