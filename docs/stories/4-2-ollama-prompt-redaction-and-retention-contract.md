---
Status: done as non-executing Ollama/provider preparation; broader provider expansion deferred post-MVP
baseline_commit: 2bab713c87972dd8468bc159624781b6e4c00f8e
---

# Story 4.2: Ollama Prompt Redaction And Retention Contract

## Status

done

## Story

As the Kendall_vNxt operator,
I want Ollama prompt construction and retained evidence bounded before any provider call exists,
so that local provider execution cannot leak secrets or persist raw provider payloads.

## Approval Required Before Implementation

Approved on 2026-06-09 for non-executing Ollama preparation only. Do not add or perform Ollama HTTP calls, endpoint discovery, model discovery, provider/model calls, process launch, shell command execution, source mutation, credential access, premium execution, external sends, or subscription-agent launch.

## Acceptance Criteria

1. Define approved prompt sources for Ollama evidence explanation.
2. Reject prompt construction if secrets, environment values, credential paths, or unrelated local files are present.
3. Store no raw prompt text in workflow events.
4. Store no raw completion text in workflow events.
5. Retain only metadata, redaction state, truncation state, summaries, and artifact references.
6. Add fixture tests for redaction and retention behavior.
7. No provider HTTP calls are added in this story.

## Safety Gates

- No provider/model calls.
- No raw prompt or completion retention.
- No credential access.
- No source mutation.

## Tasks/Subtasks

- [x] Define Ollama prompt-source policy evidence.
  - [x] List approved evidence-summary sources.
  - [x] List rejected secret, environment, credential, and unrelated-file sources.
- [x] Extend retention contract evidence.
  - [x] Prove raw prompts and completions are not retained in workflow events.
  - [x] Retain only metadata, redaction state, truncation state, summaries, and artifact references.
- [x] Add tests and drift evidence.
  - [x] Prove redaction and retention behavior through no-call fixtures.
  - [x] Update runtime export/review evidence references as needed.

## Dev Agent Record

### Debug Log

- 2026-06-09: Started under explicit non-executing Approval Option A.

### Completion Notes

- Added no-call proof fields for approved prompt evidence sources, rejected prompt sources, retained evidence classes, and raw prompt/completion retention denial.
- Added runtime export excluded-state and retention-note evidence for raw Ollama prompts and completions.
- Dashboard and tests now surface the contract without constructing, storing, or sending provider prompts.

### Implementation Plan

- Extend disabled provider proof and runtime export evidence with prompt-source and retention metadata only; do not construct or send a provider prompt.

## File List

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
- 2026-06-09: Implemented prompt-source, rejected-source, redaction, retention, dashboard/report/export, and no-call fixture evidence; moved to review.
- 2026-06-09: BMad code review raised no unresolved Story 4.2 acceptance issues; moved to done.
