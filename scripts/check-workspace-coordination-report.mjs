import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { staticBundleNames } from "./run-static-bundle.mjs";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

function readWorkspaceFile(path) {
  return readFileSync(join(rootDir, path), "utf8");
}

function readRequiredWorkspaceFile(path, failures) {
  if (!existsSync(join(rootDir, path))) {
    failures.push(`Missing workspace coordination artifact ${path}`);
    return "";
  }
  return readWorkspaceFile(path);
}

function assertCondition(condition, message, failures) {
  if (!condition) {
    failures.push(message);
  }
}

function packageCommands(scriptName) {
  return packageJson.scripts?.[scriptName]
    ?.split("&&")
    .map((script) => script.trim()) ?? [];
}

function ciJobBlock(jobName) {
  const jobStart = ciWorkflow.indexOf(`\n  ${jobName}:`);
  if (jobStart === -1) {
    return "";
  }
  const jobKeyPattern = /\n  [A-Za-z0-9_-]+:\n/g;
  jobKeyPattern.lastIndex = jobStart + `\n  ${jobName}:`.length;
  const nextJob = jobKeyPattern.exec(ciWorkflow);
  return nextJob ? ciWorkflow.slice(jobStart, nextJob.index) : ciWorkflow.slice(jobStart);
}

function ciMatrixBundleNames(jobName) {
  return [...ciJobBlock(jobName).matchAll(/^\s+- ([a-z][a-z-]*)$/gm)].map((match) => match[1]);
}

function assertCiHookBeforeCheck({ packageScriptName, ciJobName, ciCheckCommand }, failures) {
  const packageScript = packageJson.scripts?.[packageScriptName];
  if (!packageScript?.includes("pnpm run test:codex-workspace")) {
    return;
  }

  const job = ciJobBlock(ciJobName);
  const hookConfigIndex = job.indexOf("git config core.hooksPath .githooks");
  const checkCommandIndex = job.indexOf(ciCheckCommand);
  assertCondition(
    job,
    `${ciWorkflowPath} must define the ${ciJobName} job`,
    failures,
  );
  assertCondition(
    job && hookConfigIndex !== -1,
    `${ciWorkflowPath} must configure core.hooksPath in the ${ciJobName} job before running ${ciCheckCommand} because ${packageScriptName} runs test:codex-workspace`,
    failures,
  );
  assertCondition(
    job && hookConfigIndex !== -1 && checkCommandIndex !== -1 && hookConfigIndex < checkCommandIndex,
    `${ciWorkflowPath} must configure core.hooksPath before ${ciCheckCommand} in the ${ciJobName} job`,
    failures,
  );
}

function assertCiBaseRefBeforeCheck({ packageScriptName, ciJobName, ciCheckCommand }, failures) {
  const packageScript = packageJson.scripts?.[packageScriptName];
  if (!packageScript?.includes("pnpm run test:codex-workspace")) {
    return;
  }

  const job = ciJobBlock(ciJobName);
  const baseFetchIndex = job.indexOf("git fetch origin main:refs/remotes/origin/main");
  const checkCommandIndex = job.indexOf(ciCheckCommand);
  assertCondition(
    job && baseFetchIndex !== -1,
    `${ciWorkflowPath} must fetch origin/main in the ${ciJobName} job before running ${ciCheckCommand} because ${packageScriptName} runs test:codex-workspace`,
    failures,
  );
  assertCondition(
    job && baseFetchIndex !== -1 && checkCommandIndex !== -1 && baseFetchIndex < checkCommandIndex,
    `${ciWorkflowPath} must fetch origin/main before ${ciCheckCommand} in the ${ciJobName} job`,
    failures,
  );
}

function assertCiTextOrder({ ciJobName, beforeText, afterText, message }, failures) {
  const job = ciJobBlock(ciJobName);
  const beforeIndex = job.indexOf(beforeText);
  const afterIndex = job.indexOf(afterText);
  assertCondition(job, `${ciWorkflowPath} must define the ${ciJobName} job`, failures);
  assertCondition(
    job && beforeIndex !== -1,
    `${ciWorkflowPath} ${ciJobName} job must include ${beforeText}`,
    failures,
  );
  assertCondition(
    job && afterIndex !== -1,
    `${ciWorkflowPath} ${ciJobName} job must include ${afterText}`,
    failures,
  );
  assertCondition(
    job && beforeIndex !== -1 && afterIndex !== -1 && beforeIndex < afterIndex,
    message,
    failures,
  );
}

function assertCiJobIncludes(ciJobName, requiredText, message, failures) {
  const job = ciJobBlock(ciJobName);
  assertCondition(job, `${ciWorkflowPath} must define the ${ciJobName} job`, failures);
  assertCondition(job.includes(requiredText), message, failures);
}

const failures = [];
const workflowPath = "docs/workflows/workspace-coordination-report.md";
const storyPath = "docs/workflows/implementation-evidence-boundary.md";
const ciWorkflowPath = ".github/workflows/ci.yml";
const packageJsonSource = readRequiredWorkspaceFile("package.json", failures);
const packageJson = packageJsonSource ? JSON.parse(packageJsonSource) : {};
const workflow = readRequiredWorkspaceFile(workflowPath, failures);
const story = readRequiredWorkspaceFile(storyPath, failures);
const storyIndex = readRequiredWorkspaceFile("docs/workflows/implementation-evidence-boundary.md", failures);
const ciWorkflow = readRequiredWorkspaceFile(ciWorkflowPath, failures);
const fastWorkflowRunner = readRequiredWorkspaceFile("scripts/run-fast-workflow-checks.mjs", failures);
const workspaceScript = readRequiredWorkspaceFile("scripts/codex-workspace.mjs", failures);
const workspaceTest = readRequiredWorkspaceFile("scripts/test-codex-workspace.mjs", failures);

assertCondition(
  packageJson.scripts?.["check:workspace-coordination"] === "node ./scripts/check-workspace-coordination-report.mjs",
  "package.json must define check:workspace-coordination as node ./scripts/check-workspace-coordination-report.mjs",
  failures,
);
assertCondition(
  packageJson.scripts?.["check:fast"] === "node ./scripts/run-fast-workflow-checks.mjs all",
  "package.json must define check:fast as node ./scripts/run-fast-workflow-checks.mjs all",
  failures,
);
assertCondition(
  packageJson.scripts?.["check:workspace-fast"] === "node ./scripts/run-fast-workflow-checks.mjs workspace",
  "package.json must define check:workspace-fast as node ./scripts/run-fast-workflow-checks.mjs workspace",
  failures,
);
assertCondition(
  packageCommands("check:static")[0] === "pnpm run check:fast",
  "pnpm run check:static must run pnpm run check:fast before the long static chain",
  failures,
);
assertCondition(
  packageJson.scripts?.["check:static-workspace"] === "node ./scripts/run-static-bundle.mjs workspace",
  "package.json must define check:static-workspace as node ./scripts/run-static-bundle.mjs workspace",
  failures,
);
assertCondition(
  packageCommands("check")[0] === "pnpm run preflight" &&
    packageCommands("check")[1] === "pnpm run check:fast",
  "pnpm run check must run preflight and then pnpm run check:fast before the long full chain",
  failures,
);
assertCondition(
  packageJson.scripts?.check
    ?.split("&&")
    .map((script) => script.trim())
    .includes("pnpm run check:workspace-coordination"),
    "pnpm run check must include pnpm run check:workspace-coordination",
  failures,
);
const workspaceFastRunnerMatch = fastWorkflowRunner.match(/workspace:\s*\[([\s\S]*?)\],\s*sandbox:/);
const workspaceFastCommands = workspaceFastRunnerMatch
  ? [...workspaceFastRunnerMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1])
  : [];
assertCondition(
  JSON.stringify(workspaceFastCommands) === JSON.stringify([
    "test:codex-workspace-state",
    "test:workspace-command-resolution",
    "test:base-checkout-recovery",
    "test:mutation-admission",
    "test:mutation-admission-workspace-handoff",
    "test:mutation-admission-prewrite-guard",
    "test:codex-workspace:delivery",
    "test:workspace-fast-profile",
  ]),
  "Fast workflow runner must preserve the exact bounded workspace delivery command allowlist",
  failures,
);
assertCondition(
  !workspaceFastCommands.includes("test:codex-workspace"),
  "Fast workflow runner must not invoke the raw full Codex workspace fixture",
  failures,
);

assertCiHookBeforeCheck({ packageScriptName: "check", ciJobName: "full", ciCheckCommand: "pnpm run check" }, failures);
assertCiBaseRefBeforeCheck({ packageScriptName: "check", ciJobName: "full", ciCheckCommand: "pnpm run check" }, failures);
for (const ciJobName of ["fast", "full"]) {
  assertCiTextOrder(
    {
      ciJobName,
      beforeText: "git config core.hooksPath .githooks",
      afterText: "pnpm run check:fast",
      message: `${ciWorkflowPath} must configure core.hooksPath before pnpm run check:fast in the ${ciJobName} job`,
    },
    failures,
  );
  assertCiTextOrder(
    {
      ciJobName,
      beforeText: "git fetch origin main:refs/remotes/origin/main",
      afterText: "pnpm run check:fast",
      message: `${ciWorkflowPath} must fetch origin/main before pnpm run check:fast in the ${ciJobName} job`,
    },
    failures,
  );
}
assertCiTextOrder(
  {
    ciJobName: "fast",
    beforeText: "pnpm install --frozen-lockfile",
    afterText: "pnpm run check:fast",
    message: `${ciWorkflowPath} must install JavaScript dependencies before running dependency-backed fast checks`,
  },
  failures,
);
for (const beforeText of [
  "pnpm install --frozen-lockfile",
  "git config core.hooksPath .githooks",
  "git fetch origin main:refs/remotes/origin/main",
]) {
  assertCiTextOrder(
    {
      ciJobName: "static_bundle",
      beforeText,
      afterText: 'node ./scripts/run-static-bundle.mjs "${{ matrix.bundle }}"',
      message: `${ciWorkflowPath} must run ${beforeText} before static bundle reporting checks`,
    },
    failures,
  );
}
assertCondition(
  ciJobBlock("static").includes("- fast"),
  `${ciWorkflowPath} static job must depend on the fast job`,
  failures,
);
assertCondition(
  ciJobBlock("static").includes("- static_bundle") &&
    ciJobBlock("static").includes("Verify required static bundle gate") &&
    ciJobBlock("static").includes("Static bundle checks were required but did not pass"),
  `${ciWorkflowPath} static job must fan in the required static_bundle matrix result`,
  failures,
);
assertCondition(
  ciJobBlock("static").includes("needs.changes.outputs.static == 'true'"),
  `${ciWorkflowPath} static job must run only when the changed-file planner requires static checks`,
  failures,
);
assertCondition(
  ciJobBlock("static_bundle").includes("needs.changes.outputs.static == 'true'") &&
    ciJobBlock("static_bundle").includes("fail-fast: false") &&
    !ciJobBlock("static_bundle").includes("continue-on-error: true"),
  `${ciWorkflowPath} static_bundle job must be required and run only when the changed-file planner requires static checks`,
  failures,
);
assertCondition(
  JSON.stringify(ciMatrixBundleNames("static_bundle")) === JSON.stringify(staticBundleNames().filter((name) => name !== "workspace")),
  `${ciWorkflowPath} static_bundle matrix must omit workspace because required behavior profiles cover that route`,
  failures,
);
for (const requiredText of [
  'node ./scripts/run-static-bundle.mjs "${{ matrix.bundle }}"',
  '--report "$report_dir/${{ matrix.bundle }}.json"',
  '--head-sha "${{ github.event.pull_request.head.sha }}"',
  "actions/upload-artifact@v4",
  "static-bundle-report-${{ matrix.bundle }}",
  "${{ runner.temp }}/static-bundle-reports/${{ matrix.bundle }}.json",
]) {
  assertCiJobIncludes(
    "static_bundle",
    requiredText,
    `${ciWorkflowPath} static_bundle job must include ${requiredText}`,
    failures,
  );
}
assertCondition(
  ciJobBlock("static_bundle_summary").includes("continue-on-error: true") &&
    ciJobBlock("static_bundle_summary").includes("- changes") &&
    ciJobBlock("static_bundle_summary").includes("- static") &&
    ciJobBlock("static_bundle_summary").includes("- static_bundle") &&
    ciJobBlock("static_bundle_summary").includes("needs.changes.outputs.static == 'true'"),
  `${ciWorkflowPath} static_bundle_summary job must remain reporting-only and summarize required bundle reports when the planner selects static checks`,
  failures,
);
for (const requiredText of [
  "Download static bundle timing reports\n        continue-on-error: true",
  "actions/download-artifact@v4",
  "pattern: static-bundle-report-*",
  "merge-multiple: true",
  "node ./scripts/summarize-static-bundle-reports.mjs",
  '--reports-dir "${RUNNER_TEMP}/static-bundle-reports"',
  '--head-sha "${{ github.event.pull_request.head.sha }}"',
  '--static-result "${{ needs.static.result }}"',
  '--static-bundle-result "${{ needs.static_bundle.result }}"',
  "--static-bundle-required",
  "actions/upload-artifact@v4",
  "name: static-bundle-summary",
  "${{ runner.temp }}/static-bundle-summary/static-bundle-summary.json",
]) {
  assertCiJobIncludes(
    "static_bundle_summary",
    requiredText,
    `${ciWorkflowPath} static_bundle_summary job must include ${requiredText}`,
    failures,
  );
}
assertCondition(
  ciJobBlock("check").includes("- fast") &&
    ciJobBlock("check").includes('needs.fast.result') &&
    ciJobBlock("check").includes("Fast workflow checks failed or did not complete"),
  `${ciWorkflowPath} final check job must require the fast job result`,
  failures,
);
assertCondition(
  ciJobBlock("check").includes('needs.changes.outputs.static') &&
    ciJobBlock("check").includes("Static checks were required but did not pass"),
  `${ciWorkflowPath} final check job must require static checks only when the planner selects them`,
  failures,
);
assertCondition(
  ciJobBlock("static").includes("static_bundle") &&
    !ciJobBlock("check").includes("static_bundle"),
  `${ciWorkflowPath} final check job must require static_bundle through the retained static fan-in job`,
  failures,
);
assertCondition(
  !ciJobBlock("check").includes("static_bundle_summary"),
  `${ciWorkflowPath} final check job must not require static_bundle_summary while bundles are reporting-only`,
  failures,
);

for (const path of [workflowPath, storyPath]) {
  assertCondition(existsSync(join(rootDir, path)), `Missing workspace coordination artifact ${path}`, failures);
}

for (const packetField of [
  "- Current checkout:",
  "- Root status:",
  "- Active managed worktrees:",
  "- Workspace stale-lane closeout readiness:",
  "- PRs waiting at merge gate:",
  "- Clean active lanes:",
  "- Dirty active lanes:",
  "- Local-only commits:",
  "- Closed but retained lanes:",
  "- Cleanup candidates:",
  "- Blocked approval packets:",
  "- Next safe slice:",
  "- Stop lines:",
]) {
  assertCondition(workflow.includes(packetField), `Workspace coordination report must include ${packetField}`, failures);
}

for (const classification of [
  "clean active lane",
  "dirty active lane",
  "workspaceCloseoutReadiness",
  "currently owned active work",
  "stale manager-owned lane",
  "dirty preserve-first lane",
  "clean closeout candidate",
  "needs operator decision",
  "merge-gated lane",
  "local-only commit",
  "no-source refresh lane",
  "cleanup candidate",
  "manifest repair candidate",
  "remote branch cleanup candidate",
  "superseded PR",
  "dependency security bump",
  "policy-approved low-risk delivery",
]) {
  assertCondition(workflow.includes(classification), `Workspace coordination workflow must define ${classification}`, failures);
}

for (const stopLine of [
  "Merge a PR.",
  "Delete a worktree.",
  "Delete a local or remote branch.",
  "Discard local commits.",
  "Rewrite a shared branch.",
  "Resolve a review thread that has not been addressed.",
  "Start work in a lane whose scope overlaps an active dirty lane.",
  "Create an empty PR for a verified no-source refresh lane.",
  "Mutate an active workspace branch owned by another runner.",
  "Repair an active or unreadable workspace manifest without explicit inspection.",
  "Delete a remote branch with no PR record, a SHA mismatch, an open PR, or an",
]) {
  assertCondition(workflow.includes(stopLine), `Workspace coordination workflow must preserve stop line ${stopLine}`, failures);
}

for (const requiredText of [
  "node ./scripts/codex-workspace.mjs start",
  "Open PRs waiting at a merge gate.",
  "Dirty active lanes.",
  "Authority lanes owned by other sessions.",
  "GitHub branch protection and rulesets can lower merge risk",
  "Merge only the exact reviewed head SHA; do not bypass branch protection.",
  "gh pr merge <number> --merge --delete-branch --match-head-commit <headRefOid>",
  "gh pr diff <number> --name-only",
  "temporary detached worktree from the",
  "read-only `$HOME/.cache/uv` error",
  "record the inconclusive result",
  "Remote Branch Cleanup Rules",
  "Manifest Repair Rules",
  "node ./scripts/codex-workspace.mjs repair-manifests --dry-run",
  "node ./scripts/codex-workspace.mjs repair-manifests --apply",
  "limited to closed legacy manifests",
  "Active malformed",
  "unreadable JSON, missing identity fields",
  "node ./scripts/codex-workspace.mjs list --active --json",
  "node ./scripts/codex-workspace.mjs coordination-report",
  "node ./scripts/codex-workspace.mjs coordination-report --json",
  "node ./scripts/codex-workspace.mjs coordination-report --summary-json",
  "bounded automation form",
  "metadata-only coordination-report section",
  "full retained lane payload",
  "groups blocked packet and backlog statuses by count",
  "It must not create branches, worktrees, commits, PRs, merges, cleanup actions",
  "origin/<branch>` SHA exactly equals the merged",
  "Proof for low-risk delivery must come from current GitHub PR metadata",
  "Generic continuation is not standing approval.",
  "do not create an empty PR",
  "finish-pr",
  "do not invent a source diff",
  "policy-approved low-risk delivery checklist",
  "This workflow does not merge PRs, clean worktrees, delete branches",
]) {
  assertCondition(workflow.includes(requiredText), `Workspace coordination workflow must include ${requiredText}`, failures);
}

for (const scriptText of [
  "workspaceCloseoutReadiness",
  "buildWorkspaceCloseoutReadiness",
  "workspace-closeout-readiness/v0",
  "dirtyPreserveFirstLanes",
  "dirty_preserve_first",
  "stale_manager_owner",
  "cleanCloseoutCandidates",
  "clean_cleanup_status",
  "metadataOnly",
]) {
  assertCondition(workspaceScript.includes(scriptText), `codex-workspace coordination report must preserve ${scriptText}`, failures);
}

for (const testText of [
  "coordination-report classifies workspace stale-lane closeout readiness metadata only",
  "readiness.counts.currentlyOwnedActiveWork === 1",
  "readiness.counts.staleManagerOwnedLanes === 1",
  "readiness.counts.dirtyPreserveFirstLanes === 1",
  "readiness.counts.cleanCloseoutCandidates === 1",
  "readiness.counts.needsOperatorDecision === 1",
  "coordination-report closeout readiness fails closed for unsafe edge cases",
  "coordination-report closeout readiness summary truncates bucket rows but keeps full counts",
  "coordination closeout readiness report mutated manifests",
]) {
  assertCondition(workspaceTest.includes(testText), `codex-workspace tests must preserve ${testText}`, failures);
}

for (const storyText of [
  "multiple managed worktrees are active",
  "cleanup dry-run and a narrow approval packet",
  "starting a non-overlapping",
  "managed worktree",
  "pnpm run check:workspace-coordination",
  "does not merge PRs, clean worktrees, delete branches",
]) {
  assertCondition(story.includes(storyText), `Story 22.1 must preserve ${storyText}`, failures);
}

assertCondition(
  storyIndex.includes("22-1-workspace-coordination-report.md"),
  "Story index must reference Story 22.1 workspace coordination report",
  failures,
);

if (failures.length > 0) {
  console.error("Workspace coordination report drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: workspace coordination report drift checks passed.");
