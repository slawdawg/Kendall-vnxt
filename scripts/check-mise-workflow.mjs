import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const miseToml = readFileSync(join(rootDir, "mise.toml"), "utf8");
const packageJson = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
const evidence = readFileSync(
  join(rootDir, "docs/workflows/mise-normal-workflow-implementation-evidence-2026-06-18.md"),
  "utf8",
);
const story = readFileSync(
  join(rootDir, "docs/stories/22-3-implement-mise-normal-workflow.md"),
  "utf8",
);
const storyIndex = readFileSync(join(rootDir, "docs/stories/index.md"), "utf8");

const failures = [];

function assertIncludes(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    failures.push(`${label} is missing ${JSON.stringify(needle)}`);
  }
}

function parseTomlSubset(source) {
  const sections = new Map();
  let currentSection = null;

  for (const [lineIndex, rawLine] of source.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }

    const sectionMatch = line.match(/^\[([A-Za-z0-9_.-]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      if (!sections.has(currentSection)) {
        sections.set(currentSection, {});
      }
      continue;
    }

    const valueMatch = line.match(/^([A-Za-z0-9_-]+)\s*=\s*"([^"]*)"\s*$/);
    if (valueMatch && currentSection !== null) {
      const [, key, value] = valueMatch;
      sections.get(currentSection)[key] = value;
      continue;
    }

    failures.push(`mise.toml line ${lineIndex + 1} uses unsupported syntax: ${line}`);
  }

  return sections;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    failures.push(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertAllowedKeys(sectionName, values, allowedKeys) {
  for (const key of Object.keys(values)) {
    if (!allowedKeys.has(key)) {
      failures.push(`mise.toml [${sectionName}] must not define ${JSON.stringify(key)}`);
    }
  }
}

const miseSections = parseTomlSubset(miseToml);
const allowedSections = new Set([
  "tools",
  "tasks.setup",
  "tasks.preflight",
  "tasks.workspace-doctor",
  "tasks.check",
]);

for (const sectionName of miseSections.keys()) {
  if (!allowedSections.has(sectionName)) {
    failures.push(`mise.toml must not define unsupported section [${sectionName}]`);
  }
  if (/^(env|hooks|plugins)(\.|$)/i.test(sectionName)) {
    failures.push(`mise.toml must not define lifecycle/secret section [${sectionName}]`);
  }
}

const tools = miseSections.get("tools") ?? {};
assertAllowedKeys("tools", tools, new Set(["node", "pnpm", "python"]));
for (const [tool, version] of [
  ["node", "22.13.0"],
  ["pnpm", "11.5.2"],
  ["python", "3.12"],
]) {
  assertEqual(tools[tool], version, `mise.toml [tools] ${tool}`);
}

for (const [task, command] of [
  ["setup", "pnpm run setup"],
  ["preflight", "pnpm run preflight"],
  ["workspace-doctor", "pnpm run codex:workspace:doctor"],
  ["check", "pnpm run check"],
]) {
  const sectionName = `tasks.${task}`;
  const taskConfig = miseSections.get(sectionName);
  if (!taskConfig) {
    failures.push(`mise.toml is missing [${sectionName}]`);
    continue;
  }
  assertAllowedKeys(sectionName, taskConfig, new Set(["description", "run"]));
  assertEqual(taskConfig.run, command, `mise.toml [${sectionName}] run`);
}

assertIncludes(
  packageJson.scripts["check:mise-workflow"],
  "node ./scripts/check-mise-workflow.mjs",
  "package.json check:mise-workflow",
);
for (const scriptName of ["check:static", "check"]) {
  assertIncludes(
    packageJson.scripts[scriptName],
    "pnpm run check:mise-workflow",
    `package.json ${scriptName}`,
  );
}

assertIncludes(evidence, "mise run setup: pass", "mise implementation evidence");
assertIncludes(evidence, "mise run preflight: pass", "mise implementation evidence");
assertIncludes(evidence, "mise run workspace-doctor: pass", "mise implementation evidence");
assertIncludes(evidence, "mise run check: pass", "mise implementation evidence");
for (const phrase of [
  "No `[env]`",
  "hooks",
  "plugins",
  "dotenv loading",
  "provider/API secrets",
  "worker launch",
  "custom lifecycle automation",
]) {
  assertIncludes(evidence, phrase, "mise implementation evidence");
}
assertIncludes(story, "Status: done", "Story 22.3");
assertIncludes(story, "`mise.toml`", "Story 22.3");
assertIncludes(storyIndex, "22-3-implement-mise-normal-workflow.md", "story index");

if (failures.length > 0) {
  console.error("Mise workflow drift checks failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: mise workflow drift checks passed.");
