import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const EXPECTED_HERMES_PIN = Object.freeze({
  version: "v0.20.6",
  release: "v2026.8.27",
});

const READY_ACTION = "Record this readiness evidence; a later explicitly approved story is required before Hermes can receive work.";

function notReady(reasonCode, nextAction) {
  return { status: "not_ready", reason_code: reasonCode, next_action: nextAction };
}

function isContainedBy(root, candidate) {
  const segment = relative(root, candidate);
  return segment === "" || (segment !== ".." && !segment.startsWith(`..${sep}`) && !isAbsolute(segment));
}

export function parseHermesPinOutput(output) {
  if (typeof output !== "string") return null;
  const match = /^(\S+)\s*\/\s*(\S+)\s*$/.exec(output);
  if (!match) return null;
  return { version: match[1], release: match[2] };
}

function validateCodex(codex) {
  return Boolean(
    codex
    && typeof codex === "object"
    && typeof codex.cliVersion === "string"
    && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(codex.cliVersion)
    && codex.appServerCapability === "available",
  );
}

function validateHealth(health) {
  return Boolean(
    health
    && typeof health === "object"
    && health.state === "healthy"
    && health.scope === "local"
    && health.network === "disabled"
    && health.api === "disabled"
    && health.gateway === "disabled",
  );
}

function resolveIsolatedDataRoot(dataRoot, repositoryRoot, realpath, stat, getuid) {
  if (typeof dataRoot !== "string" || !isAbsolute(dataRoot)) return { ok: false, reason: "data_root_unsafe" };
  const requested = resolve(dataRoot);
  let repository;
  try {
    repository = realpath(resolve(repositoryRoot));
  } catch {
    return { ok: false, reason: "inspection_malformed" };
  }
  if (isContainedBy(repository, requested)) return { ok: false, reason: "data_root_unsafe" };
  let resolvedDataRoot;
  try {
    resolvedDataRoot = realpath(requested);
  } catch {
    return { ok: false, reason: "data_root_unavailable" };
  }
  if (typeof resolvedDataRoot !== "string" || !isAbsolute(resolvedDataRoot) || isContainedBy(repository, resolve(resolvedDataRoot))) {
    return { ok: false, reason: "data_root_unsafe" };
  }
  try {
    const metadata = stat(resolvedDataRoot);
    if (!metadata.isDirectory() || metadata.uid !== getuid() || (metadata.mode & 0o077) !== 0) return { ok: false, reason: "data_root_unsafe" };
  } catch {
    return { ok: false, reason: "data_root_unavailable" };
  }
  return { ok: true, dataRoot: resolvedDataRoot };
}

export function evaluateRuntimePreflight(inspection, { repositoryRoot, realpath = realpathSync, stat = statSync, getuid = process.getuid } = {}) {
  if (!inspection || typeof inspection !== "object" || typeof repositoryRoot !== "string" || !isAbsolute(repositoryRoot) || typeof getuid !== "function") {
    return notReady("inspection_malformed", "Supply complete local inspection facts from an isolated source; do not start Hermes.");
  }

  const hermes = parseHermesPinOutput(inspection.hermesPinOutput);
  if (!hermes) return notReady("hermes_pin_malformed", "Provide the exact pinned Hermes version and release facts; do not use a floating version.");
  if (hermes.version !== EXPECTED_HERMES_PIN.version || hermes.release !== EXPECTED_HERMES_PIN.release) {
    return notReady("hermes_pin_mismatch", "Use the approved exact Hermes pin before any later admission decision.");
  }
  if (!validateCodex(inspection.codex)) {
    return notReady("codex_incompatible", "Provide a compatible local Codex CLI and app-server capability fact; do not create a session.");
  }

  const dataRoot = resolveIsolatedDataRoot(inspection.dataRoot, repositoryRoot, realpath, stat, getuid);
  if (!dataRoot.ok) {
    return notReady(dataRoot.reason, "Select an existing isolated data root outside this repository; do not create or move state here.");
  }
  if (!validateHealth(inspection.health)) {
    return notReady("health_not_ready", "Provide a healthy local-only inspection with gateway disabled; do not admit Hermes work.");
  }

  return {
    status: "ready",
    reason_code: "ready",
    next_action: READY_ACTION,
    observed: {
      hermes: EXPECTED_HERMES_PIN,
      codex: {
        cli_version: inspection.codex.cliVersion,
        app_server_capability: inspection.codex.appServerCapability,
      },
      data_root: dataRoot.dataRoot,
      health: inspection.health.state,
    },
  };
}

function parseFactsPath(argumentsList) {
  if (argumentsList.length === 2 && argumentsList[0] === "--facts" && isAbsolute(argumentsList[1])) return argumentsList[1];
  return null;
}

function readInspection(factsPath, repositoryRoot) {
  try {
    const resolvedFactsPath = realpathSync(factsPath);
    if (isContainedBy(realpathSync(repositoryRoot), resolvedFactsPath)) return null;
    return JSON.parse(readFileSync(resolvedFactsPath, "utf8"));
  } catch {
    return null;
  }
}

function main() {
  const factsPath = parseFactsPath(process.argv.slice(2));
  const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
  const result = factsPath
    ? evaluateRuntimePreflight(readInspection(factsPath, repositoryRoot), { repositoryRoot })
    : notReady("inspection_malformed", "Pass one absolute --facts path containing complete local inspection facts; do not start Hermes.");
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status !== "ready") process.exitCode = 1;
}

if (!process.execArgv.includes("--test") && process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
