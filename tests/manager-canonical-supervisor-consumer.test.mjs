import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCyclePacket,
  consumeCanonicalSupervisorProjection,
} from "../scripts/lib/manager-control-plane/core.mjs";

const NOW = "2026-07-12T12:00:00.000Z";
const SOURCE_REF = {
  refId: "story:_bmad-output/implementation-artifacts/25-7-provenance-hardening.md",
  sourceType: "bmad_story",
  pathOrUrl: "_bmad-output/implementation-artifacts/25-7-provenance-hardening.md",
  title: "Epic 25 provenance hardening",
};
const AUTHORITY = {
  sourceMutationAllowed: false,
  providerCallsAllowed: false,
  workerLaunchAllowed: false,
  githubMutationAllowed: false,
  rawPayloadRetentionAllowed: false,
};
const COMPONENT_IDS = [
  "source_provenance", "trust_boundary", "authority_boundary",
  "evidence_retention", "quality_gates", "delivery_evidence",
];

function capability(actionId, overrides = {}) {
  return {
    actionId,
    targetType: "work_packet",
    targetId: "packet-canonical",
    capabilityState: "gated",
    authorityState: "needs_product_approval",
    riskTier: "medium",
    typedReason: "blocked_by_approval",
    expectedResultSummary: `Canonical ${actionId} capability.`,
    evidenceRefs: [`capability:${actionId}`],
    metadataOnly: true,
    rawPayloadRetained: false,
    ...overrides,
  };
}

function canonicalContract(overrides = {}) {
  const readinessComponents = Object.fromEntries(COMPONENT_IDS.map((componentId) => [componentId, {
    componentId,
    requirement: "required",
    state: "pass",
    evidenceRefs: [`evidence:${componentId}`],
  }]));
  return {
    schemaVersion: "pipeline-canonical-contract/v1",
    productMode: "operator_review",
    canonicalSource: {
      sourceId: SOURCE_REF.refId,
      role: "canonical",
      trust: "authoritative",
      provenance: { sourceRef: SOURCE_REF, observedAt: NOW, evidenceRefs: ["evidence:canonical-source"] },
      authority: AUTHORITY,
      metadataOnly: true,
      rawPayloadRetained: false,
    },
    qualityGates: { kind: "gate", gateId: "canonical-quality", requirement: "required", state: "pass", evidenceRefs: ["evidence:quality-pass"] },
    readinessComponents,
    deliveryEvidence: [],
    authority: AUTHORITY,
    metadataOnly: true,
    rawPayloadRetained: false,
    ...overrides,
  };
}

function productModeMapping(overrides = {}) {
  return {
    requestedProductMode: "operator_review",
    effectiveProductMode: "operator_review",
    operationalMode: "read_only",
    readinessState: "ready",
    freshnessState: "live",
    capabilityState: "gated",
    checkedAt: NOW,
    expiresAt: "2026-07-12T12:05:00.000Z",
    ready: true,
    blockedReasons: [],
    metadataOnly: true,
    rawPayloadRetained: false,
    sourceMutationAllowed: false,
    providerCallsAllowed: false,
    workerLaunchAllowed: false,
    githubMutationAllowed: false,
    ...overrides,
  };
}

function supervisorProjection(overrides = {}) {
  const actionCapabilities = [
    capability("inspect", { capabilityState: "available", authorityState: "not_required", riskTier: "low", typedReason: null }),
    capability("refresh_projection", { targetType: "projection", capabilityState: "available", authorityState: "not_required", riskTier: "low", typedReason: null }),
    capability("mark_tested"),
    capability("request_rework"),
    capability("retry_verification", { authorityState: "needs_authority_approval" }),
    capability("requeue", { authorityState: "needs_authority_approval" }),
    capability("reassign", { authorityState: "needs_authority_approval" }),
    capability("reject"),
  ];
  const packet = {
    packetId: "packet-canonical",
    sourceRef: SOURCE_REF,
    currentStage: "review",
    status: "active",
    canonicalContract: canonicalContract(),
    productModeMapping: productModeMapping(),
    metadataOnly: true,
  };
  return {
    schemaVersion: "pipeline-dashboard-projection/v0",
    generatedAt: NOW,
    freshnessState: "live",
    workPackets: [packet],
    selectedPacketDetails: [{ ...packet, actionCapabilities }],
    runtimeReadiness: {
      schemaVersion: "pipeline-operational-runtime-readiness/v0",
      actionSchemaVersion: "pipeline-operational-action/v0",
      readinessState: "ready",
      operationalMode: "read_only",
      freshnessState: "live",
      capabilityState: "available",
      typedReason: null,
      checkedAt: NOW,
      expiresAt: "2026-07-12T12:05:00.000Z",
      summary: "Canonical supervisor runtime readiness.",
      actionCapabilities,
      evidenceRefs: ["runtime:database-reachable"],
      metadataOnly: true,
      rawPayloadRetained: false,
    },
    actionCapabilities,
    ...overrides,
  };
}

function cycleContext(supervisorProjectionValue) {
  return {
    now: NOW,
    supervisorProjection: supervisorProjectionValue,
    preflightStatus: { status: "ready", summary: { ok: true }, blockers: [], warnings: [] },
    usageContext: { status: "normal", summary: { state: "normal" } },
    resourceContext: { status: "normal", summary: { state: "normal" } },
    workerStatus: { status: "ready", summary: { workerCounts: { active: 0, warm: 0, paused: 0 } }, blockers: [], warnings: [] },
    assignmentSummary: { summary: { backlogStatusCounts: { assignable: 0 }, laneAssignmentStatusCounts: {}, workspaceAssignmentStatusCounts: {} } },
    cleanupPlan: { status: "ready", summary: { mutationMode: "none", rawPayloadRetained: false }, blockers: [], warnings: [], nextActions: [] },
    deliveryPlan: { status: "ready", summary: { mutationMode: "none", rawPayloadRetained: false }, blockers: [], warnings: [], nextActions: [] },
    recoveryPlan: { status: "ready", summary: { state: "not_requested" }, blockers: [], warnings: [], nextActions: [] },
    workerProgressStatus: { status: "ready", summary: { workerProgress: [] }, blockers: [], warnings: [], nextActions: [] },
    laneAdvanceStatus: { status: "ready", summary: { readyLaneCount: 0, readyLanes: [] }, blockers: [], warnings: [], nextActions: [] },
  };
}

test("cycle packets consume canonical capabilities without inferring mutation authority", () => {
  const consumed = consumeCanonicalSupervisorProjection(supervisorProjection(), { now: NOW });
  assert.equal(consumed.present, true);
  assert.equal(consumed.ok, true, JSON.stringify(consumed.blockers));
  assert.equal(consumed.actionCapabilities.find((entry) => entry.actionId === "inspect").authorityState, "not_required");

  const cycle = buildCyclePacket({ runId: "canonical-consumer", stateRoot: ".manager-state" }, cycleContext(supervisorProjection()));
  assert.equal(cycle.summary.canonicalSupervisor.ok, true);
  assert.equal(cycle.summary.operationalActions.source, "canonical_supervisor_projection");
  assert.equal(cycle.summary.operationalActions.actionCapabilities.find((entry) => entry.actionId === "dispatch_apply").authorityState, "blocked");
});

test("partial stale contradictory and terminal canonical truth fails closed without legacy fallback", () => {
  const partial = supervisorProjection();
  delete partial.selectedPacketDetails[0].productModeMapping;
  delete partial.selectedPacketDetails[0].canonicalContract;
  const stale = supervisorProjection();
  stale.workPackets[0].productModeMapping = productModeMapping({ expiresAt: "2026-07-12T11:59:59.000Z" });
  stale.selectedPacketDetails[0].productModeMapping = stale.workPackets[0].productModeMapping;
  const contradiction = supervisorProjection();
  contradiction.selectedPacketDetails[0].canonicalContract = canonicalContract({
    canonicalSource: {
      ...canonicalContract().canonicalSource,
      provenance: { ...canonicalContract().canonicalSource.provenance, sourceRef: { ...SOURCE_REF, refId: "story:other.md" } },
    },
  });
  const lifecycleContradiction = supervisorProjection();
  lifecycleContradiction.workPackets[0].status = "complete";
  lifecycleContradiction.workPackets[0].currentStage = "learn";
  const duplicateCapabilities = supervisorProjection();
  duplicateCapabilities.actionCapabilities.push(duplicateCapabilities.actionCapabilities[0]);
  for (const projection of [partial, stale, contradiction, lifecycleContradiction, duplicateCapabilities]) {
    const consumed = consumeCanonicalSupervisorProjection(projection, { now: NOW });
    assert.equal(consumed.present, true);
    assert.equal(consumed.ok, false);
    assert.equal(consumed.operationalActions.source, "canonical_supervisor_projection");
  }

  for (const terminalStatus of ["complete", "deferred"]) {
    const terminal = supervisorProjection();
    for (const packet of [...terminal.workPackets, ...terminal.selectedPacketDetails]) {
      packet.status = terminalStatus;
      packet.currentStage = "learn";
    }
    const consumed = consumeCanonicalSupervisorProjection(terminal, { now: NOW });
    assert.equal(consumed.ok, true, JSON.stringify(consumed.blockers));
    assert.equal(consumed.terminal, true);
    assert.equal(consumed.operationalActions.actionCapabilities.find((entry) => entry.actionId === "requeue").authorityState, "blocked");
  }

  assert.deepEqual(consumeCanonicalSupervisorProjection({ workPackets: [{ packetId: "legacy" }] }, { now: NOW }), {
    present: false,
    ok: false,
    operationalActions: null,
    blockers: [],
  });
});

test("semantically equal canonical objects do not contradict because of key order", () => {
  const projection = supervisorProjection();
  const contract = projection.selectedPacketDetails[0].canonicalContract;
  projection.selectedPacketDetails[0].canonicalContract = {
    metadataOnly: contract.metadataOnly,
    schemaVersion: contract.schemaVersion,
    productMode: contract.productMode,
    canonicalSource: contract.canonicalSource,
    qualityGates: contract.qualityGates,
    readinessComponents: contract.readinessComponents,
    deliveryEvidence: contract.deliveryEvidence,
    authority: contract.authority,
    rawPayloadRetained: contract.rawPayloadRetained,
  };
  const consumed = consumeCanonicalSupervisorProjection(projection, { now: NOW });
  assert.equal(consumed.ok, true, JSON.stringify(consumed.blockers));
});
