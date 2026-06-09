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
const backlogPanel = readWorkspaceFile("apps/dashboard/src/components/safe-development-backlog-panel.tsx");
const controlsSpec = readWorkspaceFile("tests/e2e/dashboard.spec.ts");
const supervisorTests = readWorkspaceFile("services/supervisor/tests/integration/test_routing_preview.py");
const storyIndex = readWorkspaceFile("docs/stories/index.md");
const reconciliation = readWorkspaceFile("docs/architecture/kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md");

const failures = [];

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
  "authority-blocked-work",
]) {
  assertCondition(serviceSource.includes(`itemId="${itemId}"`), `Safe backlog service must include item ${itemId}`, failures);
  assertCondition(supervisorTests.includes(`"${itemId}"`), `Supervisor tests must assert item ${itemId}`, failures);
}

for (const safetyText of [
  "blocked_pending_explicit_approval",
  "do_not_start",
  "Ollama stories 4.1-4.4 remain blocked",
  "Subscription-agent stories 5.1-5.5 remain blocked",
  "provider/model calls",
  "worker shell commands",
  "credential access",
  "persistent plaintext gh token storage",
  "Git/GCM",
  "Codex GitHub connector",
]) {
  assertCondition(serviceSource.includes(safetyText), `Safe backlog service must retain safety text: ${safetyText}`, failures);
}

for (const panelText of ["recommendedSliceSize", "blockedBy", "nextSafeActions", "stopLines"]) {
  assertCondition(backlogPanel.includes(panelText), `Safe backlog panel must render ${panelText}`, failures);
}

for (const browserText of [
  "Large-slice development map",
  "Report-aligned backlog governance",
  "Verification surface hardening",
  "GitHub delivery hygiene",
  "persistent plaintext gh token storage",
  "Execution-authority stories",
  "pnpm run check:safe-backlog",
]) {
  assertCondition(controlsSpec.includes(browserText), `Controls e2e must assert ${browserText}`, failures);
}

assertCondition(
  supervisorTests.includes('"check-safe-backlog"'),
  "Supervisor tests must assert verification readiness includes check-safe-backlog",
  failures,
);
assertCondition(
  supervisorTests.includes("docs/stories/3-32-safe-development-backlog-drift-check.md"),
  "Supervisor tests must assert Story 3.32 evidence",
  failures,
);

const storyPath = "docs/stories/3-32-safe-development-backlog-drift-check.md";
assertCondition(existsSync(join(rootDir, storyPath)), `Missing safe backlog drift story ${storyPath}`, failures);
const deliveryStoryPath = "docs/stories/3-43-safe-delivery-hygiene.md";
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
  reconciliation.includes("Safe development backlog drift check"),
  "Implementation reconciliation must track the safe development backlog drift check",
  failures,
);
assertCondition(
  serviceSource.includes("docs/stories/3-32-safe-development-backlog-drift-check.md"),
  "Runtime evidence export git-backed evidence must include Story 3.32",
  failures,
);
assertCondition(
  serviceSource.includes("docs/stories/3-43-safe-delivery-hygiene.md"),
  "Runtime evidence export git-backed evidence must include Story 3.43",
  failures,
);
assertCondition(
  serviceSource.includes("docs/stories/3-45-delivery-readiness-policy-drift-check.md"),
  "Runtime evidence export git-backed evidence must include Story 3.45",
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
