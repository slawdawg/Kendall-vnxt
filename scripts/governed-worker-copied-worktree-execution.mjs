#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  accessSync,
  constants,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { delimiter, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_WORKERS = Object.freeze(["claude", "hermes"]);
const SUPPORTED_COPY_WORKERS = new Set(["claude"]);
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_TIMEOUT_MS = 10000;
const SAFE_TMP_ROOT = "/tmp";
const SAFE_CWD_PREFIX = join(SAFE_TMP_ROOT, "kendall-worker-copy-exec-");
const EXPECTED_RESPONSE = "KENDALL_COPY_EXECUTION_OK";
const COPY_EXECUTION_PROMPT = `Reply exactly with ${EXPECTED_RESPONSE}. Do not explain.`;
const RAW_MARKER_PATTERN = /raw_prompt|provider_payload|authorization|bearer|token|secret|password|credential|sk-[a-z0-9_-]+/i;
const MAX_TRACKED_FILES = 5000;
const MAX_TRACKED_FILE_BYTES = 2 * 1024 * 1024;
const GIT_BINARY = "/usr/bin/git";
const GIT_ARGS = Object.freeze(["ls-files", "-z"]);

const CLAUDE_COPY_ARGS = Object.freeze([
  "--print",
  "--output-format",
  "json",
  "--input-format",
  "text",
  "--permission-mode",
  "dontAsk",
  "--no-session-persistence",
  "--safe-mode",
  "--tools",
  "",
  "--max-budget-usd",
  "0.05",
  COPY_EXECUTION_PROMPT,
]);

const ALLOWED_ATTEMPT_FIELDS = new Set([
  "attempt_id",
  "worker",
  "mode",
  "authority_level",
  "execution_state",
  "command_path",
  "command_args",
  "expected_response",
  "observed_response",
  "exit_code",
  "timed_out",
  "timeout_ms",
  "observed_at",
  "evidence_ref",
  "shell_used",
  "source_worktree",
  "execution_cwd",
  "copied_tracked_files",
  "copy_bytes",
  "copy_retained",
  "network_allowed",
  "session_inheritance_allowed",
  "source_mutation_allowed",
  "tools_allowed",
  "raw_output_retained",
  "affects_trust",
  "affects_routing",
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasRawMarkerInObject(value) {
  if (typeof value === "string") {
    return RAW_MARKER_PATTERN.test(value);
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasRawMarkerInObject(item));
  }
  if (isRecord(value)) {
    return Object.values(value).some((item) => hasRawMarkerInObject(item));
  }
  return false;
}

function parseWorkers(args) {
  const workerArgIndex = args.indexOf("--workers");
  if (workerArgIndex === -1 || typeof args[workerArgIndex + 1] !== "string") {
    return { workers: [...DEFAULT_WORKERS], errors: [] };
  }
  const requestedWorkers = args[workerArgIndex + 1]
    .split(",")
    .map((worker) => worker.trim())
    .filter(Boolean);
  const unknownWorkers = requestedWorkers.filter((worker) => !DEFAULT_WORKERS.includes(worker));
  const workers = requestedWorkers.filter((worker) => DEFAULT_WORKERS.includes(worker));
  const errors = unknownWorkers.map(() => ({ field: "workers", reason: "unknown_worker" }));
  if (workers.length === 0) {
    errors.push({ field: "workers", reason: "empty_worker_selection" });
  }
  return { workers, errors };
}

function parseTimeoutMs(args) {
  const timeoutIndex = args.indexOf("--timeout-ms");
  if (timeoutIndex === -1 || typeof args[timeoutIndex + 1] !== "string") {
    return { timeoutMs: DEFAULT_TIMEOUT_MS, errors: [] };
  }
  const timeoutMs = Number(args[timeoutIndex + 1]);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > MAX_TIMEOUT_MS) {
    return { timeoutMs: DEFAULT_TIMEOUT_MS, errors: [{ field: "timeout_ms", reason: "invalid_timeout" }] };
  }
  return { timeoutMs, errors: [] };
}

function parseObservedAt(args) {
  const observedAtIndex = args.indexOf("--observed-at");
  const observedAt = observedAtIndex >= 0 && typeof args[observedAtIndex + 1] === "string"
    ? args[observedAtIndex + 1]
    : new Date().toISOString();
  if (!Number.isFinite(Date.parse(observedAt))) {
    return { observedAt, errors: [{ field: "observed_at", reason: "invalid_observed_at" }] };
  }
  return { observedAt, errors: [] };
}

function parseSourceWorktree(args) {
  const sourceIndex = args.indexOf("--source-worktree");
  const sourceWorktree = sourceIndex >= 0 && typeof args[sourceIndex + 1] === "string"
    ? args[sourceIndex + 1]
    : process.cwd();
  if (!isAbsolute(sourceWorktree)) {
    return { sourceWorktree, errors: [{ field: "source_worktree", reason: "source_worktree_not_absolute" }] };
  }
  try {
    const realSource = realpathSync(sourceWorktree);
    if (!statSync(realSource).isDirectory()) {
      return { sourceWorktree: realSource, errors: [{ field: "source_worktree", reason: "source_worktree_not_directory" }] };
    }
    return { sourceWorktree: realSource, errors: [] };
  } catch {
    return { sourceWorktree, errors: [{ field: "source_worktree", reason: "source_worktree_unreadable" }] };
  }
}

function isUnsafePathEntry(pathEntry, sourceWorktree, env = process.env) {
  const source = realpathSync(sourceWorktree);
  const entry = realpathSync(resolve(pathEntry));
  const relativeToSource = relative(source, entry);
  return relativeToSource === "" || (!relativeToSource.startsWith("..") && !isAbsolute(relativeToSource));
}

function safePathEntries(sourceWorktree, env = process.env) {
  const pathValue = typeof env.PATH === "string" ? env.PATH : "";
  return pathValue.split(delimiter).filter((pathEntry) => {
    if (!pathEntry || !isAbsolute(pathEntry)) {
      return false;
    }
    try {
      return !isUnsafePathEntry(pathEntry, sourceWorktree, env);
    } catch {
      return false;
    }
  });
}

function findExecutableOnPath(worker, sourceWorktree, env = process.env) {
  for (const pathEntry of safePathEntries(sourceWorktree, env)) {
    const candidate = join(pathEntry, worker);
    try {
      const stats = statSync(candidate);
      if (!stats.isFile()) {
        continue;
      }
      if (isUnsafePathEntry(realpathSync(candidate), sourceWorktree, env)) {
        continue;
      }
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Missing or non-executable PATH candidates are ordinary copy-execution metadata.
    }
  }
  return null;
}

function createExecutionCwd() {
  mkdirSync(SAFE_TMP_ROOT, { recursive: true });
  return mkdtempSync(SAFE_CWD_PREFIX);
}

function isSafeExecutionCwdPath(value) {
  if (typeof value !== "string" || !value.startsWith(SAFE_CWD_PREFIX)) {
    return false;
  }
  const suffix = value.slice(SAFE_CWD_PREFIX.length);
  return /^[A-Za-z0-9]+$/.test(suffix);
}

function isSafeRelativeTrackedPath(value) {
  return typeof value === "string"
    && value.length > 0
    && !value.includes("\0")
    && !isAbsolute(value)
    && !value.split("/").includes("..")
    && !value.startsWith(".git/");
}

function listTrackedFiles(sourceWorktree, env = process.env) {
  void env;
  try {
    const stats = statSync(GIT_BINARY);
    accessSync(GIT_BINARY, constants.X_OK);
    if (!stats.isFile()) {
      return { files: [], errors: [{ field: "source_worktree", reason: "tracked_file_listing_failed" }] };
    }
  } catch {
    return { files: [], errors: [{ field: "source_worktree", reason: "tracked_file_listing_failed" }] };
  }
  const result = spawnSync(GIT_BINARY, GIT_ARGS, {
    cwd: sourceWorktree,
    encoding: "buffer",
    env: { PATH: dirname(GIT_BINARY) },
    shell: false,
    timeout: 3000,
    killSignal: "SIGKILL",
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0 || result.error) {
    return { files: [], errors: [{ field: "source_worktree", reason: "tracked_file_listing_failed" }] };
  }
  const files = result.stdout.toString("utf8").split("\0").filter(Boolean);
  if (files.length === 0 || files.length > MAX_TRACKED_FILES || files.some((file) => !isSafeRelativeTrackedPath(file))) {
    return { files: [], errors: [{ field: "source_worktree", reason: "tracked_file_listing_unsafe" }] };
  }
  return { files, errors: [] };
}

function copyTrackedFiles({ sourceWorktree, executionCwd, files }) {
  let copiedFiles = 0;
  let copiedBytes = 0;
  for (const file of files) {
    try {
      const sourcePath = join(sourceWorktree, file);
      const targetPath = join(executionCwd, file);
      const sourceRealPath = realpathSync(sourcePath);
      const sourceRelative = relative(sourceWorktree, sourceRealPath);
      if (sourceRelative.startsWith("..") || isAbsolute(sourceRelative)) {
        return { copiedFiles, copiedBytes, errors: [{ field: "source_worktree", reason: "tracked_file_escape" }] };
      }
      const stats = statSync(sourceRealPath);
      if (!stats.isFile() || stats.size > MAX_TRACKED_FILE_BYTES) {
        return { copiedFiles, copiedBytes, errors: [{ field: "source_worktree", reason: "tracked_file_not_copied" }] };
      }
      mkdirSync(dirname(targetPath), { recursive: true });
      cpSync(sourceRealPath, targetPath, { force: false, errorOnExist: true, preserveTimestamps: false });
      copiedFiles += 1;
      copiedBytes += stats.size;
    } catch {
      return { copiedFiles, copiedBytes, errors: [{ field: "source_worktree", reason: "tracked_file_escape" }] };
    }
  }
  return { copiedFiles, copiedBytes, errors: [] };
}

function sanitizeObservedResponse(stdout, stderr) {
  const stdoutText = typeof stdout === "string" ? stdout : "";
  const stderrText = typeof stderr === "string" ? stderr : "";
  const combined = [stdoutText, stderrText].filter((value) => value.trim().length > 0).join("\n");
  if (combined.length === 0 || RAW_MARKER_PATTERN.test(stderrText)) {
    return null;
  }
  try {
    const parsed = JSON.parse(stdoutText);
    if (!isRecord(parsed) || hasRawMarkerInObject(parsed)) {
      return null;
    }
    const result = typeof parsed.result === "string" ? parsed.result.trim() : null;
    return result === EXPECTED_RESPONSE ? result : null;
  } catch {
    return null;
  }
}

function commandArgsFor(worker) {
  if (worker === "claude") {
    return [...CLAUDE_COPY_ARGS];
  }
  return [];
}

export function validateCopiedWorktreeExecutionAttempt(attempt) {
  const input = isRecord(attempt) ? attempt : {};
  const field_reasons = [];
  const addReason = (field, reason = "invalid_copied_worktree_execution_attempt") => {
    field_reasons.push({ field, reason });
  };

  if (!isRecord(attempt)) {
    addReason("$");
  }
  for (const field of ["attempt_id", "worker", "mode", "authority_level", "execution_state", "observed_at", "evidence_ref"]) {
    if (typeof input[field] !== "string" || input[field].trim().length === 0 || RAW_MARKER_PATTERN.test(input[field])) {
      addReason(field);
    }
  }
  if (!DEFAULT_WORKERS.includes(input.worker)) {
    addReason("worker");
  }
  if (input.mode !== "copied_worktree_execution") {
    addReason("mode");
  }
  if (input.authority_level !== "copied_worktree_worker_execution") {
    addReason("authority_level");
  }
  if (!["missing", "unsupported", "copy_failed", "execution_observed", "failed", "timed_out", "invalid_output"].includes(input.execution_state)) {
    addReason("execution_state");
  }
  if (!Number.isFinite(Date.parse(input.observed_at))) {
    addReason("observed_at");
  }
  if (input.evidence_ref !== `metadata:worker-copied-worktree-execution/${input.worker}`) {
    addReason("evidence_ref");
  }
  if (input.command_path !== null) {
    if (typeof input.command_path !== "string" || !input.command_path.startsWith("/") || input.command_path.split("/").at(-1) !== input.worker) {
      addReason("command_path");
    }
  }
  if (!Array.isArray(input.command_args)) {
    addReason("command_args");
  } else if (input.worker === "claude" && input.command_path !== null) {
    if (input.command_args.join("\u0000") !== CLAUDE_COPY_ARGS.join("\u0000")) {
      addReason("command_args");
    }
  } else if (input.command_args.length !== 0) {
    addReason("command_args");
  }
  if (input.expected_response !== EXPECTED_RESPONSE) {
    addReason("expected_response");
  }
  if (input.observed_response !== null && input.observed_response !== EXPECTED_RESPONSE) {
    addReason("observed_response");
  }
  if (input.exit_code !== null && !Number.isInteger(input.exit_code)) {
    addReason("exit_code");
  }
  if (typeof input.timed_out !== "boolean") {
    addReason("timed_out");
  }
  if (!Number.isInteger(input.timeout_ms) || input.timeout_ms < 100 || input.timeout_ms > MAX_TIMEOUT_MS) {
    addReason("timeout_ms");
  }
  if (typeof input.source_worktree !== "string" || !input.source_worktree.startsWith("/") || RAW_MARKER_PATTERN.test(input.source_worktree)) {
    addReason("source_worktree");
  }
  if (!isSafeExecutionCwdPath(input.execution_cwd)) {
    addReason("execution_cwd");
  }
  if (!Number.isInteger(input.copied_tracked_files) || input.copied_tracked_files < 0 || input.copied_tracked_files > MAX_TRACKED_FILES) {
    addReason("copied_tracked_files");
  }
  if (!Number.isInteger(input.copy_bytes) || input.copy_bytes < 0) {
    addReason("copy_bytes");
  }
  for (const [field, expected] of [
    ["shell_used", false],
    ["copy_retained", false],
    ["network_allowed", true],
    ["session_inheritance_allowed", true],
    ["source_mutation_allowed", false],
    ["tools_allowed", false],
    ["raw_output_retained", false],
    ["affects_trust", false],
    ["affects_routing", false],
  ]) {
    if (input[field] !== expected) {
      addReason(field);
    }
  }
  if (Object.entries(input).some(([key, value]) => !ALLOWED_ATTEMPT_FIELDS.has(key) || hasRawMarkerInObject(value))) {
    addReason("$");
  }
  if (input.execution_state === "execution_observed" && (input.observed_response !== EXPECTED_RESPONSE || input.exit_code !== 0 || input.timed_out !== false || input.command_path === null || input.copied_tracked_files < 1)) {
    addReason("execution_state");
  }
  if (["missing", "unsupported", "copy_failed"].includes(input.execution_state) && (input.observed_response !== null || input.exit_code !== null || input.timed_out !== false)) {
    addReason("execution_state");
  }
  if (input.execution_state === "failed" && (input.command_path === null || !Number.isInteger(input.exit_code) || input.exit_code === 0 || input.timed_out !== false || input.observed_response !== null)) {
    addReason("execution_state");
  }
  if (input.execution_state === "timed_out" && (input.command_path === null || input.timed_out !== true || input.observed_response !== null)) {
    addReason("execution_state");
  }
  if (input.execution_state === "invalid_output" && (input.command_path === null || input.exit_code !== 0 || input.timed_out !== false || input.observed_response !== null)) {
    addReason("execution_state");
  }

  return {
    ok: field_reasons.length === 0,
    attempt_id: typeof input.attempt_id === "string" && !RAW_MARKER_PATTERN.test(input.attempt_id) ? input.attempt_id : null,
    worker: DEFAULT_WORKERS.includes(input.worker) ? input.worker : null,
    mode: input.mode === "copied_worktree_execution" ? input.mode : null,
    authority_level: input.authority_level === "copied_worktree_worker_execution" ? input.authority_level : null,
    execution_state: typeof input.execution_state === "string" && !RAW_MARKER_PATTERN.test(input.execution_state) ? input.execution_state : null,
    evidence_ref: typeof input.evidence_ref === "string" && !RAW_MARKER_PATTERN.test(input.evidence_ref) ? input.evidence_ref : null,
    denied_reasons: [...new Set(field_reasons.map((reason) => reason.reason))],
    field_reasons,
  };
}

export function collectCopiedWorktreeExecutionAttempts({
  env = process.env,
  observedAt = new Date().toISOString(),
  sourceWorktree = process.cwd(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  workers = DEFAULT_WORKERS,
} = {}) {
  return workers.map((worker) => {
    const workerAllowed = DEFAULT_WORKERS.includes(worker);
    const copySupported = SUPPORTED_COPY_WORKERS.has(worker);
    const commandPath = workerAllowed && copySupported ? findExecutableOnPath(worker, sourceWorktree, env) : null;
    const commandArgs = commandPath ? commandArgsFor(worker) : [];
    const executionCwd = createExecutionCwd();
    let executionState = copySupported ? "missing" : "unsupported";
    let exitCode = null;
    let timedOut = false;
    let observedResponse = null;
    let copiedTrackedFiles = 0;
    let copyBytes = 0;

    try {
      if (commandPath) {
        const listed = listTrackedFiles(sourceWorktree, env);
        if (listed.errors.length > 0) {
          executionState = "copy_failed";
        } else {
          const copied = copyTrackedFiles({ sourceWorktree, executionCwd, files: listed.files });
          copiedTrackedFiles = copied.copiedFiles;
          copyBytes = copied.copiedBytes;
          if (copied.errors.length > 0 || copiedTrackedFiles < 1) {
            executionState = "copy_failed";
          } else {
            const result = spawnSync(commandPath, commandArgs, {
              cwd: executionCwd,
              encoding: "utf8",
              env: { PATH: safePathEntries(sourceWorktree, env).join(delimiter) },
              shell: false,
              timeout: timeoutMs,
              killSignal: "SIGKILL",
              maxBuffer: 32 * 1024,
            });
            timedOut = result.error?.code === "ETIMEDOUT" || (result.signal === "SIGKILL" && result.status === null);
            exitCode = Number.isInteger(result.status) ? result.status : null;
            if (timedOut) {
              observedResponse = null;
              executionState = "timed_out";
            } else if (exitCode !== 0) {
              observedResponse = null;
              executionState = "failed";
            } else {
              observedResponse = sanitizeObservedResponse(result.stdout, result.stderr);
              if (observedResponse !== EXPECTED_RESPONSE) {
                executionState = "invalid_output";
              } else {
                executionState = "execution_observed";
              }
            }
          }
        }
      }
    } finally {
      rmSync(executionCwd, { recursive: true, force: true });
    }

    const attempt = {
      attempt_id: `copy-exec:${worker}`,
      worker,
      mode: "copied_worktree_execution",
      authority_level: "copied_worktree_worker_execution",
      execution_state: executionState,
      command_path: commandPath,
      command_args: commandArgs,
      expected_response: EXPECTED_RESPONSE,
      observed_response: observedResponse,
      exit_code: exitCode,
      timed_out: timedOut,
      timeout_ms: timeoutMs,
      observed_at: observedAt,
      evidence_ref: `metadata:worker-copied-worktree-execution/${worker}`,
      shell_used: false,
      source_worktree: sourceWorktree,
      execution_cwd: executionCwd,
      copied_tracked_files: copiedTrackedFiles,
      copy_bytes: copyBytes,
      copy_retained: false,
      network_allowed: true,
      session_inheritance_allowed: true,
      source_mutation_allowed: false,
      tools_allowed: false,
      raw_output_retained: false,
      affects_trust: false,
      affects_routing: false,
    };
    return {
      attempt,
      validation: validateCopiedWorktreeExecutionAttempt(attempt),
    };
  });
}

function main() {
  const args = process.argv.slice(2);
  const { workers, errors: workerErrors } = parseWorkers(args);
  const { timeoutMs, errors: timeoutErrors } = parseTimeoutMs(args);
  const { observedAt, errors: observedAtErrors } = parseObservedAt(args);
  const { sourceWorktree, errors: sourceWorktreeErrors } = parseSourceWorktree(args);
  const errors = [...workerErrors, ...timeoutErrors, ...observedAtErrors, ...sourceWorktreeErrors];
  const results = errors.length > 0 ? [] : collectCopiedWorktreeExecutionAttempts({ observedAt, sourceWorktree, timeoutMs, workers });
  console.log(JSON.stringify({ results, errors }, null, 2));
  process.exit(errors.length === 0 && results.every((result) => result.validation.ok) ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
