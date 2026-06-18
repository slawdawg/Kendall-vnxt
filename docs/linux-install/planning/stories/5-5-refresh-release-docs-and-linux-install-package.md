---
baseline_commit: 83235d523a8b178ccfcc45723d4e8773269d976a
---

# Story 5.5: Refresh Release Docs And Linux Install Package

Status: done

## Story

As a maintainer,
I want release docs and packaged Linux install materials refreshed only after implementation evidence is ready,
so that distributed artifacts match the proven install path.

## Acceptance Criteria

1. Given implementation, evidence, troubleshooting, lessons learned, and validation matrix updates are complete, when the Linux install docs package is refreshed, then it includes the current supported install materials.
2. Given release evidence is missing, when packaging is considered, then the package is not refreshed as a substitute for missing release evidence.

## Tasks / Subtasks

- [x] Add package refresh release gate. (AC: 1-2)
  - [x] Package refresh gate requires published bootstrap reachability, first-install evidence, and rerun evidence.
  - [x] Contract validation requires package_refreshed after release evidence is available.
- [x] Update lane tracking and index coverage. (AC: 1-2)
  - [x] Story 5.5 is linked from `docs/linux-install/index.md`.
  - [x] Lane checker accepts the blocked story state and requires package-gate notes.
- [x] Run focused and full lane verification for the guardrail. (AC: 2)
  - [x] `node ./scripts/check-linux-install-contract.mjs`
  - [x] `node ./scripts/check-linux-install-lane.mjs`
  - [x] `node ./scripts/check-doc-indexes.mjs`
  - [x] `node ./scripts/check-linux-bootstrap.mjs`
  - [x] `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`
- [x] Refresh `docs/linux-install.zip` after release evidence and review are complete. (AC: 1)
  - [x] Package refresh was completed after published-source, first-install, rerun, and review evidence existed.

## Dev Notes

### Source Context

- PRD: `docs/prds/linux-install-mvp.md`
  - FR37: refresh the Linux install docs package only when implementation and release evidence are ready for PR.
- Existing artifacts:
  - `docs/linux-install/fixtures/goal-run/package-refresh-gated.json`
  - `docs/linux-install/validation-matrix.md`
  - `scripts/check-linux-install-contract.mjs`

### Target Files

- `docs/linux-install/fixtures/goal-run/package-refresh-gated.json`
- `docs/linux-install/validation-matrix.md`
- `scripts/check-linux-install-contract.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- This story file and BMAD local story copy.

### Implementation Guardrails

- Do not refresh `docs/linux-install.zip` until release evidence is complete.
- Do not treat packaging as a replacement for published URL, first-install, rerun, docs, validation, or review evidence.
- Continue independent verification and review work while packaging remains blocked.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `node ./scripts/check-linux-install-contract.mjs`
- Full lane verification command sequence listed in Completion Notes.

### Completion Notes List

- Added `package-refresh-gated.json` to prevent premature Linux install package refresh.
- Extended contract validation so `docs/linux-install.zip` records package refresh only after release evidence is available.
- Refreshed `docs/linux-install.zip` from current Linux install docs, evidence, and fixtures after first-install and rerun validation evidence was recorded.
- Story delivered through PR #144 after package refresh, review, and CI passed.
- Verification passed:
  - `node ./scripts/check-linux-install-contract.mjs`
  - `node ./scripts/check-linux-install-lane.mjs`
  - `node ./scripts/check-doc-indexes.mjs`
  - `node ./scripts/check-linux-bootstrap.mjs`
  - `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

### File List

- `docs/linux-install/fixtures/goal-run/package-refresh-gated.json`
- `docs/linux-install/validation-matrix.md`
- `scripts/check-linux-install-contract.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- `docs/linux-install/planning/stories/5-5-refresh-release-docs-and-linux-install-package.md`
- `_bmad-output/implementation-artifacts/5-5-refresh-release-docs-and-linux-install-package.md`
