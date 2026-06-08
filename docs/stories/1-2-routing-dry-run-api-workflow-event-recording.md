---
baseline_commit: 55c24f09a58bb5ec968ec1d487f03d84b1b77022
---
# Story 1.2: Routing Dry-Run API And Workflow Event Recording

Status: done

## Story

As a Kendall_vNxt operator,
I want to explicitly request routing dry-runs and optionally save the decision to work-item history,
so that routing decisions become inspectable audit evidence without changing execution behavior.

## Acceptance Criteria

1. The supervisor exposes a dry-run routing endpoint that accepts a work item id plus optional step id and task kind override.
2. The dry-run response includes both the `RoutingProfile` snapshot and `RoutingDecision` payload using existing `ApiEnvelope` conventions.
3. Dry-run preview without event recording must not create workflow events, enqueue work, spawn workers, run commands, alter workflow state, or mutate delivery state.
4. The request may explicitly ask to record the routing preview as a workflow event.
5. Recorded routing workflow events must include selected lane, authority mode, confidence score/band, reason codes, rejected lanes, escalation path, task kind, step id, and permission summary.
6. Recorded routing workflow events must appear in the existing `/work-items/{id}/events` history flow.
7. Existing read-only `GET /work-items/{id}/routing-preview` behavior remains non-mutating.
8. Supervisor tests cover no-record dry-run non-mutation, explicit event recording, event payload shape, missing work-item errors, and preservation of existing checks.

## Tasks / Subtasks

- [x] Add dry-run request schema. (AC: 1, 2, 4)
  - [x] Add a Pydantic request model in `services/supervisor/src/supervisor/api/schemas.py`.
  - [x] Include `stepId: str | None`, `taskKind: str | None`, and `recordEvent: bool = False`.
  - [x] Keep response shape as the existing `RoutingPreviewView` inside `ApiEnvelope`.

- [x] Add explicit dry-run route. (AC: 1, 2, 3, 4, 7)
  - [x] Add `POST /work-items/{work_item_id}/routing-preview` alongside the existing read-only GET endpoint.
  - [x] Return `work_item_not_found` for missing work items.
  - [x] Do not run commands, workers, model adapters, or remote preflight checks.
  - [x] Preserve GET as preview-only and non-mutating.

- [x] Add optional workflow event recording. (AC: 4, 5, 6)
  - [x] Add supervisor service support for recording a routing event only when `recordEvent` is true.
  - [x] Use the existing `_record_event` helper so events appear through `/work-items/{id}/events`.
  - [x] Use a stable event type such as `routing.preview_recorded`.
  - [x] Payload must include selected lane, authority mode, confidence score/band, reason codes, rejected lanes, escalation path, task kind, step id, and permission summary.
  - [x] Recording the event must not alter workflow state, delivery readiness, branch metadata, or execute actions.

- [x] Support explicit step/task override. (AC: 1, 2)
  - [x] If `taskKind` is provided, validate it against the routing `TaskKind` enum.
  - [x] If `stepId` is provided, use it in the profile snapshot and decision.
  - [x] If no override is provided, derive profile from recipe gate audit / next managed action as Story 1.1 does.

- [x] Add focused tests. (AC: 3, 5, 6, 7, 8)
  - [x] Test POST dry-run without `recordEvent` returns profile/decision and does not add events.
  - [x] Test POST dry-run with `recordEvent: true` creates exactly one routing event visible in work-item history.
  - [x] Test routing event payload includes the required decision summary fields.
  - [x] Test explicit task kind and step id override affect the returned profile.
  - [x] Test GET remains non-mutating.

## Dev Notes

### Product Context

Story 1.1 completed the supervisor-local routing contract and deterministic preview service. This story is Slice 2 from the routing PRD: dry-run API and workflow event shape. It should make route decisions explicitly requestable and optionally auditable, while preserving the MVP rule that routing cannot control real execution yet. [Source: docs/prds/supervisor-dynamic-routing-mvp-1.md]

### Existing Code To Reuse

- `services/supervisor/src/supervisor/domain/routing.py` owns `RoutingProfile`, `RoutingDecision`, `TaskKind`, and `RoutingPreviewService`.
- `services/supervisor/src/supervisor/api/schemas.py` already contains `RoutingProfileView`, `RoutingDecisionView`, `RejectedRoutingLaneView`, and `RoutingPreviewView`.
- `services/supervisor/src/supervisor/api/main.py` already exposes non-mutating `GET /work-items/{work_item_id}/routing-preview`.
- `services/supervisor/src/supervisor/application/service.py` already derives routing profiles from recipe gate audit / next managed action with preview-only guards.
- `services/supervisor/tests/integration/test_routing_preview.py` is the focused routing integration suite and should receive this story's tests.

### Implementation Guardrails

- Do not add dashboard UI in this story.
- Do not export routing contracts through `packages/contracts` yet.
- Do not add worker adapters or provider configuration.
- Do not run subprocesses, remote delivery preflight, model calls, or recipe commands from routing preview.
- Event recording is the only allowed mutation and only when explicitly requested with `recordEvent: true`.
- Keep event payload compact and free of secrets or raw prompt/log content.
- Preserve existing workflow state, delivery readiness, branch metadata, and action transitions.

### Verification

Minimum verification:

- `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q`
- `uv run --directory services/supervisor pytest tests/integration/test_supervisor_flow.py tests/integration/test_routing_preview.py -q`
- `pnpm run check`
- `git diff --check`

### References

- [Source: docs/prds/supervisor-dynamic-routing-mvp-1.md]
- [Source: docs/prds/supervisor-dynamic-routing-mvp-1-decision-log.md]
- [Source: _bmad-output/implementation-artifacts/1-1-supervisor-routing-contract-preview-service.md]
- [Source: services/supervisor/src/supervisor/domain/routing.py]
- [Source: services/supervisor/src/supervisor/application/service.py]
- [Source: services/supervisor/src/supervisor/api/main.py]
- [Source: services/supervisor/src/supervisor/api/schemas.py]
- [Source: services/supervisor/tests/integration/test_routing_preview.py]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Implementation Plan

- Added explicit POST dry-run request handling alongside the existing non-mutating GET preview endpoint.
- Added request overrides for step id and routing task kind with enum validation.
- Added optional outing.preview_recorded workflow event recording only when ecordEvent is true.
- Added integration tests for non-mutating dry-run, event payload shape, explicit overrides, missing work item handling, and GET preservation.

### Debug Log References

- Red test: uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q failed with 405 responses for POST routing preview.
- Focused green: uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q passed, 12 tests, 1 aiosqlite deprecation warning.
- Regression: uv run --directory services/supervisor pytest tests/integration/test_supervisor_flow.py tests/integration/test_routing_preview.py -q passed, 44 tests.
- Full check: pnpm run check passed, including preflight, dashboard build, and supervisor tests.
- Diff hygiene: git diff --check passed.


### Completion Notes List

- Implemented WorkItemRoutingPreviewRequest with optional stepId, 	askKind, and ecordEvent.
- Added POST /work-items/{work_item_id}/routing-preview while preserving existing GET preview behavior.
- Added explicit routing event recording through existing workflow event history only when requested.
- Kept routing dry-runs preview-only: no worker launch, command execution, remote preflight, workflow transition, delivery mutation, or branch mutation.


### File List

- services/supervisor/src/supervisor/api/main.py
- services/supervisor/src/supervisor/api/schemas.py
- services/supervisor/src/supervisor/application/service.py
- services/supervisor/tests/integration/test_routing_preview.py
- _bmad-output/implementation-artifacts/1-2-routing-dry-run-api-workflow-event-recording.md
- docs/stories/1-2-routing-dry-run-api-workflow-event-recording.md


## Change Log

- 2026-06-08: Implemented Story 1.2 dry-run API and optional routing workflow event recording; status moved to done.
