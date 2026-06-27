#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { accessSync, constants, mkdirSync, mkdtempSync, realpathSync, rmSync, statSync } from "node:fs";
import { delimiter, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_WORKERS = Object.freeze(["claude", "hermes"]);
const SUPPORTED_SMOKE_WORKERS = new Set(["claude"]);
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_TIMEOUT_MS = 10000;
const SAFE_TMP_ROOT = "/tmp";
const SAFE_CWD_PREFIX = join(SAFE_TMP_ROOT, "kendall-worker-smoke-");
const EXPECTED_RESPONSE = "KENDALL_SMOKE_OK";
const SMOKE_PROMPT = `Reply exactly with ${EXPECTED_RESPONSE}. Do not explain.`;
const RAW_MARKER_PATTERN = /raw_prompt|provider_payload|authorization|bearer|token|secret|password|credential|sk-[a-z0-9_-]+/i;

const CLAUDE_SMOKE_ARGS = Object.freeze([
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
  SMOKE_PROMPT,
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
  "safe_cwd",
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
  const errors = unknownWorkers.map((worker) => ({ field: "workers", reason: "unknown_worker", worker }));
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

function isUnsafePathEntry(pathEntry, env = process.env) {
  const cwd = realpathSync(typeof env.PWD === "string" ? resolve(env.PWD) : process.cwd());
  const entry = realpathSync(resolve(pathEntry));
  const relativeToCwd = relative(cwd, entry);
  return relativeToCwd === "" || (!relativeToCwd.startsWith("..") && !isAbsolute(relativeToCwd));
}

function safePathEntries(env = process.env) {
  const pathValue = typeof env.PATH === "string" ? env.PATH : "";
  return pathValue.split(delimiter).filter((pathEntry) => {
    if (!pathEntry || !isAbsolute(pathEntry)) {
      return false;
    }
    try {
      return !isUnsafePathEntry(pathEntry, env);
    } catch {
      return false;
    }
  });
}

function findExecutableOnPath(worker, env = process.env) {
  for (const pathEntry of safePathEntries(env)) {
    const candidate = join(pathEntry, worker);
    try {
      const stats = statSync(candidate);
      if (!stats.isFile()) {
        continue;
      }
      if (isUnsafePathEntry(realpathSync(candidate), env)) {
        continue;
      }
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Missing or non-executable PATH candidates are ordinary smoke metadata.
    }
  }
  return null;
}

function createSafeCwd() {
  mkdirSync(SAFE_TMP_ROOT, { recursive: true });
  return mkdtempSync(SAFE_CWD_PREFIX);
}

function isSafeSmokeCwdPath(value) {
  if (typeof value !== "string" || !value.startsWith(SAFE_CWD_PREFIX)) {
    return false;
  }
  const suffix = value.slice(SAFE_CWD_PREFIX.length);
  return /^[A-Za-z0-9]+$/.test(suffix);
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
    if (RAW_MARKER_PATTERN.test(combined)) {
      return null;
    }
    const line = combined.split(/\r?\n/).map((value) => value.trim()).find(Boolean) ?? null;
    return line === EXPECTED_RESPONSE ? line : null;
  }
}

function commandArgsFor(worker) {
  if (worker === "claude") {
    return [...CLAUDE_SMOKE_ARGS];
  }
  return [];
}

export function validateSmokeExecutionAttempt(attempt) {
  const input = isRecord(attempt) ? attempt : {};
  const field_reasons = [];
  const addReason = (field, reason = "invalid_smoke_execution_attempt") => {
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
  if (input.mode !== "smoke_execution") {
    addReason("mode");
  }
  if (input.authority_level !== "isolated_worker_smoke") {
    addReason("authority_level");
  }
  if (!["missing", "unsupported", "smoke_observed", "failed", "timed_out", "invalid_output"].includes(input.execution_state)) {
    addReason("execution_state");
  }
  if (!Number.isFinite(Date.parse(input.observed_at))) {
    addReason("observed_at");
  }
  if (input.evidence_ref !== `metadata:worker-smoke-execution/${input.worker}`) {
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
    if (input.command_args.join("\u0000") !== CLAUDE_SMOKE_ARGS.join("\u0000")) {
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
  if (!isSafeSmokeCwdPath(input.safe_cwd)) {
    addReason("safe_cwd");
  }
  for (const [field, expected] of [
    ["shell_used", false],
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
  if (
    Object.entries(input).some(([key, value]) => {
      return !ALLOWED_ATTEMPT_FIELDS.has(key) || hasRawMarkerInObject(value);
    })
  ) {
    addReason("$");
  }
  if (input.execution_state === "smoke_observed" && (input.observed_response !== EXPECTED_RESPONSE || input.exit_code !== 0 || input.timed_out !== false || input.command_path === null)) {
    addReason("execution_state");
  }
  if (["missing", "unsupported"].includes(input.execution_state) && (input.command_path !== null || input.observed_response !== null || input.exit_code !== null || input.timed_out !== false)) {
    addReason("execution_state");
  }

  return {
    ok: field_reasons.length === 0,
    attempt_id: typeof input.attempt_id === "string" && !RAW_MARKER_PATTERN.test(input.attempt_id) ? input.attempt_id : null,
    worker: DEFAULT_WORKERS.includes(input.worker) ? input.worker : null,
    mode: input.mode === "smoke_execution" ? input.mode : null,
    authority_level: input.authority_level === "isolated_worker_smoke" ? input.authority_level : null,
    execution_state: typeof input.execution_state === "string" && !RAW_MARKER_PATTERN.test(input.execution_state) ? input.execution_state : null,
    evidence_ref: typeof input.evidence_ref === "string" && !RAW_MARKER_PATTERN.test(input.evidence_ref) ? input.evidence_ref : null,
    denied_reasons: [...new Set(field_reasons.map((reason) => reason.reason))],
    field_reasons,
  };
}

export function collectSmokeExecutionAttempts({
  env = process.env,
  observedAt = new Date().toISOString(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  workers = DEFAULT_WORKERS,
} = {}) {
  return workers.map((worker) => {
    const workerAllowed = DEFAULT_WORKERS.includes(worker);
    const smokeSupported = SUPPORTED_SMOKE_WORKERS.has(worker);
    const commandPath = workerAllowed && smokeSupported ? findExecutableOnPath(worker, env) : null;
    const commandArgs = commandPath ? commandArgsFor(worker) : [];
    const safeCwd = createSafeCwd();
    let executionState = smokeSupported ? "missing" : "unsupported";
    let exitCode = null;
    let timedOut = false;
    let observedResponse = null;

    if (commandPath) {
      try {
        const result = spawnSync(commandPath, commandArgs, {
          cwd: safeCwd,
          encoding: "utf8",
          env: { PATH: safePathEntries(env).join(delimiter) },
          shell: false,
          timeout: timeoutMs,
          killSignal: "SIGKILL",
          maxBuffer: 32 * 1024,
        });
        timedOut = result.error?.code === "ETIMEDOUT" || (result.signal === "SIGKILL" && result.status === null);
        exitCode = Number.isInteger(result.status) ? result.status : null;
        observedResponse = sanitizeObservedResponse(result.stdout, result.stderr);
        if (timedOut) {
          executionState = "timed_out";
        } else if (exitCode !== 0) {
          executionState = "failed";
        } else if (observedResponse !== EXPECTED_RESPONSE) {
          executionState = "invalid_output";
        } else {
          executionState = "smoke_observed";
        }
      } finally {
        rmSync(safeCwd, { recursive: true, force: true });
      }
    } else {
      rmSync(safeCwd, { recursive: true, force: true });
    }

    const attempt = {
      attempt_id: `smoke:${worker}`,
      worker,
      mode: "smoke_execution",
      authority_level: "isolated_worker_smoke",
      execution_state: executionState,
      command_path: commandPath,
      command_args: commandArgs,
      expected_response: EXPECTED_RESPONSE,
      observed_response: observedResponse,
      exit_code: exitCode,
      timed_out: timedOut,
      timeout_ms: timeoutMs,
      observed_at: observedAt,
      evidence_ref: `metadata:worker-smoke-execution/${worker}`,
      shell_used: false,
      safe_cwd: safeCwd,
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
      validation: validateSmokeExecutionAttempt(attempt),
    };
  });
}

function main() {
  const args = process.argv.slice(2);
  const { workers, errors: workerErrors } = parseWorkers(args);
  const { timeoutMs, errors: timeoutErrors } = parseTimeoutMs(args);
  const { observedAt, errors: observedAtErrors } = parseObservedAt(args);
  const errors = [...workerErrors, ...timeoutErrors, ...observedAtErrors];
  const results = errors.length > 0 ? [] : collectSmokeExecutionAttempts({ observedAt, timeoutMs, workers });
  console.log(JSON.stringify({ results, errors }, null, 2));
  process.exit(errors.length === 0 && results.every((result) => result.validation.ok) ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
