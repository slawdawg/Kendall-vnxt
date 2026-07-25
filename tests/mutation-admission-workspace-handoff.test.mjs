import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { handoffAdmittedManagedLane } from "../scripts/lib/mutation-admission-workspace-handoff.mjs";

const baseCheckout = "/repo/base";
const worktreePath = "/workspace/worktrees/clean-lane";
const manifestPath = "/workspace/tasks/clean-lane.json";

const createAdmission = Object.freeze({
  outcome: "create_managed_lane",
  reasonCode: "admission.create_managed_lane",
  nextSafeAction: "Preview or start a managed lane through codex-workspace.",
  canonicalStage: "route",
  canonicalStatus: "active",
  canonicalOwner: "kendall",
  projection: { column: "Prepare", attentionKind: null, derived: true },
  laneEvidence: {
    taskId: "clean-lane",
    branch: "codex/clean-lane",
    worktreePath,
    manifestPath,
    owner: "codex:worker",
    ownerWarning: null,
  },
  mutation: "none; admission decision only",
});

const resumeAdmission = Object.freeze({
  ...createAdmission,
  outcome: "resume_managed_lane",
  reasonCode: "admission.resume_existing_lane",
  nextSafeAction: "Resume the identified managed lane through codex-workspace.",
});

const nonLaneAdmissions = [
  { outcome: "read_only", reasonCode: "admission.read_only" },
  { outcome: "recovery_required", reasonCode: "admission.base_checkout_dirty" },
  { outcome: "decision_needed", reasonCode: "admission.activity_ambiguous" },
];

test("create starts exactly the previewed codex-workspace lane then returns managed CWD evidence", () => {
  const calls = [];
  const result = handoffAdmittedManagedLane(createAdmission, {
    description: "Clean lane handoff",
    runner(command, args) {
      calls.push({ command, args });
      if (args[1] === "start") return success();
      return jsonSuccess(resumePacket());
    },
    exists: (path) => path === worktreePath,
    ...safeManagedLaneContext(),
    currentGitRoot: () => baseCheckout,
  });

  assert.equal(result.status, "ready");
  assert.equal(result.outcome, "create_managed_lane");
  assert.deepEqual(result.laneEvidence, {
    taskId: "clean-lane",
    branch: "codex/clean-lane",
    worktreePath,
    manifestPath,
    owner: "codex:worker",
  });
  assert.deepEqual(result.workerHandoff, { cwd: worktreePath });
  assert.deepEqual(result.preWriteGuardEvidence, {
    baseCheckoutPath: baseCheckout,
    worktreePath,
    laneEvidence: result.laneEvidence,
  });
  assert.equal("command" in result.workerHandoff, false);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], {
    command: process.execPath,
    args: [
      "./scripts/codex-workspace.mjs", "start", "Clean lane handoff",
      "--task-id", "clean-lane",
      "--branch", "codex/clean-lane",
      "--worktree", worktreePath,
      "--state-root", "/workspace",
      "--owner", "codex:worker",
      "--no-fetch",
    ],
  });
  assert.deepEqual(calls[1], {
    command: process.execPath,
    args: [
      "./scripts/codex-workspace.mjs", "resume", "clean-lane", "--json",
      "--state-root", "/workspace", "--owner", "codex:worker",
    ],
  });
});

test("resume uses the owner-aware JSON packet and returns the existing managed CWD", () => {
  const calls = [];
  const result = handoffAdmittedManagedLane(resumeAdmission, {
    runner(command, args) {
      calls.push({ command, args });
      return jsonSuccess(resumePacket());
    },
    exists: (path) => path === worktreePath,
    ...safeManagedLaneContext(),
    currentGitRoot: () => baseCheckout,
  });

  assert.equal(result.status, "ready");
  assert.equal(result.outcome, "resume_managed_lane");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args[1], "resume");
  assert.equal(result.workerHandoff.cwd, worktreePath);
});

test("owner mismatch is blocked before a worker CWD is returned", () => {
  const result = handoffAdmittedManagedLane(resumeAdmission, {
    runner() {
      return jsonSuccess({ ...resumePacket(), currentOwner: "other", ownerMatches: false, ownerWarning: "owned by codex:worker" });
    },
    exists: (path) => path === worktreePath,
    ...safeManagedLaneContext(),
    currentGitRoot: () => baseCheckout,
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.reasonCode, "handoff.owner_mismatch");
  assert.equal("workerHandoff" in result, false);
  assert.match(result.nextSafeAction, /takeover/i);
});

test("a missing or Base Checkout worktree fails closed", () => {
  const missing = handoffAdmittedManagedLane(resumeAdmission, {
    runner: () => jsonSuccess({ ...resumePacket(), worktreeExists: false }),
    exists: () => false,
    ...safeManagedLaneContext(),
    currentGitRoot: () => baseCheckout,
  });
  assert.equal(missing.status, "blocked");
  assert.equal(missing.reasonCode, "handoff.worktree_missing");

  const baseAdmission = {
    ...resumeAdmission,
    laneEvidence: { ...resumeAdmission.laneEvidence, worktreePath: baseCheckout },
  };
  const base = handoffAdmittedManagedLane(baseAdmission, {
    runner: () => jsonSuccess({ ...resumePacket(), worktreePath: baseCheckout }),
    exists: (path) => path === baseCheckout,
    readManifest: () => manifestPacket({ worktree_path: baseCheckout }),
    worktreeRegistry: () => [baseCheckout],
    realpath: (path) => path,
    stat: () => ({ dev: 1, ino: 1 }),
    currentGitRoot: () => baseCheckout,
  });
  assert.equal(base.status, "blocked");
  assert.equal(base.reasonCode, "handoff.base_checkout_target");
});

test("a symlinked worktree alias to the Base Checkout is blocked by realpath identity", () => {
  const root = mkdtempSync(join(tmpdir(), "mutation-admission-symlink-"));
  const base = join(root, "base");
  const alias = join(root, "alias");
  mkdirSync(base);
  symlinkSync(base, alias, "dir");
  try {
    const admission = { ...resumeAdmission, laneEvidence: { ...resumeAdmission.laneEvidence, worktreePath: alias } };
    const result = handoffAdmittedManagedLane(admission, {
      runner: () => jsonSuccess({ ...resumePacket(), worktreePath: alias }),
      readManifest: () => manifestPacket({ worktree_path: alias }),
      worktreeRegistry: () => [alias],
      baseCheckoutPath: base,
    });
    assert.equal(result.status, "blocked");
    assert.equal(result.reasonCode, "handoff.base_checkout_target");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("handoff requires matching manifest and registered-worktree provenance", () => {
  const missingRegistry = handoffAdmittedManagedLane(resumeAdmission, {
    runner: () => jsonSuccess(resumePacket()),
    exists: (path) => path === worktreePath,
    readManifest: () => manifestPacket(),
    worktreeRegistry: () => [{ path: baseCheckout, branch: "refs/heads/dev", detached: false }],
    realpath: (path) => path,
    stat: (path) => ({ dev: 1, ino: path === baseCheckout ? 1 : 2 }),
    currentGitRoot: () => baseCheckout,
  });
  assert.equal(missingRegistry.status, "blocked");
  assert.equal(missingRegistry.reasonCode, "handoff.worktree_unregistered");

  const mismatchedManifest = handoffAdmittedManagedLane(resumeAdmission, {
    runner: () => jsonSuccess(resumePacket()),
    exists: (path) => path === worktreePath,
    readManifest: () => manifestPacket({ branch: "codex/other" }),
    worktreeRegistry: () => [
      { path: baseCheckout, branch: "refs/heads/dev", detached: false },
      { path: worktreePath, branch: "refs/heads/codex/clean-lane", detached: false },
    ],
    realpath: (path) => path,
    stat: (path) => ({ dev: 1, ino: path === baseCheckout ? 1 : 2 }),
    currentGitRoot: () => baseCheckout,
  });
  assert.equal(mismatchedManifest.status, "blocked");
  assert.equal(mismatchedManifest.reasonCode, "handoff.manifest_provenance_invalid");
});

test("handoff reads the actual manifest and accepts only the registered managed worktree", () => {
  const root = mkdtempSync(join(tmpdir(), "mutation-admission-provenance-"));
  const base = join(root, "base");
  const worktree = join(root, "worktrees", "clean-lane");
  const manifest = join(root, "tasks", "clean-lane.json");
  mkdirSync(base);
  mkdirSync(worktree, { recursive: true });
  mkdirSync(join(root, "tasks"), { recursive: true });
  writeFileSync(manifest, `${JSON.stringify(manifestPacket({ worktree_path: worktree }))}\n`);
  try {
    const admission = { ...resumeAdmission, laneEvidence: { ...resumeAdmission.laneEvidence, worktreePath: worktree, manifestPath: manifest } };
    const result = handoffAdmittedManagedLane(admission, {
      runner: () => jsonSuccess({ ...resumePacket(), worktreePath: worktree, manifestPath: manifest }),
      worktreeRegistry: () => [
        { path: base, branch: "refs/heads/dev", detached: false },
        { path: worktree, branch: "refs/heads/codex/clean-lane", detached: false },
      ],
      baseCheckoutPath: base,
    });
    assert.equal(result.status, "ready");
    assert.equal(result.workerHandoff.cwd, worktree);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("handoff derives the primary Base Checkout from Git worktree metadata, not the managed caller CWD", () => {
  const root = mkdtempSync(join(tmpdir(), "mutation-admission-primary-worktree-"));
  const base = join(root, "base");
  const managed = join(root, "worktrees", "clean-lane");
  const manifest = join(root, "tasks", "clean-lane.json");
  mkdirSync(base);
  mkdirSync(managed, { recursive: true });
  mkdirSync(join(root, "tasks"), { recursive: true });
  writeFileSync(manifest, `${JSON.stringify(manifestPacket({ worktree_path: managed }))}\n`);
  const registry = [
    `worktree ${base}`,
    "HEAD 1111111111111111111111111111111111111111",
    "branch refs/heads/dev",
    "",
    `worktree ${managed}`,
    "HEAD 2222222222222222222222222222222222222222",
    "branch refs/heads/codex/clean-lane",
    "",
  ].join("\n");
  try {
    const admission = { ...resumeAdmission, laneEvidence: { ...resumeAdmission.laneEvidence, worktreePath: managed, manifestPath: manifest } };
    const result = handoffAdmittedManagedLane(admission, {
      runner: () => jsonSuccess({ ...resumePacket(), worktreePath: managed, manifestPath: manifest }),
      currentGitRoot: () => managed,
      gitRunner: () => ({ status: 0, stdout: registry, stderr: "" }),
    });
    assert.equal(result.status, "ready");
    assert.equal(result.workerHandoff.cwd, managed);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("handoff rejects a detached or branch-mismatched Git worktree registry entry", () => {
  const detachedRegistry = [
    "worktree /repo/base",
    "HEAD 1111111111111111111111111111111111111111",
    "branch refs/heads/dev",
    "",
    `worktree ${worktreePath}`,
    "HEAD 2222222222222222222222222222222222222222",
    "detached",
    "",
  ].join("\n");
  const result = handoffAdmittedManagedLane(resumeAdmission, {
    runner: () => jsonSuccess(resumePacket()),
    exists: (path) => path === worktreePath,
    readManifest: () => manifestPacket(),
    currentGitRoot: () => "/repo/base",
    gitRunner: () => ({ status: 0, stdout: detachedRegistry, stderr: "" }),
    realpath: (path) => path,
    stat: (path) => ({ dev: 1, ino: path === "/repo/base" ? 1 : 2 }),
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.reasonCode, "handoff.worktree_unregistered");
});

test("read-only, recovery, and decision outcomes never invoke lifecycle commands", () => {
  for (const admission of nonLaneAdmissions) {
    let calls = 0;
    const result = handoffAdmittedManagedLane(admission, {
      runner() {
        calls += 1;
        return success();
      },
    });
    assert.equal(result.status, "not_applicable");
    assert.equal(result.outcome, admission.outcome);
    assert.equal(result.mutation, "none; no workspace lifecycle command invoked");
    assert.equal(calls, 0);
  }
});

test("an unsafe lifecycle command failure remains blocked with a precise route", () => {
  let calls = 0;
  const result = handoffAdmittedManagedLane(createAdmission, {
    description: "Clean lane handoff",
    runner: () => {
      calls += 1;
      return { code: 1, stdout: "", stderr: "branch already exists" };
    },
    exists: () => false,
    currentGitRoot: () => baseCheckout,
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.reasonCode, "handoff.workspace_start_failed");
  assert.equal("workerHandoff" in result, false);
  assert.match(result.nextSafeAction, /inspect codex-workspace start/i);
  assert.equal(result.mutation, "codex-workspace start attempted; inspect lifecycle state before retrying");
  assert.equal(calls, 1);
});

function resumePacket() {
  return {
    taskId: "clean-lane",
    status: "active",
    branch: "codex/clean-lane",
    owner: "codex:worker",
    currentOwner: "codex:worker",
    ownerMatches: true,
    ownerWarning: null,
    worktreePath,
    worktreeExists: true,
    manifestPath,
    mutation: "none; resume only",
  };
}

function success() {
  return { code: 0, stdout: "", stderr: "" };
}

function jsonSuccess(value) {
  return { code: 0, stdout: JSON.stringify(value), stderr: "" };
}

function manifestPacket(overrides = {}) {
  return {
    task_id: "clean-lane",
    status: "active",
    branch: "codex/clean-lane",
    owner: "codex:worker",
    worktree_path: worktreePath,
    ...overrides,
  };
}

function safeManagedLaneContext() {
  return {
    readManifest: () => manifestPacket(),
    worktreeRegistry: () => [
      { path: baseCheckout, branch: "refs/heads/dev", detached: false },
      { path: worktreePath, branch: "refs/heads/codex/clean-lane", detached: false },
    ],
    realpath: (path) => path,
    stat: (path) => ({ dev: 1, ino: path === baseCheckout ? 1 : 2 }),
  };
}
