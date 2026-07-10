#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

import {
  classifyManagerVerificationOutput,
  parseManagerShardTimeout,
  resolveManagerVerificationRoute,
  resolveManagerShardJobs,
  terminateManagerShardProcessGroup,
} from "./lib/manager-control-plane-verification.mjs";

const TEST_FILE = "tests/manager-control-plane.test.mjs";
const MAX_TEST_NAMES_PER_INVOCATION = 24;
const SHARD_TIMEOUT_MS = parseManagerShardTimeout(
  process.env.MANAGER_TEST_SHARD_TIMEOUT_MS === undefined ? "120000" : process.env.MANAGER_TEST_SHARD_TIMEOUT_MS,
);

const shardDefinitions = [
  {
    id: "refill-source",
    description: "safe backlog, refill, source intake, BMAD request, and mature-tool planning",
    match: /\b(sprint|usage|resource|safe backlog|refill|dispatcher refill|source|BMAD|mature tool|large slice|manager run start|dispatch preview|work eligibility|packet seed)\b/i,
  },
  {
    id: "worker-review",
    description: "worker code-review delegation and review-feedback gates",
    match: /\b(code review|review feedback|review-ready|review checklist|BMAD review)\b/i,
  },
  {
    id: "worker-lifecycle",
    description: "worker status, lifecycle, tmux orientation, warm pool, handoff, and retirement gates",
    match: /\b(worker status|worker governor|worker lifecycle|worker warm|warm gate|warm pool|worker handoff|worker retire|tmux orientation|clean cycle|retirement|reassignment)\b/i,
  },
  {
    id: "worker-progress",
    description: "worker progress, question-answer, owner delegation, prompt probe, and submit-pending gates",
    match: /\b(worker progress|progress signal|worker question|question answer|owner delegation|prompt probe|submit pending)\b/i,
  },
  {
    id: "worker-pointer",
    description: "worker pointer receipt, prompt-idle handoff, and paste-repair checks",
    match: /\b(worker pointer|pointer receipt|prompt-idle handoff|pointer paste)\b/i,
  },
  {
    id: "worker-friction",
    description: "worker friction, dependency loops, Codex advisor, and model-routing gates",
    match: /\b(worker friction|Codex advisor|model routing|dependency loops)\b/i,
  },
  {
    id: "worker-supply",
    description: "worker-eligible supply accounting and review/delivery lane supply exclusions",
    match: /\b(worker-eligible|review-ready and delivery-ready)\b/i,
  },
  {
    id: "worker-warm-continuation",
    description: "manager-owned warm-start continuation gates",
    match: /\b(manager-owned warm starts|fake-worker harness|healthy capacity)\b/i,
  },
  {
    id: "worker-active-continuation",
    description: "active-worker monitoring and safe dispatch continuation gates",
    match: /\b(monitors active workers|safe dispatch claims)\b/i,
  },
  {
    id: "lane-advance-worker-owner",
    description: "lane advancement worker-owner fallback behavior",
    match: /\b(worker lane owner metadata)\b/i,
  },
  {
    id: "continuous-worker-auto-actions",
    description: "continuous run manager-owned worker auto-action selection",
    match: /\b(worker auto actions)\b/i,
  },
  {
    id: "worker-continuation",
    description: "remaining worker continuation assertions not matched by narrower continuation shards",
    match: /\b(cycle continuation|manager-owned warm starts|worker auto actions|worker lane owner metadata|worker-eligible|manager worker assignment)\b/i,
  },
  {
    id: "worker",
    description: "remaining worker-oriented assertions not matched by narrower worker shards",
    match: /\b(worker|tmux|question|handoff|retire|warm|owner delegation|prompt probe|submit pending|friction|Codex advisor)\b/i,
  },
  {
    id: "cycle-runtime",
    description: "cycle packet, continuous run, runtime readiness, steering, progress, and feedback loop behavior",
    match: /\b(cycle|continuous|runtime|operational|steering|progress beacon|feedback plan|capability posture|self-repair)\b/i,
  },
  {
    id: "delivery-cleanup",
    description: "delivery, PR stewardship, merge gates, cleanup, dirty workspace preservation, and stale-owner flows",
    match: /\b(delivery|PR|merge|cleanup|dirty workspace|stale owner|stale-owner|preservation)\b/i,
  },
  {
    id: "ledger-recovery",
    description: "ledger, resume, preflight, sandbox boundary, recovery, and retry routing",
    match: /\b(ledger|resume|preflight|sandbox|recovery|retry|split-brain|readiness)\b/i,
  },
  {
    id: "misc",
    description: "remaining manager-control-plane assertions not matched by a narrower shard",
    match: null,
  },
];

const args = [...process.argv.slice(2)];
let requested = "all";
let jobs = resolveManagerShardJobs();

while (args.length > 0) {
  const arg = args.shift();
  if (arg === "--list") {
    requested = "list";
  } else if (arg === "--jobs") {
    jobs = parseJobCount(args.shift());
  } else if (arg?.startsWith("--jobs=")) {
    jobs = parseJobCount(arg.slice("--jobs=".length));
  } else if (arg && !arg.startsWith("--") && requested === "all") {
    requested = arg;
  } else {
    failUsage(`Unknown argument: ${arg}`);
  }
}

const testNames = extractTopLevelTestNames(TEST_FILE);
const shardMap = assignShards(testNames);

if (requested === "list") {
  for (const shard of shardDefinitions) {
    const names = shardMap.get(shard.id) || [];
    console.log(`${shard.id}\t${names.length}\t${shard.description}`);
  }
  process.exit(0);
}

const requestedShards = requested === "all"
  ? shardDefinitions.map((shard) => shard.id)
  : requested.split(",").map((value) => value.trim()).filter(Boolean);
const allowEmptyShards = requested === "all";

for (const shardId of requestedShards) {
  if (!shardMap.has(shardId)) {
    failUsage(`Unknown manager-control-plane shard: ${shardId}`);
  }
}

const results = await runShards(requestedShards, { jobs, allowEmptyShards });

let failed = false;
const verificationResults = [];
for (const result of results) {
  const names = shardMap.get(result.shardId) || [];
  const outcome = result.skipped ? "skipped" : result.status === 0 ? "passed" : result.outcome || "failed";
  const header = `[manager:${result.shardId}] ${names.length} tests ${outcome} in ${result.durationMs}ms`;
  console.log(header);
  const output = `${result.stdout}${result.stderr}`;
  if (result.status === 0) {
    const summary = summarizePassingOutput(output);
    if (summary) console.log(summary);
  } else {
    failed = true;
    if (output.trim()) console.error(output.trimEnd());
    if (result.reason) console.error(`[manager:${result.shardId}] verification ${result.outcome}: ${result.reason}`);
    if (result.error) console.error(result.error.message);
  }
  if (!result.skipped) {
    verificationResults.push({ status: result.outcome || (result.status === 0 ? "passed" : "failed"), reason: result.reason });
  }
}

const route = resolveManagerVerificationRoute(verificationResults);
if (route.failClosed) {
  failed = true;
  console.error(`Manager verification route ${route.route} is ${route.status}; failing closed.`);
}

process.exit(failed ? 1 : 0);

function extractTopLevelTestNames(path) {
  const source = readFileSync(path, "utf8");
  const names = [];
  const unsupportedDeclarations = [];
  for (const [index, line] of source.split(/\n/).entries()) {
    const match = line.match(/^test\("((?:[^"\\]|\\.)*)"/);
    if (!match) {
      if (/^\s*test(?:\.|\()/.test(line)) {
        unsupportedDeclarations.push(`${index + 1}: ${line.trim()}`);
      }
      continue;
    }
    names.push(JSON.parse(`"${match[1]}"`));
  }
  if (unsupportedDeclarations.length > 0) {
    throw new Error(`Unsupported manager-control-plane test declarations prevent exact sharding:\n${unsupportedDeclarations.slice(0, 10).join("\n")}`);
  }
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  if (duplicates.length > 0) {
    throw new Error(`Duplicate manager-control-plane test names prevent exact sharding: ${[...new Set(duplicates)].join(", ")}`);
  }
  if (names.length < 300) {
    throw new Error(`Expected at least 300 manager-control-plane tests, found ${names.length}`);
  }
  return names;
}

function assignShards(names) {
  const shardMap = new Map(shardDefinitions.map((shard) => [shard.id, []]));
  for (const name of names) {
    const shard = shardDefinitions.find((candidate) => candidate.match?.test(name)) || shardDefinitions.at(-1);
    shardMap.get(shard.id).push(name);
  }
  return shardMap;
}

async function runShards(shardIds, { jobs: jobCount, allowEmptyShards = false }) {
  const queue = [...shardIds];
  const results = [];
  const workerCount = Math.min(jobCount, queue.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (queue.length > 0) {
      const shardId = queue.shift();
      results.push(await runShard(shardId, { allowEmpty: allowEmptyShards }));
    }
  });
  await Promise.all(workers);
  return results.sort((left, right) => shardIds.indexOf(left.shardId) - shardIds.indexOf(right.shardId));
}

function runShard(shardId, { allowEmpty = false } = {}) {
  const names = shardMap.get(shardId) || [];
  if (names.length === 0) {
    return Promise.resolve({
      shardId,
      status: 1,
      outcome: "inconclusive",
      reason: "missing-tests",
      stdout: "",
      stderr: `Shard ${shardId} has no tests\n`,
      durationMs: 0,
    });
  }
  const chunks = chunkArray(names, MAX_TEST_NAMES_PER_INVOCATION);
  if (chunks.length > 1) return runShardChunks(shardId, chunks);
  return runShardChunk(shardId, chunks[0]);
}

async function runShardChunks(shardId, chunks) {
  const started = Date.now();
  const results = [];
  for (const [index, names] of chunks.entries()) {
    const result = await runShardChunk(shardId, names, { chunkIndex: index + 1, chunkCount: chunks.length });
    results.push(result);
  }
  return {
    shardId,
    status: results.every((result) => result.status === 0) ? 0 : 1,
    outcome: results.every((result) => result.status === 0)
      ? "passed"
      : results.some((result) => result.outcome === "failed")
        ? "failed"
        : "inconclusive",
    reason: results.find((result) => result.status !== 0)?.reason || null,
    stdout: results.map((result) => result.stdout).filter(Boolean).join("\n"),
    stderr: results.map((result) => result.stderr).filter(Boolean).join("\n"),
    error: results.find((result) => result.error)?.error,
    durationMs: Date.now() - started,
  };
}

function runShardChunk(shardId, names, { chunkIndex = 1, chunkCount = 1 } = {}) {
  const pattern = `^(?:${names.map(escapeRegExp).join("|")})$`;
  const started = Date.now();
  const child = spawn(process.execPath, [
    "--test",
    "--experimental-test-isolation=none",
    "--test-reporter",
    "spec",
    "--test-name-pattern",
    pattern,
    TEST_FILE,
  ], {
    cwd: process.cwd(),
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  let timedOut = false;
  let killTimer = null;
  const timeout = setTimeout(() => {
    timedOut = true;
    terminateManagerShardProcessGroup(child, "SIGTERM");
    killTimer = setTimeout(() => terminateManagerShardProcessGroup(child, "SIGKILL"), 1000);
  }, SHARD_TIMEOUT_MS);
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  return new Promise((resolve) => {
    child.on("error", (error) => {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      const classification = classifyManagerVerificationOutput({ status: 1, stdout, stderr, timedOut });
      resolve({ shardId, status: 1, outcome: classification.status, reason: classification.reason, stdout, stderr: annotateChunk(stderr, chunkIndex, chunkCount), error, durationMs: Date.now() - started });
    });
    child.on("close", (status) => {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      const classification = classifyManagerVerificationOutput({ status, stdout, stderr, timedOut });
      resolve({
        shardId,
        status: classification.status === "passed" ? 0 : 1,
        outcome: classification.status,
        reason: classification.reason,
        stdout: annotateChunk(stdout, chunkIndex, chunkCount),
        stderr: annotateChunk(stderr, chunkIndex, chunkCount),
        durationMs: Date.now() - started,
      });
    });
  });
}

function annotateChunk(output, chunkIndex, chunkCount) {
  if (!output || chunkCount <= 1) return output;
  return `[chunk ${chunkIndex}/${chunkCount}]\n${output}`;
}

function summarizePassingOutput(output) {
  const lines = output.trim().split(/\n/).filter(Boolean);
  return lines.slice(-8).join("\n");
}

function parseJobCount(value) {
  try {
    return resolveManagerShardJobs(value);
  } catch (error) {
    failUsage(error.message);
  }
}

function failUsage(message) {
  console.error(message);
  console.error(`Usage: node ./scripts/run-manager-control-plane-shards.mjs [all|${shardDefinitions.map((shard) => shard.id).join("|")}] [--jobs N]`);
  console.error("       node ./scripts/run-manager-control-plane-shards.mjs --list");
  process.exit(64);
}

function chunkArray(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function escapeRegExp(value) {
  return String(value).replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}
