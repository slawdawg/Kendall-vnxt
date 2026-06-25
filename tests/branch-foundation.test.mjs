import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildBranchFoundationReport,
  buildBranchFoundationReadinessEvidence,
  formatBranchFoundationReport,
  formatBranchFoundationReadinessEvidence,
  isProtectedBranch,
  loadBranchFoundationGitEvidence,
  validateBranchFoundationMutationCommand,
  protectedBranches,
  requiredBranchLanes,
} from "../scripts/lib/branch-foundation.mjs";
import { runBranchFoundationCli } from "../scripts/branch-foundation.mjs";
import { runBranchFoundationChecks } from "../scripts/check-branch-foundation.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const branchFoundationCheck = join(repoRoot, "scripts", "check-branch-foundation.mjs");
const packageJsonPath = join(repoRoot, "package.json");

test("defines required branch roles and protected branch policy", () => {
  assert.deepEqual(requiredBranchLanes, [
    { branch: "dev", role: "development" },
    { branch: "staging", role: "release_candidate" },
    { branch: "main", role: "human_gate" },
    { branch: "prod", role: "production" },
  ]);

  assert.deepEqual(protectedBranches, ["main", "master", "prod"]);
  assert.equal(isProtectedBranch("main"), true);
  assert.equal(isProtectedBranch("prod"), true);
  assert.equal(isProtectedBranch("master"), true);
  assert.equal(isProtectedBranch("dev"), false);
});

test("builds BranchFoundationReportV0 from injected fake evidence", () => {
  const report = buildBranchFoundationReport({
    repoRoot: "/repo",
    currentBranch: "feature/work",
    upstream: "origin/feature/work",
    aheadBehind: { ahead: 1, behind: 2 },
    dirtyState: "clean",
    defaultTaskTarget: "dev",
    expectedBase: "main",
    localBranches: {
      dev: { exists: true, sha: "dev-local" },
      staging: { exists: true, sha: "staging-local" },
      main: { exists: true, sha: "main-local" },
      prod: { exists: true, sha: "prod-local" },
    },
    remoteBranches: {
      dev: { exists: true, sha: "dev-remote" },
      staging: { exists: true, sha: "staging-remote" },
      main: { exists: true, sha: "main-remote" },
      prod: { exists: true, sha: "prod-remote" },
    },
  }, { generatedAt: "2026-06-25T00:00:00.000Z" });

  assert.equal(report.generatedAt, "2026-06-25T00:00:00.000Z");
  assert.equal(report.repoRoot, "/repo");
  assert.equal(report.currentBranch, "feature/work");
  assert.equal(report.upstream, "origin/feature/work");
  assert.deepEqual(report.aheadBehind, { ahead: 1, behind: 2 });
  assert.equal(report.dirtyState, "clean");
  assert.equal(report.defaultTaskTarget, "dev");
  assert.equal(report.authorityState, "report_only");
  assert.deepEqual(report.protectedBranchWarnings, []);
  assert.deepEqual(report.plannedMutations, []);
  assert.deepEqual(report.requiredBranches, [
    {
      branch: "dev",
      role: "development",
      localExists: true,
      remoteExists: true,
      expectedBase: "main",
      currentHeadSha: "dev-local",
      remoteHeadSha: "dev-remote",
    },
    {
      branch: "staging",
      role: "release_candidate",
      localExists: true,
      remoteExists: true,
      expectedBase: "main",
      currentHeadSha: "staging-local",
      remoteHeadSha: "staging-remote",
    },
    {
      branch: "main",
      role: "human_gate",
      localExists: true,
      remoteExists: true,
      expectedBase: "main",
      currentHeadSha: "main-local",
      remoteHeadSha: "main-remote",
    },
    {
      branch: "prod",
      role: "production",
      localExists: true,
      remoteExists: true,
      expectedBase: "main",
      currentHeadSha: "prod-local",
      remoteHeadSha: "prod-remote",
    },
  ]);
});

test("reports missing branches and proposes approval-gated mutations without executing Git", () => {
  const report = buildBranchFoundationReport({
    repoRoot: "/repo",
    currentBranch: "main",
    dirtyState: "clean",
    defaultTaskTarget: "dev",
    expectedBase: "main",
    localBranches: {
      main: { exists: true, sha: "main-local" },
    },
    remoteBranches: {
      main: { exists: true, sha: "main-remote" },
      staging: { exists: false },
    },
  });

  const statusByBranch = Object.fromEntries(report.requiredBranches.map((status) => [status.branch, status]));
  assert.equal(statusByBranch.dev.localExists, false);
  assert.equal(statusByBranch.dev.remoteExists, false);
  assert.equal(statusByBranch.staging.localExists, false);
  assert.equal(statusByBranch.staging.remoteExists, false);
  assert.equal(statusByBranch.prod.localExists, false);
  assert.equal(statusByBranch.prod.remoteExists, false);

  assert.deepEqual(
    report.plannedMutations.map((mutation) => ({
      operation: mutation.operation,
      branch: mutation.branch,
      fromRef: mutation.fromRef,
      requiresApproval: mutation.requiresApproval,
    })),
    [
      { operation: "create_local_branch", branch: "dev", fromRef: "main", requiresApproval: true },
      { operation: "push_remote_branch", branch: "dev", fromRef: "dev", requiresApproval: true },
      { operation: "create_local_branch", branch: "staging", fromRef: "main", requiresApproval: true },
      { operation: "push_remote_branch", branch: "staging", fromRef: "staging", requiresApproval: true },
      { operation: "create_local_branch", branch: "prod", fromRef: "main", requiresApproval: true },
      { operation: "push_remote_branch", branch: "prod", fromRef: "prod", requiresApproval: true },
    ],
  );
  assert.ok(report.plannedMutations.every((mutation) => typeof mutation.commandPreview === "string"));
  assert.ok(report.plannedMutations.every((mutation) => mutation.commandPreview.includes("'")));
  assert.deepEqual(
    report.plannedMutations
      .filter((mutation) => mutation.protectedBranch)
      .map((mutation) => [mutation.branch, mutation.authorityFamily]),
    [
      ["prod", "protected_branch_setup"],
      ["prod", "protected_branch_setup"],
    ],
  );
});

test("reports protected branch misuse warnings", () => {
  const dirtyMainReport = buildBranchFoundationReport({
    repoRoot: "/repo",
    currentBranch: "main",
    dirtyState: "dirty",
    defaultTaskTarget: "dev",
    expectedBase: "main",
    localBranches: { main: { exists: true } },
    remoteBranches: { main: { exists: true } },
  });
  assert.deepEqual(dirtyMainReport.protectedBranchWarnings, [
    {
      branch: "main",
      severity: "warning",
      reason: "dirty_human_gate",
      evidence: "current branch is main and dirtyState is dirty",
    },
  ]);

  const prodReport = buildBranchFoundationReport({
    repoRoot: "/repo",
    currentBranch: "prod",
    dirtyState: "clean",
    defaultTaskTarget: "dev",
    expectedBase: "main",
    localBranches: { prod: { exists: true } },
    remoteBranches: { prod: { exists: true } },
  });
  assert.deepEqual(prodReport.protectedBranchWarnings, [
    {
      branch: "prod",
      severity: "critical",
      reason: "current_branch_is_production",
      evidence: "current branch is prod",
    },
  ]);

  const dirtyMasterReport = buildBranchFoundationReport({
    repoRoot: "/repo",
    currentBranch: " master ",
    dirtyState: "dirty",
    defaultTaskTarget: "dev",
    expectedBase: "main",
    localBranches: { master: { exists: true } },
    remoteBranches: { master: { exists: true } },
  });
  assert.deepEqual(dirtyMasterReport.protectedBranchWarnings, [
    {
      branch: "master",
      severity: "warning",
      reason: "dirty_protected_branch",
      evidence: "current branch is master and dirtyState is dirty",
    },
  ]);

  const unknownMainReport = buildBranchFoundationReport({
    repoRoot: "/repo",
    currentBranch: "main",
    dirtyState: "unknown",
    defaultTaskTarget: "dev",
    expectedBase: "main",
    localBranches: { main: { exists: true } },
    remoteBranches: { main: { exists: true } },
  });
  assert.deepEqual(unknownMainReport.protectedBranchWarnings, [
    {
      branch: "main",
      severity: "warning",
      reason: "unknown_human_gate_cleanliness",
      evidence: "current branch is main and dirtyState is unknown",
    },
  ]);
});

test("formats metadata-only output and does not leak credential-like evidence", () => {
  const report = buildBranchFoundationReport({
    repoRoot: "/repo/super-secret-token",
    currentBranch: "secret-token-branch",
    upstream: "https://token-user:super-secret-token@example.test/repo.git",
    aheadBehind: { ahead: 0, behind: 0 },
    dirtyState: "dirty",
    defaultTaskTarget: "token-target",
    expectedBase: "main; echo super-secret-token",
    remoteUrl: "https://token-user:super-secret-token@example.test/repo.git",
    token: "super-secret-token",
    rawCommandOutput: "Authorization: Bearer super-secret-token",
    env: {
      GITHUB_TOKEN: "super-secret-token",
    },
    localBranches: {
      main: { exists: true, sha: "main-local-super-secret-token", credential: "super-secret-token" },
      dev: { exists: false, sha: "stale-super-secret-token" },
    },
    remoteBranches: {
      main: { exists: true, sha: "main-remote", remoteUrl: "https://super-secret-token@example.test" },
    },
  }, { generatedAt: "2026-06-25T00:00:00.000Z" });

  const serializedReport = JSON.stringify(report);
  const formatted = formatBranchFoundationReport(report);

  assert.equal(serializedReport.includes("super-secret-token"), false);
  assert.equal(serializedReport.includes("https://token-user"), false);
  assert.equal(formatted.includes("super-secret-token"), false);
  assert.equal(formatted.includes("https://token-user"), false);
  assert.equal(formatted.includes("secret-token-branch"), false);
  assert.match(formatted, /Branch Foundation Report/);
  assert.match(formatted, /Current branch: unknown/);
  assert.match(formatted, /Default task target: dev/);
});

test("treats missing local evidence as unknown without planning mutation", () => {
  const report = buildBranchFoundationReport({
    repoRoot: "/repo",
    currentBranch: "main",
    dirtyState: "clean",
    defaultTaskTarget: "dev",
    expectedBase: "main",
  });

  assert.deepEqual(report.requiredBranches.map((status) => [status.branch, status.localExists, status.remoteExists]), [
    ["dev", "unknown", "unknown"],
    ["staging", "unknown", "unknown"],
    ["main", "unknown", "unknown"],
    ["prod", "unknown", "unknown"],
  ]);
  assert.deepEqual(report.plannedMutations, []);
});

test("uses existing remote branch as local creation source and skips impossible missing main preview", () => {
  const report = buildBranchFoundationReport({
    repoRoot: "/repo",
    currentBranch: "main",
    dirtyState: "clean",
    defaultTaskTarget: "dev",
    expectedBase: "main",
    localBranches: {
      main: { exists: false },
      dev: { exists: false },
    },
    remoteBranches: {
      main: { exists: true, sha: "main-remote" },
      dev: { exists: true, sha: "dev-remote" },
    },
  });

  assert.deepEqual(
    report.plannedMutations.map((mutation) => ({
      operation: mutation.operation,
      branch: mutation.branch,
      fromRef: mutation.fromRef,
      protectedBranch: mutation.protectedBranch,
      authorityFamily: mutation.authorityFamily,
    })),
    [
      {
        operation: "create_local_branch",
        branch: "dev",
        fromRef: "origin/dev",
        protectedBranch: false,
        authorityFamily: "branch_foundation_setup",
      },
      {
        operation: "create_local_branch",
        branch: "staging",
        fromRef: "main",
        protectedBranch: false,
        authorityFamily: "branch_foundation_setup",
      },
      {
        operation: "push_remote_branch",
        branch: "staging",
        fromRef: "staging",
        protectedBranch: false,
        authorityFamily: "branch_foundation_setup",
      },
      {
        operation: "create_local_branch",
        branch: "prod",
        fromRef: "main",
        protectedBranch: true,
        authorityFamily: "protected_branch_setup",
      },
      {
        operation: "push_remote_branch",
        branch: "prod",
        fromRef: "prod",
        protectedBranch: true,
        authorityFamily: "protected_branch_setup",
      },
    ],
  );
  assert.equal(report.plannedMutations.some((mutation) => mutation.operation === "create_local_branch" && mutation.branch === "main"), false);
  assert.equal(report.plannedMutations.some((mutation) => mutation.commandPreview.includes("git branch 'main' 'main'")), false);
});

test("drops stale SHA for missing branches and preserves malformed ahead-behind as unknown", () => {
  const report = buildBranchFoundationReport({
    repoRoot: "/repo",
    currentBranch: "main",
    dirtyState: "clean",
    defaultTaskTarget: "dev",
    expectedBase: "main",
    aheadBehind: { ahead: -1, behind: "two" },
    localBranches: {
      dev: { exists: false, sha: "stale-dev-sha" },
    },
    remoteBranches: {
      dev: { exists: false, sha: "stale-remote-sha" },
    },
  });

  const dev = report.requiredBranches.find((status) => status.branch === "dev");
  assert.equal(report.aheadBehind, null);
  assert.equal(Object.hasOwn(dev, "currentHeadSha"), false);
  assert.equal(Object.hasOwn(dev, "remoteHeadSha"), false);
});

test("handles null and malformed formatter inputs safely", () => {
  const report = buildBranchFoundationReport(null, null);
  assert.equal(report.authorityState, "report_only");
  assert.deepEqual(report.plannedMutations, []);

  assert.doesNotThrow(() =>
    formatBranchFoundationReport({
      requiredBranches: [null, "bad", { branch: "dev", role: "development", localExists: true }],
      protectedBranchWarnings: [null, "bad", { branch: "secret-token", reason: "token-secret" }],
      plannedMutations: [null, "bad", { operation: "create_local_branch", branch: "dev", fromRef: "main" }],
    }),
  );
});

test("branch foundation CLI report reads Git evidence without mutating refs", () => {
  const fixture = createGitFixture();
  try {
    const beforeRefs = refSnapshot(fixture.repo);
    const result = runBranchFoundationCli(["report"], { cwd: fixture.repo });
    const afterRefs = refSnapshot(fixture.repo);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(afterRefs, beforeRefs);
    assert.match(result.stdout, /Branch Foundation Report/);
    assert.match(result.stdout, /dev .*missing/);
    assert.match(result.stdout, /staging .*missing/);
    assert.match(result.stdout, /prod .*missing/);
    assert.match(result.stdout, /main .*human_gate/);
    assert.match(result.stdout, /main .*local=yes/);
    assert.match(result.stdout, /main .*remote=yes/);
  } finally {
    fixture.cleanup();
  }
});

test("branch foundation CLI report --json returns BranchFoundationReportV0", () => {
  const fixture = createGitFixture();
  try {
    const result = runBranchFoundationCli(["report", "--json"], { cwd: fixture.repo });

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    const statusByBranch = Object.fromEntries(report.requiredBranches.map((status) => [status.branch, status]));
    assert.equal(report.currentBranch, "main");
    assert.equal(report.defaultTaskTarget, "dev");
    assert.equal(statusByBranch.main.role, "human_gate");
    assert.equal(statusByBranch.main.localExists, true);
    assert.equal(statusByBranch.main.remoteExists, true);
    assert.equal(statusByBranch.dev.localExists, false);
    assert.equal(statusByBranch.staging.localExists, false);
    assert.equal(statusByBranch.prod.localExists, false);
  } finally {
    fixture.cleanup();
  }
});

test("branch foundation CLI plan prints approval-gated mutations without mutating refs", () => {
  const fixture = createGitFixture();
  try {
    const beforeRefs = refSnapshot(fixture.repo);
    const result = runBranchFoundationCli(["plan"], { cwd: fixture.repo });
    const afterRefs = refSnapshot(fixture.repo);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(afterRefs, beforeRefs);
    assert.match(result.stdout, /Planned mutations/);
    assert.match(result.stdout, /create_local_branch dev from main/);
    assert.match(result.stdout, /create_local_branch staging from main/);
    assert.match(result.stdout, /create_local_branch prod from main/);
    assert.match(result.stdout, /approval required: yes/);
  } finally {
    fixture.cleanup();
  }
});

test("branch foundation CLI rejects unknown commands without mutation", () => {
  const fixture = createGitFixture();
  try {
    const beforeRefs = refSnapshot(fixture.repo);
    const result = runBranchFoundationCli(["setup-now"], { cwd: fixture.repo });
    const afterRefs = refSnapshot(fixture.repo);

    assert.notEqual(result.status, 0);
    assert.equal(afterRefs, beforeRefs);
    assert.match(result.stderr, /Unsupported branch foundation argument/);
  } finally {
    fixture.cleanup();
  }
});

test("branch foundation CLI rejects unsupported options and extra commands", () => {
  const fixture = createGitFixture();
  try {
    const applyFlag = runBranchFoundationCli(["report", "--apply"], { cwd: fixture.repo });
    const extraCommand = runBranchFoundationCli(["report", "plan"], { cwd: fixture.repo });

    assert.notEqual(applyFlag.status, 0);
    assert.match(applyFlag.stderr, /Unsupported branch foundation argument: --apply/);
    assert.notEqual(extraCommand.status, 0);
    assert.match(extraCommand.stderr, /Unsupported branch foundation argument: plan/);
  } finally {
    fixture.cleanup();
  }
});

test("branch foundation CLI redacts sensitive unsupported arguments", () => {
  const result = runBranchFoundationCli(["https://token-user:super-secret-token@example.test/repo.git"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unsupported branch foundation argument: \[redacted\]/);
  assert.equal(result.stderr.includes("super-secret-token"), false);
  assert.equal(result.stderr.includes("https://token-user"), false);
});

test("apply-local refuses without approval and does not mutate refs", () => {
  const fixture = createGitFixture();
  try {
    const beforeRefs = refSnapshot(fixture.repo);
    const result = runBranchFoundationCli(["apply-local"], { cwd: fixture.repo });
    const afterRefs = refSnapshot(fixture.repo);

    assert.notEqual(result.status, 0);
    assert.equal(afterRefs, beforeRefs);
    assert.match(result.stderr, /approval required/i);
    assert.match(result.stderr, /apply-local/);
  } finally {
    fixture.cleanup();
  }
});

test("apply-local with approval creates only missing local setup branches and skips existing branches", () => {
  const fixture = createGitFixture();
  try {
    runGit(fixture.repo, ["branch", "dev", "main"]);
    const beforeRemoteRefs = remoteHeadSnapshot(fixture.remote);
    const result = runBranchFoundationCli(["apply-local", "--approval", "operator approved local setup"], {
      cwd: fixture.repo,
    });
    const afterRemoteRefs = remoteHeadSnapshot(fixture.remote);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(afterRemoteRefs, beforeRemoteRefs);
    assert.equal(localBranchExists(fixture.repo, "dev"), true);
    assert.equal(localBranchExists(fixture.repo, "staging"), true);
    assert.equal(localBranchExists(fixture.repo, "prod"), true);
    assert.equal(localBranchExists(fixture.repo, "main"), true);
    assert.match(result.stdout, /dev .*skipped/i);
    assert.match(result.stdout, /sha=/i);
    assert.match(result.stdout, /staging .*created/i);
    assert.match(result.stdout, /prod .*created/i);
    assert.doesNotMatch(result.stdout, /operator approved local setup/);
  } finally {
    fixture.cleanup();
  }
});

test("push-remote refuses without approval and does not mutate remote refs", () => {
  const fixture = createGitFixture();
  try {
    runBranchFoundationCli(["apply-local", "--approval", "operator approved local setup"], { cwd: fixture.repo });
    const beforeRemoteRefs = remoteHeadSnapshot(fixture.remote);
    const result = runBranchFoundationCli(["push-remote"], { cwd: fixture.repo });
    const afterRemoteRefs = remoteHeadSnapshot(fixture.remote);

    assert.notEqual(result.status, 0);
    assert.equal(afterRemoteRefs, beforeRemoteRefs);
    assert.match(result.stderr, /approval required/i);
    assert.match(result.stderr, /push-remote/);
  } finally {
    fixture.cleanup();
  }
});

test("push-remote with approval pushes only missing setup branch refs", () => {
  const fixture = createGitFixture();
  try {
    const localResult = runBranchFoundationCli(["apply-local", "--approval", "operator approved local setup"], {
      cwd: fixture.repo,
    });
    assert.equal(localResult.status, 0, localResult.stderr);

    const result = runBranchFoundationCli(["push-remote", "--approval", "operator approved remote setup"], {
      cwd: fixture.repo,
    });
    const remoteRefs = remoteHeadSnapshot(fixture.remote);

    assert.equal(result.status, 0, result.stderr);
    assert.match(remoteRefs, /refs\/heads\/main:/);
    assert.match(remoteRefs, /refs\/heads\/dev:/);
    assert.match(remoteRefs, /refs\/heads\/staging:/);
    assert.match(remoteRefs, /refs\/heads\/prod:/);
    assert.match(result.stdout, /refs\/heads\/dev:refs\/heads\/dev/);
    assert.match(result.stdout, /refs\/heads\/staging:refs\/heads\/staging/);
    assert.match(result.stdout, /refs\/heads\/prod:refs\/heads\/prod/);
    assert.doesNotMatch(result.stdout, /operator approved remote setup/);
    assert.doesNotMatch(result.stdout, /--force|--mirror|--all|--delete|--tags|\+dev|:dev/);
  } finally {
    fixture.cleanup();
  }
});

test("push-remote refuses when live remote branch exists but tracking ref is stale", () => {
  const fixture = createGitFixture();
  try {
    const localResult = runBranchFoundationCli(["apply-local", "--approval", "operator approved local setup"], {
      cwd: fixture.repo,
    });
    assert.equal(localResult.status, 0, localResult.stderr);
    runGit(fixture.repo, ["push", "origin", "refs/heads/dev:refs/heads/dev"]);
    runGit(fixture.repo, ["update-ref", "-d", "refs/remotes/origin/dev"]);
    const beforeRemoteRefs = remoteHeadSnapshot(fixture.remote);

    const result = runBranchFoundationCli(["push-remote", "--approval", "operator approved remote setup"], {
      cwd: fixture.repo,
    });
    const afterRemoteRefs = remoteHeadSnapshot(fixture.remote);

    assert.notEqual(result.status, 0);
    assert.equal(afterRemoteRefs, beforeRemoteRefs);
    assert.match(result.stderr, /live_remote_branch_exists|live remote branch exists/i);
  } finally {
    fixture.cleanup();
  }
});

test("unknown evidence stays unknown and does not create mutation plans", () => {
  const report = buildBranchFoundationReport({
    repoRoot: "/repo",
    currentBranch: "main",
    dirtyState: "clean",
    defaultTaskTarget: "dev",
    expectedBase: "main",
    localBranches: {
      main: { exists: true },
      dev: { exists: "unknown" },
    },
    remoteBranches: {
      main: { exists: true },
      dev: { exists: "unknown" },
    },
  });
  const dev = report.requiredBranches.find((status) => status.branch === "dev");

  assert.equal(dev.localExists, "unknown");
  assert.equal(dev.remoteExists, "unknown");
  assert.equal(report.plannedMutations.some((mutation) => mutation.branch === "dev"), false);
});

test("planned remote push preview uses explicit full refspec", () => {
  const report = buildBranchFoundationReport({
    repoRoot: "/repo",
    currentBranch: "main",
    dirtyState: "clean",
    defaultTaskTarget: "dev",
    expectedBase: "main",
    localBranches: {
      main: { exists: true },
      dev: { exists: true },
    },
    remoteBranches: {
      main: { exists: true },
      dev: { exists: false },
    },
  });
  const push = report.plannedMutations.find((mutation) => mutation.operation === "push_remote_branch" && mutation.branch === "dev");

  assert.match(push.commandPreview, /refs\/heads\/dev:refs\/heads\/dev/);
  assert.equal(validateBranchFoundationMutationCommand("push_remote_branch", ["push", "-u", "origin", "refs/heads/dev:refs/heads/dev"]), true);
});

test("apply-local surfaces dirty main warning before approved mutation", () => {
  const fixture = createGitFixture();
  try {
    writeFileSync(join(fixture.repo, "dirty.txt"), "dirty\n");
    const beforeRefs = refSnapshot(fixture.repo);
    const result = runBranchFoundationCli(["apply-local", "--approval", "operator approved local setup"], {
      cwd: fixture.repo,
    });
    const afterRefs = refSnapshot(fixture.repo);

    assert.notEqual(result.status, 0);
    assert.equal(afterRefs, beforeRefs);
    assert.match(result.stderr, /dirty_human_gate/);
    assert.match(result.stderr, /protected branch warning/i);
    assert.equal(localBranchExists(fixture.repo, "dev"), false);
  } finally {
    fixture.cleanup();
  }
});

test("apply-local preflights all branches before mutation", () => {
  const fixture = createGitFixture();
  try {
    runGit(fixture.repo, ["branch", "prod/x", "main"]);
    const beforeRefs = refSnapshot(fixture.repo);
    const result = runBranchFoundationCli(["apply-local", "--approval", "operator approved local setup"], {
      cwd: fixture.repo,
    });
    const afterRefs = refSnapshot(fixture.repo);

    assert.notEqual(result.status, 0);
    assert.equal(afterRefs, beforeRefs);
    assert.equal(localBranchExists(fixture.repo, "dev"), false);
    assert.match(result.stderr, /local_branch_namespace_conflict|local branch namespace conflict/i);
  } finally {
    fixture.cleanup();
  }
});

test("push-remote preflights all branches before mutation", () => {
  const fixture = createGitFixture();
  try {
    runGit(fixture.repo, ["branch", "dev", "main"]);
    runGit(fixture.repo, ["branch", "staging", "main"]);
    const beforeRemoteRefs = remoteHeadSnapshot(fixture.remote);
    const result = runBranchFoundationCli(["push-remote", "--approval", "operator approved remote setup"], {
      cwd: fixture.repo,
    });
    const afterRemoteRefs = remoteHeadSnapshot(fixture.remote);

    assert.notEqual(result.status, 0);
    assert.equal(afterRemoteRefs, beforeRemoteRefs);
    assert.doesNotMatch(afterRemoteRefs, /refs\/heads\/dev:/);
    assert.match(result.stderr, /local_branch_missing|local branch missing/i);
  } finally {
    fixture.cleanup();
  }
});

test("push-remote preserves partial execution evidence when a later push fails", () => {
  const fixture = createGitFixture();
  try {
    const localResult = runBranchFoundationCli(["apply-local", "--approval", "operator approved local setup"], {
      cwd: fixture.repo,
    });
    assert.equal(localResult.status, 0, localResult.stderr);
    installRejectingRemoteHook(fixture.remote, "staging");

    const result = runBranchFoundationCli(["push-remote", "--approval", "operator approved remote setup", "--json"], {
      cwd: fixture.repo,
    });
    const body = JSON.parse(result.stdout);
    const actionByBranch = Object.fromEntries(body.actions.map((action) => [action.branch, action]));
    const remoteRefs = remoteHeadSnapshot(fixture.remote);

    assert.notEqual(result.status, 0);
    assert.equal(actionByBranch.dev.status, "pushed");
    assert.equal(actionByBranch.staging.status, "refused");
    assert.equal(actionByBranch.staging.reason, "git_push_failed");
    assert.equal(actionByBranch.prod.status, "not_run");
    assert.equal(actionByBranch.prod.reason, "prior_failure");
    assert.match(remoteRefs, /refs\/heads\/dev:/);
    assert.doesNotMatch(remoteRefs, /refs\/heads\/staging:/);
    assert.doesNotMatch(remoteRefs, /refs\/heads\/prod:/);
  } finally {
    fixture.cleanup();
  }
});

test("Git evidence outside a repository remains unknown and does not plan mutations", () => {
  const root = mkdtempSync(join(tmpdir(), "branch-foundation-not-git-"));
  try {
    const evidence = loadBranchFoundationGitEvidence({}, { cwd: root });
    const result = runBranchFoundationCli(["report", "--json"], { cwd: root });
    const report = JSON.parse(result.stdout);

    assert.equal(evidence.repoRoot, "");
    assert.equal(evidence.dirtyState, "unknown");
    assert.equal(result.status, 0, result.stderr);
    assert.equal(report.dirtyState, "unknown");
    assert.deepEqual(report.requiredBranches.map((status) => [status.branch, status.localExists, status.remoteExists]), [
      ["dev", "unknown", "unknown"],
      ["staging", "unknown", "unknown"],
      ["main", "unknown", "unknown"],
      ["prod", "unknown", "unknown"],
    ]);
    assert.deepEqual(report.plannedMutations, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("branch foundation check fails closed when Git refs cannot be inspected", () => {
  const root = mkdtempSync(join(tmpdir(), "branch-foundation-check-not-git-"));
  try {
    const result = runBranchFoundationChecks({
      cwd: root,
      runCli: (args) => runBranchFoundationCli(args, { cwd: root }),
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /could not capture Git refs before CLI checks/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("builds Slice A readiness evidence with FR coverage and metadata-only planned actions", () => {
  const report = buildBranchFoundationReport({
    repoRoot: "/repo",
    currentBranch: "feature/safe",
    dirtyState: "clean",
    defaultTaskTarget: "dev",
    expectedBase: "main",
    localBranches: {
      dev: { exists: true },
      staging: { exists: true },
      main: { exists: true },
      prod: { exists: true },
    },
    remoteBranches: {
      dev: { exists: false },
      staging: { exists: false },
      main: { exists: true },
      prod: { exists: false },
    },
  });

  const evidence = buildBranchFoundationReadinessEvidence(report, {
    generatedAt: "2026-06-25T00:00:00.000Z",
  });
  const frIds = evidence.frCoverage.map((entry) => entry.id);

  assert.equal(evidence.generatedAt, "2026-06-25T00:00:00.000Z");
  assert.equal(evidence.status, "needs_remote_setup");
  assert.equal(evidence.defaultTaskTarget, "dev");
  assert.deepEqual(frIds, ["FR1", "FR2", "FR3", "FR12", "FR13", "FR14", "FR15"]);
  assert.ok(evidence.frCoverage.every((entry) => entry.storyEvidence.length > 0));
  assert.ok(evidence.frCoverage.every((entry) => entry.implementationEvidence.length > 0));
  assert.ok(evidence.frCoverage.every((entry) => entry.verificationEvidence.length > 0));
  assert.ok(evidence.frCoverage.every((entry) => entry.implementationEvidence.every((item) => !item.startsWith("_bmad-output/"))));
  assert.ok(evidence.plannedNextActions.some((action) => action.operation === "push_remote_branch" && action.branch === "dev"));
  assert.ok(evidence.plannedNextActions.every((action) => action.requiresApproval === true));
  assert.equal(JSON.stringify(evidence).includes("commandPreview"), false);
});

test("readiness evidence reports established branch foundation when local and remote lanes exist", () => {
  const report = buildBranchFoundationReport({
    repoRoot: "/repo",
    currentBranch: "dev",
    dirtyState: "clean",
    defaultTaskTarget: "dev",
    expectedBase: "main",
    localBranches: {
      dev: { exists: true },
      staging: { exists: true },
      main: { exists: true },
      prod: { exists: true },
    },
    remoteBranches: {
      dev: { exists: true },
      staging: { exists: true },
      main: { exists: true },
      prod: { exists: true },
    },
  });

  const evidence = buildBranchFoundationReadinessEvidence(report);

  assert.equal(evidence.status, "established");
  assert.deepEqual(evidence.plannedNextActions, []);
  assert.ok(evidence.branchLanes.every((lane) => lane.localExists === true && lane.remoteExists === true));
});

test("readiness evidence reflects approved fixture setup from local through remote establishment", () => {
  const fixture = createGitFixture();
  try {
    const localResult = runBranchFoundationCli(["apply-local", "--approval", "operator approved local setup"], {
      cwd: fixture.repo,
    });
    assert.equal(localResult.status, 0, localResult.stderr);

    const localReport = JSON.parse(runBranchFoundationCli(["report", "--json"], { cwd: fixture.repo }).stdout);
    const localEvidence = buildBranchFoundationReadinessEvidence(localReport);
    const localLaneByBranch = Object.fromEntries(localEvidence.branchLanes.map((lane) => [lane.branch, lane]));

    assert.equal(localEvidence.status, "needs_remote_setup");
    assert.equal(localLaneByBranch.dev.localExists, true);
    assert.equal(localLaneByBranch.staging.localExists, true);
    assert.equal(localLaneByBranch.prod.localExists, true);
    assert.equal(localLaneByBranch.dev.remoteExists, false);
    assert.ok(localEvidence.plannedNextActions.some((action) => action.operation === "push_remote_branch"));

    const remoteResult = runBranchFoundationCli(["push-remote", "--approval", "operator approved remote setup"], {
      cwd: fixture.repo,
    });
    assert.equal(remoteResult.status, 0, remoteResult.stderr);

    const establishedReport = JSON.parse(runBranchFoundationCli(["report", "--json"], { cwd: fixture.repo }).stdout);
    const establishedEvidence = buildBranchFoundationReadinessEvidence(establishedReport);

    assert.equal(establishedEvidence.status, "established");
    assert.deepEqual(establishedEvidence.plannedNextActions, []);
    assert.ok(establishedEvidence.branchLanes.every((lane) => lane.localExists === true && lane.remoteExists === true));
  } finally {
    fixture.cleanup();
  }
});

test("readiness evidence fails closed on unknown branch evidence", () => {
  const report = buildBranchFoundationReport({
    repoRoot: "/repo",
    currentBranch: "main",
    dirtyState: "unknown",
    defaultTaskTarget: "dev",
    expectedBase: "main",
  });

  const evidence = buildBranchFoundationReadinessEvidence(report);

  assert.equal(evidence.status, "unknown_evidence");
  assert.deepEqual(
    evidence.plannedNextActions.map((action) => [action.operation, action.branch, action.reason]),
    [["resolve_protected_branch_warning", "main", "unknown_human_gate_cleanliness"]],
  );
  assert.equal(buildBranchFoundationReadinessEvidence({}).status, "unknown_evidence");
  assert.equal(
    buildBranchFoundationReadinessEvidence({
      requiredBranches: [
        { branch: "dev", role: "development", localExists: true, remoteExists: true },
        { branch: "main", role: "human_gate", localExists: true, remoteExists: true },
      ],
    }).status,
    "unknown_evidence",
  );
});

test("readiness evidence surfaces dirty main as a Human Gate warning without mutation", () => {
  const fixture = createGitFixture();
  try {
    writeFileSync(join(fixture.repo, "dirty.txt"), "dirty\n");
    const beforeRefs = refSnapshot(fixture.repo);
    const result = runBranchFoundationCli(["report", "--json"], { cwd: fixture.repo });
    const report = JSON.parse(result.stdout);
    const evidence = buildBranchFoundationReadinessEvidence(report);
    const formatted = formatBranchFoundationReadinessEvidence(evidence);
    const afterRefs = refSnapshot(fixture.repo);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(afterRefs, beforeRefs);
    assert.equal(evidence.status, "warnings_present");
    assert.ok(evidence.protectedBranchWarnings.some((warning) => warning.reason === "dirty_human_gate"));
    assert.deepEqual(
      evidence.plannedNextActions.map((action) => [action.operation, action.branch, action.requiresApproval]),
      [["resolve_protected_branch_warning", "main", false]],
    );
    assert.match(formatted, /Readiness status: warnings_present/);
    assert.match(formatted, /dirty_human_gate/);
    assert.doesNotMatch(formatted, /cleanup|delete|force/i);
  } finally {
    fixture.cleanup();
  }
});

test("readiness evidence formatting remains metadata-only", () => {
  const report = buildBranchFoundationReport({
    repoRoot: "/repo/super-secret-token",
    currentBranch: "secret-token-branch",
    dirtyState: "dirty",
    defaultTaskTarget: "token-target",
    expectedBase: "main; echo super-secret-token",
    localBranches: {
      main: { exists: true, sha: "main-local-super-secret-token" },
      dev: { exists: false, sha: "stale-super-secret-token" },
    },
    remoteBranches: {
      main: { exists: true, sha: "main-remote" },
    },
  }, { generatedAt: "2026-06-25T00:00:00.000Z" });

  const evidence = buildBranchFoundationReadinessEvidence(report);
  const formatted = formatBranchFoundationReadinessEvidence(evidence);

  assert.equal(JSON.stringify(evidence).includes("super-secret-token"), false);
  assert.equal(formatted.includes("super-secret-token"), false);
  assert.match(formatted, /Branch Foundation Slice A Readiness/);
});

test("branch foundation package scripts and check script are wired", () => {
  const packageJson = JSON.parse(readText(packageJsonPath));
  assert.equal(packageJson.scripts["test:branch-foundation"], "node --test tests/branch-foundation.test.mjs");
  assert.equal(packageJson.scripts["check:branch-foundation"], "node ./scripts/check-branch-foundation.mjs");
  assert.equal(existsSync(branchFoundationCheck), true);

  const result = runBranchFoundationChecks({
    cwd: repoRoot,
    runCli: (args) => runBranchFoundationCli(args, { cwd: repoRoot }),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Branch foundation checks passed/);
  assert.match(result.stdout, /Branch Foundation Slice A Readiness/);
  assert.match(result.stdout, /Readiness status:/);
  assert.match(result.stdout, /FR coverage:/);
});

function createGitFixture() {
  const root = mkdtempSync(join(tmpdir(), "branch-foundation-"));
  const repo = join(root, "repo");
  const remote = join(root, "origin.git");
  runGit(root, ["init", "--bare", remote]);
  runGit(root, ["init", "-b", "main", repo]);
  runGit(repo, ["config", "user.email", "test@example.test"]);
  runGit(repo, ["config", "user.name", "Test User"]);
  writeFileSync(join(repo, "README.md"), "fixture\n");
  runGit(repo, ["add", "README.md"]);
  runGit(repo, ["commit", "-m", "initial"]);
  runGit(repo, ["remote", "add", "origin", remote]);
  runGit(repo, ["push", "-u", "origin", "main"]);
  return {
    repo,
    remote,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function refSnapshot(cwd) {
  return runGit(cwd, ["for-each-ref", "--format=%(refname):%(objectname)", "refs/heads", "refs/remotes"]).stdout;
}

function runGit(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return {
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

function localBranchExists(cwd, branch) {
  return runGitAllowFailure(cwd, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]).status === 0;
}

function remoteHeadSnapshot(remote) {
  return runGitAllowFailure(remote, ["for-each-ref", "--format=%(refname):%(objectname)", "refs/heads"]).stdout;
}

function installRejectingRemoteHook(remote, rejectedBranch) {
  const hookPath = join(remote, "hooks", "pre-receive");
  writeFileSync(
    hookPath,
    `#!/bin/sh
while read oldrev newrev refname
do
  if [ "$refname" = "refs/heads/${rejectedBranch}" ]; then
    echo "rejected ${rejectedBranch}" >&2
    exit 1
  fi
done
exit 0
`,
  );
  chmodSync(hookPath, 0o755);
}

function runGitAllowFailure(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
  return {
    status: result.status ?? 1,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || result.error?.message || "").trim(),
  };
}

function readText(path) {
  return readFileSync(path, "utf8");
}
