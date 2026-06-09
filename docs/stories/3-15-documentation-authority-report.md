# Story 3.15: Documentation Authority Report

Status: ready for review
Date: 2026-06-08

## Goal

Expose the documentation authority indexes, approval checkpoint, and blocked execution-authority story state through a read-only supervisor report and dashboard controls panel.

## Scope

- Add `GET /supervisor/documentation-authority-report`.
- Surface architecture, PRD, story, and approval checkpoint document status.
- Surface the blocked Ollama and subscription-agent authority stories without changing their approval state.
- Show the report on the dashboard controls page.
- Add integration and dashboard coverage for the report.

## Safety Boundary

This story is reporting-only. It does not approve or implement:

- local provider/model calls,
- subscription-agent process launch,
- premium execution,
- arbitrary shell execution,
- worker source mutation,
- worker network access,
- worker credential access.

## Acceptance Criteria

- The supervisor endpoint returns a report with documentation index status, approval checkpoint status, blocked story status, drift checks, and next safe actions.
- Fetching the endpoint does not create workflow events or mutate work-item state.
- The controls page shows the documentation authority report beside existing execution-readiness evidence.
- `pnpm run check:docs` and `pnpm run check` continue to pass.
