const DEFAULT_MAX_REVIEW_AGE_MS = 15 * 60 * 1000;

const FORBIDDEN_REVIEW_KEYS = new Set([
  "rawPrompt",
  "rawCompletion",
  "rawPayload",
  "rawWorkerTranscript",
  "unboundedLog",
  "prompt",
  "completion",
  "reasoningTrace",
  "providerPayload",
  "secret",
  "secrets",
  "credential",
  "credentials",
  "apiKey",
  "accessToken",
  "refreshToken",
  "bearerToken",
  "privateKey",
  "token",
  "password",
  "authorization",
  "bearer",
]);

const DEFAULT_STOP_LINES = [
  "report-only; no mutation, merge, or cleanup",
  "model PASS is evidence, not authority",
  "no provider or live-model calls",
  "no check, review-thread, or scope bypass",
];

const HIGH_RISK_OPERATION_PATTERN = /(?:^|[\s_:/-])(auth|security|secret|credential|provider|deploy|release|schema|migration|production|customer|external[-_ ]send|epic[-_ ]?25|epic[-_ ]?26|argon2id|force[-_ ]?push|history[-_ ]?rewrite)(?:$|[\s_:/-])/i;
const HIGH_RISK_OPERATION_COMPACT_PATTERN = /(?:^|[\s_:/-])(?:auth|security|secret|credential|provider|deploy|release|schema|migration|production|customer|external[-_ ]?send|argon2id|force[-_ ]?push|history[-_ ]?rewrite)(?:[0-9]+[a-z0-9]*|(?=$|[\s_:/-]))/i;
const HIGH_RISK_EPIC_OPERATION_PATTERN = /(?:^|[\s_:/-])epic[-_ ]?(?:25|26)[a-z0-9]*/i;
const HIGH_RISK_FILE_PATTERN = /(^|\/)(auth|security|secrets?|credentials?|migrations?|deploy|release|production|provider|openai)(\/|\.|$)|(^|\/)\.env(?:\.|$)|\.?(?:pem|key|p12|pfx|cer|der)$|(^|\/)\.github\/workflows(\/|$)|argon2id|epic[-_ ]?25|epic[-_ ]?26|api[-_ ]?key|password|token/i;
const SENSITIVE_METADATA_PATTERN = /raw\s*prompt|completion|reasoning|provider\s*payload|(?:api|access|refresh)?[_ -]?token|password|secret|credential/i;
const STOP_SEMANTIC_PATTERN = /\b(no|never|must\s+not|do\s+not|forbid|block|stop|without|disallow|prohibit|deny)\b/i;
import { isApprovedFallbackFailure } from "./review-gated-low-risk-route-policy.mjs";

/**
 * Evaluate a bounded review packet without executing the proposed operation.
 * This function deliberately returns eligibility evidence only. Callers must
 * not treat `eligible` as permission to mutate, deliver, merge, or clean up.
 */
export function evaluateReviewGatedLowRiskAutomation(input = {}, options = {}) {
  const maxReviewAgeMs = Number.isFinite(options.maxReviewAgeMs)
    ? options.maxReviewAgeMs
    : DEFAULT_MAX_REVIEW_AGE_MS;
  const review = input.review && typeof input.review === "object" ? input.review : {};
  const state = input.state && typeof input.state === "object" ? input.state : {};
  const authority = input.authority && typeof input.authority === "object" ? input.authority : {};
  const blockers = [];
  const satisfiedGates = [];
  const operation = text(input.operation);

  if (!operation) {
    blockers.push("operation is missing or not a string");
  }

  if (hasForbiddenReviewKey(input) || hasSensitiveMetadata(input)) {
    blockers.push("metadata contains forbidden raw payload, secret, or credential content");
  }

  if (hasForbiddenReviewKey(review) || hasSensitiveMetadata(review)) {
    blockers.push("review record contains forbidden raw payload or secret fields");
  } else {
    satisfiedGates.push("review record is metadata-only");
  }

  const status = normalizeStatus(review.status);
  if (status !== "PASS") {
    blockers.push(`review status is ${status || "missing"}; PASS is required`);
  } else {
    satisfiedGates.push("bounded review returned PASS");
  }

  if (!text(review.reviewId) || !text(review.packetId)) {
    blockers.push("review and packet evidence identifiers are missing");
  } else {
    satisfiedGates.push("review and packet evidence identifiers");
  }
  const model = text(review.model);
  const effort = text(review.effort).toLowerCase();
  const provider = text(review.provider).toLowerCase();
  const governedModel = isGovernedReviewModel(model, provider);
  const supportedEffort = /^(?:low|medium|high|xhigh)$/i.test(effort);
  if (!model || !effort) {
    blockers.push("governed review model and effort are missing");
  } else if (!governedModel || !supportedEffort) {
    blockers.push("review model or effort is outside the governed high-effort route");
  } else if ((model.toLowerCase() !== "5.6 luna" || effort !== "high") && (!text(review.routeRationale) || text(review.routeRationale).length > 300 || hasSensitiveMetadata(review.routeRationale))) {
    blockers.push("non-default review route or effort rationale is missing");
  } else {
    satisfiedGates.push("governed review model and effort recorded");
  }
  validateOrderedReviewRoute(review, blockers, satisfiedGates);

  const expected = {
    baseSha: text(state.baseSha),
    headSha: text(state.headSha),
    diffHash: text(state.diffHash),
    owner: text(state.owner),
    worktree: text(state.worktree),
  };
  const reviewed = {
    baseSha: text(review.baseSha),
    headSha: text(review.headSha),
    diffHash: text(review.diffHash),
    owner: text(review.owner),
    worktree: text(review.worktree),
  };
  for (const field of Object.keys(expected)) {
    if (!expected[field] || !reviewed[field]) {
      blockers.push(`exact ${field} binding is missing`);
    } else if (expected[field] !== reviewed[field]) {
      blockers.push(`${field} does not match the reviewed evidence`);
    } else {
      satisfiedGates.push(`exact ${field} binding`);
    }
  }

  const nowInput = options.now ?? input.now;
  const parsedNow = nowInput === undefined ? new Date() : parseTimestamp(nowInput);
  if (!parsedNow) {
    blockers.push("evaluation timestamp is missing or invalid");
  }
  const nowForComparison = parsedNow || new Date();
  const reviewedAt = parseTimestamp(review.reviewedAt);
  if (!reviewedAt) {
    blockers.push("review freshness timestamp is missing or invalid");
  } else if (reviewedAt > nowForComparison || nowForComparison - reviewedAt > maxReviewAgeMs) {
    blockers.push("review evidence is stale or timestamped in the future");
  } else {
    satisfiedGates.push("review evidence is fresh");
  }

  for (const [field, value] of Object.entries({
    changedFiles: state.changedFiles,
    allowlistedFiles: state.allowlistedFiles,
    disallowedFiles: state.disallowedFiles,
    highRiskExclusions: state.highRiskExclusions,
  })) {
    if ((field === "changedFiles" || field === "allowlistedFiles" || value !== undefined) && !isValidStringList(value)) {
      blockers.push(`${field} list is malformed`);
    }
  }
  const changedFiles = normalizeStringList(state.changedFiles);
  const allowlistedFiles = normalizeStringList(state.allowlistedFiles);
  const disallowedFiles = normalizeStringList([
    ...normalizeStringList(state.disallowedFiles),
    ...normalizeStringList(state.highRiskExclusions),
    ...changedFiles.filter((file) => HIGH_RISK_FILE_PATTERN.test(file.replaceAll("\\", "/"))),
  ]);
  if (!changedFiles.length || !allowlistedFiles.length || !sameSet(changedFiles, allowlistedFiles)) {
    blockers.push("changed files are not exactly covered by the allowlist");
  } else if (disallowedFiles.length) {
    blockers.push(`high-risk or disallowed files are present: ${disallowedFiles.join(", ")}`);
  } else {
    satisfiedGates.push("changed files are exactly allowlisted");
  }
  if ([...changedFiles, ...allowlistedFiles].some((file) => !isSafeRelativePath(file))) {
    blockers.push("changed or allowlisted file path is not a safe managed-worktree-relative path");
  }

  checkBoundEvidenceGate(state, "exactHead", "exact base/head state", expected.headSha, nowForComparison, maxReviewAgeMs, blockers, satisfiedGates);
  checkBoundEvidenceGate(state, "statusChecks", "status checks passed", expected.headSha, nowForComparison, maxReviewAgeMs, blockers, satisfiedGates);
  checkBoundEvidenceGate(state, "reviewThreads", "review threads resolved", expected.headSha, nowForComparison, maxReviewAgeMs, blockers, satisfiedGates);
  checkBoundEvidenceGate(state, "rollback", "rollback path recorded", expected.headSha, nowForComparison, maxReviewAgeMs, blockers, satisfiedGates);
  checkBooleanGate(authority.recorded, "authority decision recorded", blockers, satisfiedGates);
  checkBooleanGate(authority.scopeAllowed, "operation is within approved scope", blockers, satisfiedGates);
  checkNonEmptyGate(authority.decision, "authority decision", blockers, satisfiedGates);
  if (!/^approved[-_ ]for[-_ ]report[-_ ]only[-_ ]evaluation$/i.test(text(authority.decision))) {
    blockers.push("authority decision is not the report-only decision schema");
  }
  checkBoundEvidence(authority, "authority decision", expected.headSha, nowForComparison, maxReviewAgeMs, blockers, satisfiedGates);
  checkStopLines(authority.stopLines, blockers, satisfiedGates);
  checkRecoveryPath(authority.recoveryPath, blockers, satisfiedGates);

  const retryCount = input.retryCount ?? review.retryCount ?? 0;
  if (!Number.isInteger(retryCount) || retryCount < 0) {
    blockers.push("review retry count is malformed");
  } else if (retryCount > 0) {
    blockers.push("duplicate review retry is not allowed in report-only slice");
  } else {
    satisfiedGates.push("review attempt is unique");
  }

  const normalizedOperation = normalizeOperationForRisk(operation);
  if (HIGH_RISK_OPERATION_PATTERN.test(normalizedOperation) || HIGH_RISK_OPERATION_COMPACT_PATTERN.test(normalizedOperation) || HIGH_RISK_EPIC_OPERATION_PATTERN.test(normalizedOperation)) {
    blockers.push("operation is an excluded high-risk class");
  } else if (/^cleanup(?:[\s-]|$)/.test(normalizedOperation) && state.cleanupWithinNamedLane !== true) {
    blockers.push("cleanup is outside the named managed lane");
  } else {
    satisfiedGates.push("operation remains within named lane or is not cleanup");
  }

  const safeBlockers = unique(blockers).map(redactBlocker);
  const eligible = safeBlockers.length === 0;
  const stopLines = redactStringList(normalizeStringList(authority.stopLines)).length
    ? redactStringList(normalizeStringList(authority.stopLines))
    : DEFAULT_STOP_LINES;
  const recoveryPath = redactSensitiveText(text(authority.recoveryPath) || "Preserve this packet, fix the blocker, refresh exact-state evidence, and rerun report-only evaluation.");
  const authorityFamily = redactSensitiveText(text(input.authorityFamily) || "source-governance/review-gated-low-risk-automation");

  return {
    schemaVersion: 1,
    mode: "report-only",
    status: eligible ? "eligible" : "hold",
    eligible,
    operation: redactSensitiveText(operation),
    authorityFamily,
    review: {
      status: status || "missing",
      reviewId: redactSensitiveText(text(review.reviewId)),
      packetId: redactSensitiveText(text(review.packetId)),
      model: redactSensitiveText(text(review.model)),
      effort: redactSensitiveText(text(review.effort)),
      reviewedAt: reviewedAt ? reviewedAt.toISOString() : null,
    },
    binding: {
      baseSha: redactSensitiveText(expected.baseSha),
      headSha: redactSensitiveText(expected.headSha),
      diffHash: redactSensitiveText(expected.diffHash),
      owner: redactSensitiveText(expected.owner),
      worktree: redactSensitiveText(expected.worktree),
      changedFiles: redactStringList(changedFiles),
      allowlistedFiles: redactStringList(allowlistedFiles),
    },
    blockers: safeBlockers,
    requiredGates: [
      "bounded review PASS",
      "exact base/head/diff/owner/worktree binding",
      "fresh evidence",
      "exact changed-file allowlist with no high-risk exclusions",
      "status checks passed",
      "review threads resolved",
      "rollback and authority evidence recorded",
      "unique review attempt",
      "named-lane cleanup scope",
    ],
    satisfiedGates: unique(satisfiedGates),
    stopLines,
    recoveryPath,
    authorityDecision: {
      operation,
      authorityFamily,
      decision: eligible ? "eligible-report-only" : "hold",
      allowed: false,
      blockedReasons: safeBlockers,
      stopLines,
      recoveryPath,
      metadataOnly: true,
    },
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function isGovernedReviewModel(model, provider = "") {
  if (provider === "claude") return model.toLowerCase() === "claude";
  if (provider === "ollama") return model.toLowerCase() === "qwen3:14b";
  return /^(?:gpt[- ]?5\.6(?:[- ][a-z0-9._-]+)?|gpt-5\.3-codex-spark|5\.6 luna)$/i.test(model);
}

function validateOrderedReviewRoute(review, blockers, satisfiedGates) {
  const provider = text(review.provider).toLowerCase();
  const role = text(review.routeRole).toLowerCase();
  if ((provider === "claude" || provider === "ollama") && review.routeValidated !== true) {
    blockers.push("provider review evidence lacks a validated ordered route packet");
    return;
  }
  if ((provider === "claude" || provider === "ollama") && review.privateEvidencePacketValidated !== true) {
    blockers.push("provider review evidence lacks a validated private-evidence packet");
    return;
  }
  if (provider === "claude") {
    if (role !== "primary-review" || review.fallbackUsed === true) blockers.push("Claude review evidence is not bound to the primary route");
    else satisfiedGates.push("Claude review evidence is bound to the primary route");
  } else if (provider === "ollama") {
    if (role !== "backup-review" || review.fallbackUsed !== true || !isApprovedFallbackFailure(review.primaryFailure)) {
      blockers.push("Ollama review evidence lacks approved Claude-failure fallback binding");
    } else {
      satisfiedGates.push("Ollama review evidence is bound to the approved fallback route");
    }
  } else if (provider && provider !== "codex") {
    blockers.push("review provider is not on the governed provider allowlist");
  }
}

function checkBooleanGate(value, label, blockers, satisfiedGates) {
  if (value === true) {
    satisfiedGates.push(label);
  } else {
    blockers.push(`${label} gate is missing or failed`);
  }
}

function checkBoundEvidenceGate(state, field, label, expectedHead, now, maxAgeMs, blockers, satisfiedGates) {
  if (state[field] !== true) {
    blockers.push(`${label} gate is missing or failed`);
    return;
  }
  const evidence = state.evidence && typeof state.evidence === "object" ? state.evidence[field] : null;
  if (!evidence || typeof evidence !== "object") {
    blockers.push(`${label} evidence is missing`);
    return;
  }
  if (text(evidence.headSha) !== expectedHead) {
    blockers.push(`${label} evidence head does not match exact head`);
  }
  const checkedAt = parseTimestamp(evidence.checkedAt);
  if (!checkedAt || checkedAt > now || now - checkedAt > maxAgeMs) {
    blockers.push(`${label} evidence is stale or invalid`);
  }
  if (!text(evidence.ref)) {
    blockers.push(`${label} evidence reference is missing`);
  }
  if (field === "rollback" && !/^(?:revert|restore|rollback|abandon(?:-unmerged)?):[^\s]+$/i.test(text(state.rollbackPath))) {
    blockers.push("rollback path reference is missing");
  }
  if (text(evidence.headSha) === expectedHead && checkedAt && checkedAt <= now && now - checkedAt <= maxAgeMs && text(evidence.ref) && (field !== "rollback" || /^(?:revert|restore|rollback|abandon(?:-unmerged)?):[^\s]+$/i.test(text(state.rollbackPath)))) {
    satisfiedGates.push(`${label} evidence is exact and fresh`);
  }
}

function checkBoundEvidence(container, label, expectedHead, now, maxAgeMs, blockers, satisfiedGates) {
  const evidence = container.evidence && typeof container.evidence === "object" ? container.evidence : null;
  if (!evidence || text(evidence.headSha) !== expectedHead) {
    blockers.push(`${label} evidence head reference is missing or mismatched`);
    return;
  }
  const checkedAt = parseTimestamp(evidence.checkedAt);
  if (!checkedAt || checkedAt > now || now - checkedAt > maxAgeMs) {
    blockers.push(`${label} evidence is stale or invalid`);
  }
  if (!text(evidence.ref)) {
    blockers.push(`${label} evidence reference is missing`);
  }
  if (checkedAt && checkedAt <= now && now - checkedAt <= maxAgeMs && text(evidence.ref)) {
    satisfiedGates.push(`${label} evidence is exact and fresh`);
  }
}

function checkStopLines(value, blockers, satisfiedGates) {
  if (!isValidStringList(value) || !value.length) {
    blockers.push("authority stop lines are missing or malformed");
    return;
  }
  const lines = normalizeStringList(value);
  const requirements = [
    [/mutation|merge|cleanup/i, "mutation stop line"],
    [/provider|live[- ]model/i, "provider stop line"],
    [/bypass|override/i, "bypass stop line"],
  ];
  for (const [pattern, label] of requirements) {
    if (!lines.some((line) => isCanonicalDenyStopLine(line, pattern))) blockers.push(`${label} is missing`);
  }
  if (lines.every((line) => line.length <= 240)
    && requirements.every(([pattern]) => lines.some((line) => isCanonicalDenyStopLine(line, pattern)))) {
    satisfiedGates.push("authority stop lines recorded");
  }
}

function checkRecoveryPath(value, blockers, satisfiedGates) {
  const recovery = text(value);
  if (!recovery || recovery.length > 300 || hasSensitiveMetadata(recovery) || !/preserve|fix|rerun|request|inspect/i.test(recovery) || /delete|provider|merge|cleanup|mutation|run\s+command|execute|shell|spawn|worker|push|commit|write|apply|patch|network|https?|git|curl|scp|chmod|\b(?:mv|cp|rm)\b/i.test(recovery)) {
    blockers.push("authority recovery path is missing, oversized, or unsafe");
  } else {
    satisfiedGates.push("authority recovery path recorded");
  }
}

function isCanonicalDenyStopLine(line, actionPattern) {
  const normalized = text(line);
  if (!actionPattern.test(normalized) || !STOP_SEMANTIC_PATTERN.test(normalized)) return false;
  return !/\b(?:allow|allowed|permit|permitted|okay|ok|fine|is\s+safe|do\s+not\s+(?:block|stop|forbid|prohibit|deny|disallow))\b/i.test(normalized);
}

function checkNonEmptyGate(value, label, blockers, satisfiedGates) {
  if (text(value)) {
    satisfiedGates.push(`${label} recorded`);
  } else {
    blockers.push(`${label} is missing`);
  }
}

function checkNonEmptyListGate(value, label, blockers, satisfiedGates) {
  if (normalizeStringList(value).length) {
    satisfiedGates.push(`${label} recorded`);
  } else {
    blockers.push(`${label} are missing`);
  }
}

function hasForbiddenReviewKey(value) {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, nested]) => {
    const normalizedKey = key.replace(/[_-]/g, "").toLowerCase();
    return [...FORBIDDEN_REVIEW_KEYS].some((forbidden) => forbidden.replace(/[_-]/g, "").toLowerCase() === normalizedKey)
      || (nested && typeof nested === "object" && hasForbiddenReviewKey(nested));
  });
}

function hasSensitiveMetadata(value) {
  if (typeof value === "string") return SENSITIVE_METADATA_PATTERN.test(value);
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some((nested) => hasSensitiveMetadata(nested));
}

function normalizeStatus(value) {
  return text(value).toUpperCase();
}

function normalizeStringList(value) {
  return unique(Array.isArray(value) ? value.map(text).filter(Boolean) : []);
}

function isValidStringList(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string" && Boolean(entry.trim()));
}

function isSafeRelativePath(value) {
  const normalized = text(value).replaceAll("\\", "/");
  return Boolean(normalized)
    && !normalized.startsWith("/")
    && !normalized.split("/").includes("..")
    && !/[\u0000-\u001f\u007f]/.test(normalized)
    && !/^[A-Za-z]:\//.test(normalized);
}

function sameSet(left, right) {
  return left.length === right.length && left.every((value) => right.includes(value));
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

function redactSensitiveText(value) {
  const normalized = text(value);
  return normalized && SENSITIVE_METADATA_PATTERN.test(normalized) ? "[redacted]" : normalized || null;
}

function redactBlocker(value) {
  const normalized = text(value);
  if (/metadata contains forbidden|review record contains forbidden|recovery path is missing|authority recovery path/i.test(normalized)) return normalized;
  return redactSensitiveText(normalized);
}

function redactStringList(values) {
  return normalizeStringList(values).map(redactSensitiveText).filter(Boolean);
}

function normalizeOperationForRisk(value) {
  return text(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .toLowerCase();
}

export const REVIEW_GATED_LOW_RISK_DEFAULTS = Object.freeze({
  maxReviewAgeMs: DEFAULT_MAX_REVIEW_AGE_MS,
  mode: "report-only",
});
