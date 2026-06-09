# Story 3.28: Supervisor Report Catalog Drift Check

Date: 2026-06-09
Status: ready for review

## Goal

Add a required static verification check that keeps supervisor report catalog entries, API routes, runtime export references, dashboard fetches, browser assertions, and story references aligned.

## Scope

- Add `pnpm run check:reports`.
- Validate report catalog ids and endpoints against FastAPI route declarations.
- Validate runtime evidence export and focused integration tests reference the expected report endpoints.
- Validate controls-page report fetches exist for dashboard-visible report panels.
- Validate browser coverage asserts key visible report endpoints and the report drift command.
- Include the report drift check in `pnpm run check`.
- Surface the drift check in verification readiness, safe backlog evidence, runtime evidence export references, and architecture tracking.

## Safety Boundary

This is static verification and read-only report metadata. It does not approve:

- local provider or model calls,
- subscription-agent process launch,
- premium execution,
- worker shell commands,
- worker source mutation,
- network access,
- credential access.

## Acceptance Criteria

- `scripts/check-supervisor-report-catalog.mjs` fails when report catalog endpoints, routes, runtime export references, dashboard fetches, browser assertions, or story references drift.
- `pnpm run check:reports` is part of `pnpm run check`.
- Verification readiness lists the report drift check as required for report/runtime reference changes.
- Controls-page browser coverage asserts the report drift command and safe backlog endpoint are visible.
- Runtime evidence export references this story as git-backed evidence.
- `pnpm run check` passes.

## Verification

- `node --check scripts/check-supervisor-report-catalog.mjs`
- `pnpm run check:reports`
- `pnpm run check:docs`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k "verification_readiness_report or report_catalog or runtime_evidence_export"`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
