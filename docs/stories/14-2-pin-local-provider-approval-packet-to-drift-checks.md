---
baseline_commit: 5bcd868d9a0d574028e5fba7dde0f9aca639480b
---

# Story 14.2: Pin Local Provider Approval Packet To Drift Checks

Status: review

## Story

As Bob,
I want the local-provider execution approval packet pinned to code and test drift checks,
so that future Ollama readiness work cannot quietly drift away from the exact approved endpoint, model, disabled gates, and metadata-only retention boundary.

## Acceptance Criteria

1. Given the local-provider execution lane remains approval-required, when provider fixture checks run, then they verify the local-provider approval packet still states it is non-executing and cannot call Ollama by itself.
2. Given the approved Ollama boundary is exact, when drift checks run, then they verify the approval packet, supervisor settings, service gate, and integration tests still reference endpoint `http://192.168.1.128:11434/v1/chat/completions` and model `qwen3:14b`.
3. Given provider execution must remain gated, when drift checks run, then they verify broad and Ollama-specific provider gates default disabled and that the service requires the exact approved endpoint and model before provider/model calls are allowed.
4. Given raw provider content must not be retained, when drift checks run, then they verify the approval packet and tests preserve metadata-only local-provider evidence and raw prompt/completion/provider-payload exclusion.
5. Given this story is non-executing, when verification runs, then it does not call Ollama, discover endpoints or models, access credentials, mutate source by worker, launch processes, clean worktrees, or bypass failed checks.

## Tasks / Subtasks

- [x] Add local-provider approval-packet drift check. (AC: 1, 2, 3, 4)
  - [x] Verify approval packet status, authority family, operation shape, endpoint/model, retention, and stop lines.
  - [x] Verify supervisor settings keep broad and Ollama-specific gates default disabled.
  - [x] Verify supervisor service keeps exact endpoint/model approval checks before enabling provider/model calls.
  - [x] Verify integration tests cover approved endpoint/model, rejected endpoint, metadata-only explanation, and adapter request handling.
- [x] Wire the new drift check into provider fixture verification. (AC: 1, 2, 3, 4)
  - [x] Preserve the existing provider fixture policy check.
  - [x] Allow the provider fixture check script to require inclusion rather than exact command equality.
- [x] Verify scoped provider checks. (AC: 5)
  - [x] Run `pnpm.cmd run check:provider-fixtures`.

## Dev Notes

This story is a readiness guardrail only. It strengthens the local-provider lane by making the exact approval packet/code/test relationship machine-checkable, but it does not approve or perform provider execution.

Relevant existing context:

- `docs/goals/local-provider-execution-approval-packet-2026-06-13.md`
- `docs/stories/14-1-refresh-local-provider-execution-approval-packet.md`
- `docs/stories/4-4-ollama-limited-provider-adapter-behind-disabled-defaults.md`
- `services/supervisor/src/supervisor/config/settings.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`
- `scripts/check-provider-fixture-policy.mjs`

### Guardrails

- Do not call Ollama.
- Do not discover endpoints or models.
- Do not retain raw prompts, completions, reasoning, or provider payloads.
- Do not broaden provider support beyond the approved Story 4.4 endpoint/model boundary.
- Do not access credentials or external sessions.
- Do not launch processes, mutate source by worker, perform PR delivery, clean worktrees, or bypass failed checks.

### References

- [Source: `docs/goals/local-provider-execution-approval-packet-2026-06-13.md`]
- [Source: `docs/stories/14-1-refresh-local-provider-execution-approval-packet.md`]
- [Source: `docs/stories/index.md#draft-epic-14-story-map`]
- [Source: `services/supervisor/src/supervisor/config/settings.py`]
- [Source: `services/supervisor/src/supervisor/application/service.py`]
- [Source: `services/supervisor/tests/integration/test_routing_preview.py`]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `Get-Content -Raw docs/goals/local-provider-execution-approval-packet-2026-06-13.md`
- `rg -n "check:provider-fixtures|provider-fixtures|providerCallsAllowed|local-provider-execution|LocalProvider|Ollama|qwen3|192\\.168\\.1\\.128" package.json scripts services\supervisor packages\contracts apps\dashboard\src`
- `Get-Content -Raw scripts/check-provider-fixture-policy.mjs`
- `Get-Content -Raw services/supervisor/src/supervisor/config/settings.py`
- `rg -n "ollama-provider-gate|ollama_endpoint_url|ollama_approved_endpoint_url|ollama_model_id|ollama_approved_model_id|def test_ollama|OllamaProviderAdapter|metadata_only|provider_result" services\supervisor\src\supervisor\application\service.py services\supervisor\tests\integration\test_routing_preview.py`
- `pnpm.cmd run check:provider-fixtures`

### Completion Notes List

- Added `scripts/check-local-provider-execution-approval-packet.mjs`.
- Wired the new check into `pnpm.cmd run check:provider-fixtures`.
- Updated the existing provider fixture check so it still requires the original fixture policy command while allowing lane-specific checks to be appended.
- Confirmed the scoped provider verification passes without calling Ollama.

### File List

- `package.json`
- `scripts/check-provider-fixture-policy.mjs`
- `scripts/check-local-provider-execution-approval-packet.mjs`
- `docs/stories/14-2-pin-local-provider-approval-packet-to-drift-checks.md`
- `docs/stories/index.md`

### Change Log

- 2026-06-14: Added local-provider approval-packet drift check and scoped verification evidence.
