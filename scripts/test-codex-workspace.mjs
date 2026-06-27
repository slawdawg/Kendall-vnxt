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

  test("doctor summary-json emits bounded readiness counts", () => {
    const doctorStateRoot = mkdtempSync(join(tmpdir(), "codex-doctor-summary-json-"));
    try {
      const result = run(["doctor", "--summary-json", "--state-root", doctorStateRoot]);

      assert(result.code === 0, result.stderr || result.stdout);
      assert(!result.stdout.includes("OK:"), "summary-json stdout must not contain text findings");
      const packet = JSON.parse(result.stdout);
      assert(packet.stateRoot === doctorStateRoot, result.stdout || result.stderr);
      assert(["ok", "warn", "fail"].includes(packet.status), result.stdout || result.stderr);
      assert(Number.isInteger(packet.counts.total), result.stdout || result.stderr);
      assert(packet.counts.total === packet.counts.ok + packet.counts.warnings + packet.counts.failures, result.stdout || result.stderr);
      assert(Array.isArray(packet.okFindings), result.stdout || result.stderr);
      assert(Array.isArray(packet.warnings), result.stdout || result.stderr);
      assert(Array.isArray(packet.failures), result.stdout || result.stderr);
      assert(packet.mutation === "none; summary only", result.stdout || result.stderr);
    } finally {
      rmSync(doctorStateRoot, { recursive: true, force: true });
    }
  });

  test("doctor warns about prunable git worktree registrations", () => {
    const staleWorktreePath = mkdtempSync(join(tmpdir(), "codex-stale-worktree-registration-"));
    const staleStateRoot = mkdtempSync(join(tmpdir(), "codex-stale-worktree-state-"));
    try {
      rmSync(staleWorktreePath, { recursive: true, force: true });
      const add = spawnSync("git", ["worktree", "add", "--detach", staleWorktreePath, "HEAD"], {
        cwd: rootDir,
        encoding: "utf8",
        stdio: "pipe",
      });
      assert(add.status === 0, add.stderr || add.stdout);
      rmSync(staleWorktreePath, { recursive: true, force: true });

      const result = run(["doctor", "--state-root", staleStateRoot]);

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("WARN: Prunable git worktree registration blocks branch cleanup"), result.stdout || result.stderr);
      assert(result.stdout.includes("Run git worktree prune before retrying branch cleanup"), result.stdout || result.stderr);
    } finally {
      spawnSync("git", ["worktree", "prune"], {
        cwd: rootDir,
        encoding: "utf8",
        stdio: "pipe",
      });
      rmSync(staleWorktreePath, { recursive: true, force: true });
      rmSync(staleStateRoot, { recursive: true, force: true });
    }
  });

  test("list reports no workspaces for an empty state root", () => {
    const result = run(["list", "--state-root", stateRoot]);
    assert(result.code === 0, result.stderr || result.stdout);
    assert(
      result.stdout === "" || result.stdout.includes("No Codex workspaces found"),
      result.stdout || result.stderr || "list should be empty or report no workspaces for an empty state root",
    );
  });

  test("coordination-report renders the workspace coordination packet for an empty state root", () => {
    const emptyStateRoot = mkdtempSync(join(tmpdir(), "codex-coordination-empty-"));
    try {
      const result = run(["coordination-report", "--state-root", emptyStateRoot, "--owner", "runner-a"]);
      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("Workspace Coordination Report"), result.stdout || result.stderr);
      assert(result.stdout.includes("- Active managed worktrees:"), result.stdout || result.stderr);
      assert(result.stdout.includes("- Next safe slice:"), result.stdout || result.stderr);
      assert(result.stdout.includes("- Stop lines:"), result.stdout || result.stderr);
    } finally {
      rmSync(emptyStateRoot, { recursive: true, force: true });
    }
  });

  test("coordination-report json exposes active lanes and remains read-only", () => {
    const reportStateRoot = mkdtempSync(join(tmpdir(), "codex-coordination-json-"));
    try {
      const tasksDir = join(reportStateRoot, "tasks");
      mkdirSync(tasksDir, { recursive: true });
      const manifestPath = join(tasksDir, "active-report-lane.json");
      const manifest = {
        task_id: "active-report-lane",
        title: "Active report lane",
        branch: "codex/active-report-lane",
        base_branch: "dev",
        base_ref: "origin/dev",
        status: "active",
        owner: "runner-a",
        worktree_path: rootDir,
        updated_at: "2026-06-27T00:00:00.000Z",
      };
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      const before = readFileSync(manifestPath, "utf8");

      const result = run(["coordination-report", "--json", "--state-root", reportStateRoot, "--owner", "runner-a"]);

      assert(result.code === 0, result.stderr || result.stdout);
      const packet = JSON.parse(result.stdout);
      assert(packet.currentOwner === "runner-a", result.stdout || result.stderr);
      assert(packet.activeManagedWorktrees.length === 1, result.stdout || result.stderr);
      assert(packet.activeManagedWorktrees[0].taskId === "active-report-lane", result.stdout || result.stderr);
      assert(packet.activeManagedWorktrees[0].assignmentStatus === "active", result.stdout || result.stderr);
      assert(packet.activeManagedWorktrees[0].worktreeExists === true, result.stdout || result.stderr);
      assert(["claimable", "none"].includes(packet.nextSafeSlice.status), result.stdout || result.stderr);
      assert(typeof packet.nextSafeSlice.action === "string", result.stdout || result.stderr);
      assert(packet.stopLines.includes("Merge a PR."), result.stdout || result.stderr);
      assert(
        packet.stopLines.includes("Delete a remote branch with no PR record, a SHA mismatch, an open PR, or an active workspace owner."),
        result.stdout || result.stderr,
      );
      assert(readFileSync(manifestPath, "utf8") === before, "coordination-report must not mutate manifests");
    } finally {
      rmSync(reportStateRoot, { recursive: true, force: true });
    }
  });

  test("coordination-report summary-json emits bounded counts without retained lane payloads", () => {
    const reportStateRoot = mkdtempSync(join(tmpdir(), "codex-coordination-summary-json-"));
    try {
      const tasksDir = join(reportStateRoot, "tasks");
      const assignmentsDir = join(reportStateRoot, "assignments");
      mkdirSync(tasksDir, { recursive: true });
      mkdirSync(assignmentsDir, { recursive: true });
      const activeManifestPath = join(tasksDir, "active-summary-lane.json");
      const activeManifest = {
        task_id: "active-summary-lane",
        title: "Active summary lane",
        branch: "codex/active-summary-lane",
        base_branch: "dev",
        base_ref: "origin/dev",
        status: "active",
        owner: "runner-a",
        worktree_path: rootDir,
        updated_at: "2026-06-27T00:00:00.000Z",
      };
      writeFileSync(activeManifestPath, JSON.stringify(activeManifest, null, 2));
      writeFileSync(
        join(tasksDir, "merged-evidence-pr-open-lane.json"),
        JSON.stringify(
          {
            task_id: "merged-evidence-pr-open-lane",
            title: "Merged evidence PR open lane",
            branch: "codex/merged-evidence-pr-open-lane",
            base_branch: "dev",
            base_ref: "origin/dev",
            status: "pr_open",
            owner: "runner-a",
            worktree_path: rootDir,
            pr_url: "https://example.test/pull/987",
            pr_number: 987,
            merged_at: "2026-06-27T12:00:00.000Z",
            updated_at: "2026-06-27T12:00:00.000Z",
          },
          null,
          2,
        ),
      );
      writeFileSync(
        join(assignmentsDir, "stale-summary-assignment.json"),
        JSON.stringify(
          {
            assignment_id: "stale-summary-assignment",
            branch: "codex/stale-summary-assignment",
            status: "claimed",
            owner: "runner-b",
            assigned_at: "2026-06-20T00:00:00.000Z",
            last_heartbeat_at: "2026-06-20T00:00:00.000Z",
          },
          null,
          2,
        ),
      );
      writeFileSync(
        join(assignmentsDir, "authority-summary-assignment.json"),
        JSON.stringify(
          {
            assignment_id: "authority-summary-assignment",
            branch: "codex/authority-summary-assignment",
            status: "blocked_authority",
            owner: "runner-b",
            assigned_at: "2026-06-27T00:00:00.000Z",
          },
          null,
          2,
        ),
      );
      for (let index = 0; index < 12; index += 1) {
        writeFileSync(
          join(tasksDir, `closed-summary-lane-${index}.json`),
          JSON.stringify(
            {
              task_id: `closed-summary-lane-${index}`,
              title: `Closed summary lane ${index}`,
              branch: `codex/closed-summary-lane-${index}`,
              base_branch: "dev",
              base_ref: "origin/dev",
              status: "closed",
              owner: "runner-a",
              worktree_path: join(reportStateRoot, `closed-summary-lane-${index}`),
              updated_at: "2026-06-27T00:00:00.000Z",
            },
            null,
            2,
          ),
        );
      }
      const before = readFileSync(activeManifestPath, "utf8");

      const result = run(["coordination-report", "--summary-json", "--state-root", reportStateRoot, "--owner", "runner-a"]);

      assert(result.code === 0, result.stderr || result.stdout);
      const packet = JSON.parse(result.stdout);
      assert(packet.currentOwner === "runner-a", result.stdout || result.stderr);
      assert(packet.counts.activeManagedWorktrees === 2, result.stdout || result.stderr);
      assert(packet.counts.prsWaitingAtMergeGate === 1, result.stdout || result.stderr);
      assert(packet.counts.prStateReconciliation === 1, result.stdout || result.stderr);
      assert(packet.counts.closedButRetainedLanes === 12, result.stdout || result.stderr);
      assert(packet.counts.blockedApprovalPackets === 2, result.stdout || result.stderr);
      assert(packet.blockedApprovalPacketStatusCounts.blocked_stale_owner_needs_takeover === 1, result.stdout || result.stderr);
      assert(packet.blockedApprovalPacketStatusCounts.blocked_authority === 1, result.stdout || result.stderr);
      assert(packet.backlogStatusCounts.closed >= 1, result.stdout || result.stderr);
      assert(packet.backlogClassificationStatusCounts.closed >= 1, result.stdout || result.stderr);
      assert(!("closedButRetainedLanes" in packet), result.stdout || result.stderr);
      assert(packet.activeManagedWorktrees[0].taskId === "active-summary-lane", result.stdout || result.stderr);
      assert(packet.prStateReconciliation[0].taskId === "merged-evidence-pr-open-lane", result.stdout || result.stderr);
      assert(packet.prStateReconciliation[0].prState === "merged_evidence_present", result.stdout || result.stderr);
      assert(typeof packet.prStateReconciliation[0].prStateNextAction === "string", result.stdout || result.stderr);
      assert(typeof packet.prStateReconciliationTruncated === "boolean", result.stdout || result.stderr);
      assert(packet.stopLines.includes("Merge a PR."), result.stdout || result.stderr);
      assert(
        packet.stopLines.includes("Delete a remote branch with no PR record, a SHA mismatch, an open PR, or an active workspace owner."),
        result.stdout || result.stderr,
      );
      assert(readFileSync(activeManifestPath, "utf8") === before, "coordination-report summary-json must not mutate manifests");
    } finally {
      rmSync(reportStateRoot, { recursive: true, force: true });
    }
  });

  test("start dry-run defaults new work to dev when branch foundation exists", () => {
    const fixture = createWorkspaceDefaultBaseFixture({ withDev: true });
    try {
      const result = runFixtureScript(fixture, [
        "start",
        "test task",
        "--dry-run",
        "--owner",
        "runner-a",
        "--state-root",
        fixture.stateRoot,
      ]);

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("git fetch origin dev"), result.stdout || result.stderr);
      assert(result.stdout.includes("git worktree add -b codex/test-task"), result.stdout || result.stderr);
      assert(result.stdout.includes("Base branch: dev"), result.stdout || result.stderr);
      assert(result.stdout.includes("Base ref: origin/dev"), result.stdout || result.stderr);
      assert(result.stdout.includes("write "), result.stdout || result.stderr);
      assert(result.stdout.includes("Owner: runner-a"), result.stdout || result.stderr);
    } finally {
      cleanupWorkspaceDefaultBaseFixture(fixture);
    }
  });

  test("start dry-run preserves explicit main base override", () => {
    const fixture = createWorkspaceDefaultBaseFixture({ withDev: true });
    try {
      const result = runFixtureScript(fixture, [
        "start",
        "main override task",
        "--base",
        "main",
        "--dry-run",
        "--owner",
        "runner-a",
        "--state-root",
        fixture.stateRoot,
      ]);

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("git fetch origin main"), result.stdout || result.stderr);
      assert(!result.stdout.includes("git fetch origin dev"), result.stdout || result.stderr);
      assert(result.stdout.includes("Base branch: main"), result.stdout || result.stderr);
      assert(result.stdout.includes("Base ref: origin/main"), result.stdout || result.stderr);
    } finally {
      cleanupWorkspaceDefaultBaseFixture(fixture);
    }
  });

  test("start rejects refspec-shaped base before fetch or worktree planning", () => {
    const fixture = createWorkspaceDefaultBaseFixture({ withDev: true });
    try {
      const beforeRefs = refSnapshot(fixture.root);
      const result = runFixtureScript(fixture, [
        "start",
        "bad base task",
        "--base",
        "dev:refs/heads/injected",
        "--dry-run",
        "--owner",
        "runner-a",
        "--state-root",
        fixture.stateRoot,
      ]);
      const afterRefs = refSnapshot(fixture.root);

      assert(result.code !== 0, "refspec-shaped base unexpectedly passed");
      assert(result.stderr.includes("Invalid base branch"), result.stderr || result.stdout);
      assert(beforeRefs === afterRefs, "invalid base branch changed refs");
    } finally {
      cleanupWorkspaceDefaultBaseFixture(fixture);
    }
  });

  test("start dry-run summary-json emits bounded plan without mutation", () => {
    const fixture = createWorkspaceDefaultBaseFixture({ withDev: true });
    try {
      const taskId = "summary-json-lane";
      const branch = "codex/summary-json-lane";
      const worktreePath = join(fixture.stateRoot, "worktrees", taskId);
      const manifestPath = join(fixture.stateRoot, "tasks", `${taskId}.json`);
      const branchBefore = branchExists(fixture.root, branch);

      const result = runFixtureScript(fixture, [
        "start",
        "summary json lane",
        "--dry-run",
        "--summary-json",
        "--owner",
        "runner-a",
        "--task-id",
        taskId,
        "--branch",
        branch,
        "--worktree",
        worktreePath,
        "--state-root",
        fixture.stateRoot,
      ]);

      assert(result.code === 0, result.stderr || result.stdout);
      assert(!result.stdout.includes("DRY RUN:"), "start --summary-json stdout must not include text plan output");
      const packet = JSON.parse(result.stdout);
      assert(packet.stateRoot === fixture.stateRoot, result.stdout || result.stderr);
      assert(packet.taskId === taskId, result.stdout || result.stderr);
      assert(packet.title === "Summary json lane", result.stdout || result.stderr);
      assert(packet.mode === "pr", result.stdout || result.stderr);
      assert(packet.owner === "runner-a", result.stdout || result.stderr);
      assert(packet.branch === branch, result.stdout || result.stderr);
      assert(packet.baseBranch === "dev", result.stdout || result.stderr);
      assert(packet.baseRef === "origin/dev", result.stdout || result.stderr);
      assert(packet.worktreePath === worktreePath, result.stdout || result.stderr);
      assert(packet.manifestPath === manifestPath, result.stdout || result.stderr);
      assert(packet.shouldFetch === true, result.stdout || result.stderr);
      assert(packet.plan.includes(`git worktree add -b ${branch} ${worktreePath} origin/dev`), result.stdout || result.stderr);
      assert(packet.plannedWrites.manifest === manifestPath, result.stdout || result.stderr);
      assert(packet.mutation === "none; dry-run summary only", result.stdout || result.stderr);
      assert(!existsSync(manifestPath), "start dry-run summary-json wrote a manifest");
      assert(!existsSync(worktreePath), "start dry-run summary-json created a worktree");
      assert(branchExists(fixture.root, branch) === branchBefore, "start dry-run summary-json changed branch state");
    } finally {
      cleanupWorkspaceDefaultBaseFixture(fixture);
    }
  });

  test("start dry-run fails closed when default dev branch is missing", () => {
    const fixture = createWorkspaceDefaultBaseFixture({ withDev: false });
    try {
      const result = runFixtureScript(fixture, [
        "start",
        "missing dev task",
        "--dry-run",
        "--owner",
        "runner-a",
        "--state-root",
        fixture.stateRoot,
      ]);

      assert(result.code !== 0, "missing default dev unexpectedly passed");
      assert(result.stderr.includes("Branch foundation default base dev"), result.stderr || result.stdout);
      assert(result.stderr.includes("node ./scripts/branch-foundation.mjs report"), result.stderr || result.stdout);
      assert(!result.stderr.includes("falling back to main"), result.stderr || result.stdout);
      assert(!result.stdout.includes("Base branch: main"), result.stdout || result.stderr);
    } finally {
      cleanupWorkspaceDefaultBaseFixture(fixture);
    }
  });

  test("start reports fetch errors distinctly when local default dev exists", () => {
    const fixture = createWorkspaceDefaultBaseFixture({ withLocalDevOnly: true });
    try {
      const beforeTasks = taskSnapshot(join(fixture.stateRoot, "tasks"));
      const result = runFixtureScript(fixture, [
        "start",
        "fetch failure task",
        "--owner",
        "runner-a",
        "--state-root",
        fixture.stateRoot,
      ]);
      const afterTasks = taskSnapshot(join(fixture.stateRoot, "tasks"));

      assert(result.code !== 0, "fetch failure unexpectedly passed");
      assert(!result.stderr.includes("Branch foundation default base dev"), result.stderr || result.stdout);
      assert(result.stderr.includes("origin") || result.stderr.includes("fetch"), result.stderr || result.stdout);
      assert(beforeTasks === afterTasks, "failed fetch wrote a task manifest");
    } finally {
      cleanupWorkspaceDefaultBaseFixture(fixture);
    }
  });

  test("help lists local codex branch cleanup", () => {
    const result = run(["--help"]);
    assert(result.code === 0, result.stderr || result.stdout);
    assert(result.stdout.includes("coordination-report"), result.stdout || result.stderr);
    assert(result.stdout.includes("assignment-report"), result.stdout || result.stderr);
    assert(result.stdout.includes("cleanup-branches [query]"), result.stdout || result.stderr);
    assert(result.stdout.includes("heartbeat <query>"), result.stdout || result.stderr);
    assert(result.stdout.includes("takeover <query>"), result.stdout || result.stderr);
    assert(result.stdout.includes("dispatch-next"), result.stdout || result.stderr);
    assert(result.stdout.includes("--base <ref>"), result.stdout || result.stderr);
    assert(result.stdout.includes("Defaults to dev"), result.stdout || result.stderr);
    assert(result.stdout.includes("Defaults to origin/main"), result.stdout || result.stderr);
  });

  test("start refuses protected branch overrides", () => {
    for (const branch of ["main", "master", "prod"]) {
      const result = run(["start", `bad ${branch} task`, "--branch", branch, "--dry-run", "--state-root", stateRoot]);
      assert(result.code !== 0, `${branch} branch override unexpectedly passed`);
      assert(result.stderr.includes("Refusing to operate on protected branch"), result.stderr || result.stdout);
    }
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

  test("rebuild-index summary-json reports candidates without creating manifests", () => {
    const rebuildStateRoot = mkdtempSync(join(tmpdir(), "codex-rebuild-index-summary-json-"));
    try {
      const tasksDir = join(rebuildStateRoot, "tasks");
      const result = run(["rebuild-index", "--summary-json", "--state-root", rebuildStateRoot]);

      assert(result.code === 0, result.stderr || result.stdout);
      const packet = JSON.parse(result.stdout);
      assert(packet.tasksDir === tasksDir, result.stdout || result.stderr);
      assert(Number.isInteger(packet.counts.totalCodexWorktrees), result.stdout || result.stderr);
      assert(Number.isInteger(packet.counts.planned), result.stdout || result.stderr);
      assert(Number.isInteger(packet.counts.skipped), result.stdout || result.stderr);
      assert(packet.counts.planned + packet.counts.skipped === packet.counts.totalCodexWorktrees, result.stdout || result.stderr);
      assert(packet.mutation === "none; summary only", result.stdout || result.stderr);
      assert(!existsSync(tasksDir), "rebuild-index summary-json created the tasks directory");
    } finally {
      rmSync(rebuildStateRoot, { recursive: true, force: true });
    }
  });

  test("run uses shared workspace command resolution", () => {
    const source = readFileSync(scriptPath, "utf8");
    const match = source.match(/function run\(commandName[\s\S]*?function samePath/);
    assert(match, "run source not found");
    assert(source.includes("resolveWorkspaceCommand"), "codex-workspace must import shared command resolver");
    assert(match[0].includes("const resolved = resolveWorkspaceCommand(commandName, commandArguments);"), "run must resolve workspace commands");
    assert(match[0].includes("env: resolved.env ?? process.env"), "run must pass resolved command environment");
  });

  test("workspace state uses shared resolver", () => {
    const source = readFileSync(scriptPath, "utf8");
    assert(source.includes("codex-workspace-state"), "codex-workspace must import shared workspace state resolver");
    assert(source.includes("workspaceState"), "codex-workspace must use shared workspaceState");
    assert(!source.includes("function workspaceState"), "codex-workspace must not define workspaceState inline");
    assert(!source.includes("function workspaceKey"), "codex-workspace must not define workspaceKey inline");
  });

  test("finish-pr invokes anti-churn finalization before delivery mutation", () => {
    const source = readFileSync(scriptPath, "utf8");
    const match = source.match(/function finishPr[\s\S]*?function runAntiChurnFinalization/);
    assert(match, "finishPr source or anti-churn finalization helper not found");
    assert(match[0].includes('plan.push("anti-churn hook evaluate --apply-safe --format json")'), "finish-pr dry-run plan must include anti-churn hook invocation");
    assert(match[0].includes("const antiChurn = runAntiChurnFinalization(manifest, state, { worktreeStatus, pr: existingPr });"), "finish-pr must invoke anti-churn finalization with concrete PR evidence");
    assert(
      match[0].indexOf("const antiChurn = runAntiChurnFinalization") < match[0].indexOf('runChecked("git", ["add", "--all"]'),
      "anti-churn finalization must run before staging/commit delivery mutation",
    );
  });

  test("anti-churn finalization records distilled manifest evidence only", () => {
    const source = readFileSync(scriptPath, "utf8");
    const match = source.match(/function shapeAntiChurnManifestRecord[\s\S]*?function noStructuredChurnReason/);
    assert(match, "anti-churn manifest record shaper not found");
    for (const field of [
      "mode",
      "status",
      "omitted_reason",
      "lessons_evaluated",
      "applied",
      "proposals",
      "skipped",
      "files_changed",
      "verification",
      "residual_risks",
      "local_event_storage",
      "next_safe_action",
    ]) {
      assert(match[0].includes(field), `anti-churn manifest record missing ${field}`);
    }
    assert(
      !match[0].includes('status: omittedReason ? "omitted"'),
      "anti-churn finalization must preserve hook failure status instead of replacing it with omitted",
    );
    assert(!match[0].includes("evidenceSummary"), "anti-churn manifest record must not store raw event evidence");
  });

  test("anti-churn finalization distinguishes no-event omissions from malformed input", () => {
    const source = readFileSync(scriptPath, "utf8");
    const match = source.match(/function noStructuredChurnReason[\s\S]*?function antiChurnNextSafeAction/);
    assert(match, "anti-churn no-event reason helper not found");
    assert(match[0].includes('"missing-event-store"'), "missing event stores must be typed as no structured churn events");
    assert(match[0].includes('"empty-event-store"'), "empty event stores must be typed as no structured churn events");
    assert(match[0].includes('"malformed-event-line"'), "malformed event input must not be hidden as an omission");
    assert(match[0].includes('"no-valid-events"'), "invalid event stores must not be hidden as an omission");
    assert(
      match[0].indexOf('"malformed-event-line"') < match[0].indexOf('"missing-event-store"'),
      "malformed input checks must run before no-event omission checks",
    );
  });

  test("finish-pr renders a stable anti-churn finalization section", () => {
    const source = readFileSync(scriptPath, "utf8");
    const finishPr = source.match(/function finishPr[\s\S]*?function runAntiChurnFinalization/);
    const renderer = source.match(/function renderAntiChurnFinalization[\s\S]*?function renderProposalDetails/);
    assert(finishPr, "finishPr source not found");
    assert(renderer, "anti-churn finalization renderer not found");
    assert(
      finishPr[0].includes("for (const line of renderAntiChurnFinalization(manifest.anti_churn_finalization))"),
      "finish-pr must print the structured anti-churn finalization section",
    );
    assert(!finishPr[0].includes("Anti-churn:"), "finish-pr must not use the compact anti-churn summary");
    for (const label of [
      "Anti-Churn Finalization",
      "- Mode:",
      "- Lessons evaluated:",
      "- Applied safe local edits:",
      "- Proposals prepared:",
      "- No-op reasons:",
      "- Local event storage:",
      "- Verification:",
      "- Residual risks:",
    ]) {
      assert(renderer[0].includes(label), `anti-churn finalization output missing ${label}`);
    }
  });

  test("anti-churn finalization renderer surfaces authority, verification, and safe PR inclusion metadata", () => {
    const source = readFileSync(scriptPath, "utf8");
    const rendererBlock = source.match(/function renderAntiChurnFinalization[\s\S]*?function valueOrNone/);
    assert(rendererBlock, "anti-churn finalization renderer block not found");
    const block = rendererBlock[0];
    for (const expected of [
      "requiredAuthorityFamily",
      "requiredAuthority",
      "blockedOperation",
      "evidenceReferences",
      "nextSafeAction",
      "approval=not approved; proposal-only",
      "existing finish-pr staging/commit policy decides",
      "command",
      "status",
      "result",
      "exitCode",
    ]) {
      assert(block.includes(expected), `anti-churn finalization renderer missing ${expected}`);
    }
    for (const forbidden of ["evidenceSummary", "prompt", "completion", "providerPayload", "secret"]) {
      assert(!block.includes(forbidden), `anti-churn finalization renderer must not render raw field ${forbidden}`);
    }
  });

  test("anti-churn finalization no-op summary includes proposal-only and higher-authority outcomes", () => {
    const source = readFileSync(scriptPath, "utf8");
    const match = source.match(/function formatNoOpReasons[\s\S]*?function formatLocalEventStorage/);
    assert(match, "anti-churn no-op formatter not found");
    assert(match[0].includes("copyJsonArray(record.proposals)"), "proposal records must contribute to no-op reasons");
    assert(match[0].includes('"proposal-only"'), "proposal-only outcomes must be rendered in no-op reasons");
    assert(match[0].includes('"requires-higher-authority"'), "higher-authority outcomes must be rendered in no-op reasons");
  });

  test("anti-churn lane manifest carries lifecycle metadata without inferring review readiness", () => {
    const source = readFileSync(scriptPath, "utf8");
    const manifestMatch = source.match(/function antiChurnLaneManifest[\s\S]*?function antiChurnPrState/);
    const prMatch = source.match(/function antiChurnPrState[\s\S]*?function antiChurnCleanupStatus/);
    assert(manifestMatch, "anti-churn lane manifest helper not found");
    assert(prMatch, "anti-churn PR state helper not found");
    for (const expected of [
      "owner: manifest.owner || null",
      "pr: antiChurnPrState(manifest, options.pr)",
      "status: antiChurnCleanupStatus(manifest)",
      "startedAt: manifest.cleanup_started_at || null",
      "dirtyWorktree",
      "checkedAt",
      "paths: statusPaths(worktreeStatus)",
    ]) {
      assert(manifestMatch[0].includes(expected), `anti-churn lane manifest missing ${expected}`);
    }
    assert(prMatch[0].includes("if (!hasPrEvidence)"), "PR state must be unavailable without concrete PR evidence");
    assert(prMatch[0].includes("return null"), "missing PR evidence must not be converted into an open PR state");
    assert(prMatch[0].includes("reviewStateCheckedAt: manifest.pr_review_state_checked_at || null"), "review-thread freshness must come from recorded evidence only");
    assert(!prMatch[0].includes("reviewStateCheckedAt: checkedAt"), "dirty-worktree timestamps must not imply review-thread freshness");
  });

  test("anti-churn finalization helper does not own lane lifecycle mutations", () => {
    const source = readFileSync(scriptPath, "utf8");
    const match = source.match(/function runAntiChurnFinalization[\s\S]*?function antiChurnLaneManifest/);
    assert(match, "anti-churn finalization helper not found");
    for (const forbidden of [
      "manifest.status",
      "manifest.pr_url",
      "manifest.pr_number",
      "manifest.merged_at",
      "cleanup_started_at",
      'runChecked("git"',
      'runChecked("gh"',
      "cleanupMergedResources",
      "pr_open",
      "comment",
      "merge",
    ]) {
      assert(!match[0].includes(forbidden), `anti-churn finalization helper must not own lifecycle mutation: ${forbidden}`);
    }
  });

  test("finish-pr writes anti-churn results into the local lane evidence packet", () => {
    const source = readFileSync(scriptPath, "utf8");
    const finishPr = source.match(/function finishPr[\s\S]*?function runAntiChurnFinalization/);
    assert(finishPr, "finishPr source not found");
    assert(
      finishPr[0].includes("manifest.lane_evidence_packet = buildLaneEvidencePacket(manifest, antiChurn.manifestRecord, { worktreeStatus });"),
      "finish-pr must persist anti-churn evidence into the local lane evidence packet",
    );
    assert(
      finishPr[0].indexOf("manifest.anti_churn_finalization = antiChurn.manifestRecord")
        < finishPr[0].indexOf("manifest.lane_evidence_packet = buildLaneEvidencePacket"),
      "lane evidence packet must be built from the distilled anti-churn finalization record",
    );
  });

  test("anti-churn lane evidence packet records distilled metadata only", () => {
    const source = readFileSync(scriptPath, "utf8");
    const packetBlock = source.match(/function buildLaneEvidencePacket[\s\S]*?function cleanupMerged/);
    assert(packetBlock, "anti-churn lane evidence packet helpers not found");
    const block = packetBlock[0];
    for (const expected of [
      "lane_evidence_packet",
      "anti_churn_finalization",
      "event_store_references",
      "lessons_evaluated",
      "applied_edits",
      "proposals",
      "no_op_reasons",
      "verification",
      "residual_risks",
      "next_safe_action",
      "source_edit_delivery",
      "included_in_lane_pr",
      "rollback_or_recovery_path",
    ]) {
      assert(block.includes(expected), `anti-churn evidence packet missing ${expected}`);
    }
    for (const forbidden of ["readFileSync", "evidenceSummary", "prompt", "completion", "providerPayload", "secret", "preimageHunk", "plannedPostimageHunk"]) {
      assert(!block.includes(forbidden), `anti-churn evidence packet must not copy raw field ${forbidden}`);
    }
  });

  test("anti-churn evidence packet keeps proposals local and source edits recoverable", () => {
    const source = readFileSync(scriptPath, "utf8");
    const proposalBlock = source.match(/function shapeProposalEvidence[\s\S]*?function shapeNoOpReasonEvidence/);
    const deliveryBlock = source.match(/function shapeAntiChurnEvidencePacket[\s\S]*?function shapeEventStoreReferences/);
    const recoveryBlock = source.match(/function antiChurnRecoveryPath[\s\S]*?function cleanupMerged/);
    assert(proposalBlock, "anti-churn proposal evidence helper not found");
    assert(deliveryBlock, "anti-churn delivery evidence helper not found");
    assert(recoveryBlock, "anti-churn recovery helper not found");
    for (const expected of ["requiredAuthority", "requiredAuthorityFamily", "reviewPath", 'locality: "local-only"', 'approval: "not-approved"']) {
      assert(proposalBlock[0].includes(expected), `proposal evidence missing ${expected}`);
    }
    assert(deliveryBlock[0].includes('"governed-by-finish-pr-staging-policy"'), "source edit delivery must point to finish-pr staging policy");
    assert(deliveryBlock[0].includes("local_only_telemetry_or_proposals"), "packet must distinguish local-only telemetry/proposals");
    assert(recoveryBlock[0].includes("transactionIds"), "recovery path must preserve transaction id metadata when available");
    assert(recoveryBlock[0].includes("revert the lane PR source edit"), "recovery path must include a source edit recovery option");
  });

  test("assignment-report keeps ownership checks before branch availability checks", () => {
    const source = readFileSync(scriptPath, "utf8");
    const match = source.match(/function classifyBacklogItem[\s\S]*?function classifyLaneAssignment/);
    assert(match, "classifyBacklogItem source not found");
    const section = match[0];
    const assignmentIndex = section.indexOf("assignmentBranchStates.get");
    const manifestIndex = section.indexOf("manifestBranchStates.get");
    const availabilityIndex = section.indexOf("claimBranchAvailabilityBlocker");
    assert(assignmentIndex >= 0, "classifyBacklogItem must inspect lane assignments");
    assert(manifestIndex >= 0, "classifyBacklogItem must inspect workspace manifests");
    assert(availabilityIndex >= 0, "classifyBacklogItem must inspect branch availability");
    assert(assignmentIndex < availabilityIndex, "assignment checks must precede branch availability checks");
    assert(manifestIndex < availabilityIndex, "workspace manifest checks must precede branch availability checks");
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

  test("cleanup-branches summary-json reports safe and skipped branches without mutation", () => {
    const fixture = createBranchCleanupFixture();
    try {
      const result = runFixtureScript(fixture, ["cleanup-branches", "--base", "origin/main", "--summary-json"]);
      assert(result.code === 0, result.stderr || result.stdout);
      const packet = JSON.parse(result.stdout);
      assert(packet.baseRef === "origin/main", result.stdout || result.stderr);
      assert(packet.counts.total === 5, result.stdout || result.stderr);
      assert(packet.counts.safe === 2, result.stdout || result.stderr);
      assert(packet.counts.skipped === 3, result.stdout || result.stderr);
      assert(packet.mutation === "none; summary only", result.stdout || result.stderr);
      assert(packet.safeBranches.some((entry) => entry.branch === "codex/merged"), result.stdout || result.stderr);
      assert(packet.safeBranches.some((entry) => entry.branch === "codex/equivalent"), result.stdout || result.stderr);
      assert(
        packet.skippedBranches.some((entry) => entry.branch === "codex/active" && entry.reason === "branch is checked out in a worktree"),
        result.stdout || result.stderr,
      );
      assert(packet.skippedReasonCounts["branch is checked out in a worktree"] === 1, result.stdout || result.stderr);
      for (const branch of ["codex/merged", "codex/equivalent", "codex/diverged", "codex/similar", "codex/active"]) {
        assert(branchExists(fixture.root, branch), `${branch} was deleted during summary-json`);
      }
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

  test("list json keeps malformed manifest warnings off stdout", () => {
    const jsonStateRoot = mkdtempSync(join(tmpdir(), "codex-workspace-json-list-"));
    try {
      const tasksDir = join(jsonStateRoot, "tasks");
      mkdirSync(tasksDir, { recursive: true });
      writeFileSync(join(tasksDir, "bad.json"), "{not json");
      writeFileSync(
        join(tasksDir, "good.json"),
        `${JSON.stringify({
          task_id: "good",
          branch: "codex/good",
          worktree_path: rootDir,
          base_branch: "dev",
          status: "active",
          owner: "runner-a",
        }, null, 2)}\n`,
      );

      const result = run(["list", "--state-root", jsonStateRoot, "--json"]);

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stderr.includes("skipping invalid manifest"));
      assert(!result.stdout.includes("WARN:"), "machine-readable stdout must not include warnings");
      const parsed = JSON.parse(result.stdout);
      assert(parsed.length === 1, result.stdout);
      assert(parsed[0].taskId === "good", result.stdout);
    } finally {
      rmSync(jsonStateRoot, { recursive: true, force: true });
    }
  });

  test("repair-manifests dry-run plans only closed legacy manifest repairs", () => {
    const repairStateRoot = mkdtempSync(join(tmpdir(), "codex-workspace-repair-dry-run-"));
    try {
      const tasksDir = join(repairStateRoot, "tasks");
      mkdirSync(tasksDir, { recursive: true });
      const closedPath = join(tasksDir, "closed-legacy.json");
      const activePath = join(tasksDir, "active-legacy.json");
      writeFileSync(
        closedPath,
        `${JSON.stringify({
          task_id: "closed-legacy",
          branch: "codex/closed-legacy",
          status: "closed",
        }, null, 2)}\n`,
      );
      writeFileSync(
        activePath,
        `${JSON.stringify({
          task_id: "active-legacy",
          branch: "codex/active-legacy",
          status: "active",
        }, null, 2)}\n`,
      );

      const beforeClosed = readFileSync(closedPath, "utf8");
      const beforeActive = readFileSync(activePath, "utf8");
      const result = run(["repair-manifests", "--state-root", repairStateRoot]);

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("DRY RUN: repair-manifests"), result.stdout || result.stderr);
      assert(result.stdout.includes("closed-legacy: add worktree_path, base_branch"), result.stdout || result.stderr);
      assert(result.stdout.includes("blocked active-legacy.json: only closed legacy manifests can be repaired"), result.stdout || result.stderr);
      assert(readFileSync(closedPath, "utf8") === beforeClosed, "repair dry-run mutated closed manifest");
      assert(readFileSync(activePath, "utf8") === beforeActive, "repair dry-run mutated active manifest");
    } finally {
      rmSync(repairStateRoot, { recursive: true, force: true });
    }
  });

  test("repair-manifests summary-json reports repairable and blocked manifests without mutation", () => {
    const repairStateRoot = mkdtempSync(join(tmpdir(), "codex-workspace-repair-summary-json-"));
    try {
      const tasksDir = join(repairStateRoot, "tasks");
      mkdirSync(tasksDir, { recursive: true });
      const closedPath = join(tasksDir, "closed-legacy.json");
      const activePath = join(tasksDir, "active-legacy.json");
      writeFileSync(
        closedPath,
        `${JSON.stringify({
          task_id: "closed-legacy",
          branch: "codex/closed-legacy",
          status: "closed",
        }, null, 2)}\n`,
      );
      writeFileSync(
        activePath,
        `${JSON.stringify({
          task_id: "active-legacy",
          branch: "codex/active-legacy",
          status: "active",
        }, null, 2)}\n`,
      );

      const beforeClosed = readFileSync(closedPath, "utf8");
      const beforeActive = readFileSync(activePath, "utf8");
      const result = run(["repair-manifests", "--summary-json", "--state-root", repairStateRoot]);

      assert(result.code === 0, result.stderr || result.stdout);
      const packet = JSON.parse(result.stdout);
      assert(packet.tasksDir === tasksDir, result.stdout || result.stderr);
      assert(packet.counts.total === 2, result.stdout || result.stderr);
      assert(packet.counts.repairable === 1, result.stdout || result.stderr);
      assert(packet.counts.blocked === 1, result.stdout || result.stderr);
      assert(packet.repairableManifests.some((entry) => entry.taskId === "closed-legacy"), result.stdout || result.stderr);
      assert(packet.repairableManifests[0].fields.includes("worktree_path"), result.stdout || result.stderr);
      assert(
        packet.blockedManifests.some((entry) => entry.name === "active-legacy.json" && entry.reason === "only closed legacy manifests can be repaired"),
        result.stdout || result.stderr,
      );
      assert(packet.blockedReasonCounts["only closed legacy manifests can be repaired"] === 1, result.stdout || result.stderr);
      assert(packet.mutation === "none; summary only", result.stdout || result.stderr);
      assert(readFileSync(closedPath, "utf8") === beforeClosed, "repair summary-json mutated closed manifest");
      assert(readFileSync(activePath, "utf8") === beforeActive, "repair summary-json mutated active manifest");
    } finally {
      rmSync(repairStateRoot, { recursive: true, force: true });
    }
  });

  test("repair-manifests apply fills closed legacy manifest validation fields", () => {
    const repairStateRoot = mkdtempSync(join(tmpdir(), "codex-workspace-repair-apply-"));
    try {
      const tasksDir = join(repairStateRoot, "tasks");
      mkdirSync(tasksDir, { recursive: true });
      const manifestPath = join(tasksDir, "closed-legacy.json");
      writeFileSync(
        manifestPath,
        `${JSON.stringify({
          task_id: "closed-legacy",
          branch: "codex/closed-legacy",
          status: "closed",
          owner: "runner-a",
        }, null, 2)}\n`,
      );

      const result = run(["repair-manifests", "--state-root", repairStateRoot, "--apply"]);

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("APPLY: repair-manifests"), result.stdout || result.stderr);
      const repaired = JSON.parse(readFileSync(manifestPath, "utf8"));
      assert(repaired.worktree_path === join(repairStateRoot, "worktrees", "closed-legacy"), JSON.stringify(repaired));
      assert(repaired.base_branch === "dev", JSON.stringify(repaired));
      assert(Array.isArray(repaired.events), "repair event missing");
      assert(repaired.events.some((event) => event.type === "manifest_repaired"), "repair event missing");
      const list = run(["list", "--state-root", repairStateRoot, "--json"]);
      assert(list.code === 0, list.stderr || list.stdout);
      assert(list.stderr === "", list.stderr);
      assert(JSON.parse(list.stdout)[0].taskId === "closed-legacy", list.stdout);
    } finally {
      rmSync(repairStateRoot, { recursive: true, force: true });
    }
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

  test("list json emits structured workspace rows for automation", () => {
    const jsonStateRoot = mkdtempSync(join(tmpdir(), "codex-list-json-"));
    try {
      const tasksDir = join(jsonStateRoot, "tasks");
      mkdirSync(tasksDir, { recursive: true });
      const missingWorktreePath = join(jsonStateRoot, "worktrees", "missing-json-lane");
      writeFileSync(
        join(tasksDir, "json-lane.json"),
        `${JSON.stringify({
          task_id: "json-lane",
          branch: "codex/json-lane",
          worktree_path: rootDir,
          base_branch: "dev",
          status: "active",
          pr_url: "https://github.com/slawdawg/Kendall-vnxt/pull/123",
          owner: "runner-json",
          cleanup_started_at: "2026-06-26T00:00:00.000Z",
          cleanup_expected_head_sha: "abc123",
        })}\n`,
      );
      writeFileSync(
        join(tasksDir, "missing-json-lane.json"),
        `${JSON.stringify({
          task_id: "missing-json-lane",
          branch: "codex/missing-json-lane",
          worktree_path: missingWorktreePath,
          base_branch: "dev",
          status: "active",
          owner: "runner-json",
        })}\n`,
      );

      const result = run(["list", "--active", "--json", "--state-root", jsonStateRoot]);
      const rows = JSON.parse(result.stdout);
      const byTaskId = new Map(rows.map((row) => [row.taskId, row]));

      assert(result.code === 0, result.stderr || result.stdout);
      assert(Array.isArray(rows), result.stdout || result.stderr);
      assert(rows.length === 2, result.stdout || result.stderr);
      assert(byTaskId.get("json-lane").branch === "codex/json-lane", result.stdout || result.stderr);
      assert(byTaskId.get("json-lane").baseBranch === "dev", result.stdout || result.stderr);
      assert(byTaskId.get("json-lane").prNumber === 123, result.stdout || result.stderr);
      assert(byTaskId.get("json-lane").owner === "runner-json", result.stdout || result.stderr);
      assert(byTaskId.get("json-lane").worktreeExists === true, result.stdout || result.stderr);
      assert(byTaskId.get("json-lane").cleanup.startedAt === "2026-06-26T00:00:00.000Z", result.stdout || result.stderr);
      assert(byTaskId.get("json-lane").cleanup.expectedHeadSha === "abc123", result.stdout || result.stderr);
      assert(byTaskId.get("missing-json-lane").worktreePath === missingWorktreePath, result.stdout || result.stderr);
      assert(byTaskId.get("missing-json-lane").worktreeExists === false, result.stdout || result.stderr);
    } finally {
      rmSync(jsonStateRoot, { recursive: true, force: true });
    }
  });

  test("list summary-json emits bounded inventory counts without mutation", () => {
    const summaryStateRoot = mkdtempSync(join(tmpdir(), "codex-list-summary-json-"));
    try {
      const tasksDir = join(summaryStateRoot, "tasks");
      mkdirSync(tasksDir, { recursive: true });
      const missingWorktreePath = join(summaryStateRoot, "worktrees", "missing-summary-lane");
      const activePath = join(tasksDir, "active-summary-lane.json");
      const closedPath = join(tasksDir, "closed-summary-lane.json");
      writeFileSync(
        activePath,
        `${JSON.stringify({
          task_id: "active-summary-lane",
          branch: "codex/active-summary-lane",
          worktree_path: rootDir,
          base_branch: "dev",
          status: "active",
          pr_url: "https://github.com/slawdawg/Kendall-vnxt/pull/321",
          owner: "runner-summary",
        }, null, 2)}\n`,
      );
      writeFileSync(
        closedPath,
        `${JSON.stringify({
          task_id: "closed-summary-lane",
          branch: "codex/closed-summary-lane",
          worktree_path: missingWorktreePath,
          base_branch: "dev",
          status: "closed",
          owner: "runner-summary",
        }, null, 2)}\n`,
      );

      const beforeActive = readFileSync(activePath, "utf8");
      const beforeClosed = readFileSync(closedPath, "utf8");
      const result = run(["list", "--summary-json", "--state-root", summaryStateRoot, "--owner", "runner-summary"]);

      assert(result.code === 0, result.stderr || result.stdout);
      const packet = JSON.parse(result.stdout);
      assert(packet.stateRoot === summaryStateRoot, result.stdout || result.stderr);
      assert(packet.tasksDir === tasksDir, result.stdout || result.stderr);
      assert(packet.filters.active === false, result.stdout || result.stderr);
      assert(packet.filters.owner === "runner-summary", result.stdout || result.stderr);
      assert(packet.counts.total === 2, result.stdout || result.stderr);
      assert(packet.counts.statuses.active === 1, result.stdout || result.stderr);
      assert(packet.counts.statuses.closed === 1, result.stdout || result.stderr);
      assert(packet.counts.owners["runner-summary"] === 2, result.stdout || result.stderr);
      assert(packet.counts.worktrees.present === 1, result.stdout || result.stderr);
      assert(packet.counts.worktrees.missing === 1, result.stdout || result.stderr);
      assert(packet.counts.prs.withPr === 1, result.stdout || result.stderr);
      assert(packet.counts.prs.withoutPr === 1, result.stdout || result.stderr);
      assert(packet.rows.length === 2, result.stdout || result.stderr);
      assert(packet.rows.some((row) => row.taskId === "active-summary-lane"), result.stdout || result.stderr);
      assert(packet.rowsTruncated === false, result.stdout || result.stderr);
      assert(packet.mutation === "none; summary only", result.stdout || result.stderr);
      assert(readFileSync(activePath, "utf8") === beforeActive, "list summary-json mutated active manifest");
      assert(readFileSync(closedPath, "utf8") === beforeClosed, "list summary-json mutated closed manifest");
    } finally {
      rmSync(summaryStateRoot, { recursive: true, force: true });
    }
  });

  test("list and resume preserve existing main-targeting manifests", () => {
    const legacyStateRoot = mkdtempSync(join(tmpdir(), "codex-legacy-main-manifest-"));
    try {
      const tasksDir = join(legacyStateRoot, "tasks");
      mkdirSync(tasksDir, { recursive: true });
      const manifestPath = join(tasksDir, "legacy-main.json");
      writeFileSync(
        manifestPath,
        `${JSON.stringify({
          task_id: "legacy-main",
          branch: "codex/legacy-main",
          worktree_path: rootDir,
          base_branch: "main",
          base_ref: "origin/main",
          status: "active",
          owner: "runner-a",
        }, null, 2)}\n`,
      );
      const before = readFileSync(manifestPath, "utf8");

      const list = run(["list", "legacy-main", "--state-root", legacyStateRoot]);
      const afterList = readFileSync(manifestPath, "utf8");
      const resume = run(["resume", "legacy-main", "--state-root", legacyStateRoot]);
      const afterResume = readFileSync(manifestPath, "utf8");

      assert(list.code === 0, list.stderr || list.stdout);
      assert(resume.code === 0, resume.stderr || resume.stdout);
      assert(resume.stdout.includes("Base branch: main"), resume.stdout || resume.stderr);
      assert(resume.stdout.includes("Base ref: origin/main"), resume.stdout || resume.stderr);
      assert(before === afterList, "list rewrote a legacy main-targeting manifest");
      assert(before === afterResume, "resume rewrote a legacy main-targeting manifest");
    } finally {
      rmSync(legacyStateRoot, { recursive: true, force: true });
    }
  });

  test("resume json emits a read-only resume packet with owner warning evidence", () => {
    const resumeStateRoot = mkdtempSync(join(tmpdir(), "codex-resume-json-"));
    try {
      const tasksDir = join(resumeStateRoot, "tasks");
      mkdirSync(tasksDir, { recursive: true });
      const manifestPath = join(tasksDir, "resume-json-lane.json");
      writeFileSync(
        manifestPath,
        `${JSON.stringify({
          task_id: "resume-json-lane",
          branch: "codex/resume-json-lane",
          worktree_path: rootDir,
          base_branch: "dev",
          base_ref: "origin/dev",
          status: "active",
          owner: "other-runner",
          pr_url: "https://github.com/slawdawg/Kendall-vnxt/pull/456",
        }, null, 2)}\n`,
      );

      const before = readFileSync(manifestPath, "utf8");
      const result = run(["resume", "resume-json-lane", "--json", "--state-root", resumeStateRoot, "--owner", "runner-a"]);

      assert(result.code === 0, result.stderr || result.stdout);
      assert(!result.stdout.includes("Task:"), "resume --json stdout must not include text output");
      const packet = JSON.parse(result.stdout);
      assert(packet.taskId === "resume-json-lane", result.stdout || result.stderr);
      assert(packet.status === "active", result.stdout || result.stderr);
      assert(packet.branch === "codex/resume-json-lane", result.stdout || result.stderr);
      assert(packet.baseBranch === "dev", result.stdout || result.stderr);
      assert(packet.baseRef === "origin/dev", result.stdout || result.stderr);
      assert(packet.owner === "other-runner", result.stdout || result.stderr);
      assert(packet.currentOwner === "runner-a", result.stdout || result.stderr);
      assert(packet.ownerMatches === false, result.stdout || result.stderr);
      assert(packet.ownerWarning.includes("lane is owned by other-runner"), result.stdout || result.stderr);
      assert(packet.worktreePath === rootDir, result.stdout || result.stderr);
      assert(packet.worktreeExists === true, result.stdout || result.stderr);
      assert(packet.manifestPath === manifestPath, result.stdout || result.stderr);
      assert(packet.prNumber === 456, result.stdout || result.stderr);
      assert(packet.command === `cd "${rootDir}"`, result.stdout || result.stderr);
      assert(packet.mutation === "none; resume only", result.stdout || result.stderr);
      assert(readFileSync(manifestPath, "utf8") === before, "resume --json mutated manifest");
    } finally {
      rmSync(resumeStateRoot, { recursive: true, force: true });
    }
  });

  test("assignment-report classifies safe backlog and workspace ownership without mutation", () => {
    const tasksDir = join(stateRoot, "tasks");
    mkdirSync(tasksDir, { recursive: true });
    seedClosedSafeBacklogManifests(stateRoot);
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
    assert(result.stdout.includes("- safe-backlog-report-alignment | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- verification-surface-hardening | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- github-delivery-hygiene | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- report-catalog-shortcut-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-continuity-snapshot-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- assignment-report-queue-proof-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-queue-state-fixtures-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-queue-handoff-badges-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-queue-handoff-status-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-queue-handoff-lifecycle-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-queue-handoff-recovery-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-queue-handoff-audit-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-queue-handoff-audit-retention-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-queue-handoff-audit-query-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-queue-handoff-audit-export-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-queue-handoff-audit-download-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-queue-handoff-audit-json-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-queue-handoff-audit-json-schema-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-queue-handoff-audit-json-validation-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-queue-handoff-audit-json-validation-fixtures-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-cleanup-assignment-closure-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-cleanup-assignment-report-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-assignment-panel-filter-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-closed-lane-requeue-guard-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-closed-source-guard-report-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-closed-source-guard-drilldown-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-closed-source-guard-rollup-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-closed-source-guard-rollup-filter-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-closed-source-guard-source-kind-summary-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-closed-source-guard-filter-reset-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-closed-source-guard-filter-presets-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-closed-source-guard-filter-counts-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-closed-source-guard-filter-empty-state-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-closed-source-guard-filter-empty-state-reset-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-closed-source-guard-filter-empty-state-shortcuts-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-closed-source-guard-filter-empty-state-shortcut-counts-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-closed-source-guard-filter-empty-state-shortcut-disabled-reasons-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-closed-source-guard-filter-empty-state-shortcut-reason-focus-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-closed-source-guard-filter-empty-state-shortcut-reason-keyboard-loop-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- authority-blocked-work | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- unowned-active | assignable"), result.stdout || result.stderr);
    assert(result.stdout.includes("- current-active | active"), result.stdout || result.stderr);
    assert(result.stdout.includes("- other-active | blocked_owned_active"), result.stdout || result.stderr);
    assert(result.stdout.includes("- stale-active | blocked_stale_owner_needs_takeover"), result.stdout || result.stderr);
    assert(result.stdout.includes("- closed-lane | closed"), result.stdout || result.stderr);
    assert(before === after, "assignment-report mutated a workspace manifest");
  });

  test("assignment-report summary-json emits bounded inventory counts without mutation", () => {
    const reportStateRoot = mkdtempSync(join(tmpdir(), "codex-assignment-summary-json-"));
    try {
      const tasksDir = join(reportStateRoot, "tasks");
      const assignmentsDir = join(reportStateRoot, "assignments");
      mkdirSync(tasksDir, { recursive: true });
      mkdirSync(assignmentsDir, { recursive: true });
      seedClosedSafeBacklogManifests(reportStateRoot);
      const now = new Date().toISOString();
      const stale = new Date(Date.now() - 60_000).toISOString();
      writeFileSync(
        join(tasksDir, "unowned-active.json"),
        `${JSON.stringify(
          {
            task_id: "unowned-active",
            branch: "codex/unowned-active",
            worktree_path: rootDir,
            base_branch: "main",
            status: "active",
          },
          null,
          2,
        )}\n`,
      );
      writeFileSync(
        join(tasksDir, "stale-active.json"),
        `${JSON.stringify(
          {
            task_id: "stale-active",
            branch: "codex/stale-active",
            worktree_path: rootDir,
            base_branch: "main",
            status: "active",
            owner: "runner-b",
            owner_updated_at: stale,
          },
          null,
          2,
        )}\n`,
      );
      writeFileSync(
        join(assignmentsDir, "claimed-assignment.json"),
        `${JSON.stringify(
          {
            assignment_id: "claimed-assignment",
            task_id: "claimed-assignment",
            branch: "codex/claimed-assignment",
            status: "claimed",
            owner: "runner-a",
            last_heartbeat_at: now,
          },
          null,
          2,
        )}\n`,
      );
      const beforeTasks = taskSnapshot(tasksDir);
      const beforeAssignments = taskSnapshot(assignmentsDir);

      const result = run([
        "assignment-report",
        "--summary-json",
        "--owner",
        "runner-a",
        "--stale-after-seconds",
        "1",
        "--state-root",
        reportStateRoot,
      ]);

      assert(result.code === 0, result.stderr || result.stdout);
      const packet = JSON.parse(result.stdout);
      assert(packet.currentOwner === "runner-a", result.stdout || result.stderr);
      assert(packet.staleAfterSeconds === 1, result.stdout || result.stderr);
      assert(packet.counts.backlogCandidates > 0, result.stdout || result.stderr);
      assert(packet.counts.laneAssignments === 1, result.stdout || result.stderr);
      assert(packet.counts.workspaceAssignments >= 2, result.stdout || result.stderr);
      assert(packet.backlogStatusCounts.closed >= 1, result.stdout || result.stderr);
      assert(!packet.backlogStatusCounts.assignable, result.stdout || result.stderr);
      assert(packet.laneAssignmentStatusCounts.claimed === 1, result.stdout || result.stderr);
      assert(packet.workspaceAssignmentStatusCounts.assignable >= 1, result.stdout || result.stderr);
      assert(packet.workspaceAssignmentStatusCounts.blocked_stale_owner_needs_takeover >= 1, result.stdout || result.stderr);
      assert(packet.backlogCandidates.length <= 10, result.stdout || result.stderr);
      assert(packet.laneAssignments.length <= 10, result.stdout || result.stderr);
      assert(packet.workspaceAssignments.length <= 10, result.stdout || result.stderr);
      assert(typeof packet.backlogCandidatesTruncated === "boolean", result.stdout || result.stderr);
      assert(typeof packet.laneAssignmentsTruncated === "boolean", result.stdout || result.stderr);
      assert(typeof packet.workspaceAssignmentsTruncated === "boolean", result.stdout || result.stderr);
      assert(packet.mutation === "none; summary only", result.stdout || result.stderr);
      assert(taskSnapshot(tasksDir) === beforeTasks, "assignment-report summary-json mutated workspace manifests");
      assert(taskSnapshot(assignmentsDir) === beforeAssignments, "assignment-report summary-json mutated assignments");
    } finally {
      rmSync(reportStateRoot, { recursive: true, force: true });
    }
  });

  test("close-assignments dry-run previews completed workspace assignment closeout without mutation", () => {
    const closeoutStateRoot = mkdtempSync(join(tmpdir(), "codex-assignment-closeout-dry-run-"));
    try {
      const tasksDir = join(closeoutStateRoot, "tasks");
      const assignmentsDir = join(closeoutStateRoot, "assignments");
      mkdirSync(tasksDir, { recursive: true });
      mkdirSync(assignmentsDir, { recursive: true });
      writeFileSync(
        join(tasksDir, "closed-audit-lane.json"),
        `${JSON.stringify(
          {
            task_id: "closed-audit-lane",
            branch: "codex/dispatcher-queue-handoff-audit-refresh",
            worktree_path: rootDir,
            base_branch: "dev",
            status: "closed",
            owner: "runner-a",
            source_assignment_id: "dispatcher-queue-handoff-audit-refresh",
          },
          null,
          2,
        )}\n`,
      );
      writeFileSync(
        join(assignmentsDir, "dispatcher-queue-handoff-audit-refresh.json"),
        `${JSON.stringify(
          {
            assignment_id: "dispatcher-queue-handoff-audit-refresh",
            task_id: "closed-audit-lane",
            branch: "codex/dispatcher-queue-handoff-audit-refresh",
            status: "active",
            owner: "runner-a",
            phase: "handoff",
          },
          null,
          2,
        )}\n`,
      );
      const beforeTasks = taskSnapshot(tasksDir);
      const beforeAssignments = taskSnapshot(assignmentsDir);

      const result = run([
        "close-assignments",
        "--ids",
        "dispatcher-queue-handoff-audit-refresh",
        "--owner",
        "runner-a",
        "--state-root",
        closeoutStateRoot,
      ]);

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("DRY RUN: close-assignments"), result.stdout || result.stderr);
      assert(result.stdout.includes("close dispatcher-queue-handoff-audit-refresh"), result.stdout || result.stderr);
      assert(result.stdout.includes("closed workspace evidence closed-audit-lane"), result.stdout || result.stderr);
      assert(taskSnapshot(tasksDir) === beforeTasks, "close-assignments dry-run mutated manifests");
      assert(taskSnapshot(assignmentsDir) === beforeAssignments, "close-assignments dry-run mutated assignments");
    } finally {
      rmSync(closeoutStateRoot, { recursive: true, force: true });
    }
  });

  test("close-assignments summary-json previews closeout without mutation", () => {
    const closeoutStateRoot = mkdtempSync(join(tmpdir(), "codex-assignment-closeout-summary-"));
    try {
      const tasksDir = join(closeoutStateRoot, "tasks");
      const assignmentsDir = join(closeoutStateRoot, "assignments");
      mkdirSync(tasksDir, { recursive: true });
      mkdirSync(assignmentsDir, { recursive: true });
      writeFileSync(
        join(tasksDir, "closed-summary-lane.json"),
        `${JSON.stringify(
          {
            task_id: "closed-summary-lane",
            branch: "codex/dispatcher-queue-handoff-summary-refresh",
            worktree_path: rootDir,
            base_branch: "dev",
            status: "closed",
            owner: "runner-a",
            source_assignment_id: "dispatcher-queue-handoff-summary-refresh",
          },
          null,
          2,
        )}\n`,
      );
      writeFileSync(
        join(assignmentsDir, "dispatcher-queue-handoff-summary-refresh.json"),
        `${JSON.stringify(
          {
            assignment_id: "dispatcher-queue-handoff-summary-refresh",
            task_id: "closed-summary-lane",
            branch: "codex/dispatcher-queue-handoff-summary-refresh",
            status: "active",
            owner: "runner-a",
            phase: "handoff",
          },
          null,
          2,
        )}\n`,
      );
      const beforeTasks = taskSnapshot(tasksDir);
      const beforeAssignments = taskSnapshot(assignmentsDir);

      const result = run([
        "close-assignments",
        "--ids",
        "dispatcher-queue-handoff-summary-refresh",
        "--summary-json",
        "--owner",
        "runner-a",
        "--state-root",
        closeoutStateRoot,
      ]);

      assert(result.code === 0, result.stderr || result.stdout);
      const packet = JSON.parse(result.stdout);
      assert(packet.currentOwner === "runner-a", result.stdout || result.stderr);
      assert(packet.counts.total === 1, result.stdout || result.stderr);
      assert(packet.counts.closeable === 1, result.stdout || result.stderr);
      assert(packet.statusCounts.closeable === 1, result.stdout || result.stderr);
      assert(packet.mutation === "none; summary only", result.stdout || result.stderr);
      const [closeout] = packet.results;
      assert(closeout.assignmentId === "dispatcher-queue-handoff-summary-refresh", result.stdout || result.stderr);
      assert(closeout.status === "closeable", result.stdout || result.stderr);
      assert(closeout.manifestTaskId === "closed-summary-lane", result.stdout || result.stderr);
      assert(closeout.branch === "codex/dispatcher-queue-handoff-summary-refresh", result.stdout || result.stderr);
      assert(closeout.owner === "runner-a", result.stdout || result.stderr);
      assert(taskSnapshot(tasksDir) === beforeTasks, "close-assignments summary-json mutated manifests");
      assert(taskSnapshot(assignmentsDir) === beforeAssignments, "close-assignments summary-json mutated assignments");
    } finally {
      rmSync(closeoutStateRoot, { recursive: true, force: true });
    }
  });

  test("close-assignments apply closes only assignments backed by closed workspace evidence", () => {
    const closeoutStateRoot = mkdtempSync(join(tmpdir(), "codex-assignment-closeout-apply-"));
    try {
      const tasksDir = join(closeoutStateRoot, "tasks");
      const assignmentsDir = join(closeoutStateRoot, "assignments");
      mkdirSync(tasksDir, { recursive: true });
      mkdirSync(assignmentsDir, { recursive: true });
      writeFileSync(
        join(tasksDir, "closed-audit-export-lane.json"),
        `${JSON.stringify(
          {
            task_id: "closed-audit-export-lane",
            branch: "codex/dispatcher-queue-handoff-audit-export-refresh",
            worktree_path: rootDir,
            base_branch: "dev",
            status: "closed",
            owner: "runner-a",
            source_assignment_id: "dispatcher-queue-handoff-audit-export-refresh",
            events: [],
          },
          null,
          2,
        )}\n`,
      );
      writeFileSync(
        join(assignmentsDir, "dispatcher-queue-handoff-audit-export-refresh.json"),
        `${JSON.stringify(
          {
            assignment_id: "dispatcher-queue-handoff-audit-export-refresh",
            task_id: "closed-audit-export-lane",
            branch: "codex/dispatcher-queue-handoff-audit-export-refresh",
            status: "active",
            owner: "runner-a",
            phase: "handoff",
            events: [],
          },
          null,
          2,
        )}\n`,
      );

      const result = run([
        "close-assignments",
        "--ids",
        "dispatcher-queue-handoff-audit-export-refresh",
        "--owner",
        "runner-a",
        "--state-root",
        closeoutStateRoot,
        "--apply",
      ]);

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("APPLY: close-assignments"), result.stdout || result.stderr);
      const assignment = JSON.parse(readFileSync(join(assignmentsDir, "dispatcher-queue-handoff-audit-export-refresh.json"), "utf8"));
      const manifest = JSON.parse(readFileSync(join(tasksDir, "closed-audit-export-lane.json"), "utf8"));
      assert(assignment.status === "closed", JSON.stringify(assignment));
      assert(assignment.phase === "closed", JSON.stringify(assignment));
      assert(assignment.current_command === null, JSON.stringify(assignment));
      assert(assignment.last_result === "closed from completed workspace closed-audit-export-lane", JSON.stringify(assignment));
      assert(typeof assignment.closed_at === "string", JSON.stringify(assignment));
      assert(manifest.source_assignment_closed_at === assignment.closed_at, JSON.stringify(manifest));
      assert(manifest.events.some((event) => event.type === "assignment_closed"), JSON.stringify(manifest));
    } finally {
      rmSync(closeoutStateRoot, { recursive: true, force: true });
    }
  });

  test("close-assignments dry-run previews queue UI handoff closeouts as one batch", () => {
    const closeoutStateRoot = mkdtempSync(join(tmpdir(), "codex-assignment-closeout-queue-ui-"));
    try {
      const tasksDir = join(closeoutStateRoot, "tasks");
      const assignmentsDir = join(closeoutStateRoot, "assignments");
      mkdirSync(tasksDir, { recursive: true });
      mkdirSync(assignmentsDir, { recursive: true });
      const lanes = [
        "dispatcher-queue-handoff-badges-refresh",
        "dispatcher-queue-handoff-status-refresh",
        "dispatcher-queue-handoff-lifecycle-refresh",
        "dispatcher-queue-handoff-recovery-refresh",
      ];
      for (const lane of lanes) {
        writeFileSync(
          join(tasksDir, `${lane}.json`),
          `${JSON.stringify(
            {
              task_id: lane,
              branch: `codex/${lane}`,
              worktree_path: rootDir,
              base_branch: "dev",
              status: "closed",
              owner: "runner-a",
              source_assignment_id: lane,
            },
            null,
            2,
          )}\n`,
        );
        writeFileSync(
          join(assignmentsDir, `${lane}.json`),
          `${JSON.stringify(
            {
              assignment_id: lane,
              task_id: lane,
              branch: `codex/${lane}`,
              status: "active",
              owner: "runner-a",
              phase: "handoff",
            },
            null,
            2,
          )}\n`,
        );
      }
      const beforeTasks = taskSnapshot(tasksDir);
      const beforeAssignments = taskSnapshot(assignmentsDir);

      const result = run([
        "close-assignments",
        "--ids",
        lanes.join(","),
        "--owner",
        "runner-a",
        "--state-root",
        closeoutStateRoot,
      ]);

      assert(result.code === 0, result.stderr || result.stdout);
      for (const lane of lanes) {
        assert(result.stdout.includes(`close ${lane}`), result.stdout || result.stderr);
        assert(result.stdout.includes(`closed workspace evidence ${lane}`), result.stdout || result.stderr);
      }
      assert(taskSnapshot(tasksDir) === beforeTasks, "queue UI closeout dry-run mutated manifests");
      assert(taskSnapshot(assignmentsDir) === beforeAssignments, "queue UI closeout dry-run mutated assignments");
    } finally {
      rmSync(closeoutStateRoot, { recursive: true, force: true });
    }
  });

  test("close-assignments dry-run previews delivery support closeouts as one batch", () => {
    const closeoutStateRoot = mkdtempSync(join(tmpdir(), "codex-assignment-closeout-delivery-support-"));
    try {
      const tasksDir = join(closeoutStateRoot, "tasks");
      const assignmentsDir = join(closeoutStateRoot, "assignments");
      mkdirSync(tasksDir, { recursive: true });
      mkdirSync(assignmentsDir, { recursive: true });
      const lanes = [
        "assignment-report-queue-proof-refresh",
        "dispatcher-continuity-snapshot-refresh",
        "report-catalog-shortcut-refresh",
        "worker-backlog-queue-refresh",
        "dispatcher-queue-state-fixtures-refresh",
        "lane-handoff-evidence-refresh",
      ];
      for (const lane of lanes) {
        writeFileSync(
          join(tasksDir, `${lane}.json`),
          `${JSON.stringify(
            {
              task_id: lane,
              branch: `codex/${lane}`,
              worktree_path: rootDir,
              base_branch: "dev",
              status: "closed",
              owner: "runner-a",
              source_assignment_id: lane,
            },
            null,
            2,
          )}\n`,
        );
        writeFileSync(
          join(assignmentsDir, `${lane}.json`),
          `${JSON.stringify(
            {
              assignment_id: lane,
              task_id: lane,
              branch: `codex/${lane}`,
              status: "active",
              owner: "runner-a",
              phase: "handoff",
            },
            null,
            2,
          )}\n`,
        );
      }
      const beforeTasks = taskSnapshot(tasksDir);
      const beforeAssignments = taskSnapshot(assignmentsDir);

      const result = run([
        "close-assignments",
        "--ids",
        lanes.join(","),
        "--owner",
        "runner-a",
        "--state-root",
        closeoutStateRoot,
      ]);

      assert(result.code === 0, result.stderr || result.stdout);
      for (const lane of lanes) {
        assert(result.stdout.includes(`close ${lane}`), result.stdout || result.stderr);
        assert(result.stdout.includes(`closed workspace evidence ${lane}`), result.stdout || result.stderr);
      }
      assert(taskSnapshot(tasksDir) === beforeTasks, "delivery support closeout dry-run mutated manifests");
      assert(taskSnapshot(assignmentsDir) === beforeAssignments, "delivery support closeout dry-run mutated assignments");
    } finally {
      rmSync(closeoutStateRoot, { recursive: true, force: true });
    }
  });

  test("close-assignments apply fails closed on owner mismatch", () => {
    const closeoutStateRoot = mkdtempSync(join(tmpdir(), "codex-assignment-closeout-owner-"));
    try {
      const tasksDir = join(closeoutStateRoot, "tasks");
      const assignmentsDir = join(closeoutStateRoot, "assignments");
      mkdirSync(tasksDir, { recursive: true });
      mkdirSync(assignmentsDir, { recursive: true });
      writeFileSync(
        join(tasksDir, "closed-audit-json-lane.json"),
        `${JSON.stringify(
          {
            task_id: "closed-audit-json-lane",
            branch: "codex/dispatcher-queue-handoff-audit-json-refresh",
            worktree_path: rootDir,
            base_branch: "dev",
            status: "closed",
            owner: "runner-b",
            source_assignment_id: "dispatcher-queue-handoff-audit-json-refresh",
          },
          null,
          2,
        )}\n`,
      );
      writeFileSync(
        join(assignmentsDir, "dispatcher-queue-handoff-audit-json-refresh.json"),
        `${JSON.stringify(
          {
            assignment_id: "dispatcher-queue-handoff-audit-json-refresh",
            task_id: "closed-audit-json-lane",
            branch: "codex/dispatcher-queue-handoff-audit-json-refresh",
            status: "active",
            owner: "runner-b",
            phase: "handoff",
          },
          null,
          2,
        )}\n`,
      );
      const beforeAssignments = taskSnapshot(assignmentsDir);

      const result = run([
        "close-assignments",
        "--ids",
        "dispatcher-queue-handoff-audit-json-refresh",
        "--owner",
        "runner-a",
        "--state-root",
        closeoutStateRoot,
        "--apply",
      ]);

      assert(result.code !== 0, result.stdout || result.stderr);
      assert(result.stderr.includes("Refusing to close blocked assignments"), result.stdout || result.stderr);
      assert(taskSnapshot(assignmentsDir) === beforeAssignments, "owner mismatch closeout mutated assignments");
    } finally {
      rmSync(closeoutStateRoot, { recursive: true, force: true });
    }
  });

  test("claim-next dry-run previews the next safe backlog lane without mutation", () => {
    const tasksDir = join(stateRoot, "tasks");
    mkdirSync(tasksDir, { recursive: true });
    seedGeneratedSuccessorPrerequisites(stateRoot);
    const before = taskSnapshot(tasksDir);

    const result = run(["claim-next", "--dry-run", "--owner", "runner-a", "--state-root", stateRoot]);
    const after = taskSnapshot(tasksDir);

    assert(result.code === 0, result.stderr || result.stdout);
    assert(result.stdout.includes("DRY RUN: claim-next"), result.stdout || result.stderr);
    assert(result.stdout.includes("no claimable safe backlog lane found"), result.stdout || result.stderr);
    assert(result.stdout.includes("preview only; no manifest, branch, PR, or worktree mutation"), result.stdout || result.stderr);
    assert(result.stdout.includes("- dispatcher-closed-source-guard-filter-empty-state-shortcut-reason-keyboard-loop-refresh | closed"), result.stdout || result.stderr);
    assert(result.stdout.includes("- authority-blocked-work | closed"), result.stdout || result.stderr);
    assert(before === after, "claim-next --dry-run mutated workspace manifests");
  });

  test("claim-next summary-json previews a bounded queue summary without mutation", () => {
    const claimStateRoot = mkdtempSync(join(tmpdir(), "codex-claim-next-summary-json-"));
    try {
      const tasksDir = join(claimStateRoot, "tasks");
      mkdirSync(tasksDir, { recursive: true });
      const lowerPriority = {
        slug: "read-only-evidence-polish",
        title: "read only evidence polish",
        branch: "codex/read-only-evidence-polish",
      };
      seedGeneratedSuccessorPrerequisites(claimStateRoot);
      seedClosedSourceCompletion(claimStateRoot, lowerPriority);
      if (branchExists(rootDir, lowerPriority.branch)) {
        seedUnownedSafeBacklogWorkspace(claimStateRoot, lowerPriority.slug);
      }
      const before = taskSnapshot(tasksDir);

      const result = run(["claim-next", "--dry-run", "--summary-json", "--owner", "runner-a", "--state-root", claimStateRoot]);
      const after = taskSnapshot(tasksDir);

      assert(result.code === 0, result.stderr || result.stdout);
      const packet = JSON.parse(result.stdout);
      assert(packet.currentOwner === "runner-a", result.stdout || result.stderr);
      assert(packet.selected === null, result.stdout || result.stderr);
      assert(packet.counts.total > 0, result.stdout || result.stderr);
      assert(packet.counts.claimable === 0, result.stdout || result.stderr);
      assert(packet.counts.excluded >= 1, result.stdout || result.stderr);
      assert(packet.counts.sourceDrift === 0, result.stdout || result.stderr);
      assert(packet.nextActionSummary.action === "reconcile source drift or add a ready lane", result.stdout || result.stderr);
      assert(packet.nextActionSummary.sourceDrift === 0, result.stdout || result.stderr);
      assert(!packet.statusCounts.assignable, result.stdout || result.stderr);
      assert(!packet.blockerStatusCounts.closed, result.stdout || result.stderr);
      assert(packet.excludedStatusCounts.closed >= 1, result.stdout || result.stderr);
      assert(packet.blockers.length <= 10, result.stdout || result.stderr);
      assert(typeof packet.blockersTruncated === "boolean", result.stdout || result.stderr);
      assert(packet.excluded.length <= 10, result.stdout || result.stderr);
      assert(typeof packet.excludedTruncated === "boolean", result.stdout || result.stderr);
      assert(packet.sourceDrift.length <= 10, result.stdout || result.stderr);
      assert(packet.sourceDrift.length === 0, result.stdout || result.stderr);
      assert(typeof packet.sourceDriftTruncated === "boolean", result.stdout || result.stderr);
      assert(packet.mutation === "none; dry-run summary only", result.stdout || result.stderr);
      assert(before === after, "claim-next --summary-json mutated workspace manifests");
    } finally {
      rmSync(claimStateRoot, { recursive: true, force: true });
    }
  });

  test("claim-next reports no fallback generated lane after completed keyboard loop closeout", () => {
    const queueStateRoot = mkdtempSync(join(tmpdir(), "codex-claim-next-generated-queue-"));
    try {
      const assignmentsDir = join(queueStateRoot, "assignments");
      mkdirSync(assignmentsDir, { recursive: true });
      for (const laneSlug of [
        "verification-surface-hardening",
        "github-delivery-hygiene",
        "read-only-evidence-polish",
        "authority-blocked-work",
      ]) {
        const branch = laneSlug === "authority-blocked-work" ? "codex/authority-blocked-approval-scope-readiness" : `codex/${laneSlug}`;
        writeFileSync(
          join(assignmentsDir, `${laneSlug}.json`),
          `${JSON.stringify({
            assignment_id: laneSlug,
            task_id: laneSlug,
            lane_slug: laneSlug,
            branch,
            status: "claimed",
            owner: "runner-b",
            last_heartbeat_at: new Date().toISOString(),
          })}\n`,
        );
      }
      const before = taskSnapshot(assignmentsDir);

      const result = run(["claim-next", "--dry-run", "--owner", "runner-a", "--state-root", queueStateRoot]);
      const after = taskSnapshot(assignmentsDir);

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("no claimable safe backlog lane found"), result.stdout || result.stderr);
      assert(result.stdout.includes("claimable=0 blocked=0 excluded=43 sourceDrift=0"), result.stdout || result.stderr);
      assert(result.stdout.includes("- authority-blocked-work | closed"), result.stdout || result.stderr);
      assert(result.stdout.includes("- dispatcher-closed-source-guard-filter-empty-state-shortcut-reason-keyboard-loop-refresh | closed"), result.stdout || result.stderr);
      assert(!result.stdout.includes("claim candidate worker-backlog-queue-refresh"), result.stdout || result.stderr);
      assert(result.stdout.includes("- worker-backlog-queue-refresh | closed"), result.stdout || result.stderr);
      assert(result.stdout.includes("- lane-handoff-evidence-refresh | closed"), result.stdout || result.stderr);
      assert(result.stdout.includes("- report-catalog-shortcut-refresh | closed"), result.stdout || result.stderr);
      assert(result.stdout.includes("- dispatcher-continuity-snapshot-refresh | closed"), result.stdout || result.stderr);
      assert(result.stdout.includes("- assignment-report-queue-proof-refresh | closed"), result.stdout || result.stderr);
      assert(result.stdout.includes("- dispatcher-queue-state-fixtures-refresh | closed"), result.stdout || result.stderr);
      assert(result.stdout.includes("- dispatcher-queue-handoff-badges-refresh | closed"), result.stdout || result.stderr);
      assert(result.stdout.includes("- dispatcher-queue-handoff-status-refresh | closed"), result.stdout || result.stderr);
      assert(result.stdout.includes("- dispatcher-queue-handoff-lifecycle-refresh | closed"), result.stdout || result.stderr);
      assert(result.stdout.includes("- dispatcher-queue-handoff-recovery-refresh | closed"), result.stdout || result.stderr);
      assert(result.stdout.includes("- dispatcher-queue-handoff-audit-refresh | closed"), result.stdout || result.stderr);
      assert(result.stdout.includes("- dispatcher-queue-handoff-audit-retention-refresh | closed"), result.stdout || result.stderr);
      assert(result.stdout.includes("- dispatcher-queue-handoff-audit-query-refresh | closed"), result.stdout || result.stderr);
      assert(result.stdout.includes("- dispatcher-queue-handoff-audit-export-refresh | closed"), result.stdout || result.stderr);
      assert(result.stdout.includes("- dispatcher-queue-handoff-audit-download-refresh | closed"), result.stdout || result.stderr);
      assert(result.stdout.includes("- dispatcher-assignment-panel-filter-refresh | closed"), result.stdout || result.stderr);
      assert(result.stdout.includes("- dispatcher-closed-lane-requeue-guard-refresh | closed"), result.stdout || result.stderr);
      assert(before === after, "generated queue dry-run mutated assignment metadata");
    } finally {
      rmSync(queueStateRoot, { recursive: true, force: true });
    }
  });

  test("closed source completion evidence prevents ready backlog requeue", () => {
    const queueStateRoot = mkdtempSync(join(tmpdir(), "codex-closed-source-requeue-guard-"));
    try {
      const expected = expectedClaimCandidate();
      const tasksDir = join(queueStateRoot, "tasks");
      const assignmentsDir = join(queueStateRoot, "assignments");
      seedGeneratedSuccessorPrerequisites(queueStateRoot);
      seedClosedSourceCompletion(queueStateRoot, expected);
      const beforeTasks = taskSnapshot(tasksDir);
      const beforeAssignments = taskSnapshot(assignmentsDir);

      const report = run(["assignment-report", "--owner", "runner-a", "--state-root", queueStateRoot]);
      const claim = run(["claim-next", "--dry-run", "--owner", "runner-a", "--state-root", queueStateRoot]);
      const dispatch = run(["dispatch-next", "--dry-run", "--owner", "runner-a", "--state-root", queueStateRoot]);
      const dispatchSummary = run(["dispatch-next", "--dry-run", "--summary-json", "--owner", "runner-a", "--state-root", queueStateRoot]);

      assert(report.code === 0, report.stderr || report.stdout);
      assert(report.stdout.includes(`- ${expected.slug} | closed`), report.stdout || report.stderr);
      assert(report.stdout.includes("reason=safe backlog item is already complete and must not be requeued"), report.stdout || report.stderr);
      assert(claim.code === 0, claim.stderr || claim.stdout);
      assert(claim.stdout.includes("no claimable safe backlog lane found"), claim.stdout || claim.stderr);
      assert(claim.stdout.includes(`- ${expected.slug} | closed`), claim.stdout || claim.stderr);
      assert(dispatch.code === 0, dispatch.stderr || dispatch.stdout);
      assert(dispatch.stdout.includes("- selected lane none"), dispatch.stdout || dispatch.stderr);
      assert(dispatch.stdout.includes("- allowed false"), dispatch.stdout || dispatch.stderr);
      assert(dispatch.stdout.includes(`- ${expected.slug} | closed`), dispatch.stdout || dispatch.stderr);
      assert(dispatchSummary.code === 0, dispatchSummary.stderr || dispatchSummary.stdout);
      const packet = JSON.parse(dispatchSummary.stdout);
      assert(packet.dispatch.allowed === false, dispatchSummary.stdout);
      assert(packet.dispatch.selectedLane === null, dispatchSummary.stdout);
      assert(beforeTasks === taskSnapshot(tasksDir), "closed source guard dry-runs mutated task manifests");
      assert(beforeAssignments === taskSnapshot(assignmentsDir), "closed source guard dry-runs mutated assignments");
    } finally {
      rmSync(queueStateRoot, { recursive: true, force: true });
    }
  });

  test("claim-next and dispatch-next report no generated lane after completed authority and keyboard-loop lanes", () => {
    const queueStateRoot = mkdtempSync(join(tmpdir(), "codex-priority-lane-selection-"));
    try {
      const completedKeyboardLoop = expectedClaimCandidate();
      const completedAuthority = expectedAuthorityClaimCandidate();
      const tasksDir = join(queueStateRoot, "tasks");
      const assignmentsDir = join(queueStateRoot, "assignments");
      seedGeneratedSuccessorPrerequisites(queueStateRoot);
      const beforeTasks = taskSnapshot(tasksDir);
      const beforeAssignments = taskSnapshot(assignmentsDir);

      const claim = run(["claim-next", "--dry-run", "--owner", "runner-a", "--state-root", queueStateRoot]);
      const dispatch = run(["dispatch-next", "--dry-run", "--owner", "runner-a", "--state-root", queueStateRoot]);

      assert(claim.code === 0, claim.stderr || claim.stdout);
      assert(claim.stdout.includes("no claimable safe backlog lane found"), claim.stdout || claim.stderr);
      assert(claim.stdout.includes(`- ${completedKeyboardLoop.slug} | closed`), claim.stdout || claim.stderr);
      assert(claim.stdout.includes(`- ${completedAuthority.slug} | closed`), claim.stdout || claim.stderr);
      assert(dispatch.code === 0, dispatch.stderr || dispatch.stdout);
      assert(dispatch.stdout.includes("- selected lane none"), dispatch.stdout || dispatch.stderr);
      assert(dispatch.stdout.includes("- allowed false"), dispatch.stdout || dispatch.stderr);
      assert(dispatch.stdout.includes(`- ${completedKeyboardLoop.slug} | closed`), dispatch.stdout || dispatch.stderr);
      assert(dispatch.stdout.includes(`- ${completedAuthority.slug} | closed`), dispatch.stdout || dispatch.stderr);
      assert(beforeTasks === taskSnapshot(tasksDir), "priority selection dry-runs mutated task manifests");
      assert(beforeAssignments === taskSnapshot(assignmentsDir), "priority selection dry-runs mutated assignments");
    } finally {
      rmSync(queueStateRoot, { recursive: true, force: true });
    }
  });

  test("claim-next and dispatch-next do not refresh an already-owned closed source lane", () => {
    const queueStateRoot = mkdtempSync(join(tmpdir(), "codex-owned-lane-priority-selection-"));
    try {
      const owned = expectedClaimCandidate();
      const completedAuthority = expectedAuthorityClaimCandidate();
      const tasksDir = join(queueStateRoot, "tasks");
      const assignmentsDir = join(queueStateRoot, "assignments");
      seedGeneratedSuccessorPrerequisites(queueStateRoot);
      seedClaimedSafeBacklogAssignment(queueStateRoot, owned.slug, "runner-a", owned.branch);
      const beforeTasks = taskSnapshot(tasksDir);
      const beforeAssignments = taskSnapshot(assignmentsDir);

      const claim = run(["claim-next", "--dry-run", "--owner", "runner-a", "--state-root", queueStateRoot]);
      const dispatch = run(["dispatch-next", "--dry-run", "--owner", "runner-a", "--state-root", queueStateRoot]);

      assert(claim.code === 0, claim.stderr || claim.stdout);
      assert(claim.stdout.includes("no claimable safe backlog lane found"), claim.stdout || claim.stderr);
      assert(claim.stdout.includes(`- ${owned.slug} | closed`), claim.stdout || claim.stderr);
      assert(claim.stdout.includes(`- ${completedAuthority.slug} | closed`), claim.stdout || claim.stderr);
      assert(dispatch.code === 0, dispatch.stderr || dispatch.stdout);
      assert(dispatch.stdout.includes("- selected lane none"), dispatch.stdout || dispatch.stderr);
      assert(dispatch.stdout.includes(`- ${owned.slug} | closed`), dispatch.stdout || dispatch.stderr);
      assert(dispatch.stdout.includes(`- ${completedAuthority.slug} | closed`), dispatch.stdout || dispatch.stderr);
      assert(beforeTasks === taskSnapshot(tasksDir), "owned lane priority dry-runs mutated task manifests");
      assert(beforeAssignments === taskSnapshot(assignmentsDir), "owned lane priority dry-runs mutated assignments");
    } finally {
      rmSync(queueStateRoot, { recursive: true, force: true });
    }
  });

  test("dispatch-next dry-run surfaces delivery-first next action guidance", () => {
    const queueStateRoot = mkdtempSync(join(tmpdir(), "codex-dispatch-delivery-guidance-"));
    try {
      const expected = expectedClaimCandidate();
      seedGeneratedSuccessorPrerequisites(queueStateRoot);
      seedOpenDeliveryManifest(queueStateRoot, expected);
      const tasksDir = join(queueStateRoot, "tasks");
      const assignmentsDir = join(queueStateRoot, "assignments");
      const beforeTasks = taskSnapshot(tasksDir);
      const beforeAssignments = taskSnapshot(assignmentsDir);

      const result = run(["dispatch-next", "--dry-run", "--owner", "runner-a", "--state-root", queueStateRoot]);

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("DRY RUN: dispatch-next"), result.stdout || result.stderr);
      assert(result.stdout.includes("- selected lane none"), result.stdout || result.stderr);
      assert(result.stdout.includes("- queue states "), result.stdout || result.stderr);
      assert(result.stdout.includes("closed="), result.stdout || result.stderr);
      assert(result.stdout.includes("delivery=1"), result.stdout || result.stderr);
      assert(
        result.stdout.includes(
          "- next action guidance finish open delivery lanes first: verify PR checks, review threads, exact head, merge evidence, then run merged-lane cleanup",
        ),
        result.stdout || result.stderr,
      );
      assert(result.stdout.includes("- blocker no dispatchable safe backlog lane found"), result.stdout || result.stderr);
      assert(result.stdout.includes(`- ${expected.slug} | closed`), result.stdout || result.stderr);
      assert(beforeTasks === taskSnapshot(tasksDir), "delivery guidance dry-run mutated task manifests");
      assert(beforeAssignments === taskSnapshot(assignmentsDir), "delivery guidance dry-run mutated assignments");
    } finally {
      rmSync(queueStateRoot, { recursive: true, force: true });
    }
  });

  test("dispatch-next dry-run blocks on open delivery work outside backlog candidates", () => {
    const queueStateRoot = mkdtempSync(join(tmpdir(), "codex-dispatch-external-delivery-guidance-"));
    try {
      const unrelatedDelivery = {
        slug: "manual-delivery-lane",
        title: "manual delivery lane",
        branch: "codex/manual-delivery-lane",
      };
      seedGeneratedSuccessorPrerequisites(queueStateRoot);
      seedOpenDeliveryManifest(queueStateRoot, unrelatedDelivery);
      const tasksDir = join(queueStateRoot, "tasks");
      const assignmentsDir = join(queueStateRoot, "assignments");
      const beforeTasks = taskSnapshot(tasksDir);
      const beforeAssignments = taskSnapshot(assignmentsDir);

      const result = run(["dispatch-next", "--dry-run", "--summary-json", "--owner", "runner-a", "--state-root", queueStateRoot]);

      assert(result.code === 0, result.stderr || result.stdout);
      const packet = JSON.parse(result.stdout);
      assert(packet.dispatch.allowed === false, result.stdout);
      assert(packet.dispatch.selectedLane === null, result.stdout);
      assert(packet.candidateStateCounts.delivery === 1, result.stdout);
      assert(
        packet.dispatch.nextActionGuidance ===
          "finish open delivery lanes first: verify PR checks, review threads, exact head, merge evidence, then run merged-lane cleanup",
        result.stdout,
      );
      assert(beforeTasks === taskSnapshot(tasksDir), "external delivery dry-run mutated task manifests");
      assert(beforeAssignments === taskSnapshot(assignmentsDir), "external delivery dry-run mutated assignments");
    } finally {
      rmSync(queueStateRoot, { recursive: true, force: true });
    }
  });

  test("dispatch-next dry-run blocks on open delivery work owned by another runner", () => {
    const queueStateRoot = mkdtempSync(join(tmpdir(), "codex-dispatch-owned-delivery-guidance-"));
    try {
      const expected = expectedClaimCandidate();
      seedGeneratedSuccessorPrerequisites(queueStateRoot);
      seedOpenDeliveryManifest(queueStateRoot, { ...expected, owner: "runner-b" });
      const tasksDir = join(queueStateRoot, "tasks");
      const assignmentsDir = join(queueStateRoot, "assignments");
      const beforeTasks = taskSnapshot(tasksDir);
      const beforeAssignments = taskSnapshot(assignmentsDir);

      const result = run(["dispatch-next", "--dry-run", "--summary-json", "--owner", "runner-a", "--state-root", queueStateRoot]);

      assert(result.code === 0, result.stderr || result.stdout);
      const packet = JSON.parse(result.stdout);
      assert(packet.dispatch.allowed === false, result.stdout);
      assert(packet.dispatch.selectedLane === null, result.stdout);
      assert(packet.candidateStateCounts.delivery === 1, result.stdout);
      assert(packet.candidateStateCounts.closed >= 1, result.stdout);
      assert(
        packet.dispatch.nextActionGuidance ===
          "finish open delivery lanes first: verify PR checks, review threads, exact head, merge evidence, then run merged-lane cleanup",
        result.stdout,
      );
      assert(beforeTasks === taskSnapshot(tasksDir), "owned delivery dry-run mutated task manifests");
      assert(beforeAssignments === taskSnapshot(assignmentsDir), "owned delivery dry-run mutated assignments");
    } finally {
      rmSync(queueStateRoot, { recursive: true, force: true });
    }
  });

  test("claim-next apply fails closed when no generated safe backlog lane is claimable", () => {
    const claimStateRoot = mkdtempSync(join(tmpdir(), "codex-claim-next-apply-"));
    try {
      const tasksDir = join(claimStateRoot, "tasks");
      const assignmentsDir = join(claimStateRoot, "assignments");
      seedGeneratedSuccessorPrerequisites(claimStateRoot);
      const beforeTasks = taskSnapshot(tasksDir);
      const beforeAssignments = taskSnapshot(assignmentsDir);

      const result = run(["claim-next", "--apply", "--owner", "runner-a", "--state-root", claimStateRoot]);

      assert(result.code !== 0, "claim-next --apply unexpectedly claimed a closed generated lane");
      assert(result.stderr.includes("No claimable safe backlog lane found"), result.stderr || result.stdout);
      assert(!existsSync(join(claimStateRoot, "worktrees")), "claim-next --apply created worktrees");
      assert(taskSnapshot(tasksDir) === beforeTasks, "failed claim-next --apply mutated workspace task manifests");
      assert(taskSnapshot(assignmentsDir) === beforeAssignments, "failed claim-next --apply mutated assignments");
    } finally {
      rmSync(claimStateRoot, { recursive: true, force: true });
    }
  });

  test("claim-next apply remains fail-closed when no generated lane is claimable", () => {
    const claimStateRoot = mkdtempSync(join(tmpdir(), "codex-claim-next-idempotent-"));
    try {
      seedGeneratedSuccessorPrerequisites(claimStateRoot);
      const assignmentsDir = join(claimStateRoot, "assignments");
      const beforeAssignments = taskSnapshot(assignmentsDir);
      const first = run(["claim-next", "--apply", "--owner", "runner-a", "--state-root", claimStateRoot]);
      assert(first.code !== 0, "first claim-next --apply unexpectedly claimed a closed generated lane");
      assert(first.stderr.includes("No claimable safe backlog lane found"), first.stderr || first.stdout);
      const second = run(["claim-next", "--apply", "--owner", "runner-a", "--state-root", claimStateRoot]);
      assert(second.code !== 0, "second claim-next --apply unexpectedly claimed a closed generated lane");
      assert(second.stderr.includes("No claimable safe backlog lane found"), second.stderr || second.stdout);
      assert(taskSnapshot(assignmentsDir) === beforeAssignments, "failed idempotent apply mutated assignments");
    } finally {
      rmSync(claimStateRoot, { recursive: true, force: true });
    }
  });

  test("assignment-report classifies claimed closed-source lane assignment as closed", () => {
    const claimStateRoot = mkdtempSync(join(tmpdir(), "codex-assignment-report-claimed-"));
    try {
      const expected = expectedClaimCandidate();
      seedGeneratedSuccessorPrerequisites(claimStateRoot);
      seedClaimedSafeBacklogAssignment(claimStateRoot, expected.slug, "runner-a", expected.branch);

      const report = run(["assignment-report", "--owner", "runner-a", "--state-root", claimStateRoot]);

      assert(report.code === 0, report.stderr || report.stdout);
      assert(report.stdout.includes(`- ${expected.slug} | closed`), report.stdout || report.stderr);
      assert(
        report.stdout.includes(
          `- ${expected.slug} | claimed | owner=runner-a | branch=${expected.branch}`,
        ),
        report.stdout || report.stderr,
      );
      assert(report.stdout.includes("reason=safe backlog item is already complete and must not be requeued"), report.stdout || report.stderr);
      assert(report.stdout.includes("reason=assignment is owned by current runner"), report.stdout || report.stderr);
    } finally {
      rmSync(claimStateRoot, { recursive: true, force: true });
    }
  });

  test("heartbeat updates current-owner assignment lease evidence", () => {
    const claimStateRoot = mkdtempSync(join(tmpdir(), "codex-heartbeat-assignment-"));
    try {
      const expected = expectedClaimCandidate();
      seedGeneratedSuccessorPrerequisites(claimStateRoot);
      seedClaimedSafeBacklogAssignment(claimStateRoot, expected.slug, "runner-a", expected.branch);
      const tasksDir = join(claimStateRoot, "tasks");
      const beforeTasks = taskSnapshot(tasksDir);

      const result = run([
        "heartbeat",
        expected.slug,
        "--owner",
        "runner-a",
        "--phase",
        "active",
        "--current-command",
        "pnpm run check:static",
        "--last-result",
        "running",
        "--stale-after-seconds",
        "60",
        "--state-root",
        claimStateRoot,
      ]);

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("APPLY: heartbeat"), result.stdout || result.stderr);
      assert(result.stdout.includes(`target assignment ${expected.slug}`), result.stdout || result.stderr);
      assert(
        result.stdout.includes("heartbeat metadata only; no branch, PR, cleanup, or ownership mutation"),
        result.stdout || result.stderr,
      );
      assert(taskSnapshot(tasksDir) === beforeTasks, "assignment heartbeat mutated workspace manifests");
      assert(!existsSync(join(claimStateRoot, "worktrees")), "assignment heartbeat created worktrees");

      const assignmentPath = join(claimStateRoot, "assignments", `${expected.slug}.json`);
      const assignment = JSON.parse(readFileSync(assignmentPath, "utf8"));
      assert(assignment.status === "claimed", "heartbeat should not change assignment status");
      assert(assignment.owner === "runner-a", "heartbeat changed assignment owner");
      assert(assignment.phase === "active", "heartbeat phase missing");
      assert(assignment.runner_kind === "codex-cli", "heartbeat runner kind missing");
      assert(assignment.current_command === "pnpm run check:static", "heartbeat current command missing");
      assert(assignment.last_result === "running", "heartbeat last result missing");
      assert(assignment.stale_after_seconds === 60, "heartbeat stale threshold missing");
      assert(assignment.heartbeat_count === 1, "heartbeat count missing");
      assert(Boolean(assignment.last_heartbeat_at), "last heartbeat timestamp missing");
      assert(assignment.events.some((event) => event.type === "heartbeat"), "heartbeat event missing");

      const second = run([
        "heartbeat",
        expected.slug,
        "--owner",
        "runner-a",
        "--phase",
        "verification",
        "--state-root",
        claimStateRoot,
      ]);
      assert(second.code === 0, second.stderr || second.stdout);
      const refreshed = JSON.parse(readFileSync(assignmentPath, "utf8"));
      assert(refreshed.phase === "verification", "second heartbeat phase missing");
      assert(refreshed.current_command === "pnpm run check:static", "phase-only heartbeat erased current command");
      assert(refreshed.last_result === "running", "phase-only heartbeat erased last result");
      assert(refreshed.heartbeat_count === 2, "second heartbeat did not increment count");

      const report = run(["assignment-report", "--owner", "runner-a", "--state-root", claimStateRoot]);
      assert(report.code === 0, report.stderr || report.stdout);
      assert(report.stdout.includes("phase=verification"), report.stdout || report.stderr);
      assert(report.stdout.includes("runner=codex-cli"), report.stdout || report.stderr);
      const assignmentLine = report.stdout
        .split("\n")
        .find((line) => line.startsWith(`- ${expected.slug} | claimed | owner=runner-a`));
      assert(assignmentLine && !assignmentLine.includes("heartbeat=none"), report.stdout || report.stderr);
    } finally {
      rmSync(claimStateRoot, { recursive: true, force: true });
    }
  });

  test("heartbeat json emits written assignment lease evidence", () => {
    const claimStateRoot = mkdtempSync(join(tmpdir(), "codex-heartbeat-assignment-json-"));
    try {
      const expected = expectedClaimCandidate();
      seedClaimedSafeBacklogAssignment(claimStateRoot, expected.slug, "runner-a");
      const tasksDir = join(claimStateRoot, "tasks");
      const beforeTasks = taskSnapshot(tasksDir);

      const result = run([
        "heartbeat",
        expected.slug,
        "--json",
        "--owner",
        "runner-a",
        "--phase",
        "verification",
        "--runner-kind",
        "codex-cli",
        "--current-command",
        "pnpm run check",
        "--last-result",
        "running",
        "--stale-after-seconds",
        "120",
        "--state-root",
        claimStateRoot,
      ]);

      assert(result.code === 0, result.stderr || result.stdout);
      assert(!result.stdout.includes("APPLY:"), "heartbeat --json stdout must not include text output");
      const packet = JSON.parse(result.stdout);
      assert(packet.targetKind === "assignment", result.stdout || result.stderr);
      assert(packet.target === expected.slug, result.stdout || result.stderr);
      assert(packet.owner === "runner-a", result.stdout || result.stderr);
      assert(packet.currentOwner === "runner-a", result.stdout || result.stderr);
      assert(packet.ownerMatches === true, result.stdout || result.stderr);
      assert(packet.status === "claimed", result.stdout || result.stderr);
      assert(packet.branch === expected.branch, result.stdout || result.stderr);
      assert(packet.phase === "verification", result.stdout || result.stderr);
      assert(packet.runnerKind === "codex-cli", result.stdout || result.stderr);
      assert(packet.currentCommand === "pnpm run check", result.stdout || result.stderr);
      assert(packet.lastResult === "running", result.stdout || result.stderr);
      assert(Boolean(packet.lastHeartbeatAt), result.stdout || result.stderr);
      assert(packet.staleAfterSeconds === 120, result.stdout || result.stderr);
      assert(packet.heartbeatCount === 1, result.stdout || result.stderr);
      assert(
        packet.mutation === "heartbeat metadata only; no branch, PR, cleanup, or ownership mutation",
        result.stdout || result.stderr,
      );
      assert(taskSnapshot(tasksDir) === beforeTasks, "assignment heartbeat json mutated workspace manifests");
    } finally {
      rmSync(claimStateRoot, { recursive: true, force: true });
    }
  });

  test("heartbeat refuses assignment owned by another runner without mutation", () => {
    const claimStateRoot = mkdtempSync(join(tmpdir(), "codex-heartbeat-owned-assignment-"));
    try {
      const expected = expectedClaimCandidate();
      seedGeneratedSuccessorPrerequisites(claimStateRoot, "runner-a");
      seedClaimedSafeBacklogAssignment(claimStateRoot, expected.slug, "runner-b", expected.branch);
      const assignmentPath = join(claimStateRoot, "assignments", `${expected.slug}.json`);
      const before = readFileSync(assignmentPath, "utf8");

      const result = run([
        "heartbeat",
        expected.slug,
        "--owner",
        "runner-a",
        "--phase",
        "active",
        "--state-root",
        claimStateRoot,
      ]);
      const after = readFileSync(assignmentPath, "utf8");

      assert(result.code !== 0, "heartbeat unexpectedly updated another owner's assignment");
      assert(result.stderr.includes("Heartbeat is owner-only"), result.stderr || result.stdout);
      assert(before === after, "failed heartbeat mutated another owner's assignment");
    } finally {
      rmSync(claimStateRoot, { recursive: true, force: true });
    }
  });

  test("takeover dry-run emits packet and does not mutate stale assignment", () => {
    const takeoverStateRoot = mkdtempSync(join(tmpdir(), "codex-takeover-dry-run-"));
    try {
      const assignmentsDir = join(takeoverStateRoot, "assignments");
      mkdirSync(assignmentsDir, { recursive: true });
      const assignmentPath = join(assignmentsDir, "stale-assignment.json");
      writeFileSync(
        assignmentPath,
        `${JSON.stringify(
          {
            assignment_id: "stale-assignment",
            task_id: "stale-assignment",
            lane_slug: "stale-assignment",
            branch: "codex/stale-assignment",
            status: "claimed",
            owner: "runner-b",
            updated_at: "2026-06-21T00:00:00.000Z",
            last_heartbeat_at: "2026-06-21T00:00:00.000Z",
          },
          null,
          2,
        )}\n`,
      );
      const before = readFileSync(assignmentPath, "utf8");

      const result = run([
        "takeover",
        "stale-assignment",
        "--dry-run",
        "--owner",
        "runner-a",
        "--takeover-reason",
        "stale owner evidence reviewed",
        "--stale-after-seconds",
        "60",
        "--state-root",
        takeoverStateRoot,
      ]);
      const after = readFileSync(assignmentPath, "utf8");

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("DRY RUN: takeover"), result.stdout || result.stderr);
      assert(result.stdout.includes("- target assignment stale-assignment"), result.stdout || result.stderr);
      assert(result.stdout.includes("- decision blocked"), result.stdout || result.stderr);
      assert(result.stdout.includes("- blocker explicit operator approval evidence is required for apply"), result.stdout || result.stderr);
      assert(before === after, "takeover dry-run mutated assignment");
    } finally {
      rmSync(takeoverStateRoot, { recursive: true, force: true });
    }
  });

  test("takeover summary-json previews compact takeover evidence without mutation", () => {
    const takeoverStateRoot = mkdtempSync(join(tmpdir(), "codex-takeover-summary-json-"));
    try {
      const assignmentsDir = join(takeoverStateRoot, "assignments");
      mkdirSync(assignmentsDir, { recursive: true });
      const assignmentPath = join(assignmentsDir, "stale-assignment.json");
      writeFileSync(
        assignmentPath,
        `${JSON.stringify(
          {
            assignment_id: "stale-assignment",
            task_id: "stale-assignment",
            lane_slug: "stale-assignment",
            branch: "codex/stale-assignment",
            status: "claimed",
            owner: "runner-b",
            updated_at: "2026-06-21T00:00:00.000Z",
            last_heartbeat_at: "2026-06-21T00:00:00.000Z",
          },
          null,
          2,
        )}\n`,
      );
      const before = readFileSync(assignmentPath, "utf8");

      const result = run([
        "takeover",
        "stale-assignment",
        "--dry-run",
        "--summary-json",
        "--owner",
        "runner-a",
        "--takeover-reason",
        "stale owner evidence reviewed",
        "--stale-after-seconds",
        "60",
        "--state-root",
        takeoverStateRoot,
      ]);
      const after = readFileSync(assignmentPath, "utf8");

      assert(result.code === 0, result.stderr || result.stdout);
      const packet = JSON.parse(result.stdout);
      assert(packet.targetKind === "assignment", result.stdout || result.stderr);
      assert(packet.targetId === "stale-assignment", result.stdout || result.stderr);
      assert(packet.previousOwner === "runner-b", result.stdout || result.stderr);
      assert(packet.requestingOwner === "runner-a", result.stdout || result.stderr);
      assert(packet.decision === "blocked", result.stdout || result.stderr);
      assert(packet.allowed === false, result.stdout || result.stderr);
      assert(packet.heartbeat.isStale === true, result.stdout || result.stderr);
      assert(packet.heartbeat.staleAfterSeconds === 60, result.stdout || result.stderr);
      assert(packet.worktree.status === "not_applicable", result.stdout || result.stderr);
      assert(packet.approval.present === false, result.stdout || result.stderr);
      assert(packet.blockers.includes("explicit operator approval evidence is required for apply"), result.stdout || result.stderr);
      assert(packet.dirtyState.dirtyLineCount === 0, result.stdout || result.stderr);
      assert(packet.mutation === "none; dry-run summary only", result.stdout || result.stderr);
      assert(before === after, "takeover summary-json mutated assignment");
    } finally {
      rmSync(takeoverStateRoot, { recursive: true, force: true });
    }
  });

  test("takeover apply requires approval evidence before assignment mutation", () => {
    const takeoverStateRoot = mkdtempSync(join(tmpdir(), "codex-takeover-no-approval-"));
    try {
      const assignmentsDir = join(takeoverStateRoot, "assignments");
      mkdirSync(assignmentsDir, { recursive: true });
      const assignmentPath = join(assignmentsDir, "stale-assignment.json");
      writeFileSync(
        assignmentPath,
        `${JSON.stringify({
          assignment_id: "stale-assignment",
          task_id: "stale-assignment",
          lane_slug: "stale-assignment",
          branch: "codex/stale-assignment",
          status: "claimed",
          owner: "runner-b",
          last_heartbeat_at: "2026-06-21T00:00:00.000Z",
        })}\n`,
      );
      const before = readFileSync(assignmentPath, "utf8");

      const result = run([
        "takeover",
        "stale-assignment",
        "--apply",
        "--owner",
        "runner-a",
        "--takeover-reason",
        "stale owner evidence reviewed",
        "--state-root",
        takeoverStateRoot,
      ]);
      const after = readFileSync(assignmentPath, "utf8");

      assert(result.code !== 0, "takeover apply unexpectedly passed without approval");
      assert(result.stderr.includes("--approval must cite explicit operator approval"), result.stderr || result.stdout);
      assert(before === after, "failed takeover without approval mutated assignment");
    } finally {
      rmSync(takeoverStateRoot, { recursive: true, force: true });
    }
  });

  test("takeover apply reassigns stale assignment with approval evidence", () => {
    const takeoverStateRoot = mkdtempSync(join(tmpdir(), "codex-takeover-assignment-"));
    try {
      const assignmentsDir = join(takeoverStateRoot, "assignments");
      mkdirSync(assignmentsDir, { recursive: true });
      const assignmentPath = join(assignmentsDir, "stale-assignment.json");
      writeFileSync(
        assignmentPath,
        `${JSON.stringify(
          {
            assignment_id: "stale-assignment",
            task_id: "stale-assignment",
            lane_slug: "stale-assignment",
            branch: "codex/stale-assignment",
            status: "claimed",
            owner: "runner-b",
            owner_thread_id: "thread-b",
            updated_at: "2026-06-21T00:00:00.000Z",
            last_heartbeat_at: "2026-06-21T00:00:00.000Z",
            events: [],
          },
          null,
          2,
        )}\n`,
      );

      const result = run([
        "takeover",
        "stale-assignment",
        "--apply",
        "--owner",
        "runner-a",
        "--takeover-reason",
        "stale owner evidence reviewed",
        "--approval",
        "operator approved takeover for stale lane",
        "--stale-after-seconds",
        "60",
        "--state-root",
        takeoverStateRoot,
      ]);

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("APPLY: takeover"), result.stdout || result.stderr);
      assert(result.stdout.includes("- decision approved_for_apply"), result.stdout || result.stderr);
      const assignment = JSON.parse(readFileSync(assignmentPath, "utf8"));
      assert(assignment.owner === "runner-a", "takeover did not update assignment owner");
      assert(assignment.status === "claimed", "takeover changed assignment status unexpectedly");
      assert(Array.isArray(assignment.takeover_decisions), "takeover decision evidence missing");
      assert(assignment.takeover_decisions[0].decision === "applied", "takeover decision not marked applied");
      assert(assignment.takeover_decisions[0].previous_owner === "runner-b", "previous owner evidence missing");
      assert(assignment.events.some((event) => event.type === "takeover_applied"), "takeover event missing");
      assert(!existsSync(join(takeoverStateRoot, "tasks")), "assignment takeover created workspace manifests");
    } finally {
      rmSync(takeoverStateRoot, { recursive: true, force: true });
    }
  });

  test("takeover apply blocks non-stale assignment without mutation", () => {
    const takeoverStateRoot = mkdtempSync(join(tmpdir(), "codex-takeover-nonstale-"));
    try {
      const assignmentsDir = join(takeoverStateRoot, "assignments");
      mkdirSync(assignmentsDir, { recursive: true });
      const assignmentPath = join(assignmentsDir, "fresh-assignment.json");
      writeFileSync(
        assignmentPath,
        `${JSON.stringify({
          assignment_id: "fresh-assignment",
          task_id: "fresh-assignment",
          lane_slug: "fresh-assignment",
          branch: "codex/fresh-assignment",
          status: "claimed",
          owner: "runner-b",
          last_heartbeat_at: new Date().toISOString(),
        })}\n`,
      );
      const before = readFileSync(assignmentPath, "utf8");

      const result = run([
        "takeover",
        "fresh-assignment",
        "--apply",
        "--owner",
        "runner-a",
        "--takeover-reason",
        "stale owner evidence reviewed",
        "--approval",
        "operator approved takeover for stale lane",
        "--stale-after-seconds",
        "86400",
        "--state-root",
        takeoverStateRoot,
      ]);
      const after = readFileSync(assignmentPath, "utf8");

      assert(result.code !== 0, "takeover apply unexpectedly passed for non-stale assignment");
      assert(result.stdout.includes("owner heartbeat is not stale"), result.stderr || result.stdout);
      assert(before === after, "blocked non-stale takeover mutated assignment");
    } finally {
      rmSync(takeoverStateRoot, { recursive: true, force: true });
    }
  });

  test("takeover apply blocks assignment with missing recorded worktree", () => {
    const takeoverStateRoot = mkdtempSync(join(tmpdir(), "codex-takeover-missing-assignment-worktree-"));
    try {
      const assignmentsDir = join(takeoverStateRoot, "assignments");
      mkdirSync(assignmentsDir, { recursive: true });
      const missingWorktree = join(takeoverStateRoot, "missing-worktree");
      const assignmentPath = join(assignmentsDir, "stale-assignment.json");
      writeFileSync(
        assignmentPath,
        `${JSON.stringify({
          assignment_id: "stale-assignment",
          task_id: "stale-assignment",
          lane_slug: "stale-assignment",
          branch: "codex/stale-assignment",
          worktree_path: missingWorktree,
          status: "claimed",
          owner: "runner-b",
          last_heartbeat_at: "2026-06-21T00:00:00.000Z",
        })}\n`,
      );
      const before = readFileSync(assignmentPath, "utf8");

      const result = run([
        "takeover",
        "stale-assignment",
        "--apply",
        "--owner",
        "runner-a",
        "--takeover-reason",
        "stale owner evidence reviewed",
        "--approval",
        "operator approved takeover for stale lane",
        "--stale-after-seconds",
        "60",
        "--state-root",
        takeoverStateRoot,
      ]);
      const after = readFileSync(assignmentPath, "utf8");

      assert(result.code !== 0, "takeover apply unexpectedly passed with missing assignment worktree");
      assert(result.stdout.includes("assignment worktree is missing"), result.stderr || result.stdout);
      assert(before === after, "missing assignment worktree takeover mutated assignment");
    } finally {
      rmSync(takeoverStateRoot, { recursive: true, force: true });
    }
  });

  test("dispatch-next dry-run previews handoff without mutation", () => {
    const dispatchStateRoot = mkdtempSync(join(tmpdir(), "codex-dispatch-dry-run-"));
    try {
      seedGeneratedSuccessorPrerequisites(dispatchStateRoot);
      const tasksDir = join(dispatchStateRoot, "tasks");
      const assignmentsDir = join(dispatchStateRoot, "assignments");
      const beforeTasks = taskSnapshot(tasksDir);
      const beforeAssignments = taskSnapshot(assignmentsDir);
      const result = run([
        "dispatch-next",
        "--dry-run",
        "--owner",
        "runner-a",
        "--state-root",
        dispatchStateRoot,
      ]);

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("DRY RUN: dispatch-next"), result.stdout || result.stderr);
      assert(result.stdout.includes("- selected lane none"), result.stdout || result.stderr);
      assert(result.stdout.includes("- workspace action none"), result.stdout || result.stderr);
      assert(result.stdout.includes("- allowed false"), result.stdout || result.stderr);
      assert(result.stdout.includes("- blocker no dispatchable safe backlog lane found"), result.stdout || result.stderr);
      assert(result.stdout.includes("- queue states "), result.stdout || result.stderr);
      assert(result.stdout.includes("closed="), result.stdout || result.stderr);
      assert(taskSnapshot(assignmentsDir) === beforeAssignments, "dispatch dry-run mutated assignments");
      assert(taskSnapshot(tasksDir) === beforeTasks, "dispatch dry-run mutated manifests");
    } finally {
      rmSync(dispatchStateRoot, { recursive: true, force: true });
    }
  });

  test("dispatch-next summary-json previews a bounded handoff summary without mutation", () => {
    const dispatchStateRoot = mkdtempSync(join(tmpdir(), "codex-dispatch-summary-json-"));
    try {
      seedGeneratedSuccessorPrerequisites(dispatchStateRoot);
      const tasksDir = join(dispatchStateRoot, "tasks");
      const assignmentsDir = join(dispatchStateRoot, "assignments");
      const beforeTasks = taskSnapshot(tasksDir);
      const beforeAssignments = taskSnapshot(assignmentsDir);
      const result = run([
        "dispatch-next",
        "--dry-run",
        "--summary-json",
        "--owner",
        "runner-a",
        "--state-root",
        dispatchStateRoot,
      ]);

      assert(result.code === 0, result.stderr || result.stdout);
      const packet = JSON.parse(result.stdout);
      assert(packet.currentOwner === "runner-a", result.stdout || result.stderr);
      assert(packet.readinessProfile === "doctor", result.stdout || result.stderr);
      assert(packet.selected === null, result.stdout || result.stderr);
      assert(packet.dispatch.allowed === false, result.stdout || result.stderr);
      assert(packet.dispatch.selectedLane === null, result.stdout || result.stderr);
      assert(packet.dispatch.workspaceAction === null, result.stdout || result.stderr);
      assert(packet.dispatch.nextActionGuidance.includes("source-owned safe backlog next-lane metadata"), result.stdout || result.stderr);
      assert(packet.counts.total > 0, result.stdout || result.stderr);
      assert(packet.counts.dispatchable === 0, result.stdout || result.stderr);
      assert(!packet.candidateStateCounts.assignable, result.stdout || result.stderr);
      assert(packet.candidateStateCounts.closed >= 1, result.stdout || result.stderr);
      assert(packet.blockedCandidates.length <= 10, result.stdout || result.stderr);
      assert(typeof packet.blockedCandidatesTruncated === "boolean", result.stdout || result.stderr);
      assert(packet.mutation === "none; dry-run summary only", result.stdout || result.stderr);
      assert(taskSnapshot(assignmentsDir) === beforeAssignments, "dispatch summary-json mutated assignments");
      assert(taskSnapshot(tasksDir) === beforeTasks, "dispatch summary-json mutated manifests");
    } finally {
      rmSync(dispatchStateRoot, { recursive: true, force: true });
    }
  });

  test("dispatch-next apply validates workspace base before assignment mutation", () => {
    const dispatchStateRoot = mkdtempSync(join(tmpdir(), "codex-dispatch-invalid-base-"));
    try {
      seedGeneratedSuccessorPrerequisites(dispatchStateRoot);
      const tasksDir = join(dispatchStateRoot, "tasks");
      const assignmentsDir = join(dispatchStateRoot, "assignments");
      const beforeTasks = taskSnapshot(tasksDir);
      const beforeAssignments = taskSnapshot(assignmentsDir);

      const result = run([
        "dispatch-next",
        "--apply",
        "--base",
        "bad:refs/heads/injected",
        "--no-fetch",
        "--owner",
        "runner-a",
        "--state-root",
        dispatchStateRoot,
      ]);

      assert(result.code !== 0, "dispatch-next unexpectedly found a dispatchable lane");
      assert(result.stderr.includes("No dispatchable safe backlog lane found"), result.stderr || result.stdout);
      assert(taskSnapshot(assignmentsDir) === beforeAssignments, "invalid dispatch base mutated assignments");
      assert(taskSnapshot(tasksDir) === beforeTasks, "invalid dispatch base mutated manifests");
    } finally {
      rmSync(dispatchStateRoot, { recursive: true, force: true });
    }
  });

  test("dispatch-next apply does not claim unowned workspace when source lane is closed", () => {
    const dispatchStateRoot = mkdtempSync(join(tmpdir(), "codex-dispatch-apply-workspace-"));
    const worktreePath = mkdtempSync(join(tmpdir(), "codex-dispatch-worktree-"));
    try {
      runGit(worktreePath, ["init", "-q"]);
      runGit(worktreePath, ["config", "user.email", "codex-workspace-test@example.com"]);
      runGit(worktreePath, ["config", "user.name", "Codex Workspace Test"]);
      writeFileSync(join(worktreePath, "tracked.txt"), "base\n");
      runGit(worktreePath, ["add", "tracked.txt"]);
      runGit(worktreePath, ["commit", "-q", "-m", "base"]);

      const tasksDir = join(dispatchStateRoot, "tasks");
      mkdirSync(tasksDir, { recursive: true });
      const manifestPath = join(tasksDir, "dispatch-workspace.json");
      const expected = expectedAuthorityClaimCandidate();
      seedClaimedSafeBacklogAssignment(dispatchStateRoot, "read-only-evidence-polish", "runner-b");
      writeFileSync(
        manifestPath,
        `${JSON.stringify(
          {
            task_id: "dispatch-workspace",
            branch: expected.branch,
            worktree_path: worktreePath,
            base_branch: "main",
            status: "active",
            owner: "",
            created_at: "2026-06-22T00:00:00.000Z",
            updated_at: "2026-06-22T00:00:00.000Z",
            events: [],
          },
          null,
          2,
        )}\n`,
      );
      const before = readFileSync(manifestPath, "utf8");

      const result = run([
        "dispatch-next",
        "--apply",
        "--owner",
        "runner-a",
        "--readiness",
        "none",
        "--state-root",
        dispatchStateRoot,
      ]);
      const after = readFileSync(manifestPath, "utf8");

      assert(result.code !== 0, "dispatch unexpectedly claimed unowned workspace for closed source lane");
      assert(result.stderr.includes("No dispatchable safe backlog lane found"), result.stderr || result.stdout);
      assert(after === before, "failed dispatch mutated unowned workspace manifest");
      assert(!existsSync(join(dispatchStateRoot, "assignments", `${expected.slug}.json`)), "workspace dispatch created assignment metadata");
    } finally {
      rmSync(dispatchStateRoot, { recursive: true, force: true });
      rmSync(worktreePath, { recursive: true, force: true });
    }
  });

  test("dispatch-next apply blocks active workspace owned by another runner", () => {
    const dispatchStateRoot = mkdtempSync(join(tmpdir(), "codex-dispatch-owned-workspace-"));
    const worktreePath = mkdtempSync(join(tmpdir(), "codex-dispatch-owned-worktree-"));
    try {
      runGit(worktreePath, ["init", "-q"]);
      runGit(worktreePath, ["config", "user.email", "codex-workspace-test@example.com"]);
      runGit(worktreePath, ["config", "user.name", "Codex Workspace Test"]);
      writeFileSync(join(worktreePath, "tracked.txt"), "base\n");
      runGit(worktreePath, ["add", "tracked.txt"]);
      runGit(worktreePath, ["commit", "-q", "-m", "base"]);

      const tasksDir = join(dispatchStateRoot, "tasks");
      mkdirSync(tasksDir, { recursive: true });
      const blockedBranches = [
        "codex/verification-surface-hardening",
        "codex/github-delivery-hygiene",
        "codex/read-only-evidence-polish",
        "codex/worker-backlog-queue-refresh",
        "codex/lane-handoff-evidence-refresh",
        "codex/report-catalog-shortcut-refresh",
        "codex/dispatcher-continuity-snapshot-refresh",
        "codex/assignment-report-queue-proof-refresh",
        "codex/dispatcher-queue-state-fixtures-refresh",
        "codex/dispatcher-queue-handoff-badges-refresh",
        "codex/dispatcher-queue-handoff-status-refresh",
        "codex/dispatcher-queue-handoff-lifecycle-refresh",
        "codex/dispatcher-queue-handoff-recovery-refresh",
        "codex/dispatcher-queue-handoff-audit-refresh",
        "codex/dispatcher-queue-handoff-audit-retention-refresh",
        "codex/dispatcher-queue-handoff-audit-query-refresh",
        "codex/dispatcher-queue-handoff-audit-export-refresh",
        "codex/dispatcher-queue-handoff-audit-download-refresh",
        "codex/dispatcher-queue-handoff-audit-json-refresh",
        "codex/dispatcher-queue-handoff-audit-json-schema-refresh",
        "codex/dispatcher-queue-handoff-audit-json-validation-refresh",
        "codex/dispatcher-queue-handoff-audit-json-validation-fixtures-refresh",
        "codex/dispatcher-cleanup-assignment-closure-refresh",
        "codex/dispatcher-cleanup-assignment-report-refresh",
        "codex/dispatcher-closed-source-guard-report-refresh",
        "codex/dispatcher-closed-source-guard-drilldown-refresh",
        "codex/dispatcher-closed-source-guard-rollup-refresh",
        "codex/dispatcher-closed-source-guard-rollup-filter-refresh",
        "codex/dispatcher-closed-source-guard-source-kind-summary-refresh",
        "codex/dispatcher-closed-source-guard-filter-reset-refresh",
        "codex/dispatcher-closed-source-guard-filter-presets-refresh",
        "codex/dispatcher-closed-source-guard-filter-counts-refresh",
        "codex/dispatcher-closed-source-guard-filter-empty-state-refresh",
        "codex/dispatcher-closed-source-guard-filter-empty-state-reset-refresh",
        "codex/dispatcher-closed-source-guard-filter-empty-state-shortcuts-refresh",
        "codex/dispatcher-closed-source-guard-filter-empty-state-shortcut-counts-refresh",
        "codex/dispatcher-closed-source-guard-filter-empty-state-shortcut-disabled-reasons-refresh",
        "codex/dispatcher-closed-source-guard-filter-empty-state-shortcut-reason-focus-refresh",
        "codex/dispatcher-closed-source-guard-filter-empty-state-shortcut-reason-keyboard-loop-refresh",
        "codex/authority-blocked-approval-scope-readiness",
      ];
      const manifestPaths = blockedBranches.map((branchName, index) => {
        const manifestPath = join(tasksDir, `dispatch-workspace-${index}.json`);
        writeFileSync(
          manifestPath,
          `${JSON.stringify({
            task_id: `dispatch-workspace-${index}`,
            branch: branchName,
            worktree_path: worktreePath,
            base_branch: "main",
            status: "active",
            owner: "runner-b",
            owner_updated_at: new Date().toISOString(),
          })}\n`,
        );
        return manifestPath;
      });
      const before = manifestPaths.map((manifestPath) => readFileSync(manifestPath, "utf8")).join("\n---\n");

      const result = run([
        "dispatch-next",
        "--apply",
        "--owner",
        "runner-a",
        "--readiness",
        "none",
        "--state-root",
        dispatchStateRoot,
      ]);
      const after = manifestPaths.map((manifestPath) => readFileSync(manifestPath, "utf8")).join("\n---\n");

      assert(result.code !== 0, "dispatch unexpectedly passed for workspace owned by another runner");
      assert(result.stdout.includes("BLOCKED: dispatch-next"), result.stderr || result.stdout);
      assert(result.stdout.includes("no dispatchable safe backlog lane found"), result.stderr || result.stdout);
      assert(before === after, "blocked dispatch mutated owned workspace");
    } finally {
      rmSync(dispatchStateRoot, { recursive: true, force: true });
      rmSync(worktreePath, { recursive: true, force: true });
    }
  });

  test("claim-next apply blocks a lane assigned to another owner", () => {
    const claimStateRoot = mkdtempSync(join(tmpdir(), "codex-claim-next-owned-assignment-"));
    let authorityWorktreePath = "";
    try {
      const expected = expectedClaimCandidate();
      seedGeneratedSuccessorPrerequisites(claimStateRoot, "runner-a");
      seedClaimedSafeBacklogAssignment(claimStateRoot, expected.slug, "runner-b");
      const assignmentsDir = join(claimStateRoot, "assignments");
      const tasksDir = join(claimStateRoot, "tasks");
      mkdirSync(tasksDir, { recursive: true });
      authorityWorktreePath = mkdtempSync(join(tmpdir(), "codex-authority-owned-worktree-"));
      writeFileSync(
        join(tasksDir, "authority-blocked-work.json"),
        `${JSON.stringify({
          task_id: "authority-blocked-work",
          branch: "codex/authority-blocked-approval-scope-readiness",
          worktree_path: authorityWorktreePath,
          base_branch: "dev",
          status: "active",
          owner: "runner-b",
          owner_updated_at: new Date().toISOString(),
        })}\n`,
      );
      for (const laneSlug of [
        "github-delivery-hygiene",
        "read-only-evidence-polish",
        "worker-backlog-queue-refresh",
        "lane-handoff-evidence-refresh",
        "report-catalog-shortcut-refresh",
        "dispatcher-continuity-snapshot-refresh",
        "assignment-report-queue-proof-refresh",
        "dispatcher-queue-state-fixtures-refresh",
        "dispatcher-queue-handoff-badges-refresh",
        "dispatcher-queue-handoff-status-refresh",
        "dispatcher-queue-handoff-lifecycle-refresh",
        "dispatcher-queue-handoff-recovery-refresh",
        "dispatcher-queue-handoff-audit-refresh",
        "dispatcher-queue-handoff-audit-retention-refresh",
        "dispatcher-queue-handoff-audit-query-refresh",
        "dispatcher-queue-handoff-audit-export-refresh",
        "dispatcher-queue-handoff-audit-download-refresh",
        "dispatcher-queue-handoff-audit-json-refresh",
        "dispatcher-queue-handoff-audit-json-schema-refresh",
        "dispatcher-queue-handoff-audit-json-validation-refresh",
        "dispatcher-cleanup-assignment-closure-refresh",
        "dispatcher-cleanup-assignment-report-refresh",
        "dispatcher-closed-source-guard-report-refresh",
        "dispatcher-closed-source-guard-drilldown-refresh",
        "dispatcher-closed-source-guard-rollup-refresh",
        "dispatcher-closed-source-guard-rollup-filter-refresh",
        "dispatcher-closed-source-guard-source-kind-summary-refresh",
        "dispatcher-closed-source-guard-filter-reset-refresh",
        "dispatcher-closed-source-guard-filter-presets-refresh",
        "dispatcher-closed-source-guard-filter-counts-refresh",
        "dispatcher-closed-source-guard-filter-empty-state-refresh",
        "dispatcher-closed-source-guard-filter-empty-state-reset-refresh",
        "dispatcher-closed-source-guard-filter-empty-state-shortcuts-refresh",
        "dispatcher-closed-source-guard-filter-empty-state-shortcut-counts-refresh",
        "dispatcher-closed-source-guard-filter-empty-state-shortcut-disabled-reasons-refresh",
        "dispatcher-closed-source-guard-filter-empty-state-shortcut-reason-focus-refresh",
        "dispatcher-closed-source-guard-filter-empty-state-shortcut-reason-keyboard-loop-refresh",
        "authority-blocked-work",
      ]) {
        const branch = laneSlug === "authority-blocked-work" ? "codex/authority-blocked-approval-scope-readiness" : `codex/${laneSlug}`;
        writeFileSync(
          join(assignmentsDir, `${laneSlug}.json`),
          `${JSON.stringify({
            assignment_id: laneSlug,
            task_id: laneSlug,
            lane_slug: laneSlug,
            branch,
            status: "claimed",
            owner: "runner-b",
            last_heartbeat_at: new Date().toISOString(),
          })}\n`,
        );
      }
      const assignmentFiles = [
        "github-delivery-hygiene",
        "read-only-evidence-polish",
        "worker-backlog-queue-refresh",
        "lane-handoff-evidence-refresh",
        "report-catalog-shortcut-refresh",
        "dispatcher-continuity-snapshot-refresh",
        "assignment-report-queue-proof-refresh",
        "dispatcher-queue-state-fixtures-refresh",
        "dispatcher-queue-handoff-badges-refresh",
        "dispatcher-queue-handoff-status-refresh",
        "dispatcher-queue-handoff-lifecycle-refresh",
        "dispatcher-queue-handoff-recovery-refresh",
        "dispatcher-queue-handoff-audit-refresh",
        "dispatcher-queue-handoff-audit-retention-refresh",
        "dispatcher-queue-handoff-audit-query-refresh",
        "dispatcher-queue-handoff-audit-export-refresh",
        "dispatcher-queue-handoff-audit-download-refresh",
        "dispatcher-queue-handoff-audit-json-refresh",
        "dispatcher-queue-handoff-audit-json-schema-refresh",
        "dispatcher-queue-handoff-audit-json-validation-refresh",
        "dispatcher-cleanup-assignment-closure-refresh",
        "dispatcher-cleanup-assignment-report-refresh",
        "dispatcher-closed-source-guard-report-refresh",
        "dispatcher-closed-source-guard-drilldown-refresh",
        "dispatcher-closed-source-guard-rollup-refresh",
        "dispatcher-closed-source-guard-rollup-filter-refresh",
        "dispatcher-closed-source-guard-source-kind-summary-refresh",
        "dispatcher-closed-source-guard-filter-reset-refresh",
        "dispatcher-closed-source-guard-filter-presets-refresh",
        "dispatcher-closed-source-guard-filter-counts-refresh",
        "dispatcher-closed-source-guard-filter-empty-state-refresh",
        "dispatcher-closed-source-guard-filter-empty-state-reset-refresh",
        "dispatcher-closed-source-guard-filter-empty-state-shortcuts-refresh",
        "dispatcher-closed-source-guard-filter-empty-state-shortcut-counts-refresh",
        "dispatcher-closed-source-guard-filter-empty-state-shortcut-disabled-reasons-refresh",
        "dispatcher-closed-source-guard-filter-empty-state-shortcut-reason-focus-refresh",
        "dispatcher-closed-source-guard-filter-empty-state-shortcut-reason-keyboard-loop-refresh",
        "authority-blocked-work",
      ].map((laneSlug) => join(assignmentsDir, `${laneSlug}.json`));
      const before = assignmentFiles.map((assignmentPath) => readFileSync(assignmentPath, "utf8")).join("\n---\n");

      const second = run(["claim-next", "--apply", "--owner", "runner-a", "--state-root", claimStateRoot]);
      const after = assignmentFiles.map((assignmentPath) => readFileSync(assignmentPath, "utf8")).join("\n---\n");

      assert(second.code !== 0, "claim-next --apply unexpectedly claimed another owner's assignment");
      assert(second.stdout.includes(`- ${expectedAuthorityClaimCandidate().slug} | closed`), second.stdout || second.stderr);
      assert(second.stderr.includes("No claimable safe backlog lane found"), second.stderr || second.stdout);
      assert(before === after, "blocked claim-next --apply mutated another owner's assignment");
    } finally {
      rmSync(claimStateRoot, { recursive: true, force: true });
      if (authorityWorktreePath) {
        rmSync(authorityWorktreePath, { recursive: true, force: true });
      }
    }
  });

  test("claim-next dry-run does not claim an existing unowned workspace for a closed source lane", () => {
    const claimStateRoot = mkdtempSync(join(tmpdir(), "codex-claim-next-unowned-"));
    try {
      const tasksDir = join(claimStateRoot, "tasks");
      mkdirSync(tasksDir, { recursive: true });
      const manifestPath = join(tasksDir, "unowned-safe-backlog.json");
      const expected = expectedAuthorityClaimCandidate();
      seedClaimedSafeBacklogAssignment(claimStateRoot, "read-only-evidence-polish", "runner-b");
      writeFileSync(
        manifestPath,
        `${JSON.stringify(
          {
            task_id: "unowned-safe-backlog",
            branch: expected.branch,
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
      assert(result.stdout.includes("no claimable safe backlog lane found"), result.stdout || result.stderr);
      assert(result.stdout.includes("preview only; no manifest, branch, PR, or worktree mutation"), result.stdout || result.stderr);
      assert(before === after, "claim-next --dry-run mutated the unowned lane manifest");
    } finally {
      rmSync(claimStateRoot, { recursive: true, force: true });
    }
  });

  test("claim-next apply does not claim an existing unowned workspace for a closed source lane", () => {
    const claimStateRoot = mkdtempSync(join(tmpdir(), "codex-claim-next-unowned-apply-"));
    try {
      const tasksDir = join(claimStateRoot, "tasks");
      mkdirSync(tasksDir, { recursive: true });
      const manifestPath = join(tasksDir, "unowned-safe-backlog.json");
      const expected = expectedAuthorityClaimCandidate();
      seedClaimedSafeBacklogAssignment(claimStateRoot, "read-only-evidence-polish", "runner-b");
      writeFileSync(
        manifestPath,
        `${JSON.stringify(
          {
            task_id: "unowned-safe-backlog",
            branch: expected.branch,
            worktree_path: rootDir,
            base_branch: "main",
            status: "active",
          },
          null,
          2,
        )}\n`,
      );
      const before = readFileSync(manifestPath, "utf8");

      const result = run(["claim-next", "--apply", "--owner", "runner-a", "--state-root", claimStateRoot]);
      const after = readFileSync(manifestPath, "utf8");

      assert(result.code !== 0, "claim-next --apply unexpectedly claimed a closed source workspace manifest");
      assert(result.stderr.includes("No claimable safe backlog lane found"), result.stderr || result.stdout);
      assert(!existsSync(join(claimStateRoot, "assignments", `${expected.slug}.json`)), "manifest claim should not create assignment metadata");
      assert(after === before, "failed claim-next --apply mutated the unowned manifest");
    } finally {
      rmSync(claimStateRoot, { recursive: true, force: true });
    }
  });

  test("heartbeat updates current-owner workspace manifest lease evidence", () => {
    const claimStateRoot = mkdtempSync(join(tmpdir(), "codex-heartbeat-manifest-"));
    try {
      const tasksDir = join(claimStateRoot, "tasks");
      mkdirSync(tasksDir, { recursive: true });
      const manifestPath = join(tasksDir, "owned-safe-backlog.json");
      writeFileSync(
        manifestPath,
        `${JSON.stringify(
          {
            task_id: "owned-safe-backlog",
            branch: "codex/verification-surface-hardening",
            worktree_path: rootDir,
            base_branch: "main",
            status: "active",
            owner: "runner-a",
            owner_updated_at: "2026-06-21T00:00:00.000Z",
          },
          null,
          2,
        )}\n`,
      );

      const result = run([
        "heartbeat",
        "owned-safe-backlog",
        "--owner",
        "runner-a",
        "--phase",
        "verification",
        "--runner-kind",
        "codex-cli",
        "--last-result",
        "tests passed",
        "--state-root",
        claimStateRoot,
      ]);

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("target workspace owned-safe-backlog"), result.stdout || result.stderr);
      assert(!existsSync(join(claimStateRoot, "assignments")), "manifest heartbeat created assignment metadata");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      assert(manifest.status === "active", "heartbeat should not change workspace status");
      assert(manifest.owner === "runner-a", "heartbeat changed workspace owner");
      assert(manifest.branch === "codex/verification-surface-hardening", "heartbeat changed branch");
      assert(manifest.phase === "verification", "workspace heartbeat phase missing");
      assert(manifest.runner_kind === "codex-cli", "workspace heartbeat runner kind missing");
      assert(manifest.last_result === "tests passed", "workspace heartbeat result missing");
      assert(Boolean(manifest.last_heartbeat_at), "workspace heartbeat timestamp missing");
      assert(manifest.owner_updated_at === manifest.last_heartbeat_at, "workspace owner timestamp not refreshed");
      assert(manifest.events.some((event) => event.type === "heartbeat"), "workspace heartbeat event missing");
    } finally {
      rmSync(claimStateRoot, { recursive: true, force: true });
    }
  });

  test("heartbeat json emits written workspace lease evidence", () => {
    const claimStateRoot = mkdtempSync(join(tmpdir(), "codex-heartbeat-manifest-json-"));
    try {
      const tasksDir = join(claimStateRoot, "tasks");
      mkdirSync(tasksDir, { recursive: true });
      const manifestPath = join(tasksDir, "owned-safe-backlog.json");
      writeFileSync(
        manifestPath,
        `${JSON.stringify(
          {
            task_id: "owned-safe-backlog",
            branch: "codex/verification-surface-hardening",
            worktree_path: rootDir,
            base_branch: "main",
            status: "active",
            owner: "runner-a",
            owner_updated_at: "2026-06-21T00:00:00.000Z",
          },
          null,
          2,
        )}\n`,
      );

      const result = run([
        "heartbeat",
        "owned-safe-backlog",
        "--json",
        "--owner",
        "runner-a",
        "--phase",
        "active",
        "--runner-kind",
        "codex-cli",
        "--last-result",
        "tests passed",
        "--state-root",
        claimStateRoot,
      ]);

      assert(result.code === 0, result.stderr || result.stdout);
      const packet = JSON.parse(result.stdout);
      assert(packet.targetKind === "workspace", result.stdout || result.stderr);
      assert(packet.target === "owned-safe-backlog", result.stdout || result.stderr);
      assert(packet.path === manifestPath, result.stdout || result.stderr);
      assert(packet.owner === "runner-a", result.stdout || result.stderr);
      assert(packet.status === "active", result.stdout || result.stderr);
      assert(packet.branch === "codex/verification-surface-hardening", result.stdout || result.stderr);
      assert(packet.phase === "active", result.stdout || result.stderr);
      assert(packet.lastResult === "tests passed", result.stdout || result.stderr);
      assert(packet.heartbeatCount === 1, result.stdout || result.stderr);
      assert(!existsSync(join(claimStateRoot, "assignments")), "manifest heartbeat json created assignment metadata");
    } finally {
      rmSync(claimStateRoot, { recursive: true, force: true });
    }
  });

  test("heartbeat does not allow takeover flags to update another owner's workspace", () => {
    const claimStateRoot = mkdtempSync(join(tmpdir(), "codex-heartbeat-manifest-owned-"));
    try {
      const tasksDir = join(claimStateRoot, "tasks");
      mkdirSync(tasksDir, { recursive: true });
      const manifestPath = join(tasksDir, "owned-safe-backlog.json");
      writeFileSync(
        manifestPath,
        `${JSON.stringify(
          {
            task_id: "owned-safe-backlog",
            branch: "codex/verification-surface-hardening",
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

      const result = run([
        "heartbeat",
        "owned-safe-backlog",
        "--owner",
        "runner-a",
        "--take-ownership",
        "--takeover-reason",
        "manual takeover reason",
        "--state-root",
        claimStateRoot,
      ]);
      const after = readFileSync(manifestPath, "utf8");

      assert(result.code !== 0, "heartbeat unexpectedly honored takeover flags");
      assert(result.stderr.includes("Heartbeat is owner-only"), result.stderr || result.stdout);
      assert(before === after, "failed heartbeat mutated another owner's workspace");
    } finally {
      rmSync(claimStateRoot, { recursive: true, force: true });
    }
  });

  test("takeover apply blocks dirty workspace manifest without mutation", () => {
    const takeoverStateRoot = mkdtempSync(join(tmpdir(), "codex-takeover-dirty-manifest-"));
    const worktreePath = mkdtempSync(join(tmpdir(), "codex-takeover-dirty-worktree-"));
    try {
      runGit(worktreePath, ["init", "-q"]);
      runGit(worktreePath, ["config", "user.email", "codex-workspace-test@example.com"]);
      runGit(worktreePath, ["config", "user.name", "Codex Workspace Test"]);
      writeFileSync(join(worktreePath, "tracked.txt"), "base\n");
      runGit(worktreePath, ["add", "tracked.txt"]);
      runGit(worktreePath, ["commit", "-q", "-m", "base"]);
      writeFileSync(join(worktreePath, "dirty.txt"), "dirty\n");

      const tasksDir = join(takeoverStateRoot, "tasks");
      mkdirSync(tasksDir, { recursive: true });
      const manifestPath = join(tasksDir, "stale-workspace.json");
      writeFileSync(
        manifestPath,
        `${JSON.stringify(
          {
            task_id: "stale-workspace",
            branch: "codex/stale-workspace",
            worktree_path: worktreePath,
            base_branch: "main",
            status: "active",
            owner: "runner-b",
            owner_updated_at: "2026-06-21T00:00:00.000Z",
            last_heartbeat_at: "2026-06-21T00:00:00.000Z",
          },
          null,
          2,
        )}\n`,
      );
      const before = readFileSync(manifestPath, "utf8");

      const result = run([
        "takeover",
        "stale-workspace",
        "--apply",
        "--owner",
        "runner-a",
        "--takeover-reason",
        "stale owner evidence reviewed",
        "--approval",
        "operator approved takeover for stale lane",
        "--stale-after-seconds",
        "60",
        "--state-root",
        takeoverStateRoot,
      ]);
      const after = readFileSync(manifestPath, "utf8");

      assert(result.code !== 0, "takeover apply unexpectedly passed for dirty workspace");
      assert(result.stdout.includes("workspace worktree is dirty"), result.stderr || result.stdout);
      assert(before === after, "dirty workspace takeover mutated manifest");
    } finally {
      rmSync(takeoverStateRoot, { recursive: true, force: true });
      rmSync(worktreePath, { recursive: true, force: true });
    }
  });

  test("takeover apply reassigns stale clean workspace manifest with approval evidence", () => {
    const takeoverStateRoot = mkdtempSync(join(tmpdir(), "codex-takeover-clean-manifest-"));
    const worktreePath = mkdtempSync(join(tmpdir(), "codex-takeover-clean-worktree-"));
    try {
      runGit(worktreePath, ["init", "-q"]);
      runGit(worktreePath, ["config", "user.email", "codex-workspace-test@example.com"]);
      runGit(worktreePath, ["config", "user.name", "Codex Workspace Test"]);
      writeFileSync(join(worktreePath, "tracked.txt"), "base\n");
      runGit(worktreePath, ["add", "tracked.txt"]);
      runGit(worktreePath, ["commit", "-q", "-m", "base"]);

      const tasksDir = join(takeoverStateRoot, "tasks");
      mkdirSync(tasksDir, { recursive: true });
      const manifestPath = join(tasksDir, "stale-workspace.json");
      writeFileSync(
        manifestPath,
        `${JSON.stringify(
          {
            task_id: "stale-workspace",
            branch: "codex/stale-workspace",
            worktree_path: worktreePath,
            base_branch: "main",
            status: "active",
            owner: "runner-b",
            owner_thread_id: "thread-b",
            owner_updated_at: "2026-06-21T00:00:00.000Z",
            last_heartbeat_at: "2026-06-21T00:00:00.000Z",
            events: [],
          },
          null,
          2,
        )}\n`,
      );

      const result = run([
        "takeover",
        "stale-workspace",
        "--apply",
        "--owner",
        "runner-a",
        "--takeover-reason",
        "stale owner evidence reviewed",
        "--approval",
        "operator approved takeover for stale lane",
        "--stale-after-seconds",
        "60",
        "--state-root",
        takeoverStateRoot,
      ]);

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("APPLY: takeover"), result.stdout || result.stderr);
      assert(result.stdout.includes("- worktree clean"), result.stdout || result.stderr);
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      assert(manifest.owner === "runner-a", "takeover did not update workspace owner");
      assert(manifest.status === "active", "takeover changed workspace status");
      assert(Array.isArray(manifest.takeover_decisions), "workspace takeover decision evidence missing");
      assert(manifest.takeover_decisions[0].dirty_state_evidence.dirty === false, "clean evidence missing");
      assert(Array.isArray(manifest.ownership_takeovers), "workspace ownership takeover evidence missing");
      assert(manifest.events.some((event) => event.type === "takeover_applied"), "workspace takeover event missing");
      assert(!existsSync(join(takeoverStateRoot, "assignments")), "workspace takeover created assignment metadata");
    } finally {
      rmSync(takeoverStateRoot, { recursive: true, force: true });
      rmSync(worktreePath, { recursive: true, force: true });
    }
  });

  test("claim-next dry-run blocks an active lane owned by another runner", () => {
    const ownedStateRoot = mkdtempSync(join(tmpdir(), "codex-claim-owned-active-"));
    try {
      const tasksDir = join(ownedStateRoot, "tasks");
      mkdirSync(tasksDir, { recursive: true });
      const manifestPaths = [
        "verification-surface-hardening",
        "github-delivery-hygiene",
        "read-only-evidence-polish",
        "worker-backlog-queue-refresh",
        "lane-handoff-evidence-refresh",
        "report-catalog-shortcut-refresh",
        "dispatcher-continuity-snapshot-refresh",
        "assignment-report-queue-proof-refresh",
        "dispatcher-queue-state-fixtures-refresh",
        "dispatcher-queue-handoff-badges-refresh",
        "dispatcher-queue-handoff-status-refresh",
        "dispatcher-queue-handoff-lifecycle-refresh",
        "dispatcher-queue-handoff-recovery-refresh",
        "dispatcher-queue-handoff-audit-refresh",
        "dispatcher-queue-handoff-audit-retention-refresh",
        "dispatcher-queue-handoff-audit-query-refresh",
        "dispatcher-queue-handoff-audit-export-refresh",
        "dispatcher-queue-handoff-audit-download-refresh",
        "dispatcher-queue-handoff-audit-json-refresh",
        "dispatcher-queue-handoff-audit-json-schema-refresh",
        "dispatcher-queue-handoff-audit-json-validation-refresh",
        "dispatcher-queue-handoff-audit-json-validation-fixtures-refresh",
        "dispatcher-cleanup-assignment-closure-refresh",
        "dispatcher-cleanup-assignment-report-refresh",
        "dispatcher-closed-source-guard-report-refresh",
        "dispatcher-closed-source-guard-drilldown-refresh",
        "dispatcher-closed-source-guard-rollup-refresh",
        "dispatcher-closed-source-guard-rollup-filter-refresh",
        "dispatcher-closed-source-guard-source-kind-summary-refresh",
        "dispatcher-closed-source-guard-filter-reset-refresh",
        "dispatcher-closed-source-guard-filter-presets-refresh",
        "dispatcher-closed-source-guard-filter-counts-refresh",
        "dispatcher-closed-source-guard-filter-empty-state-refresh",
        "dispatcher-closed-source-guard-filter-empty-state-reset-refresh",
        "dispatcher-closed-source-guard-filter-empty-state-shortcuts-refresh",
        "dispatcher-closed-source-guard-filter-empty-state-shortcut-counts-refresh",
        "dispatcher-closed-source-guard-filter-empty-state-shortcut-disabled-reasons-refresh",
        "dispatcher-closed-source-guard-filter-empty-state-shortcut-reason-focus-refresh",
        "dispatcher-closed-source-guard-filter-empty-state-shortcut-reason-keyboard-loop-refresh",
        "authority-blocked-work",
      ].map((laneSlug) => {
        const branch = laneSlug === "authority-blocked-work" ? "codex/authority-blocked-approval-scope-readiness" : `codex/${laneSlug}`;
        const manifestPath = join(tasksDir, `owned-${laneSlug}.json`);
        writeFileSync(
          manifestPath,
          `${JSON.stringify(
            {
              task_id: `owned-${laneSlug}`,
              branch,
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
        return manifestPath;
      });
      const before = manifestPaths.map((manifestPath) => readFileSync(manifestPath, "utf8")).join("\n---\n");

      const result = run(["claim-next", "--dry-run", "--owner", "runner-a", "--state-root", ownedStateRoot]);
      const after = manifestPaths.map((manifestPath) => readFileSync(manifestPath, "utf8")).join("\n---\n");

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("no claimable safe backlog lane found"), result.stdout || result.stderr);
      assert(result.stdout.includes("- verification-surface-hardening | closed"), result.stdout || result.stderr);
      assert(result.stdout.includes(`- ${expectedAuthorityClaimCandidate().slug} | closed`), result.stdout || result.stderr);
      assert(before === after, "claim-next --dry-run mutated the owned lane manifest");
    } finally {
      rmSync(ownedStateRoot, { recursive: true, force: true });
    }
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

  test("finish-pr reconciles a clean resumed branch with existing commits", () => {
    const fixture = createFinishPrExistingCommitFixture();
    try {
      const expectedHead = runGit(fixture.worktree, ["rev-parse", "--short", "HEAD"]).stdout;
      const result = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--no-verify", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("PR: https://example.test/pull/456"), result.stdout || result.stderr);
      const manifest = readJson(join(fixture.stateRoot, "tasks", "resumed-task.json"));
      assert(manifest.status === "pr_open", `manifest status is ${manifest.status}`);
      assert(manifest.last_commit === expectedHead, `manifest last_commit is ${manifest.last_commit}`);
      assert(manifest.pr_url === "https://example.test/pull/456", `manifest pr_url is ${manifest.pr_url}`);
      assert(
        manifest.events.some((event) => event.type === "commit_reconciled"),
        "manifest missing commit_reconciled event",
      );
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
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
      assert(manifest.source_assignment_closed_at, "manifest missing source assignment closure timestamp");
      const assignment = readJson(join(fixture.stateRoot, "assignments", "cleanup-assignment.json"));
      assert(assignment.status === "closed", `assignment status is ${assignment.status}`);
      assert(assignment.phase === "closed", `assignment phase is ${assignment.phase}`);
      assert(assignment.closed_at, "assignment missing closed_at");
      assert(assignment.last_result === "closed after cleanup of cleanup-task", `assignment last_result is ${assignment.last_result}`);
    } finally {
      cleanupMergedCleanupFixture(fixture);
    }
  });

  test("cleanup-merged summary-json reports cleanup readiness without mutation", () => {
    const fixture = createMergedCleanupFixture();
    try {
      const result = runFixtureScript(
        fixture,
        ["cleanup-merged", "cleanup-task", "--summary-json", "--delete-remote", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { env: fixture.env },
      );
      assert(result.code === 0, result.stderr || result.stdout);
      const summary = JSON.parse(result.stdout);
      assert(summary.mode === "cleanup-merged", `mode is ${summary.mode}`);
      assert(summary.deleteRemote === true, "deleteRemote was not captured");
      assert(summary.counts.total === 1, `total count is ${summary.counts.total}`);
      assert(summary.counts.cleanupReady === 1, `cleanupReady count is ${summary.counts.cleanupReady}`);
      assert(summary.statusCounts.ready === 1, `ready status count is ${summary.statusCounts.ready}`);
      assert(summary.mutation === "none; summary only", `mutation is ${summary.mutation}`);

      const [cleanup] = summary.results;
      assert(cleanup.taskId === "cleanup-task", `taskId is ${cleanup.taskId}`);
      assert(cleanup.status === "ready", `status is ${cleanup.status}`);
      assert(cleanup.pr.number === 123, `PR number is ${cleanup.pr.number}`);
      assert(cleanup.expectedHeadSha, "summary missing expected cleanup head");
      assert(cleanup.localBranchSha, "summary missing local branch head");
      assert(cleanup.remoteBranchSha, "summary missing remote branch head");
      assert(cleanup.worktree.exists === true, "summary did not report existing worktree");
      assert(cleanup.worktree.dirty === false, "summary reported dirty worktree");
      assert(cleanup.plan.some((line) => line.includes(`git worktree remove ${fixture.worktree}`)), "summary missing worktree cleanup plan");
      assert(cleanup.plan.some((line) => line.includes(`git push origin --delete ${fixture.branch}`)), "summary missing remote cleanup plan");

      assert(existsSync(fixture.worktree), "summary unexpectedly removed target worktree");
      assert(branchExists(fixture.root, fixture.branch), "summary unexpectedly deleted local branch");
      assert(remoteBranchExists(fixture.root, fixture.branch), "summary unexpectedly deleted remote branch");
      const manifest = readJson(join(fixture.stateRoot, "tasks", "cleanup-task.json"));
      assert(manifest.status === "merged", `manifest status is ${manifest.status}`);
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

  test("cleanup-merged trusts merged PR head when local delivery metadata is stale", () => {
    const fixture = createMergedCleanupFixture();
    try {
      const manifestPath = join(fixture.stateRoot, "tasks", "cleanup-task.json");
      const manifest = readJson(manifestPath);
      manifest.pr_delivery_head_sha = "0000000000000000000000000000000000000000";
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      const expectedHead = runGit(fixture.root, ["rev-parse", fixture.branch]).stdout;

      const dryRun = runFixtureScript(
        fixture,
        ["cleanup-merged", "cleanup-task", "--delete-remote", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { env: fixture.env },
      );
      assert(dryRun.code === 0, dryRun.stderr || dryRun.stdout);
      assert(dryRun.stdout.includes(`expected head ${expectedHead}`), dryRun.stdout || dryRun.stderr);

      const result = runFixtureScript(
        fixture,
        ["cleanup-merged", "cleanup-task", "--apply", "--delete-remote", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { env: fixture.env },
      );
      assert(result.code === 0, result.stderr || result.stdout);
      assert(!branchExists(fixture.root, fixture.branch), "cleanup did not delete local branch with stale manifest head");
      assert(!remoteBranchExists(fixture.root, fixture.branch), "cleanup did not delete remote branch with stale manifest head");
      const updated = readJson(manifestPath);
      assert(updated.status === "closed", `manifest status is ${updated.status}`);
      assert(updated.cleanup_expected_head_sha === expectedHead, "cleanup did not record the merged PR head");
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
    const metadataPath = join(stateRoot, "worktrees", ".git");
    mkdirSync(metadataPath, { recursive: true });

    const result = run(["cleanup-orphans", "--state-root", stateRoot]);

    assert(result.code === 0, result.stderr || result.stdout);
    assert(result.stdout.includes("orphan directory:"));
    assert(!result.stdout.includes(metadataPath), "cleanup-orphans listed hidden workspace metadata");
    assert(result.stdout.includes("Pass a query to target one orphan"));
    assert(existsSync(orphanPath), "cleanup-orphans unexpectedly deleted without --apply");
    assert(existsSync(metadataPath), "cleanup-orphans unexpectedly deleted hidden workspace metadata");
  });

  test("cleanup-orphans summary-json reports orphans without deleting", () => {
    const orphanPath = join(stateRoot, "worktrees", "orphan-summary-story");
    mkdirSync(join(orphanPath, "services", "supervisor", ".pytest_cache"), { recursive: true });
    const metadataPath = join(stateRoot, "worktrees", ".codex");
    mkdirSync(metadataPath, { recursive: true });

    const result = run(["cleanup-orphans", "--summary-json", "--state-root", stateRoot]);

    assert(result.code === 0, result.stderr || result.stdout);
    const packet = JSON.parse(result.stdout);
    assert(packet.worktreesDir === join(stateRoot, "worktrees"), result.stdout || result.stderr);
    assert(packet.query === null, result.stdout || result.stderr);
    assert(packet.all === false, result.stdout || result.stderr);
    assert(packet.counts.matchedOrphans >= 1, result.stdout || result.stderr);
    assert(packet.counts.hiddenMetadataSkipped >= 1, result.stdout || result.stderr);
    assert(packet.orphanDirectories.some((entry) => entry.name === "orphan-summary-story"), result.stdout || result.stderr);
    assert(!packet.orphanDirectories.some((entry) => entry.path === metadataPath), result.stdout || result.stderr);
    assert(packet.requiresTarget === true, result.stdout || result.stderr);
    assert(packet.mutation === "none; summary only", result.stdout || result.stderr);
    assert(existsSync(orphanPath), "cleanup-orphans summary-json removed an orphan directory");
    assert(existsSync(metadataPath), "cleanup-orphans summary-json removed hidden metadata");
  });

  test("cleanup-orphans refuses hidden workspace metadata even when queried", () => {
    const metadataPath = join(stateRoot, "worktrees", ".codex");
    mkdirSync(metadataPath, { recursive: true });

    const result = run(["cleanup-orphans", ".codex", "--apply", "--state-root", stateRoot]);

    assert(result.code === 0, result.stderr || result.stdout);
    assert(result.stdout.includes("No orphan worktree directories matched"), result.stdout || result.stderr);
    assert(existsSync(metadataPath), "cleanup-orphans removed hidden workspace metadata");
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
    env: {
      ...process.env,
      CODEX_WORKSPACE_TEST_IGNORE_SAFE_BACKLOG_LOCAL_BRANCHES: "1",
    },
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

function createFinishPrExistingCommitFixture() {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "codex-finish-existing-commit-"));
  const remoteRoot = `${fixtureRoot}-remote.git`;
  const stateRootFixture = join(fixtureRoot, "state");
  const fakeBin = join(fixtureRoot, "bin");
  const branch = "codex/resumed-task";
  const worktree = join(stateRootFixture, "worktrees", "resumed-task");
  const env = { ...process.env, PATH: `${fakeBin}:${process.env.PATH || ""}` };

  copyWorkspaceScriptFixture(fixtureRoot);
  mkdirSync(fakeBin, { recursive: true });
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
  mkdirSync(join(stateRootFixture, "worktrees"), { recursive: true });
  runGit(fixtureRoot, ["worktree", "add", "-q", worktree, branch]);
  runGit(worktree, ["config", "user.email", "codex-workspace-test@example.com"]);
  runGit(worktree, ["config", "user.name", "Codex Workspace Test"]);
  commitFile(worktree, "feature.txt", "feature\n", "feature");
  runGit(worktree, ["push", "-q", "-u", "origin", branch]);

  const fakeGh = join(fakeBin, "gh");
  writeFileSync(
    fakeGh,
    [
      "#!/usr/bin/env node",
      "const args = process.argv.slice(2);",
      "if (args[0] === '--version') { console.log('gh version test'); process.exit(0); }",
      "if (args[0] === 'pr' && args[1] === 'view') { process.exit(1); }",
      "if (args[0] === 'pr' && args[1] === 'create') { console.log('https://example.test/pull/456'); process.exit(0); }",
      "console.error(`unexpected gh args: ${args.join(' ')}`);",
      "process.exit(1);",
      "",
    ].join("\n"),
  );
  chmodSync(fakeGh, 0o755);

  mkdirSync(join(stateRootFixture, "tasks"), { recursive: true });
  writeFileSync(
    join(stateRootFixture, "tasks", "resumed-task.json"),
    `${JSON.stringify({
      schema_version: 1,
      task_id: "resumed-task",
      title: "Resumed task",
      description: "resumed task",
      repo_name: "fixture",
      repo_root: fixtureRoot,
      state_root: stateRootFixture,
      base_branch: "main",
      base_ref: "origin/main",
      branch,
      worktree_path: worktree,
      status: "active",
      mode: "pr",
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
    env,
  };
}

function cleanupFinishPrExistingCommitFixture(fixture) {
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

function createMergedCleanupFixture() {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "codex-merged-cleanup-"));
  const remoteRoot = `${fixtureRoot}-remote.git`;
  const stateRootFixture = join(fixtureRoot, "state");
  const fakeBin = join(fixtureRoot, "bin");
  const branch = "codex/cleanup-current";
  const worktree = join(stateRootFixture, "worktrees", "cleanup-task");
  const env = { ...process.env, PATH: `${fakeBin}:${process.env.PATH || ""}` };

  copyWorkspaceScriptFixture(fixtureRoot);
  mkdirSync(fakeBin, { recursive: true });
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
      source_assignment_id: "cleanup-assignment",
      owner: "runner-a",
      events: [],
    }, null, 2)}\n`,
  );
  mkdirSync(join(stateRootFixture, "assignments"), { recursive: true });
  writeFileSync(
    join(stateRootFixture, "assignments", "cleanup-assignment.json"),
    `${JSON.stringify({
      schema_version: 1,
      assignment_id: "cleanup-assignment",
      task_id: "cleanup-task",
      lane_slug: "cleanup-task",
      branch,
      worktree_path: worktree,
      status: "claimed",
      owner: "runner-a",
      phase: "handoff",
      runner_kind: "codex-cli",
      events: [],
      source_backlog_item: {
        item_id: "cleanup-task",
        branch_name: branch,
      },
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

function createWorkspaceDefaultBaseFixture(options = {}) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "codex-default-base-"));
  const stateRootFixture = join(fixtureRoot, "state");
  copyWorkspaceScriptFixture(fixtureRoot);

  runGit(fixtureRoot, ["init", "-q"]);
  runGit(fixtureRoot, ["config", "user.email", "codex-workspace-test@example.com"]);
  runGit(fixtureRoot, ["config", "user.name", "Codex Workspace Test"]);
  commitFile(fixtureRoot, "base.txt", "base\n", "base");
  runGit(fixtureRoot, ["branch", "-M", "main"]);
  runGit(fixtureRoot, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  if (options.withDev) {
    runGit(fixtureRoot, ["branch", "dev", "main"]);
    runGit(fixtureRoot, ["update-ref", "refs/remotes/origin/dev", "dev"]);
  }
  if (options.withLocalDevOnly) {
    runGit(fixtureRoot, ["branch", "dev", "main"]);
  }

  return {
    root: fixtureRoot,
    script: join(fixtureRoot, "scripts", "codex-workspace.mjs"),
    stateRoot: stateRootFixture,
  };
}

function cleanupWorkspaceDefaultBaseFixture(fixture) {
  if (!fixture) {
    return;
  }
  rmSync(fixture.root, { recursive: true, force: true });
}

function createBranchCleanupFixture() {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "codex-branch-cleanup-"));
  const activeWorktree = `${fixtureRoot}-active`;
  copyWorkspaceScriptFixture(fixtureRoot);
  const fixtureScript = join(fixtureRoot, "scripts", "codex-workspace.mjs");

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

function copyWorkspaceScriptFixture(fixtureRoot) {
  const fixtureScriptsDir = join(fixtureRoot, "scripts");
  const fixtureLibDir = join(fixtureScriptsDir, "lib");
  const sourceLibDir = join(rootDir, "scripts", "lib");
  mkdirSync(fixtureLibDir, { recursive: true });
  writeFileSync(join(fixtureScriptsDir, "codex-workspace.mjs"), readFileSync(scriptPath, "utf8"));
  writeFileSync(
    join(fixtureScriptsDir, "anti-churn-guidance-hook.mjs"),
    readFileSync(join(rootDir, "scripts", "anti-churn-guidance-hook.mjs"), "utf8"),
  );
  for (const name of readdirSync(sourceLibDir).filter((entry) => entry.endsWith(".mjs"))) {
    writeFileSync(join(fixtureLibDir, name), readFileSync(join(sourceLibDir, name), "utf8"));
  }
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

function refSnapshot(cwd) {
  return runGit(cwd, ["for-each-ref", "--format=%(refname):%(objectname)", "refs/heads", "refs/remotes"]).stdout;
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

function expectedClaimCandidate() {
  return {
    slug: "dispatcher-closed-source-guard-filter-empty-state-shortcut-reason-keyboard-loop-refresh",
    title: "dispatcher closed source guard filter empty state shortcut reason keyboard loop refresh",
    branch: "codex/dispatcher-closed-source-guard-filter-empty-state-shortcut-reason-keyboard-loop-refresh",
  };
}

function expectedAuthorityClaimCandidate() {
  return {
    slug: "authority-blocked-work",
    title: "authority blocked approval scope readiness",
    branch: "codex/authority-blocked-approval-scope-readiness",
  };
}

function seedClosedSafeBacklogManifests(stateRootPath) {
  const tasksDir = join(stateRootPath, "tasks");
  mkdirSync(tasksDir, { recursive: true });

  for (const laneSlug of [
    "verification-surface-hardening",
    "github-delivery-hygiene",
    "read-only-evidence-polish",
    "worker-backlog-queue-refresh",
    "lane-handoff-evidence-refresh",
    "report-catalog-shortcut-refresh",
    "dispatcher-continuity-snapshot-refresh",
    "assignment-report-queue-proof-refresh",
    "dispatcher-queue-state-fixtures-refresh",
    "dispatcher-queue-handoff-badges-refresh",
    "dispatcher-queue-handoff-status-refresh",
    "dispatcher-queue-handoff-lifecycle-refresh",
    "dispatcher-queue-handoff-recovery-refresh",
    "dispatcher-queue-handoff-audit-refresh",
    "dispatcher-queue-handoff-audit-retention-refresh",
    "dispatcher-queue-handoff-audit-query-refresh",
    "dispatcher-queue-handoff-audit-export-refresh",
    "dispatcher-queue-handoff-audit-download-refresh",
    "dispatcher-queue-handoff-audit-json-refresh",
    "dispatcher-queue-handoff-audit-json-schema-refresh",
    "dispatcher-queue-handoff-audit-json-validation-refresh",
    "dispatcher-queue-handoff-audit-json-validation-fixtures-refresh",
    "dispatcher-cleanup-assignment-closure-refresh",
    "dispatcher-cleanup-assignment-report-refresh",
    "dispatcher-assignment-panel-filter-refresh",
    "dispatcher-closed-lane-requeue-guard-refresh",
  ]) {
    const manifestPath = join(tasksDir, `closed-${laneSlug}.json`);
    if (existsSync(manifestPath)) {
      continue;
    }
    writeFileSync(
      manifestPath,
      `${JSON.stringify(
        {
          task_id: `closed-${laneSlug}`,
          branch: `codex/${laneSlug}`,
          worktree_path: rootDir,
          base_branch: "main",
          status: "closed",
          owner: "fixture-runner",
          owner_updated_at: "2026-06-22T00:00:00.000Z",
        },
        null,
        2,
      )}\n`,
    );
  }
}

function seedUnownedSafeBacklogWorkspace(stateRootPath, laneSlug, branch = `codex/${laneSlug}`) {
  const tasksDir = join(stateRootPath, "tasks");
  mkdirSync(tasksDir, { recursive: true });
  writeFileSync(
    join(tasksDir, `${laneSlug}-workspace.json`),
    `${JSON.stringify(
      {
        task_id: `${laneSlug}-workspace`,
        branch,
        worktree_path: rootDir,
        base_branch: "main",
        status: "active",
        owner: "",
        created_at: "2026-06-22T00:00:00.000Z",
        updated_at: "2026-06-22T00:00:00.000Z",
        events: [],
      },
      null,
      2,
    )}\n`,
  );
}

function seedUnownedVerificationWorkspace(stateRootPath) {
  seedUnownedSafeBacklogWorkspace(stateRootPath, "verification-surface-hardening");
}

function seedClaimedSafeBacklogAssignment(stateRootPath, laneSlug, owner, branch = `codex/${laneSlug}`) {
  const assignmentsDir = join(stateRootPath, "assignments");
  mkdirSync(assignmentsDir, { recursive: true });
  const now = new Date().toISOString();
  writeFileSync(
    join(assignmentsDir, `${laneSlug}.json`),
    `${JSON.stringify(
      {
        assignment_id: laneSlug,
        task_id: laneSlug,
        lane_slug: laneSlug,
        branch,
        status: "claimed",
        owner,
        owner_updated_at: now,
        created_at: now,
        updated_at: now,
        events: [],
      },
      null,
      2,
    )}\n`,
  );
}

function seedClosedSourceCompletion(stateRootPath, candidate) {
  const tasksDir = join(stateRootPath, "tasks");
  const assignmentsDir = join(stateRootPath, "assignments");
  mkdirSync(tasksDir, { recursive: true });
  mkdirSync(assignmentsDir, { recursive: true });
  const closedAt = "2026-06-23T12:57:05.000Z";
  const sourceBacklogItem = {
    item_id: candidate.slug,
    status: "ready",
    recommended_slice_size: "medium_to_large",
    branch_name: candidate.branch,
    start_command: `node ./scripts/codex-workspace.mjs start "${candidate.title}"`,
  };
  writeFileSync(
    join(assignmentsDir, `${candidate.slug}.json`),
    `${JSON.stringify(
      {
        assignment_id: candidate.slug,
        task_id: `closed-${candidate.slug}`,
        lane_slug: candidate.slug,
        branch: candidate.branch,
        status: "closed",
        owner: "runner-a",
        closed_at: closedAt,
        source_backlog_item: sourceBacklogItem,
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(tasksDir, `closed-${candidate.slug}.json`),
    `${JSON.stringify(
      {
        task_id: `closed-${candidate.slug}`,
        branch: candidate.branch,
        worktree_path: rootDir,
        base_branch: "main",
        status: "closed",
        owner: "runner-a",
        closed_at: closedAt,
        source_assignment_id: candidate.slug,
        source_backlog_item: sourceBacklogItem,
      },
      null,
      2,
    )}\n`,
  );
}

function seedOpenDeliveryManifest(stateRootPath, candidate) {
  const tasksDir = join(stateRootPath, "tasks");
  mkdirSync(tasksDir, { recursive: true });
  writeFileSync(
    join(tasksDir, `${candidate.slug}.json`),
    `${JSON.stringify(
      {
        task_id: candidate.slug,
        title: candidate.title,
        branch: candidate.branch,
        worktree_path: rootDir,
        base_branch: "dev",
        status: "pr_open",
        pr_url: "https://example.test/pull/282",
        pr_number: 282,
        owner: candidate.owner || "runner-a",
        created_at: "2026-06-27T00:00:00.000Z",
        updated_at: "2026-06-27T00:00:00.000Z",
        events: [],
      },
      null,
      2,
    )}\n`,
  );
}

function seedGeneratedSuccessorPrerequisites(stateRootPath, blockerOwner = "runner-b") {
  seedClosedSafeBacklogManifests(stateRootPath);
  seedClaimedSafeBacklogAssignment(stateRootPath, "read-only-evidence-polish", blockerOwner);
}

function seedClaimedVerificationAssignment(stateRootPath, owner) {
  seedClaimedSafeBacklogAssignment(stateRootPath, "verification-surface-hardening", owner);
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

function assertIncludesAny(value, patterns) {
  assert(
    patterns.some((pattern) => value.includes(pattern)),
    `Expected output to include one of: ${patterns.join(", ")}\n\n${value}`,
  );
}
