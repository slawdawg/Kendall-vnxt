import assert from "node:assert/strict";
import test from "node:test";

import {
  PIPELINE_EPIC_25_EVIDENCE_CHAIN_SCHEMA_VERSION,
  PIPELINE_EPIC_25_EVIDENCE_CHAIN_V1_SCHEMA_VERSION,
  validatePipelineEpic25EvidenceChainV0,
  validatePipelineEpic25EvidenceChainV1,
} from "../packages/contracts/src/pipeline-control-plane/index.js";

const now = Date.parse("2026-07-12T12:00:00Z");
const schemas = {
  readiness: "pipeline-operational-readiness-contract/v0",
  canary: "pipeline-one-worker-live-canary/v0",
  ramp: "pipeline-live-capacity-ramp/v0",
  recovery: "pipeline-resilience-recovery-validation/v0",
  hardening: "pipeline-operational-hardening-runbooks/v0",
  decision: "pipeline-production-readiness-decision/v0",
};
const targetRevision = "a".repeat(40);
const gateFamilies = ["security", "retention", "rollback", "runbook", "telemetry", "recovery"];

function policyProfile(): any {
  return {
    schemaVersion: "pipeline-epic-25-policy-profile/v0",
    targetRevision,
    checkedAt: "2026-07-12T12:00:00Z",
    expiresAt: "2026-07-12T12:04:00Z",
    qualityGates: gateFamilies.map((family) => ({
      family,
      requirement: family === "runbook" ? "not_applicable" : "required",
      state: family === "runbook" ? "not_applicable" : "pass",
      typedReason: null,
      nextSafeAction: family === "runbook" ? "No action is required." : "Preserve passing evidence and continue review.",
      notApplicableReason: family === "runbook" ? "Runbook publication is outside this validation target." : null,
      targetRevision,
      checkedAt: "2026-07-12T12:00:00Z",
      expiresAt: "2026-07-12T12:04:00Z",
      evidenceRefs: [`evidence:${family}-gate`],
    })),
    retentionPolicy: {
      sourceOwner: "epic-25-source-owner",
      toolOwner: "supervisor",
      disposition: "metadata_only",
      redactionState: "verified_redacted",
      expiresAt: "2026-08-11T12:00:00Z",
      retentionPeriodDays: 30,
      disposalAction: "delete_metadata",
      verificationStatus: "verified",
      policyReason: "Retain bounded validation metadata for audit and then dispose it.",
      evidenceRefs: ["evidence:retention-policy"],
      metadataOnly: true,
      rawPayloadRetained: false,
    },
    executionAllowed: false,
    providerCallsAllowed: false,
    mutationAllowed: false,
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function chain(): any {
  const outcomes: Record<string, string> = { readiness: "no_go", canary: "hold", ramp: "hold", recovery: "hold", hardening: "hold", decision: "hold" };
  const packets: Record<string, any> = {};
  let predecessorPacketId = null;
  for (const slot of Object.keys(schemas)) {
    const packetId = `epic-25-${slot}`;
    let details: any;
    if (slot === "readiness") details = { kind: slot, backendTruth: "dry_run", authorityState: "blocked", gateCount: 10, thresholdsComplete: false, telemetryReady: false, rollbackReady: true, recoveryReady: true, configurationValid: true };
    else if (slot === "canary") details = { kind: slot, workerCount: 1, backendTruth: "dry_run", leaseState: "blocked", checkpointState: "blocked", measurementsComplete: false, canaryAuthorityProven: false, rampAllowed: false };
    else if (slot === "ramp") details = { kind: slot, canaryPacketId: packets.canary.packetId, canaryOutcome: packets.canary.outcome, stageWorkerCounts: [1, 2, 4, 6], stageOutcomes: ["hold", "hold", "hold", "hold"], scaleEvidenceReady: false };
    else if (slot === "recovery") details = { kind: slot, rampPacketId: packets.ramp.packetId, predecessorOutcome: packets.ramp.outcome, drillCount: 1, allDrillsPassed: false, idempotencyProven: false, silentRetryObserved: false, reliabilityEvidenceReady: false };
    else if (slot === "hardening") details = { kind: slot, recoveryPacketId: packets.recovery.packetId, predecessorOutcome: packets.recovery.outcome, domainCount: 1, unresolvedHighRiskGap: true, readinessHandoffReady: false };
    else details = { kind: slot, predecessorPacketIds: Object.fromEntries(["canary", "ramp", "recovery", "hardening"].map((name) => [name, packets[name].packetId])), predecessorOutcomes: Object.fromEntries(["canary", "ramp", "recovery", "hardening"].map((name) => [name, packets[name].outcome])), authorityReady: false, simulatedEvidence: true, staleEvidence: false, fixtureEvidence: false };
    packets[slot] = {
      slot, packetId, packetSchemaVersion: schemas[slot as keyof typeof schemas], predecessorPacketId,
      evidenceClass: "integrated_local", outcome: outcomes[slot], sourceRefs: ["prd:epic-25"], evidenceRefs: [`evidence:${slot}`],
      checkedAt: "2026-07-12T12:00:00Z", expiresAt: "2026-07-12T12:04:00Z", observedEvidenceAttestation: null,
      details, metadataOnly: true, rawPayloadRetained: false,
    };
    predecessorPacketId = packetId;
  }
  return {
    schemaVersion: PIPELINE_EPIC_25_EVIDENCE_CHAIN_V1_SCHEMA_VERSION, authoritativePacketId: "packet-epic-25", evidenceClass: "integrated_local", policyProfile: policyProfile(), packets,
    checkedAt: "2026-07-12T12:00:00Z", expiresAt: "2026-07-12T12:04:00Z", executionAllowed: false, providerCallsAllowed: false,
    mutationAllowed: false, metadataOnly: true, rawPayloadRetained: false,
  };
}

test("Epic 25 validator executes the complete integrated-local hold contract", () => {
  assert.deepEqual(validatePipelineEpic25EvidenceChainV1(chain(), now), []);
});

test("Epic 25 validator rejects naive time, duplicate identity, unsafe refs, malformed slot details, and non-live go", () => {
  const cases = [];
  const naive = chain(); naive.checkedAt = "2026-07-12T12:00:00"; cases.push(naive);
  const duplicate = chain(); duplicate.packets.ramp.packetId = duplicate.packets.canary.packetId; cases.push(duplicate);
  const secret = chain(); secret.packets.readiness.evidenceRefs = [`evidence:${"A".repeat(64)}`]; cases.push(secret);
  const malformed = chain(); malformed.packets.ramp.details.stageWorkerCounts = [1, 2, 6, 8]; cases.push(malformed);
  const go = chain(); go.packets.decision.outcome = "go"; cases.push(go);
  for (const candidate of cases) assert.ok(validatePipelineEpic25EvidenceChainV1(candidate, now).length > 0);
});

test("Epic 25 policy profile rejects missing gates, unexplained skips, stale targets, unsafe refs, expired or missing retention, and raw payloads", () => {
  const cases: Array<[string, any]> = [];
  const missingFamily = chain(); missingFamily.policyProfile.qualityGates = missingFamily.policyProfile.qualityGates.filter((gate: any) => gate.family !== "security"); cases.push(["missing family", missingFamily]);
  const notApplicableWithoutReason = chain(); notApplicableWithoutReason.policyProfile.qualityGates.find((gate: any) => gate.family === "runbook").notApplicableReason = null; cases.push(["not-applicable reason", notApplicableWithoutReason]);
  const staleTarget = chain(); staleTarget.policyProfile.qualityGates.find((gate: any) => gate.family === "telemetry").targetRevision = "b".repeat(40); cases.push(["stale target", staleTarget]);
  const unsafeRef = chain(); unsafeRef.policyProfile.qualityGates.find((gate: any) => gate.family === "security").evidenceRefs = ["evidence:sk-proj-12345678901234567890"]; cases.push(["unsafe ref", unsafeRef]);
  const expiredRetention = chain(); expiredRetention.policyProfile.retentionPolicy.expiresAt = "2026-07-11T12:00:00Z"; cases.push(["expired retention", expiredRetention]);
  const missingRetention = chain(); delete missingRetention.policyProfile.retentionPolicy; cases.push(["missing retention", missingRetention]);
  const rawPayload = chain(); rawPayload.policyProfile.retentionPolicy.rawPayloadRetained = true; cases.push(["raw payload", rawPayload]);
  const executableReason = chain(); executableReason.policyProfile.retentionPolicy.policyReason = "git commit -am update"; cases.push(["executable policy reason", executableReason]);
  const tokenReason = chain(); tokenReason.policyProfile.qualityGates.find((gate: any) => gate.family === "runbook").notApplicableReason = "ghp_123456789012345678901234567890123456"; cases.push(["token policy reason", tokenReason]);
  const duplicateRefs = chain(); duplicateRefs.policyProfile.qualityGates.find((gate: any) => gate.family === "security").evidenceRefs = ["evidence:security-gate", "evidence:security-gate"]; cases.push(["duplicate refs", duplicateRefs]);
  const invalidHour = chain(); invalidHour.policyProfile.checkedAt = "2026-07-12T24:00:00Z"; cases.push(["24:00 timestamp", invalidHour]);
  const invalidCalendarDate = chain(); invalidCalendarDate.policyProfile.checkedAt = "2026-02-30T12:00:00Z"; cases.push(["invalid calendar date", invalidCalendarDate]);
  const downgraded = chain(); Object.assign(downgraded.policyProfile.qualityGates.find((gate: any) => gate.family === "security"), { requirement: "not_applicable", state: "not_applicable", notApplicableReason: "Caller downgrade." }); cases.push(["required downgrade", downgraded]);

  for (const [label, candidate] of cases) {
    assert.ok(validatePipelineEpic25EvidenceChainV1(candidate, now).length > 0, label);
  }
});

test("Epic 25 legacy v0 remains explicitly validatable without a policy profile", () => {
  const legacy = chain();
  legacy.schemaVersion = PIPELINE_EPIC_25_EVIDENCE_CHAIN_SCHEMA_VERSION;
  delete legacy.policyProfile;
  assert.deepEqual(validatePipelineEpic25EvidenceChainV0(legacy, now), []);
  assert.ok(validatePipelineEpic25EvidenceChainV1(legacy, now).some((issue) => issue.field.startsWith("policyProfile")));
});
