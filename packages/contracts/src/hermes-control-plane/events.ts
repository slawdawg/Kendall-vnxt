import { isFollowUpWorkId, isOpaqueId } from "./ids";
import {
  HERMES_FOLLOW_UP_WORK_SCHEMA_VERSION,
  HERMES_BOARD_LIFECYCLE_EVENT_SCHEMA_VERSION,
  HERMES_LIFECYCLE_EVENT_SCHEMA_VERSION,
  hasExactKeys,
  guardFailsClosed,
  isDecisionFields,
  isMetadataOnlyRecord,
  isRecord,
  isSafeText,
  isTimestampOrder,
  type FollowUpWorkV1,
  type HermesLifecycleEventName,
  type HermesBoardLifecycleEventV1,
  type HermesLifecycleEventV1,
} from "./types";
import { isHermesCausationId, isHermesCorrelationId, isHermesLaneRunId, isHermesOutcomeId, isHermesEventId } from "./ids";

export const HERMES_LIFECYCLE_EVENT_NAMES = Object.freeze([
  "hermes.outcome.created",
  "hermes.lane.recovered",
  "hermes.delivery.denied",
  "hermes.external-impact.requested",
] as const);

const EVENT_FIELDS = [
  "eventId", "outcomeId", "laneRunId", "schemaVersion", "eventName", "result", "reasonCode", "evidenceRefs", "nextAction",
  "correlationId", "causationId", "observedAt", "idempotencyKey", "emittedAt", "metadataOnly", "rawPayloadRetained", "authoritative",
] as const;
const BOARD_EVENT_FIELDS = [
  "schemaVersion", "issuerId", "keyId", "eventId", "idempotencyKey", "boardId", "cardId", "outcomeId", "laneRunId",
  "eventName", "result", "reasonCode", "evidenceRefs", "nextAction", "correlationId", "causationId", "observedAt",
  "emittedAt", "expiresAt", "signatureB64", "metadataOnly", "rawPayloadRetained", "authoritative",
] as const;
const BOARD_EVENT_OPAQUE_IDS = ["issuerId", "keyId", "eventId", "boardId", "cardId", "outcomeId", "laneRunId"] as const;
const FOLLOW_UP_FIELDS = [
  "followUpWorkId", "parentOutcomeId", "schemaVersion", "title", "summary", "dedupeKey", "owner", "priorityRationale",
  "capacityState", "reviewAt", "expiresAt", "status", "result", "reasonCode", "evidenceRefs", "nextAction", "observedAt",
  "idempotencyKey", "createdAt", "metadataOnly", "rawPayloadRetained",
] as const;
const FOLLOW_UP_STATUSES = Object.freeze(["proposed", "queued", "active", "completed", "blocked"] as const);
const FOLLOW_UP_CAPACITY_STATES = Object.freeze(["available", "atCapacity", "admissionBlocked"] as const);

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

export function isHermesLifecycleEventV1(value: unknown): value is HermesLifecycleEventV1 {
  return guardFailsClosed(() => {
    if (!isRecord(value) || !hasExactKeys(value, EVENT_FIELDS)) return false;
    return isHermesEventId(value.eventId) && isHermesOutcomeId(value.outcomeId) && isHermesLaneRunId(value.laneRunId) &&
      isHermesCorrelationId(value.correlationId) && isHermesCausationId(value.causationId) &&
      isMetadataOnlyRecord(value, HERMES_LIFECYCLE_EVENT_SCHEMA_VERSION, ["observedAt", "emittedAt"]) &&
      isOneOf(value.eventName, HERMES_LIFECYCLE_EVENT_NAMES) && isDecisionFields(value) && value.authoritative === false &&
      isTimestampOrder(value, ["observedAt", "emittedAt"]);
  });
}

export function isHermesBoardLifecycleEventV1(value: unknown): value is HermesBoardLifecycleEventV1 {
  return guardFailsClosed(() => {
    if (!isRecord(value) || !hasExactKeys(value, BOARD_EVENT_FIELDS)) return false;
    if (BOARD_EVENT_OPAQUE_IDS.some((field) => typeof value[field] !== "string" || value[field].length > 120)) return false;
    return isOpaqueId(value.issuerId) && isOpaqueId(value.keyId) && isOpaqueId(value.boardId) && isOpaqueId(value.cardId) &&
      isHermesEventId(value.eventId) && isHermesOutcomeId(value.outcomeId) && isHermesLaneRunId(value.laneRunId) &&
      isHermesCorrelationId(value.correlationId) && isHermesCausationId(value.causationId) &&
      isMetadataOnlyRecord(value, HERMES_BOARD_LIFECYCLE_EVENT_SCHEMA_VERSION, ["observedAt", "emittedAt", "expiresAt"]) &&
      isOneOf(value.eventName, HERMES_LIFECYCLE_EVENT_NAMES) && isDecisionFields(value) && value.authoritative === false &&
      typeof value.signatureB64 === "string" && /^[A-Za-z0-9+/]+={0,2}$/.test(value.signatureB64) && value.signatureB64.length <= 256 &&
      isTimestampOrder(value, ["observedAt", "emittedAt", "expiresAt"]);
  });
}

export function isFollowUpWorkV1(value: unknown): value is FollowUpWorkV1 {
  return guardFailsClosed(() => {
    if (!isRecord(value) || !hasExactKeys(value, FOLLOW_UP_FIELDS)) return false;
    return isFollowUpWorkId(value.followUpWorkId) && isHermesOutcomeId(value.parentOutcomeId) &&
      isMetadataOnlyRecord(value, HERMES_FOLLOW_UP_WORK_SCHEMA_VERSION, ["observedAt", "createdAt", "reviewAt", "expiresAt"]) &&
      isSafeText(value.title, 240) && isSafeText(value.summary) && isOpaqueId(value.dedupeKey) && isSafeText(value.owner, 160) &&
      isSafeText(value.priorityRationale, 500) && isOneOf(value.capacityState, FOLLOW_UP_CAPACITY_STATES) &&
      isOneOf(value.status, FOLLOW_UP_STATUSES) && isDecisionFields(value) && Date.parse(value.expiresAt as string) >= Date.parse(value.reviewAt as string);
  });
}

export const hermesLifecycleEventV1Fields = Object.freeze(EVENT_FIELDS);
export const hermesBoardLifecycleEventV1Fields = Object.freeze(BOARD_EVENT_FIELDS);
export const followUpWorkV1Fields = Object.freeze(FOLLOW_UP_FIELDS);
