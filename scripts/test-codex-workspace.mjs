import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
    assert(result.stdout.includes("state root does not exist yet") || result.stdout.includes("state root exists"));
  });

  test("list reports no workspaces for an empty state root", () => {
    const result = run(["list", "--state-root", stateRoot]);
    assert(result.code === 0, result.stderr || result.stdout);
    assert(result.stdout.includes("No Codex workspaces found"));
  });

  test("start dry-run plans fetch, worktree creation, and manifest write", () => {
    const result = run(["start", "test task", "--dry-run", "--state-root", stateRoot]);
    assert(result.code === 0, result.stderr || result.stdout);
    assert(result.stdout.includes("git fetch origin main"));
    assert(result.stdout.includes("git worktree add -b codex/test-task"));
    assert(result.stdout.includes("write "));
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

  test("list skips malformed manifests without aborting", () => {
    const tasksDir = join(stateRoot, "tasks");
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(join(tasksDir, "bad.json"), "{not json");
    const result = run(["list", "--state-root", stateRoot]);
    assert(result.code === 0, result.stderr || result.stdout);
    assert(result.stderr.includes("skipping invalid manifest"));
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

function test(name, fn) {
  fn();
  console.log(`OK: ${name}`);
}

function assert(condition, message = "assertion failed") {
  if (!condition) {
    throw new Error(message);
  }
}
