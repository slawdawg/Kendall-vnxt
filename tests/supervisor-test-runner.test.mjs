import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const runner = "scripts/run-supervisor-tests.mjs";

test("supervisor test runner rejects conflicting phase flags", () => {
  const result = spawnSync(process.execPath, [runner, "--preflight", "--no-preflight"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 64);
  assert.match(result.stderr, /conflicting flags/);
});

test("supervisor test runner hard-kills a timed-out phase", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "supervisor-runner-test-"));
  const fakeUv = join(tempDir, "fake-uv.mjs");
  writeFileSync(fakeUv, [
    "#!/usr/bin/env node",
    "process.on('SIGTERM', () => {});",
    "setInterval(() => {}, 1000);",
    "",
  ].join("\n"));
  chmodSync(fakeUv, 0o755);

  const start = Date.now();
  const result = spawnSync(process.execPath, [runner, "--preflight", "--timeout-ms=20"], {
    encoding: "utf8",
    env: {
      ...process.env,
      SUPERVISOR_TEST_KILL_GRACE_MS: "20",
      UV_EXE: fakeUv,
    },
    timeout: 5000,
  });

  assert.equal(result.status, 124);
  assert.match(result.stderr, /SUPERVISOR_TEST_PHASE_TIMEOUT preflight-import/);
  assert.ok(Date.now() - start < 5000, "runner should return before the outer test timeout");
});
