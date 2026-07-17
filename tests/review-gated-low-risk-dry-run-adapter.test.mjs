import assert from "node:assert/strict";
import test from "node:test";

import { buildFakeReviewInput } from "../scripts/lib/review-gated-low-risk-fake-adapter.mjs";
import { evaluateReviewGatedLowRiskDryRun } from "../scripts/lib/review-gated-low-risk-dry-run-adapter.mjs";

const now = "2026-07-17T12:00:00.000Z";

test("dry-run adapter projects complete workspace/readiness evidence without execution authority", () => {
  const packet = evaluateReviewGatedLowRiskDryRun(validDryRunInput(), { now });

  assert.equal(packet.status, "eligible");
  assert.equal(packet.mode, "dry-run-integration");
  assert.equal(packet.eligible, true);
  assert.equal(packet.authorityDecision.allowed, false);
  assert.deepEqual(packet.binding, {
    baseSha: "fake-base-123",
    headSha: "fake-head-456",
    diffHash: "fake-diff-789",
    owner: "fake-owner",
    worktree: "/managed/fake-worktree",
    changedFiles: ["docs/workflows/example.md"],
    allowlistedFiles: ["docs/workflows/example.md"],
  });
  assert.deepEqual(packet.execution, {
    dryRun: true,
    commandsExecuted: false,
    providerCalls: false,
    liveModelCalls: false,
    workerLaunch: false,
    gitHubMutation: false,
    merge: false,
    cleanup: false,
    mutation: "none",
  });
});

test("dry-run adapter holds missing, stale, and mismatched reports", () => {
  const missing = evaluateReviewGatedLowRiskDryRun({ review: validDryRunInput().review }, { now });
  assert.equal(missing.status, "hold");
  assert.match(missing.blockers.join("; "), /workspace evidence report|delivery-readiness report/);

  const stale = validDryRunInput();
  stale.deliveryReadiness.evidence.statusChecks.checkedAt = "2026-07-17T11:00:00.000Z";
  const stalePacket = evaluateReviewGatedLowRiskDryRun(stale, { now });
  assert.equal(stalePacket.status, "hold");
  assert.match(stalePacket.blockers.join("; "), /status checks passed evidence is stale/);

  const mismatch = validDryRunInput();
  mismatch.workspaceEvidence.headSha = "other-head";
  const mismatchPacket = evaluateReviewGatedLowRiskDryRun(mismatch, { now });
  assert.equal(mismatchPacket.status, "hold");
  assert.match(mismatchPacket.blockers.join("; "), /headSha does not match/);
});

test("dry-run adapter rejects mutation, command, provider, worker, GitHub, merge, and cleanup attempts", () => {
  const attempted = validDryRunInput();
  attempted.execution = {
    command: "git merge dev",
    providerCalls: true,
    workerLaunch: "start",
    gitHubMutation: "push",
    merge: true,
    cleanup: "apply",
  };
  const packet = evaluateReviewGatedLowRiskDryRun(attempted, { now });

  assert.equal(packet.status, "hold");
  assert.equal(packet.authorityDecision.allowed, false);
  assert.match(packet.blockers.join("; "), /external action intent rejected/);
  assert.equal(packet.execution.commandsExecuted, false);
  assert.equal(packet.execution.providerCalls, false);
  assert.equal(packet.execution.workerLaunch, false);
  assert.equal(packet.execution.gitHubMutation, false);
  assert.equal(packet.execution.merge, false);
  assert.equal(packet.execution.cleanup, false);

  for (const operation of ["execute git merge", "merge", "provider call"]) {
    const operationAttempt = evaluateReviewGatedLowRiskDryRun({ ...validDryRunInput(), operation }, { now });
    assert.equal(operationAttempt.status, "hold", operation);
    assert.match(operationAttempt.blockers.join("; "), /action intent rejected|excluded high-risk class/);
  }
});

test("dry-run adapter merges readiness exclusions and rejects nested action intents", () => {
  const excluded = validDryRunInput();
  excluded.deliveryReadiness.disallowedFiles = ["config/.env"];
  const excludedPacket = evaluateReviewGatedLowRiskDryRun(excluded, { now });
  assert.equal(excludedPacket.status, "hold");
  assert.match(excludedPacket.blockers.join("; "), /high-risk or disallowed files/);

  for (const attempted of [
    { process: { spawn: true } },
    { shell: "git merge dev" },
    { request: { intent: "provider call" } },
    { networkAccess: true },
    { sourceMutation: true },
    { writeFile: "notes.md" },
    { deleteFiles: ["notes.md"] },
    { spawnSync: true },
    { workerProcessLaunch: true },
    { gitPush: true },
    { removeFiles: ["notes.md"] },
    { pruneWorkspace: true },
    { destroyState: true },
    { httpRequest: "https://example.invalid" },
  ]) {
    const packet = evaluateReviewGatedLowRiskDryRun({ ...validDryRunInput(), ...attempted }, { now });
    assert.equal(packet.status, "hold");
    assert.match(packet.blockers.join("; "), /action intent rejected/);
  }

  const evidenceRef = evaluateReviewGatedLowRiskDryRun({
    ...validDryRunInput(),
    commandRef: "evidence:command-check",
    providerRef: "evidence:provider-policy",
  }, { now });
  assert.equal(evidenceRef.status, "eligible");

  const executableReference = evaluateReviewGatedLowRiskDryRun({
    ...validDryRunInput(),
    commandRef: "git merge dev",
  }, { now });
  assert.equal(executableReference.status, "hold");
});

test("dry-run adapter fails closed for malformed root/options and operation values", () => {
  const nullRoot = evaluateReviewGatedLowRiskDryRun(null, { now });
  assert.equal(nullRoot.status, "hold");
  assert.match(nullRoot.blockers.join("; "), /workspace evidence report/);
  assert.doesNotThrow(() => evaluateReviewGatedLowRiskDryRun(validDryRunInput(), null));

  const malformedOperation = evaluateReviewGatedLowRiskDryRun({ ...validDryRunInput(), operation: false }, { now });
  assert.equal(malformedOperation.status, "hold");
  assert.match(malformedOperation.blockers.join("; "), /operation is missing or not a string/);

  for (const operation of ["shell", "command", "push", "commit", "reset", "network", "write", "delete"]) {
    const packet = evaluateReviewGatedLowRiskDryRun({ ...validDryRunInput(), operation }, { now });
    assert.equal(packet.status, "hold", operation);
    assert.match(packet.blockers.join("; "), /operation is not an allowlisted report-only class|action intent rejected/);
  }
});

test("dry-run adapter preserves fail-closed review outcomes from the fake evidence source", () => {
  for (const scenario of ["CONCERNS", "BLOCKED", "STALE", "MISMATCH", "FORBIDDEN_METADATA", "MODEL_ROUTE", "HIGH_RISK", "STOP_LINE", "ROLLBACK"]) {
    const fake = buildFakeReviewInput(scenario, now);
    const packet = evaluateReviewGatedLowRiskDryRun(toDryRunInput(fake), { now });
    assert.equal(packet.status, "hold", scenario);
    assert.equal(packet.authorityDecision.allowed, false, scenario);
  }
});

function validDryRunInput() {
  return toDryRunInput(buildFakeReviewInput("PASS", now));
}

function toDryRunInput(fake) {
  return {
    operation: fake.operation,
    review: fake.review,
    workspaceEvidence: fake.state,
    deliveryReadiness: {
      exactHead: fake.state.exactHead,
      statusChecks: fake.state.statusChecks,
      reviewThreads: fake.state.reviewThreads,
      rollback: fake.state.rollback,
      rollbackPath: fake.state.rollbackPath,
      evidence: fake.state.evidence,
      cleanupWithinNamedLane: fake.state.cleanupWithinNamedLane,
      authority: fake.authority,
    },
  };
}
