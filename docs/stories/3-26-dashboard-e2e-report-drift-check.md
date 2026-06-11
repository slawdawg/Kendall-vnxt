# Story 3.26: Dashboard E2E Report Drift Check

Date: 2026-06-09
Status: done

## Goal

Add a required static verification check that keeps dashboard e2e runner commands, supervisor reports, browser assertions, and story references aligned.

## Scope

- Add `pnpm run check:e2e-report`.
- Validate dashboard e2e package scripts and focused runner evidence files.
- Validate supervisor verification and dashboard e2e reports still surface the expected runner ids and commands.
- Validate controls-page browser coverage asserts the visible runner commands.
- Validate story evidence files and the story index cover the runner/report slice.
- Include the drift check in `pnpm run check`.
- Route `pnpm run test:supervisor` through a repo-local uv cache wrapper so full checks do not depend on mutable user cache state.
- Surface the drift check in verification readiness, dashboard e2e report setup commands, runtime evidence export references, and architecture tracking.

## Safety

This is static verification and read-only report metadata. It does not approve:

- local provider or model calls,
- subscription-agent process launch,
- premium execution,
- worker shell commands,
- worker source mutation,
- network access,
- credential access.

## Acceptance

- `scripts/check-dashboard-e2e-report.mjs` fails when expected package scripts, report commands, browser assertions, or story references drift.
- `pnpm run check:e2e-report` is part of `pnpm run check`.
- Verification readiness and dashboard e2e reports list the drift check as required for runner/report changes.
- Supervisor tests launched through `pnpm run check` use repo-local cache and temp paths.
- Controls-page browser coverage asserts the drift check command is visible.
- Runtime evidence export references this story as git-backed evidence.
- `pnpm run check` passes.

## Verification

- `node --check scripts/check-dashboard-e2e-report.mjs`
- `pnpm run check:e2e-report`
- `pnpm run check:docs`
- `node --check scripts/run-supervisor-tests.mjs`
- focused supervisor integration tests for verification/dashboard e2e reports and runtime export references
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
