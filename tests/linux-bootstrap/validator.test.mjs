import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { validateInstallEvidence } from "../../scripts/lib/linux-bootstrap/evidence-schema.mjs";

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

test("validator rejects evidence paths outside approved evidence directory", () => {
  for (const evidenceArg of ["/tmp/kendall-outside-evidence.json", "docs/linux-install/evidence/../outside-evidence.json"]) {
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
    assert.match(result.stderr, /Evidence path must be under this checkout docs\/linux-install\/evidence/);
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

test("validator emits supplied tool change rows in parseable install evidence", () => {
  const toolChanges = JSON.stringify([
    { id: "node", status: "existing", summary: "node already present" },
    { id: "pnpm", status: "installed", summary: "pnpm installed" },
  ]);

  const result = spawnSync(
    "bash",
    [
      "scripts/validate-linux-install.sh",
      "--verify-only",
      "--repo",
      ".",
      "--skip-preflight",
      "--json",
      "--tool-changes-json",
      toolChanges,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      shell: false,
    },
  );

  assert.notEqual(result.status, 2);
  assert.equal(result.stderr, "");
  const evidence = JSON.parse(result.stdout);
  assert.deepEqual(evidence.tool_changes, JSON.parse(toolChanges));
  assert.deepEqual(validateInstallEvidence(evidence), []);
});
