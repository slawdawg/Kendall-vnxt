import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
    case "resume":
      resumeWorkspace(commandArgs);
      break;
    case "finish-pr":
      finishPr(commandArgs);
      break;
    case "cleanup-merged":
      cleanupMerged(commandArgs);
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
  resume <query>            Print the matching task worktree and branch.
  finish-pr [query]         Commit, push, and create/view a PR for a task.
  cleanup-merged [query]    Remove clean worktrees whose PRs are merged.
  doctor                    Check local workspace protocol readiness.

Common options:
  --dry-run                 Print the planned mutation without applying it.
  --state-root <path>       Override the Codex workspace state root.

start options:
  --base <branch>           Base branch. Defaults to main.
  --branch <branch>         Override generated branch name.
  --task-id <id>            Override generated task id.
  --worktree <path>         Override generated worktree path.

finish-pr options:
  --message <text>          Commit message. Defaults to task title.
  --verify <command>        Verification command to run before commit.
  --no-verify               Skip verification command.
  --title <text>            PR title. Defaults to task title.
  --body <text>             PR body.

cleanup-merged options:
  --delete-remote           Delete remote branch after merged cleanup.
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

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
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
  const slug = slugify(description);
  const taskId = String(options.taskId || `${dateStamp()}-${slug}`);
  const branch = String(options.branch || `codex/${slug}`);
  assertSafeBranch(branch);

  const state = workspaceState(options);
  const worktreePath = resolve(String(options.worktree || join(state.worktreesDir, taskId)));
  const manifestPath = join(state.tasksDir, `${taskId}.json`);
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
    pr_url: null,
    pr_number: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_verified_at: null,
    last_verification_command: null,
    last_commit: null,
  };

  if (options.dryRun) {
    printPlan("start", [
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
  runChecked("git", ["worktree", "add", "-b", branch, worktreePath, baseRef], { cwd: repoRoot });
  writeManifest(manifestPath, manifest);

  console.log(`Created Codex workspace ${taskId}`);
  printManifestSummary(manifest);
}

function listWorkspaces(argv) {
  const { options } = parseOptions(argv);
  const state = workspaceState(options);
  const manifests = readManifests(state);

  if (manifests.length === 0) {
    console.log(`No Codex workspaces found under ${state.tasksDir}`);
    return;
  }

  for (const { manifest } of manifests) {
    console.log(
      [
        manifest.task_id,
        manifest.status,
        manifest.branch,
        manifest.pr_url || "no-pr",
        manifest.worktree_path,
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
  console.log(`Branch: ${manifest.branch}`);
  console.log(`Worktree: ${manifest.worktree_path}`);
  if (manifest.pr_url) {
    console.log(`PR: ${manifest.pr_url}`);
  }
  console.log(`Command: cd "${manifest.worktree_path}"`);
}

function finishPr(argv) {
  const { positional, options } = parseOptions(argv);
  const manifestRecord = findManifest(workspaceState(options), positional.join(" "), {
    preferCurrentWorktree: true,
  });
  const { manifest, path: manifestPath } = manifestRecord;

  assertSafeBranch(manifest.branch);
  assertWorktreeExists(manifest);

  const status = git(["status", "--short"], { cwd: manifest.worktree_path }).stdout.trim();
  const verifyCommand = options.noVerify ? "" : String(options.verify || "");
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

  if (!status && !manifest.last_commit) {
    throw new Error("No changes to commit and no prior task commit is recorded.");
  }

  const plan = [];
  if (verifyCommand) {
    plan.push(verifyCommand);
  }
  if (status) {
    plan.push("git add --all");
    plan.push(`git commit -m "${commitMessage}"`);
  }
  plan.push(`git push -u origin ${manifest.branch}`);
  plan.push("gh pr create/view");

  if (options.dryRun) {
    printPlan("finish-pr", plan);
    return;
  }

  if (verifyCommand) {
    runShellChecked(verifyCommand, { cwd: manifest.worktree_path });
    manifest.last_verified_at = new Date().toISOString();
    manifest.last_verification_command = verifyCommand;
  }

  if (status) {
    runChecked("git", ["add", "--all"], { cwd: manifest.worktree_path });
    runChecked("git", ["commit", "-m", commitMessage], { cwd: manifest.worktree_path });
    manifest.last_commit = git(["rev-parse", "--short", "HEAD"], {
      cwd: manifest.worktree_path,
    }).stdout.trim();
  }

  runChecked("git", ["push", "-u", "origin", manifest.branch], { cwd: manifest.worktree_path });

  const existingPr = prView(manifest);
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
  writeManifest(manifestPath, manifest);
  console.log(`Finished task ${manifest.task_id}`);
  console.log(`PR: ${manifest.pr_url}`);
}

function cleanupMerged(argv) {
  const { positional, options } = parseOptions(argv);
  const state = workspaceState(options);
  const records = positional.length > 0 ? [findManifest(state, positional.join(" "))] : readManifests(state);
  const deleteRemote = Boolean(options.deleteRemote);

  for (const record of records) {
    const { manifest, path: manifestPath } = record;
    if (manifest.status === "closed") {
      continue;
    }
    if (!manifest.pr_url && !manifest.pr_number) {
      console.log(`SKIP ${manifest.task_id}: no PR recorded.`);
      continue;
    }

    const pr = prView(manifest);
    if (!pr || !pr.mergedAt) {
      console.log(`SKIP ${manifest.task_id}: PR is not merged.`);
      continue;
    }

    assertWorktreeExists(manifest);
    const status = git(["status", "--short"], { cwd: manifest.worktree_path }).stdout.trim();
    if (status) {
      console.log(`SKIP ${manifest.task_id}: worktree is not clean.`);
      continue;
    }

    const plan = [`git worktree remove ${manifest.worktree_path}`, `git branch -d ${manifest.branch}`];
    if (deleteRemote) {
      plan.push(`git push origin --delete ${manifest.branch}`);
    }

    if (options.dryRun) {
      printPlan(`cleanup-merged ${manifest.task_id}`, plan);
      continue;
    }

    runChecked("git", ["worktree", "remove", manifest.worktree_path], { cwd: repoRoot });
    const branchDelete = git(["branch", "-d", manifest.branch], { cwd: repoRoot });
    if (branchDelete.code !== 0 && !/not found/i.test(branchDelete.stderr)) {
      throw new Error(branchDelete.stderr || branchDelete.stdout);
    }
    if (deleteRemote) {
      runChecked("git", ["push", "origin", "--delete", manifest.branch], { cwd: repoRoot });
    }

    manifest.status = "closed";
    manifest.merged_at = pr.mergedAt;
    manifest.closed_at = new Date().toISOString();
    manifest.updated_at = manifest.closed_at;
    writeManifest(manifestPath, manifest);
    console.log(`Closed ${manifest.task_id}`);
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
      return { path, manifest: JSON.parse(readFileSync(path, "utf8")) };
    })
    .sort((left, right) => left.manifest.task_id.localeCompare(right.manifest.task_id));
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

function branchExists(branch) {
  return git(["rev-parse", "--verify", "--quiet", branch], { cwd: repoRoot }).code === 0;
}

function assertSafeBranch(branch) {
  const short = branch.replace(/^refs\/heads\//, "");
  if (protectedBranches.has(short)) {
    throw new Error(`Refusing to operate on protected branch: ${branch}`);
  }
}

function assertWorktreeExists(manifest) {
  if (!existsSync(manifest.worktree_path) || !statSync(manifest.worktree_path).isDirectory()) {
    throw new Error(`Worktree path is missing: ${manifest.worktree_path}`);
  }
}

function prView(manifest) {
  const selector = manifest.pr_number ? String(manifest.pr_number) : manifest.branch;
  const result = run("gh", ["pr", "view", selector, "--json", "number,url,mergedAt,state"], {
    cwd: manifest.worktree_path && existsSync(manifest.worktree_path) ? manifest.worktree_path : repoRoot,
  });
  if (result.code !== 0) {
    return null;
  }
  return JSON.parse(result.stdout);
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
  const result = spawnSync(resolveCommand(commandName), resolveArgs(commandName, commandArguments), {
    cwd: options.cwd || repoRoot,
    encoding: "utf8",
    stdio: "pipe",
    timeout: options.timeout || 120_000,
  });

  return {
    code: result.status ?? 1,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || result.error?.message || "").trim(),
  };
}

function resolveCommand(commandName) {
  if (process.platform === "win32" && commandName === "git") {
    for (const candidate of [
      process.env.GIT_EXE,
      "C:\\Program Files\\Git\\cmd\\git.exe",
      "C:\\Program Files\\Git\\bin\\git.exe",
      "C:\\Program Files (x86)\\Git\\cmd\\git.exe",
    ]) {
      if (candidate && existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return commandName;
}

function resolveArgs(_commandName, commandArguments) {
  return commandArguments;
}

function samePath(left, right) {
  return resolve(left).toLowerCase() === resolve(right).toLowerCase();
}
