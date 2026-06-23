import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRepoRoot = fileURLToPath(new URL("../..", import.meta.url));

export class WorkspaceStateStorageError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "WorkspaceStateStorageError";
    this.code = code;
  }
}

export function workspaceState(options = {}, context = {}) {
  const env = context.env || process.env;
  const repoRoot = resolve(String(context.repoRoot || defaultRepoRoot));
  const configuredRoot =
    options.stateRoot ||
    env.CODEX_WORKSPACE_ROOT ||
    join(env.USERPROFILE || env.HOME || dirname(repoRoot), ".codex-workspaces", workspaceKey({ ...context, repoRoot, env }));
  const root = resolve(String(configuredRoot));
  return {
    root,
    assignmentsDir: join(root, "assignments"),
    tasksDir: join(root, "tasks"),
    worktreesDir: join(root, "worktrees"),
  };
}

export function workspaceKey(context = {}) {
  const env = context.env || process.env;
  const repoRoot = resolve(String(context.repoRoot || defaultRepoRoot));
  for (const cwd of [repoRoot, currentGitRoot({ ...context, repoRoot, env })]) {
    const origin = git(["remote", "get-url", "origin"], { cwd, env });
    if (origin.code === 0 && origin.stdout) {
      const match = origin.stdout.trim().match(/github\.com[:/](?<owner>[^/]+)\/(?<repo>[^/]+?)(\.git)?$/i);
      if (match?.groups) {
        return slugify(`${match.groups.owner}-${match.groups.repo}`);
      }
    }
  }

  const commonDir = git(["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: repoRoot, env });
  if (commonDir.code === 0 && commonDir.stdout) {
    return slugify(basename(dirname(commonDir.stdout.trim())));
  }

  return slugify(basename(repoRoot));
}

export function assertLocalWorkspaceStoragePath(storagePath, context = {}) {
  const env = context.env || process.env;
  const repoRoot = resolve(String(context.repoRoot || defaultRepoRoot));
  const realRepoRoot = realpathForStoragePath(repoRoot);

  if (!storagePath) {
    throw new WorkspaceStateStorageError("MISSING_WORKSPACE_STORAGE_PATH", "Workspace storage path is required.");
  }

  const path = resolve(String(storagePath));
  const realPath = realpathForStoragePath(path);

  if (!isInsideOrSame(realPath, realRepoRoot)) {
    return {
      path,
      realPath,
      outsideTrackedSource: true,
      gitIgnored: false,
      proof: "outside-tracked-source",
    };
  }

  const relativePath = relative(realRepoRoot, realPath) || ".";
  const ignored = git(["check-ignore", "-q", "--", relativePath], { cwd: repoRoot, env });
  if (ignored.code === 0) {
    return {
      path,
      realPath,
      outsideTrackedSource: false,
      gitIgnored: true,
      proof: "git-check-ignore",
    };
  }

  throw new WorkspaceStateStorageError(
    "UNSAFE_WORKSPACE_STORAGE_PATH",
    `Workspace storage path is inside tracked source and is not ignored by Git: ${path}`,
  );
}

export function assertWorkspaceStateStorage(options = {}, context = {}) {
  const state = workspaceState(options, context);
  return {
    state,
    proof: assertLocalWorkspaceStoragePath(state.root, context),
  };
}

export function currentGitRoot(context = {}) {
  const cwd = context.cwd || process.cwd();
  const env = context.env || process.env;
  const result = git(["rev-parse", "--show-toplevel"], { cwd, env });
  if (result.code === 0 && result.stdout) {
    return result.stdout.trim();
  }
  return cwd;
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

function isInsideOrSame(child, parent) {
  const rel = relative(parent, child);
  return rel === "" || (!!rel && !rel.startsWith("..") && !isAbsolute(rel));
}

function realpathForStoragePath(path) {
  let current = resolve(path);
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) {
      return resolve(path);
    }
    current = parent;
  }

  const realExisting = realpathSync.native(current);
  return current === resolve(path) ? realExisting : resolve(realExisting, relative(current, path));
}

function git(commandArguments, options = {}) {
  const result = spawnSync("git", commandArguments, {
    cwd: options.cwd || defaultRepoRoot,
    encoding: "utf8",
    env: options.env || process.env,
    stdio: "pipe",
  });
  return {
    code: result.status ?? 1,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || result.error?.message || "").trim(),
  };
}
