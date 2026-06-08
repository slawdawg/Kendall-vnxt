# Story 1.9: Routing Lane Evidence Profiles

Status: done

## Story

As a Kendall_vNxt operator,
I want the supervisor to summarize recorded routing evidence by lane,
so that future routing decisions and fleet views can be grounded in actual route usage before adaptive routing is enabled.

## Acceptance Criteria

1. The supervisor exposes a backend endpoint that returns lane-level routing evidence profiles derived from workflow events.
2. Each profile includes lane, decision count, guarded execution count, handoff package count, local explanation count, preview count, recent reason codes, and latest event timestamp.
3. The endpoint is read-only and does not mutate work items, enqueue work, run commands, or alter routing policy.
4. Profiles are derived only from recorded routing workflow events and tolerate missing or partial payload fields.
5. Focused integration tests cover aggregation across utility, local read-only, and subscription handoff evidence.
6. Existing broader checks remain green.

## Tasks / Subtasks

- [x] Add routing lane evidence profile schema and shared contract type. (AC: 1, 2)
- [x] Add supervisor service aggregation from workflow events. (AC: 2, 3, 4)
- [x] Add read-only API endpoint with existing envelope conventions. (AC: 1, 3)
- [x] Add focused supervisor integration tests. (AC: 4, 5)
- [x] Run focused and broader verification. (AC: 6)

## Dev Notes

This is a dynamic-routing follow-on after Story 1.8. It is the first small step toward worker/lane performance profiles from attempt evidence, but it should remain read-only and descriptive. Do not add adaptive routing, operator override controls, fleet dashboard UI, worker adapters, model calls, or execution changes.

Relevant files:

- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/api/main.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`
- `packages/contracts/src/api.ts`

## Verification

- `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q -k lane_profiles`
- `pnpm run check`
- `git diff --check`

## Dev Agent Record

### Agent Model Used

GPT-5.5

### Debug Log References

- Focused lane profile subset: `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q -k lane_profiles` passed, 1 selected / 21 deselected.
- Full routing suite: `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q` passed, 22 tests.
- Full project check: `pnpm run check` passed, including dashboard build and 54 supervisor tests.
- Whitespace check: `git diff --check` passed with only existing CRLF normalization warnings from Git.

### Completion Notes List

- Added routing lane evidence profile schemas and shared TypeScript contract type.
- Added read-only `GET /routing/lane-profiles`, aggregating recorded routing events by selected lane.
- Profiles include preview, guarded utility execution, subscription handoff package, and local evidence explanation counts while tolerating partial payloads.
- Added focused coverage proving utility, local read-only, and subscription handoff evidence aggregate without mutating work-item history.

### File List

- services/supervisor/src/supervisor/api/schemas.py
- services/supervisor/src/supervisor/api/main.py
- services/supervisor/src/supervisor/application/service.py
- services/supervisor/tests/integration/test_routing_preview.py
- packages/contracts/src/api.ts
- docs/stories/1-9-routing-lane-evidence-profiles.md

## Change Log

- 2026-06-08: Story created for read-only routing lane evidence profiles.
- 2026-06-08: Implemented read-only routing lane evidence profiles, shared contract type, endpoint, and focused tests; moved story status to done.
