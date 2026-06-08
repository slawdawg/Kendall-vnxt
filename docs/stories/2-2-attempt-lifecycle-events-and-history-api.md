---
baseline_commit: e57fa2b
---

# Story 2.2: Attempt Lifecycle Events And History API

Status: done

## Story

As the Kendall_vNxt operator,
I want execution attempts to support explicit lifecycle transitions and auditable history,
so that future worker execution can be cancelled, completed, failed, or timed out in supervisor state before any real process launch, provider call, model call, or source mutation is enabled.

## Acceptance Criteria

1. Shared API vocabulary includes an execution attempt lifecycle transition request contract.
2. The supervisor supports lifecycle transitions for planned, approved, starting, running, cancel requested, cancelled, timed out, failed, completed, and rejected attempts without launching real workers.
3. Invalid lifecycle transitions are rejected with structured API errors.
4. Terminal attempts cannot be transitioned again.
5. Cancel-request recording stores cancellation reason, requesting actor, and timestamp evidence.
6. Timeout, failure, completion, start, and heartbeat metadata are recorded when their lifecycle statuses are applied.
7. Lifecycle transitions record stable workflow events that include attempt, work item, route decision, worker, lane, authority mode, previous status, current status, and no-execution safety flags.
8. Attempt history returns updated lifecycle status, timestamps, reasons, and event references.
9. Focused tests prove lifecycle behavior remains control-plane only: no process launch, local provider HTTP call, model API call, shell execution, or source mutation is enabled.
10. Existing execution attempt creation/history, routing preview, and broader supervisor checks continue to pass.

## Tasks / Subtasks

- [x] Add lifecycle transition contract types. (AC: 1)
  - [x] Add supervisor API request schema for transition target status, reason, and actor metadata.
  - [x] Mirror the request type in shared TypeScript contracts.
- [x] Add supervisor lifecycle behavior. (AC: 2, 3, 4, 5, 6, 8)
  - [x] Add deterministic allowed transition rules.
  - [x] Reject transitions from terminal attempts.
  - [x] Persist lifecycle timestamps and reason fields.
  - [x] Preserve updated event references on attempt history views.
- [x] Add supervisor API endpoint. (AC: 1, 3, 8)
  - [x] Add `POST /work-items/{work_item_id}/execution-attempts/{attempt_id}/lifecycle`.
  - [x] Return existing envelope/error patterns for missing work items, missing attempts, and invalid transitions.
- [x] Add workflow events. (AC: 7, 9)
  - [x] Record `execution_attempt.cancel_requested`, `execution_attempt.cancelled`, `execution_attempt.timed_out`, `execution_attempt.failed`, and `execution_attempt.completed` style events from lifecycle transitions.
  - [x] Include no-execution safety flags in lifecycle event payloads.
- [x] Add focused tests. (AC: 2, 3, 4, 5, 7, 8, 9, 10)
  - [x] Cancel-request and cancellation lifecycle path.
  - [x] Completion lifecycle path and active-attempt release.
  - [x] Rejected terminal-attempt transition rejection.
  - [x] Missing attempt handling.
- [x] Verify and update story trail. (AC: all)
  - [x] Run focused supervisor compile and execution-attempt tests.
  - [x] Run broader routing preview suite.
  - [x] Run workspace check.

## Dev Notes

Source artifacts:

- `docs/prds/supervisor-execution-authority-expansion.md`
- `docs/stories/2-1-execution-attempt-contract-and-state-model.md`
- `services/supervisor/src/supervisor/domain/types.py`
- `services/supervisor/src/supervisor/infrastructure/db/models.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/src/supervisor/api/main.py`
- `services/supervisor/src/supervisor/api/schemas.py`
- `packages/contracts/src/api.ts`
- `services/supervisor/tests/integration/test_routing_preview.py`

Implementation constraints:

- Do not spawn Codex, Claude, Gemini, Antigravity, or any CLI/subscription agent.
- Do not call Ollama, LM Studio, vLLM, llama.cpp, OpenAI-compatible local endpoints, or any model API.
- Do not add premium execution.
- Do not add shell command execution.
- Do not mutate source files as part of attempt lifecycle transitions.
- Do not add background runtime assistant behavior.
- Keep lifecycle support as supervisor-owned control-plane state only.

## Dev Agent Record

### Implementation Plan

- Add lifecycle transition request vocabulary in supervisor and shared contracts.
- Add validated supervisor transition behavior with terminal-state protection.
- Record lifecycle event evidence and update attempt event references.
- Add focused lifecycle integration coverage.
- Run focused and broader verification.

### Debug Log References

- `uv run --directory services/supervisor python -m compileall src/supervisor` - passed.
- `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q -k execution_attempt` - passed, 5 selected / 34 deselected, 1 existing aiosqlite warning.
- First parallel broad verification run: standalone routing preview suite and `pnpm run check` both hit the known local-readonly deterministic preview assertion from the prior handoff.
- `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q -k mock_local_readonly_worker_preview -vv` - passed, 1 selected / 38 deselected.
- Second parallel broad verification run: `pnpm run check` passed with dashboard build and 72 supervisor tests; parallel standalone routing preview still hit the same known local-readonly deterministic preview assertion.
- `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q` - passed, 39 tests, when run by itself after `pnpm run check`.
- `pnpm run check` - passed, dashboard build plus 72 supervisor tests.

### Completion Notes List

- Added non-executing lifecycle transition request contracts.
- Added `POST /work-items/{work_item_id}/execution-attempts/{attempt_id}/lifecycle`.
- Added deterministic transition validation with terminal-state protection.
- Lifecycle transitions update timestamps and reasons for cancel, timeout, failure, completion, start, and heartbeat metadata.
- Lifecycle transitions record workflow events with route, worker, status, actor, and no-execution safety evidence.
- Attempt history now reflects updated lifecycle state and appended lifecycle event references.

### File List

- `packages/contracts/src/api.ts`
- `services/supervisor/src/supervisor/api/main.py`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`
- `docs/stories/2-2-attempt-lifecycle-events-and-history-api.md`

## Change Log

- 2026-06-08: Created and implemented lifecycle transition story from Slice 2 of the Execution Authority Expansion PRD.
