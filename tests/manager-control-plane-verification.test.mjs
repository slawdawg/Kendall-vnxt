import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  classifyManagerVerificationOutput,
  parseManagerShardTimeout,
  resolveManagerVerificationRoute,
  resolveManagerShardJobs,
  terminateManagerShardProcessGroup,
} from "../scripts/lib/manager-control-plane-verification.mjs";

test("empty manager verification output is inconclusive", () => {
  assert.deepEqual(classifyManagerVerificationOutput({ status: 0, stdout: "", stderr: "" }), {
    status: "inconclusive",
    reason: "empty-output",
    output: "",
  });
});

test("TAP header only manager verification output is inconclusive", () => {
  assert.equal(
    classifyManagerVerificationOutput({ status: 0, stdout: "TAP version 13\n" }).reason,
    "tap-header-only",
  );
});

test("timed out manager verification output is inconclusive", () => {
  assert.equal(
    classifyManagerVerificationOutput({ status: 0, stdout: "TAP version 13\n", timedOut: true }).reason,
    "timeout",
  );
});

test("serial shard routing fails closed for inconclusive results", () => {
  const route = resolveManagerVerificationRoute([{ status: "inconclusive", reason: "empty-output" }]);
  assert.deepEqual(route, {
    status: "inconclusive",
    route: "serial-shards",
    failClosed: true,
    failed: [],
    inconclusive: [{ status: "inconclusive", reason: "empty-output" }],
  });
});

test("test summary is required for a pass", () => {
  assert.equal(
    classifyManagerVerificationOutput({ status: 0, stdout: "# Subtest: one\nok 1 - one\nℹ tests 1\nℹ pass 1\n" }).status,
    "passed",
  );
});

test("file-level no-match summaries are inconclusive", () => {
  assert.equal(
    classifyManagerVerificationOutput({
      status: 0,
      stdout: "✔ tests/manager-control-plane.test.mjs\nℹ tests 1\nℹ pass 1\n",
    }).reason,
    "missing-test-evidence",
  );
});

test("invalid shard timeout configuration fails before child spawn", () => {
  for (const value of ["NaN", "0", "-1", "1.5", "Infinity", ""]) {
    assert.throws(() => parseManagerShardTimeout(value), /MANAGER_TEST_SHARD_TIMEOUT_MS must be a finite positive integer/);
  }
});

test("direct shard routing defaults to one serial job", () => {
  assert.equal(resolveManagerShardJobs(undefined), 1);
  assert.equal(resolveManagerShardJobs(""), 1);
});

test("reporter summary without selected test evidence is inconclusive", () => {
  assert.equal(
    classifyManagerVerificationOutput({ status: 0, stdout: "ℹ tests 1\nℹ pass 1\n" }).reason,
    "missing-test-evidence",
  );
});

test("process-group termination delivers a signal without requiring immediate reaping", async () => {
  const stateRoot = mkdtempSync(join(tmpdir(), "manager-verification-process-group-"));
  const terminationPath = join(stateRoot, "child-terminated");
  const child = spawn(process.execPath, [
    "-e",
    `const { writeFileSync } = require("node:fs"); process.on("SIGTERM", () => { writeFileSync(${JSON.stringify(terminationPath)}, "terminated"); process.exit(0); }); setInterval(() => {}, 1000);`,
  ], { detached: true, stdio: "ignore" });
  try {
    await new Promise((resolve) => setTimeout(resolve, 100));
    terminateManagerShardProcessGroup(child, "SIGTERM");
    await new Promise((resolve) => child.once("close", resolve));
    for (let index = 0; index < 100 && !existsSync(terminationPath); index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(existsSync(terminationPath), true, "expected SIGTERM marker for the spawned process");
  } finally {
    terminateManagerShardProcessGroup(child, "SIGKILL");
    rmSync(stateRoot, { recursive: true, force: true });
  }
});
