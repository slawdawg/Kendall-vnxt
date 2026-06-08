---
story: "1.11"
title: "Guarded Utility Worker Adapter Contract"
status: done
completed: 2026-06-08
---

# Story 1.11: Guarded Utility Worker Adapter Contract

## Summary

Implemented the first provider-neutral utility worker boundary for Kendall_vNxt supervisor dynamic routing. Guarded `supervisor_triage` now passes through a deterministic internal utility adapter before advancing workflow state.

## Scope Completed

- Added `services/supervisor/src/supervisor/domain/utility_worker.py`.
- Defined immutable utility worker task and result dataclasses.
- Added `UtilityWorkerAdapter` with worker id `utility.internal`.
- Restricted the adapter to a tiny allowlist of deterministic internal function ids.
- Returned structured rejection results for non-allowlisted function ids.
- Routed guarded `supervisor_triage` through the adapter.
- Preserved existing `routing.utility_execution_authorized` behavior.
- Added `worker.utility_attempt_recorded` events for success and rejection.
- Preserved existing `supervisor_triage` workflow behavior.
- Avoided external shell execution, local model calls, subscription-agent launch, premium execution, and provider credentials.

## Event Evidence

Successful guarded utility attempts record:

- `workerId`
- `functionId`
- `stepId`
- `taskKind`
- `allowedPaths`
- `timeoutSeconds`
- `status`
- `failureReason`

Rejected attempts persist the same event shape with `status: rejected` and `failureReason: utility.function_not_allowlisted`.

## Verification

- Focused: `uv run --directory services/supervisor pytest tests/integration/test_supervisor_flow.py -q -k "managed_next_action_executes_only_current_recipe_step or managed_next_action_records_rejected_utility_worker_attempt"` passed, 2 tests, 1 aiosqlite warning.
- Supervisor integration: `uv run --directory services/supervisor pytest tests/integration/test_supervisor_flow.py tests/integration/test_routing_preview.py -q` passed, 57 tests.
- Workspace check: `pnpm run check` passed. Dashboard build succeeded and supervisor tests passed, 57 tests, with existing aiosqlite warnings.

## Files Changed

- `docs/stories/1-11-guarded-utility-worker-adapter-contract.md`
- `_bmad-output/implementation-artifacts/1-11-guarded-utility-worker-adapter-contract.md`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/src/supervisor/domain/utility_worker.py`
- `services/supervisor/tests/integration/test_supervisor_flow.py`

