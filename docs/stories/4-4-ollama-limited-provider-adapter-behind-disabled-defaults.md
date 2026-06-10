---
baseline_commit: c0688534e4eaeed2c15e19efd41d1d080213fbcb
---

# Story 4.4: Ollama Limited Provider Adapter Behind Disabled Defaults

## Status

Review

## Story

As the Kendall_vNxt operator,
I want an Ollama provider adapter implemented only after settings, redaction, retention, timeout, cancellation, dashboard, and rollback gates exist,
so that the first provider call is narrow, local, auditable, and reversible.

## Approval Required Before Implementation

Do not implement this story until the operator explicitly approves crossing into Ollama provider execution.

## Acceptance Criteria

1. Adapter calls only the approved local Ollama endpoint.
2. Adapter requires explicit provider-specific settings and configured model id.
3. Adapter uses the approved prompt construction contract.
4. Adapter applies timeout and cancellation policies.
5. Adapter stores only approved evidence and artifact references.
6. Dashboard clearly distinguishes enabled Ollama from disabled providers.
7. Rollback disables Ollama and returns registry/check evidence to disabled state.
8. Tests prove default disabled, enabled bounded behavior, timeout, cancellation, redaction, retention, and rollback.

## Safety Gates

- Implementation requires explicit approval before any provider call.
- No LM Studio, vLLM, llama.cpp, remote provider, premium, command, source mutation, credential, or subscription-agent authority.

## Tasks/Subtasks

- [x] Record explicit Story 4.4 approval scope for VM-to-host Ollama limited execution.
- [x] Add strict Ollama endpoint/model settings and gate evidence.
- [x] Implement bounded Ollama OpenAI-compatible adapter for local evidence explanations.
- [x] Retain only approved provider metadata and summaries, including redacted reasoning-field evidence.
- [x] Add tests for disabled rollback, approved endpoint/model enablement, unapproved endpoint rejection, and raw provider text retention prevention.
- [x] Run full verification and update final review status.

## Dev Agent Record

### Debug Log

- 2026-06-10: Operator approved Story 4.4 for Ollama local provider only, using VM `192.168.1.118` to host endpoint `http://192.168.1.128:11434/v1/chat/completions`, model `qwen3:14b`, 2 second connect timeout, 120 second total timeout, metadata-only retention, and rollback by disabling either provider gate.
- 2026-06-10: Verified host Ollama from the VM before implementation: `/api/tags` listed `qwen3:14b`; `/v1/chat/completions` returned a successful response. The response included a `reasoning` field, so implementation treats reasoning as raw provider output and retains only counts/metadata.
- 2026-06-10: Focused Ollama tests passed with `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q -k "ollama_provider_gate or ollama_local_evidence_explanation"`.
- 2026-06-10: Provider fixture drift check passed with `node ./scripts/check-provider-fixture-policy.mjs`.
- 2026-06-10: Full verification passed with `pnpm.cmd run check`.
- 2026-06-10: Live adapter smoke test against `http://192.168.1.128:11434/v1/chat/completions` and `qwen3:14b` completed with metadata-only output and `rawPayloadRetained=false`.

### Completion Notes

- Added exact approved endpoint/model gate checks before any Ollama HTTP call is allowed.
- Added a dependency-free Ollama adapter that calls only the configured approved endpoint and stores no raw prompt, completion, reasoning, or provider payload text.
- Extended local evidence explanations with safe provider-attempt metadata.
- Updated drift coverage so Story 4.4 replaces the old adapter-not-implemented stop line only for the approved Ollama host endpoint.
- Updated supervisor test runner temp handling so long Windows worktree paths do not break Git-backed remote-delivery tests.

### File List

- `docs/stories/4-4-ollama-limited-provider-adapter-behind-disabled-defaults.md`
- `docs/stories/index.md`
- `docs/prds/index.md`
- `docs/prds/local-provider-ollama-disabled-to-limited-execution.md`
- `docs/architecture/kendall-vnxt-current-gap-review-2026-06-08.md`
- `docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md`
- `docs/architecture/kendall-vnxt-execution-authority-approval-packet-2026-06-09.md`
- `docs/architecture/kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md`
- `packages/contracts/src/api.ts`
- `scripts/check-execution-evidence-boundaries.mjs`
- `scripts/check-maintenance-readiness-report.mjs`
- `scripts/check-provider-fixture-policy.mjs`
- `scripts/check-safe-development-backlog.mjs`
- `scripts/run-supervisor-tests.mjs`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/src/supervisor/config/settings.py`
- `services/supervisor/src/supervisor/domain/ollama_provider_adapter.py`
- `services/supervisor/tests/integration/test_routing_preview.py`

## Change Log

- 2026-06-10: Implemented approved VM-to-host Ollama limited provider adapter behind disabled defaults.
