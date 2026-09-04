type Brand<TName extends string> = string & { readonly __brand: TName };

export type HermesOutcomeId = Brand<"HermesOutcomeId">;
export type HermesLaneRunId = Brand<"HermesLaneRunId">;
export type DeliveryEvidenceId = Brand<"DeliveryEvidenceId">;
export type HermesDeliveryEvidenceId = DeliveryEvidenceId;
export type PolicyDecisionId = Brand<"PolicyDecisionId">;
export type HermesPolicyDecisionId = PolicyDecisionId;
export type ExternalImpactRequestId = Brand<"ExternalImpactRequestId">;
export type HermesExternalImpactRequestId = ExternalImpactRequestId;
export type FollowUpWorkId = Brand<"FollowUpWorkId">;
export type HermesFollowUpWorkId = FollowUpWorkId;
export type HermesEventId = Brand<"HermesEventId">;
export type HermesCorrelationId = Brand<"HermesCorrelationId">;
export type HermesCausationId = Brand<"HermesCausationId">;
export type HermesIdempotencyKey = Brand<"HermesIdempotencyKey">;
export type HermesEvidenceRefId = Brand<"HermesEvidenceRefId">;
export type VerificationRecordId = Brand<"VerificationRecordId">;
export type ReviewDispositionId = Brand<"ReviewDispositionId">;

/** Opaque lower-case identifiers have no path, branch, or execution meaning. */
const HERMES_OPAQUE_ID_PATTERN = /^[a-z][a-z0-9]*(?:[-_:][a-z0-9]+)+$/;
const SENSITIVE_METADATA_PATTERN = new RegExp([
  "s\\u006b(?:_test|_live|-)",
  "gh[p|o]_",
  "g\\u0069thub_pat",
  "xox[a-z]-",
  "AKIA[0-9A-Z]{16}",
  "AIza[0-9A-Za-z_-]{20,}",
  "(?:authorization|auth)\\s*[:=]\\s*bearer",
  "api[_ -]?(?:key|t\\u006fken)",
  "private[_ -]?key",
  "p\\u0072ovider[_ -]?(?:key|t\\u006fken)",
].join("|"), "i");

export function isSensitiveMetadataText(value: string): boolean {
  return SENSITIVE_METADATA_PATTERN.test(value);
}

export function isOpaqueId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 200 && !isSensitiveMetadataText(value) && HERMES_OPAQUE_ID_PATTERN.test(value);
}

export function isHermesOutcomeId(value: unknown): value is HermesOutcomeId {
  return isOpaqueId(value);
}
export function isHermesLaneRunId(value: unknown): value is HermesLaneRunId {
  return isOpaqueId(value);
}
export function isDeliveryEvidenceId(value: unknown): value is DeliveryEvidenceId {
  return isOpaqueId(value);
}
export const isHermesDeliveryEvidenceId = isDeliveryEvidenceId;
export function isPolicyDecisionId(value: unknown): value is PolicyDecisionId {
  return isOpaqueId(value);
}
export const isHermesPolicyDecisionId = isPolicyDecisionId;
export function isExternalImpactRequestId(value: unknown): value is ExternalImpactRequestId {
  return isOpaqueId(value);
}
export const isHermesExternalImpactRequestId = isExternalImpactRequestId;
export function isFollowUpWorkId(value: unknown): value is FollowUpWorkId {
  return isOpaqueId(value);
}
export const isHermesFollowUpWorkId = isFollowUpWorkId;
export function isHermesEventId(value: unknown): value is HermesEventId {
  return isOpaqueId(value);
}
export function isHermesCorrelationId(value: unknown): value is HermesCorrelationId {
  return isOpaqueId(value);
}
export function isHermesCausationId(value: unknown): value is HermesCausationId {
  return isOpaqueId(value);
}
export function isHermesIdempotencyKey(value: unknown): value is HermesIdempotencyKey {
  return isOpaqueId(value);
}
export function isHermesEvidenceRefId(value: unknown): value is HermesEvidenceRefId {
  return isOpaqueId(value);
}
export function isVerificationRecordId(value: unknown): value is VerificationRecordId {
  return isOpaqueId(value);
}
export function isReviewDispositionId(value: unknown): value is ReviewDispositionId {
  return isOpaqueId(value);
}
