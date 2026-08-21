import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

function findJsonFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findJsonFiles(path);
    return entry.isFile() && entry.name.endsWith(".json") ? [path] : [];
  }).sort();
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function sampleFromRoute({ observation, vector, member }) {
  const route = vector[member];
  const metrics = route?.metrics ?? {};
  return {
    schemaVersion: 1,
    cohort: observation.cohort,
    member,
    pairId: observation.pairId,
    recordedAt: observation.generatedAt,
    selectionVector: { id: vector.id },
    source: observation.source,
    cacheControl: observation.cacheControl,
    metrics: {
      queueMs: metrics.queueMs,
      setupMs: metrics.setupMs,
      executionMs: metrics.executionMs,
      wallMs: metrics.wallMs,
      firstActionableFailureMs: route?.firstActionableFailureMs ?? null,
    },
    outcome: {
      status: route?.outcome?.status ?? route?.status,
      failureId: route?.outcome?.failureId ?? null,
      retryCount: route?.outcome?.retryCount ?? 0,
      flake: route?.outcome?.flake === true,
    },
  };
}

export function buildPromotionEvidencePacket(observations) {
  const selectionVectors = new Map();
  const samples = [];
  const warnings = [];
  for (const observation of observations) {
    if (observation?.schemaVersion !== 1 || observation.recordType !== "ci-promotion-observation") {
      warnings.push("Ignored unsupported promotion observation");
      continue;
    }
    for (const vector of observation.vectors ?? []) {
      if (typeof vector?.id !== "string" || !vector.sourceMatched) {
        warnings.push(`Ignored unbound promotion vector ${vector?.id ?? "unknown"}`);
        continue;
      }
      selectionVectors.set(vector.id, { id: vector.id });
      const baseline = sampleFromRoute({ observation, vector, member: "baseline" });
      const proposed = sampleFromRoute({ observation, vector, member: "proposed" });
      const missing = [baseline, proposed].some((sample) =>
        !["passed", "failed"].includes(sample.outcome.status) ||
        ["queueMs", "setupMs", "executionMs", "wallMs"].some((metric) => !finite(sample.metrics[metric])),
      );
      if (missing) {
        warnings.push(`${vector.id}/${observation.pairId}: incomplete timing or outcome evidence`);
        continue;
      }
      samples.push(baseline, proposed);
    }
  }
  return { schemaVersion: 1, selectionVectors: [...selectionVectors.values()], samples, warnings };
}

export function buildPromotionEvidencePacketFromDirectory(directory) {
  const observations = [];
  for (const path of findJsonFiles(directory)) {
    try {
      observations.push(JSON.parse(readFileSync(path, "utf8")));
    } catch {
      observations.push(null);
    }
  }
  return buildPromotionEvidencePacket(observations);
}

function parseArgs(argv) {
  if (argv.length !== 4 || argv[0] !== "--observations-dir" || argv[2] !== "--out") {
    throw new Error("Usage: node ./scripts/build-ci-promotion-evidence-packet.mjs --observations-dir <directory> --out <packet.json>");
  }
  return { observationsDir: argv[1], out: argv[3] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const packet = buildPromotionEvidencePacketFromDirectory(options.observationsDir);
    writeFileSync(options.out, `${JSON.stringify(packet, null, 2)}\n`);
    console.log(JSON.stringify(packet, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
