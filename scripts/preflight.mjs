import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveWorkspaceCommand } from "./lib/workspace-command-resolution.mjs";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const target = (process.argv[2] ?? "all").toLowerCase();
const supportedNodeMajors = new Set([22, 23, 24]);

const supportedTargets = new Set(["all", "js", "python"]);
if (!supportedTargets.has(target)) {
  console.error(`Unknown preflight target "${target}". Use one of: all, js, python.`);
  process.exit(1);
}

const failures = [];
const successes = [];

function recordSuccess(message) {
  successes.push(message);
}

function recordFailure(message) {
  failures.push(message);
}

function commandExists(command, args = ["--version"]) {
  const resolved = resolveWorkspaceCommand(command, args);
  const result = spawnSync(resolved.command, resolved.args, {
    cwd: rootDir,
    encoding: "utf8",
    env: resolved.env ?? process.env,
    stdio: "pipe",
  });

  return result.status === 0;
}

function findGoogleFontImports(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  const matches = [];
  const entries = readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".next" || entry.name === "node_modules") {
        continue;
      }
      matches.push(...findGoogleFontImports(entryPath));
      continue;
    }

    if (!entry.isFile() || !/\.[cm]?[jt]sx?$/.test(entry.name)) {
      continue;
    }

    if (statSync(entryPath).size > 1_000_000) {
      continue;
    }

    if (readFileSync(entryPath, "utf8").includes("next/font/google")) {
      matches.push(entryPath);
    }
  }

  return matches;
}

function verifyJsWorkspace() {
  const currentNodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);
  if (!supportedNodeMajors.has(currentNodeMajor)) {
    recordFailure(
      `Node ${process.versions.node} is outside the supported range. Use Node 22.13.0+ or a current 23.x/24.x release before running workspace commands.`,
    );
    return;
  }

  if (!commandExists("pnpm")) {
    recordFailure("pnpm is not available. Run `corepack enable` first, then retry.");
    return;
  }

  if (!existsSync(join(rootDir, "pnpm-lock.yaml"))) {
    recordFailure("Missing `pnpm-lock.yaml`. Restore the lockfile before installing dependencies.");
    return;
  }

  if (!existsSync(join(rootDir, "node_modules", ".pnpm"))) {
    recordFailure("JavaScript workspace dependencies are missing. Run `pnpm install` or `pnpm run setup`.");
    return;
  }

  const googleFontImports = findGoogleFontImports(join(rootDir, "apps", "dashboard", "src"));
  if (googleFontImports.length > 0) {
    recordFailure(
      `Dashboard source imports \`next/font/google\`, which makes sandboxed builds depend on fetching Google Fonts: ${googleFontImports.join(", ")}`,
    );
    return;
  }

  recordSuccess("JavaScript workspace dependencies are installed.");
  recordSuccess(`Node ${process.versions.node} is within the supported workspace range.`);
}

function verifyPythonWorkspace() {
  if (!commandExists("uv")) {
    recordFailure("uv is not available. Install uv, then run `pnpm run setup:py`.");
    return;
  }

  const venvDir = join(rootDir, "services", "supervisor", ".venv");
  const pythonEntry = join(venvDir, "bin", "python");

  if (!existsSync(venvDir) || !existsSync(pythonEntry)) {
    recordFailure("Supervisor virtualenv is missing. Run `uv sync --directory services/supervisor` or `pnpm run setup:py`.");
    return;
  }

  recordSuccess("Supervisor virtualenv is ready.");
}

if (target === "all" || target === "js") {
  verifyJsWorkspace();
}

if (target === "all" || target === "python") {
  verifyPythonWorkspace();
}

for (const message of successes) {
  console.log(`OK: ${message}`);
}

if (failures.length > 0) {
  for (const message of failures) {
    console.error(`FAIL: ${message}`);
  }
  process.exit(1);
}

console.log("Preflight passed.");
