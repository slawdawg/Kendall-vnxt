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
import { resolveWorkspaceCommand } from "./lib/workspace-command-resolution.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const defaultBaseBranch = "main";
const protectedBranches = new Set(["main", "master"]);
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
    case "assignment-report":
      assignmentReport(commandArgs);
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
  assignment-report         Show read-only runner assignment inventory and blockers.
  resume <query>            Print the matching task worktree and branch.
  finish-pr [query]         Commit, push, and create/view a PR for a task.
  cleanup-merged [query]    Remove clean worktrees whose PRs are merged.
  cleanup-current           Remove the current clean worktree after its PR is merged.
  cleanup-orphans [query]   Remove orphan directories no longer registered as Git worktrees.
  cleanup-branches [query]  Remove safe local codex/* branches already present in the base ref by ancestry or patch-id.
  rebuild-index             Rebuild missing manifests from Git worktrees.
  doctor                    Check local workspace protocol readiness.

Common options:
  --dry-run                 Print the planned mutation without applying it.
  --state-root <path>       Override the Codex workspace state root.
  --owner <id>              Override the lane owner recorded or checked for this command.
  --take-ownership          Reassign a lane to the current owner before mutating it.
  --takeover-reason <text>  Required with --take-ownership when another owner is recorded.

start options:
  --base <branch>           Base branch. Defaults to main.
  --branch <branch>         Override generated branch name.
  --mode <pr|experiment>    Task mode. Defaults to pr.
  --no-fetch                Do not fetch origin before creating the branch.
  --task-id <id>            Override generated task id.
  --worktree <path>         Override generated worktree path.

list options:
  --active                  Show only non-closed workspaces.
  --owned                   Show only workspaces owned by the current runner.
  --owner <id>              Show only workspaces owned by the given owner.

assignment-report options:
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

cleanup-current options:
  --apply                   Apply cleanup. Without this, cleanup is dry-run.
  --delete-remote           Delete remote branch after merged cleanup.

cleanup-branches options:
  --apply                   Apply cleanup. Without this, cleanup is dry-run.
  --base <ref>              Ref to compare against. Defaults to origin/main.
                            Missing base refs fail closed; no fetch is performed.
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

  const baseBranch = String(options.base || defaultBaseBranch);
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
    runChecked("git", ["fetch", "origin", baseBranch], { cwd: repoRoot });
  }
  const baseRef = resolveBaseRef(baseBranch);

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

function assignmentReport(argv) {
  const { options } = parseOptions(argv);
  const state = workspaceState(options);
  const currentOwner = currentLaneOwner(options);
  const staleAfterSeconds = positiveInteger(options.staleAfterSeconds, 86_400);
  const generatedAt = new Date();
  const manifests = readManifests(state).map(({ manifest }) => manifest);
  const backlogItems = readSafeBacklogItems();
  const manifestBranchStates = workspaceBranchStates(manifests);

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
      const classification = classifyBacklogItem(item, manifestBranchStates);
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
  console.log("Workspace assignments:");
  if (manifests.length === 0) {
    console.log(`- none (no workspace manifests under ${state.tasksDir})`);
    return;
  }

  for (const manifest of manifests) {
    const classification = classifyWorkspaceAssignment(manifest, {
      currentOwner,
      generatedAt,
      staleAfterSeconds,
    });
    console.log(
      [
        `- ${manifest.task_id}`,
        classification.status,
        `manifest_status=${manifest.status}`,
        `owner=${manifest.owner || "unowned"}`,
        `branch=${manifest.branch}`,
        `worktree=${manifest.worktree_path}`,
        `reason=${classification.reason}`,
        `next=${classification.nextAction}`,
      ].join(" | "),
    );
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
  console.log(`PR: ${manifest.pr_url}`);
}

function cleanupMerged(argv, mode = {}) {
  const { positional, options } = parseOptions(argv);
  const state = workspaceState(options);
  const records = mode.currentOnly
    ? [findManifest(state, positional.join(" "), { preferCurrentWorktree: true })]
    : positional.length > 0
      ? [findManifest(state, positional.join(" "))]
      : readManifests(state);
  const deleteRemote = Boolean(options.deleteRemote);
  const apply = Boolean(options.apply);

  requireGh("cleanup-merged");

  for (const record of records) {
    const { manifest, path: manifestPath } = record;
    if (manifest.status === "closed") {
      continue;
    }
    assertLaneOwner(manifest, options);
    reconcileManifest(manifest, { refreshPr: true });

    const pr = prView(manifest);
    if (!pr || !pr.mergedAt) {
      console.log(`SKIP ${manifest.task_id}: PR is not merged.`);
      continue;
    }
    if (pr.baseRefName && pr.baseRefName !== manifest.base_branch) {
      console.log(`SKIP ${manifest.task_id}: PR base is ${pr.baseRefName}, expected ${manifest.base_branch}.`);
      continue;
    }

    const cleanupCwd = cleanupRepositoryRoot(manifest.worktree_path);
    const worktreeStatus = worktreeCleanupStatus(manifest, cleanupCwd);
    if (worktreeStatus.dirty) {
      console.log(`SKIP ${manifest.task_id}: worktree is not clean.`);
      continue;
    }

    const plan = cleanupMergedPlan(manifest, pr, { cleanupCwd, deleteRemote });

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
  return String(manifest.pr_delivery_head_sha || pr?.headRefOid || "").trim();
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
  const baseRef = String(options.base || `origin/${defaultBaseBranch}`);

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
      base_branch: defaultBaseBranch,
      base_ref: defaultBaseBranch,
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

function workspaceState(options = {}) {
  const configuredRoot =
    options.stateRoot ||
    process.env.CODEX_WORKSPACE_ROOT ||
    join(process.env.USERPROFILE || process.env.HOME || dirname(repoRoot), ".codex-workspaces", workspaceKey());
  const root = resolve(String(configuredRoot));
  return {
    root,
    tasksDir: join(root, "tasks"),
    worktreesDir: join(root, "worktrees"),
  };
}

function readManifests(state) {
  if (!existsSync(state.tasksDir)) {
    return [];
  }

  return readdirSync(state.tasksDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const path = join(state.tasksDir, name);
      try {
        const manifest = readManifest(path);
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

function readManifest(path) {
  return JSON.parse(readFileSync(path, "utf8"));
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

function resolveBaseRef(baseBranch) {
  const originRef = `origin/${baseBranch}`;
  if (git(["rev-parse", "--verify", "--quiet", originRef], { cwd: repoRoot }).code === 0) {
    return originRef;
  }
  if (git(["rev-parse", "--verify", "--quiet", baseBranch], { cwd: repoRoot }).code === 0) {
    return baseBranch;
  }
  throw new Error(`Base branch not found locally: ${baseBranch}`);
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

function classifyBacklogItem(item, manifestBranchStates) {
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
  const branchState = item.branchName ? manifestBranchStates.get(item.branchName) : null;
  if (branchState === "active") {
    return {
      status: "active",
      reason: "workspace manifest already exists for branch",
    };
  }
  if (branchState === "closed") {
    return {
      status: "closed",
      reason: "only closed workspace manifests exist for branch",
    };
  }
  return {
    status: "assignable",
    reason: "ready safe backlog item has no active workspace conflict",
  };
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

  const nextLane = readSafeBacklogNextLane(source);
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
      if (block.includes("nextLane=report_navigation_lane")) {
        item.branchName = nextLane.branchName;
        item.startCommand = nextLane.startCommand;
      }
      return item;
    })
    .filter((item) => item.itemId);
}

function readSafeBacklogNextLane(source) {
  const match = source.match(/def _report_evidence_navigation_next_lane[\s\S]*?return NextLaneRecommendationView\(([\s\S]*?)\n\s*\)/);
  const block = match?.[1] || "";
  return {
    branchName: pythonStringField(block, "branchName"),
    startCommand: pythonStringField(block, "startCommand"),
  };
}

function pythonStringField(source, fieldName) {
  const match = source.match(new RegExp(`${fieldName}=["']([^"']+)["']`));
  return match?.[1] || "";
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

function workspaceKey() {
  for (const cwd of [repoRoot, currentGitRoot()]) {
    const origin = git(["remote", "get-url", "origin"], { cwd });
    if (origin.code === 0 && origin.stdout) {
      const match = origin.stdout.trim().match(/github\.com[:/](?<owner>[^/]+)\/(?<repo>[^/]+?)(\.git)?$/i);
      if (match?.groups) {
        return slugify(`${match.groups.owner}-${match.groups.repo}`);
      }
    }
  }

  const commonDir = git(["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: repoRoot });
  if (commonDir.code === 0 && commonDir.stdout) {
    return slugify(basename(dirname(commonDir.stdout.trim())));
  }

  return slugify(basename(repoRoot));
}

function currentGitRoot() {
  const result = git(["rev-parse", "--show-toplevel"], { cwd: process.cwd() });
  if (result.code === 0 && result.stdout) {
    return result.stdout.trim();
  }
  return process.cwd();
}

function printManifestSummary(manifest) {
  console.log(`Task: ${manifest.task_id}`);
  console.log(`Owner: ${manifest.owner || "unowned"}`);
  console.log(`Branch: ${manifest.branch}`);
  console.log(`Base: ${manifest.base_ref}`);
  console.log(`Worktree: ${manifest.worktree_path}`);
  console.log(`Manifest: ${join(manifest.state_root, "tasks", `${manifest.task_id}.json`)}`);
}

function printPlan(name, lines) {
  console.log(`DRY RUN: ${name}`);
  for (const line of lines) {
    console.log(`- ${line}`);
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
