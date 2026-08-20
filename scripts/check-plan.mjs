#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { relative } from "node:path";
import { resolveWorkspaceCommand } from "./lib/workspace-command-resolution.mjs";
import { staticBundleNames } from "./run-static-bundle.mjs";
import { WORKSPACE_TEST_PROFILE_NAMES } from "./lib/codex-workspace-test-profiles.mjs";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const JS_SYNTAX_EXTENSIONS = new Set([".js", ".mjs", ".cjs"]);
const JSON_EXTENSION = ".json";

const COMMANDS = Object.freeze({
  checkDocs: ["pnpm", "run", "check:docs"],
  checkGithubWorkflowPolicy: ["pnpm", "run", "check:github-workflow-policy"],
  checkWorkspaceCoordination: ["pnpm", "run", "check:workspace-coordination"],
  checkManagerControlPlane: ["pnpm", "run", "check:manager-control-plane"],
  testManagerControlPlanePreflight: ["pnpm", "run", "test:manager-control-plane:preflight"],
  testManagerControlPlaneFull: ["pnpm", "run", "test:manager-control-plane:full"],
  testManagerControlPlaneDispatcherPort: ["pnpm", "run", "test:manager-control-plane-dispatcher-port"],
  checkWorkspaceFast: ["pnpm", "run", "check:workspace-fast"],
  buildDashboard: ["pnpm", "run", "build:dashboard"],
  testDashboardPipelineFixtures: ["pnpm", "run", "test:dashboard-pipeline-fixtures"],
  testDashboardMemoryProposals: ["pnpm", "run", "test:dashboard-memory-proposals"],
  testPipelineImplementationReadiness: ["pnpm", "run", "test:pipeline-implementation-readiness"],
  checkDashboardPipelineBoundary: ["pnpm", "run", "check:dashboard-pipeline-boundary"],
  testSupervisorRunner: ["pnpm", "run", "test:supervisor-runner"],
  testSupervisorPreflight: ["pnpm", "run", "test:supervisor:preflight"],
  testSupervisorProfile: ["pnpm", "run", "test:supervisor:profile"],
  testSandboxBoundaryClassifier: ["pnpm", "run", "test:sandbox-boundary-classifier"],
  testAntiChurnEventWriter: ["pnpm", "run", "test:anti-churn-event-writer"],
  testAntiChurnSignatureClassifier: ["pnpm", "run", "test:anti-churn-signature-classifier"],
  testCheckPlan: ["pnpm", "run", "test:check-plan"],
  testStaticBundles: ["pnpm", "run", "test:static-bundles"],
  checkStatic: ["pnpm", "run", "check:static"],
});

const SURFACE_COMMANDS = Object.freeze({
  docs: [COMMANDS.checkDocs],
  workflow: [COMMANDS.checkGithubWorkflowPolicy, COMMANDS.checkWorkspaceCoordination],
  package: [COMMANDS.checkStatic],
  manager: [COMMANDS.testManagerControlPlanePreflight, COMMANDS.testManagerControlPlaneFull, COMMANDS.checkManagerControlPlane],
  workspace: [COMMANDS.checkWorkspaceCoordination, COMMANDS.checkWorkspaceFast],
  dashboard: [COMMANDS.buildDashboard, COMMANDS.testDashboardPipelineFixtures, COMMANDS.testDashboardMemoryProposals],
  pipeline: [COMMANDS.checkDashboardPipelineBoundary, COMMANDS.testPipelineImplementationReadiness, COMMANDS.testDashboardPipelineFixtures],
  supervisor: [COMMANDS.testSupervisorRunner, COMMANDS.testSupervisorPreflight, COMMANDS.testSupervisorProfile],
  antiChurn: [COMMANDS.testSandboxBoundaryClassifier, COMMANDS.testAntiChurnEventWriter, COMMANDS.testAntiChurnSignatureClassifier],
  ciAcceleration: [COMMANDS.testCheckPlan, COMMANDS.testStaticBundles],
  managerDispatcherPort: [COMMANDS.testManagerControlPlaneDispatcherPort],
});

const SURFACE_STATIC_BUNDLES = Object.freeze({
  docs: ["core"],
  workflow: ["core"],
  manager: ["manager"],
  managerDispatcherPort: ["manager"],
  workspace: ["workspace"],
  dashboard: ["pipeline-dashboard"],
  pipeline: ["pipeline-dashboard"],
  antiChurn: ["anti-churn"],
  ciAcceleration: ["core"],
});

const SUPERVISOR_SHARDS = Object.freeze([
  "preflight", "non-integration", "integration-orchestrator-fake-workers", "integration-operational-action-v1-pause-drain",
  "integration-work-packets", "integration-bmad-import-parser", "integration-epic25-evidence-chain",
  "routing-preview-01", "routing-preview-02", "routing-preview-03", "routing-preview-04", "routing-preview-05",
  "routing-preview-06", "routing-preview-07", "routing-preview-08", "integration-review-route-packet",
  "integration-manager-source-intake-adapter", "integration-operational-action-v1-retry-reassign",
  "integration-candidate-work-api", "integration-local-dogfood-attestation", "integration-manager-terminal-events",
  "integration-supervisor-flow",
].map((id) => ({
  id,
  script: id.startsWith("routing-preview-")
    ? `test:supervisor:check-${id}`
    : `test:supervisor:check:${id.replace(/^integration-/, "integration:")}`,
})));

function commandToString(command) {
  return command.map((part) => part.includes(" ") ? JSON.stringify(part) : part).join(" ");
}

function uniqueByCommand(commands) {
  const seen = new Set();
  const unique = [];
  for (const command of commands) {
    const key = commandToString(command);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(command);
  }
  return unique;
}

function normalizePath(path) {
  return String(path || "").replaceAll("\\", "/").replace(/^\.\//, "");
}

function fileExtension(path) {
  const match = normalizePath(path).match(/(\.[^.\/]+)$/);
  return match ? match[1] : "";
}

function isDeleted(path) {
  return !existsSync(`${rootDir}/${path}`);
}

function classifyFile(path) {
  const file = normalizePath(path);
  const surfaces = new Set();
  const reasons = [];
  let requiresFullStatic = false;

  if (!file) return { surfaces: [], reasons, requiresFullStatic };

  if (/^(README\.md|AGENTS\.md|docs\/)/.test(file)) {
    surfaces.add("docs");
    reasons.push(`${file}: documentation/runbook surface`);
  }
  if (/^\.github\/workflows\//.test(file)) {
    surfaces.add("workflow");
    requiresFullStatic = true;
    reasons.push(`${file}: CI workflow changes affect check authority`);
  }
  if (/^\.githooks\/pre-push$/.test(file)) {
    surfaces.add("workflow");
    reasons.push(`${file}: local CI quick-fail hook surface`);
  }
  if (/^scripts\/check-(?:github-workflow-policy|workspace-coordination)-report\.mjs$/.test(file)) {
    surfaces.add("workflow");
    reasons.push(`${file}: CI workflow policy drift-check surface`);
  }
  if (/^(package\.json|pnpm-lock\.yaml|packages\/)/.test(file)) {
    surfaces.add("package");
    requiresFullStatic = true;
    reasons.push(`${file}: package or dependency graph changes require full static confidence`);
  }
  if (/^scripts\/preflight\.mjs$/.test(file)) {
    surfaces.add("supervisor");
    reasons.push(`${file}: supervisor preflight input surface`);
  }
  if (/^scripts\/run-fast-workflow-checks\.mjs$/.test(file)) {
    requiresFullStatic = true;
    reasons.push(`${file}: shared fast runner dispatches CI, workspace, sandbox, and dashboard suites; escalating to full static`);
  }
  if (/^scripts\/test-codex-workspace\.mjs$/.test(file)) {
    requiresFullStatic = true;
    reasons.push(`${file}: full workspace fixture runner changes require full static confidence`);
  }
  if (
    /^scripts\/(?:check-manager-control-plane|run-manager-control-plane-shards)\.mjs$/.test(file) ||
    /^scripts\/manager-/.test(file) ||
    /^scripts\/lib\/manager-control-plane\//.test(file) ||
    /^tests\/manager-control-plane/.test(file) ||
    /^tests\/manager-worker-/.test(file) ||
    /^\.agents\/skills\/kendall-manager-control-plane\//.test(file)
  ) {
    surfaces.add("manager");
    reasons.push(`${file}: manager control-plane surface`);
  }
  if (/^scripts\/run-manager-control-plane-shards\.mjs$/.test(file)) {
    surfaces.add("ciAcceleration");
    reasons.push(`${file}: manager shard runner affects CI acceleration routing`);
  }
  if (/^tests\/helpers\/manager-control-plane\/(workflow-core-loader|fixture-loader|dispatcher-port-conformance)\.mjs$/.test(file)) {
    surfaces.add("managerDispatcherPort");
    reasons.push(`${file}: manager dispatcher-port test helper surface`);
  }
  if (
    /^scripts\/codex-workspace\.mjs$/.test(file) ||
    /^scripts\/test-codex-workspace\.mjs$/.test(file) ||
    /^scripts\/lib\/(?:base-checkout-recovery|mutation-admission(?:-prewrite-guard|-workspace-handoff)?)\.mjs$/.test(file) ||
    /^scripts\/lib\/codex-workspace/.test(file) ||
    /^scripts\/lib\/workspace-command-resolution\.mjs$/.test(file) ||
    /^tests\/codex-workspace/.test(file) ||
    /^tests\/workspace-fast-profile\.test\.mjs$/.test(file) ||
    /^tests\/workspace-command-resolution/.test(file) ||
    /^docs\/workflows\/workspace-coordination-report\.md$/.test(file)
  ) {
    surfaces.add("workspace");
    reasons.push(`${file}: workspace protocol surface`);
  }
  if (/^(apps\/dashboard\/|tests\/dashboard-|tests\/e2e\/|playwright\.config\.|scripts\/.*e2e.*\.mjs$)/.test(file)) {
    surfaces.add("dashboard");
    reasons.push(`${file}: dashboard surface`);
  }
  if (/^(tests\/pipeline-|tests\/work-packet-|scripts\/pipeline-|docs\/workflows\/.*pipeline)/.test(file)) {
    surfaces.add("pipeline");
    reasons.push(`${file}: pipeline/work-packet surface`);
  }
  if (/^(services\/supervisor\/|scripts\/run-supervisor-tests\.mjs)/.test(file)) {
    surfaces.add("supervisor");
    reasons.push(`${file}: supervisor surface`);
  }
  if (/^(scripts\/.*anti-churn|scripts\/lib\/anti-churn|scripts\/lib\/sandbox-boundary|tests\/anti-churn|tests\/sandbox-boundary)/.test(file)) {
    surfaces.add("antiChurn");
    reasons.push(`${file}: anti-churn or sandbox boundary surface`);
  }
  if (/^(scripts\/run-static-bundle\.mjs|scripts\/summarize-static-bundle-reports\.mjs|tests\/static-bundles\.test\.mjs)$/.test(file)) {
    requiresFullStatic = true;
    surfaces.add("ciAcceleration");
    reasons.push(`${file}: static bundle topology changes require full static confidence`);
  }
  if (/^(scripts\/(?:check-plan|evaluate-ci-promotion-evidence|run-ci-evidence-command)\.mjs|tests\/(?:check-plan|ci-promotion-evidence|ci-evidence-command)\.test\.mjs|docs\/workflows\/ci-(?:acceleration-plan|targeted-cutover-plan)\.md)$/.test(file)) {
    surfaces.add("ciAcceleration");
    reasons.push(`${file}: CI acceleration planner surface`);
  }

  if (surfaces.size === 0) {
    requiresFullStatic = true;
    reasons.push(`${file}: no focused check mapping; escalating to full static`);
  }

  return { surfaces: [...surfaces], reasons, requiresFullStatic };
}

function buildQuickFailPlan(files = [], { base = "origin/dev", head = "HEAD" } = {}) {
  const existingFiles = files.map(normalizePath).filter((file) => file && !isDeleted(file));
  const jsFiles = existingFiles.filter((file) => JS_SYNTAX_EXTENSIONS.has(fileExtension(file)));
  const jsonFiles = existingFiles.filter((file) => fileExtension(file) === JSON_EXTENSION);
  return {
    commands: [
      { id: "git-diff-check:base", command: ["git", "diff", "--check", `${base}...${head}`], reason: "catch committed whitespace and conflict marker mistakes before broader checks" },
      { id: "git-diff-check:staged", command: ["git", "diff", "--cached", "--check"], reason: "catch staged whitespace and conflict marker mistakes before broader checks" },
      { id: "git-diff-check:unstaged", command: ["git", "diff", "--check"], reason: "catch unstaged whitespace and conflict marker mistakes before broader checks" },
      ...jsFiles.map((file) => ({ id: `node-check:${file}`, command: [process.execPath, "--check", file], reason: `syntax check changed JavaScript file ${file}` })),
    ],
    internalJsonFiles: jsonFiles,
  };
}

function buildCheckPlan(files = [], options = {}) {
  const base = options.base || "origin/dev";
  const head = options.head || "HEAD";
  const changedFiles = [...new Set(files.map(normalizePath).filter(Boolean))].sort();
  const surfaces = new Set();
  const reasons = [];
  let requiresFullStatic = false;

  for (const file of changedFiles) {
    const classification = classifyFile(file);
    classification.surfaces.forEach((surface) => surfaces.add(surface));
    reasons.push(...classification.reasons);
    requiresFullStatic = requiresFullStatic || classification.requiresFullStatic;
  }

  const selectedSurfaces = [...surfaces].sort();
  const commands = uniqueByCommand(selectedSurfaces.flatMap((surface) => SURFACE_COMMANDS[surface] || []));
  const finalCommands = requiresFullStatic ? uniqueByCommand([...commands, COMMANDS.checkStatic]) : commands;
  const quickFail = buildQuickFailPlan(changedFiles, { base, head });

  return {
    changedFiles,
    surfaces: selectedSurfaces,
    requiresFullStatic,
    reasons,
    quickFailCommands: quickFail.commands.map((entry) => ({ ...entry, commandText: commandToString(entry.command) })),
    jsonParseFiles: quickFail.internalJsonFiles,
    commands: finalCommands.map((command) => ({ command, commandText: commandToString(command) })),
  };
}

function buildStaticBundleSelection(plan) {
  const bundleNames = staticBundleNames();
  const reasonsByBundle = new Map();
  const unknownPath = plan.reasons.some((reason) => reason.includes("no focused check mapping"));

  if (plan.requiresFullStatic) {
    const reason = unknownPath
      ? "fail-closed: an unmapped path requires broad static confidence"
      : "elevated: a shared or high-risk change requires broad static confidence";
    for (const bundleName of bundleNames) reasonsByBundle.set(bundleName, [reason]);
  } else {
    for (const surface of plan.surfaces) {
      for (const bundleName of SURFACE_STATIC_BUNDLES[surface] || []) {
        const reasons = reasonsByBundle.get(bundleName) || [];
        reasons.push(`affected ${surface} surface`);
        reasonsByBundle.set(bundleName, reasons);
      }
    }
  }

  return bundleNames.map((bundleName) => ({
    id: bundleName,
    selected: reasonsByBundle.has(bundleName),
    reasons: reasonsByBundle.get(bundleName) || ["not selected by affected-domain routing"],
  }));
}

function buildRequiredGateSelection({ static: staticRequired, javascript, supervisor }) {
  const selected = [{ id: "fast", reason: "PR integrity baseline" }];
  const skipped = [];

  for (const [id, selectedByCurrentRoute, selectedReason] of [
    ["static", staticRequired, "broad static matrix required by elevated routing"],
    ["javascript", javascript, "JavaScript/dashboard gate required by the changed risk surface"],
    ["supervisor", supervisor, "supervisor gate required by the changed risk surface"],
  ]) {
    if (selectedByCurrentRoute) selected.push({ id, reason: selectedReason });
    else skipped.push({ id, reason: "not required by the current conservative PR route" });
  }

  return { selected, skipped };
}

const WORKSPACE_PROFILE_PATHS = Object.freeze([
  [/^scripts\/lib\/base-checkout-recovery\.mjs$/, "discovery-readonly"],
  [/^scripts\/lib\/mutation-admission(?:-prewrite-guard|-workspace-handoff)?\.mjs$/, "assignment-lease"],
  [/^(scripts\/lib\/workspace-command-resolution\.mjs|tests\/(?:workspace-command-resolution|workspace-fast-profile)\.test\.mjs)$/, "shared-core"],
]);

const SUPERVISOR_SHARD_PATHS = Object.freeze([
  [/^services\/supervisor\/tests\/integration\/test_orchestrator_fake_workers\.py$/, ["integration-orchestrator-fake-workers"]],
  [/^services\/supervisor\/tests\/integration\/test_operational_action_v1_pause_drain\.py$/, ["integration-operational-action-v1-pause-drain"]],
  [/^services\/supervisor\/tests\/integration\/test_work_packets\.py$/, ["integration-work-packets"]],
  [/^services\/supervisor\/tests\/integration\/test_bmad_import_parser\.py$/, ["integration-bmad-import-parser"]],
  [/^services\/supervisor\/tests\/integration\/test_epic25_evidence_chain\.py$/, ["integration-epic25-evidence-chain"]],
  [/^services\/supervisor\/tests\/integration\/test_routing_preview\.py$/, SUPERVISOR_SHARDS.filter((shard) => shard.id.startsWith("routing-preview-")).map((shard) => shard.id)],
  [/^services\/supervisor\/tests\/integration\/test_review_route_packet\.py$/, ["integration-review-route-packet"]],
  [/^services\/supervisor\/tests\/integration\/test_manager_source_intake_adapter\.py$/, ["integration-manager-source-intake-adapter"]],
  [/^services\/supervisor\/tests\/integration\/test_operational_action_v1_retry_reassign\.py$/, ["integration-operational-action-v1-retry-reassign"]],
  [/^services\/supervisor\/tests\/integration\/test_candidate_work_api\.py$/, ["integration-candidate-work-api"]],
  [/^services\/supervisor\/tests\/integration\/test_local_dogfood_attestation\.py$/, ["integration-local-dogfood-attestation"]],
  [/^services\/supervisor\/tests\/integration\/test_manager_terminal_events\.py$/, ["integration-manager-terminal-events"]],
  [/^services\/supervisor\/tests\/integration\/test_supervisor_flow\.py$/, ["integration-supervisor-flow"]],
]);

function buildBehaviorShardSelection({ changedFiles, surfaces, requiresFullStatic, supervisor }) {
  const workspaceSelected = requiresFullStatic || surfaces.has("workspace");
  const supervisorSelected = supervisor;
  const workspaceProfiles = new Map();
  const supervisorShardIds = new Map();
  const files = changedFiles || [];

  if (workspaceSelected) {
    if (requiresFullStatic) {
      for (const id of WORKSPACE_TEST_PROFILE_NAMES) workspaceProfiles.set(id, "elevated static confidence includes all workspace behaviors");
    } else {
      for (const file of files) {
        for (const [pattern, profile] of WORKSPACE_PROFILE_PATHS) {
          if (pattern.test(file)) workspaceProfiles.set(profile, `affected workspace implementation: ${file}`);
        }
      }
      if (workspaceProfiles.size === 0) {
        for (const id of WORKSPACE_TEST_PROFILE_NAMES) workspaceProfiles.set(id, "workspace surface lacks a precise behavior mapping; retaining all behaviors");
      } else {
        workspaceProfiles.set("shared-core", workspaceProfiles.get("shared-core") || "shared workspace safety baseline for a focused behavior profile");
      }
    }
  }

  if (supervisorSelected) {
    if (requiresFullStatic) {
      for (const shard of SUPERVISOR_SHARDS) supervisorShardIds.set(shard.id, "elevated confidence includes all supervisor behaviors");
    } else {
      for (const file of files) {
        for (const [pattern, shardIds] of SUPERVISOR_SHARD_PATHS) {
          if (pattern.test(file)) {
            for (const id of shardIds) supervisorShardIds.set(id, `affected supervisor integration test: ${file}`);
          }
        }
        if (/^services\/supervisor\/tests\/test_.*\.py$/.test(file)) supervisorShardIds.set("non-integration", `affected supervisor non-integration test: ${file}`);
      }
      if (supervisorShardIds.size === 0) {
        for (const shard of SUPERVISOR_SHARDS) supervisorShardIds.set(shard.id, "supervisor surface lacks a precise behavior mapping; retaining all behaviors");
      } else {
        supervisorShardIds.set("preflight", supervisorShardIds.get("preflight") || "shared supervisor preflight baseline for a focused behavior shard");
        supervisorShardIds.set("non-integration", supervisorShardIds.get("non-integration") || "shared supervisor non-integration safety baseline for a focused behavior shard");
      }
    }
  }

  return {
    workspaceProfiles: WORKSPACE_TEST_PROFILE_NAMES.filter((id) => workspaceProfiles.has(id)).map((id) => ({ id, reason: workspaceProfiles.get(id) })),
    supervisorShards: SUPERVISOR_SHARDS.filter((shard) => supervisorShardIds.has(shard.id)).map((shard) => ({ ...shard, reason: supervisorShardIds.get(shard.id) })),
  };
}

function buildCiOutputs(plan) {
  const changedFiles = new Set(plan.changedFiles);
  const packageOrWorkflowChanged = [...changedFiles].some((file) =>
    /^(package\.json|pnpm-lock\.yaml|packages\/|\.github\/workflows\/)/.test(file)
  );
  const surfaces = new Set(plan.surfaces);
  const staticBundleSelection = buildStaticBundleSelection(plan);
  const unknownPath = plan.reasons.some((reason) => reason.includes("no focused check mapping"));
  const routingMode = unknownPath ? "fail-closed-unknown" : plan.requiresFullStatic ? "elevated" : "affected";
  const staticRequired = plan.requiresFullStatic;
  const javascript = packageOrWorkflowChanged || surfaces.has("dashboard");
  const supervisor = packageOrWorkflowChanged || surfaces.has("supervisor");
  const requiredGateSelection = buildRequiredGateSelection({ static: staticRequired, javascript, supervisor });
  const behaviorShards = buildBehaviorShardSelection({ changedFiles: plan.changedFiles, surfaces, requiresFullStatic: staticRequired, supervisor });
  return {
    static: staticRequired,
    javascript,
    supervisor,
    requiresFullStatic: plan.requiresFullStatic,
    surfaces: plan.surfaces,
    changedFiles: plan.changedFiles,
    commands: plan.commands.map((command) => command.commandText),
    routingMode,
    routingReasons: plan.reasons,
    selectedStaticBundles: staticBundleSelection.filter((bundle) => bundle.selected),
    skippedStaticBundles: staticBundleSelection.filter((bundle) => !bundle.selected),
    requiredGates: requiredGateSelection.selected,
    skippedRequiredGates: requiredGateSelection.skipped,
    selectedWorkspaceProfiles: behaviorShards.workspaceProfiles,
    selectedSupervisorShards: behaviorShards.supervisorShards,
  };
}

function runCommand(command, { label = commandToString(command) } = {}) {
  const [tool, ...args] = command;
  const resolved = resolveWorkspaceCommand(tool, args);
  const start = Date.now();
  console.log(`RUN ${label}`);
  const result = spawnSync(resolved.command, resolved.args, {
    cwd: rootDir,
    env: resolved.env ?? process.env,
    stdio: "inherit",
  });
  const durationMs = Date.now() - start;
  if (result.status !== 0) {
    console.error(`FAIL ${label} (${durationMs}ms)`);
    return false;
  }
  console.log(`OK ${label} (${durationMs}ms)`);
  return true;
}

function runQuickFail(plan) {
  for (const command of plan.quickFailCommands) {
    if (!runCommand(command.command, { label: command.commandText })) return false;
  }
  for (const file of plan.jsonParseFiles) {
    try {
      JSON.parse(readFileSync(`${rootDir}/${file}`, "utf8"));
      console.log(`OK json-parse ${file}`);
    } catch (error) {
      console.error(`FAIL json-parse ${file}: ${error.message}`);
      return false;
    }
  }
  return true;
}

function runChangedPlan(plan) {
  if (!runQuickFail(plan)) return false;
  if (plan.commands.length === 0) {
    console.log("OK no focused changed-file commands were required.");
    return true;
  }
  for (const command of plan.commands) {
    if (!runCommand(command.command, { label: command.commandText })) return false;
  }
  return true;
}

function gitLines(args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, { cwd: rootDir, encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) {
    if (allowFailure) return [];
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    const detail = stderr || stdout || `git exited with status ${result.status}`;
    throw new Error(`Failed to collect changed files with git ${args.join(" ")}: ${detail}`);
  }
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function collectChangedFiles({ base = "origin/dev", head = "HEAD", explicitFiles = [] } = {}) {
  if (explicitFiles.length > 0) return explicitFiles.map(normalizePath);
  const committed = gitLines(["diff", "--name-only", `${base}...${head}`]);
  const staged = gitLines(["diff", "--name-only", "--cached"]);
  const unstaged = gitLines(["diff", "--name-only"]);
  const untracked = gitLines(["ls-files", "--others", "--exclude-standard"]);
  return [...new Set([...committed, ...staged, ...unstaged, ...untracked].map(normalizePath))].sort();
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    base: "origin/dev",
    head: "HEAD",
    json: false,
    ciOutputs: false,
    run: false,
    quickFailOnly: false,
    files: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base") options.base = argv[++index] || "";
    else if (arg === "--head") options.head = argv[++index] || "";
    else if (arg === "--json") options.json = true;
    else if (arg === "--ci-outputs") options.ciOutputs = true;
    else if (arg === "--run") options.run = true;
    else if (arg === "--quick-fail") options.quickFailOnly = true;
    else if (arg === "--files") options.files = (argv[++index] || "").split(",").map((file) => file.trim()).filter(Boolean);
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node ./scripts/check-plan.mjs [--base origin/dev] [--head HEAD] [--files a,b] [--json] [--ci-outputs] [--run] [--quick-fail]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function printPlan(plan) {
  console.log(`Changed files: ${plan.changedFiles.length}`);
  for (const file of plan.changedFiles) console.log(`- ${file}`);
  console.log(`Surfaces: ${plan.surfaces.length ? plan.surfaces.join(", ") : "none"}`);
  console.log(`Requires full static: ${plan.requiresFullStatic ? "yes" : "no"}`);
  if (plan.reasons.length > 0) {
    console.log("Reasons:");
    for (const reason of plan.reasons) console.log(`- ${reason}`);
  }
  console.log("Quick-fail commands:");
  for (const command of plan.quickFailCommands) console.log(`- ${command.commandText}`);
  for (const file of plan.jsonParseFiles) console.log(`- json-parse ${file}`);
  console.log("Focused commands:");
  for (const command of plan.commands) console.log(`- ${command.commandText}`);
}

function main() {
  const options = parseArgs();
  const changedFiles = collectChangedFiles({ base: options.base, head: options.head, explicitFiles: options.files });
  const plan = buildCheckPlan(changedFiles, { base: options.base, head: options.head });
  if (options.ciOutputs) {
    console.log(JSON.stringify(buildCiOutputs(plan), null, 2));
  } else if (options.json) {
    console.log(JSON.stringify(plan, null, 2));
  } else {
    printPlan(plan);
  }
  if (options.quickFailOnly && !runQuickFail(plan)) process.exit(1);
  if (options.run && !runChangedPlan(plan)) process.exit(1);
}

const invokedPath = process.argv[1] ? normalizePath(relative(rootDir, process.argv[1])) : "";
if (invokedPath === "scripts/check-plan.mjs") {
  try {
    main();
  } catch (error) {
    console.error(`FAIL check-plan: ${error.message}`);
    process.exit(1);
  }
}

export {
  buildCheckPlan,
  buildCiOutputs,
  buildQuickFailPlan,
  classifyFile,
  collectChangedFiles,
};
