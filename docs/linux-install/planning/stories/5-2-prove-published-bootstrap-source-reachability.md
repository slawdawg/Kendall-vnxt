---
baseline_commit: 83235d523a8b178ccfcc45723d4e8773269d976a
---

# Story 5.2: Prove Published Bootstrap Source Reachability

Status: review

## Story

As a release reviewer,
I want the documented bootstrap source to be reachable by the intended installer audience,
so that the published command is not claimed feature-complete before it can be downloaded.

## Acceptance Criteria

1. Given the documented GitHub `main` bootstrap URL is used, when the URL reachability check runs, then the response must be HTTP 200 and contain the expected bootstrap content before the published command is claimed complete.
2. Given only local workspace or pre-merge proof exists, when release readiness is evaluated, then the published `main` command remains unproven and the known publication gap remains visible.

## Tasks / Subtasks

- [x] Preserve the published reachability gate. (AC: 1-2)
  - [x] Published main proof cannot be claimed until pnpm run check:linux-bootstrap-url passes.
  - [x] Known raw GitHub main 404 gap remains documented.
- [x] Strengthen contract validation for source proof boundaries. (AC: 1-2)
  - [x] Contract validation guards pre-merge proof from being represented as published main proof.
  - [x] Contract validation requires the URL checker command in the proof procedure.
- [x] Update lane tracking and index coverage. (AC: 1-2)
  - [x] Story 5.2 is linked from `docs/linux-install/index.md`.
  - [x] Lane checker requires Story 5.2 and its coverage notes.
- [x] Run focused and full lane verification. (AC: 1-2)
  - [x] `node ./scripts/check-linux-install-contract.mjs`
  - [x] `node ./scripts/check-linux-install-lane.mjs`
  - [x] `node ./scripts/check-doc-indexes.mjs`
  - [x] `node ./scripts/check-linux-bootstrap.mjs`
  - [x] `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

## Dev Notes

### Source Context

- PRD: `docs/prds/linux-install-mvp.md`
  - FR34: documented bootstrap URL or alternate published source must be reachable before the GitHub `main` command is called feature-complete.
  - NFR7: publication claims must be evidence-backed; pre-merge workspace or branch proof must not be represented as published `main` proof.
- Existing artifacts:
  - `scripts/check-linux-bootstrap-url.mjs`
  - `docs/linux-install/fresh-host-proof-procedure.md`
  - `docs/linux-install/one-command-bootstrap-plan.md`
  - `scripts/check-linux-install-contract.mjs`

### Target Files

- `scripts/check-linux-install-contract.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- This story file and BMAD local story copy.

### Implementation Guardrails

- Do not claim the published GitHub `main` command is feature-complete without real URL reachability evidence.
- Do not run network checks as part of routine local verification in this restricted workspace.
- Keep pre-merge local proof clearly separate from published-source proof.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `node ./scripts/check-linux-install-contract.mjs`
- Full lane verification command sequence listed in Completion Notes.

### Completion Notes List

- Added contract validation for the proof-procedure rule that published `main` proof requires `pnpm run check:linux-bootstrap-url`.
- Added contract validation for the known raw GitHub `main` 404 publication gap and pre-merge proof boundary.
- Captured passing published bootstrap URL reachability evidence at `docs/linux-install/evidence/bootstrap-url-reachability-20260618T200827Z.json`.
- Verification passed:
  - `node ./scripts/check-linux-install-contract.mjs`
  - `node ./scripts/check-linux-install-lane.mjs`
  - `node ./scripts/check-doc-indexes.mjs`
  - `node ./scripts/check-linux-bootstrap.mjs`
  - `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

### File List

- `scripts/check-linux-install-contract.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- `docs/linux-install/planning/stories/5-2-prove-published-bootstrap-source-reachability.md`
- `_bmad-output/implementation-artifacts/5-2-prove-published-bootstrap-source-reachability.md`
