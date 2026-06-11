# Story 6.26: Trusted Delivery Eligibility Evaluator

Date: 2026-06-11
Status: done

## User Story

As Bob,
I want the Dev Console to evaluate whether the current branch is eligible for trusted delivery,
so that push, PR, merge, and cleanup can later soften based on real evidence instead of chat judgment.

## Context

Story 6.25 defined the trusted delivery policy. This story adds a read-only evaluator that inspects local Git state and names the missing proof for push/PR, CI/review, merge, and cleanup stages. It does not query GitHub or mutate local or remote state.

## Acceptance Criteria

1. Supervisor exposes `GET /supervisor/trusted-delivery-eligibility-report`.
2. The report evaluates the current branch, base branch, head revision, working tree status, commits ahead, and diffstat.
3. The report shows stage evaluations for push/PR, CI/review inspection, merge, and cleanup.
4. The report names missing evidence and hard stops.
5. The report appears in the report catalog, runtime evidence references, report shortcuts, and Controls page.
6. Tests prove the report is read-only and does not mutate workflow events.

## Implementation Notes

- Added `TrustedDeliveryEligibilityReportView`, `TrustedDeliveryEligibilityStageEvaluationView`, and `TrustedDeliveryEligibilityCheckView`.
- Added `SupervisorService.get_trusted_delivery_eligibility_report()`.
- Added `GET /supervisor/trusted-delivery-eligibility-report`.
- Added `TrustedDeliveryEligibilityReportPanel` to Controls.
- The evaluator uses read-only local Git commands only.

## Verification

Passed checks:

- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "trusted_delivery_eligibility_report or supervisor_report_catalog or runtime_evidence_export"`
- `pnpm.cmd run check:reports`
- `pnpm.cmd run check:runtime-export`
- `pnpm.cmd --filter @kendall/dashboard build`
- `pnpm.cmd run check:docs`
- `pnpm.cmd run test:e2e:dashboard:controls`
- `pnpm.cmd run check`

## Authority Boundary

This story is read-only eligibility evaluation only. It does not approve or perform push, PR creation/update, CI wait, review comment mutation, merge, branch deletion, local cleanup, remote cleanup, GitHub issue/story sync, Codex launch, Claude launch, provider/model calls, credential/session access, source mutation, or autonomous delivery.
