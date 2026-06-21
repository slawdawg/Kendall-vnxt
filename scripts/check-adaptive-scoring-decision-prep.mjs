import { existsSync, readFileSync, realpathSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const realRootDir = realpathSync(rootDir);

function readWorkspaceFile(path) {
  return readFileSync(join(rootDir, path), "utf8");
}

function assertCondition(condition, message, failures) {
  if (!condition) {
    failures.push(message);
  }
}

function listSourceFiles(dir, extensions, files = []) {
  const fullDir = join(rootDir, dir);
  if (!existsSync(fullDir)) {
    return files;
  }
  for (const entry of readdirSync(fullDir)) {
    const fullPath = join(fullDir, entry);
    const realFullPath = realpathSync(fullPath);
    if (realFullPath !== realRootDir && !realFullPath.startsWith(`${realRootDir}${sep}`)) {
      continue;
    }
    const relativePath = relative(rootDir, fullPath);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      listSourceFiles(relativePath, extensions, files);
    } else if (extensions.some((extension) => relativePath.endsWith(extension))) {
      files.push(relativePath);
    }
  }
  return files;
}

const packageJson = JSON.parse(readWorkspaceFile("package.json"));
const requiredSourceFiles = [
  "docs/workflows/adaptive-scoring-decision-prep.md",
  "docs/workflows/execution-authority-boundary.md",
  "docs/workflows/implementation-evidence-boundary.md",
];
const sourceFileContents = Object.fromEntries(
  requiredSourceFiles.map((path) => [path, existsSync(join(rootDir, path)) ? readWorkspaceFile(path) : ""]),
);
const decisionPrep = sourceFileContents["docs/workflows/adaptive-scoring-decision-prep.md"];
const authorityBoundary = sourceFileContents["docs/workflows/execution-authority-boundary.md"];
const storyIndex = sourceFileContents["docs/workflows/implementation-evidence-boundary.md"];
const serviceSource = readWorkspaceFile("services/supervisor/src/supervisor/application/service.py");
const supervisorTests = readWorkspaceFile("services/supervisor/tests/integration/test_routing_preview.py");
const verificationCheck = readWorkspaceFile("scripts/check-verification-readiness-report.mjs");
const runbookCheck = readWorkspaceFile("scripts/check-runbook-verification.mjs");
const controlsSpec = readWorkspaceFile("tests/e2e/dashboard.spec.ts");
const readme = readWorkspaceFile("README.md");
const currentRunbook = readWorkspaceFile("docs/workflows/current-session-runbook.md");

const failures = [];

assertCondition(
  packageJson.scripts?.["check:adaptive-scoring"] === "node ./scripts/check-adaptive-scoring-decision-prep.mjs",
  "package.json must define check:adaptive-scoring as node ./scripts/check-adaptive-scoring-decision-prep.mjs",
  failures,
);
function scriptRunsCommand(script, command) {
  return String(script ?? "")
    .split(/\s*&&\s*/)
    .includes(command);
}

assertCondition(scriptRunsCommand(packageJson.scripts?.check, "pnpm run check:adaptive-scoring"), "pnpm run check must include check:adaptive-scoring", failures);
assertCondition(
  scriptRunsCommand(packageJson.scripts?.["check:static"], "pnpm run check:adaptive-scoring"),
  "pnpm run check:static must include check:adaptive-scoring",
  failures,
);

for (const path of requiredSourceFiles) {
  assertCondition(existsSync(join(rootDir, path)), `${path} must exist`, failures);
}

for (const text of [
  "Status: decision-preparation package, no execution authority granted",
  "Is adaptive scoring worth a future exact approval packet?",
  "NIST AI Risk Management Framework 1.0",
  "OECD AI Principles",
  "ISO/IEC 42001:2023 overview",
  "Current status: `decision_only_no_authority_granted`",
  "Allowed in this package:",
  "Not allowed in this package:",
  "Candidate Metadata Signals",
  "Excluded inputs:",
  "Future Approval Packet Requirements",
  "The active verification chain includes `pnpm run check:adaptive-scoring`.",
  "Do not run adaptive scoring.",
  "Do not compute or persist adaptive scores.",
  "Do not let scores change work priority, routing, delivery, cleanup,",
]) {
  assertCondition(decisionPrep.includes(text), `Decision prep doc must include: ${text}`, failures);
}

for (const url of [
  "https://www.nist.gov/itl/ai-risk-management-framework",
  "https://airc.nist.gov/airmf-resources/airmf/",
  "https://oecd.ai/en/ai-principles",
  "https://www.iso.org/standard/42001",
]) {
  assertCondition(decisionPrep.includes(url), `Decision prep doc must cite primary source ${url}`, failures);
}

for (const boundaryText of [
  "## Adaptive Scoring Decision Preparation Contract",
  "Status: decision_only_no_authority_granted, non-executing packet",
  "Authority family: `adaptive-scoring`",
  "docs/workflows/adaptive-scoring-decision-prep.md",
  "pnpm run check:adaptive-scoring",
  "Do not let scores change priority, routing, delivery, cleanup, authority,",
  "Do not treat this decision-prep package as approval.",
]) {
  assertCondition(authorityBoundary.includes(boundaryText), `Execution authority boundary must include: ${boundaryText}`, failures);
}

for (const storyText of [
  "13-1-define-adaptive-scoring-decision-support-contract.md",
  "Generic continuation language does not approve blocked post-MVP authority stories.",
]) {
  assertCondition(storyIndex.includes(storyText), `Implementation evidence boundary must include: ${storyText}`, failures);
}

for (const serviceText of [
  'familyId="adaptive-scoring"',
  'status="blocked_pending_explicit_approval"',
  "Use docs/workflows/adaptive-scoring-decision-prep.md and pnpm run check:adaptive-scoring to prepare a separate scoring decision packet before any adaptive scoring implementation starts.",
  "Do not run adaptive scoring.",
  "Do not let scores change work priority, authority state, or delivery/cleanup eligibility.",
  "Do not retain raw scoring inputs beyond metadata-only evidence.",
  "docs/workflows/adaptive-scoring-decision-prep.md",
  "check-adaptive-scoring",
  "pnpm run check:adaptive-scoring",
]) {
  assertCondition(serviceSource.includes(serviceText), `Supervisor service must include adaptive scoring boundary text: ${serviceText}`, failures);
}

for (const testText of [
  '"check-adaptive-scoring"',
  '"adaptive-scoring"',
  "docs/workflows/adaptive-scoring-decision-prep.md",
  "pnpm run check:adaptive-scoring",
]) {
  assertCondition(supervisorTests.includes(testText), `Supervisor tests must assert adaptive scoring text: ${testText}`, failures);
}

for (const fileText of [
  [verificationCheck, "check-adaptive-scoring", "verification readiness drift check"],
  [runbookCheck, "pnpm run check:adaptive-scoring", "runbook drift check"],
  [controlsSpec, "pnpm run check:adaptive-scoring", "controls e2e"],
  [readme, "pnpm run check:adaptive-scoring", "README"],
  [currentRunbook, "pnpm run check:adaptive-scoring", "current session runbook"],
]) {
  assertCondition(fileText[0].includes(fileText[1]), `${fileText[2]} must include ${fileText[1]}`, failures);
}

const forbiddenRuntimeMarkers = [
  "adaptiveScoringEnabled",
  "adaptive_scoring_enabled",
  "adaptiveScore:",
  "adaptiveScore?:",
  "adaptive_score:",
  "adaptiveScore =",
  "adaptive_score =",
  "adaptiveRecommendationScore",
  "adaptive_recommendation_score",
  "adaptiveConfidenceScore",
  "adaptive_confidence_score",
  "computeAdaptiveScore",
  "compute_adaptive_score",
  "calculateAdaptiveScore",
  "calculate_adaptive_score",
  "applyAdaptiveScore",
  "apply_adaptive_score",
  "rankByAdaptiveScore",
  "rank_by_adaptive_score",
  "rankCandidates",
  "rank_candidates",
  "priorityScore",
  "priority_score",
  "scoringPolicy",
  "scoring_policy",
  "scoreCandidate",
  "score_candidate",
  "scoringExecutionAllowed",
  "scoring_execution_allowed",
];

const runtimeFiles = [
  ...listSourceFiles("services/supervisor/src", [".py"]),
  ...listSourceFiles("apps/dashboard/src", [".ts", ".tsx"]),
  ...listSourceFiles("packages", [".ts"]),
  ...listSourceFiles("scripts", [".mjs"]),
].filter((file) => file !== "scripts/check-adaptive-scoring-decision-prep.mjs");

for (const file of runtimeFiles) {
  const content = readWorkspaceFile(file);
  for (const marker of forbiddenRuntimeMarkers) {
    assertCondition(!content.includes(marker), `Runtime source ${file} must not introduce executable scoring marker ${marker}`, failures);
  }
}

if (failures.length > 0) {
  console.error("Adaptive scoring decision preparation drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: adaptive scoring decision preparation checks passed.");
