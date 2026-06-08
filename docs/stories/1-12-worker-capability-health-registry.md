---
baseline_commit: b48c523
---

# Story 1.12: Worker Capability And Health Registry

Status: in-progress

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

- [ ] Add worker registry domain contract. (AC: 1, 2, 4, 5)
  - [ ] Define worker lane, adapter type, capability, permission, and health dataclasses/enums.
  - [ ] Add a static registry service with fake/disabled workers for future lanes.
  - [ ] Keep `utility.internal` online and all future workers non-executing.
- [ ] Add read-only supervisor API endpoint. (AC: 3, 6)
  - [ ] Expose `GET /routing/worker-registry`.
  - [ ] Use existing `ApiEnvelope` conventions.
  - [ ] Do not mutate work items or workflow events.
- [ ] Export shared contracts. (AC: 7)
  - [ ] Add TypeScript worker registry view types.
- [ ] Add focused tests. (AC: 3, 4, 5, 8)
  - [ ] Assert registry includes `utility.internal` as online.
  - [ ] Assert local/subscription/premium future entries are disabled or not-ready with reasons.
  - [ ] Assert repeated reads do not create workflow events.
- [ ] Verify and update story trail. (AC: all)
  - [ ] Run focused supervisor tests.
  - [ ] Run broader workspace verification.
  - [ ] Update Dev Agent Record, File List, and Change Log.

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

- Pending.

### Completion Notes List

- Pending.

### File List

- Pending.

## Change Log

- 2026-06-08: Created story from routing follow-on roadmap after Story 1.11 completion.

