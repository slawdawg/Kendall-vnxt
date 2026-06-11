# Story 3.22: Dashboard E2E Report

Date: 2026-06-09
Status: done

## Goal

Expose a read-only supervisor report that maps dashboard browser verification runners, setup commands, server lifecycle expectations, repo-local cache posture, and authority stop lines.

## Scope

- Add `GET /supervisor/dashboard-e2e-report`.
- Add contract types for dashboard e2e runners and report payloads.
- Show the report on the controls page beside other read-only authority and verification reports.
- Add the report to the supervisor report catalog, maintenance readiness report, and runtime evidence export references.
- Cover the endpoint and dashboard panel with integration and Playwright assertions.

## Safety

The report is evidence-only. It does not approve:

- local provider or model calls,
- subscription-agent process launch,
- premium execution,
- worker shell commands,
- worker source mutation,
- network access,
- credential access.

## Acceptance

- The endpoint returns focused controls/detail runners and the full dashboard e2e command.
- The report is read-only and leaves work-item events unchanged.
- The controls page renders commands, lifecycle notes, cache posture, and stop lines.
- The report catalog and runtime evidence export reference the new report.

## Verification

- `pnpm run check:docs`
- focused supervisor integration test for `dashboard_e2e_report`
- `pnpm --filter @kendall/dashboard build`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
