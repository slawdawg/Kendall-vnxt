---
baseline_commit: 8679bd6
---

# Story 1.18: Premium Approval Request Artifacts

Status: in-progress

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

- [ ] Add premium approval artifact contract. (AC: 1, 2, 3, 6)
  - [ ] Add Python API schema.
  - [ ] Add shared TypeScript contract type.
- [ ] Add supervisor service/API support. (AC: 1, 2, 3, 4, 5)
  - [ ] Create deterministic artifact generation from work item and routing preview.
  - [ ] Keep `executionAllowed: false` and no provider launch.
  - [ ] Support explicit event recording only.
  - [ ] Reject requests with no premium escalation path.
- [ ] Add focused tests. (AC: 2, 3, 4, 5, 7)
  - [ ] Assert non-mutating default generation.
  - [ ] Assert optional event recording.
  - [ ] Assert invalid utility-only task rejection.
- [ ] Verify and update story trail. (AC: all)
  - [ ] Run focused tests.
  - [ ] Run broader workspace verification.
  - [ ] Update Dev Agent Record, File List, and Change Log.

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

- Pending.

### Completion Notes List

- Pending.

### File List

- Pending.

## Change Log

- 2026-06-08: Created story from routing follow-on roadmap after subscription handoff template hardening.
