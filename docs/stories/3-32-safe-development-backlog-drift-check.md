# Story 3.32: Safe Development Backlog Drift Check

Date: 2026-06-09
Status: ready for review

## Goal

Add a required static verification check that keeps the safe development backlog report aligned across contracts, schemas, API route, service items, dashboard rendering, browser assertions, blocked authority stop lines, and story references.

## Scope

- Add `pnpm run check:safe-backlog`.
- Validate safe backlog shared contracts and supervisor schema classes.
- Validate the supervisor API route and service item IDs for ready and blocked backlog work.
- Validate blocked authority stop lines for Ollama stories 4.1-4.4 and subscription-agent stories 5.1-5.5.
- Validate dashboard client, controls-page rendering, panel fields, and controls e2e assertions.
- Include the safe backlog drift check in `pnpm run check`.
- Surface the check in verification readiness, safe backlog evidence, runtime evidence export references, story docs, and architecture tracking.

## Safety Boundary

This is static verification and read-only backlog alignment. It does not approve:

- local provider or model calls,
- subscription-agent process launch,
- premium execution,
- worker shell commands,
- worker source mutation,
- network access,
- credential access.

## Acceptance Criteria

- `scripts/check-safe-development-backlog.mjs` fails when safe backlog contracts, schemas, service items, dashboard rendering, browser assertions, blocked authority stop lines, or story references drift.
- `pnpm run check:safe-backlog` is part of `pnpm run check`.
- Verification readiness lists the safe backlog drift check as required for safe backlog, maintenance report, and blocked authority story reference changes.
- Controls-page browser coverage asserts the safe backlog drift command is visible.
- Runtime evidence export references this story as git-backed evidence.
- `pnpm run check` passes.

## Verification

- `node --check scripts/check-safe-development-backlog.mjs`
- `pnpm run check:safe-backlog`
- `pnpm run check:docs`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k "verification_readiness_report or safe_development_backlog or runtime_evidence_export"`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
