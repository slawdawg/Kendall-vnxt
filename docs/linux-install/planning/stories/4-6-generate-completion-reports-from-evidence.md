---
baseline_commit: 83235d523a8b178ccfcc45723d4e8773269d976a
---

# Story 4.6: Generate Completion Reports From Evidence

Status: review

## Story

As a reviewer,
I want completion status derived from task state, release gates, and evidence,
so that incomplete Linux setup work cannot be reported as done.

## Acceptance Criteria

1. Given a completion report is generated, when any mapped acceptance criterion, required verification, required evidence, release gate, or blocker remains open, then the report cannot claim complete.
2. Given delivery actions are considered, when PR creation, merge, or workspace cleanup is next, then those remain terminal delivery operations requiring separate matching authority.

## Tasks / Subtasks

- [x] Strengthen missing-evidence completion fixture. (AC: 1)
  - [x] Missing-evidence fixture keeps release_gate_status open and expected completion not_complete.
  - [x] Missing-evidence fixture lists open blockers.
- [x] Enforce terminal delivery authority. (AC: 2)
  - [x] Terminal delivery authority is required for pr-create, merge, and workspace-cleanup.
- [x] Update lane tracking and index coverage. (AC: 1-2)
  - [x] Story 4.6 is linked from `docs/linux-install/index.md`.
  - [x] Lane checker requires Story 4.6 and its coverage notes.
- [x] Run focused and full lane verification. (AC: 1-2)
  - [x] `node ./scripts/check-linux-install-contract.mjs`
  - [x] `node ./scripts/check-linux-install-lane.mjs`
  - [x] `node ./scripts/check-doc-indexes.mjs`
  - [x] `node ./scripts/check-linux-bootstrap.mjs`
  - [x] `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

## Dev Notes

### Source Context

- PRD: `docs/prds/linux-install-mvp.md`
  - FR32: completion reports must be generated from task state, evidence, and release gates.
  - FR33: PR creation, merge, and workspace cleanup remain terminal delivery actions requiring separate authority.
- Existing artifacts:
  - `docs/linux-install/goal-run-contract.md`
  - `docs/linux-install/fixtures/goal-run/missing-evidence.json`
  - `scripts/check-linux-install-contract.mjs`

### Target Files

- `docs/linux-install/fixtures/goal-run/missing-evidence.json`
- `scripts/check-linux-install-contract.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- This story file and BMAD local story copy.

### Implementation Guardrails

- Do not create a PR, merge, or clean workspaces in this story.
- Do not let passing commands substitute for missing evidence or unresolved blockers.
- Preserve terminal delivery as separately authorized work.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `node ./scripts/check-linux-install-contract.mjs`
- Full lane verification command sequence listed in Completion Notes.

### Completion Notes List

- Extended the missing-evidence fixture to include an open release gate, open blocker, and required terminal delivery authorities.
- Extended contract validation to reject completion when required evidence, blockers, release gates, or terminal delivery authority remain open.
- Marked Epic 4 as review in local sprint state.
- Verification passed:
  - `node ./scripts/check-linux-install-contract.mjs`
  - `node ./scripts/check-linux-install-lane.mjs`
  - `node ./scripts/check-doc-indexes.mjs`
  - `node ./scripts/check-linux-bootstrap.mjs`
  - `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

### File List

- `docs/linux-install/fixtures/goal-run/missing-evidence.json`
- `scripts/check-linux-install-contract.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- `docs/linux-install/planning/stories/4-6-generate-completion-reports-from-evidence.md`
- `_bmad-output/implementation-artifacts/4-6-generate-completion-reports-from-evidence.md`
