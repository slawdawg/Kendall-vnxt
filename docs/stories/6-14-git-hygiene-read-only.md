# Story 6.14: Git Hygiene Read-Only

Date: 2026-06-10
Status: done

## User Story

As Bob,
I want the Dev Console to show repository, worktree, branch, PR, and CI hygiene status without performing remote or cleanup actions,
so that delivery readiness is visible before Git/GitHub automation earns broader authority.

## Context

Story 6.13 exposed safe local evidence checks. The next MVP step is Git hygiene visibility. This story adds a read-only supervisor report and controls-page panel that inspect local Git state and make remote PR/CI query posture explicit.

This story does not push, pull, create PRs, wait for CI, merge, delete branches, remove worktrees, or clean local files. Remote GitHub writes and cleanup remain blocked pending later progressive-authority stories.

## Acceptance Criteria

1. Supervisor exposes `GET /supervisor/git-hygiene-report`.
2. The report includes local repository root, current branch, head revision, upstream posture, working-tree status counts, and local worktree inventory.
3. The report shows PR and CI as read-only remote signals that are not queried by this local report.
4. The report is included in the supervisor report catalog, runtime evidence related reports, and report shortcut anchors.
5. The Controls page shows a Git hygiene panel with local status, worktree inventory, PR/CI posture, stop lines, and next safe actions.
6. Tests prove the report is read-only and does not mutate workflow events.

## Implementation Notes

- Added shared `GitHygieneReportView`, `GitHygieneSignalView`, and `GitHygieneWorktreeView` contracts.
- Added Pydantic schemas and `SupervisorService.get_git_hygiene_report()`.
- The service runs only short-timeout local Git read commands:
  - `git branch --show-current`
  - `git rev-parse --short HEAD`
  - `git rev-parse --abbrev-ref --symbolic-full-name @{u}`
  - `git status --porcelain=v1`
  - `git worktree list --porcelain`
- Added `GitHygieneReportPanel` to the Controls page.
- Added report catalog and runtime evidence references.

## Verification

Passed checks:

- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "git_hygiene_report or supervisor_report_catalog or runtime_evidence_export"`
- `pnpm.cmd --filter @kendall/dashboard build`
- `PLAYWRIGHT_BROWSERS_PATH=C:\Users\slaw_dawg\Kendall_Nxt\.data\ms-playwright pnpm.cmd exec playwright test tests/e2e/dashboard.spec.ts -g "compact routing fleet data"`
- `pnpm.cmd run check:reports`
- `pnpm.cmd run check:runtime-export`
- `pnpm.cmd run check`

## Authority Boundary

This story is read-only. It does not approve remote GitHub writes, GitHub CLI token changes, push, PR creation, CI wait, merge, branch deletion, worktree removal, local cleanup, source mutation, provider/model calls, Codex/Claude launch, or autonomous delivery.
