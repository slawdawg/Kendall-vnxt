import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  MANAGER_TERMINAL_EVENT_ID_PATTERN,
  isCanonicalTerminalEventTimestamp,
  normalizeSupervisorTerminalEventMetadata,
} from "./terminal-event-contract.mjs";
import { parseLoopbackSupervisorUrl } from "./loopback-supervisor.mjs";
import { normalizeSupervisorTimeoutMs } from "./supervisor-timeout.mjs";

const TERMINAL_EVENT_PATH = "/manager-control-plane/terminal-events";
const INTEGRATION_MISSING = "missing_supervisor_contract";
const INTEGRATION_PERSISTED = "supervisor_canonical_event";
const REQUEST_KEYS = [
  "eventId", "eventType", "runId", "sourceIdentity", "sourceRevision", "reconciliationCounts",
  "unresolvedApprovalGatedWork", "evidenceRefs", "resumeRequirement", "nextManagerAction",
  "idempotencyKey", "metadataOnly", "rawPayloadRetained",
];
const PERSISTED_EVENT_KEYS = [...REQUEST_KEYS, "createdAt"];
const RECONCILIATION_COUNT_KEYS = [
  "totalItems", "reconciledItems", "eligible", "queued", "leased", "running", "reviewFix",
  "requiredRetrospective", "otherwiseRequired", "completed", "closed", "approvalGated",
];
const UNRESOLVED_APPROVAL_GATED_WORK_KEYS = ["workId", "title", "reason", "sourceRefs", "evidenceRefs"];
const FORBIDDEN_TERMINAL_METADATA = /\b(?:raw[ _-]?(?:prompt|completion|payload|transcript)|provider[ _-]?payload|reasoning[ _-]?trace|terminal[ _-]?scrollback|tmux[ _-]?scrollback|pane[ _-]?scrollback|secret|credential|api[ _-]?key|access[ _-]?token)\b/i;

export class ManagerSupervisorTerminalEventSyncError extends Error {
  constructor(code, message, packet, options = {}) {
    super(message, options);
    this.name = "ManagerSupervisorTerminalEventSyncError";
    this.code = code;
    this.packet = failClosedPacket(packet, code, message);
  }
}

export function deriveManagerTerminalEventId(idempotencyKey) {
  const key = requiredString(idempotencyKey, "terminalDisposition.idempotencyKey", 180);
  return `manager-terminal-event:${createHash("sha256").update(key).digest("hex").slice(0, 40)}`;
}

export function resolveLoopbackSupervisorEndpoint(supervisorUrl) {
  const parsed = parseLoopbackSupervisorUrl(supervisorUrl);
  return new URL(TERMINAL_EVENT_PATH, parsed).href;
}

export function buildManagerTerminalEventRequest(packet) {
  const dispositions = collectTerminalDispositions(packet);
  if (dispositions.length === 0) {
    throw new TypeError("Manager refill packet does not contain an authoritative terminalDisposition.");
  }
  const disposition = dispositions[0];
  if (disposition.canonicalEventIntegration !== INTEGRATION_MISSING) {
    throw new TypeError("Manager terminalDisposition must be in missing_supervisor_contract state before sync.");
  }
  const request = {
    eventId: deriveManagerTerminalEventId(disposition.idempotencyKey),
    eventType: "authoritative_backlog_exhausted",
    runId: disposition.runId,
    sourceIdentity: disposition.sourceIdentity,
    sourceRevision: disposition.sourceRevision,
    reconciliationCounts: disposition.reconciliationCounts,
    unresolvedApprovalGatedWork: disposition.unresolvedApprovalGatedWork,
    evidenceRefs: disposition.evidenceRefs,
    resumeRequirement: disposition.resumeRequirement,
    nextManagerAction: disposition.nextManagerAction,
    idempotencyKey: disposition.idempotencyKey,
    metadataOnly: true,
    rawPayloadRetained: false,
  };
  validateRequestShape(request);
  for (const candidate of dispositions.slice(1)) {
    if (candidate.canonicalEventIntegration !== INTEGRATION_MISSING || candidate.rawPayloadRetained !== false) {
      throw new TypeError("Every manager terminalDisposition must be in the same unsynced metadata-only state.");
    }
    const candidateRequest = buildRequestFromDisposition(candidate, request.eventId);
    if (!isDeepStrictEqual(candidateRequest, request)) {
      throw new TypeError("Manager refill packet contains conflicting terminalDisposition identities.");
    }
  }
  return structuredClone(request);
}

export async function syncManagerSupervisorTerminalEvent(packet, supervisorUrl, context = {}) {
  const sourcePacket = structuredClone(packet);
  let endpoint;
  let request;
  try {
    endpoint = resolveLoopbackSupervisorEndpoint(supervisorUrl);
  } catch (error) {
    throw syncError("manager_supervisor_sync_non_loopback_url", error, sourcePacket);
  }
  try {
    request = buildManagerTerminalEventRequest(sourcePacket);
  } catch (error) {
    throw syncError("manager_supervisor_sync_input_invalid", error, sourcePacket);
  }
  let timeoutMs;
  try {
    timeoutMs = normalizeSupervisorTimeoutMs(context.timeoutMs);
  } catch (error) {
    throw syncError("manager_supervisor_sync_input_invalid", error, sourcePacket);
  }

  const fetchImpl = context.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new ManagerSupervisorTerminalEventSyncError(
      "manager_supervisor_sync_network_unavailable",
      "Supervisor terminal-event sync requires an available fetch implementation.",
      sourcePacket,
    );
  }

  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "accept": "application/json" },
      body: JSON.stringify(request),
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new ManagerSupervisorTerminalEventSyncError(
      "manager_supervisor_sync_network_error",
      "Supervisor terminal-event sync could not reach the loopback supervisor.",
      sourcePacket,
      { cause: error },
    );
  }

  if (!response || typeof response.ok !== "boolean" || !Number.isInteger(response.status)) {
    throw new ManagerSupervisorTerminalEventSyncError(
      "manager_supervisor_sync_response_malformed",
      "Supervisor terminal-event sync returned a malformed HTTP response.",
      sourcePacket,
    );
  }
  if (!response.ok || response.status < 200 || response.status >= 300) {
    throw new ManagerSupervisorTerminalEventSyncError(
      "manager_supervisor_sync_http_error",
      `Supervisor terminal-event sync failed with HTTP ${response.status}.`,
      sourcePacket,
    );
  }

  let envelope;
  try {
    envelope = await response.json();
  } catch (error) {
    throw new ManagerSupervisorTerminalEventSyncError(
      "manager_supervisor_sync_response_malformed",
      "Supervisor terminal-event sync returned non-JSON success data.",
      sourcePacket,
      { cause: error },
    );
  }
  const event = envelope?.data;
  if (!isExactPersistedEvent(event)) {
    throw new ManagerSupervisorTerminalEventSyncError(
      "manager_supervisor_sync_response_malformed",
      "Supervisor terminal-event sync success data is missing bounded persisted event metadata.",
      sourcePacket,
    );
  }
  const returnedIdentity = Object.fromEntries(Object.keys(request).map((key) => [key, event[key]]));
  if (!isDeepStrictEqual(returnedIdentity, request)) {
    throw new ManagerSupervisorTerminalEventSyncError(
      "manager_supervisor_sync_identity_conflict",
      "Supervisor terminal-event sync returned conflicting canonical event identity.",
      sourcePacket,
    );
  }

  const readbackEndpoint = `${endpoint}/${encodeURIComponent(request.eventId)}`;
  let readbackResponse;
  try {
    readbackResponse = await fetchImpl(readbackEndpoint, {
      method: "GET",
      headers: { "accept": "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new ManagerSupervisorTerminalEventSyncError(
      "manager_supervisor_sync_readback_network_error",
      "Supervisor terminal-event sync could not read the exact event from the current loopback store.",
      sourcePacket,
      { cause: error },
    );
  }
  if (!readbackResponse || typeof readbackResponse.ok !== "boolean" || !Number.isInteger(readbackResponse.status)) {
    throw new ManagerSupervisorTerminalEventSyncError(
      "manager_supervisor_sync_readback_malformed",
      "Supervisor terminal-event current-store readback returned a malformed HTTP response.",
      sourcePacket,
    );
  }
  if (!readbackResponse.ok || readbackResponse.status < 200 || readbackResponse.status >= 300) {
    throw new ManagerSupervisorTerminalEventSyncError(
      "manager_supervisor_sync_readback_http_error",
      `Supervisor terminal-event current-store readback failed with HTTP ${readbackResponse.status}.`,
      sourcePacket,
    );
  }
  let readbackEnvelope;
  try {
    readbackEnvelope = await readbackResponse.json();
  } catch (error) {
    throw new ManagerSupervisorTerminalEventSyncError(
      "manager_supervisor_sync_readback_malformed",
      "Supervisor terminal-event current-store readback returned non-JSON success data.",
      sourcePacket,
      { cause: error },
    );
  }
  const readbackEvent = readbackEnvelope?.data;
  if (!isExactPersistedEvent(readbackEvent)) {
    throw new ManagerSupervisorTerminalEventSyncError(
      "manager_supervisor_sync_readback_malformed",
      "Supervisor terminal-event current-store readback is missing bounded metadata-only event data.",
      sourcePacket,
    );
  }
  const readbackIdentity = Object.fromEntries(REQUEST_KEYS.map((key) => [key, readbackEvent[key]]));
  if (!isDeepStrictEqual(readbackIdentity, request)) {
    throw new ManagerSupervisorTerminalEventSyncError(
      "manager_supervisor_sync_readback_identity_conflict",
      "Supervisor terminal-event current-store readback conflicts with the requested canonical identity and evidence.",
      sourcePacket,
    );
  }
  if (readbackEvent.createdAt !== event.createdAt) {
    throw new ManagerSupervisorTerminalEventSyncError(
      "manager_supervisor_sync_readback_stale",
      "Supervisor terminal-event current-store readback does not match the persisted POST result.",
      sourcePacket,
    );
  }

  const supervisorEvent = normalizeSupervisorTerminalEventMetadata({
    eventId: request.eventId,
    evidenceRef: `supervisor-event:${request.eventId}`,
    status: "persisted",
    persistedAt: readbackEvent.createdAt,
    metadataOnly: true,
    rawPayloadRetained: false,
  });
  if (!supervisorEvent) {
    throw new ManagerSupervisorTerminalEventSyncError(
      "manager_supervisor_sync_readback_malformed",
      "Supervisor terminal-event readback could not be projected into the canonical metadata contract.",
      sourcePacket,
    );
  }
  return transformPersistedPacket(sourcePacket, supervisorEvent);
}

function buildRequestFromDisposition(disposition, eventId) {
  return {
    eventId,
    eventType: disposition.disposition,
    runId: disposition.runId,
    sourceIdentity: disposition.sourceIdentity,
    sourceRevision: disposition.sourceRevision,
    reconciliationCounts: disposition.reconciliationCounts,
    unresolvedApprovalGatedWork: disposition.unresolvedApprovalGatedWork,
    evidenceRefs: disposition.evidenceRefs,
    resumeRequirement: disposition.resumeRequirement,
    nextManagerAction: disposition.nextManagerAction,
    idempotencyKey: disposition.idempotencyKey,
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function collectTerminalDispositions(value, found = []) {
  if (!value || typeof value !== "object") return found;
  if (value.disposition === "authoritative_backlog_exhausted") found.push(value);
  for (const [key, nested] of Object.entries(value)) {
    if (key === "supervisorEvent") continue;
    if (Array.isArray(nested)) nested.forEach((item) => collectTerminalDispositions(item, found));
    else if (nested && typeof nested === "object") collectTerminalDispositions(nested, found);
  }
  return found;
}

function transformPersistedPacket(packet, supervisorEvent) {
  const transform = (value) => {
    if (Array.isArray(value)) return value.map(transform);
    if (!value || typeof value !== "object") return value;
    const transformed = Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, transform(nested)]));
    if (transformed.disposition === "authoritative_backlog_exhausted") {
      transformed.canonicalEventIntegration = INTEGRATION_PERSISTED;
      transformed.supervisorEvent = { ...supervisorEvent };
    }
    if (Array.isArray(transformed.blockers)) {
      transformed.blockers = transformed.blockers.filter((blocker) => blockerCode(blocker) !== INTEGRATION_MISSING);
    }
    if (Object.hasOwn(transformed, "supervisorPersistence")) {
      transformed.supervisorPersistence = "persisted; supervisor canonical terminal event recorded";
    }
    return transformed;
  };
  return transform(packet);
}

function failClosedPacket(packet, code, message) {
  const failed = structuredClone(packet && typeof packet === "object" ? packet : { ok: false, status: "blocked", summary: {} });
  const preserveMissingIntegration = (value) => {
    if (Array.isArray(value)) return value.forEach(preserveMissingIntegration);
    if (!value || typeof value !== "object") return;
    if (value.disposition === "authoritative_backlog_exhausted") {
      value.canonicalEventIntegration = INTEGRATION_MISSING;
      delete value.supervisorEvent;
    }
    Object.values(value).forEach(preserveMissingIntegration);
  };
  preserveMissingIntegration(failed);
  failed.ok = false;
  failed.blockers = Array.isArray(failed.blockers) ? failed.blockers : [];
  if (!failed.blockers.some((blocker) => blockerCode(blocker) === INTEGRATION_MISSING)) {
    failed.blockers.push({
      code: INTEGRATION_MISSING,
      message: "Manager terminal disposition is not yet a persisted supervisor-owned canonical event.",
      nextAction: "Restore the loopback supervisor contract and retry the explicit terminal-event sync command.",
    });
  }
  failed.blockers.push({
    code,
    message,
    nextAction: "Do not claim supervisor persistence; repair the typed sync failure and retry explicitly.",
  });
  return failed;
}

function validateRequestShape(request) {
  for (const [field, limit] of [["eventId", 120], ["runId", 120], ["sourceIdentity", 240], ["sourceRevision", 160], ["idempotencyKey", 180], ["resumeRequirement", 360], ["nextManagerAction", 360]]) {
    requiredString(request[field], `terminalDisposition.${field}`, limit);
  }
  if (!MANAGER_TERMINAL_EVENT_ID_PATTERN.test(request.eventId)) throw new TypeError("terminalDisposition.eventId must be canonical manager terminal-event identity.");
  if (!hasExactKeys(request, REQUEST_KEYS)) throw new TypeError("terminalDisposition request metadata keys are invalid.");
  if (!request.reconciliationCounts || typeof request.reconciliationCounts !== "object" || Array.isArray(request.reconciliationCounts) || !hasExactKeys(request.reconciliationCounts, RECONCILIATION_COUNT_KEYS)) throw new TypeError("terminalDisposition.reconciliationCounts must contain only the bounded canonical keys.");
  if (RECONCILIATION_COUNT_KEYS.some((key) => !Number.isInteger(request.reconciliationCounts[key]) || request.reconciliationCounts[key] < 0)) throw new TypeError("terminalDisposition.reconciliationCounts values must be non-negative integers.");
  validateUnresolvedApprovalGatedWork(request.unresolvedApprovalGatedWork);
  validateStringList(request.evidenceRefs, "terminalDisposition.evidenceRefs", 12);
  if (request.metadataOnly !== true) throw new TypeError("terminalDisposition must be metadata-only.");
  if (request.rawPayloadRetained !== false) throw new TypeError("terminalDisposition must prohibit raw payload retention.");
  assertCanonicalMetadataStrings(request);
}

function validateUnresolvedApprovalGatedWork(value) {
  if (!Array.isArray(value) || value.length > 24) throw new TypeError("terminalDisposition.unresolvedApprovalGatedWork is invalid.");
  value.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item) || !hasExactKeys(item, UNRESOLVED_APPROVAL_GATED_WORK_KEYS)) {
      throw new TypeError(`terminalDisposition.unresolvedApprovalGatedWork[${index}] must contain the exact bounded metadata keys.`);
    }
    requiredSafeString(item.workId, `terminalDisposition.unresolvedApprovalGatedWork[${index}].workId`, 140);
    requiredSafeString(item.title, `terminalDisposition.unresolvedApprovalGatedWork[${index}].title`, 180);
    requiredSafeString(item.reason, `terminalDisposition.unresolvedApprovalGatedWork[${index}].reason`, 240);
    validateStringList(item.sourceRefs, `terminalDisposition.unresolvedApprovalGatedWork[${index}].sourceRefs`, 8);
    validateStringList(item.evidenceRefs, `terminalDisposition.unresolvedApprovalGatedWork[${index}].evidenceRefs`, 8);
    if (new Set(item.sourceRefs).size !== item.sourceRefs.length || new Set(item.evidenceRefs).size !== item.evidenceRefs.length) {
      throw new TypeError(`terminalDisposition.unresolvedApprovalGatedWork[${index}] references must be unique.`);
    }
  });
}

function validateStringList(value, field, maxLength) {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxLength) throw new TypeError(`${field} is invalid.`);
  value.forEach((item, index) => requiredSafeString(item, `${field}[${index}]`, 255));
}

function requiredSafeString(value, field, maxLength) {
  requiredString(value, field, maxLength);
  if (FORBIDDEN_TERMINAL_METADATA.test(value)) throw new TypeError(`${field} contains forbidden non-metadata content.`);
  if (/[\u0000-\u001f\u007f]/.test(value)) throw new TypeError(field + " contains control characters.");
  return value;
}

function assertCanonicalMetadataStrings(value, path = "terminalDisposition") {
  if (typeof value === "string") {
    if (value !== value.trim()) throw new TypeError(`${path} must not contain leading or trailing whitespace.`);
    if (/[\u0000-\u001f\u007f]/.test(value)) throw new TypeError(`${path} contains control characters.`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertCanonicalMetadataStrings(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, nested]) => assertCanonicalMetadataStrings(nested, `${path}.${key}`));
  }
}

function isExactPersistedEvent(event) {
  return Boolean(event && typeof event === "object" && !Array.isArray(event) &&
    hasExactKeys(event, PERSISTED_EVENT_KEYS) && isCanonicalTerminalEventTimestamp(event.createdAt));
}

function hasExactKeys(value, expectedKeys) {
  const keys = Object.keys(value);
  return keys.length === expectedKeys.length && keys.every((key) => expectedKeys.includes(key));
}

function requiredString(value, field, maxLength = Number.MAX_SAFE_INTEGER) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw new TypeError(`${field} must be a non-empty bounded string.`);
  return value;
}

function blockerCode(blocker) {
  return typeof blocker === "string" ? blocker : blocker?.code;
}

function syncError(code, error, packet) {
  return new ManagerSupervisorTerminalEventSyncError(code, error instanceof Error ? error.message : String(error), packet, { cause: error });
}
