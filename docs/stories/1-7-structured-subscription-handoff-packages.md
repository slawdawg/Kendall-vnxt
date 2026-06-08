# Story 1.7: Structured Subscription Handoff Packages

Status: done

## Story

As a Kendall_vNxt operator,
I want subscription handoff routes to produce structured handoff packages,
so that escalated work can be reviewed or copied into a subscription agent without launching one automatically.

## Acceptance Criteria

1. The supervisor exposes a backend endpoint that creates a structured handoff package for a work item route that selects `subscription_handoff`.
2. The package includes work item identity, task kind, selected route decision, summary context, constraints, allowed paths, validation commands, recent evidence, operator instructions, and a flag showing that agent launch is not allowed.
3. Package generation is non-mutating by default and does not enqueue work, run commands, launch agents, or alter work-item state.
4. Package generation can optionally record a workflow event with concise package metadata when explicitly requested.
5. Requests for non-handoff routes are rejected clearly instead of producing a misleading handoff package.
6. Focused integration tests cover non-mutating package generation, event recording, and non-handoff rejection.
7. Existing broader checks remain green.

## Tasks / Subtasks

- [x] Add subscription handoff package request/response schemas. (AC: 1, 2)
- [x] Add supervisor service logic to derive a package from a subscription handoff route. (AC: 2, 3, 5)
- [x] Add the API endpoint with existing envelope/error conventions. (AC: 1, 4, 5)
- [x] Add focused supervisor integration tests. (AC: 3, 4, 5, 6)
- [x] Run focused and broader verification. (AC: 7)

## Dev Notes

This is a dynamic-routing follow-on after Story 1.6. It should turn the `subscription_handoff` route into a useful structured artifact without creating subscription CLI workers, invoking Codex/Claude/Gemini, or adding operator dashboard controls yet.

The package should be deterministic from current work-item state, route decision, recipe metadata when present, and recent workflow evidence. It should be suitable for a future dashboard panel or manual handoff, but this story is backend/API only.

Relevant files:

- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/api/main.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`
- `packages/contracts/src/api.ts`

## Verification

- `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q -k handoff`
- `pnpm run check`
- `git diff --check`

## Dev Agent Record

### Agent Model Used

GPT-5.5

### Debug Log References

- Focused handoff subset: `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q -k handoff` passed, 4 selected / 14 deselected.
- Full routing suite: `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q` passed, 18 tests.
- Full project check: `pnpm run check` passed, including dashboard build and 50 supervisor tests.
- Whitespace check: `git diff --check` passed with only existing CRLF normalization warnings from Git.

### Completion Notes List

- Added structured subscription handoff package schemas and shared TypeScript contract types.
- Added `POST /work-items/{id}/subscription-handoff-package`, which generates packages only for routes that select `subscription_handoff`.
- Package generation is non-mutating by default, can explicitly record `routing.subscription_handoff_packaged`, and keeps `launchAllowed` false.
- Added focused coverage for non-mutating generation, event recording, and non-handoff rejection.

### File List

- services/supervisor/src/supervisor/api/schemas.py
- services/supervisor/src/supervisor/api/main.py
- services/supervisor/src/supervisor/application/service.py
- services/supervisor/tests/integration/test_routing_preview.py
- packages/contracts/src/api.ts
- docs/stories/1-7-structured-subscription-handoff-packages.md

## Change Log

- 2026-06-08: Story created for structured subscription handoff package generation.
- 2026-06-08: Implemented backend handoff package generation, optional event recording, contract types, and focused tests; moved story status to done.
