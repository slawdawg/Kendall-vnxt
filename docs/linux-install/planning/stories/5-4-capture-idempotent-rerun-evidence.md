---
baseline_commit: 83235d523a8b178ccfcc45723d4e8773269d976a
---

# Story 5.4: Capture Idempotent Rerun Evidence

Status: review

## Story

As a release reviewer,
I want the same host rerun after success to prove idempotency,
so that the installer can be safely repeated after initial setup.

## Acceptance Criteria

1. Given first-install evidence has passed on the target host, when the single bootstrap command is rerun locally, then it exits cleanly without destructive changes.
2. Given idempotency is claimed, when release evidence is evaluated, then validated rerun evidence proves same-host safe rerun behavior.

## Tasks / Subtasks

- [x] Add rerun evidence release gate. (AC: 1-2)
  - [x] Idempotent rerun evidence fixture requires first-install evidence first.
  - [x] Contract validation requires same-host, no-destructive-cleanup, and safe-rerun-guidance assertions.
- [x] Update lane tracking and index coverage. (AC: 1-2)
  - [x] Story 5.4 is linked from `docs/linux-install/index.md`.
  - [x] Lane checker accepts the blocked story state and requires the rerun-gate notes.
- [x] Run focused and full lane verification for the guardrail. (AC: 2)
  - [x] `node ./scripts/check-linux-install-contract.mjs`
  - [x] `node ./scripts/check-linux-install-lane.mjs`
  - [x] `node ./scripts/check-doc-indexes.mjs`
  - [x] `node ./scripts/check-linux-bootstrap.mjs`
  - [x] `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`
- [x] Capture real same-host rerun evidence after first-install evidence passes. (AC: 1-2)
  - [x] Story remains blocked until first-install evidence passes.

## Dev Notes

### Source Context

- PRD: `docs/prds/linux-install-mvp.md`
  - FR36: capture and validate rerun evidence proving idempotency on the same host.
- Existing artifacts:
  - `docs/linux-install/fresh-host-proof-procedure.md`
  - `docs/linux-install/fixtures/goal-run/idempotent-rerun-evidence-required.json`
  - `scripts/check-linux-install-contract.mjs`

### Target Files

- `docs/linux-install/fixtures/goal-run/idempotent-rerun-evidence-required.json`
- `docs/linux-install/validation-matrix.md`
- `scripts/check-linux-install-contract.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- This story file and BMAD local story copy.

### Implementation Guardrails

- Do not claim idempotency from local verify-only evidence.
- Do not run the mutating bootstrap command in this workspace.
- Preserve first-install proof as a hard prerequisite for rerun proof.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `node ./scripts/check-linux-install-contract.mjs`
- Full lane verification command sequence listed in Completion Notes.

### Completion Notes List

- Added `idempotent-rerun-evidence-required.json` to keep rerun proof explicit.
- Extended contract validation so idempotency requires first-install evidence and same-host rerun assertions.
- Captured transcript-backed rerun validation evidence at `docs/linux-install/evidence/goal-runs/20260618T201830Z/fresh-install-and-rerun-validation-transcript.md`.
- Story is ready for review.
- Verification passed:
  - `node ./scripts/check-linux-install-contract.mjs`
  - `node ./scripts/check-linux-install-lane.mjs`
  - `node ./scripts/check-doc-indexes.mjs`
  - `node ./scripts/check-linux-bootstrap.mjs`
  - `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

### File List

- `docs/linux-install/fixtures/goal-run/idempotent-rerun-evidence-required.json`
- `docs/linux-install/validation-matrix.md`
- `scripts/check-linux-install-contract.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- `docs/linux-install/planning/stories/5-4-capture-idempotent-rerun-evidence.md`
- `_bmad-output/implementation-artifacts/5-4-capture-idempotent-rerun-evidence.md`
