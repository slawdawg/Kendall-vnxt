import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const dataDir = join(rootDir, ".data");
const uvCacheDir = join(dataDir, "uv-cache");
const tempDir = join(tmpdir(), "kendall-supervisor-tests");
const DEFAULT_TIMEOUT_MS = Number(process.env.SUPERVISOR_TEST_TIMEOUT_MS || "0");

mkdirSync(uvCacheDir, { recursive: true });
mkdirSync(tempDir, { recursive: true });
const runTempDir = mkdtempSync(join(tempDir, "run-"));

const uvCommand = process.env.UV_EXE || "uv";
const rawArgs = process.argv.slice(2).filter((arg) => arg !== "--");
const options = parseArgs(rawArgs);
const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
const killGraceMs = Number(process.env.SUPERVISOR_TEST_KILL_GRACE_MS || "5000");
const spawnOptions = {
  cwd: rootDir,
  env: {
    ...process.env,
    UV_CACHE_DIR: uvCacheDir,
    TMP: runTempDir,
    TEMP: runTempDir,
  },
  stdio: "inherit",
  detached: true,
};

if (timeoutMs < 0 || !Number.isFinite(timeoutMs)) {
  console.error(`FAIL supervisor-test invalid timeout: ${timeoutMs}`);
  process.exit(64);
}

if (killGraceMs < 0 || !Number.isFinite(killGraceMs)) {
  console.error(`FAIL supervisor-test invalid kill grace: ${killGraceMs}`);
  process.exit(64);
}

if (options.skipPreflight && options.preflightOnly) {
  console.error("FAIL supervisor-test conflicting flags: --preflight and --no-preflight are mutually exclusive");
  process.exit(64);
}

function parseArgs(args) {
  const parsed = {
    skipPreflight: false,
    preflightOnly: false,
    timeoutMs: undefined,
    pytestArgs: [],
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--preflight") {
      parsed.preflightOnly = true;
    } else if (arg === "--no-preflight") {
      parsed.skipPreflight = true;
    } else if (arg === "--timeout-ms") {
      parsed.timeoutMs = Number(args[++index] || "");
    } else if (arg.startsWith("--timeout-ms=")) {
      parsed.timeoutMs = Number(arg.slice("--timeout-ms=".length));
    } else {
      parsed.pytestArgs.push(arg);
    }
  }

  return parsed;
}

function commandText(command, args) {
  return [command, ...args].map((part) => part.includes(" ") ? JSON.stringify(part) : part).join(" ");
}

function terminateChild(child, signal) {
  if (!child.pid) {
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") {
      console.error(`WARN supervisor-test failed to send ${signal}: ${error.message}`);
    }
  }
}

function runPhase(label, args) {
  const start = Date.now();
  const budget = timeoutMs > 0 ? ` timeoutMs=${timeoutMs}` : "";
  console.log(`SUPERVISOR_TEST_PHASE_START ${label}${budget} command=${commandText(uvCommand, args)}`);
  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    let timeoutTimer;
    let killTimer;

    const child = spawn(uvCommand, args, spawnOptions);

    function finish(code) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutTimer);
      clearTimeout(killTimer);
      resolve(code);
    }

    if (timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        terminateChild(child, "SIGTERM");
        killTimer = setTimeout(() => terminateChild(child, "SIGKILL"), killGraceMs);
      }, timeoutMs);
    }

    child.on("error", (error) => {
      const durationMs = Date.now() - start;
      console.error(`SUPERVISOR_TEST_PHASE_ERROR ${label} durationMs=${durationMs} error=${error.message}`);
      finish(1);
    });

    child.on("exit", (status, signal) => {
      const durationMs = Date.now() - start;
      if (timedOut) {
        console.error(`SUPERVISOR_TEST_PHASE_TIMEOUT ${label} durationMs=${durationMs} timeoutMs=${timeoutMs} signal=${signal ?? "none"}`);
        finish(124);
      } else if (status !== 0) {
        console.error(`SUPERVISOR_TEST_PHASE_FAIL ${label} durationMs=${durationMs} status=${status ?? "null"} signal=${signal ?? "none"}`);
        finish(status ?? 1);
      } else {
        console.log(`SUPERVISOR_TEST_PHASE_OK ${label} durationMs=${durationMs}`);
        finish(0);
      }
    });
  });
}

function runPreflight() {
  return runPhase("preflight-import", [
    "run",
    "--directory",
    "services/supervisor",
    "python",
    "-c",
    "import sys; import supervisor; import supervisor.api.main; print(f'OK supervisor import preflight python={sys.version.split()[0]}')",
  ]);
}

function runPytest() {
  const selectedPytestArgs = options.pytestArgs.length > 0 ? options.pytestArgs : ["tests"];
  return runPhase("pytest", ["run", "--directory", "services/supervisor", "pytest", "-p", "no:cacheprovider", ...selectedPytestArgs]);
}

let exitCode = 1;
try {
  exitCode = options.skipPreflight ? 0 : await runPreflight();
  if (exitCode === 0 && !options.preflightOnly) {
    exitCode = await runPytest();
  }
} finally {
  try {
    rmSync(runTempDir, { recursive: true, force: true });
  } catch {
    // A stale per-run temp dir should not mask the actual test result.
  }
}

process.exit(exitCode);
