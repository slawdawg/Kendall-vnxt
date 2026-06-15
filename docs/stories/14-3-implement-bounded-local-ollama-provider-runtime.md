---
baseline_commit: 0ac467c3874198e20d6b1dbcf8785243774d7377
---

# Story 14.3: Implement Bounded Local Ollama Provider Runtime

Status: done

## Story

As Bob,
I want the local Ollama provider call path to require an exact approval instance before it can execute,
so that Kendall_Nxt can use the approved VM-to-host Ollama boundary without weakening metadata-only retention, endpoint/model limits, or rollback stop lines.

## Acceptance Criteria

1. Given local-provider gates are configured for the approved endpoint/model, when a local evidence explanation request omits an accepted local-provider approval instance, then the supervisor does not call Ollama and records/returns metadata-only rejection evidence.
2. Given a local evidence explanation request includes an exact approval instance, when the broad gate, Ollama gate, endpoint, model, prompt-source id, prompt template id, redaction policy, timeout/cancellation policy, retained evidence policy, rollback path, stop lines, and expiry/review point match the approval packet, then the supervisor may call the existing `OllamaProviderAdapter` once.
3. Given the approval instance is stale, expired, mismatched, underspecified, or names any unapproved endpoint/model, when the request is handled, then the supervisor rejects the provider call and preserves only metadata-only rejection evidence.
4. Given Ollama returns, fails, times out, or is cancelled, when the attempt is represented in API/event evidence, then raw prompt text, raw completion text, reasoning text, provider payloads, credentials, and external session data are not retained.
5. Given this story enables only the bounded local-provider runtime path, when implementation completes, then it does not enable LM Studio, vLLM, llama.cpp, remote providers, premium providers, process launch, worker launch, source mutation, cleanup, PR delivery, issue sync, or failed-check bypass.
6. Given verification runs, then focused provider tests pass and `pnpm.cmd run check:provider-fixtures` passes.

## Tasks / Subtasks

- [x] Add exact approval instance contract to local evidence explanation. (AC: 1, 2, 3)
  - [x] Extend the request schema/contracts with local-provider approval fields.
  - [x] Require exact local-provider authority family and approved endpoint/model.
  - [x] Require prompt-source id, prompt template id, redaction, timeout/cancellation, retained evidence, operator, rollback, stop lines, and expiry/review point.
  - [x] Reject expired or mismatched approvals before the adapter call.
- [x] Enforce approval binding before provider execution. (AC: 1, 2, 3)
  - [x] Keep disabled/default behavior unchanged when gates are off.
  - [x] Keep gate checks for broad local provider, Ollama-specific provider, exact endpoint, and exact model.
  - [x] Call `OllamaProviderAdapter.explain` at most once and only after both gates and approval binding pass.
  - [x] Return metadata-only rejection evidence when approval binding fails.
- [x] Preserve metadata-only provider attempt evidence. (AC: 4)
  - [x] Include approval id/status and rejection reason metadata without raw prompt/completion/provider payloads.
  - [x] Preserve timeout, cancellation, failed, and completed terminal metadata from the existing adapter.
  - [x] Record event evidence only when `recordEvent` is true.
- [x] Add/adjust tests. (AC: 1, 2, 3, 4, 5)
  - [x] Test no approval means no adapter call even when gates are configured.
  - [x] Test exact approval allows one adapter call with metadata-only result.
  - [x] Test mismatched endpoint/model or expired approval is rejected.
  - [x] Test event payload excludes raw prompt/completion/reasoning/provider payload text.
- [x] Verify scoped provider checks. (AC: 6)
  - [x] Run focused supervisor provider tests.
  - [x] Run `pnpm.cmd run check:provider-fixtures`.

### Review Findings

- [x] [Review][Patch] Exact approval binding accepts arbitrary non-empty redaction, rollback, and stop-line text [services/supervisor/src/supervisor/application/service.py:9692] — AC 2 requires the exact approval instance to bind redaction policy, rollback path, stop lines, and expiry/review point to the approval packet before the adapter may run. The validator now requires the metadata-only redaction policy, rollback text naming local-provider/Ollama gate disablement, and stop lines naming the approved endpoint, approved model, and raw prompt/completion/reasoning/provider-payload retention boundary.

## Dev Notes

This story is the first runtime step after the non-executing approval packet and drift checks. It should not create a new provider adapter. The existing `OllamaProviderAdapter` already performs the OpenAI-compatible call and returns metadata-only attempt data.

### Required First Reads

- `docs/goals/local-provider-execution-approval-packet-2026-06-13.md`
- `docs/stories/14-1-refresh-local-provider-execution-approval-packet.md`
- `docs/stories/14-2-pin-local-provider-approval-packet-to-drift-checks.md`
- `docs/stories/4-4-ollama-limited-provider-adapter-behind-disabled-defaults.md`
- `services/supervisor/src/supervisor/domain/ollama_provider_adapter.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/src/supervisor/api/schemas.py`
- `packages/contracts/src/api.ts`
- `services/supervisor/tests/integration/test_routing_preview.py`

### Existing Runtime Shape

- `OllamaProviderAdapter.explain(...)` builds the prompt, calls the configured endpoint, and returns `OllamaProviderResult`.
- `SupervisorService.get_local_evidence_explanation(...)` already computes local evidence and conditionally calls `self.ollama_provider_adapter.explain(...)` when `_ollama_provider_gate_state()["enabled"]` is true.
- `_ollama_provider_gate_state()` already requires:
  - `SUPERVISOR_ALLOW_LOCAL_PROVIDER_CALLS`,
  - `SUPERVISOR_ALLOW_OLLAMA_PROVIDER_CALLS`,
  - endpoint equal to `SUPERVISOR_OLLAMA_APPROVED_ENDPOINT_URL`,
  - model equal to `SUPERVISOR_OLLAMA_APPROVED_MODEL_ID`.

The missing runtime boundary is the exact approval instance. Add that before the adapter call; do not bypass or weaken existing gate checks.

### Approved Boundary

- Endpoint: `http://192.168.1.128:11434/v1/chat/completions`
- Model: `qwen3:14b`
- Connect timeout: 2 seconds
- Total timeout: 120 seconds
- Retention: metadata-only
- Rollback: disable local-provider and/or Ollama-specific gates

### Guardrails

- Do not discover endpoints or models.
- Do not broaden to LM Studio, vLLM, llama.cpp, remote providers, or premium providers.
- Do not retain raw prompt, completion, reasoning, or provider payload text.
- Do not read credentials, sessions, API keys, tokens, account settings, or MFA material.
- Do not launch processes or workers.
- Do not mutate source by worker, perform PR delivery, cleanup worktrees, delete branches, sync issues, or bypass failed checks.

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `C:\Users\slaw_dawg\Kendall_Nxt\services\supervisor\.venv\Scripts\python.exe -m pytest services\supervisor\tests\integration\test_routing_preview.py -q -k "ollama_local_evidence_explanation or ollama_provider_gate"` initially hit Windows sandbox temp access denial.
- Reran focused tests outside sandbox with worktree `PYTHONPATH` pinned after discovering the shared venv editable install pointed at the main checkout.
- `pnpm.cmd run check:provider-fixtures` passed.
- `pnpm.cmd run check` first failed because the isolated worktree lacked `services/supervisor/.venv`; `uv sync --directory services/supervisor` created the worktree venv.
- Final `pnpm.cmd run check` passed, including dashboard build and 199 supervisor tests.
- Code review patch verification passed with focused provider tests: 10 passed.
- Final post-review `pnpm.cmd run check` passed, including dashboard build and 200 supervisor tests.

### Completion Notes List

- Added `localProviderApproval` to local evidence explanation requests in Python and TypeScript contracts.
- Added approval binding validation for the local Ollama provider runtime path before `OllamaProviderAdapter.explain` can run.
- Missing, mismatched, expired, or underspecified approval instances now return metadata-only rejected provider attempt evidence without building or sending a provider prompt.
- Accepted exact approval instances preserve existing endpoint/model gates and annotate completed provider attempt metadata with approval id/status.
- Added integration coverage for missing approval rejection, exact approval execution, mismatched/expired approval rejection, and raw provider text exclusion from event evidence.
- Resolved code review finding by rejecting unsafe placeholder redaction, rollback, or stop-line approval text before adapter execution.

### File List

- `docs/stories/14-3-implement-bounded-local-ollama-provider-runtime.md`
- `docs/stories/index.md`
- `packages/contracts/src/api.ts`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`

### Change Log

- 2026-06-14: Created Story 14.3 for bounded local Ollama provider runtime execution behind exact approval binding.
- 2026-06-14: Implemented exact local-provider approval binding, metadata-only rejection evidence, contract updates, and provider runtime tests.
- 2026-06-14: Addressed code review finding for unsafe placeholder approval text and added regression coverage.
