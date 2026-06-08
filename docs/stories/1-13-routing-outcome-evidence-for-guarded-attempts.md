---
baseline_commit: 71cba10
---

# Story 1.13: Routing Outcome Evidence For Guarded Attempts

Status: in-progress

## Story

As the Kendall_vNxt operator,
I want guarded route-controlled attempts to record structured routing outcome evidence,
so that future lane profiles, escalation decisions, and adaptive routing can learn from auditable history instead of hidden behavior.

## Acceptance Criteria

1. The supervisor records a `routing.outcome_recorded` workflow event for guarded utility attempts.
2. Outcome events include decision id, selected lane, authority mode, worker id, function id, task kind, step id, attempt status, validation status, escalation reason, and avoidance note.
3. Successful guarded `supervisor_triage` records an outcome event without changing existing workflow behavior.
4. Rejected guarded utility attempts record an outcome event before returning the managed-action policy error.
5. Lane evidence profiles include a routing outcome count per lane.
6. The outcome event does not launch workers, run external commands, call models, or mutate unrelated work-item state.
7. Shared TypeScript contracts are updated for the lane profile outcome count.
8. Integration tests prove success, rejection, and lane-profile aggregation.

## Tasks / Subtasks

- [ ] Add routing outcome event recording. (AC: 1, 2, 3, 4, 6)
  - [ ] Record outcome after each guarded utility worker result.
  - [ ] Include stable fields for future routing analysis.
  - [ ] Preserve existing managed action behavior.
- [ ] Extend lane evidence profiles. (AC: 5, 7)
  - [ ] Count `routing.outcome_recorded` by selected lane.
  - [ ] Add shared API contract field.
- [ ] Add focused integration tests. (AC: 3, 4, 5, 8)
  - [ ] Assert success outcome event payload.
  - [ ] Assert rejection outcome event payload persists before 409.
  - [ ] Assert lane profile outcome count.
- [ ] Verify and update story trail. (AC: all)
  - [ ] Run focused tests.
  - [ ] Run broader workspace verification.
  - [ ] Update Dev Agent Record, File List, and Change Log.

## Dev Notes

Source artifacts:

- `docs/prds/supervisor-dynamic-routing-follow-on-roadmap.md`
- `docs/stories/1-11-guarded-utility-worker-adapter-contract.md`
- `docs/stories/1-12-worker-capability-health-registry.md`

Implementation constraints:

- Do not add adaptive scoring yet.
- Do not add dashboard fleet UI.
- Do not add external worker execution.
- Keep outcome evidence deterministic and auditable.

Recommended design:

- Reuse `RoutingDecision` and `UtilityWorkerResult`.
- Add a small service helper that records `routing.outcome_recorded`.
- Extend `_ROUTING_PROFILE_EVENT_TYPES` and lane profile counts.

## Dev Agent Record

### Implementation Plan

- Add outcome recording helper.
- Wire guarded utility success and rejection paths.
- Extend lane profile aggregation and contracts.
- Verify focused and broad checks.

### Debug Log References

- Pending.

### Completion Notes List

- Pending.

### File List

- Pending.

## Change Log

- 2026-06-08: Created story from routing follow-on roadmap after Story 1.12 completion.

