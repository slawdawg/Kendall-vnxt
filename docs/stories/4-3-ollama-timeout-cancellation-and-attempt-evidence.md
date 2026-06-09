---
baseline_commit: 2bab713c87972dd8468bc159624781b6e4c00f8e
---

# Story 4.3: Ollama Timeout Cancellation And Attempt Evidence

## Status

review

## Story

As the Kendall_vNxt operator,
I want Ollama timeout and cancellation behavior mapped to execution attempts before provider calls are enabled,
so that local provider work remains reviewable and recoverable.

## Approval Required Before Implementation

Approved on 2026-06-09 for non-executing Ollama preparation only. Do not add or perform Ollama HTTP calls, endpoint discovery, model discovery, provider/model calls, process launch, shell command execution, source mutation, credential access, premium execution, external sends, or subscription-agent launch.

## Acceptance Criteria

1. Define connect timeout and total timeout values.
2. Define cancellation behavior that maps to execution attempt lifecycle states.
3. Record timeout and cancellation evidence without raw provider payloads.
4. Runtime evidence exports include timeout/cancellation summaries.
5. Dashboard copy shows timeout/cancellation state.
6. Tests prove timeout, cancellation, terminal-state, and retry behavior using no-call fixtures.
7. No provider HTTP calls are added in this story.

## Safety Gates

- No provider/model calls.
- No process launch.
- No command execution.
- No source mutation.

## Tasks/Subtasks

- [x] Define Ollama timeout policy evidence.
  - [x] Add connect timeout and total timeout settings with safe defaults.
  - [x] Surface timeout values in provider proof/configuration evidence.
- [x] Define cancellation/attempt-state mapping evidence.
  - [x] Map request abort, cancel requested, cancelled, timed out, failed, and retry-safe states without calling a provider.
  - [x] Include timeout/cancellation summaries in runtime export/review evidence.
- [x] Add tests and dashboard copy.
  - [x] Prove timeout, cancellation, terminal-state, and retry evidence through no-call fixtures.
  - [x] Render dashboard evidence without implying execution is enabled.

## Dev Agent Record

### Debug Log

- 2026-06-09: Started under explicit non-executing Approval Option A.

### Completion Notes

- Added connect and total timeout settings and surfaced them in Ollama no-call provider proof evidence.
- Added attempt-state mapping and retry-policy evidence for cancellation, timeout, failure, terminal states, and retry review.
- Runtime export and dashboard evidence now include timeout/cancellation summaries while provider/model calls remain disabled.

### Implementation Plan

- Add timeout/cancellation metadata to settings, provider proofs, runtime exports, tests, and dashboard panels without adding any HTTP client or process behavior.

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
- 2026-06-09: Implemented timeout, cancellation, retry, dashboard/report/export, and no-call fixture evidence; moved to review.
