#!/usr/bin/env node
import { pathToFileURL } from "node:url";

import { ManagerSourceIntakeCycleError, parseManagerSourceIntakeCycleArgs, runManagerSourceIntakeCycle } from "./manager-source-intake-cycle.mjs";
import { ManagerSupervisorSourceIntakeError } from "./lib/manager-control-plane/manager-supervisor-source-intake.mjs";
import {
  ManagerSupervisorLocalProofError,
  continueManagerSourcePacketWithLocalProof,
} from "./lib/manager-control-plane/manager-supervisor-local-proof.mjs";

export function parseManagerSourceIntakeLocalProofArgs(argv = []) {
  const cycleArgv = [];
  const options = { idempotencyKey: null, correlationId: null };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--local-proof-idempotency-key") {
      claim(seen, arg);
      options.idempotencyKey = requiredValue(argv, ++index, arg);
    } else if (arg.startsWith("--local-proof-idempotency-key=")) {
      claim(seen, "--local-proof-idempotency-key");
      options.idempotencyKey = arg.slice("--local-proof-idempotency-key=".length);
    } else if (arg === "--local-proof-correlation-id") {
      claim(seen, arg);
      options.correlationId = requiredValue(argv, ++index, arg);
    } else if (arg.startsWith("--local-proof-correlation-id=")) {
      claim(seen, "--local-proof-correlation-id");
      options.correlationId = arg.slice("--local-proof-correlation-id=".length);
    } else {
      cycleArgv.push(arg);
    }
  }
  if (!options.idempotencyKey) {
    throw new Error("--local-proof-idempotency-key is required; this continuation is explicit and never runs from default intake.");
  }
  if (cycleArgv.includes("--dry-run") || cycleArgv.includes("--plan")) {
    throw new Error("manager source intake local proof requires persisted apply intake, not --dry-run.");
  }
  return { cycleArgv, ...options };
}

export async function runManagerSourceIntakeLocalProof(argv = process.argv.slice(2), context = {}) {
  const options = parseManagerSourceIntakeLocalProofArgs(argv);
  const cycleOptions = parseManagerSourceIntakeCycleArgs(options.cycleArgv);
  const intake = await runManagerSourceIntakeCycle(options.cycleArgv, context);
  return continueManagerSourcePacketWithLocalProof(
    intake,
    cycleOptions.supervisorUrl,
    { idempotencyKey: options.idempotencyKey, correlationId: options.correlationId },
    context,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await runManagerSourceIntakeLocalProof(), null, 2));
  } catch (error) {
    if (error instanceof ManagerSupervisorLocalProofError || error instanceof ManagerSourceIntakeCycleError || error instanceof ManagerSupervisorSourceIntakeError) {
      console.log(JSON.stringify(error.packet, null, 2));
      console.error(`${error.code}: ${error.message}`);
      process.exitCode = 1;
    } else {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 64;
    }
  }
}

function requiredValue(argv, index, option) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
  return value;
}

function claim(seen, option) {
  if (seen.has(option)) throw new Error(`${option} specified more than once`);
  seen.add(option);
}
