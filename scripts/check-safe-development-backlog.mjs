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

const packageJson = JSON.parse(readWorkspaceFile("package.json"));
const contractSource = readWorkspaceFile("packages/contracts/src/api.ts");
const schemaSource = readWorkspaceFile("services/supervisor/src/supervisor/api/schemas.py");
const serviceSource = readWorkspaceFile("services/supervisor/src/supervisor/application/service.py");
const apiSource = readWorkspaceFile("services/supervisor/src/supervisor/api/main.py");
const dashboardClient = readWorkspaceFile("apps/dashboard/src/lib/supervisor.ts");
const reportShortcuts = readWorkspaceFile("apps/dashboard/src/lib/report-shortcuts.ts");
const controlsPage = readWorkspaceFile("apps/dashboard/src/app/controls/page.tsx");
const backlogPanel = readWorkspaceFile("apps/dashboard/src/components/safe-development-backlog-panel.tsx");
const controlsSpec = readWorkspaceFile("tests/e2e/dashboard.spec.ts");
const supervisorTests = readWorkspaceFile("services/supervisor/tests/integration/test_routing_preview.py");
const storyIndex = readWorkspaceFile("docs/workflows/implementation-evidence-boundary.md");
const reconciliation = readWorkspaceFile("docs/architecture/kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md");

const failures = [];

const verificationEvidenceLabels = [
  "3-27-safe-development-backlog-report.md",
  "3-32-safe-development-backlog-drift-check.md",
  "3-47-core-readiness-drift-checks.md",
  "3-56-verification-execution-plan-groups.md",
  "3-58-verification-handoff-checkpoints.md",
  "3-60-safe-backlog-report-anchors.md",
];
const verificationRelatedReports = ["GET /supervisor/verification-readiness-report", "GET /supervisor/dashboard-e2e-report"];
const verificationRelatedDocs = ["docs/workflows/implementation-evidence-boundary.md"];
const verificationDashboardAnchors = [
  "/controls#verification-readiness-report",
  "/controls#dashboard-e2e-report",
  "/controls#supervisor-report-catalog",
  "/controls#development-runway-report",
];
const reportAnchorExpectations = {
  "GET /supervisor/verification-readiness-report": "#verification-readiness-report",
  "GET /supervisor/dashboard-e2e-report": "#dashboard-e2e-report",
};

const verificationItemMatch = serviceSource.match(
  /SafeDevelopmentBacklogItemView\(\s*itemId="verification-surface-hardening"[\s\S]*?\n\s*\)(?=,\n\s*SafeDevelopmentBacklogItemView\(|,?\n\s*\])/,
);
const verificationItemSource = verificationItemMatch?.[0] ?? "";
const githubDeliveryItemMatch = serviceSource.match(
  /SafeDevelopmentBacklogItemView\(\s*itemId="github-delivery-hygiene"[\s\S]*?\n\s*\)(?=,\n\s*SafeDevelopmentBacklogItemView\(|,?\n\s*\])/,
);
const githubDeliveryItemSource = githubDeliveryItemMatch?.[0] ?? "";
const workerQueueItemMatch = serviceSource.match(
  /SafeDevelopmentBacklogItemView\(\s*itemId="worker-backlog-queue-refresh"[\s\S]*?\n\s*\)(?=,\n\s*SafeDevelopmentBacklogItemView\(|,?\n\s*\])/,
);
const workerQueueItemSource = workerQueueItemMatch?.[0] ?? "";

function countOccurrences(source, text) {
  return source.split(text).length - 1;
}

function extractPythonStringList(source, fieldName) {
  const match = source.match(new RegExp(`${fieldName}=\\[([\\s\\S]*?)\\],`));
  if (!match) {
    return [];
  }
  return Array.from(match[1].matchAll(/"([^"]+)"/g), (item) => item[1]);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function reportShortcutAnchor(report) {
  const match = reportShortcuts.match(new RegExp(`"${escapeRegExp(report)}"\\s*:\\s*"([^"]+)"`));
  return match?.[1] ?? "";
}

function assertExactList(actual, expected, label) {
  assertCondition(
    actual.length === expected.length && actual.every((value, index) => value === expected[index]),
    `${label} must exactly match ${JSON.stringify(expected)} but found ${JSON.stringify(actual)}`,
    failures,
  );
}

function assertUniqueList(values, label) {
  assertCondition(
    new Set(values).size === values.length,
    `${label} must not contain duplicate entries: ${JSON.stringify(values)}`,
    failures,
  );
}

assertCondition(
  packageJson.scripts?.["check:safe-backlog"] === "node ./scripts/check-safe-development-backlog.mjs",
  "package.json must define check:safe-backlog as node ./scripts/check-safe-development-backlog.mjs",
  failures,
);
assertCondition(
  packageJson.scripts?.check?.includes("pnpm run check:safe-backlog"),
  "pnpm run check must include pnpm run check:safe-backlog",
  failures,
);

for (const typeName of ["SafeDevelopmentBacklogItemView", "SafeDevelopmentBacklogReportView"]) {
  assertCondition(contractSource.includes(typeName), `Shared contracts must include ${typeName}`, failures);
  assertCondition(schemaSource.includes(`class ${typeName}`), `Supervisor schemas must include ${typeName}`, failures);
}

assertCondition(
  apiSource.includes('"/supervisor/safe-development-backlog"'),
  "FastAPI routes must expose /supervisor/safe-development-backlog",
  failures,
);
assertCondition(
  dashboardClient.includes("getSafeDevelopmentBacklogReport"),
  "Dashboard API client must fetch the safe development backlog report",
  failures,
);
assertCondition(
  controlsPage.includes("<SafeDevelopmentBacklogPanel report={safeDevelopmentBacklog} />"),
  "Controls page must render SafeDevelopmentBacklogPanel",
  failures,
);

for (const itemId of [
  "safe-backlog-report-alignment",
  "verification-surface-hardening",
  "github-delivery-hygiene",
  "read-only-evidence-polish",
  "worker-backlog-queue-refresh",
  "lane-handoff-evidence-refresh",
  "report-catalog-shortcut-refresh",
  "authority-blocked-work",
]) {
  assertCondition(serviceSource.includes(`itemId="${itemId}"`), `Safe backlog service must include item ${itemId}`, failures);
  assertCondition(supervisorTests.includes(`"${itemId}"`), `Supervisor tests must assert item ${itemId}`, failures);
}

assertCondition(
  verificationItemSource.includes('itemId="verification-surface-hardening"'),
  "Safe backlog service must expose the verification-surface-hardening item block",
  failures,
);
assertCondition(
  workerQueueItemSource.includes('itemId="worker-backlog-queue-refresh"'),
  "Safe backlog service must expose the worker-backlog-queue-refresh item block",
  failures,
);
assertCondition(
  contractSource.includes("sourceEvidenceLabels?: string[]"),
  "Shared contracts must include optional sourceEvidenceLabels for safe backlog items",
  failures,
);
assertCondition(
  schemaSource.includes("sourceEvidenceLabels: list[str] = Field(default_factory=list)"),
  "Supervisor schemas must default sourceEvidenceLabels to an empty list",
  failures,
);
assertCondition(
  backlogPanel.includes("sourceEvidenceLabels") && backlogPanel.includes("Source evidence labels") && backlogPanel.includes("Related docs"),
  "Safe backlog panel must render source evidence labels and related docs",
  failures,
);

const parsedVerificationLabels = extractPythonStringList(verificationItemSource, "sourceEvidenceLabels");
const parsedVerificationReports = extractPythonStringList(verificationItemSource, "relatedReports");
const parsedVerificationDocs = extractPythonStringList(verificationItemSource, "relatedDocs");
const parsedVerificationAnchors = extractPythonStringList(verificationItemSource, "dashboardAnchors");
const safeBacklogItemSources = Array.from(
  serviceSource.matchAll(/SafeDevelopmentBacklogItemView\([\s\S]*?\n\s*\)(?=,\n\s*SafeDevelopmentBacklogItemView\(|,?\n\s*\])/g),
  (match) => match[0],
);
const safeBacklogRelatedReports = Array.from(
  new Set(safeBacklogItemSources.flatMap((itemSource) => extractPythonStringList(itemSource, "relatedReports"))),
);

assertExactList(parsedVerificationLabels, verificationEvidenceLabels, "Verification source evidence labels");
assertExactList(parsedVerificationReports, verificationRelatedReports, "Verification related reports");
assertExactList(parsedVerificationDocs, verificationRelatedDocs, "Verification related docs");
assertExactList(parsedVerificationAnchors, verificationDashboardAnchors, "Verification dashboard anchors");
assertUniqueList(parsedVerificationLabels, "Verification source evidence labels");
assertUniqueList(parsedVerificationReports, "Verification related reports");
assertUniqueList(parsedVerificationDocs, "Verification related docs");
assertUniqueList(parsedVerificationAnchors, "Verification dashboard anchors");
assertCondition(
  githubDeliveryItemSource.includes('itemId="github-delivery-hygiene"'),
  "Safe backlog service must expose the github-delivery-hygiene item block",
  failures,
);
for (const [fieldName, label] of [
  ["relatedReports", "GitHub delivery related reports"],
  ["relatedDocs", "GitHub delivery related docs"],
  ["dashboardAnchors", "GitHub delivery dashboard anchors"],
]) {
  assertUniqueList(extractPythonStringList(githubDeliveryItemSource, fieldName), label);
}
assertCondition(
  parsedVerificationLabels.every((label) => storyIndex.includes(label)),
  "Verification source evidence labels must all exist in implementation-evidence-boundary.md",
  failures,
);

for (const label of verificationEvidenceLabels) {
  assertCondition(storyIndex.includes(label), `Implementation evidence boundary must include verification source label ${label}`, failures);
  assertCondition(verificationItemSource.includes(`"${label}"`), `Verification safe backlog item must include source label ${label}`, failures);
  assertCondition(supervisorTests.includes(`"${label}"`), `Supervisor tests must assert verification source label ${label}`, failures);
  assertCondition(controlsSpec.includes(label), `Controls e2e must assert verification source label ${label}`, failures);
}

for (const doc of verificationRelatedDocs) {
  assertCondition(verificationItemSource.includes(`"${doc}"`), `Verification safe backlog item must include related doc ${doc}`, failures);
  assertCondition(
    countOccurrences(verificationItemSource, `"${doc}"`) === 1,
    `Verification safe backlog item must include related doc ${doc} exactly once`,
    failures,
  );
  assertCondition(supervisorTests.includes(`"${doc}"`), `Supervisor tests must assert verification related doc ${doc}`, failures);
  assertCondition(controlsSpec.includes(doc), `Controls e2e must assert verification related doc ${doc}`, failures);
}

for (const report of verificationRelatedReports) {
  assertCondition(verificationItemSource.includes(`"${report}"`), `Verification safe backlog item must include related report ${report}`, failures);
  assertCondition(
    reportShortcuts.includes(`"${report}": "${reportAnchorExpectations[report]}"`),
    `Report shortcuts must map ${report} to ${reportAnchorExpectations[report]}`,
    failures,
  );
  assertCondition(controlsSpec.includes(report), `Controls e2e must assert verification report link ${report}`, failures);
}

for (const report of safeBacklogRelatedReports) {
  const shortcutAnchor = reportShortcutAnchor(report);
  assertCondition(
    shortcutAnchor.length > 0 && (report === "GET /supervisor/report-catalog" || shortcutAnchor !== "#supervisor-report-catalog"),
    `Safe backlog related report ${report} must have an explicit dashboard shortcut instead of falling back to the report catalog`,
    failures,
  );
}

for (const anchor of verificationDashboardAnchors) {
  assertCondition(verificationItemSource.includes(`"${anchor}"`), `Verification safe backlog item must include dashboard anchor ${anchor}`, failures);
  assertCondition(controlsSpec.includes(anchor), `Controls e2e must assert verification dashboard anchor ${anchor}`, failures);
}

assertCondition(
  verificationEvidenceLabels.every((label) => countOccurrences(verificationItemSource, `"${label}"`) === 1),
  "Verification source evidence labels must be unique in the service item",
  failures,
);
assertCondition(
  workerQueueItemSource.includes('status="closed"') &&
    workerQueueItemSource.includes('recommendedSliceSize="complete"') &&
    !workerQueueItemSource.includes("nextLane=") &&
    workerQueueItemSource.includes("do not requeue worker-backlog-queue-refresh") &&
    workerQueueItemSource.includes("claim-next should advance to lane-handoff-evidence-refresh"),
  "Worker backlog queue refresh must be closed completion evidence and must not expose a dispatchable next lane",
  failures,
);

for (const safetyText of [
  "blocked_pending_explicit_approval",
  "do_not_start",
  "Ollama Story 4.4 is approved only for VM-to-host endpoint http://192.168.1.128:11434/v1/chat/completions and model qwen3:14b.",
  "LM Studio, vLLM, llama.cpp, remote providers, premium execution, commands, source mutation, credentials, and unapproved network access remain blocked.",
  "Subscription-agent Story 5.5 remains blocked pending explicit process-launch approval",
  "provider/model calls",
  "worker shell commands",
  "credential access",
  "persistent plaintext gh token storage",
  "Git/GCM",
  "Codex GitHub connector",
  "node ./scripts/codex-workspace.mjs start",
  'lane_slug="verification-surface-hardening"',
  'lane_slug="github-delivery-hygiene"',
  'lane_slug="read-only-evidence-polish"',
  'lane_slug="lane-handoff-evidence-refresh"',
  'lane_slug="report-catalog-shortcut-refresh"',
  "complete",
  "Use this completed item as evidence only; do not requeue it as a new lane.",
  "Use this completed queue refresh as evidence only; do not requeue worker-backlog-queue-refresh.",
  "uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py",
  "Do not start or modify another active lane while using this recommendation.",
  "Current claim-next evidence can become starved when all ready lanes are active or assigned to other runners.",
  "After this completed item closes, claim-next should advance to lane-handoff-evidence-refresh instead of requeueing worker-backlog-queue-refresh.",
  "Generated backlog items should link to explicit dashboard report anchors rather than falling back to the report catalog.",
]) {
  assertCondition(serviceSource.includes(safetyText), `Safe backlog service must retain safety text: ${safetyText}`, failures);
}

for (const panelText of [
  "recommendedSliceSize",
  "blockedBy",
  "dashboardAnchors",
  "sourceEvidenceLabels",
  "Source evidence labels",
  "Related docs",
  "NextLaneRecommendationView",
  "Next lane handoff",
  "item.nextLane",
  "nextLane.startCommand",
  "nextLane.verificationCommands",
  "reportShortcutHref",
  "Related report links",
  "nextSafeActions",
  "stopLines",
]) {
  assertCondition(backlogPanel.includes(panelText), `Safe backlog panel must render ${panelText}`, failures);
}

for (const browserText of [
  "Large-slice development map",
  "Report-aligned backlog governance",
  "Next lane handoff",
  "branch: codex/report-catalog-shortcut-refresh",
  'start: node ./scripts/codex-workspace.mjs start "report catalog shortcut refresh"',
  "pnpm run check:reports",
  "pnpm run check:safe-backlog",
  "Related report links",
  "Source evidence labels",
  "Related docs",
  "/controls#github-workflow-policy-report",
  "Verification surface hardening",
  "3-27-safe-development-backlog-report.md",
  "Verification surface hardening is read-only planning guidance, not execution-authority approval.",
  "GitHub delivery hygiene",
  "persistent plaintext gh token storage",
  "Worker backlog queue refresh",
  "slice: complete",
  "do not requeue worker-backlog-queue-refresh",
  "claim-next should advance to lane-handoff-evidence-refresh",
  "claim-next evidence can become starved",
  "Lane handoff evidence refresh",
  "branch: codex/lane-handoff-evidence-refresh",
  'start: node ./scripts/codex-workspace.mjs start "lane handoff evidence refresh"',
  "Report catalog shortcut refresh",
  "branch: codex/report-catalog-shortcut-refresh",
  'start: node ./scripts/codex-workspace.mjs start "report catalog shortcut refresh"',
  "Execution-authority stories",
  "pnpm run check:safe-backlog",
  "Do not start or modify another active lane while using this recommendation.",
]) {
  assertCondition(controlsSpec.includes(browserText), `Controls e2e must assert ${browserText}`, failures);
}

assertCondition(
  supervisorTests.includes('"check-safe-backlog"'),
  "Supervisor tests must assert verification readiness includes check-safe-backlog",
  failures,
);
assertCondition(
  supervisorTests.includes('report_alignment_item["status"] == "closed"') &&
    supervisorTests.includes('report_alignment_item["nextLane"] is None') &&
    supervisorTests.includes('github_item["status"] == "closed"') &&
    supervisorTests.includes('github_item["nextLane"] is None') &&
    supervisorTests.includes('worker_queue_item["status"] == "closed"') &&
    supervisorTests.includes('worker_queue_item["nextLane"] is None') &&
    supervisorTests.includes('"codex/report-catalog-shortcut-refresh"') &&
    supervisorTests.includes('node ./scripts/codex-workspace.mjs start "report catalog shortcut refresh"') &&
    supervisorTests.includes("pnpm run check:reports"),
  "Supervisor tests must assert completed backlog and next-lane handoff evidence",
  failures,
);
assertCondition(
  supervisorTests.includes("docs/workflows/implementation-evidence-boundary.md"),
  "Supervisor tests must assert Story 3.32 evidence",
  failures,
);

const storyPath = "docs/workflows/implementation-evidence-boundary.md";
assertCondition(existsSync(join(rootDir, storyPath)), `Missing safe backlog drift story ${storyPath}`, failures);
const anchorStoryPath = "docs/workflows/implementation-evidence-boundary.md";
assertCondition(existsSync(join(rootDir, anchorStoryPath)), `Missing safe backlog report anchor story ${anchorStoryPath}`, failures);
const deliveryStoryPath = "docs/workflows/implementation-evidence-boundary.md";
assertCondition(existsSync(join(rootDir, deliveryStoryPath)), `Missing safe delivery hygiene story ${deliveryStoryPath}`, failures);
assertCondition(
  storyIndex.includes("3-32-safe-development-backlog-drift-check.md"),
  "Story index must reference Story 3.32 safe backlog drift check",
  failures,
);
assertCondition(
  storyIndex.includes("3-43-safe-delivery-hygiene.md"),
  "Story index must reference Story 3.43 safe delivery hygiene",
  failures,
);
assertCondition(
  storyIndex.includes("3-60-safe-backlog-report-anchors.md"),
  "Story index must reference Story 3.60 safe backlog report anchors",
  failures,
);
assertCondition(
  reconciliation.includes("Safe development backlog drift check") && reconciliation.includes("Safe backlog report anchors"),
  "Implementation reconciliation must track the safe development backlog drift check and report anchors",
  failures,
);
assertCondition(
  serviceSource.includes("docs/workflows/implementation-evidence-boundary.md"),
  "Runtime evidence export git-backed evidence must include Story 3.32",
  failures,
);
assertCondition(
  serviceSource.includes("docs/workflows/implementation-evidence-boundary.md"),
  "Runtime evidence export git-backed evidence must include Story 3.43",
  failures,
);
assertCondition(
  serviceSource.includes("docs/workflows/implementation-evidence-boundary.md"),
  "Runtime evidence export git-backed evidence must include Story 3.45",
  failures,
);
assertCondition(
  serviceSource.includes("docs/workflows/implementation-evidence-boundary.md"),
  "Runtime evidence export git-backed evidence must include Story 3.46",
  failures,
);
assertCondition(
  serviceSource.includes("docs/workflows/implementation-evidence-boundary.md"),
  "Runtime evidence export git-backed evidence must include Story 3.47",
  failures,
);
assertCondition(
  serviceSource.includes("docs/workflows/implementation-evidence-boundary.md"),
  "Runtime evidence export git-backed evidence must include Story 3.60",
  failures,
);
assertCondition(
  serviceSource.includes("GET /supervisor/github-workflow-policy-report"),
  "Safe backlog must reference the GitHub workflow policy report",
  failures,
);
assertCondition(
  serviceSource.includes("GET /supervisor/delivery-readiness-policy-report"),
  "Safe backlog must reference the delivery readiness policy report",
  failures,
);
assertCondition(
  serviceSource.includes("/controls#github-workflow-policy-report") &&
    serviceSource.includes("/controls#delivery-readiness-policy-report") &&
    serviceSource.includes("/controls#development-runway-report"),
  "Safe backlog service must include dashboard anchors for related reports",
  failures,
);
assertCondition(
  serviceSource.includes("pnpm run check:safe-backlog"),
  "Verification readiness report must surface pnpm run check:safe-backlog",
  failures,
);

if (failures.length > 0) {
  console.error("Safe development backlog drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: safe development backlog drift checks passed.");
