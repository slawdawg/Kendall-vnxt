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
  "## Premium Execution Contract",
  "## Subscription-Agent Launch Contract",
);
const settingsSource = readWorkspaceFile("services/supervisor/src/supervisor/config/settings.py");
const serviceSource = readWorkspaceFile("services/supervisor/src/supervisor/application/service.py");
const supervisorTests = readWorkspaceFile("services/supervisor/tests/integration/test_routing_preview.py");
const storyIndex = readWorkspaceFile("docs/workflows/implementation-evidence-boundary.md");
const story = readWorkspaceFile("docs/workflows/implementation-evidence-boundary.md");

const failures = [];

for (const packetText of [
  "Status: approval-required, non-executing packet",
  "Authority family: `premium-execution`",
  "Operation candidate: one bounded paid-provider operation",
  "without enabling premium execution, reading credentials, calling providers, or incurring cost",
  "Provider/account boundary",
  "Explicit cost ceiling.",
  "Explicit data classification.",
  "Metadata-only retained evidence unless a separate retention approval grants more.",
  "Audit evidence",
  "Abort policy",
  "Rollback path",
  "Expiry or review point",
  "Do not execute without a cost ceiling.",
  "Stop before exceeding the approved ceiling.",
  "Do not make paid provider calls from this packet alone.",
  "Do not read credentials or external sessions.",
  "Do not retain raw prompt/completion/provider payload text.",
  "Do not treat a premium approval request artifact as execution approval.",
]) {
  assertIncludes(approvalPacket, packetText, `Premium approval packet must include: ${packetText}`, failures);
}

for (const settingsText of [
  "allow_premium_execution: bool = Field(default=False, alias=\"SUPERVISOR_ALLOW_PREMIUM_EXECUTION\")",
]) {
  assertIncludes(settingsSource, settingsText, `Settings must preserve premium disabled default: ${settingsText}`, failures);
}

for (const serviceText of [
  "check_id=\"premium-execution\"",
  "label=\"Premium execution\"",
  "enabled=self.settings.allow_premium_execution",
  "disabled_reason=\"premium_execution_not_enabled\"",
  "Premium approval artifacts remain review packages only.",
  "No premium model invocation is enabled by approval artifacts.",
  "premium_execution_allowed=self.settings.allow_premium_execution",
  "provider_calls_allowed=self.settings.allow_premium_execution",
  "model_calls_allowed=self.settings.allow_premium_execution",
  "A human approval decision is recorded before any premium execution is attempted.",
  "executionAllowed is false; this artifact cannot launch a premium provider.",
]) {
  assertIncludes(serviceSource, serviceText, `Supervisor service must preserve premium execution boundary: ${serviceText}`, failures);
}

for (const testText of [
  "\"premium-execution\"",
  "premium_execution_not_enabled",
  "[\"premium.approval\"]",
  "test_premium_approval_request_generation_is_non_mutating",
  "test_premium_approval_request_can_record_workflow_event",
  "executionAllowed",
  "executionAllowed is false",
  "event[\"payload\"][\"executionAllowed\"] is False",
]) {
  assertIncludes(supervisorTests, testText, `Supervisor tests must preserve premium evidence: ${testText}`, failures);
}

for (const storyText of [
  "This story intentionally stops before premium execution.",
  "Preserved Story 1.18 premium approval artifacts as request-only evidence.",
  "Defined cost ceiling, data classification, audit evidence, abort, rollback, and stop-line requirements before any paid operation.",
]) {
  assertIncludes(story, storyText, `Story 15.1 must preserve premium packet evidence: ${storyText}`, failures);
}

for (const indexText of [
  "Premium execution: `docs/workflows/execution-authority-boundary.md#premium-execution-contract`",
  "Epic 15 starts after the local-provider approval packet.",
  "Stories in this epic do not approve paid provider calls, credential/session access, raw prompt/completion/provider payload retention, budget-incurring behavior, source mutation, launch, delivery, cleanup, or failed-check bypass.",
]) {
  assertIncludes(storyIndex, indexText, `Story index must preserve premium authority status: ${indexText}`, failures);
}

if (failures.length > 0) {
  console.error("Premium execution approval packet drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: premium execution approval packet drift checks passed.");
