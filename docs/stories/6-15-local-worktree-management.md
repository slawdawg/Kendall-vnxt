# Story 6.15: Local Worktree Management

Date: 2026-06-10
Status: implemented locally

## User Story

As Bob,
I want the Dev Console to show the isolated local worktree plan for managed work,
so that the system can progress toward automatic worktree creation and cleanup without silently mutating the filesystem.

## Context

Story 6.14 added read-only Git hygiene. This story extends managed work-item detail pages with a local worktree plan. The plan computes the execution branch, base branch, base revision, planned worktree path, intended create/remove commands, safety checks, and current blockers.

This is a progressive step. It does not run `git worktree add`, `git worktree remove`, branch deletion, cleanup, push, PR creation, CI wait, merge, or any remote operation.

## Acceptance Criteria

1. Supervisor exposes `GET /work-items/{work_item_id}/local-worktree-plan` for managed recipe work.
2. The endpoint returns the intended execution branch, base branch, base revision, planned local folder, create command, cleanup command, safety checks, evidence, and blockers.
3. The endpoint is read-only and does not mutate workflow events or run Git commands that create/remove worktrees.
4. `createAllowed`, `cleanupAllowed`, and `remoteOperationsAllowed` remain false.
5. Work-item detail pages show the isolated workspace plan next to recipe branch preparation.
6. Browser coverage proves the Dev Console shows create/cleanup authority as off.

## Implementation Notes

- Added `LocalWorktreePlanView` to shared contracts and Pydantic schemas.
- Added `SupervisorService.get_local_worktree_plan()`.
- Added `GET /work-items/{work_item_id}/local-worktree-plan`.
- Added `LocalWorktreePlanPanel` to managed work-item detail pages.
- The planned folder uses a deterministic sibling worktree root based on the repository root and execution branch.
- Actual local filesystem mutation remains blocked by `local_worktree_creation_not_enabled` and `local_worktree_cleanup_not_enabled`.

## Verification

Passed checks:

- `pnpm.cmd run test:supervisor -- tests/integration/test_supervisor_flow.py -q -k "local_worktree_plan"`
- `pnpm.cmd --filter @kendall/dashboard build`
- `PLAYWRIGHT_BROWSERS_PATH=C:\Users\slaw_dawg\Kendall_Nxt\.data\ms-playwright pnpm.cmd exec playwright test tests/e2e/dashboard.spec.ts -g "shows delivery readiness controls for managed recipe work"`
- `pnpm.cmd run check`

## Authority Boundary

This story is plan-only. It does not approve local worktree creation, local worktree removal, stale worktree cleanup, branch deletion, source mutation, GitHub remote writes, PR creation, CI wait, merge, provider/model calls, Codex/Claude launch, or autonomous delivery.
