import assert from "node:assert/strict";
import test from "node:test";

import { validateTargetIdentity } from "../../scripts/lib/linux-bootstrap/gates.mjs";

const baseOptions = { user: "ubuntu", hostname: "" };
const baseIdentity = {
  user: "ubuntu",
  uid: "1000",
  hostname: "ubuntu-host",
  arch: "x86_64",
  home: "/home/ubuntu",
  os_id: "ubuntu",
  os_version: "26.04",
  sudo: "available",
  disk_available_kb: String(8 * 1024 * 1024),
  network: "github-dns-ok",
};

test("target identity passes for Ubuntu 26.04 non-root sudo user", () => {
  const gate = validateTargetIdentity(baseIdentity, baseOptions);
  assert.equal(gate.status, "pass");
});

test("target identity refuses root, unsupported OS, and missing sudo", () => {
  assert.equal(validateTargetIdentity({ ...baseIdentity, user: "root", uid: "0" }, baseOptions).status, "fail");
  assert.match(validateTargetIdentity({ ...baseIdentity, os_version: "24.04" }, baseOptions).summary, /expected Ubuntu/);
  assert.match(validateTargetIdentity({ ...baseIdentity, sudo: "missing" }, baseOptions).summary, /sudo/);
  assert.match(validateTargetIdentity({ ...baseIdentity, disk_available_kb: "1024" }, baseOptions).summary, /insufficient free space/);
  assert.match(validateTargetIdentity({ ...baseIdentity, network: "github-dns-fail" }, baseOptions).summary, /github\.com/);
});

test("target identity enforces expected user and hostname", () => {
  assert.match(validateTargetIdentity({ ...baseIdentity, user: "other" }, baseOptions).summary, /expected user/);
  assert.match(
    validateTargetIdentity(baseIdentity, { user: "ubuntu", hostname: "expected-host" }).summary,
    /expected hostname/,
  );
});
