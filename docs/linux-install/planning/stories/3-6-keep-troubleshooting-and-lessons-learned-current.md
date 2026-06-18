---
baseline_commit: 83235d523a8b178ccfcc45723d4e8773269d976a
---

# Story 3.6: Keep Troubleshooting And Lessons Learned Current

Status: done

## Story

As a future installer operator,
I want failed assumptions and recovery steps captured in docs,
so that repeated Linux install failures are not rediscovered from chat history.

## Acceptance Criteria

1. Given install command, assumption, or user-step failures are discovered during Linux setup work, when the work pass completes, then troubleshooting or lessons learned docs are updated.
2. Given evidence path, blocked evidence, final validation, or sensitive evidence failures occur, when docs are updated, then they point to the relevant command family and recovery path.
3. Given future operators read lessons learned, when they inspect the 2026-06-18 entries, then they can see why runtime evidence tests, blocked counts, and evidence path traversal tests were added.

## Tasks / Subtasks

- [x] Update troubleshooting with lane-discovered recovery paths. (AC: 1-2)
  - [x] Evidence path rejection recovery.
  - [x] Blocked repo access stdout parseability recovery.
  - [x] Final validation failure recovery.
- [x] Update lessons learned with durable implementation lessons. (AC: 1-3)
  - [x] Runtime tests are needed for shell evidence helpers.
  - [x] Blocked evidence summaries need explicit blocked counts.
  - [x] Evidence path validation must cover traversal and absolute paths.
- [x] Update lane tracking and index coverage. (AC: 1-3)
  - [x] Story 3.6 is linked from `docs/linux-install/index.md`.
  - [x] Lane checker requires Story 3.6 and its coverage notes.
- [x] Run full lane verification. (AC: 1-3)
  - [x] `node ./scripts/check-linux-install-lane.mjs`
  - [x] `node ./scripts/check-doc-indexes.mjs`
  - [x] `node ./scripts/check-linux-bootstrap.mjs`
  - [x] `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

## Dev Notes

### Source Context

- PRD: `docs/prds/linux-install-mvp.md`
  - FR26: failed assumptions and recovery steps must be captured in troubleshooting, lessons learned, or the relevant playbook.
- Existing docs:
  - `docs/linux-install/troubleshooting.md`
  - `docs/linux-install/lessons-learned.md`

### Target Files

- `docs/linux-install/troubleshooting.md`
- `docs/linux-install/lessons-learned.md`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- This story file and BMAD local story copy.

### Implementation Guardrails

- Keep docs symptom-first and command-family oriented.
- Do not include secrets, raw auth output, shell history, environment dumps, private keys, or broad home-directory listings.
- Do not introduce a new install method in troubleshooting.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `node ./scripts/check-linux-install-lane.mjs`
- `node ./scripts/check-doc-indexes.mjs`
- `node ./scripts/check-linux-bootstrap.mjs`
- `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

### Completion Notes List

- Added troubleshooting entries for evidence path rejection, blocked repo-access stdout parseability, and final validation failure.
- Added lessons learned entries for runtime shell evidence tests, blocked summary counts, and evidence path traversal/absolute-path coverage.
- Verification passed:
  - `node ./scripts/check-linux-install-lane.mjs`
  - `node ./scripts/check-doc-indexes.mjs`
  - `node ./scripts/check-linux-bootstrap.mjs`
  - `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

### File List

- `docs/linux-install/troubleshooting.md`
- `docs/linux-install/lessons-learned.md`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- `docs/linux-install/planning/stories/3-6-keep-troubleshooting-and-lessons-learned-current.md`
- `_bmad-output/implementation-artifacts/3-6-keep-troubleshooting-and-lessons-learned-current.md`
