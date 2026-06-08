---
baseline_commit: 1c29b12
---

# Story 1.17: Subscription Handoff Template Hardening

Status: in-progress

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

- [ ] Add handoff template helpers. (AC: 1, 2, 3, 4)
  - [ ] Add task-kind-specific constraints.
  - [ ] Add expected output guidance.
- [ ] Wire templates into existing package response. (AC: 5)
  - [ ] Preserve `launchAllowed: false`.
  - [ ] Preserve existing package fields and event behavior.
- [ ] Add focused tests. (AC: 3, 4, 5, 6)
  - [ ] Assert security handoff has stronger privacy/secret constraints.
  - [ ] Assert implementation handoff includes allowed path and validation expectations.
  - [ ] Assert non-mutating behavior remains intact.
- [ ] Verify and update story trail. (AC: all)
  - [ ] Run focused tests.
  - [ ] Run broader workspace verification.
  - [ ] Update Dev Agent Record, File List, and Change Log.

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

- Pending.

### Completion Notes List

- Pending.

### File List

- Pending.

## Change Log

- 2026-06-08: Created story from routing follow-on roadmap after local worker registry slices.

