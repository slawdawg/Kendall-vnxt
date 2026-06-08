---
baseline_commit: 71cba10
---

# Story 1.13: Routing Outcome Evidence For Guarded Attempts

Status: done

## Story

As the Kendall_vNxt operator,
I want guarded route-controlled attempts to record structured routing outcome evidence,
so that future lane profiles, escalation decisions, and adaptive routing can learn from auditable history instead of hidden behavior.

## Acceptance Criteria

1. The supervisor records a `routing.outcome_recorded` workflow event for guarded utility attempts.
2. Outcome events include decision id, selected lane, authority mode, worker id, function id, task kind, step id, attempt status, validation status, escalation reason, and avoidance note.
3. Successful guarded `supervisor_triage` records an outcome event without changing existing workflow behavior.
4. Rejected guarded utility attempts record an outcome event before returning the managed-action policy error.
5. Lane evidence profiles include a routing outcome count per lane.
6. The outcome event does not launch workers, run external commands, call models, or mutate unrelated work-item state.
7. Shared TypeScript contracts are updated for the lane profile outcome count.
8. Integration tests prove success, rejection, and lane-profile aggregation.

## Tasks / Subtasks

- [x] Add routing outcome event recording. (AC: 1, 2, 3, 4, 6)
  - [x] Record outcome after each guarded utility worker result.
  - [x] Include stable fields for future routing analysis.
  - [x] Preserve existing managed action behavior.
- [x] Extend lane evidence profiles. (AC: 5, 7)
  - [x] Count `routing.outcome_recorded` by selected lane.
  - [x] Add shared API contract field.
- [x] Add focused integration tests. (AC: 3, 4, 5, 8)
  - [x] Assert success outcome event payload.
  - [x] Assert rejection outcome event payload persists before 409.
  - [x] Assert lane profile outcome count.
- [x] Verify and update story trail. (AC: all)
  - [x] Run focused tests.
  - [x] Run broader workspace verification.
  - [x] Update Dev Agent Record, File List, and Change Log.

## Dev Notes

Source artifacts:

- `docs/prds/supervisor-dynamic-routing-follow-on-roadmap.md`
- `docs/stories/1-11-guarded-utility-worker-adapter-contract.md`
- `docs/stories/1-12-worker-capability-health-registry.md`

Implementation constraints:

- Do not add adaptive scoring yet.
- Do not add dashboard fleet UI.
- Do not add external worker execution.
- Keep outcome evidence deterministic and auditable.

Recommended design:

- Reuse `RoutingDecision` and `UtilityWorkerResult`.
- Add a small service helper that records `routing.outcome_recorded`.
- Extend `_ROUTING_PROFILE_EVENT_TYPES` and lane profile counts.

## Dev Agent Record

### Implementation Plan

- Add outcome recording helper.
- Wire guarded utility success and rejection paths.
- Extend lane profile aggregation and contracts.
- Verify focused and broad checks.

### Debug Log References

- Focused: `uv run --directory services/supervisor pytest tests/integration/test_supervisor_flow.py -q -k "managed_next_action_executes_only_current_recipe_step or managed_next_action_records_rejected_utility_worker_attempt"` passed, 2 tests, 1 aiosqlite warning.
- Supervisor integration: `uv run --directory services/supervisor pytest tests/integration/test_supervisor_flow.py tests/integration/test_routing_preview.py -q` passed, 58 tests.
- Workspace check: `pnpm run check` passed; dashboard build succeeded and supervisor tests passed, 58 tests, 1 aiosqlite warning.

### Completion Notes List

- Added `routing.outcome_recorded` events for guarded utility success and rejection paths.
- Outcome payloads include decision, lane, authority, worker, function, task, step, status, validation, escalation, avoidance, and reason-code evidence.
- Extended lane evidence profiles and shared contracts with `outcomeCount`.
- Added integration assertions for success, rejection persistence before 409, and lane-profile aggregation.

### File List

- `docs/stories/1-13-routing-outcome-evidence-for-guarded-attempts.md`
- `_bmad-output/implementation-artifacts/1-13-routing-outcome-evidence-for-guarded-attempts.md`
- `packages/contracts/src/api.ts`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_supervisor_flow.py`

## Change Log

- 2026-06-08: Created story from routing follow-on roadmap after Story 1.12 completion.
- 2026-06-08: Implemented routing outcome evidence for guarded utility attempts; status moved to done.

