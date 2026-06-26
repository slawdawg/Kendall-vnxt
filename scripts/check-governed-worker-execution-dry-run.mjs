#!/usr/bin/env node
import { existsSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const contractPath = "docs/workflows/governed-worker-execution-dry-run.md";
const fixtureDir = "tests/fixtures/governed-worker-execution-dry-run";
const testPath = "tests/governed-worker-execution-dry-run.test.mjs";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const requiredFixtures = Object.freeze([
  "claude-dry-run-ok.json",
  "hermes-dry-run-ok.json",
  "denied-live-launch.json",
  "denied-session-inheritance.json",
  "denied-network.json",
  "denied-source-mutation.json",
  "denied-raw-retention.json",
  "denied-delivery.json",
  "denied-cleanup.json",
  "denied-adaptive-trust.json",
  "denied-live-status.json",
  "denied-observed-text-authority.json",
  "denied-command-shell-string.json",
  "denied-command-transitive-effects.json",
  "denied-path-escape.json",
  "denied-worker-shadow-delivery-exposure.json",
]);
const requiredPolicyRefs = Object.freeze([
  "docs/workflows/governed-worker-execution-dry-run.md",
  "docs/workflows/execution-authority-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/architecture/kendall-vnxt-worker-threat-boundary-2026-06-08.md",
  "docs/architecture/kendall-vnxt-process-lifecycle-design-2026-06-08.md",
]);

function pathFor(relativePath) {
  return resolve(repoRoot, relativePath);
}

function isFile(relativePath) {
  try {
    return statSync(pathFor(relativePath)).isFile();
  } catch {
    return false;
  }
}

export function precheckGovernedWorkerExecutionDryRun() {
  const errors = [];

  for (const policyRef of requiredPolicyRefs) {
    if (!isFile(policyRef)) {
      errors.push(`missing source-owned policy reference: ${policyRef}`);
    }
  }

  if (!isFile(contractPath)) {
    errors.push(`missing source-owned contract: ${contractPath}`);
  }

  if (!isFile(testPath)) {
    errors.push(`missing scoped test: ${testPath}`);
  }

  if (!existsSync(pathFor(fixtureDir))) {
    errors.push(`missing fixture directory: ${fixtureDir}`);
    return { ok: false, errors };
  }

  const fixtureNames = new Set(readdirSync(pathFor(fixtureDir)));
  const expectedFixtureNames = new Set(requiredFixtures);
  for (const fixtureName of requiredFixtures) {
    if (!fixtureNames.has(fixtureName)) {
      errors.push(`missing dry-run fixture: ${fixtureName}`);
    } else if (!isFile(`${fixtureDir}/${fixtureName}`)) {
      errors.push(`dry-run fixture is not a file: ${fixtureName}`);
    }
  }
  for (const fixtureName of fixtureNames) {
    if (fixtureName.endsWith(".json") && !expectedFixtureNames.has(fixtureName)) {
      errors.push(`unexpected dry-run fixture: ${fixtureName}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function main() {
  const precheck = precheckGovernedWorkerExecutionDryRun();

  if (!precheck.ok) {
    for (const error of precheck.errors) {
      console.error(`ERROR: ${error}`);
    }
    process.exit(1);
  }

  const testResult = spawnSync(process.execPath, ["--test", testPath], {
    stdio: "inherit",
    cwd: repoRoot,
  });

  if (testResult.error) {
    console.error(`ERROR: failed to launch Node test runner: ${testResult.error.message}`);
    process.exit(1);
  }

  if (testResult.signal) {
    console.error(`ERROR: Node test runner terminated by signal: ${testResult.signal}`);
    process.exit(1);
  }

  if (testResult.status !== 0) {
    process.exit(testResult.status ?? 1);
  }

  console.log("OK: governed worker execution dry-run checks passed.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
