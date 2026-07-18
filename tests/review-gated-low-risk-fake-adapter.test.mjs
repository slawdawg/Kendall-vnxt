import assert from "node:assert/strict";
import test from "node:test";

import {
  FAKE_REVIEW_SCENARIOS,
  buildFakeReviewInput,
  runFakeReviewScenario,
} from "../scripts/lib/review-gated-low-risk-fake-adapter.mjs";

test("fake adapter is deterministic and report-only", () => {
  const first = runFakeReviewScenario("PASS");
  const second = runFakeReviewScenario("PASS");

  assert.deepEqual(first, second);
  assert.equal(first.status, "eligible");
  assert.equal(first.authorityDecision.allowed, false);
  assert.equal(first.mode, "report-only");
  assert.equal(first.metadataOnly, true);
});

test("fake adapter covers synthetic PASS, review outcomes, and every fail-closed guard scenario", () => {
  const expected = new Map([
    ["PASS", "eligible"],
    ["CONCERNS", "hold"],
    ["BLOCKED", "hold"],
    ["STALE", "hold"],
    ["MISMATCH", "hold"],
    ["FORBIDDEN_METADATA", "hold"],
    ["MODEL_ROUTE", "hold"],
    ["HIGH_RISK", "hold"],
    ["STOP_LINE", "hold"],
    ["ROLLBACK", "hold"],
  ]);

  assert.deepEqual([...expected.keys()], FAKE_REVIEW_SCENARIOS);
  for (const [scenario, status] of expected) {
    const packet = runFakeReviewScenario(scenario);
    assert.equal(packet.status, status, scenario);
    assert.equal(packet.authorityDecision.allowed, false, scenario);
    assert.equal(packet.metadataOnly, true, scenario);
    assert.equal(packet.rawPayloadRetained, false, scenario);
  }
});

test("fake adapter rejects unknown scenarios without side effects", () => {
  assert.throws(() => buildFakeReviewInput("LIVE_PROVIDER"), /Unknown fake review scenario/);
  assert.throws(() => buildFakeReviewInput("rawPrompt=secret"), (error) => {
    assert.equal(error.message, "Unknown fake review scenario");
    return true;
  });
});

test("fake adapter remains synthetic when the evaluation timestamp changes", () => {
  const packet = runFakeReviewScenario("PASS", { now: "2026-07-17T12:05:00.000Z" });

  assert.equal(packet.status, "eligible");
  assert.equal(packet.review.reviewedAt, "2026-07-17T12:05:00.000Z");
  assert.match(packet.binding.headSha, /^fake-/);

  assert.doesNotThrow(() => runFakeReviewScenario("PASS", null));
  const invalidTimestamp = runFakeReviewScenario("PASS", { now: "" });
  assert.equal(invalidTimestamp.status, "hold");
});
