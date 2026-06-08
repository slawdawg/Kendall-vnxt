---
baseline_commit: 8679bd6
---

# Story 1.18: Premium Approval Request Artifacts

Status: done

## Story

As the Kendall_vNxt operator,
I want premium escalation requests to be packaged as auditable approval artifacts,
so that premium model usage remains deliberate, reviewable, and recoverable before any premium execution is enabled.

## Acceptance Criteria

1. The supervisor exposes a premium approval request artifact endpoint for work items.
2. The artifact includes work item context, routing decision context, requested premium lane, justification, required evidence, approval checklist, and risk controls.
3. The artifact explicitly states that premium execution is not allowed and does not launch any premium provider.
4. Artifact generation is non-mutating by default and may record a workflow event only when explicitly requested.
5. Invalid task kinds that do not have a premium escalation path are rejected without mutation.
6. Shared TypeScript contracts are updated for dashboard/client reuse.
7. Focused integration tests verify artifact content, non-mutation, optional event recording, and invalid-route rejection.

## Tasks / Subtasks

- [x] Add premium approval artifact contract. (AC: 1, 2, 3, 6)
  - [x] Add Python API schema.
  - [x] Add shared TypeScript contract type.
- [x] Add supervisor service/API support. (AC: 1, 2, 3, 4, 5)
  - [x] Create deterministic artifact generation from work item and routing preview.
  - [x] Keep `executionAllowed: false` and no provider launch.
  - [x] Support explicit event recording only.
  - [x] Reject requests with no premium escalation path.
- [x] Add focused tests. (AC: 2, 3, 4, 5, 7)
  - [x] Assert non-mutating default generation.
  - [x] Assert optional event recording.
  - [x] Assert invalid utility-only task rejection.
- [x] Verify and update story trail. (AC: all)
  - [x] Run focused tests.
  - [x] Run broader workspace verification.
  - [x] Update Dev Agent Record, File List, and Change Log.

## Dev Notes

Source artifacts:

- `docs/prds/supervisor-dynamic-routing-follow-on-roadmap.md`
- `docs/stories/1-17-subscription-handoff-template-hardening.md`
- `docs/stories/1-12-worker-capability-health-registry.md`

Implementation constraints:

- Do not add premium provider execution.
- Do not require credentials.
- Do not launch external workers or model calls.
- Keep the artifact deterministic and suitable for dashboard/client display.
- Prefer the existing subscription handoff package pattern for non-mutating artifact generation plus optional event recording.

Recommended design:

- Add `POST /work-items/{work_item_id}/premium-approval-request` with `taskKind`, optional `stepId`, optional `approvalReason`, and `recordEvent`.
- Reuse the existing routing preview service and allow artifact creation only when `premium_approval` appears in the route escalation path.
- Include checklist and controls as deterministic strings rather than policy execution.

## Dev Agent Record

### Implementation Plan

- Add request/view schemas and shared TS contract.
- Add service method and API route.
- Extend routing integration tests.
- Verify focused and broad checks.

### Debug Log References

- `uv run --directory C:\Users\slaw_dawg\Kendall_Nxt\services\supervisor pytest tests/integration/test_routing_preview.py -q -k "premium_approval or lane_profiles"` - passed, 4 selected, 1 existing aiosqlite warning.
- `uv run --directory C:\Users\slaw_dawg\Kendall_Nxt\services\supervisor pytest tests/integration/test_routing_preview.py -q` - passed, 31 tests, 1 existing aiosqlite warning.
- `pnpm -C C:\Users\slaw_dawg\Kendall_Nxt run check` - passed, dashboard build plus 64 supervisor tests, 1 existing aiosqlite warning.

### Completion Notes List

- Added `POST /work-items/{work_item_id}/premium-approval-request` as a deterministic artifact generator with no premium provider launch.
- Added premium approval request schemas and shared TypeScript contract types.
- Added optional `routing.premium_approval_requested` workflow event recording and lane-profile evidence counting for premium approval requests.
- Corrected lane-profile `routing.outcome_recorded` aggregation while updating the same evidence counter.
- Added integration coverage for non-mutating generation, optional event recording, ineligible task rejection, and premium lane evidence profiles.

### File List

- `services/supervisor/src/supervisor/api/main.py`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`
- `packages/contracts/src/api.ts`
- `docs/stories/1-18-premium-approval-request-artifacts.md`
- `_bmad-output/implementation-artifacts/1-18-premium-approval-request-artifacts.md`

## Change Log

- 2026-06-08: Created story from routing follow-on roadmap after subscription handoff template hardening.
- 2026-06-08: Completed premium approval request artifact implementation and verification.
