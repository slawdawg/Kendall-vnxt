import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

function findJsonFiles(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...findJsonFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".json")) files.push(path);
  }
  return files.sort();
}

function maxDuration(records) {
  const values = records.map((record) => record.metrics?.executionMs ?? record.durationMs).filter((value) => Number.isFinite(value));
  return values.length === 0 ? null : Math.max(...values);
}

function asMilliseconds(value) {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

function componentId(record) {
  return record.selectionVector?.profile ?? record.selectionVector?.shard ?? record.selectionVector?.shape ?? record.bundle ?? record.command?.join(" ") ?? "unknown";
}

function jobForRecord(record, jobs) {
  if (record.jobName) {
    return jobs.find((job) => job.name === record.jobName || job.name.startsWith(`${record.jobName} (`)) ?? null;
  }
  const vector = record.selectionVector ?? {};
  if (record.route === "baseline" && vector.id === "supervisor-elevated") return jobs.find((job) => job.name === "supervisor") ?? null;
  if (record.bundle === "workspace") return jobs.find((job) => job.name === "static_bundle (workspace)") ?? null;
  if (vector.id === "workspace-elevated" && vector.profile) {
    return jobs.find((job) => job.name.startsWith(`workspace_behavior_shadow (${vector.profile},`)) ?? null;
  }
  if (vector.id === "supervisor-elevated" && vector.shard) {
    return jobs.find((job) => job.name.startsWith(`supervisor_behavior_shadow (${vector.shard},`)) ?? null;
  }
  return null;
}

function jobMetrics(record, jobs) {
  const job = jobForRecord(record, jobs);
  const createdAtMs = asMilliseconds(job?.createdAt);
  const startedAtMs = asMilliseconds(job?.startedAt);
  const completedAtMs = asMilliseconds(job?.completedAt);
  const commandStartedAtMs = asMilliseconds(record.startedAt);
  return {
    queueMs: createdAtMs === null || startedAtMs === null ? null : Math.max(0, startedAtMs - createdAtMs),
    setupMs: startedAtMs === null || commandStartedAtMs === null ? null : Math.max(0, commandStartedAtMs - startedAtMs),
    executionMs: record.metrics?.executionMs ?? record.durationMs ?? null,
    wallMs: createdAtMs === null || completedAtMs === null ? null : Math.max(0, completedAtMs - createdAtMs),
  };
}

function status(records) {
  if (records.length === 0) return "missing";
  return records.every((record) => (record.outcome?.status ?? record.status) === "passed") ? "passed" : "failed";
}

function sourceMatches(record, source) {
  const candidate = record.source || record;
  return candidate.headSha === source.headSha && candidate.baseSha === source.baseSha &&
    (!candidate.lockfileSha || candidate.lockfileSha === source.lockfileSha) &&
    (!candidate.environmentId || candidate.environmentId === source.environmentId);
}

function cacheControl(records) {
  const controls = records.map((record) => record.cacheControl).filter((control) => control && typeof control === "object");
  if (controls.length === 0) return { strategy: "observed" };
  const [first] = controls;
  if (first.strategy === "isolated" && first.cacheKey && controls.every((control) => control.strategy === "isolated" && control.cacheKey === first.cacheKey)) {
    return { strategy: "isolated", cacheKey: first.cacheKey };
  }
  if (first.strategy === "counterbalanced" && first.cacheState && controls.every((control) => control.strategy === "counterbalanced" && control.cacheState === first.cacheState)) {
    return { strategy: "counterbalanced", cacheState: first.cacheState };
  }
  return { strategy: "observed" };
}

function routeSummary(records, jobs) {
  const components = records.map((record) => ({
    id: componentId(record),
    status: record.outcome?.status ?? record.status ?? "unknown",
    metrics: jobMetrics(record, jobs),
    command: record.command ?? null,
  }));
  return {
    status: status(records),
    componentCount: records.length,
    metrics: Object.fromEntries(["queueMs", "setupMs", "executionMs", "wallMs"].map((metric) => [
      metric,
      maxDuration(components.map((component) => ({ durationMs: component.metrics[metric] }))),
    ])),
    outcome: {
      status: status(records),
      failureId: [...new Set(records.map((record) => record.outcome?.failureId).filter(Boolean))].length === 1
        ? records.find((record) => record.outcome?.failureId)?.outcome.failureId
        : null,
      retryCount: records.reduce((total, record) => total + (Number.isInteger(record.outcome?.retryCount) ? record.outcome.retryCount : 0), 0),
      flake: records.some((record) => record.outcome?.flake === true),
    },
    firstActionableFailureMs: (() => {
      const values = records.map((record) => record.metrics?.firstActionableFailureMs).filter(Number.isFinite);
      return values.length === 0 ? null : Math.min(...values);
    })(),
    components,
  };
}

export function collectCiPromotionObservations({ reportsDir, pairId, source, cohort = "ordinary", generatedAt = new Date().toISOString() }) {
  if (!["ordinary", "controlled_failure"].includes(cohort)) throw new Error(`Unsupported evidence cohort ${cohort}`);
  const warnings = [];
  const records = [];
  for (const path of findJsonFiles(reportsDir)) {
    try {
      const record = JSON.parse(readFileSync(path, "utf8"));
      if (record?.schemaVersion === 1) records.push({ ...record, reportPath: path });
      else warnings.push(`Ignored unsupported evidence report ${path}`);
    } catch (error) {
      warnings.push(`Could not parse ${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const commandRecords = records.filter((record) => record.recordType === "ci-command-evidence");
  const observedCacheControl = cacheControl(commandRecords);
  const timingRecord = records.find((record) => record.recordType === "github-job-timings");
  const jobs = Array.isArray(timingRecord?.jobs) ? timingRecord.jobs : [];
  const vectors = [];
  for (const vectorId of ["supervisor-elevated", "workspace-elevated"]) {
    const vectorRecords = commandRecords.filter((record) => record.selectionVector?.id === vectorId);
    const baseline = vectorRecords.filter((record) => record.route === "baseline");
    const proposed = vectorRecords.filter((record) => record.route === "proposed");
    if (vectorId === "workspace-elevated") {
      baseline.push(...records.filter((record) => record.bundle === "workspace"));
    }
    if (baseline.length === 0 && proposed.length === 0) continue;
    const mismatched = [...baseline, ...proposed].filter((record) => !sourceMatches(record, source));
    if (mismatched.length > 0) warnings.push(`${vectorId}: ${mismatched.length} record(s) did not match the requested source identity`);
    vectors.push({
      id: vectorId,
      sourceMatched: mismatched.length === 0,
      baseline: routeSummary(baseline, jobs),
      proposed: routeSummary(proposed, jobs),
      readyForPromotion: false,
      blockingReason: observedCacheControl.strategy === "isolated" || observedCacheControl.strategy === "counterbalanced"
        ? "Evidence collection is complete but remains non-authoritative until the promotion evaluator accepts the required sample count and duration gates."
        : "Observed-cache command evidence is a raw same-head observation, not a counterbalanced or isolated promotion sample.",
    });
  }
  return {
    schemaVersion: 1,
    recordType: "ci-promotion-observation",
    generatedAt,
    pairId,
    cohort,
    source,
    cacheControl: observedCacheControl,
    vectors,
    warnings,
  };
}

export function parseObservationArgs(argv) {
  const options = { reportsDir: null, out: null, pairId: null, headSha: null, baseSha: null, lockfileSha: null, environmentId: null, cohort: "ordinary" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    const names = {
      "--reports-dir": "reportsDir", "--out": "out", "--pair-id": "pairId", "--head-sha": "headSha",
      "--base-sha": "baseSha", "--lockfile-sha": "lockfileSha", "--environment-id": "environmentId", "--cohort": "cohort",
    };
    const key = names[arg];
    if (!key) throw new Error(`Unknown option ${arg}`);
    if (!value) throw new Error(`Missing value for ${arg}`);
    options[key] = value;
    index += 1;
  }
  for (const [key, value] of Object.entries(options)) if (!value) throw new Error(`Missing --${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
  if (!["ordinary", "controlled_failure"].includes(options.cohort)) throw new Error("--cohort must be ordinary or controlled_failure");
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseObservationArgs(process.argv.slice(2));
    const observation = collectCiPromotionObservations({
      reportsDir: options.reportsDir,
      pairId: options.pairId,
      cohort: options.cohort,
      source: { headSha: options.headSha, baseSha: options.baseSha, lockfileSha: options.lockfileSha, environmentId: options.environmentId },
    });
    mkdirSync(dirname(options.out), { recursive: true });
    writeFileSync(options.out, `${JSON.stringify(observation, null, 2)}\n`);
    console.log(JSON.stringify(observation, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
