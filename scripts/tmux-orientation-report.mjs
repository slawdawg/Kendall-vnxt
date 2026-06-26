#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { hostname } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { workspaceState } from "./lib/codex-workspace-state.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const fieldSeparator = "\u001f";
const tmuxPaneFields = [
  "session_name",
  "window_index",
  "window_name",
  "pane_index",
  "pane_id",
  "pane_active",
  "pane_pid",
  "pane_current_path",
  "pane_title",
  "pane_current_command",
];

export function parseArgs(argv = []) {
  const options = {
    json: false,
    allowMissingTmux: false,
    stateRoot: "",
    owner: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--allow-missing-tmux") {
      options.allowMissingTmux = true;
    } else if (arg === "--state-root") {
      options.stateRoot = optionValue(argv, index, arg);
      index += 1;
    } else if (arg.startsWith("--state-root=")) {
      options.stateRoot = arg.slice("--state-root=".length);
    } else if (arg === "--owner") {
      options.owner = optionValue(argv, index, arg);
      index += 1;
    } else if (arg.startsWith("--owner=")) {
      options.owner = arg.slice("--owner=".length);
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function optionValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`${optionName} requires a value`);
  }
  return value;
}

export function currentRunnerOwner(env = process.env, options = {}) {
  const configured = options.owner || env.CODEX_WORKSPACE_OWNER || env.CODEX_THREAD_ID;
  const owner = configured ? String(configured).trim() : `${env.USER || "unknown"}@${hostname() || "unknown-host"}`;
  return owner || "unknown-owner";
}

export function tmuxListPanesArgs() {
  const format = tmuxPaneFields.map((field) => `#{${field}}`).join(fieldSeparator);
  return ["list-panes", "-a", "-F", format];
}

export function readTmuxPanes({ runner = spawnSync } = {}) {
  const result = runner("tmux", tmuxListPanesArgs(), {
    encoding: "utf8",
    stdio: "pipe",
  });

  if ((result.status ?? 1) !== 0) {
    return {
      ok: false,
      panes: [],
      error: (result.stderr || result.error?.message || "tmux list-panes failed").trim(),
    };
  }

  return {
    ok: true,
    panes: parseTmuxPaneOutput(result.stdout || ""),
    error: "",
  };
}

export function parseTmuxPaneOutput(output) {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const rawValues = line.split(fieldSeparator);
      const values =
        rawValues.length > tmuxPaneFields.length
          ? [...rawValues.slice(0, tmuxPaneFields.length - 1), rawValues.slice(tmuxPaneFields.length - 1).join(fieldSeparator)]
          : rawValues;
      const row = {};
      tmuxPaneFields.forEach((field, index) => {
        row[field] = values[index] || "";
      });
      return {
        sessionName: row.session_name,
        windowIndex: row.window_index,
        windowName: row.window_name,
        paneIndex: row.pane_index,
        paneId: row.pane_id,
        paneActive: row.pane_active === "1",
        panePid: row.pane_pid,
        currentPath: row.pane_current_path,
        paneTitle: row.pane_title,
        currentCommand: row.pane_current_command,
        metadataState: values.length === tmuxPaneFields.length ? "complete" : "malformed",
      };
    });
}

export function readWorkspaceManifests(options = {}, context = {}) {
  const state = workspaceState(
    options.stateRoot ? { stateRoot: options.stateRoot } : {},
    { repoRoot: context.repoRoot || repoRoot, cwd: context.cwd || process.cwd(), env: context.env || process.env },
  );
  if (!existsSync(state.tasksDir)) {
    return {
      stateRoot: state.root,
      tasksDir: state.tasksDir,
      manifests: [],
      error: "",
    };
  }

  const manifests = [];
  const manifestErrors = [];
  for (const entry of readdirSync(state.tasksDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    const path = resolve(state.tasksDir, entry.name);
    try {
      const manifest = JSON.parse(readFileSync(path, "utf8"));
      if (manifest?.worktree_path && typeof manifest.worktree_path !== "string") {
        manifestErrors.push({ path, error: "manifest worktree_path must be a string" });
      } else if (manifest?.worktree_path) {
        manifests.push({ path, manifest });
      }
    } catch (error) {
      manifestErrors.push({
        path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    stateRoot: state.root,
    tasksDir: state.tasksDir,
    worktreesDir: state.worktreesDir,
    manifests,
    manifestErrors,
    error: "",
  };
}

export function buildOrientationReport({
  panes = [],
  tmuxError = "",
  workspaceRecords = [],
  workspaceErrors = [],
  stateRoot = "",
  currentOwner = "",
  dirtyStateReader = defaultDirtyStateReader,
} = {}) {
  const rows = panes.map((pane) => {
    const workspace = findWorkspaceForPath(pane.currentPath, workspaceRecords);
    const manifest = workspace?.manifest || null;
    const worktreeExists = manifest?.worktree_path ? existsSync(manifest.worktree_path) : false;
    const dirtyState = manifest?.worktree_path
      ? dirtyStateReader(manifest.worktree_path)
      : { status: "not_applicable", dirty: false, lines: [] };
    const ownership = classifyOwnership(manifest, currentOwner, { worktreeExists });

    return {
      ...pane,
      taskId: manifest?.task_id || null,
      branch: manifest?.branch || null,
      baseBranch: manifest?.base_branch || null,
      owner: manifest?.owner || null,
      status: manifest?.status || null,
      mode: manifest?.mode || null,
      worktreePath: manifest?.worktree_path || null,
      worktreeExists: manifest ? worktreeExists : null,
      readinessState: readinessState(manifest),
      dirtyState,
      classification: workspace ? ownership.classification : "unmanaged-path",
      stopLine: workspace ? ownership.stopLine : "",
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    stateRoot,
    currentOwner,
    tmux: {
      available: !tmuxError,
      error: tmuxError,
    },
    workspaceErrors,
    summary: summarizeRows(rows, tmuxError),
    panes: rows,
  };
}

export function renderHumanReport(report) {
  const lines = [
    "Tmux Orientation Report",
    `Generated: ${report.generatedAt}`,
    `State root: ${sanitizeDisplay(report.stateRoot || "unknown")}`,
    `Current owner: ${sanitizeDisplay(report.currentOwner || "unknown")}`,
  ];

  if (!report.tmux.available) {
    lines.push(`Tmux unavailable: ${sanitizeDisplay(report.tmux.error)}`);
  }

  lines.push(
    "",
    `Summary: total=${report.summary.total} mapped=${report.summary.mapped} takeover-required=${report.summary.takeoverRequired} missing-worktrees=${report.summary.missingWorktrees} unmanaged=${report.summary.unmanaged} dirty=${report.summary.dirty} unknown-dirty=${report.summary.unknownDirty} malformed-metadata=${report.summary.malformedPaneMetadata}`,
    "",
  );

  if (report.workspaceErrors.length > 0) {
    lines.push("Workspace manifest warnings:");
    for (const warning of report.workspaceErrors) {
      lines.push(`  ${sanitizeDisplay(warning.path)}: ${sanitizeDisplay(warning.error)}`);
    }
    lines.push("");
  }

  if (report.panes.length === 0) {
    lines.push("No tmux panes reported.");
    return lines.join("\n");
  }

  for (const row of report.panes) {
    const paneRef = `${row.sessionName}:${row.windowIndex}.${row.paneIndex}`;
    lines.push(`${sanitizeDisplay(paneRef)} ${row.classification}`);
    lines.push(`  pane: id=${sanitizeDisplay(row.paneId || "unknown")} active=${row.paneActive ? "yes" : "no"} window=${sanitizeDisplay(row.windowName || "unknown")}`);
    lines.push(`  path: ${sanitizeDisplay(row.currentPath || "unknown")}`);
    lines.push(`  command: ${sanitizeDisplay(row.currentCommand || "unknown")} pid=${sanitizeDisplay(row.panePid || "unknown")} title=${sanitizeDisplay(row.paneTitle || "")}`.trimEnd());
    if (row.metadataState === "malformed") {
      lines.push("  metadata: malformed tmux row");
    }
    if (row.taskId) {
      lines.push(`  workspace: ${sanitizeDisplay(row.taskId)} branch=${sanitizeDisplay(row.branch || "unknown")} base=${sanitizeDisplay(row.baseBranch || "unknown")} mode=${sanitizeDisplay(row.mode || "unknown")} owner=${sanitizeDisplay(row.owner || "unknown")} status=${sanitizeDisplay(row.status || "unknown")} dirty=${sanitizeDisplay(row.dirtyState.status)} readiness=${sanitizeDisplay(row.readinessState)}`);
      lines.push(`  worktree: ${sanitizeDisplay(row.worktreePath || "unknown")} exists=${row.worktreeExists ? "yes" : "no"}`);
    }
    if (row.stopLine) {
      lines.push(`  stop: ${sanitizeDisplay(row.stopLine)}`);
    }
  }

  return lines.join("\n");
}

export function runReport(options = {}, context = {}) {
  const tmux = context.tmuxResult || readTmuxPanes({ runner: context.runner });
  const workspace = context.workspaceResult || readWorkspaceManifests(options, context);
  const currentOwner = currentRunnerOwner(context.env || process.env, options);
  const report = buildOrientationReport({
    panes: tmux.panes,
    tmuxError: tmux.ok ? "" : tmux.error,
    workspaceRecords: workspace.manifests,
    workspaceErrors: workspace.manifestErrors || [],
    stateRoot: workspace.stateRoot,
    currentOwner,
    dirtyStateReader: context.dirtyStateReader,
  });

  return {
    report,
    exitCode: tmux.ok || options.allowMissingTmux ? 0 : 1,
  };
}

export function printHelp() {
  return [
    "Usage: node ./scripts/tmux-orientation-report.mjs [options]",
    "",
    "Options:",
    "  --json                 Emit JSON instead of human text.",
    "  --allow-missing-tmux   Return success with an empty report when tmux is unavailable.",
    "  --state-root <path>    Read workspace manifests from an explicit Codex workspace root.",
    "  --owner <id>           Override the current runner owner for takeover classification.",
  ].join("\n");
}

function findWorkspaceForPath(panePath, workspaceRecords) {
  if (!panePath) {
    return null;
  }
  const resolvedPanePath = resolve(normalizePanePathForMatching(panePath));
  const realPanePath = safeRealpath(resolvedPanePath);
  const matches = workspaceRecords
    .filter((record) => {
      if (!record.manifest?.worktree_path) {
        return false;
      }
      const worktreePath = resolve(record.manifest.worktree_path);
      const realWorktreePath = safeRealpath(worktreePath);
      return isInsideOrSame(resolvedPanePath, worktreePath) || isInsideOrSame(realPanePath, realWorktreePath);
    })
    .sort((left, right) => resolve(right.manifest.worktree_path).length - resolve(left.manifest.worktree_path).length);
  return matches[0] || null;
}

function normalizePanePathForMatching(panePath) {
  return String(panePath).replace(/ \(deleted\)$/, "");
}

function classifyOwnership(manifest, currentOwner, { worktreeExists = true } = {}) {
  if (!manifest) {
    return {
      classification: "unmanaged-path",
      stopLine: "",
    };
  }
  if (!manifest.owner) {
    return {
      classification: "unowned-workspace",
      stopLine: "Use the claim flow before mutation; do not assume ownership.",
    };
  }
  if (manifest.owner !== currentOwner) {
    const missingWorktreeText = worktreeExists ? "" : " Manifest worktree path is also missing; inspect workspace state before changes.";
    return {
      classification: "takeover-required",
      stopLine: `Do not mutate; owner ${manifest.owner} differs from current runner ${currentOwner}. Confirm idle state and use codex-workspace takeover before changes.${missingWorktreeText}`,
    };
  }
  if (!worktreeExists) {
    return {
      classification: "missing-worktree",
      stopLine: `Do not mutate; manifest worktree path is missing for ${manifest.task_id || "unknown task"}. Rebuild or inspect workspace state before changes.`,
    };
  }
  if (manifest.owner === currentOwner) {
    return {
      classification: "current-runner-owned",
      stopLine: "",
    };
  }
  return {
    classification: "current-runner-owned",
    stopLine: "",
  };
}

function readinessState(manifest) {
  if (!manifest) {
    return "not_applicable";
  }
  if (manifest.last_verified_at && manifest.last_verification_command) {
    return "verified";
  }
  if (manifest.last_verified_at) {
    return "verified_unknown_command";
  }
  return "unverified";
}

function summarizeRows(rows, tmuxError) {
  return {
    total: rows.length,
    mapped: rows.filter((row) => row.taskId).length,
    takeoverRequired: rows.filter((row) => row.classification === "takeover-required").length,
    unmanaged: rows.filter((row) => row.classification === "unmanaged-path").length,
    missingWorktrees: rows.filter((row) => row.worktreeExists === false).length,
    dirty: rows.filter((row) => row.dirtyState?.dirty).length,
    unknownDirty: rows.filter((row) => row.dirtyState?.status === "unknown").length,
    malformedPaneMetadata: rows.filter((row) => row.metadataState === "malformed").length,
    tmuxAvailable: !tmuxError,
  };
}

function defaultDirtyStateReader(worktreePath) {
  if (!worktreePath || !existsSync(worktreePath)) {
    return {
      status: "missing",
      dirty: false,
      lines: [],
    };
  }
  const result = spawnSync("git", ["status", "--porcelain=v1"], {
    cwd: worktreePath,
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    stdio: "pipe",
    timeout: 5000,
  });
  if ((result.status ?? 1) !== 0) {
    return {
      status: "unknown",
      dirty: false,
      lines: [],
      error: (result.stderr || result.error?.message || "git status failed").trim(),
    };
  }
  const lines = (result.stdout || "").split(/\r?\n/).filter(Boolean);
  return {
    status: lines.length > 0 ? "dirty" : "clean",
    dirty: lines.length > 0,
    lines,
  };
}

function isInsideOrSame(child, parent) {
  const rel = relative(parent, child);
  return rel === "" || (!!rel && !rel.startsWith("..") && !isAbsolute(rel));
}

function safeRealpath(path) {
  try {
    return realpathSync.native(path);
  } catch {
    return resolve(path);
  }
}

function sanitizeDisplay(value) {
  return String(value).replace(/[\u001b\u0000-\u001f\u007f]/g, "?");
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(printHelp());
    process.exit(2);
  }

  if (options.help) {
    console.log(printHelp());
    return;
  }

  const { report, exitCode } = runReport(options);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderHumanReport(report));
  }
  process.exit(exitCode);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
