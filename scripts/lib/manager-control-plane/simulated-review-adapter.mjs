import { createHash } from "node:crypto";

import {
  REVIEW_ROUTE_DECISION_SCHEMA_VERSION,
  SIMULATED_REVIEW_ADAPTER_ID,
  validateDisclosurePacket,
} from "./review-route.mjs";

export const NORMALIZED_FINDING_SCHEMA_VERSION = "normalized-finding/v1";
export const SIMULATED_REVIEW_RESULT_SCHEMA_VERSION = "simulated-review-result/v1";

const INPUT_FIELDS = Object.freeze(["packet", "decision", "now", "routePolicy", "currentImmutableReview", "priorFindings", "consumedDisclosurePacketIds", "fallback"]);
const IDENTITY_FIELDS = Object.freeze(["executionJobId", "exactHead", "digest"]);
const FINDING_FIELDS = Object.freeze(["schemaVersion", "findingId", "rule", "severity", "pathOrRef", "lineOrRange", "summary", "remediation", "reviewedHead", "digest"]);
const SEVERITIES = Object.freeze(["info", "low", "medium", "high"]);
const FALLBACKS = Object.freeze(["none", "timeout"]);
const SAFE_ID = /^[A-Za-z][A-Za-z0-9._:/-]{1,180}$/;
const EXACT_HEAD = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const LINE_OR_RANGE = /^[1-9][0-9]{0,6}(?:-[1-9][0-9]{0,6})?$/;
const FORBIDDEN_TEXT = /(?:\b(?:source|diff|prompt|completion|reasoning|secret|credential|token|vault|customer|production|dump|path|url|payload|transcript)\b|(?:sk(?:[-_](?:proj|ant(?:[-_]api)?))?|ghp|github_pat)[-_][A-Za-z0-9_-]{8,}|BEGIN [A-Z ]+PRIVATE KEY)/i;

/** Evaluate one fixed metadata fixture. This function is deterministic and has no I/O. */
export function evaluateSimulatedReview(input = {}) {
  try {
    return evaluateSimulatedReviewUnsafe(input);
  } catch {
    return blocked("decision_invalid", null, null, "re_evaluate", "Correct bounded simulation metadata and re-evaluate.");
  }
}

function evaluateSimulatedReviewUnsafe(input = {}) {
  if (!isStrictObjectWithAllowedFields(input, INPUT_FIELDS)) return blocked("decision_invalid", null, null, "re_evaluate", "Correct bounded simulation metadata and re-evaluate.");
  const packet = ownDataValue(input, "packet");
  const decision = ownDataValue(input, "decision");
  const now = ownDataValue(input, "now");
  const routePolicy = ownDataValue(input, "routePolicy");
  const currentIdentity = normalizeIdentity(ownDataValue(input, "currentImmutableReview"));
  const fallback = ownDataValue(input, "fallback") === undefined ? "none" : ownDataValue(input, "fallback");
  if (!currentIdentity) return blocked("decision_invalid", null, null, "re_evaluate", "Supply one canonical current review identity and re-evaluate.");
  if (!FALLBACKS.includes(fallback)) return blocked("decision_invalid", currentIdentity.exactHead, currentIdentity.digest, "re_evaluate", "Correct the bounded simulation state and re-evaluate.");
  const packetValidation = validateDisclosurePacket(packet, { now, routePolicy, immutableReview: packetIdentity(packet) });
  if (!packetValidation.ok) return blocked("packet_invalid", currentIdentity.exactHead, currentIdentity.digest, "reissue_disclosure_packet", "Reissue one current bounded disclosure packet.");
  const packetIdentityValue = normalizeIdentity(packetIdentity(packet));
  if (!packetIdentityValue || !sameIdentity(packetIdentityValue, currentIdentity)) return stale(currentIdentity);
  if (!isSimulatedDecision(decision, packet, currentIdentity)) return blocked("decision_invalid", currentIdentity.exactHead, currentIdentity.digest, "re_evaluate", "Prepare one canonical simulated route and re-evaluate.");
  const consumed = ownDataValue(input, "consumedDisclosurePacketIds") === undefined ? [] : ownDataValue(input, "consumedDisclosurePacketIds");
  if (!isSafeIdList(consumed)) return blocked("decision_invalid", currentIdentity.exactHead, currentIdentity.digest, "re_evaluate", "Correct bounded packet-consumption metadata and re-evaluate.");
  if (consumed.includes(ownDataValue(packet, "disclosurePacketId"))) return blocked("packet_already_used", currentIdentity.exactHead, currentIdentity.digest, "reissue_disclosure_packet", "Reissue one current bounded disclosure packet.");
  const policyBlock = currentPolicyBlock(routePolicy);
  if (policyBlock) return fallbackResult(policyBlock, currentIdentity);
  if (fallback !== "none") return fallbackResult(fallback, currentIdentity);
  const prior = ownDataValue(input, "priorFindings") === undefined ? [] : ownDataValue(input, "priorFindings");
  const priorValidation = validatePriorFindings(prior, currentIdentity);
  if (!priorValidation.ok) return priorValidation.stale ? stale(currentIdentity) : blocked("decision_invalid", currentIdentity.exactHead, currentIdentity.digest, "re_evaluate", "Correct bounded prior findings and re-evaluate.");
  const finding = fixtureFinding(currentIdentity);
  const key = findingKey(finding);
  const deduplicated = priorValidation.keys.has(key);
  return {
    schemaVersion: SIMULATED_REVIEW_RESULT_SCHEMA_VERSION,
    adapterId: SIMULATED_REVIEW_ADAPTER_ID,
    state: "completed",
    code: deduplicated ? "simulated_deduplicated" : "simulated_completed",
    findings: deduplicated ? [] : [finding],
    disclosurePacketId: ownDataValue(packet, "disclosurePacketId"),
    decisionId: ownDataValue(decision, "decisionId"),
    reviewedHead: currentIdentity.exactHead,
    digest: currentIdentity.digest,
    deliveryEvidenceEligible: false,
    safeFallback: { action: "retain_report_only", summary: "Persist the single-use consumption claim before any later evidence decision." },
    execution: "none",
  };
}

function fixtureFinding(identity) {
  const rule = "simulated-metadata-boundary/v1";
  const pathOrRef = "metadata:review-route";
  const lineOrRange = "1";
  const key = `${identity.exactHead}:${identity.digest}:${pathOrRef}:${lineOrRange}:${rule}`;
  return {
    schemaVersion: NORMALIZED_FINDING_SCHEMA_VERSION,
    findingId: `normalized-finding:sha256:${createHash("sha256").update(key).digest("hex")}`,
    rule,
    severity: "info",
    pathOrRef,
    lineOrRange,
    summary: "Simulated metadata review is complete without an external adapter action.",
    remediation: "Reissue and re-evaluate after the exact review identity changes.",
    reviewedHead: identity.exactHead,
    digest: identity.digest,
  };
}

function isSimulatedDecision(value, packet, identity) {
  if (!isStrictObject(value, ["schemaVersion", "decisionId", "state", "controllingReason", "safeFallback", "immutableReview", "authorityEvidence", "disclosurePacketId", "metadataOnly", "rawPayloadRetained", "execution"])) return false;
  const routeAllowlist = ownDataValue(packet, "routeAllowlist");
  const adapterAllowlist = ownDataValue(packet, "adapterAllowlist");
  const disclosurePacketId = ownDataValue(packet, "disclosurePacketId");
  const expectedDecisionId = `review-route-decision:sha256:${createHash("sha256").update(`simulated:simulated_prepared:${identity.exactHead}:${identity.digest}:${disclosurePacketId}`).digest("hex")}`;
  const authority = ownDataValue(packet, "authority");
  const authorityEvidence = ownDataValue(value, "authorityEvidence");
  const controllingReason = ownDataValue(value, "controllingReason");
  const safeFallback = ownDataValue(value, "safeFallback");
  return ownDataValue(value, "schemaVersion") === REVIEW_ROUTE_DECISION_SCHEMA_VERSION
    && ownDataValue(value, "decisionId") === expectedDecisionId
    && ownDataValue(value, "state") === "simulated"
    && ownDataValue(value, "execution") === "none"
    && ownDataValue(value, "metadataOnly") === true
    && ownDataValue(value, "rawPayloadRetained") === false
    && ownDataValue(value, "disclosurePacketId") === disclosurePacketId
    && isStrictArray(routeAllowlist) && routeAllowlist.includes("simulated")
    && isStrictArray(adapterAllowlist) && adapterAllowlist.includes(SIMULATED_REVIEW_ADAPTER_ID)
    && isStrictObject(authority, ["issuerId", "authorityRef", "valid"])
    && isStrictObject(authorityEvidence, ["issuerId", "authorityRef", "status"])
    && ownDataValue(authorityEvidence, "issuerId") === ownDataValue(authority, "issuerId")
    && ownDataValue(authorityEvidence, "authorityRef") === ownDataValue(authority, "authorityRef")
    && ownDataValue(authorityEvidence, "status") === "valid"
    && isStrictObject(controllingReason, ["code", "summary"])
    && ownDataValue(controllingReason, "code") === "simulated_prepared"
    && ownDataValue(controllingReason, "summary") === "Simulation preparation is recorded without an adapter action."
    && isStrictObject(safeFallback, ["action", "summary"])
    && ownDataValue(safeFallback, "action") === "retain_report_only"
    && ownDataValue(safeFallback, "summary") === "Retain the report-only decision and use separate governance for any later promotion."
    && sameIdentity(normalizeIdentity(ownDataValue(value, "immutableReview")), identity);
}

function validatePriorFindings(value, identity) {
  if (!isStrictArray(value) || value.length > 32) return { ok: false, stale: false, keys: new Set(), findings: [] };
  const keys = new Set();
  const findings = [];
  const canonical = fixtureFinding(identity);
  for (const finding of value) {
    if (!isStrictObject(finding, FINDING_FIELDS) || !isNormalizedFinding(finding)) return { ok: false, stale: false, keys, findings };
    if (ownDataValue(finding, "reviewedHead") !== identity.exactHead || ownDataValue(finding, "digest") !== identity.digest) return { ok: false, stale: true, keys, findings };
    const key = findingKey(finding);
    if (keys.has(key)) return { ok: false, stale: false, keys, findings };
    if (key === findingKey(canonical) && !sameFinding(finding, canonical)) return { ok: false, stale: false, keys, findings };
    keys.add(key);
    findings.push(finding);
  }
  if (serializedBytes(findings) > 12 * 1024) return { ok: false, stale: false, keys, findings };
  return { ok: true, stale: false, keys, findings };
}

function isNormalizedFinding(value) {
  return ownDataValue(value, "schemaVersion") === NORMALIZED_FINDING_SCHEMA_VERSION
    && safeId(ownDataValue(value, "findingId"))
    && safeId(ownDataValue(value, "rule"))
    && SEVERITIES.includes(ownDataValue(value, "severity"))
    && safeId(ownDataValue(value, "pathOrRef"))
    && typeof ownDataValue(value, "lineOrRange") === "string" && LINE_OR_RANGE.test(ownDataValue(value, "lineOrRange"))
    && safeText(ownDataValue(value, "summary"))
    && safeText(ownDataValue(value, "remediation"))
    && isExactHead(ownDataValue(value, "reviewedHead"))
    && isDigest(ownDataValue(value, "digest"))
    && ownDataValue(value, "findingId") === canonicalFindingId(value);
}

function fallbackResult(fallback, identity) {
  const code = fallback === "timeout" ? "simulation_timeout" : fallback;
  const action = fallback === "policy_vetoed" ? "resolve_policy_block" : "re_evaluate";
  return blocked(code, identity.exactHead, identity.digest, action, "Resolve the bounded block, then re-evaluate without execution.");
}

function currentPolicyBlock(value) {
  if (!isStrictObject(value, ["routeAllowlist", "adapterAllowlist", "toolAllowlist", "policyState", "capabilityState", "resourceState"])) return "policy_vetoed";
  if (!ownDataValue(value, "routeAllowlist").includes("report_only") || !ownDataValue(value, "adapterAllowlist").includes("none")) return "policy_vetoed";
  if (ownDataValue(value, "policyState") !== "ready") return "policy_vetoed";
  if (ownDataValue(value, "capabilityState") !== "supported") return "capability_unsupported";
  if (ownDataValue(value, "resourceState") !== "ready") return "resource_blocked";
  return null;
}

function stale(identity) {
  return {
    schemaVersion: SIMULATED_REVIEW_RESULT_SCHEMA_VERSION,
    adapterId: SIMULATED_REVIEW_ADAPTER_ID,
    state: "stale",
    code: "immutable_identity_stale",
    findings: [],
    disclosurePacketId: null,
    decisionId: null,
    reviewedHead: identity.exactHead,
    digest: identity.digest,
    deliveryEvidenceEligible: false,
    safeFallback: { action: "reissue_disclosure_packet", summary: "Reissue and re-evaluate for the current exact review identity." },
    execution: "none",
  };
}

function blocked(code, reviewedHead, digest, action, summary) {
  return {
    schemaVersion: SIMULATED_REVIEW_RESULT_SCHEMA_VERSION,
    adapterId: SIMULATED_REVIEW_ADAPTER_ID,
    state: "blocked",
    code,
    findings: [],
    disclosurePacketId: null,
    decisionId: null,
    reviewedHead,
    digest,
    deliveryEvidenceEligible: false,
    safeFallback: { action, summary },
    execution: "none",
  };
}

function sameFinding(left, right) {
  return FINDING_FIELDS.every((field) => ownDataValue(left, field) === ownDataValue(right, field));
}

function canonicalFindingId(finding) {
  return `normalized-finding:sha256:${createHash("sha256").update(findingKey(finding)).digest("hex")}`;
}

function serializedBytes(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return Infinity;
  }
}

function isSafeIdList(value) {
  return isStrictArray(value) && value.length <= 256 && value.every((entry) => safeId(entry)) && new Set(value).size === value.length;
}

function packetIdentity(packet) {
  return isStrictObject(packet, ["schemaVersion", "disclosurePacketId", "immutableReview", "routeAllowlist", "adapterAllowlist", "toolAllowlist", "authority", "issuance", "scope", "metadataOnly", "rawPayloadRetained"])
    ? ownDataValue(packet, "immutableReview")
    : null;
}

function normalizeIdentity(value) {
  if (!isStrictObject(value, IDENTITY_FIELDS)) return null;
  const executionJobId = ownDataValue(value, "executionJobId");
  const exactHead = ownDataValue(value, "exactHead");
  const digest = ownDataValue(value, "digest");
  return safeId(executionJobId) && isExactHead(exactHead) && isDigest(digest) ? { executionJobId, exactHead, digest } : null;
}

function sameIdentity(left, right) {
  return Boolean(left && right && left.executionJobId === right.executionJobId && left.exactHead === right.exactHead && left.digest === right.digest);
}

function findingKey(finding) {
  return `${ownDataValue(finding, "reviewedHead")}:${ownDataValue(finding, "digest")}:${ownDataValue(finding, "pathOrRef")}:${ownDataValue(finding, "lineOrRange")}:${ownDataValue(finding, "rule")}`;
}

function isStrictObject(value, fields) {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length > 0) return false;
    const names = Object.getOwnPropertyNames(value);
    return names.length === fields.length && names.every((name) => fields.includes(name) && Object.prototype.propertyIsEnumerable.call(value, name) && Object.hasOwn(Object.getOwnPropertyDescriptor(value, name), "value"));
  } catch {
    return false;
  }
}

function isStrictObjectWithAllowedFields(value, fields) {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length > 0) return false;
    return Object.getOwnPropertyNames(value).every((name) => fields.includes(name) && Object.prototype.propertyIsEnumerable.call(value, name) && Object.hasOwn(Object.getOwnPropertyDescriptor(value, name), "value"));
  } catch {
    return false;
  }
}

function isStrictArray(value) {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length > 0) return false;
    const names = Object.getOwnPropertyNames(value);
    return names.length === value.length + 1 && names.includes("length") && value.every((_, index) => Object.hasOwn(Object.getOwnPropertyDescriptor(value, String(index)), "value"));
  } catch {
    return false;
  }
}

function ownDataValue(value, key) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
}

function safeId(value) {
  return typeof value === "string" && SAFE_ID.test(value) && !FORBIDDEN_TEXT.test(value);
}

function safeText(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 280 && !FORBIDDEN_TEXT.test(value);
}

function isExactHead(value) {
  return typeof value === "string" && EXACT_HEAD.test(value);
}

function isDigest(value) {
  return typeof value === "string" && DIGEST.test(value);
}
