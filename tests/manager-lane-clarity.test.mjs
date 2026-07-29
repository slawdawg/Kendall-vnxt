import assert from "node:assert/strict";
import test from "node:test";
import { buildManagerExecutionLaneSummary } from "../scripts/lib/manager-control-plane/summary-projection.mjs";

const clock = { nowEpochMs: () => Date.parse("2026-07-29T00:00:00.000Z"), nowIso: () => "2026-07-29T00:00:00.000Z" };

function candidate({ eventWatermark, sourceCursor, runId = "run-1" }) {
  return {
    runId,
    eventWatermark,
    sourceCursor,
    goal: { summary: "Keep the production projection truthful.", sourceRef: "requirement:lane-clarity" },
    criteria: [{ criterionId: "projection-carrier", summary: "Carrier is coherent.", disposition: "in_progress", evidenceRefs: ["evidence:lane-clarity"] }],
    nextGate: { summary: "Verify the typed carrier.", nextSafeAction: "run_lane_clarity_contract_tests" },
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

const laneEvidence = ["evidence:lane-clarity"];

test("lane clarity emits on_scope only for a coherent fresh metadata record", () => {
  const summary = buildManagerExecutionLaneSummary({
    runId: "run-1",
    clock,
    events: [{ eventId: "event-progress", eventName: "dispatcher.progress.observed", occurredAt: "2026-07-29T00:00:00.000Z", evidenceRefs: [] }],
    summaryEvent: { eventId: "event-summary" },
    fallbackEvidenceRefs: laneEvidence,
    laneClarity: candidate({ eventWatermark: "event-summary", sourceCursor: "1" }),
  });
  assert.equal(summary.laneClarity.posture.state, "on_scope");
  assert.equal(summary.laneClarity.rawPayloadRetained, false);
});

test("lane clarity emits pivot_required only for the current structured pivot decision", () => {
  const pivot = {
    eventId: "event-pivot",
    eventName: "scope_pivot_required",
    runId: "run-1",
    occurredAt: "2026-07-29T00:00:00.000Z",
    evidenceRefs: ["evidence:pivot"],
    scopePivotDecision: {
      qualification: "second_qualified_recovery_detour",
      eventWatermark: "event-summary",
      decisionRef: "decision:pivot-1",
      reason: "Two qualified recovery detours were recorded.",
      sourceRefs: ["requirement:lane-clarity"],
      nextSafeAction: "review_scope_pivot",
      rawPayloadRetained: false,
    },
  };
  const summary = buildManagerExecutionLaneSummary({
    runId: "run-1",
    clock,
    events: [pivot],
    summaryEvent: { eventId: "event-summary" },
    fallbackEvidenceRefs: laneEvidence,
    laneClarity: candidate({ eventWatermark: "event-summary", sourceCursor: "1" }),
  });
  assert.equal(summary.laneClarity.posture.state, "pivot_required");
  assert.equal(summary.laneClarity.posture.decisionRef, "decision:pivot-1");
});

test("lane clarity fails closed when source metadata is missing or incoherent", () => {
  const summary = buildManagerExecutionLaneSummary({ runId: "run-1", clock, summaryEvent: { eventId: "event-summary" } });
  assert.equal(summary.laneClarity.posture.state, "not_assessed");
  assert.match(summary.laneClarity.posture.reason, /lane_clarity_missing/);
});

test("lane clarity ignores a stale pivot decision", () => {
  const pivot = {
    eventId: "event-pivot",
    eventName: "scope_pivot_required",
    runId: "run-1",
    occurredAt: "2026-07-29T00:00:00.000Z",
    evidenceRefs: ["evidence:pivot"],
    scopePivotDecision: {
      qualification: "operator_drift_concern",
      eventWatermark: "event-old-summary",
      decisionRef: "decision:pivot-1",
      reason: "The source is no longer tied to the current summary.",
      sourceRefs: ["requirement:lane-clarity"],
      nextSafeAction: "review_scope_pivot",
      rawPayloadRetained: false,
    },
  };
  const summary = buildManagerExecutionLaneSummary({
    runId: "run-1",
    clock,
    events: [pivot],
    summaryEvent: { eventId: "event-summary" },
    fallbackEvidenceRefs: laneEvidence,
    laneClarity: candidate({ eventWatermark: "event-summary", sourceCursor: "1" }),
  });
  assert.equal(summary.laneClarity.posture.state, "on_scope");
});

test("lane clarity fails closed for cross-run and stale metadata", () => {
  const current = {
    eventId: "event-current",
    eventName: "dispatcher.progress.observed",
    runId: "run-1",
    occurredAt: "2026-07-29T00:00:00.000Z",
    evidenceRefs: ["evidence:current"],
  };
  const crossRun = buildManagerExecutionLaneSummary({
    runId: "run-1",
    clock,
    events: [current],
    summaryEvent: { eventId: "event-summary" },
    fallbackEvidenceRefs: laneEvidence,
    laneClarity: candidate({ runId: "run-2", eventWatermark: "event-summary", sourceCursor: "1" }),
  });
  assert.equal(crossRun.laneClarity.posture.state, "not_assessed");

  const stale = buildManagerExecutionLaneSummary({
    runId: "run-1",
    clock,
    events: [{ ...current, occurredAt: "2026-07-28T00:00:00.000Z" }],
    summaryEvent: { eventId: "event-summary" },
    fallbackEvidenceRefs: laneEvidence,
    laneClarity: candidate({ eventWatermark: "event-summary", sourceCursor: "1" }),
  });
  assert.equal(stale.laneClarity.posture.state, "not_assessed");
  assert.match(stale.laneClarity.posture.reason, /incoherent_or_stale/);
});

test("lane clarity fails closed rather than retaining unsafe metadata", () => {
  const unsafe = candidate({ eventWatermark: "event-summary", sourceCursor: "1" });
  unsafe.goal.summary = "api_key=not-retained";
  const summary = buildManagerExecutionLaneSummary({
    runId: "run-1",
    clock,
    events: [{ eventId: "event-current", eventName: "dispatcher.progress.observed", occurredAt: "2026-07-29T00:00:00.000Z", evidenceRefs: ["evidence:current"] }],
    summaryEvent: { eventId: "event-summary" },
    fallbackEvidenceRefs: laneEvidence,
    laneClarity: unsafe,
  });
  assert.equal(summary.laneClarity.posture.state, "not_assessed");
  assert.match(summary.laneClarity.posture.reason, /incoherent_or_stale/);
});

test("lane clarity projects only validated fields and bounded current evidence", () => {
  const source = candidate({ eventWatermark: "event-summary", sourceCursor: "1" });
  source.goal.rawProviderPayload = "not-retained";
  source.criteria[0].secret = "not-retained";
  source.nextGate.retainedPayload = "not-retained";
  const summary = buildManagerExecutionLaneSummary({
    runId: "run-1", clock,
    events: [{ eventId: "event-current", eventName: "dispatcher.progress.observed", occurredAt: "2026-07-29T00:00:00.000Z", evidenceRefs: [] }],
    summaryEvent: { eventId: "event-summary" }, fallbackEvidenceRefs: laneEvidence, laneClarity: source,
  });
  assert.equal(summary.laneClarity.posture.state, "on_scope");
  assert.deepEqual(summary.laneClarity.goal, { summary: "Keep the production projection truthful.", sourceRef: "requirement:lane-clarity" });
  assert.equal("secret" in summary.laneClarity.criteria[0], false);
  assert.equal("retainedPayload" in summary.laneClarity.nextGate, false);
});

test("lane clarity ignores stale pivots and rejects unbound or oversized evidence", () => {
  const source = candidate({ eventWatermark: "event-summary", sourceCursor: "2" });
  const stalePivot = { eventId: "old", eventName: "scope_pivot_required", runId: "run-1", evidenceRefs: ["evidence:lane-clarity"], scopePivotDecision: { qualification: "operator_drift_concern", eventWatermark: "old", decisionRef: "decision:old", reason: "Old decision.", sourceRefs: ["source:old"], nextSafeAction: "review", rawPayloadRetained: false } };
  const current = { eventId: "event-current", eventName: "dispatcher.progress.observed", occurredAt: "2026-07-29T00:00:00.000Z", evidenceRefs: [] };
  const onScope = buildManagerExecutionLaneSummary({ runId: "run-1", clock, events: [stalePivot, current], summaryEvent: { eventId: "event-summary" }, fallbackEvidenceRefs: laneEvidence, laneClarity: source });
  assert.equal(onScope.laneClarity.posture.state, "on_scope");
  source.criteria[0].evidenceRefs = ["evidence:unbound"];
  const unbound = buildManagerExecutionLaneSummary({ runId: "run-1", clock, events: [stalePivot, current], summaryEvent: { eventId: "event-summary" }, fallbackEvidenceRefs: laneEvidence, laneClarity: source });
  assert.equal(unbound.laneClarity.posture.state, "not_assessed");
  source.criteria = Array.from({ length: 25 }, (_, index) => ({ criterionId: `criterion:${index}`, summary: "Bounded criterion.", disposition: "met", evidenceRefs: laneEvidence }));
  const oversized = buildManagerExecutionLaneSummary({ runId: "run-1", clock, events: [stalePivot, current], summaryEvent: { eventId: "event-summary" }, fallbackEvidenceRefs: laneEvidence, laneClarity: source });
  assert.equal(oversized.laneClarity.posture.state, "not_assessed");
});
