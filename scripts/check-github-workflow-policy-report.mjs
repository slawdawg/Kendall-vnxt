import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { staticBundleNames } from "./run-static-bundle.mjs";

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

function assertNotIncludes(source, text, label, failures) {
  assertCondition(!source.includes(text), `${label} must not include ${text}`, failures);
}

function assertCiJobIncludes(ciJobName, requiredText, message, failures) {
  const job = ciJobBlock(ciJobName);
  assertCondition(job, `.github/workflows/ci.yml must define the ${ciJobName} job`, failures);
  assertCondition(job.includes(requiredText), message, failures);
}

function ciJobBlock(jobName) {
  const jobStart = ciWorkflow.indexOf(`\n  ${jobName}:`);
  if (jobStart === -1) return "";
  const jobKeyPattern = /\n  [A-Za-z0-9_-]+:\n/g;
  jobKeyPattern.lastIndex = jobStart + `\n  ${jobName}:`.length;
  const nextJob = jobKeyPattern.exec(ciWorkflow);
  return nextJob ? ciWorkflow.slice(jobStart, nextJob.index) : ciWorkflow.slice(jobStart);
}

function ciMatrixBundleNames(jobName) {
  return [...ciJobBlock(jobName).matchAll(/^\s+- ([a-z][a-z-]*)$/gm)].map((match) => match[1]);
}

const packageJson = JSON.parse(readWorkspaceFile("package.json"));
const readme = readWorkspaceFile("README.md");
const connectorWorkflow = readWorkspaceFile("docs/github-connector-workflow.md");
const currentSessionRunbook = readWorkspaceFile("docs/workflows/current-session-runbook.md");
const ciGateBehavior = readWorkspaceFile("docs/workflows/ci-gate-behavior.md");
const ciWorkflow = readWorkspaceFile(".github/workflows/ci.yml");
const promotionExperimentWorkflow = readWorkspaceFile(".github/workflows/ci-promotion-experiment.yml");
const fastWorkflowRunner = readWorkspaceFile("scripts/run-fast-workflow-checks.mjs");
const serviceSource = readWorkspaceFile("services/supervisor/src/supervisor/application/service.py");
const apiSource = readWorkspaceFile("services/supervisor/src/supervisor/api/main.py");
const dashboardClient = readWorkspaceFile("apps/dashboard/src/lib/supervisor.ts");
const controlsPageContent = readWorkspaceFile("apps/dashboard/src/components/controls-page-content.tsx");
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
  packageJson.scripts?.["check:fast"] === "node ./scripts/run-fast-workflow-checks.mjs all",
  "package.json must define check:fast as node ./scripts/run-fast-workflow-checks.mjs all",
  failures,
);
assertCondition(
  packageJson.scripts?.["check:ci-fast"] === "node ./scripts/run-fast-workflow-checks.mjs ci",
  "package.json must define check:ci-fast as node ./scripts/run-fast-workflow-checks.mjs ci",
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
  packageJson.scripts?.["check:static"]?.startsWith("pnpm run check:fast"),
  "pnpm run check:static must run pnpm run check:fast before the long static chain",
  failures,
);
assertCondition(
  packageJson.scripts?.["check:static"]?.includes("pnpm run test:static-bundles"),
  "pnpm run check:static must include pnpm run test:static-bundles",
  failures,
);
assertCondition(
  packageJson.scripts?.["check:static"]?.includes("pnpm run test:static-bundle-summary"),
  "pnpm run check:static must include pnpm run test:static-bundle-summary",
  failures,
);
for (const bundleName of ["core", "manager", "workspace", "policy", "pipeline-dashboard", "anti-churn"]) {
  assertCondition(
    packageJson.scripts?.[`check:static-${bundleName}`] === `node ./scripts/run-static-bundle.mjs ${bundleName}`,
    `package.json must define check:static-${bundleName} as node ./scripts/run-static-bundle.mjs ${bundleName}`,
    failures,
  );
}
assertCondition(
  packageJson.scripts?.["check:static-bundles"] === "node ./scripts/run-static-bundle.mjs all",
  "package.json must define check:static-bundles as node ./scripts/run-static-bundle.mjs all",
  failures,
);
assertCondition(
  packageJson.scripts?.["test:static-bundles"] === "node --test tests/static-bundles.test.mjs",
  "package.json must define test:static-bundles as node --test tests/static-bundles.test.mjs",
  failures,
);
assertCondition(
  packageJson.scripts?.["test:static-bundle-summary"] === "node --test tests/static-bundles.test.mjs",
  "package.json must define test:static-bundle-summary as node --test tests/static-bundles.test.mjs",
  failures,
);
assertCondition(
  packageJson.scripts?.check?.startsWith("pnpm run preflight && pnpm run check:fast"),
  "pnpm run check must run pnpm run check:fast immediately after preflight",
  failures,
);
assertCondition(
  packageJson.scripts?.["doctor:github"] === "node ./scripts/github-sync-doctor.mjs",
  "package.json must retain doctor:github as node ./scripts/github-sync-doctor.mjs",
  failures,
);
for (const ciFastCommand of [
  '"check:github-workflow-policy"',
  '"check:workspace-coordination"',
  '"test:ci-promotion-evidence"',
  '"test:ci-promotion-packet"',
  '"test:ci-evidence-command"',
  '"test:ci-promotion-observations"',
]) {
  assertCondition(
    fastWorkflowRunner.includes(ciFastCommand),
    `Fast workflow runner must include CI command ${ciFastCommand}`,
    failures,
  );
}
for (const ciText of [
  "fast:",
  "schedule:",
  "workflow_dispatch:",
  "- dev",
  "workspace_behavior_shadow:",
  "supervisor_behavior_shadow:",
  "static_bundle:",
  "static_bundle_summary:",
  "promotion_evidence_summary:",
  "needs: changes",
  "fail-fast: false",
  "fromJSON(needs.changes.outputs.selected_workspace_profiles)",
  "fromJSON(needs.changes.outputs.selected_supervisor_shards)",
  "pnpm run test:codex-workspace:${{ matrix.profile.id }}",
  "pnpm run ${{ matrix.shard.script }}",
  "node ./scripts/run-ci-evidence-command.mjs",
  "ci-command-evidence-workspace-${{ matrix.profile.id }}",
  "ci-command-evidence-supervisor-${{ matrix.shard.id }}",
  "ci-command-evidence-supervisor-aggregate",
  '--base-sha "${{ github.event.pull_request.base.sha }}"',
  "node ./scripts/run-static-bundle.mjs \"${{ matrix.bundle }}\"",
  "--report \"$report_dir/${{ matrix.bundle }}.json\"",
  "--head-sha \"${{ github.event.pull_request.head.sha }}\"",
  "actions/upload-artifact@v4",
  "actions/download-artifact@v4",
  "static-bundle-report-${{ matrix.bundle }}",
  "static-bundle-summary",
  "ci-promotion-observation",
  "node ./scripts/collect-ci-promotion-observations.mjs",
  "node ./scripts/summarize-static-bundle-reports.mjs",
  "--static-result \"${{ needs.static.result }}\"",
  "--static-bundle-result \"${{ needs.static_bundle.result }}\"",
  "--static-bundle-required",
  "node ./scripts/check-plan.mjs",
  "--ci-outputs",
  "RUNNER_TEMP",
  "static: ${{ steps.filter.outputs.static }}",
  "routing_mode: ${{ steps.filter.outputs.routing_mode }}",
  "selected_static_bundles: ${{ steps.filter.outputs.selected_static_bundles }}",
  "skipped_static_bundles: ${{ steps.filter.outputs.skipped_static_bundles }}",
  "routing_reasons: ${{ steps.filter.outputs.routing_reasons }}",
  "required_gates: ${{ steps.filter.outputs.required_gates }}",
  "skipped_required_gates: ${{ steps.filter.outputs.skipped_required_gates }}",
  "selected_workspace_profiles: ${{ steps.filter.outputs.selected_workspace_profiles }}",
  "selected_supervisor_shards: ${{ steps.filter.outputs.selected_supervisor_shards }}",
  "## CI routing (shadow)",
  "selectedStaticBundles",
  "skippedStaticBundles",
  "routingReasons",
  "requiredGates",
  "Current required gates:",
  "Prospective selected static bundles:",
  "Prospective workspace behavior profiles:",
  "Prospective supervisor behavior shards:",
  "pnpm run check:fast",
  "Fast workflow checks failed or did not complete",
  "Static checks were required but did not pass",
  "github.event_name == 'schedule' && 'dev'",
]) {
  assertIncludes(ciWorkflow, ciText, ".github/workflows/ci.yml", failures);
}
for (const experimentText of [
  "workflow_dispatch:",
  "controlled_failure",
  "cache-strategy isolated",
  "--inject-failure-id",
  "promotion-evidence-fan-in",
  "Verify controlled-failure fan-in",
  "ci-promotion-observation",
  "github-job-timings",
  "fromJSON(needs.prepare.outputs.workspace_profiles)",
  "fromJSON(needs.prepare.outputs.supervisor_shards)",
]) {
  assertIncludes(promotionExperimentWorkflow, experimentText, ".github/workflows/ci-promotion-experiment.yml", failures);
}
assertCondition(
  ciJobBlock("static").includes("needs.changes.outputs.static == 'true'"),
  ".github/workflows/ci.yml static job must be gated by needs.changes.outputs.static == 'true'",
  failures,
);
assertCondition(
  ciJobBlock("promotion_evidence_summary").includes("continue-on-error: true") &&
    ciJobBlock("promotion_evidence_summary").includes("ci-command-evidence-*") &&
    ciJobBlock("promotion_evidence_summary").includes("static-bundle-report-workspace") &&
    ciJobBlock("promotion_evidence_summary").includes("ci-promotion-observation"),
  ".github/workflows/ci.yml promotion evidence summary must remain reporting-only and preserve command and workspace aggregate artifacts",
  failures,
);
assertCondition(
  ciJobBlock("full").includes("github.event_name == 'push' || github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'") &&
    ciJobBlock("full").includes("github.event_name == 'schedule' && 'dev'"),
  ".github/workflows/ci.yml full confidence must run after dev pushes and target dev for scheduled verification",
  failures,
);
assertCondition(
  ciJobBlock("static").includes("- static_bundle") &&
    ciJobBlock("static").includes("Verify required static bundle gate") &&
    ciJobBlock("static").includes("Static bundle checks were required but did not pass"),
  ".github/workflows/ci.yml static job must fan in the required static_bundle matrix result",
  failures,
);
assertCondition(
  ciJobBlock("static_bundle").includes("needs.changes.outputs.static == 'true'") &&
    ciJobBlock("static_bundle").includes("matrix:") &&
    !ciJobBlock("static_bundle").includes("continue-on-error: true"),
  ".github/workflows/ci.yml static_bundle job must be a required static-gated matrix over all bundles",
  failures,
);
assertCondition(
  JSON.stringify(ciMatrixBundleNames("static_bundle")) === JSON.stringify(staticBundleNames()),
  ".github/workflows/ci.yml static_bundle matrix entries must match scripts/run-static-bundle.mjs STATIC_BUNDLES",
  failures,
);
for (const requiredText of [
  'node ./scripts/run-static-bundle.mjs "${{ matrix.bundle }}"',
  '--report "$report_dir/${{ matrix.bundle }}.json"',
  '--head-sha "${{ github.event.pull_request.head.sha }}"',
  '--base-sha "${{ github.event.pull_request.base.sha }}"',
  "actions/upload-artifact@v4",
  "static-bundle-report-${{ matrix.bundle }}",
  "${{ runner.temp }}/static-bundle-reports/${{ matrix.bundle }}.json",
]) {
  assertCiJobIncludes(
    "static_bundle",
    requiredText,
    `.github/workflows/ci.yml static_bundle job must include ${requiredText}`,
    failures,
  );
}
assertCondition(
  ciJobBlock("static_bundle_summary").includes("continue-on-error: true") &&
    ciJobBlock("static_bundle_summary").includes("- changes") &&
    ciJobBlock("static_bundle_summary").includes("- static") &&
    ciJobBlock("static_bundle_summary").includes("- static_bundle") &&
    ciJobBlock("static_bundle_summary").includes("needs.changes.outputs.static == 'true'"),
  ".github/workflows/ci.yml static_bundle_summary job must remain reporting-only and summarize required static bundle evidence when the planner selects static checks",
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
    `.github/workflows/ci.yml static_bundle_summary job must include ${requiredText}`,
    failures,
  );
}
const supervisorJob = ciJobBlock("supervisor");
const supervisorProfileTimeoutMs = Number(
  supervisorJob.match(/test:supervisor:profile -- --timeout-ms=(\d+)/)?.[1],
);
const supervisorJobTimeoutMs = Number(
  supervisorJob.match(/timeout-minutes: (\d+)/)?.[1],
) * 60_000;
assertCondition(
  supervisorProfileTimeoutMs === 900_000 &&
    Number.isFinite(supervisorJobTimeoutMs) &&
    supervisorJobTimeoutMs - supervisorProfileTimeoutMs >= 300_000,
  ".github/workflows/ci.yml supervisor job must retain the 15-minute child timeout and at least five minutes of job margin",
  failures,
);
assertCondition(
  ciJobBlock("check").includes('needs.changes.outputs.static') &&
    ciJobBlock("check").includes("Static checks were required but did not pass"),
  ".github/workflows/ci.yml final check job must require static only when the planner selects it",
  failures,
);
assertCondition(
  ciJobBlock("static").includes("static_bundle") &&
    !ciJobBlock("check").includes("static_bundle"),
  ".github/workflows/ci.yml final check job must require static_bundle through the retained static fan-in job",
  failures,
);
assertCondition(
  !ciJobBlock("check").includes("static_bundle_summary"),
  ".github/workflows/ci.yml final check job must not require static_bundle_summary while bundles are reporting-only",
  failures,
);
assertNotIncludes(
  ciJobBlock("changes"),
  "> ci-outputs.json",
  ".github/workflows/ci.yml changes job",
  failures,
);
assertNotIncludes(
  ciJobBlock("changes"),
  'readFileSync("ci-outputs.json"',
  ".github/workflows/ci.yml changes job",
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
  "pnpm run check:fast",
  "pnpm run check:ci-fast",
  "This runbook also anchors runbook verification for the active check chain.",
]) {
  assertIncludes(currentSessionRunbook, text, "Current session runbook", failures);
}

for (const text of [
  "pnpm run check:fast",
  "pnpm run check:ci-fast",
  "workspace delivery command readiness",
  "sandbox-boundary and anti-churn routing",
]) {
  assertIncludes(ciGateBehavior, text, "docs/workflows/ci-gate-behavior.md", failures);
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
assertIncludes(controlsPageContent, "<GitHubWorkflowPolicyReportPanel report={data.githubWorkflowPolicyReport} />", "Controls page content", failures);
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
