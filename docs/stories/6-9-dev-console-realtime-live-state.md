# Story 6.9: Dev Console Realtime Live State

Date: 2026-06-10
Status: Review

## Story

As Bob,
I want the Dev Console to update live when Proposed Work or Active Work changes,
so that the console feels alive without periodic full-page refreshes.

## Context

The supervisor already exposes an SSE event stream and the dashboard already has a live feed. Stories 6.3 through 6.8 add Candidate Work, Proposed Work, promotion, task packets, and fake/blocked attempt evidence. This story connects those state changes to dashboard data refresh.

## Acceptance Criteria

1. Candidate Work create/update/promotion publishes SSE events.
2. Dev Console pages refresh server data from SSE events without periodic polling or full browser reloads.
3. The existing live feed stays connected and can recover through EventSource reconnect behavior.
4. Proposed Work cards/counts update after Candidate Work changes without manual refresh.
5. Active Work/detail/attempt/evidence pages can refresh from the same event stream.
6. Realtime behavior does not trigger promotion, routing, execution attempts, worker launch, provider calls, command execution, Git, or GitHub operations.
7. Browser tests cover live Proposed Work updates.

## Authority

Allowed:

- SSE event publishing for metadata-only state changes,
- dashboard client refresh on events,
- focused browser tests.

Blocked:

- periodic polling,
- full browser reload loops,
- worker launch,
- provider/model calls,
- command execution beyond tests,
- source mutation by workers,
- Git/GitHub operations.

## Verification

Required focused checks:

- dashboard build,
- focused browser test proving Proposed Work updates after an SSE-published Candidate Work change,
- full local check when dashboard or shared API behavior changes.
