# Decision Log: Kendall_vNxt Supervisor Dynamic Routing MVP 1

## 2026-06-08

- Created PRD from approved brainstorming session `_bmad-output/brainstorming/brainstorming-session-2026-06-07-194145.md`.
- Decision: Treat dynamic routing as part of the existing Kendall_vNxt supervisor, not a separate Bob Supervisor product.
- Decision: Use a lane-centered routing contract first, with workers as later implementations beneath lanes.
- Decision: MVP 1 is a policy simulator and must not launch or control new workers.
- Decision: Routing decisions should be deterministic, testable, recorded as workflow events, and visible in the dashboard.
- Decision: First real routed execution lane after MVP 1 should be deterministic utility work.
- Decision: First local AI lane after utility routing should be read-only evidence explanation.
- Decision: Subscription agents should begin as structured handoff targets before direct CLI launch.

## Deferred Decisions

- Whether dry-run route previews are recorded as workflow events by default.
- Which existing managed step should be the first source of route preview data.
- Whether routing types should be exported through `packages/contracts` in MVP 1.
- Whether operator override controls appear in MVP 1 or wait for advisory execution.
