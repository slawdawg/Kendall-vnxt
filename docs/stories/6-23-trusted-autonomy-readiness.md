# Story 6.23: Trusted Autonomy Readiness

Date: 2026-06-11
Status: done

## User Story

As Bob,
I want the Dev Console to show trusted low-risk autonomy readiness,
so that repeatable workflows can earn autonomy only after evidence proves they are safe.

## Context

Trusted low-risk autonomy is a stretch Epic 6 capability. The system should not silently start executing end-to-end work until the eligible work class, authority boundaries, stop conditions, and retained evidence are proven.

This story adds a read-only readiness report. It does not approve autonomous execution, provider calls, GitHub delivery, cleanup, Codex or Claude launch, or source mutation.

## Acceptance Criteria

1. Supervisor exposes `GET /supervisor/trusted-autonomy-readiness-report`.
2. The report defines autonomy gates for repeatable low-risk work, bounded tools, automatic stop behavior, and operator visibility.
3. The report names eligible work, blocked work, required evidence, stop conditions, and next safe actions.
4. The report appears in the supervisor report catalog, runtime evidence related reports, report shortcuts, and Controls page.
5. Browser coverage proves the Controls page shows autonomy readiness, blocked work, and future trial guidance.
6. Supervisor tests prove the report is read-only and does not mutate workflow events.

## Implementation Notes

- Added `TrustedAutonomyReadinessReportView` and `TrustedAutonomyReadinessGateView`.
- Added `SupervisorService.get_trusted_autonomy_readiness_report()`.
- Added `GET /supervisor/trusted-autonomy-readiness-report`.
- Added `TrustedAutonomyReadinessReportPanel` to Controls.
- Added report catalog and runtime evidence references.
- No autonomous execution, provider call, GitHub operation, cleanup, source mutation, or worker launch is performed by this report.

## Verification

Passed checks:

- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "trusted_autonomy_readiness_report or supervisor_report_catalog or runtime_evidence_export"`
- `pnpm.cmd --filter @kendall/dashboard build`
- `PLAYWRIGHT_BROWSERS_PATH=C:\Users\slaw_dawg\Kendall_Nxt\.data\ms-playwright pnpm.cmd exec playwright test tests/e2e/dashboard.spec.ts -g "compact routing fleet data"`
- `pnpm.cmd run check:reports`
- `pnpm.cmd run check:runtime-export`
- `pnpm.cmd run check`
- `pnpm.cmd run check:docs`

## Authority Boundary

This story is read-only trusted autonomy readiness only. It does not approve low-risk autonomy, provider/model calls, Codex or Claude launch, GitHub delivery, merge, local or remote cleanup, issue sync, credential/session access, source mutation, raw prompt/completion retention, or autonomous end-to-end delivery.
