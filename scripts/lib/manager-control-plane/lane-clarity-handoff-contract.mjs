export const MANAGER_LANE_CLARITY_HANDOFF_SCHEMA_VERSION = "manager-lane-clarity-handoff/v0";
export const MANAGER_LANE_CLARITY_HANDOFF_ID_PATTERN = /^manager-lane-clarity-handoff:[0-9a-f]{40}$/;
export const MANAGER_LANE_CLARITY_HANDOFF_REQUEST_FIELDS = Object.freeze([
  "schemaVersion", "handoffId", "selectedLaneId", "runId", "eventWatermark", "sourceCursor",
  "sourceSequence", "observedAt", "laneClarity", "idempotencyKey", "metadataOnly", "rawPayloadRetained",
]);
export const MANAGER_LANE_CLARITY_HANDOFF_VIEW_FIELDS = Object.freeze([
  ...MANAGER_LANE_CLARITY_HANDOFF_REQUEST_FIELDS, "owner", "createdAt",
]);
export const MANAGER_LANE_CLARITY_HANDOFF_API_ENVELOPE_FIELDS = Object.freeze(["data", "meta"]);
export const MANAGER_LANE_CLARITY_HANDOFF_API_ENVELOPE_REQUIRED_FIELDS = Object.freeze(["data"]);
