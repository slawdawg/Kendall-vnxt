# Story 3.10: Provider Fixtures And Ollama PRD Draft

## Status

Ready for Review

## Story

As the Kendall_vNxt operator,
I want provider-specific disabled fixtures and a draft Ollama enablement PRD,
so that local provider implementation starts from explicit endpoint, redaction, timeout, cancellation, retention, rollback, and dashboard requirements instead of generic OpenAI-compatible assumptions.

## Acceptance Criteria

1. Disabled provider proofs include provider-specific endpoint family, redaction, timeout, cancellation, and retention policy fields.
2. Ollama, LM Studio, vLLM, and llama.cpp each have distinct fixture policy evidence.
3. The dashboard readiness panel shows provider fixture policy evidence.
4. Focused tests prove all disabled provider proofs remain no-call and provider-specific.
5. Architecture documents the disabled provider fixture baseline.
6. A draft Ollama provider PRD defines gates, non-goals, endpoint policy, prompt/retention policy, future acceptance criteria, rollback, and open questions.
7. All current provider execution authority remains disabled.

## Implementation Notes

- Added `docs/architecture/kendall-vnxt-provider-disabled-fixtures-2026-06-08.md`.
- Added `docs/prds/local-provider-ollama-disabled-to-limited-execution.md` as draft/not approved.
- Expanded disabled provider proof contracts and dashboard rendering.
- Kept all provider call/access booleans false.

## Verification

- Focused disabled provider proof tests.
- Dashboard build.
- Full workspace check.
- `git diff --check`.

## Safety Gates Upheld

- No local or remote provider/model calls were added.
- No Ollama endpoint call was added.
- No process launch, command execution, source mutation, network access, credential access, premium execution, adaptive scoring, or background runtime assistant behavior was enabled.
