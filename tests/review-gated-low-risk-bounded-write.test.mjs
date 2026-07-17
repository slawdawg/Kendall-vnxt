import assert from "node:assert/strict";
import test from "node:test";

import { buildFakeReviewInput } from "../scripts/lib/review-gated-low-risk-fake-adapter.mjs";
import { runBoundedWriteFakeExecutor } from "../scripts/lib/review-gated-low-risk-bounded-write.mjs";

const now = "2026-07-17T12:00:00.000Z";

test("fake executor is blocked before the human activation checkpoint", () => {
  const packet = runBoundedWriteFakeExecutor(validInput(), { now });

  assert.equal(packet.status, "hold");
  assert.equal(packet.fakeExecutor.blockedBeforeCheckpoint, true);
  assert.equal(packet.fakeExecutor.wouldApply, false);
  assert.equal(packet.fakeExecutor.executed, false);
  assert.equal(packet.execution.attempted, false);
  assert.match(packet.blockers.join("; "), /human activation checkpoint/);
  assert.equal(packet.writePlan.mode, "metadata-only");
  assert.equal(packet.writePlan.files[0], "docs/workflows/example.md");
});

test("all gates plus human activation produce an allowed metadata-only write plan", () => {
  const packet = runBoundedWriteFakeExecutor({
    ...validInput(),
    activationCheckpoint: activation(),
  }, { now });

  assert.equal(packet.status, "ready");
  assert.equal(packet.eligible, true);
  assert.equal(packet.fakeExecutor.wouldApply, true);
  assert.equal(packet.fakeExecutor.executed, false);
  assert.equal(packet.authorityDecision.allowed, false);
  assert.equal(packet.writePlan.applyEligible, true);
  assert.equal(packet.execution.mutation, "none");
});

test("high-risk, ambiguous, stale, rollback, and owner evidence fail closed", () => {
  const highRisk = validInput();
  highRisk.state.changedFiles = ["config/.env"];
  highRisk.state.allowlistedFiles = ["config/.env"];
  highRisk.writePlan.files = ["config/.env"];
  highRisk.activationCheckpoint = activation();
  const highRiskPacket = runBoundedWriteFakeExecutor(highRisk, { now });
  assert.equal(highRiskPacket.status, "hold");
  assert.match(highRiskPacket.blockers.join("; "), /high-risk/);

  const ambiguous = validInput();
  ambiguous.result.status = "CONCERNS";
  ambiguous.activationCheckpoint = activation();
  const ambiguousPacket = runBoundedWriteFakeExecutor(ambiguous, { now });
  assert.equal(ambiguousPacket.status, "hold");
  assert.match(ambiguousPacket.blockers.join("; "), /review result|PASS/);

  const stale = validInput();
  stale.result.reviewedAt = "2026-07-17T11:00:00.000Z";
  stale.activationCheckpoint = activation();
  const stalePacket = runBoundedWriteFakeExecutor(stale, { now });
  assert.equal(stalePacket.status, "hold");
  assert.match(stalePacket.blockers.join("; "), /stale/);

  const rollback = validInput();
  rollback.state.rollback = false;
  rollback.activationCheckpoint = activation();
  const rollbackPacket = runBoundedWriteFakeExecutor(rollback, { now });
  assert.equal(rollbackPacket.status, "hold");
  assert.match(rollbackPacket.blockers.join("; "), /rollback/);

  const owner = validInput();
  owner.writeAuthority.owner = "other-owner";
  owner.activationCheckpoint = activation();
  const ownerPacket = runBoundedWriteFakeExecutor(owner, { now });
  assert.equal(ownerPacket.status, "hold");
  assert.match(ownerPacket.blockers.join("; "), /owner does not match/);

  const staleAuthority = validInput();
  staleAuthority.writeAuthority.checkedAt = "2026-07-17T11:00:00.000Z";
  staleAuthority.activationCheckpoint = activation();
  const staleAuthorityPacket = runBoundedWriteFakeExecutor(staleAuthority, { now });
  assert.equal(staleAuthorityPacket.status, "hold");
  assert.match(staleAuthorityPacket.blockers.join("; "), /authority evidence is missing or stale/);

  const futureAuthority = validInput();
  futureAuthority.writeAuthority.checkedAt = "2026-07-17T13:00:00.000Z";
  futureAuthority.activationCheckpoint = activation();
  const futureAuthorityPacket = runBoundedWriteFakeExecutor(futureAuthority, { now });
  assert.equal(futureAuthorityPacket.status, "hold");
  assert.match(futureAuthorityPacket.blockers.join("; "), /authority evidence is missing or stale/);

  const missingApprover = validInput();
  missingApprover.activationCheckpoint = { ...activation(), approvedBy: "" };
  const missingApproverPacket = runBoundedWriteFakeExecutor(missingApprover, { now });
  assert.equal(missingApproverPacket.status, "hold");
  assert.match(missingApproverPacket.blockers.join("; "), /approver identity/);

  const unsafeApprover = validInput();
  unsafeApprover.activationCheckpoint = { ...activation(), approvedBy: "operator secret token" };
  const unsafeApproverPacket = runBoundedWriteFakeExecutor(unsafeApprover, { now });
  assert.equal(unsafeApproverPacket.status, "hold");
  assert.match(unsafeApproverPacket.blockers.join("; "), /approver identity/);

  const staleActivation = validInput();
  staleActivation.activationCheckpoint = { ...activation(), approvedAt: "2026-07-17T11:00:00.000Z" };
  const staleActivationPacket = runBoundedWriteFakeExecutor(staleActivation, { now });
  assert.equal(staleActivationPacket.status, "hold");
  assert.match(staleActivationPacket.blockers.join("; "), /checkpoint timestamp.*stale/);
});

test("fake executor never executes provider, filesystem, Git, or worker actions", () => {
  const packet = runBoundedWriteFakeExecutor({
    ...validInput(),
    activationCheckpoint: activation(),
    writePlan: {
      ...validInput().writePlan,
      command: "git merge dev",
    },
  }, { now });

  assert.equal(packet.status, "hold");
  assert.equal(packet.fakeExecutor.executed, false);
  assert.equal(packet.execution.attempted, false);
  assert.equal(packet.execution.filesystemWrites, false);
  assert.equal(packet.execution.gitMutations, false);
  assert.equal(packet.execution.providerCalls, false);
  assert.equal(packet.execution.workerLaunch, false);

  const valueIntent = runBoundedWriteFakeExecutor({
    ...validInput(),
    activationCheckpoint: activation(),
    writePlan: { ...validInput().writePlan, script: "git merge dev" },
  }, { now });
  assert.equal(valueIntent.status, "hold");
  assert.match(valueIntent.blockers.join("; "), /external-action intent/);

  for (const note of ["providerCall", "liveModelCall", "gitMerge", "gitPush", "workerLaunch", "networkRequest", "shellCommand", "spawnSync", "mutating file"]) {
    const compactIntent = runBoundedWriteFakeExecutor({
      ...validInput(),
      activationCheckpoint: activation(),
      writePlan: { ...validInput().writePlan, note },
    }, { now });
    assert.equal(compactIntent.status, "hold", note);
    assert.match(compactIntent.blockers.join("; "), /external-action intent/, note);
  }

  for (const note of ["ssh://host", "ftp://host", "rm -rf /", "scp file host:", "curl host", "npm publish", "chmod 777", "mv a b", "cp a b"]) {
    const commandIntent = runBoundedWriteFakeExecutor({
      ...validInput(),
      activationCheckpoint: activation(),
      writePlan: { ...validInput().writePlan, note },
    }, { now });
    assert.equal(commandIntent.status, "hold", note);
    assert.match(commandIntent.blockers.join("; "), /external-action intent/, note);
  }

  for (const key of ["filesystemWrites", "write", "fileWrite", "apply", "sideEffect", "writeFile", "applyPatch"]) {
    const unsupportedIntent = runBoundedWriteFakeExecutor({
      ...validInput(),
      activationCheckpoint: activation(),
      writePlan: { ...validInput().writePlan, [key]: true },
    }, { now });
    assert.equal(unsupportedIntent.status, "hold", key);
    assert.match(unsupportedIntent.blockers.join("; "), /unsupported metadata keys/, key);
  }

  const malformedFiles = runBoundedWriteFakeExecutor({
    ...validInput(),
    activationCheckpoint: activation(),
    writePlan: { ...validInput().writePlan, files: ["docs/workflows/example.md", 42] },
  }, { now });
  assert.equal(malformedFiles.status, "hold");
  assert.match(malformedFiles.blockers.join("; "), /files list is malformed/);

  const malformedOperations = runBoundedWriteFakeExecutor({
    ...validInput(),
    activationCheckpoint: activation(),
    writePlan: { ...validInput().writePlan, operations: ["write-file", 42] },
  }, { now });
  assert.equal(malformedOperations.status, "hold");
  assert.match(malformedOperations.blockers.join("; "), /operations list is malformed/);

  const mismatchedRollback = runBoundedWriteFakeExecutor({
    ...validInput(),
    activationCheckpoint: activation(),
    writePlan: { ...validInput().writePlan, rollbackPath: "revert:other-commit" },
  }, { now });
  assert.equal(mismatchedRollback.status, "hold");
  assert.match(mismatchedRollback.blockers.join("; "), /rollback path does not match/);
});

function validInput() {
  const fake = buildFakeReviewInput("PASS", now);
  return {
    operation: fake.operation,
    reviewRecord: fake.review,
    state: fake.state,
    authority: fake.authority,
    route: {
      available: true,
      mode: "metadata-only",
      model: "5.6 Luna",
      effort: "high",
    },
    result: {
      status: "PASS",
      resultId: "result-1",
      summary: "Bounded metadata-only review summary.",
      reviewedAt: now,
    },
    sourcePacket: {
      packetId: "packet-1",
      sourceRefs: ["source:metadata-only"],
    },
    writeAuthority: {
      recorded: true,
      allowed: true,
      decision: "approved-bounded-write",
      scopeAllowed: true,
      baseSha: fake.state.baseSha,
      headSha: fake.state.headSha,
      diffHash: fake.state.diffHash,
      owner: fake.state.owner,
      worktree: fake.state.worktree,
      checkedAt: now,
    },
    activationCheckpoint: {
      required: true,
      type: "human",
      approved: false,
      exactHead: false,
      baseSha: fake.state.baseSha,
      headSha: fake.state.headSha,
      diffHash: fake.state.diffHash,
      owner: fake.state.owner,
      worktree: fake.state.worktree,
    },
    writePlan: {
      files: fake.state.changedFiles,
      operations: ["write-file"],
      rollbackPath: fake.state.rollbackPath,
    },
  };
}

function activation() {
  return {
    required: true,
    type: "human",
    approved: true,
    approvedBy: "operator@example.test",
    approvedAt: now,
    exactHead: true,
    baseSha: "fake-base-123",
    headSha: "fake-head-456",
    diffHash: "fake-diff-789",
    owner: "fake-owner",
    worktree: "/managed/fake-worktree",
  };
}
