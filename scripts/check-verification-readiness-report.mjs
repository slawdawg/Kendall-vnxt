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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const aggregateCommandIdOverrides = {
  "test:supervisor": "supervisor-tests",
};

function extractAggregateCheckCommands(script) {
  const commands = [];
  const commandPattern = /\bpnpm\s+run\s+((?:check|test):[A-Za-z0-9:-]+)/g;
  let match;

  while ((match = commandPattern.exec(script ?? "")) !== null) {
    const scriptName = match[1];
    commands.push({
      command: `pnpm run ${scriptName}`,
      commandId:
        aggregateCommandIdOverrides[scriptName]
        ?? scriptName.replace("check:", "check-").replace("test:", "test-").replaceAll(":", "-"),
    });
  }

  return commands;
}

function uniqueCommands(commands) {
  const seen = new Set();
  const unique = [];

  for (const command of commands) {
    if (!seen.has(command.command)) {
      seen.add(command.command);
      unique.push(command);
    }
  }

  return unique;
}

function mentionsCommand(content, command) {
  return new RegExp(`${escapeRegExp(command)}(?![A-Za-z0-9:-])`).test(content);
}

const packageJson = JSON.parse(readWorkspaceFile("package.json"));
const contractSource = readWorkspaceFile("packages/contracts/src/api.ts");
const schemaSource = readWorkspaceFile("services/supervisor/src/supervisor/api/schemas.py");
const serviceSource = readWorkspaceFile("services/supervisor/src/supervisor/application/service.py");
const apiSource = readWorkspaceFile("services/supervisor/src/supervisor/api/main.py");
const dashboardClient = readWorkspaceFile("apps/dashboard/src/lib/supervisor.ts");
const controlsPage = readWorkspaceFile("apps/dashboard/src/app/controls/page.tsx");
const verificationPanel = readWorkspaceFile("apps/dashboard/src/components/verification-readiness-report-panel.tsx");
const controlsSpec = readWorkspaceFile("tests/e2e/dashboard.spec.ts");
const supervisorTests = readWorkspaceFile("services/supervisor/tests/integration/test_routing_preview.py");
const storyIndex = readWorkspaceFile("docs/workflows/implementation-evidence-boundary.md");
const reconciliation = readWorkspaceFile("docs/architecture/kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md");

const failures = [];

assertCondition(
  packageJson.scripts?.["check:verification-readiness"] === "node ./scripts/check-verification-readiness-report.mjs",
  "package.json must define check:verification-readiness as node ./scripts/check-verification-readiness-report.mjs",
  failures,
);
assertCondition(
  packageJson.scripts?.check?.includes("pnpm run check:verification-readiness"),
  "pnpm run check must include pnpm run check:verification-readiness",
  failures,
);

const aggregateCheckCommands = uniqueCommands([
  ...extractAggregateCheckCommands(packageJson.scripts?.["check:static"]),
  ...extractAggregateCheckCommands(packageJson.scripts?.check),
]);

assertCondition(
  aggregateCheckCommands.length > 0,
  "package.json aggregate check scripts must include at least one pnpm run check:* or test:* command",
  failures,
);

for (const typeName of [
  "VerificationCommandView",
  "VerificationCommandGroupView",
  "VerificationHandoffCheckpointView",
  "VerificationSurfaceCoverageView",
  "VerificationReadinessReportView",
]) {
  assertCondition(contractSource.includes(typeName), `Shared contracts must include ${typeName}`, failures);
  assertCondition(schemaSource.includes(`class ${typeName}`), `Supervisor schemas must include ${typeName}`, failures);
}

assertCondition(
  apiSource.includes('"/supervisor/verification-readiness-report"'),
  "FastAPI routes must expose /supervisor/verification-readiness-report",
  failures,
);

for (const { command, commandId } of aggregateCheckCommands) {
  assertCondition(serviceSource.includes(commandId), `Verification readiness service must include ${commandId}`, failures);
  assertCondition(mentionsCommand(serviceSource, command), `Verification readiness service must surface ${command}`, failures);
  assertCondition(supervisorTests.includes(`"${commandId}"`), `Supervisor tests must assert ${commandId}`, failures);
  assertCondition(controlsSpec.includes(command), `Controls e2e must assert ${command}`, failures);
}

for (const commandText of ["full-check"]) {
  assertCondition(serviceSource.includes(commandText), `Verification readiness service must include ${commandText}`, failures);
  assertCondition(supervisorTests.includes(`"${commandText}"`), `Supervisor tests must assert ${commandText}`, failures);
}

for (const serviceText of [
  "get_verification_readiness_report",
  "verification-readiness-report-v1",
  "executionAuthorityApproved=False",
  "commandGroups=command_groups",
  "handoffCheckpoints=handoff_checkpoints",
  "surfaceCoverage=surface_coverage",
  "static-drift-chain",
  "dashboard-browser-build",
  "full-local-gate",
  "local-development-handoff",
  "dashboard-change-handoff",
  "setup-handoff",
  "authority-boundary-handoff",
  "docs/workflows/implementation-evidence-boundary.md",
]) {
  assertCondition(serviceSource.includes(serviceText), `Verification readiness service must include ${serviceText}`, failures);
}

assertCondition(
  supervisorTests.includes('report["readyForAuthorityEnablement"] is False'),
  "Supervisor tests must assert verification readiness is not ready for authority enablement",
  failures,
);

assertCondition(dashboardClient.includes("getVerificationReadinessReport"), "Dashboard API client must fetch verification readiness report", failures);
assertCondition(
  controlsPage.includes("<VerificationReadinessReportPanel report={verificationReadinessReport} />"),
  "Controls page must render VerificationReadinessReportPanel",
  failures,
);

for (const panelText of [
  "VerificationReadinessReportView",
  "Execution plan",
  "commandGroups",
  "Handoff checkpoints",
  "handoffCheckpoints",
  "Surface coverage",
  "surfaceCoverage",
  "isTemplateHref",
  "reportShortcutHref",
  "Required commands",
  "Optional commands",
  "Authority stop lines",
]) {
  assertCondition(verificationPanel.includes(panelText), `Verification readiness panel must render ${panelText}`, failures);
}

for (const browserText of [
  "Verification readiness",
  "Checks and stop lines",
  "Execution plan",
  "static-drift-chain",
  "dashboard-browser-build",
  "full-local-gate",
  "Handoff checkpoints",
  "Surface coverage",
  "local-development-handoff",
  "dashboard-change-handoff",
  "setup-handoff",
  "authority-boundary-handoff",
]) {
  assertCondition(controlsSpec.includes(browserText), `Controls e2e must assert ${browserText}`, failures);
}

const verificationSurfaceMatrix = [
  {
    surfaceId: "dashboard-e2e-surface",
    commandIds: ["check-e2e-report", "test-dashboard-e2e-runner"],
    reports: ["GET /supervisor/verification-readiness-report", "GET /supervisor/dashboard-e2e-report"],
    anchors: ["/controls#verification-readiness-report", "/controls#dashboard-e2e-report"],
  },
  {
    surfaceId: "supervisor-report-catalog-surface",
    commandIds: ["check-reports", "check-verification-readiness"],
    reports: ["GET /supervisor/report-catalog", "GET /supervisor/verification-readiness-report"],
    anchors: ["/controls#supervisor-report-catalog", "/controls#verification-readiness-report"],
  },
  {
    surfaceId: "runtime-export-surface",
    commandIds: ["check-runtime-export", "check-runtime-review"],
    reports: [
      "GET /work-items/{id}/runtime-evidence-export",
      "GET /supervisor/runtime-evidence-review-report",
      "GET /supervisor/verification-readiness-report",
    ],
    anchors: ["/work-items/{id}", "/controls#runtime-evidence-review-report", "/controls#verification-readiness-report"],
  },
  {
    surfaceId: "safe-backlog-surface",
    commandIds: ["check-safe-backlog", "check-development-runway", "check-runner-assignment-status"],
    reports: [
      "GET /supervisor/safe-development-backlog",
      "GET /supervisor/development-runway-report",
      "GET /supervisor/runner-assignment-status-report",
    ],
    anchors: ["/controls#safe-development-backlog", "/controls#development-runway-report", "/controls#runner-assignment-status"],
  },
  {
    surfaceId: "managed-recipe-surface",
    commandIds: ["check-managed-recipes"],
    reports: ["GET /supervisor/managed-recipe-policy-report", "GET /supervisor/verification-readiness-report"],
    anchors: ["/controls#managed-recipe-policy-report", "/controls#verification-readiness-report"],
  },
  {
    surfaceId: "delivery-readiness-surface",
    commandIds: ["check-delivery-readiness", "check-github-workflow-policy", "check-cleanup-automation"],
    reports: [
      "GET /supervisor/delivery-readiness-policy-report",
      "GET /supervisor/github-workflow-policy-report",
      "GET /supervisor/local-cleanup-readiness-report",
    ],
    anchors: [
      "/controls#delivery-readiness-policy-report",
      "/controls#github-workflow-policy-report",
      "/controls#local-cleanup-readiness-report",
    ],
  },
];

for (const surface of verificationSurfaceMatrix) {
  const serviceSurfaceMatch = new RegExp(
    `VerificationSurfaceCoverageView\\([\\s\\S]*?surfaceId="${escapeRegExp(surface.surfaceId)}"[\\s\\S]*?nextAction=[\\s\\S]*?\\n\\s*\\),`,
  ).exec(serviceSource);
  const serviceSurfaceBlock = serviceSurfaceMatch?.[0] ?? "";

  assertCondition(serviceSurfaceBlock.length > 0, `Verification readiness service must include surface ${surface.surfaceId}`, failures);
  assertCondition(supervisorTests.includes(`"${surface.surfaceId}"`), `Supervisor tests must assert surface ${surface.surfaceId}`, failures);
  assertCondition(controlsSpec.includes(surface.surfaceId), `Controls e2e must assert surface ${surface.surfaceId}`, failures);

  for (const commandId of surface.commandIds) {
    assertCondition(serviceSurfaceBlock.includes(`"${commandId}"`), `Surface ${surface.surfaceId} must require command ${commandId}`, failures);
    assertCondition(supervisorTests.includes(`"${commandId}"`), `Supervisor tests must assert surface command ${commandId}`, failures);
  }

  for (const report of surface.reports) {
    assertCondition(serviceSurfaceBlock.includes(report), `Surface ${surface.surfaceId} must reference report ${report}`, failures);
    assertCondition(supervisorTests.includes(report), `Supervisor tests must assert surface report ${report}`, failures);
  }

  for (const anchor of surface.anchors) {
    assertCondition(serviceSurfaceBlock.includes(anchor), `Surface ${surface.surfaceId} must reference dashboard anchor ${anchor}`, failures);
    assertCondition(supervisorTests.includes(anchor), `Supervisor tests must assert surface dashboard anchor ${anchor}`, failures);
  }
}

const storyPath = "docs/workflows/implementation-evidence-boundary.md";
assertCondition(existsSync(join(rootDir, storyPath)), `Missing core readiness drift story ${storyPath}`, failures);
const handoffStoryPath = "docs/workflows/implementation-evidence-boundary.md";
assertCondition(existsSync(join(rootDir, handoffStoryPath)), `Missing verification handoff checkpoint story ${handoffStoryPath}`, failures);
assertCondition(
  storyIndex.includes("3-47-core-readiness-drift-checks.md"),
  "Story index must reference Story 3.47 core readiness drift checks",
  failures,
);
assertCondition(
  storyIndex.includes("3-58-verification-handoff-checkpoints.md"),
  "Story index must reference Story 3.58 verification handoff checkpoints",
  failures,
);
assertCondition(
  reconciliation.includes("Verification readiness drift check") && reconciliation.includes("Verification handoff checkpoints"),
  "Implementation reconciliation must track the verification readiness drift check and handoff checkpoints",
  failures,
);

if (failures.length > 0) {
  console.error("Verification readiness report drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: verification readiness report drift checks passed.");
