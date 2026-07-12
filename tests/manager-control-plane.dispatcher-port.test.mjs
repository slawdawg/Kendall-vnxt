import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createLocalProofRuntimeAdapters } from "../scripts/lib/manager-control-plane/adapters/local-proof-runtime-adapters.mjs";
import { createMemoryDispatcherAdapter } from "../scripts/lib/manager-control-plane/adapters/memory-dispatcher-adapter.mjs";
import { runBackendProofHarness } from "../scripts/lib/manager-control-plane/backend-proof-harness.mjs";
import { buildManagerExecutionLaneSummary } from "../scripts/lib/manager-control-plane/summary-projection.mjs";
import { toManagerSummaryJson } from "../scripts/lib/manager-control-plane/summary-json.mjs";
import { loadManagerFixture } from "./helpers/manager-control-plane/fixture-loader.mjs";
import {
  assertDispatcherPortConformance,
  assertDispatcherPortContractSuite
} from "./helpers/manager-control-plane/dispatcher-port-conformance.mjs";
import { loadWorkflowCoreManagerControlPlane } from "./helpers/manager-control-plane/workflow-core-loader.mjs";

const portPath = new URL("../packages/workflow-core/src/ports/dispatcher-port.ts", import.meta.url);
const runtimePortsPath = new URL("../packages/workflow-core/src/ports/runtime-ports.ts", import.meta.url);
const portsIndexPath = new URL("../packages/workflow-core/src/ports/index.ts", import.meta.url);
const lifecycleContractPath = new URL("../packages/contracts/src/manager-control-plane/lifecycle.ts", import.meta.url);
const summaryContractPath = new URL("../packages/contracts/src/manager-control-plane/summary.ts", import.meta.url);
const adapterPath = new URL("../scripts/lib/manager-control-plane/adapters/memory-dispatcher-adapter.mjs", import.meta.url);
const localProofAdaptersPath = new URL("../scripts/lib/manager-control-plane/adapters/local-proof-runtime-adapters.mjs", import.meta.url);
const harnessPath = new URL("../scripts/lib/manager-control-plane/backend-proof-harness.mjs", import.meta.url);
const managerRunLoopPath = new URL("../scripts/manager-run-loop.mjs", import.meta.url);
const summaryJsonPath = new URL("../scripts/lib/manager-control-plane/summary-json.mjs", import.meta.url);
const managedWorktreeRoot = join(tmpdir(), "kendall", "manager-control-plane", "worktrees");
const approvedWorkspaceRoots = [managedWorktreeRoot];
const repoRoot = fileURLToPath(new URL("../", import.meta.url));

test("dispatcher port source boundary exists and is exported from workflow-core", async () => {
  assert.equal(existsSync(portPath), true, "missing lowercase dispatcher-port.ts");
  assert.equal(existsSync(portsIndexPath), true, "missing ports index");

  const workflowIndex = await readFile(new URL("../packages/workflow-core/src/index.ts", import.meta.url), "utf8");
  assert.match(workflowIndex, /export \* from "\.\/ports";/);

  const portSource = await readFile(portPath, "utf8");
  assert.match(portSource, /interface DispatcherPort/);
  assert.match(portSource, /needsReviewCandidates/);
  const lifecycleContractSource = await readFile(lifecycleContractPath, "utf8");
  assert.match(lifecycleContractSource, /"needs_review"/);
  const summaryContractSource = await readFile(summaryContractPath, "utf8");
  assert.match(summaryContractSource, /needsReviewCandidates/);
  for (const forbidden of ["BullMQ", "Redis", "Hatchet", "SQLite", "tmux", "GitHub", "provider", "child_process"]) {
    assert.doesNotMatch(portSource, new RegExp(forbidden, "i"), `dispatcher port leaks ${forbidden}`);
  }
});

test("runtime port interfaces cover queue, verification, session, and policy without tool-native state", async () => {
  assert.equal(existsSync(runtimePortsPath), true, "missing runtime-ports.ts");

  const portsIndex = await readFile(portsIndexPath, "utf8");
  assert.match(portsIndex, /export \* from "\.\/runtime-ports";/);

  const workflowIndex = await readFile(new URL("../packages/workflow-core/src/index.ts", import.meta.url), "utf8");
  assert.match(workflowIndex, /export \* from "\.\/ports";/);

  const source = await readFile(runtimePortsPath, "utf8");
  for (const interfaceName of ["QueueRuntimePort", "VerificationRuntimePort", "SessionRuntimePort", "PolicyRuntimePort"]) {
    assert.match(source, new RegExp(`interface ${interfaceName}`));
  }
  assert.match(source, /export type RuntimePortMode = "backend_proof" \| "local_proof" \| "live_adapter" \| "simulated_adapter";/);
  assert.match(source, /export type RuntimeStateRetention = "kendall_manager_metadata_only" \| "tool_native_metadata" \| "external_runtime_state";/);
  assert.doesNotMatch(source, /interface QueueRuntimePort extends DispatcherPort/);
  assert.match(source, /authorityStage: ManagerControlPlane\.ManagerAuthorityStage/);
  assert.match(source, /productTruthBoundary: RuntimeProductTruthBoundary/);
  assert.match(source, /localProofOnly: boolean/);
  assert.match(source, /stateRetention: RuntimeStateRetention/);
  assert.match(source, /toolNativeStateRetained: boolean/);
  assert.match(source, /nativeQueueStateRetained: boolean/);
  assert.match(source, /rawPayloadRetained: false/);
  for (const forbidden of ["BullMQ", "Redis", "Hatchet", "SQLite", "tmux", "GitHub", "child_process"]) {
    assert.doesNotMatch(source, new RegExp(forbidden, "i"), `runtime port leaks ${forbidden}`);
  }
});

test("local proof runtime adapters satisfy all ports without live execution side effects", async () => {
  assert.equal(existsSync(localProofAdaptersPath), true, "missing local proof runtime adapter");
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");
  const clock = lifecycle.createManualClock("2026-06-30T00:00:00.000Z");
  const runtimePorts = createLocalProofRuntimeAdapters({
    lifecycle,
    clock,
    runId: "run-1",
    approvedWorkspaceRoots
  });

  assert.deepEqual(Object.keys(runtimePorts).sort(), ["policy", "queue", "session", "verification"]);
  assert.equal(runtimePorts.queue.descriptor.kind, "queue");
  assert.equal(runtimePorts.verification.descriptor.kind, "verification");
  assert.equal(runtimePorts.session.descriptor.kind, "session");
  assert.equal(runtimePorts.policy.descriptor.kind, "policy");
  for (const runtime of Object.values(runtimePorts)) {
    assert.equal(runtime.mode, "backend_proof");
    assert.equal(runtime.descriptor.authorityStage, "backend_proof");
    assert.equal(runtime.descriptor.productTruthBoundary, "kendall_product_truth");
    assert.equal(runtime.descriptor.localProofOnly, true);
    assert.equal(runtime.descriptor.stateRetention, "kendall_manager_metadata_only");
    assert.equal(runtime.descriptor.toolNativeStateRetained, false);
    assert.equal(runtime.descriptor.nativeQueueStateRetained, false);
    assert.equal(runtime.descriptor.rawPayloadRetained, false);
  }
  assert.throws(
    () => {
      runtimePorts.queue.mode = "live_worker";
    },
    /Cannot assign to read only property|object is not extensible/
  );
  assert.throws(
    () => {
      runtimePorts.verification.verify = null;
    },
    /Cannot assign to read only property|object is not extensible/
  );
  assert.throws(
    () => {
      runtimePorts.extra = true;
    },
    /Cannot add property|object is not extensible/
  );

  const verification = await runtimePorts.verification.verify({
    target: fixture.candidate.verificationTargets[0],
    workItemId: "work-item-001",
    attemptId: "attempt-001",
    evidenceRefs: ["evidence-verification", "fixture:expected-result"]
  });
  assert.equal(verification.ok, true);
  assert.equal(verification.value.status, "metadata_proof_only");
  assert.equal(verification.value.fixtureBackedExpectedEvidencePresent, false);
  assert.equal(verification.value.target.verificationTargetId, "verify-1");
  assert.equal(verification.value.target.commandId, "manager-dispatcher-port-test");
  assert.match(verification.value.target.commandDigest, /^sha256:[0-9a-f]{32}$/);
  assert.match(verification.value.target.expectedResultDigest, /^sha256:[0-9a-f]{32}$/);
  assert.equal("command" in verification.value.target, false);
  assert.equal("expectedResult" in verification.value.target, false);
  assert.equal(verification.value.commandExecutionAttempted, false);
  assert.equal(verification.value.rawPayloadRetained, false);
  assert.equal(verification.value.evidenceRecords.length, 2);
  assert.equal(verification.value.evidenceRecords[0].retentionClass, "metadata_only");

  const whitespaceSensitiveVerification = await runtimePorts.verification.verify({
    target: {
      ...fixture.candidate.verificationTargets[0],
      command: ` ${fixture.candidate.verificationTargets[0].command}`,
      expectedResult: `${fixture.candidate.verificationTargets[0].expectedResult}\n`
    },
    workItemId: "work-item-001",
    attemptId: "attempt-001",
    evidenceRefs: ["evidence-verification-whitespace"]
  });
  assert.equal(whitespaceSensitiveVerification.ok, true);
  assert.notEqual(
    whitespaceSensitiveVerification.value.target.commandDigest,
    verification.value.target.commandDigest
  );
  assert.notEqual(
    whitespaceSensitiveVerification.value.target.expectedResultDigest,
    verification.value.target.expectedResultDigest
  );
  assert.equal("command" in whitespaceSensitiveVerification.value.target, false);
  assert.equal("expectedResult" in whitespaceSensitiveVerification.value.target, false);

  const session = await runtimePorts.session.prepareSession({
    workItemId: "work-item-001",
    branchName: "codex/backend-proof",
    worktreePath: `${managedWorktreeRoot}/local-proof`,
    evidenceRefs: ["evidence-session"]
  });
  assert.equal(session.ok, true);
  assert.equal(session.value.processLaunchAttempted, false);
  assert.equal(session.value.filesystemMutationAttempted, false);
  assert.equal(session.value.credentialAccessAttempted, false);
  assert.equal(session.value.networkAccessAttempted, false);
  assert.equal(session.value.branchName, "codex/backend-proof");
  assert.equal(session.value.worktreePath, `${managedWorktreeRoot}/local-proof`);
  assert.equal(session.value.approvedWorkspaceRoot, `${managedWorktreeRoot}/`);
  assert.match(session.value.sessionId, /^local-proof-session:work-item-001:sha256:[0-9a-f]{32}$/);
  assert.throws(
    () => {
      session.value.branchName = "mutated";
    },
    /Cannot assign to read only property|object is not extensible/
  );

  const allowedPolicy = await runtimePorts.policy.evaluate({
    authorityFamily: "dispatcher_lifecycle",
    operation: "claim",
    scope: "backend-proof queue",
    evidenceRefs: ["z-evidence-policy", "a-evidence-policy", "z-evidence-policy"]
  });
  assert.equal(allowedPolicy.ok, true);
  assert.equal(allowedPolicy.value.allowed, false);
  assert.equal(allowedPolicy.value.simulatedOnly, true);
  assert.equal(allowedPolicy.value.wouldAllowIfAuthoritative, true);
  assert.equal(allowedPolicy.value.decision.decision, "block_and_record");
  assert.equal(allowedPolicy.value.decision.stopReason, "local_proof_policy_non_authoritative");
  assert.match(allowedPolicy.value.decision.authorityDecisionId, /^local-proof-policy:sha256:[0-9a-f]{32}$/);
  assert.throws(
    () => {
      allowedPolicy.value.decision.scope = "mutated";
    },
    /Cannot assign to read only property|object is not extensible/
  );
  const equivalentPolicy = await runtimePorts.policy.evaluate({
    authorityFamily: "dispatcher_lifecycle",
    operation: "claim",
    scope: "backend-proof queue",
    evidenceRefs: ["a-evidence-policy", "z-evidence-policy"]
  });
  assert.equal(equivalentPolicy.ok, true);
  assert.equal(equivalentPolicy.value.decision.authorityDecisionId, allowedPolicy.value.decision.authorityDecisionId);

  const blockedPolicy = await runtimePorts.policy.evaluate({
    authorityFamily: "live_worker_execution",
    operation: "launch",
    scope: "tmux worker",
    evidenceRefs: ["evidence-policy-blocked"]
  });
  assert.equal(blockedPolicy.ok, true);
  assert.equal(blockedPolicy.value.allowed, false);
  assert.equal(blockedPolicy.value.decision.decision, "block_and_record");
  assert.match(blockedPolicy.value.blockers[0], /backend_proof_denies_live_worker_execution:launch:tmux worker/);
});

test("local proof queue freezes returned proof copies without freezing caller fixtures", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");
  const sourceRefs = fixture.candidate.sourceRefs.map((source) => ({ ...source }));
  const verificationTargets = fixture.candidate.verificationTargets.map((target) => ({ ...target }));
  const candidate = {
    ...fixture.candidate,
    sourceRefs,
    verificationTargets
  };
  const runtimePorts = createLocalProofRuntimeAdapters({
    lifecycle,
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    runId: "run-1",
    approvedWorkspaceRoots
  });

  const refill = await runtimePorts.queue.refill({
    candidates: [candidate],
    evidenceRefs: ["evidence-refill"],
    policyReason: "fixture-backed backend proof source"
  });

  assert.equal(refill.ok, true);
  assert.equal(Object.isFrozen(refill.value), true);
  assert.equal(Object.isFrozen(refill.value.queuedWorkItems[0].sourceRefs), true);
  assert.equal(Object.isFrozen(sourceRefs), false);
  assert.equal(Object.isFrozen(verificationTargets), false);
  assert.doesNotThrow(() => {
    sourceRefs.push({
      sourceRefId: "source-extra",
      sourceType: "story",
      sourceSpan: "mutable caller fixture"
    });
  });
});

test("local proof queue delegates sanitized candidate metadata only", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");
  const rawSlice = "Unique candidate text that must not be retained";
  const rawAcceptance = "Unique acceptance text that must not be retained";
  const rawCommand = "node --test tests/manager-control-plane.dispatcher-port.test.mjs --unique-command-retention-check";
  const rawExpected = "Unique expected result that must not be retained";
  const rawPolicyReason = "Unique policy reason that must not be retained";
  const rawDependencyHint = "Unique dependency hint that must not be retained";
  const runtimePorts = createLocalProofRuntimeAdapters({
    lifecycle,
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    runId: "run-1",
    approvedWorkspaceRoots
  });

  const refill = await runtimePorts.queue.refill({
    candidates: [{
      ...fixture.candidate,
      proposedSlice: rawSlice,
      acceptanceCriteria: [rawAcceptance],
      dependencyHints: [rawDependencyHint],
      verificationTargets: [{
        ...fixture.candidate.verificationTargets[0],
        command: rawCommand,
        expectedResult: rawExpected
      }]
    }],
    evidenceRefs: ["evidence-refill"],
    policyReason: rawPolicyReason
  });

  assert.equal(refill.ok, true);
  const snapshotText = JSON.stringify(runtimePorts.queue.snapshot());
  const refillText = JSON.stringify(refill);
  for (const rawValue of [rawSlice, rawAcceptance, rawCommand, rawExpected, rawPolicyReason, rawDependencyHint]) {
    assert.equal(snapshotText.includes(rawValue), false, rawValue);
    assert.equal(refillText.includes(rawValue), false, rawValue);
  }
  assert.match(snapshotText, /metadata-only-command:sha256:[0-9a-f]{32}/);
  assert.match(snapshotText, /candidate-slice:sha256:[0-9a-f]{32}/);
  assert.match(snapshotText, /acceptance:sha256:[0-9a-f]{32}/);
  assert.match(snapshotText, /dependency:sha256:[0-9a-f]{32}/);
});

test("local proof runtime adapters reject unsafe metadata and unsupported operations", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");
  const runtimePorts = createLocalProofRuntimeAdapters({
    lifecycle,
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    runId: "run-1",
    approvedWorkspaceRoots
  });

  assert.throws(
    () => runtimePorts.policy.descriptor.evidenceRefs.push("mutated"),
    /Cannot add property|object is not extensible|read only/
  );
  assert.deepEqual(runtimePorts.policy.descriptor.evidenceRefs, ["runtime-port:local-proof-adapter"]);

  const blankEvidence = await runtimePorts.verification.verify({
    target: fixture.candidate.verificationTargets[0],
    evidenceRefs: [" "]
  });
  assert.equal(blankEvidence.ok, false);
  assert.equal(blankEvidence.code, "missing_evidence");
  assert.deepEqual(blankEvidence.evidenceRefs, []);

  for (const invalidEvidenceRefs of [
    [{ raw: "payload" }],
    [["nested"]],
    ["evidence\ncontrol"],
    ["sk-1234567890abcdef"],
    ["raw"],
    ["provider"],
    ["raw-payload-evidence"],
    ["payload-evidence"],
    ["rawPayloadEvidence"],
    ["raw_payload_evidence"],
    ["providerPayloadEvidence"],
    ["provider_payload_evidence"],
    [`evidence-${"x".repeat(200)}`]
  ]) {
    const invalidEvidence = await runtimePorts.verification.verify({
      target: fixture.candidate.verificationTargets[0],
      evidenceRefs: invalidEvidenceRefs
    });
    assert.equal(invalidEvidence.ok, false);
    assert.equal(invalidEvidence.code, "missing_evidence");
    assert.deepEqual(invalidEvidence.evidenceRefs, []);
  }

  const incompleteTarget = await runtimePorts.verification.verify({
    target: {
      ...fixture.candidate.verificationTargets[0],
      verificationTargetId: " "
    },
    evidenceRefs: ["evidence-verification"]
  });
  assert.equal(incompleteTarget.ok, false);
  assert.equal(incompleteTarget.code, "invalid_input");

  const oversizedTarget = await runtimePorts.verification.verify({
    target: {
      ...fixture.candidate.verificationTargets[0],
      command: "x".repeat(2_001)
    },
    evidenceRefs: ["evidence-verification"]
  });
  assert.equal(oversizedTarget.ok, false);
  assert.equal(oversizedTarget.code, "invalid_input");

  const providerNamedRepoCheck = await runtimePorts.verification.verify({
    target: {
      ...fixture.candidate.verificationTargets[0],
      command: "pnpm run check:provider-fixtures",
      expectedResult: "provider fixture check passes"
    },
    evidenceRefs: ["evidence-provider-fixtures-check"]
  });
  assert.equal(providerNamedRepoCheck.ok, true);
  assert.equal(providerNamedRepoCheck.value.commandExecutionAttempted, false);
  assert.equal("command" in providerNamedRepoCheck.value.target, false);
  assert.match(providerNamedRepoCheck.value.target.commandDigest, /^sha256:[0-9a-f]{32}$/);

  for (const optionalIdPayload of [{ raw: "work" }, "work-item\n001", `work-item-${"x".repeat(200)}`]) {
    const invalidOptionalId = await runtimePorts.verification.verify({
      target: fixture.candidate.verificationTargets[0],
      workItemId: optionalIdPayload,
      evidenceRefs: ["evidence-verification"]
    });
    assert.equal(invalidOptionalId.ok, false);
    assert.equal(invalidOptionalId.code, "invalid_input");
  }

  const invalidQueueEvidence = await runtimePorts.queue.claim({
    workerId: "worker-1",
    evidenceRefs: [{ raw: "queue-evidence" }]
  });
  assert.equal(invalidQueueEvidence.ok, false);
  assert.equal(invalidQueueEvidence.code, "missing_evidence");
  assert.deepEqual(invalidQueueEvidence.evidenceRefs, []);

  for (const malformedCandidates of [undefined, null, { candidate: fixture.candidate }, "not-an-array"]) {
    const malformedRefill = await runtimePorts.queue.refill({
      candidates: malformedCandidates,
      evidenceRefs: ["evidence-refill"],
      policyReason: "malformed candidates should fail closed"
    });
    assert.equal(malformedRefill.ok, false);
    assert.equal(malformedRefill.code, "invalid_input");
    assert.deepEqual(malformedRefill.evidenceRefs, ["evidence-refill"]);
  }

  for (const malformedCandidate of [
    {},
    null,
    { ...fixture.candidate, candidateWorkPacketId: "" },
    { ...fixture.candidate, sourceRefs: [] },
    { ...fixture.candidate, acceptanceCriteria: undefined },
    { ...fixture.candidate, acceptanceCriteria: [] },
    { ...fixture.candidate, acceptanceCriteria: [null] },
    { ...fixture.candidate, dependencyHints: undefined },
    { ...fixture.candidate, dependencyHints: [null] },
    { ...fixture.candidate, proposedSlice: "raw prompt provider payload should fail" },
    { ...fixture.candidate, proposedSlice: "x".repeat(241) },
    { ...fixture.candidate, authorityStage: "bootstrap_refill" },
    { ...fixture.candidate, authorityStage: "governor_recovery" },
    { ...fixture.candidate, authorityStage: "pipeline_adapter" },
    { ...fixture.candidate, authorityStage: "live_worker" },
    { ...fixture.candidate, authorityStage: "delivery" },
    { ...fixture.candidate, authorityStage: "backend_proofish" },
    { ...fixture.candidate, authorityClass: "allowed_unattendedish" },
    { ...fixture.candidate, createdAt: "2026-02-31T00:00:00.000Z" },
    { ...fixture.candidate, updatedAt: "2026-02-31T00:00:00.000Z" },
    {
      ...fixture.candidate,
      sourceRefs: [{ ...fixture.candidate.sourceRefs[0], sourceRefId: "" }]
    }
  ]) {
    const malformedCandidateRefill = await runtimePorts.queue.refill({
      candidates: [malformedCandidate],
      evidenceRefs: ["evidence-refill"],
      policyReason: "malformed candidate packet should fail closed"
    });
    assert.equal(malformedCandidateRefill.ok, false);
    assert.equal(malformedCandidateRefill.code, "invalid_input");
    assert.deepEqual(malformedCandidateRefill.evidenceRefs, ["evidence-refill"]);
  }

  const unsafeBranch = await runtimePorts.session.prepareSession({
    workItemId: "work-item-001",
    branchName: "../unsafe",
    worktreePath: `${managedWorktreeRoot}/local-proof`,
    evidenceRefs: ["evidence-session"]
  });
  assert.equal(unsafeBranch.ok, false);
  assert.equal(unsafeBranch.code, "invalid_input");

  for (const branchName of ["codex/.hidden", "codex/trailing.", "codex/control\nbranch", "codex/segment.lock"]) {
    const unsafeRef = await runtimePorts.session.prepareSession({
      workItemId: "work-item-001",
      branchName,
      worktreePath: `${managedWorktreeRoot}/local-proof`,
      evidenceRefs: ["evidence-session"]
    });
    assert.equal(unsafeRef.ok, false);
    assert.equal(unsafeRef.code, "invalid_input");
  }

  for (const branchName of ["main", "HEAD", "refs/heads/main", "feature/not-managed"]) {
    const unmanagedRef = await runtimePorts.session.prepareSession({
      workItemId: "work-item-001",
      branchName,
      worktreePath: `${managedWorktreeRoot}/local-proof`,
      evidenceRefs: ["evidence-session"]
    });
    assert.equal(unmanagedRef.ok, false);
    assert.equal(unmanagedRef.code, "invalid_input");
  }

  const unsafeWorkItem = await runtimePorts.session.prepareSession({
    workItemId: "work-item\n001",
    branchName: "codex/backend-proof",
    worktreePath: `${managedWorktreeRoot}/local-proof`,
    evidenceRefs: ["evidence-session"]
  });
  assert.equal(unsafeWorkItem.ok, false);
  assert.equal(unsafeWorkItem.code, "invalid_input");

  for (const worktreePath of ["/", "/tmp/kendall-local-proof", "/etc/kendall-local-proof", `${managedWorktreeRoot}/bad\npath`]) {
    const unsafePath = await runtimePorts.session.prepareSession({
      workItemId: "work-item-001",
      branchName: "codex/backend-proof",
      worktreePath,
      evidenceRefs: ["evidence-session"]
    });
    assert.equal(unsafePath.ok, false);
    assert.equal(unsafePath.code, "invalid_input");
  }

  const invalidRootRuntimePorts = createLocalProofRuntimeAdapters({
    lifecycle,
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    runId: "run-1",
    approvedWorkspaceRoots: ["/", "/tmp", "relative", `${managedWorktreeRoot}/valid-root`]
  });
  const failClosedRoot = await invalidRootRuntimePorts.session.prepareSession({
    workItemId: "work-item-001",
    branchName: "codex/backend-proof",
    worktreePath: `${managedWorktreeRoot}/local-proof`,
    evidenceRefs: ["evidence-session"]
  });
  assert.equal(failClosedRoot.ok, false);
  assert.equal(failClosedRoot.code, "invalid_input");

  const validCustomRootRuntimePorts = createLocalProofRuntimeAdapters({
    lifecycle,
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    runId: "run-1",
    approvedWorkspaceRoots: [`${managedWorktreeRoot}/review-root`]
  });
  const validCustomRoot = await validCustomRootRuntimePorts.session.prepareSession({
    workItemId: "work-item-001",
    branchName: "codex/backend-proof",
    worktreePath: `${managedWorktreeRoot}/review-root/local-proof`,
    evidenceRefs: ["evidence-session"]
  });
  assert.equal(validCustomRoot.ok, true);
  assert.equal(validCustomRoot.value.approvedWorkspaceRoot, `${managedWorktreeRoot}/review-root/`);

  const distinctSession = await validCustomRootRuntimePorts.session.prepareSession({
    workItemId: "work-item-001",
    branchName: "codex/backend-proof-2",
    worktreePath: `${managedWorktreeRoot}/review-root/local-proof`,
    evidenceRefs: ["evidence-session"]
  });
  assert.equal(distinctSession.ok, true);
  assert.notEqual(distinctSession.value.sessionId, validCustomRoot.value.sessionId);

  const unsupportedAllowedFamilyOperation = await runtimePorts.policy.evaluate({
    authorityFamily: "dispatcher_lifecycle",
    operation: "launch",
    scope: "backend-proof queue",
    evidenceRefs: ["evidence-policy-blocked"]
  });
  assert.equal(unsupportedAllowedFamilyOperation.ok, true);
  assert.equal(unsupportedAllowedFamilyOperation.value.allowed, false);
  assert.equal(unsupportedAllowedFamilyOperation.value.decision.decision, "block_and_record");
  assert.match(unsupportedAllowedFamilyOperation.value.blockers[0], /backend_proof_denies_dispatcher_lifecycle:launch:backend-proof queue/);

  const sameOperationDifferentScope = await runtimePorts.policy.evaluate({
    authorityFamily: "dispatcher_lifecycle",
    operation: "claim",
    scope: "different backend-proof queue",
    evidenceRefs: ["evidence-policy-blocked"]
  });
  assert.equal(sameOperationDifferentScope.ok, true);
  assert.equal(sameOperationDifferentScope.value.allowed, false);
  assert.notEqual(
    sameOperationDifferentScope.value.decision.authorityDecisionId,
    unsupportedAllowedFamilyOperation.value.decision.authorityDecisionId
  );

  for (const unsafePolicyInput of [
    { authorityFamily: "dispatcher_lifecycle\nraw", operation: "claim", scope: "backend-proof queue" },
    { authorityFamily: "dispatcher_lifecycle", operation: "sk-1234567890abcdef", scope: "backend-proof queue" },
    { authorityFamily: "dispatcher_lifecycle", operation: "raw", scope: "backend-proof queue" },
    { authorityFamily: "dispatcher_lifecycle", operation: "provider", scope: "backend-proof queue" },
    { authorityFamily: "dispatcher_lifecycle", operation: "raw-payload", scope: "backend-proof queue" },
    { authorityFamily: "dispatcher_lifecycle", operation: "rawPayload", scope: "backend-proof queue" },
    { authorityFamily: "dispatcher_lifecycle", operation: "raw_payload", scope: "backend-proof queue" },
    { authorityFamily: "dispatcher_lifecycle", operation: "providerPayload", scope: "backend-proof queue" },
    { authorityFamily: "dispatcher_lifecycle", operation: "provider_payload", scope: "backend-proof queue" },
    { authorityFamily: "dispatcher_lifecycle", operation: `claim-${"x".repeat(100)}`, scope: "backend-proof queue" },
    { authorityFamily: "dispatcher_lifecycle", operation: "claim", scope: "raw completion transcript" },
    { authorityFamily: "dispatcher_lifecycle", operation: "claim", scope: "raw" },
    { authorityFamily: "dispatcher_lifecycle", operation: "claim", scope: "provider" },
    { authorityFamily: "dispatcher_lifecycle", operation: "claim", scope: "payload" },
    { authorityFamily: "dispatcher_lifecycle", operation: "claim", scope: "rawPayload" },
    { authorityFamily: "dispatcher_lifecycle", operation: "claim", scope: "raw_payload_evidence" },
    { authorityFamily: "dispatcher_lifecycle", operation: "claim", scope: "providerPayloadEvidence" },
    { authorityFamily: "dispatcher_lifecycle", operation: "claim", scope: "provider_payload_evidence" },
    { authorityFamily: "dispatcher_lifecycle", operation: "claim", scope: `backend-proof queue ${"x".repeat(140)}` },
    { authorityFamily: "dispatcher_lifecycle", operation: "claim\nraw", scope: "backend-proof queue" }
  ]) {
    const unsafePolicy = await runtimePorts.policy.evaluate({
      ...unsafePolicyInput,
      evidenceRefs: ["evidence-policy"]
    });
    assert.equal(unsafePolicy.ok, false);
    assert.equal(unsafePolicy.code, "invalid_input");
    assert.deepEqual(unsafePolicy.evidenceRefs, ["evidence-policy"]);
  }

  const queueSnapshot = runtimePorts.queue.snapshot();
  assert.deepEqual(Object.keys(queueSnapshot).sort(), [
    "attempts",
    "blockedCandidates",
    "duplicateCandidates",
    "events",
    "evidenceRecords",
    "leases",
    "needsReviewCandidates",
    "refillJobs",
    "workItems"
  ]);
  assert.equal("nativeQueue" in queueSnapshot, false);
  assert.equal("toolNativeState" in queueSnapshot, false);

  const oversizedRefill = await runtimePorts.queue.refill({
    candidates: Array.from({ length: 33 }, (_, index) => ({
      ...fixture.candidate,
      candidateWorkPacketId: `candidate-${index}`,
      dedupeKey: `candidate-${index}`,
      sourceRefs: [{ ...fixture.candidate.sourceRefs[0], sourceRefId: `source-${index}` }]
    })),
    evidenceRefs: ["evidence-refill"],
    policyReason: "oversized candidate batch should fail closed"
  });
  assert.equal(oversizedRefill.ok, false);
  assert.equal(oversizedRefill.code, "invalid_input");
  assert.deepEqual(oversizedRefill.evidenceRefs, ["evidence-refill"]);
});

test("local proof queue rejects unsafe lifecycle metadata before delegation", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");
  const runtimePorts = createLocalProofRuntimeAdapters({
    lifecycle,
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    runId: "run-1",
    approvedWorkspaceRoots
  });

  const invalidClaim = await runtimePorts.queue.claim({
    workerId: { raw: "worker" },
    evidenceRefs: ["evidence-claim"]
  });
  assert.equal(invalidClaim.ok, false);
  assert.equal(invalidClaim.code, "invalid_input");

  const refill = await runtimePorts.queue.refill({
    candidates: [fixture.candidate],
    evidenceRefs: ["evidence-refill"],
    policyReason: "fixture-backed safe source"
  });
  assert.equal(refill.ok, true);
  const claim = await runtimePorts.queue.claim({ workerId: "worker-1", evidenceRefs: ["evidence-claim"] });
  assert.equal(claim.ok, true);

  const baseLeaseInput = {
    leaseId: claim.value.lease.leaseId,
    workerId: claim.value.lease.workerId,
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId
  };
  const invalidHeartbeat = await runtimePorts.queue.heartbeat({
    ...baseLeaseInput,
    ttlMs: "300000",
    evidenceRefs: ["evidence-heartbeat"]
  });
  assert.equal(invalidHeartbeat.ok, false);
  assert.equal(invalidHeartbeat.code, "invalid_input");

  const heartbeat = await runtimePorts.queue.heartbeat({
    ...baseLeaseInput,
    ttlMs: 300_000,
    evidenceRefs: ["evidence-heartbeat"]
  });
  assert.equal(heartbeat.ok, true);

  for (const closeoutInput of [
    { ...baseLeaseInput, resultSummary: { raw: "summary" }, evidenceRefs: ["evidence-complete"] },
    { ...baseLeaseInput, resultSummary: "raw prompt provider payload should fail", evidenceRefs: ["evidence-complete"] },
    { ...baseLeaseInput, failureReason: { raw: "reason" }, evidenceRefs: ["evidence-fail"] },
    { ...baseLeaseInput, failureReason: "secret provider payload should fail", evidenceRefs: ["evidence-fail"] },
    { ...baseLeaseInput, attemptId: "attempt\n001", resultSummary: "done", evidenceRefs: ["evidence-complete"] }
  ]) {
    const closeout = "resultSummary" in closeoutInput
      ? await runtimePorts.queue.complete(closeoutInput)
      : await runtimePorts.queue.fail(closeoutInput);
    assert.equal(closeout.ok, false);
    assert.equal(closeout.code, "invalid_input");
  }
});

test("workflow-core loader honors explicit repo root from a non-repo cwd", () => {
  const cwd = mkdtempSync(join(tmpdir(), "manager-loader-cwd-"));
  try {
    const script = [
      `import { loadWorkflowCoreManagerControlPlane } from ${JSON.stringify(new URL("./helpers/manager-control-plane/workflow-core-loader.mjs", import.meta.url).href)};`,
      `const lifecycle = await loadWorkflowCoreManagerControlPlane({ repoRoot: ${JSON.stringify(repoRoot)} });`,
      `if (typeof lifecycle.createManualClock !== "function") throw new Error("missing lifecycle export");`,
      ""
    ].join("\n");
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
      cwd,
      encoding: "utf8",
      stdio: "pipe",
      timeout: 30_000
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("memory dispatcher adapter passes the shared adapter contract suite", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");

  await assertDispatcherPortContractSuite(
    ({ clock, runId, leaseTtlMs, maxAttempts, summaryStaleAfterMs } = {}) =>
      createMemoryDispatcherAdapter({
        lifecycle,
        clock: clock ?? lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
        runId: runId ?? "run-1",
        ...(leaseTtlMs === undefined ? {} : { leaseTtlMs }),
        ...(maxAttempts === undefined ? {} : { maxAttempts }),
        ...(summaryStaleAfterMs === undefined ? {} : { summaryStaleAfterMs })
      }),
    {
      candidate: fixture.candidate,
      createClock: () => lifecycle.createManualClock("2026-06-30T00:00:00.000Z")
    }
  );
});

test("memory dispatcher adapter revalidates lifecycle-normalized candidates before retention", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");
  const adapter = createMemoryDispatcherAdapter({
    lifecycle: {
      ...lifecycle,
      evaluateCandidateEligibility(candidate, input) {
        const result = lifecycle.evaluateCandidateEligibility(candidate, input);
        if (!result.ok) return result;
        return {
          ...result,
          value: {
            ...result.value,
            candidate: {
              ...result.value.candidate,
              proposedSlice: "Bearer abcdef1234567890"
            }
          }
        };
      }
    },
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    runId: "run-1"
  });

  const refill = await adapter.refill({
    candidates: [fixture.candidate],
    evidenceRefs: ["evidence-lifecycle-candidate-revalidation"],
    policyReason: "unsafe lifecycle candidate normalization must not retain"
  });
  assert.equal(refill.ok, true);
  assert.equal(refill.value.queuedWorkItems.length, 0);
  assert.equal(refill.value.blockedCandidates.length, 1);
  assert.equal(refill.value.refillJob.result, "blocked");
  const snapshot = adapter.snapshot();
  assert.equal(snapshot.workItems.length, 0);
  assert.equal(JSON.stringify(snapshot).includes("Bearer abcdef1234567890"), false);
});

test("memory dispatcher adapter revalidates lifecycle-queued work before retention", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");
  const adapter = createMemoryDispatcherAdapter({
    lifecycle: {
      ...lifecycle,
      transitionWorkItem(workItem, input) {
        const result = lifecycle.transitionWorkItem(workItem, input);
        if (!result.ok || input.toStatus !== "queued") return result;
        return {
          ...result,
          value: {
            ...result.value,
            title: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature"
          }
        };
      }
    },
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    runId: "run-1"
  });

  const refill = await adapter.refill({
    candidates: [fixture.candidate],
    evidenceRefs: ["evidence-lifecycle-workitem-revalidation"],
    policyReason: "unsafe lifecycle queued work must not retain"
  });
  assert.equal(refill.ok, true);
  assert.equal(refill.value.queuedWorkItems.length, 0);
  assert.equal(refill.value.blockedCandidates.length, 1);
  assert.equal(refill.value.refillJob.result, "blocked");
  const snapshot = adapter.snapshot();
  assert.equal(snapshot.workItems.length, 0);
  assert.equal(JSON.stringify(snapshot).includes("eyJhbGciOiJIUzI1NiJ9"), false);
});

test("memory dispatcher adapter revalidates lifecycle-claimed work before retention", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");
  const adapter = createMemoryDispatcherAdapter({
    lifecycle: {
      ...lifecycle,
      transitionWorkItem(workItem, input) {
        const result = lifecycle.transitionWorkItem(workItem, input);
        if (!result.ok || input.toStatus !== "leased") return result;
        return {
          ...result,
          value: {
            ...result.value,
            raw_payload: "must-not-retain"
          }
        };
      }
    },
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    runId: "run-1"
  });

  const refill = await adapter.refill({
    candidates: [fixture.candidate],
    evidenceRefs: ["evidence-lifecycle-claim-refill"],
    policyReason: "fixture-backed safe source"
  });
  assert.equal(refill.ok, true);
  const claim = await adapter.claim({ workerId: "worker-1", evidenceRefs: ["evidence-lifecycle-claim"] });
  assert.equal(claim.ok, false);
  assert.equal(claim.code, "invalid_lifecycle_result");
  assert.equal(JSON.stringify(adapter.snapshot()).includes("raw_payload"), false);
});

test("memory dispatcher adapter rejects lifecycle-claimed work identity drift", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");
  const adapter = createMemoryDispatcherAdapter({
    lifecycle: {
      ...lifecycle,
      transitionWorkItem(workItem, input) {
        const result = lifecycle.transitionWorkItem(workItem, input);
        if (!result.ok || input.toStatus !== "leased") return result;
        return {
          ...result,
          value: {
            ...result.value,
            workItemId: "work-item-drift"
          }
        };
      }
    },
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    runId: "run-1"
  });

  const refill = await adapter.refill({
    candidates: [fixture.candidate],
    evidenceRefs: ["evidence-lifecycle-claim-drift-refill"],
    policyReason: "fixture-backed safe source"
  });
  assert.equal(refill.ok, true);
  const claim = await adapter.claim({ workerId: "worker-1", evidenceRefs: ["evidence-lifecycle-claim-drift"] });
  assert.equal(claim.ok, false);
  assert.equal(claim.code, "invalid_lifecycle_result");
  assert.equal(adapter.snapshot().workItems.some((item) => item.workItemId === "work-item-drift"), false);
});

test("memory dispatcher adapter revalidates lifecycle-running work before retention", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");
  const adapter = createMemoryDispatcherAdapter({
    lifecycle: {
      ...lifecycle,
      transitionWorkItem(workItem, input) {
        const result = lifecycle.transitionWorkItem(workItem, input);
        if (!result.ok || input.toStatus !== "running") return result;
        return {
          ...result,
          value: {
            ...result.value,
            title: "secretKey must-not-retain"
          }
        };
      }
    },
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    runId: "run-1"
  });

  const claim = await refillAndClaim(adapter, fixture.candidate, "running-revalidation");
  const heartbeat = await adapter.heartbeat({
    leaseId: claim.value.lease.leaseId,
    workerId: claim.value.lease.workerId,
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-lifecycle-running-heartbeat"],
    ttlMs: 300_000
  });
  assert.equal(heartbeat.ok, false);
  assert.equal(heartbeat.code, "invalid_lifecycle_result");
  assert.equal(JSON.stringify(adapter.snapshot()).includes("secretKey"), false);
});

test("memory dispatcher adapter revalidates lifecycle-closeout work before retention", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");
  const adapter = createMemoryDispatcherAdapter({
    lifecycle: {
      ...lifecycle,
      completeLease(workItem, lease, input) {
        const result = lifecycle.completeLease(workItem, lease, input);
        if (!result.ok) return result;
        return {
          ...result,
          value: {
            ...result.value,
            workItem: {
              ...result.value.workItem,
              provider_payload: "must-not-retain"
            }
          }
        };
      }
    },
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    runId: "run-1"
  });

  const claim = await refillClaimAndHeartbeat(adapter, fixture.candidate, "closeout-revalidation");
  const complete = await adapter.complete({
    leaseId: claim.value.lease.leaseId,
    workerId: claim.value.lease.workerId,
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-lifecycle-closeout-complete"],
    resultSummary: "metadata complete"
  });
  assert.equal(complete.ok, false);
  assert.equal(complete.code, "invalid_lifecycle_result");
  assert.equal(JSON.stringify(adapter.snapshot()).includes("provider_payload"), false);
});

test("memory dispatcher adapter revalidates lifecycle-heartbeat lease before retention", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");
  const adapter = createMemoryDispatcherAdapter({
    lifecycle: {
      ...lifecycle,
      heartbeatLease(lease, input) {
        const result = lifecycle.heartbeatLease(lease, input);
        if (!result.ok) return result;
        return {
          ...result,
          value: {
            ...result.value,
            raw_payload: "must-not-retain"
          }
        };
      }
    },
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    runId: "run-1"
  });

  const claim = await refillAndClaim(adapter, fixture.candidate, "heartbeat-lease-revalidation");
  const heartbeat = await adapter.heartbeat({
    leaseId: claim.value.lease.leaseId,
    workerId: claim.value.lease.workerId,
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-lifecycle-heartbeat-lease"],
    ttlMs: 300_000
  });
  assert.equal(heartbeat.ok, false);
  assert.equal(heartbeat.code, "invalid_lifecycle_result");
  assert.equal(JSON.stringify(adapter.snapshot()).includes("raw_payload"), false);
});

test("memory dispatcher adapter rejects lifecycle-heartbeat lease identity drift", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");
  const adapter = createMemoryDispatcherAdapter({
    lifecycle: {
      ...lifecycle,
      heartbeatLease(lease, input) {
        const result = lifecycle.heartbeatLease(lease, input);
        if (!result.ok) return result;
        return {
          ...result,
          value: {
            ...result.value,
            attemptId: "attempt-drift"
          }
        };
      }
    },
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    runId: "run-1"
  });

  const claim = await refillAndClaim(adapter, fixture.candidate, "heartbeat-lease-identity-drift");
  const heartbeat = await adapter.heartbeat({
    leaseId: claim.value.lease.leaseId,
    workerId: claim.value.lease.workerId,
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-lifecycle-heartbeat-lease-drift"],
    ttlMs: 300_000
  });
  assert.equal(heartbeat.ok, false);
  assert.equal(heartbeat.code, "invalid_lifecycle_result");
  assert.equal(adapter.snapshot().leases.some((lease) => lease.attemptId === "attempt-drift"), false);
});

test("memory dispatcher adapter revalidates lifecycle-closeout lease before retention", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");
  const adapter = createMemoryDispatcherAdapter({
    lifecycle: {
      ...lifecycle,
      completeLease(workItem, lease, input) {
        const result = lifecycle.completeLease(workItem, lease, input);
        if (!result.ok) return result;
        return {
          ...result,
          value: {
            ...result.value,
            lease: {
              ...result.value.lease,
              provider_payload: "must-not-retain"
            }
          }
        };
      }
    },
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    runId: "run-1"
  });

  const claim = await refillClaimAndHeartbeat(adapter, fixture.candidate, "closeout-lease-revalidation");
  const complete = await adapter.complete({
    leaseId: claim.value.lease.leaseId,
    workerId: claim.value.lease.workerId,
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-lifecycle-closeout-lease"],
    resultSummary: "metadata complete"
  });
  assert.equal(complete.ok, false);
  assert.equal(complete.code, "invalid_lifecycle_result");
  assert.equal(JSON.stringify(adapter.snapshot()).includes("provider_payload"), false);
});

test("memory dispatcher adapter rejects lifecycle-closeout work and lease identity drift", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");
  const adapter = createMemoryDispatcherAdapter({
    lifecycle: {
      ...lifecycle,
      completeLease(workItem, lease, input) {
        const result = lifecycle.completeLease(workItem, lease, input);
        if (!result.ok) return result;
        return {
          ...result,
          value: {
            ...result.value,
            workItem: {
              ...result.value.workItem,
              authorityDecisionId: "authority-drift"
            },
            lease: {
              ...result.value.lease,
              workerId: "worker-drift"
            }
          }
        };
      }
    },
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    runId: "run-1"
  });

  const claim = await refillClaimAndHeartbeat(adapter, fixture.candidate, "closeout-identity-drift");
  const complete = await adapter.complete({
    leaseId: claim.value.lease.leaseId,
    workerId: claim.value.lease.workerId,
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-lifecycle-closeout-drift"],
    resultSummary: "metadata complete"
  });
  assert.equal(complete.ok, false);
  assert.equal(complete.code, "invalid_lifecycle_result");
  const snapshot = adapter.snapshot();
  assert.equal(snapshot.workItems.some((item) => item.authorityDecisionId === "authority-drift"), false);
  assert.equal(snapshot.leases.some((lease) => lease.workerId === "worker-drift"), false);
});

test("memory dispatcher adapter revalidates lifecycle-recovered work before retention", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");
  const adapter = createMemoryDispatcherAdapter({
    lifecycle: {
      ...lifecycle,
      recoverWorkItem(workItem, input) {
        const result = lifecycle.recoverWorkItem(workItem, input);
        if (!result.ok) return result;
        return {
          ...result,
          value: {
            ...result.value,
            workItem: {
              ...result.value.workItem,
              retained_payload: "must-not-retain"
            }
          }
        };
      }
    },
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    runId: "run-1"
  });

  const claim = await refillClaimAndHeartbeat(adapter, fixture.candidate, "recovery-revalidation");
  const fail = await adapter.fail({
    leaseId: claim.value.lease.leaseId,
    workerId: claim.value.lease.workerId,
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-lifecycle-recovery-fail"],
    failureReason: "metadata failure"
  });
  assert.equal(fail.ok, true);
  const recovery = await adapter.recoverExpiredLeases({ evidenceRefs: ["evidence-lifecycle-recovery"] });
  assert.equal(recovery.ok, true);
  assert.equal(recovery.value.recoveredWorkItems.length, 0);
  assert.equal(JSON.stringify(adapter.snapshot()).includes("retained_payload"), false);
});

test("memory dispatcher adapter rejects lifecycle recovery identity drift before retention", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");
  const adapter = createMemoryDispatcherAdapter({
    lifecycle: {
      ...lifecycle,
      recoverWorkItem(workItem, input) {
        const result = lifecycle.recoverWorkItem(workItem, input);
        if (!result.ok) return result;
        return {
          ...result,
          value: {
            ...result.value,
            workItem: {
              ...result.value.workItem,
              workItemId: "work-item-recovery-drift"
            }
          }
        };
      }
    },
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    runId: "run-1"
  });

  const claim = await refillClaimAndHeartbeat(adapter, fixture.candidate, "recovery-identity-drift");
  const fail = await adapter.fail({
    leaseId: claim.value.lease.leaseId,
    workerId: claim.value.lease.workerId,
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-lifecycle-recovery-drift-fail"],
    failureReason: "metadata failure"
  });
  assert.equal(fail.ok, true);
  const recovery = await adapter.recoverExpiredLeases({ evidenceRefs: ["evidence-lifecycle-recovery-drift"] });
  assert.equal(recovery.ok, true);
  assert.equal(recovery.value.recoveredWorkItems.length, 0);
  assert.equal(adapter.snapshot().workItems.some((item) => item.workItemId === "work-item-recovery-drift"), false);
});

test("memory dispatcher adapter leaves expired leases recoverable after invalid recovery output", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("expired-lease.json");
  const clock = lifecycle.createManualClock("2026-06-30T00:00:00.000Z");
  let driftRecovery = true;
  const adapter = createMemoryDispatcherAdapter({
    lifecycle: {
      ...lifecycle,
      recoverWorkItem(workItem, input) {
        const result = lifecycle.recoverWorkItem(workItem, input);
        if (!result.ok || !driftRecovery) return result;
        return {
          ...result,
          value: {
            ...result.value,
            workItem: {
              ...result.value.workItem,
              workItemId: "work-item-invalid-recovery"
            }
          }
        };
      }
    },
    clock,
    runId: "run-1",
    leaseTtlMs: 1
  });

  const claim = await refillAndClaim(adapter, fixture.candidate, "expired-invalid-recovery");
  clock.advanceMs(2);
  const firstRecovery = await adapter.recoverExpiredLeases({ evidenceRefs: ["evidence-expired-invalid-recovery"] });
  assert.equal(firstRecovery.ok, true);
  assert.equal(firstRecovery.value.expiredLeases.length, 0);
  assert.equal(firstRecovery.value.recoveredWorkItems.length, 0);
  const firstSnapshot = adapter.snapshot();
  assert.equal(firstSnapshot.workItems.some((item) => item.workItemId === "work-item-invalid-recovery"), false);
  assert.equal(firstSnapshot.leases.find((lease) => lease.leaseId === claim.value.lease.leaseId)?.state, "leased");

  driftRecovery = false;
  const secondRecovery = await adapter.recoverExpiredLeases({ evidenceRefs: ["evidence-expired-valid-recovery"] });
  assert.equal(secondRecovery.ok, true);
  assert.equal(secondRecovery.value.expiredLeases.length, 1);
  assert.equal(secondRecovery.value.recoveredWorkItems.length, 1);
  assert.equal(secondRecovery.value.recoveredWorkItems[0].status, "queued");
});

test("memory dispatcher adapter revalidates expired lease lifecycle output before retention", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("expired-lease.json");
  const clock = lifecycle.createManualClock("2026-06-30T00:00:00.000Z");
  const adapter = createMemoryDispatcherAdapter({
    lifecycle: {
      ...lifecycle,
      expireLeaseIfStale(workItem, lease, input) {
        const result = lifecycle.expireLeaseIfStale(workItem, lease, input);
        if (!result.ok) return result;
        return {
          ...result,
          value: {
            ...result.value,
            lease: {
              ...result.value.lease,
              provider_payload: "must-not-retain"
            }
          }
        };
      }
    },
    clock,
    runId: "run-1",
    leaseTtlMs: 1
  });

  const claim = await refillAndClaim(adapter, fixture.candidate, "expired-lease-revalidation");
  assert.equal(claim.ok, true);
  clock.advanceMs(2);
  const recovery = await adapter.recoverExpiredLeases({ evidenceRefs: ["evidence-expired-lease-revalidation"] });
  assert.equal(recovery.ok, true);
  assert.equal(recovery.value.expiredLeases.length, 0);
  assert.equal(recovery.value.recoveredWorkItems.length, 0);
  assert.equal(JSON.stringify(adapter.snapshot()).includes("provider_payload"), false);
});

test("memory dispatcher adapter rejects expired lease identity drift before retention", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("expired-lease.json");
  const clock = lifecycle.createManualClock("2026-06-30T00:00:00.000Z");
  const adapter = createMemoryDispatcherAdapter({
    lifecycle: {
      ...lifecycle,
      expireLeaseIfStale(workItem, lease, input) {
        const result = lifecycle.expireLeaseIfStale(workItem, lease, input);
        if (!result.ok) return result;
        return {
          ...result,
          value: {
            ...result.value,
            workItem: {
              ...result.value.workItem,
              workItemId: "work-item-expiry-drift"
            },
            lease: {
              ...result.value.lease,
              leaseId: "lease-expiry-drift"
            }
          }
        };
      }
    },
    clock,
    runId: "run-1",
    leaseTtlMs: 1
  });

  const claim = await refillAndClaim(adapter, fixture.candidate, "expired-lease-identity-drift");
  assert.equal(claim.ok, true);
  clock.advanceMs(2);
  const recovery = await adapter.recoverExpiredLeases({ evidenceRefs: ["evidence-expired-lease-identity-drift"] });
  assert.equal(recovery.ok, true);
  assert.equal(recovery.value.expiredLeases.length, 0);
  assert.equal(recovery.value.recoveredWorkItems.length, 0);
  const snapshot = adapter.snapshot();
  assert.equal(snapshot.workItems.some((item) => item.workItemId === "work-item-expiry-drift"), false);
  assert.equal(snapshot.leases.some((lease) => lease.leaseId === "lease-expiry-drift"), false);
});

test("legacy dispatcher conformance helper fails loudly without createClock", async () => {
  const fixture = await loadManagerFixture("happy-path.json");
  await assert.rejects(
    () => assertDispatcherPortConformance(() => ({}), { candidate: fixture.candidate }),
    /requires createClock/
  );
});

test("backend proof harness runs one honest simulated loop with bounded summary JSON", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");
  const result = await runBackendProofHarness({
    lifecycle,
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    candidates: [fixture.candidate],
    workerId: "worker-1",
    approvedWorkspaceRoots
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "completed");
  assert.equal(result.summary.currentPhase, "completed");
  assert.equal(result.summary.stateSource, "fixture");
  assert.equal(result.summary.proofMode, "backend_proof");
  assert.equal(result.summary.stateCounts.completed, 1);
  assert.equal(result.summary.stateCounts.totalWorkItems, 1);
  assert.equal(result.summary.stateCounts.totalAttempts, 1);
  assert.equal(result.summary.stateCounts.totalLeases, 1);
  assert.equal(result.summary.rawStateLabels.includes("work:completed"), true);
  assert.equal(result.summary.rawStateLabels.includes("lease:completed"), true);
  assert.equal(result.summary.rawStateLabels.includes("attempt:completed"), true);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.warnings.includes("backend_proof_simulated_no_live_worker_execution"), true);
  assert.equal(result.next_actions.includes("continue_to_summary_projection_story"), true);
  assert.equal(result.proof.mode, "backend_proof");
  assert.equal(result.proof.state_source, "fixture");
  assert.equal(result.proof.evidence_links.length > 0, true);
  assert.equal(result.proof.evidence_links.some((link) => link.workItemId === "work-item-001"), true);
  assert.equal(result.proof.evidence_links.every((link) => link.rawPayloadRetained === false), true);
  assert.equal(result.proof.metadata_only, true);
  assert.equal(result.proof.raw_payload_retained, false);
  assert.equal(result.proof.boundary.authority_stage, "backend_proof");
  assert.equal(result.proof.boundary.result, "completed");
  assert.equal(result.proof.boundary.real.includes("contract_objects"), true);
  assert.equal(result.proof.boundary.fake.includes("simulated_worker_execution"), true);
  assert.equal(result.proof.boundary.forbidden.includes("live_tmux_mutation"), true);
  assert.equal(result.proof.boundary.metadata_only, true);
  assert.equal(result.proof.boundary.raw_payload_retained, false);
  assert.equal(result.proof.boundary.real.includes("local_proof_runtime_ports"), true);
  assert.equal(result.proof.boundary.fake.includes("metadata_only_runtime_port_evidence"), true);
  assert.equal(result.proof.boundary.evidence_refs.includes("runtime-port:verification-metadata-proof"), true);
  assert.equal(result.proof.boundary.evidence_refs.includes("runtime-port:session-metadata-proof"), true);
  assert.equal(result.proof.boundary.evidence_refs.includes("runtime-port:policy-simulated-proof"), true);
  assert.equal(result.proof.boundary.runtime_ports.status, "metadata_proof_only");
  assert.equal(result.proof.boundary.runtime_ports.adapters.queue.adapter_id, "local-proof-queue-runtime");
  assert.equal(result.proof.boundary.runtime_ports.adapters.verification.adapter_id, "local-proof-verification-runtime");
  assert.equal(result.proof.boundary.runtime_ports.adapters.session.adapter_id, "local-proof-session-runtime");
  assert.equal(result.proof.boundary.runtime_ports.adapters.policy.adapter_id, "local-proof-policy-runtime");
  assert.equal(result.proof.boundary.runtime_ports.verification.command_id, "manager-dispatcher-port-test");
  assert.match(result.proof.boundary.runtime_ports.verification.command_digest, /^sha256:[0-9a-f]{32}$/);
  assert.match(result.proof.boundary.runtime_ports.session.session_id, /^local-proof-session:work-item-001:sha256:[0-9a-f]{32}$/);
  assert.match(result.proof.boundary.runtime_ports.session.approved_workspace_root, /^metadata-only:sha256:[0-9a-f]{32}$/);
  assert.match(result.proof.boundary.runtime_ports.policy.authority_decision_id, /^local-proof-policy:sha256:[0-9a-f]{32}$/);
  assert.equal(result.proof.boundary.runtime_ports.raw_payload_retained, false);
});

test("backend proof harness blocks valid policy denials before queue completion", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");
  const result = await runBackendProofHarness({
    lifecycle,
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    candidates: [fixture.candidate],
    workerId: "worker-1",
    approvedWorkspaceRoots,
    policyProofInput: {
      authorityFamily: "dispatcher_lifecycle",
      operation: "launch",
      scope: "backend-proof queue",
      evidenceRefs: ["runtime-port:policy-simulated-proof"]
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.blockers, ["runtime_port_metadata_proof_failed"]);
  assert.equal(result.proof.boundary.result, "blocked");
  assert.equal(result.proof.boundary.evidence_refs.includes("runtime-port:metadata-proof-failed"), true);
  assert.equal(result.proof.boundary.evidence_refs.includes("evidence-complete"), false);
});

test("backend proof harness reports only accepted policy evidence refs", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");
  const customEvidence = await runBackendProofHarness({
    lifecycle,
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    candidates: [fixture.candidate],
    workerId: "worker-1",
    approvedWorkspaceRoots,
    policyProofInput: {
      authorityFamily: "dispatcher_lifecycle",
      operation: "claim",
      scope: "backend-proof queue",
      evidenceRefs: ["runtime-port:policy-custom-proof"]
    }
  });
  assert.equal(customEvidence.ok, true);
  assert.equal(customEvidence.proof.boundary.evidence_refs.includes("runtime-port:policy-custom-proof"), true);
  assert.equal(customEvidence.proof.boundary.evidence_refs.includes("runtime-port:policy-simulated-proof"), false);
  assert.deepEqual(customEvidence.proof.boundary.runtime_ports.policy.evidence_refs, ["runtime-port:policy-custom-proof"]);

  const rejectedEvidence = await runBackendProofHarness({
    lifecycle,
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    candidates: [fixture.candidate],
    workerId: "worker-1",
    approvedWorkspaceRoots,
    policyProofInput: {
      authorityFamily: "dispatcher_lifecycle",
      operation: "claim",
      scope: "backend-proof queue",
      evidenceRefs: ["runtime-port:policy\nraw-proof"]
    }
  });
  assert.equal(rejectedEvidence.ok, false);
  assert.equal(rejectedEvidence.status, "blocked");
  assert.equal(rejectedEvidence.proof.boundary.evidence_refs.includes("runtime-port:policy-simulated-proof"), false);
  assert.equal(rejectedEvidence.proof.boundary.evidence_refs.includes("runtime-port:policy\nraw-proof"), false);
  assert.deepEqual(rejectedEvidence.proof.boundary.runtime_ports.policy.evidence_refs, []);
});

test("backend proof harness fails fast without approved workspace roots", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");
  for (const approvedWorkspaceRootsPayload of [undefined, [], ["/tmp"], ["relative/root"]]) {
    const result = await runBackendProofHarness({
      lifecycle,
      clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
      candidates: [fixture.candidate],
      workerId: "worker-1",
      approvedWorkspaceRoots: approvedWorkspaceRootsPayload
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, "blocked");
    assert.deepEqual(result.blockers, ["backend_proof_requires_approved_workspace_roots"]);
    assert.equal(result.proof.boundary.evidence_refs.includes("runtime-port:approved-workspace-roots-invalid"), true);
    assert.equal(result.proof.boundary.evidence_refs.includes("evidence-refill"), false);
    assert.equal(result.proof.boundary.runtime_ports.blocker, "approved_workspace_roots_invalid");
  }
});

test("backend proof harness fails closed for malformed candidates before queue mutation", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");
  for (const malformedCandidates of [undefined, null, { candidate: fixture.candidate }, "not-an-array"]) {
    const result = await runBackendProofHarness({
      lifecycle,
      clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
      candidates: malformedCandidates,
      workerId: "worker-1",
      approvedWorkspaceRoots
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, "blocked");
    assert.deepEqual(result.blockers, ["backend_proof_requires_candidates_array"]);
    assert.equal(result.proof.boundary.evidence_refs.includes("backend-proof-invalid-candidates"), true);
    assert.equal(result.proof.boundary.evidence_refs.includes("evidence-refill"), false);
  }

  const malformedPacket = await runBackendProofHarness({
    lifecycle,
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    candidates: [{ ...fixture.candidate, sourceRefs: [] }],
    workerId: "worker-1",
    approvedWorkspaceRoots
  });
  assert.equal(malformedPacket.ok, false);
  assert.equal(malformedPacket.status, "blocked");
  assert.equal(malformedPacket.blockers.includes("Queue proof refill requires bounded candidate work packet metadata."), true);
  assert.equal(malformedPacket.proof.boundary.evidence_refs.includes("evidence-refill"), true);
  assert.equal(malformedPacket.proof.boundary.evidence_refs.includes("evidence-complete"), false);

  const unsafeRunId = await runBackendProofHarness({
    lifecycle,
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    candidates: [{ ...fixture.candidate, runId: "sk-1234567890abcdef" }],
    workerId: "worker-1",
    approvedWorkspaceRoots: ["/tmp"]
  });
  assert.equal(unsafeRunId.ok, false);
  assert.equal(unsafeRunId.status, "blocked");
  assert.deepEqual(unsafeRunId.blockers, ["backend_proof_requires_explicit_run_id"]);
  assert.equal(unsafeRunId.proof.boundary.run_id, "unknown-run");
  assert.equal(JSON.stringify(unsafeRunId).includes("sk-1234567890abcdef"), false);
  assert.equal(unsafeRunId.proof.boundary.evidence_refs.includes("runtime-port:approved-workspace-roots-invalid"), false);
});

test("backend proof harness verifies the claimed work item target", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");
  const blockedFirstCandidate = {
    ...fixture.candidate,
    candidateWorkPacketId: "candidate-blocked-first",
    authorityClass: "requires_preauthorization",
    verificationTargets: [{
      ...fixture.candidate.verificationTargets[0],
      verificationTargetId: "verify-blocked-first",
      commandId: "blocked-first-target"
    }]
  };
  const selectedSecondCandidate = {
    ...fixture.candidate,
    candidateWorkPacketId: "candidate-selected-second",
    sourceRefs: [{
      ...fixture.candidate.sourceRefs[0],
      sourceRefId: "source-selected-second",
      sourceSpan: "Story 2.1 selected second candidate"
    }],
    dependencyHints: ["selected-second-dependency"],
    dedupeKey: "selected-second",
    verificationTargets: [{
      ...fixture.candidate.verificationTargets[0],
      verificationTargetId: "verify-selected-second",
      commandId: "selected-second-target"
    }]
  };

  const result = await runBackendProofHarness({
    lifecycle,
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    candidates: [blockedFirstCandidate, selectedSecondCandidate],
    workerId: "worker-1",
    approvedWorkspaceRoots
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "completed");
  assert.equal(result.proof.boundary.runtime_ports.verification.command_id, "selected-second-target");
  assert.equal(result.proof.boundary.runtime_ports.verification.verification_target_id, "verify-selected-second");
  assert.equal(JSON.stringify(result).includes("blocked-first-target"), false);
});

test("memory dispatcher adapter handles empty refill and missing evidence deterministically", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const emptyFixture = await loadManagerFixture("refill-empty.json");
  const missingEvidenceFixture = await loadManagerFixture("missing-evidence.json");
  const adapter = createMemoryDispatcherAdapter({
    lifecycle,
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    runId: "run-1"
  });

  const emptyRefill = await adapter.refill({
    candidates: emptyFixture.candidates,
    evidenceRefs: ["evidence-empty-refill"],
    policyReason: "fixture source exhausted"
  });
  assert.equal(emptyRefill.ok, true);
  assert.equal(emptyRefill.value.refillJob.result, "no_safe_work");
  assert.equal(emptyRefill.value.events.some((event) => event.eventName === "dispatcher.work_supply.empty"), true);

  const missingEvidence = await adapter.refill({
    candidates: [missingEvidenceFixture.candidate],
    evidenceRefs: [],
    policyReason: "missing evidence should fail"
  });
  assert.equal(missingEvidence.ok, false);
  assert.equal(missingEvidence.code, "missing_evidence");
});

test("memory dispatcher adapter expires stale leases and requeues retryable work once", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("expired-lease.json");
  const clock = lifecycle.createManualClock("2026-06-30T00:00:00.000Z");
  const adapter = createMemoryDispatcherAdapter({
    lifecycle,
    clock,
    runId: "run-1",
    leaseTtlMs: 60_000
  });

  const refill = await adapter.refill({
    candidates: [fixture.candidate],
    evidenceRefs: ["evidence-refill"],
    policyReason: "fixture-backed safe source"
  });
  assert.equal(refill.ok, true);
  const claim = await adapter.claim({ workerId: "worker-1", evidenceRefs: ["evidence-claim"] });
  assert.equal(claim.ok, true);

  clock.advanceMs(60_001);
  const recovery = await adapter.recoverExpiredLeases({ evidenceRefs: ["evidence-recovery"] });
  assert.equal(recovery.ok, true);
  assert.equal(recovery.value.expiredLeases.length, 1);
  assert.equal(recovery.value.expiredLeases[0].state, "expired");
  assert.equal(recovery.value.recoveredWorkItems.length, 1);
  assert.equal(recovery.value.recoveredWorkItems[0].status, "queued");
  assert.equal(recovery.value.events.some((event) => event.eventName === "dispatcher.lease.expired"), true);
  assert.equal(recovery.value.events.some((event) => event.eventName === "dispatcher.recovery.attempted"), true);

  const snapshot = adapter.snapshot();
  assert.equal(snapshot.attempts[0].state, "expired");

  const secondRecovery = await adapter.recoverExpiredLeases({ evidenceRefs: ["evidence-recovery"] });
  assert.equal(secondRecovery.ok, true);
  assert.equal(secondRecovery.value.expiredLeases.length, 0);
});

test("memory dispatcher adapter blocks gated authority candidates and proves duplicate fixture basis", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const duplicateFixture = await loadManagerFixture("duplicate-pull.json");
  const adapter = createMemoryDispatcherAdapter({
    lifecycle,
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    runId: "run-1"
  });

  const duplicateRefill = await adapter.refill({
    candidates: duplicateFixture.candidates,
    evidenceRefs: ["evidence-duplicate"],
    policyReason: "fixture-backed duplicate source"
  });
  assert.equal(duplicateRefill.ok, true);
  assert.equal(duplicateRefill.value.queuedWorkItems.length, 1);
  assert.equal(duplicateRefill.value.duplicateCandidates.length, 1);

  const gated = await adapter.refill({
    candidates: [{
      ...duplicateFixture.candidates[0],
      candidateWorkPacketId: "candidate-gated",
      authorityClass: "requires_preauthorization",
      dependencyHints: ["packages/workflow-core/src/ports/gated-authority.ts"],
      dedupeKey: "gated"
    }],
    evidenceRefs: ["evidence-gated"],
    policyReason: "gated authority candidate should not queue"
  });
  assert.equal(gated.ok, true);
  assert.equal(gated.value.queuedWorkItems.length, 0);
  assert.equal(gated.value.needsReviewCandidates.length, 1);
  assert.equal(gated.value.blockedCandidates.length, 0);
  assert.equal(gated.value.events.some((event) => event.eventName === "dispatcher.review.required"), true);
  assert.equal(gated.value.events.some((event) => event.eventName === "dispatcher.authority.blocked"), false);

  const summary = await adapter.summarize();
  assert.equal(summary.currentPhase, "queued");
  assert.equal(summary.stateCounts.queued, 1);
  assert.equal(summary.stateCounts.needsReviewCandidates, 1);
  assert.equal(summary.stateCounts.blockedCandidates, 0);
  assert.equal(summary.stateCounts.duplicateCandidates, 1);
  assert.equal(summary.unsafeOrGatedWorkCount, 1);
  assert.equal(summary.authorityBlockedReason, null);
  assert.equal(summary.authorityClass, "requires_preauthorization");
  assert.equal(summary.operatorAttentionRequired, true);
  assert.equal(summary.blockers.includes("dispatcher_has_needs_review_candidates"), true);
  assert.equal(summary.rawStateLabels.includes("candidate:needs_review"), true);
  assert.equal(summary.rawStateLabels.includes("candidate:duplicate"), true);
  assert.equal(summary.warnings.includes("duplicate_candidates_ignored"), true);
  assert.equal(summary.warnings.includes("needs_review_candidates_recorded"), true);
});

test("memory dispatcher adapter permits only one same-tick claim and recovers failed work", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");
  const adapter = createMemoryDispatcherAdapter({
    lifecycle,
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    runId: "run-1"
  });

  const refill = await adapter.refill({
    candidates: [fixture.candidate],
    evidenceRefs: ["evidence-refill"],
    policyReason: "fixture-backed safe source"
  });
  assert.equal(refill.ok, true);

  const claims = await Promise.all([
    adapter.claim({ workerId: "worker-1", evidenceRefs: ["evidence-claim-1"] }),
    adapter.claim({ workerId: "worker-2", evidenceRefs: ["evidence-claim-2"] })
  ]);
  assert.equal(claims.filter((claim) => claim.ok).length, 1);
  assert.equal(claims.filter((claim) => !claim.ok && claim.code === "no_work").length, 1);
  const successfulClaim = claims.find((claim) => claim.ok);
  const heartbeat = await adapter.heartbeat({
    leaseId: successfulClaim.value.lease.leaseId,
    workerId: successfulClaim.value.lease.workerId,
    attemptId: successfulClaim.value.lease.attemptId,
    idempotencyKey: successfulClaim.value.lease.idempotencyKey,
    authorityDecisionId: successfulClaim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-heartbeat"],
    ttlMs: 300_000
  });
  assert.equal(heartbeat.ok, true);
  const failed = await adapter.fail({
    leaseId: successfulClaim.value.lease.leaseId,
    workerId: successfulClaim.value.lease.workerId,
    attemptId: successfulClaim.value.lease.attemptId,
    idempotencyKey: successfulClaim.value.lease.idempotencyKey,
    authorityDecisionId: successfulClaim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-fail"],
    failureReason: "fixture failure"
  });
  assert.equal(failed.ok, true);
  const summaryBeforeRecovery = await adapter.summarize();
  assert.equal(summaryBeforeRecovery.currentPhase, "failed");
  assert.equal(summaryBeforeRecovery.operatorAttentionRequired, true);
  assert.equal(summaryBeforeRecovery.attentionReason, "dispatcher_phase_failed");
  assert.equal(summaryBeforeRecovery.recoveryStatus, "needed");
  assert.equal(summaryBeforeRecovery.stateCounts.failed, 1);
  assert.equal(summaryBeforeRecovery.rawStateLabels.includes("work:failed"), true);
  const mismatchedCloseout = await adapter.complete({
    leaseId: successfulClaim.value.lease.leaseId,
    workerId: successfulClaim.value.lease.workerId,
    attemptId: "attempt-999",
    idempotencyKey: successfulClaim.value.lease.idempotencyKey,
    authorityDecisionId: successfulClaim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-mismatch"],
    resultSummary: "should not close"
  });
  assert.equal(mismatchedCloseout.ok, false);
  assert.equal(mismatchedCloseout.code, "stale_lease");
  const recovery = await adapter.recoverExpiredLeases({ evidenceRefs: ["evidence-failed-recovery"] });
  assert.equal(recovery.ok, true);
  assert.equal(recovery.value.recoveredWorkItems.length, 1);
  assert.equal(recovery.value.recoveredWorkItems[0].status, "queued");
  const summaryAfterRecovery = await adapter.summarize();
  assert.equal(summaryAfterRecovery.currentPhase, "queued");
  assert.equal(summaryAfterRecovery.recoveryStatus, "complete");
  assert.equal(summaryAfterRecovery.nextAction, "continue_monitoring");
  assert.equal(summaryAfterRecovery.blockers.includes("dispatcher_has_failed_attempt"), false);
  assert.equal(summaryAfterRecovery.blockers.includes("dispatcher_phase_failed"), false);
});

test("memory dispatcher summary keeps mixed queued and failed work operator-visible", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");
  const adapter = createMemoryDispatcherAdapter({
    lifecycle,
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    runId: "run-1"
  });
  const secondCandidate = {
    ...fixture.candidate,
    candidateWorkPacketId: "candidate-2",
    sourceRefs: [{
      ...fixture.candidate.sourceRefs[0],
      sourceRefId: "source-2",
      sourceSpan: "Story 1.4 mixed queued"
    }],
    proposedSlice: "Second safe slice",
    dedupeKey: "story-1.4:mixed-queued"
  };

  const refill = await adapter.refill({
    candidates: [fixture.candidate, secondCandidate],
    evidenceRefs: ["evidence-refill"],
    policyReason: "fixture-backed mixed state source"
  });
  assert.equal(refill.ok, true);
  assert.equal(refill.value.queuedWorkItems.length, 2);
  const claim = await adapter.claim({ workerId: "worker-1", evidenceRefs: ["evidence-claim"] });
  assert.equal(claim.ok, true);
  const heartbeat = await adapter.heartbeat({
    leaseId: claim.value.lease.leaseId,
    workerId: claim.value.lease.workerId,
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-heartbeat"],
    ttlMs: 300_000
  });
  assert.equal(heartbeat.ok, true);
  const failed = await adapter.fail({
    leaseId: claim.value.lease.leaseId,
    workerId: claim.value.lease.workerId,
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-fail"],
    failureReason: "fixture failure"
  });
  assert.equal(failed.ok, true);

  const summary = await adapter.summarize();
  assert.equal(summary.currentPhase, "queued");
  assert.equal(summary.stateCounts.queued, 1);
  assert.equal(summary.stateCounts.failed, 1);
  assert.equal(summary.operatorAttentionRequired, true);
  assert.equal(summary.blockers.includes("dispatcher_has_failed_work"), true);
  assert.equal(summary.recoveryStatus, "needed");
  assert.equal(summary.nextAction, "run_recovery");
});

test("memory dispatcher closeout rejects mismatched existing attempt identity", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");
  const adapter = createMemoryDispatcherAdapter({
    lifecycle,
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    runId: "run-1"
  });
  const secondCandidate = {
    ...fixture.candidate,
    candidateWorkPacketId: "candidate-2",
    sourceRefs: [{
      ...fixture.candidate.sourceRefs[0],
      sourceRefId: "source-2",
      sourceSpan: "Story 1.4 second active claim"
    }],
    proposedSlice: "Second active slice",
    dedupeKey: "story-1.4:second-active"
  };
  const refill = await adapter.refill({
    candidates: [fixture.candidate, secondCandidate],
    evidenceRefs: ["evidence-refill"],
    policyReason: "fixture-backed closeout identity source"
  });
  assert.equal(refill.ok, true);
  const firstClaim = await adapter.claim({ workerId: "worker-1", evidenceRefs: ["evidence-claim-1"] });
  const secondClaim = await adapter.claim({ workerId: "worker-2", evidenceRefs: ["evidence-claim-2"] });
  assert.equal(firstClaim.ok, true);
  assert.equal(secondClaim.ok, true);

  const mismatched = await adapter.complete({
    leaseId: firstClaim.value.lease.leaseId,
    workerId: firstClaim.value.lease.workerId,
    attemptId: secondClaim.value.lease.attemptId,
    idempotencyKey: firstClaim.value.lease.idempotencyKey,
    authorityDecisionId: firstClaim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-mismatched-closeout"],
    resultSummary: "should not close"
  });
  assert.equal(mismatched.ok, false);
  assert.equal(mismatched.code, "stale_lease");
});

test("memory dispatcher summary distinguishes empty, authority-blocked, and stale states", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const emptyFixture = await loadManagerFixture("refill-empty.json");
  const duplicateFixture = await loadManagerFixture("duplicate-pull.json");
  const summaryFixture = await loadManagerFixture("summary-states.json");
  assert.deepEqual(
    summaryFixture.states.map((state) => state.state),
    [
      "queued",
      "leased_running",
      "completed",
      "failed",
      "expired_recovered",
      "authority_blocked",
      "duplicate_only",
      "empty_no_safe_work",
      "stale",
      "unknown"
    ]
  );
  for (const state of summaryFixture.states) {
    assert.equal(Array.isArray(state.expectedLabels), true, `${state.state} must define expected labels`);
    assert.equal(Boolean(state.expectedPhase || state.expectedFreshness), true, `${state.state} must define a phase or freshness`);
  }
  const clock = lifecycle.createManualClock("2026-06-30T00:00:00.000Z");
  const adapter = createMemoryDispatcherAdapter({
    lifecycle,
    clock,
    runId: "run-1",
    summaryStaleAfterMs: 60_000
  });

  const emptyRefill = await adapter.refill({
    candidates: emptyFixture.candidates,
    evidenceRefs: ["evidence-empty-refill"],
    policyReason: "fixture source exhausted"
  });
  assert.equal(emptyRefill.ok, true);
  const emptySummary = await adapter.summarize();
  assert.equal(emptySummary.currentPhase, "no_safe_work");
  assert.equal(emptySummary.safeWorkAvailableCount, 0);
  assert.equal(emptySummary.stateCounts.noSafeWork, 1);
  assert.equal(emptySummary.rawStateLabels.includes("supply:no_safe_work"), true);
  assert.equal(emptySummary.operatorAttentionRequired, false);

  const blockedOnly = createMemoryDispatcherAdapter({
    lifecycle,
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    runId: "run-1"
  });
  const blockedRefill = await blockedOnly.refill({
    candidates: [{
      ...duplicateFixture.candidates[0],
      candidateWorkPacketId: "candidate-blocked-only",
      authorityClass: "forbidden",
      dedupeKey: "blocked-only"
    }],
    evidenceRefs: ["evidence-blocked-only"],
    policyReason: "forbidden candidate should not queue"
  });
  assert.equal(blockedRefill.ok, true);
  const blockedSummary = await blockedOnly.summarize();
  assert.equal(blockedSummary.currentPhase, "blocked");
  assert.equal(blockedSummary.authorityClass, "block_and_record");
  assert.equal(blockedSummary.authorityStopReason, "forbidden");
  assert.equal(blockedSummary.operatorAttentionRequired, true);
  assert.equal(blockedSummary.stateCounts.blockedCandidates, 1);
  assert.equal(blockedSummary.rawStateLabels.includes("candidate:blocked"), true);

  const mixedMetadataOnlySummary = buildManagerExecutionLaneSummary({
    runId: "run-1",
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    workItems: [{
      workItemId: "work-item-mixed",
      status: "queued",
      evidenceRefs: ["evidence-mixed-metadata"],
      sourceRefs: [{ sourceRefId: "source-mixed-metadata" }],
      verificationTargets: [{ commandId: "manager-dispatcher-port-test" }]
    }],
    refillJobs: [{
      refillJobId: "refill-mixed-metadata",
      state: "completed",
      result: "queued_with_gated_candidates",
      queuedCount: 1,
      blockedCount: 0,
      needsReviewCount: 2,
      authorityClass: "block_and_record",
      evidenceRefs: ["evidence-mixed-metadata"]
    }],
    blockedCandidates: [],
    needsReviewCandidates: [],
    events: [{
      eventId: "event-mixed-metadata",
      eventName: "dispatcher.refill.completed",
      occurredAt: "2026-06-30T00:00:00.000Z",
      evidenceRefs: ["evidence-mixed-metadata"]
    }]
  });
  assert.equal(mixedMetadataOnlySummary.currentPhase, "queued");
  assert.equal(mixedMetadataOnlySummary.stateCounts.needsReviewCandidates, 2);
  assert.equal(mixedMetadataOnlySummary.nextAction, "review_refill_candidates");
  assert.equal(mixedMetadataOnlySummary.operatorAttentionRequired, true);
  assert.equal(mixedMetadataOnlySummary.authorityClass, "block_and_record");
  assert.equal(mixedMetadataOnlySummary.authorityStopReason, "needs_review");
  assert.equal(mixedMetadataOnlySummary.blockers.includes("dispatcher_has_needs_review_candidates"), true);

  const queuedNeedsReviewMetadataOnlySummary = buildManagerExecutionLaneSummary({
    runId: "run-1",
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    refillJobs: [{
      refillJobId: "refill-queued-needs-review-metadata",
      state: "completed",
      result: "queued_with_gated_candidates",
      queuedCount: 2,
      blockedCount: 0,
      needsReviewCount: 1,
      authorityClass: "block_and_record",
      evidenceRefs: ["evidence-queued-needs-review-metadata"]
    }],
    blockedCandidates: [],
    needsReviewCandidates: [],
    events: [{
      eventId: "event-queued-needs-review-metadata",
      eventName: "dispatcher.refill.completed",
      occurredAt: "2026-06-30T00:00:00.000Z",
      evidenceRefs: ["evidence-queued-needs-review-metadata"]
    }]
  });
  assert.equal(queuedNeedsReviewMetadataOnlySummary.currentPhase, "needs_review");
  assert.equal(queuedNeedsReviewMetadataOnlySummary.stateCounts.queued, 0);
  assert.equal(queuedNeedsReviewMetadataOnlySummary.safeWorkAvailableCount, 0);
  assert.equal(queuedNeedsReviewMetadataOnlySummary.metadataOnlyQueuedCount, 2);
  assert.equal(queuedNeedsReviewMetadataOnlySummary.stateCounts.metadataOnlyQueuedCandidates, 2);
  assert.equal(queuedNeedsReviewMetadataOnlySummary.stateCounts.needsReviewCandidates, 1);
  assert.equal(queuedNeedsReviewMetadataOnlySummary.stateCounts.noSafeWork, 0);
  assert.equal(queuedNeedsReviewMetadataOnlySummary.nextAction, "review_refill_candidates");
  assert.equal(queuedNeedsReviewMetadataOnlySummary.operatorAttentionRequired, true);
  assert.equal(queuedNeedsReviewMetadataOnlySummary.authorityClass, "block_and_record");
  assert.equal(queuedNeedsReviewMetadataOnlySummary.authorityStopReason, "needs_review");
  assert.equal(queuedNeedsReviewMetadataOnlySummary.rawStateLabels.includes("work:queued"), false);
  assert.equal(queuedNeedsReviewMetadataOnlySummary.rawStateLabels.includes("refill:queued_metadata"), true);
  assert.equal(queuedNeedsReviewMetadataOnlySummary.rawStateLabels.includes("candidate:needs_review"), true);
  assert.equal(queuedNeedsReviewMetadataOnlySummary.blockers.includes("dispatcher_has_needs_review_candidates"), true);

  const queuedMetadataOnlySummary = buildManagerExecutionLaneSummary({
    runId: "run-1",
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    refillJobs: [{
      refillJobId: "refill-queued-metadata-only",
      state: "completed",
      result: "queued_work",
      queuedCount: 2,
      blockedCount: 0,
      needsReviewCount: 0,
      authorityClass: "allowed_unattended",
      startedAt: "2026-06-30T00:00:00.000Z",
      finishedAt: "2026-06-30T00:00:00.000Z",
      evidenceRefs: ["evidence-queued-metadata-only"]
    }],
    events: [{
      eventId: "event-queued-metadata-only",
      eventName: "dispatcher.refill.completed",
      occurredAt: "2026-06-30T00:00:00.000Z",
      evidenceRefs: ["evidence-queued-metadata-only"]
    }]
  });
  assert.equal(queuedMetadataOnlySummary.currentPhase, "queued");
  assert.equal(queuedMetadataOnlySummary.stateCounts.queued, 0);
  assert.equal(queuedMetadataOnlySummary.safeWorkAvailableCount, 0);
  assert.equal(queuedMetadataOnlySummary.metadataOnlyQueuedCount, 2);
  assert.equal(queuedMetadataOnlySummary.stateCounts.noSafeWork, 0);
  assert.equal(queuedMetadataOnlySummary.rawStateLabels.includes("work:queued"), false);
  assert.equal(queuedMetadataOnlySummary.rawStateLabels.includes("refill:queued_metadata"), true);
  assert.equal(queuedMetadataOnlySummary.rawStateLabels.includes("supply:no_safe_work"), false);

  const completedHistoryWithQueuedMetadataOnlySummary = buildManagerExecutionLaneSummary({
    runId: "run-1",
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    workItems: [{
      workItemId: "work-item-completed-history",
      status: "completed",
      evidenceRefs: ["evidence-completed-history"],
      sourceRefs: [{ sourceRefId: "source-completed-history" }],
      verificationTargets: [{ commandId: "manager-dispatcher-port-test" }],
      createdAt: "2026-06-29T23:00:00.000Z"
    }, {
      workItemId: "work-item-closed-history",
      status: "closed",
      evidenceRefs: ["evidence-closed-history"],
      sourceRefs: [{ sourceRefId: "source-closed-history" }],
      verificationTargets: [{ commandId: "manager-dispatcher-port-test" }],
      createdAt: "2026-06-29T23:30:00.000Z"
    }],
    refillJobs: [{
      refillJobId: "refill-completed-history-queued-metadata",
      state: "completed",
      result: "queued_work",
      queuedCount: 2,
      blockedCount: 0,
      needsReviewCount: 0,
      authorityClass: "allowed_unattended",
      startedAt: "2026-06-30T00:00:00.000Z",
      finishedAt: "2026-06-30T00:00:00.000Z",
      evidenceRefs: ["evidence-completed-history-queued-metadata"]
    }],
    events: [{
      eventId: "event-completed-history-queued-metadata",
      eventName: "dispatcher.refill.completed",
      occurredAt: "2026-06-30T00:00:00.000Z",
      evidenceRefs: ["evidence-completed-history-queued-metadata"]
    }]
  });
  assert.equal(completedHistoryWithQueuedMetadataOnlySummary.currentPhase, "queued");
  assert.equal(completedHistoryWithQueuedMetadataOnlySummary.stateCounts.completed, 1);
  assert.equal(completedHistoryWithQueuedMetadataOnlySummary.stateCounts.closed, 1);
  assert.equal(completedHistoryWithQueuedMetadataOnlySummary.stateCounts.queued, 0);
  assert.equal(completedHistoryWithQueuedMetadataOnlySummary.metadataOnlyQueuedCount, 2);
  assert.equal(completedHistoryWithQueuedMetadataOnlySummary.safeWorkAvailableCount, 0);
  assert.equal(completedHistoryWithQueuedMetadataOnlySummary.nextAction, "continue_monitoring");
  assert.equal(completedHistoryWithQueuedMetadataOnlySummary.rawStateLabels.includes("refill:queued_metadata"), true);

  const failedWithQueuedMetadataOnlySummary = buildManagerExecutionLaneSummary({
    runId: "run-1",
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    workItems: [{
      workItemId: "work-item-failed-with-queued-metadata",
      status: "failed",
      evidenceRefs: ["evidence-failed-with-queued-metadata"],
      sourceRefs: [{ sourceRefId: "source-failed-with-queued-metadata" }],
      verificationTargets: [{ commandId: "manager-dispatcher-port-test" }],
      createdAt: "2026-06-30T00:00:00.000Z"
    }],
    refillJobs: [{
      refillJobId: "refill-failed-with-queued-metadata",
      state: "completed",
      result: "queued_work",
      queuedCount: 2,
      blockedCount: 0,
      needsReviewCount: 0,
      authorityClass: "allowed_unattended",
      startedAt: "2026-06-30T00:00:00.000Z",
      finishedAt: "2026-06-30T00:00:00.000Z",
      evidenceRefs: ["evidence-failed-with-queued-metadata"]
    }],
    events: [{
      eventId: "event-failed-with-queued-metadata",
      eventName: "dispatcher.refill.completed",
      occurredAt: "2026-06-30T00:00:00.000Z",
      evidenceRefs: ["evidence-failed-with-queued-metadata"]
    }]
  });
  assert.equal(failedWithQueuedMetadataOnlySummary.currentPhase, "failed");
  assert.equal(failedWithQueuedMetadataOnlySummary.stateCounts.failed, 1);
  assert.equal(failedWithQueuedMetadataOnlySummary.stateCounts.queued, 0);
  assert.equal(failedWithQueuedMetadataOnlySummary.safeWorkAvailableCount, 0);
  assert.equal(failedWithQueuedMetadataOnlySummary.metadataOnlyQueuedCount, 1);
  assert.equal(failedWithQueuedMetadataOnlySummary.stateCounts.metadataOnlyQueuedCandidates, 1);
  assert.equal(failedWithQueuedMetadataOnlySummary.rawStateLabels.includes("work:queued"), false);
  assert.equal(failedWithQueuedMetadataOnlySummary.rawStateLabels.includes("refill:queued_metadata"), true);
  assert.equal(failedWithQueuedMetadataOnlySummary.nextAction, "run_recovery");

  const oldFailedWithReusedEvidenceSummary = buildManagerExecutionLaneSummary({
    runId: "run-1",
    clock: lifecycle.createManualClock("2026-06-30T00:10:00.000Z"),
    workItems: [{
      workItemId: "work-item-old-failed-reused-evidence",
      status: "failed",
      evidenceRefs: ["evidence-reused-refill"],
      sourceRefs: [{ sourceRefId: "source-old-failed-reused-evidence" }],
      verificationTargets: [{ commandId: "manager-dispatcher-port-test" }],
      createdAt: "2026-06-30T00:00:00.000Z"
    }],
    refillJobs: [{
      refillJobId: "refill-reused-evidence-latest",
      state: "completed",
      result: "queued_work",
      queuedCount: 2,
      blockedCount: 0,
      needsReviewCount: 0,
      authorityClass: "allowed_unattended",
      startedAt: "2026-06-30T00:05:00.000Z",
      finishedAt: "2026-06-30T00:05:00.000Z",
      evidenceRefs: ["evidence-reused-refill"]
    }],
    events: [{
      eventId: "event-reused-evidence-latest",
      eventName: "dispatcher.refill.completed",
      occurredAt: "2026-06-30T00:05:00.000Z",
      evidenceRefs: ["evidence-reused-refill"]
    }]
  });
  assert.equal(oldFailedWithReusedEvidenceSummary.currentPhase, "failed");
  assert.equal(oldFailedWithReusedEvidenceSummary.metadataOnlyQueuedCount, 2);
  assert.equal(oldFailedWithReusedEvidenceSummary.stateCounts.metadataOnlyQueuedCandidates, 2);
  assert.equal(oldFailedWithReusedEvidenceSummary.rawStateLabels.includes("refill:queued_metadata"), true);

  const noTimestampRefillSummary = buildManagerExecutionLaneSummary({
    runId: "run-1",
    clock: lifecycle.createManualClock("2026-06-30T00:10:00.000Z"),
    workItems: [{
      workItemId: "work-item-no-timestamp-retained",
      status: "queued",
      evidenceRefs: ["evidence-no-timestamp-refill"],
      sourceRefs: [{ sourceRefId: "source-no-timestamp-retained" }],
      verificationTargets: [{ commandId: "manager-dispatcher-port-test" }]
    }, {
      workItemId: "work-item-no-timestamp-completed-history",
      status: "completed",
      evidenceRefs: ["evidence-no-timestamp-refill"],
      sourceRefs: [{ sourceRefId: "source-no-timestamp-completed-history" }],
      verificationTargets: [{ commandId: "manager-dispatcher-port-test" }]
    }],
    refillJobs: [{
      refillJobId: "refill-no-timestamp",
      state: "completed",
      result: "queued_work",
      queuedCount: 2,
      blockedCount: 0,
      needsReviewCount: 0,
      authorityClass: "allowed_unattended",
      evidenceRefs: ["evidence-no-timestamp-refill"]
    }],
    events: [{
      eventId: "event-no-timestamp-refill",
      eventName: "dispatcher.refill.completed",
      occurredAt: "2026-06-30T00:05:00.000Z",
      evidenceRefs: ["evidence-no-timestamp-refill"]
    }]
  });
  assert.equal(noTimestampRefillSummary.currentPhase, "queued");
  assert.equal(noTimestampRefillSummary.stateCounts.queued, 1);
  assert.equal(noTimestampRefillSummary.safeWorkAvailableCount, 1);
  assert.equal(noTimestampRefillSummary.metadataOnlyQueuedCount, 1);
  assert.equal(noTimestampRefillSummary.stateCounts.metadataOnlyQueuedCandidates, 1);

  const malformedPersistedCandidateSummary = buildManagerExecutionLaneSummary({
    runId: "run-1",
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    blockedCandidates: [{
      candidateWorkPacketId: "candidate-malformed-persisted",
      sourceRefs: [{ sourceRefId: 42, sourceSpan: null }],
      acceptanceCriteria: [null, "bounded persisted metadata"],
      dependencyHints: [false, "scripts/lib/manager-control-plane/summary-projection.mjs"],
      dedupeKey: 123,
      status: "blocked",
      evidenceRefs: ["evidence-malformed-persisted"]
    }],
    needsReviewCandidates: [{
      candidateWorkPacketId: "candidate-malformed-persisted-review",
      sourceRefs: "not-an-array",
      acceptanceCriteria: [{ raw: "not retained" }],
      dependencyHints: null,
      dedupeKey: null,
      status: "needs_review",
      evidenceRefs: ["evidence-malformed-persisted"]
    }],
    events: [{
      eventId: "event-malformed-persisted",
      eventName: "dispatcher.refill.completed",
      occurredAt: "2026-06-30T00:00:00.000Z",
      evidenceRefs: ["evidence-malformed-persisted"]
    }]
  });
  assert.equal(malformedPersistedCandidateSummary.stateCounts.blockedCandidates, 1);
  assert.equal(malformedPersistedCandidateSummary.stateCounts.needsReviewCandidates, 1);
  assert.equal(malformedPersistedCandidateSummary.rawStateLabels.includes("candidate:blocked"), true);
  assert.equal(malformedPersistedCandidateSummary.rawStateLabels.includes("candidate:needs_review"), true);

  const blockedMetadataOnlySummary = buildManagerExecutionLaneSummary({
    runId: "run-1",
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    refillJobs: [{
      refillJobId: "refill-blocked-metadata",
      state: "completed",
      result: "blocked",
      queuedCount: 0,
      blockedCount: 3,
      needsReviewCount: 0,
      authorityClass: "block_and_record",
      evidenceRefs: ["evidence-blocked-metadata"]
    }],
    blockedCandidates: [],
    needsReviewCandidates: [],
    events: [{
      eventId: "event-blocked-metadata",
      eventName: "dispatcher.refill.completed",
      occurredAt: "2026-06-30T00:00:00.000Z",
      evidenceRefs: ["evidence-blocked-metadata"]
    }]
  });
  assert.equal(blockedMetadataOnlySummary.currentPhase, "blocked");
  assert.equal(blockedMetadataOnlySummary.stateCounts.blockedCandidates, 3);
  assert.equal(blockedMetadataOnlySummary.stateCounts.noSafeWork, 0);
  assert.equal(blockedMetadataOnlySummary.nextAction, "resolve_authority_or_source_blocker");
  assert.equal(blockedMetadataOnlySummary.operatorAttentionRequired, true);
  assert.equal(blockedMetadataOnlySummary.authorityClass, "block_and_record");
  assert.equal(blockedMetadataOnlySummary.blockers.includes("dispatcher_has_blocked_candidates"), true);
  assert.equal(blockedMetadataOnlySummary.rawStateLabels.includes("candidate:blocked"), true);

  const blockedNeedsReviewMetadataOnlySummary = buildManagerExecutionLaneSummary({
    runId: "run-1",
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    refillJobs: [{
      refillJobId: "refill-blocked-needs-review-metadata",
      state: "completed",
      result: "blocked",
      queuedCount: 0,
      blockedCount: 2,
      needsReviewCount: 3,
      authorityClass: "block_and_record",
      evidenceRefs: ["evidence-blocked-needs-review-metadata"]
    }],
    blockedCandidates: [],
    needsReviewCandidates: [],
    events: [{
      eventId: "event-blocked-needs-review-metadata",
      eventName: "dispatcher.refill.completed",
      occurredAt: "2026-06-30T00:00:00.000Z",
      evidenceRefs: ["evidence-blocked-needs-review-metadata"]
    }]
  });
  assert.equal(blockedNeedsReviewMetadataOnlySummary.stateCounts.blockedCandidates, 2);
  assert.equal(blockedNeedsReviewMetadataOnlySummary.stateCounts.needsReviewCandidates, 3);
  assert.equal(blockedNeedsReviewMetadataOnlySummary.unsafeOrGatedWorkCount, 5);
  assert.equal(blockedNeedsReviewMetadataOnlySummary.operatorAttentionRequired, true);

  clock.advanceMs(60_001);
  const staleSummary = await adapter.summarize();
  assert.equal(staleSummary.freshness, "stale");
  assert.equal(staleSummary.evidenceFreshness, "stale");
  assert.equal(staleSummary.operatorAttentionRequired, true);
  assert.equal(staleSummary.attentionReason, "dispatcher_summary_stale");
  assert.equal(staleSummary.rawStateLabels.includes("freshness:stale"), true);
});

test("summary projection preserves authoritative exhaustion and its resume requirement", () => {
  const terminalDisposition = {
    disposition: "authoritative_backlog_exhausted",
    runId: "run-terminal",
    sourceIdentity: "doc:docs/architecture/adr-current-product-slice-and-authority.md",
    sourceRevision: "adr-2026-07-11",
    reconciliationCounts: {
      totalItems: 4,
      reconciledItems: 4,
      eligible: 0,
      queued: 0,
      leased: 0,
      running: 0,
      reviewFix: 0,
      requiredRetrospective: 0,
      otherwiseRequired: 0,
      completed: 2,
      closed: 1,
      approvalGated: 1,
    },
    unresolvedApprovalGatedWork: [{
      workId: "approval-gated-item",
      title: "Needs approval",
      reason: "operator approval required",
      sourceRefs: ["doc:docs/architecture/adr-current-product-slice-and-authority.md"],
      evidenceRefs: ["evidence:approval-gated-item"],
    }],
    evidenceRefs: ["evidence:terminal"],
    resumeRequirement: "Start a new source-bound manager run.",
    nextManagerAction: "Stop and await a new source-bound manager run.",
    canonicalEventIntegration: "missing_supervisor_contract",
    idempotencyKey: "authoritative-backlog-exhausted:test",
    rawPayloadRetained: false,
  };
  const summary = buildManagerExecutionLaneSummary({
    runId: "run-terminal",
    clock: { nowEpochMs: () => Date.parse("2026-07-11T12:00:00.000Z"), nowIso: () => "2026-07-11T12:00:00.000Z" },
    refillJobs: [{
      refillJobId: "refill-terminal",
      sourceRefs: [terminalDisposition.sourceIdentity],
      sourceIdentity: terminalDisposition.sourceIdentity,
      sourceRevision: terminalDisposition.sourceRevision,
      state: "completed",
      result: "authoritative_backlog_exhausted",
      queuedCount: 0,
      needsReviewCount: 1,
      blockedCount: 0,
      evidenceRefs: terminalDisposition.evidenceRefs,
      terminalDisposition,
    }],
    events: [],
  });

  assert.equal(summary.currentPhase, "authoritative_backlog_exhausted");
  assert.equal(summary.terminalDisposition.sourceRevision, "adr-2026-07-11");
  assert.equal(summary.nextAction, "await_new_source_bound_manager_run");
  assert.equal(summary.operatorAttentionRequired, true);
  assert.equal(summary.attentionReason, "approval_gated_work_remains_visible");
  assert.ok(summary.blockers.includes("missing_supervisor_contract"));
  assert.ok(summary.rawStateLabels.includes("terminal:authoritative_backlog_exhausted"));
  assert.ok(summary.rawStateLabels.includes("terminal:missing_supervisor_contract"));
  const serialized = toManagerSummaryJson({ ok: true, status: summary.currentPhase, summary });
  assert.equal(serialized.summary.terminalDisposition.resumeRequirement, "Start a new source-bound manager run.");

  const integratedDisposition = {
    ...terminalDisposition,
    canonicalEventIntegration: "supervisor_canonical_event",
    supervisorEvent: {
      eventId: "manager-terminal-event-1234567890abcdef1234567890abcdef12345678",
      evidenceRef: "supervisor-event:manager-terminal-event-1234567890abcdef1234567890abcdef12345678",
      status: "persisted",
      persistedAt: "2026-07-12T01:02:03.000Z",
    },
  };
  const integratedSummary = buildManagerExecutionLaneSummary({
    runId: "run-terminal",
    clock: { nowEpochMs: () => Date.parse("2026-07-12T01:03:00.000Z"), nowIso: () => "2026-07-12T01:03:00.000Z" },
    refillJobs: [{
      refillJobId: "refill-terminal-integrated",
      sourceRefs: [integratedDisposition.sourceIdentity],
      sourceIdentity: integratedDisposition.sourceIdentity,
      sourceRevision: integratedDisposition.sourceRevision,
      state: "completed",
      result: "authoritative_backlog_exhausted",
      queuedCount: 0,
      needsReviewCount: 1,
      blockedCount: 0,
      evidenceRefs: integratedDisposition.evidenceRefs,
      terminalDisposition: integratedDisposition,
    }],
    events: [],
  });
  assert.equal(integratedSummary.currentPhase, "authoritative_backlog_exhausted");
  assert.equal(integratedSummary.blockers.includes("missing_supervisor_contract"), false);
  assert.ok(integratedSummary.rawStateLabels.includes("terminal:supervisor_canonical_event"));
  assert.ok(integratedSummary.warnings.includes("approval_gated_work_remains_visible"));
  assert.equal(integratedSummary.operatorAttentionRequired, true);

  const makeTerminalJob = (disposition, refillJobId) => ({
    refillJobId,
    sourceRefs: [terminalDisposition.sourceIdentity],
    sourceIdentity: terminalDisposition.sourceIdentity,
    sourceRevision: terminalDisposition.sourceRevision,
    state: "completed",
    result: "authoritative_backlog_exhausted",
    terminalDisposition: disposition,
  });
  const projectWithDisposition = (disposition, refillJobId) => buildManagerExecutionLaneSummary({
    runId: "run-terminal",
    clock: { nowEpochMs: () => Date.parse("2026-07-11T12:00:00.000Z"), nowIso: () => "2026-07-11T12:00:00.000Z" },
    refillJobs: [makeTerminalJob(disposition, refillJobId)],
    events: [],
  });

  const missingResumeRequirement = projectWithDisposition({ ...terminalDisposition, resumeRequirement: "" }, "refill-terminal-missing-resume");
  assert.equal(missingResumeRequirement.terminalDisposition, null);
  assert.equal(missingResumeRequirement.currentPhase, "blocked");
  assert.ok(missingResumeRequirement.blockers.includes("terminal_refill_history_conflict"));

  const missingNextManagerAction = projectWithDisposition({ ...terminalDisposition, nextManagerAction: "" }, "refill-terminal-missing-action");
  assert.equal(missingNextManagerAction.terminalDisposition, null);
  assert.equal(missingNextManagerAction.currentPhase, "blocked");
  assert.ok(missingNextManagerAction.blockers.includes("terminal_refill_history_conflict"));

  const invalidApprovalGatedRecord = projectWithDisposition({
    ...terminalDisposition,
    unresolvedApprovalGatedWork: [{ ...terminalDisposition.unresolvedApprovalGatedWork[0], evidenceRefs: [] }],
  }, "refill-terminal-invalid-record");
  assert.equal(invalidApprovalGatedRecord.terminalDisposition, null);
  assert.equal(invalidApprovalGatedRecord.currentPhase, "blocked");
  assert.ok(invalidApprovalGatedRecord.blockers.includes("terminal_refill_history_conflict"));

  const conflictingPayload = projectWithDisposition({
    ...terminalDisposition,
    reconciliationCounts: { ...terminalDisposition.reconciliationCounts, totalItems: 5, reconciledItems: 5, completed: 3 },
    idempotencyKey: terminalDisposition.idempotencyKey,
  }, "refill-terminal-conflicting-payload");
  const conflictingHistory = buildManagerExecutionLaneSummary({
    runId: "run-terminal",
    clock: { nowEpochMs: () => Date.parse("2026-07-11T12:00:00.000Z"), nowIso: () => "2026-07-11T12:00:00.000Z" },
    refillJobs: [
      {
        ...makeTerminalJob(terminalDisposition, "refill-terminal"),
      },
      makeTerminalJob(conflictingPayload.terminalDisposition ?? { ...terminalDisposition, reconciliationCounts: { ...terminalDisposition.reconciliationCounts, totalItems: 5, reconciledItems: 5, completed: 3 }, idempotencyKey: terminalDisposition.idempotencyKey }, "refill-terminal-conflicting-payload"),
    ],
    events: [],
  });
  assert.equal(conflictingHistory.terminalDisposition, null);
  assert.equal(conflictingHistory.currentPhase, "blocked");
  assert.ok(conflictingHistory.blockers.includes("terminal_refill_history_conflict"));

  const invalidEarlierHistory = buildManagerExecutionLaneSummary({
    runId: "run-terminal",
    clock: { nowEpochMs: () => Date.parse("2026-07-11T12:00:00.000Z"), nowIso: () => "2026-07-11T12:00:00.000Z" },
    refillJobs: [
      makeTerminalJob({ ...terminalDisposition, canonicalEventIntegration: "unexpected_supervisor_contract" }, "refill-terminal-invalid-earlier"),
      makeTerminalJob(terminalDisposition, "refill-terminal-valid-later"),
    ],
    events: [],
  });
  assert.equal(invalidEarlierHistory.terminalDisposition, null);
  assert.equal(invalidEarlierHistory.currentPhase, "blocked");
  assert.ok(invalidEarlierHistory.blockers.includes("terminal_refill_history_conflict"));

  const bareHistorical = buildManagerExecutionLaneSummary({
    runId: "run-bare-terminal",
    clock: { nowEpochMs: () => Date.parse("2026-07-11T12:00:00.000Z"), nowIso: () => "2026-07-11T12:00:00.000Z" },
    refillJobs: [{ result: "authoritative_backlog_exhausted", state: "completed", queuedCount: 0, needsReviewCount: 0, blockedCount: 0, evidenceRefs: ["evidence:bare"] }],
    events: [],
  });
  assert.equal(bareHistorical.terminalDisposition, null);
  assert.equal(bareHistorical.currentPhase, "blocked");
  assert.ok(bareHistorical.blockers.includes("terminal_refill_history_conflict"));
  assert.equal(bareHistorical.rawStateLabels.includes("terminal:authoritative_backlog_exhausted"), false);

  const wrongRun = buildManagerExecutionLaneSummary({
    runId: "run-terminal",
    clock: { nowEpochMs: () => Date.parse("2026-07-11T12:00:00.000Z"), nowIso: () => "2026-07-11T12:00:00.000Z" },
    refillJobs: [{
      refillJobId: "refill-wrong-run",
      sourceRefs: [terminalDisposition.sourceIdentity],
      sourceIdentity: terminalDisposition.sourceIdentity,
      sourceRevision: terminalDisposition.sourceRevision,
      state: "completed",
      result: "authoritative_backlog_exhausted",
      terminalDisposition: { ...terminalDisposition, runId: "different-run" },
    }],
    events: [],
  });
  assert.equal(wrongRun.terminalDisposition, null);
  assert.equal(wrongRun.currentPhase, "blocked");
  assert.ok(wrongRun.blockers.includes("terminal_refill_history_conflict"));

  const wrongSourceRevision = buildManagerExecutionLaneSummary({
    runId: "run-terminal",
    clock: { nowEpochMs: () => Date.parse("2026-07-11T12:00:00.000Z"), nowIso: () => "2026-07-11T12:00:00.000Z" },
    refillJobs: [{
      refillJobId: "refill-wrong-source-revision",
      sourceRefs: [terminalDisposition.sourceIdentity],
      sourceIdentity: terminalDisposition.sourceIdentity,
      sourceRevision: terminalDisposition.sourceRevision,
      state: "completed",
      result: "authoritative_backlog_exhausted",
      terminalDisposition: { ...terminalDisposition, sourceRevision: "different-revision" },
    }],
    events: [],
  });
  assert.equal(wrongSourceRevision.terminalDisposition, null);
  assert.equal(wrongSourceRevision.currentPhase, "blocked");
  assert.ok(wrongSourceRevision.blockers.includes("terminal_refill_history_conflict"));

  const laterNonterminal = buildManagerExecutionLaneSummary({
    runId: "run-terminal",
    clock: { nowEpochMs: () => Date.parse("2026-07-11T12:00:00.000Z"), nowIso: () => "2026-07-11T12:00:00.000Z" },
    refillJobs: [{
      refillJobId: "refill-terminal-history",
      sourceRefs: [terminalDisposition.sourceIdentity],
      sourceIdentity: terminalDisposition.sourceIdentity,
      sourceRevision: terminalDisposition.sourceRevision,
      state: "completed",
      result: "authoritative_backlog_exhausted",
      terminalDisposition,
    }, {
      refillJobId: "refill-later-nonterminal",
      sourceRefs: [terminalDisposition.sourceIdentity],
      state: "completed",
      result: "no_safe_work",
      queuedCount: 0,
      needsReviewCount: 0,
      blockedCount: 0,
      evidenceRefs: ["evidence:later-nonterminal"],
    }],
    events: [],
  });
  assert.equal(laterNonterminal.terminalDisposition, null);
  assert.equal(laterNonterminal.currentPhase, "blocked");
  assert.ok(laterNonterminal.rawStateLabels.includes("terminal:history_conflict"));
  assert.ok(laterNonterminal.blockers.includes("missing_supervisor_contract"));
});

test("summary projection marks corrupt or future progress timestamps unknown", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const clock = lifecycle.createManualClock("2026-06-30T00:00:00.000Z");
  const summary = buildManagerExecutionLaneSummary({
    runId: "run-1",
    clock,
    events: [{
      eventId: "event-bad",
      eventName: "dispatcher.work.queued",
      occurredAt: "not-a-date",
      evidenceRefs: ["evidence-bad"]
    }]
  });

  assert.equal(summary.freshness, "unknown");
  assert.equal(summary.unknownReason, "invalid_or_future_dispatcher_progress_timestamp");
  assert.equal(summary.operatorAttentionRequired, true);
  assert.equal(summary.blockers.includes("dispatcher_progress_timestamp_invalid"), true);
  assert.deepEqual(summary.feedbackRoutes, []);
  assert.deepEqual(summary.affectedDeliveryGates, []);
  assert.equal(summary.feedbackRecordPolicy, "metadata_only_feedback_record");
  assert.equal(summary.feedbackUnrelatedLanePolicy, "continue_unrelated_safe_lanes");
  assert.equal(summary.feedbackRetention, "metadata_only");
  assert.equal(summary.feedbackRawPayloadRetained, false);
});

test("memory dispatcher adapter rejects invalid lease TTLs before claim", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  assert.throws(
    () =>
      createMemoryDispatcherAdapter({
        lifecycle,
        clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
        leaseTtlMs: 0
      }),
    /positive leaseTtlMs/
  );
});

test("bounded summary JSON filters injected raw fields and preserves proof metadata", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");
  const result = await runBackendProofHarness({
    lifecycle,
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    candidates: [fixture.candidate],
    workerId: "worker-1",
    approvedWorkspaceRoots
  });
  const bounded = toManagerSummaryJson({
    ok: true,
    status: "completed",
    summary: {
      ...result.summary,
      rawWorkerTranscript: "must not leak",
      providerPayload: { secret: "must not leak" }
    },
    blockers: [],
    warnings: result.summary.warnings,
    next_actions: [result.summary.nextAction]
  });

  assert.equal("rawWorkerTranscript" in bounded.summary, false);
  assert.equal("providerPayload" in bounded.summary, false);
  assert.deepEqual(bounded.summary.feedbackRoutes, []);
  assert.deepEqual(bounded.summary.affectedDeliveryGates, []);
  assert.equal(bounded.summary.feedbackRecordPolicy, "metadata_only_feedback_record");
  assert.equal(bounded.summary.feedbackUnrelatedLanePolicy, "continue_unrelated_safe_lanes");
  assert.equal(bounded.summary.feedbackRetention, "metadata_only");
  assert.equal(bounded.summary.feedbackRawPayloadRetained, false);
  assert.equal(bounded.proof.metadata_only, true);
  assert.equal(bounded.proof.raw_payload_retained, false);
  assert.equal(bounded.proof.evidence_links.length > 0, true);
  assert.equal(bounded.proof.evidence_links.some((link) => link.verificationCommandId === "manager-dispatcher-port-test"), true);
});

test("pipeline manager execution lane adapter consumes only projected summaries", async () => {
  const adapterSource = await readFile(
    new URL("../apps/dashboard/src/lib/pipeline/manager-execution-lane-summary.ts", import.meta.url),
    "utf8"
  );

  assert.match(adapterSource, /ManagerExecutionLaneSummary/);
  assert.doesNotMatch(
    adapterSource,
    /scripts\/lib|memory-dispatcher-adapter|workflow-core|tmux\s+send|tmux\s+capture|from\s+["'][^"']*tmux|gh\s+|github\s+api|providerPayload|provider payload|rawPrompt|rawEvidence|rawWorker|transcript/i
  );
  assert.match(adapterSource, /rawStateLabels/);
  assert.match(adapterSource, /operatorAttentionRequired/);
});

test("runtime port proof slice leaves continuous manager loop source path unchanged", async () => {
  const runLoopSource = await readFile(managerRunLoopPath, "utf8");
  const packageJson = await readFile(new URL("../package.json", import.meta.url), "utf8");

  assert.match(packageJson, /"manager:run": "node \.\/scripts\/manager-run-loop\.mjs --summary-json"/);
  assert.doesNotMatch(runLoopSource, /backend-proof-harness|local-proof-runtime-adapters|runtime-ports/);
  assert.doesNotMatch(runLoopSource, /runBackendProofHarness|createLocalProofRuntimeAdapters/);
});

test("backend proof rejects false live worker execution claims before execution", async () => {
  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("false-worker-execution-claim.json");
  const result = await runBackendProofHarness({
    lifecycle,
    clock: lifecycle.createManualClock("2026-06-30T00:00:00.000Z"),
    candidates: [fixture.candidate],
    workerId: "worker-1",
    claimLiveWorkerExecution: true
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.blockers.includes("backend_proof_forbids_real_codex_worker_launch"), true);
  assert.equal(result.proof.boundary.result, "blocked");
  assert.equal(result.proof.boundary.forbidden.includes("real_codex_worker_launch"), true);
  assert.equal(result.proof.boundary.evidence_refs.includes("backend-proof-live-worker-claim"), true);
});

test("backend proof code does not use live side-effect transports or direct system clock calls", async () => {
  for (const target of [adapterPath, harnessPath, summaryJsonPath]) {
    const source = await readFile(target, "utf8");
    assert.doesNotMatch(source, /Date\s*\.\s*now\s*\(/, `${target.pathname} uses Date.now`);
    assert.doesNotMatch(source, /node:child_process|spawnSync|execSync|tmux|gh\s|GITHUB_|OPENAI_API_KEY|BullMQ|Redis|Hatchet|SQLite|sqlite/i);
  }
});

async function refillAndClaim(adapter, candidate, label) {
  const refill = await adapter.refill({
    candidates: [candidate],
    evidenceRefs: [`evidence-${label}-refill`],
    policyReason: "fixture-backed safe source"
  });
  assert.equal(refill.ok, true);
  const claim = await adapter.claim({ workerId: "worker-1", evidenceRefs: [`evidence-${label}-claim`] });
  assert.equal(claim.ok, true);
  return claim;
}

async function refillClaimAndHeartbeat(adapter, candidate, label) {
  const claim = await refillAndClaim(adapter, candidate, label);
  const heartbeat = await adapter.heartbeat({
    leaseId: claim.value.lease.leaseId,
    workerId: claim.value.lease.workerId,
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: [`evidence-${label}-heartbeat`],
    ttlMs: 300_000
  });
  assert.equal(heartbeat.ok, true);
  return claim;
}
