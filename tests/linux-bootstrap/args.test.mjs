import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { parseLinuxBootstrapArgs } from "../../scripts/lib/linux-bootstrap/args.mjs";

test("requires exactly one explicit mode", () => {
  assert.throws(() => parseLinuxBootstrapArgs([]), /Missing mode/);
  assert.throws(() => parseLinuxBootstrapArgs(["--plan", "--verify-only"]), /Conflicting modes/);
  assert.throws(() => parseLinuxBootstrapArgs(["--doctor", "--plan"]), /Conflicting modes/);
  assert.throws(() => parseLinuxBootstrapArgs(["--doctor", "--doctor"]), /Duplicate mode/);
});

test("rejects remote target and user arguments", () => {
  assert.throws(
    () => parseLinuxBootstrapArgs(["--plan", "--target", "ubuntu-target"]),
    /--target is not supported/,
  );
  assert.throws(
    () => parseLinuxBootstrapArgs(["--plan", "--user", "ubuntu"]),
    /--user is not supported/,
  );
});

test("rejects shell-unsafe hostname values", () => {
  assert.throws(() => parseLinuxBootstrapArgs(["--plan", "--hostname", "host;id"]), /hostname contains unsupported/);
});

test("plan mode refuses evidence output because it must not mutate", () => {
  assert.throws(
    () => parseLinuxBootstrapArgs(["--plan", "--evidence", "docs/linux-install/evidence/plan.json"]),
    /plan does not write evidence/,
  );
  assert.throws(
    () => parseLinuxBootstrapArgs(["--doctor", "--evidence", "docs/linux-install/evidence/doctor.json"]),
    /doctor does not write evidence/,
  );
});

test("node verifier rejects apply mutation options", () => {
  assert.throws(() => parseLinuxBootstrapArgs(["--apply"]), /--apply is not supported/);
  assert.throws(
    () => parseLinuxBootstrapArgs(["--apply", "--approval-id", "bad id"]),
    /--apply is not supported/,
  );
  assert.throws(
    () => parseLinuxBootstrapArgs(["--verify-only", "--approval-id", "linux-bootstrap-apply-20260617-01"]),
    /--approval-id is not supported/,
  );
});

test("linux bootstrap entrypoint rejects unsupported remote and apply arguments before evidence output", () => {
  for (const args of [["--apply"], ["--plan", "--target", "ubuntu-target"], ["--plan", "--user", "ubuntu"]]) {
    const result = spawnSync(process.execPath, ["./scripts/linux-bootstrap.mjs", ...args], {
      encoding: "utf8",
      shell: false,
    });

    if (result.error?.code === "EPERM") {
      continue;
    }
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Usage: node \.\/scripts\/linux-bootstrap\.mjs/);
    assert.doesNotMatch(result.stdout, /kendall-linux-bootstrap-evidence/);
  }
});
