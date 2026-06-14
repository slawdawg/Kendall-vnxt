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

const failures = [];

const packageJson = JSON.parse(readWorkspaceFile("package.json"));
const agents = readWorkspaceFile("AGENTS.md");
const contextIndex = readWorkspaceFile("docs/ai-context/index.md");
const rcaWorkflow = readWorkspaceFile("docs/workflows/tool-churn-rca.md");
const rcaExamples = readWorkspaceFile("docs/workflows/tool-churn-rca-examples.md");
const evaluationPlan = readWorkspaceFile("docs/research/token-economy-tool-evaluation.md");
const storyIndex = readWorkspaceFile("docs/stories/index.md");

assertCondition(
  packageJson.scripts?.["check:token-economy"] === "node ./scripts/check-token-economy.mjs",
  "package.json must define check:token-economy as node ./scripts/check-token-economy.mjs",
  failures,
);
assertCondition(
  packageJson.scripts?.check?.includes("pnpm run check:token-economy"),
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
  contextIndex.includes("docs/workflows/tool-churn-rca-examples.md"),
  "AI context index must route tool failures to the Tool Churn RCA examples",
  failures,
);
assertCondition(
  rcaWorkflow.includes("docs/workflows/tool-churn-rca-examples.md"),
  "Tool Churn RCA workflow must reference its examples document",
  failures,
);

for (const packetText of [
  "Windows Sandbox Runner Timeout",
  "PowerShell Quoting Or Parser Error",
  "Missing Supervisor Virtual Environment",
  "Git Safe-Directory Or Permission Denial",
  "Tool Churn RCA Packet",
]) {
  assertCondition(rcaExamples.includes(packetText), `RCA examples must include ${packetText}`, failures);
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

if (failures.length > 0) {
  console.error("Token economy drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: token economy drift checks passed.");
