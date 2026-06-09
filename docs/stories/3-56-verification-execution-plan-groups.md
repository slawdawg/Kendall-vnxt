# Story 3.56: Verification Execution Plan Groups

Date: 2026-06-09
Status: ready for review

## Goal

Add grouped verification execution phases to the existing verification readiness report so operators can run checks in a clear order without treating green checks as execution-authority approval.

## Scope

- Add shared contract and supervisor schema support for verification command groups.
- Add command groups to `GET /supervisor/verification-readiness-report`.
- Render the grouped execution plan on the controls page.
- Extend supervisor integration, browser, and static drift-check coverage.
- Refresh architecture and story indexes through Story 3.56.

## Safety Boundary

This is verification guidance only. It does not approve:

- local or remote provider/model calls,
- subscription-agent process launch,
- premium execution,
- worker shell commands,
- worker source mutation,
- worker network access,
- credential access,
- worker remote delivery automation.

## Acceptance Criteria

- The verification readiness API includes setup/preflight, static drift chain, dashboard/browser/build, supervisor behavior, full local gate, and optional remote/bootstrap command groups.
- Every group references existing required or optional command IDs.
- The controls page renders the execution plan before the raw command lists.
- Static verification readiness drift checks require the group contract, service construction, dashboard rendering, and browser assertions.
- Full `pnpm run check` remains green.

## Verification

- `pnpm run check:verification-readiness`
- `pnpm run check:docs`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k "verification_readiness"`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
