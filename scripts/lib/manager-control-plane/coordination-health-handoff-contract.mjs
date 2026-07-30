export const MANAGER_COORDINATION_HEALTH_HANDOFF_SCHEMA_VERSION = "manager-coordination-health-handoff/v0";
export const MANAGER_COORDINATION_HEALTH_HANDOFF_ID_PATTERN = /^manager-coordination-health-handoff:[0-9a-f]{40}$/;
export const MANAGER_COORDINATION_HEALTH_HANDOFF_REQUEST_FIELDS = Object.freeze([
  "schemaVersion", "handoffId", "sourceSequence", "coordinationHealth", "idempotencyKey", "metadataOnly", "rawPayloadRetained",
]);
export const MANAGER_COORDINATION_HEALTH_HANDOFF_VIEW_FIELDS = Object.freeze([
  ...MANAGER_COORDINATION_HEALTH_HANDOFF_REQUEST_FIELDS, "owner", "createdAt",
]);
export const MANAGER_COORDINATION_HEALTH_HANDOFF_API_ENVELOPE_FIELDS = Object.freeze(["data", "meta"]);
export const MANAGER_COORDINATION_HEALTH_HANDOFF_API_ENVELOPE_REQUIRED_FIELDS = Object.freeze(["data"]);
