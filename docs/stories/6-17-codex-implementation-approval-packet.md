# Story 6.17: Codex Implementation Approval Packet

Date: 2026-06-11
Status: implemented locally

## User Story

As Bob,
I want the Dev Console to show the exact approval packet required before a bounded Codex implementation run,
so that Codex execution can be approved deliberately without hidden process launch or source mutation.

## Context

Story 6.16 added no-launch Codex readiness. The next authority boundary is real Codex implementation in an isolated worktree. This story does not cross that boundary. It defines the approval request, target scope, allowed paths, blocked paths, command shape, evidence retention, rollback plan, and stop conditions that must be reviewed before a future Codex worker launch is implemented or executed.

This keeps the progressive methodology intact: prepare the authority packet first, then bind approval and execution in a successor step only when Bob explicitly approves that authority family and scope.

## Acceptance Criteria

1. Supervisor exposes `GET /supervisor/codex-implementation-approval-report`.
2. The report names the authority family, operation, target scope, allowed paths, blocked paths, expected command shape, required evidence, rollback plan, and stop conditions.
3. The report states that Codex process launch, worker task execution, source mutation, and approval binding are not approved or implemented.
4. The report appears in the supervisor report catalog, runtime evidence related reports, report shortcuts, and Controls page.
5. Browser coverage proves the Controls page shows the approval packet, path scope, approval binding, command shape, and stop conditions.
6. Supervisor tests prove the report is read-only and does not mutate workflow events.

## Implementation Notes

- Added `CodexImplementationApprovalReportView` and `CodexImplementationApprovalRequirementView`.
- Added `SupervisorService.get_codex_implementation_approval_report()`.
- Added `GET /supervisor/codex-implementation-approval-report`.
- Added `CodexImplementationApprovalReportPanel` to Controls.
- Added report catalog and runtime evidence references.
- No Codex command, auth command, Git command, shell command, worktree creation, source mutation, or GitHub operation is performed by this report.

## Verification

Passed checks:

- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "codex_implementation_approval_report or supervisor_report_catalog or runtime_evidence_export"`
- `pnpm.cmd --filter @kendall/dashboard build`
- `PLAYWRIGHT_BROWSERS_PATH=C:\Users\slaw_dawg\Kendall_Nxt\.data\ms-playwright pnpm.cmd exec playwright test tests/e2e/dashboard.spec.ts -g "compact routing fleet data"`
- `pnpm.cmd run check:reports`
- `pnpm.cmd run check:runtime-export`
- `pnpm.cmd run check`
- `pnpm.cmd run check:docs`

## Authority Boundary

This story is approval-packet readiness only. It does not approve Codex CLI process launch, Codex worker task execution, prompt/context sends, auth checks, source mutation, command execution, worktree creation/removal, Git operations, GitHub delivery, merge, cleanup, Claude review, provider/model calls, raw prompt/completion retention, or autonomous delivery.
