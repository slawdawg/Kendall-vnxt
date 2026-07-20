import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildManagerExecutionLaneSummary, WORK_STATUSES } from "../scripts/lib/manager-control-plane/summary-projection.mjs";

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

  const adapterSource = await readFile(new URL("../scripts/lib/manager-control-plane/adapters/memory-dispatcher-adapter.mjs", import.meta.url), "utf8");
  assert.match(adapterSource, /import .*WORK_STATUSES.* from "\.\.\/summary-projection\.mjs"/);
  assert.doesNotMatch(adapterSource, /const WORK_STATUSES = \[/);
});
