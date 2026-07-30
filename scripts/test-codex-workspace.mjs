import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { evaluateMutationAdmission } from "./lib/mutation-admission.mjs";
import { handoffAdmittedManagedLane } from "./lib/mutation-admission-workspace-handoff.mjs";
import { approveManagedSourceWrite } from "./lib/mutation-admission-prewrite-guard.mjs";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const scriptPath = join(rootDir, "scripts", "codex-workspace.mjs");
const stateRoot = mkdtempSync(join(tmpdir(), "codex-workspace-test-"));
const testFilter = String(process.env.CODEX_WORKSPACE_TEST_FILTER || "").trim().toLowerCase();
const routingPreviewCheckLeafStages = Object.freeze([
  "test:supervisor:check-routing-preview-01",
  "test:supervisor:check-routing-preview-02",
  "test:supervisor:check-routing-preview-03",
  "test:supervisor:check-routing-preview-04",
  "test:supervisor:check-routing-preview-05",
  "test:supervisor:check-routing-preview-06",
  "test:supervisor:check-routing-preview-07",
  "test:supervisor:check-routing-preview-08",
]);
const supervisorCheckLeaves = Object.freeze([
  "test:supervisor:check:preflight",
  "test:supervisor:check:non-integration",
  "test:supervisor:check:integration:orchestrator-fake-workers",
  "test:supervisor:check:integration:operational-action-v1-pause-drain",
  "test:supervisor:check:integration:work-packets",
  "test:supervisor:check:integration:bmad-import-parser",
  "test:supervisor:check:integration:epic25-evidence-chain",
  ...routingPreviewCheckLeafStages,
  "test:supervisor:check:integration:review-route-packet",
  "test:supervisor:check:integration:manager-source-intake-adapter",
  "test:supervisor:check:integration:operational-action-v1-retry-reassign",
  "test:supervisor:check:integration:candidate-work-api",
  "test:supervisor:check:integration:local-dogfood-attestation",
  "test:supervisor:check:integration:manager-terminal-events",
  "test:supervisor:check:integration:supervisor-flow",
]);
let executedTestCount = 0;

const nestedNodeProbe = spawnSync(process.execPath, ["-e", ""], {
  cwd: rootDir,
  encoding: "utf8",
  stdio: "pipe",
});
if (nestedNodeProbe.error?.code === "EPERM") {
  console.log("SKIP: codex-workspace CLI integration tests require nested Node child processes; sandbox denied spawnSync with EPERM.");
  console.log("OK: run node ./scripts/test-codex-workspace.mjs outside the sandbox for full CLI integration coverage.");
  rmSync(stateRoot, { recursive: true, force: true });
  process.exit(0);
}

try {
  test("child JSON command guard reports empty stdout as sandbox/process boundary", () => {
    const guarded = guardExpectedJsonResult(["list", "--summary-json"], {
      code: 1,
      stdout: "",
      stderr: "SyntaxError: Unexpected end of JSON input",
    });

    assert(guarded.code === 1, guarded.stderr);
    assert(guarded.stderr.includes("sandbox/process boundary"), guarded.stderr);
    assert(guarded.stderr.includes("expectedJson=true"), guarded.stderr);
    assert(guarded.stderr.includes("stdoutLength=0"), guarded.stderr);
    assert(guarded.stderr.includes("exitCode=1"), guarded.stderr);
    assert(guarded.stderr.includes("node ./scripts/codex-workspace.mjs list --summary-json"), guarded.stderr);
    assert(guarded.stderr.includes("rerun the exact same read-only command outside the sandbox"), guarded.stderr);
  });

  test("test harness emits a deterministic sanitized failure marker", () => {
    const markers = [];
    let caught = null;
    try {
      invokeTest("fixture failure marker probe", () => {
        throw new Error("fixture-secret-token-123");
      }, (marker) => markers.push(marker));
    } catch (error) {
      caught = error;
    }

    assert(caught instanceof Error, "fixture failure probe did not rethrow its error");
    assert(markers.length === 1, JSON.stringify(markers));
    assert(markers[0] === 'TEST_FAILURE={"test":"fixture failure marker probe"}', JSON.stringify(markers));
    assert(!markers[0].includes("fixture-secret-token-123"), markers[0]);
  });

  test("resumable check fixture requires explicit declarations for source stages outside its executable plan", () => {
    let message = "";
    try {
      installFixtureResumableCheckPlan({}, ["check:leaf"], {}, ["check:aggregate"]);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    assert(message.includes("explicit declared source stages"), message);
  });

  test("record-check-stage-evidence help derives owner identity instead of advertising a caller owner option", () => {
    const source = readFileSync(scriptPath, "utf8");
    const usage = source.match(/record-check-stage-evidence options:[\s\S]*?inspect-task-lock options:/)?.[0] || "";
    assert(usage.includes("Runner identity is derived from the current runner"), usage);
    assert(!usage.includes("--owner <id>"), usage);
  });

  test("child JSON command guard reports fixture child empty stdout", () => {
    const fixtureScript = join(tmpdir(), "codex-json-boundary-fixture", "empty-json-child.mjs");
    const guarded = guardExpectedJsonResult(["--summary-json", "--label", "value with space"], {
      code: 1,
      stdout: "",
      stderr: "fixture stderr with space",
    }, {
      commandPrefix: ["node", fixtureScript],
    });

    assert(guarded.code === 1, guarded.stderr);
    assert(guarded.stderr.includes("sandbox/process boundary"), guarded.stderr);
    assert(guarded.stderr.includes("fixture stderr with space"), guarded.stderr);
    assert(guarded.stderr.includes("'value with space'"), guarded.stderr);
    assert(guarded.stderr.includes(fixtureScript), guarded.stderr);
  });

  test("focused test filter fails closed when it matches no tests", () => {
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      cwd: rootDir,
      encoding: "utf8",
      stdio: "pipe",
      env: { ...process.env, CODEX_WORKSPACE_TEST_FILTER: "definitely-no-codex-workspace-test-name" },
    });
    assert((result.status ?? 0) !== 0, "unknown focused test filter unexpectedly succeeded");
    assert((result.stderr || "").includes("matched no tests"), result.stderr || result.stdout);
  });

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

  test("doctor summary-json exposes a read-only Base Checkout recovery packet", () => {
    const doctorStateRoot = mkdtempSync(join(tmpdir(), "codex-doctor-base-recovery-"));
    const beforeStatus = runGit(rootDir, ["status", "--porcelain=v1", "-z"]).stdout;
    try {
      const result = run(["doctor", "--summary-json", "--state-root", doctorStateRoot]);
      assert(result.code === 0, result.stderr || result.stdout);
      const packet = JSON.parse(result.stdout);
      const recovery = packet.baseCheckoutRecovery;
      assert(["clear", "recovery_required", "inspection_unknown"].includes(recovery.status), result.stdout || result.stderr);
      assert(recovery.mutation === "none; inspection only", result.stdout || result.stderr);
      assert(recovery.checkout === null || Number.isInteger(recovery.checkout.changedPathCount), result.stdout || result.stderr);
      assert(recovery.checkout === null || !Object.hasOwn(recovery.checkout, "changedPaths"), result.stdout || result.stderr);
      if (recovery.status === "recovery_required") {
        assert(recovery.outcome === "recovery_required", result.stdout || result.stderr);
        assert(recovery.projection?.column === "Needs attention", result.stdout || result.stderr);
      }
      assert(runGit(rootDir, ["status", "--porcelain=v1", "-z"]).stdout === beforeStatus, "doctor recovery inspection changed the Base Checkout index or worktree state");
    } finally {
      rmSync(doctorStateRoot, { recursive: true, force: true });
    }
  });

  test("doctor persists and explicitly resolves a metadata-only break-glass recovery marker", () => {
    const doctorStateRoot = mkdtempSync(join(tmpdir(), "codex-doctor-break-glass-"));
    const markerPath = join(doctorStateRoot, "recovery", "base-checkout.json");
    const beforeStatus = runGit(rootDir, ["status", "--porcelain=v1", "-z"]).stdout;
    try {
      const recorded = run(["doctor", "--break-glass", "--summary-json", "--state-root", doctorStateRoot]);
      assert(recorded.code === 0, recorded.stderr || recorded.stdout);
      const recordedPacket = JSON.parse(recorded.stdout);
      assert(recordedPacket.baseCheckoutRecovery.reasonCode === "recovery.break_glass_edit", recorded.stdout || recorded.stderr);
      assert(recordedPacket.mutation === "metadata-only break-glass recovery marker recorded", recorded.stdout || recorded.stderr);
      const activeMarker = JSON.parse(readFileSync(markerPath, "utf8"));
      assert(activeMarker.status === "active", JSON.stringify(activeMarker));
      assert(activeMarker.reasonCode === "recovery.break_glass_edit", JSON.stringify(activeMarker));
      assert(!Object.hasOwn(activeMarker, "diff"), JSON.stringify(activeMarker));

      const later = run(["doctor", "--summary-json", "--state-root", doctorStateRoot]);
      assert(later.code === 0, later.stderr || later.stdout);
      const laterPacket = JSON.parse(later.stdout);
      assert(laterPacket.baseCheckoutRecovery.reasonCode === "recovery.break_glass_edit", later.stdout || later.stderr);
      assert(laterPacket.baseCheckoutRecovery.recoveryMarker.status === "active", later.stdout || later.stderr);
      assert(laterPacket.mutation === "none; summary only", later.stdout || later.stderr);

      const resolved = run([
        "doctor", "--resolve-break-glass", "--resolution", "operator inspected marker", "--summary-json", "--state-root", doctorStateRoot,
      ]);
      assert(resolved.code === 0, resolved.stderr || resolved.stdout);
      const resolvedMarker = JSON.parse(readFileSync(markerPath, "utf8"));
      assert(resolvedMarker.status === "resolved", JSON.stringify(resolvedMarker));
      assert(typeof resolvedMarker.resolvedAt === "string", JSON.stringify(resolvedMarker));
      assert(resolvedMarker.resolution === "operator inspected marker", JSON.stringify(resolvedMarker));
      assert(!Object.hasOwn(resolvedMarker, "diff"), JSON.stringify(resolvedMarker));
      assert(runGit(rootDir, ["status", "--porcelain=v1", "-z"]).stdout === beforeStatus, "break-glass marker handling changed the Base Checkout index or worktree state");
    } finally {
      rmSync(doctorStateRoot, { recursive: true, force: true });
    }
  });

  test("doctor rejects Base Checkout break-glass marker writes inside tracked source", () => {
    const sourceMarkerPath = join(rootDir, "recovery", "base-checkout.json");
    const markerExisted = existsSync(sourceMarkerPath);
    const beforeMarker = markerExisted ? readFileSync(sourceMarkerPath, "utf8") : null;
    const beforeStatus = runGit(rootDir, ["status", "--porcelain=v1", "-z"]).stdout;
    for (const args of [
      ["doctor", "--break-glass", "--summary-json", "--state-root", "."],
      ["doctor", "--resolve-break-glass", "--resolution", "operator inspected marker", "--summary-json", "--state-root", "."],
    ]) {
      const result = run(args);
      assert(result.code !== 0, result.stdout || result.stderr);
      assert(result.stderr.includes("inside tracked source"), result.stdout || result.stderr);
      assert(existsSync(sourceMarkerPath) === markerExisted, "source-root marker path changed despite rejected storage boundary");
      if (markerExisted) assert(readFileSync(sourceMarkerPath, "utf8") === beforeMarker, "existing source-root marker changed despite rejected storage boundary");
      assert(runGit(rootDir, ["status", "--porcelain=v1", "-z"]).stdout === beforeStatus, "rejected source-root marker write changed the Base Checkout index or worktree state");
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
      spawnSync("git", ["worktree", "prune", "--expire", "now"], {
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

  test("coordination-report classifies workspace stale-lane closeout readiness metadata only", () => {
    const reportStateRoot = mkdtempSync(join(tmpdir(), "codex-closeout-readiness-"));
    const worktrees = [];
    try {
      const tasksDir = join(reportStateRoot, "tasks");
      mkdirSync(tasksDir, { recursive: true });
      const cleanCurrent = createCoordinationReportGitWorktree("codex-closeout-current-");
      const staleManager = createCoordinationReportGitWorktree("codex-closeout-manager-");
      const dirtyPreserve = createCoordinationReportGitWorktree("codex-closeout-dirty-", { dirty: true });
      const cleanupReady = createCoordinationReportGitWorktree("codex-closeout-cleanup-");
      const operatorDecision = createCoordinationReportGitWorktree("codex-closeout-decision-");
      worktrees.push(cleanCurrent, staleManager, dirtyPreserve, cleanupReady, operatorDecision);
      const freshHeartbeat = new Date().toISOString();
      const staleHeartbeat = "2026-07-01T18:00:00.000Z";

      const manifests = [
        {
          task_id: "current-owned-clean",
          title: "Current owned clean",
          branch: "codex/current-owned-clean",
          base_branch: "dev",
          status: "active",
          owner: "runner-a",
          worktree_path: cleanCurrent,
          owner_updated_at: freshHeartbeat,
        },
        {
          task_id: "stale-manager-clean",
          title: "Stale manager clean",
          branch: "codex/stale-manager-clean",
          base_branch: "dev",
          status: "active",
          owner: "manager-control-plane",
          worktree_path: staleManager,
          owner_updated_at: staleHeartbeat,
        },
        {
          task_id: "dirty-preserve-first",
          title: "Dirty preserve first",
          branch: "codex/dirty-preserve-first",
          base_branch: "dev",
          status: "active",
          owner: "manager-control-plane",
          worktree_path: dirtyPreserve,
          owner_updated_at: staleHeartbeat,
        },
        {
          task_id: "clean-cleanup-candidate",
          title: "Clean cleanup candidate",
          branch: "codex/clean-cleanup-candidate",
          base_branch: "dev",
          status: "merged",
          owner: "runner-a",
          worktree_path: cleanupReady,
          owner_updated_at: freshHeartbeat,
          pr_number: 321,
          merged_at: freshHeartbeat,
        },
        {
          task_id: "operator-decision-clean",
          title: "Operator decision clean",
          branch: "codex/operator-decision-clean",
          base_branch: "dev",
          status: "active",
          owner: "runner-b",
          worktree_path: operatorDecision,
          owner_updated_at: freshHeartbeat,
        },
      ];
      for (const manifest of manifests) {
        writeFileSync(join(tasksDir, `${manifest.task_id}.json`), `${JSON.stringify(manifest, null, 2)}\n`);
      }
      const before = taskSnapshot(tasksDir);

      const result = run([
        "coordination-report",
        "--summary-json",
        "--state-root",
        reportStateRoot,
        "--owner",
        "runner-a",
        "--stale-after-seconds",
        "86400",
      ]);

      assert(result.code === 0, result.stderr || result.stdout);
      const packet = JSON.parse(result.stdout);
      const readiness = packet.workspaceCloseoutReadiness;
      const activeCurrentLane = packet.activeManagedWorktrees.find((lane) => lane.taskId === "current-owned-clean");
      assert(activeCurrentLane.reasonCode === "active_current_owner", result.stdout || result.stderr);
      assert(readiness.schemaVersion === "workspace-closeout-readiness/v0", result.stdout || result.stderr);
      assert(readiness.metadataOnly === true, result.stdout || result.stderr);
      assert(readiness.bucketPriority[0] === "dirtyPreserveFirstLanes", result.stdout || result.stderr);
      assert(Array.isArray(readiness[readiness.bucketPriority[0]]), result.stdout || result.stderr);
      assert(readiness.counts.currentlyOwnedActiveWork === 1, result.stdout || result.stderr);
      assert(readiness.counts.staleManagerOwnedLanes === 1, result.stdout || result.stderr);
      assert(readiness.counts.dirtyPreserveFirstLanes === 1, result.stdout || result.stderr);
      assert(readiness.counts.cleanCloseoutCandidates === 1, result.stdout || result.stderr);
      assert(readiness.counts.needsOperatorDecision === 1, result.stdout || result.stderr);
      assert(readiness.currentlyOwnedActiveWork[0].taskId === "current-owned-clean", result.stdout || result.stderr);
      assert(readiness.currentlyOwnedActiveWork[0].reasonCode === "current_owner_active_work", result.stdout || result.stderr);
      assert(readiness.staleManagerOwnedLanes[0].taskId === "stale-manager-clean", result.stdout || result.stderr);
      assert(readiness.staleManagerOwnedLanes[0].reasonCode === "stale_manager_owner", result.stdout || result.stderr);
      assert(readiness.dirtyPreserveFirstLanes[0].taskId === "dirty-preserve-first", result.stdout || result.stderr);
      assert(readiness.dirtyPreserveFirstLanes[0].dirtyPathCount === 1, result.stdout || result.stderr);
      assert(readiness.cleanCloseoutCandidates[0].taskId === "clean-cleanup-candidate", result.stdout || result.stderr);
      assert(readiness.cleanCloseoutCandidates[0].prNumber === 321, result.stdout || result.stderr);
      assert(readiness.needsOperatorDecision[0].taskId === "operator-decision-clean", result.stdout || result.stderr);
      assert(readiness.needsOperatorDecision[0].reasonCode === "owned_by_other_runner", result.stdout || result.stderr);
      assert(!JSON.stringify(readiness).includes("uncommitted workspace content"), "readiness report retained dirty source content");
      const textResult = run(["coordination-report", "--state-root", reportStateRoot, "--owner", "runner-a"]);
      assert(textResult.code === 0, textResult.stderr || textResult.stdout);
      assert(textResult.stdout.includes("- Workspace stale-lane closeout readiness:"), textResult.stdout || textResult.stderr);
      assert(textResult.stdout.includes("stale manager-owned lanes"), textResult.stdout || textResult.stderr);
      assert(textResult.stdout.includes("reason_code=stale_manager_owner"), textResult.stdout || textResult.stderr);
      assert(taskSnapshot(tasksDir) === before, "coordination closeout readiness report mutated manifests");
    } finally {
      rmSync(reportStateRoot, { recursive: true, force: true });
      for (const worktree of worktrees) {
        rmSync(worktree, { recursive: true, force: true });
      }
    }
  });

  test("coordination-report closeout readiness fails closed for unsafe edge cases", () => {
    const reportStateRoot = mkdtempSync(join(tmpdir(), "codex-closeout-readiness-edge-"));
    const worktrees = [];
    try {
      const tasksDir = join(reportStateRoot, "tasks");
      mkdirSync(tasksDir, { recursive: true });
      const authorityBlocked = createCoordinationReportGitWorktree("codex-closeout-authority-");
      const freshManager = createCoordinationReportGitWorktree("codex-closeout-fresh-manager-");
      worktrees.push(authorityBlocked, freshManager);
      const freshHeartbeat = new Date().toISOString();
      const staleHeartbeat = "2026-07-01T18:00:00.000Z";
      const missingWorktree = join(reportStateRoot, "missing-worktree");
      const manifests = [
        {
          task_id: "missing-merged-evidence",
          title: "Missing merged evidence",
          branch: "codex/missing-merged-evidence",
          base_branch: "dev",
          status: "pr_open",
          owner: "runner-a",
          worktree_path: missingWorktree,
          owner_updated_at: freshHeartbeat,
          pr_number: 654,
          merged_at: freshHeartbeat,
        },
        {
          task_id: "authority-blocked-current",
          title: "Authority blocked current",
          branch: "codex/authority-blocked-current",
          base_branch: "dev",
          status: "blocked_authority",
          owner: "runner-a",
          worktree_path: authorityBlocked,
          owner_updated_at: freshHeartbeat,
        },
        {
          task_id: "fresh-manager-heartbeat",
          title: "Fresh manager heartbeat",
          branch: "codex/fresh-manager-heartbeat",
          base_branch: "dev",
          status: "active",
          owner: "manager-control-plane",
          worktree_path: freshManager,
          owner_updated_at: staleHeartbeat,
          last_heartbeat_at: freshHeartbeat,
        },
      ];
      for (const manifest of manifests) {
        writeFileSync(join(tasksDir, `${manifest.task_id}.json`), `${JSON.stringify(manifest, null, 2)}\n`);
      }
      const before = taskSnapshot(tasksDir);

      const result = run([
        "coordination-report",
        "--summary-json",
        "--state-root",
        reportStateRoot,
        "--owner",
        "runner-a",
        "--stale-after-seconds",
        "86400",
      ]);

      assert(result.code === 0, result.stderr || result.stdout);
      const readiness = JSON.parse(result.stdout).workspaceCloseoutReadiness;
      assert(readiness.counts.currentlyOwnedActiveWork === 0, result.stdout || result.stderr);
      assert(readiness.counts.staleManagerOwnedLanes === 0, result.stdout || result.stderr);
      assert(readiness.counts.cleanCloseoutCandidates === 0, result.stdout || result.stderr);
      assert(readiness.counts.needsOperatorDecision === 3, result.stdout || result.stderr);
      assert(
        readiness.needsOperatorDecision.some((lane) => lane.taskId === "missing-merged-evidence" && lane.reasonCode === "worktree_path_missing"),
        result.stdout || result.stderr,
      );
      assert(
        readiness.needsOperatorDecision.some((lane) => lane.taskId === "authority-blocked-current" && lane.reasonCode === "manifest_authority_blocked"),
        result.stdout || result.stderr,
      );
      assert(
        readiness.needsOperatorDecision.some((lane) => lane.taskId === "fresh-manager-heartbeat" && lane.reasonCode === "owned_by_other_runner"),
        result.stdout || result.stderr,
      );
      assert(taskSnapshot(tasksDir) === before, "coordination edge readiness report mutated manifests");
    } finally {
      rmSync(reportStateRoot, { recursive: true, force: true });
      for (const worktree of worktrees) {
        rmSync(worktree, { recursive: true, force: true });
      }
    }
  });

  test("coordination-report closeout readiness summary truncates bucket rows but keeps full counts", () => {
    const reportStateRoot = mkdtempSync(join(tmpdir(), "codex-closeout-readiness-truncate-"));
    const worktrees = [];
    try {
      const tasksDir = join(reportStateRoot, "tasks");
      mkdirSync(tasksDir, { recursive: true });
      const freshHeartbeat = new Date().toISOString();
      for (let index = 0; index < 11; index += 1) {
        const taskId = `current-owned-clean-${index}`;
        const worktree = createCoordinationReportGitWorktree(`codex-closeout-current-${index}-`);
        worktrees.push(worktree);
        writeFileSync(
          join(tasksDir, `${taskId}.json`),
          `${JSON.stringify(
            {
              task_id: taskId,
              title: `Current owned clean ${index}`,
              branch: `codex/current-owned-clean-${index}`,
              base_branch: "dev",
              status: "active",
              owner: "runner-a",
              worktree_path: worktree,
              owner_updated_at: freshHeartbeat,
            },
            null,
            2,
          )}\n`,
        );
      }

      const result = run([
        "coordination-report",
        "--summary-json",
        "--state-root",
        reportStateRoot,
        "--owner",
        "runner-a",
      ]);

      assert(result.code === 0, result.stderr || result.stdout);
      const readiness = JSON.parse(result.stdout).workspaceCloseoutReadiness;
      assert(readiness.counts.currentlyOwnedActiveWork === 11, result.stdout || result.stderr);
      assert(readiness.currentlyOwnedActiveWork.length === 10, result.stdout || result.stderr);
      assert(readiness.currentlyOwnedActiveWorkTruncated === true, result.stdout || result.stderr);
    } finally {
      rmSync(reportStateRoot, { recursive: true, force: true });
      for (const worktree of worktrees) {
        rmSync(worktree, { recursive: true, force: true });
      }
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

  test("start uses a validated explicit base ref without re-resolving the admitted pair", () => {
    const fixture = createWorkspaceDefaultBaseFixture({ withDev: true });
    const taskId = "explicit-base-ref-lane";
    const branch = "codex/explicit-base-ref-lane";
    const worktree = join(fixture.stateRoot, "worktrees", taskId);
    try {
      runGit(fixture.root, ["switch", "-q", "dev"]);
      commitFile(fixture.root, "local-dev-only.txt", "local dev\n", "local dev advance");
      const localDevHead = runGit(fixture.root, ["rev-parse", "dev"]).stdout;
      runGit(fixture.root, ["switch", "-q", "main"]);

      const result = runFixtureScript(fixture, [
        "start", "explicit base ref lane",
        "--base", "dev", "--base-ref", "dev", "--no-fetch",
        "--task-id", taskId, "--branch", branch, "--worktree", worktree,
        "--owner", "runner-a", "--state-root", fixture.stateRoot,
      ]);
      const manifest = readJson(join(fixture.stateRoot, "tasks", `${taskId}.json`));

      assert(result.code === 0, result.stderr || result.stdout);
      assert(manifest.base_branch === "dev", JSON.stringify(manifest));
      assert(manifest.base_ref === "dev", JSON.stringify(manifest));
      assert(runGit(worktree, ["rev-parse", "HEAD"]).stdout === localDevHead, "start did not use the explicit local base ref");
    } finally {
      cleanupWorkspaceDefaultBaseFixture(fixture);
    }
  });

  test("invalid explicit base refs stop before fetch, manifest, branch, or worktree writes", () => {
    const fixture = createWorkspaceDefaultBaseFixture({ withDev: true });
    const taskId = "invalid-explicit-base-ref-lane";
    const branch = "codex/invalid-explicit-base-ref-lane";
    const worktree = join(fixture.stateRoot, "worktrees", taskId);
    const manifestPath = join(fixture.stateRoot, "tasks", `${taskId}.json`);
    try {
      const beforeRefs = refSnapshot(fixture.root);
      const beforeTasks = taskSnapshot(join(fixture.stateRoot, "tasks"));
      for (const { baseBranch, baseRef } of [
        { baseBranch: "dev", baseRef: "origin/main" },
        { baseBranch: "unavailable", baseRef: "unavailable" },
        { baseBranch: "a".repeat(251), baseRef: `origin/${"a".repeat(251)}` },
      ]) {
        const result = runFixtureScript(fixture, [
          "start", "invalid explicit base ref lane",
          "--base", baseBranch, "--base-ref", baseRef,
          "--task-id", taskId, "--branch", branch, "--worktree", worktree,
          "--owner", "runner-a", "--state-root", fixture.stateRoot,
        ]);
        assert(result.code !== 0, `${baseBranch}/${baseRef} unexpectedly started`);
        assert(!existsSync(manifestPath), `${baseBranch}/${baseRef} wrote a manifest`);
        assert(!existsSync(worktree), `${baseBranch}/${baseRef} created a worktree`);
        assert(!branchExists(fixture.root, branch), `${baseBranch}/${baseRef} created a branch`);
      }
      assert(refSnapshot(fixture.root) === beforeRefs, "invalid explicit base refs changed refs");
      assert(taskSnapshot(join(fixture.stateRoot, "tasks")) === beforeTasks, "invalid explicit base refs changed manifests");
    } finally {
      cleanupWorkspaceDefaultBaseFixture(fixture);
    }
  });

  test("a valueless base-ref flag is rejected before fallback resolution or lane mutation", () => {
    const fixture = createWorkspaceDefaultBaseFixture({ withDev: true });
    const taskId = "valueless-base-ref-lane";
    const branch = "codex/valueless-base-ref-lane";
    const worktree = join(fixture.stateRoot, "worktrees", taskId);
    const manifestPath = join(fixture.stateRoot, "tasks", `${taskId}.json`);
    try {
      runGit(fixture.root, ["branch", "true", "main"]);
      runGit(fixture.root, ["update-ref", "refs/remotes/origin/true", "true"]);
      const beforeRefs = refSnapshot(fixture.root);
      const beforeTasks = taskSnapshot(join(fixture.stateRoot, "tasks"));
      const result = runFixtureScript(fixture, [
        "start", "valueless base ref lane",
        "--base", "true", "--base-ref",
        "--task-id", taskId, "--branch", branch, "--worktree", worktree,
        "--owner", "runner-a", "--state-root", fixture.stateRoot,
      ]);

      assert(result.code !== 0, "valueless --base-ref unexpectedly started a lane");
      assert(result.stderr.includes("--base-ref requires a value"), result.stderr || result.stdout);
      assert(!existsSync(manifestPath), "valueless --base-ref wrote a manifest");
      assert(!existsSync(worktree), "valueless --base-ref created a worktree");
      assert(!branchExists(fixture.root, branch), "valueless --base-ref created a branch");
      assert(refSnapshot(fixture.root) === beforeRefs, "valueless --base-ref changed refs");
      assert(taskSnapshot(join(fixture.stateRoot, "tasks")) === beforeTasks, "valueless --base-ref changed manifests");
    } finally {
      cleanupWorkspaceDefaultBaseFixture(fixture);
    }
  });

  test("a 258-character explicit ref reaches the ref-length gate before lane mutation", () => {
    const fixture = createWorkspaceDefaultBaseFixture({ withDev: true });
    const baseBranch = "a".repeat(250);
    const baseRef = `origin/${baseBranch}x`;
    const taskId = "oversized-explicit-base-ref-lane";
    const branch = "codex/oversized-explicit-base-ref-lane";
    const worktree = join(fixture.stateRoot, "worktrees", taskId);
    const manifestPath = join(fixture.stateRoot, "tasks", `${taskId}.json`);
    try {
      runGit(fixture.root, ["branch", baseBranch, "main"]);
      runGit(fixture.root, ["update-ref", `refs/remotes/origin/${baseBranch}`, baseBranch]);
      const beforeRefs = refSnapshot(fixture.root);
      const beforeTasks = taskSnapshot(join(fixture.stateRoot, "tasks"));
      const result = runFixtureScript(fixture, [
        "start", "oversized explicit base ref lane",
        "--base", baseBranch, "--base-ref", baseRef,
        "--task-id", taskId, "--branch", branch, "--worktree", worktree,
        "--owner", "runner-a", "--state-root", fixture.stateRoot,
      ]);

      assert(baseRef.length === 258, baseRef.length);
      assert(result.code !== 0, "258-character --base-ref unexpectedly started a lane");
      assert(result.stderr.includes("Explicit base ref exceeds maximum length 257: 258"), result.stderr || result.stdout);
      assert(!existsSync(manifestPath), "oversized --base-ref wrote a manifest");
      assert(!existsSync(worktree), "oversized --base-ref created a worktree");
      assert(!branchExists(fixture.root, branch), "oversized --base-ref created a branch");
      assert(refSnapshot(fixture.root) === beforeRefs, "oversized --base-ref changed refs");
      assert(taskSnapshot(join(fixture.stateRoot, "tasks")) === beforeTasks, "oversized --base-ref changed manifests");
    } finally {
      cleanupWorkspaceDefaultBaseFixture(fixture);
    }
  });

  test("start accepts the producer-valid 250/257 explicit base pair", () => {
    const fixture = createWorkspaceDefaultBaseFixture({ withDev: true });
    const baseBranch = "a".repeat(250);
    const baseRef = `origin/${baseBranch}`;
    try {
      runGit(fixture.root, ["branch", baseBranch, "main"]);
      runGit(fixture.root, ["update-ref", `refs/remotes/${baseRef}`, baseBranch]);
      const result = runFixtureScript(fixture, [
        "start", "maximum explicit base ref lane", "--dry-run", "--summary-json",
        "--base", baseBranch, "--base-ref", baseRef,
        "--owner", "runner-a", "--state-root", fixture.stateRoot,
      ]);
      const packet = JSON.parse(result.stdout);

      assert(result.code === 0, result.stderr || result.stdout);
      assert(baseRef.length === 257, baseRef.length);
      assert(packet.baseBranch === baseBranch, result.stdout || result.stderr);
      assert(packet.baseRef === baseRef, result.stdout || result.stderr);
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
    assert(result.stdout.includes("emergency-stop"), result.stdout || result.stderr);
    assert(result.stdout.includes("cleanup-integrated [query]"), result.stdout || result.stderr);
    assert(result.stdout.includes("--base <ref>"), result.stdout || result.stderr);
    assert(result.stdout.includes("Defaults to dev"), result.stdout || result.stderr);
    assert(result.stdout.includes("Defaults to origin/dev"), result.stdout || result.stderr);
    assert(result.stdout.includes("Defaults to origin/main"), result.stdout || result.stderr);
  });

  test("subcommand help exits before finish-pr manifest handling", () => {
    const fixture = createFinishPrExistingCommitFixture();
    try {
      const manifestPath = join(fixture.stateRoot, "tasks", "resumed-task.json");
      const before = readFileSync(manifestPath, "utf8");

      for (const args of [
        ["finish-pr", "--help"],
        ["finish-pr", "-h"],
        ["finish-pr", "resumed-task", "--help"],
      ]) {
        const result = runFixtureScript(fixture, args, { cwd: fixture.worktree, env: fixture.env });
        assert(result.code === 0, result.stderr || result.stdout);
        assert(result.stderr === "", result.stderr || result.stdout);
        assert(result.stdout.includes("Usage: node ./scripts/codex-workspace.mjs <command> [options]"), result.stdout || result.stderr);
        assert(result.stdout.includes("--help, -h"), result.stdout || result.stderr);
        assert(readFileSync(manifestPath, "utf8") === before, `${args.join(" ")} changed the manifest`);
      }
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
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
    assert(result.stderr.includes("--mode must be either pr, experiment, or epic-batch"));
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

  test("finish-pr permits snapshot staging before verification but finalizes anti-churn before commit delivery", () => {
    const source = readFileSync(scriptPath, "utf8");
    const match = source.match(/function finishPr[\s\S]*?function runAntiChurnFinalization/);
    assert(match, "finishPr source or anti-churn finalization helper not found");
    assert(match[0].includes('plan.push("anti-churn hook evaluate --apply-safe --format json")'), "finish-pr dry-run plan must include anti-churn hook invocation");
    assert(match[0].includes("const antiChurn = runAntiChurnFinalization(manifest, state, { worktreeStatus, pr: existingPr });"), "finish-pr must invoke anti-churn finalization with concrete PR evidence");
    const snapshotStage = match[0].indexOf('runChecked("git", ["add", "--all"]');
    const checkVerification = match[0].indexOf("runResumableCheckVerification");
    const antiChurnFinalization = match[0].indexOf("const antiChurn = runAntiChurnFinalization");
    const deliveryStage = match[0].indexOf('runChecked("git", ["add", "--all"]', antiChurnFinalization);
    const commit = match[0].indexOf('runChecked("git", ["commit", "-m", commitMessage]');
    assert(
      snapshotStage >= 0 && snapshotStage < checkVerification && checkVerification < antiChurnFinalization,
      "finish-pr must stage the exact snapshot before verification when --stage-all is used",
    );
    assert(
      antiChurnFinalization < deliveryStage && antiChurnFinalization < commit,
      "anti-churn finalization must run before post-finalization staging/commit delivery mutation",
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

  test("finish-pr records PR creation and update as gated metadata-only evidence", () => {
    const source = readFileSync(scriptPath, "utf8");
    const finishPr = source.match(/function finishPr[\s\S]*?function runAntiChurnFinalization/);
    const evidenceBlock = source.match(/function shapePrDeliveryEvidence[\s\S]*?function shapeAntiChurnEvidencePacket/);
    assert(finishPr, "finishPr source not found");
    assert(evidenceBlock, "PR delivery evidence helper not found");
    assert(finishPr[0].includes("manifest.pr_delivery_evidence = shapePrDeliveryEvidence"), "finish-pr must shape PR delivery evidence");
    assert(finishPr[0].includes("prDeliveryEvidence: manifest.pr_delivery_evidence"), "finish-pr must attach PR evidence to the lane evidence packet");
    assert(
      finishPr[0].indexOf("runChecked(\"git\", [\"push\"") < finishPr[0].indexOf("manifest.pr_delivery_evidence = shapePrDeliveryEvidence"),
      "PR delivery evidence must be recorded only after a successful push",
    );
    for (const expected of [
      "operation",
      "create-pr",
      "update-existing-pr-reference",
      "authorityProfile",
      "standard-delivery",
      "headRevision",
      "pullRequestUrl",
      "pullRequestNumber",
      "pullRequestTitle",
      "pullRequestBodyLineCount",
      "pullRequestBodyCharCount",
      "verificationGate",
      "explicit-no-verify",
      "no-verification-profile",
      "requiredGates",
      "push succeeded before PR evidence is recorded",
      "stopLines",
      "no merge or cleanup from finish-pr",
      "metadataOnly",
      "recoveryPath",
    ]) {
      assert(evidenceBlock[0].includes(expected), `PR delivery evidence missing ${expected}`);
    }
    for (const forbidden of ["providerPayload", "rawPrompt", "rawCompletion", "reasoningTrace"]) {
      assert(!evidenceBlock[0].includes(forbidden), `PR delivery evidence must not retain ${forbidden}`);
    }
  });

  test("verify-pr-gates records exact-head check and review-thread evidence without merge mutation", () => {
    const source = readFileSync(scriptPath, "utf8");
    const gateCommand = source.match(/function verifyPrGates[\s\S]*?function buildPrGateEvidence/);
    assert(gateCommand, "verifyPrGates source not found");
    assert(gateCommand[0].includes("manifest.pr_gate_evidence = lockedPacket"), "verify-pr-gates must persist the gate packet");
    assert(gateCommand[0].includes("manifest.pr_review_state_checked_at = lockedPacket.checkedAt"), "review-thread freshness must be recorded");
    assert(gateCommand[0].includes("manifest.pr_checks_state_checked_at = lockedPacket.checkedAt"), "check freshness must be recorded");
    assert(gateCommand[0].includes("manifest.pr_exact_head_checked_at = lockedPacket.checkedAt"), "exact-head freshness must be recorded");
    assert(!gateCommand[0].includes("gh\", [\"pr\", \"merge\""), "verify-pr-gates must not merge");

    const evidence = source.match(/function buildPrGateEvidence[\s\S]*?function prGateHeadState/);
    assert(evidence, "buildPrGateEvidence source not found");
    assert(evidence[0].includes('"exact PR head matches local delivery head"'), "gate evidence must require exact-head proof");
    assert(evidence[0].includes('"thread-aware review query returned no unresolved non-outdated threads"'), "gate evidence must require thread-aware review proof");
    assert(evidence[0].includes('"all reported checks completed successfully"'), "gate evidence must require check proof");
    assert(evidence[0].includes('"delivery subagent audit recommends merge-ready for exact head"'), "gate evidence must require delivery subagent audit proof");
    assert(evidence[0].includes("shapeDeliverySubagentAuditEvidence"), "gate evidence must shape delivery subagent audit metadata");
    assert(evidence[0].includes("metadataOnly: true"), "gate evidence must be metadata-only");

    const packetBlock = source.match(/function buildLaneEvidencePacket[\s\S]*?function shapePrDeliveryEvidence/);
    assert(packetBlock, "lane evidence packet source not found");
    assert(packetBlock[0].includes("pr_gate: prGateEvidence"), "lane packet must attach PR gate evidence");
    assert(packetBlock[0].includes("delivery_subagent_audit: deliverySubagentAudit"), "lane packet must attach delivery subagent audit evidence");
    assert(packetBlock[0].includes("manifest.pr_gate_evidence || existingPacket.pr_gate"), "lane packet must preserve existing PR gate evidence");
  });

  test("manager gate packets record metadata-only authority decisions", () => {
    const source = readFileSync(scriptPath, "utf8");
    const helperBlock = source.match(/function shapeAuthorityDecisionEvidence[\s\S]*?function appendAuthorityDecision/);
    assert(helperBlock, "authority decision helper not found");
    for (const expected of [
      "operation",
      "authorityFamily",
      "authorityProfile",
      "decision",
      "allowed",
      "requiredGates",
      "satisfiedGates",
      "blockedReasons",
      "stopLines",
      "evidenceRefs",
      "nextSafeAction",
      "recoveryPath",
      "metadataOnly: true",
      "rawPayloadRetained: false",
    ]) {
      assert(helperBlock[0].includes(expected), `authority decision helper missing ${expected}`);
    }
    for (const forbidden of ["providerPayload", "rawPrompt", "rawCompletion", "reasoningTrace", "secret"]) {
      assert(!helperBlock[0].includes(forbidden), `authority decision helper must not retain ${forbidden}`);
    }

    const lanePacketBlock = source.match(/function buildLaneEvidencePacket[\s\S]*?function shapeAuthorityDecisionEvidence/);
    const dispatchBlock = source.match(/function dispatchPacket[\s\S]*?function buildDispatchNextSummary/);
    const dispatchHandoffBlock = source.match(/function dispatchHandoffPacket[\s\S]*?function recordManifestDispatchHandoff/);
    const takeoverBlock = source.match(/function takeoverPacket[\s\S]*?function buildTakeoverSummary/);
    const deliveryBlock = source.match(/function shapePrDeliveryEvidence[\s\S]*?function shapeAntiChurnEvidencePacket/);
    const gateBlock = source.match(/function buildPrGateEvidence[\s\S]*?function prGateHeadState/);
    const cleanupSummaryBlock = source.match(/function cleanupMergedReadySummary[\s\S]*?function cleanupPrSummary/);
    const cleanupApplyBlock = source.match(/function cleanupMergedResources[\s\S]*?function preflightCleanupBranchHeads/);
    for (const [name, block, expected] of [
      ["lane evidence packet", lanePacketBlock, "authority_decisions"],
      ["dispatch packet", dispatchBlock, "authority_decision"],
      ["dispatch handoff packet", dispatchHandoffBlock, "authority_decision"],
      ["takeover packet", takeoverBlock, "authority_decision"],
      ["PR delivery evidence", deliveryBlock, "authorityDecision"],
      ["PR gate evidence", gateBlock, "authorityDecision"],
      ["cleanup summary", cleanupSummaryBlock, "authorityDecision"],
      ["cleanup apply", cleanupApplyBlock, "cleanup_authority_decision"],
    ]) {
      assert(block, `${name} source not found`);
      assert(block[0].includes(expected), `${name} missing ${expected}`);
    }
    assert(
      cleanupApplyBlock[0].indexOf("deleteRemoteBranchIfPresent") < cleanupApplyBlock[0].indexOf("manifest.cleanup_authority_decision = shapeCleanupAuthorityDecision"),
      "cleanup apply authority must be recorded only after cleanup deletions finish",
    );
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

  test("resume prefers an exact workspace task query over a longer prefix match", () => {
    const queryStateRoot = mkdtempSync(join(tmpdir(), "codex-workspace-exact-query-"));
    try {
      const tasksDir = join(queryStateRoot, "tasks");
      mkdirSync(tasksDir, { recursive: true });
      const exactTaskId = "20260710-fix-booting-promotion-second-review";
      const longerTaskId = `${exactTaskId}-delivery-convergence`;
      for (const taskId of [exactTaskId, longerTaskId]) {
        writeFileSync(
          join(tasksDir, `${taskId}.json`),
          `${JSON.stringify({
            task_id: taskId,
            branch: `codex/${taskId}`,
            worktree_path: rootDir,
            base_branch: "dev",
            base_ref: "origin/dev",
            status: "active",
            owner: "runner-a",
          }, null, 2)}\n`,
        );
      }

      const result = run(["resume", exactTaskId, "--json", "--state-root", queryStateRoot, "--owner", "runner-a"]);

      assert(result.code === 0, result.stderr || result.stdout);
      const packet = JSON.parse(result.stdout);
      assert(packet.taskId === exactTaskId, result.stdout || result.stderr);
      assert(packet.branch === `codex/${exactTaskId}`, result.stdout || result.stderr);
    } finally {
      rmSync(queryStateRoot, { recursive: true, force: true });
    }
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
    assert(result.stdout.includes("reason_code=active_workspace_unowned"), result.stdout || result.stderr);
    assert(result.stdout.includes("- current-active | active"), result.stdout || result.stderr);
    assert(result.stdout.includes("- other-active | blocked_owned_active"), result.stdout || result.stderr);
    assert(result.stdout.includes("reason_code=owned_by_other_runner"), result.stdout || result.stderr);
    assert(result.stdout.includes("- stale-active | blocked_stale_owner_needs_takeover"), result.stdout || result.stderr);
    assert(result.stdout.includes("reason_code=owner_heartbeat_stale"), result.stdout || result.stderr);
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
        join(tasksDir, "merged-stale-owner.json"),
        `${JSON.stringify(
          {
            task_id: "merged-stale-owner",
            branch: "codex/merged-stale-owner",
            worktree_path: rootDir,
            base_branch: "main",
            status: "merged",
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
      writeFileSync(
        join(assignmentsDir, "blocked-authority-assignment.json"),
        `${JSON.stringify(
          {
            assignment_id: "blocked-authority-assignment",
            task_id: "blocked-authority-assignment",
            branch: "codex/blocked-authority-assignment",
            status: "blocked_authority_waiting",
            owner: "runner-a",
            last_heartbeat_at: now,
          },
          null,
          2,
        )}\n`,
      );
      writeFileSync(
        join(assignmentsDir, "ambiguous-assignment.json"),
        `${JSON.stringify(
          {
            assignment_id: "ambiguous-assignment",
            task_id: "ambiguous-assignment",
            branch: "codex/ambiguous-assignment",
            status: "claimed",
          },
          null,
          2,
        )}\n`,
      );
      for (const duplicateId of ["duplicate-assignment-a", "duplicate-assignment-b"]) {
        writeFileSync(
          join(assignmentsDir, `${duplicateId}.json`),
          `${JSON.stringify(
            {
              assignment_id: duplicateId,
              task_id: duplicateId,
              branch: "codex/bmad-1-1-validate-the-pipeline-work-packet-read-contract",
              status: "claimed",
              owner: "runner-b",
              last_heartbeat_at: now,
            },
            null,
            2,
          )}\n`,
        );
      }
      for (let index = 0; index < 7; index += 1) {
        writeFileSync(
          join(assignmentsDir, `claimed-extra-${index}.json`),
          `${JSON.stringify(
            {
              assignment_id: `claimed-extra-${index}`,
              task_id: `claimed-extra-${index}`,
              branch: `codex/claimed-extra-${index}`,
              status: "claimed",
              owner: "runner-a",
              last_heartbeat_at: now,
            },
            null,
            2,
          )}\n`,
        );
      }
      writeFileSync(
        join(tasksDir, "missing-worktree.json"),
        `${JSON.stringify(
          {
            task_id: "missing-worktree",
            branch: "codex/missing-worktree",
            worktree_path: join(tmpdir(), "codex-missing-worktree-fixture"),
            base_branch: "main",
            status: "active",
            owner: "runner-a",
            owner_updated_at: now,
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
      assert(packet.counts.laneAssignments === 12, result.stdout || result.stderr);
      assert(packet.counts.workspaceAssignments >= 3, result.stdout || result.stderr);
      assert(packet.backlogStatusCounts.closed >= 1, result.stdout || result.stderr);
      assert(packet.backlogStatusCounts.assignable >= 1, result.stdout || result.stderr);
      assert(packet.backlogStatusCounts.ambiguous >= 1, result.stdout || result.stderr);
      assert(packet.laneAssignmentStatusCounts.claimed === 8, result.stdout || result.stderr);
      assert(packet.laneAssignmentStatusCounts.blocked_authority === 1, result.stdout || result.stderr);
      assert(packet.laneAssignmentStatusCounts.ambiguous === 1, result.stdout || result.stderr);
      assert(packet.laneAssignmentStatusCounts.blocked_owned_active === 2, result.stdout || result.stderr);
      assert(packet.workspaceAssignmentStatusCounts.assignable >= 1, result.stdout || result.stderr);
      assert(packet.workspaceAssignmentStatusCounts.cleanup >= 1, result.stdout || result.stderr);
      assert(packet.workspaceAssignmentStatusCounts.blocked_stale_owner_needs_takeover >= 1, result.stdout || result.stderr);
      assert(packet.backlogReasonCodeCounts.safe_backlog_complete >= 1, result.stdout || result.stderr);
      assert(packet.backlogReasonCodeCounts.duplicate_assignment_records === 1, result.stdout || result.stderr);
      assert(packet.laneAssignmentReasonCodeCounts.assignment_current_owner === 8, result.stdout || result.stderr);
      assert(packet.laneAssignmentReasonCodeCounts.assignment_authority_blocked === 1, result.stdout || result.stderr);
      assert(packet.laneAssignmentReasonCodeCounts.assignment_missing_owner === 1, result.stdout || result.stderr);
      assert(packet.laneAssignmentReasonCodeCounts.assignment_owned_by_other_runner === 2, result.stdout || result.stderr);
      assert(packet.workspaceAssignmentReasonCodeCounts.active_workspace_unowned >= 1, result.stdout || result.stderr);
      assert(packet.workspaceAssignmentReasonCodeCounts.pr_merged_cleanup_pending >= 1, result.stdout || result.stderr);
      assert(packet.backlogCandidates.length <= 10, result.stdout || result.stderr);
      assert(packet.laneAssignments.length <= 10, result.stdout || result.stderr);
      assert(packet.workspaceAssignments.length <= 10, result.stdout || result.stderr);
      assert(packet.backlogCandidates.every((candidate) => typeof candidate.reasonCode === "string"), result.stdout || result.stderr);
      assert(packet.laneAssignments.every((assignment) => typeof assignment.reasonCode === "string"), result.stdout || result.stderr);
      assert(packet.workspaceAssignments.every((assignment) => typeof assignment.reasonCode === "string"), result.stdout || result.stderr);
      assert(typeof packet.backlogCandidatesTruncated === "boolean", result.stdout || result.stderr);
      assert(typeof packet.laneAssignmentsTruncated === "boolean", result.stdout || result.stderr);
      assert(typeof packet.workspaceAssignmentsTruncated === "boolean", result.stdout || result.stderr);
      assert(packet.laneAssignmentsTruncated === true, result.stdout || result.stderr);
      assert(packet.workspaceAssignmentsTruncated === true, result.stdout || result.stderr);
      assert(packet.assignmentInventory, result.stdout || result.stderr);
      assert(packet.assignmentInventory.schemaVersion === "manager-assignment-inventory/v0", result.stdout || result.stderr);
      assert(packet.assignmentInventory.generatedAt === packet.generatedAt, result.stdout || result.stderr);
      assert(packet.assignmentInventory.stateRoot === packet.stateRoot, result.stdout || result.stderr);
      assert(packet.assignmentInventory.currentOwner === packet.currentOwner, result.stdout || result.stderr);
      assert(packet.assignmentInventory.staleAfterSeconds === packet.staleAfterSeconds, result.stdout || result.stderr);
      assert(packet.assignmentInventory.complete === true, result.stdout || result.stderr);
      assert(Array.isArray(packet.assignmentInventory.blockers), result.stdout || result.stderr);
      assert(packet.assignmentInventory.blockers.length === 0, result.stdout || result.stderr);
      assert(packet.assignmentInventory.counts.laneAssignments === packet.counts.laneAssignments, result.stdout || result.stderr);
      assert(packet.assignmentInventory.counts.workspaceAssignments === packet.counts.workspaceAssignments, result.stdout || result.stderr);
      assert(packet.assignmentInventory.counts.staleOwnerTargets >= 1, result.stdout || result.stderr);
      assert(
        (packet.workspaceAssignmentStatusCounts.blocked_stale_owner_needs_takeover || 0) ===
          packet.assignmentInventory.workspaceAssignments.filter((row) => row.status === "blocked_stale_owner_needs_takeover").length,
        "workspace stale-owner status count must agree with the complete canonical inventory",
      );
      assert(packet.assignmentInventory.counts.ownedActiveTargets >= 8, result.stdout || result.stderr);
      assert(packet.assignmentInventory.laneAssignments.length === packet.counts.laneAssignments, result.stdout || result.stderr);
      assert(packet.assignmentInventory.workspaceAssignments.length === packet.counts.workspaceAssignments, result.stdout || result.stderr);
      assert(packet.assignmentInventory.laneAssignments.length > packet.laneAssignments.length, result.stdout || result.stderr);
      assert(packet.assignmentInventory.workspaceAssignments.length > packet.workspaceAssignments.length, result.stdout || result.stderr);
      assert(
        packet.assignmentInventory.staleOwnerTargets.some((row) => `${row.kind}:${row.id}` === "workspace_assignment:stale-active"),
        result.stdout || result.stderr,
      );
      assert(
        !packet.assignmentInventory.staleOwnerTargets.some((row) => row.id.startsWith("closed-")),
        result.stdout || result.stderr,
      );
      assert(
        packet.assignmentInventory.workspaceAssignments.some(
          (row) => row.id === "closed-assignment-report-queue-proof-refresh" && row.status === "closed",
        ),
        result.stdout || result.stderr,
      );
      assert(packet.assignmentInventory.activeLaneEvidence["lane_assignment:claimed-assignment"], result.stdout || result.stderr);
      assert(packet.assignmentInventory.legacyMapping.laneAssignments === "assignmentInventory.laneAssignments", result.stdout || result.stderr);
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
      assert(packet.closeoutHandoffEvidence.schemaVersion === "assignment-closeout-handoff-evidence/v1", result.stdout || result.stderr);
      assert(packet.closeoutHandoffEvidence.retention === "metadata_only_no_raw_prompts_provider_payloads_or_tmux_scrollback", result.stdout || result.stderr);
      assert(packet.closeoutHandoffEvidence.changed === "none; close-assignments summary dry-run only", result.stdout || result.stderr);
      assert(packet.closeoutHandoffEvidence.verified.matchingClosedWorkspaceCount === 1, result.stdout || result.stderr);
      assert(packet.closeoutHandoffEvidence.nextManagerAction.includes("Review this dry-run summary"), result.stdout || result.stderr);
      assert(packet.closeoutHandoffEvidence.resultRefs[0].assignmentId === "dispatcher-queue-handoff-summary-refresh", result.stdout || result.stderr);
      assert(packet.closeoutHandoffEvidence.resultRefs[0].manifestTaskId === "closed-summary-lane", result.stdout || result.stderr);
      const [closeout] = packet.results;
      assert(closeout.assignmentId === "dispatcher-queue-handoff-summary-refresh", result.stdout || result.stderr);
      assert(closeout.status === "closeable", result.stdout || result.stderr);
      assert(closeout.manifestTaskId === "closed-summary-lane", result.stdout || result.stderr);

      const sensitiveOwnerResult = run([
        "close-assignments",
        "--ids",
        "dispatcher-queue-handoff-summary-refresh",
        "--summary-json",
        "--owner",
        "raw prompt sk-closeout-secret provider payload",
        "--state-root",
        closeoutStateRoot,
      ]);
      assert(sensitiveOwnerResult.code === 0, sensitiveOwnerResult.stderr || sensitiveOwnerResult.stdout);
      const sensitivePacket = JSON.parse(sensitiveOwnerResult.stdout);
      assert(/^\[redacted-(token|retention-field)\]$/.test(sensitivePacket.closeoutHandoffEvidence.owner), sensitiveOwnerResult.stdout || sensitiveOwnerResult.stderr);
      assert(!/raw prompt|provider payload|sk-closeout-secret/i.test(JSON.stringify(sensitivePacket.closeoutHandoffEvidence.resultRefs)), sensitiveOwnerResult.stdout || sensitiveOwnerResult.stderr);
      assert(!/raw prompt|provider payload|sk-closeout-secret/i.test(sensitivePacket.currentOwner), sensitiveOwnerResult.stdout || sensitiveOwnerResult.stderr);
      const broadSensitiveOwnerResult = run([
        "close-assignments",
        "--ids",
        "dispatcher-queue-handoff-summary-refresh",
        "--summary-json",
        "--owner",
        "OPENAI_API_KEY=abc raw scrollback",
        "--state-root",
        closeoutStateRoot,
      ]);
      assert(broadSensitiveOwnerResult.code === 0, broadSensitiveOwnerResult.stderr || broadSensitiveOwnerResult.stdout);
      const broadSensitivePacket = JSON.parse(broadSensitiveOwnerResult.stdout);
      assert(broadSensitivePacket.closeoutHandoffEvidence.owner === "[redacted-retention-field]", broadSensitiveOwnerResult.stdout || broadSensitiveOwnerResult.stderr);
      assert(broadSensitivePacket.currentOwner === "[redacted-retention-field]", broadSensitiveOwnerResult.stdout || broadSensitiveOwnerResult.stderr);
      assert(closeout.branch === "codex/dispatcher-queue-handoff-summary-refresh", result.stdout || result.stderr);
      assert(closeout.owner === "runner-a", result.stdout || result.stderr);
      assert(taskSnapshot(tasksDir) === beforeTasks, "close-assignments summary-json mutated manifests");
      assert(taskSnapshot(assignmentsDir) === beforeAssignments, "close-assignments summary-json mutated assignments");
    } finally {
      rmSync(closeoutStateRoot, { recursive: true, force: true });
    }
  });

  test("close-assignments prefers an exact task manifest over an older duplicate assignment manifest", () => {
    const closeoutStateRoot = mkdtempSync(join(tmpdir(), "codex-assignment-closeout-exact-task-manifest-"));
    try {
      const tasksDir = join(closeoutStateRoot, "tasks");
      const assignmentsDir = join(closeoutStateRoot, "assignments");
      mkdirSync(tasksDir, { recursive: true });
      mkdirSync(assignmentsDir, { recursive: true });
      const assignmentId = "duplicate-assignment-manifest-fixture";
      const exactTaskId = "20260623-duplicate-assignment-manifest-fixture";
      const manifests = [
        {
          task_id: "20260622-duplicate-assignment-manifest-fixture",
          branch: "codex/duplicate-assignment-old-fixture",
        },
        {
          task_id: exactTaskId,
          branch: "codex/duplicate-assignment-exact-fixture",
        },
      ];
      for (const manifest of manifests) {
        writeFileSync(
          join(tasksDir, `${manifest.task_id}.json`),
          `${JSON.stringify(
            {
              task_id: manifest.task_id,
              branch: manifest.branch,
              worktree_path: join(closeoutStateRoot, "worktrees", manifest.task_id),
              base_branch: "dev",
              status: "closed",
              owner: "runner-a",
              source_assignment_id: assignmentId,
            },
            null,
            2,
          )}\n`,
        );
      }
      writeFileSync(
        join(assignmentsDir, `${assignmentId}.json`),
        `${JSON.stringify(
          {
            assignment_id: assignmentId,
            task_id: exactTaskId,
            branch: "codex/duplicate-assignment-exact-fixture",
            status: "active",
            owner: "runner-a",
            phase: "handoff",
          },
          null,
          2,
        )}\n`,
      );

      const result = run([
        "close-assignments",
        "--ids",
        assignmentId,
        "--owner",
        "runner-a",
        "--state-root",
        closeoutStateRoot,
        "--summary-json",
      ]);

      assert(result.code === 0, result.stderr || result.stdout);
      const packet = JSON.parse(result.stdout);
      assert(packet.counts.closeable === 1, result.stdout || result.stderr);
      assert(packet.results[0].manifestTaskId === exactTaskId, result.stdout || result.stderr);
      assert(packet.results[0].branch === "codex/duplicate-assignment-exact-fixture", result.stdout || result.stderr);
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
      assert(assignment.closeout_handoff_evidence.schemaVersion === "assignment-closeout-handoff-evidence/v1", JSON.stringify(assignment));
      assert(assignment.closeout_handoff_evidence.authority === "existing-close-assignments-apply-gate", JSON.stringify(assignment));
      assert(assignment.closeout_handoff_evidence.changed.includes("closed 1 assignment record"), JSON.stringify(assignment));
      assert(assignment.closeout_handoff_evidence.verified.matchingClosedWorkspaceCount === 1, JSON.stringify(assignment));
      assert(assignment.closeout_handoff_evidence.nextManagerAction.includes("Return to manager cleanup planning"), JSON.stringify(assignment));
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

  test("close-assignments apply closes explicitly approved abandoned stale assignment record", () => {
    const closeoutStateRoot = mkdtempSync(join(tmpdir(), "codex-assignment-closeout-stale-approved-"));
    try {
      const tasksDir = join(closeoutStateRoot, "tasks");
      const assignmentsDir = join(closeoutStateRoot, "assignments");
      mkdirSync(tasksDir, { recursive: true });
      mkdirSync(assignmentsDir, { recursive: true });
      const missingWorktree = join(closeoutStateRoot, "worktrees", "stale-record-cleanup-fixture");
      writeFileSync(
        join(tasksDir, "closed-stale-record-lane.json"),
        `${JSON.stringify(
          {
            task_id: "closed-stale-record-lane",
            branch: "codex/stale-record-cleanup-fixture",
            worktree_path: missingWorktree,
            base_branch: "dev",
            status: "closed",
            owner: "runner-b",
            source_assignment_id: "stale-record-cleanup-fixture",
            events: [],
          },
          null,
          2,
        )}\n`,
      );
      writeFileSync(
        join(assignmentsDir, "stale-record-cleanup-fixture.json"),
        `${JSON.stringify(
          {
            assignment_id: "stale-record-cleanup-fixture",
            task_id: "closed-stale-record-lane",
            branch: "codex/stale-record-cleanup-fixture",
            status: "active",
            owner: "runner-b",
            phase: "handoff",
            events: [],
          },
          null,
          2,
        )}\n`,
      );
      const env = staleCleanupFixtureEnv(closeoutStateRoot);

      const result = run([
        "close-assignments",
        "--ids",
        "stale-record-cleanup-fixture",
        "--owner",
        "runner-a",
        "--state-root",
        closeoutStateRoot,
        "--allow-stale-record-cleanup",
        "--approval",
        "operator approved stale cleanup",
        "--apply",
      ], { env });

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("approved stale record cleanup"), result.stdout || result.stderr);
      const assignment = JSON.parse(readFileSync(join(assignmentsDir, "stale-record-cleanup-fixture.json"), "utf8"));
      const manifest = JSON.parse(readFileSync(join(tasksDir, "closed-stale-record-lane.json"), "utf8"));
      assert(assignment.status === "closed", JSON.stringify(assignment));
      assert(assignment.phase === "closed", JSON.stringify(assignment));
      assert(assignment.closeout_mode === "stale_record_cleanup", JSON.stringify(assignment));
      assert(assignment.closeout_approval_evidence === "operator approved stale cleanup", JSON.stringify(assignment));
      assert(assignment.closeout_abandonment_evidence.worktreeStatus === "missing", JSON.stringify(assignment));
      assert(assignment.closeout_abandonment_evidence.localBranchSha === null, JSON.stringify(assignment));
      assert(assignment.closeout_abandonment_evidence.remoteBranchSha === null, JSON.stringify(assignment));
      assert(assignment.closeout_abandonment_evidence.remoteBranchStatus === "absent", JSON.stringify(assignment));
      assert(assignment.closeout_abandonment_evidence.prStatus === "none", JSON.stringify(assignment));
      assert(assignment.last_result === "operator-approved stale record cleanup from closed workspace closed-stale-record-lane", JSON.stringify(assignment));
      assert(manifest.source_assignment_closed_at === assignment.closed_at, JSON.stringify(manifest));
      assert(manifest.events.some((event) => event.type === "assignment_closed"), JSON.stringify(manifest));
    } finally {
      rmSync(closeoutStateRoot, { recursive: true, force: true });
    }
  });

  test("close-assignments closes approved stale assignment with merged PR evidence", () => {
    const closeoutStateRoot = mkdtempSync(join(tmpdir(), "codex-assignment-closeout-merged-pr-"));
    try {
      const tasksDir = join(closeoutStateRoot, "tasks");
      const assignmentsDir = join(closeoutStateRoot, "assignments");
      mkdirSync(tasksDir, { recursive: true });
      mkdirSync(assignmentsDir, { recursive: true });
      const branch = "codex/stale-merged-pr-cleanup-fixture";
      const prUrl = "https://example.test/pull/456";
      const mergedAt = "2026-06-27T12:00:00.000Z";
      writeFileSync(
        join(tasksDir, "closed-stale-merged-pr-lane.json"),
        `${JSON.stringify(
          {
            task_id: "closed-stale-merged-pr-lane",
            branch,
            worktree_path: join(closeoutStateRoot, "worktrees", "stale-merged-pr-cleanup-fixture"),
            base_branch: "dev",
            status: "closed",
            owner: "runner-b",
            source_assignment_id: "stale-merged-pr-cleanup-fixture",
            pr_url: prUrl,
            pr_number: 456,
            merged_at: mergedAt,
            cleanup_pr_url: prUrl,
            cleanup_pr_number: 456,
            cleanup_merged_at: mergedAt,
            events: [],
          },
          null,
          2,
        )}\n`,
      );
      writeFileSync(
        join(assignmentsDir, "stale-merged-pr-cleanup-fixture.json"),
        `${JSON.stringify(
          {
            assignment_id: "stale-merged-pr-cleanup-fixture",
            task_id: "closed-stale-merged-pr-lane",
            branch,
            status: "active",
            owner: "runner-b",
            phase: "handoff",
            events: [],
          },
          null,
          2,
        )}\n`,
      );
      const env = staleCleanupFixtureEnv(closeoutStateRoot);

      const dryRun = run([
        "close-assignments",
        "--ids",
        "stale-merged-pr-cleanup-fixture",
        "--owner",
        "runner-a",
        "--state-root",
        closeoutStateRoot,
        "--summary-json",
      ], { env });

      assert(dryRun.code === 0, dryRun.stderr || dryRun.stdout);
      const packet = JSON.parse(dryRun.stdout);
      assert(packet.counts.blocked === 1, dryRun.stdout || dryRun.stderr);
      assert(packet.results[0].closeoutMode === "stale_merged_pr_record_cleanup", dryRun.stdout || dryRun.stderr);
      assert(packet.results[0].staleRecordCleanupEligible === true, dryRun.stdout || dryRun.stderr);
      assert(packet.results[0].reason.includes("--allow-stale-record-cleanup"), dryRun.stdout || dryRun.stderr);

      const result = run([
        "close-assignments",
        "--ids",
        "stale-merged-pr-cleanup-fixture",
        "--owner",
        "runner-a",
        "--state-root",
        closeoutStateRoot,
        "--allow-stale-record-cleanup",
        "--approval",
        "operator approved stale cleanup",
        "--apply",
      ], { env });

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("approved stale merged PR record cleanup"), result.stdout || result.stderr);
      const assignment = JSON.parse(readFileSync(join(assignmentsDir, "stale-merged-pr-cleanup-fixture.json"), "utf8"));
      const manifest = JSON.parse(readFileSync(join(tasksDir, "closed-stale-merged-pr-lane.json"), "utf8"));
      assert(assignment.status === "closed", JSON.stringify(assignment));
      assert(assignment.closeout_mode === "stale_merged_pr_record_cleanup", JSON.stringify(assignment));
      assert(assignment.closeout_approval_evidence === "operator approved stale cleanup", JSON.stringify(assignment));
      assert(assignment.closeout_abandonment_evidence.prStatus === "merged", JSON.stringify(assignment));
      assert(assignment.closeout_abandonment_evidence.mergedAt === mergedAt, JSON.stringify(assignment));
      assert(assignment.closeout_abandonment_evidence.prNumber === 456, JSON.stringify(assignment));
      assert(assignment.last_result === "operator-approved stale merged PR record cleanup from closed workspace closed-stale-merged-pr-lane", JSON.stringify(assignment));
      assert(manifest.source_assignment_closed_at === assignment.closed_at, JSON.stringify(manifest));
    } finally {
      rmSync(closeoutStateRoot, { recursive: true, force: true });
    }
  });

  test("close-assignments keeps stale assignment with unmerged PR evidence blocked", () => {
    const closeoutStateRoot = mkdtempSync(join(tmpdir(), "codex-assignment-closeout-unmerged-pr-"));
    try {
      const tasksDir = join(closeoutStateRoot, "tasks");
      const assignmentsDir = join(closeoutStateRoot, "assignments");
      mkdirSync(tasksDir, { recursive: true });
      mkdirSync(assignmentsDir, { recursive: true });
      const branch = "codex/stale-unmerged-pr-cleanup-fixture";
      writeFileSync(
        join(tasksDir, "closed-stale-unmerged-pr-lane.json"),
        `${JSON.stringify(
          {
            task_id: "closed-stale-unmerged-pr-lane",
            branch,
            worktree_path: join(closeoutStateRoot, "worktrees", "stale-unmerged-pr-cleanup-fixture"),
            base_branch: "dev",
            status: "closed",
            owner: "runner-b",
            source_assignment_id: "stale-unmerged-pr-cleanup-fixture",
            pr_url: "https://example.test/pull/789",
            pr_number: 789,
            events: [],
          },
          null,
          2,
        )}\n`,
      );
      writeFileSync(
        join(assignmentsDir, "stale-unmerged-pr-cleanup-fixture.json"),
        `${JSON.stringify(
          {
            assignment_id: "stale-unmerged-pr-cleanup-fixture",
            task_id: "closed-stale-unmerged-pr-lane",
            branch,
            status: "active",
            owner: "runner-b",
            phase: "handoff",
            events: [],
          },
          null,
          2,
        )}\n`,
      );
      const env = staleCleanupFixtureEnv(closeoutStateRoot);
      const result = run([
        "close-assignments",
        "--ids",
        "stale-unmerged-pr-cleanup-fixture",
        "--owner",
        "runner-a",
        "--state-root",
        closeoutStateRoot,
        "--allow-stale-record-cleanup",
        "--approval",
        "operator approved stale cleanup",
        "--apply",
      ], { env });

      assert(result.code !== 0, result.stdout || result.stderr);
      assert(result.stderr.includes("Refusing to close blocked assignments"), result.stdout || result.stderr);
      const assignment = JSON.parse(readFileSync(join(assignmentsDir, "stale-unmerged-pr-cleanup-fixture.json"), "utf8"));
      assert(assignment.status === "active", JSON.stringify(assignment));
    } finally {
      rmSync(closeoutStateRoot, { recursive: true, force: true });
    }
  });

  test("close-assignments approved manager stale cleanup blocks fresh worker without delegation evidence", () => {
    const closeoutStateRoot = mkdtempSync(join(tmpdir(), "codex-assignment-closeout-manager-delegation-blocked-"));
    try {
      const tasksDir = join(closeoutStateRoot, "tasks");
      const assignmentsDir = join(closeoutStateRoot, "assignments");
      mkdirSync(tasksDir, { recursive: true });
      mkdirSync(assignmentsDir, { recursive: true });
      writeFileSync(
        join(tasksDir, "closed-manager-stale-record-lane.json"),
        `${JSON.stringify(
          {
            task_id: "closed-manager-stale-record-lane",
            branch: "codex/manager-stale-record-cleanup-fixture",
            worktree_path: join(closeoutStateRoot, "worktrees", "missing-manager-stale-record"),
            base_branch: "dev",
            status: "closed",
            owner: "manager-stable/dispatcher",
            source_assignment_id: "manager-stale-record-cleanup-fixture",
          },
          null,
          2,
        )}\n`,
      );
      writeFileSync(
        join(assignmentsDir, "manager-stale-record-cleanup-fixture.json"),
        `${JSON.stringify(
          {
            assignment_id: "manager-stale-record-cleanup-fixture",
            task_id: "closed-manager-stale-record-lane",
            branch: "codex/manager-stale-record-cleanup-fixture",
            status: "active",
            owner: "manager-stable/dispatcher",
            phase: "handoff",
          },
          null,
          2,
        )}\n`,
      );
      const beforeAssignments = taskSnapshot(assignmentsDir);
      const env = staleCleanupFixtureEnv(closeoutStateRoot);

      const result = run([
        "close-assignments",
        "--ids",
        "manager-stale-record-cleanup-fixture",
        "--owner",
        "manager-stable/codex-fresh",
        "--state-root",
        closeoutStateRoot,
        "--allow-stale-record-cleanup",
        "--approval",
        "operator approved stale cleanup",
        "--summary-json",
      ], { env });

      assert(result.code === 0, result.stderr || result.stdout);
      const packet = JSON.parse(result.stdout);
      assert(packet.counts.blocked === 1, result.stdout || result.stderr);
      assert(packet.results[0].status === "blocked", result.stdout || result.stderr);
      assert(packet.results[0].reason.includes("requires delegated cleanup owner evidence"), result.stdout || result.stderr);
      assert(taskSnapshot(assignmentsDir) === beforeAssignments, "blocked manager delegated stale cleanup mutated assignments");
    } finally {
      rmSync(closeoutStateRoot, { recursive: true, force: true });
    }
  });

  test("close-assignments delegated stable owner closes approved manager stale cleanup from fresh worker", () => {
    const closeoutStateRoot = mkdtempSync(join(tmpdir(), "codex-assignment-closeout-manager-delegation-"));
    try {
      const tasksDir = join(closeoutStateRoot, "tasks");
      const assignmentsDir = join(closeoutStateRoot, "assignments");
      mkdirSync(tasksDir, { recursive: true });
      mkdirSync(assignmentsDir, { recursive: true });
      writeFileSync(
        join(tasksDir, "closed-manager-delegated-stale-lane.json"),
        `${JSON.stringify(
          {
            task_id: "closed-manager-delegated-stale-lane",
            branch: "codex/manager-delegated-stale-cleanup-fixture",
            worktree_path: join(closeoutStateRoot, "worktrees", "missing-manager-delegated-stale"),
            base_branch: "dev",
            status: "closed",
            owner: "manager-stable/dispatcher",
            source_assignment_id: "manager-delegated-stale-cleanup-fixture",
            events: [],
          },
          null,
          2,
        )}\n`,
      );
      writeFileSync(
        join(assignmentsDir, "manager-delegated-stale-cleanup-fixture.json"),
        `${JSON.stringify(
          {
            assignment_id: "manager-delegated-stale-cleanup-fixture",
            task_id: "closed-manager-delegated-stale-lane",
            branch: "codex/manager-delegated-stale-cleanup-fixture",
            status: "active",
            owner: "manager-stable/dispatcher",
            phase: "handoff",
            events: [],
          },
          null,
          2,
        )}\n`,
      );
      const env = staleCleanupFixtureEnv(closeoutStateRoot);

      const result = run([
        "close-assignments",
        "--ids",
        "manager-delegated-stale-cleanup-fixture",
        "--owner",
        "manager-stable/codex-fresh",
        "--state-root",
        closeoutStateRoot,
        "--allow-stale-record-cleanup",
        "--approval",
        "operator approved stale cleanup",
        "--delegated-cleanup-owner",
        "manager-stable/dispatcher",
        "--delegation-evidence",
        "manager delegated stable owner evidence",
        "--apply",
      ], { env });

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("approved stale record cleanup delegated from manager-stable/dispatcher"), result.stdout || result.stderr);
      const assignment = JSON.parse(readFileSync(join(assignmentsDir, "manager-delegated-stale-cleanup-fixture.json"), "utf8"));
      const manifest = JSON.parse(readFileSync(join(tasksDir, "closed-manager-delegated-stale-lane.json"), "utf8"));
      assert(assignment.status === "closed", JSON.stringify(assignment));
      assert(assignment.closeout_mode === "stale_record_cleanup", JSON.stringify(assignment));
      assert(assignment.closeout_approval_evidence === "operator approved stale cleanup", JSON.stringify(assignment));
      assert(assignment.closeout_delegated_owner === "manager-stable/dispatcher", JSON.stringify(assignment));
      assert(assignment.closeout_delegation_evidence === "manager delegated stable owner evidence", JSON.stringify(assignment));
      assert(assignment.closeout_abandonment_evidence.worktreeStatus === "missing", JSON.stringify(assignment));
      assert(assignment.closeout_abandonment_evidence.remoteBranchStatus === "absent", JSON.stringify(assignment));
      assert(assignment.closeout_abandonment_evidence.prStatus === "none", JSON.stringify(assignment));
      assert(manifest.source_assignment_closed_at === assignment.closed_at, JSON.stringify(manifest));
    } finally {
      rmSync(closeoutStateRoot, { recursive: true, force: true });
    }
  });

  test("close-assignments stale cleanup fails closed when worktree still exists", () => {
    const closeoutStateRoot = mkdtempSync(join(tmpdir(), "codex-assignment-closeout-stale-live-"));
    try {
      const tasksDir = join(closeoutStateRoot, "tasks");
      const assignmentsDir = join(closeoutStateRoot, "assignments");
      mkdirSync(tasksDir, { recursive: true });
      mkdirSync(assignmentsDir, { recursive: true });
      writeFileSync(
        join(tasksDir, "closed-live-worktree-lane.json"),
        `${JSON.stringify(
          {
            task_id: "closed-live-worktree-lane",
            branch: "codex/stale-record-live-worktree-fixture",
            worktree_path: rootDir,
            base_branch: "dev",
            status: "closed",
            owner: "runner-b",
            source_assignment_id: "stale-record-live-worktree-fixture",
          },
          null,
          2,
        )}\n`,
      );
      writeFileSync(
        join(assignmentsDir, "stale-record-live-worktree-fixture.json"),
        `${JSON.stringify(
          {
            assignment_id: "stale-record-live-worktree-fixture",
            task_id: "closed-live-worktree-lane",
            branch: "codex/stale-record-live-worktree-fixture",
            status: "active",
            owner: "runner-b",
            phase: "handoff",
          },
          null,
          2,
        )}\n`,
      );
      const beforeAssignments = taskSnapshot(assignmentsDir);
      const env = staleCleanupFixtureEnv(closeoutStateRoot);

      const result = run([
        "close-assignments",
        "--ids",
        "stale-record-live-worktree-fixture",
        "--owner",
        "runner-a",
        "--state-root",
        closeoutStateRoot,
        "--allow-stale-record-cleanup",
        "--approval",
        "operator approved stale cleanup",
        "--apply",
      ], { env });

      assert(result.code !== 0, result.stdout || result.stderr);
      assert(result.stderr.includes("Refusing to close blocked assignments"), result.stdout || result.stderr);
      assert(taskSnapshot(assignmentsDir) === beforeAssignments, "live worktree stale cleanup mutated assignments");
    } finally {
      rmSync(closeoutStateRoot, { recursive: true, force: true });
    }
  });

  test("close-assignments stale cleanup fails closed when assignment worktree still exists", () => {
    const closeoutStateRoot = mkdtempSync(join(tmpdir(), "codex-assignment-closeout-stale-assignment-live-"));
    try {
      const tasksDir = join(closeoutStateRoot, "tasks");
      const assignmentsDir = join(closeoutStateRoot, "assignments");
      const liveAssignmentWorktree = join(closeoutStateRoot, "worktrees", "live-assignment-worktree");
      mkdirSync(tasksDir, { recursive: true });
      mkdirSync(assignmentsDir, { recursive: true });
      mkdirSync(liveAssignmentWorktree, { recursive: true });
      writeFileSync(
        join(tasksDir, "closed-missing-manifest-worktree-lane.json"),
        `${JSON.stringify(
          {
            task_id: "closed-missing-manifest-worktree-lane",
            branch: "codex/stale-record-assignment-live-fixture",
            worktree_path: join(closeoutStateRoot, "worktrees", "missing-manifest-worktree"),
            base_branch: "dev",
            status: "closed",
            owner: "runner-b",
            source_assignment_id: "stale-record-assignment-live-fixture",
          },
          null,
          2,
        )}\n`,
      );
      writeFileSync(
        join(assignmentsDir, "stale-record-assignment-live-fixture.json"),
        `${JSON.stringify(
          {
            assignment_id: "stale-record-assignment-live-fixture",
            task_id: "closed-missing-manifest-worktree-lane",
            branch: "codex/stale-record-assignment-live-fixture",
            worktree_path: liveAssignmentWorktree,
            status: "active",
            owner: "runner-b",
            phase: "handoff",
          },
          null,
          2,
        )}\n`,
      );
      const beforeAssignments = taskSnapshot(assignmentsDir);
      const env = staleCleanupFixtureEnv(closeoutStateRoot);

      const result = run([
        "close-assignments",
        "--ids",
        "stale-record-assignment-live-fixture",
        "--owner",
        "runner-a",
        "--state-root",
        closeoutStateRoot,
        "--allow-stale-record-cleanup",
        "--approval",
        "operator approved stale cleanup",
        "--apply",
      ], { env });

      assert(result.code !== 0, result.stdout || result.stderr);
      assert(result.stderr.includes("Refusing to close blocked assignments"), result.stdout || result.stderr);
      assert(taskSnapshot(assignmentsDir) === beforeAssignments, "live assignment worktree stale cleanup mutated assignments");
    } finally {
      rmSync(closeoutStateRoot, { recursive: true, force: true });
    }
  });

  test("close-assignments stale cleanup fails closed when remote branch exists", () => {
    const closeoutStateRoot = mkdtempSync(join(tmpdir(), "codex-assignment-closeout-stale-remote-"));
    try {
      const tasksDir = join(closeoutStateRoot, "tasks");
      const assignmentsDir = join(closeoutStateRoot, "assignments");
      mkdirSync(tasksDir, { recursive: true });
      mkdirSync(assignmentsDir, { recursive: true });
      writeFileSync(
        join(tasksDir, "closed-remote-branch-lane.json"),
        `${JSON.stringify(
          {
            task_id: "closed-remote-branch-lane",
            branch: "codex/stale-record-remote-branch-fixture",
            worktree_path: join(closeoutStateRoot, "worktrees", "missing-remote-branch-worktree"),
            base_branch: "dev",
            status: "closed",
            owner: "runner-b",
            source_assignment_id: "stale-record-remote-branch-fixture",
          },
          null,
          2,
        )}\n`,
      );
      writeFileSync(
        join(assignmentsDir, "stale-record-remote-branch-fixture.json"),
        `${JSON.stringify(
          {
            assignment_id: "stale-record-remote-branch-fixture",
            task_id: "closed-remote-branch-lane",
            branch: "codex/stale-record-remote-branch-fixture",
            status: "active",
            owner: "runner-b",
            phase: "handoff",
          },
          null,
          2,
        )}\n`,
      );
      const beforeAssignments = taskSnapshot(assignmentsDir);
      const env = staleCleanupFixtureEnv(closeoutStateRoot, {
        remoteBranches: ["codex/stale-record-remote-branch-fixture"],
      });

      const result = run([
        "close-assignments",
        "--ids",
        "stale-record-remote-branch-fixture",
        "--owner",
        "runner-a",
        "--state-root",
        closeoutStateRoot,
        "--allow-stale-record-cleanup",
        "--approval",
        "operator approved stale cleanup",
        "--apply",
      ], { env });

      assert(result.code !== 0, result.stdout || result.stderr);
      assert(result.stderr.includes("Refusing to close blocked assignments"), result.stdout || result.stderr);
      assert(taskSnapshot(assignmentsDir) === beforeAssignments, "remote branch stale cleanup mutated assignments");
    } finally {
      rmSync(closeoutStateRoot, { recursive: true, force: true });
    }
  });

  test("close-assignments stale cleanup fails closed when GitHub PR exists", () => {
    const closeoutStateRoot = mkdtempSync(join(tmpdir(), "codex-assignment-closeout-stale-pr-"));
    try {
      const tasksDir = join(closeoutStateRoot, "tasks");
      const assignmentsDir = join(closeoutStateRoot, "assignments");
      mkdirSync(tasksDir, { recursive: true });
      mkdirSync(assignmentsDir, { recursive: true });
      writeFileSync(
        join(tasksDir, "closed-github-pr-lane.json"),
        `${JSON.stringify(
          {
            task_id: "closed-github-pr-lane",
            branch: "codex/stale-record-github-pr-fixture",
            worktree_path: join(closeoutStateRoot, "worktrees", "missing-github-pr-worktree"),
            base_branch: "dev",
            status: "closed",
            owner: "runner-b",
            source_assignment_id: "stale-record-github-pr-fixture",
          },
          null,
          2,
        )}\n`,
      );
      writeFileSync(
        join(assignmentsDir, "stale-record-github-pr-fixture.json"),
        `${JSON.stringify(
          {
            assignment_id: "stale-record-github-pr-fixture",
            task_id: "closed-github-pr-lane",
            branch: "codex/stale-record-github-pr-fixture",
            status: "active",
            owner: "runner-b",
            phase: "handoff",
          },
          null,
          2,
        )}\n`,
      );
      const beforeAssignments = taskSnapshot(assignmentsDir);
      const env = staleCleanupFixtureEnv(closeoutStateRoot, {
        prListJson: JSON.stringify([
          {
            number: 123,
            url: "https://example.test/pull/123",
            state: "OPEN",
            headRefName: "codex/stale-record-github-pr-fixture",
          },
        ]),
      });

      const result = run([
        "close-assignments",
        "--ids",
        "stale-record-github-pr-fixture",
        "--owner",
        "runner-a",
        "--state-root",
        closeoutStateRoot,
        "--allow-stale-record-cleanup",
        "--approval",
        "operator approved stale cleanup",
        "--apply",
      ], { env });

      assert(result.code !== 0, result.stdout || result.stderr);
      assert(result.stderr.includes("Refusing to close blocked assignments"), result.stdout || result.stderr);
      assert(taskSnapshot(assignmentsDir) === beforeAssignments, "GitHub PR stale cleanup mutated assignments");
    } finally {
      rmSync(closeoutStateRoot, { recursive: true, force: true });
    }
  });

  test("close-assignments stale cleanup apply requires explicit approval", () => {
    const closeoutStateRoot = mkdtempSync(join(tmpdir(), "codex-assignment-closeout-stale-no-approval-"));
    try {
      const tasksDir = join(closeoutStateRoot, "tasks");
      const assignmentsDir = join(closeoutStateRoot, "assignments");
      mkdirSync(tasksDir, { recursive: true });
      mkdirSync(assignmentsDir, { recursive: true });
      writeFileSync(
        join(tasksDir, "closed-no-approval-lane.json"),
        `${JSON.stringify(
          {
            task_id: "closed-no-approval-lane",
            branch: "codex/stale-record-no-approval-fixture",
            worktree_path: join(closeoutStateRoot, "worktrees", "missing-no-approval-worktree"),
            base_branch: "dev",
            status: "closed",
            owner: "runner-b",
            source_assignment_id: "stale-record-no-approval-fixture",
          },
          null,
          2,
        )}\n`,
      );
      writeFileSync(
        join(assignmentsDir, "stale-record-no-approval-fixture.json"),
        `${JSON.stringify(
          {
            assignment_id: "stale-record-no-approval-fixture",
            task_id: "closed-no-approval-lane",
            branch: "codex/stale-record-no-approval-fixture",
            status: "active",
            owner: "runner-b",
            phase: "handoff",
          },
          null,
          2,
        )}\n`,
      );
      const beforeAssignments = taskSnapshot(assignmentsDir);
      const env = staleCleanupFixtureEnv(closeoutStateRoot);

      const result = run([
        "close-assignments",
        "--ids",
        "stale-record-no-approval-fixture",
        "--owner",
        "runner-a",
        "--state-root",
        closeoutStateRoot,
        "--allow-stale-record-cleanup",
        "--apply",
      ], { env });

      assert(result.code !== 0, result.stdout || result.stderr);
      assert(result.stderr.includes("--approval must cite explicit operator approval"), result.stdout || result.stderr);
      assert(taskSnapshot(assignmentsDir) === beforeAssignments, "no-approval stale cleanup mutated assignments");
    } finally {
      rmSync(closeoutStateRoot, { recursive: true, force: true });
    }
  });

  test("claim-next dry-run previews the next safe backlog lane without mutation", () => {
    const claimStateRoot = mkdtempSync(join(tmpdir(), "codex-claim-next-dry-run-"));
    try {
      const expected = expectedOpenSafeBacklogCandidate();
      const tasksDir = join(claimStateRoot, "tasks");
      mkdirSync(tasksDir, { recursive: true });
      seedGeneratedSuccessorPrerequisites(claimStateRoot);
      const before = taskSnapshot(tasksDir);

      const result = run(["claim-next", "--dry-run", "--owner", "runner-a", "--state-root", claimStateRoot]);
      const after = taskSnapshot(tasksDir);

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("DRY RUN: claim-next"), result.stdout || result.stderr);
      assert(result.stdout.includes(`claim candidate ${expected.slug}`), result.stdout || result.stderr);
      assert(result.stdout.includes("claimable=37"), result.stdout || result.stderr);
      assert(result.stdout.includes("preview only; no manifest, branch, PR, or worktree mutation"), result.stdout || result.stderr);
      assert(result.stdout.includes(`- branch ${expected.branch}`), result.stdout || result.stderr);
      assert(result.stdout.includes("- bmad-1-1-validate-the-pipeline-work-packet-read-contract | assignable"), result.stdout || result.stderr);
      assert(result.stdout.includes("- dispatcher-closed-source-guard-filter-empty-state-shortcut-reason-keyboard-loop-refresh | closed"), result.stdout || result.stderr);
      assert(result.stdout.includes("- authority-blocked-work | closed"), result.stdout || result.stderr);
      assert(before === after, "claim-next --dry-run mutated workspace manifests");
    } finally {
      rmSync(claimStateRoot, { recursive: true, force: true });
    }
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
      const expected = expectedOpenSafeBacklogCandidate();
      assert(packet.currentOwner === "runner-a", result.stdout || result.stderr);
      assert(packet.selected?.itemId === expected.slug, result.stdout || result.stderr);
      assert(packet.assignmentPreview.proposedRunner === "runner-a", result.stdout || result.stderr);
      assert(packet.assignmentPreview.targetLane === expected.slug, result.stdout || result.stderr);
      assert(packet.assignmentPreview.targetBranch === expected.branch, result.stdout || result.stderr);
      assert(packet.assignmentPreview.rationale.includes("ready safe backlog lane"), result.stdout || result.stderr);
      assert(Array.isArray(packet.assignmentPreview.blockedReasons), result.stdout || result.stderr);
      assert(packet.assignmentPreview.blockedReasons.length === 0, result.stdout || result.stderr);
      assert(packet.assignmentPreview.requiredEvidence.includes(`safe backlog item ${expected.slug}`), result.stdout || result.stderr);
      assert(packet.assignmentPreview.mutation === "none; preview only", result.stdout || result.stderr);
      assert(!("assignedLane" in packet.assignmentPreview), result.stdout || result.stderr);
      assert(packet.counts.total > 0, result.stdout || result.stderr);
      assert(packet.counts.claimable === 37, result.stdout || result.stderr);
      assert(packet.counts.excluded >= 1, result.stdout || result.stderr);
      assert(packet.counts.sourceDrift === 0, result.stdout || result.stderr);
      assert(packet.nextActionSummary.action === "claim selected lane", result.stdout || result.stderr);
      assert(packet.nextActionSummary.sourceDrift === 0, result.stdout || result.stderr);
      assert(packet.statusCounts.assignable === 37, result.stdout || result.stderr);
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

  test("claim-next ingests only story-backed BMAD ready items with source evidence after static backlog", () => {
    const fixture = createWorkspaceDefaultBaseFixture({ withDev: true });
    const claimStateRoot = mkdtempSync(join(rootDir, ".codex-workspace-bmad-overlay-state-"));
    try {
      seedFixtureSafeBacklogSource(fixture.root, [
        {
          itemId: "static-ready",
          status: "ready",
          priority: "P1",
          recommendedSliceSize: "small",
          laneSlug: "static-ready",
        },
      ]);
      seedFixtureBmadSprintStatus(fixture.root);

      const staticFirst = runFixtureScript(fixture, [
        "claim-next",
        "--dry-run",
        "--summary-json",
        "--owner",
        "runner-a",
        "--state-root",
        claimStateRoot,
      ]);
      assert(staticFirst.code === 0, staticFirst.stderr || staticFirst.stdout);
      const staticFirstPacket = JSON.parse(staticFirst.stdout);
      assert(staticFirstPacket.selected?.itemId === "static-ready", staticFirst.stdout || staticFirst.stderr);

      seedClaimedSafeBacklogAssignment(claimStateRoot, "static-ready", "runner-b");
      const bmadSelected = runFixtureScript(fixture, [
        "claim-next",
        "--dry-run",
        "--summary-json",
        "--owner",
        "runner-a",
        "--state-root",
        claimStateRoot,
      ]);
      assert(bmadSelected.code === 0, bmadSelected.stderr || bmadSelected.stdout);
      const bmadPacket = JSON.parse(bmadSelected.stdout);
      assert(bmadPacket.selected?.itemId === "bmad-9-9-ready-story", bmadSelected.stdout || bmadSelected.stderr);
      assert(bmadPacket.selected.sourceType === "bmad_sprint_status", bmadSelected.stdout || bmadSelected.stderr);
      assert(bmadPacket.selected.sourceKey === "pipeline-default", bmadSelected.stdout || bmadSelected.stderr);
      assert(bmadPacket.selected.sourceRef === "https://example.test/spec#story-ready", bmadSelected.stdout || bmadSelected.stderr);
      assert(bmadPacket.selected.sourcePath === "_bmad-output/implementation-artifacts/sprint-status.yaml", bmadSelected.stdout || bmadSelected.stderr);
      assert(bmadPacket.selected.storyPath === "_bmad-output/implementation-artifacts/9-9-ready-story.md", bmadSelected.stdout || bmadSelected.stderr);
      assert(bmadPacket.selected.priority === "P3", bmadSelected.stdout || bmadSelected.stderr);

      const textPreview = runFixtureScript(fixture, ["claim-next", "--dry-run", "--owner", "runner-a", "--state-root", claimStateRoot]);
      assert(textPreview.code === 0, textPreview.stderr || textPreview.stdout);
      assert(textPreview.stdout.includes("bmad-9-9-ready-story"), textPreview.stdout || textPreview.stderr);
      assert(!textPreview.stdout.includes("bmad-9-10-missing-story"), textPreview.stdout || textPreview.stderr);
    } finally {
      rmSync(claimStateRoot, { recursive: true, force: true });
      cleanupWorkspaceDefaultBaseFixture(fixture);
    }
  });

  test("claim-next ingests legacy BMAD stories mapping without source metadata", () => {
    const fixture = createWorkspaceDefaultBaseFixture({ withDev: true });
    const claimStateRoot = mkdtempSync(join(rootDir, ".codex-workspace-bmad-legacy-state-"));
    try {
      seedFixtureSafeBacklogSource(fixture.root, [
        {
          itemId: "static-ready",
          status: "ready",
          priority: "P1",
          recommendedSliceSize: "small",
          laneSlug: "static-ready",
        },
      ]);
      seedFixtureLegacyBmadSprintStatus(fixture.root);
      seedClaimedSafeBacklogAssignment(claimStateRoot, "static-ready", "runner-b");

      const result = runFixtureScript(fixture, [
        "claim-next",
        "--dry-run",
        "--summary-json",
        "--owner",
        "runner-a",
        "--state-root",
        claimStateRoot,
      ]);
      assert(result.code === 0, result.stderr || result.stdout);
      const packet = JSON.parse(result.stdout);
      assert(packet.selected?.itemId === "bmad-9-12-legacy-ready-story", result.stdout || result.stderr);
      assert(packet.selected.sourceType === "bmad_sprint_status", result.stdout || result.stderr);
      assert(packet.selected.sourceKey === "local-bmad-sprint-status", result.stdout || result.stderr);
      assert(packet.selected.sourceRef === "_bmad-output/implementation-artifacts/sprint-status.yaml", result.stdout || result.stderr);
      assert(packet.selected.storyPath === "_bmad-output/implementation-artifacts/9-12-legacy-ready-story.md", result.stdout || result.stderr);
    } finally {
      rmSync(claimStateRoot, { recursive: true, force: true });
      cleanupWorkspaceDefaultBaseFixture(fixture);
    }
  });

  test("claim-next suppresses local BMAD ready stories when authoritative planning is terminal", () => {
    const fixture = createWorkspaceDefaultBaseFixture({ withDev: true });
    const claimStateRoot = mkdtempSync(join(rootDir, ".codex-workspace-bmad-terminal-authority-state-"));
    try {
      seedFixtureSafeBacklogSource(fixture.root, []);
      seedFixtureBmadSprintStatus(fixture.root);
      const planningDir = join(fixture.root, "_bmad-output", "planning-artifacts");
      const prdPath = "_bmad-output/planning-artifacts/prd.md";
      mkdirSync(planningDir, { recursive: true });
      writeFileSync(
        join(planningDir, "epics.md"),
        ["---", "status: complete", `authoritative_prd: ${prdPath}`, "---", ""].join("\n"),
      );
      writeFileSync(join(fixture.root, prdPath), ["---", "status: final", "---", ""].join("\n"));

      const result = runFixtureScript(fixture, [
        "claim-next",
        "--dry-run",
        "--summary-json",
        "--owner",
        "runner-a",
        "--state-root",
        claimStateRoot,
      ]);
      assert(result.code === 0, result.stderr || result.stdout);
      const packet = JSON.parse(result.stdout);
      assert(packet.selected === null, result.stdout || result.stderr);
      assert(packet.counts.total === 0, result.stdout || result.stderr);
      assert(!result.stdout.includes("bmad-9-9-ready-story"), result.stdout || result.stderr);
    } finally {
      rmSync(claimStateRoot, { recursive: true, force: true });
      cleanupWorkspaceDefaultBaseFixture(fixture);
    }
  });

  test("dispatch-next apply seeds selected BMAD story artifacts into prepared worktree", () => {
    const fixture = createWorkspaceDefaultBaseFixture({ withDev: true });
    const dispatchStateRoot = mkdtempSync(join(rootDir, ".codex-workspace-bmad-seed-state-"));
    try {
      seedFixtureSafeBacklogSource(fixture.root, [
        {
          itemId: "static-ready",
          status: "ready",
          priority: "P1",
          recommendedSliceSize: "small",
          laneSlug: "static-ready",
        },
      ]);
      seedFixtureBmadSprintStatus(fixture.root);
      seedClaimedSafeBacklogAssignment(dispatchStateRoot, "static-ready", "runner-b");

      const result = runFixtureScript(fixture, [
        "dispatch-next",
        "--apply",
        "--summary-json",
        "--readiness",
        "none",
        "--no-fetch",
        "--owner",
        "runner-a",
        "--state-root",
        dispatchStateRoot,
      ]);

      assert(result.code === 0, result.stderr || result.stdout);
      const packet = JSON.parse(result.stdout);
      const seed = packet.dispatch.localArtifactSeed;
      assert(seed, result.stdout || result.stderr);
      assert(seed.mode === "selected_local_bmad_story_artifacts", result.stdout || result.stderr);
      assert(seed.retention === "metadata_only", result.stdout || result.stderr);
      assert(seed.rawPayloadRetained === false, result.stdout || result.stderr);
      assert(seed.paths.length === 2, result.stdout || result.stderr);
      assert(seed.paths.some((entry) => entry.kind === "sprint_status" && entry.path === "_bmad-output/implementation-artifacts/sprint-status.yaml"), result.stdout || result.stderr);
      assert(seed.paths.some((entry) => entry.kind === "story" && entry.path === "_bmad-output/implementation-artifacts/9-9-ready-story.md"), result.stdout || result.stderr);

      const worktreePath = packet.dispatch.worktreePath;
      assert(readFileSync(join(worktreePath, "_bmad-output", "implementation-artifacts", "sprint-status.yaml"), "utf8").includes("9-9-ready-story"), result.stdout || result.stderr);
      assert(readFileSync(join(worktreePath, "_bmad-output", "implementation-artifacts", "9-9-ready-story.md"), "utf8").includes("Ready story body"), result.stdout || result.stderr);
      assert(!existsSync(join(worktreePath, "_bmad-output", "implementation-artifacts", "9-10-missing-story.md")), "dispatch seeded an unselected BMAD story");
      const ignoredStory = spawnSync("git", ["check-ignore", "-q", "--", "_bmad-output/implementation-artifacts/9-9-ready-story.md"], {
        cwd: worktreePath,
        encoding: "utf8",
        stdio: "pipe",
      });
      assert(ignoredStory.status === 0, "seeded story must remain ignored local BMAD output");

      const manifest = JSON.parse(readFileSync(packet.manifestPath, "utf8"));
      assert(manifest.local_artifact_seed.paths.length === 2, result.stdout || result.stderr);
      assert(manifest.local_artifact_seed.rawPayloadRetained === false, result.stdout || result.stderr);
    } finally {
      rmSync(dispatchStateRoot, { recursive: true, force: true });
      cleanupWorkspaceDefaultBaseFixture(fixture);
    }
  });

  test("claim-next summary-json explains blocked preview when no safe lane is claimable", () => {
    const claimStateRoot = mkdtempSync(join(tmpdir(), "codex-claim-next-no-safe-preview-"));
    try {
      const assignmentsDir = join(claimStateRoot, "assignments");
      for (const laneSlug of safeBacklogReadyItemIds()) {
        seedClaimedSafeBacklogAssignment(claimStateRoot, laneSlug, "runner-b");
      }
      const before = taskSnapshot(assignmentsDir);

      const result = run(["claim-next", "--dry-run", "--summary-json", "--owner", "runner-a", "--state-root", claimStateRoot]);
      const after = taskSnapshot(assignmentsDir);

      assert(result.code === 0, result.stderr || result.stdout);
      const packet = JSON.parse(result.stdout);
      assert(packet.selected === null, result.stdout || result.stderr);
      assert(packet.assignmentPreview.proposedRunner === "runner-a", result.stdout || result.stderr);
      assert(packet.assignmentPreview.targetLane === null, result.stdout || result.stderr);
      assert(packet.assignmentPreview.targetBranch === null, result.stdout || result.stderr);
      assert(packet.assignmentPreview.blockedReasons.some((reason) => reason.includes("assigned to runner-b")), result.stdout || result.stderr);
      assert(packet.assignmentPreview.requiredEvidence.includes("resolve blockers before applying claim-next"), result.stdout || result.stderr);
      assert(packet.assignmentPreview.mutation === "none; preview only", result.stdout || result.stderr);
      assert(!("assignedLane" in packet.assignmentPreview), result.stdout || result.stderr);
      assert(before === after, "claim-next blocked summary preview mutated assignments");
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
      const expectedOpen = expectedOpenSafeBacklogCandidate();

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes(`claim candidate ${expectedOpen.slug}`), result.stdout || result.stderr);
      assert(result.stdout.includes("claimable=37"), result.stdout || result.stderr);
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
      const openLane = expectedOpenSafeBacklogCandidate();
      assert(claim.stdout.includes(`claim candidate ${openLane.slug}`), claim.stdout || claim.stderr);
      assert(claim.stdout.includes(`- ${expected.slug} | closed`), claim.stdout || claim.stderr);
      assert(dispatch.code === 0, dispatch.stderr || dispatch.stdout);
      assert(dispatch.stdout.includes(`- selected lane ${openLane.slug}`), dispatch.stdout || dispatch.stderr);
      assert(dispatch.stdout.includes("- allowed true"), dispatch.stdout || dispatch.stderr);
      assert(dispatch.stdout.includes(`- ${expected.slug} | closed`), dispatch.stdout || dispatch.stderr);
      assert(dispatchSummary.code === 0, dispatchSummary.stderr || dispatchSummary.stdout);
      const packet = JSON.parse(dispatchSummary.stdout);
      assert(packet.dispatch.allowed === true, dispatchSummary.stdout);
      assert(packet.dispatch.selectedLane === openLane.slug, dispatchSummary.stdout);
      assert(packet.laneAssignmentPreview.targetLane === openLane.slug, dispatchSummary.stdout);
      assert(Array.isArray(packet.laneAssignmentPreview.blockedReasons), dispatchSummary.stdout);
      assert(packet.laneAssignmentPreview.blockedReasons.length === 0, dispatchSummary.stdout);
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
      const openLane = expectedOpenSafeBacklogCandidate();

      assert(claim.code === 0, claim.stderr || claim.stdout);
      assert(claim.stdout.includes(`claim candidate ${openLane.slug}`), claim.stdout || claim.stderr);
      assert(claim.stdout.includes(`- ${completedKeyboardLoop.slug} | closed`), claim.stdout || claim.stderr);
      assert(claim.stdout.includes(`- ${completedAuthority.slug} | closed`), claim.stdout || claim.stderr);
      assert(dispatch.code === 0, dispatch.stderr || dispatch.stdout);
      assert(dispatch.stdout.includes(`- selected lane ${openLane.slug}`), dispatch.stdout || dispatch.stderr);
      assert(dispatch.stdout.includes("- allowed true"), dispatch.stdout || dispatch.stderr);
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
      const openLane = expectedOpenSafeBacklogCandidate();

      assert(claim.code === 0, claim.stderr || claim.stdout);
      assert(claim.stdout.includes(`claim candidate ${openLane.slug}`), claim.stdout || claim.stderr);
      assert(claim.stdout.includes(`- ${owned.slug} | closed`), claim.stdout || claim.stderr);
      assert(claim.stdout.includes(`- ${completedAuthority.slug} | closed`), claim.stdout || claim.stderr);
      assert(dispatch.code === 0, dispatch.stderr || dispatch.stdout);
      assert(dispatch.stdout.includes(`- selected lane ${openLane.slug}`), dispatch.stdout || dispatch.stderr);
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
      assert(packet.laneAssignmentPreview.proposedRunner === "runner-a", result.stdout);
      assert(packet.laneAssignmentPreview.targetLane === null, result.stdout);
      assert(
        packet.laneAssignmentPreview.blockedReasons.includes(
          "finish open delivery lanes first: verify PR checks, review threads, exact head, merge evidence, then run merged-lane cleanup",
        ),
        result.stdout,
      );
      assert(packet.laneAssignmentPreview.requiredEvidence.includes("resolve blockers before applying dispatch-next"), result.stdout);
      assert(packet.laneAssignmentPreview.mutation === "none; preview only", result.stdout);
      assert(!("assignedLane" in packet.laneAssignmentPreview), result.stdout);
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
      assert(packet.laneAssignmentPreview.targetLane === null, result.stdout);
      assert(
        packet.laneAssignmentPreview.blockedReasons.includes(
          "finish open delivery lanes first: verify PR checks, review threads, exact head, merge evidence, then run merged-lane cleanup",
        ),
        result.stdout,
      );
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

  test("emergency-stop summary-json previews a metadata-only checkpoint without mutation", () => {
    const stopStateRoot = mkdtempSync(join(tmpdir(), "codex-emergency-stop-preview-"));
    try {
      const result = run([
        "emergency-stop",
        "--dry-run",
        "--summary-json",
        "--mode",
        "pause",
        "--reason",
        "operator requested emergency pause",
        "--owner",
        "runner-a",
        "--state-root",
        stopStateRoot,
      ]);

      assert(result.code === 0, result.stderr || result.stdout);
      const packet = JSON.parse(result.stdout);
      assert(packet.action === "apply", result.stdout || result.stderr);
      assert(packet.status === "active", result.stdout || result.stderr);
      assert(packet.mode === "pause", result.stdout || result.stderr);
      assert(packet.controls.new_claim_allowed === false, result.stdout || result.stderr);
      assert(packet.controls.new_dispatch_allowed === false, result.stdout || result.stderr);
      assert(packet.controls.worker_process_mutation_allowed === false, result.stdout || result.stderr);
      assert(packet.mutation === "none; dry-run summary only", result.stdout || result.stderr);
      assert(!existsSync(join(stopStateRoot, "emergency-stop.json")), "emergency-stop dry-run wrote checkpoint");
    } finally {
      rmSync(stopStateRoot, { recursive: true, force: true });
    }
  });

  test("emergency-stop apply blocks claim and dispatch until cleared", () => {
    const stopStateRoot = mkdtempSync(join(tmpdir(), "codex-emergency-stop-apply-"));
    try {
      seedGeneratedSuccessorPrerequisites(stopStateRoot);
      const assignmentsDir = join(stopStateRoot, "assignments");
      const tasksDir = join(stopStateRoot, "tasks");
      const stopPath = join(stopStateRoot, "emergency-stop.json");
      const beforeAssignments = taskSnapshot(assignmentsDir);
      const beforeTasks = taskSnapshot(tasksDir);

      const apply = run([
        "emergency-stop",
        "--apply",
        "--mode",
        "drain",
        "--reason",
        "operator requested emergency drain",
        "--owner",
        "runner-a",
        "--state-root",
        stopStateRoot,
      ]);

      assert(apply.code === 0, apply.stderr || apply.stdout);
      assert(apply.stdout.includes("APPLY: emergency-stop"), apply.stdout || apply.stderr);
      const checkpoint = readJson(stopPath);
      assert(checkpoint.status === "active", apply.stdout || apply.stderr);
      assert(checkpoint.mode === "drain", apply.stdout || apply.stderr);
      assert(checkpoint.controls.new_claim_allowed === false, apply.stdout || apply.stderr);
      assert(checkpoint.controls.new_dispatch_allowed === false, apply.stdout || apply.stderr);
      assert(checkpoint.controls.worker_process_action.includes("separately approved"), apply.stdout || apply.stderr);

      const claim = run(["claim-next", "--apply", "--owner", "runner-a", "--state-root", stopStateRoot]);
      assert(claim.code !== 0, "claim-next apply passed during active emergency stop");
      assert(claim.stdout.includes("BLOCKED: claim-next"), claim.stdout || claim.stderr);
      assert(claim.stderr.includes("blocked by active emergency stop"), claim.stderr || claim.stdout);
      assert(taskSnapshot(assignmentsDir) === beforeAssignments, "blocked claim-next mutated assignments");
      assert(taskSnapshot(tasksDir) === beforeTasks, "blocked claim-next mutated manifests");

      const dispatchSummary = run([
        "dispatch-next",
        "--dry-run",
        "--summary-json",
        "--owner",
        "runner-a",
        "--state-root",
        stopStateRoot,
      ]);
      assert(dispatchSummary.code === 0, dispatchSummary.stderr || dispatchSummary.stdout);
      const packet = JSON.parse(dispatchSummary.stdout);
      assert(packet.dispatch.allowed === false, dispatchSummary.stdout || dispatchSummary.stderr);
      assert(packet.dispatch.blockers.some((blocker) => blocker.includes("active emergency stop")), dispatchSummary.stdout || dispatchSummary.stderr);
      assert(packet.laneAssignmentPreview.blockedReasons.some((reason) => reason.includes("active emergency stop")), dispatchSummary.stdout || dispatchSummary.stderr);
      assert(packet.candidateStateCounts.emergency_stop === 1, dispatchSummary.stdout || dispatchSummary.stderr);

      const dispatchApply = run([
        "dispatch-next",
        "--apply",
        "--no-fetch",
        "--owner",
        "runner-a",
        "--state-root",
        stopStateRoot,
      ]);
      assert(dispatchApply.code !== 0, "dispatch-next apply passed during active emergency stop");
      assert(dispatchApply.stdout.includes("BLOCKED: dispatch-next"), dispatchApply.stdout || dispatchApply.stderr);
      assert(!existsSync(join(stopStateRoot, "worktrees")), "blocked dispatch-next created a worktree");
      assert(taskSnapshot(assignmentsDir) === beforeAssignments, "blocked dispatch-next mutated assignments");
      assert(taskSnapshot(tasksDir) === beforeTasks, "blocked dispatch-next mutated manifests");

      const blockedClear = run([
        "emergency-stop",
        "--clear",
        "--apply",
        "--reason",
        "operator approved resume after emergency",
        "--owner",
        "runner-a",
        "--state-root",
        stopStateRoot,
      ]);
      assert(blockedClear.code !== 0, "emergency-stop clear applied without approval evidence");
      assert(blockedClear.stdout.includes("BLOCKED: emergency-stop"), blockedClear.stdout || blockedClear.stderr);
      assert(readJson(stopPath).status === "active", blockedClear.stdout || blockedClear.stderr);

      const clear = run([
        "emergency-stop",
        "--clear",
        "--apply",
        "--reason",
        "operator approved resume after emergency",
        "--approval",
        "operator approved clearing emergency stop",
        "--owner",
        "runner-a",
        "--state-root",
        stopStateRoot,
      ]);
      assert(clear.code === 0, clear.stderr || clear.stdout);
      const cleared = readJson(stopPath);
      assert(cleared.status === "cleared", clear.stdout || clear.stderr);
      assert(cleared.previous_checkpoint.checkpointId === checkpoint.checkpoint_id, clear.stdout || clear.stderr);

      const resumedClaim = run(["claim-next", "--apply", "--owner", "runner-a", "--state-root", stopStateRoot]);
      assert(resumedClaim.code === 0, resumedClaim.stderr || resumedClaim.stdout);
      assert(resumedClaim.stdout.includes("claimed ready lane"), resumedClaim.stdout || resumedClaim.stderr);
    } finally {
      rmSync(stopStateRoot, { recursive: true, force: true });
    }
  });

  test("emergency-stop kill mode requires approval and remains process-mutation free", () => {
    const stopStateRoot = mkdtempSync(join(tmpdir(), "codex-emergency-stop-kill-"));
    try {
      const blocked = run([
        "emergency-stop",
        "--apply",
        "--mode",
        "kill",
        "--reason",
        "operator requested emergency kill posture",
        "--owner",
        "runner-a",
        "--state-root",
        stopStateRoot,
      ]);
      assert(blocked.code !== 0, "kill-mode emergency stop applied without approval");
      assert(blocked.stdout.includes("BLOCKED: emergency-stop"), blocked.stdout || blocked.stderr);
      assert(!existsSync(join(stopStateRoot, "emergency-stop.json")), "blocked kill-mode wrote checkpoint");

      const applied = run([
        "emergency-stop",
        "--apply",
        "--mode",
        "kill",
        "--reason",
        "operator requested emergency kill posture",
        "--approval",
        "operator approved recording kill posture only",
        "--owner",
        "runner-a",
        "--state-root",
        stopStateRoot,
      ]);
      assert(applied.code === 0, applied.stderr || applied.stdout);
      const packet = readJson(join(stopStateRoot, "emergency-stop.json"));
      assert(packet.status === "active", applied.stdout || applied.stderr);
      assert(packet.mode === "kill", applied.stdout || applied.stderr);
      assert(packet.controls.worker_process_mutation_allowed === false, applied.stdout || applied.stderr);
      assert(packet.controls.worker_process_action.includes("none;"), applied.stdout || applied.stderr);
      assert(packet.stop_lines.some((line) => line.includes("records intent only")), applied.stdout || applied.stderr);
    } finally {
      rmSync(stopStateRoot, { recursive: true, force: true });
    }
  });

  test("emergency-stop malformed checkpoint fails claim and dispatch closed", () => {
    const stopStateRoot = mkdtempSync(join(tmpdir(), "codex-emergency-stop-malformed-"));
    try {
      seedGeneratedSuccessorPrerequisites(stopStateRoot);
      writeFileSync(join(stopStateRoot, "emergency-stop.json"), `${JSON.stringify({ status: "active" })}\n`);

      const claim = run(["claim-next", "--dry-run", "--summary-json", "--owner", "runner-a", "--state-root", stopStateRoot]);
      assert(claim.code !== 0, "claim-next dry-run ignored malformed emergency stop checkpoint");
      assert(claim.stderr.includes("Emergency stop checkpoint is invalid"), claim.stderr || claim.stdout);

      const dispatch = run(["dispatch-next", "--dry-run", "--summary-json", "--owner", "runner-a", "--state-root", stopStateRoot]);
      assert(dispatch.code !== 0, "dispatch-next dry-run ignored malformed emergency stop checkpoint");
      assert(dispatch.stderr.includes("Emergency stop checkpoint is invalid"), dispatch.stderr || dispatch.stdout);
    } finally {
      rmSync(stopStateRoot, { recursive: true, force: true });
    }
  });

  test("claim-next summary-json surfaces active emergency stop before apply", () => {
    const stopStateRoot = mkdtempSync(join(tmpdir(), "codex-emergency-stop-claim-summary-"));
    try {
      seedGeneratedSuccessorPrerequisites(stopStateRoot);
      const stop = run([
        "emergency-stop",
        "--apply",
        "--mode",
        "pause",
        "--reason",
        "operator requested emergency pause",
        "--owner",
        "runner-a",
        "--state-root",
        stopStateRoot,
      ]);
      assert(stop.code === 0, stop.stderr || stop.stdout);

      const claim = run(["claim-next", "--dry-run", "--summary-json", "--owner", "runner-a", "--state-root", stopStateRoot]);
      assert(claim.code === 0, claim.stderr || claim.stdout);
      const packet = JSON.parse(claim.stdout);
      assert(packet.selected === null, claim.stdout || claim.stderr);
      assert(packet.assignmentPreview.blockedReasons.some((reason) => reason.includes("active emergency stop")), claim.stdout || claim.stderr);
      assert(packet.assignmentPreview.targetLane === null, claim.stdout || claim.stderr);
    } finally {
      rmSync(stopStateRoot, { recursive: true, force: true });
    }
  });

  test("emergency-stop shared lock blocks claim mutation and recovers stale lock", () => {
    const stopStateRoot = mkdtempSync(join(tmpdir(), "codex-emergency-stop-lock-"));
    try {
      seedGeneratedSuccessorPrerequisites(stopStateRoot);
      const assignmentsDir = join(stopStateRoot, "assignments");
      const tasksDir = join(stopStateRoot, "tasks");
      const lockPath = join(stopStateRoot, "emergency-stop.lock");
      const beforeAssignments = taskSnapshot(assignmentsDir);
      const beforeTasks = taskSnapshot(tasksDir);
      writeFileSync(lockPath, "active writer\n");

      const lockedClaim = run(["claim-next", "--apply", "--owner", "runner-a", "--state-root", stopStateRoot]);
      assert(lockedClaim.code !== 0, "claim-next apply ignored active emergency-stop lock");
      assert(lockedClaim.stderr.includes("Emergency stop checkpoint is locked"), lockedClaim.stderr || lockedClaim.stdout);
      assert(taskSnapshot(assignmentsDir) === beforeAssignments, "locked claim-next mutated assignments");
      assert(taskSnapshot(tasksDir) === beforeTasks, "locked claim-next mutated manifests");

      const oldDate = new Date(Date.now() - 10 * 60 * 1000);
      utimesSync(lockPath, oldDate, oldDate);
      const recoveredStop = run([
        "emergency-stop",
        "--apply",
        "--mode",
        "pause",
        "--reason",
        "operator requested emergency pause",
        "--owner",
        "runner-a",
        "--state-root",
        stopStateRoot,
      ]);
      assert(recoveredStop.code === 0, recoveredStop.stderr || recoveredStop.stdout);
      assert(readJson(join(stopStateRoot, "emergency-stop.json")).status === "active", recoveredStop.stdout || recoveredStop.stderr);
      assert(!existsSync(lockPath), "stale emergency-stop lock remained after successful apply");
    } finally {
      rmSync(stopStateRoot, { recursive: true, force: true });
    }
  });

  test("claim-next apply claims the open safe backlog lane without creating a worktree", () => {
    const claimStateRoot = mkdtempSync(join(tmpdir(), "codex-claim-next-apply-"));
    try {
      const tasksDir = join(claimStateRoot, "tasks");
      const assignmentsDir = join(claimStateRoot, "assignments");
      const expected = expectedOpenSafeBacklogCandidate();
      seedGeneratedSuccessorPrerequisites(claimStateRoot);
      const beforeTasks = taskSnapshot(tasksDir);

      const result = run(["claim-next", "--apply", "--owner", "runner-a", "--state-root", claimStateRoot]);

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes(`claimed ready lane ${expected.slug}`), result.stdout || result.stderr);
      const assignment = readJson(join(assignmentsDir, `${expected.slug}.json`));
      assert(assignment.owner === "runner-a", result.stdout || result.stderr);
      assert(assignment.branch === expected.branch, result.stdout || result.stderr);
      assert(assignment.phase === "claimed", "claim heartbeat phase missing");
      assert(assignment.runner_kind === "codex-cli", "claim heartbeat runner kind missing");
      assert(Boolean(assignment.last_heartbeat_at), "claim heartbeat timestamp missing");
      assert(assignment.stale_after_seconds === 86400, "claim heartbeat stale threshold missing");
      assert(assignment.heartbeat_count === 1, "claim heartbeat count missing");
      assert(assignment.events.some((event) => event.type === "heartbeat"), "claim heartbeat event missing");
      assert(!existsSync(join(claimStateRoot, "worktrees")), "claim-next --apply created worktrees");
      assert(taskSnapshot(tasksDir) === beforeTasks, "claim-next --apply mutated workspace task manifests");
    } finally {
      rmSync(claimStateRoot, { recursive: true, force: true });
    }
  });

  test("claim-next apply claims one existing unowned safe backlog workspace", () => {
    const claimStateRoot = mkdtempSync(join(tmpdir(), "codex-claim-next-unowned-ready-"));
    try {
      const expected = expectedOpenSafeBacklogCandidate();
      const tasksDir = join(claimStateRoot, "tasks");
      const assignmentsDir = join(claimStateRoot, "assignments");
      mkdirSync(tasksDir, { recursive: true });
      seedGeneratedSuccessorPrerequisites(claimStateRoot);
      seedUnownedSafeBacklogWorkspace(claimStateRoot, expected.slug, expected.branch);
      const manifestPath = join(tasksDir, `${expected.slug}-workspace.json`);
      const beforeTasks = taskSnapshot(tasksDir);

      const result = run(["claim-next", "--apply", "--owner", "runner-a", "--state-root", claimStateRoot]);

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes(`claim candidate ${expected.slug} (claim existing unowned workspace ${expected.slug}-workspace)`), result.stdout || result.stderr);
      assert(result.stdout.includes(`claimed existing unowned workspace ${expected.slug}-workspace for runner-a`), result.stdout || result.stderr);
      assert(result.stdout.includes("workspace manifest owner metadata only; no branch, PR, worktree, worker, or implementation mutation"), result.stdout || result.stderr);
      const manifest = readJson(manifestPath);
      assert(manifest.owner === "runner-a", result.stdout || result.stderr);
      assert(manifest.owner_acquired_at, "owner acquisition timestamp missing");
      assert(manifest.owner_updated_at === manifest.owner_acquired_at, "owner updated timestamp should match claim timestamp");
      assert(manifest.last_heartbeat_at === manifest.owner_acquired_at, "owner claim heartbeat timestamp missing");
      assert(manifest.stale_after_seconds === 86400, "owner claim stale threshold missing");
      assert(manifest.phase === "claimed", "owner claim phase missing");
      assert(manifest.runner_kind === "codex-cli", "owner claim runner kind missing");
      assert(manifest.heartbeat_count === 1, "owner claim heartbeat count missing");
      assert(manifest.ownership_takeovers?.[0]?.previous_owner === "unowned", "previous owner evidence missing");
      assert(manifest.ownership_takeovers?.[0]?.new_owner === "runner-a", "new owner evidence missing");
      assert(manifest.ownership_takeovers?.[0]?.reason === "unowned legacy lane claimed", "claim reason evidence missing");
      assert(manifest.events.some((event) => event.type === "ownership_claimed"), "ownership claim event missing");
      assert(manifest.events.some((event) => event.type === "heartbeat"), "owner claim heartbeat event missing");
      assert(manifest.branch === expected.branch, "claim changed manifest branch");
      assert(manifest.worktree_path === rootDir, "claim changed manifest worktree path");
      assert(!manifest.pr_url, "claim wrote PR URL evidence");
      assert(!manifest.pr_number, "claim wrote PR number evidence");
      assert(!existsSync(join(assignmentsDir, `${expected.slug}.json`)), "manifest owner claim should not create assignment metadata");
      assert(!existsSync(join(claimStateRoot, "worktrees")), "manifest owner claim should not create a worktree");
      const afterTasksWithoutClaimedManifest = taskSnapshot(tasksDir).replace(readFileSync(manifestPath, "utf8"), "");
      assert(beforeTasks.includes('"owner": ""'), "fixture should start unowned");
      assert(!afterTasksWithoutClaimedManifest.includes("runner-a"), "claim mutated unrelated task manifests");
    } finally {
      rmSync(claimStateRoot, { recursive: true, force: true });
    }
  });

  test("claim-next apply revalidates an unowned workspace before manifest claim", () => {
    const claimStateRoot = mkdtempSync(join(tmpdir(), "codex-claim-next-unowned-race-"));
    try {
      const expected = expectedOpenSafeBacklogCandidate();
      const staleLaneSlug = "bmad-1-1-validate-the-pipeline-work-packet-read-contract";
      const staleBranch = `codex/${staleLaneSlug}`;
      const tasksDir = join(claimStateRoot, "tasks");
      const assignmentsDir = join(claimStateRoot, "assignments");
      mkdirSync(tasksDir, { recursive: true });
      seedGeneratedSuccessorPrerequisites(claimStateRoot);
      seedUnownedSafeBacklogWorkspace(claimStateRoot, staleLaneSlug, staleBranch);
      const manifestPath = join(tasksDir, `${staleLaneSlug}-workspace.json`);

      const preview = run(["claim-next", "--dry-run", "--owner", "runner-a", "--state-root", claimStateRoot]);
      assert(preview.code === 0, preview.stderr || preview.stdout);
      assert(preview.stdout.includes(`claim candidate ${expected.slug}`), preview.stdout || preview.stderr);

      const manifest = readJson(manifestPath);
      manifest.owner = "runner-b";
      manifest.owner_acquired_at = "2026-06-28T00:00:00.000Z";
      manifest.owner_updated_at = "2026-06-28T00:00:00.000Z";
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      const beforeManifest = readFileSync(manifestPath, "utf8");
      const beforeAssignments = taskSnapshot(assignmentsDir);

      const result = run(["claim-next", "--apply", "--owner", "runner-a", "--state-root", claimStateRoot]);

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes(`claimed ready lane ${expected.slug}`), result.stdout || result.stderr);
      const afterManifest = readJson(manifestPath);
      assert(afterManifest.owner === "runner-b", "stale unowned preview claim overwrote the fresh owner");
      assert(readFileSync(manifestPath, "utf8") === beforeManifest, "stale unowned preview mutated the owned workspace manifest");
      assert(!existsSync(join(assignmentsDir, `${staleLaneSlug}.json`)), "stale unowned preview created assignment metadata for owned lane");
      assert(
        existsSync(join(assignmentsDir, `${expected.slug}.json`)),
        "apply did not claim the next safe assignment after revalidation",
      );
      assert(taskSnapshot(assignmentsDir) !== beforeAssignments, "apply should claim the next safe assignment instead of stale workspace");
    } finally {
      rmSync(claimStateRoot, { recursive: true, force: true });
    }
  });

  test("claim-next apply refreshes the open safe backlog assignment idempotently", () => {
    const claimStateRoot = mkdtempSync(join(tmpdir(), "codex-claim-next-idempotent-"));
    try {
      const expected = expectedOpenSafeBacklogCandidate();
      seedGeneratedSuccessorPrerequisites(claimStateRoot);
      const assignmentsDir = join(claimStateRoot, "assignments");
      const first = run(["claim-next", "--apply", "--owner", "runner-a", "--state-root", claimStateRoot]);
      assert(first.code === 0, first.stderr || first.stdout);
      const second = run(["claim-next", "--apply", "--owner", "runner-a", "--state-root", claimStateRoot]);
      assert(second.code === 0, second.stderr || second.stdout);
      assert(second.stdout.includes(`refreshed existing assignment ${expected.slug}`), second.stdout || second.stderr);
      const assignment = readJson(join(assignmentsDir, `${expected.slug}.json`));
      assert(assignment.assignment_id === expected.slug, second.stdout || second.stderr);
      assert(assignment.last_heartbeat_at, "idempotent claim heartbeat missing");
      assert(assignment.heartbeat_count === 2, "idempotent claim should refresh heartbeat evidence");
      assert(!existsSync(join(claimStateRoot, "worktrees")), "claim-next idempotent apply created worktrees");
    } finally {
      rmSync(claimStateRoot, { recursive: true, force: true });
    }
  });

  test("claim-next blocks a second active lane for the same runner session without mutation", () => {
    const claimStateRoot = mkdtempSync(join(tmpdir(), "codex-claim-next-current-owner-bounded-"));
    try {
      const assignmentsDir = join(claimStateRoot, "assignments");
      mkdirSync(assignmentsDir, { recursive: true });
      seedGeneratedSuccessorPrerequisites(claimStateRoot);
      writeFileSync(
        join(assignmentsDir, "manual-active-lane.json"),
        `${JSON.stringify(
          {
            assignment_id: "manual-active-lane",
            task_id: "manual-active-lane",
            lane_slug: "manual-active-lane",
            branch: "codex/manual-active-lane",
            status: "claimed",
            owner: "runner-a",
            assigned_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_heartbeat_at: new Date().toISOString(),
          },
          null,
          2,
        )}\n`,
      );
      const beforeAssignments = taskSnapshot(assignmentsDir);

      const preview = run(["claim-next", "--dry-run", "--summary-json", "--owner", "runner-a", "--state-root", claimStateRoot]);

      assert(preview.code === 0, preview.stderr || preview.stdout);
      const packet = JSON.parse(preview.stdout);
      assert(packet.selected === null, preview.stdout || preview.stderr);
      assert(packet.blockerStatusCounts.blocked_current_owner_active_lane === 1, preview.stdout || preview.stderr);
      assert(packet.blockers[0].reasonCode === "current_runner_active_lane_exists", preview.stdout || preview.stderr);
      assert(
        packet.assignmentPreview.blockedReasons.some((reason) => reason.includes("current runner already has active lane evidence")),
        preview.stdout || preview.stderr,
      );
      assert(taskSnapshot(assignmentsDir) === beforeAssignments, "claim-next dry-run mutated active assignment evidence");

      const apply = run(["claim-next", "--apply", "--owner", "runner-a", "--state-root", claimStateRoot]);
      assert(apply.code !== 0, "claim-next apply unexpectedly claimed a second active lane");
      assert(apply.stdout.includes("BLOCKED: claim-next"), apply.stdout || apply.stderr);
      assert(
        apply.stdout.includes("finish or clean up the current runner lane before claiming another safe backlog lane"),
        apply.stdout || apply.stderr,
      );
      assert(taskSnapshot(assignmentsDir) === beforeAssignments, "failed claim-next apply mutated assignment evidence");

      const dispatchPreview = run(["dispatch-next", "--dry-run", "--summary-json", "--owner", "runner-a", "--state-root", claimStateRoot]);
      assert(dispatchPreview.code === 0, dispatchPreview.stderr || dispatchPreview.stdout);
      const dispatchPacket = JSON.parse(dispatchPreview.stdout);
      assert(dispatchPacket.dispatch.allowed === false, dispatchPreview.stdout || dispatchPreview.stderr);
      assert(dispatchPacket.selected === null, dispatchPreview.stdout || dispatchPreview.stderr);
      assert(dispatchPacket.candidateStateCounts.blocked_current_owner_active_lane === 1, dispatchPreview.stdout || dispatchPreview.stderr);
      assert(
        dispatchPacket.laneAssignmentPreview.blockedReasons.some((reason) => reason.includes("current runner already has active lane evidence")),
        dispatchPreview.stdout || dispatchPreview.stderr,
      );
      assert(taskSnapshot(assignmentsDir) === beforeAssignments, "dispatch-next dry-run mutated active assignment evidence");

      const dispatchApply = run(["dispatch-next", "--apply", "--no-fetch", "--owner", "runner-a", "--state-root", claimStateRoot]);
      assert(dispatchApply.code !== 0, "dispatch-next apply unexpectedly claimed a second active lane");
      assert(dispatchApply.stderr.includes("No dispatchable safe backlog lane found."), dispatchApply.stdout || dispatchApply.stderr);
      assert(taskSnapshot(assignmentsDir) === beforeAssignments, "failed dispatch-next apply mutated assignment evidence");
      assert(!existsSync(join(claimStateRoot, "worktrees")), "failed dispatch-next apply created a worktree");
    } finally {
      rmSync(claimStateRoot, { recursive: true, force: true });
    }
  });

  test("claim-next bounds manager dispatcher owners to one active lane", () => {
    const claimStateRoot = mkdtempSync(join(tmpdir(), "codex-claim-next-manager-dispatcher-bounded-"));
    try {
      const assignmentsDir = join(claimStateRoot, "assignments");
      mkdirSync(assignmentsDir, { recursive: true });
      seedGeneratedSuccessorPrerequisites(claimStateRoot);
      writeFileSync(
        join(assignmentsDir, "manager-active-lane.json"),
        `${JSON.stringify(
          {
            assignment_id: "manager-active-lane",
            task_id: "manager-active-lane",
            lane_slug: "manager-active-lane",
            branch: "codex/manager-active-lane",
            status: "claimed",
            owner: "manager-alpha/dispatcher",
            assigned_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_heartbeat_at: new Date().toISOString(),
          },
          null,
          2,
        )}\n`,
      );
      const beforeAssignments = taskSnapshot(assignmentsDir);

      const preview = run(["claim-next", "--dry-run", "--summary-json", "--owner", "manager-alpha/dispatcher", "--state-root", claimStateRoot]);

      assert(preview.code === 0, preview.stderr || preview.stdout);
      const packet = JSON.parse(preview.stdout);
      assert(packet.selected === null, preview.stdout || preview.stderr);
      assert(packet.blockerStatusCounts.blocked_current_owner_active_lane === 1, preview.stdout || preview.stderr);
      assert(packet.blockers[0].reasonCode === "current_runner_active_lane_exists", preview.stdout || preview.stderr);
      assert(taskSnapshot(assignmentsDir) === beforeAssignments, "manager dispatcher claim preview mutated active assignment evidence");

      const apply = run(["claim-next", "--apply", "--owner", "manager-alpha/dispatcher", "--state-root", claimStateRoot]);
      assert(apply.code !== 0, "manager dispatcher claim-next apply unexpectedly claimed a second active lane");
      assert(apply.stdout.includes("BLOCKED: claim-next"), apply.stdout || apply.stderr);
      assert(taskSnapshot(assignmentsDir) === beforeAssignments, "manager dispatcher blocked claim mutated assignment evidence");
    } finally {
      rmSync(claimStateRoot, { recursive: true, force: true });
    }
  });

  test("dispatch-next apply summary-json returns a parseable blocked packet without mutation", () => {
    const dispatchStateRoot = mkdtempSync(join(tmpdir(), "codex-dispatch-apply-blocked-summary-json-"));
    try {
      const assignmentsDir = join(dispatchStateRoot, "assignments");
      const tasksDir = join(dispatchStateRoot, "tasks");
      mkdirSync(assignmentsDir, { recursive: true });
      seedGeneratedSuccessorPrerequisites(dispatchStateRoot);
      writeFileSync(
        join(assignmentsDir, "manual-active-lane.json"),
        `${JSON.stringify(
          {
            assignment_id: "manual-active-lane",
            task_id: "manual-active-lane",
            lane_slug: "manual-active-lane",
            branch: "codex/manual-active-lane",
            status: "claimed",
            owner: "runner-a",
            assigned_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_heartbeat_at: new Date().toISOString(),
          },
          null,
          2,
        )}\n`,
      );
      const beforeAssignments = taskSnapshot(assignmentsDir);
      const beforeTasks = taskSnapshot(tasksDir);

      const result = run([
        "dispatch-next",
        "--apply",
        "--summary-json",
        "--no-fetch",
        "--owner",
        "runner-a",
        "--state-root",
        dispatchStateRoot,
      ]);

      assert(result.code === 0, result.stderr || result.stdout);
      const packet = JSON.parse(result.stdout);
      assert(packet.ok === false, result.stdout || result.stderr);
      assert(packet.status === "blocked", result.stdout || result.stderr);
      assert(packet.dispatch.allowed === false, result.stdout || result.stderr);
      assert(packet.selected === null, result.stdout || result.stderr);
      assert(packet.mutation === "none; blocked apply made no assignment/workspace mutation", result.stdout || result.stderr);
      assert(packet.rawPayloadRetained === false, result.stdout || result.stderr);
      assert(taskSnapshot(assignmentsDir) === beforeAssignments, "dispatch blocked apply summary-json mutated assignments");
      assert(taskSnapshot(tasksDir) === beforeTasks, "dispatch blocked apply summary-json mutated manifests");
      assert(!existsSync(join(dispatchStateRoot, "worktrees")), "dispatch blocked apply summary-json created a worktree");
    } finally {
      rmSync(dispatchStateRoot, { recursive: true, force: true });
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
        "--decision",
        "continue with source-owned start after dispatch reported open delivery work",
        "--decision-rationale",
        "claim-next selected this owner-scoped lane and no second lane was claimed",
        "--next-safe-action",
        "record the decision and proceed with scoped implementation",
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
      assert(
        assignment.events.some((event) => event.type === "best_judgment_decision"),
        "best-judgment decision event missing",
      );
      assert(Array.isArray(assignment.best_judgment_decisions), "best-judgment decisions missing");
      assert(assignment.best_judgment_decisions.length === 1, "best-judgment decision count missing");
      assert(
        assignment.best_judgment_decisions[0].decision ===
          "continue with source-owned start after dispatch reported open delivery work",
        "best-judgment decision summary missing",
      );
      assert(
        assignment.best_judgment_decisions[0].rationale ===
          "claim-next selected this owner-scoped lane and no second lane was claimed",
        "best-judgment decision rationale missing",
      );
      assert(
        assignment.best_judgment_decisions[0].next_safe_action ===
          "record the decision and proceed with scoped implementation",
        "best-judgment next safe action missing",
      );
      assert(assignment.best_judgment_decisions[0].owner === "runner-a", "best-judgment owner missing");
      assert(assignment.best_judgment_decisions[0].phase === "active", "best-judgment phase missing");

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
      assert(packet.bestJudgmentDecisionCount === 0, result.stdout || result.stderr);
      assert(packet.latestBestJudgmentDecision === null, result.stdout || result.stderr);
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

  test("heartbeat requires complete best-judgment decision evidence", () => {
    const claimStateRoot = mkdtempSync(join(tmpdir(), "codex-heartbeat-decision-required-"));
    try {
      const expected = expectedClaimCandidate();
      seedClaimedSafeBacklogAssignment(claimStateRoot, expected.slug, "runner-a");
      const assignmentPath = join(claimStateRoot, "assignments", `${expected.slug}.json`);
      const before = readFileSync(assignmentPath, "utf8");

      const result = run([
        "heartbeat",
        expected.slug,
        "--owner",
        "runner-a",
        "--phase",
        "active",
        "--decision",
        "continue through routine uncertainty",
        "--state-root",
        claimStateRoot,
      ]);
      const after = readFileSync(assignmentPath, "utf8");

      assert(result.code !== 0, "heartbeat accepted incomplete best-judgment decision evidence");
      assert(result.stderr.includes("Best-judgment decision evidence requires"), result.stderr || result.stdout);
      assert(result.stderr.includes("--decision-rationale"), result.stderr || result.stdout);
      assert(result.stderr.includes("--next-safe-action"), result.stderr || result.stdout);
      assert(before === after, "failed incomplete decision heartbeat mutated assignment");
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

  test("takeover exact assignment id wins before fuzzy assignment matches", () => {
    const takeoverStateRoot = mkdtempSync(join(tmpdir(), "codex-takeover-exact-id-"));
    try {
      const assignmentsDir = join(takeoverStateRoot, "assignments");
      mkdirSync(assignmentsDir, { recursive: true });
      for (const assignmentId of ["18-1-manager-refill-apply-gate", "8-1-manager-refill-apply-gate"]) {
        writeFileSync(
          join(assignmentsDir, `${assignmentId}.json`),
          `${JSON.stringify(
            {
              assignment_id: assignmentId,
              task_id: `20260629-${assignmentId}`,
              lane_slug: assignmentId,
              branch: `codex/${assignmentId}`,
              status: "claimed",
              owner: "runner-b",
              updated_at: "2026-06-21T00:00:00.000Z",
              last_heartbeat_at: "2026-06-21T00:00:00.000Z",
            },
            null,
            2,
          )}\n`,
        );
      }

      const result = run([
        "takeover",
        "8-1-manager-refill-apply-gate",
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

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("- target assignment 8-1-manager-refill-apply-gate"), result.stdout || result.stderr);
      assert(!result.stderr.includes("Query matched multiple assignments"), result.stderr || result.stdout);
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
      assert(packet.authorityDecision?.operation === "takeover", result.stdout || result.stderr);
      assert(packet.authorityDecision?.authorityFamily === "worker-mutation", result.stdout || result.stderr);
      assert(packet.authorityDecision?.decision === "blocked", result.stdout || result.stderr);
      assert(packet.authorityDecision?.metadataOnly === true, result.stdout || result.stderr);
      assert(packet.authorityDecision?.rawPayloadRetained === false, result.stdout || result.stderr);
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
      assert(Array.isArray(assignment.authority_decisions), "generic authority decision evidence missing");
      assert(assignment.authority_decisions[0].operation === "takeover", "takeover authority decision missing");
      assert(assignment.authority_decisions[0].decision === "applied", "takeover authority decision not marked applied");
      assert(assignment.takeover_decisions[0].authority_decision?.decision === "applied", "takeover decision nested authority not marked applied");
      assert(assignment.authority_decisions[0].rawPayloadRetained === false, "takeover authority decision retained raw payload");
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
      const expected = expectedOpenSafeBacklogCandidate();
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
      assert(result.stdout.includes(`- selected lane ${expected.slug}`), result.stdout || result.stderr);
      assert(result.stdout.includes("- workspace action claim_and_create_workspace"), result.stdout || result.stderr);
      assert(result.stdout.includes("- allowed true"), result.stdout || result.stderr);
      assert(result.stdout.includes("- blockers none"), result.stdout || result.stderr);
      assert(result.stdout.includes("- queue states "), result.stdout || result.stderr);
      assert(result.stdout.includes("assignable=37"), result.stdout || result.stderr);
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
      const expected = expectedOpenSafeBacklogCandidate();
      assert(packet.currentOwner === "runner-a", result.stdout || result.stderr);
      assert(packet.readinessProfile === "doctor", result.stdout || result.stderr);
      assert(packet.selected?.itemId === expected.slug, result.stdout || result.stderr);
      assert(packet.dispatch.allowed === true, result.stdout || result.stderr);
      assert(packet.dispatch.authorityDecision?.operation === "dispatch-next", result.stdout || result.stderr);
      assert(packet.dispatch.authorityDecision?.authorityFamily === "worker-mutation", result.stdout || result.stderr);
      assert(packet.dispatch.authorityDecision?.allowed === true, result.stdout || result.stderr);
      assert(packet.dispatch.authorityDecision?.metadataOnly === true, result.stdout || result.stderr);
      assert(packet.dispatch.selectedLane === expected.slug, result.stdout || result.stderr);
      assert(packet.laneAssignmentPreview.proposedRunner === "runner-a", result.stdout || result.stderr);
      assert(packet.laneAssignmentPreview.targetLane === expected.slug, result.stdout || result.stderr);
      assert(packet.laneAssignmentPreview.targetBranch === expected.branch, result.stdout || result.stderr);
      assert(packet.laneAssignmentPreview.rationale.includes("ready safe backlog lane"), result.stdout || result.stderr);
      assert(Array.isArray(packet.laneAssignmentPreview.blockedReasons), result.stdout || result.stderr);
      assert(packet.laneAssignmentPreview.blockedReasons.length === 0, result.stdout || result.stderr);
      assert(packet.laneAssignmentPreview.requiredEvidence.includes("dispatch-next dry-run summary-json"), result.stdout || result.stderr);
      assert(packet.laneAssignmentPreview.mutation === "none; preview only", result.stdout || result.stderr);
      assert(!("assignedLane" in packet.laneAssignmentPreview), result.stdout || result.stderr);
      assert(packet.dispatch.workspaceAction === "claim_and_create_workspace", result.stdout || result.stderr);
      assert(packet.dispatch.nextActionGuidance.includes("run dispatch-next --apply"), result.stdout || result.stderr);
      assert(packet.counts.total > 0, result.stdout || result.stderr);
      assert(packet.counts.dispatchable === 37, result.stdout || result.stderr);
      assert(packet.candidateStateCounts.assignable === 37, result.stdout || result.stderr);
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

  test("dispatch-next summary-json counts blocked candidate reason codes before truncation", () => {
    const dispatchStateRoot = mkdtempSync(join(tmpdir(), "codex-dispatch-reason-code-counts-"));
    try {
      seedGeneratedSuccessorPrerequisites(dispatchStateRoot);
      const assignmentsDir = join(dispatchStateRoot, "assignments");
      const tasksDir = join(dispatchStateRoot, "tasks");
      mkdirSync(assignmentsDir, { recursive: true });
      const duplicateBranch = "codex/bmad-1-1-validate-the-pipeline-work-packet-read-contract";
      for (const duplicateId of ["duplicate-dispatch-assignment-a", "duplicate-dispatch-assignment-b"]) {
        writeFileSync(
          join(assignmentsDir, `${duplicateId}.json`),
          `${JSON.stringify(
            {
              assignment_id: duplicateId,
              task_id: duplicateId,
              branch: duplicateBranch,
              status: "claimed",
              owner: "runner-b",
              last_heartbeat_at: new Date().toISOString(),
            },
            null,
            2,
          )}\n`,
        );
      }
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
      const duplicateCandidate = packet.blockedCandidates.find(
        (candidate) => candidate.item_id === "bmad-1-1-validate-the-pipeline-work-packet-read-contract",
      );
      assert(packet.blockedCandidateReasonCodeCounts.duplicate_lane_assignments === 1, result.stdout);
      assert(duplicateCandidate?.reason_code === "duplicate_lane_assignments", result.stdout);
      assert(taskSnapshot(assignmentsDir) === beforeAssignments, "dispatch reason-code dry-run mutated assignments");
      assert(taskSnapshot(tasksDir) === beforeTasks, "dispatch reason-code dry-run mutated manifests");
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

      assert(result.code !== 0, "dispatch-next unexpectedly accepted an invalid base branch");
      assert(result.stderr.includes("Invalid base branch: bad:refs/heads/injected"), result.stderr || result.stdout);
      assert(taskSnapshot(assignmentsDir) === beforeAssignments, "invalid dispatch base mutated assignments");
      assert(taskSnapshot(tasksDir) === beforeTasks, "invalid dispatch base mutated manifests");
    } finally {
      rmSync(dispatchStateRoot, { recursive: true, force: true });
    }
  });

  test("dispatch-next apply does not claim unowned workspace when source lane is closed", () => {
    const dispatchStateRoot = mkdtempSync(join(tmpdir(), "codex-dispatch-apply-workspace-"));
    const worktreePath = mkdtempSync(join(tmpdir(), "codex-dispatch-worktree-"));
    let selectedLane = null;
    let selectedLaneExistedBefore = false;
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
      const readyCandidates = safeBacklogReadyItemIds().map((slug) => ({
        slug,
        title: slug.replaceAll("-", " "),
        branch: `codex/${slug}`,
      }));
      selectedLane = readyCandidates.find((candidate) => !branchExists(rootDir, candidate.branch) && !remoteBranchExists(rootDir, candidate.branch));
      if (!selectedLane) {
        assert(
          readyCandidates.every((candidate) => branchExists(rootDir, candidate.branch) || remoteBranchExists(rootDir, candidate.branch)),
          "saturated safe backlog branch fixture should mean every ready backlog branch exists locally or remotely",
        );
        return;
      }
      for (const candidate of readyCandidates.slice(0, readyCandidates.indexOf(selectedLane))) {
        seedClosedSourceCompletion(dispatchStateRoot, candidate);
      }
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
      selectedLaneExistedBefore = branchExists(rootDir, selectedLane.branch);

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

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes(`selected lane ${selectedLane.slug}`), result.stdout || result.stderr);
      assert(after === before, "dispatch mutated unowned workspace manifest for closed source lane");
      assert(!existsSync(join(dispatchStateRoot, "assignments", `${expected.slug}.json`)), "workspace dispatch created closed-source assignment metadata");
      assert(
        existsSync(join(dispatchStateRoot, "assignments", `${selectedLane.slug}.json`)),
        "dispatch did not create selected lane assignment metadata",
      );
      const assignment = readJson(join(dispatchStateRoot, "assignments", `${selectedLane.slug}.json`));
      assert(assignment.status === "active", "dispatch assignment should be active after handoff");
      assert(assignment.phase === "handoff", "dispatch assignment phase missing");
      assert(assignment.runner_kind === "codex-cli", "dispatch assignment runner kind missing");
      assert(assignment.last_heartbeat_at === assignment.updated_at, "dispatch assignment heartbeat timestamp missing");
      assert(assignment.stale_after_seconds === 86400, "dispatch assignment stale threshold missing");
      assert(assignment.heartbeat_count === 2, "dispatch assignment should include claim and handoff heartbeats");
      assert(assignment.events.some((event) => event.type === "heartbeat"), "dispatch assignment heartbeat event missing");
      const dispatchedManifest = readJson(join(tasksDir, `${assignment.task_id}.json`));
      assert(dispatchedManifest.phase === "handoff", "dispatch manifest phase missing");
      assert(dispatchedManifest.last_heartbeat_at === dispatchedManifest.updated_at, "dispatch manifest heartbeat timestamp missing");
      assert(dispatchedManifest.stale_after_seconds === 86400, "dispatch manifest stale threshold missing");
      assert(dispatchedManifest.heartbeat_count === 1, "dispatch manifest heartbeat count missing");
      assert(dispatchedManifest.events.some((event) => event.type === "heartbeat"), "dispatch manifest heartbeat event missing");
    } finally {
      rmSync(dispatchStateRoot, { recursive: true, force: true });
      spawnSync("git", ["worktree", "prune", "--expire", "now"], {
        cwd: rootDir,
        encoding: "utf8",
        stdio: "pipe",
      });
      if (selectedLane && !selectedLaneExistedBefore) {
        spawnSync("git", ["branch", "-D", selectedLane.branch], {
          cwd: rootDir,
          encoding: "utf8",
          stdio: "pipe",
        });
      }
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
        "codex/setup-churn-handoff-hardening",
        ...bmadPipelineBacklogBranches(),
        "codex/queue-zero-runway-continuity-refresh",
        "codex/queue-zero-runway-followup-refresh",
        "codex/queue-zero-runway-replenishment-refresh",
        "codex/queue-zero-runway-reserve-refresh",
        "codex/queue-zero-runway-standby-refresh",
        "codex/queue-zero-runway-buffer-refresh",
        "codex/queue-zero-runway-overflow-refresh",
        "codex/queue-zero-runway-spillover-refresh",
        "codex/queue-zero-runway-carryover-refresh",
        "codex/queue-zero-runway-relay-refresh",
        "codex/queue-zero-runway-successor-refresh",
        "codex/verification-surface-hardening-followup",
        "codex/verification-surface-hardening",
        "codex/github-delivery-hygiene",
        "codex/read-only-evidence-polish-followup",
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
      const authorityBlockedBranch = "codex/bmad-1-1-validate-the-pipeline-work-packet-read-contract";
      const ambiguousBranch = "codex/bmad-1-2-expose-read-only-supervisor-packet-projections";
      const manifestPaths = blockedBranches.map((branchName, index) => {
        const manifest = {
          task_id: `dispatch-workspace-${index}`,
          branch: branchName,
          worktree_path: worktreePath,
          base_branch: "main",
          status: branchName === authorityBlockedBranch ? "blocked_authority_waiting" : "active",
          owner: branchName === ambiguousBranch ? "runner-a" : "runner-b",
          owner_updated_at: new Date().toISOString(),
        };
        if (branchName === ambiguousBranch) {
          manifest.worktree_path = join(tmpdir(), "codex-missing-dispatch-worktree-fixture");
        }
        const manifestPath = join(tasksDir, `dispatch-workspace-${index}.json`);
        writeFileSync(
          manifestPath,
          `${JSON.stringify(manifest)}\n`,
        );
        return manifestPath;
      });
      const before = manifestPaths.map((manifestPath) => readFileSync(manifestPath, "utf8")).join("\n---\n");

      const summary = run([
        "dispatch-next",
        "--dry-run",
        "--summary-json",
        "--owner",
        "runner-a",
        "--readiness",
        "none",
        "--state-root",
        dispatchStateRoot,
      ]);
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

      assert(summary.code === 0, summary.stderr || summary.stdout);
      const packet = JSON.parse(summary.stdout);
      const authorityBlocked = packet.blockedCandidates.find(
        (candidate) => candidate.item_id === "bmad-1-1-validate-the-pipeline-work-packet-read-contract",
      );
      const ambiguous = packet.blockedCandidates.find(
        (candidate) => candidate.item_id === "bmad-1-2-expose-read-only-supervisor-packet-projections",
      );
      assert(packet.dispatch.allowed === false, summary.stdout);
      assert(packet.candidateStateCounts.blocked_authority >= 1, summary.stdout);
      assert(packet.candidateStateCounts.ambiguous >= 1, summary.stdout);
      assert(authorityBlocked?.status === "blocked_authority", summary.stdout);
      assert(authorityBlocked?.reason_code === "manifest_authority_blocked", summary.stdout);
      assert(ambiguous?.status === "ambiguous", summary.stdout);
      assert(ambiguous?.reason_code === "worktree_path_missing", summary.stdout);
      assert(result.code !== 0, "dispatch unexpectedly passed for workspace owned by another runner");
      assert(result.stdout.includes("BLOCKED: dispatch-next"), result.stderr || result.stdout);
      assert(result.stdout.includes("no dispatchable safe backlog lane found"), result.stderr || result.stdout);
      assert(result.stdout.includes("reason_code=manifest_authority_blocked"), result.stderr || result.stdout);
      assert(result.stdout.includes("reason_code=worktree_path_missing"), result.stderr || result.stdout);
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
        "setup-churn-handoff-hardening",
        ...bmadPipelineBacklogSlugs(),
        "queue-zero-runway-continuity-refresh",
        "queue-zero-runway-followup-refresh",
        "queue-zero-runway-replenishment-refresh",
        "queue-zero-runway-reserve-refresh",
        "queue-zero-runway-standby-refresh",
        "queue-zero-runway-buffer-refresh",
        "queue-zero-runway-overflow-refresh",
        "queue-zero-runway-spillover-refresh",
        "queue-zero-runway-carryover-refresh",
        "queue-zero-runway-relay-refresh",
        "queue-zero-runway-successor-refresh",
        "verification-surface-hardening-followup",
        "github-delivery-hygiene",
        "read-only-evidence-polish-followup",
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
        "setup-churn-handoff-hardening",
        ...bmadPipelineBacklogSlugs(),
        "queue-zero-runway-continuity-refresh",
        "queue-zero-runway-followup-refresh",
        "queue-zero-runway-replenishment-refresh",
        "queue-zero-runway-reserve-refresh",
        "queue-zero-runway-standby-refresh",
        "queue-zero-runway-buffer-refresh",
        "queue-zero-runway-overflow-refresh",
        "queue-zero-runway-spillover-refresh",
        "queue-zero-runway-carryover-refresh",
        "queue-zero-runway-relay-refresh",
        "queue-zero-runway-successor-refresh",
        "verification-surface-hardening-followup",
        "github-delivery-hygiene",
        "read-only-evidence-polish-followup",
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
      const openLane = expectedOpenSafeBacklogCandidate();

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes(`claim candidate ${openLane.slug}`), result.stdout || result.stderr);
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
      const openLane = expectedOpenSafeBacklogCandidate();

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes(`claimed ready lane ${openLane.slug}`), result.stdout || result.stderr);
      assert(!existsSync(join(claimStateRoot, "assignments", `${expected.slug}.json`)), "manifest claim should not create assignment metadata");
      assert(
        existsSync(join(claimStateRoot, "assignments", `${openLane.slug}.json`)),
        "claim-next did not create open lane assignment metadata",
      );
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
        "--decision",
        "stop for thread-aware review before merge",
        "--decision-rationale",
        "low-risk delivery requires review-thread evidence at the exact head",
        "--next-safe-action",
        "fetch review threads and record the gate result",
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
      assert(
        manifest.events.some((event) => event.type === "best_judgment_decision"),
        "workspace best-judgment event missing",
      );
      assert(Array.isArray(manifest.best_judgment_decisions), "workspace best-judgment decisions missing");
      assert(manifest.best_judgment_decisions.length === 1, "workspace best-judgment decision count missing");
      assert(
        manifest.best_judgment_decisions[0].decision === "stop for thread-aware review before merge",
        "workspace best-judgment decision missing",
      );
      assert(
        manifest.best_judgment_decisions[0].next_safe_action === "fetch review threads and record the gate result",
        "workspace best-judgment next safe action missing",
      );
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
        "--decision",
        "continue after runbook verification passed",
        "--decision-rationale",
        "the touched surface is source-owned workflow evidence only",
        "--next-safe-action",
        "run codex workspace tests",
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
      assert(packet.bestJudgmentDecisionCount === 1, result.stdout || result.stderr);
      assert(packet.latestBestJudgmentDecision.decision === "continue after runbook verification passed", result.stdout || result.stderr);
      assert(packet.latestBestJudgmentDecision.rationale === "the touched surface is source-owned workflow evidence only", result.stdout || result.stderr);
      assert(packet.latestBestJudgmentDecision.nextSafeAction === "run codex workspace tests", result.stdout || result.stderr);
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

  test("takeover apply transfers a stale dirty lane only with exact path fingerprints", () => {
    const fixture = createDirtyTakeoverFixture("allowed-exact-fingerprints");
    try {
      writeFileSync(join(fixture.worktree, "dirty.txt"), "preserve this intended lane work\n");
      const result = runFixtureScript(fixture, dirtyTakeoverArgs(fixture, ["dirty.txt"]));

      assert(result.code === 0, result.stderr || result.stdout);
      const manifest = readFixtureDirtyTakeoverManifest(fixture);
      assert(manifest.owner === "runner-a", "dirty takeover did not update workspace owner");
      const decision = manifest.takeover_decisions.at(-1);
      const dirtyEvidence = decision.dirty_in_lane_evidence;
      const expectedDigest = createHash("sha256").update("preserve this intended lane work\n").digest("hex");
      assert(dirtyEvidence.mode === "requested", JSON.stringify(dirtyEvidence));
      assert(dirtyEvidence.lock_evidence.status === "absent", JSON.stringify(dirtyEvidence));
      assert(dirtyEvidence.status === "stable", JSON.stringify(dirtyEvidence));
      assert(dirtyEvidence.before.paths[0].path === "dirty.txt", JSON.stringify(dirtyEvidence));
      assert(dirtyEvidence.before.paths[0].sha256 === expectedDigest, JSON.stringify(dirtyEvidence));
      assert(dirtyEvidence.after.paths[0].sha256 === expectedDigest, JSON.stringify(dirtyEvidence));
      assert(decision.previous_owner === "runner-b" && decision.requesting_owner === "runner-a", JSON.stringify(decision));
      assert(decision.reason === "stale owner evidence reviewed", JSON.stringify(decision));
    } finally {
      cleanupDirtyTakeoverFixture(fixture);
    }
  });

  test("malformed zero-byte dirty lock recovers only the Story 36.5-shaped approved lane", () => {
    const fixture = createDirtyTakeoverFixture("story-36-5-zero-byte-lock");
    try {
      const corePath = join(fixture.worktree, "scripts", "lib", "manager-control-plane", "core.mjs");
      const testPath = join(fixture.worktree, "tests", "manager-control-plane.test.mjs");
      mkdirSync(dirname(corePath), { recursive: true });
      mkdirSync(dirname(testPath), { recursive: true });
      writeFileSync(corePath, "export const recovered = true;\n");
      writeFileSync(testPath, "export const covered = true;\n");
      const lockPath = join(fixture.stateRoot, "tasks", `${fixture.taskId}.lock`);
      writeFileSync(lockPath, "");

      const result = runFixtureScript(
        fixture,
        dirtyTakeoverArgs(fixture, ["scripts/lib/manager-control-plane/core.mjs", "tests/manager-control-plane.test.mjs"]),
      );

      assert(result.code === 0, result.stderr || result.stdout);
      const manifest = readFixtureDirtyTakeoverManifest(fixture);
      const recovery = manifest.takeover_decisions.at(-1).dirty_in_lane_evidence.malformed_lock_recovery;
      assert(recovery.status === "recovered", JSON.stringify(recovery));
      assert(recovery.classification === "zero_byte", JSON.stringify(recovery));
      const archives = readdirSync(join(fixture.stateRoot, "tasks", ".lock-history"));
      assert(archives.length === 1, JSON.stringify(archives));
      assert(readFileSync(join(fixture.stateRoot, "tasks", ".lock-history", archives[0]), "utf8") === "", "recovery did not archive the exact zero-byte lock");
      assert(!existsSync(lockPath), "recovered zero-byte lock remained after takeover");
    } finally {
      cleanupDirtyTakeoverFixture(fixture);
    }
  });

  test("malformed nonempty dirty lock remains blocked without archival or ownership mutation", () => {
    const fixture = createDirtyTakeoverFixture("nonempty-malformed-lock");
    try {
      writeFileSync(join(fixture.worktree, "dirty.txt"), "must remain blocked\n");
      const lockPath = join(fixture.stateRoot, "tasks", `${fixture.taskId}.lock`);
      writeFileSync(lockPath, "not-json\n");
      const before = readFileSync(fixture.manifestPath, "utf8");

      const result = runFixtureScript(fixture, dirtyTakeoverArgs(fixture, ["dirty.txt"]));

      assert(result.code !== 0, "nonempty malformed lock unexpectedly recovered");
      assert(readFileSync(lockPath, "utf8") === "not-json\n", "nonempty malformed lock changed");
      assert(readFileSync(fixture.manifestPath, "utf8") === before, "blocked recovery mutated ownership");
      assert(!existsSync(join(fixture.stateRoot, "tasks", ".lock-history")), "blocked recovery archived a nonempty lock");
    } finally {
      cleanupDirtyTakeoverFixture(fixture);
    }
  });

  test("zero-byte dirty lock remains blocked without explicit approval or archival", () => {
    const fixture = createDirtyTakeoverFixture("zero-byte-missing-approval");
    try {
      writeFileSync(join(fixture.worktree, "dirty.txt"), "must remain blocked\n");
      const lockPath = join(fixture.stateRoot, "tasks", `${fixture.taskId}.lock`);
      writeFileSync(lockPath, "");
      const before = readFileSync(fixture.manifestPath, "utf8");
      const args = dirtyTakeoverArgs(fixture, ["dirty.txt"]);
      const approvalIndex = args.indexOf("--approval");
      args.splice(approvalIndex, 2);

      const result = runFixtureScript(fixture, args);

      assert(result.code !== 0, "zero-byte lock unexpectedly recovered without approval");
      assert(existsSync(lockPath), "zero-byte lock was archived without approval");
      assert(readFileSync(fixture.manifestPath, "utf8") === before, "missing-approval recovery mutated ownership");
      assert(!existsSync(join(fixture.stateRoot, "tasks", ".lock-history")), "missing-approval recovery archived a lock");
    } finally {
      cleanupDirtyTakeoverFixture(fixture);
    }
  });

  test("zero-byte dirty lock remains blocked when live GitHub evidence finds a PR", () => {
    const fixture = createDirtyTakeoverFixture("zero-byte-live-pr", {
      prListJson: JSON.stringify([{ number: 81, state: "OPEN", headRefName: "codex/stale-zero-byte-live-pr" }]),
    });
    try {
      writeFileSync(join(fixture.worktree, "dirty.txt"), "must remain blocked\n");
      const lockPath = join(fixture.stateRoot, "tasks", `${fixture.taskId}.lock`);
      writeFileSync(lockPath, "");
      const before = readFileSync(fixture.manifestPath, "utf8");

      const result = runFixtureScript(fixture, dirtyTakeoverArgs(fixture, ["dirty.txt"]));

      assert(result.code !== 0, "zero-byte lock unexpectedly recovered with a live PR");
      assert(existsSync(lockPath), "zero-byte lock was archived with a live PR");
      assert(readFileSync(fixture.manifestPath, "utf8") === before, "live-PR recovery mutated ownership");
      assert(!existsSync(join(fixture.stateRoot, "tasks", ".lock-history")), "live-PR recovery archived a lock");
    } finally {
      cleanupDirtyTakeoverFixture(fixture);
    }
  });

  test("takeover dirty-lane path rejects unexpected and unsafe path declarations without mutation", () => {
    const takeoverStateRoot = mkdtempSync(join(tmpdir(), "codex-takeover-dirty-reject-"));
    const worktreePath = mkdtempSync(join(tmpdir(), "codex-takeover-dirty-reject-worktree-"));
    try {
      runGit(worktreePath, ["init", "-q"]);
      runGit(worktreePath, ["config", "user.email", "codex-workspace-test@example.com"]);
      runGit(worktreePath, ["config", "user.name", "Codex Workspace Test"]);
      writeFileSync(join(worktreePath, "tracked.txt"), "base\n");
      runGit(worktreePath, ["add", "tracked.txt"]);
      runGit(worktreePath, ["commit", "-q", "-m", "base"]);
      runGit(worktreePath, ["checkout", "-q", "-b", "codex/stale-dirty-reject"]);
      writeFileSync(join(worktreePath, "dirty.txt"), "dirty\n");

      const tasksDir = join(takeoverStateRoot, "tasks");
      mkdirSync(tasksDir, { recursive: true });
      const manifestPath = join(tasksDir, "stale-dirty-reject.json");
      writeFileSync(
        manifestPath,
        `${JSON.stringify({
          task_id: "stale-dirty-reject",
          branch: "codex/stale-dirty-reject",
          worktree_path: worktreePath,
          base_branch: "main",
          status: "active",
          owner: "runner-b",
          owner_updated_at: "2026-06-21T00:00:00.000Z",
          last_heartbeat_at: "2026-06-21T00:00:00.000Z",
        }, null, 2)}\n`,
      );
      const before = readFileSync(manifestPath, "utf8");

      for (const dirtyPaths of ["dirty.txt,unlisted.txt", "../outside.txt"]) {
        const result = run([
          "takeover",
          "stale-dirty-reject",
          "--apply",
          "--owner",
          "runner-a",
          "--takeover-reason",
          "stale owner evidence reviewed",
          "--approval",
          "operator explicitly approved the bounded dirty lane takeover",
          "--allow-dirty-in-lane",
          "--dirty-paths",
          dirtyPaths,
          "--stale-after-seconds",
          "60",
          "--state-root",
          takeoverStateRoot,
        ]);
        assert(result.code !== 0, `dirty takeover unexpectedly passed for ${dirtyPaths}`);
        assert(readFileSync(manifestPath, "utf8") === before, "rejected dirty takeover changed the manifest");
      }
    } finally {
      rmSync(takeoverStateRoot, { recursive: true, force: true });
      rmSync(worktreePath, { recursive: true, force: true });
    }
  });

  test("takeover dirty-lane path rejects a retained active task lock without mutation", () => {
    const takeoverStateRoot = mkdtempSync(join(tmpdir(), "codex-takeover-dirty-lock-"));
    const worktreePath = mkdtempSync(join(tmpdir(), "codex-takeover-dirty-lock-worktree-"));
    try {
      runGit(worktreePath, ["init", "-q"]);
      runGit(worktreePath, ["config", "user.email", "codex-workspace-test@example.com"]);
      runGit(worktreePath, ["config", "user.name", "Codex Workspace Test"]);
      writeFileSync(join(worktreePath, "tracked.txt"), "base\n");
      runGit(worktreePath, ["add", "tracked.txt"]);
      runGit(worktreePath, ["commit", "-q", "-m", "base"]);
      runGit(worktreePath, ["checkout", "-q", "-b", "codex/stale-dirty-lock"]);
      writeFileSync(join(worktreePath, "dirty.txt"), "dirty\n");

      const tasksDir = join(takeoverStateRoot, "tasks");
      mkdirSync(tasksDir, { recursive: true });
      const manifestPath = join(tasksDir, "stale-dirty-lock.json");
      writeFileSync(
        manifestPath,
        `${JSON.stringify({
          task_id: "stale-dirty-lock",
          branch: "codex/stale-dirty-lock",
          worktree_path: worktreePath,
          base_branch: "main",
          status: "active",
          owner: "runner-b",
          owner_updated_at: "2026-06-21T00:00:00.000Z",
          last_heartbeat_at: "2026-06-21T00:00:00.000Z",
        }, null, 2)}\n`,
      );
      writeFileSync(
        join(tasksDir, "stale-dirty-lock.lock"),
        `${JSON.stringify(fixtureTaskLockMetadata("stale-dirty-lock"))}\n`,
      );
      const before = readFileSync(manifestPath, "utf8");

      const result = run([
        "takeover",
        "stale-dirty-lock",
        "--apply",
        "--owner",
        "runner-a",
        "--takeover-reason",
        "stale owner evidence reviewed",
        "--approval",
        "operator explicitly approved the bounded dirty lane takeover",
        "--allow-dirty-in-lane",
        "--dirty-paths",
        "dirty.txt",
        "--stale-after-seconds",
        "60",
        "--state-root",
        takeoverStateRoot,
      ]);
      assert(result.code !== 0, "dirty takeover unexpectedly passed with an active task lock");
      assert(result.stdout.includes("requires proof that no task lock is active or retained"), result.stderr || result.stdout);
      assert(readFileSync(manifestPath, "utf8") === before, "active-lock dirty takeover changed the manifest");
    } finally {
      rmSync(takeoverStateRoot, { recursive: true, force: true });
      rmSync(worktreePath, { recursive: true, force: true });
    }
  });

  test("takeover dirty-lane path preserves a leading porcelain status column", () => {
    const fixture = createDirtyTakeoverFixture("leading-status");
    try {
      writeFileSync(join(fixture.worktree, "tracked.txt"), "unstaged change retains the leading status column\n");
      const result = runFixtureScript(fixture, dirtyTakeoverArgs(fixture, ["tracked.txt"]));

      assert(result.code === 0, JSON.stringify(result));
      const manifest = readFixtureDirtyTakeoverManifest(fixture);
      const evidence = manifest.takeover_decisions.at(-1).dirty_in_lane_evidence;
      assert(evidence.before.paths[0].status_code === " M", JSON.stringify(evidence));
      assert(evidence.after.paths[0].status_code === " M", JSON.stringify(evidence));
    } finally {
      cleanupDirtyTakeoverFixture(fixture);
    }
  });

  test("takeover dirty-lane path discovers nested untracked files with untracked=all", () => {
    const fixture = createDirtyTakeoverFixture("nested-untracked");
    try {
      mkdirSync(join(fixture.worktree, "nested"), { recursive: true });
      writeFileSync(join(fixture.worktree, "nested", "untracked.txt"), "nested untracked lane work\n");
      const result = runFixtureScript(fixture, dirtyTakeoverArgs(fixture, ["nested/untracked.txt"]));

      assert(result.code === 0, result.stderr || result.stdout);
      const evidence = readFixtureDirtyTakeoverManifest(fixture).takeover_decisions.at(-1).dirty_in_lane_evidence;
      assert(evidence.before.paths[0].path === "nested/untracked.txt", JSON.stringify(evidence));
      assert(evidence.after.paths[0].path === "nested/untracked.txt", JSON.stringify(evidence));
    } finally {
      cleanupDirtyTakeoverFixture(fixture);
    }
  });

  test("takeover dirty-lane path requires positive stale-owner evidence", () => {
    const fixture = createDirtyTakeoverFixture("missing-stale-proof", { heartbeat: null });
    try {
      writeFileSync(join(fixture.worktree, "dirty.txt"), "untrusted owner time must not become stale\n");
      const before = readFileSync(fixture.manifestPath, "utf8");
      const result = runFixtureScript(fixture, dirtyTakeoverArgs(fixture, ["dirty.txt"]));

      assert(result.code !== 0, "takeover unexpectedly accepted a missing owner heartbeat");
      assert(result.stdout.includes("owner heartbeat is not stale"), result.stderr || result.stdout);
      assert(readFileSync(fixture.manifestPath, "utf8") === before, "missing stale proof mutated the manifest");
    } finally {
      cleanupDirtyTakeoverFixture(fixture);
    }
  });

  test("takeover dirty-lane path records the exact index fingerprint separately from file content", () => {
    const fixture = createDirtyTakeoverFixture("index-fingerprint");
    try {
      writeFileSync(join(fixture.worktree, "tracked.txt"), "staged index content\n");
      runGit(fixture.worktree, ["add", "tracked.txt"]);
      const expectedIndex = createHash("sha256").update(runGit(fixture.worktree, ["ls-files", "--stage", "--", "tracked.txt"]).stdout).digest("hex");
      const expectedContent = createHash("sha256").update("staged index content\n").digest("hex");
      const result = runFixtureScript(fixture, dirtyTakeoverArgs(fixture, ["tracked.txt"]));

      assert(result.code === 0, result.stderr || result.stdout);
      const evidence = readFixtureDirtyTakeoverManifest(fixture).takeover_decisions.at(-1).dirty_in_lane_evidence;
      assert(evidence.before.paths[0].sha256 === expectedContent, JSON.stringify(evidence));
      assert(evidence.before.paths[0].index_sha256 === expectedIndex, JSON.stringify(evidence));
      assert(evidence.before.paths[0].index_sha256 === evidence.after.paths[0].index_sha256, JSON.stringify(evidence));
    } finally {
      cleanupDirtyTakeoverFixture(fixture);
    }
  });

  test("takeover dirty-lane path treats commas as literal exact filename characters", () => {
    const fixture = createDirtyTakeoverFixture("comma-path");
    try {
      const commaPath = "comma,name.txt";
      writeFileSync(join(fixture.worktree, commaPath), "comma is part of this exact filename\n");
      const result = runFixtureScript(fixture, dirtyTakeoverArgs(fixture, [commaPath]));

      assert(result.code === 0, result.stderr || result.stdout);
      const evidence = readFixtureDirtyTakeoverManifest(fixture).takeover_decisions.at(-1).dirty_in_lane_evidence;
      assert(evidence.before.paths[0].path === commaPath, JSON.stringify(evidence));
      assert(evidence.requested_paths.length === 1 && evidence.requested_paths[0] === commaPath, JSON.stringify(evidence));
    } finally {
      cleanupDirtyTakeoverFixture(fixture);
    }
  });

  test("takeover dirty-lane path preserves literal leading whitespace in an exact filename", () => {
    const fixture = createDirtyTakeoverFixture("leading-whitespace-path");
    try {
      const whitespacePath = " leading-space.txt";
      writeFileSync(join(fixture.worktree, whitespacePath), "leading whitespace is a literal filename character\n");
      const result = runFixtureScript(fixture, dirtyTakeoverArgs(fixture, [whitespacePath]));

      assert(result.code === 0, result.stderr || result.stdout);
      const evidence = readFixtureDirtyTakeoverManifest(fixture).takeover_decisions.at(-1).dirty_in_lane_evidence;
      assert(evidence.before.paths[0].path === whitespacePath, JSON.stringify(evidence));
      assert(evidence.requested_paths[0] === whitespacePath, JSON.stringify(evidence));
    } finally {
      cleanupDirtyTakeoverFixture(fixture);
    }
  });

  test("takeover dirty-lane path rolls back manifest ownership when post-write fingerprints drift", () => {
    const fixture = createDirtyTakeoverFixture("post-write-drift");
    try {
      writeFileSync(join(fixture.worktree, "dirty.txt"), "original pre-write evidence\n");
      const source = readFileSync(fixture.script, "utf8");
      const seam = [
        "    writeManifest(path, manifest);",
        "    try {",
        "      finalizeDirtyInLaneTakeover(packet);",
      ].join("\n");
      assert(source.includes(seam), "fixture did not expose the dirty takeover post-write revalidation seam");
      const replacement = [
        "    writeManifest(path, manifest);",
        '    writeFileSync(join(packet.worktree_evidence.path, "dirty.txt"), "drift after manifest persistence\\n");',
        "    try {",
        "      finalizeDirtyInLaneTakeover(packet);",
      ].join("\n");
      writeFileSync(fixture.script, source.replace(seam, replacement));
      runGit(fixture.worktree, ["add", "scripts/codex-workspace.mjs"]);
      runGit(fixture.worktree, ["commit", "-q", "-m", "fixture post-write dirty drift seam"]);
      const before = readFileSync(fixture.manifestPath, "utf8");
      const result = runFixtureScript(fixture, dirtyTakeoverArgs(fixture, ["dirty.txt"]));

      assert(result.code !== 0, "post-write dirty drift unexpectedly succeeded");
      assert(result.stderr.includes("fingerprints changed while the manifest lock was held"), result.stderr || result.stdout);
      const restored = JSON.parse(readFileSync(fixture.manifestPath, "utf8"));
      const original = JSON.parse(before);
      assert(restored.owner === original.owner, "post-write drift left ownership persisted");
      assert(!Array.isArray(restored.takeover_decisions), "post-write drift retained a takeover decision");
      assert(!Array.isArray(restored.ownership_takeovers), "post-write drift retained ownership takeover evidence");
    } finally {
      cleanupDirtyTakeoverFixture(fixture);
    }
  });

  test("takeover dirty-lane path rechecks a retained lock after preflight", () => {
    const fixture = createDirtyTakeoverFixture("retained-lock-recheck");
    try {
      writeFileSync(join(fixture.worktree, "dirty.txt"), "dirty work guarded by lock recheck\n");
      const source = readFileSync(fixture.script, "utf8");
      const seam = "  const applied = applyTakeover(state, target, {";
      assert(source.includes(seam), "fixture did not expose the dirty takeover lock recheck seam");
      const replacement = [
        '  writeFileSync(taskLockPath(state, target.record.task_id), "{}\\n");',
        seam,
      ].join("\n");
      writeFileSync(fixture.script, source.replace(seam, replacement));
      runGit(fixture.worktree, ["add", "scripts/codex-workspace.mjs"]);
      runGit(fixture.worktree, ["commit", "-q", "-m", "fixture retained lock recheck seam"]);
      const before = readFileSync(fixture.manifestPath, "utf8");
      const result = runFixtureScript(fixture, dirtyTakeoverArgs(fixture, ["dirty.txt"]));

      assert(result.code !== 0, "post-preflight retained lock unexpectedly succeeded");
      assert(result.stderr.includes("Task lock is retained during dirty in-lane takeover"), result.stderr || result.stdout);
      assert(readFileSync(fixture.manifestPath, "utf8") === before, "retained-lock recheck mutated the manifest");
    } finally {
      cleanupDirtyTakeoverFixture(fixture);
    }
  });

  test("takeover dirty-lane path requires live GitHub no-PR proof without mutation", () => {
    const fixture = createDirtyTakeoverFixture("live-pr-proof", {
      prListJson: JSON.stringify([{ number: 81, state: "OPEN", headRefName: "codex/stale-live-pr-proof" }]),
    });
    try {
      writeFileSync(join(fixture.worktree, "dirty.txt"), "live PR proof must block takeover\n");
      const before = readFileSync(fixture.manifestPath, "utf8");
      const result = runFixtureScript(fixture, dirtyTakeoverArgs(fixture, ["dirty.txt"]));

      assert(result.code !== 0, "dirty takeover unexpectedly accepted live PR evidence");
      assert(result.stdout.includes("live GitHub no-PR proof found PR evidence"), result.stderr || result.stdout);
      assert(readFileSync(fixture.manifestPath, "utf8") === before, "live PR rejection mutated the manifest");
    } finally {
      cleanupDirtyTakeoverFixture(fixture);
    }
  });

  test("takeover dirty-lane path requires primary worktree registration", () => {
    const fixture = createDirtyTakeoverFixture("registered-worktree");
    try {
      writeFileSync(join(fixture.worktree, "dirty.txt"), "registered worktree proof required\n");
      const source = readFileSync(fixture.script, "utf8");
      const seam = "  const registration = takeoverRegisteredWorktreeEvidence(worktreePath);";
      assert(source.includes(seam), "fixture did not expose the registered-worktree proof seam");
      writeFileSync(fixture.script, source.replace(seam, '  const registration = { status: "mismatch", reason: "fixture primary registration mismatch" };'));
      runGit(fixture.worktree, ["add", "scripts/codex-workspace.mjs"]);
      runGit(fixture.worktree, ["commit", "-q", "-m", "fixture registration mismatch seam"]);
      const before = readFileSync(fixture.manifestPath, "utf8");
      const result = runFixtureScript(fixture, dirtyTakeoverArgs(fixture, ["dirty.txt"]));

      assert(result.code !== 0, "dirty takeover unexpectedly accepted an unregistered worktree");
      assert(result.stdout.includes("fixture primary registration mismatch"), result.stderr || result.stdout);
      assert(readFileSync(fixture.manifestPath, "utf8") === before, "registration mismatch mutated the manifest");
    } finally {
      cleanupDirtyTakeoverFixture(fixture);
    }
  });

  test("takeover dirty-lane path detects hidden assume-unchanged edits", () => {
    const fixture = createDirtyTakeoverFixture("hidden-index-edit");
    try {
      runGit(fixture.worktree, ["update-index", "--assume-unchanged", "tracked.txt"]);
      writeFileSync(join(fixture.worktree, "tracked.txt"), "hidden tracked mutation\n");
      const before = readFileSync(fixture.manifestPath, "utf8");
      const result = runFixtureScript(fixture, dirtyTakeoverArgs(fixture, ["tracked.txt"]));

      assert(result.code !== 0, "dirty takeover unexpectedly accepted a hidden index edit");
      assert(result.stdout.includes("hidden assume-unchanged or skip-worktree edit differs from the index"), result.stderr || result.stdout);
      assert(readFileSync(fixture.manifestPath, "utf8") === before, "hidden index edit mutated the manifest");
    } finally {
      cleanupDirtyTakeoverFixture(fixture);
    }
  });

  test("takeover dirty-lane path detects hidden skip-worktree edits", () => {
    const fixture = createDirtyTakeoverFixture("hidden-skip-worktree-edit");
    try {
      runGit(fixture.worktree, ["update-index", "--skip-worktree", "tracked.txt"]);
      writeFileSync(join(fixture.worktree, "tracked.txt"), "hidden skip-worktree mutation\n");
      const before = readFileSync(fixture.manifestPath, "utf8");
      const result = runFixtureScript(fixture, dirtyTakeoverArgs(fixture, ["tracked.txt"]));

      assert(result.code !== 0, "dirty takeover unexpectedly accepted a hidden skip-worktree edit");
      assert(result.stdout.includes("hidden assume-unchanged or skip-worktree edit differs from the index"), result.stderr || result.stdout);
      assert(readFileSync(fixture.manifestPath, "utf8") === before, "hidden skip-worktree edit mutated the manifest");
    } finally {
      cleanupDirtyTakeoverFixture(fixture);
    }
  });

  test("takeover dirty-lane path fingerprints executable and large untracked files without mode loss", () => {
    const fixture = createDirtyTakeoverFixture("streamed-executable");
    try {
      const executablePath = join(fixture.worktree, "large-tool.bin");
      writeFileSync(executablePath, Buffer.alloc(2 * 1024 * 1024, 0x61));
      chmodSync(executablePath, 0o755);
      const result = runFixtureScript(fixture, dirtyTakeoverArgs(fixture, ["large-tool.bin"]));

      assert(result.code === 0, result.stderr || result.stdout);
      const evidence = readFixtureDirtyTakeoverManifest(fixture).takeover_decisions.at(-1).dirty_in_lane_evidence;
      assert(evidence.before.paths[0].mode === 0o755, JSON.stringify(evidence));
      assert(evidence.after.paths[0].mode === 0o755, JSON.stringify(evidence));
      assert(!readFileSync(fixture.script, "utf8").includes("readFileSync(canonicalPath)"), "dirty file fingerprint must not use whole-file reads");
    } finally {
      cleanupDirtyTakeoverFixture(fixture);
    }
  });

  test("takeover dirty-lane path fails closed when the index lookup fails", () => {
    const fixture = createDirtyTakeoverFixture("index-query-failure");
    try {
      writeFileSync(join(fixture.worktree, "dirty.txt"), "index query must be proven\n");
      const source = readFileSync(fixture.script, "utf8");
      const seam = '      const index = git(["ls-files", "--stage", "--", entry.path], { cwd: canonicalWorktree });';
      assert(source.includes(seam), "fixture did not expose the index lookup seam");
      writeFileSync(fixture.script, source.replace(seam, '      const index = { code: 1, stdout: "", stderr: "fixture index unavailable" };'));
      runGit(fixture.worktree, ["add", "scripts/codex-workspace.mjs"]);
      runGit(fixture.worktree, ["commit", "-q", "-m", "fixture index lookup failure seam"]);
      const before = readFileSync(fixture.manifestPath, "utf8");
      const result = runFixtureScript(fixture, dirtyTakeoverArgs(fixture, ["dirty.txt"]));

      assert(result.code !== 0, "dirty takeover unexpectedly accepted an unavailable index lookup");
      assert(result.stdout.includes("could not inspect index state for dirty path"), result.stderr || result.stdout);
      assert(readFileSync(fixture.manifestPath, "utf8") === before, "index lookup failure mutated the manifest");
    } finally {
      cleanupDirtyTakeoverFixture(fixture);
    }
  });

  test("takeover dirty-lane path restores ownership when branch HEAD changes after the write", () => {
    const fixture = createDirtyTakeoverFixture("post-write-head-drift");
    try {
      writeFileSync(join(fixture.worktree, "dirty.txt"), "branch identity must remain stable\n");
      const source = readFileSync(fixture.script, "utf8");
      const seam = ["    writeManifest(path, manifest);", "    try {", "      finalizeDirtyInLaneTakeover(packet);"].join("\n");
      assert(source.includes(seam), "fixture did not expose the final branch identity seam");
      const replacement = [
        "    writeManifest(path, manifest);",
        '    git(["commit", "--allow-empty", "-m", "fixture post-write head drift"], { cwd: packet.worktree_evidence.path });',
        "    try {",
        "      finalizeDirtyInLaneTakeover(packet);",
      ].join("\n");
      writeFileSync(fixture.script, source.replace(seam, replacement));
      runGit(fixture.worktree, ["add", "scripts/codex-workspace.mjs"]);
      runGit(fixture.worktree, ["commit", "-q", "-m", "fixture final head drift seam"]);
      const before = readFileSync(fixture.manifestPath, "utf8");
      const result = runFixtureScript(fixture, dirtyTakeoverArgs(fixture, ["dirty.txt"]));

      assert(result.code !== 0, "dirty takeover unexpectedly accepted post-write HEAD drift");
      assert(result.stderr.includes("branch or HEAD changed while the manifest lock was held"), result.stderr || result.stdout);
      assert(JSON.parse(readFileSync(fixture.manifestPath, "utf8")).owner === JSON.parse(before).owner, "HEAD drift left ownership persisted");
    } finally {
      cleanupDirtyTakeoverFixture(fixture);
    }
  });

  test("takeover dirty-lane path persists the final post-write fingerprint snapshot", () => {
    const fixture = createDirtyTakeoverFixture("persist-final-snapshot");
    try {
      writeFileSync(join(fixture.worktree, "dirty.txt"), "final snapshot must be written\n");
      const source = readFileSync(fixture.script, "utf8");
      const header = "function dirtyInLanePathSnapshot(worktreePath, requestedPaths) {";
      const capture = "    captured_at: new Date().toISOString(),";
      const snapshotStart = source.indexOf(header);
      const captureStart = source.indexOf(capture, snapshotStart);
      assert(snapshotStart >= 0 && captureStart >= 0, "fixture did not expose the dirty snapshot sequence seam");
      const sequenced = [
        source.slice(0, snapshotStart),
        "var fixtureDirtySnapshotCount;\n\n",
        source.slice(snapshotStart, captureStart + capture.length),
        "\n    fixture_capture_sequence: fixtureDirtySnapshotCount = (fixtureDirtySnapshotCount || 0) + 1,",
        source.slice(captureStart + capture.length),
      ].join("");
      writeFileSync(fixture.script, sequenced);
      runGit(fixture.worktree, ["add", "scripts/codex-workspace.mjs"]);
      runGit(fixture.worktree, ["commit", "-q", "-m", "fixture final snapshot persistence seam"]);
      const result = runFixtureScript(fixture, dirtyTakeoverArgs(fixture, ["dirty.txt"]));

      assert(result.code === 0, JSON.stringify(result));
      const evidence = readFixtureDirtyTakeoverManifest(fixture).takeover_decisions.at(-1).dirty_in_lane_evidence;
      assert(evidence.after.fixture_capture_sequence === 4, JSON.stringify(evidence));
    } finally {
      cleanupDirtyTakeoverFixture(fixture);
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
        "setup-churn-handoff-hardening",
        ...bmadPipelineBacklogSlugs(),
        "queue-zero-runway-continuity-refresh",
        "queue-zero-runway-followup-refresh",
        "queue-zero-runway-replenishment-refresh",
        "queue-zero-runway-reserve-refresh",
        "queue-zero-runway-standby-refresh",
        "queue-zero-runway-buffer-refresh",
        "queue-zero-runway-overflow-refresh",
        "queue-zero-runway-spillover-refresh",
        "queue-zero-runway-carryover-refresh",
        "queue-zero-runway-relay-refresh",
        "queue-zero-runway-successor-refresh",
        "verification-surface-hardening-followup",
        "verification-surface-hardening",
        "github-delivery-hygiene",
        "read-only-evidence-polish-followup",
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

  test("finish-pr workspace-fast verification plans the workspace wrapper without raw or recursive profiles", () => {
    const fixture = createFinishPrExistingCommitFixture();
    try {
      const result = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--verify", "workspace-fast", "--dry-run", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("pnpm run check:workspace-fast"), result.stdout);
      assert(!result.stdout.includes("node ./scripts/test-codex-workspace.mjs"), result.stdout);
      assert(!result.stdout.includes("pnpm run check:fast"), result.stdout);
      assert(result.stdout.includes("anti-churn hook evaluate --apply-safe --format json"), result.stdout);
      assert(result.stdout.includes("git push -u origin"), result.stdout);
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("managed admission, worker CWD, pre-write guard, and finish-pr eligibility share one lane while recovery stops before GitHub", () => {
    const fixture = createFinishPrExistingCommitFixture();
    const ghProbe = join(fixture.root, "gh-called.txt");
    try {
      const head = runGit(fixture.root, ["rev-parse", "HEAD"]).stdout;
      const resume = runFixtureScript(
        fixture,
        ["resume", "resumed-task", "--json", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.root, env: fixture.env },
      );
      assert(resume.code === 0, resume.stderr || resume.stdout);
      const resumePacket = JSON.parse(resume.stdout);
      const admission = evaluateMutationAdmission({
        requestedActivity: "source_change",
        authorizedScope: true,
        baseCheckout: {
          isBaseCheckout: true,
          dirty: false,
          branch: "main",
          head,
          changedPathCount: 0,
        },
        expectedRequestIdentity: { taskId: "resumed-task", owner: "runner-a" },
        managedLane: resumePacket,
      });
      assert(admission.outcome === "resume_managed_lane", JSON.stringify(admission));

      const handoff = handoffAdmittedManagedLane(admission, {
        runner(_command, args) {
          const result = spawnSync(process.execPath, [fixture.script, ...args.slice(1)], {
            cwd: fixture.root,
            encoding: "utf8",
            env: fixture.env,
            stdio: "pipe",
          });
          return { code: result.status ?? 1, stdout: result.stdout || "", stderr: result.stderr || result.error?.message || "" };
        },
      });
      assert(handoff.status === "ready", JSON.stringify(handoff));
      assert(handoff.workerHandoff.cwd === fixture.worktree, JSON.stringify(handoff));

      const guard = approveManagedSourceWrite({
        operation: "source_write",
        actualCwd: handoff.workerHandoff.cwd,
        trustedLane: handoff.preWriteGuardEvidence,
      });
      assert(guard.status === "allowed", JSON.stringify(guard));

      const eligible = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--no-verify", "--dry-run", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );
      assert(eligible.code === 0, eligible.stderr || eligible.stdout);
      assert(eligible.stdout.includes("finish-pr"), eligible.stdout || eligible.stderr);
      assert(eligible.stdout.includes(`git push -u origin ${fixture.branch}`), eligible.stdout || eligible.stderr);

      const recoveryDir = join(fixture.stateRoot, "recovery");
      mkdirSync(recoveryDir, { recursive: true });
      writeFileSync(
        join(recoveryDir, "base-checkout.json"),
        `${JSON.stringify({
          schema_version: 1,
          status: "active",
          reasonCode: "recovery.break_glass_edit",
          recordedAt: "2026-07-25T00:00:00.000Z",
          checkout: { identity: "primary_worktree", path: fixture.root },
          mutation: "metadata-only recovery marker",
        }, null, 2)}\n`,
      );
      writeFileSync(
        join(fixture.fakeBin, "gh"),
        [
          "#!/usr/bin/env node",
          "import { writeFileSync } from 'node:fs';",
          `writeFileSync(${JSON.stringify(ghProbe)}, 'called\\n');`,
          "process.exit(1);",
          "",
        ].join("\n"),
      );
      chmodSync(join(fixture.fakeBin, "gh"), 0o755);

      const blocked = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--no-verify", "--dry-run", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );
      assert(blocked.code !== 0, "recovery unexpectedly allowed finish-pr planning");
      assert(blocked.stderr.includes("Base Checkout recovery prevents delivery"), blocked.stderr || blocked.stdout);
      assert(!existsSync(ghProbe), "finish-pr contacted GitHub after Base Checkout recovery was active");
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("cleanup refuses Base Checkout and unmanaged paths before a cleanup plan can target them", () => {
    const fixture = createMergedCleanupFixture();
    const manifestPath = join(fixture.stateRoot, "tasks", "cleanup-task.json");
    const unmanaged = join(fixture.root, "unmanaged-worktree");
    mkdirSync(unmanaged);
    try {
      for (const worktreePath of [fixture.root, unmanaged]) {
        const manifest = readJson(manifestPath);
        manifest.worktree_path = worktreePath;
        writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
        const before = readFileSync(manifestPath, "utf8");
        const result = runFixtureScript(
          fixture,
          ["cleanup-merged", "cleanup-task", "--summary-json", "--delete-remote", "--owner", "runner-a", "--state-root", fixture.stateRoot],
          { cwd: fixture.root, env: fixture.env },
        );
        assert(result.code !== 0, `cleanup unexpectedly planned unmanaged target ${worktreePath}`);
        assert(result.stderr.includes("Refusing to remove unmanaged worktree path"), result.stderr || result.stdout);
        assert(readFileSync(manifestPath, "utf8") === before, "rejected cleanup target mutated its manifest");
        assert(existsSync(fixture.root), "cleanup touched the Base Checkout");
        assert(branchExists(fixture.root, fixture.branch), "cleanup deleted the managed branch after rejecting its path");
      }
    } finally {
      cleanupMergedCleanupFixture(fixture);
    }
  });

  test("cleanup rejects managed-root symlinks to the Base Checkout or a foreign checkout before planning", () => {
    const fixture = createMergedCleanupFixture();
    const manifestPath = join(fixture.stateRoot, "tasks", "cleanup-task.json");
    const managedRoot = join(fixture.stateRoot, "worktrees");
    const foreignCheckout = mkdtempSync(join(tmpdir(), "codex-foreign-checkout-"));
    const aliases = [
      join(managedRoot, "base-alias"),
      join(managedRoot, "foreign-alias"),
    ];
    try {
      runGit(foreignCheckout, ["init", "-q"]);
      writeFileSync(join(foreignCheckout, "foreign.txt"), "foreign\n");
      symlinkSync(fixture.root, aliases[0], "dir");
      symlinkSync(foreignCheckout, aliases[1], "dir");
      for (const worktreePath of aliases) {
        const manifest = readJson(manifestPath);
        manifest.worktree_path = worktreePath;
        writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
        const before = readFileSync(manifestPath, "utf8");
        const result = runFixtureScript(
          fixture,
          ["cleanup-merged", "cleanup-task", "--summary-json", "--delete-remote", "--owner", "runner-a", "--state-root", fixture.stateRoot],
          { cwd: fixture.root, env: fixture.env },
        );
        assert(result.code !== 0, `cleanup unexpectedly planned symlink target ${worktreePath}`);
        assert(result.stderr.includes("Refusing to remove unmanaged worktree path"), result.stderr || result.stdout);
        assert(readFileSync(manifestPath, "utf8") === before, "rejected symlink target mutated its manifest");
        assert(existsSync(fixture.root), "cleanup touched the Base Checkout through a managed-root symlink");
        assert(existsSync(foreignCheckout), "cleanup touched the foreign checkout through a managed-root symlink");
        assert(branchExists(fixture.root, fixture.branch), "cleanup deleted the lane branch after rejecting a symlink target");
      }
    } finally {
      for (const alias of aliases) rmSync(alias, { force: true });
      rmSync(foreignCheckout, { recursive: true, force: true });
      cleanupMergedCleanupFixture(fixture);
    }
  });

  test("cleanup rejects a managed worktree root that is itself a symlink to the Base Checkout", () => {
    const fixture = createMergedCleanupFixture();
    const aliasStateRoot = join(fixture.root, "alias-state");
    const aliasTasks = join(aliasStateRoot, "tasks");
    const aliasWorktrees = join(aliasStateRoot, "worktrees");
    const targetDirectory = join(fixture.root, "not-a-managed-worktree");
    try {
      mkdirSync(aliasTasks, { recursive: true });
      mkdirSync(targetDirectory);
      symlinkSync(fixture.root, aliasWorktrees, "dir");
      const manifest = readJson(join(fixture.stateRoot, "tasks", "cleanup-task.json"));
      manifest.worktree_path = join(aliasWorktrees, "not-a-managed-worktree");
      writeFileSync(join(aliasTasks, "cleanup-task.json"), `${JSON.stringify(manifest, null, 2)}\n`);

      const result = runFixtureScript(
        fixture,
        ["cleanup-merged", "cleanup-task", "--summary-json", "--delete-remote", "--owner", "runner-a", "--state-root", aliasStateRoot],
        { cwd: fixture.root, env: fixture.env },
      );
      assert(result.code !== 0, "cleanup unexpectedly planned through a symlinked managed root");
      assert(result.stderr.includes("managed root must not be a symlink"), result.stderr || result.stdout);
      assert(existsSync(targetDirectory), "cleanup touched a Base Checkout directory through the symlinked managed root");
      assert(branchExists(fixture.root, fixture.branch), "cleanup deleted the lane branch through the symlinked managed root");
    } finally {
      rmSync(aliasStateRoot, { recursive: true, force: true });
      cleanupMergedCleanupFixture(fixture);
    }
  });

  test("cleanup-merged rejects a regular foreign Git checkout placed inside the managed worktree root", () => {
    const fixture = createMergedCleanupFixture();
    const manifestPath = join(fixture.stateRoot, "tasks", "cleanup-task.json");
    const foreignCheckout = join(fixture.stateRoot, "worktrees", "foreign-regular-checkout");
    const ghProbe = join(fixture.root, "foreign-cleanup-gh-called.txt");
    try {
      mkdirSync(foreignCheckout, { recursive: true });
      runGit(foreignCheckout, ["init", "-q"]);
      runGit(foreignCheckout, ["config", "user.email", "foreign@example.test"]);
      runGit(foreignCheckout, ["config", "user.name", "Foreign Checkout"]);
      writeFileSync(join(foreignCheckout, "foreign.txt"), "foreign\n");
      runGit(foreignCheckout, ["add", "foreign.txt"]);
      runGit(foreignCheckout, ["commit", "-q", "-m", "foreign"]);
      runGit(foreignCheckout, ["branch", "-M", fixture.branch]);
      const manifest = readJson(manifestPath);
      manifest.worktree_path = foreignCheckout;
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      writeFileSync(
        join(fixture.fakeBin, "gh"),
        [
          "#!/usr/bin/env node",
          "import { writeFileSync } from 'node:fs';",
          `writeFileSync(${JSON.stringify(ghProbe)}, 'called\\n');`,
          "process.exit(1);",
          "",
        ].join("\n"),
      );
      chmodSync(join(fixture.fakeBin, "gh"), 0o755);

      const result = runFixtureScript(
        fixture,
        ["cleanup-merged", "cleanup-task", "--summary-json", "--delete-remote", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.root, env: fixture.env },
      );
      assert(result.code !== 0, "cleanup unexpectedly planned an unregistered foreign checkout");
      assert(result.stderr.includes("registered managed worktree"), result.stderr || result.stdout);
      assert(!existsSync(ghProbe), "cleanup contacted GitHub before rejecting the unregistered target");
      assert(existsSync(foreignCheckout), "cleanup touched the foreign regular checkout");
      assert(branchExists(fixture.root, fixture.branch), "cleanup deleted the registered lane branch after rejecting foreign checkout");
    } finally {
      cleanupMergedCleanupFixture(fixture);
    }
  });

  test("finish-pr scoped verification selects manager delivery checks for manager-control-plane diffs", () => {
    const fixture = createFinishPrExistingCommitFixture({
      featurePath: "scripts/lib/manager-control-plane/feature.mjs",
      featureContent: "export const managerFeatureFixture = true;\n",
    });
    try {
      const managerPath = join(fixture.worktree, "scripts", "lib", "manager-control-plane", "delivery-planner.mjs");
      mkdirSync(join(fixture.worktree, "scripts", "lib", "manager-control-plane"), { recursive: true });
      writeFileSync(managerPath, "export const deliveryPlannerFixture = true;\n");
      runGit(fixture.worktree, ["add", "scripts/lib/manager-control-plane/delivery-planner.mjs"]);

      const result = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--verify", "scoped", "--dry-run", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("pnpm run check:manager-control-plane:delivery"), result.stdout);
      assert(!result.stdout.includes("pnpm run check\n"), result.stdout);
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("finish-pr scoped verification falls back to fast checks for mixed unknown diffs", () => {
    const fixture = createFinishPrExistingCommitFixture();
    try {
      writeFileSync(join(fixture.worktree, "unclassified.txt"), "unknown\n");
      runGit(fixture.worktree, ["add", "unclassified.txt"]);

      const result = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--verify", "scoped", "--dry-run", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("pnpm run check:fast"), result.stdout);
      assert(!result.stdout.includes("pnpm run check\n"), result.stdout);
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
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
      assert(manifest.pr_delivery_evidence?.operation === "create-pr", "manifest missing create-pr delivery evidence");
      assert(manifest.pr_delivery_evidence.headRevision, "manifest PR delivery evidence missing head revision");
      assert(manifest.pr_delivery_evidence.pullRequestUrl === "https://example.test/pull/456", "manifest PR delivery evidence missing PR URL");
      assert(manifest.pr_delivery_evidence.metadataOnly === true, "manifest PR delivery evidence must be metadata-only");
      assert(manifest.pr_delivery_evidence.verificationGate?.decision === "explicit-no-verify", "manifest PR delivery evidence missing no-verify decision");
      assert(
        manifest.pr_delivery_evidence.stopLines.includes("no merge or cleanup from finish-pr"),
        "manifest PR delivery evidence missing finish-pr stop line",
      );
      assert(manifest.pr_delivery_evidence.authorityDecision?.operation === "finish-pr", "PR delivery authority decision missing");
      assert(manifest.pr_delivery_evidence.authorityDecision?.authorityFamily === "delivery", "PR delivery authority family missing");
      assert(manifest.pr_delivery_evidence.authorityDecision?.rawPayloadRetained === false, "PR delivery authority retained raw payload");
      assert(
        manifest.pr_delivery_evidence.authorityDecision.satisfiedGates.includes(
          "configured verification command or explicitly recorded no-verify decision",
        ),
        "explicit no-verify gate was not truthfully satisfied",
      );
      assert(
        manifest.lane_evidence_packet?.pr_delivery?.pullRequestNumber === 456,
        "lane evidence packet missing PR delivery evidence",
      );
      assert(
        manifest.lane_evidence_packet?.authority_decisions?.some((entry) => entry.operation === "finish-pr"),
        "lane evidence packet missing finish-pr authority decision",
      );
      assert(
        manifest.events.some((event) => event.type === "commit_reconciled"),
        "manifest missing commit_reconciled event",
      );
      assert(
        manifest.events.some((event) => event.type === "pr_delivery_evidence_recorded"),
        "manifest missing pr_delivery_evidence_recorded event",
      );
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("finish-pr records existing PR updates as gated delivery evidence", () => {
    const fixture = createFinishPrExistingCommitFixture({ existingPr: true });
    try {
      const result = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--no-verify", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );

      assert(result.code === 0, result.stderr || result.stdout);
      const manifest = readJson(join(fixture.stateRoot, "tasks", "resumed-task.json"));
      assert(manifest.pr_url === "https://example.test/pull/456", `manifest pr_url is ${manifest.pr_url}`);
      assert(
        manifest.pr_delivery_evidence?.operation === "update-existing-pr-reference",
        `unexpected PR delivery operation ${manifest.pr_delivery_evidence?.operation}`,
      );
      assert(
        manifest.lane_evidence_packet?.pr_delivery?.operation === "update-existing-pr-reference",
        "lane evidence packet missing existing PR delivery operation",
      );
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("finish-pr bounded codex-workspace verification records success only after the fixed profile budget", () => {
    const fixture = createFinishPrExistingCommitFixture();
    try {
      installFixtureVerificationCommand(fixture, "success");
      const result = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--verify", "codex-workspace", "--timeout", "1", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );

      assert(result.code === 0, result.stderr || result.stdout);
      const manifest = readJson(join(fixture.stateRoot, "tasks", "resumed-task.json"));
      assert(manifest.last_verification_command === "fixture-verification ./scripts/test-codex-workspace.mjs", "finish-pr did not record the successful verification command");
      assert(Boolean(manifest.last_verified_at), "finish-pr did not record successful verification time");
      assert(manifest.status === "pr_open", `unexpected manifest status ${manifest.status}`);
      const source = readFileSync(scriptPath, "utf8");
      assert(source.includes("const codexWorkspaceVerificationTimeoutMs = 600_000;"), "codex-workspace profile must retain its reviewed fixed 600s budget");
      assert(source.includes("return profile === \"codex-workspace\" ? codexWorkspaceVerificationTimeoutMs : defaultVerificationTimeoutMs;"), "profile timeout selection must remain fixed in source");
      const boundedRunner = source.match(/function runBoundedVerification[\s\S]*?function verificationOutcome/);
      assert(boundedRunner, "bounded verification runner missing");
      assert(!boundedRunner[0].includes("options.timeout"), "finish-pr verification must not expose a user-controlled timeout override");
      assert(boundedRunner[0].includes('killSignal: "SIGKILL"'), "bounded verification must force-kill only its timed-out direct child");
      assert(source.includes('if (!Number.isInteger(result.status)) return "ambiguous-result";'), "bounded verification must fail closed on an ambiguous child result");
      assert(!source.includes("CODEX_WORKSPACE_FIXTURE_AMBIGUOUS_RESULT"), "production source must not contain the fixture-only ambiguous-result seam");
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("finish-pr bounded verification failures preserve the manifest, avoid delivery mutation, and release the task lock", () => {
    for (const scenario of [
      { mode: "timeout", expected: "Verification timeout", budgetMs: 25 },
      { mode: "nonzero", expected: "Verification nonzero-exit" },
      { mode: "secret-nonzero", expected: "Verification nonzero-exit", secret: "fixture-secret-token-123" },
      { mode: "signal", expected: "Verification signal" },
      { mode: "launch-error", expected: "Verification launch-error" },
      { mode: "ambiguous-result", expected: "Verification ambiguous-result" },
    ]) {
      const fixture = createFinishPrExistingCommitFixture();
      try {
        if (scenario.budgetMs) setFixtureCodexWorkspaceVerificationTimeout(fixture, scenario.budgetMs);
        installFixtureVerificationCommand(fixture, scenario.mode);
        installFixtureDeliveryProbes(fixture);
        if (scenario.mode === "ambiguous-result") {
          fixture.env = { ...fixture.env, CODEX_WORKSPACE_FIXTURE_AMBIGUOUS_RESULT: "1" };
        }
        const manifestPath = join(fixture.stateRoot, "tasks", "resumed-task.json");
        const lockPath = join(fixture.stateRoot, "tasks", "resumed-task.lock");
        const before = readFileSync(manifestPath, "utf8");

        const result = runFixtureScript(
          fixture,
          ["finish-pr", "resumed-task", "--verify", "codex-workspace", "--owner", "runner-a", "--state-root", fixture.stateRoot],
          { cwd: fixture.worktree, env: fixture.env },
        );

        assert(result.code !== 0, `${scenario.mode} verification unexpectedly passed`);
        assert(result.stderr.includes(scenario.expected), result.stderr || result.stdout);
        assert(result.stderr.includes("child_output=omitted"), result.stderr || result.stdout);
        if (scenario.secret) assert(!result.stderr.includes(scenario.secret), "verification diagnostic retained child secret output");
        assert(result.stderr.includes("No verification or PR delivery evidence was recorded"), result.stderr || result.stdout);
        assert(readFileSync(manifestPath, "utf8") === before, `${scenario.mode} verification changed the manifest`);
        assert(!existsSync(lockPath), `${scenario.mode} verification retained the task lock`);
        assert(!existsSync(join(fixture.root, "git-push-called.txt")), `${scenario.mode} verification reached git push`);
        assert(!existsSync(join(fixture.root, "gh-pr-create-called.txt")), `${scenario.mode} verification reached gh pr create`);
      } finally {
        cleanupFinishPrExistingCommitFixture(fixture);
      }
    }
  });

  test("finish-pr check profile uses its fixed fifteen-minute budget and persists redacted failure diagnostics", () => {
    const fixture = createFinishPrExistingCommitFixture();
    try {
      installFixtureVerificationProfileCommand(fixture, "check", "secret-nonzero");
      installFixtureDeliveryProbes(fixture);
      const result = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );

      assert(result.code !== 0, "check verification unexpectedly passed");
      assert(result.stderr.includes("profile=check"), result.stderr || result.stdout);
      assert(result.stderr.includes("timeout_ms=900000"), result.stderr || result.stdout);
      assert(result.stderr.includes("diagnostic=recorded"), result.stderr || result.stdout);
      assert(!result.stderr.includes("fixture-secret-token-123"), "check diagnostic leaked child output");
      assert(!existsSync(join(fixture.root, "git-push-called.txt")), "check failure reached git push");
      const diagnosticsDir = join(fixture.stateRoot, "tasks", ".diagnostics");
      const diagnosticNames = readdirSync(diagnosticsDir).filter((name) => name.endsWith(".json"));
      assert(diagnosticNames.length === 1, "check failure did not persist exactly one bounded diagnostic");
      const diagnostic = readJson(join(diagnosticsDir, diagnosticNames[0]));
      assert(diagnostic.profile === "check", JSON.stringify(diagnostic));
      assert(diagnostic.timeout_ms === 900_000, JSON.stringify(diagnostic));
      assert(diagnostic.child.output === "omitted", JSON.stringify(diagnostic));
      assert(diagnostic.check_projection?.stage === null, JSON.stringify(diagnostic));
      assert(diagnostic.check_projection?.raw_output === "omitted", JSON.stringify(diagnostic));
      assert(!JSON.stringify(diagnostic).includes("fixture-secret-token-123"), "persisted diagnostic leaked child output");
      const source = readFileSync(scriptPath, "utf8");
      assert(source.includes("const checkVerificationTimeoutMs = 900_000;"), "check profile must retain its reviewed fixed 900s budget");
      assert(source.includes('if (profile === "check") return checkVerificationTimeoutMs;'), "check profile timeout selection must be explicit and fixed");
      assert(source.includes('["check:ci-fast", "check:workspace-fast", "check:sandbox-fast", "check:dashboard-fast"]'), "resumable check plan must split check:fast into bounded allowlisted suites");
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("finish-pr resumable check packet pauses at its budget and resumes remaining stages without rerun", () => {
    const fixture = createFinishPrExistingCommitFixture();
    try {
      const stages = ["check:packet-one", "check:packet-two"];
      const stageLog = installFixtureResumableCheckPlan(fixture, stages);
      installFixtureResumableCheckPauseAfterStageSeam(fixture);
      const first = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );
      assert(first.code !== 0, "budget-limited check unexpectedly completed");
      assert(first.stderr.includes("packet paused"), first.stderr || first.stdout);
      const afterPause = readJson(join(fixture.stateRoot, "tasks", "resumed-task.json"));
      assert(afterPause.check_verification_packet?.status === "partial", JSON.stringify(afterPause.check_verification_packet));
      assert(afterPause.check_verification_packet?.next_stage === "check:packet-two", JSON.stringify(afterPause.check_verification_packet));
      assert(readFixtureStageLog(stageLog).join(",") === "check:packet-one", "paused packet ran an unexpected stage");

      const second = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );
      assert(second.code === 0, second.stderr || second.stdout);
      assert(readFixtureStageLog(stageLog).join(",") === "check:packet-one,check:packet-two", "resume reran an already-proven stage");
      const completed = readJson(join(fixture.stateRoot, "tasks", "resumed-task.json"));
      assert(completed.check_verification_packet?.status === "passed", JSON.stringify(completed.check_verification_packet));
      assert(completed.pr_delivery_evidence, "completed packet did not enter the existing delivery path");
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("finish-pr expands check:fast into its bounded suites before packet execution", () => {
    const fixture = createFinishPrExistingCommitFixture();
    try {
      const suites = [
        "check:ci-fast",
        "test:codex-workspace-state",
        "test:workspace-command-resolution",
        "test:base-checkout-recovery",
        "test:mutation-admission",
        "test:mutation-admission-workspace-handoff",
        "test:mutation-admission-prewrite-guard",
        "test:codex-workspace",
        "check:sandbox-fast",
        "check:dashboard-fast",
      ];
      const stageLog = installFixtureResumableCheckPlan(fixture, suites, {}, ["check:fast"], ["check:fast"]);
      const result = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );

      assert(result.code === 0, result.stderr || result.stdout);
      assert(readFixtureStageLog(stageLog).join(",") === suites.join(","), "check:fast was not expanded into the bounded suite order");
      const manifest = readJson(join(fixture.stateRoot, "tasks", "resumed-task.json"));
      assert(manifest.check_verification_packet?.status === "passed", JSON.stringify(manifest.check_verification_packet));
      assert(manifest.check_verification_packet?.stages?.map((stage) => stage.stage).join(",") === suites.join(","), JSON.stringify(manifest.check_verification_packet));
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("finish-pr expands supervisor aggregate into exact fixed check-profile leaves without changing direct scripts", () => {
    const fixture = createFinishPrExistingCommitFixture();
    const supervisorLeaves = supervisorCheckLeaves;
    try {
      const stageLog = installFixtureResumableCheckPlan(fixture, supervisorLeaves, {}, ["test:supervisor"], ["test:supervisor"]);
      const result = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );

      assert(result.code === 0, result.stderr || result.stdout);
      assert(readFixtureStageLog(stageLog).join(",") === supervisorLeaves.join(","), "supervisor aggregate was not expanded into its fixed leaf order");
      const manifest = readJson(join(fixture.stateRoot, "tasks", "resumed-task.json"));
      assert(manifest.check_verification_packet?.stages?.map((stage) => stage.stage).join(",") === supervisorLeaves.join(","), JSON.stringify(manifest.check_verification_packet));
      const packageScripts = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8")).scripts;
      assert(packageScripts["test:supervisor"] === "node ./scripts/run-supervisor-tests.mjs", packageScripts["test:supervisor"]);
      assert(packageScripts["test:supervisor:review-route"] === "node ./scripts/run-supervisor-tests.mjs tests/integration/test_review_route_packet.py -q", packageScripts["test:supervisor:review-route"]);
      for (const stage of supervisorLeaves) {
        assert(packageScripts[stage]?.includes("--timeout-ms=150000"), `supervisor leaf lacks the fixed 150s child timeout: ${stage}`);
      }
      const routingSource = readFileSync(join(rootDir, "services", "supervisor", "tests", "integration", "test_routing_preview.py"), "utf8");
      const routingSourceNames = [...routingSource.matchAll(/^def (test_[A-Za-z0-9_]+)\(/gm)].map((match) => match[1]);
      assert(routingSourceNames.length === 172, `routing source test count drifted: ${routingSourceNames.length}`);
      const routingLeafNodeIds = routingPreviewCheckLeafStages.map((stage) => {
        const script = packageScripts[stage] || "";
        assert(script.startsWith("node ./scripts/run-supervisor-tests.mjs --no-preflight --timeout-ms=150000 -q "), `routing leaf command is not fixed: ${stage}`);
        return [...script.matchAll(/test_routing_preview\.py::(test_[A-Za-z0-9_]+)/g)].map((match) => match[1]);
      });
      assert(routingLeafNodeIds.map((nodeIds) => nodeIds.length).join(",") === "22,22,22,22,21,21,21,21", JSON.stringify(routingLeafNodeIds.map((nodeIds) => nodeIds.length)));
      const flattenedRoutingNodeIds = routingLeafNodeIds.flat();
      assert(new Set(flattenedRoutingNodeIds).size === flattenedRoutingNodeIds.length, "routing leaf node IDs contain duplicates");
      assert(flattenedRoutingNodeIds.join(",") === routingSourceNames.join(","), "routing leaf node IDs do not exactly match source order");
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("finish-pr pauses before an under-reserved supervisor leaf and resumes only that fixed leaf", () => {
    const fixture = createFinishPrExistingCommitFixture();
    const supervisorLeaves = supervisorCheckLeaves;
    const stages = ["check:packet-one", ...supervisorLeaves];
    try {
      const stageLog = installFixtureResumableCheckPlan(fixture, stages, {}, ["check:packet-one", "test:supervisor"], ["check:packet-one", "test:supervisor"]);
      installFixtureResumableCheckSupervisorReserveSeam(fixture);
      const first = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );
      assert(first.code !== 0, "under-reserved supervisor packet unexpectedly completed");
      assert(first.stderr.includes(`packet paused before ${supervisorLeaves[0]}`), first.stderr || first.stdout);
      assert(readFixtureStageLog(stageLog).join(",") === "check:packet-one", "under-reserved supervisor leaf was launched");
      const paused = readJson(join(fixture.stateRoot, "tasks", "resumed-task.json"));
      assert(paused.check_verification_packet?.next_stage === supervisorLeaves[0], JSON.stringify(paused.check_verification_packet));

      const second = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: { ...fixture.env, CODEX_WORKSPACE_FIXTURE_SUPERVISOR_RESERVE: "0" } },
      );
      assert(second.code === 0, second.stderr || second.stdout);
      assert(readFixtureStageLog(stageLog).join(",") === stages.join(","), "resumed supervisor packet reran a completed stage or skipped a fixed leaf");
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("finish-pr rejects a stale aggregate supervisor packet before launching check-profile leaves", () => {
    const fixture = createFinishPrExistingCommitFixture();
    const supervisorLeaves = supervisorCheckLeaves;
    try {
      const stageLog = installFixtureResumableCheckPlan(fixture, supervisorLeaves, {}, ["test:supervisor"], ["test:supervisor"]);
      const manifestPath = join(fixture.stateRoot, "tasks", "resumed-task.json");
      const manifest = readJson(manifestPath);
      manifest.check_verification_packet = fixtureResumableCheckPacket(fixture, ["test:supervisor"]);
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      const result = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );
      assert(result.code !== 0, "stale aggregate supervisor packet unexpectedly resumed");
      assert(result.stderr.includes("binding changed"), result.stderr || result.stdout);
      assert(readFixtureStageLog(stageLog).length === 0, "stale aggregate supervisor packet launched a leaf");
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("finish-pr normalizes aggregate trailing workspace duplicates without rerunning a leaf", () => {
    const fixture = createFinishPrExistingCommitFixture();
    try {
      const stages = [
        "check:ci-fast",
        "test:codex-workspace-state",
        "test:workspace-command-resolution",
        "test:base-checkout-recovery",
        "test:mutation-admission",
        "test:mutation-admission-workspace-handoff",
        "test:mutation-admission-prewrite-guard",
        "test:codex-workspace",
        "check:sandbox-fast",
        "check:dashboard-fast",
      ];
      const stageLog = installFixtureResumableCheckPlan(
        fixture,
        stages,
        {},
        ["check:fast", "test:codex-workspace", "test:codex-workspace-state", "test:workspace-command-resolution"],
        ["check:fast", "test:codex-workspace", "test:codex-workspace-state", "test:workspace-command-resolution"],
      );
      const result = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );

      assert(result.code === 0, result.stderr || result.stdout);
      assert(readFixtureStageLog(stageLog).join(",") === stages.join(","), "aggregate check reran a workspace leaf after nested expansion");
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("finish-pr resumes a nested workspace expansion without rerunning the committed leaf", () => {
    const fixture = createFinishPrExistingCommitFixture();
    try {
      const stages = [
        "test:codex-workspace-state",
        "test:workspace-command-resolution",
        "test:base-checkout-recovery",
        "test:mutation-admission",
        "test:mutation-admission-workspace-handoff",
        "test:mutation-admission-prewrite-guard",
        "test:codex-workspace",
      ];
      const stageLog = installFixtureResumableCheckPlan(fixture, stages, {}, ["check:workspace-fast"], ["check:workspace-fast"]);
      installFixtureResumableCheckInterruptAfterStageWrite(fixture);
      const first = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );
      assert(first.code !== 0, "nested workspace interruption unexpectedly completed");
      assert(readFixtureStageLog(stageLog).join(",") === stages[0], "nested workspace interruption did not commit exactly its first leaf");

      const second = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: { ...fixture.env, CODEX_WORKSPACE_FIXTURE_PACKET_INTERRUPT_AFTER_STAGE_WRITE: "0" } },
      );
      assert(second.code === 0, second.stderr || second.stdout);
      assert(readFixtureStageLog(stageLog).join(",") === stages.join(","), "nested workspace resume reran a committed leaf");
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("finish-pr fails closed when check:fast expansion overlaps an explicit suite", () => {
    const fixture = createFinishPrExistingCommitFixture();
    try {
      const suites = [
        "check:ci-fast",
        "test:codex-workspace-state",
        "test:workspace-command-resolution",
        "test:base-checkout-recovery",
        "test:mutation-admission",
        "test:mutation-admission-workspace-handoff",
        "test:mutation-admission-prewrite-guard",
        "test:codex-workspace",
        "check:sandbox-fast",
        "check:dashboard-fast",
      ];
      const stageLog = installFixtureResumableCheckPlan(fixture, suites, {}, ["check:fast", "check:ci-fast"], ["check:fast", "check:ci-fast"]);
      installFixtureDeliveryProbes(fixture);
      const result = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );

      assert(result.code !== 0, "ambiguous check plan unexpectedly ran");
      assert(result.stderr.includes("contains duplicate stages"), result.stderr || result.stdout);
      assert(readFixtureStageLog(stageLog).length === 0, "ambiguous check plan ran a stage");
      assert(!existsSync(join(fixture.root, "git-push-called.txt")), "ambiguous check plan reached git push");
      assert(!existsSync(join(fixture.root, "gh-pr-create-called.txt")), "ambiguous check plan reached PR creation");
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("finish-pr fails closed before execution for an undeclared check stage", () => {
    const fixture = createFinishPrExistingCommitFixture();
    try {
      const suites = ["check:ci-fast", "check:workspace-fast", "check:sandbox-fast", "check:dashboard-fast"];
      const stageLog = installFixtureResumableCheckPlan(fixture, suites, {}, ["check:undeclared"], []);
      installFixtureDeliveryProbes(fixture);
      const result = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );

      assert(result.code !== 0, "undeclared check stage unexpectedly ran");
      assert(result.stderr.includes("not allowlisted"), result.stderr || result.stdout);
      assert(readFixtureStageLog(stageLog).length === 0, "undeclared check stage ran a stage");
      assert(!existsSync(join(fixture.root, "git-push-called.txt")), "undeclared check stage reached git push");
      assert(!existsSync(join(fixture.root, "gh-pr-create-called.txt")), "undeclared check stage reached PR creation");
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("finish-pr fails closed before expansion for an undeclared aggregate source stage", () => {
    const fixture = createFinishPrExistingCommitFixture();
    try {
      const stages = [
        "check:ci-fast",
        "test:codex-workspace-state",
        "test:workspace-command-resolution",
        "test:base-checkout-recovery",
        "test:mutation-admission",
        "test:mutation-admission-workspace-handoff",
        "test:mutation-admission-prewrite-guard",
        "test:codex-workspace",
        "check:sandbox-fast",
        "check:dashboard-fast",
      ];
      const stageLog = installFixtureResumableCheckPlan(fixture, stages, {}, ["check:fast"], []);
      installFixtureDeliveryProbes(fixture);
      const result = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );

      assert(result.code !== 0, "undeclared aggregate source unexpectedly ran");
      assert(result.stderr.includes("not allowlisted"), result.stderr || result.stdout);
      assert(readFixtureStageLog(stageLog).length === 0, "undeclared aggregate source ran a leaf");
      assert(!existsSync(join(fixture.root, "git-push-called.txt")), "undeclared aggregate source reached git push");
      assert(!existsSync(join(fixture.root, "gh-pr-create-called.txt")), "undeclared aggregate source reached PR creation");
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("finish-pr resumable check packet resumes after interruption immediately following a committed stage", () => {
    const fixture = createFinishPrExistingCommitFixture();
    try {
      const stages = ["check:packet-one", "check:packet-two"];
      const stageLog = installFixtureResumableCheckPlan(fixture, stages);
      installFixtureResumableCheckInterruptAfterStageWrite(fixture);
      const first = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );
      assert(first.code !== 0, "interrupted packet stage unexpectedly completed delivery");
      assert(first.stderr.includes("fixture packet interruption"), first.stderr || first.stdout);
      const afterInterruption = readJson(join(fixture.stateRoot, "tasks", "resumed-task.json"));
      assert(afterInterruption.check_verification_packet?.status === "partial", JSON.stringify(afterInterruption.check_verification_packet));
      assert(afterInterruption.check_verification_packet?.next_stage === "check:packet-two", JSON.stringify(afterInterruption.check_verification_packet));
      assert(afterInterruption.check_verification_packet?.stages?.length === 1, JSON.stringify(afterInterruption.check_verification_packet));

      const second = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: { ...fixture.env, CODEX_WORKSPACE_FIXTURE_PACKET_INTERRUPT_AFTER_STAGE_WRITE: "0" } },
      );
      assert(second.code === 0, second.stderr || second.stdout);
      assert(readFixtureStageLog(stageLog).join(",") === "check:packet-one,check:packet-two", "interrupted packet reran a committed stage");
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("finish-pr resumable check packet fails closed before execution on binding drift, expiry, or malformed state", () => {
    for (const scenario of [
      { name: "task", mutate: (packet) => ({ ...packet, task_id: "other-task" }) },
      { name: "owner", mutate: (packet) => ({ ...packet, owner: "other-runner" }) },
      { name: "head", mutate: (packet) => ({ ...packet, head: "0".repeat(40) }) },
      { name: "plan digest", mutate: (packet) => ({ ...packet, plan_digest: "f".repeat(64) }) },
      { name: "expiry", mutate: (packet) => ({ ...packet, expires_at: "2026-07-25T00:00:00.000Z" }) },
      { name: "future timestamp", mutate: (packet) => ({ ...packet, updated_at: "2099-01-01T00:00:00.000Z" }) },
      { name: "unexpected retained data", mutate: (packet) => ({ ...packet, raw_output: "fixture-packet-secret" }) },
      { name: "malformed", mutate: () => ({ status: "partial", raw_output: "fixture-packet-secret" }) },
    ]) {
      const fixture = createFinishPrExistingCommitFixture();
      try {
        const stages = ["check:packet-one", "check:packet-two"];
        const stageLog = installFixtureResumableCheckPlan(fixture, stages);
        const manifestPath = join(fixture.stateRoot, "tasks", "resumed-task.json");
        const manifest = readJson(manifestPath);
        manifest.check_verification_packet = scenario.mutate(fixtureResumableCheckPacket(fixture, stages));
        writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
        installFixtureDeliveryProbes(fixture);

        const result = runFixtureScript(
          fixture,
          ["finish-pr", "resumed-task", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
          { cwd: fixture.worktree, env: fixture.env },
        );
        assert(result.code !== 0, `${scenario.name} packet unexpectedly resumed`);
        assert(result.stderr.includes("check verification packet"), result.stderr || result.stdout);
        assert(readFixtureStageLog(stageLog).length === 0, `${scenario.name} packet ran a stage`);
        assert(!existsSync(join(fixture.root, "git-push-called.txt")), `${scenario.name} packet reached git push`);
        assert(!existsSync(join(fixture.root, "gh-pr-create-called.txt")), `${scenario.name} packet reached PR creation`);
      } finally {
        cleanupFinishPrExistingCommitFixture(fixture);
      }
    }
  });

  test("finish-pr resumable check packet records a nonzero stage without raw output and blocks delivery", () => {
    const fixture = createFinishPrExistingCommitFixture();
    try {
      const stages = ["check:packet-one", "check:packet-failure"];
      const stageLog = installFixtureResumableCheckPlan(fixture, stages, { "check:packet-failure": "secret-nonzero" });
      installFixtureDeliveryProbes(fixture);
      const result = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );
      assert(result.code !== 0, "nonzero packet stage unexpectedly passed");
      assert(result.stderr.includes("check stage=check:packet-failure"), result.stderr || result.stdout);
      assert(!result.stderr.includes("fixture-packet-secret"), "nonzero packet error leaked child output");
      const manifest = readJson(join(fixture.stateRoot, "tasks", "resumed-task.json"));
      assert(manifest.check_verification_packet?.status === "failed", JSON.stringify(manifest.check_verification_packet));
      assert(manifest.check_verification_packet?.failed_stage === "check:packet-failure", JSON.stringify(manifest.check_verification_packet));
      assert(!JSON.stringify(manifest.check_verification_packet).includes("fixture-packet-secret"), "packet retained child output");
      assert(readFixtureStageLog(stageLog).join(",") === "check:packet-one,check:packet-failure", "nonzero stage evidence did not preserve execution order");
      assert(!existsSync(join(fixture.root, "git-push-called.txt")), "nonzero packet stage reached git push");
      assert(!existsSync(join(fixture.root, "gh-pr-create-called.txt")), "nonzero packet stage reached PR creation");

      const retry = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );
      assert(retry.code !== 0, "failed packet unexpectedly resumed");
      assert(retry.stderr.includes("previously failed; refusing to resume"), retry.stderr || retry.stdout);
      assert(readFixtureStageLog(stageLog).join(",") === "check:packet-one,check:packet-failure", "failed packet retry reran a stage");
      assert(!existsSync(join(fixture.root, "git-push-called.txt")), "failed packet retry reached git push");
      assert(!existsSync(join(fixture.root, "gh-pr-create-called.txt")), "failed packet retry reached PR creation");
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("finish-pr records a fixed supervisor leaf timeout without launching later leaves or delivery", () => {
    const fixture = createFinishPrExistingCommitFixture();
    const timeoutStage = "test:supervisor:check:integration:orchestrator-fake-workers";
    const stages = supervisorCheckLeaves;
    try {
      const stageLog = installFixtureResumableCheckPlan(fixture, stages, {}, ["test:supervisor"], ["test:supervisor"]);
      installFixtureResumableCheckTimeoutResultSeam(fixture, timeoutStage);
      installFixtureDeliveryProbes(fixture);
      const result = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );

      assert(result.code !== 0, "timed-out supervisor leaf unexpectedly passed");
      assert(result.stderr.includes(`check stage=${timeoutStage}`), result.stderr || result.stdout);
      const manifest = readJson(join(fixture.stateRoot, "tasks", "resumed-task.json"));
      const evidence = manifest.check_verification_packet?.stages?.at(-1);
      assert(manifest.check_verification_packet?.status === "failed", JSON.stringify(manifest.check_verification_packet));
      assert(manifest.check_verification_packet?.failed_stage === timeoutStage, JSON.stringify(manifest.check_verification_packet));
      assert(evidence?.stage === timeoutStage && evidence.status === null && evidence.signal === "SIGKILL" && evidence.error_code === "ETIMEDOUT" && evidence.output === "omitted", JSON.stringify(evidence));
      assert(readFixtureStageLog(stageLog).join(",") === `test:supervisor:check:preflight,test:supervisor:check:non-integration,${timeoutStage}`, "timeout launched a later supervisor leaf");
      assert(!existsSync(join(fixture.root, "git-push-called.txt")), "timeout reached git push");
      assert(!existsSync(join(fixture.root, "gh-pr-create-called.txt")), "timeout reached PR creation");
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("finish-pr --stage-all explicitly discards only a safe terminal packet with a changed binding", () => {
    const fixture = createFinishPrExistingCommitFixture();
    try {
      const stages = ["check:packet-one", "check:packet-two"];
      const stageLog = installFixtureResumableCheckPlan(fixture, stages);
      const manifestPath = join(fixture.stateRoot, "tasks", "resumed-task.json");
      const manifest = readJson(manifestPath);
      manifest.check_verification_packet = fixtureFailedResumableCheckPacket(fixture, stages, {
        head: "f".repeat(40),
        expires_at: new Date(Date.now() - 200).toISOString(),
      });
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      const result = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--stage-all", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );

      assert(result.code === 0, result.stderr || result.stdout);
      assert(readFixtureStageLog(stageLog).join(",") === stages.join(","), "recovered packet did not run a fresh plan from its first stage");
      const updated = readJson(manifestPath);
      assert(updated.check_verification_packet?.status === "passed", JSON.stringify(updated.check_verification_packet));
      assert(updated.events?.some((event) => event.type === "check_verification_packet_discarded" && event.message.includes("explicit-stage-all")), JSON.stringify(updated.events));
      assert(!JSON.stringify(updated).includes("fixture-packet-secret"), "recovery retained raw packet output");
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("finish-pr --stage-all migrates a safely owned obsolete supervisor aggregate packet into the full current plan", () => {
    const fixture = createFinishPrExistingCommitFixture();
    try {
      const stageLog = installFixtureResumableCheckPlan(fixture, supervisorCheckLeaves, {}, ["test:supervisor"], ["test:supervisor"]);
      const manifestPath = join(fixture.stateRoot, "tasks", "resumed-task.json");
      const manifest = readJson(manifestPath);
      manifest.check_verification_packet = fixtureFailedResumableCheckPacket(fixture, ["test:supervisor"], { plan_digest: createHash("sha256").update("test:supervisor").digest("hex") });
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      const result = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--stage-all", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );

      assert(result.code === 0, result.stderr || result.stdout);
      assert(readFixtureStageLog(stageLog).join(",") === supervisorCheckLeaves.join(","), "obsolete packet did not start the newly bound full plan from its first leaf");
      const updated = readJson(manifestPath);
      assert(updated.check_verification_packet?.status === "passed", JSON.stringify(updated.check_verification_packet));
      assert(updated.check_verification_packet?.stages?.[0]?.stage === supervisorCheckLeaves[0], JSON.stringify(updated.check_verification_packet));
      assert(updated.events?.some((event) => event.type === "check_verification_packet_discarded"), JSON.stringify(updated.events));
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("finish-pr --stage-all rejects a forged obsolete supervisor aggregate digest", () => {
    const fixture = createFinishPrExistingCommitFixture();
    try {
      const stageLog = installFixtureResumableCheckPlan(fixture, supervisorCheckLeaves, {}, ["test:supervisor"], ["test:supervisor"]);
      const manifestPath = join(fixture.stateRoot, "tasks", "resumed-task.json");
      const manifest = readJson(manifestPath);
      manifest.check_verification_packet = fixtureFailedResumableCheckPacket(fixture, ["test:supervisor"], { plan_digest: "f".repeat(64) });
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      const result = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--stage-all", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );

      assert(result.code !== 0, "forged obsolete digest unexpectedly recovered");
      assert(result.stderr.includes("plan digest is not current or a recognized legacy plan"), result.stderr || result.stdout);
      assert(readFixtureStageLog(stageLog).length === 0, "forged obsolete digest launched the new plan");
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("finish-pr --stage-all re-verifies a safe passed packet when its plan binding changes", () => {
    const fixture = createFinishPrExistingCommitFixture();
    try {
      const stages = ["check:packet-one", "check:packet-two"];
      const stageLog = installFixtureResumableCheckPlan(fixture, stages);
      const manifestPath = join(fixture.stateRoot, "tasks", "resumed-task.json");
      const manifest = readJson(manifestPath);
      manifest.check_verification_packet = fixturePassedResumableCheckPacket(fixture, stages, { head: "f".repeat(40) });
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      const result = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--stage-all", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );

      assert(result.code === 0, result.stderr || result.stdout);
      assert(readFixtureStageLog(stageLog).join(",") === stages.join(","), "changed passed packet did not run a fresh plan");
      const updated = readJson(manifestPath);
      assert(updated.check_verification_packet?.status === "passed", JSON.stringify(updated.check_verification_packet));
      assert(updated.events?.some((event) => event.type === "check_verification_packet_discarded"), JSON.stringify(updated.events));
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("finish-pr --stage-all discards a terminal packet when its staged input snapshot changes", () => {
    const fixture = createFinishPrExistingCommitFixture();
    try {
      const stages = ["check:packet-one", "check:packet-two"];
      const stageLog = installFixtureResumableCheckPlan(fixture, stages);
      const manifestPath = join(fixture.stateRoot, "tasks", "resumed-task.json");
      const manifest = readJson(manifestPath);
      const prior = fixtureFailedResumableCheckPacket(fixture, stages);
      manifest.check_verification_packet = prior;
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      writeFileSync(join(fixture.worktree, "reviewed-staged-input.txt"), "changed reviewed input\n");

      const result = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--stage-all", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );

      assert(result.code === 0, result.stderr || result.stdout);
      assert(readFixtureStageLog(stageLog).join(",") === stages.join(","), "changed staged snapshot did not start a fresh plan");
      const updated = readJson(manifestPath);
      assert(updated.check_verification_packet?.staged_input_digest !== prior.staged_input_digest, JSON.stringify(updated.check_verification_packet));
      assert(updated.events?.some((event) => event.type === "check_verification_packet_discarded" && event.message.includes("staged-input")), JSON.stringify(updated.events));
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("finish-pr permits a legacy terminal packet missing staged input only with explicit stage-all recovery", () => {
    const fixture = createFinishPrExistingCommitFixture();
    try {
      const stages = ["check:packet-one", "check:packet-two"];
      const stageLog = installFixtureResumableCheckPlan(fixture, stages);
      const manifestPath = join(fixture.stateRoot, "tasks", "resumed-task.json");
      const manifest = readJson(manifestPath);
      const legacy = fixtureFailedResumableCheckPacket(fixture, stages);
      delete legacy.staged_input_digest;
      manifest.check_verification_packet = legacy;
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      const result = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--stage-all", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );

      assert(result.code === 0, result.stderr || result.stdout);
      assert(readFixtureStageLog(stageLog).join(",") === stages.join(","), "explicit legacy staged-input migration did not run a fresh plan");
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("finish-pr --stage-all recovers a legacy failed packet whose final evidence postdates stale updated_at", () => {
    const fixture = createFinishPrExistingCommitFixture();
    try {
      const stages = ["check:packet-one", "check:packet-two"];
      const stageLog = installFixtureResumableCheckPlan(fixture, stages);
      const manifestPath = join(fixture.stateRoot, "tasks", "resumed-task.json");
      const manifest = readJson(manifestPath);
      manifest.check_verification_packet = fixtureLegacyFailedResumableCheckPacket(fixture, stages, { head: "f".repeat(40) });
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      const result = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--stage-all", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );

      assert(result.code === 0, result.stderr || result.stdout);
      assert(readFixtureStageLog(stageLog).join(",") === stages.join(","), "legacy recovery did not begin a fresh plan");
      const updated = readJson(manifestPath);
      assert(updated.check_verification_packet?.status === "passed", JSON.stringify(updated.check_verification_packet));
      assert(updated.events?.some((event) => event.type === "check_verification_packet_discarded"), JSON.stringify(updated.events));
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("finish-pr --stage-all recovers the recognized pre-expansion workspace composite plan into the workspace leaf plan", () => {
    const fixture = createFinishPrExistingCommitFixture();
    try {
      const stages = [
        "test:codex-workspace-state",
        "test:workspace-command-resolution",
        "test:base-checkout-recovery",
        "test:mutation-admission",
        "test:mutation-admission-workspace-handoff",
        "test:mutation-admission-prewrite-guard",
        "test:codex-workspace",
      ];
      const stageLog = installFixtureResumableCheckPlan(fixture, stages, {}, ["check:workspace-fast"], ["check:workspace-fast"]);
      const manifestPath = join(fixture.stateRoot, "tasks", "resumed-task.json");
      const manifest = readJson(manifestPath);
      const failedAt = new Date(Date.now() - 500).toISOString();
      manifest.check_verification_packet = fixtureFailedResumableCheckPacket(fixture, stages, {
        plan_digest: createHash("sha256").update("check:workspace-fast").digest("hex"),
        stages: [{ stage: "check:workspace-fast", completed_at: failedAt, status: null, signal: "SIGKILL", error_code: "ETIMEDOUT", output: "omitted" }],
        updated_at: failedAt,
        next_stage: "check:workspace-fast",
        failed_stage: "check:workspace-fast",
      });
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      const result = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--stage-all", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );

      assert(result.code === 0, result.stderr || result.stdout);
      assert(readFixtureStageLog(stageLog).join(",") === stages.join(","), "workspace composite recovery did not run the fresh leaf plan");
      const updated = readJson(manifestPath);
      assert(updated.check_verification_packet?.status === "passed", JSON.stringify(updated.check_verification_packet));
      assert(updated.events?.some((event) => event.type === "check_verification_packet_discarded"), JSON.stringify(updated.events));
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("finish-pr --stage-all recovers only the recognized baseline raw check:fast plan into the expanded plan", () => {
    const fixture = createFinishPrExistingCommitFixture();
    try {
      const { stages, stageLog } = installFixtureProductionShapeExternalCheckStageHandoffPlan(fixture);
      const legacyRawStages = ["check:fast", "check:handoff-later"];
      const manifestPath = join(fixture.stateRoot, "tasks", "resumed-task.json");
      const manifest = readJson(manifestPath);
      const failedAt = new Date(Date.now() - 500).toISOString();
      manifest.check_verification_packet = fixtureFailedResumableCheckPacket(fixture, stages, {
        plan_digest: createHash("sha256").update(legacyRawStages.join("\n")).digest("hex"),
        stages: [{ stage: "check:fast", completed_at: failedAt, status: null, signal: "SIGKILL", error_code: "ETIMEDOUT", output: "omitted" }],
        updated_at: failedAt,
        next_stage: "check:fast",
        failed_stage: "check:fast",
      });
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      const result = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--stage-all", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );

      assert(result.code === 0, result.stderr || result.stdout);
      assert(readFixtureStageLog(stageLog).join(",") === stages.join(","), "recognized raw check:fast recovery did not run the full expanded plan");
      const updated = readJson(manifestPath);
      assert(updated.check_verification_packet?.status === "passed", JSON.stringify(updated.check_verification_packet));
      assert(updated.events?.some((event) => event.type === "check_verification_packet_discarded"), JSON.stringify(updated.events));
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("finish-pr --stage-all rejects mixed legacy digest and expanded history packet shapes", () => {
    for (const scenario of [
      {
        name: "raw digest with expanded history",
        planDigest: (legacyRawStages) => createHash("sha256").update(legacyRawStages.join("\n")).digest("hex"),
        failedStage: "check:ci-fast",
      },
      {
        name: "expanded digest with raw history",
        planDigest: null,
        failedStage: "check:fast",
      },
    ]) {
      const fixture = createFinishPrExistingCommitFixture();
      try {
        const { stages, stageLog } = installFixtureProductionShapeExternalCheckStageHandoffPlan(fixture);
        const legacyRawStages = ["check:fast", "check:handoff-later"];
        const manifestPath = join(fixture.stateRoot, "tasks", "resumed-task.json");
        const manifest = readJson(manifestPath);
        const failedAt = new Date(Date.now() - 500).toISOString();
        manifest.check_verification_packet = fixtureFailedResumableCheckPacket(fixture, stages, {
          ...(scenario.planDigest ? { plan_digest: scenario.planDigest(legacyRawStages) } : {}),
          stages: [{ stage: scenario.failedStage, completed_at: failedAt, status: null, signal: "SIGKILL", error_code: "ETIMEDOUT", output: "omitted" }],
          updated_at: failedAt,
          next_stage: scenario.failedStage,
          failed_stage: scenario.failedStage,
        });
        writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
        installFixtureDeliveryProbes(fixture);

        const result = runFixtureScript(
          fixture,
          ["finish-pr", "resumed-task", "--stage-all", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
          { cwd: fixture.worktree, env: fixture.env },
        );

        assert(result.code !== 0, `${scenario.name} hybrid packet unexpectedly recovered`);
        assert(result.stderr.includes("stage evidence is not an ordered plan prefix"), result.stderr || result.stdout);
        assert(readFixtureStageLog(stageLog).length === 0, `${scenario.name} hybrid packet ran a stage`);
      } finally {
        cleanupFinishPrExistingCommitFixture(fixture);
      }
    }
  });

  test("finish-pr recovery persists a fresh packet before a budget pause can run a stage", () => {
    const fixture = createFinishPrExistingCommitFixture();
    try {
      const stages = ["check:packet-one", "check:packet-two"];
      const stageLog = installFixtureResumableCheckPlan(fixture, stages);
      installFixtureResumableCheckPauseBeforeStageSeam(fixture);
      const manifestPath = join(fixture.stateRoot, "tasks", "resumed-task.json");
      const manifest = readJson(manifestPath);
      manifest.check_verification_packet = fixtureFailedResumableCheckPacket(fixture, stages, { head: "f".repeat(40) });
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      const result = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--stage-all", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );

      assert(result.code !== 0, "budget-paused recovery unexpectedly completed");
      assert(result.stderr.includes("packet paused"), result.stderr || result.stdout);
      assert(readFixtureStageLog(stageLog).length === 0, "budget-paused recovery ran a stage");
      const updated = readJson(manifestPath);
      assert(updated.check_verification_packet?.status === "partial", JSON.stringify(updated.check_verification_packet));
      assert(updated.check_verification_packet?.stages?.length === 0, JSON.stringify(updated.check_verification_packet));
      assert(updated.check_verification_packet?.plan_digest !== "f".repeat(64), JSON.stringify(updated.check_verification_packet));
      assert(updated.events?.some((event) => event.type === "check_verification_packet_discarded"), JSON.stringify(updated.events));
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("finish-pr terminal packet recovery rejects implicit, nonterminal, mismatched-owner, and malformed resets", () => {
    for (const scenario of [
      { name: "implicit", args: [], packet: (fixture, stages) => fixtureFailedResumableCheckPacket(fixture, stages, { head: "f".repeat(40) }), expected: "binding changed" },
      { name: "legacy missing staged snapshot implicit", args: [], packet: (fixture, stages) => { const packet = fixtureFailedResumableCheckPacket(fixture, stages); delete packet.staged_input_digest; return packet; }, expected: "staged input binding is malformed" },
      { name: "unrecognized historical plan", args: ["--stage-all"], packet: (fixture, stages) => fixtureFailedResumableCheckPacket(fixture, stages, { plan_digest: "f".repeat(64), head: "f".repeat(40) }), expected: "plan digest is not current or a recognized legacy plan" },
      { name: "partial", args: ["--stage-all"], packet: (fixture, stages) => fixtureResumableCheckPacket(fixture, stages, { plan_digest: "f".repeat(64) }), expected: "explicit recovery requires a terminal packet" },
      { name: "owner", args: ["--stage-all"], packet: (fixture, stages) => fixtureFailedResumableCheckPacket(fixture, stages, { owner: "other-runner" }), expected: "binding changed" },
      { name: "malformed", args: ["--stage-all"], packet: (fixture, stages) => ({ ...fixtureFailedResumableCheckPacket(fixture, stages), raw_output: "fixture-packet-secret" }), expected: "contains unbounded fields" },
      { name: "failed history", args: ["--stage-all"], packet: (fixture, stages) => fixtureFailedResumableCheckPacket(fixture, stages, { stages: [{ stage: stages[0], completed_at: new Date(Date.now() - 800).toISOString(), status: null, signal: "SIGKILL", error_code: "ETIMEDOUT", output: "omitted" }, { stage: stages[1], completed_at: new Date(Date.now() - 700).toISOString(), status: 0, signal: null, error_code: null, output: "omitted" }] }), expected: "failed packet stage is malformed" },
      { name: "passed duplicate history", args: ["--stage-all"], packet: (fixture, stages) => fixturePassedResumableCheckPacket(fixture, stages, { stages: [{ stage: stages[0], completed_at: new Date(Date.now() - 800).toISOString(), status: 0, signal: null, error_code: null, output: "omitted" }, { stage: stages[0], completed_at: new Date(Date.now() - 700).toISOString(), status: 0, signal: null, error_code: null, output: "omitted" }] }), expected: "stage evidence stage is malformed" },
      { name: "passed legacy timestamp", args: ["--stage-all"], packet: (fixture, stages) => fixtureLegacyPassedResumableCheckPacket(fixture, stages), expected: "stage evidence is malformed" },
      { name: "failure after expiry", args: ["--stage-all"], packet: (fixture, stages) => fixtureLegacyFailedResumableCheckPacket(fixture, stages, { expires_at: new Date(Date.now() - 26 * 60_000).toISOString() }), expected: "stage evidence is malformed" },
      { name: "intermediate legacy timestamp", args: ["--stage-all"], packet: (fixture, stages) => { const packet = fixtureLegacyFailedResumableCheckPacket(fixture, stages); packet.stages[0].completed_at = new Date(Date.parse(packet.updated_at) + 60_000).toISOString(); return packet; }, expected: "stage evidence is malformed" },
      { name: "unknown legacy stage", args: ["--stage-all"], packet: (fixture, stages) => { const failedAt = new Date(Date.now() - 500).toISOString(); return fixtureFailedResumableCheckPacket(fixture, stages, { stages: [{ stage: "check:unknown-legacy", completed_at: failedAt, status: null, signal: "SIGKILL", error_code: "ETIMEDOUT", output: "omitted" }], updated_at: failedAt, next_stage: "check:unknown-legacy", failed_stage: "check:unknown-legacy" }); }, expected: "stage evidence is not an ordered plan prefix" },
      { name: "incomplete passed history", args: ["--stage-all"], packet: (fixture, stages) => fixturePassedResumableCheckPacket(fixture, stages, { stages: [{ stage: stages[0], completed_at: new Date(Date.now() - 500).toISOString(), status: 0, signal: null, error_code: null, output: "omitted" }] }), expected: "passed packet completion is invalid" },
      { name: "reordered failed history", args: ["--stage-all"], packet: (fixture, stages) => fixtureFailedResumableCheckPacket(fixture, stages, { stages: [{ stage: stages[1], completed_at: new Date(Date.now() - 800).toISOString(), status: 0, signal: null, error_code: null, output: "omitted" }, { stage: stages[0], completed_at: new Date(Date.now() - 700).toISOString(), status: null, signal: "SIGKILL", error_code: "ETIMEDOUT", output: "omitted" }], updated_at: new Date(Date.now() - 500).toISOString(), next_stage: stages[0], failed_stage: stages[0] }), expected: "stage evidence is not an ordered plan prefix" },
      { name: "unchanged staged snapshot", args: ["--stage-all"], packet: (fixture, stages) => fixtureFailedResumableCheckPacket(fixture, stages), expected: "previously failed; refusing to resume" },
    ]) {
      const fixture = createFinishPrExistingCommitFixture();
      try {
        const stages = ["check:packet-one", "check:packet-two"];
        const stageLog = installFixtureResumableCheckPlan(fixture, stages);
        const manifestPath = join(fixture.stateRoot, "tasks", "resumed-task.json");
        const manifest = readJson(manifestPath);
        manifest.check_verification_packet = scenario.packet(fixture, stages);
        writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
        installFixtureDeliveryProbes(fixture);

        const result = runFixtureScript(
          fixture,
          ["finish-pr", "resumed-task", ...scenario.args, "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
          { cwd: fixture.worktree, env: fixture.env },
        );

        assert(result.code !== 0, `${scenario.name} packet reset unexpectedly ran`);
        assert(result.stderr.includes(scenario.expected), result.stderr || result.stdout);
        assert(readFixtureStageLog(stageLog).length === 0, `${scenario.name} packet reset ran a stage`);
        assert(!existsSync(join(fixture.root, "git-push-called.txt")), `${scenario.name} packet reset reached git push`);
        assert(!existsSync(join(fixture.root, "gh-pr-create-called.txt")), `${scenario.name} packet reset reached PR creation`);
      } finally {
        cleanupFinishPrExistingCommitFixture(fixture);
      }
    }
  });

  test("finish-pr completed resumable check packet unlocks only the existing downstream delivery path", () => {
    const fixture = createFinishPrExistingCommitFixture();
    try {
      const stages = ["check:packet-one", "check:packet-two"];
      const stageLog = installFixtureResumableCheckPlan(fixture, stages);
      const manifestPath = join(fixture.stateRoot, "tasks", "resumed-task.json");
      const manifest = readJson(manifestPath);
      const completedAt = new Date().toISOString();
      const packet = fixtureResumableCheckPacket(fixture, stages, {
        status: "passed",
        stages: stages.map((stage) => ({ stage, completed_at: completedAt, status: 0, signal: null, error_code: null, output: "omitted" })),
        next_stage: null,
        updated_at: completedAt,
        completed_at: completedAt,
      });
      manifest.check_verification_packet = packet;
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      const result = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );
      assert(result.code === 0, result.stderr || result.stdout);
      assert(readFixtureStageLog(stageLog).length === 0, "completed packet reran a verification stage");
      const updated = readJson(manifestPath);
      assert(updated.check_verification_packet?.status === "passed", JSON.stringify(updated.check_verification_packet));
      assert(updated.last_verified_at, "completed packet did not record the existing verification gate");
      assert(updated.pr_delivery_evidence?.operation === "create-pr", JSON.stringify(updated.pr_delivery_evidence));
      assert(updated.lane_evidence_packet?.pr_delivery?.operation === "create-pr", JSON.stringify(updated.lane_evidence_packet));
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("finish-pr resumable check packet retains only metadata across packet and diagnostic evidence", () => {
    const fixture = createFinishPrExistingCommitFixture();
    try {
      const stages = ["check:packet-secret"];
      installFixtureResumableCheckPlan(fixture, stages, { "check:packet-secret": "secret-nonzero" });
      const result = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );
      assert(result.code !== 0, "secret packet stage unexpectedly passed");
      const manifest = readJson(join(fixture.stateRoot, "tasks", "resumed-task.json"));
      const diagnosticsDir = join(fixture.stateRoot, "tasks", ".diagnostics");
      const names = readdirSync(diagnosticsDir).filter((name) => name.endsWith(".json"));
      assert(names.length === 1, "packet failure did not persist one bounded diagnostic");
      const retained = JSON.stringify({ packet: manifest.check_verification_packet, diagnostic: readJson(join(diagnosticsDir, names[0])) });
      assert(!retained.includes("fixture-packet-secret"), "resumable check retained raw child output");
      assert(manifest.check_verification_packet?.stages?.[0]?.output === "omitted", JSON.stringify(manifest.check_verification_packet));
      assert(readJson(join(diagnosticsDir, names[0])).child?.output === "omitted", retained);
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("external check stage handoff records the fixed leaf in the production-shaped plan and resumes every later stage before delivery", () => {
    const fixture = createFinishPrExistingCommitFixture();
    try {
      const { stages, stageLog } = installFixtureProductionShapeExternalCheckStageHandoffPlan(fixture);
      const manifestPath = join(fixture.stateRoot, "tasks", "resumed-task.json");
      const manifest = readJson(manifestPath);
      manifest.check_verification_packet = fixtureExternalCheckStageHandoffPacket(fixture, stages);
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      installFixtureDeliveryProbes(fixture, { allowDelivery: true });

      const beforeDryRun = readFileSync(manifestPath, "utf8");
      const dryRun = runFixtureScript(
        fixture,
        ["record-check-stage-evidence", "resumed-task", "--external-direct-success", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );
      assert(dryRun.code === 0, dryRun.stderr || dryRun.stdout);
      assert(dryRun.stdout.includes("DRY RUN: record-check-stage-evidence"), dryRun.stdout || dryRun.stderr);
      assert(readFileSync(manifestPath, "utf8") === beforeDryRun, "handoff dry-run mutated the manifest");

      const applied = runFixtureScript(
        fixture,
        ["record-check-stage-evidence", "resumed-task", "--external-direct-success", "--apply", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );
      assert(applied.code === 0, applied.stderr || applied.stdout);
      assert(applied.stdout.includes("APPLY: record-check-stage-evidence"), applied.stdout || applied.stderr);
      assert(readFixtureStageLog(stageLog).length === 0, "handoff reran a check stage");
      assert(!existsSync(join(fixture.root, "git-push-called.txt")), "handoff reached git push");
      assert(!existsSync(join(fixture.root, "gh-pr-create-called.txt")), "handoff reached PR creation");

      const recorded = readJson(manifestPath);
      const packet = recorded.check_verification_packet;
      const targetIndex = stages.indexOf("test:codex-workspace");
      assert(packet?.status === "partial" && packet.next_stage === stages[targetIndex + 1], JSON.stringify(packet));
      assert(packet.stages?.map((entry) => entry.stage).join(",") === stages.slice(0, targetIndex + 1).join(","), JSON.stringify(packet));
      assert(packet.stages?.at(-1)?.status === 0 && packet.stages?.at(-1)?.signal === null && packet.stages?.at(-1)?.error_code === null && packet.stages?.at(-1)?.output === "omitted", JSON.stringify(packet));
      assert(recorded.external_check_stage_evidence?.stage === "test:codex-workspace", JSON.stringify(recorded.external_check_stage_evidence));
      assert(recorded.external_check_stage_evidence?.command?.join(" ") === "pnpm run test:codex-workspace", JSON.stringify(recorded.external_check_stage_evidence));
      assert(recorded.external_check_stage_evidence?.output === "omitted", JSON.stringify(recorded.external_check_stage_evidence));
      assert(recorded.events?.some((event) => event.type === "external_check_stage_evidence_recorded"), JSON.stringify(recorded.events));
      assert(!JSON.stringify(recorded).includes("fixture-handoff-secret"), "handoff retained raw caller evidence");

      const finish = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );
      assert(finish.code === 0, finish.stderr || finish.stdout);
      assert(readFixtureStageLog(stageLog).join(",") === stages.slice(targetIndex + 1).join(","), "ordinary finish-pr did not run every remaining planned stage in order");
      assert(existsSync(join(fixture.root, "git-push-called.txt")), "ordinary finish-pr did not own downstream push");
      assert(existsSync(join(fixture.root, "gh-pr-create-called.txt")), "ordinary finish-pr did not own downstream PR creation");
      const delivered = readJson(manifestPath);
      assert(delivered.last_verified_at && delivered.last_verification_command === "pnpm run check" && delivered.pr_url, JSON.stringify(delivered));
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("external check stage handoff rejects unsafe input, packet state, binding, and ownership before delivery", () => {
    const scenarios = [
      { name: "missing attestation", args: [], mutate: () => {} },
      { name: "arbitrary stage", args: ["--external-direct-success", "--stage", "check:packet-one"], mutate: () => {} },
      { name: "arbitrary command", args: ["--external-direct-success", "--command", "fixture-handoff-secret"], mutate: () => {} },
      { name: "caller receipt", args: ["--external-direct-success", "--receipt", "fixture-handoff-secret"], mutate: () => {} },
      { name: "caller-controlled owner", args: ["--external-direct-success", "--owner", "runner-a"], mutate: () => {} },
      { name: "owner spoof", args: ["--external-direct-success", "--owner", "other-runner"], mutate: () => {} },
      { name: "takeover", args: ["--external-direct-success", "--take-ownership", "--takeover-reason", "fixture takeover must never be accepted"], mutate: () => {} },
      { name: "partial", args: ["--external-direct-success"], mutate: (packet) => { packet.status = "partial"; delete packet.failed_stage; packet.stages = packet.stages.slice(0, -1); packet.next_stage = "test:codex-workspace"; } },
      { name: "passed", args: ["--external-direct-success"], mutate: (packet) => { packet.status = "passed"; packet.stages[1] = { ...packet.stages[1], status: 0, signal: null, error_code: null }; packet.next_stage = null; packet.completed_at = packet.updated_at; delete packet.failed_stage; } },
      { name: "expired", args: ["--external-direct-success"], mutate: (packet) => { packet.expires_at = new Date(Date.now() - 60_000).toISOString(); } },
      { name: "task drift", args: ["--external-direct-success"], mutate: (packet) => { packet.task_id = "other-task"; } },
      { name: "owner drift", args: ["--external-direct-success"], mutate: (packet) => { packet.owner = "other-owner"; } },
      { name: "head drift", args: ["--external-direct-success"], mutate: (packet) => { packet.head = "f".repeat(40); } },
      { name: "plan drift", args: ["--external-direct-success"], mutate: (packet) => { packet.plan_digest = "f".repeat(64); } },
      { name: "staged input drift", args: ["--external-direct-success"], mutate: (packet) => { packet.staged_input_digest = "f".repeat(64); } },
      { name: "unordered history", args: ["--external-direct-success"], mutate: (packet) => { packet.stages.reverse(); packet.failed_stage = "check:packet-one"; packet.next_stage = "check:packet-one"; } },
      { name: "unbounded packet", args: ["--external-direct-success"], mutate: (packet) => { packet.raw_output = "fixture-handoff-secret"; } },
      { name: "nonfinal failure", args: ["--external-direct-success"], mutate: (packet) => { packet.stages[0] = { ...packet.stages[0], status: 1 }; packet.stages[1] = { ...packet.stages[1], status: 0, signal: null, error_code: null }; packet.failed_stage = "check:packet-one"; packet.next_stage = "check:packet-one"; } },
    ];
    for (const scenario of scenarios) {
      const fixture = createFinishPrExistingCommitFixture();
      try {
        const stages = ["check:packet-one", "test:codex-workspace"];
        const stageLog = installFixtureResumableCheckPlan(fixture, stages);
        const manifestPath = join(fixture.stateRoot, "tasks", "resumed-task.json");
        const manifest = readJson(manifestPath);
        manifest.check_verification_packet = fixtureExternalCheckStageHandoffPacket(fixture, stages);
        scenario.mutate(manifest.check_verification_packet);
        writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
        const before = readFileSync(manifestPath, "utf8");
        installFixtureDeliveryProbes(fixture);

        const result = runFixtureScript(
          fixture,
          ["record-check-stage-evidence", "resumed-task", ...scenario.args, "--apply", "--state-root", fixture.stateRoot],
          { cwd: fixture.worktree, env: fixture.env },
        );
        assert(result.code !== 0, `${scenario.name} handoff unexpectedly succeeded`);
        assert(readFileSync(manifestPath, "utf8") === before, `${scenario.name} handoff mutated the manifest`);
        assert(readFixtureStageLog(stageLog).length === 0, `${scenario.name} handoff ran a stage`);
        assert(!existsSync(join(fixture.root, "git-push-called.txt")), `${scenario.name} handoff reached git push`);
        assert(!existsSync(join(fixture.root, "gh-pr-create-called.txt")), `${scenario.name} handoff reached PR creation`);
      } finally {
        cleanupFinishPrExistingCommitFixture(fixture);
      }
    }
  });

  test("external check stage handoff revalidates packet bindings under the manifest lock and rejects duplicate use", () => {
    const fixture = createFinishPrExistingCommitFixture();
    try {
      const stages = ["check:packet-one", "test:codex-workspace"];
      installFixtureResumableCheckPlan(fixture, stages);
      const manifestPath = join(fixture.stateRoot, "tasks", "resumed-task.json");
      const manifest = readJson(manifestPath);
      manifest.check_verification_packet = fixtureExternalCheckStageHandoffPacket(fixture, stages);
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      installFixtureExternalCheckStageEvidenceLockDrift(fixture);
      const before = readFileSync(manifestPath, "utf8");

      const drifted = runFixtureScript(
        fixture,
        ["record-check-stage-evidence", "resumed-task", "--external-direct-success", "--apply", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );
      assert(drifted.code !== 0, "lock-drift handoff unexpectedly succeeded");
      const afterDrift = readFileSync(manifestPath, "utf8");
      assert(afterDrift !== before && readJson(manifestPath).check_verification_packet?.plan_digest === "f".repeat(64), "fixture lock drift did not reach locked revalidation");
      assert(!readJson(manifestPath).external_check_stage_evidence, "lock-drift handoff recorded evidence");
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }

    const expiryFixture = createFinishPrExistingCommitFixture();
    try {
      const stages = ["check:packet-one", "test:codex-workspace"];
      installFixtureResumableCheckPlan(expiryFixture, stages);
      const manifestPath = join(expiryFixture.stateRoot, "tasks", "resumed-task.json");
      const manifest = readJson(manifestPath);
      manifest.check_verification_packet = fixtureExternalCheckStageHandoffPacket(expiryFixture, stages);
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      installFixtureExternalCheckStageEvidenceLockDrift(expiryFixture, { expirePacket: true });
      const before = readFileSync(manifestPath, "utf8");

      const expiredUnderLock = runFixtureScript(
        expiryFixture,
        ["record-check-stage-evidence", "resumed-task", "--external-direct-success", "--apply", "--state-root", expiryFixture.stateRoot],
        { cwd: expiryFixture.worktree, env: expiryFixture.env },
      );
      assert(expiredUnderLock.code !== 0, "lock-expired handoff unexpectedly succeeded");
      const afterExpiry = readFileSync(manifestPath, "utf8");
      assert(afterExpiry !== before && Date.parse(readJson(manifestPath).check_verification_packet?.expires_at) <= Date.now(), "fixture lock expiry did not reach locked revalidation");
      assert(!readJson(manifestPath).external_check_stage_evidence, "lock-expired handoff recorded evidence");
    } finally {
      cleanupFinishPrExistingCommitFixture(expiryFixture);
    }

    const duplicateFixture = createFinishPrExistingCommitFixture();
    try {
      const stages = ["check:packet-one", "test:codex-workspace"];
      installFixtureResumableCheckPlan(duplicateFixture, stages);
      const manifestPath = join(duplicateFixture.stateRoot, "tasks", "resumed-task.json");
      const manifest = readJson(manifestPath);
      manifest.check_verification_packet = fixtureExternalCheckStageHandoffPacket(duplicateFixture, stages);
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      const args = ["record-check-stage-evidence", "resumed-task", "--external-direct-success", "--apply", "--state-root", duplicateFixture.stateRoot];
      const first = runFixtureScript(duplicateFixture, args, { cwd: duplicateFixture.worktree, env: duplicateFixture.env });
      assert(first.code === 0, first.stderr || first.stdout);
      const afterFirst = readFileSync(manifestPath, "utf8");
      const duplicate = runFixtureScript(duplicateFixture, args, { cwd: duplicateFixture.worktree, env: duplicateFixture.env });
      assert(duplicate.code !== 0, "duplicate handoff unexpectedly succeeded");
      assert(readFileSync(manifestPath, "utf8") === afterFirst, "duplicate handoff mutated the manifest");
    } finally {
      cleanupFinishPrExistingCommitFixture(duplicateFixture);
    }
  });

  test("external check stage handoff supersedes only stale binding evidence and never lets it authorize a mismatched packet", () => {
    const resetFixture = createFinishPrExistingCommitFixture();
    try {
      const stages = ["check:packet-one", "test:codex-workspace"];
      installFixtureResumableCheckPlan(resetFixture, stages);
      const manifestPath = join(resetFixture.stateRoot, "tasks", "resumed-task.json");
      const manifest = readJson(manifestPath);
      const packet = fixtureExternalCheckStageHandoffPacket(resetFixture, stages);
      manifest.check_verification_packet = packet;
      manifest.external_check_stage_evidence = {
        schema_version: 1,
        recorded_at: new Date(Date.now() - 60_000).toISOString(),
        task_id: packet.task_id,
        owner: packet.owner,
        stage: "test:codex-workspace",
        command: ["pnpm", "run", "test:codex-workspace"],
        status: 0,
        signal: null,
        error_code: null,
        output: "fixture-stale-raw-output-must-not-survive",
        head: packet.head,
        plan_digest: packet.plan_digest,
        staged_input_digest: "f".repeat(64),
      };
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      const result = runFixtureScript(
        resetFixture,
        ["record-check-stage-evidence", "resumed-task", "--external-direct-success", "--apply", "--state-root", resetFixture.stateRoot],
        { cwd: resetFixture.worktree, env: resetFixture.env },
      );
      assert(result.code === 0, result.stderr || result.stdout);
      const updated = readJson(manifestPath);
      assert(updated.check_verification_packet?.status === "passed", JSON.stringify(updated.check_verification_packet));
      assert(updated.external_check_stage_evidence?.task_id === "resumed-task", JSON.stringify(updated.external_check_stage_evidence));
      assert(updated.external_check_stage_evidence?.owner === "runner-a", JSON.stringify(updated.external_check_stage_evidence));
      assert(updated.external_check_stage_evidence?.staged_input_digest === packet.staged_input_digest, JSON.stringify(updated.external_check_stage_evidence));
      assert(updated.external_check_stage_evidence_history?.length === 1, JSON.stringify(updated.external_check_stage_evidence_history));
      assert(updated.external_check_stage_evidence_history[0]?.staged_input_digest === "f".repeat(64), JSON.stringify(updated.external_check_stage_evidence_history));
      assert(updated.external_check_stage_evidence_history[0]?.output === "omitted", JSON.stringify(updated.external_check_stage_evidence_history));
      assert(!JSON.stringify(updated).includes("fixture-stale-raw-output-must-not-survive"), "stale evidence retained raw output");
      assert(updated.events?.some((event) => event.type === "external_check_stage_evidence_superseded"), JSON.stringify(updated.events));

      const replay = readJson(manifestPath);
      replay.check_verification_packet = fixtureExternalCheckStageHandoffPacket(resetFixture, stages);
      replay.external_check_stage_evidence_history = [
        ...replay.external_check_stage_evidence_history,
        replay.external_check_stage_evidence,
      ];
      replay.external_check_stage_evidence = replay.external_check_stage_evidence_history[0];
      writeFileSync(manifestPath, `${JSON.stringify(replay, null, 2)}\n`);
      const beforeReplay = readFileSync(manifestPath, "utf8");
      const replayResult = runFixtureScript(
        resetFixture,
        ["record-check-stage-evidence", "resumed-task", "--external-direct-success", "--apply", "--state-root", resetFixture.stateRoot],
        { cwd: resetFixture.worktree, env: resetFixture.env },
      );
      assert(replayResult.code !== 0, "exact history binding replay unexpectedly succeeded");
      assert(readFileSync(manifestPath, "utf8") === beforeReplay, "exact history binding replay mutated the manifest");
    } finally {
      cleanupFinishPrExistingCommitFixture(resetFixture);
    }

    const mismatchFixture = createFinishPrExistingCommitFixture();
    try {
      const stages = ["check:packet-one", "test:codex-workspace"];
      installFixtureResumableCheckPlan(mismatchFixture, stages);
      const manifestPath = join(mismatchFixture.stateRoot, "tasks", "resumed-task.json");
      const manifest = readJson(manifestPath);
      const packet = fixtureExternalCheckStageHandoffPacket(mismatchFixture, stages, { staged_input_digest: "e".repeat(64) });
      manifest.check_verification_packet = packet;
      manifest.external_check_stage_evidence = {
        schema_version: 1,
        recorded_at: new Date(Date.now() - 60_000).toISOString(),
        task_id: packet.task_id,
        owner: packet.owner,
        stage: "test:codex-workspace",
        command: ["pnpm", "run", "test:codex-workspace"],
        status: 0,
        signal: null,
        error_code: null,
        output: "omitted",
        head: packet.head,
        plan_digest: packet.plan_digest,
        staged_input_digest: "f".repeat(64),
      };
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      const before = readFileSync(manifestPath, "utf8");

      const result = runFixtureScript(
        mismatchFixture,
        ["record-check-stage-evidence", "resumed-task", "--external-direct-success", "--apply", "--state-root", mismatchFixture.stateRoot],
        { cwd: mismatchFixture.worktree, env: mismatchFixture.env },
      );
      assert(result.code !== 0, "mismatched packet accepted stale evidence");
      assert(readFileSync(manifestPath, "utf8") === before, "mismatched packet or stale evidence mutated the manifest");
      assert(readJson(manifestPath).check_verification_packet?.status === "failed", "mismatched evidence passed the packet");
    } finally {
      cleanupFinishPrExistingCommitFixture(mismatchFixture);
    }
  });

  test("finish-pr check diagnostic projects a later aggregate stage without retaining child output", () => {
    const fixture = createFinishPrExistingCommitFixture();
    try {
      installFixtureVerificationProfileCommand(fixture, "check", "later-stage-nonzero");
      const result = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--verify", "check", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );
      assert(result.code !== 0, "later-stage verification unexpectedly passed");
      const names = readdirSync(join(fixture.stateRoot, "tasks", ".diagnostics")).filter((name) => name.endsWith(".json"));
      assert(names.length === 1, "later-stage failure did not persist a diagnostic");
      const diagnostic = readJson(join(fixture.stateRoot, "tasks", ".diagnostics", names[0]));
      assert(diagnostic.check_projection?.stage === "check:later-stage", JSON.stringify(diagnostic));
      assert(diagnostic.check_projection?.result_status === 23, JSON.stringify(diagnostic));
      assert(diagnostic.check_projection?.raw_output === "omitted", JSON.stringify(diagnostic));
      assert(!JSON.stringify(diagnostic).includes("fixture-later-stage-secret"), "projection retained child output");
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("task lock inspection and stale recovery are exact-task, redacted, and fail closed", () => {
    const fixture = createFinishPrExistingCommitFixture();
    try {
      const lockPath = writeFixtureTaskLock(fixture, fixtureTaskLockMetadata("resumed-task"));
      const activeInspection = runFixtureScript(
        fixture,
        ["inspect-task-lock", "resumed-task", "--summary-json", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );
      assert(activeInspection.code === 0, activeInspection.stderr || activeInspection.stdout);
      const activePacket = JSON.parse(activeInspection.stdout);
      assert(activePacket.status === "active", activeInspection.stdout);
      assert(activePacket.processStartIdentityPresent === true, activeInspection.stdout);
      assert(activePacket.mutation === "none; read-only lock inspection", activeInspection.stdout);
      assert(!activeInspection.stdout.includes("11111111-1111-4111-8111-111111111111"), "inspection leaked lock token");

      const activeAttempt = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--no-verify", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );
      assert(activeAttempt.code !== 0, "active lock unexpectedly recovered");
      assert(activeAttempt.stderr.includes("status=active"), activeAttempt.stderr || activeAttempt.stdout);
      assert(existsSync(lockPath), "active lock was changed");

      writeFixtureTaskLock(fixture, fixtureTaskLockMetadata("resumed-task", { process_start_identity: "linux-proc-start-ticks:pid-reuse" }));
      const ambiguousAttempt = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--no-verify", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );
      assert(ambiguousAttempt.code !== 0, "ambiguous lock unexpectedly recovered");
      assert(ambiguousAttempt.stderr.includes("status=ambiguous"), ambiguousAttempt.stderr || ambiguousAttempt.stdout);

      writeFixtureTaskLock(fixture, fixtureTaskLockMetadata("resumed-task", {
        pid: 999_999_999,
        process_start_identity: "linux-proc-start-ticks:1",
        token: "33333333-3333-4333-8333-333333333333",
      }));
      const staleRecovery = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--no-verify", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );
      assert(staleRecovery.code === 0, staleRecovery.stderr || staleRecovery.stdout);
      assert(!existsSync(lockPath), "recovered lock remained after successful finish-pr cleanup");
      assert(
        existsSync(join(fixture.stateRoot, "tasks", ".lock-history", "resumed-task-33333333-3333-4333-8333-333333333333.stale-lock")),
        "stale lock archive was not preserved",
      );
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("task lock stale recovery re-reads the exact token before replacing a raced lock", () => {
    const fixture = createFinishPrExistingCommitFixture();
    try {
      writeFixtureTaskLock(fixture, fixtureTaskLockMetadata("resumed-task", {
        pid: 999_999_999,
        process_start_identity: "linux-proc-start-ticks:1",
        token: "44444444-4444-4444-8444-444444444444",
      }));
      const source = readFileSync(fixture.script, "utf8");
      const seam = "const reread = inspectTaskLock(state, taskId);";
      assert(source.includes(seam), "fixture did not expose stale-lock reread seam");
      writeFileSync(
        fixture.script,
        source.replace(
          seam,
          [
            'if (process.env.CODEX_WORKSPACE_FIXTURE_LOCK_RACE === "1") {',
            '  const replacement = JSON.parse(readFileSync(taskLockPath(state, taskId), "utf8"));',
            '  replacement.token = "55555555-5555-4555-8555-555555555555";',
            '  writeFileSync(taskLockPath(state, taskId), `${JSON.stringify(replacement)}\\n`);',
            "}",
            seam,
          ].join("\n"),
        ),
      );
      runGit(fixture.root, ["add", "scripts/codex-workspace.mjs"]);
      runGit(fixture.root, ["commit", "-q", "-m", "fixture stale-lock recovery race seam"]);
      const result = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--no-verify", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: { ...fixture.env, CODEX_WORKSPACE_FIXTURE_LOCK_RACE: "1" } },
      );
      assert(result.code !== 0, "raced stale lock unexpectedly recovered");
      assert(result.stderr.includes("status=stale"), result.stderr || result.stdout);
      const replacement = JSON.parse(readFileSync(join(fixture.stateRoot, "tasks", "resumed-task.lock"), "utf8"));
      assert(replacement.token === "55555555-5555-4555-8555-555555555555", "raced lock was replaced or deleted");
      assert(!existsSync(join(fixture.stateRoot, "tasks", ".lock-history")), "raced lock was archived despite token change");
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("finish-pr without verification profile does not satisfy verification authority gate", () => {
    const fixture = createFinishPrExistingCommitFixture({ existingPr: true });
    try {
      const result = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );

      assert(result.code === 0, result.stderr || result.stdout);
      const manifest = readJson(join(fixture.stateRoot, "tasks", "resumed-task.json"));
      assert(
        manifest.pr_delivery_evidence?.verificationGate?.decision === "no-verification-profile",
        "manifest should record no verification profile",
      );
      assert(
        !manifest.pr_delivery_evidence.authorityDecision.satisfiedGates.includes(
          "configured verification command or explicitly recorded no-verify decision",
        ),
        "verification authority gate was falsely satisfied",
      );
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("verify-pr-gates records clean exact-head checks and review-thread evidence", () => {
    const fixture = createFinishPrExistingCommitFixture({ existingPr: true });
    try {
      const manifestPath = join(fixture.stateRoot, "tasks", "resumed-task.json");
      const seeded = readJson(manifestPath);
      seeded.authority_decisions = [
        {
          operation: "seeded-raw",
          authorityFamily: "delivery",
          decision: "recorded",
          allowed: true,
          recordedAt: "2026-07-02T00:00:00.000Z",
          rawPrompt: "must not persist",
          providerPayload: "must not persist",
          secret: "must not persist",
        },
        { operation: "", authorityFamily: "delivery", decision: "malformed", recordedAt: "2026-07-02T00:00:01.000Z" },
      ];
      writeFileSync(manifestPath, `${JSON.stringify(seeded, null, 2)}\n`);

      const result = runFixtureScript(
        fixture,
        [
          "verify-pr-gates",
          "resumed-task",
          "--apply",
          "--owner",
          "runner-a",
          "--delivery-audit-agent",
          "Wegener",
          "--delivery-audit-status",
          "merge-ready",
          "--delivery-audit-summary",
          "Exact-head delivery audit passed.",
          "--state-root",
          fixture.stateRoot,
        ],
        { cwd: fixture.worktree, env: fixture.env },
      );

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("APPLY: verify-pr-gates"), result.stdout || result.stderr);
      const manifest = readJson(join(fixture.stateRoot, "tasks", "resumed-task.json"));
      assert(manifest.pr_gate_evidence?.status === "passed", `gate status is ${manifest.pr_gate_evidence?.status}`);
      assert(manifest.pr_gate_evidence.lowRiskReady === true, "gate evidence did not mark low-risk ready");
      assert(manifest.pr_gate_evidence.expectedHeadSha === manifest.pr_gate_evidence.pr.headRefOid, "gate evidence did not prove exact head");
      assert(manifest.pr_gate_evidence.checks.total === 1, "gate evidence missing check rollup");
      assert(manifest.pr_gate_evidence.checks.passed.length === 1, "gate evidence did not classify passed check");
      assert(manifest.pr_gate_evidence.reviewThreads.unresolvedNonOutdatedCount === 0, "gate evidence did not prove resolved review threads");
      assert(manifest.pr_gate_evidence.deliverySubagentAudit.status === "merge-ready", "gate evidence missing delivery audit status");
      assert(manifest.delivery_subagent_audit?.agent === "Wegener", "manifest missing delivery subagent audit agent");
      assert(manifest.delivery_subagent_audit?.headSha === manifest.pr_gate_evidence.expectedHeadSha, "delivery audit must bind to exact head");
      assert(manifest.delivery_subagent_audit_checked_at === manifest.pr_gate_evidence.checkedAt, "manifest missing delivery audit freshness timestamp");
      assert(manifest.pr_gate_evidence.authorityDecision?.operation === "verify-pr-gates", "PR gate authority decision missing");
      assert(manifest.pr_gate_evidence.authorityDecision?.authorityFamily === "delivery-gate", "PR gate authority family missing");
      assert(manifest.pr_gate_evidence.authorityDecision?.allowed === true, "PR gate authority decision not allowed");
      assert(manifest.pr_review_state_checked_at === manifest.pr_gate_evidence.checkedAt, "manifest missing review-thread freshness timestamp");
      assert(manifest.pr_checks_state_checked_at === manifest.pr_gate_evidence.checkedAt, "manifest missing checks freshness timestamp");
      assert(manifest.pr_exact_head_checked_at === manifest.pr_gate_evidence.checkedAt, "manifest missing exact-head freshness timestamp");
      assert(manifest.lane_evidence_packet?.pr_gate?.status === "passed", "lane packet missing PR gate evidence");
      assert(
        manifest.lane_evidence_packet?.delivery_subagent_audit?.status === "merge-ready",
        "lane evidence packet missing delivery subagent audit",
      );
      assert(
        manifest.lane_evidence_packet?.authority_decisions?.some((entry) => entry.operation === "verify-pr-gates"),
        "lane evidence packet missing verify-pr-gates authority decision",
      );
      const serializedLanePacket = JSON.stringify(manifest.lane_evidence_packet);
      assert(!serializedLanePacket.includes("must not persist"), "lane evidence retained raw authority decision payload");
      assert(!serializedLanePacket.includes("rawPrompt"), "lane evidence retained rawPrompt key");
      assert(!serializedLanePacket.includes("providerPayload"), "lane evidence retained providerPayload key");
      assert(!serializedLanePacket.includes("secret"), "lane evidence retained secret key");
      assert(
        manifest.lane_evidence_packet.authority_decisions.every((entry) => entry.operation && entry.recordedAt && entry.decision),
        "lane evidence retained malformed authority decision",
      );
      assert(
        manifest.events.some((event) => event.type === "pr_gate_evidence_recorded"),
        "manifest missing PR gate event",
      );
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("verify-pr-gates fails closed without delivery subagent audit evidence", () => {
    const fixture = createFinishPrExistingCommitFixture({ existingPr: true });
    try {
      const result = runFixtureScript(
        fixture,
        ["verify-pr-gates", "resumed-task", "--apply", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );

      assert(result.code !== 0, "verify-pr-gates unexpectedly passed without delivery audit evidence");
      assert(result.stderr.includes("Delivery subagent audit agent missing"), result.stderr || result.stdout);
      assert(result.stderr.includes("Delivery subagent audit status missing"), result.stderr || result.stdout);
      const manifest = readJson(join(fixture.stateRoot, "tasks", "resumed-task.json"));
      assert(!manifest.pr_gate_evidence, "manifest must not record gate evidence without delivery audit");
      assert(!manifest.delivery_subagent_audit, "manifest must not record missing delivery audit evidence");
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("verify-pr-gates fails closed when delivery subagent audit is stale", () => {
    const fixture = createFinishPrExistingCommitFixture({ existingPr: true });
    try {
      const result = runFixtureScript(
        fixture,
        [
          "verify-pr-gates",
          "resumed-task",
          "--apply",
          "--owner",
          "runner-a",
          "--delivery-audit-agent",
          "Wegener",
          "--delivery-audit-status",
          "merge-ready",
          "--delivery-audit-summary",
          "Audit from an older PR head.",
          "--delivery-audit-head-sha",
          "0000000000000000000000000000000000000000",
          "--state-root",
          fixture.stateRoot,
        ],
        { cwd: fixture.worktree, env: fixture.env },
      );

      assert(result.code !== 0, "verify-pr-gates unexpectedly passed with stale delivery audit evidence");
      assert(result.stderr.includes("Delivery subagent audit head 0000000000000000000000000000000000000000"), result.stderr || result.stdout);
      const manifest = readJson(join(fixture.stateRoot, "tasks", "resumed-task.json"));
      assert(!manifest.pr_gate_evidence, "manifest must not record gate evidence with stale delivery audit");
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("verify-pr-gates fails closed on unresolved non-outdated review threads", () => {
    const fixture = createFinishPrExistingCommitFixture({
      existingPr: true,
      reviewThreads: [
        {
          id: "RT_unresolved",
          isResolved: false,
          isOutdated: false,
          comments: { nodes: [{ url: "https://example.test/pull/456#discussion_r3" }] },
        },
      ],
    });
    try {
      const result = runFixtureScript(
        fixture,
        [
          "verify-pr-gates",
          "resumed-task",
          "--apply",
          "--owner",
          "runner-a",
          "--delivery-audit-agent",
          "Wegener",
          "--delivery-audit-status",
          "merge-ready",
          "--delivery-audit-summary",
          "Exact-head delivery audit passed.",
          "--state-root",
          fixture.stateRoot,
        ],
        { cwd: fixture.worktree, env: fixture.env },
      );

      assert(result.code !== 0, "verify-pr-gates unexpectedly passed with unresolved review thread");
      assert(result.stderr.includes("Unresolved non-outdated review threads: 1"), result.stderr || result.stdout);
      const manifest = readJson(join(fixture.stateRoot, "tasks", "resumed-task.json"));
      assert(!manifest.pr_gate_evidence, "manifest must not record blocked gate evidence");
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("verify-pr-gates fails closed without positive base merge review and check evidence", () => {
    for (const scenario of [
      {
        name: "missing-base",
        options: { existingPr: true, baseRefName: null },
        expected: "PR baseRefName missing",
      },
      {
        name: "missing-merge-state",
        options: { existingPr: true, mergeStateStatus: null },
        expected: "PR mergeStateStatus missing",
      },
      {
        name: "requested-changes",
        options: { existingPr: true, reviewDecision: "CHANGES_REQUESTED" },
        expected: "PR reviewDecision is CHANGES_REQUESTED",
      },
      {
        name: "completed-without-conclusion",
        options: {
          existingPr: true,
          statusCheckRollup: [{ name: "unit", status: "COMPLETED", conclusion: null }],
        },
        expected: "Failing checks: unit",
      },
    ]) {
      const fixture = createFinishPrExistingCommitFixture(scenario.options);
      try {
        const result = runFixtureScript(
          fixture,
          [
            "verify-pr-gates",
            "resumed-task",
            "--apply",
            "--owner",
            "runner-a",
            "--delivery-audit-agent",
            "Wegener",
            "--delivery-audit-status",
            "merge-ready",
            "--delivery-audit-summary",
            "Exact-head delivery audit passed.",
            "--state-root",
            fixture.stateRoot,
          ],
          { cwd: fixture.worktree, env: fixture.env },
        );

        assert(result.code !== 0, `${scenario.name} unexpectedly passed`);
        assert(result.stderr.includes(scenario.expected), result.stderr || result.stdout);
        const manifest = readJson(join(fixture.stateRoot, "tasks", "resumed-task.json"));
        assert(!manifest.pr_gate_evidence, `${scenario.name} must not record blocked gate evidence`);
      } finally {
        cleanupFinishPrExistingCommitFixture(fixture);
      }
    }
  });

  test("verify-pr-gates fails closed on stale local head and incomplete review-thread evidence", () => {
    for (const scenario of [
      {
        name: "stale-local-head",
        mutate: (fixture) => {
          commitFile(fixture.worktree, "late-change.txt", "late\n", "late local commit");
        },
        options: { existingPr: true },
        expected: "does not match recorded delivery head",
      },
      {
        name: "graphql-errors",
        options: { existingPr: true, reviewThreadErrors: [{ message: "partial review thread timeout" }] },
        expected: "Review-thread query returned 1 GraphQL error(s)",
      },
      {
        name: "thread-pagination",
        options: { existingPr: true, reviewThreadsHasNextPage: true },
        expected: "Review-thread query returned additional pages",
      },
    ]) {
      const fixture = createFinishPrExistingCommitFixture(scenario.options);
      try {
        if (scenario.mutate) {
          scenario.mutate(fixture);
        }
        const result = runFixtureScript(
          fixture,
          [
            "verify-pr-gates",
            "resumed-task",
            "--apply",
            "--owner",
            "runner-a",
            "--delivery-audit-agent",
            "Wegener",
            "--delivery-audit-status",
            "merge-ready",
            "--delivery-audit-summary",
            "Exact-head delivery audit passed.",
            "--state-root",
            fixture.stateRoot,
          ],
          { cwd: fixture.worktree, env: fixture.env },
        );

        assert(result.code !== 0, `${scenario.name} unexpectedly passed`);
        assert(result.stderr.includes(scenario.expected), result.stderr || result.stdout);
        const manifest = readJson(join(fixture.stateRoot, "tasks", "resumed-task.json"));
        assert(!manifest.pr_gate_evidence, `${scenario.name} must not record blocked gate evidence`);
      } finally {
        cleanupFinishPrExistingCommitFixture(fixture);
      }
    }
  });

  test("finish-pr rejects unparseable PR creation output before recording delivery evidence", () => {
    const fixture = createFinishPrExistingCommitFixture({ invalidCreateOutput: true });
    try {
      const result = runFixtureScript(
        fixture,
        ["finish-pr", "resumed-task", "--no-verify", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { cwd: fixture.worktree, env: fixture.env },
      );

      assert(result.code !== 0, "finish-pr unexpectedly accepted unparseable PR output");
      assert(result.stderr.includes("Could not parse created PR URL"), result.stderr || result.stdout);
      const manifest = readJson(join(fixture.stateRoot, "tasks", "resumed-task.json"));
      assert(!manifest.pr_delivery_evidence, "manifest must not record PR delivery evidence after parse failure");
    } finally {
      cleanupFinishPrExistingCommitFixture(fixture);
    }
  });

  test("cleanup-merged can apply from inside the target worktree and delete remote branch", () => {
    const fixture = createMergedCleanupFixture();
    try {
      const manifestPath = join(fixture.stateRoot, "tasks", "cleanup-task.json");
      const seeded = readJson(manifestPath);
      seeded.pr_delivery_evidence = {
        operation: "create-pr",
        pullRequestNumber: 123,
        authorityDecision: {
          operation: "finish-pr",
          authorityFamily: "delivery",
          decision: "recorded",
          allowed: true,
          recordedAt: "2026-07-02T00:00:00.000Z",
        },
      };
      seeded.pr_gate_evidence = {
        status: "passed",
        authorityDecision: {
          operation: "verify-pr-gates",
          authorityFamily: "delivery-gate",
          decision: "passed",
          allowed: true,
          recordedAt: "2026-07-02T00:00:01.000Z",
        },
      };
      writeFileSync(manifestPath, `${JSON.stringify(seeded, null, 2)}\n`);

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
      assert(manifest.cleanup_authority_decision?.operation === "cleanup-merged-delete-remote", "cleanup authority decision missing");
      assert(manifest.cleanup_authority_decision?.authorityFamily === "cleanup", "cleanup authority family missing");
      assert(manifest.cleanup_authority_decision?.decision === "applied", "cleanup authority decision not applied");
      assert(
        manifest.lane_evidence_packet?.authority_decisions?.some((entry) => entry.operation === "cleanup-merged-delete-remote"),
        "lane evidence packet missing cleanup authority decision",
      );
      assert(manifest.lane_evidence_packet?.pr_delivery?.operation === "create-pr", "cleanup dropped PR delivery evidence");
      assert(manifest.lane_evidence_packet?.pr_gate?.status === "passed", "cleanup dropped PR gate evidence");
      assert(
        manifest.lane_evidence_packet?.delivery_subagent_audit?.status === "cleanup-ready",
        "cleanup dropped delivery subagent audit evidence",
      );
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

  test("cleanup-merged summary-json blocks missing delivery subagent audit evidence", () => {
    const fixture = createMergedCleanupFixture();
    try {
      const manifestPath = join(fixture.stateRoot, "tasks", "cleanup-task.json");
      const manifest = readJson(manifestPath);
      delete manifest.delivery_subagent_audit;
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      const result = runFixtureScript(
        fixture,
        ["cleanup-merged", "cleanup-task", "--summary-json", "--delete-remote", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { env: fixture.env },
      );
      assert(result.code === 0, result.stderr || result.stdout);
      const summary = JSON.parse(result.stdout);
      assert(summary.counts.cleanupReady === 0, `cleanupReady count is ${summary.counts.cleanupReady}`);
      const [cleanup] = summary.results;
      assert(cleanup.status === "skipped_delivery_audit_missing", `status is ${cleanup.status}`);
      assert(cleanup.reason.includes("Delivery subagent audit agent missing"), cleanup.reason);
      assert(cleanup.authorityDecision?.decision === "blocked", "cleanup audit blocker authority decision not blocked");
      assert(
        cleanup.authorityDecision?.blockedReasons?.some((reason) => reason.includes("Delivery subagent audit")),
        "cleanup audit blocker authority decision missing audit blocker",
      );
    } finally {
      cleanupMergedCleanupFixture(fixture);
    }
  });

  test("reconcile-merged-pr dry-run is read-only and reports a missing cleanup audit", () => {
    const fixture = createMergedCleanupFixture();
    try {
      const manifestPath = join(fixture.stateRoot, "tasks", "cleanup-task.json");
      const manifest = readJson(manifestPath);
      manifest.status = "pr_open";
      delete manifest.delivery_subagent_audit;
      delete manifest.pr_delivery_head_sha;
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      const before = readFileSync(manifestPath, "utf8");

      const result = runMergedCleanupFixtureScript(fixture, [
        "reconcile-merged-pr",
        "cleanup-task",
        "--summary-json",
        "--owner",
        "runner-a",
        "--state-root",
        fixture.stateRoot,
      ]);
      assert(result.code === 0, result.stderr || result.stdout);
      const packet = JSON.parse(result.stdout);
      assert(packet.ready === false, "summary unexpectedly marked reconciliation ready without an audit");
      assert(packet.status === "blocked", `status is ${packet.status}`);
      assert(packet.blockers.some((blocker) => blocker.includes("Delivery subagent audit")), JSON.stringify(packet.blockers));
      assert(readFileSync(manifestPath, "utf8") === before, "dry-run reconciliation mutated the manifest");
      assert(existsSync(fixture.worktree), "dry-run reconciliation removed the worktree");
      assert(branchExists(fixture.root, fixture.branch), "dry-run reconciliation deleted the local branch");
      assert(remoteBranchExists(fixture.root, fixture.branch), "dry-run reconciliation deleted the remote branch");
    } finally {
      cleanupMergedCleanupFixture(fixture);
    }
  });

  test("reconcile-merged-pr records only verified merged metadata and cleanup audit evidence", () => {
    const fixture = createMergedCleanupFixture();
    try {
      const manifestPath = join(fixture.stateRoot, "tasks", "cleanup-task.json");
      const manifest = readJson(manifestPath);
      manifest.status = "pr_open";
      delete manifest.delivery_subagent_audit;
      delete manifest.pr_delivery_head_sha;
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      const assignmentBefore = readFileSync(join(fixture.stateRoot, "assignments", "cleanup-assignment.json"), "utf8");
      const expectedHead = runGit(fixture.root, ["rev-parse", fixture.branch]).stdout;

      const result = runMergedCleanupFixtureScript(fixture, [
        "reconcile-merged-pr",
        "cleanup-task",
        "--apply",
        "--owner",
        "runner-a",
        "--delivery-audit-agent",
        "PostMergeAudit",
        "--delivery-audit-status",
        "cleanup-ready",
        "--delivery-audit-summary",
        "Verified merged PR metadata before separate cleanup.",
        "--delivery-audit-head-sha",
        expectedHead,
        "--state-root",
        fixture.stateRoot,
      ]);
      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("APPLY: reconcile-merged-pr"), result.stdout || result.stderr);
      const updated = readJson(manifestPath);
      assert(updated.status === "merged", `manifest status is ${updated.status}`);
      assert(updated.pr_number === 123, `PR number is ${updated.pr_number}`);
      assert(updated.pr_delivery_head_sha === expectedHead, "reconciliation did not bind the exact merged head");
      assert(updated.delivery_subagent_audit?.status === "cleanup-ready", "cleanup audit was not recorded");
      assert(updated.merged_pr_reconciliation?.ready === true, "reconciliation packet was not recorded");
      assert(updated.events.some((event) => event.type === "merged_pr_reconciled"), "merged reconciliation event missing");
      assert(updated.authority_decisions?.some((entry) => entry.operation === "reconcile-merged-pr"), "reconciliation authority decision missing");
      assert(existsSync(fixture.worktree), "reconciliation removed the worktree");
      assert(branchExists(fixture.root, fixture.branch), "reconciliation deleted the local branch");
      assert(remoteBranchExists(fixture.root, fixture.branch), "reconciliation deleted the remote branch");
      assert(readFileSync(join(fixture.stateRoot, "assignments", "cleanup-assignment.json"), "utf8") === assignmentBefore, "reconciliation mutated the assignment");
    } finally {
      cleanupMergedCleanupFixture(fixture);
    }
  });

  test("reconcile-merged-pr rejects valueless cleanup audit fields without writing reconciliation metadata", () => {
    for (const option of ["--delivery-audit-agent", "--delivery-audit-summary"]) {
      const fixture = createMergedCleanupFixture();
      try {
        const manifestPath = join(fixture.stateRoot, "tasks", "cleanup-task.json");
        const before = readFileSync(manifestPath, "utf8");
        const result = runMergedCleanupFixtureScript(fixture, [
          "reconcile-merged-pr",
          "cleanup-task",
          "--apply",
          "--owner",
          "runner-a",
          option,
          "--state-root",
          fixture.stateRoot,
        ]);

        assert(result.code !== 0, `${option} without a value unexpectedly reconciled metadata`);
        assert(result.stderr.includes(`${option} requires a non-empty value`), result.stderr || result.stdout);
        assert(readFileSync(manifestPath, "utf8") === before, `${option} without a value wrote reconciliation metadata`);
      } finally {
        cleanupMergedCleanupFixture(fixture);
      }
    }
  });

  test("reconcile-merged-pr rejects --dry-run with --apply without writing reconciliation metadata", () => {
    const fixture = createMergedCleanupFixture();
    try {
      const manifestPath = join(fixture.stateRoot, "tasks", "cleanup-task.json");
      const before = readFileSync(manifestPath, "utf8");
      const result = runMergedCleanupFixtureScript(fixture, [
        "reconcile-merged-pr",
        "cleanup-task",
        "--dry-run",
        "--apply",
        "--owner",
        "runner-a",
        "--state-root",
        fixture.stateRoot,
      ]);

      assert(result.code !== 0, "--dry-run --apply unexpectedly reconciled metadata");
      assert(result.stderr.includes("accepts either --dry-run or --apply, not both"), result.stderr || result.stdout);
      assert(readFileSync(manifestPath, "utf8") === before, "--dry-run --apply wrote reconciliation metadata");
    } finally {
      cleanupMergedCleanupFixture(fixture);
    }
  });

  test("reconcile-merged-pr rejects valued mutation switches without writing reconciliation metadata", () => {
    for (const option of ["--apply=false", "--apply=1", "--dry-run=false", "--dry-run=1"]) {
      const fixture = createMergedCleanupFixture();
      try {
        const manifestPath = join(fixture.stateRoot, "tasks", "cleanup-task.json");
        const before = readFileSync(manifestPath, "utf8");
        const result = runMergedCleanupFixtureScript(fixture, [
          "reconcile-merged-pr",
          "cleanup-task",
          option,
          "--owner",
          "runner-a",
          "--state-root",
          fixture.stateRoot,
        ]);

        assert(result.code !== 0, `${option} unexpectedly reconciled metadata`);
        assert(result.stderr.includes("must be a bare flag without a value"), result.stderr || result.stdout);
        assert(readFileSync(manifestPath, "utf8") === before, `${option} wrote reconciliation metadata`);
      } finally {
        cleanupMergedCleanupFixture(fixture);
      }
    }
  });

  test("reconcile-merged-pr rejects duplicate mutation switches that hide an earlier value without writing reconciliation metadata", () => {
    const cases = [
      ["--apply=false", "--apply"],
      ["--dry-run=false", "--dry-run"],
      ["--apply", "false"],
      ["--dry-run", "false"],
      ["--apply", ""],
      ["--dry-run", ""],
    ];
    for (const args of cases) {
      const fixture = createMergedCleanupFixture();
      try {
        const manifestPath = join(fixture.stateRoot, "tasks", "cleanup-task.json");
        const before = readFileSync(manifestPath, "utf8");
        const result = runMergedCleanupFixtureScript(fixture, [
          "reconcile-merged-pr",
          "cleanup-task",
          ...args,
          "--owner",
          "runner-a",
          "--state-root",
          fixture.stateRoot,
        ]);

        assert(result.code !== 0, `${args.join(" ")} unexpectedly reconciled metadata`);
        assert(result.stderr.includes("must be a bare flag without a value"), result.stderr || result.stdout);
        assert(readFileSync(manifestPath, "utf8") === before, `${args.join(" ")} wrote reconciliation metadata`);
      } finally {
        cleanupMergedCleanupFixture(fixture);
      }
    }
  });

  test("reconcile-merged-pr fails closed on retained delivery-head mismatch", () => {
    const fixture = createMergedCleanupFixture();
    try {
      const manifestPath = join(fixture.stateRoot, "tasks", "cleanup-task.json");
      const manifest = readJson(manifestPath);
      manifest.pr_delivery_head_sha = "0000000000000000000000000000000000000000";
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      const before = readFileSync(manifestPath, "utf8");

      const result = runMergedCleanupFixtureScript(fixture, [
        "reconcile-merged-pr",
        "cleanup-task",
        "--apply",
        "--owner",
        "runner-a",
        "--state-root",
        fixture.stateRoot,
      ]);
      assert(result.code !== 0, "reconciliation unexpectedly accepted a conflicting retained head");
      assert(result.stderr.includes("Recorded delivery head"), result.stderr || result.stdout);
      assert(readFileSync(manifestPath, "utf8") === before, "failed reconciliation mutated the manifest");
      assert(existsSync(fixture.worktree), "failed reconciliation removed the worktree");
      assert(branchExists(fixture.root, fixture.branch), "failed reconciliation deleted the local branch");
      assert(remoteBranchExists(fixture.root, fixture.branch), "failed reconciliation deleted the remote branch");
    } finally {
      cleanupMergedCleanupFixture(fixture);
    }
  });

  test("reconcile-merged-pr is owner-gated and refuses ownership takeover", () => {
    const fixture = createMergedCleanupFixture();
    try {
      const manifestPath = join(fixture.stateRoot, "tasks", "cleanup-task.json");
      const before = readFileSync(manifestPath, "utf8");
      const result = runMergedCleanupFixtureScript(fixture, [
        "reconcile-merged-pr",
        "cleanup-task",
        "--apply",
        "--owner",
        "other-runner",
        "--take-ownership",
        "--takeover-reason",
        "completed owner is idle",
        "--state-root",
        fixture.stateRoot,
      ]);
      assert(result.code !== 0, "reconciliation unexpectedly accepted ownership takeover");
      assert(result.stderr.includes("does not support --take-ownership"), result.stderr || result.stdout);
      assert(readFileSync(manifestPath, "utf8") === before, "rejected takeover mutated the manifest");
    } finally {
      cleanupMergedCleanupFixture(fixture);
    }
  });

  test("reconcile-merged-pr fails closed when the manifest has no owner", () => {
    const fixture = createMergedCleanupFixture();
    try {
      const manifestPath = join(fixture.stateRoot, "tasks", "cleanup-task.json");
      const manifest = readJson(manifestPath);
      delete manifest.owner;
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      const before = readFileSync(manifestPath, "utf8");

      const result = runMergedCleanupFixtureScript(fixture, [
        "reconcile-merged-pr",
        "cleanup-task",
        "--apply",
        "--owner",
        "runner-a",
        "--state-root",
        fixture.stateRoot,
      ]);
      assert(result.code !== 0, "ownerless reconciliation unexpectedly succeeded");
      assert(result.stderr.includes("has no recorded owner"), result.stderr || result.stdout);
      assert(readFileSync(manifestPath, "utf8") === before, "ownerless reconciliation mutated the manifest");
    } finally {
      cleanupMergedCleanupFixture(fixture);
    }
  });

  test("reconcile-merged-pr rejects recovery and authority-held manifests without overwriting their status", () => {
    for (const unsafeStatus of ["blocked_authority", "blocked_authority_delivery", "cleanup_partial", "recovery_required", "closed"]) {
      const fixture = createMergedCleanupFixture();
      try {
        const manifestPath = join(fixture.stateRoot, "tasks", "cleanup-task.json");
        const manifest = readJson(manifestPath);
        manifest.status = unsafeStatus;
        writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
        const before = readFileSync(manifestPath, "utf8");

        const result = runMergedCleanupFixtureScript(fixture, [
          "reconcile-merged-pr",
          "cleanup-task",
          "--apply",
          "--owner",
          "runner-a",
          "--state-root",
          fixture.stateRoot,
        ]);
        assert(result.code !== 0, `${unsafeStatus} reconciliation unexpectedly succeeded`);
        assert(result.stderr.includes("unsafe status"), result.stderr || result.stdout);
        const after = readJson(manifestPath);
        assert(after.status === unsafeStatus, `${unsafeStatus} was overwritten as ${after.status}`);
        assert(readFileSync(manifestPath, "utf8") === before, `${unsafeStatus} reconciliation mutated the manifest`);
      } finally {
        cleanupMergedCleanupFixture(fixture);
      }
    }
  });

  test("reconcile-merged-pr bounds oversized provider metadata in its read-only packet", () => {
    const fixture = createMergedCleanupFixture();
    try {
      const expectedHead = runGit(fixture.root, ["rev-parse", fixture.branch]).stdout;
      const oversizedUrl = `https://example.test/pull/${"x".repeat(700)}`;
      writeFixtureGhPrPayload(fixture, {
        number: 123,
        url: oversizedUrl,
        mergedAt: "2026-06-21T00:00:00Z",
        state: "MERGED",
        baseRefName: "main",
        headRefName: fixture.branch,
        headRefOid: expectedHead,
      });
      const result = runMergedCleanupFixtureScript(fixture, [
        "reconcile-merged-pr",
        "cleanup-task",
        "--summary-json",
        "--owner",
        "runner-a",
        "--state-root",
        fixture.stateRoot,
      ]);
      assert(result.code === 0, result.stderr || result.stdout);
      const packet = JSON.parse(result.stdout);
      assert(packet.ready === false, "oversized provider URL unexpectedly passed reconciliation");
      assert(packet.pr.url === null, "oversized provider URL was retained in the packet");
      assert(packet.blockers.some((blocker) => blocker.includes("Live PR URL exceeds")), JSON.stringify(packet.blockers));
      assert(!result.stdout.includes(oversizedUrl), "oversized provider URL leaked into the retained packet");
    } finally {
      cleanupMergedCleanupFixture(fixture);
    }
  });

  test("reconcile-merged-pr returns a bounded blocked summary for truthy non-object PR JSON", () => {
    const fixture = createMergedCleanupFixture();
    try {
      writeFixtureGhPrPayload(fixture, ["malformed", "PR", "payload"]);
      const result = runMergedCleanupFixtureScript(fixture, [
        "reconcile-merged-pr",
        "cleanup-task",
        "--summary-json",
        "--owner",
        "runner-a",
        "--state-root",
        fixture.stateRoot,
      ]);
      assert(result.code === 0, result.stderr || result.stdout);
      const packet = JSON.parse(result.stdout);
      assert(packet.status === "blocked", `status is ${packet.status}`);
      assert(packet.pr === null, "non-object PR payload was retained as PR metadata");
      assert(packet.blockers.some((blocker) => blocker.includes("JSON object")), JSON.stringify(packet.blockers));
      assert(!result.stdout.includes("malformed\",\"PR"), "raw malformed provider payload leaked into the summary");
    } finally {
      cleanupMergedCleanupFixture(fixture);
    }
  });

  test("reconcile-merged-pr rejects semantically invalid provider PR identity fields", () => {
    const invalidCases = [
      { name: "URL", patch: { url: "http://example.test/pull/123" } },
      { name: "base", patch: { baseRefName: "refs/heads/main" } },
      { name: "head branch", patch: { headRefName: "refs/heads/codex/cleanup-current" } },
      { name: "head object", patch: { headRefOid: "not-a-git-object" } },
      { name: "merge state", patch: { state: "OPEN" } },
      { name: "merge timestamp", patch: { mergedAt: "not-a-timestamp" } },
      { name: "impossible merge timestamp", patch: { mergedAt: "2026-02-30T00:00:00Z" } },
    ];
    for (const scenario of invalidCases) {
      const fixture = createMergedCleanupFixture();
      try {
        const branchHead = runGit(fixture.root, ["rev-parse", fixture.branch]).stdout;
        writeFixtureGhPrPayload(fixture, {
          number: 123,
          url: "https://example.test/pull/123",
          mergedAt: "2026-06-21T00:00:00Z",
          state: "MERGED",
          baseRefName: "main",
          headRefName: fixture.branch,
          headRefOid: branchHead,
          ...scenario.patch,
        });
        const result = runMergedCleanupFixtureScript(fixture, [
          "reconcile-merged-pr",
          "cleanup-task",
          "--summary-json",
          "--owner",
          "runner-a",
          "--state-root",
          fixture.stateRoot,
        ]);
        assert(result.code === 0, `${scenario.name}: ${result.stderr || result.stdout}`);
        const packet = JSON.parse(result.stdout);
        assert(packet.ready === false, `${scenario.name} provider identity unexpectedly passed`);
        assert(packet.status === "blocked", `${scenario.name} status is ${packet.status}`);
      } finally {
        cleanupMergedCleanupFixture(fixture);
      }
    }
  });

  test("cleanup-merged summary-json accepts exact-head post-merge delivery audit evidence", () => {
    const fixture = createMergedCleanupFixture();
    try {
      const manifestPath = join(fixture.stateRoot, "tasks", "cleanup-task.json");
      const manifest = readJson(manifestPath);
      delete manifest.delivery_subagent_audit;
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      const expectedHead = runGit(fixture.root, ["rev-parse", fixture.branch]).stdout;

      const result = runFixtureScript(
        fixture,
        [
          "cleanup-merged",
          "cleanup-task",
          "--summary-json",
          "--delete-remote",
          "--owner",
          "runner-a",
          "--delivery-audit-agent",
          "Bacon",
          "--delivery-audit-status",
          "cleanup-ready",
          "--delivery-audit-summary",
          "Post-merge cleanup audit passed for exact head.",
          "--delivery-audit-head-sha",
          expectedHead,
          "--take-ownership",
          "--takeover-reason",
          "merged PR cleanup after manager dispatcher lane completed",
          "--state-root",
          fixture.stateRoot,
        ],
        { env: fixture.env },
      );
      assert(result.code === 0, result.stderr || result.stdout);
      const summary = JSON.parse(result.stdout);
      assert(summary.counts.cleanupReady === 1, `cleanupReady count is ${summary.counts.cleanupReady}`);
      assert(summary.results[0].status === "ready", `status is ${summary.results[0].status}`);
      const updated = readJson(manifestPath);
      assert(!updated.delivery_subagent_audit, "summary-json must not persist cleanup audit evidence");
    } finally {
      cleanupMergedCleanupFixture(fixture);
    }
  });

  test("cleanup-merged apply blocks assignment owner mismatch before deleting resources", () => {
    const fixture = createMergedCleanupFixture();
    try {
      const manifestPath = join(fixture.stateRoot, "tasks", "cleanup-task.json");
      const manifest = readJson(manifestPath);
      delete manifest.delivery_subagent_audit;
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      const assignmentPath = join(fixture.stateRoot, "assignments", "cleanup-assignment.json");
      const assignment = readJson(assignmentPath);
      assignment.owner = "manager-20260706-001/dispatcher";
      writeFileSync(assignmentPath, `${JSON.stringify(assignment, null, 2)}\n`);
      const expectedHead = runGit(fixture.root, ["rev-parse", fixture.branch]).stdout;

      const result = runFixtureScript(
        fixture,
        [
          "cleanup-merged",
          "cleanup-task",
          "--apply",
          "--delete-remote",
          "--owner",
          "runner-a",
          "--delivery-audit-agent",
          "Bacon",
          "--delivery-audit-status",
          "cleanup-ready",
          "--delivery-audit-summary",
          "Post-merge cleanup audit passed for exact head.",
          "--delivery-audit-head-sha",
          expectedHead,
          "--state-root",
          fixture.stateRoot,
        ],
        { env: fixture.env },
      );
      assert(result.code !== 0, "cleanup unexpectedly applied without assignment takeover");
      assert(result.stderr.includes("Assignment cleanup-assignment is owned by manager-20260706-001/dispatcher"), result.stderr || result.stdout);
      assert(existsSync(fixture.worktree), "cleanup removed worktree before assignment preflight");
      assert(branchExists(fixture.root, fixture.branch), "cleanup deleted local branch before assignment preflight");
      assert(remoteBranchExists(fixture.root, fixture.branch), "cleanup deleted remote branch before assignment preflight");
      const updated = readJson(manifestPath);
      assert(updated.status === "cleanup_partial", `manifest status is ${updated.status}`);
      assert(!updated.worktree_removed_at, "manifest recorded worktree removal before assignment preflight");
      assert(!updated.local_branch_deleted_at, "manifest recorded local branch deletion before assignment preflight");
      assert(!updated.remote_branch_deleted_at, "manifest recorded remote branch deletion before assignment preflight");
    } finally {
      cleanupMergedCleanupFixture(fixture);
    }
  });

  test("cleanup-merged apply records post-merge cleanup audit evidence before cleanup", () => {
    const fixture = createMergedCleanupFixture();
    try {
      const manifestPath = join(fixture.stateRoot, "tasks", "cleanup-task.json");
      const manifest = readJson(manifestPath);
      delete manifest.delivery_subagent_audit;
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      const assignmentPath = join(fixture.stateRoot, "assignments", "cleanup-assignment.json");
      const assignment = readJson(assignmentPath);
      assignment.owner = "manager-20260706-001/dispatcher";
      writeFileSync(assignmentPath, `${JSON.stringify(assignment, null, 2)}\n`);
      const expectedHead = runGit(fixture.root, ["rev-parse", fixture.branch]).stdout;

      const result = runFixtureScript(
        fixture,
        [
          "cleanup-merged",
          "cleanup-task",
          "--apply",
          "--delete-remote",
          "--owner",
          "runner-a",
          "--delivery-audit-agent",
          "Bacon",
          "--delivery-audit-status",
          "cleanup-ready",
          "--delivery-audit-summary",
          "Post-merge cleanup audit passed for exact head.",
          "--delivery-audit-head-sha",
          expectedHead,
          "--take-ownership",
          "--takeover-reason",
          "merged PR cleanup after manager dispatcher lane completed",
          "--state-root",
          fixture.stateRoot,
        ],
        { env: fixture.env },
      );
      assert(result.code === 0, result.stderr || result.stdout);
      const updated = readJson(manifestPath);
      assert(updated.status === "closed", `manifest status is ${updated.status}`);
      assert(updated.delivery_subagent_audit?.status === "cleanup-ready", "manifest missing cleanup-ready audit");
      assert(updated.delivery_subagent_audit?.agent === "Bacon", "manifest missing cleanup audit agent");
      assert(updated.delivery_subagent_audit?.headSha === expectedHead, "cleanup audit must bind to exact head");
      assert(
        updated.lane_evidence_packet?.delivery_subagent_audit?.status === "cleanup-ready",
        "lane packet missing cleanup audit evidence",
      );
      assert(
        updated.events.some((event) => event.type === "cleanup_delivery_audit_revalidated"),
        "manifest missing cleanup audit revalidation event",
      );
      const closedAssignment = readJson(assignmentPath);
      assert(closedAssignment.status === "closed", `assignment status is ${closedAssignment.status}`);
      assert(closedAssignment.owner === "runner-a", `assignment owner is ${closedAssignment.owner}`);
      assert(
        closedAssignment.events.some((event) => event.type === "cleanup_takeover_applied"),
        "assignment missing cleanup takeover event",
      );
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
      assert(cleanup.authorityDecision?.operation === "cleanup-merged-delete-remote", "summary missing cleanup authority operation");
      assert(cleanup.authorityDecision?.authorityFamily === "cleanup", "summary missing cleanup authority family");
      assert(cleanup.authorityDecision?.decision === "ready_for_apply", "summary cleanup authority decision not ready");
      assert(cleanup.authorityDecision?.metadataOnly === true, "summary cleanup authority decision is not metadata-only");
      assert(
        !cleanup.authorityDecision.satisfiedGates.includes("cleanup mutation requires --apply"),
        "summary authority decision falsely satisfied apply gate",
      );
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
      const expectedHead = runGit(fixture.root, ["rev-parse", fixture.branch]).stdout;
      manifest.status = "cleanup_partial";
      manifest.cleanup_error = "simulated prior failure after worktree removal";
      manifest.cleanup_started_at = new Date().toISOString();
      manifest.cleanup_branch = fixture.branch;
      manifest.cleanup_expected_head_sha = expectedHead;
      manifest.cleanup_local_branch_sha = expectedHead;
      manifest.cleanup_target_evidence = {
        checkedAt: new Date().toISOString(),
        worktree: { required: true, path: fixture.worktree, state: "absent", exists: false, listed: false },
        localBranch: { required: true, branch: fixture.branch, state: "present", sha: expectedHead, error: null },
        remoteBranch: { required: true, branch: fixture.branch, state: "present", sha: expectedHead, error: null },
      };
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

  test("cleanup-merged rejects an absent worktree without its exact partial-cleanup journal", () => {
    const fixture = createMergedCleanupFixture();
    try {
      runGit(fixture.root, ["worktree", "remove", fixture.worktree]);
      const manifestPath = join(fixture.stateRoot, "tasks", "cleanup-task.json");
      const manifest = readJson(manifestPath);
      manifest.status = "cleanup_partial";
      manifest.cleanup_error = "unproven absent target";
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      const result = runFixtureScript(
        fixture,
        ["cleanup-merged", "cleanup-task", "--apply", "--delete-remote", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { env: fixture.env },
      );
      assert(result.code !== 0, "unproven absent merged target unexpectedly resumed");
      assert(result.stderr.includes("absent worktree target requires an exact cleanup_partial journal"), result.stderr || result.stdout);
      assert(branchExists(fixture.root, fixture.branch), "unproven absent target deleted the local branch");
      assert(remoteBranchExists(fixture.root, fixture.branch), "unproven absent target deleted the remote branch");
    } finally {
      cleanupMergedCleanupFixture(fixture);
    }
  });

  test("cleanup-merged keeps remote deletion failure partial with target evidence, then resumes", () => {
    const fixture = createMergedCleanupFixture();
    try {
      const fakeGit = installFixtureGitProxy(
        fixture,
        `args[0] === 'push' && args.includes(':refs/heads/${fixture.branch}')`,
        "simulated remote deletion failure",
      );

      const failed = runMergedCleanupFixtureScript(fixture, [
        "cleanup-current",
        "--apply",
        "--delete-remote",
        "--owner",
        "runner-a",
        "--state-root",
        fixture.stateRoot,
      ]);
      assert(failed.code !== 0, "cleanup unexpectedly closed after remote deletion failure");
      assert(failed.stderr.includes("simulated remote deletion failure"), failed.stderr || failed.stdout);
      assert(!existsSync(fixture.worktree), "worktree should be removed before simulated remote failure");
      assert(!branchExists(fixture.root, fixture.branch), "local branch should be removed before simulated remote failure");
      assert(remoteBranchExists(fixture.root, fixture.branch), "remote branch should remain after simulated remote failure");

      const manifestPath = join(fixture.stateRoot, "tasks", "cleanup-task.json");
      const partial = readJson(manifestPath);
      assert(partial.status === "cleanup_partial", `manifest status is ${partial.status}`);
      assert(!partial.cleanup_completed_at, "partial cleanup must not have a completion timestamp");
      assert(partial.cleanup_target_evidence?.worktree?.state === "absent", "partial evidence must record removed worktree");
      assert(partial.cleanup_target_evidence?.localBranch?.state === "absent", "partial evidence must record removed local branch");
      assert(partial.cleanup_target_evidence?.remoteBranch?.state === "present", "partial evidence must record remaining remote branch");
      assert(partial.cleanup_target_evidence?.remoteBranch?.sha, "partial remote evidence must retain the current target SHA");
      assert(
        partial.events.some((event) => event.type === "cleanup_targets_checked" && event.message.includes("remote_branch:present")),
        "partial cleanup must preserve target-specific remote evidence",
      );

      rmSync(fakeGit, { force: true });
      const resumed = runFixtureScript(
        fixture,
        ["cleanup-merged", "cleanup-task", "--apply", "--delete-remote", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { env: fixture.env },
      );
      assert(resumed.code === 0, resumed.stderr || resumed.stdout);
      assert(!remoteBranchExists(fixture.root, fixture.branch), "cleanup resume did not delete the remaining remote branch");
      const closed = readJson(manifestPath);
      assert(closed.status === "closed", `manifest status is ${closed.status}`);
      assert(closed.cleanup_error === null, `cleanup_error not cleared: ${closed.cleanup_error}`);
      assert(closed.cleanup_completed_at, "resumed cleanup missing completion timestamp");
      assert(closed.cleanup_target_evidence?.worktree?.state === "absent", "closed cleanup must prove worktree absence");
      assert(closed.cleanup_target_evidence?.localBranch?.state === "absent", "closed cleanup must prove local branch absence");
      assert(closed.cleanup_target_evidence?.remoteBranch?.state === "absent", "closed cleanup must prove remote branch absence");
    } finally {
      cleanupMergedCleanupFixture(fixture);
    }
  });

  test("cleanup-merged refuses remote target downgrade on partial resume", () => {
    const fixture = createMergedCleanupFixture();
    try {
      const fakeGit = installFixtureGitProxy(
        fixture,
        `args[0] === 'push' && args.includes(':refs/heads/${fixture.branch}')`,
        "simulated remote deletion failure",
      );
      const firstAttempt = runMergedCleanupFixtureScript(fixture, [
        "cleanup-current",
        "--apply",
        "--delete-remote",
        "--owner",
        "runner-a",
        "--state-root",
        fixture.stateRoot,
      ]);
      assert(firstAttempt.code !== 0, "initial remote cleanup failure was not simulated");
      rmSync(fakeGit, { force: true });

      const downgradedResume = runFixtureScript(
        fixture,
        ["cleanup-merged", "cleanup-task", "--apply", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { env: fixture.env },
      );
      assert(downgradedResume.code !== 0, "cleanup closed after dropping --delete-remote");
      assert(downgradedResume.stderr.includes("requires --delete-remote"), downgradedResume.stderr || downgradedResume.stdout);
      assert(!existsSync(fixture.worktree), "downgraded resume unexpectedly restored or removed a worktree");
      assert(!branchExists(fixture.root, fixture.branch), "downgraded resume recreated or deleted the local branch");
      assert(remoteBranchExists(fixture.root, fixture.branch), "downgraded resume deleted the registered remote branch");

      const partial = readJson(join(fixture.stateRoot, "tasks", "cleanup-task.json"));
      assert(partial.status === "cleanup_partial", `manifest status is ${partial.status}`);
      assert(!partial.cleanup_completed_at, "downgraded resume must not record completion");
      assert(partial.cleanup_target_evidence?.remoteBranch?.required === true, "registered remote target requirement was downgraded");
      assert(partial.cleanup_target_evidence?.remoteBranch?.deleteRequested === false, "evidence must record the omitted resume flag");
      assert(partial.cleanup_target_evidence?.remoteBranch?.state === "present", "registered remote target evidence must remain present");
    } finally {
      cleanupMergedCleanupFixture(fixture);
    }
  });

  test("cleanup-merged records advanced remote target evidence before exact-head resume refusal", () => {
    const fixture = createMergedCleanupFixture();
    try {
      const fakeGit = installFixtureGitProxy(
        fixture,
        `args[0] === 'push' && args.includes(':refs/heads/${fixture.branch}')`,
        "simulated remote deletion failure",
      );
      const firstAttempt = runMergedCleanupFixtureScript(fixture, [
        "cleanup-current",
        "--apply",
        "--delete-remote",
        "--owner",
        "runner-a",
        "--state-root",
        fixture.stateRoot,
      ]);
      assert(firstAttempt.code !== 0, "initial cleanup unexpectedly closed");
      rmSync(fakeGit, { force: true });

      const advanceWorktree = join(fixture.root, "remote-advance");
      runGit(fixture.root, ["clone", "-q", fixture.remoteRoot, advanceWorktree]);
      runGit(advanceWorktree, ["config", "user.email", "codex-workspace-test@example.com"]);
      runGit(advanceWorktree, ["config", "user.name", "Codex Workspace Test"]);
      runGit(advanceWorktree, ["checkout", "-q", "-b", fixture.branch, `origin/${fixture.branch}`]);
      commitFile(advanceWorktree, "advanced-remote.txt", "advanced\n", "advance remote cleanup branch");
      runGit(advanceWorktree, ["push", "-q", "origin", fixture.branch]);
      const advancedRemoteSha = runGit(advanceWorktree, ["rev-parse", "HEAD"]).stdout;

      const resumed = runFixtureScript(
        fixture,
        ["cleanup-merged", "cleanup-task", "--apply", "--delete-remote", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { env: fixture.env },
      );
      assert(resumed.code !== 0, "advanced remote cleanup unexpectedly closed");
      assert(resumed.stderr.includes("does not match expected cleanup head"), resumed.stderr || resumed.stdout);
      assert(remoteBranchExists(fixture.root, fixture.branch), "advanced remote branch was deleted after exact-head refusal");

      const partial = readJson(join(fixture.stateRoot, "tasks", "cleanup-task.json"));
      assert(partial.status === "cleanup_partial", `manifest status is ${partial.status}`);
      assert(!partial.cleanup_completed_at, "mismatched resume must not record cleanup completion");
      assert(partial.cleanup_target_evidence?.worktree?.state === "absent", "resume evidence must retain absent worktree");
      assert(partial.cleanup_target_evidence?.localBranch?.state === "absent", "resume evidence must retain absent local branch");
      assert(partial.cleanup_target_evidence?.remoteBranch?.state === "present", "resume evidence must show remaining remote branch");
      assert(partial.cleanup_target_evidence?.remoteBranch?.sha === advancedRemoteSha, "resume evidence must show current remote SHA");
    } finally {
      cleanupMergedCleanupFixture(fixture);
    }
  });

  test("cleanup-merged blocks local branch inspection failure before resource deletion", () => {
    const fixture = createMergedCleanupFixture();
    try {
      const fakeGit = installFixtureGitProxy(
        fixture,
        `args[0] === 'rev-parse' && args.includes('${fixture.branch}')`,
        "simulated local branch inspection failure",
      );
      const result = runMergedCleanupFixtureScript(fixture, [
        "cleanup-current",
        "--apply",
        "--delete-remote",
        "--owner",
        "runner-a",
        "--state-root",
        fixture.stateRoot,
      ]);
      assert(result.code !== 0, "cleanup unexpectedly proceeded after local branch inspection failure");
      assert(result.stderr.includes("registered target inspection is unknown: local_branch"), result.stderr || result.stdout);
      assert(existsSync(fixture.worktree), "cleanup removed worktree after local inspection failure");
      assert(branchExists(fixture.root, fixture.branch), "cleanup deleted local branch after local inspection failure");
      assert(remoteBranchExists(fixture.root, fixture.branch), "cleanup deleted remote branch after local inspection failure");

      const partial = readJson(join(fixture.stateRoot, "tasks", "cleanup-task.json"));
      assert(partial.status === "cleanup_partial", `manifest status is ${partial.status}`);
      assert(partial.cleanup_target_evidence?.worktree?.state === "present", "partial evidence must retain worktree presence");
      assert(partial.cleanup_target_evidence?.localBranch?.state === "unknown", "partial evidence must retain local inspection failure");
      assert(partial.cleanup_target_evidence?.remoteBranch?.state === "present", "partial evidence must retain remote branch presence");
      rmSync(fakeGit, { force: true });
    } finally {
      cleanupMergedCleanupFixture(fixture);
    }
  });

  test("cleanup-merged records targets before missing exact-head evidence blocks cleanup", () => {
    const fixture = createMergedCleanupFixture();
    try {
      const manifestPath = join(fixture.stateRoot, "tasks", "cleanup-task.json");
      const manifest = readJson(manifestPath);
      manifest.pr_delivery_head_sha = null;
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      writeFixtureGhPrView(fixture, null);

      const result = runMergedCleanupFixtureScript(fixture, [
        "cleanup-current",
        "--apply",
        "--delete-remote",
        "--owner",
        "runner-a",
        "--state-root",
        fixture.stateRoot,
      ]);
      assert(result.code !== 0, "cleanup unexpectedly proceeded without exact-head evidence");
      assert(result.stderr.includes("Cleanup requires exact PR head evidence"), result.stderr || result.stdout);
      assert(existsSync(fixture.worktree), "cleanup removed worktree without exact-head evidence");
      assert(branchExists(fixture.root, fixture.branch), "cleanup deleted local branch without exact-head evidence");
      assert(remoteBranchExists(fixture.root, fixture.branch), "cleanup deleted remote branch without exact-head evidence");

      const partial = readJson(manifestPath);
      assert(partial.status === "cleanup_partial", `manifest status is ${partial.status}`);
      assert(!partial.cleanup_completed_at, "missing-head cleanup must not record completion");
      assert(partial.cleanup_target_evidence?.worktree?.state === "present", "missing-head evidence must record worktree presence");
      assert(partial.cleanup_target_evidence?.localBranch?.state === "present", "missing-head evidence must record local branch presence");
      assert(partial.cleanup_target_evidence?.remoteBranch?.state === "present", "missing-head evidence must record remote branch presence");
    } finally {
      cleanupMergedCleanupFixture(fixture);
    }
  });

  test("cleanup-merged records targets when the locked delivery-audit hold blocks cleanup", () => {
    const fixture = createMergedCleanupFixture();
    try {
      const manifestPath = join(fixture.stateRoot, "tasks", "cleanup-task.json");
      const manifest = readJson(manifestPath);
      delete manifest.delivery_subagent_audit;
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      const result = runMergedCleanupFixtureScript(fixture, [
        "cleanup-current",
        "--apply",
        "--delete-remote",
        "--owner",
        "runner-a",
        "--state-root",
        fixture.stateRoot,
      ]);
      assert(result.code !== 0, "cleanup unexpectedly proceeded without delivery audit evidence");
      assert(result.stderr.includes("Delivery subagent audit"), result.stderr || result.stdout);
      assert(existsSync(fixture.worktree), "cleanup removed worktree before locked audit hold");
      assert(branchExists(fixture.root, fixture.branch), "cleanup deleted local branch before locked audit hold");
      assert(remoteBranchExists(fixture.root, fixture.branch), "cleanup deleted remote branch before locked audit hold");

      const partial = readJson(manifestPath);
      assert(partial.status === "cleanup_partial", `manifest status is ${partial.status}`);
      assert(!partial.cleanup_completed_at, "audit-held cleanup must not record completion");
      assert(partial.cleanup_target_evidence?.worktree?.state === "present", "audit-held evidence must record worktree presence");
      assert(partial.cleanup_target_evidence?.localBranch?.state === "present", "audit-held evidence must record local branch presence");
      assert(partial.cleanup_target_evidence?.remoteBranch?.state === "present", "audit-held evidence must record remote branch presence");
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
      assert(manifest.cleanup_authority_decision?.decision !== "applied", "failed cleanup must not retain applied cleanup authority");
    } finally {
      cleanupMergedCleanupFixture(fixture);
    }
  });

  test("cleanup-merged summary-json blocks stale branch-head authority evidence", () => {
    const fixture = createMergedCleanupFixture();
    try {
      runGit(fixture.worktree, ["switch", "-q", fixture.branch]);
      commitFile(fixture.worktree, "advanced.txt", "advanced\n", "advanced branch after pr");
      runGit(fixture.worktree, ["push", "-q", "origin", fixture.branch]);

      const result = runFixtureScript(
        fixture,
        ["cleanup-merged", "cleanup-task", "--summary-json", "--delete-remote", "--owner", "runner-a", "--state-root", fixture.stateRoot],
        { env: fixture.env },
      );
      assert(result.code === 0, result.stderr || result.stdout);
      const summary = JSON.parse(result.stdout);
      assert(summary.counts.cleanupReady === 0, `cleanupReady count is ${summary.counts.cleanupReady}`);
      const [cleanup] = summary.results;
      assert(cleanup.status === "skipped_head_mismatch", `status is ${cleanup.status}`);
      assert(cleanup.authorityDecision?.decision === "blocked", "cleanup mismatch authority decision not blocked");
      assert(cleanup.authorityDecision?.allowed === false, "cleanup mismatch authority decision allowed unexpectedly");
      assert(
        cleanup.authorityDecision?.blockedReasons?.some((reason) => reason.includes("does not match expected cleanup head")),
        "cleanup mismatch authority decision missing branch-head blocker",
      );
      assert(branchExists(fixture.root, fixture.branch), "summary deleted local branch after head mismatch");
      assert(remoteBranchExists(fixture.root, fixture.branch), "summary deleted remote branch after head mismatch");
    } finally {
      cleanupMergedCleanupFixture(fixture);
    }
  });

  test("cleanup-integrated source keeps no-PR cleanup stricter than branch cleanup", () => {
    const source = readFileSync(scriptPath, "utf8");
    const match = source.match(/function cleanupIntegrated[\s\S]*?function cleanupRepositoryRoot/);
    assert(match, "cleanupIntegrated source not found");
    assert(match[0].includes("merge-base"), "cleanup-integrated must require ancestry against the base ref");
    assert(match[0].includes("worktreeCleanupStatus"), "cleanup-integrated must inspect worktree cleanliness");
    assert(match[0].includes("manifest.pr_url || manifest.pr_number"), "cleanup-integrated must reject PR-backed workspaces");
    assert(match[0].includes("deleteLocalBranchIfPresent"), "cleanup-integrated must use exact-head local branch deletion");
    assert(!match[0].includes("deleteRemoteBranchIfPresent"), "cleanup-integrated must not delete remote branches");
  });

  test("cleanup-integrated summary-json reports clean integrated no-PR workspaces without mutation", () => {
    const fixture = createIntegratedCleanupFixture();
    try {
      const result = runFixtureScript(
        fixture,
        ["cleanup-integrated", "integrated-task", "--summary-json", "--base", "origin/main", "--owner", "runner-a", "--state-root", fixture.stateRoot],
      );
      assert(result.code === 0, result.stderr || result.stdout);
      const summary = JSON.parse(result.stdout);
      assert(summary.mode === "cleanup-integrated", `mode is ${summary.mode}`);
      assert(summary.baseRef === "origin/main", `baseRef is ${summary.baseRef}`);
      assert(summary.counts.total === 1, `total is ${summary.counts.total}`);
      assert(summary.counts.cleanupReady === 1, `cleanupReady is ${summary.counts.cleanupReady}`);
      assert(summary.remoteBranchPolicy.includes("not deleted"), result.stdout || result.stderr);
      const [cleanup] = summary.results;
      assert(cleanup.status === "ready", `status is ${cleanup.status}`);
      assert(cleanup.reason.includes("clean no-PR workspace"), cleanup.reason);
      assert(cleanup.expectedHeadSha, "summary missing expected head");
      assert(cleanup.remoteBranchSha, "summary should report remote tracking branch");
      assert(cleanup.plan === undefined, "cleanup-integrated summary should not include oversized plan payloads");

      assert(existsSync(fixture.worktree), "summary unexpectedly removed target worktree");
      assert(branchExists(fixture.root, fixture.branch), "summary unexpectedly deleted local branch");
      assert(remoteBranchExists(fixture.root, fixture.branch), "summary unexpectedly deleted remote branch");
      const manifest = readJson(join(fixture.stateRoot, "tasks", "integrated-task.json"));
      assert(manifest.status === "active", `manifest status is ${manifest.status}`);
    } finally {
      cleanupIntegratedCleanupFixture(fixture);
    }
  });

  test("cleanup-integrated applies only clean no-PR branches already integrated into base", () => {
    const fixture = createIntegratedCleanupFixture();
    try {
      const result = runFixtureScript(
        fixture,
        ["cleanup-integrated", "integrated-task", "--apply", "--base", "origin/main", "--owner", "runner-a", "--state-root", fixture.stateRoot],
      );
      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("Closed integrated-task"), result.stdout || result.stderr);
      assert(!existsSync(fixture.worktree), "cleanup-integrated did not remove target worktree");
      assert(!branchExists(fixture.root, fixture.branch), "cleanup-integrated did not delete local branch");
      assert(remoteBranchExists(fixture.root, fixture.branch), "cleanup-integrated deleted the remote branch");
      const manifest = readJson(join(fixture.stateRoot, "tasks", "integrated-task.json"));
      assert(manifest.status === "closed", `manifest status is ${manifest.status}`);
      assert(manifest.cleanup_base_ref === "origin/main", `cleanup_base_ref is ${manifest.cleanup_base_ref}`);
      assert(manifest.cleanup_remote_branch_policy === "not-deleted-no-pr-integrated-cleanup", "manifest missing remote branch policy");
      assert(manifest.worktree_removed_at, "manifest missing worktree removal timestamp");
      assert(manifest.local_branch_deleted_at, "manifest missing local branch deletion timestamp");
      assert(manifest.cleanup_completed_at, "manifest missing cleanup completion timestamp");
      assert(manifest.source_assignment_closed_at, "manifest missing source assignment closure timestamp");
      const assignment = readJson(join(fixture.stateRoot, "assignments", "integrated-assignment.json"));
      assert(assignment.status === "closed", `assignment status is ${assignment.status}`);
      assert(assignment.last_result === "closed after integrated cleanup of integrated-task", `assignment last_result is ${assignment.last_result}`);
    } finally {
      cleanupIntegratedCleanupFixture(fixture);
    }
  });

  test("cleanup-integrated closes an assignment after an approved owner takeover", () => {
    const fixture = createIntegratedCleanupFixture({
      manifestOwner: "runner-a",
      assignmentOwner: "runner-b",
    });
    try {
      const result = runFixtureScript(
        fixture,
        [
          "cleanup-integrated",
          "integrated-task",
          "--apply",
          "--base",
          "origin/main",
          "--owner",
          "runner-a",
          "--take-ownership",
          "--takeover-reason",
          "operator approved cleanup takeover for stale assignment",
          "--state-root",
          fixture.stateRoot,
        ],
      );
      assert(result.code === 0, result.stderr || result.stdout);
      assert(!existsSync(fixture.worktree), "takeover cleanup did not remove target worktree");
      assert(!branchExists(fixture.root, fixture.branch), "takeover cleanup did not delete local branch");
      const manifest = readJson(join(fixture.stateRoot, "tasks", "integrated-task.json"));
      const assignment = readJson(join(fixture.stateRoot, "assignments", "integrated-assignment.json"));
      assert(manifest.status === "closed", `manifest status is ${manifest.status}`);
      assert(assignment.status === "closed", `assignment status is ${assignment.status}`);
      assert(assignment.owner === "runner-a", `assignment owner is ${assignment.owner}`);
      assert(assignment.events.some((event) => event.type === "cleanup_takeover_applied"), "assignment takeover event missing");
      assert(manifest.source_assignment_closed_at === assignment.closed_at, "assignment closure timestamp missing from manifest");
    } finally {
      cleanupIntegratedCleanupFixture(fixture);
    }
  });

  test("cleanup-integrated refuses dirty no-PR worktrees", () => {
    const fixture = createIntegratedCleanupFixture();
    try {
      writeFileSync(join(fixture.worktree, "dirty.txt"), "dirty\n");
      const result = runFixtureScript(
        fixture,
        ["cleanup-integrated", "integrated-task", "--apply", "--base", "origin/main", "--owner", "runner-a", "--state-root", fixture.stateRoot],
      );
      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("SKIP integrated-task: worktree is not clean"), result.stdout || result.stderr);
      assert(existsSync(fixture.worktree), "dirty worktree was removed");
      assert(branchExists(fixture.root, fixture.branch), "dirty worktree branch was deleted");
      const manifest = readJson(join(fixture.stateRoot, "tasks", "integrated-task.json"));
      assert(manifest.status === "active", `manifest status is ${manifest.status}`);
    } finally {
      cleanupIntegratedCleanupFixture(fixture);
    }
  });

  test("cleanup-integrated refuses branches not integrated into base", () => {
    const fixture = createIntegratedCleanupFixture({ diverged: true });
    try {
      const result = runFixtureScript(
        fixture,
        ["cleanup-integrated", "integrated-task", "--apply", "--base", "origin/main", "--owner", "runner-a", "--state-root", fixture.stateRoot],
      );
      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("branch is not an ancestor of origin/main"), result.stdout || result.stderr);
      assert(existsSync(fixture.worktree), "non-integrated worktree was removed");
      assert(branchExists(fixture.root, fixture.branch), "non-integrated branch was deleted");
      const manifest = readJson(join(fixture.stateRoot, "tasks", "integrated-task.json"));
      assert(manifest.status === "active", `manifest status is ${manifest.status}`);
    } finally {
      cleanupIntegratedCleanupFixture(fixture);
    }
  });

  test("cleanup-integrated exact-tree closeout previews only the named local Tailnet persistence lane", () => {
    const fixture = createIntegratedCleanupFixture({
      taskId: "20260723-tailnet-authenticated-dashboard-persistence-and",
      baseBranch: "dev",
      remoteBranch: false,
    });
    try {
      const result = runFixtureScript(
        fixture,
        [...exactTreeCloseoutArgs(fixture), "--summary-json"],
      );
      assert(result.code === 0, result.stderr || result.stdout);
      const summary = JSON.parse(result.stdout);
      assert(summary.mode === "cleanup-integrated", `mode is ${summary.mode}`);
      assert(summary.counts.cleanupReady === 1, result.stdout || result.stderr);
      const [cleanup] = summary.results;
      assert(cleanup.status === "ready", cleanup.reason);
      assert(cleanup.exactTreeCloseout === true, "strict closeout marker is missing");
      assert(cleanup.proof.tree.status === "matched", "exact tree equality was not proven");
      assert(cleanup.proof.originDev.status === "matched", "live origin/dev freshness was not proven");
      assert(cleanup.proof.originDev.localSha === cleanup.proof.originDev.liveSha, "live origin/dev does not equal the local tracking ref");
      assert(cleanup.proof.remoteBranch.state === "absent", "source remote absence was not proven");
      assert(cleanup.proof.githubNoPr.status === "matched", "live GitHub no-PR proof was not proven");
      assert(cleanup.proof.assignmentCloseout.status === "ready", "linked assignment closeout was not preflighted");
      assert(cleanup.proof.assignmentCloseout.dryRunCommand.includes("close-assignments --ids integrated-assignment --summary-json"), "assignment closeout dry-run was not explicit");
      assert(cleanup.proof.evidence.status === "matched", "closeout evidence was not accepted");
      assert(cleanup.remoteBranchSha === null, "strict closeout must not retain a source remote branch");
      assert(!JSON.stringify(cleanup).includes("git push"), "strict closeout summary must not plan remote mutation");
      assert(existsSync(fixture.worktree), "preview removed the exact lane worktree");
      assert(branchExists(fixture.root, fixture.branch), "preview deleted the exact lane local branch");
    } finally {
      cleanupIntegratedCleanupFixture(fixture);
    }
  });

  test("cleanup-integrated exact-tree closeout fails closed for tree, worktree, remote, and PR evidence gates", () => {
    const scenarios = [
      {
        name: "tree drift",
        mutate(fixture) {
          commitFile(fixture.worktree, "drift.txt", "drift\n", "tree drift");
        },
        expected: "tree does not exactly equal origin/dev",
      },
      {
        name: "dirty worktree",
        mutate(fixture) {
          writeFileSync(join(fixture.worktree, "dirty.txt"), "dirty\n");
        },
        expected: "worktree is not clean",
      },
      {
        name: "present remote branch",
        fixtureOptions: { remoteBranch: true },
        expected: "source remote branch is present",
      },
      {
        name: "unavailable remote probe",
        mutate(fixture) {
          runGit(fixture.root, ["remote", "set-url", "origin", join(fixture.root, "missing-origin.git")]);
        },
        expected: "source remote branch evidence is unavailable",
      },
      {
        name: "unavailable live origin/dev probe",
        mutate(fixture) {
          installFixtureGitProxy(
            fixture,
            "args[0] === 'ls-remote' && args[1] === '--heads' && args[2] === 'origin' && args[3] === 'dev'",
            "simulated live origin/dev probe interruption",
          );
        },
        expected: "live origin/dev proof is unavailable",
      },
      {
        name: "stale local origin/dev",
        mutate(fixture) {
          const localOriginDev = runGit(fixture.root, ["rev-parse", "origin/dev"]).stdout;
          commitFile(fixture.root, "live-dev-drift.txt", "live dev drift\n", "advance live dev only");
          runGit(fixture.root, ["push", "-q", "origin", "HEAD:refs/heads/dev"]);
          runGit(fixture.root, ["update-ref", "refs/remotes/origin/dev", localOriginDev]);
        },
        expected: "live origin/dev differs from local origin/dev",
      },
      {
        name: "PR evidence",
        mutate(fixture) {
          const manifestPath = join(fixture.stateRoot, "tasks", `${fixture.taskId}.json`);
          const manifest = readJson(manifestPath);
          manifest.pr_url = "https://example.test/pull/1";
          writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
        },
        expected: "source workspace has PR or cleanup evidence",
      },
      {
        name: "live GitHub PR evidence",
        fixtureOptions: { prListJson: JSON.stringify([{ number: 99, state: "CLOSED", mergedAt: null, headRefName: "codex/integrated-cleanup", headRefOid: "0123456789012345678901234567890123456789" }]) },
        expected: "live GitHub no-PR proof found PR evidence",
      },
      {
        name: "malformed live GitHub response",
        fixtureOptions: { prListJson: JSON.stringify([{ number: 99, state: "CLOSED", mergedAt: null, headRefName: null, headRefOid: "0123456789012345678901234567890123456789" }]) },
        expected: "live GitHub no-PR proof is unavailable",
      },
    ];
    for (const scenario of scenarios) {
      const fixture = createIntegratedCleanupFixture({
        taskId: "20260723-tailnet-authenticated-dashboard-persistence-and",
        baseBranch: "dev",
        remoteBranch: false,
        ...scenario.fixtureOptions,
      });
      try {
        scenario.mutate?.(fixture);
        const result = runFixtureScript(fixture, [...exactTreeCloseoutArgs(fixture), "--summary-json"]);
        assert(result.code === 0, `${scenario.name}: ${result.stderr || result.stdout}`);
        const [cleanup] = JSON.parse(result.stdout).results;
        assert(cleanup.status === "skipped", `${scenario.name}: ${cleanup.status}`);
        assert(cleanup.reason.includes(scenario.expected), `${scenario.name}: ${cleanup.reason}`);
        assert(existsSync(fixture.worktree), `${scenario.name}: worktree was removed`);
        assert(branchExists(fixture.root, fixture.branch), `${scenario.name}: local branch was deleted`);
      } finally {
        cleanupIntegratedCleanupFixture(fixture);
      }
    }
  });

  test("cleanup-integrated exact-tree closeout selects the manifest by exact task_id only", () => {
    const fixture = createIntegratedCleanupFixture({
      taskId: "20260723-tailnet-authenticated-dashboard-persistence-and",
      baseBranch: "dev",
      remoteBranch: false,
    });
    try {
      const manifestPath = join(fixture.stateRoot, "tasks", `${fixture.taskId}.json`);
      const manifest = readJson(manifestPath);
      manifest.task_id = "different-task-id";
      manifest.title = fixture.taskId;
      manifest.description = `title-shaped decoy for ${fixture.taskId}`;
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      const result = runFixtureScript(fixture, [...exactTreeCloseoutArgs(fixture), "--summary-json"]);
      assert(result.code !== 0, "strict closeout accepted a title-shaped manifest decoy");
      assert(result.stderr.includes("requires a manifest whose task_id exactly equals"), result.stderr || result.stdout);
      assert(existsSync(fixture.worktree), "strict task-id selection removed the decoy worktree");
      assert(branchExists(fixture.root, fixture.branch), "strict task-id selection deleted the decoy branch");
    } finally {
      cleanupIntegratedCleanupFixture(fixture);
    }
  });

  test("cleanup-integrated exact-tree closeout journals before local deletion, re-probes remote absence, and closes the linked assignment under lock", () => {
    const fixture = createIntegratedCleanupFixture({
      taskId: "20260723-tailnet-authenticated-dashboard-persistence-and",
      baseBranch: "dev",
      remoteBranch: false,
    });
    try {
      const result = runFixtureScript(fixture, [...exactTreeCloseoutArgs(fixture), "--apply"]);
      assert(result.code === 0, result.stderr || result.stdout);
      assert(!existsSync(fixture.worktree), "strict closeout left the worktree behind");
      assert(!branchExists(fixture.root, fixture.branch), "strict closeout left the local branch behind");
      assert(!remoteBranchExists(fixture.root, fixture.branch), "strict closeout created or mutated the absent remote branch");
      const manifest = readJson(join(fixture.stateRoot, "tasks", `${fixture.taskId}.json`));
      const assignment = readJson(join(fixture.stateRoot, "assignments", "integrated-assignment.json"));
      assert(manifest.status === "closed", `manifest status is ${manifest.status}`);
      assert(manifest.supersession_closeout_evidence?.originDev?.status === "matched", "initial live origin/dev proof was not retained");
      assert(manifest.supersession_closeout_evidence?.finalOriginDev?.status === "matched", "final live origin/dev proof was not retained");
      assert(manifest.supersession_closeout_evidence?.githubNoPr?.status === "matched", "live GitHub proof was not retained as metadata");
      assert(manifest.supersession_closeout_evidence?.finalRemoteAbsence?.state === "absent", "final remote absence re-probe was not retained");
      assert(manifest.supersession_closeout_evidence?.finalGithubNoPr?.status === "matched", "final live GitHub no-PR proof was not retained");
      assert(manifest.events.some((event) => event.type === "cleanup_journal_started"), "strict cleanup journal was not persisted");
      assert(manifest.events.some((event) => event.type === "assignment_closeout_planned"), "assignment closeout plan was not retained");
      assert(manifest.supersession_closeout_evidence?.assignmentCloseout?.status === "closed", "locked assignment closure was not persisted before local deletion");
      assert(manifest.events.some((event) => event.type === "source_remote_absent_revalidated"), "final remote absence re-probe event was not retained");
      assert(assignment.status === "closed", `assignment status is ${assignment.status}`);
      assert(assignment.events.some((event) => event.type === "closed" && event.message.includes("locked exact-tree closeout")), "linked assignment was not closed by the locked explicit closeout action");
    } finally {
      cleanupIntegratedCleanupFixture(fixture);
    }
  });

  test("cleanup-integrated exact-tree closeout fails closed when a PR appears after the initial live proof", () => {
    const prEvidence = { number: 100, state: "OPEN", mergedAt: null, headRefName: "codex/integrated-cleanup", headRefOid: "0123456789012345678901234567890123456789" };
    const fixture = createIntegratedCleanupFixture({
      taskId: "20260723-tailnet-authenticated-dashboard-persistence-and",
      baseBranch: "dev",
      remoteBranch: false,
      prListSequence: [[], [], [prEvidence]],
    });
    try {
      const result = runFixtureScript(fixture, [...exactTreeCloseoutArgs(fixture), "--apply"]);
      assert(result.code !== 0, "strict closeout closed after a post-initial-proof PR appeared");
      assert(result.stderr.includes("final live GitHub no-PR proof failed"), result.stderr || result.stdout);
      assert(!existsSync(fixture.worktree), "final GitHub proof race unexpectedly rewound local worktree deletion");
      assert(!branchExists(fixture.root, fixture.branch), "final GitHub proof race unexpectedly rewound local branch deletion");
      const manifest = readJson(join(fixture.stateRoot, "tasks", `${fixture.taskId}.json`));
      assert(manifest.status === "cleanup_partial", `manifest status is ${manifest.status}`);
      assert(manifest.supersession_closeout_evidence?.finalRemoteAbsence?.state === "absent", "final remote absence was not retained before the final GitHub proof");
      assert(manifest.supersession_closeout_evidence?.finalGithubNoPr?.status === "mismatch", "post-initial PR evidence was not retained as a metadata mismatch");
      assert(manifest.supersession_closeout_evidence?.finalGithubNoPr?.count === 1, "post-initial PR metadata count is incorrect");
      assert(manifest.supersession_closeout_evidence?.finalGithubNoPr?.rawPayloadRetained === false, "post-initial PR proof retained raw provider output");
      assert(manifest.events.some((event) => event.type === "source_github_no_pr_revalidated"), "final GitHub revalidation event was not recorded");
      assert(!manifest.events.some((event) => event.type === "closed"), "strict closeout recorded closed after final GitHub proof failed");
    } finally {
      cleanupIntegratedCleanupFixture(fixture);
    }
  });

  test("cleanup-integrated exact-tree closeout leaves a resumable journal when local deletion or the final remote re-probe fails", () => {
    const scenarios = [
      {
        name: "local worktree removal",
        install(fixture) {
          return installFixtureGitProxy(
            fixture,
            `args[0] === 'worktree' && args[1] === 'remove' && args[2] === ${JSON.stringify(fixture.worktree)}`,
            "simulated strict local worktree removal interruption",
          );
        },
        expected: "simulated strict local worktree removal interruption",
      },
      {
        name: "local branch deletion",
        install(fixture) {
          return installFixtureGitProxy(
            fixture,
            `args[0] === 'update-ref' && args[1] === '-d' && args[2] === 'refs/heads/${fixture.branch}'`,
            "simulated strict local branch deletion interruption",
          );
        },
        expected: "simulated strict local branch deletion interruption",
        resumes: true,
      },
      {
        name: "final remote absence re-probe",
        install(fixture) {
          const baseHead = runGit(fixture.root, ["rev-parse", "origin/dev"]).stdout;
          return installFixtureGitPostSuccessHook(
            fixture,
            `args[0] === 'update-ref' && args[1] === '-d' && args[2] === 'refs/heads/${fixture.branch}'`,
            ["push", "-q", "origin", `${baseHead}:refs/heads/${fixture.branch}`],
          );
        },
        expected: "final source remote absence re-probe found",
      },
    ];
    for (const scenario of scenarios) {
      const fixture = createIntegratedCleanupFixture({
        taskId: "20260723-tailnet-authenticated-dashboard-persistence-and",
        baseBranch: "dev",
        remoteBranch: false,
      });
      let fakeGit = null;
      try {
        fakeGit = scenario.install(fixture);
        const result = runFixtureScript(fixture, [...exactTreeCloseoutArgs(fixture), "--apply"]);
        assert(result.code !== 0, `${scenario.name} unexpectedly closed strict cleanup`);
        const manifest = readJson(join(fixture.stateRoot, "tasks", `${fixture.taskId}.json`));
        const assignment = readJson(join(fixture.stateRoot, "assignments", "integrated-assignment.json"));
        assert(manifest.status === "cleanup_partial", `${scenario.name} status is ${manifest.status}`);
        assert(manifest.supersession_closeout_evidence?.mode === "exact-tree-closeout/v1", `${scenario.name} lost exact-tree journal evidence`);
        assert(manifest.events.some((event) => event.type === "cleanup_journal_started"), `${scenario.name} did not persist the journal before mutation`);
        assert(manifest.cleanup_error.includes(scenario.expected), `${scenario.name} error is ${manifest.cleanup_error}`);
        assert(assignment.status === "closed", `${scenario.name} did not complete the locked assignment closeout before local deletion`);
        assert(manifest.supersession_closeout_evidence?.assignmentCloseout?.status === "closed", `${scenario.name} did not persist the pre-deletion assignment closure`);
        if (scenario.resumes) {
          const closedAssignmentEvidence = manifest.supersession_closeout_evidence?.assignmentCloseout;
          rmSync(fakeGit, { force: true });
          fakeGit = null;
          const resumed = runFixtureScript(fixture, [...exactTreeCloseoutArgs(fixture), "--apply"]);
          assert(resumed.code === 0, `${scenario.name} did not resume safely: ${resumed.stderr || resumed.stdout}`);
          const closedManifest = readJson(join(fixture.stateRoot, "tasks", `${fixture.taskId}.json`));
          assert(closedManifest.status === "closed", `${scenario.name} did not close after resume`);
          assert(closedManifest.supersession_closeout_evidence?.assignmentCloseout?.status === "closed", `${scenario.name} overwrote closed assignment audit status on resume`);
          assert(closedManifest.supersession_closeout_evidence?.assignmentCloseout?.closedAt === closedAssignmentEvidence?.closedAt, `${scenario.name} overwrote the assignment closed timestamp on resume`);
        }
      } finally {
        if (fakeGit) rmSync(fakeGit, { force: true });
        cleanupIntegratedCleanupFixture(fixture);
      }
    }
  });

  test("cleanup-integrated exact-tree closeout rejects an absent worktree without its exact partial journal", () => {
    const fixture = createIntegratedCleanupFixture({
      taskId: "20260723-tailnet-authenticated-dashboard-persistence-and",
      baseBranch: "dev",
      remoteBranch: false,
    });
    try {
      runGit(fixture.root, ["worktree", "remove", fixture.worktree]);
      const manifestPath = join(fixture.stateRoot, "tasks", `${fixture.taskId}.json`);
      const manifest = readJson(manifestPath);
      manifest.status = "cleanup_partial";
      manifest.cleanup_error = "unproven exact-tree interruption";
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      const result = runFixtureScript(fixture, [...exactTreeCloseoutArgs(fixture), "--summary-json"]);
      assert(result.code !== 0, "unproven absent strict target unexpectedly planned");
      assert(result.stderr.includes("absent worktree target requires an exact cleanup_partial journal"), result.stderr || result.stdout);
      assert(branchExists(fixture.root, fixture.branch), "unproven absent strict target deleted its local branch");
    } finally {
      cleanupIntegratedCleanupFixture(fixture);
    }
  });

  test("cleanup-integrated exact-tree closeout rejects missing evidence and unsafe invocation before planning", () => {
    const fixture = createIntegratedCleanupFixture({
      taskId: "20260723-tailnet-authenticated-dashboard-persistence-and",
      baseBranch: "dev",
      remoteBranch: false,
    });
    try {
      const missingEvidence = runFixtureScript(fixture, [
        "cleanup-integrated",
        fixture.taskId,
        "--exact-tree-closeout",
        "--base",
        "origin/dev",
        "--closeout-reason",
        "operator approved exact local closeout after supersession",
        "--summary-json",
        "--owner",
        "runner-a",
        "--state-root",
        fixture.stateRoot,
      ]);
      assert(missingEvidence.code !== 0, "missing provenance unexpectedly planned strict cleanup");
      assert(missingEvidence.stderr.includes("--supersession-provenance"), missingEvidence.stderr || missingEvidence.stdout);

      const nonCanonicalBase = runFixtureScript(fixture, [...exactTreeCloseoutArgs(fixture), "--base", "origin/main", "--summary-json"]);
      assert(nonCanonicalBase.code !== 0, "noncanonical base unexpectedly planned strict cleanup");
      assert(nonCanonicalBase.stderr.includes("--base origin/dev"), nonCanonicalBase.stderr || nonCanonicalBase.stdout);

      const broadInvocation = runFixtureScript(fixture, [
        "cleanup-integrated",
        "--exact-tree-closeout",
        "--base",
        "origin/dev",
        "--supersession-provenance",
        "Tailnet persistence source is exactly retained by origin/dev",
        "--closeout-reason",
        "operator approved exact local closeout after supersession",
        "--summary-json",
        "--owner",
        "runner-a",
        "--state-root",
        fixture.stateRoot,
      ]);
      assert(broadInvocation.code !== 0, "broad strict cleanup invocation unexpectedly planned");
      assert(broadInvocation.stderr.includes("exactly one explicit task"), broadInvocation.stderr || broadInvocation.stdout);
    } finally {
      cleanupIntegratedCleanupFixture(fixture);
    }
  });

  test("cleanup-superseded source keeps a separate, fail-closed supersession proof path", () => {
    const source = readFileSync(scriptPath, "utf8");
    const match = source.match(/function cleanupSuperseded[\s\S]*?function cleanupRepositoryRoot/);
    assert(match, "cleanupSuperseded source not found");
    for (const expected of [
      "sourceHead",
      "carryForwardPr",
      "carryForwardCommit",
      "compareScopedTreeEntries",
      "withAssignmentsIndexLock",
      "withManifestLock",
      "const freshPlan = cleanupSupersededPlan",
      "supersession proof changed under lock",
      "removeWorktreeIfPresent",
      "deleteLocalBranchIfPresent",
      "remote branches are retained",
    ]) {
      assert(match[0].includes(expected), `cleanup-superseded missing ${expected}`);
    }
    assert(!match[0].includes("deleteRemoteBranchIfPresent"), "cleanup-superseded must retain remote branches");
  });

  test("cleanup-superseded previews and applies only an exact merged carry-forward tree proof", () => {
    const fixture = createSupersededCleanupFixture();
    const args = [
      "cleanup-superseded",
      "superseded-task",
      "--source-head",
      fixture.sourceHead,
      "--carry-forward-pr",
      "456",
      "--carry-forward-commit",
      fixture.carryForwardCommit,
      "--scope",
      "carried.txt",
      "--owner",
      "runner-a",
      "--state-root",
      fixture.stateRoot,
    ];
    try {
      const preview = runFixtureScript(fixture, [...args, "--summary-json"], { env: fixture.env });
      assert(preview.code === 0, preview.stderr || preview.stdout);
      const summary = JSON.parse(preview.stdout);
      assert(summary.mode === "cleanup-superseded", `mode is ${summary.mode}`);
      assert(summary.counts.cleanupReady === 1, preview.stdout || preview.stderr);
      assert(summary.remoteBranchPolicy.includes("retained"), summary.remoteBranchPolicy);
      assert(summary.results[0].proof.carryForward.baseRefOidSource === "gh-pr-view", preview.stdout || preview.stderr);
      assert(summary.results[0].proof.scope.status === "matched", preview.stdout || preview.stderr);
      assert(existsSync(fixture.worktree), "preview unexpectedly removed source worktree");
      assert(branchExists(fixture.root, fixture.branch), "preview unexpectedly deleted source branch");

      const applied = runFixtureScript(fixture, [
        ...args,
        "--apply",
        "--approval",
        "operator approved source lane supersession cleanup",
        "--reason",
        "merged carry-forward proof reviewed and approved",
      ], { env: fixture.env });
      assert(applied.code === 0, applied.stderr || applied.stdout);
      assert(!existsSync(fixture.worktree), "apply did not remove source worktree");
      assert(!branchExists(fixture.root, fixture.branch), "apply did not delete source local branch");
      assert(remoteBranchExists(fixture.root, fixture.branch), "apply deleted retained source remote branch");
      const manifest = readJson(join(fixture.stateRoot, "tasks", "superseded-task.json"));
      const assignment = readJson(join(fixture.stateRoot, "assignments", "superseded-assignment.json"));
      assert(manifest.status === "closed", `manifest status is ${manifest.status}`);
      assert(manifest.cleanup_supersession_evidence?.proof?.scope?.status === "matched", "manifest missing scoped proof");
      assert(manifest.cleanup_remote_branch_policy === "retained-superseded-cleanup", "manifest missing remote retention policy");
      assert(manifest.cleanup_supersession_rollback?.includes(fixture.sourceHead), "manifest missing rollback source head");
      assert(assignment.status === "closed", `assignment status is ${assignment.status}`);
    } finally {
      cleanupSupersededCleanupFixture(fixture);
    }
  });

  test("cleanup-superseded falls back to a validated GraphQL base head only when gh rejects baseRefOid", () => {
    const fixture = createSupersededCleanupFixture({ unsupportedBaseRefOid: true, fallbackBaseDriftOnSecondLookup: true });
    const args = supersededCleanupArgs(fixture);
    try {
      const preview = runFixtureScript(fixture, [...args, "--summary-json"], { env: fixture.env });
      assert(preview.code === 0, preview.stderr || preview.stdout);
      const summary = JSON.parse(preview.stdout);
      assert(summary.counts.cleanupReady === 1, preview.stdout || preview.stderr);
      assert(summary.results[0].proof.carryForward.baseRefOidSource === "gh-api-graphql", preview.stdout || preview.stderr);
      assert(existsSync(fixture.worktree), "GraphQL fallback preview unexpectedly removed source worktree");
      assert(branchExists(fixture.root, fixture.branch), "GraphQL fallback preview unexpectedly deleted source branch");
      rmSync(join(fixture.root, "fallback-base-lookup-count"), { force: true });

      const applied = runFixtureScript(fixture, [
        ...args,
        "--apply",
        "--approval",
        "operator approved source lane supersession cleanup",
        "--reason",
        "merged carry-forward proof reviewed and approved",
      ], { env: fixture.env });
      assert(applied.code !== 0, applied.stderr || applied.stdout);
      assert(applied.stderr.includes("supersession proof changed under lock"), applied.stderr || applied.stdout);
      assert(existsSync(fixture.worktree), "apply skipped GraphQL fallback re-proof before deleting source worktree");
      assert(branchExists(fixture.root, fixture.branch), "apply skipped GraphQL fallback re-proof before deleting source branch");
    } finally {
      cleanupSupersededCleanupFixture(fixture);
    }
  });

  test("cleanup-superseded admits only the explicit first-use legacy repair proof", () => {
    const fixture = createSupersededCleanupFixture({ firstUseRepair: true });
    const args = legacyFirstUseSupersededArgs(fixture);
    try {
      const preview = runFixtureScript(fixture, [...args, "--summary-json"], { env: fixture.env });
      assert(preview.code === 0, preview.stderr || preview.stdout);
      const summary = JSON.parse(preview.stdout);
      const plan = summary.results[0];
      assert(summary.counts.cleanupReady === 1, preview.stdout || preview.stderr);
      assert(plan.proof.source.remoteBranchHead === null, preview.stdout || preview.stderr);
      assert(plan.proof.source.expectedRemoteState === "absent", preview.stdout || preview.stderr);
      assert(plan.proof.assignment.mode === "legacy-unassigned", preview.stdout || preview.stderr);
      assert(plan.proof.repair.status === "matched", preview.stdout || preview.stderr);
      assert(plan.proof.currentBase.canonicalRef === "origin/dev", preview.stdout || preview.stderr);
      assert(plan.proof.repair.hardeningProof.changedPaths.join(",") === "hardened.txt", preview.stdout || preview.stderr);
      assert(existsSync(fixture.worktree), "preview removed legacy source worktree");
      assert(branchExists(fixture.root, fixture.branch), "preview removed legacy source branch");
      assert(!remoteBranchExists(fixture.root, fixture.branch), "fixture source remote must remain absent");

      const humanPreview = runFixtureScript(fixture, args, { env: fixture.env });
      assert(humanPreview.code === 0, humanPreview.stderr || humanPreview.stdout);
      assert(humanPreview.stdout.includes("was verified absent; do not create or mutate it"), humanPreview.stdout);
      assert(humanPreview.stdout.includes("no source assignment exists to close"), humanPreview.stdout);

      const applied = runFixtureScript(fixture, [
        ...args,
        "--apply",
        "--approval",
        "operator approved audited first-use legacy cleanup",
        "--reason",
        "bounded merged successor and hardening proof reviewed",
      ], { env: fixture.env });
      assert(applied.code === 0, applied.stderr || applied.stdout);
      const manifest = readJson(join(fixture.stateRoot, "tasks", "superseded-task.json"));
      assert(manifest.status === "closed", `legacy first-use manifest status is ${manifest.status}`);
      assert(manifest.cleanup_remote_branch_policy === "absent-first-use-superseded-cleanup", manifest.cleanup_remote_branch_policy);
      assert(manifest.cleanup_source_remote_absent === "absent", manifest.cleanup_source_remote_absent);
      assert(manifest.cleanup_supersession_rollback.includes("was verified absent and remains untouched"), manifest.cleanup_supersession_rollback);
      assert(!existsSync(fixture.worktree), "apply retained legacy source worktree");
      assert(!branchExists(fixture.root, fixture.branch), "apply retained legacy source local branch");
      assert(!remoteBranchExists(fixture.root, fixture.branch), "apply created or mutated absent source remote");
    } finally {
      cleanupSupersededCleanupFixture(fixture);
    }
  });

  test("cleanup-superseded first-use repair requires carry-forward base evidence to match current canonical dev", () => {
    const scenarios = [
      { name: "direct exact base OID", options: { firstUseRepair: true }, source: "gh-pr-view", ready: true },
      { name: "direct mismatched base OID", options: { firstUseRepair: true, reportedBaseRefOid: "SOURCE_HEAD" }, source: "gh-pr-view", ready: false },
      { name: "direct unsafe base OID", options: { firstUseRepair: true, reportedBaseRefOid: "--no-verify" }, source: "gh-pr-view", ready: false, reason: "base head is missing or is not an exact Git object id", unsafeId: "--no-verify" },
      { name: "direct incomplete source scope", options: { firstUseRepair: true, extraSourceDelta: true }, source: "gh-pr-view", ready: false, reason: "bounded scope does not cover every source-lane tree delta" },
      { name: "GraphQL fallback exact base OID", options: { firstUseRepair: true, unsupportedBaseRefOid: true }, source: "gh-api-graphql", ready: true },
      { name: "GraphQL fallback mismatched base OID", options: { firstUseRepair: true, unsupportedBaseRefOid: true, fallbackBaseRefOid: "SOURCE_HEAD" }, source: "gh-api-graphql", ready: false },
      { name: "GraphQL fallback unsafe base OID", options: { firstUseRepair: true, unsupportedBaseRefOid: true, fallbackBaseRefOid: "--no-verify" }, source: "gh-api-graphql", ready: false, reason: "omitted an exact Git object id", unsafeId: "--no-verify" },
    ];
    for (const scenario of scenarios) {
      const fixture = createSupersededCleanupFixture(scenario.options);
      try {
        const result = runFixtureScript(fixture, [...legacyFirstUseSupersededArgs(fixture), "--summary-json"], { env: fixture.env });
        assert(result.code === 0, `${scenario.name}: ${result.stderr || result.stdout}`);
        const summary = JSON.parse(result.stdout);
        const plan = summary.results[0];
        assert(plan.proof.carryForward.baseRefOidSource === scenario.source, `${scenario.name}: ${result.stdout}`);
        if (scenario.ready) {
          assert(summary.counts.cleanupReady === 1, `${scenario.name}: ${result.stdout}`);
          assert(plan.proof.currentBase.headSha === fixture.currentBaseHead, `${scenario.name}: ${result.stdout}`);
          assert(plan.proof.carryForward.baseRefOid === fixture.currentBaseHead, `${scenario.name}: ${result.stdout}`);
        } else {
          assert(summary.counts.cleanupReady === 0, `${scenario.name} unexpectedly became cleanup-ready: ${result.stdout}`);
          assert(plan.status === "blocked", `${scenario.name} was not blocked: ${result.stdout}`);
          assert(plan.proof.carryForward.baseRefOid === undefined, `${scenario.name}: blocked proof retained a base OID`);
          assert(plan.reason.includes(scenario.reason || "current canonical base head does not exactly match GitHub carry-forward PR base evidence"), `${scenario.name}: ${plan.reason}`);
          if (scenario.unsafeId) assert(!result.stdout.includes(scenario.unsafeId), `${scenario.name}: unsafe base OID leaked into proof output`);
        }
        assert(existsSync(fixture.worktree), `${scenario.name} removed source worktree during preview`);
        assert(branchExists(fixture.root, fixture.branch), `${scenario.name} deleted source branch during preview`);
        assert(!remoteBranchExists(fixture.root, fixture.branch), `${scenario.name} created or mutated absent source remote`);
      } finally {
        cleanupSupersededCleanupFixture(fixture);
      }
    }
  });

  test("cleanup-superseded denies missing, malformed, conflicting, and drifted GraphQL base proof before mutation", () => {
    const cases = [
      { name: "missing base oid", options: { unsupportedBaseRefOid: true, fallbackBaseRefOid: null }, expected: "omitted an exact Git object id" },
      { name: "malformed base oid", options: { unsupportedBaseRefOid: true, fallbackBaseRefOid: "not-a-git-object" }, expected: "omitted an exact Git object id" },
      { name: "GraphQL error", options: { unsupportedBaseRefOid: true, fallbackGraphqlErrors: [{ message: "ambiguous result" }] }, expected: "returned 1 error(s)" },
      { name: "malformed GraphQL errors", options: { unsupportedBaseRefOid: true, fallbackGraphqlErrors: "ambiguous result" }, expected: "returned a malformed errors field" },
      { name: "conflicting PR", options: { unsupportedBaseRefOid: true, fallbackPrNumber: 457 }, expected: "did not return the exact requested PR" },
      { name: "numeric-string PR", options: { unsupportedBaseRefOid: true, fallbackPrNumber: "456" }, expected: "did not return the exact requested PR" },
      { name: "coercible malformed PR", options: { unsupportedBaseRefOid: true, fallbackPrNumber: "0x1c8" }, expected: "did not return the exact requested PR" },
      { name: "base drift", options: { unsupportedBaseRefOid: true, fallbackBaseRefOid: "SOURCE_HEAD" }, expected: "current canonical base head does not exactly match" },
    ];
    for (const scenario of cases) {
      const fixture = createSupersededCleanupFixture(scenario.options);
      try {
        const result = runFixtureScript(fixture, [...supersededCleanupArgs(fixture), "--summary-json"], { env: fixture.env });
        assert(result.code === 0, `${scenario.name}: ${result.stderr || result.stdout}`);
        const summary = JSON.parse(result.stdout);
        assert(summary.counts.cleanupReady === 0, `${scenario.name} unexpectedly became cleanup-ready: ${result.stdout}`);
        assert(summary.results[0].reason.includes(scenario.expected), `${scenario.name}: ${summary.results[0].reason}`);
        assert(existsSync(fixture.worktree), `${scenario.name} removed source worktree`);
        assert(branchExists(fixture.root, fixture.branch), `${scenario.name} deleted source branch`);
      } finally {
        cleanupSupersededCleanupFixture(fixture);
      }
    }
  });

  test("cleanup-superseded rejects a legacy PR view for a different PR before GraphQL fallback metadata is combined", () => {
    const cases = [
      {
        name: "different PR",
        options: { unsupportedBaseRefOid: true, legacyPrNumber: 457 },
        expected: "legacy carry-forward PR view did not return the exact requested positive safe integer PR number",
      },
      {
        name: "invalid JSON",
        options: { unsupportedBaseRefOid: true, legacyInvalidJson: true },
        expected: "legacy carry-forward PR view returned invalid JSON",
      },
    ];
    for (const scenario of cases) {
      const fixture = createSupersededCleanupFixture(scenario.options);
      try {
        const result = runFixtureScript(fixture, [...supersededCleanupArgs(fixture), "--summary-json"], { env: fixture.env });
        assert(result.code === 0, `${scenario.name}: ${result.stderr || result.stdout}`);
        const summary = JSON.parse(result.stdout);
        assert(summary.counts.cleanupReady === 0, `${scenario.name}: ${result.stdout}`);
        assert(summary.results[0].reason.includes(scenario.expected), `${scenario.name}: ${summary.results[0].reason}`);
        assert(summary.results[0].proof.carryForward.baseRefOid === undefined, `${scenario.name}: carry-forward summary unexpectedly exposed a base oid`);
        assert(summary.results[0].proof.carryForward.baseRefOidError === scenario.expected, `${scenario.name}: ${result.stdout}`);
        assert(!existsSync(join(fixture.root, "fallback-base-lookup-count")), `${scenario.name} still queried GraphQL fallback metadata`);
        assert(existsSync(fixture.worktree), `${scenario.name} removed source worktree`);
        assert(branchExists(fixture.root, fixture.branch), `${scenario.name} deleted source branch`);
      } finally {
        cleanupSupersededCleanupFixture(fixture);
      }
    }
  });

  test("cleanup-superseded rejects malformed modern PR-view identities before accepting base metadata or mutation", () => {
    const cases = [
      { name: "mismatched number", modernPrNumber: 457 },
      { name: "numeric string", modernPrNumber: "456" },
      { name: "coercible hex", modernPrNumber: "0x1c8" },
      { name: "invalid JSON", modernInvalidJson: true },
    ];
    for (const scenario of cases) {
      const fixture = createSupersededCleanupFixture(scenario);
      try {
        const result = runFixtureScript(fixture, [...supersededCleanupArgs(fixture), "--summary-json"], { env: fixture.env });
        assert(result.code === 0, `${scenario.name}: ${result.stderr || result.stdout}`);
        const summary = JSON.parse(result.stdout);
        assert(summary.counts.cleanupReady === 0, `${scenario.name} unexpectedly became cleanup-ready: ${result.stdout}`);
        const expected = scenario.modernInvalidJson
          ? "carry-forward PR view returned invalid JSON"
          : "carry-forward PR view did not return the exact requested positive safe integer PR number";
        assert(summary.results[0].reason.includes(expected), `${scenario.name}: ${summary.results[0].reason}`);
        assert(summary.results[0].proof.carryForward.baseRefOidError === expected, `${scenario.name}: ${result.stdout}`);
        assert(existsSync(fixture.worktree), `${scenario.name} removed source worktree`);
        assert(branchExists(fixture.root, fixture.branch), `${scenario.name} deleted source branch`);
        assert(remoteBranchExists(fixture.root, fixture.branch), `${scenario.name} deleted retained remote branch`);
      } finally {
        cleanupSupersededCleanupFixture(fixture);
      }
    }
  });

  test("cleanup-superseded blocks untrusted carry-forward lineage IDs before Git proof or mutation", () => {
    const cases = [
      { name: "symbolic head", options: { reportedHeadRefOid: "HEAD" }, invalidField: "headRefOid", unsafeId: "HEAD" },
      { name: "option-like head", options: { reportedHeadRefOid: "--help" }, invalidField: "headRefOid", unsafeId: "--help" },
      { name: "short malformed head", options: { reportedHeadRefOid: "a".repeat(39) }, invalidField: "headRefOid", unsafeId: "a".repeat(39) },
      { name: "symbolic merge", options: { reportedMergeCommitOid: "HEAD" }, invalidField: "mergeCommit.oid", unsafeId: "HEAD" },
      { name: "option-like merge", options: { reportedMergeCommitOid: "--no-verify" }, invalidField: "mergeCommit.oid", unsafeId: "--no-verify" },
      { name: "short malformed merge", options: { reportedMergeCommitOid: "b".repeat(39) }, invalidField: "mergeCommit.oid", unsafeId: "b".repeat(39) },
      { name: "legacy fallback head", options: { unsupportedBaseRefOid: true, reportedHeadRefOid: "HEAD" }, invalidField: "headRefOid", unsafeId: "HEAD", noGraphqlFallback: true },
      { name: "first-use repair merge", options: { firstUseRepair: true, reportedMergeCommitOid: "--no-verify" }, invalidField: "mergeCommit.oid", unsafeId: "--no-verify", firstUseRepair: true },
    ];
    for (const scenario of cases) {
      const fixture = createSupersededCleanupFixture(scenario.options);
      const fakeGit = installFixtureGitProxy(
        fixture,
        `args.some((argument) => String(argument).includes(${JSON.stringify(scenario.unsafeId)}))`,
        "unsafe PR lineage id reached Git",
      );
      try {
        const args = scenario.firstUseRepair ? legacyFirstUseSupersededArgs(fixture) : supersededCleanupArgs(fixture);
        const result = runFixtureScript(fixture, [...args, "--summary-json"], { env: fixture.env });
        assert(result.code === 0, `${scenario.name}: ${result.stderr || result.stdout}`);
        const summary = JSON.parse(result.stdout);
        const plan = summary.results[0];
        assert(summary.counts.cleanupReady === 0, `${scenario.name} unexpectedly became cleanup-ready: ${result.stdout}`);
        assert(plan.status === "blocked", `${scenario.name} was not blocked: ${result.stdout}`);
        assert(plan.reason.includes(scenario.invalidField), `${scenario.name}: ${plan.reason}`);
        assert(plan.proof.carryForward.lineageError === plan.reason, `${scenario.name}: ${result.stdout}`);
        assert(!result.stdout.includes(scenario.unsafeId), `${scenario.name} retained the raw unsafe lineage id: ${result.stdout}`);
        assert(existsSync(fixture.worktree), `${scenario.name} removed source worktree`);
        assert(branchExists(fixture.root, fixture.branch), `${scenario.name} deleted source local branch`);
        if (scenario.firstUseRepair) {
          assert(!remoteBranchExists(fixture.root, fixture.branch), `${scenario.name} mutated absent source remote`);
        } else {
          assert(remoteBranchExists(fixture.root, fixture.branch), `${scenario.name} deleted retained source remote branch`);
        }
        if (scenario.noGraphqlFallback) {
          assert(!existsSync(join(fixture.root, "fallback-base-lookup-count")), `${scenario.name} unexpectedly queried GraphQL base fallback`);
        }
      } finally {
        rmSync(fakeGit, { force: true });
        cleanupSupersededCleanupFixture(fixture);
      }
    }
  });

  test("cleanup-superseded first-use repair blocks missing declarations, remote uncertainty, and unbounded hardening", () => {
    const cases = [
      {
        name: "missing explicit legacy declaration",
        args: (fixture) => supersededCleanupArgs(fixture, `${fixture.carriedPath},hardened.txt`),
      },
      {
        name: "missing legacy-unassigned flag",
        args: (fixture) => legacyFirstUseSupersededArgs(fixture).filter((value) => value !== "--legacy-unassigned"),
      },
      {
        name: "unbounded successor hardening path",
        args: (fixture) => replaceOption(legacyFirstUseSupersededArgs(fixture), "--successor-hardening-scope", fixture.carriedPath),
      },
      {
        name: "unproven successor hardening commit",
        args: (fixture) => replaceOption(legacyFirstUseSupersededArgs(fixture), "--successor-hardening-commits", fixture.carryForwardCommit),
      },
    ];
    for (const scenario of cases) {
      const fixture = createSupersededCleanupFixture({ firstUseRepair: true });
      try {
        const result = runFixtureScript(fixture, [...scenario.args(fixture), "--summary-json"], { env: fixture.env });
        if (result.code === 0) {
          const summary = JSON.parse(result.stdout);
          assert(summary.counts.cleanupReady === 0, `${scenario.name} unexpectedly became ready: ${result.stdout}`);
        }
        assert(existsSync(fixture.worktree), `${scenario.name} removed source worktree`);
        assert(branchExists(fixture.root, fixture.branch), `${scenario.name} removed source branch`);
        assert(!remoteBranchExists(fixture.root, fixture.branch), `${scenario.name} mutated absent source remote`);
      } finally {
        cleanupSupersededCleanupFixture(fixture);
      }
    }

    const unavailableRemote = createSupersededCleanupFixture({ firstUseRepair: true });
    try {
      runGit(unavailableRemote.root, ["remote", "set-url", "origin", join(unavailableRemote.root, "missing-remote.git")]);
      const result = runFixtureScript(unavailableRemote, [...legacyFirstUseSupersededArgs(unavailableRemote), "--summary-json"], { env: unavailableRemote.env });
      assert(result.code === 0, result.stderr || result.stdout);
      const summary = JSON.parse(result.stdout);
      assert(summary.counts.cleanupReady === 0, "remote lookup failure was treated as absent");
      assert(summary.results[0].reason.includes("remote branch evidence is unavailable"), summary.results[0].reason);
      assert(existsSync(unavailableRemote.worktree), "remote lookup failure removed source worktree");
      assert(branchExists(unavailableRemote.root, unavailableRemote.branch), "remote lookup failure removed source branch");
    } finally {
      cleanupSupersededCleanupFixture(unavailableRemote);
    }
  });

  test("cleanup-superseded first-use repair proves the deleted predecessor and merged PR head ancestry", () => {
    const scenarios = [
      { name: "live legacy predecessor ref", options: { firstUseRepair: true, legacyManifestBasePresent: true } },
      { name: "PR head not integrated into merge commit", options: { firstUseRepair: true, unmergedPrHead: true } },
      { name: "unlinked active assignment", options: { firstUseRepair: true, unlinkedAssignment: true } },
      { name: "manifest still links an assignment", options: { firstUseRepair: true, linkedLegacyAssignment: true } },
      { name: "legacy base branch/ref mismatch", options: { firstUseRepair: true, legacyManifestBaseMismatch: true } },
      { name: "unlinked active source backlog assignment", options: { firstUseRepair: true, unlinkedBacklogAssignment: true } },
      { name: "merge result changes an already-declared hardening path", options: { firstUseRepair: true, mergeChangesAfterHead: true } },
      { name: "stale reported PR head with reverted merge-side tail", options: { firstUseRepair: true, stalePrHeadWithRevertedTail: true } },
      { name: "stale local canonical tracking ref", options: { firstUseRepair: true, staleCanonicalRemote: true } },
      {
        name: "unlisted carried-to-merge PR path",
        options: { firstUseRepair: true, unlistedSuccessorDiff: true },
        args: (fixture) => replaceOption(legacyFirstUseSupersededArgs(fixture), "--successor-hardening-commits", `${fixture.firstHardeningCommit},${fixture.successorHead}`),
      },
      {
        name: "transient unlisted successor path",
        options: { firstUseRepair: true, transientUnlistedSuccessorDiff: true },
        args: (fixture) => replaceOption(legacyFirstUseSupersededArgs(fixture), "--successor-hardening-commits", fixture.hardeningLineageCommits.join(",")),
      },
    ];
    for (const scenario of scenarios) {
      const fixture = createSupersededCleanupFixture(scenario.options);
      try {
        const result = runFixtureScript(fixture, [...(scenario.args ? scenario.args(fixture) : legacyFirstUseSupersededArgs(fixture)), "--summary-json"], { env: fixture.env });
        assert(result.code === 0, result.stderr || result.stdout);
        const summary = JSON.parse(result.stdout);
        assert(summary.counts.cleanupReady === 0, `${scenario.name} unexpectedly became ready: ${result.stdout}`);
        assert(existsSync(fixture.worktree), `${scenario.name} removed source worktree`);
        assert(branchExists(fixture.root, fixture.branch), `${scenario.name} removed source branch`);
        assert(!remoteBranchExists(fixture.root, fixture.branch), `${scenario.name} mutated absent source remote`);
      } finally {
        cleanupSupersededCleanupFixture(fixture);
      }
    }
  });

  test("cleanup-superseded first-use repair resumes only an identical recorded absent-remote proof", () => {
    const fixture = createSupersededCleanupFixture({ firstUseRepair: true });
    const args = legacyFirstUseSupersededArgs(fixture);
    try {
      const preview = runFixtureScript(fixture, [...args, "--summary-json"], { env: fixture.env });
      assert(preview.code === 0, preview.stderr || preview.stdout);
      const plan = JSON.parse(preview.stdout).results[0];
      assert(plan.proof.carryForward.baseRefOid === fixture.currentBaseHead, preview.stdout || preview.stderr);
      assert(plan.proof.currentBase.headSha === fixture.currentBaseHead, preview.stdout || preview.stderr);
      runGit(fixture.root, ["worktree", "remove", fixture.worktree]);
      runGit(fixture.root, ["update-ref", "-d", `refs/heads/${fixture.branch}`, fixture.sourceHead]);
      const manifestPath = markFirstUseSupersededCleanupPartial(fixture, plan.proof);

      const resumed = runFixtureScript(fixture, [...args, "--summary-json"], { env: fixture.env });
      assert(resumed.code === 0, resumed.stderr || resumed.stdout);
      const summary = JSON.parse(resumed.stdout);
      assert(summary.counts.cleanupReady === 1, resumed.stdout || resumed.stderr);
      assert(summary.results[0].partialResume === true, resumed.stdout || resumed.stderr);

      const applied = runFixtureScript(fixture, [
        ...args,
        "--apply",
        "--approval",
        "operator approved exact first-use partial resume",
        "--reason",
        "same-proof absent-remote recovery was reviewed and approved",
      ], { env: fixture.env });
      assert(applied.code === 0, applied.stderr || applied.stdout);
      const closed = readJson(manifestPath);
      assert(closed.status === "closed", `first-use partial resume status is ${closed.status}`);
      assert(closed.cleanup_source_remote_absent === "absent", closed.cleanup_source_remote_absent);
      assert(!remoteBranchExists(fixture.root, fixture.branch), "first-use partial resume created or mutated source remote");
    } finally {
      cleanupSupersededCleanupFixture(fixture);
    }
  });

  test("cleanup-superseded first-use repair rejects an absent target with proof but no durable partial journal", () => {
    const fixture = createSupersededCleanupFixture({ firstUseRepair: true });
    const args = legacyFirstUseSupersededArgs(fixture);
    try {
      const preview = runFixtureScript(fixture, [...args, "--summary-json"], { env: fixture.env });
      assert(preview.code === 0, preview.stderr || preview.stdout);
      const plan = JSON.parse(preview.stdout).results[0];
      runGit(fixture.root, ["worktree", "remove", fixture.worktree]);
      runGit(fixture.root, ["update-ref", "-d", `refs/heads/${fixture.branch}`, fixture.sourceHead]);
      const manifestPath = join(fixture.stateRoot, "tasks", "superseded-task.json");
      const manifest = readJson(manifestPath);
      manifest.status = "cleanup_partial";
      manifest.cleanup_supersession_evidence = { schemaVersion: 1, remoteBranchPolicy: "absent", proof: plan.proof };
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      const resumed = runFixtureScript(fixture, [...args, "--summary-json"], { env: fixture.env });
      assert(resumed.code !== 0, "first-use proof without a durable journal unexpectedly resumed");
      assert(resumed.stderr.includes("absent worktree target requires an exact cleanup_partial journal"), resumed.stderr || resumed.stdout);
      assert(!existsSync(fixture.worktree), "unproven first-use resume recreated its worktree");
      assert(!branchExists(fixture.root, fixture.branch), "unproven first-use resume recreated its local branch");
      assert(!remoteBranchExists(fixture.root, fixture.branch), "unproven first-use resume mutated the absent remote");
    } finally {
      cleanupSupersededCleanupFixture(fixture);
    }
  });

  test("cleanup-superseded first-use partial resume blocks changed canonical base evidence without mutation", () => {
    const fixture = createSupersededCleanupFixture({ firstUseRepair: true });
    const args = legacyFirstUseSupersededArgs(fixture);
    try {
      const initial = runFixtureScript(fixture, [...args, "--summary-json"], { env: fixture.env });
      assert(initial.code === 0, initial.stderr || initial.stdout);
      const initialPlan = JSON.parse(initial.stdout).results[0];
      assert(initialPlan.proof.carryForward.baseRefOid === fixture.currentBaseHead, initial.stdout || initial.stderr);

      runGit(fixture.root, ["worktree", "remove", fixture.worktree]);
      runGit(fixture.root, ["update-ref", "-d", `refs/heads/${fixture.branch}`, fixture.sourceHead]);
      const manifestPath = markFirstUseSupersededCleanupPartial(fixture, initialPlan.proof);

      commitFile(fixture.root, "after-cleanup-base-advance.txt", "advance after local targets were removed\n", "advance canonical base after cleanup interruption");
      const advancedBaseHead = runGit(fixture.root, ["rev-parse", "HEAD"]).stdout;
      runGit(fixture.root, ["push", "-q", "origin", fixture.baseBranch]);
      const fakeGh = join(fixture.fakeBin, "gh");
      writeFileSync(fakeGh, readFileSync(fakeGh, "utf8").replaceAll(fixture.currentBaseHead, advancedBaseHead));

      const resumed = runFixtureScript(fixture, [...args, "--summary-json"], { env: fixture.env });
      assert(resumed.code === 0, resumed.stderr || resumed.stdout);
      const summary = JSON.parse(resumed.stdout);
      assert(summary.counts.cleanupReady === 0, resumed.stdout || resumed.stderr);
      assert(summary.results[0].status === "blocked", resumed.stdout || resumed.stderr);
      assert(summary.results[0].reason.includes("recorded first-use canonical base proof"), summary.results[0].reason);
      assert(!existsSync(fixture.worktree), "blocked partial resume recreated or mutated source worktree");
      assert(!branchExists(fixture.root, fixture.branch), "blocked partial resume recreated or mutated local branch");
      assert(!remoteBranchExists(fixture.root, fixture.branch), "blocked partial resume mutated absent source remote");
      assert(readJson(manifestPath).status === "cleanup_partial", "blocked partial resume changed its journal state");
    } finally {
      cleanupSupersededCleanupFixture(fixture);
    }
  });

  test("cleanup-superseded first-use repair accepts a complete hardening commit set in either input order", () => {
    const fixture = createSupersededCleanupFixture({ firstUseRepair: true, twoHardeningCommits: true });
    try {
      const args = replaceOption(legacyFirstUseSupersededArgs(fixture), "--successor-hardening-commits", `${fixture.successorHead},${fixture.firstHardeningCommit}`);
      const result = runFixtureScript(fixture, [...args, "--summary-json"], { env: fixture.env });
      assert(result.code === 0, result.stderr || result.stdout);
      assert(JSON.parse(result.stdout).counts.cleanupReady === 1, result.stdout || result.stderr);
    } finally {
      cleanupSupersededCleanupFixture(fixture);
    }
  });

  test("cleanup-superseded first-use apply holds the assignment index before the locked re-proof", () => {
    const fixture = createSupersededCleanupFixture({ firstUseRepair: true });
    const lockPath = join(fixture.stateRoot, "assignments", ".assignment-index.lock");
    let fd;
    try {
      fd = openSync(lockPath, "wx");
      const result = runFixtureScript(fixture, [
        ...legacyFirstUseSupersededArgs(fixture),
        "--apply",
        "--approval",
        "operator approved assignment-index lock proof",
        "--reason",
        "legacy assignment inventory must remain stable before deletion",
      ], { env: fixture.env });
      assert(result.code !== 0, "first-use apply ignored a held assignment index lock");
      assert(result.stderr.includes("Assignment index is locked"), result.stderr || result.stdout);
      assert(existsSync(fixture.worktree), "locked assignment index removed source worktree");
      assert(branchExists(fixture.root, fixture.branch), "locked assignment index removed source branch");
      assert(readJson(join(fixture.stateRoot, "tasks", "superseded-task.json")).status === "active", "locked assignment index changed manifest state");
    } finally {
      if (fd !== undefined) closeSync(fd);
      rmSync(lockPath, { force: true });
      cleanupSupersededCleanupFixture(fixture);
    }
  });

  test("cleanup-superseded blocks mismatched scoped content before mutation", () => {
    assertSupersededBlockedScenario("content");
  });

  test("cleanup-superseded refuses held workspaces before mutation", () => {
    assertSupersededBlockedScenario("held");
  });

  test("cleanup-superseded rejects a source-head mismatch before mutation", () => {
    assertSupersededBlockedScenario("source-head");
  });

  test("cleanup-superseded rejects source lanes with persisted PR delivery evidence", () => {
    assertSupersededBlockedScenario("pr-evidence");
  });

  test("cleanup-superseded rejects pathspec magic in the bounded scope", () => {
    const fixture = createSupersededCleanupFixture();
    try {
      const result = runFixtureScript(fixture, ["cleanup-superseded", "superseded-task", "--source-head", fixture.sourceHead, "--carry-forward-pr", "456", "--carry-forward-commit", fixture.carryForwardCommit, "--scope", ":(exclude)carried.txt", "--summary-json", "--state-root", fixture.stateRoot], { env: fixture.env });
      assert(result.code !== 0, "pathspec-magic scope was accepted");
      assert(result.stderr.includes("unsafe repository-relative path"), result.stderr || result.stdout);
    } finally { cleanupSupersededCleanupFixture(fixture); }
  });

  test("cleanup-superseded rejects carry-forward PR numbers outside safe integer precision", () => {
    const fixture = createSupersededCleanupFixture();
    try {
      const result = runFixtureScript(fixture, [
        "cleanup-superseded",
        "superseded-task",
        "--source-head",
        fixture.sourceHead,
        "--carry-forward-pr",
        "9007199254740993",
        "--carry-forward-commit",
        fixture.carryForwardCommit,
        "--scope",
        "carried.txt",
        "--summary-json",
        "--state-root",
        fixture.stateRoot,
      ], { env: fixture.env });
      assert(result.code !== 0, "unsafe carry-forward PR number was accepted");
      assert(result.stderr.includes("positive safe integer"), result.stderr || result.stdout);
    } finally { cleanupSupersededCleanupFixture(fixture); }
  });

  test("cleanup-superseded proves a directory scope containing a newline filename", () => {
    const fixture = createSupersededCleanupFixture({ newlineNestedPath: true });
    try {
      const result = runFixtureScript(fixture, [...supersededCleanupArgs(fixture, "carried"), "--summary-json"], { env: fixture.env });
      assert(result.code === 0, result.stderr || result.stdout);
      const summary = JSON.parse(result.stdout);
      assert(summary.counts.cleanupReady === 1, result.stdout || result.stderr);
      assert(summary.results[0].proof.scope.sourceEntries[0]?.path.includes("\n"), result.stdout || result.stderr);
    } finally { cleanupSupersededCleanupFixture(fixture); }
  });

  test("cleanup-superseded rejects successor-base mismatch and uncovered source delta", () => {
    for (const options of [{ successorBase: "other" }, { extraSourceDelta: true }]) {
      const fixture = createSupersededCleanupFixture(options);
      try {
        const result = runFixtureScript(fixture, ["cleanup-superseded", "superseded-task", "--source-head", fixture.sourceHead, "--carry-forward-pr", "456", "--carry-forward-commit", fixture.carryForwardCommit, "--scope", "carried.txt", "--summary-json", "--state-root", fixture.stateRoot], { env: fixture.env });
        assert(result.code === 0, result.stderr || result.stdout);
        assert(JSON.parse(result.stdout).counts.cleanupReady === 0, result.stdout || result.stderr);
      } finally { cleanupSupersededCleanupFixture(fixture); }
    }
  });

  test("cleanup-superseded rejects current-base, owner, assignment, and prior-remote ambiguity", () => {
    const cases = [
      { name: "reverted current base", options: { revertedCurrentBase: true } },
      { name: "masked manifest base ref", options: { baseRef: "origin/masked" } },
      { name: "unowned source lane", options: { manifestOwner: null } },
      { name: "unowned source assignment", options: { assignmentOwner: null } },
      { name: "different assignment task", options: { assignmentTaskId: "other-task" } },
      { name: "GitHub source branch PR evidence", options: { sourcePrRecord: true } },
      { name: "prior required remote target", options: {}, mutate: (fixture) => {
        const manifestPath = join(fixture.stateRoot, "tasks", "superseded-task.json");
        const manifest = readJson(manifestPath);
        manifest.cleanup_target_evidence = { remoteBranch: { required: true, state: "present", branch: fixture.branch } };
        writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      } },
    ];
    for (const scenario of cases) {
      const fixture = createSupersededCleanupFixture(scenario.options);
      try {
        scenario.mutate?.(fixture);
        const result = runFixtureScript(fixture, [...supersededCleanupArgs(fixture), "--summary-json"], { env: fixture.env });
        assert(result.code === 0, `${scenario.name}: ${result.stderr || result.stdout}`);
        const summary = JSON.parse(result.stdout);
        assert(summary.counts.cleanupReady === 0, `${scenario.name} unexpectedly became cleanup-ready: ${result.stdout}`);
        assert(existsSync(fixture.worktree), `${scenario.name} removed source worktree`);
        assert(branchExists(fixture.root, fixture.branch), `${scenario.name} deleted source local branch`);
        assert(remoteBranchExists(fixture.root, fixture.branch), `${scenario.name} deleted retained remote branch`);
      } finally { cleanupSupersededCleanupFixture(fixture); }
    }
  });

  test("cleanup-superseded rejects surrounding whitespace instead of normalizing its scope identity", () => {
    const fixture = createSupersededCleanupFixture();
    try {
      const result = runFixtureScript(fixture, [...supersededCleanupArgs(fixture, " carried.txt"), "--summary-json"], { env: fixture.env });
      assert(result.code !== 0, "whitespace-normalized scope was accepted");
      assert(result.stderr.includes("unsafe repository-relative path"), result.stderr || result.stdout);
    } finally { cleanupSupersededCleanupFixture(fixture); }
  });

  test("cleanup-superseded requires an explicit scope value", () => {
    const fixture = createSupersededCleanupFixture();
    try {
      const result = runFixtureScript(fixture, [
        "cleanup-superseded",
        "superseded-task",
        "--source-head",
        fixture.sourceHead,
        "--carry-forward-pr",
        "456",
        "--carry-forward-commit",
        fixture.carryForwardCommit,
        "--scope",
        "--summary-json",
        "--state-root",
        fixture.stateRoot,
      ], { env: fixture.env });
      assert(result.code !== 0, "bare --scope unexpectedly selected a path");
      assert(result.stderr.includes("--scope requires a value"), result.stderr || result.stdout);
    } finally { cleanupSupersededCleanupFixture(fixture); }
  });

  test("cleanup-superseded requires a rename scope to cover both old and new paths", () => {
    const fixture = createSupersededCleanupFixture({ renameOnly: true });
    try {
      const result = runFixtureScript(fixture, [...supersededCleanupArgs(fixture, "rename/new.txt"), "--summary-json"], { env: fixture.env });
      assert(result.code === 0, result.stderr || result.stdout);
      const summary = JSON.parse(result.stdout);
      assert(summary.counts.cleanupReady === 0, `rename source deletion was not required in scope: ${result.stdout}`);
      assert(existsSync(fixture.worktree), "rename scope hold removed source worktree");
      assert(branchExists(fixture.root, fixture.branch), "rename scope hold deleted source branch");
    } finally { cleanupSupersededCleanupFixture(fixture); }
  });

  test("cleanup-superseded permits only an explicit recorded ownership takeover", () => {
    const fixture = createSupersededCleanupFixture({ manifestOwner: "runner-a", assignmentOwner: "runner-a" });
    try {
      const args = [
        ...supersededCleanupArgs(fixture, "carried.txt", "runner-b"),
        "--take-ownership",
        "--takeover-reason",
        "prior runner completed and delegated this exact source cleanup",
      ];
      const preview = runFixtureScript(fixture, [...args, "--summary-json"], { env: fixture.env });
      assert(preview.code === 0, preview.stderr || preview.stdout);
      assert(JSON.parse(preview.stdout).counts.cleanupReady === 1, preview.stdout || preview.stderr);
      const applied = runFixtureScript(fixture, [
        ...args,
        "--apply",
        "--approval",
        "operator approved source lane supersession cleanup",
        "--reason",
        "merged carry-forward proof reviewed and approved",
      ], { env: fixture.env });
      assert(applied.code === 0, applied.stderr || applied.stdout);
      const manifest = readJson(join(fixture.stateRoot, "tasks", "superseded-task.json"));
      const assignment = readJson(join(fixture.stateRoot, "assignments", "superseded-assignment.json"));
      assert(manifest.owner === "runner-b", `takeover manifest owner is ${manifest.owner}`);
      assert(assignment.owner === "runner-b", `takeover assignment owner is ${assignment.owner}`);
      assert(manifest.ownership_takeovers?.some((takeover) => takeover.previous_owner === "runner-a" && takeover.new_owner === "runner-b"), "takeover evidence was not recorded");
    } finally { cleanupSupersededCleanupFixture(fixture); }
  });

  test("cleanup-superseded journals a partial before and after local target mutations", () => {
    const fixture = createSupersededCleanupFixture();
    try {
      const fakeGit = installFixtureGitProxy(
        fixture,
        `args[0] === 'update-ref' && args[1] === '-d' && args[2] === 'refs/heads/${fixture.branch}'`,
        "simulated local branch deletion interruption",
      );
      const result = runFixtureScript(fixture, [
        ...supersededCleanupArgs(fixture),
        "--apply",
        "--approval",
        "operator approved source lane supersession cleanup",
        "--reason",
        "merged carry-forward proof reviewed and approved",
      ], { env: fixture.env });
      assert(result.code !== 0, "simulated local branch deletion interruption unexpectedly closed cleanup");
      assert(!existsSync(fixture.worktree), "journal fixture did not remove source worktree before branch interruption");
      assert(branchExists(fixture.root, fixture.branch), "journal fixture deleted branch despite simulated interruption");
      const manifest = readJson(join(fixture.stateRoot, "tasks", "superseded-task.json"));
      assert(manifest.status === "cleanup_partial", `journal fixture status is ${manifest.status}`);
      assert(manifest.cleanup_supersession_evidence?.proof?.source?.requestedHead === fixture.sourceHead, "partial journal lost exact source proof");
      assert(manifest.worktree_removed_at, "partial journal did not persist completed worktree removal");
      assert(manifest.events.some((event) => event.type === "cleanup_journal_started"), "partial journal start event was not persisted");
      rmSync(fakeGit, { force: true });
      const preview = runFixtureScript(fixture, [...supersededCleanupArgs(fixture), "--summary-json"], { env: fixture.env });
      assert(preview.code === 0, preview.stderr || preview.stdout);
      assert(JSON.parse(preview.stdout).counts.cleanupReady === 0, "mixed partial resource state unexpectedly resumed");
    } finally { cleanupSupersededCleanupFixture(fixture); }
  });

  test("cleanup-superseded keeps a partial when the retained remote advances during local cleanup", () => {
    const fixture = createSupersededCleanupFixture();
    try {
      const fakeGit = installFixtureGitPostSuccessHook(
        fixture,
        `args[0] === 'update-ref' && args[1] === '-d' && args[2] === 'refs/heads/${fixture.branch}'`,
        ["push", "-q", "--force", "origin", `${fixture.currentBaseHead}:refs/heads/${fixture.branch}`],
      );
      const result = runFixtureScript(fixture, [
        ...supersededCleanupArgs(fixture),
        "--apply",
        "--approval",
        "operator approved source lane supersession cleanup",
        "--reason",
        "merged carry-forward proof reviewed and approved",
      ], { env: fixture.env });
      assert(result.code !== 0, "advanced retained remote unexpectedly allowed cleanup closure");
      assert(!existsSync(fixture.worktree), "advanced remote fixture did not remove source worktree before drift");
      assert(!branchExists(fixture.root, fixture.branch), "advanced remote fixture did not delete local branch before drift");
      const manifest = readJson(join(fixture.stateRoot, "tasks", "superseded-task.json"));
      assert(manifest.status === "cleanup_partial", `advanced remote fixture status is ${manifest.status}`);
      assert(manifest.cleanup_error.includes("does not match proven source head"), manifest.cleanup_error);
      assert(remoteBranchExists(fixture.root, fixture.branch), "advanced remote fixture removed retained remote branch");
      rmSync(fakeGit, { force: true });
    } finally { cleanupSupersededCleanupFixture(fixture); }
  });

  test("cleanup-superseded re-proves the linked assignment while both cleanup locks are held", () => {
    const fixture = createSupersededCleanupFixture({ lockedAssignmentDrift: true });
    const args = supersededCleanupArgs(fixture);
    try {
      const result = runFixtureScript(fixture, [
        ...args,
        "--apply",
        "--approval",
        "operator approved source lane supersession cleanup",
        "--reason",
        "merged carry-forward proof reviewed and approved",
      ], { env: fixture.env });
      assert(result.code !== 0, "locked assignment drift unexpectedly allowed cleanup");
      assert(
        result.stderr.includes("supersession proof changed under lock") || result.stderr.includes("does not match cleaned branch"),
        result.stderr || result.stdout,
      );
      assert(existsSync(fixture.worktree), "locked assignment drift removed source worktree");
      assert(branchExists(fixture.root, fixture.branch), "locked assignment drift deleted source local branch");
      assert(remoteBranchExists(fixture.root, fixture.branch), "locked assignment drift deleted retained remote branch");
      const manifest = readJson(join(fixture.stateRoot, "tasks", "superseded-task.json"));
      const assignment = readJson(join(fixture.stateRoot, "assignments", "superseded-assignment.json"));
      assert(manifest.status === "active", `locked re-proof unexpectedly changed manifest status to ${manifest.status}`);
      assert(assignment.branch === "codex/drifted-assignment", "fixture did not introduce the locked assignment drift");
    } finally {
      cleanupSupersededCleanupFixture(fixture);
    }
  });

  test("cleanup-superseded resumes only the exact recorded cleanup_partial proof", () => {
    const fixture = createSupersededCleanupFixture();
    const args = supersededCleanupArgs(fixture);
    try {
      markSupersededCleanupPartial(fixture, { removeWorktree: true, deleteLocalBranch: true });
      const preview = runFixtureScript(fixture, [...args, "--summary-json"], { env: fixture.env });
      assert(preview.code === 0, preview.stderr || preview.stdout);
      const summary = JSON.parse(preview.stdout);
      assert(summary.counts.cleanupReady === 1, preview.stdout || preview.stderr);
      assert(summary.results[0].partialResume === true, preview.stdout || preview.stderr);
      assert(!existsSync(fixture.worktree), "exact partial resume unexpectedly restored source worktree");
      assert(!branchExists(fixture.root, fixture.branch), "exact partial resume unexpectedly restored local branch");
      assert(remoteBranchExists(fixture.root, fixture.branch), "exact partial resume lost retained remote branch");

      const applied = runFixtureScript(fixture, [
        ...args,
        "--apply",
        "--approval",
        "operator approved exact partial supersession resume",
        "--reason",
        "same-proof partial cleanup was reviewed and approved",
      ], { env: fixture.env });
      assert(applied.code === 0, applied.stderr || applied.stdout);
      const manifest = readJson(join(fixture.stateRoot, "tasks", "superseded-task.json"));
      const assignment = readJson(join(fixture.stateRoot, "assignments", "superseded-assignment.json"));
      assert(manifest.status === "closed", `exact partial resume status is ${manifest.status}`);
      assert(manifest.cleanup_error === null, `exact partial resume did not clear cleanup error: ${manifest.cleanup_error}`);
      assert(assignment.status === "closed", `exact partial resume assignment status is ${assignment.status}`);
      assert(remoteBranchExists(fixture.root, fixture.branch), "exact partial resume deleted retained remote branch");
    } finally {
      cleanupSupersededCleanupFixture(fixture);
    }
  });

  test("cleanup-superseded rejects an absent worktree without its exact partial journal", () => {
    const fixture = createSupersededCleanupFixture();
    try {
      runGit(fixture.root, ["worktree", "remove", fixture.worktree]);
      runGit(fixture.root, ["update-ref", "-d", `refs/heads/${fixture.branch}`, fixture.sourceHead]);
      const manifestPath = join(fixture.stateRoot, "tasks", "superseded-task.json");
      const manifest = readJson(manifestPath);
      manifest.status = "cleanup_partial";
      manifest.cleanup_error = "unproven absent superseded target";
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      const result = runFixtureScript(fixture, [...supersededCleanupArgs(fixture), "--summary-json"], { env: fixture.env });
      assert(result.code !== 0, "unproven absent superseded target unexpectedly planned");
      assert(result.stderr.includes("absent worktree target requires an exact cleanup_partial journal"), result.stderr || result.stdout);
      assert(!branchExists(fixture.root, fixture.branch), "unproven absent superseded target recreated its local branch");
      assert(remoteBranchExists(fixture.root, fixture.branch), "unproven absent superseded target deleted the retained remote branch");
    } finally {
      cleanupSupersededCleanupFixture(fixture);
    }
  });

  test("cleanup-superseded refuses persisted PR evidence even for an otherwise exact cleanup_partial resume", () => {
    const fixture = createSupersededCleanupFixture();
    try {
      markSupersededCleanupPartial(fixture, { removeWorktree: true, deleteLocalBranch: true });
      const manifestPath = join(fixture.stateRoot, "tasks", "superseded-task.json");
      const manifest = readJson(manifestPath);
      manifest.pr_number = 789;
      manifest.pr_url = "https://example.test/pull/789";
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      const result = runFixtureScript(fixture, [...supersededCleanupArgs(fixture), "--summary-json"], { env: fixture.env });
      assert(result.code === 0, result.stderr || result.stdout);
      assert(JSON.parse(result.stdout).counts.cleanupReady === 0, "partial resume accepted persisted source PR evidence");
      assert(remoteBranchExists(fixture.root, fixture.branch), "PR-evidence partial hold deleted retained remote branch");
    } finally { cleanupSupersededCleanupFixture(fixture); }
  });

  test("cleanup-superseded rejects mixed cleanup_partial resource states", () => {
    for (const state of [
      { name: "registered worktree remains", removeWorktree: false, deleteLocalBranch: false },
      { name: "local branch remains", removeWorktree: true, deleteLocalBranch: false },
    ]) {
      const fixture = createSupersededCleanupFixture();
      try {
        markSupersededCleanupPartial(fixture, state);
        const result = runFixtureScript(fixture, [...supersededCleanupArgs(fixture), "--summary-json"], { env: fixture.env });
        assert(result.code === 0, result.stderr || result.stdout);
        const summary = JSON.parse(result.stdout);
        assert(summary.counts.cleanupReady === 0, `${state.name} unexpectedly became cleanup-ready: ${result.stdout}`);
        assert(summary.results[0].status === "blocked", `${state.name} was not blocked: ${result.stdout}`);
        assert(readJson(join(fixture.stateRoot, "tasks", "superseded-task.json")).status === "cleanup_partial", `${state.name} changed partial manifest state`);
        assert(remoteBranchExists(fixture.root, fixture.branch), `${state.name} deleted retained remote branch`);
        if (state.removeWorktree) {
          assert(branchExists(fixture.root, fixture.branch), `${state.name} unexpectedly removed local branch`);
        } else {
          assert(existsSync(fixture.worktree), `${state.name} unexpectedly removed source worktree`);
        }
      } finally {
        cleanupSupersededCleanupFixture(fixture);
      }
    }
  });

  test("cleanup-merged retains ordinary assignment PR-evidence closeout behavior", () => {
    const fixture = createMergedCleanupFixture();
    try {
      const assignmentPath = join(fixture.stateRoot, "assignments", "cleanup-assignment.json");
      const assignment = readJson(assignmentPath);
      assignment.pr_url = "https://example.test/pull/123";
      assignment.pr_number = 123;
      writeFileSync(assignmentPath, `${JSON.stringify(assignment, null, 2)}\n`);
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
      assert(readJson(assignmentPath).status === "closed", "ordinary merged cleanup did not close assignment with its normal PR evidence");
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

  test("cleanup-orphans rejects symlinked managed roots and child entries before directory inspection", () => {
    const externalRoot = mkdtempSync(join(tmpdir(), "codex-orphan-external-"));
    const symlinkStateRoot = mkdtempSync(join(tmpdir(), "codex-orphan-root-link-state-"));
    const symlinkedRoot = join(symlinkStateRoot, "worktrees");
    const childTarget = mkdtempSync(join(tmpdir(), "codex-orphan-child-link-target-"));
    const childLink = join(stateRoot, "worktrees", "foreign-child-link");
    try {
      mkdirSync(join(externalRoot, "foreign-orphan"));
      symlinkSync(externalRoot, symlinkedRoot, "dir");
      const rootResult = run(["cleanup-orphans", "--summary-json", "--state-root", symlinkStateRoot]);
      assert(rootResult.code !== 0, "cleanup-orphans unexpectedly inspected a symlinked managed root");
      assert(rootResult.stderr.includes("managed root must not be a symlink"), rootResult.stderr || rootResult.stdout);
      assert(existsSync(join(externalRoot, "foreign-orphan")), "cleanup-orphans touched symlinked-root content");

      mkdirSync(join(childTarget, "foreign-orphan"));
      mkdirSync(join(stateRoot, "worktrees"), { recursive: true });
      symlinkSync(childTarget, childLink, "dir");
      const childResult = run(["cleanup-orphans", "--summary-json", "--state-root", stateRoot]);
      assert(childResult.code !== 0, "cleanup-orphans unexpectedly skipped a symlinked child entry");
      assert(childResult.stderr.includes("cleanup target must not be a symlink"), childResult.stderr || childResult.stdout);
      assert(existsSync(join(childTarget, "foreign-orphan")), "cleanup-orphans touched symlinked-child content");
    } finally {
      rmSync(childLink, { force: true });
      rmSync(childTarget, { recursive: true, force: true });
      rmSync(symlinkStateRoot, { recursive: true, force: true });
      rmSync(externalRoot, { recursive: true, force: true });
    }
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
    const isolatedStateRoot = mkdtempSync(join(tmpdir(), "codex-orphan-targeted-state-"));
    try {
      const orphanPath = join(isolatedStateRoot, "worktrees", "remove-this-orphan");
      mkdirSync(join(orphanPath, "services", "supervisor", ".pytest_cache"), { recursive: true });
      writeFileSync(join(orphanPath, "services", "supervisor", ".pytest_cache", "README.md"), "cache\n");

      const result = run(["cleanup-orphans", "remove-this", "--apply", "--state-root", isolatedStateRoot]);

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("Removed orphan directory"));
      assert(!existsSync(orphanPath), "cleanup-orphans did not remove targeted orphan directory");
    } finally {
      rmSync(isolatedStateRoot, { recursive: true, force: true });
    }
  });
  if (testFilter && executedTestCount === 0) {
    throw new Error(`CODEX_WORKSPACE_TEST_FILTER matched no tests: ${testFilter}`);
  }
} finally {
  rmSync(stateRoot, { recursive: true, force: true });
}

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: rootDir,
    encoding: "utf8",
    env: {
      ...process.env,
      CODEX_WORKSPACE_TEST_MODE: "1",
      CODEX_WORKSPACE_TEST_IGNORE_SAFE_BACKLOG_LOCAL_BRANCHES: "1",
      ...(options.env || {}),
    },
    stdio: "pipe",
  });
  return guardExpectedJsonResult(args, {
    code: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || result.error?.message || "",
  }, {
    commandPrefix: ["node", "./scripts/codex-workspace.mjs"],
  });
}

function expectsJson(args = []) {
  return args.includes("--summary-json") || args.includes("--json");
}

function guardExpectedJsonResult(args = [], result = {}, options = {}) {
  const guarded = {
    code: result.code ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
  if (!expectsJson(args) || guarded.stdout.trim() !== "") {
    return guarded;
  }
  const command = renderCommand([...(options.commandPrefix || ["node", "./scripts/codex-workspace.mjs"]), ...args]);
  const stderrExcerpt = guarded.stderr.trim().slice(0, 280) || "(empty stderr)";
  guarded.code = guarded.code === 0 ? 1 : guarded.code;
  guarded.stderr = [
    "sandbox/process boundary: child command expected JSON but emitted empty stdout",
    `command=${command}`,
    "expectedJson=true",
    "stdoutLength=0",
    `stderrExcerpt=${stderrExcerpt}`,
    `exitCode=${guarded.code}`,
    "nextAction=report this boundary and rerun the exact same read-only command outside the sandbox when the command is read-only",
  ].join("\n");
  return guarded;
}

function renderCommand(parts = []) {
  return parts.map((part) => {
    const value = String(part);
    return /^[A-Za-z0-9_./:=@+-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\"'\"'")}'`;
  }).join(" ");
}

function staleCleanupFixtureEnv(root, options = {}) {
  const binDir = join(root, "bin");
  mkdirSync(binDir, { recursive: true });
  const ghPath = join(binDir, "gh");
  writeFileSync(
    ghPath,
    [
      "#!/usr/bin/env node",
      "const args = process.argv.slice(2);",
      "if (args[0] === '--version') { console.log('gh version test'); process.exit(0); }",
      "if (args[0] === 'pr' && args[1] === 'list') { console.log(process.env.CODEX_WORKSPACE_TEST_GH_PR_LIST_JSON || '[]'); process.exit(0); }",
      "console.error(`unexpected gh command: ${args.join(' ')}`);",
      "process.exit(1);",
      "",
    ].join("\n"),
  );
  chmodSync(ghPath, 0o755);
  return {
    PATH: `${binDir}:${process.env.PATH || ""}`,
    CODEX_WORKSPACE_TEST_GH_PR_LIST_JSON: options.prListJson || "[]",
    CODEX_WORKSPACE_TEST_STALE_REMOTE_BRANCHES: (options.remoteBranches || []).join(","),
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

function currentLinuxStartIdentity() {
  const raw = readFileSync(`/proc/${process.pid}/stat`, "utf8");
  const close = raw.lastIndexOf(")");
  assert(close >= 0, "fixture process stat did not contain a command terminator");
  const startTicks = raw.slice(close + 1).trim().split(/\s+/)[19];
  assert(/^\d+$/.test(startTicks || ""), "fixture process stat did not expose a start tick identity");
  return `linux-proc-start-ticks:${startTicks}`;
}

function fixtureTaskLockMetadata(taskId, overrides = {}) {
  return {
    schema_version: 1,
    task_id: taskId,
    owner: "runner-a",
    pid: process.pid,
    process_start_identity: currentLinuxStartIdentity(),
    acquired_at: "2026-07-26T00:00:00.000Z",
    heartbeat_at: "2026-07-26T00:00:00.000Z",
    token: "11111111-1111-4111-8111-111111111111",
    ...overrides,
  };
}

function writeFixtureTaskLock(fixture, metadata) {
  const path = join(fixture.stateRoot, "tasks", `${metadata.task_id}.lock`);
  writeFileSync(path, `${JSON.stringify(metadata)}\n`);
  return path;
}

function createFinishPrExistingCommitFixture(options = {}) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "codex-finish-existing-commit-"));
  const remoteRoot = `${fixtureRoot}-remote.git`;
  const stateRootFixture = join(fixtureRoot, "state");
  const fakeBin = join(fixtureRoot, "bin");
  const branch = "codex/resumed-task";
  const worktree = join(stateRootFixture, "worktrees", "resumed-task");
  const env = { ...process.env, PATH: `${fakeBin}:${process.env.PATH || ""}`, CODEX_WORKSPACE_OWNER: "runner-a" };

  copyWorkspaceScriptFixture(fixtureRoot);
  mkdirSync(fakeBin, { recursive: true });
  runGit(fixtureRoot, ["init", "-q"]);
  runGit(fixtureRoot, ["config", "user.email", "codex-workspace-test@example.com"]);
  runGit(fixtureRoot, ["config", "user.name", "Codex Workspace Test"]);
  writeFileSync(join(fixtureRoot, ".git", "info", "exclude"), "state/\nbin/\n");
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
  commitFile(worktree, options.featurePath || "feature.txt", options.featureContent || "feature\n", "feature");
  runGit(worktree, ["push", "-q", "-u", "origin", branch]);
  const branchHead = runGit(worktree, ["rev-parse", "HEAD"]).stdout;

  const prViewPayload = {
    number: 456,
    url: "https://example.test/pull/456",
    mergedAt: null,
    state: "OPEN",
    baseRefName: Object.hasOwn(options, "baseRefName") ? options.baseRefName : "main",
    headRefOid: branchHead,
    mergeStateStatus: Object.hasOwn(options, "mergeStateStatus") ? options.mergeStateStatus : "CLEAN",
    isDraft: Boolean(options.isDraft),
    reviewDecision: options.reviewDecision || "APPROVED",
    statusCheckRollup: options.statusCheckRollup || [
      {
        name: "unit",
        status: "COMPLETED",
        conclusion: "SUCCESS",
        detailsUrl: "https://example.test/checks/unit",
      },
    ],
  };
  const reviewThreadsPayload = {
    data: {
      repository: {
        pullRequest: {
          reviewThreads: {
            nodes: options.reviewThreads || [
              {
                id: "RT_resolved",
                isResolved: true,
                isOutdated: false,
                comments: { nodes: [{ url: "https://example.test/pull/456#discussion_r1" }] },
              },
              {
                id: "RT_outdated",
                isResolved: false,
                isOutdated: true,
                comments: { nodes: [{ url: "https://example.test/pull/456#discussion_r2" }] },
              },
            ],
            pageInfo: {
              hasNextPage: Boolean(options.reviewThreadsHasNextPage),
              endCursor: options.reviewThreadsHasNextPage ? "cursor-1" : null,
            },
          },
        },
      },
    },
  };
  if (options.reviewThreadErrors) {
    reviewThreadsPayload.errors = options.reviewThreadErrors;
  }
  const fakeGh = join(fakeBin, "gh");
  writeFileSync(
    fakeGh,
    [
      "#!/usr/bin/env node",
      "const args = process.argv.slice(2);",
      "if (args[0] === '--version') { console.log('gh version test'); process.exit(0); }",
      options.existingPr
        ? `if (args[0] === 'pr' && args[1] === 'view') { console.log(${JSON.stringify(JSON.stringify(prViewPayload))}); process.exit(0); }`
        : "if (args[0] === 'pr' && args[1] === 'view') { process.exit(1); }",
      options.invalidCreateOutput
        ? "if (args[0] === 'pr' && args[1] === 'create') { console.log('created pull request without url'); process.exit(0); }"
        : "if (args[0] === 'pr' && args[1] === 'create') { console.log('https://example.test/pull/456'); process.exit(0); }",
      "if (args[0] === 'repo' && args[1] === 'view') { console.log(JSON.stringify({ owner: { login: 'slaw-dawg' }, name: 'fixture' })); process.exit(0); }",
      `if (args[0] === 'api' && args[1] === 'graphql') { console.log(${JSON.stringify(JSON.stringify(reviewThreadsPayload))}); process.exit(0); }`,
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
      pr_delivery_head_sha: branchHead,
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

function setFixtureCodexWorkspaceVerificationTimeout(fixture, timeoutMs) {
  const source = readFileSync(fixture.script, "utf8");
  const original = "const codexWorkspaceVerificationTimeoutMs = 600_000;";
  assert(source.includes(original), "fixture did not contain the reviewed codex-workspace timeout literal");
  writeFileSync(fixture.script, source.replace(original, `const codexWorkspaceVerificationTimeoutMs = ${timeoutMs};`));
  runGit(fixture.root, ["add", "scripts/codex-workspace.mjs"]);
  runGit(fixture.root, ["commit", "-q", "-m", "fixture verification timeout seam"]);
}

function installFixtureVerificationCommand(fixture, mode) {
  return installFixtureVerificationProfileCommand(fixture, "codex-workspace", mode);
}

function installFixtureVerificationProfileCommand(fixture, profile, mode) {
  if (profile === "check") {
    writeFileSync(join(fixture.worktree, "package.json"), `${JSON.stringify({ scripts: { check: "pnpm run check:fixture", "check:fixture": "fixture-verification" } })}\n`);
    runGit(fixture.worktree, ["add", "package.json"]);
    runGit(fixture.worktree, ["commit", "-q", "-m", "fixture check profile plan"]);
  }
  const fixtureSource = readFileSync(fixture.script, "utf8");
  const commands = {
    check: 'check: ["pnpm", "run", "check"],',
    "codex-workspace": '"codex-workspace": ["node", "./scripts/test-codex-workspace.mjs"],',
  };
  const original = commands[profile];
  assert(original, `unsupported fixture verification profile ${profile}`);
  assert(fixtureSource.includes(original), `fixture did not contain the ${profile} verification command`);
  let patchedSource = fixtureSource.replace(original, `${JSON.stringify(profile)}: ["fixture-verification", "./scripts/test-codex-workspace.mjs"],`);
  if (mode === "ambiguous-result") {
    const spawnLine = "const result = spawnSync(resolved.command, resolved.args, spawnOptions);";
    assert(patchedSource.includes(spawnLine), "fixture did not contain the verification spawn boundary");
    patchedSource = patchedSource.replace(
      spawnLine,
      [
        'const result = process.env.CODEX_WORKSPACE_FIXTURE_AMBIGUOUS_RESULT === "1" && resolved.command === "fixture-verification"',
        '  ? { status: null, signal: null, error: null, stdout: "", stderr: "" }',
        "  : spawnSync(resolved.command, resolved.args, spawnOptions);",
      ].join("\n"),
    );
  }
  writeFileSync(fixture.script, patchedSource);
  runGit(fixture.root, ["add", "scripts/codex-workspace.mjs"]);
  runGit(fixture.root, ["commit", "-q", "-m", `fixture verification command ${mode}`]);

  const verificationCommand = join(fixture.fakeBin, "fixture-verification");
  const selected = {
    success: "exit 0",
    timeout: "sleep 1\nexit 0",
    nonzero: "echo 'fixture verification failed' >&2\nexit 23",
    "secret-nonzero": "echo 'fixture-secret-token-123' >&2\nexit 23",
    "later-stage-nonzero": "echo '> pnpm run check:later-stage'\necho 'fixture-later-stage-secret' >&2\nexit 23",
    signal: "kill -TERM $$",
  }[mode];
  if (mode === "launch-error") {
    writeFileSync(verificationCommand, "#!/definitely-missing-codex-workspace-fixture-command\n");
  } else if (mode === "ambiguous-result") {
    return;
  } else {
    assert(selected, `unknown fixture verification mode ${mode}`);
    writeFileSync(verificationCommand, `#!/bin/sh\n${selected}\n`);
  }
  chmodSync(verificationCommand, 0o755);
}

function installFixtureResumableCheckPlan(fixture, stages, stageModes = {}, checkStages = stages, declaredCheckStages) {
  assert(Array.isArray(stages) && stages.length > 0, "resumable check fixture requires at least one stage");
  assert(Array.isArray(checkStages) && checkStages.length > 0, "resumable check fixture requires a check script");
  if (declaredCheckStages === undefined) {
    assert(
      checkStages.every((stage) => stages.includes(stage)),
      "resumable check fixture requires explicit declared source stages when a check source is outside its executable plan",
    );
    declaredCheckStages = checkStages;
  }
  assert(Array.isArray(declaredCheckStages), "resumable check fixture requires declared source scripts");
  const stageLog = join(fixture.stateRoot, "resumable-check-stages.log");
  const scripts = {
    check: checkStages.map((stage) => `pnpm run ${stage}`).join(" && "),
  };
  for (const stage of stages) {
    scripts[stage] = `fixture-resumable-stage ${stage}`;
  }
  for (const sourceStage of declaredCheckStages) {
    if (!scripts[sourceStage]) scripts[sourceStage] = `fixture-resumable-stage ${sourceStage}`;
  }
  if (scripts["check:fast"] && !scripts["check:workspace-fast"]) {
    scripts["check:workspace-fast"] = "fixture-resumable-stage check:workspace-fast";
  }
  writeFileSync(join(fixture.worktree, "package.json"), `${JSON.stringify({ scripts })}\n`);
  writeFileSync(join(fixture.worktree, ".gitignore"), "node_modules/\npnpm-lock.yaml\n");
  runGit(fixture.worktree, ["add", "package.json", ".gitignore"]);
  runGit(fixture.worktree, ["commit", "-q", "-m", "fixture resumable check plan"]);

  const stageCommand = join(fixture.fakeBin, "fixture-resumable-stage");
  const modeCases = Object.entries(stageModes)
    .map(([stage, mode]) => {
      if (mode === "secret-nonzero") return `  ${JSON.stringify(stage)}) echo 'fixture-packet-secret' >&2; exit 23 ;;`;
      throw new Error(`unknown resumable check fixture stage mode ${mode}`);
    })
    .join("\n");
  writeFileSync(
    stageCommand,
    [
      "#!/bin/sh",
      'stage="$1"',
      'if [ -n "${CODEX_WORKSPACE_FIXTURE_STAGE_LOG:-}" ]; then echo "$stage" >> "$CODEX_WORKSPACE_FIXTURE_STAGE_LOG"; fi',
      "case \"$stage\" in",
      modeCases,
      "esac",
      "exit 0",
      "",
    ].join("\n"),
  );
  chmodSync(stageCommand, 0o755);
  fixture.env = { ...fixture.env, CODEX_WORKSPACE_FIXTURE_STAGE_LOG: stageLog };
  return stageLog;
}

function installFixtureProductionShapeExternalCheckStageHandoffPlan(fixture) {
  const stages = [
    "check:ci-fast",
    "test:codex-workspace-state",
    "test:workspace-command-resolution",
    "test:base-checkout-recovery",
    "test:mutation-admission",
    "test:mutation-admission-workspace-handoff",
    "test:mutation-admission-prewrite-guard",
    "test:codex-workspace",
    "check:sandbox-fast",
    "check:dashboard-fast",
    "check:handoff-later",
  ];
  const checkStages = ["check:fast", "check:handoff-later"];
  return {
    stages,
    stageLog: installFixtureResumableCheckPlan(fixture, stages, {}, checkStages, checkStages),
  };
}

function readFixtureStageLog(path) {
  return existsSync(path) ? readFileSync(path, "utf8").trim().split(/\r?\n/).filter(Boolean) : [];
}

function installFixtureResumableCheckPauseAfterStageSeam(fixture) {
  const source = readFileSync(fixture.script, "utf8");
  const started = "  const started = Date.now();";
  const remaining = "    const remainingMs = resumableCheckInvocationBudgetMs - (Date.now() - started);";
  assert(source.includes(started) && source.includes(remaining), "fixture did not contain the resumable check clock seams");
  const patched = source
    .replace(
      started,
      [
        "  let fixturePacketClockCalls = 0;",
        "  const fixturePacketNow = () => {",
        "    const now = Date.now();",
        '    return process.env.CODEX_WORKSPACE_FIXTURE_PACKET_PAUSE_AFTER_STAGE === "1" && fixturePacketClockCalls++ >= 2',
        "      ? now + resumableCheckInvocationBudgetMs",
        "      : now;",
        "  };",
        "  const started = fixturePacketNow();",
      ].join("\n"),
    )
    .replace(remaining, "    const remainingMs = resumableCheckInvocationBudgetMs - (fixturePacketNow() - started);");
  writeFileSync(fixture.script, patched);
  runGit(fixture.root, ["add", "scripts/codex-workspace.mjs"]);
  runGit(fixture.root, ["commit", "-q", "-m", "fixture resumable check pause clock"]);
  fixture.env = { ...fixture.env, CODEX_WORKSPACE_FIXTURE_PACKET_PAUSE_AFTER_STAGE: "1" };
}

function installFixtureResumableCheckSupervisorReserveSeam(fixture) {
  const source = readFileSync(fixture.script, "utf8");
  const started = "  const started = Date.now();";
  assert(source.includes(started), "fixture did not contain the resumable check start clock seam");
  const replacement = [
    '  const started = process.env.CODEX_WORKSPACE_FIXTURE_SUPERVISOR_RESERVE === "1"',
    "    ? Date.now() - (resumableCheckInvocationBudgetMs - resumableCheckSupervisorLeafExecutionReserveMs + 1)",
    "    : Date.now();",
  ].join("\n");
  writeFileSync(fixture.script, source.replace(started, replacement));
  runGit(fixture.root, ["add", "scripts/codex-workspace.mjs"]);
  runGit(fixture.root, ["commit", "-q", "-m", "fixture resumable supervisor reserve clock"]);
  fixture.env = { ...fixture.env, CODEX_WORKSPACE_FIXTURE_SUPERVISOR_RESERVE: "1" };
}

function installFixtureResumableCheckPauseBeforeStageSeam(fixture) {
  const source = readFileSync(fixture.script, "utf8");
  const started = "  const started = Date.now();";
  assert(source.includes(started), "fixture did not contain the resumable check start clock seam");
  writeFileSync(fixture.script, source.replace(started, "  const started = Date.now() - resumableCheckInvocationBudgetMs;"));
  runGit(fixture.root, ["add", "scripts/codex-workspace.mjs"]);
  runGit(fixture.root, ["commit", "-q", "-m", "fixture resumable check pre-stage pause clock"]);
}

function installFixtureResumableCheckTimeoutResultSeam(fixture, timeoutStage) {
  const source = readFileSync(fixture.script, "utf8");
  const invocation = "    const result = run(\"pnpm\", [\"run\", stage], { cwd: options.cwd, timeout, killSignal: \"SIGKILL\" });";
  assert(source.includes(invocation), "fixture did not contain the resumable check stage invocation seam");
  const replacement = [
    "    let result = run(\"pnpm\", [\"run\", stage], { cwd: options.cwd, timeout, killSignal: \"SIGKILL\" });",
    '    if (process.env.CODEX_WORKSPACE_FIXTURE_TIMEOUT_STAGE === stage) result = { status: null, signal: "SIGKILL", errorCode: "ETIMEDOUT" };',
  ].join("\n");
  writeFileSync(fixture.script, source.replace(invocation, replacement));
  runGit(fixture.root, ["add", "scripts/codex-workspace.mjs"]);
  runGit(fixture.root, ["commit", "-q", "-m", "fixture resumable supervisor timeout result"]);
  fixture.env = { ...fixture.env, CODEX_WORKSPACE_FIXTURE_TIMEOUT_STAGE: timeoutStage };
}

function installFixtureResumableCheckInterruptAfterStageWrite(fixture) {
  const source = readFileSync(fixture.script, "utf8");
  const persistedTransition = [
    "    manifest.check_verification_packet = packet;",
    "    writeManifest(manifestPath, manifest);",
  ].join("\n");
  const persistedTransitionIndex = source.lastIndexOf(persistedTransition);
  assert(persistedTransitionIndex >= 0, "fixture did not contain the persisted resumable stage transition");
  const interruption = [
    persistedTransition,
    '    if (process.env.CODEX_WORKSPACE_FIXTURE_PACKET_INTERRUPT_AFTER_STAGE_WRITE === "1" && packet.status === "partial") {',
    '      throw new Error("fixture packet interruption after committed stage");',
    "    }",
  ].join("\n");
  writeFileSync(
    fixture.script,
    `${source.slice(0, persistedTransitionIndex)}${interruption}${source.slice(persistedTransitionIndex + persistedTransition.length)}`,
  );
  runGit(fixture.root, ["add", "scripts/codex-workspace.mjs"]);
  runGit(fixture.root, ["commit", "-q", "-m", "fixture resumable packet interruption seam"]);
  fixture.env = { ...fixture.env, CODEX_WORKSPACE_FIXTURE_PACKET_INTERRUPT_AFTER_STAGE_WRITE: "1" };
}

function installFixtureExternalCheckStageEvidenceLockDrift(fixture, { expirePacket = false } = {}) {
  const source = readFileSync(fixture.script, "utf8");
  const functionStart = source.indexOf("function recordCheckStageEvidence(argv)");
  const lockRead = "    const lockedManifest = readManifest(manifestPath);";
  const lockReadIndex = source.indexOf(lockRead, functionStart);
  assert(functionStart >= 0 && lockReadIndex >= functionStart, "fixture did not contain the external handoff lock seam");
  const replacement = [
    lockRead,
    '    if (process.env.CODEX_WORKSPACE_FIXTURE_EXTERNAL_HANDOFF_LOCK_DRIFT === "1") {',
    '      lockedManifest.check_verification_packet.plan_digest = "f".repeat(64);',
    "      writeManifest(manifestPath, lockedManifest);",
    "    }",
    '    if (process.env.CODEX_WORKSPACE_FIXTURE_EXTERNAL_HANDOFF_LOCK_EXPIRY === "1") {',
    '      lockedManifest.check_verification_packet.expires_at = new Date(Date.now() - 1).toISOString();',
    "      writeManifest(manifestPath, lockedManifest);",
    "    }",
  ].join("\n");
  writeFileSync(
    fixture.script,
    `${source.slice(0, lockReadIndex)}${replacement}${source.slice(lockReadIndex + lockRead.length)}`,
  );
  runGit(fixture.root, ["add", "scripts/codex-workspace.mjs"]);
  runGit(fixture.root, ["commit", "-q", "-m", "fixture external handoff lock drift"]);
  fixture.env = {
    ...fixture.env,
    ...(expirePacket
      ? { CODEX_WORKSPACE_FIXTURE_EXTERNAL_HANDOFF_LOCK_EXPIRY: "1" }
      : { CODEX_WORKSPACE_FIXTURE_EXTERNAL_HANDOFF_LOCK_DRIFT: "1" }),
  };
}

function fixtureResumableCheckPacket(fixture, stages, overrides = {}) {
  const head = runGit(fixture.worktree, ["rev-parse", "HEAD"]).stdout;
  const planDigest = createHash("sha256").update(stages.join("\n")).digest("hex");
  const createdAt = new Date(Date.now() - 1_000).toISOString();
  const expiresAt = new Date(Date.now() + 20 * 60 * 1_000).toISOString();
  return {
    schema_version: 1,
    task_id: "resumed-task",
    owner: "runner-a",
    head,
    plan_digest: planDigest,
    staged_input_digest: fixtureStagedInputDigest(fixture),
    stages: [],
    status: "partial",
    next_stage: stages[0],
    created_at: createdAt,
    updated_at: createdAt,
    expires_at: expiresAt,
    ...overrides,
  };
}

function fixtureStagedInputDigest(fixture) {
  const tree = runGit(fixture.worktree, ["write-tree"]).stdout;
  return createHash("sha256").update(`index-tree:${tree}`).digest("hex");
}

function fixtureFailedResumableCheckPacket(fixture, stages, overrides = {}) {
  const now = new Date(Date.now() - 500).toISOString();
  return fixtureResumableCheckPacket(fixture, stages, {
    status: "failed",
    stages: [{ stage: stages[0], completed_at: now, status: null, signal: "SIGKILL", error_code: "ETIMEDOUT", output: "omitted" }],
    next_stage: stages[0],
    updated_at: now,
    failed_stage: stages[0],
    ...overrides,
  });
}

function fixtureExternalCheckStageHandoffPacket(fixture, stages, overrides = {}) {
  const targetIndex = stages.indexOf("test:codex-workspace");
  assert(targetIndex >= 0, "external handoff fixture requires test:codex-workspace in the check plan");
  const now = new Date(Date.now() - 500).toISOString();
  return fixtureResumableCheckPacket(fixture, stages, {
    status: "failed",
    stages: stages.slice(0, targetIndex + 1).map((stage, index) => ({
      stage,
      completed_at: now,
      status: index === targetIndex ? 1 : 0,
      signal: null,
      error_code: null,
      output: "omitted",
    })),
    next_stage: stages[targetIndex],
    updated_at: now,
    failed_stage: stages[targetIndex],
    ...overrides,
  });
}

function fixturePassedResumableCheckPacket(fixture, stages, overrides = {}) {
  const now = new Date(Date.now() - 500).toISOString();
  return fixtureResumableCheckPacket(fixture, stages, {
    status: "passed",
    stages: stages.map((stage) => ({ stage, completed_at: now, status: 0, signal: null, error_code: null, output: "omitted" })),
    next_stage: null,
    updated_at: now,
    completed_at: now,
    ...overrides,
  });
}

function fixtureLegacyFailedResumableCheckPacket(fixture, stages, overrides = {}) {
  const createdAt = new Date(Date.now() - 31 * 60_000);
  const updatedAt = new Date(createdAt.getTime() + 60_000);
  const failedAt = new Date(createdAt.getTime() + 6 * 60_000);
  const expiresAt = new Date(createdAt.getTime() + 30 * 60_000);
  const packet = fixtureFailedResumableCheckPacket(fixture, stages, {
    created_at: createdAt.toISOString(),
    updated_at: updatedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    stages: [
      { stage: stages[0], completed_at: updatedAt.toISOString(), status: 0, signal: null, error_code: null, output: "omitted" },
      { stage: stages[1], completed_at: failedAt.toISOString(), status: null, signal: "SIGKILL", error_code: "ETIMEDOUT", output: "omitted" },
    ],
    next_stage: stages[1],
    failed_stage: stages[1],
  });
  delete packet.staged_input_digest;
  return { ...packet, ...overrides };
}

function fixtureLegacyPassedResumableCheckPacket(fixture, stages, overrides = {}) {
  const createdAt = new Date(Date.now() - 31 * 60_000);
  const updatedAt = new Date(createdAt.getTime() + 60_000);
  const completedAt = new Date(createdAt.getTime() + 6 * 60_000);
  const expiresAt = new Date(createdAt.getTime() + 30 * 60_000);
  const packet = fixturePassedResumableCheckPacket(fixture, stages, {
    created_at: createdAt.toISOString(),
    updated_at: updatedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    completed_at: completedAt.toISOString(),
    stages: [
      { stage: stages[0], completed_at: updatedAt.toISOString(), status: 0, signal: null, error_code: null, output: "omitted" },
      { stage: stages[1], completed_at: completedAt.toISOString(), status: 0, signal: null, error_code: null, output: "omitted" },
    ],
    next_stage: null,
  });
  delete packet.staged_input_digest;
  return { ...packet, ...overrides };
}

function installFixtureDeliveryProbes(fixture, { allowDelivery = false } = {}) {
  const pushProbe = join(fixture.root, "git-push-called.txt");
  const prProbe = join(fixture.root, "gh-pr-create-called.txt");
  const realPath = (process.env.PATH || "").split(":").filter((entry) => entry && entry !== fixture.fakeBin).join(":");
  writeFileSync(
    join(fixture.fakeBin, "git"),
    [
      `#!${process.execPath}`,
      "import { spawnSync } from 'node:child_process';",
      "import { writeFileSync } from 'node:fs';",
      "const args = process.argv.slice(2);",
      `if (args[0] === 'push') { writeFileSync(${JSON.stringify(pushProbe)}, 'called\\n'); if (!${allowDelivery}) process.exit(1); }`,
      `const result = spawnSync('git', args, { cwd: process.cwd(), env: { ...process.env, PATH: ${JSON.stringify(realPath)} }, stdio: 'inherit' });`,
      "process.exit(result.status ?? 1);",
      "",
    ].join("\n"),
  );
  chmodSync(join(fixture.fakeBin, "git"), 0o755);
  writeFileSync(
    join(fixture.fakeBin, "gh"),
    [
      `#!${process.execPath}`,
      "import { writeFileSync } from 'node:fs';",
      "const args = process.argv.slice(2);",
      "if (args[0] === '--version') { console.log('gh version test'); process.exit(0); }",
      "if (args[0] === 'pr' && args[1] === 'view') { process.exit(1); }",
      `if (args[0] === 'pr' && args[1] === 'create') { writeFileSync(${JSON.stringify(prProbe)}, 'called\\n'); if (${allowDelivery}) { console.log('https://example.test/pull/456'); process.exit(0); } process.exit(1); }`,
      "console.error(`unexpected gh args: ${args.join(' ')}`);",
      "process.exit(1);",
      "",
    ].join("\n"),
  );
  chmodSync(join(fixture.fakeBin, "gh"), 0o755);
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
      `  console.log(JSON.stringify({ number: 123, url: 'https://example.test/pull/123', mergedAt: '2026-06-21T00:00:00Z', state: 'MERGED', baseRefName: 'main', headRefName: '${branch}', headRefOid: '${branchHead}' }));`,
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
      delivery_subagent_audit: {
        schemaVersion: 1,
        status: "cleanup-ready",
        agent: "Wegener",
        summary: "Exact-head cleanup audit passed.",
        headSha: branchHead,
        checkedAt: "2026-06-21T00:00:00.000Z",
        source: "delivery-subagent",
        blockers: [],
        metadataOnly: true,
        rawPayloadRetained: false,
      },
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

function installFixtureGitProxy(fixture, failureCondition, failureMessage) {
  const realPath = (process.env.PATH || "").split(":").filter((entry) => entry && entry !== fixture.fakeBin).join(":");
  const fakeGit = join(fixture.fakeBin, "git");
  writeFileSync(
    fakeGit,
    [
      "#!/usr/bin/env node",
      "import { spawnSync } from 'node:child_process';",
      "const args = process.argv.slice(2);",
      `if (${failureCondition}) {`,
      `  console.error(${JSON.stringify(failureMessage)});`,
      "  process.exit(1);",
      "}",
      `const result = spawnSync('git', args, { cwd: process.cwd(), env: { ...process.env, PATH: ${JSON.stringify(realPath)} }, stdio: 'inherit' });`,
      "process.exit(result.status ?? 1);",
      "",
    ].join("\n"),
  );
  chmodSync(fakeGit, 0o755);
  return fakeGit;
}

function installFixtureGitPostSuccessHook(fixture, successCondition, hookArgs) {
  const realPath = (process.env.PATH || "").split(":").filter((entry) => entry && entry !== fixture.fakeBin).join(":");
  const fakeGit = join(fixture.fakeBin, "git");
  writeFileSync(
    fakeGit,
    [
      "#!/usr/bin/env node",
      "import { spawnSync } from 'node:child_process';",
      "const args = process.argv.slice(2);",
      `const env = { ...process.env, PATH: ${JSON.stringify(realPath)} };`,
      "const result = spawnSync('git', args, { cwd: process.cwd(), env, stdio: 'inherit' });",
      "if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);",
      `if (${successCondition}) {`,
      `  const hook = spawnSync('git', ${JSON.stringify(hookArgs)}, { cwd: process.cwd(), env, stdio: 'inherit' });`,
      "  if ((hook.status ?? 1) !== 0) process.exit(hook.status ?? 1);",
      "}",
      "process.exit(0);",
      "",
    ].join("\n"),
  );
  chmodSync(fakeGit, 0o755);
  return fakeGit;
}

function writeFixtureGhPrView(fixture, headRefOid) {
  const fakeGh = join(fixture.fakeBin, "gh");
  writeFileSync(
    fakeGh,
    [
      "#!/usr/bin/env node",
      "const args = process.argv.slice(2);",
      "if (args[0] === '--version') { console.log('gh version test'); process.exit(0); }",
      "if (args[0] === 'pr' && args[1] === 'view') {",
      `  console.log(JSON.stringify({ number: 123, url: 'https://example.test/pull/123', mergedAt: '2026-06-21T00:00:00Z', state: 'MERGED', baseRefName: 'main', headRefName: ${JSON.stringify(fixture.branch)}, headRefOid: ${JSON.stringify(headRefOid)} }));`,
      "  process.exit(0);",
      "}",
      "console.error(`unexpected gh args: ${args.join(' ')}`);",
      "process.exit(1);",
      "",
    ].join("\n"),
  );
  chmodSync(fakeGh, 0o755);
}

function writeFixtureGhPrPayload(fixture, payload) {
  const fakeGh = join(fixture.fakeBin, "gh");
  writeFileSync(
    fakeGh,
    [
      "#!/usr/bin/env node",
      "const args = process.argv.slice(2);",
      "if (args[0] === '--version') { console.log('gh version test'); process.exit(0); }",
      "if (args[0] === 'pr' && args[1] === 'view') {",
      `  console.log(JSON.stringify(${JSON.stringify(payload)}));`,
      "  process.exit(0);",
      "}",
      "console.error(`unexpected gh args: ${args.join(' ')}`);",
      "process.exit(1);",
      "",
    ].join("\n"),
  );
  chmodSync(fakeGh, 0o755);
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

function createIntegratedCleanupFixture(options = {}) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "codex-integrated-cleanup-"));
  const remoteRoot = `${fixtureRoot}-remote.git`;
  const stateRootFixture = join(fixtureRoot, "state");
  const fakeBin = join(fixtureRoot, "bin");
  const taskId = options.taskId || "integrated-task";
  const baseBranch = options.baseBranch || "main";
  const remoteBranch = options.remoteBranch !== false;
  const branch = "codex/integrated-cleanup";
  const worktree = join(stateRootFixture, "worktrees", "integrated-task");
  const manifestOwner = options.manifestOwner || "runner-a";
  const assignmentOwner = options.assignmentOwner || manifestOwner;
  const env = { ...process.env, PATH: `${fakeBin}:${process.env.PATH || ""}` };

  copyWorkspaceScriptFixture(fixtureRoot);
  mkdirSync(fakeBin, { recursive: true });
  const fakeGh = join(fakeBin, "gh");
  writeFileSync(
    fakeGh,
    [
      "#!/usr/bin/env node",
      "import { existsSync, readFileSync, writeFileSync } from 'node:fs';",
      "const args = process.argv.slice(2);",
      "if (args[0] === '--version') { console.log('gh version test'); process.exit(0); }",
      "if (args[0] === 'pr' && args[1] === 'list') {",
      "  const sequenceJson = process.env.CODEX_WORKSPACE_TEST_GH_PR_LIST_SEQUENCE_JSON || '';",
      "  if (sequenceJson) {",
      "    const counterPath = process.env.CODEX_WORKSPACE_TEST_GH_PR_LIST_COUNTER_PATH;",
      "    const index = counterPath && existsSync(counterPath) ? Number(readFileSync(counterPath, 'utf8')) || 0 : 0;",
      "    if (counterPath) writeFileSync(counterPath, String(index + 1));",
      "    const sequence = JSON.parse(sequenceJson);",
      "    console.log(JSON.stringify(sequence[Math.min(index, sequence.length - 1)] ?? []));",
      "    process.exit(0);",
      "  }",
      "  console.log(process.env.CODEX_WORKSPACE_TEST_GH_PR_LIST_JSON || '[]');",
      "  process.exit(0);",
      "}",
      "console.error(`unexpected gh command: ${args.join(' ')}`);",
      "process.exit(1);",
      "",
    ].join("\n"),
  );
  chmodSync(fakeGh, 0o755);
  runGit(fixtureRoot, ["init", "-q"]);
  runGit(fixtureRoot, ["config", "user.email", "codex-workspace-test@example.com"]);
  runGit(fixtureRoot, ["config", "user.name", "Codex Workspace Test"]);
  commitFile(fixtureRoot, "base.txt", "base\n", "base");
  commitFile(fixtureRoot, ".gitignore", "_bmad-output/\n", "ignore local bmad output");
  runGit(fixtureRoot, ["branch", "-M", baseBranch]);
  mkdirSync(remoteRoot, { recursive: true });
  runGit(remoteRoot, ["init", "--bare", "-q"]);
  runGit(fixtureRoot, ["remote", "add", "origin", remoteRoot]);
  runGit(fixtureRoot, ["push", "-q", "-u", "origin", baseBranch]);
  runGit(fixtureRoot, ["branch", branch, baseBranch]);
  if (options.diverged) {
    runGit(fixtureRoot, ["switch", "-q", branch]);
    commitFile(fixtureRoot, "diverged.txt", "not integrated\n", "diverged work");
    runGit(fixtureRoot, ["switch", "-q", baseBranch]);
  }
  if (remoteBranch) runGit(fixtureRoot, ["push", "-q", "-u", "origin", branch]);
  mkdirSync(join(stateRootFixture, "worktrees"), { recursive: true });
  runGit(fixtureRoot, ["worktree", "add", "-q", worktree, branch]);

  mkdirSync(join(stateRootFixture, "tasks"), { recursive: true });
  writeFileSync(
    join(stateRootFixture, "tasks", `${taskId}.json`),
    `${JSON.stringify({
      schema_version: 1,
      task_id: taskId,
      title: "Integrated task",
      description: "integrated task",
      repo_name: "fixture",
      repo_root: worktree,
      state_root: stateRootFixture,
      base_branch: baseBranch,
      base_ref: `origin/${baseBranch}`,
      branch,
      worktree_path: worktree,
      status: "active",
      mode: "pr",
      source_assignment_id: "integrated-assignment",
      owner: manifestOwner,
      events: [],
    }, null, 2)}\n`,
  );
  mkdirSync(join(stateRootFixture, "assignments"), { recursive: true });
  writeFileSync(
    join(stateRootFixture, "assignments", "integrated-assignment.json"),
    `${JSON.stringify({
      schema_version: 1,
      assignment_id: "integrated-assignment",
      task_id: taskId,
      lane_slug: taskId,
      branch,
      worktree_path: worktree,
      status: "claimed",
      owner: assignmentOwner,
      phase: "handoff",
      runner_kind: "codex-cli",
      events: [],
      source_backlog_item: {
        item_id: taskId,
        branch_name: branch,
      },
    }, null, 2)}\n`,
  );

  return {
    root: fixtureRoot,
    remoteRoot,
    stateRoot: stateRootFixture,
    fakeBin,
    taskId,
    baseBranch,
    branch,
    worktree,
    script: join(fixtureRoot, "scripts", "codex-workspace.mjs"),
    env: {
      ...env,
      CODEX_WORKSPACE_TEST_GH_PR_LIST_JSON: options.prListJson || "[]",
      CODEX_WORKSPACE_TEST_GH_PR_LIST_SEQUENCE_JSON: options.prListSequence ? JSON.stringify(options.prListSequence) : "",
      CODEX_WORKSPACE_TEST_GH_PR_LIST_COUNTER_PATH: join(fakeBin, "gh-pr-list-count"),
    },
  };
}

function exactTreeCloseoutArgs(fixture) {
  return [
    "cleanup-integrated",
    fixture.taskId,
    "--exact-tree-closeout",
    "--base",
    "origin/dev",
    "--supersession-provenance",
    "Tailnet persistence source is exactly retained by origin/dev",
    "--closeout-reason",
    "operator approved exact local closeout after supersession",
    "--owner",
    "runner-a",
    "--state-root",
    fixture.stateRoot,
  ];
}

function cleanupIntegratedCleanupFixture(fixture) {
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

function assertSupersededBlockedScenario(mutation) {
  const fixture = createSupersededCleanupFixture(mutation === "source-head" ? {} : { mutation });
  if (mutation === "held") {
    assert(readJson(join(fixture.stateRoot, "tasks", "superseded-task.json")).status === "held", "held fixture must persist held manifest status");
  }
  const args = [
    "cleanup-superseded",
    "superseded-task",
    "--source-head",
    mutation === "source-head" ? fixture.carryForwardCommit : fixture.sourceHead,
    "--carry-forward-pr",
    "456",
    "--carry-forward-commit",
    fixture.carryForwardCommit,
    "--scope",
    "carried.txt",
    "--owner",
    "runner-a",
    "--state-root",
    fixture.stateRoot,
  ];
  try {
    const result = runFixtureScript(fixture, [...args, "--summary-json"], { env: fixture.env });
    assert(result.code === 0, result.stderr || result.stdout);
    const summary = JSON.parse(result.stdout);
    assert(summary.requestedProof.sourceHead === args[3], `${mutation} fixture did not pass the requested source head`);
    assert(summary.counts.cleanupReady === 0, result.stdout || result.stderr);
    assert(summary.results[0].status === "blocked", result.stdout || result.stderr);
    assert(existsSync(fixture.worktree), `${mutation} blocker removed source worktree`);
    assert(branchExists(fixture.root, fixture.branch), `${mutation} blocker deleted source branch`);
  } finally {
    cleanupSupersededCleanupFixture(fixture);
  }
}

function supersededCleanupArgs(fixture, scope = "carried.txt", owner = "runner-a") {
  return [
    "cleanup-superseded",
    "superseded-task",
    "--source-head",
    fixture.sourceHead,
    "--carry-forward-pr",
    "456",
    "--carry-forward-commit",
    fixture.carryForwardCommit,
    "--scope",
    scope,
    "--owner",
    owner,
    "--state-root",
    fixture.stateRoot,
  ];
}

function legacyFirstUseSupersededArgs(fixture) {
  return [
    "cleanup-superseded",
    "superseded-task",
    "--source-head",
    fixture.sourceHead,
    "--carry-forward-pr",
    "456",
    "--carry-forward-commit",
    fixture.carryForwardCommit,
    "--scope",
    `${fixture.carriedPath},hardened.txt`,
    "--first-use-repair",
    "--canonical-base",
    "dev",
    "--supersession-provenance",
    "audited migration from deleted predecessor base via PR 456",
    "--source-remote",
    "absent",
    "--legacy-unassigned",
    "--successor-hardening-commits",
    fixture.successorHead,
    "--successor-hardening-scope",
    "hardened.txt",
    "--successor-hardening-evidence",
    "review hardening bounded to the named successor PR lineage",
    "--owner",
    "runner-a",
    "--state-root",
    fixture.stateRoot,
  ];
}

function replaceOption(args, option, value) {
  const index = args.indexOf(option);
  assert(index >= 0, `missing option ${option}`);
  const replaced = [...args];
  replaced[index + 1] = value;
  return replaced;
}

function markSupersededCleanupPartial(fixture, { removeWorktree, deleteLocalBranch }) {
  if (removeWorktree) {
    runGit(fixture.root, ["worktree", "remove", fixture.worktree]);
  }
  if (deleteLocalBranch) {
    assert(!existsSync(fixture.worktree), "partial fixture must remove the source worktree before deleting its checked-out branch");
    runGit(fixture.root, ["update-ref", "-d", `refs/heads/${fixture.branch}`, fixture.sourceHead]);
  }
  const manifestPath = join(fixture.stateRoot, "tasks", "superseded-task.json");
  const manifest = readJson(manifestPath);
  manifest.status = "cleanup_partial";
  manifest.cleanup_error = "simulated interruption after exact supersession resource cleanup";
  manifest.cleanup_started_at = new Date().toISOString();
  manifest.cleanup_branch = fixture.branch;
  manifest.cleanup_expected_head_sha = fixture.sourceHead;
  manifest.cleanup_local_branch_sha = deleteLocalBranch ? null : fixture.sourceHead;
  manifest.cleanup_supersession_evidence = {
    schemaVersion: 1,
    remoteBranchPolicy: "retained",
    proof: {
      source: { requestedHead: fixture.sourceHead },
      carryForward: { prNumber: 456, requestedCommit: fixture.carryForwardCommit },
      scope: { paths: ["carried.txt"] },
    },
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function markFirstUseSupersededCleanupPartial(fixture, proof) {
  const manifestPath = join(fixture.stateRoot, "tasks", "superseded-task.json");
  const manifest = readJson(manifestPath);
  const appliedAt = new Date().toISOString();
  manifest.status = "cleanup_partial";
  manifest.cleanup_error = "simulated interruption after durable first-use superseded cleanup journal";
  manifest.cleanup_started_at = appliedAt;
  manifest.cleanup_owner = manifest.owner || null;
  manifest.cleanup_branch = fixture.branch;
  manifest.cleanup_expected_head_sha = fixture.sourceHead;
  manifest.cleanup_local_branch_sha = null;
  manifest.cleanup_remote_branch_sha = null;
  manifest.cleanup_remote_branch_deleted_at = null;
  manifest.cleanup_remote_branch_policy = "absent-first-use-superseded-cleanup";
  manifest.cleanup_supersession_evidence = {
    schemaVersion: 1,
    appliedAt,
    approval: "fixture approved first-use superseded cleanup journal",
    reason: "fixture records the exact first-use proof before local deletion",
    proof,
    remoteBranchPolicy: "absent",
    metadataOnly: true,
    rawPayloadRetained: false,
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifestPath;
}

function createSupersededCleanupFixture(options = {}) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "codex-superseded-cleanup-"));
  const remoteRoot = `${fixtureRoot}-remote.git`;
  const stateRootFixture = join(fixtureRoot, "state");
  const fakeBin = join(fixtureRoot, "bin");
  const branch = "codex/superseded-cleanup";
  const worktree = join(stateRootFixture, "worktrees", "superseded-task");
  const env = { ...process.env, PATH: `${fakeBin}:${process.env.PATH || ""}` };

  copyWorkspaceScriptFixture(fixtureRoot);
  mkdirSync(fakeBin, { recursive: true });
  runGit(fixtureRoot, ["init", "-q"]);
  runGit(fixtureRoot, ["config", "user.email", "codex-workspace-test@example.com"]);
  runGit(fixtureRoot, ["config", "user.name", "Codex Workspace Test"]);
  commitFile(fixtureRoot, "base.txt", "base\n", "base");
  if (options.firstUseRepair) commitFile(fixtureRoot, "hardened.txt", "original hardening surface\n", "add hardening surface");
  runGit(fixtureRoot, ["branch", "-M", "main"]);
  mkdirSync(remoteRoot, { recursive: true });
  runGit(remoteRoot, ["init", "--bare", "-q"]);
  runGit(fixtureRoot, ["remote", "add", "origin", remoteRoot]);
  runGit(fixtureRoot, ["push", "-q", "-u", "origin", "main"]);
  const baseBranch = options.firstUseRepair ? "dev" : "main";
  if (options.firstUseRepair) {
    runGit(fixtureRoot, ["branch", "dev", "main"]);
    runGit(fixtureRoot, ["push", "-q", "-u", "origin", "dev"]);
  }
  if (options.renameOnly) {
    commitFile(fixtureRoot, "rename/old.txt", "rename source\n", "base rename source");
    runGit(fixtureRoot, ["push", "-q", "origin", "main"]);
  }

  runGit(fixtureRoot, ["switch", "-q", "-c", branch, baseBranch]);
  const carriedPath = options.newlineNestedPath ? "carried/new\nline.txt" : "carried.txt";
  if (options.renameOnly) {
    runGit(fixtureRoot, ["mv", "rename/old.txt", "rename/new.txt"]);
    runGit(fixtureRoot, ["commit", "-q", "-m", "source rename"]);
  } else {
    commitFile(fixtureRoot, carriedPath, "carried forward\n", "source work");
  }
  if (options.extraSourceDelta) commitFile(fixtureRoot, "uncovered.txt", "must be scoped\n", "uncovered source delta");
  const sourceHead = runGit(fixtureRoot, ["rev-parse", "HEAD"]).stdout;
  runGit(fixtureRoot, ["push", "-q", "-u", "origin", branch]);
  if (options.firstUseRepair) runGit(fixtureRoot, ["push", "-q", "origin", "--delete", branch]);
  runGit(fixtureRoot, ["switch", "-q", baseBranch]);
  if (options.renameOnly) {
    commitFile(fixtureRoot, "rename/new.txt", "rename source\n", "carry renamed content without deleting old path");
  } else {
    commitFile(fixtureRoot, carriedPath, options.mutation === "content" ? "different content\n" : "carried forward\n", "carry source content forward");
  }
  const carryForwardCommit = runGit(fixtureRoot, ["rev-parse", "HEAD"]).stdout;
  if (options.mutation === "content") {
    assert(
      runGit(fixtureRoot, ["rev-parse", `${sourceHead}:${carriedPath}`]).stdout !== runGit(fixtureRoot, ["rev-parse", `${carryForwardCommit}:${carriedPath}`]).stdout,
      "content mismatch fixture must have distinct scoped blobs",
    );
  }
  let successorHead = carryForwardCommit;
  let firstHardeningCommit = null;
  const hardeningLineageCommits = [];
  if (options.firstUseRepair) {
    commitFile(fixtureRoot, "hardened.txt", options.unexpectedHardening ? "unexpected hardening\n" : "review hardening\n", "fix: bounded successor hardening");
    successorHead = runGit(fixtureRoot, ["rev-parse", "HEAD"]).stdout;
    firstHardeningCommit = successorHead;
    hardeningLineageCommits.push(successorHead);
    if (options.twoHardeningCommits) {
      commitFile(fixtureRoot, "hardened.txt", "second review hardening\n", "fix: second bounded successor hardening");
      successorHead = runGit(fixtureRoot, ["rev-parse", "HEAD"]).stdout;
      hardeningLineageCommits.push(successorHead);
    }
    if (options.unlistedSuccessorDiff) {
      commitFile(fixtureRoot, "unlisted-successor.txt", "must be declared\n", "fixture unlisted successor diff");
      successorHead = runGit(fixtureRoot, ["rev-parse", "HEAD"]).stdout;
      hardeningLineageCommits.push(successorHead);
    }
    if (options.transientUnlistedSuccessorDiff) {
      commitFile(fixtureRoot, "transient-unlisted-successor.txt", "must be declared\n", "fixture transient unlisted successor diff");
      successorHead = runGit(fixtureRoot, ["rev-parse", "HEAD"]).stdout;
      hardeningLineageCommits.push(successorHead);
      runGit(fixtureRoot, ["rm", "-q", "transient-unlisted-successor.txt"]);
      runGit(fixtureRoot, ["commit", "-q", "-m", "revert fixture transient successor diff"]);
      successorHead = runGit(fixtureRoot, ["rev-parse", "HEAD"]).stdout;
      hardeningLineageCommits.push(successorHead);
    }
    if (options.stalePrHeadWithRevertedTail) {
      commitFile(fixtureRoot, "stale-head-tail.txt", "must be declared\n", "fixture stale head tail mutation");
      successorHead = runGit(fixtureRoot, ["rev-parse", "HEAD"]).stdout;
      runGit(fixtureRoot, ["rm", "-q", "stale-head-tail.txt"]);
      runGit(fixtureRoot, ["commit", "-q", "-m", "revert fixture stale head tail mutation"]);
      successorHead = runGit(fixtureRoot, ["rev-parse", "HEAD"]).stdout;
    }
  }
  let mergeCommit = successorHead;
  if (options.mergeChangesAfterHead) {
    commitFile(fixtureRoot, "hardened.txt", "merge result changed after head\n", "fixture merge result mutation");
    mergeCommit = runGit(fixtureRoot, ["rev-parse", "HEAD"]).stdout;
  }
  runGit(fixtureRoot, ["push", "-q", "origin", baseBranch]);
  let fakePrHead = options.stalePrHeadWithRevertedTail ? firstHardeningCommit : successorHead;
  if (options.unmergedPrHead) {
    runGit(fixtureRoot, ["switch", "-q", "-c", "fixture-unmerged-pr-head", carryForwardCommit]);
    commitFile(fixtureRoot, "sibling-pr-head.txt", "not merged\n", "fixture unmerged PR head");
    fakePrHead = runGit(fixtureRoot, ["rev-parse", "HEAD"]).stdout;
    runGit(fixtureRoot, ["switch", "-q", baseBranch]);
  }
  if (options.revertedCurrentBase) {
    commitFile(fixtureRoot, carriedPath, "reverted after merge\n", "revert carried source content");
    runGit(fixtureRoot, ["push", "-q", "origin", "main"]);
  }
  const currentBaseHead = runGit(fixtureRoot, ["rev-parse", `origin/${baseBranch}`]).stdout;
  if (options.staleCanonicalRemote) {
    runGit(fixtureRoot, ["switch", "-q", "-c", "fixture-canonical-remote-advance", baseBranch]);
    commitFile(fixtureRoot, "canonical-remote-advance.txt", "remote canonical advance\n", "fixture canonical remote advance");
    const remoteAdvance = runGit(fixtureRoot, ["rev-parse", "HEAD"]).stdout;
    runGit(fixtureRoot, ["push", "-q", "origin", `${remoteAdvance}:refs/heads/fixture-canonical-remote-advance`]);
    runGit(remoteRoot, ["update-ref", `refs/heads/${baseBranch}`, remoteAdvance]);
    runGit(fixtureRoot, ["switch", "-q", baseBranch]);
  }
  runGit(fixtureRoot, ["worktree", "add", "-q", worktree, branch]);

  mkdirSync(join(stateRootFixture, "tasks"), { recursive: true });
  writeFileSync(
    join(stateRootFixture, "tasks", "superseded-task.json"),
    `${JSON.stringify({
      schema_version: 1,
      task_id: "superseded-task",
      title: "Superseded task",
      description: "no-PR source lane carried forward by merged successor",
      repo_name: "fixture",
      repo_root: worktree,
      state_root: stateRootFixture,
      base_branch: options.firstUseRepair ? (options.legacyManifestBaseMismatch ? "declared-predecessor" : "deleted-predecessor") : "main",
      base_ref: options.baseRef || (options.firstUseRepair ? (options.legacyManifestBasePresent ? "origin/main" : "origin/deleted-predecessor") : "origin/main"),
      branch,
      worktree_path: worktree,
      status: options.mutation === "held" ? "held" : "active",
      pr_delivery_head_sha: options.mutation === "pr-evidence" ? sourceHead : null,
      mode: "pr",
      source_assignment_id: options.firstUseRepair ? (options.linkedLegacyAssignment ? "legacy-assignment" : null) : "superseded-assignment",
      owner: options.manifestOwner === undefined ? "runner-a" : options.manifestOwner,
      events: [],
    }, null, 2)}\n`,
  );
  mkdirSync(join(stateRootFixture, "assignments"), { recursive: true });
  const assignmentPath = join(stateRootFixture, "assignments", "superseded-assignment.json");
  if (!options.firstUseRepair) writeFileSync(
    assignmentPath,
    `${JSON.stringify({
      schema_version: 1,
      assignment_id: "superseded-assignment",
      task_id: options.assignmentTaskId || "superseded-task",
      lane_slug: "superseded-task",
      branch,
      worktree_path: worktree,
      status: "claimed",
      owner: options.assignmentOwner === undefined ? "runner-a" : options.assignmentOwner,
      phase: "handoff",
      runner_kind: "codex-cli",
      events: [],
      source_backlog_item: { item_id: "superseded-task", branch_name: branch },
    }, null, 2)}\n`,
  );
  if (options.firstUseRepair && options.unlinkedAssignment) writeFileSync(
    join(stateRootFixture, "assignments", "unlinked-superseded-assignment.json"),
    `${JSON.stringify({
      schema_version: 1,
      assignment_id: "unlinked-superseded-assignment",
      task_id: "superseded-task",
      lane_slug: "superseded-task",
      branch,
      worktree_path: worktree,
      status: "claimed",
      owner: "runner-a",
      phase: "handoff",
      runner_kind: "codex-cli",
      events: [],
      source_backlog_item: { item_id: "superseded-task", branch_name: branch },
    }, null, 2)}\n`,
  );
  if (options.firstUseRepair && options.unlinkedBacklogAssignment) writeFileSync(
    join(stateRootFixture, "assignments", "unlinked-source-backlog-assignment.json"),
    `${JSON.stringify({
      schema_version: 1,
      assignment_id: "unlinked-source-backlog-assignment",
      task_id: "different-task",
      lane_slug: "different-task",
      branch: "codex/different-branch",
      worktree_path: join(stateRootFixture, "worktrees", "different-task"),
      status: "claimed",
      owner: "runner-a",
      phase: "handoff",
      runner_kind: "codex-cli",
      events: [],
      source_backlog_item: { item_id: "superseded-task", branch_name: "codex/different-branch" },
    }, null, 2)}\n`,
  );
  const fakeGh = join(fakeBin, "gh");
  const fallbackBaseRefOid = options.fallbackBaseRefOid === "SOURCE_HEAD"
    ? sourceHead
    : options.fallbackBaseRefOid === undefined
      ? currentBaseHead
      : options.fallbackBaseRefOid;
  const reportedBaseRefOid = options.reportedBaseRefOid === "SOURCE_HEAD"
    ? sourceHead
    : options.reportedBaseRefOid === undefined
      ? currentBaseHead
      : options.reportedBaseRefOid;
  const legacyPrNumberField = Object.hasOwn(options, "legacyPrNumber")
    ? `number: ${JSON.stringify(options.legacyPrNumber)},`
    : "number: 456,";
  const modernPrNumberField = Object.hasOwn(options, "modernPrNumber")
    ? `number: ${JSON.stringify(options.modernPrNumber)},`
    : "number: 456,";
  const reportedHeadRefOid = Object.hasOwn(options, "reportedHeadRefOid")
    ? options.reportedHeadRefOid
    : options.unsupportedBaseRefOid && !options.firstUseRepair
      ? carryForwardCommit
      : fakePrHead;
  const reportedMergeCommitOid = Object.hasOwn(options, "reportedMergeCommitOid")
    ? options.reportedMergeCommitOid
    : options.unsupportedBaseRefOid && !options.firstUseRepair
      ? carryForwardCommit
      : mergeCommit;
  const fallbackGraphql = options.unsupportedBaseRefOid
    ? [
        `const fallbackInvocationPath = ${JSON.stringify(join(fixtureRoot, "fallback-base-lookup-count"))};`,
        "let fallbackInvocationCount = 0;",
        "try { fallbackInvocationCount = Number(fs.readFileSync(fallbackInvocationPath, 'utf8')) || 0; } catch {}",
        "if (args[0] === 'api' && args[1] === 'graphql') {",
        "  if (!args.includes('owner=fixture-owner') || !args.includes('name=fixture-repo') || !args.includes('number=456') || !args.some((argument) => argument.includes('pullRequest(number:$number){number baseRefOid}'))) { console.error('fallback must resolve the exact repository and PR base field'); process.exit(1); }",
        "  fallbackInvocationCount += 1;",
        "  fs.writeFileSync(fallbackInvocationPath, String(fallbackInvocationCount));",
        `  const fallbackBaseRefOid = ${JSON.stringify(fallbackBaseRefOid)};`,
        `  const baseRefOid = ${Boolean(options.fallbackBaseDriftOnSecondLookup)} && fallbackInvocationCount >= 2 ? ${JSON.stringify(sourceHead)} : fallbackBaseRefOid;`,
        `  const errors = ${JSON.stringify(options.fallbackGraphqlErrors || [])};`,
        `  console.log(JSON.stringify({ data: { repository: { pullRequest: { number: ${JSON.stringify(options.fallbackPrNumber ?? 456)}, baseRefOid } } }, ...(errors.length ? { errors } : {}) }));`,
        "  process.exit(0);",
        "}",
      ]
    : [];
  const lockedDrift = options.lockedAssignmentDrift
    ? [
        `const invocationPath = ${JSON.stringify(join(fixtureRoot, "locked-assignment-drift-count"))};`,
        "let invocationCount = 0;",
        "try { invocationCount = Number(fs.readFileSync(invocationPath, 'utf8')) || 0; } catch {}",
        "if (args[0] === 'pr' && args[1] === 'view' && args[2] === '456') {",
        "  invocationCount += 1;",
        "  fs.writeFileSync(invocationPath, String(invocationCount));",
        "  if (invocationCount === 2) {",
        `    const assignmentPath = ${JSON.stringify(assignmentPath)};`,
        "    const assignment = JSON.parse(fs.readFileSync(assignmentPath, 'utf8'));",
        "    assignment.branch = 'codex/drifted-assignment';",
        "    fs.writeFileSync(assignmentPath, `${JSON.stringify(assignment, null, 2)}\\n`);",
        "  }",
        "}",
      ]
    : [];
  writeFileSync(
    fakeGh,
    [
      "#!/usr/bin/env node",
      "const fs = require('node:fs');",
      "const args = process.argv.slice(2);",
      "if (args[0] === '--version') { console.log('gh version test'); process.exit(0); }",
      ...lockedDrift,
      "if (args[0] === 'pr' && args[1] === 'list' && args[2] === '--head') {",
      "  if (args[args.indexOf('--limit') + 1] !== '1') { console.error('source PR existence proof must request one record'); process.exit(1); }",
      `  console.log(JSON.stringify(${options.sourcePrRecord ? "[{ number: 789 }]" : "[]"}));`,
      "  process.exit(0);",
      "}",
      "if (args[0] === 'pr' && args[1] === 'view' && args[2] === '456') {",
      options.unsupportedBaseRefOid
        ? "  if (args.some((argument) => argument.includes('baseRefOid'))) { console.error('unknown field \\\"baseRefOid\\\"'); process.exit(1); }"
        : "",
      options.legacyInvalidJson || options.modernInvalidJson
        ? "  console.log('{invalid JSON');"
        : `  console.log(JSON.stringify({ ${options.unsupportedBaseRefOid ? legacyPrNumberField : modernPrNumberField} url: 'https://example.test/pull/456', mergedAt: '2026-07-23T00:00:00Z', state: 'MERGED', baseRefName: '${options.successorBase || baseBranch}', ${options.unsupportedBaseRefOid ? "" : `baseRefOid: '${reportedBaseRefOid}',`} headRefOid: ${JSON.stringify(reportedHeadRefOid)}, mergeCommit: { oid: ${JSON.stringify(reportedMergeCommitOid)} } }));`,
      "  process.exit(0);",
      "}",
      "if (args[0] === 'repo' && args[1] === 'view') { console.log(JSON.stringify({ owner: { login: 'fixture-owner' }, name: 'fixture-repo' })); process.exit(0); }",
      ...fallbackGraphql,
      "console.error(`unexpected gh args: ${args.join(' ')}`);",
      "process.exit(1);",
      "",
    ].join("\n"),
  );
  chmodSync(fakeGh, 0o755);

  return { root: fixtureRoot, remoteRoot, stateRoot: stateRootFixture, fakeBin, branch, worktree, sourceHead, carryForwardCommit, successorHead, mergeCommit, firstHardeningCommit, hardeningLineageCommits, currentBaseHead, carriedPath, baseBranch, script: join(fixtureRoot, "scripts", "codex-workspace.mjs"), env };
}

function cleanupSupersededCleanupFixture(fixture) {
  if (!fixture) return;
  spawnSync("git", ["worktree", "remove", "--force", fixture.worktree], { cwd: fixture.root, encoding: "utf8", stdio: "pipe" });
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

function createCoordinationReportGitWorktree(prefix, options = {}) {
  const worktree = mkdtempSync(join(tmpdir(), prefix));
  runGit(worktree, ["init", "-q"]);
  runGit(worktree, ["config", "user.email", "codex-workspace-test@example.com"]);
  runGit(worktree, ["config", "user.name", "Codex Workspace Test"]);
  commitFile(worktree, "base.txt", "base\n", "base");
  if (options.dirty) {
    writeFileSync(join(worktree, "dirty.txt"), "uncommitted workspace content\n");
  }
  return worktree;
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
    env: options.env || fixture.env || process.env,
    stdio: "pipe",
  });
  return guardExpectedJsonResult(args, {
    code: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || result.error?.message || "",
  }, {
    commandPrefix: ["node", fixture.script],
  });
}

function createDirtyTakeoverFixture(name, options = {}) {
  const root = mkdtempSync(join(tmpdir(), `codex-dirty-takeover-${name}-`));
  const taskId = `stale-${name}`;
  const branch = `codex/${taskId}`;
  const stateRoot = `${root}-state`;
  const fakeBin = `${root}-bin`;
  const tasksDir = join(stateRoot, "tasks");
  const manifestPath = join(tasksDir, `${taskId}.json`);
  const worktree = root;
  copyWorkspaceScriptFixture(root);
  runGit(root, ["init", "-q"]);
  runGit(root, ["config", "user.email", "codex-workspace-test@example.com"]);
  runGit(root, ["config", "user.name", "Codex Workspace Test"]);
  writeFileSync(join(root, "tracked.txt"), "base\n");
  runGit(root, ["add", "tracked.txt", "scripts"]);
  runGit(root, ["commit", "-q", "-m", "fixture base"]);
  runGit(root, ["checkout", "-q", "-b", branch]);
  mkdirSync(tasksDir, { recursive: true });
  const heartbeat = options.heartbeat === undefined ? "2026-06-21T00:00:00.000Z" : options.heartbeat;
  const manifest = {
    task_id: taskId,
    branch,
    worktree_path: worktree,
    base_branch: "main",
    status: "active",
    owner: "runner-b",
    owner_updated_at: heartbeat,
    ...(heartbeat ? { last_heartbeat_at: heartbeat } : {}),
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  mkdirSync(fakeBin, { recursive: true });
  const fakeGh = join(fakeBin, "gh");
  writeFileSync(
    fakeGh,
    [
      "#!/usr/bin/env node",
      "const args = process.argv.slice(2);",
      "if (args[0] === 'pr' && args[1] === 'list') {",
      "  if (process.env.CODEX_WORKSPACE_TEST_DIRTY_GH_PR_LIST_EXIT) process.exit(Number(process.env.CODEX_WORKSPACE_TEST_DIRTY_GH_PR_LIST_EXIT));",
      "  console.log(process.env.CODEX_WORKSPACE_TEST_DIRTY_GH_PR_LIST_JSON || '[]');",
      "  process.exit(0);",
      "}",
      "process.exit(1);",
      "",
    ].join("\n"),
  );
  chmodSync(fakeGh, 0o755);
  return {
    root,
    script: join(root, "scripts", "codex-workspace.mjs"),
    stateRoot,
    taskId,
    branch,
    worktree,
    fakeBin,
    manifestPath,
    env: {
      ...process.env,
      CODEX_WORKSPACE_TEST_MODE: "1",
      CODEX_WORKSPACE_TEST_IGNORE_SAFE_BACKLOG_LOCAL_BRANCHES: "1",
      PATH: `${fakeBin}:${process.env.PATH || ""}`,
      CODEX_WORKSPACE_TEST_DIRTY_GH_PR_LIST_JSON: options.prListJson || "[]",
    },
  };
}

function cleanupDirtyTakeoverFixture(fixture) {
  if (!fixture) return;
  if (fixture.root) rmSync(fixture.root, { recursive: true, force: true });
  if (fixture.stateRoot) rmSync(fixture.stateRoot, { recursive: true, force: true });
  if (fixture.fakeBin) rmSync(fixture.fakeBin, { recursive: true, force: true });
}

function dirtyTakeoverArgs(fixture, dirtyPaths) {
  return [
    "takeover",
    fixture.taskId,
    "--apply",
    "--owner",
    "runner-a",
    "--takeover-reason",
    "stale owner evidence reviewed",
    "--approval",
    "operator explicitly approved the bounded dirty lane takeover",
    "--allow-dirty-in-lane",
    ...dirtyPaths.flatMap((path) => ["--dirty-paths", path]),
    "--stale-after-seconds",
    "60",
    "--state-root",
    fixture.stateRoot,
  ];
}

function readFixtureDirtyTakeoverManifest(fixture) {
  return JSON.parse(readFileSync(fixture.manifestPath, "utf8"));
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

function seedFixtureSafeBacklogSource(fixtureRoot, items) {
  const serviceDir = join(fixtureRoot, "services", "supervisor", "src", "supervisor", "application");
  mkdirSync(serviceDir, { recursive: true });
  const laneBlocks = items
    .map(
      (item) => `
        ${item.itemId.replace(/[^A-Za-z0-9_]/g, "_")}_lane = self._safe_backlog_next_lane(
            lane_slug="${item.laneSlug}",
            stop_lines=["no worker launch"],
        )`,
    )
    .join("\n");
  const itemBlocks = items
    .map((item) => {
      const laneVariable = `${item.itemId.replace(/[^A-Za-z0-9_]/g, "_")}_lane`;
      return `
            SafeDevelopmentBacklogItemView(
                itemId="${item.itemId}",
                status="${item.status}",
                priority="${item.priority}",
                recommendedSliceSize="${item.recommendedSliceSize}",
                nextLane=${laneVariable},
            )`;
    })
    .join(",\n");
  writeFileSync(
    join(serviceDir, "service.py"),
    `
class SupervisorService:
    def get_safe_development_backlog_report(self):
${laneBlocks}
        items = [
${itemBlocks}
        ]
        return SafeDevelopmentBacklogReportView(items=items)
`,
  );
}

function seedFixtureBmadSprintStatus(fixtureRoot) {
  const artifactsDir = join(fixtureRoot, "_bmad-output", "implementation-artifacts");
  mkdirSync(artifactsDir, { recursive: true });
  writeFileSync(
    join(artifactsDir, "sprint-status.yaml"),
    `
source_key: pipeline-default
source_ref: "https://example.test/spec#story-ready"
development_status:
    9-9-ready-story: "ready-for-dev" # quoted status must parse
    9-10-missing-story: ready-for-dev
    9-11-blocked-story: "blocked"
`,
  );
  writeFileSync(join(artifactsDir, "9-9-ready-story.md"), "# Story 9.9: Ready Story\n\nReady story body.\n");
}

function seedFixtureLegacyBmadSprintStatus(fixtureRoot) {
  const artifactsDir = join(fixtureRoot, "_bmad-output", "implementation-artifacts");
  mkdirSync(artifactsDir, { recursive: true });
  writeFileSync(
    join(artifactsDir, "sprint-status.yaml"),
    `
stories:
    9-12-legacy-ready-story: ready-for-dev
    9-13-legacy-backlog-story: backlog
`,
  );
  writeFileSync(join(artifactsDir, "9-12-legacy-ready-story.md"), "# Story 9.12: Legacy Ready Story\n\nReady story body.\n");
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
  mkdirSync(join(cwd, dirname(path)), { recursive: true });
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

function expectedOpenSafeBacklogCandidate() {
  return {
    slug: "setup-churn-handoff-hardening",
    title: "setup churn handoff hardening",
    branch: "codex/setup-churn-handoff-hardening",
  };
}

function bmadPipelineBacklogBranches() {
  return bmadPipelineBacklogSlugs().map((slug) => `codex/${slug}`);
}

function bmadPipelineBacklogSlugs() {
  return [
    "bmad-1-1-validate-the-pipeline-work-packet-read-contract",
    "bmad-1-2-expose-read-only-supervisor-packet-projections",
    "bmad-1-3-render-the-pipeline-cockpit-from-supervisor-packets",
    "bmad-1-4-render-packet-detail-evidence-and-recovery",
    "bmad-1-5-enforce-cockpit-ux-and-import-boundaries",
    "bmad-2-1-import-approved-obsidian-metadata-as-candidate-work",
    "bmad-2-2-preserve-source-refs-through-candidate-promotion",
    "bmad-2-3-inventory-legacy-planning-artifacts",
    "bmad-2-4-propose-legacy-artifact-dispositions",
    "bmad-2-5-prepare-user-facing-source-summaries-for-obsidian",
    "bmad-3-1-define-and-render-human-gate-actions",
    "bmad-3-2-record-durable-stage-transition-events",
    "bmad-3-3-validate-gate-state-against-event-replay",
    "bmad-3-4-submit-action-requests-without-performing-execution",
    "bmad-4-1-report-assignable-and-blocked-lanes",
    "bmad-4-2-preview-a-safe-lane-assignment",
    "bmad-4-3-claim-one-unowned-safe-lane",
    "bmad-4-4-maintain-heartbeat-and-stale-takeover-evidence",
    "bmad-4-5-prove-bounded-parallel-session-coordination",
    "bmad-5-1-execute-the-safe-runner-loop-contract",
    "bmad-5-2-capture-best-judgment-decisions-as-evidence",
    "bmad-5-3-trigger-bmad-party-mode-and-claude-review-by-policy",
    "bmad-5-4-surface-loop-stop-states-in-pipeline",
    "bmad-6-1-attach-delivery-evidence-to-work-packets",
    "bmad-6-2-prepare-pr-creation-and-update-as-gated-evidence",
    "bmad-6-3-prove-checks-review-threads-and-exact-head-state",
    "bmad-6-4-gate-merge-and-cleanup-with-rollback-evidence",
    "bmad-6-5-render-delivery-and-cleanup-in-packet-detail",
    "bmad-7-1-render-reviewable-memory-proposals",
    "bmad-7-2-route-user-facing-documentation-proposals",
    "bmad-7-3-keep-llm-wiki-derived-and-rebuildable",
    "bmad-7-4-deauthorize-unsafe-or-regressing-automation",
    "bmad-7-5-close-the-learn-loop-in-pipeline",
  ];
}

function safeBacklogReadyItemIds() {
  const servicePath = join(rootDir, "services", "supervisor", "src", "supervisor", "application", "service.py");
  const source = readFileSync(servicePath, "utf8");
  const reportMatch = source.match(/def get_safe_development_backlog_report[\s\S]*?return SafeDevelopmentBacklogReportView/);
  assert(reportMatch, "safe backlog source not found");
  return reportMatch[0]
    .split("SafeDevelopmentBacklogItemView(")
    .slice(1)
    .map((block) => ({
      itemId: pythonStringFieldFromSource(block, "itemId"),
      status: pythonStringFieldFromSource(block, "status"),
    }))
    .filter((item) => item.itemId && item.status === "ready")
    .map((item) => item.itemId);
}

function pythonStringFieldFromSource(source, fieldName) {
  const match = source.match(new RegExp(`${fieldName}=["']([^"']*)["']`));
  return match?.[1] || "";
}

function seedClosedSafeBacklogManifests(stateRootPath) {
  const tasksDir = join(stateRootPath, "tasks");
  mkdirSync(tasksDir, { recursive: true });

  for (const laneSlug of [
    "verification-surface-hardening-followup",
    "verification-surface-hardening",
    "github-delivery-hygiene",
    "read-only-evidence-polish-followup",
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
  if (testFilter && !name.toLowerCase().includes(testFilter)) {
    return;
  }
  executedTestCount += 1;
  invokeTest(name, fn, (marker) => console.error(marker));
  console.log(`OK: ${name}`);
}

function invokeTest(name, fn, reportFailure) {
  try {
    fn();
  } catch (error) {
    reportFailure(`TEST_FAILURE=${JSON.stringify({ test: name })}`);
    throw error;
  }
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
