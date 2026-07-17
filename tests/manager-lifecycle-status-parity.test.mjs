import test from "node:test";
import assert from "node:assert/strict";
import { checkManagerLifecycleStatusParity } from "../scripts/check-manager-lifecycle-status-parity.mjs";

test("manager lifecycle statuses remain in parity across TypeScript, projection, workflow, and Python contracts", async () => {
  const summary = await checkManagerLifecycleStatusParity();
  assert.equal(summary.status, "PASS");
  assert.deepEqual(summary.parity, {
    summaryProjection: true,
    workflowTransitions: true,
    pythonDomain: true,
    pythonApi: true,
  });
});
