import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

function readWorkspaceFile(path) {
  return readFileSync(join(rootDir, path), "utf8");
}

function readRequiredWorkspaceFile(path, failures) {
  if (!existsSync(join(rootDir, path))) {
    failures.push(`Missing token economy artifact ${path}`);
    return "";
  }
  return readWorkspaceFile(path);
}

function assertCondition(condition, message, failures) {
  if (!condition) {
    failures.push(message);
  }
}

function sectionBetween(markdown, heading, nextHeading = "\n## ") {
  const start = markdown.indexOf(heading);
  if (start === -1) {
    return "";
  }
  const next = markdown.indexOf(nextHeading, start + heading.length);
  return markdown.slice(start, next === -1 ? undefined : next);
}

function sectionBetweenText(markdown, startText, endText) {
  const start = markdown.indexOf(startText);
  if (start === -1) {
    return "";
  }
  const next = markdown.indexOf(endText, start + startText.length);
  return markdown.slice(start, next === -1 ? undefined : next);
}

const failures = [];

const packageJsonSource = readRequiredWorkspaceFile("package.json", failures);
const packageJson = packageJsonSource ? JSON.parse(packageJsonSource) : {};
const agents = readRequiredWorkspaceFile("AGENTS.md", failures);
const contextIndex = readRequiredWorkspaceFile("docs/ai-context/index.md", failures);
const rcaWorkflow = readRequiredWorkspaceFile("docs/workflows/tool-churn-rca.md", failures);
const rcaExamples = readRequiredWorkspaceFile("docs/workflows/tool-churn-rca-examples.md", failures);
const tokenEconomyGovernance = readRequiredWorkspaceFile("docs/workflows/token-economy-governance.md", failures);
const storyIndex = readRequiredWorkspaceFile("docs/workflows/implementation-evidence-boundary.md", failures);
const story21_2 = readRequiredWorkspaceFile("docs/workflows/implementation-evidence-boundary.md", failures);
const story21_3 = readRequiredWorkspaceFile("docs/workflows/implementation-evidence-boundary.md", failures);
const rcaNonGoals = sectionBetween(rcaWorkflow, "## Non-Goals");
const story21_4 = readRequiredWorkspaceFile("docs/workflows/implementation-evidence-boundary.md", failures);
const ccusageCodexSection = sectionBetweenText(
  tokenEconomyGovernance,
  "For `ccusage` Codex evaluation",
  "Not allowed without a later story and explicit approval",
);
const normalizedCcusageCodexSection = ccusageCodexSection.replace(/\s+/g, " ");
const providerPromptCachingSection = sectionBetween(tokenEconomyGovernance, "## Provider Prompt Caching Criteria");
const normalizedProviderPromptCachingSection = providerPromptCachingSection.replace(/\s+/g, " ");
const semanticCacheSection = sectionBetween(tokenEconomyGovernance, "## Deferred Semantic Cache Criteria");
const normalizedSemanticCacheSection = semanticCacheSection.replace(/\s+/g, " ");

assertCondition(
  packageJson.scripts?.["check:token-economy"] === "node ./scripts/check-token-economy.mjs",
  "package.json must define check:token-economy as node ./scripts/check-token-economy.mjs",
  failures,
);
assertCondition(
  packageJson.scripts?.check
    ?.split("&&")
    .map((script) => script.trim())
    .includes("pnpm run check:token-economy"),
  "pnpm run check must include pnpm run check:token-economy",
  failures,
);

for (const path of [
  "docs/workflows/tool-churn-rca.md",
  "docs/workflows/tool-churn-rca-examples.md",
  "docs/workflows/token-economy-governance.md",
  "docs/ai-context/index.md",
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
]) {
  assertCondition(existsSync(join(rootDir, path)), `Missing token economy artifact ${path}`, failures);
}

for (const requiredText of [
  "quiet competent operator",
  "docs/workflows/tool-churn-rca.md",
  "docs/ai-context/index.md",
  "docs/workflows/tool-churn-rca-examples.md",
]) {
  assertCondition(agents.includes(requiredText), `AGENTS.md must reference ${requiredText}`, failures);
}

assertCondition(
  contextIndex.includes(
    "| Tool or command failure | `AGENTS.md#tool-resolution-and-verification`, `AGENTS.md#linux-shell-commands`, `docs/workflows/tool-churn-rca.md` |",
  ) && contextIndex.includes("needs Tool Churn RCA examples from `docs/workflows/tool-churn-rca-examples.md`"),
  "AI context index must keep Tool Churn RCA examples as expansion context for repeated or brittle failures",
  failures,
);
assertCondition(
  contextIndex.includes("docs/workflows/token-economy-governance.md") &&
    contextIndex.includes("Savings claims, adoption, installation, paid usage, or networked integration are proposed"),
  "AI context index must route token-economy savings claims to governance workflow",
  failures,
);
assertCondition(
  rcaWorkflow.includes("docs/workflows/tool-churn-rca-examples.md"),
  "Tool Churn RCA workflow must reference its examples document",
  failures,
);

for (const triggerCondition of [
  "The same command or tool path fails twice.",
  "A sandbox runner timeout happens before process output.",
  "A shell quoting, parser, wildcard, or scriptblock error repeats.",
  "A tool, executable, path, venv, package manager, or resolver is missing.",
  "A permission, sandbox, safe-directory, credential, or ownership denial blocks progress.",
  "A verification command fails because of environment setup rather than story behavior.",
  "The agent is about to retry the same failed command shape after repo guidance says to simplify it.",
  "The agent cannot explain what a retry would prove that the previous attempt did not.",
]) {
  assertCondition(rcaWorkflow.includes(triggerCondition), `Tool Churn RCA workflow must preserve trigger ${triggerCondition}`, failures);
}

for (const failureClass of [
  "`quoting`",
  "`path-or-tool`",
  "`sandbox`",
  "`permission`",
  "`dependency`",
  "`verification`",
  "`stale-state`",
  "`unknown`",
]) {
  assertCondition(rcaWorkflow.includes(failureClass), `Tool Churn RCA workflow must preserve failure class ${failureClass}`, failures);
}

for (const stopLine of [
  "Two attempts fail with the same command/tool path.",
  "The second attempt only changes superficial quoting or formatting.",
  "A runner timeout happens before output twice.",
  "The retry would require new authority, network, credentials, destructive cleanup, or paid usage.",
  "The failure class is still `unknown` after one simple diagnostic command.",
]) {
  assertCondition(rcaWorkflow.includes(stopLine), `Tool Churn RCA workflow must preserve retry stop line ${stopLine}`, failures);
}

for (const nextSafeAction of [
  "Confirm location with `pwd`.",
  "Check diff scope with `git diff --stat` or `git diff --name-only`.",
  "Verify direct tool availability",
  "Replace a complex shell shape with a simpler direct shell command.",
  "Read the existing script or docs before invoking package-manager indirection.",
  "Request approval for the exact read-only verification command when sandbox behavior is the blocker.",
  "Park the blocked lane and continue safe local/read-only work if the goal has other useful tasks.",
]) {
  assertCondition(rcaWorkflow.includes(nextSafeAction), `Tool Churn RCA workflow must preserve next safe action ${nextSafeAction}`, failures);
}

for (const nonGoal of [
  "destructive cleanup",
  "GitHub mutation",
  "provider",
  "paid usage",
  "credential/session access",
  "worker launch",
  "process launch",
  "failed-check bypass",
]) {
  assertCondition(rcaNonGoals.includes(nonGoal), `Tool Churn RCA workflow must preserve Non-Goals boundary for ${nonGoal}`, failures);
}

const exampleHeadings = [
  "Sandbox Runner Timeout",
  "Shell Quoting Or Parser Error",
  "Missing Supervisor Virtual Environment",
  "Git Worktree Metadata EROFS",
  "Supervisor Uv Cache EROFS",
  "PR Review Threads After Green CI",
  "Git Safe-Directory Or Permission Denial",
];
const packetFields = [
  "Tool Churn RCA Packet",
  "- What failed:",
  "- Failure class:",
  "- Most likely cause:",
  "- Evidence:",
  "- Retry stop line:",
  "- One next safe action:",
  "- Durable fix recommendation:",
];

for (const heading of exampleHeadings) {
  const start = rcaExamples.indexOf(`## ${heading}`);
  assertCondition(start !== -1, `RCA examples must include ${heading}`, failures);
  const next = start === -1 ? -1 : rcaExamples.indexOf("\n## ", start + 1);
  const section = start === -1 ? "" : rcaExamples.slice(start, next === -1 ? undefined : next);
  for (const field of packetFields) {
    assertCondition(section.includes(field), `RCA example ${heading} must include ${field}`, failures);
  }
}

for (const evaluationText of [
  "Treat external tools as candidates until a later story approves adoption.",
  "experimental Codex support",
  "Fixture-first read-only evaluation only",
  "Headroom spike may proceed only in a later story or explicitly approved task.",
  "Defluffer-style cleanup can be useful as a reviewer, not an editor.",
  "Preview app-level response cache candidate",
  "Redis LangCache or another semantic cache belongs later",
]) {
  assertCondition(tokenEconomyGovernance.includes(evaluationText), `Token economy governance must preserve ${evaluationText}`, failures);
}

assertCondition(
  storyIndex.includes("21-2-operationalize-token-economy-workflow.md"),
  "Story index must reference Story 21.2 token economy operationalization",
  failures,
);
assertCondition(
  storyIndex.includes("21-3-harden-tool-churn-rca-drift-check.md"),
  "Story index must reference Story 21.3 Tool Churn RCA drift-check hardening",
  failures,
);
assertCondition(
  storyIndex.includes("21-4-token-economy-measurement-readiness.md"),
  "Story index must reference Story 21.4 token economy measurement readiness",
  failures,
);
for (const storyText of [
  "Tool Churn RCA guidance to become a directly usable workflow",
  "static drift check verifies",
  "docs/workflows/tool-churn-rca-examples.md",
  "does not install external token tools",
  "pnpm run check:token-economy",
]) {
  assertCondition(story21_2.includes(storyText), `Story 21.2 must preserve ${storyText}`, failures);
}

for (const storyText of [
  "trigger conditions",
  "failure classes",
  "retry stop lines",
  "next safe actions",
  "non-goals",
  "pnpm run check:token-economy",
]) {
  assertCondition(story21_3.includes(storyText), `Story 21.3 must preserve ${storyText}`, failures);
}

for (const packetField of [
  "- Workflow type:",
  "- Task boundary:",
  "- Context loaded:",
  "- Major tool calls:",
  "- Repeated command/tool failures:",
  "- Verification outcome:",
  "- Safety or authority signals preserved:",
  "- Rough duration:",
  "- Token or usage source:",
  "- Measurement confidence:",
  "- Follow-up recommendation:",
]) {
  assertCondition(
    tokenEconomyGovernance.includes(packetField),
    `Token economy governance baseline packet must include ${packetField}`,
    failures,
  );
}

for (const workflowSample of [
  "BMAD story implementation",
  "Tool Churn RCA diagnosis",
  "Documentation update with verification",
  "Research or external tool evaluation",
  "PR delivery or review-comment resolution",
]) {
  assertCondition(
    tokenEconomyGovernance.includes(workflowSample),
    `Token economy governance must include workflow sample ${workflowSample}`,
    failures,
  );
}

for (const ccusageBoundary of [
  "copied and sanitized Codex JSONL",
  "sanitized saved",
  "Do not point tools at an unrestricted live `CODEX_HOME`",
  "recorded in the lane evidence or local tool-trial packet",
  "excluded prompt/completion/session fields",
  "anonymized session label",
  "Retain only aggregate measurement fields",
  "Treat cost and model attribution as estimates",
  "pricing source, snapshot date, currency, speed-tier assumption, and fallback reason",
]) {
  assertCondition(
    normalizedCcusageCodexSection.includes(ccusageBoundary),
    `Token economy governance must preserve ccusage boundary ${ccusageBoundary}`,
    failures,
  );
}

for (const providerCacheBoundary of [
  "Provider prompt-cache evidence must include",
  "cache-retention mode and TTL or duration",
  "cache-read/write token fields when available",
  "provider documentation or billing evidence used as a fallback",
  "mark measurement confidence low",
  "Unknown retention duration blocks adoption",
  "Automatic provider caching is still a measurement input",
  "not permission to add new provider calls, paid usage, or prompt retention",
]) {
  assertCondition(
    normalizedProviderPromptCachingSection.includes(providerCacheBoundary),
    `Token economy governance must preserve provider cache boundary ${providerCacheBoundary}`,
    failures,
  );
}

for (const semanticCacheBoundary of [
  "similar-response cache will not replay stale or unsafe answers",
  "stale-answer invalidation",
  "unsafe-answer rejection",
  "user or tenant boundary isolation",
  "cache-hit inspection",
  "cache-miss fallback",
  "rollback or disablement",
]) {
  assertCondition(
    normalizedSemanticCacheSection.includes(semanticCacheBoundary),
    `Token economy governance must preserve semantic cache boundary ${semanticCacheBoundary}`,
    failures,
  );
}

for (const adoptionGate of [
  "The tool's local data sources.",
  "Whether it reads credentials, sessions, prompts, completions, reasoning",
  "Before/after evidence on at least two workflow families.",
  "Failure cases where the tool hides meaning, citations, paths, line numbers",
  "A rollback path and disabled-by-default expectation.",
  "Raw prompt, completion, reasoning trace, provider payload, or secret retention.",
]) {
  assertCondition(
    tokenEconomyGovernance.includes(adoptionGate),
    `Token economy governance must preserve adoption gate ${adoptionGate}`,
    failures,
  );
}

for (const storyText of [
  "baseline packet captures workflow type",
  "keeps them evaluation-only",
  "does not install tools, call providers, spend money",
  "pnpm run check:token-economy",
]) {
  assertCondition(story21_4.includes(storyText), `Story 21.4 must preserve ${storyText}`, failures);
}

if (failures.length > 0) {
  console.error("Token economy drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: token economy drift checks passed.");
