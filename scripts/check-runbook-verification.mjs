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

function extractCheckCommands(script) {
  const commands = [];
  const commandPattern = /\bpnpm\s+run\s+(check:[A-Za-z0-9:-]+)/g;
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

const packageJson = JSON.parse(readWorkspaceFile("package.json"));
const files = {
  "README.md": readWorkspaceFile("README.md"),
  "docs/workflows/current-session-runbook.md": readWorkspaceFile("docs/workflows/current-session-runbook.md"),
  "docs/workflows/implementation-evidence-boundary.md": readWorkspaceFile("docs/workflows/implementation-evidence-boundary.md"),
  "services/supervisor/src/supervisor/application/service.py": readWorkspaceFile(
    "services/supervisor/src/supervisor/application/service.py",
  ),
  "tests/e2e/dashboard.spec.ts": readWorkspaceFile("tests/e2e/dashboard.spec.ts"),
};

const failures = [];

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

const activeCheckCommands = uniqueInOrder([
  ...extractCheckCommands(packageJson.scripts?.["check:static"]),
  ...extractCheckCommands(packageJson.scripts?.check),
]);

assertCondition(
  activeCheckCommands.length > 0,
  "package.json aggregate check scripts must include at least one pnpm run check:* command",
  failures,
);

const currentRunbooks = [
  "README.md",
  "docs/workflows/current-session-runbook.md",
];

for (const path of currentRunbooks) {
  const content = files[path];
  assertCondition(mentionsCommand(content, "pnpm run check"), `${path} must mention pnpm run check`, failures);
  for (const command of activeCheckCommands) {
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
