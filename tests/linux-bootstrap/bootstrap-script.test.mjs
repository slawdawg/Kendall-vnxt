import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const repoRoot = process.cwd();

function runBootstrap(args) {
  return spawnSync("bash", ["scripts/bootstrap-linux.sh", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
  });
}

test("bootstrap script help documents the single install mode", () => {
  const result = runBootstrap(["--help"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /--install-kendall-vnxt/);
  assert.match(result.stdout, /clone\/validate repo, run setup, and verify/);
  assert.match(result.stdout, /does not authenticate GitHub\/OpenAI\/Anthropic/);
  assert.match(result.stdout, /start long-running services, or reboot/);
  assert.doesNotMatch(result.stdout, /--install-toolchain/);
  assert.doesNotMatch(result.stdout, /--install-agent-clis/);
  assert.doesNotMatch(result.stdout, /--dry-run/);
});

test("bootstrap script keeps logs off stdout so stdout evidence can be parsed", () => {
  const source = readFileSync("scripts/bootstrap-linux.sh", "utf8");

  assert.match(source, /log\(\) \{\s+printf '\[bootstrap-linux\] %s\\n' "\$\*" >&2\s+\}/);
  assert.match(source, /if \[ "\$evidence_path" = "-" \]; then\s+printf '%s' "\$evidence_json"/);
  assert.match(source, /sudo apt-get update >&2/);
  assert.match(source, /sudo apt-get install -y nodejs npm gh build-essential python3-venv curl ca-certificates git >&2/);
  assert.match(source, /sudo npm install -g \$packages >&2/);
  assert.match(source, /print_versions git node npm pnpm uv gh >&2/);
});

test("bootstrap script rejects missing option values before mutation", () => {
  const result = runBootstrap(["--repo-path"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing value for --repo-path/);
});

test("bootstrap script rejects unsupported arguments before mutation", () => {
  const result = runBootstrap(["--target", "ubuntu-target"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /unsupported argument: --target/);
});

test("bootstrap script rejects staged install modes before mutation", () => {
  for (const mode of ["--install-toolchain", "--install-agent-clis", "--dry-run"]) {
    const result = runBootstrap([mode]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(`unsupported argument: ${mode}`));
  }
});

test("bootstrap script contains gh clone fallback derived from repo url", () => {
  const result = runBootstrap(["--help"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /--repo-url <url>/);
  assert.match(result.stdout, /Default: Kendall Vnxt HTTPS repo/);
});

test("bootstrap script generates collision-safe install evidence names", () => {
  const source = readFileSync("scripts/bootstrap-linux.sh", "utf8");

  assert.match(source, /next_evidence_path\(\)/);
  assert.match(source, /local-install-\$\{evidence_stamp\}/);
  assert.match(source, /candidate="\$\{base\}-\$\{index\}\.json"/);
  assert.match(source, /while \[ -e "\$candidate" \]/);
});

test("bootstrap script writes setup failure evidence after repo validation", () => {
  const source = readFileSync("scripts/bootstrap-linux.sh", "utf8");

  assert.match(source, /write_install_outcome_evidence\(\)/);
  assert.match(source, /write_install_failure_evidence\(\)/);
  assert.match(source, /write_install_outcome_evidence "\$1" "\$2" "fail" "fail" "\$3" "\$4"/);
  assert.match(source, /"project-setup"/);
  assert.match(source, /pnpm run setup failed after repo validation/);
  assert.match(source, /"result":"%s"/);
  assert.match(source, /"repo_url":"%s"/);
});

test("bootstrap script emits blocked stdout evidence when repo auth is missing before clone", () => {
  const source = readFileSync("scripts/bootstrap-linux.sh", "utf8");

  assert.match(source, /add_mutation\(\)/);
  assert.match(source, /mutation_json_array\(\)/);
  assert.match(source, /add_mutation "approved-package-tool-install"/);
  assert.match(source, /add_mutation "agent-cli-install"/);
  assert.match(source, /write_install_blocked_stdout_evidence\(\)/);
  assert.match(source, /write_install_outcome_evidence "-" "\$1" "blocked" "blocked" "\$2" "\$3"/);
  assert.match(source, /"repo-access"/);
  assert.match(source, /repo access is not available without manual GitHub auth/);
  assert.match(source, /"result":"%s"/);
  assert.match(source, /mutations_json="\$\(mutation_json_array\)"/);
});

test("bootstrap script skips agent CLI reinstall when commands already exist", () => {
  const source = readFileSync("scripts/bootstrap-linux.sh", "utf8");

  assert.match(source, /command -v codex/);
  assert.match(source, /command -v claude/);
  assert.match(source, /command -v bmad-method/);
  assert.match(source, /already exist; skipping npm global install/);
});

test("bootstrap script skips pnpm reinstall when pinned version already exists", () => {
  const source = readFileSync("scripts/bootstrap-linux.sh", "utf8");

  assert.match(source, /current_pnpm_version="\$\(pnpm --version/);
  assert.match(source, /current_pnpm_version" = "\$install_pnpm_version/);
  assert.match(source, /pnpm@\$install_pnpm_version already installed; skipping npm global install/);
});

test("bootstrap script skips uv installer when uv and uvx already exist", () => {
  const source = readFileSync("scripts/bootstrap-linux.sh", "utf8");

  assert.match(source, /command -v uv/);
  assert.match(source, /command -v uvx/);
  assert.match(source, /uv and uvx already exist; skipping uv installer/);
});

test("bootstrap script validates existing repo origin before setup", () => {
  const source = readFileSync("scripts/bootstrap-linux.sh", "utf8");

  assert.match(source, /repo_url_matches_expected\(\)/);
  assert.match(source, /git -C "\$repo_path" remote get-url origin/);
  assert.match(source, /has no origin remote; refusing/);
  assert.match(source, /refusing to run setup against the wrong repo/);
});

test("bootstrap script passes repo url override to final validation", () => {
  const source = readFileSync("scripts/bootstrap-linux.sh", "utf8");

  assert.match(source, /bash scripts\/validate-linux-install\.sh[\s\S]*--repo-url "\$repo_url"[\s\S]*--evidence "\$evidence_path"/);
});

test("bootstrap script writes promotable local-session install evidence", () => {
  const source = readFileSync("scripts/bootstrap-linux.sh", "utf8");

  assert.match(source, /bash scripts\/validate-linux-install\.sh[\s\S]*--alias local[\s\S]*--address-source local-session[\s\S]*--evidence "\$evidence_path"/);
  assert.match(source, /"target":\{"alias":"local"[\s\S]*"address_source":"local-session"/);
});
