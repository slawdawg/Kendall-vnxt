---
baseline_commit: 4661a21d71c48452a8b4143d9c78761a1c56cd37
---

# Story 18.1: Refresh Cleanup Automation Approval Packet

Status: done

## Story

As Bob,
I want the cleanup automation approval packet refreshed from current cleanup planning evidence,
so that any future deletion or branch/ref cleanup requires exact target, evidence, approved-root, dry-run, rollback, and stop-line approval.

## Acceptance Criteria

1. Given cleanup automation remains gated, when the packet is refreshed, then it binds any future cleanup operation to target id, target type, target path/ref, approved cleanup root, retained evidence, delivery/merge evidence, Git worktree state, filesystem state, source file state, residue classification, blocked-path check, dry-run effects, operation shape, operator, approval timestamp, rollback/recovery path, stop lines, and expiry or review point.
2. Given cleanup is destructive, when the packet is written, then it blocks source checkout deletion, protected branch deletion, retained evidence deletion, ambiguous paths, paths outside approved roots, stale evidence, string-built shell deletion, remote cleanup by implication, and failed-check bypass.
3. Given this story is non-executing, when it completes, then it does not delete paths, remove worktrees, delete branches, delete remote refs, remove evidence, or run cleanup commands.
4. Given the story is documentation/packet-only, when verification runs, then `pnpm.cmd run check:docs` passes.

## Tasks / Subtasks

- [x] Create the cleanup automation approval packet. (AC: 1, 2, 3)
  - [x] Bind required target, evidence, classification, dry-run, operation, rollback, and stop-line fields.
  - [x] Preserve cleanup planning as read-only evidence.
  - [x] Prohibit deletion from this story.
- [x] Update story navigation for Epic 18. (AC: 1)
  - [x] Add Epic 18 and Story 18.1 to the story index.
- [x] Verify documentation. (AC: 4)
  - [x] Run `pnpm.cmd run check:docs`.

## Dev Notes

This story intentionally stops before any cleanup execution. It creates the approval packet that a future target-specific cleanup story must satisfy.

Relevant existing context:

- `docs/stories/10-3-plan-safe-cleanup-with-evidence-preservation-and-worktree-residue-classification.md`
- `docs/stories/10-4-show-delivery-and-cleanup-plans-in-dev-console.md`
- `docs/stories/12-2-record-post-merge-delivery-and-cleanup-evidence.md`
- `docs/goals/github-delivery-post-merge-cleanup-evidence-pr-103-2026-06-13.md`

### Guardrails

- Do not delete files or directories.
- Do not remove worktrees.
- Do not delete branches or remote refs.
- Do not delete retained evidence.
- Do not run cleanup commands.
- Do not use string-built shell deletion commands.

### References

- [Source: `docs/goals/cleanup-automation-approval-packet-2026-06-14.md`]
- [Source: `docs/stories/10-3-plan-safe-cleanup-with-evidence-preservation-and-worktree-residue-classification.md`]
- [Source: `docs/stories/12-2-record-post-merge-delivery-and-cleanup-evidence.md`]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `Get-Content -Raw docs/stories/10-3-plan-safe-cleanup-with-evidence-preservation-and-worktree-residue-classification.md`
- `pnpm.cmd run check:docs`

### Completion Notes List

- Created `docs/goals/cleanup-automation-approval-packet-2026-06-14.md`.
- Preserved cleanup planning as read-only evidence and required target-specific approval before any deletion.
- Defined exact cleanup approval binding, preconditions, rollback/recovery, and destructive stop lines.

### File List

- `docs/goals/cleanup-automation-approval-packet-2026-06-14.md`
- `docs/stories/18-1-refresh-cleanup-automation-approval-packet.md`
- `docs/stories/index.md`

### Change Log

- 2026-06-14: Refreshed cleanup automation approval packet without deleting anything.
