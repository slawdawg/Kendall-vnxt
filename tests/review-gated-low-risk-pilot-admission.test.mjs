import assert from "node:assert/strict";
import test from "node:test";

import { buildFakeReviewInput } from "../scripts/lib/review-gated-low-risk-fake-adapter.mjs";
import { evaluateBoundedWritePlan } from "../scripts/lib/review-gated-low-risk-bounded-write.mjs";
import { evaluatePilotAdmission } from "../scripts/lib/review-gated-low-risk-pilot-admission.mjs";
import { evaluatePolicyActivationEligibility } from "../scripts/lib/review-gated-low-risk-policy-eligibility.mjs";

const now = "2026-07-17T12:00:00.000Z";

test("pilot admission defaults to HOLD when approval is missing", () => {
  const packet = evaluatePilotAdmission(validInput(), { now });
  assert.equal(packet.status, "HOLD");
  assert.equal(packet.approved, false);
  assert.match(packet.blockers.join("; "), /pilot approval/);
  assert.equal(packet.execution.attempted, false);
  assert.equal(packet.metadataOnly, true);
});

test("stale or mismatched checkpoint evidence holds", () => {
  const stale = validInput();
  stale.admissionPacket.approval = { ...approval(), approvedAt: "2026-07-17T11:00:00.000Z" };
  const stalePacket = evaluatePilotAdmission(stale, { now });
  assert.equal(stalePacket.status, "HOLD");
  assert.match(stalePacket.blockers.join("; "), /stale/);

  const mismatch = validInput();
  mismatch.admissionPacket.approval = { ...approval(), headSha: "other-head" };
  const mismatchPacket = evaluatePilotAdmission(mismatch, { now });
  assert.equal(mismatchPacket.status, "HOLD");
  assert.match(mismatchPacket.blockers.join("; "), /headSha/);
});

test("first pilot admission does not require post-pilot artifacts", () => {
  const synthetic = validInput();
  synthetic.admissionPacket.approval = approval();
  synthetic.admissionPacket.pilotResult.synthetic = true;
  const syntheticPacket = evaluatePilotAdmission(synthetic, { now });
  assert.equal(syntheticPacket.status, "READY");
  assert.equal(syntheticPacket.execution.attempted, false);

  const policyPacket = evaluatePolicyActivationEligibility({
    state: synthetic.boundedWriteInput.state,
    pilotResult: synthetic.admissionPacket.pilotResult,
    retrospective: synthetic.admissionPacket.retrospective,
    policy: synthetic.admissionPacket.policy,
  }, { now });
  assert.equal(policyPacket.status, "HOLD");
  assert.match(policyPacket.blockers.join("; "), /non-synthetic/);

  const fixture = validInput();
  fixture.admissionPacket.approval = approval();
  fixture.admissionPacket.pilotResult.evidenceClass = "fixture";
  const fixturePacket = evaluatePilotAdmission(fixture, { now });
  assert.equal(fixturePacket.status, "READY");

  const missingRetro = validInput();
  missingRetro.admissionPacket.approval = approval();
  delete missingRetro.admissionPacket.retrospective;
  const missingRetroPacket = evaluatePilotAdmission(missingRetro, { now });
  assert.equal(missingRetroPacket.status, "READY");

  const mismatchedResult = validInput();
  mismatchedResult.admissionPacket.approval = approval();
  mismatchedResult.admissionPacket.pilotResult.headSha = "other-head";
  const mismatchedResultPacket = evaluatePilotAdmission(mismatchedResult, { now });
  assert.equal(mismatchedResultPacket.status, "READY");

  for (const reference of ["retrospectiv:foo", `retrospective:${"a".repeat(161)}`, "retrospective:secret-token"]) {
    const unsafeReference = validInput();
    unsafeReference.admissionPacket.approval = approval();
    unsafeReference.admissionPacket.retrospective.reference = reference;
    const unsafeReferencePacket = evaluatePilotAdmission(unsafeReference, { now });
    assert.equal(unsafeReferencePacket.status, "READY", reference);
  }
});

test("policy activation eligibility requires a real exact-bound pilot and retrospective", () => {
  const input = validInput();
  const state = input.boundedWriteInput.state;
  input.admissionPacket.approval = approval();
  const admission = evaluatePilotAdmission(input, { now });
  assert.equal(admission.status, "READY");
  const eligible = evaluatePolicyActivationEligibility({
    state,
    admission,
    pilotResult: input.admissionPacket.pilotResult,
    retrospective: input.admissionPacket.retrospective,
    policy: input.admissionPacket.policy,
  }, { now });
  assert.equal(eligible.status, "READY");
  assert.equal(eligible.active, false);
  assert.equal(eligible.allowed, false);

  const mismatch = input.admissionPacket.pilotResult;
  const blocked = evaluatePolicyActivationEligibility({
    state,
    pilotResult: { ...mismatch, headSha: "other-head" },
    retrospective: input.admissionPacket.retrospective,
    policy: input.admissionPacket.policy,
  }, { now });
  assert.equal(blocked.status, "HOLD");
  assert.match(blocked.blockers.join("; "), /headSha/);
});

test("pilot objective must match the reviewed operation", () => {
  const input = validInput();
  input.admissionPacket.approval = approval();
  input.admissionPacket.objective = "documentation-deploy-production";
  const packet = evaluatePilotAdmission(input, { now });
  assert.equal(packet.status, "HOLD");
  assert.match(packet.blockers.join("; "), /objective/);
});

test("nested read-only review state remains exact-bound", () => {
  const input = validInput();
  input.boundedWriteInput.readOnlyReviewInput = {
    operation: input.boundedWriteInput.operation,
    reviewRecord: input.boundedWriteInput.reviewRecord,
    state: input.boundedWriteInput.state,
    authority: input.boundedWriteInput.authority,
    route: input.boundedWriteInput.route,
    result: input.boundedWriteInput.result,
    sourcePacket: input.boundedWriteInput.sourcePacket,
  };
  delete input.boundedWriteInput.state;
  input.admissionPacket.approval = approval();
  const packet = evaluatePilotAdmission(input, { now });
  assert.equal(packet.status, "READY");
});

test("high-risk scope and expired approval fail closed", () => {
  const highRisk = validInput();
  highRisk.admissionPacket.allowlistedFiles = ["config/.env"];
  highRisk.boundedWriteInput.state.changedFiles = ["config/.env"];
  highRisk.boundedWriteInput.state.allowlistedFiles = ["config/.env"];
  highRisk.boundedWriteInput.writePlan.files = ["config/.env"];
  highRisk.boundedWriteInput.activationCheckpoint = boundedActivation(highRisk.boundedWriteInput.state);
  const highRiskPacket = evaluatePilotAdmission(highRisk, { now });
  assert.equal(highRiskPacket.status, "HOLD");
  assert.match(highRiskPacket.blockers.join("; "), /high-risk/);

  const expired = validInput();
  expired.admissionPacket.approval = { ...approval(), approvedAt: "2026-07-17T11:30:00.000Z" };
  const expiredPacket = evaluatePilotAdmission(expired, { now });
  assert.equal(expiredPacket.status, "HOLD");
  assert.match(expiredPacket.blockers.join("; "), /stale/);

  const tooMany = validInput();
  tooMany.admissionPacket.provisionalLimits.maxFiles = 0;
  const tooManyPacket = evaluatePilotAdmission(tooMany, { now });
  assert.equal(tooManyPacket.status, "HOLD");
  assert.match(tooManyPacket.blockers.join("; "), /maxFiles/);

  const unsafeRecovery = validInput();
  unsafeRecovery.admissionPacket.recovery.path = "secret token recovery";
  const unsafeRecoveryPacket = evaluatePilotAdmission(unsafeRecovery, { now });
  assert.equal(unsafeRecoveryPacket.status, "HOLD");
  assert.match(unsafeRecoveryPacket.blockers.join("; "), /recovery owner or path/);

  for (const path of ["run command now", "delete:/tmp/x", "https://example", "restore:fake", "revert:git merge dev", "revert:git push", "preserve:git reset", "inspect:network", "request:write-file", "revert:echo", "revert:apply-patch"]) {
    const unsafePath = validInput();
    unsafePath.admissionPacket.recovery.path = path;
    const unsafePathPacket = evaluatePilotAdmission(unsafePath, { now });
    assert.equal(unsafePathPacket.status, "HOLD", path);
    assert.match(unsafePathPacket.blockers.join("; "), /recovery owner or path/, path);
  }
});

test("synthetic approved checkpoint remains metadata-only evidence", () => {
  const input = validInput();
  input.admissionPacket.approval = approval();
  const packet = evaluatePilotAdmission(input, { now });
  assert.equal(packet.status, "READY");
  assert.equal(packet.approved, true);
  assert.equal(packet.execution.attempted, false);
  assert.equal(packet.execution.applied, false);
  assert.equal(packet.execution.mutation, "none");
  assert.equal(packet.active, false);
  assert.equal(packet.allowed, false);
  assert.equal(packet.authorityDecision.allowed, false);
  assert.equal(packet.authorityDecision.active, false);
  assert.equal(packet.metadataOnly, true);
  assert.equal(packet.rawPayloadRetained, false);
});

function validInput() {
  const fake = buildFakeReviewInput("PASS", now);
  const boundedWriteInput = {
    operation: fake.operation,
    reviewRecord: fake.review,
    state: fake.state,
    authority: fake.authority,
    route: { available: true, mode: "metadata-only", model: "5.6 Luna", effort: "high" },
    result: { status: "PASS", resultId: "result-1", summary: "Bounded review.", reviewedAt: now },
    sourcePacket: { packetId: "packet-1", sourceRefs: ["source:metadata-only"] },
    writeAuthority: {
      recorded: true, allowed: true, decision: "approved-bounded-write", scopeAllowed: true,
      baseSha: fake.state.baseSha, headSha: fake.state.headSha, diffHash: fake.state.diffHash,
      owner: fake.state.owner, worktree: fake.state.worktree, checkedAt: now,
    },
    activationCheckpoint: boundedActivation(fake.state),
    writePlan: { files: fake.state.changedFiles, operations: ["write-file"], rollbackPath: fake.state.rollbackPath },
  };
  const boundedWritePlan = evaluateBoundedWritePlan(boundedWriteInput, { now });
  return {
    boundedWriteInput,
    boundedWritePlan,
    admissionPacket: {
      objective: "documentation-maintenance",
      allowlistedFiles: fake.state.changedFiles,
      owner: fake.state.owner,
      worktree: fake.state.worktree,
      baseSha: fake.state.baseSha,
      headSha: fake.state.headSha,
      diffHash: fake.state.diffHash,
      evidence: {
        review: { status: "PASS", checkedAt: now },
        checks: { passed: true, checkedAt: now },
        rollback: { passed: true, path: fake.state.rollbackPath, checkedAt: now },
        exactHead: { headSha: fake.state.headSha, checkedAt: now },
      },
      provisionalLimits: { maxFiles: 5, timeoutMs: 60000, maxRetries: 1 },
      splitTriggers: ["more than 5 files", "any high-risk path"],
      recovery: { owner: fake.state.owner, path: fake.state.rollbackPath },
      approval: { required: true, approved: false },
      pilotResult: { completed: true, synthetic: false, status: "PASS", resultId: "pilot-result-1", completedAt: now, owner: fake.state.owner, worktree: fake.state.worktree, baseSha: fake.state.baseSha, headSha: fake.state.headSha, diffHash: fake.state.diffHash },
      retrospective: { accepted: true, reference: "retrospective:pilot-1", acceptedBy: "operator@example.test", acceptedAt: now },
      policy: { explicit: true, mode: "standard-delivery", batchMode: "per-epic" },
    },
  };
}

function boundedActivation(state) {
  return { required: true, type: "human", approved: true, approvedBy: "operator@example.test", approvedAt: now, exactHead: true, baseSha: state.baseSha, headSha: state.headSha, diffHash: state.diffHash, owner: state.owner, worktree: state.worktree };
}

function approval() {
  return { required: true, approved: true, approvedBy: "operator@example.test", approvedAt: now, checkpointId: "pilot-checkpoint-1", owner: "fake-owner", worktree: "/managed/fake-worktree", baseSha: "fake-base-123", headSha: "fake-head-456", diffHash: "fake-diff-789" };
}
