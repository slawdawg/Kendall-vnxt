# Story 3.41: Current Gap Review Refresh

Date: 2026-06-09
Status: ready for review

## Goal

Refresh the current architecture gap review and continuation handoff after recent safe evidence, managed recipe policy, runbook chain, and report-anchor polish work.

## Scope

- Update the current gap review from stale Story 2.1-2.8 framing to the current Story 3.40 safe-work state.
- Add recent safe surfaces to the already-covered list.
- Reframe recommended build order around safe maintenance, documentation freshness, drift checks, and explicit authority approval boundaries.
- Update the fresh VM handoff next-work guidance toward larger coherent safe slices.
- Extend `pnpm run check:docs` so stale current-gap and handoff guidance is detected.

## Safety Boundary

This is documentation and static verification only. It does not approve:

- local provider or model calls,
- subscription-agent process launch,
- premium execution,
- worker shell commands,
- worker source mutation,
- network access,
- credential access.

## Acceptance Criteria

- The current gap review names the Story 3.40 safe-work state.
- The current gap review includes managed recipe policy, runbook managed recipe check-chain, and report-anchor surfaces.
- The handoff recommends larger coherent safe slices rather than stale explicit-BMad-story-only continuation.
- `pnpm run check:docs` fails if the current gap review or handoff regresses to stale guidance.
- `pnpm run check` passes.

## Verification

- `node --check scripts/check-doc-indexes.mjs`
- `pnpm run check:docs`
- `pnpm run check:runbooks`
- `pnpm run check`
