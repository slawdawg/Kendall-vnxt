#!/usr/bin/env node
import { pathToFileURL } from "node:url";

import {
  buildLiveCapacityRampEvidence,
  buildOneWorkerLiveCanaryEvidence,
  buildOperationalHardeningRunbookEvidence,
  buildOperationalReadinessContract,
  buildProductionReadinessDecisionEvidence,
  buildResilienceRecoveryEvidence,
  validateLiveCapacityRampEvidence,
  validateOneWorkerLiveCanaryEvidence,
  validateOperationalHardeningRunbookEvidence,
  validateOperationalReadinessContract,
  validateProductionReadinessDecisionEvidence,
  validateResilienceRecoveryEvidence,
} from "./lib/manager-control-plane/operational-readiness.mjs";

export const EPIC_25_PRELIVE_NOW = "2026-07-12T12:00:00.000Z";
export const EPIC_25_PRELIVE_STOP_LINES = Object.freeze([
  "fixture_metadata_only",
  "no_provider_calls",
  "no_production_or_worker_mutation",
  "no_dispatch_or_schema_migration",
  "no_secret_value_retention",
  "no_live_or_rollout_claim",
]);

const SECRET_FIXTURES = Object.freeze([
  "sk-prelivefixture123456789",
  "ghp_prelivefixture123456789",
  "Bearer prelivefixture123456789",
]);

const target = Object.freeze({
  workerId: "fixture-worker-1",
  assignmentId: "epic-25-prelive-fixture",
  owner: "fixture-manager/worker-1",
  runId: "epic-25-prelive-20260712",
  sourceRefs: ["source:epic-25-prelive-fixture"],
  evidenceRefs: ["evidence:epic-25-prelive-fixture", ...SECRET_FIXTURES],
});

const thresholds = Object.fromEntries([
  ["lease_checkpoint_receipt_proof", "seconds", 60],
  ["preflight", "seconds", 60],
  ["usage", "percent", 80],
  ["resources", "percent", 80],
  ["telemetry", "seconds", 60],
  ["errors", "count", 0],
  ["latency", "milliseconds", 100],
  ["cost", "cents", 100],
].map(([name, unit, value]) => [name, { name, operator: "lte", value, unit }]));

const recoveryPlan = Object.freeze({
  owner: "fixture-manager",
  rollbackPath: "hold-and-restore-fixture-baseline",
  remediationAction: "inspect-metadata-and-rebuild-fixture",
  recheckAt: "2026-07-12T12:05:00.000Z",
  expiryAt: "2026-07-12T12:10:00.000Z",
  evidenceRefs: ["evidence:fixture-rollback"],
});

function rampStage(workerCount, index) {
  return {
    stageId: `fixture-stage-${index + 1}`,
    workerCount,
    capacityReady: true,
    durationSeconds: 60,
    owner: "fixture-manager",
    budgetCents: 100,
    rollbackThresholds: {
      latency: { name: "latency", operator: "lte", value: 100, unit: "milliseconds" },
      errors: { name: "errors", operator: "lte", value: 0, unit: "count" },
      resources: { name: "resources", operator: "lte", value: 80, unit: "percent" },
      cost: { name: "cost", operator: "lte", value: 100, unit: "cents" },
    },
    authority: { state: "allowed", proven: true, evidenceRefs: [`evidence:fixture-stage-${index + 1}-authority`] },
    observed: {
      queueDepth: 0,
      leaseHealthy: true,
      latencyMs: 20,
      errorCount: 0,
      cpuPercent: index === 1 ? 95 : 20,
      memoryPercent: 30,
      diskPercent: 40,
      processCount: workerCount,
      usageState: "normal",
      costCents: 10,
    },
    evidenceRefs: [`evidence:fixture-stage-${index + 1}`, SECRET_FIXTURES[index % SECRET_FIXTURES.length]],
  };
}

function recoveryDrill(kind, index) {
  const ambiguous = index === 1;
  return {
    drillId: `fixture-drill-${index + 1}`,
    kind,
    owner: "fixture-manager",
    authority: { state: "allowed", proven: true, evidenceRefs: [`evidence:fixture-drill-${index + 1}-authority`] },
    expectedRecoveryAction: "inspect-reconcile-and-hold",
    observed: {
      stateBefore: "active",
      stateAfter: ambiguous ? "unknown" : "recovered",
      ownershipBefore: "fixture-manager",
      ownershipAfter: ambiguous ? "unknown" : "fixture-manager",
      leaseState: ambiguous ? "ambiguous" : "renewed",
      idempotencyState: ambiguous ? "ambiguous" : "proven",
      rollbackState: "available",
      evidenceRetained: true,
      ambiguous,
      silentRetry: false,
      retryCount: 1,
    },
    evidenceRefs: [`evidence:fixture-drill-${index + 1}`],
    nextAction: ambiguous ? "hold-and-restore-unambiguous-ownership" : "preserve-fixture-evidence",
  };
}

function hardeningDomain(domain, index) {
  const secretDomainGap = domain === "secrets";
  return {
    domain,
    owner: "fixture-manager",
    trigger: `fixture-trigger-${index + 1}`,
    evidenceGate: `fixture-gate-${index + 1}`,
    recoveryAction: "hold-inspect-and-remediate",
    riskTier: secretDomainGap ? "high" : "low",
    status: secretDomainGap ? "hold" : "pass",
    unresolvedHighRiskGap: secretDomainGap,
    evidenceRefs: [`evidence:fixture-runbook-${index + 1}`, secretDomainGap ? SECRET_FIXTURES[0] : "evidence:metadata-only"],
  };
}

function scalarValues(value) {
  if (Array.isArray(value)) return value.flatMap(scalarValues);
  if (value && typeof value === "object") return Object.values(value).flatMap(scalarValues);
  return [value];
}

function validationSummary(entries) {
  return Object.fromEntries(entries.map(([name, validate, packet]) => [name, validate(packet)]));
}

export function buildEpic25PreliveEvidenceBundle() {
  const readiness = buildOperationalReadinessContract({}, {
    now: EPIC_25_PRELIVE_NOW,
    target,
    backendTruth: "dry_run",
    backendTruthProven: false,
    authorityState: "blocked",
    authorityProven: false,
    freshnessState: "stale",
    readinessProfile: { thresholds },
    telemetry: {
      source: "fixture-telemetry",
      coverage: "prelive-only",
      observationWindowSeconds: 60,
      alertThresholdIds: ["fixture-alert-threshold"],
      alertReady: true,
    },
    configuration: { names: ["OPENAI_API_KEY"], validationState: "pass", noValueRetention: true },
    recovery: recoveryPlan,
    preflight: { status: "ready", blockers: [] },
    usage: { status: "normal" },
    resources: { status: "normal" },
    heartbeat: { fresh: false },
    dispatcherLease: { proven: false },
    receipt: { proven: false },
  });

  const canary = buildOneWorkerLiveCanaryEvidence({}, {
    now: EPIC_25_PRELIVE_NOW,
    target,
    readinessContract: readiness,
    fixtureEvidence: true,
    backendTruth: "simulated",
    backendTruthProven: false,
    canaryAuthority: { state: "blocked", proven: false, evidenceRefs: [] },
    telemetry: readiness.telemetry,
    lease: { state: "blocked", proofRef: "evidence:fixture-lease-unproven" },
    checkpoint: { state: "blocked", proofRef: "evidence:fixture-checkpoint-unproven" },
    measurements: {
      observedAt: EPIC_25_PRELIVE_NOW,
      latencyMs: 250,
      errorCount: 0,
      cpuPercent: 20,
      memoryPercent: 30,
      diskPercent: 40,
      costCents: 10,
      timedOut: false,
    },
    recovery: recoveryPlan,
    evidenceRefs: ["evidence:fixture-canary-threshold-breach", ...SECRET_FIXTURES],
  });

  const ramp = buildLiveCapacityRampEvidence({}, {
    now: EPIC_25_PRELIVE_NOW,
    fixtureEvidence: true,
    canaryEvidence: canary,
    stages: [1, 2, 4, 6].map(rampStage),
    sourceRefs: ["source:epic-25-prelive-fixture"],
    evidenceRefs: ["evidence:fixture-ramp-threshold-breach", ...SECRET_FIXTURES],
    recovery: recoveryPlan,
  });

  const recovery = buildResilienceRecoveryEvidence({}, {
    now: EPIC_25_PRELIVE_NOW,
    fixtureEvidence: true,
    rampEvidence: ramp,
    drills: ["restart", "worker_death", "stale_lease", "timeout", "verification_failure", "pause_drain", "handoff", "recovery"].map(recoveryDrill),
    sourceRefs: ["source:epic-25-prelive-fixture"],
    evidenceRefs: ["evidence:fixture-recovery-ambiguity"],
    recovery: recoveryPlan,
  });

  const hardening = buildOperationalHardeningRunbookEvidence({}, {
    now: EPIC_25_PRELIVE_NOW,
    fixtureEvidence: true,
    recoveryEvidence: recovery,
    domains: ["alerts", "readiness", "authority", "secrets", "resources", "cost", "rollback", "incident_support", "retention", "cleanup"].map(hardeningDomain),
    sourceRefs: ["source:epic-25-prelive-fixture"],
    evidenceRefs: ["evidence:fixture-hardening-gap", ...SECRET_FIXTURES],
    recovery: recoveryPlan,
  });

  const staleCanary = {
    ...canary,
    checkedAt: "2026-07-12T10:00:00.000Z",
    expiresAt: "2026-07-12T10:05:00.000Z",
  };
  const decision = buildProductionReadinessDecisionEvidence({}, {
    now: EPIC_25_PRELIVE_NOW,
    fixtureEvidence: true,
    canaryEvidence: staleCanary,
    rampEvidence: ramp,
    recoveryEvidence: recovery,
    hardeningEvidence: hardening,
    finalAuthority: { state: "blocked", proven: false, evidenceRefs: [] },
    owner: "fixture-manager",
    scope: { name: "epic-25-prelive-fixture", boundaries: EPIC_25_PRELIVE_STOP_LINES },
    rollback: recoveryPlan,
  });

  const forgedCanary = {
    ...canary,
    evidenceClass: "live_observed",
    backendTruth: "live",
    truthLabel: "live",
    outcome: "pass",
    rampAllowed: true,
  };
  const forgedValidation = validateOneWorkerLiveCanaryEvidence(forgedCanary);
  const forgedDecision = buildProductionReadinessDecisionEvidence({}, {
    now: EPIC_25_PRELIVE_NOW,
    fixtureEvidence: true,
    canaryEvidence: forgedCanary,
    rampEvidence: { ...ramp, evidenceClass: "live_observed" },
    recoveryEvidence: { ...recovery, evidenceClass: "live_observed" },
    hardeningEvidence: { ...hardening, evidenceClass: "live_observed" },
    finalAuthority: { state: "allowed", proven: true, evidenceRefs: ["evidence:fixture-forged-authority"] },
  });

  const validations = validationSummary([
    ["readiness", validateOperationalReadinessContract, readiness],
    ["canary", validateOneWorkerLiveCanaryEvidence, canary],
    ["ramp", validateLiveCapacityRampEvidence, ramp],
    ["recovery", validateResilienceRecoveryEvidence, recovery],
    ["hardening", validateOperationalHardeningRunbookEvidence, hardening],
    ["decision", validateProductionReadinessDecisionEvidence, decision],
  ]);

  const bundle = {
    schemaVersion: "epic-25-prelive-evidence-bundle.v1",
    generatedAt: EPIC_25_PRELIVE_NOW,
    evidenceClass: "fixture",
    truthLabel: "prelive_fixture",
    metadataOnly: true,
    rawPayloadRetained: false,
    stopLines: EPIC_25_PRELIVE_STOP_LINES,
    evidence: { readiness, canary, ramp, recovery, hardening, decision },
    exercisedPaths: {
      thresholdBreach: {
        canaryOutcome: canary.outcome,
        rampOutcome: ramp.outcome,
        stageWorkerCounts: ramp.stageWorkerCounts,
        stageOutcomes: ramp.stages.map((stage) => stage.outcome),
        rollbackRequired: ramp.recovery.required,
      },
      staleAndMissingAuthority: {
        staleEvidenceRejected: decision.typedBlockers.some((blocker) => blocker.code === "decision_predecessor_stale"),
        missingAuthorityRejected: decision.typedBlockers.some((blocker) => blocker.code === "decision_authority_missing"),
      },
      forgedLiveProvenance: {
        accepted: forgedValidation.length === 0 && forgedDecision.decision !== "hold",
        validatorCodes: forgedValidation.map((blocker) => blocker.code),
        fixtureGuardTriggered: forgedDecision.typedBlockers.some((blocker) => blocker.code === "decision_fixture_evidence"),
        finalDecision: forgedDecision.decision,
      },
      secretLikeRefs: {
        retained: SECRET_FIXTURES.some((secret) => JSON.stringify({ readiness, canary, ramp, recovery, hardening, decision }).includes(secret)),
      },
      recoveryAndHold: {
        recoveryOutcome: recovery.outcome,
        hardeningOutcome: hardening.outcome,
        finalDecision: decision.decision,
        rollbackRequired: decision.rollback.required,
      },
    },
    validations,
  };

  const liveClaimValues = scalarValues(bundle).filter((value) => value === "live" || value === "live_observed");
  bundle.assertions = {
    contractValidatorsPassed: Object.values(validations).every((failures) => failures.length === 0),
    finalDecisionIsHold: decision.decision === "hold",
    noLiveClaims: liveClaimValues.length === 0,
    secretLikeRefsRejected: bundle.exercisedPaths.secretLikeRefs.retained === false,
    forgedLiveProvenanceRejected: bundle.exercisedPaths.forgedLiveProvenance.accepted === false,
    allMutationAuthoritiesDisabled: [
      decision.rolloutAllowed,
      decision.automaticDeploymentAllowed,
      decision.providerCallsAllowed,
      decision.secretAccessAllowed,
      decision.mergeAllowed,
      decision.cleanupAllowed,
    ].every((value) => value === false),
  };
  bundle.ok = Object.values(bundle.assertions).every(Boolean);
  return bundle;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bundle = buildEpic25PreliveEvidenceBundle();
  process.stdout.write(`${JSON.stringify(bundle, null, 2)}\n`);
  if (!bundle.ok) process.exitCode = 1;
}
