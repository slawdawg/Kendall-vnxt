# Story 3.62: Maintenance Readiness Evidence Links

Date: 2026-06-09
Status: done

## Goal

Render maintenance readiness track related reports, related docs, and dashboard anchors so each safe maintenance lane links directly to its supporting evidence.

## Scope

- Add `dashboardAnchors` to maintenance readiness track contracts and schemas.
- Populate dashboard anchors for each maintenance readiness track.
- Render related report links, related docs, and dashboard anchors in the maintenance readiness panel.
- Extend supervisor integration, dashboard browser, maintenance readiness drift, runtime export drift, documentation, and story evidence coverage.
- Refresh architecture and story indexes through Story 3.62.

## Safety Boundary

This is read-only evidence navigation. It does not approve:

- local or remote provider/model calls,
- subscription-agent process launch,
- premium execution,
- worker shell commands,
- worker source mutation,
- worker network access,
- credential access,
- worker remote delivery automation.

## Acceptance Criteria

- Maintenance readiness tracks expose `dashboardAnchors`.
- The maintenance readiness dashboard panel renders `Related reports` through shared report shortcuts.
- The panel renders `Related docs` and explicit `/controls#...` anchor shortcuts.
- `pnpm run check:maintenance-readiness` fails if contract, service, panel, browser assertion, supervisor assertion, or story evidence drift.
- Runtime evidence export story evidence includes Story 3.62.

## Verification

- `pnpm run check:maintenance-readiness`
- `pnpm run check:runtime-export`
- `pnpm run check:docs`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k "maintenance_readiness"`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
