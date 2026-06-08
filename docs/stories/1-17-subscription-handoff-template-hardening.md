---
baseline_commit: 1c29b12
---

# Story 1.17: Subscription Handoff Template Hardening

Status: done

## Story

As the Kendall_vNxt operator,
I want subscription handoff packages to include task-kind-specific constraints and expected outputs,
so that Codex/Claude handoffs are safer and more useful before any direct agent launch is considered.

## Acceptance Criteria

1. Handoff packages include task-kind-specific constraints for architecture, security, implementation, and general handoff package tasks.
2. Handoff packages include expected output guidance suitable for copy/paste into a subscription agent.
3. Security review handoffs include stronger secret/privacy constraints than architecture handoffs.
4. Implementation handoffs include allowed-path and validation-command expectations.
5. The endpoint remains non-mutating by default and does not launch subscription agents.
6. Integration tests prove task-specific hardening and non-mutating behavior.

## Tasks / Subtasks

- [x] Add handoff template helpers. (AC: 1, 2, 3, 4)
  - [x] Add task-kind-specific constraints.
  - [x] Add expected output guidance.
- [x] Wire templates into existing package response. (AC: 5)
  - [x] Preserve `launchAllowed: false`.
  - [x] Preserve existing package fields and event behavior.
- [x] Add focused tests. (AC: 3, 4, 5, 6)
  - [x] Assert security handoff has stronger privacy/secret constraints.
  - [x] Assert implementation handoff includes allowed path and validation expectations.
  - [x] Assert non-mutating behavior remains intact.
- [x] Verify and update story trail. (AC: all)
  - [x] Run focused tests.
  - [x] Run broader workspace verification.
  - [x] Update Dev Agent Record, File List, and Change Log.

## Dev Notes

Source artifacts:

- `docs/prds/supervisor-dynamic-routing-follow-on-roadmap.md`
- `docs/stories/1-7-structured-subscription-handoff-packages.md`

Implementation constraints:

- Do not launch Codex, Claude, Gemini, or any subscription agent.
- Do not add process/session management.
- Do not require credentials.
- Keep package generation deterministic.

Recommended design:

- Add template text to existing package `constraints` and `operatorInstructions` rather than adding a new top-level response field.

## Dev Agent Record

### Implementation Plan

- Add task-kind template helpers.
- Update package constraints/instructions.
- Extend focused handoff tests.
- Verify focused and broad checks.

### Debug Log References

- `uv run --directory C:\Users\slaw_dawg\Kendall_Nxt\services\supervisor pytest tests/integration/test_routing_preview.py -q -k "subscription_handoff"` - passed, 5 selected.
- `uv run --directory C:\Users\slaw_dawg\Kendall_Nxt\services\supervisor pytest tests/integration/test_routing_preview.py -q` - passed, 28 tests, 1 existing aiosqlite warning.
- `pnpm -C C:\Users\slaw_dawg\Kendall_Nxt run check` - passed, dashboard build plus 61 supervisor tests, 1 existing aiosqlite warning.

### Completion Notes List

- Added task-kind-specific subscription handoff constraints for architecture review, security review, implementation work, and general handoffs.
- Added expected output guidance to operator instructions while preserving `launchAllowed: false` and non-mutating package generation.
- Extended integration coverage for architecture, security, implementation, non-mutating behavior, and invalid non-handoff routes.

### File List

- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`
- `docs/stories/1-17-subscription-handoff-template-hardening.md`
- `_bmad-output/implementation-artifacts/1-17-subscription-handoff-template-hardening.md`

## Change Log

- 2026-06-08: Created story from routing follow-on roadmap after local worker registry slices.
- 2026-06-08: Completed subscription handoff template hardening implementation and focused verification.
