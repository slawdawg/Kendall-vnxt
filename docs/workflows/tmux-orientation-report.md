# Tmux Orientation Report

Date: 2026-06-26
Status: active guidance

## Purpose

Give the operator a repeatable, source-owned way to orient across active KNX
tmux sessions and managed Codex worktrees without reading pane contents or
mutating sessions. The report is metadata-only: it maps tmux pane paths to
workspace manifests, then surfaces branch, owner, dirty state, readiness state,
and takeover stop lines.

## Commands

```text
pnpm run tmux:orientation
pnpm run tmux:orientation -- --json
pnpm run tmux:orientation -- --allow-missing-tmux
pnpm run tmux:orientation -- --state-root /path/to/.codex-workspaces/<repo-key>
pnpm run test:tmux-orientation-report
pnpm run check:tmux-orientation-report
```

Use `--json` when another local tool needs structured evidence. Use
`--allow-missing-tmux` only for readiness checks where the absence of a tmux
server should not fail the whole command.

## Report Fields

For each tmux pane, the report includes:

- Session, window, pane, active flag, pid, pane title, and current command.
- Pane current path.
- Matching task id, branch, base branch, status, mode, owner, and worktree path
  when the path is inside a managed workspace.
- Dirty state from `git status --porcelain=v1` when the worktree exists.
- Readiness state from workspace manifest verification metadata.
- Classification: `current-runner-owned`, `takeover-required`,
  `unowned-workspace`, or `unmanaged-path`.

## Boundaries

Do not capture pane scrollback, prompts, or terminal contents. Do not mutate tmux sessions.
Do not send keys, reload tmux config, kill panes, respawn panes,
change workspace manifests, update Git refs, create commits, push branches,
open PRs, clean worktrees, or inspect credentials.

The command may call:

```text
tmux list-panes -a -F <metadata fields>
git status --porcelain=v1
```

Those calls are read-only and limited to metadata needed for orientation.

## Stop Lines

When a pane maps to a workspace owned by another runner, the report must show
`takeover-required`. Do not mutate that worktree. Confirm the other runner is
idle, record explicit operator approval, and use the Codex workspace takeover
flow before making changes.

When a pane maps to `unmanaged-path`, treat it as orientation evidence only. Do
not infer workspace authority from a shell path that has no managed manifest.

When tmux is unavailable, the default command fails closed. Use
`--allow-missing-tmux` only when the caller intentionally wants an empty
metadata report rather than a hard failure.

## Verification

The source-owned checks are:

```text
pnpm run test:tmux-orientation-report
pnpm run check:tmux-orientation-report
```

The unit tests use fixture tmux rows and workspace manifests. They must not
depend on a live tmux server, another runner's terminal contents, or managed
workspace mutation.
