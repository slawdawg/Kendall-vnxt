import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTROLS_READ_CONCURRENCY,
  ControlsReadFailure,
  runBoundedControlsReads,
} from "../src/lib/controls-read-scheduler.mjs";

test("loads the complete fixed Controls manifest with bounded concurrency", async () => {
  let active = 0;
  let observedPeak = 0;
  const tasks = Array.from({ length: 34 }, (_, index) => ({
    alias: `Report ${index + 1}`,
    read: async () => {
      active += 1;
      observedPeak = Math.max(observedPeak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return index;
    },
  }));

  assert.deepEqual(await runBoundedControlsReads(tasks), Array.from({ length: 34 }, (_, index) => index));
  assert.ok(observedPeak <= CONTROLS_READ_CONCURRENCY);
});

test("fails closed with only a fixed alias and sanitized timeout category", async () => {
  let failure;
  try {
    await runBoundedControlsReads([
      { alias: "Supervisor status", read: async () => ({ mode: "running" }) },
      { alias: "Runtime evidence", read: async () => { throw new Error("Request timed out for /supervisor/runtime-evidence-review-report?token=secret"); } },
    ]);
  } catch (error) {
    failure = error;
  }

  assert.ok(failure instanceof ControlsReadFailure);
  assert.equal(failure.alias, "Runtime evidence");
  assert.equal(failure.category, "timeout");
  assert.equal(failure.message, "Controls data is unavailable: Runtime evidence timed out.");
  assert.doesNotMatch(failure.message, /supervisor|token|secret|\?/i);
});

test("classifies rejected and malformed fixed reads without forwarding upstream text", async () => {
  for (const [error, category] of [
    [new Error("Request failed for /supervisor/report-catalog (503)"), "http"],
    [new Error("Malformed response for /supervisor/report-catalog"), "malformed"],
    [new Error("certificate CN=private-key provider payload"), "unavailable"],
  ]) {
    let failure;
    try {
      await runBoundedControlsReads([{ alias: "Report catalog", read: async () => { throw error; } }]);
    } catch (reason) {
      failure = reason;
    }
    assert.ok(failure instanceof ControlsReadFailure);
    assert.equal(failure.alias, "Report catalog");
    assert.equal(failure.category, category);
    assert.doesNotMatch(failure.message, /supervisor|private-key|provider|payload/i);
  }
});
