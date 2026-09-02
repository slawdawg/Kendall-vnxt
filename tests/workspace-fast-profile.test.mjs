import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const fastRunner = readFileSync(new URL("../scripts/run-fast-workflow-checks.mjs", import.meta.url), "utf8");
const workspaceLifecycle = readFileSync(new URL("../scripts/codex-workspace.mjs", import.meta.url), "utf8");
const workspaceFixtures = readFileSync(new URL("../scripts/test-codex-workspace.mjs", import.meta.url), "utf8");

const focusedDeliveryFilter = "finish-pr workspace-fast verification plans the workspace wrapper without raw or recursive profiles";
const workspaceFastLeaves = [
  "test:codex-workspace-state",
  "test:workspace-command-resolution",
  "test:base-checkout-recovery",
  "test:mutation-admission",
  "test:mutation-admission-workspace-handoff",
  "test:mutation-admission-prewrite-guard",
  "test:codex-workspace:delivery",
  "test:workspace-fast-profile",
];

function quotedEntries(source, label) {
  return [...source.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function suiteBlock(source, startPattern, endPattern, label) {
  const start = source.indexOf(startPattern);
  assert.notEqual(start, -1, `${label} start not found`);
  const end = source.indexOf(endPattern, start);
  assert.notEqual(end, -1, `${label} end not found`);
  return source.slice(start + startPattern.length, end);
}

function pnpmStages(command) {
  return String(command)
    .split("&&")
    .map((stage) => stage.trim())
    .map((stage) => /^pnpm run ([A-Za-z0-9:_-]+)$/.exec(stage)?.[1])
    .filter(Boolean);
}

test("workspace-fast profile has the exact bounded delivery allowlist", () => {
  assert.equal(
    packageJson.scripts["check:workspace-fast"],
    "node ./scripts/run-fast-workflow-checks.mjs workspace",
  );
  assert.equal(
    packageJson.scripts["test:codex-workspace:delivery"],
    `CODEX_WORKSPACE_TEST_FILTER='${focusedDeliveryFilter}' node ./scripts/test-codex-workspace.mjs`,
  );
  assert.equal(
    packageJson.scripts["test:workspace-fast-profile"],
    "node --test tests/workspace-fast-profile.test.mjs",
  );

  const runnerWorkspaceBlock = suiteBlock(fastRunner, "  workspace: [", "  sandbox: [", "workspace fast runner");
  assert.deepEqual(quotedEntries(runnerWorkspaceBlock, "workspace fast runner"), workspaceFastLeaves);
  assert(!runnerWorkspaceBlock.includes('"test:codex-workspace"'), "workspace-fast must not invoke the raw full fixture");

  const lifecycleWorkspaceBlock = suiteBlock(
    workspaceLifecycle,
    '  "check:workspace-fast": [',
    '  "test:supervisor":',
    "resumable workspace expansion",
  );
  assert.deepEqual(quotedEntries(lifecycleWorkspaceBlock, "resumable workspace expansion"), workspaceFastLeaves);
  assert(!lifecycleWorkspaceBlock.includes('"test:codex-workspace"'), "resumable workspace expansion must not invoke the raw full fixture");
});

test("workspace-fast profile keeps the capture-enabled full fixture separately runnable", () => {
  assert.equal(packageJson.scripts["test:codex-workspace"], "node ./scripts/codex-workspace.mjs workspace-suite");
  assert(workspaceLifecycle.includes('case "workspace-suite":'), "full fixture must use the terminal-evidence wrapper");
  assert(pnpmStages(packageJson.scripts.check).includes("test:codex-workspace"), "full check must retain the capture-enabled full fixture as an exact stage");
  assert(pnpmStages(packageJson.scripts["check:static"]).includes("test:codex-workspace"), "full static must retain the capture-enabled full fixture as an exact stage");
  assert(workspaceFixtures.includes(`test("${focusedDeliveryFilter}"`), "focused delivery fixture must remain available");
  assert(workspaceFixtures.includes("CODEX_WORKSPACE_TEST_FILTER matched no tests"), "focused fixture filter must fail closed");
});
