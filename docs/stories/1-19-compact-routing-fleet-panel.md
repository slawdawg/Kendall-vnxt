---
baseline_commit: 9a185ed
---

# Story 1.19: Compact Routing Fleet Panel

Status: done

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

- [x] Add dashboard data fetching. (AC: 1, 5)
  - [x] Add supervisor client methods for worker registry and lane profiles.
  - [x] Fetch the data on the controls page.
- [x] Add compact fleet panel. (AC: 2, 3, 4)
  - [x] Render worker health and disabled reasons.
  - [x] Render lane evidence counts.
  - [x] Keep the panel read-only.
- [x] Add focused dashboard coverage. (AC: 6)
  - [x] Verify controls page renders Routing Fleet data.
- [x] Verify and update story trail. (AC: all)
  - [x] Run focused dashboard/build verification.
  - [x] Run broader workspace verification.
  - [x] Update Dev Agent Record, File List, and Change Log.

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

- `pnpm -C C:\Users\slaw_dawg\Kendall_Nxt --filter @kendall/dashboard build` - first run failed on missing `RoutingLaneEvidenceProfileView` import; rerun passed after import fix.
- `pnpm -C C:\Users\slaw_dawg\Kendall_Nxt exec playwright test tests/e2e/dashboard.spec.ts -g "shows compact routing fleet data on controls"` - passed, 1 test.
- `pnpm -C C:\Users\slaw_dawg\Kendall_Nxt run check` - passed, dashboard build plus 64 supervisor tests, 1 existing aiosqlite warning.

### Completion Notes List

- Added dashboard client methods for `GET /routing/worker-registry` and `GET /routing/lane-profiles`.
- Added a read-only `RoutingFleetPanel` on `/controls` showing worker health, disabled reasons, lane/adapter metadata, queue depth, capabilities, and lane evidence counts.
- Added focused Playwright coverage that records route evidence and verifies the controls page renders real routing fleet data.
- No worker launch, policy mutation, provider probe, or override control was added.

### File List

- `apps/dashboard/src/app/controls/page.tsx`
- `apps/dashboard/src/components/routing-fleet-panel.tsx`
- `apps/dashboard/src/lib/supervisor.ts`
- `tests/e2e/dashboard.spec.ts`
- `docs/stories/1-19-compact-routing-fleet-panel.md`
- `_bmad-output/implementation-artifacts/1-19-compact-routing-fleet-panel.md`

## Change Log

- 2026-06-08: Created story from routing follow-on roadmap after premium approval request artifacts.
- 2026-06-08: Completed compact routing fleet panel implementation and verification.
