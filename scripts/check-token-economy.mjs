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

const failures = [];

const packageJsonSource = readRequiredWorkspaceFile("package.json", failures);
const packageJson = packageJsonSource ? JSON.parse(packageJsonSource) : {};
const agents = readRequiredWorkspaceFile("AGENTS.md", failures);
const contextIndex = readRequiredWorkspaceFile("docs/ai-context/index.md", failures);
const rcaWorkflow = readRequiredWorkspaceFile("docs/workflows/tool-churn-rca.md", failures);
const rcaExamples = readRequiredWorkspaceFile("docs/workflows/tool-churn-rca-examples.md", failures);
const evaluationPlan = readRequiredWorkspaceFile("docs/research/token-economy-tool-evaluation.md", failures);
const storyIndex = readRequiredWorkspaceFile("docs/stories/index.md", failures);
const story21_2 = readRequiredWorkspaceFile("docs/stories/21-2-operationalize-token-economy-workflow.md", failures);
const story21_3 = readRequiredWorkspaceFile("docs/stories/21-3-harden-tool-churn-rca-drift-check.md", failures);
const rcaNonGoals = sectionBetween(rcaWorkflow, "## Non-Goals");

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
  "docs/ai-context/index.md",
  "docs/research/token-economy-tool-evaluation.md",
  "docs/stories/21-1-token-economy-foundation.md",
  "docs/stories/21-2-operationalize-token-economy-workflow.md",
  "docs/stories/21-3-harden-tool-churn-rca-drift-check.md",
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
    "| Tool or command failure | `AGENTS.md#tool-resolution-and-verification`, `AGENTS.md#windows-sandbox`, `docs/workflows/tool-churn-rca.md` |",
  ) && contextIndex.includes("needs Tool Churn RCA examples from `docs/workflows/tool-churn-rca-examples.md`"),
  "AI context index must keep Tool Churn RCA examples as expansion context for repeated or brittle failures",
  failures,
);
assertCondition(
  rcaWorkflow.includes("docs/workflows/tool-churn-rca-examples.md"),
  "Tool Churn RCA workflow must reference its examples document",
  failures,
);

for (const triggerCondition of [
  "The same command or tool path fails twice.",
  "A Windows sandbox runner timeout happens before process output.",
  "A PowerShell quoting, parser, wildcard, or scriptblock error repeats.",
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
  "Confirm location with `Get-Location`.",
  "Check diff scope with `git diff --stat` or `git diff --name-only`.",
  "Verify direct tool availability",
  "Replace a complex shell shape with a simpler direct PowerShell command.",
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
  "Windows Sandbox Runner Timeout",
  "PowerShell Quoting Or Parser Error",
  "Missing Supervisor Virtual Environment",
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
  "Headroom spike may proceed only in a later story or explicitly approved task.",
  "Defluffer-style cleanup can be useful as a reviewer, not an editor.",
  "Redis LangCache or another semantic cache belongs later",
]) {
  assertCondition(evaluationPlan.includes(evaluationText), `Evaluation plan must preserve ${evaluationText}`, failures);
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
for (const storyText of [
  "Tool Churn RCA guidance to become a directly usable workflow",
  "static drift check verifies",
  "docs/workflows/tool-churn-rca-examples.md",
  "does not install external token tools",
  "pnpm.cmd run check:token-economy",
]) {
  assertCondition(story21_2.includes(storyText), `Story 21.2 must preserve ${storyText}`, failures);
}

for (const storyText of [
  "trigger conditions",
  "failure classes",
  "retry stop lines",
  "next safe actions",
  "non-goals",
  "pnpm.cmd run check:token-economy",
]) {
  assertCondition(story21_3.includes(storyText), `Story 21.3 must preserve ${storyText}`, failures);
}

if (failures.length > 0) {
  console.error("Token economy drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: token economy drift checks passed.");
