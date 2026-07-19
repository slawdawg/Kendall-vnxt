import { evaluateReviewGatedLowRiskAutomation } from "./review-gated-low-risk-automation.mjs";
import { evaluateBoundedReviewRoute, isApprovedFallbackFailure } from "./review-gated-low-risk-route-policy.mjs";
import { evaluatePrivateEvidencePacket } from "./private-evidence-packet-policy.mjs";

const RESULT_STATUSES = new Set(["PASS", "CONCERNS", "BLOCKED"]);
const FORBIDDEN_KEYS = /raw|payload|prompt|completion|reasoning|secret|credential|token|password|provider.?call|live.?model.?call/i;
const SENSITIVE_TEXT = /raw\s*prompt|raw\s*completion|reasoning\s*trace|provider\s*payload|(?:api|access|refresh)?[_ -]?token|password|secret|credential/i;
const SAFE_FALSE_ROUTE_CONTROLS = new Set(["rawPayloadRetained", "providerPayloadRetained", "credentialsRead", "providerMemory", "broadDump", "forbiddenClassesPresent", "publicExposure", "modelDiscovery", "endpointDiscovery"]);

/**
 * Validate an already-produced review result through the governed route.
 * This adapter consumes metadata/result summaries only; it never calls a
 * provider or live model and never grants execution authority.
 */
export function evaluateGovernedReadOnlyReview(input = {}, options = {}) {
  const source = input && typeof input === "object" ? input : {};
  const opts = options && typeof options === "object" ? options : {};
  const route = source.route && typeof source.route === "object" ? source.route : {};
  const result = source.result && typeof source.result === "object" ? source.result : {};
  const reviewRecord = source.reviewRecord && typeof source.reviewRecord === "object" ? source.reviewRecord : {};
  const blockers = [];

  if (findForbiddenMetadata(source).length) {
    blockers.push("review/source packet contains forbidden raw payload or secret metadata");
  }
  if (hasSensitiveText(result.summary) || hasSensitiveText(result.resultId) || hasSensitiveText(route.rationale) || hasSensitiveText(source.sourcePacket)) {
    blockers.push("review/source summary contains forbidden raw payload or secret text");
  }
  if (text(result.summary).length > 500 || text(route.rationale).length > 300 || text(result.resultId).length > 120) {
    blockers.push("review result metadata exceeds bounded length");
  }
  if (findExecutionAttempts(source).length) {
    blockers.push("provider/live-model execution attempt rejected");
  }
  if (route.available !== true || route.mode !== "metadata-only") {
    blockers.push("governed read-only route is unavailable or not metadata-only");
  }
  const routeValidationStart = blockers.length;
  validateOrderedRoute(route, blockers);
  const provider = text(route.provider).toLowerCase();
  let privateEvidencePacketValidated = false;
  if (provider === "claude" || provider === "ollama") {
    const packetGate = evaluatePrivateEvidencePacket(source.privateEvidencePacket, { now: opts.now ?? source.now });
    privateEvidencePacketValidated = packetGate.eligible;
    if (!packetGate.eligible) blockers.push(...packetGate.blockers.map((blocker) => `private evidence packet: ${blocker}`));
  }
  const routeValidated = blockers.length === routeValidationStart;
  const model = text(route.model).toLowerCase();
  const effort = text(route.effort).toLowerCase();
  if (!isGovernedModel(model, text(route.provider).toLowerCase()) || !isSupportedEffort(effort)) {
    blockers.push("review route model or effort is not governed");
  }
  if ((model !== "5.6 luna" || effort !== "high") && (!text(route.rationale) || text(route.rationale).length > 300)) {
    blockers.push("non-default review route or effort rationale is missing or oversized");
  }
  const resultStatus = text(result.status).toUpperCase();
  if (!RESULT_STATUSES.has(resultStatus)) {
    blockers.push("review result is unavailable or ambiguous");
  }
  for (const flag of ["timeout", "unavailable", "ambiguous", "contradictory"]) {
    if (result[flag] !== undefined && typeof result[flag] !== "boolean") {
      blockers.push(`review result ${flag} flag is malformed`);
    } else if (result[flag] === true) {
      blockers.push("review result is unavailable, timed out, ambiguous, or contradictory");
    }
  }
  if (result.error || result.failure) {
    blockers.push("review result contains an error or failure state");
  }
  if (text(reviewRecord.status) && text(reviewRecord.status).toUpperCase() !== resultStatus) {
    blockers.push("review record and result statuses contradict");
  }
  if (text(reviewRecord.model) && text(route.model) && text(reviewRecord.model).toLowerCase() !== text(route.model).toLowerCase()) {
    blockers.push("review record and route models contradict");
  }
  if (text(reviewRecord.effort) && text(route.effort) && text(reviewRecord.effort).toLowerCase() !== text(route.effort).toLowerCase()) {
    blockers.push("review record and route efforts contradict");
  }
  if (text(reviewRecord.routeRationale) && text(route.rationale) && text(reviewRecord.routeRationale) !== text(route.rationale)) {
    blockers.push("review record and route rationales contradict");
  }
  if (text(reviewRecord.reviewedAt) && text(result.reviewedAt) && text(reviewRecord.reviewedAt) !== text(result.reviewedAt)) {
    blockers.push("review record and result timestamps contradict");
  }
  if (!text(result.summary)) {
    blockers.push("review result summary is missing");
  }
  if (!text(result.resultId)) {
    blockers.push("review result identifier is missing");
  }
  if (!text(result.reviewedAt)) {
    blockers.push("review result timestamp is missing");
  }

  const now = opts.now ?? source.now;
  const review = {
    ...reviewRecord,
    status: resultStatus,
    provider: route.provider,
    routeRole: route.role,
    fallbackUsed: route.fallbackUsed,
    primaryFailure: route.primaryFailure,
    routeValidated,
    privateEvidencePacketValidated,
    model: route.model,
    effort: route.effort,
    routeRationale: route.rationale,
    reviewedAt: result.reviewedAt,
  };
  const evaluation = evaluateReviewGatedLowRiskAutomation({
    operation: source.operation,
    review,
    state: source.state,
    authority: source.authority,
    retryCount: source.retryCount,
  }, { now });
  const allBlockers = unique([...evaluation.blockers, ...blockers]);
  const status = allBlockers.length ? "hold" : evaluation.status;

  return {
    ...evaluation,
    schemaVersion: 1,
    mode: "governed-read-only-review",
    status,
    eligible: status === "eligible",
    blockers: allBlockers,
    reviewIntegration: {
      route: {
        available: route.available === true,
        mode: text(route.mode) || null,
        provider: safeMetadataText(route.provider, 80),
        role: safeMetadataText(route.role, 80),
        fallbackUsed: route.fallbackUsed === true,
        primaryFailure: safeMetadataText(route.primaryFailure, 40),
        validated: routeValidated,
        privateEvidencePacketValidated,
        endpoint: safeMetadataText(route.endpoint, 160),
        sourceVm: safeMetadataText(route.sourceVm, 80),
        connectTimeoutSeconds: Number.isFinite(route.connectTimeoutSeconds) ? route.connectTimeoutSeconds : null,
        totalTimeoutSeconds: Number.isFinite(route.totalTimeoutSeconds) ? route.totalTimeoutSeconds : null,
        executable: safeMetadataText(route.executable, 80),
        cliMode: safeMetadataText(route.cliMode, 40),
        authenticated: route.authenticated === true,
        maxBudgetUsd: Number.isFinite(route.maxBudgetUsd) ? route.maxBudgetUsd : null,
        allowedTools: Array.isArray(route.allowedTools) ? route.allowedTools.map((tool) => safeMetadataText(tool, 40)).filter(Boolean) : [],
        disallowedTools: Array.isArray(route.disallowedTools) ? route.disallowedTools.map((tool) => safeMetadataText(tool, 40)).filter(Boolean) : [],
        sourceScope: safeMetadataText(route.sourceScope, 80),
        model: safeMetadataText(route.model, 120),
        effort: safeMetadataText(route.effort, 40),
        rationale: safeMetadataText(route.rationale, 300),
      },
      result: {
        status: resultStatus || "missing",
        resultId: safeMetadataText(result.resultId, 120),
        summary: safeMetadataText(result.summary, 500),
        reviewedAt: parseTimestamp(result.reviewedAt)?.toISOString() || null,
      },
      providerCalls: false,
      liveModelCalls: false,
      rawPayloadRetained: false,
    },
    authorityDecision: {
      ...evaluation.authorityDecision,
      decision: status === "eligible" ? "eligible-governed-read-only-report" : "hold",
      allowed: false,
      blockedReasons: allBlockers,
      metadataOnly: true,
    },
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function findForbiddenMetadata(value, path = "input") {
  if (!value || typeof value !== "object") return [];
  const findings = [];
  for (const [key, nested] of Object.entries(value)) {
    if (nested !== undefined && !(SAFE_FALSE_ROUTE_CONTROLS.has(key) && nested === false) && FORBIDDEN_KEYS.test(key)) findings.push(`${path}.${key}`);
    if (nested && typeof nested === "object") findings.push(...findForbiddenMetadata(nested, `${path}.${key}`));
  }
  return findings;
}

function findExecutionAttempts(value, path = "input") {
  if (!value || typeof value !== "object") return [];
  const findings = [];
  for (const [key, nested] of Object.entries(value)) {
    const evidenceKey = ["cleanupWithinNamedLane"].includes(key);
    if (!evidenceKey && /provider.?call|live.?model.?call|execute|spawn|worker.?launch|worker.?process|github.?mutation|git.?push|command|shell|network|http|write|delete|remove|prune|destroy|merge|cleanup|mutat/i.test(key)
      && nested !== false && nested !== null && nested !== "none" && nested !== "") {
      findings.push(`${path}.${key}`);
    }
    if (nested && typeof nested === "object") findings.push(...findExecutionAttempts(nested, `${path}.${key}`));
  }
  return findings;
}

function hasSensitiveText(value) {
  if (typeof value === "string") return SENSITIVE_TEXT.test(value);
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some((nested) => hasSensitiveText(nested));
}

function safeMetadataText(value, maxLength) {
  const normalized = text(value);
  if (!normalized || normalized.length > maxLength || hasSensitiveText(normalized)) return null;
  return normalized;
}

function isGovernedModel(model, provider = "") {
  if (provider === "claude") return model === "claude";
  if (provider === "ollama") return model === "qwen3:14b";
  return /^(?:gpt[- ]?5\.6(?:[- ][a-z0-9._-]+)?|gpt-5\.3-codex-spark|5\.6 luna)$/i.test(model);
}

function validateOrderedRoute(route, blockers) {
  const provider = text(route.provider).toLowerCase();
  const role = text(route.role).toLowerCase();
  if (provider === "claude") {
    const policy = evaluateBoundedReviewRoute({
      role: "primary-review", provider, model: route.model, executable: route.executable, mode: route.cliMode || route.mode,
      authenticated: route.authenticated, maxBudgetUsd: route.maxBudgetUsd, allowedTools: route.allowedTools,
      disallowedTools: route.disallowedTools, metadataOnly: route.metadataOnly, rawPayloadRetained: route.rawPayloadRetained,
      sourceScope: route.sourceScope, activationAllowed: route.activationAllowed, reviewPass: route.reviewPass,
      fallbackUsed: route.fallbackUsed, primaryFailure: route.primaryFailure,
    });
    if (role !== "primary-review" || route.fallbackUsed === true || !policy.eligible) {
      blockers.push("Claude must be selected as the primary review route");
      blockers.push(...policy.blockers);
    }
  } else if (provider === "ollama") {
    const policy = evaluateBoundedReviewRoute({
      role: "backup-review", provider, endpoint: route.endpoint, model: route.model, sourceVm: route.sourceVm,
      connectTimeoutSeconds: route.connectTimeoutSeconds, totalTimeoutSeconds: route.totalTimeoutSeconds,
      metadataOnly: route.metadataOnly, rawPayloadRetained: route.rawPayloadRetained, publicExposure: route.publicExposure,
      credentialsRead: route.credentialsRead, modelDiscovery: route.modelDiscovery, endpointDiscovery: route.endpointDiscovery,
      reviewPass: route.reviewPass, activationAllowed: route.activationAllowed, fallbackUsed: route.fallbackUsed,
      primaryFailure: route.primaryFailure,
    });
    if (role !== "backup-review" || route.fallbackUsed !== true || !isApprovedFallbackFailure(route.primaryFailure) || !policy.eligible) {
      blockers.push("Ollama is eligible only as the ordered backup after an approved Claude failure");
      blockers.push(...policy.blockers);
    }
  } else if (provider || role || /^(?:claude|qwen3:14b)$/i.test(text(route.model))) {
    blockers.push("ordered review route provider is unknown or missing");
  }
}

function isSupportedEffort(effort) {
  return /^(?:low|medium|high|xhigh)$/i.test(effort);
}

function parseTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values) {
  return [...new Set(values)];
}
