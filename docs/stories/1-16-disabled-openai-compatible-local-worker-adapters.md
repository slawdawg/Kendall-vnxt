---
baseline_commit: 5479270
---

# Story 1.16: Disabled OpenAI-Compatible Local Worker Adapters

Status: done

## Story

As the Kendall_vNxt operator,
I want local OpenAI-compatible worker adapter definitions to exist in disabled/read-only mode,
so that Ollama, LM Studio, vLLM, and llama.cpp can be represented safely before any network calls or model execution are enabled.

## Acceptance Criteria

1. The supervisor defines OpenAI-compatible local worker provider definitions for Ollama, LM Studio, vLLM, and llama.cpp.
2. These provider definitions are disabled by default and do not perform HTTP calls, model calls, health probes, or credential reads.
3. The worker registry exposes the disabled provider-backed local workers with explicit disabled reasons.
4. The mock local read-only worker remains online and distinct from real provider-backed local workers.
5. Shared contracts do not require live local model configuration.
6. Integration tests prove provider-backed local workers are visible, disabled, and non-mutating.

## Tasks / Subtasks

- [x] Add disabled OpenAI-compatible provider definitions. (AC: 1, 2)
  - [x] Include Ollama, LM Studio, vLLM, and llama.cpp identifiers.
  - [x] Keep endpoints metadata-only and disabled.
- [x] Extend worker registry. (AC: 3, 4)
  - [x] Keep `local.readonly.mock` online.
  - [x] Add disabled real-provider local entries with reasons.
- [x] Add focused tests. (AC: 5, 6)
  - [x] Assert provider-backed entries are present and disabled.
  - [x] Assert registry reads remain non-mutating.
- [x] Verify and update story trail. (AC: all)
  - [x] Run focused tests.
  - [x] Run broader workspace verification.
  - [x] Update Dev Agent Record, File List, and Change Log.

## Dev Notes

Source artifacts:

- `docs/prds/supervisor-dynamic-routing-follow-on-roadmap.md`
- `docs/stories/1-15-mock-local-readonly-worker-adapter.md`

Implementation constraints:

- Do not add HTTP clients.
- Do not call local model servers.
- Do not probe ports.
- Do not require API keys or credentials.
- Do not enable local provider execution.

Recommended design:

- Add metadata-only provider definitions in a local worker domain module.
- Add disabled entries to `StaticWorkerRegistry`.

## Dev Agent Record

### Implementation Plan

- Add disabled provider definitions.
- Extend static registry entries.
- Update tests and verification trail.

### Debug Log References

- Focused: `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q -k "worker_registry or mock_local_readonly"` passed, 2 tests, 1 aiosqlite warning.
- Workspace check: `pnpm run check` passed; dashboard build succeeded and supervisor tests passed, 60 tests, 1 aiosqlite warning.

### Completion Notes List

- Added disabled registry entries for Ollama, LM Studio, vLLM, and llama.cpp OpenAI-compatible local providers.
- Kept provider-backed local entries metadata-only with `provider_disabled`, `no_http_calls`, and `no_model_calls` permissions.
- Preserved `local.readonly.mock` as the only online local read-only worker.
- Added integration assertions for disabled provider visibility and non-mutating registry reads.

### File List

- `docs/stories/1-16-disabled-openai-compatible-local-worker-adapters.md`
- `_bmad-output/implementation-artifacts/1-16-disabled-openai-compatible-local-worker-adapters.md`
- `services/supervisor/src/supervisor/domain/worker_registry.py`
- `services/supervisor/tests/integration/test_routing_preview.py`

## Change Log

- 2026-06-08: Created story from routing follow-on roadmap after Story 1.15 completion.
- 2026-06-08: Implemented disabled OpenAI-compatible local provider registry entries; status moved to done.

