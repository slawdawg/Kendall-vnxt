import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import test from "node:test";

import { partitionWorkPacketNodeIds, waitForWorkPacketPartition, WORK_PACKET_COLLECTION_TIMEOUT_MS } from "../scripts/run-work-packets-partition.mjs";

const nodeIds = Array.from({ length: 118 }, (_, index) => `tests/integration/test_work_packets.py::test_${index + 1}`);

test("work-packets partitions are deterministic, disjoint, and retain every collected test", () => {
  const partitions = [0, 1, 2, 3].map((index) => partitionWorkPacketNodeIds(nodeIds, index, 4));
  assert.deepEqual(partitions.map((partition) => partition.length), [30, 30, 29, 29]);
  assert.deepEqual(partitions.flat().sort(), [...nodeIds].sort());
  assert.equal(new Set(partitions.flat()).size, nodeIds.length);
});

test("work-packets partition rejects an invalid allocation or a different test source", () => {
  assert.throws(() => partitionWorkPacketNodeIds(nodeIds, 4, 4), /zero-based index/);
  assert.throws(() => partitionWorkPacketNodeIds(nodeIds.slice(0, 3), 3, 4), /selected no tests/);
  assert.throws(() => partitionWorkPacketNodeIds(["tests/integration/test_other.py::test_x"], 0, 4), /fixed work-packets/);
});

test("work-packets collection and child launch are bounded and fail closed", async () => {
  assert.equal(WORK_PACKET_COLLECTION_TIMEOUT_MS, 30_000);
  const spawnFailure = new EventEmitter();
  const failure = waitForWorkPacketPartition(spawnFailure);
  spawnFailure.emit("error", new Error("spawn denied"));
  assert.equal(await failure, 1);

  const exit = new EventEmitter();
  const success = waitForWorkPacketPartition(exit);
  exit.emit("exit", 0);
  assert.equal(await success, 0);
});

test("work-packets partition guard is selected by the required fast CI profile", () => {
  const fastWorkflow = readFileSync("scripts/run-fast-workflow-checks.mjs", "utf8");
  const packageScripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  assert.equal(packageScripts["test:work-packets-partition"], "node --test tests/work-packets-partition.test.mjs");
  assert.match(fastWorkflow, /"test:work-packets-partition"/);
});
