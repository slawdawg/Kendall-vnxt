import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

function readWorkspaceFile(path) {
  return readFileSync(join(rootDir, path), "utf8");
}

function gitLsFiles() {
  let output = "";
  try {
    output = execFileSync("git", ["ls-files", "-z"], {
      cwd: rootDir,
      encoding: "utf8",
    });
  } catch (error) {
    output = typeof error.stdout === "string" ? error.stdout : "";
    if (output === "") {
      throw error;
    }
  }
  return output
    .split("\0")
    .filter(Boolean);
}

function trackedUnder(paths, prefixes) {
  return paths.filter((path) =>
    prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)),
  );
}

function tryGitLsFiles() {
  try {
    return gitLsFiles();
  } catch (error) {
    throw new Error(`Unable to inspect tracked files with git ls-files: ${error.message}`);
  }
}

function assertIncludes(haystack, needle, label, failures) {
  if (!haystack.includes(needle)) {
    failures.push(`${label} is missing ${JSON.stringify(needle)}`);
  }
}

const failures = [];
const trackedPaths = tryGitLsFiles();

const trackedBmadOutput = trackedUnder(trackedPaths, ["_bmad-output"]);
for (const path of trackedBmadOutput) {
  failures.push(
    `${path} is tracked under _bmad-output; BMAD work products must stay local and decisions must be rewritten as source-owned repo artifacts`,
  );
}

const trackedRootSkillsOutput = trackedUnder(trackedPaths, ["skills"]);
for (const path of trackedRootSkillsOutput) {
  failures.push(`${path} is tracked under root skills; generated BMAD skill output must stay local`);
}

const trackedLocalUserConfig = trackedPaths.filter((path) =>
  path === "_bmad/config.user.yaml" ||
  path === "_bmad/config.user.toml" ||
  path === "_bmad/custom/config.user.toml" ||
  path.split("/").pop()?.endsWith(".user.toml"),
);
for (const path of trackedLocalUserConfig) {
  failures.push(`${path} is local BMAD/user configuration and must not be tracked`);
}

const trackedSkillDecisionLogs = trackedPaths.filter((path) =>
  /^\.agents\/skills\/.*\/\.decision-log\.md$/.test(path),
);
for (const path of trackedSkillDecisionLogs) {
  failures.push(`${path} is a generated BMAD skill decision log and must stay local`);
}

const trackedSkillValidationReports = trackedPaths.filter((path) =>
  /^\.agents\/skills\/.*\/validation-report-[^/]+\.md$/.test(path),
);
for (const path of trackedSkillValidationReports) {
  failures.push(`${path} is a generated BMAD skill validation report and must stay local`);
}

const bmadFilesManifest = readWorkspaceFile("_bmad/_config/files-manifest.csv");
if (/validation-report-\d+|\.decision-log\.md/.test(bmadFilesManifest)) {
  failures.push("_bmad/_config/files-manifest.csv must not include generated skill validation reports or decision logs");
}

const trackedPathSet = new Set(trackedPaths);
for (const [index, line] of bmadFilesManifest.split(/\r?\n/).entries()) {
  if (!line.trim() || line.startsWith("type,")) {
    continue;
  }
  const match = line.match(/^"[^"]+","[^"]+","([^"]+)","([^"]+)","[^"]+"$/);
  if (!match) {
    failures.push(`_bmad/_config/files-manifest.csv row ${index + 1} is not in the expected quoted five-column format`);
    continue;
  }
  const [, moduleName, manifestPath] = match;
  if (moduleName === "scripts") {
    const trackedPath = `_bmad/${manifestPath}`;
    if (!trackedPathSet.has(trackedPath)) {
      failures.push(`${trackedPath} is listed in _bmad/_config/files-manifest.csv but is not tracked`);
    }
  }
}

const forbiddenLocalArtifactPathFragments = [
  "_bmad-output/research-brainstorming-local-artifacts/",
  "_bmad-output/local-artifacts/",
  "_bmad-output/party-mode/",
  "_bmad-output/reviews/",
  "_bmad-output/retrospectives/",
];

const trackedLocalArtifactDumps = trackedUnder(trackedPaths, ["_bmad-output"]).filter((path) =>
  forbiddenLocalArtifactPathFragments.some((fragment) => path.includes(fragment)),
);
for (const path of trackedLocalArtifactDumps) {
  failures.push(`${path} is a local BMAD artifact dump and must not be tracked`);
}

const generatedArtifacts = readWorkspaceFile("docs/workflows/generated-agent-artifacts.md");
const agents = readWorkspaceFile("AGENTS.md");
const bmadAgentBuilder = readWorkspaceFile(".agents/skills/bmad-agent-builder/SKILL.md");
const bmadWorkflowBuilder = readWorkspaceFile(".agents/skills/bmad-workflow-builder/SKILL.md");
const bmadBuilderModule = readWorkspaceFile(".agents/skills/bmad-bmb-setup/assets/module.yaml");
const bmadBuilderInstalledConfig = readWorkspaceFile("_bmad/bmb/config.yaml");
const knxGovernanceCoordinator = readWorkspaceFile(".agents/skills/knx-agent-governance-coordinator/SKILL.md");
const knxDecisionContinuity = readWorkspaceFile(
  ".agents/skills/knx-agent-governance-coordinator/references/maintain-decision-continuity.md",
);
const knxOrientFromArtifacts = readWorkspaceFile(
  ".agents/skills/knx-agent-governance-coordinator/references/orient-from-artifacts.md",
);
const packageJson = JSON.parse(readWorkspaceFile("package.json"));

for (const [needle, label] of [
  ["BMAD Work Product Boundary", "generated agent artifacts guidance"],
  ["BMAD-generated planning and research artifacts are Kendall local work state", "generated agent artifacts guidance"],
  ["Do not use approval to track a generated BMAD artifact directly", "generated agent artifacts guidance"],
  ["rewrite it as source-owned", "generated agent artifacts guidance"],
  ["BMad Builder custom creations under `_bmad-output/bmb-creations/`", "generated agent artifacts guidance"],
  ["generated `.agents/skills/*/.decision-log.md`", "generated agent artifacts guidance"],
  ["generated `.agents/skills/*/validation-report-*.md`", "generated agent artifacts guidance"],
  ["Do not add BMAD work products to a PR simply because they are useful", "generated agent artifacts guidance"],
  ["`_bmad-output` files are not part of the clean install surface", "generated agent artifacts guidance"],
  ["generated root `skills/`", "generated agent artifacts guidance"],
  ["`_bmad/config.user.toml`", "generated agent artifacts guidance"],
  ["`_bmad/custom/config.user.toml`", "generated agent artifacts guidance"],
]) {
  assertIncludes(generatedArtifacts, needle, label, failures);
}

for (const [source, label] of [
  [bmadAgentBuilder, "bmad-agent-builder default output folder"],
  [bmadWorkflowBuilder, "bmad-workflow-builder default output folder"],
  [bmadBuilderModule, "bmad-bmb-setup module defaults"],
  [bmadBuilderInstalledConfig, "_bmad/bmb installed config"],
]) {
  assertIncludes(source, "{project-root}/_bmad-output/bmb-creations/skills", label, failures);
  if (source.includes("{project-root}/skills")) {
    failures.push(`${label} must not default generated Builder output to {project-root}/skills`);
  }
}

for (const [source, label] of [
  [bmadAgentBuilder, "bmad-agent-builder reports default"],
  [bmadBuilderModule, "bmad-bmb-setup report defaults"],
  [bmadBuilderInstalledConfig, "_bmad/bmb report config"],
]) {
  assertIncludes(source, "{project-root}/_bmad-output/reports", label, failures);
  if (source.includes("_bmad-output/skills/reports")) {
    failures.push(`${label} must not default generated reports under _bmad-output/skills/reports`);
  }
}

for (const [source, label] of [
  [knxGovernanceCoordinator, "knx governance coordinator"],
  [knxDecisionContinuity, "knx decision continuity reference"],
  [knxOrientFromArtifacts, "knx orientation reference"],
]) {
  assertIncludes(source, "{project-root}/_bmad-output/handoffs/bmad-session-handoff.md", label, failures);
  if (source.includes("08_Automation/State/bmad_session_handoff.md")) {
    failures.push(`${label} must not reference the old local handoff path`);
  }
}

assertIncludes(
  knxOrientFromArtifacts,
  "{project-root}/_bmad-output/bmb-creations/skills/knx-*",
  "knx orientation built skills path",
  failures,
);
if (knxOrientFromArtifacts.includes("{project-root}/skills/knx-*")) {
  failures.push("knx orientation reference must not point generated built skills at {project-root}/skills");
}

for (const [needle, label] of [
  ["Treat BMAD-created work products as local Kendall planning state", "AGENTS.md"],
  ["rewrite it as source-owned docs, tests, scripts, or policy", "AGENTS.md"],
  ["remain local work products", "AGENTS.md"],
]) {
  assertIncludes(agents, needle, label, failures);
}

assertIncludes(
  packageJson.scripts?.["check:bmad-work-products"] ?? "",
  "node ./scripts/check-bmad-work-products.mjs",
  "package.json check:bmad-work-products",
  failures,
);

assertIncludes(
  packageJson.scripts?.["check:clean-install-boundary"] ?? "",
  "node ./scripts/check-clean-install-boundary.mjs",
  "package.json check:clean-install-boundary",
  failures,
);

for (const scriptName of ["check:static", "check"]) {
  assertIncludes(
    packageJson.scripts?.[scriptName] ?? "",
    "pnpm run check:bmad-work-products",
    `package.json ${scriptName}`,
    failures,
  );
  assertIncludes(
    packageJson.scripts?.[scriptName] ?? "",
    "pnpm run check:clean-install-boundary",
    `package.json ${scriptName}`,
    failures,
  );
}

if (failures.length > 0) {
  console.error("BMAD work product boundary checks failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: BMAD work product boundary checks passed.");
