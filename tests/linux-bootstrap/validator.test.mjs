import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = process.cwd();

function remove(path) {
  if (existsSync(path)) {
    rmSync(path);
  }
}

test("validator refuses to overwrite existing evidence", () => {
  const evidenceDir = join(repoRoot, "docs", "linux-install", "evidence");
  const evidenceName = "test-validator-overwrite-delete-me.json";
  const evidencePath = join(evidenceDir, evidenceName);
  const evidenceArg = `docs/linux-install/evidence/${evidenceName}`;
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(evidencePath, "{}\n", "utf8");

  try {
    const result = spawnSync(
      "bash",
      ["scripts/validate-linux-install.sh", "--verify-only", "--evidence", evidenceArg],
      {
        cwd: repoRoot,
        encoding: "utf8",
        shell: false,
      },
    );

    assert.equal(result.status, 2);
    assert.match(result.stderr, /Evidence file already exists/);
  } finally {
    remove(evidencePath);
  }
});

test("validator verifies existing repo origin", () => {
  const source = readFileSync("scripts/validate-linux-install.sh", "utf8");

  assert.match(source, /--repo-url <url>/);
  assert.match(source, /repo_url_matches_expected\(\)/);
  assert.match(source, /git -C "\$repo_path" remote get-url origin/);
  assert.match(source, /repo-origin/);
  assert.match(source, /does not match expected/);
});

test("validator defaults to local-session evidence identity", () => {
  const source = readFileSync("scripts/validate-linux-install.sh", "utf8");

  assert.match(source, /target_alias="local"/);
  assert.match(source, /address_source="local-session"/);
  assert.match(source, /Default: local\./);
  assert.match(source, /Default: local-session\./);
});
