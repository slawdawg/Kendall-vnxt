---
baseline_commit: 9a185ed
---

# Story 1.19: Compact Routing Fleet Panel

Status: in-progress

## Story

As the Kendall_vNxt operator,
I want a compact routing fleet panel backed by actual registry and lane-profile data,
so that worker health and routing evidence are visible without turning the dashboard into a decorative fleet console.

## Acceptance Criteria

1. The dashboard controls page fetches worker registry and routing lane profile data from existing supervisor endpoints.
2. The panel shows worker health, disabled reasons, lane, adapter type, queue depth, and capabilities from real registry data.
3. The panel shows lane evidence counts from real lane-profile data, including decisions, guarded attempts, handoff packages, premium approval requests, and outcomes.
4. The panel remains read-only and does not launch workers, change policy, mutate work items, or add override controls.
5. The controls page continues to build successfully with shared contract types.
6. Focused dashboard coverage verifies the panel renders registry and lane evidence information.

## Tasks / Subtasks

- [ ] Add dashboard data fetching. (AC: 1, 5)
  - [ ] Add supervisor client methods for worker registry and lane profiles.
  - [ ] Fetch the data on the controls page.
- [ ] Add compact fleet panel. (AC: 2, 3, 4)
  - [ ] Render worker health and disabled reasons.
  - [ ] Render lane evidence counts.
  - [ ] Keep the panel read-only.
- [ ] Add focused dashboard coverage. (AC: 6)
  - [ ] Verify controls page renders Routing Fleet data.
- [ ] Verify and update story trail. (AC: all)
  - [ ] Run focused dashboard/build verification.
  - [ ] Run broader workspace verification.
  - [ ] Update Dev Agent Record, File List, and Change Log.

## Dev Notes

Source artifacts:

- `docs/prds/supervisor-dynamic-routing-follow-on-roadmap.md`
- `docs/stories/1-12-worker-capability-health-registry.md`
- `docs/stories/1-13-routing-outcome-evidence-for-guarded-attempts.md`
- `docs/stories/1-18-premium-approval-request-artifacts.md`

Implementation constraints:

- Do not add worker launch buttons or policy mutation controls.
- Do not probe local model servers or subscription providers.
- Use real supervisor endpoints rather than static dashboard mock data.
- Keep the panel supportive to controls, not the dashboard center of gravity.

Recommended design:

- Place a compact `RoutingFleetPanel` on `/controls` beneath run/operator controls.
- Reuse existing dashboard visual language and shared contract types.
- Summarize data for scanability: worker count/health, disabled workers, lane evidence rows, recent reason codes.

## Dev Agent Record

### Implementation Plan

- Add supervisor client functions.
- Add `RoutingFleetPanel` component and wire it into controls page.
- Add focused Playwright/dashboard coverage if practical.
- Verify focused build/checks and update trail.

### Debug Log References

- Pending.

### Completion Notes List

- Pending.

### File List

- Pending.

## Change Log

- 2026-06-08: Created story from routing follow-on roadmap after premium approval request artifacts.
