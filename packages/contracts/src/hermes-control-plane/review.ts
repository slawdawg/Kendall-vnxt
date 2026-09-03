import { isHermesLaneRunId, isHermesOutcomeId, isOpaqueId, isReviewDispositionId, isVerificationRecordId } from "./ids";
import { HERMES_REVIEW_DISPOSITION_SCHEMA_VERSION, HERMES_VERIFICATION_RECORD_SCHEMA_VERSION, guardFailsClosed, hasExactKeys, isEvidenceRefs, isMetadataOnlyRecord, isRecord, isSafeText, isTimestampOrder, type HermesReviewerUnavailableExceptionV1, type HermesUnavailableReviewerBlockV1, type ReviewDispositionV1, type ReviewHandoffV1, type VerificationRecordV1 } from "./types";

const VERIFICATION_FIELDS = ["verificationRecordId", "outcomeId", "laneRunId", "schemaVersion", "result", "target", "sourceFingerprint", "developerIdentity", "developerHome", "developerWorkspace", "evidenceRefs", "observedAt", "idempotencyKey", "createdAt", "metadataOnly", "rawPayloadRetained", "expectedOutcomeRevision", "expectedLaneRevision"] as const;
const DISPOSITION_FIELDS = ["reviewDispositionId", "verificationRecordId", "outcomeId", "developerLaneRunId", "schemaVersion", "disposition", "reviewerIdentity", "reviewerHome", "reviewerWorkspace", "reasonCode", "nextAction", "evidenceRefs", "observedAt", "idempotencyKey", "createdAt", "metadataOnly", "rawPayloadRetained", "expectedOutcomeRevision", "expectedLaneRevision"] as const;
const UNAVAILABLE_REVIEWER_EXCEPTION_FIELDS = ["exceptionId", "outcomeId", "laneRunId", "reason", "riskClass", "compensatingReviewRef", "recordedBy", "recordedAt", "reviewOrExpiryAt", "metadataOnly", "rawPayloadRetained"] as const;
const UNAVAILABLE_REVIEWER_BLOCK_FIELDS = ["unavailableReviewerBlockId", "verificationRecordId", "outcomeId", "developerLaneRunId", "schemaVersion", "expectedOutcomeRevision", "expectedLaneRevision", "reasonCode", "nextAction", "evidenceRefs", "observedAt", "idempotencyKey", "createdAt", "metadataOnly", "rawPayloadRetained"] as const;
const NULLABLE_HANDOFF_FIELDS = new Set(["disposition", "unavailableReviewerException", "unavailableReviewerBlock", "developerCapabilityBindingId", "developerCapabilityProof", "reviewerCapabilityBindingId", "reviewerCapabilityProof", "operatorCapabilityBindingId", "operatorCapabilityProof"]);
const distinct = (...values: unknown[]) => new Set(values).size === values.length;

const isReviewMetadataOnlyRecord = (value: Record<string, unknown>, schemaVersion: string) =>
  isMetadataOnlyRecord(value, schemaVersion, ["observedAt", "createdAt"]) &&
  typeof value.idempotencyKey === "string" && value.idempotencyKey.length <= 180;

export function isVerificationRecordV1(value: unknown): value is VerificationRecordV1 {
  return guardFailsClosed(() => !!isRecord(value) && hasExactKeys(value, VERIFICATION_FIELDS) && isVerificationRecordId(value.verificationRecordId) && isHermesOutcomeId(value.outcomeId) && isHermesLaneRunId(value.laneRunId) && isReviewMetadataOnlyRecord(value, HERMES_VERIFICATION_RECORD_SCHEMA_VERSION) && isTimestampOrder(value, ["createdAt", "observedAt"]) && ["passed", "failed", "inconclusive"].includes(value.result as string) && isSafeText(value.target, 240) && isSafeText(value.sourceFingerprint, 240) && isOpaqueId(value.developerIdentity) && isSafeText(value.developerHome, 240) && isSafeText(value.developerWorkspace, 240) && distinct(value.developerIdentity, value.developerHome, value.developerWorkspace) && isEvidenceRefs(value.evidenceRefs) && Number.isInteger(value.expectedOutcomeRevision) && (value.expectedOutcomeRevision as number) > 0 && Number.isInteger(value.expectedLaneRevision) && (value.expectedLaneRevision as number) > 0);
}
export function isReviewDispositionV1(value: unknown): value is ReviewDispositionV1 {
  return guardFailsClosed(() => !!isRecord(value) && hasExactKeys(value, DISPOSITION_FIELDS) && isReviewDispositionId(value.reviewDispositionId) && isVerificationRecordId(value.verificationRecordId) && isHermesOutcomeId(value.outcomeId) && isHermesLaneRunId(value.developerLaneRunId) && isReviewMetadataOnlyRecord(value, HERMES_REVIEW_DISPOSITION_SCHEMA_VERSION) && isTimestampOrder(value, ["createdAt", "observedAt"]) && ["approve", "rework", "technical_block"].includes(value.disposition as string) && isOpaqueId(value.reviewerIdentity) && isSafeText(value.reviewerHome, 240) && isSafeText(value.reviewerWorkspace, 240) && distinct(value.reviewerIdentity, value.reviewerHome, value.reviewerWorkspace) && Number.isInteger(value.expectedOutcomeRevision) && (value.expectedOutcomeRevision as number) > 0 && Number.isInteger(value.expectedLaneRevision) && (value.expectedLaneRevision as number) > 0 && isSafeText(value.reasonCode, 120) && isSafeText(value.nextAction, 360) && isEvidenceRefs(value.evidenceRefs));
}

export function isHermesReviewerUnavailableExceptionV1(value: unknown): value is HermesReviewerUnavailableExceptionV1 {
  return guardFailsClosed(() => !!isRecord(value) && hasExactKeys(value, UNAVAILABLE_REVIEWER_EXCEPTION_FIELDS) && isOpaqueId(value.exceptionId) && value.exceptionId.length <= 120 && isHermesOutcomeId(value.outcomeId) && value.outcomeId.length <= 120 && isHermesLaneRunId(value.laneRunId) && value.laneRunId.length <= 120 && isSafeText(value.reason, 120) && ["technical_block", "medium"].includes(value.riskClass as string) && isSafeText(value.compensatingReviewRef, 240) && isSafeText(value.recordedBy, 120) && value.metadataOnly === true && value.rawPayloadRetained === false && isTimestampOrder(value, ["recordedAt", "reviewOrExpiryAt"]) && Date.parse(value.recordedAt as string) < Date.parse(value.reviewOrExpiryAt as string));
}

export function isHermesUnavailableReviewerBlockV1(value: unknown): value is HermesUnavailableReviewerBlockV1 {
  return guardFailsClosed(() => !!isRecord(value) && hasExactKeys(value, UNAVAILABLE_REVIEWER_BLOCK_FIELDS) &&
    isOpaqueId(value.unavailableReviewerBlockId) && isVerificationRecordId(value.verificationRecordId) &&
    isHermesOutcomeId(value.outcomeId) && isHermesLaneRunId(value.developerLaneRunId) &&
    isMetadataOnlyRecord(value, "unavailable_reviewer_block.v1", ["observedAt", "createdAt"]) &&
    isTimestampOrder(value, ["createdAt", "observedAt"]) && Number.isInteger(value.expectedOutcomeRevision) &&
    (value.expectedOutcomeRevision as number) > 0 && Number.isInteger(value.expectedLaneRevision) &&
    (value.expectedLaneRevision as number) > 0 && isSafeText(value.reasonCode, 120) &&
    isSafeText(value.nextAction, 360) && isEvidenceRefs(value.evidenceRefs) && value.evidenceRefs.length <= 25);
}

const REVIEW_HANDOFF_FIELDS = ["verification", "disposition", "reviewerCapabilityBindingId", "reviewerCapabilityProof"] as const;
const REVIEW_HANDOFF_EXCEPTION_FIELDS = ["verification", "disposition", "unavailableReviewerException", "reviewerCapabilityBindingId", "reviewerCapabilityProof"] as const;
const OPERATOR_UNAVAILABLE_REVIEWER_HANDOFF_FIELDS = ["verification", "unavailableReviewerException", "unavailableReviewerBlock", "operatorCapabilityBindingId", "operatorCapabilityProof"] as const;
const VERIFICATION_ONLY_HANDOFF_FIELDS = ["verification", "developerCapabilityBindingId", "developerCapabilityProof"] as const;
const pathParts = (value: string) => value.split(/[:\\\\/]+/).reduce<string[]>((parts, part) => {
  if (!part || part === ".") return parts;
  if (part === "..") { parts.pop(); return parts; }
  parts.push(part); return parts;
}, []);
const overlaps = (left: string, right: string) => {
  const a = pathParts(left), b = pathParts(right);
  return a.every((part, index) => b[index] === part) || b.every((part, index) => a[index] === part);
};
const occursAtOrAfter = (left: string, right: string) => {
  const leftMillis = Date.parse(left), rightMillis = Date.parse(right);
  return Number.isFinite(leftMillis) && Number.isFinite(rightMillis) && leftMillis >= rightMillis;
};
const isCapabilityBindingId = (value: unknown) => isOpaqueId(value) && value.length <= 120;
// Capability proofs are opaque authentication material, not metadata. Match
// the authoritative API bounds without applying metadata redaction heuristics.
const isCapabilityProof = (value: unknown) => typeof value === "string" && value.length >= 24 && value.length <= 512;

/** Reject independently-valid records unless their identity, chronology, and isolation bind together. */
export function isReviewHandoffV1(value: unknown): value is ReviewHandoffV1 {
  return guardFailsClosed(() => {
    if (!isRecord(value) || !isVerificationRecordV1(value.verification)) return false;
    const handoff = Object.fromEntries(Object.entries(value).filter(([field, fieldValue]) => !(fieldValue === null && NULLABLE_HANDOFF_FIELDS.has(field))));
    if (!isRecord(handoff) || !isVerificationRecordV1(handoff.verification)) return false;
    const verification = handoff.verification;
    if (hasExactKeys(handoff, OPERATOR_UNAVAILABLE_REVIEWER_HANDOFF_FIELDS)) {
      const block = handoff.unavailableReviewerBlock;
      const exception = handoff.unavailableReviewerException;
      return verification.result === "passed" && isHermesUnavailableReviewerBlockV1(block) &&
        isHermesReviewerUnavailableExceptionV1(exception) && isCapabilityBindingId(handoff.operatorCapabilityBindingId) &&
        isCapabilityProof(handoff.operatorCapabilityProof) && block.verificationRecordId === verification.verificationRecordId &&
        block.outcomeId === verification.outcomeId && block.developerLaneRunId === verification.laneRunId &&
        block.expectedOutcomeRevision === verification.expectedOutcomeRevision && block.expectedLaneRevision === verification.expectedLaneRevision &&
        exception.outcomeId === verification.outcomeId && exception.laneRunId === verification.laneRunId &&
        occursAtOrAfter(block.observedAt, verification.observedAt) && occursAtOrAfter(exception.recordedAt, verification.observedAt) &&
        occursAtOrAfter(block.observedAt, exception.recordedAt);
    }
    if (hasExactKeys(handoff, VERIFICATION_ONLY_HANDOFF_FIELDS)) return isCapabilityBindingId(handoff.developerCapabilityBindingId) && isCapabilityProof(handoff.developerCapabilityProof);
    if (verification.result !== "passed") return false;
    if (!(hasExactKeys(handoff, REVIEW_HANDOFF_FIELDS) || hasExactKeys(handoff, REVIEW_HANDOFF_EXCEPTION_FIELDS)) || !isReviewDispositionV1(handoff.disposition)) return false;
    const disposition = handoff.disposition as ReviewDispositionV1;
    const exception = handoff.unavailableReviewerException;
    return isCapabilityBindingId(handoff.reviewerCapabilityBindingId) && isCapabilityProof(handoff.reviewerCapabilityProof) &&
      (exception === undefined || (isHermesReviewerUnavailableExceptionV1(exception) && disposition.disposition === "technical_block" && exception.outcomeId === verification.outcomeId && exception.laneRunId === verification.laneRunId && occursAtOrAfter(disposition.observedAt, exception.recordedAt))) &&
      verification.verificationRecordId === disposition.verificationRecordId &&
      verification.outcomeId === disposition.outcomeId &&
      verification.laneRunId === disposition.developerLaneRunId &&
      verification.expectedOutcomeRevision === disposition.expectedOutcomeRevision &&
      verification.expectedLaneRevision === disposition.expectedLaneRevision &&
      occursAtOrAfter(disposition.observedAt, verification.observedAt) &&
      verification.developerIdentity !== disposition.reviewerIdentity &&
      ![verification.developerHome, verification.developerWorkspace]
        .some((developerPath) => [disposition.reviewerHome, disposition.reviewerWorkspace]
          .some((reviewerPath) => overlaps(developerPath, reviewerPath)));
  });
}
export const verificationRecordV1Fields = Object.freeze(VERIFICATION_FIELDS);
export const reviewDispositionV1Fields = Object.freeze(DISPOSITION_FIELDS);
