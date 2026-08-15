import { readFileSync } from "node:fs";

const AUTHORITY_POLICY_PATH = new URL("../../docs/workflows/local-provider-authority-policy-v1.json", import.meta.url);
const LOCAL_PROVIDER_AUTHORITY_UNRESOLVED = "ollama_authority_policy_unresolved";
const LOCAL_PROVIDER_AUTHORITY_INVALID = "ollama_authority_policy_invalid";
const LOCAL_PROVIDER_AUTHORITY_POLICY = loadAuthorityPolicy();
const OLLAMA_ENDPOINT = policyText(LOCAL_PROVIDER_AUTHORITY_POLICY.route?.endpoint);
const OLLAMA_MODEL = policyText(LOCAL_PROVIDER_AUTHORITY_POLICY.route?.model);
const OLLAMA_SOURCE_VM = policyText(LOCAL_PROVIDER_AUTHORITY_POLICY.approvedSourceVm) || null;
const OLLAMA_CONNECT_TIMEOUT_SECONDS = LOCAL_PROVIDER_AUTHORITY_POLICY.route?.connectTimeoutSeconds;
const OLLAMA_TOTAL_TIMEOUT_SECONDS = LOCAL_PROVIDER_AUTHORITY_POLICY.route?.totalTimeoutSeconds;
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

  if (role === "backup-review") {
    validateOllamaRoute(source, blockers);
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
    authorityStatus: role === "backup-review" ? LOCAL_PROVIDER_AUTHORITY_POLICY.status : null,
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

function validateOllamaRoute(route, blockers) {
  if (LOCAL_PROVIDER_AUTHORITY_POLICY.status === "invalid") {
    blockers.push(LOCAL_PROVIDER_AUTHORITY_INVALID);
  } else if (LOCAL_PROVIDER_AUTHORITY_POLICY.status !== "approved" || OLLAMA_SOURCE_VM === null) {
    blockers.push(LOCAL_PROVIDER_AUTHORITY_UNRESOLVED);
  }
  rejectUnknownKeys(route, ["role", "provider", "endpoint", "model", "sourceVm", "connectTimeoutSeconds", "totalTimeoutSeconds", "metadataOnly", "rawPayloadRetained", "publicExposure", "credentialsRead", "modelDiscovery", "endpointDiscovery", "reviewPass", "activationAllowed", "fallbackUsed", "primaryFailure"], blockers);
  if (text(route.provider).toLowerCase() !== "ollama") blockers.push("backup-review role requires Ollama");
  if (text(route.endpoint) !== OLLAMA_ENDPOINT) blockers.push("Ollama endpoint is outside the approved VM-to-host boundary");
  if (text(route.model) !== OLLAMA_MODEL) blockers.push("Ollama model must remain qwen3:14b");
  if (text(route.sourceVm) !== OLLAMA_SOURCE_VM) blockers.push("Ollama source VM is not approved by the authority policy");
  if (route.connectTimeoutSeconds !== OLLAMA_CONNECT_TIMEOUT_SECONDS) blockers.push("Ollama connect timeout must remain 2 seconds");
  if (route.totalTimeoutSeconds !== OLLAMA_TOTAL_TIMEOUT_SECONDS) blockers.push("Ollama total timeout must remain 120 seconds");
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

  const skipWhitespace = () => {
    while (/\s/.test(source[index] ?? "")) index += 1;
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
    while (index < source.length && !/[\s,}\]]/.test(source[index])) index += 1;
    return JSON.parse(source.slice(start, index));
  };
  const parseArray = () => {
    const values = [];
    expect("[");
    skipWhitespace();
    if (source[index] === "]") {
      index += 1;
      return values;
    }
    while (true) {
      values.push(parseValue());
      skipWhitespace();
      if (source[index] === "]") {
        index += 1;
        return values;
      }
      expect(",");
      skipWhitespace();
    }
  };
  const parseObject = () => {
    const result = Object.create(null);
    const keys = new Set();
    expect("{");
    skipWhitespace();
    if (source[index] === "}") {
      index += 1;
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
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) return invalidAuthorityPolicy();
  const candidates = Array.isArray(policy.candidateSourceVms) ? policy.candidateSourceVms : [];
  if (policy.schemaVersion !== 1 || policy.authorityFamily !== "local-provider-execution" || candidates.length !== 2) {
    return invalidAuthorityPolicy();
  }

  const candidateByVm = new Map();
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return invalidAuthorityPolicy();
    const sourceVm = policyExactText(candidate.sourceVm);
    if (!sourceVm || candidateByVm.has(sourceVm)) return invalidAuthorityPolicy();
    candidateByVm.set(sourceVm, candidate);
  }
  if (
    candidateByVm.get("192.168.1.118")?.claim !== "accepted_operator_approval"
    || candidateByVm.get("192.168.1.118")?.provenanceRef !== "docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md"
    || candidateByVm.get("192.168.1.8")?.claim !== "current_routed_source_observation"
    || candidateByVm.get("192.168.1.8")?.provenanceRef !== "docs/architecture/kendall-vnxt-llm-orchestration-lane-model-2026-06-10.md"
  ) return invalidAuthorityPolicy();

  const route = policy.route;
  const defaults = policy.defaults;
  if (
    !route || typeof route !== "object" || Array.isArray(route)
    || policyExactText(route.endpoint) !== "http://192.168.1.128:11434/v1/chat/completions"
    || policyExactText(route.model) !== "qwen3:14b"
    || route.connectTimeoutSeconds !== 2
    || route.totalTimeoutSeconds !== 120
    || route.retentionMode !== "metadata-only"
    || !defaults || typeof defaults !== "object" || Array.isArray(defaults)
    || defaults.allowLocalProviderCalls !== false
    || defaults.allowOllamaProviderCalls !== false
    || defaults.allowAutomaticOllamaLocalEvidence !== false
  ) return invalidAuthorityPolicy();

  // Authority values are identifiers, not display text. Do not trim here:
  // Python and the policy checker require an exact candidate match as well.
  const approvedSourceVm = typeof policy.approvedSourceVm === "string" ? policy.approvedSourceVm : null;
  if (policy.status === "hold_conflicting_source_vm" && policy.approvedSourceVm === null) {
    return { ...policy, approvedSourceVm: null, route: { ...route } };
  }
  if (policy.status === "approved" && approvedSourceVm && candidateByVm.has(approvedSourceVm)) {
    return { ...policy, approvedSourceVm, route: { ...route } };
  }
  return invalidAuthorityPolicy();
}

function invalidAuthorityPolicy() {
  return { status: "invalid", approvedSourceVm: null, route: {} };
}

function unique(values) {
  return [...new Set(values)];
}

export function isApprovedFallbackFailure(value) {
  const normalized = (typeof value === "number" ? String(value) : text(value)).toLowerCase().replaceAll("_", "-");
  return FALLBACK_FAILURES.has(normalized) || normalized === "429" || normalized === "http 429";
}

export const BOUNDED_ROUTE_POLICY_DEFAULTS = Object.freeze({
  localProviderAuthorityStatus: LOCAL_PROVIDER_AUTHORITY_POLICY.status,
  localProviderAuthorityResolved: LOCAL_PROVIDER_AUTHORITY_POLICY.status === "approved" && OLLAMA_SOURCE_VM !== null,
  localProviderAuthorityDisabledReason: LOCAL_PROVIDER_AUTHORITY_POLICY.status === "invalid"
    ? LOCAL_PROVIDER_AUTHORITY_INVALID
    : LOCAL_PROVIDER_AUTHORITY_UNRESOLVED,
  ollamaEndpoint: OLLAMA_ENDPOINT,
  ollamaModel: OLLAMA_MODEL,
  ollamaSourceVm: OLLAMA_SOURCE_VM,
  ollamaConnectTimeoutSeconds: OLLAMA_CONNECT_TIMEOUT_SECONDS,
  ollamaTotalTimeoutSeconds: OLLAMA_TOTAL_TIMEOUT_SECONDS,
  claudeAllowedTools: [...CLAUDE_ALLOWED_TOOLS],
  claudeMaxBudgetUsd: 1,
  orderedRoles: Object.freeze({ primary: "primary-review", backup: "backup-review" }),
});
