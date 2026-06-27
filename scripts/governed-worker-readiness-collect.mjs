#!/usr/bin/env node
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

import { validateToolReadinessProbe } from "./lib/governed-worker-execution-dry-run.mjs";

const DEFAULT_WORKERS = Object.freeze(["claude", "hermes"]);
const MAX_VERSION_LENGTH = 120;

function isAllowedVersionObservation(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= MAX_VERSION_LENGTH &&
    !/raw_prompt|provider_payload|authorization|bearer|token|secret|password|credential|sk-[a-z0-9_-]+/i.test(value)
  );
}

function parseVersionArgs(args) {
  const versions = new Map();
  const errors = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--version" && typeof args[index + 1] === "string") {
      const [worker, ...valueParts] = args[index + 1].split("=");
      const value = valueParts.join("=").trim();
      if (!DEFAULT_WORKERS.includes(worker)) {
        errors.push({ field: "version", reason: "unknown_worker", worker });
      } else if (!isAllowedVersionObservation(value)) {
        errors.push({ field: "version", reason: "invalid_version_observation", worker });
      } else {
        versions.set(worker, value);
      }
      index += 1;
    }
  }
  return { versions, errors };
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

function findExecutableOnPath(worker, env = process.env) {
  const pathValue = typeof env.PATH === "string" ? env.PATH : "";
  for (const pathEntry of pathValue.split(delimiter)) {
    if (!pathEntry || !isAbsolute(pathEntry)) {
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
      // Keep searching PATH entries. Missing or non-executable entries are ordinary readiness metadata.
    }
  }
  return null;
}

export function collectToolReadinessProbes({
  env = process.env,
  observedAt = new Date().toISOString(),
  versions = new Map(),
  workers = DEFAULT_WORKERS,
} = {}) {
  return workers.map((worker) => {
    const commandPath = findExecutableOnPath(worker, env);
    const commandVersion = versions.get(worker) ?? null;
    const readinessState = commandPath ? (commandVersion ? "available" : "blocked") : "missing";
    const probe = {
      probe_id: `probe:${worker}-readiness`,
      worker,
      mode: "readiness_only",
      authority_level: "non_executing",
      readiness_state: readinessState,
      command_resolution: "operator_shell_observation",
      command_path: commandPath,
      command_version: commandPath ? commandVersion : null,
      observed_at: observedAt,
      evidence_ref: `metadata:worker-readiness/${worker}`,
      network_required: false,
      session_inheritance_required: false,
      credential_access_required: false,
      raw_output_retained: false,
      affects_trust: false,
      affects_routing: false,
      launch_attempted: false,
    };
    return {
      probe,
      validation: validateToolReadinessProbe(probe),
    };
  });
}

function main() {
  const args = process.argv.slice(2);
  const { versions, errors: versionErrors } = parseVersionArgs(args);
  const { workers, errors: workerErrors } = parseWorkers(args);
  const observedAtIndex = args.indexOf("--observed-at");
  const observedAt = observedAtIndex >= 0 && typeof args[observedAtIndex + 1] === "string"
    ? args[observedAtIndex + 1]
    : new Date().toISOString();
  const results = collectToolReadinessProbes({ observedAt, versions, workers });
  const errors = [...versionErrors, ...workerErrors];
  console.log(JSON.stringify({ results, errors }, null, 2));
  process.exit(errors.length === 0 && results.every((result) => result.validation.ok) ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
