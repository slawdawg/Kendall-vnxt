export const SUPERVISOR_TERMINAL_EVENT_METADATA_KEYS = Object.freeze([
  "eventId",
  "evidenceRef",
  "status",
  "persistedAt",
  "metadataOnly",
  "rawPayloadRetained",
]);

export const MANAGER_TERMINAL_EVENT_ID_PATTERN = /^manager-terminal-event:[0-9a-f]{40}$/;

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
  if (event.evidenceRef !== `supervisor-event:${event.eventId}` || event.status !== "persisted") return false;
  if (!isCanonicalTerminalEventTimestamp(event.persistedAt)) return false;
  return event.metadataOnly === true && event.rawPayloadRetained === false;
}

export function normalizeSupervisorTerminalEventMetadata(event) {
  if (!isValidSupervisorTerminalEventMetadata(event)) return null;
  return {
    eventId: event.eventId,
    evidenceRef: event.evidenceRef,
    status: "persisted",
    persistedAt: event.persistedAt,
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}
