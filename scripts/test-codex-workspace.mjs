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
    assert(result.stdout.includes("heartbeat <query>"), result.stdout || result.stderr);
    assert(result.stdout.includes("takeover <query>"), result.stdout || result.stderr);
    assert(result.stdout.includes("dispatch-next"), result.stdout || result.stderr);
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
    assert(result.stdout.includes("- dispatcher-assignment-panel-filter-refresh | assignable"), result.stdout || result.stderr);
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
    const expected = expectedClaimCandidate();
    seedGeneratedSuccessorPrerequisites(stateRoot);
    if (branchExists(rootDir, expected.branch)) {
      seedUnownedSafeBacklogWorkspace(stateRoot, expected.slug);
    }
    const before = taskSnapshot(tasksDir);

    const result = run(["claim-next", "--dry-run", "--owner", "runner-a", "--state-root", stateRoot]);
    const after = taskSnapshot(tasksDir);

    assert(result.code === 0, result.stderr || result.stdout);
    assert(result.stdout.includes("DRY RUN: claim-next"), result.stdout || result.stderr);
    assert(result.stdout.includes(`claim candidate ${expected.slug}`), result.stdout || result.stderr);
    assert(result.stdout.includes(`branch ${expected.branch}`), result.stdout || result.stderr);
    assert(
      result.stdout.includes(`start command node ./scripts/codex-workspace.mjs start "${expected.title}"`),
      result.stdout || result.stderr,
    );
    assert(result.stdout.includes("preview only; no manifest, branch, PR, or worktree mutation"), result.stdout || result.stderr);
    assert(result.stdout.includes("- authority-blocked-work | blocked_authority"), result.stdout || result.stderr);
    assert(before === after, "claim-next --dry-run mutated workspace manifests");
  });

  test("claim-next advances to dispatcher assignment panel filter lane after completed cleanup report", () => {
    const queueStateRoot = mkdtempSync(join(tmpdir(), "codex-claim-next-generated-queue-"));
    try {
      const assignmentsDir = join(queueStateRoot, "assignments");
      mkdirSync(assignmentsDir, { recursive: true });
      for (const laneSlug of [
        "verification-surface-hardening",
        "github-delivery-hygiene",
        "read-only-evidence-polish",
      ]) {
        writeFileSync(
          join(assignmentsDir, `${laneSlug}.json`),
          `${JSON.stringify({
            assignment_id: laneSlug,
            task_id: laneSlug,
            lane_slug: laneSlug,
            branch: `codex/${laneSlug}`,
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
      assert(result.stdout.includes("claim candidate dispatcher-assignment-panel-filter-refresh"), result.stdout || result.stderr);
      assert(result.stdout.includes("branch codex/dispatcher-assignment-panel-filter-refresh"), result.stdout || result.stderr);
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
      assert(before === after, "generated queue dry-run mutated assignment metadata");
    } finally {
      rmSync(queueStateRoot, { recursive: true, force: true });
    }
  });

  test("claim-next apply claims the next lane without creating a branch or worktree", () => {
    const claimStateRoot = mkdtempSync(join(tmpdir(), "codex-claim-next-apply-"));
    try {
      const expected = expectedClaimCandidate();
      const tasksDir = join(claimStateRoot, "tasks");
      const branch = expected.branch;
      const branchBefore = branchExists(rootDir, branch);
      if (branchBefore) {
        seedUnownedSafeBacklogWorkspace(claimStateRoot, expected.slug);
      } else {
        seedGeneratedSuccessorPrerequisites(claimStateRoot);
      }
      const beforeTasks = taskSnapshot(tasksDir);

      const result = run(["claim-next", "--apply", "--owner", "runner-a", "--state-root", claimStateRoot]);

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("APPLY: claim-next"), result.stdout || result.stderr);
      assert(branchExists(rootDir, branch) === branchBefore, "claim-next --apply changed branch state");
      assert(!existsSync(join(claimStateRoot, "worktrees")), "claim-next --apply created worktrees");
      if (branchBefore) {
        assert(result.stdout.includes(`claimed existing unowned workspace ${expected.slug}-workspace`), result.stdout || result.stderr);
        const manifest = readJson(join(tasksDir, `${expected.slug}-workspace.json`));
        assert(manifest.owner === "runner-a", "claim-next --apply did not claim existing workspace owner");
        assert(Boolean(manifest.owner_updated_at), "workspace owner claim timestamp missing");
      } else {
        assert(result.stdout.includes(`claimed ready lane ${expected.slug} for runner-a`), result.stdout || result.stderr);
        assert(
          result.stdout.includes("assignment metadata only; no branch, PR, worktree, worker, or implementation mutation"),
          result.stdout || result.stderr,
        );
        assert(taskSnapshot(tasksDir) === beforeTasks, "claim-next --apply mutated workspace task manifests");
        const assignmentPath = join(claimStateRoot, "assignments", `${expected.slug}.json`);
        assert(existsSync(assignmentPath), "claim-next --apply did not write assignment metadata");
        const assignment = JSON.parse(readFileSync(assignmentPath, "utf8"));
        assert(assignment.assignment_id === expected.slug, "assignment id mismatch");
        assert(assignment.task_id === expected.slug, "assignment task id mismatch");
        assert(assignment.status === "claimed", "assignment status mismatch");
        assert(assignment.owner === "runner-a", "assignment owner mismatch");
        assert(assignment.branch === branch, "assignment branch mismatch");
        assert(Array.isArray(assignment.stop_lines) && assignment.stop_lines.length > 0, "stop lines missing");
        assert(assignment.events.some((event) => event.type === "claimed"), "claimed event missing");
      }
    } finally {
      rmSync(claimStateRoot, { recursive: true, force: true });
    }
  });

  test("claim-next apply is idempotent for the current owner", () => {
    const claimStateRoot = mkdtempSync(join(tmpdir(), "codex-claim-next-idempotent-"));
    try {
      const expected = expectedClaimCandidate();
      if (branchExists(rootDir, expected.branch)) {
        seedClaimedSafeBacklogAssignment(claimStateRoot, expected.slug, "runner-a");
      } else {
        seedGeneratedSuccessorPrerequisites(claimStateRoot);
      }
      const first = run(["claim-next", "--apply", "--owner", "runner-a", "--state-root", claimStateRoot]);
      assert(first.code === 0, first.stderr || first.stdout);
      const second = run(["claim-next", "--apply", "--owner", "runner-a", "--state-root", claimStateRoot]);
      assert(second.code === 0, second.stderr || second.stdout);
      assert(second.stdout.includes(`refresh existing assignment ${expected.slug}`), second.stdout || second.stderr);

      const assignmentsDir = join(claimStateRoot, "assignments");
      const assignmentFiles = readdirSync(assignmentsDir).filter((name) => name.endsWith(".json"));
      assert(assignmentFiles.includes(`${expected.slug}.json`), `expected assignment file for ${expected.slug}, saw ${assignmentFiles.join(", ")}`);
      const assignment = JSON.parse(
        readFileSync(join(assignmentsDir, `${expected.slug}.json`), "utf8"),
      );
      assert(assignment.owner === "runner-a", "assignment owner changed during idempotent apply");
      assert(
        assignment.events.filter((event) => event.type === "claimed" || event.type === "claim_refreshed").length === 2,
        "idempotent apply should preserve claim evidence without duplicating assignments",
      );
    } finally {
      rmSync(claimStateRoot, { recursive: true, force: true });
    }
  });

  test("assignment-report surfaces claimed lane assignment metadata", () => {
    const claimStateRoot = mkdtempSync(join(tmpdir(), "codex-assignment-report-claimed-"));
    try {
      const expected = expectedClaimCandidate();
      if (branchExists(rootDir, expected.branch)) {
        seedClaimedSafeBacklogAssignment(claimStateRoot, expected.slug, "runner-a");
      } else {
        seedGeneratedSuccessorPrerequisites(claimStateRoot);
        const claim = run(["claim-next", "--apply", "--owner", "runner-a", "--state-root", claimStateRoot]);
        assert(claim.code === 0, claim.stderr || claim.stdout);
      }

      const report = run(["assignment-report", "--owner", "runner-a", "--state-root", claimStateRoot]);

      assert(report.code === 0, report.stderr || report.stdout);
      assert(report.stdout.includes(`- ${expected.slug} | claimed`), report.stdout || report.stderr);
      assert(
        report.stdout.includes(
          `- ${expected.slug} | claimed | owner=runner-a | branch=${expected.branch}`,
        ),
        report.stdout || report.stderr,
      );
      assert(report.stdout.includes("reason=assignment is owned by current runner"), report.stdout || report.stderr);
    } finally {
      rmSync(claimStateRoot, { recursive: true, force: true });
    }
  });

  test("heartbeat updates current-owner assignment lease evidence", () => {
    const claimStateRoot = mkdtempSync(join(tmpdir(), "codex-heartbeat-assignment-"));
    try {
      const expected = expectedClaimCandidate();
      if (branchExists(rootDir, expected.branch)) {
        seedClaimedSafeBacklogAssignment(claimStateRoot, expected.slug, "runner-a");
      } else {
        seedGeneratedSuccessorPrerequisites(claimStateRoot);
        const claim = run(["claim-next", "--apply", "--owner", "runner-a", "--state-root", claimStateRoot]);
        assert(claim.code === 0, claim.stderr || claim.stdout);
      }
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

  test("heartbeat refuses assignment owned by another runner without mutation", () => {
    const claimStateRoot = mkdtempSync(join(tmpdir(), "codex-heartbeat-owned-assignment-"));
    try {
      const expected = expectedClaimCandidate();
      if (branchExists(rootDir, expected.branch)) {
        seedClaimedSafeBacklogAssignment(claimStateRoot, expected.slug, "runner-b");
      } else {
        seedGeneratedSuccessorPrerequisites(claimStateRoot, "runner-a");
        const claim = run(["claim-next", "--apply", "--owner", "runner-b", "--state-root", claimStateRoot]);
        assert(claim.code === 0, claim.stderr || claim.stdout);
      }
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
      const expected = expectedClaimCandidate();
      if (branchExists(rootDir, expected.branch)) {
        seedUnownedSafeBacklogWorkspace(dispatchStateRoot, expected.slug);
      } else {
        seedGeneratedSuccessorPrerequisites(dispatchStateRoot);
      }
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
      assert(result.stdout.includes(`- selected lane ${expected.slug}`), result.stdout || result.stderr);
      assert(
        result.stdout.includes("- workspace action claim_and_create_workspace") ||
          result.stdout.includes("- workspace action claim_existing_workspace"),
        result.stdout || result.stderr,
      );
      assert(result.stdout.includes("- blockers none"), result.stdout || result.stderr);
      assert(result.stdout.includes("- queue states "), result.stdout || result.stderr);
      assert(result.stdout.includes("blocked_authority=1"), result.stdout || result.stderr);
      assert(result.stdout.includes("closed="), result.stdout || result.stderr);
      assert(taskSnapshot(assignmentsDir) === beforeAssignments, "dispatch dry-run mutated assignments");
      assert(taskSnapshot(tasksDir) === beforeTasks, "dispatch dry-run mutated manifests");
    } finally {
      rmSync(dispatchStateRoot, { recursive: true, force: true });
    }
  });

  test("dispatch-next apply claims unowned workspace and records handoff evidence", () => {
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
      const expected = expectedClaimCandidate();
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

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("APPLY: dispatch-next"), result.stdout || result.stderr);
      assert(result.stdout.includes("- workspace action claim_existing_workspace"), result.stdout || result.stderr);
      assert(result.stdout.includes("- readiness none"), result.stdout || result.stderr);
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      assert(manifest.owner === "runner-a", "dispatch did not claim workspace owner");
      assert(manifest.phase === "handoff", "dispatch did not mark manifest phase handoff");
      assert(Array.isArray(manifest.dispatch_handoffs), "dispatch handoff evidence missing");
      const latestHandoff = manifest.dispatch_handoffs.at(-1);
      assert(latestHandoff.readiness.status === "skipped", "readiness skip evidence missing");
      assert(latestHandoff.candidate_state_counts.active >= 1, "dispatch handoff active count missing");
      assert(latestHandoff.candidate_state_counts.blocked_authority >= 1, "dispatch handoff blocked count missing");
      assert(latestHandoff.candidate_state_counts.closed >= 1, "dispatch handoff closed count missing");
      assert(manifest.events.some((event) => event.type === "dispatch_handoff"), "dispatch event missing");
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
        "codex/dispatcher-assignment-panel-filter-refresh",
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
    try {
      const expected = expectedClaimCandidate();
      if (branchExists(rootDir, expected.branch)) {
        seedClaimedSafeBacklogAssignment(claimStateRoot, expected.slug, "runner-b");
      } else {
        seedGeneratedSuccessorPrerequisites(claimStateRoot, "runner-a");
        const first = run(["claim-next", "--apply", "--owner", "runner-b", "--state-root", claimStateRoot]);
        assert(first.code === 0, first.stderr || first.stdout);
      }
      const assignmentsDir = join(claimStateRoot, "assignments");
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
        "dispatcher-assignment-panel-filter-refresh",
      ]) {
        writeFileSync(
          join(assignmentsDir, `${laneSlug}.json`),
          `${JSON.stringify({
            assignment_id: laneSlug,
            task_id: laneSlug,
            lane_slug: laneSlug,
            branch: `codex/${laneSlug}`,
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
        "dispatcher-assignment-panel-filter-refresh",
      ].map((laneSlug) => join(assignmentsDir, `${laneSlug}.json`));
      const before = assignmentFiles.map((assignmentPath) => readFileSync(assignmentPath, "utf8")).join("\n---\n");

      const second = run(["claim-next", "--apply", "--owner", "runner-a", "--state-root", claimStateRoot]);
      const after = assignmentFiles.map((assignmentPath) => readFileSync(assignmentPath, "utf8")).join("\n---\n");

      assert(second.code !== 0, "claim-next --apply unexpectedly claimed another owner's assignment");
      assert(second.stdout.includes(`- ${expectedClaimCandidate().slug} | blocked_owned_active`), second.stdout || second.stderr);
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
      const expected = expectedClaimCandidate();
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
      const expected = expectedClaimCandidate();
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

      const result = run(["claim-next", "--apply", "--owner", "runner-a", "--state-root", claimStateRoot]);

      assert(result.code === 0, result.stderr || result.stdout);
      assert(result.stdout.includes("claimed existing unowned workspace unowned-safe-backlog"), result.stdout || result.stderr);
      assert(!existsSync(join(claimStateRoot, "assignments", `${expected.slug}.json`)), "manifest claim should not create assignment metadata");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      assert(manifest.owner === "runner-a", "claim-next --apply did not claim the unowned manifest");
      assert(Object.hasOwn(manifest, "owner_thread_id"), "owner thread id evidence missing");
      assert(Array.isArray(manifest.ownership_takeovers), "ownership takeover evidence missing");
      assert(manifest.events.some((event) => event.type === "ownership_claimed"), "ownership event missing");
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
        "dispatcher-assignment-panel-filter-refresh",
      ].map((laneSlug) => {
        const manifestPath = join(tasksDir, `owned-${laneSlug}.json`);
        writeFileSync(
          manifestPath,
          `${JSON.stringify(
            {
              task_id: `owned-${laneSlug}`,
              branch: `codex/${laneSlug}`,
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
      assert(result.stdout.includes(`- ${expectedClaimCandidate().slug} | blocked_owned_active`), result.stdout || result.stderr);
      assert(result.stdout.includes("do not mutate without explicit takeover approval"), result.stdout || result.stderr);
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
    slug: "dispatcher-assignment-panel-filter-refresh",
    title: "dispatcher assignment panel filter refresh",
    branch: "codex/dispatcher-assignment-panel-filter-refresh",
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

function seedUnownedSafeBacklogWorkspace(stateRootPath, laneSlug) {
  const tasksDir = join(stateRootPath, "tasks");
  mkdirSync(tasksDir, { recursive: true });
  writeFileSync(
    join(tasksDir, `${laneSlug}-workspace.json`),
    `${JSON.stringify(
      {
        task_id: `${laneSlug}-workspace`,
        branch: `codex/${laneSlug}`,
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

function seedClaimedSafeBacklogAssignment(stateRootPath, laneSlug, owner) {
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
        branch: `codex/${laneSlug}`,
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
