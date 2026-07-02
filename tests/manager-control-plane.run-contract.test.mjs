import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

async function loadRunContractModule() {
  const outDir = await mkdtemp(join(tmpdir(), "manager-run-contract-"));
  await writeFile(join(outDir, "package.json"), '{"type":"module"}\n');
  const result = spawnSync(
    "apps/dashboard/node_modules/.bin/tsc",
    [
      "--target",
      "ES2022",
      "--module",
      "ESNext",
      "--moduleResolution",
      "Bundler",
      "--strict",
      "--verbatimModuleSyntax",
      "--rootDir",
      "packages/workflow-core/src",
      "--outDir",
      outDir,
      "packages/workflow-core/src/manager-control-plane/run-contract.ts"
    ],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error("Unable to compile manager run contract: " + (result.stderr || result.stdout));
  }
  const compiledPath = join(outDir, "manager-control-plane/run-contract.js");
  const compiled = await import("node:fs/promises").then((fs) => fs.readFile(compiledPath, "utf8"));
  await import("node:fs/promises").then((fs) => fs.writeFile(compiledPath, compiled.replace('from "./result"', 'from "./result.js"')));
  return import(pathToFileURL(compiledPath).href);
}

test("default backend-proof run contract points at committed verification artifacts", async () => {
  const { buildDefaultBackendProofRunContract, validateImplementationRunContract } = await loadRunContractModule();
  const contract = buildDefaultBackendProofRunContract({ runId: "run-default-proof" });
  const validation = validateImplementationRunContract(contract);

  assert.equal(validation.ok, true);
  assert.equal(contract.verificationCommands[0].command, "node --test tests/manager-control-plane.run-contract.test.mjs");
  assert.equal(existsSync(new URL("./manager-control-plane.run-contract.test.mjs", import.meta.url)), true);
  assert.equal(contract.evidencePaths[0], "tests/fixtures/manager-control-plane/implementation-run-contracts/backend-proof-default.json");
  assert.equal(existsSync(new URL("./fixtures/manager-control-plane/implementation-run-contracts/backend-proof-default.json", import.meta.url)), true);
});

test("report-only steering records status without allowing new dispatch", async () => {
  const { buildDefaultBackendProofRunContract, buildManagerRunControlState } = await loadRunContractModule();
  const contract = buildDefaultBackendProofRunContract({ runId: "run-report-only" });

  for (const requestedAction of ["status", "show_testable_work"]) {
    const result = buildManagerRunControlState(contract, { requestedAction, evidenceRefs: ["evidence:status"] });
    assert.equal(result.ok, true, requestedAction);
    assert.equal(result.value.controlState, "status_only", requestedAction);
    assert.equal(result.value.futureDispatch.scope, "report-only", requestedAction);
    assert.equal(result.value.futureDispatch.newDispatchAllowed, false, requestedAction);
  }
});

test("workspace runtime state paths must bind to the current run", async () => {
  const { buildDefaultBackendProofRunContract, buildManagerRunStartState } = await loadRunContractModule();
  const contract = buildDefaultBackendProofRunContract({ runId: "run-A" });

  const matching = buildManagerRunStartState(contract, {
    runtimeStatePath: "workspace-state:manager-runs/run-A",
    evidenceRefs: ["evidence:start"],
  });
  assert.equal(matching.ok, true);
  assert.equal(matching.value.runtimeStatePath, "workspace-state:manager-runs/run-A");

  const mismatched = buildManagerRunStartState(contract, {
    runtimeStatePath: "workspace-state:manager-runs/run-B",
    evidenceRefs: ["evidence:start"],
  });
  assert.equal(mismatched.ok, false);
  assert.equal(mismatched.code, "invalid_input");
});
