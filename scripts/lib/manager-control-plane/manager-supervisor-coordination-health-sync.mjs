import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { parseLoopbackSupervisorUrl } from "./loopback-supervisor.mjs";
import { privateSupervisorUdsEndpoint, requestPrivateSupervisorUds, resolvePrivateSupervisorUdsPath } from "./private-supervisor-uds.mjs";
import { normalizeSupervisorTimeoutMs } from "./supervisor-timeout.mjs";
import {
  MANAGER_COORDINATION_HEALTH_HANDOFF_ID_PATTERN,
  MANAGER_COORDINATION_HEALTH_HANDOFF_REQUEST_FIELDS,
  MANAGER_COORDINATION_HEALTH_HANDOFF_SCHEMA_VERSION,
} from "./coordination-health-handoff-contract.mjs";

const HANDOFF_PATH = "/manager-control-plane/coordination-health-handoffs";

export function deriveManagerCoordinationHealthHandoffId(idempotencyKey) {
  if (typeof idempotencyKey !== "string" || !idempotencyKey.trim() || idempotencyKey !== idempotencyKey.trim()) {
    throw new TypeError("Coordination health handoff idempotencyKey must be non-empty metadata text.");
  }
  const handoffId = `manager-coordination-health-handoff:${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 40)}`;
  if (!MANAGER_COORDINATION_HEALTH_HANDOFF_ID_PATTERN.test(handoffId)) throw new TypeError("Coordination health handoff ID is not canonical.");
  return handoffId;
}

export function resolveLoopbackCoordinationHealthHandoffEndpoint(supervisorUrl) {
  return new URL(HANDOFF_PATH, parseLoopbackSupervisorUrl(supervisorUrl)).href;
}

export function resolveCoordinationHealthHandoffTransport(supervisorUrl, context = {}) {
  const socketPath = resolvePrivateSupervisorUdsPath(context);
  return socketPath
    ? { kind: "private_uds", socketPath, endpoint: privateSupervisorUdsEndpoint(socketPath, HANDOFF_PATH) }
    : { kind: "loopback", endpoint: resolveLoopbackCoordinationHealthHandoffEndpoint(supervisorUrl) };
}

export function buildManagerCoordinationHealthHandoffRequest(coordinationHealth, context = {}) {
  if (!coordinationHealth || typeof coordinationHealth !== "object") throw new TypeError("Coordination health snapshot is required.");
  if (coordinationHealth.schemaVersion !== "manager-coordination-health/v0" || coordinationHealth.metadataOnly !== true || coordinationHealth.rawPayloadRetained !== false) {
    throw new TypeError("Coordination health snapshot is not an exact metadata-only v0 snapshot.");
  }
  const observedAt = required(coordinationHealth.observedAt, "coordinationHealth.observedAt", 64);
  const sourceSequence = context.sourceSequence ?? Date.parse(observedAt);
  if (!Number.isSafeInteger(sourceSequence) || sourceSequence <= 0) throw new TypeError("sourceSequence must be a positive safe integer.");
  const runId = required(coordinationHealth.runId, "coordinationHealth.runId", 120);
  const idempotencyKey = required(context.idempotencyKey ?? canonicalIdempotencyKey(runId, observedAt, sourceSequence), "idempotencyKey", 180);
  return {
    schemaVersion: MANAGER_COORDINATION_HEALTH_HANDOFF_SCHEMA_VERSION,
    handoffId: deriveManagerCoordinationHealthHandoffId(idempotencyKey),
    sourceSequence,
    coordinationHealth: structuredClone(coordinationHealth),
    idempotencyKey,
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function canonicalIdempotencyKey(runId, observedAt, sourceSequence) {
  const identity = `${runId}\n${observedAt}\n${sourceSequence}`;
  return `manager-coordination-health:${createHash("sha256").update(identity).digest("hex").slice(0, 40)}`;
}

export async function syncManagerSupervisorCoordinationHealth(coordinationHealth, supervisorUrl, context = {}) {
  const transport = resolveCoordinationHealthHandoffTransport(supervisorUrl, context);
  const endpoint = transport.endpoint;
  const request = buildManagerCoordinationHealthHandoffRequest(coordinationHealth, context);
  const timeoutMs = normalizeSupervisorTimeoutMs(context.timeoutMs);
  const fetchImpl = context.fetchImpl ?? globalThis.fetch;
  if (transport.kind === "loopback" && typeof fetchImpl !== "function") throw new TypeError("Coordination health handoff requires a fetch implementation.");
  const post = transport.kind === "private_uds"
    ? await requestPrivateSupervisorUds(transport.socketPath, HANDOFF_PATH, { method: "POST", body: request, timeoutMs })
    : await fetchImpl(endpoint, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(request), redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
  if (!post?.ok) throw new TypeError(`Coordination health handoff failed with HTTP ${post?.status ?? "unknown"}.`);
  const receipt = (await post.json())?.data;
  if (!receipt || !sameRequestFields(request, receipt)) throw new TypeError("Coordination health handoff response conflicts with the submitted metadata.");
  const readbackPath = `${HANDOFF_PATH}/${encodeURIComponent(request.handoffId)}`;
  const readback = transport.kind === "private_uds"
    ? await requestPrivateSupervisorUds(transport.socketPath, readbackPath, { method: "GET", timeoutMs })
    : await fetchImpl(`${endpoint}/${encodeURIComponent(request.handoffId)}`, { method: "GET", headers: { accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
  if (!readback?.ok) throw new TypeError(`Coordination health handoff readback failed with HTTP ${readback?.status ?? "unknown"}.`);
  const persisted = (await readback.json())?.data;
  if (!persisted || !sameRequestFields(request, persisted)) throw new TypeError("Coordination health handoff readback conflicts with the submitted metadata.");
  return persisted;
}

function sameRequestFields(request, received) {
  return isDeepStrictEqual(
    comparableRequestFields(request),
    comparableRequestFields(received),
  );
}

function comparableRequestFields(payload) {
  const fields = Object.fromEntries(MANAGER_COORDINATION_HEALTH_HANDOFF_REQUEST_FIELDS.map((key) => [key, payload?.[key]]));
  const observedAt = fields.coordinationHealth?.observedAt;
  const canonicalObservedAt = canonicalRfc3339Instant(observedAt);
  if (canonicalObservedAt) {
    fields.coordinationHealth = { ...fields.coordinationHealth, observedAt: canonicalObservedAt };
  }
  return fields;
}

function canonicalRfc3339Instant(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const [, rawYear, rawMonth, rawDay, rawHour, rawMinute, rawSecond, rawFraction = "", offset] = match;
  const [year, month, day, hour, minute, second] = [rawYear, rawMonth, rawDay, rawHour, rawMinute, rawSecond].map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59 || offset === "-00:00" || /[1-9]/.test(rawFraction.slice(3))) return null;
  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second, Number(rawFraction.slice(0, 3).padEnd(3, "0"))));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return null;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) ? new Date(epoch).toISOString() : null;
}

function required(value, label, maxLength) {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > maxLength) throw new TypeError(`${label} must be bounded non-empty metadata text.`);
  return value;
}
