---
story: "1.16"
title: "Disabled OpenAI-Compatible Local Worker Adapters"
status: done
completed: 2026-06-08
---

# Story 1.16: Disabled OpenAI-Compatible Local Worker Adapters

## Summary

Added metadata-only disabled registry entries for OpenAI-compatible local providers. Ollama, LM Studio, vLLM, and llama.cpp are now visible to the supervisor worker registry as future local read-only providers without any HTTP calls, model calls, port probes, or credential requirements.

## Scope Completed

- Added disabled worker registry entries for:
  - `local.ollama.disabled`
  - `local.lmstudio.disabled`
  - `local.vllm.disabled`
  - `local.llamacpp.disabled`
- Preserved `local.readonly.mock` as the online local read-only worker.
- Added explicit disabled reasons and no-call permissions.
- Extended registry integration tests.

## Safety Boundaries

- No HTTP clients.
- No local model calls.
- No port probing.
- No credential reads.
- No provider execution.
- No workflow mutation from registry reads.

## Verification

- Focused: `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q -k "worker_registry or mock_local_readonly"` passed, 2 tests, 1 aiosqlite warning.
- Workspace check: `pnpm run check` passed. Dashboard build succeeded and supervisor tests passed, 60 tests, 1 aiosqlite warning.

## Files Changed

- `docs/stories/1-16-disabled-openai-compatible-local-worker-adapters.md`
- `_bmad-output/implementation-artifacts/1-16-disabled-openai-compatible-local-worker-adapters.md`
- `services/supervisor/src/supervisor/domain/worker_registry.py`
- `services/supervisor/tests/integration/test_routing_preview.py`

