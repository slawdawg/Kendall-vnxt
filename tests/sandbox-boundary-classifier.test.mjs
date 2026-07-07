import assert from "node:assert/strict";
import test from "node:test";

import {
  classifySandboxBoundaryResult,
  isKnownSandboxBoundary,
} from "../scripts/lib/sandbox-boundary-classifier.mjs";

test("classifies spawnSync EPERM as a metadata-only sandbox boundary packet", () => {
  const packet = classifySandboxBoundaryResult({
    command: "node ./scripts/manager-preflight.mjs --summary-json",
    readOnly: true,
    result: {
      error: Object.assign(new Error("spawnSync git EPERM"), { code: "EPERM" }),
      stdout: "",
      stderr: "spawnSync git EPERM",
      status: null,
      signal: null,
    },
  });

  assertSandboxPacket(packet, {
    signature: "spawnSync EPERM sandbox boundary",
    command: "node ./scripts/manager-preflight.mjs --summary-json",
  });
  assert.match(packet.evidence_summary, /Child process spawn/);
});

test("classifies EPERM and EACCES probes for known manager dependencies", () => {
  const cases = [
    {
      command: "node ./scripts/manager-preflight.mjs --summary-json",
      stderr: "git status failed: EPERM: operation not permitted, open '.git/FETCH_HEAD'",
      signature: "git sandbox permission boundary",
      evidence: /Git probe/,
    },
    {
      command: "node ./scripts/manager-cycle-packet.mjs --summary-json",
      stderr: "tmux list-panes failed: EACCES permission denied",
      signature: "tmux sandbox permission boundary",
      evidence: /tmux probe/,
    },
    {
      command: "node ./scripts/manager-stale-owner-inspection.mjs --summary-json",
      stderr: "assignment workspace metadata probe failed with EPERM",
      signature: "workspace metadata sandbox permission boundary",
      evidence: /workspace metadata probe/,
    },
    {
      command: "node ./scripts/manager-run-loop.mjs --summary-json --once",
      stderr: "child_process probe failed: operation not permitted",
      signature: "child process sandbox permission boundary",
      evidence: /child process probe/,
    },
  ];

  for (const current of cases) {
    const packet = classifySandboxBoundaryResult({
      command: current.command,
      stderr: current.stderr,
      readOnly: true,
    });

    assertSandboxPacket(packet, {
      signature: current.signature,
      command: current.command,
    });
    assert.match(packet.evidence_summary, current.evidence);
  }
});

test("classifies read-only filesystem boundaries for known local state targets", () => {
  const cases = [
    {
      command: "node ./scripts/test-codex-workspace.mjs",
      stderr: "fatal: could not create leading directories of '.git/worktrees/codex-example': Read-only file system",
      signature: ".git/worktrees read-only filesystem boundary",
      evidence: /\.git\/worktrees/,
    },
    {
      command: "uv run --directory services/supervisor python --version",
      stderr: "$HOME/.cache/uv cannot be written: Read-only file system",
      signature: "$HOME/.cache/uv read-only filesystem boundary",
      evidence: /\$HOME\/\.cache\/uv/,
    },
    {
      command: "mise run workspace-doctor",
      stderr: "managed-worktree pnpm temp file failed: EROFS",
      signature: "managed-worktree pnpm temp read-only filesystem boundary",
      evidence: /pnpm temp/,
    },
    {
      command: "node ./scripts/manager-cleanup-plan.mjs --summary-json",
      stderr: "/tmp/.codex-workspaces/slawdawg-kendall-vnxt/tasks: EROFS",
      signature: "local Codex workspace state read-only filesystem boundary",
      evidence: /local Codex workspace state/,
    },
  ];

  for (const current of cases) {
    const packet = classifySandboxBoundaryResult({
      command: current.command,
      stderr: current.stderr,
      readOnly: true,
    });

    assertSandboxPacket(packet, {
      signature: current.signature,
      command: current.command,
    });
    assert.match(packet.evidence_summary, current.evidence);
  }
});

test("classifies empty stdout from expected JSON child commands", () => {
  const packet = classifySandboxBoundaryResult({
    command: "node ./scripts/codex-workspace.mjs list --active --json",
    expectedJson: true,
    readOnly: true,
    stdout: "",
    stderr: "SyntaxError: Unexpected end of JSON input",
    status: 1,
  });

  assertSandboxPacket(packet, {
    signature: "empty JSON stdout sandbox/process boundary",
    command: "node ./scripts/codex-workspace.mjs list --active --json",
  });
  assert.match(packet.next_action, /Stop parsing empty stdout as JSON/);
});

test("does not authorize exact outside-sandbox rerun without read-only proof", () => {
  const packet = classifySandboxBoundaryResult({
    command: "node ./scripts/codex-workspace.mjs dispatch-next --apply --summary-json",
    stderr: "workspace metadata probe failed with EPERM",
  });

  assert.equal(packet.boundary, true);
  assert.equal(packet.safe_rerun, "none");
  assert.equal(packet.mutation, "none");
});

test("preserves command argument boundaries for array input", () => {
  const packet = classifySandboxBoundaryResult({
    command: ["node", "./scripts/codex-workspace.mjs", "takeover", "lane with space", "--summary-json"],
    stderr: "workspace metadata probe failed with EPERM",
    readOnly: true,
  });

  assert.equal(packet.command, "node ./scripts/codex-workspace.mjs takeover 'lane with space' --summary-json");
});

test("does not classify normal product or successful JSON output as a sandbox boundary", () => {
  assert.equal(
    classifySandboxBoundaryResult({
      command: "node --test tests/example.test.mjs",
      stderr: "AssertionError: expected true to equal false",
      status: 1,
    }),
    null,
  );

  assert.equal(
    classifySandboxBoundaryResult({
      command: "node ./scripts/codex-workspace.mjs list --active --json",
      expectedJson: true,
      stdout: "{\"tasks\":[]}",
      status: 0,
    }),
    null,
  );

  assert.equal(
    classifySandboxBoundaryResult({
      command: "node ./scripts/codex-workspace.mjs claim-next --summary-json",
      expectedJson: true,
      readOnly: true,
      stdout: "",
      stderr: "ERROR: malformed emergency-stop state",
      status: 1,
    }),
    null,
  );

  assert.equal(isKnownSandboxBoundary({ stderr: "AssertionError: failed product check" }), false);
});

function assertSandboxPacket(packet, expected) {
  assert.equal(packet.boundary, true);
  assert.equal(packet.class, "sandbox");
  assert.equal(packet.signature, expected.signature);
  assert.equal(packet.command, expected.command);
  assert.equal(packet.safe_rerun, "exact_command_outside_sandbox_when_read_only");
  assert.equal(packet.mutation, "none");
  assert.match(
    packet.next_action,
    /exact same read-only command outside the sandbox|Stop parsing empty stdout/,
  );
}
