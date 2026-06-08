# Story 1.8: Local Read-Only Evidence Explanations

Status: done

## Story

As a Kendall_vNxt operator,
I want local read-only routes to produce evidence explanations,
so that analysis-oriented routing decisions create useful local artifacts without granting write or execution authority.

## Acceptance Criteria

1. The supervisor exposes a backend endpoint that creates a structured evidence explanation for a work item route that selects `local_readonly`.
2. The explanation includes work item identity, task kind, route decision, summary, evidence items, boundaries, next-step suggestions, and a flag showing that file writes and command execution are not allowed.
3. Explanation generation is non-mutating by default and does not enqueue work, run commands, launch models, write files, or alter work-item state.
4. Explanation generation can optionally record a workflow event with concise explanation metadata when explicitly requested.
5. Requests for non-`local_readonly` routes are rejected clearly instead of producing a misleading read-only explanation.
6. Focused integration tests cover non-mutating explanation generation, event recording, and non-read-only rejection.
7. Existing broader checks remain green.

## Tasks / Subtasks

- [x] Add local evidence explanation request/response schemas and shared contract types. (AC: 1, 2)
- [x] Add supervisor service logic to derive explanations from local read-only routes and recent workflow evidence. (AC: 2, 3, 5)
- [x] Add the API endpoint with existing envelope/error conventions. (AC: 1, 4, 5)
- [x] Add focused supervisor integration tests. (AC: 3, 4, 5, 6)
- [x] Run focused and broader verification. (AC: 7)

## Dev Notes

This is a dynamic-routing follow-on after Story 1.7. It should turn the `local_readonly` route into a deterministic local explanation artifact without invoking Ollama, LM Studio, vLLM, llama.cpp, subscription agents, premium models, or command execution.

This story is backend/API only. It should not add dashboard UI or a worker fleet surface.

Relevant files:

- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/api/main.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`
- `packages/contracts/src/api.ts`

## Verification

- `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q -k evidence_explanation`
- `pnpm run check`
- `git diff --check`

## Dev Agent Record

### Agent Model Used

GPT-5.5

### Debug Log References

- Focused local evidence subset: `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q -k evidence_explanation` passed, 3 selected / 18 deselected.
- Full routing suite: `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q` passed, 21 tests.
- Full project check: `pnpm run check` passed, including dashboard build and 53 supervisor tests.
- Whitespace check: `git diff --check` passed with only existing CRLF normalization warnings from Git.

### Completion Notes List

- Added local read-only evidence explanation schemas and shared TypeScript contract types.
- Added `POST /work-items/{id}/local-evidence-explanation`, which generates explanations only for routes that select `local_readonly`.
- Explanation generation is non-mutating by default, can explicitly record `routing.local_evidence_explained`, and keeps file writes and command execution disabled.
- Added focused coverage for non-mutating generation, event recording, and non-read-only rejection.

### File List

- services/supervisor/src/supervisor/api/schemas.py
- services/supervisor/src/supervisor/api/main.py
- services/supervisor/src/supervisor/application/service.py
- services/supervisor/tests/integration/test_routing_preview.py
- packages/contracts/src/api.ts
- docs/stories/1-8-local-readonly-evidence-explanations.md

## Change Log

- 2026-06-08: Story created for structured local read-only evidence explanations.
- 2026-06-08: Implemented backend local evidence explanation generation, optional event recording, contract types, and focused tests; moved story status to done.
