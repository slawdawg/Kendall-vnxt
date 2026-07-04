import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const lifecycleRoot = new URL("../packages/workflow-core/src/manager-control-plane/", import.meta.url);
const workflowCoreIndexPath = new URL("../packages/workflow-core/src/index.ts", import.meta.url);
const tscPath = "apps/dashboard/node_modules/.bin/tsc";

test("manager lifecycle domain is exported from workflow-core", async () => {
  assert.equal(existsSync(new URL("index.ts", lifecycleRoot)), true, "missing manager lifecycle namespace");

  const workflowCoreIndex = await readFile(workflowCoreIndexPath, "utf8");
  assert.match(workflowCoreIndex, /export \* from "\.\/manager-control-plane";/);

  for (const moduleName of [
    "clock.ts",
    "result.ts",
    "candidate-lifecycle.ts",
    "work-item-lifecycle.ts",
    "lease-lifecycle.ts",
    "recovery-policy.ts"
  ]) {
    assert.equal(existsSync(new URL(moduleName, lifecycleRoot)), true, `missing ${moduleName}`);
  }
});

test("candidate eligibility transitions require bounded decision evidence", async () => {
  const {
    createManualClock,
    evaluateCandidateEligibility,
    makeCandidateWorkPacketFixture
  } = await loadLifecycleDomain();

  const clock = createManualClock("2026-06-30T00:00:00.000Z");
  const candidate = makeCandidateWorkPacketFixture({ status: "blocked" });
  const eligible = evaluateCandidateEligibility(candidate, {
    status: "eligible",
    policyReason: "source owned backend proof with focused verification",
    evidenceRefs: ["evidence-1"],
    clock
  });

  assert.equal(eligible.ok, true);
  assert.equal(eligible.value.candidate.status, "eligible");
  assert.equal(eligible.value.candidate.updatedAt, "2026-06-30T00:00:00.000Z");
  assert.equal(eligible.value.decisionRecord.policyReason, "source owned backend proof with focused verification");
  assert.equal(eligible.value.decisionRecord.authorityClass, candidate.authorityClass);
  assert.equal(eligible.value.decisionRecord.sourceRefs, candidate.sourceRefs);
  assert.equal(eligible.value.decisionRecord.verificationTargets, candidate.verificationTargets);
  assert.deepEqual(eligible.value.decisionRecord.evidenceRefs, ["evidence-1"]);
  assert.deepEqual(eligible.evidenceRefs, ["evidence-1"]);

  const invalidStatus = evaluateCandidateEligibility(candidate, {
    status: "queued",
    policyReason: "bad status",
    evidenceRefs: ["evidence-1"],
    clock
  });
  assert.equal(invalidStatus.ok, false);
  assert.equal(invalidStatus.code, "invalid_candidate_status");

  const missingEvidence = evaluateCandidateEligibility(candidate, {
    status: "eligible",
    policyReason: "",
    evidenceRefs: [],
    clock
  });
  assert.equal(missingEvidence.ok, false);
  assert.equal(missingEvidence.code, "missing_evidence");
});

test("work item lifecycle accepts only approved transitions and preserves identity", async () => {
  const {
    createManualClock,
    transitionWorkItem,
    makeWorkItemFixture
  } = await loadLifecycleDomain();

  const clock = createManualClock("2026-06-30T00:01:00.000Z");
  const eligible = makeWorkItemFixture({ status: "eligible", attemptCount: 0, leaseId: null });
  const queued = transitionWorkItem(eligible, {
    toStatus: "queued",
    evidenceRefs: ["evidence-queued"],
    clock
  });

  assert.equal(queued.ok, true);
  assert.equal(queued.value.status, "queued");
  assert.equal(queued.value.workItemId, eligible.workItemId);
  assert.equal(queued.value.dedupeKey, eligible.dedupeKey);
  assert.equal(queued.value.updatedAt, "2026-06-30T00:01:00.000Z");

  const leased = transitionWorkItem(queued.value, {
    toStatus: "leased",
    leaseId: "lease-1",
    evidenceRefs: ["evidence-lease"],
    clock
  });
  assert.equal(leased.ok, true);
  assert.equal(leased.value.status, "leased");
  assert.equal(leased.value.leaseId, "lease-1");
  assert.equal(leased.value.attemptCount, 1);

  const running = transitionWorkItem(leased.value, {
    toStatus: "running",
    leaseId: "lease-1",
    evidenceRefs: ["evidence-running"],
    clock
  });
  assert.equal(running.ok, true);
  assert.equal(running.value.status, "running");

  const completed = transitionWorkItem(running.value, {
    toStatus: "completed",
    leaseId: "lease-1",
    evidenceRefs: ["evidence-completed"],
    clock
  });
  assert.equal(completed.ok, true);
  assert.equal(completed.value.status, "completed");

  const reissued = transitionWorkItem(completed.value, {
    toStatus: "leased",
    leaseId: "lease-2",
    evidenceRefs: ["evidence-reissue"],
    clock
  });
  assert.equal(reissued.ok, false);
  assert.equal(reissued.code, "terminal_state");

  const invalid = transitionWorkItem(eligible, {
    toStatus: "running",
    leaseId: "lease-1",
    evidenceRefs: ["evidence-invalid"],
    clock
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, "invalid_transition");

  const duplicateLease = transitionWorkItem(makeWorkItemFixture({ status: "queued", leaseId: "lease-existing" }), {
    toStatus: "leased",
    leaseId: "lease-2",
    evidenceRefs: ["evidence-duplicate"],
    clock
  });
  assert.equal(duplicateLease.ok, false);
  assert.equal(duplicateLease.code, "stale_lease");

  const runningWithoutLease = transitionWorkItem(makeWorkItemFixture({ status: "running", leaseId: "lease-1" }), {
    toStatus: "failed",
    evidenceRefs: ["evidence-missing-lease"],
    clock
  });
  assert.equal(runningWithoutLease.ok, false);
  assert.equal(runningWithoutLease.code, "stale_lease");
});

test("work item lifecycle covers every approved transition edge", async () => {
  const {
    createManualClock,
    transitionWorkItem,
    makeWorkItemFixture
  } = await loadLifecycleDomain();

  const clock = createManualClock("2026-06-30T00:01:00.000Z");
  const cases = [
    { from: "eligible", to: "queued" },
    { from: "queued", to: "leased", leaseId: "lease-1", expectedLeaseId: "lease-1" },
    { from: "leased", to: "running", currentLeaseId: "lease-1", leaseId: "lease-1", expectedLeaseId: "lease-1" },
    { from: "running", to: "completed", currentLeaseId: "lease-1", leaseId: "lease-1", expectedLeaseId: "lease-1" },
    { from: "running", to: "failed", currentLeaseId: "lease-1", leaseId: "lease-1", expectedLeaseId: "lease-1" },
    { from: "running", to: "blocked", currentLeaseId: "lease-1", leaseId: "lease-1", expectedLeaseId: "lease-1" },
    { from: "running", to: "expired", currentLeaseId: "lease-1", leaseId: "lease-1", expectedLeaseId: "lease-1" },
    { from: "failed", to: "queued", currentLeaseId: "lease-1", expectedLeaseId: null },
    { from: "failed", to: "quarantined", currentLeaseId: "lease-1", expectedLeaseId: null },
    { from: "failed", to: "blocked", currentLeaseId: "lease-1", expectedLeaseId: "lease-1" },
    { from: "expired", to: "queued", currentLeaseId: "lease-1", expectedLeaseId: null },
    { from: "expired", to: "quarantined", currentLeaseId: "lease-1", expectedLeaseId: null },
    { from: "blocked", to: "closed", currentLeaseId: "lease-1", expectedLeaseId: null },
    { from: "completed", to: "closed", currentLeaseId: "lease-1", expectedLeaseId: null },
    { from: "quarantined", to: "closed", currentLeaseId: "lease-1", expectedLeaseId: null },
    { from: "refilling", to: "queued", expectedLeaseId: null },
    { from: "refilling", to: "blocked", expectedLeaseId: null }
  ];

  for (const entry of cases) {
    const workItem = makeWorkItemFixture({
      status: entry.from,
      leaseId: entry.currentLeaseId ?? null,
      attemptCount: entry.currentLeaseId ? 1 : 0
    });
    const result = transitionWorkItem(workItem, {
      toStatus: entry.to,
      leaseId: entry.leaseId,
      evidenceRefs: [`evidence-${entry.from}-${entry.to}`],
      clock
    });
    assert.equal(result.ok, true, `${entry.from} -> ${entry.to}`);
    assert.equal(result.value.status, entry.to, `${entry.from} -> ${entry.to}`);
    assert.equal(result.value.leaseId ?? null, entry.expectedLeaseId ?? null, `${entry.from} -> ${entry.to}`);
  }
});

test("lease lifecycle rejects stale closeout and uses fake clock for expiry", async () => {
  const {
    createManualClock,
    completeLease,
    expireLeaseIfStale,
    heartbeatLease,
    makeLeaseFixture,
    makeWorkItemFixture
  } = await loadLifecycleDomain();

  const clock = createManualClock("2026-06-30T00:02:00.000Z");
  const item = makeWorkItemFixture({ status: "running", leaseId: "lease-1", attemptCount: 1 });
  const lease = makeLeaseFixture({
    leaseId: "lease-1",
    workItemId: item.workItemId,
    attemptId: "attempt-1",
    state: "running",
    heartbeatAt: "2026-06-30T00:02:00.000Z",
    expiresAt: "2026-06-30T00:07:00.000Z"
  });

  const staleCompletion = completeLease(item, lease, {
    leaseId: "lease-2",
    workerId: "worker-1",
    attemptId: "attempt-1",
    idempotencyKey: "idempotency-1",
    authorityDecisionId: "authority-1",
    evidenceRefs: ["evidence-stale"],
    clock
  });
  assert.equal(staleCompletion.ok, false);
  assert.equal(staleCompletion.code, "stale_lease");

  clock.advanceMs(60_000);
  const heartbeat = heartbeatLease(lease, {
    leaseId: "lease-1",
    workerId: "worker-1",
    attemptId: "attempt-1",
    idempotencyKey: "idempotency-1",
    authorityDecisionId: "authority-1",
    evidenceRefs: ["evidence-heartbeat"],
    clock,
    ttlMs: 300_000
  });
  assert.equal(heartbeat.ok, true);
  assert.equal(heartbeat.value.heartbeatAt, "2026-06-30T00:03:00.000Z");
  assert.equal(heartbeat.value.expiresAt, "2026-06-30T00:08:00.000Z");

  clock.advanceMs(301_000);
  const expired = expireLeaseIfStale(item, heartbeat.value, {
    evidenceRefs: ["evidence-expired"],
    clock
  });
  assert.equal(expired.ok, true);
  assert.equal(expired.value.lease.state, "expired");
  assert.equal(expired.value.workItem.status, "expired");

  const expiredCompletion = completeLease(item, heartbeat.value, {
    leaseId: "lease-1",
    workerId: "worker-1",
    attemptId: "attempt-1",
    idempotencyKey: "idempotency-1",
    authorityDecisionId: "authority-1",
    evidenceRefs: ["evidence-too-late"],
    clock
  });
  assert.equal(expiredCompletion.ok, false);
  assert.equal(expiredCompletion.code, "lease_expired");
});

test("lease lifecycle rejects terminal heartbeat, bad fencing, invalid ttl, and invalid expiry", async () => {
  const {
    createManualClock,
    heartbeatLease,
    expireLeaseIfStale,
    makeLeaseFixture,
    makeWorkItemFixture
  } = await loadLifecycleDomain();

  const clock = createManualClock("2026-06-30T00:02:00.000Z");
  const runningLease = makeLeaseFixture({
    state: "running",
    heartbeatAt: "2026-06-30T00:02:00.000Z",
    expiresAt: "2026-06-30T00:07:00.000Z"
  });
  const heartbeatInput = {
    leaseId: "lease-1",
    workerId: "worker-1",
    attemptId: "attempt-1",
    idempotencyKey: "idempotency-1",
    authorityDecisionId: "authority-1",
    evidenceRefs: ["evidence-heartbeat"],
    clock,
    ttlMs: 300_000
  };

  const completedHeartbeat = heartbeatLease(makeLeaseFixture({ state: "completed" }), heartbeatInput);
  assert.equal(completedHeartbeat.ok, false);
  assert.equal(completedHeartbeat.code, "terminal_state");

  const staleWorkerHeartbeat = heartbeatLease(runningLease, { ...heartbeatInput, workerId: "worker-2" });
  assert.equal(staleWorkerHeartbeat.ok, false);
  assert.equal(staleWorkerHeartbeat.code, "stale_lease");

  const invalidTtl = heartbeatLease(runningLease, { ...heartbeatInput, ttlMs: -1 });
  assert.equal(invalidTtl.ok, false);
  assert.equal(invalidTtl.code, "invalid_input");

  const invalidExpiryHeartbeat = heartbeatLease(makeLeaseFixture({ state: "running", expiresAt: "not-a-date" }), heartbeatInput);
  assert.equal(invalidExpiryHeartbeat.ok, false);
  assert.equal(invalidExpiryHeartbeat.code, "invalid_input");

  const invalidExpiry = expireLeaseIfStale(
    makeWorkItemFixture({ status: "running", leaseId: "lease-1", attemptCount: 1 }),
    makeLeaseFixture({ state: "running", expiresAt: "not-a-date" }),
    {
      evidenceRefs: ["evidence-expiry"],
      clock
    }
  );
  assert.equal(invalidExpiry.ok, false);
  assert.equal(invalidExpiry.code, "invalid_input");

  const completedExpiry = expireLeaseIfStale(
    makeWorkItemFixture({ status: "completed", leaseId: "lease-1", attemptCount: 1 }),
    makeLeaseFixture({ state: "completed", expiresAt: "2026-06-30T00:01:00.000Z" }),
    {
      evidenceRefs: ["evidence-terminal-expiry"],
      clock
    }
  );
  assert.equal(completedExpiry.ok, false);
  assert.equal(completedExpiry.code, "terminal_state");
});

test("recovery policy makes retry, quarantine, requeue, blocked, and completed decisions explicit", async () => {
  const {
    createManualClock,
    recoverWorkItem,
    makeWorkItemFixture
  } = await loadLifecycleDomain();

  const clock = createManualClock("2026-06-30T00:10:00.000Z");
  const failed = makeWorkItemFixture({ status: "failed", attemptCount: 1, leaseId: "lease-1" });
  const retry = recoverWorkItem(failed, {
    maxAttempts: 3,
    evidenceRefs: ["evidence-retry"],
    clock
  });
  assert.equal(retry.ok, true);
  assert.equal(retry.value.decision, "retry");
  assert.equal(retry.value.workItem.status, "queued");
  assert.equal(retry.value.workItem.leaseId, null);

  const failedTooOften = makeWorkItemFixture({ status: "failed", attemptCount: 3, leaseId: "lease-2" });
  const quarantine = recoverWorkItem(failedTooOften, {
    maxAttempts: 3,
    evidenceRefs: ["evidence-quarantine"],
    clock
  });
  assert.equal(quarantine.ok, true);
  assert.equal(quarantine.value.decision, "quarantine");
  assert.equal(quarantine.value.workItem.status, "quarantined");

  const expired = makeWorkItemFixture({ status: "expired", attemptCount: 1, leaseId: "lease-3" });
  const requeue = recoverWorkItem(expired, {
    maxAttempts: 3,
    evidenceRefs: ["evidence-requeue"],
    clock
  });
  assert.equal(requeue.ok, true);
  assert.equal(requeue.value.decision, "requeue");
  assert.equal(requeue.value.workItem.status, "queued");

  const blocked = makeWorkItemFixture({ status: "blocked", attemptCount: 1, leaseId: "lease-4" });
  const blockedDecision = recoverWorkItem(blocked, {
    maxAttempts: 3,
    evidenceRefs: ["evidence-blocked"],
    clock
  });
  assert.equal(blockedDecision.ok, true);
  assert.equal(blockedDecision.value.decision, "blocked");
  assert.equal(blockedDecision.value.workItem.status, "blocked");

  const completed = makeWorkItemFixture({ status: "completed", attemptCount: 1, leaseId: "lease-5" });
  const completedDecision = recoverWorkItem(completed, {
    maxAttempts: 3,
    evidenceRefs: ["evidence-completed"],
    clock
  });
  assert.equal(completedDecision.ok, false);
  assert.equal(completedDecision.code, "terminal_state");

  const invalidLimit = recoverWorkItem(failed, {
    maxAttempts: Number.NaN,
    evidenceRefs: ["evidence-invalid-limit"],
    clock
  });
  assert.equal(invalidLimit.ok, false);
  assert.equal(invalidLimit.code, "invalid_input");
});

test("manual fake clock rejects backwards or non-finite advances", async () => {
  const { createManualClock } = await loadLifecycleDomain();
  const clock = createManualClock("2026-06-30T00:00:00.000Z");

  assert.throws(() => clock.advanceMs(-1), /Invalid clock advance/);
  assert.throws(() => clock.advanceMs(Number.NaN), /Invalid clock advance/);
});

test("lifecycle domain and lifecycle tests do not use direct system clock calls", async () => {
  const sourceFiles = [
    new URL("clock.ts", lifecycleRoot),
    new URL("candidate-lifecycle.ts", lifecycleRoot),
    new URL("work-item-lifecycle.ts", lifecycleRoot),
    new URL("lease-lifecycle.ts", lifecycleRoot),
    new URL("recovery-policy.ts", lifecycleRoot),
    new URL("manager-control-plane.lifecycle.test.mjs", new URL("./", import.meta.url))
  ];

  for (const fileUrl of sourceFiles) {
    const source = await readFile(fileUrl, "utf8");
    assert.doesNotMatch(source, /Date\s*\.\s*now\s*\(/, `${fileUrl.pathname} uses a direct system clock`);
  }
});

async function loadLifecycleDomain() {
  const outDir = await mkdtemp(join(tmpdir(), "manager-lifecycle-"));
  await writeFile(join(outDir, "package.json"), '{"type":"module"}\n');

  const result = spawnSync(
    tscPath,
    [
      "--target",
      "ES2022",
      "--module",
      "ESNext",
      "--moduleResolution",
      "Bundler",
      "--strict",
      "--verbatimModuleSyntax",
      "--rootDir",
      ".",
      "--outDir",
      outDir,
      "packages/contracts/src/index.ts",
      "packages/workflow-core/src/manager-control-plane/index.ts"
    ],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  await rewriteCompiledEsmImports(join(outDir, "packages/workflow-core/src/manager-control-plane"), [
    "index.js",
    "candidate-lifecycle.js",
    "work-item-lifecycle.js",
    "lease-lifecycle.js",
    "recovery-policy.js"
  ]);

  const contractPackageRoot = join(outDir, "node_modules", "@kendall", "contracts");
  await mkdir(contractPackageRoot, { recursive: true });
  await writeFile(
    join(contractPackageRoot, "package.json"),
    JSON.stringify({
      type: "module",
      exports: {
        ".": "./index.js"
      }
    })
  );
  await writeFile(
    join(contractPackageRoot, "index.js"),
    [
      'import * as lifecycle from "../../../packages/contracts/src/manager-control-plane/lifecycle.js";',
      'import * as authority from "../../../packages/contracts/src/manager-control-plane/authority.js";',
      'import * as events from "../../../packages/contracts/src/manager-control-plane/events.js";',
      'export const ManagerControlPlane = { ...lifecycle, ...authority, ...events };',
      ""
    ].join("\n")
  );

  return import(pathToFileURL(join(outDir, "packages/workflow-core/src/manager-control-plane/index.js")).href);
}

async function rewriteCompiledEsmImports(root, files) {
  const replacements = new Map([
    ['"./clock"', '"./clock.js"'],
    ['"./result"', '"./result.js"'],
    ['"./candidate-lifecycle"', '"./candidate-lifecycle.js"'],
    ['"./work-item-lifecycle"', '"./work-item-lifecycle.js"'],
    ['"./lease-lifecycle"', '"./lease-lifecycle.js"'],
    ['"./recovery-policy"', '"./recovery-policy.js"']
  ]);

  for (const file of files) {
    const target = join(root, file);
    let source = await readFile(target, "utf8");
    for (const [from, to] of replacements) {
      source = source.replaceAll(from, to);
    }
    await writeFile(target, source);
  }
}
