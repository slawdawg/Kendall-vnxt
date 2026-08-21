import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DURATION_METRICS = Object.freeze(["queueMs", "setupMs", "executionMs", "wallMs"]);
const COHORTS = Object.freeze(["ordinary", "controlled_failure"]);
const MEMBERS = Object.freeze(["baseline", "proposed"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteDuration(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function sameSourceIdentity(baseline, proposed) {
  const fields = ["headSha", "baseSha", "lockfileSha", "environmentId"];
  return fields.every((field) => baseline.source?.[field] && baseline.source[field] === proposed.source?.[field]);
}

function sameCacheControl(baseline, proposed) {
  const baselineControl = baseline.cacheControl;
  const proposedControl = proposed.cacheControl;
  if (!isRecord(baselineControl) || !isRecord(proposedControl)) return false;
  if (baselineControl.strategy === "isolated" &&
    proposedControl.strategy === "isolated" &&
    baselineControl.cacheKey &&
    baselineControl.cacheKey === proposedControl.cacheKey) return true;
  return baselineControl.strategy === "counterbalanced" &&
    proposedControl.strategy === "counterbalanced" &&
    baselineControl.order !== proposedControl.order &&
    Boolean(baselineControl.cacheState) && baselineControl.cacheState === proposedControl.cacheState;
}

function utcDay(value) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString().slice(0, 10);
}

function rate(count, denominator) {
  return denominator === 0 ? null : count / denominator;
}

export function nearestRankPercentile(values, percentile) {
  const sorted = values.filter(finiteDuration).sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const index = Math.max(0, Math.ceil(percentile * sorted.length) - 1);
  return Math.round(sorted[index]);
}

function summarizeMember(samples) {
  const summary = {
    count: samples.length,
    failures: samples.filter((sample) => sample.outcome?.status === "failed").length,
    flakes: samples.filter((sample) => sample.outcome?.flake === true).length,
    retries: samples.reduce((total, sample) => total + (Number.isInteger(sample.outcome?.retryCount) ? sample.outcome.retryCount : 0), 0),
    metrics: {},
    firstActionableFailureP95Ms: null,
  };
  for (const metric of DURATION_METRICS) {
    summary.metrics[metric] = {
      p50Ms: nearestRankPercentile(samples.map((sample) => sample.metrics?.[metric]), 0.5),
      p95Ms: nearestRankPercentile(samples.map((sample) => sample.metrics?.[metric]), 0.95),
    };
  }
  summary.firstActionableFailureP95Ms = nearestRankPercentile(
    samples.filter((sample) => sample.outcome?.status === "failed").map((sample) => sample.metrics?.firstActionableFailureMs),
    0.95,
  );
  summary.failureRate = rate(summary.failures, summary.count);
  summary.flakeRate = rate(summary.flakes, summary.count);
  summary.retryRate = rate(summary.retries, summary.count);
  return summary;
}

function validateSampleShape(sample, index, failures) {
  const prefix = `sample ${index + 1}`;
  if (!isRecord(sample)) {
    failures.push(`${prefix}: must be an object`);
    return;
  }
  if (sample.schemaVersion !== 1) failures.push(`${prefix}: schemaVersion must be 1`);
  if (!COHORTS.includes(sample.cohort)) failures.push(`${prefix}: cohort must be ordinary or controlled_failure`);
  if (!MEMBERS.includes(sample.member)) failures.push(`${prefix}: member must be baseline or proposed`);
  if (typeof sample.pairId !== "string" || sample.pairId.length === 0) failures.push(`${prefix}: pairId is required`);
  if (typeof sample.selectionVector?.id !== "string" || sample.selectionVector.id.length === 0) failures.push(`${prefix}: selectionVector.id is required`);
  if (utcDay(sample.recordedAt) === null) failures.push(`${prefix}: recordedAt must be an ISO timestamp`);
  for (const field of ["headSha", "baseSha", "lockfileSha", "environmentId"]) {
    if (typeof sample.source?.[field] !== "string" || sample.source[field].length === 0) failures.push(`${prefix}: source.${field} is required`);
  }
  for (const metric of DURATION_METRICS) {
    if (!finiteDuration(sample.metrics?.[metric])) failures.push(`${prefix}: metrics.${metric} must be a non-negative finite number`);
  }
  if (sample.metrics?.firstActionableFailureMs !== null && sample.metrics?.firstActionableFailureMs !== undefined && !finiteDuration(sample.metrics.firstActionableFailureMs)) {
    failures.push(`${prefix}: metrics.firstActionableFailureMs must be null or a non-negative finite number`);
  }
  if (!isRecord(sample.outcome) || !["passed", "failed"].includes(sample.outcome.status)) failures.push(`${prefix}: outcome.status must be passed or failed`);
  if (!Number.isInteger(sample.outcome?.retryCount) || sample.outcome.retryCount < 0) failures.push(`${prefix}: outcome.retryCount must be a non-negative integer`);
}

function memberMetricsMeetBudget(baseline, proposed, failures, label) {
  for (const metric of DURATION_METRICS) {
    const baselineP95 = baseline.metrics[metric].p95Ms;
    const proposedP95 = proposed.metrics[metric].p95Ms;
    if (baselineP95 === null || proposedP95 === null) {
      failures.push(`${label}: missing ${metric} P95 evidence`);
      continue;
    }
    if (proposedP95 > Math.round(baselineP95 * 1.1)) {
      failures.push(`${label}: ${metric} P95 regressed from ${baselineP95}ms to ${proposedP95}ms (more than 10%)`);
    }
  }
}

function firstFailureNoSlower(baseline, proposed, failures, label) {
  const baselineP95 = baseline.firstActionableFailureP95Ms;
  const proposedP95 = proposed.firstActionableFailureP95Ms;
  if (baselineP95 === null && proposedP95 === null) return;
  if (baselineP95 === null || proposedP95 === null) {
    failures.push(`${label}: first-actionable-failure evidence is not comparable`);
    return;
  }
  if (proposedP95 > baselineP95) failures.push(`${label}: first-actionable-failure P95 regressed from ${baselineP95}ms to ${proposedP95}ms`);
}

export function evaluatePromotionEvidence(packet, {
  ordinaryPairsRequired = 20,
  controlledFailurePairsRequired = 20,
  utcDaysRequired = 5,
} = {}) {
  const failures = [];
  if (!isRecord(packet) || packet.schemaVersion !== 1 || !Array.isArray(packet.samples) || !Array.isArray(packet.selectionVectors)) {
    return { status: "not_ready", failures: ["packet must contain schemaVersion 1, selectionVectors, and samples arrays"], vectors: [] };
  }

  packet.samples.forEach((sample, index) => validateSampleShape(sample, index, failures));
  const vectorIds = packet.selectionVectors.map((vector) => vector?.id).filter((id) => typeof id === "string" && id.length > 0);
  if (new Set(vectorIds).size !== vectorIds.length) failures.push("selectionVectors must have unique non-empty ids");
  const vectors = [];

  for (const vectorId of vectorIds) {
    const vectorFailures = [];
    const vectorSamples = packet.samples.filter((sample) => sample.selectionVector?.id === vectorId);
    const cohorts = {};
    for (const cohort of COHORTS) {
      const grouped = new Map();
      for (const sample of vectorSamples.filter((candidate) => candidate.cohort === cohort)) {
        const members = grouped.get(sample.pairId) || {};
        if (members[sample.member]) vectorFailures.push(`${vectorId}/${cohort}: duplicate ${sample.member} member for pair ${sample.pairId}`);
        members[sample.member] = sample;
        grouped.set(sample.pairId, members);
      }
      const completePairs = [];
      for (const [pairId, members] of grouped) {
        if (!members.baseline || !members.proposed) {
          vectorFailures.push(`${vectorId}/${cohort}: pair ${pairId} is missing a baseline or proposed member`);
          continue;
        }
        if (!sameSourceIdentity(members.baseline, members.proposed)) vectorFailures.push(`${vectorId}/${cohort}: pair ${pairId} does not share an immutable source identity`);
        if (!sameCacheControl(members.baseline, members.proposed)) vectorFailures.push(`${vectorId}/${cohort}: pair ${pairId} lacks equivalent or counterbalanced cache control`);
        completePairs.push(members);
      }
      const requiredPairs = cohort === "ordinary" ? ordinaryPairsRequired : controlledFailurePairsRequired;
      if (completePairs.length < requiredPairs) vectorFailures.push(`${vectorId}/${cohort}: requires ${requiredPairs} complete pairs; found ${completePairs.length}`);
      const days = new Set(completePairs.flatMap((pair) => [utcDay(pair.baseline.recordedAt), utcDay(pair.proposed.recordedAt)]).filter(Boolean));
      if (days.size < utcDaysRequired) vectorFailures.push(`${vectorId}/${cohort}: requires ${utcDaysRequired} UTC days; found ${days.size}`);
      cohorts[cohort] = { completePairs, days: [...days].sort() };
    }

    const ordinaryBaseline = summarizeMember(cohorts.ordinary.completePairs.map((pair) => pair.baseline));
    const ordinaryProposed = summarizeMember(cohorts.ordinary.completePairs.map((pair) => pair.proposed));
    memberMetricsMeetBudget(ordinaryBaseline, ordinaryProposed, vectorFailures, `${vectorId}/ordinary`);
    firstFailureNoSlower(ordinaryBaseline, ordinaryProposed, vectorFailures, `${vectorId}/ordinary`);
    for (const metric of ["failureRate", "flakeRate", "retryRate"]) {
      if (ordinaryProposed[metric] !== null && ordinaryBaseline[metric] !== null && ordinaryProposed[metric] > ordinaryBaseline[metric]) {
        vectorFailures.push(`${vectorId}/ordinary: ${metric} increased from ${ordinaryBaseline[metric]} to ${ordinaryProposed[metric]}`);
      }
    }

    const controlledBaseline = summarizeMember(cohorts.controlled_failure.completePairs.map((pair) => pair.baseline));
    const controlledProposed = summarizeMember(cohorts.controlled_failure.completePairs.map((pair) => pair.proposed));
    for (const pair of cohorts.controlled_failure.completePairs) {
      if (pair.baseline.outcome.status !== "failed" || pair.proposed.outcome.status !== "failed") vectorFailures.push(`${vectorId}/controlled_failure: pair ${pair.baseline.pairId} must fail in both routes`);
      if (!pair.baseline.outcome.failureId || pair.baseline.outcome.failureId !== pair.proposed.outcome.failureId) vectorFailures.push(`${vectorId}/controlled_failure: pair ${pair.baseline.pairId} must detect the same failureId`);
    }
    firstFailureNoSlower(controlledBaseline, controlledProposed, vectorFailures, `${vectorId}/controlled_failure`);
    vectors.push({
      id: vectorId,
      status: vectorFailures.length === 0 ? "ready" : "not_ready",
      failures: vectorFailures,
      ordinary: { days: cohorts.ordinary.days, baseline: ordinaryBaseline, proposed: ordinaryProposed },
      controlledFailure: { days: cohorts.controlled_failure.days, baseline: controlledBaseline, proposed: controlledProposed },
    });
  }

  return {
    schemaVersion: 1,
    status: failures.length === 0 && vectors.length > 0 && vectors.every((vector) => vector.status === "ready") ? "ready" : "not_ready",
    failures,
    vectors,
  };
}

function parseArgs(argv) {
  if (argv.length !== 1) throw new Error("Usage: node ./scripts/evaluate-ci-promotion-evidence.mjs <evidence-packet.json>");
  return argv[0];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const path = parseArgs(process.argv.slice(2));
    const result = evaluatePromotionEvidence(JSON.parse(readFileSync(path, "utf8")));
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "ready") process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
