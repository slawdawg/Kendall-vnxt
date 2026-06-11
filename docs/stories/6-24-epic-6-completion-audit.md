# Story 6.24: Epic 6 Completion Audit

Date: 2026-06-11
Status: implemented locally

## User Story

As Bob,
I want the Dev Console to show what is left before Epic 6 is actually complete,
so that authority blockers, delivery work, and cleanup closeout stay visible instead of living only in chat or docs.

## Context

Epic 6 has a broad local readiness stack, but it is not complete until approved remote delivery, real-story done evidence, and cleanup evidence exist. This story adds a read-only completion audit report for the Dev Console.

The report does not approve GitHub writes, Codex or Claude launch, merge, cleanup, source mutation, provider expansion, or autonomous execution.

## Acceptance Criteria

1. Supervisor exposes `GET /supervisor/epic-6-completion-audit-report`.
2. The report states that Epic 6 is not complete and names the remaining blockers.
3. The report shows prepared local evidence, remaining delivery/provider/cleanup items, blocked operations, required evidence, stop conditions, and next safe actions.
4. The report appears in the supervisor report catalog, runtime evidence export references, report shortcuts, and Controls page.
5. Browser coverage proves the Controls page shows the completion audit, remaining blockers, and recommended approval text.
6. Supervisor tests prove the report is read-only and does not mutate workflow events.

## Implementation Notes

- Added `EpicCompletionAuditReportView` and `EpicCompletionAuditItemView`.
- Added `SupervisorService.get_epic_6_completion_audit_report()`.
- Added `GET /supervisor/epic-6-completion-audit-report`.
- Added `EpicCompletionAuditReportPanel` to Controls.
- Added report catalog, runtime evidence, and report shortcut references.
- The recommended approval remains scoped to push, integrated PR creation, and read-only PR/CI checks only.
- Post-merge follow-up refreshed the audit to show PR #86 delivered, local cleanup completed, cleanup hardening still awaiting normal delivery gates, and provider/agent/autonomy expansion still blocked by default.

## Verification

Passed checks:

- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "epic_6_completion_audit or supervisor_report_catalog or runtime_evidence_export"`
- `pnpm.cmd --filter @kendall/dashboard build`
- `PLAYWRIGHT_BROWSERS_PATH=C:\Users\slaw_dawg\Kendall_Nxt\.data\ms-playwright pnpm.cmd exec playwright test tests/e2e/dashboard.spec.ts -g "compact routing fleet data"`
- `pnpm.cmd run check:reports`
- `pnpm.cmd run check:runtime-export`
- `pnpm.cmd run check`
- `pnpm.cmd run check:docs`

## Authority Boundary

This story is read-only completion audit visibility only. It does not approve push, PR creation/update, CI waits, review resolution, merge, PR closeout, local cleanup, remote cleanup, Codex launch, Claude launch, provider/model calls, issue sync, story status sync, credential/session access, source mutation, or autonomous end-to-end delivery.
