# Story 1.10: Record-Only Routing Override Evidence

Status: done

## Story

As a Kendall_vNxt operator,
I want to record routing override intent without changing execution,
so that future routing tuning has human evidence while current supervisor behavior remains safe.

## Acceptance Criteria

1. The supervisor exposes a backend endpoint to record a routing override evidence event for a work item.
2. The request captures proposed lane, reason, optional note, and optional actor identity.
3. The response returns a structured override record including current route preview, proposed lane, reason, note, actor metadata, and `executionAffected: false`.
4. Recording an override does not alter work-item state, enqueue work, run commands, launch workers, or change routing decisions.
5. Invalid proposed lanes are rejected without recording an event.
6. Focused integration tests cover event recording, non-mutation, and invalid-lane rejection.
7. Existing broader checks remain green.

## Tasks / Subtasks

- [x] Add record-only routing override request/response schemas and shared contract type. (AC: 1, 2, 3)
- [x] Add supervisor service logic to validate lane names and record override evidence without affecting execution. (AC: 3, 4, 5)
- [x] Add API endpoint with existing envelope/error conventions. (AC: 1, 5)
- [x] Add focused supervisor integration tests. (AC: 4, 5, 6)
- [x] Run focused and broader verification. (AC: 7)

## Dev Notes

This is a dynamic-routing follow-on after Story 1.9. It addresses operator override evidence and tuning without adding dashboard controls or making overrides authoritative. It must remain record-only.

Relevant files:

- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/api/main.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`
- `packages/contracts/src/api.ts`

## Verification

- `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q -k routing_override`
- `pnpm run check`
- `git diff --check`

## Dev Agent Record

### Agent Model Used

GPT-5.5

### Debug Log References

- Focused routing override subset: `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q -k routing_override` passed, 2 selected / 22 deselected.
- Full routing suite: `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q` passed, 24 tests.
- Full project check: `pnpm run check` passed, including dashboard build and 56 supervisor tests.
- Whitespace check: `git diff --check` passed with only existing CRLF normalization warnings from Git.

### Completion Notes List

- Added record-only routing override evidence schemas and shared TypeScript contract type.
- Added `POST /work-items/{id}/routing-override`, which validates proposed lanes and records `routing.override_recorded` without affecting execution.
- Override responses include current route, proposed lane, reason, note, actor metadata, and `executionAffected: false`.
- Added focused coverage for event recording/non-mutation and invalid-lane rejection.

### File List

- services/supervisor/src/supervisor/api/schemas.py
- services/supervisor/src/supervisor/api/main.py
- services/supervisor/src/supervisor/application/service.py
- services/supervisor/tests/integration/test_routing_preview.py
- packages/contracts/src/api.ts
- docs/stories/1-10-record-only-routing-override-evidence.md

## Change Log

- 2026-06-08: Story created for record-only routing override evidence.
- 2026-06-08: Implemented record-only routing override evidence, shared contract type, endpoint, and focused tests; moved story status to done.
