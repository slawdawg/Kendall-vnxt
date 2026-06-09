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
  "docs/fresh-vm-acceptance-checklist.md": readWorkspaceFile("docs/fresh-vm-acceptance-checklist.md"),
  "docs/bootstrap-windows-vm.md": readWorkspaceFile("docs/bootstrap-windows-vm.md"),
  "docs/handoffs/current.md": readWorkspaceFile("docs/handoffs/current.md"),
  "docs/handoffs/codex-fresh-vm-orientation-2026-06-08.md": readWorkspaceFile(
    "docs/handoffs/codex-fresh-vm-orientation-2026-06-08.md",
  ),
  "docs/stories/index.md": readWorkspaceFile("docs/stories/index.md"),
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
  "docs/fresh-vm-acceptance-checklist.md",
  "docs/bootstrap-windows-vm.md",
  "docs/handoffs/current.md",
  "docs/handoffs/codex-fresh-vm-orientation-2026-06-08.md",
];

for (const path of currentRunbooks) {
  const content = files[path];
  assertCondition(content.includes("pnpm run check"), `${path} must mention pnpm run check`, failures);
  assertCondition(content.includes("pnpm run check:docs"), `${path} must mention pnpm run check:docs`, failures);
  assertCondition(content.includes("pnpm run check:e2e-report"), `${path} must mention pnpm run check:e2e-report`, failures);
  assertCondition(content.includes("pnpm run check:reports"), `${path} must mention pnpm run check:reports`, failures);
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
  files["docs/handoffs/current.md"].includes("runbook verification"),
  "current handoff must mention runbook verification",
  failures,
);
assertCondition(
  files["docs/stories/index.md"].includes("3-29-runbook-verification-alignment.md"),
  "Story index must reference Story 3.29 runbook verification alignment",
  failures,
);
assertCondition(
  files["services/supervisor/src/supervisor/application/service.py"].includes("pnpm run check:runbooks"),
  "Verification readiness report must surface pnpm run check:runbooks",
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
