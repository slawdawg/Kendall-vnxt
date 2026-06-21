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

const currentRunbooks = [
  "README.md",
  "docs/workflows/current-session-runbook.md",
];

for (const path of currentRunbooks) {
  const content = files[path];
  assertCondition(content.includes("pnpm run check"), `${path} must mention pnpm run check`, failures);
  assertCondition(content.includes("pnpm run check:docs"), `${path} must mention pnpm run check:docs`, failures);
  assertCondition(content.includes("pnpm run check:documentation-authority"), `${path} must mention pnpm run check:documentation-authority`, failures);
  assertCondition(content.includes("pnpm run check:verification-readiness"), `${path} must mention pnpm run check:verification-readiness`, failures);
  assertCondition(content.includes("pnpm run check:authority-readiness"), `${path} must mention pnpm run check:authority-readiness`, failures);
  assertCondition(content.includes("pnpm run check:adaptive-scoring"), `${path} must mention pnpm run check:adaptive-scoring`, failures);
  assertCondition(content.includes("pnpm run check:e2e-report"), `${path} must mention pnpm run check:e2e-report`, failures);
  assertCondition(content.includes("pnpm run check:reports"), `${path} must mention pnpm run check:reports`, failures);
  assertCondition(content.includes("pnpm run check:execution-boundary"), `${path} must mention pnpm run check:execution-boundary`, failures);
  assertCondition(content.includes("pnpm run check:execution-evidence"), `${path} must mention pnpm run check:execution-evidence`, failures);
  assertCondition(content.includes("pnpm run check:provider-fixtures"), `${path} must mention pnpm run check:provider-fixtures`, failures);
  assertCondition(content.includes("pnpm run check:process-lifecycle"), `${path} must mention pnpm run check:process-lifecycle`, failures);
  assertCondition(content.includes("pnpm run check:runbooks"), `${path} must mention pnpm run check:runbooks`, failures);
  assertCondition(content.includes("pnpm run check:runtime-export"), `${path} must mention pnpm run check:runtime-export`, failures);
  assertCondition(content.includes("pnpm run check:runtime-review"), `${path} must mention pnpm run check:runtime-review`, failures);
  assertCondition(content.includes("pnpm run check:safe-backlog"), `${path} must mention pnpm run check:safe-backlog`, failures);
  assertCondition(content.includes("pnpm run check:managed-recipes"), `${path} must mention pnpm run check:managed-recipes`, failures);
  assertCondition(content.includes("pnpm run check:maintenance-action-plan"), `${path} must mention pnpm run check:maintenance-action-plan`, failures);
  assertCondition(content.includes("pnpm run check:development-runway"), `${path} must mention pnpm run check:development-runway`, failures);
  assertCondition(content.includes("pnpm run check:delivery-readiness"), `${path} must mention pnpm run check:delivery-readiness`, failures);
  assertCondition(content.includes("pnpm run check:linux-install-lane"), `${path} must mention pnpm run check:linux-install-lane`, failures);
  assertCondition(content.includes("pnpm run check:clean-install-boundary"), `${path} must mention pnpm run check:clean-install-boundary`, failures);
  assertCondition(content.includes("pnpm run check:maintenance-readiness"), `${path} must mention pnpm run check:maintenance-readiness`, failures);
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
