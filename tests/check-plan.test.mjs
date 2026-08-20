import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildCheckPlan, buildCiOutputs, classifyFile, collectChangedFiles } from "../scripts/check-plan.mjs";
import { staticBundleNames } from "../scripts/run-static-bundle.mjs";

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

test("check plan maps the automatic pre-push hook to workflow checks", () => {
  const plan = buildCheckPlan([".githooks/pre-push"]);

  assert.equal(plan.requiresFullStatic, false);
  assert.deepEqual(plan.surfaces, ["workflow"]);
  assert.ok(plan.reasons.some((reason) => reason.includes("local CI quick-fail hook surface")));
});

test("check plan maps workspace changes to the bounded workspace delivery profile", () => {
  const plan = buildCheckPlan([
    "scripts/codex-workspace.mjs",
    "tests/workspace-fast-profile.test.mjs",
  ]);

  assert.equal(plan.requiresFullStatic, false);
  assert.deepEqual(plan.surfaces, ["workspace"]);
  assert.ok(plan.commands.some((command) => command.commandText === "pnpm run check:workspace-coordination"));
  assert.ok(plan.commands.some((command) => command.commandText === "pnpm run check:workspace-fast"));
  assert.ok(!plan.commands.some((command) => command.commandText === "pnpm run test:codex-workspace"));
});

test("check plan escalates changes to the full workspace fixture runner", () => {
  const plan = buildCheckPlan(["scripts/test-codex-workspace.mjs"]);

  assert.equal(plan.requiresFullStatic, true);
  assert.deepEqual(plan.surfaces, ["workspace"]);
  assert.ok(plan.commands.some((command) => command.commandText === "pnpm run check:static"));
  assert.ok(plan.reasons.some((reason) => reason.includes("full workspace fixture runner changes require full static confidence")));
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
  assert.equal(plannerOnly.routingMode, "affected");
  assert.deepEqual(plannerOnly.selectedStaticBundles.map((bundle) => bundle.id), ["core"]);
  assert.ok(plannerOnly.selectedStaticBundles[0].reasons.includes("affected ciAcceleration surface"));
  assert.ok(plannerOnly.skippedStaticBundles.every((bundle) => bundle.reasons.includes("not selected by affected-domain routing")));
  assert.deepEqual(plannerOnly.requiredGates.map((gate) => gate.id), ["fast"]);
  assert.deepEqual(plannerOnly.skippedRequiredGates.map((gate) => gate.id), ["static", "javascript", "supervisor"]);
  assert.deepEqual(plannerOnly.selectedWorkspaceProfiles, []);
  assert.deepEqual(plannerOnly.selectedSupervisorShards, []);

  const dashboard = buildCiOutputs(buildCheckPlan(["apps/dashboard/src/app/page.tsx"]));
  assert.equal(dashboard.static, false);
  assert.equal(dashboard.javascript, true);
  assert.equal(dashboard.supervisor, false);

  const supervisor = buildCiOutputs(buildCheckPlan(["services/supervisor/src/supervisor/application/service.py"]));
  assert.equal(supervisor.static, false);
  assert.equal(supervisor.javascript, false);
  assert.equal(supervisor.supervisor, true);
  assert.deepEqual(supervisor.commands, ["pnpm run test:supervisor-runner", "pnpm run test:supervisor:preflight", "pnpm run test:supervisor:profile"]);
  assert.equal(supervisor.selectedSupervisorShards.length, 22);
  assert.equal(supervisor.selectedSupervisorShards[0].id, "preflight");
  assert.equal(supervisor.selectedSupervisorShards[0].script, "test:supervisor:check:preflight");
  assert.equal(supervisor.selectedSupervisorShards[2].script, "test:supervisor:check:integration:orchestrator-fake-workers");
  assert.equal(supervisor.selectedSupervisorShards[7].script, "test:supervisor:check-routing-preview-01");

  const focusedSupervisor = buildCiOutputs(buildCheckPlan(["services/supervisor/tests/integration/test_work_packets.py"]));
  assert.deepEqual(focusedSupervisor.selectedSupervisorShards.map((shard) => shard.id), ["preflight", "non-integration", "integration-work-packets"]);
  assert.match(focusedSupervisor.selectedSupervisorShards[2].reason, /test_work_packets\.py/);

  const workspace = buildCiOutputs(buildCheckPlan(["scripts/codex-workspace.mjs"]));
  assert.deepEqual(workspace.selectedWorkspaceProfiles.map((profile) => profile.id), [
    "discovery-readonly",
    "start-resume",
    "assignment-lease",
    "delivery-review",
    "cleanup-recovery",
    "shared-core",
  ]);

  const focusedWorkspace = buildCiOutputs(buildCheckPlan(["scripts/lib/base-checkout-recovery.mjs"]));
  assert.deepEqual(focusedWorkspace.selectedWorkspaceProfiles.map((profile) => profile.id), ["discovery-readonly", "shared-core"]);
  assert.match(focusedWorkspace.selectedWorkspaceProfiles[0].reason, /base-checkout-recovery/);

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
  assert.equal(outputs.routingMode, "elevated");
  assert.deepEqual(outputs.selectedStaticBundles.map((bundle) => bundle.id), staticBundleNames());
  assert.equal(outputs.skippedStaticBundles.length, 0);
  assert.deepEqual(outputs.requiredGates.map((gate) => gate.id), ["fast", "static", "javascript", "supervisor"]);

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

test("CI outputs fail closed and explain bundle routing for unmapped paths", () => {
  const outputs = buildCiOutputs(buildCheckPlan(["new-area/example.txt"]));

  assert.equal(outputs.routingMode, "fail-closed-unknown");
  assert.deepEqual(outputs.selectedStaticBundles.map((bundle) => bundle.id), staticBundleNames());
  assert.ok(outputs.selectedStaticBundles.every((bundle) => bundle.reasons.some((reason) => reason.startsWith("fail-closed:"))));
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

test("pre-push hook runs the automatic quick-fail diagnostic", () => {
  const hook = readFileSync(".githooks/pre-push", "utf8");
  assert.match(hook, /pnpm run check:quick-fail/);
});
