import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildCheckPlan, buildCiOutputs, classifyFile, collectChangedFiles } from "../scripts/check-plan.mjs";

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
  assert.ok(plan.commands.some((command) => command.commandText === "pnpm run test:static-bundles"));
});

test("check plan maps static bundle files to focused bundle tests", () => {
  const plan = buildCheckPlan([
    "scripts/run-static-bundle.mjs",
    "scripts/summarize-static-bundle-reports.mjs",
    "tests/static-bundles.test.mjs",
  ]);

  assert.equal(plan.requiresFullStatic, true);
  assert.deepEqual(plan.surfaces, ["ciAcceleration"]);
  assert.ok(plan.commands.some((command) => command.commandText === "pnpm run test:check-plan"));
  assert.ok(plan.commands.some((command) => command.commandText === "pnpm run test:static-bundles"));
  assert.ok(plan.commands.some((command) => command.commandText === "pnpm run check:static"));
});

test("check plan maps CI policy drift scripts without full static escalation", () => {
  const plan = buildCheckPlan([
    "scripts/check-github-workflow-policy-report.mjs",
    "scripts/check-workspace-coordination-report.mjs",
  ]);

  assert.equal(plan.requiresFullStatic, false);
  assert.deepEqual(plan.surfaces, ["workflow"]);
  assert.ok(plan.commands.some((command) => command.commandText === "pnpm run check:github-workflow-policy"));
  assert.ok(plan.commands.some((command) => command.commandText === "pnpm run check:workspace-coordination"));
});

test("check plan maps workspace changes to the bounded workspace delivery profile", () => {
  const plan = buildCheckPlan([
    "scripts/codex-workspace.mjs",
    "scripts/test-codex-workspace.mjs",
    "tests/workspace-fast-profile.test.mjs",
  ]);

  assert.equal(plan.requiresFullStatic, false);
  assert.deepEqual(plan.surfaces, ["workspace"]);
  assert.ok(plan.commands.some((command) => command.commandText === "pnpm run check:workspace-coordination"));
  assert.ok(plan.commands.some((command) => command.commandText === "pnpm run check:workspace-fast"));
  assert.ok(!plan.commands.some((command) => command.commandText === "pnpm run test:codex-workspace"));
});

test("check plan conservatively escalates the shared fast workflow runner", () => {
  const plan = buildCheckPlan(["scripts/run-fast-workflow-checks.mjs"]);

  assert.equal(plan.requiresFullStatic, true);
  assert.ok(plan.commands.some((command) => command.commandText === "pnpm run check:static"));
  assert.ok(plan.reasons.some((reason) => reason.includes("shared fast runner dispatches CI, workspace, sandbox, and dashboard suites")));
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

test("CI outputs route static only when the planner requires full static", () => {
  const plannerOnly = buildCiOutputs(buildCheckPlan([
    "scripts/check-plan.mjs",
    "tests/check-plan.test.mjs",
  ]));

  assert.equal(plannerOnly.static, false);
  assert.equal(plannerOnly.javascript, false);
  assert.equal(plannerOnly.supervisor, false);
  assert.deepEqual(plannerOnly.surfaces, ["ciAcceleration"]);

  const dashboard = buildCiOutputs(buildCheckPlan(["apps/dashboard/src/app/page.tsx"]));
  assert.equal(dashboard.static, false);
  assert.equal(dashboard.javascript, true);
  assert.equal(dashboard.supervisor, false);

  const supervisor = buildCiOutputs(buildCheckPlan(["services/supervisor/src/supervisor/application/service.py"]));
  assert.equal(supervisor.static, false);
  assert.equal(supervisor.javascript, false);
  assert.equal(supervisor.supervisor, true);
  assert.deepEqual(supervisor.commands, ["pnpm run test:supervisor-runner", "pnpm run test:supervisor:preflight", "pnpm run test:supervisor:profile"]);

  const e2eScript = buildCiOutputs(buildCheckPlan(["scripts/run-controls-e2e.mjs"]));
  assert.equal(e2eScript.static, false);
  assert.equal(e2eScript.javascript, true);
  assert.equal(e2eScript.supervisor, false);

  const supervisorRunner = buildCiOutputs(buildCheckPlan(["scripts/run-supervisor-tests.mjs"]));
  assert.equal(supervisorRunner.static, false);
  assert.equal(supervisorRunner.javascript, false);
  assert.equal(supervisorRunner.supervisor, true);

  const supervisorPreflight = buildCiOutputs(buildCheckPlan(["scripts/preflight.mjs"]));
  assert.equal(supervisorPreflight.static, false);
  assert.equal(supervisorPreflight.javascript, false);
  assert.equal(supervisorPreflight.supervisor, true);
});

test("CI outputs preserve broad gates for package and workflow changes", () => {
  const outputs = buildCiOutputs(buildCheckPlan([
    "package.json",
    ".github/workflows/ci.yml",
  ]));

  assert.equal(outputs.static, true);
  assert.equal(outputs.javascript, true);
  assert.equal(outputs.supervisor, true);
  assert.equal(outputs.requiresFullStatic, true);

  const sharedPackage = buildCiOutputs(buildCheckPlan(["packages/contracts/src/workflow.ts"]));
  assert.equal(sharedPackage.static, true);
  assert.equal(sharedPackage.javascript, true);
  assert.equal(sharedPackage.supervisor, true);
  assert.equal(sharedPackage.requiresFullStatic, true);

  const otherWorkflow = buildCiOutputs(buildCheckPlan([".github/workflows/resolve-pr-review-threads.yml"]));
  assert.equal(otherWorkflow.static, true);
  assert.equal(otherWorkflow.javascript, true);
  assert.equal(otherWorkflow.supervisor, true);
  assert.equal(otherWorkflow.requiresFullStatic, true);
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
