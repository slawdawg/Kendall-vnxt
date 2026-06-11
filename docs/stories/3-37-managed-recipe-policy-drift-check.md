# Story 3.37: Managed Recipe Policy Drift Check

Date: 2026-06-09
Status: done

## Goal

Add a required static verification check that keeps the managed recipe policy report aligned across shared contracts, supervisor schemas, FastAPI route, service construction, dashboard rendering, browser assertions, tests, and story evidence.

## Scope

- Add `pnpm run check:managed-recipes`.
- Wire the check into `pnpm run check`.
- Surface the command in the verification readiness report.
- Extend controls-page browser coverage to assert the command.
- Track Story 3.37 in runtime evidence and safe backlog verification hardening evidence.
- Keep future verification work oriented toward larger coherent PR slices across API, dashboard, docs, and tests.

## Safety Boundary

This is a read-only static drift check. It does not approve:

- local provider or model calls,
- subscription-agent process launch,
- premium execution,
- worker shell commands outside declared recipe commands,
- worker source mutation outside declared recipe path gates,
- network access,
- credential access,
- remote git, PR, CI, merge, release, or deployment automation.

## Acceptance Criteria

- `package.json` defines `check:managed-recipes`.
- `pnpm run check` includes `pnpm run check:managed-recipes`.
- The check validates managed recipe report contracts, schemas, route, service, dashboard client, controls page, panel, browser assertions, supervisor tests, story index, and architecture reconciliation.
- The verification readiness report surfaces `pnpm run check:managed-recipes`.
- Runtime evidence export and safe backlog verification evidence reference this story.
- The controls-page e2e test asserts the new verification command.

## Verification

- `node --check scripts/check-managed-recipe-policy-report.mjs`
- `pnpm run check:managed-recipes`
- `pnpm run check:docs`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k "verification_readiness_report or safe_development_backlog or runtime_evidence_export or managed_recipe_policy_report"`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
