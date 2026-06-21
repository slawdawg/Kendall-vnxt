import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const scriptPath = join(rootDir, "scripts", "codex-workspace.mjs");
const stateRoot = mkdtempSync(join(tmpdir(), "codex-workspace-test-"));

try {
  test("doctor accepts an empty state root", () => {
    const result = run(["doctor", "--state-root", stateRoot]);
    assert(result.code === 0, result.stderr || result.stdout);
  });

  test("list reports no workspaces for an empty state root", () => {
    const result = run(["list", "--state-root", stateRoot]);
    assert(result.code === 0, result.stderr || result.stdout);
    assert(result.stdout.includes("No Codex workspaces found"), result.stdout || result.stderr);
  });

  test("start dry-run plans fetch, worktree creation, and manifest write", () => {
    const result = run(["start", "test task", "--dry-run", "--owner", "runner-a", "--state-root", stateRoot]);
    assert(result.code === 0, result.stderr || result.stdout);
    assert(result.stdout.includes("git fetch origin main"), result.stdout || result.stderr);
    assert(result.stdout.includes("git worktree add -b codex/test-task"), result.stdout || result.stderr);
    assert(result.stdout.includes("write "), result.stdout || result.stderr);
    assert(result.stdout.includes("Owner: runner-a"), result.stdout || result.stderr);
  });

  test("help lists local codex branch cleanup", () => {
    const result = run(["--help"]);
    assert(result.code === 0, result.stderr || result.stdout);
    assert(result.stdout.includes("cleanup-branches [query]"), result.stdout || result.stderr);
    assert(result.stdout.includes("--base <ref>"), result.stdout || result.stderr);
  });

  test("start refuses protected branch override", () => {
    const result = run(["start", "bad task", "--branch", "main", "--dry-run", "--state-root", stateRoot]);
    assert(result.code !== 0, "protected branch override unexpectedly passed");
    assert(result.stderr.includes("Refusing to operate on protected branch"));
  });

  test("start validates mode", () => {
    const result = run(["start", "bad mode", "--mode", "scratch", "--dry-run", "--state-root", stateRoot]);
    assert(result.code !== 0, "invalid mode unexpectedly passed");
    assert(result.stderr.includes("--mode must be either pr or experiment"));
  });

  test("start rejects path traversal task ids", () => {
    const result = run(["start", "bad id", "--task-id", "..\\bad", "--dry-run", "--state-root", stateRoot]);
    assert(result.code !== 0, "path traversal task id unexpectedly passed");
    assert(result.stderr.includes("Invalid task id"));
  });

  test("rebuild task id selection leaves lock rejection to the lock helper", () => {
    const source = readFileSync(scriptPath, "utf8");
    const match = source.match(/function uniqueTaskId[\s\S]*?function assertCurrentBranch/);
    assert(match, "uniqueTaskId source not found");
    assert(!match[0].includes(".lock"), "uniqueTaskId must not skip ids only because a transient lock exists");
    assert(source.includes("function withManifestLock"), "manifest lock helper not found");
  });

  test("rebuild-index skips worktrees that already have manifests", () => {
    const source = readFileSync(scriptPath, "utf8");
    const match = source.match(/function rebuildIndex[\s\S]*?function doctor/);
    assert(match, "rebuildIndex source not found");
    assert(match[0].includes("existingManifests"), "rebuildIndex must inspect existing manifests");
    assert(match[0].includes("samePath(manifest.worktree_path, record.path)"), "rebuildIndex must skip already indexed worktrees");
  });

  test("run uses shared workspace command resolution", () => {
    const source = readFileSync(scriptPath, "utf8");
    const match = source.match(/function run\(commandName[\s\S]*?function samePath/);
    assert(match, "run source not found");
    assert(source.includes("resolveWorkspaceCommand"), "codex-workspace must import shared command resolver");
    assert(match[0].includes("const resolved = resolveWorkspaceCommand(commandName, commandArguments);"), "run must resolve workspace commands");
    assert(match[0].includes("env: resolved.env ?? process.env"), "run must pass resolved command environment");
  });

  test("cleanup-branches compares patch equivalence before local deletion", () => {
    const source = readFileSync(scriptPath, "utf8");
    const match = source.match(/function cleanupBranches[\s\S]*?function rebuildIndex/);
    assert(match, "cleanupBranches source not found");
    assert(match[0].includes("branchCleanupSafety"), "cleanup-branches must use safety classification");
    assert(match[0].includes("activeWorktreeBranches.has(branch)"), "cleanup-branches must skip checked-out branches");
    assert(source.includes('git(["cherry", baseRef, branch]'), "branch cleanup must use git cherry patch-equivalence");
    assert(source.includes('["branch", "-D", branch]'), "branch cleanup must use explicit local branch deletion after safety checks");
  });

  test("cleanup-branches is dry-run by default", () => {
    const source = readFileSync(scriptPath, "utf8");
    const match = source.match(/function cleanupBranches[\s\S]*?function rebuildIndex/);
    assert(match, "cleanupBranches source not found");
    assert(match[0].includes("options.dryRun || !apply"), "cleanup-branches must require --apply for deletion");
    assert(match[0].includes("Add --apply to delete the safe local branches."), "cleanup-branches must guide explicit apply");
  });

  test("cleanup-branches dry-run and apply only safe inactive branches", () => {
    const fixture = createBranchCleanupFixture();
    try {
      const dryRun = runFixtureScript(fixture, ["cleanup-branches", "--base", "origin/main"]);
      assert(dryRun.code === 0, dryRun.stderr || dryRun.stdout);
      assert(dryRun.stdout.includes("Base: origin/main"), dryRun.stdout || dryRun.stderr);
      assert(dryRun.stdout.includes("delete local branch codex/merged"), dryRun.stdout || dryRun.stderr);
      assert(dryRun.stdout.includes("delete local branch codex/equivalent"), dryRun.stdout || dryRun.stderr);
      assert(dryRun.stdout.includes("SKIP codex/diverged: 1 commit(s) not present"), dryRun.stdout || dryRun.stderr);
      assert(dryRun.stdout.includes("SKIP codex/similar: 1 commit(s) not present"), dryRun.stdout || dryRun.stderr);
      assert(dryRun.stdout.includes("SKIP codex/active: branch is checked out in a worktree"), dryRun.stdout || dryRun.stderr);
      for (const branch of ["codex/merged", "codex/equivalent", "codex/diverged", "codex/similar", "codex/active"]) {
        assert(branchExists(fixture.root, branch), `${branch} was deleted during dry-run`);
      }

      const apply = runFixtureScript(fixture, ["cleanup-branches", "--base", "origin/main", "--apply"]);
      assert(apply.code === 0, apply.stderr || apply.stdout);
      assert(apply.stdout.includes("Deleted 2 safe local codex/* branch(es)."), apply.stdout || apply.stderr);
      assert(!branchExists(fixture.root, "codex/merged"), "merged branch was not deleted");
      assert(!branchExists(fixture.root, "codex/equivalent"), "patch-equivalent branch was not deleted");
      assert(branchExists(fixture.root, "codex/diverged"), "diverged branch was deleted");
      assert(branchExists(fixture.root, "codex/similar"), "similar non-equivalent branch was deleted");
      assert(branchExists(fixture.root, "codex/active"), "active worktree branch was deleted");
    } finally {
      cleanupBranchCleanupFixture(fixture);
    }
  });

  test("cleanup-branches fails closed when the base ref is missing", () => {
    const fixture = createBranchCleanupFixture();
    try {
      const result = runFixtureScript(fixture, ["cleanup-branches", "--base", "origin/missing", "--apply"]);
      assert(result.code !== 0, "missing base ref unexpectedly passed");
      assert(result.stderr.includes("Base ref not found locally: origin/missing"), result.stderr || result.stdout);
      for (const branch of ["codex/merged", "codex/equivalent", "codex/diverged", "codex/similar", "codex/active"]) {
        assert(branchExists(fixture.root, branch), `${branch} was deleted after missing base ref`);
      }
    } finally {
      cleanupBranchCleanupFixture(fixture);
    }
  });

  test("list skips malformed manifests without aborting", () => {
    const tasksDir = join(stateRoot, "tasks");
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(join(tasksDir, "bad.json"), "{not json");
    const result = run(["list", "--state-root", stateRoot]);
    assert(result.code === 0, result.stderr || result.stdout);
    assert(result.stderr.includes("skipping invalid manifest"));
  });

  test("list surfaces lane owner from manifests", () => {
    const tasksDir = join(stateRoot, "tasks");
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(
      join(tasksDir, "owned-lane.json"),
      `${JSON.stringify({
        task_id: "owned-lane",
        branch: "codex/owned-lane",
        worktree_path: rootDir,
        base_branch: "main",
        status: "active",
        owner: "runner-a",
      })}\n`,
    );
    const result = run(["list", "owned-lane", "--state-root", stateRoot]);
    assert(result.code === 0, result.stderr || result.stdout);
    assert(result.stdout.includes("owner=runner-a"), result.stdout || result.stderr);
  });

  test("finish-pr rejects unknown verification profile before mutation", () => {
    const tasksDir = join(stateRoot, "tasks");
    const worktreePath = rootDir;
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(
      join(tasksDir, "verify-profile.json"),
      `${JSON.stringify({
        task_id: "verify-profile",
        branch: "codex/new-work",
        worktree_path: worktreePath,
        base_branch: "main",
        status: "active",
        mode: "pr",
      })}\n`,
    );
    const result = run(["finish-pr", "verify-profile", "--verify", "anything", "--dry-run", "--state-root", stateRoot]);
    assert(result.code !== 0, "unknown verification profile unexpectedly passed");
    assert(result.stderr.includes("Unknown verification profile"));
  });

  test("finish-pr refuses lanes owned by another runner before mutation", () => {
    const tasksDir = join(stateRoot, "tasks");
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(
      join(tasksDir, "owned-finish.json"),
      `${JSON.stringify({
        task_id: "owned-finish",
        branch: "codex/owned-finish",
        worktree_path: rootDir,
        base_branch: "main",
        status: "active",
        mode: "pr",
        owner: "runner-a",
      })}\n`,
    );
    const result = run([
      "finish-pr",
      "owned-finish",
      "--no-verify",
      "--owner",
      "runner-b",
      "--state-root",
      stateRoot,
    ]);
    assert(result.code !== 0, "mismatched owner unexpectedly passed");
    assert(result.stderr.includes("owned by runner-a"), result.stderr || result.stdout);
    assert(result.stderr.includes("--take-ownership"), result.stderr || result.stdout);
  });

  test("cleanup-orphans lists orphan directories without deleting by default", () => {
    const orphanPath = join(stateRoot, "worktrees", "orphan-story");
    mkdirSync(join(orphanPath, "services", "supervisor", ".pytest_cache"), { recursive: true });

    const result = run(["cleanup-orphans", "--state-root", stateRoot]);

    assert(result.code === 0, result.stderr || result.stdout);
    assert(result.stdout.includes("orphan directory:"));
    assert(result.stdout.includes("Pass a query to target one orphan"));
    assert(existsSync(orphanPath), "cleanup-orphans unexpectedly deleted without --apply");
  });

  test("cleanup-orphans removes targeted orphan directory when applied", () => {
    const orphanPath = join(stateRoot, "worktrees", "remove-this-orphan");
    mkdirSync(join(orphanPath, "services", "supervisor", ".pytest_cache"), { recursive: true });
    writeFileSync(join(orphanPath, "services", "supervisor", ".pytest_cache", "README.md"), "cache\n");

    const result = run(["cleanup-orphans", "remove-this", "--apply", "--state-root", stateRoot]);

    assert(result.code === 0, result.stderr || result.stdout);
    assert(result.stdout.includes("Removed orphan directory"));
    assert(!existsSync(orphanPath), "cleanup-orphans did not remove targeted orphan directory");
  });
} finally {
  rmSync(stateRoot, { recursive: true, force: true });
}

function run(args) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function createBranchCleanupFixture() {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "codex-branch-cleanup-"));
  const fixtureScript = join(fixtureRoot, "scripts", "codex-workspace.mjs");
  const fixtureLib = join(fixtureRoot, "scripts", "lib", "workspace-command-resolution.mjs");
  const activeWorktree = `${fixtureRoot}-active`;
  mkdirSync(join(fixtureRoot, "scripts", "lib"), { recursive: true });
  writeFileSync(fixtureScript, readFileSync(scriptPath, "utf8"));
  writeFileSync(
    fixtureLib,
    readFileSync(join(rootDir, "scripts", "lib", "workspace-command-resolution.mjs"), "utf8"),
  );

  runGit(fixtureRoot, ["init", "-q"]);
  runGit(fixtureRoot, ["config", "user.email", "codex-workspace-test@example.com"]);
  runGit(fixtureRoot, ["config", "user.name", "Codex Workspace Test"]);
  commitFile(fixtureRoot, "base.txt", "base\n", "base");
  runGit(fixtureRoot, ["branch", "-M", "main"]);
  const baseCommit = runGit(fixtureRoot, ["rev-parse", "HEAD"]).stdout;

  commitFile(fixtureRoot, "equivalent.txt", "same patch\n", "main equivalent patch");
  runGit(fixtureRoot, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  runGit(fixtureRoot, ["branch", "codex/merged", "HEAD"]);

  runGit(fixtureRoot, ["switch", "-q", "-c", "codex/equivalent", baseCommit]);
  commitFile(fixtureRoot, "equivalent.txt", "same patch\n", "branch equivalent patch");

  runGit(fixtureRoot, ["switch", "-q", "-c", "codex/diverged", "origin/main"]);
  commitFile(fixtureRoot, "diverged.txt", "unique local work\n", "diverged work");

  runGit(fixtureRoot, ["switch", "-q", "-c", "codex/similar", "origin/main"]);
  commitFile(fixtureRoot, "equivalent.txt", "similar but not equivalent\n", "similar non-equivalent work");

  runGit(fixtureRoot, ["switch", "-q", "main"]);
  runGit(fixtureRoot, ["branch", "codex/active", "origin/main"]);
  runGit(fixtureRoot, ["worktree", "add", "-q", activeWorktree, "codex/active"]);

  return { root: fixtureRoot, script: fixtureScript, activeWorktree };
}

function cleanupBranchCleanupFixture(fixture) {
  if (!fixture) {
    return;
  }
  spawnSync("git", ["worktree", "remove", "--force", fixture.activeWorktree], {
    cwd: fixture.root,
    encoding: "utf8",
    stdio: "pipe",
  });
  rmSync(fixture.activeWorktree, { recursive: true, force: true });
  rmSync(fixture.root, { recursive: true, force: true });
}

function runFixtureScript(fixture, args) {
  const result = spawnSync(process.execPath, [fixture.script, ...args], {
    cwd: fixture.root,
    encoding: "utf8",
    stdio: "pipe",
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || result.error?.message || "",
  };
}

function runGit(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
  assert((result.status ?? 1) === 0, result.stderr || result.stdout || `git ${args.join(" ")} failed`);
  return {
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

function commitFile(cwd, path, content, message) {
  writeFileSync(join(cwd, path), content);
  runGit(cwd, ["add", path]);
  runGit(cwd, ["commit", "-q", "-m", message]);
}

function branchExists(cwd, branch) {
  const result = spawnSync("git", ["rev-parse", "--verify", "--quiet", branch], {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
  return result.status === 0;
}

function test(name, fn) {
  fn();
  console.log(`OK: ${name}`);
}

function assert(condition, message = "assertion failed") {
  if (!condition) {
    throw new Error(message);
  }
}
