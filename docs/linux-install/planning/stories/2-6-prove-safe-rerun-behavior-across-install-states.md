---
baseline_commit: 83235d523a8b178ccfcc45723d4e8773269d976a
---

# Story 2.6: Prove Safe Rerun Behavior Across Install States

Status: review

## Story

As a bootstrap operator,
I want reruns to resume safely or fail with exact recovery guidance,
so that interruption or prior success does not require destructive cleanup.

## Acceptance Criteria

1. Given the installer is rerun on clean, partial, existing-tool, existing-repo, successful, and unsupported states, when each run executes, then it either completes idempotently or fails closed before unsafe mutation.
2. Given existing tools or repo state are already present, when bootstrap reruns, then it skips or validates existing state instead of destructive cleanup.
3. Given an unsupported existing path or failed validation occurs, when bootstrap exits, then the failed gate and next safe recovery command are reported.
4. Given successful verify evidence is produced, when rerun guidance is inspected, then it says successful reruns verify existing state without destructive changes.

## Tasks / Subtasks

- [x] Add focused safe-rerun coverage. (AC: 1-4)
  - [x] Existing pinned pnpm skip is asserted.
  - [x] Existing uv/uvx skip is asserted.
  - [x] Existing agent CLI skip is asserted.
  - [x] Existing repo validation is asserted.
  - [x] Collision-safe evidence naming is asserted.
  - [x] Successful verify rerun guidance is asserted.
- [x] Harden unsupported existing-path recovery. (AC: 3)
  - [x] Non-git existing repo path failure gives exact recovery guidance.
- [x] Update lane tracking and index coverage. (AC: 1-4)
  - [x] Story 2.6 is linked from `docs/linux-install/index.md`.
  - [x] Lane checker requires Story 2.6 and its coverage notes.
- [x] Run focused and full lane verification. (AC: 1-4)
  - [x] `node --test tests/linux-bootstrap/bootstrap-script.test.mjs`
  - [x] `node ./scripts/check-linux-install-lane.mjs`
  - [x] `node ./scripts/check-doc-indexes.mjs`
  - [x] `node ./scripts/check-linux-bootstrap.mjs`
  - [x] `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

## Dev Notes

### Source Context

- PRD: `docs/prds/linux-install-mvp.md`
  - FR24: install path must be idempotent across clean, partial, existing-tool, existing-repo, successful-rerun, and unsupported states.
  - FR36: implementation must capture and validate rerun evidence proving idempotency on the same host.
  - NFR5: recovery guidance must prefer safe rerun over destructive rollback.
- Existing code:
  - `scripts/bootstrap-linux.sh` skips existing tools, validates existing repo state, and uses collision-safe evidence paths.
  - `scripts/validate-linux-install.sh` emits successful rerun guidance for passing evidence.

### Target Files

- `scripts/bootstrap-linux.sh`
- `tests/linux-bootstrap/bootstrap-script.test.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- This story file and BMAD local story copy.

### Implementation Guardrails

- Do not add destructive cleanup as a recovery path.
- Do not remove or overwrite existing evidence.
- Prefer exact safe rerun guidance over rollback instructions.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `node --test tests/linux-bootstrap/bootstrap-script.test.mjs`
- `node ./scripts/check-linux-bootstrap.mjs`
- Full lane verification command sequence listed in Completion Notes.

### Completion Notes List

- Added focused safe-rerun coverage for existing tools, existing repo validation, evidence collision handling, and successful rerun guidance.
- Hardened unsupported existing-path recovery guidance to point at fixing/moving the path and rerunning the same single install command.
- Verification passed:
  - `node --test tests/linux-bootstrap/bootstrap-script.test.mjs`
  - `node ./scripts/check-linux-install-lane.mjs`
  - `node ./scripts/check-doc-indexes.mjs`
  - `node ./scripts/check-linux-bootstrap.mjs`
  - `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

### File List

- `scripts/bootstrap-linux.sh`
- `tests/linux-bootstrap/bootstrap-script.test.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- `docs/linux-install/planning/stories/2-6-prove-safe-rerun-behavior-across-install-states.md`
- `_bmad-output/implementation-artifacts/2-6-prove-safe-rerun-behavior-across-install-states.md`
