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

function assertBlockIncludes(source, startText, endText, requiredTexts, messagePrefix, failures) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start + startText.length);
  if (start === -1 || end === -1 || end <= start) {
    failures.push(`${messagePrefix} block must be present`);
    return;
  }
  const block = source.slice(start, end);
  for (const text of requiredTexts) {
    assertIncludes(block, text, `${messagePrefix} block must include: ${text}`, failures);
  }
}

const authorityBoundary = readWorkspaceFile("docs/workflows/execution-authority-boundary.md");
const approvalPacket = extractSection(
  authorityBoundary,
  "## Worker Process Launch Contract",
  "## Cleanup Automation Contract",
);
const settingsSource = readWorkspaceFile("services/supervisor/src/supervisor/config/settings.py");
const serviceSource = readWorkspaceFile("services/supervisor/src/supervisor/application/service.py");
const supervisorTests = readWorkspaceFile("services/supervisor/tests/integration/test_routing_preview.py");
const storyIndex = readWorkspaceFile("docs/workflows/implementation-evidence-boundary.md");
const story = readWorkspaceFile("docs/workflows/implementation-evidence-boundary.md");

const failures = [];

for (const packetText of [
  "Status: approval-required, non-executing packet",
  "Authority family: `worker-process-launch`",
  "Operation candidate: one bounded real CLI worker launch",
  "It does not launch Codex, launch Claude, execute shell commands, mutate source, call providers, access credentials, sync issues, deliver PRs, or perform cleanup.",
  "One tool identity: Codex CLI or Claude Code CLI, not both.",
  "Argument-array execution only; no shell expansion.",
  "Tool identity: `codex-cli` or `claude-code-cli`",
  "Approved cwd/worktree path",
  "Allowed file scope",
  "Source mutation permission",
  "Diff guard policy",
  "Prompt/source retention policy",
  "Environment allowlist",
  "Blocked credential/session paths",
  "Timeout/cancellation policy",
  "Verification command",
  "Review requirement",
  "rollback path <rollback>",
  "Expiry or review point",
  "Do not launch a real CLI worker from this packet alone.",
  "Do not use shell string execution.",
  "Do not run both Codex and Claude from one approval.",
  "Do not mutate source unless source mutation is explicitly approved for the named tool, work item, and file scope.",
  "Do not read GitHub tokens, browser sessions, SSH keys, cloud credentials, or provider credentials.",
  "Do not deliver PRs, merge, delete branches, delete worktrees, clean filesystem residue, sync issues, or bypass failed checks from worker-launch authority.",
]) {
  assertIncludes(approvalPacket, packetText, `Real CLI worker launch approval packet must include: ${packetText}`, failures);
}

for (const settingsText of [
  "allow_worker_source_mutation: bool = Field(default=False, alias=\"SUPERVISOR_ALLOW_WORKER_SOURCE_MUTATION\")",
  "allow_worker_network: bool = Field(default=False, alias=\"SUPERVISOR_ALLOW_WORKER_NETWORK\")",
  "allow_worker_credentials: bool = Field(default=False, alias=\"SUPERVISOR_ALLOW_WORKER_CREDENTIALS\")",
]) {
  assertIncludes(settingsSource, settingsText, `Settings must preserve worker authority disabled defaults: ${settingsText}`, failures);
}

for (const serviceText of [
  "No-launch Codex readiness report.",
  "This report does not approve Codex CLI process launch.",
  "No-launch Claude review readiness report.",
  "This report does not approve Claude CLI process launch.",
  "reviewTaskExecutionApproved=False",
  "scarceUseApproved=False",
  "check_id=\"worker-source-mutation\"",
  "enabled=self.settings.allow_worker_source_mutation",
  "source_mutation_allowed=self.settings.allow_worker_source_mutation",
  "enabled=self.settings.allow_worker_network",
  "network_allowed=self.settings.allow_worker_network",
  "enabled=self.settings.allow_worker_credentials",
  "credential_access_allowed=self.settings.allow_worker_credentials",
]) {
  assertIncludes(serviceSource, serviceText, `Supervisor service must preserve worker launch boundary: ${serviceText}`, failures);
}

assertBlockIncludes(
  serviceSource,
  "No-launch Codex readiness report.",
  "No-launch Claude review readiness report.",
  ["processLaunchApproved=False", "workerTaskExecutionApproved=False", "sourceMutationApproved=False"],
  "Codex no-launch readiness report",
  failures,
);

for (const testText of [
  "does not approve Codex CLI process launch",
  "does not approve Claude CLI process launch",
  "Codex or Claude launch",
  "sourceMutationAllowed",
  "assert report[\"sourceMutationAllowed\"] is False",
  "assert boundary[\"sourceMutationAllowed\"] is False",
  "assert export[\"safety\"][\"sourceMutationAllowed\"] is False",
]) {
  assertIncludes(supervisorTests, testText, `Supervisor tests must preserve worker launch evidence: ${testText}`, failures);
}

for (const storyText of [
  "This story intentionally stops before real Codex CLI or Claude Code CLI launch.",
  "Do not launch Codex.",
  "Do not launch Claude.",
  "Do not run shell commands as a worker.",
  "Do not mutate source.",
  "Do not deliver PRs or cleanup from worker authority.",
]) {
  assertIncludes(story, storyText, `Story 17.1 must preserve worker launch packet evidence: ${storyText}`, failures);
}

for (const indexText of [
  "Real CLI worker launch: `docs/workflows/execution-authority-boundary.md#worker-process-launch-contract`",
  "Epic 17 starts after the subscription-agent process-launch approval packet.",
  "Stories in this epic do not approve Codex launch, Claude launch, shell execution, source mutation, credential/session access, PR delivery, cleanup, issue sync, or failed-check bypass.",
]) {
  assertIncludes(storyIndex, indexText, `Story index must preserve worker launch authority status: ${indexText}`, failures);
}

if (failures.length > 0) {
  console.error("Real CLI worker launch approval packet drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: real CLI worker launch approval packet drift checks passed.");
