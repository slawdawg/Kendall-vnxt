# Story 3.48: Execution Boundary Report Drift Check

Date: 2026-06-09
Status: done

## Goal

Add a dedicated static verification check for the execution configuration, execution readiness, and threat-boundary report family so the core execution-authority boundary stays aligned across contracts, schemas, API routes, service construction, dashboard shortcuts, browser assertions, supervisor assertions, runtime evidence, runbooks, and story evidence.

## Scope

- Add `pnpm run check:execution-boundary`.
- Include the check in full `pnpm run check`.
- Surface the command in the verification readiness report and controls-page browser coverage.
- Require the command in current runbooks and handoffs.
- Add Story 3.48 to runtime evidence export git-backed evidence.
- Refresh architecture status through Story 3.48.

## Safety Boundary

This is static drift coverage. It does not approve:

- worker execution,
- local provider or model calls,
- subscription-agent process launch,
- premium execution,
- arbitrary worker shell commands,
- worker source mutation,
- worker network access,
- credential access.

## Acceptance Criteria

- `package.json` defines `check:execution-boundary`.
- Full `pnpm run check` includes `pnpm run check:execution-boundary`.
- The drift check validates execution configuration, execution readiness, and threat-boundary contracts, schemas, routes, service evidence, report shortcuts, browser assertions, supervisor assertions, story index, runtime export references, runbook coverage, and architecture tracking.
- Verification readiness lists `pnpm run check:execution-boundary` as required.
- Current operator runbooks name the command in the active verification chain.
- Runtime evidence export references Story 3.48.
- `pnpm run check` passes.

## Verification

- `pnpm run check:execution-boundary`
- `pnpm run check:verification-readiness`
- `pnpm run check:runbooks`
- `pnpm run check:runtime-export`
- `pnpm run check:docs`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k "execution_configuration_checks or execution_readiness_report or threat_boundary or verification_readiness or runtime_evidence_export"`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
