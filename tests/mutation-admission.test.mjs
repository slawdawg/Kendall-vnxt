import assert from "node:assert/strict";
import test from "node:test";

import {
  MUTATION_ADMISSION_OUTCOMES,
  evaluateMutationAdmission
} from "../scripts/lib/mutation-admission.mjs";

const cleanBaseCheckout = {
  isBaseCheckout: true,
  dirty: false,
  branch: "dev",
  head: "3d8557031019",
  changedPathCount: 0
};

const resumePacket = {
  taskId: "20260725-clean-by-default-lane-admission-mvp",
  status: "active",
  branch: "codex/clean-by-default-lane-admission-mvp",
  baseBranch: "dev",
  baseRef: "origin/dev",
  owner: "codex:worker",
  currentOwner: "codex:worker",
  ownerMatches: true,
  ownerWarning: null,
  worktreePath: "/tmp/clean-by-default-lane-admission-mvp",
  worktreeExists: true,
  manifestPath: "/tmp/tasks/20260725-clean-by-default-lane-admission-mvp.json",
  prUrl: null,
  prNumber: null,
  command: 'cd "/tmp/clean-by-default-lane-admission-mvp"',
  mutation: "none; resume only"
};

const createPreview = {
  generatedAt: "2026-07-25T00:00:00.000Z",
  stateRoot: "/tmp/.codex-workspaces/kendall",
  taskId: "20260725-clean-by-default-lane-admission-mvp",
  title: "Clean by default lane admission MVP",
  description: "Clean by default lane admission MVP",
  mode: "pr",
  epicBatch: null,
  owner: "codex:worker",
  branch: "codex/clean-by-default-lane-admission-mvp",
  baseBranch: "dev",
  baseRef: "origin/dev",
  worktreePath: "/tmp/clean-by-default-lane-admission-mvp",
  manifestPath: "/tmp/tasks/20260725-clean-by-default-lane-admission-mvp.json",
  shouldFetch: false,
  plan: ["skip fetch"],
  plannedWrites: {
    manifest: "/tmp/tasks/20260725-clean-by-default-lane-admission-mvp.json",
    worktree: "/tmp/clean-by-default-lane-admission-mvp",
    branch: "codex/clean-by-default-lane-admission-mvp"
  },
  mutation: "none; dry-run summary only"
};

test("mutation admission exposes exactly the approved outcomes", () => {
  assert.deepEqual(MUTATION_ADMISSION_OUTCOMES, [
    "read_only",
    "create_managed_lane",
    "resume_managed_lane",
    "recovery_required",
    "decision_needed"
  ]);
});

test("read-only diagnosis and GitHub triage remain lightweight even with unrelated dirty base facts", () => {
  for (const activity of ["read_only_diagnosis", "github_triage"]) {
    const result = evaluateMutationAdmission({
      requestedActivity: activity,
      authorizedScope: false,
      baseCheckout: { ...cleanBaseCheckout, dirty: true, changedPathCount: 3 },
      managedLane: resumePacket,
      rawPrompt: "must never be retained"
    });

    assert.equal(result.outcome, "read_only");
    assert.equal(result.canonicalStage, "classify");
    assert.equal(result.canonicalStatus, "active");
    assert.equal(result.canonicalOwner, "kendall");
    assert.deepEqual(result.projection, { column: "Understand", attentionKind: null, derived: true });
    assert.equal(result.mutation, "none; admission decision only");
    assert.equal("laneEvidence" in result, false);
    assert.equal("checkoutEvidence" in result, false);
    assert.equal(JSON.stringify(result).includes("must never be retained"), false);
  }
});

test("a known dirty Base Checkout blocks mutation-capable work before ambiguity and lane routing", () => {
  const before = { ...cleanBaseCheckout, dirty: true, changedPathCount: 2 };
  const result = evaluateMutationAdmission({
    requestedActivity: "source_change",
    authorizedScope: true,
    baseCheckout: before,
    managedLane: resumePacket
  });

  assert.equal(result.outcome, "recovery_required");
  assert.equal(result.reasonCode, "admission.base_checkout_dirty");
  assert.equal(result.canonicalStage, "human_gate");
  assert.equal(result.canonicalStatus, "blocked");
  assert.equal(result.canonicalOwner, "blocked");
  assert.deepEqual(result.projection, { column: "Needs attention", attentionKind: "recovery_needed", derived: true });
  assert.deepEqual(result.checkoutEvidence, {
    branch: "dev",
    head: "3d8557031019",
    changedPathCount: 2
  });
  assert.deepEqual(before, { ...cleanBaseCheckout, dirty: true, changedPathCount: 2 });
  assert.match(result.nextSafeAction, /inspect/i);
  assert.doesNotMatch(result.nextSafeAction, /node |git /i);
});

test("malformed dirty Base Checkout facts fail closed without placeholder recovery evidence", () => {
  for (const baseCheckout of [
    { isBaseCheckout: true, dirty: true, branch: "", head: "abc", changedPathCount: 2 },
    { isBaseCheckout: true, dirty: true, branch: "dev", head: "", changedPathCount: 2 },
    { isBaseCheckout: true, dirty: true, branch: "dev", head: "abc", changedPathCount: -1 },
    { isBaseCheckout: true, dirty: true, branch: "dev", head: "abc" }
  ]) {
    const result = evaluateMutationAdmission({
      requestedActivity: "source_change",
      authorizedScope: true,
      baseCheckout,
      createPreview
    });
    assert.equal(result.outcome, "decision_needed");
    assert.equal(result.reasonCode, "admission.base_checkout_unknown");
    assert.equal("checkoutEvidence" in result, false);
  }
});

test("Base dirty facts must agree with the changed-path count", () => {
  for (const baseCheckout of [
    { ...cleanBaseCheckout, dirty: true, changedPathCount: 0 },
    { ...cleanBaseCheckout, dirty: false, changedPathCount: 1 }
  ]) {
    const result = evaluateMutationAdmission({
      requestedActivity: "source_change",
      authorizedScope: true,
      baseCheckout,
      createPreview
    });
    assert.equal(result.outcome, "decision_needed");
    assert.equal(result.reasonCode, "admission.base_checkout_unknown");
  }
});

test("unknown or malformed Base Checkout facts fail closed before managed-lane creation", () => {
  for (const baseCheckout of [
    undefined,
    {},
    { isBaseCheckout: false, dirty: false, branch: "feature", head: "abc", changedPathCount: 0 },
    { isBaseCheckout: true, dirty: "false", branch: "dev", head: "abc", changedPathCount: 0 },
    { isBaseCheckout: true, dirty: false, branch: "", head: "abc", changedPathCount: 0 },
    { isBaseCheckout: true, dirty: false, branch: "dev", head: "", changedPathCount: 0 }
  ]) {
    const result = evaluateMutationAdmission({
      requestedActivity: "source_change",
      authorizedScope: true,
      baseCheckout,
      createPreview
    });
    assert.equal(result.outcome, "decision_needed");
    assert.equal(result.reasonCode, "admission.base_checkout_unknown");
  }
});

test("material ambiguity and unavailable authority stop before any workspace plan", () => {
  for (const input of [
    { requestedActivity: "material_ambiguity", authorizedScope: true },
    { requestedActivity: "source_change", authorizedScope: false }
  ]) {
    const result = evaluateMutationAdmission({ ...input, baseCheckout: cleanBaseCheckout });
    assert.equal(result.outcome, "decision_needed");
    assert.equal(result.canonicalStage, "human_gate");
    assert.equal(result.canonicalStatus, "waiting");
    assert.equal(result.canonicalOwner, "operator");
    assert.deepEqual(result.projection, { column: "Needs attention", attentionKind: "operator_decision", derived: true });
    assert.equal("laneEvidence" in result, false);
    assert.equal("checkoutEvidence" in result, false);
  }
});

test("only a usable safe exact codex-workspace resume packet yields resume", () => {
  const result = evaluateMutationAdmission({
    requestedActivity: "source_change",
    authorizedScope: true,
    baseCheckout: cleanBaseCheckout,
    managedLane: resumePacket,
    expectedRequestIdentity: { taskId: resumePacket.taskId, owner: resumePacket.owner }
  });

  assert.equal(result.outcome, "resume_managed_lane");
  assert.equal(result.reasonCode, "admission.resume_existing_lane");
  assert.equal(result.canonicalStage, "route");
  assert.equal(result.canonicalStatus, "active");
  assert.equal(result.canonicalOwner, "kendall");
  assert.deepEqual(result.projection, { column: "Prepare", attentionKind: null, derived: true });
  assert.deepEqual(result.laneEvidence, {
    taskId: resumePacket.taskId,
    branch: resumePacket.branch,
    worktreePath: resumePacket.worktreePath,
    manifestPath: resumePacket.manifestPath,
    owner: resumePacket.owner,
    ownerWarning: null
  });
});

test("unsafe, incomplete, or fabricated lane facts require a decision and never select create", () => {
  for (const managedLane of [
    { ...resumePacket, ownerWarning: "owner needs review" },
    { ...resumePacket, ownerMatches: false },
    { ...resumePacket, owner: null, ownerMatches: true },
    { ...resumePacket, owner: "legacy-owner", currentOwner: "codex:worker", ownerMatches: true },
    { ...resumePacket, owner: "codex:worker", currentOwner: "other-worker", ownerMatches: true },
    { ...resumePacket, worktreeExists: false },
    { ...resumePacket, status: "closed" },
    { ...resumePacket, mutation: "none; dry-run summary only" },
    { taskId: resumePacket.taskId, resolution: "unique_safe" }
  ]) {
    const result = evaluateMutationAdmission({
      requestedActivity: "source_change",
      authorizedScope: true,
      baseCheckout: cleanBaseCheckout,
      managedLane,
      expectedRequestIdentity: { taskId: resumePacket.taskId, owner: resumePacket.owner },
      createPreview
    });
    assert.equal(result.outcome, "decision_needed");
    assert.equal(result.reasonCode, "admission.managed_lane_unsafe");
    assert.match(result.nextSafeAction, /resume evidence/i);
  }
});

test("resume requires a matching bounded request identity before selecting a lane", () => {
  for (const expectedRequestIdentity of [
    undefined,
    {},
    { taskId: "other-task", owner: resumePacket.owner },
    { taskId: resumePacket.taskId, owner: "other-owner" }
  ]) {
    const result = evaluateMutationAdmission({
      requestedActivity: "source_change",
      authorizedScope: true,
      baseCheckout: cleanBaseCheckout,
      managedLane: resumePacket,
      expectedRequestIdentity
    });
    assert.equal(result.outcome, "decision_needed");
    assert.equal(result.reasonCode, "admission.managed_lane_unsafe");
  }
});

test("only a bounded start dry-run preview permits managed-lane creation", () => {
  const result = evaluateMutationAdmission({
    requestedActivity: "source_change",
    authorizedScope: true,
    baseCheckout: cleanBaseCheckout,
    createPreview
  });

  assert.equal(result.outcome, "create_managed_lane");
  assert.equal(result.reasonCode, "admission.create_managed_lane");
  assert.equal(result.canonicalStage, "route");
  assert.equal(result.canonicalStatus, "active");
  assert.equal(result.canonicalOwner, "kendall");
  assert.deepEqual(result.projection, { column: "Prepare", attentionKind: null, derived: true });
  assert.equal(result.laneEvidence.taskId, createPreview.taskId);
  assert.match(result.nextSafeAction, /codex-workspace/i);
});

test("missing or malformed candidate evidence fails closed instead of creating a lane", () => {
  for (const createPlan of [
    undefined,
    {},
    { ...createPreview, mutation: "none; preview" },
    { ...createPreview, plannedWrites: { ...createPreview.plannedWrites, branch: "other" } }
  ]) {
    const result = evaluateMutationAdmission({
      requestedActivity: "source_change",
      authorizedScope: true,
      baseCheckout: cleanBaseCheckout,
      createPreview: createPlan
    });
    assert.equal(result.outcome, "decision_needed");
    assert.equal(result.reasonCode, "admission.lane_candidate_unresolved");
  }
});

test("overlong start-preview identifiers fail closed instead of silently truncating admitted evidence", () => {
  for (const field of ["taskId", "branch", "worktreePath", "manifestPath"]) {
    const tooLong = "x".repeat(257);
    const preview = { ...createPreview, [field]: tooLong };
    if (field === "branch") preview.plannedWrites = { ...preview.plannedWrites, branch: tooLong };
    if (field === "worktreePath") preview.plannedWrites = { ...preview.plannedWrites, worktree: tooLong };
    if (field === "manifestPath") preview.plannedWrites = { ...preview.plannedWrites, manifest: tooLong };
    const result = evaluateMutationAdmission({
      requestedActivity: "source_change",
      authorizedScope: true,
      baseCheckout: cleanBaseCheckout,
      createPreview: preview
    });
    assert.equal(result.outcome, "decision_needed");
    assert.equal(result.reasonCode, "admission.lane_candidate_unresolved");
    assert.equal("laneEvidence" in result, false);
  }
});

test("result evidence is metadata-only and omits forbidden raw-retention fields", () => {
  const result = evaluateMutationAdmission({
    requestedActivity: "source_change",
    authorizedScope: true,
    baseCheckout: cleanBaseCheckout,
    managedLane: { ...resumePacket, rawPrompt: "private source" },
    providerPayload: "private provider output",
    reasoningTrace: "private reasoning"
  });
  const serialized = JSON.stringify(result);

  assert.equal(result.mutation, "none; admission decision only");
  for (const forbidden of ["rawPrompt", "providerPayload", "reasoningTrace", "private source", "private provider output", "private reasoning"]) {
    assert.equal(serialized.includes(forbidden), false, `result must not retain ${forbidden}`);
  }
});
