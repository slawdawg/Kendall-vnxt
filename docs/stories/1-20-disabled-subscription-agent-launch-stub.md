---
baseline_commit: 0b7c2c2
---

# Story 1.20: Disabled Subscription-Agent Launch Stub

Status: in-progress

## Story

As the Kendall_vNxt operator,
I want a disabled subscription-agent launch stub that estimates and packages launch instructions,
so that future Codex/Claude/Gemini launch work has an auditable contract before any process spawning is enabled.

## Acceptance Criteria

1. The worker registry includes a disabled subscription-agent worker entry separate from subscription handoff.
2. The supervisor exposes a launch-stub artifact endpoint for subscription-agent-eligible work items.
3. The artifact includes route context, selected disabled worker, estimate, launch instructions, required approvals, and disabled reason.
4. The artifact explicitly states that process launch and execution are not allowed.
5. Artifact generation is non-mutating by default and may record a workflow event only when explicitly requested.
6. Ineligible task kinds are rejected without mutation.
7. Focused integration tests verify registry entry, artifact content, non-mutation, optional event recording, and invalid-route rejection.

## Tasks / Subtasks

- [ ] Add disabled subscription-agent registry entry. (AC: 1)
- [ ] Add launch-stub request/view contract. (AC: 2, 3, 4)
- [ ] Add supervisor service/API support. (AC: 2, 3, 4, 5, 6)
  - [ ] Estimate without launching.
  - [ ] Produce launch instructions and approval gates.
  - [ ] Support explicit event recording only.
- [ ] Add focused tests. (AC: 1, 4, 5, 6, 7)
- [ ] Verify and update story trail. (AC: all)
  - [ ] Run focused tests.
  - [ ] Run broader workspace verification.
  - [ ] Update Dev Agent Record, File List, and Change Log.

## Dev Notes

Source artifacts:

- `docs/prds/supervisor-dynamic-routing-follow-on-roadmap.md`
- `docs/stories/1-17-subscription-handoff-template-hardening.md`
- `docs/stories/1-19-compact-routing-fleet-panel.md`

Implementation constraints:

- Do not spawn processes.
- Do not call Codex, Claude, Gemini, Antigravity, or any CLI agent.
- Do not require credentials.
- Do not add cancellation/session lifecycle management in this story.
- Keep the stub disabled by default and suitable for later process/approval/cancellation design.

Recommended design:

- Add `POST /work-items/{work_item_id}/subscription-agent-launch-stub`.
- Require task kinds that currently route to `subscription_handoff`.
- Add a disabled `subscription.agent.disabled` registry entry under `subscription_agent` lane.
- Include estimate and instructions as deterministic artifact fields.

## Dev Agent Record

### Implementation Plan

- Add registry and schema support.
- Add service method and API route.
- Extend focused integration tests.
- Verify focused and broad checks.

### Debug Log References

- Pending.

### Completion Notes List

- Pending.

### File List

- Pending.

## Change Log

- 2026-06-08: Created story from routing follow-on roadmap after compact routing fleet panel.
