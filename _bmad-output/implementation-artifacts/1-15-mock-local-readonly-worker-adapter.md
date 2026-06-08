---
story: "1.15"
title: "Mock Local Read-Only Worker Adapter"
status: done
completed: 2026-06-08
---

# Story 1.15: Mock Local Read-Only Worker Adapter

## Summary

Implemented a deterministic mock local read-only worker adapter that consumes the local evidence packet contract. This proves the local worker boundary before any real Ollama, LM Studio, vLLM, llama.cpp, or OpenAI-compatible local server integration is enabled.

## Scope Completed

- Added `MockLocalReadonlyWorkerAdapter`.
- Added `LocalReadonlyWorkerPreviewView`.
- Added `POST /work-items/{work_item_id}/local-readonly-worker-preview`.
- Marked `local.readonly.mock` online in the worker registry.
- Kept provider-backed local workers unimplemented and uncalled.
- Added integration coverage for deterministic output, registry health, and non-mutating behavior.

## Safety Boundaries

- No real model calls.
- No external provider calls.
- No shell commands.
- No file writes.
- No arbitrary repo reads.
- No workflow event recording by default.

## Verification

- Focused: `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q -k "worker_registry or mock_local_readonly"` passed, 2 tests.
- Workspace check: `pnpm run check` passed. Dashboard build succeeded and supervisor tests passed, 60 tests, 1 aiosqlite warning.

## Files Changed

- `docs/stories/1-15-mock-local-readonly-worker-adapter.md`
- `_bmad-output/implementation-artifacts/1-15-mock-local-readonly-worker-adapter.md`
- `packages/contracts/src/api.ts`
- `services/supervisor/src/supervisor/api/main.py`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/src/supervisor/domain/local_readonly_worker.py`
- `services/supervisor/src/supervisor/domain/worker_registry.py`
- `services/supervisor/tests/integration/test_routing_preview.py`

