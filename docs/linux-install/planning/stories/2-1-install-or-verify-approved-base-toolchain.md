---
baseline_commit: 83235d523a8b178ccfcc45723d4e8773269d976a
---

# Story 2.1: Install Or Verify Approved Base Toolchain

Status: done

## Story

As a bootstrap operator,
I want the installer to install or verify the approved base tools,
so that Kendall_Nxt has the required Linux development toolchain.

## Acceptance Criteria

1. Given the single bootstrap script runs with install authority, when required tools are missing or below policy, then the script installs or reports the approved tool path for Node, pinned pnpm, uv, git, GitHub CLI, Codex CLI, Claude Code, and BMAD Method.
2. Given an approved base tool install command fails, when the failure is detected, then the bootstrap exits with recovery guidance that points back to the same single install command.
3. Given Node is outside the supported policy range, when the toolchain check runs, then the bootstrap fails with guidance to update the approved Node channel before rerunning the single install command.

## Tasks / Subtasks

- [x] Add focused approved-toolchain test coverage. (AC: 1-3)
  - [x] Approved Ubuntu package set includes Node, npm, GitHub CLI, build tools, Python venv, curl, certificates, and git.
  - [x] Pinned pnpm, uv/uvx, Codex CLI, Claude Code, and BMAD Method install/skip paths are asserted.
  - [x] Toolchain failure guidance points back to the same single install command.
- [x] Harden bootstrap recovery guidance for unresolved tool states. (AC: 2-3)
  - [x] apt metadata update failure has recovery guidance.
  - [x] approved Ubuntu package install failure has recovery guidance.
  - [x] pinned pnpm install failure has recovery guidance.
  - [x] uv install and PATH exposure failures have recovery guidance.
  - [x] agent CLI install failure has recovery guidance.
- [x] Update lane tracking and index coverage. (AC: 1-3)
  - [x] Story 2.1 is linked from `docs/linux-install/index.md`.
  - [x] Lane checker requires Story 2.1 and its coverage notes.
- [x] Run focused and full lane verification. (AC: 1-3)
  - [x] `node --test tests/linux-bootstrap/bootstrap-script.test.mjs`
  - [x] `node ./scripts/check-linux-install-lane.mjs`
  - [x] `node ./scripts/check-doc-indexes.mjs`
  - [x] `node ./scripts/check-linux-bootstrap.mjs`
  - [x] `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

## Dev Notes

### Source Context

- PRD: `docs/prds/linux-install-mvp.md`
  - FR11: install or verify approved base tools including Node, pinned pnpm, uv, git, GitHub CLI, Codex CLI, Claude Code, and BMAD Method.
- Architecture input: `docs/linux-install/planning/linux-install-architecture-input.md`
  - `scripts/bootstrap-linux.sh --install-kendall-vnxt` is the only mutating install command.
  - `scripts/validate-linux-install.sh --verify-only` validates toolchain, repo, and agent CLI readiness.
- Existing code:
  - `scripts/bootstrap-linux.sh` owns mutating package/tool install behavior.
  - `tests/linux-bootstrap/bootstrap-script.test.mjs` statically verifies shell installer contracts.

### Target Files

- `scripts/bootstrap-linux.sh`
- `tests/linux-bootstrap/bootstrap-script.test.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- This story file and BMAD local story copy.

### Implementation Guardrails

- Do not add another mutating install command.
- Do not automate provider login, GitHub auth login, token handling, SSH, reboot, cleanup, PR creation, merge, or workspace cleanup.
- Keep recovery guidance bounded to resolving the failed tool state and rerunning `scripts/bootstrap-linux.sh --install-kendall-vnxt`.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `node --test tests/linux-bootstrap/bootstrap-script.test.mjs`
- `node ./scripts/check-linux-bootstrap.mjs`
- Full lane verification command sequence listed in Completion Notes.

### Completion Notes List

- Added explicit bootstrap-script tests for the approved base toolchain and unresolved install-state recovery guidance.
- Hardened apt, pinned pnpm, uv/uvx PATH exposure, and agent CLI install failures to emit Kendall-specific recovery guidance before exit.
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
- `docs/linux-install/planning/stories/2-1-install-or-verify-approved-base-toolchain.md`
- `_bmad-output/implementation-artifacts/2-1-install-or-verify-approved-base-toolchain.md`
