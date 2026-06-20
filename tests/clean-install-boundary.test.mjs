import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateCleanInstallBoundary,
  evaluateCleanInstallContent,
  evaluateLinuxInstallPackage,
  formatBoundaryReport,
  loadPlanningDocManifest,
  validateLinuxInstallPackageEntries,
  validatePlanningDocManifest,
  validateRequiredSourcePaths,
} from "../scripts/check-clean-install-boundary.mjs";

const testManifest = {
  schemaVersion: 1,
  policy: "Top-level BMAD planning and research work products are local-only.",
  status: "active-hard-fail",
  owner: "test",
  targetRemovalCondition: "hard fail when tracked",
  forbiddenPrefixes: ["docs/goals/", "docs/handoffs/", "docs/research/", "docs/prds/", "docs/stories/"],
  localOnlyEntryCount: 0,
  entries: [],
};

function violationIds(paths) {
  return evaluateCleanInstallBoundary(paths, { manifest: testManifest }).violations.map((violation) => violation.ruleId);
}

test("allows normal tracked source and supported Linux install files", () => {
  const result = evaluateCleanInstallBoundary([
    "package.json",
    "scripts/bootstrap-linux.sh",
    "scripts/check-linux-bootstrap.mjs",
    "services/supervisor/src/supervisor/application/service.py",
    "docs/workflows/linux-primary-development-runbook.md",
  ], { manifest: testManifest });

  assert.deepEqual(result.violations, []);
});

test("rejects tracked BMAD output", () => {
  assert.deepEqual(violationIds(["_bmad-output/foo.md"]), ["bmad-output-tracked"]);
});

test("rejects tracked local user configuration", () => {
  assert.deepEqual(violationIds(["_bmad/config.user.yaml"]), ["local-user-config-tracked"]);
  assert.deepEqual(violationIds(["_bmad/config.user.toml"]), ["local-user-config-tracked"]);
  assert.deepEqual(violationIds(["_bmad/custom/config.user.toml"]), ["local-user-config-tracked"]);
  assert.deepEqual(violationIds(["tools/local.user.toml"]), ["local-user-config-tracked"]);
});

test("rejects tracked generated BMAD reports", () => {
  assert.deepEqual(violationIds(["skills/reports/module-validation-knx-2026-06-01.md"]), [
    "bmad-generated-report-tracked",
    "generated-binary-artifact-tracked",
  ]);
  assert.deepEqual(violationIds(["skills/generated-example/SKILL.md"]), [
    "bmad-generated-report-tracked",
  ]);
});

test("rejects tracked generated skill decision logs and validation reports", () => {
  assert.deepEqual(violationIds([".agents/skills/knx-profile-setup/.decision-log.md"]), [
    "skill-decision-log-tracked",
  ]);
  assert.deepEqual(violationIds([".agents/skills/bmad-testarch-ci/validation-report-20260127-102401.md"]), [
    "skill-validation-report-tracked",
  ]);
});

test("rejects tracked generated Claude Code skill targets", () => {
  assert.deepEqual(violationIds([".claude/skills/bmad-help/SKILL.md"]), ["claude-skills-generated-target"]);
});

test("rejects tracked generated Claude plugin marketplace targets", () => {
  assert.deepEqual(violationIds([".agents/skills/.claude-plugin/marketplace.json"]), [
    "claude-plugin-generated-target",
  ]);
});

test("rejects local KNX decision memory", () => {
  assert.deepEqual(violationIds(["_bmad/memory/knx/decisions/local-example-2026-06-19.md"]), [
    "local-knx-decision",
    "local-knx-memory",
  ]);
});

test("rejects local KNX memory and runtime evidence", () => {
  assert.deepEqual(violationIds(["_bmad/memory/knx/profile.md"]), ["local-knx-memory"]);
  assert.deepEqual(violationIds(["_bmad/memory/knx/runtime/handoffs/example.md"]), ["local-knx-memory"]);
});

test("rejects unsupported Windows and PowerShell install assets", () => {
  assert.deepEqual(violationIds(["scripts/windows/Start-KendallNxtSupervisor.ps1"]), [
    "unsupported-windows-install",
  ]);
  assert.deepEqual(violationIds(["scripts/bootstrap-windows.ps1"]), ["unsupported-windows-install"]);
  assert.deepEqual(violationIds(["scripts/start.cmd"]), ["unsupported-windows-install"]);
  assert.deepEqual(violationIds(["docs/bootstrap-windows-vm.md"]), ["unsupported-windows-install"]);
});

test("rejects active Windows execution branches in scripts and tests", () => {
  assert.deepEqual(
    evaluateCleanInstallContent(
      [
        "scripts/run-supervisor-tests.mjs",
        "tests/e2e/dashboard.spec.ts",
        "services/supervisor/src/supervisor/application/service.py",
        "services/supervisor/tests/integration/test_supervisor_flow.py",
        "playwright.config.ts",
        "scripts/setup-e2e.mjs",
        "tests/workspace-command-resolution.test.mjs",
        "scripts/github-sync-doctor.mjs",
        "docs/workflows/platform-decision-boundary.md",
      ],
      (path) =>
        ({
          "scripts/run-supervisor-tests.mjs": 'const command = process.platform === "win32" ? "cmd.exe" : "uv";',
          "tests/e2e/dashboard.spec.ts": "const pythonPath = 'services/supervisor/.venv/Scripts/python.exe';",
          "services/supervisor/src/supervisor/application/service.py": 'command = "cmd.exe" if os.platform() == "win32" else "uv"',
          "services/supervisor/tests/integration/test_supervisor_flow.py": 'gh_cmd_shim = shim_dir / "gh.cmd"',
          "playwright.config.ts": 'const command = process.platform === "win32" ? "cmd.exe" : "uv";',
          "scripts/setup-e2e.mjs": 'const shell = os.platform() === "win32" ? "powershell.exe" : "bash";',
          "tests/workspace-command-resolution.test.mjs": 'const command = process.platform !== "linux" ? "pwsh" : "bash";',
          "scripts/github-sync-doctor.mjs": "const isWindows = true;",
          "docs/workflows/platform-decision-boundary.md": "Windows, PowerShell, and WSL2 are unsupported.",
        })[path],
    ).map((violation) => violation.ruleId),
    [
      "unsupported-windows-execution-branch",
      "unsupported-windows-execution-branch",
      "unsupported-windows-execution-branch",
      "unsupported-windows-execution-branch",
      "unsupported-windows-execution-branch",
      "unsupported-windows-execution-branch",
      "unsupported-windows-execution-branch",
      "unsupported-windows-execution-branch",
    ],
  );
});

test("rejects Windows user-profile session paths in runtime source", () => {
  assert.deepEqual(
    evaluateCleanInstallContent(
      [
        "services/supervisor/src/supervisor/domain/subscription_launch.py",
        "services/supervisor/tests/integration/test_routing_preview.py",
      ],
      (path) =>
        ({
          "services/supervisor/src/supervisor/domain/subscription_launch.py": '"AppData/Roaming/Claude"',
          "services/supervisor/tests/integration/test_routing_preview.py": '"AppData/Local/Google/Chrome/User Data"',
        })[path],
    ).map((violation) => violation.ruleId),
    ["unsupported-windows-session-path", "unsupported-windows-session-path"],
  );
});

test("rejects unsupported WSL workflow assets", () => {
  assert.deepEqual(violationIds(["docs/workflows/wsl-command-boundary.md"]), ["unsupported-wsl-install"]);
});

test("rejects tracked Linux install planning artifacts", () => {
  assert.deepEqual(violationIds(["docs/linux-install/planning/lane-status.md"]), ["linux-install-planning-artifact"]);
  assert.deepEqual(violationIds(["docs/linux-install/planning/stories/1-1-example.md"]), ["linux-install-planning-artifact"]);
  assert.deepEqual(violationIds(["docs/linux-install/planning/reviews/pre-pr-code-review.md"]), [
    "linux-install-planning-artifact",
  ]);
});

test("rejects tracked KNX cleanup workflow artifacts", () => {
  assert.deepEqual(violationIds(["docs/workflows/knx-runtime-cleanup-execution-report-2026-06-19.md"]), [
    "knx-cleanup-workflow-artifact",
  ]);
});

test("rejects tracked mise implementation evidence artifacts", () => {
  assert.deepEqual(violationIds(["docs/workflows/mise-normal-workflow-implementation-evidence-2026-06-18.md"]), [
    "mise-implementation-evidence-artifact",
  ]);
});

test("rejects tracked local platform research artifacts", () => {
  assert.deepEqual(violationIds(["docs/platform-evaluation-sprint.md"]), ["local-platform-research-artifact"]);
});

test("rejects tracked Linux install local instance artifacts", () => {
  assert.deepEqual(violationIds(["docs/linux-install/bob-next-steps.md"]), ["linux-install-local-instance-artifact"]);
  assert.deepEqual(violationIds(["docs/linux-install/evidence/fresh-vm-full-check-2026-06-16.md"]), [
    "linux-install-local-instance-artifact",
  ]);
  assert.deepEqual(violationIds(["docs/linux-install/evidence/new-vm-validation-20260619.json"]), [
    "linux-install-local-instance-artifact",
  ]);
  assert.deepEqual(
    violationIds(["docs/linux-install/evidence/goal-runs/20260618T200827Z/blockers/fresh-host-required.json"]),
    ["linux-install-local-instance-artifact"],
  );
  assert.deepEqual(violationIds(["docs/linux-install/evidence/fixtures/local-evidence-fixture.json"]), [
    "linux-install-local-instance-artifact",
  ]);
});

test("requires gitignore coverage for generated Linux install evidence", () => {
  assert.deepEqual(
    evaluateCleanInstallContent(
      [".gitignore"],
      () => "docs/linux-install/planning/\n",
    ).map((violation) => violation.ruleId),
    ["linux-install-evidence-ignore-missing", "local-artifact-ignore-missing"],
  );
  assert.deepEqual(
    evaluateCleanInstallContent(
      [".gitignore"],
      () => [
        "_bmad-output/",
        "_bmad/config.user.yaml",
        "_bmad/config.user.toml",
        "_bmad/custom/config.user.toml",
        "*.user.toml",
        "docs/goals/",
        "docs/handoffs/",
        "docs/research/",
        "docs/prds/",
        "docs/stories/",
        "skills/",
        ".claude/skills/",
        ".agents/skills/.claude-plugin/",
        ".agents/skills/**/.decision-log.md",
        ".agents/skills/**/validation-report-*.md",
        "_bmad/memory/knx/",
        "docs/workflows/knx-*-2026-06-19.md",
        "docs/workflows/mise-normal-workflow-implementation-evidence-2026-06-18.md",
        "docs/linux-install/evidence/*",
        "!docs/linux-install/evidence/",
        "!docs/linux-install/evidence/schema.md",
      ].join("\n"),
    ).map((violation) => violation.ruleId),
    [],
  );
  assert.deepEqual(
    evaluateCleanInstallContent(
      [".gitignore"],
      () => [
        "_bmad-output/",
        "_bmad/config.user.yaml",
        "_bmad/config.user.toml",
        "_bmad/custom/config.user.toml",
        "*.user.toml",
        "docs/goals/",
        "docs/handoffs/",
        "docs/research/",
        "docs/prds/",
        "docs/stories/",
        "skills/",
        ".claude/skills/",
        ".agents/skills/.claude-plugin/",
        ".agents/skills/**/.decision-log.md",
        ".agents/skills/**/validation-report-*.md",
        "_bmad/memory/knx/",
        "docs/workflows/knx-*-2026-06-19.md",
        "docs/workflows/mise-normal-workflow-implementation-evidence-2026-06-18.md",
        "docs/linux-install/evidence/*",
        "!docs/linux-install/evidence/",
        "!docs/linux-install/evidence/schema.md",
        "!docs/linux-install/evidence/fixtures/",
      ].join("\n"),
    ).map((violation) => violation.ruleId),
    ["linux-install-evidence-ignore-missing"],
  );
});

test("requires gitignore coverage for local BMAD and generated skill artifacts", () => {
  assert.deepEqual(
    evaluateCleanInstallContent(
      [".gitignore"],
      () => [
        "docs/linux-install/evidence/*",
        "!docs/linux-install/evidence/",
        "!docs/linux-install/evidence/schema.md",
      ].join("\n"),
    ).map((violation) => violation.ruleId),
    ["local-artifact-ignore-missing"],
  );
  assert.deepEqual(
    evaluateCleanInstallContent(
      [".gitignore"],
      () => [
        "_bmad-output/",
        "_bmad/config.user.yaml",
        "_bmad/config.user.toml",
        "_bmad/custom/config.user.toml",
        "*.user.toml",
        "docs/goals/",
        "docs/handoffs/",
        "docs/research/",
        "docs/prds/",
        "docs/stories/",
        "skills/",
        ".claude/skills/",
        ".agents/skills/.claude-plugin/",
        ".agents/skills/**/.decision-log.md",
        ".agents/skills/**/validation-report-*.md",
        "_bmad/memory/knx/",
        "docs/workflows/knx-*-2026-06-19.md",
        "docs/workflows/mise-normal-workflow-implementation-evidence-2026-06-18.md",
        "docs/linux-install/evidence/*",
        "!docs/linux-install/evidence/",
        "!docs/linux-install/evidence/schema.md",
      ].join("\n"),
    ).map((violation) => violation.ruleId),
    [],
  );
});

test("rejects local artifacts inside the Linux install package", () => {
  const trackedPaths = [
    "docs/linux-install.zip",
    "docs/linux-install/install-playbook.md",
    "docs/linux-install/evidence/schema.md",
  ];

  assert.deepEqual(
    validateLinuxInstallPackageEntries(
      [
        "install-playbook.md",
        "evidence/schema.md",
        "bob-next-steps.md",
        "evidence/fresh-vm-full-check-2026-06-16.md",
        "evidence/fixtures/local-evidence-fixture.json",
        "evidence/goal-runs/run/blockers/fresh-host-required.json",
      ],
      trackedPaths,
    ),
    [
      "bob-next-steps.md is local Linux install evidence or planning state and must not be packaged",
      "evidence/fresh-vm-full-check-2026-06-16.md is local Linux install evidence or planning state and must not be packaged",
      "evidence/fixtures/local-evidence-fixture.json is local Linux install evidence or planning state and must not be packaged",
      "evidence/goal-runs/run/blockers/fresh-host-required.json is local Linux install evidence or planning state and must not be packaged",
    ],
  );
});

test("rejects Linux install package entries without tracked source files", () => {
  assert.deepEqual(
    validateLinuxInstallPackageEntries(
      ["install-playbook.md", "untracked-extra.md"],
      ["docs/linux-install.zip", "docs/linux-install/install-playbook.md"],
    ),
    ["untracked-extra.md does not correspond to tracked source file docs/linux-install/untracked-extra.md"],
  );
});

test("rejects Linux install packages missing tracked source files", () => {
  assert.deepEqual(
    validateLinuxInstallPackageEntries(
      ["install-playbook.md"],
      [
        "docs/linux-install.zip",
        "docs/linux-install/install-playbook.md",
        "docs/linux-install/troubleshooting.md",
      ],
    ),
    ["troubleshooting.md is tracked source but missing from docs/linux-install.zip"],
  );
});

test("reports unreadable Linux install package archives", () => {
  assert.deepEqual(
    evaluateLinuxInstallPackage(["docs/linux-install.zip"], () => Buffer.from("not a zip")).map(
      (violation) => violation.ruleId,
    ),
    ["linux-install-package-local-artifact"],
  );
});

test("rejects tracked content containing Bob-specific local paths", () => {
  const localUser = ["slaw", "dawg"].join("_");
  const paths = ["docs/source-owned.md", "docs/local-evidence.md", "docs/windows-path.md"];
  const content = {
    "docs/source-owned.md": "This source doc is portable.",
    "docs/local-evidence.md": `uv cache path: /home/${localUser}/.cache/uv`,
    "docs/windows-path.md": `workspace path: C:/Users/${localUser}/Kendall_Nxt`,
  };

  assert.deepEqual(
    evaluateCleanInstallContent(paths, (path) => content[path]).map((violation) => violation.ruleId),
    ["bob-local-path-content", "bob-local-path-content"],
  );
});

test("rejects Bob-specific defaults in shared BMAD config", () => {
  assert.deepEqual(
    evaluateCleanInstallContent(["_bmad/core/config.yaml"], () => "user_name: Bob\n").map((violation) => violation.ruleId),
    ["bob-specific-bmad-config"],
  );
  assert.deepEqual(
    evaluateCleanInstallContent(["_bmad/config.yaml"], () => "knx:\n  knx_user_label: 'Primary user: Bob'\n").map(
      (violation) => violation.ruleId,
    ),
    ["bob-specific-bmad-config"],
  );
});

test("rejects personal author metadata in packages", () => {
  assert.deepEqual(
    evaluateCleanInstallContent(
      ["services/supervisor/pyproject.toml"],
      () => '[project]\nauthors = [{ name = "Bob", email = "axeshock@gmail.com" }]\n',
    ).map((violation) => violation.ruleId),
    ["personal-package-author"],
  );
  assert.deepEqual(
    evaluateCleanInstallContent(
      ["package.json"],
      () => '{ "author": { "name": "Bob", "email": "axeshock@gmail.com" } }\n',
    ).map((violation) => violation.ruleId),
    ["personal-package-author"],
  );
});

test("rejects personal GitHub auth state without blocking repository URLs", () => {
  assert.deepEqual(
    evaluateCleanInstallContent(
      ["docs/workflows/linux-primary-development-runbook.md"],
      () => "`gh auth status` passes as `slawdawg`.\n",
    ).map((violation) => violation.ruleId),
    ["personal-github-auth-state"],
  );
  assert.deepEqual(
    evaluateCleanInstallContent(
      ["services/supervisor/tests/integration/test_supervisor_flow.py"],
      () => "Logged in to github.com account slawdawg (keyring)\n",
    ).map((violation) => violation.ruleId),
    ["personal-github-auth-state"],
  );
  assert.deepEqual(
    evaluateCleanInstallContent(
      ["docs/linux-install/install-playbook.md"],
      () => "https://github.com/slawdawg/Kendall-vnxt.git\n",
    ).map((violation) => violation.ruleId),
    [],
  );
});

test("rejects secret and environment files", () => {
  assert.deepEqual(violationIds([".env"]), ["secret-or-env-tracked"]);
  assert.deepEqual(violationIds([".env.local"]), ["secret-or-env-tracked"]);
  assert.deepEqual(violationIds(["config/private.key"]), ["secret-or-env-tracked"]);
  assert.deepEqual(violationIds(["fixtures/provider-payload.json"]), ["secret-or-env-tracked"]);
  assert.deepEqual(violationIds(["docs/credentials.md"]), ["secret-or-env-tracked"]);
  assert.deepEqual(violationIds(["docs/provider-payload.md"]), ["secret-or-env-tracked"]);
});

test("rejects generated binary artifacts and output directories", () => {
  assert.deepEqual(violationIds(["debug/app.log"]), ["generated-binary-artifact-tracked"]);
  assert.deepEqual(violationIds(["services/supervisor/local.db"]), ["generated-binary-artifact-tracked"]);
  assert.deepEqual(violationIds(["docs/local-evidence.zip"]), ["generated-binary-artifact-tracked"]);
  assert.deepEqual(violationIds(["apps/dashboard/playwright-report/index.html"]), [
    "generated-binary-artifact-tracked",
  ]);
  assert.deepEqual(violationIds(["docs/linux-install.zip"]), []);
});

test("rejects dependency folders, tool caches, editor state, and local runtime state", () => {
  assert.deepEqual(violationIds(["node_modules/.pnpm/lock.yaml"]), ["source-control-noise-tracked"]);
  assert.deepEqual(violationIds(["apps/dashboard/.next/build-manifest.json"]), ["source-control-noise-tracked"]);
  assert.deepEqual(violationIds(["services/supervisor/.venv/pyvenv.cfg"]), ["source-control-noise-tracked"]);
  assert.deepEqual(violationIds(["services/supervisor/tests/__pycache__/test_api.cpython-312.pyc"]), [
    "source-control-noise-tracked",
  ]);
  assert.deepEqual(violationIds([".vscode/settings.json"]), ["source-control-noise-tracked"]);
  assert.deepEqual(violationIds(["runtime/.batch_timer_state.json"]), ["source-control-noise-tracked"]);
  assert.deepEqual(violationIds(["apps/dashboard/next-env.d.ts"]), ["source-control-noise-tracked"]);
  assert.deepEqual(violationIds(["apps/dashboard/.vercel/project.json"]), ["source-control-noise-tracked"]);
  assert.deepEqual(violationIds(["apps/dashboard/.pnp.cjs"]), ["source-control-noise-tracked"]);
  assert.deepEqual(violationIds(["apps/dashboard/.yarn/cache/example.zip"]), [
    "generated-binary-artifact-tracked",
    "source-control-noise-tracked",
  ]);
  assert.deepEqual(violationIds(["apps/dashboard/out/index.html"]), ["source-control-noise-tracked"]);
  assert.deepEqual(violationIds(["apps/dashboard/tsconfig.tsbuildinfo"]), ["source-control-noise-tracked"]);
});

test("allows non-secret environment templates", () => {
  assert.deepEqual(violationIds([".env.example"]), []);
  assert.deepEqual(violationIds(["config/.env.sample"]), []);
  assert.deepEqual(violationIds(["services/supervisor/.env.template"]), []);
});

test("reports all violations instead of stopping at the first", () => {
  const result = evaluateCleanInstallBoundary([
    "_bmad-output/foo.md",
    "_bmad/memory/knx/decisions/local-git-commit-2026-06-01.md",
    "scripts/windows/Install-KendallNxtStartup.ps1",
    "docs/workflows/wsl-github-credential-options.md",
  ]);

  assert.deepEqual(
    result.violations.map((violation) => violation.ruleId),
    [
      "bmad-output-tracked",
      "local-knx-decision",
      "local-knx-memory",
      "unsupported-windows-install",
      "secret-or-env-tracked",
      "unsupported-wsl-install",
    ],
  );

  const report = formatBoundaryReport(result);
  assert.match(report, /bmad-output-tracked: _bmad-output\/foo\.md/);
  assert.match(report, /unsupported-wsl-install: docs\/workflows\/wsl-github-credential-options\.md/);
});

test("rejects BMAD epic and story artifacts under product docs", () => {
  assert.deepEqual(violationIds(["docs/product/epic-6-synthetic-dev-console-label-copy.md"]), [
    "product-planning-work-artifact",
  ]);
  assert.deepEqual(violationIds(["docs/product/story-label-copy.md"]), ["product-planning-work-artifact"]);
  assert.deepEqual(violationIds(["docs/product/kendall-vnxt-orchestrator-product-brief-2026-06-10.md"]), []);
});

test("rejects new top-level planning-heavy docs", () => {
  const result = evaluateCleanInstallBoundary(
    [
      "docs/goals/new.md",
      "docs/handoffs/new.md",
      "docs/research/new.md",
      "docs/prds/new.md",
      "docs/stories/new.md",
    ],
    { manifest: testManifest },
  );

  assert.deepEqual(
    result.violations.map((violation) => violation.ruleId),
    [
      "planning-doc-local-work-tracked",
      "planning-doc-local-work-tracked",
      "planning-doc-local-work-tracked",
      "planning-doc-local-work-tracked",
      "planning-doc-local-work-tracked",
    ],
  );
});

test("rejects malformed planning doc manifest entries", () => {
  const badManifest = {
    ...testManifest,
    localOnlyEntryCount: 1,
    entries: [{ path: "docs/stories/local-only-story.md" }],
  };

  assert.match(validatePlanningDocManifest(badManifest).join("\n"), /entries must remain empty/);
});

test("rejects non-array planning doc manifest entries", () => {
  const badManifest = {
    ...testManifest,
    localOnlyEntryCount: 0,
    entries: {},
  };

  assert.match(validatePlanningDocManifest(badManifest).join("\n"), /entries must be an array/);
});

test("rejects planning doc manifests that omit required prefixes", () => {
  const badManifest = {
    ...testManifest,
    forbiddenPrefixes: ["docs/goals/", "docs/handoffs/", "docs/research/", "docs/stories/"],
  };

  assert.match(validatePlanningDocManifest(badManifest).join("\n"), /forbiddenPrefixes must exactly match/);
  assert.deepEqual(violationIds(["docs/prds/new.md"]), ["planning-doc-local-work-tracked"]);
});

test("rejects any planning doc manifest entry", () => {
  const badManifest = {
    ...testManifest,
    localOnlyEntryCount: 1,
    entries: [
      {
        path: "docs/stories/local-only-story.md",
      },
    ],
  };

  assert.match(validatePlanningDocManifest(badManifest).join("\n"), /entries must remain empty/);
});

test("rejects planning doc manifest entries because the hard-fail list must stay empty", () => {
  const badManifest = {
    ...testManifest,
    localOnlyEntryCount: 1,
    entries: [
      {
        path: "docs/stories/new-local-doc-attempt.md",
      },
    ],
  };

  assert.match(
    validatePlanningDocManifest(badManifest).join("\n"),
    /entries must remain empty/,
  );
});

test("default planning doc manifest tracks the current hard-fail state", () => {
  const manifest = loadPlanningDocManifest();

  assert.equal(manifest.status, "active-hard-fail");
  assert.equal(manifest.localOnlyEntryCount, 0);
  assert.deepEqual(manifest.entries, []);
  assert.deepEqual(manifest.forbiddenPrefixes, [
    "docs/goals/",
    "docs/handoffs/",
    "docs/research/",
    "docs/prds/",
    "docs/stories/",
  ]);
});

test("source-owned workflow contracts replace removed local planning artifacts", () => {
  assert.deepEqual(
    validateRequiredSourcePaths([
      "docs/workflows/current-session-runbook.md",
      "docs/workflows/planning-doc-clean-install-boundary.md",
      "docs/workflows/product-requirements-boundary.md",
      "docs/workflows/implementation-evidence-boundary.md",
      "docs/workflows/platform-decision-boundary.md",
    ]),
    [],
  );
  assert.deepEqual(validateRequiredSourcePaths(["docs/handoffs/current.md"]).map((failure) => failure.path), [
    "docs/workflows/current-session-runbook.md",
    "docs/workflows/planning-doc-clean-install-boundary.md",
    "docs/workflows/product-requirements-boundary.md",
    "docs/workflows/implementation-evidence-boundary.md",
    "docs/workflows/platform-decision-boundary.md",
  ]);
});
