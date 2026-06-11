# Story 6.22: Remote Cleanup Sync Readiness

Date: 2026-06-11
Status: done

## User Story

As Bob,
I want the Dev Console to show readiness for remote cleanup and issue/story sync,
so that remote branch deletion and GitHub status updates can be approved with evidence before any remote mutation happens.

## Context

Remote cleanup and issue/story sync are stretch Epic 6 capabilities. They should not happen automatically until the system can prove exact targets, retained local evidence, safe before/after metadata, and rollback or correction plans.

This story does not delete remote branches, close issues or PRs, update labels or project fields, sync story status, call GitHub, change auth, or store credentials.

## Acceptance Criteria

1. Supervisor exposes `GET /supervisor/remote-cleanup-sync-readiness-report`.
2. The report defines policy for remote branch cleanup, issue sync, story status sync, and audit retention.
3. The report names required evidence, blocked operations, stop conditions, and next safe actions.
4. The report appears in the supervisor report catalog, runtime evidence related reports, report shortcuts, and Controls page.
5. Browser coverage proves the Controls page shows remote cleanup readiness, issue/story sync policy, blocked operations, and one-target-at-a-time guidance.
6. Supervisor tests prove the report is read-only and does not mutate workflow events.

## Implementation Notes

- Added `RemoteCleanupSyncReadinessReportView` and `RemoteCleanupSyncPolicyItemView`.
- Added `SupervisorService.get_remote_cleanup_sync_readiness_report()`.
- Added `GET /supervisor/remote-cleanup-sync-readiness-report`.
- Added `RemoteCleanupSyncReadinessReportPanel` to Controls.
- Added report catalog and runtime evidence references.
- No GitHub command, network call, remote branch deletion, issue mutation, story sync, auth change, credential access, or token storage is performed by this report.

## Verification

Passed checks:

- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "remote_cleanup_sync_readiness_report or supervisor_report_catalog or runtime_evidence_export"`
- `pnpm.cmd --filter @kendall/dashboard build`
- `PLAYWRIGHT_BROWSERS_PATH=C:\Users\slaw_dawg\Kendall_Nxt\.data\ms-playwright pnpm.cmd exec playwright test tests/e2e/dashboard.spec.ts -g "compact routing fleet data"`
- `pnpm.cmd run check:reports`
- `pnpm.cmd run check:runtime-export`
- `pnpm.cmd run check`
- `pnpm.cmd run check:docs`

## Authority Boundary

This story is read-only remote cleanup and sync readiness only. It does not approve remote branch deletion, GitHub issue or PR mutation, label/milestone/project updates, story status sync, GitHub auth changes, credential/session access, plaintext token storage, local cleanup, merge, provider/model calls, Codex or Claude launch, source mutation, or autonomous delivery.
