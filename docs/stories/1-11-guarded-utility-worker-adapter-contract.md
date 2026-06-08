---
baseline_commit: 7c23d74
---

# Story 1.11: Guarded Utility Worker Adapter Contract

Status: in-progress

## Story

As the Kendall_vNxt operator,
I want guarded utility-routed supervisor actions to pass through a small provider-neutral utility worker contract,
so that dynamic routing gains real execution evidence without opening arbitrary command execution or local AI/provider launch.

## Acceptance Criteria

1. The supervisor defines a utility worker task/request/result contract that is provider-neutral and does not depend on shell execution.
2. Guarded utility execution supports only a tiny allowlist of deterministic supervisor-owned function ids.
3. Non-allowlisted utility tasks are rejected before execution and return structured failure evidence.
4. The existing `supervisor_triage` managed action records a utility worker attempt event when guarded routing authorizes utility execution.
5. Utility attempt events include worker id, function id, step id, task kind, allowed paths, timeout, status, and failure reason when present.
6. The existing workflow behavior for `supervisor_triage` remains intact.
7. No local LLM, subscription agent, premium worker, external command, or arbitrary subprocess execution is introduced.
8. Focused integration tests prove both successful guarded utility attempt recording and rejection of a non-allowlisted task.

## Tasks / Subtasks

- [ ] Add utility worker domain contract. (AC: 1, 2, 3, 7)
  - [ ] Define immutable task and result dataclasses.
  - [ ] Add an allowlist-backed adapter that validates deterministic internal function ids.
  - [ ] Return structured rejection results instead of raising for policy denial.
- [ ] Route the existing guarded `supervisor_triage` authorization through the utility worker adapter. (AC: 4, 5, 6)
  - [ ] Preserve existing routing authorization event.
  - [ ] Record utility worker attempt evidence before the managed action advances workflow state.
  - [ ] Keep execution limited to existing supervisor-owned behavior.
- [ ] Add focused integration tests. (AC: 3, 4, 5, 6, 8)
  - [ ] Assert `supervisor_triage` records `worker.utility_attempt_recorded`.
  - [ ] Assert non-allowlisted utility work is rejected with structured failure evidence.
- [ ] Verify and update story trail. (AC: all)
  - [ ] Run focused supervisor tests.
  - [ ] Run broader workspace verification.
  - [ ] Update Dev Agent Record, File List, and Change Log.

## Dev Notes

Source artifacts:

- `docs/prds/supervisor-dynamic-routing-mvp-1.md`
- `docs/prds/supervisor-dynamic-routing-follow-on-roadmap.md`
- `docs/prds/supervisor-dynamic-routing-mvp-1-decision-log.md`
- `docs/stories/1-6-guarded-utility-routing-for-managed-actions.md`

Current implementation context:

- `services/supervisor/src/supervisor/domain/routing.py` owns route profiles, lanes, authority modes, and decisions.
- `services/supervisor/src/supervisor/application/service.py` records `routing.utility_execution_authorized` for `supervisor_triage` before the existing managed action advances state.
- `services/supervisor/tests/integration/test_supervisor_flow.py` already covers `supervisor_triage` managed next action behavior and the guarded utility routing event.

Implementation constraints:

- Do not add external command execution.
- Do not add local model/provider calls.
- Do not add worker process lifecycle management.
- Do not mutate unrelated workflow behavior.
- Keep the worker adapter deterministic and easy to test.
- Capability is not permission: the adapter must reject unsupported function ids even when the lane is `utility`.

Recommended design:

- Add `services/supervisor/src/supervisor/domain/utility_worker.py`.
- Model the first utility worker as an internal deterministic adapter with worker id `utility.internal`.
- Allow only `supervisor_triage` initially.
- Treat the adapter as an execution boundary and event source, not a shell runner.

## Dev Agent Record

### Implementation Plan

- Add red integration coverage for the utility attempt event and policy rejection.
- Implement a small allowlist-backed utility adapter.
- Wire guarded `supervisor_triage` through the adapter.
- Verify focused and broader checks before marking complete.

### Debug Log References

- Pending.

### Completion Notes List

- Pending.

### File List

- Pending.

## Change Log

- 2026-06-08: Created story from routing follow-on roadmap.

