import { isHermesEvidenceRefId, isHermesIdempotencyKey, isHermesLaneRunId, isHermesOutcomeId, isOpaqueId } from "./ids";
import { HERMES_RESULT_VALUES, guardFailsClosed, hasExactKeys, isEvidenceRefs, isMetadataOnlyRecord, isRecord, isSafeText, isTimestampOrder, isUtcIsoTimestamp, type HermesResult } from "./types";

export const HERMES_DELIVERY_AUDIT_ACTION_SCHEMA_VERSION = "hermes_delivery_audit_action.v1" as const;
export const HERMES_DELIVERY_ACTION_RESULT_SCHEMA_VERSION = "hermes_delivery_action_result.v1" as const;
export const HERMES_CANONICAL_DELIVERY_REPOSITORY = "slawdawg/Kendall-vnxt" as const;
export const HERMES_CANONICAL_DELIVERY_BASE = "dev" as const;

export const HERMES_ORDINARY_DELIVERY_ACTIONS = Object.freeze([
  "finish_pr", "request_review", "resolve_current_thread", "merge",
] as const);
export type HermesOrdinaryDeliveryAction = (typeof HERMES_ORDINARY_DELIVERY_ACTIONS)[number];

export interface HermesDeliveryAuditRequestV1 {
  readonly taskId: string;
  readonly outcomeId: import("./ids").HermesOutcomeId;
  readonly laneRunId: import("./ids").HermesLaneRunId;
  readonly deliveryStewardIdentity: string;
  readonly deliveryHome: string;
  readonly deliveryWorkspace: string;
  readonly deliveryCapabilityBindingId: string;
  readonly deliveryCapabilityProof: string;
  readonly schemaVersion: typeof HERMES_DELIVERY_AUDIT_ACTION_SCHEMA_VERSION;
  readonly repository: typeof HERMES_CANONICAL_DELIVERY_REPOSITORY;
  readonly baseBranch: typeof HERMES_CANONICAL_DELIVERY_BASE;
  readonly expectedHeadSha: string;
  readonly pullRequestNumber: number | null;
  readonly reviewThreadId: string | null;
  readonly reviewThreadAdjudicationId: string | null;
  readonly requestedAction: HermesOrdinaryDeliveryAction;
  readonly policyEvidenceRef: import("./ids").HermesEvidenceRefId;
  readonly localVerificationRef: import("./ids").HermesEvidenceRefId;
  readonly rollbackRef: import("./ids").HermesEvidenceRefId;
  readonly evidenceRefs: readonly import("./ids").HermesEvidenceRefId[];
  readonly observedAt: string;
  readonly idempotencyKey: import("./ids").HermesIdempotencyKey;
  readonly createdAt: string;
  readonly expectedOutcomeRevision: number;
  readonly expectedLaneRevision: number;
  readonly metadataOnly: true;
  readonly rawPayloadRetained: false;
}

export interface HermesDeliveryActionResultV1 {
  readonly deliveryActionResultId: string;
  readonly taskId: string;
  readonly outcomeId: import("./ids").HermesOutcomeId;
  readonly laneRunId: import("./ids").HermesLaneRunId;
  readonly schemaVersion: typeof HERMES_DELIVERY_ACTION_RESULT_SCHEMA_VERSION;
  readonly requestedAction: HermesOrdinaryDeliveryAction;
  readonly decision: HermesResult;
  readonly reasonCode: string;
  readonly repository: typeof HERMES_CANONICAL_DELIVERY_REPOSITORY;
  readonly baseBranch: typeof HERMES_CANONICAL_DELIVERY_BASE;
  readonly exactHeadSha: string;
  readonly pullRequestNumber: number | null;
  readonly reviewThreadId: string | null;
  readonly reviewThreadAdjudicationId: string | null;
  readonly evidenceRefs: readonly import("./ids").HermesEvidenceRefId[];
  readonly nextAction: string;
  readonly rollbackRef: import("./ids").HermesEvidenceRefId;
  readonly observedAt: string;
  readonly idempotencyKey: import("./ids").HermesIdempotencyKey;
  readonly createdAt: string;
  readonly metadataOnly: true;
  readonly rawPayloadRetained: false;
}

const AUDIT_REQUEST_FIELDS = [
  "taskId", "outcomeId", "laneRunId", "deliveryStewardIdentity", "deliveryHome", "deliveryWorkspace", "deliveryCapabilityBindingId", "deliveryCapabilityProof", "schemaVersion", "repository", "baseBranch", "expectedHeadSha", "pullRequestNumber", "reviewThreadId", "reviewThreadAdjudicationId", "requestedAction", "policyEvidenceRef", "localVerificationRef", "rollbackRef", "evidenceRefs", "observedAt", "idempotencyKey", "createdAt", "expectedOutcomeRevision", "expectedLaneRevision", "metadataOnly", "rawPayloadRetained",
] as const;
const ACTION_RESULT_FIELDS = [
  "deliveryActionResultId", "taskId", "outcomeId", "laneRunId", "schemaVersion", "requestedAction", "decision", "reasonCode", "repository", "baseBranch", "exactHeadSha", "pullRequestNumber", "reviewThreadId", "reviewThreadAdjudicationId", "evidenceRefs", "nextAction", "rollbackRef", "observedAt", "idempotencyKey", "createdAt", "metadataOnly", "rawPayloadRetained",
] as const;

const isExactHead = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
const isPullRequestNumber = (value: unknown): value is number | null => value === null || (typeof value === "number" && Number.isSafeInteger(value) && value > 0);
const isRevision = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const isAction = (value: unknown): value is HermesOrdinaryDeliveryAction => typeof value === "string" && HERMES_ORDINARY_DELIVERY_ACTIONS.includes(value as HermesOrdinaryDeliveryAction);
const isStewardIdentity = (value: unknown): value is string => isOpaqueId(value) && value.length <= 120;
const isResult = (value: unknown): value is HermesResult => HERMES_RESULT_VALUES.includes(value as HermesResult);
const timestampMillis = (value: unknown): number => typeof value === "string" ? Date.parse(value) : Number.NaN;
const isPrBoundAction = (value: HermesOrdinaryDeliveryAction): boolean => ["request_review", "resolve_current_thread", "merge"].includes(value);
const isReviewThreadId = (value: unknown): value is string => typeof value === "string" && value.length <= 160 && /^PRRT_[A-Za-z0-9_-]+$/.test(value);
const hasExactAdjudication = (value: Record<string, unknown>): boolean => value.requestedAction === "resolve_current_thread"
  ? isReviewThreadId(value.reviewThreadId) && isOpaqueId(value.reviewThreadAdjudicationId) && value.reviewThreadAdjudicationId.length <= 120
  : value.reviewThreadId === null && value.reviewThreadAdjudicationId === null;
const includesRequiredEvidence = (value: Record<string, unknown>): boolean => {
  const evidenceRefs = value.evidenceRefs;
  return Array.isArray(evidenceRefs) && [value.policyEvidenceRef, value.localVerificationRef, value.rollbackRef].every((reference) => evidenceRefs.includes(reference));
};
const includesRollbackEvidence = (value: Record<string, unknown>): boolean => Array.isArray(value.evidenceRefs) && value.evidenceRefs.includes(value.rollbackRef);

export function isHermesDeliveryAuditRequestV1(value: unknown): value is HermesDeliveryAuditRequestV1 {
  return guardFailsClosed(() => {
    if (!isRecord(value) || !hasExactKeys(value, AUDIT_REQUEST_FIELDS)) return false;
    return isSafeText(value.taskId, 160) && isHermesOutcomeId(value.outcomeId) && isHermesLaneRunId(value.laneRunId) && isStewardIdentity(value.deliveryStewardIdentity) &&
      isSafeText(value.deliveryHome, 240) && isSafeText(value.deliveryWorkspace, 240) && value.deliveryHome !== value.deliveryWorkspace && isStewardIdentity(value.deliveryCapabilityBindingId) && isSafeText(value.deliveryCapabilityProof, 512) && value.deliveryCapabilityProof.length >= 24 &&
      value.schemaVersion === HERMES_DELIVERY_AUDIT_ACTION_SCHEMA_VERSION && value.repository === HERMES_CANONICAL_DELIVERY_REPOSITORY && value.baseBranch === HERMES_CANONICAL_DELIVERY_BASE &&
      isExactHead(value.expectedHeadSha) && isPullRequestNumber(value.pullRequestNumber) && isAction(value.requestedAction) && (!isPrBoundAction(value.requestedAction) || value.pullRequestNumber !== null) &&
      hasExactAdjudication(value) &&
      isHermesEvidenceRefId(value.policyEvidenceRef) && isHermesEvidenceRefId(value.localVerificationRef) && isHermesEvidenceRefId(value.rollbackRef) &&
      isEvidenceRefs(value.evidenceRefs) && includesRequiredEvidence(value) && isUtcIsoTimestamp(value.observedAt) && isTimestampOrder(value, ["createdAt", "observedAt"]) && timestampMillis(value.observedAt) <= Date.now() && isHermesIdempotencyKey(value.idempotencyKey) && isRevision(value.expectedOutcomeRevision) && isRevision(value.expectedLaneRevision) &&
      isMetadataOnlyRecord(value, HERMES_DELIVERY_AUDIT_ACTION_SCHEMA_VERSION, ["observedAt", "createdAt"]);
  });
}

export function isHermesDeliveryActionResultV1(value: unknown): value is HermesDeliveryActionResultV1 {
  return guardFailsClosed(() => {
    if (!isRecord(value) || !hasExactKeys(value, ACTION_RESULT_FIELDS)) return false;
    return isOpaqueId(value.deliveryActionResultId) && isSafeText(value.taskId, 160) && isHermesOutcomeId(value.outcomeId) && isHermesLaneRunId(value.laneRunId) &&
      value.schemaVersion === HERMES_DELIVERY_ACTION_RESULT_SCHEMA_VERSION && isAction(value.requestedAction) && isResult(value.decision) &&
      isSafeText(value.reasonCode, 160) && value.repository === HERMES_CANONICAL_DELIVERY_REPOSITORY && value.baseBranch === HERMES_CANONICAL_DELIVERY_BASE &&
      isExactHead(value.exactHeadSha) && isPullRequestNumber(value.pullRequestNumber) && isAction(value.requestedAction) && (!isPrBoundAction(value.requestedAction) || value.pullRequestNumber !== null) && hasExactAdjudication(value) && isEvidenceRefs(value.evidenceRefs) && includesRollbackEvidence(value) && isSafeText(value.nextAction, 240) &&
      isHermesEvidenceRefId(value.rollbackRef) && isUtcIsoTimestamp(value.observedAt) && isTimestampOrder(value, ["createdAt", "observedAt"]) && timestampMillis(value.observedAt) <= Date.now() && isHermesIdempotencyKey(value.idempotencyKey) &&
      isMetadataOnlyRecord(value, HERMES_DELIVERY_ACTION_RESULT_SCHEMA_VERSION, ["observedAt", "createdAt"]);
  });
}

export const hermesDeliveryAuditRequestV1Fields = Object.freeze(AUDIT_REQUEST_FIELDS);
export const hermesDeliveryActionResultV1Fields = Object.freeze(ACTION_RESULT_FIELDS);
