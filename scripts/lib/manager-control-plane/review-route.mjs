import { createHash } from "node:crypto";

export const REVIEW_ROUTE_DECISION_SCHEMA_VERSION = "review-route-decision/v2";
export const DISCLOSURE_PACKET_SCHEMA_VERSION = "disclosure-packet/v1";
export const SIMULATED_REVIEW_ADAPTER_ID = "simulated-review-fixture/v1";
export const DISCLOSURE_PACKET_MAX_UTF8_BYTES = 16 * 1024;

export function disclosurePacketUtf8Bytes(value) {
  try {
    const normalized = normalizeJsonForSerialization(value);
    return normalized.ok ? Buffer.byteLength(JSON.stringify(normalized.value), "utf8") : null;
  } catch {
    return null;
  }
}

/** Return a hook-free, canonical digest of strictly serializable packet metadata. */
export function disclosurePacketCanonicalDigest(value) {
  try {
    const normalized = normalizeJsonForSerialization(value);
    return normalized.ok ? `sha256:${createHash("sha256").update(JSON.stringify(normalized.value)).digest("hex")}` : null;
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
const REVIEW_ROUTE_INPUT_FIELDS = Object.freeze(["now", "immutableReview", "authority", "routePolicy", "disclosure", "consumedDisclosurePacketIds", "requestedState"]);
const ROUTE_POLICY_FIELDS = Object.freeze(["routeAllowlist", "adapterAllowlist", "toolAllowlist", "policyState", "capabilityState", "resourceState"]);
const ROUTE_ALLOWLIST_VALUES = Object.freeze(["report_only", "simulated"]);
const ADAPTER_ALLOWLIST_VALUES = Object.freeze(["none", SIMULATED_REVIEW_ADAPTER_ID]);
const NONE_ALLOWLIST_VALUES = Object.freeze(["none"]);
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
  try {
    const reasons = [];
    if (!isPlainObject(packet)) return invalid("packet_malformed");
    inspectObjectFields(packet, PACKET_FIELDS, reasons);
    if (packet.schemaVersion !== DISCLOSURE_PACKET_SCHEMA_VERSION) reasons.push("schema_version_invalid");
    if (!safeId(packet.disclosurePacketId)) reasons.push("packet_id_invalid");
    validateImmutableReview(packet.immutableReview, reasons, options.immutableReview);
    validateStringList(packet.routeAllowlist, "route", reasons, ROUTE_ALLOWLIST_VALUES);
    validateStringList(packet.adapterAllowlist, "adapter", reasons, ADAPTER_ALLOWLIST_VALUES);
    validateStringList(packet.toolAllowlist, "tool", reasons, NONE_ALLOWLIST_VALUES);
    validateSubset(packet.routeAllowlist, options.routePolicy?.routeAllowlist, "route", reasons);
    validateSubset(packet.adapterAllowlist, options.routePolicy?.adapterAllowlist, "adapter", reasons);
    validateSubset(packet.toolAllowlist, options.routePolicy?.toolAllowlist, "tool", reasons);
    validateAuthority(packet.authority, reasons);
    validateIssuance(packet.issuance, options.now, reasons);
    validateScope(packet.scope, reasons);
    validateRouteAdapterPair(packet.routeAllowlist, packet.adapterAllowlist, reasons);
    if (packet.metadataOnly !== true || packet.rawPayloadRetained !== false) reasons.push("metadata_boundary_invalid");
    const serializedBytes = disclosurePacketUtf8Bytes(packet);
    if (serializedBytes === null) reasons.push("packet_malformed");
    else if (serializedBytes > DISCLOSURE_PACKET_MAX_UTF8_BYTES) reasons.push("packet_oversize");
    return reasons.length === 0 ? { ok: true, reasons: [] } : invalid(reasons);
  } catch {
    return invalid("packet_malformed");
  }
}

export function evaluateReviewRoute(input = {}) {
  const fallbackAuthority = { issuerId: "authority-invalid", authorityRef: "authority-invalid", valid: false };
  if (!isPlainObject(input)) return routeResult({
    state: "blocked", code: "packet_malformed", summary: "Route evaluation input must be a plain metadata object.",
    fallback: "re_evaluate", fallbackSummary: "Correct bounded metadata and re-evaluate without execution.", immutableReview: null, authority: fallbackAuthority, packet: null,
  });
  const inputEnvelope = validateInputEnvelope(input);
  if (!inputEnvelope.ok) return routeResult({
    state: "blocked", code: inputEnvelope.reasons[0], summary: "Route evaluation input is malformed or contains forbidden data.",
    fallback: "re_evaluate", fallbackSummary: "Correct bounded metadata and re-evaluate without execution.", immutableReview: null, authority: fallbackAuthority, packet: null,
  });
  let now;
  let inputIdentity;
  let inputAuthority;
  let immutableReview;
  let authority;
  let requestedState;
  let consumedDisclosurePacketIds;
  try {
    now = canonicalTime(input.now);
    inputIdentity = validateInputObject(input.immutableReview, IDENTITY_FIELDS);
    inputAuthority = validateInputObject(input.authority, AUTHORITY_FIELDS);
    immutableReview = inputIdentity.ok ? tryNormalizeImmutableReview(input.immutableReview) : null;
    authority = normalizeAuthority(input.authority);
    requestedState = input.requestedState === undefined ? "report_only" : input.requestedState;
    consumedDisclosurePacketIds = validateConsumedDisclosurePacketIds(input.consumedDisclosurePacketIds);
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
  if (!consumedDisclosurePacketIds.ok) return routeResult({
    state: "blocked", code: "consumed_packet_ids_invalid", summary: "Consumed disclosure packet IDs are malformed.",
    fallback: "re_evaluate", fallbackSummary: "Correct bounded consumption metadata and re-evaluate without execution.", immutableReview, authority, packet: null,
  });
  if (!ROUTE_ALLOWLIST_VALUES.includes(requestedState)) return routeResult({
    state: "blocked", code: "requested_state_invalid", summary: "Requested route state is not a supported non-executing state.",
    fallback: "re_evaluate", fallbackSummary: "Request report-only or simulated preparation and re-evaluate without execution.", immutableReview, authority, packet: null,
  });
  const policy = normalizeRoutePolicy(input.routePolicy);
  if (!policy) return routeResult({
    state: "blocked", code: "route_policy_invalid", summary: "Route policy facts are missing or malformed.",
    fallback: "re_evaluate", fallbackSummary: "Refresh bounded readiness and policy facts.", immutableReview, authority, packet: null,
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
  const validation = validateDisclosurePacket(packet, { now, routePolicy: policy, immutableReview });
  if (!validation.ok) return routeResult({
    state: "blocked", code: validation.reasons[0], summary: "The disclosure packet failed closed before any route could be prepared.",
    fallback: fallbackForPacketReason(validation.reasons[0]), fallbackSummary: "Correct the bounded metadata and reissue or re-evaluate the packet.", immutableReview, authority, packet: null,
  });
  if (consumedDisclosurePacketIds.values.includes(packet.disclosurePacketId)) return routeResult({
    state: "blocked", code: "packet_already_used", summary: "The single-use disclosure packet is already consumed.",
    fallback: "reissue_disclosure_packet", fallbackSummary: "Issue a fresh metadata-only disclosure packet.", immutableReview, authority, packet: null,
  });
  for (const [field, code] of [["policyState", "policy_vetoed"], ["capabilityState", "capability_unsupported"], ["resourceState", "resource_blocked"]]) {
    if (!policy[field]) return routeResult({
      state: "blocked", code, summary: "Current bounded route facts do not permit a prepared route.",
      fallback: field === "policyState" ? "resolve_policy_block" : "re_evaluate", fallbackSummary: "Resolve the named block, then re-evaluate without execution.", immutableReview, authority, packet: null,
    });
  }
  const state = requestedState;
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
  const disclosurePacketDigest = packet ? disclosurePacketCanonicalDigest(packet) : null;
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
      disclosurePacketDigest,
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
  if (!isAllowedStringList(values, fixedValues)) reasons.push(`${label}_allowlist_invalid`);
}

function validateEvidenceRefs(values, reasons) {
  if (!isAllowedEvidenceRefs(values)) reasons.push("evidence_ref_allowlist_invalid");
}

function validateSubset(values, allowed, label, reasons) {
  const fixedValues = label === "route" ? ROUTE_ALLOWLIST_VALUES : label === "adapter" ? ADAPTER_ALLOWLIST_VALUES : NONE_ALLOWLIST_VALUES;
  const copiedValues = copySafePlainArray(values);
  const copiedAllowed = copySafePlainArray(allowed);
  if (!copiedValues || !copiedAllowed || !isAllowedStringList(copiedAllowed, fixedValues) || copiedValues.some((value) => !copiedAllowed.includes(value))) reasons.push(`${label}_not_allowed`);
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
    const values = copySafePlainArray(value);
    if (!values) return false;
    if (seen.has(value)) return true;
    seen.add(value);
    return values.some((entry) => containsForbiddenText(entry, seen));
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
  try {
    if (!isPlainObject(value)) return null;
    const reasons = [];
    inspectObjectKeys(value, ROUTE_POLICY_FIELDS, reasons);
    const routeAllowlist = copySafePlainArray(ownDataValue(value, "routeAllowlist"));
    const adapterAllowlist = copySafePlainArray(ownDataValue(value, "adapterAllowlist"));
    const toolAllowlist = copySafePlainArray(ownDataValue(value, "toolAllowlist"));
    const policyState = ownDataValue(value, "policyState");
    const capabilityState = ownDataValue(value, "capabilityState");
    const resourceState = ownDataValue(value, "resourceState");
    const routeValid = isAllowedStringList(routeAllowlist, ROUTE_ALLOWLIST_VALUES) && routeAllowlist.includes("report_only");
    const adapterValid = isAllowedStringList(adapterAllowlist, ADAPTER_ALLOWLIST_VALUES) && adapterAllowlist.includes("none");
    const toolValid = isAllowedStringList(toolAllowlist, NONE_ALLOWLIST_VALUES) && toolAllowlist.includes("none");
    if (reasons.length > 0 || !routeValid || !adapterValid || !toolValid) return null;
    return {
      routeAllowlist,
      adapterAllowlist,
      toolAllowlist,
      policyState: policyState === "ready",
      capabilityState: capabilityState === "supported",
      resourceState: resourceState === "ready",
    };
  } catch {
    return null;
  }
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
    if (!isAllowedStringList(value.routeAllowlist, ROUTE_ALLOWLIST_VALUES)) reasons.push("packet_malformed");
    if (!isAllowedStringList(value.adapterAllowlist, ADAPTER_ALLOWLIST_VALUES)) reasons.push("packet_malformed");
    if (!isAllowedStringList(value.toolAllowlist, NONE_ALLOWLIST_VALUES)) reasons.push("packet_malformed");
    if (!isAllowedEvidenceRefs(value.evidenceRefs)) reasons.push("packet_malformed");
    if (value.singleUse !== true) reasons.push("single_use_required");
    validateRouteAdapterPair(value.routeAllowlist, value.adapterAllowlist, reasons);
    return reasons.length === 0 ? { ok: true, reasons: [] } : invalid(reasons);
  } catch {
    return invalid("packet_malformed");
  }
}

function validateRouteAdapterPair(routeAllowlist, adapterAllowlist, reasons) {
  const routes = copySafePlainArray(routeAllowlist);
  const adapters = copySafePlainArray(adapterAllowlist);
  if (!routes || !adapters) {
    reasons.push("route_adapter_pair_invalid");
    return;
  }
  if (routes.includes("report_only") && !adapters.includes("none")) reasons.push("route_adapter_pair_invalid");
  if (routes.includes("simulated") && !adapters.includes(SIMULATED_REVIEW_ADAPTER_ID)) reasons.push("route_adapter_pair_invalid");
  if (adapters.includes("none") && !routes.includes("report_only")) reasons.push("route_adapter_pair_invalid");
  if (adapters.includes(SIMULATED_REVIEW_ADAPTER_ID) && !routes.includes("simulated")) reasons.push("route_adapter_pair_invalid");
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

function validateInputEnvelope(value) {
  try {
    if (!isPlainObject(value)) return invalid("packet_malformed");
    const reasons = [];
    inspectObjectKeys(value, REVIEW_ROUTE_INPUT_FIELDS, reasons);
    return reasons.length === 0 ? { ok: true, reasons: [] } : invalid(reasons);
  } catch {
    return invalid("packet_malformed");
  }
}

function inspectObjectKeys(value, fields, reasons) {
  for (const key of Object.keys(value)) {
    if (!fields.includes(key)) reasons.push(FORBIDDEN_NAME.test(key) ? "forbidden_field" : "unknown_field");
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
  const values = copySafePlainArray(value);
  return values ? [...new Set(values.map((entry) => String(entry)))].sort() : [];
}

function validateConsumedDisclosurePacketIds(value) {
  if (value === undefined) return { ok: true, values: [] };
  const values = copySafePlainArray(value);
  if (!values || values.length > 256 || values.some((entry) => !safeId(entry)) || new Set(values).size !== values.length) return { ok: false, values: [] };
  return { ok: true, values };
}

function isAllowedStringList(values, fixedValues) {
  const copied = copySafePlainArray(values);
  return Boolean(copied) && copied.length > 0 && copied.length <= 32 && copied.every((value) => safeId(value) && fixedValues.includes(value)) && new Set(copied).size === copied.length;
}

function isAllowedEvidenceRefs(values) {
  const copied = copySafePlainArray(values);
  return Boolean(copied) && copied.length > 0 && copied.length <= 32 && copied.every((value) => typeof value === "string" && SAFE_EVIDENCE_REF.test(value)) && new Set(copied).size === copied.length;
}

function isSafePlainArray(value) {
  return copySafePlainArray(value) !== null;
}

function copySafePlainArray(value) {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length > 0) return null;
    const names = Object.getOwnPropertyNames(value);
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, "value") || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0 || names.length !== lengthDescriptor.value + 1 || !names.includes("length")) return null;
    const copied = [];
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) return null;
      copied.push(descriptor.value);
    }
    return copied;
  } catch {
    return null;
  }
}

function ownDataValue(value, key) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
}

function normalizeJsonForSerialization(value, seen = new WeakSet()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return { ok: true, value };
  if (typeof value === "number" && Number.isFinite(value)) return { ok: true, value };
  const arrayValue = copySafePlainArray(value);
  if (arrayValue) {
    if (seen.has(value)) return { ok: false };
    seen.add(value);
    const normalized = [];
    for (const entry of arrayValue) {
      const item = normalizeJsonForSerialization(entry, seen);
      if (!item.ok) return item;
      normalized.push(item.value);
    }
    Object.setPrototypeOf(normalized, null);
    return { ok: true, value: normalized };
  }
  if (!isPlainObject(value) || seen.has(value) || Object.getOwnPropertySymbols(value).length > 0) return { ok: false };
  seen.add(value);
  const normalized = Object.create(null);
  for (const key of Object.getOwnPropertyNames(value).sort()) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (key === "toJSON" || !descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) return { ok: false };
    const item = normalizeJsonForSerialization(descriptor.value, seen);
    if (!item.ok) return item;
    normalized[key] = item.value;
  }
  return { ok: true, value: normalized };
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
  try {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
}

function invalid(reasons) {
  return { ok: false, reasons: [...new Set(Array.isArray(reasons) ? reasons : [reasons])] };
}
