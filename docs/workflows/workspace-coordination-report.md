# Workspace Coordination Report

Date: 2026-06-14
Status: active guidance

## Purpose

Give Codex sessions a small, repeatable way to coordinate active managed
worktrees without mixing branches, overwriting another lane, or silently
deleting local work. Use this report shape when several feature, refactor,
review, or authority lanes are active at once.

## When To Use

Use this workflow before starting or resuming work when:

- More than one managed Codex workspace is active.
- A PR is waiting at a merge gate.
- A worktree is clean but has local commits not yet merged.
- A session needs to choose the next safe PR-sized slice.
- Cleanup is requested, but local branches or unmerged commits may still exist.

## First Reads

Start with these small sources:

```text
AGENTS.md#codex-workspace-protocol
docs/ai-context/index.md
node ./scripts/codex-workspace.mjs list
git status --short --branch
```

Expand only when a lane's purpose or safety boundary is unclear.

## Report Packet

```text
Workspace Coordination Report
- Current checkout:
- Root status:
- Active managed worktrees:
- PRs waiting at merge gate:
- Clean active lanes:
- Dirty active lanes:
- Local-only commits:
- Closed but retained lanes:
- Cleanup candidates:
- Blocked approval packets:
- Next safe slice:
- Stop lines:
```

## Classification Rules

- `clean active lane`: no uncommitted files, still useful or awaiting PR work.
- `dirty active lane`: uncommitted files exist; do not start overlapping work.
- `merge-gated lane`: PR is open, CI is green, conversations are resolved, but
  explicit merge approval is missing.
- `local-only commit`: branch is ahead of its upstream or base and must be
  preserved until pushed, merged, or explicitly discarded.
- `cleanup candidate`: PR is merged, worktree is clean, and cleanup dry-run
  names only the expected worktree and local branch.

## Stop Lines

Do not perform these actions from a generic continuation:

- Merge a PR.
- Delete a worktree.
- Delete a local or remote branch.
- Discard local commits.
- Rewrite a shared branch.
- Resolve a review thread that has not been addressed.
- Start work in a lane whose scope overlaps an active dirty lane.

Use a narrow approval packet for merge, cleanup, branch deletion, or discarding
local commits.

## Next Safe Slice Rules

Prefer a new managed worktree when continuing development:

```text
node ./scripts/codex-workspace.mjs start "<task description>"
```

Choose slices that avoid files touched by:

- Open PRs waiting at a merge gate.
- Dirty active lanes.
- Authority lanes owned by other sessions.
- Runtime/provider/dashboard work unless the current session owns that lane.

## Non-Goals

This workflow does not merge PRs, clean worktrees, delete branches, discard
commits, launch workers, call providers, spend money, access credentials, or
approve execution authority.
