# Story 3.46: Maintenance Readiness Drift Check

Date: 2026-06-09
Status: ready for review

## Goal

Add a dedicated static verification check that keeps the maintenance readiness report aligned across contracts, schemas, API route, service tracks, dashboard rendering, browser assertions, runtime evidence, safe backlog references, runbooks, and story evidence.

## Scope

- Add `pnpm run check:maintenance-readiness`.
- Include the check in full `pnpm run check`.
- Surface the command in the verification readiness report and controls-page browser coverage.
- Add Story 3.46 to runtime evidence export git-backed evidence and safe backlog verification-hardening evidence.
- Update current runbooks and runbook drift checks for the active verification chain.
- Refresh architecture status through Story 3.46.

## Safety Boundary

This is static drift coverage. It does not approve:

- remote delivery automation,
- GitHub writes,
- worker execution,
- local provider or model calls,
- subscription-agent process launch,
- premium execution,
- worker shell commands,
- worker source mutation,
- worker network access,
- credential access.

## Acceptance Criteria

- `package.json` defines `check:maintenance-readiness`.
- Full `pnpm run check` includes `pnpm run check:maintenance-readiness`.
- The drift script validates maintenance readiness contract/schema types, API route, service tracks, dashboard client, controls-page rendering, panel rendering, browser assertions, supervisor assertions, story index, and architecture tracking.
- Verification readiness lists `pnpm run check:maintenance-readiness` as a required command.
- Current operator runbooks name the command in the active verification chain.
- Runtime evidence export references Story 3.46.
- `pnpm run check` passes.

## Verification

- `pnpm run check:maintenance-readiness`
- `pnpm run check:runbooks`
- `pnpm run check:runtime-export`
- `pnpm run check:safe-backlog`
- `pnpm run check:docs`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k "verification_readiness or maintenance_readiness_report or runtime_evidence_export or safe_development_backlog"`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
