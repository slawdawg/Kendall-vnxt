import { readFileSync } from "node:fs";
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentionsCommand(content, command) {
  return new RegExp(`${escapeRegExp(command)}(?![A-Za-z0-9:-])`).test(content);
}

function extractVerificationCommands(script) {
  const commands = [];
  const commandPattern = /\bpnpm\s+run\s+((?:check|test|build):[A-Za-z0-9:-]+)/g;
  let match;

  while ((match = commandPattern.exec(script ?? "")) !== null) {
    commands.push(`pnpm run ${match[1]}`);
  }

  return commands;
}

function uniqueInOrder(values) {
  const seen = new Set();
  const unique = [];

  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      unique.push(value);
    }
  }

  return unique;
}

function assertExactList(actual, expected, label) {
  assertCondition(
    actual.length === expected.length && actual.every((value, index) => value === expected[index]),
    `${label} must exactly match ${JSON.stringify(expected)} but found ${JSON.stringify(actual)}`,
    failures,
  );
}

const packageJson = JSON.parse(readWorkspaceFile("package.json"));
const files = {
  "AGENTS.md": readWorkspaceFile("AGENTS.md"),
  "README.md": readWorkspaceFile("README.md"),
  "docs/workflows/end-to-end-lane-runner.md": readWorkspaceFile("docs/workflows/end-to-end-lane-runner.md"),
  "docs/workflows/current-session-runbook.md": readWorkspaceFile("docs/workflows/current-session-runbook.md"),
  "docs/workflows/implementation-evidence-boundary.md": readWorkspaceFile("docs/workflows/implementation-evidence-boundary.md"),
  "scripts/codex-workspace.mjs": readWorkspaceFile("scripts/codex-workspace.mjs"),
  "scripts/test-codex-workspace.mjs": readWorkspaceFile("scripts/test-codex-workspace.mjs"),
  "services/supervisor/src/supervisor/application/service.py": readWorkspaceFile(
    "services/supervisor/src/supervisor/application/service.py",
  ),
  "tests/e2e/dashboard.spec.ts": readWorkspaceFile("tests/e2e/dashboard.spec.ts"),
};

const failures = [];

const extractorProbeCommands = extractVerificationCommands(
  "pnpm run check:docs && pnpm run test:codex-workspace && pnpm run build:dashboard && pnpm run dev:dashboard",
);
assertExactList(
  extractorProbeCommands,
  ["pnpm run check:docs", "pnpm run test:codex-workspace", "pnpm run build:dashboard"],
  "Verification command extractor probe",
);

assertCondition(
  packageJson.scripts?.["check:runbooks"] === "node ./scripts/check-runbook-verification.mjs",
  "package.json must define check:runbooks as node ./scripts/check-runbook-verification.mjs",
  failures,
);
assertCondition(
  packageJson.scripts?.check?.includes("pnpm run check:runbooks"),
  "pnpm run check must include pnpm run check:runbooks",
  failures,
);

const activeVerificationCommands = uniqueInOrder([
  ...extractVerificationCommands(packageJson.scripts?.["check:static"]),
  ...extractVerificationCommands(packageJson.scripts?.check),
]);

assertCondition(
  activeVerificationCommands.length > 0,
  "package.json aggregate check scripts must include at least one pnpm run check:*, test:*, or build:* command",
  failures,
);

const currentRunbooks = [
  "README.md",
  "docs/workflows/current-session-runbook.md",
];

for (const path of currentRunbooks) {
  const content = files[path];
  assertCondition(mentionsCommand(content, "pnpm run check"), `${path} must mention pnpm run check`, failures);
  for (const command of activeVerificationCommands) {
    assertCondition(mentionsCommand(content, command), `${path} must mention ${command}`, failures);
  }
  assertCondition(
    !content.includes("77 supervisor tests") && !content.includes("70 supervisor tests"),
    `${path} must not carry stale fixed supervisor test counts`,
    failures,
  );
}

assertCondition(
  files["README.md"].includes("repo-local uv cache wrapper"),
  "README.md must describe the repo-local supervisor test wrapper",
  failures,
);
assertCondition(
  files["docs/workflows/current-session-runbook.md"].includes("runbook verification"),
  "current session runbook must mention runbook verification",
  failures,
);
assertCondition(
  files["docs/workflows/current-session-runbook.md"].includes("metadata-only heartbeat decision evidence"),
  "current session runbook must mention metadata-only heartbeat decision evidence",
  failures,
);
assertCondition(
  files["docs/workflows/end-to-end-lane-runner.md"].includes("Best-Judgment Decision Evidence"),
  "End-to-end lane runner must define best-judgment decision evidence",
  failures,
);
assertCondition(
  files["docs/workflows/end-to-end-lane-runner.md"].includes("--decision-rationale"),
  "End-to-end lane runner must document heartbeat decision rationale evidence",
  failures,
);
assertCondition(
  files["AGENTS.md"].includes("standing GitHub authority to resolve a **current, fully\n  satisfied** review thread without a new per-thread operator prompt"),
  "AGENTS.md must define bounded standing authority for fully satisfied current review threads",
  failures,
);
for (const requiredText of [
  "required,\n  failed, unknown, or ambiguously skipped check is always a stop line",
  "not a requested change with no pending review request",
  "current PR head fully addresses the feedback",
  "relevant local verification and required code review have completed",
  "fresh thread-aware GitHub data shows the thread is current, unambiguous",
  "disputed, unclear, unfixed, outdated-only, new after the audit, a requested\n  change",
  "thread discovered by the post-resolution re-audit blocks merge and requires\n  a fresh full evaluation",
  "An outdated-only thread is\n  a hold for the current-thread grant",
  "after `resolve-adjudicated-thread` revalidates that packet and resolves only\n  its named thread without a reply",
  "resolve without replying by default, then re-audit thread-aware review\n  state before any merge decision",
]) {
  assertCondition(
    files["AGENTS.md"].includes(requiredText),
    `AGENTS.md must retain bounded review-thread resolution policy text: ${requiredText}`,
    failures,
  );
}
for (const requiredText of [
  "permanent bounded merge authority for **all\n  Kendall_Nxt PRs**",
  "in this repository and its expected base branch,\n  is not a draft, is cleanly mergeable",
  "terminal successful checks or\n  policy-documented non-required skipped checks",
  "zero unresolved current\n  review threads (including unadjudicated outdated threads), no requested changes",
  "has completed\n  relevant local verification",
  "reviewed diff-risk assessment",
  "Fail closed and do not merge on an unknown, failed,\n  ambiguous, or nonterminal state",
  "cross-repository or cross-base target; force-push,\n  bypass, or history-rewrite mechanics",
  "never authorizes\n  cleanup",
  "Re-audit every bounded merge criterion immediately before the merge\n  mutation",
  "record the actual merge result afterward and before any cleanup decision",
  "unmanaged PR, retain the same\n  exact-head audit as an external evidence packet",
]) {
  assertCondition(
    files["AGENTS.md"].includes(requiredText),
    `AGENTS.md must retain permanent bounded merge authority text: ${requiredText}`,
    failures,
  );
}
for (const requiredText of [
  "A named lane under\n   `standard-delivery` grants the delegated delivery worker standing authority",
  "without a new per-thread\n   prompt",
  "verification/review, and check evidence; it resolves without replying by\n     default, then re-audits thread-aware review state.",
  "no requested change or pending review request",
  "disputed, unclear, unfixed, or\n   newly arrived-after-audit thread",
  "failing or ambiguous checks; or any high-risk lane",
  "required,\n     failed, unknown, or ambiguously skipped check is always a stop line",
  "post-resolution re-audit blocks merge and requires a fresh full\n   evaluation",
  "outdated-only thread is a hold for the current-thread rule. It can be\n   closed only after `adjudicate-outdated-thread` records a bounded exact-head",
  "Only after its packet is ready may\n   `resolve-adjudicated-thread` revalidate and resolve that one thread without\n   replying by default, then immediately repeat the",
  "binds the changed-path inspection to the exact PR head and\n   fingerprints every comment in the target thread canonically",
  "retains the mutation result, post-resolution current/outdated-thread holds,\n   and a recovery path even when GitHub returns an ambiguous failure",
  "Do not\n   retry that mutation blindly",
  "do not weaken the\n   separate merge checklist",
]) {
  assertCondition(
    files["docs/workflows/end-to-end-lane-runner.md"].includes(requiredText),
    `End-to-end lane runner must retain bounded review-thread resolution policy text: ${requiredText}`,
    failures,
  );
}
for (const requiredText of [
  "permanent bounded merge authority covers all\n   Kendall_Nxt PRs",
  "expected repository and\n   base branch, non-draft state, clean mergeability",
  "terminal successful or\n   policy-documented non-required skipped checks",
  "zero unresolved current\n   threads (including unadjudicated outdated threads), no requested changes or",
  "relevant local verification",
  "reviewed diff-risk assessment",
  "Fail closed on unknown, failed, ambiguous, or nonterminal state; new\n   feedback; missing evidence",
  "cross-repository or cross-base target; force-push, bypass, or history-rewrite\n   mechanics",
  "This authority never\n   includes cleanup",
  "Re-audit every bounded merge criterion immediately before that mutation",
  "actual merge result\n   after the merge and before any cleanup decision",
  "bounded unmanaged-PR evidence packet with every\n   gate above",
]) {
  assertCondition(
    files["docs/workflows/end-to-end-lane-runner.md"].includes(requiredText),
    `End-to-end lane runner must retain permanent bounded merge authority text: ${requiredText}`,
    failures,
  );
}
assertCondition(
  files["scripts/codex-workspace.mjs"].includes("best_judgment_decisions"),
  "codex workspace command must persist best-judgment decision evidence",
  failures,
);
assertCondition(
  files["scripts/test-codex-workspace.mjs"].includes("bestJudgmentDecisionCount"),
  "codex workspace tests must cover best-judgment decision evidence packets",
  failures,
);
assertCondition(
  files["docs/workflows/implementation-evidence-boundary.md"].includes("3-29-runbook-verification-alignment.md"),
  "Story index must reference Story 3.29 runbook verification alignment",
  failures,
);
assertCondition(
  files["docs/workflows/implementation-evidence-boundary.md"].includes("3-35-runbook-check-chain-hardening.md"),
  "Story index must reference Story 3.35 runbook check-chain hardening",
  failures,
);
assertCondition(
  files["docs/workflows/implementation-evidence-boundary.md"].includes("3-38-runbook-managed-recipe-check-chain.md"),
  "Story index must reference Story 3.38 runbook managed recipe check chain",
  failures,
);
assertCondition(
  files["services/supervisor/src/supervisor/application/service.py"].includes("pnpm run check:runbooks"),
  "Verification readiness report must surface pnpm run check:runbooks",
  failures,
);
assertCondition(
  files["services/supervisor/src/supervisor/application/service.py"].includes("handoffCheckpoints=handoff_checkpoints"),
  "Verification readiness report must surface handoff checkpoints",
  failures,
);
assertCondition(
  files["services/supervisor/src/supervisor/application/service.py"].includes("setup-handoff"),
  "Verification readiness report must include a supported setup handoff checkpoint",
  failures,
);
assertCondition(
  files["services/supervisor/src/supervisor/application/service.py"].includes("core readiness/report"),
  "Verification readiness report must describe core readiness checks in full verification evidence",
  failures,
);
assertCondition(
  files["docs/workflows/implementation-evidence-boundary.md"].includes("3-58-verification-handoff-checkpoints.md"),
  "Story index must reference Story 3.58 verification handoff checkpoints",
  failures,
);
assertCondition(
  files["tests/e2e/dashboard.spec.ts"].includes("pnpm run check:runbooks"),
  "Dashboard browser coverage must assert pnpm run check:runbooks",
  failures,
);

if (failures.length > 0) {
  console.error("Runbook verification alignment check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: runbook verification alignment checks passed.");
