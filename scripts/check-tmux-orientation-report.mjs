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
const scriptPath = "scripts/tmux-orientation-report.mjs";
const testPath = "tests/tmux-orientation-report.test.mjs";
const runbookPath = "docs/workflows/tmux-orientation-report.md";

for (const path of [scriptPath, testPath, runbookPath]) {
  assertCondition(existsSync(join(rootDir, path)), `Missing tmux orientation artifact ${path}`, failures);
}

assertCondition(
  packageJson.scripts?.["tmux:orientation"] === "node ./scripts/tmux-orientation-report.mjs",
  "package.json must define tmux:orientation as node ./scripts/tmux-orientation-report.mjs",
  failures,
);
assertCondition(
  packageJson.scripts?.["test:tmux-orientation-report"] === "node --test tests/tmux-orientation-report.test.mjs",
  "package.json must define test:tmux-orientation-report",
  failures,
);
assertCondition(
  packageJson.scripts?.["check:tmux-orientation-report"] === "node ./scripts/check-tmux-orientation-report.mjs",
  "package.json must define check:tmux-orientation-report",
  failures,
);

if (existsSync(join(rootDir, scriptPath))) {
  const script = readWorkspaceFile(scriptPath);
  for (const forbidden of ["capture-pane", "send-keys", "source-file", "kill-pane", "respawn-pane"]) {
    assertCondition(!script.includes(forbidden), `${scriptPath} must not expose tmux ${forbidden}`, failures);
  }
  assertCondition(script.includes("list-panes"), `${scriptPath} must use tmux list-panes metadata`, failures);
  assertCondition(script.includes("takeover-required"), `${scriptPath} must classify takeover-required panes`, failures);
}

if (existsSync(join(rootDir, runbookPath))) {
  const runbook = readWorkspaceFile(runbookPath);
  for (const requiredText of [
    "pnpm run tmux:orientation",
    "pnpm run test:tmux-orientation-report",
    "pnpm run check:tmux-orientation-report",
    "metadata-only",
    "Do not capture pane scrollback",
    "Do not mutate tmux sessions",
    "takeover-required",
  ]) {
    assertCondition(runbook.includes(requiredText), `${runbookPath} must include ${requiredText}`, failures);
  }
}

if (failures.length > 0) {
  console.error("Tmux orientation report drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: tmux orientation report drift checks passed.");
