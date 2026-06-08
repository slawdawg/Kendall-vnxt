---
baseline_commit: b48c523
---

# Story 1.12: Worker Capability And Health Registry

Status: done

## Story

As the Kendall_vNxt operator,
I want the supervisor to expose a read-only worker capability and health registry,
so that dynamic routing can see available worker lanes before any real local model, subscription agent, or premium worker launch is enabled.

## Acceptance Criteria

1. The supervisor defines provider-neutral worker registry contracts for worker id, lane, adapter type, capabilities, permissions, health, queue depth, and disabled reason.
2. The registry includes static/fake workers for `utility.internal`, local read-only AI, subscription handoff, and premium approval.
3. The registry endpoint is read-only and does not launch workers, run commands, call local models, call cloud providers, mutate work items, or require credentials.
4. The utility worker entry reflects the implemented guarded utility adapter and reports online health.
5. Disabled/not-ready workers report explicit disabled reasons.
6. The supervisor exposes a GET endpoint for the registry using existing API envelope conventions.
7. Shared TypeScript contracts are updated for dashboard/client reuse.
8. Integration tests prove the endpoint shape, read-only behavior, and disabled worker evidence.

## Tasks / Subtasks

- [x] Add worker registry domain contract. (AC: 1, 2, 4, 5)
  - [x] Define worker lane, adapter type, capability, permission, and health dataclasses/enums.
  - [x] Add a static registry service with fake/disabled workers for future lanes.
  - [x] Keep `utility.internal` online and all future workers non-executing.
- [x] Add read-only supervisor API endpoint. (AC: 3, 6)
  - [x] Expose `GET /routing/worker-registry`.
  - [x] Use existing `ApiEnvelope` conventions.
  - [x] Do not mutate work items or workflow events.
- [x] Export shared contracts. (AC: 7)
  - [x] Add TypeScript worker registry view types.
- [x] Add focused tests. (AC: 3, 4, 5, 8)
  - [x] Assert registry includes `utility.internal` as online.
  - [x] Assert local/subscription/premium future entries are disabled or not-ready with reasons.
  - [x] Assert repeated reads do not create workflow events.
- [x] Verify and update story trail. (AC: all)
  - [x] Run focused supervisor tests.
  - [x] Run broader workspace verification.
  - [x] Update Dev Agent Record, File List, and Change Log.

## Dev Notes

Source artifacts:

- `docs/prds/supervisor-dynamic-routing-follow-on-roadmap.md`
- `docs/stories/1-11-guarded-utility-worker-adapter-contract.md`
- `_bmad-output/implementation-artifacts/1-11-guarded-utility-worker-adapter-contract.md`

Implementation constraints:

- Do not add process launch.
- Do not add model/provider calls.
- Do not add health probes that touch external services yet.
- Do not add dashboard fleet UI in this story.
- Keep the registry deterministic and testable.

Recommended design:

- Add `services/supervisor/src/supervisor/domain/worker_registry.py`.
- Add `SupervisorService.list_worker_registry()`.
- Add API schema `WorkerRegistryEntryView`.
- Add route `GET /routing/worker-registry`.
- Add contracts in `packages/contracts/src/api.ts`.

## Dev Agent Record

### Implementation Plan

- Add static registry contracts and mapping to API views.
- Add read-only endpoint.
- Add focused integration coverage.
- Verify with focused and broad checks.

### Debug Log References

- Focused: `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q -k "worker_registry"` passed, 1 test.
- Routing integration: `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q` passed, 25 tests, 1 aiosqlite warning.
- Workspace check: `pnpm run check` passed; dashboard build succeeded and supervisor tests passed, 58 tests, 1 aiosqlite warning.

### Completion Notes List

- Added a provider-neutral static worker registry domain model with adapter type, health, capability, permission, queue, and disabled-reason evidence.
- Added `GET /routing/worker-registry` as a read-only supervisor endpoint using existing API envelope conventions.
- Registered `utility.internal` as the online internal utility worker and represented future local, subscription handoff, and premium lanes as disabled/not-ready entries.
- Exported shared TypeScript registry contracts and added integration tests proving stable shape and non-mutating reads.

### File List

- `docs/stories/1-12-worker-capability-health-registry.md`
- `_bmad-output/implementation-artifacts/1-12-worker-capability-health-registry.md`
- `packages/contracts/src/api.ts`
- `services/supervisor/src/supervisor/api/main.py`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/src/supervisor/domain/worker_registry.py`
- `services/supervisor/tests/integration/test_routing_preview.py`

## Change Log

- 2026-06-08: Created story from routing follow-on roadmap after Story 1.11 completion.
- 2026-06-08: Implemented worker capability and health registry; status moved to done.

