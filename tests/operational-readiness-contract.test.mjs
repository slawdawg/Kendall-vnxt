import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLiveCapacityRampEvidence,
  buildOneWorkerLiveCanaryEvidence,
  buildOperationalReadinessContract,
  buildRuntimeReadinessPlan,
  buildResilienceRecoveryEvidence,
  operationalReadinessPredecessorGate,
  validateLiveCapacityRampEvidence,
  validateOneWorkerLiveCanaryEvidence,
  validateOperationalReadinessContract,
  validateResilienceRecoveryEvidence,
} from "../scripts/lib/manager-control-plane/core.mjs";

const target = {
  workerId: "codex-1",
  assignmentId: "bmad-25-2-one-worker-live-canary",
  owner: "manager-20260710/codex-1",
  runId: "manager-20260710",
  sourceRefs: ["prd:epic-25-production-hardening"],
  evidenceRefs: ["evidence:25-1-readiness-fixture"],
};

const thresholds = Object.fromEntries([
  ["lease_checkpoint_receipt_proof", "seconds"],
  ["preflight", "seconds"],
  ["usage", "percent"],
  ["resources", "percent"],
  ["telemetry", "seconds"],
  ["errors", "count"],
  ["latency", "milliseconds"],
  ["cost", "cents"],
].map(([name, unit]) => [name, { name, operator: "lte", value: 1, unit }]));

function passingContext(overrides = {}) {
  return {
    target,
    backendTruth: "live",
    backendTruthProven: true,
    authorityState: "allowed",
    authorityProven: true,
    freshnessState: "live",
    readinessProfile: { thresholds },
    telemetry: {
      source: "local-proof-telemetry",
      coverage: "one-worker-canary",
      observationWindowSeconds: 60,
      alertThresholdIds: ["alert-heartbeat"],
      alertReady: true,
    },
    configuration: { names: ["provider-mode"], validationState: "pass", noValueRetention: true },
    recovery: {
      owner: "manager-20260710",
      rollbackPath: "observe-only",
      remediationAction: "stop-canary-and-recheck",
      recheckAt: "2026-07-10T01:00:00.000Z",
      expiryAt: "2026-07-10T01:05:00.000Z",
    },
    preflight: { status: "ready", blockers: [] },
    usage: { status: "normal" },
    resources: { status: "normal" },
    heartbeat: { fresh: true },
    dispatcherLease: { proven: true },
    receipt: { proven: true },
    gates: Object.fromEntries([
      "exact_ownership", "source_evidence", "backend_truth", "authority_risk", "recovery_rollback",
      "resource_cost", "configuration_secrets", "telemetry_alerts", "preflight", "usage", "resources",
      "heartbeat", "dispatcher_lease", "receipt_evidence",
    ].map((gateId) => [gateId, { state: "pass", evidenceRefs: ["evidence:25-1-readiness-fixture"] }])),
    now: new Date().toISOString(),
    ...overrides,
  };
}

test("readiness contract fails closed when thresholds and live evidence are absent", () => {
  const contract = buildOperationalReadinessContract({ now: new Date().toISOString() }, { target });
  assert.equal(contract.outcome, "no_go");
  assert.ok(contract.typedBlockers.some((blocker) => blocker.reason === "threshold_missing"));
  assert.ok(contract.typedBlockers.some((blocker) => blocker.reason === "telemetry_missing" || blocker.reason === "threshold_missing"));
  assert.equal(contract.rawPayloadRetained, false);
  assert.deepEqual(validateOperationalReadinessContract(contract), []);
});

test("readiness contract produces go only for explicit live one-worker proof", () => {
  const contract = buildOperationalReadinessContract({}, passingContext());
  assert.equal(contract.outcome, "go");
  assert.equal(contract.backendTruth, "live");
  assert.equal(contract.target.workerId, "codex-1");
  assert.deepEqual(contract.typedBlockers, []);
  assert.deepEqual(validateOperationalReadinessContract(contract), []);
});

test("readiness contract rejects secret-like and contradictory telemetry metadata", () => {
  const secret = buildOperationalReadinessContract({}, passingContext({
    configuration: { names: ["api-key=sk-secretvalue"], validationState: "pass", noValueRetention: true },
    telemetry: { source: "telemetry", coverage: "unknown", observationWindowSeconds: 0, alertThresholdIds: [], alertReady: false },
  }));
  assert.equal(secret.outcome, "no_go");
  assert.ok(secret.typedBlockers.some((blocker) => blocker.reason === "configuration_invalid"));
  assert.ok(secret.typedBlockers.some((blocker) => blocker.reason === "telemetry_missing"));
  assert.deepEqual(validateOperationalReadinessContract(secret), []);
  assert.ok(validateOperationalReadinessContract({ ...secret, rawPayloadRetained: true }).length > 0);
});

test("Epic 25 predecessor gate blocks later stories until 25-1 readiness passes", () => {
  const legacyTemplate = operationalReadinessPredecessorGate(
    { "25-1-operational-readiness-contract": "backlog" },
    { requestedStoryCount: 6, storyKey: "25-1-planning-only-bmad-refill-continuation" },
  );
  assert.equal(legacyTemplate.state, "not_applicable");

  const blocked = operationalReadinessPredecessorGate(
    { "25-1-operational-readiness-contract": "review" },
    { requestedStoryCount: 6, storyKey: "25-2-one-worker-live-canary" },
  );
  assert.equal(blocked.state, "blocked");
  assert.equal(blocked.blocker.code, "predecessor_gate_not_passed");

  const firstOnly = operationalReadinessPredecessorGate(
    { "25-1-operational-readiness-contract": "backlog" },
    { requestedStoryCount: 6, storyKey: "25-1-operational-readiness-contract" },
  );
  assert.equal(firstOnly.state, "awaiting_predecessor");

  const passed = operationalReadinessPredecessorGate(
    { "25-1-operational-readiness-contract": "done" },
    { requestedStoryCount: 6, storyKey: "25-2-one-worker-live-canary", readinessEvidenceRefs: ["readiness:25-1-pass:fixture"] },
  );
  assert.equal(passed.state, "pass");
});

test("one-worker canary evidence passes only with live proof and bounded measurements", () => {
  const readinessContract = buildOperationalReadinessContract({}, passingContext());
  const evidence = buildOneWorkerLiveCanaryEvidence({}, {
    now: "2026-07-10T01:00:00.000Z",
    target,
    readinessContract,
    backendTruth: "live",
    backendTruthProven: true,
    canaryAuthority: { state: "allowed", proven: true, evidenceRefs: ["evidence:canary-authority"] },
    telemetry: passingContext().telemetry,
    lease: { state: "pass", proofRef: "evidence:lease-proof" },
    checkpoint: { state: "pass", proofRef: "evidence:checkpoint-proof" },
    measurements: {
      observedAt: "2026-07-10T01:00:00.000Z",
      latencyMs: 1,
      errorCount: 0,
      cpuPercent: 1,
      memoryPercent: 1,
      diskPercent: 1,
      costCents: 1,
      timedOut: false,
    },
    recovery: passingContext().recovery,
    evidenceRefs: ["evidence:canary-observation"],
  });
  assert.equal(evidence.outcome, "pass");
  assert.equal(evidence.truthLabel, "live");
  assert.equal(evidence.rampAllowed, true);
  assert.deepEqual(evidence.typedBlockers, []);
  assert.deepEqual(validateOneWorkerLiveCanaryEvidence(evidence), []);
  assert.equal(evidence.metadataOnly, true);
  assert.equal(evidence.rawPayloadRetained, false);
});

test("one-worker canary stops and requires rollback on timeout", () => {
  const readinessContract = buildOperationalReadinessContract({}, passingContext());
  const evidence = buildOneWorkerLiveCanaryEvidence({}, {
    now: "2026-07-10T01:00:00.000Z",
    target,
    readinessContract,
    backendTruth: "live",
    backendTruthProven: true,
    canaryAuthority: { state: "allowed", proven: true },
    telemetry: passingContext().telemetry,
    lease: { state: "pass", proofRef: "evidence:lease-proof" },
    checkpoint: { state: "pass", proofRef: "evidence:checkpoint-proof" },
    measurements: { latencyMs: 1, errorCount: 0, cpuPercent: 1, memoryPercent: 1, diskPercent: 1, costCents: 1, timedOut: true },
    recovery: passingContext().recovery,
    evidenceRefs: ["evidence:canary-timeout"],
  });
  assert.equal(evidence.outcome, "stop");
  assert.equal(evidence.rampAllowed, false);
  assert.equal(evidence.recovery.required, true);
  assert.ok(evidence.typedBlockers.some((blocker) => blocker.reason === "timeout"));
  assert.deepEqual(validateOneWorkerLiveCanaryEvidence(evidence), []);
});

test("continuous runtime readiness projects canary evidence without enabling live mutation", () => {
  const runtime = buildRuntimeReadinessPlan(
    { runtimeMode: "continuous_dry_run" },
    {
      cycleStatus: "ready",
      cycleOk: true,
      usage: { status: "normal" },
      resources: { status: "normal" },
      preflight: { status: "ready", blockerCount: 0 },
    },
  );
  assert.equal(runtime.summary.oneWorkerLiveCanary.outcome, "hold");
  assert.equal(runtime.summary.oneWorkerLiveCanary.rampAllowed, false);
  assert.equal(runtime.summary.oneWorkerLiveCanary.rawPayloadRetained, false);
  assert.equal(runtime.summary.gates.externalServiceCalls, "blocked");
});

function passingCanaryEvidence() {
  const context = passingContext();
  const readinessContract = buildOperationalReadinessContract({}, context);
  return buildOneWorkerLiveCanaryEvidence({}, {
    now: "2026-07-10T01:00:00.000Z",
    target,
    readinessContract,
    backendTruth: "live",
    backendTruthProven: true,
    canaryAuthority: { state: "allowed", proven: true, evidenceRefs: ["evidence:canary-authority"] },
    telemetry: context.telemetry,
    lease: { state: "pass", proofRef: "evidence:lease-proof" },
    checkpoint: { state: "pass", proofRef: "evidence:checkpoint-proof" },
    measurements: { latencyMs: 1, errorCount: 0, cpuPercent: 1, memoryPercent: 1, diskPercent: 1, costCents: 1, timedOut: false },
    recovery: context.recovery,
    evidenceRefs: ["evidence:canary-observation"],
  });
}

function passingRampStage(workerCount, index) {
  return {
    stageId: `stage-${index + 1}`,
    workerCount,
    capacityReady: true,
    durationSeconds: 60,
    owner: "manager-20260710",
    budgetCents: 100,
    rollbackThresholds: {
      latency: { name: "latency", operator: "lte", value: 100, unit: "milliseconds" },
      errors: { name: "errors", operator: "lte", value: 0, unit: "count" },
      resources: { name: "resources", operator: "lte", value: 80, unit: "percent" },
      cost: { name: "cost", operator: "lte", value: 100, unit: "cents" },
    },
    authority: { state: "allowed", proven: true, evidenceRefs: [`evidence:stage-${index + 1}-authority`] },
    observed: {
      queueDepth: 0,
      leaseHealthy: true,
      latencyMs: 20,
      errorCount: 0,
      cpuPercent: 20,
      memoryPercent: 30,
      diskPercent: 40,
      processCount: workerCount,
      usageState: "normal",
      costCents: 10,
    },
    evidenceRefs: [`evidence:stage-${index + 1}-observation`],
  };
}

test("capacity ramp records ordered per-stage evidence and never enables rollout", () => {
  const ramp = buildLiveCapacityRampEvidence({}, {
    now: "2026-07-10T01:00:00.000Z",
    canaryEvidence: passingCanaryEvidence(),
    stages: [1, 2, 4, 6].map(passingRampStage),
    sourceRefs: ["prd:epic-25-production-hardening"],
    evidenceRefs: ["evidence:ramp-observation"],
    recovery: passingContext().recovery,
  });
  assert.equal(ramp.outcome, "pass");
  assert.deepEqual(ramp.stageWorkerCounts, [1, 2, 4, 6]);
  assert.equal(ramp.scaleEvidenceReady, true);
  assert.equal(ramp.rolloutAllowed, false);
  assert.deepEqual(ramp.stages.map((stage) => stage.outcome), ["pass", "pass", "pass", "pass"]);
  assert.deepEqual(validateLiveCapacityRampEvidence(ramp), []);
});

test("capacity ramp stops on a stage threshold breach and blocks later stages", () => {
  const stages = [1, 2, 4, 6].map(passingRampStage);
  stages[1] = { ...stages[1], observed: { ...stages[1].observed, cpuPercent: 99 } };
  const ramp = buildLiveCapacityRampEvidence({}, {
    now: "2026-07-10T01:00:00.000Z",
    canaryEvidence: passingCanaryEvidence(),
    stages,
    sourceRefs: ["prd:epic-25-production-hardening"],
    evidenceRefs: ["evidence:ramp-breach"],
    recovery: passingContext().recovery,
  });
  assert.equal(ramp.outcome, "stop");
  assert.equal(ramp.scaleEvidenceReady, false);
  assert.equal(ramp.recovery.required, true);
  assert.deepEqual(ramp.stages.map((stage) => stage.outcome), ["pass", "stop", "hold", "hold"]);
  assert.ok(ramp.typedBlockers.some((blocker) => blocker.reason === "stage_threshold_exceeded"));
  assert.deepEqual(validateLiveCapacityRampEvidence(ramp), []);
});

test("continuous runtime readiness projects ramp evidence with rollout blocked", () => {
  const runtime = buildRuntimeReadinessPlan(
    { runtimeMode: "continuous_dry_run" },
    { cycleStatus: "ready", cycleOk: true, usage: { status: "normal" }, resources: { status: "normal" }, preflight: { status: "ready", blockerCount: 0 } },
  );
  assert.equal(runtime.summary.liveCapacityRamp.outcome, "hold");
  assert.equal(runtime.summary.liveCapacityRamp.rolloutAllowed, false);
  assert.equal(runtime.summary.liveCapacityRamp.rawPayloadRetained, false);
});

function passingRampEvidence() {
  return buildLiveCapacityRampEvidence({}, {
    now: "2026-07-10T01:00:00.000Z",
    canaryEvidence: passingCanaryEvidence(),
    stages: [1, 2, 4, 6].map(passingRampStage),
    sourceRefs: ["prd:epic-25-production-hardening"],
    evidenceRefs: ["evidence:ramp-observation"],
    recovery: passingContext().recovery,
  });
}

function passingRecoveryDrill(kind, index) {
  return {
    drillId: `drill-${index + 1}`,
    kind,
    owner: "manager-20260710",
    authority: { state: "allowed", proven: true, evidenceRefs: [`evidence:drill-${index + 1}-authority`] },
    expectedRecoveryAction: "inspect-reconcile-and-resume",
    observed: {
      stateBefore: "active",
      stateAfter: "recovered",
      ownershipBefore: "manager",
      ownershipAfter: "manager",
      leaseState: "renewed",
      idempotencyState: "proven",
      rollbackState: "available",
      evidenceRetained: true,
      ambiguous: false,
      silentRetry: false,
      retryCount: 1,
    },
    evidenceRefs: [`evidence:drill-${index + 1}-observation`],
    nextAction: "preserve-evidence-and-monitor",
  };
}

test("resilience validation records ordered recovery drills without enabling rollout", () => {
  const recovery = buildResilienceRecoveryEvidence({}, {
    now: "2026-07-10T01:00:00.000Z",
    rampEvidence: passingRampEvidence(),
    drills: ["restart", "worker_death", "stale_lease", "timeout", "verification_failure", "pause_drain", "handoff", "recovery"].map(passingRecoveryDrill),
    sourceRefs: ["prd:epic-25-production-hardening"],
    evidenceRefs: ["evidence:recovery-validation"],
    recovery: passingContext().recovery,
  });
  assert.equal(recovery.outcome, "pass");
  assert.equal(recovery.reliabilityEvidenceReady, true);
  assert.equal(recovery.rolloutAllowed, false);
  assert.equal(recovery.drills.length, 8);
  assert.deepEqual(validateResilienceRecoveryEvidence(recovery), []);
});

test("resilience validation stops on ambiguous ownership and blocks later drills", () => {
  const drills = ["restart", "worker_death", "stale_lease", "timeout"].map(passingRecoveryDrill);
  drills[1] = { ...drills[1], observed: { ...drills[1].observed, ambiguous: true, ownershipAfter: "unknown" } };
  const recovery = buildResilienceRecoveryEvidence({}, {
    now: "2026-07-10T01:00:00.000Z",
    rampEvidence: passingRampEvidence(),
    drills,
    sourceRefs: ["prd:epic-25-production-hardening"],
    evidenceRefs: ["evidence:recovery-ambiguity"],
    recovery: passingContext().recovery,
  });
  assert.equal(recovery.outcome, "stop");
  assert.equal(recovery.recovery.required, true);
  assert.deepEqual(recovery.drills.map((drill) => drill.outcome), ["pass", "stop", "hold", "hold"]);
  assert.ok(recovery.typedBlockers.some((blocker) => blocker.reason === "recovery_ambiguity"));
  assert.deepEqual(validateResilienceRecoveryEvidence(recovery), []);
});

test("continuous runtime readiness projects recovery evidence with rollout blocked", () => {
  const runtime = buildRuntimeReadinessPlan(
    { runtimeMode: "continuous_dry_run" },
    { cycleStatus: "ready", cycleOk: true, usage: { status: "normal" }, resources: { status: "normal" }, preflight: { status: "ready", blockerCount: 0 } },
  );
  assert.equal(runtime.summary.resilienceRecovery.outcome, "hold");
  assert.equal(runtime.summary.resilienceRecovery.rolloutAllowed, false);
  assert.equal(runtime.summary.resilienceRecovery.rawPayloadRetained, false);
});
