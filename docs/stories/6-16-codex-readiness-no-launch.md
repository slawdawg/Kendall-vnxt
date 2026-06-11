# Story 6.16: Codex Readiness No-Launch

Date: 2026-06-10
Status: implemented locally

## User Story

As Bob,
I want the Dev Console to show whether Codex is ready for a future bounded worker lane without launching Codex,
so that we can prepare for Codex implementation authority while preserving explicit approval gates.

## Context

Stories 6.14 and 6.15 added Git hygiene and isolated worktree planning. The next progressive step is Codex readiness. This story adds a no-launch report that discovers whether a Codex CLI executable is on `PATH` and documents auth, launch, task execution, and source-mutation stop lines.

This story does not run Codex, check Codex auth, start a Codex session, send a task, provide repository context to Codex, mutate source, run Git operations, or perform GitHub delivery.

## Acceptance Criteria

1. Supervisor exposes `GET /supervisor/codex-readiness-report`.
2. The report performs only PATH discovery via `shutil.which("codex")` / `shutil.which("codex.cmd")`.
3. The report marks auth checks as `not_checked` and worker launch/source mutation as `blocked`.
4. The report appears in the supervisor report catalog, runtime evidence related reports, report shortcuts, and Controls page.
5. Browser coverage proves the Controls page shows Codex readiness and launch stop lines.
6. Supervisor tests prove the report is read-only and does not mutate workflow events.

## Implementation Notes

- Added `CodexReadinessReportView` and `CodexReadinessCheckView`.
- Added `SupervisorService.get_codex_readiness_report()`.
- Added `GET /supervisor/codex-readiness-report`.
- Added `CodexReadinessReportPanel` to Controls.
- No `subprocess.run()` or Codex command invocation is used by this report.

## Verification

Passed checks:

- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "codex_readiness_report or supervisor_report_catalog or runtime_evidence_export"`
- `pnpm.cmd --filter @kendall/dashboard build`
- `PLAYWRIGHT_BROWSERS_PATH=C:\Users\slaw_dawg\Kendall_Nxt\.data\ms-playwright pnpm.cmd exec playwright test tests/e2e/dashboard.spec.ts -g "compact routing fleet data"`
- `pnpm.cmd run check:reports`
- `pnpm.cmd run check:runtime-export`
- `pnpm.cmd run check`

## Authority Boundary

This story is no-launch readiness only. It does not approve Codex CLI process launch, Codex worker task execution, prompt/context sends, auth checks, source mutation, command execution, Git operations, GitHub delivery, merge, cleanup, Claude review, provider/model calls, or autonomous delivery.
