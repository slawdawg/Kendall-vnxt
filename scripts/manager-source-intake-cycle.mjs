#!/usr/bin/env node
import { pathToFileURL } from "node:url";

import {
  attachParallelWorkGraphEvidenceToManagerPacket,
  buildParallelSuitabilityReport,
  buildSourceBackedPacketSeedPlan,
  parseCommonArgs,
} from "./lib/manager-control-plane/core.mjs";
import {
  ManagerSupervisorSourceIntakeError,
  intakeManagerSourcePacket,
  planManagerSourcePacketIntake,
} from "./lib/manager-control-plane/manager-supervisor-source-intake.mjs";

export class ManagerSourceIntakeCycleError extends Error {
  constructor(packet) {
    const packetState = packet?.summary?.packetState || "non_eligible";
    super(`Manager source intake cycle refused packet state: ${packetState}.`);
    this.name = "ManagerSourceIntakeCycleError";
    this.code = "manager_source_intake_cycle_not_eligible";
    this.packet = failClosedPlanningPacket(packet, this.code, this.message);
  }
}

export function parseManagerSourceIntakeCycleArgs(argv = []) {
  const seedArgv = [];
  let supervisorUrl = null;
  let supervisorUdsPath = null;
  let mode = "apply";
  let modeSpecified = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      if (modeSpecified) throw new Error("source intake mode may only be specified once");
      mode = "apply";
      modeSpecified = true;
    } else if (arg === "--dry-run" || arg === "--plan") {
      if (modeSpecified) throw new Error("source intake mode may only be specified once");
      mode = "dry_run";
      modeSpecified = true;
    } else if (arg === "--supervisor-url") {
      if (supervisorUrl !== null) throw new Error("--supervisor-url specified more than once");
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error("--supervisor-url requires a value");
      supervisorUrl = value;
    } else if (arg.startsWith("--supervisor-url=")) {
      if (supervisorUrl !== null) throw new Error("--supervisor-url specified more than once");
      supervisorUrl = arg.slice("--supervisor-url=".length);
      if (!supervisorUrl) throw new Error("--supervisor-url requires a value");
    } else if (arg === "--supervisor-uds-path") {
      if (supervisorUdsPath !== null) throw new Error("--supervisor-uds-path specified more than once");
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error("--supervisor-uds-path requires a value");
      supervisorUdsPath = value;
    } else if (arg.startsWith("--supervisor-uds-path=")) {
      if (supervisorUdsPath !== null) throw new Error("--supervisor-uds-path specified more than once");
      supervisorUdsPath = arg.slice("--supervisor-uds-path=".length);
      if (!supervisorUdsPath) throw new Error("--supervisor-uds-path requires a value");
    } else {
      seedArgv.push(arg);
    }
  }
  if (!supervisorUrl) {
    throw new Error("Usage: manager-source-intake-cycle <source-backed seed options> --supervisor-url <loopback-url>");
  }
  return { seedOptions: parseCommonArgs(seedArgv), supervisorUrl, supervisorUdsPath, mode };
}

export async function runManagerSourceIntakeCycle(argv = process.argv.slice(2), context = {}) {
  const { seedOptions, supervisorUrl, supervisorUdsPath, mode } = parseManagerSourceIntakeCycleArgs(argv);
  const intakeContext = supervisorUdsPath ? { ...context, supervisorUdsPath } : context;
  const plan = buildSourceBackedPacketSeedPlan(seedOptions, context);
  if (plan.summary?.packetState !== "eligible" || plan.summary?.seedPacket?.eligibilityDecision !== "eligible") {
    throw new ManagerSourceIntakeCycleError(plan);
  }
  const parallelSuitability = buildParallelSuitabilityReport(seedOptions, {
    ...context,
    candidates: [plan.summary.seedPacket],
  });
  const bridgePacket = attachParallelWorkGraphEvidenceToManagerPacket(plan, parallelSuitability, { now: context.now });
  let intakePlan;
  try {
    intakePlan = planManagerSourcePacketIntake(bridgePacket, supervisorUrl, intakeContext);
  } catch (error) {
    throw new ManagerSupervisorSourceIntakeError(
      /supervisorUrl/.test(String(error?.message || ""))
        ? "manager_supervisor_source_intake_non_loopback_url"
        : "manager_supervisor_source_intake_input_invalid",
      error.message,
      plan,
      { cause: error },
    );
  }
  if (mode === "dry_run") return withIntakeSelection(bridgePacket, intakePlan, false);
  return withIntakeSelection(await intakeManagerSourcePacket(bridgePacket, supervisorUrl, intakeContext), intakePlan, true);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await runManagerSourceIntakeCycle(), null, 2));
  } catch (error) {
    if (error instanceof ManagerSourceIntakeCycleError || error instanceof ManagerSupervisorSourceIntakeError) {
      console.log(JSON.stringify(error.packet, null, 2));
      console.error(`${error.code}: ${error.message}`);
      process.exitCode = 1;
    } else {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 64;
    }
  }
}

function failClosedPlanningPacket(packet, code, message) {
  const failed = structuredClone(packet);
  const packetState = failed.summary?.packetState || "non_eligible";
  const seedPacket = failed.summary?.seedPacket || {};
  failed.ok = false;
  failed.status = "blocked";
  failed.blockers = Array.isArray(failed.blockers) ? failed.blockers : [];
  failed.blockers.push({
    code,
    message,
    packetState,
    reason: seedPacket.eligibilityReason || packetState,
    nextAction: "Do not contact the supervisor; repair or review the source-backed seed inputs before retrying this explicit cycle.",
  });
  return failed;
}

function withIntakeSelection(packet, intakePlan, applied) {
  const result = structuredClone(packet);
  result.summary.continuousSelection = structuredClone(intakePlan.continuousSelection);
  result.summary.sourceIntakePlan = {
    mode: applied ? "apply" : "dry_run",
    endpoint: intakePlan.endpoint,
    packetId: intakePlan.request.packetId,
    sourceRef: intakePlan.request.sourceRef.refId,
    parallelWorkGraphEvidence: intakePlan.request.parallelWorkGraphEvidence
      ? { schemaVersion: intakePlan.request.parallelWorkGraphEvidence.schemaVersion, packetId: intakePlan.request.parallelWorkGraphEvidence.packetId }
      : null,
    metadataOnly: true,
    rawPayloadRetained: false,
    fetchPerformed: applied,
  };
  return result;
}
