import { readFileSync } from "node:fs";

const AUTHORITY_POLICY_PATH = new URL("../../docs/workflows/local-provider-authority-policy-v1.json", import.meta.url);
const LOCAL_PROVIDER_AUTHORITY_UNRESOLVED = "ollama_authority_policy_unresolved";
const LOCAL_PROVIDER_AUTHORITY_INVALID = "ollama_authority_policy_invalid";
const LOCAL_PROVIDER_ENABLEMENT_UNRESOLVED = "ollama_enablement_authority_unresolved";
const LOCAL_PROVIDER_TRUSTED_ATTESTATION_REQUIRED = "ollama_trusted_attestation_required";
const LOCAL_PROVIDER_ENABLEMENT_APPROVAL = Object.freeze({
  claim: "accepted_operator_enablement_approval",
  provenanceRef: "docs/architecture/kendall-vnxt-local-provider-enablement-approval-v1.md",
});
const LOCAL_PROVIDER_APPROVED_SOURCE_VM = "192.168.1.8";
const MAX_AUTHORITY_POLICY_JSON_DEPTH = 64;
const CLAUDE_ALLOWED_TOOLS = new Set(["Read", "Grep", "Glob"]);
const FALLBACK_FAILURES = new Set(["unavailable", "empty", "rate-limited"]);

/**
 * Validate an explicitly approved route role. Route eligibility only permits
 * a bounded review attempt; it never grants activation or mutation authority.
 */
export function evaluateBoundedReviewRoute(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const role = text(source.role).toLowerCase();
  const blockers = [];
  const authority = currentAuthorityPolicy();

  if (role === "backup-review") {
    validateOllamaRoute(source, blockers, authority);
    if (source.fallbackUsed !== true || !isApprovedFallbackFailure(source.primaryFailure)) {
      blockers.push("Ollama backup requires an approved Claude fallback outcome");
    }
  } else if (role === "primary-review") {
    validateClaudeRoute(source, blockers);
  } else {
    blockers.push("route role is not an approved ordered role");
  }

  const eligible = blockers.length === 0;
  const reviewEligible = eligible;
  const authorityDisabledReason = blockers.includes(LOCAL_PROVIDER_AUTHORITY_INVALID)
    ? LOCAL_PROVIDER_AUTHORITY_INVALID
    : blockers.includes(LOCAL_PROVIDER_AUTHORITY_UNRESOLVED)
      ? LOCAL_PROVIDER_AUTHORITY_UNRESOLVED
      : blockers.includes(LOCAL_PROVIDER_TRUSTED_ATTESTATION_REQUIRED)
        ? LOCAL_PROVIDER_TRUSTED_ATTESTATION_REQUIRED
        : blockers.includes(LOCAL_PROVIDER_ENABLEMENT_UNRESOLVED)
          ? LOCAL_PROVIDER_ENABLEMENT_UNRESOLVED
        : null;

  return {
    schemaVersion: 2,
    mode: "ordered-bounded-review-route-policy",
    role: role || null,
    priority: role === "primary-review" ? 1 : role === "backup-review" ? 2 : null,
    status: eligible ? "READY" : "HOLD",
    eligible,
    reviewEligible,
    activationEligible: false,
    allowed: eligible,
    blockers: unique(blockers),
    authorityStatus: role === "backup-review" ? authority.policy.status : null,
    disabledReason: authorityDisabledReason,
    metadataOnly: true,
    rawPayloadRetained: false,
    execution: {
      mutation: "none",
      sourceWrites: false,
      gitMutations: false,
      githubMutations: false,
      cleanup: false,
    },
  };
}

/**
 * Select Claude first and use Ollama only for an explicitly bounded primary
 * failure. Unsafe or unknown metadata never triggers fallback.
 */
export function selectOrderedReviewRoute({ primary = {}, backup = {}, primaryFailure = null } = {}) {
  const primaryPacket = evaluateBoundedReviewRoute({ ...primary, role: "primary-review", fallbackUsed: false });
  const backupPacket = evaluateBoundedReviewRoute({ ...backup, role: "backup-review", fallbackUsed: true, primaryFailure });
  if (primaryPacket.eligible && !primaryFailure) {
    return { status: "READY", selected: "claude", fallbackUsed: false, primary: primaryPacket, backup: backupPacket };
  }
  if (primaryPacket.eligible && isApprovedFallbackFailure(primaryFailure) && backupPacket.eligible) {
    return { status: "READY", selected: "ollama", fallbackUsed: true, primary: primaryPacket, backup: backupPacket };
  }
  return {
    status: "HOLD",
    selected: null,
    fallbackUsed: false,
    primary: primaryPacket,
    backup: backupPacket,
    blockers: unique([
      ...primaryPacket.blockers,
      ...backupPacket.blockers,
      primaryFailure && !isApprovedFallbackFailure(primaryFailure) ? "primary failure is not an approved fallback condition" : "no eligible ordered review route",
    ]),
  };
}

function validateOllamaRoute(route, blockers, authority) {
  if (authority.policy.status === "invalid") {
    blockers.push(LOCAL_PROVIDER_AUTHORITY_INVALID);
  } else if (authority.policy.status !== "approved" || authority.sourceVm === null) {
    blockers.push(LOCAL_PROVIDER_AUTHORITY_UNRESOLVED);
  } else if (!authority.enablementApproved) {
    blockers.push(LOCAL_PROVIDER_ENABLEMENT_UNRESOLVED);
  } else if (!authority.trustedAttestationVerified) {
    blockers.push(LOCAL_PROVIDER_TRUSTED_ATTESTATION_REQUIRED);
  }
  rejectUnknownKeys(route, ["role", "provider", "endpoint", "model", "sourceVm", "connectTimeoutSeconds", "totalTimeoutSeconds", "localHostVerified", "localHostVerificationRef", "metadataOnly", "rawPayloadRetained", "publicExposure", "credentialsRead", "modelDiscovery", "endpointDiscovery", "reviewPass", "activationAllowed", "fallbackUsed", "primaryFailure"], blockers);
  if (text(route.provider).toLowerCase() !== "ollama") blockers.push("backup-review role requires Ollama");
  if (text(route.endpoint) !== authority.endpoint) blockers.push("Ollama endpoint is outside the approved VM-to-host boundary");
  if (text(route.model) !== authority.model) blockers.push("Ollama model must remain qwen3:14b");
  if (text(route.sourceVm) !== authority.sourceVm) blockers.push("Ollama source VM is not approved by the authority policy");
  if (route.connectTimeoutSeconds !== authority.connectTimeoutSeconds) blockers.push("Ollama connect timeout must remain 2 seconds");
  if (route.totalTimeoutSeconds !== authority.totalTimeoutSeconds) blockers.push("Ollama total timeout must remain 120 seconds");
  if (route.localHostVerified !== true || !policyExactText(route.localHostVerificationRef)?.startsWith("local-host:")) blockers.push("Ollama route requires a runtime local-host verification attestation");
  if (route.metadataOnly !== true || route.rawPayloadRetained !== false) blockers.push("Ollama route must retain metadata only");
  if (route.publicExposure !== false || route.credentialsRead !== false || route.modelDiscovery !== false || route.endpointDiscovery !== false) blockers.push("Ollama safety controls must be explicit false");
  if (route.reviewPass !== false || route.activationAllowed !== false) blockers.push("backup-review authority controls must be explicit false");
}

function validateClaudeRoute(route, blockers) {
  rejectUnknownKeys(route, ["role", "provider", "model", "executable", "mode", "authenticated", "maxBudgetUsd", "allowedTools", "disallowedTools", "metadataOnly", "rawPayloadRetained", "sourceScope", "activationAllowed", "reviewPass", "fallbackUsed", "primaryFailure"], blockers);
  if (text(route.provider).toLowerCase() !== "claude") blockers.push("primary-review role requires Claude");
  if (text(route.model).toLowerCase() !== "claude") blockers.push("Claude primary route model must remain claude");
  if (text(route.executable) !== "claude" || text(route.mode).toLowerCase() !== "print") blockers.push("Claude route must use the non-interactive print CLI");
  if (route.authenticated !== true) blockers.push("Claude route must use the configured authenticated CLI");
  if (!Number.isFinite(route.maxBudgetUsd) || route.maxBudgetUsd <= 0 || route.maxBudgetUsd > 1) blockers.push("Claude max budget must be positive and no more than $1");
  if (!Array.isArray(route.allowedTools) || route.allowedTools.length === 0 || route.allowedTools.some((tool) => !CLAUDE_ALLOWED_TOOLS.has(tool))) blockers.push("Claude tools must be limited to Read, Grep, and Glob");
  if (!isExactToolSet(route.disallowedTools, ["Edit", "Write", "Bash", "WebFetch", "WebSearch"])) blockers.push("Claude blocked tools must be the exact forbidden tool set");
  if (route.metadataOnly !== true || route.rawPayloadRetained !== false) blockers.push("Claude route must retain metadata only");
  if (route.sourceScope !== "named-evidence-only") blockers.push("Claude route scope must be named evidence only");
  if (route.activationAllowed !== false || route.reviewPass !== false) blockers.push("primary-review authority controls must be explicit false");
  if (route.fallbackUsed !== false || route.primaryFailure != null) blockers.push("Claude primary route must have fallbackUsed=false and no primaryFailure");
}

function isExactToolSet(value, expected) {
  return Array.isArray(value)
    && value.length === expected.length
    && new Set(value).size === expected.length
    && expected.every((tool) => value.includes(tool));
}

function rejectUnknownKeys(route, allowedKeys, blockers) {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(route)) {
    if (!allowed.has(key)) blockers.push(`route metadata key is not allowed: ${key}`);
  }
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function policyText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function policyExactText(value) {
  return typeof value === "string" && value.length > 0 && value.trim() === value ? value : null;
}

function hasOnlyKeys(value, allowedKeys) {
  return Boolean(value)
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).length === allowedKeys.length
    && allowedKeys.every((key) => Object.hasOwn(value, key));
}

function isExactNonemptyStringArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every((entry) => policyExactText(entry));
}

function loadAuthorityPolicy() {
  try {
    return parseLocalProviderAuthorityPolicyDocument(readFileSync(AUTHORITY_POLICY_PATH, "utf8"));
  } catch {
    return invalidAuthorityPolicy();
  }
}

/** Parse JSON without permitting duplicate object members to overwrite policy fields. */
export function parseJsonRejectingDuplicateKeys(source) {
  let index = 0;
  let depth = 0;

  const skipWhitespace = () => {
    while (/[ \t\r\n]/.test(source[index] ?? "")) index += 1;
  };
  const expect = (token) => {
    if (source[index] !== token) throw new SyntaxError(`Expected ${token}`);
    index += 1;
  };
  const parseString = () => {
    const start = index;
    expect('"');
    while (index < source.length) {
      if (source[index] === "\\") {
        index += 2;
      } else if (source[index] === '"') {
        index += 1;
        return JSON.parse(source.slice(start, index));
      } else {
        index += 1;
      }
    }
    throw new SyntaxError("Unterminated JSON string");
  };
  const parsePrimitive = () => {
    const start = index;
    while (index < source.length && !/[ \t\r\n,}\]]/.test(source[index])) index += 1;
    return JSON.parse(source.slice(start, index));
  };
  const parseArray = () => {
    const values = [];
    depth += 1;
    if (depth > MAX_AUTHORITY_POLICY_JSON_DEPTH) throw new RangeError("Authority policy nesting exceeds the supported limit");
    expect("[");
    skipWhitespace();
    if (source[index] === "]") {
      index += 1;
      depth -= 1;
      return values;
    }
    while (true) {
      values.push(parseValue());
      skipWhitespace();
      if (source[index] === "]") {
        index += 1;
        depth -= 1;
        return values;
      }
      expect(",");
      skipWhitespace();
    }
  };
  const parseObject = () => {
    const result = Object.create(null);
    const keys = new Set();
    depth += 1;
    if (depth > MAX_AUTHORITY_POLICY_JSON_DEPTH) throw new RangeError("Authority policy nesting exceeds the supported limit");
    expect("{");
    skipWhitespace();
    if (source[index] === "}") {
      index += 1;
      depth -= 1;
      return result;
    }
    while (true) {
      if (source[index] !== '"') throw new SyntaxError("Expected JSON object key");
      const key = parseString();
      if (keys.has(key)) throw new SyntaxError(`Duplicate JSON object key: ${key}`);
      keys.add(key);
      skipWhitespace();
      expect(":");
      skipWhitespace();
      result[key] = parseValue();
      skipWhitespace();
      if (source[index] === "}") {
        index += 1;
        depth -= 1;
        return result;
      }
      expect(",");
      skipWhitespace();
    }
  };
  const parseValue = () => {
    skipWhitespace();
    if (source[index] === "{") return parseObject();
    if (source[index] === "[") return parseArray();
    if (source[index] === '"') return parseString();
    return parsePrimitive();
  };

  const value = parseValue();
  skipWhitespace();
  if (index !== source.length) throw new SyntaxError("Unexpected trailing JSON data");
  return value;
}

export function parseLocalProviderAuthorityPolicyDocument(source) {
  try {
    return parseLocalProviderAuthorityPolicy(parseJsonRejectingDuplicateKeys(source));
  } catch {
    return invalidAuthorityPolicy();
  }
}

/**
 * Parse the versioned policy as a closed contract. A future reviewed policy
 * transition may select a candidate VM, but malformed or partial "approved"
 * data can never turn the route on.
 */
export function parseLocalProviderAuthorityPolicy(policy) {
  if (!hasOnlyKeys(policy, ["schemaVersion", "authorityFamily", "status", "approvedSourceVm", "candidateSourceVms", "route", "defaults", "enablement", "decisionRequired", "stopLines", "rollback"])) return invalidAuthorityPolicy();
  const candidates = Array.isArray(policy.candidateSourceVms) ? policy.candidateSourceVms : [];
  if (policy.schemaVersion !== 1 || policy.authorityFamily !== "local-provider-execution" || candidates.length !== 2) {
    return invalidAuthorityPolicy();
  }

  const candidateByVm = new Map();
  for (const candidate of candidates) {
    if (!hasOnlyKeys(candidate, ["sourceVm", "claim", "provenanceRef"])) return invalidAuthorityPolicy();
    const sourceVm = policyExactText(candidate.sourceVm);
    if (!sourceVm || candidateByVm.has(sourceVm)) return invalidAuthorityPolicy();
    candidateByVm.set(sourceVm, candidate);
  }
  if (
    candidateByVm.get("192.168.1.118")?.claim !== "accepted_operator_approval"
    || candidateByVm.get("192.168.1.118")?.provenanceRef !== "docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md"
    || candidateByVm.get("192.168.1.8")?.claim !== "accepted_operator_successor_approval"
    || candidateByVm.get("192.168.1.8")?.provenanceRef !== "docs/architecture/kendall-vnxt-local-provider-source-vm-approval-2026-08-15.md"
  ) return invalidAuthorityPolicy();

  const enablement = policy.enablement;
  if (!hasOnlyKeys(enablement, ["status", "claim", "provenanceRef", "expiresAt"])) return invalidAuthorityPolicy();
  const enablementStatus = policyExactText(enablement.status);
  const enablementClaim = policyExactText(enablement.claim);
  const enablementProvenanceRef = enablement.provenanceRef === null ? null : policyExactText(enablement.provenanceRef);
  const enablementExpiresAt = enablement.expiresAt === null ? null : policyExactText(enablement.expiresAt);
  if (
    (enablementStatus === "hold_requires_separate_review" && (enablementClaim !== "separate_review_required" || enablementProvenanceRef !== null || enablementExpiresAt !== null))
    || (enablementStatus === "approved" && (
      enablementClaim !== LOCAL_PROVIDER_ENABLEMENT_APPROVAL.claim
      || enablementProvenanceRef !== LOCAL_PROVIDER_ENABLEMENT_APPROVAL.provenanceRef
      || !isFutureCanonicalExpiry(enablementExpiresAt)
    ))
    || !["hold_requires_separate_review", "approved"].includes(enablementStatus)
  ) return invalidAuthorityPolicy();

  const route = policy.route;
  const defaults = policy.defaults;
  if (
    !hasOnlyKeys(route, ["endpoint", "model", "connectTimeoutSeconds", "totalTimeoutSeconds", "retentionMode"])
    || policyExactText(route.endpoint) !== "http://192.168.1.128:11434/v1/chat/completions"
    || policyExactText(route.model) !== "qwen3:14b"
    || route.connectTimeoutSeconds !== 2
    || route.totalTimeoutSeconds !== 120
    || route.retentionMode !== "metadata-only"
    || !hasOnlyKeys(defaults, ["allowLocalProviderCalls", "allowOllamaProviderCalls", "allowAutomaticOllamaLocalEvidence"])
    || defaults.allowLocalProviderCalls !== false
    || defaults.allowOllamaProviderCalls !== false
    || defaults.allowAutomaticOllamaLocalEvidence !== false
    || !isExactNonemptyStringArray(policy.decisionRequired)
    || !isExactNonemptyStringArray(policy.stopLines)
    || !hasOnlyKeys(policy.rollback, ["environment", "verification"])
    || !hasOnlyKeys(policy.rollback.environment, ["SUPERVISOR_ALLOW_LOCAL_PROVIDER_CALLS", "SUPERVISOR_ALLOW_OLLAMA_PROVIDER_CALLS", "SUPERVISOR_ALLOW_AUTOMATIC_OLLAMA_LOCAL_EVIDENCE"])
    || policy.rollback.environment.SUPERVISOR_ALLOW_LOCAL_PROVIDER_CALLS !== "false"
    || policy.rollback.environment.SUPERVISOR_ALLOW_OLLAMA_PROVIDER_CALLS !== "false"
    || policy.rollback.environment.SUPERVISOR_ALLOW_AUTOMATIC_OLLAMA_LOCAL_EVIDENCE !== "false"
    || !policyExactText(policy.rollback.verification)
  ) return invalidAuthorityPolicy();

  // Authority values are identifiers, not display text. Do not trim here:
  // Python and the policy checker require an exact candidate match as well.
  const approvedSourceVm = typeof policy.approvedSourceVm === "string" ? policy.approvedSourceVm : null;
  if (policy.status === "hold_conflicting_source_vm" && policy.approvedSourceVm === null) {
    return { ...policy, approvedSourceVm: null, route: { ...route }, enablement: { ...enablement } };
  }
  if (policy.status === "approved" && approvedSourceVm === LOCAL_PROVIDER_APPROVED_SOURCE_VM && candidateByVm.has(approvedSourceVm)) {
    return { ...policy, approvedSourceVm, route: { ...route }, enablement: { ...enablement } };
  }
  return invalidAuthorityPolicy();
}

function isFutureCanonicalExpiry(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value || "")) return false;
  const parsed = Date.parse(value);
  const canonicalValue = value.includes(".") ? value : value.replace(/Z$/, ".000Z");
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === canonicalValue && parsed > Date.now();
}

function invalidAuthorityPolicy() {
  return { status: "invalid", approvedSourceVm: null, route: {} };
}

function currentAuthorityPolicy() {
  const policy = loadAuthorityPolicy();
  return {
    policy,
    endpoint: policyText(policy.route?.endpoint),
    model: policyText(policy.route?.model),
    sourceVm: policyText(policy.approvedSourceVm) || null,
    // The policy parser accepts an enablement approval only when its bounded
    // provenance and expiry contract is complete. That is still insufficient
    // to make the route eligible: v1 cannot verify a trusted attestation-
    // service receipt for the actual caller host.
    enablementApproved: policy.enablement?.status === "approved",
    trustedAttestationVerified: false,
    connectTimeoutSeconds: policy.route?.connectTimeoutSeconds,
    totalTimeoutSeconds: policy.route?.totalTimeoutSeconds,
  };
}

function unique(values) {
  return [...new Set(values)];
}

export function isApprovedFallbackFailure(value) {
  const normalized = (typeof value === "number" ? String(value) : text(value)).toLowerCase().replaceAll("_", "-");
  return FALLBACK_FAILURES.has(normalized) || normalized === "429" || normalized === "http 429";
}

export function getBoundedRoutePolicyDefaults() {
  const authority = currentAuthorityPolicy();
  return {
    localProviderAuthorityStatus: authority.policy.status,
    localProviderAuthorityResolved: authority.policy.status === "approved" && authority.sourceVm !== null,
    localProviderEnablementApproved: authority.enablementApproved,
    localProviderAuthorityDisabledReason: authority.policy.status === "invalid"
      ? LOCAL_PROVIDER_AUTHORITY_INVALID
      : authority.policy.status !== "approved" || authority.sourceVm === null
        ? LOCAL_PROVIDER_AUTHORITY_UNRESOLVED
        : !authority.enablementApproved
          ? LOCAL_PROVIDER_ENABLEMENT_UNRESOLVED
        : !authority.trustedAttestationVerified
          ? LOCAL_PROVIDER_TRUSTED_ATTESTATION_REQUIRED
          : null,
    ollamaEndpoint: authority.endpoint,
    ollamaModel: authority.model,
    ollamaSourceVm: authority.sourceVm,
    ollamaConnectTimeoutSeconds: authority.connectTimeoutSeconds,
    ollamaTotalTimeoutSeconds: authority.totalTimeoutSeconds,
    claudeAllowedTools: [...CLAUDE_ALLOWED_TOOLS],
    claudeMaxBudgetUsd: 1,
    orderedRoles: Object.freeze({ primary: "primary-review", backup: "backup-review" }),
  };
}

export const BOUNDED_ROUTE_POLICY_DEFAULTS = Object.freeze(Object.defineProperties(
  {},
  Object.fromEntries(
    Object.keys(getBoundedRoutePolicyDefaults()).map((key) => [key, {
      enumerable: true,
      get: () => getBoundedRoutePolicyDefaults()[key],
    }]),
  ),
));
