# Story 1.4: Routing MVP Hardening And Contract Completion

Status: done

## Story

As a Kendall_vNxt operator,
I want routing preview outputs to be more complete and representative,
so that the routing contract is stable enough to carry forward into real execution-lane work.

## Acceptance Criteria

1. `RoutingDecision` includes a stable `createdAt` field through supervisor API and dashboard contract surfaces.
2. The preview service explicitly handles additional representative task kinds from the routing PRD instead of falling through to generic handling where a clearer policy exists.
3. Architecture review, security review, routing preview, and subscription handoff package task kinds have deterministic route behavior and stable reason codes.
4. Integration tests cover the added task-kind behavior and the serialized routing decision `createdAt` field.
5. Existing dashboard and supervisor checks remain green.

## Tasks / Subtasks

- [x] Add `createdAt` to routing decision domain, API schema/view mapping, and TypeScript contract surface. (AC: 1)
- [x] Tighten routing policy coverage for additional representative task kinds. (AC: 2, 3)
- [x] Add focused supervisor integration coverage for the new task-kind mappings and serialized timestamp. (AC: 4)
- [x] Run focused and full checks. (AC: 5)

## Dev Notes

This is Slice 4 from `docs/prds/supervisor-dynamic-routing-mvp-1.md`. Stories 1.1 through 1.3 established the routing contract, dry-run API/event flow, and dashboard visibility. This story is hardening work only; it does not add worker execution, provider settings, or operator override controls.

Relevant existing files:

- `services/supervisor/src/supervisor/domain/routing.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/tests/integration/test_routing_preview.py`
- `packages/contracts/src/api.ts`

## Verification

- `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q`
- `pnpm --filter @kendall/dashboard build`
- `pnpm run check`
- `git diff --check`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- Focused routing suite: `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q` passed, 14 tests.
- Dashboard build: `pnpm --filter @kendall/dashboard build` passed.
- Full check: `pnpm run check` passed, including dashboard build and 46 supervisor tests.

### Completion Notes List

- Added stable `createdAt` to routing decisions without breaking deterministic unit previews by using a fixed fallback timestamp in pure policy tests and work-item `updatedAt` in supervisor API previews.
- Added explicit routing behavior for `routing_preview`, `architecture_review`, `security_review`, and `subscription_handoff_package` task kinds with stable reason codes.
- Expanded supervisor integration coverage for the additional task kinds and serialized `createdAt` behavior.
- Left worker execution, provider configuration, and operator overrides out of scope.

### File List

- services/supervisor/src/supervisor/domain/routing.py
- services/supervisor/src/supervisor/api/schemas.py
- services/supervisor/src/supervisor/application/service.py
- services/supervisor/tests/integration/test_routing_preview.py
- packages/contracts/src/api.ts
- docs/stories/1-4-routing-mvp-hardening-and-contract-completion.md

## Change Log

- 2026-06-08: Story created for routing MVP hardening.
- 2026-06-08: Implemented routing MVP hardening, representative task-kind mapping, and contract completion; status moved to done.
