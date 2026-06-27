import { spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runAntiChurnGuidanceHookCli } from "./anti-churn-guidance-hook.mjs";
import { protectedBranches as branchFoundationProtectedBranches } from "./lib/branch-foundation.mjs";
import { currentGitRoot, workspaceKey, workspaceState } from "./lib/codex-workspace-state.mjs";
import { resolveWorkspaceCommand } from "./lib/workspace-command-resolution.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const defaultBaseBranch = "dev";
const cleanupBranchesDefaultBaseRef = "origin/main";
const rebuildIndexBaseBranch = "main";
const protectedBranches = new Set(branchFoundationProtectedBranches);
const args = process.argv.slice(2);
const command = args[0];
const commandArgs = args.slice(1);

if (!command || command === "--help" || command === "-h") {
  printHelp();
  process.exit(command ? 0 : 1);
}

try {
  switch (command) {
    case "start":
      startWorkspace(commandArgs);
      break;
    case "list":
      listWorkspaces(commandArgs);
      break;
    case "coordination-report":
      coordinationReport(commandArgs);
      break;
    case "assignment-report":
      assignmentReport(commandArgs);
      break;
    case "claim-next":
      claimNext(commandArgs);
      break;
    case "heartbeat":
      heartbeat(commandArgs);
      break;
    case "takeover":
      takeover(commandArgs);
      break;
    case "dispatch-next":
      dispatchNext(commandArgs);
      break;
    case "resume":
      resumeWorkspace(commandArgs);
      break;
    case "finish-pr":
      finishPr(commandArgs);
      break;
    case "cleanup-merged":
      cleanupMerged(commandArgs);
      break;
    case "cleanup-current":
      cleanupCurrent(commandArgs);
      break;
    case "cleanup-orphans":
      cleanupOrphans(commandArgs);
      break;
    case "cleanup-branches":
      cleanupBranches(commandArgs);
      break;
    case "repair-manifests":
      repairManifests(commandArgs);
      break;
    case "rebuild-index":
      rebuildIndex(commandArgs);
      break;
    case "doctor":
      doctor(commandArgs);
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
}

function printHelp() {
  console.log(`Usage: node ./scripts/codex-workspace.mjs <command> [options]

Commands:
  start <description>       Create a task manifest, branch, and worktree.
  list                      Show known Codex workspaces.
  coordination-report       Show a read-only workspace coordination packet.
  assignment-report         Show read-only runner assignment inventory and blockers.
  claim-next                Preview the next claimable runner assignment lane.
  heartbeat <query>         Update owner-only runner heartbeat evidence.
  takeover <query>          Build or apply explicit stale-owner takeover evidence.
  dispatch-next             Claim or resume one safe lane and record handoff evidence.
  resume <query>            Print the matching task worktree and branch.
  finish-pr [query]         Commit, push, and create/view a PR for a task.
  cleanup-merged [query]    Remove clean worktrees whose PRs are merged.
  cleanup-current           Remove the current clean worktree after its PR is merged.
  cleanup-orphans [query]   Remove orphan directories no longer registered as Git worktrees.
  cleanup-branches [query]  Remove safe local codex/* branches already present in the base ref by ancestry or patch-id.
  repair-manifests          Preview or apply conservative repairs for closed legacy manifests.
  rebuild-index             Rebuild missing manifests from Git worktrees.
  doctor                    Check local workspace protocol readiness.

Common options:
  --dry-run                 Print the planned mutation without applying it.
  --state-root <path>       Override the Codex workspace state root.
  --owner <id>              Override the lane owner recorded or checked for this command.
  --take-ownership          Reassign a lane to the current owner before mutating it.
  --takeover-reason <text>  Required with --take-ownership when another owner is recorded.

start options:
  --base <branch>           Base branch. Defaults to dev.
  --branch <branch>         Override generated branch name.
  --mode <pr|experiment>    Task mode. Defaults to pr.
  --no-fetch                Do not fetch origin before creating the branch.
  --task-id <id>            Override generated task id.
  --worktree <path>         Override generated worktree path.

list options:
  --active                  Show only non-closed workspaces.
  --owned                   Show only workspaces owned by the current runner.
  --owner <id>              Show only workspaces owned by the given owner.
  --json                    Print matching workspaces as JSON for automation.

coordination-report options:
  --json                    Print the coordination packet as JSON for automation.
  --summary-json            Print a bounded JSON summary for quick runner scans.
  --stale-after-seconds <n> Override stale owner threshold. Defaults to 86400.

assignment-report options:
  --summary-json            Print a bounded JSON summary for quick runner scans.
  --stale-after-seconds <n> Override stale owner threshold. Defaults to 86400.

claim-next options:
  --dry-run                 Preview only; no mutation.
  --apply                   Write assignment metadata for an unowned ready lane.
  --summary-json            With --dry-run, print a bounded JSON summary.
  --stale-after-seconds <n> Override stale owner threshold. Defaults to 86400.

heartbeat options:
  --phase <phase>           Runner phase. Defaults to active.
  --runner-kind <kind>      Runner kind. Defaults to codex-cli.
  --current-command <text>  Current command or wait state summary.
  --last-result <text>      Last result summary.
  --stale-after-seconds <n> Stale owner threshold to record. Defaults to 86400.

takeover options:
  --dry-run                 Print takeover packet without mutation.
  --apply                   Apply takeover after evidence gates pass.
  --summary-json            With --dry-run, print a compact JSON takeover summary.
  --takeover-reason <text>  Required. Explains takeover in at least 10 non-whitespace characters.
  --approval <text>         Required with --apply. Operator approval evidence.
  --stale-after-seconds <n> Override stale owner threshold. Defaults to 86400.

dispatch-next options:
  --dry-run                 Preview dispatch without mutation.
  --apply                   Claim/prepare one lane and record handoff evidence.
  --summary-json            With --dry-run, print a bounded JSON summary.
  --readiness <profile>     Readiness profile: doctor, preflight, none. Defaults to doctor.
  --base <branch>           Base branch for a created worktree. Defaults to dev.
  --task-id <id>            Override task id when creating a workspace.
  --worktree <path>         Override worktree path when creating a workspace.
  --no-fetch                Do not fetch origin before creating a workspace.
  --stale-after-seconds <n> Override stale owner threshold. Defaults to 86400.

finish-pr options:
  --message <text>          Commit message. Defaults to task title.
  --stage-all               Stage all current worktree changes before commit.
  --verify <profile>        Verification profile: preflight, check, codex-workspace.
  --no-verify               Skip verification command.
  --title <text>            PR title. Defaults to task title.
  --body <text>             PR body.

cleanup-merged options:
  --apply                   Apply cleanup. Without this, cleanup is dry-run.
  --delete-remote           Delete remote branch after merged cleanup.
  --summary-json            Without --apply, print a compact JSON cleanup summary.

cleanup-current options:
  --apply                   Apply cleanup. Without this, cleanup is dry-run.
  --delete-remote           Delete remote branch after merged cleanup.
  --summary-json            Without --apply, print a compact JSON cleanup summary.

cleanup-branches options:
  --apply                   Apply cleanup. Without this, cleanup is dry-run.
  --base <ref>              Ref to compare against. Defaults to origin/main.
                            Missing base refs fail closed; no fetch is performed.

repair-manifests options:
  --apply                   Apply closed-manifest repairs. Without this, repair is dry-run.
`);
}

function parseOptions(argv) {
  const positional = [];
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const [rawKey, ...inlineParts] = arg.slice(2).split("=");
    const inlineValue = inlineParts.length > 0 ? inlineParts.join("=") : undefined;
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (inlineValue !== undefined) {
      options[key] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    index += 1;
  }

  return { positional, options };
}

function startWorkspace(argv) {
  const { positional, options } = parseOptions(argv);
  const description = positional.join(" ").trim();
  if (!description) {
    throw new Error("start requires a task description.");
  }

  const usingDefaultBase = !options.base;
  const baseBranch = String(options.base || defaultBaseBranch);
  assertSafeBaseBranch(baseBranch);
  const mode = String(options.mode || "pr");
  if (!["pr", "experiment"].includes(mode)) {
    throw new Error("--mode must be either pr or experiment.");
  }
  const slug = slugify(description);
  const taskId = String(options.taskId || `${dateStamp()}-${slug}`);
  assertSafeTaskId(taskId);
  const branch = String(options.branch || `codex/${slug}`);
  assertSafeBranch(branch);

  const state = workspaceState(options);
  const owner = currentLaneOwner(options);
  const worktreePath = resolve(String(options.worktree || join(state.worktreesDir, taskId)));
  const manifestPath = join(state.tasksDir, `${taskId}.json`);
  const shouldFetch = !options.noFetch;
  if (!options.dryRun && shouldFetch) {
    fetchBaseBranch(baseBranch, { usingDefaultBase });
  }
  const baseRef = resolveBaseRef(baseBranch, { usingDefaultBase });

  if (existsSync(manifestPath)) {
    throw new Error(`Task manifest already exists: ${manifestPath}`);
  }
  if (existsSync(worktreePath)) {
    throw new Error(`Worktree path already exists: ${worktreePath}`);
  }
  if (branchExists(branch)) {
    throw new Error(`Branch already exists: ${branch}`);
  }
  if (remoteBranchExists(branch)) {
    throw new Error(`Remote branch already exists: origin/${branch}`);
  }

  const manifest = {
    schema_version: 1,
    task_id: taskId,
    title: titleFromDescription(description),
    description,
    repo_name: workspaceKey(),
    repo_root: repoRoot,
    state_root: state.root,
    base_branch: baseBranch,
    base_ref: baseRef,
    branch,
    worktree_path: worktreePath,
    status: "active",
    owner,
    owner_thread_id: process.env.CODEX_THREAD_ID || null,
    owner_acquired_at: new Date().toISOString(),
    owner_updated_at: new Date().toISOString(),
    mode,
    pr_url: null,
    pr_number: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_verified_at: null,
    last_verification_command: null,
    last_commit: null,
    events: [taskEvent("created", "workspace manifest created")],
  };

  if (options.dryRun) {
    printPlan("start", [
      shouldFetch ? `git fetch origin ${baseBranch}` : "skip fetch",
      `mkdir ${state.tasksDir}`,
      `mkdir ${state.worktreesDir}`,
      `git worktree add -b ${branch} ${worktreePath} ${baseRef}`,
      `write ${manifestPath}`,
    ]);
    printManifestSummary(manifest);
    return;
  }

  mkdirSync(state.tasksDir, { recursive: true });
  mkdirSync(state.worktreesDir, { recursive: true });
  withManifestLock(state, taskId, () => {
    runChecked("git", ["worktree", "add", "-b", branch, worktreePath, baseRef], { cwd: repoRoot });
    writeManifest(manifestPath, manifest);
  });

  console.log(`Created Codex workspace ${taskId}`);
  printManifestSummary(manifest);
}

function listWorkspaces(argv) {
  const { options } = parseOptions(argv);
  const state = workspaceState(options);
  const ownerFilter = options.owned ? currentLaneOwner(options) : options.owner ? String(options.owner) : "";
  const manifests = readManifests(state).filter(({ manifest }) => {
    if (options.active && manifest.status === "closed") {
      return false;
    }
    if (ownerFilter && manifest.owner !== ownerFilter) {
      return false;
    }
    return true;
  });
  const listRows = manifests.map(({ manifest, path }) => ({
    taskId: manifest.task_id,
    status: manifest.status,
    branch: manifest.branch,
    baseBranch: manifest.base_branch || null,
    prUrl: manifest.pr_url || null,
    prNumber: manifest.pr_number || prNumberFromUrl(manifest.pr_url || "") || null,
    owner: manifest.owner || null,
    worktreePath: manifest.worktree_path,
    worktreeExists: existsSync(manifest.worktree_path),
    manifestPath: path,
    updatedAt: manifest.updated_at || null,
    cleanup: {
      startedAt: manifest.cleanup_started_at || null,
      completedAt: manifest.cleanup_completed_at || null,
      expectedHeadSha: manifest.cleanup_expected_head_sha || null,
      error: manifest.cleanup_error || null,
    },
  }));

  if (options.json) {
    console.log(JSON.stringify(listRows, null, 2));
    return;
  }

  if (manifests.length === 0) {
    console.log(`No Codex workspaces found or matched under ${state.tasksDir}`);
    return;
  }

  for (const { manifest } of manifests) {
    console.log(
      [
        manifest.task_id,
        manifest.status,
        manifest.branch,
        manifest.pr_url || "no-pr",
        `owner=${manifest.owner || "unowned"}`,
        manifest.worktree_path,
      ].join(" | "),
    );
  }
}

function coordinationReport(argv) {
  const { options } = parseOptions(argv);
  const packet = buildCoordinationReportPacket(options);
  if (options.summaryJson) {
    console.log(JSON.stringify(buildCoordinationReportSummary(packet), null, 2));
    return;
  }
  if (options.json) {
    console.log(JSON.stringify(packet, null, 2));
    return;
  }
  printCoordinationReport(packet);
}

function buildCoordinationReportSummary(packet) {
  return {
    generatedAt: packet.generatedAt,
    stateRoot: packet.stateRoot,
    currentOwner: packet.currentOwner,
    staleAfterSeconds: packet.staleAfterSeconds,
    currentCheckout: packet.currentCheckout,
    rootStatus: packet.rootStatus,
    counts: {
      activeManagedWorktrees: packet.activeManagedWorktrees.length,
      prsWaitingAtMergeGate: packet.prsWaitingAtMergeGate.length,
      cleanActiveLanes: packet.cleanActiveLanes.length,
      dirtyActiveLanes: packet.dirtyActiveLanes.length,
      localOnlyCommits: packet.localOnlyCommits.length,
      closedButRetainedLanes: packet.closedButRetainedLanes.length,
      cleanupCandidates: packet.cleanupCandidates.length,
      blockedApprovalPackets: packet.blockedApprovalPackets.length,
      backlogSummary: packet.backlogSummary.length,
      backlogClassificationSummary: packet.backlogClassificationSummary.length,
    },
    blockedApprovalPacketStatusCounts: countByField(packet.blockedApprovalPackets, "status"),
    backlogStatusCounts: countByField(packet.backlogSummary, "status"),
    backlogClassificationStatusCounts: countByField(packet.backlogClassificationSummary, "status"),
    activeManagedWorktrees: packet.activeManagedWorktrees.map(summaryLane),
    prsWaitingAtMergeGate: packet.prsWaitingAtMergeGate.map(summaryLane),
    dirtyActiveLanes: packet.dirtyActiveLanes.map(summaryLane),
    localOnlyCommits: packet.localOnlyCommits.map((lane) => ({
      taskId: lane.taskId,
      branch: lane.branch,
      localOnlyCommits: lane.localOnlyCommits,
    })),
    cleanupCandidates: packet.cleanupCandidates.map(summaryLane),
    blockedApprovalPackets: packet.blockedApprovalPackets.slice(0, 10),
    blockedApprovalPacketsTruncated: packet.blockedApprovalPackets.length > 10,
    backlogSummary: packet.backlogSummary.slice(0, 10),
    backlogSummaryTruncated: packet.backlogSummary.length > 10,
    backlogClassificationSummary: packet.backlogClassificationSummary.slice(0, 10),
    backlogClassificationSummaryTruncated: packet.backlogClassificationSummary.length > 10,
    nextSafeSlice: packet.nextSafeSlice,
    stopLines: packet.stopLines,
  };
}

function countByField(rows, field) {
  return rows.reduce((counts, row) => {
    const key = String(row[field] || "unknown");
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function summaryLane(lane) {
  return {
    taskId: lane.taskId,
    status: lane.status,
    assignmentStatus: lane.assignmentStatus,
    branch: lane.branch,
    owner: lane.owner,
    worktreeExists: lane.worktreeExists,
    dirty: lane.dirty,
    localOnlyCommits: lane.localOnlyCommits,
    prNumber: lane.prNumber,
    nextAction: lane.nextAction,
  };
}

function buildCoordinationReportPacket(options = {}) {
  const state = workspaceState(options);
  const currentOwner = currentLaneOwner(options);
  const staleAfterSeconds = positiveInteger(options.staleAfterSeconds, 86_400);
  const generatedAt = new Date();
  const manifests = readManifests(state).map(({ manifest }) => manifest);
  const assignments = readAssignments(state).map(({ assignment }) => assignment);
  const activeManifests = manifests.filter((manifest) => manifest.status !== "closed");
  const context = { currentOwner, generatedAt, staleAfterSeconds };
  const rootStatus = parseStatus(repoRoot);
  const checkout = currentCheckoutPacket(repoRoot);
  const activeLanes = activeManifests.map((manifest) => coordinationLanePacket(manifest, context));
  const cleanActiveLanes = activeLanes.filter((lane) => lane.worktreeExists && !lane.dirty);
  const dirtyActiveLanes = activeLanes.filter((lane) => lane.dirty);
  const localOnlyCommits = activeLanes.filter((lane) => lane.localOnlyCommits > 0);
  const prWaitingAtMergeGate = activeLanes.filter((lane) => lane.status === "pr_open");
  const cleanupCandidates = activeLanes.filter((lane) => lane.assignmentStatus === "cleanup" && !lane.dirty);
  const blockedApprovalPackets = [
    ...activeLanes.filter((lane) => String(lane.assignmentStatus).startsWith("blocked")),
    ...assignments
      .map((assignment) => {
        const classification = classifyLaneAssignment(assignment, context);
        return {
          id: assignment.assignment_id,
          branch: assignment.branch || null,
          status: classification.status,
          reason: classification.reason,
          nextAction: classification.nextAction,
        };
      })
      .filter((assignment) => String(assignment.status).startsWith("blocked")),
  ];

  const manifestBranchStates = workspaceBranchStates(manifests);
  const assignmentBranchStates = assignmentBranchStatesByBranch(assignments);
  const backlogItems = readSafeBacklogItems();
  const claimEvaluations = backlogItems.map((item) =>
    evaluateClaimCandidate(item, manifests, assignments, {
      currentOwner,
      generatedAt,
      staleAfterSeconds,
    }),
  );
  const selected = claimEvaluations.find((evaluation) => evaluation.claimable) || null;
  const closedRetainedLanes = manifests
    .filter((manifest) => manifest.status === "closed")
    .map((manifest) => ({
      taskId: manifest.task_id,
      branch: manifest.branch,
      prNumber: manifest.pr_number || prNumberFromUrl(manifest.pr_url || "") || null,
      worktreePath: manifest.worktree_path,
      worktreeExists: Boolean(manifest.worktree_path && existsSync(manifest.worktree_path)),
    }));

  return {
    generatedAt: generatedAt.toISOString(),
    stateRoot: state.root,
    currentOwner,
    staleAfterSeconds,
    currentCheckout: checkout,
    rootStatus: {
      dirty: rootStatus.any,
      staged: rootStatus.staged,
      unstaged: rootStatus.unstaged,
      pathCount: rootStatus.lines.length,
    },
    activeManagedWorktrees: activeLanes,
    prsWaitingAtMergeGate: prWaitingAtMergeGate,
    cleanActiveLanes,
    dirtyActiveLanes,
    localOnlyCommits,
    closedButRetainedLanes: closedRetainedLanes,
    cleanupCandidates,
    blockedApprovalPackets,
    nextSafeSlice: selected
      ? {
          status: "claimable",
          itemId: selected.item.itemId,
          branch: selected.item.branchName || null,
          action: selected.action,
          nextAction: selected.nextAction,
        }
      : {
          status: "none",
          itemId: null,
          branch: null,
          action: "no claimable safe backlog lane found",
          nextAction: "choose the next ready safe backlog lane or wait for explicit authority approval",
        },
    backlogSummary: claimEvaluations.map((evaluation) => ({
      itemId: evaluation.item.itemId,
      sourceStatus: evaluation.item.status || "unknown",
      status: evaluation.status,
      branch: evaluation.item.branchName || null,
      reason: evaluation.reason,
      nextAction: evaluation.nextAction,
    })),
    backlogClassificationSummary: backlogItems.map((item) => {
      const classification = classifyBacklogItem(item, manifestBranchStates, assignmentBranchStates, manifests, assignments);
      return {
        itemId: item.itemId,
        sourceStatus: item.status || "unknown",
        status: classification.status,
        branch: item.branchName || null,
        reason: classification.reason,
      };
    }),
    stopLines: coordinationReportStopLines(),
  };
}

function printCoordinationReport(packet) {
  console.log("Workspace Coordination Report");
  console.log(`- Current checkout: ${packet.currentCheckout.branch || "unknown"} at ${packet.currentCheckout.shortHead || "unknown"} (${packet.currentCheckout.path})`);
  console.log(`- Root status: ${packet.rootStatus.dirty ? `dirty (${packet.rootStatus.pathCount} path(s))` : "clean"}`);
  printCoordinationRows("- Active managed worktrees:", packet.activeManagedWorktrees, formatCoordinationLane);
  printCoordinationRows("- PRs waiting at merge gate:", packet.prsWaitingAtMergeGate, formatCoordinationLane);
  printCoordinationRows("- Clean active lanes:", packet.cleanActiveLanes, formatCoordinationLane);
  printCoordinationRows("- Dirty active lanes:", packet.dirtyActiveLanes, formatCoordinationLane);
  printCoordinationRows("- Local-only commits:", packet.localOnlyCommits, (lane) => `${lane.taskId} | ${lane.branch} | ahead=${lane.localOnlyCommits}`);
  printCoordinationRows("- Closed but retained lanes:", packet.closedButRetainedLanes, (lane) => `${lane.taskId} | ${lane.branch} | worktreeExists=${lane.worktreeExists}`);
  printCoordinationRows("- Cleanup candidates:", packet.cleanupCandidates, formatCoordinationLane);
  printCoordinationRows("- Blocked approval packets:", packet.blockedApprovalPackets, (entry) => `${entry.id || entry.taskId} | ${entry.status} | ${entry.reason} | next=${entry.nextAction}`);
  console.log(`- Next safe slice: ${packet.nextSafeSlice.status} | ${packet.nextSafeSlice.action} | next=${packet.nextSafeSlice.nextAction}`);
  printCoordinationRows("- Stop lines:", packet.stopLines, (line) => line);
}

function printCoordinationRows(label, rows, formatter) {
  console.log(label);
  if (!rows.length) {
    console.log("  - none");
    return;
  }
  for (const row of rows) {
    console.log(`  - ${formatter(row)}`);
  }
}

function formatCoordinationLane(lane) {
  return `${lane.taskId} | ${lane.status} | ${lane.branch} | ${lane.cleanState} | assignment=${lane.assignmentStatus} | next=${lane.nextAction}`;
}

function coordinationLanePacket(manifest, context) {
  const classification = classifyWorkspaceAssignment(manifest, context);
  const worktreeExists = Boolean(manifest.worktree_path && existsSync(manifest.worktree_path));
  const status = worktreeExists ? parseStatus(manifest.worktree_path) : { any: false, staged: false, unstaged: false, lines: [] };
  const localOnlyCommits = worktreeExists ? commitsAheadOfBase(manifest) : 0;
  return {
    taskId: manifest.task_id,
    title: manifest.title || manifest.description || manifest.task_id,
    status: manifest.status,
    assignmentStatus: classification.status,
    reason: classification.reason,
    nextAction: classification.nextAction,
    branch: manifest.branch,
    owner: manifest.owner || null,
    worktreePath: manifest.worktree_path,
    worktreeExists,
    dirty: status.any,
    cleanState: status.any ? `dirty:${status.lines.length}` : "clean",
    staged: status.staged,
    unstaged: status.unstaged,
    localOnlyCommits,
    prUrl: manifest.pr_url || null,
    prNumber: manifest.pr_number || prNumberFromUrl(manifest.pr_url || "") || null,
  };
}

function currentCheckoutPacket(cwd) {
  const branch = git(["branch", "--show-current"], { cwd }).stdout.trim();
  const head = git(["rev-parse", "HEAD"], { cwd }).stdout.trim();
  return {
    path: cwd,
    branch: branch || "detached",
    head: head || null,
    shortHead: head ? head.slice(0, 7) : null,
  };
}

function commitsAheadOfBase(manifest) {
  const baseRef = String(manifest.base_ref || manifest.base_branch || "").trim();
  if (!baseRef) {
    return 0;
  }
  const base = git(["rev-parse", "--verify", "--quiet", baseRef], { cwd: manifest.worktree_path });
  if (base.code !== 0 || !base.stdout.trim()) {
    return 0;
  }
  const ahead = git(["rev-list", "--count", `${baseRef}..HEAD`], { cwd: manifest.worktree_path });
  const count = Number.parseInt(ahead.stdout.trim(), 10);
  return ahead.code === 0 && Number.isFinite(count) ? count : 0;
}

function coordinationReportStopLines() {
  return [
    "Merge a PR.",
    "Delete a worktree.",
    "Delete a local or remote branch.",
    "Discard local commits.",
    "Rewrite a shared branch.",
    "Resolve a review thread that has not been addressed.",
    "Start work in a lane whose scope overlaps an active dirty lane.",
    "Create an empty PR for a verified no-source refresh lane.",
    "Mutate an active workspace branch owned by another runner.",
    "Repair an active or unreadable workspace manifest without explicit inspection.",
    "Delete a remote branch with no PR record, a SHA mismatch, an open PR, or an active workspace owner.",
  ];
}

function assignmentReport(argv) {
  const { options } = parseOptions(argv);
  const state = workspaceState(options);
  const currentOwner = currentLaneOwner(options);
  const staleAfterSeconds = positiveInteger(options.staleAfterSeconds, 86_400);
  const generatedAt = new Date();
  const manifests = readManifests(state).map(({ manifest }) => manifest);
  const assignments = readAssignments(state).map(({ assignment }) => assignment);
  const backlogItems = readSafeBacklogItems();
  const manifestBranchStates = workspaceBranchStates(manifests);
  const assignmentBranchStates = assignmentBranchStatesByBranch(assignments);
  const context = {
    currentOwner,
    generatedAt,
    staleAfterSeconds,
  };

  if (options.summaryJson) {
    console.log(
      JSON.stringify(
        buildAssignmentReportSummary({
          state,
          currentOwner,
          staleAfterSeconds,
          generatedAt,
          manifests,
          assignments,
          backlogItems,
          manifestBranchStates,
          assignmentBranchStates,
        }),
        null,
        2,
      ),
    );
    return;
  }

  console.log("Assignment Report");
  console.log(`Generated: ${generatedAt.toISOString()}`);
  console.log(`State root: ${state.root}`);
  console.log(`Current owner: ${currentOwner}`);
  console.log(`Stale after seconds: ${staleAfterSeconds}`);
  console.log("Safe backlog source: services/supervisor/src/supervisor/application/service.py#get_safe_development_backlog_report");
  console.log("");

  console.log("Safe backlog candidates:");
  if (backlogItems.length === 0) {
    console.log("- none found (safe backlog source unavailable or unparsable)");
  } else {
    for (const item of backlogItems) {
      const classification = classifyBacklogItem(item, manifestBranchStates, assignmentBranchStates, manifests, assignments);
      console.log(
        [
          `- ${item.itemId}`,
          classification.status,
          `source_status=${item.status || "unknown"}`,
          `slice=${item.recommendedSliceSize || "unknown"}`,
          `branch=${item.branchName || "none"}`,
          `reason=${classification.reason}`,
        ].join(" | "),
      );
    }
  }

  console.log("");
  console.log("Lane assignments:");
  if (assignments.length === 0) {
    console.log(`- none (no assignment metadata under ${state.assignmentsDir})`);
  } else {
    for (const assignment of assignments) {
      const classification = classifyLaneAssignment(assignment, {
        ...context,
      });
      console.log(
        [
          `- ${assignment.assignment_id}`,
          classification.status,
          `owner=${assignment.owner || "unowned"}`,
          `branch=${assignment.branch || "none"}`,
          `task=${assignment.task_id || "none"}`,
          `phase=${assignment.phase || "none"}`,
          `heartbeat=${assignment.last_heartbeat_at || "none"}`,
          `runner=${assignment.runner_kind || "none"}`,
          `reason=${classification.reason}`,
          `next=${classification.nextAction}`,
        ].join(" | "),
      );
    }
  }

  console.log("");
  console.log("Workspace assignments:");
  if (manifests.length === 0) {
    console.log(`- none (no workspace manifests under ${state.tasksDir})`);
    return;
  }

  for (const manifest of manifests) {
    const classification = classifyWorkspaceAssignment(manifest, {
      ...context,
    });
    console.log(
      [
        `- ${manifest.task_id}`,
        classification.status,
        `manifest_status=${manifest.status}`,
        `owner=${manifest.owner || "unowned"}`,
        `branch=${manifest.branch}`,
        `worktree=${manifest.worktree_path}`,
        `phase=${manifest.phase || "none"}`,
        `heartbeat=${manifest.last_heartbeat_at || "none"}`,
        `runner=${manifest.runner_kind || "none"}`,
        `reason=${classification.reason}`,
        `next=${classification.nextAction}`,
      ].join(" | "),
    );
  }
}

function buildAssignmentReportSummary({
  state,
  currentOwner,
  staleAfterSeconds,
  generatedAt,
  manifests,
  assignments,
  backlogItems,
  manifestBranchStates,
  assignmentBranchStates,
}) {
  const context = { currentOwner, generatedAt, staleAfterSeconds };
  const backlogCandidates = backlogItems.map((item) => {
    const classification = classifyBacklogItem(item, manifestBranchStates, assignmentBranchStates, manifests, assignments);
    return {
      itemId: item.itemId,
      sourceStatus: item.status || "unknown",
      status: classification.status,
      branch: item.branchName || null,
      reason: classification.reason,
    };
  });
  const laneAssignments = assignments.map((assignment) => {
    const classification = classifyLaneAssignment(assignment, context);
    return {
      assignmentId: assignment.assignment_id,
      taskId: assignment.task_id || null,
      status: classification.status,
      owner: assignment.owner || null,
      branch: assignment.branch || null,
      phase: assignment.phase || null,
      heartbeat: assignment.last_heartbeat_at || null,
      reason: classification.reason,
      nextAction: classification.nextAction,
    };
  });
  const workspaceAssignments = manifests.map((manifest) => {
    const classification = classifyWorkspaceAssignment(manifest, context);
    return {
      taskId: manifest.task_id,
      status: classification.status,
      manifestStatus: manifest.status,
      owner: manifest.owner || null,
      branch: manifest.branch || null,
      worktreePath: manifest.worktree_path || null,
      phase: manifest.phase || null,
      heartbeat: manifest.last_heartbeat_at || manifest.owner_updated_at || null,
      reason: classification.reason,
      nextAction: classification.nextAction,
    };
  });

  return {
    generatedAt: generatedAt.toISOString(),
    stateRoot: state.root,
    currentOwner,
    staleAfterSeconds,
    safeBacklogSource: "services/supervisor/src/supervisor/application/service.py#get_safe_development_backlog_report",
    counts: {
      backlogCandidates: backlogCandidates.length,
      laneAssignments: laneAssignments.length,
      workspaceAssignments: workspaceAssignments.length,
    },
    backlogStatusCounts: countByField(backlogCandidates, "status"),
    laneAssignmentStatusCounts: countByField(laneAssignments, "status"),
    workspaceAssignmentStatusCounts: countByField(workspaceAssignments, "status"),
    backlogCandidates: backlogCandidates.slice(0, 10),
    backlogCandidatesTruncated: backlogCandidates.length > 10,
    laneAssignments: laneAssignments.slice(0, 10),
    laneAssignmentsTruncated: laneAssignments.length > 10,
    workspaceAssignments: workspaceAssignments.slice(0, 10),
    workspaceAssignmentsTruncated: workspaceAssignments.length > 10,
    mutation: "none; summary only",
  };
}

function claimNext(argv) {
  const { options } = parseOptions(argv);
  if (options.apply && options.dryRun) {
    throw new Error("claim-next accepts either --dry-run or --apply, not both.");
  }
  if (!options.apply && !options.dryRun) {
    throw new Error("claim-next requires either --dry-run or --apply.");
  }
  if (options.summaryJson && !options.dryRun) {
    throw new Error("claim-next --summary-json is only supported with --dry-run.");
  }

  const state = workspaceState(options);
  const currentOwner = currentLaneOwner(options);
  const staleAfterSeconds = positiveInteger(options.staleAfterSeconds, 86_400);
  const generatedAt = new Date();
  const manifests = readManifests(state).map(({ manifest }) => manifest);
  const assignments = readAssignments(state).map(({ assignment }) => assignment);
  const backlogItems = readSafeBacklogItems();
  const evaluations = backlogItems.map((item) =>
    evaluateClaimCandidate(item, manifests, assignments, {
      currentOwner,
      generatedAt,
      staleAfterSeconds,
    }),
  );
  const selected = evaluations.find((evaluation) => evaluation.claimable) || null;

  const plan = [
    `current owner ${currentOwner}`,
    `state root ${state.root}`,
    selected
      ? `claim candidate ${selected.item.itemId} (${selected.action})`
      : "no claimable safe backlog lane found",
  ];
  if (selected?.item.branchName) {
    plan.push(`branch ${selected.item.branchName}`);
  }
  if (selected?.item.startCommand) {
    plan.push(`start command ${selected.item.startCommand}`);
  }
  if (options.dryRun) {
    if (options.summaryJson) {
      console.log(JSON.stringify(buildClaimNextSummary({ state, currentOwner, staleAfterSeconds, selected, evaluations }), null, 2));
      return;
    }
    plan.push("preview only; no manifest, branch, PR, or worktree mutation");
    printPlan("claim-next", plan);
  } else {
    if (!selected) {
      printBlocked("claim-next", plan);
      printClaimBlockers(evaluations, selected);
      throw new Error("No claimable safe backlog lane found.");
    }
    const applied = applyClaimNext(selected, {
      state,
      options,
      currentOwner,
      staleAfterSeconds,
    });
    printApplied("claim-next", [
      ...plan,
      `wrote ${applied.path}`,
      applied.message,
      "assignment metadata only; no branch, PR, worktree, worker, or implementation mutation",
    ]);
  }

  console.log("Blocker evidence:");
  printClaimBlockers(evaluations, selected);
}

function buildClaimNextSummary({ state, currentOwner, staleAfterSeconds, selected, evaluations }) {
  const blockers = evaluations.filter((evaluation) => !evaluation.claimable);
  return {
    currentOwner,
    stateRoot: state.root,
    staleAfterSeconds,
    selected: selected ? summarizeClaimEvaluation(selected) : null,
    counts: {
      total: evaluations.length,
      claimable: evaluations.filter((evaluation) => evaluation.claimable).length,
      blocked: blockers.length,
    },
    statusCounts: countByField(evaluations, "status"),
    blockerStatusCounts: countByField(blockers, "status"),
    blockers: blockers.slice(0, 10).map(summarizeClaimEvaluation),
    blockersTruncated: blockers.length > 10,
    mutation: "none; dry-run summary only",
  };
}

function summarizeClaimEvaluation(evaluation) {
  return {
    itemId: evaluation.item.itemId,
    sourceStatus: evaluation.item.status || "unknown",
    status: evaluation.status,
    claimable: evaluation.claimable,
    branch: evaluation.item.branchName || null,
    action: evaluation.action || null,
    mutation: evaluation.mutation || null,
    reason: evaluation.reason,
    nextAction: evaluation.nextAction,
  };
}

function heartbeat(argv) {
  const { positional, options } = parseOptions(argv);
  const query = positional.join(" ").trim();
  if (!query) {
    throw new Error("heartbeat requires an assignment or task query.");
  }

  const state = workspaceState(options);
  const currentOwner = currentLaneOwner(options);
  const heartbeatOptions = normalizeHeartbeatOptions(options);
  const assignmentRecord = findAssignment(state, query);

  if (assignmentRecord) {
    const result = heartbeatAssignment(state, assignmentRecord, {
      currentOwner,
      options,
      heartbeatOptions,
    });
    printApplied("heartbeat", [
      `target assignment ${result.target}`,
      `owner ${currentOwner}`,
      `phase ${heartbeatOptions.phase}`,
      `wrote ${result.path}`,
      "heartbeat metadata only; no branch, PR, cleanup, or ownership mutation",
    ]);
    return;
  }

  const manifestRecord = findManifest(state, query, { preferCurrentWorktree: true });
  const result = heartbeatManifest(state, manifestRecord.manifest.task_id, {
    currentOwner,
    options,
    heartbeatOptions,
  });
  printApplied("heartbeat", [
    `target workspace ${result.target}`,
    `owner ${currentOwner}`,
    `phase ${heartbeatOptions.phase}`,
    `wrote ${result.path}`,
    "heartbeat metadata only; no branch, PR, cleanup, or ownership mutation",
  ]);
}

function takeover(argv) {
  const { positional, options } = parseOptions(argv);
  if (options.apply && options.dryRun) {
    throw new Error("takeover accepts either --dry-run or --apply, not both.");
  }
  if (!options.apply && !options.dryRun) {
    throw new Error("takeover requires either --dry-run or --apply.");
  }
  if (options.summaryJson && !options.dryRun) {
    throw new Error("takeover --summary-json is only supported with --dry-run.");
  }
  const query = positional.join(" ").trim();
  if (!query) {
    throw new Error("takeover requires an assignment or task query.");
  }
  if (!validTakeoverReason(options.takeoverReason)) {
    throw new Error("--takeover-reason must explain the takeover in at least 10 non-whitespace characters.");
  }
  if (options.apply && !validTakeoverReason(options.approval)) {
    throw new Error("--approval must cite explicit operator approval in at least 10 non-whitespace characters.");
  }

  const state = workspaceState(options);
  const currentOwner = currentLaneOwner(options);
  const staleAfterSeconds = positiveInteger(options.staleAfterSeconds, 86_400);
  const generatedAt = new Date();
  const target = resolveTakeoverTarget(state, query);
  const packet = takeoverPacket(target, {
    currentOwner,
    generatedAt,
    staleAfterSeconds,
    reason: String(options.takeoverReason || "").trim(),
    approval: options.approval ? String(options.approval).trim() : "",
  });

  if (options.dryRun) {
    if (options.summaryJson) {
      console.log(JSON.stringify(buildTakeoverSummary(packet), null, 2));
      return;
    }
    printTakeoverPacket("DRY RUN", packet);
    return;
  }

  if (!packet.allowed) {
    printTakeoverPacket("BLOCKED", packet);
    throw new Error(`Takeover blocked for ${packet.target_id}.`);
  }

  const applied = applyTakeover(state, target, {
    currentOwner,
    options,
    staleAfterSeconds,
  });
  printTakeoverPacket("APPLY", applied.packet);
  console.log(`Wrote: ${applied.path}`);
}

function dispatchNext(argv) {
  const { options } = parseOptions(argv);
  if (options.apply && options.dryRun) {
    throw new Error("dispatch-next accepts either --dry-run or --apply, not both.");
  }
  if (!options.apply && !options.dryRun) {
    throw new Error("dispatch-next requires either --dry-run or --apply.");
  }
  if (options.summaryJson && !options.dryRun) {
    throw new Error("dispatch-next --summary-json is only supported with --dry-run.");
  }

  const readinessProfile = normalizeDispatchReadinessProfile(options.readiness || "doctor");
  const state = workspaceState(options);
  const currentOwner = currentLaneOwner(options);
  const staleAfterSeconds = positiveInteger(options.staleAfterSeconds, 86_400);
  const generatedAt = new Date();
  const context = {
    state,
    options,
    currentOwner,
    staleAfterSeconds,
    generatedAt,
    readinessProfile,
  };
  const plan = dispatchPlan(context);

  if (options.dryRun) {
    if (options.summaryJson) {
      console.log(JSON.stringify(buildDispatchNextSummary({ state, currentOwner, staleAfterSeconds, readinessProfile, plan }), null, 2));
      return;
    }
    printDispatchPacket("DRY RUN", plan.packet);
    printClaimBlockers(plan.evaluations, plan.selected);
    return;
  }

  if (!plan.packet.allowed) {
    printDispatchPacket("BLOCKED", plan.packet);
    printClaimBlockers(plan.evaluations, plan.selected);
    throw new Error("No dispatchable safe backlog lane found.");
  }

  const applied = applyDispatchNext(plan, context);
  printDispatchPacket("APPLY", applied.packet);
  console.log(`Wrote: ${applied.path}`);
  if (applied.assignmentPath) {
    console.log(`Assignment: ${applied.assignmentPath}`);
  }
  if (applied.manifestPath) {
    console.log(`Workspace: ${applied.manifestPath}`);
  }
}

function resumeWorkspace(argv) {
  const { positional, options } = parseOptions(argv);
  const manifestRecord = findManifest(workspaceState(options), positional.join(" "));
  const { manifest } = manifestRecord;

  console.log(`Task: ${manifest.task_id}`);
  console.log(`Status: ${manifest.status}`);
  console.log(`Owner: ${manifest.owner || "unowned"}`);
  const ownerWarning = laneOwnerWarning(manifest, options);
  if (ownerWarning) {
    console.log(ownerWarning);
  }
  console.log(`Branch: ${manifest.branch}`);
  console.log(`Base branch: ${manifest.base_branch || "unknown"}`);
  console.log(`Base ref: ${manifest.base_ref || "unknown"}`);
  console.log(`Worktree: ${manifest.worktree_path}`);
  if (manifest.pr_url) {
    console.log(`PR: ${manifest.pr_url}`);
  }
  console.log(`Command: cd "${manifest.worktree_path}"`);
}

function finishPr(argv) {
  const { positional, options } = parseOptions(argv);
  const state = workspaceState(options);
  const manifestRecord = findManifest(state, positional.join(" "), {
    preferCurrentWorktree: true,
  });
  const { manifest, path: manifestPath } = manifestRecord;

  const verifyProfile = options.noVerify ? "" : String(options.verify || "");
  const verifyCommand = verifyProfile ? verificationCommand(verifyProfile) : [];
  assertLaneOwner(manifest, options);
  requireGh("finish-pr");
  if (manifest.mode === "experiment") {
    throw new Error("This workspace is marked as experiment mode. Create a PR only after changing its manifest mode to pr.");
  }
  assertSafeBranch(manifest.branch);
  assertWorktreeExists(manifest);
  assertCurrentBranch(manifest);
  reconcileManifest(manifest, { refreshPr: true });

  let worktreeStatus = parseStatus(manifest.worktree_path);
  const preflightReconciledCommit = reconcileExistingTaskCommit(manifest, worktreeStatus);
  const commitMessage = String(options.message || manifest.title || manifest.description);
  const prTitle = String(options.title || manifest.title || manifest.description);
  const prBody = String(
    options.body ||
      [
        "Created by Codex Workspace Protocol.",
        "",
        `Task: ${manifest.task_id}`,
        `Worktree: ${manifest.worktree_path}`,
      ].join("\n"),
  );

  if (worktreeStatus.unstaged && !options.stageAll) {
    throw new Error("Worktree has unstaged/untracked changes. Stage intentionally first or pass --stage-all.");
  }

  if (!worktreeStatus.any && !manifest.last_commit) {
    throw new Error("No changes to commit and no prior task commit is recorded.");
  }

  const plan = [];
  if (verifyCommand.length > 0) {
    plan.push(verifyCommand.join(" "));
  }
  plan.push("anti-churn hook evaluate --apply-safe --format json");
  if (worktreeStatus.unstaged && options.stageAll) {
    plan.push("git add --all");
  }
  if (worktreeStatus.any) {
    plan.push(`git commit -m "${commitMessage}"`);
  }
  plan.push(`git push -u origin ${manifest.branch}`);
  plan.push("gh pr create/view");

  if (options.dryRun) {
    printPlan("finish-pr", plan);
    return;
  }

  withManifestLock(state, manifest.task_id, () => {
    const lockedManifest = readManifest(manifestPath);
    validateManifest(lockedManifest, manifestPath);
    assertLaneOwner(lockedManifest, options);
    claimLaneOwner(lockedManifest, options);
    Object.assign(manifest, lockedManifest);
    assertCurrentBranch(manifest);

    const existingPr = prView(manifest);
    if (existingPr?.baseRefName && existingPr.baseRefName !== manifest.base_branch) {
      throw new Error(`Existing PR base is ${existingPr.baseRefName}, expected ${manifest.base_branch}.`);
    }

    if (verifyCommand.length > 0) {
      runChecked(verifyCommand[0], verifyCommand.slice(1), { cwd: manifest.worktree_path });
      manifest.last_verified_at = new Date().toISOString();
      manifest.last_verification_command = verifyCommand.join(" ");
      appendTaskEvent(manifest, "verified", verifyCommand.join(" "));
      worktreeStatus = parseStatus(manifest.worktree_path);
    }
    const reconciledCommit =
      reconcileExistingTaskCommit(manifest, worktreeStatus) ||
      (preflightReconciledCommit && manifest.last_commit === preflightReconciledCommit.short
        ? preflightReconciledCommit
        : null);
    if (reconciledCommit) {
      appendTaskEvent(
        manifest,
        "commit_reconciled",
        `${reconciledCommit.short} inferred from clean branch ahead of ${reconciledCommit.baseRef}`,
      );
    }

    const antiChurn = runAntiChurnFinalization(manifest, state, { worktreeStatus, pr: existingPr });
    manifest.anti_churn_finalization = antiChurn.manifestRecord;
    appendTaskEvent(manifest, "anti_churn_finalized", `${antiChurn.manifestRecord.status}:${antiChurn.manifestRecord.lessons_evaluated}`);
    worktreeStatus = parseStatus(manifest.worktree_path);
    manifest.lane_evidence_packet = buildLaneEvidencePacket(manifest, antiChurn.manifestRecord, { worktreeStatus });

    if (worktreeStatus.unstaged && !options.stageAll) {
      throw new Error("Worktree has unstaged/untracked changes after verification. Stage intentionally first or pass --stage-all.");
    }

    if (worktreeStatus.unstaged && options.stageAll) {
      runChecked("git", ["add", "--all"], { cwd: manifest.worktree_path });
    }
    if (worktreeStatus.any) {
      runChecked("git", ["commit", "-m", commitMessage], { cwd: manifest.worktree_path });
      manifest.last_commit = git(["rev-parse", "--short", "HEAD"], {
        cwd: manifest.worktree_path,
      }).stdout.trim();
      appendTaskEvent(manifest, "committed", manifest.last_commit);
    }

    runChecked("git", ["push", "-u", "origin", manifest.branch], { cwd: manifest.worktree_path });
    appendTaskEvent(manifest, "pushed", manifest.branch);
    manifest.pr_delivery_head_sha = git(["rev-parse", "HEAD"], { cwd: manifest.worktree_path }).stdout.trim() || null;
    manifest.pr_delivery_branch = manifest.branch;
    manifest.pr_delivery_base_branch = manifest.base_branch;
    manifest.pr_delivery_pushed_at = new Date().toISOString();

    if (existingPr) {
      manifest.pr_url = existingPr.url;
      manifest.pr_number = existingPr.number;
    } else {
      const result = runChecked(
        "gh",
        [
          "pr",
          "create",
          "--base",
          manifest.base_branch,
          "--head",
          manifest.branch,
          "--title",
          prTitle,
          "--body",
          prBody,
        ],
        { cwd: manifest.worktree_path },
      );
      manifest.pr_url = result.stdout.trim().split(/\r?\n/).at(-1);
      manifest.pr_number = prNumberFromUrl(manifest.pr_url);
    }

    manifest.status = "pr_open";
    manifest.updated_at = new Date().toISOString();
    appendTaskEvent(manifest, "pr_open", manifest.pr_url || manifest.branch);
    writeManifest(manifestPath, manifest);
  });
  console.log(`Finished task ${manifest.task_id}`);
  if (manifest.anti_churn_finalization) {
    for (const line of renderAntiChurnFinalization(manifest.anti_churn_finalization)) {
      console.log(line);
    }
  }
  console.log(`PR: ${manifest.pr_url}`);
}

function runAntiChurnFinalization(manifest, state, options = {}) {
  const now = new Date().toISOString();
  const worktreeStatus = options.worktreeStatus || parseStatus(manifest.worktree_path);
  const hookResult = runAntiChurnGuidanceHookCli(
    ["evaluate", "--lane", manifest.task_id, "--apply-safe", "--format", "json"],
    {
      cwd: manifest.worktree_path,
      env: {
        ...process.env,
        CODEX_WORKSPACE_ROOT: state.root,
      },
      laneManifest: antiChurnLaneManifest(manifest, worktreeStatus, now, { pr: options.pr }),
      now,
    },
  );
  return {
    hookResult,
    manifestRecord: shapeAntiChurnManifestRecord(hookResult, now),
  };
}

function antiChurnLaneManifest(manifest, worktreeStatus, checkedAt, options = {}) {
  return {
    taskId: manifest.task_id,
    branch: manifest.branch,
    owner: manifest.owner || null,
    worktreePath: manifest.worktree_path,
    baseBranch: manifest.base_branch,
    pr: antiChurnPrState(manifest, options.pr),
    cleanup: {
      status: antiChurnCleanupStatus(manifest),
      startedAt: manifest.cleanup_started_at || null,
    },
    dirtyWorktree: {
      checkedAt,
      paths: statusPaths(worktreeStatus),
    },
  };
}

function antiChurnPrState(manifest, pr) {
  const merged = Boolean(pr?.mergedAt || manifest.merged_at || manifest.pr_merged_at || manifest.status === "merged" || manifest.status === "closed");
  const hasPrEvidence = Boolean(pr || manifest.pr_number || manifest.pr_url || merged);
  if (!hasPrEvidence) {
    return null;
  }
  return {
    number: pr?.number || manifest.pr_number || null,
    state: pr?.state || manifest.pr_state || null,
    merged,
    reviewStateCheckedAt: manifest.pr_review_state_checked_at || null,
    headRefOid: pr?.headRefOid || manifest.pr_delivery_head_sha || null,
  };
}

function antiChurnCleanupStatus(manifest) {
  if (manifest.status === "cleanup_partial" || manifest.cleanup_started_at) {
    return "started";
  }
  return "not-started";
}

function statusPaths(worktreeStatus) {
  return (worktreeStatus?.lines || [])
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
}

function shapeAntiChurnManifestRecord(result, updatedAt) {
  const lessons = Number(result?.lessonsEvaluated || 0);
  const omittedReason = lessons === 0 ? noStructuredChurnReason(result) : null;
  return {
    mode: result?.mode || "apply-safe",
    status: result?.status || "input-error",
    omitted_reason: omittedReason,
    lessons_evaluated: lessons,
    applied: copyJsonArray(result?.applied),
    proposals: copyJsonArray(result?.proposals),
    skipped: copyJsonArray(result?.skipped),
    files_changed: copyJsonArray(result?.filesChanged),
    verification: copyJsonArray(result?.verification),
    residual_risks: copyJsonArray(result?.residualRisks),
    local_event_storage: copyJsonArray(result?.localEventStorage),
    warnings: copyJsonArray(result?.warnings),
    requires_authority: copyJsonArray(result?.requiresAuthority),
    next_safe_action: antiChurnNextSafeAction(result, omittedReason),
    updated_at: updatedAt,
  };
}

function noStructuredChurnReason(result) {
  const warnings = Array.isArray(result?.warnings) ? result.warnings : [];
  if (warnings.includes("malformed-event-line") || warnings.some((warning) => warning.startsWith("malformed-event-line:"))) {
    return null;
  }
  if (warnings.includes("invalid-event-line") || warnings.some((warning) => warning.startsWith("invalid-event-line:"))) {
    return null;
  }
  if (warnings.includes("no-valid-events")) {
    return null;
  }
  if (warnings.includes("missing-event-store") || warnings.includes("empty-event-store")) {
    return "no-structured-churn-events";
  }
  return "insufficient-evidence";
}

function antiChurnNextSafeAction(result, omittedReason) {
  if (omittedReason) {
    return "Record structured churn events before expecting anti-churn lessons.";
  }
  if (result?.status === "verification-pending-approval") {
    return "Request approval for the exact read-only verification command surfaced by the hook.";
  }
  if (result?.status === "requires-higher-authority") {
    return "Review required authority before any higher-authority mutation.";
  }
  if (result?.status === "verification-failed") {
    return "Inspect the hook proposal and verification failure before applying guidance.";
  }
  if (result?.status === "input-error") {
    return "Inspect local anti-churn state and event store availability.";
  }
  return null;
}

function copyJsonArray(value) {
  return Array.isArray(value) ? value.map((entry) => JSON.parse(JSON.stringify(entry))) : [];
}

function renderAntiChurnFinalization(record = {}) {
  const changedFiles = uniqueTextValues(record.files_changed);
  const appliedFiles = uniqueTextValues([...changedFiles, ...record.applied?.map((entry) => fieldValue(entry, ["targetFile", "file", "target"])) || []]);
  const lines = [
    "Anti-Churn Finalization",
    `- Status: ${valueOrNone(record.status)}`,
    `- Mode: ${valueOrNone(record.mode)}`,
    `- Lessons evaluated: ${Number(record.lessons_evaluated || 0)}`,
    `- Applied safe local edits: ${appliedFiles.length ? appliedFiles.join(", ") : "none"}`,
    `- Proposals prepared: ${formatCount(record.proposals)}`,
    `- No-op reasons: ${formatNoOpReasons(record)}`,
    `- Local event storage: ${formatLocalEventStorage(record.local_event_storage)}`,
    `- Verification: ${formatVerification(record.verification)}`,
    `- Residual risks: ${formatTextList(record.residual_risks)}`,
  ];

  if (appliedFiles.length) {
    lines.push("  - PR inclusion: existing finish-pr staging/commit policy decides whether changed source files are included in the lane PR.");
  }
  lines.push(...renderProposalDetails(record));
  if (record.next_safe_action) {
    lines.push(`- Operator next step: ${record.next_safe_action}`);
  }
  return lines;
}

function renderProposalDetails(record = {}) {
  const lines = [];
  const authorityItems = [
    ...copyJsonArray(record.proposals),
    ...copyJsonArray(record.requires_authority),
    ...copyJsonArray(record.skipped).filter((entry) => entry?.noOpReason === "requires-higher-authority" || entry?.noOpReason === "proposal-only"),
  ];
  authorityItems.forEach((entry, index) => {
    const authority = fieldList(entry, ["requiredAuthorityFamily", "requiredAuthority", "requiresAuthority", "authority"]);
    const operation = fieldValue(entry, ["blockedOperation", "operation", "behavior", "proposedTarget", "durableTarget", "targetFile", "target"]);
    const evidence = fieldList(entry, ["evidenceReferences", "evidenceRefs", "collapsedSourceEventIds", "sourceEventId"]);
    const next = fieldValue(entry, ["nextSafeAction", "approvalGuidance", "verificationIdea", "residualRisk"]);
    lines.push(
      `  - Proposal ${index + 1}: authority=${authority || "unspecified"}; blocked_operation=${operation || "unspecified"}; evidence=${evidence || "none"}; next_safe_action=${next || "review proposal"}; approval=not approved; proposal-only`,
    );
  });
  return lines;
}

function formatCount(value) {
  return Array.isArray(value) && value.length ? String(value.length) : "none";
}

function formatNoOpReasons(record = {}) {
  const counts = new Map();
  const proposalReasons = copyJsonArray(record.proposals).map((entry) => entry?.noOpReason || entry?.decision || "proposal-only");
  const statusReasons = ["proposal-only", "requires-higher-authority"].includes(record.status) ? [record.status] : [];
  for (const reason of [
    record.omitted_reason,
    ...statusReasons,
    ...proposalReasons,
    ...copyJsonArray(record.skipped).map((entry) => entry?.noOpReason || entry?.decision || entry?.status),
  ]) {
    if (!reason) {
      continue;
    }
    counts.set(reason, (counts.get(reason) || 0) + 1);
  }
  return counts.size ? [...counts.entries()].map(([reason, count]) => `${reason}=${count}`).join(", ") : "none";
}

function formatLocalEventStorage(value) {
  const entries = copyJsonArray(value);
  if (!entries.length) {
    return "none";
  }
  return entries.map((entry) => {
    const eventStore = fieldValue(entry, ["eventStore", "path"]) || "unavailable";
    const eventCount = entry?.eventCount === undefined ? "unknown" : entry.eventCount;
    return `${eventStore} (${eventCount} events)`;
  }).join(", ");
}

function formatVerification(value) {
  const entries = copyJsonArray(value);
  if (!entries.length) {
    return "none";
  }
  return entries.map((entry) => {
    const command = fieldValue(entry, ["command", "target"]) || "unspecified";
    const result = fieldValue(entry, ["status", "result", "exitCode"]);
    return result ? `${command} => ${result}` : command;
  }).join(", ");
}

function formatTextList(value) {
  const entries = uniqueTextValues(value);
  return entries.length ? entries.join(", ") : "none";
}

function fieldValue(entry, names) {
  if (!entry || typeof entry !== "object") {
    return typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean" ? String(entry) : "";
  }
  for (const name of names) {
    const value = entry[name];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
  }
  return "";
}

function fieldList(entry, names) {
  if (!entry || typeof entry !== "object") {
    return fieldValue(entry, names);
  }
  for (const name of names) {
    const value = entry[name];
    const formatted = Array.isArray(value) ? uniqueTextValues(value).join(", ") : fieldValue({ value }, ["value"]);
    if (formatted) {
      return formatted;
    }
  }
  return "";
}

function uniqueTextValues(value) {
  const input = Array.isArray(value) ? value : [];
  return [...new Set(input
    .map((entry) => {
      if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
        return String(entry);
      }
      return "";
    })
    .filter(Boolean))];
}

function valueOrNone(value) {
  return value === undefined || value === null || value === "" ? "none" : String(value);
}

function buildLaneEvidencePacket(manifest, antiChurnRecord = {}, options = {}) {
  return {
    ...(manifest.lane_evidence_packet && typeof manifest.lane_evidence_packet === "object" ? manifest.lane_evidence_packet : {}),
    schemaVersion: 1,
    task_id: manifest.task_id,
    branch: manifest.branch,
    worktree_path: manifest.worktree_path,
    updated_at: antiChurnRecord.updated_at || new Date().toISOString(),
    anti_churn_finalization: shapeAntiChurnEvidencePacket(antiChurnRecord, options),
  };
}

function shapeAntiChurnEvidencePacket(record = {}, options = {}) {
  const filesChanged = uniqueTextValues(record.files_changed);
  return {
    mode: valueOrNone(record.mode),
    status: valueOrNone(record.status),
    event_store_references: shapeEventStoreReferences(record.local_event_storage),
    lessons_evaluated: Number(record.lessons_evaluated || 0),
    applied_edits: shapeAppliedEditEvidence(record.applied),
    proposals: shapeProposalEvidence(record),
    no_op_reasons: shapeNoOpReasonEvidence(record),
    verification: shapeVerificationEvidence(record.verification),
    residual_risks: uniqueTextValues(record.residual_risks),
    next_safe_action: record.next_safe_action || null,
    source_edit_delivery: {
      files_changed: filesChanged,
      included_in_lane_pr: filesChanged.length ? "governed-by-finish-pr-staging-policy" : "none",
      local_only_telemetry_or_proposals: filesChanged.length === 0,
      rollback_or_recovery_path: antiChurnRecoveryPath(record),
      current_worktree_paths: statusPaths(options.worktreeStatus),
    },
  };
}

function shapeEventStoreReferences(value) {
  return copyJsonArray(value).map((entry) => ({
    lane: fieldValue(entry, ["lane"]) || null,
    eventStore: fieldValue(entry, ["eventStore", "path"]) || null,
    eventCount: Number.isFinite(Number(entry?.eventCount)) ? Number(entry.eventCount) : null,
  }));
}

function shapeAppliedEditEvidence(value) {
  return copyJsonArray(value).map((entry) => ({
    candidateId: fieldValue(entry, ["candidateId"]) || null,
    targetFile: fieldValue(entry, ["targetFile", "file", "target"]) || null,
    transactionId: fieldValue(entry, ["transactionId"]) || null,
    status: fieldValue(entry, ["status"]) || null,
  }));
}

function shapeProposalEvidence(record = {}) {
  return [
    ...copyJsonArray(record.proposals),
    ...copyJsonArray(record.skipped).filter((entry) => entry?.noOpReason === "requires-higher-authority" || entry?.noOpReason === "proposal-only"),
  ].map((entry) => ({
    candidateId: fieldValue(entry, ["candidateId"]) || null,
    sourceEventId: fieldValue(entry, ["sourceEventId"]) || null,
    decision: fieldValue(entry, ["decision"]) || "proposal-only",
    noOpReason: fieldValue(entry, ["noOpReason"]) || null,
    proposedTarget: fieldValue(entry, ["proposedTarget", "durableTarget", "targetFile", "target"]) || null,
    requiredAuthority: fieldList(entry, ["requiredAuthority", "requiresAuthority", "authority"]) || null,
    requiredAuthorityFamily: fieldList(entry, ["requiredAuthorityFamily"]) || null,
    evidenceReferences: fieldList(entry, ["evidenceReferences", "evidenceRefs", "collapsedSourceEventIds", "sourceEventId"]) || null,
    reviewPath: fieldValue(entry, ["reviewPath", "approvalGuidance", "verificationIdea"]) || "local-only proposal review",
    locality: "local-only",
    approval: "not-approved",
  }));
}

function shapeNoOpReasonEvidence(record = {}) {
  const counts = new Map();
  const reasons = [
    record.omitted_reason,
    ...(["proposal-only", "requires-higher-authority"].includes(record.status) ? [record.status] : []),
    ...copyJsonArray(record.proposals).map((entry) => entry?.noOpReason || entry?.decision || "proposal-only"),
    ...copyJsonArray(record.skipped).map((entry) => entry?.noOpReason || entry?.decision || entry?.status),
  ].filter(Boolean);
  for (const reason of reasons) {
    counts.set(reason, (counts.get(reason) || 0) + 1);
  }
  return [...counts.entries()].map(([reason, count]) => ({ reason, count }));
}

function shapeVerificationEvidence(value) {
  return copyJsonArray(value).map((entry) => ({
    target: fieldValue(entry, ["target"]) || null,
    command: fieldValue(entry, ["command"]) || null,
    status: fieldValue(entry, ["status"]) || null,
    result: fieldValue(entry, ["result"]) || null,
    exitCode: fieldValue(entry, ["exitCode"]) || null,
  }));
}

function antiChurnRecoveryPath(record = {}) {
  const transactionIds = uniqueTextValues(copyJsonArray(record.applied).map((entry) => fieldValue(entry, ["transactionId"])));
  if (transactionIds.length) {
    return `inspect hook transaction ${transactionIds.join(", ")} or revert the lane PR source edit`;
  }
  if (record.status === "verification-failed") {
    return "inspect verification failure proposal; hook-owned source patch should already be rolled back";
  }
  if (record.status === "verification-pending-approval") {
    return "request verification approval before restoring or including any hook source edit";
  }
  return "not-required";
}

function cleanupMerged(argv, mode = {}) {
  const { positional, options } = parseOptions(argv);
  if (options.summaryJson && options.apply) {
    throw new Error("cleanup-merged --summary-json is only supported without --apply.");
  }
  const state = workspaceState(options);
  const records = mode.currentOnly
    ? [findManifest(state, positional.join(" "), { preferCurrentWorktree: true })]
    : positional.length > 0
      ? [findManifest(state, positional.join(" "))]
      : readManifests(state);
  const deleteRemote = Boolean(options.deleteRemote);
  const apply = Boolean(options.apply);
  const currentOwner = currentLaneOwner(options);
  const summaryResults = [];

  requireGh("cleanup-merged");

  for (const record of records) {
    const { manifest, path: manifestPath } = record;
    if (manifest.status === "closed") {
      if (options.summaryJson) {
        summaryResults.push(cleanupMergedSkipSummary(manifest, "skipped_closed", "workspace manifest is already closed"));
      }
      continue;
    }
    assertLaneOwner(manifest, options);
    reconcileManifest(manifest, { refreshPr: true });

    const pr = prView(manifest);
    if (!pr || !pr.mergedAt) {
      if (options.summaryJson) {
        summaryResults.push(cleanupMergedSkipSummary(manifest, "skipped_unmerged_pr", "PR is not merged", { pr }));
        continue;
      }
      console.log(`SKIP ${manifest.task_id}: PR is not merged.`);
      continue;
    }
    if (pr.baseRefName && pr.baseRefName !== manifest.base_branch) {
      if (options.summaryJson) {
        summaryResults.push(
          cleanupMergedSkipSummary(manifest, "skipped_pr_base_mismatch", `PR base is ${pr.baseRefName}, expected ${manifest.base_branch}`, {
            pr,
          }),
        );
        continue;
      }
      console.log(`SKIP ${manifest.task_id}: PR base is ${pr.baseRefName}, expected ${manifest.base_branch}.`);
      continue;
    }

    const cleanupCwd = cleanupRepositoryRoot(manifest.worktree_path);
    const worktreeStatus = worktreeCleanupStatus(manifest, cleanupCwd);
    if (worktreeStatus.dirty) {
      if (options.summaryJson) {
        summaryResults.push(cleanupMergedSkipSummary(manifest, "skipped_dirty_worktree", "worktree is not clean", { pr, worktreeStatus }));
        continue;
      }
      console.log(`SKIP ${manifest.task_id}: worktree is not clean.`);
      continue;
    }

    const plan = cleanupMergedPlan(manifest, pr, { cleanupCwd, deleteRemote });
    if (options.summaryJson) {
      summaryResults.push(cleanupMergedReadySummary(manifest, pr, { cleanupCwd, deleteRemote, plan, worktreeStatus }));
      continue;
    }

    if (options.dryRun || !apply) {
      printPlan(`cleanup-merged ${manifest.task_id}`, plan);
      if (!apply) {
        console.log("Add --apply to remove the worktree and local branch.");
      }
      continue;
    }

    withManifestLock(state, manifest.task_id, () => {
      const lockedManifest = readManifest(manifestPath);
      validateManifest(lockedManifest, manifestPath);
      assertLaneOwner(lockedManifest, options);
      claimLaneOwner(lockedManifest, options);
      Object.assign(manifest, lockedManifest);
      try {
        const lockedPr = prView(manifest);
        if (!lockedPr?.mergedAt) {
          throw new Error(`Could not refresh merged PR evidence under cleanup lock for ${manifest.task_id}.`);
        }
        if (lockedPr.baseRefName && lockedPr.baseRefName !== manifest.base_branch) {
          throw new Error(`Existing PR base is ${lockedPr.baseRefName}, expected ${manifest.base_branch}.`);
        }
        const lockedCleanupCwd = cleanupRepositoryRoot(manifest.worktree_path);
        const lockedWorktreeStatus = worktreeCleanupStatus(manifest, lockedCleanupCwd);
        if (lockedWorktreeStatus.dirty) {
          throw new Error("Worktree is not clean after acquiring cleanup lock.");
        }
        cleanupMergedResources(manifest, state, { cleanupCwd: lockedCleanupCwd, deleteRemote, pr: lockedPr });
        manifest.status = "closed";
        manifest.pr_url = lockedPr.url || manifest.pr_url;
        manifest.pr_number = lockedPr.number || manifest.pr_number;
        manifest.merged_at = lockedPr.mergedAt;
        manifest.closed_at = new Date().toISOString();
        manifest.updated_at = manifest.closed_at;
        manifest.cleanup_error = null;
        const assignmentClosure = closeAssignmentForCleanedManifest(state, manifest);
        if (assignmentClosure?.closed) {
          manifest.source_assignment_closed_at = assignmentClosure.closedAt;
          appendTaskEvent(manifest, "assignment_closed", assignmentClosure.assignmentId);
        }
        appendTaskEvent(manifest, "closed", `cleaned merged PR ${manifest.pr_url || manifest.pr_number}`);
      } catch (error) {
        manifest.status = "cleanup_partial";
        manifest.cleanup_error = error.message;
        manifest.updated_at = new Date().toISOString();
        appendTaskEvent(manifest, "cleanup_partial", error.message);
        writeManifest(manifestPath, manifest);
        throw error;
      }
      writeManifest(manifestPath, manifest);
    });
    console.log(`Closed ${manifest.task_id}`);
  }

  if (options.summaryJson) {
    console.log(
      JSON.stringify(
        buildCleanupMergedSummary({
          state,
          currentOwner,
          mode,
          deleteRemote,
          results: summaryResults,
        }),
        null,
        2,
      ),
    );
  }
}

function buildCleanupMergedSummary({ state, currentOwner, mode, deleteRemote, results }) {
  return {
    generatedAt: new Date().toISOString(),
    stateRoot: state.root,
    currentOwner,
    mode: mode.currentOnly ? "cleanup-current" : "cleanup-merged",
    deleteRemote,
    counts: {
      total: results.length,
      cleanupReady: results.filter((result) => result.status === "ready").length,
      skipped: results.filter((result) => result.status !== "ready").length,
    },
    statusCounts: countByField(results, "status"),
    results: results.slice(0, 10),
    resultsTruncated: results.length > 10,
    mutation: "none; summary only",
  };
}

function cleanupMergedReadySummary(manifest, pr, options) {
  return {
    taskId: manifest.task_id,
    status: "ready",
    reason: "PR is merged and worktree is clean",
    branch: manifest.branch,
    owner: manifest.owner || null,
    worktreePath: manifest.worktree_path,
    worktree: cleanupWorktreeSummary(options.worktreeStatus),
    pr: cleanupPrSummary(manifest, pr),
    cleanupCwd: options.cleanupCwd,
    expectedHeadSha: expectedCleanupHeadSha(manifest, pr) || null,
    localBranchSha: branchSha(manifest.branch, options.cleanupCwd) || null,
    remoteBranchSha: options.deleteRemote ? originBranchSha(manifest.branch, options.cleanupCwd) || null : null,
    plan: options.plan,
  };
}

function cleanupMergedSkipSummary(manifest, status, reason, options = {}) {
  return {
    taskId: manifest.task_id,
    status,
    reason,
    branch: manifest.branch,
    owner: manifest.owner || null,
    worktreePath: manifest.worktree_path,
    worktree: options.worktreeStatus ? cleanupWorktreeSummary(options.worktreeStatus) : null,
    pr: cleanupPrSummary(manifest, options.pr),
  };
}

function cleanupPrSummary(manifest, pr) {
  return {
    number: pr?.number || manifest.pr_number || null,
    url: pr?.url || manifest.pr_url || null,
    mergedAt: pr?.mergedAt || manifest.merged_at || null,
    baseRefName: pr?.baseRefName || null,
    headRefOid: pr?.headRefOid || manifest.pr_delivery_head_sha || null,
  };
}

function cleanupWorktreeSummary(worktreeStatus) {
  if (!worktreeStatus) {
    return null;
  }
  return {
    exists: Boolean(worktreeStatus.exists),
    listed: Boolean(worktreeStatus.listed),
    dirty: Boolean(worktreeStatus.dirty),
  };
}

function closeAssignmentForCleanedManifest(state, manifest) {
  const assignmentId = String(manifest.source_assignment_id || "").trim();
  if (!assignmentId) {
    return null;
  }
  assertSafeTaskId(assignmentId);
  const path = assignmentPath(state, assignmentId);
  if (!existsSync(path)) {
    return null;
  }

  return withAssignmentLock(state, assignmentId, () => {
    const assignment = readAssignment(path);
    validateAssignment(assignment, path);
    if (assignment.status === "closed") {
      return { closed: false, assignmentId };
    }
    const assignmentBranch = assignment.branch || assignment.source_backlog_item?.branch_name || "";
    if (assignmentBranch !== manifest.branch) {
      throw new Error(`Assignment ${assignmentId} branch ${assignmentBranch || "missing"} does not match cleaned branch ${manifest.branch}.`);
    }
    if (assignment.owner && manifest.owner && assignment.owner !== manifest.owner) {
      throw new Error(`Assignment ${assignmentId} is owned by ${assignment.owner}, expected ${manifest.owner}.`);
    }

    const closedAt = new Date().toISOString();
    assignment.status = "closed";
    assignment.phase = "closed";
    assignment.updated_at = closedAt;
    assignment.closed_at = closedAt;
    assignment.current_command = null;
    assignment.last_result = `closed after cleanup of ${manifest.task_id}`;
    assignment.events = [
      ...(Array.isArray(assignment.events) ? assignment.events : []),
      taskEvent("closed", `cleaned merged workspace ${manifest.task_id}`),
    ];
    writeAssignment(path, assignment);
    return { closed: true, assignmentId, closedAt };
  });
}

function cleanupCurrent(argv) {
  cleanupMerged(argv, { currentOnly: true });
}

function cleanupRepositoryRoot(worktreePath) {
  const main = mainWorktreePath();
  if (main && !samePath(main, worktreePath) && existsSync(main)) {
    return main;
  }
  if (!samePath(repoRoot, worktreePath) && existsSync(repoRoot)) {
    return repoRoot;
  }
  throw new Error(`No stable repository worktree is available to clean up ${worktreePath}.`);
}

function worktreeCleanupStatus(manifest, cleanupCwd) {
  const exists = existsSync(manifest.worktree_path) && statSync(manifest.worktree_path).isDirectory();
  if (!exists) {
    return { exists: false, listed: worktreeListed(manifest.worktree_path, cleanupCwd), dirty: false };
  }
  const status = parseStatus(manifest.worktree_path);
  return { exists: true, listed: worktreeListed(manifest.worktree_path, cleanupCwd), dirty: status.any, status };
}

function cleanupMergedPlan(manifest, pr, options) {
  const localBranchSha = branchSha(manifest.branch, options.cleanupCwd);
  const remoteBranchSha = options.deleteRemote ? originBranchSha(manifest.branch, options.cleanupCwd) : "";
  const expectedHeadSha = expectedCleanupHeadSha(manifest, pr);
  const lines = [
    `PR #${pr.number || manifest.pr_number || "unknown"} merged at ${pr.mergedAt}`,
    `expected head ${expectedHeadSha || "missing"}`,
    `owner ${manifest.owner || "unowned"}`,
    `local branch ${manifest.branch} (${localBranchSha || "absent"})`,
  ];
  if (options.deleteRemote) {
    lines.push(`remote branch origin/${manifest.branch} (${remoteBranchSha || "absent"})`);
  }
  lines.push(`clean generated artifacts under ${manifest.worktree_path}`);
  lines.push(`git worktree remove ${manifest.worktree_path}`);
  lines.push(`git branch -d ${manifest.branch}`);
  if (options.deleteRemote) {
    lines.push(`git push origin --delete ${manifest.branch}`);
  }
  return lines;
}

function cleanupMergedResources(manifest, state, options) {
  const cleanupStartedAt = new Date().toISOString();
  const expectedHeadSha = requireCleanupHeadSha(manifest, options.pr);
  preflightCleanupBranchHeads(manifest, options.cleanupCwd, expectedHeadSha, options.deleteRemote);
  manifest.cleanup_started_at = manifest.cleanup_started_at || cleanupStartedAt;
  manifest.cleanup_owner = manifest.owner || null;
  manifest.cleanup_branch = manifest.branch;
  manifest.cleanup_expected_head_sha = expectedHeadSha;
  manifest.cleanup_pr_number = options.pr.number || manifest.pr_number || null;
  manifest.cleanup_pr_url = options.pr.url || manifest.pr_url || null;
  manifest.cleanup_merged_at = options.pr.mergedAt || manifest.merged_at || null;
  manifest.cleanup_local_branch_sha = branchSha(manifest.branch, options.cleanupCwd) || manifest.cleanup_local_branch_sha || null;
  if (options.deleteRemote) {
    manifest.cleanup_remote_branch_sha =
      originBranchSha(manifest.branch, options.cleanupCwd) || manifest.cleanup_remote_branch_sha || null;
  }

  removeWorktreeIfPresent(manifest, state, options.cleanupCwd);
  deleteLocalBranchIfPresent(manifest, options.cleanupCwd, expectedHeadSha);
  if (options.deleteRemote) {
    deleteRemoteBranchIfPresent(manifest, options.cleanupCwd, expectedHeadSha);
  }
  manifest.cleanup_completed_at = new Date().toISOString();
}

function preflightCleanupBranchHeads(manifest, cleanupCwd, expectedHeadSha, deleteRemote) {
  assertExpectedBranchHead(`Local branch ${manifest.branch}`, branchSha(manifest.branch, cleanupCwd), expectedHeadSha);
  if (deleteRemote) {
    assertExpectedBranchHead(
      `Remote branch origin/${manifest.branch}`,
      originBranchSha(manifest.branch, cleanupCwd),
      expectedHeadSha,
    );
  }
}

function expectedCleanupHeadSha(manifest, pr) {
  return String(pr?.headRefOid || manifest.pr_delivery_head_sha || "").trim();
}

function requireCleanupHeadSha(manifest, pr) {
  const expectedHeadSha = expectedCleanupHeadSha(manifest, pr);
  if (!expectedHeadSha) {
    throw new Error("Cleanup requires exact PR head evidence before deleting lane branches.");
  }
  return expectedHeadSha;
}

function assertExpectedBranchHead(label, actualSha, expectedSha) {
  if (!actualSha) {
    return;
  }
  if (actualSha !== expectedSha) {
    throw new Error(`${label} head ${actualSha} does not match expected cleanup head ${expectedSha}.`);
  }
}

function removeWorktreeIfPresent(manifest, state, cleanupCwd) {
  const exists = existsSync(manifest.worktree_path);
  const listed = worktreeListed(manifest.worktree_path, cleanupCwd);
  if (!exists && listed) {
    runChecked("git", ["worktree", "prune"], { cwd: cleanupCwd });
  }
  const wasPresent = exists || listed;
  if (wasPresent) {
    if (exists) {
      removeWorktree(manifest.worktree_path, state, { cwd: cleanupCwd });
      appendTaskEvent(manifest, "worktree_removed", manifest.worktree_path);
    } else {
      appendTaskEvent(manifest, "worktree_registration_pruned", manifest.worktree_path);
    }
  } else {
    appendTaskEvent(manifest, "worktree_already_absent", manifest.worktree_path);
  }
  if (existsSync(manifest.worktree_path) || worktreeListed(manifest.worktree_path, cleanupCwd)) {
    throw new Error(`Worktree still exists after cleanup: ${manifest.worktree_path}`);
  }
  manifest.worktree_removed_at = manifest.worktree_removed_at || new Date().toISOString();
}

function deleteLocalBranchIfPresent(manifest, cleanupCwd, expectedHeadSha) {
  const localSha = branchSha(manifest.branch, cleanupCwd);
  assertExpectedBranchHead(`Local branch ${manifest.branch}`, localSha, expectedHeadSha);
  if (localSha) {
    const branchDelete = git(["update-ref", "-d", `refs/heads/${manifest.branch}`, expectedHeadSha], { cwd: cleanupCwd });
    if (branchDelete.code !== 0) {
      throw new Error(branchDelete.stderr || branchDelete.stdout);
    }
    appendTaskEvent(manifest, "local_branch_deleted", manifest.branch);
  } else {
    appendTaskEvent(manifest, "local_branch_already_absent", manifest.branch);
  }
  if (branchExists(manifest.branch, cleanupCwd)) {
    throw new Error(`Local branch still exists after cleanup: ${manifest.branch}`);
  }
  manifest.local_branch_deleted_at = manifest.local_branch_deleted_at || new Date().toISOString();
}

function deleteRemoteBranchIfPresent(manifest, cleanupCwd, expectedHeadSha) {
  const remoteSha = originBranchSha(manifest.branch, cleanupCwd);
  assertExpectedBranchHead(`Remote branch origin/${manifest.branch}`, remoteSha, expectedHeadSha);
  if (remoteSha) {
    runChecked(
      "git",
      ["push", `--force-with-lease=refs/heads/${manifest.branch}:${expectedHeadSha}`, "origin", `:refs/heads/${manifest.branch}`],
      { cwd: cleanupCwd },
    );
    appendTaskEvent(manifest, "remote_branch_deleted", manifest.branch);
  } else {
    appendTaskEvent(manifest, "remote_branch_already_absent", manifest.branch);
  }
  if (originBranchSha(manifest.branch, cleanupCwd)) {
    throw new Error(`Remote branch still exists after cleanup: origin/${manifest.branch}`);
  }
  manifest.remote_branch_deleted_at = manifest.remote_branch_deleted_at || new Date().toISOString();
}

function cleanupOrphans(argv) {
  const { positional, options } = parseOptions(argv);
  const state = workspaceState(options);
  const query = positional.join(" ").trim().toLowerCase();
  const apply = Boolean(options.apply);

  if (!existsSync(state.worktreesDir)) {
    console.log(`No managed worktree directory exists: ${state.worktreesDir}`);
    return;
  }

  const directories = readdirSync(state.worktreesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(state.worktreesDir, entry.name))
    .filter((worktreePath) => !worktreeListed(worktreePath))
    .filter((worktreePath) => !query || basename(worktreePath).toLowerCase().includes(query));

  if (directories.length === 0) {
    console.log(query ? `No orphan worktree directories matched: ${query}` : "No orphan worktree directories found.");
    return;
  }
  if (!query && !options.all) {
    printPlan("cleanup-orphans", directories.map((worktreePath) => `orphan directory: ${worktreePath}`));
    console.log("Pass a query to target one orphan, or pass --all to include every orphan directory.");
    console.log("Add --apply to remove matched orphan directories.");
    return;
  }

  const plan = directories.flatMap((worktreePath) => [
    `clean generated artifacts under ${worktreePath}`,
    `remove orphan directory ${worktreePath}`,
  ]);

  if (options.dryRun || !apply) {
    printPlan("cleanup-orphans", plan);
    if (!apply) {
      console.log("Add --apply to remove matched orphan directories.");
    }
    return;
  }

  for (const worktreePath of directories) {
    removeManagedDirectory(worktreePath, state);
    console.log(`Removed orphan directory ${worktreePath}`);
  }
}

function cleanupBranches(argv) {
  const { positional, options } = parseOptions(argv);
  const query = positional.join(" ").trim().toLowerCase();
  const apply = Boolean(options.apply);
  const baseRef = String(options.base || cleanupBranchesDefaultBaseRef);

  if (!refExists(baseRef)) {
    throw new Error(`Base ref not found locally: ${baseRef}`);
  }
  const baseSha = git(["rev-parse", "--short", baseRef], { cwd: repoRoot }).stdout.trim() || "unknown";
  console.log(`Base: ${baseRef} (${baseSha})`);

  const branches = localCodexBranches().filter((branch) => !query || branch.toLowerCase().includes(query));
  if (branches.length === 0) {
    console.log(query ? `No local codex/* branches matched: ${query}` : "No local codex/* branches found.");
    return;
  }

  const activeWorktreeBranches = new Set(
    parseWorktreePorcelain(git(["worktree", "list", "--porcelain"], { cwd: repoRoot }).stdout || "")
      .map((record) => record.branch?.replace(/^refs\/heads\//, ""))
      .filter(Boolean),
  );
  const eligible = [];

  for (const branch of branches) {
    assertSafeBranch(branch);
    if (activeWorktreeBranches.has(branch)) {
      console.log(`SKIP ${branch}: branch is checked out in a worktree.`);
      continue;
    }

    const safety = branchCleanupSafety(branch, baseRef);
    if (!safety.safe) {
      console.log(`SKIP ${branch}: ${safety.reason}`);
      continue;
    }
    eligible.push({ branch, reason: safety.reason });
  }

  if (eligible.length === 0) {
    console.log(query ? `No safe local codex/* branch cleanup matched: ${query}` : "No safe local codex/* branch cleanup found.");
    return;
  }

  const plan = eligible.map(({ branch, reason }) => `delete local branch ${branch} (${reason})`);
  if (options.dryRun || !apply) {
    printPlan("cleanup-branches", plan);
    if (!apply) {
      console.log("Add --apply to delete the safe local branches.");
    }
    return;
  }

  for (const { branch } of eligible) {
    runChecked("git", ["branch", "-D", branch], { cwd: repoRoot });
    console.log(`Deleted local branch ${branch}`);
  }
  console.log(`Deleted ${eligible.length} safe local codex/* branch(es).`);
}

function rebuildIndex(argv) {
  const { options } = parseOptions(argv);
  const state = workspaceState(options);
  const worktrees = git(["worktree", "list", "--porcelain"], { cwd: repoRoot });
  if (worktrees.code !== 0) {
    throw new Error(worktrees.stderr || "Could not list Git worktrees.");
  }

  const records = parseWorktreePorcelain(worktrees.stdout)
    .filter((record) => record.branch && record.path && !samePath(record.path, mainWorktreePath()))
    .filter((record) => record.branch.startsWith("refs/heads/codex/"));

  if (records.length === 0) {
    console.log("No Codex worktrees found to index.");
    return;
  }

  mkdirSync(state.tasksDir, { recursive: true });
  const existingManifests = readManifests(state).map(({ manifest }) => manifest);
  for (const record of records) {
    const branch = record.branch.replace(/^refs\/heads\//, "");
    const existingManifest = existingManifests.find(
      (manifest) => manifest.branch === branch || samePath(manifest.worktree_path, record.path),
    );
    if (existingManifest) {
      console.log(`SKIP ${existingManifest.task_id}: manifest already indexes ${record.path}.`);
      continue;
    }

    const slug = slugify(branch.replace(/^codex\//, ""));
    const taskId = uniqueTaskId(state.tasksDir, `${dateStamp()}-${slug}`);
    const manifestPath = join(state.tasksDir, `${taskId}.json`);
    if (existsSync(manifestPath)) {
      console.log(`SKIP ${taskId}: manifest already exists.`);
      continue;
    }

    const manifest = {
      schema_version: 1,
      task_id: taskId,
      title: titleFromDescription(slug.replace(/-/g, " ")),
      description: `Rebuilt from Git worktree ${record.path}`,
      repo_name: workspaceKey(),
      repo_root: repoRoot,
      state_root: state.root,
      base_branch: rebuildIndexBaseBranch,
      base_ref: rebuildIndexBaseBranch,
      branch,
      worktree_path: record.path,
      status: "active",
      owner: null,
      owner_thread_id: null,
      owner_acquired_at: null,
      owner_updated_at: null,
      pr_url: null,
      pr_number: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_verified_at: null,
      last_verification_command: null,
      last_commit: record.head || null,
      events: [taskEvent("rebuilt", "manifest rebuilt from git worktree list")],
    };
    reconcileManifest(manifest, { refreshPr: true });

    if (options.dryRun) {
      printPlan(`rebuild-index ${taskId}`, [`write ${manifestPath}`]);
      printManifestSummary(manifest);
      continue;
    }

    withManifestLock(state, taskId, () => writeManifest(manifestPath, manifest));
    console.log(`Rebuilt manifest ${taskId}`);
  }
}

function doctor(argv) {
  const { options } = parseOptions(argv);
  const state = workspaceState(options);
  const findings = [];

  collectCommand(findings, "git", ["--version"]);
  collectCommand(findings, "node", ["--version"]);
  collectCommand(findings, "gh", ["--version"], { optional: true });

  const inside = git(["rev-parse", "--is-inside-work-tree"], { cwd: repoRoot });
  addFinding(findings, inside.code === 0 && inside.stdout.trim() === "true", "Repository worktree detected.");

  const origin = git(["remote", "get-url", "origin"], { cwd: repoRoot });
  addFinding(findings, origin.code === 0, origin.code === 0 ? "origin remote configured." : "origin remote missing.");

  const hooksPath = git(["config", "--get", "core.hooksPath"], { cwd: repoRoot });
  addFinding(
    findings,
    hooksPath.stdout.trim() === ".githooks",
    hooksPath.stdout.trim() === ".githooks"
      ? "core.hooksPath is .githooks."
      : "core.hooksPath is not .githooks.",
  );

  const prunableWorktrees = prunableGitWorktrees(repoRoot);
  if (prunableWorktrees.length === 0) {
    addFinding(findings, true, "No prunable git worktree registrations detected.");
  } else {
    for (const worktreePath of prunableWorktrees) {
      addFinding(
        findings,
        false,
        "",
        `Prunable git worktree registration blocks branch cleanup: ${worktreePath}. Run git worktree prune before retrying branch cleanup.`,
        true,
      );
    }
  }

  addFinding(findings, existsSync(join(repoRoot, ".githooks", "pre-push")), "pre-push guard exists.");
  addFinding(
    findings,
    existsSync(state.root),
    `state root exists: ${state.root}`,
    "state root does not exist yet; it will be created by the first `start` command.",
    true,
  );

  const manifests = readManifests(state);
  for (const { manifest } of manifests) {
    const worktreeOk = existsSync(manifest.worktree_path);
    addFinding(
      findings,
      worktreeOk || manifest.status === "closed",
      `${manifest.task_id}: worktree state is consistent.`,
      `${manifest.task_id}: worktree path missing for non-closed task.`,
    );
  }

  for (const finding of findings) {
    console.log(`${finding.ok ? "OK" : finding.optional ? "WARN" : "FAIL"}: ${finding.message}`);
  }

  if (findings.some((finding) => !finding.ok && !finding.optional)) {
    process.exit(1);
  }
}

function readManifests(state) {
  return readManifestRecords(state)
    .map((record) => {
      if (record.error) {
        return record;
      }
      const path = record.path;
      try {
        const manifest = record.manifest;
        validateManifest(manifest, path);
        reconcileManifest(manifest);
        return { path, manifest };
      } catch (error) {
        return { path, error };
      }
    })
    .filter((record) => {
      if (record.error) {
        console.error(`WARN: skipping invalid manifest ${record.path}: ${record.error.message}`);
        return false;
      }
      return true;
    })
    .sort((left, right) => left.manifest.task_id.localeCompare(right.manifest.task_id));
}

function repairManifests(argv) {
  const { options } = parseOptions(argv);
  const state = workspaceState(options);
  const apply = Boolean(options.apply);
  const records = readManifestRecords(state);
  const plans = [];
  const blocked = [];

  for (const record of records) {
    const plan = closedManifestRepairPlan(record, state);
    if (plan.repairable) {
      plans.push(plan);
    } else if (plan.reason) {
      blocked.push(plan);
    }
  }

  const lines = [];
  if (plans.length === 0) {
    lines.push("no repairable closed legacy manifests found");
  } else {
    for (const plan of plans) {
      lines.push(`${plan.taskId}: add ${plan.fields.join(", ")} to closed manifest ${plan.path}`);
    }
  }
  for (const plan of blocked) {
    lines.push(`blocked ${plan.name}: ${plan.reason}`);
  }

  if (!apply) {
    printPlan("repair-manifests", [...lines, "preview only; pass --apply to write repairable closed manifests"]);
    return;
  }

  for (const plan of plans) {
    withManifestLock(state, plan.taskId, () => {
      const freshRecord = { path: plan.path, manifest: readManifest(plan.path) };
      const freshPlan = closedManifestRepairPlan(freshRecord, state);
      if (!freshPlan.repairable) {
        throw new Error(`Repair target changed for ${plan.taskId}; rerun repair-manifests.`);
      }
      const repaired = {
        ...freshRecord.manifest,
        ...freshPlan.patch,
        updated_at: new Date().toISOString(),
      };
      const fields = freshPlan.fields.join(", ");
      repaired.events = Array.isArray(repaired.events) ? repaired.events : [];
      repaired.events.push(taskEvent("manifest_repaired", `closed legacy manifest repaired: ${fields}`));
      validateManifest(repaired, plan.path);
      writeManifest(plan.path, repaired);
    });
  }

  printApplied("repair-manifests", lines);
}

function closedManifestRepairPlan(record, state) {
  const name = basename(record.path);
  if (record.error) {
    return { name, path: record.path, repairable: false, reason: record.error.message };
  }

  const manifest = record.manifest;
  const taskId = String(manifest.task_id || "").trim();
  const branch = String(manifest.branch || "").trim();
  const status = String(manifest.status || "").trim();
  if (!taskId || !branch || !status) {
    return { name, path: record.path, repairable: false, reason: "missing task_id, branch, or status" };
  }

  const patch = {};
  const fields = [];
  if (!manifest.worktree_path) {
    patch.worktree_path = join(state.worktreesDir, taskId);
    fields.push("worktree_path");
  }
  if (!manifest.base_branch) {
    patch.base_branch = defaultBaseBranch;
    fields.push("base_branch");
  }

  if (fields.length === 0) {
    return { name, path: record.path, taskId, repairable: false };
  }

  if (status !== "closed") {
    return { name, path: record.path, taskId, repairable: false, reason: "only closed legacy manifests can be repaired" };
  }

  return {
    name,
    path: record.path,
    taskId,
    repairable: true,
    fields,
    patch,
  };
}

function readManifest(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readManifestRecords(state) {
  if (!existsSync(state.tasksDir)) {
    return [];
  }

  return readdirSync(state.tasksDir)
    .filter((name) => name.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => {
      const path = join(state.tasksDir, name);
      try {
        const manifest = readManifest(path);
        return { path, manifest };
      } catch (error) {
        return { path, error };
      }
    });
}

function readAssignments(state) {
  if (!existsSync(state.assignmentsDir)) {
    return [];
  }

  return readdirSync(state.assignmentsDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const path = join(state.assignmentsDir, name);
      try {
        const assignment = readAssignment(path);
        validateAssignment(assignment, path);
        return { path, assignment };
      } catch (error) {
        return { path, error };
      }
    })
    .filter((record) => {
      if (record.error) {
        console.error(`WARN: skipping invalid assignment ${record.path}: ${record.error.message}`);
        return false;
      }
      return true;
    })
    .sort((left, right) => left.assignment.assignment_id.localeCompare(right.assignment.assignment_id));
}

function readAssignment(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function findAssignment(state, query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const matches = readAssignments(state).filter(({ assignment }) =>
    [
      assignment.assignment_id,
      assignment.task_id,
      assignment.lane_slug,
      assignment.branch,
      assignment.source_backlog_item?.item_id,
      assignment.source_backlog_item?.branch_name,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalized)),
  );

  if (matches.length === 0) {
    return null;
  }
  if (matches.length > 1) {
    throw new Error(`Query matched multiple assignments: ${matches.map((m) => m.assignment.assignment_id).join(", ")}`);
  }
  return matches[0];
}

function findManifest(state, query, options = {}) {
  const manifests = readManifests(state);
  if (manifests.length === 0) {
    throw new Error(`No Codex workspace manifests found under ${state.tasksDir}`);
  }

  if (options.preferCurrentWorktree) {
    const currentRoot = currentGitRoot();
    const current = manifests.find((record) => samePath(record.manifest.worktree_path, currentRoot));
    if (current && !query.trim()) {
      return current;
    }
  }

  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    const active = manifests.filter((record) => record.manifest.status !== "closed");
    if (active.length === 1) {
      return active[0];
    }
    throw new Error("Specify a task query; multiple active workspaces exist.");
  }

  const matches = manifests.filter(({ manifest }) =>
    [manifest.task_id, manifest.title, manifest.description, manifest.branch]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalized)),
  );

  if (matches.length === 0) {
    throw new Error(`No workspace matched query: ${query}`);
  }
  if (matches.length > 1) {
    throw new Error(`Query matched multiple workspaces: ${matches.map((m) => m.manifest.task_id).join(", ")}`);
  }
  return matches[0];
}

function writeManifest(path, manifest) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

function writeAssignment(path, assignment) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(assignment, null, 2)}\n`);
}

function fetchBaseBranch(baseBranch, options = {}) {
  assertSafeBaseBranch(baseBranch);
  const result = git(["fetch", "origin", baseBranch], { cwd: repoRoot });
  if (result.code === 0) {
    return;
  }
  if (
    options.usingDefaultBase &&
    baseBranch === defaultBaseBranch &&
    !baseRefAvailable(baseBranch) &&
    fetchFailureLooksMissingRemoteRef(result)
  ) {
    throw new Error(branchFoundationDefaultBaseMessage(baseBranch));
  }
  throw new Error(result.stderr || `git fetch origin ${baseBranch} failed`);
}

function resolveBaseRef(baseBranch, options = {}) {
  assertSafeBaseBranch(baseBranch);
  const originRef = `origin/${baseBranch}`;
  if (git(["rev-parse", "--verify", "--quiet", originRef], { cwd: repoRoot }).code === 0) {
    return originRef;
  }
  if (git(["rev-parse", "--verify", "--quiet", baseBranch], { cwd: repoRoot }).code === 0) {
    return baseBranch;
  }
  if (options.usingDefaultBase && baseBranch === defaultBaseBranch) {
    throw new Error(branchFoundationDefaultBaseMessage(baseBranch));
  }
  throw new Error(`Base branch not found locally: ${baseBranch}`);
}

function baseRefAvailable(baseBranch) {
  return refExists(`origin/${baseBranch}`) || refExists(baseBranch);
}

function fetchFailureLooksMissingRemoteRef(result) {
  return /could(n't| not) find remote ref|fatal: couldn't find remote ref/i.test(result.stderr || "");
}

function branchFoundationDefaultBaseMessage(baseBranch) {
  return [
    `Branch foundation default base ${baseBranch} was not found locally or as origin/${baseBranch}.`,
    "Run node ./scripts/branch-foundation.mjs report to inspect branch foundation state.",
    "Create or push the missing branch only through the approval-gated branch foundation setup flow.",
  ].join(" ");
}

function branchExists(branch, cwd = repoRoot) {
  return git(["rev-parse", "--verify", "--quiet", branch], { cwd }).code === 0;
}

function remoteBranchExists(branch) {
  return git(["rev-parse", "--verify", "--quiet", `origin/${branch}`], { cwd: repoRoot }).code === 0;
}

function branchSha(branch, cwd = repoRoot) {
  const result = git(["rev-parse", "--verify", "--quiet", branch], { cwd });
  return result.code === 0 ? result.stdout.trim() : "";
}

function originBranchSha(branch, cwd = repoRoot) {
  const result = git(["ls-remote", "--heads", "origin", branch], { cwd });
  if (result.code !== 0) {
    throw new Error(result.stderr || `Could not inspect remote branch: origin/${branch}`);
  }
  if (!result.stdout) {
    return "";
  }
  return result.stdout.split(/\s+/)[0] || "";
}

function refExists(ref) {
  return git(["rev-parse", "--verify", "--quiet", ref], { cwd: repoRoot }).code === 0;
}

function assertSafeBranch(branch) {
  const short = branch.replace(/^refs\/heads\//, "");
  if (protectedBranches.has(short)) {
    throw new Error(`Refusing to operate on protected branch: ${branch}`);
  }
}

function assertSafeBaseBranch(branch) {
  const value = String(branch || "").trim();
  if (
    !value ||
    value !== branch ||
    value.startsWith("-") ||
    value.startsWith("refs/") ||
    /[\s:*]/.test(value) ||
    value.includes("..") ||
    value.includes("@{") ||
    git(["check-ref-format", "--branch", value], { cwd: repoRoot }).code !== 0
  ) {
    throw new Error(`Invalid base branch: ${branch}`);
  }
}

function assertSafeTaskId(taskId) {
  if (taskId !== basename(taskId) || taskId.includes("..") || !/^[a-zA-Z0-9._-]+$/.test(taskId)) {
    throw new Error(`Invalid task id: ${taskId}`);
  }
}

function uniqueTaskId(tasksDir, baseTaskId) {
  assertSafeTaskId(baseTaskId);
  let candidate = baseTaskId;
  let index = 2;
  while (existsSync(join(tasksDir, `${candidate}.json`))) {
    candidate = `${baseTaskId}-${index}`;
    index += 1;
  }
  return candidate;
}

function assertCurrentBranch(manifest) {
  const result = git(["branch", "--show-current"], { cwd: manifest.worktree_path });
  if (result.code !== 0 || result.stdout.trim() !== manifest.branch) {
    throw new Error(`Worktree is on ${result.stdout.trim() || "unknown branch"}, expected ${manifest.branch}.`);
  }
}

function verificationCommand(profile) {
  const profiles = {
    preflight: ["node", "./scripts/preflight.mjs"],
    check: ["pnpm", "run", "check"],
    "codex-workspace": ["node", "./scripts/test-codex-workspace.mjs"],
  };
  if (!profiles[profile]) {
    throw new Error(`Unknown verification profile: ${profile}. Use preflight, check, or codex-workspace.`);
  }
  return profiles[profile];
}

function requireGh(commandName) {
  const result = run("gh", ["--version"], { cwd: repoRoot });
  if (result.code !== 0) {
    throw new Error(`${commandName} requires GitHub CLI 'gh' to be installed and available on PATH.`);
  }
}

function validateManifest(manifest, path) {
  for (const key of ["task_id", "branch", "worktree_path", "base_branch", "status"]) {
    if (!manifest[key]) {
      throw new Error(`Manifest ${path} is missing required field: ${key}`);
    }
  }
  assertSafeBranch(manifest.branch);
}

function validateAssignment(assignment, path) {
  for (const key of ["assignment_id", "branch", "status"]) {
    if (!assignment[key]) {
      throw new Error(`Assignment ${path} is missing required field: ${key}`);
    }
  }
  assertSafeTaskId(String(assignment.assignment_id));
  assertSafeBranch(String(assignment.branch));
}

function currentLaneOwner(options = {}) {
  const configured = options.owner || process.env.CODEX_WORKSPACE_OWNER || process.env.CODEX_THREAD_ID;
  const owner = configured ? String(configured).trim() : `${process.env.USER || "unknown"}@${hostname() || "unknown-host"}`;
  return owner || "unknown-owner";
}

function laneOwnerWarning(manifest, options = {}) {
  if (!manifest.owner) {
    return "";
  }
  const currentOwner = currentLaneOwner(options);
  if (manifest.owner === currentOwner) {
    return "";
  }
  return [
    `Owner warning: lane is owned by ${manifest.owner}.`,
    `Current runner owner is ${currentOwner}.`,
    "Do not mutate this lane unless the operator confirms it is idle and you pass --take-ownership.",
  ].join(" ");
}

function assertLaneOwner(manifest, options = {}) {
  const warning = laneOwnerWarning(manifest, options);
  if (warning && !options.takeOwnership) {
    throw new Error(
      `${manifest.task_id} is owned by ${manifest.owner}; current runner is ${currentLaneOwner(
        options,
      )}. Use --take-ownership only after confirming the lane is idle.`,
    );
  }
  if (warning && options.takeOwnership && !validTakeoverReason(options.takeoverReason)) {
    throw new Error("--takeover-reason must explain the takeover in at least 10 non-whitespace characters.");
  }
}

function validTakeoverReason(value) {
  return String(value || "").replace(/\s+/g, "").length >= 10;
}

function classifyWorkspaceAssignment(manifest, context) {
  if (manifest.status === "closed") {
    return {
      status: "closed",
      reason: "workspace manifest is closed",
      nextAction: "no assignment action",
    };
  }

  if (String(manifest.status || "").startsWith("blocked_authority")) {
    return {
      status: "blocked_authority",
      reason: "manifest is authority-blocked",
      nextAction: "wait for explicit authority approval",
    };
  }

  if (!manifest.worktree_path || !existsSync(manifest.worktree_path)) {
    return {
      status: "ambiguous",
      reason: "worktree path is missing",
      nextAction: "run workspace doctor or rebuild-index before assignment",
    };
  }

  if (manifest.owner && manifest.owner !== context.currentOwner) {
    if (laneOwnerIsStale(manifest, context)) {
      return {
        status: "blocked_stale_owner_needs_takeover",
        reason: `owner heartbeat older than ${context.staleAfterSeconds} seconds`,
        nextAction: "prepare takeover evidence and ask operator before mutation",
      };
    }
    return {
      status: "blocked_owned_active",
      reason: `owned by ${manifest.owner}`,
      nextAction: "do not mutate without explicit takeover approval",
    };
  }

  if (manifest.status === "merged") {
    return {
      status: "cleanup",
      reason: "PR is merged but cleanup is not closed",
      nextAction: "run cleanup-merged dry-run before cleanup",
    };
  }

  if (manifest.status === "cleanup_partial") {
    return {
      status: "cleanup",
      reason: manifest.cleanup_error || "cleanup is partial",
      nextAction: "resume cleanup-merged after confirming branch head evidence",
    };
  }

  if (manifest.status === "pr_open") {
    return {
      status: "delivery",
      reason: "PR is open",
      nextAction: "check PR review, checks, exact head, and merge evidence",
    };
  }

  if (!manifest.owner) {
    return {
      status: "assignable",
      reason: "active workspace has no owner",
      nextAction: "eligible for future claim-next only after dry-run evidence",
    };
  }

  return {
    status: "active",
    reason: "owned by current runner",
    nextAction: "continue lane or update heartbeat in a future phase",
  };
}

function laneOwnerIsStale(manifest, context) {
  const timestamp = Date.parse(manifest.owner_updated_at || manifest.updated_at || manifest.created_at || "");
  if (!Number.isFinite(timestamp)) {
    return true;
  }
  return context.generatedAt.getTime() - timestamp > context.staleAfterSeconds * 1000;
}

function classifyBacklogItem(item, manifestBranchStates, assignmentBranchStates = new Map(), manifests = [], assignments = []) {
  if (item.status === "closed" || item.recommendedSliceSize === "complete") {
    return {
      status: "closed",
      reason: "safe backlog item is already complete and must not be requeued",
    };
  }

  if (item.status !== "ready" || item.recommendedSliceSize === "do_not_start") {
    return {
      status: "blocked_authority",
      reason: "safe backlog item is not dispatchable from generic continuation",
    };
  }
  if (!item.startCommand && !item.branchName) {
    return {
      status: "ambiguous",
      reason: "ready item has no source-owned lane start command",
    };
  }
  const closedCompletionEvidence = closedSourceCompletionEvidence(item, manifests, assignments);
  if (closedCompletionEvidence) {
    return {
      status: "closed",
      reason: closedCompletionEvidence,
    };
  }
  const branchNameError = item.branchName ? claimBranchNameBlocker(item.branchName) : "";
  if (branchNameError) {
    return {
      status: "ambiguous",
      reason: branchNameError,
    };
  }
  const assignmentState = item.branchName ? assignmentBranchStates.get(item.branchName) : null;
  if (assignmentState === "active") {
    return {
      status: "claimed",
      reason: "lane assignment already exists for branch",
    };
  }
  if (assignmentState === "ambiguous") {
    return {
      status: "ambiguous",
      reason: "multiple active assignment records exist for branch",
    };
  }
  const branchState = item.branchName ? manifestBranchStates.get(item.branchName) : null;
  if (branchState === "active") {
    return {
      status: "active",
      reason: "workspace manifest already exists for branch",
    };
  }
  if (branchState === "closed") {
    return {
      status: "assignable",
      reason: "only closed workspace manifests exist for branch",
    };
  }
  const branchAvailabilityError = item.branchName ? claimBranchAvailabilityBlocker(item.branchName) : "";
  if (branchAvailabilityError) {
    return {
      status: "ambiguous",
      reason: branchAvailabilityError,
    };
  }
  return {
    status: "assignable",
    reason: "ready safe backlog item has no active workspace conflict",
  };
}

function classifyLaneAssignment(assignment, context) {
  if (assignment.status === "closed") {
    return {
      status: "closed",
      reason: "assignment is closed",
      nextAction: "no assignment action",
    };
  }

  if (String(assignment.status || "").startsWith("blocked_authority")) {
    return {
      status: "blocked_authority",
      reason: "assignment is authority-blocked",
      nextAction: "wait for explicit authority approval",
    };
  }

  if (!assignment.owner) {
    return {
      status: "ambiguous",
      reason: "assignment has no owner",
      nextAction: "inspect assignment metadata before mutation",
    };
  }

  if (assignment.owner !== context.currentOwner) {
    if (laneAssignmentIsStale(assignment, context)) {
      return {
        status: "blocked_stale_owner_needs_takeover",
        reason: `assignment heartbeat older than ${context.staleAfterSeconds} seconds`,
        nextAction: "prepare takeover evidence and ask operator before mutation",
      };
    }
    return {
      status: "blocked_owned_active",
      reason: `assigned to ${assignment.owner}`,
      nextAction: "do not mutate without explicit takeover approval",
    };
  }

  return {
    status: "claimed",
    reason: "assignment is owned by current runner",
    nextAction: "continue lane or refresh claim evidence",
  };
}

function laneAssignmentIsStale(assignment, context) {
  const timestamp = Date.parse(
    assignment.last_heartbeat_at || assignment.updated_at || assignment.assigned_at || assignment.created_at || "",
  );
  if (!Number.isFinite(timestamp)) {
    return true;
  }
  return context.generatedAt.getTime() - timestamp > context.staleAfterSeconds * 1000;
}

function evaluateClaimCandidate(item, manifests, assignments, context) {
  const base = {
    item,
    claimable: false,
    action: "",
    mutation: "",
    status: "ambiguous",
    reason: "",
    nextAction: "inspect safe backlog evidence before claiming",
  };

  if (item.status === "closed" || item.recommendedSliceSize === "complete") {
    return {
      ...base,
      status: "closed",
      reason: "safe backlog item is already complete and must not be requeued",
      nextAction: "choose the next ready safe backlog lane",
    };
  }

  if (item.status !== "ready" || item.recommendedSliceSize === "do_not_start") {
    return {
      ...base,
      status: "blocked_authority",
      reason: "safe backlog item is not dispatchable from generic continuation",
      nextAction: "wait for explicit authority approval",
    };
  }

  if (!item.startCommand || !item.branchName) {
    return {
      ...base,
      status: "ambiguous",
      reason: "ready item has no source-owned lane start command and branch",
      nextAction: "add source-owned nextLane metadata before claim",
    };
  }

  const closedCompletionEvidence = closedSourceCompletionEvidence(item, manifests, assignments);
  if (closedCompletionEvidence) {
    return {
      ...base,
      status: "closed",
      reason: closedCompletionEvidence,
      nextAction: "choose the next ready safe backlog lane",
    };
  }

  const branchNameError = claimBranchNameBlocker(item.branchName);
  if (branchNameError) {
    return {
      ...base,
      status: "ambiguous",
      reason: branchNameError,
      nextAction: "resolve branch evidence before claim",
    };
  }

  const branchManifests = manifests.filter((manifest) => manifest.branch === item.branchName);
  const activeManifests = branchManifests.filter((manifest) => manifest.status !== "closed");
  if (activeManifests.length > 1) {
    return {
      ...base,
      status: "ambiguous",
      reason: `multiple active workspace manifests exist for ${item.branchName}`,
      nextAction: "run workspace doctor and resolve duplicate manifests before claim",
    };
  }

  if (activeManifests.length === 1) {
    const manifest = activeManifests[0];
    const assignment = classifyWorkspaceAssignment(manifest, context);
    if (!manifest.owner && assignment.status === "assignable") {
      return {
        ...base,
        claimable: true,
        action: `claim existing unowned workspace ${manifest.task_id}`,
        mutation: "manifest_owner_claim",
        targetTaskId: manifest.task_id,
        status: "assignable",
        reason: "ready safe backlog lane has an unowned active workspace",
        nextAction: "--apply may write owner evidence to the existing manifest",
      };
    }
    return {
      ...base,
      status: assignment.status,
      reason: assignment.reason,
      nextAction: assignment.nextAction,
    };
  }

  const openAssignments = activeAssignmentsForBranch(assignments, item.branchName);
  if (openAssignments.length > 1) {
    return {
      ...base,
      status: "ambiguous",
      reason: `multiple active lane assignments exist for ${item.branchName}`,
      nextAction: "inspect assignment metadata before claim",
    };
  }

  if (openAssignments.length === 1) {
    const assignment = openAssignments[0];
    const classification = classifyLaneAssignment(assignment, context);
    if (assignment.owner === context.currentOwner && classification.status === "claimed") {
      return {
        ...base,
        claimable: true,
        action: `refresh existing assignment ${assignment.assignment_id}`,
        mutation: "assignment_refresh",
        targetAssignmentId: assignment.assignment_id,
        status: "claimed",
        reason: "ready safe backlog lane is already claimed by current runner",
        nextAction: "--apply may refresh assignment evidence",
      };
    }
    return {
      ...base,
      status: classification.status,
      reason: classification.reason,
      nextAction: classification.nextAction,
    };
  }

  const branchAvailabilityError = claimBranchAvailabilityBlocker(item.branchName);
  if (branchAvailabilityError) {
    return {
      ...base,
      status: "ambiguous",
      reason: branchAvailabilityError,
      nextAction: "resolve branch evidence before claim",
    };
  }

  return {
    ...base,
    claimable: true,
    action: "claim ready safe backlog lane",
    mutation: "assignment_write",
    targetAssignmentId: item.itemId,
    status: "assignable",
    reason:
      branchManifests.length > 0
        ? "only closed workspace manifests exist for branch"
        : "ready safe backlog lane has no workspace conflict",
    nextAction: "--apply may write assignment evidence only",
  };
}

function activeAssignmentsForBranch(assignments, branchName) {
  return assignments.filter((assignment) => assignment.branch === branchName && assignment.status !== "closed");
}

function closedSourceCompletionEvidence(item, manifests, assignments) {
  const itemId = String(item.itemId || "").trim();
  if (!itemId) {
    return "";
  }
  const branchName = String(item.branchName || "").trim();
  const assignment = assignments.find((record) => {
    if (record.status !== "closed") return false;
    if (record.assignment_id === itemId || record.lane_slug === itemId || record.source_backlog_item?.item_id === itemId) {
      return true;
    }
    return Boolean(branchName && record.branch === branchName && record.source_backlog_item?.item_id === itemId);
  });
  if (assignment) {
    return `closed assignment evidence exists for ${itemId}`;
  }

  const manifest = manifests.find((record) => {
    if (record.status !== "closed") return false;
    if (record.source_assignment_id === itemId || record.source_backlog_item?.item_id === itemId) {
      return true;
    }
    return Boolean(
      branchName &&
        record.branch === branchName &&
        (record.source_assignment_id === itemId || record.source_backlog_item?.item_id === itemId),
    );
  });
  if (manifest) {
    return `closed workspace evidence exists for ${itemId}`;
  }

  return "";
}

function assignmentBranchStatesByBranch(assignments) {
  const grouped = new Map();
  for (const assignment of assignments) {
    if (!assignment.branch || assignment.status === "closed") {
      continue;
    }
    const count = grouped.get(assignment.branch) || 0;
    grouped.set(assignment.branch, count + 1);
  }

  const states = new Map();
  for (const [branch, count] of grouped) {
    states.set(branch, count > 1 ? "ambiguous" : "active");
  }
  return states;
}

function applyClaimNext(selected, context) {
  if (selected.mutation === "manifest_owner_claim") {
    return applyManifestOwnerClaim(selected, context);
  }

  if (selected.mutation === "assignment_write" || selected.mutation === "assignment_refresh") {
    return applyAssignmentClaim(selected, context);
  }

  throw new Error(`Unsupported claim mutation: ${selected.mutation || "unknown"}`);
}

function dispatchPlan(context) {
  const evaluations = dispatchCandidateEvaluations(context);
  const selected = evaluations.find((evaluation) => evaluation.claimable) || null;
  const packet = dispatchPacket(selected, evaluations, context);
  return {
    evaluations,
    selected,
    packet,
  };
}

function dispatchCandidateEvaluations(context) {
  const manifests = readManifests(context.state).map(({ manifest }) => manifest);
  const assignments = readAssignments(context.state).map(({ assignment }) => assignment);
  const backlogItems = readSafeBacklogItems();
  return backlogItems.map((item) =>
    evaluateClaimCandidate(item, manifests, assignments, {
      currentOwner: context.currentOwner,
      generatedAt: context.generatedAt,
      staleAfterSeconds: context.staleAfterSeconds,
    }),
  );
}

function dispatchCandidateStateCounts(context) {
  return queueCandidateStateCounts(dispatchCandidateEvaluations(context));
}

function dispatchPacket(selected, evaluations, context) {
  const blockers = [];
  if (!selected) {
    blockers.push("no dispatchable safe backlog lane found");
  }
  const candidateStateCounts = queueCandidateStateCounts(evaluations);
  const nextActionGuidance = dispatchNextActionGuidance(selected, candidateStateCounts);

  return {
    schema_version: 1,
    selected_lane: selected?.item.itemId || null,
    owner: context.currentOwner,
    branch: selected?.item.branchName || null,
    base_branch: selected ? dispatchPacketBaseBranch(selected, context) : null,
    claim_action: selected?.action || null,
    claim_mutation: selected?.mutation || null,
    workspace_action: selected ? dispatchWorkspaceAction(selected) : null,
    readiness_profile: context.readinessProfile,
    next_command: selected ? dispatchNextCommand(selected, context.readinessProfile) : null,
    handoff: selected ? "runner may resume prepared worktree; no worker or provider process launched" : null,
    stop_lines: defaultDispatchStopLines(),
    allowed: blockers.length === 0,
    blockers,
    next_action_guidance: nextActionGuidance,
    generated_at: context.generatedAt.toISOString(),
    candidate_state_counts: candidateStateCounts,
    blocked_candidates: evaluations
      .filter((evaluation) => !evaluation.claimable)
      .map((evaluation) => ({
        item_id: evaluation.item.itemId,
        status: evaluation.status,
        reason: evaluation.reason,
        next_action: evaluation.nextAction,
      })),
  };
}

function buildDispatchNextSummary({ state, currentOwner, staleAfterSeconds, readinessProfile, plan }) {
  const blockedCandidates = plan.evaluations.filter((evaluation) => !evaluation.claimable);
  return {
    currentOwner,
    stateRoot: state.root,
    staleAfterSeconds,
    readinessProfile,
    selected: plan.selected ? summarizeClaimEvaluation(plan.selected) : null,
    dispatch: {
      allowed: plan.packet.allowed,
      selectedLane: plan.packet.selected_lane,
      branch: plan.packet.branch,
      baseBranch: plan.packet.base_branch,
      claimAction: plan.packet.claim_action,
      claimMutation: plan.packet.claim_mutation,
      workspaceAction: plan.packet.workspace_action,
      nextCommand: plan.packet.next_command,
      nextActionGuidance: plan.packet.next_action_guidance,
      blockers: plan.packet.blockers,
      stopLines: plan.packet.stop_lines,
      generatedAt: plan.packet.generated_at,
    },
    counts: {
      total: plan.evaluations.length,
      dispatchable: plan.evaluations.filter((evaluation) => evaluation.claimable).length,
      blocked: blockedCandidates.length,
    },
    candidateStateCounts: plan.packet.candidate_state_counts,
    blockedCandidates: plan.packet.blocked_candidates.slice(0, 10),
    blockedCandidatesTruncated: plan.packet.blocked_candidates.length > 10,
    mutation: "none; dry-run summary only",
  };
}

function dispatchNextActionGuidance(selected, counts = {}) {
  if (selected) {
    return "run dispatch-next --apply after reviewing the dry-run packet";
  }
  if (counts.delivery > 0) {
    return "finish open delivery lanes first: verify PR checks, review threads, exact head, merge evidence, then run merged-lane cleanup";
  }
  if (counts.cleanup > 0) {
    return "run cleanup-merged dry-run for merged lanes before claiming more work";
  }
  if (counts.blocked_stale_owner_needs_takeover > 0) {
    return "prepare takeover evidence for stale owned lanes and ask the operator before mutation";
  }
  if (counts.blocked_owned_active > 0) {
    return "wait for active owned lanes or get explicit takeover approval before mutation";
  }
  if (counts.blocked_authority > 0) {
    return "wait for explicit authority approval before starting blocked-authority work";
  }
  if (counts.ambiguous > 0) {
    return "resolve ambiguous workspace or assignment evidence before claiming another lane";
  }
  return "add or refresh source-owned safe backlog next-lane metadata";
}

function queueCandidateStateCounts(evaluations) {
  const counts = {};
  for (const evaluation of evaluations) {
    if (typeof evaluation.status !== "string" || !evaluation.status.trim()) {
      const itemId = evaluation.item?.itemId || "unknown";
      throw new Error(`Dispatch candidate ${itemId} is missing a status.`);
    }
    const status = evaluation.status;
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

function formatQueueCandidateStateCounts(counts = {}) {
  const preferredOrder = [
    "assignable",
    "active",
    "claimed",
    "ambiguous",
    "blocked_authority",
    "blocked_owned_active",
    "blocked_stale_owner_needs_takeover",
    "closed",
  ];
  const keys = [
    ...preferredOrder.filter((key) => Object.hasOwn(counts, key)),
    ...Object.keys(counts)
      .filter((key) => !preferredOrder.includes(key))
      .sort(),
  ];
  return keys.map((key) => `${key}=${counts[key]}`).join(" ");
}

function applyDispatchNext(plan, context) {
  if (!plan.selected) {
    throw new Error("No dispatchable safe backlog lane found.");
  }
  preflightDispatchWorkspaceBase(plan.selected, context);

  const claim = applyClaimNext(plan.selected, {
    state: context.state,
    options: context.options,
    currentOwner: context.currentOwner,
    staleAfterSeconds: context.staleAfterSeconds,
  });

  if (plan.selected.mutation === "manifest_owner_claim") {
    return applyManifestDispatch(plan.selected, claim.path, context, {
      assignmentPath: null,
      workspaceAction: "claim_existing_workspace",
    });
  }

  const assignmentPathForClaim = claim.path;
  const assignment = readAssignment(assignmentPathForClaim);
  validateAssignment(assignment, assignmentPathForClaim);
  const existingManifest = dispatchManifestForAssignment(context.state, assignment);
  const manifestResult = existingManifest
    ? { path: existingManifest.path, manifest: existingManifest.manifest, workspaceAction: "resume_existing_workspace" }
    : createDispatchWorkspace(plan.selected.item, assignment, context);

  const readiness = runDispatchReadiness(manifestResult.manifest.worktree_path, context);
  const candidateStateCounts = dispatchCandidateStateCounts(context);
  const packet = dispatchHandoffPacket(
    plan.selected,
    context,
    manifestResult.manifest,
    readiness,
    manifestResult.workspaceAction,
    candidateStateCounts,
  );

  withManifestLock(context.state, manifestResult.manifest.task_id, () => {
    const manifest = readManifest(manifestResult.path);
    validateManifest(manifest, manifestResult.path);
    recordManifestDispatchHandoff(manifest, packet, context);
    writeManifest(manifestResult.path, manifest);
  });

  withAssignmentLock(context.state, assignment.assignment_id, () => {
    const freshAssignment = readAssignment(assignmentPathForClaim);
    validateAssignment(freshAssignment, assignmentPathForClaim);
    recordAssignmentDispatchHandoff(freshAssignment, packet, manifestResult.manifest, context);
    writeAssignment(assignmentPathForClaim, freshAssignment);
  });

  if (readiness.status === "failed") {
    throw new Error(`Dispatch readiness failed for ${manifestResult.manifest.task_id}.`);
  }

  return {
    path: manifestResult.path,
    assignmentPath: assignmentPathForClaim,
    manifestPath: manifestResult.path,
    packet,
  };
}

function applyManifestDispatch(selected, manifestPath, context, { assignmentPath, workspaceAction }) {
  const manifest = readManifest(manifestPath);
  validateManifest(manifest, manifestPath);
  const readiness = runDispatchReadiness(manifest.worktree_path, context);
  const packet = dispatchHandoffPacket(
    selected,
    context,
    manifest,
    readiness,
    workspaceAction,
    dispatchCandidateStateCounts(context),
  );

  withManifestLock(context.state, manifest.task_id, () => {
    const freshManifest = readManifest(manifestPath);
    validateManifest(freshManifest, manifestPath);
    recordManifestDispatchHandoff(freshManifest, packet, context);
    writeManifest(manifestPath, freshManifest);
  });

  if (readiness.status === "failed") {
    throw new Error(`Dispatch readiness failed for ${manifest.task_id}.`);
  }

  return {
    path: manifestPath,
    assignmentPath,
    manifestPath,
    packet,
  };
}

function dispatchManifestForAssignment(state, assignment) {
  if (!assignment.worktree_path) {
    return null;
  }
  const matches = readManifests(state).filter(
    ({ manifest }) =>
      manifest.status !== "closed" &&
      manifest.branch === assignment.branch &&
      manifest.worktree_path === assignment.worktree_path,
  );
  if (matches.length > 1) {
    throw new Error(`Multiple active manifests match assignment ${assignment.assignment_id}.`);
  }
  return matches[0] || null;
}

function createDispatchWorkspace(item, assignment, context) {
  const branch = String(item.branchName || assignment.branch || "");
  assertSafeBranch(branch);
  const usingDefaultBase = !context.options.base;
  const baseBranch = String(context.options.base || defaultBaseBranch);
  assertSafeBaseBranch(baseBranch);
  const taskId = String(context.options.taskId || nextDispatchTaskId(context.state, laneSlugFromBranch(branch)));
  assertSafeTaskId(taskId);
  const worktreePath = resolve(String(context.options.worktree || join(context.state.worktreesDir, taskId)));
  const manifestPath = join(context.state.tasksDir, `${taskId}.json`);
  const shouldFetch = !context.options.noFetch;

  if (existsSync(manifestPath)) {
    throw new Error(`Task manifest already exists: ${manifestPath}`);
  }
  if (existsSync(worktreePath)) {
    throw new Error(`Worktree path already exists: ${worktreePath}`);
  }
  if (branchExists(branch)) {
    throw new Error(`Branch already exists: ${branch}`);
  }
  if (remoteBranchExists(branch)) {
    throw new Error(`Remote branch already exists: origin/${branch}`);
  }
  if (shouldFetch) {
    fetchBaseBranch(baseBranch, { usingDefaultBase });
  }
  const baseRef = resolveBaseRef(baseBranch, { usingDefaultBase });

  const now = new Date().toISOString();
  const manifest = {
    schema_version: 1,
    task_id: taskId,
    title: titleFromDescription(laneSlugFromBranch(branch).replace(/-/g, " ")),
    description: `Dispatch workspace for ${item.itemId}`,
    repo_name: workspaceKey(),
    repo_root: repoRoot,
    state_root: context.state.root,
    base_branch: baseBranch,
    base_ref: baseRef,
    branch,
    worktree_path: worktreePath,
    status: "active",
    owner: context.currentOwner,
    owner_thread_id: process.env.CODEX_THREAD_ID || null,
    owner_acquired_at: now,
    owner_updated_at: now,
    mode: "pr",
    pr_url: null,
    pr_number: null,
    source_assignment_id: assignment.assignment_id,
    source_backlog_item: assignment.source_backlog_item || {
      item_id: item.itemId,
      status: item.status || null,
      recommended_slice_size: item.recommendedSliceSize || null,
      branch_name: item.branchName || null,
      start_command: item.startCommand || null,
    },
    created_at: now,
    updated_at: now,
    last_verified_at: null,
    last_verification_command: null,
    last_commit: null,
    events: [taskEvent("dispatch_workspace_created", `dispatch prepared workspace for ${item.itemId}`)],
  };

  mkdirSync(context.state.tasksDir, { recursive: true });
  mkdirSync(context.state.worktreesDir, { recursive: true });
  withManifestLock(context.state, taskId, () => {
    runChecked("git", ["worktree", "add", "-b", branch, worktreePath, baseRef], { cwd: repoRoot });
    writeManifest(manifestPath, manifest);
  });

  return {
    path: manifestPath,
    manifest,
    workspaceAction: "create_workspace",
  };
}

function nextDispatchTaskId(state, laneSlug) {
  const base = `${dateStamp()}-${laneSlug}`;
  let candidate = base;
  let suffix = 2;
  while (existsSync(join(state.tasksDir, `${candidate}.json`)) || existsSync(join(state.worktreesDir, candidate))) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function dispatchWorkspaceAction(selected) {
  if (selected.mutation === "manifest_owner_claim") {
    return "claim_existing_workspace";
  }
  if (selected.mutation === "assignment_refresh") {
    return "resume_or_prepare_workspace";
  }
  return "claim_and_create_workspace";
}

function dispatchNextCommand(selected, readinessProfile) {
  const lane = selected?.item?.itemId || "selected lane";
  if (readinessProfile === "none") {
    return `resume prepared workspace for ${lane}`;
  }
  return `resume prepared workspace for ${lane} after ${readinessProfile} readiness`;
}

function normalizeDispatchReadinessProfile(value) {
  const profile = String(value || "doctor").trim();
  if (!["doctor", "preflight", "none"].includes(profile)) {
    throw new Error("--readiness must be one of: doctor, preflight, none.");
  }
  return profile;
}

function runDispatchReadiness(worktreePath, context) {
  if (!worktreePath || !existsSync(worktreePath)) {
    return {
      profile: context.readinessProfile,
      status: "failed",
      command: null,
      exit_code: 1,
      summary: "worktree is missing",
    };
  }

  if (context.readinessProfile === "none") {
    return {
      profile: "none",
      status: "skipped",
      command: "none",
      exit_code: 0,
      summary: "readiness skipped by explicit profile",
    };
  }

  const command =
    context.readinessProfile === "preflight"
      ? [process.execPath, ["./scripts/preflight.mjs"]]
      : [process.execPath, ["./scripts/codex-workspace.mjs", "doctor", "--state-root", context.state.root]];
  const result = spawnSync(command[0], command[1], {
    cwd: worktreePath,
    encoding: "utf8",
    stdio: "pipe",
  });
  const output = [result.stdout || "", result.stderr || ""].join("\n").trim();
  const exitCode = result.status ?? 1;
  return {
    profile: context.readinessProfile,
    status: exitCode === 0 ? "passed" : "failed",
    command: [basename(command[0]), ...command[1]].join(" "),
    exit_code: exitCode,
    summary: summarizeCommandOutput(output),
  };
}

function summarizeCommandOutput(output) {
  const lines = String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(0, 12).join(" | ") || "no output";
}

function dispatchHandoffPacket(selected, context, manifest, readiness, workspaceAction, candidateStateCounts = {}) {
  return {
    schema_version: 1,
    lane: selected.item.itemId,
    owner: context.currentOwner,
    branch: manifest.branch,
    workspace_action: workspaceAction,
    worktree_path: manifest.worktree_path,
    task_id: manifest.task_id,
    readiness,
    next_command: `cd ${manifest.worktree_path}`,
    handoff: "resume this prepared worktree; no worker or provider process launched",
    stop_lines: defaultDispatchStopLines(),
    candidate_state_counts: candidateStateCounts,
    generated_at: new Date().toISOString(),
  };
}

function recordManifestDispatchHandoff(manifest, packet, context) {
  const now = packet.generated_at;
  manifest.owner = context.currentOwner;
  manifest.owner_thread_id = process.env.CODEX_THREAD_ID || null;
  manifest.owner_updated_at = now;
  manifest.updated_at = now;
  manifest.phase = "handoff";
  manifest.runner_kind = "codex-cli";
  manifest.current_command = "handoff ready";
  manifest.last_result = packet.readiness.summary;
  manifest.dispatch_handoffs = [...(Array.isArray(manifest.dispatch_handoffs) ? manifest.dispatch_handoffs : []), packet];
  appendTaskEvent(manifest, "dispatch_handoff", `${packet.lane} ${packet.workspace_action} readiness ${packet.readiness.status}`);
}

function recordAssignmentDispatchHandoff(assignment, packet, manifest, context) {
  const now = packet.generated_at;
  assignment.owner = context.currentOwner;
  assignment.owner_thread_id = process.env.CODEX_THREAD_ID || null;
  assignment.task_id = manifest.task_id;
  assignment.worktree_path = manifest.worktree_path;
  assignment.status = "active";
  assignment.phase = "handoff";
  assignment.runner_kind = "codex-cli";
  assignment.updated_at = now;
  assignment.current_command = "handoff ready";
  assignment.last_result = packet.readiness.summary;
  assignment.dispatch_handoffs = [
    ...(Array.isArray(assignment.dispatch_handoffs) ? assignment.dispatch_handoffs : []),
    packet,
  ];
  assignment.events = [
    ...(Array.isArray(assignment.events) ? assignment.events : []),
    taskEvent("dispatch_handoff", `${packet.lane} ${packet.workspace_action} readiness ${packet.readiness.status}`),
  ];
}

function defaultDispatchStopLines() {
  return [
    "no provider/model calls",
    "no paid usage",
    "no automatic worker or external process launch",
    "no automatic takeover without evidence and approval",
    "no authority-blocked work mutation",
    "no PR, merge, or cleanup mutation from dispatch-next",
  ];
}

function dispatchPacketBaseBranch(selected, context) {
  if (dispatchWorkspaceAction(selected) === "claim_and_create_workspace") {
    return String(context.options.base || defaultBaseBranch);
  }
  const taskId = String(selected.targetTaskId || "");
  if (taskId) {
    const record = readManifests(context.state).find(({ manifest }) => manifest.task_id === taskId);
    return record?.manifest?.base_branch || null;
  }
  const assignmentId = String(selected.targetAssignmentId || "");
  if (assignmentId) {
    const assignmentRecord = readAssignments(context.state).find(
      ({ assignment }) => assignment.assignment_id === assignmentId,
    );
    if (assignmentRecord) {
      const manifestRecord = dispatchManifestForAssignment(context.state, assignmentRecord.assignment);
      return manifestRecord?.manifest?.base_branch || null;
    }
  }
  return null;
}

function preflightDispatchWorkspaceBase(selected, context) {
  if (dispatchWorkspaceAction(selected) !== "claim_and_create_workspace") {
    return;
  }
  const usingDefaultBase = !context.options.base;
  const baseBranch = String(context.options.base || defaultBaseBranch);
  assertSafeBaseBranch(baseBranch);
  if (!context.options.noFetch) {
    fetchBaseBranch(baseBranch, { usingDefaultBase });
  }
  resolveBaseRef(baseBranch, { usingDefaultBase });
}

function printDispatchPacket(label, packet) {
  console.log(`${label}: dispatch-next`);
  console.log(`- owner ${packet.owner}`);
  console.log(`- selected lane ${packet.selected_lane || packet.lane || "none"}`);
  console.log(`- branch ${packet.branch || "none"}`);
  console.log(`- base branch ${packet.base_branch || "none"}`);
  console.log(`- claim action ${packet.claim_action || "none"}`);
  console.log(`- workspace action ${packet.workspace_action || "none"}`);
  console.log(`- readiness ${packet.readiness_profile || packet.readiness?.profile || "none"}`);
  console.log(`- next ${packet.next_command || "none"}`);
  console.log(`- allowed ${packet.allowed !== false}`);
  console.log(`- queue states ${formatQueueCandidateStateCounts(packet.candidate_state_counts) || "none"}`);
  if (packet.next_action_guidance) {
    console.log(`- next action guidance ${packet.next_action_guidance}`);
  }
  if (packet.blockers?.length) {
    for (const blocker of packet.blockers) {
      console.log(`- blocker ${blocker}`);
    }
  } else {
    console.log("- blockers none");
  }
}

function applyManifestOwnerClaim(selected, { state, options, currentOwner, staleAfterSeconds }) {
  const taskId = String(selected.targetTaskId || "");
  assertSafeTaskId(taskId);
  const manifestPath = join(state.tasksDir, `${taskId}.json`);

  return withManifestLock(state, taskId, () => {
    const manifest = readManifest(manifestPath);
    validateManifest(manifest, manifestPath);
    reconcileManifest(manifest);
    const manifests = readManifests(state).map(({ manifest: recordManifest }) =>
      recordManifest.task_id === manifest.task_id ? manifest : recordManifest,
    );
    const assignments = readAssignments(state).map(({ assignment }) => assignment);
    const freshEvaluation = evaluateClaimCandidate(selected.item, manifests, assignments, {
      currentOwner,
      generatedAt: new Date(),
      staleAfterSeconds,
    });
    if (!freshEvaluation.claimable || freshEvaluation.mutation !== "manifest_owner_claim") {
      throw new Error(`Claim target changed for ${selected.item.itemId}; rerun claim-next --dry-run.`);
    }

    claimLaneOwner(manifest, options);
    manifest.updated_at = new Date().toISOString();
    writeManifest(manifestPath, manifest);
    return {
      path: manifestPath,
      message: `claimed existing unowned workspace ${taskId} for ${currentOwner}`,
    };
  });
}

function applyAssignmentClaim(selected, { state, options, currentOwner, staleAfterSeconds }) {
  const assignmentId = String(selected.targetAssignmentId || selected.item.itemId || "");
  assertSafeTaskId(assignmentId);

  return withAssignmentLock(state, assignmentId, () => {
    const manifests = readManifests(state).map(({ manifest }) => manifest);
    const assignments = readAssignments(state);
    const freshEvaluation = evaluateClaimCandidate(
      selected.item,
      manifests,
      assignments.map(({ assignment }) => assignment),
      {
        currentOwner,
        generatedAt: new Date(),
        staleAfterSeconds,
      },
    );
    if (
      !freshEvaluation.claimable ||
      !["assignment_write", "assignment_refresh"].includes(freshEvaluation.mutation)
    ) {
      throw new Error(`Claim target changed for ${selected.item.itemId}; rerun claim-next --dry-run.`);
    }
    if (freshEvaluation.targetAssignmentId && freshEvaluation.targetAssignmentId !== assignmentId) {
      throw new Error(`Assignment target changed for ${selected.item.itemId}; rerun claim-next --dry-run.`);
    }

    const existing = activeAssignmentsForBranch(
      assignments.map(({ assignment }) => assignment),
      selected.item.branchName,
    )[0];
    const path = existing ? assignmentPath(state, existing.assignment_id) : assignmentPath(state, assignmentId);
    const assignment = buildLaneAssignment(selected.item, existing, options);
    writeAssignment(path, assignment);
    return {
      path,
      message: existing
        ? `refreshed existing assignment ${assignment.assignment_id} for ${currentOwner}`
        : `claimed ready lane ${selected.item.itemId} for ${currentOwner}`,
    };
  });
}

function buildLaneAssignment(item, existingAssignment, options = {}) {
  const now = new Date().toISOString();
  const currentOwner = currentLaneOwner(options);
  const isRefresh = Boolean(existingAssignment);
  const assignmentId = String(existingAssignment?.assignment_id || item.itemId);
  assertSafeTaskId(assignmentId);

  return {
    schema_version: 1,
    assignment_id: assignmentId,
    task_id: existingAssignment?.task_id || item.itemId,
    lane_slug: existingAssignment?.lane_slug || laneSlugFromBranch(item.branchName),
    branch: item.branchName,
    worktree_path: existingAssignment?.worktree_path || null,
    status: "claimed",
    owner: currentOwner,
    owner_thread_id: process.env.CODEX_THREAD_ID || null,
    assigned_at: existingAssignment?.assigned_at || now,
    updated_at: now,
    phase: existingAssignment?.phase || "claimed",
    runner_kind: existingAssignment?.runner_kind || null,
    last_heartbeat_at: existingAssignment?.last_heartbeat_at || null,
    stale_after_seconds: existingAssignment?.stale_after_seconds || null,
    current_command: existingAssignment?.current_command || null,
    last_result: existingAssignment?.last_result || null,
    heartbeat_count: Number.isInteger(existingAssignment?.heartbeat_count) ? existingAssignment.heartbeat_count : 0,
    source_backlog_item: {
      item_id: item.itemId,
      status: item.status || null,
      recommended_slice_size: item.recommendedSliceSize || null,
      branch_name: item.branchName || null,
      start_command: item.startCommand || null,
    },
    authority_profile: existingAssignment?.authority_profile || "standard-delivery",
    stop_lines: existingAssignment?.stop_lines || defaultAssignmentStopLines(),
    events: [
      ...(Array.isArray(existingAssignment?.events) ? existingAssignment.events : []),
      taskEvent(
        isRefresh ? "claim_refreshed" : "claimed",
        `${item.itemId} claimed by ${currentOwner}; metadata only, no dispatch`,
      ),
    ],
  };
}

function defaultAssignmentStopLines() {
  return [
    "no provider/model calls",
    "no paid usage",
    "no worker or process launch",
    "no automatic takeover without evidence and approval",
    "no authority-blocked work mutation",
    "no branch, PR, merge, cleanup, or implementation mutation from claim-next --apply",
  ];
}

function laneSlugFromBranch(branchName) {
  return String(branchName || "").replace(/^codex\//, "") || "unknown-lane";
}

function assignmentPath(state, assignmentId) {
  assertSafeTaskId(assignmentId);
  return join(state.assignmentsDir, `${assignmentId}.json`);
}

function normalizeHeartbeatOptions(options = {}) {
  return {
    phase: safeHeartbeatToken(options.phase || "active", "phase"),
    runnerKind: safeHeartbeatToken(options.runnerKind || "codex-cli", "runner kind"),
    currentCommand: optionalHeartbeatText(options.currentCommand),
    currentCommandProvided: options.currentCommand !== undefined && options.currentCommand !== true,
    lastResult: optionalHeartbeatText(options.lastResult),
    lastResultProvided: options.lastResult !== undefined && options.lastResult !== true,
    staleAfterSeconds: positiveInteger(options.staleAfterSeconds, 86_400),
  };
}

function safeHeartbeatToken(value, label) {
  const text = String(value || "").trim();
  if (!text || !/^[a-zA-Z0-9._/-]+$/.test(text)) {
    throw new Error(`Invalid heartbeat ${label}: ${value}`);
  }
  return text;
}

function optionalHeartbeatText(value) {
  if (value === undefined || value === true) {
    return null;
  }
  const text = String(value).trim();
  return text || null;
}

function heartbeatAssignment(state, assignmentRecord, { currentOwner, options, heartbeatOptions }) {
  const assignmentId = String(assignmentRecord.assignment.assignment_id || "");
  assertSafeTaskId(assignmentId);
  const path = assignmentRecord.path;
  return withAssignmentLock(state, assignmentId, () => {
    const assignment = readAssignment(path);
    validateAssignment(assignment, path);
    assertAssignmentOwner(assignment, options);
    updateHeartbeatFields(assignment, heartbeatOptions);
    assignment.updated_at = assignment.last_heartbeat_at;
    assignment.events = [
      ...(Array.isArray(assignment.events) ? assignment.events : []),
      taskEvent("heartbeat", `owner ${currentOwner} phase ${heartbeatOptions.phase}`),
    ];
    writeAssignment(path, assignment);
    return {
      path,
      target: assignment.assignment_id,
    };
  });
}

function heartbeatManifest(state, taskId, { currentOwner, options, heartbeatOptions }) {
  assertSafeTaskId(taskId);
  const path = join(state.tasksDir, `${taskId}.json`);
  return withManifestLock(state, taskId, () => {
    const manifest = readManifest(path);
    validateManifest(manifest, path);
    assertManifestHeartbeatOwner(manifest, options);
    updateHeartbeatFields(manifest, heartbeatOptions);
    manifest.owner_updated_at = manifest.last_heartbeat_at;
    manifest.updated_at = manifest.last_heartbeat_at;
    appendTaskEvent(manifest, "heartbeat", `owner ${currentOwner} phase ${heartbeatOptions.phase}`);
    writeManifest(path, manifest);
    return {
      path,
      target: manifest.task_id,
    };
  });
}

function updateHeartbeatFields(target, heartbeatOptions) {
  const now = new Date().toISOString();
  target.last_heartbeat_at = now;
  target.stale_after_seconds = heartbeatOptions.staleAfterSeconds;
  target.phase = heartbeatOptions.phase;
  target.runner_kind = heartbeatOptions.runnerKind;
  if (heartbeatOptions.currentCommandProvided) {
    target.current_command = heartbeatOptions.currentCommand;
  }
  if (heartbeatOptions.lastResultProvided) {
    target.last_result = heartbeatOptions.lastResult;
  }
  target.heartbeat_count = Number.isInteger(target.heartbeat_count) ? target.heartbeat_count + 1 : 1;
}

function assertAssignmentOwner(assignment, options = {}) {
  const currentOwner = currentLaneOwner(options);
  if (!assignment.owner) {
    throw new Error(`${assignment.assignment_id} has no assignment owner; claim it before heartbeat.`);
  }
  if (assignment.owner !== currentOwner) {
    throw new Error(
      `${assignment.assignment_id} is assigned to ${assignment.owner}; current runner is ${currentOwner}. Heartbeat is owner-only.`,
    );
  }
}

function assertManifestHeartbeatOwner(manifest, options = {}) {
  const currentOwner = currentLaneOwner(options);
  if (!manifest.owner) {
    throw new Error(`${manifest.task_id} has no workspace owner; claim it before heartbeat.`);
  }
  if (manifest.owner !== currentOwner) {
    throw new Error(
      `${manifest.task_id} is owned by ${manifest.owner}; current runner is ${currentOwner}. Heartbeat is owner-only.`,
    );
  }
}

function resolveTakeoverTarget(state, query) {
  const assignmentRecord = findAssignment(state, query);
  if (assignmentRecord) {
    return {
      kind: "assignment",
      path: assignmentRecord.path,
      record: assignmentRecord.assignment,
    };
  }

  const manifestRecord = findManifest(state, query, { preferCurrentWorktree: true });
  return {
    kind: "workspace",
    path: manifestRecord.path,
    record: manifestRecord.manifest,
  };
}

function takeoverPacket(target, context) {
  const record = target.record;
  const previousOwner = record.owner || "";
  const stale = takeoverHeartbeatEvidence(record, context);
  const worktree = takeoverWorktreeEvidence(target);
  const branch = takeoverBranchEvidence(record);
  const pr = takeoverPrEvidence(record);
  const dirty = takeoverDirtyStateEvidence(worktree);
  const blockers = takeoverBlockers(target, context, {
    stale,
    worktree,
    dirty,
  });

  return {
    schema_version: 1,
    target_kind: target.kind,
    target_id: target.kind === "assignment" ? record.assignment_id : record.task_id,
    previous_owner: previousOwner || "unowned",
    requesting_owner: context.currentOwner,
    reason: context.reason,
    heartbeat_evidence: stale,
    worktree_evidence: worktree,
    branch_evidence: branch,
    pr_evidence: pr,
    dirty_state_evidence: dirty,
    approval_evidence: context.approval || null,
    decision: blockers.length === 0 ? "approved_for_apply" : "blocked",
    allowed: blockers.length === 0,
    blockers,
    generated_at: context.generatedAt.toISOString(),
  };
}

function buildTakeoverSummary(packet) {
  return {
    schemaVersion: packet.schema_version,
    targetKind: packet.target_kind,
    targetId: packet.target_id,
    previousOwner: packet.previous_owner,
    requestingOwner: packet.requesting_owner,
    decision: packet.decision,
    allowed: packet.allowed,
    reason: packet.reason,
    generatedAt: packet.generated_at,
    heartbeat: {
      source: packet.heartbeat_evidence.source,
      timestamp: packet.heartbeat_evidence.timestamp,
      ageSeconds: packet.heartbeat_evidence.age_seconds,
      staleAfterSeconds: packet.heartbeat_evidence.stale_after_seconds,
      isStale: packet.heartbeat_evidence.is_stale,
    },
    worktree: {
      path: packet.worktree_evidence.path,
      exists: packet.worktree_evidence.exists,
      required: packet.worktree_evidence.required,
      status: packet.worktree_evidence.status,
    },
    branch: {
      branch: packet.branch_evidence.branch,
      status: packet.branch_evidence.status,
      localSha: packet.branch_evidence.local_sha,
      remoteSha: packet.branch_evidence.remote_sha,
    },
    pr: packet.pr_evidence,
    dirtyState: {
      status: packet.dirty_state_evidence.status,
      dirty: packet.dirty_state_evidence.dirty,
      dirtyLineCount: packet.dirty_state_evidence.lines?.length || 0,
    },
    approval: {
      present: Boolean(packet.approval_evidence),
    },
    blockers: packet.blockers,
    mutation: "none; dry-run summary only",
  };
}

function takeoverHeartbeatEvidence(record, context) {
  const source = record.last_heartbeat_at
    ? "last_heartbeat_at"
    : record.owner_updated_at
      ? "owner_updated_at"
      : record.updated_at
        ? "updated_at"
        : record.assigned_at
          ? "assigned_at"
          : "created_at";
  const value = record[source] || "";
  const timestamp = Date.parse(value);
  const ageSeconds = Number.isFinite(timestamp)
    ? Math.max(0, Math.floor((context.generatedAt.getTime() - timestamp) / 1000))
    : null;
  return {
    source,
    timestamp: value || null,
    age_seconds: ageSeconds,
    stale_after_seconds: context.staleAfterSeconds,
    is_stale: ageSeconds === null ? true : ageSeconds > context.staleAfterSeconds,
  };
}

function takeoverWorktreeEvidence(target) {
  const worktreePath = target.record.worktree_path || null;
  if (!worktreePath) {
    return {
      path: null,
      exists: target.kind === "assignment",
      required: target.kind === "workspace",
      status: target.kind === "assignment" ? "not_applicable" : "missing",
    };
  }
  if (!existsSync(worktreePath)) {
    return {
      path: worktreePath,
      exists: false,
      required: true,
      status: "missing",
    };
  }
  const status = parseStatus(worktreePath);
  return {
    path: worktreePath,
    exists: true,
    required: true,
    status: status.any ? "dirty" : "clean",
    dirty_lines: status.lines,
  };
}

function takeoverBranchEvidence(record) {
  const branch = record.branch || null;
  if (!branch) {
    return {
      branch: null,
      local_sha: null,
      remote_sha: null,
      status: "missing",
    };
  }
  return {
    branch,
    local_sha: branchSha(branch) || null,
    remote_sha: remoteBranchExists(branch) ? originBranchSha(branch) : null,
    status: "inspected",
  };
}

function takeoverPrEvidence(record) {
  return {
    pr_url: record.pr_url || null,
    pr_number: record.pr_number || null,
    status: record.pr_url || record.pr_number ? "present_unverified" : "none",
  };
}

function takeoverDirtyStateEvidence(worktreeEvidence) {
  if (!worktreeEvidence.required) {
    return {
      status: "not_applicable",
      dirty: false,
    };
  }
  return {
    status: worktreeEvidence.status,
    dirty: worktreeEvidence.status === "dirty",
    lines: worktreeEvidence.dirty_lines || [],
  };
}

function takeoverBlockers(target, context, evidence) {
  const blockers = [];
  const record = target.record;
  if (!record.owner) {
    blockers.push("target has no current owner; use claim flow instead");
  }
  if (record.owner === context.currentOwner) {
    blockers.push("target is already owned by current runner");
  }
  if (!evidence.stale.is_stale) {
    blockers.push("owner heartbeat is not stale");
  }
  if (target.kind === "workspace" && !evidence.worktree.exists) {
    blockers.push("workspace worktree is missing");
  }
  if (target.kind === "assignment" && evidence.worktree.required && !evidence.worktree.exists) {
    blockers.push("assignment worktree is missing");
  }
  if (evidence.dirty.dirty) {
    blockers.push("workspace worktree is dirty");
  }
  if (!validTakeoverReason(context.reason)) {
    blockers.push("takeover reason is missing or too short");
  }
  if (context.approval !== undefined && context.approval !== "" && !validTakeoverReason(context.approval)) {
    blockers.push("approval evidence is too short");
  }
  if (!context.approval) {
    blockers.push("explicit operator approval evidence is required for apply");
  }
  return blockers;
}

function applyTakeover(state, target, { currentOwner, options, staleAfterSeconds }) {
  if (target.kind === "assignment") {
    const assignmentId = String(target.record.assignment_id || "");
    return withAssignmentLock(state, assignmentId, () => {
      const path = target.path;
      const assignment = readAssignment(path);
      validateAssignment(assignment, path);
      const packet = takeoverPacket(
        {
          kind: "assignment",
          path,
          record: assignment,
        },
        {
          currentOwner,
          generatedAt: new Date(),
          staleAfterSeconds,
          reason: String(options.takeoverReason || "").trim(),
          approval: String(options.approval || "").trim(),
        },
      );
      if (!packet.allowed) {
        throw new Error(`Takeover blocked for ${packet.target_id}: ${packet.blockers.join("; ")}`);
      }
      applyAssignmentTakeover(assignment, packet);
      writeAssignment(path, assignment);
      return { path, packet };
    });
  }

  const taskId = String(target.record.task_id || "");
  return withManifestLock(state, taskId, () => {
    const path = target.path;
    const manifest = readManifest(path);
    validateManifest(manifest, path);
    const packet = takeoverPacket(
      {
        kind: "workspace",
        path,
        record: manifest,
      },
      {
        currentOwner,
        generatedAt: new Date(),
        staleAfterSeconds,
        reason: String(options.takeoverReason || "").trim(),
        approval: String(options.approval || "").trim(),
      },
    );
    if (!packet.allowed) {
      throw new Error(`Takeover blocked for ${packet.target_id}: ${packet.blockers.join("; ")}`);
    }
    applyManifestTakeover(manifest, packet);
    writeManifest(path, manifest);
    return { path, packet };
  });
}

function applyAssignmentTakeover(assignment, packet) {
  const now = new Date().toISOString();
  assignment.owner = packet.requesting_owner;
  assignment.owner_thread_id = process.env.CODEX_THREAD_ID || null;
  assignment.owner_acquired_at = now;
  assignment.updated_at = now;
  assignment.status = assignment.status === "closed" ? "closed" : "claimed";
  assignment.phase = "claimed";
  if (!Array.isArray(assignment.takeover_decisions)) {
    assignment.takeover_decisions = [];
  }
  assignment.takeover_decisions.push({ ...packet, decision: "applied", applied_at: now });
  assignment.events = [
    ...(Array.isArray(assignment.events) ? assignment.events : []),
    taskEvent("takeover_applied", `owner ${packet.previous_owner} -> ${packet.requesting_owner}: ${packet.reason}`),
  ];
}

function applyManifestTakeover(manifest, packet) {
  const now = new Date().toISOString();
  manifest.owner = packet.requesting_owner;
  manifest.owner_thread_id = process.env.CODEX_THREAD_ID || null;
  manifest.owner_acquired_at = now;
  manifest.owner_updated_at = now;
  manifest.updated_at = now;
  if (!Array.isArray(manifest.takeover_decisions)) {
    manifest.takeover_decisions = [];
  }
  manifest.takeover_decisions.push({ ...packet, decision: "applied", applied_at: now });
  if (!Array.isArray(manifest.ownership_takeovers)) {
    manifest.ownership_takeovers = [];
  }
  manifest.ownership_takeovers.push({
    at: now,
    previous_owner: packet.previous_owner,
    new_owner: packet.requesting_owner,
    reason: packet.reason,
    approval_evidence: packet.approval_evidence,
  });
  appendTaskEvent(manifest, "takeover_applied", `owner ${packet.previous_owner} -> ${packet.requesting_owner}: ${packet.reason}`);
}

function printTakeoverPacket(label, packet) {
  console.log(`${label}: takeover`);
  console.log(`- target ${packet.target_kind} ${packet.target_id}`);
  console.log(`- previous owner ${packet.previous_owner}`);
  console.log(`- requesting owner ${packet.requesting_owner}`);
  console.log(`- decision ${packet.decision}`);
  console.log(`- heartbeat stale ${packet.heartbeat_evidence.is_stale}`);
  console.log(`- heartbeat age ${packet.heartbeat_evidence.age_seconds ?? "unknown"} seconds`);
  console.log(`- worktree ${packet.worktree_evidence.status}`);
  console.log(`- branch ${packet.branch_evidence.branch || "none"}`);
  console.log(`- pr ${packet.pr_evidence.status}`);
  console.log(`- approval ${packet.approval_evidence ? "present" : "missing"}`);
  if (packet.blockers.length === 0) {
    console.log("- blockers none");
  } else {
    for (const blocker of packet.blockers) {
      console.log(`- blocker ${blocker}`);
    }
  }
}

function claimBranchNameBlocker(branchName) {
  try {
    assertSafeBranch(branchName);
  } catch (error) {
    return error.message;
  }
  return "";
}

function claimBranchAvailabilityBlocker(branchName) {
  const ignoreFixtureBranches = process.env.CODEX_WORKSPACE_TEST_IGNORE_SAFE_BACKLOG_LOCAL_BRANCHES === "1";
  if (!ignoreFixtureBranches && branchExists(branchName)) {
    return `local branch already exists: ${branchName}`;
  }
  if (!ignoreFixtureBranches && remoteBranchExists(branchName)) {
    return `remote branch already exists: origin/${branchName}`;
  }
  return "";
}

function workspaceBranchStates(manifests) {
  const states = new Map();
  for (const manifest of manifests) {
    if (!manifest.branch) {
      continue;
    }
    const existing = states.get(manifest.branch);
    if (existing === "active") {
      continue;
    }
    states.set(manifest.branch, manifest.status === "closed" ? "closed" : "active");
  }
  return states;
}

function readSafeBacklogItems() {
  const servicePath = join(repoRoot, "services", "supervisor", "src", "supervisor", "application", "service.py");
  if (!existsSync(servicePath)) {
    return [];
  }

  const source = readFileSync(servicePath, "utf8");
  const reportMatch = source.match(/def get_safe_development_backlog_report[\s\S]*?return SafeDevelopmentBacklogReportView/);
  if (!reportMatch) {
    return [];
  }

  const nextLanes = readSafeBacklogNextLanes(source);
  return reportMatch[0]
    .split("SafeDevelopmentBacklogItemView(")
    .slice(1)
    .map((block) => {
      const item = {
        itemId: pythonStringField(block, "itemId"),
        status: pythonStringField(block, "status"),
        recommendedSliceSize: pythonStringField(block, "recommendedSliceSize"),
        branchName: "",
        startCommand: "",
      };
      const nextLaneVariable = pythonIdentifierField(block, "nextLane");
      const nextLane = nextLanes.get(nextLaneVariable);
      if (nextLane) {
        item.branchName = nextLane.branchName;
        item.startCommand = nextLane.startCommand;
      }
      return item;
    })
    .filter((item) => item.itemId);
}

function readSafeBacklogNextLanes(source) {
  const nextLanes = new Map();
  const reportMatch = source.match(/def get_safe_development_backlog_report[\s\S]*?return SafeDevelopmentBacklogReportView/);
  const reportSource = reportMatch?.[0] || "";
  const laneAssignmentPattern =
    /(\w+)\s*=\s*self\._safe_backlog_next_lane\(\s*lane_slug="([^"]+)"[\s\S]*?\n\s*\)/g;

  for (const match of reportSource.matchAll(laneAssignmentPattern)) {
    const variableName = match[1];
    const laneSlug = match[2];
    nextLanes.set(variableName, {
      branchName: `codex/${laneSlug}`,
      startCommand: `node ./scripts/codex-workspace.mjs start "${laneSlug.replace(/-/g, " ")}"`,
    });
  }

  const legacyMatch = source.match(
    /def _report_evidence_navigation_next_lane[\s\S]*?return NextLaneRecommendationView\(([\s\S]*?)\n\s*\)/,
  );
  if (legacyMatch) {
    const functionSource = legacyMatch[0] || "";
    const block = legacyMatch[1] || "";
    const laneSlug = pythonStringField(functionSource, "lane_slug");
    nextLanes.set("report_navigation_lane", {
      branchName: pythonStringField(block, "branchName"),
      startCommand: interpolatePythonTemplate(pythonStringField(block, "startCommand"), { lane_slug: laneSlug }),
    });
  }

  return nextLanes;
}

function pythonStringField(source, fieldName) {
  const match = source.match(new RegExp(`${fieldName}\\s*=\\s*[fF]?(['"])([\\s\\S]*?)\\1`));
  return match?.[2] || "";
}

function pythonIdentifierField(source, fieldName) {
  const match = source.match(new RegExp(`${fieldName}\\s*=\\s*([A-Za-z_][A-Za-z0-9_]*)`));
  return match?.[1] || "";
}

function interpolatePythonTemplate(value, variables) {
  return String(value || "")
    .replace(/\{lane_slug\.replace\("-", " "\)\}/g, String(variables.lane_slug || "").replace(/-/g, " "))
    .replace(/\{lane_slug\}/g, String(variables.lane_slug || ""));
}

function positiveInteger(value, fallback) {
  if (value === undefined || value === true || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected positive integer but received: ${value}`);
  }
  return parsed;
}

function claimLaneOwner(manifest, options = {}) {
  const currentOwner = currentLaneOwner(options);
  if (manifest.owner === currentOwner) {
    manifest.owner_updated_at = new Date().toISOString();
    return;
  }

  if (manifest.owner && !options.takeOwnership) {
    return;
  }

  const previousOwner = manifest.owner || "unowned";
  const reason = String(options.takeoverReason || "").trim();
  manifest.owner = currentOwner;
  manifest.owner_thread_id = process.env.CODEX_THREAD_ID || null;
  manifest.owner_acquired_at = new Date().toISOString();
  manifest.owner_updated_at = manifest.owner_acquired_at;
  if (!manifest.ownership_takeovers) {
    manifest.ownership_takeovers = [];
  }
  manifest.ownership_takeovers.push({
    at: manifest.owner_acquired_at,
    previous_owner: previousOwner,
    new_owner: currentOwner,
    reason: reason || "unowned legacy lane claimed",
  });
  appendTaskEvent(
    manifest,
    "ownership_claimed",
    `owner ${previousOwner} -> ${currentOwner}${reason ? `: ${reason}` : ""}`,
  );
}

function reconcileManifest(manifest, options = {}) {
  if (!manifest.events) {
    manifest.events = [];
  }

  if (!options.refreshPr) {
    return manifest;
  }

  const pr = manifest.pr_url || manifest.pr_number ? prView(manifest) : prView({ ...manifest, pr_number: null });
  if (pr) {
    manifest.pr_url = pr.url || manifest.pr_url;
    manifest.pr_number = pr.number || manifest.pr_number;
    if (pr.mergedAt) {
      manifest.status = manifest.status === "closed" ? "closed" : "merged";
      manifest.merged_at = pr.mergedAt;
    } else if (pr.state === "OPEN") {
      manifest.status = "pr_open";
    }
  }

  return manifest;
}

function parseStatus(cwd) {
  const result = git(["status", "--porcelain"], { cwd });
  if (result.code !== 0) {
    throw new Error(result.stderr || "Could not inspect worktree status.");
  }

  const lines = result.stdout ? result.stdout.split(/\r?\n/).filter(Boolean) : [];
  const staged = lines.some((line) => line[0] !== " " && line[0] !== "?");
  const unstaged = lines.some((line) => line[1] !== " " || line.startsWith("??"));
  return {
    any: lines.length > 0,
    staged,
    unstaged,
    lines,
  };
}

function reconcileExistingTaskCommit(manifest, worktreeStatus) {
  if (manifest.last_commit || worktreeStatus.any) {
    return null;
  }

  const baseRef = String(manifest.base_ref || manifest.base_branch || "").trim();
  if (!baseRef) {
    return null;
  }

  const base = git(["rev-parse", "--verify", "--quiet", baseRef], { cwd: manifest.worktree_path });
  if (base.code !== 0 || !base.stdout.trim()) {
    return null;
  }

  const ahead = git(["rev-list", "--count", `${baseRef}..HEAD`], { cwd: manifest.worktree_path });
  const commitsAhead = Number.parseInt(ahead.stdout.trim(), 10);
  if (ahead.code !== 0 || !Number.isFinite(commitsAhead) || commitsAhead <= 0) {
    return null;
  }

  const shortHead = git(["rev-parse", "--short", "HEAD"], { cwd: manifest.worktree_path });
  if (shortHead.code !== 0 || !shortHead.stdout.trim()) {
    return null;
  }

  const short = shortHead.stdout.trim();
  manifest.last_commit = short;
  return { short, baseRef, commitsAhead };
}

function localCodexBranches() {
  const result = git(["for-each-ref", "--format=%(refname:short)", "refs/heads/codex"], { cwd: repoRoot });
  if (result.code !== 0 || !result.stdout) {
    return [];
  }
  return result.stdout.split(/\r?\n/).filter(Boolean).sort();
}

function branchCleanupSafety(branch, baseRef) {
  const merged = git(["merge-base", "--is-ancestor", branch, baseRef], { cwd: repoRoot });
  if (merged.code === 0) {
    return { safe: true, reason: `merged into ${baseRef}` };
  }

  const cherry = git(["cherry", baseRef, branch], { cwd: repoRoot });
  if (cherry.code !== 0) {
    return { safe: false, reason: cherry.stderr || `could not compare with ${baseRef}` };
  }

  const lines = cherry.stdout.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) {
    return { safe: true, reason: `no commits beyond ${baseRef}` };
  }

  const unapplied = lines.filter((line) => line.startsWith("+"));
  if (unapplied.length > 0) {
    return { safe: false, reason: `${unapplied.length} commit(s) not present in ${baseRef}` };
  }

  return { safe: true, reason: `patch-equivalent to ${baseRef}` };
}

function withManifestLock(state, taskId, fn) {
  mkdirSync(state.tasksDir, { recursive: true });
  const lockPath = join(state.tasksDir, `${taskId}.lock`);
  let fd;
  try {
    fd = openSync(lockPath, "wx");
  } catch (error) {
    if (error?.code !== "EEXIST") {
      throw error;
    }
    throw new Error(`Task is locked by another session: ${lockPath}`);
  }

  try {
    return fn();
  } finally {
    closeSync(fd);
    rmSync(lockPath, { force: true });
  }
}

function withAssignmentLock(state, assignmentId, fn) {
  assertSafeTaskId(assignmentId);
  mkdirSync(state.assignmentsDir, { recursive: true });
  const lockPath = join(state.assignmentsDir, `${assignmentId}.lock`);
  let fd;
  try {
    fd = openSync(lockPath, "wx");
  } catch (error) {
    if (error?.code !== "EEXIST") {
      throw error;
    }
    throw new Error(`Assignment is locked by another session: ${lockPath}`);
  }

  try {
    return fn();
  } finally {
    closeSync(fd);
    rmSync(lockPath, { force: true });
  }
}

function taskEvent(type, message) {
  return {
    at: new Date().toISOString(),
    type,
    message,
  };
}

function appendTaskEvent(manifest, type, message) {
  if (!manifest.events) {
    manifest.events = [];
  }
  manifest.events.push(taskEvent(type, message));
}

function removeWorktree(worktreePath, state, options = {}) {
  const cwd = options.cwd || repoRoot;
  assertManagedWorktreePath(worktreePath, state);
  cleanupGeneratedArtifacts(worktreePath);
  const result = git(["worktree", "remove", worktreePath], { cwd });
  if (result.code === 0) {
    if (existsSync(worktreePath)) {
      removeManagedDirectory(worktreePath, state);
    }
    return true;
  }

  if (worktreeListed(worktreePath, cwd)) {
    throw new Error(result.stderr || result.stdout || `Could not remove worktree: ${worktreePath}`);
  }

  removeManagedDirectory(worktreePath, state);
  return true;
}

function removeManagedDirectory(worktreePath, state) {
  assertManagedWorktreePath(worktreePath, state);
  cleanupGeneratedArtifacts(worktreePath);
  rmSync(worktreePath, { recursive: true, force: true });
  if (existsSync(worktreePath)) {
    throw new Error(`Worktree path still exists after cleanup: ${worktreePath}`);
  }
}

function cleanupGeneratedArtifacts(worktreePath) {
  if (!existsSync(worktreePath)) {
    return;
  }
  for (const artifact of generatedCleanupArtifacts()) {
    const artifactPath = join(worktreePath, artifact);
    if (existsSync(artifactPath)) {
      try {
        rmSync(artifactPath, { recursive: true, force: true });
      } catch {
        throw new Error(`Could not remove generated cleanup artifact: ${artifactPath}`);
      }
    }
  }
}

function generatedCleanupArtifacts() {
  return [
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    "services/supervisor/.pytest_cache",
    "services/supervisor/.mypy_cache",
    "services/supervisor/.ruff_cache",
    "services/supervisor/.venv",
  ];
}

function assertManagedWorktreePath(worktreePath, state) {
  const target = resolve(worktreePath);
  const managedRoot = resolve(state.worktreesDir);
  const rel = relative(managedRoot, target);
  if (!rel || rel.startsWith("..") || resolve(managedRoot, rel) !== target) {
    throw new Error(`Refusing to remove unmanaged worktree path: ${worktreePath}`);
  }
}

function worktreeListed(worktreePath, cwd = repoRoot) {
  const result = git(["worktree", "list", "--porcelain"], { cwd });
  if (result.code !== 0) {
    return true;
  }
  return parseWorktreePorcelain(result.stdout).some((record) => samePath(record.path, worktreePath));
}

function prunableGitWorktrees(cwd = repoRoot) {
  const result = git(["worktree", "list", "--porcelain"], { cwd });
  if (result.code !== 0) {
    return [];
  }
  return parseWorktreePorcelain(result.stdout)
    .filter((record) => record.prunable)
    .map((record) => record.path);
}

function parseWorktreePorcelain(value) {
  const records = [];
  let current = null;
  for (const line of String(value || "").split(/\r?\n/)) {
    if (!line.trim()) {
      if (current) {
        records.push(current);
      }
      current = null;
      continue;
    }
    const [key, ...rest] = line.split(" ");
    const data = rest.join(" ");
    if (key === "worktree") {
      current = { path: data };
    } else if (current && key === "HEAD") {
      current.head = data;
    } else if (current && key === "branch") {
      current.branch = data;
    } else if (current && key === "prunable") {
      current.prunable = true;
    }
  }
  if (current) {
    records.push(current);
  }
  return records;
}

function mainWorktreePath() {
  const result = git(["worktree", "list", "--porcelain"], { cwd: repoRoot });
  if (result.code !== 0) {
    return repoRoot;
  }
  const first = parseWorktreePorcelain(result.stdout)[0];
  return first?.path || repoRoot;
}

function assertWorktreeExists(manifest) {
  if (!existsSync(manifest.worktree_path) || !statSync(manifest.worktree_path).isDirectory()) {
    throw new Error(`Worktree path is missing: ${manifest.worktree_path}`);
  }
}

function prView(manifest) {
  const selector = manifest.pr_number ? String(manifest.pr_number) : manifest.branch;
  const result = run("gh", ["pr", "view", selector, "--json", "number,url,mergedAt,state,baseRefName,headRefOid"], {
    cwd: manifest.worktree_path && existsSync(manifest.worktree_path) ? manifest.worktree_path : repoRoot,
  });
  if (result.code !== 0) {
    return null;
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`GitHub CLI returned invalid JSON for PR selector ${selector}.`);
  }
}

function prNumberFromUrl(url) {
  const match = String(url || "").match(/\/pull\/(\d+)/);
  return match ? Number(match[1]) : null;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "") || "task";
}

function titleFromDescription(value) {
  const trimmed = String(value).trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function printManifestSummary(manifest) {
  console.log(`Task: ${manifest.task_id}`);
  console.log(`Owner: ${manifest.owner || "unowned"}`);
  console.log(`Branch: ${manifest.branch}`);
  console.log(`Base branch: ${manifest.base_branch}`);
  console.log(`Base ref: ${manifest.base_ref}`);
  console.log(`Worktree: ${manifest.worktree_path}`);
  console.log(`Manifest: ${join(manifest.state_root, "tasks", `${manifest.task_id}.json`)}`);
}

function printPlan(name, lines) {
  console.log(`DRY RUN: ${name}`);
  for (const line of lines) {
    console.log(`- ${line}`);
  }
}

function printApplied(name, lines) {
  console.log(`APPLY: ${name}`);
  for (const line of lines) {
    console.log(`- ${line}`);
  }
}

function printBlocked(name, lines) {
  console.log(`BLOCKED: ${name}`);
  for (const line of lines) {
    console.log(`- ${line}`);
  }
}

function printClaimBlockers(evaluations, selected) {
  for (const evaluation of evaluations) {
    if (evaluation === selected) {
      continue;
    }
    console.log(
      [
        `- ${evaluation.item.itemId}`,
        evaluation.status,
        `source_status=${evaluation.item.status || "unknown"}`,
        `branch=${evaluation.item.branchName || "none"}`,
        `reason=${evaluation.reason}`,
        `next=${evaluation.nextAction}`,
      ].join(" | "),
    );
  }
}

function collectCommand(findings, commandName, commandArguments, options = {}) {
  const result = run(commandName, commandArguments, { cwd: repoRoot });
  addFinding(
    findings,
    result.code === 0,
    result.code === 0 ? `${commandName}: ${result.stdout.split(/\r?\n/)[0]}` : `${commandName} unavailable.`,
    `${commandName} unavailable.`,
    options.optional,
  );
}

function addFinding(findings, ok, okMessage, failMessage = okMessage, optional = false) {
  findings.push({ ok, optional, message: ok ? okMessage : failMessage });
}

function git(commandArguments, options = {}) {
  return run("git", commandArguments, options);
}

function runChecked(commandName, commandArguments, options = {}) {
  const result = run(commandName, commandArguments, options);
  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || `${commandName} failed`);
  }
  return result;
}

function runShellChecked(commandText, options = {}) {
  const result = spawnSync(commandText, {
    cwd: options.cwd || repoRoot,
    encoding: "utf8",
    shell: true,
    stdio: "pipe",
  });
  if ((result.status ?? 1) !== 0) {
    throw new Error((result.stderr || result.stdout || commandText).trim());
  }
  return {
    code: result.status ?? 1,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

function run(commandName, commandArguments, options = {}) {
  const resolved = resolveWorkspaceCommand(commandName, commandArguments);
  const result = spawnSync(resolved.command, resolved.args, {
    cwd: options.cwd || repoRoot,
    encoding: "utf8",
    env: resolved.env ?? process.env,
    stdio: "pipe",
    timeout: options.timeout || 120_000,
  });

  return {
    code: result.status ?? 1,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || result.error?.message || "").trim(),
  };
}

function samePath(left, right) {
  return resolve(left) === resolve(right);
}
