import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { parseLoopbackSupervisorUrl } from "./loopback-supervisor.mjs";
import { privateSupervisorUdsEndpoint, requestPrivateSupervisorUds, resolvePrivateSupervisorUdsPath } from "./private-supervisor-uds.mjs";
import { normalizeSupervisorTimeoutMs } from "./supervisor-timeout.mjs";
import {
  MANAGER_LANE_CLARITY_HANDOFF_ID_PATTERN,
  MANAGER_LANE_CLARITY_HANDOFF_REQUEST_FIELDS,
  MANAGER_LANE_CLARITY_HANDOFF_SCHEMA_VERSION,
} from "./lane-clarity-handoff-contract.mjs";

const HANDOFF_PATH = "/manager-control-plane/lane-clarity-handoffs";

export function deriveManagerLaneClarityHandoffId(idempotencyKey) {
  if (typeof idempotencyKey !== "string" || !idempotencyKey.trim() || idempotencyKey !== idempotencyKey.trim()) {
    throw new TypeError("Lane clarity handoff idempotencyKey must be non-empty metadata text.");
  }
  const handoffId = `manager-lane-clarity-handoff:${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 40)}`;
  if (!MANAGER_LANE_CLARITY_HANDOFF_ID_PATTERN.test(handoffId)) throw new TypeError("Lane clarity handoff ID is not canonical.");
  return handoffId;
}

export function resolveLoopbackLaneClarityHandoffEndpoint(supervisorUrl) {
  return new URL(HANDOFF_PATH, parseLoopbackSupervisorUrl(supervisorUrl)).href;
}

export function resolveLaneClarityHandoffTransport(supervisorUrl, context = {}) {
  const socketPath = resolvePrivateSupervisorUdsPath(context);
  return socketPath
    ? { kind: "private_uds", socketPath, endpoint: privateSupervisorUdsEndpoint(socketPath, HANDOFF_PATH) }
    : { kind: "loopback", endpoint: resolveLoopbackLaneClarityHandoffEndpoint(supervisorUrl) };
}

export function buildManagerLaneClarityHandoffRequest(summary, context = {}) {
  const clarity = summary?.laneClarity;
  const selectedLaneId = required(context.selectedLaneId, "selectedLaneId", 160);
  const sourceSequence = context.sourceSequence;
  if (!Number.isSafeInteger(sourceSequence) || sourceSequence <= 0) {
    throw new TypeError("sourceSequence must be a positive safe integer.");
  }
  if (!clarity || typeof clarity !== "object") throw new TypeError("Manager summary must include laneClarity.");
  const runId = required(clarity.runId, "laneClarity.runId", 120);
  const eventWatermark = required(clarity.eventWatermark, "laneClarity.eventWatermark", 160);
  const sourceCursor = required(clarity.sourceCursor, "laneClarity.sourceCursor", 160);
  const observedAt = required(context.observedAt, "observedAt", 64);
  if (Number.isNaN(Date.parse(observedAt))) throw new TypeError("observedAt must be an ISO timestamp.");
  const idempotencyKey = required(context.idempotencyKey ?? `manager-lane-clarity:${selectedLaneId}:${runId}:${eventWatermark}:${sourceCursor}:${sourceSequence}`, "idempotencyKey", 180);
  const request = {
    schemaVersion: MANAGER_LANE_CLARITY_HANDOFF_SCHEMA_VERSION,
    handoffId: deriveManagerLaneClarityHandoffId(idempotencyKey),
    selectedLaneId,
    runId,
    eventWatermark,
    sourceCursor,
    sourceSequence,
    observedAt,
    laneClarity: structuredClone(clarity),
    idempotencyKey,
    metadataOnly: true,
    rawPayloadRetained: false,
  };
  if (clarity.runId !== runId || clarity.eventWatermark !== eventWatermark || clarity.sourceCursor !== sourceCursor) {
    throw new TypeError("Lane clarity handoff must bind one exact clarity snapshot.");
  }
  return request;
}

export async function syncManagerSupervisorLaneClarity(summary, supervisorUrl, context = {}) {
  const transport = resolveLaneClarityHandoffTransport(supervisorUrl, context);
  const endpoint = transport.endpoint;
  const request = buildManagerLaneClarityHandoffRequest(summary, context);
  const timeoutMs = normalizeSupervisorTimeoutMs(context.timeoutMs);
  const fetchImpl = context.fetchImpl ?? globalThis.fetch;
  if (transport.kind === "loopback" && typeof fetchImpl !== "function") throw new TypeError("Lane clarity handoff requires a fetch implementation.");
  const post = transport.kind === "private_uds"
    ? await requestPrivateSupervisorUds(transport.socketPath, HANDOFF_PATH, { method: "POST", body: request, timeoutMs })
    : await fetchImpl(endpoint, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(request), redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
  if (!post?.ok) throw new TypeError(`Lane clarity handoff failed with HTTP ${post?.status ?? "unknown"}.`);
  const receipt = (await post.json())?.data;
  if (!receipt || !sameRequestFields(request, receipt)) {
    throw new TypeError("Lane clarity handoff response conflicts with the submitted metadata.");
  }
  const readbackPath = `${HANDOFF_PATH}/${encodeURIComponent(request.handoffId)}`;
  const readback = transport.kind === "private_uds"
    ? await requestPrivateSupervisorUds(transport.socketPath, readbackPath, { method: "GET", timeoutMs })
    : await fetchImpl(`${endpoint}/${encodeURIComponent(request.handoffId)}`, { method: "GET", headers: { accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
  if (!readback?.ok) throw new TypeError(`Lane clarity handoff readback failed with HTTP ${readback?.status ?? "unknown"}.`);
  const persisted = (await readback.json())?.data;
  if (!persisted || !sameRequestFields(request, persisted)) {
    throw new TypeError("Lane clarity handoff readback conflicts with the submitted metadata.");
  }
  return persisted;
}

function selectRequestFields(value) {
  return Object.fromEntries(MANAGER_LANE_CLARITY_HANDOFF_REQUEST_FIELDS.map((key) => [key, value[key]]));
}

function sameRequestFields(request, received) {
  const expected = selectRequestFields(request);
  const actual = selectRequestFields(received);
  // The supervisor's RFC 3339 serializer may expand JavaScript millisecond
  // precision (for example, `.000Z` to `.000000Z`). Compare the instant, not
  // the renderer-specific spelling, while keeping every other request field
  // exact.
  expected.observedAt = canonicalTimestamp(expected.observedAt);
  actual.observedAt = canonicalTimestamp(actual.observedAt);
  return isDeepStrictEqual(expected, actual);
}

function canonicalTimestamp(value) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return value;
  return new Date(value).toISOString();
}

function required(value, label, maxLength) {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > maxLength) {
    throw new TypeError(`${label} must be bounded non-empty metadata text.`);
  }
  return value;
}
