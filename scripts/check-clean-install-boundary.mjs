import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const planningDocManifestPath = "docs/workflows/planning-doc-clean-install-boundary.json";

const PLANNING_DOC_RULE_ID = "planning-doc-local-work-tracked";
const PLANNING_DOC_MANIFEST_RULE_ID = "planning-doc-manifest-invalid";
const LINUX_INSTALL_ZIP_RULE_ID = "linux-install-package-local-artifact";

const HARD_FAIL_RULES = [
  {
    id: "bmad-output-tracked",
    description: "BMAD output is local planning/runtime state and must not be tracked.",
    test: (path) => path === "_bmad-output" || path.startsWith("_bmad-output/"),
  },
  {
    id: "local-user-config-tracked",
    description: "Local user configuration is operator state and must not be tracked.",
    test: (path) =>
      path === "_bmad/config.user.yaml" ||
      path === "_bmad/config.user.toml" ||
      path === "_bmad/custom/config.user.toml" ||
      basename(path).endsWith(".user.toml"),
  },
  {
    id: "bmad-generated-report-tracked",
    description: "Root skills output is generated local BMAD state and must not be tracked.",
    test: (path) => path === "skills" || path.startsWith("skills/"),
  },
  {
    id: "skill-decision-log-tracked",
    description: "Generated skill decision logs are local BMAD output and must not be tracked.",
    test: (path) => /^\.agents\/skills\/.*\/\.decision-log\.md$/.test(path),
  },
  {
    id: "skill-validation-report-tracked",
    description: "Generated skill validation reports are local BMAD output and must not be tracked.",
    test: (path) => /^\.agents\/skills\/.*\/validation-report-[^/]+\.md$/.test(path),
  },
  {
    id: "claude-skills-generated-target",
    description: "Claude Code skill installs are generated local IDE targets and must not be tracked.",
    test: (path) => path === ".claude/skills" || path.startsWith(".claude/skills/"),
  },
  {
    id: "claude-plugin-generated-target",
    description: "Claude plugin marketplace manifests are generated local distribution targets and must not be tracked.",
    test: (path) => path === ".agents/skills/.claude-plugin" || path.startsWith(".agents/skills/.claude-plugin/"),
  },
  {
    id: "local-knx-decision",
    description: "Local KNX decision memory is operator/local state and must not be tracked.",
    test: (path) => /^_bmad\/memory\/knx\/decisions\/local-[^/]+\.md$/.test(path),
  },
  {
    id: "local-knx-memory",
    description: "Local KNX memory and runtime evidence are operator/local state and must not be tracked.",
    test: (path) => path === "_bmad/memory/knx" || path.startsWith("_bmad/memory/knx/"),
  },
  {
    id: "secret-or-env-tracked",
    description: "Environment, secret, and credential-like files must not be tracked.",
    test: (path) => {
      const name = basename(path);
      const credentialLikeName = /(^|[-_.])(secret|secrets|credential|credentials|provider-payload)([-_.]|$)/i.test(name);
      if (/\.md$/i.test(name) && !credentialLikeName) {
        return false;
      }
      if (/^\.env\.(example|sample|template)$/i.test(name)) {
        return false;
      }
      return (
        name === ".env" ||
        name.startsWith(".env.") ||
        /\.(pem|key|p12|pfx)$/i.test(name) ||
        credentialLikeName
      );
    },
  },
  {
    id: "generated-binary-artifact-tracked",
    description: "Generated archives, databases, logs, backups, and test outputs must not be tracked unless explicitly source-owned.",
    test: (path) =>
      path !== "docs/linux-install.zip" &&
      (
        /\.(zip|tar|tgz|gz|7z|rar|db|sqlite|sqlite3|log|tmp|temp|bak|orig|rej)$/i.test(path) ||
        /(^|\/)(dist|build|coverage|playwright-report|test-results|reports|generated|outputs?)\//i.test(path)
      ),
  },
  {
    id: "source-control-noise-tracked",
    description: "Dependency folders, tool caches, editor state, and local runtime state must not be tracked.",
    test: (path) =>
      path === ".DS_Store" ||
      path.endsWith("/.DS_Store") ||
      path === "Thumbs.db" ||
      path.endsWith("/Thumbs.db") ||
      path === "runtime/.batch_timer_state.json" ||
      path === "next-env.d.ts" ||
      path.endsWith("/next-env.d.ts") ||
      /(^|\/)\.pnp(\..*)?$/i.test(path) ||
      /\.tsbuildinfo$/i.test(path) ||
      /(^|\/)(node_modules|\.next|\.turbo|\.venv|venv|__pycache__|\.pytest_cache|\.mypy_cache|\.ruff_cache|\.data|\.idea|\.vscode|\.yarn|\.vercel|out)(\/|$)/.test(path) ||
      /(^|\/)\.coverage$/.test(path) ||
      /\.py[cod]$/i.test(path),
  },
  {
    id: "bob-specific-bmad-config",
    description: "Shared BMAD config must not contain operator-specific personal defaults.",
    test: (path) => /^_bmad\/(?:config|core\/config|bmm\/config|bmb\/config|tea\/config)\.ya?ml$/i.test(path),
    contentTest: (text) => text.includes("user_name: Bob") || text.includes("Primary user: Bob"),
  },
  {
    id: "personal-package-author",
    description: "Package metadata must not contain personal local-install author identities.",
    test: (path) => /(^|\/)pyproject\.toml$/i.test(path) || /(^|\/)package\.json$/i.test(path),
    contentTest: (text) => /(?:name\s*=|["']name["']\s*:)\s*"Bob"/.test(text) || /axeshock@gmail\.com/i.test(text),
  },
  {
    id: "personal-github-auth-state",
    description: "Tracked files must not describe the operator's local GitHub login account state.",
    test: (path) =>
      path !== "scripts/check-clean-install-boundary.mjs" &&
      path !== "tests/clean-install-boundary.test.mjs" &&
      /\.(md|mjs|js|ts|tsx|py|json|ya?ml|toml)$/i.test(path),
    contentTest: (text) =>
      [
        "gh auth status` passes as `slawdawg`",
        "Logged in to github.com account slawdawg",
      ].some((marker) => text.includes(marker)),
  },
  {
    id: "unsupported-windows-install",
    description: "Windows and PowerShell install/startup assets are unsupported and must not be tracked.",
    test: (path) =>
      path === "docs/bootstrap-windows-vm.md" ||
      path === "docs/fresh-vm-acceptance-checklist.md" ||
      path === "scripts/bootstrap-windows.ps1" ||
      path === "scripts/configure-vm-codex-guardrails.ps1" ||
      path === "scripts/start-dashboard-dev.ps1" ||
      path.startsWith("scripts/windows/") ||
      /^scripts\/.*\.(ps1|psm1|psd1|cmd|bat|vbs)$/i.test(path),
  },
  {
    id: "unsupported-windows-execution-branch",
    description: "Active scripts and tests must not carry Windows command-resolution branches while Windows is unsupported.",
    test: (path) =>
      path !== "scripts/check-clean-install-boundary.mjs" &&
      path !== "scripts/check-linux-install-lane.mjs" &&
      path !== "tests/clean-install-boundary.test.mjs" &&
      (
        /^scripts\/.*\.(mjs|js|ts)$/i.test(path) ||
        /^tests\/.*\.(mjs|js|ts|tsx)$/i.test(path) ||
        /^services\/supervisor\/src\/.*\.py$/i.test(path) ||
        /^services\/supervisor\/tests\/.*\.py$/i.test(path) ||
        path === "playwright.config.ts"
      ),
    contentTest: (text) =>
      [
        'process.platform === "win32"',
        "process.platform === 'win32'",
        'process.platform !== "linux"',
        "process.platform !== 'linux'",
        'os.platform() === "win32"',
        "os.platform() === 'win32'",
        "isWindows",
        "windowsHide",
        "ComSpec",
        "cmd.exe",
        "taskkill",
        "where.exe",
        "pwsh",
        "powershell.exe",
        "PowerShell",
        ".cmd",
        ".CMD",
        "Scripts/python.exe",
        "uv.exe",
        "dpapi",
        "protecteddata",
        "key not valid for use in specified state",
      ].some((marker) => text.includes(marker)),
  },
  {
    id: "unsupported-windows-session-path",
    description: "Runtime source must not carry Windows user-profile session or credential paths while Windows is unsupported.",
    test: (path) =>
      path !== "scripts/check-clean-install-boundary.mjs" &&
      path !== "tests/clean-install-boundary.test.mjs" &&
      (
        /^services\/supervisor\/src\/.*\.(py|json)$/i.test(path) ||
        /^services\/supervisor\/tests\/.*\.py$/i.test(path) ||
        /^scripts\/.*\.(mjs|js|ts)$/i.test(path) ||
        /^tests\/.*\.(mjs|js|ts|tsx)$/i.test(path)
      ),
    contentTest: (text) => ["AppData/", "AppData\\", "%APPDATA%", "%LOCALAPPDATA%"].some((marker) => text.includes(marker)),
  },
  {
    id: "unsupported-wsl-install",
    description: "WSL install/workflow assets are unsupported and must not be tracked.",
    test: (path) => path === "docs/workflows/wsl-command-boundary.md" || path === "docs/workflows/wsl-github-credential-options.md",
  },
  {
    id: "linux-install-planning-artifact",
    description: "Linux install BMAD planning artifacts are local workspace state and must not be tracked.",
    test: (path) => path === "docs/linux-install/planning" || path.startsWith("docs/linux-install/planning/"),
  },
  {
    id: "knx-cleanup-workflow-artifact",
    description: "KNX cleanup inventories, evidence packets, approvals, and reports are local workspace artifacts.",
    test: (path) => /^docs\/workflows\/knx-.*-2026-06-19\.md$/.test(path),
  },
  {
    id: "mise-implementation-evidence-artifact",
    description: "Mise implementation evidence packets are local workspace artifacts.",
    test: (path) => path === "docs/workflows/mise-normal-workflow-implementation-evidence-2026-06-18.md",
  },
  {
    id: "local-platform-research-artifact",
    description: "Platform evaluation research packets are local workspace state and must not be tracked.",
    test: (path) => path === "docs/platform-evaluation-sprint.md",
  },
  {
    id: "product-planning-work-artifact",
    description: "BMAD epic and story work products must not be tracked under source-owned product docs.",
    test: (path) => /^docs\/product\/(?:epic|story)-[^/]+\.md$/i.test(path),
  },
  {
    id: "linux-install-local-instance-artifact",
    description: "Linux install local lab notes and raw VM evidence are local workspace state and must not be tracked.",
    test: (path) =>
      [
        "docs/linux-install/bob-next-steps.md",
        "docs/linux-install/remaining-gaps.md",
        "docs/linux-install/implementation-plan.md",
        "docs/linux-install/remote-approval-template.md",
        "docs/linux-install/ssh-key-policy.md",
      ].includes(path) ||
      (path.startsWith("docs/linux-install/evidence/") &&
        path !== "docs/linux-install/evidence/schema.md"),
  },
  {
    id: "linux-install-evidence-ignore-missing",
    description: "Generated Linux install evidence must be ignored while preserving the tracked schema contract.",
    test: (path) => path === ".gitignore",
    contentTest: (text) =>
      [
        "docs/linux-install/evidence/*",
        "!docs/linux-install/evidence/",
        "!docs/linux-install/evidence/schema.md",
      ].some((pattern) => !text.includes(pattern)) ||
      text.includes("!docs/linux-install/evidence/fixtures/"),
  },
  {
    id: "local-artifact-ignore-missing",
    description: "Local BMAD, KNX runtime, and generated skill artifacts must remain ignored by repo-owned rules.",
    test: (path) => path === ".gitignore",
    contentTest: (text) =>
      [
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
      ].some((pattern) => !text.includes(pattern)),
  },
];

const LOCAL_USER_PARTS = ["slaw", "dawg"];
const LOCAL_USER = LOCAL_USER_PARTS.join("_");
const LOCAL_CONTENT_PATTERNS = [
  LOCAL_USER,
  `/home/${LOCAL_USER}`,
  `C:\\Users\\${LOCAL_USER}`,
  `C:/Users/${LOCAL_USER}`,
];

const REQUIRED_PLANNING_DOC_PREFIXES = [
  "docs/goals/",
  "docs/handoffs/",
  "docs/research/",
  "docs/prds/",
  "docs/stories/",
];

const REQUIRED_SOURCE_PATHS = [
  {
    path: "docs/workflows/current-session-runbook.md",
    description: "The source-owned current-session runbook must replace the removed tracked handoff pointer.",
  },
  {
    path: "docs/workflows/planning-doc-clean-install-boundary.md",
    description: "The source-owned planning-doc boundary must replace tracked local BMAD planning trees.",
  },
  {
    path: "docs/workflows/product-requirements-boundary.md",
    description: "The source-owned product requirements boundary must replace tracked local PRD artifacts.",
  },
  {
    path: "docs/workflows/implementation-evidence-boundary.md",
    description: "The source-owned implementation evidence boundary must replace tracked local BMAD story artifacts.",
  },
  {
    path: "docs/workflows/platform-decision-boundary.md",
    description: "The source-owned platform decision boundary must replace tracked local platform evaluation research.",
  },
];

function basename(path) {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

function readWorkspaceJson(path) {
  return JSON.parse(readFileSync(join(rootDir, path), "utf8"));
}

export function loadPlanningDocManifest() {
  return readWorkspaceJson(planningDocManifestPath);
}

function isPlanningDocPath(path) {
  return REQUIRED_PLANNING_DOC_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function isLinuxInstallLocalArtifactEntry(entry) {
  return (
    entry === "bob-next-steps.md" ||
    entry === "remaining-gaps.md" ||
    entry === "implementation-plan.md" ||
    entry === "remote-approval-template.md" ||
    entry === "ssh-key-policy.md" ||
    entry === "planning" ||
    entry.startsWith("planning/") ||
    (
      entry.startsWith("evidence/") &&
      entry !== "evidence/schema.md"
    )
  );
}

export function validateLinuxInstallPackageEntries(entries, trackedPaths) {
  const failures = [];
  const trackedSet = new Set(trackedPaths);
  const entrySet = new Set(entries.filter((entry) => entry && !entry.endsWith("/")));

  for (const entry of entrySet) {
    if (isLinuxInstallLocalArtifactEntry(entry)) {
      failures.push(`${entry} is local Linux install evidence or planning state and must not be packaged`);
      continue;
    }
    const sourcePath = `docs/linux-install/${entry}`;
    if (!trackedSet.has(sourcePath)) {
      failures.push(`${entry} does not correspond to tracked source file ${sourcePath}`);
    }
  }

  for (const trackedPath of trackedPaths) {
    if (!trackedPath.startsWith("docs/linux-install/") || trackedPath === "docs/linux-install.zip") {
      continue;
    }
    const entry = trackedPath.slice("docs/linux-install/".length);
    if (!entrySet.has(entry)) {
      failures.push(`${entry} is tracked source but missing from docs/linux-install.zip`);
    }
  }

  return failures;
}

export function listZipEntries(buffer) {
  const eocdSignature = 0x06054b50;
  const centralDirectorySignature = 0x02014b50;
  const minimumEocdOffset = Math.max(0, buffer.length - 65_557);
  let eocdOffset = -1;

  for (let offset = buffer.length - 22; offset >= minimumEocdOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === eocdSignature) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error("Unable to find ZIP end-of-central-directory record");
  }

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let offset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== centralDirectorySignature) {
      throw new Error(`Invalid ZIP central-directory entry at offset ${offset}`);
    }
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraFieldLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const fileNameStart = offset + 46;
    entries.push(buffer.toString("utf8", fileNameStart, fileNameStart + fileNameLength));
    offset = fileNameStart + fileNameLength + extraFieldLength + commentLength;
  }

  return entries;
}

export function validatePlanningDocManifest(manifest) {
  const failures = [];
  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
  const forbiddenPrefixes = Array.isArray(manifest?.forbiddenPrefixes) ? manifest.forbiddenPrefixes : [];

  if (manifest?.schemaVersion !== 1) {
    failures.push("manifest schemaVersion must be 1");
  }
  if (manifest?.status !== "active-hard-fail") {
    failures.push("manifest status must be active-hard-fail");
  }
  if (!manifest?.targetRemovalCondition) {
    failures.push("manifest must define targetRemovalCondition");
  }
  if (manifest?.legacyBaselineCommit !== undefined) {
    failures.push("manifest legacyBaselineCommit must not be present");
  }
  if (
    forbiddenPrefixes.length !== REQUIRED_PLANNING_DOC_PREFIXES.length ||
    REQUIRED_PLANNING_DOC_PREFIXES.some((prefix) => !forbiddenPrefixes.includes(prefix))
  ) {
    failures.push(`manifest forbiddenPrefixes must exactly match ${REQUIRED_PLANNING_DOC_PREFIXES.join(", ")}`);
  }
  if (!Array.isArray(manifest?.entries)) {
    failures.push("manifest entries must be an array");
  }
  if (manifest?.legacyGrandfatheredCount !== undefined) {
    failures.push("manifest legacyGrandfatheredCount must be replaced by localOnlyEntryCount");
  }
  if (manifest?.localOnlyEntryCount !== entries.length) {
    failures.push("localOnlyEntryCount must match entries.length");
  }

  if (entries.length > 0) {
    failures.push("manifest entries must remain empty; planning docs are hard-fail local-only paths");
  }

  return failures;
}

export function validateRequiredSourcePaths(trackedPaths) {
  const trackedSet = new Set(trackedPaths);
  return REQUIRED_SOURCE_PATHS.filter((requiredPath) => !trackedSet.has(requiredPath.path));
}

function gitLsFiles() {
  let output = Buffer.alloc(0);
  try {
    output = execFileSync("git", ["ls-files", "-z"], {
      cwd: rootDir,
      encoding: "buffer",
    });
  } catch (error) {
    // Some sandboxes report spawnSync EPERM even after git writes stdout.
    // Treat captured stdout as authoritative; fail below if nothing was read.
    output = Buffer.isBuffer(error.stdout) ? error.stdout : Buffer.alloc(0);
    if (output.length === 0) {
      throw error;
    }
  }

  return output
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

export function evaluateCleanInstallBoundary(paths, { manifest, validateManifestTrackedEntries = false } = {}) {
  const violations = [];
  let activeManifest = manifest;
  if (activeManifest === undefined) {
    try {
      activeManifest = loadPlanningDocManifest();
    } catch (error) {
      violations.push({
        path: planningDocManifestPath,
        ruleId: PLANNING_DOC_MANIFEST_RULE_ID,
        description: `Unable to load planning doc manifest: ${error.message}`,
      });
      return { violations, debts: [] };
    }
  }
  for (const failure of validatePlanningDocManifest(activeManifest)) {
    violations.push({
      path: planningDocManifestPath,
      ruleId: PLANNING_DOC_MANIFEST_RULE_ID,
      description: failure,
    });
  }

  if (validateManifestTrackedEntries) {
    for (const requiredPath of validateRequiredSourcePaths(paths)) {
      violations.push({
        path: requiredPath.path,
        ruleId: "required-source-path-missing",
        description: requiredPath.description,
      });
    }
  }

  for (const path of paths) {
    for (const rule of HARD_FAIL_RULES) {
      if (rule.test(path)) {
        if (rule.contentTest) {
          continue;
        }
        violations.push({
          path,
          ruleId: rule.id,
          description: rule.description,
        });
      }
    }

    if (isPlanningDocPath(path)) {
      violations.push({
        path,
        ruleId: PLANNING_DOC_RULE_ID,
        description: "Top-level BMAD planning/research artifacts are local-only and must not be tracked.",
      });
    }
  }

  return { violations, debts: [] };
}

export function evaluateCleanInstallContent(paths, readText) {
  const violations = [];

  for (const path of paths) {
    let text;
    try {
      text = readText(path);
    } catch {
      continue;
    }
    if (typeof text !== "string" || text.includes("\0")) {
      continue;
    }
    for (const pattern of LOCAL_CONTENT_PATTERNS) {
      if (text.includes(pattern)) {
        violations.push({
          path,
          ruleId: "bob-local-path-content",
          description: "Tracked files must not contain operator-specific usernames or absolute local home paths.",
        });
        break;
      }
    }
    for (const rule of HARD_FAIL_RULES) {
      if (rule.contentTest && rule.test(path) && rule.contentTest(text)) {
        violations.push({
          path,
          ruleId: rule.id,
          description: rule.description,
        });
      }
    }
  }

  return violations;
}

export function evaluateLinuxInstallPackage(paths, readBinary) {
  const violations = [];
  if (!paths.includes("docs/linux-install.zip")) {
    return violations;
  }

  let entries;
  try {
    entries = listZipEntries(readBinary("docs/linux-install.zip"));
  } catch (error) {
    violations.push({
      path: "docs/linux-install.zip",
      ruleId: LINUX_INSTALL_ZIP_RULE_ID,
      description: `Linux install package archive is unreadable: ${error.message}`,
    });
    return violations;
  }

  for (const failure of validateLinuxInstallPackageEntries(entries, paths)) {
    violations.push({
      path: "docs/linux-install.zip",
      ruleId: LINUX_INSTALL_ZIP_RULE_ID,
      description: failure,
    });
  }

  return violations;
}

export function formatBoundaryReport({ violations, debts }) {
  const lines = [];

  if (violations.length > 0) {
    lines.push("Clean install boundary violations:");
    for (const violation of violations) {
      lines.push(`- ${violation.ruleId}: ${violation.path}`);
      lines.push(`  ${violation.description}`);
    }
  }

  if (lines.length === 0) {
    lines.push("OK: clean install boundary checks passed.");
  }

  return lines.join("\n");
}

function main() {
  const paths = gitLsFiles();
  const result = evaluateCleanInstallBoundary(paths, { validateManifestTrackedEntries: true });
  result.violations.push(...evaluateCleanInstallContent(paths, (path) => readFileSync(join(rootDir, path), "utf8")));
  result.violations.push(...evaluateLinuxInstallPackage(paths, (path) => readFileSync(join(rootDir, path))));
  const report = formatBoundaryReport(result);

  if (result.violations.length > 0) {
    console.error(report);
    process.exit(1);
  }

  console.log(report);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
