---
baseline_commit: 83235d523a8b178ccfcc45723d4e8773269d976a
---

# Story 2.4: Block Cleanly When Private Repo Access Is Missing

Status: done

## Story

As a bootstrap operator,
I want missing private GitHub access to produce a clear blocked result,
so that I can perform manual repo auth without the installer starting auth flows.

## Acceptance Criteria

1. Given repo access is required but unavailable, when clone or repo probe fails due to authentication/access, then the bootstrap stops with manual repo-auth recovery instructions.
2. Given repo access is blocked before a repo evidence directory exists, when the bootstrap stops, then stdout contains blocked evidence for `repo-access`.
3. Given repo auth is missing, when bootstrap sources are scanned, then they do not start `gh auth login`, browser auth, device-code auth, token import, credential helper mutation, or provider login flows.

## Tasks / Subtasks

- [x] Confirm blocked repo-access evidence path. (AC: 1-2)
  - [x] Bootstrap writes blocked stdout evidence through `write_install_blocked_stdout_evidence`.
  - [x] Blocked evidence uses `repo-access`.
  - [x] Recovery guidance directs manual GitHub auth and rerun.
- [x] Strengthen auth-boundary regression coverage. (AC: 3)
  - [x] `gh auth login` is forbidden.
  - [x] Device-code and browser auth automation are forbidden.
  - [x] Token import and credential helper mutation are forbidden.
- [x] Update lane tracking and index coverage. (AC: 1-3)
  - [x] Story 2.4 is linked from `docs/linux-install/index.md`.
  - [x] Lane checker requires Story 2.4 and its coverage notes.
- [x] Run focused and full lane verification. (AC: 1-3)
  - [x] `node --test tests/linux-bootstrap/auth-boundary.test.mjs tests/linux-bootstrap/bootstrap-script.test.mjs`
  - [x] `node ./scripts/check-linux-install-lane.mjs`
  - [x] `node ./scripts/check-doc-indexes.mjs`
  - [x] `node ./scripts/check-linux-bootstrap.mjs`
  - [x] `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

## Dev Notes

### Source Context

- PRD: `docs/prds/linux-install-mvp.md`
  - FR15: missing private GitHub access must stop with manual repo-auth recovery instructions instead of initiating authentication.
  - FR19: pre-repo access blockers must emit schema-compliant blocked stdout evidence.
  - FR22: bootstrap must never automate login, browser auth, token writes, or credential helper mutation.
- Existing code:
  - `scripts/bootstrap-linux.sh` emits blocked stdout evidence when repo access is unavailable.
  - `tests/linux-bootstrap/auth-boundary.test.mjs` scans bootstrap sources for forbidden auth automation.
  - `tests/linux-bootstrap/bootstrap-script.test.mjs` checks blocked stdout evidence wiring.

### Target Files

- `tests/linux-bootstrap/auth-boundary.test.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- This story file and BMAD local story copy.

### Implementation Guardrails

- Do not add `gh auth login`, browser auth, device-code flows, token import, credential helper mutation, provider auth, private key handling, SSH orchestration, reboot, cleanup, PR creation, merge, or workspace cleanup.
- Missing repo access is a blocked state with manual recovery, not an automated auth workflow.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `node --test tests/linux-bootstrap/auth-boundary.test.mjs tests/linux-bootstrap/bootstrap-script.test.mjs`
- `node ./scripts/check-linux-bootstrap.mjs`
- Full lane verification command sequence listed in Completion Notes.

### Completion Notes List

- Confirmed existing blocked stdout evidence path for missing repo access.
- Extended auth-boundary tests to forbid GitHub auth login, device-code/browser auth automation, token import, and credential helper mutation.
- Verification passed:
  - `node --test tests/linux-bootstrap/auth-boundary.test.mjs tests/linux-bootstrap/bootstrap-script.test.mjs`
  - `node ./scripts/check-linux-install-lane.mjs`
  - `node ./scripts/check-doc-indexes.mjs`
  - `node ./scripts/check-linux-bootstrap.mjs`
  - `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

### File List

- `tests/linux-bootstrap/auth-boundary.test.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- `docs/linux-install/planning/stories/2-4-block-cleanly-when-private-repo-access-is-missing.md`
- `_bmad-output/implementation-artifacts/2-4-block-cleanly-when-private-repo-access-is-missing.md`
