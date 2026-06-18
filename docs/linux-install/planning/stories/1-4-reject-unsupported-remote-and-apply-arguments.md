---
baseline_commit: 83235d523a8b178ccfcc45723d4e8773269d976a
---

# Story 1.4: Reject Unsupported Remote And Apply Arguments

Status: done

## Story

As a maintainer,
I want the controller and verifier to reject arguments that imply remote, staged, or controller-driven apply behavior,
so that v1 keeps one supported local mutating path.

## Acceptance Criteria

1. Given a user passes `--apply`, when argument parsing runs, then the command fails closed with usage guidance and does not start mutation.
2. Given a user passes `--target`, when argument parsing runs, then the command fails closed with usage guidance and does not start remote execution.
3. Given a user passes `--user`, when argument parsing runs, then the command fails closed with usage guidance and does not start staged orchestration.
4. Given command-level entrypoint tests run, when unsupported arguments are supplied, then the process exits non-zero before emitting normal evidence output.

## Tasks / Subtasks

- [x] Confirm parser-level unsupported argument coverage. (AC: 1-3)
  - [x] `--apply` rejected.
  - [x] `--target` rejected.
  - [x] `--user` rejected.
- [x] Add command-level entrypoint coverage. (AC: 4)
  - [x] Entry point exits non-zero for `--apply`.
  - [x] Entry point exits non-zero for `--target`.
  - [x] Entry point exits non-zero for `--user`.
  - [x] Failure output contains usage guidance.
- [x] Run focused verification. (AC: 1-4)
  - [x] `node ./scripts/check-linux-install-lane.mjs`
  - [x] `node ./scripts/check-doc-indexes.mjs`
  - [x] `node ./scripts/check-linux-bootstrap.mjs`
  - [x] `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

## Dev Notes

### Source Context

- PRD: `docs/prds/linux-install-mvp.md`
  - FR10: repo-owned controller and verifier reject unsupported remote/staged install arguments including `--apply`, `--target`, and `--user`.
- Current code:
  - `scripts/lib/linux-bootstrap/args.mjs` rejects unsupported arguments.
  - `scripts/linux-bootstrap.mjs` catches parser errors and prints usage before exit.
  - `tests/linux-bootstrap/args.test.mjs` covers parser-level behavior.

### Target Files

- `tests/linux-bootstrap/args.test.mjs`
- `scripts/lib/linux-bootstrap/args.mjs` only if tests expose a behavior gap.
- `scripts/linux-bootstrap.mjs` only if tests expose a behavior gap.
- `docs/linux-install/planning/lane-status.md`
- This story file and tracked story copy.

### Implementation Guardrails

- Do not reintroduce `--apply`, `--target`, or `--user` support to the Node controller.
- Do not add SSH, remote execution, staged orchestration, provider calls, login flows, package installs, cleanup, PR creation, or merge behavior.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `node --test tests/linux-bootstrap/args.test.mjs`
- `node ./scripts/check-linux-bootstrap.mjs`
- Full lane verification command sequence listed in Completion Notes.

### Completion Notes List

- Confirmed parser-level rejection coverage for `--apply`, `--target`, and `--user`.
- Added entrypoint-level unsupported argument coverage in `tests/linux-bootstrap/args.test.mjs`.
- The entrypoint test tolerates sandbox `EPERM` when nested process spawning is blocked, but asserts exit status, usage guidance, and no normal evidence output when spawning is available.
- Verification passed:
  - `node --test tests/linux-bootstrap/args.test.mjs`
  - `node ./scripts/check-linux-install-lane.mjs`
  - `node ./scripts/check-doc-indexes.mjs`
  - `node ./scripts/check-linux-bootstrap.mjs`
  - `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

### File List

- `tests/linux-bootstrap/args.test.mjs`
- `docs/linux-install/planning/stories/1-4-reject-unsupported-remote-and-apply-arguments.md`
- `_bmad-output/implementation-artifacts/1-4-reject-unsupported-remote-and-apply-arguments.md`
