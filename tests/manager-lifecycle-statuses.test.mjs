import assert from "node:assert/strict";
import test from "node:test";

import { buildManagerExecutionLaneSummary, WORK_STATUSES } from "../scripts/lib/manager-control-plane/summary-projection.mjs";
import { createMemoryDispatcherAdapter } from "../scripts/lib/manager-control-plane/adapters/memory-dispatcher-adapter.mjs";
import { loadManagerFixture } from "./helpers/manager-control-plane/fixture-loader.mjs";
import { loadWorkflowCoreManagerControlPlane } from "./helpers/manager-control-plane/workflow-core-loader.mjs";

test("manager JavaScript consumers share the canonical work-item lifecycle status set", async () => {
  assert.deepEqual(WORK_STATUSES, [
    "eligible",
    "queued",
    "leased",
    "running",
    "refilling",
    "completed",
    "failed",
    "expired",
    "quarantined",
    "blocked",
    "closed",
  ]);
  assert.equal(Object.isFrozen(WORK_STATUSES), true);
  const summary = buildManagerExecutionLaneSummary({
    runId: "lifecycle-status-source-test",
    clock: {
      nowEpochMs: () => Date.parse("2026-07-20T01:00:00.000Z"),
      nowIso: () => "2026-07-20T01:00:00.000Z",
    },
    workItems: WORK_STATUSES.map((status, index) => ({
      workItemId: `work-${index}`,
      status,
      evidenceRefs: [`evidence:work-${index}`],
    })),
    events: [],
  });

  for (const status of WORK_STATUSES) {
    assert.equal(summary.stateCounts[status], 1, `summary count for ${status}`);
  }

  const lifecycle = await loadWorkflowCoreManagerControlPlane();
  const fixture = await loadManagerFixture("happy-path.json");
  const adapter = createMemoryDispatcherAdapter({
    lifecycle,
    clock: lifecycle.createManualClock("2026-07-20T01:00:00.000Z"),
    runId: "lifecycle-status-source-test",
  });
  const refill = await adapter.refill({
    candidates: [fixture.candidate],
    evidenceRefs: ["evidence:lifecycle-status-source"],
    policyReason: "shared lifecycle status source regression",
  });
  assert.equal(refill.ok, true);
  assert.equal(refill.value.queuedWorkItems[0].status, "queued");
});
