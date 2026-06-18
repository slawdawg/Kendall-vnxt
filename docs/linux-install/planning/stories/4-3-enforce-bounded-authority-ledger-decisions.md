---
baseline_commit: 83235d523a8b178ccfcc45723d4e8773269d976a
---

# Story 4.3: Enforce Bounded Authority Ledger Decisions

Status: done

## Story

As Bob,
I want generic approval language rejected and bounded authority entries accepted only when they match the task,
so that autonomous setup cannot expand into unsafe mutation.

## Acceptance Criteria

1. Given a task requires preauthorization, when the authority ledger is evaluated, then broad phrases such as "continue" or "do whatever is needed" are rejected.
2. Given a bounded authority entry is evaluated, when it authorizes a task, then it names authority family, operation, scope, command ids, targets, impact, evidence, recovery, approval reference, and stop lines.

## Tasks / Subtasks

- [x] Strengthen invalid preauthorization coverage. (AC: 1)
  - [x] Generic approval examples include continue, do whatever is needed, and finish it.
  - [x] Contract validation requires broad phrase examples.
- [x] Strengthen valid bounded authority coverage. (AC: 2)
  - [x] Valid preauthorization entries require non-empty bounded authority fields.
  - [x] Valid preauthorization must authorize the matching command id.
- [x] Update lane tracking and index coverage. (AC: 1-2)
  - [x] Story 4.3 is linked from `docs/linux-install/index.md`.
  - [x] Lane checker requires Story 4.3 and its coverage notes.
- [x] Run focused and full lane verification. (AC: 1-2)
  - [x] `node ./scripts/check-linux-install-contract.mjs`
  - [x] `node ./scripts/check-linux-install-lane.mjs`
  - [x] `node ./scripts/check-doc-indexes.mjs`
  - [x] `node ./scripts/check-linux-bootstrap.mjs`
  - [x] `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

## Dev Notes

### Source Context

- PRD: `docs/prds/linux-install-mvp.md`
  - FR29: autonomous `/goal` runs must reject generic approval language as preauthorization and accept only bounded authority ledger entries.
- Existing artifacts:
  - `docs/linux-install/goal-run-contract.md`
  - `docs/linux-install/fixtures/goal-run/invalid-preauthorization.json`
  - `docs/linux-install/fixtures/goal-run/valid-preauthorization.json`
  - `docs/linux-install/fixtures/goal-run/command-contracts.json`
  - `scripts/check-linux-install-contract.mjs`

### Target Files

- `docs/linux-install/fixtures/goal-run/invalid-preauthorization.json`
- `scripts/check-linux-install-contract.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- This story file and BMAD local story copy.

### Implementation Guardrails

- Do not treat generic "continue" language as authority.
- Do not authorize a preauthorized operation unless the entry names bounded fields and a matching command id.
- Do not add real host mutation or GitHub operations for this story.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `node ./scripts/check-linux-install-contract.mjs`
- Full lane verification command sequence listed in Completion Notes.

### Completion Notes List

- Added explicit generic approval examples to the invalid authority fixture.
- Extended contract validation so broad approval phrases and bounded authority fields are checked directly.
- Required valid preauthorization to authorize the matching command id.
- Verification passed:
  - `node ./scripts/check-linux-install-contract.mjs`
  - `node ./scripts/check-linux-install-lane.mjs`
  - `node ./scripts/check-doc-indexes.mjs`
  - `node ./scripts/check-linux-bootstrap.mjs`
  - `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

### File List

- `docs/linux-install/fixtures/goal-run/invalid-preauthorization.json`
- `scripts/check-linux-install-contract.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- `docs/linux-install/planning/stories/4-3-enforce-bounded-authority-ledger-decisions.md`
- `_bmad-output/implementation-artifacts/4-3-enforce-bounded-authority-ledger-decisions.md`
