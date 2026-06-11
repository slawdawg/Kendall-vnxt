# Story 6.20: GitHub Delivery Authority Ladder

Date: 2026-06-11
Status: implemented locally

## User Story

As Bob,
I want the Dev Console to show a progressive GitHub delivery authority ladder,
so that push, PR, CI, review resolution, merge, and cleanup steps can be approved separately with clear evidence.

## Context

Epic 6 needs Git and GitHub workflows to become part of the autonomous pipeline, but remote writes and merge are high-blast-radius operations. This story adds a read-only authority ladder that documents each remote delivery step, required approval, evidence, rollback plan, and stop conditions without performing any remote operation.

This story does not push, create or update PRs, wait for CI, resolve review comments, merge, delete branches, change auth, store tokens, or call GitHub.

## Acceptance Criteria

1. Supervisor exposes `GET /supervisor/github-delivery-authority-report`.
2. The report defines delivery steps for push, PR create/update, CI wait, review resolution, merge, and remote cleanup.
3. Every delivery step remains blocked and names the specific approval needed before execution.
4. The report appears in the supervisor report catalog, runtime evidence related reports, report shortcuts, and Controls page.
5. Browser coverage proves the Controls page shows the delivery ladder, approval requirements, and one-step-at-a-time guidance.
6. Supervisor tests prove the report is read-only and does not mutate workflow events.

## Implementation Notes

- Added `GitHubDeliveryAuthorityReportView` and `GitHubDeliveryAuthorityStepView`.
- Added `SupervisorService.get_github_delivery_authority_report()`.
- Added `GET /supervisor/github-delivery-authority-report`.
- Added `GitHubDeliveryAuthorityReportPanel` to Controls.
- Added report catalog and runtime evidence references.
- No GitHub CLI command, Git command, network request, remote write, merge, cleanup, credential mutation, or token storage is performed by this report.

## Verification

Passed checks:

- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "github_delivery_authority_report or supervisor_report_catalog or runtime_evidence_export"`
- `pnpm.cmd --filter @kendall/dashboard build`
- `PLAYWRIGHT_BROWSERS_PATH=C:\Users\slaw_dawg\Kendall_Nxt\.data\ms-playwright pnpm.cmd exec playwright test tests/e2e/dashboard.spec.ts -g "compact routing fleet data"`
- `pnpm.cmd run check:reports`
- `pnpm.cmd run check:runtime-export`
- `pnpm.cmd run check`
- `pnpm.cmd run check:docs`

## Authority Boundary

This story is read-only delivery authority readiness only. It does not approve push, pull, PR creation/update, CI waits, review comment mutation, merge, branch deletion, remote cleanup, GitHub issue sync, auth changes, credential/session access, plaintext token storage, local cleanup, provider/model calls, Codex or Claude launch, source mutation, or autonomous delivery.
