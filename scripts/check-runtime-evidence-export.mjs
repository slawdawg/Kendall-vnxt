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

function readJsonWorkspaceFile(path, failures) {
  try {
    return JSON.parse(readWorkspaceFile(path));
  } catch (error) {
    failures.push(`${path} must contain parseable runtime-evidence-export JSON fixture: ${error.message}`);
    return null;
  }
}

function collectRuntimeEvidenceDriftRuleFailures(fixture) {
  const ruleFailures = [];
  const requiredStructuredFields = [
    "RuntimeEvidenceExportBoundaryView",
    "RuntimeEvidenceExportSafetyView",
    "RuntimeEvidenceSubscriptionLaunchView",
    "RuntimeEvidenceExportView",
  ];
  const requiredBlockedAuthority = [
    "providerExpansion",
    "credentialSessionAccess",
    "sourceMutation",
    "launchRetryAutomation",
    "prMergeCleanupAutomation",
    "failedCheckBypass",
    "broadAutonomy",
  ];
  const requiredExcludedEvidence = [
    "rawPrompts",
    "rawCompletions",
    "reasoningTraces",
    "providerPayloads",
    "secrets",
    "rawStdout",
    "rawStderr",
    "generatedPatchContent",
    "sourceSnapshots",
  ];

  for (const field of requiredStructuredFields) {
    if (!fixture.structuredFields?.includes(field)) {
      ruleFailures.push(`structured-field:${field}`);
    }
  }
  for (const authority of requiredBlockedAuthority) {
    if (fixture.safetyBoundary?.[authority] !== "blocked") {
      ruleFailures.push(`safety-boundary:${authority}`);
    }
  }
  for (const evidence of requiredExcludedEvidence) {
    if (fixture.retainedEvidence?.[evidence] !== "excluded") {
      ruleFailures.push(`retained-evidence:${evidence}`);
    }
  }
  if (fixture.reportRoute !== "/work-items/{work_item_id}/runtime-evidence-export") {
    ruleFailures.push("report-route:runtime-evidence-export");
  }
  if (fixture.verification?.command !== "pnpm run check:runtime-export") {
    ruleFailures.push("verification-command:check-runtime-export");
  }
  if (fixture.verification?.fixtureFamily !== "static-report-schema-drift") {
    ruleFailures.push("fixture-family:static-report-schema-drift");
  }

  return ruleFailures;
}

function describeRuntimeEvidenceDriftRule(ruleId, fixture) {
  const evidenceSurface = fixture.evidenceSurface ?? "unknown evidence surface";
  const [ruleType, ruleName] = ruleId.split(":");
  if (ruleType === "structured-field") {
    return `${evidenceSurface} must include structured field ${ruleName}`;
  }
  if (ruleType === "safety-boundary") {
    return `${evidenceSurface} safety boundary ${ruleName} must be blocked`;
  }
  if (ruleType === "retained-evidence") {
    return `${evidenceSurface} retained evidence ${ruleName} must be excluded`;
  }
  if (ruleType === "report-route") {
    return `${evidenceSurface} report route must be /work-items/{work_item_id}/runtime-evidence-export`;
  }
  if (ruleType === "verification-command") {
    return `${evidenceSurface} verification command must be pnpm run check:runtime-export`;
  }
  if (ruleType === "fixture-family") {
    return `${evidenceSurface} fixture family must be static-report-schema-drift`;
  }
  return `${evidenceSurface} must satisfy ${ruleId}`;
}

function extractPythonClassBody(source, className) {
  const classStart = source.indexOf(`class ${className}(BaseModel):`);
  if (classStart < 0) {
    return "";
  }
  const nextClassStart = source.indexOf("\n\nclass ", classStart + 1);
  return source.slice(classStart, nextClassStart < 0 ? undefined : nextClassStart);
}

function assertSourceIncludes(source, expectedText, message, failures) {
  assertCondition(source.includes(expectedText), message, failures);
}

function validateRuntimeEvidenceLiveSourceSurfaces(failures) {
  const safetySchema = extractPythonClassBody(schemaSource, "RuntimeEvidenceExportSafetyView");
  const boundarySchema = extractPythonClassBody(schemaSource, "RuntimeEvidenceExportBoundaryView");
  const subscriptionLaunchSchema = extractPythonClassBody(schemaSource, "RuntimeEvidenceSubscriptionLaunchView");
  const exportSchema = extractPythonClassBody(schemaSource, "RuntimeEvidenceExportView");

  const safetyDefaults = [
    "exportOnly: bool = True",
    "processLaunchAllowed: bool = False",
    "providerCallsAllowed: bool = False",
    "modelCallsAllowed: bool = False",
    "premiumExecutionAllowed: bool = False",
    "commandExecutionAllowed: bool = False",
    "sourceMutationAllowed: bool = False",
    "networkAllowed: bool = False",
    "credentialAccessAllowed: bool = False",
  ];
  for (const defaultField of safetyDefaults) {
    assertSourceIncludes(
      safetySchema,
      defaultField,
      `runtime-evidence-export safety schema must preserve default invariant ${defaultField}`,
      failures,
    );
  }

  for (const boundaryField of ["localRuntimeState", "gitBackedEvidence", "relatedSupervisorReports", "excludedState"]) {
    assertSourceIncludes(
      boundarySchema,
      boundaryField,
      `runtime-evidence-export boundary schema must include field ${boundaryField}`,
      failures,
    );
  }
  for (const subscriptionField of [
    "approvalBinding",
    "lifecycleSummary",
    "workspaceSummary",
    "outputArtifactReferences",
    "verificationEvidence",
    "safetyFlags",
    "cancellationTimeoutRollbackEvidence",
    "rawOutputStored: bool = False",
  ]) {
    assertSourceIncludes(
      subscriptionLaunchSchema,
      subscriptionField,
      `runtime-evidence-export subscription launch schema must include ${subscriptionField}`,
      failures,
    );
  }
  for (const exportField of [
    "boundary: RuntimeEvidenceExportBoundaryView",
    "safety: RuntimeEvidenceExportSafetyView",
    "subscriptionLaunch: RuntimeEvidenceSubscriptionLaunchView",
  ]) {
    assertSourceIncludes(exportSchema, exportField, `runtime-evidence-export schema must compose ${exportField}`, failures);
  }

  const runtimeExportStart = serviceSource.indexOf("RuntimeEvidenceExportView(");
  const runtimeExportEnd = serviceSource.indexOf("def _runtime_evidence_subscription_launch_summary", runtimeExportStart);
  const runtimeExportSource = serviceSource.slice(runtimeExportStart, runtimeExportEnd < 0 ? undefined : runtimeExportEnd);
  for (const excludedStateText of [
    "environment variables and credential stores",
    "provider HTTP request/response bodies",
    "model prompts or completions from external providers",
    "raw Ollama prompts, completions, reasoning fields, and provider payloads",
    "raw subscription-agent stdout and stderr",
    "subscription-agent inherited environment values",
    "filesystem snapshots outside recorded artifact references",
    "background process output not recorded as workflow events",
  ]) {
    assertSourceIncludes(
      runtimeExportSource,
      excludedStateText,
      `runtime-evidence-export service excludedState must preserve ${excludedStateText}`,
      failures,
    );
  }
  assertSourceIncludes(
    runtimeExportSource,
    "safety=RuntimeEvidenceExportSafetyView()",
    "runtime-evidence-export service must use the fail-closed RuntimeEvidenceExportSafetyView defaults",
    failures,
  );
  assertSourceIncludes(
    runtimeExportSource,
    "subscriptionLaunch=self._runtime_evidence_subscription_launch_summary(events)",
    "runtime-evidence-export service must compose subscription launch summary from workflow events",
    failures,
  );
}

function validateRuntimeEvidenceDriftFixtures(failures) {
  const goodFixturePath = "scripts/fixtures/runtime-evidence-drift/known-good.json";
  const badFixturePath = "scripts/fixtures/runtime-evidence-drift/known-bad.json";
  const goodFixture = readJsonWorkspaceFile(goodFixturePath, failures);
  const badFixture = readJsonWorkspaceFile(badFixturePath, failures);
  if (!goodFixture || !badFixture) {
    return;
  }

  const goodFailures = collectRuntimeEvidenceDriftRuleFailures(goodFixture);
  assertCondition(
    goodFailures.length === 0,
    `${goodFixturePath} must satisfy runtime evidence drift rules for ${goodFixture.evidenceSurface}; violated: ${goodFailures
      .map((failure) => describeRuntimeEvidenceDriftRule(failure, goodFixture))
      .join(", ")}`,
    failures,
  );

  const badFailures = collectRuntimeEvidenceDriftRuleFailures(badFixture);
  const expectedFailures = badFixture.expectedFailures ?? [];
  assertCondition(
    expectedFailures.length > 0,
    `${badFixturePath} must name expected runtime evidence drift failures`,
    failures,
  );
  for (const expectedFailure of expectedFailures) {
    assertCondition(
      badFailures.includes(expectedFailure),
      `${badFixturePath} must fail runtime evidence drift rule ${expectedFailure}: ${describeRuntimeEvidenceDriftRule(
        expectedFailure,
        badFixture,
      )}`,
      failures,
    );
  }
  for (const actualFailure of badFailures) {
    assertCondition(
      expectedFailures.includes(actualFailure),
      `${badFixturePath} produced unexpected runtime evidence drift rule failure ${actualFailure}: ${describeRuntimeEvidenceDriftRule(
        actualFailure,
        badFixture,
      )}`,
      failures,
    );
  }
}

const packageJson = JSON.parse(readWorkspaceFile("package.json"));
const contractSource = readWorkspaceFile("packages/contracts/src/api.ts");
const schemaSource = readWorkspaceFile("services/supervisor/src/supervisor/api/schemas.py");
const serviceSource = readWorkspaceFile("services/supervisor/src/supervisor/application/service.py");
const apiSource = readWorkspaceFile("services/supervisor/src/supervisor/api/main.py");
const exportPanel = readWorkspaceFile("apps/dashboard/src/components/runtime-evidence-export-panel.tsx");
const overviewPanel = readWorkspaceFile("apps/dashboard/src/components/evidence-overview-panel.tsx");
const subscriptionLaunchReadinessPanel = readWorkspaceFile("apps/dashboard/src/components/subscription-launch-readiness-panel.tsx");
const reportShortcuts = readWorkspaceFile("apps/dashboard/src/lib/report-shortcuts.ts");
const detailSpec = readWorkspaceFile("tests/e2e/dashboard.spec.ts");
const supervisorTests = readWorkspaceFile("services/supervisor/tests/integration/test_routing_preview.py");
const storyIndex = readWorkspaceFile("docs/workflows/implementation-evidence-boundary.md");

const failures = [];

validateRuntimeEvidenceDriftFixtures(failures);
validateRuntimeEvidenceLiveSourceSurfaces(failures);

assertCondition(
  packageJson.scripts?.["check:runtime-export"] === "node ./scripts/check-runtime-evidence-export.mjs",
  "package.json must define check:runtime-export as node ./scripts/check-runtime-evidence-export.mjs",
  failures,
);
assertCondition(
  packageJson.scripts?.check?.includes("pnpm run check:runtime-export"),
  "pnpm run check must include pnpm run check:runtime-export",
  failures,
);

for (const typeName of [
  "RuntimeEvidenceExportBoundaryView",
  "RuntimeEvidenceExportSafetyView",
  "RuntimeEvidenceReviewManifestView",
  "RuntimeEvidenceReviewNavigatorItemView",
  "RuntimeEvidenceSubscriptionLaunchView",
  "RuntimeEvidenceExportView",
]) {
  assertCondition(contractSource.includes(typeName), `Shared contracts must include ${typeName}`, failures);
  assertCondition(schemaSource.includes(`class ${typeName}`), `Supervisor schemas must include ${typeName}`, failures);
}
for (const typeName of ["WorkItemSubscriptionAgentLaunchRequest", "SubscriptionAgentLaunchRequestView"]) {
  assertCondition(schemaSource.includes(`class ${typeName}`), `Supervisor schemas must include ${typeName}`, failures);
}
for (const typeName of ["WorkItemSubscriptionAgentLaunchPayload", "SubscriptionAgentLaunchRequestView"]) {
  assertCondition(contractSource.includes(`interface ${typeName}`), `Shared contracts must include ${typeName}`, failures);
}
assertCondition(
  contractSource.includes("mutationContract: Record<string, unknown>;"),
  "Shared contracts must expose SubscriptionAgentLaunchRequestView.mutationContract",
  failures,
);
assertCondition(
  schemaSource.includes("mutationContract: dict[str, Any] = Field(default_factory=dict)"),
  "Supervisor schemas must expose SubscriptionAgentLaunchRequestView.mutationContract",
  failures,
);

assertCondition(
  apiSource.includes('"/work-items/{work_item_id}/runtime-evidence-export"'),
  "FastAPI routes must expose /work-items/{work_item_id}/runtime-evidence-export",
  failures,
);
assertCondition(
  apiSource.includes('"/work-items/{work_item_id}/subscription-agent-launch"'),
  "FastAPI routes must expose /work-items/{work_item_id}/subscription-agent-launch",
  failures,
);
assertCondition(
  serviceSource.includes("reviewNavigator=["),
  "Runtime evidence export service must build reviewNavigator",
  failures,
);
assertCondition(
  serviceSource.includes("_runtime_evidence_subscription_launch_summary(events)"),
  "Runtime evidence export service must include subscription launch summary",
  failures,
);
assertCondition(
  serviceSource.includes("recordEvent=false is an evaluation-only path"),
  "Subscription launch request evaluation must document recordEvent=false as read-only",
  failures,
);
assertCondition(
  serviceSource.includes("if not record_event:"),
  "Subscription launch request evaluation must keep recordEvent=false from mutating events or attempts",
  failures,
);
assertCondition(
  serviceSource.includes("_subscription_agent_launch_existing_rejection_event("),
  "Subscription launch request evaluation must deduplicate repeated rejection events by launch request identity",
  failures,
);
assertCondition(
  serviceSource.includes("_subscription_agent_launch_rejection_fingerprint("),
  "Subscription launch request evaluation must include rejection fingerprint in idempotency checks",
  failures,
);
assertCondition(
  serviceSource.includes("_subscription_agent_launch_attempt_matches_request("),
  "Subscription launch accepted fixture replay must verify existing attempt identity before treating it as idempotent",
  failures,
);
assertCondition(
  serviceSource.includes('"mode": "mutating" if record_event else "read_only_evaluation"'),
  "Subscription launch mutation contract must expose read-only versus mutating mode",
  failures,
);
assertCondition(
  serviceSource.includes("accepted_artifact_only_fixture_evaluation_ready"),
  "Subscription launch read-only accepted fixture evaluation must not report completed mutation status",
  failures,
);
for (const itemId of ["review-runtime-state", "review-authority-boundary", "review-git-backed-evidence"]) {
  assertCondition(serviceSource.includes(`itemId="${itemId}"`), `Runtime export must include navigator item ${itemId}`, failures);
  assertCondition(supervisorTests.includes(`"${itemId}"`), `Supervisor tests must assert navigator item ${itemId}`, failures);
}
for (const crossCheckText of [
  "RuntimeEvidenceCrossCheckView",
  "_runtime_evidence_cross_checks",
  "Review index",
  "Authority boundary",
  "Documentation authority",
  "Development runway",
  "crossChecks=cross_checks",
]) {
  assertCondition(serviceSource.includes(crossCheckText), `Runtime evidence service must define cross-check evidence ${crossCheckText}`, failures);
}
for (const contractText of ["RuntimeEvidenceCrossCheckView", "crossChecks: RuntimeEvidenceCrossCheckView[]"]) {
  assertCondition(contractSource.includes(contractText), `Contracts must expose runtime evidence cross-check field ${contractText}`, failures);
  assertCondition(schemaSource.includes(contractText.replace(": RuntimeEvidenceCrossCheckView[]", ": list[RuntimeEvidenceCrossCheckView]")), `Schemas must expose runtime evidence cross-check field ${contractText}`, failures);
}
assertCondition(
  serviceSource.includes('itemId="review-ollama-no-call-prep"'),
  "Runtime export must include Ollama no-call preparation navigator item",
  failures,
);
assertCondition(
  supervisorTests.includes('"review-ollama-no-call-prep"'),
  "Supervisor tests must assert Ollama no-call preparation navigator item",
  failures,
);

for (const story of [
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
]) {
  assertCondition(existsSync(join(rootDir, story)), `Missing runtime export story evidence ${story}`, failures);
}

for (const panelText of [
  "Review navigator",
  "exportView.reviewNavigator.map",
  "item.label",
  "item.crossChecks ?? []",
  "crossCheck.dashboardAnchor",
  "crossCheck.relatedDoc",
  "item.stopLines",
  "reportShortcutHref(report)",
  "break-all font-mono text-[11px] text-[var(--accent)]",
  "Subscription launch evidence",
  "exportView.subscriptionLaunch.status",
  "exportView.subscriptionLaunch.outputArtifactReferences",
  "exportView.subscriptionLaunch.verificationEvidence",
  "exportView.subscriptionLaunch.cancellationTimeoutRollbackEvidence",
]) {
  assertCondition(exportPanel.includes(panelText), `Runtime evidence export panel must render ${panelText}`, failures);
}

for (const panelText of ["Review shortcuts", "Cross-check path", "runtimeEvidenceExport.reviewNavigator", "item.target", "item.itemId", "item.crossChecks ?? []", "item.relatedDoc", "reportShortcutHref(item.report)", "reportShortcutHref(report)"]) {
  assertCondition(overviewPanel.includes(panelText), `Evidence overview panel must render ${panelText}`, failures);
}

for (const panelText of [
  "latestSubscriptionEvent(events, runtimeEvidenceExport.workflowEvents)",
  "routing.subscription_agent_launch_rejected",
  "execution_attempt.subscription_launch_fixture_timeout_policy_recorded",
  "execution_attempt.subscription_launch_fixture_cancellation_policy_recorded",
  "execution_attempt.subscription_launch_fixture_rollback_disabled_recorded",
  "execution_attempt.subscription_launch_fixture_completed",
  "execution_attempt.verification_recorded",
  "subscriptionLaunchVerification",
  "Verification and recovery",
  "Incomplete Evidence",
  "commandTemplateExecutable",
  "stateMapping",
  "terminalStates",
  "formatAllowance(\"Execution\"",
  "formatAttempt(\"Shell execution\"",
  "Raw stdout, stderr, and generated patch contents remain excluded.",
]) {
  assertCondition(subscriptionLaunchReadinessPanel.includes(panelText), `Subscription launch readiness panel must guard ${panelText}`, failures);
}

for (const shortcutText of [
  "reportAnchorByEndpoint",
  "reportShortcutHref",
  "#execution-readiness-report",
  "#authority-readiness-matrix-report",
  "#maintenance-action-plan-report",
  "#development-runway-report",
  "#runtime-evidence-review-report",
  "#safe-development-backlog",
  "#github-workflow-policy-report",
  "#github-delivery-authority-report",
  "#trusted-delivery-eligibility-report",
  "#git-hygiene-report",
  "#local-cleanup-readiness-report",
  "#remote-cleanup-sync-readiness-report",
  "#trusted-autonomy-readiness-report",
  "#epic-6-mvp-proof-trial-report",
  "#codex-readiness-report",
  "#codex-implementation-approval-report",
  "#claude-review-readiness-report",
  "#claude-review-approval-report",
  "#delivery-readiness-policy-report",
  "#supervisor-report-catalog",
]) {
  assertCondition(reportShortcuts.includes(shortcutText), `Report shortcut helper must include ${shortcutText}`, failures);
}

for (const panelText of ["Review navigator", "Runtime state", "Authority boundary", "Git-backed evidence"]) {
  assertCondition(detailSpec.includes(panelText), `Dashboard detail e2e must assert ${panelText}`, failures);
}

for (const panelText of ["Cross-check path", "Documentation authority", "Confirm review work does not grant execution"]) {
  assertCondition(detailSpec.includes(panelText), `Dashboard e2e must assert runtime evidence cross-check ${panelText}`, failures);
}

for (const panelText of ["/controls#execution-readiness-report", "/controls#safe-development-backlog", "/controls#runtime-evidence-review-report"]) {
  assertCondition(detailSpec.includes(panelText), `Dashboard detail e2e must assert related report link ${panelText}`, failures);
}

assertCondition(
  serviceSource.includes("GET /supervisor/maintenance-action-plan-report"),
  "Runtime evidence export related reports must include maintenance action plan report",
  failures,
);
assertCondition(
  serviceSource.includes("GET /supervisor/authority-readiness-matrix-report"),
  "Runtime evidence export related reports must include authority readiness matrix report",
  failures,
);
assertCondition(
  serviceSource.includes("GET /supervisor/development-runway-report"),
  "Runtime evidence export related reports must include development runway report",
  failures,
);
assertCondition(
  serviceSource.includes("GET /supervisor/runtime-evidence-review-report"),
  "Runtime evidence export related reports must include runtime evidence review report",
  failures,
);

for (const panelText of ["Review shortcuts"]) {
  assertCondition(detailSpec.includes(panelText), `Dashboard detail e2e must assert overview ${panelText}`, failures);
}

assertCondition(
  serviceSource.includes("docs/workflows/implementation-evidence-boundary.md"),
  "Runtime evidence export git-backed evidence must include Story 3.31",
  failures,
);
assertCondition(
  serviceSource.includes("pnpm run check:runtime-export"),
  "Verification readiness report must surface pnpm run check:runtime-export",
  failures,
);
assertCondition(
  detailSpec.includes("pnpm run check:runtime-export"),
  "Dashboard browser coverage must assert pnpm run check:runtime-export",
  failures,
);
assertCondition(
  storyIndex.includes("3-31-runtime-evidence-export-drift-check.md"),
  "Story index must reference Story 3.31 runtime evidence export drift check",
  failures,
);
assertCondition(
  storyIndex.includes("3-40-runtime-report-anchor-links.md"),
  "Story index must reference Story 3.40 runtime report anchor links",
  failures,
);
assertCondition(
  storyIndex.includes("3-42-github-workflow-policy-report.md"),
  "Story index must reference Story 3.42 GitHub workflow policy report",
  failures,
);
assertCondition(
  storyIndex.includes("6-14-git-hygiene-read-only.md"),
  "Story index must reference Story 6.14 Git hygiene read-only",
  failures,
);
assertCondition(
  storyIndex.includes("6-16-codex-readiness-no-launch.md"),
  "Story index must reference Story 6.16 Codex readiness no-launch",
  failures,
);
assertCondition(
  storyIndex.includes("6-17-codex-implementation-approval-packet.md"),
  "Story index must reference Story 6.17 Codex implementation approval packet",
  failures,
);
assertCondition(
  storyIndex.includes("6-18-claude-readiness-no-launch.md"),
  "Story index must reference Story 6.18 Claude readiness no-launch",
  failures,
);
assertCondition(
  storyIndex.includes("6-19-claude-review-approval-packet.md"),
  "Story index must reference Story 6.19 Claude review approval packet",
  failures,
);
assertCondition(
  storyIndex.includes("6-20-github-delivery-authority-ladder.md"),
  "Story index must reference Story 6.20 GitHub delivery authority ladder",
  failures,
);
assertCondition(
  storyIndex.includes("6-26-trusted-delivery-eligibility-evaluator.md"),
  "Story index must reference Story 6.26 trusted delivery eligibility evaluator",
  failures,
);
assertCondition(
  storyIndex.includes("6-27-epic-6-mvp-proof-trial-packet.md"),
  "Story index must reference Story 6.27 Epic 6 MVP proof trial packet",
  failures,
);
assertCondition(
  storyIndex.includes("6-21-local-cleanup-readiness.md"),
  "Story index must reference Story 6.21 local cleanup readiness",
  failures,
);
assertCondition(
  storyIndex.includes("6-22-remote-cleanup-sync-readiness.md"),
  "Story index must reference Story 6.22 remote cleanup sync readiness",
  failures,
);
assertCondition(
  storyIndex.includes("6-23-trusted-autonomy-readiness.md"),
  "Story index must reference Story 6.23 trusted autonomy readiness",
  failures,
);
assertCondition(
  storyIndex.includes("3-43-safe-delivery-hygiene.md"),
  "Story index must reference Story 3.43 safe delivery hygiene",
  failures,
);
assertCondition(
  storyIndex.includes("3-44-delivery-readiness-policy-report.md"),
  "Story index must reference Story 3.44 delivery readiness policy report",
  failures,
);
assertCondition(
  storyIndex.includes("3-45-delivery-readiness-policy-drift-check.md"),
  "Story index must reference Story 3.45 delivery readiness policy drift check",
  failures,
);
assertCondition(
  storyIndex.includes("3-46-maintenance-readiness-drift-check.md"),
  "Story index must reference Story 3.46 maintenance readiness drift check",
  failures,
);
assertCondition(
  storyIndex.includes("3-47-core-readiness-drift-checks.md"),
  "Story index must reference Story 3.47 core readiness drift checks",
  failures,
);
assertCondition(
  storyIndex.includes("3-48-execution-boundary-report-drift-check.md"),
  "Story index must reference Story 3.48 execution boundary report drift check",
  failures,
);
assertCondition(
  storyIndex.includes("3-49-execution-evidence-boundary-drift-check.md"),
  "Story index must reference Story 3.49 execution evidence boundary drift check",
  failures,
);
assertCondition(
  storyIndex.includes("3-50-provider-fixture-policy-drift-check.md"),
  "Story index must reference Story 3.50 provider fixture policy drift check",
  failures,
);
assertCondition(
  storyIndex.includes("3-51-process-lifecycle-policy-drift-check.md"),
  "Story index must reference Story 3.51 process lifecycle policy drift check",
  failures,
);
assertCondition(
  storyIndex.includes("3-52-maintenance-action-plan-report.md"),
  "Story index must reference Story 3.52 maintenance action plan report",
  failures,
);
assertCondition(
  storyIndex.includes("3-53-authority-readiness-matrix-report.md"),
  "Story index must reference Story 3.53 authority readiness matrix report",
  failures,
);
assertCondition(
  storyIndex.includes("3-54-development-runway-safe-slices.md"),
  "Story index must reference Story 3.54 development runway safe slices",
  failures,
);
assertCondition(
  storyIndex.includes("3-55-runtime-evidence-review-index.md"),
  "Story index must reference Story 3.55 runtime evidence review index",
  failures,
);
assertCondition(
  storyIndex.includes("3-65-runtime-review-evidence-links.md"),
  "Story index must reference Story 3.65 runtime review evidence links",
  failures,
);
assertCondition(
  storyIndex.includes("3-57-work-item-review-queue-shortcuts.md"),
  "Story index must reference Story 3.57 work-item review queue shortcuts",
  failures,
);
assertCondition(
  storyIndex.includes("3-59-development-runway-readiness-checks.md"),
  "Story index must reference Story 3.59 development runway readiness checks",
  failures,
);
assertCondition(
  storyIndex.includes("3-63-development-runway-pr-batching-policy.md"),
  "Story index must reference Story 3.63 development runway PR batching policy",
  failures,
);
assertCondition(
  storyIndex.includes("3-64-development-runway-evidence-links.md"),
  "Story index must reference Story 3.64 development runway evidence links",
  failures,
);
assertCondition(
  storyIndex.includes("3-60-safe-backlog-report-anchors.md"),
  "Story index must reference Story 3.60 safe backlog report anchors",
  failures,
);
assertCondition(
  storyIndex.includes("3-61-maintenance-action-evidence-links.md"),
  "Story index must reference Story 3.61 maintenance action evidence links",
  failures,
);
assertCondition(
  storyIndex.includes("3-62-maintenance-readiness-evidence-links.md"),
  "Story index must reference Story 3.62 maintenance readiness evidence links",
  failures,
);

if (failures.length > 0) {
  console.error("Runtime evidence export drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: runtime evidence export drift checks passed.");
