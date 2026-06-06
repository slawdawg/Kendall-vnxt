import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const target = (process.argv[2] ?? "all").toLowerCase();
const supportedNodeMajors = new Set([22, 23, 24]);

function resolveCommand(command) {
  if (command === "pnpm" && process.env.npm_execpath) {
    return process.execPath;
  }

  if (process.platform === "win32" && command === "pnpm") {
    return "pnpm.cmd";
  }

  return command;
}

function resolveArgs(command, args) {
  if (command === "pnpm" && process.env.npm_execpath) {
    return [process.env.npm_execpath, ...args];
  }

  return args;
}

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
  const result = spawnSync(resolveCommand(command), resolveArgs(command, args), {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
  });

  return result.status === 0;
}

function verifyJsWorkspace() {
  const currentNodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);
  if (!supportedNodeMajors.has(currentNodeMajor)) {
    recordFailure(
      `Node ${process.versions.node} is outside the supported range. Use Node 22.x, 23.x, or 24.x before running workspace commands.`,
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

  recordSuccess("JavaScript workspace dependencies are installed.");
  recordSuccess(`Node ${process.versions.node} is within the supported workspace range.`);
}

function verifyPythonWorkspace() {
  if (!commandExists("uv")) {
    recordFailure("uv is not available. Install uv, then run `pnpm run setup:py`.");
    return;
  }

  const venvDir = join(rootDir, "services", "supervisor", ".venv");
  const pythonEntry = process.platform === "win32"
    ? join(venvDir, "Scripts", "python.exe")
    : join(venvDir, "bin", "python");

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
