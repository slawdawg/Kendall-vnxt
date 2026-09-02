import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  EXPECTED_HERMES_PIN,
  evaluateRuntimePreflight,
  parseHermesPinOutput,
} from "../scripts/hermes-runtime-preflight.mjs";

const repositoryRoot = "/workspace/Kendall_Nxt";
const isolatedDataRoot = "/var/lib/kendall-hermes";

function safeRealpath(value) {
  return value;
}

function validInspection(overrides = {}) {
  return {
    hermesPinOutput: "v0.20.6 / v2026.8.27\n",
    codex: {
      cliVersion: "0.85.0",
      appServerCapability: "available",
    },
    dataRoot: isolatedDataRoot,
    health: {
      state: "healthy",
      scope: "local",
      network: "disabled",
      api: "disabled",
      gateway: "disabled",
    },
    ...overrides,
  };
}

function evaluate(inspection, options = {}) {
  return evaluateRuntimePreflight(inspection, {
    repositoryRoot,
    realpath: safeRealpath,
    stat: () => ({ isDirectory: () => true, uid: 1000, mode: 0o700 }),
    getuid: () => 1000,
    ...options,
  });
}

test("accepts an exact mocked Hermes pin and local-only health facts without granting execution authority", () => {
  assert.deepEqual(parseHermesPinOutput("v0.20.6 / v2026.8.27\n"), EXPECTED_HERMES_PIN);

  const result = evaluate(validInspection());

  assert.deepEqual(result, {
    status: "ready",
    reason_code: "ready",
    next_action: "Record this readiness evidence; a later explicitly approved story is required before Hermes can receive work.",
    observed: {
      hermes: EXPECTED_HERMES_PIN,
      codex: { cli_version: "0.85.0", app_server_capability: "available" },
      data_root: isolatedDataRoot,
      health: "healthy",
    },
  });
});

test("rejects missing, partial, latest, and mismatched Hermes pin output", () => {
  for (const output of [null, "", "v0.20.6", "latest / v2026.8.27", "v0.20.7 / v2026.8.27", "v0.20.6 / v2026.8.28"]) {
    const result = evaluate(validInspection({ hermesPinOutput: output }));
    assert.equal(result.status, "not_ready", `${String(output)} must fail closed`);
    assert.equal(result.reason_code, output === null || output === "" || output === "v0.20.6" ? "hermes_pin_malformed" : "hermes_pin_mismatch");
    assert.equal(result.observed, undefined, "raw inspection output is not retained");
  }
});

test("requires structured Codex app-server capability rather than prose", () => {
  for (const codex of [null, {}, { cliVersion: "0.85.0", appServerCapability: "ready enough" }, { cliVersion: "", appServerCapability: "available" }]) {
    const result = evaluate(validInspection({ codex }));
    assert.equal(result.status, "not_ready");
    assert.equal(result.reason_code, "codex_incompatible");
  }
});

test("rejects an absent, repository-contained, or repository-resolving data root without creating state", () => {
  for (const dataRoot of [null, "relative/hermes", `${repositoryRoot}/.data/hermes`]) {
    const result = evaluate(validInspection({ dataRoot }));
    assert.equal(result.status, "not_ready");
    assert.equal(result.reason_code, "data_root_unsafe");
  }

  const symlinkResult = evaluate(validInspection({ dataRoot: "/mnt/hermes-link" }), {
    realpath: (value) => value === "/mnt/hermes-link" ? `${repositoryRoot}/.data/hermes` : value,
  });
  assert.equal(symlinkResult.reason_code, "data_root_unsafe");

  const absentResult = evaluate(validInspection(), { realpath: (value) => {
    if (value === repositoryRoot) return value;
    throw new Error("ENOENT");
  } });
  assert.equal(absentResult.reason_code, "data_root_unavailable");

  const fileResult = evaluate(validInspection(), { stat: () => ({ isDirectory: () => false, uid: 1000, mode: 0o700 }) });
  assert.equal(fileResult.reason_code, "data_root_unsafe");

  for (const metadata of [
    { isDirectory: () => true, uid: 1000, mode: 0o755 },
    { isDirectory: () => true, uid: 0, mode: 0o700 },
  ]) {
    const result = evaluate(validInspection({ dataRoot: "/tmp" }), { stat: () => metadata });
    assert.equal(result.reason_code, "data_root_unsafe");
  }

  const physicalRepository = "/physical/Kendall_Nxt";
  const aliasedRepositoryResult = evaluate(validInspection({ dataRoot: "/alias/data" }), {
    repositoryRoot: "/alias/repository",
    realpath: (value) => value === "/alias/repository" ? physicalRepository : value === "/alias/data" ? `${physicalRepository}/.data/hermes` : value,
  });
  assert.equal(aliasedRepositoryResult.reason_code, "data_root_unsafe");
});

test("rejects missing, malformed, non-local, network/API/gateway-enabled, and unhealthy health facts", () => {
  for (const health of [null, {}, { state: "healthy", scope: "remote", network: "disabled", api: "disabled", gateway: "disabled" }, { state: "healthy", scope: "local", network: "enabled", api: "disabled", gateway: "disabled" }, { state: "healthy", scope: "local", network: "disabled", api: "enabled", gateway: "disabled" }, { state: "healthy", scope: "local", network: "disabled", api: "disabled", gateway: "enabled" }, { state: "degraded", scope: "local", network: "disabled", api: "disabled", gateway: "disabled" }]) {
    const result = evaluate(validInspection({ health }));
    assert.equal(result.status, "not_ready");
    assert.equal(result.reason_code, "health_not_ready");
  }
});

test("preflight source and entrypoint stay non-executing and documentation preserves backup and disable boundaries", async () => {
  const [source, packageText, readme, runbook] = await Promise.all([
    readFile(new URL("../scripts/hermes-runtime-preflight.mjs", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/workflows/hermes-autonomous-delivery.md", import.meta.url), "utf8"),
  ]);
  const packageJson = JSON.parse(packageText);

  assert.equal(packageJson.scripts["hermes:preflight"], "node ./scripts/hermes-runtime-preflight.mjs");
  assert.match(readme, /docs\/workflows\/hermes-autonomous-delivery\.md/);
  for (const phrase of ["snapshot before update", "exact pin", "rollback", "disable", "provider", "gateway", "profile", "admit work"]) assert.match(runbook, new RegExp(phrase, "i"));
  assert.match(runbook, /preserving existing Hermes and Kendall evidence/i);
  assert.match(runbook, /Do not\s+delete Hermes or Kendall evidence/i);
  for (const prohibited of [/node:child_process/, /node:net/, /\bspawn\w*\(/, /\bfetch\(/, /https?:\/\//, /process\.env/, /writeFile/, /appendFile/, /createWriteStream/, /mkdir/, /rmSync/, /github/i, /\b(?:pnpm|npm|yarn|bun)\b/i, /install/i, /update/i]) {
    assert.doesNotMatch(source, prohibited, `${prohibited} must not enter the preflight boundary`);
  }
  assert.doesNotMatch(source, /process\.cwd\(\)/, "CLI repository containment must derive from the source checkout, not the caller cwd");
  assert.match(source, /new URL\("\.\.", import\.meta\.url\)/, "CLI must derive the repository boundary from its own source location");
  assert.match(source, /metadata\.uid !== getuid\(\) \|\| \(metadata\.mode & 0o077\) !== 0/, "isolated data roots must be owner-private");
});
