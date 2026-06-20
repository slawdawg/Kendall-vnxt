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
const approvalPacket = extractSection(
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

const approvedEndpoint = "http://192.168.1.128:11434/v1/chat/completions";
const approvedModel = "qwen3:14b";
const failures = [];
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

assertAllIncludes(approvalPacket, [
  "Status: approval-required, non-executing packet",
  "Authority family: `local-provider-execution`",
  "Operation candidate: one bounded metadata-only Ollama provider operation",
  "It does not call Ollama, discover models, expand provider support, mutate source, or retain raw provider content.",
  `Endpoint: \`${approvedEndpoint}\``,
  `Model: \`${approvedModel}\``,
  "Retention: metadata-only event evidence and artifact references only.",
  "Do not call this provider from this packet alone.",
  "Do not discover endpoints or models.",
  "Do not retain raw prompt, completion, reasoning, or provider payload text in workflow events.",
  "Do not read credentials or external sessions.",
  "Do not mutate source, launch processes, merge PRs, clean worktrees, or bypass failed checks.",
], "Approval packet must preserve the local-provider execution contract", failures);

assertAllIncludes(settingsSource, [
  "allow_local_provider_calls: bool = Field(default=False, alias=\"SUPERVISOR_ALLOW_LOCAL_PROVIDER_CALLS\")",
  "allow_ollama_provider_calls: bool = Field(default=False, alias=\"SUPERVISOR_ALLOW_OLLAMA_PROVIDER_CALLS\")",
  `default="${approvedEndpoint}"`,
  "alias=\"SUPERVISOR_OLLAMA_APPROVED_ENDPOINT_URL\"",
  `ollama_approved_model_id: str = Field(default="${approvedModel}", alias="SUPERVISOR_OLLAMA_APPROVED_MODEL_ID")`,
], "Settings must preserve local-provider approval binding", failures);

assertAllIncludes(serviceSource, [
  "self.settings.allow_local_provider_calls",
  "self.settings.allow_ollama_provider_calls",
  "endpoint_approved = endpoint_url == approved_endpoint_url",
  "model_id_approved = model_id == approved_model_id",
  "\"provider_calls_allowed\": enabled",
  "\"model_calls_allowed\": enabled",
  `Ollama approved endpoint: {self.settings.ollama_approved_endpoint_url} with model `,
], "Supervisor service must preserve local-provider runtime gate", failures);

assertOrderedIncludes(localProviderApprovalSchema, [
  "class LocalProviderApprovalInstance(BaseModel):",
  "approvalId: str | None = None",
  "status: str | None = None",
  "authorityFamily: str | None = None",
  "operation: str | None = None",
  "endpointUrl: str | None = None",
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
  "test_ollama_provider_gate_enables_only_approved_host_endpoint_and_model",
  "test_ollama_provider_gate_rejects_unapproved_endpoint",
  "test_ollama_local_evidence_explanation_rejects_missing_approval_before_adapter_call",
  "test_ollama_local_evidence_explanation_records_metadata_without_raw_provider_text",
  "test_ollama_local_evidence_explanation_rejects_mismatched_or_expired_approval",
  "test_ollama_local_evidence_explanation_rejects_unsafe_placeholder_approval_text",
  "test_ollama_provider_request_uses_connect_timeout_without_global_socket_mutation",
  "SUPERVISOR_ALLOW_LOCAL_PROVIDER_CALLS",
  "SUPERVISOR_ALLOW_OLLAMA_PROVIDER_CALLS",
  "approval-instance-missing",
  "approval-endpoint-mismatch",
  "approval-expired",
  "approval-redaction-policy-mismatch",
  "approval-stop-lines-retention-missing",
  "Ollama adapter must not run without exact approval.",
  "Ollama adapter must not run for mismatched or expired approval.",
  "Ollama adapter must not run for unsafe placeholder approval text.",
  "rawPayloadRetained",
  approvedEndpoint,
  approvedModel,
], "Supervisor tests must preserve local-provider approval behavior evidence", failures);

assertAllIncludes(storyIndex, [
  "The following implementation evidence labels are source-owned anchors for runtime reports and drift checks. They are labels only, not required Git-tracked story files.",
  "Local provider execution: `docs/workflows/execution-authority-boundary.md#local-provider-execution-contract`",
  "No currently blocked Ollama local-provider story remains for the approved VM-to-host endpoint/model.",
  "Any endpoint, model, provider, or retention expansion still requires explicit successor approval.",
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
