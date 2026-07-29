import assert from "node:assert/strict";
import test from "node:test";
import {
  buildManagerLaneClarityHandoffRequest,
  deriveManagerLaneClarityHandoffId,
  resolveLoopbackLaneClarityHandoffEndpoint,
  syncManagerSupervisorLaneClarity,
} from "../scripts/manager-supervisor-lane-clarity-sync.mjs";
import {
  MANAGER_LANE_CLARITY_HANDOFF_API_ENVELOPE_FIELDS,
  MANAGER_LANE_CLARITY_HANDOFF_REQUEST_FIELDS,
  MANAGER_LANE_CLARITY_HANDOFF_VIEW_FIELDS,
} from "../scripts/lib/manager-control-plane/lane-clarity-handoff-contract.mjs";

const clarity = {
  schemaVersion: "manager-lane-clarity/v0", runId: "run:1", eventWatermark: "event:1", sourceCursor: "cursor:1",
  goal: { summary: "Keep one bounded handoff.", sourceRef: "requirement:handoff" },
  criteria: [{ criterionId: "criterion:1", summary: "Binding is coherent.", disposition: "met", evidenceRefs: ["evidence:1"] }],
  canonicalState: { phase: "running", freshness: "fresh", evidenceFreshness: "fresh" },
  nextGate: { summary: "Verify receipt.", nextSafeAction: "verify_handoff" },
  posture: { state: "on_scope", reason: "Current metadata is coherent.", nextSafeAction: "continue", decisionRef: null, qualification: null },
  metadataOnly: true, rawPayloadRetained: false,
};

function context() {
  return { selectedLaneId: "lane:1", sourceSequence: 1, observedAt: "2026-07-29T00:00:00.000Z", idempotencyKey: "handoff:lane:1:1", timeoutMs: 1_000 };
}

test("lane clarity handoff binds one manager snapshot and uses loopback only", () => {
  assert.deepEqual(MANAGER_LANE_CLARITY_HANDOFF_REQUEST_FIELDS, ["schemaVersion", "handoffId", "selectedLaneId", "runId", "eventWatermark", "sourceCursor", "sourceSequence", "observedAt", "laneClarity", "idempotencyKey", "metadataOnly", "rawPayloadRetained"]);
  assert.deepEqual(MANAGER_LANE_CLARITY_HANDOFF_VIEW_FIELDS, [...MANAGER_LANE_CLARITY_HANDOFF_REQUEST_FIELDS, "owner", "createdAt"]);
  assert.deepEqual(MANAGER_LANE_CLARITY_HANDOFF_API_ENVELOPE_FIELDS, ["data", "meta"]);
  const request = buildManagerLaneClarityHandoffRequest({ laneClarity: clarity }, context());
  assert.equal(request.handoffId, deriveManagerLaneClarityHandoffId(context().idempotencyKey));
  assert.equal(request.runId, clarity.runId);
  assert.equal(request.laneClarity.sourceCursor, request.sourceCursor);
  assert.equal(resolveLoopbackLaneClarityHandoffEndpoint("http://127.0.0.1:8100"), "http://127.0.0.1:8100/manager-control-plane/lane-clarity-handoffs");
  assert.throws(() => resolveLoopbackLaneClarityHandoffEndpoint("https://example.com"));
  assert.throws(() => buildManagerLaneClarityHandoffRequest({ laneClarity: clarity }, { ...context(), sourceSequence: 0 }));
});

test("lane clarity handoff requires exact persisted readback", async () => {
  const request = buildManagerLaneClarityHandoffRequest({ laneClarity: clarity }, context());
  const fetchImpl = async (url, options) => ({ ok: true, status: 200, json: async () => ({ data: { ...request, owner: "supervisor", createdAt: "2026-07-29T00:00:01.000Z" } }) });
  const receipt = await syncManagerSupervisorLaneClarity({ laneClarity: clarity }, "http://localhost:8100", { ...context(), fetchImpl });
  assert.equal(receipt.owner, "supervisor");
});
