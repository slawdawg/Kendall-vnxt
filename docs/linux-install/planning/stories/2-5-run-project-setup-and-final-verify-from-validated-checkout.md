---
baseline_commit: 83235d523a8b178ccfcc45723d4e8773269d976a
---

# Story 2.5: Run Project Setup And Final Verify From Validated Checkout

Status: review

## Story

As a maintainer,
I want setup and validation to run only after repo state is proven,
so that successful install evidence reflects a real Kendall_Nxt-ready checkout.

## Acceptance Criteria

1. Given the repo checkout passes validation, when bootstrap setup proceeds, then project setup runs from that checkout.
2. Given project setup fails after repo validation, when the bootstrap exits, then failure evidence is written and recovery guidance points back to the same single install command.
3. Given final Linux install validation fails, when the bootstrap exits, then the operator is told to inspect the evidence path and rerun after fixing failed checks.
4. Given final Linux install validation passes, when the bootstrap completes, then evidence was written by `scripts/validate-linux-install.sh --verify-only` from the validated checkout.

## Tasks / Subtasks

- [x] Add focused setup/final-validation sequence coverage. (AC: 1-4)
  - [x] `ensure_repo` precedes repo evidence directory use and project setup.
  - [x] Project setup runs from `$repo_path`.
  - [x] Setup failure writes failure evidence.
  - [x] Final validation runs from `$repo_path` and writes evidence.
  - [x] Final validation failure has recovery guidance and evidence pointer.
- [x] Harden final validation failure handling. (AC: 3-4)
  - [x] Wrap final validation subshell in explicit failure handling.
  - [x] Preserve evidence path in final validation failure guidance.
- [x] Update lane tracking and index coverage. (AC: 1-4)
  - [x] Story 2.5 is linked from `docs/linux-install/index.md`.
  - [x] Lane checker requires Story 2.5 and its coverage notes.
- [x] Run focused and full lane verification. (AC: 1-4)
  - [x] `node --test tests/linux-bootstrap/bootstrap-script.test.mjs`
  - [x] `node ./scripts/check-linux-install-lane.mjs`
  - [x] `node ./scripts/check-doc-indexes.mjs`
  - [x] `node ./scripts/check-linux-bootstrap.mjs`
  - [x] `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

## Dev Notes

### Source Context

- PRD: `docs/prds/linux-install-mvp.md`
  - FR16: run project setup from the validated repo checkout.
  - FR17: final verification must pass before success is reported.
  - FR20: evidence must include result and recovery instructions.
- Existing code:
  - `scripts/bootstrap-linux.sh` validates or clones repo state before setup.
  - `scripts/validate-linux-install.sh --verify-only` writes final install evidence.
  - `tests/linux-bootstrap/bootstrap-script.test.mjs` statically verifies bootstrap shell behavior.

### Target Files

- `scripts/bootstrap-linux.sh`
- `tests/linux-bootstrap/bootstrap-script.test.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- This story file and BMAD local story copy.

### Implementation Guardrails

- Do not run setup before repo validation.
- Do not report success before final validation passes.
- Do not add provider login, repo auth automation, cleanup, PR creation, merge, or workspace cleanup.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `node --test tests/linux-bootstrap/bootstrap-script.test.mjs`
- `node ./scripts/check-linux-bootstrap.mjs`
- Full lane verification command sequence listed in Completion Notes.

### Completion Notes List

- Added focused shell-source coverage for setup/final-validation sequencing after repo validation.
- Wrapped final validation in explicit failure handling with evidence-path recovery guidance.
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
- `docs/linux-install/planning/stories/2-5-run-project-setup-and-final-verify-from-validated-checkout.md`
- `_bmad-output/implementation-artifacts/2-5-run-project-setup-and-final-verify-from-validated-checkout.md`
