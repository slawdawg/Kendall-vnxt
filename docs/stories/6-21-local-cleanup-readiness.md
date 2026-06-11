# Story 6.21: Local Cleanup Readiness

Date: 2026-06-11
Status: implemented locally

## User Story

As Bob,
I want the Dev Console to show local cleanup readiness before anything is deleted,
so that completed, stale, and abandoned work can eventually be cleaned up without losing evidence or removing the wrong target.

## Context

Epic 6 should eventually clean up worktrees, branches, and temporary outputs automatically. Cleanup is destructive, so the first safe step is a read-only policy report that defines cleanup target classes, required evidence, blocked targets, stop conditions, and next safe actions.

This story does not remove worktrees, delete branches, delete files, delete evidence, prune Git state, or mutate local or remote state.

## Acceptance Criteria

1. Supervisor exposes `GET /supervisor/local-cleanup-readiness-report`.
2. The report defines cleanup policy for completed worktrees, stale worktrees, abandoned attempts, and evidence retention.
3. The report names required evidence, blocked targets, stop conditions, and next safe actions.
4. The report appears in the supervisor report catalog, runtime evidence related reports, report shortcuts, and Controls page.
5. Browser coverage proves the Controls page shows cleanup readiness, policy items, blocked targets, and one-target-at-a-time guidance.
6. Supervisor tests prove the report is read-only and does not mutate workflow events.

## Implementation Notes

- Added `LocalCleanupReadinessReportView` and `LocalCleanupPolicyItemView`.
- Added `SupervisorService.get_local_cleanup_readiness_report()`.
- Added `GET /supervisor/local-cleanup-readiness-report`.
- Added `LocalCleanupReadinessReportPanel` to Controls.
- Added report catalog and runtime evidence references.
- No worktree removal, branch deletion, file deletion, Git command, shell command, remote operation, or evidence deletion is performed by this report.
- Implementation follow-up added `scripts/codex-workspace.mjs cleanup-orphans` and generated-artifact pre-cleaning for workspace cleanup. Use `docs/codex-workspace-cleanup-runbook.md` for the operator flow and Windows admin fallback.

## Verification

Passed checks:

- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "local_cleanup_readiness_report or supervisor_report_catalog or runtime_evidence_export"`
- `pnpm.cmd --filter @kendall/dashboard build`
- `PLAYWRIGHT_BROWSERS_PATH=C:\Users\slaw_dawg\Kendall_Nxt\.data\ms-playwright pnpm.cmd exec playwright test tests/e2e/dashboard.spec.ts -g "compact routing fleet data"`
- `pnpm.cmd run check:reports`
- `pnpm.cmd run check:runtime-export`
- `pnpm.cmd run check`
- `pnpm.cmd run check:docs`

## Authority Boundary

This story is read-only cleanup readiness only. It does not approve worktree removal, branch deletion, evidence deletion, artifact deletion, Git prune, remote cleanup, GitHub issue sync, merge, credential/session access, source mutation, provider/model calls, Codex or Claude launch, or autonomous cleanup.
