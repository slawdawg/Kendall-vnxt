---
baseline_commit: 83235d523a8b178ccfcc45723d4e8773269d976a
---

# Story 1.5: Enforce Shell Bootstrap As The Only Mutating Install Path

Status: done

## Story

As a release reviewer,
I want static and runtime checks proving `scripts/bootstrap-linux.sh --install-kendall-vnxt` is the only v1 mutating install command,
so that docs and code cannot drift into multiple install methods.

## Acceptance Criteria

1. Given Linux bootstrap checks run, when active docs and command references are scanned, then only `scripts/bootstrap-linux.sh --install-kendall-vnxt` is treated as mutating.
2. Given Linux bootstrap checks run, when unsupported command references are scanned, then Node controller, validate script, remote, apply, staged, or SSH-driven mutation references fail the contract check.
3. Given historical or lab-instance notes are present, when the docs index is scanned, then those notes remain fenced from v1 install authority and cannot override the single-method boundary.
4. Given regression tests run, when the contract checker validator is imported directly, then alternate mutating command claims and missing historical fencing produce actionable failures.

## Tasks / Subtasks

- [x] Add direct contract validator coverage. (AC: 1-4)
  - [x] Alternate Node/controller mutating install command is rejected.
  - [x] Historical/lab note fencing is required.
- [x] Extend the install contract checker. (AC: 1-3)
  - [x] Active docs must include the canonical mutating command.
  - [x] Active docs reject alternate mutating command language.
  - [x] `docs/linux-install/index.md` must preserve historical/lab note fencing.
- [x] Update lane tracking and index coverage. (AC: 1-4)
  - [x] Story 1.5 is linked from `docs/linux-install/index.md`.
  - [x] Lane checker requires Story 1.5 and its coverage notes.
- [x] Run focused and full lane verification. (AC: 1-4)
  - [x] `node --test tests/linux-bootstrap/package-scripts.test.mjs`
  - [x] `node ./scripts/check-linux-install-contract.mjs`
  - [x] `node ./scripts/check-linux-install-lane.mjs`
  - [x] `node ./scripts/check-doc-indexes.mjs`
  - [x] `node ./scripts/check-linux-bootstrap.mjs`
  - [x] `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

## Dev Notes

### Source Context

- PRD: `docs/prds/linux-install-mvp.md`
  - FR9: `scripts/bootstrap-linux.sh --install-kendall-vnxt` is the only mutating v1 install command.
  - FR25 and NFR10: supported install docs must stay separate from historical, lab, SSH, remote, or platform-evaluation notes.
- Architecture input: `docs/linux-install/planning/linux-install-architecture-input.md`
  - The shell bootstrap script is the only mutating install command.
  - Node controller modes are planning and verification only.
- Existing code:
  - `scripts/check-linux-install-contract.mjs` is the active static drift checker used by `scripts/check-linux-bootstrap.mjs`.
  - `tests/linux-bootstrap/package-scripts.test.mjs` imports contract-checker helpers for focused regression coverage.

### Target Files

- `scripts/check-linux-install-contract.mjs`
- `tests/linux-bootstrap/package-scripts.test.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- This story file and BMAD local story copy.

### Implementation Guardrails

- Do not create another mutating command surface.
- Do not make the Node controller, validate script, `linux:*` package scripts, SSH, remote execution, staged scripts, or historical notes authoritative for v1 mutation.
- Keep historical and instance-specific docs discoverable but fenced from supported install authority.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `node --test tests/linux-bootstrap/package-scripts.test.mjs`
- `node ./scripts/check-linux-install-contract.mjs`
- Full lane verification command sequence listed in Completion Notes.

### Completion Notes List

- Added `validateSingleMutatingInstallBoundary` to `scripts/check-linux-install-contract.mjs` and wired it into the CLI contract check.
- Added focused tests proving alternate mutating command language and missing historical/lab fencing fail with actionable checker output.
- Extended lane navigation and drift checks so Story 1.5 remains represented in tracked docs.
- Verification passed:
  - `node --test tests/linux-bootstrap/package-scripts.test.mjs`
  - `node ./scripts/check-linux-install-contract.mjs`
  - `node ./scripts/check-linux-install-lane.mjs`
  - `node ./scripts/check-doc-indexes.mjs`
  - `node ./scripts/check-linux-bootstrap.mjs`
  - `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

### File List

- `scripts/check-linux-install-contract.mjs`
- `tests/linux-bootstrap/package-scripts.test.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- `docs/linux-install/planning/stories/1-5-enforce-shell-bootstrap-as-the-only-mutating-install-path.md`
- `_bmad-output/implementation-artifacts/1-5-enforce-shell-bootstrap-as-the-only-mutating-install-path.md`
