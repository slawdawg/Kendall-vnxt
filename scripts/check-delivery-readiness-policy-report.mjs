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
const controlsPage = readWorkspaceFile("apps/dashboard/src/app/controls/page.tsx");
const reportShortcuts = readWorkspaceFile("apps/dashboard/src/lib/report-shortcuts.ts");
const policyPanel = readWorkspaceFile("apps/dashboard/src/components/delivery-readiness-policy-report-panel.tsx");
const controlsSpec = readWorkspaceFile("tests/e2e/dashboard.spec.ts");
const supervisorTests = readWorkspaceFile("services/supervisor/tests/integration/test_routing_preview.py");
const storyIndex = readWorkspaceFile("docs/stories/index.md");
const reconciliation = readWorkspaceFile("docs/architecture/kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md");

const failures = [];

assertCondition(
  packageJson.scripts?.["check:delivery-readiness"] === "node ./scripts/check-delivery-readiness-policy-report.mjs",
  "package.json must define check:delivery-readiness as node ./scripts/check-delivery-readiness-policy-report.mjs",
  failures,
);
assertCondition(
  packageJson.scripts?.check?.includes("pnpm run check:delivery-readiness"),
  "pnpm run check must include pnpm run check:delivery-readiness",
  failures,
);

for (const typeName of ["DeliveryReadinessPolicyItemView", "DeliveryReadinessPolicyReportView"]) {
  assertCondition(contractSource.includes(typeName), `Shared contracts must include ${typeName}`, failures);
  assertCondition(schemaSource.includes(`class ${typeName}`), `Supervisor schemas must include ${typeName}`, failures);
}

assertCondition(
  apiSource.includes('"/supervisor/delivery-readiness-policy-report"'),
  "FastAPI routes must expose /supervisor/delivery-readiness-policy-report",
  failures,
);

for (const serviceText of [
  "get_delivery_readiness_policy_report",
  "delivery-readiness-policy-report-v1",
  "remoteAutomationApproved=False",
  "Record delivery readiness only through the work-item delivery readiness checkpoint form.",
  "local-only waiver",
  "GET /supervisor/delivery-readiness-policy-report",
  "docs/stories/3-45-delivery-readiness-policy-drift-check.md",
]) {
  assertCondition(serviceSource.includes(serviceText), `Delivery readiness policy service must include ${serviceText}`, failures);
}

assertCondition(
  dashboardClient.includes("getDeliveryReadinessPolicyReport"),
  "Dashboard API client must fetch the delivery readiness policy report",
  failures,
);
assertCondition(
  controlsPage.includes("<DeliveryReadinessPolicyReportPanel report={deliveryReadinessPolicyReport} />"),
  "Controls page must render DeliveryReadinessPolicyReportPanel",
  failures,
);
assertCondition(
  reportShortcuts.includes('"GET /supervisor/delivery-readiness-policy-report": "#delivery-readiness-policy-report"'),
  "Report shortcut helper must map delivery readiness report endpoint to the controls anchor",
  failures,
);

for (const panelText of [
  "DeliveryReadinessPolicyReportView",
  "Review gate policy",
  "statusPolicy",
  "waiverPolicy",
  "remoteAutomationApproved",
  "stopLines",
  "nextSafeActions",
]) {
  assertCondition(policyPanel.includes(panelText), `Delivery readiness policy panel must render ${panelText}`, failures);
}

for (const browserText of [
  "GET /supervisor/delivery-readiness-policy-report",
  "Review gate policy",
  "Pull request evidence",
  "Local-only delivery waiver",
  "Record delivery readiness only through the work-item delivery readiness checkpoint form.",
  "pnpm run check:delivery-readiness",
]) {
  assertCondition(controlsSpec.includes(browserText), `Controls e2e must assert ${browserText}`, failures);
}

for (const testText of [
  '"delivery-readiness-policy-report-v1"',
  '"/supervisor/delivery-readiness-policy-report"',
  '"pull-request-status"',
  '"local-only-waiver"',
  "remoteAutomationApproved",
  "docs/stories/3-45-delivery-readiness-policy-drift-check.md",
]) {
  assertCondition(supervisorTests.includes(testText), `Supervisor tests must assert ${testText}`, failures);
}

const storyPath = "docs/stories/3-45-delivery-readiness-policy-drift-check.md";
assertCondition(existsSync(join(rootDir, storyPath)), `Missing delivery readiness policy drift story ${storyPath}`, failures);
assertCondition(
  storyIndex.includes("3-45-delivery-readiness-policy-drift-check.md"),
  "Story index must reference Story 3.45 delivery readiness policy drift check",
  failures,
);
assertCondition(
  reconciliation.includes("Delivery readiness policy drift check"),
  "Implementation reconciliation must track the delivery readiness policy drift check",
  failures,
);
assertCondition(
  serviceSource.includes("pnpm run check:delivery-readiness"),
  "Verification readiness report must surface pnpm run check:delivery-readiness",
  failures,
);

if (failures.length > 0) {
  console.error("Delivery readiness policy report drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: delivery readiness policy report drift checks passed.");
