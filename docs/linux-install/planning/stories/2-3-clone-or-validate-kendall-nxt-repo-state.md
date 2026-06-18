---
baseline_commit: 83235d523a8b178ccfcc45723d4e8773269d976a
---

# Story 2.3: Clone Or Validate Kendall_Nxt Repo State

Status: done

## Story

As a bootstrap operator,
I want the installer to clone the repo when allowed or validate an existing checkout,
so that setup runs only against the intended Kendall_Nxt repository.

## Acceptance Criteria

1. Given the target repo path is missing and repo access is available, when the bootstrap reaches repo setup, then it clones the expected Kendall_Nxt repo.
2. Given the target path already exists, when repo validation runs, then the path must be a Git checkout with an `origin` remote matching the expected repo URL.
3. Given the existing checkout is missing origin, has the wrong origin, fails git status validation, or clone fails, when repo setup runs, then the bootstrap fails before setup with recovery guidance.

## Tasks / Subtasks

- [x] Add focused repo-state test coverage. (AC: 1-3)
  - [x] Existing repo origin validation is asserted.
  - [x] Clone path uses non-interactive `git ls-remote` and the expected repo URL.
  - [x] GitHub CLI and direct git clone failures have recovery guidance.
- [x] Harden repo validation and clone failure paths. (AC: 1-3)
  - [x] Existing checkout `git status` failure exits with recovery guidance.
  - [x] GitHub CLI clone failure exits with recovery guidance.
  - [x] Direct git clone failure exits with recovery guidance.
- [x] Update lane tracking and index coverage. (AC: 1-3)
  - [x] Story 2.3 is linked from `docs/linux-install/index.md`.
  - [x] Lane checker requires Story 2.3 and its coverage notes.
- [x] Run focused and full lane verification. (AC: 1-3)
  - [x] `node --test tests/linux-bootstrap/bootstrap-script.test.mjs`
  - [x] `node ./scripts/check-linux-install-lane.mjs`
  - [x] `node ./scripts/check-doc-indexes.mjs`
  - [x] `node ./scripts/check-linux-bootstrap.mjs`
  - [x] `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

## Dev Notes

### Source Context

- PRD: `docs/prds/linux-install-mvp.md`
  - FR13: clone the Kendall_Nxt repo when access is already available and the target path is missing.
  - FR14: validate existing checkout origin before setup.
- Existing code:
  - `scripts/bootstrap-linux.sh` owns mutating clone/validate behavior.
  - `tests/linux-bootstrap/bootstrap-script.test.mjs` statically verifies bootstrap shell behavior.

### Target Files

- `scripts/bootstrap-linux.sh`
- `tests/linux-bootstrap/bootstrap-script.test.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- This story file and BMAD local story copy.

### Implementation Guardrails

- Do not run project setup until repo state is validated.
- Do not automate login or credential helper mutation when repo access is missing.
- Keep clone recovery guidance bounded to repo access/path state and rerunning the same single install command.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `node --test tests/linux-bootstrap/bootstrap-script.test.mjs`
- `node ./scripts/check-linux-bootstrap.mjs`
- Full lane verification command sequence listed in Completion Notes.

### Completion Notes List

- Added focused repo-state tests for origin validation, non-interactive repo probing, clone commands, and clone recovery guidance.
- Hardened existing checkout `git status`, GitHub CLI clone, and direct git clone failures with fail-closed recovery messages.
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
- `docs/linux-install/planning/stories/2-3-clone-or-validate-kendall-nxt-repo-state.md`
- `_bmad-output/implementation-artifacts/2-3-clone-or-validate-kendall-nxt-repo-state.md`
