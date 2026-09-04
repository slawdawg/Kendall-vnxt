import { isAbsolute, join, relative, resolve, sep } from "node:path";

const ROLES = Object.freeze(["Coordinator", "Developer", "Reviewer", "Delivery", "Memory"]);
const FORBIDDEN_PATHS = Object.freeze([".env", "auth.json", "credentials", "host-credential-store", "browser-profile", "provider-state"]);
const INPUT_KEYS = new Set(["runtimeRoot", "outcomeId", "laneRunId", "developerWorkspace", "reviewerWorkspace", "artifactRoot", "policyDecision", "reviewerUnavailable"]);
const REVIEWER_EXCEPTION_KEYS = Object.freeze(["exceptionId", "reason", "riskClass", "compensatingReviewRef", "recordedBy", "recordedAt", "reviewOrExpiryAt"]);
const MEMORY_CONTEXT_FIELDS = new Set(["sourceRef", "retrievedAt", "confidence", "reviewOrExpiryAt", "revocationState", "accessScope"]);
const POLICY_DECISION_FIELDS = new Set(["policyDecisionId", "outcomeId", "laneRunId", "schemaVersion", "decision", "reasonCode", "evidenceRefs", "nextAction", "observedAt", "idempotencyKey", "createdAt", "metadataOnly", "rawPayloadRetained"]);
const OPAQUE_ID_PATTERN = /^[a-z][a-z0-9]*(?:[-_:][a-z0-9]+)+$/;

function inside(root, candidate) {
  const part = relative(root, candidate);
  return part === "" || (part !== ".." && !part.startsWith(`..${sep}`) && !isAbsolute(part));
}

function denied(reasonCode) {
  return { status: "deniedPolicy", reasonCode, nextAction: "Provide a distinct bounded Developer and Reviewer workspace before requesting review." };
}

function hasOnlyKeys(value, allowed) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every((key) => allowed.has(key));
}

function opaqueId(value) {
  return typeof value === "string" && value.length <= 200 && OPAQUE_ID_PATTERN.test(value) && !/(authorization|api[_ -]?(key|token)|private[_ -]?key|bearer|gh[p|o]_)/i.test(value);
}

function safeMetadataText(value) {
  return typeof value === "string" && value.length <= 500 && !/(authorization|api[_ -]?(key|token)|private[_ -]?key|bearer|gh[p|o]_)/i.test(value);
}

function overlaps(left, right) {
  return inside(left, right) || inside(right, left);
}

function canonicalProfilePath(value) {
  if (typeof value !== "string" || !isAbsolute(value)) return null;
  const canonical = resolve(value);
  return canonical === sep ? null : canonical;
}

function role(name, runtimeRoot, input) {
  const blockedCapabilityIds = ["provider", "billing", "deployment", "credential_store", "github_direct", "cleanup", "arbitrary_shell", "direct_database"];
  const profile = {
    name,
    identity: `hermes-${name.toLowerCase()}`,
    home: join(runtimeRoot, "profiles", name.toLowerCase()),
    sourceMutationAllowed: name === "Developer",
    blockedCapabilityIds,
    networkAllowed: false,
    credentialAccessAllowed: false,
    credentialSourceDeclaration: "adapter_class_or_allowlisted_environment_name_only",
    providerEndpointPolicy: "disabled",
    forbiddenPaths: FORBIDDEN_PATHS,
    cleanupRule: "no_cleanup_or_deletion",
    rollbackRule: "return_to_owning_developer_lane",
    diffCaptureRule: "cited_diff_evidence_only",
    sessionBoundary: "dedicated_profile_home",
    outputPolicy: "metadata_only_redacted",
  };
  if (name === "Developer") return { ...profile, readRoots: [input.developerWorkspace], writeRoots: [input.developerWorkspace], allowedCommandClasses: ["declared_verification", "typed_lifecycle_evidence_handoff"] };
  if (name === "Reviewer") return { ...profile, readRoots: [input.reviewerWorkspace], writeRoots: [], allowedCommandClasses: ["cited_diff_evidence", "typed_review_handoff"], blockedCapabilityIds: [...blockedCapabilityIds, "source_edit"] };
  if (name === "Delivery") return { ...profile, readRoots: [input.artifactRoot], writeRoots: [], allowedCommandClasses: ["typed_delivery_adapter_request"], blockedCapabilityIds: [...blockedCapabilityIds, "source_edit", "source_repair_shell"] };
  if (name === "Memory") return { ...profile, readRoots: [input.artifactRoot], writeRoots: [], contextMode: "cited_context_only", allowedCommandClasses: ["validated_metadata_read"], blockedCapabilityIds: [...blockedCapabilityIds, "source_edit", "authority_policy_mutation", "raw_transcript_ingest"] };
  return { ...profile, readRoots: [input.artifactRoot], writeRoots: [], allowedCommandClasses: ["outcome_evidence_read", "outcome_route_proposal", "dependency_recovery_proposal"], blockedCapabilityIds: [...blockedCapabilityIds, "source_edit"] };
}

function validInput(input) {
  return hasOnlyKeys(input, INPUT_KEYS) && ["runtimeRoot", "developerWorkspace", "reviewerWorkspace", "artifactRoot"].every((key) => typeof input[key] === "string" && input[key]) && opaqueId(input.outcomeId) && opaqueId(input.laneRunId);
}

function validMemoryProposal(proposal) {
  return hasOnlyKeys(proposal, MEMORY_CONTEXT_FIELDS) && [...MEMORY_CONTEXT_FIELDS].every((key) => typeof proposal[key] === "string" && proposal[key]);
}

function validPolicyDecision(decision, input) {
  return hasOnlyKeys(decision, POLICY_DECISION_FIELDS) && POLICY_DECISION_FIELDS.size === Object.keys(decision).length &&
    opaqueId(decision.policyDecisionId) && opaqueId(decision.outcomeId) && opaqueId(decision.laneRunId) && opaqueId(decision.idempotencyKey) &&
    decision.outcomeId === input.outcomeId && decision.laneRunId === input.laneRunId && decision.schemaVersion === "policy_decision.v1" &&
    ["allowed", "deniedPolicy", "deniedExternalImpact", "staleFacts", "retryable", "rework", "blockedTechnical", "completed"].includes(decision.decision) &&
    safeMetadataText(decision.reasonCode) && safeMetadataText(decision.nextAction) && Array.isArray(decision.evidenceRefs) && decision.evidenceRefs.every(opaqueId) &&
    Number.isFinite(Date.parse(decision.observedAt)) && Number.isFinite(Date.parse(decision.createdAt)) && decision.metadataOnly === true && decision.rawPayloadRetained === false;
}

export function evaluateHermesProfileCapability({ role, capabilityId } = {}) {
  if (role === "Delivery" && ["source_edit", "patch_apply", "source_repair_shell", "source_write", "write_outside_metadata_scope"].includes(capabilityId)) {
    return {
      status: "rework",
      reasonCode: "delivery_source_edit_denied",
      nextAction: "Return bounded source repair to the owning Developer lane.",
    };
  }
  if (!ROLES.includes(role) || typeof capabilityId !== "string" || !capabilityId) return { status: "deniedPolicy", reasonCode: "profile_capability_invalid" };
  return { status: "deniedPolicy", reasonCode: "profile_capability_denied" };
}

export function validateMemoryContextProposal(proposal, now = new Date().toISOString()) {
  if (!validMemoryProposal(proposal)) return { status: "deniedPolicy", reasonCode: "memory_context_citation_required" };
  if (![...MEMORY_CONTEXT_FIELDS].every((key) => safeMetadataText(proposal[key]))) return { status: "deniedPolicy", reasonCode: "memory_context_citation_required" };
  const reviewAt = Date.parse(proposal.reviewOrExpiryAt);
  const retrievedAt = Date.parse(proposal.retrievedAt);
  const evaluatedAt = Date.parse(now);
  if (!Number.isFinite(reviewAt) || !Number.isFinite(retrievedAt) || !Number.isFinite(evaluatedAt) || retrievedAt > evaluatedAt || reviewAt <= evaluatedAt) return { status: "deniedPolicy", reasonCode: "memory_context_stale" };
  if (proposal.revocationState !== "active") return { status: "deniedPolicy", reasonCode: "memory_context_revoked" };
  if (!["source_owned_docs", "validated_evidence_summary"].includes(proposal.accessScope) || proposal.sourceRef.includes("..") || !/^(?:docs\/[a-z0-9_./#-]+|evidence:[a-z0-9_:-]+)$/i.test(proposal.sourceRef)) return { status: "deniedPolicy", reasonCode: "memory_context_source_denied" };
  return { status: "allowed", contextMode: "cited_context_only", proposal: { ...proposal } };
}

export function buildHermesProfileManifest(input) {
  if (!validInput(input)) return denied("profile_input_invalid");
  const runtimeRoot = canonicalProfilePath(input.runtimeRoot);
  const developerWorkspace = canonicalProfilePath(input.developerWorkspace);
  const reviewerWorkspace = canonicalProfilePath(input.reviewerWorkspace);
  const artifactRoot = canonicalProfilePath(input.artifactRoot);
  if (!runtimeRoot || !developerWorkspace || !reviewerWorkspace || !artifactRoot) return denied("profile_root_unbounded");
  if (!validPolicyDecision(input.policyDecision, input)) return denied("profile_policy_decision_invalid");
  if (input.policyDecision.decision === "deniedExternalImpact") return { status: "deniedExternalImpact", reasonCode: "external_impact_denied", nextAction: "Use the existing scoped, expiring External-Impact Decision path before any side effect." };
  if (input.policyDecision.decision !== "allowed") return denied("profile_policy_decision_denied");
  if (developerWorkspace === reviewerWorkspace || inside(developerWorkspace, reviewerWorkspace) || inside(reviewerWorkspace, developerWorkspace)) return denied("independent_reviewer_required");
  if ([runtimeRoot, developerWorkspace, reviewerWorkspace, artifactRoot].some((root, index, roots) => roots.some((other, otherIndex) => otherIndex > index && overlaps(root, other)))) return denied("profile_roots_overlap");
  if (input.reviewerUnavailable) {
    if (!hasOnlyKeys(input.reviewerUnavailable, new Set(REVIEWER_EXCEPTION_KEYS)) || !REVIEWER_EXCEPTION_KEYS.every((key) => safeMetadataText(input.reviewerUnavailable[key]))) return denied("reviewer_exception_invalid");
    const recordedAt = Date.parse(input.reviewerUnavailable.recordedAt);
    const reviewOrExpiryAt = Date.parse(input.reviewerUnavailable.reviewOrExpiryAt);
    if (!Number.isFinite(recordedAt) || !Number.isFinite(reviewOrExpiryAt) || reviewOrExpiryAt <= recordedAt) return denied("reviewer_exception_invalid");
    const exceptionRequirement = Object.fromEntries(REVIEWER_EXCEPTION_KEYS.map((key) => [key, input.reviewerUnavailable[key]]));
    return { status: "blockedTechnical", reasonCode: "independent_reviewer_required", exceptionRequirement: { ...exceptionRequirement, outcomeId: input.outcomeId, laneRunId: input.laneRunId, metadataOnly: true, rawPayloadRetained: false }, nextAction: "Record the exception for later Story 4.1 review disposition; it is not approval." };
  }
  const roles = ROLES.map((name) => role(name, runtimeRoot, { ...input, developerWorkspace, reviewerWorkspace, artifactRoot }));
  return {
    status: "allowed",
    reasonCode: "profile_plan_ready",
    manifest: {
      schemaVersion: "hermes_profile_manifest.v1",
      outcomeId: input.outcomeId,
      laneRunId: input.laneRunId,
      artifactRoot,
      roles,
      workspaceScope: {
        outcomeId: input.outcomeId,
        laneRunId: input.laneRunId,
        developer: { readRoots: [developerWorkspace], writeRoots: [developerWorkspace], artifactRoot, forbiddenPaths: FORBIDDEN_PATHS, cleanupRule: "no_cleanup_or_deletion", rollbackRule: "return_to_owning_developer_lane", diffCaptureRule: "cited_diff_evidence_only", networkAllowed: false },
        reviewer: { readRoots: [reviewerWorkspace], writeRoots: [], artifactRoot, forbiddenPaths: FORBIDDEN_PATHS, cleanupRule: "no_cleanup_or_deletion", rollbackRule: "return_to_owning_developer_lane", diffCaptureRule: "cited_diff_evidence_only", networkAllowed: false },
      },
      metadataOnly: true,
      rawPayloadRetained: false,
      applyModeRequired: true,
    },
  };
}
