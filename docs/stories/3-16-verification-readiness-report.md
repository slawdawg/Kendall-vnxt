# Story 3.16: Verification Readiness Report

Status: ready for review
Date: 2026-06-08

## Goal

Expose the verification commands, optional browser/remote checks, and execution-authority stop lines through a read-only supervisor report and dashboard controls panel.

## Scope

- Add `GET /supervisor/verification-readiness-report`.
- Surface required local verification commands for docs, dashboard, supervisor, and full-check readiness.
- Surface optional Playwright, GitHub remote, and fresh-VM verification commands.
- Show the report on the dashboard controls page.
- Add integration and dashboard coverage for the report.

## Safety Boundary

This story is reporting-only. Passing verification does not approve:

- local provider/model calls,
- subscription-agent process launch,
- premium execution,
- arbitrary shell execution,
- worker source mutation,
- worker network access,
- worker credential access.

## Acceptance Criteria

- The supervisor endpoint returns required commands, optional commands, stop lines, and next safe actions.
- Fetching the endpoint does not create workflow events or mutate work-item state.
- The controls page shows verification readiness beside existing execution and documentation authority evidence.
- `pnpm run check` continues to pass.
