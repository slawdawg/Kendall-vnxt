import { readFileSync } from "node:fs";
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

const packageJson = JSON.parse(readWorkspaceFile("package.json"));
const contractSource = readWorkspaceFile("packages/contracts/src/api.ts");
const schemaSource = readWorkspaceFile("services/supervisor/src/supervisor/api/schemas.py");
const serviceSource = readWorkspaceFile("services/supervisor/src/supervisor/application/service.py");
const apiSource = readWorkspaceFile("services/supervisor/src/supervisor/api/main.py");
const dashboardClient = readWorkspaceFile("apps/dashboard/src/lib/supervisor.ts");
const controlsPage = readWorkspaceFile("apps/dashboard/src/app/controls/page.tsx");
const policyPanel = readWorkspaceFile("apps/dashboard/src/components/review-resource-policy-report-panel.tsx");
const reportShortcuts = readWorkspaceFile("apps/dashboard/src/lib/report-shortcuts.ts");
const reportCatalogCheck = readWorkspaceFile("scripts/check-supervisor-report-catalog.mjs");
const supervisorTests = readWorkspaceFile("services/supervisor/tests/integration/test_routing_preview.py");
const dashboardSpec = readWorkspaceFile("tests/e2e/dashboard.spec.ts");

const failures = [];

assertCondition(
  packageJson.scripts?.["check:review-resource-policy"] === "node ./scripts/check-review-resource-policy.mjs",
  "package.json must define check:review-resource-policy",
  failures,
);
assertCondition(
  packageJson.scripts?.["check:static"]?.includes("pnpm run check:review-resource-policy"),
  "pnpm run check:static must include pnpm run check:review-resource-policy",
  failures,
);
assertCondition(
  packageJson.scripts?.check?.includes("pnpm run check:review-resource-policy"),
  "pnpm run check must include pnpm run check:review-resource-policy",
  failures,
);

for (const typeName of [
  "ReviewResourcePolicyTriggerView",
  "ReviewResourcePolicyRouteView",
  "ReviewResourcePolicyScenarioView",
  "ReviewResourcePolicyPacketEvaluationView",
  "ReviewResourcePolicyReportView",
]) {
  assertCondition(contractSource.includes(typeName), `Shared contracts must include ${typeName}`, failures);
  assertCondition(schemaSource.includes(`class ${typeName}`), `Supervisor schemas must include ${typeName}`, failures);
}

for (const requiredText of [
  '"/supervisor/review-resource-policy-report"',
  "get_review_resource_policy_report",
  'reportId="review-resource-policy-report-v1"',
  'endpoint="GET /supervisor/review-resource-policy-report"',
]) {
  assertCondition(apiSource.includes(requiredText) || serviceSource.includes(requiredText), `Supervisor source must include ${requiredText}`, failures);
}

for (const policyText of [
  "high_risk_diff",
  "authority_expansion",
  "source_memory_boundary_change",
  "security_sensitive_change",
  "merge_readiness_uncertainty",
  "major_architectural_decision",
  "sample-authority-security-packet",
  "sample-merge-thread-packet",
  "bmad_party_mode",
  "bmad_subagent_review",
  "claude_readonly_review",
  "external-review-readonly",
  "claude -p",
  "--max-budget-usd 1",
  "--tools Read,Grep",
  'retention_policy = "summaries_findings_paths_command_metadata_verification_policy_basis_only"',
  "retentionPolicy=retention_policy",
  "rawProviderPayloadsRetained=False",
  "rawReasoningRetained=False",
  "sourceMutationApproved=False",
  "processLaunchApproved=False",
  "githubMutationApproved=False",
]) {
  assertCondition(serviceSource.includes(policyText), `Review resource policy service must include ${policyText}`, failures);
}
assertCondition(!serviceSource.includes("--allowedTools"), "Review resource policy service must not use Claude --allowedTools as a restriction", failures);
assertCondition(!serviceSource.includes("--disallowedTools"), "Review resource policy service must not rely on a finite Claude disallow list", failures);

assertCondition(
  dashboardClient.includes("getReviewResourcePolicyReport"),
  "Dashboard API client must fetch the review resource policy report",
  failures,
);
assertCondition(
  controlsPage.includes("getReviewResourcePolicyReport") &&
    controlsPage.includes("<ReviewResourcePolicyReportPanel report={reviewResourcePolicyReport} />"),
  "Controls page must fetch and render the review resource policy report",
  failures,
);
for (const panelText of [
  "ReviewResourcePolicyReportView",
  "Review resource policy",
  "Policy triggers",
  "Review routes",
  "Packet evaluations",
  "Claude read-only command",
  "Metadata retained",
  "processLaunchApproved",
  "sourceMutationApproved",
  "githubMutationApproved",
  "rawProviderPayloadsRetained",
  "rawReasoningRetained",
  "review-resource-policy-route-",
  "review-resource-policy-claude-command",
  "review-resource-policy-stop-lines",
]) {
  assertCondition(policyPanel.includes(panelText), `Review resource policy panel must render ${panelText}`, failures);
}

assertCondition(
  reportShortcuts.includes('"GET /supervisor/review-resource-policy-report": "#review-resource-policy-report"'),
  "Report shortcuts must link the review resource policy endpoint to its controls anchor",
  failures,
);
assertCondition(
  reportCatalogCheck.includes('reportId: "review-resource-policy-report-v1"') &&
    reportCatalogCheck.includes("getReviewResourcePolicyReport") &&
    reportCatalogCheck.includes("GET /supervisor/review-resource-policy-report") &&
    reportCatalogCheck.includes('id="review-resource-policy-report"'),
  "Report catalog drift check must cover review resource policy report",
  failures,
);
assertCondition(
  supervisorTests.includes("test_review_resource_policy_report_maps_triggers_to_bounded_review_routes_without_mutation"),
  "Supervisor integration tests must cover the review resource policy report",
  failures,
);
for (const browserText of [
  "GET /supervisor/review-resource-policy-report",
  "Review resource policy",
  "BMAD party mode",
  "Claude read-only",
  "Packet evaluations",
  "sample-authority-security-packet",
]) {
  assertCondition(dashboardSpec.includes(browserText), `Dashboard browser coverage must include ${browserText}`, failures);
}

if (failures.length > 0) {
  console.error("Review resource policy drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: review resource policy drift checks passed.");
