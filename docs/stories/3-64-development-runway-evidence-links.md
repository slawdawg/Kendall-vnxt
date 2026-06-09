# Story 3.64: Development Runway Evidence Links

Ready for Review

## Goal

Render development runway slice and readiness-check related reports, related docs, and dashboard anchors so larger safe slice selection links directly to the evidence it depends on.

## Scope

- Add `relatedDocs` to development runway slices and readiness checks.
- Add readiness-check dashboard anchors.
- Populate related reports, related docs, and dashboard anchors for all development runway slices and checks.
- Render related report links, related docs, and dashboard anchors in the development runway panel.
- Extend supervisor integration, dashboard browser, development runway drift, runtime export drift, documentation, and story evidence coverage.

## Acceptance

- `DevelopmentRunwaySliceView` exposes `relatedDocs`.
- `DevelopmentRunwayReadinessCheckView` exposes `relatedDocs` and `dashboardAnchors`.
- Development runway related reports use shared controls-page report shortcut links.
- The controls page renders `Related reports`, `Related docs`, and supporting dashboard anchors for runway evidence.
- `pnpm run check:development-runway` fails if contract, service, panel, browser assertion, supervisor assertion, or story evidence drifts.
- Runtime evidence export story evidence includes Story 3.64.

## Verification

- `pnpm run check:development-runway`
- `pnpm run check:runtime-export`
- `pnpm run check:docs`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k "development_runway"`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
