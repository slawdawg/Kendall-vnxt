#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const activeDocs = [
  "README.md",
  "docs/linux-install/install-playbook.md",
  "docs/linux-install/install-contract.md",
  "docs/linux-install/one-command-bootstrap-plan.md",
  "docs/linux-install/fresh-host-proof-procedure.md",
  "docs/linux-install/goal-run-contract.md",
  "docs/linux-install/release-gate-traceability.md",
  "docs/linux-install/validation-matrix.md",
  "docs/linux-install/troubleshooting.md",
  "docs/linux-install/index.md",
];

const goalRunFixtureFiles = [
  "docs/linux-install/fixtures/goal-run/blocked-continuation.json",
  "docs/linux-install/fixtures/goal-run/blocker-destructive-cleanup.json",
  "docs/linux-install/fixtures/goal-run/blocker-manual-auth.json",
  "docs/linux-install/fixtures/goal-run/blocker-paid-provider-usage.json",
  "docs/linux-install/fixtures/goal-run/blocker-tailnet-enrollment.json",
  "docs/linux-install/fixtures/goal-run/command-contracts.json",
  "docs/linux-install/fixtures/goal-run/invalid-preauthorization.json",
  "docs/linux-install/fixtures/goal-run/missing-evidence.json",
  "docs/linux-install/fixtures/goal-run/valid-preauthorization.json",
];

const goalRunFixtureDir = "docs/linux-install/fixtures/goal-run";
const expectedGoalRunFixtures = new Set(goalRunFixtureFiles);

const expectedBootstrapUrl =
  "https://raw.githubusercontent.com/slawdawg/Kendall-vnxt/main/scripts/bootstrap-linux.sh";

const expectedPublicLinuxScripts = {
  "linux:doctor": "node ./scripts/linux-bootstrap.mjs --doctor",
  "linux:setup": "node ./scripts/linux-bootstrap.mjs --plan",
  "linux:smoke": "node ./scripts/check-linux-bootstrap.mjs",
  "linux:drift": "node ./scripts/check-linux-install-contract.mjs",
};

const requiredSnippets = [
  {
    path: "README.md",
    text: "No SSH-driven install, remote operator install, staged script workflow, manual\nfallback install, or Windows-to-Linux orchestration is supported.",
  },
  {
    path: "README.md",
    text: expectedBootstrapUrl,
  },
  {
    path: "README.md",
    text: "sudo apt-get update && sudo apt-get install -y curl ca-certificates",
  },
  {
    path: "README.md",
    text: "wget -qO \"$tmp\" \"$url\"",
  },
  {
    path: "docs/linux-install/install-playbook.md",
    text: "There is only one supported v1 install method:",
  },
  {
    path: "docs/linux-install/install-playbook.md",
    text: expectedBootstrapUrl,
  },
  {
    path: "docs/linux-install/one-command-bootstrap-plan.md",
    text: expectedBootstrapUrl,
  },
  {
    path: "scripts/check-linux-bootstrap-url.mjs",
    text: expectedBootstrapUrl,
  },
  {
    path: "docs/linux-install/index.md",
    text: "[Fresh host proof procedure](fresh-host-proof-procedure.md)",
  },
  {
    path: "docs/linux-install/index.md",
    text: "They are not the generic installer entry point and must not override the\nsingle-method v1 boundary above.",
  },
  {
    path: "docs/linux-install/index.md",
    text: "[Goal run contract](goal-run-contract.md)",
  },
  {
    path: "docs/linux-install/index.md",
    text: "[Release gate traceability](release-gate-traceability.md)",
  },
  {
    path: "docs/linux-install/goal-run-contract.md",
    text: "## Terminal Delivery Rule",
  },
  {
    path: "docs/linux-install/goal-run-contract.md",
    text: "PR creation, merge, and workspace cleanup are final delivery-phase operations.",
  },
  {
    path: "docs/linux-install/release-gate-traceability.md",
    text: "| LG-16 | PR creation, merge, and cleanup are final delivery operations.",
  },
  {
    path: "docs/linux-install/validation-matrix.md",
    text: "| Goal run contract readiness | `docs/linux-install/goal-run-contract.md`",
  },
  {
    path: "docs/linux-install/validation-matrix.md",
    text: "| Invalid preauthorization fixture | `docs/linux-install/fixtures/goal-run/invalid-preauthorization.json`",
  },
  {
    path: "docs/linux-install/validation-matrix.md",
    text: "| Valid preauthorization fixture | `docs/linux-install/fixtures/goal-run/valid-preauthorization.json`",
  },
  {
    path: "docs/linux-install/validation-matrix.md",
    text: "| Blocked continuation fixture | `docs/linux-install/fixtures/goal-run/blocked-continuation.json`",
  },
  {
    path: "docs/linux-install/validation-matrix.md",
    text: "| Manual Auth blocker fixture | `docs/linux-install/fixtures/goal-run/blocker-manual-auth.json`",
  },
  {
    path: "docs/linux-install/validation-matrix.md",
    text: "| Paid provider blocker fixture | `docs/linux-install/fixtures/goal-run/blocker-paid-provider-usage.json`",
  },
  {
    path: "docs/linux-install/validation-matrix.md",
    text: "| Destructive cleanup blocker fixture | `docs/linux-install/fixtures/goal-run/blocker-destructive-cleanup.json`",
  },
  {
    path: "docs/linux-install/validation-matrix.md",
    text: "| Tailnet enrollment blocker fixture | `docs/linux-install/fixtures/goal-run/blocker-tailnet-enrollment.json`",
  },
  {
    path: "docs/linux-install/validation-matrix.md",
    text: "| Missing evidence fixture | `docs/linux-install/fixtures/goal-run/missing-evidence.json`",
  },
  {
    path: "docs/linux-install/validation-matrix.md",
    text: "| Command contract fixture | `docs/linux-install/fixtures/goal-run/command-contracts.json`",
  },
  {
    path: "docs/linux-install/validation-matrix.md",
    text: "A `/goal` run creates a PR, merges, or cleans workspaces before the current\n  bounded implementation milestone is otherwise complete or blocked.",
  },
  {
    path: "docs/linux-install/fresh-host-proof-procedure.md",
    text: "Do not switch to manual multi-step install as a workaround.",
  },
  {
    path: "docs/linux-install/troubleshooting.md",
    text: "Do not switch to SSH, remote execution,\nstaged scripts, or manual multi-step install as a workaround.",
  },
  {
    path: "docs/linux-install/install-playbook.md",
    text: "sudo apt-get update && sudo apt-get install -y curl ca-certificates",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "--install-kendall-vnxt",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "Usage: scripts/bootstrap-linux.sh --install-kendall-vnxt [options]",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "--address-source local-session",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "--alias local",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "\"command\":{\"mode\":\"verify\",\"invoked\":\"%s\"}",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "base=\"$evidence_dir/local-install-${evidence_stamp}\"",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "next_evidence_path()",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "write_install_failure_evidence()",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "pnpm run setup failed after repo validation",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "candidate=\"${base}-${index}.json\"",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "github_repo_slug()",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "gh repo clone \"$repo_slug\" \"$repo_path\"",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "update this bootstrap script to install an approved Node channel, then rerun the same single install command",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "already exist; skipping npm global install",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "pnpm@$install_pnpm_version already installed; skipping npm global install.",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "uv and uvx already exist; skipping uv installer.",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "repo_url_matches_expected()",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "refusing to run setup against the wrong repo",
  },
  {
    path: "scripts/bootstrap-linux.sh",
    text: "--repo-url \"$repo_url\"",
  },
  {
    path: "scripts/validate-linux-install.sh",
    text: "Evidence file already exists:",
  },
  {
    path: "scripts/validate-linux-install.sh",
    text: "repo_url_matches_expected()",
  },
  {
    path: "scripts/validate-linux-install.sh",
    text: "repo-origin",
  },
  {
    path: "scripts/validate-linux-install.sh",
    text: "\"command\":{\"mode\":\"verify\",\"invoked\":\"%s\"}",
  },
  {
    path: "docs/linux-install/one-command-bootstrap-plan.md",
    text: "Publication gate: the GitHub `main` command is the supported user-facing\ncommand only after these installer changes are merged to `main`.",
  },
  {
    path: "docs/linux-install/one-command-bootstrap-plan.md",
    text: "The raw bootstrap URL must also be reachable by the intended installer audience",
  },
  {
    path: "package.json",
    text: "\"check:linux-bootstrap-url\": \"node ./scripts/check-linux-bootstrap-url.mjs\"",
  },
  {
    path: "scripts/lib/linux-bootstrap/args.mjs",
    text: "Usage: node ./scripts/linux-bootstrap.mjs --doctor|--plan|--verify-only [options]",
  },
];

const forbiddenPatterns = [
  /SSH may be used/i,
  /terminal transport/i,
  /fallback path/i,
  /manual script fallback/i,
  /primary path:\s*one-command ssh/i,
  /supported .*remote operator path/i,
  /supported .*ssh-driven/i,
  /pnpm\s+run\s+linux:bootstrap\s+--\s+--apply/i,
  /linux-bootstrap\.mjs\s+--apply/i,
  /--target\s+<ssh/i,
  /--user\s+<linux/i,
  /StrictHostKeyChecking=accept-new/i,
];

const forbiddenScriptPatterns = [
  /--install-toolchain/,
  /--install-agent-clis/,
  /--dry-run/,
];

const failures = [];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasString(value, field) {
  return typeof value[field] === "string" && value[field].length > 0;
}

function hasArray(value, field) {
  return Array.isArray(value[field]);
}

function hasNonEmptyArray(value, field) {
  return Array.isArray(value[field]) && value[field].length > 0;
}

export function validatePublicLinuxScripts(packageJson) {
  const scriptFailures = [];
  if (!isRecord(packageJson) || !isRecord(packageJson.scripts)) {
    return ["package.json must include scripts object."];
  }

  for (const [name, command] of Object.entries(expectedPublicLinuxScripts)) {
    if (packageJson.scripts[name] !== command) {
      scriptFailures.push(`package.json scripts.${name} must be: ${command}`);
    }
  }

  return scriptFailures;
}

function validateGoalRunFixture(path, fixture) {
  if (!isRecord(fixture)) {
    failures.push(`${path} must be a JSON object.`);
    return;
  }

  if (path.endsWith("/invalid-preauthorization.json")) {
    if (fixture.schema !== "kendall-linux-goal-authority/v1") {
      failures.push(`${path} must use kendall-linux-goal-authority/v1.`);
    }
    if (fixture.fixture !== "invalid-preauthorization") {
      failures.push(`${path} must identify fixture invalid-preauthorization.`);
    }
    if (!isRecord(fixture.input) || typeof fixture.input.approval_text !== "string") {
      failures.push(`${path} must include input.approval_text.`);
    }
    if (fixture.expected_result !== "reject") {
      failures.push(`${path} must expect broad preauthorization rejection.`);
    }
    if (!hasString(fixture, "expected_reason")) {
      failures.push(`${path} must include expected_reason.`);
    }
    return;
  }

  if (path.endsWith("/valid-preauthorization.json")) {
    if (fixture.schema !== "kendall-linux-goal-authority/v1") {
      failures.push(`${path} must use kendall-linux-goal-authority/v1.`);
    }
    if (fixture.fixture !== "valid-preauthorization") {
      failures.push(`${path} must identify fixture valid-preauthorization.`);
    }
    for (const field of [
      "authority_id",
      "authority_family",
      "operation",
      "scope",
      "maximum_impact",
      "expires",
      "rollback_or_recovery",
      "bob_approval_reference",
    ]) {
      if (!hasString(fixture, field)) {
        failures.push(`${path} must include ${field}.`);
      }
    }
    for (const field of ["command_ids", "allowed_targets", "evidence_required", "stop_lines"]) {
      if (!hasArray(fixture, field) || fixture[field].length === 0) {
        failures.push(`${path} must include non-empty ${field}.`);
      }
    }
    if (fixture.expected_result !== "accept") {
      failures.push(`${path} must expect bounded preauthorization acceptance.`);
    }
    if (!hasString(fixture, "expected_reason")) {
      failures.push(`${path} must include expected_reason.`);
    }
    return;
  }

  if (path.endsWith("/blocked-continuation.json")) {
    if (fixture.schema !== "kendall-linux-goal-fixture/v1") {
      failures.push(`${path} must use kendall-linux-goal-fixture/v1.`);
    }
    if (fixture.fixture !== "blocked-continuation") {
      failures.push(`${path} must identify fixture blocked-continuation.`);
    }
    if (!hasArray(fixture, "tasks")) {
      failures.push(`${path} must include tasks.`);
    }
    if (!isRecord(fixture.expected_result)) {
      failures.push(`${path} must include expected_result object.`);
    } else {
      for (const field of ["continue", "pause_dependency_blocked", "pause_authority_blocked"]) {
        if (!Array.isArray(fixture.expected_result[field])) {
          failures.push(`${path} must include expected_result.${field}.`);
        }
      }
    }
    return;
  }

  if (path.includes("/blocker-")) {
    validateBlockerFixture(path, fixture);
    return;
  }

  if (path.endsWith("/command-contracts.json")) {
    validateCommandContractFixture(path, fixture);
    return;
  }

  if (path.endsWith("/missing-evidence.json")) {
    if (fixture.schema !== "kendall-linux-goal-fixture/v1") {
      failures.push(`${path} must use kendall-linux-goal-fixture/v1.`);
    }
    if (fixture.fixture !== "missing-evidence") {
      failures.push(`${path} must identify fixture missing-evidence.`);
    }
    if (!hasArray(fixture, "required_evidence") || fixture.required_evidence.length === 0) {
      failures.push(`${path} must list required_evidence.`);
    }
    if (!hasArray(fixture, "present_evidence") || fixture.present_evidence.length !== 0) {
      failures.push(`${path} must keep present_evidence empty.`);
    }
    if (fixture.expected_completion_status !== "not_complete") {
      failures.push(`${path} must expect not_complete completion status.`);
    }
  }
}

function validateBlockerFixture(path, fixture) {
  if (fixture.schema !== "kendall-linux-goal-blocker/v1") {
    failures.push(`${path} must use kendall-linux-goal-blocker/v1.`);
  }
  for (const field of [
    "blocker_id",
    "run_id",
    "task_id",
    "authority_class",
    "blocked_operation",
    "reason",
    "last_safe_command",
    "proposed_next_command",
    "required_bob_action",
    "resume_command",
    "secrets_exclusion",
  ]) {
    if (!hasString(fixture, field)) {
      failures.push(`${path} must include ${field}.`);
    }
  }
  if (fixture.authority_class !== "block_and_record") {
    failures.push(`${path} must use block_and_record authority_class.`);
  }
  if (!hasArray(fixture, "evidence_paths")) {
    failures.push(`${path} must include evidence_paths.`);
  }
  for (const field of ["dependency_impact", "safe_tasks_still_attempted"]) {
    if (!hasNonEmptyArray(fixture, field)) {
      failures.push(`${path} must include non-empty ${field}.`);
    }
  }
  if (fixture.secrets_exclusion !== "confirmed") {
    failures.push(`${path} must confirm secrets_exclusion.`);
  }
  if (!fixture.resume_command?.includes("/goal resume")) {
    failures.push(`${path} must include an exact /goal resume command.`);
  }
  const redactionScanFixture = { ...fixture, secrets_exclusion: "" };
  if (JSON.stringify(redactionScanFixture).match(/token|device_code|oauth_url/i)) {
    failures.push(`${path} must not include token, secret, device-code, or OAuth URL content.`);
  }
}

function validateCommandContractFixture(path, fixture) {
  if (fixture.schema !== "kendall-linux-goal-command-contracts/v1") {
    failures.push(`${path} must use kendall-linux-goal-command-contracts/v1.`);
  }
  if (fixture.fixture !== "command-contracts") {
    failures.push(`${path} must identify fixture command-contracts.`);
  }
  if (!hasNonEmptyArray(fixture, "commands")) {
    failures.push(`${path} must include non-empty commands.`);
    return;
  }

  for (const [index, command] of fixture.commands.entries()) {
    const label = `${path} commands[${index}]`;
    if (!isRecord(command)) {
      failures.push(`${label} must be a JSON object.`);
      continue;
    }
    for (const field of [
      "command_id",
      "purpose",
      "working_directory",
      "authority_requirement",
      "evidence_output",
      "structured_exit_behavior",
      "failure_type",
    ]) {
      if (!hasString(command, field)) {
        failures.push(`${label} must include ${field}.`);
      }
    }
    if (!hasNonEmptyArray(command, "argv")) {
      failures.push(`${label} must include non-empty argv.`);
    }
    if (!hasArray(command, "allowed_write_paths")) {
      failures.push(`${label} must include allowed_write_paths.`);
    }
    if (!Number.isInteger(command.timeout_seconds) || command.timeout_seconds <= 0 || command.timeout_seconds > 1800) {
      failures.push(`${label} must include timeout_seconds between 1 and 1800.`);
    }
    if (command.stdin !== "closed") {
      failures.push(`${label} must close stdin.`);
    }
    if (command.interactive !== false) {
      failures.push(`${label} must be non-interactive.`);
    }
    if (!["allowed_unattended", "requires_preauthorization", "block_and_record"].includes(command.authority_requirement)) {
      failures.push(`${label} must use a recognized authority_requirement.`);
    }
  }

  if (fixture.expected_result !== "accept") {
    failures.push(`${path} must expect bounded command contract acceptance.`);
  }
}

function main() {
for (const path of activeDocs) {
  const text = readFileSync(path, "utf8");
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(text)) {
      failures.push(`${path} contains forbidden install-method language: ${pattern}`);
    }
  }
}

for (const requirement of requiredSnippets) {
  const text = readFileSync(requirement.path, "utf8");
  if (!text.includes(requirement.text)) {
    failures.push(`${requirement.path} must include: ${requirement.text}`);
  }
}

try {
  const packageJson = JSON.parse(readFileSync(process.env.KENDALL_PACKAGE_JSON || "package.json", "utf8"));
  failures.push(...validatePublicLinuxScripts(packageJson));
} catch (error) {
  failures.push(`package.json must be readable JSON: ${error.message}`);
}

for (const path of goalRunFixtureFiles) {
  if (!existsSync(path)) {
    failures.push(`${path} must exist.`);
  }
}

const discoveredGoalRunFixtureFiles = readdirSync(goalRunFixtureDir)
  .filter((name) => name.endsWith(".json"))
  .map((name) => `${goalRunFixtureDir}/${name}`)
  .sort();

for (const path of discoveredGoalRunFixtureFiles) {
  if (!expectedGoalRunFixtures.has(path)) {
    failures.push(`${path} must be added to the goal-run fixture contract check.`);
  }

  try {
    const fixture = JSON.parse(readFileSync(path, "utf8"));
    validateGoalRunFixture(path, fixture);
  } catch (error) {
    failures.push(`${path} must contain valid JSON: ${error.message}`);
  }
}

{
  const script = readFileSync("scripts/bootstrap-linux.sh", "utf8");
  for (const pattern of forbiddenScriptPatterns) {
    if (pattern.test(script)) {
      failures.push(`scripts/bootstrap-linux.sh exposes forbidden staged install mode: ${pattern}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Linux install contract check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Linux install contract check passed.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
