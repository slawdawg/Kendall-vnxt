import { isHermesLaneRunId, isHermesOutcomeId, isExternalImpactRequestId, isPolicyDecisionId } from "./ids";
import {
  HERMES_EXTERNAL_IMPACT_REQUEST_SCHEMA_VERSION,
  HERMES_POLICY_DECISION_SCHEMA_VERSION,
  hasExactKeys,
  guardFailsClosed,
  isHermesResult,
  isMetadataOnlyRecord,
  isRecord,
  isSafeText,
  isSafeStringCollection,
  isUtcIsoTimestamp,
  type ExternalImpactRequestV1,
  type PolicyDecisionV1,
} from "./types";

const POLICY_DECISION_FIELDS = [
  "policyDecisionId", "outcomeId", "laneRunId", "schemaVersion", "decision", "reasonCode", "evidenceRefs",
  "nextAction", "observedAt", "idempotencyKey", "createdAt", "metadataOnly", "rawPayloadRetained",
] as const;
const EXTERNAL_IMPACT_REQUEST_FIELDS = [
  "externalImpactRequestId", "outcomeId", "laneRunId", "schemaVersion", "impactType", "target", "effect", "scope",
  "expiresAt", "alternativesConsidered", "classificationRationale", "evidenceRefs", "idempotencyKey", "createdAt", "metadataOnly", "rawPayloadRetained",
] as const;
const IMPACT_TYPES = Object.freeze(["spend", "realUserDeployment"] as const);

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

export function isPolicyDecisionV1(value: unknown): value is PolicyDecisionV1 {
  return guardFailsClosed(() => {
    if (!isRecord(value) || !hasExactKeys(value, POLICY_DECISION_FIELDS)) return false;
    return isPolicyDecisionId(value.policyDecisionId) && isHermesOutcomeId(value.outcomeId) && isHermesLaneRunId(value.laneRunId) &&
      isMetadataOnlyRecord(value, HERMES_POLICY_DECISION_SCHEMA_VERSION, ["observedAt", "createdAt"]) &&
      isHermesResult(value.decision) && isSafeText(value.reasonCode, 160) && isSafeText(value.nextAction, 240) && isUtcIsoTimestamp(value.observedAt);
  });
}

export function isExternalImpactRequestV1(value: unknown): value is ExternalImpactRequestV1 {
  return guardFailsClosed(() => {
    if (!isRecord(value) || !hasExactKeys(value, EXTERNAL_IMPACT_REQUEST_FIELDS)) return false;
    return isExternalImpactRequestId(value.externalImpactRequestId) && isHermesOutcomeId(value.outcomeId) && isHermesLaneRunId(value.laneRunId) &&
      isMetadataOnlyRecord(value, HERMES_EXTERNAL_IMPACT_REQUEST_SCHEMA_VERSION, ["createdAt", "expiresAt"]) &&
      isOneOf(value.impactType, IMPACT_TYPES) && isSafeText(value.target, 240) && isSafeText(value.effect, 500) && isSafeText(value.scope, 500) &&
    isSafeStringCollection(value.alternativesConsidered, 8, 2048) && isSafeText(value.classificationRationale, 500) &&
      Date.parse(value.expiresAt as string) > Date.parse(value.createdAt as string);
  });
}

export const policyDecisionV1Fields = Object.freeze(POLICY_DECISION_FIELDS);
export const externalImpactRequestV1Fields = Object.freeze(EXTERNAL_IMPACT_REQUEST_FIELDS);
