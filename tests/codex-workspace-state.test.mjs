import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  WorkspaceStateStorageError,
  assertLocalWorkspaceStoragePath,
  assertWorkspaceStateStorage,
  workspaceKey,
  workspaceState,
} from "../scripts/lib/codex-workspace-state.mjs";

test("workspace state uses the same GitHub repo key and directory shape as codex-workspace", () => {
  const fixture = createGitFixture();
  const home = join(fixture.root, "home");
  mkdirSync(home);
  try {
    runGit(fixture.repo, ["remote", "add", "origin", "git@github.com:Slaw-Dawg/Kendall_Nxt.git"]);

    const key = workspaceKey({ repoRoot: fixture.repo, cwd: fixture.repo });
    const state = workspaceState({}, {
      repoRoot: fixture.repo,
      cwd: fixture.repo,
      env: { HOME: home },
    });

    assert.equal(key, "slaw-dawg-kendall-nxt");
    assert.equal(state.root, resolve(join(home, ".codex-workspaces", "slaw-dawg-kendall-nxt")));
    assert.equal(state.assignmentsDir, join(state.root, "assignments"));
    assert.equal(state.tasksDir, join(state.root, "tasks"));
    assert.equal(state.worktreesDir, join(state.root, "worktrees"));
  } finally {
    fixture.cleanup();
  }
});

test("workspace state preserves explicit state root override", () => {
  const fixture = createGitFixture();
  try {
    const overrideRoot = join(fixture.root, "override-state");
    const state = workspaceState({ stateRoot: overrideRoot }, {
      repoRoot: fixture.repo,
      cwd: fixture.repo,
      env: { HOME: join(fixture.root, "home") },
    });

    assert.equal(state.root, resolve(overrideRoot));
    assert.equal(state.tasksDir, join(resolve(overrideRoot), "tasks"));
  } finally {
    fixture.cleanup();
  }
});

test("storage proof accepts paths outside tracked source", () => {
  const fixture = createGitFixture();
  try {
    const outsideState = join(fixture.root, "runtime-state");
    const proof = assertLocalWorkspaceStoragePath(outsideState, {
      repoRoot: fixture.repo,
      cwd: fixture.repo,
    });

    assert.equal(proof.path, resolve(outsideState));
    assert.equal(proof.outsideTrackedSource, true);
    assert.equal(proof.gitIgnored, false);
    assert.equal(proof.proof, "outside-tracked-source");
  } finally {
    fixture.cleanup();
  }
});

test("workspace state storage proof validates the resolver-selected default path", () => {
  const fixture = createGitFixture();
  const home = join(fixture.root, "home");
  mkdirSync(home);
  try {
    runGit(fixture.repo, ["remote", "add", "origin", "git@github.com:Slaw-Dawg/Kendall_Nxt.git"]);

    const { state, proof } = assertWorkspaceStateStorage({}, {
      repoRoot: fixture.repo,
      cwd: fixture.repo,
      env: { HOME: home },
    });

    assert.equal(state.root, resolve(join(home, ".codex-workspaces", "slaw-dawg-kendall-nxt")));
    assert.equal(proof.path, state.root);
    assert.equal(proof.outsideTrackedSource, true);
    assert.equal(proof.proof, "outside-tracked-source");
  } finally {
    fixture.cleanup();
  }
});

test("workspace state storage proof validates explicit ignored state root overrides", () => {
  const fixture = createGitFixture();
  try {
    writeFileSync(join(fixture.repo, ".gitignore"), ".codex-workspaces/\n");
    runGit(fixture.repo, ["add", ".gitignore"]);
    runGit(fixture.repo, ["commit", "-q", "-m", "ignore state"]);

    const { state, proof } = assertWorkspaceStateStorage(
      { stateRoot: join(fixture.repo, ".codex-workspaces", "fixture") },
      {
        repoRoot: fixture.repo,
        cwd: join(fixture.repo, "subdir"),
      },
    );

    assert.equal(proof.path, state.root);
    assert.equal(proof.outsideTrackedSource, false);
    assert.equal(proof.gitIgnored, true);
    assert.equal(proof.proof, "git-check-ignore");
  } finally {
    fixture.cleanup();
  }
});

test("storage proof accepts git-ignored paths inside the repo", () => {
  const fixture = createGitFixture();
  try {
    writeFileSync(join(fixture.repo, ".gitignore"), ".codex-workspaces/\n");
    runGit(fixture.repo, ["add", ".gitignore"]);
    runGit(fixture.repo, ["commit", "-q", "-m", "ignore state"]);

    const ignoredState = join(fixture.repo, ".codex-workspaces", "fixture");
    const proof = assertLocalWorkspaceStoragePath(ignoredState, {
      repoRoot: fixture.repo,
      cwd: fixture.repo,
    });

    assert.equal(proof.path, resolve(ignoredState));
    assert.equal(proof.outsideTrackedSource, false);
    assert.equal(proof.gitIgnored, true);
  } finally {
    fixture.cleanup();
  }
});

test("storage proof checks ignored paths relative to repo root even when cwd is a subdirectory", () => {
  const fixture = createGitFixture();
  try {
    const subdir = join(fixture.repo, "subdir");
    mkdirSync(subdir);
    writeFileSync(join(fixture.repo, ".gitignore"), ".codex-workspaces/\n");
    runGit(fixture.repo, ["add", ".gitignore"]);
    runGit(fixture.repo, ["commit", "-q", "-m", "ignore state"]);

    const proof = assertLocalWorkspaceStoragePath(join(fixture.repo, ".codex-workspaces", "fixture"), {
      repoRoot: fixture.repo,
      cwd: subdir,
    });

    assert.equal(proof.outsideTrackedSource, false);
    assert.equal(proof.gitIgnored, true);
    assert.equal(proof.proof, "git-check-ignore");
  } finally {
    fixture.cleanup();
  }
});

test("storage proof fails closed for unignored source paths without creating files", () => {
  const fixture = createGitFixture();
  try {
    const unsafeStore = join(fixture.repo, "churn-events", "lane.jsonl");

    assert.throws(
      () => assertLocalWorkspaceStoragePath(unsafeStore, {
        repoRoot: fixture.repo,
        cwd: fixture.repo,
      }),
      (error) => error instanceof WorkspaceStateStorageError && error.code === "UNSAFE_WORKSPACE_STORAGE_PATH",
    );
    assert.equal(existsSync(unsafeStore), false);
  } finally {
    fixture.cleanup();
  }
});

test("workspace state storage proof fails closed for unsafe explicit overrides", () => {
  const fixture = createGitFixture();
  try {
    const unsafeStore = join(fixture.repo, "churn-events");

    assert.throws(
      () => assertWorkspaceStateStorage({ stateRoot: unsafeStore }, {
        repoRoot: fixture.repo,
        cwd: fixture.repo,
      }),
      (error) => error instanceof WorkspaceStateStorageError && error.code === "UNSAFE_WORKSPACE_STORAGE_PATH",
    );
    assert.equal(existsSync(unsafeStore), false);
  } finally {
    fixture.cleanup();
  }
});

test("storage proof fails closed when an outside-looking path resolves into unignored source", () => {
  const fixture = createGitFixture();
  try {
    const link = join(fixture.root, "state-link");
    symlinkSync(fixture.repo, link, "dir");

    assert.throws(
      () => assertLocalWorkspaceStoragePath(join(link, "churn-events"), {
        repoRoot: fixture.repo,
        cwd: fixture.repo,
      }),
      (error) => error instanceof WorkspaceStateStorageError && error.code === "UNSAFE_WORKSPACE_STORAGE_PATH",
    );
  } finally {
    fixture.cleanup();
  }
});

test("storage proof fails closed when no path is provided", () => {
  assert.throws(
    () => assertLocalWorkspaceStoragePath(""),
    (error) => error instanceof WorkspaceStateStorageError && error.code === "MISSING_WORKSPACE_STORAGE_PATH",
  );
});

function createGitFixture() {
  const root = mkdtempSync(join(tmpdir(), "codex-workspace-state-"));
  const repo = join(root, "repo");
  mkdirSync(repo);
  runGit(repo, ["init", "-q"]);
  runGit(repo, ["config", "user.email", "codex-workspace-state-test@example.com"]);
  runGit(repo, ["config", "user.name", "Codex Workspace State Test"]);
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
