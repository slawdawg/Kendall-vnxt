---
baseline_commit: 83235d523a8b178ccfcc45723d4e8773269d976a
---

# Story 3.1: Write Schema-Compliant Success Failure And Blocked Evidence

Status: review

## Story

As a release reviewer,
I want every eligible bootstrap outcome to produce schema-compliant evidence,
so that pass, fail, and blocked results can be audited without relying on chat history.

## Acceptance Criteria

1. Given the approved repo evidence directory is known, when bootstrap exits with pass status, then it writes evidence that validates against `docs/linux-install/evidence/schema.md`.
2. Given the approved repo evidence directory is known, when bootstrap exits with fail status, then it writes evidence that records the failed check and recovery path.
3. Given bootstrap exits with blocked status, when blocked evidence is emitted, then it records a blocked check, blocked result, blocked summary count, and recovery path.
4. Given install evidence is validated, when `checks_summary.blocked` is supplied, then it must match the actual blocked check count.

## Tasks / Subtasks

- [x] Strengthen blocked evidence schema validation. (AC: 3-4)
  - [x] Blocked install evidence includes `checks_summary.blocked`.
  - [x] Schema validation rejects mismatched blocked summary counts.
- [x] Update shell evidence writer. (AC: 2-4)
  - [x] `write_install_outcome_evidence` emits blocked summary count.
  - [x] Failure evidence keeps failed summary count.
  - [x] Blocked evidence keeps result and recovery guidance.
- [x] Update lane tracking and index coverage. (AC: 1-4)
  - [x] Story 3.1 is linked from `docs/linux-install/index.md`.
  - [x] Lane checker requires Story 3.1 and its coverage notes.
- [x] Run focused and full lane verification. (AC: 1-4)
  - [x] `node --test tests/linux-bootstrap/evidence-schema.test.mjs tests/linux-bootstrap/bootstrap-script.test.mjs`
  - [x] `node ./scripts/check-linux-install-lane.mjs`
  - [x] `node ./scripts/check-doc-indexes.mjs`
  - [x] `node ./scripts/check-linux-bootstrap.mjs`
  - [x] `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

## Dev Notes

### Source Context

- PRD: `docs/prds/linux-install-mvp.md`
  - FR18: eligible bootstrap outcomes must write schema-compliant evidence.
  - FR20: evidence must include result and recovery instructions.
- Evidence schema: `docs/linux-install/evidence/schema.md`
  - Pass evidence must not contain failed checks.
  - Fail evidence must contain a failed check.
  - Blocked evidence must contain a blocked check and manual recovery guidance.
- Existing code:
  - `scripts/bootstrap-linux.sh` writes install failure and blocked evidence.
  - `scripts/validate-linux-install.sh` writes final pass/fail verification evidence.
  - `scripts/lib/linux-bootstrap/evidence-schema.mjs` validates install evidence.

### Target Files

- `scripts/bootstrap-linux.sh`
- `scripts/lib/linux-bootstrap/evidence-schema.mjs`
- `tests/linux-bootstrap/evidence-schema.test.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- This story file and BMAD local story copy.

### Implementation Guardrails

- Do not weaken existing pass/fail consistency checks.
- Do not require old evidence packets without `checks_summary.blocked` to fail.
- Do not include secrets, credential output, auth URLs, device codes, token values, shell history, or environment dumps in evidence.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `node --test tests/linux-bootstrap/evidence-schema.test.mjs tests/linux-bootstrap/bootstrap-script.test.mjs`
- `node ./scripts/check-linux-bootstrap.mjs`
- Full lane verification command sequence listed in Completion Notes.

### Completion Notes List

- Added optional strict validation for `checks_summary.blocked` when supplied.
- Updated shell install outcome evidence to emit blocked summary count.
- Verification passed:
  - `node --test tests/linux-bootstrap/evidence-schema.test.mjs tests/linux-bootstrap/bootstrap-script.test.mjs`
  - `node ./scripts/check-linux-install-lane.mjs`
  - `node ./scripts/check-doc-indexes.mjs`
  - `node ./scripts/check-linux-bootstrap.mjs`
  - `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

### File List

- `scripts/bootstrap-linux.sh`
- `scripts/lib/linux-bootstrap/evidence-schema.mjs`
- `tests/linux-bootstrap/evidence-schema.test.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- `docs/linux-install/planning/stories/3-1-write-schema-compliant-success-failure-and-blocked-evidence.md`
- `_bmad-output/implementation-artifacts/3-1-write-schema-compliant-success-failure-and-blocked-evidence.md`
