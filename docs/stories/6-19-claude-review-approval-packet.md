# Story 6.19: Claude Review Approval Packet

Date: 2026-06-11
Status: done

## User Story

As Bob,
I want the Dev Console to show the exact approval packet required before a bounded Claude review,
so that scarce adversarial review can be approved deliberately without file edits, hidden context expansion, or subscription waste.

## Context

Story 6.18 added no-launch Claude review readiness. The next authority boundary is a real Claude review-only attempt. This story does not cross that boundary. It defines the trigger policy, context scope, blocked inputs, expected command shape, output contract, required evidence, scarcity controls, and stop conditions required before a future Claude review worker launch is implemented or executed.

Claude remains a scarce review lane, not an implementation lane. File edits, command execution, Git/GitHub operations, merge, cleanup, and retry/expanded context still require separate authority.

## Acceptance Criteria

1. Supervisor exposes `GET /supervisor/claude-review-approval-report`.
2. The report names the authority family, operation, review triggers, context scope, blocked inputs, expected command shape, output contract, required evidence, scarcity controls, and stop conditions.
3. The report states that Claude process launch, review task execution, source mutation, scarce-use consumption, and approval binding are not approved or implemented.
4. The report appears in the supervisor report catalog, runtime evidence related reports, report shortcuts, and Controls page.
5. Browser coverage proves the Controls page shows the review-only approval packet, trigger policy, blocked inputs, output contract, and scarcity controls.
6. Supervisor tests prove the report is read-only and does not mutate workflow events.

## Implementation Notes

- Added `ClaudeReviewApprovalReportView` and `ClaudeReviewApprovalRequirementView`.
- Added `SupervisorService.get_claude_review_approval_report()`.
- Added `GET /supervisor/claude-review-approval-report`.
- Added `ClaudeReviewApprovalReportPanel` to Controls.
- Added report catalog and runtime evidence references.
- No Claude command, auth command, Git command, shell command, source mutation, subscription usage, or GitHub operation is performed by this report.

## Verification

Passed checks:

- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "claude_review_approval_report or supervisor_report_catalog or runtime_evidence_export"`
- `pnpm.cmd --filter @kendall/dashboard build`
- `PLAYWRIGHT_BROWSERS_PATH=C:\Users\slaw_dawg\Kendall_Nxt\.data\ms-playwright pnpm.cmd exec playwright test tests/e2e/dashboard.spec.ts -g "compact routing fleet data"`
- `pnpm.cmd run check:reports`
- `pnpm.cmd run check:runtime-export`
- `pnpm.cmd run check`
- `pnpm.cmd run check:docs`

## Authority Boundary

This story is approval-packet readiness only. It does not approve Claude CLI process launch, Claude review task execution, prompt/context/diff sends, auth checks, source mutation, command execution, Git operations, GitHub delivery, merge, cleanup, Codex implementation, provider/model calls, scarce subscription consumption, raw prompt/completion retention, or autonomous delivery.
