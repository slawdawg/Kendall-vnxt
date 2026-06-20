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

function scriptCommands(script) {
  return (script ?? "")
    .split("&&")
    .map((command) => command.trim())
    .filter(Boolean);
}

const authorityBoundary = readWorkspaceFile("docs/workflows/execution-authority-boundary.md");
const approvalPacket = extractSection(
  authorityBoundary,
  "## Cleanup Automation Contract",
  "## Next-Lane Authority Decision Contract",
);
const packageJson = JSON.parse(readWorkspaceFile("package.json"));
const serviceSource = readWorkspaceFile("services/supervisor/src/supervisor/application/service.py");
const supervisorTests = readWorkspaceFile("services/supervisor/tests/integration/test_routing_preview.py");
const deliveryCheck = readWorkspaceFile("scripts/check-delivery-readiness-policy-report.mjs");
const storyIndex = readWorkspaceFile("docs/workflows/implementation-evidence-boundary.md");
const story = readWorkspaceFile("docs/workflows/implementation-evidence-boundary.md");

const failures = [];

for (const [scriptName, command] of [
  ["check:cleanup-automation", "node ./scripts/check-cleanup-automation-approval-packet.mjs"],
  ["check", "pnpm run check:cleanup-automation"],
]) {
  if (!scriptCommands(packageJson.scripts?.[scriptName]).includes(command)) {
    failures.push(`package.json ${scriptName} must include exact command: ${command}`);
  }
}

for (const packetText of [
  "Status: approval-required, non-executing packet",
  "Authority family: `cleanup-automation`",
  "Operation candidate: one bounded target-specific cleanup operation",
  "It does not delete anything.",
  "One local Git-registered disposable worktree.",
  "One filesystem residue path proven to be inside an approved cleanup root.",
  "Retained evidence deletion.",
  "Unclassified filesystem paths.",
  "Cleanup outside approved roots.",
  "Target path is inside the approved cleanup root.",
  "Dry-run effects are reviewed.",
  "Target id",
  "Operator",
  "Approval timestamp",
  "Expiry or review point",
  "Arbitrary, ambiguous, stale, expired, mismatched, or underspecified approval IDs must be rejected.",
  "Do not delete from this packet alone.",
  "Do not delete ambiguous paths.",
  "Do not delete based on stale PR, merge, or worktree evidence.",
  "Do not delete source checkout roots.",
  "Do not delete `main` or protected branches.",
  "Do not delete retained evidence unless separately approved.",
  "Do not use string-built shell deletion commands.",
  "Do not cross from local cleanup to remote cleanup without exact remote target approval.",
]) {
  assertIncludes(approvalPacket, packetText, `Cleanup approval packet must include: ${packetText}`, failures);
}

for (const serviceText of [
  "cleanupTargetPath",
  "retainedEvidence",
  "blockedPaths",
  "dryRunEffects",
  "Review the dry-run cleanup plan and request exact cleanup approval before deletion.",
  "while retaining evidence, but it does not remove worktrees, delete branches, delete artifacts, or mutate files.",
  "This report is not approval to push, pull, create PRs, wait for CI, merge, delete branches, or remove worktrees.",
]) {
  assertIncludes(serviceSource, serviceText, `Supervisor service must preserve cleanup planning boundary: ${serviceText}`, failures);
}

for (const testText of [
  "cleanupTargetPath",
  "retainedEvidence",
  "dryRunEffects",
  "would block worktree removal",
  "would block local branch deletion",
  "git worktree removal would be skipped because target is filesystem residue",
  "/tmp/outside-kendall-cleanup-target",
  "failed-delivery",
  "stale-delivery",
]) {
  assertIncludes(supervisorTests, testText, `Supervisor tests must preserve cleanup planning evidence: ${testText}`, failures);
}

for (const checkText of [
  "delete worktrees",
  "delete branches",
  "does not push, merge, delete worktrees, delete branches, sync issues, call providers, or bypass failed checks",
  "Story index must reference Story 10.3 cleanup plan",
  "Story index must reference Story 10.4 delivery and cleanup plans in Dev Console",
]) {
  assertIncludes(deliveryCheck, checkText, `Delivery readiness check must preserve cleanup stop lines: ${checkText}`, failures);
}

for (const storyText of [
  "this story is non-executing",
  "does not delete paths, remove worktrees, delete branches, delete remote refs, remove evidence, or run cleanup commands",
  "Preserved cleanup planning as read-only evidence and required target-specific approval before any deletion.",
]) {
  assertIncludes(story, storyText, `Story 18.1 must preserve cleanup packet evidence: ${storyText}`, failures);
}

for (const indexText of [
  "Cleanup automation: `docs/workflows/execution-authority-boundary.md#cleanup-automation-contract`",
  "Epic 18 starts after the real CLI worker launch approval packet.",
  "Stories in this epic do not approve file deletion, worktree removal, branch deletion, remote ref deletion, retained evidence deletion, cleanup commands, or failed-check bypass.",
]) {
  assertIncludes(storyIndex, indexText, `Story index must preserve cleanup authority status: ${indexText}`, failures);
}

if (failures.length > 0) {
  console.error("Cleanup automation approval packet drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: cleanup automation approval packet drift checks passed.");
