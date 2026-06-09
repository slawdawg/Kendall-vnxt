# Story 3.60: Safe Backlog Report Anchors

Date: 2026-06-09
Status: ready for review

## Goal

Turn safe backlog related-report references into dashboard report anchors so operators can move from backlog selection to the supporting report evidence without manual lookup.

## Scope

- Add `dashboardAnchors` to safe backlog item contracts and schemas.
- Populate dashboard anchors for every safe backlog item.
- Render related report links and explicit dashboard anchors in the safe backlog controls panel.
- Extend supervisor integration, dashboard browser, safe backlog drift, runtime export drift, documentation, and story evidence coverage.
- Refresh architecture and story indexes through Story 3.60.

## Safety Boundary

This is read-only navigation evidence. It does not approve:

- local or remote provider/model calls,
- subscription-agent process launch,
- premium execution,
- worker shell commands,
- worker source mutation,
- worker network access,
- credential access,
- worker remote delivery automation.

## Acceptance Criteria

- Safe backlog items expose `dashboardAnchors` for their related report evidence.
- The safe backlog dashboard panel renders related report links through shared report shortcuts.
- The panel renders explicit `/controls#...` anchor shortcuts for backlog items.
- `pnpm run check:safe-backlog` fails if the contract, service anchors, panel links, browser assertions, or story evidence drift.
- Runtime evidence export story evidence includes Story 3.60.

## Verification

- `pnpm run check:safe-backlog`
- `pnpm run check:runtime-export`
- `pnpm run check:docs`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k "safe_development_backlog"`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
