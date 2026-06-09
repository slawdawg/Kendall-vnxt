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
const workerRegistrySource = readWorkspaceFile("services/supervisor/src/supervisor/domain/worker_registry.py");
const disabledProviderAdapterSource = readWorkspaceFile("services/supervisor/src/supervisor/domain/disabled_provider_adapter.py");
const reportCatalogCheck = readWorkspaceFile("scripts/check-supervisor-report-catalog.mjs");
const runtimeExportCheck = readWorkspaceFile("scripts/check-runtime-evidence-export.mjs");
const runbookCheck = readWorkspaceFile("scripts/check-runbook-verification.mjs");
const controlsSpec = readWorkspaceFile("tests/e2e/dashboard.spec.ts");
const supervisorTests = readWorkspaceFile("services/supervisor/tests/integration/test_routing_preview.py");
const storyIndex = readWorkspaceFile("docs/stories/index.md");
const reconciliation = readWorkspaceFile("docs/architecture/kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md");

const failures = [];

assertCondition(
  packageJson.scripts?.["check:execution-evidence"] === "node ./scripts/check-execution-evidence-boundaries.mjs",
  "package.json must define check:execution-evidence as node ./scripts/check-execution-evidence-boundaries.mjs",
  failures,
);
assertCondition(
  packageJson.scripts?.check?.includes("pnpm run check:execution-evidence"),
  "pnpm run check must include pnpm run check:execution-evidence",
  failures,
);

for (const typeName of ["DisabledProviderProofView", "ExecutionStateBoundaryView"]) {
  assertCondition(contractSource.includes(typeName), `Shared contracts must include ${typeName}`, failures);
  assertCondition(schemaSource.includes(`class ${typeName}`), `Supervisor schemas must include ${typeName}`, failures);
}

for (const routeText of ['"/supervisor/disabled-provider-proofs"', '"/supervisor/execution-state-boundary"']) {
  assertCondition(apiSource.includes(routeText), `FastAPI routes must expose ${routeText}`, failures);
  assertCondition(reportCatalogCheck.includes(routeText.slice(1, -1)), `Report catalog drift check must include ${routeText}`, failures);
}

for (const serviceText of [
  "list_disabled_provider_proofs",
  "get_execution_state_boundary",
  "queue-lease-execution-attempt-boundary-v1",
  "endpointPolicy=proof.endpoint_policy",
  "httpCallsAttempted=proof.http_calls_attempted",
  "modelCallsAttempted=proof.model_calls_attempted",
  "networkAccessAttempted=proof.network_access_attempted",
  "credentialAccessAttempted=proof.credential_access_attempted",
  "forbiddenQueueLeaseFields",
  "futureProcessLifecycleAttachments",
]) {
  assertCondition(serviceSource.includes(serviceText), `Execution evidence service must include ${serviceText}`, failures);
}
for (const schemaText of ["queueLeaseGrantsExecutionAuthority: bool = False", "executionAttemptLaunchesWorkers: bool = False"]) {
  assertCondition(schemaSource.includes(schemaText), `Execution state boundary schema must include ${schemaText}`, failures);
}
for (const workerId of ["local.ollama.disabled", "local.lmstudio.disabled", "local.vllm.disabled", "local.llamacpp.disabled"]) {
  assertCondition(workerRegistrySource.includes(workerId), `Worker registry must include disabled provider ${workerId}`, failures);
  assertCondition(disabledProviderAdapterSource.includes(workerId), `Disabled provider adapter must include no-call fixture ${workerId}`, failures);
  assertCondition(supervisorTests.includes(`"${workerId}"`), `Supervisor tests must assert disabled provider ${workerId}`, failures);
}

for (const testText of [
  "test_disabled_provider_proofs_are_provider_specific_and_non_calling",
  "test_execution_state_boundary_keeps_queue_leases_separate_from_attempt_authority",
  '"/supervisor/disabled-provider-proofs"',
  '"/supervisor/execution-state-boundary"',
  '"queue-lease-execution-attempt-boundary-v1"',
  '"local.ollama.disabled"',
  '"local.lmstudio.disabled"',
  '"local.vllm.disabled"',
  '"local.llamacpp.disabled"',
  '"check-execution-evidence"',
]) {
  assertCondition(supervisorTests.includes(testText), `Supervisor tests must assert ${testText}`, failures);
}

for (const browserText of [
  "GET /supervisor/disabled-provider-proofs",
  "GET /supervisor/execution-state-boundary",
  "pnpm run check:execution-evidence",
]) {
  assertCondition(controlsSpec.includes(browserText), `Controls e2e must assert ${browserText}`, failures);
}

for (const story of [
  "docs/stories/3-8-queue-attempt-boundary-and-provider-proofs.md",
  "docs/stories/3-49-execution-evidence-boundary-drift-check.md",
]) {
  assertCondition(existsSync(join(rootDir, story)), `Missing execution evidence story ${story}`, failures);
  assertCondition(storyIndex.includes(story.split("/").pop()), `Story index must reference ${story}`, failures);
}

assertCondition(
  runtimeExportCheck.includes("docs/stories/3-49-execution-evidence-boundary-drift-check.md"),
  "Runtime evidence export drift check must require Story 3.49 git-backed evidence",
  failures,
);
assertCondition(
  serviceSource.includes("docs/stories/3-49-execution-evidence-boundary-drift-check.md"),
  "Runtime evidence export service must include Story 3.49 git-backed evidence",
  failures,
);
assertCondition(
  serviceSource.includes("pnpm run check:execution-evidence"),
  "Verification readiness report must surface pnpm run check:execution-evidence",
  failures,
);
assertCondition(
  runbookCheck.includes("pnpm run check:execution-evidence"),
  "Runbook drift check must require pnpm run check:execution-evidence",
  failures,
);
assertCondition(
  reconciliation.includes("Execution evidence boundary drift check"),
  "Implementation reconciliation must track the execution evidence boundary drift check",
  failures,
);

if (failures.length > 0) {
  console.error("Execution evidence boundary drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: execution evidence boundary drift checks passed.");
