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
const serviceSource = readWorkspaceFile("services/supervisor/src/supervisor/application/service.py");
const dashboardSpec = readWorkspaceFile("tests/e2e/dashboard.spec.ts");
const storyIndex = readWorkspaceFile("docs/stories/index.md");

const expectedPackageScripts = [
  ["setup:e2e", "node ./scripts/setup-e2e.mjs"],
  ["check:e2e-report", "node ./scripts/check-dashboard-e2e-report.mjs"],
  ["test:e2e:dashboard", "playwright test"],
  ["test:e2e:dashboard:controls", "node ./scripts/run-controls-e2e.mjs"],
  ["test:e2e:dashboard:detail", "node ./scripts/run-detail-e2e.mjs"],
  ["test:e2e:dashboard:mobile", "node ./scripts/run-mobile-e2e.mjs"],
  ["test:e2e:dashboard:managed", "node ./scripts/run-managed-recipe-e2e.mjs"],
  ["test:e2e:dashboard:managed:mobile", "node ./scripts/run-managed-mobile-recipe-e2e.mjs"],
  ["test:e2e:dashboard:provider-raw-output", "node ./scripts/run-provider-raw-output-ui-e2e.mjs"],
];

const expectedRunners = [
  {
    runnerId: "dashboard-controls-e2e",
    command: "pnpm run test:e2e:dashboard:controls",
    runnerScript: "scripts/run-controls-e2e.mjs",
    story: "docs/stories/3-17-dashboard-e2e-reliability-guardrails.md",
  },
  {
    runnerId: "dashboard-detail-e2e",
    command: "pnpm run test:e2e:dashboard:detail",
    runnerScript: "scripts/run-detail-e2e.mjs",
    story: "docs/stories/3-21-dashboard-detail-e2e-runner.md",
  },
  {
    runnerId: "dashboard-mobile-e2e",
    command: "pnpm run test:e2e:dashboard:mobile",
    runnerScript: "scripts/run-mobile-e2e.mjs",
    story: "docs/stories/3-24-dashboard-mobile-e2e-runner.md",
  },
  {
    runnerId: "dashboard-managed-recipe-e2e",
    command: "pnpm run test:e2e:dashboard:managed",
    runnerScript: "scripts/run-managed-recipe-e2e.mjs",
    story: "docs/stories/3-25-managed-recipe-e2e-runners.md",
  },
  {
    runnerId: "dashboard-managed-mobile-recipe-e2e",
    command: "pnpm run test:e2e:dashboard:managed:mobile",
    runnerScript: "scripts/run-managed-mobile-recipe-e2e.mjs",
    story: "docs/stories/3-25-managed-recipe-e2e-runners.md",
  },
  {
    runnerId: "dashboard-provider-raw-output-e2e",
    command: "pnpm run test:e2e:dashboard:provider-raw-output",
    runnerScript: "scripts/run-provider-raw-output-ui-e2e.mjs",
    story: "docs/stories/9-3-restore-provider-raw-output-ui-regression-coverage.md",
  },
  {
    runnerId: "dashboard-full-e2e",
    command: "pnpm run test:e2e:dashboard",
    runnerScript: "playwright.config.ts",
    story: "docs/stories/3-22-dashboard-e2e-report.md",
  },
];

const failures = [];

for (const [scriptName, expectedCommand] of expectedPackageScripts) {
  assertCondition(
    packageJson.scripts?.[scriptName] === expectedCommand,
    `package.json script ${scriptName} must be ${expectedCommand}`,
    failures,
  );
}

for (const runner of expectedRunners) {
  assertCondition(
    existsSync(join(rootDir, runner.runnerScript)),
    `Missing runner evidence file ${runner.runnerScript}`,
    failures,
  );
  assertCondition(existsSync(join(rootDir, runner.story)), `Missing story evidence file ${runner.story}`, failures);
  assertCondition(
    serviceSource.includes(runner.runnerId),
    `Supervisor dashboard e2e report must include runner id ${runner.runnerId}`,
    failures,
  );
  assertCondition(
    serviceSource.includes(runner.command),
    `Supervisor reports must include command ${runner.command}`,
    failures,
  );
  assertCondition(
    dashboardSpec.includes(runner.command),
    `Dashboard browser coverage must assert command ${runner.command}`,
    failures,
  );
  assertCondition(
    storyIndex.includes(runner.story.split("/").at(-1)),
    `Story index must reference ${runner.story}`,
    failures,
  );
}

assertCondition(
  serviceSource.includes("pnpm run check:e2e-report"),
  "Verification readiness report must surface pnpm run check:e2e-report",
  failures,
);
assertCondition(
  dashboardSpec.includes("pnpm run check:e2e-report"),
  "Dashboard browser coverage must assert pnpm run check:e2e-report",
  failures,
);
assertCondition(
  storyIndex.includes("3-26-dashboard-e2e-report-drift-check.md"),
  "Story index must reference Story 3.26 dashboard e2e report drift check",
  failures,
);

if (failures.length > 0) {
  console.error("Dashboard e2e report drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: dashboard e2e report drift checks passed.");
