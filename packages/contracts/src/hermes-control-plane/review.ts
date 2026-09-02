import { isHermesLaneRunId, isHermesOutcomeId, isReviewDispositionId, isVerificationRecordId } from "./ids";
import { HERMES_REVIEW_DISPOSITION_SCHEMA_VERSION, HERMES_VERIFICATION_RECORD_SCHEMA_VERSION, guardFailsClosed, hasExactKeys, isEvidenceRefs, isMetadataOnlyRecord, isRecord, isSafeText, isTimestampOrder, type ReviewDispositionV1, type ReviewHandoffV1, type VerificationRecordV1 } from "./types";

const VERIFICATION_FIELDS = ["verificationRecordId", "outcomeId", "laneRunId", "schemaVersion", "result", "target", "sourceFingerprint", "developerIdentity", "developerHome", "developerWorkspace", "evidenceRefs", "observedAt", "idempotencyKey", "createdAt", "metadataOnly", "rawPayloadRetained", "expectedOutcomeRevision", "expectedLaneRevision"] as const;
const DISPOSITION_FIELDS = ["reviewDispositionId", "verificationRecordId", "outcomeId", "developerLaneRunId", "schemaVersion", "disposition", "reviewerIdentity", "reviewerHome", "reviewerWorkspace", "reasonCode", "nextAction", "evidenceRefs", "observedAt", "idempotencyKey", "createdAt", "metadataOnly", "rawPayloadRetained", "expectedOutcomeRevision", "expectedLaneRevision"] as const;
const distinct = (...values: unknown[]) => new Set(values).size === values.length;

export function isVerificationRecordV1(value: unknown): value is VerificationRecordV1 {
  return guardFailsClosed(() => !!isRecord(value) && hasExactKeys(value, VERIFICATION_FIELDS) && isVerificationRecordId(value.verificationRecordId) && isHermesOutcomeId(value.outcomeId) && isHermesLaneRunId(value.laneRunId) && isMetadataOnlyRecord(value, HERMES_VERIFICATION_RECORD_SCHEMA_VERSION, ["observedAt", "createdAt"]) && isTimestampOrder(value, ["createdAt", "observedAt"]) && ["passed", "failed", "inconclusive"].includes(value.result as string) && isSafeText(value.target, 240) && isSafeText(value.sourceFingerprint, 240) && isSafeText(value.developerIdentity, 120) && isSafeText(value.developerHome, 240) && isSafeText(value.developerWorkspace, 240) && distinct(value.developerIdentity, value.developerHome, value.developerWorkspace) && isEvidenceRefs(value.evidenceRefs) && Number.isInteger(value.expectedOutcomeRevision) && (value.expectedOutcomeRevision as number) > 0 && Number.isInteger(value.expectedLaneRevision) && (value.expectedLaneRevision as number) > 0);
}
export function isReviewDispositionV1(value: unknown): value is ReviewDispositionV1 {
  return guardFailsClosed(() => !!isRecord(value) && hasExactKeys(value, DISPOSITION_FIELDS) && isReviewDispositionId(value.reviewDispositionId) && isVerificationRecordId(value.verificationRecordId) && isHermesOutcomeId(value.outcomeId) && isHermesLaneRunId(value.developerLaneRunId) && isMetadataOnlyRecord(value, HERMES_REVIEW_DISPOSITION_SCHEMA_VERSION, ["observedAt", "createdAt"]) && isTimestampOrder(value, ["createdAt", "observedAt"]) && ["approve", "rework", "technical_block"].includes(value.disposition as string) && isSafeText(value.reviewerIdentity, 120) && isSafeText(value.reviewerHome, 240) && isSafeText(value.reviewerWorkspace, 240) && distinct(value.reviewerIdentity, value.reviewerHome, value.reviewerWorkspace) && Number.isInteger(value.expectedOutcomeRevision) && (value.expectedOutcomeRevision as number) > 0 && Number.isInteger(value.expectedLaneRevision) && (value.expectedLaneRevision as number) > 0 && isSafeText(value.reasonCode, 120) && isSafeText(value.nextAction, 360) && isEvidenceRefs(value.evidenceRefs));
}

const HANDOFF_FIELDS = ["verification", "disposition"] as const;
const pathParts = (value: string) => value.toLowerCase().split(/[:\\\\/]+/).reduce<string[]>((parts, part) => {
  if (!part || part === ".") return parts;
  if (part === "..") { parts.pop(); return parts; }
  parts.push(part); return parts;
}, []);
const overlaps = (left: string, right: string) => {
  const a = pathParts(left), b = pathParts(right);
  return a.every((part, index) => b[index] === part) || b.every((part, index) => a[index] === part);
};

/** Reject independently-valid records unless their identity, chronology, and isolation bind together. */
export function isReviewHandoffV1(value: unknown): value is ReviewHandoffV1 {
  return guardFailsClosed(() => {
    if (!isRecord(value) || !hasExactKeys(value, HANDOFF_FIELDS) || !isVerificationRecordV1(value.verification) || !isReviewDispositionV1(value.disposition)) return false;
    const verification = value.verification, disposition = value.disposition;
    return verification.result === "passed" &&
      verification.verificationRecordId === disposition.verificationRecordId &&
      verification.outcomeId === disposition.outcomeId &&
      verification.laneRunId === disposition.developerLaneRunId &&
      verification.expectedOutcomeRevision === disposition.expectedOutcomeRevision &&
      verification.expectedLaneRevision === disposition.expectedLaneRevision &&
      verification.observedAt <= disposition.observedAt &&
      ![verification.developerIdentity, verification.developerHome, verification.developerWorkspace]
        .some((developer) => [disposition.reviewerIdentity, disposition.reviewerHome, disposition.reviewerWorkspace]
          .some((reviewer) => overlaps(developer, reviewer)));
  });
}
export const verificationRecordV1Fields = Object.freeze(VERIFICATION_FIELDS);
export const reviewDispositionV1Fields = Object.freeze(DISPOSITION_FIELDS);
