---
baseline_commit: fcd1351e926af2370a92e812ca41bf236ee458f4
---

# Story 7.7: Compute PR, Merge, And Cleanup Eligibility From Green-Gate Evidence

Date: 2026-06-11
Status: review

## Story

As Bob,
I want Kendall to compute when PR, merge, and cleanup are eligible from green-gate evidence,
so that routine delivery mechanics stop interrupting progress when the approved evidence is already green.

## Acceptance Criteria

1. Given a work item has approved scope, in-scope diff, passing verification, retained evidence, green CI, and clean merge state, when Kendall evaluates green-gate delivery, then the Dev Console reports PR, merge, and cleanup eligibility separately and lists the evidence used.
2. Given any gate is missing, stale, dirty, failed, conflicted, or unexpected, when Kendall evaluates delivery or cleanup eligibility, then the relevant action is blocked and the blocked reason is visible.
3. Given a future policy approves low-risk green-gate delivery automation, when a matching work item satisfies all gates, then Kendall may proceed only within that exact policy scope and all unrelated authorities remain blocked.
4. Given no explicit policy approves PR creation, merge, or cleanup execution, when Kendall computes eligibility, then it reports readiness only and performs no PR creation, merge, branch deletion, worktree deletion, or remote cleanup.
5. Eligibility computation must fail closed on dirty worktree, missing evidence, failing checks, head mismatch, merge conflict, stale approval, unexpected diff, or ambiguous target.

## Tasks / Subtasks

- [x] Compute PR eligibility from green-gate evidence. (AC: 1, 2, 4, 5)
  - [x] Approved scope.
  - [x] In-scope diff.
  - [x] Verification evidence.
  - [x] Evidence bundle retained.
  - [x] Authority boundary.
- [x] Compute merge eligibility separately. (AC: 1, 2, 4, 5)
  - [x] PR URL/head retained.
  - [x] CI green.
  - [x] Merge state clean.
  - [x] Review state resolved or waived when required.
  - [x] Exact merge target known.
- [x] Compute cleanup eligibility separately. (AC: 1, 2, 4, 5)
  - [x] PR merged.
  - [x] Merge commit retained.
  - [x] Exact local branch/worktree target retained.
  - [x] Cleanup dry-run or equivalent target proof.
  - [x] Evidence retained before deletion.
- [x] Preserve reporting-only behavior unless a later policy exists. (AC: 3, 4)
  - [x] No PR creation/update by default.
  - [x] No merge by default.
  - [x] No cleanup by default.
  - [x] No issue sync, Claude, provider, subscription-agent, failed-check bypass, or broad autonomy.
- [x] Add focused tests. (AC: 1-5)
  - [x] all-green eligibility fixture,
  - [x] each missing/failing gate blocks relevant action,
  - [x] no-policy reporting-only assertion,
  - [x] ambiguous target fails closed.

### Review Findings

- [x] [Review][Patch] PR/merge/cleanup eligibility cannot become true from live retained green-gate evidence [services/supervisor/src/supervisor/application/service.py:3975]
- [x] [Review][Patch] Epic 7 story index labels review stories as ready-for-dev [docs/stories/index.md:166]

## Dev Notes

### Dependencies

- Final Epic 7 story.
- Consumes outputs from Stories 7.1 through 7.6.
- Must not be implemented before readiness, launch contract, diff guard, worker evidence, verification evidence, and Dev Console readiness state exist.

### Existing Surfaces To Reuse

- `TrustedDeliveryEligibilityReportView`
- `TrustedDeliveryEligibilityStageEvaluationView`
- `TrustedDeliveryEligibilityCheckView`
- `WorkItemDeliveryReadinessView`
- `GitHubDeliveryAuthorityReportView`
- `LocalCleanupReadinessReportView`
- `services/supervisor/src/supervisor/application/service.py`
  - `get_trusted_delivery_eligibility_report()`
  - `get_github_delivery_authority_report()`
  - `get_local_cleanup_readiness_report()`
- `apps/dashboard/src/components/trusted-delivery-eligibility-report-panel.tsx`
- `apps/dashboard/src/components/delivery-readiness-panel.tsx`

### Implementation Guidance

- "Eligible" does not mean "performed."
- Keep PR, merge, and cleanup as separate eligibility states. A PR-ready item may still be merge-blocked; a merged PR may still be cleanup-blocked.
- Every eligible state must list the evidence used.
- Every blocked state must list the exact missing or failed gate.
- Do not let a future automation policy bypass failed verification, out-of-scope diff, stale approval, ambiguous target, or missing evidence.

### Testing Requirements

- Focused supervisor tests:
  - `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "green_gate or trusted_delivery_eligibility"`
- Dashboard build if UI updates are included:
  - `pnpm.cmd --filter @kendall/dashboard build`
- Full checks:
  - `pnpm.cmd run check:docs`
  - `pnpm.cmd run check`

### Authority Boundary

This story computes eligibility. It does not approve or perform PR creation/update, CI wait, merge, branch deletion, worktree deletion, remote cleanup, issue sync, Claude launch, provider expansion, subscription-agent launch, secret access, failed-check bypass, or broad autonomy.

Any actual execution of PR, merge, or cleanup still requires an explicit policy or approval naming the operation, scope, evidence, and stop lines.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- Red test: `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "action_eligibility"` failed before implementation because `actionEligibility` was absent from the trusted delivery eligibility report.
- Focused verification: `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "green_gate or trusted_delivery_eligibility"` passed, 4 passed / 91 deselected with 1 existing aiosqlite warning.
- Routing integration verification: `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q` passed, 95 passed with 1 existing aiosqlite warning.
- Full verification: `pnpm.cmd run check` passed, including dashboard build and 150 supervisor tests with 1 existing aiosqlite warning.

### Completion Notes List

- Added explicit trusted-delivery `actionEligibility` for PR, merge, and cleanup as separate reporting-only states.
- Computed each action from the existing green-gate stage checks, including evidence lists, blocked reasons, next safe action, and `executionApproved=false`.
- Added all-green reporting-only fixtures where PR, merge, and cleanup are eligible but still not executed without future policy approval.
- Added blocking fixtures for missing verification, failed CI, and ambiguous cleanup target so eligibility fails closed.
- Preserved unrelated authority blockers for issue sync, Claude launch, provider expansion, subscription-agent launch, secret access, failed-check bypass, and broad autonomy.
- No PR creation/update, CI wait, merge, branch deletion, worktree deletion, remote cleanup, issue sync, external launch, secret access, or broad autonomy was added.

### File List

- `docs/stories/7-7-compute-pr-merge-cleanup-eligibility-from-green-gate-evidence.md`
- `packages/contracts/src/api.ts`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`

### Change Log

- 2026-06-11: Implemented Story 7.7 PR/merge/cleanup eligibility computation, reporting-only action fixtures, fail-closed blockers, unrelated authority blockers, and verification evidence; status moved to review.
