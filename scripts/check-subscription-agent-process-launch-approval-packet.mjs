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

function assertSettingDefaultFalse(source, fieldName, alias, failures) {
  const settingPattern = new RegExp(`${fieldName}: bool = Field\\(\\s*default=False,\\s*alias="${alias}",?\\s*\\)`);
  if (!settingPattern.test(source)) {
    failures.push(`Settings must keep ${fieldName} default disabled with alias ${alias}`);
  }
}

const approvalPacket = readWorkspaceFile("docs/goals/subscription-agent-process-launch-approval-packet-2026-06-13.md");
const settingsSource = readWorkspaceFile("services/supervisor/src/supervisor/config/settings.py");
const serviceSource = readWorkspaceFile("services/supervisor/src/supervisor/application/service.py");
const supervisorTests = readWorkspaceFile("services/supervisor/tests/integration/test_routing_preview.py");
const storyIndex = readWorkspaceFile("docs/stories/index.md");
const story = readWorkspaceFile("docs/stories/16-1-refresh-subscription-agent-process-launch-approval-packet.md");

const failures = [];

for (const packetText of [
  "Status: approval-required, non-executing packet",
  "Authority family: `subscription-agent-launch`",
  "Operation candidate: one bounded supervised subscription-agent process launch",
  "It does not launch a process, execute a shell command, inherit credentials or sessions, call providers, mutate source, sync issues, deliver PRs, or perform cleanup.",
  "Argument-array execution only; no shell expansion.",
  "Environment allowlist only.",
  "Credential/session denial paths enforced.",
  "Do not launch a process from this packet alone.",
  "Do not use shell string execution.",
  "Do not inherit arbitrary environment variables.",
  "Do not read credentials, sessions, browser profiles, Git credentials, SSH keys, cloud credentials, or provider credentials.",
  "Do not treat the Story 8.5 artifact-only fixture approval as production process-launch approval.",
  "Raw stdout/stderr in workflow events.",
  "Generated patch content in workflow events.",
]) {
  assertIncludes(approvalPacket, packetText, `Subscription launch approval packet must include: ${packetText}`, failures);
}

for (const settingsText of [
  "allow_subscription_agent_launch: bool = Field(default=False, alias=\"SUPERVISOR_ALLOW_SUBSCRIPTION_AGENT_LAUNCH\")",
]) {
  assertIncludes(settingsSource, settingsText, `Settings must preserve subscription launch disabled defaults: ${settingsText}`, failures);
}

for (const [fieldName, alias] of [
  ["allow_codex_subscription_agent_launch", "SUPERVISOR_ALLOW_CODEX_SUBSCRIPTION_AGENT_LAUNCH"],
  ["allow_claude_subscription_agent_launch", "SUPERVISOR_ALLOW_CLAUDE_SUBSCRIPTION_AGENT_LAUNCH"],
  ["allow_gemini_subscription_agent_launch", "SUPERVISOR_ALLOW_GEMINI_SUBSCRIPTION_AGENT_LAUNCH"],
]) {
  assertSettingDefaultFalse(settingsSource, fieldName, alias, failures);
}

for (const serviceText of [
  "check_id=\"subscription-agent-launch\"",
  "label=\"Subscription agent launch\"",
  "enabled=self.settings.allow_subscription_agent_launch",
  "disabled_reason=\"subscription_agent_process_launch_not_enabled\"",
  "Subscription launch stubs can create instructions only.",
  "No Codex, Claude, Gemini, Antigravity, or subscription CLI process launch is enabled.",
  "Target-specific subscription launch gates are reported separately from handoff packages.",
  "process_launch_allowed=False",
  "check_id=\"subscription-launch-targets\"",
  "A target remains denied unless the broad launch gate, target-specific gate, policy id, and command template id all match.",
  "processLaunchAllowed\": False",
  "executionAllowed\": False",
  "credentialAccessAllowed\": False",
]) {
  assertIncludes(serviceSource, serviceText, `Supervisor service must preserve subscription launch boundary: ${serviceText}`, failures);
}

for (const testText of [
  "\"subscription-agent-launch\"",
  "subscription_agent_process_launch_not_enabled",
  "[\"subscription.agent.disabled\"]",
  "test_subscription_agent_launch_stub_generation_is_non_mutating",
  "test_subscription_agent_launch_stub_can_record_workflow_event",
  "test_subscription_agent_launch_request_rejects_missing_exact_approval_before_process_start",
  "test_subscription_agent_launch_request_accepts_exact_artifact_only_fixture_path",
  "test_subscription_agent_launch_request_read_only_accepted_fixture_is_evaluation_ready",
  "processLaunchAllowed",
  "executionAllowed",
  "event[\"payload\"][\"processLaunchAllowed\"] is False",
]) {
  assertIncludes(supervisorTests, testText, `Supervisor tests must preserve subscription launch evidence: ${testText}`, failures);
}

for (const storyText of [
  "This story intentionally stops before real subscription-agent process launch.",
  "explicitly keeps production/direct process launch blocked until Bob accepts the exact future launch approval.",
  "Preserve Story 8.5 as artifact-only fixture evidence, not production process-launch approval.",
]) {
  assertIncludes(story, storyText, `Story 16.1 must preserve process-launch packet evidence: ${storyText}`, failures);
}

for (const indexText of [
  "Subscription-agent process launch: `docs/goals/subscription-agent-process-launch-approval-packet-2026-06-13.md`",
  "Epic 16 starts after the premium-execution approval packet.",
  "Stories in this epic do not approve process launch, shell expansion, credential/session inheritance, provider calls, source mutation, generated patch application, issue sync, PR delivery, cleanup, or failed-check bypass.",
]) {
  assertIncludes(storyIndex, indexText, `Story index must preserve subscription launch authority status: ${indexText}`, failures);
}

if (failures.length > 0) {
  console.error("Subscription-agent process launch approval packet drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: subscription-agent process launch approval packet drift checks passed.");
