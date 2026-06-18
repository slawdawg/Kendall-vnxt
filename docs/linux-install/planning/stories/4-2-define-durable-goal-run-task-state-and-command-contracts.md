---
baseline_commit: 83235d523a8b178ccfcc45723d4e8773269d976a
---

# Story 4.2: Define Durable Goal Run Task State And Command Contracts

Status: done

## Story

As a Codex `/goal` operator,
I want each autonomous task to have explicit state and bounded command contracts,
so that long-running Linux setup work can resume safely after interruptions.

## Acceptance Criteria

1. Given a goal-run task is defined, when it is selected for execution, then it has state, mapped requirements, dependencies, authority class, allowed mode, last command, next command, evidence paths, completion condition, blocked condition, and resume command.
2. Given runnable command contracts are defined, when contract validation runs, then each command defines purpose, working directory, argv, timeout, authority requirement, allowed write paths, evidence output, structured exit behavior, failure type, closed stdin, and non-interactive execution.

## Tasks / Subtasks

- [x] Expand durable task-state fixture. (AC: 1)
  - [x] Add mapped requirements and dependencies.
  - [x] Add authority class, allowed mode, last command, next command, evidence paths, completion condition, blocked condition, and resume command.
- [x] Strengthen contract validation. (AC: 1-2)
  - [x] Blocked-continuation fixture tasks require full state fields.
  - [x] Existing command-contract validation continues to enforce bounded commands.
- [x] Update lane tracking and index coverage. (AC: 1-2)
  - [x] Story 4.2 is linked from `docs/linux-install/index.md`.
  - [x] Lane checker requires Story 4.2 and its coverage notes.
- [x] Run focused and full lane verification. (AC: 1-2)
  - [x] `node ./scripts/check-linux-install-contract.mjs`
  - [x] `node ./scripts/check-linux-install-lane.mjs`
  - [x] `node ./scripts/check-doc-indexes.mjs`
  - [x] `node ./scripts/check-linux-bootstrap.mjs`
  - [x] `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

## Dev Notes

### Source Context

- PRD: `docs/prds/linux-install-mvp.md`
  - FR28: autonomous tasks need durable state and bounded command contracts.
- Existing artifacts:
  - `docs/linux-install/goal-run-contract.md`
  - `docs/linux-install/fixtures/goal-run/blocked-continuation.json`
  - `docs/linux-install/fixtures/goal-run/command-contracts.json`
  - `scripts/check-linux-install-contract.mjs`

### Target Files

- `docs/linux-install/fixtures/goal-run/blocked-continuation.json`
- `scripts/check-linux-install-contract.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- This story file and BMAD local story copy.

### Implementation Guardrails

- Do not make state live only in chat.
- Do not allow runnable commands without bounded authority, closed stdin, timeout, evidence output, and structured failure behavior.
- Do not treat blocked dependencies as complete.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `node ./scripts/check-linux-install-contract.mjs`
- `node ./scripts/check-linux-bootstrap.mjs`
- Full lane verification command sequence listed in Completion Notes.

### Completion Notes List

- Expanded `blocked-continuation.json` tasks to include the durable task-state fields required by the Goal Run Contract.
- Extended `scripts/check-linux-install-contract.mjs` to validate those fields.
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
- `docs/linux-install/planning/stories/4-2-define-durable-goal-run-task-state-and-command-contracts.md`
- `_bmad-output/implementation-artifacts/4-2-define-durable-goal-run-task-state-and-command-contracts.md`
