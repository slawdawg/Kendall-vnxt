---
baseline_commit: 941aab36592e14ab30f8aaaa52d125d8aa8c98f0
---

# Story 13.1: Define Adaptive Scoring Decision Support Contract

Status: done

## Story

As Bob,
I want adaptive scoring defined as a bounded decision-support contract,
so that future scoring can help compare backlog lanes without becoming hidden automation or authority approval.

## Acceptance Criteria

1. Given adaptive scoring is selected as the next gated lane, when the contract is defined, then it names allowed metadata inputs, disallowed sensitive inputs, formula requirements, output-use policy, retained evidence, rollback path, and stop lines.
2. Given scoring is not yet approved for execution, when this story completes, then it does not compute, retain, display, apply, or act on a score.
3. Given future scoring may influence operator trust, when approval binding is defined, then it requires authority family, operation, input set, formula id/version, output-use policy, retained evidence, operator, human review path, rollback/removal path, stop lines, and expiry or review point.
4. Given the story is documentation/contract-only, when verification runs, then `pnpm.cmd run check:docs` passes.

## Tasks / Subtasks

- [x] Create the adaptive-scoring approval packet. (AC: 1, 2, 3)
  - [x] Define allowed and disallowed inputs.
  - [x] Define deterministic formula requirements and no-provider default.
  - [x] Define output-use policy and no-autopromotion rule.
  - [x] Define retained evidence, rollback/removal path, approval binding, and stop lines.
- [x] Update story navigation for Epic 13. (AC: 1)
  - [x] Add Epic 13 and Story 13.1 to the story index.
- [x] Verify documentation. (AC: 4)
  - [x] Run `pnpm.cmd run check:docs`.

## Dev Notes

This story intentionally stops before scoring execution. The next implementation story may add deterministic fixtures and report/dashboard integration only if it preserves the contract in `docs/goals/adaptive-scoring-approval-packet-2026-06-13.md`.

Relevant existing surfaces:

- `docs/stories/3-54-development-runway-safe-slices.md`
- `docs/stories/3-59-development-runway-readiness-checks.md`
- `docs/goals/epic-11-next-lane-authority-decision-packet-2026-06-13.md`
- `_bmad-output/planning-artifacts/deferred-authority-backlog-map-2026-06-13.md`

### Guardrails

- Do not compute a score.
- Do not change priority, sprint status, authority state, delivery state, cleanup state, or runtime state.
- Do not call providers.
- Do not retain raw prompts, completions, provider payloads, secrets, credentials, or external sessions.
- Do not bypass failed checks.

### References

- [Source: `docs/goals/adaptive-scoring-approval-packet-2026-06-13.md`]
- [Source: `docs/goals/epic-11-next-lane-authority-decision-packet-2026-06-13.md#candidate-lane-comparison`]
- [Source: `_bmad-output/planning-artifacts/deferred-authority-backlog-map-2026-06-13.md#5-adaptive-scoring`]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `git status --short --branch`
- `Get-Content -Raw _bmad-output/implementation-artifacts/sprint-status.yaml`
- `Get-Content -Raw _bmad-output/planning-artifacts/deferred-authority-backlog-map-2026-06-13.md`
- `Get-Content -Raw docs/stories/3-54-development-runway-safe-slices.md`
- `Get-Content -Raw docs/stories/3-59-development-runway-readiness-checks.md`
- `pnpm.cmd run check:docs`

### Completion Notes List

- Created `docs/goals/adaptive-scoring-approval-packet-2026-06-13.md` as a non-executing approval packet.
- Defined adaptive scoring as deterministic decision support with no provider calls, no autopromotion, and metadata-only retention.
- Added Epic 13 and Story 13.1 navigation.

### File List

- `docs/goals/adaptive-scoring-approval-packet-2026-06-13.md`
- `docs/stories/13-1-define-adaptive-scoring-decision-support-contract.md`
- `docs/stories/index.md`

### Change Log

- 2026-06-13: Defined adaptive-scoring decision-support contract and approval packet.
