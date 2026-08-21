import assert from "node:assert/strict";
import test from "node:test";

import { buildPromotionEvidencePacket } from "../scripts/build-ci-promotion-evidence-packet.mjs";

const source = { headSha: "head", baseSha: "base", lockfileSha: "lock", environmentId: "ubuntu" };
const route = (status = "passed") => ({
  status,
  metrics: { queueMs: 10, setupMs: 20, executionMs: 30, wallMs: 40 },
  outcome: { status, failureId: status === "failed" ? "injected" : null, retryCount: 0, flake: false },
  firstActionableFailureMs: status === "failed" ? 30 : null,
});

test("builds evaluator samples from complete source-bound observations", () => {
  const packet = buildPromotionEvidencePacket([{
    schemaVersion: 1,
    recordType: "ci-promotion-observation",
    cohort: "ordinary",
    pairId: "pair-1",
    generatedAt: "2026-08-21T00:00:00.000Z",
    source,
    cacheControl: { strategy: "isolated", cacheKey: "pair-1" },
    vectors: [{ id: "supervisor-elevated", sourceMatched: true, baseline: route(), proposed: route() }],
  }]);
  assert.deepEqual(packet.selectionVectors, [{ id: "supervisor-elevated" }]);
  assert.equal(packet.samples.length, 2);
  assert.equal(packet.samples[0].metrics.wallMs, 40);
  assert.equal(packet.warnings.length, 0);
});

test("rejects incomplete observations instead of inventing timing metrics", () => {
  const packet = buildPromotionEvidencePacket([{
    schemaVersion: 1,
    recordType: "ci-promotion-observation",
    cohort: "ordinary",
    pairId: "pair-1",
    generatedAt: "2026-08-21T00:00:00.000Z",
    source,
    cacheControl: { strategy: "observed" },
    vectors: [{ id: "supervisor-elevated", sourceMatched: true, baseline: route(), proposed: { ...route(), metrics: { queueMs: null } } }],
  }]);
  assert.equal(packet.samples.length, 0);
  assert.match(packet.warnings.join("\n"), /incomplete timing/);
});
