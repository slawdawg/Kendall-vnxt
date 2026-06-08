# Story 1.6: Guarded Utility Routing For Managed Actions

Status: done

## Story

As a Kendall_vNxt operator,
I want deterministic supervisor utility work to be routed before it executes,
so that the routing engine begins controlling safe non-LLM work without granting broader worker authority.

## Acceptance Criteria

1. Routing preview remains non-executing by default for deterministic utility tasks.
2. The supervisor can request a guarded utility routing decision for deterministic managed actions that already run inside supervisor policy.
3. Guarded utility routing records an auditable workflow event before the supervisor executes the routed deterministic action.
4. The guarded utility event includes action id, task kind, selected lane, authority mode, confidence, reason codes, rejected lanes, escalation path, and permission summary.
5. Non-utility managed actions keep their existing behavior and are not blocked by this story.
6. Focused routing and supervisor integration tests cover the guarded utility decision and event recording.
7. Existing broader checks remain green.

## Tasks / Subtasks

- [x] Add a guarded utility authority option to the routing policy while keeping default previews record-only. (AC: 1, 2)
- [x] Record a guarded utility routing event before executing deterministic utility managed actions. (AC: 3, 4, 5)
- [x] Add focused tests for default preview safety and guarded utility execution routing. (AC: 6)
- [x] Run focused and broader verification. (AC: 7)

## Dev Notes

This is the first follow-on slice after `docs/prds/supervisor-dynamic-routing-mvp-1.md`. Stories 1.1 through 1.4 established preview-only routing, and Story 1.5 handled environment recoverability. This story must not add new worker adapters, local model calls, subscription CLI launches, provider configuration, or fleet dashboard work.

The intended implementation is deliberately narrow:

- Default route previews still return `record_only` for the `utility` lane.
- Supervisor-managed deterministic actions may request guarded utility authority when the current derived route selects `utility`.
- The first covered action is `supervisor_triage`, because the route derives to `path_scope_check` / utility and the action only advances existing supervisor-owned recipe triage.
- Implementation-oriented actions such as `run_recipe_implementation` should not be forced into utility routing by this story.

Relevant files:

- `services/supervisor/src/supervisor/domain/routing.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`
- `services/supervisor/tests/integration/test_supervisor_flow.py`

## Verification

- `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q`
- `uv run --directory services/supervisor pytest tests/integration/test_supervisor_flow.py -q -k managed_next_action`
- `pnpm run check`
- `git diff --check`

## Dev Agent Record

### Agent Model Used

GPT-5.5

### Debug Log References

- Focused routing suite: `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q` passed, 15 tests.
- Focused managed-action coverage: `uv run --directory services/supervisor pytest tests/integration/test_supervisor_flow.py -q -k managed_next_action` passed, 1 test selected / 31 deselected.
- Full project check: `pnpm run check` passed, including dashboard build and 47 supervisor tests.
- Whitespace check: `git diff --check` passed with only the existing CRLF normalization warning from Git.

### Completion Notes List

- Added an explicit guarded utility authority option to the deterministic routing preview service without changing default route previews.
- Recorded `routing.utility_execution_authorized` before the supervisor executes the deterministic `supervisor_triage` managed action.
- Kept implementation-oriented managed actions, local model workers, subscription agents, and fleet dashboard behavior out of scope.

### File List

- services/supervisor/src/supervisor/domain/routing.py
- services/supervisor/src/supervisor/application/service.py
- services/supervisor/tests/integration/test_routing_preview.py
- services/supervisor/tests/integration/test_supervisor_flow.py
- docs/stories/1-6-guarded-utility-routing-for-managed-actions.md

## Change Log

- 2026-06-08: Story created for the first guarded utility routing execution slice.
- 2026-06-08: Implemented guarded utility routing for deterministic supervisor triage and added focused tests.
- 2026-06-08: Ran focused and full verification; moved story status to done.
