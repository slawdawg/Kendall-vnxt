import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildCheckPlan, classifyFile, collectChangedFiles } from "../scripts/check-plan.mjs";

test("check plan maps manager changes to focused manager checks", () => {
  const plan = buildCheckPlan([
    "scripts/lib/manager-control-plane/core.mjs",
    "tests/manager-control-plane.test.mjs",
  ]);

  assert.deepEqual(plan.surfaces, ["manager"]);
  assert.equal(plan.requiresFullStatic, false);
  assert.ok(plan.commands.some((command) => command.commandText === "pnpm run test:manager-control-plane:preflight"));
  assert.ok(plan.commands.some((command) => command.commandText === "pnpm run test:manager-control-plane:full"));
  assert.ok(plan.commands.some((command) => command.commandText === "pnpm run check:manager-control-plane"));
  assert.ok(plan.quickFailCommands.some((command) => command.commandText === "git diff --check origin/dev...HEAD"));
  assert.ok(plan.quickFailCommands.some((command) => command.commandText === "git diff --cached --check"));
  assert.ok(plan.quickFailCommands.some((command) => command.commandText === "git diff --check"));
  assert.ok(plan.quickFailCommands.some((command) => command.commandText.includes("node") && command.commandText.includes("scripts/lib/manager-control-plane/core.mjs")));
});

test("check plan escalates package and workflow changes to full static", () => {
  const plan = buildCheckPlan([
    "package.json",
    ".github/workflows/ci.yml",
  ]);

  assert.equal(plan.requiresFullStatic, true);
  assert.ok(plan.surfaces.includes("package"));
  assert.ok(plan.surfaces.includes("workflow"));
  assert.ok(plan.commands.some((command) => command.commandText === "pnpm run check:static"));
});

test("check plan maps CI acceleration planner files to focused planner tests", () => {
  const plan = buildCheckPlan([
    "scripts/check-plan.mjs",
    "tests/check-plan.test.mjs",
    "docs/workflows/ci-acceleration-plan.md",
  ]);

  assert.equal(plan.requiresFullStatic, false);
  assert.ok(plan.surfaces.includes("ciAcceleration"));
  assert.ok(plan.surfaces.includes("docs"));
  assert.ok(plan.commands.some((command) => command.commandText === "pnpm run test:check-plan"));
});

test("check plan maps manager dispatcher-port helpers to focused dispatcher-port tests", () => {
  const plan = buildCheckPlan([
    "tests/helpers/manager-control-plane/workflow-core-loader.mjs",
  ]);

  assert.equal(plan.requiresFullStatic, false);
  assert.deepEqual(plan.surfaces, ["managerDispatcherPort"]);
  assert.ok(plan.commands.some((command) => command.commandText === "pnpm run test:manager-control-plane-dispatcher-port"));
  assert.ok(plan.quickFailCommands.some((command) => command.commandText.includes("node") && command.commandText.includes("tests/helpers/manager-control-plane/workflow-core-loader.mjs")));
});

test("check plan maps manager verification scripts without full static escalation", () => {
  const plan = buildCheckPlan([
    "scripts/check-manager-control-plane.mjs",
    "scripts/run-manager-control-plane-shards.mjs",
  ]);

  assert.equal(plan.requiresFullStatic, false);
  assert.ok(plan.surfaces.includes("manager"));
  assert.ok(plan.surfaces.includes("ciAcceleration"));
  assert.ok(plan.commands.some((command) => command.commandText === "pnpm run test:manager-control-plane:full"));
  assert.ok(plan.commands.some((command) => command.commandText === "pnpm run test:check-plan"));
});

test("check plan maps dashboard and pipeline changes without full static escalation", () => {
  const plan = buildCheckPlan([
    "apps/dashboard/src/app/page.tsx",
    "tests/pipeline-implementation-readiness.test.mjs",
  ]);

  assert.equal(plan.requiresFullStatic, false);
  assert.ok(plan.surfaces.includes("dashboard"));
  assert.ok(plan.surfaces.includes("pipeline"));
  assert.ok(plan.commands.some((command) => command.commandText === "pnpm run build:dashboard"));
  assert.ok(plan.commands.some((command) => command.commandText === "pnpm run test:pipeline-implementation-readiness"));
});

test("check plan escalates unknown paths", () => {
  const classification = classifyFile("new-area/example.txt");
  assert.equal(classification.requiresFullStatic, true);
  assert.deepEqual(classification.surfaces, []);
});

test("changed-file collection fails closed when the base ref cannot be read", () => {
  assert.throws(
    () => collectChangedFiles({ base: "refs/heads/kendall-missing-check-plan-base", head: "HEAD" }),
    /Failed to collect changed files with git diff --name-only/,
  );
});

test("aggregate checks include the check-plan regression tests", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.match(packageJson.scripts["check:static"], /pnpm run test:check-plan/);
  assert.match(packageJson.scripts.check, /pnpm run test:check-plan/);
});
