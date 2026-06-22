import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
    assert(result.stdout.includes("assignment-report"), result.stdout || result.stderr);
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

  test("assignment-report classifies safe backlog and workspace ownership without mutation", () => {
    const tasksDir = join(stateRoot, "tasks");
    mkdirSync(tasksDir, { recursive: true });
    const now = new Date().toISOString();
    const stale = new Date(Date.now() - 60_000).toISOString();
    const manifests = {
      "unowned-active": {
        task_id: "unowned-active",
        branch: "codex/unowned-active",
        worktree_path: rootDir,
        base_branch: "main",
        status: "active",
      },
      "current-active": {
        task_id: "current-active",
        branch: "codex/current-active",
        worktree_path: rootDir,
        base_branch: "main",
        status: "active",
        owner: "runner-a",
        owner_updated_at: now,
      },
      "other-active": {
        task_id: "other-active",
        branch: "codex/other-active",
        worktree_path: rootDir,
        base_branch: "main",
        status: "active",
        owner: "runner-b",
        owner_updated_at: now,
      },
      "stale-active": {
        task_id: "stale-active",
        branch: "codex/stale-active",
        worktree_path: rootDir,
        base_branch: "main",
        status: "active",
        owner: "runner-b",
        owner_updated_at: stale,
      },
      "closed-lane": {
        task_id: "closed-lane",
        branch: "codex/closed-lane",
        worktree_path: rootDir,
        base_branch: "main",
        status: "closed",
        owner: "runner-b",
        owner_updated_at: stale,
      },
    };
    for (const [name, manifest] of Object.entries(manifests)) {
      writeFileSync(join(tasksDir, `${name}.json`), `${JSON.stringify(manifest, null, 2)}\n`);
    }

    const before = readFileSync(join(tasksDir, "stale-active.json"), "utf8");
    const result = run([
      "assignment-report",
      "--owner",
      "runner-a",
      "--stale-after-seconds",
      "1",
      "--state-root",
      stateRoot,
    ]);
    const after = readFileSync(join(tasksDir, "stale-active.json"), "utf8");

    assert(result.code === 0, result.stderr || result.stdout);
    assert(result.stdout.includes("Assignment Report"), result.stdout || result.stderr);
    assert(result.stdout.includes("Safe backlog candidates:"), result.stdout || result.stderr);
    assert(result.stdout.includes("- safe-backlog-report-alignment | assignable"), result.stdout || result.stderr);
    assert(result.stdout.includes("- authority-blocked-work | blocked_authority"), result.stdout || result.stderr);
    assert(result.stdout.includes("- unowned-active | assignable"), result.stdout || result.stderr);
    assert(result.stdout.includes("- current-active | active"), result.stdout || result.stderr);
    assert(result.stdout.includes("- other-active | blocked_owned_active"), result.stdout || result.stderr);
    assert(result.stdout.includes("- stale-active | blocked_stale_owner_needs_takeover"), result.stdout || result.stderr);
    assert(result.stdout.includes("- closed-lane | closed"), result.stdout || result.stderr);
    assert(before === after, "assignment-report mutated a workspace manifest");
  });

  test("claim-next dry-run previews the next safe backlog lane without mutation", () => {
    const tasksDir = join(stateRoot, "tasks");
    mkdirSync(tasksDir, { recursive: true });
    const before = taskSnapshot(tasksDir);

    const result = run(["claim-next", "--dry-run", "--owner", "runner-a", "--state-root", stateRoot]);
    const after = taskSnapshot(tasksDir);

    assert(result.code === 0, result.stderr || result.stdout);
    assert(result.stdout.includes("DRY RUN: claim-next"), result.stdout || result.stderr);
    assert(result.stdout.includes("claim candidate safe-backlog-report-alignment"), result.stdout || result.stderr);
    assert(result.stdout.includes("branch codex/safe-backlog-report-alignment"), result.stdout || result.stderr);
    assert(
      result.stdout.includes('start command node ./scripts/codex-workspace.mjs start "safe backlog report alignment"'),
      result.stdout || result.stderr,
    );
    assert(result.stdout.includes("preview only; no manifest, branch, PR, or worktree mutation"), result.stdout || result.stderr);
    assert(result.stdout.includes("- authority-blocked-work | blocked_authority"), result.stdout || result.stderr);
    assert(before === after, "claim-next --dry-run mutated workspace manifests");
  });

  test("claim-next apply writes assignment metadata without creating a workspace", () => {
    const claimStateRoot = mkdtempSync(join(tmpdir(), "codex-claim-next-apply-"));
    try {
      const branch = "codex/safe-backlog-report-alignment";
      const branchBefore = branchExists(rootDir, branch);

      const result = run(["claim-next", "--apply", "--owner", "runner-a", "--state-root", claimStateRoot]);

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("APPLY: claim-next"), result.stdout || result.stderr);
      assert(result.stdout.includes("claimed ready lane safe-backlog-report-alignment for runner-a"), result.stdout || result.stderr);
      assert(
        result.stdout.includes("assignment metadata only; no branch, PR, worktree, worker, or implementation mutation"),
        result.stdout || result.stderr,
      );
      assert(branchExists(rootDir, branch) === branchBefore, "claim-next --apply changed branch state");
      assert(!existsSync(join(claimStateRoot, "tasks")), "claim-next --apply created workspace task manifests");
      assert(!existsSync(join(claimStateRoot, "worktrees")), "claim-next --apply created worktrees");

      const assignmentPath = join(claimStateRoot, "assignments", "safe-backlog-report-alignment.json");
      assert(existsSync(assignmentPath), "claim-next --apply did not write assignment metadata");
      const assignment = JSON.parse(readFileSync(assignmentPath, "utf8"));
      assert(assignment.assignment_id === "safe-backlog-report-alignment", "assignment id mismatch");
      assert(assignment.task_id === "safe-backlog-report-alignment", "assignment task id mismatch");
      assert(assignment.status === "claimed", "assignment status mismatch");
      assert(assignment.owner === "runner-a", "assignment owner mismatch");
      assert(assignment.branch === branch, "assignment branch mismatch");
      assert(Array.isArray(assignment.stop_lines) && assignment.stop_lines.length > 0, "stop lines missing");
      assert(assignment.events.some((event) => event.type === "claimed"), "claimed event missing");
    } finally {
      rmSync(claimStateRoot, { recursive: true, force: true });
    }
  });

  test("claim-next apply is idempotent for the current owner", () => {
    const claimStateRoot = mkdtempSync(join(tmpdir(), "codex-claim-next-idempotent-"));
    try {
      const first = run(["claim-next", "--apply", "--owner", "runner-a", "--state-root", claimStateRoot]);
      assert(first.code === 0, first.stderr || first.stdout);
      const second = run(["claim-next", "--apply", "--owner", "runner-a", "--state-root", claimStateRoot]);
      assert(second.code === 0, second.stderr || second.stdout);
      assert(second.stdout.includes("refresh existing assignment safe-backlog-report-alignment"), second.stdout || second.stderr);

      const assignmentsDir = join(claimStateRoot, "assignments");
      const assignmentFiles = readdirSync(assignmentsDir).filter((name) => name.endsWith(".json"));
      assert(assignmentFiles.length === 1, `expected one assignment file, saw ${assignmentFiles.join(", ")}`);
      const assignment = JSON.parse(
        readFileSync(join(assignmentsDir, "safe-backlog-report-alignment.json"), "utf8"),
      );
      assert(assignment.owner === "runner-a", "assignment owner changed during idempotent apply");
      assert(
        assignment.events.filter((event) => event.type === "claimed" || event.type === "claim_refreshed").length === 2,
        "idempotent apply should append refresh evidence without duplicating assignments",
      );
    } finally {
      rmSync(claimStateRoot, { recursive: true, force: true });
    }
  });

  test("assignment-report surfaces claimed lane assignment metadata", () => {
    const claimStateRoot = mkdtempSync(join(tmpdir(), "codex-assignment-report-claimed-"));
    try {
      const claim = run(["claim-next", "--apply", "--owner", "runner-a", "--state-root", claimStateRoot]);
      assert(claim.code === 0, claim.stderr || claim.stdout);

      const report = run(["assignment-report", "--owner", "runner-a", "--state-root", claimStateRoot]);

      assert(report.code === 0, report.stderr || report.stdout);
      assert(report.stdout.includes("- safe-backlog-report-alignment | claimed"), report.stdout || report.stderr);
      assert(
        report.stdout.includes(
          "- safe-backlog-report-alignment | claimed | owner=runner-a | branch=codex/safe-backlog-report-alignment",
        ),
        report.stdout || report.stderr,
      );
      assert(report.stdout.includes("reason=assignment is owned by current runner"), report.stdout || report.stderr);
    } finally {
      rmSync(claimStateRoot, { recursive: true, force: true });
    }
  });

  test("claim-next apply blocks a lane assigned to another owner", () => {
    const claimStateRoot = mkdtempSync(join(tmpdir(), "codex-claim-next-owned-assignment-"));
    try {
      const first = run(["claim-next", "--apply", "--owner", "runner-b", "--state-root", claimStateRoot]);
      assert(first.code === 0, first.stderr || first.stdout);
      const assignmentPath = join(claimStateRoot, "assignments", "safe-backlog-report-alignment.json");
      const before = readFileSync(assignmentPath, "utf8");

      const second = run(["claim-next", "--apply", "--owner", "runner-a", "--state-root", claimStateRoot]);
      const after = readFileSync(assignmentPath, "utf8");

      assert(second.code !== 0, "claim-next --apply unexpectedly claimed another owner's assignment");
      assert(second.stdout.includes("- safe-backlog-report-alignment | blocked_owned_active"), second.stdout || second.stderr);
      assert(second.stderr.includes("No claimable safe backlog lane found"), second.stderr || second.stdout);
      assert(before === after, "blocked claim-next --apply mutated another owner's assignment");
    } finally {
      rmSync(claimStateRoot, { recursive: true, force: true });
    }
  });

  test("claim-next dry-run can preview an existing unowned active workspace claim", () => {
    const claimStateRoot = mkdtempSync(join(tmpdir(), "codex-claim-next-unowned-"));
    try {
      const tasksDir = join(claimStateRoot, "tasks");
      mkdirSync(tasksDir, { recursive: true });
      const manifestPath = join(tasksDir, "unowned-safe-backlog.json");
      writeFileSync(
        manifestPath,
        `${JSON.stringify(
          {
            task_id: "unowned-safe-backlog",
            branch: "codex/safe-backlog-report-alignment",
            worktree_path: rootDir,
            base_branch: "main",
            status: "active",
          },
          null,
          2,
        )}\n`,
      );
      const before = readFileSync(manifestPath, "utf8");

      const result = run(["claim-next", "--dry-run", "--owner", "runner-a", "--state-root", claimStateRoot]);
      const after = readFileSync(manifestPath, "utf8");

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("claim existing unowned workspace unowned-safe-backlog"), result.stdout || result.stderr);
      assert(result.stdout.includes("preview only; no manifest, branch, PR, or worktree mutation"), result.stdout || result.stderr);
      assert(before === after, "claim-next --dry-run mutated the unowned lane manifest");
    } finally {
      rmSync(claimStateRoot, { recursive: true, force: true });
    }
  });

  test("claim-next apply claims an existing unowned active workspace manifest", () => {
    const claimStateRoot = mkdtempSync(join(tmpdir(), "codex-claim-next-unowned-apply-"));
    try {
      const tasksDir = join(claimStateRoot, "tasks");
      mkdirSync(tasksDir, { recursive: true });
      const manifestPath = join(tasksDir, "unowned-safe-backlog.json");
      writeFileSync(
        manifestPath,
        `${JSON.stringify(
          {
            task_id: "unowned-safe-backlog",
            branch: "codex/safe-backlog-report-alignment",
            worktree_path: rootDir,
            base_branch: "main",
            status: "active",
          },
          null,
          2,
        )}\n`,
      );

      const result = run(["claim-next", "--apply", "--owner", "runner-a", "--state-root", claimStateRoot]);

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("claimed existing unowned workspace unowned-safe-backlog"), result.stdout || result.stderr);
      assert(!existsSync(join(claimStateRoot, "assignments")), "manifest claim should not create assignment metadata");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      assert(manifest.owner === "runner-a", "claim-next --apply did not claim the unowned manifest");
      assert(Object.hasOwn(manifest, "owner_thread_id"), "owner thread id evidence missing");
      assert(Array.isArray(manifest.ownership_takeovers), "ownership takeover evidence missing");
      assert(manifest.events.some((event) => event.type === "ownership_claimed"), "ownership event missing");
    } finally {
      rmSync(claimStateRoot, { recursive: true, force: true });
    }
  });

  test("claim-next dry-run blocks an active lane owned by another runner", () => {
    const tasksDir = join(stateRoot, "tasks");
    mkdirSync(tasksDir, { recursive: true });
    const manifestPath = join(tasksDir, "owned-safe-backlog.json");
    writeFileSync(
      manifestPath,
      `${JSON.stringify(
        {
          task_id: "owned-safe-backlog",
          branch: "codex/safe-backlog-report-alignment",
          worktree_path: rootDir,
          base_branch: "main",
          status: "active",
          owner: "runner-b",
          owner_updated_at: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
    );
    const before = readFileSync(manifestPath, "utf8");

    const result = run(["claim-next", "--dry-run", "--owner", "runner-a", "--state-root", stateRoot]);
    const after = readFileSync(manifestPath, "utf8");

    assert(result.code === 0, result.stderr || result.stdout);
    assert(result.stdout.includes("no claimable safe backlog lane found"), result.stdout || result.stderr);
    assert(result.stdout.includes("- safe-backlog-report-alignment | blocked_owned_active"), result.stdout || result.stderr);
    assert(result.stdout.includes("do not mutate without explicit takeover approval"), result.stdout || result.stderr);
    assert(before === after, "claim-next --dry-run mutated the owned lane manifest");
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

  test("take-ownership requires an explicit reason before mutation", () => {
    const tasksDir = join(stateRoot, "tasks");
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(
      join(tasksDir, "owned-takeover.json"),
      `${JSON.stringify({
        task_id: "owned-takeover",
        branch: "codex/owned-takeover",
        worktree_path: rootDir,
        base_branch: "main",
        status: "active",
        mode: "pr",
        owner: "runner-a",
      })}\n`,
    );
    const result = run([
      "finish-pr",
      "owned-takeover",
      "--no-verify",
      "--owner",
      "runner-b",
      "--take-ownership",
      "--state-root",
      stateRoot,
    ]);
    assert(result.code !== 0, "takeover without reason unexpectedly passed");
    assert(result.stderr.includes("--takeover-reason must explain"), result.stderr || result.stdout);
  });

  test("cleanup-merged can apply from inside the target worktree and delete remote branch", () => {
    const fixture = createMergedCleanupFixture();
    try {
      const result = runMergedCleanupFixtureScript(fixture, [
        "cleanup-current",
        "--apply",
        "--delete-remote",
        "--owner",
        "runner-a",
        "--state-root",
        fixture.stateRoot,
      ]);
      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("Closed cleanup-task"), result.stdout || result.stderr);
      assert(!existsSync(fixture.worktree), "cleanup did not remove target worktree");
      assert(!branchExists(fixture.root, fixture.branch), "cleanup did not delete local branch");
      assert(!remoteBranchExists(fixture.root, fixture.branch), "cleanup did not delete remote branch");
      const manifest = readJson(join(fixture.stateRoot, "tasks", "cleanup-task.json"));
      assert(manifest.status === "closed", `manifest status is ${manifest.status}`);
      assert(manifest.worktree_removed_at, "manifest missing worktree removal timestamp");
      assert(manifest.local_branch_deleted_at, "manifest missing local branch deletion timestamp");
      assert(manifest.remote_branch_deleted_at, "manifest missing remote branch deletion timestamp");
    } finally {
      cleanupMergedCleanupFixture(fixture);
    }
  });

  test("cleanup-merged resumes cleanup_partial after worktree removal", () => {
    const fixture = createMergedCleanupFixture();
    try {
      runGit(fixture.root, ["worktree", "remove", fixture.worktree]);
      const manifestPath = join(fixture.stateRoot, "tasks", "cleanup-task.json");
      const manifest = readJson(manifestPath);
      manifest.status = "cleanup_partial";
      manifest.cleanup_error = "simulated prior failure after worktree removal";
      manifest.worktree_removed_at = new Date().toISOString();
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      const result = runFixtureScript(
        fixture,
        ["cleanup-merged", "cleanup-task", "--apply", "--delete-remote", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { env: fixture.env },
      );
      assert(result.code === 0, result.stderr || result.stdout);
      assert(!branchExists(fixture.root, fixture.branch), "cleanup resume did not delete local branch");
      assert(!remoteBranchExists(fixture.root, fixture.branch), "cleanup resume did not delete remote branch");
      const updated = readJson(manifestPath);
      assert(updated.status === "closed", `manifest status is ${updated.status}`);
      assert(updated.cleanup_error === null, `cleanup_error not cleared: ${updated.cleanup_error}`);
    } finally {
      cleanupMergedCleanupFixture(fixture);
    }
  });

  test("cleanup-merged refuses branch deletion after branch head changes", () => {
    const fixture = createMergedCleanupFixture();
    try {
      runGit(fixture.worktree, ["switch", "-q", fixture.branch]);
      commitFile(fixture.worktree, "advanced.txt", "advanced\n", "advanced branch after pr");
      runGit(fixture.worktree, ["push", "-q", "origin", fixture.branch]);

      const result = runFixtureScript(
        fixture,
        ["cleanup-merged", "cleanup-task", "--apply", "--delete-remote", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { env: fixture.env },
      );
      assert(result.code !== 0, "advanced branch cleanup unexpectedly passed");
      assert(result.stderr.includes("does not match expected cleanup head"), result.stderr || result.stdout);
      assert(existsSync(fixture.worktree), "worktree was removed before branch-head refusal");
      assert(branchExists(fixture.root, fixture.branch), "local branch was deleted after head mismatch");
      assert(remoteBranchExists(fixture.root, fixture.branch), "remote branch was deleted after head mismatch");
      const manifest = readJson(join(fixture.stateRoot, "tasks", "cleanup-task.json"));
      assert(manifest.status === "cleanup_partial", `manifest status is ${manifest.status}`);
    } finally {
      cleanupMergedCleanupFixture(fixture);
    }
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

function taskSnapshot(tasksDir) {
  if (!existsSync(tasksDir)) {
    return "";
  }
  return readdirSync(tasksDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => `${name}\n${readFileSync(join(tasksDir, name), "utf8")}`)
    .join("\n---\n");
}

function createMergedCleanupFixture() {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "codex-merged-cleanup-"));
  const remoteRoot = `${fixtureRoot}-remote.git`;
  const stateRootFixture = join(fixtureRoot, "state");
  const fakeBin = join(fixtureRoot, "bin");
  const branch = "codex/cleanup-current";
  const worktree = join(stateRootFixture, "worktrees", "cleanup-task");
  const env = { ...process.env, PATH: `${fakeBin}:${process.env.PATH || ""}` };

  mkdirSync(join(fixtureRoot, "scripts", "lib"), { recursive: true });
  mkdirSync(fakeBin, { recursive: true });
  writeFileSync(join(fixtureRoot, "scripts", "codex-workspace.mjs"), readFileSync(scriptPath, "utf8"));
  writeFileSync(
    join(fixtureRoot, "scripts", "lib", "workspace-command-resolution.mjs"),
    readFileSync(join(rootDir, "scripts", "lib", "workspace-command-resolution.mjs"), "utf8"),
  );
  runGit(fixtureRoot, ["init", "-q"]);
  runGit(fixtureRoot, ["config", "user.email", "codex-workspace-test@example.com"]);
  runGit(fixtureRoot, ["config", "user.name", "Codex Workspace Test"]);
  writeFileSync(join(fixtureRoot, "base.txt"), "base\n");
  runGit(fixtureRoot, ["add", "base.txt", "scripts"]);
  runGit(fixtureRoot, ["commit", "-q", "-m", "base"]);
  runGit(fixtureRoot, ["branch", "-M", "main"]);
  mkdirSync(remoteRoot, { recursive: true });
  runGit(remoteRoot, ["init", "--bare", "-q"]);
  runGit(fixtureRoot, ["remote", "add", "origin", remoteRoot]);
  runGit(fixtureRoot, ["push", "-q", "-u", "origin", "main"]);
  runGit(fixtureRoot, ["branch", branch, "main"]);
  runGit(fixtureRoot, ["push", "-q", "-u", "origin", branch]);
  const branchHead = runGit(fixtureRoot, ["rev-parse", branch]).stdout;
  const fakeGh = join(fakeBin, "gh");
  writeFileSync(
    fakeGh,
    [
      "#!/usr/bin/env node",
      "const args = process.argv.slice(2);",
      "if (args[0] === '--version') { console.log('gh version test'); process.exit(0); }",
      "if (args[0] === 'pr' && args[1] === 'view') {",
      `  console.log(JSON.stringify({ number: 123, url: 'https://example.test/pull/123', mergedAt: '2026-06-21T00:00:00Z', state: 'MERGED', baseRefName: 'main', headRefOid: '${branchHead}' }));`,
      "  process.exit(0);",
      "}",
      "console.error(`unexpected gh args: ${args.join(' ')}`);",
      "process.exit(1);",
      "",
    ].join("\n"),
  );
  chmodSync(fakeGh, 0o755);
  mkdirSync(join(stateRootFixture, "worktrees"), { recursive: true });
  runGit(fixtureRoot, ["worktree", "add", "-q", worktree, branch]);

  mkdirSync(join(stateRootFixture, "tasks"), { recursive: true });
  writeFileSync(
    join(stateRootFixture, "tasks", "cleanup-task.json"),
    `${JSON.stringify({
      schema_version: 1,
      task_id: "cleanup-task",
      title: "Cleanup task",
      description: "cleanup task",
      repo_name: "fixture",
      repo_root: worktree,
      state_root: stateRootFixture,
      base_branch: "main",
      base_ref: "origin/main",
      branch,
      worktree_path: worktree,
      status: "merged",
      mode: "pr",
      pr_url: "https://example.test/pull/123",
      pr_number: 123,
      pr_delivery_head_sha: branchHead,
      owner: "runner-a",
      events: [],
    }, null, 2)}\n`,
  );

  return {
    root: fixtureRoot,
    remoteRoot,
    stateRoot: stateRootFixture,
    fakeBin,
    branch,
    worktree,
    script: join(fixtureRoot, "scripts", "codex-workspace.mjs"),
    worktreeScript: join(worktree, "scripts", "codex-workspace.mjs"),
    env,
  };
}

function runMergedCleanupFixtureScript(fixture, args) {
  const result = spawnSync(process.execPath, [fixture.worktreeScript, ...args], {
    cwd: fixture.worktree,
    encoding: "utf8",
    env: fixture.env,
    stdio: "pipe",
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || result.error?.message || "",
  };
}

function cleanupMergedCleanupFixture(fixture) {
  if (!fixture) {
    return;
  }
  spawnSync("git", ["worktree", "remove", "--force", fixture.worktree], {
    cwd: fixture.root,
    encoding: "utf8",
    stdio: "pipe",
  });
  rmSync(fixture.worktree, { recursive: true, force: true });
  rmSync(fixture.remoteRoot, { recursive: true, force: true });
  rmSync(fixture.root, { recursive: true, force: true });
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

function runFixtureScript(fixture, args, options = {}) {
  const result = spawnSync(process.execPath, [fixture.script, ...args], {
    cwd: options.cwd || fixture.root,
    encoding: "utf8",
    env: options.env || process.env,
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

function remoteBranchExists(cwd, branch) {
  const result = spawnSync("git", ["ls-remote", "--heads", "origin", branch], {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
  return result.status === 0 && Boolean((result.stdout || "").trim());
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
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
