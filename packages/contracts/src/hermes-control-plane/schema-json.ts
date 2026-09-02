export const HERMES_REQUIRED_FIELDS_BY_CONTRACT = Object.freeze({
  HermesOutcomeV1: Object.freeze(["outcomeId", "schemaVersion", "title", "summary", "status", "result", "reasonCode", "evidenceRefs", "nextAction", "observedAt", "idempotencyKey", "createdAt", "updatedAt", "metadataOnly", "rawPayloadRetained"] as const),
  HermesLaneRunV1: Object.freeze(["laneRunId", "outcomeId", "schemaVersion", "laneType", "status", "result", "reasonCode", "evidenceRefs", "nextAction", "heartbeatAt", "staleDeadlineAt", "timeoutAt", "retryBudget", "reworkBudget", "evidenceFingerprint", "observedAt", "idempotencyKey", "createdAt", "updatedAt", "metadataOnly", "rawPayloadRetained"] as const),
  DeliveryEvidenceV1: Object.freeze(["deliveryEvidenceId", "outcomeId", "laneRunId", "schemaVersion", "evidenceType", "summary", "sourceRef", "observedAt", "evidenceRefs", "idempotencyKey", "createdAt", "metadataOnly", "rawPayloadRetained"] as const),
  PolicyDecisionV1: Object.freeze(["policyDecisionId", "outcomeId", "laneRunId", "schemaVersion", "decision", "reasonCode", "evidenceRefs", "nextAction", "observedAt", "idempotencyKey", "createdAt", "metadataOnly", "rawPayloadRetained"] as const),
  ExternalImpactRequestV1: Object.freeze(["externalImpactRequestId", "outcomeId", "laneRunId", "schemaVersion", "impactType", "target", "effect", "scope", "expiresAt", "alternativesConsidered", "classificationRationale", "evidenceRefs", "idempotencyKey", "createdAt", "metadataOnly", "rawPayloadRetained"] as const),
  FollowUpWorkV1: Object.freeze(["followUpWorkId", "parentOutcomeId", "schemaVersion", "title", "summary", "dedupeKey", "owner", "priorityRationale", "capacityState", "reviewAt", "expiresAt", "status", "result", "reasonCode", "evidenceRefs", "nextAction", "observedAt", "idempotencyKey", "createdAt", "metadataOnly", "rawPayloadRetained"] as const),
  HermesLifecycleEventV1: Object.freeze(["eventId", "outcomeId", "laneRunId", "schemaVersion", "eventName", "result", "reasonCode", "evidenceRefs", "nextAction", "correlationId", "causationId", "observedAt", "idempotencyKey", "emittedAt", "metadataOnly", "rawPayloadRetained", "authoritative"] as const),
  HermesBoardLifecycleEventV1: Object.freeze(["schemaVersion", "issuerId", "keyId", "eventId", "idempotencyKey", "boardId", "cardId", "outcomeId", "laneRunId", "eventName", "result", "reasonCode", "evidenceRefs", "nextAction", "correlationId", "causationId", "observedAt", "emittedAt", "expiresAt", "signatureB64", "metadataOnly", "rawPayloadRetained", "authoritative"] as const),
  VerificationRecordV1: Object.freeze(["verificationRecordId", "outcomeId", "laneRunId", "schemaVersion", "result", "target", "sourceFingerprint", "developerIdentity", "developerHome", "developerWorkspace", "evidenceRefs", "observedAt", "idempotencyKey", "createdAt", "metadataOnly", "rawPayloadRetained"] as const),
  ReviewDispositionV1: Object.freeze(["reviewDispositionId", "verificationRecordId", "outcomeId", "developerLaneRunId", "schemaVersion", "disposition", "reviewerIdentity", "reviewerHome", "reviewerWorkspace", "reasonCode", "nextAction", "evidenceRefs", "observedAt", "idempotencyKey", "createdAt", "metadataOnly", "rawPayloadRetained", "expectedOutcomeRevision", "expectedLaneRevision"] as const),
} as const);

export const HERMES_SERIALIZED_FIELDS_BY_CONTRACT = Object.freeze({
  HermesOutcomeV1: Object.freeze(["outcome_id", "schema_version", "title", "summary", "status", "result", "reason_code", "evidence_refs", "next_action", "observed_at", "idempotency_key", "created_at", "updated_at", "metadata_only", "raw_payload_retained"] as const),
  HermesLaneRunV1: Object.freeze(["lane_run_id", "outcome_id", "schema_version", "lane_type", "status", "result", "reason_code", "evidence_refs", "next_action", "heartbeat_at", "stale_deadline_at", "timeout_at", "retry_budget", "rework_budget", "evidence_fingerprint", "observed_at", "idempotency_key", "created_at", "updated_at", "metadata_only", "raw_payload_retained"] as const),
  DeliveryEvidenceV1: Object.freeze(["delivery_evidence_id", "outcome_id", "lane_run_id", "schema_version", "evidence_type", "summary", "source_ref", "observed_at", "evidence_refs", "idempotency_key", "created_at", "metadata_only", "raw_payload_retained"] as const),
  PolicyDecisionV1: Object.freeze(["policy_decision_id", "outcome_id", "lane_run_id", "schema_version", "decision", "reason_code", "evidence_refs", "next_action", "observed_at", "idempotency_key", "created_at", "metadata_only", "raw_payload_retained"] as const),
  ExternalImpactRequestV1: Object.freeze(["external_impact_request_id", "outcome_id", "lane_run_id", "schema_version", "impact_type", "target", "effect", "scope", "expires_at", "alternatives_considered", "classification_rationale", "evidence_refs", "idempotency_key", "created_at", "metadata_only", "raw_payload_retained"] as const),
  FollowUpWorkV1: Object.freeze(["follow_up_work_id", "parent_outcome_id", "schema_version", "title", "summary", "dedupe_key", "owner", "priority_rationale", "capacity_state", "review_at", "expires_at", "status", "result", "reason_code", "evidence_refs", "next_action", "observed_at", "idempotency_key", "created_at", "metadata_only", "raw_payload_retained"] as const),
  HermesLifecycleEventV1: Object.freeze(["event_id", "outcome_id", "lane_run_id", "schema_version", "event_name", "result", "reason_code", "evidence_refs", "next_action", "correlation_id", "causation_id", "observed_at", "idempotency_key", "emitted_at", "metadata_only", "raw_payload_retained", "authoritative"] as const),
  HermesBoardLifecycleEventV1: Object.freeze(["schema_version", "issuer_id", "key_id", "event_id", "idempotency_key", "board_id", "card_id", "outcome_id", "lane_run_id", "event_name", "result", "reason_code", "evidence_refs", "next_action", "correlation_id", "causation_id", "observed_at", "emitted_at", "expires_at", "signature_b64", "metadata_only", "raw_payload_retained", "authoritative"] as const),
  VerificationRecordV1: Object.freeze(["verification_record_id", "outcome_id", "lane_run_id", "schema_version", "result", "target", "source_fingerprint", "developer_identity", "developer_home", "developer_workspace", "evidence_refs", "observed_at", "idempotency_key", "created_at", "metadata_only", "raw_payload_retained"] as const),
  ReviewDispositionV1: Object.freeze(["review_disposition_id", "verification_record_id", "outcome_id", "developer_lane_run_id", "schema_version", "disposition", "reviewer_identity", "reviewer_home", "reviewer_workspace", "reason_code", "next_action", "evidence_refs", "observed_at", "idempotency_key", "created_at", "metadata_only", "raw_payload_retained", "expected_outcome_revision", "expected_lane_revision"] as const),
} as const);

export const HERMES_OUTCOME_V1_REQUIRED_FIELDS = HERMES_REQUIRED_FIELDS_BY_CONTRACT.HermesOutcomeV1;
export const HERMES_LANE_RUN_V1_REQUIRED_FIELDS = HERMES_REQUIRED_FIELDS_BY_CONTRACT.HermesLaneRunV1;
export const DELIVERY_EVIDENCE_V1_REQUIRED_FIELDS = HERMES_REQUIRED_FIELDS_BY_CONTRACT.DeliveryEvidenceV1;
export const POLICY_DECISION_V1_REQUIRED_FIELDS = HERMES_REQUIRED_FIELDS_BY_CONTRACT.PolicyDecisionV1;
export const EXTERNAL_IMPACT_REQUEST_V1_REQUIRED_FIELDS = HERMES_REQUIRED_FIELDS_BY_CONTRACT.ExternalImpactRequestV1;
export const FOLLOW_UP_WORK_V1_REQUIRED_FIELDS = HERMES_REQUIRED_FIELDS_BY_CONTRACT.FollowUpWorkV1;
export const HERMES_LIFECYCLE_EVENT_V1_REQUIRED_FIELDS = HERMES_REQUIRED_FIELDS_BY_CONTRACT.HermesLifecycleEventV1;
export const HERMES_BOARD_LIFECYCLE_EVENT_V1_REQUIRED_FIELDS = HERMES_REQUIRED_FIELDS_BY_CONTRACT.HermesBoardLifecycleEventV1;
export const VERIFICATION_RECORD_V1_REQUIRED_FIELDS = HERMES_REQUIRED_FIELDS_BY_CONTRACT.VerificationRecordV1;
export const REVIEW_DISPOSITION_V1_REQUIRED_FIELDS = HERMES_REQUIRED_FIELDS_BY_CONTRACT.ReviewDispositionV1;

export const HERMES_OUTCOME_V1_SERIALIZED_FIELDS = HERMES_SERIALIZED_FIELDS_BY_CONTRACT.HermesOutcomeV1;
export const HERMES_LANE_RUN_V1_SERIALIZED_FIELDS = HERMES_SERIALIZED_FIELDS_BY_CONTRACT.HermesLaneRunV1;
export const DELIVERY_EVIDENCE_V1_SERIALIZED_FIELDS = HERMES_SERIALIZED_FIELDS_BY_CONTRACT.DeliveryEvidenceV1;
export const POLICY_DECISION_V1_SERIALIZED_FIELDS = HERMES_SERIALIZED_FIELDS_BY_CONTRACT.PolicyDecisionV1;
export const EXTERNAL_IMPACT_REQUEST_V1_SERIALIZED_FIELDS = HERMES_SERIALIZED_FIELDS_BY_CONTRACT.ExternalImpactRequestV1;
export const FOLLOW_UP_WORK_V1_SERIALIZED_FIELDS = HERMES_SERIALIZED_FIELDS_BY_CONTRACT.FollowUpWorkV1;
export const HERMES_LIFECYCLE_EVENT_V1_SERIALIZED_FIELDS = HERMES_SERIALIZED_FIELDS_BY_CONTRACT.HermesLifecycleEventV1;
export const HERMES_BOARD_LIFECYCLE_EVENT_V1_SERIALIZED_FIELDS = HERMES_SERIALIZED_FIELDS_BY_CONTRACT.HermesBoardLifecycleEventV1;
export const VERIFICATION_RECORD_V1_SERIALIZED_FIELDS = HERMES_SERIALIZED_FIELDS_BY_CONTRACT.VerificationRecordV1;
export const REVIEW_DISPOSITION_V1_SERIALIZED_FIELDS = HERMES_SERIALIZED_FIELDS_BY_CONTRACT.ReviewDispositionV1;

export const HERMES_SCHEMA_JSON = Object.freeze({
  schemaVersion: "v1",
  requiredFields: HERMES_REQUIRED_FIELDS_BY_CONTRACT,
  serializedFields: HERMES_SERIALIZED_FIELDS_BY_CONTRACT,
} as const);

export type HermesContractName = keyof typeof HERMES_REQUIRED_FIELDS_BY_CONTRACT;
