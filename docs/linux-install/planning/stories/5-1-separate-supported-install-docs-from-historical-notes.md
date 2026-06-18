---
baseline_commit: 83235d523a8b178ccfcc45723d4e8773269d976a
---

# Story 5.1: Separate Supported Install Docs From Historical Notes

Status: done

## Story

As a future installer operator,
I want the generic install path separated from historical or lab-specific notes,
so that old SSH, remote, or staged instructions do not override the supported v1 boundary.

## Acceptance Criteria

1. Given the Linux install documentation is scanned, when supported install instructions are presented, then the generic path points to the single local bootstrap method.
2. Given historical or lab-specific documents are listed, when the index is scanned, then historical implementation plans, remote templates, SSH policies, lab host notes, and platform evaluation notes are labeled as non-authoritative for v1 install.

## Tasks / Subtasks

- [x] Strengthen historical-note separation checks. (AC: 1-2)
  - [x] Generic install path remains the single local bootstrap method.
  - [x] Index separates supported install docs from historical notes.
  - [x] Contract validation requires historical and lab entries to be labeled non-authoritative.
- [x] Update lane tracking and index coverage. (AC: 1-2)
  - [x] Story 5.1 is linked from `docs/linux-install/index.md`.
  - [x] Lane checker requires Story 5.1 and its coverage notes.
- [x] Run focused and full lane verification. (AC: 1-2)
  - [x] `node ./scripts/check-linux-install-contract.mjs`
  - [x] `node ./scripts/check-linux-install-lane.mjs`
  - [x] `node ./scripts/check-doc-indexes.mjs`
  - [x] `node ./scripts/check-linux-bootstrap.mjs`
  - [x] `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

## Dev Notes

### Source Context

- PRD: `docs/prds/linux-install-mvp.md`
  - FR25: docs must separate the generic supported install path from historical, lab-instance, SSH, or platform-evaluation notes.
- Existing artifacts:
  - `docs/linux-install/index.md`
  - `scripts/check-linux-install-contract.mjs`

### Target Files

- `scripts/check-linux-install-contract.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- This story file and BMAD local story copy.

### Implementation Guardrails

- Do not restore remote, SSH, or staged install instructions as supported v1 paths.
- Do not remove historical links; label and fence them.
- Keep the generic supported install path local-first.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `node ./scripts/check-linux-install-contract.mjs`
- Full lane verification command sequence listed in Completion Notes.

### Completion Notes List

- Added contract validation for the historical and lab-specific index entries.
- Linked Story 5.1 into the active lane index and lane checker.
- Verification passed:
  - `node ./scripts/check-linux-install-contract.mjs`
  - `node ./scripts/check-linux-install-lane.mjs`
  - `node ./scripts/check-doc-indexes.mjs`
  - `node ./scripts/check-linux-bootstrap.mjs`
  - `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

### File List

- `scripts/check-linux-install-contract.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- `docs/linux-install/planning/stories/5-1-separate-supported-install-docs-from-historical-notes.md`
- `_bmad-output/implementation-artifacts/5-1-separate-supported-install-docs-from-historical-notes.md`
