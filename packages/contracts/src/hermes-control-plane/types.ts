import {
  isHermesEvidenceRefId,
  isHermesIdempotencyKey,
  isSensitiveMetadataText,
  isOpaqueId,
  type HermesEvidenceRefId,
  type HermesIdempotencyKey,
} from "./ids";

export const HERMES_RESULT_VALUES = Object.freeze([
  "allowed",
  "deniedPolicy",
  "deniedExternalImpact",
  "staleFacts",
  "retryable",
  "rework",
  "blockedTechnical",
  "completed",
] as const);
export type HermesResult = (typeof HERMES_RESULT_VALUES)[number];

export const HERMES_OUTCOME_SCHEMA_VERSION = "hermes_outcome.v1" as const;
export const HERMES_LANE_RUN_SCHEMA_VERSION = "hermes_lane_run.v1" as const;
export const HERMES_DELIVERY_EVIDENCE_SCHEMA_VERSION = "delivery_evidence.v1" as const;
export const HERMES_POLICY_DECISION_SCHEMA_VERSION = "policy_decision.v1" as const;
export const HERMES_EXTERNAL_IMPACT_REQUEST_SCHEMA_VERSION = "external_impact_request.v1" as const;
export const HERMES_FOLLOW_UP_WORK_SCHEMA_VERSION = "follow_up_work.v1" as const;
export const HERMES_LIFECYCLE_EVENT_SCHEMA_VERSION = "hermes_lifecycle_event.v1" as const;
export const HERMES_BOARD_LIFECYCLE_EVENT_SCHEMA_VERSION = "hermes_board_lifecycle_event.v1" as const;
export const HERMES_VERIFICATION_RECORD_SCHEMA_VERSION = "verification_record.v1" as const;
export const HERMES_REVIEW_DISPOSITION_SCHEMA_VERSION = "review_disposition.v1" as const;

export type HermesOutcomeStatus = "proposed" | "active" | "review" | "completed" | "blocked" | "rework";
export type HermesLaneRunStatus = "queued" | "running" | "review" | "rework" | "completed" | "blocked";
export type HermesFollowUpWorkStatus = "proposed" | "queued" | "active" | "completed" | "blocked";
export type HermesFollowUpCapacityState = "available" | "atCapacity" | "admissionBlocked";
export type HermesImpactType = "spend" | "realUserDeployment";
export type HermesLifecycleEventName =
  | "hermes.outcome.created"
  | "hermes.lane.recovered"
  | "hermes.delivery.denied"
  | "hermes.external-impact.requested"
  | "hermes.review.disposition.recorded"
  | "hermes.verification.recorded";

export interface HermesOutcomeV1 {
  readonly outcomeId: import("./ids").HermesOutcomeId;
  readonly schemaVersion: typeof HERMES_OUTCOME_SCHEMA_VERSION;
  readonly title: string;
  readonly summary: string;
  readonly status: HermesOutcomeStatus;
  readonly result: HermesResult;
  readonly reasonCode: string;
  readonly evidenceRefs: readonly HermesEvidenceRefId[];
  readonly nextAction: string;
  readonly observedAt: string;
  readonly idempotencyKey: HermesIdempotencyKey;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly metadataOnly: true;
  readonly rawPayloadRetained: false;
}

export interface HermesLaneRunV1 {
  readonly laneRunId: import("./ids").HermesLaneRunId;
  readonly outcomeId: import("./ids").HermesOutcomeId;
  readonly schemaVersion: typeof HERMES_LANE_RUN_SCHEMA_VERSION;
  readonly laneType: string;
  readonly status: HermesLaneRunStatus;
  readonly result: HermesResult;
  readonly reasonCode: string;
  readonly evidenceRefs: readonly HermesEvidenceRefId[];
  readonly nextAction: string;
  readonly heartbeatAt: string;
  readonly staleDeadlineAt: string;
  readonly timeoutAt: string;
  readonly retryBudget: number;
  readonly reworkBudget: number;
  readonly evidenceFingerprint: string;
  readonly observedAt: string;
  readonly idempotencyKey: HermesIdempotencyKey;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly metadataOnly: true;
  readonly rawPayloadRetained: false;
}

export interface DeliveryEvidenceV1 {
  readonly deliveryEvidenceId: import("./ids").DeliveryEvidenceId;
  readonly outcomeId: import("./ids").HermesOutcomeId;
  readonly laneRunId: import("./ids").HermesLaneRunId;
  readonly schemaVersion: typeof HERMES_DELIVERY_EVIDENCE_SCHEMA_VERSION;
  readonly evidenceType: string;
  readonly summary: string;
  readonly sourceRef: string;
  readonly observedAt: string;
  readonly evidenceRefs: readonly HermesEvidenceRefId[];
  readonly idempotencyKey: HermesIdempotencyKey;
  readonly createdAt: string;
  readonly metadataOnly: true;
  readonly rawPayloadRetained: false;
}

export interface PolicyDecisionV1 {
  readonly policyDecisionId: import("./ids").PolicyDecisionId;
  readonly outcomeId: import("./ids").HermesOutcomeId;
  readonly laneRunId: import("./ids").HermesLaneRunId;
  readonly schemaVersion: typeof HERMES_POLICY_DECISION_SCHEMA_VERSION;
  readonly decision: HermesResult;
  readonly reasonCode: string;
  readonly evidenceRefs: readonly HermesEvidenceRefId[];
  readonly nextAction: string;
  readonly observedAt: string;
  readonly idempotencyKey: HermesIdempotencyKey;
  readonly createdAt: string;
  readonly metadataOnly: true;
  readonly rawPayloadRetained: false;
}

export interface ExternalImpactRequestV1 {
  readonly externalImpactRequestId: import("./ids").ExternalImpactRequestId;
  readonly outcomeId: import("./ids").HermesOutcomeId;
  readonly laneRunId: import("./ids").HermesLaneRunId;
  readonly schemaVersion: typeof HERMES_EXTERNAL_IMPACT_REQUEST_SCHEMA_VERSION;
  readonly impactType: HermesImpactType;
  readonly target: string;
  readonly effect: string;
  readonly scope: string;
  readonly expiresAt: string;
  readonly alternativesConsidered: readonly string[];
  readonly classificationRationale: string;
  readonly evidenceRefs: readonly HermesEvidenceRefId[];
  readonly idempotencyKey: HermesIdempotencyKey;
  readonly createdAt: string;
  readonly metadataOnly: true;
  readonly rawPayloadRetained: false;
}

export interface FollowUpWorkV1 {
  readonly followUpWorkId: import("./ids").FollowUpWorkId;
  readonly parentOutcomeId: import("./ids").HermesOutcomeId;
  readonly schemaVersion: typeof HERMES_FOLLOW_UP_WORK_SCHEMA_VERSION;
  readonly title: string;
  readonly summary: string;
  readonly dedupeKey: string;
  readonly owner: string;
  readonly priorityRationale: string;
  readonly capacityState: HermesFollowUpCapacityState;
  readonly reviewAt: string;
  readonly expiresAt: string;
  readonly status: HermesFollowUpWorkStatus;
  readonly result: HermesResult;
  readonly reasonCode: string;
  readonly evidenceRefs: readonly HermesEvidenceRefId[];
  readonly nextAction: string;
  readonly observedAt: string;
  readonly idempotencyKey: HermesIdempotencyKey;
  readonly createdAt: string;
  readonly metadataOnly: true;
  readonly rawPayloadRetained: false;
}

export interface HermesLifecycleEventV1 {
  readonly eventId: import("./ids").HermesEventId;
  readonly outcomeId: import("./ids").HermesOutcomeId;
  readonly laneRunId: import("./ids").HermesLaneRunId;
  readonly schemaVersion: typeof HERMES_LIFECYCLE_EVENT_SCHEMA_VERSION;
  readonly eventName: HermesLifecycleEventName;
  readonly result: HermesResult;
  readonly reasonCode: string;
  readonly evidenceRefs: readonly HermesEvidenceRefId[];
  readonly nextAction: string;
  readonly correlationId: import("./ids").HermesCorrelationId;
  readonly causationId: import("./ids").HermesCausationId;
  readonly observedAt: string;
  readonly idempotencyKey: HermesIdempotencyKey;
  readonly emittedAt: string;
  readonly metadataOnly: true;
  readonly rawPayloadRetained: false;
  readonly authoritative: false;
}

/** Metadata signed by the board emitter; it never carries delivery authority. */
export interface HermesBoardLifecycleEventV1 {
  readonly schemaVersion: typeof HERMES_BOARD_LIFECYCLE_EVENT_SCHEMA_VERSION;
  readonly issuerId: string;
  readonly keyId: string;
  readonly eventId: import("./ids").HermesEventId;
  readonly idempotencyKey: HermesIdempotencyKey;
  readonly boardId: string;
  readonly cardId: string;
  readonly outcomeId: import("./ids").HermesOutcomeId;
  readonly laneRunId: import("./ids").HermesLaneRunId;
  readonly eventName: HermesLifecycleEventName;
  readonly result: HermesResult;
  readonly reasonCode: string;
  readonly evidenceRefs: readonly HermesEvidenceRefId[];
  readonly nextAction: string;
  readonly correlationId: import("./ids").HermesCorrelationId;
  readonly causationId: import("./ids").HermesCausationId;
  readonly observedAt: string;
  readonly emittedAt: string;
  readonly expiresAt: string;
  readonly signatureB64: string;
  readonly metadataOnly: true;
  readonly rawPayloadRetained: false;
  readonly authoritative: false;
}

export interface VerificationRecordV1 {
  readonly verificationRecordId: import("./ids").VerificationRecordId; readonly outcomeId: import("./ids").HermesOutcomeId; readonly laneRunId: import("./ids").HermesLaneRunId;
  readonly schemaVersion: typeof HERMES_VERIFICATION_RECORD_SCHEMA_VERSION; readonly result: "passed" | "failed" | "inconclusive"; readonly target: string; readonly sourceFingerprint: string;
  readonly developerIdentity: string; readonly developerHome: string; readonly developerWorkspace: string; readonly evidenceRefs: readonly HermesEvidenceRefId[];
  readonly observedAt: string; readonly idempotencyKey: HermesIdempotencyKey; readonly createdAt: string; readonly metadataOnly: true; readonly rawPayloadRetained: false;
  readonly expectedOutcomeRevision: number; readonly expectedLaneRevision: number;
}

export interface ReviewDispositionV1 {
  readonly reviewDispositionId: import("./ids").ReviewDispositionId; readonly verificationRecordId: import("./ids").VerificationRecordId; readonly outcomeId: import("./ids").HermesOutcomeId; readonly developerLaneRunId: import("./ids").HermesLaneRunId;
  readonly schemaVersion: typeof HERMES_REVIEW_DISPOSITION_SCHEMA_VERSION; readonly disposition: "approve" | "rework" | "technical_block";
  readonly reviewerIdentity: string; readonly reviewerHome: string; readonly reviewerWorkspace: string; readonly reasonCode: string; readonly nextAction: string; readonly evidenceRefs: readonly HermesEvidenceRefId[];
  readonly observedAt: string; readonly idempotencyKey: HermesIdempotencyKey; readonly createdAt: string; readonly metadataOnly: true; readonly rawPayloadRetained: false;
  readonly expectedOutcomeRevision: number; readonly expectedLaneRevision: number;
}

/** Metadata-only verification handoff; only passed verification may carry a disposition. */
export interface ReviewHandoffV1 {
  readonly verification: VerificationRecordV1;
  readonly disposition?: ReviewDispositionV1;
}

export type HermesLifecycleEventEnvelopeV1 = HermesLifecycleEventV1;

export function isRecord(value: unknown): value is Record<string, unknown> {
  try {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  } catch {
    return false;
  }
}

export function hasExactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  try {
    const ownKeys = Reflect.ownKeys(record);
    if (ownKeys.some((key) => typeof key !== "string")) return false;
    const actual = (ownKeys as string[]).sort();
    return actual.length === expected.length && expected.every((key) => actual.includes(key) && Object.prototype.propertyIsEnumerable.call(record, key));
  } catch {
    return false;
  }
}

const UNSAFE_METADATA_TEXT = new RegExp([
  "api[_ -]?key",
  "access[_ -]?\\u0074oken",
  "bearer",
  "pass\\u0077ord",
  "private[_ -]?key",
  "s\\u0065cret",
  "raw[_ -]?(?:input|output|p\\u0061yload|p\\u0072ompt)",
  "p\\u0072ovider[_ -]?p\\u0061yload",
  "c\\u006fmpletion",
  "t\\u0072anscript",
  "s\\u006b(?:_live|-)",
  "ghp_",
  "eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+",
  "authorization\\s*:\\s*bearer",
  "s\\u006b(?:_test|_live|-)",
  "gh[p|o]_",
  "g\\u0069thub_pat",
  "xox[a-z]-",
  "AKIA[0-9A-Z]{16}",
  "AIza[0-9A-Za-z_-]{20,}",
  "(?:authorization|auth)\\s*[:=]\\s*bearer",
  "api[_ -]?(?:key|t\\u006fken)",
  "private[_ -]?key",
  "-----BEGIN",
].join("|"), "i");

export function isSafeText(value: unknown, maxLength = 500): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength &&
    !/[\u0000-\u001f\u007f]/.test(value) && !UNSAFE_METADATA_TEXT.test(value) && !isSensitiveMetadataText(value);
}

export function isUtcIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  const canonical = new Date(parsed).toISOString();
  return canonical === value || canonical.replace(".000Z", "Z") === value;
}

export function guardFailsClosed(evaluate: () => boolean): boolean {
  try {
    return evaluate();
  } catch {
    return false;
  }
}

export function isHermesResult(value: unknown): value is HermesResult {
  return typeof value === "string" && HERMES_RESULT_VALUES.includes(value as HermesResult);
}

export function isEvidenceRefs(value: unknown): value is readonly HermesEvidenceRefId[] {
  try {
    if (!Array.isArray(value) || value.length === 0 || value.length > 32 || !Object.prototype.hasOwnProperty.call(value, "length")) return false;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string" || (key !== "length" && !/^\d+$/.test(key)))) return false;
    let totalLength = 0;
    const unique = new Set<string>();
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
      const item = value[index];
      if (!isHermesEvidenceRefId(item) || unique.has(item)) return false;
      unique.add(item);
      totalLength += item.length;
      if (totalLength > 4096) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function isSafeStringCollection(value: unknown, maxItems: number, maxTotalLength: number): value is readonly string[] {
  try {
    if (!Array.isArray(value) || value.length === 0 || value.length > maxItems || !Object.prototype.hasOwnProperty.call(value, "length")) return false;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string" || (key !== "length" && !/^\d+$/.test(key)))) return false;
    let totalLength = 0;
    const unique = new Set<string>();
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
      const item = value[index];
      if (!isSafeText(item, 240) || unique.has(item)) return false;
      unique.add(item);
      totalLength += item.length;
      if (totalLength > maxTotalLength) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function isTimestampOrder(record: Record<string, unknown>, fields: readonly string[]): boolean {
  try {
    const values = fields.map((field) => record[field]);
    if (!values.every(isUtcIsoTimestamp)) return false;
    return values.slice(1).every((value, index) => Date.parse(values[index]) <= Date.parse(value));
  } catch {
    return false;
  }
}

export function isMetadataOnlyRecord(
  record: Record<string, unknown>,
  schemaVersion: string,
  timestamps: readonly string[],
): boolean {
  try {
    return record.schemaVersion === schemaVersion &&
      record.metadataOnly === true &&
      record.rawPayloadRetained === false &&
      timestamps.every((field) => isUtcIsoTimestamp(record[field])) &&
      isHermesIdempotencyKey(record.idempotencyKey) &&
      isEvidenceRefs(record.evidenceRefs);
  } catch {
    return false;
  }
}

export function isDecisionFields(record: Record<string, unknown>): boolean {
  try {
    return isHermesResult(record.result) && isSafeText(record.reasonCode, 160) &&
      isSafeText(record.nextAction, 240) && isUtcIsoTimestamp(record.observedAt);
  } catch {
    return false;
  }
}

export function isStringField(value: unknown, maxLength = 500): value is string {
  return isSafeText(value, maxLength);
}

export function isOpaqueReference(value: unknown): boolean {
  return isOpaqueId(value);
}
