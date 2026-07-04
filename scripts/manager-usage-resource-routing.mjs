#!/usr/bin/env node

const VALID_USAGE_STATES = new Set(["normal", "low", "stale", "unknown"]);
const VALID_RESOURCE_STATES = new Set(["normal", "high", "stale", "unknown"]);
const MAX_SAMPLE_AGE_MS = 5 * 60 * 1000;

const DEFAULT_STOP_LINES = Object.freeze([
  "no_worker_launch",
  "no_provider_calls",
  "no_paid_usage",
  "no_dispatch_apply",
  "no_git_or_github_mutation",
  "no_delivery",
  "no_cleanup",
  "metadata_only_evidence",
]);

function asNonBlankString(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asFiniteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeObject(value) {
  return value && typeof value === "object" ? value : {};
}

function normalizePercent(value) {
  if (value === null || value === undefined || value === "") {
    return { value: null, missing: true, invalid: false };
  }
  const number = asFiniteNumber(value);
  if (number === null || number < 0 || number > 100) {
    return { value: null, missing: false, invalid: true };
  }
  return { value: number, missing: false, invalid: false };
}

function isFreshSample(sampledAt, nowMs) {
  const value = asNonBlankString(sampledAt, "");
  if (!value) return false;
  if (value === "now") return true;
  const sampledMs = Date.parse(value);
  return Number.isFinite(sampledMs) && nowMs - sampledMs >= 0 && nowMs - sampledMs <= MAX_SAMPLE_AGE_MS;
}

function normalizeUsageSample(rawSample = {}, nowMs = Date.now()) {
  const sample = normalizeObject(rawSample);
  const stale = sample.stale === true;
  const remainingPercent = normalizePercent(sample.remainingPercent);
  const sampledAt = asNonBlankString(sample.sampledAt, "not_provided");
  const fresh = isFreshSample(sampledAt, nowMs);
  let state = asNonBlankString(sample.state, "unknown");
  if (!VALID_USAGE_STATES.has(state)) {
    state = "unknown";
  }
  if (stale || state === "stale") {
    state = "stale";
  } else if (!fresh) {
    state = "stale";
  } else if (remainingPercent.invalid || remainingPercent.missing) {
    state = "unknown";
  } else if (remainingPercent.value <= 2) {
    state = "low";
  }
  return {
    provider: asNonBlankString(sample.provider, "codex"),
    state,
    stale: state === "stale",
    fresh,
    remainingPercent: remainingPercent.value,
    sampledAt,
    missingRemainingPercent: remainingPercent.missing,
    invalidRemainingPercent: remainingPercent.invalid,
  };
}

function normalizeResourceSample(rawSample = {}, nowMs = Date.now()) {
  const sample = normalizeObject(rawSample);
  const stale = sample.stale === true;
  const cpuLoadPercent = normalizePercent(sample.cpuLoadPercent);
  const memoryUsedPercent = normalizePercent(sample.memoryUsedPercent);
  const sampledAt = asNonBlankString(sample.sampledAt, "not_provided");
  const fresh = isFreshSample(sampledAt, nowMs);
  let state = asNonBlankString(sample.state, "unknown");
  if (!VALID_RESOURCE_STATES.has(state)) {
    state = "unknown";
  }
  if (stale || state === "stale") {
    state = "stale";
  } else if (!fresh) {
    state = "stale";
  } else if (cpuLoadPercent.invalid || memoryUsedPercent.invalid) {
    state = "unknown";
  } else if (cpuLoadPercent.missing || memoryUsedPercent.missing) {
    state = "unknown";
  } else if (cpuLoadPercent.value >= 90) {
    state = "high";
  } else if (memoryUsedPercent.value >= 90) {
    state = "high";
  }
  return {
    state,
    stale: state === "stale",
    fresh,
    cpuLoadPercent: cpuLoadPercent.value,
    memoryUsedPercent: memoryUsedPercent.value,
    sampledAt,
    missingCpuLoadPercent: cpuLoadPercent.missing,
    missingMemoryUsedPercent: memoryUsedPercent.missing,
    invalidCpuLoadPercent: cpuLoadPercent.invalid,
    invalidMemoryUsedPercent: memoryUsedPercent.invalid,
  };
}

function normalizeOwner(owner) {
  const provided = typeof owner === "string" && owner.trim();
  const value = provided ? owner.trim() : "unknown-owner";
  const valid = Boolean(provided) && /^[A-Za-z0-9._:@-]+$/.test(value) && !value.startsWith("-");
  return { value: valid ? value : "unknown-owner", valid };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function buildUsageResourceRoutingDecision(input = {}) {
  const safeInput = normalizeObject(input);
  const nowMs = asFiniteNumber(safeInput.nowMs, Date.now());
  const owner = normalizeOwner(safeInput.owner);
  const usage = normalizeUsageSample(safeInput.usageSample, nowMs);
  const resource = normalizeResourceSample(safeInput.resourceSample, nowMs);
  const readyQueueCount = Math.max(0, Math.trunc(asFiniteNumber(safeInput.readyQueueCount, 0)));
  const blockedReasons = [];

  if (!owner.valid) blockedReasons.push("owner.invalid");
  if (usage.state === "low") blockedReasons.push("usage.low");
  if (usage.state === "stale") blockedReasons.push("usage.stale");
  if (usage.state === "unknown") blockedReasons.push("usage.unknown");
  if (resource.state === "high") blockedReasons.push("resource.high");
  if (resource.state === "stale") blockedReasons.push("resource.stale");
  if (resource.state === "unknown") blockedReasons.push("resource.unknown");
  if (readyQueueCount === 0) blockedReasons.push("queue.empty");
  if (usage.missingRemainingPercent) blockedReasons.push("usage.remaining_percent_missing");
  if (usage.invalidRemainingPercent) blockedReasons.push("usage.remaining_percent_invalid");
  if (resource.missingCpuLoadPercent) blockedReasons.push("resource.cpu_load_percent_missing");
  if (resource.missingMemoryUsedPercent) blockedReasons.push("resource.memory_used_percent_missing");
  if (resource.invalidCpuLoadPercent) blockedReasons.push("resource.cpu_load_percent_invalid");
  if (resource.invalidMemoryUsedPercent) blockedReasons.push("resource.memory_used_percent_invalid");

  const allowed = blockedReasons.length === 0;
  const dryRunCommand = `node ./scripts/codex-workspace.mjs dispatch-next --dry-run --summary-json --owner ${owner.value}`;
  const nextAction = allowed
    ? `Review usage/resource policy inputs, then run ${dryRunCommand}.`
    : "Hold dispatch; pause dispatch until fresh provider usage and host resource samples are healthy.";

  return {
    schemaVersion: "manager_usage_resource_routing.v1",
    status: allowed ? "ready" : "blocked",
    allowed,
    decision: allowed ? "dispatch_preview_allowed" : "dispatch_held",
    blockedReasons: unique(blockedReasons),
    selectedAction: allowed
      ? {
          code: "dispatch-next-dry-run",
          command: dryRunCommand,
          mutationClass: "none",
        }
      : null,
    owner,
    workerMutationAllowed: false,
    deliveryAllowed: false,
    cleanupAllowed: false,
    dispatchApplyAllowed: false,
    policyInputs: {
      usage,
      resource,
      readyQueueCount,
    },
    nextAction,
    stopLines: [...DEFAULT_STOP_LINES],
    rawPayloadRetained: false,
    sourceContentCopied: false,
    recoveryPath: "Refresh usage/resource samples and rerun this dry-run routing gate before dispatch apply.",
  };
}

function parseArgs(argv) {
  const options = {
    owner: "unknown-owner",
    usageState: "unknown",
    resourceState: "unknown",
    readyQueueCount: 0,
    summaryJson: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value for ${arg}`);
      return argv[index];
    };
    if (arg === "--summary-json") {
      options.summaryJson = true;
    } else if (arg === "--owner") {
      options.owner = next();
    } else if (arg === "--usage-state") {
      options.usageState = next();
    } else if (arg === "--resource-state") {
      options.resourceState = next();
    } else if (arg === "--ready-queue-count") {
      options.readyQueueCount = next();
    } else if (arg === "--codex-remaining-percent") {
      options.remainingPercent = next();
    } else if (arg === "--usage-sampled-at") {
      options.usageSampledAt = next();
    } else if (arg === "--cpu-load-percent") {
      options.cpuLoadPercent = next();
    } else if (arg === "--memory-used-percent") {
      options.memoryUsedPercent = next();
    } else if (arg === "--resource-sampled-at") {
      options.resourceSampledAt = next();
    } else if (arg === "--sampled-at") {
      options.usageSampledAt = options.resourceSampledAt = next();
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function cli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const decision = buildUsageResourceRoutingDecision({
    owner: options.owner,
    readyQueueCount: options.readyQueueCount,
    usageSample: {
      state: options.usageState,
      remainingPercent: options.remainingPercent,
      sampledAt: options.usageSampledAt,
    },
    resourceSample: {
      state: options.resourceState,
      cpuLoadPercent: options.cpuLoadPercent,
      memoryUsedPercent: options.memoryUsedPercent,
      sampledAt: options.resourceSampledAt,
    },
  });
  if (options.summaryJson) {
    console.log(JSON.stringify({ ok: decision.allowed, status: decision.status, summary: decision }, null, 2));
  } else {
    console.log(`${decision.status.toUpperCase()}: ${decision.nextAction}`);
    if (decision.blockedReasons.length > 0) {
      console.log(`Blocked reasons: ${decision.blockedReasons.join(", ")}`);
    }
  }
  return decision.allowed ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = cli();
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}
