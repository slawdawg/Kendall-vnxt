import { isDeepStrictEqual } from "node:util";

const SCHEMA_VERSION = "pipeline-operational-readiness-contract/v0";
const CANARY_SCHEMA_VERSION = "pipeline-one-worker-live-canary/v0";
const RAMP_SCHEMA_VERSION = "pipeline-live-capacity-ramp/v0";
const RECOVERY_SCHEMA_VERSION = "pipeline-resilience-recovery-validation/v0";
const HARDENING_SCHEMA_VERSION = "pipeline-operational-hardening-runbooks/v0";
const PRODUCTION_DECISION_SCHEMA_VERSION = "pipeline-production-readiness-decision/v0";
const OBSERVED_EVIDENCE_ATTESTATION_SCHEMA_VERSION = "pipeline-observed-evidence-attestation/v0";
const GATE_STATES = new Set(["pass", "fail", "blocked", "not_applicable"]);
const BACKEND_TRUTHS = new Set(["live", "simulated", "dry_run"]);
const OUTCOMES = new Set(["go", "no_go"]);
const CANARY_OUTCOMES = new Set(["pass", "hold", "stop"]);
const RAMP_OUTCOMES = new Set(["pass", "hold", "stop"]);
const RECOVERY_OUTCOMES = new Set(["pass", "hold", "stop"]);
const HARDENING_OUTCOMES = new Set(["pass", "hold", "stop"]);
const PRODUCTION_DECISIONS = new Set(["go", "hold", "limited_rollout"]);
const EVIDENCE_CLASSES = new Set(["fixture", "integrated_local", "live_observed"]);
const DEFAULT_RAMP_WORKER_COUNTS = [1, 2, 4, 6];
const RECOVERY_DRILL_KINDS = ["restart", "worker_death", "stale_lease", "timeout", "verification_failure", "pause_drain", "handoff", "recovery"];
const HARDENING_DOMAINS = ["alerts", "readiness", "authority", "secrets", "resources", "cost", "rollback", "incident_support", "retention", "cleanup"];
const FRESHNESS_TTL_MS = 5 * 60 * 1000;
const FUTURE_SKEW_MS = 60 * 1000;
const CANONICAL_CONTRACT_SCHEMA_VERSION = "pipeline-canonical-contract/v1";
const CANONICAL_READINESS_COMPONENT_IDS = [
  "source_provenance",
  "trust_boundary",
  "authority_boundary",
  "evidence_retention",
  "quality_gates",
  "delivery_evidence",
];
const CANONICAL_PRODUCT_MODES = new Set(["contract_only", "operator_review", "local_proof", "read_only", "bounded_write"]);
const CANONICAL_DELIVERY_ACTIONS = new Set(["branch_push", "pull_request", "merge", "cleanup"]);
const CANONICAL_RETENTION_DISPOSITIONS = new Set(["metadata_only", "summary_only", "fixture_only"]);
const CANONICAL_ACTION_TYPED_REASONS = new Set(["no_eligible_work", "blocked_by_policy", "blocked_by_approval", "blocked_by_resources", "runtime_unavailable", "worker_failed", "verification_failed", "delivery_blocked", "evidence_invalid", "projection_stale", "invalid_transition", "test_not_ready", "authenticated_session_required", "unsupported_action", "unknown"]);
const CANONICAL_FORBIDDEN_FIELD = /^(?:rawPrompt|rawCompletion|rawPayload|providerPayload|reasoningTrace|secret|credential|password|apiKey|accessToken|terminalOutput|stdout|stderr|transcript)$/i;
const SAFE_REF = /^(?:manager-cycle|preflight|usage|resources|operational-action|verification|evidence|story|assignment|task|source|prd|check|checkpoint|command|test|artifact|readiness):[A-Za-z0-9._/@:-]{1,180}$/;
const SECRET_LIKE = /\b(?:sk-[A-Za-z0-9_-]{8,}|(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|(?:api|secret|token|credential)[_-]?(?:key|token|secret)?[:=])/i;
const FORBIDDEN = /\b(?:raw[\s_-]*(?:prompt|completion|transcript|log|source)|reasoning[\s_-]*trace|provider[\s_-]*payload|secret(?:[\s_-]*(?:key|token|value|id))?|credential|password|api[\s_-]*key|access[\s_-]*token|terminal[\s_-]*(?:scrollback|output)|tmux[\s_-]*scrollback|pane[\s_-]*text)\b/i;

const REQUIRED_GATES = [
  "exact_ownership",
  "source_evidence",
  "backend_truth",
  "authority_risk",
  "recovery_rollback",
  "resource_cost",
  "configuration_secrets",
  "telemetry_alerts",
  "preflight",
  "usage",
  "resources",
  "heartbeat",
  "dispatcher_lease",
  "receipt_evidence",
];

const REQUIRED_INDICATORS = [
  "heartbeat_freshness",
  "readiness_projection_freshness",
  "lease_checkpoint_receipt_proof",
  "preflight",
  "usage",
  "resources",
  "telemetry",
  "errors",
  "latency",
  "cost",
];

function text(value, fallback = "", max = 500) {
  const result = typeof value === "string" ? value.trim() : fallback;
  return result.slice(0, max);
}

function safeText(value, fallback = "", max = 500) {
  const result = text(value, fallback, max);
  return Boolean(result) && !FORBIDDEN.test(result) && !SECRET_LIKE.test(result) && !/[\u0000-\u001f\u007f]/.test(result);
}

function safeId(value) {
  const result = text(value).toLowerCase();
  return /^[a-z0-9](?:[a-z0-9._/@:,-]{0,198}[a-z0-9])?$/.test(result) && !result.includes("..") && !result.includes("//") ? result : "";
}

function refs(value, { allowReadiness = true } = {}) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 24) return [];
  return value.filter((entry) => {
    const ref = text(entry, "", 180);
    return ref === entry && (SAFE_REF.test(ref) || (allowReadiness && /^readiness:[A-Za-z0-9._/@:-]{1,180}$/.test(ref))) && !FORBIDDEN.test(ref) && !SECRET_LIKE.test(ref) && !ref.includes("../");
  });
}

function reasonFor(code, fallback = "unknown") {
  const known = new Set([
    "threshold_missing", "threshold_malformed", "telemetry_missing", "telemetry_stale", "telemetry_contradictory",
    "alert_coverage_missing", "rollback_missing", "recovery_missing", "ownership_ambiguous", "target_not_exact",
    "evidence_missing", "evidence_stale", "backend_truth_unproven", "configuration_invalid", "secret_like_metadata",
    "resource_pressure", "usage_pressure", "preflight_blocked", "dispatcher_lease_unproven", "receipt_unproven",
    "predecessor_gate_not_passed", "safety_violation", "authority_violation", "canary_authority_missing",
    "lease_missing", "checkpoint_missing", "latency_threshold_exceeded", "error_threshold_exceeded",
    "resource_threshold_exceeded", "cost_threshold_exceeded", "timeout", "recovery_boundary_breached", "unknown",
    "canary_not_passed", "stage_plan_invalid", "capacity_missing", "stage_threshold_exceeded",
    "stage_lifecycle_ambiguous", "stage_authority_missing", "stage_evidence_missing",
    "drill_evidence_missing", "recovery_ambiguity", "idempotency_unproven", "silent_retry", "recovery_drill_failed", "fixture_evidence",
    "evidence_provenance_missing", "evidence_attestation_invalid", "evidence_receipt_stale",
    "runbook_gap", "high_risk_gap", "runbook_owner_missing", "runbook_trigger_missing", "runbook_gate_missing", "runbook_recovery_missing",
    "canonical_contract_missing", "canonical_contract_invalid", "canonical_contract_contradictory",
  ]);
  return known.has(code) ? code : fallback;
}

function own(record, key) {
  return Boolean(record && typeof record === "object" && Object.prototype.hasOwnProperty.call(record, key));
}

function sha256Ref(value) {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value) ? value : "";
}

function exactObjectKeys(value, keys) {
  return plainRecord(value) && Object.keys(value).every((key) => keys.has(key));
}

function observationTargetRef(target = {}) {
  const owner = safeId(target?.owner);
  const workerId = safeId(target?.workerId);
  if (owner && (!workerId || owner === workerId || owner.endsWith(`/${workerId}`))) return owner;
  return owner && workerId ? `${owner}/${workerId}` : owner || workerId;
}

function observedEvidenceAttestation(value, packetSchemaVersion, checkedAtMs, expectedTargetRef = "") {
  if (!plainRecord(value) || value.schemaVersion !== OBSERVED_EVIDENCE_ATTESTATION_SCHEMA_VERSION ||
      value.evidenceClass !== "live_observed" || value.metadataOnly !== true || value.rawPayloadRetained !== false ||
      !exactObjectKeys(value, new Set(["schemaVersion", "attestationId", "evidenceClass", "observer", "subject", "receipt", "metadataOnly", "rawPayloadRetained"])) ||
      !canonicalPayloadSafe(value)) return null;
  const observer = plainRecord(value.observer) ? value.observer : {};
  const subject = plainRecord(value.subject) ? value.subject : {};
  const receipt = plainRecord(value.receipt) ? value.receipt : {};
  const observedAtMs = Date.parse(receipt.observedAt || "");
  const issuedAtMs = Date.parse(receipt.issuedAt || "");
  const expiresAtMs = Date.parse(receipt.expiresAt || "");
  const valid = Boolean(
    safeId(value.attestationId) && observer.observerType === "independent_runtime" && safeId(observer.observerId) &&
    exactObjectKeys(observer, new Set(["observerType", "observerId"])) &&
    exactObjectKeys(subject, new Set(["packetSchemaVersion", "targetRef"])) &&
    exactObjectKeys(receipt, new Set(["receiptId", "observedAt", "issuedAt", "expiresAt", "evidenceDigestSha256", "sourceRefs", "evidenceRefs"])) &&
    subject.packetSchemaVersion === packetSchemaVersion && safeId(subject.targetRef) &&
    (!expectedTargetRef || safeId(subject.targetRef) === expectedTargetRef) && safeId(receipt.receiptId) &&
    sha256Ref(receipt.evidenceDigestSha256) && refs(receipt.sourceRefs).length === receipt.sourceRefs?.length && receipt.sourceRefs.length > 0 &&
    refs(receipt.evidenceRefs).length === receipt.evidenceRefs?.length && receipt.evidenceRefs.length > 0 &&
    Number.isFinite(observedAtMs) && Number.isFinite(issuedAtMs) && Number.isFinite(expiresAtMs) &&
    observedAtMs <= issuedAtMs && issuedAtMs <= expiresAtMs && issuedAtMs <= checkedAtMs + FUTURE_SKEW_MS && expiresAtMs >= checkedAtMs &&
    checkedAtMs - observedAtMs <= FRESHNESS_TTL_MS && expiresAtMs - issuedAtMs <= FRESHNESS_TTL_MS
  );
  if (!valid) return null;
  return {
    schemaVersion: OBSERVED_EVIDENCE_ATTESTATION_SCHEMA_VERSION,
    attestationId: safeId(value.attestationId),
    evidenceClass: "live_observed",
    observer: { observerType: "independent_runtime", observerId: safeId(observer.observerId) },
    subject: { packetSchemaVersion, targetRef: safeId(subject.targetRef) },
    receipt: {
      receiptId: safeId(receipt.receiptId),
      observedAt: new Date(observedAtMs).toISOString(),
      issuedAt: new Date(issuedAtMs).toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
      evidenceDigestSha256: receipt.evidenceDigestSha256,
      sourceRefs: refs(receipt.sourceRefs),
      evidenceRefs: refs(receipt.evidenceRefs),
    },
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function evidenceClassFor({ fixtureEvidence, attestation }) {
  return fixtureEvidence ? "fixture" : attestation ? "live_observed" : "integrated_local";
}

function attestationBindsPacket(attestation, sourceRefs, evidenceRefs, expectedTargetRef = "") {
  return Boolean(attestation &&
    (!expectedTargetRef || attestation.subject.targetRef === expectedTargetRef) &&
    attestation.receipt.sourceRefs.some((ref) => sourceRefs.includes(ref)) &&
    attestation.receipt.evidenceRefs.some((ref) => evidenceRefs.includes(ref)));
}

function validateEvidenceProvenance(evidence, packetSchemaVersion, checkedAtMs, context = {}) {
  const blockers = [];
  if (!EVIDENCE_CLASSES.has(evidence?.evidenceClass)) {
    blockers.push({ code: "evidence_provenance_missing", message: "Evidence requires an explicit provenance class." });
    return blockers;
  }
  const expectedTargetRef = safeId(context.targetRef || observationTargetRef(evidence?.target));
  const sourceRefs = refs(context.sourceRefs || evidence?.sourceRefs || evidence?.target?.sourceRefs);
  const evidenceRefs = refs(context.evidenceRefs || evidence?.evidenceRefs || evidence?.target?.evidenceRefs);
  const attestation = observedEvidenceAttestation(evidence?.observedEvidenceAttestation, packetSchemaVersion, checkedAtMs, expectedTargetRef);
  if (evidence.evidenceClass === "live_observed" && !attestation) {
    blockers.push({ code: "evidence_attestation_invalid", message: "Live-observed evidence requires a fresh independently issued observation receipt bound to this packet schema." });
  }
  if (attestation && !attestationBindsPacket(attestation, sourceRefs, evidenceRefs, expectedTargetRef)) {
    blockers.push({ code: "evidence_attestation_invalid", message: "The independent observation receipt is not bound to this packet's source and evidence refs." });
  }
  if (evidence.evidenceClass !== "live_observed" && evidence?.observedEvidenceAttestation != null) {
    blockers.push({ code: "evidence_attestation_invalid", message: "Fixture and integrated-local packets cannot carry promotion-grade observation attestations." });
  }
  return blockers;
}

function plainRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function canonicalText(value, max = 500) {
  return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= max && safeText(value, "", max);
}

function canonicalRefs(value) {
  return Array.isArray(value) && value.length <= 25 && value.every((entry) => canonicalText(entry, 240));
}

function canonicalAuthorityDenied(value) {
  return plainRecord(value) && [
    "sourceMutationAllowed",
    "providerCallsAllowed",
    "workerLaunchAllowed",
    "githubMutationAllowed",
    "rawPayloadRetentionAllowed",
  ].every((key) => value[key] === false);
}

function canonicalPayloadSafe(value, depth = 0, seen = new WeakSet()) {
  if (depth > 16) return false;
  if (value && typeof value === "object") {
    if (seen.has(value)) return false;
    seen.add(value);
  }
  let safe;
  if (Array.isArray(value)) safe = value.length <= 128 && value.every((entry) => canonicalPayloadSafe(entry, depth + 1, seen));
  else if (!plainRecord(value)) safe = typeof value !== "string" || value.length <= 4096;
  else {
    const entries = Object.entries(value);
    safe = entries.length <= 128 && entries.every(([key, nested]) => !CANONICAL_FORBIDDEN_FIELD.test(key) && canonicalPayloadSafe(nested, depth + 1, seen));
  }
  if (value && typeof value === "object") seen.delete(value);
  return safe;
}

function canonicalSourceRef(value) {
  return plainRecord(value) && canonicalText(value.refId, 255) &&
    ["prd", "bmad_story", "operator_input", "workflow", "repo_doc"].includes(value.sourceType) &&
    (value.pathOrUrl == null || canonicalText(value.pathOrUrl, 500)) &&
    (value.title == null || canonicalText(value.title, 255)) &&
    (value.contentSha256 == null || /^[0-9a-f]{64}$/i.test(value.contentSha256));
}

function sameCanonicalSourceRef(left, right) {
  if (!canonicalSourceRef(left) || !canonicalSourceRef(right)) return false;
  return ["refId", "sourceType", "pathOrUrl", "title", "contentSha256"]
    .every((key) => (left[key] ?? null) === (right[key] ?? null));
}

function canonicalDeliveryTarget(value) {
  return plainRecord(value) && canonicalText(value.repository, 240) &&
    ["baseBranch", "headRevision", "pullRequestUrl"].every((key) => value[key] == null || canonicalText(value[key], key === "pullRequestUrl" ? 500 : 240));
}

function canonicalQualityGateState(node, issues, depth = 0) {
  if (!plainRecord(node) || depth > 8 || !canonicalText(node.gateId, 240)) {
    issues.push("quality_gate_invalid");
    return "blocked";
  }
  if (node.kind === "gate") {
    if (!canonicalRefs(node.evidenceRefs)) issues.push("quality_gate_evidence_invalid");
    if (node.requirement === "required" && ["pass", "fail", "blocked"].includes(node.state)) return node.state;
    if (node.requirement === "not_applicable" && node.state === "not_applicable" && canonicalText(node.notApplicableReason, 240)) return "not_applicable";
    issues.push("quality_gate_semantics_invalid");
    return "blocked";
  }
  if (!["all_of", "any_of"].includes(node.kind) || !Array.isArray(node.children) || node.children.length === 0) {
    issues.push("quality_gate_group_invalid");
    return "blocked";
  }
  const states = node.children.map((child) => canonicalQualityGateState(child, issues, depth + 1));
  if (states.every((state) => state === "not_applicable")) return "not_applicable";
  if (node.kind === "all_of") return states.every((state) => ["pass", "not_applicable"].includes(state)) ? "pass" : states.includes("fail") ? "fail" : "blocked";
  return states.some((state) => state === "pass") ? "pass" : states.some((state) => state === "fail") && states.every((state) => ["fail", "not_applicable"].includes(state)) ? "fail" : "blocked";
}

/**
 * Consume supervisor-owned canonical packet/projection truth without granting authority.
 * Both canonical fields absent/null is the only legacy fallback posture.
 */
export function projectCanonicalSupervisorPacket(packet = {}, context = {}) {
  const record = plainRecord(packet) ? packet : {};
  const contract = record.canonicalContract;
  const mapping = record.productModeMapping;
  const hasContract = contract != null;
  const hasMapping = mapping != null;
  if (!hasContract && !hasMapping) {
    return {
      present: false,
      valid: false,
      fallbackAllowed: true,
      status: "legacy_fallback",
      blockers: [],
      readinessReady: false,
      readinessReasons: ["canonical_fields_absent"],
      source: null,
      readinessComponents: null,
      productModeMapping: null,
      retentionEvidence: [],
      qualityEvidence: null,
      deliveryEvidence: [],
      typedCapabilityTruth: null,
    };
  }

  const issues = [];
  if (!hasContract || !hasMapping || !plainRecord(contract) || !plainRecord(mapping)) {
    issues.push("canonical_contract_missing");
  }
  if (!canonicalPayloadSafe({ canonicalContract: contract, productModeMapping: mapping })) issues.push("canonical_payload_unsafe");
  try {
    if (Buffer.byteLength(JSON.stringify({ canonicalContract: contract, productModeMapping: mapping }), "utf8") > 256 * 1024) issues.push("canonical_payload_unsafe");
  } catch {
    issues.push("canonical_payload_unsafe");
  }
  const authority = contract?.authority;
  const source = contract?.canonicalSource;
  const provenance = source?.provenance;
  if (contract?.schemaVersion !== CANONICAL_CONTRACT_SCHEMA_VERSION || !CANONICAL_PRODUCT_MODES.has(contract?.productMode)) issues.push("canonical_contract_invalid");
  if (!plainRecord(source) || !canonicalText(source.sourceId, 240) || source.role !== "canonical" || !["authoritative", "attested"].includes(source.trust)) issues.push("canonical_source_invalid");
  if (!canonicalSourceRef(provenance?.sourceRef) || !Number.isFinite(Date.parse(provenance?.observedAt || "")) || !canonicalRefs(provenance?.evidenceRefs)) issues.push("canonical_provenance_invalid");
  if (!canonicalSourceRef(record.sourceRef)) issues.push("canonical_packet_source_missing");
  else if (!sameCanonicalSourceRef(record.sourceRef, provenance?.sourceRef)) issues.push("canonical_source_contradictory");
  if (!canonicalAuthorityDenied(source?.authority) || !canonicalAuthorityDenied(authority)) issues.push("canonical_authority_invalid");
  if (source?.metadataOnly !== true || source?.rawPayloadRetained !== false || contract?.metadataOnly !== true || contract?.rawPayloadRetained !== false) issues.push("canonical_retention_invalid");

  const readinessComponents = contract?.readinessComponents;
  if (!plainRecord(readinessComponents)) issues.push("canonical_readiness_missing");
  for (const componentId of CANONICAL_READINESS_COMPONENT_IDS) {
    const component = readinessComponents?.[componentId];
    const validRequired = component?.requirement === "required" && ["pass", "fail", "blocked"].includes(component?.state);
    const validNotApplicable = component?.requirement === "not_applicable" && component?.state === "not_applicable" && canonicalText(component?.notApplicableReason, 240);
    if (!plainRecord(component) || component.componentId !== componentId || (!validRequired && !validNotApplicable) || !canonicalRefs(component.evidenceRefs)) issues.push(`canonical_readiness_invalid:${componentId}`);
  }

  const qualityIssues = [];
  const qualityState = canonicalQualityGateState(contract?.qualityGates, qualityIssues);
  issues.push(...qualityIssues);
  if (!Array.isArray(contract?.deliveryEvidence)) issues.push("canonical_delivery_missing");
  for (const delivery of Array.isArray(contract?.deliveryEvidence) ? contract.deliveryEvidence : []) {
    const evidence = delivery?.evidence;
    if (!plainRecord(delivery) || !canonicalText(delivery.deliveryId, 240) || !CANONICAL_DELIVERY_ACTIONS.has(delivery.action) ||
      !["recorded", "blocked", "not_applicable"].includes(delivery.status) || delivery.deliveryAuthorityGranted !== false ||
      delivery.metadataOnly !== true || delivery.rawPayloadRetained !== false || !canonicalAuthorityDenied(delivery.authority) || !canonicalDeliveryTarget(delivery.target) ||
      !plainRecord(evidence) || !canonicalText(evidence.evidenceId, 240) || !CANONICAL_RETENTION_DISPOSITIONS.has(evidence.disposition) ||
      !canonicalRefs(evidence.evidenceRefs) || evidence.metadataOnly !== true || evidence.rawPayloadRetained !== false) issues.push("canonical_delivery_invalid");
  }

  const checkedAtMs = Date.parse(mapping?.checkedAt || "");
  const expiresAtMs = Date.parse(mapping?.expiresAt || "");
  const nowMs = Date.parse(context.now || new Date().toISOString());
  const mappingAuthorityDenied = ["sourceMutationAllowed", "providerCallsAllowed", "workerLaunchAllowed", "githubMutationAllowed"].every((key) => mapping?.[key] === false);
  if (!CANONICAL_PRODUCT_MODES.has(mapping?.requestedProductMode) || ![...CANONICAL_PRODUCT_MODES, "blocked"].includes(mapping?.effectiveProductMode) ||
    !["disabled", "local_proof", "read_only", "bounded_write", "unavailable", "unknown"].includes(mapping?.operationalMode) ||
    !["ready", "degraded", "blocked", "unavailable", "unknown"].includes(mapping?.readinessState) ||
    !["live", "stale", "unavailable", "unknown"].includes(mapping?.freshnessState) ||
    !["available", "gated", "unavailable", "simulated", "unknown"].includes(mapping?.capabilityState) ||
    !Number.isFinite(checkedAtMs) || !Number.isFinite(expiresAtMs) || expiresAtMs < checkedAtMs || typeof mapping?.ready !== "boolean" ||
    !Array.isArray(mapping?.blockedReasons) || !mapping.blockedReasons.every((reason) => canonicalText(reason, 240)) ||
    mapping?.metadataOnly !== true || mapping?.rawPayloadRetained !== false || !mappingAuthorityDenied) issues.push("canonical_mapping_invalid");
  if (mapping?.requestedProductMode !== contract?.productMode) issues.push("canonical_mode_contradictory");
  const requiredReadinessBlocked = CANONICAL_READINESS_COMPONENT_IDS.some((componentId) => {
    const component = readinessComponents?.[componentId];
    return component?.requirement === "required" && ["fail", "blocked"].includes(component?.state);
  });
  if ((mapping?.ready === true && (mapping?.readinessState !== "ready" || mapping?.freshnessState !== "live" || mapping?.blockedReasons?.length > 0 || requiredReadinessBlocked || ["unavailable", "unknown"].includes(mapping?.capabilityState) || ["unavailable", "unknown"].includes(mapping?.operationalMode))) ||
    (mapping?.ready === false && mapping?.readinessState === "ready" && mapping?.blockedReasons?.length === 0) ||
    (mapping?.effectiveProductMode === "blocked" && (mapping?.ready !== false || mapping?.blockedReasons?.length === 0)) ||
    (requiredReadinessBlocked && mapping?.readinessState !== "blocked")) issues.push("canonical_contract_contradictory");
  const stale = Number.isFinite(nowMs) && Number.isFinite(checkedAtMs) && Number.isFinite(expiresAtMs) &&
    (expiresAtMs < nowMs || checkedAtMs > nowMs + FUTURE_SKEW_MS || mapping?.freshnessState !== "live");
  const uniqueIssues = [...new Set(issues)];
  const blockers = uniqueIssues.map((code) => ({
    code: code === "canonical_contract_missing" ? "canonical_contract_missing" : code.includes("contradictory") ? "canonical_contract_contradictory" : "canonical_contract_invalid",
    message: `Supervisor canonical packet truth is not consumable: ${code}.`,
    nextAction: "Refresh the supervisor packet/projection and keep manager capability gated until canonical truth is complete and consistent.",
  }));
  if (stale) blockers.push({ code: "evidence_stale", message: "Supervisor product-mode mapping is stale or not live.", nextAction: "Refresh the authoritative supervisor projection before continuing." });
  const readinessReasons = [
    ...(mapping?.ready === true ? [] : ["product_mode_not_ready"]),
    ...(["pass", "not_applicable"].includes(qualityState) ? [] : [`quality_gates_${qualityState}`]),
    ...(requiredReadinessBlocked ? ["required_readiness_component_blocked"] : []),
    ...(["unavailable", "unknown"].includes(mapping?.capabilityState) ? [`capability_${mapping.capabilityState}`] : []),
    ...(["unavailable", "unknown"].includes(mapping?.operationalMode) ? [`operational_mode_${mapping.operationalMode}`] : []),
  ];

  return {
    present: true,
    valid: blockers.length === 0,
    fallbackAllowed: false,
    status: blockers.length === 0 ? "canonical" : stale ? "stale" : "blocked",
    blockers,
    readinessReady: blockers.length === 0 && readinessReasons.length === 0,
    readinessReasons,
    source: plainRecord(source) ? structuredClone(source) : null,
    readinessComponents: plainRecord(readinessComponents) ? structuredClone(readinessComponents) : null,
    productModeMapping: plainRecord(mapping) ? structuredClone(mapping) : null,
    retentionEvidence: [
      ...(contract?.metadataOnly === true && contract?.rawPayloadRetained === false ? [{ evidenceId: "canonical-contract", disposition: "metadata_only", metadataOnly: true, rawPayloadRetained: false }] : []),
      ...(Array.isArray(contract?.deliveryEvidence) ? contract.deliveryEvidence.map((entry) => structuredClone(entry.evidence)).filter(plainRecord) : []),
    ],
    qualityEvidence: plainRecord(contract?.qualityGates) ? { state: qualityState, gates: structuredClone(contract.qualityGates) } : null,
    deliveryEvidence: Array.isArray(contract?.deliveryEvidence) ? structuredClone(contract.deliveryEvidence) : [],
    typedCapabilityTruth: plainRecord(mapping) ? {
      requestedProductMode: mapping.requestedProductMode,
      effectiveProductMode: mapping.effectiveProductMode,
      operationalMode: mapping.operationalMode,
      readinessState: mapping.readinessState,
      freshnessState: mapping.freshnessState,
      capabilityState: mapping.capabilityState,
      ready: mapping.ready,
      blockedReasons: structuredClone(mapping.blockedReasons || []),
      sourceMutationAllowed: false,
      providerCallsAllowed: false,
      workerLaunchAllowed: false,
      githubMutationAllowed: false,
    } : null,
  };
}

function canonicalCapability(value) {
  if (!plainRecord(value) || !safeId(value.actionId) || !safeId(value.targetType) ||
      (value.targetId != null && !safeId(value.targetId)) ||
      !["available", "unavailable", "gated", "simulated"].includes(value.capabilityState) ||
      !["not_required", "allowed", "needs_product_approval", "needs_authority_approval", "needs_resource_approval", "needs_destination_approval", "needs_safety_approval", "blocked"].includes(value.authorityState) ||
      !["low", "medium", "high", "extreme"].includes(value.riskTier) ||
      (value.typedReason != null && !CANONICAL_ACTION_TYPED_REASONS.has(value.typedReason)) || !safeText(value.expectedResultSummary) ||
      !canonicalRefs(value.evidenceRefs) || value.evidenceRefs.length === 0 ||
      value.metadataOnly !== true || value.rawPayloadRetained !== false || !canonicalPayloadSafe(value)) return null;
  return structuredClone(value);
}

function canonicalRuntimeReadiness(value, nowMs) {
  if (!plainRecord(value) || value.schemaVersion !== "pipeline-operational-runtime-readiness/v0" ||
      value.actionSchemaVersion !== "pipeline-operational-action/v0" ||
      !["ready", "degraded", "blocked", "unavailable", "unknown"].includes(value.readinessState) ||
      !["disabled", "local_proof", "read_only", "bounded_write", "unavailable", "unknown"].includes(value.operationalMode) ||
      !["live", "stale", "unavailable", "unknown"].includes(value.freshnessState) ||
      !["available", "gated", "unavailable", "simulated", "unknown"].includes(value.capabilityState) ||
      !safeText(value.summary) || !canonicalRefs(value.evidenceRefs) ||
      value.metadataOnly !== true || value.rawPayloadRetained !== false || !Array.isArray(value.actionCapabilities)) return null;
  const checkedAtMs = Date.parse(value.checkedAt || "");
  const expiresAtMs = Date.parse(value.expiresAt || "");
  if (!Number.isFinite(checkedAtMs) || !Number.isFinite(expiresAtMs) || checkedAtMs > nowMs + FUTURE_SKEW_MS ||
      expiresAtMs < nowMs || expiresAtMs <= checkedAtMs || expiresAtMs - checkedAtMs > FRESHNESS_TTL_MS || value.freshnessState !== "live") return null;
  if ((value.readinessState === "ready" && value.capabilityState === "available" && value.typedReason !== null) ||
      (value.readinessState !== "ready" && !CANONICAL_ACTION_TYPED_REASONS.has(value.typedReason))) return null;
  const capabilities = value.actionCapabilities.map(canonicalCapability);
  if (!capabilities.every(Boolean) || new Set(capabilities.map((entry) => entry.actionId)).size !== capabilities.length) return null;
  return { ...structuredClone(value), actionCapabilities: capabilities };
}

function blockedCanonicalOperationalActions(capabilities, code, checkedAt, terminal = false) {
  const typedReason = terminal ? "runtime_unavailable" : code.includes("stale") ? "projection_stale" : "evidence_invalid";
  return {
    schemaVersion: "pipeline-operational-runtime-readiness/v0",
    actionSchemaVersion: "pipeline-operational-action/v0",
    source: "canonical_supervisor_projection",
    readinessState: "degraded",
    operationalMode: "read_only",
    freshnessState: code === "canonical_product_mode_stale" ? "stale" : "unknown",
    capabilityState: "gated",
    typedReason,
    checkedAt,
    expiresAt: new Date(Date.parse(checkedAt) + FRESHNESS_TTL_MS).toISOString(),
    summary: terminal
      ? "Canonical supervisor packet is terminal; manager mutation remains blocked."
      : "Canonical supervisor projection is incomplete, stale, or contradictory; manager fallback is disabled.",
    actionCapabilities: capabilities.map((entry) => ({
      ...entry,
      capabilityState: ["inspect", "refresh_projection"].includes(entry.actionId) ? entry.capabilityState : "unavailable",
      authorityState: ["inspect", "refresh_projection"].includes(entry.actionId) ? entry.authorityState : "blocked",
      typedReason: ["inspect", "refresh_projection"].includes(entry.actionId) ? entry.typedReason : typedReason,
      metadataOnly: true,
      rawPayloadRetained: false,
    })),
    evidenceRefs: ["evidence:canonical-supervisor-projection"],
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

/** Consume one selected supervisor projection without allowing manager-inferred fallback. */
export function consumeCanonicalSupervisorProjection(projection = {}, context = {}) {
  const record = plainRecord(projection) ? projection : {};
  const lists = [record.workPackets, record.selectedPacketDetails].filter(Array.isArray);
  const entries = lists.flat().filter(plainRecord);
  const canonicalEntries = entries.filter((entry) => entry.canonicalContract != null || entry.productModeMapping != null);
  if (canonicalEntries.length === 0) return { present: false, ok: false, operationalActions: null, blockers: [] };

  const nowValue = context.now || record.generatedAt || new Date().toISOString();
  const parsedNowMs = Date.parse(nowValue);
  const nowMs = Number.isFinite(parsedNowMs) ? parsedNowMs : Date.now();
  const checkedAt = new Date(nowMs).toISOString();
  const detailed = (Array.isArray(record.selectedPacketDetails) ? record.selectedPacketDetails : [])
    .filter((entry) => plainRecord(entry) && (entry.canonicalContract != null || entry.productModeMapping != null));
  const selected = detailed[0] || canonicalEntries[0];
  const samePacket = entries.filter((entry) => entry.packetId === selected.packetId);
  const blockers = [];
  const canonicalPacketIds = new Set(canonicalEntries.map((entry) => safeId(entry.packetId)).filter(Boolean));
  if (!Number.isFinite(parsedNowMs)) {
    blockers.push({ code: "canonical_projection_time_invalid", message: "Canonical supervisor projection time is malformed.", nextAction: "Refresh the authoritative supervisor projection." });
  }
  if (!safeId(selected.packetId) || detailed.length > 1 || (detailed.length === 0 && canonicalPacketIds.size !== 1)) {
    blockers.push({ code: "canonical_packet_ambiguous", message: "Canonical supervisor projection must identify exactly one selected packet.", nextAction: "Refresh the selected supervisor packet projection." });
  }
  if (samePacket.some((entry) => !isDeepStrictEqual(entry.canonicalContract ?? null, selected.canonicalContract ?? null) ||
      !isDeepStrictEqual(entry.productModeMapping ?? null, selected.productModeMapping ?? null) ||
      entry.status !== selected.status || entry.currentStage !== selected.currentStage)) {
    blockers.push({ code: "canonical_packet_contradiction", message: "Canonical supervisor packet representations contradict each other.", nextAction: "Refresh the authoritative supervisor projection." });
  }
  const projected = projectCanonicalSupervisorPacket(selected, { now: checkedAt });
  blockers.push(...projected.blockers);

  const runtime = canonicalRuntimeReadiness(record.runtimeReadiness, nowMs);
  if (!runtime) blockers.push({ code: "canonical_runtime_invalid", message: "Canonical runtime readiness is missing, stale, or malformed.", nextAction: "Refresh canonical runtime readiness." });
  const selectedCapabilities = Array.isArray(selected.actionCapabilities) ? selected.actionCapabilities.map(canonicalCapability) : [];
  const topCapabilities = Array.isArray(record.actionCapabilities) ? record.actionCapabilities.map(canonicalCapability) : [];
  const capabilities = runtime?.actionCapabilities || selectedCapabilities.filter(Boolean);
  if (!Array.isArray(selected.actionCapabilities) || !Array.isArray(record.actionCapabilities) || capabilities.length === 0 ||
      selectedCapabilities.some((entry) => !entry) || topCapabilities.some((entry) => !entry) ||
      new Set(selectedCapabilities.filter(Boolean).map((entry) => entry.actionId)).size !== selectedCapabilities.length ||
      new Set(topCapabilities.filter(Boolean).map((entry) => entry.actionId)).size !== topCapabilities.length) {
    blockers.push({ code: "canonical_capabilities_invalid", message: "Canonical action capabilities are missing or malformed.", nextAction: "Refresh typed supervisor capabilities." });
  }
  if (!isDeepStrictEqual(selectedCapabilities, capabilities) || !isDeepStrictEqual(topCapabilities, capabilities)) {
    blockers.push({ code: "canonical_capability_contradiction", message: "Canonical capability projections contradict runtime readiness.", nextAction: "Refresh typed supervisor capabilities." });
  }
  if (capabilities.some((entry) => !["inspect", "refresh_projection"].includes(entry.actionId) &&
      entry.capabilityState === "available" && ["allowed", "not_required"].includes(entry.authorityState))) {
    blockers.push({ code: "canonical_capability_authority_violation", message: "Canonical projection cannot grant manager mutation authority.", nextAction: "Block the capability and refresh supervisor authority truth." });
  }
  const terminal = ["complete", "deferred", "failed"].includes(selected.status);
  const ok = blockers.length === 0;
  const operationalActions = ok && !terminal && projected.readinessReady
    ? { ...structuredClone(runtime), source: "canonical_supervisor_projection", metadataOnly: true, rawPayloadRetained: false }
    : blockedCanonicalOperationalActions(capabilities.filter(Boolean), blockers[0]?.code || "canonical_readiness_blocked", checkedAt, terminal);
  return {
    present: true,
    ok,
    terminal,
    blockers,
    source: projected.source,
    readinessComponents: projected.readinessComponents,
    productModeMapping: projected.productModeMapping,
    retentionEvidence: projected.retentionEvidence,
    qualityEvidence: projected.qualityEvidence,
    deliveryEvidence: projected.deliveryEvidence,
    actionCapabilities: capabilities.filter(Boolean),
    operationalActions,
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function threshold(value, name) {
  if (!value || typeof value !== "object" || !Number.isFinite(Number(value.value))) return null;
  const operator = ["lt", "lte", "gt", "gte", "eq"].includes(value.operator) ? value.operator : "";
  const unit = safeId(value.unit);
  if (!operator || !unit) return null;
  return { name: safeId(value.name || name), operator, value: Number(value.value), unit, explicit: true };
}

function thresholdFor(profile, name, defaults = null) {
  const candidate = profile?.thresholds?.[name] ?? profile?.[name];
  if (candidate !== undefined) return threshold(candidate, name);
  return defaults;
}

function gate(gateId, input, fallbackReason, fallbackAction, evidence = []) {
  const state = GATE_STATES.has(input?.state) ? input.state : input === true ? "pass" : "blocked";
  const typedReason = state === "pass" || state === "not_applicable" ? null : reasonFor(text(input?.typedReason, fallbackReason));
  return {
    gateId,
    state,
    typedReason,
    nextAction: safeText(input?.nextAction, fallbackAction, 220) ? text(input?.nextAction, fallbackAction, 220) : fallbackAction,
    evidenceRefs: refs(input?.evidenceRefs || evidence),
  };
}

function suppliedGate(gates, id, condition, fallbackReason, fallbackAction, evidence = []) {
  const candidate = Array.isArray(gates) ? gates.find((entry) => entry?.gateId === id) : gates?.[id];
  if (condition !== true && candidate?.state === "pass") {
    return gate(id, { ...candidate, state: "blocked", typedReason: fallbackReason }, fallbackReason, fallbackAction, evidence);
  }
  return gate(id, candidate === undefined ? condition : candidate, fallbackReason, fallbackAction, evidence);
}

function explicitThresholds(profile = {}) {
  const defaults = {
    heartbeat_freshness: threshold({ name: "heartbeat_freshness", operator: "lte", value: 300, unit: "seconds" }, "heartbeat_freshness"),
    readiness_projection_freshness: threshold({ name: "readiness_projection_freshness", operator: "lte", value: 300, unit: "seconds" }, "readiness_projection_freshness"),
  };
  const output = [];
  for (const name of REQUIRED_INDICATORS) {
    const item = thresholdFor(profile, name, defaults[name] || null);
    if (item) output.push({ indicator: name, target: item, windowSeconds: Number(profile?.windows?.[name] || 300), errorBudget: Number(profile?.errorBudgets?.[name] ?? 0), ...(name.includes("heartbeat") || name.includes("readiness") ? {} : {}) });
  }
  return output;
}

export function buildOperationalReadinessContract(options = {}, context = {}) {
  const now = Date.parse(text(context.now || options.now, new Date().toISOString()));
  const checkedAtMs = Number.isFinite(now) ? now : Date.now();
  const checkedAt = new Date(checkedAtMs).toISOString();
  const expiresAt = new Date(checkedAtMs + FRESHNESS_TTL_MS).toISOString();
  const canonicalInput = context.supervisorPacket || context.authoritativeSupervisorPacket || context.projectionPacket ||
    (own(context, "canonicalContract") || own(context, "productModeMapping") ? context : null);
  const canonicalSupervisor = projectCanonicalSupervisorPacket(canonicalInput || {}, { now: checkedAt });
  const canonicalEvidenceRefs = canonicalSupervisor.present
    ? [
        ...(canonicalSupervisor.source?.provenance?.evidenceRefs || []),
        ...CANONICAL_READINESS_COMPONENT_IDS.flatMap((componentId) => canonicalSupervisor.readinessComponents?.[componentId]?.evidenceRefs || []),
        ...canonicalSupervisor.deliveryEvidence.flatMap((entry) => entry?.evidence?.evidenceRefs || []),
      ]
    : [];
  const canonicalSourceRefs = canonicalSupervisor.present && canonicalSupervisor.source?.provenance?.sourceRef?.refId
    ? [`source:${canonicalSupervisor.source.provenance.sourceRef.refId}`]
    : [];
  const targetInput = context.target || options.target || {};
  const target = {
    workerId: safeId(targetInput.workerId),
    assignmentId: safeId(targetInput.assignmentId),
    owner: safeId(targetInput.owner),
    runId: safeId(targetInput.runId),
    sourceRefs: refs(canonicalSupervisor.present ? canonicalSourceRefs : targetInput.sourceRefs),
    evidenceRefs: refs(canonicalSupervisor.present ? canonicalEvidenceRefs : targetInput.evidenceRefs),
  };
  const targetRef = observationTargetRef(target);
  const fixtureEvidence = context.fixtureEvidence === true;
  const observationAttestation = observedEvidenceAttestation(
    context.observedEvidenceAttestation || options.observedEvidenceAttestation,
    SCHEMA_VERSION,
    checkedAtMs,
    targetRef,
  );
  const boundObservationAttestation = !fixtureEvidence && attestationBindsPacket(
    observationAttestation,
    target.sourceRefs,
    target.evidenceRefs,
    targetRef,
  ) ? observationAttestation : null;
  const evidenceClass = evidenceClassFor({ fixtureEvidence, attestation: boundObservationAttestation });
  const profile = context.readinessProfile || options.readinessProfile || {};
  const thresholds = explicitThresholds(profile);
  const missingThresholds = REQUIRED_INDICATORS.filter((name) => !thresholds.some((entry) => entry.indicator === name));
  const telemetryInput = context.telemetry || {};
  const telemetry = {
    source: safeId(telemetryInput.source),
    coverage: safeId(telemetryInput.coverage),
    observationWindowSeconds: Number(telemetryInput.observationWindowSeconds),
    alertThresholdIds: Array.isArray(telemetryInput.alertThresholdIds) ? telemetryInput.alertThresholdIds.map(safeId).filter(Boolean).slice(0, 12) : [],
    alertReady: telemetryInput.alertReady === true,
  };
  const configurationInput = context.configuration || context.secrets || {};
  const names = Array.isArray(configurationInput.names || configurationInput.allowlistedNames) ? (configurationInput.names || configurationInput.allowlistedNames).map(safeId).filter(Boolean).slice(0, 24) : [];
  const configuration = { names, validationState: ["pass", "fail", "unknown"].includes(configurationInput.validationState) ? configurationInput.validationState : "unknown", noValueRetention: configurationInput.noValueRetention === true };
  const recoveryInput = context.recovery || {};
  const recovery = {
    owner: safeId(recoveryInput.owner),
    rollbackPath: safeText(recoveryInput.rollbackPath) ? text(recoveryInput.rollbackPath) : "",
    remediationAction: safeText(recoveryInput.remediationAction) ? text(recoveryInput.remediationAction) : "",
    recheckAt: safeText(recoveryInput.recheckAt) ? text(recoveryInput.recheckAt) : "",
    expiryAt: safeText(recoveryInput.expiryAt) ? text(recoveryInput.expiryAt) : "",
  };
  const backendTruth = canonicalSupervisor.present
    ? canonicalSupervisor.valid ? "live" : "dry_run"
    : BACKEND_TRUTHS.has(context.backendTruth || options.backendTruth) ? (context.backendTruth || options.backendTruth) : "dry_run";
  const sourceEvidence = target.sourceRefs.length > 0 && target.evidenceRefs.length > 0;
  const exactTarget = [target.workerId, target.assignmentId, target.owner, target.runId].every(Boolean);
  const backendProof = backendTruth !== "live" || context.backendTruthProven === true || context.backendTruthProof === true;
  const authorityState = text(context.authorityState || options.authorityState, "blocked");
  const riskTier = ["low", "medium", "high", "extreme"].includes(context.riskTier || options.riskTier) ? (context.riskTier || options.riskTier) : "high";
  const gatesInput = context.gates || {};
  const evidence = target.evidenceRefs;
  const gates = [
    suppliedGate(gatesInput, "exact_ownership", exactTarget && context.ownershipAmbiguous !== true, "ownership_ambiguous", "Provide exact worker, assignment, owner, and run identity.", evidence),
    suppliedGate(gatesInput, "source_evidence", sourceEvidence, "evidence_missing", "Provide source and evidence refs for the exact target.", evidence),
    suppliedGate(gatesInput, "backend_truth", backendProof, "backend_truth_unproven", "Provide backend truth proof before live eligibility.", evidence),
    suppliedGate(gatesInput, "authority_risk", authorityState === "allowed" && context.authorityProven === true, "authority_violation", "Provide explicit authority and risk evidence.", evidence),
    suppliedGate(gatesInput, "recovery_rollback", Boolean(recovery.owner && recovery.rollbackPath && recovery.remediationAction), "rollback_missing", "Provide a recovery owner, rollback path, and remediation action.", evidence),
    suppliedGate(gatesInput, "resource_cost", Boolean(thresholdFor(profile, "resources") && thresholdFor(profile, "cost")), "threshold_missing", "Provide explicit resource and cost ceilings.", evidence),
    suppliedGate(gatesInput, "configuration_secrets", configuration.validationState === "pass" && configuration.noValueRetention && names.length > 0, "configuration_invalid", "Provide allowlisted configuration names with no value retention.", evidence),
    suppliedGate(gatesInput, "telemetry_alerts", Boolean(telemetry.source && telemetry.coverage && telemetry.alertReady && telemetry.alertThresholdIds.length > 0), "telemetry_missing", "Provide fresh telemetry coverage and alert threshold metadata.", evidence),
    suppliedGate(gatesInput, "preflight", context.preflight?.status === "ready" && !(context.preflight?.blockers?.length), "preflight_blocked", "Refresh preflight and clear all blockers.", evidence),
    suppliedGate(gatesInput, "usage", ["normal", "ready"].includes(context.usage?.status || context.usage?.state), "usage_pressure", "Wait for an explicitly normal usage posture.", evidence),
    suppliedGate(gatesInput, "resources", ["normal", "ready"].includes(context.resources?.status || context.resources?.state), "resource_pressure", "Wait for an explicitly normal resource posture.", evidence),
    suppliedGate(gatesInput, "heartbeat", context.heartbeat?.fresh === true, "evidence_stale", "Refresh the worker heartbeat within five minutes.", evidence),
    suppliedGate(gatesInput, "dispatcher_lease", context.dispatcherLease?.proven === true, "dispatcher_lease_unproven", "Provide dispatcher lease proof for the exact target.", evidence),
    gate("receipt_evidence", evidenceClass === "live_observed", "evidence_attestation_invalid", "Provide a fresh independent observation receipt bound to the exact target.", evidence),
  ];
  if (canonicalSupervisor.present) {
    const canonicalBlocker = canonicalSupervisor.blockers[0];
    const canonicalReady = canonicalSupervisor.valid && canonicalSupervisor.readinessReady;
    gates.push(gate("canonical_supervisor_contract", {
      state: canonicalReady ? "pass" : "blocked",
      typedReason: canonicalBlocker?.code || "predecessor_gate_not_passed",
      nextAction: canonicalBlocker?.nextAction || "Hold until canonical readiness components, quality gates, and product-mode mapping are ready.",
      evidenceRefs: canonicalEvidenceRefs,
    }, "canonical_contract_invalid", "Refresh authoritative supervisor canonical truth.", canonicalEvidenceRefs));
  }
  if (missingThresholds.length > 0) {
    gates.push(gate("explicit_thresholds", { state: "blocked", typedReason: "threshold_missing" }, "threshold_missing", `Provide explicit thresholds for: ${missingThresholds.join(", ")}.`, evidence));
  }
  const typedBlockers = gates.filter((entry) => entry.state !== "pass").map((entry) => ({ gateId: entry.gateId, reason: entry.typedReason || "unknown", nextAction: entry.nextAction }));
  const authoritativeFreshness = canonicalSupervisor.present ? canonicalSupervisor.productModeMapping?.freshnessState : context.freshnessState;
  const outcome = typedBlockers.length === 0 && backendTruth === "live" && authoritativeFreshness === "live" && evidenceClass === "live_observed" && context.metadataOnly !== false ? "go" : "no_go";
  return {
    schemaVersion: SCHEMA_VERSION,
    evidenceClass,
    observedEvidenceAttestation: boundObservationAttestation,
    target,
    backendTruth,
    authorityState,
    riskTier,
    sliSlo: thresholds,
    telemetry,
    configuration,
    recovery,
    gates,
    outcome,
    typedBlockers,
    ...(canonicalSupervisor.present ? { canonicalSupervisor } : {}),
    checkedAt,
    expiresAt,
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

export function validateOperationalReadinessContract(contract = {}) {
  const blockers = [];
  if (contract?.schemaVersion !== SCHEMA_VERSION) blockers.push({ code: "bad_schema_version", message: "Unsupported readiness contract schema.", nextAction: "Regenerate the readiness packet." });
  if (contract?.metadataOnly !== true || contract?.rawPayloadRetained !== false) blockers.push({ code: "safety_violation", message: "Readiness evidence must be metadata-only.", nextAction: "Remove raw payload retention and regenerate." });
  if (!OUTCOMES.has(contract?.outcome)) blockers.push({ code: "unknown", message: "Readiness outcome is missing or malformed.", nextAction: "Regenerate the readiness packet." });
  if (!Array.isArray(contract?.gates) || REQUIRED_GATES.some((id) => !contract.gates.some((entry) => entry?.gateId === id))) blockers.push({ code: "evidence_missing", message: "Required readiness gates are missing.", nextAction: "Evaluate every required readiness gate." });
  if (Array.isArray(contract?.gates)) {
    for (const entry of contract.gates) {
      if (!GATE_STATES.has(entry?.state) || !safeText(entry?.nextAction) || refs(entry?.evidenceRefs).length !== (entry?.evidenceRefs || []).length) blockers.push({ code: "evidence_missing", message: `Gate ${text(entry?.gateId, "unknown")} is malformed.`, nextAction: "Regenerate the gate evidence." });
    }
  }
  if (contract?.outcome === "go" && (!Array.isArray(contract?.sliSlo) || REQUIRED_INDICATORS.some((name) => !contract.sliSlo.some((entry) => entry?.indicator === name && entry?.target?.explicit === true)))) blockers.push({ code: "threshold_missing", message: "Explicit SLI/SLO thresholds are incomplete.", nextAction: "Provide all non-default readiness thresholds." });
  if (contract?.outcome === "go" && (!Array.isArray(contract?.configuration?.names) || contract.configuration.names.length === 0 || contract.configuration.noValueRetention !== true || contract.configuration.validationState !== "pass" || contract.configuration.names.some((name) => !safeId(name)))) blockers.push({ code: "configuration_invalid", message: "Configuration readiness must contain allowlisted names without values.", nextAction: "Provide validated allowlisted configuration metadata only." });
  if (contract?.outcome === "go" && (!safeId(contract?.telemetry?.source) || !safeId(contract?.telemetry?.coverage) || contract.telemetry.alertReady !== true || !Array.isArray(contract.telemetry.alertThresholdIds) || contract.telemetry.alertThresholdIds.length === 0)) blockers.push({ code: "telemetry_missing", message: "Telemetry and alert coverage is incomplete.", nextAction: "Provide fresh telemetry source, coverage, and alert threshold metadata." });
  if (contract?.outcome === "go" && (contract.backendTruth !== "live" || contract.typedBlockers?.length)) blockers.push({ code: "backend_truth_unproven", message: "Go requires live backend truth and no blockers.", nextAction: "Hold until live proof is complete." });
  if (contract?.outcome === "go" && contract.gates?.some((entry) => entry?.state !== "pass")) blockers.push({ code: "predecessor_gate_not_passed", message: "Go requires every readiness gate to pass.", nextAction: "Hold until all readiness gates pass." });
  if (contract?.outcome === "go" && contract.evidenceClass !== "live_observed") blockers.push({ code: "evidence_attestation_invalid", message: "Go requires a target-bound independently observed live attestation.", nextAction: "Hold until target-bound live evidence is available." });
  if (contract?.canonicalSupervisor?.present === true && contract.canonicalSupervisor.valid !== true) blockers.push({ code: "canonical_contract_invalid", message: "Operational readiness cannot use incomplete, stale, or contradictory supervisor canonical truth.", nextAction: "Refresh the authoritative supervisor packet/projection." });
  blockers.push(...validateEvidenceProvenance(contract, SCHEMA_VERSION, Date.parse(contract?.checkedAt || ""), {
    targetRef: observationTargetRef(contract?.target),
    sourceRefs: contract?.target?.sourceRefs,
    evidenceRefs: contract?.target?.evidenceRefs,
  }));
  return blockers;
}

function finiteNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function nonNegativeNumber(value) {
  const result = finiteNumber(value);
  return result !== null && result >= 0 ? result : null;
}

function canaryThreshold(readinessContract, thresholds, indicator, fallbackUnit) {
  const supplied = thresholds?.[indicator] || thresholds?.[indicator.replace(/([A-Z])/g, "_$1").toLowerCase()];
  if (supplied && typeof supplied === "object") return threshold(supplied, indicator);
  const fromReadiness = Array.isArray(readinessContract?.sliSlo)
    ? readinessContract.sliSlo.find((entry) => entry?.indicator === indicator)?.target
    : null;
  return threshold(fromReadiness, indicator) || null;
}

function thresholdPasses(value, target) {
  if (value === null || !target) return false;
  if (target.operator === "lt") return value < target.value;
  if (target.operator === "lte") return value <= target.value;
  if (target.operator === "gt") return value > target.value;
  if (target.operator === "gte") return value >= target.value;
  if (target.operator === "eq") return value === target.value;
  return false;
}

function canaryGate(gateId, state, reason, nextAction, evidenceRefs) {
  const normalizedState = GATE_STATES.has(state) ? state : "blocked";
  return {
    gateId,
    state: normalizedState,
    typedReason: normalizedState === "pass" || normalizedState === "not_applicable" ? null : reasonFor(reason),
    nextAction: safeText(nextAction, "Inspect canary evidence before continuing.", 220)
      ? text(nextAction, "Inspect canary evidence before continuing.", 220)
      : "Inspect canary evidence before continuing.",
    evidenceRefs: refs(evidenceRefs),
  };
}

function canaryBlocker(code, gateId, nextAction) {
  return { gateId, reason: reasonFor(code), nextAction: text(nextAction, "Inspect canary evidence before continuing.", 220) };
}

export function buildOneWorkerLiveCanaryEvidence(options = {}, context = {}) {
  const nowValue = Date.parse(text(context.now || options.now, new Date().toISOString()));
  const checkedAtMs = Number.isFinite(nowValue) ? nowValue : Date.now();
  const checkedAt = new Date(checkedAtMs).toISOString();
  const targetInput = context.target || options.target || {};
  const target = {
    workerId: safeId(targetInput.workerId),
    assignmentId: safeId(targetInput.assignmentId),
    owner: safeId(targetInput.owner),
    runId: safeId(targetInput.runId),
    sourceRefs: refs(targetInput.sourceRefs),
    evidenceRefs: refs(targetInput.evidenceRefs),
  };
  const readinessContract = context.readinessContract || options.readinessContract || {};
  const backendTruth = BACKEND_TRUTHS.has(context.backendTruth || options.backendTruth) ? (context.backendTruth || options.backendTruth) : "dry_run";
  const fixtureEvidence = context.fixtureEvidence === true;
  const targetRef = observationTargetRef(target);
  const observationAttestation = observedEvidenceAttestation(
    context.observedEvidenceAttestation || options.observedEvidenceAttestation,
    CANARY_SCHEMA_VERSION,
    checkedAtMs,
    targetRef,
  );
  const authority = context.canaryAuthority || context.authority || {};
  const authorityAllowed = (authority.state || context.authorityState || options.authorityState) === "allowed" &&
    (authority.proven === true || context.authorityProven === true || options.authorityProven === true);
  const evidenceRefs = refs([...target.evidenceRefs, ...(context.evidenceRefs || [])]);
  const sourceRefs = refs(target.sourceRefs);
  const boundObservationAttestation = !fixtureEvidence && attestationBindsPacket(observationAttestation, sourceRefs, evidenceRefs, targetRef)
    ? observationAttestation
    : null;
  const evidenceClass = evidenceClassFor({ fixtureEvidence, attestation: boundObservationAttestation });
  const telemetryInput = context.telemetry || {};
  const telemetry = {
    source: safeId(telemetryInput.source),
    coverage: safeId(telemetryInput.coverage),
    observationWindowSeconds: nonNegativeNumber(telemetryInput.observationWindowSeconds),
    alertThresholdIds: Array.isArray(telemetryInput.alertThresholdIds) ? telemetryInput.alertThresholdIds.map(safeId).filter(Boolean).slice(0, 12) : [],
    alertReady: telemetryInput.alertReady === true,
  };
  const leaseInput = context.lease || context.dispatcherLease || {};
  const checkpointInput = context.checkpoint || context.receipt || {};
  const lease = {
    state: ["pass", "fail", "blocked"].includes(leaseInput.state) ? leaseInput.state : "blocked",
    proofRef: safeId(leaseInput.proofRef || leaseInput.evidenceRef),
  };
  const checkpoint = {
    state: ["pass", "fail", "blocked"].includes(checkpointInput.state) ? checkpointInput.state : "blocked",
    proofRef: safeId(checkpointInput.proofRef || checkpointInput.evidenceRef),
  };
  const measurementsInput = context.measurements || {};
  const measurements = {
    observedAt: safeText(measurementsInput.observedAt) ? text(measurementsInput.observedAt, "", 80) : checkedAt,
    latencyMs: nonNegativeNumber(measurementsInput.latencyMs),
    errorCount: nonNegativeNumber(measurementsInput.errorCount),
    cpuPercent: nonNegativeNumber(measurementsInput.cpuPercent),
    memoryPercent: nonNegativeNumber(measurementsInput.memoryPercent),
    diskPercent: nonNegativeNumber(measurementsInput.diskPercent),
    costCents: nonNegativeNumber(measurementsInput.costCents),
    timedOut: measurementsInput.timedOut === true,
  };
  const thresholds = {
    latency: canaryThreshold(readinessContract, context.thresholds, "latency", "milliseconds"),
    errors: canaryThreshold(readinessContract, context.thresholds, "errors", "count"),
    resources: canaryThreshold(readinessContract, context.thresholds, "resources", "percent"),
    cost: canaryThreshold(readinessContract, context.thresholds, "cost", "cents"),
  };
  const recoveryInput = context.recovery || {};
  const recovery = {
    owner: safeId(recoveryInput.owner),
    rollbackPath: safeText(recoveryInput.rollbackPath) ? text(recoveryInput.rollbackPath, "", 180) : "",
    remediationAction: safeText(recoveryInput.remediationAction) ? text(recoveryInput.remediationAction, "", 220) : "",
    required: false,
  };
  const blockers = [];
  const gates = [];
  const exactTarget = [target.workerId, target.assignmentId, target.owner, target.runId].every(Boolean);
  const oneWorker = context.workerCount === undefined || Number(context.workerCount) === 1;
  const telemetryReady = Boolean(telemetry.source && telemetry.coverage && telemetry.alertReady && telemetry.alertThresholdIds.length > 0);
  const leaseReady = lease.state === "pass" && Boolean(lease.proofRef);
  const checkpointReady = checkpoint.state === "pass" && Boolean(checkpoint.proofRef);
  const readinessReady = readinessContract?.outcome === "go" && validateOperationalReadinessContract(readinessContract).length === 0;
  const recoveryReady = Boolean(recovery.owner && recovery.rollbackPath && recovery.remediationAction);
  const latencyPass = thresholdPasses(measurements.latencyMs, thresholds.latency);
  const errorsPass = thresholdPasses(measurements.errorCount, thresholds.errors);
  const resourceValue = Math.max(measurements.cpuPercent ?? -1, measurements.memoryPercent ?? -1, measurements.diskPercent ?? -1);
  const resourcesPass = thresholdPasses(resourceValue >= 0 ? resourceValue : null, thresholds.resources);
  const costPass = thresholdPasses(measurements.costCents, thresholds.cost);
  const boundaryBreached = context.boundaryBreached === true || measurements.timedOut ||
    (thresholds.errors && measurements.errorCount !== null && !errorsPass) ||
    (thresholds.resources && resourceValue >= 0 && !resourcesPass) ||
    (thresholds.cost && measurements.costCents !== null && !costPass) ||
    (thresholds.latency && measurements.latencyMs !== null && !latencyPass);

  const addGate = (gateId, pass, reason, action, refsForGate = evidenceRefs) => {
    gates.push(canaryGate(gateId, pass ? "pass" : "blocked", reason, action, refsForGate));
    if (!pass) blockers.push(canaryBlocker(reason, gateId, action));
  };
  addGate("exact_canary_scope", exactTarget && oneWorker, "target_not_exact", "Provide exactly one worker, assignment, owner, and run identity.");
  addGate("predecessor_readiness", readinessReady, "predecessor_gate_not_passed", "Verify the passing 25-1 readiness contract before running the canary.");
  addGate("canary_authority", authorityAllowed, "canary_authority_missing", "Record explicit bounded canary authority before live execution.");
  addGate("live_truth", backendTruth === "live" && context.backendTruthProven === true && evidenceClass === "live_observed", fixtureEvidence ? "fixture_evidence" : "evidence_attestation_invalid", fixtureEvidence ? "Replace fixture evidence with an independently observed canary before allowing ramp." : "Attach a fresh independent observation receipt bound to the canary packet before allowing ramp.");
  addGate("telemetry", telemetryReady, "telemetry_missing", "Provide fresh telemetry coverage and alert threshold metadata.");
  addGate("lease", leaseReady, "lease_missing", "Provide exact dispatcher lease proof for the canary worker.", refs([...evidenceRefs, lease.proofRef].filter(Boolean)));
  addGate("checkpoint", checkpointReady, "checkpoint_missing", "Provide a checkpoint or receipt proof for the canary worker.", refs([...evidenceRefs, checkpoint.proofRef].filter(Boolean)));
  addGate("latency", latencyPass, measurements.latencyMs === null ? "threshold_missing" : "latency_threshold_exceeded", "Provide latency evidence within the explicit canary threshold.");
  addGate("errors", errorsPass, measurements.errorCount === null ? "threshold_missing" : "error_threshold_exceeded", "Stop and inspect errors before allowing ramp.");
  addGate("resources", resourcesPass, resourceValue < 0 ? "threshold_missing" : "resource_threshold_exceeded", "Stop and restore resource headroom before allowing ramp.");
  addGate("cost", costPass, measurements.costCents === null ? "threshold_missing" : "cost_threshold_exceeded", "Stop and inspect cost evidence before allowing ramp.");
  addGate("recovery", recoveryReady, "recovery_missing", "Provide an owner, rollback path, and remediation action before the canary.");
  if (measurements.timedOut) blockers.push(canaryBlocker("timeout", "timeout_recovery", "Stop the canary, preserve metadata-only evidence, and execute the bounded rollback path."));
  gates.push(canaryGate("timeout_recovery", measurements.timedOut ? "blocked" : "pass", measurements.timedOut ? "timeout" : null, measurements.timedOut ? "Stop the canary, preserve evidence, and rollback before retrying." : "Continue observing the bounded canary timeout window.", evidenceRefs));
  const uniqueBlockers = blockers.filter((entry, index, list) => list.findIndex((candidate) => candidate.gateId === entry.gateId && candidate.reason === entry.reason) === index);
  const outcome = boundaryBreached ? "stop" : uniqueBlockers.length === 0 ? "pass" : "hold";
  recovery.required = outcome === "stop";
  const nextManagerAction = outcome === "pass"
    ? "Preserve the passing canary evidence and create 25-3 JIT only; do not launch rollout automatically."
    : outcome === "stop"
      ? "Stop the canary, preserve metadata-only evidence, execute the bounded rollback path, and block ramp."
      : "Repair the typed canary blockers and rerun the bounded readiness/canary evidence gate.";
  return {
    schemaVersion: CANARY_SCHEMA_VERSION,
    evidenceClass,
    observedEvidenceAttestation: boundObservationAttestation,
    target,
    workerCount: oneWorker ? 1 : Number(context.workerCount),
    backendTruth,
    truthLabel: backendTruth,
    canaryAuthority: { state: authority.state === "allowed" ? "allowed" : "blocked", proven: authorityAllowed, evidenceRefs: refs(authority.evidenceRefs) },
    telemetry,
    lease,
    checkpoint,
    measurements,
    thresholds,
    recovery,
    gates,
    outcome,
    rampAllowed: outcome === "pass",
    typedBlockers: uniqueBlockers,
    sourceRefs,
    evidenceRefs,
    checkedAt,
    expiresAt: new Date(checkedAtMs + FRESHNESS_TTL_MS).toISOString(),
    nextManagerAction,
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

export function validateOneWorkerLiveCanaryEvidence(evidence = {}) {
  const blockers = [];
  if (evidence?.schemaVersion !== CANARY_SCHEMA_VERSION) blockers.push({ code: "bad_schema_version", message: "Unsupported one-worker canary evidence schema." });
  if (evidence?.metadataOnly !== true || evidence?.rawPayloadRetained !== false) blockers.push({ code: "safety_violation", message: "Canary evidence must be metadata-only." });
  if (!CANARY_OUTCOMES.has(evidence?.outcome)) blockers.push({ code: "unknown", message: "Canary outcome is missing or malformed." });
  if (evidence?.workerCount !== 1) blockers.push({ code: "target_not_exact", message: "Canary evidence must cover exactly one worker." });
  if (BACKEND_TRUTHS.has(evidence?.backendTruth) === false) blockers.push({ code: "backend_truth_unproven", message: "Canary truth label is missing or malformed." });
  if (!Array.isArray(evidence?.sourceRefs) || refs(evidence.sourceRefs).length !== evidence.sourceRefs.length || evidence.sourceRefs.length === 0) blockers.push({ code: "evidence_missing", message: "Canary evidence requires safe source refs." });
  if (!Array.isArray(evidence?.evidenceRefs) || refs(evidence.evidenceRefs).length !== evidence.evidenceRefs.length || evidence.evidenceRefs.length === 0) blockers.push({ code: "evidence_missing", message: "Canary evidence requires safe evidence refs." });
  if (!Array.isArray(evidence?.gates) || evidence.gates.length < 10) blockers.push({ code: "evidence_missing", message: "Canary evidence requires the bounded gate set." });
  if (!safeText(evidence?.nextManagerAction)) blockers.push({ code: "evidence_missing", message: "Canary evidence requires a safe next manager action." });
  const checkedAtMs = Date.parse(evidence?.checkedAt || "");
  const expiresAtMs = Date.parse(evidence?.expiresAt || "");
  if (!Number.isFinite(checkedAtMs) || !Number.isFinite(expiresAtMs) || expiresAtMs <= checkedAtMs || expiresAtMs - checkedAtMs > FRESHNESS_TTL_MS) blockers.push({ code: "evidence_stale", message: "Canary evidence timestamps must be fresh and bounded." });
  blockers.push(...validateEvidenceProvenance(evidence, CANARY_SCHEMA_VERSION, checkedAtMs));
  if (evidence?.outcome === "pass" && (evidence.backendTruth !== "live" || evidence.evidenceClass !== "live_observed" || evidence.rampAllowed !== true || (evidence.typedBlockers || []).length > 0)) blockers.push({ code: "inconsistent_result", message: "A passing canary requires independently observed live truth, ramp permission, and no blockers." });
  if (evidence?.outcome === "stop" && evidence?.recovery?.required !== true) blockers.push({ code: "recovery_missing", message: "A stopped canary requires rollback metadata." });
  return blockers;
}

function rampThreshold(value, name) {
  return threshold(value, name);
}

function normalizeRampStage(input = {}, index = 0, expectedWorkerCount = null) {
  const workerCount = Number(input.workerCount ?? input.workers ?? expectedWorkerCount);
  const rollbackInput = input.rollbackThresholds || input.rollback_thresholds || {};
  const observedInput = input.observed || input.observations || {};
  const rollbackThresholds = {
    latency: rampThreshold(rollbackInput.latency, "latency"),
    errors: rampThreshold(rollbackInput.errors, "errors"),
    resources: rampThreshold(rollbackInput.resources, "resources"),
    cost: rampThreshold(rollbackInput.cost, "cost"),
  };
  const observed = {
    queueDepth: nonNegativeNumber(observedInput.queueDepth),
    leaseHealthy: observedInput.leaseHealthy === true,
    latencyMs: nonNegativeNumber(observedInput.latencyMs),
    errorCount: nonNegativeNumber(observedInput.errorCount),
    cpuPercent: nonNegativeNumber(observedInput.cpuPercent),
    memoryPercent: nonNegativeNumber(observedInput.memoryPercent),
    diskPercent: nonNegativeNumber(observedInput.diskPercent),
    processCount: nonNegativeNumber(observedInput.processCount),
    usageState: ["normal", "ready", "drain", "manager_only", "unknown"].includes(observedInput.usageState) ? observedInput.usageState : "unknown",
    costCents: nonNegativeNumber(observedInput.costCents),
  };
  const changed = input.changed === true || input.skipped === true || Number(input.workerCount ?? input.workers ?? expectedWorkerCount) !== expectedWorkerCount;
  const rationale = safeText(input.rationale) ? text(input.rationale, "", 220) : "";
  const authority = input.authority || {};
  return {
    stageId: safeId(input.stageId || input.stage_id || `stage-${index + 1}`),
    workerCount: Number.isFinite(workerCount) ? workerCount : null,
    capacityReady: input.capacityReady === true || input.capacity_ready === true,
    durationSeconds: nonNegativeNumber(input.durationSeconds ?? input.duration_seconds),
    owner: safeId(input.owner),
    budgetCents: nonNegativeNumber(input.budgetCents ?? input.budget_cents),
    rollbackThresholds,
    authority: {
      state: authority.state === "allowed" ? "allowed" : "blocked",
      proven: authority.proven === true,
      evidenceRefs: refs(authority.evidenceRefs),
    },
    observed,
    changed,
    skipped: input.skipped === true,
    rationale,
    replacementThresholds: changed && input.replacementThresholds && typeof input.replacementThresholds === "object"
      ? Object.fromEntries(Object.entries(input.replacementThresholds).slice(0, 8).map(([name, value]) => [safeId(name), rampThreshold(value, name)]).filter(([name, value]) => name && value))
      : {},
    evidenceRefs: refs(input.evidenceRefs),
    lifecycleAmbiguous: input.lifecycleAmbiguous === true || input.lifecycle_ambiguous === true,
  };
}

function rampMetricPasses(value, target) {
  return thresholdPasses(value, target);
}

export function buildLiveCapacityRampEvidence(options = {}, context = {}) {
  const nowValue = Date.parse(text(context.now || options.now, new Date().toISOString()));
  const checkedAtMs = Number.isFinite(nowValue) ? nowValue : Date.now();
  const checkedAt = new Date(checkedAtMs).toISOString();
  const canaryEvidence = context.canaryEvidence || options.canaryEvidence || {};
  const fixtureEvidence = context.fixtureEvidence === true || canaryEvidence.evidenceClass === "fixture";
  const targetRef = observationTargetRef(context.target || canaryEvidence.target) || safeId(canaryEvidence.observedEvidenceAttestation?.subject?.targetRef);
  const observationAttestation = observedEvidenceAttestation(
    context.observedEvidenceAttestation || options.observedEvidenceAttestation,
    RAMP_SCHEMA_VERSION,
    checkedAtMs,
    targetRef,
  );
  const sourceRefs = refs([...(canaryEvidence.sourceRefs || []), ...(context.sourceRefs || [])]);
  const evidenceRefs = refs([...(canaryEvidence.evidenceRefs || []), ...(context.evidenceRefs || [])]);
  const boundObservationAttestation = !fixtureEvidence && targetRef && attestationBindsPacket(observationAttestation, sourceRefs, evidenceRefs, targetRef)
    ? observationAttestation
    : null;
  const evidenceClass = evidenceClassFor({ fixtureEvidence, attestation: boundObservationAttestation });
  const requestedStages = Array.isArray(context.stages || options.stages) ? (context.stages || options.stages) : DEFAULT_RAMP_WORKER_COUNTS.map((workerCount) => ({ workerCount }));
  const expectedWorkerCounts = Array.isArray(context.stageWorkerCounts || options.stageWorkerCounts)
    ? (context.stageWorkerCounts || options.stageWorkerCounts).map(Number).filter((value) => Number.isInteger(value) && value > 0).slice(0, 8)
    : DEFAULT_RAMP_WORKER_COUNTS;
  const changedPlan = expectedWorkerCounts.length !== DEFAULT_RAMP_WORKER_COUNTS.length || expectedWorkerCounts.some((value, index) => value !== DEFAULT_RAMP_WORKER_COUNTS[index]);
  const planRationale = safeText(context.planRationale || options.planRationale) ? text(context.planRationale || options.planRationale, "", 220) : "";
  const planAuthority = context.planAuthority || options.planAuthority || {};
  const planAuthorityProven = planAuthority.state === "allowed" && planAuthority.proven === true;
  const stages = expectedWorkerCounts.map((workerCount, index) => normalizeRampStage(requestedStages[index] || {}, index, workerCount));
  const blockers = [];
  const stageResults = [];
  const canaryPass = canaryEvidence?.schemaVersion === CANARY_SCHEMA_VERSION &&
    canaryEvidence.outcome === "pass" && canaryEvidence.backendTruth === "live" && canaryEvidence.evidenceClass === "live_observed" && canaryEvidence.rampAllowed === true &&
    validateOneWorkerLiveCanaryEvidence(canaryEvidence).length === 0;
  if (!canaryPass) blockers.push({ gateId: "canary_predecessor", reason: reasonFor("canary_not_passed"), nextAction: "Complete and preserve a passing live 25-2 canary evidence packet before ramp." });
  if (evidenceClass !== "live_observed") blockers.push({ gateId: "ramp_observation", reason: reasonFor(fixtureEvidence ? "fixture_evidence" : "evidence_attestation_invalid"), nextAction: "Attach a fresh independent observation receipt bound to the ramp packet before promotion." });
  const planValid = expectedWorkerCounts.length > 0 && (expectedWorkerCounts.every((value, index) => index === 0 || value > expectedWorkerCounts[index - 1])) &&
    (!changedPlan || Boolean(planRationale && planAuthorityProven));
  if (!planValid) blockers.push({ gateId: "stage_plan", reason: reasonFor("stage_plan_invalid"), nextAction: "Use the default 1, 2, 4, 6 stage sequence or provide rationale, authority, and replacement thresholds." });
  let priorPassed = true;
  for (const [index, stage] of stages.entries()) {
    const expectedWorkerCount = expectedWorkerCounts[index];
    const thresholdReady = Object.values(stage.rollbackThresholds).every(Boolean);
    const resourceValue = Math.max(stage.observed.cpuPercent ?? -1, stage.observed.memoryPercent ?? -1, stage.observed.diskPercent ?? -1);
    const measurementsPass = thresholdReady &&
      rampMetricPasses(stage.observed.latencyMs, stage.rollbackThresholds.latency) &&
      rampMetricPasses(stage.observed.errorCount, stage.rollbackThresholds.errors) &&
      rampMetricPasses(resourceValue >= 0 ? resourceValue : null, stage.rollbackThresholds.resources) &&
      rampMetricPasses(stage.observed.costCents, stage.rollbackThresholds.cost) &&
      stage.observed.leaseHealthy === true && ["normal", "ready"].includes(stage.observed.usageState);
    const lifecycleReady = stage.lifecycleAmbiguous !== true && stage.skipped !== true && priorPassed;
    const stageReady = stage.workerCount === expectedWorkerCount && stage.capacityReady && (stage.durationSeconds || 0) > 0 && Boolean(stage.owner) && (stage.budgetCents || 0) > 0 &&
      thresholdReady && stage.authority.state === "allowed" && stage.authority.proven === true && stage.evidenceRefs.length > 0 && measurementsPass && lifecycleReady;
    const thresholdBreached = stage.lifecycleAmbiguous === true || !measurementsPass && stage.observed.queueDepth !== null;
    const stageOutcome = thresholdBreached ? "stop" : stageReady && canaryPass && planValid && evidenceClass === "live_observed" ? "pass" : "hold";
    const stageBlockers = [];
    if (stage.workerCount !== expectedWorkerCount || !stage.capacityReady || !stage.owner || !stage.durationSeconds || !stage.budgetCents) stageBlockers.push({ code: "capacity_missing", message: "Stage capacity, duration, owner, or budget metadata is incomplete." });
    if (!thresholdReady) stageBlockers.push({ code: "stage_threshold_missing", message: "Stage rollback thresholds are incomplete." });
    if (stage.authority.state !== "allowed" || stage.authority.proven !== true) stageBlockers.push({ code: "stage_authority_missing", message: "Stage authority is not explicitly proven." });
    if (stage.evidenceRefs.length === 0) stageBlockers.push({ code: "stage_evidence_missing", message: "Stage evidence refs are missing." });
    if (stage.lifecycleAmbiguous || stage.skipped || !priorPassed) stageBlockers.push({ code: "stage_lifecycle_ambiguous", message: "Stage lifecycle is skipped, ambiguous, or follows a failed stage." });
    if (!measurementsPass) stageBlockers.push({ code: "stage_threshold_exceeded", message: "Stage observations do not satisfy rollback thresholds." });
    stageResults.push({ ...stage, outcome: stageOutcome, typedBlockers: stageBlockers, rampAllowed: stageOutcome === "pass" });
    if (stageOutcome !== "pass") priorPassed = false;
    if (stageOutcome === "stop") blockers.push({ gateId: stage.stageId || `stage-${index + 1}`, reason: reasonFor(stage.lifecycleAmbiguous ? "stage_lifecycle_ambiguous" : "stage_threshold_exceeded"), nextAction: "Stop the stage, preserve metadata-only evidence, execute rollback, and block the next stage." });
    else if (stageOutcome !== "pass") blockers.push({ gateId: stage.stageId || `stage-${index + 1}`, reason: reasonFor(stageBlockers[0]?.code || "stage_evidence_missing"), nextAction: "Repair the stage evidence and rerun the ramp gate before continuing." });
  }
  const uniqueBlockers = blockers.filter((entry, index, list) => list.findIndex((candidate) => candidate.gateId === entry.gateId && candidate.reason === entry.reason) === index);
  const stop = uniqueBlockers.some((entry) => ["stage_threshold_exceeded", "stage_lifecycle_ambiguous"].includes(entry.reason));
  const outcome = stop ? "stop" : uniqueBlockers.length === 0 ? "pass" : "hold";
  const recoveryInput = context.recovery || {};
  const recovery = {
    owner: safeId(recoveryInput.owner),
    rollbackPath: safeText(recoveryInput.rollbackPath) ? text(recoveryInput.rollbackPath, "", 180) : "",
    remediationAction: safeText(recoveryInput.remediationAction) ? text(recoveryInput.remediationAction, "", 220) : "",
    required: stop,
  };
  const scaleEvidenceReady = outcome === "pass";
  const nextManagerAction = outcome === "pass"
    ? "Preserve per-stage scale evidence for 25-6; do not auto-rollout, merge, cleanup, or call providers."
    : stop
      ? "Stop the current ramp stage, preserve metadata-only evidence, execute rollback, and block the next stage."
      : "Repair the canary, stage plan, authority, threshold, or lifecycle blockers before any ramp attempt.";
  return {
    schemaVersion: RAMP_SCHEMA_VERSION,
    evidenceClass,
    observedEvidenceAttestation: boundObservationAttestation,
    canaryEvidenceRef: evidenceRefs.find((ref) => ref.startsWith("evidence:")) || null,
    canaryOutcome: canaryEvidence.outcome || "unknown",
    defaultStageWorkerCounts: DEFAULT_RAMP_WORKER_COUNTS,
    stageWorkerCounts: expectedWorkerCounts,
    changedPlan,
    planRationale,
    planAuthority: { state: planAuthority.state === "allowed" ? "allowed" : "blocked", proven: planAuthorityProven, evidenceRefs: refs(planAuthority.evidenceRefs) },
    stages: stageResults,
    recovery,
    outcome,
    scaleEvidenceReady,
    rolloutAllowed: false,
    typedBlockers: uniqueBlockers,
    sourceRefs,
    evidenceRefs,
    checkedAt,
    expiresAt: new Date(checkedAtMs + FRESHNESS_TTL_MS).toISOString(),
    nextManagerAction,
    stopLines: ["no_automatic_rollout", "no_provider_calls", "no_secret_access", "no_merge_or_cleanup"],
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

export function validateLiveCapacityRampEvidence(evidence = {}) {
  const blockers = [];
  if (evidence?.schemaVersion !== RAMP_SCHEMA_VERSION) blockers.push({ code: "bad_schema_version", message: "Unsupported live capacity ramp evidence schema." });
  if (!RAMP_OUTCOMES.has(evidence?.outcome)) blockers.push({ code: "unknown", message: "Ramp outcome is missing or malformed." });
  if (evidence?.metadataOnly !== true || evidence?.rawPayloadRetained !== false || evidence?.rolloutAllowed !== false) blockers.push({ code: "safety_violation", message: "Ramp evidence must remain metadata-only and rollout-disabled." });
  if (!Array.isArray(evidence?.stages) || evidence.stages.length === 0) blockers.push({ code: "evidence_missing", message: "Ramp evidence requires ordered stage records." });
  if (!Array.isArray(evidence?.sourceRefs) || refs(evidence.sourceRefs).length !== evidence.sourceRefs.length || evidence.sourceRefs.length === 0) blockers.push({ code: "evidence_missing", message: "Ramp evidence requires safe source refs." });
  if (!Array.isArray(evidence?.evidenceRefs) || refs(evidence.evidenceRefs).length !== evidence.evidenceRefs.length || evidence.evidenceRefs.length === 0) blockers.push({ code: "evidence_missing", message: "Ramp evidence requires safe evidence refs." });
  if (!safeText(evidence?.nextManagerAction)) blockers.push({ code: "evidence_missing", message: "Ramp evidence requires a safe next manager action." });
  const checkedAtMs = Date.parse(evidence?.checkedAt || "");
  const expiresAtMs = Date.parse(evidence?.expiresAt || "");
  if (!Number.isFinite(checkedAtMs) || !Number.isFinite(expiresAtMs) || expiresAtMs <= checkedAtMs || expiresAtMs - checkedAtMs > FRESHNESS_TTL_MS) blockers.push({ code: "evidence_stale", message: "Ramp evidence timestamps must be fresh and bounded." });
  blockers.push(...validateEvidenceProvenance(evidence, RAMP_SCHEMA_VERSION, checkedAtMs));
  if (evidence?.outcome === "pass" && (evidence.evidenceClass !== "live_observed" || evidence.scaleEvidenceReady !== true || evidence.rolloutAllowed !== false || (evidence.typedBlockers || []).length > 0 || evidence.canaryOutcome !== "pass")) blockers.push({ code: "inconsistent_result", message: "A passing ramp requires independently observed canary evidence, complete stage evidence, and rollout disabled." });
  if (evidence?.outcome === "stop" && evidence?.recovery?.required !== true) blockers.push({ code: "recovery_missing", message: "A stopped ramp requires rollback metadata." });
  return blockers;
}

function normalizeRecoveryDrill(input = {}, index = 0) {
  const observed = input.observed || input.observations || {};
  const authority = input.authority || {};
  return {
    drillId: safeId(input.drillId || input.drill_id || `drill-${index + 1}`),
    kind: RECOVERY_DRILL_KINDS.includes(input.kind) ? input.kind : "recovery",
    owner: safeId(input.owner),
    authority: { state: authority.state === "allowed" ? "allowed" : "blocked", proven: authority.proven === true, evidenceRefs: refs(authority.evidenceRefs) },
    expectedRecoveryAction: safeText(input.expectedRecoveryAction || input.expected_recovery_action) ? text(input.expectedRecoveryAction || input.expected_recovery_action, "", 220) : "",
    observed: {
      stateBefore: safeId(observed.stateBefore || observed.state_before),
      stateAfter: safeId(observed.stateAfter || observed.state_after),
      ownershipBefore: safeId(observed.ownershipBefore || observed.ownership_before),
      ownershipAfter: safeId(observed.ownershipAfter || observed.ownership_after),
      leaseState: safeId(observed.leaseState || observed.lease_state),
      idempotencyState: ["proven", "preserved", "unknown", "ambiguous"].includes(observed.idempotencyState || observed.idempotency_state) ? (observed.idempotencyState || observed.idempotency_state) : "unknown",
      rollbackState: safeId(observed.rollbackState || observed.rollback_state),
      evidenceRetained: observed.evidenceRetained === true || observed.evidence_retained === true,
      ambiguous: observed.ambiguous === true,
      silentRetry: observed.silentRetry === true || observed.silent_retry === true,
      retryCount: nonNegativeNumber(observed.retryCount ?? observed.retry_count),
    },
    evidenceRefs: refs(input.evidenceRefs),
    nextAction: safeText(input.nextAction || input.next_action) ? text(input.nextAction || input.next_action, "", 220) : "",
  };
}

export function buildResilienceRecoveryEvidence(options = {}, context = {}) {
  const nowValue = Date.parse(text(context.now || options.now, new Date().toISOString()));
  const checkedAtMs = Number.isFinite(nowValue) ? nowValue : Date.now();
  const checkedAt = new Date(checkedAtMs).toISOString();
  const predecessor = context.rampEvidence || context.canaryEvidence || options.rampEvidence || options.canaryEvidence || {};
  const fixtureEvidence = context.fixtureEvidence === true || predecessor.evidenceClass === "fixture";
  const targetRef = observationTargetRef(context.target || predecessor.target) || safeId(predecessor.observedEvidenceAttestation?.subject?.targetRef);
  const observationAttestation = observedEvidenceAttestation(
    context.observedEvidenceAttestation || options.observedEvidenceAttestation,
    RECOVERY_SCHEMA_VERSION,
    checkedAtMs,
    targetRef,
  );
  const sourceRefs = refs([...(predecessor.sourceRefs || []), ...(context.sourceRefs || [])]);
  const evidenceRefs = refs([...(predecessor.evidenceRefs || []), ...(context.evidenceRefs || [])]);
  const boundObservationAttestation = !fixtureEvidence && targetRef && attestationBindsPacket(observationAttestation, sourceRefs, evidenceRefs, targetRef)
    ? observationAttestation
    : null;
  const evidenceClass = evidenceClassFor({ fixtureEvidence, attestation: boundObservationAttestation });
  const predecessorReady = !fixtureEvidence && predecessor.outcome === "pass" && (predecessor.scaleEvidenceReady === true || predecessor.rampAllowed === true);
  const requestedDrills = Array.isArray(context.drills || options.drills) ? (context.drills || options.drills) : RECOVERY_DRILL_KINDS.map((kind) => ({ kind }));
  const drills = requestedDrills.map(normalizeRecoveryDrill);
  const blockers = [];
  if (!predecessorReady) blockers.push({ drillId: "predecessor", reason: reasonFor("evidence_missing"), nextAction: "Preserve canary or ramp evidence before running recovery validation." });
  if (evidenceClass !== "live_observed") blockers.push({ drillId: "recovery_observation", reason: reasonFor(fixtureEvidence ? "fixture_evidence" : "evidence_attestation_invalid"), nextAction: "Attach a fresh independent observation receipt bound to the recovery packet before promotion." });
  let priorPassed = true;
  const results = [];
  for (const [index, drill] of drills.entries()) {
    const observed = drill.observed;
    const identityReady = Boolean(observed.stateBefore && observed.stateAfter && observed.ownershipBefore && observed.ownershipAfter && observed.leaseState);
    const safetyReady = drill.authority.state === "allowed" && drill.authority.proven === true && drill.evidenceRefs.length > 0 && drill.expectedRecoveryAction && drill.nextAction;
    const recoveryReady = observed.evidenceRetained === true && ["proven", "preserved"].includes(observed.idempotencyState) && observed.ambiguous !== true && observed.silentRetry !== true && priorPassed;
    const boundaryBreached = observed.ambiguous === true || observed.silentRetry === true || observed.idempotencyState === "ambiguous";
    const outcome = boundaryBreached ? "stop" : predecessorReady && identityReady && safetyReady && recoveryReady && evidenceClass === "live_observed" ? "pass" : "hold";
    const typedBlockers = [];
    if (!identityReady) typedBlockers.push({ code: "drill_evidence_missing", message: "Drill state, ownership, or lease identity evidence is incomplete." });
    if (!safetyReady) typedBlockers.push({ code: "stage_authority_missing", message: "Drill authority, expected recovery action, or evidence refs are incomplete." });
    if (!observed.evidenceRetained) typedBlockers.push({ code: "drill_evidence_missing", message: "Recovery evidence retention is not proven." });
    if (!['proven', 'preserved'].includes(observed.idempotencyState)) typedBlockers.push({ code: "idempotency_unproven", message: "Idempotency is not proven or preserved across the drill." });
    if (observed.ambiguous) typedBlockers.push({ code: "recovery_ambiguity", message: "Recovery left state or ownership ambiguous." });
    if (observed.silentRetry) typedBlockers.push({ code: "silent_retry", message: "Silent retry is forbidden for recovery drills." });
    results.push({ ...drill, outcome, rampAllowed: false, typedBlockers });
    if (outcome !== "pass") priorPassed = false;
    if (outcome === "stop") blockers.push({ drillId: drill.drillId || `drill-${index + 1}`, reason: reasonFor(observed.silentRetry ? "silent_retry" : "recovery_ambiguity"), nextAction: "Hold the lane, preserve metadata-only evidence, and route the drill through rollback/recovery inspection." });
    else if (outcome !== "pass") blockers.push({ drillId: drill.drillId || `drill-${index + 1}`, reason: reasonFor(typedBlockers[0]?.code || "drill_evidence_missing"), nextAction: "Repair the recovery drill evidence before validating the next drill." });
  }
  const uniqueBlockers = blockers.filter((entry, index, list) => list.findIndex((candidate) => candidate.drillId === entry.drillId && candidate.reason === entry.reason) === index);
  const stop = uniqueBlockers.some((entry) => ["recovery_ambiguity", "silent_retry"].includes(entry.reason));
  const outcome = stop ? "stop" : uniqueBlockers.length === 0 ? "pass" : "hold";
  const recoveryInput = context.recovery || {};
  const recovery = {
    owner: safeId(recoveryInput.owner),
    rollbackPath: safeText(recoveryInput.rollbackPath) ? text(recoveryInput.rollbackPath, "", 180) : "",
    remediationAction: safeText(recoveryInput.remediationAction) ? text(recoveryInput.remediationAction, "", 220) : "",
    required: stop,
  };
  return {
    schemaVersion: RECOVERY_SCHEMA_VERSION,
    evidenceClass,
    observedEvidenceAttestation: boundObservationAttestation,
    predecessorOutcome: predecessor.outcome || "unknown",
    predecessorReady,
    drillKinds: RECOVERY_DRILL_KINDS,
    drills: results,
    recovery,
    outcome,
    reliabilityEvidenceReady: outcome === "pass",
    limitedRolloutBoundaries: outcome === "pass" ? ["bounded-scope-only", "monitor-and-stop-on-threshold", "no-automatic-rollout"] : [],
    rolloutAllowed: false,
    typedBlockers: uniqueBlockers,
    sourceRefs,
    evidenceRefs,
    checkedAt,
    expiresAt: new Date(checkedAtMs + FRESHNESS_TTL_MS).toISOString(),
    nextManagerAction: outcome === "pass"
      ? "Preserve recovery evidence for 25-6; keep rollout and provider authority disabled."
      : stop
        ? "Hold the lane, preserve metadata-only evidence, and route rollback/recovery inspection before promotion."
        : "Repair predecessor, ownership, idempotency, evidence, or recovery blockers before rerunning drills.",
    stopLines: ["no_silent_retry", "no_ambiguous_cleanup", "no_provider_calls", "no_automatic_rollout"],
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

export function validateResilienceRecoveryEvidence(evidence = {}) {
  const blockers = [];
  if (evidence?.schemaVersion !== RECOVERY_SCHEMA_VERSION) blockers.push({ code: "bad_schema_version", message: "Unsupported resilience/recovery evidence schema." });
  if (!RECOVERY_OUTCOMES.has(evidence?.outcome)) blockers.push({ code: "unknown", message: "Recovery outcome is missing or malformed." });
  if (evidence?.metadataOnly !== true || evidence?.rawPayloadRetained !== false || evidence?.rolloutAllowed !== false) blockers.push({ code: "safety_violation", message: "Recovery evidence must remain metadata-only with rollout disabled." });
  if (!Array.isArray(evidence?.drills) || evidence.drills.length === 0) blockers.push({ code: "evidence_missing", message: "Recovery evidence requires drill records." });
  if (!Array.isArray(evidence?.sourceRefs) || refs(evidence.sourceRefs).length !== evidence.sourceRefs.length || evidence.sourceRefs.length === 0) blockers.push({ code: "evidence_missing", message: "Recovery evidence requires safe source refs." });
  if (!Array.isArray(evidence?.evidenceRefs) || refs(evidence.evidenceRefs).length !== evidence.evidenceRefs.length || evidence.evidenceRefs.length === 0) blockers.push({ code: "evidence_missing", message: "Recovery evidence requires safe evidence refs." });
  if (!safeText(evidence?.nextManagerAction)) blockers.push({ code: "evidence_missing", message: "Recovery evidence requires a safe next manager action." });
  const checkedAtMs = Date.parse(evidence?.checkedAt || "");
  const expiresAtMs = Date.parse(evidence?.expiresAt || "");
  if (!Number.isFinite(checkedAtMs) || !Number.isFinite(expiresAtMs) || expiresAtMs <= checkedAtMs || expiresAtMs - checkedAtMs > FRESHNESS_TTL_MS) blockers.push({ code: "evidence_stale", message: "Recovery evidence timestamps must be fresh and bounded." });
  blockers.push(...validateEvidenceProvenance(evidence, RECOVERY_SCHEMA_VERSION, checkedAtMs));
  if (evidence?.outcome === "pass" && (evidence.evidenceClass !== "live_observed" || evidence.reliabilityEvidenceReady !== true || evidence.rolloutAllowed !== false || (evidence.typedBlockers || []).length > 0)) blockers.push({ code: "inconsistent_result", message: "Passing recovery evidence requires independently observed drills, no blockers, and rollout disabled." });
  if (evidence?.outcome === "stop" && evidence?.recovery?.required !== true) blockers.push({ code: "recovery_missing", message: "A stopped recovery validation requires rollback metadata." });
  return blockers;
}

function normalizeHardeningDomain(input = {}, index = 0) {
  const domain = HARDENING_DOMAINS.includes(input.domain) ? input.domain : HARDENING_DOMAINS[index] || `domain-${index + 1}`;
  const riskTier = ["low", "medium", "high", "extreme"].includes(input.riskTier) ? input.riskTier : "high";
  return {
    domain,
    owner: safeId(input.owner),
    trigger: safeText(input.trigger) ? text(input.trigger, "", 220) : "",
    evidenceGate: safeText(input.evidenceGate || input.evidence_gate) ? text(input.evidenceGate || input.evidence_gate, "", 220) : "",
    recoveryAction: safeText(input.recoveryAction || input.recovery_action) ? text(input.recoveryAction || input.recovery_action, "", 220) : "",
    riskTier,
    unresolvedHighRiskGap: input.unresolvedHighRiskGap === true || input.unresolved_high_risk_gap === true,
    evidenceRefs: refs(input.evidenceRefs),
    status: input.status === "pass" ? "pass" : "hold",
  };
}

export function buildOperationalHardeningRunbookEvidence(options = {}, context = {}) {
  const nowValue = Date.parse(text(context.now || options.now, new Date().toISOString()));
  const checkedAtMs = Number.isFinite(nowValue) ? nowValue : Date.now();
  const checkedAt = new Date(checkedAtMs).toISOString();
  const predecessor = context.recoveryEvidence || context.rampEvidence || context.canaryEvidence || options.recoveryEvidence || options.rampEvidence || {};
  const fixtureEvidence = context.fixtureEvidence === true || predecessor.evidenceClass === "fixture";
  const targetRef = observationTargetRef(context.target || predecessor.target) || safeId(predecessor.observedEvidenceAttestation?.subject?.targetRef);
  const observationAttestation = observedEvidenceAttestation(
    context.observedEvidenceAttestation || options.observedEvidenceAttestation,
    HARDENING_SCHEMA_VERSION,
    checkedAtMs,
    targetRef,
  );
  const sourceRefs = refs([...(predecessor.sourceRefs || []), ...(context.sourceRefs || [])]);
  const evidenceRefs = refs([...(predecessor.evidenceRefs || []), ...(context.evidenceRefs || [])]);
  const boundObservationAttestation = !fixtureEvidence && targetRef && attestationBindsPacket(observationAttestation, sourceRefs, evidenceRefs, targetRef)
    ? observationAttestation
    : null;
  const evidenceClass = evidenceClassFor({ fixtureEvidence, attestation: boundObservationAttestation });
  const predecessorReady = !fixtureEvidence && predecessor.outcome === "pass" && (predecessor.reliabilityEvidenceReady === true || predecessor.scaleEvidenceReady === true || predecessor.rampAllowed === true);
  const requestedDomains = Array.isArray(context.domains || options.domains) ? (context.domains || options.domains) : HARDENING_DOMAINS.map((domain) => ({ domain }));
  const domains = HARDENING_DOMAINS.map((domain, index) => normalizeHardeningDomain(requestedDomains.find((candidate) => candidate?.domain === domain) || {}, index));
  const blockers = [];
  if (!predecessorReady) blockers.push({ domain: "predecessor", reason: reasonFor("evidence_missing"), nextAction: "Preserve scale and resilience evidence before hardening handoff." });
  if (evidenceClass !== "live_observed") blockers.push({ domain: "hardening_observation", reason: reasonFor(fixtureEvidence ? "fixture_evidence" : "evidence_attestation_invalid"), nextAction: "Attach a fresh independent observation receipt bound to the hardening packet before promotion." });
  for (const item of domains) {
    const complete = Boolean(item.owner && item.trigger && item.evidenceGate && item.recoveryAction && item.evidenceRefs.length > 0);
    const highRisk = item.unresolvedHighRiskGap || (item.riskTier === "high" || item.riskTier === "extreme") && item.status !== "pass";
    if (!complete) blockers.push({ domain: item.domain, reason: reasonFor("runbook_gap"), nextAction: "Add the owner, trigger, exact evidence gate, recovery action, and evidence refs." });
    if (highRisk) blockers.push({ domain: item.domain, reason: reasonFor("high_risk_gap"), nextAction: "Hold readiness and resolve the high-risk operational gap; do not waive it." });
  }
  const uniqueBlockers = blockers.filter((entry, index, list) => list.findIndex((candidate) => candidate.domain === entry.domain && candidate.reason === entry.reason) === index);
  const stop = uniqueBlockers.some((entry) => entry.reason === "high_risk_gap");
  const outcome = stop ? "stop" : uniqueBlockers.length === 0 ? "pass" : "hold";
  const recoveryInput = context.recovery || {};
  const recovery = {
    owner: safeId(recoveryInput.owner),
    rollbackPath: safeText(recoveryInput.rollbackPath) ? text(recoveryInput.rollbackPath, "", 180) : "",
    remediationAction: safeText(recoveryInput.remediationAction) ? text(recoveryInput.remediationAction, "", 220) : "",
    required: stop,
  };
  return {
    schemaVersion: HARDENING_SCHEMA_VERSION,
    evidenceClass,
    observedEvidenceAttestation: boundObservationAttestation,
    predecessorOutcome: predecessor.outcome || "unknown",
    predecessorReady,
    domains,
    recovery,
    outcome,
    readinessHandoffReady: outcome === "pass",
    rolloutAllowed: false,
    typedBlockers: uniqueBlockers,
    sourceRefs,
    evidenceRefs,
    checkedAt,
    expiresAt: new Date(checkedAtMs + FRESHNESS_TTL_MS).toISOString(),
    nextManagerAction: outcome === "pass"
      ? "Hand off exact hardening and runbook refs to 25-6; keep rollout, provider, merge, and cleanup authority disabled."
      : stop
        ? "Hold readiness, resolve every high-risk runbook gap, and preserve the blocker evidence."
        : "Complete the missing operational owner, trigger, gate, recovery, or predecessor evidence before handoff.",
    stopLines: ["no_high_risk_gap_waiver", "no_secret_value_retention", "no_provider_calls", "no_automatic_rollout"],
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

export function validateOperationalHardeningRunbookEvidence(evidence = {}) {
  const blockers = [];
  if (evidence?.schemaVersion !== HARDENING_SCHEMA_VERSION) blockers.push({ code: "bad_schema_version", message: "Unsupported operational hardening schema." });
  if (!HARDENING_OUTCOMES.has(evidence?.outcome)) blockers.push({ code: "unknown", message: "Hardening outcome is missing or malformed." });
  if (evidence?.metadataOnly !== true || evidence?.rawPayloadRetained !== false || evidence?.rolloutAllowed !== false) blockers.push({ code: "safety_violation", message: "Hardening evidence must remain metadata-only with rollout disabled." });
  if (!Array.isArray(evidence?.domains) || evidence.domains.length !== HARDENING_DOMAINS.length) blockers.push({ code: "evidence_missing", message: "Hardening evidence requires every operational domain." });
  if (!Array.isArray(evidence?.sourceRefs) || refs(evidence.sourceRefs).length !== evidence.sourceRefs.length || evidence.sourceRefs.length === 0) blockers.push({ code: "evidence_missing", message: "Hardening evidence requires safe source refs." });
  if (!Array.isArray(evidence?.evidenceRefs) || refs(evidence.evidenceRefs).length !== evidence.evidenceRefs.length || evidence.evidenceRefs.length === 0) blockers.push({ code: "evidence_missing", message: "Hardening evidence requires safe evidence refs." });
  if (!safeText(evidence?.nextManagerAction)) blockers.push({ code: "evidence_missing", message: "Hardening evidence requires a safe next manager action." });
  const checkedAtMs = Date.parse(evidence?.checkedAt || "");
  const expiresAtMs = Date.parse(evidence?.expiresAt || "");
  if (!Number.isFinite(checkedAtMs) || !Number.isFinite(expiresAtMs) || expiresAtMs <= checkedAtMs || expiresAtMs - checkedAtMs > FRESHNESS_TTL_MS) blockers.push({ code: "evidence_stale", message: "Hardening evidence timestamps must be fresh and bounded." });
  blockers.push(...validateEvidenceProvenance(evidence, HARDENING_SCHEMA_VERSION, checkedAtMs));
  if (evidence?.outcome === "pass" && (evidence.evidenceClass !== "live_observed" || evidence.readinessHandoffReady !== true || evidence.rolloutAllowed !== false || (evidence.typedBlockers || []).length > 0)) blockers.push({ code: "inconsistent_result", message: "Passing hardening evidence requires independently observed predecessors, complete domains, no blockers, and rollout disabled." });
  if (evidence?.outcome === "stop" && evidence?.recovery?.required !== true) blockers.push({ code: "recovery_missing", message: "Stopped hardening requires recovery metadata." });
  return blockers;
}

function decisionTextList(value, fallback = [], max = 12) {
  if (!Array.isArray(value)) return fallback;
  return value.map((entry) => safeText(entry) ? text(entry, "", 220) : "").filter(Boolean).slice(0, max);
}

function decisionRefs(...values) {
  const candidates = values.flatMap((value) => Array.isArray(value) ? value : []);
  return refs(candidates.slice(0, 24));
}

function decisionPacketSources(packet = {}) {
  return decisionRefs(packet.sourceRefs, packet.target?.sourceRefs);
}

function decisionPacketEvidence(packet = {}) {
  return decisionRefs(packet.evidenceRefs, packet.target?.evidenceRefs);
}

function decisionPacketFresh(packet = {}, checkedAtMs) {
  const packetCheckedAtMs = Date.parse(packet.checkedAt || "");
  const packetExpiresAtMs = Date.parse(packet.expiresAt || "");
  return Number.isFinite(packetCheckedAtMs) && Number.isFinite(packetExpiresAtMs)
    && packetCheckedAtMs <= checkedAtMs
    && packetExpiresAtMs >= checkedAtMs
    && packetExpiresAtMs > packetCheckedAtMs
    && packetExpiresAtMs - packetCheckedAtMs <= FRESHNESS_TTL_MS;
}

function decisionPacketValidator(id) {
  return {
    canary: validateOneWorkerLiveCanaryEvidence,
    ramp: validateLiveCapacityRampEvidence,
    recovery: validateResilienceRecoveryEvidence,
    hardening: validateOperationalHardeningRunbookEvidence,
  }[id];
}

function decisionPacketOutcome(id, packet = {}) {
  if (id === "canary") return packet.outcome === "pass";
  if (id === "ramp") return packet.outcome === "pass";
  if (id === "recovery") return packet.outcome === "pass";
  if (id === "hardening") return packet.outcome === "pass";
  return false;
}

function collectDecisionThresholds(context = {}, packets = []) {
  const output = {};
  const add = (name, value) => {
    const normalized = threshold(value, name);
    if (normalized) output[normalized.name || safeId(name)] = normalized;
  };
  for (const [name, value] of Object.entries(context.thresholds || context.readinessProfile?.thresholds || {})) add(name, value);
  for (const packet of packets) {
    for (const [name, value] of Object.entries(packet?.thresholds || {})) add(name, value);
    for (const stage of Array.isArray(packet?.stages) ? packet.stages : []) {
      for (const [name, value] of Object.entries(stage?.rollbackThresholds || {})) add(name, value);
    }
  }
  return output;
}

function decisionBlocker(code, message, nextAction) {
  return {
    code: safeId(code) || "decision_blocked",
    message: safeText(message) ? text(message, "", 220) : "Production readiness decision is blocked.",
    nextAction: safeText(nextAction) ? text(nextAction, "", 220) : "Hold and inspect the latest readiness evidence.",
  };
}

export function buildProductionReadinessDecisionEvidence(options = {}, context = {}) {
  const nowValue = Date.parse(text(context.now || options.now, new Date().toISOString()));
  const checkedAtMs = Number.isFinite(nowValue) ? nowValue : Date.now();
  const checkedAt = new Date(checkedAtMs).toISOString();
  const observationAttestationInput = context.observedEvidenceAttestation || options.observedEvidenceAttestation;
  const canaryEvidence = context.canaryEvidence || context.oneWorkerLiveCanary || context.canary || options.canaryEvidence || {};
  const rampEvidence = context.rampEvidence || context.liveCapacityRamp || context.capacityRamp || options.rampEvidence || {};
  const recoveryEvidence = context.recoveryEvidence || context.resilienceRecovery || context.recoveryValidation || options.recoveryEvidence || {};
  const hardeningEvidence = context.hardeningEvidence || context.operationalHardening || context.hardeningRunbooks || options.hardeningEvidence || {};
  const packetEntries = [
    { id: "canary", packet: canaryEvidence },
    { id: "ramp", packet: rampEvidence },
    { id: "recovery", packet: recoveryEvidence },
    { id: "hardening", packet: hardeningEvidence },
  ];
  const predecessorTargetRefs = new Set(packetEntries
    .map(({ packet }) => safeId(packet?.observedEvidenceAttestation?.subject?.targetRef))
    .filter(Boolean));
  const targetRef = predecessorTargetRefs.size === 1 ? [...predecessorTargetRefs][0] : "";
  const observationAttestation = targetRef ? observedEvidenceAttestation(
    observationAttestationInput,
    PRODUCTION_DECISION_SCHEMA_VERSION,
    checkedAtMs,
    targetRef,
  ) : null;
  const observationSourceRefs = decisionRefs(context.sourceRefs, ...packetEntries.map((entry) => decisionPacketSources(entry.packet)));
  const observationEvidenceRefs = decisionRefs(context.evidenceRefs, ...packetEntries.map((entry) => decisionPacketEvidence(entry.packet)));
  const boundObservationAttestation = context.fixtureEvidence !== true && targetRef && attestationBindsPacket(observationAttestation, observationSourceRefs, observationEvidenceRefs, targetRef)
    ? observationAttestation
    : null;
  const typedBlockers = [];
  let structurallyReady = true;
  let simulatedEvidence = false;
  let staleEvidence = false;
  let fixtureEvidence = context.fixtureEvidence === true;
  let unknownEvidence = false;
  for (const entry of packetEntries) {
    const packet = entry.packet;
    if (!packet || typeof packet !== "object" || !packet.schemaVersion) {
      structurallyReady = false;
      typedBlockers.push(decisionBlocker("decision_predecessor_missing", `Missing ${entry.id} readiness evidence.`, `Preserve authoritative ${entry.id} evidence before making the final decision.`));
      continue;
    }
    const validator = decisionPacketValidator(entry.id);
    const validation = typeof validator === "function" ? validator(packet) : [{ code: "invalid", message: "No predecessor validator is available." }];
    const isSimulated = packet.backendTruth === "simulated" || packet.truthLabel === "simulated" || packet.sourceTruth === "simulated";
    const isFixture = packet.evidenceClass === "fixture" || packet.decisionSignals?.fixtureEvidence === true;
    const isLiveObserved = packet.evidenceClass === "live_observed";
    fixtureEvidence ||= isFixture;
    if (isFixture) {
      simulatedEvidence = true;
      structurallyReady = false;
      typedBlockers.push(decisionBlocker("decision_fixture_evidence", `${entry.id} evidence is fixture-backed.`, "Hold the decision until independently observed evidence is captured."));
    }
    if (isSimulated) {
      simulatedEvidence = true;
      structurallyReady = false;
      typedBlockers.push(decisionBlocker("decision_simulated_evidence", `${entry.id} evidence is simulated-only.`, "Hold the decision until authoritative evidence is captured."));
    }
    if (!isLiveObserved && !isFixture && !isSimulated) {
      unknownEvidence = true;
      structurallyReady = false;
      typedBlockers.push(decisionBlocker("decision_evidence_provenance_missing", `${entry.id} evidence has no explicit live provenance.`, "Hold the decision until independently observed live evidence is classified."));
    }
    if (validation.length > 0) {
      structurallyReady = false;
      typedBlockers.push(decisionBlocker("decision_predecessor_invalid", `${entry.id} evidence failed its contract validator.`, "Repair the predecessor evidence and regenerate the decision packet."));
    }
    if (!decisionPacketFresh(packet, checkedAtMs)) {
      staleEvidence = true;
      structurallyReady = false;
      typedBlockers.push(decisionBlocker("decision_predecessor_stale", `${entry.id} evidence is stale or outside the decision window.`, "Refresh the predecessor packet before deciding readiness."));
    }
    if (!decisionPacketOutcome(entry.id, packet)) {
      typedBlockers.push(decisionBlocker("decision_predecessor_not_passed", `${entry.id} evidence did not pass.`, `Hold ${entry.id} promotion and follow its recovery or remediation action.`));
    }
  }
  if (!fixtureEvidence && !boundObservationAttestation) {
    structurallyReady = false;
    unknownEvidence = true;
    typedBlockers.push(decisionBlocker("decision_evidence_attestation_invalid", "The decision packet has no fresh independent observation receipt.", "Hold until a decision receipt is independently issued and bound to this packet schema."));
  }
  if (fixtureEvidence && !typedBlockers.some((blocker) => blocker.code === "decision_fixture_evidence")) {
    structurallyReady = false;
    typedBlockers.push(decisionBlocker("decision_fixture_evidence", "The readiness decision was requested with fixture-backed evidence.", "Hold the decision until independently observed evidence is captured."));
  }
  const finalAuthority = context.finalAuthority || context.decisionAuthority || options.finalAuthority || {};
  const authorityRefs = decisionRefs(finalAuthority.evidenceRefs);
  const authority = {
    state: finalAuthority.state === "allowed" ? "allowed" : "blocked",
    proven: finalAuthority.proven === true,
    evidenceRefs: authorityRefs,
  };
  const authorityReady = authority.state === "allowed" && authority.proven && authorityRefs.length > 0;
  if (!authorityReady) typedBlockers.push(decisionBlocker("decision_authority_missing", "Final production readiness authority is not explicitly proven.", "Hold the decision until separate final authority evidence is recorded."));

  const limitedInput = context.limitedRollout || options.limitedRollout || {};
  const limitedRequested = limitedInput.requested === true;
  const limitedBoundaries = decisionTextList(limitedInput.boundaries, []);
  if (limitedRequested && limitedBoundaries.length === 0) typedBlockers.push(decisionBlocker("decision_limited_scope_missing", "Limited rollout was requested without bounded scope.", "Provide explicit limited-rollout boundaries or hold the decision."));

  const allPredecessorsPass = packetEntries.every((entry) => decisionPacketOutcome(entry.id, entry.packet));
  const noStopPredecessor = packetEntries.every((entry) => !["stop"].includes(entry.packet?.outcome));
  const limitedEligible = structurallyReady && allPredecessorsPass && noStopPredecessor && limitedRequested && limitedBoundaries.length > 0 && authorityReady;
  const decision = limitedEligible ? "limited_rollout" : structurallyReady && allPredecessorsPass && authorityReady && !limitedRequested ? "go" : "hold";
  const predecessorOutcomes = Object.fromEntries(packetEntries.map((entry) => [entry.id, safeId(entry.packet?.outcome || "missing") || "missing"]));
  const scopeInput = context.scope || options.scope || {};
  const scope = {
    name: safeText(scopeInput.name) ? text(scopeInput.name, "", 180) : "bounded-production-readiness",
    boundaries: limitedRequested ? limitedBoundaries : decisionTextList(scopeInput.boundaries, ["metadata-only-manager-scope", "no-automatic-deployment"]),
    limited: decision === "limited_rollout",
  };
  const sourceRefs = decisionRefs(
    context.sourceRefs,
    canaryEvidence.sourceRefs,
    rampEvidence.sourceRefs,
    recoveryEvidence.sourceRefs,
    hardeningEvidence.sourceRefs,
  );
  const evidenceRefs = decisionRefs(
    context.evidenceRefs,
    canaryEvidence.evidenceRefs,
    rampEvidence.evidenceRefs,
    recoveryEvidence.evidenceRefs,
    hardeningEvidence.evidenceRefs,
    authorityRefs,
  );
  const safeSourceRefs = sourceRefs.length > 0 ? sourceRefs : ["source:production-readiness-decision"];
  const safeEvidenceRefs = evidenceRefs.length > 0 ? evidenceRefs : ["evidence:production-readiness-decision"];
  const recoveryInput = context.rollback || context.recovery || hardeningEvidence.recovery || recoveryEvidence.recovery || {};
  const rollback = {
    owner: safeId(recoveryInput.owner) || "manager-control-plane",
    path: safeText(recoveryInput.path || recoveryInput.rollbackPath) ? text(recoveryInput.path || recoveryInput.rollbackPath, "", 220) : "hold-inspect-and-recheck",
    required: decision !== "go" || recoveryInput.required === true,
    evidenceRefs: decisionRefs(recoveryInput.evidenceRefs, safeEvidenceRefs).slice(0, 24),
  };
  const owner = safeId(context.owner || options.owner || finalAuthority.owner) || "manager-control-plane";
  const thresholds = collectDecisionThresholds(context, packetEntries.map((entry) => entry.packet));
  const monitoring = decisionTextList(context.monitoring || options.monitoring, ["monitor-readiness-freshness", "monitor-thresholds-and-recovery", "preserve-stop-lines"]);
  const stopLines = decisionTextList(context.stopLines || options.stopLines, ["no_automatic_deployment", "no_provider_calls", "no_secret_access", "no_merge_or_cleanup_authority"]);
  const rationale = decision === "go"
    ? "All fresh predecessor packets passed and final authority is explicitly proven; continue metadata-only monitoring through existing gates."
    : decision === "limited_rollout"
      ? "Predecessor evidence supports only the explicitly bounded limited scope; preserve stop-lines and keep mutation authority disabled."
      : "Hold production readiness until predecessor evidence, freshness, scope, and final authority blockers are resolved.";
  const evidenceClass = fixtureEvidence ? "fixture" : boundObservationAttestation && !simulatedEvidence && !unknownEvidence ? "live_observed" : "integrated_local";
  return {
    schemaVersion: PRODUCTION_DECISION_SCHEMA_VERSION,
    evidenceClass,
    observedEvidenceAttestation: evidenceClass === "live_observed" ? boundObservationAttestation : null,
    decision,
    rationale,
    scope,
    thresholds,
    authority,
    rollback,
    owner,
    nextManagerAction: decision === "go"
      ? "Continue metadata-only monitoring through existing manager-control-plane gates; do not auto-deploy."
      : decision === "limited_rollout"
        ? "Monitor only the bounded limited scope and stop on any threshold, freshness, or ownership breach."
        : "Hold, repair the earliest readiness blocker, and regenerate this decision packet before promotion.",
    predecessorOutcomes,
    monitoring,
    stopLines,
    typedBlockers: typedBlockers.filter((entry, index, list) => list.findIndex((candidate) => candidate.code === entry.code && candidate.message === entry.message) === index),
    sourceRefs: safeSourceRefs,
    evidenceRefs: safeEvidenceRefs,
    checkedAt,
    expiresAt: new Date(checkedAtMs + FRESHNESS_TTL_MS).toISOString(),
    rolloutAllowed: false,
    automaticDeploymentAllowed: false,
    providerCallsAllowed: false,
    secretAccessAllowed: false,
    mergeAllowed: false,
    cleanupAllowed: false,
    metadataOnly: true,
    rawPayloadRetained: false,
    decisionSignals: {
      allPredecessorsPass,
      authorityReady,
      simulatedEvidence,
      staleEvidence,
      fixtureEvidence,
    },
  };
}

export function validateProductionReadinessDecisionEvidence(evidence = {}) {
  const blockers = [];
  if (evidence?.schemaVersion !== PRODUCTION_DECISION_SCHEMA_VERSION) blockers.push({ code: "bad_schema_version", message: "Unsupported production readiness decision schema." });
  if (!PRODUCTION_DECISIONS.has(evidence?.decision)) blockers.push({ code: "unknown", message: "Production readiness decision is missing or malformed." });
  for (const field of ["rolloutAllowed", "automaticDeploymentAllowed", "providerCallsAllowed", "secretAccessAllowed", "mergeAllowed", "cleanupAllowed"]) {
    if (evidence?.[field] !== false) blockers.push({ code: "safety_violation", message: `Production decision must keep ${field} disabled.` });
  }
  if (evidence?.metadataOnly !== true || evidence?.rawPayloadRetained !== false) blockers.push({ code: "safety_violation", message: "Production readiness decision must be metadata-only." });
  for (const field of ["rationale", "owner", "nextManagerAction"]) if (!safeText(evidence?.[field])) blockers.push({ code: "evidence_missing", message: `Production decision requires safe ${field} metadata.` });
  if (!evidence?.scope || !safeText(evidence.scope.name) || !Array.isArray(evidence.scope.boundaries) || evidence.scope.boundaries.length === 0 || evidence.scope.boundaries.some((entry) => !safeText(entry))) blockers.push({ code: "evidence_missing", message: "Production decision requires bounded scope metadata." });
  if (!evidence?.thresholds || typeof evidence.thresholds !== "object" || Array.isArray(evidence.thresholds)) blockers.push({ code: "evidence_missing", message: "Production decision requires threshold metadata." });
  if (!Array.isArray(evidence?.sourceRefs) || refs(evidence.sourceRefs).length !== evidence.sourceRefs.length || evidence.sourceRefs.length === 0) blockers.push({ code: "evidence_missing", message: "Production decision requires safe source refs." });
  if (!Array.isArray(evidence?.evidenceRefs) || refs(evidence.evidenceRefs).length !== evidence.evidenceRefs.length || evidence.evidenceRefs.length === 0) blockers.push({ code: "evidence_missing", message: "Production decision requires safe evidence refs." });
  if (!Array.isArray(evidence?.monitoring) || evidence.monitoring.length === 0 || evidence.monitoring.some((entry) => !safeText(entry))) blockers.push({ code: "evidence_missing", message: "Production decision requires monitoring metadata." });
  if (!Array.isArray(evidence?.stopLines) || evidence.stopLines.length === 0 || evidence.stopLines.some((entry) => !safeText(entry))) blockers.push({ code: "evidence_missing", message: "Production decision requires explicit stop-lines." });
  const authority = evidence?.authority;
  if (!authority || !["allowed", "blocked"].includes(authority.state) || typeof authority.proven !== "boolean" || !Array.isArray(authority.evidenceRefs) || refs(authority.evidenceRefs).length !== authority.evidenceRefs.length) blockers.push({ code: "evidence_missing", message: "Production decision requires bounded authority metadata." });
  if (["go", "limited_rollout"].includes(evidence?.decision) && (authority?.state !== "allowed" || authority?.proven !== true || !authority?.evidenceRefs?.length)) blockers.push({ code: "authority_violation", message: "Go or limited rollout requires explicit final authority evidence." });
  const rollback = evidence?.rollback;
  if (!rollback || !safeId(rollback.owner) || !safeText(rollback.path) || typeof rollback.required !== "boolean" || !Array.isArray(rollback.evidenceRefs) || refs(rollback.evidenceRefs).length !== rollback.evidenceRefs.length || rollback.evidenceRefs.length === 0) blockers.push({ code: "recovery_missing", message: "Production decision requires rollback owner, path, and evidence." });
  const predecessorOutcomes = evidence?.predecessorOutcomes;
  if (!predecessorOutcomes || typeof predecessorOutcomes !== "object" || Array.isArray(predecessorOutcomes) || !["canary", "ramp", "recovery", "hardening"].every((id) => safeId(predecessorOutcomes[id]))) blockers.push({ code: "evidence_missing", message: "Production decision requires all predecessor outcomes." });
  if (evidence?.decision === "go" && (evidence.scope?.limited === true || ["canary", "ramp", "recovery", "hardening"].some((id) => predecessorOutcomes?.[id] !== "pass") || (evidence.typedBlockers || []).length > 0)) blockers.push({ code: "inconsistent_result", message: "Go requires all predecessor outcomes to pass with no blockers." });
  blockers.push(...validateEvidenceProvenance(evidence, PRODUCTION_DECISION_SCHEMA_VERSION, Date.parse(evidence?.checkedAt || "")));
  if (["go", "limited_rollout"].includes(evidence?.decision) && evidence.evidenceClass !== "live_observed") blockers.push({ code: "decision_non_live_evidence", message: "Production readiness decisions cannot promote non-live evidence." });
  if (evidence?.decision === "limited_rollout" && (evidence.scope?.limited !== true || !Array.isArray(evidence.scope.boundaries) || evidence.scope.boundaries.length === 0 || ["canary", "ramp", "recovery", "hardening"].some((id) => predecessorOutcomes?.[id] !== "pass"))) blockers.push({ code: "inconsistent_result", message: "Limited rollout requires bounded scope and all predecessors to pass." });
  const checkedAtMs = Date.parse(evidence?.checkedAt || "");
  const expiresAtMs = Date.parse(evidence?.expiresAt || "");
  if (!Number.isFinite(checkedAtMs) || !Number.isFinite(expiresAtMs) || expiresAtMs <= checkedAtMs || expiresAtMs - checkedAtMs > FRESHNESS_TTL_MS) blockers.push({ code: "evidence_stale", message: "Production decision timestamps must be fresh and bounded." });
  return blockers;
}

export {
  SCHEMA_VERSION as PIPELINE_OPERATIONAL_READINESS_CONTRACT_SCHEMA_VERSION,
  REQUIRED_GATES as PIPELINE_OPERATIONAL_READINESS_REQUIRED_GATES,
  CANARY_SCHEMA_VERSION as PIPELINE_ONE_WORKER_LIVE_CANARY_SCHEMA_VERSION,
  RAMP_SCHEMA_VERSION as PIPELINE_LIVE_CAPACITY_RAMP_SCHEMA_VERSION,
  RECOVERY_SCHEMA_VERSION as PIPELINE_RESILIENCE_RECOVERY_SCHEMA_VERSION,
  HARDENING_SCHEMA_VERSION as PIPELINE_OPERATIONAL_HARDENING_SCHEMA_VERSION,
  PRODUCTION_DECISION_SCHEMA_VERSION as PIPELINE_PRODUCTION_READINESS_DECISION_SCHEMA_VERSION,
  OBSERVED_EVIDENCE_ATTESTATION_SCHEMA_VERSION as PIPELINE_OBSERVED_EVIDENCE_ATTESTATION_SCHEMA_VERSION,
};
