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

const failures = [];

const packageJsonSource = readRequiredWorkspaceFile("package.json", failures);
const packageJson = packageJsonSource ? JSON.parse(packageJsonSource) : {};
const agents = readRequiredWorkspaceFile("AGENTS.md", failures);
const contextIndex = readRequiredWorkspaceFile("docs/ai-context/index.md", failures);
const rcaWorkflow = readRequiredWorkspaceFile("docs/workflows/tool-churn-rca.md", failures);
const rcaExamples = readRequiredWorkspaceFile("docs/workflows/tool-churn-rca-examples.md", failures);
const evaluationPlan = readRequiredWorkspaceFile("docs/research/token-economy-tool-evaluation.md", failures);
const storyIndex = readRequiredWorkspaceFile("docs/stories/index.md", failures);
const story21 = readRequiredWorkspaceFile("docs/stories/21-2-operationalize-token-economy-workflow.md", failures);

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
for (const storyText of [
  "Tool Churn RCA guidance to become a directly usable workflow",
  "static drift check verifies",
  "docs/workflows/tool-churn-rca-examples.md",
  "does not install external token tools",
  "pnpm.cmd run check:token-economy",
]) {
  assertCondition(story21.includes(storyText), `Story 21.2 must preserve ${storyText}`, failures);
}

if (failures.length > 0) {
  console.error("Token economy drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: token economy drift checks passed.");
