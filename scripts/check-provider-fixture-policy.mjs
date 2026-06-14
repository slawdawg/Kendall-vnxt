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
const adapterSource = readWorkspaceFile("services/supervisor/src/supervisor/domain/disabled_provider_adapter.py");
const registrySource = readWorkspaceFile("services/supervisor/src/supervisor/domain/worker_registry.py");
const serviceSource = readWorkspaceFile("services/supervisor/src/supervisor/application/service.py");
const providerFixtureDoc = readWorkspaceFile("docs/architecture/kendall-vnxt-provider-disabled-fixtures-2026-06-08.md");
const supervisorTests = readWorkspaceFile("services/supervisor/tests/integration/test_routing_preview.py");
const runtimeExportCheck = readWorkspaceFile("scripts/check-runtime-evidence-export.mjs");
const runbookCheck = readWorkspaceFile("scripts/check-runbook-verification.mjs");
const storyIndex = readWorkspaceFile("docs/stories/index.md");
const reconciliation = readWorkspaceFile("docs/architecture/kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md");

const failures = [];

assertCondition(
  packageJson.scripts?.["check:provider-fixtures"]?.includes("node ./scripts/check-provider-fixture-policy.mjs"),
  "package.json must run node ./scripts/check-provider-fixture-policy.mjs from check:provider-fixtures",
  failures,
);
assertCondition(
  packageJson.scripts?.check?.includes("pnpm run check:provider-fixtures"),
  "pnpm run check must include pnpm run check:provider-fixtures",
  failures,
);

const providers = [
  {
    workerId: "local.ollama.disabled",
    label: "Ollama",
    disabledReason: "ollama_local_provider_not_enabled",
    endpointFamily: "ollama_openai_compatible_localhost",
    redactionPrefix: "ollama",
  },
  {
    workerId: "local.lmstudio.disabled",
    label: "LM Studio",
    disabledReason: "lmstudio_local_provider_not_enabled",
    endpointFamily: "lm_studio_openai_compatible_localhost",
    redactionPrefix: "lmstudio",
  },
  {
    workerId: "local.vllm.disabled",
    label: "vLLM",
    disabledReason: "vllm_local_provider_not_enabled",
    endpointFamily: "vllm_openai_compatible_localhost",
    redactionPrefix: "vllm",
  },
  {
    workerId: "local.llamacpp.disabled",
    label: "llama.cpp",
    disabledReason: "llamacpp_local_provider_not_enabled",
    endpointFamily: "llamacpp_openai_compatible_localhost",
    redactionPrefix: "llamacpp",
  },
];

for (const provider of providers) {
  for (const source of [adapterSource, registrySource, supervisorTests]) {
    assertCondition(source.includes(provider.workerId), `${provider.workerId} must be represented in adapter, registry, and tests`, failures);
  }
  assertCondition(registrySource.includes(provider.disabledReason), `${provider.workerId} registry entry must keep disabled reason`, failures);
  assertCondition(adapterSource.includes(provider.endpointFamily), `${provider.workerId} adapter fixture must keep endpoint family`, failures);
  assertCondition(providerFixtureDoc.includes(provider.endpointFamily), `${provider.workerId} architecture doc must describe endpoint family`, failures);
  assertCondition(providerFixtureDoc.includes(provider.label), `${provider.workerId} architecture doc must name provider label`, failures);
  assertCondition(
    adapterSource.includes(`${provider.redactionPrefix}_prompt_fixture_excludes_env_values`),
    `${provider.workerId} adapter fixture must keep prompt redaction check`,
    failures,
  );
  assertCondition(
    supervisorTests.includes(`"${provider.workerId}": "${provider.endpointFamily}"`),
    `${provider.workerId} supervisor tests must assert worker and endpoint family evidence`,
    failures,
  );
}

for (const ollamaText of [
  "SUPERVISOR_ALLOW_OLLAMA_PROVIDER_CALLS",
  "SUPERVISOR_OLLAMA_MODEL_ID",
  "ollama-provider-gate",
  "test_ollama_provider_gate_stays_disabled_when_broad_gate_is_disabled",
  "test_ollama_timeout_settings_require_positive_values",
  "configured_ollama_gate_missing_model",
  "configured_ollama_gate_missing_endpoint",
  "enabled_approved_host_endpoint",
  "ollama_provider_enabled_for_approved_host_endpoint",
  "http://192.168.1.128:11434/v1/chat/completions",
  "qwen3:14b",
]) {
  assertCondition(
    serviceSource.includes(ollamaText) || supervisorTests.includes(ollamaText),
    `Ollama gate evidence must include ${ollamaText}`,
    failures,
  );
}

for (const ollamaFixtureText of [
  "prompt_construction_sources",
  "rejected_prompt_sources",
  "retained_evidence_classes",
  "raw_prompt_retention_allowed",
  "raw_completion_retention_allowed",
  "attempt_state_mapping",
  "retry_requires_new_route_decision_and_fresh_approval",
]) {
  assertCondition(adapterSource.includes(ollamaFixtureText), `Ollama no-call fixture must include ${ollamaFixtureText}`, failures);
}

for (const policyText of [
  "deny_all_local_provider_endpoints_until_provider_specific_policy_approval",
  "http_calls_attempted: bool = False",
  "model_calls_attempted: bool = False",
  "network_access_attempted: bool = False",
  "credential_access_attempted: bool = False",
  "disabled_fixture_forbids_raw_prompt_or_completion_retention",
]) {
  assertCondition(adapterSource.includes(policyText), `Disabled provider adapter must include ${policyText}`, failures);
}

for (const docText of [
  "All call/access booleans must remain false while the provider is disabled.",
  "These fixtures do not enable provider calls.",
  "provider-specific PRD must still approve exact endpoint policy",
]) {
  assertCondition(providerFixtureDoc.includes(docText), `Provider fixture doc must include stop-line text: ${docText}`, failures);
}

for (const testText of [
  "test_worker_registry_lists_static_workers_without_mutating_events",
  "test_disabled_provider_proofs_are_provider_specific_and_non_calling",
  'proof["httpCallsAttempted"] is False',
  'proof["modelCallsAttempted"] is False',
  'proof["networkAccessAttempted"] is False',
  'proof["credentialAccessAttempted"] is False',
  '"check-provider-fixtures"',
]) {
  assertCondition(supervisorTests.includes(testText), `Supervisor tests must assert ${testText}`, failures);
}

for (const story of [
  "docs/stories/3-10-provider-fixtures-and-ollama-prd-draft.md",
  "docs/stories/3-50-provider-fixture-policy-drift-check.md",
  "docs/stories/4-1-ollama-provider-settings-and-registry-gates.md",
  "docs/stories/4-2-ollama-prompt-redaction-and-retention-contract.md",
  "docs/stories/4-3-ollama-timeout-cancellation-and-attempt-evidence.md",
]) {
  assertCondition(existsSync(join(rootDir, story)), `Missing provider fixture story evidence ${story}`, failures);
  assertCondition(storyIndex.includes(story.split("/").pop()), `Story index must reference ${story}`, failures);
}

assertCondition(
  runtimeExportCheck.includes("docs/stories/3-50-provider-fixture-policy-drift-check.md"),
  "Runtime evidence export drift check must require Story 3.50 git-backed evidence",
  failures,
);
assertCondition(
  serviceSource.includes("docs/stories/3-50-provider-fixture-policy-drift-check.md"),
  "Runtime evidence export service must include Story 3.50 git-backed evidence",
  failures,
);
assertCondition(
  serviceSource.includes("pnpm run check:provider-fixtures"),
  "Verification readiness report must surface pnpm run check:provider-fixtures",
  failures,
);
assertCondition(
  runbookCheck.includes("pnpm run check:provider-fixtures"),
  "Runbook drift check must require pnpm run check:provider-fixtures",
  failures,
);
assertCondition(
  reconciliation.includes("Provider fixture policy drift check"),
  "Implementation reconciliation must track the provider fixture policy drift check",
  failures,
);

if (failures.length > 0) {
  console.error("Provider fixture policy drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: provider fixture policy drift checks passed.");
