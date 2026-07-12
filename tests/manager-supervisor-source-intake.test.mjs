import assert from "node:assert/strict";
import test from "node:test";

import { buildSourceBackedPacketSeedPlan } from "../scripts/lib/manager-control-plane/core.mjs";
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
  assert.equal(result.summary.seedPacket.rawPayloadRetained, false);
});

test("manager source intake derives deterministic bounded identities and maps a contract-valid BMAD story fixture", () => {
  const storyRef = "story:_bmad-output/implementation-artifacts/4-1-gate-4-manager-intake.md";
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
  const request = buildManagerSourceIntakeRequest(packet);

  assert.equal(request.packetId, deriveAuthoritativePacketId("candidate-gate-4-manager-intake"));
  assert.match(request.packetId, /^manager-source-[0-9a-f]{40}$/);
  assert.equal(request.sourceRef.sourceType, "bmad_story");
  assert.equal(request.sourceRef.pathOrUrl, "_bmad-output/implementation-artifacts/4-1-gate-4-manager-intake.md");
  assert.equal(request.sourceRef.refId, storyRef);
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
