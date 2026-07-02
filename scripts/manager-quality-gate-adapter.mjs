#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const QUALITY_GATE_TIMEOUT_MS = 120000;
const MAX_OUTPUT_LINES = 5;
const MAX_OUTPUT_LINE_CHARS = 300;

const QUALITY_GATES = {
  "runner-assignment-status": {
    adapterId: "local-node-check",
    description: "Runner assignment status report drift check.",
    command: [process.execPath, ["./scripts/check-runner-assignment-status-report.mjs"]],
    policy: localNonMutatingGatePolicy(),
    evidenceRefs: [
      "quality-gate:runner-assignment-status",
      "command:node-scripts-check-runner-assignment-status-report",
    ],
  },
  "workspace-coordination": {
    adapterId: "local-node-check",
    description: "Workspace coordination report drift check.",
    command: [process.execPath, ["./scripts/check-workspace-coordination-report.mjs"]],
    policy: localNonMutatingGatePolicy(),
    evidenceRefs: [
      "quality-gate:workspace-coordination",
      "command:node-scripts-check-workspace-coordination-report",
    ],
  },
};

export function parseArgs(argv = []) {
  const options = {
    gateId: "runner-assignment-status",
    dryRun: false,
    summaryJson: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--gate") {
      options.gateId = requiredValue(argv, ++index, arg);
    } else if (arg.startsWith("--gate=")) {
      options.gateId = arg.slice("--gate=".length);
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--summary-json") {
      options.summaryJson = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

export function qualityGateCatalog() {
  return Object.fromEntries(
    Object.entries(QUALITY_GATES).map(([gateId, gate]) => [
      gateId,
      {
        adapterId: gate.adapterId,
        description: gate.description,
        command: commandSummary(gate.command),
        policy: { ...gate.policy },
        evidenceRefs: [...gate.evidenceRefs],
      },
    ]),
  );
}

export function buildQualityGatePreview(options = {}) {
  const gate = gateDefinition(options.gateId);
  return {
    schemaVersion: 1,
    gateId: options.gateId,
    adapterId: gate.adapterId,
    status: "preview",
    command: commandSummary(gate.command),
    evidenceRefs: [...gate.evidenceRefs],
    mutation: "none; dry-run preview only",
    providerUsage: gate.policy.providerUsage,
    workerLaunch: gate.policy.workerLaunch,
    safety: safetyState(gate.policy),
    rawPayloadRetained: false,
    nextManagerAction: "run without --dry-run when the manager intends to collect this local quality evidence",
  };
}

export function runQualityGate(options = {}, context = {}) {
  const gate = gateDefinition(options.gateId);
  const now = context.now || (() => new Date());
  const runner = context.runner || defaultRunner;
  const startedAt = now().toISOString();
  const startMs = Number(context.startMs ?? Date.now());
  assertLocalNonMutatingGate(gate);
  const result = runner(gate.command[0], gate.command[1], { cwd: repoRoot });
  const completedAt = now().toISOString();
  const endMs = Number(context.endMs ?? Date.now());
  const boundaryFailure = processBoundaryFailure(result);
  const signalFailure = result.signal ? "quality-gate-command-signaled" : null;
  const timeoutFailure = result.timedOut ? "quality-gate-command-timeout" : null;
  const exitCode = boundaryFailure ? 1 : Number.isInteger(result.code) ? result.code : 1;
  const status = exitCode === 0 ? "passed" : "failed";
  const failureReason = boundaryFailure || timeoutFailure || signalFailure || result.failureReason || (status === "failed" ? "quality-gate-command-failed" : null);

  return {
    schemaVersion: 1,
    gateId: options.gateId,
    adapterId: gate.adapterId,
    status,
    command: commandSummary(gate.command),
    startedAt,
    completedAt,
    durationMs: Math.max(0, endMs - startMs),
    exitCode,
    signal: result.signal || null,
    timedOut: Boolean(result.timedOut),
    evidenceRefs: [...gate.evidenceRefs],
    stdoutSummary: summarizeOutput(result.stdout),
    stderrSummary: summarizeOutput(result.stderr),
    failureReason,
    mutation: gate.policy.mutation,
    providerUsage: gate.policy.providerUsage,
    workerLaunch: gate.policy.workerLaunch,
    safety: safetyState(gate.policy),
    rawPayloadRetained: false,
    nextManagerAction: status === "passed"
      ? "attach quality evidence to the current packet before promote or deliver"
      : "hold promote or deliver and create follow-up work from the failed quality gate",
  };
}

function processBoundaryFailure(result) {
  const stderr = String(result?.stderr || "");
  return result?.errorCode === "EPERM" || result?.error?.code === "EPERM" || /spawnSync .* EPERM/.test(stderr)
    ? "local-process-boundary-blocked"
    : null;
}

function gateDefinition(gateId) {
  const gate = QUALITY_GATES[gateId];
  if (!gate) {
    throw new Error(`Unknown quality gate: ${gateId}`);
  }
  return gate;
}

function defaultRunner(command, args, options) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: "pipe",
    timeout: QUALITY_GATE_TIMEOUT_MS,
  });
  return {
    code: result.status ?? 1,
    signal: result.signal || null,
    timedOut: result.error?.code === "ETIMEDOUT" || result.signal === "SIGTERM",
    errorCode: result.error?.code || null,
    error: result.error || null,
    stdout: result.stdout || "",
    stderr: result.stderr || result.error?.message || "",
  };
}

function commandSummary(command) {
  return {
    executable: command[0] === process.execPath ? "node" : command[0],
    args: [...command[1]],
  };
}

function summarizeOutput(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_OUTPUT_LINES)
    .map((line) => line.slice(0, MAX_OUTPUT_LINE_CHARS));
}

function localNonMutatingGatePolicy() {
  return {
    mutation: "none; local quality check only",
    providerUsage: "none",
    workerLaunch: "none",
    workerMutation: "none",
    dispatchApply: "none",
    delivery: "none",
    cleanup: "none",
    rawPayloadRetained: false,
  };
}

function assertLocalNonMutatingGate(gate) {
  if (
    gate.policy?.mutation !== "none; local quality check only" ||
    gate.policy?.providerUsage !== "none" ||
    gate.policy?.workerLaunch !== "none" ||
    gate.policy?.workerMutation !== "none" ||
    gate.policy?.dispatchApply !== "none" ||
    gate.policy?.delivery !== "none" ||
    gate.policy?.cleanup !== "none" ||
    gate.policy?.rawPayloadRetained !== false
  ) {
    throw new Error(`Quality gate ${gate.adapterId} is missing local non-mutating policy evidence.`);
  }
}

function safetyState(policy = localNonMutatingGatePolicy()) {
  return {
    workerMutation: policy.workerMutation,
    dispatchApply: policy.dispatchApply,
    delivery: policy.delivery,
    cleanup: policy.cleanup,
    providerUsage: policy.providerUsage,
    workerLaunch: policy.workerLaunch,
    mutation: policy.mutation,
    rawPayloadRetained: policy.rawPayloadRetained,
  };
}

function requiredValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

export function main(argv = process.argv.slice(2)) {
  let options = null;
  try {
    options = parseArgs(argv);
    const packet = options.dryRun ? buildQualityGatePreview(options) : runQualityGate(options);
    if (options.summaryJson) {
      console.log(JSON.stringify(packet, null, 2));
    } else {
      console.log(`${packet.status.toUpperCase()}: ${packet.gateId}`);
      console.log(`Adapter: ${packet.adapterId}`);
      console.log(`Mutation: ${packet.mutation}`);
      console.log(`Next: ${packet.nextManagerAction}`);
    }
    if (!options.dryRun && packet.status !== "passed") {
      process.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options?.summaryJson || argv.includes("--summary-json")) {
      console.log(JSON.stringify(buildAdapterFailurePacket({ gateId: options?.gateId || "unknown", message }), null, 2));
    } else {
      console.error(message);
    }
    process.exit(1);
  }
}

export function buildAdapterFailurePacket({ gateId, message }) {
  const unknownGate = message.startsWith("Unknown quality gate:");
  return {
    schemaVersion: 1,
    gateId,
    adapterId: "local-node-check",
    status: "failed",
    command: null,
    evidenceRefs: [`quality-gate:${gateId}`],
    stdoutSummary: [],
    stderrSummary: summarizeOutput(message),
    failureReason: unknownGate ? "unknown-quality-gate" : "quality-gate-adapter-error",
    mutation: "none; local quality check only",
    providerUsage: "none",
    workerLaunch: "none",
    safety: safetyState(),
    rawPayloadRetained: false,
    nextManagerAction: "hold promote or deliver and create follow-up work from the failed quality gate",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
