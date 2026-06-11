# Story 3.47: Core Readiness Drift Checks

Date: 2026-06-09
Status: done

## Goal

Add dedicated static verification checks for the documentation authority and verification readiness reports so the two central readiness surfaces stay aligned across contracts, schemas, API routes, service construction, dashboard rendering, browser assertions, runtime evidence, runbooks, and story evidence.

## Scope

- Add `pnpm run check:documentation-authority`.
- Add `pnpm run check:verification-readiness`.
- Include both checks in full `pnpm run check`.
- Surface both commands in the verification readiness report and controls-page browser coverage.
- Add Story 3.47 to runtime evidence export git-backed evidence.
- Update current runbooks and runbook drift checks for the active verification chain.
- Refresh architecture status through Story 3.47.

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

- `package.json` defines both new check scripts.
- Full `pnpm run check` includes both new commands.
- Documentation authority drift coverage validates report contracts, schemas, route, service evidence, dashboard rendering, browser assertions, supervisor assertions, story index, and architecture tracking.
- Verification readiness drift coverage validates report contracts, schemas, route, command inventory, dashboard rendering, browser assertions, supervisor assertions, story index, and architecture tracking.
- Verification readiness lists both commands as required.
- Current operator runbooks name both commands in the active verification chain.
- Runtime evidence export references Story 3.47.
- `pnpm run check` passes.

## Verification

- `pnpm run check:documentation-authority`
- `pnpm run check:verification-readiness`
- `pnpm run check:runbooks`
- `pnpm run check:runtime-export`
- `pnpm run check:docs`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k "documentation_authority_report or verification_readiness or runtime_evidence_export"`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
