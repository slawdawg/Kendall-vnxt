---
baseline_commit: 83235d523a8b178ccfcc45723d4e8773269d976a
---

# Story 4.4: Record Blocker Packets For Gated Operations

Status: done

## Story

As a goal-run reviewer,
I want missing authority and manual external actions recorded as blocker packets,
so that the exact resume point and required Bob action are preserved.

## Acceptance Criteria

1. Given a task reaches manual auth, paid provider usage, external enrollment, destructive cleanup, reboot, PR creation, merge, or workspace cleanup without matching authority, when the goal run handles the blocker, then it writes a blocker packet with blocked operation, reason, last safe command, proposed next command, required Bob action, resume command, dependency impact, safe tasks still attempted, and secrets exclusion.
2. Given a blocker packet is recorded, when contract validation runs, then no gated action is simulated as complete.

## Tasks / Subtasks

- [x] Strengthen blocker packet schema coverage. (AC: 1-2)
  - [x] Goal-run contract blocker packet schema includes blocked_task_status.
  - [x] Blocker fixtures require blocked_task_status authority-blocked-not-complete.
- [x] Apply the schema to current blocker fixtures. (AC: 1-2)
  - [x] Manual Auth, paid provider, destructive cleanup, and Tailnet blocker fixtures are covered.
- [x] Update lane tracking and index coverage. (AC: 1-2)
  - [x] Story 4.4 is linked from `docs/linux-install/index.md`.
  - [x] Lane checker requires Story 4.4 and its coverage notes.
- [x] Run focused and full lane verification. (AC: 1-2)
  - [x] `node ./scripts/check-linux-install-contract.mjs`
  - [x] `node ./scripts/check-linux-install-lane.mjs`
  - [x] `node ./scripts/check-doc-indexes.mjs`
  - [x] `node ./scripts/check-linux-bootstrap.mjs`
  - [x] `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

## Dev Notes

### Source Context

- PRD: `docs/prds/linux-install-mvp.md`
  - FR30: manual actions, paid provider usage, external enrollment, destructive cleanup, PR creation, merge, and workspace cleanup must create blocker packets unless separately authorized.
- Existing artifacts:
  - `docs/linux-install/goal-run-contract.md`
  - `docs/linux-install/fixtures/goal-run/blocker-manual-auth.json`
  - `docs/linux-install/fixtures/goal-run/blocker-paid-provider-usage.json`
  - `docs/linux-install/fixtures/goal-run/blocker-destructive-cleanup.json`
  - `docs/linux-install/fixtures/goal-run/blocker-tailnet-enrollment.json`
  - `scripts/check-linux-install-contract.mjs`

### Target Files

- `docs/linux-install/goal-run-contract.md`
- `docs/linux-install/fixtures/goal-run/blocker-manual-auth.json`
- `docs/linux-install/fixtures/goal-run/blocker-paid-provider-usage.json`
- `docs/linux-install/fixtures/goal-run/blocker-destructive-cleanup.json`
- `docs/linux-install/fixtures/goal-run/blocker-tailnet-enrollment.json`
- `scripts/check-linux-install-contract.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- This story file and BMAD local story copy.

### Implementation Guardrails

- Do not perform gated operations.
- Do not mark blocked work complete.
- Preserve secrets exclusion and exact resume command requirements.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `node ./scripts/check-linux-install-contract.mjs`
- Full lane verification command sequence listed in Completion Notes.

### Completion Notes List

- Added `blocked_task_status` to the blocker packet contract example and current blocker fixtures.
- Extended blocker fixture validation so blocked operations must remain `authority-blocked-not-complete`.
- Verification passed:
  - `node ./scripts/check-linux-install-contract.mjs`
  - `node ./scripts/check-linux-install-lane.mjs`
  - `node ./scripts/check-doc-indexes.mjs`
  - `node ./scripts/check-linux-bootstrap.mjs`
  - `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

### File List

- `docs/linux-install/goal-run-contract.md`
- `docs/linux-install/fixtures/goal-run/blocker-manual-auth.json`
- `docs/linux-install/fixtures/goal-run/blocker-paid-provider-usage.json`
- `docs/linux-install/fixtures/goal-run/blocker-destructive-cleanup.json`
- `docs/linux-install/fixtures/goal-run/blocker-tailnet-enrollment.json`
- `scripts/check-linux-install-contract.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- `docs/linux-install/planning/stories/4-4-record-blocker-packets-for-gated-operations.md`
- `_bmad-output/implementation-artifacts/4-4-record-blocker-packets-for-gated-operations.md`
