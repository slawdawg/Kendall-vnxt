---
baseline_commit: 83235d523a8b178ccfcc45723d4e8773269d976a
---

# Story 3.2: Emit Pre-Repo Blocked Evidence Safely

Status: done

## Story

As a bootstrap operator,
I want repo-access blockers before checkout availability to produce parseable stdout evidence,
so that private repo access failures still leave a usable recovery packet.

## Acceptance Criteria

1. Given repo access is blocked before an approved evidence directory exists, when the bootstrap exits, then stdout contains schema-compliant blocked evidence.
2. Given blocked stdout evidence is emitted, when stdout is parsed as JSON, then it validates as install evidence with `result: "blocked"` and `repo-access` check status `blocked`.
3. Given progress logs are produced during bootstrap, when blocked stdout evidence is emitted, then progress logs stay off stdout so stdout remains parseable.
4. Given tests need to exercise shell evidence helpers, when the shell script is sourced, then command-line execution does not run automatically.

## Tasks / Subtasks

- [x] Add runtime blocked stdout evidence coverage. (AC: 1-3)
  - [x] Source shell helper and emit blocked repo-access evidence to stdout.
  - [x] Parse stdout as JSON.
  - [x] Validate emitted evidence with install evidence schema.
  - [x] Assert stderr is empty for the helper path.
- [x] Make shell helper functions source-safe. (AC: 4)
  - [x] Wrap CLI argument handling in `main`.
  - [x] Add Bash source guard before invoking `main "$@"`.
- [x] Update lane tracking and index coverage. (AC: 1-4)
  - [x] Story 3.2 is linked from `docs/linux-install/index.md`.
  - [x] Lane checker requires Story 3.2 and its coverage notes.
- [x] Run focused and full lane verification. (AC: 1-4)
  - [x] `node --test tests/linux-bootstrap/bootstrap-script.test.mjs`
  - [x] `node ./scripts/check-linux-install-lane.mjs`
  - [x] `node ./scripts/check-doc-indexes.mjs`
  - [x] `node ./scripts/check-linux-bootstrap.mjs`
  - [x] `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

## Dev Notes

### Source Context

- PRD: `docs/prds/linux-install-mvp.md`
  - FR19: repo-access blockers before repo evidence availability must emit schema-compliant blocked stdout evidence.
  - NFR3: evidence must exclude secrets and auth flow details.
- Existing code:
  - `scripts/bootstrap-linux.sh` owns pre-repo blocked stdout evidence.
  - `tests/linux-bootstrap/bootstrap-script.test.mjs` checks shell bootstrap behavior.
  - `scripts/lib/linux-bootstrap/evidence-schema.mjs` validates install evidence.

### Target Files

- `scripts/bootstrap-linux.sh`
- `tests/linux-bootstrap/bootstrap-script.test.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- This story file and BMAD local story copy.

### Implementation Guardrails

- Do not write pre-repo blocked evidence to an unvalidated file path.
- Do not print progress logs to stdout when stdout evidence is expected.
- Do not include tokens, auth URLs, device codes, credential helper output, shell history, or environment dumps.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `node --test tests/linux-bootstrap/bootstrap-script.test.mjs`
- `node ./scripts/check-linux-bootstrap.mjs`
- Full lane verification command sequence listed in Completion Notes.

### Completion Notes List

- Added runtime coverage that sources the shell script, emits blocked repo-access evidence to stdout, parses it, and validates schema.
- Refactored shell CLI execution behind `main "$@"` with a source guard so helper functions can be tested without executing the install command.
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
- `docs/linux-install/planning/stories/3-2-emit-pre-repo-blocked-evidence-safely.md`
- `_bmad-output/implementation-artifacts/3-2-emit-pre-repo-blocked-evidence-safely.md`
