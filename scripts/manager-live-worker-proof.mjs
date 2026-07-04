#!/usr/bin/env node
import { pathToFileURL } from "node:url";

import {
  buildLiveWorkerProofReadiness,
  parseCommonArgs,
  printPacket,
} from "./lib/manager-control-plane/core.mjs";

function usage() {
  return [
    "Usage: node ./scripts/manager-live-worker-proof.mjs [--run-id <id>] [--state-root <path>] [--desired-workers <count>] [--summary-json]",
    "",
    "Options:",
    "  --run-id <id>              Manager run id.",
    "  --state-root <path>        Codex workspace state root.",
    "  --desired-workers <count>  Expected manager-owned live workers, 1-6 (default 6).",
    "  --fixture-ready            Use deterministic fixture worker/posture context for local readiness checks.",
    "  --summary-json             Emit compact JSON.",
    "  --help                     Show this help.",
  ].join("\n");
}

export function parseLiveWorkerProofArgs(argv = []) {
  const commonArgs = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") continue;
    if (arg === "--fixture-ready") continue;
    if (arg === "--desired-workers") {
      index += 1;
      continue;
    }
    if (arg.startsWith("--desired-workers=")) continue;
    commonArgs.push(arg);
  }
  const options = {
    ...parseCommonArgs(commonArgs),
    desiredWorkers: 6,
    fixtureReady: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--fixture-ready") {
      options.fixtureReady = true;
    } else if (arg === "--desired-workers") {
      options.desiredWorkers = parseStrictDesiredWorkers(argv[++index]);
    } else if (arg.startsWith("--desired-workers=")) {
      options.desiredWorkers = parseStrictDesiredWorkers(arg.slice("--desired-workers=".length));
    }
  }
  return options;
}

function parseStrictDesiredWorkers(value) {
  const text = String(value || "");
  if (!/^[0-9]+$/.test(text)) {
    throw new Error("--desired-workers must be an integer from 1 to 6.");
  }
  const parsed = Number(text);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 6) {
    throw new Error("--desired-workers must be an integer from 1 to 6.");
  }
  return parsed;
}

export function runLiveWorkerProof(argv = process.argv.slice(2), context = {}) {
  const options = parseLiveWorkerProofArgs(argv);
  if (options.help) {
    return {
      options,
      result: { ok: true, status: "help", summary: { usage: usage() }, blockers: [], warnings: [], nextActions: [] },
    };
  }
  return {
    options,
    result: buildLiveWorkerProofReadiness(options, options.fixtureReady ? { ...fixtureReadyContext(options), ...context } : context),
  };
}

function fixtureReadyContext(options = {}) {
  const runId = options.runId || "manager-live-worker-proof-check";
  const desiredWorkers = options.desiredWorkers || 6;
  const now = new Date().toISOString();
  return {
    now,
    assignmentSummary: { summary: { backlogStatusCounts: { assignable: desiredWorkers }, laneAssignmentStatusCounts: { active: 0 } } },
    dispatchPreview: { summary: { counts: { dispatchable: desiredWorkers, active: 0 }, candidateStateCounts: { assignable: desiredWorkers, active: 0 } } },
    refillPlan: {
      summary: {
        safeWorkSupply: desiredWorkers,
        candidateLanes: Array.from({ length: desiredWorkers }, (_, index) => ({ candidateId: `fixture-slice-${index + 1}` })),
        sourceWorkEligibility: { eligibleCount: desiredWorkers, blockedCount: 0 },
      },
    },
    usageContext: { status: "normal", summary: { state: "normal" } },
    resourceContext: { status: "normal", summary: { state: "normal" } },
    tmuxSummary: { unmanagedPanes: 0, takeoverRequiredPanes: 0, managerOwnedPanes: desiredWorkers },
    workerRecords: Array.from({ length: desiredWorkers }, (_, index) => {
      const workerId = `codex-${index + 1}`;
      return {
        workerId,
        owner: `${runId}/${workerId}`,
        runId,
        sessionName: workerId,
        state: "warm",
        lastHeartbeatAt: now,
        lastPreflight: { status: "passed", source: "fixture-ready-context" },
      };
    }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { options, result } = runLiveWorkerProof();
    printPacket(result, options);
    if (!result.ok && result.status !== "help") process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
