---
story: "1.12"
title: "Worker Capability And Health Registry"
status: done
completed: 2026-06-08
---

# Story 1.12: Worker Capability And Health Registry

## Summary

Implemented a read-only static worker capability and health registry for Kendall_vNxt supervisor dynamic routing. The registry exposes worker lane readiness without launching workers, probing local model servers, calling cloud providers, or mutating workflow state.

## Scope Completed

- Added provider-neutral registry domain types in `worker_registry.py`.
- Added static registry entries for:
  - `utility.internal`
  - `local.readonly.mock`
  - `subscription.handoff`
  - `premium.approval`
- Marked `utility.internal` online for the implemented guarded utility adapter.
- Marked future local/subscription/premium entries disabled with explicit disabled reasons.
- Added `GET /routing/worker-registry`.
- Added `WorkerRegistryEntryView` API and TypeScript contracts.
- Added integration coverage proving endpoint shape, disabled worker evidence, and non-mutating reads.

## Safety Boundaries

- No external command execution.
- No local model calls.
- No subscription-agent launch.
- No premium model execution.
- No work-item or workflow-event mutation from registry reads.
- No credentials required.

## Verification

- Focused: `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q -k "worker_registry"` passed, 1 test.
- Routing integration: `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q` passed, 25 tests, 1 aiosqlite warning.
- Workspace check: `pnpm run check` passed. Dashboard build succeeded and supervisor tests passed, 58 tests, 1 aiosqlite warning.

## Files Changed

- `docs/stories/1-12-worker-capability-health-registry.md`
- `_bmad-output/implementation-artifacts/1-12-worker-capability-health-registry.md`
- `packages/contracts/src/api.ts`
- `services/supervisor/src/supervisor/api/main.py`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/src/supervisor/domain/worker_registry.py`
- `services/supervisor/tests/integration/test_routing_preview.py`

