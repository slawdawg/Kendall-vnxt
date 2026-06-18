---
baseline_commit: 83235d523a8b178ccfcc45723d4e8773269d976a
---

# Story 4.5: Apply Safe Continuation After Blockers

Status: done

## Story

As a Codex `/goal` operator,
I want independent safe work to continue while dependent work stays blocked,
so that missing authority pauses only the affected lane.

## Acceptance Criteria

1. Given a task is blocked by missing authority or manual external action, when the run evaluates remaining tasks, then only tasks with independent inputs, dependencies, authority, and outputs continue.
2. Given a dependent task is affected by a blocker, when continuation is evaluated, then dependent tasks are marked dependency-blocked instead of skipped or completed.

## Tasks / Subtasks

- [x] Strengthen blocked-continuation fixture state. (AC: 1-2)
  - [x] Blocked-continuation fixture marks the private repo probe dependency_blocked.
- [x] Enforce safe continuation buckets. (AC: 1-2)
  - [x] Contract validation requires independent docs drift work to continue.
  - [x] Contract validation rejects dependency-blocked work being treated as complete or skipped.
  - [x] Contract validation requires Tailnet enrollment to remain authority-blocked.
- [x] Update lane tracking and index coverage. (AC: 1-2)
  - [x] Story 4.5 is linked from `docs/linux-install/index.md`.
  - [x] Lane checker requires Story 4.5 and its coverage notes.
- [x] Run focused and full lane verification. (AC: 1-2)
  - [x] `node ./scripts/check-linux-install-contract.mjs`
  - [x] `node ./scripts/check-linux-install-lane.mjs`
  - [x] `node ./scripts/check-doc-indexes.mjs`
  - [x] `node ./scripts/check-linux-bootstrap.mjs`
  - [x] `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

## Dev Notes

### Source Context

- PRD: `docs/prds/linux-install-mvp.md`
  - FR31: if one lane is blocked, independent safe work may continue while dependent work remains blocked.
- Existing artifacts:
  - `docs/linux-install/goal-run-contract.md`
  - `docs/linux-install/fixtures/goal-run/blocked-continuation.json`
  - `scripts/check-linux-install-contract.mjs`

### Target Files

- `docs/linux-install/fixtures/goal-run/blocked-continuation.json`
- `scripts/check-linux-install-contract.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- This story file and BMAD local story copy.

### Implementation Guardrails

- Do not mark blocked work complete or skipped.
- Do not continue tasks that depend on blocked manual auth or missing authority.
- Keep continuation evidence local and non-mutating.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `node ./scripts/check-linux-install-contract.mjs`
- Full lane verification command sequence listed in Completion Notes.

### Completion Notes List

- Changed the private repo probe task to `dependency_blocked` in the blocked-continuation fixture.
- Extended contract validation to enforce expected continuation, dependency-blocked, and authority-blocked buckets.
- Verification passed:
  - `node ./scripts/check-linux-install-contract.mjs`
  - `node ./scripts/check-linux-install-lane.mjs`
  - `node ./scripts/check-doc-indexes.mjs`
  - `node ./scripts/check-linux-bootstrap.mjs`
  - `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

### File List

- `docs/linux-install/fixtures/goal-run/blocked-continuation.json`
- `scripts/check-linux-install-contract.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- `docs/linux-install/planning/stories/4-5-apply-safe-continuation-after-blockers.md`
- `_bmad-output/implementation-artifacts/4-5-apply-safe-continuation-after-blockers.md`
