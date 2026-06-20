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
const supervisorTests = readWorkspaceFile("services/supervisor/tests/integration/test_routing_preview.py");
const storyIndex = readWorkspaceFile("docs/workflows/implementation-evidence-boundary.md");

const approvedEndpoint = "http://192.168.1.128:11434/v1/chat/completions";
const approvedModel = "qwen3:14b";
const failures = [];

for (const packetText of [
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
]) {
  assertIncludes(approvalPacket, packetText, `Approval packet must include: ${packetText}`, failures);
}

for (const settingsText of [
  "allow_local_provider_calls: bool = Field(default=False, alias=\"SUPERVISOR_ALLOW_LOCAL_PROVIDER_CALLS\")",
  "allow_ollama_provider_calls: bool = Field(default=False, alias=\"SUPERVISOR_ALLOW_OLLAMA_PROVIDER_CALLS\")",
  `default="${approvedEndpoint}"`,
  "alias=\"SUPERVISOR_OLLAMA_APPROVED_ENDPOINT_URL\"",
  `ollama_approved_model_id: str = Field(default="${approvedModel}", alias="SUPERVISOR_OLLAMA_APPROVED_MODEL_ID")`,
]) {
  assertIncludes(settingsSource, settingsText, `Settings must preserve local-provider approval binding: ${settingsText}`, failures);
}

for (const serviceText of [
  "self.settings.allow_local_provider_calls",
  "self.settings.allow_ollama_provider_calls",
  "endpoint_approved = endpoint_url == approved_endpoint_url",
  "model_id_approved = model_id == approved_model_id",
  "\"provider_calls_allowed\": enabled",
  "\"model_calls_allowed\": enabled",
  `Ollama approved endpoint: {self.settings.ollama_approved_endpoint_url} with model `,
]) {
  assertIncludes(serviceSource, serviceText, `Supervisor service must preserve local-provider runtime gate: ${serviceText}`, failures);
}

for (const testText of [
  "test_ollama_provider_gate_enables_only_approved_host_endpoint_and_model",
  "test_ollama_provider_gate_rejects_unapproved_endpoint",
  "test_ollama_local_evidence_explanation_records_metadata_without_raw_provider_text",
  "test_ollama_provider_request_uses_connect_timeout_without_global_socket_mutation",
  "SUPERVISOR_ALLOW_LOCAL_PROVIDER_CALLS",
  "SUPERVISOR_ALLOW_OLLAMA_PROVIDER_CALLS",
  approvedEndpoint,
  approvedModel,
]) {
  assertIncludes(supervisorTests, testText, `Supervisor tests must preserve local-provider approval evidence: ${testText}`, failures);
}

for (const indexText of [
  "Local provider execution: `docs/workflows/execution-authority-boundary.md#local-provider-execution-contract`",
  "No currently blocked Ollama local-provider story remains for the approved VM-to-host endpoint/model.",
  "Any endpoint, model, provider, or retention expansion still requires explicit successor approval.",
]) {
  assertIncludes(storyIndex, indexText, `Story index must preserve local-provider authority status: ${indexText}`, failures);
}

if (failures.length > 0) {
  console.error("Local provider execution approval packet drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: local provider execution approval packet drift checks passed.");
