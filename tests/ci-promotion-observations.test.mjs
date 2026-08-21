import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { collectCiPromotionObservations, parseObservationArgs } from "../scripts/collect-ci-promotion-observations.mjs";

const source = { headSha: "head", baseSha: "base", lockfileSha: "lock", environmentId: "ubuntu" };

function commandRecord(route, selectionVector, executionMs) {
  return { schemaVersion: 1, recordType: "ci-command-evidence", route, selectionVector, source, metrics: { executionMs }, outcome: { status: "passed" } };
}

test("promotion observation aggregates the proposed critical path and retains source binding", () => {
  const directory = mkdtempSync(join(tmpdir(), "ci-promotion-observations-"));
  writeFileSync(join(directory, "baseline.json"), JSON.stringify(commandRecord("baseline", { id: "supervisor-elevated", shape: "aggregate" }, 800)));
  writeFileSync(join(directory, "shard-a.json"), JSON.stringify(commandRecord("proposed", { id: "supervisor-elevated", shard: "a" }, 100)));
  writeFileSync(join(directory, "shard-b.json"), JSON.stringify(commandRecord("proposed", { id: "supervisor-elevated", shard: "b" }, 250)));
  const observation = collectCiPromotionObservations({ reportsDir: directory, pairId: "run-1", source, generatedAt: "2026-08-21T00:00:00.000Z" });
  assert.equal(observation.vectors.length, 1);
  assert.equal(observation.vectors[0].id, "supervisor-elevated");
  assert.equal(observation.vectors[0].baseline.executionMs, 800);
  assert.equal(observation.vectors[0].proposed.executionMs, 250);
  assert.equal(observation.vectors[0].sourceMatched, true);
  assert.equal(observation.vectors[0].readyForPromotion, false);
  assert.equal(observation.cohort, "ordinary");
});

test("promotion observations retain a controlled-failure cohort", () => {
  const directory = mkdtempSync(join(tmpdir(), "ci-promotion-controlled-"));
  writeFileSync(
    join(directory, "baseline.json"),
    JSON.stringify(commandRecord("baseline", { id: "supervisor-elevated", shape: "aggregate" }, 800)),
  );
  const observation = collectCiPromotionObservations({ reportsDir: directory, pairId: "run-controlled", source, cohort: "controlled_failure" });
  assert.equal(observation.cohort, "controlled_failure");
});

test("promotion observation parser requires a complete source identity", () => {
  assert.throws(() => parseObservationArgs(["--reports-dir", "reports"]), /Missing --out/);
  assert.throws(
    () => parseObservationArgs(["--reports-dir", "reports", "--out", "out", "--pair-id", "pair", "--head-sha", "head", "--base-sha", "base", "--lockfile-sha", "lock", "--environment-id", "ubuntu", "--cohort", "bad"]),
    /--cohort/,
  );
});
