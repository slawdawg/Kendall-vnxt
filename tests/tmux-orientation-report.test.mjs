import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildOrientationReport,
  parseArgs,
  parseTmuxPaneOutput,
  readTmuxPanes,
  renderHumanReport,
  runReport,
  tmuxListPanesArgs,
} from "../scripts/tmux-orientation-report.mjs";

const separator = "\u001f";

test("parseArgs accepts pnpm option separator before script options", () => {
  assert.deepEqual(parseArgs(["--", "--json", "--owner", "runner-a"]), {
    json: true,
    allowMissingTmux: false,
    stateRoot: "",
    owner: "runner-a",
  });
});

test("parseArgs rejects missing option values", () => {
  assert.throws(() => parseArgs(["--owner"]), /--owner requires a value/);
  assert.throws(() => parseArgs(["--state-root", "--json"]), /--state-root requires a value/);
});

test("maps tmux pane metadata to managed workspace ownership and readiness", () => {
  const root = mkdtempSync(join(tmpdir(), "tmux-orientation-"));
  try {
    const worktree = join(root, "worktrees", "20260625-tmux-orientation-slice-b");
    mkdirSync(worktree, { recursive: true });
    const panes = [
      paneFixture({ sessionName: "knx-tmux-orientation", currentPath: worktree }),
      paneFixture({ sessionName: "knx-dev", currentPath: join(root, "Kendall_Nxt"), paneIndex: "2" }),
    ];

    const report = buildOrientationReport({
      panes,
      stateRoot: root,
      currentOwner: "runner-a",
      workspaceRecords: [
        {
          path: join(root, "tasks", "20260625-tmux-orientation-slice-b.json"),
          manifest: {
            task_id: "20260625-tmux-orientation-slice-b",
            branch: "codex/tmux-orientation-slice-b",
            base_branch: "dev",
            owner: "runner-a",
            status: "active",
            mode: "pr",
            worktree_path: worktree,
            last_verified_at: "2026-06-26T00:00:00.000Z",
            last_verification_command: "pnpm run test:tmux-orientation-report",
          },
        },
      ],
      dirtyStateReader: () => ({ status: "clean", dirty: false, lines: [] }),
    });

    assert.equal(report.summary.total, 2);
    assert.equal(report.summary.mapped, 1);
    assert.equal(report.summary.unmanaged, 1);
    assert.equal(report.panes[0].classification, "current-runner-owned");
    assert.equal(report.panes[0].taskId, "20260625-tmux-orientation-slice-b");
    assert.equal(report.panes[0].readinessState, "verified");
    assert.equal(report.panes[0].dirtyState.status, "clean");
    assert.equal(report.panes[1].classification, "unmanaged-path");

    const human = renderHumanReport(report);
    assert.match(human, /knx-tmux-orientation:1\.1 current-runner-owned/);
    assert.match(human, /pane: id=%1 active=yes window=root/);
    assert.match(human, /workspace: 20260625-tmux-orientation-slice-b branch=codex\/tmux-orientation-slice-b base=dev mode=pr owner=runner-a status=active dirty=clean readiness=verified/);
    assert.match(human, /worktree: .*20260625-tmux-orientation-slice-b exists=yes/);
    assert.match(human, /knx-dev:1\.2 unmanaged-path/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("flags takeover stop line when pane worktree owner differs from current runner", () => {
  const root = mkdtempSync(join(tmpdir(), "tmux-orientation-owner-"));
  try {
    const worktree = join(root, "worktrees", "owned-by-other");
    mkdirSync(join(worktree, "subdir"), { recursive: true });
    const report = buildOrientationReport({
      panes: [paneFixture({ currentPath: join(worktree, "subdir") })],
      currentOwner: "runner-new",
      workspaceRecords: [
        {
          path: join(root, "state", "tasks", "owned-by-other.json"),
          manifest: {
            task_id: "owned-by-other",
            branch: "codex/owned-by-other",
            owner: "runner-old",
            status: "active",
            worktree_path: worktree,
          },
        },
      ],
      dirtyStateReader: () => ({ status: "dirty", dirty: true, lines: [" M file.txt"] }),
    });

    assert.equal(report.summary.takeoverRequired, 1);
    assert.equal(report.summary.dirty, 1);
    assert.equal(report.panes[0].classification, "takeover-required");
    assert.match(report.panes[0].stopLine, /Do not mutate; owner runner-old differs from current runner runner-new/);
    assert.equal(report.panes[0].readinessState, "unverified");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("marks stale manifest worktree paths as missing-worktree stop lines", () => {
  const worktree = join(tmpdir(), "missing-worktree-lane");
  const report = buildOrientationReport({
    panes: [paneFixture({ currentPath: worktree })],
    currentOwner: "runner-a",
    workspaceRecords: [
      {
        path: "/tmp/state/tasks/missing-worktree-lane.json",
        manifest: {
          task_id: "missing-worktree-lane",
          branch: "codex/missing-worktree-lane",
          owner: "runner-a",
          status: "active",
          worktree_path: worktree,
        },
      },
    ],
    dirtyStateReader: () => ({ status: "missing", dirty: false, lines: [] }),
  });

  assert.equal(report.summary.missingWorktrees, 1);
  assert.equal(report.panes[0].classification, "missing-worktree");
  assert.match(report.panes[0].stopLine, /manifest worktree path is missing/);
});

test("keeps takeover-required visible when another owner has a missing worktree", () => {
  const worktree = join(tmpdir(), "missing-owned-by-other");
  const report = buildOrientationReport({
    panes: [paneFixture({ currentPath: worktree })],
    currentOwner: "runner-new",
    workspaceRecords: [
      {
        path: "/tmp/state/tasks/missing-owned-by-other.json",
        manifest: {
          task_id: "missing-owned-by-other",
          branch: "codex/missing-owned-by-other",
          owner: "runner-old",
          status: "active",
          worktree_path: worktree,
        },
      },
    ],
    dirtyStateReader: () => ({ status: "missing", dirty: false, lines: [] }),
  });

  assert.equal(report.summary.takeoverRequired, 1);
  assert.equal(report.summary.missingWorktrees, 1);
  assert.equal(report.panes[0].classification, "takeover-required");
  assert.match(report.panes[0].stopLine, /owner runner-old differs from current runner runner-new/);
  assert.match(report.panes[0].stopLine, /worktree path is also missing/);
});

test("maps tmux deleted-cwd suffix back to the stale workspace manifest", () => {
  const worktree = join(tmpdir(), "deleted-worktree-owned-by-other");
  const report = buildOrientationReport({
    panes: [paneFixture({ currentPath: `${worktree} (deleted)` })],
    currentOwner: "runner-new",
    workspaceRecords: [
      {
        path: "/tmp/state/tasks/deleted-worktree-owned-by-other.json",
        manifest: {
          task_id: "deleted-worktree-owned-by-other",
          branch: "codex/deleted-worktree-owned-by-other",
          owner: "runner-old",
          status: "active",
          worktree_path: worktree,
        },
      },
    ],
    dirtyStateReader: () => ({ status: "missing", dirty: false, lines: [] }),
  });

  assert.equal(report.summary.mapped, 1);
  assert.equal(report.summary.takeoverRequired, 1);
  assert.equal(report.summary.missingWorktrees, 1);
  assert.equal(report.panes[0].taskId, "deleted-worktree-owned-by-other");
  assert.equal(report.panes[0].classification, "takeover-required");
});

test("returns non-zero for missing tmux unless caller explicitly allows it", () => {
  const tmuxResult = {
    ok: false,
    panes: [],
    error: "error connecting to /tmp/tmux-1000/default",
  };
  const workspaceResult = {
    stateRoot: "/tmp/state",
    manifests: [],
  };

  const strict = runReport({}, { tmuxResult, workspaceResult, env: { USER: "codex" } });
  assert.equal(strict.exitCode, 1);
  assert.equal(strict.report.tmux.available, false);
  assert.equal(strict.report.summary.total, 0);
  assert.match(renderHumanReport(strict.report), /Tmux unavailable: error connecting/);

  const allowed = runReport({ allowMissingTmux: true }, { tmuxResult, workspaceResult, env: { USER: "codex" } });
  assert.equal(allowed.exitCode, 0);
});

test("parses tmux metadata without pane content capture", () => {
  const args = tmuxListPanesArgs();
  assert.deepEqual(args.slice(0, 3), ["list-panes", "-a", "-F"]);
  assert.doesNotMatch(args.join(" "), /capture-pane|send-keys|source-file|kill-pane|respawn-pane/);

  const line = [
    "knx-token-economy",
    "1",
    "root",
    "1",
    "%42",
    "1",
    "1234",
    "/workspace/kendall/worktree",
    "title",
    "node",
  ].join(separator);
  const panes = parseTmuxPaneOutput(`${line}\n`);
  assert.deepEqual(panes, [
    {
      sessionName: "knx-token-economy",
      windowIndex: "1",
      windowName: "root",
      paneIndex: "1",
      paneId: "%42",
      paneActive: true,
      panePid: "1234",
      currentPath: "/workspace/kendall/worktree",
      paneTitle: "title",
      currentCommand: "node",
      metadataState: "complete",
    },
  ]);
});

test("marks malformed tmux metadata rows without shifting trailing command fields", () => {
  const short = parseTmuxPaneOutput(["knx-short", "1"].join(separator));
  assert.equal(short[0].metadataState, "malformed");
  assert.equal(short[0].sessionName, "knx-short");
  assert.equal(short[0].currentPath, "");

  const extra = parseTmuxPaneOutput([
    "knx-extra",
    "1",
    "root",
    "1",
    "%42",
    "1",
    "1234",
    "/tmp/worktree",
    "title",
    "node",
    "--flag",
  ].join(separator));
  assert.equal(extra[0].metadataState, "complete");
  assert.equal(extra[0].currentCommand, `node${separator}--flag`);
});

test("readTmuxPanes uses only list-panes metadata command", () => {
  const result = readTmuxPanes({
    runner(command, args) {
      assert.equal(command, "tmux");
      assert.deepEqual(args.slice(0, 3), ["list-panes", "-a", "-F"]);
      return {
        status: 0,
        stdout: [
          "knx-ui-feature",
          "1",
          "root",
          "1",
          "%10",
          "1",
          "999",
          "/tmp/worktree",
          "title",
          "bash",
        ].join(separator),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.panes.length, 1);
  assert.equal(result.panes[0].currentCommand, "bash");
});

test("source does not expose tmux mutation or pane capture commands", () => {
  const source = readFileSync(new URL("../scripts/tmux-orientation-report.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /capture-pane/);
  assert.doesNotMatch(source, /send-keys/);
  assert.doesNotMatch(source, /source-file/);
  assert.doesNotMatch(source, /kill-pane/);
  assert.doesNotMatch(source, /respawn-pane/);
  assert.match(source, /GIT_OPTIONAL_LOCKS: "0"/);
});

test("readWorkspaceManifests reports malformed manifests instead of hiding them", async () => {
  const { readWorkspaceManifests } = await import("../scripts/tmux-orientation-report.mjs");
  const root = mkdtempSync(join(tmpdir(), "tmux-orientation-state-"));
  try {
    const tasksDir = join(root, "tasks");
    const worktreesDir = join(root, "worktrees");
    mkdirSync(tasksDir, { recursive: true });
    mkdirSync(worktreesDir, { recursive: true });
    writeFileSync(join(tasksDir, "bad-json.json"), "{");
    writeFileSync(join(tasksDir, "bad-path.json"), JSON.stringify({ task_id: "bad-path", worktree_path: 123 }));

    const result = readWorkspaceManifests({ stateRoot: root }, { repoRoot: process.cwd(), cwd: process.cwd(), env: process.env });
    assert.equal(result.manifests.length, 0);
    assert.equal(result.manifestErrors.length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function paneFixture(overrides = {}) {
  return {
    sessionName: overrides.sessionName || "knx-lane",
    windowIndex: overrides.windowIndex || "1",
    windowName: overrides.windowName || "root",
    paneIndex: overrides.paneIndex || "1",
    paneId: overrides.paneId || "%1",
    paneActive: overrides.paneActive ?? true,
    panePid: overrides.panePid || "1000",
    currentPath: overrides.currentPath || "/tmp/worktree",
    paneTitle: overrides.paneTitle || "title",
    currentCommand: overrides.currentCommand || "node",
  };
}
