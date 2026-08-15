import { getBoundedRoutePolicyDefaults, isApprovedFallbackFailure } from "./review-gated-low-risk-route-policy.mjs";

const MAX_CONTEXT_BYTES = 1024 * 1024;
const MAX_EXPIRY_MS = 24 * 60 * 60 * 1000;
const ALLOWED_SOURCE_CLASSES = new Set(["private-operator-evidence", "work-item-evidence"]);
const ALLOWED_PROVIDERS = new Set(["claude", "ollama"]);
const SENSITIVE = /(?:credential|secret|token|password|mfa|account[\s/\\:._-]*security|private[\s/\\:._-]*key|customer|production|\.env|raw[\s/\\:._-]*(?:prompt|completion|payload)|reasoning[\s/\\:._-]*trace|provider[\s/\\:._-]*payload|vault[/:]?(?:private|excluded))/i;

/**
 * Validate whether a bounded private evidence packet may be sent to an
 * explicitly approved provider route. This grants send eligibility only;
 * activation, mutation, delivery, and retention remain separate gates.
 */
export function evaluatePrivateEvidencePacket(input = {}, options = {}) {
  const packet = input && typeof input === "object" ? input : {};
  const blockers = [];
  const routePolicyDefaults = getBoundedRoutePolicyDefaults();
  const now = parseTimestamp(options.now);
  const provider = text(packet.provider).toLowerCase();
  const routeRole = text(packet.routeRole).toLowerCase();
  rejectUnknownKeys(packet, ["packetId", "purpose", "taskType", "dataClassification", "scopeRef", "authorityEvidenceRef", "sourceClass", "sourceRefs", "provider", "routeRole", "fallbackUsed", "primaryFailure", "endpoint", "model", "operatorConsent", "boundaryExceptionVerified", "platformDisclosureVeto", "boundaryVerificationStatus", "boundaryVerificationRef", "redactionApplied", "redactionStatus", "redactionRef", "forbiddenClassesPresent", "broadDump", "providerMemory", "rawPayloadRetained", "providerPayloadRetained", "retentionMode", "contextBytes", "contextDigest", "contextDigestAlgorithm", "expiresAt", "revocationRef", "revocationStatus", "revoked", "rollbackRef", "rollbackReady", "destinationAllowlist", "routeProof"], blockers);

  if (!safeId(packet.packetId, 120)) blockers.push("packetId is missing or unsafe");
  if (!safeText(packet.purpose, 240)) blockers.push("purpose is missing or unsafe");
  if (packet.taskType !== "review") blockers.push("taskType must be the bounded review operation");
  if (packet.dataClassification !== packet.sourceClass || !ALLOWED_SOURCE_CLASSES.has(text(packet.dataClassification))) blockers.push("data classification must match the approved source class");
  if (!safeRef(packet.scopeRef)) blockers.push("scopeRef must identify a named work-item/evidence scope");
  if (!safeTypedRef(packet.authorityEvidenceRef, "authority:", 200)) blockers.push("authorityEvidenceRef must bind the packet to explicit operator authority");
  if (!ALLOWED_SOURCE_CLASSES.has(text(packet.sourceClass))) blockers.push("source class is not approved for private evidence processing");
  if (!ALLOWED_PROVIDERS.has(provider)) blockers.push("provider is not on the private evidence allowlist");
  if (packet.operatorConsent !== true) blockers.push("per-packet operator consent is required");
  if (packet.boundaryExceptionVerified !== true) blockers.push("approved private-evidence boundary exception must be verified");
  if (packet.platformDisclosureVeto !== false) blockers.push("platform disclosure veto must be explicitly cleared by the approved boundary");
  if (packet.boundaryVerificationStatus !== "verified" || !safeTypedRef(packet.boundaryVerificationRef, "verify:", 160)) blockers.push("boundary verification evidence is missing or failed");
  if (packet.redactionApplied !== true) blockers.push("redaction must be applied before sending");
  if (packet.redactionStatus !== "applied" || !safeTypedRef(packet.redactionRef, "redact:", 160)) blockers.push("redaction evidence is missing or failed");
  if (packet.forbiddenClassesPresent !== false) blockers.push("forbidden source classes must be explicitly absent");
  if (packet.broadDump !== false) blockers.push("broad repository or vault dumps are forbidden");
  if (packet.providerMemory !== false) blockers.push("persistent provider memory must be disabled");
  if (packet.revoked === true || packet.revocationStatus !== "active") blockers.push("packet revocation status must be active");
  if (packet.rollbackReady !== true) blockers.push("rollback readiness must be explicitly recorded");
  if (packet.rawPayloadRetained !== false || packet.providerPayloadRetained !== false) blockers.push("raw provider payload retention must be disabled");
  if (packet.retentionMode !== "metadata-only") blockers.push("local retention must be metadata-only");
  if (!Array.isArray(packet.sourceRefs) || packet.sourceRefs.length === 0 || packet.sourceRefs.length > 32 || packet.sourceRefs.some((ref) => !safeRef(ref))) {
    blockers.push("sourceRefs must be a bounded, non-sensitive reference allowlist");
  }
  if (!Number.isInteger(packet.contextBytes) || packet.contextBytes < 0 || packet.contextBytes > MAX_CONTEXT_BYTES) {
    blockers.push("contextBytes exceeds the 1 MiB private-evidence bound or is invalid");
  }
  if (!/^[a-f0-9]{64}$/i.test(text(packet.contextDigest)) || packet.contextDigestAlgorithm !== "sha256") blockers.push("contextDigest must be a SHA-256 reference for the bounded packet");
  if (!now) blockers.push("a valid current timestamp is required");
  const expiresAt = parseTimestamp(packet.expiresAt);
  if (!expiresAt || !now || expiresAt <= now || expiresAt.getTime() - now.getTime() > MAX_EXPIRY_MS) {
    blockers.push("expiresAt must be future-dated and no more than 24 hours ahead");
  }
  if (!safeTypedRef(packet.revocationRef, "revoke:", 160)) blockers.push("revocationRef is required");
  if (!safeTypedRef(packet.rollbackRef, "rollback:", 160)) blockers.push("rollbackRef is required");
  if (!Array.isArray(packet.destinationAllowlist) || packet.destinationAllowlist.length !== 1 || packet.destinationAllowlist[0] !== provider) {
    blockers.push("destinationAllowlist must name only the selected provider");
  }
  if (hasSensitiveMetadata(packet)) blockers.push("packet metadata contains forbidden sensitive or raw-content markers");

  if (provider === "claude") {
    if (routeRole !== "primary-review" || packet.fallbackUsed !== false) blockers.push("Claude private evidence must bind to the primary route");
    if (["endpoint", "model", "primaryFailure"].some((key) => Object.hasOwn(packet, key) && packet[key] !== undefined)) {
      blockers.push("Claude private evidence must not include Ollama destination or fallback metadata");
    }
    validateClaudeProof(packet.routeProof, blockers);
  } else if (provider === "ollama") {
    // Keep this downstream packet consumer in lockstep with the route policy:
    // source authority, enablement, and trusted-attestation holds are all
    // independently fail-closed. Checking the rendered disabled reason also
    // protects a future policy transition from silently skipping the final
    // attestation hold.
    if (routePolicyDefaults.localProviderAuthorityDisabledReason) {
      blockers.push(routePolicyDefaults.localProviderAuthorityDisabledReason);
    }
    if (routeRole !== "backup-review" || packet.fallbackUsed !== true || !isApprovedFallbackFailure(packet.primaryFailure)) blockers.push("Ollama private evidence requires an approved Claude fallback outcome");
    if (packet.endpoint !== routePolicyDefaults.ollamaEndpoint || packet.model !== routePolicyDefaults.ollamaModel) blockers.push("Ollama destination/model is outside the exact approved route");
    validateOllamaProof(packet.routeProof, blockers, routePolicyDefaults);
  }

  const eligible = blockers.length === 0;
  return {
    schemaVersion: 1,
    mode: "private-evidence-external-processing-policy",
    status: eligible ? "READY" : "HOLD",
    eligible,
    sendEligible: eligible,
    activationAllowed: false,
    provider,
    routeRole: routeRole || null,
    taskType: packet.taskType || null,
    sourceClass: packet.sourceClass || null,
    dataClassification: packet.dataClassification || null,
    scopeRef: safeRef(packet.scopeRef) ? text(packet.scopeRef) : null,
    authorityEvidenceRef: safeTypedRef(packet.authorityEvidenceRef, "authority:", 200) ? text(packet.authorityEvidenceRef) : null,
    boundaryVerificationRef: safeTypedRef(packet.boundaryVerificationRef, "verify:", 160) ? text(packet.boundaryVerificationRef) : null,
    redactionRef: safeTypedRef(packet.redactionRef, "redact:", 160) ? text(packet.redactionRef) : null,
    contextBytes: Number.isInteger(packet.contextBytes) ? packet.contextBytes : null,
    contextDigest: /^[a-f0-9]{64}$/i.test(text(packet.contextDigest)) ? text(packet.contextDigest).toLowerCase() : null,
    contextDigestAlgorithm: packet.contextDigestAlgorithm === "sha256" ? "sha256" : null,
    blockers: unique(blockers),
    boundaryExceptionVerified: packet.boundaryExceptionVerified === true,
    platformDisclosureVeto: packet.platformDisclosureVeto === true,
    platformDisclosureCleared: packet.platformDisclosureVeto === false,
    boundaryVerificationStatus: packet.boundaryVerificationStatus || null,
    redactionStatus: packet.redactionStatus || null,
    execution: {
      providerCall: false,
      sourceWrites: false,
      gitMutations: false,
      githubMutations: false,
      cleanup: false,
    },
    retention: {
      mode: "metadata-only",
      rawPayloadRetained: false,
      providerMemory: false,
      expiresAt: expiresAt?.toISOString() || null,
      revocationRef: safeId(packet.revocationRef, 160) ? text(packet.revocationRef) : null,
      rollbackRef: safeId(packet.rollbackRef, 160) ? text(packet.rollbackRef) : null,
      revocationStatus: packet.revocationStatus || null,
      rollbackReady: packet.rollbackReady === true,
    },
  };
}

function safeRef(value) {
  const ref = text(value);
  return Boolean(ref) && ref.length <= 240 && /^(?:work-item|evidence|artifact):[A-Za-z0-9._:-]+$/i.test(ref) && !SENSITIVE.test(ref) && !/[\u0000\r\n]/.test(ref);
}

function validateClaudeProof(proof, blockers) {
  rejectUnknownKeys(proof, ["model", "executable", "mode", "authenticated", "maxBudgetUsd", "allowedTools", "disallowedTools", "sourceScope", "metadataOnly", "rawPayloadRetained", "reviewPass", "activationAllowed"], blockers, "routeProof");
  if (!proof || proof.model !== "claude" || proof.executable !== "claude" || proof.mode !== "print" || proof.authenticated !== true || proof.maxBudgetUsd !== 1 || proof.sourceScope !== "named-evidence-only" || proof.metadataOnly !== true || proof.rawPayloadRetained !== false || proof.reviewPass !== false || proof.activationAllowed !== false || !isExactToolSet(proof.allowedTools, ["Read", "Grep", "Glob"]) || !isExactToolSet(proof.disallowedTools, ["Edit", "Write", "Bash", "WebFetch", "WebSearch"])) {
    blockers.push("Claude route proof is missing or outside the approved controls");
  }
}

function validateOllamaProof(proof, blockers, routePolicyDefaults) {
  rejectUnknownKeys(proof, ["endpoint", "model", "sourceVm", "connectTimeoutSeconds", "totalTimeoutSeconds", "localHostVerified", "localHostVerificationRef", "metadataOnly", "rawPayloadRetained", "publicExposure", "credentialsRead", "modelDiscovery", "endpointDiscovery", "reviewPass", "activationAllowed"], blockers, "routeProof");
  if (!proof || proof.endpoint !== routePolicyDefaults.ollamaEndpoint || proof.model !== routePolicyDefaults.ollamaModel || proof.sourceVm !== routePolicyDefaults.ollamaSourceVm || proof.connectTimeoutSeconds !== 2 || proof.totalTimeoutSeconds !== 120 || proof.localHostVerified !== true || !safeTypedRef(proof.localHostVerificationRef, "local-host:", 160) || proof.metadataOnly !== true || proof.rawPayloadRetained !== false || proof.publicExposure !== false || proof.credentialsRead !== false || proof.modelDiscovery !== false || proof.endpointDiscovery !== false || proof.reviewPass !== false || proof.activationAllowed !== false) {
    blockers.push("Ollama route proof is missing or outside the approved controls");
  }
}

function isExactToolSet(value, expected) {
  return Array.isArray(value) && value.length === expected.length && new Set(value).size === expected.length && expected.every((tool) => value.includes(tool));
}

function safeId(value, max) {
  const normalized = text(value);
  return Boolean(normalized) && normalized.length <= max && /^[A-Za-z0-9._:-]+$/.test(normalized) && !SENSITIVE.test(normalized);
}

function safeTypedRef(value, prefix, max) {
  const normalized = text(value);
  return normalized.length > prefix.length && normalized.startsWith(prefix) && safeId(normalized, max);
}

function safeText(value, max) {
  const normalized = text(value);
  return Boolean(normalized) && normalized.length <= max && !SENSITIVE.test(normalized);
}

function hasSensitiveMetadata(value, seen = new WeakSet(), depth = 0) {
  if (typeof value === "string") return SENSITIVE.test(value);
  if (!value || typeof value !== "object") return false;
  if (depth > 12 || seen.has(value)) return true;
  seen.add(value);
  return Object.entries(value).some(([key, nested]) => {
    const safeFalseControl = new Set(["rawPayloadRetained", "providerPayloadRetained", "providerMemory", "broadDump", "forbiddenClassesPresent", "credentialsRead", "publicExposure", "modelDiscovery", "endpointDiscovery"]).has(key) && nested === false;
    return (!safeFalseControl && SENSITIVE.test(key)) || hasSensitiveMetadata(nested, seen, depth + 1);
  });
}

function parseTimestamp(value) {
  const match = typeof value === "string" && value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/);
  if (!match) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const milliseconds = Number(match[7] || 0);
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === day
    && parsed.getUTCHours() === hour && parsed.getUTCMinutes() === minute && parsed.getUTCSeconds() === second && parsed.getUTCMilliseconds() === milliseconds
    ? parsed : null;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values) {
  return [...new Set(values)];
}

function rejectUnknownKeys(value, allowedKeys, blockers, label = "packet") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) blockers.push(`${label} metadata key is not allowed: ${key}`);
  }
}

export const PRIVATE_EVIDENCE_POLICY_DEFAULTS = Object.freeze({
  maxContextBytes: MAX_CONTEXT_BYTES,
  maxExpiryMs: MAX_EXPIRY_MS,
  allowedSourceClasses: [...ALLOWED_SOURCE_CLASSES],
  allowedProviders: [...ALLOWED_PROVIDERS],
});
