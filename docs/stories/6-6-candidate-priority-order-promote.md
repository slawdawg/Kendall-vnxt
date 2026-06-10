# Story 6.6: Candidate Priority, Order, And Promotion

Date: 2026-06-10
Status: Draft

## Story

As Bob,
I want to prioritize, reorder, approve, reject, defer, and promote Proposed Work,
so that only selected Candidate Work enters the Active Dev Console pipeline in the right order.

## Context

Story 6.5 makes Candidate Work visible as Proposed Work. This story adds the workflow controls that turn Candidate Work into Active `WorkItem` records through existing supervisor contracts.

Promotion does not approve worker launch, provider calls, command execution, Git operations, GitHub remote operations, merge, or cleanup. It only moves approved proposed work into the Active work pipeline.

## Acceptance Criteria

1. Bob can update Candidate Work priority/order.
2. Bob can approve Candidate Work.
3. Bob can reject Candidate Work.
4. Bob can defer Candidate Work.
5. Bob can promote approved Candidate Work into an Active `WorkItem`.
6. Promotion creates exactly one Active `WorkItem` and records `promotedWorkItemId`.
7. Promotion copies only metadata needed for Active work:
   - title,
   - requested outcome,
   - source,
   - source artifact metadata,
   - risk level,
   - priority metadata.
8. Promotion records an event or evidence entry that links the Active `WorkItem` back to the Candidate Work and source artifact.
9. Promotion does not trigger orchestrator routing, execution attempts, provider calls, command execution, Git operations, or GitHub remote operations in this story.
10. Dev Console Proposed Work view exposes approve/reject/defer/promote controls with clear non-technical copy.
11. Tests cover priority/order updates, approve/reject/defer behavior, one-time promotion, invalid duplicate promotion, and Active `WorkItem` metadata.

## Authority

Allowed:

- Candidate Work priority/status updates,
- Candidate -> Active `WorkItem` promotion,
- metadata/evidence linking,
- Dev Console controls for proposed work,
- focused backend and browser tests.

Blocked:

- orchestrator routing,
- execution attempt creation,
- worker launch,
- provider calls,
- command execution beyond tests,
- Git/GitHub operations,
- merge,
- cleanup automation.

## Implementation Notes

- Treat Candidate Work as the proposal source of truth until promotion.
- Treat `WorkItem` as the Active pipeline source of truth after promotion.
- Use idempotency/validation to prevent duplicate Active work for the same Candidate.
- If immediate mode is added in this story, it must only combine approve+promote. It must not trigger execution.
- Use user-facing "Proposed Work" language in the Dev Console and internal "Candidate Work" language in contracts where appropriate.

## Verification

Required focused checks:

- supervisor integration tests for priority/status/promotion,
- dashboard/browser tests for Proposed Work controls,
- documentation index checks if docs are changed.

Run full `pnpm.cmd run check` if shared contracts, dashboard behavior, or cross-package APIs are touched.

