#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_WORKERS = Object.freeze(["claude", "hermes"]);
const MAX_VERSION_LENGTH = 120;
const DEFAULT_TIMEOUT_MS = 3000;
const SAFE_PROBE_CWD = "/tmp";
const VERSION_ARGS = Object.freeze(["--version"]);
const RAW_MARKER_PATTERN = /raw_prompt|provider_payload|authorization|bearer|token|secret|password|credential|sk-[a-z0-9_-]+/i;
const ALLOWED_ATTEMPT_FIELDS = new Set([
  "probe_id",
  "worker",
  "mode",
  "authority_level",
  "probe_state",
  "command_path",
  "command_args",
  "command_version",
  "exit_code",
  "timed_out",
  "timeout_ms",
  "observed_at",
  "evidence_ref",
  "shell_used",
  "task_execution_allowed",
  "network_required",
  "safe_cwd",
  "source_mutation_allowed",
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
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > DEFAULT_TIMEOUT_MS) {
    return { timeoutMs: DEFAULT_TIMEOUT_MS, errors: [{ field: "timeout_ms", reason: "invalid_timeout" }] };
  }
  return { timeoutMs, errors: [] };
}

function isUnsafePathEntry(pathEntry, env = process.env) {
  const cwd = typeof env.PWD === "string" ? resolve(env.PWD) : process.cwd();
  const entry = resolve(pathEntry);
  return entry === cwd || entry.startsWith(`${cwd}/`);
}

function findExecutableOnPath(worker, env = process.env) {
  const pathValue = typeof env.PATH === "string" ? env.PATH : "";
  for (const pathEntry of pathValue.split(delimiter)) {
    if (!pathEntry || !isAbsolute(pathEntry) || isUnsafePathEntry(pathEntry, env)) {
      continue;
    }
    const candidate = join(pathEntry, worker);
    try {
      const stats = statSync(candidate);
      if (!stats.isFile()) {
        continue;
      }
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Missing or non-executable PATH candidates are ordinary version-probe metadata.
    }
  }
  return null;
}

function sanitizeVersionOutput(stdout, stderr) {
  const combined = [stdout, stderr]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .join("\n");
  if (RAW_MARKER_PATTERN.test(combined)) {
    return null;
  }
  const firstLine = combined.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null;
  if (firstLine === null || firstLine.length > MAX_VERSION_LENGTH) {
    return null;
  }
  return firstLine;
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

export function validateToolVersionProbeAttempt(attempt) {
  const input = isRecord(attempt) ? attempt : {};
  const field_reasons = [];
  const addReason = (field, reason = "invalid_tool_version_probe_attempt") => {
    field_reasons.push({ field, reason });
  };

  if (!isRecord(attempt)) {
    addReason("$");
  }

  for (const field of ["probe_id", "worker", "mode", "authority_level", "probe_state", "observed_at", "evidence_ref"]) {
    if (typeof input[field] !== "string" || input[field].trim().length === 0 || RAW_MARKER_PATTERN.test(input[field])) {
      addReason(field);
    }
  }
  if (!DEFAULT_WORKERS.includes(input.worker)) {
    addReason("worker");
  }
  if (input.mode !== "version_probe") {
    addReason("mode");
  }
  if (input.authority_level !== "worker_version_probe") {
    addReason("authority_level");
  }
  if (!["missing", "version_observed", "failed", "timed_out", "invalid_output"].includes(input.probe_state)) {
    addReason("probe_state");
  }
  if (!Number.isFinite(Date.parse(input.observed_at))) {
    addReason("observed_at");
  }
  if (input.evidence_ref !== `metadata:worker-version-probe/${input.worker}`) {
    addReason("evidence_ref");
  }
  if (input.command_path !== null) {
    if (typeof input.command_path !== "string" || !input.command_path.startsWith("/") || input.command_path.split("/").at(-1) !== input.worker) {
      addReason("command_path");
    }
  }
  if (!Array.isArray(input.command_args) || input.command_args.length !== 1 || input.command_args[0] !== "--version") {
    addReason("command_args");
  }
  if (!Number.isInteger(input.timeout_ms) || input.timeout_ms < 100 || input.timeout_ms > DEFAULT_TIMEOUT_MS) {
    addReason("timeout_ms");
  }
  if (input.exit_code !== null && !Number.isInteger(input.exit_code)) {
    addReason("exit_code");
  }
  if (input.safe_cwd !== SAFE_PROBE_CWD) {
    addReason("safe_cwd");
  }
  if (typeof input.timed_out !== "boolean") {
    addReason("timed_out");
  }
  if (input.command_version !== null) {
    if (typeof input.command_version !== "string" || input.command_version.length > MAX_VERSION_LENGTH || RAW_MARKER_PATTERN.test(input.command_version)) {
      addReason("command_version");
    }
  }
  for (const [field, expected] of [
    ["shell_used", false],
    ["task_execution_allowed", false],
    ["network_required", false],
    ["source_mutation_allowed", false],
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
  if (input.probe_state === "missing" && (input.command_path !== null || input.command_version !== null || input.exit_code !== null || input.timed_out !== false)) {
    addReason("probe_state");
  }
  if (input.probe_state === "version_observed" && (typeof input.command_path !== "string" || typeof input.command_version !== "string" || input.exit_code !== 0 || input.timed_out !== false)) {
    addReason("probe_state");
  }

  return {
    ok: field_reasons.length === 0,
    probe_id: typeof input.probe_id === "string" && !RAW_MARKER_PATTERN.test(input.probe_id) ? input.probe_id : null,
    worker: DEFAULT_WORKERS.includes(input.worker) ? input.worker : null,
    mode: input.mode === "version_probe" ? input.mode : null,
    authority_level: input.authority_level === "worker_version_probe" ? input.authority_level : null,
    probe_state: typeof input.probe_state === "string" && !RAW_MARKER_PATTERN.test(input.probe_state) ? input.probe_state : null,
    evidence_ref: typeof input.evidence_ref === "string" && !RAW_MARKER_PATTERN.test(input.evidence_ref) ? input.evidence_ref : null,
    denied_reasons: [...new Set(field_reasons.map((reason) => reason.reason))],
    field_reasons,
  };
}

export function collectToolVersionProbeAttempts({
  env = process.env,
  observedAt = new Date().toISOString(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  workers = DEFAULT_WORKERS,
} = {}) {
  return workers.map((worker) => {
    const workerAllowed = DEFAULT_WORKERS.includes(worker);
    const commandPath = workerAllowed ? findExecutableOnPath(worker, env) : null;
    let probeState = "missing";
    let exitCode = null;
    let timedOut = false;
    let commandVersion = null;

    if (commandPath) {
      const result = spawnSync(commandPath, VERSION_ARGS, {
        cwd: SAFE_PROBE_CWD,
        encoding: "utf8",
        env: { PATH: typeof env.PATH === "string" ? env.PATH : "" },
        shell: false,
        timeout: timeoutMs,
        killSignal: "SIGKILL",
        maxBuffer: 16 * 1024,
      });
      timedOut = result.error?.code === "ETIMEDOUT" || (result.signal === "SIGKILL" && result.status === null);
      exitCode = Number.isInteger(result.status) ? result.status : null;
      commandVersion = sanitizeVersionOutput(result.stdout, result.stderr);
      if (timedOut) {
        probeState = "timed_out";
      } else if (exitCode !== 0) {
        probeState = "failed";
      } else if (commandVersion === null) {
        probeState = "invalid_output";
      } else {
        probeState = "version_observed";
      }
    }

    const attempt = {
      probe_id: `probe:${worker}-version`,
      worker,
      mode: "version_probe",
      authority_level: "worker_version_probe",
      probe_state: probeState,
      command_path: commandPath,
      command_args: [...VERSION_ARGS],
      command_version: commandVersion,
      exit_code: exitCode,
      timed_out: timedOut,
      timeout_ms: timeoutMs,
      observed_at: observedAt,
      evidence_ref: `metadata:worker-version-probe/${worker}`,
      shell_used: false,
      task_execution_allowed: false,
      network_required: false,
      safe_cwd: SAFE_PROBE_CWD,
      source_mutation_allowed: false,
      raw_output_retained: false,
      affects_trust: false,
      affects_routing: false,
    };
    return {
      attempt,
      validation: validateToolVersionProbeAttempt(attempt),
    };
  });
}

function main() {
  const args = process.argv.slice(2);
  const { workers, errors: workerErrors } = parseWorkers(args);
  const { timeoutMs, errors: timeoutErrors } = parseTimeoutMs(args);
  const { observedAt, errors: observedAtErrors } = parseObservedAt(args);
  const errors = [...workerErrors, ...timeoutErrors, ...observedAtErrors];
  const results = errors.length > 0 ? [] : collectToolVersionProbeAttempts({ observedAt, timeoutMs, workers });
  console.log(JSON.stringify({ results, errors }, null, 2));
  process.exit(errors.length === 0 && results.every((result) => result.validation.ok) ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
