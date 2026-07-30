import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runnerPath = new URL("../scripts/lane-clarity-live-dogfood.mjs", import.meta.url);
const runbookPath = new URL("../docs/workflows/lane-clarity-live-dogfood.md", import.meta.url);

test("live Lane Clarity dogfood runner keeps one normal manager cycle and real cross-consumer proof", async () => {
  const source = await readFile(runnerPath, "utf8");
  for (const token of [
    "runManagerRunLoop",
    "laneClaritySupervisorUrl",
    "lane-clarity-handoffs",
    "/pipeline-control-plane/projection",
    "activeManagerLaneClarity",
    "chromium",
    "webkit",
    "Lane Clarity",
    "coherent_lane_clarity_unavailable",
  ]) {
    assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(source, /dashboardPort\s*=\s*3102/);
  assert.doesNotMatch(source, /localhost:3001|localhost:3002/);
  assert.doesNotMatch(source, /kendallLog/);
});

test("live Lane Clarity runbook distinguishes main cockpit and isolated lane verification ports", async () => {
  const runbook = await readFile(runbookPath, "utf8");
  assert.match(runbook, /3000/);
  assert.match(runbook, /3102/);
  assert.match(runbook, /WebKit approximation/i);
  assert.match(runbook, /fail-closed/i);
  assert.match(runbook, /no provider|provider.*disabled/i);
});
