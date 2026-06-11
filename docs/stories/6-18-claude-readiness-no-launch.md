# Story 6.18: Claude Readiness No-Launch

Date: 2026-06-11
Status: implemented locally

## User Story

As Bob,
I want the Dev Console to show Claude review readiness and scarce-use boundaries without launching Claude,
so that adversarial review can be prepared without consuming subscription usage or crossing authority gates.

## Context

Claude is reserved for limited adversarial review, flaw-finding, security-sensitive checks, high-risk diffs, and review of Codex output. It is not a routine implementation lane. The next progressive step is a no-launch readiness report that shows CLI discovery, auth-check posture, review-only boundaries, source-mutation stop lines, and scarce-use policy.

This story does not run Claude, check Claude auth, start a session, send code or diffs, write files, perform Git operations, or consume Claude subscription usage.

## Acceptance Criteria

1. Supervisor exposes `GET /supervisor/claude-review-readiness-report`.
2. The report performs only PATH discovery via `shutil.which("claude")` / `shutil.which("claude.cmd")`.
3. The report marks auth checks as `not_checked`, review execution/source mutation as blocked, and budget tracking as not implemented.
4. The report appears in the supervisor report catalog, runtime evidence related reports, report shortcuts, and Controls page.
5. Browser coverage proves the Controls page shows Claude readiness, review-only posture, scarce-use policy, and launch stop lines.
6. Supervisor tests prove the report is read-only and does not mutate workflow events.

## Implementation Notes

- Added `ClaudeReviewReadinessReportView` and `ClaudeReadinessCheckView`.
- Added `SupervisorService.get_claude_review_readiness_report()`.
- Added `GET /supervisor/claude-review-readiness-report`.
- Added `ClaudeReviewReadinessReportPanel` to Controls.
- Added report catalog and runtime evidence references.
- No `subprocess.run()` or Claude command invocation is used by this report.

## Verification

Passed checks:

- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "claude_review_readiness_report or supervisor_report_catalog or runtime_evidence_export"`
- `pnpm.cmd --filter @kendall/dashboard build`
- `PLAYWRIGHT_BROWSERS_PATH=C:\Users\slaw_dawg\Kendall_Nxt\.data\ms-playwright pnpm.cmd exec playwright test tests/e2e/dashboard.spec.ts -g "compact routing fleet data"`
- `pnpm.cmd run check:reports`
- `pnpm.cmd run check:runtime-export`
- `pnpm.cmd run check`
- `pnpm.cmd run check:docs`

## Authority Boundary

This story is no-launch Claude review readiness only. It does not approve Claude CLI process launch, Claude review task execution, prompt/context/diff sends, auth checks, source mutation, command execution, Git operations, GitHub delivery, merge, cleanup, Codex implementation, provider/model calls, scarce subscription consumption, raw prompt/completion retention, or autonomous delivery.
