import assert from "node:assert/strict";
import test from "node:test";

import { evaluatePromotionEvidence, nearestRankPercentile } from "../scripts/evaluate-ci-promotion-evidence.mjs";

function sample({ vector = "supervisor", cohort = "ordinary", member, pair, day, status = "passed", failureId = null, wallMs = 100, retryCount = 0, flake = false }) {
  return {
    schemaVersion: 1,
    cohort,
    member,
    pairId: `${vector}-${cohort}-${pair}`,
    recordedAt: `2026-08-${String(day).padStart(2, "0")}T12:00:00.000Z`,
    selectionVector: { id: vector },
    source: { headSha: `head-${pair}`, baseSha: "base", lockfileSha: "lock", environmentId: "ubuntu-latest-node22" },
    cacheControl: { strategy: "isolated", cacheKey: `isolated-${pair}` },
    metrics: { queueMs: 10, setupMs: 20, executionMs: 30, wallMs, firstActionableFailureMs: status === "failed" ? 40 : null },
    outcome: { status, failureId, retryCount, flake },
  };
}

function readyPacket() {
  const samples = [];
  for (const cohort of ["ordinary", "controlled_failure"]) {
    for (let pair = 1; pair <= 20; pair += 1) {
      const day = ((pair - 1) % 5) + 1;
      const status = cohort === "controlled_failure" ? "failed" : "passed";
      const failureId = cohort === "controlled_failure" ? `controlled-${pair}` : null;
      samples.push(sample({ cohort, member: "baseline", pair, day, status, failureId, wallMs: 100 }));
      samples.push(sample({ cohort, member: "proposed", pair, day, status, failureId, wallMs: 100 }));
    }
  }
  return { schemaVersion: 1, selectionVectors: [{ id: "supervisor" }], samples };
}

test("nearest-rank percentiles use the declared policy convention", () => {
  assert.equal(nearestRankPercentile([1, 2, 3, 4], 0.5), 2);
  assert.equal(nearestRankPercentile([1, 2, 3, 4], 0.95), 4);
  assert.equal(nearestRankPercentile([], 0.95), null);
});

test("promotion evidence becomes ready only with complete paired cohorts", () => {
  const result = evaluatePromotionEvidence(readyPacket());
  assert.equal(result.status, "ready");
  assert.equal(result.vectors[0].ordinary.baseline.metrics.wallMs.p95Ms, 100);
  assert.equal(result.vectors[0].controlledFailure.proposed.firstActionableFailureP95Ms, 40);
});

test("promotion evidence rejects missing days, unmatched sources, and slower proposed P95", () => {
  const packet = readyPacket();
  packet.samples.find((entry) => entry.member === "proposed" && entry.cohort === "ordinary" && entry.pairId.endsWith("-1")).source.headSha = "other-head";
  for (const entry of packet.samples.filter((entry) => entry.cohort === "ordinary" && entry.member === "proposed")) entry.metrics.wallMs = 111;
  for (const entry of packet.samples) entry.recordedAt = "2026-08-01T12:00:00.000Z";
  const result = evaluatePromotionEvidence(packet);
  assert.equal(result.status, "not_ready");
  assert.match(result.vectors[0].failures.join("\n"), /immutable source identity/);
  assert.match(result.vectors[0].failures.join("\n"), /requires 5 UTC days/);
  assert.match(result.vectors[0].failures.join("\n"), /wallMs P95 regressed/);
});

test("controlled failures must be detected identically by both routes", () => {
  const packet = readyPacket();
  packet.samples.find((entry) => entry.member === "proposed" && entry.cohort === "controlled_failure" && entry.pairId.endsWith("-1")).outcome.failureId = "different";
  const result = evaluatePromotionEvidence(packet);
  assert.equal(result.status, "not_ready");
  assert.match(result.vectors[0].failures.join("\n"), /same failureId/);
});
