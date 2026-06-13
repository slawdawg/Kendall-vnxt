---
baseline_commit: fda4695a4c3de65e7ebcc7a12e2e0a23362f853b
---

# Story 15.1: Refresh Premium Execution Approval Packet

Status: done

## Story

As Bob,
I want the premium execution approval packet refreshed from current request-artifact evidence,
so that any future paid provider call requires exact scope, cost, data, audit, and rollback approval.

## Acceptance Criteria

1. Given premium execution is selected as the next gated lane, when the packet is refreshed, then it binds any future candidate operation to provider/account boundary, operation, cost ceiling, data classification, prompt-source or input-set id, redaction policy, retained evidence, audit evidence, operator, abort policy, rollback path, stop lines, and expiry or review point.
2. Given Story 1.18 only created request artifacts, when this story completes, then it does not make paid calls, read credentials, retain raw provider data, or treat request artifacts as execution approval.
3. Given budget risk is unique to premium execution, when the packet is written, then it defines budget stop lines, cost tracking requirements, no automatic retry, and provider/account mismatch rejection.
4. Given the story is documentation/packet-only, when verification runs, then `pnpm.cmd run check:docs` passes.

## Tasks / Subtasks

- [x] Create the premium execution approval packet. (AC: 1, 2, 3)
  - [x] Define provider/account, cost, data, audit, retained evidence, abort, rollback, and stop-line bindings.
  - [x] Preserve premium request artifacts as request-only evidence.
  - [x] Prohibit paid calls, credential reads, raw retention, and automatic retries.
- [x] Update story navigation for Epic 15. (AC: 1)
  - [x] Add Epic 15 and Story 15.1 to the story index.
- [x] Verify documentation. (AC: 4)
  - [x] Run `pnpm.cmd run check:docs`.

## Dev Notes

This story intentionally stops before premium execution. Story 1.18 already created deterministic approval request artifacts; this story defines the exact future execution approval packet and budget/data/audit stop lines.

Relevant existing context:

- `docs/stories/1-18-premium-approval-request-artifacts.md`
- `docs/prds/supervisor-execution-authority-expansion.md`
- `docs/goals/epic-11-next-lane-authority-decision-packet-2026-06-13.md`
- `_bmad-output/planning-artifacts/deferred-authority-backlog-map-2026-06-13.md`

### Guardrails

- Do not make paid provider calls.
- Do not read credentials or external sessions.
- Do not retain raw prompts, completions, or provider payloads.
- Do not create budget-incurring behavior.
- Do not mutate source outside this documentation/story slice.

### References

- [Source: `docs/goals/premium-execution-approval-packet-2026-06-13.md`]
- [Source: `docs/stories/1-18-premium-approval-request-artifacts.md`]
- [Source: `docs/goals/epic-11-next-lane-authority-decision-packet-2026-06-13.md#candidate-lane-comparison`]
- [Source: `_bmad-output/planning-artifacts/deferred-authority-backlog-map-2026-06-13.md#4-premium-execution`]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `Get-Content -Raw docs/stories/1-18-premium-approval-request-artifacts.md`
- `pnpm.cmd run check:docs`

### Completion Notes List

- Created `docs/goals/premium-execution-approval-packet-2026-06-13.md`.
- Preserved Story 1.18 premium approval artifacts as request-only evidence.
- Defined cost ceiling, data classification, audit evidence, abort, rollback, and stop-line requirements before any paid operation.

### File List

- `docs/goals/premium-execution-approval-packet-2026-06-13.md`
- `docs/stories/15-1-refresh-premium-execution-approval-packet.md`
- `docs/stories/index.md`

### Change Log

- 2026-06-13: Refreshed premium execution approval packet and budget/data/audit stop lines.
