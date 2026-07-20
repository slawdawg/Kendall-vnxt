import assert from "node:assert/strict";
import test from "node:test";

import {
  ManagerSupervisorLocalProofError,
  continueManagerSourcePacketWithLocalProof,
} from "../scripts/lib/manager-control-plane/manager-supervisor-local-proof.mjs";
import {
  parseManagerSourceIntakeLocalProofArgs,
  runManagerSourceIntakeLocalProof,
} from "../scripts/manager-source-intake-local-proof.mjs";

const ARGS = [
  "--run-id", "manager-local-proof-test",
  "--candidate-id", "manager-local-proof-candidate",
  "--title", "Gate 4 manager worker result loop",
  "--source-ref", "doc:docs/workflows/current-session-runbook.md",
  "--acceptance-criterion", "Supervisor owns the local worker result.",
  "--verification-target", "node --test tests/manager-source-intake-local-proof.test.mjs",
  "--touched-surface", "scripts/manager-source-intake-local-proof.mjs",
  "--risk-class", "low",
  "--authority-class", "allowed_unattended",
  "--supervisor-url", "http://127.0.0.1:8000",
  "--local-proof-idempotency-key", "manager-local-proof-result-1",
  "--local-proof-correlation-id", "manager-local-proof-correlation-1",
];

function intakeResponse(request) {
  const event = {
    eventId: "manager-intake-event-1", packetId: request.packetId, schemaVersion: 1, eventType: "packet.created",
    previousStage: null, targetStage: request.initialStage, status: request.status, truthLabel: request.truthLabel,
    sourceRef: request.sourceRef, actor: request.actor, occurredAt: "2026-07-12T15:00:00.000Z",
    correlationId: request.correlationId, causationId: null, idempotencyKey: request.idempotencyKey,
    payloadSummary: request.payloadSummary, evidenceRefs: request.evidenceRefs, metadataOnly: true,
  };
  return { ok: true, status: 200, json: async () => ({ data: {
    packetId: request.packetId, title: request.title, currentStage: request.initialStage, status: request.status,
    truthLabel: request.truthLabel, sourceRef: request.sourceRef, createdAt: event.occurredAt, updatedAt: event.occurredAt,
    currentEventId: event.eventId, history: [event], metadataOnly: true,
  } }) };
}

test("manager local-proof continuation follows persisted intake through the canonical loopback worker-result route", async () => {
  const calls = [];
  const result = await runManagerSourceIntakeLocalProof(ARGS, {
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push({ url, options, body });
      if (url.endsWith("/work-packets")) return intakeResponse(body);
      return { ok: true, status: 200, json: async () => ({ data: {
        evidenceLevel: "integrated_local", metadataOnly: true, rawPayloadRetained: false,
        correlationId: body.correlationId, scenario: "happy",
        workItem: { id: "server-owned-work-item" },
        attempt: { attemptId: "server-owned-attempt", status: "completed" },
        queueLease: { leaseId: "server-owned-lease", fencingToken: 2 },
        authoritativePacket: { packetId: calls[0].body.packetId, metadataOnly: true },
      } }) };
    },
  });

  assert.equal(calls.length, 2);
  assert.match(calls[1].url, new RegExp(`/work-packets/${calls[0].body.packetId}/local-proof$`));
  assert.equal(calls[1].options.method, "POST");
  assert.deepEqual(Object.keys(calls[1].body).sort(), ["actorId", "actorLabel", "correlationId", "idempotencyKey", "proofMode", "scenario"]);
  assert.equal(calls[1].body.proofMode, "integrated_local");
  assert.equal(result.summary.seedPacket.supervisorIntake.packetId, calls[0].body.packetId);
  assert.deepEqual(result.summary.workerResultLocalProof, {
    status: "persisted", packetId: calls[0].body.packetId, workItemId: "server-owned-work-item",
    attemptId: "server-owned-attempt", attemptStatus: "completed", leaseId: "server-owned-lease",
    fencingToken: 2, evidenceRef: "evidence:local-proof:manager-local-proof-result-1",
    correlationId: "manager-local-proof-correlation-1", metadataOnly: true, rawPayloadRetained: false,
  });
});

test("manager local-proof continuation requires persisted intake and remains explicit", async () => {
  assert.throws(() => parseManagerSourceIntakeLocalProofArgs(ARGS.filter((value) => value !== "manager-local-proof-result-1" && value !== "--local-proof-idempotency-key")), /idempotency/);
  assert.throws(() => parseManagerSourceIntakeLocalProofArgs([...ARGS, "--dry-run"]), /persisted apply/);
  await assert.rejects(
    continueManagerSourcePacketWithLocalProof({ summary: { seedPacket: { supervisorIntake: { status: "persisted", packetId: "manager-packet", metadataOnly: true, rawPayloadRetained: false } } } }, "http://127.0.0.1:8000", { idempotencyKey: "result", correlationId: "a".repeat(81) }),
    (error) => error instanceof ManagerSupervisorLocalProofError && error.code === "manager_supervisor_local_proof_input_invalid",
  );
  await assert.rejects(
    continueManagerSourcePacketWithLocalProof({ summary: { seedPacket: {} } }, "http://127.0.0.1:8000", { idempotencyKey: "result" }),
    (error) => error instanceof ManagerSupervisorLocalProofError && error.code === "manager_supervisor_local_proof_input_invalid" && error.packet.status === "blocked",
  );
  await assert.rejects(
    continueManagerSourcePacketWithLocalProof(
      { summary: { seedPacket: { supervisorIntake: { status: "persisted", packetId: "manager-packet", metadataOnly: true, rawPayloadRetained: false } } } },
      "http://127.0.0.1:8000",
      { idempotencyKey: "result" },
      { timeoutMs: 0, fetchImpl: async () => { throw new Error("fetch must not run"); } },
    ),
    (error) => error instanceof ManagerSupervisorLocalProofError && error.code === "manager_supervisor_local_proof_network_error" && /timeoutMs must be an integer from 1 through/.test(error.cause?.message ?? ""),
  );
});
