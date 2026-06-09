# Story 3.31: Runtime Evidence Export Drift Check

Date: 2026-06-09
Status: ready for review

## Goal

Add a required static verification check that keeps runtime evidence export contracts, schemas, API route, service construction, dashboard rendering, browser assertions, and story references aligned.

## Scope

- Add `pnpm run check:runtime-export`.
- Validate shared TypeScript contracts and supervisor schema classes for runtime export boundary, safety, manifest, navigator, and export views.
- Validate the runtime evidence export API route and service navigator item construction.
- Validate the dashboard runtime export panel and focused detail e2e assertions include review navigator content.
- Include the runtime export drift check in `pnpm run check`.
- Surface the check in verification readiness, safe backlog evidence, runtime evidence export references, story docs, and architecture tracking.

## Safety Boundary

This is static verification and read-only evidence-surface alignment. It does not approve:

- local provider or model calls,
- subscription-agent process launch,
- premium execution,
- worker shell commands,
- worker source mutation,
- network access,
- credential access.

## Acceptance Criteria

- `scripts/check-runtime-evidence-export.mjs` fails when runtime export contracts, schemas, service navigator items, dashboard rendering, browser assertions, or story references drift.
- `pnpm run check:runtime-export` is part of `pnpm run check`.
- Verification readiness lists the runtime export drift check as required for runtime export and work-item evidence panel changes.
- Controls-page browser coverage asserts the runtime export drift command is visible.
- Runtime evidence export references this story as git-backed evidence.
- `pnpm run check` passes.

## Verification

- `node --check scripts/check-runtime-evidence-export.mjs`
- `pnpm run check:runtime-export`
- `pnpm run check:docs`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k "verification_readiness_report or runtime_evidence_export"`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
