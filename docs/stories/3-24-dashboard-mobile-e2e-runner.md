# Story 3.24: Dashboard Mobile E2E Runner

Date: 2026-06-09
Status: ready for review

## Goal

Add a focused, owned-lifecycle browser verification command for the phone-sized dashboard intake draft workflow.

## Scope

- Extend `scripts/dashboard-e2e-runner.mjs` so focused runners can target a specific Playwright test file.
- Add `pnpm run test:e2e:dashboard:mobile`.
- Add `scripts/run-mobile-e2e.mjs` for the mobile intake draft slice.
- Surface the mobile runner in the verification readiness report, dashboard e2e report, runtime evidence export references, and mobile dashboard recipe verification commands.
- Cover the report and controls-page command visibility with existing integration and Playwright assertions.

## Safety

This is verification infrastructure only. It does not approve:

- local provider or model calls,
- subscription-agent process launch,
- premium execution,
- worker shell commands,
- worker source mutation,
- network access,
- credential access.

## Acceptance

- The mobile focused command exists and uses the shared lifecycle helper.
- The helper still defaults to `dashboard.spec.ts` for controls/detail runners.
- The mobile runner targets `dashboard-mobile.spec.ts`.
- Verification readiness and dashboard e2e reports list the mobile command.
- The mobile dashboard recipe includes the focused mobile command before full dashboard e2e.
- `pnpm run test:e2e:dashboard:mobile` passes.
- `pnpm run check` passes.

## Verification

- `pnpm run check:docs`
- focused supervisor integration tests for verification/dashboard e2e reports and runtime export references
- `pnpm run test:e2e:dashboard:mobile`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
