#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const linuxBootstrapTests = readdirSync(join(process.cwd(), "tests", "linux-bootstrap"))
  .filter((name) => name.endsWith(".test.mjs"))
  .map((name) => `tests/linux-bootstrap/${name}`);

const checks = [
  {
    id: "entrypoint-syntax",
    command: "node",
    args: ["--check", "scripts/linux-bootstrap.mjs"],
  },
  {
    id: "controller-syntax",
    command: "node",
    args: ["--check", "scripts/lib/linux-bootstrap/controller.mjs"],
  },
  {
    id: "evidence-schema-syntax",
    command: "node",
    args: ["--check", "scripts/lib/linux-bootstrap/evidence-schema.mjs"],
  },
  {
    id: "evidence-checker-syntax",
    command: "node",
    args: ["--check", "scripts/check-linux-bootstrap-evidence.mjs"],
  },
  {
    id: "url-checker-syntax",
    command: "node",
    args: ["--check", "scripts/check-linux-bootstrap-url.mjs"],
  },
  {
    id: "install-contract-checker-syntax",
    command: "node",
    args: ["--check", "scripts/check-linux-install-contract.mjs"],
  },
  {
    id: "shell-syntax",
    command: "bash",
    args: ["-n", "scripts/bootstrap-linux.sh", "scripts/validate-linux-install.sh"],
  },
  {
    id: "linux-install-contract",
    command: "node",
    args: ["scripts/check-linux-install-contract.mjs"],
  },
  {
    id: "linux-bootstrap-tests",
    command: "node",
    args: ["--test", ...linuxBootstrapTests],
  },
];

const failures = [];

for (const check of checks) {
  const result = spawnSync(check.command, check.args, {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: false,
  });

  if (result.status === 0) {
    console.log(`OK: ${check.id}`);
  } else {
    failures.push(check.id);
    console.error(`FAIL: ${check.id}`);
    if (result.stdout) {
      console.error(result.stdout.trim());
    }
    if (result.stderr) {
      console.error(result.stderr.trim());
    }
  }
}

if (failures.length > 0) {
  console.error(`Linux bootstrap checks failed: ${failures.join(", ")}`);
  process.exit(1);
}

console.log("Linux bootstrap checks passed.");
