const OLLAMA_ENDPOINT = "http://192.168.1.128:11434/v1/chat/completions";
const OLLAMA_MODEL = "qwen3:14b";
const OLLAMA_SOURCE_VM = "192.168.1.8";
const OLLAMA_CONNECT_TIMEOUT_SECONDS = 2;
const OLLAMA_TOTAL_TIMEOUT_SECONDS = 120;
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
  rejectUnknownKeys(route, ["role", "provider", "endpoint", "model", "sourceVm", "connectTimeoutSeconds", "totalTimeoutSeconds", "metadataOnly", "rawPayloadRetained", "publicExposure", "credentialsRead", "modelDiscovery", "endpointDiscovery", "reviewPass", "activationAllowed", "fallbackUsed", "primaryFailure"], blockers);
  if (text(route.provider).toLowerCase() !== "ollama") blockers.push("backup-review role requires Ollama");
  if (text(route.endpoint) !== OLLAMA_ENDPOINT) blockers.push("Ollama endpoint is outside the approved VM-to-host boundary");
  if (text(route.model) !== OLLAMA_MODEL) blockers.push("Ollama model must remain qwen3:14b");
  if (text(route.sourceVm) !== OLLAMA_SOURCE_VM) blockers.push("Ollama source VM is not the approved Kendall VM");
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

function unique(values) {
  return [...new Set(values)];
}

export function isApprovedFallbackFailure(value) {
  const normalized = (typeof value === "number" ? String(value) : text(value)).toLowerCase().replaceAll("_", "-");
  return FALLBACK_FAILURES.has(normalized) || normalized === "429" || normalized === "http 429";
}

export const BOUNDED_ROUTE_POLICY_DEFAULTS = Object.freeze({
  ollamaEndpoint: OLLAMA_ENDPOINT,
  ollamaModel: OLLAMA_MODEL,
  ollamaSourceVm: OLLAMA_SOURCE_VM,
  ollamaConnectTimeoutSeconds: OLLAMA_CONNECT_TIMEOUT_SECONDS,
  ollamaTotalTimeoutSeconds: OLLAMA_TOTAL_TIMEOUT_SECONDS,
  claudeAllowedTools: [...CLAUDE_ALLOWED_TOOLS],
  claudeMaxBudgetUsd: 1,
  orderedRoles: Object.freeze({ primary: "primary-review", backup: "backup-review" }),
});
