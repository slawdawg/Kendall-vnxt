import assert from "node:assert/strict";
import test from "node:test";

import { parseLinuxBootstrapArgs } from "../../scripts/lib/linux-bootstrap/args.mjs";

test("requires exactly one explicit mode", () => {
  assert.throws(() => parseLinuxBootstrapArgs([]), /Missing mode/);
  assert.throws(() => parseLinuxBootstrapArgs(["--plan", "--verify-only"]), /Conflicting modes/);
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
    /plan mode must not mutate/,
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
