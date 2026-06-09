---
baseline_commit: 2bab713c87972dd8468bc159624781b6e4c00f8e
---

# Story 4.1: Ollama Provider Settings And Registry Gates

## Status

review

## Story

As the Kendall_vNxt operator,
I want Ollama provider enablement controlled by provider-specific settings and registry state,
so that enabling Ollama later cannot accidentally enable other local providers or broad provider authority.

## Approval Required Before Implementation

Approved on 2026-06-09 for non-executing Ollama preparation only. Do not add or perform Ollama HTTP calls, endpoint discovery, model discovery, provider/model calls, process launch, shell command execution, source mutation, credential access, premium execution, external sends, or subscription-agent launch.

## Acceptance Criteria

1. Add an Ollama-specific setting that defaults to disabled.
2. Require both the broad local-provider gate and the Ollama-specific gate before Ollama can be executable.
3. Keep LM Studio, vLLM, and llama.cpp disabled.
4. Registry evidence distinguishes disabled Ollama, configured-but-disabled Ollama, and enabled Ollama.
5. Execution configuration checks report the Ollama-specific gate separately.
6. Tests prove default disabled behavior and no-call behavior.
7. No provider HTTP calls are added in this story.

## Safety Gates

- No provider/model calls.
- No endpoint discovery.
- No command execution.
- No source mutation.
- No network or credential access.

## Tasks/Subtasks

- [x] Add disabled-default Ollama-specific settings.
  - [x] Add an Ollama-specific gate that defaults to disabled.
  - [x] Add explicit model-id configuration evidence without hardcoded defaults.
- [x] Extend registry/configuration evidence.
  - [x] Require broad local-provider and Ollama-specific gates before Ollama can become adapter-ready.
  - [x] Keep LM Studio, vLLM, and llama.cpp disabled.
  - [x] Distinguish disabled, configured-but-disabled, and adapter-ready Ollama registry states without enabling calls.
- [x] Add tests and drift evidence.
  - [x] Prove default disabled and no-call behavior.
  - [x] Prove broad-gate-only and missing-model states remain non-executing.
  - [x] Update story/index evidence as needed.

## Dev Agent Record

### Debug Log

- 2026-06-09: Started under explicit non-executing Approval Option A.

### Completion Notes

- Added `SUPERVISOR_ALLOW_OLLAMA_PROVIDER_CALLS`, `SUPERVISOR_OLLAMA_MODEL_ID`, and timeout settings with disabled/no-call defaults.
- Added Ollama registry state evidence for disabled, broad-gate-only, missing-model, and adapter-ready-no-call states.
- Kept provider/model calls disabled even when the Ollama metadata gate is fully configured; Story 4.4 remains required for any real adapter.

### Implementation Plan

- Extend settings, disabled provider proof evidence, execution configuration checks, shared contracts, supervisor tests, and dashboard copy without adding any provider adapter or HTTP client.

## File List

- `services/supervisor/src/supervisor/config/settings.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/src/supervisor/domain/disabled_provider_adapter.py`
- `services/supervisor/src/supervisor/api/schemas.py`
- `packages/contracts/src/api.ts`
- `apps/dashboard/src/components/execution-readiness-report-panel.tsx`
- `services/supervisor/tests/integration/test_routing_preview.py`
- `tests/e2e/dashboard.spec.ts`
- `scripts/check-provider-fixture-policy.mjs`
- `scripts/check-runtime-evidence-export.mjs`
- `docs/stories/index.md`
- `docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md`
- `docs/architecture/kendall-vnxt-execution-authority-approval-packet-2026-06-09.md`

## Change Log

- 2026-06-09: Story moved to in-progress after explicit non-executing approval.
- 2026-06-09: Implemented disabled-default Ollama gate, registry evidence, no-call tests, and dashboard/report/export evidence; moved to review.
