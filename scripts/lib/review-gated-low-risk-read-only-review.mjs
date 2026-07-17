import { evaluateReviewGatedLowRiskAutomation } from "./review-gated-low-risk-automation.mjs";

const GOVERNED_MODELS = new Set(["5.6 luna", "gpt-5.3-codex-spark"]);
const RESULT_STATUSES = new Set(["PASS", "CONCERNS", "BLOCKED"]);
const FORBIDDEN_KEYS = /raw|payload|prompt|completion|reasoning|secret|credential|token|password|provider.?call|live.?model.?call/i;
const SENSITIVE_TEXT = /raw\s*prompt|raw\s*completion|reasoning\s*trace|provider\s*payload|(?:api|access|refresh)?[_ -]?token|password|secret|credential/i;

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
  const model = text(route.model).toLowerCase();
  const effort = text(route.effort).toLowerCase();
  if (!GOVERNED_MODELS.has(model) || effort !== "high") {
    blockers.push("review route model or effort is not governed");
  }
  if (model !== "5.6 luna" && (!text(route.rationale) || text(route.rationale).length > 300)) {
    blockers.push("non-default review route rationale is missing or oversized");
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
    if (FORBIDDEN_KEYS.test(key)) findings.push(`${path}.${key}`);
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
