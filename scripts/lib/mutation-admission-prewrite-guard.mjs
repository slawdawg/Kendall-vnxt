import { realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE_WRITE_OPERATION = "source_write";
const ENFORCEMENT_LIMIT = "This guard covers supported manager worker handoffs only; it does not restrict the Operator's editor, manual shell commands, or arbitrary unwrapped local processes.";

/**
 * Approves the narrow, source-write-capable manager handoff after the worker
 * has been rebound into its CWD. The trusted lane provenance is created by the
 * managed-lane handoff adapter; this guard only compares filesystem identities
 * and never writes source or lifecycle state.
 */
export function approveManagedSourceWrite(input = {}, context = {}) {
  if (input.operation !== SOURCE_WRITE_OPERATION) return readOnlyBypass();

  const trusted = trustedLane(input.trustedLane, context);
  if (!trusted) return blocked("guard.trusted_lane_invalid", "Inspect the admitted managed-lane evidence before a source-edit handoff.");

  const actual = pathIdentity(input.actualCwd, context);
  if (!actual) return blocked("guard.cwd_identity_unknown", "Inspect the worker CWD before starting or resuming a managed lane.");
  if (samePathIdentity(actual, trusted.baseCheckout)) {
    return blocked("guard.base_checkout_target", "Start or resume a distinct managed lane through codex-workspace before source edits.");
  }
  if (!samePathIdentity(actual, trusted.worktree)) {
    return blocked("guard.managed_lane_mismatch", "Rebind the worker to the admitted managed lane, then start or resume that lane through codex-workspace.");
  }

  return Object.freeze({
    status: "allowed",
    outcome: "resume_managed_lane",
    reasonCode: "guard.managed_lane_approved",
    nextSafeAction: "Deliver the bounded source-edit handoff in the validated managed worktree.",
    canonicalStage: "route",
    canonicalStatus: "active",
    canonicalOwner: "kendall",
    projection: Object.freeze({ column: "Prepare", attentionKind: null, derived: true }),
    laneEvidence: trusted.laneEvidence,
    enforcementLimit: ENFORCEMENT_LIMIT,
    mutation: "none; pre-write approval only",
  });
}

export const SUPPORTED_MANAGER_PREWRITE_GUARD_LIMIT = ENFORCEMENT_LIMIT;

function readOnlyBypass() {
  return Object.freeze({
    status: "not_applicable",
    outcome: "read_only",
    reasonCode: "guard.read_only_bypass",
    nextSafeAction: "Continue with read-only inspection; no source-write approval is needed.",
    canonicalStage: "classify",
    canonicalStatus: "active",
    canonicalOwner: "kendall",
    projection: Object.freeze({ column: "Understand", attentionKind: null, derived: true }),
    enforcementLimit: ENFORCEMENT_LIMIT,
    mutation: "none; read-only operation",
  });
}

function blocked(reasonCode, nextSafeAction) {
  return Object.freeze({
    status: "blocked",
    outcome: "decision_needed",
    reasonCode,
    nextSafeAction,
    canonicalStage: "human_gate",
    canonicalStatus: "waiting",
    canonicalOwner: "operator",
    projection: Object.freeze({ column: "Needs attention", attentionKind: "operator_decision", derived: true }),
    enforcementLimit: ENFORCEMENT_LIMIT,
    mutation: "none; source-edit handoff blocked",
  });
}

function trustedLane(value, context) {
  const lane = object(value);
  const baseCheckout = pathIdentity(lane.baseCheckoutPath, context);
  const worktree = pathIdentity(lane.worktreePath, context);
  const laneEvidence = boundedLaneEvidence(lane.laneEvidence);
  if (!baseCheckout || !worktree || !laneEvidence || samePathIdentity(baseCheckout, worktree)) return null;
  return Object.freeze({ baseCheckout, worktree, laneEvidence });
}

function boundedLaneEvidence(value) {
  const evidence = object(value);
  const taskId = boundedText(evidence.taskId);
  const branch = boundedText(evidence.branch);
  const manifestPath = boundedText(evidence.manifestPath);
  const owner = boundedText(evidence.owner);
  return taskId && branch && manifestPath && owner
    ? Object.freeze({ taskId, branch, manifestPath, owner })
    : null;
}

function pathIdentity(path, context) {
  if (typeof path !== "string" || !path.trim()) return null;
  try {
    const realpath = context.realpath || realpathSync.native;
    const stat = context.stat || statSync;
    const realPath = resolve(realpath(path));
    const result = stat(realPath);
    return Number.isSafeInteger(result?.dev) && Number.isSafeInteger(result?.ino)
      ? Object.freeze({ realPath, dev: result.dev, ino: result.ino })
      : null;
  } catch {
    return null;
  }
}

function samePathIdentity(left, right) {
  return Boolean(left && right) && (left.realPath === right.realPath || (left.dev === right.dev && left.ino === right.ino));
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function boundedText(value, limit = 260) {
  const text = typeof value === "string" ? value.trim() : "";
  return text && text.length <= limit ? text : null;
}
