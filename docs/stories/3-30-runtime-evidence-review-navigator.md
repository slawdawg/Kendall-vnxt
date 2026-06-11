# Story 3.30: Runtime Evidence Review Navigator

Date: 2026-06-09
Status: done

## Goal

Add a read-only review navigator to runtime evidence exports so operators can move through runtime state, authority boundaries, and git-backed evidence without adding execution authority.

## Scope

- Add `reviewNavigator` to `RuntimeEvidenceExportView`.
- Group runtime export review into prioritized navigator items for runtime state, authority boundary, and git-backed evidence.
- Add related reports, related docs, dashboard anchors, evidence, and stop lines to navigator items.
- Render the navigator in the dashboard runtime evidence export panel.
- Reference this story in runtime export git-backed evidence and architecture tracking.
- Cover the API and dashboard behavior with focused tests.

## Safety Boundary

This is read-only review guidance. It does not approve:

- local provider or model calls,
- subscription-agent process launch,
- premium execution,
- worker shell commands,
- worker source mutation,
- network access,
- credential access.

## Acceptance Criteria

- Runtime evidence exports include navigator items for runtime state, authority boundary, and git-backed evidence.
- The authority-boundary navigator item includes stop lines and related safety reports.
- The dashboard runtime export panel renders the navigator.
- Reading or rendering the navigator does not mutate work items or workflow events.
- Runtime evidence export references this story as git-backed evidence.
- Focused supervisor and dashboard e2e tests cover the new behavior.

## Verification

- `pnpm run check:docs`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k runtime_evidence_export`
- `pnpm run test:e2e:dashboard:detail`
- `pnpm run check`
