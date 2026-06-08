---
baseline_commit: a396f40
---

# Story 2.1: Execution Attempt Contract And State Model

Status: draft

## Story

As the Kendall_vNxt operator,
I want the supervisor to represent execution attempts as first-class non-executing state,
so that future worker execution can be planned, rejected, audited, and correlated to routing decisions before any real process launch, provider call, model call, or source mutation is enabled.

## Acceptance Criteria

1. Shared API vocabulary includes `ExecutionAttemptStatus`, `ExecutionAttemptView`, and an attempt creation request/response contract.
2. Supervisor persistence includes an `ExecutionAttempt` model/table that is separate from `QueueLease` and links to a work item.
3. Each attempt records `attemptId`, `workItemId`, `routeDecisionId`, `workerId`, lane, authority mode, status, requested actor, timestamps, rejection/failure reason, artifact references, and event references where available.
4. The supervisor can create a non-executing planned attempt from an existing work item and current routing decision when the selected worker/lane is eligible for this phase.
5. Attempt creation is rejected with structured evidence when no route decision can be produced or when the selected worker/lane is disabled for real execution.
6. One active execution attempt per work item is enforced for `planned`, `approved`, `starting`, `running`, and `cancel_requested` statuses.
7. Attempt creation and rejection record stable workflow events that include `attemptId`, `workItemId`, `routeDecisionId`, `workerId`, lane, and authority mode.
8. Work-item attempt history can be retrieved through a supervisor service/API path, even if the first dashboard surface is deferred.
9. Focused tests prove this story does not launch processes, call local provider HTTP endpoints, call model APIs, run shell commands, or mutate source files.
10. Existing routing preview, worker registry, local read-only packet, subscription handoff, premium approval, disabled subscription-agent launch stub, and dashboard routing behavior continue to work.

## Tasks / Subtasks

- [ ] Add shared execution attempt contract types. (AC: 1, 3)
  - [ ] Add status vocabulary for `planned`, `approved`, `starting`, `running`, `cancel_requested`, `cancelled`, `timed_out`, `failed`, `completed`, and `rejected`.
  - [ ] Add `ExecutionAttemptView` and creation payload types in `packages/contracts/src/api.ts`.
  - [ ] Mirror the API vocabulary in supervisor schemas.
- [ ] Add supervisor persistence for execution attempts. (AC: 2, 3, 6)
  - [ ] Add `ExecutionAttempt` to `services/supervisor/src/supervisor/infrastructure/db/models.py`.
  - [ ] Relate attempts to `WorkItem` without overloading `QueueLease`.
  - [ ] Store JSON-compatible artifact/event references for later export.
- [ ] Add supervisor service behavior. (AC: 4, 5, 6, 7, 8)
  - [ ] Create attempts from current routing preview data.
  - [ ] Select the worker from the current routing decision or registry-backed lane default.
  - [ ] Reject disabled execution lanes/workers as `rejected`, not as launched work.
  - [ ] Enforce one active attempt per work item.
  - [ ] Expose attempt history ordered by creation time.
- [ ] Add supervisor API endpoints. (AC: 1, 4, 5, 8)
  - [ ] Add a non-executing attempt creation endpoint under the work-item route namespace.
  - [ ] Add a work-item attempt history endpoint.
  - [ ] Return existing envelope/error patterns.
- [ ] Add workflow events. (AC: 7)
  - [ ] Record `execution_attempt.planned` for planned non-executing attempts.
  - [ ] Record `execution_attempt.rejected` when policy disables the selected worker/lane.
  - [ ] Include attempt, route, worker, lane, and authority identifiers in event payloads.
- [ ] Add focused tests. (AC: 4, 5, 6, 7, 8, 9, 10)
  - [ ] Planned-attempt happy path for the current safe eligible lane.
  - [ ] Rejected attempt for disabled subscription/local/premium execution lanes.
  - [ ] Missing work item and no-route/mismatched route behavior.
  - [ ] One-active-attempt invariant.
  - [ ] History endpoint returns planned/rejected attempts.
  - [ ] Existing routing suites still pass.
- [ ] Verify and update story trail. (AC: all)
  - [ ] Run focused supervisor tests.
  - [ ] Run the routing preview suite.
  - [ ] Run the appropriate broader workspace verification command.
  - [ ] Update Dev Agent Record, File List, and Change Log.

## Dev Notes

Source artifacts:

- `docs/prds/supervisor-execution-authority-expansion.md`
- `docs/prds/supervisor-execution-authority-expansion-decision-log.md`
- `docs/architecture/kendall-vnxt-overall-architecture.md`
- `docs/architecture/kendall-vnxt-current-gap-review-2026-06-08.md`
- `docs/architecture/kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md`
- `docs/prds/supervisor-dynamic-routing-follow-on-roadmap.md`
- `docs/stories/1-11-guarded-utility-worker-adapter-contract.md`
- `docs/stories/1-12-worker-capability-health-registry.md`
- `docs/stories/1-20-disabled-subscription-agent-launch-stub.md`

Current implementation context:

- Routing preview and route rationale already exist; do not create a second routing system.
- `services/supervisor/src/supervisor/domain/routing.py` owns route profiles, lanes, authority modes, route decisions, reason codes, and rejection codes.
- `services/supervisor/src/supervisor/domain/worker_registry.py` owns static worker capability/health entries and disabled provider metadata.
- `services/supervisor/src/supervisor/domain/utility_worker.py` owns the narrow guarded utility adapter contract.
- `services/supervisor/src/supervisor/infrastructure/db/models.py` currently has `WorkItem`, `WorkflowEvent`, `QueueLease`, `AuditEvent`, `SupervisorControl`, and `OperatorView`. Queue leases are not execution attempts.
- `services/supervisor/src/supervisor/application/service.py` already records routing preview, utility authorization, utility outcome, subscription handoff, premium approval, local evidence, and subscription launch-stub events.
- `packages/contracts/src/api.ts` already exposes routing, handoff, premium approval, local evidence, worker registry, override, work item, and workflow event views.
- Dashboard attempt evidence is intentionally deferred until backend attempt history exists.

Implementation constraints:

- Do not spawn Codex, Claude, Gemini, Antigravity, or any CLI/subscription agent.
- Do not call Ollama, LM Studio, vLLM, llama.cpp, OpenAI-compatible local endpoints, or any model API.
- Do not add premium execution.
- Do not add shell command execution.
- Do not mutate source files as part of attempt creation.
- Do not add background runtime assistant behavior.
- Do not treat queue lease `attempt_count` as execution attempt history.
- Do not rebuild existing routing preview, worker registry, fleet panel, local evidence packet, handoff, premium, or launch-stub behavior.
- Keep provider capability separate from provider permission.
- Keep all real execution disabled by default.

Recommended design:

- Add an `ExecutionAttemptStatus` enum close to the supervisor domain type patterns.
- Add an `ExecutionAttempt` SQLAlchemy model with a JSON field for `artifact_refs` and `event_refs` to avoid premature schema overfitting.
- Use supervisor-generated opaque attempt IDs.
- Use current routing preview creation to bind `routeDecisionId`, selected lane, authority mode, and selected worker.
- For the first eligible planned attempt, prefer a non-launching internal utility attempt representation only when current routing authority is guarded and worker is `utility.internal`.
- For disabled local provider, subscription-agent, and premium routes, persist a `rejected` attempt with a clear `rejectionReason` rather than returning only a transient error. This creates audit evidence without granting execution.
- Expose `POST /work-items/{work_item_id}/execution-attempts` and `GET /work-items/{work_item_id}/execution-attempts`, unless existing API naming patterns suggest a better route.
- Use workflow events `execution_attempt.planned` and `execution_attempt.rejected` for this slice. Save cancellation, heartbeat, timeout, and completion transitions for the next lifecycle story unless they are needed to keep the model coherent.

Testing notes:

- Prefer focused integration coverage in `services/supervisor/tests/integration/test_supervisor_flow.py` or a new focused execution-attempt integration test module if the existing files become too large.
- Keep tests deterministic and offline.
- Assert existing no-launch/no-call booleans remain false for disabled worker artifacts.
- Run at least:
  - `uv run --directory services/supervisor pytest tests/integration/test_supervisor_flow.py -q -k "execution_attempt or managed_next_action"`
  - `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q`
  - `pnpm run check`

## Dev Agent Record

### Implementation Plan

- Pending implementation.

### Debug Log References

- Pending implementation.

### Completion Notes List

- Pending implementation.

### File List

- Pending implementation.

## Change Log

- 2026-06-08: Created story from Execution Authority Expansion PRD and current architecture gap review.
