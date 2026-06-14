---
baseline_commit: 5bcd868d9a0d574028e5fba7dde0f9aca639480b
---

# Story 15.2: Pin Premium Execution Approval Packet To Drift Checks

Status: review

## Story

As Bob,
I want the premium execution approval packet pinned to code and test drift checks,
so that future paid-provider readiness work cannot quietly drift away from exact approval, cost ceiling, audit, retention, and disabled-default boundaries.

## Acceptance Criteria

1. Given premium execution remains approval-required, when the premium execution check runs, then it verifies the approval packet still states it is non-executing and cannot make a paid provider call by itself.
2. Given cost and data exposure are premium-specific risks, when the check runs, then it verifies the packet still requires provider/account boundary, cost ceiling, data classification, audit evidence, abort policy, rollback path, stop lines, and expiry or review point.
3. Given premium execution must remain disabled by default, when the check runs, then it verifies `SUPERVISOR_ALLOW_PREMIUM_EXECUTION` defaults false and the supervisor configuration check keeps premium execution, provider calls, and model calls bound to that gate.
4. Given premium approval request artifacts are request-only, when the check runs, then it verifies existing service and integration-test evidence still keeps `executionAllowed` false before exact execution approval.
5. Given this story is non-executing, when verification runs, then it does not make paid calls, read credentials, access external sessions, retain raw prompt/completion/provider payloads, mutate source by worker, launch processes, clean worktrees, or bypass failed checks.

## Tasks / Subtasks

- [x] Add premium execution approval-packet drift check. (AC: 1, 2, 3, 4)
  - [x] Verify approval packet status, authority family, operation shape, cost/data/audit requirements, retention policy, budget stop lines, and stop lines.
  - [x] Verify supervisor settings keep premium execution disabled by default.
  - [x] Verify supervisor service keeps premium execution, provider calls, and model calls bound to the premium gate.
  - [x] Verify tests preserve premium approval request artifacts as non-mutating and `executionAllowed` false.
- [x] Wire focused premium verification into package scripts. (AC: 1, 2, 3, 4)
  - [x] Add `check:premium-execution`.
  - [x] Add `check:premium-execution` to the full `check` chain.
- [x] Verify scoped premium checks. (AC: 5)
  - [x] Run `pnpm.cmd run check:premium-execution`.

## Dev Notes

This story is a readiness guardrail only. It makes the premium approval packet/code/test relationship machine-checkable, but it does not approve or perform paid provider execution.

Relevant existing context:

- `docs/goals/premium-execution-approval-packet-2026-06-13.md`
- `docs/stories/15-1-refresh-premium-execution-approval-packet.md`
- `docs/stories/1-18-premium-approval-request-artifacts.md`
- `services/supervisor/src/supervisor/config/settings.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`

### Guardrails

- Do not make paid provider calls.
- Do not read credentials, billing credentials, external sessions, or secrets.
- Do not retain raw prompts, completions, provider payloads, or full source copies.
- Do not create budget-incurring behavior.
- Do not treat premium approval request artifacts as execution approval.
- Do not launch processes, mutate source by worker, perform PR delivery, clean worktrees, or bypass failed checks.

### References

- [Source: `docs/goals/premium-execution-approval-packet-2026-06-13.md`]
- [Source: `docs/stories/15-1-refresh-premium-execution-approval-packet.md`]
- [Source: `docs/stories/1-18-premium-approval-request-artifacts.md`]
- [Source: `docs/stories/index.md#draft-epic-15-story-map`]
- [Source: `services/supervisor/src/supervisor/config/settings.py`]
- [Source: `services/supervisor/src/supervisor/application/service.py`]
- [Source: `services/supervisor/tests/integration/test_routing_preview.py`]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `Get-Content -Raw docs/goals/premium-execution-approval-packet-2026-06-13.md`
- `rg -n "premium-execution|premium execution|premium provider|premium approval|allow_premium|SUPERVISOR_ALLOW_PREMIUM|cost ceiling|paid-provider|Story 1\\.18" package.json scripts services\supervisor docs\stories docs\goals apps\dashboard\src`
- `Get-Content services/supervisor/src/supervisor/application/service.py | Select-Object -Skip 5984 -First 25`
- `rg -n "premium-execution|premium_execution_not_enabled|premium.approval|executionAllowed|premium provider|premium approval" services\supervisor\tests\integration\test_routing_preview.py`
- `pnpm.cmd run check:premium-execution`

### Completion Notes List

- Added `scripts/check-premium-execution-approval-packet.mjs`.
- Added `pnpm.cmd run check:premium-execution`.
- Added the premium drift check to the full `pnpm.cmd run check` chain.
- Confirmed the scoped premium verification passes without making a paid call.

### File List

- `package.json`
- `scripts/check-premium-execution-approval-packet.mjs`
- `docs/stories/15-2-pin-premium-execution-approval-packet-to-drift-checks.md`
- `docs/stories/index.md`

### Change Log

- 2026-06-14: Added premium execution approval-packet drift check and scoped verification evidence.
