# Story 1.3: Dashboard Routing Badge And Why This Route Panel

Status: done

## Story

As a Kendall_vNxt operator,
I want the work-item detail page to show the current routing preview and why it chose that lane,
so that dynamic routing is inspectable from the existing supervisor dashboard before it gains execution authority.

## Acceptance Criteria

1. The dashboard work-item detail page fetches the supervisor routing preview for the current work item.
2. The detail page shows a compact routing badge when routing preview data is available.
3. The badge shows selected lane, authority mode, and confidence band.
4. The page includes a "Why This Route?" panel or expansion for the routing decision.
5. The route explanation shows plain-English rationale, readable reason codes, rejected lanes, permission summary, escalation path, and whether execution is affected.
6. The implementation does not add a worker fleet dashboard or execution controls.
7. Minimal TypeScript contract types are added only for the routing preview response needed by the dashboard.
8. Dashboard/browser coverage verifies the routing badge and "Why This Route?" view render from supervisor data.
9. Existing supervisor and dashboard checks remain green.

## Tasks / Subtasks

- [x] Add routing preview dashboard contract types. (AC: 1, 7)
- [x] Add dashboard API client support for `GET /work-items/{id}/routing-preview`. (AC: 1)
- [x] Add compact routing badge and "Why This Route?" panel to the work-item detail page. (AC: 2, 3, 4, 5, 6)
- [x] Add Playwright coverage for rendering the routing explanation from supervisor data. (AC: 8)
- [x] Run focused and full checks. (AC: 9)

### Review Findings

- [x] [Review][Patch] Routing preview degrades gracefully when unavailable [apps/dashboard/src/app/work-items/[work-item-id]/page.tsx]
- [x] [Review][Patch] Execution impact derives from routing authority mode instead of a hard-coded dashboard assumption [apps/dashboard/src/components/routing-preview-panel.tsx]

## Dev Notes

This is Slice 3 from `docs/prds/supervisor-dynamic-routing-mvp-1.md`. Stories 1.1 and 1.2 established the deterministic routing preview service, GET/POST API shape, and optional event recording. This story is visibility only: no worker launching, provider configuration, route mutation controls, or fleet dashboard.

Relevant existing files:

- `packages/contracts/src/api.ts`
- `apps/dashboard/src/lib/supervisor.ts`
- `apps/dashboard/src/app/work-items/[work-item-id]/page.tsx`
- `apps/dashboard/src/components/recipe-gate-audit-panel.tsx`
- `tests/e2e/dashboard.spec.ts`

## Verification

- `pnpm --filter @kendall/dashboard build`
- `pnpm run test:e2e:dashboard -- --grep "routing"` if practical, otherwise full project check
- `pnpm run check`
- `git diff --check`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- Dashboard build: `pnpm --filter @kendall/dashboard build` passed.
- Focused browser coverage: `pnpm run test:e2e:dashboard -- --grep "routing badge"` passed, 1 test.
- Full check: `pnpm run check` passed, including preflight, dashboard build, and 45 supervisor tests.

### Completion Notes List

- Added minimal routing preview TypeScript contracts for the dashboard response shape.
- Added dashboard supervisor client support for the existing non-mutating routing preview endpoint.
- Added a work-item detail routing panel showing selected lane, authority mode, confidence, reason codes, rejected lanes, permission summary, escalation path, and execution impact.
- Added Playwright coverage for the routing badge and "Why This Route?" explanation using live supervisor data.
- Did not add fleet dashboard, provider controls, route mutation controls, or worker execution behavior.

### File List

- packages/contracts/src/api.ts
- apps/dashboard/src/lib/supervisor.ts
- apps/dashboard/src/app/work-items/[work-item-id]/page.tsx
- apps/dashboard/src/components/routing-preview-panel.tsx
- tests/e2e/dashboard.spec.ts
- docs/stories/1-3-dashboard-routing-badge-and-why-this-route-panel.md

## Change Log

- 2026-06-08: Story created for dashboard routing visibility slice.
- 2026-06-08: Implemented dashboard routing badge, explanation panel, contract types, and browser coverage; status moved to done.
- 2026-06-08: Story 1.3 code review fixes applied for graceful preview fallback and execution-impact derivation.
