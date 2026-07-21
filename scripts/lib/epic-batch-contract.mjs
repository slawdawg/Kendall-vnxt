export const EPIC_BATCH_DEFAULT_LIMITS = Object.freeze({
  sliceLimit: 4,
  ageBusinessDays: 5,
  fileLimit: 20,
  lineLimit: 1000,
});
const EPIC_BATCH_AGE_CALENDAR = "UTC Monday-Friday; holidays do not extend the ceiling";

const HIGH_RISK_MARKERS = Object.freeze([
  "auth",
  "security",
  "live",
  "bounded-live",
  "epic25",
  "epic-25",
  "credential",
  "secret",
  "provider",
  "production",
  "deployment",
  "migration",
  "schema",
  "worker-launch",
]);

export function buildEpicBatchManifest({ epicId, decisionRef, expectedSlices = [], allowedPaths = [], limits = EPIC_BATCH_DEFAULT_LIMITS }) {
  const normalizedEpicId = String(epicId || "").trim();
  const normalizedDecisionRef = String(decisionRef || "").trim();
  if (!normalizedEpicId || !normalizedDecisionRef) {
    throw new Error("epic-batch mode requires --epic-id and --decision-ref");
  }
  const resolvedLimits = {
    slice_limit: positiveInteger(limits.sliceLimit, "slice limit"),
    age_business_days: positiveInteger(limits.ageBusinessDays, "age limit"),
    file_limit: positiveInteger(limits.fileLimit, "file limit"),
    line_limit: positiveInteger(limits.lineLimit, "line limit"),
  };
  for (const [key, ceiling] of Object.entries({
    slice_limit: EPIC_BATCH_DEFAULT_LIMITS.sliceLimit,
    age_business_days: EPIC_BATCH_DEFAULT_LIMITS.ageBusinessDays,
    file_limit: EPIC_BATCH_DEFAULT_LIMITS.fileLimit,
    line_limit: EPIC_BATCH_DEFAULT_LIMITS.lineLimit,
  })) {
    if (resolvedLimits[key] > ceiling) throw new Error(`${key} cannot exceed provisional ceiling ${ceiling}`);
  }
  return {
    epic_id: normalizedEpicId,
    decision_ref: normalizedDecisionRef,
    limits: resolvedLimits,
    age_calendar: EPIC_BATCH_AGE_CALENDAR,
    opened_at: new Date().toISOString(),
    age_business_days_elapsed: 0,
    expected_slices: [...expectedSlices].map((slice) => String(slice).trim()).filter(Boolean),
    allowed_paths: [...allowedPaths].map((path) => String(path).trim()).filter(Boolean),
    slices: [],
    checkpoints: [],
    split_triggers: [],
    final_verification_ref: null,
    final_review_ref: null,
    final_head: null,
    rollback_ref: null,
    cleanup_plan_ref: null,
    cleanup_result_ref: null,
  };
}

export function evaluateEpicBatchAdmission({ epicBatch, expectedSlices = epicBatch?.expected_slices || [], changedFiles = epicBatch?.allowed_paths || [], netLines = 0, ageBusinessDays = 0, riskMarkers = [] }) {
  const limits = epicBatch?.limits || {};
  const blockers = [];
  const normalizedRiskMarkers = [...riskMarkers, ...changedFiles].map((value) => String(value).toLowerCase());
  if (expectedSlices.length === 0) blockers.push("expected slices are required");
  if (changedFiles.length === 0) blockers.push("allowed paths are required");
  if (changedFiles.some((path) => /^\//.test(path) || path.includes("..") || path.includes("\\"))) blockers.push("unsafe allowed path");
  if (expectedSlices.length > Number(limits.slice_limit || 0)) blockers.push("slice limit exceeded");
  if (changedFiles.length > Number(limits.file_limit || 0)) blockers.push("file limit exceeded");
  if (Number(netLines) > Number(limits.line_limit || 0)) blockers.push("line limit exceeded");
  if (Number(ageBusinessDays) > Number(limits.age_business_days || 0)) blockers.push("age limit exceeded");
  if (normalizedRiskMarkers.some((value) => HIGH_RISK_MARKERS.some((marker) => value.includes(marker)))) {
    blockers.push("high-risk surface requires standard-delivery");
  }
  return {
    status: blockers.length === 0 ? "admitted" : "blocked",
    blockers,
    authority: "planning-only; no delivery or cleanup authority",
  };
}

export function appendEpicBatchCheckpoint(epicBatch, checkpoint) {
  if (!epicBatch || !checkpoint?.checkpoint_id || !validRevisionRef(checkpoint.base_revision) || !validRevisionRef(checkpoint.head) || !validEvidenceRef(checkpoint.review_ref) || !nonEmptyStringArray(checkpoint.checks)) {
    throw new Error("checkpoint_id, base_revision, head, and review_ref are required");
  }
  return {
    ...epicBatch,
    checkpoints: [...(epicBatch.checkpoints || []), {
      checkpoint_id: String(checkpoint.checkpoint_id),
      slices: [...(checkpoint.slices || [])],
      base_revision: String(checkpoint.base_revision || ""),
      head: String(checkpoint.head || ""),
      checks: [...(checkpoint.checks || [])],
      review_ref: checkpoint.review_ref || null,
      result: checkpoint.result || "pending",
    }],
  };
}

export function appendEpicBatchSlice(epicBatch, slice) {
  if (!epicBatch || !slice?.slice_id || !slice.objective || !slice.owner || !validEvidenceRef(slice.rollback_ref) || !validRevisionRef(slice.commit)) {
    throw new Error("slice_id, objective, owner, commit, and rollback_ref are required");
  }
  if (!nonEmptyStringArray(slice.paths) || !nonEmptyStringArray(slice.checks)) {
    throw new Error("slice paths and checks are required");
  }
  if (slice.paths.some((path) => !pathAllowedByManifest(path, epicBatch.allowed_paths || []))) {
    throw new Error("slice paths must stay within the admitted allowlist");
  }
  if (epicBatch.slices?.length >= Number(epicBatch.limits?.slice_limit || 0)) throw new Error("slice limit exceeded");
  return {
    ...epicBatch,
    slices: [...(epicBatch.slices || []), {
      slice_id: String(slice.slice_id),
      objective: String(slice.objective),
      owner: String(slice.owner),
      paths: [...slice.paths].map((path) => String(path)),
      commit: slice.commit || null,
      checks: [...slice.checks].map((check) => String(check)),
      rollback_ref: String(slice.rollback_ref),
    }],
  };
}

export function buildEpicBatchFinishPlan(manifest, { verificationRef = null, reviewRef = null, ageBusinessDays = null, liveState = null, now = new Date() } = {}) {
  const epicBatch = manifest?.epic_batch;
  const blockers = [];
  if (manifest?.mode !== "epic-batch") blockers.push("workspace is not in epic-batch mode");
  if (!epicBatch?.epic_id || !epicBatch?.decision_ref) blockers.push("epic admission metadata is incomplete");
  if (!epicBatch?.expected_slices?.length || !epicBatch?.slices?.length) blockers.push("no admitted slices are recorded");
  const expectedSliceIds = new Set(epicBatch?.expected_slices || []);
  const recordedSliceIds = new Set((epicBatch?.slices || []).map((slice) => slice.slice_id));
  if (expectedSliceIds.size > 0 && [...expectedSliceIds].some((sliceId) => !recordedSliceIds.has(sliceId))) blockers.push("expected slices are incomplete");
  if ([...recordedSliceIds].some((sliceId) => !expectedSliceIds.has(sliceId))) blockers.push("unexpected slices are recorded");
  if (!epicBatch?.checkpoints?.length || epicBatch.checkpoints.some((checkpoint) => checkpoint.result !== "passed")) blockers.push("passed checkpoint evidence is missing");
  if (epicBatch?.split_triggers?.length) blockers.push("split trigger is unrecorded or unresolved");
  const elapsedAge = ageBusinessDays === null
    ? deriveBusinessDaysElapsed(epicBatch?.opened_at || manifest?.created_at, now)
    : Number(ageBusinessDays);
  if (elapsedAge === null) blockers.push("current age evidence is missing");
  else if (!Number.isInteger(elapsedAge) || elapsedAge < 0) blockers.push("age value is invalid");
  else if (elapsedAge > Number(epicBatch?.limits?.age_business_days || 0)) blockers.push("age limit exceeded");
  for (const slice of epicBatch?.slices || []) {
    if (!slice?.slice_id || !slice.objective || !slice.owner || !validRevisionRef(slice.commit) || !validEvidenceRef(slice.rollback_ref) || !nonEmptyStringArray(slice.paths) || !nonEmptyStringArray(slice.checks)) {
      blockers.push("complete slice evidence is missing");
      break;
    }
    if (slice.paths.some((path) => !pathAllowedByManifest(path, epicBatch.allowed_paths || []))) {
      blockers.push("slice paths exceed admitted allowlist");
      break;
    }
  }
  for (const checkpoint of epicBatch?.checkpoints || []) {
    if (!checkpoint?.checkpoint_id || !validRevisionRef(checkpoint.base_revision) || !validRevisionRef(checkpoint.head) || !validEvidenceRef(checkpoint.review_ref) || !nonEmptyStringArray(checkpoint.checks)) {
      blockers.push("complete checkpoint evidence is missing");
      break;
    }
  }
  const aggregatePaths = new Set((epicBatch?.slices || []).flatMap((slice) => slice.paths || []));
  if (aggregatePaths.size > Number(epicBatch?.limits?.file_limit || 0)) blockers.push("aggregate file limit exceeded");
  if (!/^[0-9a-f]{7,64}$/.test(String(epicBatch?.final_head || ""))) blockers.push("final head is missing or invalid");
  if (!validEvidenceRef(epicBatch?.final_verification_ref)) blockers.push("final verification evidence is missing or invalid");
  if (!validEvidenceRef(epicBatch?.final_review_ref)) blockers.push("final review evidence is missing or invalid");
  if (verificationRef && verificationRef !== epicBatch?.final_verification_ref) blockers.push("final verification evidence must be recorded in manifest");
  if (reviewRef && reviewRef !== epicBatch?.final_review_ref) blockers.push("final review evidence must be recorded in manifest");
  const passedCheckpoints = (epicBatch?.checkpoints || []).filter((checkpoint) => checkpoint.result === "passed");
  const finalCheckpoint = passedCheckpoints.at(-1);
  const finalCheckpointSlices = new Set(finalCheckpoint?.slices || []);
  if (
    !finalCheckpoint ||
    !revisionMatches(epicBatch?.final_head, finalCheckpoint.head) ||
    [...expectedSliceIds].some((sliceId) => !finalCheckpointSlices.has(sliceId))
  ) blockers.push("final head is not covered by final aggregate checkpoint evidence");
  if (!liveState) blockers.push("live worktree evidence is missing");
  else {
    if (liveState.error) blockers.push("live worktree status unavailable");
    if (liveState.dirty) blockers.push("live worktree is dirty");
    if (liveState.branch && manifest?.branch && liveState.branch !== manifest.branch) blockers.push("live worktree branch differs from manifest");
    if (liveState.head && !revisionMatches(liveState.head, epicBatch.final_head)) blockers.push("live worktree head differs from final head");
  }
  return {
    status: blockers.length === 0 ? "ready-for-operator-delivery-decision" : "blocked",
    blockers,
    steps: [
      "freeze the managed epic lane",
      "refresh base and rerun aggregate verification",
      "review the exact final diff and resolve all threads",
      "create one final PR targeting the recorded base branch",
      "merge and clean up only after separate authority and post-merge evidence",
    ],
    mutation: "none; planning-only",
  };
}

function validEvidenceRef(value) {
  return typeof value === "string" && /^[A-Za-z0-9_.:/-]{3,160}$/.test(value);
}

function validRevisionRef(value) {
  return typeof value === "string" && /^[0-9a-f]{7,64}$/i.test(value.trim());
}

function revisionMatches(actual, expected) {
  return actual === expected || (typeof actual === "string" && typeof expected === "string" && (actual.startsWith(expected) || expected.startsWith(actual)));
}

function nonEmptyStringArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item.trim().length > 0);
}

function pathAllowedByManifest(path, allowedPaths) {
  if (typeof path !== "string" || !path.trim() || path.startsWith("/") || path.includes("..") || path.includes("\\")) return false;
  return allowedPaths.some((allowed) => {
    if (typeof allowed !== "string" || !allowed.trim() || allowed.startsWith("/") || allowed.includes("..") || allowed.includes("\\")) return false;
    const normalizedAllowed = allowed.trim();
    return path === normalizedAllowed || (normalizedAllowed.endsWith("/") && path.startsWith(normalizedAllowed));
  });
}

export function deriveBusinessDaysElapsed(openedAt, now = new Date()) {
  if (!openedAt) return null;
  const opened = new Date(openedAt);
  if (Number.isNaN(opened.getTime()) || opened > now) return null;
  const cursor = new Date(Date.UTC(opened.getUTCFullYear(), opened.getUTCMonth(), opened.getUTCDate()));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let elapsed = 0;
  while (cursor < end) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) elapsed += 1;
  }
  return elapsed;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${label} must be a positive integer`);
  return number;
}
