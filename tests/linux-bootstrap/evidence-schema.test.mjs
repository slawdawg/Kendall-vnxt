import assert from "node:assert/strict";
import test from "node:test";

import { validateBootstrapEvidence, validateInstallEvidence, validateLinuxEvidence } from "../../scripts/lib/linux-bootstrap/evidence-schema.mjs";

function baseEvidence(overrides = {}) {
  return {
    schema: "kendall-linux-bootstrap-evidence/v1",
    generated_at: "2026-06-17T00:00:00.000Z",
    command: {
      mode: "verify-only",
      invoked: "node ./scripts/linux-bootstrap.mjs --verify-only",
    },
    target: {
      alias: "local",
      user: "ubuntu",
      hostname: "ubuntu-host",
      repo: "$HOME/Kendall_Nxt",
      minimumOsVersion: "26.04",
      nodeRange: ">=22 <25",
      address_source: "local-session",
    },
    authority: {
      level: "verify",
      approval_id: null,
    },
    gates: [
      {
        id: "local-preflight",
        status: "pass",
        summary: "local ready",
        recovery: "none",
        timestamp: "2026-06-17T00:00:00.000Z",
        command: "test",
      },
      {
        id: "full-verify",
        status: "pass",
        summary: "local validation passed",
        recovery: "none",
        timestamp: "2026-06-17T00:00:01.000Z",
        command: "validate",
      },
    ],
    checks: [
      { id: "local-preflight", status: "pass", summary: "local ready" },
      { id: "full-verify", status: "pass", summary: "local validation passed" },
    ],
    tool_changes: [],
    project_actions: [],
    manual_tasks: [
      { id: "tailscale-login", status: "manual-post-install", summary: "manual" },
      { id: "codex-login", status: "manual-post-install", summary: "manual" },
      { id: "claude-login", status: "manual-post-install", summary: "manual" },
      { id: "provider-auth", status: "manual-post-install", summary: "manual" },
    ],
    tool_versions: [{ id: "node", status: "pass", summary: "v22.22.1" }],
    repo_state: { id: "repo", status: "pass", summary: "repo found" },
    validation_summary: { pass: 1, fail: 0, warn: 0 },
    skipped: [],
    mutations: ["evidence-file"],
    redactions: ["gh-auth-output", "environment", "authorized-keys", "provider-tokens", "private-keys"],
    auth_boundary: {
      performed_provider_login: false,
      performed_tailscale_login: false,
      performed_codex_login: false,
      performed_claude_login: false,
      performed_browser_auth: false,
      read_or_wrote_provider_tokens: false,
    },
    result: "pass",
    rerun_guidance: "Safe to rerun.",
    ...overrides,
  };
}

function installEvidence(overrides = {}) {
  return {
    schema: "kendall-linux-install-evidence/v1",
    generated_at: "2026-06-17T00:00:00.000Z",
    mode: "verify",
    command: {
      mode: "verify",
      invoked: "scripts/validate-linux-install.sh --verify-only",
    },
    target: {
      alias: "local",
      user: "ubuntu",
      hostname: "ubuntu-host",
      repo: "/home/ubuntu/Kendall_Nxt",
      repo_url: "https://github.com/slawdawg/Kendall-vnxt.git",
      minimumOsVersion: "26.04",
      nodeRange: ">=22 <25",
      address_source: "local-session",
    },
    authority: { level: "evidence-write", approval_id: null },
    checks: [{ id: "user", status: "pass", summary: "running as ubuntu" }],
    checks_summary: { pass: 1, fail: 0, warn: 0 },
    mutations: ["evidence-file"],
    redactions: ["gh-auth-output", "environment", "authorized-keys", "provider-tokens", "private-keys"],
    manual_tasks: [
      { id: "tailscale-login", status: "manual-post-install", summary: "manual" },
      { id: "codex-login", status: "manual-post-install", summary: "manual" },
      { id: "claude-login", status: "manual-post-install", summary: "manual" },
      { id: "provider-auth", status: "manual-post-install", summary: "manual" },
    ],
    auth_boundary: {
      performed_provider_login: false,
      performed_tailscale_login: false,
      performed_codex_login: false,
      performed_claude_login: false,
      performed_browser_auth: false,
      read_or_wrote_provider_tokens: false,
    },
    result: "pass",
    rerun_guidance: "Safe to rerun.",
    ...overrides,
  };
}

test("accepts schema-compliant passing bootstrap evidence", () => {
  assert.deepEqual(validateBootstrapEvidence(baseEvidence()), []);
});

test("accepts schema-compliant doctor evidence without evidence-file mutation", () => {
  const evidence = baseEvidence({
    command: {
      mode: "doctor",
      invoked: "node ./scripts/linux-bootstrap.mjs --doctor",
    },
    mutations: [],
  });

  assert.deepEqual(validateBootstrapEvidence(evidence), []);
});

test("rejects doctor evidence with write authority or mutations", () => {
  const errors = validateBootstrapEvidence(
    baseEvidence({
      command: {
        mode: "doctor",
        invoked: "node ./scripts/linux-bootstrap.mjs --doctor",
      },
      authority: { level: "evidence-write", approval_id: null },
      mutations: ["evidence-file"],
    }),
  );

  assert(errors.includes("doctor authority must be verify"));
  assert(errors.includes("doctor evidence must not include mutations"));
});

test("blocked result requires a blocked gate and accepts missing full verify details", () => {
  const evidence = baseEvidence({
    gates: [
      {
        id: "local-identity",
        status: "blocked",
        summary: "local user cannot be verified",
        recovery: "log in as the intended sudo user",
        timestamp: "2026-06-17T00:00:00.000Z",
        command: "local identity probe",
      },
    ],
    checks: [{ id: "local-identity", status: "fail", summary: "local user cannot be verified" }],
    tool_versions: undefined,
    repo_state: undefined,
    validation_summary: undefined,
    result: "blocked",
  });
  assert.deepEqual(validateBootstrapEvidence(evidence), []);
});

test("rejects auth boundary violations and missing manual tasks", () => {
  const evidence = baseEvidence({
    manual_tasks: [],
    auth_boundary: {
      performed_provider_login: true,
      performed_tailscale_login: false,
      performed_codex_login: false,
      performed_claude_login: false,
      performed_browser_auth: false,
      read_or_wrote_provider_tokens: false,
    },
  });
  const errors = validateBootstrapEvidence(evidence);
  assert(errors.some((error) => error.includes("manual_tasks must include tailscale-login")));
  assert(errors.some((error) => error.includes("performed_provider_login must be false")));
});

test("manual tasks require post-install status and summary", () => {
  const evidence = baseEvidence({
    manual_tasks: [
      { id: "tailscale-login", status: "done", summary: "manual" },
      { id: "codex-login", status: "manual-post-install", summary: "" },
      "claude-login",
      { id: "provider-auth", status: "manual-post-install", summary: "manual" },
    ],
  });
  const errors = validateBootstrapEvidence(evidence);
  assert(errors.includes("manual_tasks[0].status must be manual-post-install"));
  assert(errors.includes("manual_tasks[1].summary must be a non-empty string"));
  assert(errors.includes("manual_tasks[2] must be an object"));
  assert(errors.some((error) => error.includes("manual_tasks must include claude-login")));
});

test("evidence must include required redaction categories", () => {
  const bootstrapEvidence = baseEvidence({
    redactions: ["provider-tokens", ""],
  });
  const bootstrapErrors = validateBootstrapEvidence(bootstrapEvidence);
  assert(bootstrapErrors.includes("redactions[1] must be a non-empty string"));
  assert(bootstrapErrors.includes("redactions must include gh-auth-output"));
  assert(bootstrapErrors.includes("redactions must include private-keys"));

  const installErrors = validateInstallEvidence(
    installEvidence({
      redactions: ["gh-auth-output", "environment", "authorized-keys"],
    }),
  );
  assert(installErrors.includes("redactions must include provider-tokens"));
  assert(installErrors.includes("redactions must include private-keys"));
});

test("evidence rejects retained secret and auth-flow text while allowing redaction labels", () => {
  const clean = installEvidence({
    redactions: ["gh-auth-output", "environment", "authorized-keys", "provider-tokens", "private-keys"],
  });
  assert.deepEqual(validateInstallEvidence(clean), []);

  const leaked = installEvidence({
    checks: [
      { id: "repo-access", status: "fail", summary: "token gho_abcdefghijklmnopqrstuvwxyz leaked" },
      { id: "auth-url", status: "fail", summary: "open https://example.test/oauth/device to continue" },
    ],
    checks_summary: { pass: 0, fail: 2, warn: 0 },
    result: "fail",
    rerun_guidance: "Do not paste -----BEGIN OPENSSH PRIVATE KEY----- into evidence.",
  });
  const errors = validateInstallEvidence(leaked);
  assert(errors.includes("checks[0].summary must not include GitHub token"));
  assert(errors.includes("checks[1].summary must not include auth URL"));
  assert(errors.includes("rerun_guidance must not include private key material"));
});

test("evidence-write authority requires evidence-file mutation", () => {
  const bootstrapErrors = validateBootstrapEvidence(
    baseEvidence({
      authority: { level: "evidence-write", approval_id: null },
      mutations: ["", 42],
    }),
  );
  assert(bootstrapErrors.includes("mutations[0] must be a non-empty string"));
  assert(bootstrapErrors.includes("mutations[1] must be a non-empty string"));
  assert(bootstrapErrors.includes("evidence-write authority requires evidence-file mutation"));

  const installErrors = validateInstallEvidence(
    installEvidence({
      mutations: [],
    }),
  );
  assert(installErrors.includes("evidence-write authority requires evidence-file mutation"));
});

test("evidence authority levels are constrained by evidence type", () => {
  const bootstrapErrors = validateBootstrapEvidence(
    baseEvidence({
      authority: { level: "remote-apply", approval_id: null },
    }),
  );
  assert(bootstrapErrors.includes("authority.level must be one of plan, verify, evidence-write"));

  const installErrors = validateInstallEvidence(
    installEvidence({
      authority: { level: "reboot", approval_id: null },
    }),
  );
  assert(installErrors.includes("authority.level must be one of verify, evidence-write"));
});

test("install manual tasks require post-install status and summary", () => {
  const evidence = installEvidence({
    manual_tasks: [
      { id: "tailscale-login", status: "manual-post-install", summary: "manual" },
      { id: "codex-login", status: "manual-post-install", summary: "manual" },
      { id: "claude-login", status: "manual-post-install", summary: "" },
      { id: "provider-auth", status: "pending", summary: "manual" },
    ],
  });
  const errors = validateInstallEvidence(evidence);
  assert(errors.includes("manual_tasks[2].summary must be a non-empty string"));
  assert(errors.includes("manual_tasks[3].status must be manual-post-install"));
});

test("passing full verify requires tool, repo, and validation summaries", () => {
  const evidence = baseEvidence({
    tool_versions: [],
    repo_state: null,
    validation_summary: null,
  });
  const errors = validateBootstrapEvidence(evidence);
  assert(errors.includes("passing full-verify evidence must include tool_versions"));
  assert(errors.includes("passing full-verify evidence must include repo_state"));
  assert(errors.includes("passing full-verify evidence must include validation_summary"));
});

test("bootstrap action arrays require shaped rows", () => {
  const evidence = baseEvidence({
    project_actions: [{ id: "repo-state", status: "existing", summary: "" }],
    tool_changes: ["node"],
    skipped: [
      { id: "base-tools", status: "done", reason: "not in verify mode" },
      { id: "repo-state", status: "skip", reason: "" },
    ],
  });
  const errors = validateBootstrapEvidence(evidence);
  assert(errors.includes("project_actions[0].summary must be a non-empty string"));
  assert(errors.includes("tool_changes[0] must be an object"));
  assert(errors.includes("skipped[0].status must be skip or blocked"));
  assert(errors.includes("skipped[1].reason must be a non-empty string"));
});

test("accepts schema-compliant local install evidence", () => {
  const evidence = installEvidence();

  assert.deepEqual(validateInstallEvidence(evidence), []);
  assert.deepEqual(validateLinuxEvidence(evidence), []);
});

test("install evidence requires command provenance", () => {
  const missing = installEvidence({ command: undefined });
  assert(validateInstallEvidence(missing).includes("command must be an object"));

  const invalid = installEvidence({
    command: { mode: "apply", invoked: "" },
  });
  const errors = validateInstallEvidence(invalid);
  assert(errors.includes("command.mode must be verify"));
  assert(errors.includes("command.invoked must be a non-empty string"));
});

test("install evidence result must match failed checks", () => {
  const passingWithFailure = installEvidence({
    checks: [{ id: "repo-origin", status: "fail", summary: "wrong repo" }],
    checks_summary: { pass: 0, fail: 1, warn: 0 },
  });
  assert(validateInstallEvidence(passingWithFailure).includes("passing install result must not include failed checks"));

  const failedWithoutFailure = installEvidence({
    result: "fail",
    rerun_guidance: "Fix setup and rerun.",
  });
  assert(validateInstallEvidence(failedWithoutFailure).includes("failed install result requires at least one failed check"));

  const blockedEvidence = installEvidence({
    checks: [{ id: "repo-access", status: "blocked", summary: "manual GitHub auth required" }],
    checks_summary: { pass: 0, fail: 0, warn: 0, blocked: 1 },
    result: "blocked",
    rerun_guidance: "Complete manual repo auth and rerun.",
  });
  assert.deepEqual(validateInstallEvidence(blockedEvidence), []);

  const blockedWithoutBlockedCheck = installEvidence({
    result: "blocked",
    rerun_guidance: "Complete manual repo auth and rerun.",
  });
  assert(validateInstallEvidence(blockedWithoutBlockedCheck).includes("blocked install result requires at least one blocked check explaining the stop"));
});

test("install evidence checks summary must match actual check counts", () => {
  const mismatch = installEvidence({
    checks: [
      { id: "user", status: "pass", summary: "running as ubuntu" },
      { id: "repo-origin", status: "fail", summary: "wrong repo" },
      { id: "github-auth", status: "warn", summary: "manual auth unavailable" },
      { id: "repo-preflight", status: "skip", summary: "not reached" },
    ],
    checks_summary: { pass: 4, fail: 0, warn: 0 },
    result: "fail",
    rerun_guidance: "Fix failed checks and rerun.",
  });
  const mismatchErrors = validateInstallEvidence(mismatch);
  assert(mismatchErrors.includes("checks_summary.pass must equal actual pass check count"));
  assert(mismatchErrors.includes("checks_summary.fail must equal actual fail check count"));
  assert(mismatchErrors.includes("checks_summary.warn must equal actual warn check count"));

  const invalidTypes = installEvidence({
    checks_summary: { pass: "1", fail: -1, warn: 1.5 },
  });
  const typeErrors = validateInstallEvidence(invalidTypes);
  assert(typeErrors.includes("checks_summary.pass must be a non-negative integer"));
  assert(typeErrors.includes("checks_summary.fail must be a non-negative integer"));
  assert(typeErrors.includes("checks_summary.warn must be a non-negative integer"));
});

test("install evidence blocked summary must match blocked checks when supplied", () => {
  const mismatch = installEvidence({
    checks: [{ id: "repo-access", status: "blocked", summary: "manual GitHub auth required" }],
    checks_summary: { pass: 0, fail: 0, warn: 0, blocked: 0 },
    result: "blocked",
    rerun_guidance: "Complete manual repo auth and rerun.",
  });

  assert(validateInstallEvidence(mismatch).includes("checks_summary.blocked must equal actual blocked check count"));
});

test("install evidence validates optional tool change rows when supplied", () => {
  const evidence = installEvidence({
    tool_changes: [
      { id: "node", status: "existing", summary: "v22.22.1 already present" },
      { id: "pnpm", status: "installed", summary: "installed pnpm 11.5.2" },
      { id: "uv", status: "changed", summary: "" },
      "codex",
    ],
  });

  const errors = validateInstallEvidence(evidence);
  assert(errors.includes("tool_changes[2].summary must be a non-empty string"));
  assert(errors.includes("tool_changes[3] must be an object"));
});

test("accepts install evidence with existing installed changed skipped and failed tool changes", () => {
  const evidence = installEvidence({
    tool_changes: [
      { id: "node", status: "existing", summary: "v22.22.1 already present" },
      { id: "pnpm", status: "installed", summary: "installed pnpm 11.5.2" },
      { id: "uv", status: "changed", summary: "exposed uv on PATH" },
      { id: "codex", status: "skipped", summary: "Codex CLI already exists" },
      { id: "claude", status: "failed", summary: "npm install failed before retry" },
    ],
  });

  assert.deepEqual(validateInstallEvidence(evidence), []);
});

test("rejects install evidence without local-session target boundary", () => {
  const evidence = {
    schema: "kendall-linux-install-evidence/v1",
    generated_at: "2026-06-17T00:00:00.000Z",
    mode: "verify",
    command: {
      mode: "verify",
      invoked: "scripts/validate-linux-install.sh --verify-only",
    },
    target: {
      alias: "ubuntu-target",
      user: "ubuntu",
      hostname: "ubuntu-host",
      repo: "/home/ubuntu/Kendall_Nxt",
      repo_url: "https://github.com/slawdawg/Kendall-vnxt.git",
      minimumOsVersion: "26.04",
      nodeRange: ">=22 <25",
      address_source: "ssh-config",
    },
    authority: { level: "evidence-write", approval_id: null },
    checks: [{ id: "user", status: "pass", summary: "running as ubuntu" }],
    checks_summary: { pass: 1, fail: 0, warn: 0 },
    mutations: ["evidence-file"],
    redactions: [],
    manual_tasks: [],
    auth_boundary: { performed_provider_login: true },
    result: "pass",
    rerun_guidance: "",
  };

  const errors = validateInstallEvidence(evidence);
  assert(errors.includes("target.alias must be local"));
  assert(errors.includes("target.address_source must be local-session"));
  assert(errors.some((error) => error.includes("manual_tasks must include tailscale-login")));
  assert(errors.some((error) => error.includes("performed_provider_login must be false")));
  assert(errors.includes("rerun_guidance must be a non-empty string"));
});
