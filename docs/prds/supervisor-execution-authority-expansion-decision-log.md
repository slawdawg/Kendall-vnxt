# Decision Log: Supervisor Execution Authority Expansion PRD

Date: 2026-06-08
Status: draft baseline created

## Decisions

- Create a focused execution authority PRD instead of jumping directly to subscription-agent launch.
- Keep real provider calls, real process launch, and premium execution out of scope.
- Treat the first implementation target as execution attempt lifecycle control using mock/disabled workers only.
- Require approvals to bind to route decisions to prevent stale approval execution.
- Require workspace isolation planning before any mutating worker execution.

## Source Inputs

- `docs/architecture/kendall-vnxt-overall-architecture.md`
- `docs/architecture/kendall-vnxt-architecture-gap-review-2026-06-08.md`
- `docs/prds/supervisor-dynamic-routing-mvp-1.md`
- `docs/prds/supervisor-dynamic-routing-follow-on-roadmap.md`
- `docs/implementation-checkpoint-2026-06-08-supervisor-dynamic-routing-follow-on.md`

## Assumptions

- Existing supervisor persistence should be preferred for the first implementation slice unless repo evidence shows it cannot represent attempts safely.
- One active execution attempt per work item is the conservative default.
- Disabled worker behavior must be enforced by service logic and tests, not only by UI labels.
- The dashboard should show attempt evidence after supervisor contracts exist; it should not invent execution state locally.

## Deferred

- Real local provider calls.
- Direct subscription-agent process launch.
- Premium provider execution.
- Adaptive scoring.
- Runtime assistant background behavior.
