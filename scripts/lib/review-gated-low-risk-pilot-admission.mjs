import { evaluateBoundedWritePlan } from "./review-gated-low-risk-bounded-write.mjs";

const LOW_RISK_OBJECTIVE = /^(?:documentation|runbook|test-hardening|deterministic-tooling|refactoring|maintenance|worktree|focused-verification|code-review|low-risk-maintenance)(?:[-_ :/]|$)/i;
const HIGH_RISK_FILE = /(^|\/)(\.env(?:\.|$)|.*(?:secret|credential|token|password).*|\.git(?:\/|$)|node_modules(?:\/|$)|(?:auth|security|deploy|release|migration|production)(?:\/|\.|$))/i;
const MAX_APPROVAL_AGE_MS = 15 * 60 * 1000;

/**
 * Validate a bounded-write pilot admission packet. This is a metadata-only
 * checkpoint: approval records readiness evidence but never enables or
 * performs filesystem, Git, provider, or worker mutation.
 */
export function evaluatePilotAdmission(input = {}, options = {}) {
  const source = input && typeof input === "object" ? input : {};
  const opts = options && typeof options === "object" ? options : {};
  const now = opts.now ?? source.now;
  const boundedInput = source.boundedWriteInput && typeof source.boundedWriteInput === "object"
    ? source.boundedWriteInput
    : source;
  const boundedPlan = evaluateBoundedWritePlan(boundedInput, { now });
  const state = boundedInput.state && typeof boundedInput.state === "object" ? boundedInput.state : {};
  const packet = source.admissionPacket && typeof source.admissionPacket === "object" ? source.admissionPacket : {};
  const approval = packet.approval && typeof packet.approval === "object" ? packet.approval : {};
  const limits = packet.provisionalLimits && typeof packet.provisionalLimits === "object" ? packet.provisionalLimits : {};
  const recovery = packet.recovery && typeof packet.recovery === "object" ? packet.recovery : {};
  const blockers = [];

  if (boundedPlan.status !== "ready") blockers.push("bounded-write plan is not ready");
  const objective = safeText(packet.objective, 160) || "";
  if (!objective || !LOW_RISK_OBJECTIVE.test(objective)) blockers.push("pilot objective is missing or not low-risk");
  const allowlistedFiles = normalizeStringList(packet.allowlistedFiles);
  const plannedFiles = normalizeStringList(boundedPlan.writePlan?.files);
  if (!Array.isArray(packet.allowlistedFiles) || packet.allowlistedFiles.some((file) => typeof file !== "string")) blockers.push("pilot allowlisted files are malformed");
  if (!allowlistedFiles.length || !sameSet(allowlistedFiles, plannedFiles)) blockers.push("pilot allowlisted files do not match the bounded-write plan");
  if (allowlistedFiles.some((file) => HIGH_RISK_FILE.test(file.replaceAll("\\", "/")))) blockers.push("pilot scope contains high-risk files");
  for (const field of ["owner", "worktree", "baseSha", "headSha", "diffHash"]) {
    if (!text(packet[field]) || packet[field] !== text(state[field])) blockers.push(`pilot ${field} does not match exact evidence`);
  }
  validateEvidence(packet.evidence, state, now, blockers);
  validateLimits(limits, allowlistedFiles, blockers);
  if (!Array.isArray(packet.splitTriggers) || packet.splitTriggers.length === 0 || packet.splitTriggers.length > 10 || packet.splitTriggers.some((trigger) => !safeText(trigger, 200))) blockers.push("pilot split triggers are missing, malformed, unsafe, or unbounded");
  if (!safeText(recovery.owner, 120) || recovery.owner !== text(state.owner) || !isSafeRecoveryPath(recovery.path)) blockers.push("pilot recovery owner or path is missing, unsafe, or unbound");
  validateApproval(approval, packet, state, now, blockers);

  const uniqueBlockers = unique(blockers);
  const approved = approval.approved === true;
  const status = uniqueBlockers.length ? "HOLD" : approved ? "READY" : "HOLD";
  return {
    schemaVersion: 1,
    mode: "pilot-admission-checkpoint",
    status,
    approved: status === "READY",
    blockers: uniqueBlockers,
    objective: objective || null,
    scope: {
      allowlistedFiles,
      owner: text(packet.owner) || null,
      worktree: text(packet.worktree) || null,
      baseSha: text(packet.baseSha) || null,
      headSha: text(packet.headSha) || null,
      diffHash: text(packet.diffHash) || null,
    },
    evidence: {
      review: Boolean(packet.evidence?.review?.status === "PASS"),
      checks: Boolean(packet.evidence?.checks?.passed === true),
      rollback: Boolean(packet.evidence?.rollback?.passed === true),
      exactHead: Boolean(packet.evidence?.exactHead?.headSha === text(state.headSha)),
    },
    provisionalLimits: {
      maxFiles: Number.isInteger(limits.maxFiles) ? limits.maxFiles : null,
      timeoutMs: Number.isInteger(limits.timeoutMs) ? limits.timeoutMs : null,
      maxRetries: Number.isInteger(limits.maxRetries) ? limits.maxRetries : null,
    },
    splitTriggers: normalizeSafeStringList(packet.splitTriggers, 200),
    approval: {
      required: true,
      approved,
      approvedBy: safeText(approval.approvedBy, 120),
      approvedAt: parseTimestamp(approval.approvedAt)?.toISOString() || null,
      checkpointId: safeText(approval.checkpointId, 120),
    },
    recovery: {
      owner: safeText(recovery.owner, 120),
      path: safeText(recovery.path, 300),
    },
    execution: {
      attempted: false,
      applied: false,
      mutation: "none",
      filesystemWrites: false,
      gitMutations: false,
      providerCalls: false,
      workerLaunch: false,
    },
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function validateEvidence(evidence, state, now, blockers) {
  if (!evidence || typeof evidence !== "object") {
    blockers.push("pilot review/check/rollback evidence is missing");
    return;
  }
  if (evidence.review?.status !== "PASS") blockers.push("pilot review evidence is missing or not PASS");
  if (evidence.checks?.passed !== true) blockers.push("pilot check evidence is missing or failed");
  if (evidence.rollback?.passed !== true || text(evidence.rollback?.path) !== text(state.rollbackPath)) blockers.push("pilot rollback evidence is missing or unbound");
  if (evidence.exactHead?.headSha !== text(state.headSha)) blockers.push("pilot exact-head evidence is missing or mismatched");
  for (const label of ["review", "checks", "rollback", "exactHead"]) {
    const checkedAt = parseTimestamp(evidence[label]?.checkedAt);
    const parsedNow = parseTimestamp(now);
    if (!checkedAt || !parsedNow || checkedAt > parsedNow || parsedNow - checkedAt > MAX_APPROVAL_AGE_MS) blockers.push(`pilot ${label} evidence timestamp is missing, stale, or invalid`);
  }
}

function validateLimits(limits, files, blockers) {
  if (!Number.isInteger(limits.maxFiles) || limits.maxFiles < 1 || limits.maxFiles > 20) blockers.push("pilot maxFiles limit is missing or unbounded");
  else if (files.length > limits.maxFiles) blockers.push("pilot scope exceeds maxFiles limit");
  if (!Number.isInteger(limits.timeoutMs) || limits.timeoutMs < 1000 || limits.timeoutMs > 15 * 60 * 1000) blockers.push("pilot timeout limit is missing or unbounded");
  if (!Number.isInteger(limits.maxRetries) || limits.maxRetries < 0 || limits.maxRetries > 2) blockers.push("pilot maxRetries limit is missing or unbounded");
}

function validateApproval(approval, packet, state, now, blockers) {
  if (approval.required !== true) blockers.push("pilot approval is required");
  if (approval.approved !== true) blockers.push("pilot approval is missing");
  if (!safeText(approval.approvedBy, 120)) blockers.push("pilot approver identity is missing or unsafe");
  if (!safeText(approval.checkpointId, 120)) blockers.push("pilot checkpoint ID is missing or unsafe");
  const approvedAt = parseTimestamp(approval.approvedAt);
  const parsedNow = parseTimestamp(now);
  if (!approvedAt || !parsedNow || approvedAt > parsedNow || parsedNow - approvedAt > MAX_APPROVAL_AGE_MS) blockers.push("pilot approval is stale, future-dated, or invalid");
  for (const field of ["owner", "worktree", "baseSha", "headSha", "diffHash"]) {
    if (approval[field] !== text(state[field]) || packet[field] !== text(state[field])) blockers.push(`pilot approval ${field} is not exact-bound`);
  }
}

function parseTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeStringList(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean) : [];
}

function normalizeSafeStringList(value, maxLength) {
  return Array.isArray(value) ? value.map((entry) => safeText(entry, maxLength)).filter(Boolean) : [];
}

function sameSet(left, right) {
  return left.length === right.length && left.every((entry) => right.includes(entry));
}

function safeText(value, maxLength) {
  const normalized = text(value);
  return normalized && normalized.length <= maxLength && !/raw\s*prompt|completion|reasoning|provider\s*payload|token|password|secret|credential/i.test(normalized) ? normalized : null;
}

function isSafeRecoveryPath(value) {
  const normalized = safeText(value, 300);
  return Boolean(normalized && /^(?:revert|preserve|rerun|inspect|request):(?!.*(?:git|network|write|patch|apply|shell|command|echo|push|merge|reset))[A-Za-z0-9._-]+$/i.test(normalized));
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values) {
  return [...new Set(values)];
}
