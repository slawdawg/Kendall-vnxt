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

test("target identity refuses root before mutation with recovery guidance", () => {
  const gate = validateTargetIdentity({ ...baseIdentity, user: "root", uid: "0" }, { user: "", hostname: "" });

  assert.equal(gate.id, "local-identity");
  assert.equal(gate.status, "fail");
  assert.match(gate.summary, /root local user is not supported/);
  assert.match(gate.recovery, /non-root Linux user with sudo access/);
  assert.equal(gate.command, "local identity probe");
});

test("target identity refuses unsupported OS and old Ubuntu versions", () => {
  const nonUbuntu = validateTargetIdentity({ ...baseIdentity, os_id: "debian", os_version: "13" }, baseOptions);
  const oldUbuntu = validateTargetIdentity({ ...baseIdentity, os_version: "24.04" }, baseOptions);

  for (const gate of [nonUbuntu, oldUbuntu]) {
    assert.equal(gate.id, "local-identity");
    assert.equal(gate.status, "fail");
    assert.match(gate.summary, /expected Ubuntu 26\.04 or later/);
    assert.match(gate.recovery, /Use Ubuntu 26\.04 or later/);
    assert.equal(gate.command, "local identity probe");
  }
});

test("target identity refuses missing sudo with recovery guidance", () => {
  const gate = validateTargetIdentity({ ...baseIdentity, sudo: "missing" }, baseOptions);

  assert.equal(gate.id, "local-identity");
  assert.equal(gate.status, "fail");
  assert.match(gate.summary, /sudo is not available locally/);
  assert.match(gate.recovery, /Install sudo or use a non-root user/);
  assert.equal(gate.command, "command -v sudo");
});

test("target identity refuses insufficient disk with recovery guidance", () => {
  const gate = validateTargetIdentity({ ...baseIdentity, disk_available_kb: "1024" }, baseOptions);

  assert.equal(gate.id, "local-identity");
  assert.equal(gate.status, "fail");
  assert.match(gate.summary, /insufficient free space/);
  assert.match(gate.recovery, /Free at least 5 GB/);
  assert.equal(gate.command, "df -Pk $HOME");
});

test("target identity refuses github DNS failure with recovery guidance", () => {
  const gate = validateTargetIdentity({ ...baseIdentity, network: "github-dns-fail" }, baseOptions);

  assert.equal(gate.id, "local-identity");
  assert.equal(gate.status, "fail");
  assert.match(gate.summary, /cannot resolve github\.com/);
  assert.match(gate.recovery, /Fix DNS or outbound network access/);
  assert.equal(gate.command, "getent hosts github.com");
});

test("target identity enforces expected user and hostname", () => {
  assert.match(validateTargetIdentity({ ...baseIdentity, user: "other" }, baseOptions).summary, /expected user/);
  assert.match(
    validateTargetIdentity(baseIdentity, { user: "ubuntu", hostname: "expected-host" }).summary,
    /expected hostname/,
  );
});
