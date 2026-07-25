/**
 * Metadata-only admission decision for work that may change source.
 *
 * This module consumes structured facts supplied by an adapter. `managedLane`
 * is the read-only `codex-workspace resume --json` packet;
 * `expectedRequestIdentity` binds that packet to the requested task and owner;
 * `createPreview` is the read-only `codex-workspace start --dry-run
 * --summary-json` packet. It neither interprets natural-language requests nor
 * invokes either command.
 */

export const MUTATION_ADMISSION_OUTCOMES = Object.freeze([
  "read_only",
  "create_managed_lane",
  "resume_managed_lane",
  "recovery_required",
  "decision_needed"
]);

const READ_ONLY_ACTIVITIES = new Set(["read_only_diagnosis", "github_triage"]);

const PROJECTIONS = Object.freeze({
  understand: Object.freeze({ column: "Understand", attentionKind: null, derived: true }),
  prepare: Object.freeze({ column: "Prepare", attentionKind: null, derived: true }),
  recovery: Object.freeze({ column: "Needs attention", attentionKind: "recovery_needed", derived: true }),
  decision: Object.freeze({ column: "Needs attention", attentionKind: "operator_decision", derived: true })
});

/**
 * Evaluate structured admission facts without creating state or changing the
 * checkout. Precedence is intentionally fixed:
 * read-only -> known dirty Base Checkout -> ambiguity/authority -> Base
 * Checkout fact completeness -> supplied resume packet -> start dry-run
 * preview -> decision needed.
 */
export function evaluateMutationAdmission(input = {}) {
  const requestedActivity = text(input.requestedActivity);
  const baseCheckout = object(input.baseCheckout);
  const recoveryInspection = object(input.baseCheckoutRecovery);

  if (READ_ONLY_ACTIVITIES.has(requestedActivity)) return readOnlyResult();
  if (hasRecoveryRequiredInspection(recoveryInspection)) return recoveryResult(baseCheckout, recoveryInspection);
  if (recoveryInspection.status === "inspection_unknown") return decisionResult("admission.base_checkout_unknown");
  if (baseCheckout.isBaseCheckout === true && baseCheckout.dirty === true) {
    return hasCompleteBaseCheckout(baseCheckout)
      ? recoveryResult(baseCheckout)
      : decisionResult("admission.base_checkout_unknown");
  }
  if (requestedActivity === "material_ambiguity") return decisionResult("admission.activity_ambiguous");
  if (requestedActivity !== "source_change" || input.authorizedScope !== true) {
    return decisionResult(requestedActivity === "source_change" ? "admission.scope_not_authorized" : "admission.activity_ambiguous");
  }
  if (!hasKnownCleanBaseCheckout(baseCheckout)) return decisionResult("admission.base_checkout_unknown");

  if (hasOwn(input, "managedLane")) {
    const managedLane = object(input.managedLane);
    const expectedRequestIdentity = object(input.expectedRequestIdentity);
    return hasUsableResumePacket(managedLane, expectedRequestIdentity)
      ? resumeResult(managedLane)
      : unsafeLaneResult(managedLane);
  }

  const createPreview = object(input.createPreview);
  if (hasUsableCreatePreview(createPreview)) return createResult(createPreview);
  return decisionResult("admission.lane_candidate_unresolved");
}

function readOnlyResult() {
  return result({
    outcome: "read_only",
    reasonCode: "admission.read_only",
    nextSafeAction: "Continue with read-only inspection; no lane is needed.",
    canonicalStage: "classify",
    canonicalStatus: "active",
    canonicalOwner: "kendall",
    projection: PROJECTIONS.understand
  });
}

function recoveryResult(checkout, inspection = {}) {
  return result({
    outcome: "recovery_required",
    reasonCode: boundedText(inspection.reasonCode) || "admission.base_checkout_dirty",
    nextSafeAction: boundedText(inspection.nextSafeAction) || "Inspect the unmanaged Base Checkout diff; do not mutate, publish, or adopt it.",
    canonicalStage: "human_gate",
    canonicalStatus: "blocked",
    canonicalOwner: "blocked",
    projection: PROJECTIONS.recovery,
    checkoutEvidence: checkoutEvidence(hasCompleteRecoveryCheckout(inspection.checkout) ? inspection.checkout : checkout)
  });
}

function hasRecoveryRequiredInspection(inspection) {
  return inspection.status === "recovery_required"
    && inspection.outcome === "recovery_required"
    && isBoundedText(inspection.reasonCode)
    && isBoundedText(inspection.nextSafeAction)
    && hasCompleteRecoveryCheckout(inspection.checkout);
}

function hasCompleteRecoveryCheckout(checkout) {
  return object(checkout).identity === "primary_worktree"
    && isBoundedText(checkout.branch)
    && isBoundedText(checkout.head)
    && Number.isSafeInteger(checkout.changedPathCount)
    && checkout.changedPathCount >= 0;
}

function decisionResult(reasonCode) {
  const actionByReason = {
    "admission.base_checkout_unknown": "Inspect Base Checkout facts before lane setup.",
    "admission.managed_lane_unsafe": "Inspect codex-workspace resume evidence and resolve lane ownership before continuing.",
    "admission.lane_candidate_unresolved": "Collect a safe codex-workspace resume packet or start dry-run preview before lane setup.",
    "admission.scope_not_authorized": "Confirm source-change authority before lane setup.",
    "admission.activity_ambiguous": "Clarify the requested source-change scope before lane setup."
  };
  return result({
    outcome: "decision_needed",
    reasonCode,
    nextSafeAction: actionByReason[reasonCode] || "Clarify the requested source-change scope before lane setup.",
    canonicalStage: "human_gate",
    canonicalStatus: "waiting",
    canonicalOwner: "operator",
    projection: PROJECTIONS.decision
  });
}

function unsafeLaneResult(lane) {
  return result({
    ...decisionResult("admission.managed_lane_unsafe"),
    laneEvidence: laneEvidence(lane)
  });
}

function resumeResult(lane) {
  return result({
    outcome: "resume_managed_lane",
    reasonCode: "admission.resume_existing_lane",
    nextSafeAction: "Resume the identified managed lane through codex-workspace.",
    canonicalStage: "route",
    canonicalStatus: "active",
    canonicalOwner: "kendall",
    projection: PROJECTIONS.prepare,
    laneEvidence: laneEvidence(lane)
  });
}

function createResult(preview) {
  return result({
    outcome: "create_managed_lane",
    reasonCode: "admission.create_managed_lane",
    nextSafeAction: "Preview or start a managed lane through codex-workspace.",
    canonicalStage: "route",
    canonicalStatus: "active",
    canonicalOwner: "kendall",
    projection: PROJECTIONS.prepare,
    laneEvidence: laneEvidence(preview)
  });
}

function result(fields) {
  return Object.freeze({
    outcome: fields.outcome,
    reasonCode: fields.reasonCode,
    nextSafeAction: fields.nextSafeAction,
    canonicalStage: fields.canonicalStage,
    canonicalStatus: fields.canonicalStatus,
    canonicalOwner: fields.canonicalOwner,
    projection: { ...fields.projection },
    ...(fields.laneEvidence ? { laneEvidence: fields.laneEvidence } : {}),
    ...(fields.checkoutEvidence ? { checkoutEvidence: fields.checkoutEvidence } : {}),
    mutation: "none; admission decision only"
  });
}

function hasKnownCleanBaseCheckout(checkout) {
  return hasCompleteBaseCheckout(checkout) && checkout.dirty === false;
}

function hasCompleteBaseCheckout(checkout) {
  return checkout.isBaseCheckout === true
    && typeof checkout.dirty === "boolean"
    && isBoundedText(checkout.branch)
    && isBoundedText(checkout.head)
    && Number.isSafeInteger(checkout.changedPathCount)
    && checkout.changedPathCount >= 0
    && checkout.dirty === (checkout.changedPathCount > 0);
}

function hasUsableResumePacket(packet, expectedRequestIdentity) {
  return packet.status === "active"
    && isBoundedText(packet.taskId)
    && isBoundedText(packet.branch)
    && isBoundedText(packet.baseBranch)
    && isBoundedText(packet.baseRef)
    && hasProducerCompatibleBaseBranch(packet.baseBranch)
    && hasProducerCompatibleBaseRef(packet)
    && isBoundedText(packet.owner)
    && isBoundedText(packet.currentOwner)
    && packet.owner === packet.currentOwner
    && packet.ownerMatches === true
    && packet.ownerWarning === null
    && isBoundedText(packet.worktreePath)
    && packet.worktreeExists === true
    && isBoundedText(packet.manifestPath)
    && packet.mutation === "none; resume only"
    && hasMatchingExpectedRequestIdentity(packet, expectedRequestIdentity);
}

function hasProducerCompatibleBaseRef(packet) {
  return packet.baseRef === packet.baseBranch || packet.baseRef === `origin/${packet.baseBranch}`;
}

function hasProducerCompatibleBaseBranch(value) {
  const branch = text(value);
  if (branch === "HEAD") return true;
  if (
    !isBoundedText(branch)
    || branch !== branch.trim()
    || branch.startsWith("-")
    || branch.startsWith("refs/")
    || /[\s\u0000-\u001f\u007f]/.test(branch)
    || ["~", "^", ":", "?", "*", "[", "\\"].some((character) => branch.includes(character))
    || branch.includes("..")
    || branch.includes("@{")
    || branch === "@"
    || branch.endsWith(".")
    || branch.endsWith("/")
    || branch.includes("//")
  ) return false;
  return branch.split("/").every((component) => component.length > 0 && !component.startsWith(".") && !component.endsWith(".lock"));
}

function hasUsableCreatePreview(preview) {
  const plannedWrites = object(preview.plannedWrites);
  return isBoundedText(preview.taskId)
    && isBoundedText(preview.branch)
    && isBoundedText(preview.worktreePath)
    && isBoundedText(preview.manifestPath)
    && preview.mutation === "none; dry-run summary only"
    && plannedWrites.manifest === preview.manifestPath
    && plannedWrites.worktree === preview.worktreePath
    && plannedWrites.branch === preview.branch;
}

function hasMatchingExpectedRequestIdentity(packet, expected) {
  return isBoundedText(expected.taskId)
    && isBoundedText(expected.owner)
    && packet.taskId === expected.taskId
    && packet.owner === expected.owner;
}

function laneEvidence(lane) {
  return Object.freeze({
    taskId: boundedText(lane.taskId),
    branch: boundedText(lane.branch),
    worktreePath: boundedText(lane.worktreePath),
    manifestPath: boundedText(lane.manifestPath),
    owner: boundedText(lane.owner),
    ownerWarning: boundedText(lane.ownerWarning)
  });
}

function checkoutEvidence(checkout) {
  return Object.freeze({
    branch: boundedText(checkout.branch),
    head: boundedText(checkout.head),
    changedPathCount: boundedCount(checkout.changedPathCount)
  });
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(object(value), key);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return typeof value === "string" ? value : "";
}

function isBoundedText(value) {
  const valueText = text(value);
  return valueText.trim().length > 0 && valueText.length <= 256;
}

function boundedText(value) {
  const valueText = text(value).trim();
  return valueText ? valueText.slice(0, 256) : null;
}

function boundedCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
