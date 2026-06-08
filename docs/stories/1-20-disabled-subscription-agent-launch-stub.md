---
baseline_commit: 0b7c2c2
---

# Story 1.20: Disabled Subscription-Agent Launch Stub

Status: done

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

- [x] Add disabled subscription-agent registry entry. (AC: 1)
- [x] Add launch-stub request/view contract. (AC: 2, 3, 4)
- [x] Add supervisor service/API support. (AC: 2, 3, 4, 5, 6)
  - [x] Estimate without launching.
  - [x] Produce launch instructions and approval gates.
  - [x] Support explicit event recording only.
- [x] Add focused tests. (AC: 1, 4, 5, 6, 7)
- [x] Verify and update story trail. (AC: all)
  - [x] Run focused tests.
  - [x] Run broader workspace verification.
  - [x] Update Dev Agent Record, File List, and Change Log.

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

- `uv run --directory C:\Users\slaw_dawg\Kendall_Nxt\services\supervisor pytest tests/integration/test_routing_preview.py -q -k "subscription_agent_launch_stub or worker_registry"` - passed, 4 selected, 1 existing aiosqlite warning.
- `uv run --directory C:\Users\slaw_dawg\Kendall_Nxt\services\supervisor pytest tests/integration/test_routing_preview.py -q` - passed, 34 tests, 1 existing aiosqlite warning.
- `pnpm -C C:\Users\slaw_dawg\Kendall_Nxt --filter @kendall/dashboard build` - passed.
- `pnpm -C C:\Users\slaw_dawg\Kendall_Nxt run check` - passed, dashboard build plus 67 supervisor tests.

### Completion Notes List

- Added disabled `subscription.agent.disabled` registry entry under the `subscription_agent` lane.
- Added subscription-agent launch-stub schemas and shared TypeScript contract type.
- Added `POST /work-items/{work_item_id}/subscription-agent-launch-stub` for deterministic estimates, launch instructions, required approvals, and hard disabled flags.
- Added optional `routing.subscription_agent_launch_stub_created` event recording only when requested.
- Added focused integration coverage for registry entry, non-mutating stub generation, optional event recording, and invalid non-handoff route rejection.

### File List

- `services/supervisor/src/supervisor/domain/worker_registry.py`
- `services/supervisor/src/supervisor/api/main.py`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`
- `packages/contracts/src/api.ts`
- `docs/stories/1-20-disabled-subscription-agent-launch-stub.md`
- `_bmad-output/implementation-artifacts/1-20-disabled-subscription-agent-launch-stub.md`

## Change Log

- 2026-06-08: Created story from routing follow-on roadmap after compact routing fleet panel.
- 2026-06-08: Completed disabled subscription-agent launch stub implementation and verification.
