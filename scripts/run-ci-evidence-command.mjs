import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

function requireValue(value, option) {
  if (!value) throw new Error(`Missing ${option}`);
  return value;
}

export function parseCiEvidenceCommandArgs(argv) {
  const options = {
    reportPath: null,
    route: null,
    cohort: "ordinary",
    selectionVector: null,
    headSha: null,
    baseSha: null,
    lockfileSha: null,
    environmentId: null,
    cacheStrategy: "observed",
    cacheKey: null,
    injectedFailureId: null,
    command: [],
  };

  let index = 0;
  for (; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      options.command = argv.slice(index + 1);
      break;
    }
    const value = argv[index + 1];
    const set = (key) => {
      options[key] = requireValue(value, arg);
      index += 1;
    };
    if (arg === "--report") set("reportPath");
    else if (arg === "--route") set("route");
    else if (arg === "--cohort") set("cohort");
    else if (arg === "--selection-vector") {
      try {
        options.selectionVector = JSON.parse(requireValue(value, arg));
      } catch {
        throw new Error("--selection-vector must be valid JSON");
      }
      index += 1;
    } else if (arg === "--head-sha") set("headSha");
    else if (arg === "--base-sha") set("baseSha");
    else if (arg === "--lockfile-sha") set("lockfileSha");
    else if (arg === "--environment-id") set("environmentId");
    else if (arg === "--cache-strategy") set("cacheStrategy");
    else if (arg === "--cache-key") set("cacheKey");
    else if (arg === "--inject-failure-id") set("injectedFailureId");
    else throw new Error(`Unknown option ${arg}`);
  }

  requireValue(options.reportPath, "--report");
  if (!["baseline", "proposed"].includes(options.route)) throw new Error("--route must be baseline or proposed");
  if (!["ordinary", "controlled_failure"].includes(options.cohort)) throw new Error("--cohort must be ordinary or controlled_failure");
  if (!options.selectionVector || typeof options.selectionVector.id !== "string" || options.selectionVector.id.length === 0) {
    throw new Error("--selection-vector must include a non-empty id");
  }
  for (const key of ["headSha", "baseSha", "lockfileSha", "environmentId", "cacheKey"]) requireValue(options[key], `--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
  if (!["observed", "isolated", "counterbalanced"].includes(options.cacheStrategy)) throw new Error("--cache-strategy must be observed, isolated, or counterbalanced");
  if (options.command.length === 0) throw new Error("A command is required after --");
  return options;
}

export function buildCiCommandEvidence({
  route,
  cohort,
  selectionVector,
  source,
  cacheStrategy,
  cacheKey,
  injectedFailureId = null,
  command,
  startedAtMs,
  completedAtMs,
  exitCode,
  signal,
}) {
  const injected = exitCode === 0 && Boolean(injectedFailureId);
  const status = exitCode === 0 && !injected ? "passed" : "failed";
  const durationMs = Math.max(0, completedAtMs - startedAtMs);
  return {
    schemaVersion: 1,
    recordType: "ci-command-evidence",
    route,
    cohort,
    selectionVector,
    source,
    cacheControl: { strategy: cacheStrategy, cacheKey },
    command,
    startedAt: new Date(startedAtMs).toISOString(),
    completedAt: new Date(completedAtMs).toISOString(),
    metrics: {
      executionMs: durationMs,
      firstActionableFailureMs: status === "failed" ? durationMs : null,
    },
    outcome: {
      status,
      exitCode: injected ? 1 : (typeof exitCode === "number" ? exitCode : null),
      signal: signal ?? null,
      failureId: injectedFailureId,
      injected,
    },
  };
}

export function writeCiCommandEvidence(path, evidence) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`);
}

export function runCiEvidenceCommand(options) {
  const startedAtMs = Date.now();
  const [command, ...args] = options.command;
  console.log(`[ci-evidence] ${options.route}/${options.selectionVector.id}: ${options.command.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  const evidence = buildCiCommandEvidence({
    route: options.route,
    cohort: options.cohort,
    selectionVector: options.selectionVector,
    source: {
      headSha: options.headSha,
      baseSha: options.baseSha,
      lockfileSha: options.lockfileSha,
      environmentId: options.environmentId,
    },
    cacheStrategy: options.cacheStrategy,
    cacheKey: options.cacheKey,
    injectedFailureId: options.injectedFailureId,
    command: options.command,
    startedAtMs,
    completedAtMs: Date.now(),
    exitCode: result.status,
    signal: result.signal,
  });
  writeCiCommandEvidence(options.reportPath, evidence);
  console.log(`[ci-evidence] ${evidence.outcome.status} in ${(evidence.metrics.executionMs / 1000).toFixed(1)}s; report=${options.reportPath}`);
  if (result.error) throw result.error;
  return evidence;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseCiEvidenceCommandArgs(process.argv.slice(2));
    const evidence = runCiEvidenceCommand(options);
    if (evidence.outcome.status !== "passed") process.exitCode = evidence.outcome.exitCode ?? 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
