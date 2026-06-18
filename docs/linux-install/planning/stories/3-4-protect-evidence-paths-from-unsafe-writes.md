---
baseline_commit: 83235d523a8b178ccfcc45723d4e8773269d976a
---

# Story 3.4: Protect Evidence Paths From Unsafe Writes

Status: review

## Story

As a maintainer,
I want evidence writes to stay inside approved repo paths and avoid overwrites,
so that install proof cannot clobber or leak into arbitrary filesystem locations.

## Acceptance Criteria

1. Given an evidence path is requested, when evidence-path validation runs, then paths outside `docs/linux-install/evidence/` are rejected before verification work proceeds.
2. Given an evidence path uses traversal out of `docs/linux-install/evidence/`, when evidence-path validation runs, then it is rejected before verification work proceeds.
3. Given an evidence file already exists, when evidence-path validation runs, then the existing evidence file is not overwritten.

## Tasks / Subtasks

- [x] Add focused validator path-safety coverage. (AC: 1-3)
  - [x] Absolute outside path is rejected.
  - [x] Path traversal out of approved evidence directory is rejected.
  - [x] Existing evidence file overwrite remains rejected.
- [x] Confirm validator path guard behavior. (AC: 1-3)
  - [x] Approved evidence directory real path is compared against requested evidence directory real path.
  - [x] Existing evidence file stops with exit code 2.
- [x] Update lane tracking and index coverage. (AC: 1-3)
  - [x] Story 3.4 is linked from `docs/linux-install/index.md`.
  - [x] Lane checker requires Story 3.4 and its coverage notes.
- [x] Run focused and full lane verification. (AC: 1-3)
  - [x] `node --test tests/linux-bootstrap/validator.test.mjs`
  - [x] `node ./scripts/check-linux-install-lane.mjs`
  - [x] `node ./scripts/check-doc-indexes.mjs`
  - [x] `node ./scripts/check-linux-bootstrap.mjs`
  - [x] `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

## Dev Notes

### Source Context

- PRD: `docs/prds/linux-install-mvp.md`
  - FR21: evidence writes must remain inside approved repo paths and avoid overwrites.
- Existing code:
  - `scripts/validate-linux-install.sh` validates evidence path location and overwrite safety.
  - `tests/linux-bootstrap/validator.test.mjs` covers validator command behavior.
  - `tests/linux-bootstrap/evidence.test.mjs` covers Node evidence path helper behavior.

### Target Files

- `tests/linux-bootstrap/validator.test.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- This story file and BMAD local story copy.

### Implementation Guardrails

- Do not allow evidence writes outside `docs/linux-install/evidence/`.
- Do not overwrite existing evidence.
- Do not add cleanup or deletion as part of evidence path validation.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `node --test tests/linux-bootstrap/validator.test.mjs`
- `node ./scripts/check-linux-bootstrap.mjs`
- Full lane verification command sequence listed in Completion Notes.

### Completion Notes List

- Added validator runtime tests for absolute outside evidence paths and traversal out of the approved evidence directory.
- Confirmed existing overwrite protection remains covered.
- Verification passed:
  - `node --test tests/linux-bootstrap/validator.test.mjs`
  - `node ./scripts/check-linux-install-lane.mjs`
  - `node ./scripts/check-doc-indexes.mjs`
  - `node ./scripts/check-linux-bootstrap.mjs`
  - `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

### File List

- `tests/linux-bootstrap/validator.test.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- `docs/linux-install/planning/stories/3-4-protect-evidence-paths-from-unsafe-writes.md`
- `_bmad-output/implementation-artifacts/3-4-protect-evidence-paths-from-unsafe-writes.md`
