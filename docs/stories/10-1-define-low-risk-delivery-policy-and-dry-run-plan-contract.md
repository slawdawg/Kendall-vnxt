---
baseline_commit: afc62fc7
---

# Story 10.1: Define Low-Risk Delivery Policy And Dry-Run Plan Contract

Status: done

## Story

As Bob,
I want Kendall to define a policy-bound delivery plan for low-risk green-gate work,
so that PR, merge, and cleanup actions can be previewed from current evidence before any remote or destructive operation runs.

## Acceptance Criteria

1. Given a work item has green-gate delivery evidence, when Kendall creates a delivery plan, then the plan binds to current work item, branch, PR, verification, CI, review, merge state, retained evidence, and approval or policy evidence, and the plan reports PR, merge, and cleanup eligibility separately.
2. Given delivery or cleanup would require remote GitHub mutation or destructive local cleanup, when Kendall evaluates the plan in dry-run mode, then it reports exactly what would be pushed, merged, deleted, retained, or blocked, and no remote mutation, merge, branch deletion, worktree deletion, provider call, credential access, failed-check bypass, issue sync, or broad autonomy occurs.
3. Given any required gate is missing, stale, dirty, failed, conflicted, or unexpected, when the delivery plan is evaluated, then the relevant action is blocked, and the blocked reason is stable, operator-readable, and machine-checkable.
4. Given policy-approved low-risk delivery is not available, when Kendall evaluates a green work item, then the plan remains report-only, and it states which exact approval or policy artifact is required before execution.
5. Given Story 10.1 is complete, then no provider expansion, credential/session access, source mutation by workers, subscription-agent process launch, failed-check bypass, issue sync, destructive cleanup, remote mutation, or broad autonomy is introduced.

## Tasks / Subtasks

- [x] Define the delivery plan contract. (AC: 1-5)
  - [x] Reuse existing trusted delivery, delivery readiness, Git hygiene, local cleanup, and remote cleanup vocabulary where practical.
  - [x] Add or extend shared contract/schema types for a delivery plan only if existing report types cannot express the dry-run plan clearly.
  - [x] Include action families for PR, merge, and cleanup with separate status, eligibility, blocked reasons, evidence refs, dry-run effects, and required approval or policy evidence.
- [x] Implement report-only delivery plan construction. (AC: 1-4)
  - [x] Use current green-gate and delivery readiness evidence instead of chat-derived or projected state.
  - [x] Bind plan identity to current work item, branch, PR/head metadata when present, verification evidence, CI state, review state, retained evidence, and policy/approval evidence.
  - [x] Make missing or stale evidence fail closed with stable blocked reasons.
- [x] Add deterministic fixtures or tests for dry-run outcomes. (AC: 1-5)
  - [x] Cover fully eligible report-only state, missing policy approval, dirty worktree, stale branch/PR head, failing CI or verification, missing review, unsafe merge state, missing retained evidence, and cleanup target ambiguity.
  - [x] Verify dry-run output lists what would be pushed, merged, deleted, retained, or blocked.
  - [x] Verify no live GitHub mutation, merge, branch deletion, worktree deletion, provider call, credential access, issue sync, failed-check bypass, or broad autonomy path is executed.
- [x] Wire the smallest useful check. (AC: 1-5)
  - [x] Prefer extending `check:delivery-readiness` or an adjacent delivery-readiness drift check before creating a parallel checker.
  - [x] Update dashboard/report drift coverage only if the new plan surface is rendered or linked in this story.
- [x] Update story evidence. (AC: 1-5)
  - [x] Record focused and full verification commands in the Dev Agent Record.
  - [x] Update this story's Completion Notes and File List during implementation.

### Review Findings

- [x] [Review][Patch] Policy-missing actions exposed mutating operations as allowed -- accepted from Blind Hunter, Edge Case Hunter, and Acceptance Auditor; fixed by making missing policy a blocking reason that leaves every action `blocked`, `eligible=false`, and `allowedOperations=[]`.
- [x] [Review][Patch] Stale PR/head binding was not modeled -- accepted from Edge Case Hunter and Acceptance Auditor; fixed by adding retained PR head metadata support and stable binding blockers including `stale-pr-head`, `pr-head-evidence-missing`, and `delivery-target-mismatch`.
- [x] [Review][Patch] Cleanup dry-run did not name branch and worktree effects separately -- accepted from Acceptance Auditor; fixed by reporting worktree removal and local branch deletion as separate dry-run effects.
- [x] [Review][Patch] Boundary tests did not prove green-stage policy blocking -- accepted from Edge Case Hunter; fixed by adding a direct helper regression proving a green underlying stage still remains blocked and report-only while policy evidence is missing.

## Dev Notes

### Source Context

- Epic 10 exists to turn already-computed green-gate evidence into bounded, auditable PR, merge, and cleanup planning without granting broad autonomy. Story 10.1 covers FR34-FR38 and FR41, and prepares later Dev Console visibility for FR39-FR40. [Source: `_bmad-output/planning-artifacts/epics.md#Epic 10: Policy-Approved Green-Gate Delivery And Cleanup`]
- Epic 9 is complete, reviewed, verified, and merged. Its retrospective states that no Epic 8 deferred hardening blocker remains open, so Epic 10 can build on a stronger runtime evidence baseline. [Source: `_bmad-output/implementation-artifacts/epic-9-retro-2026-06-13.md#Epic Summary`]
- The product brief identifies Git and GitHub hygiene as first-class orchestration concerns and says GitHub operations must progress from report-only through local checks, human-approved push/PR, human-approved merge, and later policy-approved merge/cleanup. [Source: `docs/product/kendall-vnxt-orchestrator-product-brief-2026-06-10.md#Git And GitHub Hygiene`]
- The current gap review says architecture, docs, tests, and non-executing control-plane work may proceed with conservative defaults, while real process launch, model/provider calls, destructive operations, credential access, externally hosted services, and recovery/runtime boundary changes require explicit approval. [Source: `docs/architecture/kendall-vnxt-current-gap-review-2026-06-08.md#Stop Conditions`]

### Existing Implementation To Reuse

- Shared contracts already define the neighboring delivery surfaces:
  - `WorkItemDeliveryReadinessView`
  - `GitHygieneReportView`
  - `TrustedDeliveryEligibilityReportView`
  - `LocalCleanupReadinessReportView`
  - `RemoteCleanupSyncReadinessReportView`
  - `DeliveryReadinessPolicyReportView`
  [Source: `packages/contracts/src/api.ts`]
- Supervisor API routes already expose:
  - `GET /supervisor/trusted-delivery-eligibility-report`
  - `GET /work-items/{work_item_id}/trusted-delivery-eligibility-report`
  - `GET /supervisor/local-cleanup-readiness-report`
  - `GET /supervisor/remote-cleanup-sync-readiness-report`
  - `GET /supervisor/delivery-readiness-policy-report`
  [Source: `services/supervisor/src/supervisor/api/main.py`]
- Supervisor service already computes trusted delivery stages for push/PR, CI/review inspection, merge, and cleanup through `get_trusted_delivery_eligibility_report(...)`, `_trusted_delivery_stage(...)`, `_trusted_delivery_action_eligibility(...)`, `_recipe_delivery_gate_payload(...)`, and related helper methods. Extend this area instead of creating a second delivery model. [Source: `services/supervisor/src/supervisor/application/service.py`]
- The current remote-delivery executor path exists behind settings and policy checks via `_remote_delivery_enabled()`, `_remote_delivery_policy_view(...)`, and `_remote_delivery_commands(...)`. Story 10.1 must not call or enable `_remote_delivery_commands(...)`; it is a dry-run/report contract story. [Source: `services/supervisor/src/supervisor/application/service.py`]
- Dashboard components already render adjacent report surfaces:
  - `trusted-delivery-eligibility-report-panel.tsx`
  - `delivery-readiness-policy-report-panel.tsx`
  - `git-hygiene-report-panel.tsx`
  - `local-cleanup-readiness-report-panel.tsx`
  - `green-gate-readiness-panel.tsx`
  [Source: `apps/dashboard/src/components/`]
- `scripts/check-delivery-readiness-policy-report.mjs` already guards the delivery readiness policy route, contracts, schemas, dashboard client, controls-page panel, browser assertions, supervisor tests, story index, and architecture reconciliation. Prefer extending this check or a closely named adjacent check if the new dry-run plan becomes part of the same report chain. [Source: `scripts/check-delivery-readiness-policy-report.mjs`]

### Architecture And Safety Boundaries

- This story is report-only/dry-run planning. It must not push, create or update PRs, wait on live CI, merge, delete branches, remove worktrees, mutate issues, launch workers, call providers, read credentials, or bypass failed checks.
- Generic continuation language does not approve new execution, provider, GitHub mutation, cleanup, secret, review, or autonomy authority. Delivery-plan output must name the exact policy or approval evidence required before execution. [Source: `docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md#Language That Is Not Approval`]
- Evidence must remain metadata-only. Do not retain raw tokens, secrets, provider payloads, raw prompts, raw completions, reasoning traces, unbounded command output, or unnecessary source copies. [Source: `docs/architecture/kendall-vnxt-worker-threat-boundary-2026-06-08.md#Artifact Boundary`]
- Cleanup must preserve retained evidence before deletion and must distinguish Git-registered worktrees from filesystem residue. Story 10.3 will implement deeper cleanup classification; Story 10.1 should include the plan fields and fail-closed blocked reasons needed by that later story.

### Implementation Guidance

- Treat the delivery plan as an explicit contract/report that composes existing evidence. Avoid adding a real executor in this story.
- Recommended shape:
  - `planId`, `generatedAt`, `workItemId`, `currentBranch`, `headRevision`, `prRef`, `baseBranch`
  - `actions[]` for `pr`, `merge`, and `cleanup`
  - per-action `status`, `eligible`, `dryRunEffects`, `blockedReasons`, `evidence`, `requiredApproval`, `requiredPolicy`, `allowedOperations`, `blockedOperations`, `readOnly`
  - top-level stop lines and next safe actions
- If adding a new endpoint, keep it read-only and consistent with existing report routes. A work-item scoped route is preferred when binding to a specific work item; a supervisor-level report may be useful for policy/fixture examples.
- Stable blocked-reason IDs matter more than prose. Use IDs such as `dirty-worktree`, `stale-pr-head`, `verification-failed`, `ci-failed`, `review-missing`, `merge-not-clean`, `evidence-missing`, `policy-missing`, `cleanup-target-ambiguous`.
- Use deterministic fixtures in supervisor tests instead of live GitHub or live cleanup behavior. Mock or fixture command outputs where needed.

### Testing

Minimum focused verification:

- `pnpm.cmd run check:delivery-readiness` if the existing delivery readiness drift guard is extended.
- A focused supervisor test for the delivery-plan report or helper, likely in `services/supervisor/tests/integration/test_routing_preview.py`.
- `pnpm.cmd run check:docs` when story/docs/index artifacts change.

Broaden before review when shared contracts, schemas, API routes, dashboard report surfaces, or package check wiring changes:

- `pnpm.cmd run check`

### Project Structure Notes

- Story record location: `docs/stories/`.
- Shared API contracts: `packages/contracts/src/api.ts`.
- Supervisor schemas: `services/supervisor/src/supervisor/api/schemas.py`.
- Supervisor routes: `services/supervisor/src/supervisor/api/main.py`.
- Supervisor delivery logic: `services/supervisor/src/supervisor/application/service.py`.
- Dashboard report panels: `apps/dashboard/src/components/`.
- Dashboard API client: `apps/dashboard/src/lib/supervisor.ts`.
- Report shortcut mapping: `apps/dashboard/src/lib/report-shortcuts.ts`.
- Drift checks: `scripts/check-delivery-readiness-policy-report.mjs` or a new narrowly named check only if extension would make the existing check unclear.
- Avoid repo-wide formatting, unrelated dashboard redesign, or changing existing remote-delivery executor behavior.

## References

- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/implementation-artifacts/epic-9-retro-2026-06-13.md`
- `docs/product/kendall-vnxt-orchestrator-product-brief-2026-06-10.md`
- `docs/architecture/kendall-vnxt-current-gap-review-2026-06-08.md`
- `docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md`
- `docs/architecture/kendall-vnxt-worker-threat-boundary-2026-06-08.md`
- `docs/stories/7-7-compute-pr-merge-cleanup-eligibility-from-green-gate-evidence.md`
- `docs/stories/9-3-restore-provider-raw-output-ui-regression-coverage.md`
- `packages/contracts/src/api.ts`
- `services/supervisor/src/supervisor/api/main.py`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `scripts/check-delivery-readiness-policy-report.mjs`

## Dev Agent Record

### Agent Model Used

TBD

### Debug Log References

- Focused static drift: `pnpm.cmd run check:delivery-readiness` passed after extending the delivery readiness policy drift guard to cover low-risk delivery plan contracts, routes, service wiring, tests, and story index evidence.
- Focused supervisor regression: `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "low_risk_delivery_plan or delivery_readiness_policy_report"` passed with 3 tests and 1 existing aiosqlite warning.
- Documentation verification: `pnpm.cmd run check:docs` passed after Story 10.1 indexing was corrected to avoid planned-story dangling links.
- Full regression: `pnpm.cmd run check` passed, including dashboard build and 170 supervisor tests with 1 existing aiosqlite warning.
- Code review patch verification: `pnpm.cmd run check:delivery-readiness`, `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "low_risk_delivery_plan or delivery_readiness_policy_report"` with 5 tests, `pnpm.cmd run check:docs`, and full `pnpm.cmd run check` passed after review fixes. Full check included dashboard build and 172 supervisor tests with 1 existing aiosqlite warning.

### Completion Notes List

- Added shared TypeScript and Pydantic contracts for `LowRiskDeliveryPlanActionView` and `LowRiskDeliveryPlanReportView`.
- Added read-only supervisor and work-item scoped low-risk delivery plan endpoints: `GET /supervisor/low-risk-delivery-plan` and `GET /work-items/{work_item_id}/low-risk-delivery-plan`.
- Implemented `get_low_risk_delivery_plan_report(...)` by composing existing trusted delivery eligibility stages into dry-run PR, merge, and cleanup actions with evidence, blocked reasons, required approval, required policy, and `policy-missing` stop-line evidence.
- Preserved report-only behavior: the plan performs no push, PR mutation, merge, branch deletion, worktree deletion, issue sync, provider call, credential access, failed-check bypass, cleanup, or broad autonomy.
- Added focused supervisor tests proving the supervisor-level and work-item scoped reports are read-only and do not call the remote delivery executor.
- Extended `check:delivery-readiness` drift coverage for the new low-risk delivery plan contracts, routes, service wiring, tests, and Story 10.1 index evidence.
- Resolved BMAD code-review findings by making policy-missing a true report-only block, adding stale PR/head binding blockers, splitting cleanup dry-run effects into worktree and local branch actions, and adding a green-stage policy-missing regression test.

### File List

- `docs/stories/10-1-define-low-risk-delivery-policy-and-dry-run-plan-contract.md`
- `docs/stories/index.md`
- `packages/contracts/src/api.ts`
- `scripts/check-delivery-readiness-policy-report.mjs`
- `services/supervisor/src/supervisor/api/main.py`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`

## Change Log

- 2026-06-13: Implemented low-risk delivery dry-run plan contract and moved Story 10.1 to review.
- 2026-06-13: Resolved BMAD code-review findings and moved Story 10.1 to done.
