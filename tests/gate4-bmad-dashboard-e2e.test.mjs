import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packagePath = new URL("../package.json", import.meta.url);
const fastChecksPath = new URL("../scripts/run-fast-workflow-checks.mjs", import.meta.url);
const runnerPath = new URL("../scripts/gate4-bmad-dashboard-e2e.mjs", import.meta.url);
const proofPath = new URL("./fixtures/pipeline/gate4-bmad-dashboard-e2e-proof-2026-07-12.json", import.meta.url);

test("Gate 4 joined proof is wired as a zero-skip real-process command", async () => {
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  const fastChecksSource = await readFile(fastChecksPath, "utf8");
  const source = await readFile(runnerPath, "utf8");

  assert.equal(
    packageJson.scripts["test:gate4-bmad-dashboard-e2e"],
    "node ./scripts/gate4-bmad-dashboard-e2e.mjs",
  );
  assert.match(packageJson.scripts["check:static"], /pnpm run check:fast/);
  assert.match(fastChecksSource, /"test:gate4-bmad-dashboard-contract"/,
    "the normal aggregate verification chain must include the structural contract");
  assert.match(source, /buildRefillPlan/);
  assert.match(source, /bmadRoot/);
  assert.match(source, /assertDisposableRootRemoved/);
  assert.match(source, /default_local_bmad/);
  assert.match(source, /manager-source-intake-ready/);
  assert.match(source, /apps\/dashboard\/node_modules\/\.bin\/next/);
  assert.match(source, /supervisor\.api\.main:app/);
  assert.match(source, /skipped:\s*0/);
  assert.doesNotMatch(source, /pytest\.skip|\bskip\s*\(/);
});

test("Gate 4 proof artifact is metadata-only and records authoritative parity", async () => {
  const proof = JSON.parse(await readFile(proofPath, "utf8"));

  assert.equal(proof.schemaVersion, "gate4-bmad-dashboard-e2e-proof/v2");
  assert.equal(proof.status, "passed");
  assert.equal(proof.skipped, 0);
  assert.equal(proof.evidenceLevel, "integrated_local");
  assert.equal(proof.provenance.baselineRevision, "bfe5e44b0bee9c0f2424fccf0a3b4a462592ada1");
  assert.equal(proof.provenance.generator, "gate4-bmad-dashboard-e2e/v2");
  assert.equal(proof.provenance.commandVersion, 2);
  assert.equal(
    proof.provenance.runnerSha256,
    `sha256:${createHash("sha256").update(await readFile(runnerPath)).digest("hex")}`,
  );
  assert.equal(proof.manager.sourceResolutionMode, "default_local_bmad");
  assert.equal(proof.manager.callerSuppliedCandidateDefaults, false);
  assert.equal(proof.supervisor.comparedFieldsParity, true);
  assert.deepEqual(proof.supervisor.comparedFields, ["packetId", "sourceRefs", "currentStage", "status", "evidenceRefs"]);
  assert.equal(proof.dashboard.actualProcess, true);
  assert.equal(proof.dashboard.requestedPacketUsedSupervisorProjection, true);
  assert.equal(proof.dashboard.staticFallbackPacketsRenderedInList, true);
  assert.equal(proof.persistence.supervisorRestartVerified, true);
  assert.deepEqual(proof.sideEffects.tableCounts, {
    candidate_work: 0,
    work_items: 0,
    workflow_events: 0,
    execution_attempts: 0,
    queue_leases: 0,
    queue_lease_actions: 0,
    pipeline_operational_action_records: 0,
    pipeline_operational_approvals: 0,
    audit_events: 0,
    memory_proposals: 0,
    manager_terminal_events: 0,
  });
  assert.deepEqual(proof.executionBoundary.configuredDenials, {
    localProviderCalls: false,
    ollamaProviderCalls: false,
    premiumExecution: false,
    remoteDelivery: false,
    subscriptionAgentLaunch: false,
    workerSourceMutation: false,
    backgroundExecution: false,
  });
  assert.deepEqual(proof.executionBoundary.observedChildProcessKinds, ["dashboard", "manager-source-intake", "supervisor"]);
  assert.equal(proof.retention.trackedSourceBytesUnchanged, true);
  assert.equal(proof.cleanup.disposableBmadRootRemoved, true);
  assert.equal(proof.cleanup.disposableRuntimeRootRemoved, true);
  assert.equal(proof.retention.metadataOnly, true);
  for (const forbidden of ["rawPrompt", "rawCompletion", "reasoningTrace", "providerPayload", "secret", "credential"]) {
    assert.equal(JSON.stringify(proof).includes(forbidden), false, forbidden);
  }
});
