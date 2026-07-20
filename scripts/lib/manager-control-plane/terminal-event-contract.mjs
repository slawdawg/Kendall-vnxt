export const SUPERVISOR_TERMINAL_EVENT_METADATA_KEYS = Object.freeze([
  "eventId",
  "evidenceRef",
  "status",
  "owner",
  "persistedAt",
  "metadataOnly",
  "rawPayloadRetained",
]);

export const MANAGER_TERMINAL_EVENT_ID_PATTERN = /^manager-terminal-event:[0-9a-f]{40}$/;
export const MANAGER_TERMINAL_EVENT_TYPE = "authoritative_backlog_exhausted";
export const SUPERVISOR_TERMINAL_INTEGRATION_MISSING = "missing_supervisor_contract";
export const SUPERVISOR_TERMINAL_INTEGRATION_PERSISTED = "supervisor_canonical_event";
export const MANAGER_TERMINAL_EVENT_REQUEST_FIELDS = Object.freeze([
  "eventId",
  "eventType",
  "runId",
  "sourceIdentity",
  "sourceRevision",
  "reconciliationCounts",
  "unresolvedApprovalGatedWork",
  "evidenceRefs",
  "resumeRequirement",
  "nextManagerAction",
  "idempotencyKey",
  "metadataOnly",
  "rawPayloadRetained",
]);
export const MANAGER_TERMINAL_EVENT_VIEW_FIELDS = Object.freeze([
  ...MANAGER_TERMINAL_EVENT_REQUEST_FIELDS,
  "owner",
  "createdAt",
]);
export const MANAGER_TERMINAL_EVENT_API_ENVELOPE_FIELDS = Object.freeze([
  "data",
  "meta",
]);
export const MANAGER_TERMINAL_EVENT_API_ENVELOPE_REQUIRED_FIELDS = Object.freeze([
  "data",
]);
export const MANAGER_TERMINAL_EVENT_RECONCILIATION_COUNT_FIELDS = Object.freeze([
  "totalItems",
  "reconciledItems",
  "eligible",
  "queued",
  "leased",
  "running",
  "reviewFix",
  "requiredRetrospective",
  "otherwiseRequired",
  "completed",
  "closed",
  "approvalGated",
]);
export const MANAGER_TERMINAL_EVENT_UNRESOLVED_WORK_FIELDS = Object.freeze([
  "workId",
  "title",
  "reason",
  "sourceRefs",
  "evidenceRefs",
]);

export function isCanonicalTerminalEventTimestamp(value) {
  return typeof value === "string" &&
    value.length <= 64 &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value;
}

export function isValidSupervisorTerminalEventMetadata(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return false;
  const keys = Object.keys(event);
  if (keys.length !== SUPERVISOR_TERMINAL_EVENT_METADATA_KEYS.length ||
    keys.some((key) => !SUPERVISOR_TERMINAL_EVENT_METADATA_KEYS.includes(key))) return false;
  if (typeof event.eventId !== "string" || !MANAGER_TERMINAL_EVENT_ID_PATTERN.test(event.eventId)) return false;
  if (event.evidenceRef !== `supervisor-event:${event.eventId}` || event.status !== "persisted" || event.owner !== "supervisor") return false;
  if (!isCanonicalTerminalEventTimestamp(event.persistedAt)) return false;
  return event.metadataOnly === true && event.rawPayloadRetained === false;
}

export function normalizeSupervisorTerminalEventMetadata(event) {
  if (!isValidSupervisorTerminalEventMetadata(event)) return null;
  return {
    eventId: event.eventId,
    evidenceRef: event.evidenceRef,
    status: "persisted",
    owner: "supervisor",
    persistedAt: event.persistedAt,
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}
