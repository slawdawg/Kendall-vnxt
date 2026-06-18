---
baseline_commit: 83235d523a8b178ccfcc45723d4e8773269d976a
---

# Story 4.1: Map Stories To Release Gates Before Execution

Status: review

## Story

As a maintainer,
I want every implementation story mapped to requirements, command ids, authority, evidence, and release gates before execution,
so that autonomous work cannot drift away from the Linux setup PRD.

## Acceptance Criteria

1. Given a Linux setup implementation story is prepared, when it becomes execution-ready, then `docs/linux-install/release-gate-traceability.md` includes rows for task id, story, FRs, Linux acceptance criteria, authority class, command ids, expected evidence, and release gates.
2. Given lane drift checks run, when a story through the current lane scope is missing release-gate mapping, then completion is blocked by `scripts/check-linux-install-lane.mjs`.

## Tasks / Subtasks

- [x] Add current lane traceability mappings. (AC: 1)
  - [x] Stories 1.1 through 3.6 are mapped.
  - [x] Each row includes task id, story, FRs, Linux AC, authority class, command ids, expected evidence, and release gates.
- [x] Add lane drift guard. (AC: 2)
  - [x] Lane checker requires traceability rows for mapped stories.
  - [x] Lane checker requires traceability column labels.
- [x] Update lane tracking and index coverage. (AC: 1-2)
  - [x] Story 4.1 is linked from `docs/linux-install/index.md`.
  - [x] Lane checker requires Story 4.1 and its coverage notes.
- [x] Run full lane verification. (AC: 1-2)
  - [x] `node ./scripts/check-linux-install-lane.mjs`
  - [x] `node ./scripts/check-doc-indexes.mjs`
  - [x] `node ./scripts/check-linux-bootstrap.mjs`
  - [x] `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

## Dev Notes

### Source Context

- PRD: `docs/prds/linux-install-mvp.md`
  - FR27: implementation stories must map to requirements, command IDs, authority, evidence, and release gates before execution.
- Existing docs:
  - `docs/linux-install/release-gate-traceability.md`
  - `scripts/check-linux-install-lane.mjs`

### Target Files

- `docs/linux-install/release-gate-traceability.md`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- This story file and BMAD local story copy.

### Implementation Guardrails

- Do not claim MVP completion from this mapping alone; gates still require evidence.
- Keep authority class explicit, especially `requires_preauthorization` and `block_and_record` rows.
- Extend this table as later stories are created.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `node ./scripts/check-linux-install-lane.mjs`
- `node ./scripts/check-linux-bootstrap.mjs`
- Full lane verification command sequence listed in Completion Notes.

### Completion Notes List

- Added current lane story traceability rows for Stories 1.1 through 3.6.
- Extended lane checker to block missing traceability mappings for current mapped stories.
- Verification passed:
  - `node ./scripts/check-linux-install-lane.mjs`
  - `node ./scripts/check-doc-indexes.mjs`
  - `node ./scripts/check-linux-bootstrap.mjs`
  - `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

### File List

- `docs/linux-install/release-gate-traceability.md`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- `docs/linux-install/planning/stories/4-1-map-stories-to-release-gates-before-execution.md`
- `_bmad-output/implementation-artifacts/4-1-map-stories-to-release-gates-before-execution.md`
