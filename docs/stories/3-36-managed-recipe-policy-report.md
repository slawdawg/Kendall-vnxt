# Story 3.36: Managed Recipe Policy Report

Date: 2026-06-09
Status: ready for review

## Goal

Add a read-only supervisor report that catalogs managed recipe gates, allowed paths, verification commands, operator checkpoints, and blocked remote automation posture.

## Scope

- Add `GET /supervisor/managed-recipe-policy-report`.
- Add shared contract and supervisor schema types for the report.
- Render the report on the controls page.
- Add the report to the supervisor report catalog and runtime evidence export references.
- Surface the report in maintenance/safe backlog evidence.
- Extend static report-catalog drift checks, supervisor integration tests, and controls-page browser coverage.

## Safety Boundary

This is read-only policy visibility. It does not approve:

- local provider or model calls,
- subscription-agent process launch,
- premium execution,
- worker shell commands outside declared recipe commands,
- worker source mutation outside declared recipe path gates,
- network access,
- credential access,
- remote git, PR, CI, merge, release, or deployment automation.

## Acceptance Criteria

- The managed recipe policy report returns all declared managed recipes.
- The report shows remote automation as blocked.
- Reading the report does not mutate work-item events.
- The controls page renders recipe ids, verification commands, policy gates, and stop lines.
- The supervisor report catalog and runtime evidence export reference the report endpoint.
- `pnpm run check:reports` protects the route/dashboard/story alignment.
- `pnpm run check` passes.

## Verification

- `pnpm run check:reports`
- `pnpm run check:docs`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k "managed_recipe_policy_report or report_catalog or runtime_evidence_export"`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
