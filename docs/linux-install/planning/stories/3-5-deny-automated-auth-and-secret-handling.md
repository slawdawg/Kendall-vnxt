---
baseline_commit: 83235d523a8b178ccfcc45723d4e8773269d976a
---

# Story 3.5: Deny Automated Auth And Secret Handling

Status: review

## Story

As an installer operator,
I want the bootstrap to identify manual auth tasks without performing them,
so that credentials and provider accounts stay under user control.

## Acceptance Criteria

1. Given GitHub, Codex, Claude, Tailscale, or provider auth is absent, when the bootstrap summarizes auth readiness, then it lists manual post-deployment tasks where relevant.
2. Given bootstrap sources are scanned, when auth-boundary validation runs, then login flows, browser/device-code auth, token writes, credential helper mutation, provider calls, and private-key handling are rejected.
3. Given evidence is emitted, when schema validation runs, then auth-boundary fields remain false and required manual auth task rows are present.

## Tasks / Subtasks

- [x] Strengthen auth-boundary source scan. (AC: 2)
  - [x] GitHub auth login, token, refresh, and setup-git commands are forbidden.
  - [x] Device-code and browser auth automation are forbidden.
  - [x] Token import and credential helper mutation are forbidden.
  - [x] `ssh-add` and private-key file handling commands are forbidden.
- [x] Confirm manual auth evidence coverage. (AC: 1, 3)
  - [x] Required manual task IDs remain validated by schema tests.
  - [x] Auth-boundary booleans must remain false.
- [x] Update lane tracking and index coverage. (AC: 1-3)
  - [x] Story 3.5 is linked from `docs/linux-install/index.md`.
  - [x] Lane checker requires Story 3.5 and its coverage notes.
- [x] Run focused and full lane verification. (AC: 1-3)
  - [x] `node --test tests/linux-bootstrap/auth-boundary.test.mjs`
  - [x] `node ./scripts/check-linux-install-lane.mjs`
  - [x] `node ./scripts/check-doc-indexes.mjs`
  - [x] `node ./scripts/check-linux-bootstrap.mjs`
  - [x] `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

## Dev Notes

### Source Context

- PRD: `docs/prds/linux-install-mvp.md`
  - FR22: bootstrap must never automate login, token writes, credential helper mutation, provider auth, browser auth, or private-key handling.
  - FR23: bootstrap must list manual post-deployment auth tasks where relevant.
- Existing code:
  - `tests/linux-bootstrap/auth-boundary.test.mjs` scans bootstrap sources for forbidden auth automation.
  - `scripts/lib/linux-bootstrap/evidence-schema.mjs` validates manual tasks and auth-boundary booleans.

### Target Files

- `tests/linux-bootstrap/auth-boundary.test.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- This story file and BMAD local story copy.

### Implementation Guardrails

- Do not add login flows, browser/device-code auth, token import, credential helper mutation, provider calls, private-key reads/writes, or SSH key-agent commands.
- Manual auth task rows are metadata only; they must not become execution steps.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `node --test tests/linux-bootstrap/auth-boundary.test.mjs`
- `node ./scripts/check-linux-bootstrap.mjs`
- Full lane verification command sequence listed in Completion Notes.

### Completion Notes List

- Extended source scan to reject additional GitHub auth commands, `ssh-add`, and private-key file handling commands.
- Confirmed existing schema validation enforces required manual tasks and false auth-boundary booleans.
- Verification passed:
  - `node --test tests/linux-bootstrap/auth-boundary.test.mjs`
  - `node ./scripts/check-linux-install-lane.mjs`
  - `node ./scripts/check-doc-indexes.mjs`
  - `node ./scripts/check-linux-bootstrap.mjs`
  - `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

### File List

- `tests/linux-bootstrap/auth-boundary.test.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- `docs/linux-install/planning/stories/3-5-deny-automated-auth-and-secret-handling.md`
- `_bmad-output/implementation-artifacts/3-5-deny-automated-auth-and-secret-handling.md`
