import { evaluateReviewGatedLowRiskAutomation } from "./review-gated-low-risk-automation.mjs";
import { evaluateGovernedReadOnlyReview } from "./review-gated-low-risk-read-only-review.mjs";

const ALLOWED_WRITE_OPERATIONS = new Set(["write", "write-file", "update-file", "patch"]);
const ALLOWED_WRITE_PLAN_KEYS = new Set(["files", "operations", "rollbackPath"]);
const HIGH_RISK_FILE_PATTERN = /(^|\/)(\.env(?:\.|$)|.*(?:secret|credential|token|password).*|\.git(?:\/|$)|node_modules(?:\/|$))/i;
const FORBIDDEN_ACTION_KEY = /provider|live.?model|shell|command|spawn|worker|network|http|git.?push|git.?commit|git.?merge|cleanup|delete|remove|destroy|prune|execute|mutat|dispatch/i;
const FORBIDDEN_ACTION_VALUE = /(?:\b(?:provider(?:\s+call)?|live[- ]model|shell|command|spawn|worker(?:\s+launch)?|network|https?|ssh|ftp|git(?:hub)?\s+(?:push|commit|merge|checkout|reset)|cleanup|delete|remove|destroy|prune|execute|mutat(?:e|ing|ion)|dispatch|scp|curl|chmod|mv|cp)\b|\brm\s+-rf\b|\bnpm\s+publish\b|(?:https?|ssh|ftp):\/\/)/i;
const SENSITIVE_METADATA = /raw\s*prompt|raw\s*completion|reasoning\s*trace|provider\s*payload|(?:api|access|refresh)?[_ -]?token|password|secret|credential/i;
const MAX_CHECKPOINT_AGE_MS = 15 * 60 * 1000;

/**
 * Build a bounded-write plan without executing it. All source, review,
 * workspace, and authority evidence is evaluated before a human checkpoint
 * can mark the plan ready. This module has no filesystem, Git, provider, or
 * worker mutation path.
 */
export function evaluateBoundedWritePlan(input = {}, options = {}) {
  const source = input && typeof input === "object" ? input : {};
  const opts = options && typeof options === "object" ? options : {};
  const now = opts.now ?? source.now;
  const reviewInput = source.readOnlyReviewInput && typeof source.readOnlyReviewInput === "object"
    ? source.readOnlyReviewInput
    : {
        operation: source.operation,
        reviewRecord: source.reviewRecord || source.review,
        state: source.state,
        authority: source.authority,
        route: source.route,
        result: source.result,
        sourcePacket: source.sourcePacket,
        now,
      };
  const readOnlyReview = evaluateGovernedReadOnlyReview(reviewInput, { now });
  const reviewRecord = reviewInput.reviewRecord && typeof reviewInput.reviewRecord === "object"
    ? reviewInput.reviewRecord
    : {};
  const state = reviewInput.state && typeof reviewInput.state === "object" ? reviewInput.state : {};
  const authority = reviewInput.authority && typeof reviewInput.authority === "object" ? reviewInput.authority : {};
  const writeAuthority = source.writeAuthority && typeof source.writeAuthority === "object"
    ? source.writeAuthority
    : {};
  const activation = source.activationCheckpoint && typeof source.activationCheckpoint === "object"
    ? source.activationCheckpoint
    : {};
  const requestedPlan = source.writePlan && typeof source.writePlan === "object" ? source.writePlan : {};
  const blockers = [...readOnlyReview.blockers];

  const deterministic = evaluateReviewGatedLowRiskAutomation({
    operation: reviewInput.operation,
    review: reviewRecord,
    state,
    authority,
    retryCount: reviewInput.retryCount,
  }, { now });
  blockers.push(...deterministic.blockers);

  validateWriteAuthority({ ...writeAuthority, now }, state, blockers);
  validateActivation(activation, state, now, blockers);
  validateWritePlan(requestedPlan, state, blockers);

  const uniqueBlockers = unique(blockers);
  const activationApproved = activation.approved === true;
  const status = uniqueBlockers.length ? "hold" : activationApproved ? "ready" : "hold";
  const targetFiles = normalizeStringList(requestedPlan.files);
  const operations = normalizeStringList(requestedPlan.operations);

  return {
    schemaVersion: 1,
    mode: "bounded-write-plan",
    status,
    eligible: status === "ready",
    blockers: uniqueBlockers,
    review: {
      status: readOnlyReview.reviewIntegration.result.status,
      governed: readOnlyReview.status === "eligible",
      metadataOnly: true,
    },
    deterministicGates: {
      status: deterministic.status,
      exactState: deterministic.status === "eligible" && deterministic.satisfiedGates.some((gate) => gate.includes("exact base/head/diff/owner/worktree binding")),
      allowlist: deterministic.status === "eligible" && deterministic.satisfiedGates.some((gate) => gate.includes("exact changed-file allowlist")),
      checks: deterministic.status === "eligible" && deterministic.satisfiedGates.some((gate) => gate.includes("status checks passed")),
      reviewThreads: deterministic.status === "eligible" && deterministic.satisfiedGates.some((gate) => gate.includes("review threads resolved")),
      rollback: deterministic.status === "eligible" && deterministic.satisfiedGates.some((gate) => gate.includes("rollback and authority evidence")),
    },
    writeAuthority: {
      recorded: writeAuthority.recorded === true,
      decision: text(writeAuthority.decision) || null,
      scopeAllowed: writeAuthority.scopeAllowed === true,
      owner: text(writeAuthority.owner) || null,
      worktree: text(writeAuthority.worktree) || null,
      allowed: writeAuthority.allowed === true,
    },
    activationCheckpoint: {
      required: true,
      type: text(activation.type) || "human",
      approved: activationApproved,
      approvedBy: safeText(activation.approvedBy, 120),
      approvedAt: parseTimestamp(activation.approvedAt)?.toISOString() || null,
      exactHead: activation.exactHead === true,
    },
    writePlan: {
      mode: "metadata-only",
      applyEligible: status === "ready",
      files: targetFiles,
      operations,
      rollbackPath: safeText(state.rollbackPath, 300),
      owner: text(state.owner) || null,
      worktree: text(state.worktree) || null,
      commandsExecuted: false,
      filesystemWrites: false,
      gitMutations: false,
      providerCalls: false,
      workerLaunch: false,
    },
    authorityDecision: {
      decision: status === "ready" ? "ready-bounded-write-plan" : "hold",
      allowed: false,
      blockedReasons: uniqueBlockers,
      metadataOnly: true,
      humanActivationRequired: true,
    },
    execution: {
      attempted: false,
      applied: false,
      mutation: "none",
      providerCalls: false,
      liveModelCalls: false,
      filesystemWrites: false,
      gitMutations: false,
      workerLaunch: false,
    },
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

/**
 * Exercise the bounded-write contract with a deterministic fake executor.
 * It reports whether an apply would be permitted but never applies anything.
 */
export function runBoundedWriteFakeExecutor(input = {}, options = {}) {
  const plan = evaluateBoundedWritePlan(input, options);
  const wouldApply = plan.status === "ready" && plan.writePlan.applyEligible === true;
  return {
    ...plan,
    fakeExecutor: {
      mode: "metadata-only-fake",
      invoked: true,
      wouldApply,
      executed: false,
      blockedBeforeCheckpoint: !plan.activationCheckpoint.approved,
      filesystemWrites: false,
      gitMutations: false,
      providerCalls: false,
      workerLaunch: false,
    },
    execution: {
      ...plan.execution,
      attempted: false,
      applied: false,
    },
  };
}

function validateWriteAuthority(authority, state, blockers) {
  if (authority.recorded !== true) blockers.push("bounded-write authority is missing");
  if (authority.allowed !== true) blockers.push("bounded-write authority decision is not allowed");
  if (text(authority.decision) !== "approved-bounded-write") blockers.push("bounded-write authority decision is missing or ambiguous");
  if (authority.scopeAllowed !== true) blockers.push("bounded-write authority scope is not allowed");
  if (!text(authority.owner) || authority.owner !== text(state.owner)) blockers.push("bounded-write authority owner does not match evidence");
  if (!text(authority.worktree) || authority.worktree !== text(state.worktree)) blockers.push("bounded-write authority worktree does not match evidence");
  for (const field of ["baseSha", "headSha", "diffHash"]) {
    if (!text(authority[field]) || authority[field] !== text(state[field])) blockers.push(`bounded-write authority ${field} does not match evidence`);
  }
  const checkedAt = parseTimestamp(authority.checkedAt || authority.evidence?.checkedAt);
  const now = parseTimestamp(authority.now);
  if (!checkedAt || !now || checkedAt > now || now - checkedAt > MAX_CHECKPOINT_AGE_MS) {
    blockers.push("bounded-write authority evidence is missing or stale");
  }
}

function validateActivation(activation, state, now, blockers) {
  if (activation.type !== undefined && text(activation.type) !== "human") blockers.push("human activation checkpoint is required");
  if (activation.required !== true) blockers.push("human activation checkpoint is required");
  if (activation.approved !== true) blockers.push("human activation checkpoint has not been approved");
  if (!safeText(activation.approvedBy, 120)) blockers.push("human activation approver identity is missing or unsafe");
  const approvedAt = parseTimestamp(activation.approvedAt);
  const parsedNow = parseTimestamp(now);
  if (!approvedAt || !parsedNow || approvedAt > parsedNow || parsedNow - approvedAt > MAX_CHECKPOINT_AGE_MS) blockers.push("human activation checkpoint timestamp is missing, invalid, or stale");
  if (activation.exactHead !== true || activation.baseSha !== text(state.baseSha) || activation.headSha !== text(state.headSha) || activation.diffHash !== text(state.diffHash)) blockers.push("human activation checkpoint revision does not match evidence");
  if (activation.owner !== text(state.owner)) blockers.push("human activation checkpoint owner does not match evidence");
  if (activation.worktree !== text(state.worktree)) blockers.push("human activation checkpoint worktree does not match evidence");
}

function validateWritePlan(plan, state, blockers) {
  const unknownKeys = Object.keys(plan).filter((key) => !ALLOWED_WRITE_PLAN_KEYS.has(key));
  if (unknownKeys.length) blockers.push(`bounded-write plan contains unsupported metadata keys: ${unknownKeys.join(", ")}`);
  if (!Array.isArray(plan.files) || plan.files.some((file) => typeof file !== "string")) blockers.push("bounded-write plan files list is malformed");
  if (!Array.isArray(plan.operations) || plan.operations.some((operation) => typeof operation !== "string")) blockers.push("bounded-write plan operations list is malformed");
  const files = normalizeStringList(plan.files);
  const changedFiles = normalizeStringList(state.changedFiles);
  if (!files.length || !sameSet(files, changedFiles)) blockers.push("bounded-write plan files do not exactly match changed-file evidence");
  if (files.some((file) => HIGH_RISK_FILE_PATTERN.test(file.replaceAll("\\", "/")))) blockers.push("bounded-write plan contains high-risk files");
  const operations = normalizeStringList(plan.operations);
  if (!operations.length || operations.some((operation) => !ALLOWED_WRITE_OPERATIONS.has(operation.toLowerCase()))) blockers.push("bounded-write plan operation is missing or not allowlisted");
  if (!text(plan.rollbackPath) || text(plan.rollbackPath) !== text(state.rollbackPath)) blockers.push("bounded-write plan rollback path does not match evidence");
  if (findForbiddenAction(plan).length) blockers.push("bounded-write plan contains an execution or external-action intent");
}

function findForbiddenAction(value, path = "writePlan") {
  if (!value || typeof value !== "object") return [];
  const findings = [];
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_ACTION_KEY.test(key) && nested !== false && nested !== null && nested !== "" && nested !== "none") findings.push(`${path}.${key}`);
    if (typeof nested === "string" && containsForbiddenActionValue(nested)) findings.push(`${path}.${key}[value]`);
    if (nested && typeof nested === "object") findings.push(...findForbiddenAction(nested, `${path}.${key}`));
  }
  return findings;
}

function containsForbiddenActionValue(value) {
  const normalized = value.toLowerCase().replace(/[\s_-]+/g, "");
  return FORBIDDEN_ACTION_VALUE.test(value)
    || /providercall|livemodel|shellcommand|spawnsync|workerlaunch|networkrequest|git(?:hub)?(?:push|commit|merge|checkout|reset)|mutating|dispatch/.test(normalized);
}

function parseTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeStringList(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean) : [];
}

function sameSet(left, right) {
  return left.length === right.length && left.every((entry) => right.includes(entry));
}

function safeText(value, maxLength) {
  const normalized = text(value);
  return normalized && normalized.length <= maxLength && !SENSITIVE_METADATA.test(normalized) ? normalized : null;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values) {
  return [...new Set(values)];
}
