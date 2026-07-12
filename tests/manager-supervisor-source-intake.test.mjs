import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOperationalReadinessContract,
  buildSourceBackedPacketSeedPlan,
  projectCanonicalSupervisorPacket,
} from "../scripts/lib/manager-control-plane/core.mjs";
import {
  ManagerSupervisorSourceIntakeError,
  buildManagerSourceIntakeRequest,
  deriveAuthoritativePacketId,
  intakeManagerSourcePacket,
  resolveLoopbackSourceIntakeEndpoint,
} from "../scripts/lib/manager-control-plane/manager-supervisor-source-intake.mjs";
import { parseManagerSourceIntakeArgs } from "../scripts/manager-supervisor-source-intake.mjs";

function sourcePacket(overrides = {}) {
  const packet = buildSourceBackedPacketSeedPlan({
    runId: "manager-source-intake-test",
    candidateId: "candidate-gate-4-manager-intake",
    title: "Gate 4 manager source intake",
    sourceRefs: ["doc:docs/workflows/current-session-runbook.md"],
    acceptanceCriteria: ["Eligible manager source metadata reaches supervisor lifecycle truth."],
    verificationTargets: ["node --test tests/manager-supervisor-source-intake.test.mjs"],
    touchedSurfaceHint: "scripts/lib/manager-control-plane/manager-supervisor-source-intake.mjs",
    riskClass: "low",
    authorityClass: "allowed_unattended",
  });
  return { ...packet, ...overrides };
}

function responseFor(request, overrides = {}) {
  const event = {
    eventId: "event-source-intake-test",
    packetId: request.packetId,
    schemaVersion: 1,
    eventType: "packet.created",
    previousStage: null,
    targetStage: request.initialStage,
    status: request.status,
    truthLabel: request.truthLabel,
    sourceRef: request.sourceRef,
    actor: request.actor,
    occurredAt: "2026-07-12T12:00:00.000Z",
    correlationId: request.correlationId,
    causationId: null,
    idempotencyKey: request.idempotencyKey,
    payloadSummary: request.payloadSummary,
    evidenceRefs: request.evidenceRefs,
    metadataOnly: true,
  };
  return {
    ok: true,
    status: 200,
    json: async () => ({
      data: {
        packetId: request.packetId,
        title: request.title,
        currentStage: request.initialStage,
        status: request.status,
        truthLabel: request.truthLabel,
        sourceRef: request.sourceRef,
        createdAt: event.occurredAt,
        updatedAt: event.occurredAt,
        currentEventId: event.eventId,
        parentPacketId: null,
        lineageKind: "root",
        readyToTest: null,
        operatorTestState: "not_ready",
        operatorTestNote: null,
        history: [event],
        metadataOnly: true,
        ...overrides,
      },
    }),
  };
}

const READINESS_COMPONENT_IDS = [
  "source_provenance",
  "trust_boundary",
  "authority_boundary",
  "evidence_retention",
  "quality_gates",
  "delivery_evidence",
];

function canonicalFields(request, overrides = {}) {
  const authority = {
    sourceMutationAllowed: false,
    providerCallsAllowed: false,
    workerLaunchAllowed: false,
    githubMutationAllowed: false,
    rawPayloadRetentionAllowed: false,
  };
  const canonicalContract = {
    schemaVersion: "pipeline-canonical-contract/v1",
    productMode: "read_only",
    canonicalSource: {
      sourceId: "manager-source-intake",
      role: "canonical",
      trust: "authoritative",
      provenance: {
        sourceRef: request.sourceRef,
        observedAt: "2026-07-12T12:00:00.000Z",
        evidenceRefs: ["evidence:canonical-source"],
      },
      authority,
      metadataOnly: true,
      rawPayloadRetained: false,
    },
    qualityGates: {
      kind: "gate",
      gateId: "manager-source-intake-quality",
      requirement: "required",
      state: "pass",
      evidenceRefs: ["evidence:quality"],
    },
    readinessComponents: Object.fromEntries(READINESS_COMPONENT_IDS.map((componentId) => [componentId, {
      componentId,
      requirement: "required",
      state: "pass",
      evidenceRefs: [`evidence:${componentId}`],
    }])),
    deliveryEvidence: [{
      deliveryId: "manager-source-delivery",
      action: "pull_request",
      status: "recorded",
      target: { repository: "slawdawg/kendall-vnxt", baseBranch: "dev" },
      evidence: {
        evidenceId: "manager-source-delivery-evidence",
        disposition: "metadata_only",
        evidenceRefs: ["evidence:delivery"],
        metadataOnly: true,
        rawPayloadRetained: false,
      },
      authority,
      deliveryAuthorityGranted: false,
      metadataOnly: true,
      rawPayloadRetained: false,
    }],
    authority,
    metadataOnly: true,
    rawPayloadRetained: false,
  };
  const productModeMapping = {
    requestedProductMode: "read_only",
    effectiveProductMode: "read_only",
    operationalMode: "read_only",
    readinessState: "ready",
    freshnessState: "live",
    capabilityState: "gated",
    checkedAt: "2026-07-12T12:00:00.000Z",
    expiresAt: "2026-07-12T12:05:00.000Z",
    ready: true,
    blockedReasons: [],
    metadataOnly: true,
    rawPayloadRetained: false,
    sourceMutationAllowed: false,
    providerCallsAllowed: false,
    workerLaunchAllowed: false,
    githubMutationAllowed: false,
  };
  return { canonicalContract, productModeMapping, ...overrides };
}

test("manager source intake allowlists eligible source metadata and validates exact persisted identity", async () => {
  const packet = sourcePacket({ internalPlanningMetadata: { marker: "must never cross the boundary" } });
  const calls = [];
  const result = await intakeManagerSourcePacket(packet, "http://127.0.0.1:8000", {
    fetchImpl: async (url, options) => {
      const request = JSON.parse(options.body);
      calls.push({ url, options, request });
      return responseFor(request);
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:8000/pipeline-control-plane/work-packets");
  assert.deepEqual(Object.keys(calls[0].request).sort(), [
    "actor", "correlationId", "evidenceRefs", "idempotencyKey", "initialStage", "packetId",
    "payloadSummary", "sourceRef", "status", "title", "truthLabel",
  ].sort());
  assert.equal(JSON.stringify(calls[0].request).includes("must never cross"), false);
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(packet.summary.seedPacket.supervisorIntake, undefined, "input remains immutable");
  assert.equal(result.summary.seedPacket.supervisorIntake.status, "persisted");
  assert.equal(result.summary.seedPacket.supervisorIntake.packetId, calls[0].request.packetId);
  assert.equal(result.summary.seedPacket.supervisorIntake.currentEventId, "event-source-intake-test");
  assert.equal(result.summary.seedPacket.supervisorIntake.metadataOnly, true);
  assert.equal(result.summary.seedPacket.supervisorIntake.truthSource, "legacy_lifecycle_fallback");
  assert.equal(result.summary.seedPacket.supervisorIntake.typedCapabilityTruth, null);
  assert.equal(result.summary.seedPacket.rawPayloadRetained, false);
});

test("manager source intake consumes canonical supervisor truth without inferring authority", async () => {
  const packet = sourcePacket();
  let request;
  const result = await intakeManagerSourcePacket(packet, "http://127.0.0.1:8000", {
    now: "2026-07-12T12:01:00.000Z",
    fetchImpl: async (_url, options) => {
      request = JSON.parse(options.body);
      return responseFor(request, canonicalFields(request));
    },
  });
  const intake = result.summary.seedPacket.supervisorIntake;
  assert.equal(intake.truthSource, "supervisor_canonical");
  assert.equal(intake.canonicalSource.trust, "authoritative");
  assert.equal(intake.canonicalSource.provenance.sourceRef.refId, request.sourceRef.refId);
  assert.equal(intake.readinessComponents.delivery_evidence.state, "pass");
  assert.equal(intake.qualityEvidence.state, "pass");
  assert.equal(intake.retentionEvidence[1].disposition, "metadata_only");
  assert.equal(intake.deliveryEvidence[0].deliveryAuthorityGranted, false);
  assert.deepEqual(intake.typedCapabilityTruth, {
    requestedProductMode: "read_only",
    effectiveProductMode: "read_only",
    operationalMode: "read_only",
    readinessState: "ready",
    freshnessState: "live",
    capabilityState: "gated",
    ready: true,
    blockedReasons: [],
    sourceMutationAllowed: false,
    providerCallsAllowed: false,
    workerLaunchAllowed: false,
    githubMutationAllowed: false,
  });
});

test("canonical supervisor consumer rejects missing stale and contradictory fields and never falls back", async (t) => {
  const scenarios = [
    ["missing mapping", "manager_supervisor_canonical_fields_invalid", (request) => ({ canonicalContract: canonicalFields(request).canonicalContract })],
    ["stale mapping", "manager_supervisor_canonical_fields_stale", (request) => canonicalFields(request, { productModeMapping: { ...canonicalFields(request).productModeMapping, expiresAt: "2026-07-12T11:59:00.000Z" } })],
    ["contradictory mode", "manager_supervisor_canonical_fields_invalid", (request) => canonicalFields(request, { productModeMapping: { ...canonicalFields(request).productModeMapping, requestedProductMode: "operator_review" } })],
    ["contradictory source", "manager_supervisor_canonical_fields_invalid", (request) => {
      const fields = canonicalFields(request);
      fields.canonicalContract.canonicalSource.provenance.sourceRef = { ...request.sourceRef, refId: "doc:docs/other.md", pathOrUrl: "docs/other.md" };
      return fields;
    }],
    ["contradictory readiness", "manager_supervisor_canonical_fields_invalid", (request) => {
      const fields = canonicalFields(request);
      fields.canonicalContract.readinessComponents.trust_boundary.state = "blocked";
      return fields;
    }],
  ];
  for (const [name, code, fields] of scenarios) {
    await t.test(name, async () => {
      await assert.rejects(
        intakeManagerSourcePacket(sourcePacket(), "http://127.0.0.1:8000", {
          now: "2026-07-12T12:01:00.000Z",
          fetchImpl: async (_url, options) => {
            const request = JSON.parse(options.body);
            return responseFor(request, fields(request));
          },
        }),
        (error) => error.code === code && error.packet.summary.seedPacket.supervisorIntake === undefined,
      );
    });
  }
});

test("canonical source intake preserves supervisor terminal state", async () => {
  const result = await intakeManagerSourcePacket(sourcePacket(), "http://127.0.0.1:8000", {
    now: "2026-07-12T12:01:00.000Z",
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body);
      const response = responseFor(request, canonicalFields(request));
      const body = await response.json();
      const terminalEvent = {
        ...body.data.history[0],
        eventId: "event-source-intake-terminal",
        eventType: "packet.transitioned",
        previousStage: "capture",
        targetStage: "deliver",
        status: "done",
        idempotencyKey: "terminal-transition",
      };
      body.data.currentStage = "deliver";
      body.data.status = "done";
      body.data.currentEventId = terminalEvent.eventId;
      body.data.history.push(terminalEvent);
      return { ok: true, status: 200, json: async () => body };
    },
  });
  assert.equal(result.summary.seedPacket.supervisorIntake.currentStage, "deliver");
  assert.equal(result.summary.seedPacket.supervisorIntake.lifecycleStatus, "done");
  assert.equal(result.summary.seedPacket.supervisorIntake.typedCapabilityTruth.githubMutationAllowed, false);
});

test("operational readiness uses canonical backend truth instead of contradictory manager fallback", () => {
  const request = buildManagerSourceIntakeRequest(sourcePacket());
  const supervisorPacket = { sourceRef: request.sourceRef, ...canonicalFields(request) };
  const projection = projectCanonicalSupervisorPacket(supervisorPacket, { now: "2026-07-12T12:01:00.000Z" });
  assert.equal(projection.valid, true);
  assert.equal(projection.typedCapabilityTruth.capabilityState, "gated");

  const readiness = buildOperationalReadinessContract({}, {
    now: "2026-07-12T12:01:00.000Z",
    supervisorPacket,
    backendTruth: "simulated",
    freshnessState: "stale",
    target: { workerId: "worker-1", assignmentId: "assignment-1", owner: "manager", runId: "run-1", sourceRefs: ["source:fallback"], evidenceRefs: ["evidence:fallback"] },
  });
  assert.equal(readiness.backendTruth, "live");
  assert.equal(readiness.canonicalSupervisor.typedCapabilityTruth.capabilityState, "gated");
  assert.deepEqual(readiness.target.sourceRefs, [`source:${request.sourceRef.refId}`]);
  assert.equal(readiness.target.sourceRefs.includes("source:fallback"), false);
  assert.equal(readiness.outcome, "no_go", "canonical capability truth does not grant missing manager authority");

  const failedQualityPacket = structuredClone(supervisorPacket);
  failedQualityPacket.canonicalContract.qualityGates.state = "fail";
  const failedQuality = buildOperationalReadinessContract({}, {
    now: "2026-07-12T12:01:00.000Z",
    supervisorPacket: failedQualityPacket,
    target: { workerId: "worker-1", assignmentId: "assignment-1", owner: "manager", runId: "run-1" },
  });
  assert.equal(failedQuality.canonicalSupervisor.valid, true, "failed quality is canonical truth, not malformed truth");
  assert.equal(failedQuality.canonicalSupervisor.readinessReady, false);
  assert.equal(failedQuality.gates.find((gate) => gate.gateId === "canonical_supervisor_contract").state, "blocked");
});

test("source-backed seed fails closed instead of falling back from invalid canonical projection", () => {
  const request = buildManagerSourceIntakeRequest(sourcePacket());
  const fields = canonicalFields(request);
  fields.productModeMapping.ready = false;
  const result = buildSourceBackedPacketSeedPlan({
    runId: "canonical-seed-fail-closed",
    candidateId: "canonical-seed-candidate",
    title: "Canonical seed candidate",
    sourceRefs: [request.sourceRef.refId],
    acceptanceCriteria: ["Canonical truth remains authoritative."],
    verificationTargets: ["node --test tests/manager-supervisor-source-intake.test.mjs"],
    touchedSurfaceHint: "scripts/lib/manager-control-plane/core.mjs",
    riskClass: "low",
    authorityClass: "allowed_unattended",
  }, { supervisorPacket: { sourceRef: request.sourceRef, ...fields }, now: "2026-07-12T12:01:00.000Z" });
  assert.equal(result.status, "blocked");
  assert.equal(result.summary.canonicalSupervisor.fallbackAllowed, false);
  assert.ok(result.blockers.some((blocker) => blocker.code === "canonical_contract_contradictory"));
});

test("manager source intake derives deterministic bounded identities and maps a contract-valid BMAD story fixture", () => {
  const storyRef = "story:_bmad-output/implementation-artifacts/4-1-gate-4-manager-intake.md";
  const metadataDigest = `sha256:${"a".repeat(64)}`;
  const prdRef = "_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-04-operational-pipeline-action-loop/prd.md";
  const architectureRef = "_bmad-output/planning-artifacts/architecture-operational-pipeline-action-loop-2026-07-04.md";
  const epicsRef = "_bmad-output/planning-artifacts/epics.md";
  const readinessRef = "_bmad-output/planning-artifacts/implementation-readiness-report-2026-07-04.md";
  const sourceProvenance = {
    mode: "default_local_bmad",
    bundleSelection: "canonical_sprint_source_key",
    storyRef,
    storyKey: "4-1-gate-4-manager-intake",
    storyStatus: "ready-for-dev",
    sprintStatusRef: "_bmad-output/implementation-artifacts/sprint-status.yaml",
    sourceKey: "2026-07-04-operational-pipeline-action-loop",
    bundleRef: `prd:${prdRef}`,
    prd: { ref: prdRef, status: "final", metadataDigest },
    architecture: { ref: architectureRef, status: "complete", metadataDigest },
    epics: { ref: epicsRef, status: "complete", metadataDigest },
    implementationReadiness: { ref: readinessRef, status: "complete", metadataDigest },
    sprint: { ref: "_bmad-output/implementation-artifacts/sprint-status.yaml", sourceKey: "2026-07-04-operational-pipeline-action-loop", metadataDigest },
    story: { ref: storyRef.slice("story:".length), key: "4-1-gate-4-manager-intake", status: "ready-for-dev", metadataDigest },
    metadataOnly: true,
    rawPayloadRetained: false,
  };
  const docRef = "doc:docs/workflows/current-session-runbook.md";
  const replaceSourceRef = (value) => {
    if (Array.isArray(value)) return value.map(replaceSourceRef);
    if (!value || typeof value !== "object") return value === docRef ? storyRef : value;
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, replaceSourceRef(nested)]));
  };
  const packet = replaceSourceRef(sourcePacket());
  for (const discovery of [packet.summary.sourceArtifactDiscovery, packet.summary.sourceWorkEligibility.sourceArtifactDiscovery]) {
    discovery.artifacts[0].sourceType = "story";
    discovery.artifacts[0].ownershipBoundary = "bmad_local_planning_state";
    discovery.artifacts[0].repoDeliverableAllowed = false;
  }
  packet.summary.seedPacket.sourceProvenance = sourceProvenance;
  packet.summary.sourceWorkEligibility.candidateWorkPackets[0].sourceProvenance = sourceProvenance;
  const request = buildManagerSourceIntakeRequest(packet);

  assert.equal(request.packetId, deriveAuthoritativePacketId("candidate-gate-4-manager-intake"));
  assert.match(request.packetId, /^manager-source-[0-9a-f]{40}$/);
  assert.equal(request.sourceRef.sourceType, "bmad_story");
  assert.equal(request.sourceRef.pathOrUrl, "_bmad-output/implementation-artifacts/4-1-gate-4-manager-intake.md");
  assert.equal(request.sourceRef.refId, storyRef);
  assert.equal(request.sourceRef.title, "Gate 4 manager source intake");
  assert.ok(request.evidenceRefs.includes("manager-bmad-story:4-1-gate-4-manager-intake"));
  assert.ok(request.evidenceRefs.includes(`manager-bmad-bundle:${sourceProvenance.bundleRef}`));
  assert.ok(request.evidenceRefs.includes("manager-bmad-sprint-status:_bmad-output/implementation-artifacts/sprint-status.yaml"));
  assert.ok(request.evidenceRefs.includes(`manager-bmad-architecture:${architectureRef}`));
  assert.ok(request.evidenceRefs.includes(`manager-bmad-readiness:${readinessRef}`));
  assert.ok(request.evidenceRefs.includes(`manager-bmad-story-metadata-${metadataDigest}`));
  assert.equal(JSON.stringify(request).includes("BMAD story metadata reaches"), false);
  assert.equal(JSON.stringify(request).includes("node --test"), false);
});

test("manager source intake is loopback-only and rejects ineligible ambiguous or retained inputs before fetch", async (t) => {
  assert.equal(resolveLoopbackSourceIntakeEndpoint("http://localhost:8000/"), "http://localhost:8000/pipeline-control-plane/work-packets");
  assert.equal(resolveLoopbackSourceIntakeEndpoint("http://[::1]:8000"), "http://[::1]:8000/pipeline-control-plane/work-packets");
  for (const invalidUrl of ["https://supervisor.example.com", "http://127.0.0.1:8000/api", "http://user@localhost:8000"] ) {
    assert.throws(() => resolveLoopbackSourceIntakeEndpoint(invalidUrl), /loopback|application path|uncredentialed/);
  }

  const cases = [
    ["ineligible", (packet) => { packet.summary.packetState = "blocked"; packet.summary.seedPacket.eligibilityDecision = "blocked"; }],
    ["multiple source refs", (packet) => { packet.summary.seedPacket.sourceRefs.push("doc:docs/architecture/index.md"); }],
    ["raw retention", (packet) => { packet.summary.seedPacket.rawPayloadRetained = true; }],
    ["raw payload field", (packet) => { packet.rawBmadPayload = "story body"; }],
    ["authority drift", (packet) => { packet.summary.seedPacket.authorityClass = "forbidden"; }],
    ["risk drift", (packet) => { packet.summary.seedPacket.riskClass = "high"; }],
    ["eligibility provenance drift", (packet) => {
      packet.summary.sourceWorkEligibility.candidateWorkPackets[0] = {
        ...packet.summary.sourceWorkEligibility.candidateWorkPackets[0],
        title: "Different candidate",
      };
    }],
    ["BMAD source provenance drift", (packet) => {
      packet.summary.seedPacket.sourceProvenance = {
        mode: "default_local_bmad",
        storyRef: packet.summary.seedPacket.sourceRefs[0],
        storyKey: "4-1-wrong-story",
        storyStatus: "ready-for-dev",
        sprintStatusRef: "_bmad-output/implementation-artifacts/sprint-status.yaml",
        sourceKey: "wrong-source",
        bundleRef: "doc:docs/workflows/current-session-runbook.md",
        metadataOnly: true,
        rawPayloadRetained: false,
      };
      packet.summary.sourceWorkEligibility.candidateWorkPackets[0].sourceProvenance = packet.summary.seedPacket.sourceProvenance;
    }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const packet = sourcePacket();
      mutate(packet);
      let fetchCalls = 0;
      await assert.rejects(
        intakeManagerSourcePacket(packet, "http://127.0.0.1:8000", { fetchImpl: async () => { fetchCalls += 1; } }),
        (error) => {
          assert.ok(error instanceof ManagerSupervisorSourceIntakeError);
          assert.equal(error.code, "manager_supervisor_source_intake_input_invalid");
          assert.equal(error.packet.ok, false);
          assert.ok(error.packet.blockers.some((blocker) => blocker.code === error.code));
          return true;
        },
      );
      assert.equal(fetchCalls, 0);
    });
  }
});

test("manager source intake fails closed on non-loopback network HTTP malformed and conflicting responses", async (t) => {
  const packet = sourcePacket();
  const scenarios = [
    ["non-loopback", "manager_supervisor_source_intake_non_loopback_url", "https://example.com", async () => responseFor(buildManagerSourceIntakeRequest(packet))],
    ["network", "manager_supervisor_source_intake_network_error", "http://127.0.0.1:8000", async () => { throw new Error("refused"); }],
    ["HTTP", "manager_supervisor_source_intake_http_error", "http://127.0.0.1:8000", async () => ({ ok: false, status: 503, json: async () => ({}) })],
    ["malformed", "manager_supervisor_source_intake_response_malformed", "http://127.0.0.1:8000", async () => ({ ok: true, status: 200, json: async () => ({ data: {} }) })],
    ["identity conflict", "manager_supervisor_source_intake_identity_conflict", "http://127.0.0.1:8000", async (_url, options) => responseFor(JSON.parse(options.body), { title: "Conflicting title" })],
    ["current event conflict", "manager_supervisor_source_intake_identity_conflict", "http://127.0.0.1:8000", async (_url, options) => responseFor(JSON.parse(options.body), { currentStage: "review" })],
    ["unsafe response field", "manager_supervisor_source_intake_response_malformed", "http://127.0.0.1:8000", async (_url, options) => responseFor(JSON.parse(options.body), { rawProviderPayload: "forbidden" })],
  ];
  for (const [name, code, url, fetchImpl] of scenarios) {
    await t.test(name, async () => {
      await assert.rejects(
        intakeManagerSourcePacket(packet, url, { fetchImpl }),
        (error) => {
          assert.equal(error.code, code);
          assert.equal(error.packet.ok, false);
          assert.equal(error.packet.summary.seedPacket.supervisorIntake, undefined);
          assert.ok(error.packet.blockers.some((blocker) => blocker.code === code));
          return true;
        },
      );
    });
  }
});

test("manager source intake CLI rejects duplicate target flags", () => {
  assert.throws(
    () => parseManagerSourceIntakeArgs(["--input", "one.json", "--input", "two.json", "--supervisor-url", "http://127.0.0.1:8000"]),
    /specified more than once/,
  );
  assert.throws(
    () => parseManagerSourceIntakeArgs(["--input", "one.json", "--supervisor-url", "http://127.0.0.1:8000", "--supervisor-url=http://localhost:8000"]),
    /specified more than once/,
  );
});

test("manager source intake rejects invalid timeout configuration before fetch", async () => {
  let fetchCalls = 0;
  await assert.rejects(
    intakeManagerSourcePacket(sourcePacket(), "http://127.0.0.1:8000", {
      timeoutMs: 0,
      fetchImpl: async () => { fetchCalls += 1; },
    }),
    (error) => error.code === "manager_supervisor_source_intake_input_invalid",
  );
  assert.equal(fetchCalls, 0);
});
