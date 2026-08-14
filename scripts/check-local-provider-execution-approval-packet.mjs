import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

function readWorkspaceFile(path) {
  return readFileSync(join(rootDir, path), "utf8");
}

function assertIncludes(source, text, message, failures) {
  if (!source.includes(text)) {
    failures.push(message);
  }
}

function assertCondition(condition, message, failures) {
  if (!condition) {
    failures.push(message);
  }
}

function assertAllIncludes(source, texts, scope, failures) {
  for (const text of texts) {
    assertIncludes(source, text, `${scope}: ${text}`, failures);
  }
}

function assertOrderedIncludes(source, texts, scope, failures) {
  let cursor = 0;
  for (const text of texts) {
    const index = source.indexOf(text, cursor);
    if (index === -1) {
      failures.push(`${scope}: ${text}`);
      continue;
    }
    cursor = index + text.length;
  }
}

function extractSection(source, startText, endText) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start + startText.length);
  if (start === -1 || end === -1 || end <= start) {
    return "";
  }
  return source.slice(start, end);
}

const authorityBoundary = readWorkspaceFile("docs/workflows/execution-authority-boundary.md");
const providerContract = extractSection(
  authorityBoundary,
  "## Local Provider Execution Contract",
  "## Premium Execution Contract",
);
const settingsSource = readWorkspaceFile("services/supervisor/src/supervisor/config/settings.py");
const serviceSource = readWorkspaceFile("services/supervisor/src/supervisor/application/service.py");
const apiSchemaSource = readWorkspaceFile("services/supervisor/src/supervisor/api/schemas.py");
const contractSchemaSource = readWorkspaceFile("packages/contracts/src/api.ts");
const supervisorTests = readWorkspaceFile("services/supervisor/tests/integration/test_routing_preview.py");
const storyIndex = readWorkspaceFile("docs/workflows/implementation-evidence-boundary.md");
const runbook = readWorkspaceFile("docs/workflows/current-session-runbook.md");
const acceptedApproval = readWorkspaceFile("docs/architecture/kendall-vnxt-execution-authority-approval-packet-2026-06-09.md");
const acceptedCheckpoint = readWorkspaceFile("docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md");
const routedSourceObservation = readWorkspaceFile("docs/architecture/kendall-vnxt-llm-orchestration-lane-model-2026-06-10.md");
const routePolicySource = readWorkspaceFile("scripts/lib/review-gated-low-risk-route-policy.mjs");
const privateEvidencePolicySource = readWorkspaceFile("scripts/lib/private-evidence-packet-policy.mjs");
const routePolicyTests = readWorkspaceFile("tests/review-gated-low-risk-route-policy.test.mjs");
const privateEvidenceTests = readWorkspaceFile("tests/private-evidence-packet-policy.test.mjs");

const failures = [];
let authorityPolicy = null;
try {
  authorityPolicy = JSON.parse(readWorkspaceFile("docs/workflows/local-provider-authority-policy-v1.json"));
} catch {
  failures.push("Versioned local-provider authority policy must be valid JSON");
}
const agreedEndpoint = authorityPolicy?.route?.endpoint;
const agreedModel = authorityPolicy?.route?.model;
const localProviderApprovalSchema = extractSection(
  apiSchemaSource,
  "class LocalProviderApprovalInstance(BaseModel):",
  "class WorkItemLocalEvidenceExplanationRequest(BaseModel):",
);
const localProviderApprovalContract = extractSection(
  contractSchemaSource,
  "export interface LocalProviderApprovalInstance {",
  "export interface LocalEvidenceExplanationPayload {",
);
const localProviderValidation = extractSection(
  serviceSource,
  "def _validate_local_provider_approval(",
  "def _local_provider_rejected_attempt(",
);
const localProviderRejectedAttempt = extractSection(
  serviceSource,
  "def _local_provider_rejected_attempt(",
  "async def record_routing_override(",
);

assertCondition(authorityPolicy?.schemaVersion === 1, "Authority policy must use schemaVersion 1", failures);
assertCondition(authorityPolicy?.authorityFamily === "local-provider-execution", "Authority policy must bind the local-provider-execution family", failures);
assertCondition(authorityPolicy?.status === "hold_conflicting_source_vm", "Authority policy must hold the conflicting source VMs", failures);
assertCondition(authorityPolicy?.approvedSourceVm === null, "Authority policy must not select an approved source VM", failures);
assertCondition(agreedEndpoint === "http://192.168.1.128:11434/v1/chat/completions", "Authority policy must preserve the agreed endpoint metadata", failures);
assertCondition(agreedModel === "qwen3:14b", "Authority policy must preserve the agreed model metadata", failures);
assertCondition(authorityPolicy?.route?.connectTimeoutSeconds === 2, "Authority policy must preserve the 2 second connect timeout", failures);
assertCondition(authorityPolicy?.route?.totalTimeoutSeconds === 120, "Authority policy must preserve the 120 second total timeout", failures);
assertCondition(authorityPolicy?.route?.retentionMode === "metadata-only", "Authority policy must preserve metadata-only retention", failures);
assertCondition(
  authorityPolicy?.defaults?.allowLocalProviderCalls === false
    && authorityPolicy?.defaults?.allowOllamaProviderCalls === false
    && authorityPolicy?.defaults?.allowAutomaticOllamaLocalEvidence === false,
  "Authority policy must keep all local-provider and automatic-consent defaults false",
  failures,
);
const candidateSourceVmRows = Array.isArray(authorityPolicy?.candidateSourceVms) ? authorityPolicy.candidateSourceVms : [];
assertCondition(candidateSourceVmRows.length === 2, "Authority policy must contain exactly two candidate rows before source-VM de-duplication", failures);
const candidateSourceVms = new Map(candidateSourceVmRows.map((candidate) => [candidate?.sourceVm, candidate]));
assertCondition(candidateSourceVms.size === 2, "Authority policy must contain exactly the two conflicting source-VM candidates", failures);
assertCondition(
  candidateSourceVms.get("192.168.1.118")?.claim === "accepted_operator_approval"
    && candidateSourceVms.get("192.168.1.118")?.provenanceRef === "docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md",
  "Authority policy must preserve accepted 192.168.1.118 provenance",
  failures,
);
assertCondition(
  candidateSourceVms.get("192.168.1.8")?.claim === "current_routed_source_observation"
    && candidateSourceVms.get("192.168.1.8")?.provenanceRef === "docs/architecture/kendall-vnxt-llm-orchestration-lane-model-2026-06-10.md",
  "Authority policy must preserve observed 192.168.1.8 provenance without promoting it to approval",
  failures,
);
assertAllIncludes(acceptedApproval, ["Approved caller/source: Kendall_vNxt VM at 192.168.1.118 only."], "Accepted approval provenance", failures);
assertAllIncludes(acceptedCheckpoint, ["calls only from the Kendall_vNxt VM at `192.168.1.118`"], "Accepted checkpoint provenance", failures);
assertAllIncludes(routedSourceObservation, ["`192.168.1.8` (current routed source observed 2026-07-18)"], "Current routed-source observation provenance", failures);

assertAllIncludes(providerContract, [
  "Status: authority-conflict hold, non-executing",
  "Authority family: `local-provider-execution`",
  "Operation candidate: one bounded metadata-only Ollama provider operation",
  "`local-provider-authority-policy-v1.json`",
  `Agreed endpoint metadata: \`${agreedEndpoint}\``,
  `Agreed model metadata: \`${agreedModel}\``,
  "Retention: metadata-only event evidence and artifact references only.",
  "Do not call this provider from this packet alone.",
  "neither is approved while the policy status is `hold_conflicting_source_vm`",
  "Exact endpoint and model metadata are insufficient without one explicitly approved source VM.",
  "Keep broad local-provider, Ollama-specific, and automatic local-evidence gates disabled by default.",
  "Do not discover endpoints or models.",
  "Do not retain raw prompt, completion, reasoning, or provider payload text in workflow events.",
  "Do not read credentials or external sessions.",
  "Do not mutate source, launch processes, merge PRs, clean worktrees, or bypass failed checks.",
], "Provider contract must preserve the unresolved local-provider authority boundary", failures);

assertAllIncludes(settingsSource, [
  "allow_local_provider_calls: bool = Field(default=False, alias=\"SUPERVISOR_ALLOW_LOCAL_PROVIDER_CALLS\")",
  "allow_ollama_provider_calls: bool = Field(default=False, alias=\"SUPERVISOR_ALLOW_OLLAMA_PROVIDER_CALLS\")",
  "allow_automatic_ollama_local_evidence: bool = Field(default=False, alias=\"SUPERVISOR_ALLOW_AUTOMATIC_OLLAMA_LOCAL_EVIDENCE\")",
  `ollama_endpoint_url: str | None = Field(\n        default=\"${agreedEndpoint}\"`,
  `ollama_model_id: str | None = Field(default=\"${agreedModel}\"`,
  "ollama_approved_source_vm: str = Field(default=\"\"",
  `default="${agreedEndpoint}"`,
  "alias=\"SUPERVISOR_OLLAMA_APPROVED_ENDPOINT_URL\"",
  `ollama_approved_model_id: str = Field(default="${agreedModel}", alias="SUPERVISOR_OLLAMA_APPROVED_MODEL_ID")`,
], "Settings must preserve fail-closed local-provider defaults", failures);

assertAllIncludes(serviceSource, [
  "self.settings.allow_local_provider_calls",
  "self.settings.allow_ollama_provider_calls",
  "self.settings.allow_automatic_ollama_local_evidence",
  "def _load_local_provider_authority_policy()",
  "LOCAL_PROVIDER_AUTHORITY_POLICY_PATH",
  "authority_status = authority_policy[\"status\"]",
  "authority_source_vm = authority_policy[\"approved_source_vm\"]",
  "ollama_authority_policy_unresolved",
  "authority_resolved",
  "endpoint_approved = endpoint_url == approved_endpoint_url",
  "model_id_approved = model_id == approved_model_id",
  "self.settings.ollama_connect_timeout_seconds != authority_connect_timeout_seconds",
  "self.settings.ollama_total_timeout_seconds != authority_total_timeout_seconds",
  "\"provider_calls_allowed\": enabled",
  "\"model_calls_allowed\": enabled",
], "Supervisor service must preserve the unresolved local-provider runtime gate", failures);

assertAllIncludes(routePolicySource, [
  "local-provider-authority-policy-v1.json",
  "ollama_authority_policy_unresolved",
  "localProviderAuthorityResolved",
  "approvedSourceVm",
], "JavaScript route policy must consume and fail closed on the authority record", failures);
assertAllIncludes(privateEvidencePolicySource, [
  "localProviderAuthorityResolved",
  "ollama_authority_policy_unresolved",
], "Private-evidence Ollama policy must inherit the unresolved authority hold", failures);
assertAllIncludes(runbook, [
  "Optional local Ollama review lane (authority hold)",
  "All local-provider and automatic-consent gates default false.",
  "SUPERVISOR_ALLOW_AUTOMATIC_OLLAMA_LOCAL_EVIDENCE=false",
  "ollama_authority_policy_unresolved",
], "Runbook must preserve the unresolved authority stop line and rollback", failures);

assertOrderedIncludes(localProviderApprovalSchema, [
  "class LocalProviderApprovalInstance(BaseModel):",
  "approvalId: str | None = None",
  "status: str | None = None",
  "authorityFamily: str | None = None",
  "operation: str | None = None",
  "endpointUrl: str | None = None",
  "sourceVm: str | None = None",
  "modelId: str | None = None",
  "promptSourceId: str | None = None",
  "promptTemplateId: str | None = None",
  "redactionPolicy: str | None = None",
  "timeoutCancellationPolicy: str | None = None",
  "retainedEvidencePolicy: str | None = None",
  "retainedEvidence: list[str] = Field(default_factory=list)",
  "expiresAt: datetime | None = None",
  "reviewPoint: str | None = None",
  "rollbackPath: list[str] = Field(default_factory=list)",
  "stopLines: list[str] = Field(default_factory=list)",
], "API schema must preserve ordered local-provider approval binding fields", failures);

assertAllIncludes(apiSchemaSource, [
  "localProviderApproval: LocalProviderApprovalInstance | None = None",
], "API request schema must preserve local-provider approval binding", failures);

assertOrderedIncludes(localProviderApprovalContract, [
  "export interface LocalProviderApprovalInstance {",
  "approvalId?: string | null;",
  "status?: string | null;",
  "authorityFamily?: string | null;",
  "operation?: string | null;",
  "endpointUrl?: string | null;",
  "sourceVm?: string | null;",
  "modelId?: string | null;",
  "promptSourceId?: string | null;",
  "promptTemplateId?: string | null;",
  "redactionPolicy?: string | null;",
  "timeoutCancellationPolicy?: string | null;",
  "retainedEvidencePolicy?: string | null;",
  "retainedEvidence?: string[];",
  "expiresAt?: string | null;",
  "reviewPoint?: string | null;",
  "rollbackPath?: string[];",
  "stopLines?: string[];",
], "TypeScript contract must mirror ordered local-provider approval binding fields", failures);

assertAllIncludes(contractSchemaSource, [
  "localProviderApproval?: LocalProviderApprovalInstance | null;",
], "TypeScript request payload must preserve local-provider approval binding", failures);

assertOrderedIncludes(localProviderValidation, [
  "approval is None",
  "approval-instance-missing",
  "expected_endpoint = self.settings.ollama_approved_endpoint_url.strip()",
  "expected_model = self.settings.ollama_approved_model_id.strip()",
  "(\"status\", approval.status, \"accepted\", \"approval-status-not-accepted\")",
  "(\"authorityFamily\", approval.authorityFamily, \"local-provider-execution\", \"approval-authority-family-mismatch\")",
  "(\"operation\", approval.operation, \"one bounded Ollama provider operation\", \"approval-operation-mismatch\")",
  "(\"endpointUrl\", approval.endpointUrl, expected_endpoint, \"approval-endpoint-mismatch\")",
  "(\"sourceVm\", approval.sourceVm, self.settings.ollama_approved_source_vm.strip(), \"approval-source-vm-mismatch\")",
  "(\"modelId\", approval.modelId, expected_model, \"approval-model-mismatch\")",
  "(\"retainedEvidencePolicy\", approval.retainedEvidencePolicy, \"metadata-only\", \"approval-retention-policy-mismatch\")",
  "connect_timeout_2s_total_timeout_120s",
  "metadata_only_no_raw_prompt_completion_reasoning_or_provider_payload",
  "approval-retained-evidence-missing",
  "approval-rollback-mismatch",
  "approval-stop-lines-endpoint-missing",
  "approval-stop-lines-model-missing",
  "approval-stop-lines-retention-missing",
  "approval-expiry-or-review-point-missing",
  "approval-expired",
], "Supervisor service must preserve ordered approval-instance validation", failures);

assertAllIncludes(localProviderRejectedAttempt, [
  "Provider prompt not built; approval binding rejected before adapter execution.",
  "rawPayloadRetained=False",
], "Supervisor service must preserve metadata-only rejection before adapter execution", failures);

assertAllIncludes(supervisorTests, [
  "test_ollama_settings_default_provider_and_automatic_gates_false",
  "test_ollama_provider_gate_holds_both_source_vm_candidates_despite_exact_endpoint_and_model",
  "test_ollama_provider_gate_reports_authority_hold_before_endpoint_mismatch",
  "test_ollama_local_evidence_explanation_holds_unresolved_authority_before_adapter_call",
  "test_ollama_local_evidence_explanation_creates_no_automatic_approval_for_unresolved_source_vm",
  "test_ollama_local_evidence_explanation_rejects_operator_approval_while_authority_is_unresolved",
  "test_ollama_provider_request_uses_connect_timeout_without_global_socket_mutation",
  "SUPERVISOR_ALLOW_LOCAL_PROVIDER_CALLS",
  "SUPERVISOR_ALLOW_OLLAMA_PROVIDER_CALLS",
  "SUPERVISOR_ALLOW_AUTOMATIC_OLLAMA_LOCAL_EVIDENCE",
  "192.168.1.118",
  "192.168.1.8",
  "ollama_authority_policy_unresolved",
  "Ollama adapter must not run while source-VM authority is unresolved.",
  "Automatic approval must not be created while source-VM authority is unresolved.",
  agreedEndpoint,
  agreedModel,
], "Supervisor tests must prove unresolved authority is non-executing", failures);

assertAllIncludes(routePolicyTests, [
  "unresolved authority holds both Ollama source-VM candidates despite exact endpoint and model",
  "192.168.1.118",
  "192.168.1.8",
  "ollama_authority_policy_unresolved",
], "JavaScript route-policy tests must reject both source-VM candidates", failures);
assertAllIncludes(privateEvidenceTests, [
  "holds exact Ollama backup packets for both unresolved source-VM candidates",
  "192.168.1.118",
  "192.168.1.8",
  "ollama_authority_policy_unresolved",
], "Private-evidence tests must reject both source-VM candidates", failures);

assertAllIncludes(storyIndex, [
  "The following implementation evidence labels are source-owned anchors for runtime reports and drift checks. They are labels only, not required Git-tracked story files.",
  "Local provider execution: `docs/workflows/execution-authority-boundary.md#local-provider-execution-contract`",
  "source-VM authority is held by `local-provider-authority-policy-v1.json`",
  "The agreed endpoint/model metadata are insufficient to enable Ollama while the source-VM authority conflict remains unresolved.",
  "14-2-pin-local-provider-approval-packet-to-drift-checks.md",
], "Implementation evidence boundary must preserve local-provider authority status and label semantics", failures);

if (failures.length > 0) {
  console.error("Local provider execution approval packet drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: local provider execution approval packet drift checks passed.");
