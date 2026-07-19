#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import { buildRefillPlan } from "./lib/manager-control-plane/core.mjs";
import {
  ManagerSupervisorTerminalEventSyncError,
  resolveLoopbackSupervisorEndpoint,
  syncManagerSupervisorTerminalEvent,
} from "./lib/manager-control-plane/manager-supervisor-terminal-event-sync.mjs";

export const DEFAULT_DOGFOOD_SOURCE_IDENTITY = "doc:docs/architecture/manager-supervisor-terminal-event-sync-boundary.md";
export const DEFAULT_DOGFOOD_SOURCE_REVISION = "manager-terminal-event-dogfood-20260719";

/**
 * Build a new, metadata-only authoritative exhaustion packet without touching
 * manager state, starting a supervisor, or creating work.
 */
export function buildManagerTerminalEventDogfoodPacket({
  runId = createDogfoodRunId(),
  sourceIdentity = DEFAULT_DOGFOOD_SOURCE_IDENTITY,
  sourceRevision = DEFAULT_DOGFOOD_SOURCE_REVISION,
  now,
} = {}) {
  const authoritativeSourceBundle = {
    sourceIdentity,
    sourceRevision,
    fullyReconciled: true,
    noSeparatelyApprovedSource: true,
    reconciliationCounts: {
      totalItems: 1,
      reconciledItems: 1,
      eligible: 0,
      queued: 0,
      leased: 0,
      running: 0,
      reviewFix: 0,
      requiredRetrospective: 0,
      otherwiseRequired: 0,
      completed: 1,
      closed: 0,
      approvalGated: 0,
    },
    evidenceRefs: ["evidence:manager-terminal-event-dogfood"],
    resumeRequirement: "Start a new source-bound manager run after accepted backlog changes.",
    nextManagerAction: "Wait for newly accepted source-owned backlog.",
  };
  return buildRefillPlan(
    { runId, desiredWorkers: 6, sourceRefs: [sourceIdentity] },
    {
      now,
      runId,
      sourceRefs: [sourceIdentity],
      activeSource: { sourceIdentity, sourceRevision, sourceRefs: [sourceIdentity] },
      authoritativeSourceBundle,
      assignmentSummary: { summary: { backlogStatusCounts: { assignable: 0, closed: 0 } } },
      dispatchPreview: { counts: { dispatchable: 0, active: 0 } },
    },
  );
}

export function createDogfoodRunId(now = new Date()) {
  const timestamp = now.toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  return `manager-terminal-dogfood-${timestamp}-${randomUUID().slice(0, 8)}`;
}

export function projectDogfoodEvidence({ packet, supervisorUrl, persisted = null, error = null } = {}) {
  const disposition = packet?.summary?.terminalDisposition || packet?.summary?.refillJob?.terminalDisposition || null;
  const supervisorEvent = persisted || disposition?.supervisorEvent || null;
  let supervisorEndpoint = null;
  let endpointError = null;
  if (supervisorUrl) {
    try {
      supervisorEndpoint = resolveLoopbackSupervisorEndpoint(supervisorUrl);
    } catch {
      endpointError = "manager_terminal_event_dogfood_url_invalid";
    }
  }
  return {
    status: error ? "blocked" : supervisorEvent?.status || "prepared",
    runId: disposition?.runId || null,
    sourceIdentity: disposition?.sourceIdentity || null,
    sourceRevision: disposition?.sourceRevision || null,
    idempotencyKey: disposition?.idempotencyKey || null,
    eventId: supervisorEvent?.eventId || null,
    supervisorEndpoint,
    persistedAt: supervisorEvent?.persistedAt || null,
    metadataOnly: true,
    rawPayloadRetained: false,
    ...(error
      ? { errorCode: error.code || endpointError || "manager_terminal_event_dogfood_failed" }
      : endpointError
        ? { errorCode: endpointError }
        : {}),
  };
}

export async function runManagerTerminalEventDogfood(argv = process.argv.slice(2), context = {}) {
  let options;
  try {
    options = parseDogfoodArgs(argv);
  } catch {
    return {
      ok: false,
      evidence: projectDogfoodEvidence({ error: { code: "manager_terminal_event_dogfood_args_invalid" } }),
      blockers: [{ code: "manager_terminal_event_dogfood_args_invalid", message: "Manager terminal-event dogfood arguments are invalid." }],
    };
  }
  let packet;
  try {
    packet = buildManagerTerminalEventDogfoodPacket(options);
  } catch (error) {
    return {
      ok: false,
      evidence: projectDogfoodEvidence({ supervisorUrl: options.supervisorUrl, error }),
      blockers: [{ code: "manager_terminal_event_dogfood_packet_invalid", message: error instanceof Error ? error.message : String(error) }],
    };
  }
  if (!packet || packet.status !== "authoritative_backlog_exhausted" || !packet.summary?.terminalDisposition) {
    return {
      ok: false,
      evidence: projectDogfoodEvidence({ packet, supervisorUrl: options.supervisorUrl, error: { code: "manager_terminal_event_dogfood_packet_not_exhausted" } }),
      blockers: (packet?.blockers || []).map((blocker) => ({ code: blocker.code, message: blocker.message })),
    };
  }
  try {
    const synced = await syncManagerSupervisorTerminalEvent(packet, options.supervisorUrl, context);
    return { ok: true, evidence: projectDogfoodEvidence({ packet: synced, supervisorUrl: options.supervisorUrl }), blockers: [] };
  } catch (error) {
    const syncError = error instanceof ManagerSupervisorTerminalEventSyncError ? error : { code: "manager_terminal_event_dogfood_failed" };
    return {
      ok: false,
      evidence: projectDogfoodEvidence({ packet: syncError.packet || packet, supervisorUrl: options.supervisorUrl, error: syncError }),
      blockers: [{ code: syncError.code, message: syncError.message || "Manager terminal-event dogfood sync failed." }],
    };
  }
}

export function parseDogfoodArgs(argv = []) {
  const options = {
    supervisorUrl: "",
    runId: createDogfoodRunId(),
    sourceIdentity: DEFAULT_DOGFOOD_SOURCE_IDENTITY,
    sourceRevision: DEFAULT_DOGFOOD_SOURCE_REVISION,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index]);
    if (arg === "--") continue;
    if (arg === "--supervisor-url") options.supervisorUrl = requiredValue(argv, ++index, arg);
    else if (arg.startsWith("--supervisor-url=")) options.supervisorUrl = arg.slice("--supervisor-url=".length);
    else if (arg === "--run-id") options.runId = requiredValue(argv, ++index, arg);
    else if (arg.startsWith("--run-id=")) options.runId = arg.slice("--run-id=".length);
    else if (arg === "--source-revision") options.sourceRevision = requiredValue(argv, ++index, arg);
    else if (arg.startsWith("--source-revision=")) options.sourceRevision = arg.slice("--source-revision=".length);
    else if (arg === "--summary-json") continue;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!options.supervisorUrl) throw new Error("Usage: manager-terminal-event-dogfood --supervisor-url <loopback-url> [--run-id <id>]");
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runManagerTerminalEventDogfood();
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify({
      ok: false,
      evidence: projectDogfoodEvidence({ error: { code: "manager_terminal_event_dogfood_failed" } }),
      blockers: [{ code: "manager_terminal_event_dogfood_failed", message: "Manager terminal-event dogfood failed closed." }],
    }, null, 2));
    process.exitCode = 1;
  }
}

function requiredValue(argv, index, option) {
  const value = argv[index];
  if (!value || String(value).startsWith("--")) throw new Error(`${option} requires a value`);
  return String(value);
}
