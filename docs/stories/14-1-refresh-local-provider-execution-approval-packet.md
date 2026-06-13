---
baseline_commit: 5eafdc5f4b0d42191946225607e7c3e660f91bfc
---

# Story 14.1: Refresh Local Provider Execution Approval Packet

Status: done

## Story

As Bob,
I want the local-provider execution approval packet refreshed from current Ollama evidence,
so that any future provider call is bounded to the approved endpoint/model and metadata-only retention policy.

## Acceptance Criteria

1. Given local-provider execution is selected as the next gated lane, when the approval packet is refreshed, then it binds the candidate operation to Ollama, endpoint `http://192.168.1.128:11434/v1/chat/completions`, model `qwen3:14b`, prompt-source id, prompt template id, redaction policy, timeout/cancellation policy, retained evidence, operator, rollback path, stop lines, and expiry or review point.
2. Given broader provider expansion remains blocked, when the packet is written, then it explicitly excludes LM Studio, vLLM, llama.cpp, remote providers, premium providers, endpoint/model discovery, credential access, source mutation, process launch, PR delivery, cleanup, and failed-check bypass.
3. Given this story is non-executing, when it completes, then it does not call Ollama or any provider, discover models, retain raw prompts/completions/reasoning/provider payloads, or change provider settings.
4. Given the story is documentation/packet-only, when verification runs, then `pnpm.cmd run check:docs` passes.

## Tasks / Subtasks

- [x] Create the local-provider execution approval packet. (AC: 1, 2, 3)
  - [x] Bind endpoint/model to the Story 4.4 approved boundary.
  - [x] Define allowed/disallowed inputs and metadata-only retention.
  - [x] Define approval binding, rollback, and stop lines.
- [x] Update story navigation for Epic 14. (AC: 1)
  - [x] Add Epic 14 and Story 14.1 to the story index.
- [x] Verify documentation. (AC: 4)
  - [x] Run `pnpm.cmd run check:docs`.

## Dev Notes

This story intentionally stops before any provider call. Story 4.4 already implemented the bounded Ollama adapter behind disabled defaults; this story creates the next exact approval packet only.

Relevant existing context:

- `docs/stories/4-4-ollama-limited-provider-adapter-behind-disabled-defaults.md`
- `docs/prds/local-provider-ollama-prd-review-2026-06-08.md`
- `docs/goals/epic-11-next-lane-authority-decision-packet-2026-06-13.md`
- `_bmad-output/planning-artifacts/deferred-authority-backlog-map-2026-06-13.md`

### Guardrails

- Do not call Ollama.
- Do not discover endpoints or models.
- Do not retain raw prompts, completions, reasoning, or provider payloads.
- Do not broaden provider support.
- Do not access credentials or external sessions.
- Do not mutate source outside this documentation/story slice.

### References

- [Source: `docs/goals/local-provider-execution-approval-packet-2026-06-13.md`]
- [Source: `docs/stories/4-4-ollama-limited-provider-adapter-behind-disabled-defaults.md`]
- [Source: `docs/prds/local-provider-ollama-prd-review-2026-06-08.md`]
- [Source: `docs/goals/epic-11-next-lane-authority-decision-packet-2026-06-13.md#candidate-lane-comparison`]
- [Source: `_bmad-output/planning-artifacts/deferred-authority-backlog-map-2026-06-13.md#3-local-provider-execution`]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `Get-Content -Raw docs/stories/4-4-ollama-limited-provider-adapter-behind-disabled-defaults.md`
- `Get-Content -Raw docs/prds/local-provider-ollama-prd-review-2026-06-08.md`
- `pnpm.cmd run check:docs`

### Completion Notes List

- Created `docs/goals/local-provider-execution-approval-packet-2026-06-13.md`.
- Preserved the Story 4.4 endpoint/model boundary and metadata-only retention posture.
- Kept broader provider expansion blocked.

### File List

- `docs/goals/local-provider-execution-approval-packet-2026-06-13.md`
- `docs/stories/14-1-refresh-local-provider-execution-approval-packet.md`
- `docs/stories/index.md`

### Change Log

- 2026-06-13: Refreshed local-provider execution approval packet for the approved Ollama endpoint/model boundary.
