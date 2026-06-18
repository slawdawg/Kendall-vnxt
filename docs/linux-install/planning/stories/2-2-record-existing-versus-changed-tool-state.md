---
baseline_commit: 83235d523a8b178ccfcc45723d4e8773269d976a
---

# Story 2.2: Record Existing Versus Changed Tool State

Status: review

## Story

As a release reviewer,
I want evidence to distinguish pre-existing tools from installed or changed tools,
so that bootstrap impact is reviewable after a run.

## Acceptance Criteria

1. Given the bootstrap checks tool state, when a required tool is already present, installed, updated, skipped, or failed, then the run records that status per tool.
2. Given final install validation writes evidence after a mutating bootstrap run, when bootstrap has recorded tool state, then the evidence includes structured `tool_changes` rows.
3. Given `tool_changes` rows are present in install evidence, when schema validation runs, then each row must be an object with non-empty `id`, `status`, and `summary`.
4. Given non-mutating verify-only evidence already exists, when it is validated, then it remains valid without implying bootstrap mutation.

## Tasks / Subtasks

- [x] Add focused tool-change evidence tests. (AC: 1-3)
  - [x] Bootstrap script records command tool changes.
  - [x] Bootstrap passes `tool_changes` JSON to final validation.
  - [x] Install evidence schema validates optional `tool_changes` rows when supplied.
  - [x] Validator runtime path emits parseable schema-valid evidence with supplied `tool_changes`.
- [x] Implement per-tool status recording in the bootstrap script. (AC: 1-2)
  - [x] Node, npm, git, GitHub CLI, pinned pnpm, uv, uvx, Codex CLI, Claude Code, and BMAD Method are recorded.
  - [x] Tool statuses distinguish `existing`, `installed`, `changed`, `skipped`, and `failed`.
  - [x] Failure evidence can include partial tool-change state.
- [x] Thread tool-change rows through final validation evidence. (AC: 2-4)
  - [x] `scripts/validate-linux-install.sh` accepts `--tool-changes-json`.
  - [x] Final evidence emits `tool_changes`.
  - [x] Existing verify-only evidence remains valid.
- [x] Update lane tracking and index coverage. (AC: 1-4)
  - [x] Story 2.2 is linked from `docs/linux-install/index.md`.
  - [x] Lane checker requires Story 2.2 and its coverage notes.
- [x] Run focused and full lane verification. (AC: 1-4)
  - [x] `node --test tests/linux-bootstrap/bootstrap-script.test.mjs tests/linux-bootstrap/evidence-schema.test.mjs`
  - [x] `node ./scripts/check-linux-install-lane.mjs`
  - [x] `node ./scripts/check-doc-indexes.mjs`
  - [x] `node ./scripts/check-linux-bootstrap.mjs`
  - [x] `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

## Dev Notes

### Source Context

- PRD: `docs/prds/linux-install-mvp.md`
  - FR12: the bootstrap must distinguish tools that were already present from tools it installed or changed.
- Evidence schema: `docs/linux-install/evidence/schema.md`
  - `tool_changes` rows are bootstrap action rows with non-empty `id`, `status`, and `summary`.
- Existing code:
  - `scripts/bootstrap-linux.sh` owns mutating tool install behavior.
  - `scripts/validate-linux-install.sh` writes final install evidence.
  - `scripts/lib/linux-bootstrap/evidence-schema.mjs` validates Linux evidence.

### Target Files

- `scripts/bootstrap-linux.sh`
- `scripts/validate-linux-install.sh`
- `scripts/lib/linux-bootstrap/evidence-schema.mjs`
- `tests/linux-bootstrap/bootstrap-script.test.mjs`
- `tests/linux-bootstrap/evidence-schema.test.mjs`
- `tests/linux-bootstrap/validator.test.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- This story file and BMAD local story copy.

### Implementation Guardrails

- Do not persist raw shell history, environment dumps, credential output, provider payloads, or secrets in evidence.
- Do not require `tool_changes` for standalone verify-only evidence that did not originate from a mutating bootstrap run.
- Keep tool-change summaries short and operational.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `node --test tests/linux-bootstrap/bootstrap-script.test.mjs tests/linux-bootstrap/evidence-schema.test.mjs`
- `node ./scripts/check-linux-bootstrap.mjs`
- Full lane verification command sequence listed in Completion Notes.

### Completion Notes List

- Added a shell-side tool-change recorder that classifies required tools as existing, installed, changed, skipped, or failed.
- Passed bootstrap-recorded `tool_changes` into final validation evidence via `--tool-changes-json`.
- Extended install evidence validation so supplied `tool_changes` rows must be shaped objects.
- Added runtime validator coverage that parses and schema-validates evidence emitted with supplied `tool_changes`.
- Verification passed:
  - `node --test tests/linux-bootstrap/bootstrap-script.test.mjs tests/linux-bootstrap/evidence-schema.test.mjs`
  - `node ./scripts/check-linux-install-lane.mjs`
  - `node ./scripts/check-doc-indexes.mjs`
  - `node ./scripts/check-linux-bootstrap.mjs`
  - `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json`

### File List

- `scripts/bootstrap-linux.sh`
- `scripts/validate-linux-install.sh`
- `scripts/lib/linux-bootstrap/evidence-schema.mjs`
- `tests/linux-bootstrap/bootstrap-script.test.mjs`
- `tests/linux-bootstrap/evidence-schema.test.mjs`
- `tests/linux-bootstrap/validator.test.mjs`
- `scripts/check-linux-install-lane.mjs`
- `docs/linux-install/index.md`
- `docs/linux-install/planning/lane-status.md`
- `docs/linux-install/planning/stories/2-2-record-existing-versus-changed-tool-state.md`
- `_bmad-output/implementation-artifacts/2-2-record-existing-versus-changed-tool-state.md`
