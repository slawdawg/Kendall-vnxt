import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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

assertCondition(
  packageJson.scripts?.["check:workspace-coordination"] === "node ./scripts/check-workspace-coordination-report.mjs",
  "package.json must define check:workspace-coordination as node ./scripts/check-workspace-coordination-report.mjs",
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

assertCiHookBeforeCheck(
  { packageScriptName: "check:static", ciJobName: "static", ciCheckCommand: "pnpm run check:static" },
  failures,
);
assertCiBaseRefBeforeCheck(
  { packageScriptName: "check:static", ciJobName: "static", ciCheckCommand: "pnpm run check:static" },
  failures,
);
assertCiHookBeforeCheck({ packageScriptName: "check", ciJobName: "full", ciCheckCommand: "pnpm run check" }, failures);

for (const path of [workflowPath, storyPath]) {
  assertCondition(existsSync(join(rootDir, path)), `Missing workspace coordination artifact ${path}`, failures);
}

for (const packetField of [
  "- Current checkout:",
  "- Root status:",
  "- Active managed worktrees:",
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
  "full retained lane payload",
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
