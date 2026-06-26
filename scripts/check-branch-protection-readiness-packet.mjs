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

function assertIncludes(source, text, label, failures) {
  assertCondition(source.includes(text), `${label} must include ${text}`, failures);
}

const failures = [];
const packageJson = JSON.parse(readWorkspaceFile("package.json"));
const packetPath = "docs/workflows/branch-protection-readiness-packet.md";
const packet = existsSync(join(rootDir, packetPath)) ? readWorkspaceFile(packetPath) : "";
const authorityBoundary = readWorkspaceFile("docs/workflows/execution-authority-boundary.md");
const workspaceCoordination = readWorkspaceFile("docs/workflows/workspace-coordination-report.md");
const storyIndex = readWorkspaceFile("docs/workflows/implementation-evidence-boundary.md");
const readme = readWorkspaceFile("README.md");

assertCondition(existsSync(join(rootDir, packetPath)), `${packetPath} must exist`, failures);
assertCondition(
  packageJson.scripts?.["check:branch-protection-readiness"] === "node ./scripts/check-branch-protection-readiness-packet.mjs",
  "package.json must define check:branch-protection-readiness as node ./scripts/check-branch-protection-readiness-packet.mjs",
  failures,
);

for (const text of [
  "Status: readiness and future application packet, no GitHub mutation authority granted",
  "Which branch protection posture should Kendall_Nxt request exact approval to apply?",
  "Read-only evidence gathered on 2026-06-25:",
  "Repository default branch: `main`.",
  "Repository auto-merge setting: enabled.",
  "Repository rulesets API returned an empty list: `[]`.",
  "`main` branch summary reported `protected: true`.",
  "`main` branch summary reported required status checks with enforcement off",
  "and no contexts/checks listed.",
  "`dev`, `staging`, and `prod` branch summaries reported `protected: false`.",
  "Local branch foundation report showed `dev`, `staging`, `main`, and `prod`",
  "present locally/remotely with no protected-branch warnings and no planned",
  "CI already exposes a final `CI / check` job",
  "Detailed branch protection endpoints require authenticated GitHub API access.",
  "authenticated read before approval.",
  "Authority family: `github-branch-protection`",
  "Current status: `readiness_only_no_authority_granted`",
  "Protect `main` as the human gate.",
  "Protect `prod` as the production lane.",
  "Protect `staging` as the release-candidate lane.",
  "Keep `dev` fast-moving unless the operator decides",
  "Require the final `CI / check` status",
  "Future Approval Packet Requirements",
  "authority family: `github-branch-protection`",
  "exact operation, such as create or update a named branch protection rule",
  "repository: `slawdawg/Kendall-vnxt`",
  "target branch or branch pattern",
  "implementation surface: branch protection rule or repository ruleset",
  "required status checks by exact visible check name",
  "pull request review, conversation resolution, signed commit, linear history,",
  "merge queue, force-push, deletion, and admin-bypass settings",
  "current authenticated evidence for the target branch or ruleset",
  "expected post-change evidence",
  "retained GitHub read-back evidence, exact check-context evidence, rollback",
  "proof, and redaction policy",
  "verification command or authenticated read-back command",
  "rollback path",
  "stop lines",
  "operator and approval timestamp",
  "expiry or review point",
  "The standalone verification command is `pnpm run check:branch-protection-readiness`.",
  "Do not apply branch protection from this packet alone.",
  "Do not create, update, or delete repository rulesets from this packet alone.",
  "Do not change default branch, required checks, merge methods, merge queue,",
  "review rules, signed-commit rules, linear-history rules, admin bypass, branch",
  "refs, or GitHub Actions workflows from this packet alone.",
  "Do not push, create or update PRs, wait CI, merge, deploy, delete branches,",
  "delete worktrees, clean residue, or mutate review threads from this packet.",
  "Do not treat repository admin permission, CI success, live evidence, or this",
  "packet as approval.",
]) {
  assertIncludes(packet, text, packetPath, failures);
}

for (const text of [
  "## Branch Protection Readiness Contract",
  "Authority family: `github-branch-protection`",
  "Status: readiness_only_no_authority_granted, non-mutating packet",
  "docs/workflows/branch-protection-readiness-packet.md",
  "pnpm run check:branch-protection-readiness",
  "Retained GitHub read-back evidence, exact check-context evidence, rollback",
  "proof, and redaction policy.",
  "Do not apply branch protection or repository rulesets from this packet alone.",
]) {
  assertIncludes(authorityBoundary, text, "execution authority boundary", failures);
}

for (const text of [
  "docs/workflows/branch-protection-readiness-packet.md",
  "branch protection readiness packet",
  "no GitHub mutation authority",
]) {
  assertIncludes(workspaceCoordination, text, "workspace coordination report", failures);
}

assertIncludes(
  storyIndex,
  "23-1-branch-protection-readiness-packet.md",
  "implementation evidence boundary",
  failures,
);
assertIncludes(
  readme,
  "pnpm run check:branch-protection-readiness",
  "README developer checks",
  failures,
);

if (failures.length > 0) {
  console.error("Branch protection readiness packet drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: branch protection readiness packet drift checks passed.");
