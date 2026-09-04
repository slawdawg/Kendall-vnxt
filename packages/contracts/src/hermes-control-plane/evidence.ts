import { isDeliveryEvidenceId, isHermesLaneRunId, isHermesOutcomeId } from "./ids";
import {
  HERMES_DELIVERY_EVIDENCE_SCHEMA_VERSION,
  isEvidenceRefs,
  hasExactKeys,
  guardFailsClosed,
  isMetadataOnlyRecord,
  isRecord,
  isSafeText,
  type DeliveryEvidenceV1,
} from "./types";

const DELIVERY_EVIDENCE_FIELDS = [
  "deliveryEvidenceId", "outcomeId", "laneRunId", "taskId", "schemaVersion", "evidenceType", "summary", "sourceRef",
  "observedAt", "evidenceRefs", "idempotencyKey", "createdAt", "metadataOnly", "rawPayloadRetained",
] as const;

export function isDeliveryEvidenceV1(value: unknown): value is DeliveryEvidenceV1 {
  return guardFailsClosed(() => {
    if (!isRecord(value) || !hasExactKeys(value, DELIVERY_EVIDENCE_FIELDS)) return false;
    return isDeliveryEvidenceId(value.deliveryEvidenceId) && isHermesOutcomeId(value.outcomeId) && isHermesLaneRunId(value.laneRunId) && isSafeText(value.taskId, 160) &&
      isMetadataOnlyRecord(value, HERMES_DELIVERY_EVIDENCE_SCHEMA_VERSION, ["observedAt", "createdAt"]) &&
      isSafeText(value.evidenceType, 120) && isSafeText(value.summary) && isSafeText(value.sourceRef, 300) && isEvidenceRefs(value.evidenceRefs);
  });
}

export const deliveryEvidenceV1Fields = Object.freeze(DELIVERY_EVIDENCE_FIELDS);
