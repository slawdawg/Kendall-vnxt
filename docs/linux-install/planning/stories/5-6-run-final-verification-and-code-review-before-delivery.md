---
baseline_commit: 83235d523a8b178ccfcc45723d4e8773269d976a
---

# Story 5.6: Run Final Verification And Code Review Before Delivery

Status: review

## Story

As a release reviewer,
I want final checks and code review completed before PR delivery,
so that Linux install MVP delivery is based on verified behavior and reviewed changes.

## Acceptance Criteria

1. Given the release candidate is ready, when final verification runs, then targeted parser, gate, executor, evidence schema, auth denylist, docs, Linux bootstrap checks, and any story-specific checks pass or are explicitly blocked with evidence.
2. Given PR delivery is considered, when code review findings exist, then findings are resolved or intentionally deferred before PR creation.

## Tasks / Subtasks

- [x] Run pre-PR local review. (AC: 2)
  - [x] Pre-PR code review artifact records the fixed contract-checker robustness finding.
  - [x] Fix actionable review finding before PR.
- [x] Run final local verification. (AC: 1)
  - [x] Final local verification passes while release evidence blockers remain explicit.
- [x] Preserve PR stop line. (AC: 1-2)
  - [x] No PR is created until blocked release evidence and review gates are resolved.
- [x] Update lane tracking and index coverage. (AC: 1-2)
  - [x] Story 5.6 is linked from `docs/linux-install/index.md`.
  - [x] Pre-PR review report is linked from `docs/linux-install/index.md`.
- [x] Run focused and full lane verification. (AC: 1-2)
  - [x] `git diff --check`
  - [x] `node ./scripts/check-linux-install-contract.mjs`
  - [x] `node ./scripts/check-linux-install-lane.mjs`
  - [x] `node ./scripts/check-doc-indexes.mjs`
  - [x] `node ./scripts/check-linux-bootstrap.mjs`
  - [x] `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

## Dev Notes

### Source Context

- PRD: `docs/prds/linux-install-mvp.md`
  - FR38: final verification must pass before PR.
  - FR39: code review and approval must occur before PR creation; PR merge waits for GitHub CI and unresolved comments.
- Existing artifacts:
  - `docs/linux-install/planning/reviews/pre-pr-code-review-2026-06-18.md`
  - `scripts/check-linux-install-contract.mjs`
  - `scripts/check-linux-install-lane.mjs`

### Target Files

- `docs/linux-install/planning/reviews/pre-pr-code-review-2026-06-18.md`
- `scripts/check-linux-install-contract.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- This story file and BMAD local story copy.

### Implementation Guardrails

- Do not create a PR while release evidence blockers remain.
- Do not skip code-review findings; fix or explicitly defer them before PR.
- Keep GitHub CI, comment resolution, and merge as terminal delivery work after PR creation.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `git diff --check`
- `node ./scripts/check-linux-install-contract.mjs`
- Full lane verification command sequence listed in Completion Notes.

### Completion Notes List

- Performed BMAD code-review solo fallback because subagent and party-mode tooling were unavailable.
- Fixed the contract checker robustness finding before delivery.
- Recorded review evidence in `docs/linux-install/planning/reviews/pre-pr-code-review-2026-06-18.md`.
- Refreshed the pre-PR review note after release evidence capture and package refresh.
- Verification passed:
  - `git diff --check`
  - `node ./scripts/check-linux-install-contract.mjs`
  - `node ./scripts/check-linux-install-lane.mjs`
  - `node ./scripts/check-doc-indexes.mjs`
  - `node ./scripts/check-linux-bootstrap.mjs`
  - `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`
  - `python3 -m zipfile -t docs/linux-install.zip`

### File List

- `docs/linux-install/planning/reviews/pre-pr-code-review-2026-06-18.md`
- `scripts/check-linux-install-contract.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- `docs/linux-install/planning/stories/5-6-run-final-verification-and-code-review-before-delivery.md`
- `_bmad-output/implementation-artifacts/5-6-run-final-verification-and-code-review-before-delivery.md`
