import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildLiveCapacityRampEvidence,
  buildOneWorkerLiveCanaryEvidence,
  buildOperationalReadinessContract,
  buildOperationalHardeningRunbookEvidence,
  buildProductionReadinessDecisionEvidence,
  buildRuntimeReadinessPlan,
  buildResilienceRecoveryEvidence,
  operationalReadinessPredecessorGate,
  validateLiveCapacityRampEvidence,
  validateOneWorkerLiveCanaryEvidence,
  validateOperationalReadinessContract,
  validateOperationalHardeningRunbookEvidence,
  validateProductionReadinessDecisionEvidence,
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

const packetSchemas = {
  canary: "pipeline-one-worker-live-canary/v0",
  ramp: "pipeline-live-capacity-ramp/v0",
  recovery: "pipeline-resilience-recovery-validation/v0",
  hardening: "pipeline-operational-hardening-runbooks/v0",
  decision: "pipeline-production-readiness-decision/v0",
};

function observedAttestation(packetSchemaVersion, overrides = {}) {
  const { receipt: receiptOverrides = {}, ...attestationOverrides } = overrides;
  return {
    schemaVersion: "pipeline-observed-evidence-attestation/v0",
    attestationId: `attestation-${packetSchemaVersion.split("/")[0]}`,
    evidenceClass: "live_observed",
    observer: { observerType: "independent_runtime", observerId: "independent-observer-1" },
    subject: { packetSchemaVersion, targetRef: "manager-20260710/codex-1" },
    receipt: {
      receiptId: `receipt-${packetSchemaVersion.split("/")[0]}`,
      observedAt: "2026-07-10T01:00:00.000Z",
      issuedAt: "2026-07-10T01:00:00.000Z",
      expiresAt: "2026-07-10T01:05:00.000Z",
      evidenceDigestSha256: `sha256:${"a".repeat(64)}`,
      sourceRefs: ["prd:epic-25-production-hardening"],
      evidenceRefs: ["evidence:canary-observation"],
      ...receiptOverrides,
    },
    metadataOnly: true,
    rawPayloadRetained: false,
    ...attestationOverrides,
  };
}

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
    observedEvidenceAttestation: observedAttestation(packetSchemas.canary),
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

test("caller live booleans alone remain integrated-local and cannot promote", () => {
  const evidence = buildOneWorkerLiveCanaryEvidence({}, {
    now: "2026-07-10T01:00:00.000Z",
    target,
    readinessContract: buildOperationalReadinessContract({}, passingContext()),
    backendTruth: "live",
    backendTruthProven: true,
    canaryAuthority: { state: "allowed", proven: true, evidenceRefs: ["evidence:canary-authority"] },
    telemetry: passingContext().telemetry,
    lease: { state: "pass", proofRef: "evidence:lease-proof" },
    checkpoint: { state: "pass", proofRef: "evidence:checkpoint-proof" },
    measurements: { latencyMs: 1, errorCount: 0, cpuPercent: 1, memoryPercent: 1, diskPercent: 1, costCents: 1, timedOut: false },
    recovery: passingContext().recovery,
    evidenceRefs: ["evidence:caller-asserted-live"],
  });
  assert.equal(evidence.evidenceClass, "integrated_local");
  assert.equal(evidence.outcome, "hold");
  assert.equal(evidence.rampAllowed, false);
  assert.ok(evidence.typedBlockers.some((blocker) => blocker.reason === "evidence_attestation_invalid"));
  assert.deepEqual(validateOneWorkerLiveCanaryEvidence(evidence), []);
});

test("forged live provenance and missing or invalid attestations fail closed", () => {
  const local = buildOneWorkerLiveCanaryEvidence({}, {
    now: "2026-07-10T01:00:00.000Z",
    target,
    backendTruth: "live",
    backendTruthProven: true,
    observedEvidenceAttestation: { evidenceClass: "live_observed", observer: { observerType: "independent_runtime" } },
    evidenceRefs: ["evidence:forged-live"],
  });
  assert.equal(local.evidenceClass, "integrated_local");
  assert.equal(local.observedEvidenceAttestation, null);

  const forged = {
    ...passingCanaryEvidence(),
    evidenceClass: "live_observed",
    observedEvidenceAttestation: null,
  };
  assert.ok(validateOneWorkerLiveCanaryEvidence(forged).some((blocker) => blocker.code === "evidence_attestation_invalid"));

  const unrelatedReceipt = buildOneWorkerLiveCanaryEvidence({}, {
    ...passingContext(),
    observedEvidenceAttestation: observedAttestation(packetSchemas.canary, {
      receipt: { sourceRefs: ["source:unrelated"], evidenceRefs: ["evidence:unrelated"] },
    }),
  });
  assert.equal(unrelatedReceipt.evidenceClass, "integrated_local");
  assert.equal(unrelatedReceipt.outcome, "hold");

  const fixture = buildOneWorkerLiveCanaryEvidence({}, {
    ...passingContext(),
    fixtureEvidence: true,
    observedEvidenceAttestation: observedAttestation(packetSchemas.canary),
  });
  assert.equal(fixture.evidenceClass, "fixture");
  assert.equal(fixture.observedEvidenceAttestation, null);
  assert.deepEqual(validateOneWorkerLiveCanaryEvidence(fixture), []);
});

test("stale independent observation receipts cannot produce promotion-grade evidence", () => {
  const stale = buildOneWorkerLiveCanaryEvidence({}, {
    now: "2026-07-10T01:10:00.000Z",
    target,
    backendTruth: "live",
    backendTruthProven: true,
    observedEvidenceAttestation: observedAttestation(packetSchemas.canary),
    evidenceRefs: ["evidence:stale-receipt"],
  });
  assert.equal(stale.evidenceClass, "integrated_local");
  assert.equal(stale.outcome, "hold");
  assert.equal(stale.observedEvidenceAttestation, null);
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
    observedEvidenceAttestation: observedAttestation(packetSchemas.canary),
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
    observedEvidenceAttestation: observedAttestation(packetSchemas.ramp),
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
    observedEvidenceAttestation: observedAttestation(packetSchemas.ramp),
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
    observedEvidenceAttestation: observedAttestation(packetSchemas.ramp),
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
    observedEvidenceAttestation: observedAttestation(packetSchemas.recovery),
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
    observedEvidenceAttestation: observedAttestation(packetSchemas.recovery),
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

function passingRecoveryEvidence() {
  return buildResilienceRecoveryEvidence({}, {
    now: "2026-07-10T01:00:00.000Z",
    rampEvidence: passingRampEvidence(),
    observedEvidenceAttestation: observedAttestation(packetSchemas.recovery),
    drills: ["restart", "worker_death", "stale_lease", "timeout", "verification_failure", "pause_drain", "handoff", "recovery"].map(passingRecoveryDrill),
    sourceRefs: ["prd:epic-25-production-hardening"],
    evidenceRefs: ["evidence:recovery-validation"],
    recovery: passingContext().recovery,
  });
}

function passingHardeningDomain(domain, index) {
  return {
    domain,
    owner: "manager-20260710",
    trigger: `trigger-${index + 1}`,
    evidenceGate: `gate-${index + 1}`,
    recoveryAction: "hold-inspect-and-remediate",
    riskTier: "low",
    status: "pass",
    evidenceRefs: [`evidence:runbook-${index + 1}`],
  };
}

test("operational hardening records all runbook domains and hands off without rollout", () => {
  const domains = ["alerts", "readiness", "authority", "secrets", "resources", "cost", "rollback", "incident_support", "retention", "cleanup"]
    .map(passingHardeningDomain);
  const hardening = buildOperationalHardeningRunbookEvidence({}, {
    now: "2026-07-10T01:00:00.000Z",
    recoveryEvidence: passingRecoveryEvidence(),
    observedEvidenceAttestation: observedAttestation(packetSchemas.hardening),
    domains,
    sourceRefs: ["prd:epic-25-production-hardening"],
    evidenceRefs: ["evidence:hardening-handoff"],
    recovery: passingContext().recovery,
  });
  assert.equal(hardening.outcome, "pass");
  assert.equal(hardening.readinessHandoffReady, true);
  assert.equal(hardening.rolloutAllowed, false);
  assert.equal(hardening.domains.length, 10);
  assert.deepEqual(validateOperationalHardeningRunbookEvidence(hardening), []);
});

test("operational hardening stops on an unresolved high-risk gap", () => {
  const domains = ["alerts", "readiness", "authority", "secrets", "resources", "cost", "rollback", "incident_support", "retention", "cleanup"]
    .map(passingHardeningDomain);
  domains[3] = { ...domains[3], riskTier: "high", status: "hold", unresolvedHighRiskGap: true };
  const hardening = buildOperationalHardeningRunbookEvidence({}, {
    now: "2026-07-10T01:00:00.000Z",
    recoveryEvidence: passingRecoveryEvidence(),
    domains,
    sourceRefs: ["prd:epic-25-production-hardening"],
    evidenceRefs: ["evidence:hardening-gap"],
    recovery: passingContext().recovery,
  });
  assert.equal(hardening.outcome, "stop");
  assert.equal(hardening.readinessHandoffReady, false);
  assert.equal(hardening.recovery.required, true);
  assert.ok(hardening.typedBlockers.some((blocker) => blocker.reason === "high_risk_gap"));
  assert.deepEqual(validateOperationalHardeningRunbookEvidence(hardening), []);
});

test("continuous runtime readiness projects hardening evidence with rollout blocked", () => {
  const runtime = buildRuntimeReadinessPlan(
    { runtimeMode: "continuous_dry_run" },
    { cycleStatus: "ready", cycleOk: true, usage: { status: "normal" }, resources: { status: "normal" }, preflight: { status: "ready", blockerCount: 0 } },
  );
  assert.equal(runtime.summary.operationalHardening.outcome, "stop");
  assert.equal(runtime.summary.operationalHardening.rolloutAllowed, false);
  assert.equal(runtime.summary.operationalHardening.recovery.required, true);
  assert.equal(runtime.summary.operationalHardening.rawPayloadRetained, false);
});

test("continuous runtime readiness defaults the final production decision to a held metadata-only packet", () => {
  const runtime = buildRuntimeReadinessPlan(
    { runtimeMode: "continuous_dry_run" },
    { cycleStatus: "ready", cycleOk: true, usage: { status: "normal" }, resources: { status: "normal" }, preflight: { status: "ready", blockerCount: 0 } },
  );
  const decision = runtime.summary.productionReadinessDecision;
  assert.equal(decision.decision, "hold");
  assert.equal(decision.automaticDeploymentAllowed, false);
  assert.equal(decision.providerCallsAllowed, false);
  assert.equal(decision.secretAccessAllowed, false);
  assert.equal(decision.mergeAllowed, false);
  assert.equal(decision.cleanupAllowed, false);
  assert.equal(decision.metadataOnly, true);
  assert.equal(decision.rawPayloadRetained, false);
  assert.deepEqual(validateProductionReadinessDecisionEvidence(decision), []);
});

function passingHardeningEvidence() {
  return buildOperationalHardeningRunbookEvidence({}, {
    now: "2026-07-10T01:00:00.000Z",
    recoveryEvidence: passingRecoveryEvidence(),
    observedEvidenceAttestation: observedAttestation(packetSchemas.hardening),
    domains: ["alerts", "readiness", "authority", "secrets", "resources", "cost", "rollback", "incident_support", "retention", "cleanup"]
      .map(passingHardeningDomain),
    sourceRefs: ["prd:epic-25-production-hardening"],
    evidenceRefs: ["evidence:hardening-handoff"],
    recovery: passingContext().recovery,
  });
}

function passingDecisionPackets() {
  return {
    canaryEvidence: passingCanaryEvidence(),
    rampEvidence: passingRampEvidence(),
    recoveryEvidence: passingRecoveryEvidence(),
    hardeningEvidence: passingHardeningEvidence(),
  };
}

test("production readiness decision produces go only from fresh passing predecessors and explicit final authority", () => {
  const decision = buildProductionReadinessDecisionEvidence({}, {
    now: "2026-07-10T01:00:00.000Z",
    ...passingDecisionPackets(),
    observedEvidenceAttestation: observedAttestation(packetSchemas.decision),
    finalAuthority: { state: "allowed", proven: true, evidenceRefs: ["evidence:final-readiness-authority"] },
    owner: "manager-20260710",
    scope: { name: "bounded-production-readiness", boundaries: ["metadata-only-manager-scope"] },
  });
  assert.equal(decision.decision, "go");
  assert.equal(decision.evidenceClass, "live_observed");
  assert.deepEqual(decision.typedBlockers, []);
  assert.equal(decision.rolloutAllowed, false);
  assert.equal(decision.automaticDeploymentAllowed, false);
  assert.deepEqual(validateProductionReadinessDecisionEvidence(decision), []);
});

test("production readiness decision holds when fixture evidence is presented as live", () => {
  const decision = buildProductionReadinessDecisionEvidence({}, {
    now: "2026-07-10T01:00:00.000Z",
    ...passingDecisionPackets(),
    finalAuthority: { state: "allowed", proven: true, evidenceRefs: ["evidence:fixture-authority"] },
    fixtureEvidence: true,
  });
  assert.equal(decision.decision, "hold");
  assert.equal(decision.evidenceClass, "fixture");
  assert.ok(decision.typedBlockers.some((blocker) => blocker.code === "decision_fixture_evidence"));
  assert.deepEqual(validateProductionReadinessDecisionEvidence(decision), []);
});

test("production readiness decision holds on missing or simulated predecessor proof", () => {
  const packets = passingDecisionPackets();
  const missing = buildProductionReadinessDecisionEvidence({}, {
    now: "2026-07-10T01:00:00.000Z",
    canaryEvidence: packets.canaryEvidence,
    rampEvidence: packets.rampEvidence,
    recoveryEvidence: packets.recoveryEvidence,
    finalAuthority: { state: "allowed", proven: true, evidenceRefs: ["evidence:final-readiness-authority"] },
  });
  assert.equal(missing.decision, "hold");
  assert.ok(missing.typedBlockers.some((blocker) => blocker.code === "decision_predecessor_missing"));

  const simulated = buildProductionReadinessDecisionEvidence({}, {
    now: "2026-07-10T01:00:00.000Z",
    ...packets,
    canaryEvidence: { ...packets.canaryEvidence, backendTruth: "simulated", truthLabel: "simulated" },
    finalAuthority: { state: "allowed", proven: true, evidenceRefs: ["evidence:final-readiness-authority"] },
  });
  assert.equal(simulated.decision, "hold");
  assert.ok(simulated.typedBlockers.some((blocker) => blocker.code === "decision_simulated_evidence"));
  assert.deepEqual(validateProductionReadinessDecisionEvidence(simulated), []);
});

test("production readiness decision can record an explicitly bounded limited rollout without enabling mutation", () => {
  const packets = passingDecisionPackets();
  const limited = buildProductionReadinessDecisionEvidence({}, {
    now: "2026-07-10T01:00:00.000Z",
    ...packets,
    observedEvidenceAttestation: observedAttestation(packetSchemas.decision),
    finalAuthority: { state: "allowed", proven: true, evidenceRefs: ["evidence:limited-readiness-authority"] },
    limitedRollout: { requested: true, boundaries: ["one-worker-only", "metadata-only-monitoring"] },
  });
  assert.equal(limited.decision, "limited_rollout");
  assert.equal(limited.scope.limited, true);
  assert.equal(limited.rolloutAllowed, false);
  assert.deepEqual(validateProductionReadinessDecisionEvidence(limited), []);
});

test("production readiness decision refuses limited rollout when a predecessor is not passing", () => {
  const packets = passingDecisionPackets();
  const limited = buildProductionReadinessDecisionEvidence({}, {
    now: "2026-07-10T01:00:00.000Z",
    ...packets,
    hardeningEvidence: { ...packets.hardeningEvidence, outcome: "hold", readinessHandoffReady: false },
    finalAuthority: { state: "allowed", proven: true, evidenceRefs: ["evidence:limited-readiness-authority"] },
    limitedRollout: { requested: true, boundaries: ["one-worker-only", "metadata-only-monitoring"] },
  });
  assert.equal(limited.decision, "hold");
  assert.deepEqual(validateProductionReadinessDecisionEvidence(limited), []);
});

test("production readiness decision refuses missing provenance even when predecessor packets say pass", () => {
  const packets = passingDecisionPackets();
  const decision = buildProductionReadinessDecisionEvidence({}, {
    now: "2026-07-10T01:00:00.000Z",
    ...packets,
    rampEvidence: { ...packets.rampEvidence, evidenceClass: undefined },
    observedEvidenceAttestation: observedAttestation(packetSchemas.decision),
    finalAuthority: { state: "allowed", proven: true, evidenceRefs: ["evidence:provenance-authority"] },
  });
  assert.equal(decision.decision, "hold");
  assert.equal(decision.evidenceClass, "integrated_local");
  assert.equal(decision.observedEvidenceAttestation, null);
  assert.ok(decision.typedBlockers.some((blocker) => blocker.code === "decision_evidence_provenance_missing"));
  assert.deepEqual(validateProductionReadinessDecisionEvidence(decision), []);
});

test("Epic 25 TypeScript and runtime provenance schemas stay aligned", async () => {
  const [types, runtime] = await Promise.all([
    readFile(new URL("../packages/contracts/src/pipeline-control-plane/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/lib/manager-control-plane/operational-readiness.mjs", import.meta.url), "utf8"),
  ]);
  for (const packetType of [
    "PipelineOneWorkerLiveCanaryEvidenceV0",
    "PipelineLiveCapacityRampEvidenceV0",
    "PipelineResilienceRecoveryEvidenceV0",
    "PipelineOperationalHardeningEvidenceV0",
    "PipelineProductionReadinessDecisionEvidenceV0",
  ]) {
    const body = types.match(new RegExp(`export interface ${packetType} \\{([\\s\\S]*?)\\n\\}`))?.[1] || "";
    assert.match(body, /evidenceClass: PipelineOperationalEvidenceClassV0;/);
    assert.match(body, /observedEvidenceAttestation: PipelineObservedEvidenceAttestationV0 \| null;/);
  }
  for (const token of ["fixture", "integrated_local", "live_observed", "pipeline-observed-evidence-attestation/v0"]) {
    assert.ok(types.includes(token), `TypeScript contract must include ${token}`);
    assert.ok(runtime.includes(token), `runtime contract must include ${token}`);
  }
  for (const token of [
    "PipelineEpic25EvidenceChainV0",
    "pipeline-epic-25-evidence-chain/v0",
    "PipelineEpic25EvidenceChainV1",
    "pipeline-epic-25-evidence-chain/v1",
    "validatePipelineEpic25EvidenceChainV0",
    "validatePipelineEpic25EvidenceChainV1",
    "Final decision must hold whenever complete passing live predecessors are absent.",
    "PipelineEpic25PolicyProfileV0",
    "pipeline-epic-25-policy-profile/v0",
    "security", "retention", "rollback", "runbook", "telemetry", "recovery",
    "rawPayloadRetained: false",
  ]) {
    assert.ok(types.includes(token), `TypeScript evidence-chain contract must include ${token}`);
  }
});
