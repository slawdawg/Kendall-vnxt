import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const runner = "scripts/run-supervisor-tests.mjs";

test("work-packets behavior shard retains its independently bounded timeout", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.match(
    packageJson.scripts["test:supervisor:check:integration:work-packets"],
    /--timeout-ms=210000 tests\/integration\/test_work_packets\.py -q/,
  );
});

test("supervisor test runner rejects conflicting phase flags", () => {
  const result = spawnSync(process.execPath, [runner, "--preflight", "--no-preflight"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 64);
  assert.match(result.stderr, /conflicting flags/);
});

test("supervisor test runner gives child phases a private temp root", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "supervisor-runner-test-"));
  const fakeUv = join(tempDir, "fake-uv.mjs");
  const outputPath = join(tempDir, "child-env.json");
  writeFileSync(fakeUv, [
    "#!/usr/bin/env node",
    "import { statSync, writeFileSync } from 'node:fs';",
    "writeFileSync(process.env.SUPERVISOR_TEST_TEMP_OUTPUT, JSON.stringify({ TMPDIR: process.env.TMPDIR, TMP: process.env.TMP, TEMP: process.env.TEMP, mode: statSync(process.env.TMPDIR).mode & 0o777 }));",
    "",
  ].join("\n"));
  chmodSync(fakeUv, 0o755);

  try {
    const result = spawnSync(process.execPath, [runner, "--preflight"], {
      encoding: "utf8",
      env: {
        ...process.env,
        SUPERVISOR_TEST_TEMP_OUTPUT: outputPath,
        UV_EXE: fakeUv,
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const childTemp = JSON.parse(readFileSync(outputPath, "utf8"));
    assert.equal(childTemp.TMPDIR, childTemp.TMP);
    assert.equal(childTemp.TMP, childTemp.TEMP);
    assert.equal(childTemp.mode, 0o700);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
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
