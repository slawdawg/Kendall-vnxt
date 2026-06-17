import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  buildEvidence,
  recordAuthBoundary,
  recordGate,
  validateEvidencePath,
  writeEvidence,
} from "../../scripts/lib/linux-bootstrap/evidence.mjs";

const repoRoot = process.cwd();

test("evidence path must stay under docs/linux-install/evidence", () => {
  assert.throws(() => validateEvidencePath(repoRoot, "../outside.json"), /must be under/);
  assert.throws(() => validateEvidencePath(repoRoot, "docs/linux-install/evidence/.hidden.json"), /must not be hidden/);
});

test("evidence write refuses overwrite and records auth boundary", () => {
  const evidenceDir = join(repoRoot, "docs", "linux-install", "evidence");
  mkdirSync(evidenceDir, { recursive: true });
  const path = "docs/linux-install/evidence/test-bootstrap-evidence-delete-me.json";
  const fullPath = join(repoRoot, path);
  if (existsSync(fullPath)) {
    rmSync(fullPath);
  }

  const evidence = buildEvidence({
    repoRoot,
    options: { mode: "verify-only", target: "ubuntu-target", user: "ubuntu", hostname: "", evidence: path },
  });
  recordGate(evidence, {
    id: "operator-preflight",
    status: "pass",
    summary: "operator ready",
    recovery: "none",
    command: "test",
  });
  recordAuthBoundary(evidence);
  evidence.manual_tasks.push({
    id: "tailscale-login",
    status: "manual-post-install",
    summary: "manual only",
  });

  writeEvidence(repoRoot, path, evidence);
  assert(existsSync(fullPath));

  const parsed = JSON.parse(readFileSync(fullPath, "utf8"));
  assert.equal(parsed.auth_boundary.performed_tailscale_login, false);
  assert.equal(parsed.auth_boundary.performed_codex_login, false);
  assert.equal(parsed.manual_tasks[0].id, "tailscale-login");
  assert.equal(parsed.result, "pass");
  assert.throws(() => writeEvidence(repoRoot, path, evidence), /already exists/);

  rmSync(fullPath);
});
