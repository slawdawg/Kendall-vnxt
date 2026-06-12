---
baseline_commit: fcd1351e926af2370a92e812ca41bf236ee458f4
---

# Story 7.1: Define the Green-Gate Delivery Readiness Contract

Date: 2026-06-11
Status: review

## Story

As Bob,
I want Kendall to define exactly what makes a bounded work item delivery-ready,
so that PR, merge, and cleanup decisions stop depending on chat memory or manual reconstruction.

## Acceptance Criteria

1. Given an Active Work item with a route decision and delivery target, when Kendall evaluates delivery readiness, then the readiness contract reports scope status, verification status, CI status, merge state, evidence retention, cleanup eligibility, and blocked reasons.
2. Given a work item that lacks approved delivery authority, when delivery readiness is evaluated, then the result is blocked and states which approval or evidence is missing.
3. Given a work item with all green inputs, when delivery readiness is evaluated, then the result is green-gate eligible and no merge, cleanup, issue sync, Claude launch, provider expansion, subscription-agent launch, or broad autonomy is granted by the contract alone.
4. Given a negative readiness fixture with a missing check, stale evidence, failed verification, dirty unrelated diff, or missing authority, when the readiness contract is evaluated by automated test or check, then the machine-checkable result is blocked and the blocked reason is stable and operator-readable.
5. The contract is read-only and records no workflow events, mutates no Git/GitHub state, launches no worker, and deletes no branch/worktree/artifact.

## Tasks / Subtasks

- [x] Define the green-gate delivery readiness contract. (AC: 1, 2, 3)
  - [x] Add or extend shared contract types in `packages/contracts/src/api.ts` without replacing existing `WorkItemDeliveryReadinessView` or `TrustedDeliveryEligibilityReportView`.
  - [x] Represent each gate as a machine-readable check with `checkId`, label, status, summary, evidence, and stable blocked reason.
  - [x] Include these gate families at minimum: scope, local verification, CI, merge state, evidence retention, cleanup target, authority boundary.
- [x] Add supervisor read-only evaluation logic. (AC: 1, 2, 3, 5)
  - [x] Prefer extending the existing trusted-delivery eligibility pattern in `SupervisorService` over introducing a parallel delivery model.
  - [x] Keep the first implementation read-only; do not push, create/update PRs, wait on CI, merge, delete branches, delete worktrees, launch Codex, launch Claude, call providers, or mutate issues.
  - [x] Ensure the evaluator can return missing-evidence and blocked-authority results before later stories add worker launch evidence.
- [x] Add negative fixture coverage and machine-checkable assertions. (AC: 4)
  - [x] Cover missing check evidence.
  - [x] Cover stale or absent delivery evidence.
  - [x] Cover failed verification evidence.
  - [x] Cover dirty or unexpected local diff evidence.
  - [x] Cover missing delivery/cleanup authority.
- [x] Keep report/catalog/runtime references aligned if a new report endpoint is added. (AC: 5)
  - [x] Add the route to `services/supervisor/src/supervisor/api/main.py` only if the story introduces a new report endpoint.
  - [x] Update report catalog and runtime evidence references when a new supervisor report is added.
  - [x] Add a dashboard shortcut only if the new report is exposed outside work-item detail.
- [x] Update Story 7.1 implementation evidence. (AC: 1-5)
  - [x] Record implementation notes in this story file.
  - [x] Add focused verification commands and results.

## Dev Notes

### Product Intent

Epic 7 exists because Epic 6 proved the lifecycle but did not feel visibly useful to Bob. Story 7.1 starts the new epic by defining what "green" means before any Codex worker can mutate files. The contract must reduce Bob's PR/merge/cleanup babysitting by making readiness explicit and testable.

This story is not the worker launch. It is the readiness contract that later stories consume.

### Existing Surfaces To Reuse

- `packages/contracts/src/api.ts`
  - Existing `WorkItemDeliveryReadinessView` tracks work-item delivery fields: PR status/URL, CI status, merge status, waiver, remote operation policy, and `readyForApproval`.
  - Existing `TrustedDeliveryEligibilityReportView`, `TrustedDeliveryEligibilityStageEvaluationView`, and `TrustedDeliveryEligibilityCheckView` already model evidence-gated delivery checks.
- `services/supervisor/src/supervisor/application/service.py`
  - `get_github_delivery_authority_report()` defines the trusted delivery policy and the staged push/PR, CI/review, merge, and cleanup policy.
  - `get_trusted_delivery_eligibility_report()` evaluates current local branch/git state and returns stage checks without mutation.
  - `_eligibility_check()` and `_trusted_delivery_stage()` are the existing helper pattern for machine-readable checks.
- `services/supervisor/src/supervisor/api/main.py`
  - Existing route: `GET /supervisor/trusted-delivery-eligibility-report`.
- `apps/dashboard/src/components/trusted-delivery-eligibility-report-panel.tsx`
  - Existing Controls page panel renders stages, checks, hard stops, blocked operations, and next safe actions.
- `services/supervisor/tests/integration/test_routing_preview.py`
  - Existing test `test_trusted_delivery_eligibility_report_evaluates_local_evidence_without_mutation` proves the report is read-only and does not mutate workflow events.

### Implementation Guidance

- Do not create a second unrelated "green gate" model if the existing trusted-delivery eligibility types can be extended.
- Keep Story 7.1 focused on contract/evaluation only. Dev Console work-item UI belongs to Story 7.6.
- If a new endpoint is required, follow the existing report endpoint pattern:
  - contract type in `packages/contracts/src/api.ts`,
  - Pydantic schema in `services/supervisor/src/supervisor/api/schemas.py`,
  - service method in `services/supervisor/src/supervisor/application/service.py`,
  - FastAPI route in `services/supervisor/src/supervisor/api/main.py`,
  - report catalog/runtime evidence references,
  - focused supervisor integration tests.
- If no new endpoint is required, extend the existing trusted delivery eligibility report and tests instead.
- Preserve existing report semantics: read-only means no workflow events, no Git mutation, no GitHub mutation, no branch/worktree cleanup, and no worker/process launch.

### Required Green-Gate Inputs

The contract must be able to express these as passed, blocked, not recorded, stale, or not applicable:

- Approved work scope exists.
- Changed files are inside approved scope or not yet available.
- Local verification evidence exists and passed.
- Remote CI evidence exists and is green, or is not yet available.
- Merge state evidence exists and is clean, or is not yet available.
- Required evidence bundle is retained.
- Cleanup target evidence is exact and retained, or cleanup is not yet available.
- Requested action has matching authority.
- Blocked authorities remain blocked: merge, cleanup, issue sync, Claude launch, provider expansion, subscription-agent launch, secrets, and broad autonomy.

### Testing Requirements

- Add focused supervisor tests before any UI work.
- Required negative fixtures:
  - missing verification evidence blocks green-gate eligibility,
  - failed verification blocks green-gate eligibility,
  - dirty or unexpected diff blocks green-gate eligibility,
  - missing authority blocks merge/cleanup eligibility,
  - stale/missing evidence returns a stable blocked reason.
- Required read-only assertion:
  - evaluating the contract must not create workflow events or mutate work-item state.
- Recommended focused command:
  - `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "trusted_delivery_eligibility or green_gate"`
- Broader verification:
  - `pnpm.cmd run check:docs`
  - `pnpm.cmd run check`

### Authority Boundary

This story does not approve or perform Codex launch, Claude launch, subscription-agent launch, provider expansion, GitHub issue sync, PR creation/update, CI wait, merge, branch deletion, worktree deletion, remote cleanup, secret access, or broad autonomy.

The output of this story may report eligibility. It must not execute delivery or cleanup actions.

### References

- `_bmad-output/planning-artifacts/epics.md` (local BMAD workflow output; gitignored)
- `docs/goals/epic-6-retrospective-and-post-mvp-readiness-review-2026-06-11.md`
- `docs/goals/epic-7-useful-supervised-execution-plan-2026-06-11.md`
- `docs/stories/6-25-trusted-delivery-eligibility-policy.md`
- `docs/stories/6-26-trusted-delivery-eligibility-evaluator.md`
- `docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md`
- `docs/architecture/kendall-vnxt-orchestrator-spec-2026-06-10.md`

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- Red test: `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "trusted_delivery_eligibility"` failed before implementation because trusted delivery checks did not expose `gateFamily`.
- Focused verification: `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "trusted_delivery_eligibility"` passed after implementation, 1 passed / 87 deselected.
- Full verification: `pnpm.cmd run check` passed, including dashboard build and 143 supervisor tests.

### Completion Notes List

- Extended the existing trusted-delivery eligibility contract instead of creating a parallel green-gate model.
- Added `gateFamily` and `blockedReason` to trusted delivery eligibility checks across TypeScript and Pydantic contracts.
- Populated machine-readable gate families for scope, local verification, CI, merge state, evidence retention, cleanup target, and authority boundary.
- Added stable blocked reasons for missing local verification evidence, missing CI/merge/cleanup evidence, dirty local diff evidence, and missing delivery/merge/cleanup authority.
- Kept the evaluator read-only and did not add a new endpoint, dashboard shortcut, workflow event, Git/GitHub mutation, worker launch, or cleanup operation.

### File List

- `docs/stories/7-1-define-green-gate-delivery-readiness-contract.md`
- `packages/contracts/src/api.ts`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`

### Change Log

- 2026-06-11: Implemented Story 7.1 green-gate readiness contract fields, supervisor evaluator output, deterministic negative fixture assertions, and verification evidence; status moved to review.
