---
story: "1.13"
title: "Routing Outcome Evidence For Guarded Attempts"
status: done
completed: 2026-06-08
---

# Story 1.13: Routing Outcome Evidence For Guarded Attempts

## Summary

Implemented structured routing outcome evidence for guarded utility attempts. The supervisor now records `routing.outcome_recorded` events after guarded utility worker results, giving future lane profiles and adaptive routing work an auditable evidence base.

## Scope Completed

- Added `routing.outcome_recorded` workflow events.
- Recorded outcomes for successful guarded `supervisor_triage`.
- Recorded outcomes for rejected guarded utility attempts before returning the managed-action 409.
- Extended lane evidence profiles with `outcomeCount`.
- Updated shared TypeScript contracts for lane profile outcome counts.
- Added integration tests for success outcome evidence, rejection outcome evidence, and profile aggregation.

## Outcome Event Fields

- `decisionId`
- `selectedLane`
- `authorityMode`
- `workerId`
- `functionId`
- `taskKind`
- `stepId`
- `attemptStatus`
- `validationStatus`
- `escalationReason`
- `avoidanceNote`
- `reasonCodes`

## Safety Boundaries

- No adaptive scoring.
- No external worker launch.
- No model calls.
- No dashboard fleet UI.
- No unrelated work-item mutation.

## Verification

- Focused: `uv run --directory services/supervisor pytest tests/integration/test_supervisor_flow.py -q -k "managed_next_action_executes_only_current_recipe_step or managed_next_action_records_rejected_utility_worker_attempt"` passed, 2 tests, 1 aiosqlite warning.
- Supervisor integration: `uv run --directory services/supervisor pytest tests/integration/test_supervisor_flow.py tests/integration/test_routing_preview.py -q` passed, 58 tests.
- Workspace check: `pnpm run check` passed. Dashboard build succeeded and supervisor tests passed, 58 tests, 1 aiosqlite warning.

## Files Changed

- `docs/stories/1-13-routing-outcome-evidence-for-guarded-attempts.md`
- `_bmad-output/implementation-artifacts/1-13-routing-outcome-evidence-for-guarded-attempts.md`
- `packages/contracts/src/api.ts`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_supervisor_flow.py`

