# Story 6.25: Trusted Delivery Eligibility Policy

Date: 2026-06-11
Status: done

## User Story

As Bob,
I want push, PR, merge, and cleanup gates to soften only when strict delivery evidence is satisfied,
so that long Epic 6 runs can keep moving without turning GitHub delivery into unsafe automation.

## Context

PR #86 delivered the Epic 6 milestone, but routine push, PR, merge, and cleanup still block long runs. The next safe step is not remote automation. It is a read-only eligibility policy that defines when those operations can become trusted-delivery candidates and which hard stops still interrupt the run.

## Acceptance Criteria

1. The GitHub delivery authority report includes progressive trusted delivery eligibility stages.
2. The stages cover push/PR, CI/review inspection, merge, and cleanup.
3. Each stage names eligible evidence, hard stops, allowed operations, and blocked operations.
4. The report keeps all actual approval booleans false, including automatic delivery approval.
5. The Dev Console GitHub delivery panel renders the trusted delivery policy and eligibility stages.
6. Tests prove the policy is visible and non-executing.

## Implementation Notes

- Added `GitHubDeliveryEligibilityStageView`.
- Extended `GitHubDeliveryAuthorityReportView` with `trustedDeliveryPolicy`, `eligibilityStages`, and `automaticDeliveryApproved`.
- Updated `SupervisorService.get_github_delivery_authority_report()`.
- Updated the Dev Console GitHub delivery authority panel.
- No GitHub operation, merge, cleanup, Codex launch, Claude launch, provider call, or source mutation is performed by this story.

## Verification

Passed checks:

- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "github_delivery_authority_report or supervisor_report_catalog or runtime_evidence_export"`
- `pnpm.cmd --filter @kendall/dashboard build`
- `pnpm.cmd run check:docs`
- `pnpm.cmd run check`

## Authority Boundary

This story is read-only trusted delivery policy only. It does not approve or perform push, PR creation/update, CI wait, review comment mutation, merge, branch deletion, local cleanup, remote cleanup, GitHub issue/story sync, Codex launch, Claude launch, provider/model calls, credential/session access, source mutation, or autonomous delivery.
