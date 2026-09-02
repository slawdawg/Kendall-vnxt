import { isHermesLaneRunId, isHermesOutcomeId } from "./ids";
import {
  HERMES_OUTCOME_SCHEMA_VERSION,
  HERMES_LANE_RUN_SCHEMA_VERSION,
  isDecisionFields,
  hasExactKeys,
  guardFailsClosed,
  isMetadataOnlyRecord,
  isRecord,
  isSafeText,
  isTimestampOrder,
  isUtcIsoTimestamp,
  type HermesOutcomeV1,
} from "./types";

const OUTCOME_FIELDS = [
  "outcomeId", "schemaVersion", "title", "summary", "status", "result", "reasonCode", "evidenceRefs",
  "nextAction", "observedAt", "idempotencyKey", "createdAt", "updatedAt", "metadataOnly", "rawPayloadRetained",
] as const;
const LANE_RUN_FIELDS = [
  "laneRunId", "outcomeId", "schemaVersion", "laneType", "status", "result", "reasonCode", "evidenceRefs",
  "nextAction", "heartbeatAt", "staleDeadlineAt", "timeoutAt", "retryBudget", "reworkBudget", "evidenceFingerprint",
  "observedAt", "idempotencyKey", "createdAt", "updatedAt", "metadataOnly", "rawPayloadRetained",
] as const;
const OUTCOME_STATUSES = Object.freeze(["proposed", "active", "review", "completed", "blocked", "rework"] as const);
const LANE_RUN_STATUSES = Object.freeze(["queued", "running", "review", "rework", "completed", "blocked"] as const);

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

export function isHermesOutcomeV1(value: unknown): value is HermesOutcomeV1 {
  return guardFailsClosed(() => {
    if (!isRecord(value) || !hasExactKeys(value, OUTCOME_FIELDS) || !isHermesOutcomeId(value.outcomeId)) return false;
    return isMetadataOnlyRecord(value, HERMES_OUTCOME_SCHEMA_VERSION, ["observedAt", "createdAt", "updatedAt"]) &&
      isSafeText(value.title, 240) && isSafeText(value.summary) && isOneOf(value.status, OUTCOME_STATUSES) &&
      isDecisionFields(value) && isTimestampOrder(value, ["createdAt", "observedAt", "updatedAt"]);
  });
}

export function isHermesLaneRunV1(value: unknown): value is import("./types").HermesLaneRunV1 {
  return guardFailsClosed(() => {
    if (!isRecord(value) || !hasExactKeys(value, LANE_RUN_FIELDS) || !isHermesLaneRunId(value.laneRunId) || !isHermesOutcomeId(value.outcomeId)) return false;
    return isMetadataOnlyRecord(value, HERMES_LANE_RUN_SCHEMA_VERSION, ["observedAt", "createdAt", "updatedAt"]) &&
      isSafeText(value.laneType, 120) && isOneOf(value.status, LANE_RUN_STATUSES) && isDecisionFields(value) &&
      ["heartbeatAt", "staleDeadlineAt", "timeoutAt"].every((field) => isUtcIsoTimestamp(value[field])) &&
      ["retryBudget", "reworkBudget"].every((field) => typeof value[field] === "number" && Number.isSafeInteger(value[field]) && value[field] >= 0) &&
      isSafeText(value.evidenceFingerprint, 240) && isTimestampOrder(value, ["createdAt", "heartbeatAt", "staleDeadlineAt", "timeoutAt"]);
  });
}

export const hermesOutcomeV1Fields = Object.freeze(OUTCOME_FIELDS);
export const hermesLaneRunV1Fields = Object.freeze(LANE_RUN_FIELDS);
