import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ManagerSourceIntakeCycleError,
  parseManagerSourceIntakeCycleArgs,
  runManagerSourceIntakeCycle,
} from "../scripts/manager-source-intake-cycle.mjs";

const ELIGIBLE_ARGS = [
  "--run-id", "manager-source-cycle-test",
  "--candidate-id", "gate-4-cycle-candidate",
  "--title", "Gate 4 manager source intake cycle",
  "--source-ref", "doc:docs/workflows/current-session-runbook.md",
  "--acceptance-criterion", "Eligible source metadata reaches supervisor truth.",
  "--verification-target", "node --test tests/manager-source-intake-cycle.test.mjs",
  "--touched-surface", "scripts/manager-source-intake-cycle.mjs",
  "--risk-class", "low",
  "--authority-class", "allowed_unattended",
  "--supervisor-url", "http://127.0.0.1:8000",
];

function responseFor(request, overrides = {}) {
  const event = {
    eventId: "event-manager-source-cycle",
    packetId: request.packetId,
    schemaVersion: 1,
    eventType: "packet.created",
    previousStage: null,
    targetStage: request.initialStage,
    status: request.status,
    truthLabel: request.truthLabel,
    sourceRef: request.sourceRef,
    actor: request.actor,
    occurredAt: "2026-07-12T14:00:00.000Z",
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
        history: [event],
        metadataOnly: true,
        ...overrides,
      },
    }),
  };
}

test("manager source intake cycle accepts seed inputs plus one required loopback supervisor URL", () => {
  const parsed = parseManagerSourceIntakeCycleArgs(ELIGIBLE_ARGS);
  assert.equal(parsed.supervisorUrl, "http://127.0.0.1:8000");
  assert.equal(parseManagerSourceIntakeCycleArgs([...ELIGIBLE_ARGS, "--supervisor-uds-path", "/tmp/kendall-supervisor.sock"]).supervisorUdsPath, "/tmp/kendall-supervisor.sock");
  assert.equal(parsed.seedOptions.candidateId, "gate-4-cycle-candidate");
  assert.deepEqual(parsed.seedOptions.sourceRefs, ["doc:docs/workflows/current-session-runbook.md"]);
  assert.throws(() => parseManagerSourceIntakeCycleArgs(ELIGIBLE_ARGS.slice(0, -2)), /supervisor-url/);
  assert.throws(() => parseManagerSourceIntakeCycleArgs([...ELIGIBLE_ARGS, "--supervisor-url=http://localhost:8000"]), /specified more than once/);
  assert.throws(() => parseManagerSourceIntakeCycleArgs([...ELIGIBLE_ARGS, "--supervisor-uds-path", "/tmp/a.sock", "--supervisor-uds-path", "/tmp/b.sock"]), /specified more than once/);
  assert.equal(parseManagerSourceIntakeCycleArgs([...ELIGIBLE_ARGS, "--dry-run"]).mode, "dry_run");
  assert.equal(parseManagerSourceIntakeCycleArgs([...ELIGIBLE_ARGS, "--apply"]).mode, "apply");
  assert.throws(() => parseManagerSourceIntakeCycleArgs([...ELIGIBLE_ARGS, "--dry-run", "--apply"]), /mode may only/);
});

test("manager source intake cycle dry-run validates the exact target without fetch", async () => {
  let fetchCalls = 0;
  const result = await runManagerSourceIntakeCycle([...ELIGIBLE_ARGS, "--dry-run"], {
    fetchImpl: async () => { fetchCalls += 1; },
  });

  assert.equal(fetchCalls, 0);
  assert.equal(result.summary.sourceIntakePlan.mode, "dry_run");
  assert.equal(result.summary.sourceIntakePlan.fetchPerformed, false);
  assert.equal(result.summary.continuousSelection.code, "continuous-source-intake");
  assert.equal(result.summary.continuousSelection.mutationClass, "source_backed_supervisor_intake");
  assert.equal(result.summary.continuousSelection.allowed, true);
  assert.equal(result.summary.continuousSelection.status, "ready");
  assert.ok(result.summary.continuousSelection.targetComponents.includes("supervisor:http://127.0.0.1:8000/pipeline-control-plane/work-packets"));
  assert.equal(result.summary.seedPacket.supervisorIntake, undefined);
});

test("manager source intake cycle bridges a normal BMAD story through the private UDS graph route", async () => {
  const result = await runManagerSourceIntakeCycle([...ELIGIBLE_ARGS, "--dry-run", "--supervisor-uds-path", "/tmp/kendall-supervisor.sock"]);
  assert.equal(result.summary.sourceIntakePlan.endpoint, "private-uds:/tmp/kendall-supervisor.sock/internal/manager-source-intake/work-packets");
  assert.equal(result.summary.sourceIntakePlan.parallelWorkGraphEvidence?.schemaVersion, "parallel-work-graph-evidence/v0");
  assert.doesNotMatch(JSON.stringify(result.summary.sourceIntakePlan.parallelWorkGraphEvidence), /_bmad-output|implementation-artifacts|\.md/i);
});

test("manager source intake cycle plans first and refuses blocked work without fetch", async () => {
  let fetchCalls = 0;
  const args = ELIGIBLE_ARGS.map((value) => value === "doc:docs/workflows/current-session-runbook.md" ? "doc:docs/workflows/not-present.md" : value);
  await assert.rejects(
    runManagerSourceIntakeCycle(args, { fetchImpl: async () => { fetchCalls += 1; } }),
    (error) => {
      assert.ok(error instanceof ManagerSourceIntakeCycleError);
      assert.equal(error.code, "manager_source_intake_cycle_not_eligible");
      assert.equal(error.packet.status, "blocked");
      assert.equal(error.packet.summary.packetState, "blocked");
      assert.equal(error.packet.summary.seedPacket.eligibilityReason, "ambiguous_source");
      assert.equal(error.packet.summary.sourceWorkEligibility.blockedCount, 1);
      assert.equal(error.packet.summary.rawPayloadRetained, false);
      return true;
    },
  );
  assert.equal(fetchCalls, 0);
});

test("manager source intake cycle refuses needs-review and dedupe states without fetch", async (t) => {
  const cases = [
    ["needs_review", {
      sourceArtifacts: [{
        ref: "doc:docs/workflows/current-session-runbook.md",
        ownershipBoundary: "bmad_local_planning_state",
        freshness: "stale",
      }],
    }],
    ["skipped", {
      existingCandidateWorkPackets: [{
        candidateWorkPacketId: "existing-cycle-candidate",
        sourceRefs: ["doc:docs/workflows/current-session-runbook.md"],
        acceptanceCriteria: ["Eligible source metadata reaches supervisor truth."],
        touchedSurfaceHint: "scripts/manager-source-intake-cycle.mjs",
      }],
    }],
  ];
  for (const [packetState, context] of cases) {
    await t.test(packetState, async () => {
      let fetchCalls = 0;
      await assert.rejects(
        runManagerSourceIntakeCycle(ELIGIBLE_ARGS, { ...context, fetchImpl: async () => { fetchCalls += 1; } }),
        (error) => error.code === "manager_source_intake_cycle_not_eligible" && error.packet.summary.packetState === packetState,
      );
      assert.equal(fetchCalls, 0);
    });
  }
});

test("manager source intake cycle invokes the real adapter only after eligibility and preserves exact provenance", async () => {
  let endpoint;
  let request;
  let requestOptions;
  const result = await runManagerSourceIntakeCycle(ELIGIBLE_ARGS, {
    fetchImpl: async (url, options) => {
      endpoint = url;
      requestOptions = options;
      request = JSON.parse(options.body);
      return responseFor(request);
    },
  });

  assert.equal(endpoint, "http://127.0.0.1:8000/pipeline-control-plane/work-packets");
  assert.equal(requestOptions.method, "POST");
  assert.deepEqual(requestOptions.headers, { "content-type": "application/json", "accept": "application/json" });
  assert.equal(requestOptions.redirect, "error");
  assert.deepEqual(Object.keys(request).sort(), [
    "actor", "correlationId", "evidenceRefs", "idempotencyKey", "initialStage", "packetId",
    "payloadSummary", "sourceRef", "status", "title", "truthLabel",
  ].sort());
  assert.equal(result.summary.packetState, "eligible");
  assert.equal(result.summary.seedPacket.eligibilityDecision, "eligible");
  assert.equal(result.summary.sourceArtifactDiscovery.artifacts[0].ref, "doc:docs/workflows/current-session-runbook.md");
  const { supervisorIntake, ...seedProvenance } = result.summary.seedPacket;
  assert.deepEqual(result.summary.sourceWorkEligibility.candidateWorkPackets[0], seedProvenance);
  assert.deepEqual(result.summary.sourceWorkEligibility.sourceArtifactDiscovery, result.summary.sourceArtifactDiscovery);
  assert.equal(supervisorIntake.status, "persisted");
  assert.equal(JSON.stringify(request).includes("Eligible source metadata reaches"), false);
  assert.equal(JSON.stringify(request).includes("node --test"), false);
});

test("manager source intake cycle preserves adapter fail-closed response behavior", async () => {
  await assert.rejects(
    runManagerSourceIntakeCycle(ELIGIBLE_ARGS, {
      fetchImpl: async (_url, options) => responseFor(JSON.parse(options.body), { title: "conflicting title" }),
    }),
    (error) => {
      assert.equal(error.code, "manager_supervisor_source_intake_identity_conflict");
      assert.equal(error.packet.ok, false);
      assert.equal(error.packet.status, "blocked");
      assert.equal(error.packet.summary.packetState, "eligible");
      assert.equal(error.packet.summary.seedPacket.supervisorIntake, undefined);
      assert.equal(error.packet.summary.sourceWorkEligibility.eligibleCount, 1);
      assert.ok(error.packet.blockers.some((blocker) => blocker.code === error.code));
      return true;
    },
  );
});

test("default seed refill cycle and run-loop entrypoints contain no direct intake or fetch trigger", async () => {
  for (const path of [
    "scripts/manager-source-packet-seed.mjs",
    "scripts/manager-refill-plan.mjs",
    "scripts/manager-cycle-packet.mjs",
    "scripts/manager-run-loop.mjs",
  ]) {
    const source = await readFile(path, "utf8");
    assert.equal(source.includes("manager-source-intake-cycle"), false, path);
    assert.equal(source.includes("manager-supervisor-source-intake"), false, path);
    assert.equal(source.includes("intakeManagerSourcePacket"), false, path);
  }
});
