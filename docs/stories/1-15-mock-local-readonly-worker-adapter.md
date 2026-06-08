---
baseline_commit: ab19e5a
---

# Story 1.15: Mock Local Read-Only Worker Adapter

Status: done

## Story

As the Kendall_vNxt operator,
I want a mock local read-only worker adapter that consumes evidence packets,
so that the supervisor can prove the local AI worker boundary before connecting Ollama, LM Studio, vLLM, llama.cpp, or other model servers.

## Acceptance Criteria

1. The supervisor defines a mock local read-only worker adapter contract with worker id, run id, packet id, status, summary, recommendations, and safety flags.
2. The mock adapter consumes `LocalEvidencePacketView` and returns deterministic output without model calls.
3. The mock adapter cannot write files, run commands, read arbitrary repo files, or call external providers.
4. The supervisor exposes a read-only preview endpoint using existing API envelope conventions.
5. The worker registry reports the mock local read-only worker as online while real provider-backed local adapters remain disabled.
6. Integration tests prove deterministic output, registry health, and non-mutating behavior.
7. Shared TypeScript contracts are updated.

## Tasks / Subtasks

- [x] Add mock local read-only worker contract. (AC: 1, 2, 3)
  - [x] Define deterministic result view.
  - [x] Add adapter that consumes evidence packets only.
- [x] Add read-only preview endpoint. (AC: 4)
  - [x] Expose `POST /work-items/{work_item_id}/local-readonly-worker-preview`.
  - [x] Do not record workflow events by default.
- [x] Update registry and shared contracts. (AC: 5, 7)
  - [x] Mark `local.readonly.mock` online.
  - [x] Keep real local provider adapters disabled/not configured.
- [x] Add focused tests. (AC: 3, 6)
  - [x] Assert deterministic mock output.
  - [x] Assert registry health for mock local worker.
  - [x] Assert no item/event mutation.
- [x] Verify and update story trail. (AC: all)
  - [x] Run focused tests.
  - [x] Run broader workspace verification.
  - [x] Update Dev Agent Record, File List, and Change Log.

## Dev Notes

Source artifacts:

- `docs/prds/supervisor-dynamic-routing-follow-on-roadmap.md`
- `docs/stories/1-14-local-readonly-evidence-packet-contract.md`

Implementation constraints:

- Do not connect real local model servers.
- Do not add OpenAI-compatible clients yet.
- Do not execute commands.
- Do not write files.
- Do not record workflow events by default.

Recommended design:

- Add `services/supervisor/src/supervisor/domain/local_readonly_worker.py`.
- Add `LocalReadonlyWorkerPreviewView`.
- Use the existing evidence packet endpoint/service helper as the boundary input.

## Dev Agent Record

### Implementation Plan

- Add deterministic mock adapter.
- Add service/route preview.
- Update worker registry and contracts.
- Verify focused and broad checks.

### Debug Log References

- Focused: `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q -k "worker_registry or mock_local_readonly"` passed, 2 tests.
- Workspace check: `pnpm run check` passed; dashboard build succeeded and supervisor tests passed, 60 tests, 1 aiosqlite warning.

### Completion Notes List

- Added deterministic `MockLocalReadonlyWorkerAdapter` consuming evidence packet metadata only.
- Added `POST /work-items/{work_item_id}/local-readonly-worker-preview` as a non-mutating preview endpoint.
- Added `LocalReadonlyWorkerPreviewView` Python and TypeScript contracts.
- Marked `local.readonly.mock` online in the worker registry while provider-backed local adapters remain unimplemented.

### File List

- `docs/stories/1-15-mock-local-readonly-worker-adapter.md`
- `_bmad-output/implementation-artifacts/1-15-mock-local-readonly-worker-adapter.md`
- `packages/contracts/src/api.ts`
- `services/supervisor/src/supervisor/api/main.py`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/src/supervisor/domain/local_readonly_worker.py`
- `services/supervisor/src/supervisor/domain/worker_registry.py`
- `services/supervisor/tests/integration/test_routing_preview.py`

## Change Log

- 2026-06-08: Created story from routing follow-on roadmap after Story 1.14 completion.
- 2026-06-08: Implemented mock local read-only worker adapter; status moved to done.

