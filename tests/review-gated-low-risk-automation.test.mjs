import assert from "node:assert/strict";
import test from "node:test";

import { evaluateReviewGatedLowRiskAutomation } from "../scripts/lib/review-gated-low-risk-automation.mjs";

const now = "2026-07-17T12:00:00.000Z";

test("returns report-only eligibility when model PASS and deterministic gates match", () => {
  const packet = evaluateReviewGatedLowRiskAutomation(validInput(), { now });

  assert.equal(packet.status, "eligible");
  assert.equal(packet.eligible, true);
  assert.equal(packet.mode, "report-only");
  assert.equal(packet.authorityDecision.allowed, false);
  assert.equal(packet.metadataOnly, true);
  assert.equal(packet.rawPayloadRetained, false);
  assert.deepEqual(packet.blockers, []);
});

test("holds when review is missing, ambiguous, failed, or stale", () => {
  for (const review of [
    {},
    { ...validInput().review, status: "CONCERNS" },
    { ...validInput().review, status: "BLOCKED" },
    { ...validInput().review, reviewedAt: "2026-07-17T11:30:00.000Z" },
  ]) {
    const packet = evaluateReviewGatedLowRiskAutomation({ ...validInput(), review }, { now });
    assert.equal(packet.status, "hold");
    assert.equal(packet.eligible, false);
  }
});

test("holds on stale or mismatched exact-state bindings", () => {
  for (const field of ["baseSha", "headSha", "diffHash", "owner", "worktree"]) {
    const input = validInput();
    input.review[field] = `${input.review[field]}-changed`;
    const packet = evaluateReviewGatedLowRiskAutomation(input, { now });
    assert.equal(packet.status, "hold");
    assert.match(packet.blockers.join("; "), new RegExp(field));
  }
});

test("holds when allowlist, high-risk exclusions, checks, threads, authority, or rollback are unsafe", () => {
  const cases = [
    ["changed files are not exactly covered by the allowlist", { state: { changedFiles: ["docs/other.md"] } }],
    ["high-risk or disallowed files", { state: { disallowedFiles: ["services/supervisor/auth.py"] } }],
    ["status checks passed gate", { state: { statusChecks: false } }],
    ["review threads resolved gate", { state: { reviewThreads: false } }],
    ["authority decision recorded gate", { authority: { recorded: false } }],
    ["rollback path recorded gate", { state: { rollback: false } }],
  ];

  for (const [expected, override] of cases) {
    const input = validInput();
    if (override.state) input.state = { ...input.state, ...override.state };
    if (override.authority) input.authority = { ...input.authority, ...override.authority };
    const packet = evaluateReviewGatedLowRiskAutomation(input, { now });
    assert.equal(packet.status, "hold");
    assert.match(packet.blockers.join("; "), new RegExp(expected));
  }
});

test("holds and redacts when raw payload fields or duplicate retries appear", () => {
  const raw = evaluateReviewGatedLowRiskAutomation({
    ...validInput(),
    review: { ...validInput().review, rawPrompt: "do unsafe thing" },
  }, { now });
  assert.equal(raw.status, "hold");
  assert.match(raw.blockers.join("; "), /forbidden raw payload/);
  assert.equal(Object.hasOwn(raw.review, "rawPrompt"), false);

  const retry = evaluateReviewGatedLowRiskAutomation({ ...validInput(), retryCount: 1 }, { now });
  assert.equal(retry.status, "hold");
  assert.match(retry.blockers.join("; "), /duplicate review retry/);

  const malformedRetry = evaluateReviewGatedLowRiskAutomation({ ...validInput(), retryCount: "unknown" }, { now });
  assert.equal(malformedRetry.status, "hold");
  assert.match(malformedRetry.blockers.join("; "), /retry count is malformed/);
});

test("holds excluded operations and high-risk paths even when caller marks them allowlisted", () => {
  const operation = evaluateReviewGatedLowRiskAutomation({ ...validInput(), operation: "provider-call" }, { now });
  assert.equal(operation.status, "hold");
  assert.match(operation.blockers.join("; "), /excluded high-risk class/);

  const pathInput = validInput();
  pathInput.state.changedFiles = ["services/supervisor/auth.py"];
  pathInput.state.allowlistedFiles = ["services/supervisor/auth.py"];
  const path = evaluateReviewGatedLowRiskAutomation(pathInput, { now });
  assert.equal(path.status, "hold");
  assert.match(path.blockers.join("; "), /high-risk or disallowed files/);
});

test("holds malformed lists, invalid evaluator timestamps, and unsafe authority metadata", () => {
  const malformedList = validInput();
  malformedList.state.changedFiles = ["docs/a.md", null];
  const listPacket = evaluateReviewGatedLowRiskAutomation(malformedList, { now });
  assert.equal(listPacket.status, "hold");
  assert.match(listPacket.blockers.join("; "), /changedFiles list is malformed/);

  const invalidNow = evaluateReviewGatedLowRiskAutomation(validInput(), { now: "not-a-date" });
  assert.equal(invalidNow.status, "hold");
  assert.match(invalidNow.blockers.join("; "), /evaluation timestamp/);

  const unsafeAuthority = validInput();
  unsafeAuthority.authority.recoveryPath = "raw prompt completion token";
  const authorityPacket = evaluateReviewGatedLowRiskAutomation(unsafeAuthority, { now });
  assert.equal(authorityPacket.status, "hold");
  assert.match(authorityPacket.blockers.join("; "), /metadata contains|recovery path/);
});

test("requires canonical deny stop lines and rejects unsafe path forms", () => {
  const permissive = validInput();
  permissive.authority.stopLines = ["mutation is allowed", "provider use is okay", "bypass is okay"];
  const permissivePacket = evaluateReviewGatedLowRiskAutomation(permissive, { now });
  assert.equal(permissivePacket.status, "hold");
  assert.match(permissivePacket.blockers.join("; "), /stop line/);

  const windows = validInput();
  windows.state.changedFiles = ["services\\supervisor\\auth.py"];
  windows.state.allowlistedFiles = ["services\\supervisor\\auth.py"];
  const windowsPacket = evaluateReviewGatedLowRiskAutomation(windows, { now });
  assert.equal(windowsPacket.status, "hold");

  const credential = validInput();
  credential.state.changedFiles = ["certs/service.pfx"];
  credential.state.allowlistedFiles = ["certs/service.pfx"];
  const credentialPacket = evaluateReviewGatedLowRiskAutomation(credential, { now });
  assert.equal(credentialPacket.status, "hold");

  const destructiveRollback = validInput();
  destructiveRollback.state.rollbackPath = "delete-all";
  const rollbackPacket = evaluateReviewGatedLowRiskAutomation(destructiveRollback, { now });
  assert.equal(rollbackPacket.status, "hold");
  assert.match(rollbackPacket.blockers.join("; "), /rollback path reference/);

  const cleanup = validInput();
  cleanup.operation = "Cleanup/foo";
  cleanup.state.cleanupWithinNamedLane = false;
  const cleanupPacket = evaluateReviewGatedLowRiskAutomation(cleanup, { now });
  assert.equal(cleanupPacket.status, "hold");
  assert.match(cleanupPacket.blockers.join("; "), /cleanup is outside/);
});

test("holds cleanup outside the named managed lane and preserves stop/recovery evidence", () => {
  const packet = evaluateReviewGatedLowRiskAutomation({
    ...validInput(),
    operation: "cleanup",
    state: { ...validInput().state, cleanupWithinNamedLane: false },
    recoveryPath: "Keep the lane for inspection and request explicit direction.",
  }, { now });

  assert.equal(packet.status, "hold");
  assert.match(packet.blockers.join("; "), /cleanup is outside/);
  assert.equal(packet.authorityDecision.allowed, false);
  assert.match(packet.recoveryPath, /explicit direction/);
  assert.ok(packet.stopLines.length >= 3);
});

function validInput() {
  const binding = {
    baseSha: "base-123",
    headSha: "head-456",
    diffHash: "diff-789",
    owner: "runner-1",
    worktree: "/managed/worktree",
  };
  return {
    operation: "documentation-maintenance",
    ...binding,
    review: {
      ...binding,
      status: "PASS",
      reviewId: "review-1",
      packetId: "packet-1",
      model: "5.6 Luna",
      effort: "high",
      reviewedAt: now,
    },
    state: {
      ...binding,
      changedFiles: ["docs/workflows/example.md"],
      allowlistedFiles: ["docs/workflows/example.md"],
      disallowedFiles: [],
      exactHead: true,
      statusChecks: true,
      reviewThreads: true,
      rollback: true,
      rollbackPath: "revert:commit-123",
      evidence: {
        exactHead: { headSha: "head-456", checkedAt: now, ref: "state:head" },
        statusChecks: { headSha: "head-456", checkedAt: now, ref: "checks:head" },
        reviewThreads: { headSha: "head-456", checkedAt: now, ref: "threads:head" },
        rollback: { headSha: "head-456", checkedAt: now, ref: "rollback:commit-123" },
      },
      cleanupWithinNamedLane: true,
    },
    authority: {
      recorded: true,
      scopeAllowed: true,
      decision: "approved-for-report-only-evaluation",
      stopLines: ["no mutation, merge, or cleanup", "no provider or live-model calls", "no bypass or override"],
      recoveryPath: "Preserve evidence and request explicit direction.",
      evidence: { headSha: "head-456", checkedAt: now, ref: "authority:packet-1" },
    },
  };
}
