export const AUTHORITATIVE_PACKET_STAGES = [
  "capture",
  "classify",
  "route",
  "shape",
  "needs_approval",
  "execute",
  "review",
  "promote",
  "deliver",
  "learn",
] as const;

export type AuthoritativePacketStage = (typeof AUTHORITATIVE_PACKET_STAGES)[number];

export const AUTHORITATIVE_PACKET_STAGE_LABELS: Record<AuthoritativePacketStage, string> = {
  capture: "Capture",
  classify: "Classify",
  route: "Route",
  shape: "Shape",
  needs_approval: "Needs Approval",
  execute: "Execute",
  review: "Review",
  promote: "Promote",
  deliver: "Deliver",
  learn: "Learn",
};

export const AUTHORITATIVE_PACKET_STATUSES = ["active", "waiting", "blocked", "failed", "complete", "deferred"] as const;

export type AuthoritativePacketStatus = (typeof AUTHORITATIVE_PACKET_STATUSES)[number];
export type AuthoritativePacketTruthLabel = "source_owned" | "derived_projection" | "operator_asserted";

export type PipelineLifecycleStageSemanticV0 =
  | "intake"
  | "route"
  | "shape"
  | "approval"
  | "execute"
  | "review"
  | "promote"
  | "deliver"
  | "learn"
  | "terminal"
  | "deferred"
  | "unknown";

export type PipelineLifecycleStageResolutionV0 = AuthoritativePacketStage | "terminal" | "deferred" | "unknown";

export const PIPELINE_LIFECYCLE_STAGE_TO_AUTHORITATIVE: Record<
  PipelineLifecycleStageSemanticV0,
  PipelineLifecycleStageResolutionV0
> = {
  intake: "capture",
  route: "route",
  shape: "shape",
  approval: "needs_approval",
  execute: "execute",
  review: "review",
  promote: "promote",
  deliver: "deliver",
  learn: "learn",
  terminal: "terminal",
  deferred: "deferred",
  unknown: "unknown",
};

export const AUTHORITATIVE_PACKET_STAGE_PRD_SEMANTICS: Record<
  AuthoritativePacketStage,
  Exclude<PipelineLifecycleStageSemanticV0, "terminal" | "deferred" | "unknown">
> = {
  capture: "intake",
  classify: "intake",
  route: "route",
  shape: "shape",
  needs_approval: "approval",
  execute: "execute",
  review: "review",
  promote: "promote",
  deliver: "deliver",
  learn: "learn",
};

export const AUTHORITATIVE_PACKET_DISPATCHABLE_STATUSES = ["waiting"] as const;
export const AUTHORITATIVE_PACKET_LIVE_PROGRESS_STATUSES = ["active"] as const;
export const AUTHORITATIVE_PACKET_CLOSED_STATUSES = ["failed", "complete", "deferred"] as const;
export const AUTHORITATIVE_PACKET_DISPATCHABLE_STAGES = [
  "capture",
  "classify",
  "route",
  "shape",
  "execute",
  "review",
  "promote",
  "deliver",
] as const satisfies readonly AuthoritativePacketStage[];
export const AUTHORITATIVE_PACKET_LIVE_PROGRESS_STAGES = [
  "capture",
  "classify",
  "route",
  "shape",
  "execute",
  "review",
  "promote",
  "deliver",
] as const satisfies readonly AuthoritativePacketStage[];

export interface AuthoritativePacketStateLike {
  currentStage?: unknown;
  targetStage?: unknown;
  stage?: unknown;
  status?: unknown;
}

export function isKnownAuthoritativePacketStage(value: unknown): value is AuthoritativePacketStage {
  return typeof value === "string" && (AUTHORITATIVE_PACKET_STAGES as readonly string[]).includes(value);
}

export function isKnownAuthoritativePacketStatus(value: unknown): value is AuthoritativePacketStatus {
  return typeof value === "string" && (AUTHORITATIVE_PACKET_STATUSES as readonly string[]).includes(value);
}

export function isClosedAuthoritativePacketStatus(value: unknown): value is (typeof AUTHORITATIVE_PACKET_CLOSED_STATUSES)[number] {
  return typeof value === "string" && (AUTHORITATIVE_PACKET_CLOSED_STATUSES as readonly string[]).includes(value);
}

export function isDispatchableAuthoritativePacketState(state: AuthoritativePacketStateLike | null | undefined): boolean {
  const stage = getAuthoritativePacketStateStage(state);
  return (
    isKnownAuthoritativePacketStage(stage) &&
    (AUTHORITATIVE_PACKET_DISPATCHABLE_STAGES as readonly string[]).includes(stage) &&
    state?.status === "waiting"
  );
}

export function isLiveProgressAuthoritativePacketState(state: AuthoritativePacketStateLike | null | undefined): boolean {
  const stage = getAuthoritativePacketStateStage(state);
  return (
    isKnownAuthoritativePacketStage(stage) &&
    (AUTHORITATIVE_PACKET_LIVE_PROGRESS_STAGES as readonly string[]).includes(stage) &&
    state?.status === "active"
  );
}

function getAuthoritativePacketStateStage(state: AuthoritativePacketStateLike | null | undefined): unknown {
  if (!state) {
    return undefined;
  }
  const stageValues = [state.currentStage, state.stage].filter((value) => value !== undefined && value !== null);
  if (stageValues.length === 0) {
    return undefined;
  }
  const [firstStage] = stageValues;
  if (!stageValues.every((value) => value === firstStage)) {
    return undefined;
  }
  return state.targetStage === undefined || state.targetStage === null || state.targetStage === firstStage ? firstStage : undefined;
}

export interface AuthoritativePacketActor {
  actorId?: string | null;
  actorLabel?: string | null;
  actorType: "system" | "operator" | "manager" | "worker";
}

export interface AuthoritativePacketSourceRef {
  refId: string;
  sourceType: "prd" | "bmad_story" | "operator_input" | "workflow" | "repo_doc";
  pathOrUrl?: string | null;
  title?: string | null;
  contentSha256?: string | null;
}

export function isAuthoritativePacketSourceRef(value: unknown): value is AuthoritativePacketSourceRef {
  if (!value || typeof value !== "object") return false;
  const sourceRef = value as AuthoritativePacketSourceRef;
  return (
    typeof sourceRef.refId === "string" &&
    ["prd", "bmad_story", "operator_input", "workflow", "repo_doc"].includes(sourceRef.sourceType) &&
    (sourceRef.pathOrUrl === null || sourceRef.pathOrUrl === undefined || typeof sourceRef.pathOrUrl === "string") &&
    (sourceRef.title === null || sourceRef.title === undefined || typeof sourceRef.title === "string") &&
    (sourceRef.contentSha256 === null || sourceRef.contentSha256 === undefined || (typeof sourceRef.contentSha256 === "string" && /^[0-9a-f]{64}$/i.test(sourceRef.contentSha256)))
  );
}

export interface AuthoritativePacketLifecycleEvent {
  eventId: string;
  packetId: string;
  schemaVersion: 1;
  eventType: "packet.created" | "packet.stage_transitioned" | "packet.operational_action_applied";
  previousStage?: AuthoritativePacketStage | null;
  targetStage: AuthoritativePacketStage;
  status: AuthoritativePacketStatus;
  truthLabel: AuthoritativePacketTruthLabel;
  sourceRef: AuthoritativePacketSourceRef;
  actor: AuthoritativePacketActor;
  occurredAt: string;
  correlationId?: string | null;
  causationId?: string | null;
  idempotencyKey?: string | null;
  payloadSummary: string;
  evidenceRefs: string[];
  metadataOnly: true;
}

export interface AuthoritativeWorkPacketLifecycleView {
  packetId: string;
  title: string;
  currentStage: AuthoritativePacketStage;
  status: AuthoritativePacketStatus;
  truthLabel: AuthoritativePacketTruthLabel;
  sourceRef: AuthoritativePacketSourceRef;
  createdAt: string;
  updatedAt: string;
  currentEventId: string;
  parentPacketId?: string | null;
  lineageKind?: string;
  readyToTest?: PipelineReadyToTestV0 | null;
  operatorTestState?: "not_ready" | "ready" | "passed" | "failed" | "rework";
  operatorTestNote?: string | null;
  history: AuthoritativePacketLifecycleEvent[];
  metadataOnly: true;
}

export interface CreateAuthoritativeWorkPacketRequest {
  packetId?: string;
  title: string;
  initialStage?: AuthoritativePacketStage;
  status?: AuthoritativePacketStatus;
  truthLabel?: AuthoritativePacketTruthLabel;
  sourceRef: AuthoritativePacketSourceRef;
  actor: AuthoritativePacketActor;
  idempotencyKey?: string | null;
  parentPacketId?: string | null;
  lineageKind?: string;
  readyToTest?: PipelineReadyToTestV0 | null;
  payloadSummary?: string;
  evidenceRefs?: string[];
}

export interface TransitionAuthoritativeWorkPacketRequest {
  targetStage: AuthoritativePacketStage;
  expectedCurrentEventId: string;
  status?: AuthoritativePacketStatus;
  truthLabel?: AuthoritativePacketTruthLabel;
  actor: AuthoritativePacketActor;
  idempotencyKey?: string | null;
  readyToTest?: PipelineReadyToTestV0 | null;
  payloadSummary?: string;
  evidenceRefs?: string[];
}

/**
 * The canonical-contract vocabulary is deliberately data-only.  It gives
 * every product mode the same source, evidence, gate, and readiness language
 * without granting an adapter permission to perform the represented action.
 */
export const PIPELINE_CANONICAL_CONTRACT_SCHEMA_VERSION = "pipeline-canonical-contract/v1" as const;

export const PIPELINE_CANONICAL_SOURCE_ROLES = ["canonical", "supporting", "derived"] as const;
export type PipelineCanonicalSourceRoleV0 = (typeof PIPELINE_CANONICAL_SOURCE_ROLES)[number];

export const PIPELINE_CANONICAL_SOURCE_TRUST_STATES = ["authoritative", "attested", "derived", "untrusted"] as const;
export type PipelineCanonicalSourceTrustStateV0 = (typeof PIPELINE_CANONICAL_SOURCE_TRUST_STATES)[number];

export const PIPELINE_EVIDENCE_RETENTION_DISPOSITIONS = ["metadata_only", "summary_only", "fixture_only"] as const;
export type PipelineEvidenceRetentionDispositionV0 = (typeof PIPELINE_EVIDENCE_RETENTION_DISPOSITIONS)[number];

export const PIPELINE_QUALITY_GATE_STATES = ["pass", "fail", "blocked", "not_applicable"] as const;
export type PipelineQualityGateStateV0 = (typeof PIPELINE_QUALITY_GATE_STATES)[number];

export const PIPELINE_READINESS_COMPONENT_IDS = [
  "source_provenance",
  "trust_boundary",
  "authority_boundary",
  "evidence_retention",
  "quality_gates",
  "delivery_evidence",
] as const;
export type PipelineReadinessComponentIdV0 = (typeof PIPELINE_READINESS_COMPONENT_IDS)[number];

export const PIPELINE_PRODUCT_MODES = ["contract_only", "operator_review", "local_proof", "read_only", "bounded_write"] as const;
export type PipelineProductModeV0 = (typeof PIPELINE_PRODUCT_MODES)[number];

export const PIPELINE_NORMALIZED_DELIVERY_ACTIONS = ["branch_push", "pull_request", "merge", "cleanup"] as const;
export type PipelineNormalizedDeliveryActionV0 = (typeof PIPELINE_NORMALIZED_DELIVERY_ACTIONS)[number];

export interface PipelineAuthorityProhibitionsV0 {
  sourceMutationAllowed: false;
  providerCallsAllowed: false;
  workerLaunchAllowed: false;
  githubMutationAllowed: false;
  rawPayloadRetentionAllowed: false;
}

export interface PipelineCanonicalSourceProvenanceV0 {
  sourceRef: AuthoritativePacketSourceRef;
  observedAt: string;
  evidenceRefs: string[];
}

export interface PipelineCanonicalSourceV0 {
  sourceId: string;
  role: PipelineCanonicalSourceRoleV0;
  trust: PipelineCanonicalSourceTrustStateV0;
  provenance: PipelineCanonicalSourceProvenanceV0;
  authority: PipelineAuthorityProhibitionsV0;
  metadataOnly: true;
  rawPayloadRetained: false;
}

export interface PipelineEvidenceRetentionV0 {
  evidenceId: string;
  disposition: PipelineEvidenceRetentionDispositionV0;
  evidenceRefs: string[];
  metadataOnly: true;
  rawPayloadRetained: false;
}

export type PipelineQualityGateV0 =
  | {
      kind: "gate";
      gateId: string;
      requirement: "required";
      state: Exclude<PipelineQualityGateStateV0, "not_applicable">;
      evidenceRefs: string[];
    }
  | {
      kind: "gate";
      gateId: string;
      requirement: "not_applicable";
      state: "not_applicable";
      notApplicableReason: string;
      evidenceRefs: string[];
    };

export interface PipelineQualityGateGroupV0 {
  kind: "all_of" | "any_of";
  gateId: string;
  children: [PipelineQualityGateNodeV0, ...PipelineQualityGateNodeV0[]];
}

export type PipelineQualityGateNodeV0 = PipelineQualityGateV0 | PipelineQualityGateGroupV0;

export type PipelineReadinessComponentV0 =
  | {
      componentId: PipelineReadinessComponentIdV0;
      requirement: "required";
      state: "pass" | "fail" | "blocked";
      evidenceRefs: string[];
    }
  | {
      componentId: PipelineReadinessComponentIdV0;
      requirement: "not_applicable";
      state: "not_applicable";
      notApplicableReason: string;
      evidenceRefs: string[];
    };

export type PipelineReadinessComponentsV0 = {
  [ComponentId in PipelineReadinessComponentIdV0]: PipelineReadinessComponentV0 & { componentId: ComponentId };
};

export interface PipelineNormalizedDeliveryEvidenceV0 {
  deliveryId: string;
  action: PipelineNormalizedDeliveryActionV0;
  status: "recorded" | "blocked" | "not_applicable";
  target: {
    repository: string;
    baseBranch?: string | null;
    headRevision?: string | null;
    pullRequestUrl?: string | null;
  };
  evidence: PipelineEvidenceRetentionV0;
  authority: PipelineAuthorityProhibitionsV0;
  deliveryAuthorityGranted: false;
  metadataOnly: true;
  rawPayloadRetained: false;
}

/** Inputs only: mapping this object to product behavior remains a separate, authority-gated concern. */
export interface PipelineProductModeMappingInputsV0 {
  schemaVersion: typeof PIPELINE_CANONICAL_CONTRACT_SCHEMA_VERSION;
  productMode: PipelineProductModeV0;
  canonicalSource: PipelineCanonicalSourceV0;
  qualityGates: PipelineQualityGateNodeV0;
  readinessComponents: PipelineReadinessComponentsV0;
  deliveryEvidence: PipelineNormalizedDeliveryEvidenceV0[];
  authority: PipelineAuthorityProhibitionsV0;
  metadataOnly: true;
  rawPayloadRetained: false;
}

/** Canonical contract data as persisted and projected by the supervisor. */
export type PipelineCanonicalContractV1 = PipelineProductModeMappingInputsV0;

/** Read-time product posture; this describes capability and never grants authority. */
export interface PipelineProductModeMappingV0 {
  requestedProductMode: PipelineProductModeV0;
  effectiveProductMode: PipelineProductModeV0 | "blocked";
  operationalMode: "disabled" | "local_proof" | "read_only" | "bounded_write" | "unavailable" | "unknown";
  readinessState: "ready" | "degraded" | "blocked" | "unavailable" | "unknown";
  freshnessState: "live" | "stale" | "unavailable" | "unknown";
  capabilityState: "available" | "gated" | "unavailable" | "simulated" | "unknown";
  checkedAt: string;
  expiresAt: string;
  ready: boolean;
  blockedReasons: string[];
  metadataOnly: true;
  rawPayloadRetained: false;
  sourceMutationAllowed: false;
  providerCallsAllowed: false;
  workerLaunchAllowed: false;
  githubMutationAllowed: false;
}

export type PipelineCanonicalContractValidationCodeV0 =
  | "invalid_object"
  | "invalid_enum"
  | "blank_identifier"
  | "invalid_timestamp"
  | "invalid_evidence_refs"
  | "invalid_readiness_semantics"
  | "invalid_quality_gate"
  | "authority_violation"
  | "bad_retention_flag"
  | "bad_schema_version"
  | "forbidden_field";

export interface PipelineCanonicalContractValidationIssueV0 {
  field: string;
  code: PipelineCanonicalContractValidationCodeV0;
  summary: string;
}

const PIPELINE_CANONICAL_FORBIDDEN_KEYS = /^(?:rawPrompt|rawCompletion|rawPayload|providerPayload|reasoningTrace|secret|credential|password|apiKey|accessToken|terminalOutput|stdout|stderr|transcript)$/i;

function canonicalContractRecord(value: unknown, issues: PipelineCanonicalContractValidationIssueV0[], field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    issues.push({ field, code: "invalid_object", summary: "Canonical contract values must be objects." });
    return {};
  }
  return value as Record<string, unknown>;
}

function canonicalContractText(value: unknown): value is string {
  return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 240 && !PIPELINE_CANONICAL_FORBIDDEN_KEYS.test(value);
}

function canonicalContractRefs(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(canonicalContractText);
}

function pushCanonicalAuthorityIssues(
  issues: PipelineCanonicalContractValidationIssueV0[],
  value: unknown,
  field: string,
): void {
  const authority = canonicalContractRecord(value, issues, field);
  for (const key of ["sourceMutationAllowed", "providerCallsAllowed", "workerLaunchAllowed", "githubMutationAllowed", "rawPayloadRetentionAllowed"] as const) {
    if (authority[key] !== false) {
      issues.push({ field: `${field}.${key}`, code: "authority_violation", summary: "Canonical contract data cannot grant execution or retention authority." });
    }
  }
}

function pushCanonicalRetentionIssues(
  issues: PipelineCanonicalContractValidationIssueV0[],
  record: Record<string, unknown>,
  field: string,
): void {
  if (record.metadataOnly !== true || record.rawPayloadRetained !== false) {
    issues.push({ field, code: "bad_retention_flag", summary: "Canonical contract data is metadata-only and must not retain raw payloads." });
  }
  for (const key of Object.keys(record)) {
    if (PIPELINE_CANONICAL_FORBIDDEN_KEYS.test(key)) {
      issues.push({ field: `${field}.${key}`, code: "forbidden_field", summary: "Canonical contract data must not contain raw payload or secret fields." });
    }
  }
}

export function validatePipelineCanonicalSourceV0(source: unknown): PipelineCanonicalContractValidationIssueV0[] {
  const issues: PipelineCanonicalContractValidationIssueV0[] = [];
  const record = canonicalContractRecord(source, issues, "source");
  if (!canonicalContractText(record.sourceId)) issues.push({ field: "source.sourceId", code: "blank_identifier", summary: "Canonical sources require a bounded source id." });
  if (!(PIPELINE_CANONICAL_SOURCE_ROLES as readonly string[]).includes(record.role as string)) issues.push({ field: "source.role", code: "invalid_enum", summary: "Canonical source role is not recognized." });
  if (!(PIPELINE_CANONICAL_SOURCE_TRUST_STATES as readonly string[]).includes(record.trust as string)) issues.push({ field: "source.trust", code: "invalid_enum", summary: "Canonical source trust state is not recognized." });
  if (record.role === "canonical" && !["authoritative", "attested"].includes(record.trust as string)) issues.push({ field: "source.trust", code: "invalid_readiness_semantics", summary: "Canonical sources must be authoritative or attested." });
  if (record.role === "derived" && record.trust !== "derived") issues.push({ field: "source.trust", code: "invalid_readiness_semantics", summary: "Derived sources must remain typed as derived trust." });
  const provenance = canonicalContractRecord(record.provenance, issues, "source.provenance");
  if (!isAuthoritativePacketSourceRef(provenance.sourceRef)) issues.push({ field: "source.provenance.sourceRef", code: "invalid_object", summary: "Canonical source provenance requires an authoritative source reference." });
  if (typeof provenance.observedAt !== "string" || !Number.isFinite(Date.parse(provenance.observedAt))) issues.push({ field: "source.provenance.observedAt", code: "invalid_timestamp", summary: "Canonical source provenance requires a parseable observation timestamp." });
  if (!canonicalContractRefs(provenance.evidenceRefs)) issues.push({ field: "source.provenance.evidenceRefs", code: "invalid_evidence_refs", summary: "Canonical source provenance requires bounded metadata evidence refs." });
  pushCanonicalAuthorityIssues(issues, record.authority, "source.authority");
  pushCanonicalRetentionIssues(issues, record, "source");
  return issues;
}

export function validatePipelineQualityGateNodeV0(gate: unknown): PipelineCanonicalContractValidationIssueV0[] {
  const issues: PipelineCanonicalContractValidationIssueV0[] = [];
  const validate = (value: unknown, field: string, depth: number): void => {
    const record = canonicalContractRecord(value, issues, field);
    if (depth > 8) {
      issues.push({ field, code: "invalid_quality_gate", summary: "Composable quality gates may not exceed eight nested groups." });
      return;
    }
    if (!canonicalContractText(record.gateId)) issues.push({ field: `${field}.gateId`, code: "blank_identifier", summary: "Quality gates require bounded ids." });
    if (record.kind === "gate") {
      if (record.requirement === "required" && !["pass", "fail", "blocked"].includes(record.state as string)) issues.push({ field: `${field}.state`, code: "invalid_readiness_semantics", summary: "Required quality gates cannot be not applicable." });
      if (record.requirement === "not_applicable" && (record.state !== "not_applicable" || !canonicalContractText(record.notApplicableReason))) issues.push({ field: `${field}.state`, code: "invalid_readiness_semantics", summary: "Not-applicable quality gates require the not_applicable state and a reason." });
      if (record.requirement !== "required" && record.requirement !== "not_applicable") issues.push({ field: `${field}.requirement`, code: "invalid_enum", summary: "Quality gate requirement is not recognized." });
      if (!canonicalContractRefs(record.evidenceRefs)) issues.push({ field: `${field}.evidenceRefs`, code: "invalid_evidence_refs", summary: "Quality gates require bounded metadata evidence refs." });
      return;
    }
    if (record.kind !== "all_of" && record.kind !== "any_of") {
      issues.push({ field: `${field}.kind`, code: "invalid_quality_gate", summary: "Quality gates must be a leaf, all_of, or any_of group." });
      return;
    }
    if (!Array.isArray(record.children) || record.children.length === 0) {
      issues.push({ field: `${field}.children`, code: "invalid_quality_gate", summary: "Composable quality gate groups require at least one child." });
      return;
    }
    record.children.forEach((child, index) => validate(child, `${field}.children.${index}`, depth + 1));
  };
  validate(gate, "qualityGates", 0);
  return issues;
}

export function validatePipelineReadinessComponentsV0(components: unknown): PipelineCanonicalContractValidationIssueV0[] {
  const issues: PipelineCanonicalContractValidationIssueV0[] = [];
  const record = canonicalContractRecord(components, issues, "readinessComponents");
  for (const componentId of PIPELINE_READINESS_COMPONENT_IDS) {
    const component = canonicalContractRecord(record[componentId], issues, `readinessComponents.${componentId}`);
    if (component.componentId !== componentId) issues.push({ field: `readinessComponents.${componentId}.componentId`, code: "invalid_readiness_semantics", summary: "Readiness component id must match its canonical component slot." });
    if (component.requirement === "required" && !["pass", "fail", "blocked"].includes(component.state as string)) issues.push({ field: `readinessComponents.${componentId}.state`, code: "invalid_readiness_semantics", summary: "Required readiness components cannot be not applicable." });
    if (component.requirement === "not_applicable" && (component.state !== "not_applicable" || !canonicalContractText(component.notApplicableReason))) issues.push({ field: `readinessComponents.${componentId}.state`, code: "invalid_readiness_semantics", summary: "Not-applicable readiness components require the not_applicable state and a reason." });
    if (component.requirement !== "required" && component.requirement !== "not_applicable") issues.push({ field: `readinessComponents.${componentId}.requirement`, code: "invalid_enum", summary: "Readiness component requirement is not recognized." });
    if (!canonicalContractRefs(component.evidenceRefs)) issues.push({ field: `readinessComponents.${componentId}.evidenceRefs`, code: "invalid_evidence_refs", summary: "Readiness components require bounded metadata evidence refs." });
  }
  return issues;
}

export function validatePipelineProductModeMappingInputsV0(inputs: unknown): PipelineCanonicalContractValidationIssueV0[] {
  const issues: PipelineCanonicalContractValidationIssueV0[] = [];
  const record = canonicalContractRecord(inputs, issues, "inputs");
  if (record.schemaVersion !== PIPELINE_CANONICAL_CONTRACT_SCHEMA_VERSION) issues.push({ field: "schemaVersion", code: "bad_schema_version", summary: "Product-mode mapping inputs use an unsupported canonical contract version." });
  if (!(PIPELINE_PRODUCT_MODES as readonly string[]).includes(record.productMode as string)) issues.push({ field: "productMode", code: "invalid_enum", summary: "Product-mode mapping inputs require a known product mode." });
  issues.push(...validatePipelineCanonicalSourceV0(record.canonicalSource));
  if (canonicalContractRecord(record.canonicalSource, issues, "canonicalSource").role !== "canonical") {
    issues.push({ field: "canonicalSource.role", code: "invalid_readiness_semantics", summary: "The canonical source slot requires the canonical role." });
  }
  issues.push(...validatePipelineQualityGateNodeV0(record.qualityGates));
  issues.push(...validatePipelineReadinessComponentsV0(record.readinessComponents));
  if (!Array.isArray(record.deliveryEvidence)) {
    issues.push({ field: "deliveryEvidence", code: "invalid_object", summary: "Product-mode mapping inputs require normalized delivery evidence entries." });
  } else {
    record.deliveryEvidence.forEach((entry, index) => {
      const delivery = canonicalContractRecord(entry, issues, `deliveryEvidence.${index}`);
      if (!canonicalContractText(delivery.deliveryId)) issues.push({ field: `deliveryEvidence.${index}.deliveryId`, code: "blank_identifier", summary: "Normalized delivery evidence requires an id." });
      if (!(PIPELINE_NORMALIZED_DELIVERY_ACTIONS as readonly string[]).includes(delivery.action as string)) issues.push({ field: `deliveryEvidence.${index}.action`, code: "invalid_enum", summary: "Normalized delivery evidence action is not recognized." });
      if (!["recorded", "blocked", "not_applicable"].includes(delivery.status as string)) issues.push({ field: `deliveryEvidence.${index}.status`, code: "invalid_enum", summary: "Normalized delivery evidence status is not recognized." });
      if (delivery.deliveryAuthorityGranted !== false) issues.push({ field: `deliveryEvidence.${index}.deliveryAuthorityGranted`, code: "authority_violation", summary: "Delivery evidence never grants delivery authority." });
      const evidence = canonicalContractRecord(delivery.evidence, issues, `deliveryEvidence.${index}.evidence`);
      if (!(PIPELINE_EVIDENCE_RETENTION_DISPOSITIONS as readonly string[]).includes(evidence.disposition as string) || !canonicalContractText(evidence.evidenceId) || !canonicalContractRefs(evidence.evidenceRefs)) issues.push({ field: `deliveryEvidence.${index}.evidence`, code: "invalid_evidence_refs", summary: "Normalized delivery evidence requires a typed retention disposition and metadata refs." });
      pushCanonicalRetentionIssues(issues, evidence, `deliveryEvidence.${index}.evidence`);
      pushCanonicalAuthorityIssues(issues, delivery.authority, `deliveryEvidence.${index}.authority`);
      pushCanonicalRetentionIssues(issues, delivery, `deliveryEvidence.${index}`);
    });
  }
  pushCanonicalAuthorityIssues(issues, record.authority, "authority");
  pushCanonicalRetentionIssues(issues, record, "inputs");
  return issues;
}

export function isPipelineCanonicalContractV1(value: unknown): value is PipelineCanonicalContractV1 {
  return validatePipelineProductModeMappingInputsV0(value).length === 0;
}

export function isPipelineProductModeMappingV0(value: unknown): value is PipelineProductModeMappingV0 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const mapping = value as Record<string, unknown>;
  return (
    (PIPELINE_PRODUCT_MODES as readonly string[]).includes(mapping.requestedProductMode as string) &&
    ([...PIPELINE_PRODUCT_MODES, "blocked"] as readonly string[]).includes(mapping.effectiveProductMode as string) &&
    ["disabled", "local_proof", "read_only", "bounded_write", "unavailable", "unknown"].includes(mapping.operationalMode as string) &&
    ["ready", "degraded", "blocked", "unavailable", "unknown"].includes(mapping.readinessState as string) &&
    ["live", "stale", "unavailable", "unknown"].includes(mapping.freshnessState as string) &&
    ["available", "gated", "unavailable", "simulated", "unknown"].includes(mapping.capabilityState as string) &&
    typeof mapping.checkedAt === "string" && Number.isFinite(Date.parse(mapping.checkedAt)) &&
    typeof mapping.expiresAt === "string" && Number.isFinite(Date.parse(mapping.expiresAt)) &&
    Date.parse(mapping.expiresAt) >= Date.parse(mapping.checkedAt) &&
    typeof mapping.ready === "boolean" &&
    Array.isArray(mapping.blockedReasons) && mapping.blockedReasons.every(canonicalContractText) &&
    mapping.metadataOnly === true &&
    mapping.rawPayloadRetained === false &&
    mapping.sourceMutationAllowed === false &&
    mapping.providerCallsAllowed === false &&
    mapping.workerLaunchAllowed === false &&
    mapping.githubMutationAllowed === false
  );
}

export const PIPELINE_OPERATIONAL_ACTION_SCHEMA_VERSION = "pipeline-operational-action/v0" as const;
export const PIPELINE_OPERATIONAL_ACTION_V1_SCHEMA_VERSION = "pipeline-operational-action/v1" as const;
export const PIPELINE_OPERATIONAL_RUNTIME_READINESS_SCHEMA_VERSION = "pipeline-operational-runtime-readiness/v0" as const;
export const PIPELINE_OPERATIONAL_READINESS_CONTRACT_SCHEMA_VERSION = "pipeline-operational-readiness-contract/v0" as const;
export const PIPELINE_ONE_WORKER_LIVE_CANARY_SCHEMA_VERSION = "pipeline-one-worker-live-canary/v0" as const;
export const PIPELINE_LIVE_CAPACITY_RAMP_SCHEMA_VERSION = "pipeline-live-capacity-ramp/v0" as const;
export const PIPELINE_RESILIENCE_RECOVERY_SCHEMA_VERSION = "pipeline-resilience-recovery-validation/v0" as const;
export const PIPELINE_OPERATIONAL_HARDENING_SCHEMA_VERSION = "pipeline-operational-hardening-runbooks/v0" as const;
export const PIPELINE_PRODUCTION_READINESS_DECISION_SCHEMA_VERSION = "pipeline-production-readiness-decision/v0" as const;
export const PIPELINE_OBSERVED_EVIDENCE_ATTESTATION_SCHEMA_VERSION = "pipeline-observed-evidence-attestation/v0" as const;
export const PIPELINE_EPIC_25_EVIDENCE_CHAIN_SCHEMA_VERSION = "pipeline-epic-25-evidence-chain/v0" as const;
export const PIPELINE_EPIC_25_EVIDENCE_CHAIN_V1_SCHEMA_VERSION = "pipeline-epic-25-evidence-chain/v1" as const;
export const PIPELINE_EPIC_25_POLICY_PROFILE_SCHEMA_VERSION = "pipeline-epic-25-policy-profile/v0" as const;

export const PIPELINE_OPERATIONAL_ACTION_RISK_TIERS = ["low", "medium", "high", "extreme"] as const;
export type PipelineOperationalActionRiskTierV0 = (typeof PIPELINE_OPERATIONAL_ACTION_RISK_TIERS)[number];

export const PIPELINE_OPERATIONAL_ACTION_CAPABILITY_STATES = ["available", "unavailable", "gated", "simulated"] as const;
export type PipelineOperationalActionCapabilityStateV0 = (typeof PIPELINE_OPERATIONAL_ACTION_CAPABILITY_STATES)[number];

export const PIPELINE_OPERATIONAL_ACTION_AUTHORITY_STATES = [
  "not_required",
  "allowed",
  "needs_product_approval",
  "needs_authority_approval",
  "needs_resource_approval",
  "needs_destination_approval",
  "needs_safety_approval",
  "blocked",
] as const;
export type PipelineOperationalActionAuthorityStateV0 = (typeof PIPELINE_OPERATIONAL_ACTION_AUTHORITY_STATES)[number];
export type PipelineOperationalActionRequestedAuthorityStateV0 = Exclude<PipelineOperationalActionAuthorityStateV0, "allowed">;

export const PIPELINE_OPERATIONAL_ACTION_TYPED_REASONS = [
  "no_eligible_work",
  "blocked_by_policy",
  "blocked_by_approval",
  "blocked_by_resources",
  "runtime_unavailable",
  "worker_failed",
  "verification_failed",
  "delivery_blocked",
  "evidence_invalid",
  "projection_stale",
  "invalid_transition",
  "test_not_ready",
  "authenticated_session_required",
  "unsupported_action",
  "unknown",
] as const;
export type PipelineOperationalActionTypedReasonV0 = (typeof PIPELINE_OPERATIONAL_ACTION_TYPED_REASONS)[number];

export const PIPELINE_OPERATIONAL_ACTION_IDS = [
  "inspect",
  "refresh_projection",
  "dispatch_apply",
  "mark_viewed",
  "retry_verification",
  "requeue",
  "mark_tested",
  "request_rework",
  "pause",
  "drain",
  "reassign",
  "reject",
  "kill_worker",
  "mutate_source",
  "push_branch",
  "open_pr",
  "merge",
  "delete_branch",
  "cleanup",
  "credential_or_provider_change",
] as const;
export type PipelineOperationalActionIdV0 = (typeof PIPELINE_OPERATIONAL_ACTION_IDS)[number];
export const PIPELINE_GATED_OPERATIONAL_ACTION_IDS = ["mark_tested", "request_rework", "requeue", "reject"] as const;
export type PipelineGatedOperationalActionIdV0 = (typeof PIPELINE_GATED_OPERATIONAL_ACTION_IDS)[number];

export const PIPELINE_OPERATIONAL_ACTION_TARGET_TYPES = [
  "work_packet",
  "candidate_work",
  "work_item",
  "execution_attempt",
  "worker",
  "workspace",
  "branch",
  "manager_run",
  "projection",
  "runtime",
  "unknown",
] as const;

export type PipelineOperationalActionTargetTypeV0 =
  (typeof PIPELINE_OPERATIONAL_ACTION_TARGET_TYPES)[number];

export const PIPELINE_OPERATIONAL_ACTION_OUTCOMES = ["succeeded", "rejected", "blocked", "failed", "simulated"] as const;
export type PipelineOperationalActionOutcomeV0 = (typeof PIPELINE_OPERATIONAL_ACTION_OUTCOMES)[number];
export const PIPELINE_OPERATIONAL_RUNTIME_MODES = ["disabled", "local_proof", "read_only", "bounded_write", "unavailable", "unknown"] as const;
export type PipelineOperationalRuntimeModeV0 = (typeof PIPELINE_OPERATIONAL_RUNTIME_MODES)[number];
export const PIPELINE_OPERATIONAL_RUNTIME_READINESS_STATES = ["ready", "degraded", "blocked", "unavailable", "unknown"] as const;
export type PipelineOperationalRuntimeReadinessStateV0 = (typeof PIPELINE_OPERATIONAL_RUNTIME_READINESS_STATES)[number];
export type PipelineOperationalActionEvidenceRefsV0 = [string, ...string[]];

export const PIPELINE_OPERATIONAL_READINESS_GATE_STATES = ["pass", "fail", "blocked", "not_applicable"] as const;
export type PipelineOperationalReadinessGateStateV0 = (typeof PIPELINE_OPERATIONAL_READINESS_GATE_STATES)[number];
export const PIPELINE_OPERATIONAL_READINESS_BACKEND_TRUTHS = ["live", "simulated", "dry_run"] as const;
export type PipelineOperationalReadinessBackendTruthV0 = (typeof PIPELINE_OPERATIONAL_READINESS_BACKEND_TRUTHS)[number];
export const PIPELINE_OPERATIONAL_READINESS_OUTCOMES = ["go", "no_go"] as const;
export type PipelineOperationalReadinessOutcomeV0 = (typeof PIPELINE_OPERATIONAL_READINESS_OUTCOMES)[number];
export const PIPELINE_OPERATIONAL_EVIDENCE_CLASSES = ["fixture", "integrated_local", "live_observed"] as const;
export type PipelineOperationalEvidenceClassV0 = (typeof PIPELINE_OPERATIONAL_EVIDENCE_CLASSES)[number];
export const PIPELINE_OPERATIONAL_READINESS_REASONS = [
  "threshold_missing",
  "threshold_malformed",
  "telemetry_missing",
  "telemetry_stale",
  "telemetry_contradictory",
  "alert_coverage_missing",
  "rollback_missing",
  "recovery_missing",
  "ownership_ambiguous",
  "target_not_exact",
  "evidence_missing",
  "evidence_stale",
  "backend_truth_unproven",
  "configuration_invalid",
  "secret_like_metadata",
  "resource_pressure",
  "usage_pressure",
  "preflight_blocked",
  "dispatcher_lease_unproven",
  "receipt_unproven",
  "fixture_evidence",
  "evidence_provenance_missing",
  "evidence_attestation_invalid",
  "evidence_receipt_stale",
  "predecessor_gate_not_passed",
  "safety_violation",
  "authority_violation",
  "canary_authority_missing",
  "lease_missing",
  "checkpoint_missing",
  "latency_threshold_exceeded",
  "error_threshold_exceeded",
  "resource_threshold_exceeded",
  "cost_threshold_exceeded",
  "timeout",
  "recovery_boundary_breached",
  "canary_not_passed",
  "stage_plan_invalid",
  "capacity_missing",
  "stage_threshold_missing",
  "stage_threshold_exceeded",
  "stage_lifecycle_ambiguous",
  "stage_authority_missing",
  "stage_evidence_missing",
  "drill_evidence_missing",
  "recovery_ambiguity",
  "idempotency_unproven",
  "silent_retry",
  "recovery_drill_failed",
  "runbook_gap",
  "high_risk_gap",
  "runbook_owner_missing",
  "runbook_trigger_missing",
  "runbook_gate_missing",
  "runbook_recovery_missing",
  "unknown",
] as const;
export type PipelineOperationalReadinessReasonV0 = (typeof PIPELINE_OPERATIONAL_READINESS_REASONS)[number];

export interface PipelineOperationalReadinessTargetV0 {
  workerId: string;
  assignmentId: string;
  owner: string;
  runId: string;
  sourceRefs: PipelineOperationalActionEvidenceRefsV0;
  evidenceRefs: PipelineOperationalActionEvidenceRefsV0;
}

export interface PipelineOperationalReadinessGateV0 {
  gateId: string;
  state: PipelineOperationalReadinessGateStateV0;
  typedReason: PipelineOperationalReadinessReasonV0 | null;
  nextAction: string;
  evidenceRefs: PipelineOperationalActionEvidenceRefsV0;
}

export interface PipelineOperationalReadinessThresholdV0 {
  name: string;
  operator: "lt" | "lte" | "gt" | "gte" | "eq";
  value: number;
  unit: string;
  explicit: true;
}

export interface PipelineOperationalReadinessSliSloV0 {
  indicator: string;
  target: PipelineOperationalReadinessThresholdV0;
  windowSeconds: number;
  errorBudget: number;
  zeroTolerance?: true;
}

export interface PipelineOperationalReadinessTelemetryV0 {
  source: string;
  coverage: string;
  observationWindowSeconds: number;
  alertThresholdIds: string[];
  alertReady: boolean;
}

export interface PipelineOperationalReadinessConfigurationV0 {
  names: string[];
  validationState: "pass" | "fail" | "unknown";
  noValueRetention: true;
}

export interface PipelineOperationalReadinessRecoveryV0 {
  owner: string;
  rollbackPath: string;
  remediationAction: string;
  recheckAt: string;
  expiryAt: string;
}

export interface PipelineObservedEvidenceAttestationV0 {
  schemaVersion: typeof PIPELINE_OBSERVED_EVIDENCE_ATTESTATION_SCHEMA_VERSION;
  attestationId: string;
  evidenceClass: "live_observed";
  observer: {
    observerType: "independent_runtime";
    observerId: string;
  };
  subject: {
    packetSchemaVersion: string;
    targetRef: string;
  };
  receipt: {
    receiptId: string;
    observedAt: string;
    issuedAt: string;
    expiresAt: string;
    evidenceDigestSha256: `sha256:${string}`;
    sourceRefs: PipelineOperationalActionEvidenceRefsV0;
    evidenceRefs: PipelineOperationalActionEvidenceRefsV0;
  };
  metadataOnly: true;
  rawPayloadRetained: false;
}

export interface PipelineOperationalReadinessContractV0 {
  schemaVersion: typeof PIPELINE_OPERATIONAL_READINESS_CONTRACT_SCHEMA_VERSION;
  evidenceClass: PipelineOperationalEvidenceClassV0;
  observedEvidenceAttestation: PipelineObservedEvidenceAttestationV0 | null;
  target: PipelineOperationalReadinessTargetV0;
  backendTruth: PipelineOperationalReadinessBackendTruthV0;
  authorityState: PipelineOperationalActionAuthorityStateV0;
  riskTier: PipelineOperationalActionRiskTierV0;
  sliSlo: PipelineOperationalReadinessSliSloV0[];
  telemetry: PipelineOperationalReadinessTelemetryV0;
  configuration: PipelineOperationalReadinessConfigurationV0;
  recovery: PipelineOperationalReadinessRecoveryV0;
  gates: PipelineOperationalReadinessGateV0[];
  outcome: PipelineOperationalReadinessOutcomeV0;
  typedBlockers: Array<{ gateId: string; reason: PipelineOperationalReadinessReasonV0; nextAction: string }>;
  checkedAt: string;
  expiresAt: string;
  metadataOnly: true;
  rawPayloadRetained: false;
}

export const PIPELINE_ONE_WORKER_LIVE_CANARY_OUTCOMES = ["pass", "hold", "stop"] as const;
export type PipelineOneWorkerLiveCanaryOutcomeV0 = (typeof PIPELINE_ONE_WORKER_LIVE_CANARY_OUTCOMES)[number];

export interface PipelineOneWorkerLiveCanaryLeaseV0 {
  state: "pass" | "fail" | "blocked";
  proofRef: string;
}

export interface PipelineOneWorkerLiveCanaryCheckpointV0 {
  state: "pass" | "fail" | "blocked";
  proofRef: string;
}

export interface PipelineOneWorkerLiveCanaryTelemetryV0 {
  source: string;
  coverage: string;
  observationWindowSeconds: number | null;
  alertThresholdIds: string[];
  alertReady: boolean;
}

export interface PipelineOneWorkerLiveCanaryMeasurementsV0 {
  observedAt: string;
  latencyMs: number | null;
  errorCount: number | null;
  cpuPercent: number | null;
  memoryPercent: number | null;
  diskPercent: number | null;
  costCents: number | null;
  timedOut: boolean;
}

export interface PipelineOneWorkerLiveCanaryEvidenceV0 {
  schemaVersion: typeof PIPELINE_ONE_WORKER_LIVE_CANARY_SCHEMA_VERSION;
  evidenceClass: PipelineOperationalEvidenceClassV0;
  observedEvidenceAttestation: PipelineObservedEvidenceAttestationV0 | null;
  target: PipelineOperationalReadinessTargetV0;
  workerCount: 1;
  backendTruth: PipelineOperationalReadinessBackendTruthV0;
  truthLabel: PipelineOperationalReadinessBackendTruthV0;
  canaryAuthority: { state: "allowed" | "blocked"; proven: boolean; evidenceRefs: PipelineOperationalActionEvidenceRefsV0 | string[] };
  telemetry: PipelineOneWorkerLiveCanaryTelemetryV0;
  lease: PipelineOneWorkerLiveCanaryLeaseV0;
  checkpoint: PipelineOneWorkerLiveCanaryCheckpointV0;
  measurements: PipelineOneWorkerLiveCanaryMeasurementsV0;
  thresholds: Record<string, PipelineOperationalReadinessThresholdV0 | null>;
  recovery: { owner: string; rollbackPath: string; remediationAction: string; required: boolean };
  gates: PipelineOperationalReadinessGateV0[];
  outcome: PipelineOneWorkerLiveCanaryOutcomeV0;
  rampAllowed: boolean;
  typedBlockers: Array<{ gateId: string; reason: PipelineOperationalReadinessReasonV0; nextAction: string }>;
  sourceRefs: PipelineOperationalActionEvidenceRefsV0 | string[];
  evidenceRefs: PipelineOperationalActionEvidenceRefsV0 | string[];
  checkedAt: string;
  expiresAt: string;
  nextManagerAction: string;
  metadataOnly: true;
  rawPayloadRetained: false;
}

export const PIPELINE_LIVE_CAPACITY_RAMP_OUTCOMES = ["pass", "hold", "stop"] as const;
export type PipelineLiveCapacityRampOutcomeV0 = (typeof PIPELINE_LIVE_CAPACITY_RAMP_OUTCOMES)[number];

export interface PipelineLiveCapacityRampStageV0 {
  stageId: string;
  workerCount: number | null;
  capacityReady: boolean;
  durationSeconds: number | null;
  owner: string;
  budgetCents: number | null;
  rollbackThresholds: Record<string, PipelineOperationalReadinessThresholdV0 | null>;
  authority: { state: "allowed" | "blocked"; proven: boolean; evidenceRefs: string[] };
  observed: {
    queueDepth: number | null;
    leaseHealthy: boolean;
    latencyMs: number | null;
    errorCount: number | null;
    cpuPercent: number | null;
    memoryPercent: number | null;
    diskPercent: number | null;
    processCount: number | null;
    usageState: "normal" | "ready" | "drain" | "manager_only" | "unknown";
    costCents: number | null;
  };
  changed: boolean;
  skipped: boolean;
  rationale: string;
  replacementThresholds: Record<string, PipelineOperationalReadinessThresholdV0 | null>;
  evidenceRefs: string[];
  lifecycleAmbiguous: boolean;
  outcome: PipelineLiveCapacityRampOutcomeV0;
  typedBlockers: Array<{ code: string; message: string }>;
  rampAllowed: boolean;
}

export interface PipelineLiveCapacityRampEvidenceV0 {
  schemaVersion: typeof PIPELINE_LIVE_CAPACITY_RAMP_SCHEMA_VERSION;
  evidenceClass: PipelineOperationalEvidenceClassV0;
  observedEvidenceAttestation: PipelineObservedEvidenceAttestationV0 | null;
  canaryEvidenceRef: string | null;
  canaryOutcome: PipelineOneWorkerLiveCanaryOutcomeV0 | "unknown";
  defaultStageWorkerCounts: [1, 2, 4, 6];
  stageWorkerCounts: number[];
  changedPlan: boolean;
  planRationale: string;
  planAuthority: { state: "allowed" | "blocked"; proven: boolean; evidenceRefs: string[] };
  stages: PipelineLiveCapacityRampStageV0[];
  recovery: { owner: string; rollbackPath: string; remediationAction: string; required: boolean };
  outcome: PipelineLiveCapacityRampOutcomeV0;
  scaleEvidenceReady: boolean;
  rolloutAllowed: false;
  typedBlockers: Array<{ gateId: string; reason: PipelineOperationalReadinessReasonV0; nextAction: string }>;
  sourceRefs: string[];
  evidenceRefs: string[];
  checkedAt: string;
  expiresAt: string;
  nextManagerAction: string;
  stopLines: string[];
  metadataOnly: true;
  rawPayloadRetained: false;
}

export const PIPELINE_RESILIENCE_RECOVERY_OUTCOMES = ["pass", "hold", "stop"] as const;
export type PipelineResilienceRecoveryOutcomeV0 = (typeof PIPELINE_RESILIENCE_RECOVERY_OUTCOMES)[number];

export interface PipelineResilienceRecoveryDrillV0 {
  drillId: string;
  kind: string;
  owner: string;
  authority: { state: "allowed" | "blocked"; proven: boolean; evidenceRefs: string[] };
  expectedRecoveryAction: string;
  observed: {
    stateBefore: string;
    stateAfter: string;
    ownershipBefore: string;
    ownershipAfter: string;
    leaseState: string;
    idempotencyState: "proven" | "preserved" | "unknown" | "ambiguous";
    rollbackState: string;
    evidenceRetained: boolean;
    ambiguous: boolean;
    silentRetry: boolean;
    retryCount: number | null;
  };
  evidenceRefs: string[];
  nextAction: string;
  outcome: PipelineResilienceRecoveryOutcomeV0;
  rampAllowed: false;
  typedBlockers: Array<{ code: string; message: string }>;
}

export interface PipelineResilienceRecoveryEvidenceV0 {
  schemaVersion: typeof PIPELINE_RESILIENCE_RECOVERY_SCHEMA_VERSION;
  evidenceClass: PipelineOperationalEvidenceClassV0;
  observedEvidenceAttestation: PipelineObservedEvidenceAttestationV0 | null;
  predecessorOutcome: PipelineLiveCapacityRampOutcomeV0 | PipelineOneWorkerLiveCanaryOutcomeV0 | "unknown";
  predecessorReady: boolean;
  drillKinds: string[];
  drills: PipelineResilienceRecoveryDrillV0[];
  recovery: { owner: string; rollbackPath: string; remediationAction: string; required: boolean };
  outcome: PipelineResilienceRecoveryOutcomeV0;
  reliabilityEvidenceReady: boolean;
  limitedRolloutBoundaries: string[];
  rolloutAllowed: false;
  typedBlockers: Array<{ drillId: string; reason: PipelineOperationalReadinessReasonV0; nextAction: string }>;
  sourceRefs: string[];
  evidenceRefs: string[];
  checkedAt: string;
  expiresAt: string;
  nextManagerAction: string;
  stopLines: string[];
  metadataOnly: true;
  rawPayloadRetained: false;
}

export const PIPELINE_OPERATIONAL_HARDENING_OUTCOMES = ["pass", "hold", "stop"] as const;
export type PipelineOperationalHardeningOutcomeV0 = (typeof PIPELINE_OPERATIONAL_HARDENING_OUTCOMES)[number];

export interface PipelineOperationalHardeningDomainV0 {
  domain: string;
  owner: string;
  trigger: string;
  evidenceGate: string;
  recoveryAction: string;
  riskTier: PipelineOperationalActionRiskTierV0;
  unresolvedHighRiskGap: boolean;
  evidenceRefs: string[];
  status: "pass" | "hold";
}

export interface PipelineOperationalHardeningEvidenceV0 {
  schemaVersion: typeof PIPELINE_OPERATIONAL_HARDENING_SCHEMA_VERSION;
  evidenceClass: PipelineOperationalEvidenceClassV0;
  observedEvidenceAttestation: PipelineObservedEvidenceAttestationV0 | null;
  predecessorOutcome: PipelineResilienceRecoveryOutcomeV0 | PipelineLiveCapacityRampOutcomeV0 | "unknown";
  predecessorReady: boolean;
  domains: PipelineOperationalHardeningDomainV0[];
  recovery: { owner: string; rollbackPath: string; remediationAction: string; required: boolean };
  outcome: PipelineOperationalHardeningOutcomeV0;
  readinessHandoffReady: boolean;
  rolloutAllowed: false;
  typedBlockers: Array<{ domain: string; reason: PipelineOperationalReadinessReasonV0; nextAction: string }>;
  sourceRefs: string[];
  evidenceRefs: string[];
  checkedAt: string;
  expiresAt: string;
  nextManagerAction: string;
  stopLines: string[];
  metadataOnly: true;
  rawPayloadRetained: false;
}

export const PIPELINE_PRODUCTION_READINESS_DECISIONS = ["go", "hold", "limited_rollout"] as const;
export type PipelineProductionReadinessDecisionV0 = (typeof PIPELINE_PRODUCTION_READINESS_DECISIONS)[number];

export interface PipelineProductionReadinessDecisionEvidenceV0 {
  schemaVersion: typeof PIPELINE_PRODUCTION_READINESS_DECISION_SCHEMA_VERSION;
  evidenceClass: PipelineOperationalEvidenceClassV0;
  observedEvidenceAttestation: PipelineObservedEvidenceAttestationV0 | null;
  decision: PipelineProductionReadinessDecisionV0;
  rationale: string;
  scope: { name: string; boundaries: string[]; limited: boolean };
  thresholds: Record<string, PipelineOperationalReadinessThresholdV0 | null>;
  authority: { state: "allowed" | "blocked"; proven: boolean; evidenceRefs: string[] };
  rollback: { owner: string; path: string; required: boolean; evidenceRefs: string[] };
  owner: string;
  nextManagerAction: string;
  predecessorOutcomes: { canary: string; ramp: string; recovery: string; hardening: string };
  monitoring: string[];
  stopLines: string[];
  typedBlockers: Array<{ code: string; message: string; nextAction: string }>;
  sourceRefs: string[];
  evidenceRefs: string[];
  checkedAt: string;
  expiresAt: string;
  rolloutAllowed: false;
  automaticDeploymentAllowed: false;
  providerCallsAllowed: false;
  secretAccessAllowed: false;
  mergeAllowed: false;
  cleanupAllowed: false;
  metadataOnly: true;
  rawPayloadRetained: false;
  decisionSignals: {
    allPredecessorsPass: boolean;
    authorityReady: boolean;
    simulatedEvidence: boolean;
    staleEvidence: boolean;
    fixtureEvidence: boolean;
  };
}

export const PIPELINE_EPIC_25_EVIDENCE_CHAIN_SLOTS = ["readiness", "canary", "ramp", "recovery", "hardening", "decision"] as const;
export type PipelineEpic25EvidenceChainSlotV0 = (typeof PIPELINE_EPIC_25_EVIDENCE_CHAIN_SLOTS)[number];

export const PIPELINE_EPIC_25_QUALITY_GATE_FAMILIES = ["security", "retention", "rollback", "runbook", "telemetry", "recovery"] as const;
export type PipelineEpic25QualityGateFamilyV0 = (typeof PIPELINE_EPIC_25_QUALITY_GATE_FAMILIES)[number];
export type PipelineEpic25QualityGateRequirementV0 = "required" | "not_applicable";
export type PipelineEpic25QualityGateStatusV0 = PipelineQualityGateStateV0;

export interface PipelineEpic25QualityGateV0 {
  family: PipelineEpic25QualityGateFamilyV0;
  requirement: PipelineEpic25QualityGateRequirementV0;
  state: PipelineEpic25QualityGateStatusV0;
  typedReason: PipelineOperationalReadinessReasonV0 | null;
  nextSafeAction: string;
  notApplicableReason: string | null;
  targetRevision: string;
  checkedAt: string;
  expiresAt: string;
  evidenceRefs: PipelineOperationalActionEvidenceRefsV0;
}

export interface PipelineEpic25RetentionPolicyV0 {
  sourceOwner: string;
  toolOwner: string;
  disposition: "metadata_only";
  redactionState: "verified_redacted" | "not_applicable";
  expiresAt: string;
  retentionPeriodDays: number;
  disposalAction: "delete_metadata" | "revalidate_before_expiry";
  verificationStatus: "verified" | "pending" | "failed";
  policyReason: string;
  evidenceRefs: PipelineOperationalActionEvidenceRefsV0;
  metadataOnly: true;
  rawPayloadRetained: false;
}

export interface PipelineEpic25PolicyProfileV0 {
  schemaVersion: typeof PIPELINE_EPIC_25_POLICY_PROFILE_SCHEMA_VERSION;
  targetRevision: string;
  checkedAt: string;
  expiresAt: string;
  qualityGates: PipelineEpic25QualityGateV0[];
  retentionPolicy: PipelineEpic25RetentionPolicyV0;
  executionAllowed: false;
  providerCallsAllowed: false;
  mutationAllowed: false;
  metadataOnly: true;
  rawPayloadRetained: false;
}

export type PipelineEpic25EvidenceDetailsV0 =
  | { kind: "readiness"; backendTruth: PipelineOperationalReadinessBackendTruthV0; authorityState: PipelineOperationalActionAuthorityStateV0; gateCount: number; thresholdsComplete: boolean; telemetryReady: boolean; rollbackReady: boolean; recoveryReady: boolean; configurationValid: boolean }
  | { kind: "canary"; workerCount: 1; backendTruth: PipelineOperationalReadinessBackendTruthV0; leaseState: "pass" | "fail" | "blocked"; checkpointState: "pass" | "fail" | "blocked"; measurementsComplete: boolean; canaryAuthorityProven: boolean; rampAllowed: boolean }
  | { kind: "ramp"; canaryPacketId: string; canaryOutcome: PipelineOneWorkerLiveCanaryOutcomeV0; stageWorkerCounts: [1, 2, 4, 6]; stageOutcomes: [PipelineLiveCapacityRampOutcomeV0, PipelineLiveCapacityRampOutcomeV0, PipelineLiveCapacityRampOutcomeV0, PipelineLiveCapacityRampOutcomeV0]; scaleEvidenceReady: boolean }
  | { kind: "recovery"; rampPacketId: string; predecessorOutcome: PipelineLiveCapacityRampOutcomeV0; drillCount: number; allDrillsPassed: boolean; idempotencyProven: boolean; silentRetryObserved: false; reliabilityEvidenceReady: boolean }
  | { kind: "hardening"; recoveryPacketId: string; predecessorOutcome: PipelineResilienceRecoveryOutcomeV0; domainCount: number; unresolvedHighRiskGap: boolean; readinessHandoffReady: boolean }
  | { kind: "decision"; predecessorPacketIds: Record<"canary" | "ramp" | "recovery" | "hardening", string>; predecessorOutcomes: Record<"canary" | "ramp" | "recovery" | "hardening", "pass" | "hold" | "stop">; authorityReady: boolean; simulatedEvidence: boolean; staleEvidence: boolean; fixtureEvidence: boolean };

export interface PipelineEpic25EvidenceChainPacketV0 {
  slot: PipelineEpic25EvidenceChainSlotV0;
  packetId: string;
  packetSchemaVersion:
    | typeof PIPELINE_OPERATIONAL_READINESS_CONTRACT_SCHEMA_VERSION
    | typeof PIPELINE_ONE_WORKER_LIVE_CANARY_SCHEMA_VERSION
    | typeof PIPELINE_LIVE_CAPACITY_RAMP_SCHEMA_VERSION
    | typeof PIPELINE_RESILIENCE_RECOVERY_SCHEMA_VERSION
    | typeof PIPELINE_OPERATIONAL_HARDENING_SCHEMA_VERSION
    | typeof PIPELINE_PRODUCTION_READINESS_DECISION_SCHEMA_VERSION;
  predecessorPacketId: string | null;
  evidenceClass: PipelineOperationalEvidenceClassV0;
  outcome: PipelineOperationalReadinessOutcomeV0 | PipelineOneWorkerLiveCanaryOutcomeV0 | PipelineProductionReadinessDecisionV0;
  sourceRefs: PipelineOperationalActionEvidenceRefsV0;
  evidenceRefs: PipelineOperationalActionEvidenceRefsV0;
  checkedAt: string;
  expiresAt: string;
  observedEvidenceAttestation: PipelineObservedEvidenceAttestationV0 | null;
  details: PipelineEpic25EvidenceDetailsV0;
  metadataOnly: true;
  rawPayloadRetained: false;
}

export interface PipelineEpic25EvidenceChainV0 {
  schemaVersion: typeof PIPELINE_EPIC_25_EVIDENCE_CHAIN_SCHEMA_VERSION;
  authoritativePacketId: string;
  evidenceClass: PipelineOperationalEvidenceClassV0;
  packets: {
    readiness: PipelineEpic25EvidenceChainPacketV0;
    canary: PipelineEpic25EvidenceChainPacketV0;
    ramp: PipelineEpic25EvidenceChainPacketV0;
    recovery: PipelineEpic25EvidenceChainPacketV0;
    hardening: PipelineEpic25EvidenceChainPacketV0;
    decision: PipelineEpic25EvidenceChainPacketV0;
  };
  checkedAt: string;
  expiresAt: string;
  executionAllowed: false;
  providerCallsAllowed: false;
  mutationAllowed: false;
  metadataOnly: true;
  rawPayloadRetained: false;
}

export interface PipelineEpic25EvidenceChainV1 extends Omit<PipelineEpic25EvidenceChainV0, "schemaVersion"> {
  schemaVersion: typeof PIPELINE_EPIC_25_EVIDENCE_CHAIN_V1_SCHEMA_VERSION;
  policyProfile: PipelineEpic25PolicyProfileV0;
}

export interface PipelineEpic25EvidenceChainReadV0 extends PipelineEpic25EvidenceChainV0 {
  chainDigestSha256: `sha256:${string}`;
  freshnessState: "fresh" | "stale";
  effectiveDecision: PipelineProductionReadinessDecisionV0;
  typedBlockers: Array<"evidence_chain_stale" | "live_evidence_unavailable" | "policy_profile_upgrade_required" | "legacy_upgrade_unavailable">;
}

export interface PipelineEpic25EvidenceChainReadV1 extends PipelineEpic25EvidenceChainV1 {
  chainDigestSha256: `sha256:${string}`;
  freshnessState: "fresh" | "stale";
  effectiveDecision: PipelineProductionReadinessDecisionV0;
  typedBlockers: Array<"evidence_chain_stale" | "live_evidence_unavailable" | "source_revision_attestation_required" | "policy_profile_stale" | "retention_policy_expired" | "retention_policy_unverified" | "quality_gate_not_passed">;
}

export interface PipelineOperationalActionValidationIssueV0 {
  field: string;
  code:
    | "unknown_action_id"
    | "blank_identifier"
    | "evidence_required"
    | "request_cannot_self_authorize"
    | "unsafe_metadata_retention"
    | "invalid_actor"
    | "forbidden_field"
    | "stale_or_unparseable_readiness"
    | "bad_schema_version"
    | "bad_retention_flag"
    | "invalid_enum"
    | "policy_violation"
    | "inconsistent_result";
  summary: string;
}

export interface PipelineOperationalActionRequestV0 {
  schemaVersion: typeof PIPELINE_OPERATIONAL_ACTION_SCHEMA_VERSION;
  actionId: PipelineOperationalActionIdV0;
  targetType: PipelineOperationalActionTargetTypeV0;
  targetId: string;
  idempotencyKey: string;
  correlationId: string;
  requestedBy: AuthoritativePacketActor;
  requestedAuthorityState: PipelineOperationalActionRequestedAuthorityStateV0;
  requestedRiskTier: PipelineOperationalActionRiskTierV0;
  approvalId?: string | null;
  operatorIntentSummary?: string | null;
  evidenceRefs: PipelineOperationalActionEvidenceRefsV0;
  expectedCurrentEventId?: string | null;
  testResult?: "pass" | "fail" | "notes" | null;
  testNotes?: string | null;
  metadataOnly: true;
  rawPayloadRetained: false;
}

export interface PipelineOperationalActionApprovalRequestV0 {
  actionId: PipelineGatedOperationalActionIdV0;
  targetType: "work_packet";
  targetId: string;
  requestedBy: AuthoritativePacketActor;
  requestedAuthorityState: "needs_product_approval" | "needs_authority_approval";
  requestedRiskTier: "medium";
  metadataOnly: true;
  rawPayloadRetained: false;
}

export interface PipelineOperationalActionApprovalV0 {
  approvalId: string;
  actionId: PipelineGatedOperationalActionIdV0;
  targetType: "work_packet";
  targetId: string;
  requestedBy: AuthoritativePacketActor;
  requestedAuthorityState: "needs_product_approval" | "needs_authority_approval";
  requestedRiskTier: "medium";
  expectedCurrentEventId: string;
  issuedAt: string;
  expiresAt: string;
  consumed: boolean;
  consumedAt?: string | null;
  consumedActionIdempotencyKey?: string | null;
  consumedActionRecordId?: string | null;
  metadataOnly: true;
  rawPayloadRetained: false;
}

export interface PipelineOperationalActionResultV0 {
  schemaVersion: typeof PIPELINE_OPERATIONAL_ACTION_SCHEMA_VERSION;
  actionId: PipelineOperationalActionIdV0;
  targetType: PipelineOperationalActionTargetTypeV0;
  targetId: string;
  outcome: PipelineOperationalActionOutcomeV0;
  resultingStage: AuthoritativePacketStage | "terminal" | "deferred" | "unknown";
  resultingStatus: AuthoritativePacketStatus | "unknown";
  capabilityState: PipelineOperationalActionCapabilityStateV0;
  authorityState: PipelineOperationalActionAuthorityStateV0;
  riskTier: PipelineOperationalActionRiskTierV0;
  typedReason: PipelineOperationalActionTypedReasonV0 | null;
  evidenceRefs: PipelineOperationalActionEvidenceRefsV0;
  correlationId: string;
  idempotencyKey: string;
  actionRecordId: string;
  approvalId?: string | null;
  childPacketId?: string | null;
  metadataOnly: true;
  rawPayloadRetained: false;
}

export interface PipelineOperationalActionCapabilityV0 {
  actionId: PipelineOperationalActionIdV0;
  targetType: PipelineOperationalActionTargetTypeV0;
  targetId?: string | null;
  capabilityState: PipelineOperationalActionCapabilityStateV0;
  authorityState: PipelineOperationalActionAuthorityStateV0;
  riskTier: PipelineOperationalActionRiskTierV0;
  typedReason: PipelineOperationalActionTypedReasonV0 | null;
  expectedResultSummary: string;
  correlationRequired: true;
  idempotencyRequired: true;
  evidenceRefs: PipelineOperationalActionEvidenceRefsV0;
  metadataOnly: true;
  rawPayloadRetained: false;
}

/**
 * Additive exact-target contract for the four operational actions that remain
 * server-unsupported until their persistence/apply lanes are implemented.
 * V0 packet actions intentionally continue to use the interfaces above.
 */
export const PIPELINE_OPERATIONAL_ACTION_V1_IDS = ["retry_verification", "pause", "drain", "reassign"] as const;
export type PipelineOperationalActionIdV1 = (typeof PIPELINE_OPERATIONAL_ACTION_V1_IDS)[number];
export type PipelineOperationalActionAuthorityStateV1 = "needs_authority_approval";
export type PipelineOperationalActionRiskTierV1 = "low" | "medium";
export type PipelineOperationalActionTargetTypeV1 = "execution_attempt" | "runtime" | "work_packet";
export type PipelineOperationalRuntimeControlModeV1 = "running" | "paused" | "draining" | "disabled";
export type PipelineOperationalWorkItemStateV1 =
  | "queued"
  | "triaged"
  | "ready"
  | "implementing"
  | "validating"
  | "reviewing"
  | "awaiting_audit"
  | "needs_rework"
  | "operator_owned"
  | "blocked"
  | "done";

export const PIPELINE_OPERATIONAL_ACTION_V1_RUNTIME_TARGET_ID = "supervisor-runtime" as const;
export const PIPELINE_OPERATIONAL_ACTION_V1_POLICY = {
  retry_verification: { targetType: "execution_attempt", authorityState: "needs_authority_approval", riskTier: "medium" },
  pause: { targetType: "runtime", authorityState: "needs_authority_approval", riskTier: "low" },
  drain: { targetType: "runtime", authorityState: "needs_authority_approval", riskTier: "medium" },
  reassign: { targetType: "work_packet", authorityState: "needs_authority_approval", riskTier: "medium" },
} as const satisfies Record<PipelineOperationalActionIdV1, {
  targetType: PipelineOperationalActionTargetTypeV1;
  authorityState: PipelineOperationalActionAuthorityStateV1;
  riskTier: PipelineOperationalActionRiskTierV1;
}>;

export const PIPELINE_OPERATIONAL_ACTION_V1_CONTEXT_FIELDS = {
  retry_verification: [
    "kind",
    "executionAttemptId",
    "linkedWorkItemId",
    "linkedPacketId",
    "expectedWorkItemState",
    "expectedWorkItemUpdatedAt",
    "expectedAttemptStatus",
    "expectedAttemptUpdatedAt",
    "expectedPacketCurrentEventId",
    "expectedLeaseId",
    "expectedLeaseFencingToken",
    "expectedLeaseActive",
  ],
  pause: ["kind", "expectedRuntimeMode", "expectedRuntimeRevision"],
  drain: [
    "kind",
    "expectedRuntimeMode",
    "expectedRuntimeRevision",
    "expectedActiveWorkCount",
    "expectedActiveLeaseCount",
    "expectedRunningAttemptCount",
  ],
  reassign: [
    "kind",
    "linkedWorkItemId",
    "expectedPacketCurrentEventId",
    "expectedCurrentOwnerId",
    "newOwnerId",
    "expectedWorkItemState",
    "expectedWorkItemUpdatedAt",
    "expectedActiveLeaseId",
    "expectedRunningAttemptId",
  ],
} as const satisfies Record<PipelineOperationalActionIdV1, readonly string[]>;

export interface PipelineRetryVerificationActionContextV1 {
  kind: "retry_verification";
  executionAttemptId: string;
  linkedWorkItemId: string;
  linkedPacketId: string;
  expectedWorkItemState: PipelineOperationalWorkItemStateV1;
  /** Canonical RFC3339 `WorkItem.updatedAt`; this is the additive v1 WorkItem revision fence. */
  expectedWorkItemUpdatedAt: string;
  expectedAttemptStatus: "failed" | "timed_out" | "rejected";
  /** Canonical RFC3339 `ExecutionAttempt.updatedAt`; this is the additive v1 attempt revision fence. */
  expectedAttemptUpdatedAt: string;
  expectedPacketCurrentEventId: string;
  expectedLeaseId: string | null;
  expectedLeaseFencingToken: number | null;
  expectedLeaseActive: false;
}

export interface PipelinePauseActionContextV1 {
  kind: "pause";
  expectedRuntimeMode: PipelineOperationalRuntimeControlModeV1;
  expectedRuntimeRevision: number;
}

export interface PipelineDrainActionContextV1 {
  kind: "drain";
  expectedRuntimeMode: PipelineOperationalRuntimeControlModeV1;
  expectedRuntimeRevision: number;
  expectedActiveWorkCount: number;
  expectedActiveLeaseCount: number;
  expectedRunningAttemptCount: number;
}

export interface PipelineReassignActionContextV1 {
  kind: "reassign";
  linkedWorkItemId: string;
  expectedPacketCurrentEventId: string;
  /** Null means explicitly unassigned; unknown ownership is not representable. */
  expectedCurrentOwnerId: string | null;
  newOwnerId: string;
  expectedWorkItemState: PipelineOperationalWorkItemStateV1;
  /** Canonical RFC3339 `WorkItem.updatedAt`; this is the additive v1 WorkItem revision fence. */
  expectedWorkItemUpdatedAt: string;
  expectedActiveLeaseId: null;
  expectedRunningAttemptId: null;
}

export type PipelineOperationalActionContextV1 =
  | PipelineRetryVerificationActionContextV1
  | PipelinePauseActionContextV1
  | PipelineDrainActionContextV1
  | PipelineReassignActionContextV1;

export type PipelineOperationalActionContextForV1<A extends PipelineOperationalActionIdV1> =
  A extends "retry_verification" ? PipelineRetryVerificationActionContextV1
    : A extends "pause" ? PipelinePauseActionContextV1
      : A extends "drain" ? PipelineDrainActionContextV1
        : PipelineReassignActionContextV1;

export type PipelineOperationalActionTargetForV1<A extends PipelineOperationalActionIdV1> =
  A extends "retry_verification" ? "execution_attempt" : A extends "reassign" ? "work_packet" : "runtime";

export type PipelineOperationalActionRiskForV1<A extends PipelineOperationalActionIdV1> = A extends "pause" ? "low" : "medium";
export type PipelineOperationalActionContextDigestV1 = `sha256:${string}`;

interface PipelineOperationalActionRequestBaseV1<A extends PipelineOperationalActionIdV1> {
  schemaVersion: typeof PIPELINE_OPERATIONAL_ACTION_V1_SCHEMA_VERSION;
  actionId: A;
  targetType: PipelineOperationalActionTargetForV1<A>;
  targetId: string;
  actionContext: PipelineOperationalActionContextForV1<A>;
  actionContextDigestSha256: PipelineOperationalActionContextDigestV1;
  idempotencyKey: string;
  correlationId: string;
  requestedBy: AuthoritativePacketActor;
  requestedAuthorityState: "needs_authority_approval";
  requestedRiskTier: PipelineOperationalActionRiskForV1<A>;
  approvalId: string;
  serverBound: true;
  evidenceRefs: PipelineOperationalActionEvidenceRefsV0;
  metadataOnly: true;
  rawPayloadRetained: false;
}

export type PipelineOperationalActionRequestV1 = {
  [A in PipelineOperationalActionIdV1]: PipelineOperationalActionRequestBaseV1<A>;
}[PipelineOperationalActionIdV1];

interface PipelineOperationalActionApprovalRequestBaseV1<A extends PipelineOperationalActionIdV1> {
  schemaVersion: typeof PIPELINE_OPERATIONAL_ACTION_V1_SCHEMA_VERSION;
  actionId: A;
  targetType: PipelineOperationalActionTargetForV1<A>;
  targetId: string;
  actionContext: PipelineOperationalActionContextForV1<A>;
  actionContextDigestSha256: PipelineOperationalActionContextDigestV1;
  requestedBy: AuthoritativePacketActor;
  requestedAuthorityState: "needs_authority_approval";
  requestedRiskTier: PipelineOperationalActionRiskForV1<A>;
  serverBound: true;
  metadataOnly: true;
  rawPayloadRetained: false;
}

export type PipelineOperationalActionApprovalRequestV1 = {
  [A in PipelineOperationalActionIdV1]: PipelineOperationalActionApprovalRequestBaseV1<A>;
}[PipelineOperationalActionIdV1];

interface PipelineOperationalActionApprovalBaseV1<A extends PipelineOperationalActionIdV1>
  extends PipelineOperationalActionApprovalRequestBaseV1<A> {
  approvalId: string;
  issuedBy: "supervisor_server";
  issuedAt: string;
  expiresAt: string;
  consumed: boolean;
  consumedAt: string | null;
  consumedActionIdempotencyKey: string | null;
  consumedActionRecordId: string | null;
}

export type PipelineOperationalActionApprovalV1 = {
  [A in PipelineOperationalActionIdV1]: PipelineOperationalActionApprovalBaseV1<A>;
}[PipelineOperationalActionIdV1];

interface PipelineOperationalActionCapabilityBaseV1<A extends PipelineOperationalActionIdV1> {
  schemaVersion: typeof PIPELINE_OPERATIONAL_ACTION_V1_SCHEMA_VERSION;
  actionId: A;
  targetType: PipelineOperationalActionTargetForV1<A>;
  targetId: string;
  actionContext: PipelineOperationalActionContextForV1<A>;
  actionContextDigestSha256: PipelineOperationalActionContextDigestV1;
  capabilityState: PipelineOperationalActionCapabilityStateV0;
  authorityState: "needs_authority_approval" | "allowed" | "blocked";
  riskTier: PipelineOperationalActionRiskForV1<A>;
  typedReason: PipelineOperationalActionTypedReasonV0 | null;
  expectedResultSummary: string;
  correlationRequired: true;
  idempotencyRequired: true;
  serverBound: true;
  evidenceRefs: PipelineOperationalActionEvidenceRefsV0;
  metadataOnly: true;
  rawPayloadRetained: false;
}

export type PipelineOperationalActionCapabilityV1 = {
  [A in PipelineOperationalActionIdV1]: PipelineOperationalActionCapabilityBaseV1<A>;
}[PipelineOperationalActionIdV1];

export interface PipelineRetryVerificationSuccessEvidenceV1 {
  kind: "retry_verification";
  originalAttemptId: string;
  retryIntentId: string;
  linkedWorkItemId: string;
  linkedPacketId: string;
  resultingPacketCurrentEventId: string;
  originalAttemptPreserved: true;
  providerOrWorkerLaunched: false;
}

export interface PipelinePauseSuccessEvidenceV1 {
  kind: "pause";
  resultingRuntimeMode: "paused";
  resultingRuntimeRevision: number;
  activeWorkCount: number;
  activeLeaseCount: number;
  runningAttemptCount: number;
  intakeStopped: true;
  activeWorkPreserved: true;
}

export interface PipelineDrainSuccessEvidenceV1 {
  kind: "drain";
  resultingRuntimeMode: "draining";
  resultingRuntimeRevision: number;
  activeWorkCount: number;
  activeLeaseCount: number;
  runningAttemptCount: number;
  intakeStopped: true;
  activeWorkAllowedToConverge: true;
  workersKilled: false;
}

export interface PipelineReassignSuccessEvidenceV1 {
  kind: "reassign";
  packetId: string;
  linkedWorkItemId: string;
  previousOwnerId: string | null;
  newOwnerId: string;
  resultingPacketCurrentEventId: string;
  activeLeaseTransferred: false;
  workerLaunched: false;
}

export type PipelineOperationalActionSuccessEvidenceV1 =
  | PipelineRetryVerificationSuccessEvidenceV1
  | PipelinePauseSuccessEvidenceV1
  | PipelineDrainSuccessEvidenceV1
  | PipelineReassignSuccessEvidenceV1;

export type PipelineOperationalActionSuccessEvidenceForV1<A extends PipelineOperationalActionIdV1> =
  A extends "retry_verification" ? PipelineRetryVerificationSuccessEvidenceV1
    : A extends "pause" ? PipelinePauseSuccessEvidenceV1
      : A extends "drain" ? PipelineDrainSuccessEvidenceV1
        : PipelineReassignSuccessEvidenceV1;

interface PipelineOperationalActionResultBaseV1<A extends PipelineOperationalActionIdV1> {
  schemaVersion: typeof PIPELINE_OPERATIONAL_ACTION_V1_SCHEMA_VERSION;
  actionId: A;
  targetType: PipelineOperationalActionTargetForV1<A>;
  targetId: string;
  actionContext: PipelineOperationalActionContextForV1<A>;
  actionContextDigestSha256: PipelineOperationalActionContextDigestV1;
  outcome: PipelineOperationalActionOutcomeV0;
  capabilityState: PipelineOperationalActionCapabilityStateV0;
  authorityState: "needs_authority_approval" | "allowed" | "blocked";
  riskTier: PipelineOperationalActionRiskForV1<A>;
  typedReason: PipelineOperationalActionTypedReasonV0 | null;
  successEvidence: PipelineOperationalActionSuccessEvidenceForV1<A> | null;
  evidenceRefs: PipelineOperationalActionEvidenceRefsV0;
  correlationId: string;
  idempotencyKey: string;
  actionRecordId: string;
  approvalId: string;
  replayed: boolean;
  serverBound: true;
  metadataOnly: true;
  rawPayloadRetained: false;
}

export type PipelineOperationalActionResultV1 = {
  [A in PipelineOperationalActionIdV1]: PipelineOperationalActionResultBaseV1<A>;
}[PipelineOperationalActionIdV1];

export interface PipelineOperationalActionValidationIssueV1 {
  field: string;
  code:
    | "invalid_contract"
    | "policy_violation"
    | "target_context_mismatch"
    | "context_digest_mismatch"
    | "stale_fence"
    | "approval_expired"
    | "approval_consumed"
    | "replay_conflict"
    | "wrong_actor"
    | "inconsistent_result";
  summary: string;
}

export interface PipelineOperationalRuntimeReadinessV0 {
  schemaVersion: typeof PIPELINE_OPERATIONAL_RUNTIME_READINESS_SCHEMA_VERSION;
  actionSchemaVersion: typeof PIPELINE_OPERATIONAL_ACTION_SCHEMA_VERSION;
  readinessState: PipelineOperationalRuntimeReadinessStateV0;
  operationalMode: PipelineOperationalRuntimeModeV0;
  freshnessState: PipelineProjectionFreshnessStateV0;
  capabilityState: PipelineOperationalActionCapabilityStateV0;
  typedReason: PipelineOperationalActionTypedReasonV0 | null;
  checkedAt: string;
  expiresAt: string;
  summary: string;
  actionCapabilities: PipelineOperationalActionCapabilityV0[];
  evidenceRefs: PipelineOperationalActionEvidenceRefsV0;
  metadataOnly: true;
  rawPayloadRetained: false;
}

const FORBIDDEN_OPERATIONAL_ACTION_METADATA =
  /\b(?:raw[\s_-]*(?:prompts?|completions?|transcripts?|logs?|sources?)|reasoning[\s_-]*traces?|provider[\s_-]*payloads?|source[\s_-]*(?:dumps?|copies?|snapshots?)|stack[\s_-]*dumps?|console[\s_-]*logs?|secrets?(?:[\s_-]*(?:key|token|value|id))?|credentials?(?:[\s_-]*(?:key|token|value|id))?|passwords?|api[\s_-]*keys?|access[\s_-]*tokens?|auth[\s_-]*tokens?|private[\s_-]*keys?|passphrases?|(?:terminal|tmux|pane)[\s_-]*(?:scrollbacks?|texts?|outputs?|stdouts?|stderrs?))\b/i;
const FORBIDDEN_OPERATIONAL_ACTION_OBJECT_FIELD =
  /^(?:rawPrompt|rawCompletion|rawTranscript|rawLog|rawLogs|rawSource|sourceDump|sourceCopy|sourceSnapshot|stackDump|consoleLog|consoleLogs|reasoningTrace|providerPayload|secret|credential|password|apiKey|accessToken|authToken|privateKey|passphrase|terminalOutput|terminalStdout|terminalStderr|tmuxScrollback|paneText|stdout|stderr|transcript)$/i;
const OPERATIONAL_ACTION_EVIDENCE_REF =
  /^(?:manager-cycle|preflight|usage|resources|operational-action|verification|evidence|story|assignment|task|source|prd|check|checkpoint|command|test|artifact):[A-Za-z0-9._/@:-]{1,160}$/;
const OPERATIONAL_ACTION_EVIDENCE_REF_PATH_SEGMENT = /(?:^|[:\/\\])\.{1,2}(?:[\/\\]|$)/;
const SECRET_LIKE_OPERATIONAL_ACTION_REF =
  /\b(?:sk-[A-Za-z0-9_-]{8,}|(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|(?:api|secret|token|credential)[_-]?(?:key|token|secret)?[:=])/i;
const OPERATIONAL_ACTION_READINESS_MAX_TTL_MS = 5 * 60 * 1000;
const OPERATIONAL_ACTION_READINESS_ALLOWED_FUTURE_SKEW_MS = 60 * 1000;
const OPERATIONAL_ACTION_MAX_EVIDENCE_REFS = 24;
const OPERATIONAL_ACTION_METADATA_MAX_DEPTH = 48;
const OPERATIONAL_ACTION_METADATA_MAX_NODES = 1200;
const OPERATIONAL_ACTION_IDENTIFIER =
  /^[a-z0-9](?:[a-z0-9._/@:,-]{0,198}[a-z0-9])?$/;
const OPERATIONAL_ACTION_IDENTIFIER_REPEATED_SEPARATOR = /[._/@:,-]{2,}/;
const OPERATIONAL_ACTION_IDENTIFIER_PATH_SEGMENT = /(?:^|[/\\])\.{1,2}(?:[/\\]|$)/;
const OPERATIONAL_ACTION_V1_EVIDENCE_REF_MAX_LENGTH = 180;
const OPERATIONAL_ACTION_V1_EVIDENCE_REF =
  /^(?:manager-cycle|preflight|usage|resources|operational-action|verification|evidence|story|assignment|task|source|prd|check|checkpoint|command|test|artifact):[A-Za-z0-9._/@:-]{1,160}$/;
const OPERATIONAL_ACTION_V1_ID_LENGTHS = {
  executionAttempt: 36,
  retryIntent: 80,
  workItem: 36,
  queueLease: 36,
  workPacket: 80,
  packetEvent: 80,
  owner: 100,
  approval: 120,
  actionRecord: 80,
  correlation: 36,
  idempotency: 160,
} as const;
const EPIC_25_RFC3339_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const EPIC_25_HIGH_ENTROPY_OR_PEM = /-----BEGIN [A-Z0-9 ]+PRIVATE KEY-----|(?<![A-Za-z0-9])[A-Za-z0-9+/]{48,}={0,2}(?![A-Za-z0-9])/i;
const EPIC_25_TOKEN_LIKE_METADATA_VALUE = /(?<![A-Za-z0-9])(?:sk-(?:proj-)?[A-Za-z0-9][A-Za-z0-9_-]{7,}|gh[pousr]_[A-Za-z0-9]{12,}|github_pat_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{8,}|AIza[A-Za-z0-9_-]{8,}|AKIA[A-Z0-9]{8,}|ASIA[A-Z0-9]{8,}|glpat-[A-Za-z0-9_-]{8,}|npm_[A-Za-z0-9]{8,}|Bearer\s+[A-Za-z0-9._~+/=-]{20,}|eyJ[A-Za-z0-9_-]{20,})(?![A-Za-z0-9_-])|(?<![A-Za-z0-9])[A-Za-z]{2,12}[-_](?=(?:[A-Za-z0-9]*\d){2})[A-Za-z0-9]{20,}(?![A-Za-z0-9])|^(?=[A-Za-z0-9+/]{48,}={0,2}$)(?=.*[0-9+/=])[A-Za-z0-9+/]+={0,2}$|^(?=[a-f0-9]{40,}$)(?=.*[0-9])[a-f0-9]+$/i;
const EPIC_25_EXACT_TARGET_REVISION = /^[a-f0-9]{40}$/;
const EPIC_25_EXECUTABLE_POLICY_TEXT = /(?<![A-Za-z0-9_])(?:tmux\s+(?:kill|send|capture|new|attach)\b|git(?:hub)?(?:\s+\S+){0,4}\s+(?:add|branch|checkout|cherry-pick|clean|commit|merge|pr|push|rebase|reset|restore|revert|switch|tag)\b|gh\s+(?:pr|repo|api)\b|curl(?:\s|$)|bash(?:\s|$)|sh(?:\s|$)|python(?:3(?:\.\d+)?)?(?:\s|$)|node(?:\s|$)|npm\s+run(?:\s|$)|pnpm(?:\s|$)|uv\s+run(?:\s|$)|provider\s+(?:call|request|payload)\b)/i;
const OPERATIONAL_ACTION_MERGE_HEAD_SHA_EVIDENCE = /^evidence:merge-head-sha-[a-f0-9]{40}$/;
const OPERATIONAL_ACTION_MERGE_BASE_EVIDENCE = /^evidence:merge-base-[a-z0-9._/@:-]{1,120}$/;
const OPERATIONAL_ACTION_MERGE_PR_EVIDENCE = /^evidence:merge-pr-[0-9]{1,10}$/;
const OPERATIONAL_ACTION_MERGE_CHECKS_SCOPED_EVIDENCE = /^evidence:merge-checks-(?:passed|green)-head-([a-f0-9]{40}):pr-([0-9]{1,10})$/;
const OPERATIONAL_ACTION_MERGE_REVIEW_THREADS_SCOPED_EVIDENCE = /^evidence:merge-review-threads-(?:resolved|none)-head-([a-f0-9]{40}):pr-([0-9]{1,10})$/;
const OPERATIONAL_ACTION_MERGE_MERGEABILITY_EVIDENCE = /^evidence:merge-mergeable$/;
const OPERATIONAL_ACTION_MERGE_NON_DRAFT_EVIDENCE = /^evidence:merge-pr-non-draft$/;
const OPERATIONAL_ACTION_MERGE_REQUESTED_CHANGES_EVIDENCE = /^evidence:merge-requested-changes-cleared$/;
const OPERATIONAL_ACTION_MERGE_EXPECTED_BASE_POLICY_EVIDENCE = /^evidence:merge-expected-base-policy-[a-z0-9._/@:-]{1,80}$/;
const OPERATIONAL_ACTION_MERGE_HIGH_RISK_DIFF_EVIDENCE = /^evidence:merge-high-risk-diff-excluded$/;
const OPERATIONAL_ACTION_MERGE_LOCAL_VERIFICATION_EVIDENCE =
  /^verification:merge-local-head-[a-f0-9]{40}:base-[a-z0-9._/@:-]{1,80}:pr-[0-9]{1,10}$/;
const OPERATIONAL_ACTION_PUSH_BRANCH_REF_EVIDENCE = /^evidence:push-branch-ref-[a-z0-9._/@:-]{1,120}$/;
const OPERATIONAL_ACTION_PUSH_BRANCH_REMOTE_EVIDENCE = /^evidence:push-branch-remote-[a-z0-9._/@:-]{1,80}$/;
const OPERATIONAL_ACTION_PUSH_BRANCH_HEAD_EVIDENCE = /^evidence:push-branch-head-sha-[a-f0-9]{40}$/;
const OPERATIONAL_ACTION_PUSH_BRANCH_RESULT_EVIDENCE = /^evidence:push-branch-result-(?:pushed|up-to-date)$/;
const OPERATIONAL_ACTION_OPEN_PR_BRANCH_EVIDENCE = /^evidence:open-pr-branch-[a-z0-9._/@:-]{1,120}$/;
const OPERATIONAL_ACTION_OPEN_PR_BASE_EVIDENCE = /^evidence:open-pr-base-[a-z0-9._/@:-]{1,120}$/;
const OPERATIONAL_ACTION_OPEN_PR_IDENTITY_EVIDENCE = /^evidence:open-pr-pr-[0-9]{1,10}$/;
const OPERATIONAL_ACTION_OPEN_PR_RESULT_EVIDENCE = /^evidence:open-pr-result-(?:opened|existing)$/;
const OPERATIONAL_ACTION_DELETE_BRANCH_REF_EVIDENCE = /^evidence:delete-branch-ref-[a-z0-9._/@:-]{1,120}$/;
const OPERATIONAL_ACTION_DELETE_BRANCH_HEAD_EVIDENCE = /^evidence:delete-branch-head-sha-[a-f0-9]{40}$/;
const OPERATIONAL_ACTION_DELETE_BRANCH_RESULT_EVIDENCE = /^evidence:delete-branch-result-(?:deleted|absent)$/;
const OPERATIONAL_ACTION_DELETE_BRANCH_MERGED_PR_EVIDENCE = /^evidence:delete-branch-merged-pr-[0-9]{1,10}$/;
const OPERATIONAL_ACTION_DELETE_BRANCH_LANE_OWNER_EVIDENCE = /^evidence:delete-branch-lane-owner-[a-z0-9._/@:-]{1,120}$/;
const OPERATIONAL_ACTION_DELETE_BRANCH_LOCAL_SHA_EVIDENCE = /^evidence:delete-branch-local-sha-[a-f0-9]{40}$/;
const OPERATIONAL_ACTION_DELETE_BRANCH_REMOTE_SHA_EVIDENCE = /^evidence:delete-branch-remote-sha-[a-f0-9]{40}$/;
const OPERATIONAL_ACTION_DELETE_BRANCH_DELIVERY_HEAD_EVIDENCE = /^evidence:delete-branch-delivery-head-match-[a-f0-9]{40}$/;
const OPERATIONAL_ACTION_CLEANUP_WORKSPACE_EVIDENCE = /^evidence:cleanup-workspace-[a-z0-9._/@:-]{1,120}$/;
const OPERATIONAL_ACTION_CLEANUP_PR_EVIDENCE = /^evidence:cleanup-pr-[0-9]{1,10}$/;
const OPERATIONAL_ACTION_CLEANUP_HEAD_EVIDENCE = /^evidence:cleanup-head-sha-[a-f0-9]{40}$/;
const OPERATIONAL_ACTION_CLEANUP_DRY_RUN_EVIDENCE = /^evidence:cleanup-dry-run$/;
const OPERATIONAL_ACTION_CLEANUP_RESULT_EVIDENCE = /^evidence:cleanup-result-(?:removed|already-clean|clean)$/;
const OPERATIONAL_ACTION_CLEANUP_MERGED_PR_EVIDENCE = /^evidence:cleanup-merged-pr-[0-9]{1,10}$/;
const OPERATIONAL_ACTION_CLEANUP_LANE_OWNER_EVIDENCE = /^evidence:cleanup-lane-owner-[a-z0-9._/@:-]{1,120}$/;
const OPERATIONAL_ACTION_CLEANUP_WORKTREE_IDENTITY_EVIDENCE = /^evidence:cleanup-worktree-identity-[a-z0-9._/@:-]{1,120}$/;
const OPERATIONAL_ACTION_CLEANUP_LOCAL_BRANCH_SHA_EVIDENCE = /^evidence:cleanup-local-branch-sha-[a-f0-9]{40}$/;
const OPERATIONAL_ACTION_CLEANUP_REMOTE_BRANCH_SHA_EVIDENCE = /^evidence:cleanup-remote-branch-sha-[a-f0-9]{40}$/;
const OPERATIONAL_ACTION_CLEANUP_DELIVERY_HEAD_EVIDENCE = /^evidence:cleanup-delivery-head-match-[a-f0-9]{40}$/;
const OPERATIONAL_ACTION_DISPATCH_APPLY_LANE_EVIDENCE = /^evidence:dispatch-apply-lane-[a-z0-9._/@:-]{1,120}$/;
const OPERATIONAL_ACTION_DISPATCH_APPLY_WORKSPACE_EVIDENCE = /^evidence:dispatch-apply-workspace-[a-z0-9._/@:-]{1,120}$/;
const OPERATIONAL_ACTION_DISPATCH_APPLY_RESULT_EVIDENCE = /^evidence:dispatch-apply-result-(?:claimed|already-claimed)$/;
const OPERATIONAL_ACTION_KILL_WORKER_TARGET_EVIDENCE = /^evidence:kill-worker-target-[a-z0-9._/@:-]{1,120}$/;
const OPERATIONAL_ACTION_KILL_WORKER_RESULT_EVIDENCE = /^evidence:kill-worker-result-(?:terminated|already-stopped)$/;
const OPERATIONAL_ACTION_MUTATE_SOURCE_REF_EVIDENCE = /^evidence:mutate-source-ref-[a-z0-9._/@:-]{1,120}$/;
const OPERATIONAL_ACTION_MUTATE_SOURCE_RESULT_EVIDENCE = /^evidence:mutate-source-result-(?:updated|already-current)$/;
const OPERATIONAL_ACTION_RETRY_VERIFICATION_REF_EVIDENCE = /^evidence:retry-verification-ref-[a-z0-9._/@:-]{1,120}$/;
const OPERATIONAL_ACTION_RETRY_VERIFICATION_RESULT_EVIDENCE = /^evidence:retry-verification-result-(?:queued|restarted)$/;
const OPERATIONAL_ACTION_REQUEUE_ITEM_EVIDENCE = /^evidence:requeue-item-[a-z0-9._/@:-]{1,120}$/;
const OPERATIONAL_ACTION_REQUEUE_RESULT_EVIDENCE = /^evidence:requeue-result-(?:queued|already-queued)$/;
const OPERATIONAL_ACTION_PROVIDER_CHANGE_TARGET_EVIDENCE = /^evidence:provider-change-target-[a-z0-9._/@:-]{1,120}$/;
const OPERATIONAL_ACTION_PROVIDER_CHANGE_RESULT_EVIDENCE = /^evidence:provider-change-result-(?:updated|unchanged|rotated)$/;

const OPERATIONAL_ACTION_RISK_RANK: Record<PipelineOperationalActionRiskTierV0, number> = {
  low: 0,
  medium: 1,
  high: 2,
  extreme: 3,
};

const PIPELINE_OPERATIONAL_ACTION_POLICY: Record<
  PipelineOperationalActionIdV0,
  {
    targetTypes: readonly PipelineOperationalActionTargetTypeV0[];
    minimumRiskTier: PipelineOperationalActionRiskTierV0;
    allowedAuthorityAllowed: boolean;
    requiredAuthorityStates: readonly PipelineOperationalActionRequestedAuthorityStateV0[];
  }
> = {
  inspect: { targetTypes: ["manager_run", "work_packet", "projection"], minimumRiskTier: "low", allowedAuthorityAllowed: true, requiredAuthorityStates: [] },
  refresh_projection: { targetTypes: ["projection"], minimumRiskTier: "low", allowedAuthorityAllowed: true, requiredAuthorityStates: [] },
  dispatch_apply: { targetTypes: ["work_item", "candidate_work"], minimumRiskTier: "high", allowedAuthorityAllowed: true, requiredAuthorityStates: ["needs_authority_approval"] },
  mark_viewed: { targetTypes: ["work_packet"], minimumRiskTier: "low", allowedAuthorityAllowed: false, requiredAuthorityStates: ["needs_product_approval"] },
  retry_verification: { targetTypes: ["execution_attempt", "work_item"], minimumRiskTier: "medium", allowedAuthorityAllowed: false, requiredAuthorityStates: ["needs_authority_approval"] },
  requeue: { targetTypes: ["work_item", "work_packet"], minimumRiskTier: "medium", allowedAuthorityAllowed: false, requiredAuthorityStates: ["needs_authority_approval"] },
  mark_tested: { targetTypes: ["work_packet"], minimumRiskTier: "medium", allowedAuthorityAllowed: false, requiredAuthorityStates: ["needs_product_approval"] },
  request_rework: { targetTypes: ["work_packet"], minimumRiskTier: "medium", allowedAuthorityAllowed: false, requiredAuthorityStates: ["needs_product_approval"] },
  pause: { targetTypes: ["runtime", "manager_run"], minimumRiskTier: "low", allowedAuthorityAllowed: true, requiredAuthorityStates: [] },
  drain: { targetTypes: ["runtime", "manager_run"], minimumRiskTier: "medium", allowedAuthorityAllowed: false, requiredAuthorityStates: ["needs_authority_approval"] },
  reassign: { targetTypes: ["work_packet"], minimumRiskTier: "medium", allowedAuthorityAllowed: false, requiredAuthorityStates: ["needs_authority_approval"] },
  reject: { targetTypes: ["work_packet"], minimumRiskTier: "medium", allowedAuthorityAllowed: false, requiredAuthorityStates: ["needs_product_approval"] },
  kill_worker: { targetTypes: ["worker"], minimumRiskTier: "high", allowedAuthorityAllowed: false, requiredAuthorityStates: ["needs_authority_approval"] },
  mutate_source: { targetTypes: ["work_packet"], minimumRiskTier: "high", allowedAuthorityAllowed: false, requiredAuthorityStates: ["needs_authority_approval"] },
  push_branch: { targetTypes: ["branch"], minimumRiskTier: "high", allowedAuthorityAllowed: false, requiredAuthorityStates: ["needs_authority_approval"] },
  open_pr: { targetTypes: ["branch"], minimumRiskTier: "high", allowedAuthorityAllowed: false, requiredAuthorityStates: ["needs_authority_approval"] },
  merge: { targetTypes: ["branch"], minimumRiskTier: "extreme", allowedAuthorityAllowed: false, requiredAuthorityStates: ["needs_safety_approval"] },
  delete_branch: { targetTypes: ["branch"], minimumRiskTier: "extreme", allowedAuthorityAllowed: false, requiredAuthorityStates: ["needs_safety_approval"] },
  cleanup: { targetTypes: ["workspace"], minimumRiskTier: "extreme", allowedAuthorityAllowed: false, requiredAuthorityStates: ["needs_safety_approval"] },
  credential_or_provider_change: { targetTypes: ["runtime"], minimumRiskTier: "extreme", allowedAuthorityAllowed: false, requiredAuthorityStates: ["needs_resource_approval"] },
};

export function isPipelineOperationalActionIdV0(value: unknown): value is PipelineOperationalActionIdV0 {
  return typeof value === "string" && (PIPELINE_OPERATIONAL_ACTION_IDS as readonly string[]).includes(value);
}

function isPipelineGatedOperationalActionIdV0(value: unknown): value is PipelineGatedOperationalActionIdV0 {
  return typeof value === "string" && (PIPELINE_GATED_OPERATIONAL_ACTION_IDS as readonly string[]).includes(value);
}

function requiresServerIssuedOperationalApproval(record: Record<string, unknown>): boolean {
  return record.targetType === "work_packet" && isPipelineGatedOperationalActionIdV0(record.actionId);
}

export function isPipelineOperationalActionEvidenceRefsV0(value: unknown): value is PipelineOperationalActionEvidenceRefsV0 {
  try {
    const refs = safeOperationalUnknownArray(value);
    if (!refs) return false;
    return refs.length > 0 && refs.length <= OPERATIONAL_ACTION_MAX_EVIDENCE_REFS && new Set(refs).size === refs.length && refs.every((ref) => {
      if (typeof ref !== "string") return false;
      const trimmed = ref.trim();
      return (
        trimmed === ref &&
        trimmed.length <= 180 &&
        OPERATIONAL_ACTION_EVIDENCE_REF.test(trimmed) &&
        !OPERATIONAL_ACTION_EVIDENCE_REF_PATH_SEGMENT.test(trimmed) &&
        !FORBIDDEN_OPERATIONAL_ACTION_METADATA.test(trimmed) &&
        !SECRET_LIKE_OPERATIONAL_ACTION_REF.test(trimmed)
      );
    });
  } catch {
    return false;
  }
}

function isPipelineOperationalActionEvidenceRefsV1(value: unknown): value is PipelineOperationalActionEvidenceRefsV0 {
  try {
    const refs = safeOperationalUnknownArray(value);
    if (!refs) return false;
    return refs.length > 0 && refs.length <= OPERATIONAL_ACTION_MAX_EVIDENCE_REFS && new Set(refs).size === refs.length && refs.every((ref) => (
      typeof ref === "string" &&
      ref.length <= OPERATIONAL_ACTION_V1_EVIDENCE_REF_MAX_LENGTH &&
      OPERATIONAL_ACTION_V1_EVIDENCE_REF.test(ref) &&
      !OPERATIONAL_ACTION_EVIDENCE_REF_PATH_SEGMENT.test(ref) &&
      !FORBIDDEN_OPERATIONAL_ACTION_METADATA.test(ref) &&
      !SECRET_LIKE_OPERATIONAL_ACTION_REF.test(ref)
    ));
  } catch {
    return false;
  }
}

export function validatePipelineOperationalActionRequestV0(request: unknown): PipelineOperationalActionValidationIssueV0[] {
  const issues: PipelineOperationalActionValidationIssueV0[] = [];
  const record = operationalActionRecord(request, issues);
  pushUnknownFieldIssues(issues, record, OPERATIONAL_ACTION_REQUEST_KEYS);
  validateOperationalSchemaAndRetention(issues, record, PIPELINE_OPERATIONAL_ACTION_SCHEMA_VERSION, true);
  pushOperationalActionCommonIssues(issues, record);
  pushEnumIssue(issues, "requestedAuthorityState", record.requestedAuthorityState, PIPELINE_OPERATIONAL_ACTION_AUTHORITY_STATES);
  pushEnumIssue(issues, "requestedRiskTier", record.requestedRiskTier, PIPELINE_OPERATIONAL_ACTION_RISK_TIERS);
  pushRequestedByIssues(issues, record.requestedBy);
  pushActionPolicyIssues(issues, record, "request");
  if (requiresServerIssuedOperationalApproval(record)) {
    if (typeof record.approvalId !== "string" || !isSafeOperationalIdentifierText(record.approvalId)) {
      issues.push({
        field: "approvalId",
        code: "policy_violation",
        summary: "Gated pipeline action requests require a server-issued approval id.",
      });
    }
    if (typeof record.expectedCurrentEventId !== "string" || !isSafeOperationalIdentifierText(record.expectedCurrentEventId)) {
      issues.push({
        field: "expectedCurrentEventId",
        code: "policy_violation",
        summary: "Gated pipeline action requests require the server-issued current packet event.",
      });
    }
    if (Array.isArray(record.evidenceRefs) && record.evidenceRefs.some((ref) => typeof ref === "string" && (ref.startsWith("evidence:product-test-approval") || ref.startsWith("evidence:authority-approval")))) {
      issues.push({
        field: "evidenceRefs",
        code: "policy_violation",
        summary: "Legacy client approval evidence markers cannot authorize gated pipeline actions.",
      });
    }
  }
  if ((record as { authorityState?: unknown }).authorityState === "allowed" || record.requestedAuthorityState === "allowed") {
    issues.push({
      field: "requestedAuthorityState",
      code: "request_cannot_self_authorize",
      summary: "Operational action requests cannot self-assert allowed authority.",
    });
  }
  if (record.operatorIntentSummary !== undefined && record.operatorIntentSummary !== null && typeof record.operatorIntentSummary !== "string") {
    issues.push({
      field: "operatorIntentSummary",
      code: "unsafe_metadata_retention",
      summary: "Operator intent summaries must be strings when present.",
    });
  } else if (typeof record.operatorIntentSummary === "string" && !isSafeOperationalMetadataText(record.operatorIntentSummary)) {
    issues.push({
      field: "operatorIntentSummary",
      code: "unsafe_metadata_retention",
      summary: "Operator intent summaries must not retain raw prompts, provider payloads, secrets, credentials, or terminal scrollback.",
    });
  }
  return issues;
}

export function validatePipelineOperationalActionApprovalV0(approval: unknown): PipelineOperationalActionValidationIssueV0[] {
  const issues: PipelineOperationalActionValidationIssueV0[] = [];
  const record = operationalActionRecord(approval, issues);
  pushUnknownFieldIssues(issues, record, OPERATIONAL_ACTION_APPROVAL_KEYS);
  if (typeof record.approvalId !== "string" || !isSafeOperationalIdentifierText(record.approvalId)) issues.push({ field: "approvalId", code: "blank_identifier", summary: "Operational approval id must be a safe metadata identifier." });
  if (!isPipelineOperationalActionIdV0(record.actionId)) {
    issues.push({ field: "actionId", code: "unknown_action_id", summary: "Operational approval uses an unknown built-in action id." });
  } else if (!isPipelineGatedOperationalActionIdV0(record.actionId)) {
    issues.push({ field: "actionId", code: "policy_violation", summary: "Server-issued approvals are limited to mark_tested, request_rework, requeue, and reject." });
  }
  if (record.targetType !== "work_packet") {
    issues.push({ field: "targetType", code: "policy_violation", summary: "Server-issued approvals must target a work_packet." });
  }
  if (typeof record.targetId !== "string" || !isSafeOperationalIdentifierText(record.targetId)) issues.push({ field: "targetId", code: "blank_identifier", summary: "Operational approval target id must be a safe metadata identifier." });
  pushRequestedByIssues(issues, record.requestedBy);
  if (
    isPipelineGatedOperationalActionIdV0(record.actionId) &&
    !PIPELINE_OPERATIONAL_ACTION_POLICY[record.actionId].requiredAuthorityStates.includes(
      record.requestedAuthorityState as PipelineOperationalActionRequestedAuthorityStateV0,
    )
  ) {
    issues.push({ field: "requestedAuthorityState", code: "policy_violation", summary: "Server-issued approvals must use the action policy's required authority family." });
  }
  if (record.requestedRiskTier !== "medium") {
    issues.push({ field: "requestedRiskTier", code: "policy_violation", summary: "Server-issued approvals must use the medium risk tier." });
  }
  if (typeof record.expectedCurrentEventId !== "string" || !isSafeOperationalIdentifierText(record.expectedCurrentEventId)) {
    issues.push({ field: "expectedCurrentEventId", code: "policy_violation", summary: "Eligible operational approvals require a non-null current packet event." });
  }
  const issuedAt = typeof record.issuedAt === "string" ? Date.parse(record.issuedAt) : NaN;
  const expiresAt = typeof record.expiresAt === "string" ? Date.parse(record.expiresAt) : NaN;
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt <= issuedAt) issues.push({ field: "expiresAt", code: "stale_or_unparseable_readiness", summary: "Operational approval issue and expiry timestamps must be ordered and parseable." });
  if (typeof record.consumed !== "boolean") issues.push({ field: "consumed", code: "inconsistent_result", summary: "Operational approval consumption state must be explicit." });
  if (record.metadataOnly !== true || record.rawPayloadRetained !== false) issues.push({ field: "metadataOnly", code: "bad_retention_flag", summary: "Operational approval metadata must not retain raw payloads." });
  return issues;
}

export function validatePipelineOperationalActionResultV0(result: unknown): PipelineOperationalActionValidationIssueV0[] {
  const issues: PipelineOperationalActionValidationIssueV0[] = [];
  const record = operationalActionRecord(result, issues);
  pushUnknownFieldIssues(issues, record, OPERATIONAL_ACTION_RESULT_KEYS);
  validateOperationalSchemaAndRetention(issues, record, PIPELINE_OPERATIONAL_ACTION_SCHEMA_VERSION, true);
  pushOperationalActionCommonIssues(issues, record);
  pushEnumIssue(issues, "outcome", record.outcome, PIPELINE_OPERATIONAL_ACTION_OUTCOMES);
  pushEnumIssue(issues, "resultingStage", record.resultingStage, [...AUTHORITATIVE_PACKET_STAGES, "terminal", "deferred", "unknown"]);
  pushEnumIssue(issues, "resultingStatus", record.resultingStatus, [...AUTHORITATIVE_PACKET_STATUSES, "unknown"]);
  pushCapabilityStateIssues(issues, record);
  pushActionPolicyIssues(issues, record, "result");
  if (record.outcome === "succeeded" && (record.authorityState !== "allowed" || record.capabilityState !== "available")) {
    issues.push({
      field: "outcome",
      code: "inconsistent_result",
      summary: "Succeeded operational action results require allowed authority and available capability.",
    });
  }
  if (record.outcome === "succeeded" && record.capabilityState === "available" && record.authorityState === "allowed" && record.typedReason !== null) {
    issues.push({
      field: "typedReason",
      code: "inconsistent_result",
      summary: "Successful available operational action results must not carry failure typed reasons.",
    });
  }
  if (record.authorityState === "allowed" && isPipelineOperationalActionIdV0(record.actionId)) {
    const serverBoundApprovalRequired = requiresServerIssuedOperationalApproval(record);
    if (serverBoundApprovalRequired && Array.isArray(record.evidenceRefs) && record.evidenceRefs.some((ref) => typeof ref === "string" && (ref.startsWith("evidence:product-test-approval") || ref.startsWith("evidence:authority-approval")))) {
      issues.push({ field: "evidenceRefs", code: "policy_violation", summary: "Legacy client approval evidence markers cannot authorize gated pipeline actions." });
    }
    const approvalSatisfied = serverBoundApprovalRequired
      ? typeof record.approvalId === "string" && isSafeOperationalIdentifierText(record.approvalId)
      : hasRequiredOperationalApprovalEvidence(record.actionId, record.evidenceRefs, record);
    if (!approvalSatisfied) {
      issues.push({
        field: serverBoundApprovalRequired ? "approvalId" : "evidenceRefs",
        code: "policy_violation",
        summary: serverBoundApprovalRequired
          ? "Gated pipeline action results require a server-issued approval id."
          : "Successful high-risk operational action results require approval-family evidence.",
      });
    }
  }
  if (
    record.outcome !== "succeeded" &&
    record.authorityState === "allowed" &&
    !isAllowedFailedOperationalResult(record)
  ) {
    issues.push({
      field: "authorityState",
      code: "inconsistent_result",
      summary: "Only approved operational action failures can carry allowed authority; blocked, rejected, or simulated results cannot claim allowed authority.",
    });
  }
  pushOutcomeStateConsistencyIssues(issues, record);
  if (
    record.actionId === "merge" &&
    record.outcome === "succeeded" &&
    record.authorityState === "allowed" &&
    !hasRequiredMergeSuccessEvidence(record.evidenceRefs, record)
  ) {
    issues.push({
      field: "evidenceRefs",
      code: "policy_violation",
      summary: "Successful merge results require exact head, base, PR, checks, review-thread, mergeability, and local verification evidence.",
    });
  }
  if (
    record.outcome === "succeeded" &&
    record.authorityState === "allowed" &&
    isPipelineOperationalActionIdV0(record.actionId) &&
    !hasRequiredActionSuccessEvidence(record.actionId, record.evidenceRefs, record)
  ) {
    issues.push({
      field: "evidenceRefs",
      code: "policy_violation",
      summary: "Successful delivery and cleanup results require action-specific result evidence.",
    });
  }
  if (
    isOneOfString(record.outcome, ["blocked", "failed", "rejected", "simulated"]) &&
    !isKnownOperationalTypedReason(record.typedReason)
  ) {
    issues.push({
      field: "typedReason",
      code: "inconsistent_result",
      summary: "Blocked, failed, rejected, or simulated operational action results require a typed reason.",
    });
  }
  if (isOneOfString(record.capabilityState, ["unavailable", "gated", "simulated"]) && !isKnownOperationalTypedReason(record.typedReason)) {
    issues.push({
      field: "typedReason",
      code: "inconsistent_result",
      summary: "Unavailable, gated, or simulated operational action results require a typed reason.",
    });
  }
  return issues;
}

function isAllowedFailedOperationalResult(record: Record<string, unknown>): boolean {
  return (
    record.outcome === "failed" &&
    record.capabilityState === "available" &&
    isPipelineOperationalActionIdV0(record.actionId) &&
    hasRequiredOperationalApprovalEvidence(record.actionId, record.evidenceRefs, record) &&
    safeOperationalStringArray(record.evidenceRefs)?.includes(operationalActionContextEvidenceRef(record.actionId, record)) === true
  );
}

export function validatePipelineOperationalActionCapabilityV0(capability: unknown): PipelineOperationalActionValidationIssueV0[] {
  const issues: PipelineOperationalActionValidationIssueV0[] = [];
  const record = operationalActionRecord(capability, issues);
  pushUnknownFieldIssues(issues, record, OPERATIONAL_ACTION_CAPABILITY_KEYS);
  validateOperationalSchemaAndRetention(issues, record, null, true);
  if (!isPipelineOperationalActionIdV0(record.actionId)) {
    issues.push({ field: "actionId", code: "unknown_action_id", summary: "Operational action capability uses an unknown built-in action id." });
  }
  if (!isPipelineOperationalActionEvidenceRefsV0(record.evidenceRefs)) {
    issues.push({ field: "evidenceRefs", code: "evidence_required", summary: "Operational action capabilities require safe metadata evidence refs." });
  }
  pushEnumIssue(issues, "targetType", record.targetType, PIPELINE_OPERATIONAL_ACTION_TARGET_TYPES);
  pushCapabilityStateIssues(issues, record);
  pushActionPolicyIssues(issues, record, "capability");
  pushRequiredCapabilityGuardIssues(issues, record);
  if (record.targetId !== undefined && record.targetId !== null && (typeof record.targetId !== "string" || !isSafeOperationalIdentifierText(record.targetId))) {
    issues.push({ field: "targetId", code: "unsafe_metadata_retention", summary: "Operational action capability target ids must be safe metadata text." });
  }
  if (requiresOperationalCapabilityTargetId(record) && (typeof record.targetId !== "string" || !isSafeOperationalIdentifierText(record.targetId))) {
    issues.push({ field: "targetId", code: "blank_identifier", summary: "Available mutating or high-risk operational action capabilities require a safe current target id." });
  }
  if (record.capabilityState === "available" && record.authorityState === "allowed" && record.typedReason !== null) {
    issues.push({
      field: "typedReason",
      code: "inconsistent_result",
      summary: "Available operational action capabilities must not carry failure typed reasons.",
    });
  }
  if (
    record.capabilityState === "available" &&
    record.authorityState === "allowed" &&
    isPipelineOperationalActionIdV0(record.actionId) &&
    !hasRequiredOperationalCapabilityApprovalEvidence(record.actionId, record.evidenceRefs, record)
  ) {
    issues.push({
      field: "evidenceRefs",
      code: "policy_violation",
      summary: "Available high-risk operational action capabilities require capability approval evidence.",
    });
  }
  if (isOneOfString(record.capabilityState, ["unavailable", "gated", "simulated"]) && !isKnownOperationalTypedReason(record.typedReason)) {
    issues.push({
      field: "typedReason",
      code: "inconsistent_result",
      summary: "Unavailable, gated, or simulated operational action capabilities require a typed reason.",
    });
  }
  if (typeof record.expectedResultSummary !== "string" || !isSafeOperationalMetadataText(record.expectedResultSummary)) {
    issues.push({
      field: "expectedResultSummary",
      code: "unsafe_metadata_retention",
      summary: "Expected result summaries must be non-empty metadata and cannot retain raw payloads.",
    });
  }
  return issues;
}

const PIPELINE_OPERATIONAL_ACTION_V1_DIGEST = /^sha256:[0-9a-f]{64}$/;
const PIPELINE_OPERATIONAL_ACTION_V1_COMMON_KEYS = [
  "schemaVersion", "actionId", "targetType", "targetId", "actionContext", "actionContextDigestSha256",
  "serverBound", "metadataOnly", "rawPayloadRetained",
] as const;

export function pipelineOperationalActionContextDigestPayloadV1(
  actionId: PipelineOperationalActionIdV1,
  targetType: PipelineOperationalActionTargetTypeV1,
  targetId: string,
  actionContext: PipelineOperationalActionContextV1,
): string {
  const orderedContext: Record<string, unknown> = {};
  for (const field of PIPELINE_OPERATIONAL_ACTION_V1_CONTEXT_FIELDS[actionId]) {
    orderedContext[field] = (actionContext as unknown as Record<string, unknown>)[field];
  }
  return JSON.stringify({
    schemaVersion: PIPELINE_OPERATIONAL_ACTION_V1_SCHEMA_VERSION,
    actionId,
    targetType,
    targetId,
    actionContext: orderedContext,
  });
}

export function pipelineOperationalActionContextDigestSha256V1(
  actionId: PipelineOperationalActionIdV1,
  targetType: PipelineOperationalActionTargetTypeV1,
  targetId: string,
  actionContext: PipelineOperationalActionContextV1,
): PipelineOperationalActionContextDigestV1 {
  const payload = pipelineOperationalActionContextDigestPayloadV1(actionId, targetType, targetId, actionContext);
  return `sha256:${pipelineOperationalActionSha256HexV1(payload)}`;
}

export function validatePipelineOperationalActionRequestV1(request: unknown): PipelineOperationalActionValidationIssueV1[] {
  const issues: PipelineOperationalActionValidationIssueV1[] = [];
  const record = pipelineOperationalActionV1Record(request, issues);
  validatePipelineOperationalActionV1Common(issues, record, [
    ...PIPELINE_OPERATIONAL_ACTION_V1_COMMON_KEYS,
    "idempotencyKey", "correlationId", "requestedBy", "requestedAuthorityState", "requestedRiskTier",
    "approvalId", "evidenceRefs",
  ]);
  for (const [field, maxLength] of [
    ["idempotencyKey", OPERATIONAL_ACTION_V1_ID_LENGTHS.idempotency],
    ["correlationId", OPERATIONAL_ACTION_V1_ID_LENGTHS.correlation],
    ["approvalId", OPERATIONAL_ACTION_V1_ID_LENGTHS.approval],
  ] as const) {
    if (!isSafeOperationalActionV1Identifier(record[field], maxLength)) {
      pushPipelineOperationalActionV1Issue(issues, field, "invalid_contract", `V1 ${field} must be an exact safe identifier.`);
    }
  }
  validatePipelineOperationalActionV1Actor(issues, record.requestedBy, "requestedBy");
  if (!isPipelineOperationalActionEvidenceRefsV1(record.evidenceRefs)) {
    pushPipelineOperationalActionV1Issue(issues, "evidenceRefs", "invalid_contract", "V1 requests require safe metadata-only evidence refs.");
  }
  return issues;
}

export function validatePipelineOperationalActionApprovalRequestV1(approvalRequest: unknown): PipelineOperationalActionValidationIssueV1[] {
  const issues: PipelineOperationalActionValidationIssueV1[] = [];
  const record = pipelineOperationalActionV1Record(approvalRequest, issues);
  validatePipelineOperationalActionV1Common(issues, record, [
    ...PIPELINE_OPERATIONAL_ACTION_V1_COMMON_KEYS,
    "requestedBy", "requestedAuthorityState", "requestedRiskTier",
  ]);
  validatePipelineOperationalActionV1Actor(issues, record.requestedBy, "requestedBy");
  return issues;
}

export function validatePipelineOperationalActionApprovalV1(approval: unknown): PipelineOperationalActionValidationIssueV1[] {
  const issues: PipelineOperationalActionValidationIssueV1[] = [];
  const record = pipelineOperationalActionV1Record(approval, issues);
  validatePipelineOperationalActionV1Common(issues, record, [
    ...PIPELINE_OPERATIONAL_ACTION_V1_COMMON_KEYS,
    "requestedBy", "requestedAuthorityState", "requestedRiskTier", "approvalId", "issuedBy", "issuedAt", "expiresAt",
    "consumed", "consumedAt", "consumedActionIdempotencyKey", "consumedActionRecordId",
  ]);
  validatePipelineOperationalActionV1Actor(issues, record.requestedBy, "requestedBy");
  if (!isSafeOperationalActionV1Identifier(record.approvalId, OPERATIONAL_ACTION_V1_ID_LENGTHS.approval)) {
    pushPipelineOperationalActionV1Issue(issues, "approvalId", "invalid_contract", "V1 approvals require an exact safe approval id.");
  }
  if (record.issuedBy !== "supervisor_server") {
    pushPipelineOperationalActionV1Issue(issues, "issuedBy", "policy_violation", "V1 approvals must be issued by the supervisor server.");
  }
  const issuedAt = pipelineOperationalActionV1Timestamp(record.issuedAt);
  const expiresAt = pipelineOperationalActionV1Timestamp(record.expiresAt);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt <= issuedAt) {
    pushPipelineOperationalActionV1Issue(issues, "expiresAt", "invalid_contract", "V1 approval timestamps must be canonical, parseable, and ordered.");
  }
  if (typeof record.consumed !== "boolean") {
    pushPipelineOperationalActionV1Issue(issues, "consumed", "invalid_contract", "V1 approval consumption state must be explicit.");
  } else {
    const consumptionFields = [record.consumedAt, record.consumedActionIdempotencyKey, record.consumedActionRecordId];
    if (record.consumed && (
      !Number.isFinite(pipelineOperationalActionV1Timestamp(record.consumedAt)) ||
      !isSafeOperationalActionV1Identifier(record.consumedActionIdempotencyKey, OPERATIONAL_ACTION_V1_ID_LENGTHS.idempotency) ||
      !isSafeOperationalActionV1Identifier(record.consumedActionRecordId, OPERATIONAL_ACTION_V1_ID_LENGTHS.actionRecord)
    )) {
      pushPipelineOperationalActionV1Issue(issues, "consumed", "invalid_contract", "Consumed V1 approvals require complete consumption metadata.");
    }
    if (!record.consumed && consumptionFields.some((value) => value !== null)) {
      pushPipelineOperationalActionV1Issue(issues, "consumed", "invalid_contract", "Unconsumed V1 approvals cannot carry consumption metadata.");
    }
  }
  return issues;
}

export function validatePipelineOperationalActionCapabilityV1(capability: unknown): PipelineOperationalActionValidationIssueV1[] {
  const issues: PipelineOperationalActionValidationIssueV1[] = [];
  const record = pipelineOperationalActionV1Record(capability, issues);
  validatePipelineOperationalActionV1Common(issues, record, [
    ...PIPELINE_OPERATIONAL_ACTION_V1_COMMON_KEYS,
    "capabilityState", "authorityState", "riskTier", "typedReason", "expectedResultSummary",
    "correlationRequired", "idempotencyRequired", "evidenceRefs",
  ], "capability");
  if (!isOneOfString(record.capabilityState, PIPELINE_OPERATIONAL_ACTION_CAPABILITY_STATES)) {
    pushPipelineOperationalActionV1Issue(issues, "capabilityState", "invalid_contract", "V1 capability state is invalid.");
  }
  if (!isOneOfString(record.authorityState, ["needs_authority_approval", "allowed", "blocked"])) {
    pushPipelineOperationalActionV1Issue(issues, "authorityState", "policy_violation", "V1 capabilities use only the authority-approval family, allowed, or blocked.");
  }
  if (record.correlationRequired !== true || record.idempotencyRequired !== true) {
    pushPipelineOperationalActionV1Issue(issues, "correlationRequired", "policy_violation", "V1 capabilities require correlation and idempotency.");
  }
  if (!isPipelineOperationalActionEvidenceRefsV1(record.evidenceRefs)) {
    pushPipelineOperationalActionV1Issue(issues, "evidenceRefs", "invalid_contract", "V1 capabilities require safe metadata-only evidence refs.");
  }
  if (typeof record.expectedResultSummary !== "string" || !isSafeOperationalMetadataText(record.expectedResultSummary)) {
    pushPipelineOperationalActionV1Issue(issues, "expectedResultSummary", "invalid_contract", "V1 capabilities require a safe expected-result summary.");
  }
  if (record.capabilityState !== "available" && !isKnownOperationalTypedReason(record.typedReason)) {
    pushPipelineOperationalActionV1Issue(issues, "typedReason", "inconsistent_result", "Unavailable, gated, or simulated V1 capabilities require a typed reason.");
  }
  return issues;
}

export function validatePipelineOperationalActionResultV1(result: unknown): PipelineOperationalActionValidationIssueV1[] {
  const issues: PipelineOperationalActionValidationIssueV1[] = [];
  const record = pipelineOperationalActionV1Record(result, issues);
  validatePipelineOperationalActionV1Common(issues, record, [
    ...PIPELINE_OPERATIONAL_ACTION_V1_COMMON_KEYS,
    "outcome", "capabilityState", "authorityState", "riskTier", "typedReason", "successEvidence", "evidenceRefs",
    "correlationId", "idempotencyKey", "actionRecordId", "approvalId", "replayed",
  ], "result");
  if (!isOneOfString(record.outcome, PIPELINE_OPERATIONAL_ACTION_OUTCOMES) ||
      !isOneOfString(record.capabilityState, PIPELINE_OPERATIONAL_ACTION_CAPABILITY_STATES) ||
      !isOneOfString(record.authorityState, ["needs_authority_approval", "allowed", "blocked"])) {
    pushPipelineOperationalActionV1Issue(issues, "outcome", "invalid_contract", "V1 result outcome, capability, or authority state is invalid.");
  }
  for (const [field, maxLength] of [
    ["correlationId", OPERATIONAL_ACTION_V1_ID_LENGTHS.correlation],
    ["idempotencyKey", OPERATIONAL_ACTION_V1_ID_LENGTHS.idempotency],
    ["actionRecordId", OPERATIONAL_ACTION_V1_ID_LENGTHS.actionRecord],
    ["approvalId", OPERATIONAL_ACTION_V1_ID_LENGTHS.approval],
  ] as const) {
    if (!isSafeOperationalActionV1Identifier(record[field], maxLength)) {
      pushPipelineOperationalActionV1Issue(issues, field, "invalid_contract", `V1 result ${field} must be an exact safe identifier.`);
    }
  }
  if (!isPipelineOperationalActionEvidenceRefsV1(record.evidenceRefs) || typeof record.replayed !== "boolean") {
    pushPipelineOperationalActionV1Issue(issues, "evidenceRefs", "invalid_contract", "V1 results require safe evidence refs and explicit replay state.");
  }
  if (record.outcome === "succeeded") {
    if (record.authorityState !== "allowed" || record.capabilityState !== "available" || record.typedReason !== null) {
      pushPipelineOperationalActionV1Issue(issues, "outcome", "inconsistent_result", "Successful V1 results require allowed authority, available capability, and no failure reason.");
    }
    validatePipelineOperationalActionV1SuccessEvidence(issues, record);
  } else {
    if (record.successEvidence !== null) {
      pushPipelineOperationalActionV1Issue(issues, "successEvidence", "inconsistent_result", "Non-success V1 results cannot claim success evidence.");
    }
    if (!isKnownOperationalTypedReason(record.typedReason)) {
      pushPipelineOperationalActionV1Issue(issues, "typedReason", "inconsistent_result", "Non-success V1 results require a typed reason.");
    }
  }
  return issues;
}

export function validatePipelineOperationalActionAuthorizationV1(
  request: unknown,
  approval: unknown,
  evaluatedAt: string,
): PipelineOperationalActionValidationIssueV1[] {
  const issues = [
    ...validatePipelineOperationalActionRequestV1(request),
    ...validatePipelineOperationalActionApprovalV1(approval),
  ];
  if (issues.length > 0) return issues;
  const requestRecord = request as Record<string, unknown>;
  const approvalRecord = approval as Record<string, unknown>;
  for (const field of ["approvalId", "actionId", "targetType", "targetId", "requestedAuthorityState", "requestedRiskTier"]) {
    if (requestRecord[field] !== approvalRecord[field]) {
      pushPipelineOperationalActionV1Issue(issues, field, "stale_fence", `V1 approval ${field} no longer matches the apply request.`);
    }
  }
  if (requestRecord.actionContextDigestSha256 !== approvalRecord.actionContextDigestSha256) {
    pushPipelineOperationalActionV1Issue(issues, "actionContextDigestSha256", "context_digest_mismatch", "V1 approval context digest does not match the apply request.");
  }
  const requestContextPayload = pipelineOperationalActionContextDigestPayloadV1(
    requestRecord.actionId as PipelineOperationalActionIdV1,
    requestRecord.targetType as PipelineOperationalActionTargetTypeV1,
    requestRecord.targetId as string,
    requestRecord.actionContext as PipelineOperationalActionContextV1,
  );
  const approvalContextPayload = pipelineOperationalActionContextDigestPayloadV1(
    approvalRecord.actionId as PipelineOperationalActionIdV1,
    approvalRecord.targetType as PipelineOperationalActionTargetTypeV1,
    approvalRecord.targetId as string,
    approvalRecord.actionContext as PipelineOperationalActionContextV1,
  );
  if (requestContextPayload !== approvalContextPayload) {
    pushPipelineOperationalActionV1Issue(issues, "actionContext", "stale_fence", "V1 action context changed after approval issuance.");
  }
  if (!samePipelineOperationalActionV1Actor(requestRecord.requestedBy, approvalRecord.requestedBy)) {
    pushPipelineOperationalActionV1Issue(issues, "requestedBy", "wrong_actor", "V1 approval requester does not match the apply actor.");
  }
  const evaluatedAtMs = pipelineOperationalActionV1Timestamp(evaluatedAt);
  const issuedAtMs = pipelineOperationalActionV1Timestamp(approvalRecord.issuedAt);
  const expiresAtMs = pipelineOperationalActionV1Timestamp(approvalRecord.expiresAt);
  if (!Number.isFinite(evaluatedAtMs) || evaluatedAtMs < issuedAtMs || evaluatedAtMs >= expiresAtMs) {
    pushPipelineOperationalActionV1Issue(issues, "expiresAt", "approval_expired", "V1 approval is not fresh at evaluation time.");
  }
  if (approvalRecord.consumed === true) {
    const sameReplay = approvalRecord.consumedActionIdempotencyKey === requestRecord.idempotencyKey;
    pushPipelineOperationalActionV1Issue(
      issues,
      "idempotencyKey",
      sameReplay ? "approval_consumed" : "replay_conflict",
      sameReplay
        ? "V1 approval was already consumed; return persisted readback instead of applying again."
        : "V1 approval was consumed by a different idempotency key.",
    );
  }
  return issues;
}

function validatePipelineOperationalActionV1Common(
  issues: PipelineOperationalActionValidationIssueV1[],
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  surface: "request" | "capability" | "result" = "request",
): void {
  for (const key of Object.keys(record)) {
    if (!allowedKeys.includes(key)) {
      pushPipelineOperationalActionV1Issue(issues, key, "invalid_contract", "V1 operational action objects reject uncontracted fields.");
    }
  }
  if (record.schemaVersion !== PIPELINE_OPERATIONAL_ACTION_V1_SCHEMA_VERSION || record.serverBound !== true ||
      record.metadataOnly !== true || record.rawPayloadRetained !== false) {
    pushPipelineOperationalActionV1Issue(issues, "schemaVersion", "policy_violation", "V1 actions must be server-bound metadata-only objects with no raw payload retention.");
  }
  if (!isPipelineOperationalActionIdV1(record.actionId)) {
    pushPipelineOperationalActionV1Issue(issues, "actionId", "invalid_contract", "V1 operational action id is unsupported.");
    return;
  }
  const policy = PIPELINE_OPERATIONAL_ACTION_V1_POLICY[record.actionId];
  const riskField = surface === "request" ? "requestedRiskTier" : "riskTier";
  const authorityField = surface === "request" ? "requestedAuthorityState" : "authorityState";
  if (record.targetType !== policy.targetType || record[riskField] !== policy.riskTier) {
    pushPipelineOperationalActionV1Issue(issues, "targetType", "policy_violation", "V1 target type and risk tier must exactly match policy.");
  }
  if (surface === "request" && record[authorityField] !== policy.authorityState) {
    pushPipelineOperationalActionV1Issue(issues, authorityField, "policy_violation", "V1 requests require the authority-approval family.");
  }
  const targetIdMaxLength = record.actionId === "retry_verification"
    ? OPERATIONAL_ACTION_V1_ID_LENGTHS.executionAttempt
    : record.actionId === "reassign"
      ? OPERATIONAL_ACTION_V1_ID_LENGTHS.workPacket
      : PIPELINE_OPERATIONAL_ACTION_V1_RUNTIME_TARGET_ID.length;
  if (!isSafeOperationalActionV1Identifier(record.targetId, targetIdMaxLength)) {
    pushPipelineOperationalActionV1Issue(issues, "targetId", "invalid_contract", "V1 target id must be an exact safe identifier.");
  }
  if ((record.actionId === "pause" || record.actionId === "drain") && record.targetId !== PIPELINE_OPERATIONAL_ACTION_V1_RUNTIME_TARGET_ID) {
    pushPipelineOperationalActionV1Issue(issues, "targetId", "target_context_mismatch", "Runtime V1 actions must target the singleton supervisor runtime.");
  }
  if (typeof record.actionContextDigestSha256 !== "string" || !PIPELINE_OPERATIONAL_ACTION_V1_DIGEST.test(record.actionContextDigestSha256)) {
    pushPipelineOperationalActionV1Issue(issues, "actionContextDigestSha256", "invalid_contract", "V1 action context requires a lowercase SHA-256 digest.");
  } else if (
    typeof record.targetType === "string" &&
    typeof record.targetId === "string" &&
    record.actionContext &&
    typeof record.actionContext === "object" &&
    record.actionContextDigestSha256 !== pipelineOperationalActionContextDigestSha256V1(
      record.actionId,
      record.targetType as PipelineOperationalActionTargetTypeV1,
      record.targetId,
      record.actionContext as PipelineOperationalActionContextV1,
    )
  ) {
    pushPipelineOperationalActionV1Issue(issues, "actionContextDigestSha256", "context_digest_mismatch", "V1 action context digest must equal the canonical target-and-context SHA-256 digest.");
  }
  validatePipelineOperationalActionV1Context(issues, record.actionId, record.targetId, record.actionContext);
}

function validatePipelineOperationalActionV1Context(
  issues: PipelineOperationalActionValidationIssueV1[],
  actionId: PipelineOperationalActionIdV1,
  targetId: unknown,
  contextValue: unknown,
): void {
  const context = pipelineOperationalActionV1Record(contextValue, issues, "actionContext");
  const expectedFields = PIPELINE_OPERATIONAL_ACTION_V1_CONTEXT_FIELDS[actionId];
  if (Object.keys(context).length !== expectedFields.length || Object.keys(context).some((key) => !expectedFields.includes(key as never))) {
    pushPipelineOperationalActionV1Issue(issues, "actionContext", "invalid_contract", "V1 action context fields must exactly match the action discriminator.");
  }
  if (context.kind !== actionId) {
    pushPipelineOperationalActionV1Issue(issues, "actionContext.kind", "target_context_mismatch", "V1 action context discriminator must match actionId.");
  }
  if (actionId === "retry_verification") {
    for (const [field, maxLength] of [
      ["executionAttemptId", OPERATIONAL_ACTION_V1_ID_LENGTHS.executionAttempt],
      ["linkedWorkItemId", OPERATIONAL_ACTION_V1_ID_LENGTHS.workItem],
      ["linkedPacketId", OPERATIONAL_ACTION_V1_ID_LENGTHS.workPacket],
      ["expectedPacketCurrentEventId", OPERATIONAL_ACTION_V1_ID_LENGTHS.packetEvent],
    ] as const) {
      if (!isSafeOperationalActionV1Identifier(context[field], maxLength)) pushPipelineOperationalActionV1Issue(issues, `actionContext.${field}`, "invalid_contract", "Retry context identifiers must be exact and safe.");
    }
    if (context.executionAttemptId !== targetId) pushPipelineOperationalActionV1Issue(issues, "actionContext.executionAttemptId", "target_context_mismatch", "Retry context must bind the target execution attempt.");
    if (!isOneOfString(context.expectedWorkItemState, [
      "queued", "triaged", "ready", "implementing", "validating", "reviewing", "awaiting_audit", "needs_rework", "operator_owned", "blocked", "done",
    ]) || !Number.isFinite(pipelineOperationalActionV1Timestamp(context.expectedWorkItemUpdatedAt))) {
      pushPipelineOperationalActionV1Issue(issues, "actionContext.expectedWorkItemState", "stale_fence", "Retry requires the exact linked WorkItem state.");
    }
    if (!isOneOfString(context.expectedAttemptStatus, ["failed", "timed_out", "rejected"]) || !Number.isFinite(pipelineOperationalActionV1Timestamp(context.expectedAttemptUpdatedAt))) {
      pushPipelineOperationalActionV1Issue(issues, "actionContext.expectedAttemptStatus", "stale_fence", "Retry requires a terminal failed/timed-out/rejected attempt status and exact updatedAt revision.");
    }
    const leaseIdValid = context.expectedLeaseId === null || isSafeOperationalActionV1Identifier(context.expectedLeaseId, OPERATIONAL_ACTION_V1_ID_LENGTHS.queueLease);
    const leaseTokenValid = context.expectedLeaseFencingToken === null || isPositiveInteger(context.expectedLeaseFencingToken);
    if (!leaseIdValid || !leaseTokenValid || (context.expectedLeaseId === null) !== (context.expectedLeaseFencingToken === null) || context.expectedLeaseActive !== false) {
      pushPipelineOperationalActionV1Issue(issues, "actionContext.expectedLeaseId", "stale_fence", "Retry lease id/token must be paired and the exact lease must be inactive.");
    }
  } else if (actionId === "pause") {
    if (!isOneOfString(context.expectedRuntimeMode, ["running", "paused", "draining", "disabled"]) || !isPositiveInteger(context.expectedRuntimeRevision)) {
      pushPipelineOperationalActionV1Issue(issues, "actionContext.expectedRuntimeRevision", "stale_fence", "Pause requires exact runtime mode and positive monotonic revision.");
    }
  } else if (actionId === "drain") {
    if (!isOneOfString(context.expectedRuntimeMode, ["running", "paused", "draining", "disabled"]) || !isPositiveInteger(context.expectedRuntimeRevision) ||
        !isNonNegativeInteger(context.expectedActiveWorkCount) || !isNonNegativeInteger(context.expectedActiveLeaseCount) || !isNonNegativeInteger(context.expectedRunningAttemptCount)) {
      pushPipelineOperationalActionV1Issue(issues, "actionContext.expectedRuntimeRevision", "stale_fence", "Drain requires exact runtime mode/revision and non-negative active-count snapshot.");
    }
  } else {
    for (const [field, maxLength] of [
      ["linkedWorkItemId", OPERATIONAL_ACTION_V1_ID_LENGTHS.workItem],
      ["expectedPacketCurrentEventId", OPERATIONAL_ACTION_V1_ID_LENGTHS.packetEvent],
      ["newOwnerId", OPERATIONAL_ACTION_V1_ID_LENGTHS.owner],
    ] as const) {
      if (!isSafeOperationalActionV1Identifier(context[field], maxLength)) pushPipelineOperationalActionV1Issue(issues, `actionContext.${field}`, "invalid_contract", "Reassign context identifiers must be exact and safe.");
    }
    if (context.expectedCurrentOwnerId !== null && !isSafeOperationalActionV1Identifier(context.expectedCurrentOwnerId, OPERATIONAL_ACTION_V1_ID_LENGTHS.owner)) {
      pushPipelineOperationalActionV1Issue(issues, "actionContext.expectedCurrentOwnerId", "invalid_contract", "Reassign current owner must be exact or explicitly unassigned.");
    }
    if (context.expectedCurrentOwnerId === context.newOwnerId || !isOneOfString(context.expectedWorkItemState, [
      "queued", "triaged", "ready", "implementing", "validating", "reviewing", "awaiting_audit", "needs_rework", "operator_owned", "blocked", "done",
    ]) || !Number.isFinite(pipelineOperationalActionV1Timestamp(context.expectedWorkItemUpdatedAt)) ||
        context.expectedActiveLeaseId !== null || context.expectedRunningAttemptId !== null) {
      pushPipelineOperationalActionV1Issue(issues, "actionContext", "stale_fence", "Reassign requires changed exact ownership, linked state, and no active lease or running attempt.");
    }
  }
}

function validatePipelineOperationalActionV1SuccessEvidence(
  issues: PipelineOperationalActionValidationIssueV1[],
  record: Record<string, unknown>,
): void {
  const evidence = pipelineOperationalActionV1Record(record.successEvidence, issues, "successEvidence");
  const context = pipelineOperationalActionV1Record(record.actionContext, issues, "actionContext");
  const exactKeysByAction: Record<PipelineOperationalActionIdV1, readonly string[]> = {
    retry_verification: [
      "kind", "originalAttemptId", "retryIntentId", "linkedWorkItemId", "linkedPacketId",
      "resultingPacketCurrentEventId", "originalAttemptPreserved", "providerOrWorkerLaunched",
    ],
    pause: [
      "kind", "resultingRuntimeMode", "resultingRuntimeRevision", "activeWorkCount", "activeLeaseCount", "runningAttemptCount", "intakeStopped",
      "activeWorkPreserved",
    ],
    drain: [
      "kind", "resultingRuntimeMode", "resultingRuntimeRevision", "activeWorkCount", "activeLeaseCount", "runningAttemptCount", "intakeStopped",
      "activeWorkAllowedToConverge", "workersKilled",
    ],
    reassign: [
      "kind", "packetId", "linkedWorkItemId", "previousOwnerId", "newOwnerId",
      "resultingPacketCurrentEventId", "activeLeaseTransferred", "workerLaunched",
    ],
  };
  const exactKeys = exactKeysByAction[record.actionId as PipelineOperationalActionIdV1];
  if (!exactKeys || Object.keys(evidence).length !== exactKeys.length || Object.keys(evidence).some((key) => !exactKeys.includes(key))) {
    pushPipelineOperationalActionV1Issue(issues, "successEvidence", "inconsistent_result", "V1 success evidence fields must exactly match the action discriminator.");
  }
  if (evidence.kind !== record.actionId) {
    pushPipelineOperationalActionV1Issue(issues, "successEvidence.kind", "inconsistent_result", "V1 success evidence must match the action discriminator.");
    return;
  }
  if (record.actionId === "retry_verification") {
    if (evidence.originalAttemptId !== record.targetId || evidence.originalAttemptPreserved !== true || evidence.providerOrWorkerLaunched !== false ||
        !isSafeOperationalActionV1Identifier(evidence.retryIntentId, OPERATIONAL_ACTION_V1_ID_LENGTHS.retryIntent) ||
        !(evidence.retryIntentId as string).startsWith("verification-retry-") || evidence.retryIntentId === evidence.originalAttemptId ||
        evidence.linkedWorkItemId !== context.linkedWorkItemId || evidence.linkedPacketId !== context.linkedPacketId ||
        evidence.resultingPacketCurrentEventId === context.expectedPacketCurrentEventId ||
        !isSafeOperationalActionV1Identifier(evidence.resultingPacketCurrentEventId, OPERATIONAL_ACTION_V1_ID_LENGTHS.packetEvent)) {
      pushPipelineOperationalActionV1Issue(issues, "successEvidence", "inconsistent_result", "Retry success must preserve the original attempt, create a distinct pending retry intent, and launch nothing.");
    }
  } else if (record.actionId === "pause") {
    if (evidence.resultingRuntimeMode !== "paused" || !isPositiveInteger(evidence.resultingRuntimeRevision) || !isNonNegativeInteger(evidence.activeWorkCount) ||
        !isNonNegativeInteger(evidence.activeLeaseCount) || !isNonNegativeInteger(evidence.runningAttemptCount) ||
        evidence.resultingRuntimeRevision <= (context.expectedRuntimeRevision as number) ||
        evidence.intakeStopped !== true || evidence.activeWorkPreserved !== true) {
      pushPipelineOperationalActionV1Issue(issues, "successEvidence", "inconsistent_result", "Pause success must report paused mode/revision and preserved active work.");
    }
  } else if (record.actionId === "drain") {
    if (evidence.resultingRuntimeMode !== "draining" || !isPositiveInteger(evidence.resultingRuntimeRevision) || !isNonNegativeInteger(evidence.activeWorkCount) ||
        !isNonNegativeInteger(evidence.activeLeaseCount) || !isNonNegativeInteger(evidence.runningAttemptCount) ||
        evidence.resultingRuntimeRevision <= (context.expectedRuntimeRevision as number) ||
        evidence.intakeStopped !== true || evidence.activeWorkAllowedToConverge !== true || evidence.workersKilled !== false) {
      pushPipelineOperationalActionV1Issue(issues, "successEvidence", "inconsistent_result", "Drain success must report draining mode/revision, convergence, and no worker kill.");
    }
  } else if (evidence.packetId !== record.targetId || evidence.activeLeaseTransferred !== false || evidence.workerLaunched !== false ||
      evidence.linkedWorkItemId !== context.linkedWorkItemId || evidence.previousOwnerId !== context.expectedCurrentOwnerId ||
      evidence.newOwnerId !== context.newOwnerId || evidence.resultingPacketCurrentEventId === context.expectedPacketCurrentEventId ||
      !isSafeOperationalActionV1Identifier(evidence.resultingPacketCurrentEventId, OPERATIONAL_ACTION_V1_ID_LENGTHS.packetEvent)) {
    pushPipelineOperationalActionV1Issue(issues, "successEvidence", "inconsistent_result", "Reassign success must report changed ownership without lease transfer or worker launch.");
  }
}

function isPipelineOperationalActionIdV1(value: unknown): value is PipelineOperationalActionIdV1 {
  return typeof value === "string" && (PIPELINE_OPERATIONAL_ACTION_V1_IDS as readonly string[]).includes(value);
}

function pipelineOperationalActionV1Record(
  value: unknown,
  issues: PipelineOperationalActionValidationIssueV1[],
  field = "request",
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    pushPipelineOperationalActionV1Issue(issues, field, "invalid_contract", "V1 operational action value must be an object.");
    return {};
  }
  return value as Record<string, unknown>;
}

function pushPipelineOperationalActionV1Issue(
  issues: PipelineOperationalActionValidationIssueV1[],
  field: string,
  code: PipelineOperationalActionValidationIssueV1["code"],
  summary: string,
): void {
  issues.push({ field, code, summary });
}

function pipelineOperationalActionV1Timestamp(value: unknown): number {
  if (typeof value !== "string") return NaN;
  const match = EPIC_25_RFC3339_TIMESTAMP.exec(value);
  if (!match) return NaN;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (year < 1 || month < 1 || month > 12) return NaN;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > daysInMonth[month - 1]) return NaN;
  return Date.parse(value);
}

function isSafeOperationalActionV1Identifier(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength && isSafeOperationalIdentifierText(value);
}

function validatePipelineOperationalActionV1Actor(
  issues: PipelineOperationalActionValidationIssueV1[],
  value: unknown,
  field: string,
): void {
  const actor = pipelineOperationalActionV1Record(value, issues, field);
  if (Object.keys(actor).some((key) => !["actorType", "actorId", "actorLabel"].includes(key)) ||
      !isOneOfString(actor.actorType, ["system", "operator", "manager", "worker"])) {
    pushPipelineOperationalActionV1Issue(issues, field, "wrong_actor", "V1 requests require one exact accountable actor.");
  }
  const actorIdValid = actor.actorId === undefined || actor.actorId === null ||
    isSafeOperationalActionV1Identifier(actor.actorId, OPERATIONAL_ACTION_V1_ID_LENGTHS.owner);
  const actorLabelValid = actor.actorLabel === undefined || actor.actorLabel === null ||
    (typeof actor.actorLabel === "string" && isSafeOperationalMetadataText(actor.actorLabel));
  if (!actorIdValid || !actorLabelValid || (actor.actorId == null && actor.actorLabel == null)) {
    pushPipelineOperationalActionV1Issue(issues, field, "wrong_actor", "V1 actor id/label must be safe and at least one identity field is required.");
  }
}

function samePipelineOperationalActionV1Actor(left: unknown, right: unknown): boolean {
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const leftActor = left as Record<string, unknown>;
  const rightActor = right as Record<string, unknown>;
  return leftActor.actorType === rightActor.actorType && leftActor.actorId === rightActor.actorId && leftActor.actorLabel === rightActor.actorLabel;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function pipelineOperationalActionSha256HexV1(value: string): string {
  const constants = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const bytes = new TextEncoder().encode(value);
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = bytes.length * 8;
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);
  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const words = new Uint32Array(64);
  const rotateRight = (word: number, bits: number) => (word >>> bits) | (word << (32 - bits));
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 64; index += 1) {
      const sigma0 = rotateRight(words[index - 15], 7) ^ rotateRight(words[index - 15], 18) ^ (words[index - 15] >>> 3);
      const sigma1 = rotateRight(words[index - 2], 17) ^ rotateRight(words[index - 2], 19) ^ (words[index - 2] >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 = (h + sum1 + choice + constants[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  }
  return Array.from(state, (word) => word.toString(16).padStart(8, "0")).join("");
}

export function validatePipelineOperationalRuntimeReadinessV0(readiness: unknown): PipelineOperationalActionValidationIssueV0[] {
  const issues: PipelineOperationalActionValidationIssueV0[] = [];
  const record = operationalActionRecord(readiness, issues);
  pushUnknownFieldIssues(issues, record, OPERATIONAL_RUNTIME_READINESS_KEYS);
  validateOperationalSchemaAndRetention(issues, record, PIPELINE_OPERATIONAL_RUNTIME_READINESS_SCHEMA_VERSION, true);
  if (record.actionSchemaVersion !== PIPELINE_OPERATIONAL_ACTION_SCHEMA_VERSION) {
    issues.push({ field: "actionSchemaVersion", code: "bad_schema_version", summary: "Operational runtime readiness requires the current action schema version." });
  }
  if (!isPipelineOperationalActionEvidenceRefsV0(record.evidenceRefs)) {
    issues.push({ field: "evidenceRefs", code: "evidence_required", summary: "Operational runtime readiness requires safe metadata evidence refs." });
  }
  pushEnumIssue(issues, "readinessState", record.readinessState, PIPELINE_OPERATIONAL_RUNTIME_READINESS_STATES);
  pushEnumIssue(issues, "operationalMode", record.operationalMode, PIPELINE_OPERATIONAL_RUNTIME_MODES);
  pushEnumIssue(issues, "freshnessState", record.freshnessState, ["live", "stale", "unavailable", "unknown"]);
  pushEnumIssue(issues, "capabilityState", record.capabilityState, PIPELINE_OPERATIONAL_ACTION_CAPABILITY_STATES);
  pushTypedReasonIssue(issues, "typedReason", record.typedReason);
  if (typeof record.summary !== "string" || !isSafeOperationalMetadataText(record.summary)) {
    issues.push({
      field: "summary",
      code: "unsafe_metadata_retention",
      summary: "Operational runtime readiness summaries must be non-empty safe metadata text.",
    });
  }
  const checkedAtMs = typeof record.checkedAt === "string" ? Date.parse(record.checkedAt) : NaN;
  const expiresAtMs = typeof record.expiresAt === "string" ? Date.parse(record.expiresAt) : NaN;
  const nowMs = Date.now();
  const freshnessState = typeof record.freshnessState === "string" ? record.freshnessState : "";
  if (
    !Number.isFinite(checkedAtMs) ||
    !Number.isFinite(expiresAtMs) ||
    checkedAtMs > expiresAtMs ||
    checkedAtMs > nowMs + OPERATIONAL_ACTION_READINESS_ALLOWED_FUTURE_SKEW_MS ||
    expiresAtMs - checkedAtMs > OPERATIONAL_ACTION_READINESS_MAX_TTL_MS ||
    expiresAtMs <= nowMs ||
    (record.readinessState === "ready" && freshnessState !== "live")
  ) {
    issues.push({
      field: "checkedAt",
      code: "stale_or_unparseable_readiness",
      summary: "Operational runtime readiness requires parseable fresh checkedAt/expiresAt evidence.",
    });
  }
  if (record.readinessState === "ready" && record.capabilityState === "available" && record.typedReason !== null) {
    issues.push({
      field: "typedReason",
      code: "inconsistent_result",
      summary: "Ready operational runtime readiness must not carry failure typed reasons.",
    });
  }
  if (record.readinessState === "ready" && record.capabilityState !== "available") {
    issues.push({
      field: "capabilityState",
      code: "inconsistent_result",
      summary: "Ready operational runtime readiness requires available capability.",
    });
  }
  if (record.capabilityState === "available" && (record.readinessState !== "ready" || freshnessState !== "live")) {
    issues.push({
      field: "capabilityState",
      code: "inconsistent_result",
      summary: "Available aggregate operational capability requires ready runtime readiness and live freshness.",
    });
  }
  if (record.readinessState === "ready" && isOneOfString(record.operationalMode, ["disabled", "unavailable"])) {
    issues.push({
      field: "operationalMode",
      code: "inconsistent_result",
      summary: "Ready operational runtime readiness cannot use disabled or unavailable operational mode.",
    });
  }
  if (
    (isOneOfString(record.readinessState, ["degraded", "blocked", "unavailable"]) ||
      isOneOfString(record.operationalMode, ["disabled", "unavailable"]) ||
      ["stale", "unavailable"].includes(freshnessState) ||
      record.readinessState === "unknown" ||
      record.operationalMode === "unknown" ||
      freshnessState === "unknown" ||
      isOneOfString(record.capabilityState, ["gated", "unavailable", "simulated"])) &&
    !isKnownOperationalTypedReason(record.typedReason)
  ) {
    issues.push({
      field: "typedReason",
      code: "inconsistent_result",
      summary: "Degraded, blocked, unavailable, gated, or simulated operational runtime readiness requires a typed reason.",
    });
  }
  const actionCapabilities = safeOperationalArrayValues(issues, record.actionCapabilities, "actionCapabilities");
  if (!actionCapabilities) {
    issues.push({
      field: "actionCapabilities",
      code: "invalid_enum",
      summary: "Operational runtime readiness requires an actionCapabilities array.",
    });
  } else {
    for (const [index, capability] of actionCapabilities.entries()) {
      for (const issue of validatePipelineOperationalActionCapabilityV0(capability)) {
        issues.push({ ...issue, field: `actionCapabilities.${index}.${issue.field}` });
      }
    }
    pushReadinessCapabilityCoverageIssues(issues, actionCapabilities);
    pushReadinessAvailableCapabilityIssues(issues, record, actionCapabilities);
    pushReadinessOperationalModeCapabilityIssues(issues, record, actionCapabilities);
  }
  return issues;
}

export function validatePipelineOperationalReadinessContractV0(contract: unknown): PipelineOperationalActionValidationIssueV0[] {
  const issues: PipelineOperationalActionValidationIssueV0[] = [];
  const record = operationalActionRecord(contract, issues);
  const allowed = new Set([
    "schemaVersion", "evidenceClass", "observedEvidenceAttestation", "target", "backendTruth", "authorityState", "riskTier", "sliSlo", "telemetry",
    "configuration", "recovery", "gates", "outcome", "typedBlockers", "checkedAt", "expiresAt",
    "metadataOnly", "rawPayloadRetained",
  ]);
  pushUnknownFieldIssues(issues, record, allowed);
  if (record.schemaVersion !== PIPELINE_OPERATIONAL_READINESS_CONTRACT_SCHEMA_VERSION) {
    issues.push({ field: "schemaVersion", code: "bad_schema_version", summary: "Readiness contract uses an unsupported schema version." });
  }
  if (record.metadataOnly !== true || record.rawPayloadRetained !== false) {
    issues.push({ field: "metadataOnly", code: "bad_retention_flag", summary: "Readiness contract must be metadata-only and retain no raw payloads." });
  }
  pushEnumIssue(issues, "backendTruth", record.backendTruth, PIPELINE_OPERATIONAL_READINESS_BACKEND_TRUTHS);
  pushEnumIssue(issues, "authorityState", record.authorityState, PIPELINE_OPERATIONAL_ACTION_AUTHORITY_STATES);
  pushEnumIssue(issues, "riskTier", record.riskTier, PIPELINE_OPERATIONAL_ACTION_RISK_TIERS);
  pushEnumIssue(issues, "outcome", record.outcome, PIPELINE_OPERATIONAL_READINESS_OUTCOMES);
  const target = operationalActionRecord(record.target, issues, "target");
  for (const field of ["workerId", "assignmentId", "owner", "runId"] as const) {
    if (typeof target[field] !== "string" || !isSafeOperationalIdentifierText(target[field])) {
      issues.push({ field: `target.${field}`, code: "blank_identifier", summary: "Readiness target identity must be exact safe metadata." });
    }
  }
  for (const field of ["sourceRefs", "evidenceRefs"] as const) {
    if (!isPipelineOperationalActionEvidenceRefsV0(target[field])) {
      issues.push({ field: `target.${field}`, code: "evidence_required", summary: "Readiness target requires safe source/evidence refs." });
    }
  }
  const gates = safeOperationalArrayValues(issues, record.gates, "gates");
  if (!gates) {
    issues.push({ field: "gates", code: "invalid_enum", summary: "Readiness contract requires a gate array." });
  } else {
    const seen = new Set<string>();
    for (const [index, gateValue] of gates.entries()) {
      const gate = operationalActionRecord(gateValue, issues, `gates.${index}`);
      if (typeof gate.gateId !== "string" || !isSafeOperationalIdentifierText(gate.gateId) || seen.has(gate.gateId)) {
        issues.push({ field: `gates.${index}.gateId`, code: "invalid_enum", summary: "Readiness gates require unique safe ids." });
      }
      if (typeof gate.gateId === "string") seen.add(gate.gateId);
      pushEnumIssue(issues, `gates.${index}.state`, gate.state, PIPELINE_OPERATIONAL_READINESS_GATE_STATES);
      if (gate.typedReason !== null && !isOneOfString(gate.typedReason, PIPELINE_OPERATIONAL_READINESS_REASONS)) {
        issues.push({ field: `gates.${index}.typedReason`, code: "invalid_enum", summary: "Readiness gate reason is not recognized." });
      }
      if (typeof gate.nextAction !== "string" || !isSafeOperationalMetadataText(gate.nextAction)) {
        issues.push({ field: `gates.${index}.nextAction`, code: "unsafe_metadata_retention", summary: "Readiness gate next action must be safe metadata." });
      }
      if (!isPipelineOperationalActionEvidenceRefsV0(gate.evidenceRefs)) {
        issues.push({ field: `gates.${index}.evidenceRefs`, code: "evidence_required", summary: "Readiness gate requires safe evidence refs." });
      }
    }
  }
  const checkedAtMs = typeof record.checkedAt === "string" ? Date.parse(record.checkedAt) : NaN;
  const expiresAtMs = typeof record.expiresAt === "string" ? Date.parse(record.expiresAt) : NaN;
  if (!Number.isFinite(checkedAtMs) || !Number.isFinite(expiresAtMs) || expiresAtMs <= checkedAtMs || expiresAtMs - checkedAtMs > OPERATIONAL_ACTION_READINESS_MAX_TTL_MS || checkedAtMs > Date.now() + OPERATIONAL_ACTION_READINESS_ALLOWED_FUTURE_SKEW_MS) {
    issues.push({ field: "checkedAt", code: "stale_or_unparseable_readiness", summary: "Readiness contract timestamps must be fresh and within the five-minute TTL." });
  }
  if (!Array.isArray(record.sliSlo) || record.sliSlo.length === 0) {
    issues.push({ field: "sliSlo", code: "evidence_required", summary: "Readiness contract requires explicit SLI/SLO thresholds." });
  }
  const telemetry = operationalActionRecord(record.telemetry, issues, "telemetry");
  if (typeof telemetry.source !== "string" || !isSafeOperationalIdentifierText(telemetry.source) || telemetry.alertReady !== true) {
    issues.push({ field: "telemetry", code: "inconsistent_result", summary: "Readiness telemetry and alert coverage must be explicit and ready." });
  }
  const configuration = operationalActionRecord(record.configuration, issues, "configuration");
  if (configuration.noValueRetention !== true || !Array.isArray(configuration.names) || configuration.validationState !== "pass") {
    issues.push({ field: "configuration", code: "policy_violation", summary: "Configuration readiness must pass with allowlisted names and no value retention." });
  }
  const recovery = operationalActionRecord(record.recovery, issues, "recovery");
  for (const field of ["owner", "rollbackPath", "remediationAction", "recheckAt", "expiryAt"] as const) {
    if (typeof recovery[field] !== "string" || !isSafeOperationalMetadataText(recovery[field])) {
      issues.push({ field: `recovery.${field}`, code: "policy_violation", summary: "Recovery and rollback metadata is required." });
    }
  }
  const blockers = Array.isArray(record.typedBlockers) ? record.typedBlockers : [];
  if (record.outcome === "go" && blockers.length > 0) {
    issues.push({ field: "typedBlockers", code: "inconsistent_result", summary: "A go readiness outcome cannot contain blockers." });
  }
  if (record.outcome === "go" && gates?.some((gateValue) => (gateValue as Record<string, unknown>)?.state !== "pass")) {
    issues.push({ field: "gates", code: "inconsistent_result", summary: "A go readiness outcome requires every readiness gate to pass." });
  }
  if (record.outcome === "go" && record.backendTruth !== "live") {
    issues.push({ field: "backendTruth", code: "inconsistent_result", summary: "Go requires proven live backend truth." });
  }
  if (record.outcome === "go" && record.evidenceClass !== "live_observed") {
    issues.push({ field: "evidenceClass", code: "policy_violation", summary: "Go requires a target-bound independently observed live attestation." });
  }
  validatePipelineObservedEvidenceProvenanceV0(issues, record, PIPELINE_OPERATIONAL_READINESS_CONTRACT_SCHEMA_VERSION, checkedAtMs);
  return issues;
}

function pipelineObservedTargetRef(record: Record<string, unknown>): string {
  const target = record.target as Record<string, unknown> | undefined;
  const owner = typeof target?.owner === "string" && isSafeOperationalIdentifierText(target.owner) ? target.owner : "";
  const workerId = typeof target?.workerId === "string" && isSafeOperationalIdentifierText(target.workerId) ? target.workerId : "";
  if (owner && (!workerId || owner === workerId || owner.endsWith(`/${workerId}`))) return owner;
  return owner && workerId ? `${owner}/${workerId}` : owner || workerId;
}

function hasOnlyOperationalKeys(value: unknown, allowed: Set<string>): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every((key) => allowed.has(key)));
}

function validatePipelineObservedEvidenceProvenanceV0(
  issues: PipelineOperationalActionValidationIssueV0[],
  record: Record<string, unknown>,
  packetSchemaVersion: string,
  checkedAtMs: number,
): void {
  pushEnumIssue(issues, "evidenceClass", record.evidenceClass, PIPELINE_OPERATIONAL_EVIDENCE_CLASSES);
  if (record.evidenceClass !== "live_observed") {
    if (record.observedEvidenceAttestation != null) {
      issues.push({ field: "observedEvidenceAttestation", code: "inconsistent_result", summary: "Fixture and integrated-local packets cannot carry promotion-grade observation attestations." });
    }
    return;
  }
  const value = record.observedEvidenceAttestation;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    issues.push({ field: "observedEvidenceAttestation", code: "evidence_required", summary: "Live-observed evidence requires an independent observation attestation." });
    return;
  }
  const attestation = value as Record<string, unknown>;
  const observer = attestation.observer as Record<string, unknown> | undefined;
  const subject = attestation.subject as Record<string, unknown> | undefined;
  const receipt = attestation.receipt as Record<string, unknown> | undefined;
  const expectedTargetRef = pipelineObservedTargetRef(record);
  if (attestation.schemaVersion !== PIPELINE_OBSERVED_EVIDENCE_ATTESTATION_SCHEMA_VERSION || attestation.evidenceClass !== "live_observed" ||
      attestation.metadataOnly !== true || attestation.rawPayloadRetained !== false || typeof attestation.attestationId !== "string" ||
      !hasOnlyOperationalKeys(attestation, new Set(["schemaVersion", "attestationId", "evidenceClass", "observer", "subject", "receipt", "metadataOnly", "rawPayloadRetained"])) ||
      !hasOnlyOperationalKeys(observer, new Set(["observerType", "observerId"])) ||
      !hasOnlyOperationalKeys(subject, new Set(["packetSchemaVersion", "targetRef"])) ||
      !hasOnlyOperationalKeys(receipt, new Set(["receiptId", "observedAt", "issuedAt", "expiresAt", "evidenceDigestSha256", "sourceRefs", "evidenceRefs"])) ||
      !isSafeOperationalIdentifierText(attestation.attestationId) || observer?.observerType !== "independent_runtime" ||
      typeof observer?.observerId !== "string" || !isSafeOperationalIdentifierText(observer.observerId) ||
      subject?.packetSchemaVersion !== packetSchemaVersion || typeof subject?.targetRef !== "string" || !isSafeOperationalIdentifierText(subject.targetRef) ||
      (expectedTargetRef && subject.targetRef !== expectedTargetRef) ||
      typeof receipt?.receiptId !== "string" || !isSafeOperationalIdentifierText(receipt.receiptId) ||
      typeof receipt?.evidenceDigestSha256 !== "string" || !/^sha256:[0-9a-f]{64}$/.test(receipt.evidenceDigestSha256) ||
      !isPipelineOperationalActionEvidenceRefsV0(receipt?.sourceRefs) || !isPipelineOperationalActionEvidenceRefsV0(receipt?.evidenceRefs)) {
    issues.push({ field: "observedEvidenceAttestation", code: "inconsistent_result", summary: "The observation attestation must be metadata-only, independently issued, digest-bound, and bound to this packet schema." });
    return;
  }
  const observedAtMs = typeof receipt.observedAt === "string" ? Date.parse(receipt.observedAt) : NaN;
  const issuedAtMs = typeof receipt.issuedAt === "string" ? Date.parse(receipt.issuedAt) : NaN;
  const expiresAtMs = typeof receipt.expiresAt === "string" ? Date.parse(receipt.expiresAt) : NaN;
  if (!Number.isFinite(observedAtMs) || !Number.isFinite(issuedAtMs) || !Number.isFinite(expiresAtMs) || !Number.isFinite(checkedAtMs) ||
      observedAtMs > issuedAtMs || issuedAtMs > expiresAtMs || issuedAtMs > checkedAtMs + OPERATIONAL_ACTION_READINESS_ALLOWED_FUTURE_SKEW_MS ||
      expiresAtMs < checkedAtMs || checkedAtMs - observedAtMs > OPERATIONAL_ACTION_READINESS_MAX_TTL_MS ||
      expiresAtMs - issuedAtMs > OPERATIONAL_ACTION_READINESS_MAX_TTL_MS) {
    issues.push({ field: "observedEvidenceAttestation.receipt", code: "stale_or_unparseable_readiness", summary: "The independent observation receipt is stale, expired, future-dated, or malformed." });
  }
  const target = record.target as Record<string, unknown> | undefined;
  const packetSourceRefs = Array.isArray(record.sourceRefs) ? record.sourceRefs : Array.isArray(target?.sourceRefs) ? target.sourceRefs : [];
  const packetEvidenceRefs = Array.isArray(record.evidenceRefs) ? record.evidenceRefs : Array.isArray(target?.evidenceRefs) ? target.evidenceRefs : [];
  if (!(receipt.sourceRefs as unknown[]).some((ref) => packetSourceRefs.includes(ref)) ||
      !(receipt.evidenceRefs as unknown[]).some((ref) => packetEvidenceRefs.includes(ref))) {
    issues.push({ field: "observedEvidenceAttestation.receipt", code: "inconsistent_result", summary: "The observation receipt must share source and evidence refs with the packet it attests." });
  }
}

export function validatePipelineOneWorkerLiveCanaryEvidenceV0(evidence: unknown): PipelineOperationalActionValidationIssueV0[] {
  const issues: PipelineOperationalActionValidationIssueV0[] = [];
  const record = operationalActionRecord(evidence, issues);
  if (record.schemaVersion !== PIPELINE_ONE_WORKER_LIVE_CANARY_SCHEMA_VERSION) {
    issues.push({ field: "schemaVersion", code: "bad_schema_version", summary: "One-worker canary evidence uses an unsupported schema version." });
  }
  if (record.metadataOnly !== true || record.rawPayloadRetained !== false) {
    issues.push({ field: "metadataOnly", code: "bad_retention_flag", summary: "One-worker canary evidence must be metadata-only and retain no raw payloads." });
  }
  pushEnumIssue(issues, "backendTruth", record.backendTruth, PIPELINE_OPERATIONAL_READINESS_BACKEND_TRUTHS);
  pushEnumIssue(issues, "outcome", record.outcome, PIPELINE_ONE_WORKER_LIVE_CANARY_OUTCOMES);
  if (record.workerCount !== 1) issues.push({ field: "workerCount", code: "invalid_enum", summary: "Canary evidence must cover exactly one worker." });
  const target = operationalActionRecord(record.target, issues, "target");
  for (const field of ["workerId", "assignmentId", "owner", "runId"] as const) {
    if (typeof target[field] !== "string" || !isSafeOperationalIdentifierText(target[field])) {
      issues.push({ field: `target.${field}`, code: "blank_identifier", summary: "Canary target identity must be exact safe metadata." });
    }
  }
  for (const field of ["sourceRefs", "evidenceRefs"] as const) {
    if (!isPipelineOperationalActionEvidenceRefsV0(target[field])) {
      issues.push({ field: `target.${field}`, code: "evidence_required", summary: "Canary target requires safe source/evidence refs." });
    }
  }
  const measurements = operationalActionRecord(record.measurements, issues, "measurements");
  for (const field of ["latencyMs", "errorCount", "cpuPercent", "memoryPercent", "diskPercent", "costCents"] as const) {
    if (measurements[field] !== null && (typeof measurements[field] !== "number" || measurements[field] < 0)) {
      issues.push({ field: `measurements.${field}`, code: "invalid_enum", summary: "Canary measurements must be non-negative numeric metadata." });
    }
  }
  const gates = safeOperationalArrayValues(issues, record.gates, "gates");
  if (!gates || gates.length < 10) issues.push({ field: "gates", code: "evidence_required", summary: "Canary evidence requires its bounded gate set." });
  const checkedAtMs = typeof record.checkedAt === "string" ? Date.parse(record.checkedAt) : NaN;
  const expiresAtMs = typeof record.expiresAt === "string" ? Date.parse(record.expiresAt) : NaN;
  if (!Number.isFinite(checkedAtMs) || !Number.isFinite(expiresAtMs) || expiresAtMs <= checkedAtMs || expiresAtMs - checkedAtMs > OPERATIONAL_ACTION_READINESS_MAX_TTL_MS) {
    issues.push({ field: "checkedAt", code: "stale_or_unparseable_readiness", summary: "Canary evidence timestamps must be fresh and bounded." });
  }
  validatePipelineObservedEvidenceProvenanceV0(issues, record, PIPELINE_ONE_WORKER_LIVE_CANARY_SCHEMA_VERSION, checkedAtMs);
  if (record.outcome === "pass" && (record.backendTruth !== "live" || record.evidenceClass !== "live_observed" || record.rampAllowed !== true || !Array.isArray(record.typedBlockers) || record.typedBlockers.length > 0)) {
    issues.push({ field: "outcome", code: "inconsistent_result", summary: "A passing canary requires live truth, ramp permission, and no blockers." });
  }
  const recovery = record.recovery as Record<string, unknown> | undefined;
  if (record.outcome === "stop" && recovery?.required !== true) {
    issues.push({ field: "recovery", code: "policy_violation", summary: "A stopped canary requires rollback metadata." });
  }
  return issues;
}

export function validatePipelineLiveCapacityRampEvidenceV0(evidence: unknown): PipelineOperationalActionValidationIssueV0[] {
  const issues: PipelineOperationalActionValidationIssueV0[] = [];
  const record = operationalActionRecord(evidence, issues);
  if (record.schemaVersion !== PIPELINE_LIVE_CAPACITY_RAMP_SCHEMA_VERSION) {
    issues.push({ field: "schemaVersion", code: "bad_schema_version", summary: "Live capacity ramp evidence uses an unsupported schema version." });
  }
  if (record.metadataOnly !== true || record.rawPayloadRetained !== false || record.rolloutAllowed !== false) {
    issues.push({ field: "metadataOnly", code: "bad_retention_flag", summary: "Ramp evidence must remain metadata-only with rollout disabled." });
  }
  pushEnumIssue(issues, "outcome", record.outcome, PIPELINE_LIVE_CAPACITY_RAMP_OUTCOMES);
  const stages = safeOperationalArrayValues(issues, record.stages, "stages");
  if (!stages || stages.length === 0) issues.push({ field: "stages", code: "evidence_required", summary: "Ramp evidence requires ordered stage records." });
  for (const [index, stageValue] of (stages || []).entries()) {
    const stage = operationalActionRecord(stageValue, issues, `stages.${index}`);
    if (typeof stage.stageId !== "string" || !isSafeOperationalIdentifierText(stage.stageId)) issues.push({ field: `stages.${index}.stageId`, code: "blank_identifier", summary: "Ramp stage ids must be safe metadata." });
    if (typeof stage.owner !== "string" || !isSafeOperationalIdentifierText(stage.owner)) issues.push({ field: `stages.${index}.owner`, code: "blank_identifier", summary: "Ramp stages require an owner." });
    if (!Array.isArray(stage.evidenceRefs) || !isPipelineOperationalActionEvidenceRefsV0(stage.evidenceRefs)) issues.push({ field: `stages.${index}.evidenceRefs`, code: "evidence_required", summary: "Ramp stages require safe evidence refs." });
  }
  for (const field of ["sourceRefs", "evidenceRefs"] as const) {
    if (!Array.isArray(record[field]) || record[field].length === 0 || !isPipelineOperationalActionEvidenceRefsV0(record[field])) issues.push({ field, code: "evidence_required", summary: "Ramp evidence requires safe source/evidence refs." });
  }
  if (typeof record.nextManagerAction !== "string" || !isSafeOperationalMetadataText(record.nextManagerAction)) issues.push({ field: "nextManagerAction", code: "unsafe_metadata_retention", summary: "Ramp evidence requires a safe next manager action." });
  const checkedAtMs = typeof record.checkedAt === "string" ? Date.parse(record.checkedAt) : NaN;
  const expiresAtMs = typeof record.expiresAt === "string" ? Date.parse(record.expiresAt) : NaN;
  if (!Number.isFinite(checkedAtMs) || !Number.isFinite(expiresAtMs) || expiresAtMs <= checkedAtMs || expiresAtMs - checkedAtMs > OPERATIONAL_ACTION_READINESS_MAX_TTL_MS) issues.push({ field: "checkedAt", code: "stale_or_unparseable_readiness", summary: "Ramp evidence timestamps must be fresh and bounded." });
  validatePipelineObservedEvidenceProvenanceV0(issues, record, PIPELINE_LIVE_CAPACITY_RAMP_SCHEMA_VERSION, checkedAtMs);
  if (record.outcome === "pass" && (record.evidenceClass !== "live_observed" || record.canaryOutcome !== "pass" || record.scaleEvidenceReady !== true || record.rolloutAllowed !== false || !Array.isArray(record.typedBlockers) || record.typedBlockers.length > 0)) issues.push({ field: "outcome", code: "inconsistent_result", summary: "A passing ramp requires a passing canary, independently observed stage evidence, no blockers, and rollout disabled." });
  const recovery = record.recovery as Record<string, unknown> | undefined;
  if (record.outcome === "stop" && recovery?.required !== true) issues.push({ field: "recovery", code: "policy_violation", summary: "A stopped ramp requires rollback metadata." });
  return issues;
}

export function validatePipelineResilienceRecoveryEvidenceV0(evidence: unknown): PipelineOperationalActionValidationIssueV0[] {
  const issues: PipelineOperationalActionValidationIssueV0[] = [];
  const record = operationalActionRecord(evidence, issues);
  if (record.schemaVersion !== PIPELINE_RESILIENCE_RECOVERY_SCHEMA_VERSION) issues.push({ field: "schemaVersion", code: "bad_schema_version", summary: "Resilience/recovery evidence uses an unsupported schema version." });
  if (record.metadataOnly !== true || record.rawPayloadRetained !== false || record.rolloutAllowed !== false) issues.push({ field: "metadataOnly", code: "bad_retention_flag", summary: "Recovery evidence must remain metadata-only with rollout disabled." });
  pushEnumIssue(issues, "outcome", record.outcome, PIPELINE_RESILIENCE_RECOVERY_OUTCOMES);
  const drills = safeOperationalArrayValues(issues, record.drills, "drills");
  if (!drills || drills.length === 0) issues.push({ field: "drills", code: "evidence_required", summary: "Recovery evidence requires drill records." });
  for (const [index, drillValue] of (drills || []).entries()) {
    const drill = operationalActionRecord(drillValue, issues, `drills.${index}`);
    if (typeof drill.drillId !== "string" || !isSafeOperationalIdentifierText(drill.drillId)) issues.push({ field: `drills.${index}.drillId`, code: "blank_identifier", summary: "Recovery drill ids must be safe metadata." });
    if (typeof drill.owner !== "string" || !isSafeOperationalIdentifierText(drill.owner)) issues.push({ field: `drills.${index}.owner`, code: "blank_identifier", summary: "Recovery drills require an owner." });
    if (!Array.isArray(drill.evidenceRefs) || !isPipelineOperationalActionEvidenceRefsV0(drill.evidenceRefs)) issues.push({ field: `drills.${index}.evidenceRefs`, code: "evidence_required", summary: "Recovery drills require safe evidence refs." });
  }
  for (const field of ["sourceRefs", "evidenceRefs"] as const) {
    if (!Array.isArray(record[field]) || record[field].length === 0 || !isPipelineOperationalActionEvidenceRefsV0(record[field])) issues.push({ field, code: "evidence_required", summary: "Recovery evidence requires safe source/evidence refs." });
  }
  if (typeof record.nextManagerAction !== "string" || !isSafeOperationalMetadataText(record.nextManagerAction)) issues.push({ field: "nextManagerAction", code: "unsafe_metadata_retention", summary: "Recovery evidence requires a safe next manager action." });
  const checkedAtMs = typeof record.checkedAt === "string" ? Date.parse(record.checkedAt) : NaN;
  const expiresAtMs = typeof record.expiresAt === "string" ? Date.parse(record.expiresAt) : NaN;
  if (!Number.isFinite(checkedAtMs) || !Number.isFinite(expiresAtMs) || expiresAtMs <= checkedAtMs || expiresAtMs - checkedAtMs > OPERATIONAL_ACTION_READINESS_MAX_TTL_MS) issues.push({ field: "checkedAt", code: "stale_or_unparseable_readiness", summary: "Recovery evidence timestamps must be fresh and bounded." });
  validatePipelineObservedEvidenceProvenanceV0(issues, record, PIPELINE_RESILIENCE_RECOVERY_SCHEMA_VERSION, checkedAtMs);
  if (record.outcome === "pass" && (record.evidenceClass !== "live_observed" || record.reliabilityEvidenceReady !== true || record.rolloutAllowed !== false || !Array.isArray(record.typedBlockers) || record.typedBlockers.length > 0)) issues.push({ field: "outcome", code: "inconsistent_result", summary: "Passing recovery evidence requires independently observed complete drills, no blockers, and rollout disabled." });
  const recovery = record.recovery as Record<string, unknown> | undefined;
  if (record.outcome === "stop" && recovery?.required !== true) issues.push({ field: "recovery", code: "policy_violation", summary: "A stopped recovery validation requires rollback metadata." });
  return issues;
}

export function validatePipelineOperationalHardeningEvidenceV0(evidence: unknown): PipelineOperationalActionValidationIssueV0[] {
  const issues: PipelineOperationalActionValidationIssueV0[] = [];
  const record = operationalActionRecord(evidence, issues);
  if (record.schemaVersion !== PIPELINE_OPERATIONAL_HARDENING_SCHEMA_VERSION) issues.push({ field: "schemaVersion", code: "bad_schema_version", summary: "Operational hardening evidence uses an unsupported schema version." });
  if (record.metadataOnly !== true || record.rawPayloadRetained !== false || record.rolloutAllowed !== false) issues.push({ field: "metadataOnly", code: "bad_retention_flag", summary: "Hardening evidence must remain metadata-only with rollout disabled." });
  pushEnumIssue(issues, "outcome", record.outcome, PIPELINE_OPERATIONAL_HARDENING_OUTCOMES);
  const domains = safeOperationalArrayValues(issues, record.domains, "domains");
  if (!domains || domains.length !== 10) issues.push({ field: "domains", code: "evidence_required", summary: "Hardening evidence requires all ten operational domains." });
  for (const [index, domainValue] of (domains || []).entries()) {
    const domain = operationalActionRecord(domainValue, issues, `domains.${index}`);
    for (const field of ["domain", "owner", "trigger", "evidenceGate", "recoveryAction"] as const) {
      if (typeof domain[field] !== "string" || !isSafeOperationalMetadataText(domain[field])) issues.push({ field: `domains.${index}.${field}`, code: "evidence_required", summary: "Hardening domains require safe owner, trigger, gate, and recovery metadata." });
    }
    if (!Array.isArray(domain.evidenceRefs) || !isPipelineOperationalActionEvidenceRefsV0(domain.evidenceRefs)) issues.push({ field: `domains.${index}.evidenceRefs`, code: "evidence_required", summary: "Hardening domains require safe evidence refs." });
  }
  for (const field of ["sourceRefs", "evidenceRefs"] as const) {
    if (!Array.isArray(record[field]) || record[field].length === 0 || !isPipelineOperationalActionEvidenceRefsV0(record[field])) issues.push({ field, code: "evidence_required", summary: "Hardening evidence requires safe source/evidence refs." });
  }
  if (typeof record.nextManagerAction !== "string" || !isSafeOperationalMetadataText(record.nextManagerAction)) issues.push({ field: "nextManagerAction", code: "unsafe_metadata_retention", summary: "Hardening evidence requires a safe next manager action." });
  const checkedAtMs = typeof record.checkedAt === "string" ? Date.parse(record.checkedAt) : NaN;
  const expiresAtMs = typeof record.expiresAt === "string" ? Date.parse(record.expiresAt) : NaN;
  if (!Number.isFinite(checkedAtMs) || !Number.isFinite(expiresAtMs) || expiresAtMs <= checkedAtMs || expiresAtMs - checkedAtMs > OPERATIONAL_ACTION_READINESS_MAX_TTL_MS) issues.push({ field: "checkedAt", code: "stale_or_unparseable_readiness", summary: "Hardening evidence timestamps must be fresh and bounded." });
  validatePipelineObservedEvidenceProvenanceV0(issues, record, PIPELINE_OPERATIONAL_HARDENING_SCHEMA_VERSION, checkedAtMs);
  if (record.outcome === "pass" && (record.evidenceClass !== "live_observed" || record.readinessHandoffReady !== true || record.rolloutAllowed !== false || !Array.isArray(record.typedBlockers) || record.typedBlockers.length > 0)) issues.push({ field: "outcome", code: "inconsistent_result", summary: "Passing hardening evidence requires independently observed complete domains, no blockers, and rollout disabled." });
  const recovery = record.recovery as Record<string, unknown> | undefined;
  if (record.outcome === "stop" && recovery?.required !== true) issues.push({ field: "recovery", code: "policy_violation", summary: "Stopped hardening requires recovery metadata." });
  return issues;
}

export function validatePipelineProductionReadinessDecisionEvidenceV0(evidence: unknown): PipelineOperationalActionValidationIssueV0[] {
  const issues: PipelineOperationalActionValidationIssueV0[] = [];
  const record = operationalActionRecord(evidence, issues);
  const allowed = new Set([
    "schemaVersion", "decision", "rationale", "scope", "thresholds", "authority", "rollback", "owner",
    "nextManagerAction", "predecessorOutcomes", "monitoring", "stopLines", "typedBlockers", "sourceRefs",
    "evidenceRefs", "checkedAt", "expiresAt", "rolloutAllowed", "automaticDeploymentAllowed", "providerCallsAllowed",
    "secretAccessAllowed", "mergeAllowed", "cleanupAllowed", "metadataOnly", "rawPayloadRetained", "decisionSignals",
    "evidenceClass", "observedEvidenceAttestation",
  ]);
  pushUnknownFieldIssues(issues, record, allowed);
  if (record.schemaVersion !== PIPELINE_PRODUCTION_READINESS_DECISION_SCHEMA_VERSION) issues.push({ field: "schemaVersion", code: "bad_schema_version", summary: "Production readiness decision uses an unsupported schema version." });
  pushEnumIssue(issues, "decision", record.decision, PIPELINE_PRODUCTION_READINESS_DECISIONS);
  for (const field of ["rolloutAllowed", "automaticDeploymentAllowed", "providerCallsAllowed", "secretAccessAllowed", "mergeAllowed", "cleanupAllowed"] as const) {
    if (record[field] !== false) issues.push({ field, code: "policy_violation", summary: "Production readiness decisions must not authorize mutation, provider, secret, merge, or cleanup operations." });
  }
  if (record.metadataOnly !== true || record.rawPayloadRetained !== false) issues.push({ field: "metadataOnly", code: "bad_retention_flag", summary: "Production readiness decisions must be metadata-only and retain no raw payloads." });
  for (const field of ["rationale", "owner", "nextManagerAction"] as const) {
    if (typeof record[field] !== "string" || !isSafeOperationalMetadataText(record[field])) issues.push({ field, code: "evidence_required", summary: "Production readiness decisions require safe bounded metadata." });
  }
  const scope = operationalActionRecord(record.scope, issues, "scope");
  if (typeof scope.name !== "string" || !isSafeOperationalMetadataText(scope.name) || typeof scope.limited !== "boolean") issues.push({ field: "scope", code: "evidence_required", summary: "Production readiness decisions require a bounded scope." });
  const boundaries = safeOperationalArrayValues(issues, scope.boundaries, "scope.boundaries");
  if (!boundaries || boundaries.length === 0 || boundaries.some((entry) => typeof entry !== "string" || !isSafeOperationalMetadataText(entry))) issues.push({ field: "scope.boundaries", code: "evidence_required", summary: "Production readiness decisions require safe scope boundaries." });
  const thresholds = operationalActionRecord(record.thresholds, issues, "thresholds");
  for (const [name, value] of Object.entries(thresholds)) {
    if (value === null) continue;
    const threshold = operationalActionRecord(value, issues, `thresholds.${name}`);
    if (typeof threshold.name !== "string" || !isSafeOperationalIdentifierText(threshold.name) || !["lt", "lte", "gt", "gte", "eq"].includes(String(threshold.operator)) || typeof threshold.value !== "number" || !Number.isFinite(threshold.value) || typeof threshold.unit !== "string" || !isSafeOperationalIdentifierText(threshold.unit) || threshold.explicit !== true) {
      issues.push({ field: `thresholds.${name}`, code: "inconsistent_result", summary: "Production readiness thresholds must be explicit bounded metadata." });
    }
  }
  for (const field of ["sourceRefs", "evidenceRefs"] as const) {
    if (!isPipelineOperationalActionEvidenceRefsV0(record[field])) issues.push({ field, code: "evidence_required", summary: "Production readiness decisions require safe source and evidence refs." });
  }
  const monitoring = safeOperationalArrayValues(issues, record.monitoring, "monitoring");
  const stopLines = safeOperationalArrayValues(issues, record.stopLines, "stopLines");
  if (!monitoring || monitoring.length === 0 || monitoring.some((entry) => typeof entry !== "string" || !isSafeOperationalMetadataText(entry))) issues.push({ field: "monitoring", code: "evidence_required", summary: "Production readiness decisions require monitoring metadata." });
  if (!stopLines || stopLines.length === 0 || stopLines.some((entry) => typeof entry !== "string" || !isSafeOperationalMetadataText(entry))) issues.push({ field: "stopLines", code: "evidence_required", summary: "Production readiness decisions require explicit stop-lines." });
  const authority = operationalActionRecord(record.authority, issues, "authority");
  if (!isOneOfString(authority.state, ["allowed", "blocked"]) || typeof authority.proven !== "boolean" || !Array.isArray(authority.evidenceRefs) || (authority.evidenceRefs.length > 0 && !isPipelineOperationalActionEvidenceRefsV0(authority.evidenceRefs))) issues.push({ field: "authority", code: "evidence_required", summary: "Production readiness decisions require bounded authority metadata." });
  if (isOneOfString(record.decision, ["go", "limited_rollout"]) && (authority.state !== "allowed" || authority.proven !== true || !isPipelineOperationalActionEvidenceRefsV0(authority.evidenceRefs))) issues.push({ field: "authority", code: "policy_violation", summary: "Go or limited rollout requires explicit final authority evidence." });
  const rollback = operationalActionRecord(record.rollback, issues, "rollback");
  if (typeof rollback.owner !== "string" || !isSafeOperationalIdentifierText(rollback.owner) || typeof rollback.path !== "string" || !isSafeOperationalMetadataText(rollback.path) || typeof rollback.required !== "boolean" || !isPipelineOperationalActionEvidenceRefsV0(rollback.evidenceRefs)) issues.push({ field: "rollback", code: "policy_violation", summary: "Production readiness decisions require rollback owner, path, and evidence." });
  const predecessorOutcomes = operationalActionRecord(record.predecessorOutcomes, issues, "predecessorOutcomes");
  for (const id of ["canary", "ramp", "recovery", "hardening"] as const) if (typeof predecessorOutcomes[id] !== "string" || !isSafeOperationalIdentifierText(predecessorOutcomes[id])) issues.push({ field: `predecessorOutcomes.${id}`, code: "evidence_required", summary: "Production readiness decisions require every predecessor outcome." });
  const typedBlockers = safeOperationalArrayValues(issues, record.typedBlockers, "typedBlockers");
  if (!typedBlockers) issues.push({ field: "typedBlockers", code: "evidence_required", summary: "Production readiness decisions require a typed blocker array." });
  if (record.decision === "go" && (scope.limited === true || ["canary", "ramp", "recovery", "hardening"].some((id) => predecessorOutcomes[id] !== "pass") || (typedBlockers || []).length > 0)) issues.push({ field: "decision", code: "inconsistent_result", summary: "Go requires all predecessor outcomes to pass with no blockers." });
  if (record.decision === "limited_rollout" && (scope.limited !== true || !boundaries || boundaries.length === 0 || ["canary", "ramp", "recovery", "hardening"].some((id) => predecessorOutcomes[id] === "stop"))) issues.push({ field: "decision", code: "inconsistent_result", summary: "Limited rollout requires bounded scope and no stopped predecessor." });
  const signals = operationalActionRecord(record.decisionSignals, issues, "decisionSignals");
  for (const field of ["allPredecessorsPass", "authorityReady", "simulatedEvidence", "staleEvidence", "fixtureEvidence"] as const) if (typeof signals[field] !== "boolean") issues.push({ field: `decisionSignals.${field}`, code: "evidence_required", summary: "Production readiness decision signals must be explicit booleans." });
  const checkedAtMs = typeof record.checkedAt === "string" ? Date.parse(record.checkedAt) : NaN;
  const expiresAtMs = typeof record.expiresAt === "string" ? Date.parse(record.expiresAt) : NaN;
  if (!Number.isFinite(checkedAtMs) || !Number.isFinite(expiresAtMs) || expiresAtMs <= checkedAtMs || expiresAtMs - checkedAtMs > OPERATIONAL_ACTION_READINESS_MAX_TTL_MS) issues.push({ field: "checkedAt", code: "stale_or_unparseable_readiness", summary: "Production readiness decision timestamps must be fresh and bounded." });
  validatePipelineObservedEvidenceProvenanceV0(issues, record, PIPELINE_PRODUCTION_READINESS_DECISION_SCHEMA_VERSION, checkedAtMs);
  if (isOneOfString(record.decision, ["go", "limited_rollout"]) && record.evidenceClass !== "live_observed") issues.push({ field: "evidenceClass", code: "policy_violation", summary: "Go or limited rollout requires independently observed live provenance." });
  return issues;
}

export function validatePipelineEpic25EvidenceChainV0(
  evidence: unknown,
  nowMs: number = Date.now(),
): PipelineOperationalActionValidationIssueV0[] {
  return validatePipelineEpic25EvidenceChain(evidence, nowMs, false);
}

export function validatePipelineEpic25EvidenceChainV1(
  evidence: unknown,
  nowMs: number = Date.now(),
): PipelineOperationalActionValidationIssueV0[] {
  return validatePipelineEpic25EvidenceChain(evidence, nowMs, true);
}

function validatePipelineEpic25EvidenceChain(
  evidence: unknown,
  nowMs: number,
  requiresPolicyProfile: boolean,
): PipelineOperationalActionValidationIssueV0[] {
  const issues: PipelineOperationalActionValidationIssueV0[] = [];
  const record = operationalActionRecord(evidence, issues);
  pushForbiddenObjectFieldIssues(issues, record);
  const chainKeys = new Set([
    "schemaVersion", "authoritativePacketId", "evidenceClass", "packets", "checkedAt", "expiresAt",
    "executionAllowed", "providerCallsAllowed", "mutationAllowed", "metadataOnly", "rawPayloadRetained",
  ]);
  if (requiresPolicyProfile) chainKeys.add("policyProfile");
  pushUnknownFieldIssues(issues, record, chainKeys);
  const expectedChainSchema = requiresPolicyProfile
    ? PIPELINE_EPIC_25_EVIDENCE_CHAIN_V1_SCHEMA_VERSION
    : PIPELINE_EPIC_25_EVIDENCE_CHAIN_SCHEMA_VERSION;
  if (record.schemaVersion !== expectedChainSchema) {
    issues.push({ field: "schemaVersion", code: "bad_schema_version", summary: "Epic 25 evidence chains use an unsupported schema version." });
  }
  if (typeof record.authoritativePacketId !== "string" || !isSafeOperationalIdentifierText(record.authoritativePacketId)) {
    issues.push({ field: "authoritativePacketId", code: "blank_identifier", summary: "Epic 25 evidence chains require an exact safe authoritative packet id." });
  }
  pushEnumIssue(issues, "evidenceClass", record.evidenceClass, PIPELINE_OPERATIONAL_EVIDENCE_CLASSES);
  if (requiresPolicyProfile) {
    for (const issue of validatePipelineEpic25PolicyProfileV0(record.policyProfile, nowMs)) {
      issues.push({ ...issue, field: `policyProfile.${issue.field}` });
    }
  }
  if (record.metadataOnly !== true || record.rawPayloadRetained !== false || record.executionAllowed !== false ||
      record.providerCallsAllowed !== false || record.mutationAllowed !== false) {
    issues.push({ field: "metadataOnly", code: "bad_retention_flag", summary: "Epic 25 evidence chains are metadata-only and grant no execution, provider, or mutation authority." });
  }
  const chainCheckedAtMs = epic25TimestampMs(record.checkedAt);
  const chainExpiresAtMs = epic25TimestampMs(record.expiresAt);
  if (typeof record.checkedAt !== "string" || typeof record.expiresAt !== "string" || !EPIC_25_RFC3339_TIMESTAMP.test(record.checkedAt) ||
      !EPIC_25_RFC3339_TIMESTAMP.test(record.expiresAt) || !Number.isFinite(chainCheckedAtMs) || !Number.isFinite(chainExpiresAtMs) || chainCheckedAtMs > nowMs + OPERATIONAL_ACTION_READINESS_ALLOWED_FUTURE_SKEW_MS ||
      chainExpiresAtMs < nowMs || chainExpiresAtMs <= chainCheckedAtMs || chainExpiresAtMs - chainCheckedAtMs > OPERATIONAL_ACTION_READINESS_MAX_TTL_MS) {
    issues.push({ field: "checkedAt", code: "stale_or_unparseable_readiness", summary: "Epic 25 evidence-chain timestamps must be current, unexpired, and bounded." });
  }
  if (requiresPolicyProfile) {
    const policyProfile = record.policyProfile as Record<string, unknown> | undefined;
    const policyCheckedAtMs = epic25TimestampMs(policyProfile?.checkedAt);
    const policyExpiresAtMs = epic25TimestampMs(policyProfile?.expiresAt);
    if (!Number.isFinite(policyCheckedAtMs) || !Number.isFinite(policyExpiresAtMs) || policyCheckedAtMs > chainCheckedAtMs || policyExpiresAtMs < chainCheckedAtMs) {
      issues.push({ field: "policyProfile.checkedAt", code: "stale_or_unparseable_readiness", summary: "The Epic 25 policy profile must be fresh at the exact evidence-chain check time." });
    }
  }

  const packets = operationalActionRecord(record.packets, issues, "packets");
  pushUnknownFieldIssues(issues, packets, new Set(PIPELINE_EPIC_25_EVIDENCE_CHAIN_SLOTS));
  const expectedSchemas: Record<PipelineEpic25EvidenceChainSlotV0, string> = {
    readiness: PIPELINE_OPERATIONAL_READINESS_CONTRACT_SCHEMA_VERSION,
    canary: PIPELINE_ONE_WORKER_LIVE_CANARY_SCHEMA_VERSION,
    ramp: PIPELINE_LIVE_CAPACITY_RAMP_SCHEMA_VERSION,
    recovery: PIPELINE_RESILIENCE_RECOVERY_SCHEMA_VERSION,
    hardening: PIPELINE_OPERATIONAL_HARDENING_SCHEMA_VERSION,
    decision: PIPELINE_PRODUCTION_READINESS_DECISION_SCHEMA_VERSION,
  };
  const packetKeys = new Set([
    "slot", "packetId", "packetSchemaVersion", "predecessorPacketId", "evidenceClass", "outcome", "sourceRefs",
    "evidenceRefs", "checkedAt", "expiresAt", "observedEvidenceAttestation", "details", "metadataOnly", "rawPayloadRetained",
  ]);
  const validatedPackets: Partial<Record<PipelineEpic25EvidenceChainSlotV0, Record<string, unknown>>> = {};
  const packetIds = new Set<string>();
  const attestationIds = new Set<string>();
  const receiptIds = new Set<string>();
  let previousPacketId: string | null = null;
  for (const slot of PIPELINE_EPIC_25_EVIDENCE_CHAIN_SLOTS) {
    const value = packets[slot];
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      issues.push({ field: `packets.${slot}`, code: "evidence_required", summary: `Epic 25 evidence chains require the ${slot} packet.` });
      continue;
    }
    const packet = operationalActionRecord(value, issues, `packets.${slot}`);
    validatedPackets[slot] = packet;
    pushUnknownFieldIssues(issues, packet, packetKeys);
    if (packet.slot !== slot || packet.packetSchemaVersion !== expectedSchemas[slot]) {
      issues.push({ field: `packets.${slot}.packetSchemaVersion`, code: "bad_schema_version", summary: `Epic 25 ${slot} evidence must use its exact slot and packet schema.` });
    }
    if (typeof packet.packetId !== "string" || !isSafeOperationalIdentifierText(packet.packetId)) {
      issues.push({ field: `packets.${slot}.packetId`, code: "blank_identifier", summary: `Epic 25 ${slot} evidence requires a safe packet id.` });
    }
    if (typeof packet.packetId === "string" && packetIds.has(packet.packetId)) issues.push({ field: `packets.${slot}.packetId`, code: "inconsistent_result", summary: "Epic 25 packet ids must be unique across all six slots." });
    if (typeof packet.packetId === "string") packetIds.add(packet.packetId);
    if (packet.predecessorPacketId !== previousPacketId) {
      issues.push({ field: `packets.${slot}.predecessorPacketId`, code: "inconsistent_result", summary: `Epic 25 ${slot} evidence must identify the exact preceding packet.` });
    }
    previousPacketId = typeof packet.packetId === "string" ? packet.packetId : null;
    if (packet.evidenceClass !== record.evidenceClass) {
      issues.push({ field: `packets.${slot}.evidenceClass`, code: "inconsistent_result", summary: "Every Epic 25 packet must use the chain evidence class." });
    }
    if (!isPipelineOperationalActionEvidenceRefsV0(packet.sourceRefs) || !isPipelineOperationalActionEvidenceRefsV0(packet.evidenceRefs) ||
        (packet.sourceRefs as unknown[]).some((ref) => typeof ref === "string" && isUnsafeEpic25MetadataValue(ref)) ||
        (packet.evidenceRefs as unknown[]).some((ref) => typeof ref === "string" && isUnsafeEpic25MetadataValue(ref))) {
      issues.push({ field: `packets.${slot}.evidenceRefs`, code: "evidence_required", summary: `Epic 25 ${slot} evidence requires bounded source and evidence refs.` });
    }
    if (packet.metadataOnly !== true || packet.rawPayloadRetained !== false) {
      issues.push({ field: `packets.${slot}.metadataOnly`, code: "bad_retention_flag", summary: `Epic 25 ${slot} evidence must be metadata-only.` });
    }
    const checkedAtMs = epic25TimestampMs(packet.checkedAt);
    const expiresAtMs = epic25TimestampMs(packet.expiresAt);
    if (typeof packet.checkedAt !== "string" || typeof packet.expiresAt !== "string" || !EPIC_25_RFC3339_TIMESTAMP.test(packet.checkedAt) ||
        !EPIC_25_RFC3339_TIMESTAMP.test(packet.expiresAt) || !Number.isFinite(checkedAtMs) || !Number.isFinite(expiresAtMs) || checkedAtMs > chainCheckedAtMs || expiresAtMs < chainCheckedAtMs ||
        expiresAtMs <= checkedAtMs || expiresAtMs - checkedAtMs > OPERATIONAL_ACTION_READINESS_MAX_TTL_MS) {
      issues.push({ field: `packets.${slot}.checkedAt`, code: "stale_or_unparseable_readiness", summary: `Epic 25 ${slot} evidence is stale, future-dated, expired, or malformed.` });
    }
    validatePipelineObservedEvidenceProvenanceV0(issues, packet, expectedSchemas[slot], checkedAtMs);
    const attestation = packet.observedEvidenceAttestation as Record<string, unknown> | null | undefined;
    const subject = attestation && typeof attestation === "object" ? attestation.subject as Record<string, unknown> | undefined : undefined;
    const receipt = attestation && typeof attestation === "object" ? attestation.receipt as Record<string, unknown> | undefined : undefined;
    if (record.evidenceClass === "live_observed" && subject?.targetRef !== packet.packetId) {
      issues.push({ field: `packets.${slot}.observedEvidenceAttestation.subject.targetRef`, code: "inconsistent_result", summary: "Live observation attestations must target the exact evidence packet id." });
    }
    if (attestation) {
      if (typeof attestation.attestationId === "string" && attestationIds.has(attestation.attestationId)) issues.push({ field: `packets.${slot}.observedEvidenceAttestation.attestationId`, code: "inconsistent_result", summary: "Observation attestation ids must be unique across the chain." });
      if (typeof attestation.attestationId === "string") attestationIds.add(attestation.attestationId);
      if (typeof receipt?.receiptId === "string" && receiptIds.has(receipt.receiptId)) issues.push({ field: `packets.${slot}.observedEvidenceAttestation.receipt.receiptId`, code: "inconsistent_result", summary: "Observation receipt ids must be unique across the chain." });
      if (typeof receipt?.receiptId === "string") receiptIds.add(receipt.receiptId);
      const observedAtMs = epic25TimestampMs(receipt?.observedAt);
      if (typeof receipt?.observedAt !== "string" || typeof receipt?.issuedAt !== "string" || typeof receipt?.expiresAt !== "string" ||
          !EPIC_25_RFC3339_TIMESTAMP.test(receipt.observedAt) || !EPIC_25_RFC3339_TIMESTAMP.test(receipt.issuedAt) || !EPIC_25_RFC3339_TIMESTAMP.test(receipt.expiresAt) ||
          !Number.isFinite(observedAtMs) || checkedAtMs - observedAtMs > OPERATIONAL_ACTION_READINESS_MAX_TTL_MS || observedAtMs > checkedAtMs + OPERATIONAL_ACTION_READINESS_ALLOWED_FUTURE_SKEW_MS) {
        issues.push({ field: `packets.${slot}.observedEvidenceAttestation.receipt.observedAt`, code: "stale_or_unparseable_readiness", summary: "Observation receipt timestamps must be timezone-bearing and fresh relative to packet checkedAt." });
      }
      const receiptSourceRefs = Array.isArray(receipt?.sourceRefs) ? receipt.sourceRefs : [];
      const receiptEvidenceRefs = Array.isArray(receipt?.evidenceRefs) ? receipt.evidenceRefs : [];
      if (!sameStringSet(receiptSourceRefs, packet.sourceRefs) || !sameStringSet(receiptEvidenceRefs, packet.evidenceRefs)) {
        issues.push({ field: `packets.${slot}.observedEvidenceAttestation.receipt`, code: "inconsistent_result", summary: "Observation receipts must exactly bind packet source and evidence ref sets." });
      }
    }
    validatePipelineEpic25PacketDetailsV0(issues, slot, packet.details, validatedPackets);
  }

  const readinessOutcome = validatedPackets.readiness?.outcome;
  const canaryOutcome = validatedPackets.canary?.outcome;
  const rampOutcome = validatedPackets.ramp?.outcome;
  const recoveryOutcome = validatedPackets.recovery?.outcome;
  const hardeningOutcome = validatedPackets.hardening?.outcome;
  const decisionOutcome = validatedPackets.decision?.outcome;
  if (!isOneOfString(readinessOutcome, ["go", "no_go"])) issues.push({ field: "packets.readiness.outcome", code: "invalid_enum", summary: "Readiness outcome must be go or no_go." });
  for (const [slot, outcome] of [["canary", canaryOutcome], ["ramp", rampOutcome], ["recovery", recoveryOutcome], ["hardening", hardeningOutcome]] as const) {
    if (!isOneOfString(outcome, ["pass", "hold", "stop"])) issues.push({ field: `packets.${slot}.outcome`, code: "invalid_enum", summary: `${slot} outcome must be pass, hold, or stop.` });
  }
  if (!isOneOfString(decisionOutcome, PIPELINE_PRODUCTION_READINESS_DECISIONS)) issues.push({ field: "packets.decision.outcome", code: "invalid_enum", summary: "Final decision must be go, hold, or limited_rollout." });
  const livePredecessorsPresent = record.evidenceClass === "live_observed" && readinessOutcome === "go" && canaryOutcome === "pass" &&
    rampOutcome === "pass" && recoveryOutcome === "pass" && hardeningOutcome === "pass";
  if (!livePredecessorsPresent && decisionOutcome !== "hold") {
    issues.push({ field: "packets.decision.outcome", code: "policy_violation", summary: "Final decision must hold whenever complete passing live predecessors are absent." });
  }
  const rampDetails = validatedPackets.ramp?.details as Record<string, unknown> | undefined;
  const recoveryDetails = validatedPackets.recovery?.details as Record<string, unknown> | undefined;
  const hardeningDetails = validatedPackets.hardening?.details as Record<string, unknown> | undefined;
  const decisionDetails = validatedPackets.decision?.details as Record<string, unknown> | undefined;
  if (rampDetails?.canaryPacketId !== validatedPackets.canary?.packetId || rampDetails?.canaryOutcome !== canaryOutcome) issues.push({ field: "packets.ramp.details", code: "inconsistent_result", summary: "Ramp details must bind the exact canary packet and outcome." });
  if (recoveryDetails?.rampPacketId !== validatedPackets.ramp?.packetId || recoveryDetails?.predecessorOutcome !== rampOutcome) issues.push({ field: "packets.recovery.details", code: "inconsistent_result", summary: "Recovery details must bind the exact ramp packet and outcome." });
  if (hardeningDetails?.recoveryPacketId !== validatedPackets.recovery?.packetId || hardeningDetails?.predecessorOutcome !== recoveryOutcome) issues.push({ field: "packets.hardening.details", code: "inconsistent_result", summary: "Hardening details must bind the exact recovery packet and outcome." });
  const decisionIds = decisionDetails?.predecessorPacketIds as Record<string, unknown> | undefined;
  const decisionOutcomes = decisionDetails?.predecessorOutcomes as Record<string, unknown> | undefined;
  for (const slot of ["canary", "ramp", "recovery", "hardening"] as const) {
    if (decisionIds?.[slot] !== validatedPackets[slot]?.packetId || decisionOutcomes?.[slot] !== validatedPackets[slot]?.outcome) issues.push({ field: "packets.decision.details", code: "inconsistent_result", summary: "Decision details must bind every exact predecessor packet and outcome." });
  }
  return issues;
}

export function validatePipelineEpic25PolicyProfileV0(
  profile: unknown,
  nowMs: number = Date.now(),
): PipelineOperationalActionValidationIssueV0[] {
  const issues: PipelineOperationalActionValidationIssueV0[] = [];
  const record = operationalActionRecord(profile, issues, "policyProfile");
  pushForbiddenObjectFieldIssues(issues, record);
  pushUnknownFieldIssues(issues, record, new Set([
    "schemaVersion", "targetRevision", "checkedAt", "expiresAt", "qualityGates", "retentionPolicy",
    "executionAllowed", "providerCallsAllowed", "mutationAllowed", "metadataOnly", "rawPayloadRetained",
  ]));
  if (record.schemaVersion !== PIPELINE_EPIC_25_POLICY_PROFILE_SCHEMA_VERSION) {
    issues.push({ field: "schemaVersion", code: "bad_schema_version", summary: "Epic 25 policy profiles use an unsupported schema version." });
  }
  if (typeof record.targetRevision !== "string" || !EPIC_25_EXACT_TARGET_REVISION.test(record.targetRevision)) {
    issues.push({ field: "targetRevision", code: "blank_identifier", summary: "Epic 25 policy profiles require an exact lowercase 40-character Git target revision." });
  }
  if (record.executionAllowed !== false || record.providerCallsAllowed !== false || record.mutationAllowed !== false ||
      record.metadataOnly !== true || record.rawPayloadRetained !== false) {
    issues.push({ field: "metadataOnly", code: "bad_retention_flag", summary: "Epic 25 policy profiles are metadata-only and cannot grant execution, provider, mutation, or raw-payload authority." });
  }
  const checkedAtMs = epic25TimestampMs(record.checkedAt);
  const expiresAtMs = epic25TimestampMs(record.expiresAt);
  if (typeof record.checkedAt !== "string" || typeof record.expiresAt !== "string" || !EPIC_25_RFC3339_TIMESTAMP.test(record.checkedAt) ||
      !EPIC_25_RFC3339_TIMESTAMP.test(record.expiresAt) || !Number.isFinite(checkedAtMs) || !Number.isFinite(expiresAtMs) ||
      checkedAtMs > nowMs + OPERATIONAL_ACTION_READINESS_ALLOWED_FUTURE_SKEW_MS || expiresAtMs < nowMs || expiresAtMs <= checkedAtMs ||
      expiresAtMs - checkedAtMs > OPERATIONAL_ACTION_READINESS_MAX_TTL_MS) {
    issues.push({ field: "checkedAt", code: "stale_or_unparseable_readiness", summary: "Epic 25 policy-profile freshness must be current, unexpired, and bounded to five minutes." });
  }

  const gates = safeOperationalUnknownArray(record.qualityGates);
  const seenFamilies = new Set<string>();
  if (!gates) {
    issues.push({ field: "qualityGates", code: "evidence_required", summary: "Epic 25 policy profiles require all named quality-gate families." });
  } else {
    for (let index = 0; index < gates.length; index += 1) {
      const gate = operationalActionRecord(gates[index], issues, `qualityGates.${index}`);
      pushForbiddenObjectFieldIssues(issues, gate);
      pushUnknownFieldIssues(issues, gate, new Set(["family", "requirement", "state", "typedReason", "nextSafeAction", "notApplicableReason", "targetRevision", "checkedAt", "expiresAt", "evidenceRefs"]));
      const family = gate.family;
      if (typeof family !== "string" || !isOneOfString(family, PIPELINE_EPIC_25_QUALITY_GATE_FAMILIES) || seenFamilies.has(family)) {
        issues.push({ field: `qualityGates.${index}.family`, code: "policy_violation", summary: "Epic 25 quality-gate families must be named exactly once." });
      } else {
        seenFamilies.add(family);
      }
      if (!isOneOfString(gate.requirement, ["required", "not_applicable"]) || !isOneOfString(gate.state, PIPELINE_QUALITY_GATE_STATES)) {
        issues.push({ field: `qualityGates.${index}.state`, code: "invalid_enum", summary: "Epic 25 gates use canonical required/not_applicable and pass/fail/blocked/not_applicable semantics." });
      }
      if (family !== "runbook" && gate.requirement !== "required") {
        issues.push({ field: `qualityGates.${index}.requirement`, code: "policy_violation", summary: `Epic 25 ${String(family)} is a server-required gate family.` });
      }
      if (gate.requirement === "required" && gate.state === "not_applicable") {
        issues.push({ field: `qualityGates.${index}.state`, code: "policy_violation", summary: "Required Epic 25 gates cannot be not_applicable." });
      }
      if (gate.requirement === "not_applicable" && (family !== "runbook" || gate.state !== "not_applicable" || typeof gate.notApplicableReason !== "string" || !isSafeEpic25PolicyText(gate.notApplicableReason))) {
        issues.push({ field: `qualityGates.${index}.notApplicableReason`, code: "policy_violation", summary: "Only the runbook gate may be not_applicable and it requires a safe reason." });
      }
      if (gate.requirement === "required" && gate.notApplicableReason !== null) {
        issues.push({ field: `qualityGates.${index}.notApplicableReason`, code: "policy_violation", summary: "Required Epic 25 gates cannot carry a not-applicable reason." });
      }
      if (isOneOfString(gate.state, ["fail", "blocked"])) {
        if (!isOneOfString(gate.typedReason, PIPELINE_OPERATIONAL_READINESS_REASONS)) issues.push({ field: `qualityGates.${index}.typedReason`, code: "invalid_enum", summary: "Failed or blocked Epic 25 gates require a typed readiness reason." });
      } else if (gate.typedReason !== null) {
        issues.push({ field: `qualityGates.${index}.typedReason`, code: "policy_violation", summary: "Passing or not-applicable Epic 25 gates must not carry a typed failure reason." });
      }
      if (typeof gate.nextSafeAction !== "string" || !isSafeEpic25PolicyText(gate.nextSafeAction)) {
        issues.push({ field: `qualityGates.${index}.nextSafeAction`, code: "unsafe_metadata_retention", summary: "Epic 25 gates require a safe metadata-only next action." });
      }
      if (gate.targetRevision !== record.targetRevision) {
        issues.push({ field: `qualityGates.${index}.targetRevision`, code: "stale_or_unparseable_readiness", summary: "Every Epic 25 gate must target the profile's exact Git revision." });
      }
      const gateCheckedAtMs = epic25TimestampMs(gate.checkedAt);
      const gateExpiresAtMs = epic25TimestampMs(gate.expiresAt);
      if (typeof gate.checkedAt !== "string" || typeof gate.expiresAt !== "string" || !EPIC_25_RFC3339_TIMESTAMP.test(gate.checkedAt) ||
          !EPIC_25_RFC3339_TIMESTAMP.test(gate.expiresAt) || !Number.isFinite(gateCheckedAtMs) || !Number.isFinite(gateExpiresAtMs) ||
          gateCheckedAtMs > checkedAtMs || gateExpiresAtMs < nowMs || gateExpiresAtMs < checkedAtMs || gateExpiresAtMs <= gateCheckedAtMs ||
          gateExpiresAtMs - gateCheckedAtMs > OPERATIONAL_ACTION_READINESS_MAX_TTL_MS || gateExpiresAtMs > expiresAtMs) {
        issues.push({ field: `qualityGates.${index}.checkedAt`, code: "stale_or_unparseable_readiness", summary: "Every Epic 25 gate must be fresh within the policy-profile window." });
      }
      if (!isPipelineOperationalActionEvidenceRefsV0(gate.evidenceRefs) ||
          (gate.evidenceRefs as unknown[] | undefined)?.some((ref) => typeof ref === "string" && isUnsafeEpic25MetadataValue(ref))) {
        issues.push({ field: `qualityGates.${index}.evidenceRefs`, code: "evidence_required", summary: "Every Epic 25 gate requires safe metadata-only evidence refs." });
      }
    }
  }
  for (const family of PIPELINE_EPIC_25_QUALITY_GATE_FAMILIES) {
    if (!seenFamilies.has(family)) issues.push({ field: `qualityGates.${family}`, code: "evidence_required", summary: `Epic 25 policy profiles require the ${family} gate family.` });
  }

  const retention = operationalActionRecord(record.retentionPolicy, issues, "retentionPolicy");
  pushForbiddenObjectFieldIssues(issues, retention);
  pushUnknownFieldIssues(issues, retention, new Set([
    "sourceOwner", "toolOwner", "disposition", "redactionState", "expiresAt", "retentionPeriodDays", "disposalAction",
    "verificationStatus", "policyReason", "evidenceRefs", "metadataOnly", "rawPayloadRetained",
  ]));
  if (typeof retention.sourceOwner !== "string" || !isSafeOperationalIdentifierText(retention.sourceOwner) ||
      typeof retention.toolOwner !== "string" || !isSafeOperationalIdentifierText(retention.toolOwner)) {
    issues.push({ field: "retentionPolicy.sourceOwner", code: "unsafe_metadata_retention", summary: "Epic 25 retention requires safe source and tool owners." });
  }
  if (retention.disposition !== "metadata_only" || !isOneOfString(retention.redactionState, ["verified_redacted", "not_applicable"]) ||
      !isOneOfString(retention.disposalAction, ["delete_metadata", "revalidate_before_expiry"]) ||
      !isOneOfString(retention.verificationStatus, ["verified", "pending", "failed"]) || retention.metadataOnly !== true || retention.rawPayloadRetained !== false) {
    issues.push({ field: "retentionPolicy", code: "bad_retention_flag", summary: "Epic 25 retention must declare metadata-only disposition, redaction, disposal, verification, and no raw payload retention." });
  }
  const retentionExpiresAtMs = epic25TimestampMs(retention.expiresAt);
  if (typeof retention.expiresAt !== "string" || !EPIC_25_RFC3339_TIMESTAMP.test(retention.expiresAt) || !Number.isFinite(retentionExpiresAtMs) ||
      retentionExpiresAtMs < nowMs || typeof retention.retentionPeriodDays !== "number" || !Number.isInteger(retention.retentionPeriodDays) ||
      retention.retentionPeriodDays < 1 || retention.retentionPeriodDays > 3650 || retentionExpiresAtMs !== checkedAtMs + retention.retentionPeriodDays * 86_400_000) {
    issues.push({ field: "retentionPolicy.expiresAt", code: "stale_or_unparseable_readiness", summary: "Epic 25 retention requires an unexpired exact retention period of one to 3650 days from profile checkedAt." });
  }
  if (typeof retention.policyReason !== "string" || !isSafeEpic25PolicyText(retention.policyReason)) {
    issues.push({ field: "retentionPolicy.policyReason", code: "unsafe_metadata_retention", summary: "Epic 25 retention requires a safe metadata-only policy reason." });
  }
  if (!isPipelineOperationalActionEvidenceRefsV0(retention.evidenceRefs) ||
      (retention.evidenceRefs as unknown[] | undefined)?.some((ref) => typeof ref === "string" && isUnsafeEpic25MetadataValue(ref))) {
    issues.push({ field: "retentionPolicy.evidenceRefs", code: "evidence_required", summary: "Epic 25 retention requires safe policy evidence refs." });
  }
  return issues;
}

function sameStringSet(left: unknown, right: unknown): boolean {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length ||
      left.some((value) => typeof value !== "string") || right.some((value) => typeof value !== "string")) return false;
  return new Set(left as string[]).size === left.length && (left as string[]).every((value) => (right as string[]).includes(value));
}

function isSafeEpic25PolicyText(value: string): boolean {
  return isSafeOperationalMetadataText(value) && !isUnsafeEpic25MetadataValue(value) && !EPIC_25_EXECUTABLE_POLICY_TEXT.test(value);
}

function isUnsafeEpic25MetadataValue(value: string): boolean {
  return EPIC_25_HIGH_ENTROPY_OR_PEM.test(value) || EPIC_25_TOKEN_LIKE_METADATA_VALUE.test(value);
}

function epic25TimestampMs(value: unknown): number {
  if (typeof value !== "string") return NaN;
  const match = EPIC_25_RFC3339_TIMESTAMP.exec(value);
  if (!match) return NaN;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return NaN;
  return Date.parse(value);
}

function validatePipelineEpic25PacketDetailsV0(
  issues: PipelineOperationalActionValidationIssueV0[],
  slot: PipelineEpic25EvidenceChainSlotV0,
  value: unknown,
  _packets: Partial<Record<PipelineEpic25EvidenceChainSlotV0, Record<string, unknown>>>,
): void {
  const details = operationalActionRecord(value, issues, `packets.${slot}.details`);
  if (details.kind !== slot) {
    issues.push({ field: `packets.${slot}.details.kind`, code: "inconsistent_result", summary: "Epic 25 packet details must use the slot-specific contract." });
    return;
  }
  const positiveInteger = (candidate: unknown) => typeof candidate === "number" && Number.isInteger(candidate) && candidate > 0;
  if (slot === "readiness") {
    if (!isOneOfString(details.backendTruth, PIPELINE_OPERATIONAL_READINESS_BACKEND_TRUTHS) || !positiveInteger(details.gateCount) ||
        ["thresholdsComplete", "telemetryReady", "rollbackReady", "recoveryReady", "configurationValid"].some((field) => typeof details[field] !== "boolean")) {
      issues.push({ field: "packets.readiness.details", code: "evidence_required", summary: "Readiness details require backend truth, gates, thresholds, telemetry, rollback, recovery, and configuration state." });
    }
  } else if (slot === "canary") {
    if (details.workerCount !== 1 || !isOneOfString(details.backendTruth, PIPELINE_OPERATIONAL_READINESS_BACKEND_TRUTHS) ||
        !isOneOfString(details.leaseState, ["pass", "fail", "blocked"]) || !isOneOfString(details.checkpointState, ["pass", "fail", "blocked"]) ||
        ["measurementsComplete", "canaryAuthorityProven", "rampAllowed"].some((field) => typeof details[field] !== "boolean")) {
      issues.push({ field: "packets.canary.details", code: "evidence_required", summary: "Canary details require one-worker truth, lease, checkpoint, measurements, authority, and ramp state." });
    }
  } else if (slot === "ramp") {
    if (!Array.isArray(details.stageWorkerCounts) || details.stageWorkerCounts.join(",") !== "1,2,4,6" || !Array.isArray(details.stageOutcomes) || details.stageOutcomes.length !== 4 ||
        details.stageOutcomes.some((outcome) => !isOneOfString(outcome, ["pass", "hold", "stop"])) || typeof details.scaleEvidenceReady !== "boolean") {
      issues.push({ field: "packets.ramp.details", code: "evidence_required", summary: "Ramp details require the exact 1-2-4-6 stage plan and four typed outcomes." });
    }
  } else if (slot === "recovery") {
    if (!positiveInteger(details.drillCount) || details.silentRetryObserved !== false || ["allDrillsPassed", "idempotencyProven", "reliabilityEvidenceReady"].some((field) => typeof details[field] !== "boolean")) {
      issues.push({ field: "packets.recovery.details", code: "evidence_required", summary: "Recovery details require drills, idempotency, retry, and reliability state." });
    }
  } else if (slot === "hardening") {
    if (!positiveInteger(details.domainCount) || typeof details.unresolvedHighRiskGap !== "boolean" || typeof details.readinessHandoffReady !== "boolean") {
      issues.push({ field: "packets.hardening.details", code: "evidence_required", summary: "Hardening details require domain, high-risk gap, and handoff state." });
    }
  } else {
    const ids = details.predecessorPacketIds as Record<string, unknown> | undefined;
    const outcomes = details.predecessorOutcomes as Record<string, unknown> | undefined;
    const required = ["canary", "ramp", "recovery", "hardening"];
    if (!ids || !outcomes || Object.keys(ids).sort().join(",") !== required.slice().sort().join(",") || Object.keys(outcomes).sort().join(",") !== required.slice().sort().join(",") ||
        ["authorityReady", "simulatedEvidence", "staleEvidence", "fixtureEvidence"].some((field) => typeof details[field] !== "boolean")) {
      issues.push({ field: "packets.decision.details", code: "evidence_required", summary: "Decision details require exact predecessor maps and explicit authority/evidence signals." });
    }
  }
}

function pushOperationalActionCommonIssues(
  issues: PipelineOperationalActionValidationIssueV0[],
  action: Record<string, unknown>,
): void {
  if (!isPipelineOperationalActionIdV0(action.actionId)) {
    issues.push({ field: "actionId", code: "unknown_action_id", summary: "Operational action uses an unknown built-in action id." });
  }
  pushEnumIssue(issues, "targetType", action.targetType, PIPELINE_OPERATIONAL_ACTION_TARGET_TYPES);
  for (const field of ["targetId", "correlationId", "idempotencyKey"] as const) {
    if (typeof action[field] !== "string" || !action[field].trim()) {
      issues.push({ field, code: "blank_identifier", summary: `Operational action ${field} must not be blank.` });
    } else if (!isSafeOperationalIdentifierText(action[field])) {
      issues.push({ field, code: "unsafe_metadata_retention", summary: `Operational action ${field} must be safe metadata text.` });
    }
  }
  if (action.approvalId !== undefined && action.approvalId !== null && (typeof action.approvalId !== "string" || !isSafeOperationalIdentifierText(action.approvalId))) {
    issues.push({ field: "approvalId", code: "unsafe_metadata_retention", summary: "Operational approval ids must be safe metadata identifiers." });
  }
  if (!isPipelineOperationalActionEvidenceRefsV0(action.evidenceRefs)) {
    issues.push({ field: "evidenceRefs", code: "evidence_required", summary: "Operational action requires safe metadata evidence refs." });
  }
}

function validateOperationalSchemaAndRetention(
  issues: PipelineOperationalActionValidationIssueV0[],
  record: Record<string, unknown>,
  schemaVersion: string | null,
  requireRawPayloadFlag: boolean,
): void {
  if (schemaVersion !== null && record.schemaVersion !== schemaVersion) {
    issues.push({ field: "schemaVersion", code: "bad_schema_version", summary: "Operational action object uses an unsupported schema version." });
  }
  if (record.metadataOnly !== true) {
    issues.push({ field: "metadataOnly", code: "bad_retention_flag", summary: "Operational action object must be metadataOnly." });
  }
  if (requireRawPayloadFlag && record.rawPayloadRetained !== false) {
    issues.push({ field: "rawPayloadRetained", code: "bad_retention_flag", summary: "Operational action object must not retain raw payloads." });
  }
  pushForbiddenObjectFieldIssues(issues, record);
}

function pushCapabilityStateIssues(issues: PipelineOperationalActionValidationIssueV0[], record: Record<string, unknown>): void {
  pushEnumIssue(issues, "capabilityState", record.capabilityState, PIPELINE_OPERATIONAL_ACTION_CAPABILITY_STATES);
  pushEnumIssue(issues, "authorityState", record.authorityState, PIPELINE_OPERATIONAL_ACTION_AUTHORITY_STATES);
  pushEnumIssue(issues, "riskTier", record.riskTier, PIPELINE_OPERATIONAL_ACTION_RISK_TIERS);
  pushTypedReasonIssue(issues, "typedReason", record.typedReason);
  if (record.capabilityState === "available" && record.authorityState !== "allowed" && !isKnownOperationalTypedReason(record.typedReason)) {
    issues.push({
      field: "typedReason",
      code: "inconsistent_result",
      summary: "Available operational action capability with non-allowed authority requires a typed reason.",
    });
  }
}

function pushActionPolicyIssues(
  issues: PipelineOperationalActionValidationIssueV0[],
  record: Record<string, unknown>,
  surface: "request" | "capability" | "result",
): void {
  if (!isPipelineOperationalActionIdV0(record.actionId)) return;
  const policy = PIPELINE_OPERATIONAL_ACTION_POLICY[record.actionId];
  if (!policy.targetTypes.includes(record.targetType as PipelineOperationalActionTargetTypeV0)) {
    issues.push({ field: "targetType", code: "policy_violation", summary: "Operational action target type does not match its policy." });
  }
  const riskField = surface === "request" ? "requestedRiskTier" : "riskTier";
  const riskTier = record[riskField];
  if (!isKnownOperationalRiskTier(riskTier) || OPERATIONAL_ACTION_RISK_RANK[riskTier] < OPERATIONAL_ACTION_RISK_RANK[policy.minimumRiskTier]) {
    issues.push({ field: riskField, code: "policy_violation", summary: "Operational action risk tier is below its policy minimum." });
  }
  if (surface === "capability" && !policy.allowedAuthorityAllowed && record.authorityState === "allowed") {
    issues.push({ field: "authorityState", code: "policy_violation", summary: "This operational action cannot be marked allowed by capability policy." });
  }
  const authorityField = surface === "request" ? "requestedAuthorityState" : "authorityState";
  const authorityState = record[authorityField];
  if (surface === "request" && policy.requiredAuthorityStates.length > 0 && !policy.requiredAuthorityStates.includes(authorityState as PipelineOperationalActionRequestedAuthorityStateV0)) {
    issues.push({ field: authorityField, code: "policy_violation", summary: "Operational action authority state does not match its required approval family." });
  }
  if (policy.requiredAuthorityStates.length === 0 && isApprovalAuthorityState(authorityState)) {
    issues.push({ field: authorityField, code: "policy_violation", summary: "Read-only operational actions must not claim unrelated approval gates." });
  }
  if (surface === "request" && policy.requiredAuthorityStates.length === 0 && authorityState !== "not_required" && authorityState !== "blocked") {
    issues.push({ field: authorityField, code: "policy_violation", summary: "Read-only operational action requests must use neutral no-approval authority or an explicit blocked state." });
  }
  if (
    surface === "capability" &&
    policy.requiredAuthorityStates.length > 0 &&
    authorityState !== "blocked" &&
    authorityState !== "allowed" &&
    !policy.requiredAuthorityStates.includes(authorityState as PipelineOperationalActionRequestedAuthorityStateV0)
  ) {
    issues.push({ field: authorityField, code: "policy_violation", summary: "Operational action capability authority state does not match its required approval family." });
  }
  if (
    surface === "result" &&
    policy.requiredAuthorityStates.length > 0 &&
    authorityState !== "blocked" &&
    authorityState !== "allowed" &&
    !policy.requiredAuthorityStates.includes(authorityState as PipelineOperationalActionRequestedAuthorityStateV0)
  ) {
    issues.push({ field: authorityField, code: "policy_violation", summary: "Operational action result authority state does not match its required approval family." });
  }
}

function isApprovalAuthorityState(value: unknown): boolean {
  return isOneOfString(value, [
    "needs_product_approval",
    "needs_authority_approval",
    "needs_resource_approval",
    "needs_destination_approval",
    "needs_safety_approval",
  ]);
}

function hasRequiredOperationalApprovalEvidence(actionId: PipelineOperationalActionIdV0, evidenceRefs: unknown, record: Record<string, unknown>): boolean {
  const policy = PIPELINE_OPERATIONAL_ACTION_POLICY[actionId];
  if (policy.requiredAuthorityStates.length === 0) return true;
  const refs = safeOperationalStringArray(evidenceRefs);
  if (!refs) return false;
  return refs.some((ref) => policy.requiredAuthorityStates.some((authorityState) => ref === approvalEvidenceRef(authorityState, actionId, record)));
}

function hasRequiredOperationalCapabilityApprovalEvidence(actionId: PipelineOperationalActionIdV0, evidenceRefs: unknown, record: Record<string, unknown>): boolean {
  const policy = PIPELINE_OPERATIONAL_ACTION_POLICY[actionId];
  if (policy.requiredAuthorityStates.length === 0) return true;
  const refs = safeOperationalStringArray(evidenceRefs);
  if (!refs) return false;
  return refs.some((ref) => policy.requiredAuthorityStates.some((authorityState) => ref === capabilityApprovalEvidenceRef(authorityState, actionId, record)));
}

function capabilityApprovalEvidenceRef(
  authorityState: PipelineOperationalActionRequestedAuthorityStateV0,
  actionId: PipelineOperationalActionIdV0,
  record: Record<string, unknown>,
): string {
  return `evidence:capability-approval-${authorityState}:${actionId}:${operationalContextEvidenceToken(record, "targetId")}`;
}

function approvalEvidenceRef(
  authorityState: PipelineOperationalActionRequestedAuthorityStateV0,
  actionId: PipelineOperationalActionIdV0,
  record: Record<string, unknown>,
): string {
  return `evidence:approval-${authorityState}:${actionId}:${operationalContextEvidenceToken(record, "targetId")}:${operationalContextEvidenceToken(record, "correlationId")}:${operationalContextEvidenceToken(record, "idempotencyKey")}`;
}

function operationalActionContextEvidenceRef(actionId: PipelineOperationalActionIdV0, record: Record<string, unknown>): string {
  return `evidence:${actionId}-context:${operationalContextEvidenceToken(record, "targetId")}:${operationalContextEvidenceToken(record, "correlationId")}:${operationalContextEvidenceToken(record, "idempotencyKey")}`;
}

function operationalContextEvidenceToken(record: Record<string, unknown>, field: "targetId" | "correlationId" | "idempotencyKey"): string {
  const value = record[field];
  if (typeof value !== "string" || !isSafeOperationalIdentifierText(value)) return "unknown-0";
  return boundedOperationalEvidenceToken(value);
}

function boundedOperationalEvidenceToken(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  const normalized = value
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "id";
  return `${normalized}-${(hash >>> 0).toString(36).padStart(7, "0").slice(0, 7)}`;
}

function hasRequiredMergeSuccessEvidence(evidenceRefs: unknown, record: Record<string, unknown>): boolean {
  const refs = safeOperationalStringArray(evidenceRefs);
  if (!refs) return false;
  const headSha = firstRegexGroup(refs, OPERATIONAL_ACTION_MERGE_HEAD_SHA_EVIDENCE, /^evidence:merge-head-sha-([a-f0-9]{40})$/);
  const base = firstRegexGroup(refs, OPERATIONAL_ACTION_MERGE_BASE_EVIDENCE, /^evidence:merge-base-([a-z0-9._/@:-]{1,120})$/);
  const pr = firstRegexGroup(refs, OPERATIONAL_ACTION_MERGE_PR_EVIDENCE, /^evidence:merge-pr-([0-9]{1,10})$/);
  const local = firstMergeLocalVerification(refs);
  return (
    refs.includes(operationalActionContextEvidenceRef("merge", record)) &&
    Boolean(headSha) &&
    Boolean(base) &&
    Boolean(pr) &&
    Boolean(local) &&
    local?.headSha === headSha &&
    local?.base === base &&
    local?.pr === pr &&
    refs.some((ref) => mergeScopedEvidenceMatches(ref, OPERATIONAL_ACTION_MERGE_CHECKS_SCOPED_EVIDENCE, headSha, pr)) &&
    refs.some((ref) => mergeScopedEvidenceMatches(ref, OPERATIONAL_ACTION_MERGE_REVIEW_THREADS_SCOPED_EVIDENCE, headSha, pr)) &&
    refs.some((ref) => OPERATIONAL_ACTION_MERGE_MERGEABILITY_EVIDENCE.test(ref)) &&
    refs.some((ref) => OPERATIONAL_ACTION_MERGE_NON_DRAFT_EVIDENCE.test(ref)) &&
    refs.some((ref) => OPERATIONAL_ACTION_MERGE_REQUESTED_CHANGES_EVIDENCE.test(ref)) &&
    refs.some((ref) => OPERATIONAL_ACTION_MERGE_EXPECTED_BASE_POLICY_EVIDENCE.test(ref)) &&
    refs.some((ref) => OPERATIONAL_ACTION_MERGE_HIGH_RISK_DIFF_EVIDENCE.test(ref))
  );
}

function mergeScopedEvidenceMatches(ref: string, capture: RegExp, expectedHeadSha: string | null, expectedPr: string | null): boolean {
  if (!expectedHeadSha || !expectedPr) return false;
  const match = capture.exec(ref);
  return Boolean(match?.[1] === expectedHeadSha && match[2] === expectedPr);
}

function firstRegexGroup(refs: string[], predicate: RegExp, capture: RegExp): string | null {
  for (const ref of refs) {
    if (!predicate.test(ref)) continue;
    const match = capture.exec(ref);
    if (match?.[1]) return match[1];
  }
  return null;
}

function firstMergeLocalVerification(refs: string[]): { headSha: string; base: string; pr: string } | null {
  for (const ref of refs) {
    if (!OPERATIONAL_ACTION_MERGE_LOCAL_VERIFICATION_EVIDENCE.test(ref)) continue;
    const match = /^verification:merge-local-head-([a-f0-9]{40}):base-([a-z0-9._/@:-]{1,80}):pr-([0-9]{1,10})$/.exec(ref);
    if (match?.[1] && match[2] && match[3]) {
      return { headSha: match[1], base: match[2], pr: match[3] };
    }
  }
  return null;
}

function hasRequiredActionSuccessEvidence(actionId: PipelineOperationalActionIdV0, evidenceRefs: unknown, record: Record<string, unknown>): boolean {
  const refs = safeOperationalStringArray(evidenceRefs);
  if (!refs) return false;
  const hasContext = refs.includes(operationalActionContextEvidenceRef(actionId, record));
  const targetId = operationalContextEvidenceToken(record, "targetId");
  switch (actionId) {
    case "dispatch_apply":
      return (
        hasContext &&
        refs.includes(`evidence:dispatch-apply-lane-${targetId}`) &&
        refs.some((ref) => OPERATIONAL_ACTION_DISPATCH_APPLY_WORKSPACE_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_DISPATCH_APPLY_RESULT_EVIDENCE.test(ref))
      );
    case "retry_verification":
      return (
        hasContext &&
        refs.includes(`evidence:retry-verification-ref-${targetId}`) &&
        refs.some((ref) => OPERATIONAL_ACTION_RETRY_VERIFICATION_RESULT_EVIDENCE.test(ref))
      );
    case "requeue":
      return (
        hasContext &&
        refs.includes(`evidence:requeue-item-${targetId}`) &&
        refs.some((ref) => OPERATIONAL_ACTION_REQUEUE_RESULT_EVIDENCE.test(ref))
      );
    case "kill_worker":
      return (
        hasContext &&
        refs.includes(`evidence:kill-worker-target-${targetId}`) &&
        refs.some((ref) => OPERATIONAL_ACTION_KILL_WORKER_RESULT_EVIDENCE.test(ref))
      );
    case "mutate_source":
      return (
        hasContext &&
        refs.includes(`evidence:mutate-source-ref-${targetId}`) &&
        refs.some((ref) => OPERATIONAL_ACTION_MUTATE_SOURCE_RESULT_EVIDENCE.test(ref))
      );
    case "push_branch":
      return (
        hasContext &&
        refs.includes(`evidence:push-branch-ref-${targetId}`) &&
        refs.some((ref) => OPERATIONAL_ACTION_PUSH_BRANCH_REMOTE_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_PUSH_BRANCH_HEAD_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_PUSH_BRANCH_RESULT_EVIDENCE.test(ref))
      );
    case "open_pr":
      return (
        hasContext &&
        refs.includes(`evidence:open-pr-branch-${targetId}`) &&
        refs.some((ref) => OPERATIONAL_ACTION_OPEN_PR_BASE_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_OPEN_PR_IDENTITY_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_OPEN_PR_RESULT_EVIDENCE.test(ref))
      );
    case "delete_branch":
      return (
        hasContext &&
        refs.includes(`evidence:delete-branch-ref-${targetId}`) &&
        refs.some((ref) => OPERATIONAL_ACTION_DELETE_BRANCH_HEAD_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_DELETE_BRANCH_RESULT_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_DELETE_BRANCH_MERGED_PR_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_DELETE_BRANCH_LANE_OWNER_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_DELETE_BRANCH_LOCAL_SHA_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_DELETE_BRANCH_REMOTE_SHA_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_DELETE_BRANCH_DELIVERY_HEAD_EVIDENCE.test(ref))
      );
    case "cleanup":
      return (
        hasContext &&
        refs.includes(`evidence:cleanup-workspace-${targetId}`) &&
        refs.some((ref) => OPERATIONAL_ACTION_CLEANUP_PR_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_CLEANUP_HEAD_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_CLEANUP_DRY_RUN_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_CLEANUP_RESULT_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_CLEANUP_MERGED_PR_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_CLEANUP_LANE_OWNER_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_CLEANUP_WORKTREE_IDENTITY_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_CLEANUP_LOCAL_BRANCH_SHA_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_CLEANUP_REMOTE_BRANCH_SHA_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_CLEANUP_DELIVERY_HEAD_EVIDENCE.test(ref))
      );
    case "credential_or_provider_change":
      return (
        hasContext &&
        refs.includes(`evidence:provider-change-target-${targetId}`) &&
        refs.some((ref) => OPERATIONAL_ACTION_PROVIDER_CHANGE_TARGET_EVIDENCE.test(ref)) &&
        refs.some((ref) => OPERATIONAL_ACTION_PROVIDER_CHANGE_RESULT_EVIDENCE.test(ref))
      );
    default:
      return true;
  }
}

function pushEnumIssue(issues: PipelineOperationalActionValidationIssueV0[], field: string, value: unknown, allowed: readonly string[]): void {
  if (typeof value !== "string" || !allowed.includes(value)) {
    issues.push({ field, code: "invalid_enum", summary: `Operational action ${field} is not a supported value.` });
  }
}

function pushTypedReasonIssue(issues: PipelineOperationalActionValidationIssueV0[], field: string, value: unknown): void {
  if (value !== null && value !== undefined && !isKnownOperationalTypedReason(value)) {
    issues.push({ field, code: "invalid_enum", summary: "Operational action typed reason is not supported." });
  }
}

function pushOutcomeStateConsistencyIssues(issues: PipelineOperationalActionValidationIssueV0[], record: Record<string, unknown>): void {
  if (record.outcome === "succeeded" && ["blocked", "failed", "unknown"].includes(typeof record.resultingStatus === "string" ? record.resultingStatus : "")) {
    issues.push({ field: "resultingStatus", code: "inconsistent_result", summary: "Successful operational action results cannot report blocked, failed, or unknown resulting status." });
  }
  if (record.outcome === "succeeded" && ["unknown", "deferred"].includes(typeof record.resultingStage === "string" ? record.resultingStage : "")) {
    issues.push({ field: "resultingStage", code: "inconsistent_result", summary: "Successful operational action results cannot report unknown or deferred resulting stage." });
  }
  if (record.outcome === "blocked" && record.resultingStatus !== "blocked") {
    issues.push({ field: "resultingStatus", code: "inconsistent_result", summary: "Blocked operational action results must report blocked resulting status." });
  }
  if (record.outcome === "failed" && record.resultingStatus !== "failed") {
    issues.push({ field: "resultingStatus", code: "inconsistent_result", summary: "Failed operational action results must report failed resulting status." });
  }
  if (record.outcome === "rejected" && record.resultingStatus !== "blocked") {
    issues.push({ field: "resultingStatus", code: "inconsistent_result", summary: "Rejected operational action results must report blocked resulting status." });
  }
  if (record.outcome === "simulated" && record.resultingStatus !== "unknown") {
    issues.push({ field: "resultingStatus", code: "inconsistent_result", summary: "Simulated operational action results must report unknown resulting status." });
  }
}

function isKnownOperationalTypedReason(value: unknown): value is PipelineOperationalActionTypedReasonV0 {
  return typeof value === "string" && (PIPELINE_OPERATIONAL_ACTION_TYPED_REASONS as readonly string[]).includes(value);
}

function isKnownOperationalRiskTier(value: unknown): value is PipelineOperationalActionRiskTierV0 {
  return typeof value === "string" && (PIPELINE_OPERATIONAL_ACTION_RISK_TIERS as readonly string[]).includes(value);
}

function requiresOperationalCapabilityTargetId(record: Record<string, unknown>): boolean {
  if (record.capabilityState !== "available" || record.authorityState !== "allowed") return false;
  const actionId = record.actionId;
  const mutatingAction = typeof actionId === "string" && !["inspect", "refresh_projection"].includes(actionId);
  const elevatedRisk = isKnownOperationalRiskTier(record.riskTier) && OPERATIONAL_ACTION_RISK_RANK[record.riskTier] >= OPERATIONAL_ACTION_RISK_RANK.high;
  return mutatingAction || elevatedRisk;
}

function readinessCapabilityRequiresBoundedWrite(record: Record<string, unknown>): boolean {
  if (record.capabilityState !== "available" || record.authorityState !== "allowed") return false;
  const actionId = record.actionId;
  const mutatingAction = typeof actionId === "string" && !["inspect", "refresh_projection"].includes(actionId);
  const elevatedRisk = isKnownOperationalRiskTier(record.riskTier) && OPERATIONAL_ACTION_RISK_RANK[record.riskTier] >= OPERATIONAL_ACTION_RISK_RANK.high;
  return mutatingAction || elevatedRisk;
}

function isSafeOperationalMetadataText(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed === value &&
    trimmed.length > 0 &&
    trimmed.length <= 500 &&
    !/[\u0000-\u001F\u007F]/.test(trimmed) &&
    !FORBIDDEN_OPERATIONAL_ACTION_METADATA.test(trimmed) &&
    !SECRET_LIKE_OPERATIONAL_ACTION_REF.test(trimmed)
  );
}

function isSafeOperationalIdentifierText(value: string): boolean {
  return (
    isSafeOperationalMetadataText(value) &&
    value === value.toLowerCase() &&
    !/\s/.test(value) &&
    OPERATIONAL_ACTION_IDENTIFIER.test(value) &&
    !OPERATIONAL_ACTION_IDENTIFIER_REPEATED_SEPARATOR.test(value) &&
    !OPERATIONAL_ACTION_IDENTIFIER_PATH_SEGMENT.test(value)
  );
}

function pushRequestedByIssues(issues: PipelineOperationalActionValidationIssueV0[], value: unknown): void {
  const actor = operationalActionRecord(value, issues, "requestedBy");
  pushUnknownFieldIssues(issues, actor, OPERATIONAL_ACTION_ACTOR_KEYS);
  const actorType = safeOperationalField(issues, actor, "requestedBy.actorType");
  const rawActorId = safeOperationalField(issues, actor, "requestedBy.actorId");
  const rawActorLabel = safeOperationalField(issues, actor, "requestedBy.actorLabel");
  if (!isOneOfString(actorType, ["system", "operator", "manager", "worker"])) {
    issues.push({ field: "requestedBy.actorType", code: "invalid_actor", summary: "Operational action requests require a known accountable actor type." });
  }
  const actorId = typeof rawActorId === "string" ? rawActorId.trim() : "";
  const actorLabel = typeof rawActorLabel === "string" ? rawActorLabel.trim() : "";
  if (!actorId && !actorLabel) {
    issues.push({ field: "requestedBy", code: "invalid_actor", summary: "Operational action requests require an accountable actor id or label." });
  }
  if (actorId && (typeof rawActorId !== "string" || !isSafeOperationalIdentifierText(rawActorId))) {
    issues.push({ field: "requestedBy.actorId", code: "unsafe_metadata_retention", summary: "Operational action actor ids must be safe metadata text." });
  }
  if (actorLabel && (typeof rawActorLabel !== "string" || !isSafeOperationalMetadataText(rawActorLabel))) {
    issues.push({ field: "requestedBy.actorLabel", code: "unsafe_metadata_retention", summary: "Operational action actor labels must be safe metadata text." });
  }
}

function isOneOfString(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === "string" && allowed.includes(value);
}

function safeOperationalField(
  issues: PipelineOperationalActionValidationIssueV0[],
  record: Record<string, unknown>,
  field: string,
): unknown {
  try {
    const key = field.includes(".") ? field.slice(field.lastIndexOf(".") + 1) : field;
    return record[key];
  } catch {
    issues.push({
      field,
      code: "forbidden_field",
      summary: "Operational action metadata could not be safely inspected.",
    });
    return undefined;
  }
}

const OPERATIONAL_ACTION_ACTOR_KEYS = new Set(["actorId", "actorLabel", "actorType"]);

function pushRequiredCapabilityGuardIssues(issues: PipelineOperationalActionValidationIssueV0[], record: Record<string, unknown>): void {
  if (record.correlationRequired !== true) {
    issues.push({ field: "correlationRequired", code: "policy_violation", summary: "Operational action capabilities must require correlation ids." });
  }
  if (record.idempotencyRequired !== true) {
    issues.push({ field: "idempotencyRequired", code: "policy_violation", summary: "Operational action capabilities must require idempotency keys." });
  }
}

function pushReadinessAvailableCapabilityIssues(
  issues: PipelineOperationalActionValidationIssueV0[],
  record: Record<string, unknown>,
  actionCapabilities: unknown[],
): void {
  if (record.readinessState !== "ready" || record.capabilityState !== "available") return;
  const capabilities = new Map<string, Record<string, unknown>>();
  for (const capability of actionCapabilities) {
    if (!capability || typeof capability !== "object") continue;
    const capabilityRecord = capability as Record<string, unknown>;
    if (typeof capabilityRecord.actionId === "string") {
      capabilities.set(capabilityRecord.actionId, capabilityRecord);
    }
  }
  for (const actionId of ["inspect", "refresh_projection"]) {
    const capability = capabilities.get(actionId);
    if (
      !capability ||
      capability.capabilityState !== "available" ||
      capability.authorityState !== "allowed" ||
      capability.typedReason !== null
    ) {
      issues.push({
        field: "actionCapabilities",
        code: "inconsistent_result",
        summary: "Ready aggregate operational readiness requires available inspect and refresh_projection capabilities.",
      });
      return;
    }
  }
}

function pushReadinessOperationalModeCapabilityIssues(
  issues: PipelineOperationalActionValidationIssueV0[],
  record: Record<string, unknown>,
  actionCapabilities: unknown[],
): void {
  for (const capability of actionCapabilities) {
    if (!capability || typeof capability !== "object") continue;
    const capabilityRecord = capability as Record<string, unknown>;
    if (readinessCapabilityRequiresBoundedWrite(capabilityRecord) && record.operationalMode !== "bounded_write") {
      issues.push({
        field: "operationalMode",
        code: "inconsistent_result",
        summary: "Available mutating or elevated-risk runtime capabilities require bounded_write readiness.",
      });
      return;
    }
  }
}

const OPERATIONAL_ACTION_REQUEST_KEYS = new Set([
  "schemaVersion",
  "actionId",
  "targetType",
  "targetId",
  "idempotencyKey",
  "correlationId",
  "requestedBy",
  "requestedAuthorityState",
  "requestedRiskTier",
  "approvalId",
  "operatorIntentSummary",
  "expectedCurrentEventId",
  "testResult",
  "testNotes",
  "evidenceRefs",
  "metadataOnly",
  "rawPayloadRetained",
]);

const OPERATIONAL_ACTION_APPROVAL_KEYS = new Set([
  "approvalId",
  "actionId",
  "targetType",
  "targetId",
  "requestedBy",
  "requestedAuthorityState",
  "requestedRiskTier",
  "expectedCurrentEventId",
  "issuedAt",
  "expiresAt",
  "consumed",
  "consumedAt",
  "consumedActionIdempotencyKey",
  "consumedActionRecordId",
  "metadataOnly",
  "rawPayloadRetained",
]);

const OPERATIONAL_ACTION_RESULT_KEYS = new Set([
  "schemaVersion",
  "actionId",
  "targetType",
  "targetId",
  "outcome",
  "resultingStage",
  "resultingStatus",
  "capabilityState",
  "authorityState",
  "riskTier",
  "typedReason",
  "evidenceRefs",
  "correlationId",
  "idempotencyKey",
  "actionRecordId",
  "approvalId",
  "childPacketId",
  "metadataOnly",
  "rawPayloadRetained",
]);

const OPERATIONAL_ACTION_CAPABILITY_KEYS = new Set([
  "actionId",
  "targetType",
  "targetId",
  "capabilityState",
  "authorityState",
  "riskTier",
  "typedReason",
  "expectedResultSummary",
  "correlationRequired",
  "idempotencyRequired",
  "evidenceRefs",
  "metadataOnly",
  "rawPayloadRetained",
]);

const OPERATIONAL_RUNTIME_READINESS_KEYS = new Set([
  "schemaVersion",
  "actionSchemaVersion",
  "readinessState",
  "operationalMode",
  "freshnessState",
  "capabilityState",
  "typedReason",
  "checkedAt",
  "expiresAt",
  "summary",
  "actionCapabilities",
  "evidenceRefs",
  "metadataOnly",
  "rawPayloadRetained",
]);

function pushUnknownFieldIssues(
  issues: PipelineOperationalActionValidationIssueV0[],
  record: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
): void {
  const entries = safeOperationalObjectEntries(issues, record, "");
  if (!entries) return;
  for (const [field] of entries) {
    if (!allowedKeys.has(field)) {
      issues.push({
        field,
        code: "forbidden_field",
        summary: "Operational action objects must not include uncontracted fields.",
      });
    }
  }
}

function pushForbiddenObjectFieldIssues(issues: PipelineOperationalActionValidationIssueV0[], record: Record<string, unknown>): void {
  pushForbiddenValueIssues(issues, record, "", new WeakSet<object>(), 0, { count: 0, stopped: false });
}

function pushForbiddenValueIssues(
  issues: PipelineOperationalActionValidationIssueV0[],
  value: unknown,
  path: string,
  seen: WeakSet<object>,
  depth: number,
  budget: { count: number; stopped: boolean },
): void {
  if (budget.stopped) return;
  budget.count += 1;
  if (depth > OPERATIONAL_ACTION_METADATA_MAX_DEPTH || budget.count > OPERATIONAL_ACTION_METADATA_MAX_NODES) {
    if (!budget.stopped) {
      issues.push({
        field: path || "value",
        code: "forbidden_field",
        summary: "Operational action metadata exceeds bounded validation depth.",
      });
    }
    budget.stopped = true;
    return;
  }
  if (safeOperationalIsArray(value)) {
    const arrayValue = value as object;
    if (seen.has(arrayValue)) {
      issues.push({
        field: path || "value",
        code: "forbidden_field",
        summary: "Operational action metadata must not contain cyclic object references.",
      });
      return;
    }
    seen.add(arrayValue);
    const values = safeOperationalArrayValues(issues, value, path || "value");
    if (!values) {
      seen.delete(arrayValue);
      return;
    }
    for (const [index, item] of values.entries()) {
      pushForbiddenValueIssues(issues, item, `${path}.${index}`, seen, depth + 1, budget);
    }
    seen.delete(arrayValue);
    return;
  }
  if (!value || typeof value !== "object") {
    if (
      typeof value === "string" &&
      (FORBIDDEN_OPERATIONAL_ACTION_METADATA.test(value) || SECRET_LIKE_OPERATIONAL_ACTION_REF.test(value))
    ) {
      issues.push({
        field: path || "value",
        code: "unsafe_metadata_retention",
        summary: "Operational action objects must not retain raw payload, provider, terminal, or secret-like metadata text.",
      });
    }
    return;
  }
  if (seen.has(value)) {
    issues.push({
      field: path || "value",
      code: "forbidden_field",
      summary: "Operational action metadata must not contain cyclic object references.",
    });
    return;
  }
  seen.add(value);
  const entries = safeOperationalObjectEntries(issues, value as Record<string, unknown>, path || "value");
  if (!entries) {
    seen.delete(value);
    return;
  }
  for (const [field, nested] of entries) {
    const nestedPath = path ? `${path}.${field}` : field;
    if (FORBIDDEN_OPERATIONAL_ACTION_OBJECT_FIELD.test(field) || FORBIDDEN_OPERATIONAL_ACTION_METADATA.test(field)) {
      issues.push({
        field: nestedPath,
        code: "forbidden_field",
        summary: "Operational action objects must not retain raw prompts, provider payloads, secrets, credentials, or terminal output fields.",
      });
    }
    pushForbiddenValueIssues(issues, nested, nestedPath, seen, depth + 1, budget);
  }
  seen.delete(value);
}

function safeOperationalObjectEntries(
  issues: PipelineOperationalActionValidationIssueV0[],
  value: Record<string, unknown>,
  path: string,
): [string, unknown][] | null {
  try {
    return Object.entries(value);
  } catch {
    issues.push({
      field: path || "value",
      code: "forbidden_field",
      summary: "Operational action metadata could not be safely inspected.",
    });
    return null;
  }
}

function safeOperationalArrayValues(
  issues: PipelineOperationalActionValidationIssueV0[],
  value: unknown,
  path: string,
): unknown[] | null {
  const values = safeOperationalUnknownArray(value);
  if (values) return values;
  try {
    if (!Array.isArray(value)) return null;
    const length = typeof value.length === "number" ? value.length : 0;
    if (length > OPERATIONAL_ACTION_METADATA_MAX_NODES) {
      issues.push({
        field: path,
        code: "forbidden_field",
        summary: "Operational action metadata array exceeds bounded validation size.",
      });
    }
  } catch {
    issues.push({
      field: path,
      code: "forbidden_field",
      summary: "Operational action metadata could not be safely inspected.",
    });
  }
  return null;
}

function safeOperationalUnknownArray(value: unknown): unknown[] | null {
  try {
    if (!Array.isArray(value)) return null;
    if (value.length > OPERATIONAL_ACTION_METADATA_MAX_NODES) return null;
    return Array.from(value);
  } catch {
    return null;
  }
}

function safeOperationalStringArray(value: unknown): string[] | null {
  try {
    const values = safeOperationalUnknownArray(value);
    if (!values) return null;
    return values.filter((ref): ref is string => typeof ref === "string");
  } catch {
    return null;
  }
}

function safeOperationalIsArray(value: unknown): boolean {
  try {
    return Array.isArray(value);
  } catch {
    return false;
  }
}

function pushReadinessCapabilityCoverageIssues(
  issues: PipelineOperationalActionValidationIssueV0[],
  capabilities: unknown[],
): void {
  const counts = new Map<string, number>();
  for (const capability of capabilities) {
    const actionId = operationalActionRecord(capability, issues, "actionCapabilities").actionId;
    if (typeof actionId === "string") {
      counts.set(actionId, (counts.get(actionId) || 0) + 1);
    }
  }
  for (const actionId of PIPELINE_OPERATIONAL_ACTION_IDS) {
    if (counts.get(actionId) !== 1) {
      issues.push({
        field: "actionCapabilities",
        code: "inconsistent_result",
        summary: "Operational runtime readiness requires every built-in action capability exactly once.",
      });
      return;
    }
  }
  for (const [actionId, count] of counts.entries()) {
    if (!isPipelineOperationalActionIdV0(actionId) || count !== 1) {
      issues.push({
        field: "actionCapabilities",
        code: "inconsistent_result",
        summary: "Operational runtime readiness requires every built-in action capability exactly once.",
      });
      return;
    }
  }
}

function operationalActionRecord(
  value: unknown,
  issues?: PipelineOperationalActionValidationIssueV0[],
  path = "value",
): Record<string, unknown> {
  if (!value || typeof value !== "object" || safeOperationalIsArray(value)) return {};
  if (!issues) return {};
  const entries = safeOperationalObjectEntries(issues, value as Record<string, unknown>, path);
  if (!entries) return {};
  const record: Record<string, unknown> = {};
  for (const [field, fieldValue] of entries) {
    record[field] = fieldValue;
  }
  return record;
}

export type PipelineProjectionSourceLabelV0 = "live" | "stale" | "fixture" | "simulated" | "dry_run" | "unavailable" | "unknown";
export type PipelineProjectionFreshnessStateV0 = "live" | "stale" | "unavailable" | "unknown";
export type PipelinePacketUnblockerV0 = "operator" | "manager" | "worker" | "source" | "system" | "unknown";
export type PipelineProjectionEmptyReasonV0 =
  | "healthy_empty"
  | "source_exhausted"
  | "blocked"
  | "refilling"
  | "usage_limited"
  | "resource_limited"
  | "cleanup_gated"
  | "approval_required"
  | "failure_budget_hit"
  | "backend_unavailable"
  | "projection_stale"
  | "unknown";

export interface PipelineBackendReachabilityV0 {
  state: "reachable" | "unavailable" | "unknown";
  checkedAt: string;
  reason?: PipelineProjectionEmptyReasonV0 | null;
  summary: string;
}

export interface PipelineFixtureModeV0 {
  enabled: boolean;
  reason: string | null;
  allowedForEnvironment: boolean;
  visibleLabelRequired: true;
  canSatisfyLiveProof: false;
}

export interface PipelineTruthSummaryV0 {
  label: PipelineProjectionSourceLabelV0;
  emptyReason: PipelineProjectionEmptyReasonV0 | null;
  backendEmpty: boolean;
  backendUnavailable: boolean;
  fixtureBacked: boolean;
  stale: boolean;
  summary: string;
}

export interface PipelineStageSummaryV0 {
  stage: AuthoritativePacketStage;
  label: string;
  packetCount: number;
  sourceLabel: PipelineProjectionSourceLabelV0;
  freshnessState: PipelineProjectionFreshnessStateV0;
  emptyReason: PipelineProjectionEmptyReasonV0 | null;
}

export type PipelineSourceStateValueV0 =
  | "healthy"
  | "exhausted"
  | "blocked"
  | "gated"
  | "stale"
  | "unavailable"
  | "refilling"
  | "unknown";

export type PipelineSourceKindV0 =
  | AuthoritativePacketSourceRef["sourceType"]
  | "candidate_work"
  | "work_item"
  | "bmad_artifact"
  | "obsidian"
  | "llm_wiki"
  | "github"
  | "research"
  | "manual"
  | "unknown";

export interface PipelineSourceStateV0 {
  sourceId: string;
  sourceRef: string;
  sourceKind: PipelineSourceKindV0;
  state: PipelineSourceStateValueV0;
  summary: string;
  evidenceRefs: string[];
  updatedAt: string;
  metadataOnly: true;
}

export interface PipelineQueueLeaseV0 {
  leaseId: string;
  workItemId: string;
  attemptCount: number;
  heartbeatAt: string;
  leaseExpiresAt: string;
  fencingToken: number;
  active: boolean;
  state: "active" | "expired" | "inactive";
  metadataOnly: true;
}

export interface PipelineExecutionAttemptLineageV0 {
  attemptId: string;
  workItemId: string;
  leaseId?: string | null;
  fencingToken?: number | null;
  routeDecisionId: string;
  workerId: string;
  lane: string;
  status: string;
  eventRefs: string[];
  evidenceRefs: string[];
  metadataOnly: true;
}

export interface PipelineReadyToTestV0 {
  readyId: string;
  userFacingSummary: string;
  testableSurface: string;
  verificationRefs: string[];
  evidenceRefs: string[];
  metadataOnly: true;
  rawPayloadRetained: false;
}

export interface PipelineDashboardWorkPacketV0 {
  packetId: string;
  title: string;
  currentStage: AuthoritativePacketStage;
  status: AuthoritativePacketStatus;
  truthLabel: PipelineProjectionSourceLabelV0;
  sourceRef: AuthoritativePacketSourceRef | null;
  canonicalContract: PipelineCanonicalContractV1 | null;
  productModeMapping: PipelineProductModeMappingV0 | null;
  blocker: string | null;
  nextAction: string | null;
  unblocker: PipelinePacketUnblockerV0;
  readyToTest?: PipelineReadyToTestV0 | null;
  evidenceRefs: string[];
  workItemId?: string | null;
  queueLease?: PipelineQueueLeaseV0 | null;
  executionAttempts?: PipelineExecutionAttemptLineageV0[];
  correlationIds?: string[];
  updatedAt: string;
  metadataOnly: true;
}

export interface PipelineSelectedPacketDetailV0 {
  packetId: string;
  sourceRefs: AuthoritativePacketSourceRef[];
  canonicalContract: PipelineCanonicalContractV1 | null;
  productModeMapping: PipelineProductModeMappingV0 | null;
  evidenceRefs: string[];
  currentStage: AuthoritativePacketStage;
  status: AuthoritativePacketStatus;
  truthLabel: PipelineProjectionSourceLabelV0;
  blocker: string | null;
  nextAction: string | null;
  unblocker: PipelinePacketUnblockerV0;
  readyToTest?: PipelineReadyToTestV0 | null;
  latestTransitionEventRef?: string | null;
  recentTransitionEventRefs?: string[];
  latestMovementSummary?: string | null;
  canSatisfyLiveMovementProof?: boolean;
  parentPacketId?: string | null;
  lineageKind?: string;
  operatorTestState?: "not_ready" | "ready" | "passed" | "failed" | "rework";
  operatorTestNote?: string | null;
  actionCapabilities?: PipelineOperationalActionCapabilityV0[];
  actionResults?: PipelineOperationalActionResultV0[];
  workItemId?: string | null;
  queueLease?: PipelineQueueLeaseV0 | null;
  executionAttempts?: PipelineExecutionAttemptLineageV0[];
  correlationIds?: string[];
  metadataOnly: true;
}

export interface PipelineManagerSummaryV0 {
  stateSource: "supervisor_projection" | "manager_summary" | "unavailable" | "unknown";
  reliabilityState:
    | "ready"
    | "running"
    | "healthy_idle"
    | "source_exhausted"
    | "waiting_for_approval"
    | "blocked"
    | "refilling"
    | "degraded"
    | "unavailable"
    | "unknown";
  freshnessState: PipelineProjectionFreshnessStateV0;
  activeLeaseCount: number | null;
  activeWorkerCount: number | null;
  warmWorkerCount: number | null;
  blockedQueueCount: number | null;
  dispatchableQueueCount: number | null;
  closedQueueCount: number | null;
  healthySourceCount: number | null;
  exhaustedSourceCount: number | null;
  blockedSourceCount: number | null;
  gatedSourceCount: number | null;
  staleSourceCount: number | null;
  unavailableSourceCount: number | null;
  refillingSourceCount: number | null;
  unknownSourceCount: number | null;
  sourceExhausted: boolean;
  inactivityReason: PipelineProjectionEmptyReasonV0 | null;
  evidenceRefs: string[];
  summary: string;
  metadataOnly: true;
}

export interface PipelineWorkerSummaryV0 {
  stateSource: "supervisor_projection" | "manager_summary" | "unavailable" | "unknown";
  freshnessState: PipelineProjectionFreshnessStateV0;
  warmCount: number | null;
  activeCount: number | null;
  waitingCount: number | null;
  stalledCount: number | null;
  failedCount: number | null;
  drainingCount: number | null;
  killedCount: number | null;
  completeCount: number | null;
  unavailableCount: number | null;
  unknownCount: number | null;
  workerRefs: string[];
  evidenceRefs: string[];
  summary: string;
  metadataOnly: true;
}

export interface PipelineReliabilityProblemV0 {
  problemId: string;
  kind:
    | "idle_with_ready_work"
    | "stalled_worker"
    | "stale_projection"
    | "backend_unavailable"
    | "source_blocked"
    | "approval_required"
    | "usage_limited"
    | "resource_limited"
    | "unknown";
  severity: "info" | "attention" | "blocked";
  likelyIssue: "manager" | "worker" | "source" | "approval" | "usage" | "resource" | "unknown";
  summary: string;
  evidenceRefs: string[];
  metadataOnly: true;
}

export interface PipelineGatedControlV0 {
  controlId: string;
  operation:
    | "kill_worker"
    | "drain_worker"
    | "cleanup_workspace"
    | "takeover_workspace"
    | "provider_call"
    | "github_mutation"
    | "worker_launch"
    | "lease_mutation"
    | "source_mutation"
    | "terminal_access"
    | "raw_payload_retention"
    | "unknown";
  status: "gated" | "action_needed" | "blocked";
  authorityFamily: string;
  stopLine: string;
  nextAction: string;
  packetId: string | null;
  workerRefs: string[];
  evidenceRefs: string[];
  metadataOnly: true;
}

export interface PipelineQueueSummaryV0 {
  activeCount: number | null;
  dispatchableCount: number | null;
  blockedCount: number | null;
  gatedCount: number | null;
  closedCount: number | null;
  staleCount: number | null;
  refillingCount: number | null;
  unknownCount: number | null;
  emptyReason: PipelineProjectionEmptyReasonV0 | null;
  sourceExhausted: boolean;
  summary: string;
}

export interface PipelineExecuteAdmissionCountsV0 {
  review: number;
  deliver: number;
  verification: number;
  operatorTesting: number;
}

export interface PipelineExecuteAdmissionV0 {
  schemaVersion: "pipeline-execute-admission/v0";
  policyVersion: "supervisor-wip/v0";
  state: "ready" | "blocked" | "unavailable";
  capacityAvailable: boolean;
  typedReason:
    | "capacity_available"
    | "review_wip_limit_reached"
    | "deliver_wip_limit_reached"
    | "verification_wip_limit_reached"
    | "operator_testing_wip_limit_reached"
    | "runtime_unavailable";
  source: "supervisor_settings" | "unavailable";
  limits: PipelineExecuteAdmissionCountsV0 | null;
  observed: PipelineExecuteAdmissionCountsV0 | null;
  blockingDimensions: Array<"review" | "deliver" | "verification" | "operatorTesting">;
  nextSafeAction: string;
  evidenceRefs: string[];
  metadataOnly: true;
  rawPayloadRetained: false;
}

export interface PipelineDashboardProjectionV0 {
  schemaVersion: "pipeline-dashboard-projection/v0";
  projectionId: string;
  generatedAt: string;
  sourceUpdatedAt: string;
  sourceLabel: PipelineProjectionSourceLabelV0;
  freshnessState: PipelineProjectionFreshnessStateV0;
  staleAfterSeconds: number;
  backendReachability: PipelineBackendReachabilityV0;
  fixtureMode: PipelineFixtureModeV0;
  truthSummary: PipelineTruthSummaryV0;
  stageSummaries: PipelineStageSummaryV0[];
  sourceStates: PipelineSourceStateV0[];
  workPackets: PipelineDashboardWorkPacketV0[];
  selectedPacketDetails: PipelineSelectedPacketDetailV0[];
  managerSummary: PipelineManagerSummaryV0;
  workerSummary: PipelineWorkerSummaryV0;
  reliabilityProblems: PipelineReliabilityProblemV0[];
  gatedControls: PipelineGatedControlV0[];
  runtimeReadiness?: PipelineOperationalRuntimeReadinessV0;
  actionCapabilities?: PipelineOperationalActionCapabilityV0[];
  executeAdmission: PipelineExecuteAdmissionV0;
  queueSummary: PipelineQueueSummaryV0;
  evidenceRefs: string[];
}
