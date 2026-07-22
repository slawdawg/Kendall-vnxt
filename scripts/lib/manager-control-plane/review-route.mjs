import { createHash } from "node:crypto";

export const REVIEW_ROUTE_DECISION_SCHEMA_VERSION = "review-route-decision/v1";
export const DISCLOSURE_PACKET_SCHEMA_VERSION = "disclosure-packet/v1";
export const DISCLOSURE_PACKET_MAX_UTF8_BYTES = 16 * 1024;

export function disclosurePacketUtf8Bytes(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return null;
  }
}

export function isDisclosurePacketSizeAllowed(value) {
  const bytes = disclosurePacketUtf8Bytes(value);
  return bytes !== null && bytes <= DISCLOSURE_PACKET_MAX_UTF8_BYTES;
}

const PACKET_FIELDS = Object.freeze([
  "schemaVersion", "disclosurePacketId", "immutableReview", "routeAllowlist", "adapterAllowlist",
  "toolAllowlist", "authority", "issuance", "scope", "metadataOnly", "rawPayloadRetained",
]);
const IDENTITY_FIELDS = Object.freeze(["executionJobId", "exactHead", "digest"]);
const AUTHORITY_FIELDS = Object.freeze(["issuerId", "authorityRef", "valid"]);
const ISSUANCE_FIELDS = Object.freeze(["issuedAt", "expiresAt", "revocationState", "cancellationState", "singleUse"]);
const SCOPE_FIELDS = Object.freeze(["dataClass", "evidenceRefs"]);
const DISCLOSURE_INPUT_FIELDS = Object.freeze(["disclosurePacketId", "issuedAt", "expiresAt", "routeAllowlist", "adapterAllowlist", "toolAllowlist", "evidenceRefs", "revocationState", "cancellationState", "singleUse"]);
const DISCLOSURE_INPUT_REQUIRED_FIELDS = DISCLOSURE_INPUT_FIELDS;
const SAFE_ID = /^[A-Za-z][A-Za-z0-9._:/-]{1,180}$/;
const SAFE_EVIDENCE_REF = /^evidence:sha256:[0-9a-f]{64}$/;
const EXACT_HEAD = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const FORBIDDEN_NAME = /(?:source|diff|prompt|completion|reasoning|secret|credential|token|vault|customer|production|dump|path|url|payload|transcript)/i;
const FORBIDDEN_TEXT = /(?:\b(?:source|diff|prompt|completion|reasoning|secret|credential|token|vault|customer|production|dump|path|url|payload|transcript)\b|(?:sk(?:[-_](?:proj|ant(?:[-_]api)?))?|ghp|github_pat)[-_][A-Za-z0-9_-]{8,}|BEGIN [A-Z ]+PRIVATE KEY)/i;

export function buildDisclosurePacket(input = {}) {
  const immutableReview = normalizeImmutableReview(input.immutableReview);
  const authority = input.authority || {};
  const disclosure = input.disclosure || {};
  return {
    schemaVersion: DISCLOSURE_PACKET_SCHEMA_VERSION,
    disclosurePacketId: String(disclosure.disclosurePacketId || ""),
    immutableReview,
    routeAllowlist: stableList(disclosure.routeAllowlist),
    adapterAllowlist: stableList(disclosure.adapterAllowlist),
    toolAllowlist: stableList(disclosure.toolAllowlist),
    authority: {
      issuerId: String(authority.issuerId || ""),
      authorityRef: String(authority.authorityRef || ""),
      valid: authority.valid === true,
    },
    issuance: {
      issuedAt: String(disclosure.issuedAt || ""),
      expiresAt: String(disclosure.expiresAt || ""),
      revocationState: disclosure.revocationState || "active",
      cancellationState: disclosure.cancellationState || "active",
      singleUse: disclosure.singleUse !== false,
    },
    scope: {
      dataClass: "metadata_only",
      evidenceRefs: stableList(disclosure.evidenceRefs),
    },
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

export function validateDisclosurePacket(packet, options = {}) {
  const reasons = [];
  if (!isPlainObject(packet)) return invalid("packet_malformed");
  inspectObjectFields(packet, PACKET_FIELDS, reasons);
  if (packet.schemaVersion !== DISCLOSURE_PACKET_SCHEMA_VERSION) reasons.push("schema_version_invalid");
  if (!safeId(packet.disclosurePacketId)) reasons.push("packet_id_invalid");
  validateImmutableReview(packet.immutableReview, reasons, options.immutableReview);
  validateStringList(packet.routeAllowlist, "route", reasons, ["report_only", "simulated"]);
  validateStringList(packet.adapterAllowlist, "adapter", reasons, ["none"]);
  validateStringList(packet.toolAllowlist, "tool", reasons, ["none"]);
  validateSubset(packet.routeAllowlist, options.routePolicy?.routeAllowlist, "route", reasons);
  validateSubset(packet.adapterAllowlist, options.routePolicy?.adapterAllowlist, "adapter", reasons);
  validateSubset(packet.toolAllowlist, options.routePolicy?.toolAllowlist, "tool", reasons);
  validateAuthority(packet.authority, reasons);
  validateIssuance(packet.issuance, options.now, reasons);
  validateScope(packet.scope, reasons);
  if (packet.metadataOnly !== true || packet.rawPayloadRetained !== false) reasons.push("metadata_boundary_invalid");
  const serializedBytes = disclosurePacketUtf8Bytes(packet);
  if (serializedBytes === null) reasons.push("packet_malformed");
  else if (serializedBytes > DISCLOSURE_PACKET_MAX_UTF8_BYTES) reasons.push("packet_oversize");
  return reasons.length === 0 ? { ok: true, reasons: [] } : invalid(reasons);
}

export function evaluateReviewRoute(input = {}) {
  const fallbackAuthority = { issuerId: "authority-invalid", authorityRef: "authority-invalid", valid: false };
  if (!isPlainObject(input)) return routeResult({
    state: "blocked", code: "packet_malformed", summary: "Route evaluation input must be a plain metadata object.",
    fallback: "re_evaluate", fallbackSummary: "Correct bounded metadata and re-evaluate without execution.", immutableReview: null, authority: fallbackAuthority, packet: null,
  });
  let now;
  let inputIdentity;
  let inputAuthority;
  let immutableReview;
  let authority;
  try {
    now = canonicalTime(input.now);
    inputIdentity = validateInputObject(input.immutableReview, IDENTITY_FIELDS);
    inputAuthority = validateInputObject(input.authority, AUTHORITY_FIELDS);
    immutableReview = inputIdentity.ok ? tryNormalizeImmutableReview(input.immutableReview) : null;
    authority = normalizeAuthority(input.authority);
  } catch {
    return routeResult({
      state: "blocked", code: "packet_malformed", summary: "Route evaluation input cannot be read safely.",
      fallback: "re_evaluate", fallbackSummary: "Correct bounded metadata and re-evaluate without execution.", immutableReview: null, authority: fallbackAuthority, packet: null,
    });
  }
  if (!now) return routeResult({
    state: "blocked", code: "now_invalid", summary: "Route evaluation requires one canonical UTC evaluation time.",
    fallback: "re_evaluate", fallbackSummary: "Supply a canonical UTC time and re-evaluate without execution.", immutableReview, authority, packet: null,
  });
  if (!inputIdentity.ok) return routeResult({
    state: "blocked", code: inputIdentity.reasons[0], summary: "Immutable review input is malformed or contains forbidden data.",
    fallback: "re_evaluate", fallbackSummary: "Correct bounded immutable review metadata and re-evaluate without execution.", immutableReview: null, authority, packet: null,
  });
  if (!immutableReview) return routeResult({
    state: "blocked", code: "immutable_identity_invalid", summary: "The exact review identity is missing, stale, or malformed.",
    fallback: "re_evaluate", fallbackSummary: "Re-evaluate from one current exact head and digest.", immutableReview: null, authority, packet: null,
  });
  if (!inputAuthority.ok) return routeResult({
    state: "blocked", code: inputAuthority.reasons[0], summary: "Authority input is malformed or contains forbidden data.",
    fallback: "re_evaluate", fallbackSummary: "Correct bounded authority metadata and re-evaluate without execution.", immutableReview, authority, packet: null,
  });
  const inputValidation = validateDisclosureInput(input.disclosure);
  if (!inputValidation.ok) return routeResult({
    state: "blocked", code: inputValidation.reasons[0], summary: "Disclosure preparation input is malformed or contains forbidden data.",
    fallback: "re_evaluate", fallbackSummary: "Correct the bounded metadata and re-evaluate without execution.", immutableReview, authority, packet: null,
  });
  let packet;
  try {
    packet = buildDisclosurePacket({ ...input, immutableReview });
  } catch {
    return routeResult({
      state: "blocked", code: "packet_malformed", summary: "Disclosure preparation input cannot be normalized safely.",
      fallback: "re_evaluate", fallbackSummary: "Correct bounded metadata and re-evaluate without execution.", immutableReview, authority, packet: null,
    });
  }
  const validation = validateDisclosurePacket(packet, { now, routePolicy: input.routePolicy, immutableReview });
  if (!validation.ok) return routeResult({
    state: "blocked", code: validation.reasons[0], summary: "The disclosure packet failed closed before any route could be prepared.",
    fallback: fallbackForPacketReason(validation.reasons[0]), fallbackSummary: "Correct the bounded metadata and reissue or re-evaluate the packet.", immutableReview, authority, packet: null,
  });
  if (Array.isArray(input.consumedDisclosurePacketIds) && input.consumedDisclosurePacketIds.includes(packet.disclosurePacketId)) return routeResult({
    state: "blocked", code: "packet_already_used", summary: "The single-use disclosure packet is already consumed.",
    fallback: "reissue_disclosure_packet", fallbackSummary: "Issue a fresh metadata-only disclosure packet.", immutableReview, authority, packet: null,
  });
  const policy = normalizeRoutePolicy(input.routePolicy);
  if (!policy) return routeResult({
    state: "blocked", code: "route_policy_invalid", summary: "Route policy facts are missing or malformed.",
    fallback: "re_evaluate", fallbackSummary: "Refresh bounded readiness and policy facts.", immutableReview, authority, packet: null,
  });
  for (const [field, code] of [["policyState", "policy_vetoed"], ["capabilityState", "capability_unsupported"], ["resourceState", "resource_blocked"]]) {
    if (!policy[field]) return routeResult({
      state: "blocked", code, summary: "Current bounded route facts do not permit a prepared route.",
      fallback: field === "policyState" ? "resolve_policy_block" : "re_evaluate", fallbackSummary: "Resolve the named block, then re-evaluate without execution.", immutableReview, authority, packet: null,
    });
  }
  const state = input.requestedState === "simulated" ? "simulated" : "report_only";
  if (!packet.routeAllowlist.includes(state)) return routeResult({
    state: "blocked", code: "requested_route_not_allowed", summary: "The requested non-executing state is not allowlisted by the packet.",
    fallback: "reissue_disclosure_packet", fallbackSummary: "Reissue a packet that explicitly allowlists the requested non-executing state.", immutableReview, authority, packet: null,
  });
  return routeResult({
    state, code: state === "simulated" ? "simulated_prepared" : "report_only_prepared",
    summary: state === "simulated" ? "Simulation preparation is recorded without an adapter action." : "A metadata-only route is prepared without execution.",
    fallback: "retain_report_only", fallbackSummary: "Retain the report-only decision and use separate governance for any later promotion.", immutableReview, authority, packet,
  });
}

function routeResult({ state, code, summary, fallback, fallbackSummary, immutableReview, authority, packet }) {
  const disclosurePacketId = packet?.disclosurePacketId || null;
  const identity = immutableReview ? `${immutableReview.exactHead}:${immutableReview.digest}` : "invalid";
  return {
    ok: state !== "blocked",
    decision: {
      schemaVersion: REVIEW_ROUTE_DECISION_SCHEMA_VERSION,
      decisionId: `review-route-decision:sha256:${createHash("sha256").update(`${state}:${code}:${identity}:${disclosurePacketId || "none"}`).digest("hex")}`,
      state,
      controllingReason: { code, summary },
      safeFallback: { action: fallback, summary: fallbackSummary },
      immutableReview,
      authorityEvidence: { issuerId: authority.issuerId, authorityRef: authority.authorityRef, status: authority.valid ? "valid" : "invalid" },
      disclosurePacketId,
      metadataOnly: true,
      rawPayloadRetained: false,
      execution: "none",
    },
    packet,
  };
}

function validateImmutableReview(identity, reasons, expected = null) {
  if (!isPlainObject(identity)) return reasons.push("immutable_identity_invalid");
  inspectObjectFields(identity, IDENTITY_FIELDS, reasons);
  if (!safeId(identity.executionJobId) || !isExactHead(identity.exactHead) || !isDigest(identity.digest)) reasons.push("immutable_identity_invalid");
  if (expected && (identity.exactHead !== expected.exactHead || identity.digest !== expected.digest || (expected.executionJobId !== undefined && identity.executionJobId !== expected.executionJobId))) reasons.push("immutable_identity_mismatch");
}

function validateAuthority(authority, reasons) {
  if (!isPlainObject(authority)) return reasons.push("authority_invalid");
  inspectObjectFields(authority, AUTHORITY_FIELDS, reasons);
  if (!safeId(authority.issuerId) || !safeId(authority.authorityRef) || authority.valid !== true) reasons.push("authority_invalid");
}

function validateIssuance(issuance, nowValue, reasons) {
  if (!isPlainObject(issuance)) return reasons.push("issuance_invalid");
  inspectObjectFields(issuance, ISSUANCE_FIELDS, reasons);
  const now = canonicalTime(nowValue);
  const issuedAt = canonicalTime(issuance.issuedAt);
  const expiresAt = canonicalTime(issuance.expiresAt);
  if (!now || !issuedAt || !expiresAt || Date.parse(expiresAt) <= Date.parse(issuedAt)) reasons.push("issuance_invalid");
  else if (Date.parse(issuedAt) > Date.parse(now)) reasons.push("packet_future");
  else if (Date.parse(expiresAt) <= Date.parse(now)) reasons.push("packet_expired");
  if (issuance.revocationState === "revoked") reasons.push("packet_revoked");
  else if (issuance.revocationState !== "active") reasons.push("issuance_invalid");
  if (issuance.cancellationState === "cancelled") reasons.push("packet_cancelled");
  else if (issuance.cancellationState !== "active") reasons.push("issuance_invalid");
  if (issuance.singleUse !== true) reasons.push("single_use_required");
}

function validateScope(scope, reasons) {
  if (!isPlainObject(scope)) return reasons.push("scope_invalid");
  inspectObjectFields(scope, SCOPE_FIELDS, reasons);
  if (scope.dataClass !== "metadata_only") reasons.push("data_class_invalid");
  validateEvidenceRefs(scope.evidenceRefs, reasons);
}

function validateStringList(values, label, reasons, fixedValues) {
  if (!Array.isArray(values) || values.length === 0 || values.length > 32 || values.some((value) => !safeId(value) || !fixedValues.includes(value)) || new Set(values).size !== values.length) reasons.push(`${label}_allowlist_invalid`);
}

function validateEvidenceRefs(values, reasons) {
  if (!Array.isArray(values) || values.length === 0 || values.length > 32 || values.some((value) => typeof value !== "string" || !SAFE_EVIDENCE_REF.test(value)) || new Set(values).size !== values.length) reasons.push("evidence_ref_allowlist_invalid");
}

function validateSubset(values, allowed, label, reasons) {
  if (!Array.isArray(allowed) || !Array.isArray(values) || values.some((value) => !allowed.includes(value))) reasons.push(`${label}_not_allowed`);
}

function inspectObjectFields(value, fields, reasons) {
  for (const key of Object.keys(value)) {
    if (!fields.includes(key)) reasons.push(FORBIDDEN_NAME.test(key) ? "forbidden_field" : "unknown_field");
  }
  for (const [key, nested] of Object.entries(value)) {
    if (fields.includes(key) && containsForbiddenText(nested)) reasons.push("forbidden_content");
  }
}

function containsForbiddenText(value, seen = new WeakSet()) {
  if (typeof value === "string") return FORBIDDEN_TEXT.test(value);
  if (Array.isArray(value)) {
    if (seen.has(value)) return true;
    seen.add(value);
    return value.some((entry) => containsForbiddenText(entry, seen));
  }
  if (isPlainObject(value)) {
    if (seen.has(value)) return true;
    seen.add(value);
    return Object.entries(value).some(([key, nested]) => {
    if (key === "rawPayloadRetained") return false;
    return FORBIDDEN_NAME.test(key) || containsForbiddenText(nested, seen);
    });
  }
  return false;
}

function normalizeRoutePolicy(value) {
  if (!isPlainObject(value)) return null;
  const routeValid = Array.isArray(value.routeAllowlist) && value.routeAllowlist.includes("report_only");
  const adapterValid = Array.isArray(value.adapterAllowlist) && value.adapterAllowlist.includes("none");
  const toolValid = Array.isArray(value.toolAllowlist) && value.toolAllowlist.includes("none");
  if (!routeValid || !adapterValid || !toolValid) return null;
  return {
    policyState: value.policyState === "ready",
    capabilityState: value.capabilityState === "supported",
    resourceState: value.resourceState === "ready",
  };
}

function validateDisclosureInput(value) {
  try {
    if (!isPlainObject(value)) return invalid("packet_malformed");
    const reasons = [];
    inspectObjectFields(value, DISCLOSURE_INPUT_FIELDS, reasons);
    if (DISCLOSURE_INPUT_REQUIRED_FIELDS.some((field) => !Object.hasOwn(value, field))) reasons.push("packet_malformed");
    for (const field of ["disclosurePacketId", "issuedAt", "expiresAt", "revocationState", "cancellationState"]) {
      if (typeof value[field] !== "string") reasons.push("packet_malformed");
    }
    for (const field of ["routeAllowlist", "adapterAllowlist", "toolAllowlist", "evidenceRefs"]) {
      if (!Array.isArray(value[field]) || value[field].some((entry) => typeof entry !== "string")) reasons.push("packet_malformed");
    }
    if (value.singleUse !== true) reasons.push("single_use_required");
    return reasons.length === 0 ? { ok: true, reasons: [] } : invalid(reasons);
  } catch {
    return invalid("packet_malformed");
  }
}

function validateInputObject(value, fields) {
  try {
    if (!isPlainObject(value)) return invalid("packet_malformed");
    const reasons = [];
    inspectObjectFields(value, fields, reasons);
    return reasons.length === 0 ? { ok: true, reasons: [] } : invalid(reasons);
  } catch {
    return invalid("packet_malformed");
  }
}

function normalizeImmutableReview(value) {
  return {
    executionJobId: String(value?.executionJobId || ""),
    exactHead: String(value?.exactHead || "").toLowerCase(),
    digest: String(value?.digest || "").toLowerCase(),
  };
}

function tryNormalizeImmutableReview(value) {
  const normalized = normalizeImmutableReview(value);
  return safeId(normalized.executionJobId) && isExactHead(normalized.exactHead) && isDigest(normalized.digest) ? normalized : null;
}

function normalizeAuthority(value) {
  return {
    issuerId: safeId(value?.issuerId) ? value.issuerId : "authority-invalid",
    authorityRef: safeId(value?.authorityRef) ? value.authorityRef : "authority-invalid",
    valid: value?.valid === true,
  };
}

function fallbackForPacketReason(reason) {
  return ["packet_expired", "packet_revoked", "packet_cancelled", "packet_already_used"].includes(reason) ? "reissue_disclosure_packet" : "re_evaluate";
}

function stableList(value) {
  return Array.isArray(value) ? [...new Set(value.map((entry) => String(entry)))].sort() : [];
}

function canonicalTime(value) {
  return typeof value === "string" && /\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value ? value : null;
}

function safeId(value) {
  return typeof value === "string" && SAFE_ID.test(value) && !FORBIDDEN_TEXT.test(value);
}

function isExactHead(value) {
  return typeof value === "string" && EXACT_HEAD.test(value);
}

function isDigest(value) {
  return typeof value === "string" && DIGEST.test(value);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function invalid(reasons) {
  return { ok: false, reasons: [...new Set(Array.isArray(reasons) ? reasons : [reasons])] };
}
