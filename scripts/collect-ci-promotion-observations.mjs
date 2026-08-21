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

function routeSummary(records) {
  return {
    status: status(records),
    componentCount: records.length,
    executionMs: maxDuration(records),
    components: records.map((record) => ({
      id: record.selectionVector?.profile ?? record.selectionVector?.shard ?? record.selectionVector?.shape ?? record.bundle ?? record.command?.join(" ") ?? "unknown",
      status: record.outcome?.status ?? record.status ?? "unknown",
      executionMs: record.metrics?.executionMs ?? record.durationMs ?? null,
      command: record.command ?? null,
    })),
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
      baseline: routeSummary(baseline),
      proposed: routeSummary(proposed),
      readyForPromotion: false,
      blockingReason: "Observed-cache command evidence is a raw same-head observation, not a counterbalanced or isolated promotion sample.",
    });
  }
  return {
    schemaVersion: 1,
    recordType: "ci-promotion-observation",
    generatedAt,
    pairId,
    cohort,
    source,
    cacheControl: { strategy: "observed" },
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
