import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  BLOCKED_AUTHORITY_FAMILIES,
  REQUIRED_DRY_RUN_PACKET_FIELDS,
  REQUIRED_STOP_LINES,
  evaluateStatusEvents,
  renderDryRunReport,
  validateDryRunPacket,
  validateToolReadinessProbe,
} from "../scripts/lib/governed-worker-execution-dry-run.mjs";
import { precheckGovernedWorkerExecutionDryRun } from "../scripts/check-governed-worker-execution-dry-run.mjs";
import { collectToolReadinessProbes } from "../scripts/governed-worker-readiness-collect.mjs";
import {
  collectToolVersionProbeAttempts,
  validateToolVersionProbeAttempt,
} from "../scripts/governed-worker-version-probe.mjs";
import {
  collectSmokeExecutionAttempts,
  validateSmokeExecutionAttempt,
} from "../scripts/governed-worker-smoke-execution.mjs";
import {
  collectCopiedWorktreeExecutionAttempts,
  validateCopiedWorktreeExecutionAttempt,
} from "../scripts/governed-worker-copied-worktree-execution.mjs";

const fixtureBase = new URL("./fixtures/governed-worker-execution-dry-run/", import.meta.url);
const validatorSourcePath = new URL("../scripts/lib/governed-worker-execution-dry-run.mjs", import.meta.url);
const readinessCollectorSourcePath = new URL("../scripts/governed-worker-readiness-collect.mjs", import.meta.url);
const readinessCollectorPath = fileURLToPath(readinessCollectorSourcePath);
const versionProbeSourcePath = new URL("../scripts/governed-worker-version-probe.mjs", import.meta.url);
const versionProbePath = fileURLToPath(versionProbeSourcePath);
const smokeExecutionSourcePath = new URL("../scripts/governed-worker-smoke-execution.mjs", import.meta.url);
const smokeExecutionPath = fileURLToPath(smokeExecutionSourcePath);
const copiedWorktreeExecutionSourcePath = new URL("../scripts/governed-worker-copied-worktree-execution.mjs", import.meta.url);
const copiedWorktreeExecutionPath = fileURLToPath(copiedWorktreeExecutionSourcePath);
const packageJsonPath = new URL("../package.json", import.meta.url);
const checkWrapperPath = new URL("../scripts/check-governed-worker-execution-dry-run.mjs", import.meta.url);

const deniedFixtureExpectations = Object.freeze([
  {
    fixtureName: "denied-live-launch.json",
    reason: "invalid_mode",
    authorityFamily: "worker-process-launch",
    sourcePolicy: "docs/workflows/governed-worker-execution-dry-run.md",
    futureApprovalRequired: "Exact worker launch approval",
  },
  {
    fixtureName: "denied-session-inheritance.json",
    reason: "session_inheritance_requested",
    authorityFamily: "session-inheritance",
    sourcePolicy: "docs/workflows/execution-authority-boundary.md",
    futureApprovalRequired: "Session approval naming account and repo context",
  },
  {
    fixtureName: "denied-network.json",
    reason: "network_requested",
    authorityFamily: "worker-network-or-session",
    sourcePolicy: "docs/workflows/governed-worker-execution-dry-run.md",
    futureApprovalRequired: "Worker-specific network/session approval naming Claude or Hermes",
  },
  {
    fixtureName: "denied-source-mutation.json",
    reason: "source_mutation_requested",
    authorityFamily: "worker-source-mutation",
    sourcePolicy: "docs/workflows/governed-worker-execution-dry-run.md",
    futureApprovalRequired: "Source mutation approval naming worker, task, paths, and diff limits",
  },
  {
    fixtureName: "denied-raw-retention.json",
    reason: "raw_evidence_retention_requested",
    authorityFamily: "raw-failure-retention",
    sourcePolicy: "docs/workflows/governed-worker-execution-dry-run.md",
    futureApprovalRequired: "Raw-failure-retention approval",
  },
  {
    fixtureName: "denied-delivery.json",
    reason: "delivery_requested",
    authorityFamily: "github-delivery",
    sourcePolicy: "docs/workflows/execution-authority-boundary.md",
    futureApprovalRequired: "Delivery approval through existing PR guardrails",
  },
  {
    fixtureName: "denied-cleanup.json",
    reason: "cleanup_requested",
    authorityFamily: "cleanup-automation",
    sourcePolicy: "docs/workflows/execution-authority-boundary.md",
    futureApprovalRequired: "Target-specific cleanup approval",
  },
  {
    fixtureName: "denied-adaptive-trust.json",
    reason: "adaptive_trust_effect_requested",
    authorityFamily: "adaptive-scoring",
    sourcePolicy: "docs/workflows/governed-worker-execution-dry-run.md",
    futureApprovalRequired: "Adaptive-scoring approval",
  },
  {
    fixtureName: "denied-live-status.json",
    reason: "live_status_requested",
    authorityFamily: "worker-process-launch",
    sourcePolicy: "docs/architecture/kendall-vnxt-process-lifecycle-design-2026-06-08.md",
    futureApprovalRequired: "Exact live-launch approval with lifecycle controls",
  },
  {
    fixtureName: "denied-observed-text-authority.json",
    reason: "observed_text_authority_requested",
    authorityFamily: "source-policy-boundary",
    sourcePolicy: "docs/workflows/governed-worker-execution-dry-run.md",
    futureApprovalRequired: "Explicit operator approval or active source-owned policy update",
  },
  {
    fixtureName: "denied-command-shell-string.json",
    reason: "invalid_command_allowlist",
    authorityFamily: "worker-command-execution",
    sourcePolicy: "docs/workflows/governed-worker-execution-dry-run.md",
    futureApprovalRequired: "Worker command execution approval",
  },
  {
    fixtureName: "denied-command-transitive-effects.json",
    reason: "invalid_command_allowlist",
    authorityFamily: "worker-command-execution",
    sourcePolicy: "docs/workflows/governed-worker-execution-dry-run.md",
    futureApprovalRequired: "Worker command execution approval",
  },
  {
    fixtureName: "denied-path-escape.json",
    reason: "path_escape",
    authorityFamily: "worker-source-mutation",
    sourcePolicy: "docs/architecture/kendall-vnxt-worker-threat-boundary-2026-06-08.md",
    futureApprovalRequired: "Source mutation approval with workspace/path boundary proof",
  },
  {
    fixtureName: "denied-worker-shadow-delivery-exposure.json",
    reason: "worker_shadow_delivery_exposed",
    authorityFamily: "github-delivery",
    sourcePolicy: "docs/workflows/governed-worker-execution-dry-run.md",
    futureApprovalRequired: "Delivery approval through existing PR guardrails",
  },
]);

function sorted(value) {
  return [...value].sort();
}

async function readFixture(name) {
  const text = await readFile(new URL(name, fixtureBase), "utf8");
  return JSON.parse(text);
}

test("accepted Claude and Hermes dry-run fixtures validate with metadata-only result fields", async () => {
  const fixtureNames = ["claude-dry-run-ok.json", "hermes-dry-run-ok.json"];

  for (const fixtureName of fixtureNames) {
    const packet = await readFixture(fixtureName);
    const result = validateDryRunPacket(packet);

    assert.equal(result.ok, true, `${fixtureName} should validate`);
    assert.equal(result.packet_id, packet.packet_id);
    assert.equal(result.worker, packet.worker);
    assert.equal(result.mode, "dry_run");
    assert.equal(result.authority_level, packet.authority_level);
    assert.deepEqual(result.denied_reasons, []);
    assert.deepEqual(result.field_reasons, []);
    assert.deepEqual(sorted(packet.stop_lines), sorted(REQUIRED_STOP_LINES));
    assert.deepEqual(sorted(result.blocked_operations), sorted(BLOCKED_AUTHORITY_FAMILIES));
    assert.ok(result.evidence_refs.length > 0, "evidence refs should be retained as metadata");
    assert.ok(result.status_events.length > 0, "status events should be retained as metadata");
  }
});

test("real tool readiness probes validate metadata-only availability without launch authority", () => {
  for (const probe of [
    {
      probe_id: "probe:claude-readiness",
      worker: "claude",
      mode: "readiness_only",
      authority_level: "non_executing",
      readiness_state: "available",
      command_resolution: "operator_shell_observation",
      command_path: "/usr/local/bin/claude",
      command_version: "2.1.179 Claude Code",
      observed_at: "2026-06-27T00:00:00Z",
      evidence_ref: "metadata:worker-readiness/claude",
      network_required: false,
      session_inheritance_required: false,
      credential_access_required: false,
      raw_output_retained: false,
      affects_trust: false,
      affects_routing: false,
      launch_attempted: false,
    },
    {
      probe_id: "probe:hermes-readiness",
      worker: "hermes",
      mode: "readiness_only",
      authority_level: "non_executing",
      readiness_state: "missing",
      command_resolution: "fixture",
      command_path: null,
      command_version: null,
      observed_at: "2026-06-27T00:00:00Z",
      evidence_ref: "metadata:worker-readiness/hermes",
      network_required: false,
      session_inheritance_required: false,
      credential_access_required: false,
      raw_output_retained: false,
      affects_trust: false,
      affects_routing: false,
      launch_attempted: false,
    },
  ]) {
    const result = validateToolReadinessProbe(probe);
    assert.equal(result.ok, true, `${probe.worker} readiness probe should validate`);
    assert.equal(result.mode, "readiness_only");
    assert.equal(result.authority_level, "non_executing");
    assert.equal(result.readiness_state, probe.readiness_state);
    assert.equal(result.evidence_ref, probe.evidence_ref);
    assert.deepEqual(result.denied_reasons, []);
  }
});

test("governed worker readiness collector reports available only with operator-observed version", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "knx-readiness-"));
  try {
    const claudePath = join(tempDir, "claude");
    await writeFile(claudePath, "#!/bin/sh\nexit 0\n", "utf8");
    await chmod(claudePath, 0o755);

    const [result] = collectToolReadinessProbes({
      env: { PATH: tempDir },
      observedAt: "2026-06-27T00:00:00Z",
      versions: new Map([["claude", "2.1.179 Claude Code"]]),
      workers: ["claude"],
    });

    assert.equal(result.validation.ok, true);
    assert.equal(result.probe.worker, "claude");
    assert.equal(result.probe.readiness_state, "available");
    assert.equal(result.probe.command_path, claudePath);
    assert.equal(result.probe.command_version, "2.1.179 Claude Code");
    assert.equal(result.probe.command_resolution, "operator_shell_observation");
    assert.equal(result.probe.network_required, false);
    assert.equal(result.probe.session_inheritance_required, false);
    assert.equal(result.probe.credential_access_required, false);
    assert.equal(result.probe.raw_output_retained, false);
    assert.equal(result.probe.affects_trust, false);
    assert.equal(result.probe.affects_routing, false);
    assert.equal(result.probe.launch_attempted, false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("collector blocks found workers without version and reports missing workers with explicit nulls", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "knx-readiness-"));
  try {
    const claudePath = join(tempDir, "claude");
    await writeFile(claudePath, "#!/bin/sh\nexit 0\n", "utf8");
    await chmod(claudePath, 0o755);

    const results = collectToolReadinessProbes({
      env: { PATH: tempDir },
      observedAt: "2026-06-27T00:00:00Z",
      versions: new Map(),
      workers: ["claude", "hermes"],
    });

    const claude = results.find((result) => result.probe.worker === "claude");
    const hermes = results.find((result) => result.probe.worker === "hermes");

    assert.equal(claude.validation.ok, true);
    assert.equal(claude.probe.readiness_state, "blocked");
    assert.equal(claude.probe.command_path, claudePath);
    assert.equal(claude.probe.command_version, null);
    assert.equal(claude.probe.launch_attempted, false);

    assert.equal(hermes.validation.ok, true);
    assert.equal(hermes.probe.readiness_state, "missing");
    assert.equal(hermes.probe.command_path, null);
    assert.equal(hermes.probe.command_version, null);
    assert.equal(hermes.probe.launch_attempted, false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("collector ignores executable directories when discovering worker paths", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "knx-readiness-"));
  try {
    await mkdir(join(tempDir, "claude"));
    await chmod(join(tempDir, "claude"), 0o755);

    const [result] = collectToolReadinessProbes({
      env: { PATH: tempDir },
      observedAt: "2026-06-27T00:00:00Z",
      versions: new Map([["claude", "2.1.179 Claude Code"]]),
      workers: ["claude"],
    });

    assert.equal(result.validation.ok, true);
    assert.equal(result.probe.readiness_state, "missing");
    assert.equal(result.probe.command_path, null);
    assert.equal(result.probe.command_version, null);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("collector CLI fails closed for invalid blocked or missing validation results", () => {
  const invalidObservedAt = spawnSync(
    process.execPath,
    [readinessCollectorPath, "--workers", "claude", "--observed-at", "not-a-date"],
    { encoding: "utf8", env: { ...process.env, PATH: "" } },
  );

  assert.notEqual(invalidObservedAt.status, 0);
  const invalidObservedAtOutput = JSON.parse(invalidObservedAt.stdout);
  assert.equal(invalidObservedAtOutput.results[0].probe.readiness_state, "missing");
  assert.equal(invalidObservedAtOutput.results[0].validation.ok, false);
  assert.ok(
    invalidObservedAtOutput.results[0].validation.field_reasons.some((reason) => reason.field === "observed_at"),
  );

  const unknownWorker = spawnSync(process.execPath, [readinessCollectorPath, "--workers", "claud"], { encoding: "utf8" });
  assert.notEqual(unknownWorker.status, 0);
  const unknownWorkerOutput = JSON.parse(unknownWorker.stdout);
  assert.deepEqual(unknownWorkerOutput.results, []);
  assert.ok(unknownWorkerOutput.errors.some((error) => error.reason === "unknown_worker"));
  assert.ok(unknownWorkerOutput.errors.some((error) => error.reason === "empty_worker_selection"));

  const emptyWorker = spawnSync(process.execPath, [readinessCollectorPath, "--workers", ""], { encoding: "utf8" });
  assert.notEqual(emptyWorker.status, 0);
  const emptyWorkerOutput = JSON.parse(emptyWorker.stdout);
  assert.deepEqual(emptyWorkerOutput.results, []);
  assert.ok(emptyWorkerOutput.errors.some((error) => error.reason === "empty_worker_selection"));
});

test("collector CLI rejects unsafe version observations without echoing raw input", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "knx-readiness-"));
  try {
    const claudePath = join(tempDir, "claude");
    await writeFile(claudePath, "#!/bin/sh\nexit 0\n", "utf8");
    await chmod(claudePath, 0o755);

    const result = spawnSync(
      process.execPath,
      [readinessCollectorPath, "--workers", "claude", "--version", "claude=raw_prompt sk-proj-123456789"],
      { encoding: "utf8", env: { ...process.env, PATH: tempDir } },
    );

    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout, /sk-proj-123456789/);
    assert.doesNotMatch(result.stdout, /raw_prompt/);
    const output = JSON.parse(result.stdout);
    assert.equal(output.results[0].probe.readiness_state, "blocked");
    assert.equal(output.results[0].probe.command_version, null);
    assert.ok(output.errors.some((error) => error.reason === "invalid_version_observation"));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("collector ignores relative PATH entries and does not expose launch authority", async () => {
  const [result] = collectToolReadinessProbes({
    env: { PATH: ["relative-bin", ""].join(":"), PWD: process.cwd() },
    observedAt: "2026-06-27T00:00:00Z",
    versions: new Map([["claude", "2.1.179 Claude Code"]]),
    workers: ["claude"],
  });

  assert.equal(result.validation.ok, true);
  assert.equal(result.probe.readiness_state, "missing");
  assert.equal(result.probe.command_path, null);
  assert.equal(result.probe.command_version, null);
  assert.equal(result.probe.launch_attempted, false);

  const source = await readFile(readinessCollectorSourcePath, "utf8");
  for (const forbiddenPattern of [
    /\bchild_process\b/,
    /\bspawn\b/,
    /\bexec\b/,
    /\bfetch\s*\(/,
    /\bnode:http\b/,
    /\bnode:https\b/,
    /\bnode:net\b/,
    /\bnode:tls\b/,
    /\bnode:dns\b/,
    /\bWebSocket\b/,
    /\bgh\s+/,
    /\brm\s+/,
    /\bwriteFile\b/,
  ]) {
    assert.doesNotMatch(source, forbiddenPattern);
  }
});

test("governed worker version probe launches only --version without shell or task authority", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "knx-version-probe-"));
  try {
    const claudePath = join(tempDir, "claude");
    await writeFile(
      claudePath,
      "#!/bin/sh\nif [ \"$1\" != \"--version\" ]; then echo bad-args; exit 9; fi\necho 'Claude Code 2.1.179'\n",
      "utf8",
    );
    await chmod(claudePath, 0o755);

    const [result] = collectToolVersionProbeAttempts({
      env: { PATH: tempDir },
      observedAt: "2026-06-27T00:00:00Z",
      timeoutMs: 500,
      workers: ["claude"],
    });

    assert.equal(result.validation.ok, true);
    assert.equal(result.attempt.worker, "claude");
    assert.equal(result.attempt.mode, "version_probe");
    assert.equal(result.attempt.authority_level, "worker_version_probe");
    assert.equal(result.attempt.probe_state, "version_observed");
    assert.equal(result.attempt.command_path, claudePath);
    assert.deepEqual(result.attempt.command_args, ["--version"]);
    assert.equal(result.attempt.command_version, "Claude Code 2.1.179");
    assert.equal(result.attempt.exit_code, 0);
    assert.equal(result.attempt.shell_used, false);
    assert.equal(result.attempt.task_execution_allowed, false);
    assert.equal(result.attempt.network_required, false);
    assert.equal(result.attempt.safe_cwd, "/tmp");
    assert.equal(result.attempt.source_mutation_allowed, false);
    assert.equal(result.attempt.raw_output_retained, false);
    assert.equal(result.attempt.affects_trust, false);
    assert.equal(result.attempt.affects_routing, false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("version probe records missing failed timeout and unsafe-output states as metadata", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "knx-version-probe-"));
  try {
    const claudePath = join(tempDir, "claude");
    const hermesPath = join(tempDir, "hermes");
    await writeFile(claudePath, "#!/bin/sh\necho 'Claude Code 2.1.179'\necho 'raw_prompt sk-proj-123456789'\n", "utf8");
    await writeFile(hermesPath, "#!/bin/sh\nexit 7\n", "utf8");
    await chmod(claudePath, 0o755);
    await chmod(hermesPath, 0o755);

    const results = collectToolVersionProbeAttempts({
      env: { PATH: tempDir },
      observedAt: "2026-06-27T00:00:00Z",
      timeoutMs: 500,
      workers: ["claude", "hermes"],
    });

    const claude = results.find((result) => result.attempt.worker === "claude");
    const hermes = results.find((result) => result.attempt.worker === "hermes");
    assert.equal(claude.validation.ok, true);
    assert.equal(claude.attempt.probe_state, "invalid_output");
    assert.equal(claude.attempt.command_version, null);
    assert.doesNotMatch(JSON.stringify(claude), /sk-proj-123456789/);
    assert.equal(hermes.validation.ok, true);
    assert.equal(hermes.attempt.probe_state, "failed");
    assert.equal(hermes.attempt.exit_code, 7);

    const missing = collectToolVersionProbeAttempts({
      env: { PATH: tempDir },
      observedAt: "2026-06-27T00:00:00Z",
      timeoutMs: 500,
      workers: ["missing-worker"],
    })[0];
    assert.equal(missing.validation.ok, false);
    assert.equal(missing.validation.worker, null);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("version probe validator fails closed for task shell trust routing or raw retention effects", () => {
  const baseAttempt = {
    probe_id: "probe:claude-version",
    worker: "claude",
    mode: "version_probe",
    authority_level: "worker_version_probe",
    probe_state: "version_observed",
    command_path: "/usr/local/bin/claude",
    command_args: ["--version"],
    command_version: "Claude Code 2.1.179",
    exit_code: 0,
    timed_out: false,
    timeout_ms: 500,
    observed_at: "2026-06-27T00:00:00Z",
    evidence_ref: "metadata:worker-version-probe/claude",
    shell_used: false,
    task_execution_allowed: false,
    network_required: false,
    safe_cwd: "/tmp",
    source_mutation_allowed: false,
    raw_output_retained: false,
    affects_trust: false,
    affects_routing: false,
  };

  assert.equal(validateToolVersionProbeAttempt(baseAttempt).ok, true);

  for (const [field, value] of [
    ["mode", "dry_run"],
    ["authority_level", "worker_task_execution"],
    ["probe_state", "task_complete"],
    ["command_path", "claude"],
    ["command_args", ["--print", "hello"]],
    ["command_version", "raw_prompt sk-proj-123456789"],
    ["timeout_ms", 5000],
    ["shell_used", true],
    ["task_execution_allowed", true],
    ["network_required", true],
    ["safe_cwd", process.cwd()],
    ["source_mutation_allowed", true],
    ["raw_output_retained", true],
    ["affects_trust", true],
    ["affects_routing", true],
  ]) {
    const result = validateToolVersionProbeAttempt({ ...baseAttempt, [field]: value });
    assert.equal(result.ok, false, `${field} should fail version-probe validation`);
    assert.ok(result.field_reasons.some((reason) => reason.field === field || reason.field === "probe_state"));
  }
});

test("version probe CLI rejects unknown workers invalid timeout and invalid timestamps", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "knx-version-probe-"));
  try {
    const claudePath = join(tempDir, "claude");
    const sentinelPath = join(tempDir, "sentinel");
    await writeFile(claudePath, `#!/bin/sh\ntouch '${sentinelPath}'\necho 'Claude Code 2.1.179'\n`, "utf8");
    await chmod(claudePath, 0o755);

    const unknownWorker = spawnSync(process.execPath, [versionProbePath, "--workers", "claud"], { encoding: "utf8" });
    assert.notEqual(unknownWorker.status, 0);
    const unknownWorkerOutput = JSON.parse(unknownWorker.stdout);
    assert.deepEqual(unknownWorkerOutput.results, []);
    assert.ok(unknownWorkerOutput.errors.some((error) => error.reason === "unknown_worker"));
    assert.ok(unknownWorkerOutput.errors.some((error) => error.reason === "empty_worker_selection"));

    const invalidTimeout = spawnSync(
      process.execPath,
      [versionProbePath, "--workers", "claude", "--timeout-ms", "5000"],
      { encoding: "utf8", env: { ...process.env, PATH: tempDir } },
    );
    assert.notEqual(invalidTimeout.status, 0);
    const invalidTimeoutOutput = JSON.parse(invalidTimeout.stdout);
    assert.deepEqual(invalidTimeoutOutput.results, []);
    assert.ok(invalidTimeoutOutput.errors.some((error) => error.reason === "invalid_timeout"));
    assert.equal(existsSync(sentinelPath), false);

    const invalidTimestamp = spawnSync(
      process.execPath,
      [versionProbePath, "--workers", "claude", "--observed-at", "not-a-date"],
      { encoding: "utf8", env: { ...process.env, PATH: tempDir } },
    );
    assert.notEqual(invalidTimestamp.status, 0);
    const invalidTimestampOutput = JSON.parse(invalidTimestamp.stdout);
    assert.deepEqual(invalidTimestampOutput.results, []);
    assert.ok(invalidTimestampOutput.errors.some((error) => error.reason === "invalid_observed_at"));
    assert.equal(existsSync(sentinelPath), false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("version probe skips workspace PATH entries and never launches unknown direct-call workers", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "knx-version-probe-"));
  try {
    const workspaceBin = join(tempDir, "workspace", "bin");
    const safeBin = join(tempDir, "safe-bin");
    await mkdir(workspaceBin, { recursive: true });
    await mkdir(safeBin, { recursive: true });
    const workspaceSentinel = join(tempDir, "workspace-sentinel");
    const unknownSentinel = join(tempDir, "unknown-sentinel");
    await writeFile(join(workspaceBin, "claude"), `#!/bin/sh\ntouch '${workspaceSentinel}'\necho bad\n`, "utf8");
    await writeFile(join(safeBin, "missing-worker"), `#!/bin/sh\ntouch '${unknownSentinel}'\necho bad\n`, "utf8");
    await chmod(join(workspaceBin, "claude"), 0o755);
    await chmod(join(safeBin, "missing-worker"), 0o755);

    const skippedWorkspace = collectToolVersionProbeAttempts({
      env: { PATH: [workspaceBin, safeBin].join(":"), PWD: join(tempDir, "workspace") },
      observedAt: "2026-06-27T00:00:00Z",
      timeoutMs: 500,
      workers: ["claude"],
    })[0];
    assert.equal(skippedWorkspace.validation.ok, true);
    assert.equal(skippedWorkspace.attempt.probe_state, "missing");
    assert.equal(existsSync(workspaceSentinel), false);

    const unknownWorker = collectToolVersionProbeAttempts({
      env: { PATH: safeBin, PWD: tempDir },
      observedAt: "2026-06-27T00:00:00Z",
      timeoutMs: 500,
      workers: ["missing-worker"],
    })[0];
    assert.equal(unknownWorker.validation.ok, false);
    assert.equal(unknownWorker.validation.worker, null);
    assert.equal(unknownWorker.attempt.command_path, null);
    assert.equal(existsSync(unknownSentinel), false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("version probe uses SIGKILL timeout for workers that trap TERM", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "knx-version-probe-"));
  try {
    const claudePath = join(tempDir, "claude");
    await writeFile(claudePath, "#!/bin/sh\ntrap '' TERM\nwhile true; do :; done\n", "utf8");
    await chmod(claudePath, 0o755);

    const startedAt = Date.now();
    const [result] = collectToolVersionProbeAttempts({
      env: { PATH: tempDir, PWD: process.cwd() },
      observedAt: "2026-06-27T00:00:00Z",
      timeoutMs: 100,
      workers: ["claude"],
    });
    const elapsedMs = Date.now() - startedAt;

    assert.equal(result.validation.ok, true);
    assert.equal(result.attempt.probe_state, "timed_out");
    assert.equal(result.attempt.timed_out, true);
    assert.ok(elapsedMs < 1500, `timeout should be bounded, got ${elapsedMs}ms`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("version probe command avoids shell network GitHub cleanup and source mutation primitives", async () => {
  const source = await readFile(versionProbeSourcePath, "utf8");
  assert.match(source, /spawnSync\(commandPath, VERSION_ARGS/);
  assert.match(source, /shell: false/);
  for (const forbiddenPattern of [
    /\bfetch\s*\(/,
    /\bnode:http\b/,
    /\bnode:https\b/,
    /\bnode:net\b/,
    /\bnode:tls\b/,
    /\bnode:dns\b/,
    /\bWebSocket\b/,
    /\bgh\s+/,
    /\brm\s+/,
    /\bunlink\b/,
    /\brmdir\b/,
    /\bwriteFile\b/,
  ]) {
    assert.doesNotMatch(source, forbiddenPattern);
  }
});

test("governed Claude smoke execution uses fixed print JSON prompt without tools or source authority", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "knx-smoke-"));
  try {
    const claudePath = join(tempDir, "claude");
    await writeFile(
      claudePath,
      "#!/bin/sh\ncase \" $* \" in *'--print'*'--output-format json'*'--safe-mode'*'--tools  '*'KENDALL_SMOKE_OK'*) echo '{\"result\":\"KENDALL_SMOKE_OK\"}'; exit 0;; *) echo bad-args; exit 9;; esac\n",
      "utf8",
    );
    await chmod(claudePath, 0o755);

    const [result] = collectSmokeExecutionAttempts({
      env: { PATH: tempDir, PWD: process.cwd() },
      observedAt: "2026-06-27T00:00:00Z",
      timeoutMs: 1000,
      workers: ["claude"],
    });

    assert.equal(result.validation.ok, true);
    assert.equal(result.attempt.worker, "claude");
    assert.equal(result.attempt.mode, "smoke_execution");
    assert.equal(result.attempt.authority_level, "isolated_worker_smoke");
    assert.equal(result.attempt.execution_state, "smoke_observed");
    assert.equal(result.attempt.command_path, claudePath);
    assert.deepEqual(result.attempt.command_args.slice(0, 2), ["--print", "--output-format"]);
    assert.equal(result.attempt.command_args.includes("--safe-mode"), true);
    assert.equal(result.attempt.command_args.includes("--no-session-persistence"), true);
    assert.equal(result.attempt.command_args.includes("--max-budget-usd"), true);
    assert.equal(result.attempt.expected_response, "KENDALL_SMOKE_OK");
    assert.equal(result.attempt.observed_response, "KENDALL_SMOKE_OK");
    assert.equal(result.attempt.shell_used, false);
    assert.equal(result.attempt.network_allowed, true);
    assert.equal(result.attempt.session_inheritance_allowed, true);
    assert.equal(result.attempt.source_mutation_allowed, false);
    assert.equal(result.attempt.tools_allowed, false);
    assert.equal(result.attempt.raw_output_retained, false);
    assert.equal(result.attempt.affects_trust, false);
    assert.equal(result.attempt.affects_routing, false);
    assert.match(result.attempt.safe_cwd, /^\/tmp\/kendall-worker-smoke-/);
    assert.equal(existsSync(result.attempt.safe_cwd), false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("smoke execution accepts Claude JSON result while ignoring token usage metadata", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "knx-smoke-"));
  try {
    const claudePath = join(tempDir, "claude");
    await writeFile(
      claudePath,
      "#!/bin/sh\necho '{\"type\":\"result\",\"result\":\"KENDALL_SMOKE_OK\",\"usage\":{\"inputTokens\":1,\"outputTokens\":1},\"session_id\":\"00000000-0000-0000-0000-000000000000\"}'\n",
      "utf8",
    );
    await chmod(claudePath, 0o755);

    const [result] = collectSmokeExecutionAttempts({
      env: { PATH: tempDir, PWD: process.cwd() },
      observedAt: "2026-06-27T00:00:00Z",
      timeoutMs: 1000,
      workers: ["claude"],
    });

    assert.equal(result.validation.ok, true);
    assert.equal(result.attempt.execution_state, "smoke_observed");
    assert.equal(result.attempt.observed_response, "KENDALL_SMOKE_OK");
    assert.doesNotMatch(JSON.stringify(result), /inputTokens|outputTokens|session_id/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("smoke execution reports unsupported Hermes and invalid Claude output without raw retention", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "knx-smoke-"));
  try {
    const claudePath = join(tempDir, "claude");
    await writeFile(claudePath, "#!/bin/sh\necho '{\"result\":\"KENDALL_SMOKE_OK\"}'\necho 'raw_prompt sk-proj-123456789'\n", "utf8");
    await chmod(claudePath, 0o755);

    const results = collectSmokeExecutionAttempts({
      env: { PATH: tempDir, PWD: process.cwd() },
      observedAt: "2026-06-27T00:00:00Z",
      timeoutMs: 1000,
      workers: ["claude", "hermes"],
    });
    const claude = results.find((result) => result.attempt.worker === "claude");
    const hermes = results.find((result) => result.attempt.worker === "hermes");

    assert.equal(claude.validation.ok, true);
    assert.equal(claude.attempt.execution_state, "invalid_output");
    assert.equal(claude.attempt.observed_response, null);
    assert.doesNotMatch(JSON.stringify(claude), /sk-proj-123456789/);
    assert.equal(hermes.validation.ok, true);
    assert.equal(hermes.attempt.execution_state, "unsupported");
    assert.equal(hermes.attempt.command_path, null);
    assert.deepEqual(hermes.attempt.command_args, []);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("smoke execution CLI parse errors and unsupported workers stop before launch", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "knx-smoke-"));
  try {
    const claudePath = join(tempDir, "claude");
    const sentinelPath = join(tempDir, "sentinel");
    await writeFile(claudePath, `#!/bin/sh\ntouch '${sentinelPath}'\necho '{\"result\":\"KENDALL_SMOKE_OK\"}'\n`, "utf8");
    await chmod(claudePath, 0o755);

    const invalidTimeout = spawnSync(
      process.execPath,
      [smokeExecutionPath, "--workers", "claude", "--timeout-ms", "50000"],
      { encoding: "utf8", env: { ...process.env, PATH: tempDir } },
    );
    assert.notEqual(invalidTimeout.status, 0);
    const invalidTimeoutOutput = JSON.parse(invalidTimeout.stdout);
    assert.deepEqual(invalidTimeoutOutput.results, []);
    assert.ok(invalidTimeoutOutput.errors.some((error) => error.reason === "invalid_timeout"));
    assert.equal(existsSync(sentinelPath), false);

    const unknownWorker = spawnSync(process.execPath, [smokeExecutionPath, "--workers", "codex"], { encoding: "utf8" });
    assert.notEqual(unknownWorker.status, 0);
    const unknownWorkerOutput = JSON.parse(unknownWorker.stdout);
    assert.deepEqual(unknownWorkerOutput.results, []);
    assert.ok(unknownWorkerOutput.errors.some((error) => error.reason === "unknown_worker"));
    assert.ok(unknownWorkerOutput.errors.some((error) => error.reason === "empty_worker_selection"));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("smoke execution skips symlinked workspace PATH entries and filters runtime PATH", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "knx-smoke-"));
  try {
    const workspace = join(tempDir, "workspace");
    const workspaceBin = join(workspace, "bin");
    const safeBin = join(tempDir, "safe-bin");
    const symlinkBin = join(tempDir, "symlink-bin");
    const workspaceSentinel = join(tempDir, "workspace-sentinel");
    const helperSentinel = join(tempDir, "helper-sentinel");
    await mkdir(workspaceBin, { recursive: true });
    await mkdir(safeBin, { recursive: true });
    await writeFile(join(workspaceBin, "claude"), `#!/bin/sh\ntouch '${workspaceSentinel}'\necho bad\n`, "utf8");
    await writeFile(join(workspaceBin, "helper"), `#!/bin/sh\ntouch '${helperSentinel}'\n`, "utf8");
    await writeFile(
      join(safeBin, "claude"),
      "#!/bin/sh\nif command -v helper >/dev/null 2>&1; then helper; fi\necho '{\"result\":\"KENDALL_SMOKE_OK\"}'\n",
      "utf8",
    );
    await chmod(join(workspaceBin, "claude"), 0o755);
    await chmod(join(workspaceBin, "helper"), 0o755);
    await chmod(join(safeBin, "claude"), 0o755);
    await symlink(workspaceBin, symlinkBin);

    const [result] = collectSmokeExecutionAttempts({
      env: { PATH: [symlinkBin, safeBin, workspaceBin].join(":"), PWD: workspace },
      observedAt: "2026-06-27T00:00:00Z",
      timeoutMs: 1000,
      workers: ["claude"],
    });

    assert.equal(result.validation.ok, true);
    assert.equal(result.attempt.command_path, join(safeBin, "claude"));
    assert.equal(result.attempt.execution_state, "smoke_observed");
    assert.equal(existsSync(workspaceSentinel), false);
    assert.equal(existsSync(helperSentinel), false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("smoke execution validator fails closed for tools source mutation raw retention trust or routing effects", () => {
  const baseAttempt = {
    attempt_id: "smoke:claude",
    worker: "claude",
    mode: "smoke_execution",
    authority_level: "isolated_worker_smoke",
    execution_state: "smoke_observed",
    command_path: "/usr/local/bin/claude",
    command_args: [
      "--print",
      "--output-format",
      "json",
      "--input-format",
      "text",
      "--permission-mode",
      "dontAsk",
      "--no-session-persistence",
      "--safe-mode",
      "--tools",
      "",
      "--max-budget-usd",
      "0.05",
      "Reply exactly with KENDALL_SMOKE_OK. Do not explain.",
    ],
    expected_response: "KENDALL_SMOKE_OK",
    observed_response: "KENDALL_SMOKE_OK",
    exit_code: 0,
    timed_out: false,
    timeout_ms: 1000,
    observed_at: "2026-06-27T00:00:00Z",
    evidence_ref: "metadata:worker-smoke-execution/claude",
    shell_used: false,
    safe_cwd: "/tmp/kendall-worker-smoke-test",
    network_allowed: true,
    session_inheritance_allowed: true,
    source_mutation_allowed: false,
    tools_allowed: false,
    raw_output_retained: false,
    affects_trust: false,
    affects_routing: false,
  };
  assert.equal(validateSmokeExecutionAttempt(baseAttempt).ok, true);

  for (const [field, value] of [
    ["command_args", ["--print", "mutate this repo"]],
    ["observed_response", "raw_prompt sk-proj-123456789"],
    ["shell_used", true],
    ["safe_cwd", process.cwd()],
    ["safe_cwd", "/tmp/kendall-worker-smoke-good/../repo"],
    ["source_mutation_allowed", true],
    ["tools_allowed", true],
    ["raw_output_retained", true],
    ["affects_trust", true],
    ["affects_routing", true],
  ]) {
    const result = validateSmokeExecutionAttempt({ ...baseAttempt, [field]: value });
    assert.equal(result.ok, false, `${field} should fail smoke validation`);
    assert.ok(result.field_reasons.some((reason) => reason.field === field || reason.field === "execution_state" || reason.field === "$"));
  }
});

test("smoke execution command avoids shell GitHub cleanup and source mutation primitives", async () => {
  const source = await readFile(smokeExecutionSourcePath, "utf8");
  assert.match(source, /spawnSync\(commandPath, commandArgs/);
  assert.match(source, /shell: false/);
  assert.match(source, /--safe-mode/);
  assert.match(source, /--no-session-persistence/);
  for (const forbiddenPattern of [
    /\bnode:http\b/,
    /\bnode:https\b/,
    /\bnode:net\b/,
    /\bnode:tls\b/,
    /\bnode:dns\b/,
    /\bWebSocket\b/,
    /\bgh\s+/,
    /\brm\s+/,
    /\bunlink\b/,
    /\brmdir\b/,
    /\bwriteFile\b/,
  ]) {
    assert.doesNotMatch(source, forbiddenPattern);
  }
});

async function createTrackedSourceWorktree(tempDir) {
  const sourceWorktree = join(tempDir, "source-worktree");
  await mkdir(sourceWorktree, { recursive: true });
  await writeFile(join(sourceWorktree, "README.md"), "copy execution fixture\n", "utf8");
  assert.equal(spawnSync("git", ["init", "-q"], { cwd: sourceWorktree }).status, 0);
  assert.equal(spawnSync("git", ["add", "README.md"], { cwd: sourceWorktree }).status, 0);
  return sourceWorktree;
}

test("governed copied-worktree Claude execution uses an ephemeral tracked-file copy", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "knx-copy-exec-"));
  try {
    const sourceWorktree = await createTrackedSourceWorktree(tempDir);
    const safeBin = join(tempDir, "safe-bin");
    await mkdir(safeBin, { recursive: true });
    const claudePath = join(safeBin, "claude");
    await writeFile(
      claudePath,
      "#!/bin/sh\n[ -f README.md ] || exit 8\necho '{\"result\":\"KENDALL_COPY_EXECUTION_OK\"}'\n",
      "utf8",
    );
    await chmod(claudePath, 0o755);

    const [result] = collectCopiedWorktreeExecutionAttempts({
      env: { PATH: safeBin, PWD: sourceWorktree },
      observedAt: "2026-06-27T00:00:00Z",
      sourceWorktree,
      timeoutMs: 1000,
      workers: ["claude"],
    });

    assert.equal(result.validation.ok, true);
    assert.equal(result.attempt.worker, "claude");
    assert.equal(result.attempt.mode, "copied_worktree_execution");
    assert.equal(result.attempt.authority_level, "copied_worktree_worker_execution");
    assert.equal(result.attempt.execution_state, "execution_observed");
    assert.equal(result.attempt.command_path, claudePath);
    assert.equal(result.attempt.expected_response, "KENDALL_COPY_EXECUTION_OK");
    assert.equal(result.attempt.observed_response, "KENDALL_COPY_EXECUTION_OK");
    assert.equal(result.attempt.shell_used, false);
    assert.equal(result.attempt.source_worktree, sourceWorktree);
    assert.match(result.attempt.execution_cwd, /^\/tmp\/kendall-worker-copy-exec-/);
    assert.equal(existsSync(result.attempt.execution_cwd), false);
    assert.equal(result.attempt.copied_tracked_files, 1);
    assert.equal(result.attempt.copy_bytes, 23);
    assert.equal(result.attempt.copy_retained, false);
    assert.equal(result.attempt.network_allowed, true);
    assert.equal(result.attempt.session_inheritance_allowed, true);
    assert.equal(result.attempt.source_mutation_allowed, false);
    assert.equal(result.attempt.tools_allowed, false);
    assert.equal(result.attempt.raw_output_retained, false);
    assert.equal(result.attempt.affects_trust, false);
    assert.equal(result.attempt.affects_routing, false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("copied-worktree execution reports unsupported Hermes and invalid Claude output without raw retention", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "knx-copy-exec-"));
  try {
    const sourceWorktree = await createTrackedSourceWorktree(tempDir);
    const safeBin = join(tempDir, "safe-bin");
    await mkdir(safeBin, { recursive: true });
    const claudePath = join(safeBin, "claude");
    await writeFile(claudePath, "#!/bin/sh\necho '{\"result\":\"KENDALL_COPY_EXECUTION_OK\"}'\necho 'provider_payload sk-proj-123456789'\n", "utf8");
    await chmod(claudePath, 0o755);

    const results = collectCopiedWorktreeExecutionAttempts({
      env: { PATH: safeBin, PWD: sourceWorktree },
      observedAt: "2026-06-27T00:00:00Z",
      sourceWorktree,
      timeoutMs: 1000,
      workers: ["claude", "hermes"],
    });
    const claude = results.find((result) => result.attempt.worker === "claude");
    const hermes = results.find((result) => result.attempt.worker === "hermes");

    assert.equal(claude.validation.ok, true);
    assert.equal(claude.attempt.execution_state, "invalid_output");
    assert.equal(claude.attempt.observed_response, null);
    assert.doesNotMatch(JSON.stringify(claude), /sk-proj-123456789/);
    assert.equal(existsSync(claude.attempt.execution_cwd), false);
    assert.equal(hermes.validation.ok, true);
    assert.equal(hermes.attempt.execution_state, "unsupported");
    assert.equal(hermes.attempt.command_path, null);
    assert.deepEqual(hermes.attempt.command_args, []);
    assert.equal(hermes.attempt.copied_tracked_files, 0);
    assert.equal(existsSync(hermes.attempt.execution_cwd), false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("copied-worktree execution requires Claude JSON output and complete tracked-file copy", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "knx-copy-exec-"));
  try {
    const plaintextSource = await createTrackedSourceWorktree(join(tempDir, "plaintext"));
    const safeBin = join(tempDir, "safe-bin");
    await mkdir(safeBin, { recursive: true });
    await writeFile(join(safeBin, "claude"), "#!/bin/sh\necho 'KENDALL_COPY_EXECUTION_OK'\n", "utf8");
    await chmod(join(safeBin, "claude"), 0o755);

    const [plaintextResult] = collectCopiedWorktreeExecutionAttempts({
      env: { PATH: safeBin, PWD: plaintextSource },
      observedAt: "2026-06-27T00:00:00Z",
      sourceWorktree: plaintextSource,
      timeoutMs: 1000,
      workers: ["claude"],
    });
    assert.equal(plaintextResult.validation.ok, true);
    assert.equal(plaintextResult.attempt.execution_state, "invalid_output");
    assert.equal(plaintextResult.attempt.observed_response, null);

    const oversizedSource = await createTrackedSourceWorktree(join(tempDir, "oversized"));
    await writeFile(join(oversizedSource, "large.bin"), Buffer.alloc((2 * 1024 * 1024) + 1), "utf8");
    assert.equal(spawnSync("git", ["add", "large.bin"], { cwd: oversizedSource }).status, 0);
    await writeFile(join(safeBin, "claude"), "#!/bin/sh\necho '{\"result\":\"KENDALL_COPY_EXECUTION_OK\"}'\n", "utf8");
    await chmod(join(safeBin, "claude"), 0o755);

    const [oversizedResult] = collectCopiedWorktreeExecutionAttempts({
      env: { PATH: safeBin, PWD: oversizedSource },
      observedAt: "2026-06-27T00:00:00Z",
      sourceWorktree: oversizedSource,
      timeoutMs: 1000,
      workers: ["claude"],
    });
    assert.equal(oversizedResult.validation.ok, true);
    assert.equal(oversizedResult.attempt.execution_state, "copy_failed");
    assert.equal(oversizedResult.attempt.exit_code, null);
    assert.equal(oversizedResult.attempt.observed_response, null);
    assert.equal(existsSync(oversizedResult.attempt.execution_cwd), false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("copied-worktree execution skips symlinked source PATH entries and filters runtime PATH", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "knx-copy-exec-"));
  try {
    const sourceWorktree = await createTrackedSourceWorktree(tempDir);
    const workspaceBin = join(sourceWorktree, "bin");
    const safeBin = join(tempDir, "safe-bin");
    const symlinkBin = join(tempDir, "symlink-bin");
    const workspaceSentinel = join(tempDir, "workspace-sentinel");
    const helperSentinel = join(tempDir, "helper-sentinel");
    const gitSentinel = join(tempDir, "git-sentinel");
    await mkdir(workspaceBin, { recursive: true });
    await mkdir(safeBin, { recursive: true });
    await writeFile(join(workspaceBin, "claude"), `#!/bin/sh\ntouch '${workspaceSentinel}'\necho bad\n`, "utf8");
    await writeFile(join(workspaceBin, "helper"), `#!/bin/sh\ntouch '${helperSentinel}'\n`, "utf8");
    await writeFile(join(workspaceBin, "git"), `#!/bin/sh\ntouch '${gitSentinel}'\nprintf 'README.md\\0'\n`, "utf8");
    await writeFile(
      join(safeBin, "claude"),
      "#!/bin/sh\nif command -v helper >/dev/null 2>&1; then helper; fi\necho '{\"result\":\"KENDALL_COPY_EXECUTION_OK\"}'\n",
      "utf8",
    );
    await chmod(join(workspaceBin, "claude"), 0o755);
    await chmod(join(workspaceBin, "helper"), 0o755);
    await chmod(join(workspaceBin, "git"), 0o755);
    await chmod(join(safeBin, "claude"), 0o755);
    await symlink(workspaceBin, symlinkBin);

    const [result] = collectCopiedWorktreeExecutionAttempts({
      env: { PATH: [symlinkBin, safeBin, workspaceBin].join(":"), PWD: sourceWorktree },
      observedAt: "2026-06-27T00:00:00Z",
      sourceWorktree,
      timeoutMs: 1000,
      workers: ["claude"],
    });

    assert.equal(result.validation.ok, true);
    assert.equal(result.attempt.command_path, join(safeBin, "claude"));
    assert.equal(result.attempt.execution_state, "execution_observed");
    assert.equal(existsSync(workspaceSentinel), false);
    assert.equal(existsSync(helperSentinel), false);
    assert.equal(existsSync(gitSentinel), false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("copied-worktree execution CLI parse errors stop before launch", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "knx-copy-exec-"));
  try {
    const sourceWorktree = await createTrackedSourceWorktree(tempDir);
    const safeBin = join(tempDir, "safe-bin");
    const sentinelPath = join(tempDir, "sentinel");
    await mkdir(safeBin, { recursive: true });
    await writeFile(join(safeBin, "claude"), `#!/bin/sh\ntouch '${sentinelPath}'\necho '{\"result\":\"KENDALL_COPY_EXECUTION_OK\"}'\n`, "utf8");
    await chmod(join(safeBin, "claude"), 0o755);

    const invalidTimeout = spawnSync(
      process.execPath,
      [copiedWorktreeExecutionPath, "--workers", "claude", "--timeout-ms", "50000", "--source-worktree", sourceWorktree],
      { encoding: "utf8", env: { ...process.env, PATH: safeBin } },
    );
    assert.notEqual(invalidTimeout.status, 0);
    const invalidTimeoutOutput = JSON.parse(invalidTimeout.stdout);
    assert.deepEqual(invalidTimeoutOutput.results, []);
    assert.ok(invalidTimeoutOutput.errors.some((error) => error.reason === "invalid_timeout"));
    assert.equal(existsSync(sentinelPath), false);

    const relativeSource = spawnSync(
      process.execPath,
      [copiedWorktreeExecutionPath, "--workers", "claude", "--source-worktree", "relative"],
      { encoding: "utf8", env: { ...process.env, PATH: safeBin } },
    );
    assert.notEqual(relativeSource.status, 0);
    const relativeSourceOutput = JSON.parse(relativeSource.stdout);
    assert.deepEqual(relativeSourceOutput.results, []);
    assert.ok(relativeSourceOutput.errors.some((error) => error.reason === "source_worktree_not_absolute"));
    assert.equal(existsSync(sentinelPath), false);

    const unknownWorker = spawnSync(
      process.execPath,
      [copiedWorktreeExecutionPath, "--workers", "sk-proj-123456789", "--source-worktree", sourceWorktree],
      { encoding: "utf8", env: { ...process.env, PATH: safeBin } },
    );
    assert.notEqual(unknownWorker.status, 0);
    const unknownWorkerOutput = JSON.parse(unknownWorker.stdout);
    assert.deepEqual(unknownWorkerOutput.results, []);
    assert.ok(unknownWorkerOutput.errors.some((error) => error.reason === "unknown_worker"));
    assert.doesNotMatch(unknownWorker.stdout, /sk-proj-123456789/);
    assert.equal(existsSync(sentinelPath), false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("copied-worktree execution validator fails closed for retained copy tools mutation raw retention trust or routing effects", () => {
  const baseAttempt = {
    attempt_id: "copy-exec:claude",
    worker: "claude",
    mode: "copied_worktree_execution",
    authority_level: "copied_worktree_worker_execution",
    execution_state: "execution_observed",
    command_path: "/usr/local/bin/claude",
    command_args: [
      "--print",
      "--output-format",
      "json",
      "--input-format",
      "text",
      "--permission-mode",
      "dontAsk",
      "--no-session-persistence",
      "--safe-mode",
      "--tools",
      "",
      "--max-budget-usd",
      "0.05",
      "Reply exactly with KENDALL_COPY_EXECUTION_OK. Do not explain.",
    ],
    expected_response: "KENDALL_COPY_EXECUTION_OK",
    observed_response: "KENDALL_COPY_EXECUTION_OK",
    exit_code: 0,
    timed_out: false,
    timeout_ms: 1000,
    observed_at: "2026-06-27T00:00:00Z",
    evidence_ref: "metadata:worker-copied-worktree-execution/claude",
    shell_used: false,
    source_worktree: "/tmp/source-worktree",
    execution_cwd: "/tmp/kendall-worker-copy-exec-test",
    copied_tracked_files: 1,
    copy_bytes: 23,
    copy_retained: false,
    network_allowed: true,
    session_inheritance_allowed: true,
    source_mutation_allowed: false,
    tools_allowed: false,
    raw_output_retained: false,
    affects_trust: false,
    affects_routing: false,
  };
  assert.equal(validateCopiedWorktreeExecutionAttempt(baseAttempt).ok, true);

  for (const [field, value] of [
    ["command_args", ["--print", "mutate this repo"]],
    ["observed_response", "provider_payload sk-proj-123456789"],
    ["shell_used", true],
    ["execution_cwd", process.cwd()],
    ["copy_retained", true],
    ["copied_tracked_files", 0],
    ["execution_state", "failed"],
    ["execution_state", "timed_out"],
    ["execution_state", "invalid_output"],
    ["source_mutation_allowed", true],
    ["tools_allowed", true],
    ["raw_output_retained", true],
    ["affects_trust", true],
    ["affects_routing", true],
  ]) {
    const result = validateCopiedWorktreeExecutionAttempt({ ...baseAttempt, [field]: value });
    assert.equal(result.ok, false, `${field} should fail copied-worktree validation`);
    assert.ok(result.field_reasons.some((reason) => reason.field === field || reason.field === "execution_state" || reason.field === "$"));
  }
});

test("copied-worktree execution command avoids shell network modules GitHub delivery and retained-copy primitives", async () => {
  const source = await readFile(copiedWorktreeExecutionSourcePath, "utf8");
  assert.match(source, /spawnSync\(commandPath, commandArgs/);
  assert.match(source, /shell: false/);
  assert.match(source, /GIT_BINARY = "\/usr\/bin\/git"/);
  assert.match(source, /spawnSync\(GIT_BINARY, GIT_ARGS/);
  assert.match(source, /rmSync\(executionCwd/);
  assert.match(source, /copy_retained: false/);
  for (const forbiddenPattern of [
    /\bnode:http\b/,
    /\bnode:https\b/,
    /\bnode:net\b/,
    /\bnode:tls\b/,
    /\bnode:dns\b/,
    /\bWebSocket\b/,
    /\bgh\s+/,
    /\bunlink\b/,
    /\brmdir\b/,
    /\bwriteFile\b/,
  ]) {
    assert.doesNotMatch(source, forbiddenPattern);
  }
});

test("real tool readiness probes fail closed for launch session network raw retention or trust effects", () => {
  const baseProbe = {
    probe_id: "probe:claude-readiness",
    worker: "claude",
    mode: "readiness_only",
    authority_level: "non_executing",
    readiness_state: "available",
    command_resolution: "operator_shell_observation",
    command_path: "/usr/local/bin/claude",
    command_version: "2.1.179 Claude Code",
    observed_at: "2026-06-27T00:00:00Z",
    evidence_ref: "metadata:worker-readiness/claude",
    network_required: false,
    session_inheritance_required: false,
    credential_access_required: false,
    raw_output_retained: false,
    affects_trust: false,
    affects_routing: false,
    launch_attempted: false,
  };

  for (const [field, value] of [
    ["mode", "dry_run"],
    ["authority_level", "write"],
    ["readiness_state", "running_live_worker"],
    ["command_resolution", "path_lookup"],
    ["command_path", "claude"],
    ["command_path", null],
    ["command_version", null],
    ["command_version", "raw_prompt sk-proj-123456789"],
    ["evidence_ref", "raw_prompt: sk-proj-123456789"],
    ["network_required", true],
    ["session_inheritance_required", true],
    ["credential_access_required", true],
    ["raw_output_retained", true],
    ["affects_trust", true],
    ["affects_routing", true],
    ["launch_attempted", true],
  ]) {
    const result = validateToolReadinessProbe({ ...baseProbe, [field]: value });
    assert.equal(result.ok, false, `${field} should fail readiness validation`);
    assert.ok(
      result.field_reasons.some((reason) => reason.reason === "invalid_tool_readiness_probe"),
      `${field} should produce invalid_tool_readiness_probe`,
    );
    assert.ok(
      result.denial_details.some((detail) => detail.authority_family === "worker-command-execution"),
      `${field} should retain command-execution denial details`,
    );
  }

  for (const field of [
    "command_path",
    "command_version",
    "network_required",
    "session_inheritance_required",
    "credential_access_required",
    "raw_output_retained",
    "affects_trust",
    "affects_routing",
    "launch_attempted",
  ]) {
    const probe = { ...baseProbe };
    delete probe[field];
    const result = validateToolReadinessProbe(probe);
    assert.equal(result.ok, false, `${field} must be explicit readiness metadata`);
    assert.ok(result.field_reasons.some((reason) => reason.field === field));
  }

  for (const probe of [
    { ...baseProbe, readiness_state: "missing", command_path: "/usr/local/bin/claude", command_version: null },
    { ...baseProbe, readiness_state: "missing", command_path: null, command_version: "2.1.179 Claude Code" },
  ]) {
    const result = validateToolReadinessProbe(probe);
    assert.equal(result.ok, false, "missing readiness cannot retain command path or version proof");
    assert.ok(result.field_reasons.some((reason) => reason.field === "readiness_state"));
  }

  const rawIdentityResult = validateToolReadinessProbe({ ...baseProbe, probe_id: "probe:sk-proj-123456789" });
  assert.equal(rawIdentityResult.ok, false);
  assert.equal(rawIdentityResult.probe_id, null);
  assert.equal(rawIdentityResult.worker, "claude");
  assert.equal(rawIdentityResult.mode, "readiness_only");
  assert.equal(rawIdentityResult.authority_level, "non_executing");

  const rawWorkerResult = validateToolReadinessProbe({ ...baseProbe, worker: "sk-proj-123456789" });
  assert.equal(rawWorkerResult.ok, false);
  assert.equal(rawWorkerResult.worker, null);
  assert.equal(rawWorkerResult.probe_id, "probe:claude-readiness");
});

test("accepted packets fail closed when safety policy fields request live authority", async () => {
  const packet = await readFixture("claude-dry-run-ok.json");

  for (const [field, value, expectedReason, overrides = {}] of [
    ["network_policy", { requested: true }, "network_requested"],
    ["session_policy", { inheritance_requested: true }, "session_inheritance_requested"],
    ["evidence_policy", { retention: "raw", raw_payload_retained: true }, "raw_evidence_retention_requested"],
    ["review_requirement", "skip_review", "invalid_review_requirement"],
    ["status_events", [{ ...packet.status_events[0], state: "running_live_worker" }], "live_status_requested"],
    ["stop_lines", ["no provider calls"], "missing_required_stop_line"],
    ["blocked_operations", ["worker-process-launch"], "missing_blocked_authority_family"],
    ["evidence_refs", [], "missing_evidence_refs"],
  ]) {
    const result = validateDryRunPacket({ ...packet, [field]: value });
    assert.equal(result.ok, false, `${field} should fail validation`);
    assert.ok(
      result.field_reasons.some((reason) => reason.field === field && reason.reason === expectedReason),
      `${field} should produce ${expectedReason}`,
    );
  }
});

test("command allowlist entries must remain model-only canonical argument arrays", async () => {
  const packet = await readFixture("claude-dry-run-ok.json");

  for (const command_allowlist of [
    ["node --test tests/governed-worker-execution-dry-run.test.mjs"],
    [{ argv: "node --test tests/governed-worker-execution-dry-run.test.mjs", model_only: true }],
    [{ argv: ["/usr/bin/node"], model_only: false }],
    [{ argv: ["node", "--test"], model_only: true, transitive_effects: [] }],
    [{ argv: ["/bin/sh", "-c", "node --test tests/governed-worker-execution-dry-run.test.mjs"], model_only: true, transitive_effects: [] }],
    [{ argv: ["/usr/bin/claude", "--dangerously-skip-permissions"], model_only: true, transitive_effects: [] }],
    [{ argv: ["/usr/bin/curl", "https://example.invalid"], model_only: true, transitive_effects: [] }],
    [{ argv: ["/usr/bin/gh", "pr", "merge"], model_only: true, transitive_effects: [] }],
    [{ argv: ["/usr/bin/node", "--api-key=sk-proj-123456789"], model_only: true, transitive_effects: [] }],
    [{ argv: ["/usr/bin/node", "--test", "tests/*.test.mjs"], model_only: true, transitive_effects: [] }],
    [{ argv: ["/usr/bin/node"], model_only: true, transitive_effects: ["network"] }],
  ]) {
    const result = validateDryRunPacket({ ...packet, command_allowlist });
    assert.equal(result.ok, false);
    assert.ok(
      result.field_reasons.some((reason) => reason.field === "command_allowlist" && reason.reason === "invalid_command_allowlist"),
    );
  }
});

test("reviewed safety gaps fail closed with explicit denial details", async () => {
  const packet = await readFixture("claude-dry-run-ok.json");
  const [event] = packet.status_events;

  for (const [field, value, expectedReason, overrides = {}] of [
    ["evidence_policy", "raw provider_payload sk-proj-123456789", "raw_evidence_retention_requested"],
    ["environment_allowlist", ["GITHUB_TOKEN"], "environment_secret_requested"],
    ["environment_allowlist", [{ name: "OPENAI_API_KEY", value: "sk-proj-123456789" }], "environment_secret_requested"],
    ["status_events", [{ ...event, sequence: 2 }, { ...event, sequence: 1 }], "non_monotonic_status_events"],
    ["status_events", [{ ...event, mode: "live" }], "unsafe_status_event_payload"],
    ["status_events", [{ ...event, authority_level: "write" }], "unsafe_status_event_payload"],
    ["status_events", [{ ...event, next_action: "finish-pr" }], "unsafe_status_event_payload"],
    ["status_events", [{ ...event, evidence_ref: "raw_prompt: sk-proj-123456789" }], "unsafe_status_event_payload"],
    ["allowed_file_scopes", [".git/config"], "protected_scope_requested"],
    ["allowed_file_scopes", [".env"], "protected_scope_requested"],
    ["allowed_file_scopes", ["node_modules/pkg"], "protected_scope_requested"],
    ["task_class", "provider_payload", "invalid_packet_metadata"],
    ["task_class", "sk-proj-123456789", "invalid_packet_metadata"],
    ["base_sha", "not-a-sha", "invalid_packet_metadata"],
    ["expiry_or_review_point", "2000-01-01T00:00:00Z", "invalid_packet_metadata"],
    ["delivery_policy", "finish-pr", "delivery_requested"],
    ["delivery_policy", { pr_creation_requested: false, merge_requested: false, operations: ["merge"] }, "merge_requested"],
    ["network_policy", { requested: false, endpoints: ["https://api.openai.com"] }, "network_requested"],
    ["session_policy", { inheritance_requested: false, sessions: ["github"] }, "session_inheritance_requested"],
    ["source_mutation_policy", { requested: false, operations: ["writeFile"] }, "source_mutation_requested"],
    ["stop_lines", [...REQUIRED_STOP_LINES, "provider calls approved"], "missing_required_stop_line"],
    [
      "retry_policy",
      { max_attempts: 3, rca_required: false },
      "invalid_retry_policy",
      { status_events: [{ ...event, state: "unknown" }] },
    ],
  ]) {
    const result = validateDryRunPacket({ ...packet, ...overrides, [field]: value });
    assert.equal(result.ok, false, `${field} should fail validation`);
    assert.ok(
      result.field_reasons.some((fieldReason) => fieldReason.field === field && fieldReason.reason === expectedReason),
      `${field} should produce ${expectedReason}`,
    );
    assert.ok(
      result.denial_details.some((detail) => detail.reason === expectedReason && detail.future_approval_required.length > 0),
      `${field} should include denial details for ${expectedReason}`,
    );
  }
});

test("blocked authority and boundary fixtures fail closed with stable denial details", async () => {
  for (const expectation of deniedFixtureExpectations) {
    const { fixtureName, reason, authorityFamily, sourcePolicy, futureApprovalRequired } = expectation;
    const packet = await readFixture(fixtureName);
    const result = validateDryRunPacket(packet);

    assert.equal(result.ok, false, `${fixtureName} should fail validation`);
    assert.ok(Array.isArray(result.denial_details), `${fixtureName} should include denial_details`);
    assert.ok(result.denial_details.length > 0, `${fixtureName} should include at least one denial detail`);
    const matchingDetail = result.denial_details.find((detail) => detail.reason === reason);
    assert.ok(matchingDetail, `${fixtureName} should include ${reason}`);
    assert.equal(matchingDetail.authority_family, authorityFamily);
    assert.equal(matchingDetail.source_policy, sourcePolicy);
    assert.equal(matchingDetail.future_approval_required, futureApprovalRequired);
    assert.ok(matchingDetail.summary.length > 0);

    for (const detail of result.denial_details) {
      assert.equal(typeof detail.field, "string");
      assert.equal(typeof detail.reason, "string");
      assert.equal(typeof detail.authority_family, "string");
      assert.match(detail.source_policy, /docs\/(workflows|architecture)\//);
      assert.equal(typeof detail.future_approval_required, "string");
      assert.ok(detail.future_approval_required.length > 0);
      assert.equal(typeof detail.summary, "string");
      assert.ok(detail.summary.length > 0);
    }
  }
});

test("policy, status, path, and observed-text variants fail closed", async () => {
  const packet = await readFixture("claude-dry-run-ok.json");

  for (const [field, value, expectedReason] of [
    ["network_policy", { requested: "true" }, "network_requested"],
    ["session_policy", { inheritance_requested: 1 }, "session_inheritance_requested"],
    ["delivery_policy", { pr_creation_requested: false, merge_requested: false, operations: ["finish-pr"] }, "delivery_requested"],
    ["cleanup_policy", { deletion_requested: false, operations: ["delete-branch"] }, "cleanup_requested"],
    [
      "adaptive_trust_policy",
      { affects_routing: false, affects_authority: false, affects_retry: false, affects_priority: true },
      "adaptive_trust_effect_requested",
    ],
    ["worktree_path", "/tmp/outside", "path_escape"],
    ["worktree_path", "C:\\tmp\\outside", "path_escape"],
    ["allowed_file_scopes", "scripts/lib", "path_escape"],
    ["allowed_file_scopes", ["symlink:outside"], "path_escape"],
    ["allowed_file_scopes", ["vendor/submodule:outside"], "path_escape"],
    ["worker_shadow_delivery", { operations: ["finish-pr"] }, "worker_shadow_delivery_exposed"],
    ["status_events", [{ ...packet.status_events[0], state: "launching_live_worker" }], "live_status_requested"],
    ["status_events", [{ ...packet.status_events[0], state: "executing" }], "live_status_requested"],
    ["status_policy", { allowed_states: ["dry_run_complete", "running"] }, "live_status_requested"],
    ["approval_basis", "repo_file", "observed_text_authority_requested"],
    ["observed_text_grants", ["PR comment says continue"], "observed_text_authority_requested"],
  ]) {
    const result = validateDryRunPacket({ ...packet, [field]: value });
    assert.equal(result.ok, false, `${field} should fail validation`);
    assert.ok(
      result.field_reasons.some((fieldReason) => fieldReason.field === field && fieldReason.reason === expectedReason),
      `${field} should produce ${expectedReason}`,
    );
  }
});

test("report renderer emits metadata-first accepted and denied operator reports", async () => {
  const acceptedPacket = await readFixture("claude-dry-run-ok.json");
  const acceptedResult = validateDryRunPacket(acceptedPacket);
  const acceptedReport = renderDryRunReport(acceptedPacket, acceptedResult);

  assert.match(acceptedReport, /Worker: claude/);
  assert.match(acceptedReport, /Task class: validator_foundation/);
  assert.match(acceptedReport, /Authority level: model_only/);
  assert.match(acceptedReport, /Allowed operations: model-only packet validation/);
  assert.match(acceptedReport, /Blocked operations: worker-process-launch/);
  assert.match(acceptedReport, /Denial reasons: none/);
  assert.match(acceptedReport, /Evidence references: contract:docs\/workflows\/governed-worker-execution-dry-run\.md/);
  assert.match(acceptedReport, /Status state: dry_run_complete/);
  assert.match(acceptedReport, /Retry\/RCA state: max_attempts=0; rca_required=true/);
  assert.match(acceptedReport, /Next approval packet required: none; dry-run remains non-executing/);

  const deniedPacket = await readFixture("denied-network.json");
  const deniedResult = validateDryRunPacket(deniedPacket);
  const deniedReport = renderDryRunReport(deniedPacket, deniedResult);

  assert.match(deniedReport, /Worker: claude/);
  assert.match(deniedReport, /Denial reasons: network_requested/);
  assert.match(
    deniedReport,
    /Next approval packet required: worker-network-or-session: Worker-specific network\/session approval naming Claude or Hermes/,
  );
});

test("raw evidence markers are rejected and quarantined in reports", async () => {
  const packet = await readFixture("claude-dry-run-ok.json");
  const rawEvidenceRef = "raw_prompt: actual-sk-proj-123456789 provider_payload transcript";
  const result = validateDryRunPacket({ ...packet, evidence_refs: [rawEvidenceRef] });
  const report = renderDryRunReport({ ...packet, evidence_refs: [rawEvidenceRef] }, result);

  assert.equal(result.ok, false);
  assert.ok(
    result.field_reasons.some((fieldReason) => {
      return fieldReason.field === "evidence_refs" && fieldReason.reason === "raw_evidence_retention_requested";
    }),
  );
  assert.match(report, /\[quarantined-evidence-ref\]/);
  assert.doesNotMatch(report, /actual-sk-proj-123456789/);
  assert.doesNotMatch(report, /provider_payload transcript/);

  for (const evidenceRef of ["plain-short-ref", "sk-proj-123456789", "Authorization: Bearer abc123", "-----BEGIN PRIVATE KEY-----"]) {
    const evidenceResult = validateDryRunPacket({ ...packet, evidence_refs: [evidenceRef] });
    assert.equal(evidenceResult.ok, false, `${evidenceRef} should fail evidence validation`);
    assert.ok(evidenceResult.field_reasons.some((fieldReason) => fieldReason.reason === "raw_evidence_retention_requested"));
  }

  const rawPolicyResult = validateDryRunPacket({
    ...packet,
    evidence_policy: { retention: "metadata_only", raw_payload_retained: false, provider_payload: "raw" },
  });
  assert.equal(rawPolicyResult.ok, false);
  assert.ok(rawPolicyResult.field_reasons.some((fieldReason) => fieldReason.field === "evidence_policy"));
});

test("status event ordering ignores stale events and denies live states", async () => {
  const packet = await readFixture("claude-dry-run-ok.json");
  const [event] = packet.status_events;
  const evaluation = evaluateStatusEvents([
    { ...event, sequence: 2, state: "validating" },
    { ...event, sequence: 1, state: "queued" },
    { ...event, sequence: 3, state: "dry_run_complete" },
    { ...event, sequence: 4, state: "running_live_worker" },
    { ...event, sequence: Number.NaN, state: "queued" },
    { ...event, sequence: 5, state: "raw_prompt: sk-proj-123456789" },
  ]);

  assert.deepEqual(
    evaluation.ordered_events.map((statusEvent) => statusEvent.sequence),
    [2, 3],
  );
  assert.deepEqual(
    evaluation.ignored_stale_events.map((statusEvent) => statusEvent.sequence),
    [1],
  );
  assert.deepEqual(
    evaluation.denied_live_events.map((statusEvent) => statusEvent.sequence),
    [4],
  );
  assert.equal(evaluation.ignored_malformed_events.length, 2);
  assert.equal(evaluation.latest_event.state, "dry_run_complete");
  assert.equal(evaluation.latest_denied_event.state, "running_live_worker");

  const multiRunEvaluation = evaluateStatusEvents([
    { ...event, run_id: "run-a", sequence: 2, state: "dry_run_complete" },
    { ...event, run_id: "run-b", sequence: 1, state: "queued" },
  ]);
  assert.deepEqual(
    multiRunEvaluation.ordered_events.map((statusEvent) => `${statusEvent.run_id}:${statusEvent.sequence}`),
    ["run-a:2", "run-b:1"],
  );
  assert.deepEqual(multiRunEvaluation.ignored_stale_events, []);

  const liveResult = validateDryRunPacket({
    ...packet,
    status_events: [{ ...event, sequence: 1, state: "running_live_worker" }],
  });
  assert.equal(liveResult.ok, false);
  assert.ok(liveResult.field_reasons.some((fieldReason) => fieldReason.reason === "live_status_requested"));

  const malformedResult = validateDryRunPacket({
    ...packet,
    status_events: [{ ...event, sequence: Number.NaN, state: "queued" }],
  });
  assert.equal(malformedResult.ok, false);
  assert.ok(malformedResult.field_reasons.some((fieldReason) => fieldReason.reason === "invalid_status_state"));

  const staleResult = validateDryRunPacket({
    ...packet,
    status_events: [
      { ...event, sequence: 2, state: "validating" },
      { ...event, sequence: 2, state: "dry_run_complete" },
    ],
  });
  assert.equal(staleResult.ok, false);
  assert.ok(staleResult.field_reasons.some((fieldReason) => fieldReason.reason === "non_monotonic_status_events"));
});

test("report renderer uses canonical metadata instead of raw packet fields", async () => {
  const packet = await readFixture("claude-dry-run-ok.json");
  const rawMarker = "raw_prompt: sk-proj-123456789 transcript provider_payload";
  const mutated = {
    ...packet,
    worker: rawMarker,
    task_class: rawMarker,
    retry_policy: { max_attempts: rawMarker, rca_required: true },
    blocked_operations: [...BLOCKED_AUTHORITY_FAMILIES, rawMarker],
  };
  const result = validateDryRunPacket(mutated);
  const report = renderDryRunReport(mutated, result);

  assert.equal(result.ok, false);
  assert.ok(result.field_reasons.some((fieldReason) => fieldReason.field === "blocked_operations"));
  assert.match(report, /Worker: unknown/);
  assert.match(report, /Task class: unknown/);
  assert.match(report, /Retry\/RCA state: max_attempts=unknown; rca_required=true/);
  assert.match(report, /Blocked operations: worker-process-launch/);
  assert.doesNotMatch(report, /sk-proj-123456789/);
  assert.doesNotMatch(report, /provider_payload/);
});

test("packet input must be an own-property object with non-empty required values", async () => {
  assert.equal(validateDryRunPacket(null).ok, false);
  assert.ok(validateDryRunPacket(null).field_reasons.some((reason) => reason.field === "$" && reason.reason === "invalid_packet_object"));

  const inheritedPacket = Object.create(await readFixture("claude-dry-run-ok.json"));
  const inheritedResult = validateDryRunPacket(inheritedPacket);
  assert.equal(inheritedResult.ok, false);
  assert.ok(inheritedResult.field_reasons.some((reason) => reason.reason === "missing_required_field"));

  const packet = await readFixture("claude-dry-run-ok.json");
  const emptyPacketId = validateDryRunPacket({ ...packet, packet_id: "" });
  assert.equal(emptyPacketId.ok, false);
  assert.ok(emptyPacketId.field_reasons.some((reason) => reason.field === "packet_id" && reason.reason === "empty_required_field"));
});

test("missing required packet fields fail with field-level reasons", async () => {
  const packet = await readFixture("claude-dry-run-ok.json");

  for (const field of REQUIRED_DRY_RUN_PACKET_FIELDS) {
    const mutated = { ...packet };
    delete mutated[field];

    const result = validateDryRunPacket(mutated);
    assert.equal(result.ok, false, `missing ${field} should fail validation`);
    assert.ok(
      result.field_reasons.some((reason) => reason.field === field && reason.reason === "missing_required_field"),
      `missing ${field} should produce a field-level missing_required_field reason`,
    );
    assert.ok(result.denied_reasons.includes("missing_required_field"));
  }
});

test("validator foundation rejects invalid worker, mode, and authority level without throwing", async () => {
  const packet = await readFixture("claude-dry-run-ok.json");
  const result = validateDryRunPacket({
    ...packet,
    worker: "codex",
    mode: "live",
    authority_level: "write",
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.field_reasons.filter((reason) => reason.field === "worker"),
    [{ field: "worker", reason: "invalid_worker" }],
  );
  assert.deepEqual(
    result.field_reasons.filter((reason) => reason.field === "mode"),
    [{ field: "mode", reason: "invalid_mode" }],
  );
  assert.deepEqual(
    result.field_reasons.filter((reason) => reason.field === "authority_level"),
    [{ field: "authority_level", reason: "invalid_authority_level" }],
  );
});

test("validator module does not expose process, network, GitHub, cleanup, or source mutation primitives", async () => {
  const source = await readFile(validatorSourcePath, "utf8");

  for (const forbiddenPattern of [
    /\bchild_process\b/,
    /\bspawn\b/,
    /\bexec\b/,
    /\bfetch\s*\(/,
    /\bnode:http\b/,
    /\bnode:https\b/,
    /\bnode:net\b/,
    /\bnode:tls\b/,
    /\bnode:dns\b/,
    /\bgh\s+/,
    /\brm\s+/,
    /\bunlink\b/,
    /\brmdir\b/,
    /\bwriteFile\b/,
    /\bimport\s*\(/,
    /\bWebSocket\b/,
  ]) {
    assert.doesNotMatch(source, forbiddenPattern);
  }

  const importLines = source.split("\n").filter((line) => line.trim().startsWith("import "));
  assert.deepEqual(importLines, []);
});

test("scoped package scripts and check wrapper are wired for the dry-run slice", async () => {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));

  assert.equal(
    packageJson.scripts?.["test:governed-worker-execution-dry-run"],
    "node --test tests/governed-worker-execution-dry-run.test.mjs",
  );
  assert.equal(
    packageJson.scripts?.["check:governed-worker-execution-dry-run"],
    "node ./scripts/check-governed-worker-execution-dry-run.mjs",
  );
  assert.equal(
    packageJson.scripts?.["worker:readiness:collect"],
    "node ./scripts/governed-worker-readiness-collect.mjs",
  );
  assert.equal(
    packageJson.scripts?.["worker:version:probe"],
    "node ./scripts/governed-worker-version-probe.mjs",
  );
  assert.equal(
    packageJson.scripts?.["worker:smoke:execute"],
    "node ./scripts/governed-worker-smoke-execution.mjs",
  );
  assert.equal(
    packageJson.scripts?.["worker:copy:execute"],
    "node ./scripts/governed-worker-copied-worktree-execution.mjs",
  );
  assert.match(packageJson.scripts?.["check:static"], /pnpm run check:governed-worker-execution-dry-run/);
  assert.equal(existsSync(checkWrapperPath), true);
});

test("scoped check wrapper precheck validates source policy refs and fixture inventory", () => {
  const result = precheckGovernedWorkerExecutionDryRun();

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("scoped check wrapper remains local and avoids worker/provider/GitHub/cleanup primitives", async () => {
  const source = await readFile(checkWrapperPath, "utf8");

  assert.match(source, /spawnSync\(process\.execPath, \["--test", testPath\]/);
  for (const forbiddenPattern of [
    /\bfetch\s*\(/,
    /\bnode:http\b/,
    /\bnode:https\b/,
    /\bnode:net\b/,
    /\bnode:tls\b/,
    /\bnode:dns\b/,
    /\bgh\s+/,
    /\brm\s+/,
    /\bunlink\b/,
    /\brmdir\b/,
    /\bwriteFile\b/,
    /\bWebSocket\b/,
    /\bclaude\b.*\bspawnSync\b/,
    /\bhermes\b.*\bspawnSync\b/,
  ]) {
    assert.doesNotMatch(source, forbiddenPattern);
  }
});
