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

function scriptCommands(script) {
  return (script ?? "")
    .split("&&")
    .map((command) => command.trim())
    .filter(Boolean);
}

const packageJson = JSON.parse(readWorkspaceFile("package.json"));
const contractSource = readWorkspaceFile("packages/contracts/src/api.ts");
const typesSource = readWorkspaceFile("services/supervisor/src/supervisor/domain/types.py");
const modelSource = readWorkspaceFile("services/supervisor/src/supervisor/infrastructure/db/models.py");
const schemaSource = readWorkspaceFile("services/supervisor/src/supervisor/api/schemas.py");
const serviceSource = readWorkspaceFile("services/supervisor/src/supervisor/application/service.py");
const processLifecycleDoc = readWorkspaceFile("docs/architecture/kendall-vnxt-process-lifecycle-design-2026-06-08.md");
const supervisorTests = readWorkspaceFile("services/supervisor/tests/integration/test_routing_preview.py");
const runtimeExportCheck = readWorkspaceFile("scripts/check-runtime-evidence-export.mjs");
const runbookCheck = readWorkspaceFile("scripts/check-runbook-verification.mjs");
const storyIndex = readWorkspaceFile("docs/workflows/implementation-evidence-boundary.md");
const reconciliation = readWorkspaceFile("docs/architecture/kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md");

const failures = [];

assertCondition(
  scriptCommands(packageJson.scripts?.["check:process-lifecycle"]).includes("node ./scripts/check-process-lifecycle-policy.mjs"),
  "package.json must run node ./scripts/check-process-lifecycle-policy.mjs from check:process-lifecycle",
  failures,
);
assertCondition(
  scriptCommands(packageJson.scripts?.["check:process-lifecycle"]).includes(
    "node ./scripts/check-subscription-agent-process-launch-approval-packet.mjs",
  ),
  "package.json must run node ./scripts/check-subscription-agent-process-launch-approval-packet.mjs from check:process-lifecycle",
  failures,
);
assertCondition(
  scriptCommands(packageJson.scripts?.check).includes("pnpm run check:process-lifecycle"),
  "pnpm run check must include pnpm run check:process-lifecycle",
  failures,
);

const lifecycleStates = ["planned", "approved", "starting", "running", "cancel_requested", "cancelled", "timed_out", "failed", "completed", "rejected"];
for (const state of lifecycleStates) {
  assertCondition(contractSource.includes(`"${state}"`), `Shared contracts must include execution attempt state ${state}`, failures);
  assertCondition(typesSource.includes(`"${state}"`), `Supervisor domain types must include execution attempt state ${state}`, failures);
}

for (const modelField of ["started_at", "heartbeat_at", "cancel_requested_at", "timeout_at", "completed_at", "artifact_refs_json"]) {
  assertCondition(modelSource.includes(modelField), `ExecutionAttempt model must include lifecycle field ${modelField}`, failures);
}

for (const schemaText of ["processLaunchAllowed: bool = False", "cancelRequestedAt", "timeoutAt", "completedAt"]) {
  assertCondition(schemaSource.includes(schemaText), `Schemas must include lifecycle safety/evidence field ${schemaText}`, failures);
}

for (const serviceText of [
  "ACTIVE_EXECUTION_ATTEMPT_STATUSES",
  "TERMINAL_EXECUTION_ATTEMPT_STATUSES",
  "EXECUTION_ATTEMPT_TRANSITIONS",
  "ExecutionAttemptStatus.STARTING",
  "ExecutionAttemptStatus.RUNNING",
  "ExecutionAttemptStatus.CANCEL_REQUESTED",
  "ExecutionAttemptStatus.TIMED_OUT",
  "processLaunchAllowed",
  "attempt.cancel_requested_at = now",
  "attempt.timeout_at = now",
  "remainingDisabled",
  "process_launch",
  "workspaceIsolationPlan",
  "artifactRoot",
  "cleanupRule",
  "rollbackRule",
]) {
  assertCondition(serviceSource.includes(serviceText), `Supervisor service must include lifecycle evidence ${serviceText}`, failures);
}

for (const docText of [
  "It does not approve process launch.",
  "Future process execution must attach to an `ExecutionAttempt`, not a `QueueLease`.",
  "process supervisor id separate from OS process id",
  "per-attempt workspace materialization",
  "bounded byte limits",
  "explicit environment allowlist",
  "approval expiry",
  "orphaned processes",
  "Do not implement direct launch until a PRD approves the exact launch target and tests.",
]) {
  assertCondition(processLifecycleDoc.includes(docText), `Process lifecycle doc must include ${docText}`, failures);
}

for (const testText of [
  "test_execution_attempt_lifecycle_records_cancel_history_without_execution",
  "test_execution_attempt_lifecycle_records_completion_and_rejects_invalid_transition",
  "test_execution_attempt_approval_requires_route_worker_lane_and_authority_binding",
  'event["payload"]["processLaunchAllowed"] is False',
  'approved_event["payload"]["remainingDisabled"]',
  '"process_launch"',
  '"check-process-lifecycle"',
]) {
  assertCondition(supervisorTests.includes(testText), `Supervisor tests must assert ${testText}`, failures);
}

for (const story of [
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
]) {
  assertCondition(existsSync(join(rootDir, story)), `Missing process lifecycle story evidence ${story}`, failures);
  assertCondition(storyIndex.includes(story.split("/").pop()), `Story index must reference ${story}`, failures);
}

assertCondition(
  runtimeExportCheck.includes("docs/workflows/implementation-evidence-boundary.md"),
  "Runtime evidence export drift check must require Story 3.51 git-backed evidence",
  failures,
);
assertCondition(
  serviceSource.includes("docs/workflows/implementation-evidence-boundary.md"),
  "Runtime evidence export service must include Story 3.51 git-backed evidence",
  failures,
);
assertCondition(
  serviceSource.includes("pnpm run check:process-lifecycle"),
  "Verification readiness report must surface pnpm run check:process-lifecycle",
  failures,
);
assertCondition(
  runbookCheck.includes("activeVerificationCommands") &&
    runbookCheck.includes('extractVerificationCommands(packageJson.scripts?.["check:static"])') &&
    runbookCheck.includes("extractVerificationCommands(packageJson.scripts?.check)") &&
    runbookCheck.includes("(?:check|test|build):") &&
    runbookCheck.includes("extractorProbeCommands") &&
    runbookCheck.includes("pnpm run build:dashboard") &&
    runbookCheck.includes("for (const command of activeVerificationCommands)") &&
    runbookCheck.includes("mentionsCommand(content, command)"),
  "Runbook drift check must derive active check/test/build commands from package.json aggregate scripts",
  failures,
);
assertCondition(
  reconciliation.includes("Process lifecycle policy drift check"),
  "Implementation reconciliation must track the process lifecycle policy drift check",
  failures,
);

if (failures.length > 0) {
  console.error("Process lifecycle policy drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: process lifecycle policy drift checks passed.");
