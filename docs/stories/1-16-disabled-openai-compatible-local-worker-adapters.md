---
baseline_commit: 5479270
---

# Story 1.16: Disabled OpenAI-Compatible Local Worker Adapters

Status: in-progress

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

- [ ] Add disabled OpenAI-compatible provider definitions. (AC: 1, 2)
  - [ ] Include Ollama, LM Studio, vLLM, and llama.cpp identifiers.
  - [ ] Keep endpoints metadata-only and disabled.
- [ ] Extend worker registry. (AC: 3, 4)
  - [ ] Keep `local.readonly.mock` online.
  - [ ] Add disabled real-provider local entries with reasons.
- [ ] Add focused tests. (AC: 5, 6)
  - [ ] Assert provider-backed entries are present and disabled.
  - [ ] Assert registry reads remain non-mutating.
- [ ] Verify and update story trail. (AC: all)
  - [ ] Run focused tests.
  - [ ] Run broader workspace verification.
  - [ ] Update Dev Agent Record, File List, and Change Log.

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

- Pending.

### Completion Notes List

- Pending.

### File List

- Pending.

## Change Log

- 2026-06-08: Created story from routing follow-on roadmap after Story 1.15 completion.

