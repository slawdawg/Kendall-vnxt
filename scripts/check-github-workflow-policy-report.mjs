import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

function readWorkspaceFile(path) {
  return readFileSync(join(rootDir, path), "utf8");
}

function assertCondition(condition, message, failures) {
  if (!condition) {
    failures.push(message);
  }
}

function assertIncludes(source, text, label, failures) {
  assertCondition(source.includes(text), `${label} must include ${text}`, failures);
}

const packageJson = JSON.parse(readWorkspaceFile("package.json"));
const readme = readWorkspaceFile("README.md");
const connectorWorkflow = readWorkspaceFile("docs/github-connector-workflow.md");
const currentSessionRunbook = readWorkspaceFile("docs/workflows/current-session-runbook.md");
const serviceSource = readWorkspaceFile("services/supervisor/src/supervisor/application/service.py");
const apiSource = readWorkspaceFile("services/supervisor/src/supervisor/api/main.py");
const dashboardClient = readWorkspaceFile("apps/dashboard/src/lib/supervisor.ts");
const controlsPage = readWorkspaceFile("apps/dashboard/src/app/controls/page.tsx");
const reportShortcuts = readWorkspaceFile("apps/dashboard/src/lib/report-shortcuts.ts");
const githubPolicyPanel = readWorkspaceFile("apps/dashboard/src/components/github-workflow-policy-report-panel.tsx");
const controlsSpec = readWorkspaceFile("tests/e2e/dashboard.spec.ts");
const supervisorTests = readWorkspaceFile("services/supervisor/tests/integration/test_routing_preview.py");
const storyIndex = readWorkspaceFile("docs/workflows/implementation-evidence-boundary.md");
const reconciliation = readWorkspaceFile("docs/architecture/kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md");
const githubDoctor = readWorkspaceFile("scripts/github-sync-doctor.mjs");

const failures = [];

assertCondition(
  packageJson.scripts?.["check:github-workflow-policy"] === "node ./scripts/check-github-workflow-policy-report.mjs",
  "package.json must define check:github-workflow-policy as node ./scripts/check-github-workflow-policy-report.mjs",
  failures,
);
assertCondition(
  packageJson.scripts?.["check:static"]?.includes("pnpm run check:github-workflow-policy"),
  "pnpm run check:static must include pnpm run check:github-workflow-policy",
  failures,
);
assertCondition(
  packageJson.scripts?.check?.includes("pnpm run check:github-workflow-policy"),
  "pnpm run check must include pnpm run check:github-workflow-policy",
  failures,
);
assertCondition(
  packageJson.scripts?.["doctor:github"] === "node ./scripts/github-sync-doctor.mjs",
  "package.json must retain doctor:github as node ./scripts/github-sync-doctor.mjs",
  failures,
);

for (const text of [
  "pnpm run check:github-workflow-policy",
  "Git/GCM, Codex connector, optional gh auth, connector probe, and plaintext-token stop-line alignment",
  "GitHub workflow policy drift checks",
]) {
  assertIncludes(readme, text, "README developer checks", failures);
}

for (const text of [
  "pnpm run check:github-workflow-policy",
  "This runbook also anchors runbook verification for the active check chain.",
]) {
  assertIncludes(currentSessionRunbook, text, "Current session runbook", failures);
}

for (const text of [
  "Use the platform's normal secure Git credential helper for ordinary",
  "`git fetch`, `git pull`, and `git push`.",
  "Use the Codex GitHub connector/app for repository inspection, PR reads, PR creation, review requests, draft/ready transitions, and other Codex-managed GitHub operations.",
  "Use local `gh` auth only for workflows that explicitly shell out to `gh`.",
  "Do not keep a persistent `gh auth login --insecure-storage` token",
  "Use the GitHub connector to list the five most recent pull requests for slawdawg/Kendall-vnxt.",
  "GitHub connector probe: passed; recent PRs visible for slawdawg/Kendall-vnxt.",
  "If the connector is unavailable, do not switch to plaintext token storage.",
  "pnpm run doctor:github -- --remote",
  "git push origin <branch>",
  "Keep `gh auth status` warnings non-blocking unless the workflow explicitly requires `gh`.",
  "## PR Resolution Flow",
  "gh pr diff <number> --name-only",
  "temporary detached worktree from the PR head",
  "rerun the exact same",
  "read-only verification command outside the sandbox",
  "inconclusive, stop the run cleanly",
  "gh pr merge <number> --merge --delete-branch --match-head-commit <headRefOid>",
  "For Dependabot security bumps, treat the security release note as urgency, not",
  "## Stale PR And Branch Cleanup",
  "node ./scripts/codex-workspace.mjs list --active --json",
  "exactly matches a merged PR `headRefOid`",
  "If both Git credentials and the connector are unavailable, stop remote",
]) {
  assertIncludes(connectorWorkflow, text, "docs/github-connector-workflow.md", failures);
}

for (const text of [
  "def get_github_workflow_policy_report",
  "github-workflow-policy-report-v1",
  "Read-only GitHub delivery policy for using Git Credential Manager for Git remotes",
  "the Codex GitHub connector for PR automation",
  "optional local gh auth only when a workflow explicitly shells out to gh",
  "git-gcm-remotes",
  "codex-github-connector",
  "local-gh-auth",
  "github-doctor-local",
  "github-doctor-remote",
  "connector-probe",
  "pnpm run doctor:github",
  "pnpm run doctor:github -- --remote",
  "Do not create persistent plaintext GitHub CLI tokens or use gh auth insecure storage as a baseline setup.",
  "If Git/GCM or connector authentication is unavailable, pause and ask the operator which GitHub path to use.",
  "Use Git/GCM for ordinary Git push and pull operations.",
  "Use the Codex GitHub connector for PR inspection, PR creation, and merge actions when available.",
  "readOnly=True",
  "executionAuthorityApproved=False",
  "plaintextTokenStorageApproved=False",
  "remoteAutomationApproved=False",
]) {
  assertIncludes(serviceSource, text, "GitHub workflow policy service report", failures);
}

assertIncludes(apiSource, '"/supervisor/github-workflow-policy-report"', "FastAPI routes", failures);
assertIncludes(dashboardClient, "getGitHubWorkflowPolicyReport", "Dashboard API client", failures);
assertIncludes(controlsPage, "<GitHubWorkflowPolicyReportPanel report={githubWorkflowPolicyReport} />", "Controls page", failures);
assertIncludes(
  reportShortcuts,
  '"GET /supervisor/github-workflow-policy-report": "#github-workflow-policy-report"',
  "Report shortcut helper",
  failures,
);

for (const text of [
  "GitHubWorkflowPolicyReportView",
  "Plaintext tokens",
  "blocked",
  "stopLines",
  "nextSafeActions",
  "plaintextTokenStorageApproved",
]) {
  assertIncludes(githubPolicyPanel, text, "GitHub workflow policy panel", failures);
}

for (const text of [
  "GET /supervisor/github-workflow-policy-report",
  "Codex GitHub connector handles PR work",
  "pnpm run doctor:github -- --remote",
  "Do not create persistent plaintext GitHub CLI tokens",
  "#github-workflow-policy-report",
]) {
  assertIncludes(controlsSpec, text, "Controls e2e coverage", failures);
}

for (const text of [
  '"github-workflow-policy-report-v1"',
  '"/supervisor/github-workflow-policy-report"',
  '"git-gcm-remotes"',
  '"codex-github-connector"',
  '"local-gh-auth"',
  '"github-doctor-local"',
  '"github-doctor-remote"',
  '"connector-probe"',
  "plaintextTokenStorageApproved",
  "remoteAutomationApproved",
  "plaintext GitHub CLI tokens",
]) {
  assertIncludes(supervisorTests, text, "Supervisor integration tests", failures);
}

assertCondition(
  existsSync(join(rootDir, "docs/workflows/implementation-evidence-boundary.md")),
  "Story index file must exist for GitHub workflow policy evidence",
  failures,
);
assertIncludes(storyIndex, "3-42-github-workflow-policy-report.md", "Story index", failures);
assertIncludes(reconciliation, "GitHub workflow policy report", "Implementation reconciliation", failures);
assertIncludes(reconciliation, "Git/GCM, Codex GitHub connector, optional gh auth", "Implementation reconciliation", failures);

for (const text of [
  "Checks local Git/GitHub delivery readiness without changing credentials.",
  "GitHub CLI auth is not available. This is acceptable for normal Git pushes when Git Credential Manager works and for Codex connector-backed PR automation.",
  "GitHub-specific gh auth git-credential helper is configured.",
]) {
  assertIncludes(githubDoctor, text, "GitHub sync doctor", failures);
}

assertCondition(
  !serviceSource.includes("plaintextTokenStorageApproved=True") &&
    !serviceSource.includes("remoteAutomationApproved=True") &&
    !serviceSource.includes("executionAuthorityApproved=True"),
  "GitHub workflow policy report must not approve plaintext tokens, remote automation, or execution authority",
  failures,
);

if (failures.length > 0) {
  console.error("GitHub workflow policy report drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: GitHub workflow policy report drift checks passed.");
